"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiClaimPairing } from "@/lib/api";
import ShapeBlur from "@/components/ui/ShapeBlur";
import CodeSlots from "@/components/ui/CodeSlots";
import LineWaves from "@/components/ui/LineWaves";
import { motion, AnimatePresence } from "motion/react";
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

  const submitCode = useCallback(
    async (rawCode: string) => {
      const cleanCode = rawCode.trim().toUpperCase();
      if (!cleanCode || cleanCode.length < 6) return;

      setSubmitting(true);
      setErrorMessage(null);

      try {
        await apiClaimPairing(cleanCode);
        setSlotStatus("success");
        const session = await refreshSession();
        setTimeout(() => {
          if (
            session?.paired &&
            (session?.tunnel_ready || session?.tunnel_status === "ready")
          ) {
            router.push("/dashboard");
          } else {
            router.push("/dashboard");
          }
        }, 700);
      } catch (err: unknown) {
        setSlotStatus("error");
        const msg =
          err && typeof err === "object" && "detail" in err
            ? String((err as { detail: unknown }).detail)
            : err instanceof Error
            ? err.message
            : "Invalid or expired code. Please verify and try again.";
        setErrorMessage(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [refreshSession, router]
  );

  const handleCodeChange = (code: string) => {
    setConnectionCode(code);
    if (slotStatus !== "idle") setSlotStatus("idle");
    if (errorMessage) setErrorMessage(null);
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
              <p className="text-[11px] text-zinc-500 font-mono">
                Syncing keys with central orchestrator
              </p>
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              type="button"
              className="w-full h-11 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[13px] font-medium flex items-center justify-center transition-colors"
            >
              Enter Local Dashboard
            </button>
          </div>
        )}

        {/* ── Tunnel Failed View ── */}
        {isPaired && !isSessionExpired && tunnelStatus === "failed" && (
          <div className="w-full mt-6 space-y-3">
            <div className="p-3.5 rounded-2xl bg-red-950/20 border border-red-900/30 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-red-400 text-[12px] font-medium">
                <RiErrorWarningLine className="w-4 h-4" />
                <span>Tunnel Bridge Offline</span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono truncate px-2">
                {tunnelError || "Check network connection"}
              </p>
            </div>

            <button
              onClick={handleRetryTunnel}
              disabled={retryingTunnel}
              type="button"
              className="w-full h-11 rounded-2xl bg-white hover:bg-zinc-200 text-black font-medium text-[13px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {retryingTunnel ? (
                <>
                  <RiLoader4Line className="w-4 h-4 animate-spin" />
                  <span>Retrying Bridge...</span>
                </>
              ) : (
                <>
                  <RiRestartLine className="w-4 h-4" />
                  <span>Restart Tunnel</span>
                </>
              )}
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              type="button"
              className="w-full text-center text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Continue locally without tunnel
            </button>
          </div>
        )}

        {/* ── Primary Auth State: Code Slots ── */}
        {(!isPaired || isSessionExpired) && (
          <div className="w-full mt-7 flex flex-col items-center">
            {/* React Bits <CodeSlots /> */}
            <div className="flex justify-center">
              <CodeSlots
                length={6}
                value={connectionCode}
                status={slotStatus}
                onChange={handleCodeChange}
                onComplete={submitCode}
                accentColor="#f4f4f5"
                inkColor="#f4f4f5"
                slotColor="#16161a"
                digitColor="#09090b"
                dangerColor="#ef4444"
                slotSize={46}
                gap={8}
                radius={12}
                bounce={0.2}
                settle={0.3}
                rise={8}
                cascade={20}
                autoFocus={true}
              />
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mt-3 text-[11.5px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-center"
                >
                  <RiErrorWarningLine className="w-3.5 h-3.5 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submitting Feedback or Manual Action Bar */}
            <div className="mt-4 flex items-center gap-3">
              {submitting ? (
                <div className="flex items-center gap-2 text-[12px] text-zinc-400 font-mono py-1">
                  <RiLoader4Line className="w-3.5 h-3.5 animate-spin text-zinc-200" />
                  <span>Verifying code...</span>
                </div>
              ) : (
                <>
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
