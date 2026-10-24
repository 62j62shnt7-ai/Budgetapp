import {
  saveStorage,
  loadStorageSync,
  removeStorage,
} from '../utils/storageAdapter';
import type { GoogleDriveUser, GoogleDriveSyncResult, DriveBackupItem, DriveLiveMetadata, GoogleDriveStorageQuota } from './googleDriveTypes';

export * from './googleDriveTypes';

const GDRIVE_CLIENT_ID_KEY = 'budget-control-gdrive-client-id';
const GDRIVE_TOKEN_KEY = 'budget-control-gdrive-token';
const GDRIVE_TOKEN_EXPIRY_KEY = 'budget-control-gdrive-token-expiry';
const GDRIVE_REFRESH_TOKEN_KEY = 'budget-control-gdrive-refresh-token';
const GDRIVE_USER_KEY = 'budget-control-gdrive-user';
const GDRIVE_AUTO_SYNC_KEY = 'budget-control-gdrive-auto-sync';
const GDRIVE_AUTH_PROXY_URL_KEY = 'budget-control-gdrive-auth-proxy-url';

const DEFAULT_GOOGLE_CLIENT_ID = '191333657161-aqptqa80usrujqbuqckp15ddf9ib8g7t.apps.googleusercontent.com';

export function getStoredDriveAuthProxyUrl(): string {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DRIVE_AUTH_PROXY_URL
    ? String(import.meta.env.VITE_DRIVE_AUTH_PROXY_URL).trim()
    : '';
  let stored = loadStorageSync<string>(GDRIVE_AUTH_PROXY_URL_KEY, '');
  if (!stored && typeof localStorage !== 'undefined') {
    stored = localStorage.getItem(GDRIVE_AUTH_PROXY_URL_KEY) || '';
  }
  return stored || envUrl;
}

export function saveStoredDriveAuthProxyUrl(url: string): void {
  const trimmed = url.trim();
  if (trimmed) {
    saveStorage(GDRIVE_AUTH_PROXY_URL_KEY, trimmed);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(GDRIVE_AUTH_PROXY_URL_KEY, trimmed); } catch {}
    }
  } else {
    void removeStorage(GDRIVE_AUTH_PROXY_URL_KEY);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(GDRIVE_AUTH_PROXY_URL_KEY); } catch {}
    }
  }
}

export function getStoredDriveRefreshToken(): string | null {
  let token = loadStorageSync<string | null>(GDRIVE_REFRESH_TOKEN_KEY, null);
  if (!token && typeof localStorage !== 'undefined') {
    token = localStorage.getItem(GDRIVE_REFRESH_TOKEN_KEY);
    if (token) {
      saveStorage(GDRIVE_REFRESH_TOKEN_KEY, token);
      try { localStorage.removeItem(GDRIVE_REFRESH_TOKEN_KEY); } catch {}
    }
  }
  return token || null;
}

export function saveStoredDriveRefreshToken(refreshToken: string): void {
  const trimmed = refreshToken.trim();
  if (trimmed) {
    saveStorage(GDRIVE_REFRESH_TOKEN_KEY, trimmed);
  } else {
    void removeStorage(GDRIVE_REFRESH_TOKEN_KEY);
  }
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(GDRIVE_REFRESH_TOKEN_KEY); } catch {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let preInitializedTokenClient: any = null;

export async function preWarmGisTokenClient(): Promise<boolean> {
  const user = getStoredDriveUser();
  const clientId = getStoredDriveClientId();
  if (!user || !clientId || typeof window === 'undefined') return false;

  const loaded = await loadGisScript();
  if (!loaded) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) return false;

    preInitializedTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      hint: user.email,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (resp: any) => {
        if (resp.error || !resp.access_token) {
          console.warn('[googleDriveClient] Pre-warmed token refresh failed:', resp.error);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('budget-drive-token-failed', { detail: { error: resp.error } }));
          }
          return;
        }
        const token = resp.access_token as string;
        const expiresIn = Number(resp.expires_in || 3600);
        saveStoredDriveToken(token, expiresIn);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('budget-drive-token-refreshed', { detail: { token } }));
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error_callback: (err: any) => {
        console.warn('[googleDriveClient] Pre-warmed token refresh error:', err);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('budget-drive-token-failed', { detail: { error: err } }));
        }
      },
    });
    return true;
  } catch (err) {
    console.warn('[googleDriveClient] Failed to pre-warm token client:', err);
    return false;
  }
}

