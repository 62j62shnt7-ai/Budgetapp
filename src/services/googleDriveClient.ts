/**
 * Google Drive Autonomous Sync Service (Option B: Visible 'Budget Control' Folder)
 *
 * Uses Google Identity Services (GIS) token client to authorize Drive access.
 * Saves/updates 'budget-data.json' inside 'My Drive / Budget Control /'.
 *
 * Scope: 'https://www.googleapis.com/auth/drive.file'
 * Restricts access strictly to files created by Budget Control.
 */

import {
  saveStorage,
  loadStorageSync,
  removeStorage,
} from '../utils/storageAdapter';

const GDRIVE_CLIENT_ID_KEY = 'budget-control-gdrive-client-id';
const GDRIVE_TOKEN_KEY = 'budget-control-gdrive-token';
const GDRIVE_TOKEN_EXPIRY_KEY = 'budget-control-gdrive-token-expiry';
const GDRIVE_USER_KEY = 'budget-control-gdrive-user';
const GDRIVE_AUTO_SYNC_KEY = 'budget-control-gdrive-auto-sync';

export interface GoogleDriveUser {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleDriveSyncResult {
  success: boolean;
  fileId?: string;
  modifiedTime?: string;
  error?: string;
}

const DEFAULT_GOOGLE_CLIENT_ID = '191333657161-aqptqa80usrujqbuqckp15ddf9ib8g7t.apps.googleusercontent.com';

export function getStoredDriveClientId(): string {
  const envId = typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID
    ? String(import.meta.env.VITE_GOOGLE_CLIENT_ID).trim()
    : '';
  let storedId = loadStorageSync<string>(GDRIVE_CLIENT_ID_KEY, '');
  if (!storedId && typeof localStorage !== 'undefined') {
    storedId = localStorage.getItem(GDRIVE_CLIENT_ID_KEY) || '';
  }
  return storedId || envId || DEFAULT_GOOGLE_CLIENT_ID;
}

export function saveStoredDriveClientId(clientId: string): void {
  const trimmed = clientId.trim();
  if (trimmed) {
    saveStorage(GDRIVE_CLIENT_ID_KEY, trimmed);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(GDRIVE_CLIENT_ID_KEY, trimmed); } catch {}
    }
  } else {
    void removeStorage(GDRIVE_CLIENT_ID_KEY);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(GDRIVE_CLIENT_ID_KEY); } catch {}
    }
  }
}

export function isDriveTokenValid(): boolean {
  return Boolean(getStoredDriveToken());
}

export function isDriveUserConnected(): boolean {
  return Boolean(getStoredDriveUser());
}

export type DriveConnectionState = 'disconnected' | 'connected' | 'expired';

export function getDriveConnectionState(): DriveConnectionState {
  const user = getStoredDriveUser();
  if (!user) return 'disconnected';
  const token = getStoredDriveToken();
  if (!token) return 'expired';
  return 'connected';
}

let silentRefreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh the Google Drive OAuth token silently in the background
 * without showing user account selection popups (prompt: '').
 */
export async function refreshDriveTokenSilently(): Promise<string | null> {
  const user = getStoredDriveUser();
  if (!user) return null;

  const validToken = getStoredDriveToken();
  if (validToken) return validToken;

  if (silentRefreshPromise) return silentRefreshPromise;

  const clientId = getStoredDriveClientId();
  if (!clientId || typeof window === 'undefined') return null;

  silentRefreshPromise = (async () => {
    const loaded = await loadGisScript();
    if (!loaded) return null;

    return new Promise<string | null>((resolve) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const google = (window as any).google;
        if (!google?.accounts?.oauth2) {
          resolve(null);
          return;
        }

        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          hint: user.email,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (resp: any) => {
            if (resp.error || !resp.access_token) {
              console.warn('[googleDriveClient] Silent token refresh failed:', resp.error);
              resolve(null);
              return;
            }
            const token = resp.access_token as string;
            const expiresIn = Number(resp.expires_in || 3600);
            saveStoredDriveToken(token, expiresIn);
            resolve(token);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error_callback: (err: any) => {
            console.warn('[googleDriveClient] Silent token refresh error callback:', err);
            resolve(null);
          },
        });

        // Request token silently without popup prompt
        client.requestAccessToken({ prompt: '' });
      } catch (err) {
        console.warn('[googleDriveClient] Silent token refresh exception:', err);
        resolve(null);
      }
    });
  })().finally(() => {
    silentRefreshPromise = null;
  });

  return silentRefreshPromise;
}

