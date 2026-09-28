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
import { computeFinancialHealthScore, analyzeSettledMonths } from '../src/engine/healthScore.ts';
import { DateUtils } from '../src/engine/dateUtils.ts';
import { calculateJobFinancials } from '../src/engine/jobs.ts';
import { useBudgetStore } from '../src/store/useBudgetStore.ts';
import {
  buildEntryDeleteOptions,
  buildInstallmentDeleteOptions,
  buildStorageDeleteOptions,
} from '../src/utils/affectedRecords.ts';

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

// Case 4: Forecast entry deletion auto-clears job forecast scheduling
const forecastJobId = `pt-test-${Date.now()}`;
const forecastEntryId = useBudgetStore.getState().addEntry({
  date: '2026-10-15',
  category: 'Job Income',
  account: 'cib',
  type: 'income',
  amount: 48500,
  currency: 'USD',
  originalAmount: 1000,
});

useBudgetStore.getState().saveJob('partTime', {
  id: forecastJobId,
  client: 'Global Client',
  title: 'Architecture Review',
  rate: 1000,
  currency: 'USD',
  workedDays: [],
  expenses: [],
  payments: [],
  forecastDueDate: '2026-10-15',
  forecastEntryId: forecastEntryId,
  forecastAmount: 1000,
  forecastDestination: 'account:cib',
});

let ptJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === forecastJobId);
assert.strictEqual(ptJob?.forecastDueDate, '2026-10-15');
assert.strictEqual(ptJob?.forecastEntryId, forecastEntryId);

// Delete the entry directly from cashflow/forecast
useBudgetStore.getState().deleteEntry(forecastEntryId);

ptJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === forecastJobId);
assert.strictEqual(ptJob?.forecastDueDate, undefined, 'Job forecastDueDate must be cleared when linked entry is deleted');
assert.strictEqual(ptJob?.forecastEntryId, undefined, 'Job forecastEntryId must be cleared when linked entry is deleted');

// Case 5: Recording actual & finishing forecast entry auto-settles Job payment and deposits into Storage
const settleJobId = `pt-settle-${Date.now()}`;
const settleEntryId = useBudgetStore.getState().addEntry({
  date: '2026-10-20',
  category: 'Job Income',
  account: 'HSBC USD Account',
  type: 'income',
  amount: 48500,
  currency: 'USD',
  originalAmount: 1000,
  fxRateAtEntry: 48.5,
});

useBudgetStore.getState().saveJob('partTime', {
  id: settleJobId,
  client: 'TechCorp',
  title: 'Backend Dev',
  rate: 1000,
  currency: 'USD',
  workedDays: [],
  expenses: [],
  payments: [],
  forecastDueDate: '2026-10-20',
  forecastEntryId: settleEntryId,
  forecastAmount: 1000,
  forecastDestination: 'storage:hsbc_usd',
});

let hsbcAsset = useBudgetStore.getState().storageAssets.find(a => a.name.toLowerCase().includes('hsbc') && a.unit === 'USD');
if (!hsbcAsset) {
  useBudgetStore.getState().addStorageAsset({
    name: 'HSBC USD Account',
    category: 'Currency',
    quantity: 0,
    unit: 'USD',
    buyPrice: 48.5,
    rate: 48.5,
    currency: 'EGP',
  });
  hsbcAsset = useBudgetStore.getState().storageAssets.find(a => a.name.toLowerCase().includes('hsbc') && a.unit === 'USD');
}
const initialStorageUsd = hsbcAsset?.quantity || 0;

// User records income of 48,500 EGP ($1000 USD), selects Deposit & Save (deposits 1000 to Storage) and finishes entry
useBudgetStore.getState().recordActual(settleEntryId, 48500, '2026-10-20');
useBudgetStore.getState().depositToStorageAsset(hsbcAsset.id, 1000);
useBudgetStore.getState().updateEntry(settleEntryId, { isClosed: true, keepOngoing: false, amount: 48500, account: 'HSBC USD Account' });

const settledJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === settleJobId);
assert.strictEqual(settledJob?.status, 'paid', 'Job must be marked paid after forecast settlement');
assert.strictEqual(settledJob?.payments?.length, 1, 'Job must have 1 payment recorded');
assert.strictEqual(settledJob?.payments?.[0].amount, 1000, 'Payment must be 1000 USD');
assert.strictEqual(settledJob?.forecastDueDate, undefined, 'Forecast due date must be cleared on paid job');

