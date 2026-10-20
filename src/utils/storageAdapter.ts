/**
 * High-Capacity Storage Adapter (IndexedDB with LocalStorage Fallback)
 *
 * Provides non-blocking, asynchronous persistence backed by IndexedDB in browsers
 * (500MB+ capacity, zero QuotaExceededError), with seamless fallback to localStorage
 * in Node.js test environments or restricted private browsing contexts.
 */
import { get, set, del, getMany, setMany } from 'idb-keyval';
import type { UndoableAction } from '../types';

export const isIndexedDBAvailable =
  typeof window !== 'undefined' &&
  typeof window.indexedDB !== 'undefined' &&
  window.indexedDB !== null;

const MIGRATED_FLAG_KEY = 'budget-control-migrated-to-idb';
const UNDO_HISTORY_KEY = 'budget-control-undo-history-v2';

/**
 * Synchronous read from localStorage (used during initial module evaluation / fallback).
 */
export function loadStorageSync<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;

    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? (parsed as T) : fallback;
    }
    if (typeof fallback === 'string') {
      return typeof parsed === 'string' ? (parsed as T) : fallback;
    }
    if (typeof fallback === 'number') {
      return typeof parsed === 'number' && !isNaN(parsed) ? (parsed as T) : fallback;
    }
    if (typeof fallback === 'boolean') {
      return typeof parsed === 'boolean' ? (parsed as T) : fallback;
    }
    return parsed as T;
  } catch (err) {
    console.warn(`[storageAdapter] Error reading sync ${key}:`, err);
    return fallback;
  }
}

/**
 * Asynchronous read prioritizing IndexedDB, falling back to localStorage.
 */
export async function loadStorageAsync<T>(key: string, fallback: T): Promise<T> {
  if (isIndexedDBAvailable) {
    try {
      const val = await get<T>(key);
      if (val !== undefined && val !== null) {
        return val;
      }
    } catch (err) {
      console.warn(`[storageAdapter] IndexedDB get error for ${key}:`, err);
    }
  }
  return loadStorageSync(key, fallback);
}

/**
 * Asynchronous, non-blocking write to IndexedDB (and localStorage in test/fallback modes).
 */
export async function saveStorageAsync<T>(key: string, value: T): Promise<void> {
  if (isIndexedDBAvailable) {
    try {
      await set(key, value);
      return;
    } catch (err) {
      console.error(`[storageAdapter] IndexedDB set error for ${key}:`, err);
      return;
    }
  }

  // Fallback for test/headless environments
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    console.error(`[storageAdapter] Fallback storage write error for ${key}:`, err);
  }
}

/**
 * Direct non-blocking save to IndexedDB.
 */
export function saveStorage<T>(key: string, value: T): void {
  if (isIndexedDBAvailable) {
    set(key, value).catch((err) => {
      console.error(`[storageAdapter] Async saveStorage failed for ${key}:`, err);
    });
    return;
  }

  // Fallback for test/headless environments
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

/**
 * Delete a key from storage.
 */
export async function removeStorage(key: string): Promise<void> {
  if (isIndexedDBAvailable) {
    try {
      await del(key);
    } catch (err) {
      console.error(`[storageAdapter] del error for ${key}:`, err);
    }
    return;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * Automatic one-time migration: copies existing localStorage keys into IndexedDB.
 */
export async function migrateFromLocalStorageIfNeeded(
  allStorageKeys: Record<string, string>
): Promise<{ migrated: boolean; count: number }> {
  if (!isIndexedDBAvailable) {
    return { migrated: false, count: 0 };
  }

  try {
    const isMigrated = await get<boolean>(MIGRATED_FLAG_KEY);
    if (isMigrated) {
      return { migrated: false, count: 0 };
    }

    if (typeof localStorage === 'undefined') {
      await set(MIGRATED_FLAG_KEY, true);
      return { migrated: false, count: 0 };
    }

    const entriesToMigrate: [IDBValidKey, unknown][] = [];
    for (const key of Object.values(allStorageKeys)) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          entriesToMigrate.push([key, JSON.parse(raw)]);
        } catch {
          entriesToMigrate.push([key, raw]);
        }
      }
    }

    if (entriesToMigrate.length > 0) {
      await setMany(entriesToMigrate);
    }

    await set(MIGRATED_FLAG_KEY, true);
    return { migrated: true, count: entriesToMigrate.length };
  } catch (err) {
    console.error('[storageAdapter] Migration from localStorage failed:', err);
    return { migrated: false, count: 0 };
  }
}

/**
 * Load all stored keys at once from IndexedDB into an object.
 */
export async function loadAllFromIndexedDB(
  keys: string[]
): Promise<Record<string, unknown>> {
  if (!isIndexedDBAvailable) return {};

  try {
    const values = await getMany(keys);
    const result: Record<string, unknown> = {};
    keys.forEach((key, idx) => {
      if (values[idx] !== undefined && values[idx] !== null) {
        result[key] = values[idx];
      }
    });
    return result;
  } catch (err) {
    console.warn('[storageAdapter] loadAllFromIndexedDB failed:', err);
    return {};
  }
}

export const UNDO_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Persist Undo / Redo history to IndexedDB so it survives page reloads.
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
    if (isIndexedDBAvailable) {
      await set(UNDO_HISTORY_KEY, payload);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UNDO_HISTORY_KEY, JSON.stringify(payload));
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
    if (isIndexedDBAvailable) {
      await del(UNDO_HISTORY_KEY);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(UNDO_HISTORY_KEY);
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
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(UNDO_HISTORY_KEY);
      if (raw) data = JSON.parse(raw);
    }

    if (data && Array.isArray(data.undoStack)) {
      // 24-hour TTL session expiry so stale counters never linger indefinitely
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
