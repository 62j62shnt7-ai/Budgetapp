import assert from 'node:assert';

// Lightweight in-memory storage for test harness
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

import { useBudgetStore } from '../src/store/useBudgetStore.ts';
import { buildCreditDueEntries } from '../src/engine/creditCards.ts';

console.log('--- Starting Undo/Redo System Tests ---');

// Reset store cleanly
const store = useBudgetStore.getState();
store.clearUndoHistory();

// Test 1: Basic Undo & Redo for addEntry
console.log('Test 1: Basic Undo & Redo for addEntry...');
assert.strictEqual(useBudgetStore.getState().undoStack.length, 0);
assert.strictEqual(useBudgetStore.getState().redoStack.length, 0);

const testEntryId = useBudgetStore.getState().addEntry({
  date: '2026-10-15',
  category: 'Groceries',
  account: 'Cash',
  type: 'expense',
  amount: 450,
  tag: 'Food'
});

let state = useBudgetStore.getState();
assert.strictEqual(state.undoStack.length, 1, 'undoStack should have 1 item after addEntry');
assert.strictEqual(state.redoStack.length, 0, 'redoStack should be empty');
assert.strictEqual(state.entries.some(e => e.id === testEntryId), true, 'Entry should exist in store');
assert.ok(state.undoToast?.label.includes('Expense: Groceries'), 'Toast should have descriptive label');

// Execute Undo
useBudgetStore.getState().undo();
state = useBudgetStore.getState();
assert.strictEqual(state.undoStack.length, 0, 'undoStack should be 0 after undo');
assert.strictEqual(state.redoStack.length, 1, 'redoStack should have 1 item after undo');
assert.strictEqual(state.entries.some(e => e.id === testEntryId), false, 'Entry should be removed after undo');

// Execute Redo
useBudgetStore.getState().redo();
state = useBudgetStore.getState();
assert.strictEqual(state.undoStack.length, 1, 'undoStack should have 1 item after redo');
assert.strictEqual(state.redoStack.length, 0, 'redoStack should be 0 after redo');
assert.strictEqual(state.entries.some(e => e.id === testEntryId), true, 'Entry should be restored after redo');
console.log('✓ Test 1 passed!');

// Test 2: Undo & Redo for updateEntry
console.log('Test 2: Undo & Redo for updateEntry...');
useBudgetStore.getState().updateEntry(testEntryId, {
  amount: 900,
  tag: 'Luxury Food'
});

state = useBudgetStore.getState();
assert.strictEqual(state.undoStack.length, 2, 'undoStack should have 2 items after updateEntry');
let entry = state.entries.find(e => e.id === testEntryId);
assert.strictEqual(entry?.amount, 900);

// Undo the update
useBudgetStore.getState().undo();
state = useBudgetStore.getState();
entry = state.entries.find(e => e.id === testEntryId);
assert.strictEqual(entry?.amount, 450, 'Amount should revert to 450');
assert.strictEqual(state.redoStack.length, 1);

// Redo the update
useBudgetStore.getState().redo();
state = useBudgetStore.getState();
entry = state.entries.find(e => e.id === testEntryId);
assert.strictEqual(entry?.amount, 900, 'Amount should redo to 900');
console.log('✓ Test 2 passed!');

// Test 3: Undo for deleteEntry
console.log('Test 3: Undo for deleteEntry...');
useBudgetStore.getState().deleteEntry(testEntryId);
state = useBudgetStore.getState();
assert.strictEqual(state.entries.some(e => e.id === testEntryId), false, 'Entry should be deleted');

useBudgetStore.getState().undo();
state = useBudgetStore.getState();
assert.strictEqual(state.entries.some(e => e.id === testEntryId), true, 'Deleted entry should be restored on undo');
entry = state.entries.find(e => e.id === testEntryId);
assert.strictEqual(entry?.amount, 900);
console.log('✓ Test 3 passed!');

// Test 4: Redo stack invalidation on new user mutation
console.log('Test 4: Redo stack invalidation on new user mutation...');
useBudgetStore.getState().undo(); // Reverts the restore/update
state = useBudgetStore.getState();
assert.ok(state.redoStack.length > 0, 'redoStack should have items after undo');

// New user mutation
const newEntryId = useBudgetStore.getState().addEntry({
  date: '2026-10-16',
  category: 'Transport',
  account: 'Cash',
  type: 'expense',
  amount: 50,
  tag: 'Bus'
});
state = useBudgetStore.getState();
assert.strictEqual(state.redoStack.length, 0, 'redoStack must be cleared when a new mutation occurs');
assert.strictEqual(state.entries.some(e => e.id === newEntryId), true);
console.log('✓ Test 4 passed!');