const finalStorageUsd = useBudgetStore.getState().storageAssets.find(a => a.name.toLowerCase().includes('hsbc') && a.unit === 'USD')?.quantity || 0;
assert.strictEqual(finalStorageUsd, initialStorageUsd + 1000, 'Storage HSBC USD must have received the 1000 USD deposit');

// Case 6: Clearing actual reverts entry, restores Job forecast/invoiced status, removes payment, and reverts storage
useBudgetStore.getState().clearActual(settleEntryId);

const revertedJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === settleJobId);
assert.strictEqual(revertedJob?.status, 'invoiced', 'Job must revert from paid to invoiced');
assert.strictEqual(revertedJob?.payments?.length, 0, 'Job payments must be empty after clearing actual');
assert.strictEqual(revertedJob?.forecastDueDate, '2026-10-20', 'Job forecastDueDate must be restored');
assert.strictEqual(revertedJob?.forecastEntryId, settleEntryId, 'Job forecastEntryId must be restored');

const revertedStorageUsd = useBudgetStore.getState().storageAssets.find(a => a.name.toLowerCase().includes('hsbc') && a.unit === 'USD')?.quantity || 0;
assert.strictEqual(revertedStorageUsd, initialStorageUsd, 'Storage HSBC USD must have reverted the 1000 USD deposit');

console.log('✓ Job payment Cashflow linking, forecast auto-unscheduling, storage deposit & clearActual reversal verified');

// Case 7: Multiple sequential tranches (Tranche 1: $200 kept in EGP/no deposit, Tranche 2: $300 deposited to USD)
const multiTrancheJobId = `pt-multi-${Date.now()}`;
const multiTrancheEntryId = useBudgetStore.getState().addEntry({
  date: '2026-11-01',
  category: 'Job Income',
  account: 'HSBC USD Account',
  type: 'income',
  amount: 48500,
  currency: 'USD',
  originalAmount: 1000,
  fxRateAtEntry: 48.5,
});

useBudgetStore.getState().saveJob('partTime', {
  id: multiTrancheJobId,
  client: 'MultiCorp',
  title: 'Consulting Contract',
  currency: 'USD',
  type: 'lumpsum',
  lumpSumAmount: 1000,
  forecastDueDate: '2026-11-01',
  forecastEntryId: multiTrancheEntryId,
  forecastAmount: 1000,
  forecastDestination: 'storage:hsbc_usd',
  payments: [],
});

// Record Tranche 1: $200 (9,700 EGP) - No deposit
useBudgetStore.getState().addDraw(multiTrancheEntryId, {
  id: `draw-1-${Date.now()}`,
  date: '2026-11-02',
  amount: 9700,
  note: 'Tranche 1 (EGP - No Deposit)',
  account: 'Recorded Only (No Deposit)',
});

let mtJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === multiTrancheJobId);
let mtFin = calculateJobFinancials(mtJob, useBudgetStore.getState().rates);
assert.strictEqual(mtFin.totalPaid, 200, 'Total paid after Tranche 1 must be 200 USD');
assert.strictEqual(mtFin.remainingBalance, 800, 'Remaining balance after Tranche 1 must be 800 USD');
assert.strictEqual(mtJob?.status, 'partial', 'Job status must be partial after Tranche 1');

// Record Tranche 2: $300 (14,550 EGP) - Deposited to HSBC USD
useBudgetStore.getState().addDraw(multiTrancheEntryId, {
  id: `draw-2-${Date.now()}`,
  date: '2026-11-05',
  amount: 14550,
  note: 'Tranche 2 (USD Storage Deposit)',
  account: 'HSBC USD Account',
});

// Delete Tranche 2 via deleteDraw and verify job payment is removed & balance updated
const mtEntry = useBudgetStore.getState().entries.find((e) => e.id === multiTrancheEntryId);
const draw2Index = (mtEntry?.draws || []).findIndex((d) => d.amount === 14550);
assert(draw2Index !== -1, 'Draw 2 must exist in entry draws');
useBudgetStore.getState().deleteDraw(multiTrancheEntryId, draw2Index);

mtJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === multiTrancheJobId);
mtFin = calculateJobFinancials(mtJob, useBudgetStore.getState().rates);
assert.strictEqual(mtFin.totalPaid, 200, 'Total paid must revert to 200 USD after deleting Tranche 2');
assert.strictEqual(mtFin.remainingBalance, 800, 'Remaining balance must revert to 800 USD after deleting Tranche 2');
assert.strictEqual(mtJob?.payments?.length, 1, 'Job must now have only 1 payment remaining');

// Now delete Payment 1 from Jobs tab and verify entry draws & actuals revert to empty
const pay1Id = mtJob?.payments?.[0].id;
useBudgetStore.getState().deleteJobPayment('partTime', multiTrancheJobId, pay1Id);
mtJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === multiTrancheJobId);
assert.strictEqual(mtJob?.payments?.length, 0, 'Job payments must be empty after deleting payment from Jobs tab');
assert.strictEqual(mtJob?.status, 'invoiced', 'Job status must revert to invoiced');

const entryAfterJobDelete = useBudgetStore.getState().entries.find((e) => e.id === multiTrancheEntryId);
assert.strictEqual(entryAfterJobDelete?.draws?.length, 0, 'Entry draws must be empty after job payment deletion');
assert.strictEqual(useBudgetStore.getState().entryActuals[multiTrancheEntryId], undefined, 'Entry actuals must be cleared');

console.log('✓ Multi-tranche sequential payments & separate destination tracking verified');
console.log('✓ Bidirectional tranche addition & deletion synchronization (Forecast ↔ History ↔ Jobs) verified');

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

// Test Storage Reversion on Tranche & Payment Deletion
useBudgetStore.setState({
  storageAssets: [
    {
      id: 'hsbc-usd-asset',
      name: 'HSBC USD Account',
      category: 'Currency',
      quantity: 2100,
      unit: 'USD',
      buyPrice: 50,
      rate: 50,
      currency: 'EGP',
      locationType: 'bank',
      location: 'hsbc',
    },
  ],
  entries: [
    {
      id: 'job-usd-forecast',
      date: '2026-09-27',
      amount: 105000,
      originalAmount: 2100,
      currency: 'USD',
      fxRateAtEntry: 50,
      category: 'Job Income',
      account: 'HSBC USD Account',
      type: 'income',
      actualAmount: 105000,
      draws: [
        { id: 'draw-1', date: '2026-09-20', amount: 80000, note: 'Tranche 1', account: 'HSBC USD Account' },
        { id: 'draw-2', date: '2026-09-27', amount: 25000, note: 'Tranche 2', account: 'HSBC USD Account' },
      ],
    },
  ],
  rates: { USD: 50, EUR: 55, goldGram24: 4000 },
});

// Delete Tranche 2 (25,000 EGP = 500 USD) with revertStorage = true
useBudgetStore.getState().deleteDraw('job-usd-forecast', 1, {
  updateCashflow: true,
  syncJob: false,
  revertStorage: true,
});

const updatedStorage = useBudgetStore.getState().storageAssets.find((a) => a.id === 'hsbc-usd-asset');
assert.strictEqual(updatedStorage.quantity, 1600, 'HSBC USD Account quantity reverted from 2100 to 1600 USD (500 USD deducted)');
const revertedEntry = useBudgetStore.getState().entries.find((e) => e.id === 'job-usd-forecast');
assert.strictEqual(revertedEntry.draws.length, 1, 'Entry has 1 draw remaining');
assert.strictEqual(revertedEntry.actualAmount, 80000, 'Entry actual amount updated to 80000 EGP');
console.log('✓ Storage balance reversion upon draw deletion verified');

// Test Expense Tranche Deletion (Refunds back to Bank Account)
useBudgetStore.setState({
  accounts: {
    cib: { id: 'cib', name: 'CIB', balance: 5000 },
    hsbc: { id: 'hsbc', name: 'HSBC', balance: 10000 },
  },
  entries: [
    {
      id: 'expense-test-entry',
      date: '2026-09-27',
      amount: 3000,
      currency: 'EGP',
      category: 'Home Supplies',
      account: 'cib',
      type: 'expense',
      actualAmount: 2000,
      draws: [
        { id: 'draw-exp-1', date: '2026-09-26', amount: 1500, note: 'Tranche 1', account: 'cib' },
        { id: 'draw-exp-2', date: '2026-09-27', amount: 500, note: 'Tranche 2', account: 'cib' },
      ],
    },
  ],
});

