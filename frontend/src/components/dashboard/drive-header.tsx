'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useDashboard } from '@/lib/dashboard-context';
import LogoIcon from '@/assets/logo-icon';
import {
  RiSearchLine,
  RiCloseLine,
  RiEqualizerLine,
  RiShieldCheckLine,
  RiRestartLine,
  RiExternalLinkLine,
  RiLogoutBoxRLine,
  RiHardDrive2Line,
  RiQuestionLine,
  RiMenuLine,
  RiLoader4Line,
} from 'react-icons/ri';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const CENTRAL_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || 'https://cachette.cloud';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function DriveHeader({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void }) {
  const {
    user,
    role,
    isOwner,
    isLocalhost,
    nodeInfo,
    tunnelStatus,
    tunnelReady,
    tunnelError,
    restartTunnel,
    logout,
  } = useAuth();
  const { searchQuery, setSearchQuery } = useDashboard();
  const [restarting, setRestarting] = useState(false);

  const quotaBytes = user?.storage_quota_bytes || 5 * 1024 ** 3;
  const storageUsed = user?.storage_used ?? 0;
  const storagePercent = Math.min((storageUsed / quotaBytes) * 100, 100);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await restartTunnel();
    } finally {
      setRestarting(false);
    }
  };

  const isTunnelActive = tunnelReady || tunnelStatus === 'ready';

  return (
    <header className="h-16 w-full px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-[#070709] shrink-0 z-20">
      {/* Left: Hamburger + Brand logo */}
      <div className="flex items-center gap-3 min-w-[180px] sm:min-w-[220px]">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            aria-label="Open mobile navigation"
            className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.05] transition-colors"
          >
            <RiMenuLine className="w-5 h-5" />
          </button>
        )}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center p-1.5 shadow-sm group-hover:border-white/25 transition-all">
            <LogoIcon className="w-full h-full text-white" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[17px] font-semibold tracking-tight text-white">Cachette</span>
            <span className="text-[13px] font-normal text-zinc-400">Drive</span>
          </div>
        </Link>
      </div>

      {/* Center: Google Drive Search Bar */}
      <div className="flex-1 max-w-[700px] flex justify-center">
        <div className="relative w-full flex items-center group">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-white transition-colors">
            <RiSearchLine className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in Drive"
            className="w-full h-11 pl-10 pr-10 rounded-full bg-white/[0.05] hover:bg-white/[0.08] focus:bg-[#121217] border border-transparent focus:border-white/20 text-[13.5px] text-white placeholder-zinc-500 outline-none transition-all shadow-inner"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-white transition-colors"
            >
              <RiCloseLine className="w-4 h-4" />
            </button>
          ) : (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-zinc-500">
              <RiEqualizerLine className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>

      {/* Right: Enclave Tunnel Pill, Help, User Avatar */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Enclave Bridge Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[12px] font-mono transition-colors"
              title="Enclave Node Status"
            >
              <span className="relative flex h-2 w-2">
                {isTunnelActive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isTunnelActive
                      ? 'bg-emerald-400'
                      : tunnelStatus === 'starting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-red-400'
                  }`}
                />
              </span>
              <span className="text-zinc-300 font-medium">
                {isTunnelActive ? 'ENCLAVE READY' : tunnelStatus === 'starting' ? 'SYNCING' : 'OFFLINE'}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 bg-[#101014] border-white/10 p-3 rounded-2xl shadow-2xl">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-400 uppercase">Hardware Enclave Node</span>
                <span className={`text-[10.5px] font-mono px-2 py-0.5 rounded-full ${
                  isTunnelActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {tunnelStatus.toUpperCase()}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.05] space-y-1 text-[11px] font-mono">
                <div className="flex justify-between text-zinc-400">
                  <span>Node ID:</span>
                  <span className="text-zinc-200 truncate max-w-[140px]">{nodeInfo?.node_id || 'Local-01'}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Domain:</span>
                  <span className="text-zinc-200 truncate max-w-[140px]">{nodeInfo?.subdomain || 'Local Enclave'}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Access:</span>
                  <span className={isLocalhost ? 'text-emerald-400' : 'text-blue-400'}>
                    {isLocalhost ? 'Localhost' : 'Tunnel Ingress'}
                  </span>
                </div>
                {tunnelError && (
                  <div className="text-red-400 text-[10px] pt-1">
                    Notice: {tunnelError}
                  </div>
                )}
                {!isLocalhost && (
                  <div className="text-zinc-400 text-[10px] pt-1 italic">
                    Administrative restart requires direct local access.
                  </div>
                )}
              </div>

              <button
                onClick={handleRestart}
                disabled={restarting || !isLocalhost}
                title={!isLocalhost ? 'Tunnel restart is restricted to direct localhost connections' : undefined}
                className="w-full h-8 mt-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-[11.5px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
              >
                {restarting ? (
                  <>
                    <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
                    <span>Restarting Tunnel...</span>
                  </>
                ) : (
                  <>
                    <RiRestartLine className="w-3.5 h-3.5" />
                    <span>Restart Cloudflare Tunnel</span>
                  </>
                )}
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Central Help Link */}
        <a
          href={CENTRAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          title="Support & Central"
        >
          <RiQuestionLine className="w-5 h-5" />
        </a>

        {/* User Profile Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative flex items-center gap-2 p-1 rounded-full hover:bg-white/[0.05] transition-all outline-none">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-500 p-[1px] shadow-sm">
                <div className="w-full h-full rounded-full bg-[#16161b] flex items-center justify-center">
                  <span className="text-white text-[13px] font-semibold uppercase">
                    {(user?.display_name || 'U').charAt(0)}
                  </span>
                </div>
              </div>
              <span className={`hidden md:inline-block text-[10px] font-mono uppercase font-semibold px-2 py-0.5 rounded-full ${
                isOwner
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
              }`}>
                {role || 'member'}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-[#101014] border-white/10 p-3 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-3 px-1 py-1">
              <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-white font-semibold uppercase">
                {(user?.display_name || 'U').charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium text-white truncate">
                    {user?.display_name || 'Enclave User'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[9.5px] font-mono uppercase font-medium px-1.5 py-0.2 rounded ${
                    isOwner
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                  }`}>
                    {isOwner ? 'Node Owner' : 'Member'}
                  </span>
                  <span className="text-[11px] text-zinc-400 truncate">
                    {formatBytes(storageUsed)} / {formatBytes(quotaBytes)}
                  </span>
                </div>
              </div>
            </div>

            <DropdownMenuSeparator className="bg-white/[0.06] my-2" />

            <div className="px-1 py-1">
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1.5 font-mono">
                <span>Storage used</span>
                <span>{storagePercent.toFixed(0)}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            </div>

            <DropdownMenuSeparator className="bg-white/[0.06] my-1" />

            <DropdownMenuItem asChild>
              <Link href="/dashboard/computers" className="text-[12px] flex items-center gap-2 text-zinc-300 cursor-pointer">
                <RiHardDrive2Line className="w-4 h-4 text-zinc-400" />
                <span>Enclave Node Details</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <a
                href={`${CENTRAL_URL}/dashboard`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] flex items-center gap-2 text-zinc-300 cursor-pointer"
              >
                <RiExternalLinkLine className="w-4 h-4 text-zinc-400" />
                <span>Open Central Console</span>
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/auth" className="text-[12px] flex items-center gap-2 text-zinc-300 cursor-pointer">
                <RiShieldCheckLine className="w-4 h-4 text-emerald-400" />
                <span>Pairing Screen</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-white/[0.06] my-1" />

            <DropdownMenuItem
              onClick={logout}
              className="text-[12px] text-red-400 hover:text-red-300 cursor-pointer flex items-center gap-2"
            >
              <RiLogoutBoxRLine className="w-4 h-4" />
              <span>Sign out of Node</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