export function getStoredDriveToken(): string | null {
  let token = loadStorageSync<string | null>(GDRIVE_TOKEN_KEY, null);
  let expiry = Number(loadStorageSync<string | number>(GDRIVE_TOKEN_EXPIRY_KEY, 0));
  if ((!token || !expiry) && typeof localStorage !== 'undefined') {
    token = token || localStorage.getItem(GDRIVE_TOKEN_KEY);
    expiry = expiry || Number(localStorage.getItem(GDRIVE_TOKEN_EXPIRY_KEY) || '0');
  }
  if (!token || Date.now() >= expiry) {
    return null;
  }
  return token;
}

export function saveStoredDriveToken(token: string, expiresInSeconds: number): void {
  const expiry = Date.now() + Math.max(0, (expiresInSeconds - 60) * 1000);
  saveStorage(GDRIVE_TOKEN_KEY, token);
  saveStorage(GDRIVE_TOKEN_EXPIRY_KEY, String(expiry));
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(GDRIVE_TOKEN_KEY, token);
      localStorage.setItem(GDRIVE_TOKEN_EXPIRY_KEY, String(expiry));
    } catch {}
  }
}

export function clearStoredDriveToken(): void {
  void removeStorage(GDRIVE_TOKEN_KEY);
  void removeStorage(GDRIVE_TOKEN_EXPIRY_KEY);
  void removeStorage(GDRIVE_USER_KEY);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      localStorage.removeItem(GDRIVE_TOKEN_EXPIRY_KEY);
      localStorage.removeItem(GDRIVE_USER_KEY);
    } catch {}
  }
}

export function getStoredDriveUser(): GoogleDriveUser | null {
  const user = loadStorageSync<GoogleDriveUser | null>(GDRIVE_USER_KEY, null);
  if (user) return user;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(GDRIVE_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GoogleDriveUser;
    } catch {
      return null;
    }
  }
  return null;
}

export function saveStoredDriveUser(user: GoogleDriveUser | null): void {
  if (!user) {
    void removeStorage(GDRIVE_USER_KEY);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(GDRIVE_USER_KEY); } catch {}
    }
  } else {
    saveStorage(GDRIVE_USER_KEY, user);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(GDRIVE_USER_KEY, JSON.stringify(user)); } catch {}
    }
  }
}

export function getStoredDriveAutoSync(): boolean {
  const val = loadStorageSync<boolean | null>(GDRIVE_AUTO_SYNC_KEY, null);
  if (val !== null && val !== undefined) return val;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(GDRIVE_AUTO_SYNC_KEY);
    return raw === null ? true : raw === 'true';
  }
  return true;
}

export function saveStoredDriveAutoSync(enabled: boolean): void {
  saveStorage(GDRIVE_AUTO_SYNC_KEY, enabled);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(GDRIVE_AUTO_SYNC_KEY, String(enabled)); } catch {}
  }
}

const GDRIVE_DAILY_SNAPSHOTS_KEY = 'budget-control-gdrive-daily-snapshots';
const GDRIVE_BACKUP_RETENTION_KEY = 'budget-control-gdrive-backup-retention';

export function getStoredDriveDailySnapshotsEnabled(): boolean {
  const val = loadStorageSync<boolean | null>(GDRIVE_DAILY_SNAPSHOTS_KEY, null);
  if (val !== null && val !== undefined) return val;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(GDRIVE_DAILY_SNAPSHOTS_KEY);
    return raw === null ? true : raw === 'true';
  }
  return true;
}

export function saveStoredDriveDailySnapshotsEnabled(enabled: boolean): void {
  saveStorage(GDRIVE_DAILY_SNAPSHOTS_KEY, enabled);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(GDRIVE_DAILY_SNAPSHOTS_KEY, String(enabled)); } catch {}
  }
}

export function getStoredDriveBackupRetentionLimit(): number {
  const val = Number(loadStorageSync<number>(GDRIVE_BACKUP_RETENTION_KEY, 0));
  if (val > 0) return val;
  if (typeof localStorage !== 'undefined') {
    const stored = Number(localStorage.getItem(GDRIVE_BACKUP_RETENTION_KEY));
    return stored > 0 ? stored : 7;
  }
  return 7;
}

