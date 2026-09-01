'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useAuth } from '@/lib/auth-context';
import { apiListDirectory, apiDeleteFile, apiCreateFolder, type FileOut, type FolderOut } from '@/lib/api';
import Sidebar from '@/components/dashboard/sidebar';
import Breadcrumb, { type BreadcrumbItem } from '@/components/dashboard/breadcrumb';
import FileGrid from '@/components/dashboard/file-grid';
import UploadButton from '@/components/dashboard/upload-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RiSearchLine, RiFolderAddLine, RiMenuLine } from 'react-icons/ri';

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderOut[]>([]);
  const [files, setFiles] = useState<FileOut[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Delete file confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Delete folder confirmation
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  // Rename state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameType, setRenameType] = useState<'file' | 'folder' | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // New folder state
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const handleCreateFolder = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    setFolderError(null);
    try {
      await apiCreateFolder(newFolderName.trim(), currentFolderId);
      setNewFolderDialogOpen(false);
      setNewFolderName('');
      loadDirectory(currentFolderId);
    } catch (err: any) {
      console.error('Failed to create folder:', err);
      setFolderError(err.detail || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const loadDirectory = useCallback(async (folderId: string | null) => {
    setIsLoading(true);
    try {
      const listing = await apiListDirectory(folderId);
      setFolders(listing.folders);
      setFiles(listing.files);

      // Update current folder state
      setCurrentFolderId(folderId);

      // Update breadcrumbs
      if (folderId === null) {
        setBreadcrumbs([]);
      } else if (listing.folder) {
        setBreadcrumbs((prev) => {
          // Check if we're going back
          const existingIdx = prev.findIndex((b) => b.id === folderId);
          if (existingIdx >= 0) {
            return prev.slice(0, existingIdx + 1);
          }
          // Going deeper
          return [...prev, { id: listing.folder!.id, name: listing.folder!.name }];
        });
      }
    } catch (err) {
      console.error('Failed to load directory:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load root directory
  useEffect(() => {
    if (isAuthenticated) {
      loadDirectory(null);
    }
  }, [isAuthenticated, loadDirectory]);

  const handleFolderClick = (folderId: string) => {
    loadDirectory(folderId);
  };

  const handleBreadcrumbNavigate = (folderId: string | null) => {
    loadDirectory(folderId);
  };

  const handleDeleteFile = (fileId: string) => {
    setFileToDelete(fileId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    setDeleting(true);
    try {
      await apiDeleteFile(fileToDelete);
      loadDirectory(currentFolderId);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    }
  };

  const handleDeleteFolderClick = (folderId: string) => {
    setFolderToDelete(folderId);
    setDeleteFolderDialogOpen(true);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    setDeletingFolder(true);
    try {
      const { apiDeleteFolder } = await import('@/lib/api');
      await apiDeleteFolder(folderToDelete);
      loadDirectory(currentFolderId);
    } catch (err) {
      console.error('Folder delete failed:', err);
    } finally {
      setDeletingFolder(false);
      setDeleteFolderDialogOpen(false);
      setFolderToDelete(null);
    }
  };

  const handleRenameFileClick = (fileId: string, currentName: string) => {
    setRenameType('file');
    setRenameTargetId(fileId);
    setRenameName(currentName);
    setRenameError(null);
    setRenameDialogOpen(true);
  };

  const handleRenameFolderClick = (folderId: string, currentName: string) => {
    setRenameType('folder');
    setRenameTargetId(folderId);
    setRenameName(currentName);
    setRenameError(null);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!renameTargetId || !renameType || !renameName.trim()) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const { apiRenameFile, apiRenameFolder } = await import('@/lib/api');
      if (renameType === 'file') {
        await apiRenameFile(renameTargetId, renameName.trim());
      } else {
        await apiRenameFolder(renameTargetId, renameName.trim());
      }
      setRenameDialogOpen(false);
      loadDirectory(currentFolderId);
    } catch (err: any) {
      console.error('Rename failed:', err);
      setRenameError(err.detail || 'Failed to rename item');
    } finally {
      setRenaming(false);
    }
  };

  const handleDownloadFile = async (fileId: string) => {
    try {
      const { apiDownloadFile } = await import('@/lib/api');
      await apiDownloadFile(fileId);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to start download');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <Sidebar 
        activeItem="files" 
        isOpen={mobileSidebarOpen} 
        onClose={() => setMobileSidebarOpen(false)} 
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <motion.header
          className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-white/[0.04] shrink-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Hamburger button on mobile */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="md:hidden p-1.5 -ml-1 text-white/60 hover:text-white rounded-lg bg-white/[0.03] border border-white/[0.06] transition-colors shrink-0"
            >
              <RiMenuLine className="w-4 h-4" />
            </button>

            <div className="min-w-0 flex-1">
              <Breadcrumb items={breadcrumbs} onNavigate={handleBreadcrumbNavigate} />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Search (visual only for now) */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] w-48 xl:w-56">
              <RiSearchLine className="w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                placeholder="Search files..."
                className="bg-transparent text-white/60 placeholder:text-white/20 text-[13px] outline-none w-full"
              />
            </div>

            <Button
              onClick={() => setNewFolderDialogOpen(true)}
              className="bg-white/[0.05] text-white hover:bg-white/[0.1] h-8 sm:h-9 px-2.5 sm:px-4 rounded-lg text-[12px] sm:text-[13px] font-semibold gap-1.5 sm:gap-2 border border-white/[0.05] shrink-0"
            >
              <RiFolderAddLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">New Folder</span>
            </Button>
            <UploadButton
              currentFolderId={currentFolderId}
              onUploadComplete={() => loadDirectory(currentFolderId)}
            />
          </div>
        </motion.header>

        {/* Files area */}
        <motion.div
          className="flex-1 overflow-auto px-3 sm:px-6 py-4 sm:py-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <FileGrid
            folders={folders}
            files={files}
            onFolderClick={handleFolderClick}
            onDeleteFile={handleDeleteFile}
            onDeleteFolder={handleDeleteFolderClick}
            onDownloadFile={handleDownloadFile}
            onRenameFile={handleRenameFileClick}
            onRenameFolder={handleRenameFolderClick}
            isLoading={isLoading}
          />
        </motion.div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/[0.08] max-w-[92vw] sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-[15px]">Delete File</DialogTitle>
            <DialogDescription className="text-white/40 text-[13px]">
              This action cannot be undone. The file will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-white/[0.08] text-white/50 hover:text-white text-[13px]"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-0 text-[13px]"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/[0.08] max-w-[92vw] sm:max-w-sm rounded-2xl">
          <form onSubmit={handleCreateFolder}>
            <DialogHeader>
              <DialogTitle className="text-white text-[15px]">New Folder</DialogTitle>
              <DialogDescription className="text-white/40 text-[13px]">
                Create a new folder in the current directory.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-white/20 outline-none focus:border-indigo-500/50"
              />
              {folderError && (
                <p className="text-red-400 text-[12px] mt-2">{folderError}</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0 mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewFolderDialogOpen(false)}
                className="border-white/[0.08] text-white/50 hover:text-white text-[13px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingFolder || !newFolderName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 text-[13px]"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirmation dialog */}
      <Dialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/[0.08] max-w-[92vw] sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-[15px]">Delete Folder</DialogTitle>
            <DialogDescription className="text-white/40 text-[13px]">
              This action cannot be undone. The folder and all its contents will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="outline"
              onClick={() => setDeleteFolderDialogOpen(false)}
              className="border-white/[0.08] text-white/50 hover:text-white text-[13px]"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteFolder}
              disabled={deletingFolder}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-0 text-[13px]"
            >
              {deletingFolder ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/[0.08] max-w-[92vw] sm:max-w-sm rounded-2xl">
          <form onSubmit={handleRenameSubmit}>
            <DialogHeader>
              <DialogTitle className="text-white text-[15px]">
                Rename {renameType === 'file' ? 'File' : 'Folder'}
              </DialogTitle>
              <DialogDescription className="text-white/40 text-[13px] hidden">
                Enter a new name for the item.
              </DialogDescription>
            </DialogHeader>
            <div className="my-4">
              <input
                type="text"
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="New name"
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-white/20 outline-none focus:border-indigo-500/50"
              />
              {renameError && (
                <p className="text-red-400 text-[12px] mt-2">{renameError}</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0 mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameDialogOpen(false)}
                className="border-white/[0.08] text-white/50 hover:text-white text-[13px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={renaming || !renameName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 text-[13px]"
              >
                {renaming ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