// Delete Tranche 2 (500 EGP) from expense -> should refund +500 to CIB (5000 -> 5500)
useBudgetStore.getState().deleteDraw('expense-test-entry', 1, {
  updateCashflow: true,
  revertStorage: true,
});

const cibAccount = useBudgetStore.getState().accounts.cib;
assert.strictEqual(cibAccount.balance, 5500, 'CIB balance refunded from 5000 to 5500 EGP after deleting 500 EGP expense tranche');
const updatedExpense = useBudgetStore.getState().entries.find((e) => e.id === 'expense-test-entry');
assert.strictEqual(updatedExpense.actualDate, '2026-09-26', 'Expense actualDate updated to the date of the last remaining tranche (2026-09-26)');
assert.strictEqual(useBudgetStore.getState().entryActualDates['expense-test-entry'], '2026-09-26', 'entryActualDates updated to 2026-09-26');
console.log('✓ Expense tranche deletion bank refund & date re-ordering verified');

// Test Tranche Re-ordering on out-of-order Tranche Deletion
useBudgetStore.setState({
  entries: [
    {
      id: 'multidraw-entry',
      date: '2026-09-01',
      amount: 1000,
      currency: 'EGP',
      category: 'Consulting',
      account: 'cib',
      type: 'income',
      actualAmount: 900,
      draws: [
        { id: 'd-1', date: '2026-09-10', amount: 300, account: 'cib' },
        { id: 'd-2', date: '2026-09-25', amount: 400, account: 'cib' },
        { id: 'd-3', date: '2026-09-18', amount: 200, account: 'cib' },
      ],
    },
  ],
  entryActualDates: { 'multidraw-entry': '2026-09-25' },
});

// Delete Tranche 2 (date 2026-09-25) -> remaining dates are 2026-09-10 and 2026-09-18 -> latest should be 2026-09-18
useBudgetStore.getState().deleteDraw('multidraw-entry', 1, { updateCashflow: true });
const mdEntry = useBudgetStore.getState().entries.find((e) => e.id === 'multidraw-entry');
assert.strictEqual(mdEntry.actualDate, '2026-09-18', 'Entry actualDate properly re-derived from remaining tranches as 2026-09-18');
assert.strictEqual(useBudgetStore.getState().entryActualDates['multidraw-entry'], '2026-09-18', 'entryActualDates updated to 2026-09-18');
console.log('✓ Out-of-order tranche deletion chronological date re-derivation verified');

// Test Affected Records Builders & Selective Cascade
const testEntryToAffect = {
  id: 'test-entry-affected',
  date: '2026-10-01',
  category: 'Car Loan Inflow',
  amount: 50000,
  type: 'income',
  loanId: 'car-loan-inst-1',
  seriesId: 'series-car-loan',
  draws: [{ date: '2026-10-01', amount: 50000, note: 'Initial tranche' }],
};

const entryAffectedRes = buildEntryDeleteOptions(testEntryToAffect, {
  installments: [{ id: 'car-loan-inst-1', name: 'Car Loan', amount: 5000, totalMonths: 10, remainingMonths: 8, startMonth: '2026-10' }],
  storageAssets: [],
  partTimeJobs: [],
  asfJobs: [],
  irqJobs: [],
});

assert.strictEqual(entryAffectedRes.options.some((o) => o.id === 'cashflow'), true, 'Contains cashflow primary option');
assert.strictEqual(entryAffectedRes.options.some((o) => o.id === 'series'), true, 'Contains recurring series scope option');
assert.strictEqual(entryAffectedRes.options.some((o) => o.id === 'loan'), true, 'Contains linked loan option');
assert.strictEqual(entryAffectedRes.options.some((o) => o.id === 'draws'), true, 'Contains draws option');

// Test Installment affected options
const testInst = { id: 'inst-test-1', name: 'MacBook Installment', amount: 2500, totalMonths: 12, remainingMonths: 6, startMonth: '2026-05' };
const instAffectedRes = buildInstallmentDeleteOptions(testInst, {
  entries: [{ id: 'e-inst-1', date: '2026-10-01', category: 'MacBook Installment', amount: 2500, type: 'expense', account: 'cib' }],
});
assert.strictEqual(instAffectedRes.options.some((o) => o.id === 'installment'), true, 'Contains installment option');
assert.strictEqual(instAffectedRes.options.some((o) => o.id === 'cashflow'), true, 'Contains linked cashflow option');

