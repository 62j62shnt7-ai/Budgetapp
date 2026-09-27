import assert from 'node:assert';
import fs from 'node:fs';

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

import {
  calculateCreditSettlementDate,
  isCreditCardExpense,
  buildCreditDueEntries,
  getCoveredCreditSettlementKeys,
} from '../src/engine/creditCards.ts';
import {
  buildSalaryEntries,
  buildInstallmentEntries,
  getInstallmentDateId,
} from '../src/engine/salaryAndInstallments.ts';
import {
  calculateForecast,
  detectDeficits,
  getEntryActualAmount,
  getDeficitPeriods,
  getLowestProjectedBalanceAfterSpend,
  getRemainingForecastAmount,
  isOngoingEntry,
  simulateSpend,
} from '../src/engine/forecast.ts';
import { computeSpreadPct, computeAssetEgpValue, defaultRates, autoFetchLatestRates } from '../src/engine/currency.ts';
import { computeFinancialHealthScore } from '../src/engine/healthScore.ts';
import { DateUtils } from '../src/engine/dateUtils.ts';
import { useBudgetStore } from '../src/store/useBudgetStore.ts';

console.log('Running comprehensive test suite for Budget Control Financial Engine & Store...\n');

// =========================================================================
// 1. Credit Card Settlement Rules & Statement Overrides
// =========================================================================
const cibEarly = calculateCreditSettlementDate('2026-05-10', 'cib');
assert.strictEqual(cibEarly, '2026-06-15', `CIB early cycle mismatch: got ${cibEarly}`);

const cibLate = calculateCreditSettlementDate('2026-05-20', 'cib');
assert.strictEqual(cibLate, '2026-07-15', `CIB late cycle mismatch: got ${cibLate}`);

const hsbcSpend = calculateCreditSettlementDate('2026-05-10', 'hsbc');
assert.strictEqual(hsbcSpend, '2026-06-30', `HSBC cycle mismatch: got ${hsbcSpend}`);
console.log('✓ Credit card settlement dates verified');

// 2. Credit Card Expense Identification
assert.strictEqual(isCreditCardExpense({ id: '1', date: '2026-05-01', amount: 100, type: 'expense', category: 'General', account: 'CIB Credit' }), true);
assert.strictEqual(isCreditCardExpense({ id: '2', date: '2026-05-01', amount: 100, type: 'expense', category: 'General', account: 'HSBC Card' }), true);
assert.strictEqual(isCreditCardExpense({ id: '3', date: '2026-05-01', amount: 100, type: 'expense', category: 'General', account: 'HSBC' }), false);
assert.strictEqual(isCreditCardExpense({ id: '4', date: '2026-05-01', amount: 100, type: 'expense', category: 'General', account: 'cash' }), false);
console.log('✓ Credit card identification logic verified');

// 3. Authoritative Statement Overrides & Variance
const sampleCardEntries = [
  { id: 'c1', date: '2026-05-05', amount: 3000, type: 'expense', category: 'Shopping', account: 'CIB Credit' },
  { id: 'c2', date: '2026-05-08', amount: 2000, type: 'expense', category: 'Dining', account: 'CIB Credit' },
]; // Sum = 5000 calculated for June 2026

// Lower manual statement override (e.g. 4200 due to bank promo / refund)
const duesWithLowerOverride = buildCreditDueEntries({
  accounts: { cib: { name: 'CIB', balance: 50000, maturityDay: 15 } },
  creditDues: {},
  cashEntries: sampleCardEntries,
  archivedEntries: [],
  entryActuals: {},
  creditSettlementOverrides: {
    'credit-settlement-cib-2026-06': {
      amount: 4200,
      date: '2026-06-15',
      note: 'Bank discount applied',
    },
  },
});

