'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/lib/auth-context';
import { apiClaimPairing } from '@/lib/api';
import LogoIcon from '@/assets/logo-icon';
import {
  RiArrowLeftLine,
  RiExternalLinkLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiShieldCheckLine,
  RiRefreshLine,
  RiKey2Line,
  RiLoader4Line,
  RiCloudLine,
  RiRestartLine,
} from 'react-icons/ri';

const CENTRAL_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || 'http://localhost:4000';

export default function PairingAuthPage() {
  const router = useRouter();
  const {
    isPaired,
    isLoading: authLoading,
    isAuthenticated,
    isSessionExpired,
    tunnelStatus,
    tunnelReady,
    tunnelError,
    restartTunnel,
    nodeInfo,
    refreshSession,
  } = useAuth();

  const [manualCode, setManualCode] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [retryingTunnel, setRetryingTunnel] = useState(false);

  // If already paired and authenticated (tunnel ready), redirect to dashboard immediately
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [authLoading, isAuthenticated, router]);

  // Live polling every 2.5 seconds to detect when pairing and tunnel completion happen
  useEffect(() => {
    if (isAuthenticated) return;

    const interval = setInterval(() => {
      refreshSession();
    }, 2500);

    return () => clearInterval(interval);
  }, [isAuthenticated, refreshSession]);

  const handleManualClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = manualCode.trim().toUpperCase();
    if (!cleanCode) return;

    setClaimLoading(true);
    setClaimError(null);
    try {
      await apiClaimPairing(cleanCode);
      const session = await refreshSession();
      if (session?.paired && (session?.tunnel_ready || session?.tunnel_status === 'ready')) {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setClaimError(err.detail || err.message || 'Failed to claim pairing code. Please verify the code.');
    } finally {
      setClaimLoading(false);
    }
  };

  const handleRetryTunnel = async () => {
    setRetryingTunnel(true);
    try {
      await restartTunnel();
    } finally {
      setRetryingTunnel(false);
    }
  };

  const handleCopyCentralUrl = () => {
    navigator.clipboard.writeText(CENTRAL_URL);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12 relative overflow-hidden select-none">
      {/* Ambient background glows */}
      <div className="absolute top-[-20%] right-[-10%] w-[340px] sm:w-[600px] h-[340px] sm:h-[600px] rounded-full bg-indigo-500/[0.07] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[300px] sm:w-[520px] h-[300px] sm:h-[520px] rounded-full bg-cyan-500/[0.05] blur-[110px] pointer-events-none" />
      <div className="absolute top-[35%] left-[25%] w-[220px] sm:w-[380px] h-[220px] sm:h-[380px] rounded-full bg-violet-600/[0.04] blur-[90px] pointer-events-none" />

      {/* Back to landing link */}
      <motion.div
        className="absolute top-4 left-4 sm:top-6 sm:left-6 md:top-8 md:left-10"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 sm:gap-2 text-white/40 hover:text-white/80 text-[13px] font-medium transition-colors"
        >
          <RiArrowLeftLine className="w-4 h-4" />
          Home
        </Link>
      </motion.div>

      <motion.div
        className="w-full max-w-md relative z-10 my-auto"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {/* Header Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.1] shadow-2xl flex items-center justify-center backdrop-blur-md">
              <LogoIcon className="w-7 h-7 text-white" />
            </div>
            {/* Status ring */}
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isSessionExpired ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                  isSessionExpired ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
            Cachette Node
          </h1>
          <p className="text-[13px] text-white/50 mt-1 text-center max-w-xs">
            Decentralized private storage cluster
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-6 sm:p-7 shadow-2xl space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center w-3 h-3">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-70 ${
                    isSessionExpired || tunnelStatus === 'failed'
                      ? 'bg-rose-400'
                      : isPaired && tunnelStatus === 'starting'
                      ? 'bg-amber-400'
                      : isPaired
                      ? 'bg-emerald-400'
                      : 'bg-indigo-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isSessionExpired || tunnelStatus === 'failed'
                      ? 'bg-rose-500'
                      : isPaired && tunnelStatus === 'starting'
                      ? 'bg-amber-500'
                      : isPaired
                      ? 'bg-emerald-500'
                      : 'bg-indigo-500'
                  }`}
                />
              </div>
              <span className="text-[12px] font-medium uppercase tracking-wider text-white/60">
                {isSessionExpired ? 'Session Expired' : isPaired ? 'Pairing State' : 'Node Status'}
              </span>
            </div>

            <div
              className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                isSessionExpired
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : isPaired && tunnelStatus === 'starting'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : isPaired && tunnelStatus === 'failed'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  : isPaired
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
              }`}
            >
              {isSessionExpired
                ? 'Re-pairing Required'
                : isPaired && tunnelStatus === 'starting'
                ? 'Tunnel Starting...'
                : isPaired && tunnelStatus === 'failed'
                ? 'Tunnel Offline'
                : isPaired
                ? 'Paired & Online'
                : 'Waiting to be paired'}
            </div>
          </div>

          {/* Expired Session Alert */}
          {isSessionExpired && (
            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 flex items-start gap-3">
              <RiErrorWarningLine className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[13px] text-amber-200/90 leading-relaxed">
                <span className="font-semibold text-amber-200">Session expired: </span>
                Your authorization token has expired. Please re-pair this node from the central dashboard.
              </div>
            </div>
          )}

          {/* Conditional View: Paired but Tunnel Starting */}
          {isPaired && !isSessionExpired && tunnelStatus === 'starting' && (
            <div className="space-y-5 py-2">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative flex items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <RiCloudLine className="w-8 h-8 text-amber-400 animate-pulse" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 items-center justify-center">
                      <RiRefreshLine className="w-2.5 h-2.5 text-black animate-spin" />
                    </span>
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-[15px] font-semibold text-white">
                    Starting Cloudflare Tunnel
                  </h3>
                  <p className="text-[13px] text-white/50 max-w-xs leading-relaxed">
                    Credentials persisted. Bringing up edge tunnel container and verifying connectivity (~30s)...
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
                <RiLoader4Line className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                <div className="text-[12px] text-white/60">
                  Awaiting <span className="font-mono text-white/80">Registered tunnel connection</span> signal...
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                type="button"
                className="w-full h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white transition-all text-[12px] font-medium flex items-center justify-center"
              >
                Skip waiting and open local dashboard
              </button>
            </div>
          )}

          {/* Conditional View: Paired but Tunnel Failed */}
          {isPaired && !isSessionExpired && tunnelStatus === 'failed' && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 space-y-2">
                <div className="flex items-center gap-2 text-rose-300 font-semibold text-[13px]">
                  <RiErrorWarningLine className="w-5 h-5 shrink-0 text-rose-400" />
                  <span>Tunnel Failed to Start</span>
                </div>
                <p className="text-[12px] text-rose-200/80 leading-relaxed break-words font-mono">
                  {tunnelError || 'Could not verify tunnel connection to Cloudflare edge. Check Docker daemon status.'}
                </p>
              </div>

              <p className="text-[12px] text-white/50 leading-relaxed">
                Credentials are saved, but Docker Compose could not start the <span className="font-mono text-white/70">cloudflared</span> service. Ensure Docker Desktop is running and retry.
              </p>

              <div className="space-y-2.5 pt-1">
                <button
                  onClick={handleRetryTunnel}
                  disabled={retryingTunnel}
                  type="button"
                  className="w-full h-10 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-50 transition-all font-medium text-[13px] flex items-center justify-center gap-2 shadow-sm"
                >
                  {retryingTunnel ? (
                    <>
                      <RiLoader4Line className="w-4 h-4 animate-spin" />
                      <span>Retrying Tunnel Startup...</span>
                    </>
                  ) : (
                    <>
                      <RiRestartLine className="w-4 h-4" />
                      <span>Retry Tunnel Startup</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => router.push('/dashboard')}
                  type="button"
                  className="w-full h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white transition-all text-[12px] font-medium flex items-center justify-center"
                >
                  Continue to Dashboard (Local Access Only)
                </button>
              </div>
            </div>
          )}

          {/* Conditional View: Unpaired / Standard Instructions */}
          {(!isPaired || isSessionExpired) && (
            <>
              {/* Central-Initiated Pairing Instructions */}
              <div className="space-y-4">
                <div className="text-[13px] text-white/80 font-medium">
                  How to pair this node:
                </div>

                <ol className="space-y-3 text-[13px] text-white/60">
                  <li className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] text-white/80 text-[11px] font-semibold shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Go to the central dashboard at{' '}
                      <a
                        href={CENTRAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:underline font-medium inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                      >
                        {CENTRAL_URL.replace(/^https?:\/\//, '')}
                        <RiExternalLinkLine className="w-3.5 h-3.5" />
                      </a>
                    </span>
                  </li>

                  <li className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] text-white/80 text-[11px] font-semibold shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Click <strong className="text-white">Connect</strong> (or "Add Node") in your storage cluster list.
                    </span>
                  </li>

                  <li className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] text-white/80 text-[11px] font-semibold shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      Enter the 6-character code generated for this node.
                    </span>
                  </li>
                </ol>

                {/* Crucial clarification note */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[12px] text-white/50 leading-relaxed flex items-start gap-2.5">
                  <RiShieldCheckLine className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
                  <span>
                    <strong>Note:</strong> Pairing is initiated from central, not from this node. Once paired, the tunnel will connect and launch your dashboard.
                  </span>
                </div>
              </div>

              {/* Animated Waiting Radar Indicator */}
              <div className="py-2 flex flex-col items-center justify-center gap-2">
                <div className="flex items-center gap-2 text-[12px] text-white/40 font-medium">
                  <RiRefreshLine className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Listening for pairing confirmation...</span>
                </div>
              </div>

              {/* Quick link button to central */}
              <div className="space-y-2.5">
                <a
                  href={CENTRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-10 rounded-xl bg-white text-black hover:bg-white/90 transition-all font-medium text-[13px] flex items-center justify-center gap-2 shadow-sm"
                >
                  Open Central Dashboard
                  <RiExternalLinkLine className="w-4 h-4" />
                </a>

                <button
                  onClick={handleCopyCentralUrl}
                  type="button"
                  className="w-full h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white transition-all text-[12px] font-medium flex items-center justify-center gap-1.5"
                >
                  {copiedLink ? (
                    <>
                      <RiCheckLine className="w-4 h-4 text-emerald-400" />
                      <span>Copied {CENTRAL_URL.replace(/^https?:\/\//, '')} to clipboard</span>
                    </>
                  ) : (
                    <span>Copy Central URL</span>
                  )}
                </button>
              </div>

              {/* Optional Direct Code Claim Toggle */}
              <div className="pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-[12px] text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5 mx-auto"
                >
                  <RiKey2Line className="w-3.5 h-3.5" />
                  {showManualInput ? 'Hide manual code entry' : 'Have a pairing code? Enter it manually'}
                </button>

                <AnimatePresence>
                  {showManualInput && (
                    <motion.form
                      onSubmit={handleManualClaim}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 space-y-2.5 overflow-hidden"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={8}
                          placeholder="e.g. A9B3C2"
                          value={manualCode}
                          onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                          className="flex-1 h-9 rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 text-[13px] text-white placeholder-white/20 tracking-wider uppercase focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                        />
                        <button
                          type="submit"
                          disabled={claimLoading || !manualCode.trim()}
                          className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[12px] font-medium transition-colors flex items-center gap-1.5"
                        >
                          {claimLoading ? (
                            <RiLoader4Line className="w-4 h-4 animate-spin" />
                          ) : (
                            'Pair'
                          )}
                        </button>
                      </div>

                      {claimError && (
                        <p className="text-[12px] text-red-400">{claimError}</p>
                      )}
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}

          {/* Node Metadata Footer */}
          {nodeInfo?.node_id && (
            <div className="pt-2 border-t border-white/[0.04] text-[11px] text-white/30 text-center font-mono truncate">
              Node ID: {nodeInfo.node_id}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
