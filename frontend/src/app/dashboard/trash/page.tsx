'use client';

import React from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import {
  RiDeleteBinLine,
  RiRestartLine,
  RiDeleteBin2Line,
  RiFileLine,
} from 'react-icons/ri';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function TrashPage() {
  const { trashedFiles, restoreFromTrash, permanentDelete, emptyTrash } = useDashboard();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
      {/* Title & Action */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">Trash</h1>
          <p className="text-[13px] text-zinc-400 mt-0.5">
            Items in trash can be restored or permanently removed
          </p>
        </div>

        {trashedFiles.length > 0 && (
          <button
            onClick={emptyTrash}
            className="h-9 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-[12.5px] font-medium flex items-center gap-2 transition-colors"
          >
            <RiDeleteBin2Line className="w-4 h-4" />
            <span>Empty trash</span>
          </button>
        )}
      </div>

      {trashedFiles.length > 0 ? (
        <div className="border border-white/[0.06] rounded-2xl overflow-hidden bg-white/[0.01]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-[12px] font-medium text-zinc-400">
                <th className="py-3 px-4 font-medium w-[50%]">Name</th>
                <th className="py-3 px-4 font-medium w-[20%]">File size</th>
                <th className="py-3 px-4 font-medium text-right w-[30%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trashedFiles.map((file) => (
                <tr
                  key={file.id}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors text-[13px]"
                >
                  <td className="py-3.5 px-4 flex items-center gap-3">
                    <RiFileLine className="w-5 h-5 text-zinc-400 shrink-0" />
                    <span className="font-medium text-white truncate max-w-sm">
                      {file.filename}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-zinc-400 text-[12px] font-mono">
                    {formatBytes(file.size)}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => restoreFromTrash(file.id)}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 hover:text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors"
                        title="Restore item"
                      >
                        <RiRestartLine className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>

                      <button
                        onClick={() => permanentDelete(file.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[12px] font-medium flex items-center gap-1.5 transition-colors"
                        title="Delete forever"
                      >
                        <RiDeleteBinLine className="w-3.5 h-3.5" />
                        <span>Delete forever</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24 px-4">
          <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-4">
            <RiDeleteBinLine className="w-8 h-8 text-zinc-600" />
          </div>
          <p className="text-white text-[15px] font-medium mb-1">Trash is empty</p>
          <p className="text-zinc-500 text-[13px] max-w-sm">
            Items moved to the trash will show up here until you permanently delete them.
          </p>
        </div>
      )}
    </div>
  );
}