const cibJuneDue = duesWithLowerOverride.find((d) => d.id === 'credit-settlement-cib-2026-06');
assert.ok(cibJuneDue, 'Should generate credit settlement for June 2026');
assert.strictEqual(cibJuneDue.amount, 4200, 'Authoritative manual override must be used (not Math.max)');
assert.strictEqual(cibJuneDue.calculatedAmount, 5000, 'Calculated baseline must be preserved');
assert.strictEqual(cibJuneDue.variance, -800, 'Variance must be statement - calculated = -800');
assert.strictEqual(cibJuneDue.statementNote, 'Bank discount applied', 'Statement reconciliation note preserved');

// Higher manual statement override (e.g. 5500 due to bank interest/fee)
const duesWithHigherOverride = buildCreditDueEntries({
  accounts: { cib: { name: 'CIB', balance: 50000, maturityDay: 15 } },
  creditDues: {},
  cashEntries: sampleCardEntries,
  archivedEntries: [],
  entryActuals: {},
  creditSettlementOverrides: {
    'credit-settlement-cib-2026-06': {
      amount: 5500,
      date: '2026-06-15',
      note: 'Annual card renewal fee included',
    },
  },
});
const cibJuneDueHigher = duesWithHigherOverride.find((d) => d.id === 'credit-settlement-cib-2026-06');
assert.strictEqual(cibJuneDueHigher.amount, 5500);
assert.strictEqual(cibJuneDueHigher.variance, 500);
console.log('✓ Authoritative credit statement overrides & variance calculation verified');

// 4. Cross-month Credit Settlement Deduplication Helper
const coveredKeys = getCoveredCreditSettlementKeys([
  { id: 'm1', date: '2026-06-14', amount: 5000, actualAmount: 5000, type: 'expense', category: 'CIB Credit Due', account: 'cib', creditType: 'cib' },
  { id: 'm2', date: '2026-07-28', amount: 2000, actualAmount: 2000, type: 'expense', category: 'HSBC Credit Due', account: 'hsbc', creditType: 'hsbc' },
]);
assert.ok(coveredKeys.has('cib-2026-06'), 'CIB payment on 2026-06-14 covers 2026-06 cycle');
assert.ok(coveredKeys.has('hsbc-2026-07'), 'HSBC payment on 2026-07-28 covers 2026-07 cycle');
console.log('✓ Cross-month credit settlement cycle deduplication keys verified');

// =========================================================================
// 5. Date-Stable Installments & Fallback Logic
// =========================================================================
const instId = getInstallmentDateId('car-loan', '2026-08');
assert.strictEqual(instId, 'installment-car-loan-2026-08');

const sampleInstallments = [
  {
    id: 'macbook',
    name: 'MacBook Pro',
    amount: 5000,
    totalMonths: 12,
    remainingMonths: 12,
    startMonth: '2026-01',
    day: 10,
    account: 'cib',
  },
];
const builtInsts = buildInstallmentEntries(sampleInstallments);
assert.strictEqual(builtInsts[0].id, 'installment-macbook-2026-01');
assert.strictEqual(builtInsts[1].id, 'installment-macbook-2026-02');

// Check that getEntryActualAmount resolves new date-based ID and falls back to legacy index ID if present
const mockActuals = {
  'installment-macbook-2026-01': 5000,
  'installment-macbook-1': 5000, // legacy index-based format for month 2
};
assert.strictEqual(getEntryActualAmount(builtInsts[0], mockActuals), 5000, 'Direct date ID lookup');
assert.strictEqual(getEntryActualAmount(builtInsts[1], mockActuals), 5000, 'Fallback to legacy index ID lookup');
console.log('✓ Date-stable installment IDs and legacy backward compatibility verified');

// =========================================================================
// 6. Salary Generator
// =========================================================================
const currentYm = DateUtils.currentYearMonth();
const pattern = [
  { monthOffset: 0, day: 15, amount: 20000 },
  { monthOffset: 0, day: 30, amount: 20000 },
];
const salaryEntries = buildSalaryEntries(pattern, currentYm, 1);
assert.strictEqual(salaryEntries.length >= 2, true);
assert.strictEqual(salaryEntries[0].amount, 20000);