export function requestSilentTokenOnUserGesture(): boolean {
  if (!preInitializedTokenClient) return false;
  try {
    preInitializedTokenClient.requestAccessToken({ prompt: '' });
    return true;
  } catch (err) {
    console.warn('[googleDriveClient] Failed to execute silent token on user gesture:', err);
    return false;
  }
}

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
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveTokenRefresh(expiresInSeconds: number): void {
  if (typeof window === 'undefined') return;
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  const delayMs = Math.max(60_000, (expiresInSeconds - 300) * 1000);
  proactiveRefreshTimer = setTimeout(() => {
    proactiveRefreshTimer = null;
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void refreshDriveTokenSilently({ force: true });
    }
  }, delayMs);
}

/**
 * Refresh Google Drive OAuth access token silently:
 * Strategy 1: Serverless token proxy with refresh_token if proxy URL is available
 * Strategy 2: GIS silent token request (prompt: '')
 */
export async function refreshDriveTokenSilently(options?: { force?: boolean }): Promise<string | null> {
  const user = getStoredDriveUser();
  if (!user) return null;

  if (!options?.force) {
    const validToken = getStoredDriveToken();
    if (validToken) return validToken;
  }

  if (silentRefreshPromise) return silentRefreshPromise;

  const clientId = getStoredDriveClientId();
  if (!clientId || typeof window === 'undefined') return null;

  silentRefreshPromise = (async () => {
    // Strategy 1: Serverless Auth Proxy with refresh_token
    const refreshToken = getStoredDriveRefreshToken();
    const proxyUrl = getStoredDriveAuthProxyUrl();
    if (refreshToken && proxyUrl) {
      try {
        const refreshEndpoint = `${proxyUrl.replace(/\/+$/, '')}/auth/refresh`;
        const res = await fetch(refreshEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            refresh_token: refreshToken,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            const token = data.access_token as string;
            const expiresIn = Number(data.expires_in || 3600);
            saveStoredDriveToken(token, expiresIn);
            return token;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData.error === 'invalid_grant' || res.status === 400) {
            console.warn('[googleDriveClient] Refresh token invalid or revoked (invalid_grant)');
            clearStoredDriveToken();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('budget-drive-token-failed', { detail: { error: 'invalid_grant' } }));
            }
            return null;
          }
        }
      } catch (proxyErr) {
        console.warn('[googleDriveClient] Proxy refresh error, falling back to GIS:', proxyErr);
      }
    }

    // Strategy 2: GIS token client silent refresh
    const loaded = await loadGisScript();
    if (!loaded) return null;

    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (val: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(val);
      };
      const timeoutId = setTimeout(() => {
        console.warn('[googleDriveClient] Silent token refresh timed out after 10s');
        finish(null);
      }, 10_000);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const google = (window as any).google;
        if (!google?.accounts?.oauth2) {
          finish(null);
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
              finish(null);
              return;
            }
            const token = resp.access_token as string;
            const expiresIn = Number(resp.expires_in || 3600);
            saveStoredDriveToken(token, expiresIn);
            finish(token);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error_callback: (err: any) => {
            console.warn('[googleDriveClient] Silent token refresh error callback:', err);
            finish(null);
          },
        });

        client.requestAccessToken({ prompt: '' });
      } catch (err) {
        console.warn('[googleDriveClient] Silent token refresh exception:', err);
        finish(null);
      }
    });
  })().finally(() => {
    silentRefreshPromise = null;
  });

  return silentRefreshPromise;
}

