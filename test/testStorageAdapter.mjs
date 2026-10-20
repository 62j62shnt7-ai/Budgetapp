import assert from 'node:assert';

// Provide clean in-memory localStorage for test environment
if (typeof globalThis.localStorage === 'undefined') {
  const storeMap = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
    clear: () => storeMap.clear(),
    get length() { return storeMap.size; },
    key: (i) => Array.from(storeMap.keys())[i] || null,
  };
}

import {
  loadStorageSync,
  loadStorageAsync,
  saveStorage,
  saveStorageAsync,
  migrateFromLocalStorageIfNeeded,
  persistUndoHistoryToStorage,
  restoreUndoHistoryFromStorage,
} from '../src/utils/storageAdapter.ts';
import { useBudgetStore, STORAGE_KEYS } from '../src/store/useBudgetStore.ts';

console.log('--- Starting Storage Adapter & IndexedDB Bridge Tests ---');

// Test 1: Fallback handling
console.log('Test 1: Fallback handling for missing keys...');
const missingArray = loadStorageSync('non-existent-key', ['default']);
assert.deepStrictEqual(missingArray, ['default']);

const missingString = loadStorageSync('non-existent-key', 'default-str');
assert.strictEqual(missingString, 'default-str');

const missingNum = loadStorageSync('non-existent-key', 42);
assert.strictEqual(missingNum, 42);
console.log('✓ Test 1 passed!');

// Test 2: Synchronous & Asynchronous write/read bridge
console.log('Test 2: Synchronous & Asynchronous write/read bridge...');
saveStorage('test-key-sync', { message: 'hello' });
const readBackSync = loadStorageSync('test-key-sync', { message: 'fallback' });
assert.strictEqual(readBackSync.message, 'hello');

await saveStorageAsync('test-key-async', [1, 2, 3]);
const readBackAsync = await loadStorageAsync('test-key-async', []);
assert.deepStrictEqual(readBackAsync, [1, 2, 3]);
console.log('✓ Test 2 passed!');

// Test 3: Auto-migration from localStorage
console.log('Test 3: Auto-migration helper verification...');
globalThis.localStorage.setItem('budget-control-test-mig', JSON.stringify({ migrated: true }));
const migrationRes = await migrateFromLocalStorageIfNeeded({ test: 'budget-control-test-mig' });
// In Node environment without window.indexedDB, it returns gracefully without throwing
assert.ok(typeof migrationRes.migrated === 'boolean');
assert.ok(typeof migrationRes.count === 'number');
console.log('✓ Test 3 passed!');

// Test 4: Undo history persistence & restore functions
console.log('Test 4: Undo history persistence & restore functions...');
const mockSnapshot = {
  entries: [],
  archivedEntries: [],
  deletedForecasts: [],
  accounts: {},
  salaryPattern: [],
  installments: [],
  rates: { currencies: [], gold: [] },
  storageAssets: [],
  asfJobs: [],
  irqJobs: [],
  partTimeJobs: [],
  entryActuals: {},
  entryActualDates: {},
  creditDues: {},
  creditDueMonths: {},
  creditSettlementOverrides: {},
  salaryAnchorMonth: '2026-10',
};
const mockUndoStack = [
  { id: 'undo-1', label: 'Test Action', timestamp: Date.now(), snapshot: mockSnapshot },
];
await persistUndoHistoryToStorage(mockUndoStack, []);
const restored = await restoreUndoHistoryFromStorage();
// In node, should return null or object gracefully
assert.ok(restored === null || Array.isArray(restored.undoStack));
console.log('✓ Test 4 passed!');

// Test 5: Store initStorage lifecycle
console.log('Test 5: Store initStorage lifecycle...');
assert.strictEqual(typeof useBudgetStore.getState().initStorage, 'function');
await useBudgetStore.getState().initStorage();
assert.strictEqual(useBudgetStore.getState().isStorageReady, true);
console.log('✓ Test 5 passed!');

// Test 6: Google Drive client configuration & token storage
console.log('Test 6: Google Drive client configuration & token storage...');
const {
  getStoredDriveClientId,
  saveStoredDriveClientId,
  getStoredDriveToken,
  saveStoredDriveToken,
  clearStoredDriveToken,
  getStoredDriveUser,
  saveStoredDriveUser,
} = await import('../src/services/googleDriveClient.ts');

