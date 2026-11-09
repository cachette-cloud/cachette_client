"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiClaimPairing, setSessionToken } from "@/lib/api";
import DarkVeil from "@/components/ui/DarkVeil";
import {
  RiLoader4Line,
  RiErrorWarningLine,
  RiClipboardLine,
  RiCheckLine,
  RiRestartLine,
  RiArrowRightLine,
} from "react-icons/ri";

const CENTRAL_URL =
  process.env.NEXT_PUBLIC_CENTRAL_URL || "https://cachette.cloud";

export default function SleekAuthPage() {
  const router = useRouter();
  const {
    isPaired,
    needsLogin,
    authError,
    isLoading: authLoading,
    isAuthenticated,
    isSessionExpired,
    tunnelStatus,
    tunnelError,
    restartTunnel,
    refreshSession,
  } = useAuth();

  const [connectionCode, setConnectionCode] = useState("");
  const [slotStatus, setSlotStatus] = useState<"idle" | "error" | "success">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [retryingTunnel, setRetryingTunnel] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      setIsLocal(host === "localhost" || host === "127.0.0.1" || host === "[::1]");
    }
  }, []);

  // Card 3D tilt and refraction physics
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  // Redirect to dashboard immediately if authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  // Periodic heartbeat session sync
  useEffect(() => {
    if (isAuthenticated) return;
    const interval = setInterval(() => {
      refreshSession();
    }, 3000);
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
      await refreshSession();
    } catch (err: any) {
      setErrorMessage(
        err?.detail ||
          err?.message ||
          "Invalid or expired node connection code.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const clean = text.trim().toUpperCase().slice(0, 6);
        setConnectionCode(clean);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 1500);
        if (clean.length === 6) {
          submitCode(clean);
        }
      }
    } catch {
      // Clipboard denied or unsupported
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

  return (
    <main className="relative min-h-[100dvh] w-full bg-[#050507] text-[#f4f4f5] flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden select-none font-sans">
      {/* ── Background WebGL Waves (React Bits <LineWaves />) ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden opacity-45">
        <LineWaves
          color1="#71717a"
          color2="#3f3f46"
          color3="#18181b"
          speed={0.2}
          lineCount={68}
          lineWidth={1.2}
          highlight={0.8}
          warpIntensity={0.85}
          rotation={-32}
          enableMouseInteraction={false}
          clickRipple={false}
          intro={false}
        />
        {/* Subtle vignette darkening towards edges */}
        <div className="absolute inset-0 bg-radial from-transparent via-[#050507]/60 to-[#050507]" />
      </div>

      {/* ── Center Sleek Modal / Panel (Inspired by image) ── */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[400px] sm:max-w-[420px] rounded-[32px] p-7 sm:p-9 bg-[#0b0b0e]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.85)] flex flex-col items-center"
      >
        {/* Top Circular Graphic Area with ShapeBlur Logo Effect */}
        <div className="relative w-44 h-44 sm:w-48 sm:h-48 rounded-full overflow-hidden border border-white/[0.09] bg-[#020203] shadow-[inset_0_0_28px_rgba(0,0,0,0.95)] flex items-center justify-center">
          <ShapeBlur
            src="/logo.png"
            size={0.65}
            fill={true}
            color="#ffffff"
            blur={15}
            lensSize={0.3}
            lensSoftness={0.7}
            chroma={0.12}
            idle={true}
            className="w-full h-full"
          />
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-[25px] sm:text-[27px] font-semibold text-white tracking-tight mt-6 text-center">
          Enter the code
        </h1>
        <p className="text-[13px] text-zinc-400 text-center max-w-[280px] mt-2 leading-relaxed font-normal">
          We sent you a code to your email, please enter to verify your address.
        </p>

        {/* ── Tunnel Starting View ── */}
        {isPaired && !isSessionExpired && tunnelStatus === "starting" && (
          <div className="w-full mt-6 space-y-3">
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
              <div className="flex justify-center">
                <RiLoader4Line className="w-5 h-5 text-zinc-300 animate-spin" />
              </div>
              <div className="text-[13px] font-medium text-white">
                Launching Tunnel Bridge...
              </div>
            </motion.div>

            {/* Title & Minimalist Context */}
            <h1 className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-[#FEFFFC] text-center">
              {isPaired ? (isLocal ? "Node Paired" : "Node Authentication") : "Pair Node"}
            </h1>
            <p className="text-[12px] text-[#FEFFFC]/50 text-center max-w-[270px] mt-1.5 leading-relaxed font-normal">
              {isPaired
                ? (isLocal
                    ? "Your node is configured and running natively on this machine."
                    : "Node is paired. Sign in with Central to access your node.")
                : "Enter your pairing code to unlock and bind this secure enclave node."}
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
                {nodeInfo?.node_id
                  ? `ID: ${nodeInfo.node_id.slice(0, 8)}`
                  : status.desc}
              </span>
            </div>

          {/* ── Conditional Views ── */}
          {/* 1. Localhost Paired View */}
          {isPaired && isLocal && (
            <div className="space-y-4 py-2">
              {tunnelStatus === "failed" ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-[#FF4D4D]/10 border border-[#FF4D4D]/25 space-y-1.5 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[#FF6B6B] text-[12px] font-semibold">
                      <RiErrorWarningLine className="w-4 h-4" />
                      <span>Tunnel Start Failure</span>
                    </div>
                    <p className="text-[11px] text-[#FFB3B3]/80 font-mono truncate px-2">
                      {tunnelError || "Check network & tunnel connection"}
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
                </div>
              ) : tunnelReady && nodeInfo?.subdomain ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#000000]/50 border border-[#22c55e]/30 text-center space-y-2">
                    <div className="text-[14px] font-semibold text-[#FEFFFC]">
                      Node Online
                    </div>
                    <p className="text-[11.5px] text-[#FEFFFC]/60 max-w-[260px] mx-auto leading-relaxed">
                      Tunnel active on <span className="font-mono text-[#22c55e]">{nodeInfo.subdomain}.cachette.cloud</span>. All users sign in through your edge link.
                    </p>
                  </div>

                  <motion.a
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    href={`https://${nodeInfo.subdomain}.cachette.cloud`}
                    className="relative group w-full h-12 rounded-2xl bg-gradient-to-r from-[#22c55e] via-[#16a34a] to-[#22c55e] text-[#FEFFFC] font-medium text-[13.5px] flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(34,197,94,0.35)] hover:shadow-[0_12px_36px_rgba(34,197,94,0.5)] transition-all duration-300"
                  >
                    <span>Open Your Node</span>
                    <RiArrowRightLine className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
                  </motion.a>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-[#000000]/50 border border-[#8116E0]/30 text-center space-y-3">
                  <div className="flex justify-center">
                    <RiLoader4Line className="w-7 h-7 text-[#D0FF00] animate-spin" />
                  </div>
                  <div className="text-[14px] font-semibold text-[#FEFFFC]">
                    Starting tunnel...
                  </div>
                  <p className="text-[11px] text-[#FEFFFC]/50 max-w-[250px] mx-auto font-mono">
                    Waiting for Cloudflare tunnel connection. The launch button will appear automatically.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 2. Remote Paired View: Sign In via Central */}
          {isPaired && !isLocal && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl bg-[#000000]/50 border border-[#8116E0]/30 text-center space-y-2">
                <div className="text-[14px] font-semibold text-[#FEFFFC]">
                  Central Sign-In Required
                </div>
                <p className="text-[11.5px] text-[#FEFFFC]/60 max-w-[260px] mx-auto leading-relaxed">
                  This node is paired and secured. Sign in with your Central account to access your node.
                </p>
              </div>

              {authError && (
                <div className="text-[11px] text-[#FF6B6B] bg-[#FF4D4D]/10 border border-[#FF4D4D]/20 rounded-xl px-3 py-2 font-mono flex items-center gap-2">
                  <RiErrorWarningLine className="w-4 h-4 shrink-0 text-[#FF4D4D]" />
                  <span>{authError}</span>
                </div>
              )}

              <motion.a
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                href={`${CENTRAL_URL}/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "")}`}
                className="relative group w-full h-12 rounded-2xl bg-gradient-to-r from-[#8116E0] via-[#680ec2] to-[#8116E0] text-[#FEFFFC] font-medium text-[13.5px] flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(129,22,224,0.45)] hover:shadow-[0_12px_36px_rgba(129,22,224,0.6)] transition-all duration-300"
              >
                <span>Sign in with Central</span>
                <RiArrowRightLine className="w-4 h-4 text-[#D0FF00] group-hover:translate-x-1 transition-transform" />
              </motion.a>
            </div>
          )}

          {/* 3. Unpaired Remote Notice */}
          {!isPaired && !isLocal && (
            <div className="p-4 rounded-2xl bg-[#000000]/50 border border-white/10 text-center space-y-2 py-4">
              <div className="text-[13px] font-medium text-[#FEFFFC]">
                Local Pairing Required
              </div>
              <p className="text-[11.5px] text-[#FEFFFC]/50 max-w-[260px] mx-auto leading-relaxed">
                Initial node pairing can only be claimed locally on the host machine at <span className="font-mono text-[#D0FF00]">http://localhost:3000</span>.
              </p>
            </div>

          {/* 4. Unpaired Localhost State: Input Code & Enter Button */}
          {!isPaired && isLocal && (
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
                    className="text-[11.5px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <RiCheckLine className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Pasted</span>
                      </>
                    ) : (
                      <>
                        <RiClipboardLine className="w-3 h-3" />
                        <span>Paste code</span>
                      </>
                    )}
                  </button>

                  {connectionCode.length === 6 && (
                    <button
                      type="button"
                      onClick={() => submitCode(connectionCode)}
                      className="text-[11.5px] font-mono text-white hover:text-zinc-200 flex items-center gap-1 px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors"
                    >
                      <span>Submit</span>
                      <RiArrowRightLine className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer: "Need Help? Contact us" matching the image */}
        <div className="mt-8 pt-2 text-center">
          <p className="text-[12.5px] text-zinc-500">
            Need Help?{" "}
            <a
              href={CENTRAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 hover:text-white underline underline-offset-4 transition-colors font-medium"
            >
              Contact us
            </a>
          </p>
        </div>

        {/* Bottom subtle metadata */}
        <div className="mt-6 pt-4 border-t border-white/[0.05] w-full flex items-center justify-between text-[10px] font-mono text-zinc-600">
          <span>CACHETTE PROTOCOL</span>
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
            ENCLAVE SECURE
          </span>
        </div>
      </motion.div>
    </main>
  );
}