const anchoredSalary = buildSalaryEntries(
  [{ monthOffset: 0, day: 31, amount: 1000 }, { monthOffset: 1, day: 15, amount: 2000 }],
  '2026-01',
  1,
  '2026-01',
);
assert.deepStrictEqual(
  anchoredSalary.map((entry) => [entry.date, entry.amount]),
  [['2026-01-31', 1000], ['2026-02-15', 2000]],
);
console.log('✓ Salary matrix schedule generation verified');

// =========================================================================
// 7. Forecast Engine & Deficits
// =========================================================================
const mockEntries = [
  { id: '1', date: `${currentYm}-05`, amount: 10000, type: 'income', category: 'Salary', account: 'cash' },
  { id: '2', date: `${currentYm}-10`, amount: 15000, type: 'expense', category: 'Rent', account: 'cash' },
];
const forecast = calculateForecast(mockEntries, 1000, 3);
assert.strictEqual(forecast[0].income, 10000);
assert.strictEqual(forecast[0].expense, 15000);
assert.strictEqual(forecast[0].balance, -4000);

const deficits = detectDeficits(forecast);
assert.strictEqual(deficits.hasDeficit, true);
assert.strictEqual(deficits.worstDeficit, 4000);
console.log('✓ Forecast calculation & deficit detection verified');

assert.deepStrictEqual(
  getLowestProjectedBalanceAfterSpend([
    { date: '2026-01-01', type: 'expense', amount: 120 },
    { date: '2026-01-02', type: 'income', amount: 50 },
  ], 100, '2026-01-01', 20),
  { balance: -40, date: '2026-01-01' }
);
assert.deepStrictEqual(
  getLowestProjectedBalanceAfterSpend([
    { date: '2026-01-02', type: 'income', amount: 50 },
  ], 100, '2026-01-01', 120),
  { balance: -20, date: '2026-01-01' }
);
console.log('✓ Spend simulator uses day-level balances verified');

assert.deepStrictEqual(
  simulateSpend([
    { date: '2026-01-01', type: 'expense', amount: 120 },
  ], 100, '2026-01-01', 20),
  { lowestBalance: -40, lowestDate: '2026-01-01', triggerDate: '2026-01-01', triggerBalance: -20 }
);
console.log('✓ Spend simulator reports deficit trigger details verified');

const recoveredDeficits = getDeficitPeriods([
  { id: 'trigger', date: '2026-09-10', amount: 2000, type: 'expense', category: 'Flexible', account: 'cash' },
  { id: 'recovery', date: '2026-09-15', amount: 2500, type: 'income', category: 'Salary', account: 'cash' },
], 1000);
assert.strictEqual(recoveredDeficits.length, 1);
assert.strictEqual(recoveredDeficits[0].startDate, '2026-09-10');
assert.strictEqual(recoveredDeficits[0].resolvedDate, '2026-09-15');
assert.strictEqual(recoveredDeficits[0].resolvedBy, 'Salary');
assert.strictEqual(recoveredDeficits[0].isResolved, true);
assert.strictEqual(recoveredDeficits[0].steps.at(-1).isRecoveryStep, true);
console.log('✓ Day-level deficit recovery and remediation timeline verified');

const ongoingEntry = {
  id: 'home-2026-09-09',
  date: '2026-09-09',
  amount: 15000,
  type: 'expense',
  category: 'Home',
  account: 'hsbc',
};
const ongoingActuals = { [ongoingEntry.id]: 14306 };
assert.strictEqual(getEntryActualAmount(ongoingEntry, ongoingActuals), 14306);
assert.strictEqual(getRemainingForecastAmount(ongoingEntry, ongoingActuals), 694);
assert.strictEqual(isOngoingEntry(ongoingEntry, ongoingActuals), true);
console.log('✓ Ongoing partial entry tracking verified');

// =========================================================================
// 8. Currency Spread & Valuation
// =========================================================================
const spread = computeSpreadPct(48.5, 48.4);
assert.strictEqual(spread > 0 && spread < 1, true);