saveStoredDriveClientId('test-client-id-123.apps.googleusercontent.com');
assert.strictEqual(getStoredDriveClientId(), 'test-client-id-123.apps.googleusercontent.com');

saveStoredDriveToken('ya29.test-token', 3600);
assert.strictEqual(getStoredDriveToken(), 'ya29.test-token');

saveStoredDriveUser({ email: 'test@example.com', name: 'Tester' });
assert.deepStrictEqual(getStoredDriveUser(), { email: 'test@example.com', name: 'Tester' });

clearStoredDriveToken();
assert.strictEqual(getStoredDriveToken(), null);
assert.strictEqual(getStoredDriveUser(), null);

saveStoredDriveClientId('');
assert.strictEqual(getStoredDriveClientId(), '191333657161-aqptqa80usrujqbuqckp15ddf9ib8g7t.apps.googleusercontent.com');

const { getFolderWebUrl, getStoredDriveBackupRetentionLimit, saveStoredDriveBackupRetentionLimit } = await import('../src/services/googleDriveClient.ts');
assert.strictEqual(getFolderWebUrl('test-folder-abc'), 'https://drive.google.com/drive/folders/test-folder-abc');

// Test 7: Configurable backup retention limit
console.log('Test 7: Configurable backup retention limit...');
assert.strictEqual(getStoredDriveBackupRetentionLimit(), 7);
saveStoredDriveBackupRetentionLimit(14);
assert.strictEqual(getStoredDriveBackupRetentionLimit(), 14);
saveStoredDriveBackupRetentionLimit(3);
assert.strictEqual(getStoredDriveBackupRetentionLimit(), 3);
console.log('✓ Test 7 passed!');

// Test 8: Zustand Google Drive sync state and reactive status
console.log('Test 8: Zustand Google Drive sync state and reactive status...');
assert.strictEqual(typeof useBudgetStore.getState().setDriveSyncStatus, 'function');
assert.strictEqual(typeof useBudgetStore.getState().setDriveUser, 'function');
assert.strictEqual(typeof useBudgetStore.getState().setDriveAutoSync, 'function');

useBudgetStore.getState().setDriveSyncStatus('scheduled');
assert.strictEqual(useBudgetStore.getState().driveSyncStatus, 'scheduled');

useBudgetStore.getState().setDriveSyncStatus('syncing');
assert.strictEqual(useBudgetStore.getState().driveSyncStatus, 'syncing');

useBudgetStore.getState().setDriveSyncStatus('synced');
assert.strictEqual(useBudgetStore.getState().driveSyncStatus, 'synced');

useBudgetStore.getState().setDriveUser({ email: 'unit@test.com', name: 'Unit Tester' });
assert.deepStrictEqual(useBudgetStore.getState().driveUser, { email: 'unit@test.com', name: 'Unit Tester' });
assert.strictEqual(useBudgetStore.getState().driveSyncStatus, 'synced');

useBudgetStore.getState().setDriveUser(null);
assert.strictEqual(useBudgetStore.getState().driveUser, null);
assert.strictEqual(useBudgetStore.getState().driveSyncStatus, 'idle');
console.log('✓ Test 8 passed!');

// Test 9: 3-tier folder structure constants and functions
console.log('Test 9: 3-tier folder structure constants and functions...');
const {
  DAILY_BACKUPS_FOLDER_NAME,
  EDIT_SNAPSHOTS_FOLDER_NAME,
  USER_SNAPSHOTS_FOLDER_NAME,
  MAX_EDIT_SNAPSHOTS_CAP,
  clearDailyBackups,
  clearEditSnapshots,
  clearUserSnapshots,
  listDailyBackups,
  listEditSnapshots,
  listUserSnapshots,
} = await import('../src/services/googleDriveClient.ts');

