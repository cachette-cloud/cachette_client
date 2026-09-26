'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  apiGetNodeSession,
  apiRestartTunnel,
  setSessionToken,
  clearSessionToken,
  onSessionExpired,
  type UserCacheOut,
  type NodeSessionResponse,
} from './api';

interface AuthContextValue {
  isPaired: boolean;
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
      const session = await apiGetNodeSession();
      if (session.paired && session.session_token) {
        setSessionToken(session.session_token, session.session_token_expires_at);
        setIsPaired(true);
        setTunnelStatus(session.tunnel_status || 'unpaired');
        setTunnelReady(Boolean(session.tunnel_ready));
        setTunnelError(session.tunnel_error || null);
        setUser(session.user || null);
        setSessionTokenExpiresAt(session.session_token_expires_at || null);
        setNodeInfo({
          node_id: session.node_id,
          subdomain: session.subdomain,
        });
        checkTokenExpiry(session.session_token_expires_at);
      } else {
        setIsPaired(false);
        setTunnelStatus('unpaired');
        setTunnelReady(false);
        setTunnelError(null);
        setUser(null);
        clearSessionToken();
      }
      return session;
    } catch (err) {
      // If node is unreachable or returns error
      console.warn('Failed to fetch node session:', err);
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
    } catch (err: any) {
      setTunnelError(err.message || 'Failed to trigger tunnel restart');
      setTunnelStatus('failed');
    }
  };

  useEffect(() => {
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
    setIsPaired(false);
    setIsSessionExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isPaired,
        isLoading,
        isAuthenticated: isPaired && !isSessionExpired && (tunnelReady || tunnelStatus === 'ready'),
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
