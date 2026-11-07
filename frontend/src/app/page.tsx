'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/dashboard');
      } else {
        router.replace('/auth');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen w-full bg-[#000000] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/80 animate-spin" />
    </div>
  );
}
