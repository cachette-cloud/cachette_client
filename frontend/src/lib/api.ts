// No absolute backend URL needed — Next.js rewrites in next.config.ts
// proxy all /api/* requests to the FastAPI backend server-side.
const API_BASE = "";

// ─── Token helpers ───────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh_token');
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

// ─── Fetch wrapper ───────────────────────────────────────────────

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
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

export interface UserOut {
  id: string;
  email: string;
  created_at: string;
  storage_used: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
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
}

// ─── Auth API ────────────────────────────────────────────────────

export async function apiSignup(email: string, password: string): Promise<UserOut> {
  return fetchApi<UserOut>('/api/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiLogin(email: string, password: string): Promise<TokenResponse> {
  return fetchApi<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiRefreshToken(refreshToken: string): Promise<TokenResponse> {
  return fetchApi<TokenResponse>(`/api/v1/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
  });
}

export async function apiGetMe(): Promise<UserOut> {
  return fetchApi<UserOut>('/api/v1/auth/me');
}

export async function apiForgotPassword(email: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function apiResetPassword(
  email: string,
  otp: string,
  newPassword: string,
): Promise<{ message: string }> {
  return fetchApi<{ message: string }>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, otp, new_password: newPassword }),
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
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/v1/files/${fileId}/download`, { headers });

  if (!res.ok) {
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
  const token = getAccessToken();
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
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const formData = new FormData();
  formData.append('part', chunk);

  const res = await fetch(
    `${API_BASE}/api/v1/files/uploads/${fileId}/part?part_number=${partNumber}`,
    {
      method: 'PUT',
      headers,
      body: formData,
    },
  );

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
