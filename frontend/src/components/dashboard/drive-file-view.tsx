'use client';

import React from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import type { FileOut, FolderOut } from '@/lib/api';
import {
  RiFolder3Fill,
  RiFileLine,
  RiImageLine,
  RiVideoLine,
  RiMusic2Line,
  RiFileZipLine,
  RiFilePdfLine,
  RiFileCodeLine,
  RiFileTextLine,
  RiDownloadCloud2Line,
  RiShareForwardLine,
  RiStarLine,
  RiStarFill,
  RiEditLine,
  RiDeleteBinLine,
  RiMore2Fill,
  RiFolderAddLine,
  RiUploadCloud2Line,
} from 'react-icons/ri';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function getFileIcon(contentType: string | null) {
  if (!contentType) return RiFileLine;
  if (contentType.startsWith('image/')) return RiImageLine;
  if (contentType.startsWith('video/')) return RiVideoLine;
  if (contentType.startsWith('audio/')) return RiMusic2Line;
  if (contentType === 'application/pdf') return RiFilePdfLine;
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('rar')) return RiFileZipLine;
  if (contentType.includes('text/') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript')) return RiFileCodeLine;
  return RiFileTextLine;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Google Drive folder accent colors
const FOLDER_COLORS = [
  'text-amber-400',
  'text-blue-400',
  'text-emerald-400',
  'text-purple-400',
  'text-rose-400',
  'text-teal-400',
];

interface DriveFileViewProps {
  folders: FolderOut[];
  files: FileOut[];
  onFolderClick: (folderId: string) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export default function DriveFileView({
  folders,
  files,
  onFolderClick,
  isLoading,
  emptyTitle = 'No files or folders',
  emptySubtitle = 'Upload a file or create a folder to get started',
}: DriveFileViewProps) {
  const {
    viewMode,
    selectedItem,
    setSelectedItem,
    setDetailsOpen,
    downloadFile,
    openShareModal,
    openRenameDialog,
    openDeleteDialog,
    toggleStar,
    isStarred,
    setNewFolderOpen,
    triggerFileUpload,
  } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-4">
        <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-4">
          <RiFolder3Fill className="w-8 h-8 text-zinc-600" />
        </div>
        <p className="text-white text-[15px] font-medium mb-1">{emptyTitle}</p>
        <p className="text-zinc-500 text-[13px] max-w-sm mb-6">{emptySubtitle}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNewFolderOpen(true)}
            className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white text-[12.5px] font-medium flex items-center gap-2 transition-colors"
          >
            <RiFolderAddLine className="w-4 h-4" />
            <span>New folder</span>
          </button>
          <button
            onClick={triggerFileUpload}
            className="px-4 py-2 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-[12.5px] font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <RiUploadCloud2Line className="w-4 h-4" />
            <span>Upload file</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── LIST VIEW (Google Drive Table Layout) ───
  if (viewMode === 'list') {
    return (
      <div className="w-full select-none overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[650px]">
          {/* Table Header */}
          <thead>
            <tr className="border-b border-white/[0.06] text-[12px] font-medium text-zinc-400">
              <th className="py-2.5 px-4 font-medium w-[45%]">Name</th>
              <th className="py-2.5 px-4 font-medium w-[20%] hidden sm:table-cell">Owner</th>
              <th className="py-2.5 px-4 font-medium w-[18%] hidden md:table-cell">Last modified</th>
              <th className="py-2.5 px-4 font-medium w-[12%]">File size</th>
              <th className="py-2.5 px-2 font-medium w-[5%] text-right"></th>
            </tr>
          </thead>

          <tbody>
            {/* Folders */}
            {folders.map((folder, idx) => {
              const isSelected = selectedItem?.type === 'folder' && selectedItem.data.id === folder.id;
              const folderColor = FOLDER_COLORS[idx % FOLDER_COLORS.length];
              return (
                <tr
                  key={folder.id}
                  onClick={() => {
                    setSelectedItem({ type: 'folder', data: folder });
                  }}
                  onDoubleClick={() => onFolderClick(folder.id)}
                  className={`group border-b border-white/[0.03] transition-colors cursor-pointer text-[13px] ${
                    isSelected
                      ? 'bg-white/[0.08] text-white'
                      : 'hover:bg-white/[0.03] text-zinc-200'
                  }`}
                >
                  <td className="py-3 px-4 flex items-center gap-3">
                    <RiFolder3Fill className={`w-5 h-5 shrink-0 ${folderColor}`} />
                    <span className="font-medium truncate max-w-[280px] sm:max-w-md">
                      {folder.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(folder.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:scale-110 transition-opacity ml-1 text-zinc-400 hover:text-amber-400"
                    >
                      {isStarred(folder.id) ? (
                        <RiStarFill className="w-3.5 h-3.5 text-amber-400 !opacity-100" />
                      ) : (
                        <RiStarLine className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>

                  <td className="py-3 px-4 text-zinc-400 text-[12px] hidden sm:table-cell">
                    me
                  </td>

                  <td className="py-3 px-4 text-zinc-400 text-[12px] hidden md:table-cell font-mono">
                    {formatDate(folder.created_at)}
                  </td>

                  <td className="py-3 px-4 text-zinc-500 text-[12px] font-mono">
                    —
                  </td>

                  <td className="py-3 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Hover Actions */}
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openRenameDialog('folder', folder.id, folder.name);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08]"
                          title="Rename"
                        >
                          <RiEditLine className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog('folder', folder.id, folder.name);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-white/[0.08]"
                          title="Delete"
                        >
                          <RiDeleteBinLine className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Dropdown Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08]"
                          >
                            <RiMore2Fill className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-[#121217] border-white/10 p-1.5 rounded-2xl shadow-2xl">
                          <DropdownMenuItem
                            onClick={() => onFolderClick(folder.id)}
                            className="text-[12.5px] cursor-pointer"
                          >
                            Open folder
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedItem({ type: 'folder', data: folder });
                              setDetailsOpen(true);
                            }}
                            className="text-[12.5px] cursor-pointer"
                          >
                            Folder details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleStar(folder.id)}
                            className="text-[12.5px] cursor-pointer"
                          >
                            {isStarred(folder.id) ? 'Remove from Starred' : 'Add to Starred'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openRenameDialog('folder', folder.id, folder.name)}
                            className="text-[12.5px] cursor-pointer"
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog('folder', folder.id, folder.name)}
                            className="text-[12.5px] text-red-400 cursor-pointer"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Files */}
            {files.map((file) => {
              const isSelected = selectedItem?.type === 'file' && selectedItem.data.id === file.id;
              const Icon = getFileIcon(file.content_type);
              return (
                <tr
                  key={file.id}
                  onClick={() => {
                    setSelectedItem({ type: 'file', data: file });
                  }}
                  onDoubleClick={() => downloadFile(file.id)}
                  className={`group border-b border-white/[0.03] transition-colors cursor-pointer text-[13px] ${
                    isSelected
                      ? 'bg-white/[0.08] text-white'
                      : 'hover:bg-white/[0.03] text-zinc-200'
                  }`}
                >
                  <td className="py-3 px-4 flex items-center gap-3">
                    <Icon className="w-5 h-5 text-zinc-300 shrink-0" />
                    <span className="font-medium truncate max-w-[280px] sm:max-w-md">
                      {file.filename}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(file.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:scale-110 transition-opacity ml-1 text-zinc-400 hover:text-amber-400"
                    >
                      {isStarred(file.id) ? (
                        <RiStarFill className="w-3.5 h-3.5 text-amber-400 !opacity-100" />
                      ) : (
                        <RiStarLine className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>

                  <td className="py-3 px-4 text-zinc-400 text-[12px] hidden sm:table-cell">
                    me
                  </td>

                  <td className="py-3 px-4 text-zinc-400 text-[12px] hidden md:table-cell font-mono">
                    {formatDate(file.created_at)}
                  </td>

                  <td className="py-3 px-4 text-zinc-400 text-[12px] font-mono">
                    {formatBytes(file.size)}
                  </td>

                  <td className="py-3 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Hover Actions */}
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(file.id);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08]"
                          title="Download"
                        >
                          <RiDownloadCloud2Line className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openShareModal(file);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08]"
                          title="Share link"
                        >
                          <RiShareForwardLine className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openRenameDialog('file', file.id, file.filename);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08]"
                          title="Rename"
                        >
                          <RiEditLine className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog('file', file.id, file.filename);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-white/[0.08]"
                          title="Delete"
                        >
                          <RiDeleteBinLine className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Dropdown Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08]"
                          >
                            <RiMore2Fill className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-[#121217] border-white/10 p-1.5 rounded-2xl shadow-2xl">
                          <DropdownMenuItem
                            onClick={() => downloadFile(file.id)}
                            className="text-[12.5px] cursor-pointer"
                          >
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openShareModal(file)}
                            className="text-[12.5px] cursor-pointer"
                          >
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedItem({ type: 'file', data: file });
                              setDetailsOpen(true);
                            }}
                            className="text-[12.5px] cursor-pointer"
                          >
                            File details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleStar(file.id)}
                            className="text-[12.5px] cursor-pointer"
                          >
                            {isStarred(file.id) ? 'Remove from Starred' : 'Add to Starred'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openRenameDialog('file', file.id, file.filename)}
                            className="text-[12.5px] cursor-pointer"
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog('file', file.id, file.filename)}
                            className="text-[12.5px] text-red-400 cursor-pointer"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ─── GRID VIEW ───
  return (
    <div className="space-y-6 select-none">
      {/* Folders */}
      {folders.length > 0 && (
        <div>
          <h3 className="text-zinc-400 text-[12px] font-medium uppercase tracking-wider mb-3 px-1">
            Folders
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {folders.map((folder, idx) => {
              const isSelected = selectedItem?.type === 'folder' && selectedItem.data.id === folder.id;
              const folderColor = FOLDER_COLORS[idx % FOLDER_COLORS.length];
              return (
                <div
                  key={folder.id}
                  onClick={() => setSelectedItem({ type: 'folder', data: folder })}
                  onDoubleClick={() => onFolderClick(folder.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 group ${
                    isSelected
                      ? 'bg-white/[0.08] border-white/20 shadow-md'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <RiFolder3Fill className={`w-5 h-5 shrink-0 ${folderColor}`} />
                    <span className="text-white text-[13px] font-medium truncate">
                      {folder.name}
                    </span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition-opacity"
                      >
                        <RiMore2Fill className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 bg-[#121217] border-white/10 p-1.5 rounded-2xl shadow-2xl">
                      <DropdownMenuItem onClick={() => onFolderClick(folder.id)} className="text-[12px]">
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openRenameDialog('folder', folder.id, folder.name)} className="text-[12px]">
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleStar(folder.id)} className="text-[12px]">
                        {isStarred(folder.id) ? 'Unstar' : 'Star'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
                      <DropdownMenuItem onClick={() => openDeleteDialog('folder', folder.id, folder.name)} className="text-[12px] text-red-400">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div>
          <h3 className="text-zinc-400 text-[12px] font-medium uppercase tracking-wider mb-3 px-1">
            Files
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {files.map((file) => {
              const isSelected = selectedItem?.type === 'file' && selectedItem.data.id === file.id;
              const Icon = getFileIcon(file.content_type);
              return (
                <div
                  key={file.id}
                  onClick={() => setSelectedItem({ type: 'file', data: file })}
                  onDoubleClick={() => downloadFile(file.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                    isSelected
                      ? 'bg-white/[0.08] border-white/20 shadow-md'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/15'
                  }`}
                >
                  {/* Top file type banner */}
                  <div className="h-24 rounded-xl bg-black/40 border border-white/[0.04] flex items-center justify-center mb-2.5">
                    <Icon className="w-10 h-10 text-zinc-400 group-hover:scale-110 transition-transform" />
                  </div>

                  {/* Title and metadata */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-[12.5px] font-medium truncate" title={file.filename}>
                        {file.filename}
                      </p>
                      <p className="text-zinc-500 text-[11px] font-mono mt-0.5">
                        {formatBytes(file.size)}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition-opacity"
                        >
                          <RiMore2Fill className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 bg-[#121217] border-white/10 p-1.5 rounded-2xl shadow-2xl">
                        <DropdownMenuItem onClick={() => downloadFile(file.id)} className="text-[12px]">
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openShareModal(file)} className="text-[12px]">
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRenameDialog('file', file.id, file.filename)} className="text-[12px]">
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStar(file.id)} className="text-[12px]">
                          {isStarred(file.id) ? 'Unstar' : 'Star'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
                        <DropdownMenuItem onClick={() => openDeleteDialog('file', file.id, file.filename)} className="text-[12px] text-red-400">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