export function saveStoredDriveBackupRetentionLimit(limit: number): void {
  const val = Math.max(1, limit);
  saveStorage(GDRIVE_BACKUP_RETENTION_KEY, val);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(GDRIVE_BACKUP_RETENTION_KEY, String(val)); } catch {}
  }
}

/**
 * Load Google Identity Services (GSI) script dynamically
 */
let gisLoadingPromise: Promise<boolean> | null = null;

export function loadGisScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve(true);

  if (gisLoadingPromise) return gisLoadingPromise;

  gisLoadingPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('[googleDriveClient] Failed to load Google Identity Services SDK');
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return gisLoadingPromise;
}

/**
 * Request OAuth Access Token with drive.file scope via pure Google Identity Services
 */
export async function signInWithGoogleDrive(): Promise<{ user: GoogleDriveUser | null; error: Error | null }> {
  const clientId = getStoredDriveClientId();
  if (!clientId) {
    return {
      user: null,
      error: new Error('Google OAuth Client ID is required to connect to Google Drive. Please enter your Client ID below.'),
    };
  }
  return signInWithGis(clientId);
}

async function signInWithGis(clientId: string): Promise<{ user: GoogleDriveUser | null; error: Error | null }> {

  const loaded = await loadGisScript();
  if (!loaded) {
    return {
      user: null,
      error: new Error('Failed to load Google Identity Services. Check your internet connection.'),
    };
  }

  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        callback: async (resp: any) => {
          if (resp.error) {
            resolve({ user: null, error: new Error(resp.error_description || resp.error) });
            return;
          }

          const token = resp.access_token as string;
          const expiresIn = Number(resp.expires_in || 3600);
          saveStoredDriveToken(token, expiresIn);

          // Fetch user profile info
          try {
            const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (userinfoRes.ok) {
              const uData = await userinfoRes.json();
              const user: GoogleDriveUser = {
                email: uData.email || '',
                name: uData.name || uData.given_name || 'Google User',
                picture: uData.picture || '',
              };
              saveStoredDriveUser(user);
              resolve({ user, error: null });
              return;
            }
          } catch (fetchErr) {
            console.warn('[googleDriveClient] Failed to fetch user profile:', fetchErr);
          }

          const fallbackUser: GoogleDriveUser = { email: 'Connected', name: 'Google User' };
          saveStoredDriveUser(fallbackUser);
          resolve({ user: fallbackUser, error: null });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error_callback: (err: any) => {
          resolve({ user: null, error: new Error(err?.message || 'Authentication was cancelled or blocked.') });
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      resolve({ user: null, error: err as Error });
    }
  });
}

export function signOutFromGoogleDrive(): void {
  const token = getStoredDriveToken();
  if (token && typeof window !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      if (google?.accounts?.oauth2?.revoke) {
        google.accounts.oauth2.revoke(token, () => {});
      }
    } catch {}
  }
  clearStoredDriveToken();
}

/**
 * Drive API Helpers
 */
const FOLDER_NAME = 'Budget Control';
const FILE_NAME = 'budget-data.json';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = getStoredDriveToken();
  if (!token) {
    // Attempt silent background refresh before failing
    token = await refreshDriveTokenSilently();
  }
  if (!token) throw new Error('Not connected to Google Drive or session expired.');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // Token may have just been invalidated or revoked remotely; try one silent refresh
    clearStoredDriveToken();
    const freshToken = await refreshDriveTokenSilently();
    if (freshToken) {
      headers.set('Authorization', `Bearer ${freshToken}`);
      res = await fetch(url, { ...options, headers });
      if (res.ok) return res;
    }
    throw new Error('Google Drive session expired. Please click "Sign in with Google" to re-authorize.');
  }
  return res;
}

/**
 * Find or create visible 'Budget Control' folder in My Drive
 */
export async function getOrCreateBudgetFolder(): Promise<string> {
  // Check if folder already exists
  const query = encodeURIComponent(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const listRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`);
  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Failed to query Google Drive: ${errText}`);
  }

  const listData = (await listRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (listData.files && listData.files.length > 0) {
    return listData.files[0].id;
  }

  // Create folder if not found
  const createRes = await fetchWithAuth('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create 'Budget Control' folder: ${errText}`);
  }

  const folderData = (await createRes.json()) as { id: string };
  return folderData.id;
}