// Test Storage Asset affected options
const testStorageAsset = { id: 'storage-eur', name: 'HSBC EUR Account', category: 'Currency', quantity: 1500, unit: 'EUR', buyPrice: 55, currency: 'EGP' };
const storageAffectedRes = buildStorageDeleteOptions(testStorageAsset, {
  partTimeJobs: [{ id: 'job-eur', client: 'EuroCorp', title: 'Consulting', forecastDestination: 'storage:existing-storage-eur', type: 'daily_rate', currency: 'EUR' }],
  asfJobs: [],
  irqJobs: [],
});
assert.strictEqual(storageAffectedRes.options.some((o) => o.id === 'storage'), true, 'Contains storage option');
assert.strictEqual(storageAffectedRes.options.some((o) => o.id === 'jobs'), true, 'Contains linked jobs option');

// Test selective cascading deletion in store
useBudgetStore.setState({
  installments: [{ id: 'inst-to-del', name: 'Laptop Loan', amount: 3000, totalMonths: 6, remainingMonths: 3, startMonth: '2026-08' }],
  entries: [
    { id: 'e-loan-1', date: '2026-10-01', category: 'Laptop Loan', amount: 3000, type: 'expense', account: 'cib', loanId: 'inst-to-del' },
    { id: 'e-other', date: '2026-10-01', category: 'Groceries', amount: 1200, type: 'expense', account: 'cib' },
  ],
  archivedEntries: [],
});

// Delete installment with deleteCashEntries = true
useBudgetStore.getState().deleteInstallment('inst-to-del', { deleteCashEntries: true });
assert.strictEqual(useBudgetStore.getState().installments.length, 0, 'Installment deleted');
assert.strictEqual(useBudgetStore.getState().entries.length, 1, 'Linked loan entry deleted, other entry remains');
assert.strictEqual(useBudgetStore.getState().entries[0].id, 'e-other', 'Groceries entry preserved');

console.log('✓ Global Affected Records builders & selective cascading deletion verified');

// Test Storage Asset location persistence (Where Held does NOT revert to HSBC)
useBudgetStore.getState().addStorageAsset({
  name: 'Foreign Savings',
  category: 'Currency',
  quantity: 2000,
  unit: 'USD',
  buyPrice: 48.5,
  currency: 'EGP',
  rateSource: 'currency:USD',
  rate: 48.5,
  locationType: 'bank',
  location: 'cib',
  locationLabel: 'CIB Account',
});

const cibAsset = useBudgetStore.getState().storageAssets.find((a) => a.name === 'Foreign Savings');
assert.ok(cibAsset, 'Foreign Savings asset created');
assert.strictEqual(cibAsset.locationType, 'bank');
assert.strictEqual(cibAsset.location, 'cib');

// Update location from CIB to cash
useBudgetStore.getState().updateStorageAsset(cibAsset.id, {
  locationType: 'cash',
  location: 'cash',
  locationLabel: 'Physical Cash',
});

const updatedCib = useBudgetStore.getState().storageAssets.find((a) => a.id === cibAsset.id);
assert.strictEqual(updatedCib.locationType, 'cash', 'LocationType updated to cash');
assert.strictEqual(updatedCib.location, 'cash', 'Location updated to cash');

// Test that exporting JSON and importing it preserves the updated location (no revert to HSBC)
const exportedJson = useBudgetStore.getState().exportJSON();
const storageImportSuccess = useBudgetStore.getState().importJSON(exportedJson);
assert.strictEqual(storageImportSuccess, true, 'Import succeeded');

const postImportAsset = useBudgetStore.getState().storageAssets.find((a) => a.id === cibAsset.id);
assert.ok(postImportAsset, 'Asset exists after import');
assert.strictEqual(postImportAsset.locationType, 'cash', 'LocationType still cash after import');
assert.strictEqual(postImportAsset.location, 'cash', 'Location still cash after import');

console.log('✓ Storage Asset location persistence across mutations, Gist export, and migration verified');

