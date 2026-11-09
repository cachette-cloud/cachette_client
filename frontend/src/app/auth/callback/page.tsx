'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSessionToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { RiLoader4Line } from 'react-icons/ri';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function processCallback() {
      try {
        // Parse token from URL fragment (#token=...&expires_at=...)
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('token') || params.get('access_token');
        const expiresAt = params.get('expires_at') || params.get('session_token_expires_at');

        if (!token) {
          setError('No authentication token received from Central.');
          return;
        }

        setSessionToken(token, expiresAt);
        // Clean fragment from browser history
        window.history.replaceState(null, '', window.location.pathname);

        // Fetch session with new token to verify authorization and populate user state
        const session = await refreshSession();
        if (!active) return;

        if (session && session.user) {
          router.replace('/dashboard');
        } else {
          setError('Node rejected the Central token or session could not be established.');
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Failed to process authentication callback.');
      }
    }

    processCallback();

    return () => {
      active = false;
    };
  }, [router, refreshSession]);

  return (
    <div className="min-h-screen bg-[#000000] text-[#FEFFFC] flex flex-col items-center justify-center p-4">
      {error ? (
        <div className="p-6 rounded-2xl bg-[#FF4D4D]/10 border border-[#FF4D4D]/20 text-center max-w-sm space-y-3">
          <div className="text-[14px] font-semibold text-[#FF6B6B]">Authentication Failed</div>
          <p className="text-[12px] text-[#FEFFFC]/70 font-mono">{error}</p>
          <button
            onClick={() => router.push('/auth')}
            className="px-4 py-2 rounded-xl bg-[#131210] border border-[#FEFFFC]/20 text-[12px] hover:bg-[#131210]/80"
          >
            Back to Sign In
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <RiLoader4Line className="w-8 h-8 text-[#8116E0] animate-spin" />
          <span className="text-[13px] font-mono text-[#FEFFFC]/60">Authenticating node session...</span>
        </div>
      )}
    </div>
  );
}