/**
 * Autonomous Upload to Google Drive ('My Drive / Budget Control / budget-data.json')
 */
export async function uploadBudgetToDrive(
  payload: unknown,
  options?: { isUserEdit?: boolean }
): Promise<GoogleDriveSyncResult> {
  try {
    const folderId = await getOrCreateBudgetFolder();
    const content = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

    // Check if budget-data.json already exists in folder
    const query = encodeURIComponent(`name = '${FILE_NAME}' and '${folderId}' in parents and trashed = false`);
    const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`);
    if (!searchRes.ok) {
      throw new Error('Failed to search for existing budget file in Google Drive');
    }

    const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
    const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

    if (existingFile) {
      // Overwrite existing file content directly in place (fast live sync)
      const updateRes = await fetchWithAuth(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to update budget file in Google Drive: ${updateRes.statusText}`);
      }

      // When triggered by an actual user edit, check daily backup and timed edit snapshot
      if (options?.isUserEdit) {
        void createDailyBackupIfNeeded(payload, folderId);
        void createEditSnapshotIfNeeded(payload, folderId);
      }

      const updatedData = (await updateRes.json()) as { id: string; modifiedTime?: string };
      return {
        success: true,
        fileId: updatedData.id,
        modifiedTime: updatedData.modifiedTime || new Date().toISOString(),
      };
    } else {
      // Create new file with multipart upload inside folder
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = {
        name: FILE_NAME,
        mimeType: 'application/json',
        parents: [folderId],
      };

      const multipartBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        closeDelimiter;

      const createRes = await fetchWithAuth('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!createRes.ok) {
        throw new Error(`Failed to upload budget file to Google Drive: ${createRes.statusText}`);
      }

      // When triggered by an actual user edit, check daily backup and timed edit snapshot
      if (options?.isUserEdit) {
        void createDailyBackupIfNeeded(payload, folderId);
        void createEditSnapshotIfNeeded(payload, folderId);
      }

      const createdData = (await createRes.json()) as { id: string; modifiedTime?: string };
      return {
        success: true,
        fileId: createdData.id,
        modifiedTime: createdData.modifiedTime || new Date().toISOString(),
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[googleDriveClient] upload error:', err);
    return { success: false, error: msg };
  }
}

/**
 * Autonomous Download from Google Drive ('My Drive / Budget Control / budget-data.json')
 */
export async function downloadBudgetFromDrive(): Promise<{
  success: boolean;
  payload?: unknown;
  modifiedTime?: string;
  error?: string;
}> {
  try {
    const folderId = await getOrCreateBudgetFolder();
    const query = encodeURIComponent(`name = '${FILE_NAME}' and '${folderId}' in parents and trashed = false`);
    const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`);
    if (!searchRes.ok) {
      throw new Error('Failed to find budget file in Google Drive');
    }

    const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
    const file = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

    if (!file) {
      return {
        success: false,
        error: "No 'budget-data.json' found in your Google Drive 'Budget Control' folder. Try 'Push to Drive' first.",
      };
    }

    // Download content
    const downloadRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
    if (!downloadRes.ok) {
      throw new Error(`Failed to download content: ${downloadRes.statusText}`);
    }

    const payload = await downloadRes.json();
    return {
      success: true,
      payload,
      modifiedTime: file.modifiedTime,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[googleDriveClient] download error:', err);
    return { success: false, error: msg };
  }
}

export const DAILY_BACKUPS_FOLDER_NAME = 'Daily Backups';
export const EDIT_SNAPSHOTS_FOLDER_NAME = 'Edit Snapshots';
export const USER_SNAPSHOTS_FOLDER_NAME = 'User Snapshots';
export const BACKUPS_FOLDER_NAME = 'Backups';

export interface DriveBackupItem {
  id: string;
  name: string;
  modifiedTime: string;
  size?: number;
}

export interface DriveLiveMetadata {
  folderId: string;
  folderUrl: string;
  fileId?: string;
  modifiedTime?: string;
  size?: number;
}

export function getFolderWebUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Generic helper to find or create a visible subfolder inside 'Budget Control'
 */
export async function getOrCreateSubfolder(parentFolderId: string, folderName: string): Promise<string> {
  const query = encodeURIComponent(`name = '${folderName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const listRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`);
  if (listRes.ok) {
    const listData = (await listRes.json()) as { files?: Array<{ id: string; name: string }> };
    if (listData.files && listData.files.length > 0) {
      return listData.files[0].id;
    }
  }

  const createRes = await fetchWithAuth('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create ${folderName} folder in Google Drive`);
  }

  const folderData = (await createRes.json()) as { id: string };
  return folderData.id;
}

export async function getOrCreateDailyBackupsFolder(budgetFolderId: string): Promise<string> {
  return getOrCreateSubfolder(budgetFolderId, DAILY_BACKUPS_FOLDER_NAME);
}

export async function getOrCreateEditSnapshotsFolder(budgetFolderId: string): Promise<string> {
  return getOrCreateSubfolder(budgetFolderId, EDIT_SNAPSHOTS_FOLDER_NAME);
}

export async function getOrCreateUserSnapshotsFolder(budgetFolderId: string): Promise<string> {
  return getOrCreateSubfolder(budgetFolderId, USER_SNAPSHOTS_FOLDER_NAME);
}

// Legacy alias for backward compatibility
export async function getOrCreateBackupsFolder(budgetFolderId: string): Promise<string> {
  return getOrCreateDailyBackupsFolder(budgetFolderId);
}

/**
 * Helper to upload a multipart file to a specific folder
 */
async function uploadFileToFolder(
  folderId: string,
  fileName: string,
  payload: unknown,
  description?: string
): Promise<{ id: string }> {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
    description: description || 'Budget Control file',
  };

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    closeDelimiter;

  const res = await fetchWithAuth('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload ${fileName}: ${res.statusText}`);
  }

  return (await res.json()) as { id: string };
}