export function getStoredDriveToken(): string | null {
  let token = loadStorageSync<string | null>(GDRIVE_TOKEN_KEY, null);
  let expiry = Number(loadStorageSync<number>(GDRIVE_TOKEN_EXPIRY_KEY, 0));
  if ((!token || !expiry) && typeof localStorage !== 'undefined') {
    token = token || localStorage.getItem(GDRIVE_TOKEN_KEY);
    expiry = expiry || Number(localStorage.getItem(GDRIVE_TOKEN_EXPIRY_KEY) || '0');
  }
  if (!token || Date.now() >= expiry) {
    return null;
  }
  return token;
}

export function checkAndProactivelyRefreshDriveToken(): void {
  const token = loadStorageSync<string | null>(GDRIVE_TOKEN_KEY, null);
  const expiry = Number(loadStorageSync<number>(GDRIVE_TOKEN_EXPIRY_KEY, 0));
  if (token && expiry && expiry - Date.now() < 5 * 60 * 1000 && !silentRefreshPromise) {
    void refreshDriveTokenSilently({ force: true });
  }
}

export function saveStoredDriveToken(token: string, expiresInSeconds: number): void {
  const expiry = Date.now() + Math.max(0, (expiresInSeconds - 60) * 1000);
  saveStorage(GDRIVE_TOKEN_KEY, token);
  saveStorage(GDRIVE_TOKEN_EXPIRY_KEY, expiry);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(GDRIVE_TOKEN_KEY, token);
      localStorage.setItem(GDRIVE_TOKEN_EXPIRY_KEY, String(expiry));
    } catch {}
  }
  scheduleProactiveTokenRefresh(expiresInSeconds);
}

/**
 * 0.1 Hotfix: Clear ONLY the access token & expiry on 401.
 * Retains user profile & refresh token so silent refresh can recover without forcing re-sign-in.
 */
export function clearAccessTokenOnly(): void {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  preInitializedTokenClient = null;
  void removeStorage(GDRIVE_TOKEN_KEY);
  void removeStorage(GDRIVE_TOKEN_EXPIRY_KEY);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      localStorage.removeItem(GDRIVE_TOKEN_EXPIRY_KEY);
    } catch {}
  }
}

/**
 * Total clearance (called only on explicit sign-out or invalid_grant)
 */
export function clearStoredDriveToken(): void {
  clearAccessTokenOnly();
  void removeStorage(GDRIVE_REFRESH_TOKEN_KEY);
  void removeStorage(GDRIVE_USER_KEY);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(GDRIVE_REFRESH_TOKEN_KEY);
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

let gisLoadingPromise: Promise<boolean> | null = null;

export function loadGisScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve(true);

  if (gisLoadingPromise) return gisLoadingPromise;

  gisLoadingPromise = new Promise((resolve) => {
    const finish = (ok: boolean) => {
      if (!ok) gisLoadingPromise = null;
      resolve(ok);
    };
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).google?.accounts?.oauth2) {
        finish(true);
        return;
      }
      existing.addEventListener('load', () => finish(true), { once: true });
      existing.addEventListener('error', () => finish(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => finish(true);
    script.onerror = () => {
      console.warn('[googleDriveClient] Failed to load Google Identity Services SDK');
      finish(false);
    };
    document.head.appendChild(script);
  });

  return gisLoadingPromise;
}

/**
 * Sign in to Google Drive:
 * 1. If auth proxy URL is configured, use initCodeClient (popup) with auth code exchange
 * 2. Otherwise fall back to GIS initTokenClient
 */
export async function signInWithGoogleDrive(): Promise<{ user: GoogleDriveUser | null; error: Error | null }> {
  const clientId = getStoredDriveClientId();
  if (!clientId) {
    return {
      user: null,
      error: new Error('Google OAuth Client ID is required to connect to Google Drive.'),
    };
  }

  const proxyUrl = getStoredDriveAuthProxyUrl();
  if (proxyUrl) {
    return signInWithCodeFlow(clientId, proxyUrl);
  }
  return signInWithGis(clientId);
}

