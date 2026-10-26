/**
 * High-Capacity Storage Adapter (IndexedDB-First Architecture)
 *
 * Provides persistent, non-blocking, asynchronous persistence backed directly
 * by IndexedDB (idb-keyval) with an internal in-memory cache for synchronous reads.
 * Completely replaces localStorage across the application.
 */
import { get, set, del, getMany, setMany, clear, entries as idbEntries } from 'idb-keyval';
import type { UndoableAction } from '../types';

export const isIndexedDBAvailable =
  typeof window !== 'undefined' &&
  typeof window.indexedDB !== 'undefined' &&
  window.indexedDB !== null;

const MIGRATED_FLAG_KEY = 'budget-control-migrated-to-idb';
const UNDO_HISTORY_KEY = 'budget-control-undo-history-v2';

// In-memory synchronous cache populated on startup & updated on every write
const memoryStore = new Map<string, unknown>();

/**
 * BroadcastChannel for cross-tab conflict detection & synchronization
 */
export const SYNC_CHANNEL_NAME = 'budget-control-sync-channel';

let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch {
    syncChannel = null;
  }
}

export function notifyStorageChange(key: string, data?: unknown): void {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type: 'storage_change', key, data, timestamp: Date.now() });
    } catch {
      // Ignore broadcast errors
    }
  }
}

export function onStorageChange(callback: (key: string, data?: unknown) => void): () => void {
  if (!syncChannel) {
    return () => {};
  }
  const handler = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && event.data.type === 'storage_change') {
      callback(String(event.data.key || ''), event.data.data);
    }
  };
  syncChannel.addEventListener('message', handler);
  return () => {
    syncChannel?.removeEventListener('message', handler);
  };
}

/**
 * Synchronous read from the in-memory cache with fallback.
 */
export function loadStorageSync<T>(key: string, fallback: T): T {
  if (memoryStore.has(key)) {
    const val = memoryStore.get(key);
    if (val !== undefined && val !== null) {
      if (Array.isArray(fallback) && !Array.isArray(val)) return fallback;
      if (typeof fallback === 'string' && typeof val !== 'string') return fallback;
      if (typeof fallback === 'number') {
        if (typeof val === 'number' && !isNaN(val)) return val as T;
        if (typeof val === 'string' && val.trim() !== '') {
          const parsed = Number(val);
          if (!isNaN(parsed)) return parsed as T;
        }
        return fallback;
      }
      if (typeof fallback === 'boolean' && typeof val !== 'boolean') return fallback;
      return val as T;
    }
  }
  return fallback;
}

/**
 * Asynchronous read prioritizing IndexedDB, falling back to memoryStore.
 */
export async function loadStorageAsync<T>(key: string, fallback: T): Promise<T> {
  if (isIndexedDBAvailable) {
    try {
      const val = await get<T>(key);
      if (val !== undefined && val !== null) {
        memoryStore.set(key, val);
        return val;
      }
    } catch (err) {
      console.warn(`[storageAdapter] IndexedDB get error for ${key}:`, err);
    }
  }
  return loadStorageSync(key, fallback);
}

/**
 * Asynchronous, non-blocking write to IndexedDB & memoryStore.
 */
export async function saveStorageAsync<T>(key: string, value: T): Promise<void> {
  memoryStore.set(key, value);
  notifyStorageChange(key);

  if (isIndexedDBAvailable) {
    try {
      await set(key, value);
    } catch (err) {
      console.error(`[storageAdapter] IndexedDB set error for ${key}:`, err);
    }
  }
}

/**
 * Direct non-blocking save to IndexedDB & memoryStore.
 */
export function saveStorage<T>(key: string, value: T): void {
  memoryStore.set(key, value);
  notifyStorageChange(key, value);

  if (isIndexedDBAvailable) {
    set(key, value).catch((err) => {
      console.error(`[storageAdapter] Async saveStorage failed for ${key}:`, err);
    });
  }
}

/**
 * Atomic batch save to IndexedDB & memoryStore in a single readwrite transaction.
 */