/**
 * Permanently deletes excess files in a folder beyond maxFiles (oldest first).
 */
export async function pruneFolderFiles(folderId: string, maxFiles: number): Promise<number> {
  try {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20asc&fields=files(id,name,modifiedTime)`
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
    const files = data.files || [];
    if (files.length <= maxFiles) return 0;

    const excessCount = files.length - maxFiles;
    const toDelete = files.slice(0, excessCount);
    let deletedCount = 0;

    for (const f of toDelete) {
      try {
        const delRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
          method: 'DELETE',
        });
        if (delRes.ok) deletedCount++;
      } catch (e) {
        console.warn(`[googleDriveClient] Failed to prune ${f.name}:`, e);
      }
    }
    return deletedCount;
  } catch (err) {
    console.warn('[googleDriveClient] pruneFolderFiles error:', err);
    return 0;
  }
}

export const MAX_BACKUPS_CAP = 7;

/**
 * Prunes backups in the daily folder according to configured retention limit.
 */
export async function pruneOldBackups(backupsFolderId: string, customLimit?: number): Promise<number> {
  const limit = customLimit !== undefined ? customLimit : getStoredDriveBackupRetentionLimit();
  return pruneFolderFiles(backupsFolderId, limit);
}

/**
 * Automatically creates a daily backup in 'Daily Backups/' if not already created today.
 * Exact name: daily-YYYY-MM-DD.json (guarantees exactly 1 file per day).
 */
export async function createDailyBackupIfNeeded(payload: unknown, budgetFolderId: string): Promise<void> {
  if (!getStoredDriveDailySnapshotsEnabled()) return;

  try {
    const dailyFolderId = await getOrCreateDailyBackupsFolder(budgetFolderId);
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const fileName = `daily-${todayStr}.json`;

    // Exact name match query
    const query = encodeURIComponent(`name = '${fileName}' and '${dailyFolderId}' in parents and trashed = false`);
    const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
    if (searchRes.ok) {
      const data = (await searchRes.json()) as { files?: Array<{ id: string }> };
      if (data.files && data.files.length > 0) {
        return; // Today's daily backup already exists!
      }
    }

    await uploadFileToFolder(dailyFolderId, fileName, payload, 'Automated daily backup');
    await pruneFolderFiles(dailyFolderId, getStoredDriveBackupRetentionLimit());
  } catch (err) {
    console.warn('[googleDriveClient] createDailyBackupIfNeeded error:', err);
  }
}

export const MAX_EDIT_SNAPSHOTS_CAP = 5;
const LAST_EDIT_SNAPSHOT_KEY = 'budget-control-last-edit-snapshot-time';
const EDIT_SNAPSHOT_COOLDOWN_MS = 15 * 60 * 1000; // 15-minute session cooldown

/**
 * Automatically creates an edit session snapshot in 'Edit Snapshots/' (capped at 5).
 */
export async function createEditSnapshotIfNeeded(payload: unknown, budgetFolderId: string): Promise<void> {
  try {
    let lastTime = Number(loadStorageSync<number | string>(LAST_EDIT_SNAPSHOT_KEY, 0));
    if (!lastTime && typeof localStorage !== 'undefined') {
      lastTime = Number(localStorage.getItem(LAST_EDIT_SNAPSHOT_KEY) || '0');
    }
    const now = Date.now();
    if (now - lastTime < EDIT_SNAPSHOT_COOLDOWN_MS) {
      return; // Within edit session cooldown window
    }

    const editFolderId = await getOrCreateEditSnapshotsFolder(budgetFolderId);
    const dateStr = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const fileName = `edit-${dateStr}.json`;

    await uploadFileToFolder(editFolderId, fileName, payload, 'Timed edit session snapshot');
    saveStorage(LAST_EDIT_SNAPSHOT_KEY, String(now));
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(LAST_EDIT_SNAPSHOT_KEY, String(now)); } catch {}
    }

    await pruneFolderFiles(editFolderId, MAX_EDIT_SNAPSHOTS_CAP);
  } catch (err) {
    console.warn('[googleDriveClient] createEditSnapshotIfNeeded error:', err);
  }
}

/**
 * Creates a deliberate manual snapshot in 'User Snapshots/' when the user presses "Save Snapshot"
 */
export async function createUserSnapshot(
  payload: unknown,
  customLabel?: string
): Promise<{ success: boolean; fileId?: string; name?: string; error?: string }> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const userFolderId = await getOrCreateUserSnapshotsFolder(budgetFolderId);

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = customLabel
      ? `snapshot-${customLabel.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}-${dateStr}.json`
      : `snapshot-${dateStr}.json`;

    const res = await uploadFileToFolder(userFolderId, fileName, payload, 'User manual snapshot milestone');
    return {
      success: true,
      fileId: res.id,
      name: fileName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[googleDriveClient] createUserSnapshot error:', err);
    return { success: false, error: msg };
  }
}

// Legacy alias calling createUserSnapshot
export async function createDriveSnapshot(
  payload: unknown,
  customLabel?: string
): Promise<{ success: boolean; fileId?: string; name?: string; error?: string }> {
  return createUserSnapshot(payload, customLabel);
}

async function listFilesInFolder(folderId: string, pageSize = 30): Promise<DriveBackupItem[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetchWithAuth(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20desc&pageSize=${pageSize}&fields=files(id,name,modifiedTime,size)`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    files?: Array<{ id: string; name: string; modifiedTime: string; size?: string }>;
  };
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    size: f.size ? Number(f.size) : undefined,
  }));
}

