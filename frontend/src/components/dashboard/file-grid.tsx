'use client';

import { motion } from 'motion/react';
import type { FileOut, FolderOut } from '@/lib/api';
import {
  RiFolder3Fill,
  RiFileTextLine,
  RiImageLine,
  RiVideoLine,
  RiMusic2Line,
  RiFileZipLine,
  RiFilePdfLine,
  RiFileCodeLine,
  RiDeleteBinLine,
  RiMoreLine,
  RiFileLine,
  RiDownloadCloud2Line,
  RiEditLine,
} from 'react-icons/ri';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FileGridProps {
  folders: FolderOut[];
  files: FileOut[];
  onFolderClick: (folderId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDownloadFile: (fileId: string) => void;
  onRenameFile: (fileId: string, currentName: string) => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  isLoading?: boolean;
}

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

export default function FileGrid({
  folders,
  files,
  onFolderClick,
  onDeleteFile,
  onDeleteFolder,
  onDownloadFile,
  onRenameFile,
  onRenameFolder,
  isLoading,
}: FileGridProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    );
  }

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-16 sm:py-20 px-4">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 sm:mb-5">
          <RiFolder3Fill className="w-6 h-6 sm:w-7 sm:h-7 text-white/15" />
        </div>
        <p className="text-white/40 text-[14px] sm:text-[15px] font-medium mb-1">No files yet</p>
        <p className="text-white/25 text-[12px] sm:text-[13px]">Upload files to get started</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Folders */}
      {folders.length > 0 && (
        <div className="mb-6">
          <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider px-1 mb-2.5 sm:mb-3">
            Folders
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-2.5">
            {folders.map((folder, idx) => (
              <motion.div
                key={folder.id}
                onClick={() => onFolderClick(folder.id)}
                className="flex items-center p-2.5 sm:p-3 rounded-xl border border-white/[0.04] hover:border-white/[0.08] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-200 text-left group cursor-pointer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <RiFolder3Fill className="w-4 h-4 sm:w-5 sm:h-5 text-white/30 group-hover:text-white/50 transition-colors shrink-0" />
                  <span className="text-white/60 text-[12px] sm:text-[13px] font-medium truncate group-hover:text-white/80 transition-colors">
                    {folder.name}
                  </span>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      onClick={(e) => e.stopPropagation()} 
                      aria-label="Folder options"
                      className="p-1 ml-0.5 sm:ml-1 text-white/40 md:text-white/20 hover:text-white/70 transition-colors rounded opacity-90 md:opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <RiMoreLine className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#141414] border-white/[0.08] min-w-[140px]">
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onRenameFolder(folder.id, folder.name); }}
                      className="text-white/80 focus:text-white text-[13px] cursor-pointer"
                    >
                      <RiEditLine className="w-4 h-4 mr-2 text-white/50" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}
                      className="text-red-400/80 focus:text-red-400 text-[13px] cursor-pointer"
                    >
                      <RiDeleteBinLine className="w-4 h-4 mr-2" />
                      Delete Folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div>
          <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider px-1 mb-2.5 sm:mb-3">
            Files
          </p>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_36px] sm:grid-cols-[1fr_90px_110px_36px] md:grid-cols-[1fr_100px_120px_40px] gap-2 sm:gap-4 px-3 sm:px-4 py-2 text-white/25 text-[11px] font-medium uppercase tracking-wider">
            <span>Name</span>
            <span>Size</span>
            <span className="hidden sm:block">Modified</span>
            <span />
          </div>

          <div className="h-px bg-white/[0.04] mb-1" />

          {/* File rows */}
          {files.map((file, idx) => {
            const Icon = getFileIcon(file.content_type);
            return (
              <motion.div
                key={file.id}
                className="grid grid-cols-[1fr_80px_36px] sm:grid-cols-[1fr_90px_110px_36px] md:grid-cols-[1fr_100px_120px_40px] gap-2 sm:gap-4 items-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors group"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.02 }}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Icon className="w-4 h-4 text-white/25 shrink-0" />
                  <span className="text-white/60 text-[12px] sm:text-[13px] truncate" title={file.filename}>
                    {file.filename}
                  </span>
                </div>
                <span className="text-white/30 text-[11px] sm:text-[12px] truncate">
                  {formatBytes(file.size)}
                </span>
                <span className="text-white/25 text-[11px] sm:text-[12px] hidden sm:block truncate">
                  {formatDate(file.created_at)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      aria-label="File options"
                      className="p-1 text-white/40 md:text-white/20 hover:text-white/70 transition-colors rounded opacity-90 md:opacity-0 group-hover:opacity-100"
                    >
                      <RiMoreLine className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#141414] border-white/[0.08] min-w-[140px]">
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onDownloadFile(file.id); }}
                      className="text-white/80 focus:text-white text-[13px] cursor-pointer"
                    >
                      <RiDownloadCloud2Line className="w-4 h-4 mr-2 text-white/50" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onRenameFile(file.id, file.filename); }}
                      className="text-white/80 focus:text-white text-[13px] cursor-pointer"
                    >
                      <RiEditLine className="w-4 h-4 mr-2 text-white/50" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onDeleteFile(file.id); }}
                      className="text-red-400/80 focus:text-red-400 text-[13px] cursor-pointer"
                    >
                      <RiDeleteBinLine className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
