'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const router = useRouter();
  const { isPaired, isAuthenticated, isLoading, isLocalhost } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isLocalhost) {
        // On localhost, route to /auth to show Node Paired card (Image 1) or initial pairing
        router.replace('/auth');
      } else if (isAuthenticated) {
        // On edge cloud link, enter dashboard if authenticated
        router.replace('/dashboard');
      } else {
        // Otherwise prompt for Central sign-in (Image 2)
        router.replace('/auth');
      }
    }
  }, [isLocalhost, isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen w-full bg-[#050507] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/80 animate-spin" />
    </div>
  );
}
