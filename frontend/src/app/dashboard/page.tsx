'use client';

import React from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import DriveFileView from '@/components/dashboard/drive-file-view';
import {
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiListCheck2,
  RiGridFill,
  RiInformationLine,
  RiFolderAddLine,
  RiUploadCloud2Line,
  RiEditLine,
  RiDeleteBinLine,
} from 'react-icons/ri';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function MyDrivePage() {
  const {
    breadcrumbs,
    currentFolderId,
    refreshDirectory,
    folders,
    files,
    isLoading,
    searchQuery,
    viewMode,
    setViewMode,
    detailsOpen,
    setDetailsOpen,
    setNewFolderOpen,
    triggerFileUpload,
    openRenameDialog,
    openDeleteDialog,
  } = useDashboard();

  // Search filtering
  const query = searchQuery.toLowerCase().trim();
  const filteredFolders = folders.filter((f) => f.name.toLowerCase().includes(query));
  const filteredFiles = files.filter((f) => f.filename.toLowerCase().includes(query));

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Google Drive Subheader / Breadcrumbs & View Toggle Bar */}
      <div className="flex items-center justify-between gap-3 pb-4 mb-2 border-b border-white/[0.06] shrink-0">
        {/* Left: Breadcrumbs with Folder Action Dropdown */}
        <div className="flex items-center gap-1.5 text-[15px] font-medium min-w-0">
          <button
            onClick={() => refreshDirectory(null)}
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1 transition-colors ${
              currentFolderId === null
                ? 'text-white font-semibold bg-white/[0.05]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <span>My Drive</span>
          </button>

          {breadcrumbs.map((item, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={item.id || idx}>
                <RiArrowRightSLine className="w-4 h-4 text-zinc-600 shrink-0" />
                {isLast ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-semibold transition-colors">
                        <span className="truncate max-w-[200px]">{item.name}</span>
                        <RiArrowDownSLine className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48 bg-[#121217] border-white/10 p-1.5 rounded-2xl shadow-2xl">
                      <DropdownMenuItem onClick={() => setNewFolderOpen(true)} className="text-[12.5px] cursor-pointer">
                        <RiFolderAddLine className="w-4 h-4 mr-2" />
                        <span>New folder</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={triggerFileUpload} className="text-[12.5px] cursor-pointer">
                        <RiUploadCloud2Line className="w-4 h-4 mr-2" />
                        <span>Upload files</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
                      <DropdownMenuItem
                        onClick={() => openRenameDialog('folder', item.id!, item.name)}
                        className="text-[12.5px] cursor-pointer"
                      >
                        <RiEditLine className="w-4 h-4 mr-2" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog('folder', item.id!, item.name)}
                        className="text-[12.5px] text-red-400 cursor-pointer"
                      >
                        <RiDeleteBinLine className="w-4 h-4 mr-2" />
                        <span>Delete folder</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <button
                    onClick={() => refreshDirectory(item.id)}
                    className="text-zinc-400 hover:text-white px-2 py-1 rounded-xl hover:bg-white/[0.04] transition-colors truncate max-w-[150px]"
                  >
                    {item.name}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right: View Toggle (List / Grid) & Details Panel Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* List vs Grid View Toggle */}
          <div className="flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <RiListCheck2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <RiGridFill className="w-4 h-4" />
            </button>
          </div>

          {/* Details / Activity Drawer Toggle (Google Drive 'i' button) */}
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            title="View details"
            className={`p-2 rounded-xl transition-colors ${
              detailsOpen
                ? 'bg-white/[0.1] text-white border border-white/10'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <RiInformationLine className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main File View (List Table or Grid Tiles) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <DriveFileView
          folders={filteredFolders}
          files={filteredFiles}
          onFolderClick={(folderId) => refreshDirectory(folderId)}
          isLoading={isLoading}
          emptyTitle={query ? 'No matching files or folders' : 'Drop files here or use the "+ New" button'}
          emptySubtitle={query ? `No items found matching "${query}"` : 'Files you upload will appear here in your secure enclave.'}
        />
      </div>
    </div>
  );
}
