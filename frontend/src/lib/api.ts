// No absolute backend URL needed — Next.js rewrites in next.config.ts
// proxy all /api/* requests to the FastAPI backend server-side.
const API_BASE = "";

// ─── Session Token helpers ───────────────────────────────────────

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('session_token');
}

export function setSessionToken(token: string, expiresAt?: string | null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('session_token', token);
  if (expiresAt) {
    localStorage.setItem('session_token_expires_at', expiresAt);
  }
}

export function getSessionTokenExpiresAt(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('session_token_expires_at');
}

export function clearSessionToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('session_token');
  localStorage.removeItem('session_token_expires_at');
}

// Backward compatibility with previous token helper names
export const getAccessToken = getSessionToken;
export const clearTokens = clearSessionToken;

// ─── Session Expired Event Listener ──────────────────────────────
type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function notifySessionExpired() {
  sessionExpiredListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Error in session expired listener:', e);
    }
  });
}

// ─── Fetch wrapper ───────────────────────────────────────────────

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    notifySessionExpired();
    throw new ApiError(401, 'Session expired or invalid — please re-pair from central dashboard');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || 'Request failed');
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// ─── Types ───────────────────────────────────────────────────────

export interface UserCacheOut {
  user_id: string;
  display_name: string | null;
  storage_quota_bytes: number;
  storage_used: number;
}

// Backward compatibility alias
export type UserOut = UserCacheOut;

export interface NodeSessionResponse {
  paired: boolean;
  tunnel_status?: 'unpaired' | 'starting' | 'ready' | 'failed';
  tunnel_ready?: boolean;
  tunnel_error?: string | null;
  node_id?: string | null;
  subdomain?: string | null;
  session_token?: string | null;
  session_token_expires_at?: string | null;
  user?: UserCacheOut | null;
}

export interface FileOut {
  id: string;
  filename: string;
  size: number;
  content_type: string | null;
  status: string;
  created_at: string;
  folder_id: string | null;
}

export interface FolderOut {
  id: string;
  name: string;
  created_at: string;
  parent_id: string | null;
}

export interface DirectoryListing {
  folder: FolderOut | null;
  folders: FolderOut[];
  files: FileOut[];
}

export interface UploadInitiateResponse {
  file_id: string;
  upload_mode: 'single' | 'multipart';
  upload_id?: string;
}

export interface ShareResponse {
  id: string;
  file_id: string;
  access_level: 'view' | 'download';
  slug: string;
  url: string;
  created_at: string;
}

// ─── Node Pairing & Session API ──────────────────────────────────

export async function apiGetNodeSession(): Promise<NodeSessionResponse> {
  return fetchApi<NodeSessionResponse>('/api/v1/node-pairing/session');
}

export async function apiGetPairingStatus(): Promise<{
  paired: boolean;
  tunnel_status?: string;
  tunnel_ready?: boolean;
  tunnel_error?: string | null;
  node_id?: string;
  subdomain?: string;
  session_token_expires_at?: string;
}> {
  return fetchApi('/api/v1/node-pairing/status');
}

export async function apiRestartTunnel(): Promise<{ status: string; message: string }> {
  return fetchApi<{ status: string; message: string }>('/api/v1/node-pairing/tunnel/restart', {
    method: 'POST',
  });
}

export async function apiClaimPairing(
  pairing_code: string,
  central_url?: string,
): Promise<{
  status: string;
  node_id?: string;
  session_token_expires_at?: string;
  subdomain?: string;
}> {
  return fetchApi('/api/v1/node-pairing/claim', {
    method: 'POST',
    body: JSON.stringify({ pairing_code, central_url }),
  });
}

// ─── Files API ───────────────────────────────────────────────────

export async function apiListDirectory(folderId?: string | null): Promise<DirectoryListing> {
  const params = folderId ? `?folder_id=${folderId}` : '';
  return fetchApi<DirectoryListing>(`/api/v1/files${params}`);
}

export async function apiCreateFolder(name: string, parentId?: string | null): Promise<FolderOut> {
  return fetchApi<FolderOut>('/api/v1/files/folders', {
    method: 'POST',
    body: JSON.stringify({
      name,
      parent_id: parentId || null,
    }),
  });
}

export async function apiDeleteFolder(folderId: string): Promise<{ status: string }> {
  return fetchApi<{ status: string }>(`/api/v1/files/folders/${folderId}`, {
    method: 'DELETE',
  });
}

export async function apiDownloadFile(fileId: string): Promise<void> {
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/v1/files/${fileId}/download`, { headers });

  if (!res.ok) {
    if (res.status === 401) {
      notifySessionExpired();
    }
    throw new Error(`Download failed: ${res.status}`);
  }

  // Extract filename from Content-Disposition header if available
  const disposition = res.headers.get('Content-Disposition');
  let filename = 'download';
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?(.*?)(?:"|;|$)/i);
    if (match?.[1]) {
      filename = decodeURIComponent(match[1]);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function apiRenameFile(fileId: string, name: string): Promise<FileOut> {
  return fetchApi<FileOut>(`/api/v1/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function apiRenameFolder(folderId: string, name: string): Promise<FolderOut> {
  return fetchApi<FolderOut>(`/api/v1/files/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function apiGetFile(fileId: string): Promise<FileOut> {
  return fetchApi<FileOut>(`/api/v1/files/${fileId}`);
}

export async function apiDeleteFile(fileId: string): Promise<{ status: string }> {
  return fetchApi<{ status: string }>(`/api/v1/files/${fileId}`, {
    method: 'DELETE',
  });
}

export async function apiShareFile(
  fileId: string,
  accessLevel: 'view' | 'download' = 'view',
): Promise<ShareResponse> {
  return fetchApi<ShareResponse>(`/api/v1/files/${fileId}/share`, {
    method: 'POST',
    body: JSON.stringify({ access_level: accessLevel }),
  });
}

export async function apiInitiateUpload(
  filename: string,
  size: number,
  contentType: string,
  folderId?: string | null,
): Promise<UploadInitiateResponse> {
  return fetchApi<UploadInitiateResponse>('/api/v1/files/uploads/initate', {
    method: 'POST',
    body: JSON.stringify({
      filename,
      size,
      content_type: contentType,
      folder_id: folderId || null,
    }),
  });
}

export async function apiUploadSingle(
  fileId: string,
  file: File,
): Promise<{ status: string }> {
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/v1/files/${fileId}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    notifySessionExpired();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || 'Upload failed');
  }

  return res.json();
}

export async function apiUploadPart(
  fileId: string,
  partNumber: number,
  chunk: Blob,
): Promise<{ part_number: number; etag: string }> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(
    `${API_BASE}/api/v1/files/uploads/${fileId}/part?part_number=${partNumber}`,
    {
      method: 'PUT',
      headers,
      body: chunk,
    },
  );

  if (res.status === 401) {
    notifySessionExpired();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || 'Part upload failed');
  }

  return res.json();
}

export async function apiCompleteUpload(
  fileId: string,
  parts: { part_number: number; etag: string }[],
): Promise<{ file_id: string; status: string }> {
  return fetchApi<{ file_id: string; status: string }>(
    `/api/v1/files/uploads/${fileId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ parts }),
    },
  );
}

export async function apiAbortUpload(fileId: string): Promise<{ status: string }> {
  return fetchApi<{ status: string }>(`/api/v1/files/upload/${fileId}/abort`, {
    method: 'POST',
  });
}