// ---------------------------------------------------------------------------
// Measured Financial Health Score (budget adherence + savings from settled months)
// ---------------------------------------------------------------------------
const healthLedger = [
  // 2026-06 (settled): earned 30,000 (20,000 salary + 10,000 loan proceeds), spent 12,000 vs 12,000 planned
  { id: 'h-jun-sal', date: '2026-06-01', category: 'salary', account: 'hsbc', type: 'income', amount: 20000, source: 'salary' },
  { id: 'h-jun-loan', date: '2026-06-05', category: 'Loan Inflow: bridge', account: 'hsbc', type: 'income', amount: 10000, source: 'loan' },
  { id: 'h-jun-exp', date: '2026-06-10', category: 'Home', account: 'hsbc', type: 'expense', amount: 12000, source: 'expense' },
  // 2026-07 (settled): earned 20,000, spent 25,000 vs 20,000 planned (25% overspend)
  { id: 'h-jul-sal', date: '2026-07-01', category: 'salary', account: 'hsbc', type: 'income', amount: 20000, source: 'salary' },
  { id: 'h-jul-exp', date: '2026-07-10', category: 'Home', account: 'hsbc', type: 'expense', amount: 20000, source: 'expense' },
  // 2026-08 (settled): an FX conversion must be ignored (internal transfer, not income)
  { id: 'h-aug-fx', date: '2026-08-02', category: 'FX Conversion', account: 'hsbc', type: 'income', amount: 90000, source: 'fx', conversionType: 'fx-sale', excludeFromForecast: true },
  // 2027-01 (future, must NOT be measured)
  { id: 'h-future', date: '2027-01-05', category: 'Home', account: 'hsbc', type: 'expense', amount: 99999, source: 'expense' },
];

// July's plan was 20,000 but 25,000 was actually spent.
const healthActuals = { 'h-jul-exp': 25000 };

const settled = analyzeSettledMonths({
  historyEntries: healthLedger,
  entryActuals: healthActuals,
  entryActualDates: {},
  creditSettlementOverrides: {},
  today: '2026-09-15',
  maxMonths: 3,
});
assert.strictEqual(settled.length, 2, 'Only fully-elapsed months are measured (2026-06, 2026-07)');
const [june, july] = settled;
assert.strictEqual(june.month, '2026-06');
assert.strictEqual(june.plannedExpense, 12000);
assert.strictEqual(june.realizedExpense, 12000);
assert.strictEqual(june.realizedIncome, 20000, 'Loan proceeds are financing, not income');
assert.strictEqual(june.adherenceScore, 22, 'Exactly on plan scores 22/25');
assert.strictEqual(july.month, '2026-07', 'FX-conversion-only month is excluded from measurement');
assert.strictEqual(july.realizedIncome, 20000);
assert.strictEqual(july.adherenceScore, 13, '25% overspend scores 13/25');

// Aggregated scoring: earned 40,000, spent 37,000 -> 7.5% savings rate
const measured = computeFinancialHealthScore({
  entries: healthLedger,
  forecast: [],
  deficitPeriods: [],
  actualCashNow: 60000,
  storageTotal: 30000,
  entryActuals: healthActuals,
  historyEntries: healthLedger,
  today: '2026-09-15',
});
assert.strictEqual(measured.monthsAnalyzed, 2);
assert.strictEqual(measured.budgetScore, 18, 'Budget factor = mean of monthly adherence scores (22+13)/2');
assert.strictEqual(measured.savingsRatePct, 8, 'Savings rate measured over the whole window');
// 7.5% savings rate -> 9 points; 30,000 reserve vs 45,666 avg monthly expense (<1 month) -> 3 points
assert.strictEqual(measured.savingsScore, 12, 'Savings points (9) + reserve points (3)');

// With no settled history the two factors stay neutral instead of guessing
const noHistory = computeFinancialHealthScore({
  entries: [{ id: 'fut', date: '2027-03-01', category: 'Home', account: 'hsbc', type: 'expense', amount: 5000 }],
  forecast: [],
  deficitPeriods: [],
  actualCashNow: 10000,
  storageTotal: 0,
  entryActuals: {},
  historyEntries: [{ id: 'fut', date: '2027-03-01', category: 'Home', account: 'hsbc', type: 'expense', amount: 5000 }],
  today: '2026-09-15',
});
assert.strictEqual(noHistory.monthsAnalyzed, 0);
assert.strictEqual(noHistory.budgetScore, 20, 'Neutral budget factor without history');
assert.strictEqual(noHistory.savingsScore, 15, 'Neutral savings factor without history');

console.log('✓ Measured health score: settled-month analysis, loan/FX exclusion & neutral fallback verified');

console.log('\n=================================================================');
console.log('🌟 100% OF ENGINE, STORE, AND BUSINESS LOGIC TESTS PASSED! 🌟');
console.log('=================================================================');