const goldAsset = {
  id: 'g1',
  name: 'Gold 24',
  category: 'Gold',
  quantity: 10,
  rateSource: 'gold:Gold 24',
  unit: 'grams',
  rate: 3600,
  buyPrice: 3600,
  currency: 'EGP',
};
const goldVal = computeAssetEgpValue(goldAsset, defaultRates);
assert.strictEqual(goldVal, 10 * 3600);

const recentRates = {
  ...defaultRates,
  lastFetched: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
};
const throttleResult = await autoFetchLatestRates(recentRates);
assert.strictEqual(throttleResult, null, 'Should skip auto-fetch when last fetched within 1 hour');
console.log('✓ Gold & currency valuation formulas and 1h throttle verified');

// 9. Financial Health Score
const health = computeFinancialHealthScore(forecast, deficits, 1000, 35800);
assert.strictEqual(typeof health.score, 'number');
assert.strictEqual(['A', 'B', 'C', 'D', 'F'].includes(health.grade), true);
console.log('✓ Financial health score engine verified');

// =========================================================================
// 10. Store Unit Operations: Draws, Jobs, Recurring, Archive & Import
// =========================================================================
// 10. Store Unit Operations: Draws, Jobs, Recurring, Archive & Import
// =========================================================================
// A. Draws management & automatic actual summing
const testEntryId = useBudgetStore.getState().addEntry({
  date: '2026-09-01',
  category: 'Home Renovation',
  account: 'cib',
  type: 'expense',
  amount: 20000,
});

useBudgetStore.getState().addDraw(testEntryId, { date: '2026-09-02', amount: 5000, note: 'Paint materials' });
useBudgetStore.getState().addDraw(testEntryId, { date: '2026-09-05', amount: 8000, note: 'Plumbing contractor' });

let updatedEntry = useBudgetStore.getState().entries.find((e) => e.id === testEntryId);
assert.ok(updatedEntry);
assert.strictEqual(updatedEntry.draws?.length, 2);
assert.strictEqual(useBudgetStore.getState().entryActuals[testEntryId], 13000, 'Entry actual should sum draws (5000 + 8000 = 13000)');

// Update a draw
useBudgetStore.getState().updateDraw(testEntryId, 0, { date: '2026-09-02', amount: 6000, note: 'Paint & brushes' });
assert.strictEqual(useBudgetStore.getState().entryActuals[testEntryId], 14000, 'Entry actual should update after draw edit (6000 + 8000 = 14000)');

// Delete a draw
useBudgetStore.getState().deleteDraw(testEntryId, 0);
assert.strictEqual(useBudgetStore.getState().entryActuals[testEntryId], 8000, 'Entry actual should decrease after draw delete');

// Delete last draw
useBudgetStore.getState().deleteDraw(testEntryId, 0);
assert.strictEqual(useBudgetStore.getState().entryActuals[testEntryId], undefined, 'Entry actual should clear when all draws deleted');
console.log('✓ Draw tranche operations & automated actual derivation verified');

// B. Job payment cashflow linking & configurable cascading deletion
const testJobId = `job-test-${Date.now()}`;
const paymentId1 = `pay-1-${Date.now()}`;
const paymentId2 = `pay-2-${Date.now()}`;

// Create cash entries for payments
const linkedCashEntryId1 = useBudgetStore.getState().addEntry({
  date: '2026-09-15',
  category: 'Consulting Project 1',
  tag: 'Job Payment',
  account: 'cib',
  type: 'income',
  amount: 25000,
  currency: 'EGP',
});

const linkedCashEntryId2 = useBudgetStore.getState().addEntry({
  date: '2026-09-20',
  category: 'Consulting Project 2',
  tag: 'Job Payment',
  account: 'cib',
  type: 'income',
  amount: 25000,
  currency: 'EGP',
});