async function signInWithCodeFlow(clientId: string, proxyUrl: string): Promise<{ user: GoogleDriveUser | null; error: Error | null }> {
  const loaded = await loadGisScript();
  if (!loaded) {
    return { user: null, error: new Error('Failed to load Google Identity Services.') };
  }

  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      const client = g.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        ux_mode: 'popup',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        callback: async (resp: any) => {
          if (resp.error || !resp.code) {
            resolve({ user: null, error: new Error(resp.error_description || resp.error || 'Sign-in cancelled') });
            return;
          }

          try {
            const exchangeEndpoint = `${proxyUrl.replace(/\/+$/, '')}/auth/exchange`;
            const tokenRes = await fetch(exchangeEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: clientId,
                code: resp.code,
                redirect_uri: 'postmessage',
              }),
            });

            if (!tokenRes.ok) {
              const err = await tokenRes.json().catch(() => ({}));
              throw new Error(err.error_description || err.error || 'Failed to exchange authorization code');
            }

            const tokenData = await tokenRes.json();
            const token = tokenData.access_token as string;
            const expiresIn = Number(tokenData.expires_in || 3600);
            saveStoredDriveToken(token, expiresIn);
            if (tokenData.refresh_token) {
              saveStoredDriveRefreshToken(tokenData.refresh_token);
            }

            const userinfo = await fetchUserProfile(token);
            saveStoredDriveUser(userinfo);
            resolve({ user: userinfo, error: null });
          } catch (exchangeErr) {
            resolve({ user: null, error: exchangeErr as Error });
          }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error_callback: (err: any) => {
          resolve({ user: null, error: new Error(err?.message || 'Authentication cancelled') });
        },
      });

      client.requestCode();
    } catch (err) {
      resolve({ user: null, error: err as Error });
    }
  });
}

async function fetchUserProfile(token: string): Promise<GoogleDriveUser> {
  try {
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (userinfoRes.ok) {
      const uData = await userinfoRes.json();
      return {
        email: uData.email || '',
        name: uData.name || uData.given_name || 'Google User',
        picture: uData.picture || '',
      };
    }
  } catch (err) {
    console.warn('[googleDriveClient] Failed to fetch user profile:', err);
  }
  return { email: 'Connected', name: 'Google User' };
}

