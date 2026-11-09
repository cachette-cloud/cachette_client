'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  apiListDirectory,
  apiCreateFolder,
  apiDeleteFile,
  apiDeleteFolder,
  apiRenameFile,
  apiRenameFolder,
  apiDownloadFile,
  apiShareFile,
  apiInitiateUpload,
  apiUploadSingle,
  apiUploadPart,
  apiCompleteUpload,
  type FileOut,
  type FolderOut,
  type ShareResponse,
} from './api';
import { useAuth } from './auth-context';

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export type SelectedEntity =
  | { type: 'file'; data: FileOut }
  | { type: 'folder'; data: FolderOut }
  | null;

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const CONCURRENT_CHUNKS = 4;

async function runConcurrentTasks<T, R>(
  items: T[],
  concurrency: number,
  taskFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await taskFn(items[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

interface DashboardContextValue {
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  breadcrumbs: BreadcrumbItem[];
  setBreadcrumbs: React.Dispatch<React.SetStateAction<BreadcrumbItem[]>>;
  folders: FolderOut[];
  files: FileOut[];
  allFiles: FileOut[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  viewMode: 'list' | 'grid';
  setViewMode: (mode: 'list' | 'grid') => void;
  selectedItem: SelectedEntity;
  setSelectedItem: (item: SelectedEntity) => void;
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  refreshDirectory: (folderId?: string | null) => Promise<void>;
  
  // Dialog controls
  newFolderOpen: boolean;
  setNewFolderOpen: (open: boolean) => void;
  createFolder: (name: string) => Promise<void>;
  
  renameDialogOpen: boolean;
  setRenameDialogOpen: (open: boolean) => void;
  renameTarget: { type: 'file' | 'folder'; id: string; name: string } | null;
  openRenameDialog: (type: 'file' | 'folder', id: string, name: string) => void;
  submitRename: (newName: string) => Promise<void>;
  
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  deleteTarget: { type: 'file' | 'folder'; id: string; name: string } | null;
  openDeleteDialog: (type: 'file' | 'folder', id: string, name: string) => void;
  confirmDelete: () => Promise<void>;

  shareModalOpen: boolean;
  setShareModalOpen: (open: boolean) => void;
  fileToShare: FileOut | null;
  openShareModal: (file: FileOut) => void;

  downloadFile: (fileId: string) => Promise<void>;
  
  // Uploads
  uploading: boolean;
  uploadProgress: string;
  triggerFileUpload: () => void;
  triggerFolderUpload: () => void;
  handleFilesSelected: (files: FileList | File[]) => Promise<void>;

  // Starred items
  starredIds: Set<string>;
  toggleStar: (id: string) => void;
  isStarred: (id: string) => boolean;

  // Trash & Trashed items
  trashedFiles: FileOut[];
  moveToTrash: (file: FileOut) => void;
  restoreFromTrash: (fileId: string) => void;
  permanentDelete: (fileId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;

  // Shared links tracking
  knownShares: Record<string, ShareResponse>;
  createShareLink: (fileId: string, accessLevel?: 'view' | 'download') => Promise<ShareResponse>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, refreshSession } = useAuth();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderOut[]>([]);
  const [files, setFiles] = useState<FileOut[]>([]);
  const [allFiles, setAllFiles] = useState<FileOut[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      const saved = localStorage.getItem('cachette_view_mode');
      return saved === 'grid' || saved === 'list' ? saved : 'list';
    } catch {
      return 'list';
    }
  });
  const [selectedItem, setSelectedItem] = useState<SelectedEntity>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState<FileOut | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Starred in localStorage
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem('cachette_starred_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Trashed in localStorage
  const [trashedFiles, setTrashedFiles] = useState<FileOut[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('cachette_trashed_files');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Known shares in localStorage
  const [knownShares, setKnownShares] = useState<Record<string, ShareResponse>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('cachette_shares');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveStarred = (newSet: Set<string>) => {
    setStarredIds(newSet);
    try {
      localStorage.setItem('cachette_starred_ids', JSON.stringify(Array.from(newSet)));
    } catch {
      // Ignore storage errors
    }
  };

  const saveTrashed = (newTrash: FileOut[]) => {
    setTrashedFiles(newTrash);
    try {
      localStorage.setItem('cachette_trashed_files', JSON.stringify(newTrash));
    } catch {
      // Ignore storage errors
    }
  };

  const saveShares = (newShares: Record<string, ShareResponse>) => {
    setKnownShares(newShares);
    try {
      localStorage.setItem('cachette_shares', JSON.stringify(newShares));
    } catch {
      // Ignore storage errors
    }
  };

  const toggleStar = (id: string) => {
    const next = new Set(starredIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveStarred(next);
  };

  const isStarred = (id: string) => starredIds.has(id);

  // Directory Loader
  const refreshDirectory = useCallback(
    async (folderId: string | null = currentFolderId) => {
      setIsLoading(true);
      try {
        const listing = await apiListDirectory(folderId);
        setFolders(listing.folders);
        setFiles(listing.files);

        // Also fetch root files if not in root, or accumulate to allFiles for global search / recent
        if (folderId === null) {
          setAllFiles(listing.files);
        } else {
          setAllFiles((prev) => {
            const map = new Map(prev.map((f) => [f.id, f]));
            listing.files.forEach((f) => map.set(f.id, f));
            return Array.from(map.values());
          });
        }

        setCurrentFolderId(folderId);

        if (folderId === null) {
          setBreadcrumbs([]);
        } else if (listing.folder) {
          setBreadcrumbs((prev) => {
            const existingIdx = prev.findIndex((b) => b.id === folderId);
            if (existingIdx >= 0) return prev.slice(0, existingIdx + 1);
            return [...prev, { id: listing.folder!.id, name: listing.folder!.name }];
          });
        }
      } catch (err) {
        console.error('Failed to load directory:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [currentFolderId]
  );

  useEffect(() => {
    if (isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refreshDirectory(null);
    }
  }, [isAuthenticated, refreshDirectory]);

  // Create folder
  const createFolder = async (name: string) => {
    if (!name.trim()) return;
    await apiCreateFolder(name.trim(), currentFolderId);
    await refreshDirectory(currentFolderId);
    setNewFolderOpen(false);
  };

  // Rename
  const openRenameDialog = (type: 'file' | 'folder', id: string, name: string) => {
    setRenameTarget({ type, id, name });
    setRenameDialogOpen(true);
  };

  const submitRename = async (newName: string) => {
    if (!renameTarget || !newName.trim()) return;
    if (renameTarget.type === 'file') {
      await apiRenameFile(renameTarget.id, newName.trim());
    } else {
      await apiRenameFolder(renameTarget.id, newName.trim());
    }
    setRenameDialogOpen(false);
    setRenameTarget(null);
    await refreshDirectory(currentFolderId);
  };

  // Delete / Trash
  const openDeleteDialog = (type: 'file' | 'folder', id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'file') {
      const fileToTrash = files.find((f) => f.id === deleteTarget.id);
      if (fileToTrash) {
        moveToTrash(fileToTrash);
      } else {
        await apiDeleteFile(deleteTarget.id);
      }
    } else {
      await apiDeleteFolder(deleteTarget.id);
    }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    await refreshDirectory(currentFolderId);
    refreshSession();
  };

  const moveToTrash = (file: FileOut) => {
    const nextTrash = [file, ...trashedFiles.filter((f) => f.id !== file.id)];
    saveTrashed(nextTrash);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    setAllFiles((prev) => prev.filter((f) => f.id !== file.id));
  };

  const restoreFromTrash = (fileId: string) => {
    const fileToRestore = trashedFiles.find((f) => f.id === fileId);
    if (!fileToRestore) return;
    saveTrashed(trashedFiles.filter((f) => f.id !== fileId));
    setFiles((prev) => [fileToRestore, ...prev]);
    setAllFiles((prev) => [fileToRestore, ...prev]);
  };

  const permanentDelete = async (fileId: string) => {
    try {
      await apiDeleteFile(fileId);
    } catch {
      // Ignore if already deleted on backend
    }
    saveTrashed(trashedFiles.filter((f) => f.id !== fileId));
    refreshSession();
  };

  const emptyTrash = async () => {
    for (const file of trashedFiles) {
      try {
        await apiDeleteFile(file.id);
      } catch {
        // continue
      }
    }
    saveTrashed([]);
    refreshSession();
  };

  // Share
  const openShareModal = (file: FileOut) => {
    setFileToShare(file);
    setShareModalOpen(true);
  };

  const createShareLink = async (fileId: string, accessLevel: 'view' | 'download' = 'view') => {
    const res = await apiShareFile(fileId, accessLevel);
    const next = { ...knownShares, [fileId]: res };
    saveShares(next);
    return res;
  };

  // Download
  const downloadFile = async (fileId: string) => {
    await apiDownloadFile(fileId);
  };

  // Upload handler
  const handleFilesSelected = async (selected: FileList | File[]) => {
    const fileList = Array.from(selected);
    if (fileList.length === 0) return;

    setUploading(true);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const prefix = fileList.length > 1 ? `(${i + 1}/${fileList.length}) ` : '';
      setUploadProgress(`${prefix}0%`);

      try {
        const initRes = await apiInitiateUpload(
          file.name,
          file.size,
          file.type || 'application/octet-stream',
          currentFolderId
        );

        if (initRes.upload_mode === 'single') {
          await apiUploadSingle(initRes.file_id, file);
          setUploadProgress(`${prefix}100%`);
          await apiCompleteUpload(initRes.file_id, []);
        } else {
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
          const chunkTasks = [];

          for (let partNum = 1; partNum <= totalChunks; partNum++) {
            const start = (partNum - 1) * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            chunkTasks.push({
              partNum,
              chunk: file.slice(start, end),
            });
          }

          let completedChunks = 0;
          const parts = await runConcurrentTasks(
            chunkTasks,
            CONCURRENT_CHUNKS,
            async (task) => {
              const partRes = await apiUploadPart(initRes.file_id, task.partNum, task.chunk);
              completedChunks++;
              setUploadProgress(
                `${prefix}${Math.round((completedChunks / totalChunks) * 100)}%`
              );
              return partRes;
            }
          );

          await apiCompleteUpload(initRes.file_id, parts);
        }
      } catch (err: unknown) {
        console.error('Upload failed for file:', file.name, err);
        const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Upload failed';
        alert(`Failed to upload ${file.name}: ${msg}`);
      }
    }

    setUploading(false);
    setUploadProgress('');
    await refreshDirectory(currentFolderId);
    refreshSession();
  };

  const triggerFileUpload = () => {
    const input = document.getElementById('global-file-upload-input') as HTMLInputElement | null;
    input?.click();
  };

  const triggerFolderUpload = () => {
    const input = document.getElementById('global-folder-upload-input') as HTMLInputElement | null;
    input?.click();
  };

  return (
    <DashboardContext.Provider
      value={{
        currentFolderId,
        setCurrentFolderId,
        breadcrumbs,
        setBreadcrumbs,
        folders,
        files,
        allFiles,
        isLoading,
        searchQuery,
        setSearchQuery,
        viewMode,
        setViewMode: (mode) => {
          setViewMode(mode);
          try {
            localStorage.setItem('cachette_view_mode', mode);
          } catch {
            // Ignore
          }
        },
        selectedItem,
        setSelectedItem,
        detailsOpen,
        setDetailsOpen,
        refreshDirectory,
        newFolderOpen,
        setNewFolderOpen,
        createFolder,
        renameDialogOpen,
        setRenameDialogOpen,
        renameTarget,
        openRenameDialog,
        submitRename,
        deleteDialogOpen,
        setDeleteDialogOpen,
        deleteTarget,
        openDeleteDialog,
        confirmDelete,
        shareModalOpen,
        setShareModalOpen,
        fileToShare,
        openShareModal,
        downloadFile,
        uploading,
        uploadProgress,
        triggerFileUpload,
        triggerFolderUpload,
        handleFilesSelected,
        starredIds,
        toggleStar,
        isStarred,
        trashedFiles,
        moveToTrash,
        restoreFromTrash,
        permanentDelete,
        emptyTrash,
        knownShares,
        createShareLink,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