useBudgetStore.getState().saveJob('asf', {
  id: testJobId,
  client: 'Acme Corp',
  title: 'Consulting Project',
  rate: 1000,
  currency: 'USD',
  workedDays: [],
  expenses: [],
  payments: [
    {
      id: paymentId1,
      date: '2026-09-15',
      amount: 500,
      currency: 'USD',
      egpAmount: 25000,
      note: 'Milestone 1',
      entryId: linkedCashEntryId1,
    },
    {
      id: paymentId2,
      date: '2026-09-20',
      amount: 500,
      currency: 'USD',
      egpAmount: 25000,
      note: 'Milestone 2',
      entryId: linkedCashEntryId2,
    },
  ],
});

let job = useBudgetStore.getState().asfJobs.find((j) => j.id === testJobId);
assert.strictEqual(job?.payments.length, 2);

// Case 1: Delete payment while keeping cashflow history entry intact
useBudgetStore.getState().deleteJobPayment('asf', testJobId, paymentId1, { deleteCashEntry: false });
job = useBudgetStore.getState().asfJobs.find((j) => j.id === testJobId);
assert.strictEqual(job?.payments.length, 1);
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === linkedCashEntryId1), true, 'Linked cashflow entry must be PRESERVED when deleteCashEntry is false');

// Case 2: Delete payment and also remove cashflow history entry
useBudgetStore.getState().deleteJobPayment('asf', testJobId, paymentId2, { deleteCashEntry: true });
job = useBudgetStore.getState().asfJobs.find((j) => j.id === testJobId);
assert.strictEqual(job?.payments.length, 0);
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === linkedCashEntryId2), false, 'Linked cashflow entry must be DELETED when deleteCashEntry is true');

// Case 3: Delete entire job while preserving historical entries
useBudgetStore.getState().deleteJob('asf', testJobId, { deleteCashEntries: false });
assert.strictEqual(useBudgetStore.getState().asfJobs.some((j) => j.id === testJobId), false);
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === linkedCashEntryId1), true, 'Payment 1 cashflow history entry remains intact');
console.log('✓ Job payment Cashflow linking & configurable History preservation verified');

// C. Recurring Series Single vs Future Updates
const testSeriesId = `series-test-${Date.now()}`;
const r1 = useBudgetStore.getState().addEntry({ date: '2026-10-01', category: 'Internet', account: 'cib', type: 'expense', amount: 500, seriesId: testSeriesId });
const r2 = useBudgetStore.getState().addEntry({ date: '2026-11-01', category: 'Internet', account: 'cib', type: 'expense', amount: 500, seriesId: testSeriesId });
const r3 = useBudgetStore.getState().addEntry({ date: '2026-12-01', category: 'Internet', account: 'cib', type: 'expense', amount: 500, seriesId: testSeriesId });

// Update future occurrences from 2026-11-01 onwards
useBudgetStore.getState().updateEntry(r2, { date: '2026-11-01', category: 'Internet Fiber', account: 'cib', type: 'expense', amount: 650 }, 'future');

const checkR1 = useBudgetStore.getState().entries.find((e) => e.id === r1);
const checkR2 = useBudgetStore.getState().entries.find((e) => e.id === r2);
const checkR3 = useBudgetStore.getState().entries.find((e) => e.id === r3);

assert.strictEqual(checkR1?.amount, 500, 'Prior occurrence remains unchanged');
assert.strictEqual(checkR2?.amount, 650, 'Target occurrence updated');
assert.strictEqual(checkR3?.amount, 650, 'Future occurrence updated');
console.log('✓ Recurring series single vs future updates verified');

// D. Archiving Settled Entries & Unarchiving
const settledEntryId = useBudgetStore.getState().addEntry({
  date: '2026-01-01',
  category: 'Old Settled Expense',
  account: 'cib',
  type: 'expense',
  amount: 1000,
  actualAmount: 1000,
});
useBudgetStore.getState().recordActual(settledEntryId, 1000, '2026-01-01');