export function saveStorageBatch(entries: Array<[string, unknown]>): void {
  if (!entries || entries.length === 0) return;
  for (const [key, value] of entries) {
    memoryStore.set(key, value);
  }
  notifyStorageChange('__batch__', entries.map(([k]) => k));

  if (isIndexedDBAvailable) {
    setMany(entries).catch((err) => {
      console.error('[storageAdapter] Async saveStorageBatch failed:', err);
    });
  }
}

/**
 * Async atomic batch save to IndexedDB & memoryStore.
 */
export async function saveStorageBatchAsync(entries: Array<[string, unknown]>): Promise<void> {
  if (!entries || entries.length === 0) return;
  for (const [key, value] of entries) {
    memoryStore.set(key, value);
  }
  notifyStorageChange('__batch__', entries.map(([k]) => k));

  if (isIndexedDBAvailable) {
    try {
      await setMany(entries);
    } catch (err) {
      console.error('[storageAdapter] Async saveStorageBatchAsync failed:', err);
    }
  }
}

/**
 * Delete a key from storage.
 */
export async function removeStorage(key: string): Promise<void> {
  memoryStore.delete(key);
  notifyStorageChange(key);

  if (isIndexedDBAvailable) {
    try {
      await del(key);
    } catch (err) {
      console.error(`[storageAdapter] del error for ${key}:`, err);
    }
  }
}

/**
 * Automatic one-time migration: copies existing localStorage keys into IndexedDB,
 * caches them into memoryStore, then cleans up localStorage.
 */
export async function migrateFromLocalStorageIfNeeded(
  allStorageKeys: Record<string, string>
): Promise<{ migrated: boolean; count: number }> {
  try {
    let isMigrated = false;
    if (isIndexedDBAvailable) {
      isMigrated = Boolean(await get<boolean>(MIGRATED_FLAG_KEY));
    } else {
      isMigrated = Boolean(memoryStore.get(MIGRATED_FLAG_KEY));
    }

    if (isMigrated) {
      return { migrated: false, count: 0 };
    }

    const entriesToMigrate: [IDBValidKey, unknown][] = [];
    if (typeof localStorage !== 'undefined') {
      for (const key of Object.values(allStorageKeys)) {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          try {
            const parsed = JSON.parse(raw);
            entriesToMigrate.push([key, parsed]);
            memoryStore.set(key, parsed);
          } catch {
            entriesToMigrate.push([key, raw]);
            memoryStore.set(key, raw);
          }
        }
      }
    }

    if (isIndexedDBAvailable && entriesToMigrate.length > 0) {
      await setMany(entriesToMigrate);
    }

    if (isIndexedDBAvailable) {
      await set(MIGRATED_FLAG_KEY, true);
    }
    memoryStore.set(MIGRATED_FLAG_KEY, true);

    // Clean up localStorage to free up legacy space and enforce IndexedDB single source of truth
    if (typeof localStorage !== 'undefined') {
      try {
        for (const key of Object.values(allStorageKeys)) {
          localStorage.removeItem(key);
        }
      } catch {
        // Ignore localStorage cleanup errors in restricted environments
      }
    }

    return { migrated: entriesToMigrate.length > 0, count: entriesToMigrate.length };
  } catch (err) {
    console.error('[storageAdapter] Migration from localStorage failed:', err);
    return { migrated: false, count: 0 };
  }
}

/**
 * Load all stored keys at once from IndexedDB into memoryStore and return them.
 */
export async function loadAllFromIndexedDB(
  keys: string[]
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  if (isIndexedDBAvailable) {
    try {
      const values = await getMany(keys);
      keys.forEach((key, idx) => {
        if (values[idx] !== undefined && values[idx] !== null) {
          result[key] = values[idx];
          memoryStore.set(key, values[idx]);
        }
      });
      return result;
    } catch (err) {
      console.warn('[storageAdapter] loadAllFromIndexedDB failed:', err);
    }
  }

  // Fallback to memoryStore
  for (const k of keys) {
    if (memoryStore.has(k)) {
      result[k] = memoryStore.get(k);
    }
  }
  return result;
}

