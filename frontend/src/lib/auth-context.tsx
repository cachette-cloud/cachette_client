'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  apiGetNodeSession,
  apiGetPairingStatus,
  apiRestartTunnel,
  setSessionToken,
  clearSessionToken,
  onSessionExpired,
  type UserCacheOut,
  type NodeSessionResponse,
} from './api';

interface AuthContextValue {
  isPaired: boolean;
  needsLogin: boolean;
  authError: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  tunnelStatus: 'unpaired' | 'starting' | 'ready' | 'failed';
  tunnelReady: boolean;
  tunnelError: string | null;
  user: UserCacheOut | null;
  sessionTokenExpiresAt: string | null;
  isSessionExpired: boolean;
  isExpiringSoon: boolean;
  nodeInfo: { node_id?: string | null; subdomain?: string | null } | null;
  refreshSession: () => Promise<NodeSessionResponse | null>;
  restartTunnel: () => Promise<void>;
  dismissSessionExpired: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const [needsLogin, setNeedsLogin] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<'unpaired' | 'starting' | 'ready' | 'failed'>('unpaired');
  const [tunnelReady, setTunnelReady] = useState<boolean>(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [user, setUser] = useState<UserCacheOut | null>(null);
  const [sessionTokenExpiresAt, setSessionTokenExpiresAt] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState<boolean>(false);
  const [nodeInfo, setNodeInfo] = useState<{ node_id?: string | null; subdomain?: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkTokenExpiry = (expiresAtStr?: string | null) => {
    if (!expiresAtStr) {
      setIsExpiringSoon(false);
      return;
    }
    try {
      const expiresAt = new Date(expiresAtStr).getTime();
      const now = Date.now();
      const diffMs = expiresAt - now;

      if (diffMs <= 0) {
        setIsSessionExpired(true);
        setIsExpiringSoon(false);
        clearSessionToken();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
          const centralUrl = process.env.NEXT_PUBLIC_CENTRAL_URL || 'https://cachette.cloud';
          const redirectUrl = encodeURIComponent(window.location.origin + '/auth/callback');
          window.location.href = `${centralUrl}/login?redirect=${redirectUrl}`;
        }
      } else if (diffMs < 24 * 60 * 60 * 1000) {
        // Less than 24 hours remaining
        setIsExpiringSoon(true);
      } else {
        setIsExpiringSoon(false);
      }
    } catch {
      setIsExpiringSoon(false);
    }
  };

  const refreshSession = useCallback(async (): Promise<NodeSessionResponse | null> => {
    setIsLoading(true);
    setAuthError(null);
    try {
      // Step 1: Check pairing status
      const status = await apiGetPairingStatus().catch((err) => {
        console.warn('Failed to fetch pairing status:', err);
        return null;
      });

      if (!status) {
        setAuthError('Unable to connect to Cachette node');
        return null;
      }

      if (!status.paired) {
        setIsPaired(false);
        setNeedsLogin(false);
        setTunnelStatus('unpaired');
        setTunnelReady(false);
        setTunnelError(null);
        setUser(null);
        clearSessionToken();
        return null;
      }

      // Node is paired
      setIsPaired(true);
      if (status.tunnel_status) {
        setTunnelStatus(status.tunnel_status as any);
      }
      if (typeof status.tunnel_ready === 'boolean') {
        setTunnelReady(status.tunnel_ready);
      }
      if (status.node_id || status.subdomain) {
        setNodeInfo({
          node_id: status.node_id,
          subdomain: status.subdomain,
        });
      }

      // Step 2: Fetch active session with bearer token if available
      try {
        const session = await apiGetNodeSession();
        setNeedsLogin(false);
        setTunnelStatus(session.tunnel_status || (status.tunnel_status as any) || 'unpaired');
        setTunnelReady(Boolean(session.tunnel_ready ?? status.tunnel_ready));
        setTunnelError(session.tunnel_error || null);
        setUser(session.user || null);
        setSessionTokenExpiresAt(session.session_token_expires_at || null);
        if (session.node_id || session.subdomain) {
          setNodeInfo({
            node_id: session.node_id,
            subdomain: session.subdomain,
          });
        }
        checkTokenExpiry(session.session_token_expires_at);
        return session;
      } catch (sessionErr: any) {
        if (sessionErr?.status === 401) {
          // Paired, but no valid token on this browser
          setNeedsLogin(true);
          setUser(null);
          clearSessionToken();
        } else if (sessionErr?.status === 403) {
          setAuthError('Access forbidden: You do not have access to this node.');
        } else {
          console.warn('Failed to fetch node session:', sessionErr);
        }
        return null;
      }
    } catch (err: any) {
      console.warn('Error during session refresh:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restartTunnel = async () => {
    try {
      setTunnelStatus('starting');
      setTunnelError(null);
      await apiRestartTunnel();
      await refreshSession();
    } catch (err: unknown) {
      setTunnelError(err instanceof Error ? err.message : 'Failed to trigger tunnel restart');
      setTunnelStatus('failed');
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const incomingToken = hashParams.get('token') || hashParams.get('access_token');
      const incomingExpires = hashParams.get('expires_at') || hashParams.get('session_token_expires_at');
      if (incomingToken) {
        setSessionToken(incomingToken, incomingExpires);
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    refreshSession();

    // Subscribe to 401 session expired triggers from api.ts
    const unsubscribe = onSessionExpired(() => {
      setIsSessionExpired(true);
      setNeedsLogin(true);
      clearSessionToken();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        const centralUrl = process.env.NEXT_PUBLIC_CENTRAL_URL || 'https://cachette.cloud';
        const redirectUrl = encodeURIComponent(window.location.origin + '/auth/callback');
        window.location.href = `${centralUrl}/login?redirect=${redirectUrl}`;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refreshSession]);

  const dismissSessionExpired = () => {
    setIsSessionExpired(false);
  };

  const logout = () => {
    clearSessionToken();
    setUser(null);
    setNeedsLogin(true);
    setIsSessionExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isPaired,
        needsLogin,
        authError,
        isLoading,
        isAuthenticated: isPaired && Boolean(user) && !isSessionExpired && (tunnelReady || tunnelStatus === 'ready'),
        tunnelStatus,
        tunnelReady,
        tunnelError,
        user,
        sessionTokenExpiresAt,
        isSessionExpired,
        isExpiringSoon,
        nodeInfo,
        refreshSession,
        restartTunnel,
        dismissSessionExpired,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