assert.strictEqual(DAILY_BACKUPS_FOLDER_NAME, 'Daily Backups');
assert.strictEqual(EDIT_SNAPSHOTS_FOLDER_NAME, 'Edit Snapshots');
assert.strictEqual(USER_SNAPSHOTS_FOLDER_NAME, 'User Snapshots');
assert.strictEqual(MAX_EDIT_SNAPSHOTS_CAP, 5);
assert.strictEqual(typeof clearDailyBackups, 'function');
assert.strictEqual(typeof clearEditSnapshots, 'function');
assert.strictEqual(typeof clearUserSnapshots, 'function');
assert.strictEqual(typeof listDailyBackups, 'function');
assert.strictEqual(typeof listEditSnapshots, 'function');
assert.strictEqual(typeof listUserSnapshots, 'function');
// Test 10: Undo history 24-hour TTL expiry & manual clear
console.log('Test 10: Undo history 24-hour TTL expiry & manual clear...');
const { clearStoredUndoHistory, UNDO_TTL_MS } = await import('../src/utils/storageAdapter.ts');
assert.strictEqual(UNDO_TTL_MS, 24 * 60 * 60 * 1000);

// Verify persist & restore
await persistUndoHistoryToStorage([{ id: 'u1', label: 'Recent Action', timestamp: Date.now(), snapshot: mockSnapshot }], []);
const restoredActive = await restoreUndoHistoryFromStorage();
assert.ok(restoredActive !== null);
assert.strictEqual(restoredActive.undoStack.length, 1);
assert.strictEqual(restoredActive.undoStack[0].label, 'Recent Action');

// Verify manual clear
await clearStoredUndoHistory();
const restoredCleared = await restoreUndoHistoryFromStorage();
assert.strictEqual(restoredCleared, null);

// Verify simulated 24h+ TTL auto-expiry
const expiredPayload = {
  undoStack: [{ id: 'u-old', label: 'Old Action', timestamp: Date.now() - 30 * 3600 * 1000, snapshot: mockSnapshot }],
  redoStack: [],
  savedAt: Date.now() - (UNDO_TTL_MS + 60000), // 24 hours and 1 minute ago
};
globalThis.localStorage.setItem('budget-control-undo-history-v2', JSON.stringify(expiredPayload));
const restoredExpired = await restoreUndoHistoryFromStorage();
assert.strictEqual(restoredExpired, null); // Gracefully expired and cleaned!
console.log('✓ Test 10 passed!');

// Test 11: Remote sync does not wipe undo stack
console.log('Test 11: Remote sync does not wipe undo stack...');
useBudgetStore.setState({
  undoStack: [{ id: 'u-keep', label: 'My Local Edit', timestamp: Date.now(), snapshot: mockSnapshot }],
});
assert.strictEqual(useBudgetStore.getState().undoStack.length, 1);

// Call importJSON with isRemoteSync: true
const dummyRemotePayload = JSON.stringify({
  entries: [{ id: 'remote-entry-1', date: '2026-10-20', amount: 500, category: 'Remote Test', type: 'expense' }],
});
useBudgetStore.getState().importJSON(dummyRemotePayload, { isRemoteSync: true });

// Assert existing undoStack was NOT wiped to []
const afterSyncUndo = useBudgetStore.getState().undoStack;
assert.strictEqual(afterSyncUndo.length, 1);
assert.strictEqual(afterSyncUndo[0].label, 'My Local Edit');
console.log('✓ Test 11 passed!');

// Test 12: Undo and Redo advance lastLocalModified timestamp
console.log('Test 12: Undo/Redo timestamp & Drive sync timestamp hydration...');
const prevTimestamp = useBudgetStore.getState().lastLocalModified;
// Add entry to create undo step
useBudgetStore.getState().addEntry({ date: '2026-10-20', category: 'Timestamp Test', amount: 100, type: 'expense' });
const afterAddTimestamp = useBudgetStore.getState().lastLocalModified;
assert.ok(afterAddTimestamp >= prevTimestamp, 'addEntry should advance lastLocalModified');

// Execute Undo
useBudgetStore.getState().undo();
const afterUndoTimestamp = useBudgetStore.getState().lastLocalModified;
assert.ok(afterUndoTimestamp >= afterAddTimestamp, 'undo should advance lastLocalModified');

// Execute Redo
useBudgetStore.getState().redo();
const afterRedoTimestamp = useBudgetStore.getState().lastLocalModified;
assert.ok(afterRedoTimestamp >= afterUndoTimestamp, 'redo should advance lastLocalModified');

assert.ok(STORAGE_KEYS.lastDriveSync, 'STORAGE_KEYS.lastDriveSync must be defined');
console.log('✓ Test 12 passed!');

console.log('🌟 ALL STORAGE & CLOUD ADAPTER TESTS PASSED! 🌟');
