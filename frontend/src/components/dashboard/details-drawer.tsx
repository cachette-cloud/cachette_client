'use client';

import React from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import {
  RiCloseLine,
  RiFolder3Fill,
  RiDownloadCloud2Line,
  RiShareForwardLine,
  RiStarLine,
  RiStarFill,
  RiEditLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiCheckLine,
  RiFileLine,
  RiImageLine,
  RiVideoLine,
  RiMusic2Line,
  RiFileZipLine,
  RiFilePdfLine,
  RiFileCodeLine,
  RiFileTextLine,
  RiExternalLinkLine,
} from 'react-icons/ri';
import { useState } from 'react';

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
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DetailsDrawer() {
  const {
    detailsOpen,
    setDetailsOpen,
    selectedItem,
    downloadFile,
    openShareModal,
    openRenameDialog,
    openDeleteDialog,
    toggleStar,
    isStarred,
    knownShares,
  } = useDashboard();

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  if (!detailsOpen) return null;

  const file = selectedItem?.type === 'file' ? selectedItem.data : null;
  const folder = selectedItem?.type === 'folder' ? selectedItem.data : null;

  const copyShare = (url: string, slug: string) => {
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1800);
  };

  const fileShare = file ? knownShares[file.id] : null;

  return (
    <aside className="w-80 xl:w-88 border-l border-white/[0.06] bg-[#09090c] flex flex-col h-full shrink-0 select-none overflow-y-auto z-10 transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-white">
            {file ? 'File Details' : folder ? 'Folder Details' : 'Details'}
          </span>
        </div>
        <button
          onClick={() => setDetailsOpen(false)}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05] transition-colors"
        >
          <RiCloseLine className="w-4 h-4" />
        </button>
      </div>

      {selectedItem ? (
        <div className="p-5 space-y-6">
          {/* Top Preview Card */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            {file ? (
              (() => {
                const Icon = getFileIcon(file.content_type);
                return <Icon className="w-14 h-14 text-zinc-300 mb-3" />;
              })()
            ) : (
              <RiFolder3Fill className="w-14 h-14 text-zinc-400 mb-3" />
            )}
            <h3 className="text-white text-[14px] font-semibold text-center break-all px-2">
              {file ? file.filename : folder?.name}
            </h3>
            {file && (
              <p className="text-zinc-500 text-[11.5px] mt-1 font-mono">
                {formatBytes(file.size)}
              </p>
            )}
          </div>

          {/* Quick Action Toolbar */}
          <div className="grid grid-cols-4 gap-2">
            {file && (
              <>
                <button
                  onClick={() => downloadFile(file.id)}
                  title="Download"
                  className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-colors"
                >
                  <RiDownloadCloud2Line className="w-4 h-4" />
                  <span className="text-[10px]">Download</span>
                </button>

                <button
                  onClick={() => openShareModal(file)}
                  title="Share"
                  className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-colors"
                >
                  <RiShareForwardLine className="w-4 h-4" />
                  <span className="text-[10px]">Share</span>
                </button>
              </>
            )}

            <button
              onClick={() => toggleStar(selectedItem.data.id)}
              title="Star"
              className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-colors"
            >
              {isStarred(selectedItem.data.id) ? (
                <RiStarFill className="w-4 h-4 text-amber-400" />
              ) : (
                <RiStarLine className="w-4 h-4" />
              )}
              <span className="text-[10px]">
                {isStarred(selectedItem.data.id) ? 'Starred' : 'Star'}
              </span>
            </button>

            <button
              onClick={() =>
                openRenameDialog(
                  file ? 'file' : 'folder',
                  selectedItem.data.id,
                  file ? file.filename : (folder ? folder.name : '')
                )
              }
              title="Rename"
              className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-colors"
            >
              <RiEditLine className="w-4 h-4" />
              <span className="text-[10px]">Rename</span>
            </button>

            <button
              onClick={() =>
                openDeleteDialog(
                  file ? 'file' : 'folder',
                  selectedItem.data.id,
                  file ? file.filename : (folder ? folder.name : '')
                )
              }
              title="Delete"
              className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            >
              <RiDeleteBinLine className="w-4 h-4" />
              <span className="text-[10px]">Delete</span>
            </button>
          </div>

          {/* Public Share Status if File */}
          {fileShare && (
            <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-medium text-indigo-300">
                <span>Public Share Link</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20">
                  {fileShare.access_level}
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-300 truncate">{fileShare.url}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => copyShare(fileShare.url, fileShare.slug)}
                  className="flex-1 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedSlug === fileShare.slug ? (
                    <>
                      <RiCheckLine className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <RiFileCopyLine className="w-3.5 h-3.5" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>
                <a
                  href={fileShare.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-[11px] flex items-center gap-1 transition-colors"
                >
                  <RiExternalLinkLine className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Metadata Section */}
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <h4 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">
              Information
            </h4>

            <div className="space-y-2.5 text-[12.5px]">
              <div className="flex justify-between py-1 border-b border-white/[0.03]">
                <span className="text-zinc-500">Type</span>
                <span className="text-zinc-300 font-mono text-[11.5px] truncate max-w-[160px]">
                  {file ? file.content_type || 'File' : 'Folder'}
                </span>
              </div>

              {file && (
                <div className="flex justify-between py-1 border-b border-white/[0.03]">
                  <span className="text-zinc-500">Size</span>
                  <span className="text-zinc-300 font-mono text-[11.5px]">
                    {formatBytes(file.size)}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-white/[0.03]">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-300 text-[11.5px]">
                  {formatDate(selectedItem.data.created_at)}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.03]">
                <span className="text-zinc-500">Enclave Storage</span>
                <span className="text-zinc-300 text-[11.5px] font-mono">Encrypted MinIO</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-zinc-500 flex flex-col items-center justify-center h-64">
          <RiFileLine className="w-10 h-10 text-zinc-600 mb-2" />
          <p className="text-[13px]">Select a file or folder to view its details</p>
        </div>
      )}
    </aside>
  );
}