export async function listDailyBackups(): Promise<DriveBackupItem[]> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const folderId = await getOrCreateDailyBackupsFolder(budgetFolderId);
    return listFilesInFolder(folderId, 40);
  } catch (err) {
    console.warn('[googleDriveClient] listDailyBackups error:', err);
    return [];
  }
}

export async function listEditSnapshots(): Promise<DriveBackupItem[]> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const folderId = await getOrCreateEditSnapshotsFolder(budgetFolderId);
    return listFilesInFolder(folderId, 15);
  } catch (err) {
    console.warn('[googleDriveClient] listEditSnapshots error:', err);
    return [];
  }
}

export async function listUserSnapshots(): Promise<DriveBackupItem[]> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const folderId = await getOrCreateUserSnapshotsFolder(budgetFolderId);
    return listFilesInFolder(folderId, 30);
  } catch (err) {
    console.warn('[googleDriveClient] listUserSnapshots error:', err);
    return [];
  }
}

export async function listDriveBackups(): Promise<DriveBackupItem[]> {
  return listDailyBackups();
}

/**
 * Download a specific backup file by ID
 */
export async function downloadBackupFile(fileId: string): Promise<{
  success: boolean;
  payload?: unknown;
  error?: string;
}> {
  try {
    const res = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) {
      throw new Error(`Failed to download backup file: ${res.statusText}`);
    }
    const payload = await res.json();
    return { success: true, payload };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Fetch live metadata about the Google Drive sync status & folder
 */
export async function getLiveDriveMetadata(): Promise<DriveLiveMetadata | null> {
  try {
    const folderId = await getOrCreateBudgetFolder();
    const folderUrl = getFolderWebUrl(folderId);

    const query = encodeURIComponent(`name = '${FILE_NAME}' and '${folderId}' in parents and trashed = false`);
    const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size)`);
    if (!searchRes.ok) {
      return { folderId, folderUrl };
    }

    const searchData = (await searchRes.json()) as {
      files?: Array<{ id: string; name: string; modifiedTime: string; size?: string }>;
    };

    const file = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;
    if (!file) {
      return { folderId, folderUrl };
    }

    return {
      folderId,
      folderUrl,
      fileId: file.id,
      modifiedTime: file.modifiedTime,
      size: file.size ? Number(file.size) : undefined,
    };
  } catch (err) {
    console.error('[googleDriveClient] getLiveDriveMetadata error:', err);
    return null;
  }
}

/**
 * Delete an individual backup file from Google Drive permanently
 */
export async function deleteDriveBackupFile(fileId: string): Promise<boolean> {
  try {
    const res = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.error('[googleDriveClient] deleteDriveBackupFile error:', err);
    return false;
  }
}

/**
 * Permanently deletes all files in 'Daily Backups/'
 */
export async function clearDailyBackups(): Promise<number> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const folderId = await getOrCreateDailyBackupsFolder(budgetFolderId);
    return pruneFolderFiles(folderId, 0);
  } catch (err) {
    console.error('[googleDriveClient] clearDailyBackups error:', err);
    return 0;
  }
}

/**
 * Permanently deletes all files in 'Edit Snapshots/'
 */
export async function clearEditSnapshots(): Promise<number> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const folderId = await getOrCreateEditSnapshotsFolder(budgetFolderId);
    return pruneFolderFiles(folderId, 0);
  } catch (err) {
    console.error('[googleDriveClient] clearEditSnapshots error:', err);
    return 0;
  }
}

/**
 * Permanently deletes all files in 'User Snapshots/'
 */
export async function clearUserSnapshots(): Promise<number> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const folderId = await getOrCreateUserSnapshotsFolder(budgetFolderId);
    return pruneFolderFiles(folderId, 0);
  } catch (err) {
    console.error('[googleDriveClient] clearUserSnapshots error:', err);
    return 0;
  }
}

/**
 * Delete all backup files in 'Budget Control / Backups /' (keeps live budget-data.json intact)
 */
export async function clearAllDriveBackups(): Promise<number> {
  try {
    const budgetFolderId = await getOrCreateBudgetFolder();
    const backupsFolderId = await getOrCreateBackupsFolder(budgetFolderId);
    const query = encodeURIComponent(`'${backupsFolderId}' in parents and trashed = false`);
    const res = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
    if (!res.ok) return 0;
    const data = (await res.json()) as { files?: Array<{ id: string }> };
    const files = data.files || [];
    let count = 0;
    for (const file of files) {
      const delRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: 'DELETE',
      });
      if (delRes.ok) count++;
    }
    return count;
  } catch (err) {
    console.error('[googleDriveClient] clearAllDriveBackups error:', err);
    return 0;
  }
}

export interface GoogleDriveStorageQuota {
  limit?: number;
  usage?: number;
  usageInDrive?: number;
}

/**
 * Fetch Google Drive storage quota telemetry
 */
export async function getGoogleDriveStorageQuota(): Promise<GoogleDriveStorageQuota | null> {
  try {
    const res = await fetchWithAuth('https://www.googleapis.com/drive/v3/about?fields=storageQuota');
    if (!res.ok) return null;
    const data = (await res.json()) as {
      storageQuota?: {
        limit?: string;
        usage?: string;
        usageInDrive?: string;
      };
    };
    if (!data.storageQuota) return null;
    return {
      limit: data.storageQuota.limit ? Number(data.storageQuota.limit) : undefined,
      usage: data.storageQuota.usage ? Number(data.storageQuota.usage) : undefined,
      usageInDrive: data.storageQuota.usageInDrive ? Number(data.storageQuota.usageInDrive) : undefined,
    };
  } catch (err) {
    console.warn('[googleDriveClient] getGoogleDriveStorageQuota error:', err);
    return null;
  }
}