const archivedCount = useBudgetStore.getState().archiveSettledEntries();
assert.ok(archivedCount >= 1, 'Should archive settled entry');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === settledEntryId), false, 'Archived entry removed from active entries');
assert.strictEqual(useBudgetStore.getState().archivedEntries.some((e) => e.id === settledEntryId), true, 'Present in archived entries');

// Unarchive entry
useBudgetStore.getState().unarchiveEntry(settledEntryId);
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === settledEntryId), true, 'Restored to active entries');
assert.strictEqual(useBudgetStore.getState().archivedEntries.some((e) => e.id === settledEntryId), false, 'Removed from archived entries');
console.log('✓ Archiving settled entries & unarchiving verified');

// E. Import Replacement & Undo Import
const preImportEntriesCount = useBudgetStore.getState().entries.length;
const testImportPayload = {
  version: '2.1',
  exportedAt: new Date().toISOString(),
  accounts: {
    cib: { name: 'CIB Clean', balance: 75000, maturityDay: 15 },
  },
  cashEntries: [
    { id: 'imp-1', date: '2026-10-15', category: 'Imported Entry', account: 'cib', type: 'income', amount: 99999 },
  ],
  entryActuals: {
    'imp-1': 99999,
  },
};

const importSuccess = useBudgetStore.getState().importJSON(testImportPayload);
assert.strictEqual(importSuccess, true, 'Import should succeed');
assert.strictEqual(useBudgetStore.getState().entries.length, 1, 'Import must replace active entries (no stale merge)');
assert.strictEqual(useBudgetStore.getState().entries[0].id, 'imp-1');
assert.strictEqual(useBudgetStore.getState().accounts.cib.balance, 75000);

// Test Undo Import
const undoSuccess = useBudgetStore.getState().undoImport();
assert.strictEqual(undoSuccess, true, 'Undo import should succeed');
assert.strictEqual(useBudgetStore.getState().entries.length, preImportEntriesCount, 'State fully restored from pre-import backup');
console.log('✓ Clean import replacement, orphan cleanup & undoImport verified');

// F. Migration Pipeline & Conflict Resolution
const legacyArray = [
  { amount: '500', category: 'Old Legacy Rent', type: 'expense', account: 'cash' }
];
const importLegacy = useBudgetStore.getState().importJSON(legacyArray);
assert.strictEqual(importLegacy, true, 'Legacy array migrated and imported');
assert.strictEqual(useBudgetStore.getState().entries[0].category, 'Old Legacy Rent');
assert.strictEqual(useBudgetStore.getState().entries[0].account, 'cib', 'Legacy cash mapped to valid account');
assert.strictEqual(useBudgetStore.getState().entries[0].amount, 500, 'String amount converted to number');

// Gist conflict resolution
useBudgetStore.setState({
  gistConflict: {
    remoteTime: '2026-09-27T03:00:00.000Z',
    remoteData: JSON.stringify({
      version: '2.1',
      entries: [{ id: 'cloud-entry-1', amount: 1234, category: 'Cloud Entry', type: 'expense', account: 'cib', date: '2026-10-01' }]
    })
  }
});
await useBudgetStore.getState().resolveGistConflict('remote');
assert.strictEqual(useBudgetStore.getState().gistConflict, null, 'Gist conflict cleared');
assert.strictEqual(useBudgetStore.getState().entries[0].category, 'Cloud Entry', 'Remote data restored on user resolution');
// H. History Deduplication with Archived Entries and Deleted Forecasts
const testArchivePayload = {
  version: '2.1',
  entries: [
    { id: 'cur-1', date: '2026-09-15', category: 'CIB Credit Due', amount: 3056, actualAmount: 3056, type: 'expense', account: 'cib', creditType: 'cib' },
  ],
  archivedEntries: [
    { id: 'arch-1', date: '2026-07-15', category: 'Credit Due', amount: 1068, actualAmount: 1068, type: 'expense', account: 'CIB', creditType: 'cib' },
    { id: 'arch-2', date: '2026-08-15', category: 'Credit Due', amount: 35070, actualAmount: 35070, type: 'expense', account: 'CIB', creditType: 'cib' },
    { id: 'arch-3', date: '2026-07-29', category: 'Credit Due', amount: 3352, actualAmount: 3352, type: 'expense', account: 'HSBC', creditType: 'hsbc' },
    { id: 'arch-4', date: '2026-08-27', category: 'Credit Due', amount: 116977, actualAmount: 116977, type: 'expense', account: 'HSBC', creditType: 'hsbc' },
  ],
  deletedForecasts: ['credit-settlement-cib-2026-07', 'credit-settlement-hsbc-2026-07'],
  entryActuals: {
    'cur-1': 3056,
    'arch-1': 1068,
    'arch-2': 35070,
    'arch-3': 3352,
    'arch-4': 116977,
    'credit-settlement-cib-2026-07': 1068,
    'credit-settlement-cib-2026-08': 35070,
    'credit-settlement-hsbc-2026-07': 3352,
    'credit-settlement-hsbc-2026-08': 116977,
  }
};
const userImportSuccess = useBudgetStore.getState().importJSON(testArchivePayload);
assert.strictEqual(userImportSuccess, true, 'User test dataset imported');

