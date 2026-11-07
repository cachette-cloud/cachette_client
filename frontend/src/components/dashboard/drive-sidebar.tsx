'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useDashboard } from '@/lib/dashboard-context';
import {
  RiHardDrive2Line,
  RiComputerLine,
  RiGroupLine,
  RiTimeLine,
  RiStarLine,
  RiDeleteBinLine,
  RiAddLine,
  RiFolderAddLine,
  RiUploadCloud2Line,
  RiFolderUploadLine,
  RiCloudLine,
  RiCloseLine,
} from 'react-icons/ri';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const CENTRAL_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || 'https://cachette.cloud';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

interface DriveSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function DriveSidebar({ isOpen = false, onClose }: DriveSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const {
    setNewFolderOpen,
    triggerFileUpload,
    triggerFolderUpload,
  } = useDashboard();

  const quotaBytes = user?.storage_quota_bytes || 5 * 1024 ** 3;
  const storageUsed = user?.storage_used ?? 0;
  const storagePercent = Math.min((storageUsed / quotaBytes) * 100, 100);

  const navItems = [
    {
      id: 'my-drive',
      label: 'My Drive',
      icon: RiHardDrive2Line,
      href: '/dashboard',
      match: pathname === '/dashboard' || pathname.startsWith('/dashboard/folder'),
    },
    {
      id: 'computers',
      label: 'Computers',
      icon: RiComputerLine,
      href: '/dashboard/computers',
      match: pathname === '/dashboard/computers',
    },
    {
      id: 'shared',
      label: 'Shared with me',
      icon: RiGroupLine,
      href: '/dashboard/shared',
      match: pathname === '/dashboard/shared',
    },
    {
      id: 'recent',
      label: 'Recent',
      icon: RiTimeLine,
      href: '/dashboard/recent',
      match: pathname === '/dashboard/recent',
    },
    {
      id: 'starred',
      label: 'Starred',
      icon: RiStarLine,
      href: '/dashboard/starred',
      match: pathname === '/dashboard/starred',
    },
    {
      id: 'trash',
      label: 'Trash',
      icon: RiDeleteBinLine,
      href: '/dashboard/trash',
      match: pathname === '/dashboard/trash',
    },
  ];

  const sidebarBody = (
    <div className="flex flex-col h-full justify-between">
      <div>
        {/* Google Drive "+ New" Action Button */}
        <div className="px-4 py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="group w-full max-w-[140px] h-13 px-5 rounded-2xl bg-white text-zinc-950 hover:bg-zinc-100 shadow-[0_4px_20px_rgba(255,255,255,0.08)] flex items-center gap-3 transition-all duration-200 hover:shadow-xl active:scale-[0.98] cursor-pointer"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <RiAddLine className="w-6 h-6 text-zinc-900 group-hover:rotate-90 transition-transform duration-300" />
                </div>
                <span className="font-medium text-[14px] tracking-tight">New</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 bg-[#121217] border-white/10 p-2 rounded-2xl shadow-2xl"
            >
              <DropdownMenuItem
                onClick={() => {
                  setNewFolderOpen(true);
                  onClose?.();
                }}
                className="text-[13px] py-2.5 px-3 flex items-center gap-3 text-zinc-200 hover:text-white cursor-pointer rounded-xl"
              >
                <RiFolderAddLine className="w-4 h-4 text-zinc-400" />
                <span>New folder</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-white/[0.08] my-1" />

              <DropdownMenuItem
                onClick={() => {
                  triggerFileUpload();
                  onClose?.();
                }}
                className="text-[13px] py-2.5 px-3 flex items-center gap-3 text-zinc-200 hover:text-white cursor-pointer rounded-xl"
              >
                <RiUploadCloud2Line className="w-4 h-4 text-zinc-400" />
                <span>File upload</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  triggerFolderUpload();
                  onClose?.();
                }}
                className="text-[13px] py-2.5 px-3 flex items-center gap-3 text-zinc-200 hover:text-white cursor-pointer rounded-xl"
              >
                <RiFolderUploadLine className="w-4 h-4 text-zinc-400" />
                <span>Folder upload</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation list matching Google Drive */}
        <nav className="px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.match;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => onClose?.()}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-[13.5px] font-medium transition-all duration-150 ${
                  active
                    ? 'bg-white/[0.1] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-zinc-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Storage section at bottom */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5 text-zinc-400 mb-2">
          <RiCloudLine className="w-4 h-4 text-zinc-400" />
          <span className="text-[12.5px] font-medium">Storage</span>
        </div>

        <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-white/70 rounded-full transition-all duration-300"
            style={{ width: `${storagePercent}%` }}
          />
        </div>

        <p className="text-zinc-400 text-[11.5px] mb-2 font-mono">
          {formatBytes(storageUsed)} of {formatBytes(quotaBytes)} used
        </p>

        <a
          href={`${CENTRAL_URL}/pricing`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[11px] font-medium text-zinc-300 hover:text-white underline underline-offset-4 transition-colors"
        >
          Get more storage
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 xl:w-64 h-[calc(100vh-64px)] bg-[#070709] flex-col shrink-0 select-none">
        {sidebarBody}
      </aside>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="relative w-72 max-w-[85vw] h-full bg-[#0d0d12] border-r border-white/10 shadow-2xl flex flex-col z-10">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
              <span className="text-white font-semibold text-[15px]">Menu</span>
              <button
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05]"
              >
                <RiCloseLine className="w-5 h-5" />
              </button>
            </div>
            {sidebarBody}
          </div>
        </div>
      )}
    </>
  );
}