async function signInWithGis(clientId: string): Promise<{ user: GoogleDriveUser | null; error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = typeof window !== 'undefined' ? (window as any).google : null;
  if (!google?.accounts?.oauth2) {
    const loaded = await loadGisScript();
    if (!loaded) {
      return {
        user: null,
        error: new Error('Failed to load Google Identity Services. Check your internet connection.'),
      };
    }
  }

  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      const client = g.accounts.oauth2.initTokenClient({
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

          const user = await fetchUserProfile(token);
          saveStoredDriveUser(user);
          resolve({ user, error: null });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error_callback: (err: any) => {
          resolve({ user: null, error: new Error(err?.message || 'Authentication was cancelled or blocked.') });
        },
      });

      const currentUser = getStoredDriveUser();
      client.requestAccessToken({ prompt: currentUser?.email ? '' : 'select_account', hint: currentUser?.email || undefined });
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
 * Drive API Helpers & Backoff Retry
 */
const FOLDER_NAME = 'Budget Control';
const FILE_NAME = 'budget-data.json';
export const DUPLICATES_FOLDER_NAME = 'Duplicates';

export let retryDelayMultiplier = 1; // Can be reduced to 0 in tests for fast execution
export function setRetryDelayMultiplier(val: number) {
  retryDelayMultiplier = val;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;
    let token = getStoredDriveToken();
    if (!token) {
      token = await refreshDriveTokenSilently();
    }
    if (!token) throw new Error('Not connected to Google Drive or session expired.');

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        clearAccessTokenOnly();
        const freshToken = await refreshDriveTokenSilently({ force: true });
        if (freshToken) {
          headers.set('Authorization', `Bearer ${freshToken}`);
          const retryRes = await fetch(url, { ...options, headers });
          if (retryRes.ok) return retryRes;
        }
        throw new Error('Google Drive session expired. Please click "Sign in with Google" to re-authorize.');
      }

      const isRetryable = res.status === 429 || (res.status >= 500 && res.status <= 504);
      if (isRetryable && attempt <= maxRetries) {
        const delay = Math.min(2000, Math.pow(2, attempt) * 200 + Math.random() * 100) * retryDelayMultiplier;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (networkErr) {
      const isAuthExpired = (networkErr as Error).message?.includes('session expired');
      if (isAuthExpired || attempt > maxRetries) {
        throw networkErr;
      }
      const delay = Math.min(2000, Math.pow(2, attempt) * 200 + Math.random() * 100) * retryDelayMultiplier;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('Google Drive request failed after retries.');
}

let cachedBudgetFolderId: string | null = null;
let cachedLiveFileId: string | null = null;
const cachedSubfolderIds = new Map<string, string>();
let budgetFolderPromise: Promise<string> | null = null;
const subfolderPromises = new Map<string, Promise<string>>();

export function invalidateDriveCaches(): void {
  cachedBudgetFolderId = null;
  cachedLiveFileId = null;
  cachedSubfolderIds.clear();
}

export async function getOrCreateBudgetFolder(): Promise<string> {
  if (cachedBudgetFolderId) return cachedBudgetFolderId;
  if (budgetFolderPromise) return budgetFolderPromise;

  budgetFolderPromise = (async () => {
    const query = encodeURIComponent(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const listRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`);
    if (!listRes.ok) {
      const errText = await listRes.text();
      throw new Error(`Failed to query Google Drive: ${errText}`);
    }

    const listData = (await listRes.json()) as { files?: Array<{ id: string; name: string }> };
    if (listData.files && listData.files.length > 0) {
      cachedBudgetFolderId = listData.files[0].id;
      return cachedBudgetFolderId;
    }

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
    cachedBudgetFolderId = folderData.id;
    return cachedBudgetFolderId;
  })().finally(() => {
    budgetFolderPromise = null;
  });

  return budgetFolderPromise;
}

export async function getOrCreateSubfolder(parentFolderId: string, folderName: string): Promise<string> {
  const cacheKey = `${parentFolderId}::${folderName}`;
  if (cachedSubfolderIds.has(cacheKey)) {
    return cachedSubfolderIds.get(cacheKey)!;
  }
  if (subfolderPromises.has(cacheKey)) {
    return subfolderPromises.get(cacheKey)!;
  }

  const promise = (async () => {
    const query = encodeURIComponent(`name = '${folderName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const listRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`);
    if (listRes.ok) {
      const listData = (await listRes.json()) as { files?: Array<{ id: string; name: string }> };
      if (listData.files && listData.files.length > 0) {
        cachedSubfolderIds.set(cacheKey, listData.files[0].id);
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
    cachedSubfolderIds.set(cacheKey, folderData.id);
    return folderData.id;
  })().finally(() => {
    subfolderPromises.delete(cacheKey);
  });

  subfolderPromises.set(cacheKey, promise);
  return promise;
}

export async function getOrCreateDuplicatesFolder(budgetFolderId: string): Promise<string> {
  return getOrCreateSubfolder(budgetFolderId, DUPLICATES_FOLDER_NAME);
}

// Track uploaded conflict snapshots to prevent spamming on retries (0.7)
let lastConflictSnapshotKey = '';
export function clearConflictSnapshotDeduplication(): void {
  lastConflictSnapshotKey = '';
}

/**
 * Upload to Google Drive:
 * - Query with orderBy=createdTime asc to deterministically pick oldest
 * - Moves duplicate files to Duplicates/ subfolder
 * - Awaited conflict snapshot creation without duplicate spamming
 * - Compact JSON payload for bandwidth efficiency
 */
export async function uploadBudgetToDrive(
  payload: unknown,
  options?: {
    isUserEdit?: boolean;
    expectedModifiedTime?: string | null;
    forceOverwrite?: boolean;
    localHash?: string;
  }
): Promise<GoogleDriveSyncResult> {
  try {
    const folderId = await getOrCreateBudgetFolder();
    // Compact JSON stringification (Phase 3 / M5)
    const content = typeof payload === 'string' ? payload : JSON.stringify(payload);

    let existingFile: { id: string; name: string; modifiedTime?: string } | null = null;
    if (cachedLiveFileId) {
      const getRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${cachedLiveFileId}?fields=id,name,modifiedTime,trashed`);
      if (getRes.ok) {
        const data = (await getRes.json()) as { id: string; name: string; modifiedTime?: string; trashed?: boolean };
        if (!data.trashed && data.id) {
          existingFile = data;
        } else {
          cachedLiveFileId = null;
        }
      } else if (getRes.status === 404) {
        cachedLiveFileId = null;
      }
    }

    if (!existingFile) {
      // Query with orderBy=createdTime asc (H5 / Phase 3)
      const query = encodeURIComponent(`name = '${FILE_NAME}' and '${folderId}' in parents and trashed = false`);
      const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime%20asc&fields=files(id,name,modifiedTime,createdTime)`);
      if (!searchRes.ok) {
        throw new Error('Failed to search for existing budget file in Google Drive');
      }

      const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
      const files = searchData.files || [];
      if (files.length > 0) {
        existingFile = files[0];
        cachedLiveFileId = existingFile.id;

        // Move excess duplicate files into Duplicates/ folder
        if (files.length > 1) {
          void (async () => {
            try {
              const dupFolderId = await getOrCreateDuplicatesFolder(folderId);
              for (const dup of files.slice(1)) {
                await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${dup.id}?addParents=${dupFolderId}&removeParents=${folderId}`, {
                  method: 'PATCH',
                });
              }
            } catch (dupErr) {
              console.warn('[googleDriveClient] Failed to quarantine duplicate files:', dupErr);
            }
          })();
        }
      }
    }

    if (existingFile) {
      // Optimistic Concurrency Control Check
      if (
        !options?.forceOverwrite &&
        options?.expectedModifiedTime &&
        existingFile.modifiedTime &&
        existingFile.modifiedTime !== options.expectedModifiedTime
      ) {
        console.warn('[googleDriveClient] Concurrency conflict detected: remote', existingFile.modifiedTime, '!= expected', options.expectedModifiedTime);
        
        // 0.7: Write conflict snapshot once per (remoteModifiedTime, localHash) pair & await it
        const conflictKey = `${existingFile.modifiedTime}::${options.localHash || ''}`;
        if (conflictKey !== lastConflictSnapshotKey) {
          lastConflictSnapshotKey = conflictKey;
          const editFolderId = await getOrCreateEditSnapshotsFolder(folderId);
          const timeStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          await uploadFileToFolder(
            editFolderId,
            `conflict-${timeStr}.json`,
            payload,
            'Auto-saved conflict snapshot before reconciliation'
          );
        }

        return {
          success: false,
          conflict: true,
          fileId: existingFile.id,
          remoteModifiedTime: existingFile.modifiedTime,
          error: 'Remote data in Google Drive was modified on another device.',
        };
      }

      // Overwrite existing file content directly
      const updateRes = await fetchWithAuth(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to update budget file in Google Drive: ${updateRes.statusText}`);
      }

      if (options?.isUserEdit) {
        void createDailyBackupIfNeeded(payload, folderId);
        void createEditSnapshotIfNeeded(payload, folderId);
      }

      const updatedData = (await updateRes.json()) as { id: string; modifiedTime?: string };
      cachedLiveFileId = updatedData.id;
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

      if (options?.isUserEdit) {
        void createDailyBackupIfNeeded(payload, folderId);
        void createEditSnapshotIfNeeded(payload, folderId);
      }

      const createdData = (await createRes.json()) as { id: string; modifiedTime?: string };
      cachedLiveFileId = createdData.id;
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
 * Download from Google Drive
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
    const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime%20asc&fields=files(id,name,modifiedTime)`);
    if (!searchRes.ok) {
      throw new Error('Failed to find budget file in Google Drive');
    }

    const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
    const files = searchData.files || [];
    const file = files.length > 0 ? files[0] : null;

    if (!file) {
      return {
        success: false,
        error: "No 'budget-data.json' found in your Google Drive 'Budget Control' folder. Try 'Push to Drive' first.",
      };
    }

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

export function getFolderWebUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
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

export async function getOrCreateBackupsFolder(budgetFolderId: string): Promise<string> {
  return getOrCreateDailyBackupsFolder(budgetFolderId);
}

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
 * Excludes conflict-* files from being pruned in Edit Snapshots/ (0.7).
 */
export async function pruneFolderFiles(folderId: string, maxFiles: number): Promise<number> {
  try {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20asc&fields=files(id,name,modifiedTime)`
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
    const rawFiles = data.files || [];
    
    // Protect conflict-* snapshot files from rolling prune
    const prunableFiles = rawFiles.filter((f) => !f.name.startsWith('conflict-'));
    if (prunableFiles.length <= maxFiles) return 0;

    const excessCount = prunableFiles.length - maxFiles;
    const toDelete = prunableFiles.slice(0, excessCount);
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

export async function pruneOldBackups(backupsFolderId: string, customLimit?: number): Promise<number> {
  const limit = customLimit !== undefined ? customLimit : getStoredDriveBackupRetentionLimit();
  return pruneFolderFiles(backupsFolderId, limit);
}

/**
 * Creates daily backup if not already present.
 */
export async function createDailyBackupIfNeeded(payload: unknown, budgetFolderId: string): Promise<void> {
  if (!getStoredDriveDailySnapshotsEnabled()) return;

  try {
    const dailyFolderId = await getOrCreateDailyBackupsFolder(budgetFolderId);
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fileName = `daily-${todayStr}.json`;

    const query = encodeURIComponent(`name = '${fileName}' and '${dailyFolderId}' in parents and trashed = false`);
    const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
    if (searchRes.ok) {
      const data = (await searchRes.json()) as { files?: Array<{ id: string }> };
      if (data.files && data.files.length > 0) {
        return;
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
const EDIT_SNAPSHOT_COOLDOWN_MS = 15 * 60 * 1000;

export async function createEditSnapshotIfNeeded(payload: unknown, budgetFolderId: string): Promise<void> {
  try {
    let lastTime = Number(loadStorageSync<number | string>(LAST_EDIT_SNAPSHOT_KEY, 0));
    if (!lastTime && typeof localStorage !== 'undefined') {
      lastTime = Number(localStorage.getItem(LAST_EDIT_SNAPSHOT_KEY) || '0');
    }
    const now = Date.now();
    if (now - lastTime < EDIT_SNAPSHOT_COOLDOWN_MS) {
      return;
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

export async function getLiveDriveMetadata(): Promise<DriveLiveMetadata | null> {
  try {
    const folderId = await getOrCreateBudgetFolder();
    const folderUrl = getFolderWebUrl(folderId);

    const query = encodeURIComponent(`name = '${FILE_NAME}' and '${folderId}' in parents and trashed = false`);
    const searchRes = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime%20asc&fields=files(id,name,modifiedTime,size)`);
    if (!searchRes.ok) {
      return { folderId, folderUrl };
    }

    const searchData = (await searchRes.json()) as {
      files?: Array<{ id: string; name: string; modifiedTime: string; size?: string }>;
    };

    const files = searchData.files || [];
    const file = files.length > 0 ? files[0] : null;
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