// Test 5: Compound action atomicity (runTransaction)
console.log('Test 5: Compound action atomicity with runTransaction...');
const stackBeforeTransaction = useBudgetStore.getState().undoStack.length;

let txEntry1 = '';
let txEntry2 = '';

useBudgetStore.getState().runTransaction('Bridge Deficit Compound Action', () => {
  txEntry1 = useBudgetStore.getState().addEntry({
    date: '2026-10-20',
    category: 'Loan Inflow',
    account: 'Bank',
    type: 'income',
    amount: 10000,
    tag: 'Loan'
  });
  txEntry2 = useBudgetStore.getState().addEntry({
    date: '2026-10-20',
    category: 'Loan Processing Fee',
    account: 'Bank',
    type: 'expense',
    amount: 200,
    tag: 'Fee'
  });
});

state = useBudgetStore.getState();
assert.strictEqual(
  state.undoStack.length,
  stackBeforeTransaction + 1,
  'runTransaction should only push 1 undo step despite 2 internal mutations'
);
assert.strictEqual(state.undoStack[0].label, 'Bridge Deficit Compound Action');
assert.strictEqual(state.entries.some(e => e.id === txEntry1), true);
assert.strictEqual(state.entries.some(e => e.id === txEntry2), true);

// Undo transaction - both entries must be rolled back in 1 click
useBudgetStore.getState().undo();
state = useBudgetStore.getState();
assert.strictEqual(state.entries.some(e => e.id === txEntry1), false, 'txEntry1 should be rolled back');
assert.strictEqual(state.entries.some(e => e.id === txEntry2), false, 'txEntry2 should be rolled back');

// Redo transaction - both entries restored in 1 click
useBudgetStore.getState().redo();
state = useBudgetStore.getState();
assert.strictEqual(state.entries.some(e => e.id === txEntry1), true, 'txEntry1 restored');
assert.strictEqual(state.entries.some(e => e.id === txEntry2), true, 'txEntry2 restored');
console.log('✓ Test 5 passed!');

// Test 5b: Recurring series multi-entry full rollback in 1 undo click
console.log('Test 5b: Recurring series multi-entry full rollback in 1 click...');
const entriesCountBeforeRecurring = useBudgetStore.getState().entries.length;
const undoStackBeforeRecurring = useBudgetStore.getState().undoStack.length;

useBudgetStore.getState().runTransaction('Add Recurring (12x): Gym', () => {
  for (let i = 0; i < 12; i++) {
    useBudgetStore.getState().addEntry({
      date: `2026-${String(i + 1).padStart(2, '0')}-01`,
      category: 'Gym',
      account: 'Cash',
      type: 'expense',
      amount: 600,
      tag: 'Fitness',
      isRecurring: true,
      seriesId: 'series-gym-test'
    });
  }
});

state = useBudgetStore.getState();
assert.strictEqual(state.entries.length, entriesCountBeforeRecurring + 12, '12 entries should be added');
assert.strictEqual(state.undoStack.length, undoStackBeforeRecurring + 1, 'Exactly 1 undo step recorded for all 12 entries');
assert.strictEqual(state.undoStack[0].label, 'Add Recurring (12x): Gym');

// Undo recurring series - ALL 12 entries must be rolled back in 1 click!
useBudgetStore.getState().undo();
state = useBudgetStore.getState();
assert.strictEqual(state.entries.length, entriesCountBeforeRecurring, 'ALL 12 entries rolled back cleanly in 1 click');
assert.strictEqual(state.entries.some(e => e.seriesId === 'series-gym-test'), false);

// Redo recurring series - ALL 12 entries restored in 1 click!
useBudgetStore.getState().redo();
state = useBudgetStore.getState();
assert.strictEqual(state.entries.length, entriesCountBeforeRecurring + 12, 'ALL 12 entries restored cleanly in 1 click');
console.log('✓ Test 5b passed!');

// Test 5c: Bank account transfer compound action rollback in 1 click
console.log('Test 5c: Bank account transfer compound action rollback in 1 click...');
useBudgetStore.getState().updateAccountBalance('cib', 5000);
useBudgetStore.getState().updateAccountBalance('hsbc', 3000);
const undoStackBeforeTransfer = useBudgetStore.getState().undoStack.length;

useBudgetStore.getState().runTransaction('Transfer 1000 from CIB to HSBC', () => {
  const cibBal = useBudgetStore.getState().accounts.cib.balance;
  const hsbcBal = useBudgetStore.getState().accounts.hsbc.balance;
  useBudgetStore.getState().updateAccountBalance('cib', cibBal - 1000);
  useBudgetStore.getState().updateAccountBalance('hsbc', hsbcBal + 1000);
});

