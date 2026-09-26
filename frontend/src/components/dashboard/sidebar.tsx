'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import LogoIcon from '@/assets/logo-icon';
import { Progress } from '@/components/ui/progress';
import { AnimatePresence, motion } from 'motion/react';
import {
  RiFolder3Line,
  RiShareLine,
  RiDeleteBinLine,
  RiShieldCheckLine,
  RiCloseLine,
} from 'react-icons/ri';

interface SidebarProps {
  activeItem?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

const DEFAULT_QUOTA = 5 * 1024 ** 3; // 5 GB fallback

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function Sidebar({ activeItem = 'files', isOpen = false, onClose }: SidebarProps) {
  const { user } = useAuth();

  const quotaBytes = user?.storage_quota_bytes || DEFAULT_QUOTA;
  const storageUsed = user?.storage_used ?? 0;
  const storagePercent = Math.min((storageUsed / quotaBytes) * 100, 100);

  const navItems = [
    { id: 'files', label: 'My Files', icon: RiFolder3Line, href: '/dashboard' },
    { id: 'shared', label: 'Shared', icon: RiShareLine, href: '/dashboard' },
    { id: 'trash', label: 'Trash', icon: RiDeleteBinLine, href: '/dashboard' },
  ];

  const sidebarContent = (
    <>
      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => onClose?.()}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-white/[0.06] text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Storage usage */}
      <div className="px-4 sm:px-5 pb-4">
        <div className="p-3.5 sm:p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2.5 sm:mb-3">
            <span className="text-white/50 text-[12px] font-medium">Storage</span>
            <span className="text-white/30 text-[11px]">
              {storagePercent.toFixed(0)}%
            </span>
          </div>
          <Progress value={storagePercent} className="h-1 mb-2.5 bg-white/[0.06] [&>div]:bg-white/60" />
          <p className="text-white/30 text-[11px]">
            {formatBytes(storageUsed)} of {formatBytes(quotaBytes)}
          </p>
        </div>
      </div>

      {/* Central-issued User section (Read-Only) */}
      <div className="mx-4 sm:mx-5 h-px bg-white/[0.06]" />
      <div className="px-3 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3 px-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <span className="text-indigo-300 text-[11px] font-semibold uppercase">
              {(user?.display_name || 'N').charAt(0)}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-white/80 text-[12px] font-medium truncate">
              {user?.display_name || 'Node Owner'}
            </span>
            <span className="text-white/30 text-[10px] truncate">
              Paired with Central
            </span>
          </div>
        </div>
        <Link
          href="/auth"
          className="p-1.5 text-white/40 hover:text-emerald-400 transition-colors rounded-lg hover:bg-white/[0.04]"
          title="Node Pairing Status"
        >
          <RiShieldCheckLine className="w-4 h-4 text-emerald-400/80" />
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex w-64 h-screen bg-[#0a0a0a] border-r border-white/[0.06] flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoIcon className="size-6 text-white" />
            <span className="text-white text-base font-semibold tracking-tight">Cachette</span>
          </Link>
        </div>

        {/* Separator */}
        <div className="mx-5 h-px bg-white/[0.06]" />

        {sidebarContent}
      </aside>

      {/* Mobile Drawer (visible only on small screens when open) */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />

            {/* Slide-in sidebar panel */}
            <motion.div
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[#0c0c0c] border-r border-white/[0.08] flex flex-col md:hidden shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            >
              {/* Header with Close */}
              <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.06]">
                <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
                  <LogoIcon className="size-6 text-white" />
                  <span className="text-white text-base font-semibold tracking-tight">Cachette</span>
                </Link>
                <button
                  onClick={onClose}
                  aria-label="Close sidebar"
                  className="p-1.5 text-white/50 hover:text-white rounded-lg bg-white/[0.04] border border-white/[0.08]"
                >
                  <RiCloseLine className="w-5 h-5" />
                </button>
              </div>

              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
