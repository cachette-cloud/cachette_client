'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/lib/dashboard-context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ShareResponse } from '@/lib/api';
import {
  RiFileCopyLine,
  RiCheckLine,
  RiShareForwardLine,
  RiExternalLinkLine,
  RiLoader4Line,
} from 'react-icons/ri';

export default function SharedDialogs() {
  const {
    newFolderOpen,
    setNewFolderOpen,
    createFolder,
    renameDialogOpen,
    setRenameDialogOpen,
    renameTarget,
    submitRename,
    deleteDialogOpen,
    setDeleteDialogOpen,
    deleteTarget,
    confirmDelete,
    shareModalOpen,
    setShareModalOpen,
    fileToShare,
    createShareLink,
    handleFilesSelected,
    knownShares,
  } = useDashboard();

  // Create folder state
  const [folderName, setFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Rename state
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  // Share state
  const existingShare = fileToShare ? knownShares[fileToShare.id] : null;
  const [accessLevel, setAccessLevel] = useState<'view' | 'download'>('view');
  const [sharing, setSharing] = useState(false);
  const [generatedShare, setGeneratedShare] = useState<ShareResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync state when opening dialogs
  const activeShare = generatedShare || existingShare;

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createFolder(folderName.trim());
      setFolderName('');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = (newName || renameTarget?.name || '').trim();
    if (!finalName) return;
    setRenaming(true);
    try {
      await submitRename(finalName);
      setNewName('');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await confirmDelete();
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateShare = async () => {
    if (!fileToShare) return;
    setSharing(true);
    try {
      const share = await createShareLink(fileToShare.id, accessLevel);
      setGeneratedShare(share);
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = () => {
    if (!activeShare?.url) return;
    navigator.clipboard.writeText(activeShare.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Hidden File Input for Single/Multiple File Uploads */}
      <input
        id="global-file-upload-input"
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Hidden Folder Input for Directory Uploads */}
      <input
        id="global-folder-upload-input"
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* New Folder Modal */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="bg-[#121217] border-white/10 max-w-[92vw] sm:max-w-md rounded-2xl shadow-2xl p-6">
          <form onSubmit={handleCreateFolder}>
            <DialogHeader>
              <DialogTitle className="text-white text-[16px]">New folder</DialogTitle>
              <DialogDescription className="text-zinc-400 text-[13px]">
                Enter a name for this folder.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <input
                type="text"
                autoFocus
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Untitled folder"
                className="w-full h-11 px-3.5 bg-black/40 border border-white/10 rounded-xl text-[13.5px] text-white placeholder-zinc-500 outline-none focus:border-white/30"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewFolderOpen(false)}
                className="border-white/10 text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingFolder || !folderName.trim()}
                className="bg-white text-black hover:bg-zinc-200"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="bg-[#121217] border-white/10 max-w-[92vw] sm:max-w-md rounded-2xl shadow-2xl p-6">
          <form onSubmit={handleRename}>
            <DialogHeader>
              <DialogTitle className="text-white text-[16px]">
                Rename {renameTarget?.type === 'file' ? 'file' : 'folder'}
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <input
                type="text"
                autoFocus
                value={newName !== '' ? newName : (renameTarget?.name || '')}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New name"
                className="w-full h-11 px-3.5 bg-black/40 border border-white/10 rounded-xl text-[13.5px] text-white placeholder-zinc-500 outline-none focus:border-white/30"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameDialogOpen(false)}
                className="border-white/10 text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={renaming || !newName.trim()}
                className="bg-white text-black hover:bg-zinc-200"
              >
                {renaming ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete / Move to Trash Confirmation Modal */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#121217] border-white/10 max-w-[92vw] sm:max-w-md rounded-2xl shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-white text-[16px]">
              {deleteTarget?.type === 'file' ? 'Move to trash?' : 'Delete folder?'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-[13px] pt-1">
              {deleteTarget?.type === 'file'
                ? `"${deleteTarget?.name}" will be moved to Trash. You can restore it anytime.`
                : `"${deleteTarget?.name}" and all of its contents will be permanently deleted.`}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-white/10 text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Google Drive-Style Share Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="bg-[#121217] border-white/10 max-w-[92vw] sm:max-w-lg rounded-3xl shadow-2xl p-6 sm:p-7">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                <RiShareForwardLine className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-[17px] font-semibold">
                  Share &quot;{fileToShare?.filename}&quot;
                </DialogTitle>
                <DialogDescription className="text-zinc-400 text-[12.5px]">
                  Generate a secure public link on this hardware node
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Access level selector */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06] flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-white">General access</p>
                <p className="text-[11.5px] text-zinc-400">
                  Anyone with the link can access this file
                </p>
              </div>

              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as 'view' | 'download')}
                className="bg-white/[0.08] text-white text-[12px] font-medium rounded-xl px-3 py-1.5 outline-none border border-white/10 cursor-pointer"
              >
                <option value="view" className="bg-[#121217] text-white">Viewer (inline)</option>
                <option value="download" className="bg-[#121217] text-white">Downloader</option>
              </select>
            </div>

            {/* Generated Link Display */}
            {activeShare ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                  <input
                    type="text"
                    readOnly
                    value={activeShare.url}
                    className="flex-1 bg-transparent text-[12px] font-mono text-zinc-300 outline-none truncate select-all px-1"
                  />
                  <a
                    href={activeShare.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                    title="Open link"
                  >
                    <RiExternalLinkLine className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 flex sm:justify-between items-center">
            {activeShare ? (
              <button
                type="button"
                onClick={handleCopyLink}
                className="h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12.5px] font-medium flex items-center gap-2 transition-colors"
              >
                {copied ? (
                  <>
                    <RiCheckLine className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Link copied!</span>
                  </>
                ) : (
                  <>
                    <RiFileCopyLine className="w-4 h-4" />
                    <span>Copy link</span>
                  </>
                )}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShareModalOpen(false)}
                className="border-white/10 text-zinc-400 hover:text-white"
              >
                Done
              </Button>
              <Button
                onClick={handleGenerateShare}
                disabled={sharing}
                className="bg-white text-black hover:bg-zinc-200"
              >
                {sharing ? (
                  <>
                    <RiLoader4Line className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>{activeShare ? 'Update link' : 'Get link'}</span>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
