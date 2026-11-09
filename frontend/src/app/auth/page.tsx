"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiClaimPairing, setSessionToken } from "@/lib/api";
import CodeSlots from "@/components/ui/CodeSlots";
import LineWaves from "@/components/ui/LineWaves";
import { motion, AnimatePresence } from "motion/react";
import {
  RiLoader4Line,
  RiErrorWarningLine,
  RiClipboardLine,
  RiCheckLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiKeyLine,
  RiKey2Line,
  RiShieldCheckLine,
  RiExternalLinkLine,
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
    nodeInfo,
    isLocalhost,
    refreshSession,
    loginWithToken,
  } = useAuth();

  const [connectionCode, setConnectionCode] = useState("");
  const [slotStatus, setSlotStatus] = useState<"idle" | "error" | "success">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [repairMode, setRepairMode] = useState(false);

  // Subdomain & Edge URL calculation
  const subdomain =
    nodeInfo?.subdomain ||
    (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
      ? window.location.hostname.split(".")[0]
      : "node");
  const edgeDomain = `${subdomain}.cachette.cloud`;
  const edgeUrl = `https://${edgeDomain}`;
  const shortNodeId = nodeInfo?.node_id
    ? nodeInfo.node_id.replace(/-/g, "").slice(0, 8)
    : "9295d8b7";

  // When accessing via Cloudflare tunnel, if authenticated, route immediately to dashboard
  useEffect(() => {
    if (!authLoading && isAuthenticated && !isLocalhost) {
      router.push("/dashboard");
    }
  }, [authLoading, isAuthenticated, isLocalhost, router]);

  // Periodic session refresh
  useEffect(() => {
    if (isAuthenticated) return;
    const intervalMs = isLocal ? 3000 : 8000;
    const interval = setInterval(() => {
      refreshSession();
    }, 4000);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isAuthenticated, isLocal, refreshSession]);

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = connectionCode.trim().toUpperCase();
    if (!cleanCode) return;

      setSubmitting(true);
      setErrorMessage(null);

      try {
        const claimRes = await apiClaimPairing(cleanCode);
        const token = claimRes.session_token || claimRes.token;
        if (token) {
          setSessionToken(token, claimRes.session_token_expires_at);
        }
        setSlotStatus("success");
        await refreshSession();
        setRepairMode(false);
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
    [refreshSession]
  );

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

  const handleSignInWithCentral = () => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const redirectUrl = encodeURIComponent(`${origin}/auth/callback`);
    window.location.href = `${CENTRAL_URL}/login?redirect=${redirectUrl}&node_id=${nodeInfo?.node_id || ""}`;
  };

  const handleOpenEdgeLink = () => {
    if (typeof window === "undefined") return;
    window.location.href = edgeUrl;
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
        <div className="absolute inset-0 bg-radial from-transparent via-[#050507]/60 to-[#050507]" />
      </div>

      {/* ── Top-Left PORTAL Back Link (Image 2) ── */}
      {!isLocalhost && isPaired && !repairMode && !showTokenInput && (
        <a
          href={CENTRAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-5 left-5 sm:top-7 sm:left-7 z-20 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-[11.5px] font-mono text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 shadow-lg backdrop-blur-md"
        >
          <RiArrowLeftLine className="w-3.5 h-3.5" />
          <span>PORTAL</span>
        </a>
      )}

      {/* ── Center Card Panel ── */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[420px] rounded-[32px] p-7 sm:p-9 bg-[#0b0b0e]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.85)] flex flex-col items-center"
      >
        {/* Subtle Diagonal Cut Line Accent at Top-Right */}
        <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden rounded-tr-[32px]">
          <div className="absolute -top-8 -right-8 w-16 h-16 border-b border-l border-white/[0.08] rotate-45 bg-white/[0.01]" />
        </div>

        {/* ── Overlapping Circular Badges (Purple Shield + Lime Key) ── */}
        <div className="relative flex items-center justify-center my-1">
          <div className="absolute inset-0 bg-[#8116E0]/20 blur-2xl rounded-full pointer-events-none" />
          {/* Purple Circle with Shield */}
          <div className="relative z-10 w-12 h-12 rounded-full bg-[#8116E0] border border-white/20 flex items-center justify-center text-white shadow-[0_4px_16px_rgba(129,22,224,0.4)]">
            <RiShieldCheckLine className="w-5 h-5" />
          </div>
          {/* Yellow-Green Circle with Key (Overlapping) */}
          <div className="relative z-20 -ml-3.5 w-12 h-12 rounded-full bg-[#D0FF00] border border-black/20 flex items-center justify-center text-black shadow-[0_4px_16px_rgba(208,255,0,0.4)]">
            <RiKey2Line className="w-5 h-5 -rotate-45" />
          </div>
        </div>

        {/* ── Card Header (Title & Subtitle) ── */}
        <h1 className="text-[24px] sm:text-[26px] font-semibold text-white tracking-tight mt-4 text-center">
          {showTokenInput
            ? "Enter Node Access Token"
            : !isPaired || repairMode
            ? "Enter Pairing Code"
            : isLocalhost
            ? "Node Paired"
            : "Node Authentication"}
        </h1>

        <p className="text-[12.5px] text-zinc-400 text-center max-w-[310px] mt-1.5 leading-relaxed font-normal">
          {showTokenInput
            ? "Paste your Central RS256 node_access JWT Bearer token below."
            : !isPaired || repairMode
            ? "Enter the 6-character node pairing code generated in your Cachette Central console."
            : isLocalhost
            ? "Your node is configured and running natively on this machine."
            : "Node is paired. Sign in with Central to access your node."}
        </p>

        {/* ── Status Pill Badge ── */}
        {isPaired && !repairMode && !showTokenInput && (
          <div className="mt-3.5 flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/60 border border-white/[0.08] backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-[#D0FF00] shadow-[0_0_8px_#D0FF00]" />
            <span className="text-[11px] font-mono font-bold tracking-wider text-[#D0FF00]">
              NODE ONLINE
            </span>
            <span className="text-zinc-600 text-[10px]">•</span>
            <span className="text-[11px] font-mono text-zinc-400">
              {isLocalhost ? `ID: ${shortNodeId}` : "Cluster encrypted"}
            </span>
          </div>
        )}

        {/* ── Error Banner ── */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="w-full mt-4 text-[12px] text-red-300 bg-red-500/15 border border-red-500/25 rounded-2xl p-3 flex items-start gap-2.5"
            >
              <RiErrorWarningLine className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* VIEW 1: LOCALHOST PAIRED STATE (Image 1)                    */}
        {/* ─────────────────────────────────────────────────────────── */}
        {isPaired && isLocalhost && !repairMode && !showTokenInput && (
          <div className="w-full mt-6 space-y-4">
            {/* Inner Dark Card */}
            <div className="w-full rounded-2xl bg-black/40 border border-white/[0.08] p-5 text-center space-y-1.5">
              <h3 className="text-[14px] font-medium text-white">Node Online</h3>
              <p className="text-[12.5px] text-zinc-400 leading-relaxed">
                Tunnel active on{" "}
                <span className="text-[#22c55e] font-mono font-medium">
                  {edgeDomain}
                </span>
                . All users sign in through your edge link.
              </p>
            </div>

            {/* Big Emerald Green CTA Button */}
            <button
              onClick={handleOpenEdgeLink}
              type="button"
              className="w-full h-12 rounded-2xl bg-[#22c55e] hover:bg-[#16a34a] text-black font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(34,197,94,0.35)] hover:shadow-[0_0_32px_rgba(34,197,94,0.5)] cursor-pointer"
            >
              <span>Open Your Node</span>
              <RiArrowRightLine className="w-4 h-4" />
            </button>

            {/* Muted Secondary Developer Links */}
            <div className="flex items-center justify-between pt-1 px-1 text-[11px] font-mono text-zinc-500">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="hover:text-zinc-300 transition-colors flex items-center gap-1"
              >
                <span>Enter local dashboard</span>
                <RiArrowRightLine className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setRepairMode(true)}
                className="hover:text-zinc-300 transition-colors"
              >
                Re-pair Node
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* VIEW 2: REMOTE CLOUD / EDGE TUNNEL AUTH (Image 2)            */}
        {/* ─────────────────────────────────────────────────────────── */}
        {isPaired && !isLocalhost && !repairMode && !showTokenInput && (
          <div className="w-full mt-6 space-y-4">
            {/* Inner Dark Card */}
            <div className="w-full rounded-2xl bg-black/40 border border-white/[0.08] p-5 text-center space-y-1.5">
              <h3 className="text-[14px] font-medium text-white">
                Central Sign-In Required
              </h3>
              <p className="text-[12.5px] text-zinc-400 leading-relaxed">
                This node is paired and secured. Sign in with your Central account
                to access your node.
              </p>
            </div>

            {/* Big Vibrant Purple CTA Button */}
            <button
              onClick={handleSignInWithCentral}
              type="button"
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#9333ea] to-[#7c3aed] hover:from-[#8b5cf6] hover:to-[#6d28d9] text-white font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all shadow-[0_0_28px_rgba(147,51,234,0.45)] hover:shadow-[0_0_36px_rgba(147,51,234,0.65)] cursor-pointer"
            >
              <span>Sign in with Central</span>
              <RiArrowRightLine className="w-4 h-4" />
            </button>

            {/* Muted Secondary Manual Entry Link */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowTokenInput(true);
                  setErrorMessage(null);
                }}
                className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 underline underline-offset-4 transition-colors"
              >
                Paste access token
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* VIEW 3: MANUAL TOKEN ENTRY MODAL                            */}
        {/* ─────────────────────────────────────────────────────────── */}
        {showTokenInput && (
          <div className="w-full mt-6 space-y-3">
            <textarea
              value={manualToken}
              onChange={(e) => {
                setManualToken(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              rows={4}
              placeholder="Paste your node_access JWT Bearer token here..."
              className="w-full p-3 bg-black/50 border border-white/10 rounded-2xl text-[12px] font-mono text-white placeholder-zinc-500 outline-none focus:border-white/30 resize-none"
            />
            <button
              type="button"
              disabled={!manualToken.trim() || submitting}
              onClick={async () => {
                setSubmitting(true);
                setErrorMessage(null);
                try {
                  const success = await loginWithToken(manualToken.trim());
                  if (success) {
                    router.push("/dashboard");
                  } else {
                    setErrorMessage(
                      "Invalid token or audience mismatch. Verify that the token was issued for this node."
                    );
                  }
                } catch (e) {
                  setErrorMessage(
                    e instanceof Error ? e.message : "Authentication failed"
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
              className="w-full h-11 rounded-xl bg-white hover:bg-zinc-200 text-black text-[12.5px] font-medium flex items-center justify-center transition-colors disabled:opacity-40"
            >
              {submitting ? "Verifying Token..." : "Authenticate Token"}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowTokenInput(false);
                  setErrorMessage(null);
                }}
                className="text-[11.5px] text-zinc-500 hover:text-zinc-300 transition-colors font-mono underline underline-offset-4"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* VIEW 4: CODE SLOTS PAIRING (Initial Setup or Re-pair Mode)  */}
        {/* ─────────────────────────────────────────────────────────── */}
        {(!isPaired || repairMode) && !showTokenInput && (
          <div className="w-full mt-6 flex flex-col items-center">
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
          )}

            {/* Action Bar */}
            <div className="mt-5 flex items-center gap-3">
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

            {/* Footer Links */}
            <div className="pt-3 text-center">
              {repairMode ? (
                <button
                  type="button"
                  onClick={() => setRepairMode(false)}
                  className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 underline underline-offset-4"
                >
                  ← Cancel re-pairing
                </button>
              ) : (
                <a
                  href={CENTRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <span>Need a pairing code? Open Central</span>
                  <RiExternalLinkLine className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Card Bottom Footer Metadata ── */}
        <div className="mt-8 pt-4 border-t border-white/[0.05] w-full flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>CACHETTE PROTOCOL</span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D0FF00] shadow-[0_0_6px_#D0FF00]" />
            ENCLAVE SECURE
          </span>
        </div>
      </motion.div>
    </main>
  );
}
