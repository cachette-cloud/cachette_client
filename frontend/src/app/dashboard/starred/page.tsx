'use client';

import React from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import DriveFileView from '@/components/dashboard/drive-file-view';

export default function StarredPage() {
  const { allFiles, folders, starredIds, isLoading, refreshDirectory } = useDashboard();

  const starredFolders = folders.filter((f) => starredIds.has(f.id));
  const starredFiles = allFiles.filter((f) => starredIds.has(f.id));

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.06] shrink-0">
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">Starred</h1>
          <p className="text-[13px] text-zinc-400 mt-0.5">Files and folders marked for quick access</p>
        </div>
      </div>

      {/* Main Files View */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <DriveFileView
          folders={starredFolders}
          files={starredFiles}
          onFolderClick={(id) => refreshDirectory(id)}
          isLoading={isLoading}
          emptyTitle="No starred files or folders"
          emptySubtitle="Add stars to items you want to easily find later."
        />
      </div>
    </div>
  );
}