const SENSITIVE_STORAGE_KEYS = new Set([
  'budget-control-gdrive-token',
  'budget-control-gdrive-token-expiry',
  'budget-control-gdrive-refresh-token',
  'budget-control-gdrive-client-secret',
  'budget-control-gist-token',
  'gist_token',
]);

/**
 * Dump all keys from IndexedDB (or memoryStore) for emergency backup export.
 * Excludes sensitive credentials (tokens, secrets).
 */
export async function exportAllFromStorage(): Promise<Record<string, unknown>> {
  const dump: Record<string, unknown> = {};

  if (isIndexedDBAvailable) {
    try {
      const allEntries = await idbEntries();
      for (const [k, v] of allEntries) {
        const keyStr = String(k);
        if (!SENSITIVE_STORAGE_KEYS.has(keyStr)) {
          dump[keyStr] = v;
        }
      }
      return dump;
    } catch (err) {
      console.warn('[storageAdapter] exportAllFromStorage IDB entries error:', err);
    }
  }

  // Fallback to memoryStore
  for (const [k, v] of memoryStore.entries()) {
    if (!SENSITIVE_STORAGE_KEYS.has(k)) {
      dump[k] = v;
    }
  }
  return dump;
}

/**
 * Emergency wipe: clears IndexedDB, memoryStore, and any legacy localStorage.
 */
export async function clearAllStorage(): Promise<void> {
  memoryStore.clear();

  if (isIndexedDBAvailable) {
    try {
      await clear();
    } catch (err) {
      console.error('[storageAdapter] clear error:', err);
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
  }
}

export const UNDO_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let undoPersistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist Undo / Redo history to IndexedDB so it survives page reloads.
 * Updates memoryStore synchronously and debounces IndexedDB writes by 300ms.
 */
export async function persistUndoHistoryToStorage(
  undoStack: UndoableAction[],
  redoStack: UndoableAction[]
): Promise<void> {
  try {
    const payload = {
      undoStack: undoStack.slice(0, 30),
      redoStack: redoStack.slice(0, 30),
      savedAt: Date.now(),
    };
    memoryStore.set(UNDO_HISTORY_KEY, payload);

    if (isIndexedDBAvailable) {
      if (undoPersistTimer) clearTimeout(undoPersistTimer);
      undoPersistTimer = setTimeout(() => {
        undoPersistTimer = null;
        set(UNDO_HISTORY_KEY, payload).catch((err) => {
          console.warn('[storageAdapter] Failed to persist undo history:', err);
        });
      }, 300);
    }
  } catch (err) {
    console.warn('[storageAdapter] Failed to persist undo history:', err);
  }
}

/**
 * Delete stored undo history permanently.
 */
export async function clearStoredUndoHistory(): Promise<void> {
  try {
    if (undoPersistTimer) {
      clearTimeout(undoPersistTimer);
      undoPersistTimer = null;
    }
    memoryStore.delete(UNDO_HISTORY_KEY);
    if (isIndexedDBAvailable) {
      await del(UNDO_HISTORY_KEY);
    }
  } catch (err) {
    console.warn('[storageAdapter] Failed to clear stored undo history:', err);
  }
}

/**
 * Restore Undo / Redo history from IndexedDB on startup (with 24h TTL auto-expiry).
 */
export async function restoreUndoHistoryFromStorage(): Promise<{
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];
} | null> {
  try {
    let data: {
      undoStack?: UndoableAction[];
      redoStack?: UndoableAction[];
      savedAt?: number;
    } | undefined | null = null;

    if (isIndexedDBAvailable) {
      data = await get(UNDO_HISTORY_KEY);
    } else {
      data = memoryStore.get(UNDO_HISTORY_KEY) as typeof data;
    }

    if (data && Array.isArray(data.undoStack)) {
      if (data.savedAt && Date.now() - data.savedAt > UNDO_TTL_MS) {
        await clearStoredUndoHistory();
        return null;
      }

      return {
        undoStack: data.undoStack,
        redoStack: Array.isArray(data.redoStack) ? data.redoStack : [],
      };
    }
  } catch (err) {
    console.warn('[storageAdapter] Failed to restore undo history:', err);
  }
  return null;
}
