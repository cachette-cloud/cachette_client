'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  RiShieldCheckLine,
  RiRestartLine,
  RiLoader4Line,
  RiAlertLine,
  RiHardDrive2Line,
  RiLockLine,
  RiGlobalLine,
} from 'react-icons/ri';

export default function TunnelController() {
  const {
    isPaired,
    role,
    isOwner,
    isLocalhost,
    nodeInfo,
    tunnelStatus,
    tunnelReady,
    tunnelError,
    restartTunnel,
  } = useAuth();

  const [restarting, setRestarting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const isOnline = tunnelReady || tunnelStatus === 'ready';

  const handleRestart = async () => {
    if (!isLocalhost) {
      setFeedback({
        type: 'info',
        message: 'Administrative tunnel restarts are restricted strictly to local machine loopback (127.0.0.1) and cannot be executed over Cloudflare Tunnel ingress.',
      });
      return;
    }

    setRestarting(true);
    setFeedback(null);
    try {
      await restartTunnel();
      setFeedback({
        type: 'success',
        message: 'Cloudflared tunnel restart workflow triggered.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to restart tunnel.',
      });
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white">
            <RiHardDrive2Line className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-white">Hardware Node Controller</h3>
            <p className="text-[11.5px] text-zinc-400 font-mono">
              {nodeInfo?.node_id || 'Node-Local-01'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : tunnelStatus === 'starting'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOnline
                  ? 'bg-emerald-400 animate-pulse'
                  : tunnelStatus === 'starting'
                  ? 'bg-amber-400 animate-spin'
                  : 'bg-red-400'
              }`}
            />
            {isOnline ? 'TUNNEL ONLINE' : tunnelStatus.toUpperCase()}
          </span>

          <span
            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
              isOwner
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
            }`}
          >
            {role || 'member'}
          </span>
        </div>
      </div>

      {/* Node Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11.5px] font-mono">
        <div className="p-3 rounded-xl bg-black/40 border border-white/[0.05] space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <RiGlobalLine className="w-3.5 h-3.5" />
            <span>Public Subdomain</span>
          </div>
          <p className="text-zinc-200 truncate">
            {nodeInfo?.subdomain ? `${nodeInfo.subdomain}.cachette.cloud` : 'Local Host'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-black/40 border border-white/[0.05] space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <RiLockLine className="w-3.5 h-3.5" />
            <span>Ingress Route</span>
          </div>
          <p className={isLocalhost ? 'text-emerald-400 font-medium' : 'text-blue-400 font-medium'}>
            {isLocalhost ? 'Localhost (Direct)' : 'Cloudflare Tunnel'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-black/40 border border-white/[0.05] space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <RiShieldCheckLine className="w-3.5 h-3.5" />
            <span>Security Contract</span>
          </div>
          <p className="text-zinc-200">Central JWKS RS256</p>
        </div>
      </div>

      {/* Notice / Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-xl text-[12px] flex items-start gap-2 ${
            feedback.type === 'error'
              ? 'bg-red-500/10 border border-red-500/20 text-red-300'
              : feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
          }`}
        >
          <RiAlertLine className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{feedback.message}</p>
        </div>
      )}

      {tunnelError && (
        <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/20 text-red-300 text-[11.5px] font-mono">
          Bridge Notice: {tunnelError}
        </div>
      )}

      {/* Restart Trigger */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[11.5px] text-zinc-500">
          {!isLocalhost
            ? 'Administrative restart is disabled over Cloudflare Tunnel ingress.'
            : 'Supervised restart re-registers native cloudflared connection.'}
        </p>

        <button
          onClick={handleRestart}
          disabled={restarting || !isLocalhost || tunnelStatus === 'starting'}
          className="h-8 px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
        >
          {restarting || tunnelStatus === 'starting' ? (
            <>
              <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
              <span>Restarting...</span>
            </>
          ) : (
            <>
              <RiRestartLine className="w-3.5 h-3.5" />
              <span>Restart Tunnel</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

