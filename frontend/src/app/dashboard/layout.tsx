'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardProvider, useDashboard } from '@/lib/dashboard-context';
import DriveHeader from '@/components/dashboard/drive-header';
import DriveSidebar from '@/components/dashboard/drive-sidebar';
import DetailsDrawer from '@/components/dashboard/details-drawer';
import SharedDialogs from '@/components/dashboard/shared-dialogs';
import {
  RiErrorWarningLine,
  RiAlertLine,
  RiExternalLinkLine,
  RiLoader4Line,
} from 'react-icons/ri';
import Link from 'next/link';

const CENTRAL_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || 'https://cachette.cloud';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isPaired, isAuthenticated, isLoading: authLoading, isSessionExpired, isExpiringSoon } = useAuth();
  const { uploading, uploadProgress } = useDashboard();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth guard: redirect to /auth if node is not paired or session is unauthenticated
  useEffect(() => {
    if (!authLoading && (!isPaired || !isAuthenticated)) {
      router.replace('/auth');
    }
  }, [authLoading, isPaired, isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-white/10 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPaired || !isAuthenticated) return null;

  return (
    <div className="flex flex-col h-screen w-full bg-[#070709] text-white overflow-hidden font-sans">
      {/* Google Drive Global Top Header */}
      <DriveHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />

      {/* Main Workspace: Left Sidebar + Rounded Main Canvas + Right Details Drawer */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Left Google Drive Sidebar */}
        <DriveSidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        {/* Main Content Area: Google Drive Rounded Surface with generous padding & margins */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#0c0c10] border border-white/[0.06] rounded-[24px] m-2 sm:m-3 p-4 sm:p-6 overflow-hidden relative shadow-2xl">
          {/* Session Expired Banner */}
          {isSessionExpired && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between gap-3 text-[13px] text-red-200 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <RiErrorWarningLine className="w-4 h-4 text-red-400 shrink-0" />
                <span className="truncate">
                  Session expired — please re-pair this node from the central dashboard.
                </span>
              </div>
              <Link
                href="/auth"
                className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-[12px] font-medium text-white transition-colors shrink-0"
              >
                Re-pair Node
              </Link>
            </div>
          )}

          {/* Expiring Soon Warning Banner */}
          {!isSessionExpired && isExpiringSoon && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 mb-4 flex items-center justify-between gap-3 text-[12px] text-amber-200 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <RiAlertLine className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">
                  Node session token expires within 24 hours. Reconnect from central to ensure uninterrupted access.
                </span>
              </div>
              <a
                href={`${CENTRAL_URL}/dashboard`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline font-medium shrink-0 text-[11px]"
              >
                Central Console
                <RiExternalLinkLine className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Page Children Canvas */}
          <div className="flex-1 min-h-0 flex flex-col overflow-auto">
            {children}
          </div>

          {/* Floating Upload Progress Toast */}
          {uploading && (
            <div className="absolute bottom-6 right-6 z-40 bg-[#16161c] border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-3.5 min-w-[240px]">
              <RiLoader4Line className="w-5 h-5 text-white animate-spin shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-white">Uploading files...</p>
                <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{uploadProgress}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Collapsible Details / Activity Drawer */}
        <DetailsDrawer />
      </div>

      {/* Shared Modals & Hidden Upload Inputs */}
      <SharedDialogs />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  );
}