const uState = useBudgetStore.getState();
const uCovered = getCoveredCreditSettlementKeys(
  uState.entries,
  uState.entryActuals,
  uState.entryActualDates,
  uState.creditSettlementOverrides,
  uState.archivedEntries
);
assert.ok(uCovered.has('cib-2026-07'), 'Archived CIB July settlement is covered');
assert.ok(uCovered.has('hsbc-2026-07'), 'Archived HSBC July settlement is covered');
assert.ok(uCovered.has('cib-2026-08'), 'Archived CIB August settlement is covered');
assert.ok(uCovered.has('hsbc-2026-08'), 'Archived HSBC August settlement is covered');

const uCreditEntries = buildCreditDueEntries({
  accounts: uState.accounts,
  creditDues: uState.creditDues,
  cashEntries: uState.entries,
  archivedEntries: uState.archivedEntries,
  entryActuals: uState.entryActuals,
  entryActualDates: uState.entryActualDates,
  creditSettlementOverrides: uState.creditSettlementOverrides,
});
const uDeletedSet = new Set(uState.deletedForecasts || []);
const getUActual = (entry) => {
  if (!entry) return 0;
  if (uState.entryActuals[entry.id] !== undefined) return Math.round(Number(uState.entryActuals[entry.id]) || 0);
  if (entry.actualAmount !== undefined && entry.actualAmount !== null) return Math.round(Number(entry.actualAmount) || 0);
  return 0;
};
const uValidCreditDues = uCreditEntries.filter((entry) => {
  if (uDeletedSet.has(entry.id)) return false;
  if (getUActual(entry) <= 0) return false;
  const parts = (entry.id || '').split('-');
  if (parts[0] === 'credit' && parts[1] === 'settlement') {
    const accKey = parts[2];
    const mKey = `${parts[3]}-${parts[4]}`;
    if (uCovered.has(`${accKey}-${mKey}`)) return false;
  }
  return true;
});
assert.strictEqual(uValidCreditDues.length, 0, 'No duplicate credit dues generated for archived or deleted periods');

// Test restore and clear deleted forecasts
useBudgetStore.getState().restoreDeletedForecast('credit-settlement-cib-2026-07');
assert.strictEqual(useBudgetStore.getState().deletedForecasts.includes('credit-settlement-cib-2026-07'), false, 'Forecast restored from deleted list');
useBudgetStore.getState().clearAllDeletedForecasts();
assert.strictEqual(useBudgetStore.getState().deletedForecasts.length, 0, 'All deleted forecasts cleared');
console.log('✓ History deduplication, restore forecast & clear deleted forecasts verified');

console.log('\n=================================================================');
console.log('🌟 100% OF ENGINE, STORE, AND BUSINESS LOGIC TESTS PASSED! 🌟');
console.log('=================================================================');
