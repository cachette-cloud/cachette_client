'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  RiComputerLine,
  RiShieldCheckLine,
  RiRestartLine,
  RiExternalLinkLine,
  RiServerLine,
  RiLockLine,
  RiLoader4Line,
} from 'react-icons/ri';

const CENTRAL_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || 'https://cachette.cloud';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function ComputersPage() {
  const {
    nodeInfo,
    user,
    tunnelStatus,
    tunnelReady,
    tunnelError,
    sessionTokenExpiresAt,
    restartTunnel,
  } = useAuth();

  const [restarting, setRestarting] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await restartTunnel();
    } finally {
      setRestarting(false);
    }
  };

  const quotaBytes = user?.storage_quota_bytes || 5 * 1024 ** 3;
  const storageUsed = user?.storage_used ?? 0;
  const isOnline = tunnelReady || tunnelStatus === 'ready';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">Computers & Nodes</h1>
          <p className="text-[13px] text-zinc-400 mt-0.5">
            Hardware enclave machines synced to your Cachette account
          </p>
        </div>
        <button
          onClick={handleRestart}
          disabled={restarting}
          className="h-9 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white text-[12.5px] font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {restarting ? (
            <>
              <RiLoader4Line className="w-4 h-4 animate-spin text-zinc-300" />
              <span>Restarting Bridge...</span>
            </>
          ) : (
            <>
              <RiRestartLine className="w-4 h-4 text-zinc-300" />
              <span>Restart Tunnel</span>
            </>
          )}
        </button>
      </div>

      {/* Main Node Card */}
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white shrink-0">
            <RiComputerLine className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold text-white">
                Primary Enclave Node
              </h2>
              <span
                className={`text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isOnline
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {isOnline ? 'ONLINE & SECURE' : tunnelStatus.toUpperCase()}
              </span>
            </div>
            <p className="text-[12px] font-mono text-zinc-400 mt-1">
              ID: {nodeInfo?.node_id || 'Primary Node'} • Subdomain: {nodeInfo?.subdomain || 'Local Enclave'}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 text-[12.5px] font-mono">
          <div>
            <p className="text-zinc-500 text-[11px]">Enclave Storage</p>
            <p className="text-white font-medium mt-0.5">{formatBytes(storageUsed)} / {formatBytes(quotaBytes)}</p>
          </div>
          <div className="h-8 w-px bg-white/[0.06]" />
          <div>
            <p className="text-zinc-500 text-[11px]">Bridge Protocol</p>
            <p className="text-white font-medium mt-0.5">Cloudflare Zero-Trust</p>
          </div>
          <div className="h-8 w-px bg-white/[0.06]" />
          <div>
            <p className="text-zinc-500 text-[11px]">Token Expiry</p>
            <p className="text-white font-medium mt-0.5">
              {sessionTokenExpiresAt ? new Date(sessionTokenExpiresAt).toLocaleDateString() : 'Active'}
            </p>
          </div>
        </div>
      </div>

      {/* Security Architecture Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white mb-2">
            <RiLockLine className="w-5 h-5" />
          </div>
          <h3 className="text-[14px] font-semibold text-white">Hardware Enclave Isolation</h3>
          <p className="text-[12px] text-zinc-400 leading-relaxed">
            Data stays on-premises. Central coordinates metadata and pairing while encryption keys never leave this host.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white mb-2">
            <RiServerLine className="w-5 h-5" />
          </div>
          <h3 className="text-[14px] font-semibold text-white">Native MinIO S3 Engine</h3>
          <p className="text-[12px] text-zinc-400 leading-relaxed">
            Supervised native binary supervisor processes 5MB multipart chunk streams in parallel for rapid sync.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white mb-2">
            <RiShieldCheckLine className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-[14px] font-semibold text-white">Cryptographic Verification</h3>
          <p className="text-[12px] text-zinc-400 leading-relaxed">
            Public keys verified on-node against RS256 token claims with automated heartbeat session sync.
          </p>
        </div>
      </div>

      {/* Error alert if any */}
      {tunnelError && (
        <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/20 text-red-300 text-[12.5px] font-mono">
          Tunnel Diagnostic Notice: {tunnelError}
        </div>
      )}

      {/* Central Link */}
      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
        <div>
          <h4 className="text-[13.5px] font-medium text-white">Manage Enclave Fleet from Central</h4>
          <p className="text-[12px] text-zinc-400">View pairing tokens, add new storage drives, or configure custom domains.</p>
        </div>
        <a
          href={`${CENTRAL_URL}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 px-4 rounded-xl bg-white text-black hover:bg-zinc-200 text-[12px] font-medium flex items-center gap-1.5 transition-colors"
        >
          <span>Central Console</span>
          <RiExternalLinkLine className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
