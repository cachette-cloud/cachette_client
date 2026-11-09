'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  apiGetNodeSession,
  apiGetPairingStatus,
  apiRestartTunnel,
  setSessionToken,
  getSessionToken,
  clearSessionToken,
  onSessionExpired,
  ApiError,
  type UserCacheOut,
  type NodeSessionResponse,
} from './api';

interface AuthContextValue {
  isPaired: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOwner: boolean;
  role: 'owner' | 'member' | null;
  isLocalhost: boolean;
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
  loginWithToken: (token: string) => Promise<boolean>;
  dismissSessionExpired: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const [tunnelStatus, setTunnelStatus] = useState<'unpaired' | 'starting' | 'ready' | 'failed'>('unpaired');
  const [tunnelReady, setTunnelReady] = useState<boolean>(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [user, setUser] = useState<UserCacheOut | null>(null);
  const [role, setRole] = useState<'owner' | 'member' | null>(null);
  const [sessionTokenExpiresAt, setSessionTokenExpiresAt] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState<boolean>(false);
  const [nodeInfo, setNodeInfo] = useState<{ node_id?: string | null; subdomain?: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLocalhost, setIsLocalhost] = useState<boolean>(true);

  // Check if running on localhost loopback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      setIsLocalhost(host === 'localhost' || host === '127.0.0.1' || host === '::1');
    }
  }, []);

  // Parse token from URL if redirected from Central (e.g. ?token=... or #token=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const urlToken =
        urlParams.get('token') ||
        urlParams.get('access_token') ||
        hashParams.get('token') ||
        hashParams.get('access_token');
      if (urlToken) {
        setSessionToken(urlToken);
        urlParams.delete('token');
        urlParams.delete('access_token');
        const newQuery = urlParams.toString() ? `?${urlParams.toString()}` : '';
        window.history.replaceState({}, '', `${window.location.pathname}${newQuery}`);
      }
    }
  }, []);

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
    try {
      // 1. First probe unauthenticated status endpoint to check pairing & tunnel health
      const statusRes = await apiGetPairingStatus().catch(() => null);

      if (!statusRes || !statusRes.paired) {
        setIsPaired(false);
        setTunnelStatus('unpaired');
        setTunnelReady(false);
        setTunnelError(null);
        setUser(null);
        setRole(null);
        return null;
      }

      setIsPaired(true);
      setTunnelStatus((statusRes.tunnel_status as 'unpaired' | 'starting' | 'ready' | 'failed') || (statusRes.tunnel_ready ? 'ready' : 'unpaired'));
      setTunnelReady(Boolean(statusRes.tunnel_ready));
      setTunnelError(statusRes.tunnel_error || null);
      if (statusRes.node_id || statusRes.subdomain) {
        setNodeInfo({
          node_id: statusRes.node_id,
          subdomain: statusRes.subdomain,
        });
      }

      // 2. If a Bearer token exists, verify authenticated session
      const token = getSessionToken();
      if (!token) {
        setUser(null);
        setRole(null);
        return {
          paired: true,
          tunnel_status: statusRes.tunnel_status as 'unpaired' | 'starting' | 'ready' | 'failed',
          tunnel_ready: statusRes.tunnel_ready,
          tunnel_error: statusRes.tunnel_error,
          node_id: statusRes.node_id,
          subdomain: statusRes.subdomain,
        };
      }

      const session = await apiGetNodeSession();
      if (session.user) {
        setUser(session.user);
        setRole(session.user.role || 'member');
        setIsSessionExpired(false);
        if (session.node_id || session.subdomain) {
          setNodeInfo({
            node_id: session.node_id || statusRes.node_id,
            subdomain: session.subdomain || statusRes.subdomain,
          });
        }
        if (session.tunnel_status) {
          setTunnelStatus(session.tunnel_status);
        }
        if (session.tunnel_ready !== undefined) {
          setTunnelReady(Boolean(session.tunnel_ready));
        }
        if (session.tunnel_error !== undefined) {
          setTunnelError(session.tunnel_error);
        }
      }

      return session;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        setIsSessionExpired(true);
        setUser(null);
        setRole(null);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginWithToken = async (token: string): Promise<boolean> => {
    try {
      setSessionToken(token);
      const session = await refreshSession();
      if (session?.user) {
        setIsSessionExpired(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const restartTunnel = async () => {
    try {
      setTunnelStatus('starting');
      setTunnelError(null);
      await apiRestartTunnel();
      await refreshSession();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setTunnelError('Tunnel restart is already in progress. Please wait.');
          setTunnelStatus('starting');
          return;
        }
        if (err.status === 403) {
          setTunnelError('Tunnel can only be restarted directly on localhost, not via external proxy.');
          setTunnelStatus('failed');
          return;
        }
        if (err.status === 429) {
          const waitTime = err.retryAfter ? ` (retry after ${err.retryAfter}s)` : '';
          setTunnelError(`Rate limit reached for tunnel restart${waitTime}.`);
          setTunnelStatus('failed');
          return;
        }
      }
      setTunnelError(err instanceof Error ? err.message : 'Failed to trigger tunnel restart');
      setTunnelStatus('failed');
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSession();

    // Subscribe to 401 session expired triggers from api.ts
    const unsubscribe = onSessionExpired(() => {
      setIsSessionExpired(true);
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
    setRole(null);
    setIsSessionExpired(false);
  };

  const isOwner = role === 'owner';
  const isAuthenticated = isPaired && Boolean(user) && !isSessionExpired;

  return (
    <AuthContext.Provider
      value={{
        isPaired,
        isLoading,
        isAuthenticated,
        isOwner,
        role,
        isLocalhost,
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
        loginWithToken,
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
