'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import {
  RiGroupLine,
  RiShareForwardLine,
  RiFileCopyLine,
  RiCheckLine,
  RiExternalLinkLine,
  RiDownloadCloud2Line,
  RiFileLine,
} from 'react-icons/ri';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function SharedPage() {
  const { allFiles, knownShares, downloadFile, openShareModal } = useDashboard();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Files with active share links
  const sharedFileEntries = allFiles.filter((f) => Boolean(knownShares[f.id]));

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">Shared Links</h1>
          <p className="text-[13px] text-zinc-400 mt-0.5">
            Files shared via public enclave URLs or Central access tokens
          </p>
        </div>
      </div>

      {sharedFileEntries.length > 0 ? (
        <div className="border border-white/[0.06] rounded-2xl overflow-hidden bg-white/[0.01]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-[12px] font-medium text-zinc-400">
                <th className="py-3 px-4 font-medium">Shared File</th>
                <th className="py-3 px-4 font-medium hidden sm:table-cell">Access Mode</th>
                <th className="py-3 px-4 font-medium hidden md:table-cell">Size</th>
                <th className="py-3 px-4 font-medium">Share Link</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sharedFileEntries.map((file) => {
                const share = knownShares[file.id];
                return (
                  <tr
                    key={file.id}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors text-[13px]"
                  >
                    <td className="py-3.5 px-4 flex items-center gap-3">
                      <RiFileLine className="w-5 h-5 text-zinc-400 shrink-0" />
                      <span className="font-medium text-white truncate max-w-[200px] sm:max-w-xs">
                        {file.filename}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-zinc-400 text-[12px] hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded-full font-mono text-[11px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase">
                        {share?.access_level || 'view'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-zinc-400 text-[12px] font-mono hidden md:table-cell">
                      {formatBytes(file.size)}
                    </td>

                    <td className="py-3.5 px-4 text-zinc-400 text-[12px]">
                      <div className="flex items-center gap-2 max-w-[260px]">
                        <span className="truncate font-mono text-[11.5px] text-zinc-300">
                          {share?.url}
                        </span>
                        <button
                          onClick={() => handleCopy(share?.url || '', file.id)}
                          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
                          title="Copy Link"
                        >
                          {copiedId === file.id ? (
                            <RiCheckLine className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <RiFileCopyLine className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={share?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                          title="Open Link"
                        >
                          <RiExternalLinkLine className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => downloadFile(file.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                          title="Download"
                        >
                          <RiDownloadCloud2Line className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openShareModal(file)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                          title="Modify Settings"
                        >
                          <RiShareForwardLine className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24 px-4">
          <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-4">
            <RiGroupLine className="w-8 h-8 text-zinc-600" />
          </div>
          <p className="text-white text-[15px] font-medium mb-1">No shared files yet</p>
          <p className="text-zinc-500 text-[13px] max-w-sm">
            Files you share will generate public enclave links and appear here for quick management.
          </p>
        </div>
      )}
    </div>
  );
}