state = useBudgetStore.getState();
assert.strictEqual(state.accounts.cib.balance, 4000);
assert.strictEqual(state.accounts.hsbc.balance, 4000);
assert.strictEqual(state.undoStack.length, undoStackBeforeTransfer + 1, 'Only 1 undo step for transfer');

// Undo transfer - BOTH account balances must revert in 1 click!
useBudgetStore.getState().undo();
state = useBudgetStore.getState();
assert.strictEqual(state.accounts.cib.balance, 5000, 'CIB balance reverted');
assert.strictEqual(state.accounts.hsbc.balance, 3000, 'HSBC balance reverted');
console.log('✓ Test 5c passed!');

// Test 5d: Credit settlement entry "Finish" and Undo/Redo
console.log('Test 5d: Credit settlement finish and undo/redo...');
const creditSettlementId = 'credit-settlement-cib-2026-10';

useBudgetStore.setState({
  creditDues: {
    cib: { '2026-10': 3500 }
  }
});

let creditEntries = buildCreditDueEntries({
  accounts: useBudgetStore.getState().accounts,
  creditDues: useBudgetStore.getState().creditDues,
  cashEntries: useBudgetStore.getState().entries,
  archivedEntries: useBudgetStore.getState().archivedEntries,
  entryActuals: useBudgetStore.getState().entryActuals,
  creditSettlementOverrides: useBudgetStore.getState().creditSettlementOverrides,
});
let cibSettlement = creditEntries.find(e => e.id === creditSettlementId);
assert.ok(cibSettlement, 'Credit settlement entry should be generated');
assert.strictEqual(cibSettlement.isClosed, false, 'Credit settlement is initially not closed');

// Finish credit settlement (as handleFinishEntry does)
useBudgetStore.getState().runTransaction('Finish Entry: CIB Credit Due', () => {
  useBudgetStore.getState().updateEntry(creditSettlementId, { isClosed: true, keepOngoing: false, amount: 3500 });
});

state = useBudgetStore.getState();
assert.strictEqual(state.creditSettlementOverrides[creditSettlementId]?.isClosed, true);

creditEntries = buildCreditDueEntries({
  accounts: state.accounts,
  creditDues: state.creditDues,
  cashEntries: state.entries,
  archivedEntries: state.archivedEntries,
  entryActuals: state.entryActuals,
  creditSettlementOverrides: state.creditSettlementOverrides,
});
cibSettlement = creditEntries.find(e => e.id === creditSettlementId);
assert.ok(cibSettlement, 'Credit settlement still exists in engine');
assert.strictEqual(cibSettlement.isClosed, true, 'Credit settlement isClosed is now true, so Cash Flow filters it out');

// Undo Finish
useBudgetStore.getState().undo();
state = useBudgetStore.getState();
assert.strictEqual(Boolean(state.creditSettlementOverrides[creditSettlementId]?.isClosed), false, 'Override isClosed reverted');

creditEntries = buildCreditDueEntries({
  accounts: state.accounts,
  creditDues: state.creditDues,
  cashEntries: state.entries,
  archivedEntries: state.archivedEntries,
  entryActuals: state.entryActuals,
  creditSettlementOverrides: state.creditSettlementOverrides,
});
cibSettlement = creditEntries.find(e => e.id === creditSettlementId);
assert.strictEqual(cibSettlement.isClosed, false, 'Credit settlement isClosed reverted to false, reappearing in Cash Flow');

// Redo Finish
useBudgetStore.getState().redo();
state = useBudgetStore.getState();
assert.strictEqual(state.creditSettlementOverrides[creditSettlementId]?.isClosed, true, 'Redo restores isClosed: true');
console.log('✓ Test 5d passed!');

// Test 6: Max undo depth capping at 30 items
console.log('Test 6: Max undo depth capping at 30 items...');
for (let i = 0; i < 35; i++) {
  useBudgetStore.getState().addEntry({
    date: '2026-10-25',
    category: 'General',
    account: 'Cash',
    type: 'expense',
    amount: 10 + i,
    tag: 'DepthTest'
  });
}
state = useBudgetStore.getState();
assert.strictEqual(state.undoStack.length, 30, 'undoStack should be capped at 30');
console.log('✓ Test 6 passed!');

// Test 7: Clear undo history
console.log('Test 7: Clear undo history...');
useBudgetStore.getState().clearUndoHistory();
state = useBudgetStore.getState();
assert.strictEqual(state.undoStack.length, 0);
assert.strictEqual(state.redoStack.length, 0);
assert.strictEqual(state.undoToast, null);
console.log('✓ Test 7 passed!');

console.log('All Undo/Redo tests passed successfully!');
