'use client';

import React from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import DriveFileView from '@/components/dashboard/drive-file-view';

export default function RecentPage() {
  const { allFiles, isLoading, refreshDirectory } = useDashboard();

  // Sort files by created_at descending
  const recentFiles = [...allFiles].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.06] shrink-0">
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">Recent</h1>
          <p className="text-[13px] text-zinc-400 mt-0.5">Files accessed and uploaded recently</p>
        </div>
      </div>

      {/* Main Files View */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <DriveFileView
          folders={[]}
          files={recentFiles}
          onFolderClick={(id) => refreshDirectory(id)}
          isLoading={isLoading}
          emptyTitle="No recent files"
          emptySubtitle="Files you upload or view will show up here in chronological order."
        />
      </div>
    </div>
  );
}
