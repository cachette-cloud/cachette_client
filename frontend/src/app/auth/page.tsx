'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useSpring,
} from 'motion/react';
import { useAuth } from '@/lib/auth-context';
import { apiClaimPairing } from '@/lib/api';
import DarkVeil from '@/components/ui/DarkVeil';
import {
  RiKey2Line,
  RiArrowRightLine,
  RiExternalLinkLine,
  RiRestartLine,
  RiCheckLine,
  RiLoader4Line,
  RiShieldCheckLine,
  RiClipboardLine,
  RiArrowLeftLine,
  RiErrorWarningLine,
} from 'react-icons/ri';

const CENTRAL_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || 'https://cachette.cloud';

export default function SleekAuthPage() {
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

  const [connectionCode, setConnectionCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [retryingTunnel, setRetryingTunnel] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Card 3D tilt and refraction physics
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springConfig = { damping: 20, stiffness: 180, mass: 0.6 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(smoothMouseY, [0, 1], [6, -6]);
  const rotateY = useTransform(smoothMouseX, [0, 1], [-6, 6]);

  const glareX = useTransform(smoothMouseX, [0, 1], [0, 420]);
  const glareY = useTransform(smoothMouseY, [0, 1], [0, 520]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
    setIsHovered(false);
  };

  // Redirect to dashboard immediately if authenticated and ready
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [authLoading, isAuthenticated, router]);

  // Periodic heartbeat session sync
  useEffect(() => {
    if (isAuthenticated) return;
    const interval = setInterval(() => {
      refreshSession();
    }, 2800);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshSession]);

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = connectionCode.trim().toUpperCase();
    if (!cleanCode) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await apiClaimPairing(cleanCode);
      const session = await refreshSession();
      if (session?.paired && (session?.tunnel_ready || session?.tunnel_status === 'ready')) {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(
        err?.detail || err?.message || 'Invalid or expired node connection code.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setConnectionCode(text.trim().toUpperCase());
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 1500);
      }
    } catch {
      // Clipboard permission denied or unsupported
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

  // Status mapping
  const getStatusBadge = () => {
    if (isSessionExpired) {
      return {
        label: 'SESSION EXPIRED',
        color: '#FFB800',
        pulse: true,
        desc: 'Re-authorization required',
      };
    }
    if (tunnelStatus === 'failed') {
      return {
        label: 'TUNNEL OFFLINE',
        color: '#FF4D4D',
        pulse: true,
        desc: 'Bridge disconnected',
      };
    }
    if (isPaired && (tunnelStatus === 'starting' || !tunnelReady)) {
      return {
        label: 'SYNCHRONIZING',
        color: '#8116E0',
        pulse: true,
        desc: 'Establishing secure tunnel',
      };
    }
    if (isPaired && (tunnelReady || tunnelStatus === 'ready')) {
      return {
        label: 'NODE ONLINE',
        color: '#D0FF00',
        pulse: false,
        desc: 'Cluster encrypted',
      };
    }
    return {
      label: 'NODE STANDBY',
      color: '#D0FF00',
      pulse: true,
      desc: 'Ready for connection',
    };
  };

  const status = getStatusBadge();

  return (
    <main className="relative min-h-[100dvh] w-full bg-[#000000] text-[#FEFFFC] flex flex-col items-center justify-center px-4 sm:px-6 py-8 overflow-hidden select-none font-sans">
      {/* ── Background WebGL Shader (DarkVeil) ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <DarkVeil
          speed={0.4}
          hueShift={0}
          noiseIntensity={0.02}
          scanlineIntensity={0.06}
          scanlineFrequency={2.0}
          warpAmount={0.25}
          resolutionScale={1}
          className="opacity-75"
        />

        {/* Ambient atmospheric vignettes blending #131210 and #000000 */}
        <div className="absolute inset-0 bg-[#000000]/40 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-radial from-transparent via-[#131210]/60 to-[#000000]" />

        {/* Studio lighting auras matching #8116E0 & #D0FF00 */}
        <div className="absolute top-[18%] left-[24%] w-[380px] sm:w-[540px] h-[380px] sm:h-[540px] rounded-full bg-[#8116E0]/[0.14] blur-[140px] pointer-events-none transform -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-[20%] right-[22%] w-[320px] sm:w-[460px] h-[320px] sm:h-[460px] rounded-full bg-[#D0FF00]/[0.08] blur-[150px] pointer-events-none transform translate-x-1/2 translate-y-1/2" />
      </div>

      {/* Top Navigation / Home Link */}
      <motion.div
        className="fixed top-6 left-6 z-20"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Link
          href="/"
          className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#131210]/60 hover:bg-[#131210]/90 border border-[#FEFFFC]/[0.08] hover:border-[#FEFFFC]/[0.18] backdrop-blur-xl text-[12px] font-mono text-[#FEFFFC]/60 hover:text-[#FEFFFC] transition-all duration-200"
        >
          <RiArrowLeftLine className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>PORTAL</span>
        </Link>
      </motion.div>

      {/* Center 3D Glassmorphism Auth Card */}
      <div
        className="relative z-10 w-full max-w-[420px] my-auto [perspective:1200px]"
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
      >
        <motion.div
          ref={cardRef}
          style={{
            rotateX,
            rotateY,
            transformStyle: 'preserve-3d',
          }}
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-[28px] p-7 sm:p-8 bg-[#131210]/70 backdrop-blur-[36px] border border-[#FEFFFC]/[0.12] shadow-[0_32px_100px_rgba(0,0,0,0.88),0_0_50px_-15px_rgba(129,22,224,0.32)] overflow-hidden"
        >
          {/* Specular Glare / Light Refraction following cursor */}
          <motion.div
            style={{
              background: useTransform(
                [glareX, glareY],
                ([x, y]) =>
                  `radial-gradient(circle 280px at ${x}px ${y}px, rgba(254, 255, 252, 0.08), transparent 75%)`
              ),
            }}
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          />

          {/* Top-right Curled Glass Refraction Accent (Inspired by Picture 2) */}
          <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden rounded-tr-[28px]">
            {/* Glass corner bevel and refractive fold */}
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-[#FEFFFC]/[0.18] via-[#FEFFFC]/[0.04] to-transparent rotate-45 border-b border-l border-[#FEFFFC]/[0.15] backdrop-blur-md shadow-inner" />
          </div>

          {/* ── Top Emblem: Overlapping Glowing Badges (Inspired by Picture 1) ── */}
          <div className="flex flex-col items-center mb-6 pt-1">
            <motion.div
              className="relative flex items-center justify-center mb-4"
              animate={{ y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
            >
              {/* Back subtle glow halo */}
              <div className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-[#8116E0]/40 to-[#D0FF00]/30 blur-2xl pointer-events-none" />

              {/* Left Badge: Electric Violet Enclave Orb */}
              <div className="relative -mr-3.5 z-10 w-12 h-12 rounded-full bg-gradient-to-br from-[#8116E0] to-[#510B96] p-[1px] shadow-[0_8px_24px_rgba(129,22,224,0.5)]">
                <div className="w-full h-full rounded-full bg-[#131210]/40 backdrop-blur-md flex items-center justify-center border border-white/20">
                  <RiShieldCheckLine className="w-5 h-5 text-[#FEFFFC]" />
                </div>
              </div>

              {/* Right Badge: Cyber Lime Node Orb */}
              <div className="relative z-20 w-12 h-12 rounded-full bg-gradient-to-br from-[#D0FF00] to-[#99CC00] p-[1px] shadow-[0_8px_24px_rgba(208,255,0,0.35)]">
                <div className="w-full h-full rounded-full bg-[#131210]/30 backdrop-blur-md flex items-center justify-center border border-black/20">
                  <RiKey2Line className="w-5 h-5 text-[#000000]" />
                </div>
              </div>
            </motion.div>

            {/* Title & Minimalist Context */}
            <h1 className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-[#FEFFFC] text-center">
              Node Authentication
            </h1>
            <p className="text-[12px] text-[#FEFFFC]/50 text-center max-w-[270px] mt-1.5 leading-relaxed font-normal">
              Enter your pairing code to unlock and bind this secure enclave node.
            </p>

            {/* Connection Status Pill */}
            <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-full bg-[#000000]/60 border border-[#FEFFFC]/[0.08] backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                {status.pulse && (
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: status.color }}
                  />
                )}
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{ backgroundColor: status.color }}
                />
              </span>
              <span
                className="text-[10.5px] font-mono tracking-wider uppercase font-semibold"
                style={{ color: status.color }}
              >
                {status.label}
              </span>
              <span className="text-[#FEFFFC]/20 text-[10px]">•</span>
              <span className="text-[10.5px] font-mono text-[#FEFFFC]/45 truncate max-w-[130px]">
                {nodeInfo?.node_id ? `ID: ${nodeInfo.node_id.slice(0, 8)}` : status.desc}
              </span>
            </div>
          </div>

          {/* ── Conditional Views ── */}
          {/* 1. If Tunnel Starting */}
          {isPaired && !isSessionExpired && tunnelStatus === 'starting' && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl bg-[#000000]/50 border border-[#8116E0]/30 text-center space-y-2">
                <div className="flex justify-center">
                  <RiLoader4Line className="w-6 h-6 text-[#8116E0] animate-spin" />
                </div>
                <div className="text-[13px] font-medium text-[#FEFFFC]">
                  Launching Tunnel Bridge...
                </div>
                <p className="text-[11px] text-[#FEFFFC]/45 max-w-[240px] mx-auto font-mono">
                  Syncing edge keys with central orchestrator (~15s)
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => router.push('/dashboard')}
                type="button"
                className="w-full h-11 rounded-2xl bg-[#131210] hover:bg-[#131210]/90 border border-[#FEFFFC]/[0.12] text-[#FEFFFC]/80 hover:text-[#FEFFFC] text-[13px] font-medium flex items-center justify-center transition-colors"
              >
                Enter Local Dashboard
              </motion.button>
            </div>
          )}

          {/* 2. If Tunnel Failed */}
          {isPaired && !isSessionExpired && tunnelStatus === 'failed' && (
            <div className="space-y-4 py-2">
              <div className="p-3.5 rounded-2xl bg-[#FF4D4D]/10 border border-[#FF4D4D]/25 space-y-1.5 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[#FF6B6B] text-[12px] font-semibold">
                  <RiErrorWarningLine className="w-4 h-4" />
                  <span>Tunnel Start Failure</span>
                </div>
                <p className="text-[11px] text-[#FFB3B3]/80 font-mono truncate px-2">
                  {tunnelError || 'Check Docker daemon & edge connection'}
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={handleRetryTunnel}
                disabled={retryingTunnel}
                type="button"
                className="w-full h-11 rounded-2xl bg-gradient-to-r from-[#8116E0] to-[#510B96] hover:brightness-110 text-[#FEFFFC] font-medium text-[13px] flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(129,22,224,0.4)] disabled:opacity-50"
              >
                {retryingTunnel ? (
                  <>
                    <RiLoader4Line className="w-4 h-4 animate-spin text-[#D0FF00]" />
                    <span>Retrying Bridge...</span>
                  </>
                ) : (
                  <>
                    <RiRestartLine className="w-4 h-4" />
                    <span>Restart Tunnel Service</span>
                  </>
                )}
              </motion.button>

              <button
                onClick={() => router.push('/dashboard')}
                type="button"
                className="w-full text-center text-[11px] text-[#FEFFFC]/40 hover:text-[#FEFFFC]/70 transition-colors"
              >
                Continue locally without tunnel
              </button>
            </div>
          )}

          {/* 3. Primary State: Input Code & Enter Button */}
          {(!isPaired || isSessionExpired) && (
            <form onSubmit={handleAuthorize} className="space-y-4">
              {/* Node Code Input Container */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <label
                    htmlFor="nodeCode"
                    className="text-[11px] font-mono tracking-wider uppercase text-[#FEFFFC]/50"
                  >
                    Node Connection Code
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteCode}
                    className="text-[10.5px] font-mono text-[#D0FF00] hover:underline flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
                  >
                    {isCopied ? (
                      <>
                        <RiCheckLine className="w-3 h-3 text-[#D0FF00]" />
                        <span>Pasted</span>
                      </>
                    ) : (
                      <>
                        <RiClipboardLine className="w-3 h-3" />
                        <span>Paste</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <RiKey2Line className="w-4 h-4 text-[#FEFFFC]/35 group-focus-within:text-[#D0FF00] transition-colors" />
                  </div>

                  <input
                    id="nodeCode"
                    type="text"
                    required
                    maxLength={16}
                    autoComplete="off"
                    spellCheck="false"
                    placeholder="ENTER NODE KEY"
                    value={connectionCode}
                    onChange={(e) => setConnectionCode(e.target.value.toUpperCase())}
                    className="w-full h-12 pl-10 pr-4 rounded-2xl bg-[#000000]/60 border border-[#FEFFFC]/[0.12] focus:border-[#D0FF00]/70 focus:ring-1 focus:ring-[#D0FF00]/40 text-[#FEFFFC] placeholder-[#FEFFFC]/20 text-[14px] font-mono tracking-[0.16em] uppercase outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Error feedback */}
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-[11px] text-[#FF6B6B] bg-[#FF4D4D]/10 border border-[#FF4D4D]/20 rounded-xl px-3 py-2 font-mono flex items-center gap-2 overflow-hidden"
                  >
                    <RiErrorWarningLine className="w-4 h-4 shrink-0 text-[#FF4D4D]" />
                    <span className="truncate">{errorMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Enter CTA Button */}
              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                disabled={submitting || !connectionCode.trim()}
                type="submit"
                className="relative group w-full h-12 rounded-2xl bg-gradient-to-r from-[#8116E0] via-[#680ec2] to-[#8116E0] text-[#FEFFFC] font-medium text-[13.5px] flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(129,22,224,0.45)] hover:shadow-[0_12px_36px_rgba(129,22,224,0.6)] disabled:opacity-45 disabled:pointer-events-none transition-all duration-300 overflow-hidden"
              >
                {/* Button specular light shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FEFFFC]/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

                {submitting ? (
                  <>
                    <RiLoader4Line className="w-4 h-4 animate-spin text-[#D0FF00]" />
                    <span>Connecting Node...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Node</span>
                    <RiArrowRightLine className="w-4 h-4 text-[#D0FF00] group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </motion.button>

              {/* Minimal Helper / Context Link */}
              <div className="pt-2 text-center">
                <a
                  href={CENTRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#FEFFFC]/40 hover:text-[#D0FF00] transition-colors"
                >
                  <span>Need a pairing code? Open Central</span>
                  <RiExternalLinkLine className="w-3 h-3" />
                </a>
              </div>
            </form>
          )}

          {/* Minimal footer metadata */}
          <div className="mt-6 pt-4 border-t border-[#FEFFFC]/[0.06] flex items-center justify-between text-[10px] font-mono text-[#FEFFFC]/30">
            <span>CACHETTE PROTOCOL</span>
            <span className="text-[#D0FF00]/70 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D0FF00]" />
              ENCLAVE SECURE
            </span>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
