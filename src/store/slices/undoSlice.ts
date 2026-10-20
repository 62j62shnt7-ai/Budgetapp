import type { BudgetFinancialSnapshot, UndoableAction } from '../../types';
import type { SliceCreator, UndoSlice } from './types';
import {
  STORAGE_KEYS,
  saveStorage,
  captureFinancialSnapshot,
  persistFinancialSnapshot,
  recordUndoableStep,
  scheduleAutoDriveSync,
  scheduleAutoGistSync,
  setHasPendingUserEdit,
  setLastLocalMutationTimestamp,
  MAX_UNDO_DEPTH,
  setIsTransactionRunning,
  transactionDepth,
  setTransactionDepth,
} from './common';
import {
  persistUndoHistoryToStorage,
  clearStoredUndoHistory,
} from '../../utils/storageAdapter';

export const createUndoSlice: SliceCreator<UndoSlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],
  undoToast: null,

  runTransaction: <T>(label: string, fn: () => T): T => {
    if (transactionDepth > 0) return fn();
    const snapshot = captureFinancialSnapshot(get());
    recordUndoableStep(set, get, label);
    setTransactionDepth(transactionDepth + 1);
    setIsTransactionRunning(true);
    let isPromise = false;
    try {
      const result = fn();
      if (result && typeof (result as unknown as { then?: unknown }).then === 'function') {
        isPromise = true;
        return ((result as unknown as Promise<unknown>)
          .catch((err: unknown) => {
            persistFinancialSnapshot(snapshot);
            set({
              ...snapshot,
              undoStack: get().undoStack.slice(1),
              undoToast: null,
            });
            throw err;
          })
          .finally(() => {
            setTransactionDepth(transactionDepth - 1);
            if (transactionDepth <= 0) {
              setTransactionDepth(0);
              setIsTransactionRunning(false);
            }
          })) as unknown as T;
      }
      return result;
    } catch (err) {
      persistFinancialSnapshot(snapshot);
      set({
        ...snapshot,
        undoStack: get().undoStack.slice(1),
        undoToast: null,
      });
      throw err;
    } finally {
      if (!isPromise) {
        setTransactionDepth(transactionDepth - 1);
        if (transactionDepth <= 0) {
          setTransactionDepth(0);
          setIsTransactionRunning(false);
        }
      }
    }
  },

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return false;

    const [toRevert, ...newUndoStack] = undoStack;
    let currentSnapshot: BudgetFinancialSnapshot;
    try {
      currentSnapshot = captureFinancialSnapshot(get());
    } catch {
      return false;
    }

    const now = Date.now();
    setHasPendingUserEdit(true);
    setLastLocalMutationTimestamp(now);
    saveStorage(STORAGE_KEYS.lastLocalModified, String(now));

    const redoItem: UndoableAction = {
      id: `redo-${now}-${Math.random().toString(36).slice(2, 6)}`,
      label: toRevert.label,
      timestamp: now,
      snapshot: currentSnapshot,
    };

    const nextUndoStack = newUndoStack;
    const nextRedoStack = [redoItem, ...redoStack].slice(0, MAX_UNDO_DEPTH);
    const restored = toRevert.snapshot;
    persistFinancialSnapshot(restored);

    set({
      ...restored,
      undoStack: nextUndoStack,
      redoStack: nextRedoStack,
      undoToast: null,
      lastLocalModified: now,
    });

    void persistUndoHistoryToStorage(nextUndoStack, nextRedoStack);
    scheduleAutoDriveSync(get, false, { isUserEdit: true });
    scheduleAutoGistSync(get);
    return true;
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return false;

    const [toApply, ...newRedoStack] = redoStack;
    let currentSnapshot: BudgetFinancialSnapshot;
    try {
      currentSnapshot = captureFinancialSnapshot(get());
    } catch {
      return false;
    }

    const now = Date.now();
    setHasPendingUserEdit(true);
    setLastLocalMutationTimestamp(now);
    saveStorage(STORAGE_KEYS.lastLocalModified, String(now));

    const undoItem: UndoableAction = {
      id: `undo-${now}-${Math.random().toString(36).slice(2, 6)}`,
      label: toApply.label,
      timestamp: now,
      snapshot: currentSnapshot,
    };

    const nextUndoStack = [undoItem, ...undoStack].slice(0, MAX_UNDO_DEPTH);
    const nextRedoStack = newRedoStack;
    const restored = toApply.snapshot;
    persistFinancialSnapshot(restored);

    set({
      ...restored,
      undoStack: nextUndoStack,
      redoStack: nextRedoStack,
      undoToast: null,
      lastLocalModified: now,
    });

    void persistUndoHistoryToStorage(nextUndoStack, nextRedoStack);
    scheduleAutoDriveSync(get, false, { isUserEdit: true });
    scheduleAutoGistSync(get);
    return true;
  },

  dismissUndoToast: () => set({ undoToast: null }),

  clearUndoHistory: () => {
    set({ undoStack: [], redoStack: [], undoToast: null });
    void clearStoredUndoHistory();
  },
});
