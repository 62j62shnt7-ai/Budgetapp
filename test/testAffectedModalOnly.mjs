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
import {
  buildEntryDeleteOptions,
  buildEntryClearOptions,
  buildInstallmentDeleteOptions,
  buildStorageDeleteOptions,
  hasEntryAffectedParties,
  hasEntryClearAffectedParties,
  hasInstallmentAffectedParties,
  hasStorageAffectedParties,
  hasJobAffectedParties,
  hasJobPaymentAffectedParties,
} from '../src/utils/affectedRecords.ts';
import {
  calculateInstallmentProgress,
  buildInstallmentEntries,
} from '../src/engine/salaryAndInstallments.ts';

console.log('===============================================================');
console.log('🧪 RUNNING DEDICATED TEST SUITE: AFFECTED RECORDS MODAL LOGIC');
console.log('===============================================================\n');

// -------------------------------------------------------------
// SCENARIO 1: Standalone Simple Entry
// -------------------------------------------------------------
console.log('▶ Test Scenario 1: Standalone Single Entry');
const standaloneEntry = {
  id: 'e-standalone',
  date: '2026-10-01',
  category: 'Groceries',
  amount: 1200,
  type: 'expense',
  account: 'hsbc',
};

const standaloneRes = buildEntryDeleteOptions(standaloneEntry, {
  installments: [],
  storageAssets: [],
  partTimeJobs: [],
  asfJobs: [],
  irqJobs: [],
});

assert.strictEqual(standaloneRes.options.length, 1, 'Should have exactly 1 option (Cashflow)');
assert.strictEqual(standaloneRes.options[0].id, 'cashflow', 'Primary option is cashflow');
assert.strictEqual(standaloneRes.options[0].required, true, 'Cashflow option is marked required');
assert.strictEqual(standaloneRes.options[0].defaultChecked, true, 'Cashflow option is default checked');
assert.ok(standaloneRes.amountFormatted.includes('1,200'), 'Amount formatted includes 1,200');
console.log('  ✓ Standalone entry produces minimal, uncluttered single option\n');

// -------------------------------------------------------------
// SCENARIO 2: Recurring Series Entry
// -------------------------------------------------------------
console.log('▶ Test Scenario 2: Recurring Series Entry');
const recurringEntry = {
  id: 'e-recurring-1',
  date: '2026-10-01',
  category: 'Internet Fiber',
  amount: 650,
  type: 'expense',
  account: 'cib',
  seriesId: 'series-internet',
  isRecurring: true,
};

const recurringRes = buildEntryDeleteOptions(recurringEntry, {
  installments: [],
  storageAssets: [],
  partTimeJobs: [],
  asfJobs: [],
  irqJobs: [],
});

assert.strictEqual(recurringRes.options.length, 2, 'Should have 2 options: cashflow + series scope');
const seriesOpt = recurringRes.options.find((o) => o.id === 'series');
assert.ok(seriesOpt, 'Series scope option is present');
assert.strictEqual(seriesOpt.defaultChecked, false, 'Series scope defaults to false (delete single date unless checked)');
console.log('  ✓ Recurring series correctly exposes series scope toggle\n');

// -------------------------------------------------------------
// SCENARIO 3: Entry Linked to a Loan Repayment
// -------------------------------------------------------------
console.log('▶ Test Scenario 3: Entry Linked to Loan Repayment');
const loanInflowEntry = {
  id: 'e-loan-inflow',
  date: '2026-09-20',
  category: 'Loan Inflow: Dad',
  amount: 50000,
  type: 'income',
  account: 'hsbc',
  loanId: 'inst-dad-loan',
};

const sampleInstallment = {
  id: 'inst-dad-loan',
  name: 'Bridge Loan: Dad',
  amount: 5000,
  totalMonths: 10,
  remainingMonths: 10,
  startMonth: '2026-10',
  account: 'hsbc',
};

const loanEntryRes = buildEntryDeleteOptions(loanInflowEntry, {
  installments: [sampleInstallment],
  storageAssets: [],
  partTimeJobs: [],
  asfJobs: [],
  irqJobs: [],
});

const loanOpt = loanEntryRes.options.find((o) => o.id === 'loan');
assert.ok(loanOpt, 'Linked loan option present');
assert.ok(loanOpt.label.includes('Bridge Loan: Dad'), 'Includes loan title in label');
assert.strictEqual(loanOpt.defaultChecked, true, 'Linked loan deletion default is checked');
console.log('  ✓ Linked loan option identified and properly configured\n');

// -------------------------------------------------------------
// SCENARIO 4: Entry Linked to a Job with Multi-Draw Tranches
// -------------------------------------------------------------
console.log('▶ Test Scenario 4: Entry with Multi-Draw Tranches & Job Linkage');
const jobEntry = {
  id: 'e-job-payment-1',
  date: '2026-09-24',
  category: 'Barakat Consulting',
  amount: 20800,
  type: 'income',
  account: 'hsbc',
  draws: [
    { date: '2026-09-21', amount: 10000, note: 'Tranche 1' },
    { date: '2026-09-24', amount: 10800, note: 'Tranche 2' },
  ],
};

const sampleJob = {
  id: 'job-barakat',
  title: 'Barakat',
  client: 'Jadeela',
  forecastEntryId: 'e-job-payment-1',
  currency: 'EGP',
  type: 'daily_rate',
  dailyRate: 4000,
};

const jobEntryRes = buildEntryDeleteOptions(jobEntry, {
  installments: [],
  storageAssets: [],
  partTimeJobs: [sampleJob],
  asfJobs: [],
  irqJobs: [],
});

assert.ok(jobEntryRes.options.some((o) => o.id === 'job'), 'Job option present');
assert.ok(jobEntryRes.options.some((o) => o.id === 'draws'), 'Draws option present');
const drawsOpt = jobEntryRes.options.find((o) => o.id === 'draws');
assert.ok(drawsOpt.label.includes('2'), 'Shows correct count of 2 recorded tranches');
console.log('  ✓ Job and Multi-draw options accurately linked\n');

// -------------------------------------------------------------
// SCENARIO 5: Foreign Currency Entry with Rate Conversion
// -------------------------------------------------------------
console.log('▶ Test Scenario 5: Foreign Currency Entry Formatting');
const foreignEntry = {
  id: 'e-foreign-usd',
  date: '2026-09-15',
  category: 'US Client Wire',
  amount: 103620, // EGP equivalent @ 51.81
  originalAmount: 2000,
  currency: 'USD',
  fxRateAtEntry: 51.81,
  type: 'income',
  account: 'hsbc',
};

const foreignRes = buildEntryDeleteOptions(foreignEntry, {
  installments: [],
  storageAssets: [],
  partTimeJobs: [],
  asfJobs: [],
  irqJobs: [],
});

assert.ok(foreignRes.amountFormatted.includes('$2,000') || foreignRes.amountFormatted.includes('2,000'), 'Includes native currency quantity');
assert.ok(foreignRes.amountFormatted.includes('103,620'), 'Includes EGP converted equivalent');
console.log(`  ✓ Foreign currency formatted properly: "${foreignRes.amountFormatted}"\n`);

// -------------------------------------------------------------
// SCENARIO 6: Installment Deletion Builder Logic
// -------------------------------------------------------------
console.log('▶ Test Scenario 6: Installment Delete Options Builder');
const instToDelete = {
  id: 'inst-car',
  name: 'Car Loan Installment',
  amount: 7500,
  totalMonths: 24,
  remainingMonths: 18,
  startMonth: '2026-01',
  account: 'hsbc',
};

// Case A: Has linked cash entries
const instWithEntriesRes = buildInstallmentDeleteOptions(instToDelete, {
  entries: [
    { id: 'e-car-1', date: '2026-10-01', category: 'Car Loan Installment', amount: 7500, type: 'expense', account: 'hsbc' },
    { id: 'e-other', date: '2026-10-01', category: 'Dinner', amount: 400, type: 'expense', account: 'hsbc' },
  ],
});
assert.strictEqual(instWithEntriesRes.options.length, 2, 'Has installment + linked cashflow option');
assert.strictEqual(instWithEntriesRes.options[0].id, 'installment');
assert.strictEqual(instWithEntriesRes.options[1].id, 'cashflow');
assert.strictEqual(instWithEntriesRes.options[1].defaultChecked, true);

// Case B: Standalone installment with no linked entries
const instWithoutEntriesRes = buildInstallmentDeleteOptions(instToDelete, {
  entries: [{ id: 'e-other', date: '2026-10-01', category: 'Dinner', amount: 400, type: 'expense', account: 'hsbc' }],
});
assert.strictEqual(instWithoutEntriesRes.options.length, 1, 'Has only 1 installment option when no entries match');
console.log('  ✓ Installment delete builder dynamically includes cashflow option only when linked entries exist\n');

// -------------------------------------------------------------
// SCENARIO 7: Storage Asset Deletion Builder Logic
// -------------------------------------------------------------
console.log('▶ Test Scenario 7: Storage Asset Delete Options Builder');
const storageToDelete = {
  id: 'storage-usd-1',
  name: 'HSBC USD Account',
  category: 'Currency',
  quantity: 2900,
  unit: 'USD',
  buyPrice: 51.81,
  currency: 'EGP',
};

const storageWithJobsRes = buildStorageDeleteOptions(storageToDelete, {
  partTimeJobs: [
    { id: 'j-1', title: 'Consulting', client: 'Acme', forecastDestination: 'storage:existing-storage-usd-1', type: 'daily_rate', currency: 'USD' },
  ],
  asfJobs: [],
  irqJobs: [],
});

assert.strictEqual(storageWithJobsRes.options.length, 2, 'Has storage + linked jobs destination option');
assert.strictEqual(storageWithJobsRes.options[0].id, 'storage');
assert.strictEqual(storageWithJobsRes.options[1].id, 'jobs');
console.log('  ✓ Storage asset delete builder accurately links connected job destinations\n');

// -------------------------------------------------------------
// SCENARIO 8: End-to-End Store Execution with Modal Selections
// -------------------------------------------------------------
console.log('▶ Test Scenario 8: Store Execution with Modal Option Selections');

// Setup clean store state
useBudgetStore.setState({
  installments: [
    { id: 'inst-loan-1', name: 'Home Renovation Loan', amount: 10000, totalMonths: 12, remainingMonths: 6, startMonth: '2026-05' },
  ],
  entries: [
    // Linked loan entries
    { id: 'e-loan-inflow', date: '2026-05-01', category: 'Home Renovation Inflow', amount: 60000, type: 'income', account: 'hsbc', loanId: 'inst-loan-1' },
    { id: 'e-loan-repay-1', date: '2026-10-01', category: 'Home Renovation Loan', amount: 10000, type: 'expense', account: 'hsbc', loanId: 'inst-loan-1' },
    { id: 'e-loan-repay-2', date: '2026-11-01', category: 'Home Renovation Loan', amount: 10000, type: 'expense', account: 'hsbc', loanId: 'inst-loan-1' },
    // Recurring series entries
    { id: 'e-sub-1', date: '2026-10-01', category: 'Cloud Server', amount: 300, type: 'expense', account: 'cib', seriesId: 'series-cloud' },
    { id: 'e-sub-2', date: '2026-11-01', category: 'Cloud Server', amount: 300, type: 'expense', account: 'cib', seriesId: 'series-cloud' },
    { id: 'e-sub-3', date: '2026-12-01', category: 'Cloud Server', amount: 300, type: 'expense', account: 'cib', seriesId: 'series-cloud' },
    // Regular entry
    { id: 'e-unrelated', date: '2026-10-15', category: 'Books', amount: 150, type: 'expense', account: 'cib' },
  ],
  archivedEntries: [],
  deletedForecasts: [],
  entryActuals: {},
  entryActualDates: {},
});

// Case 8A: Deleting Recurring Entry with seriesMode = 'single' (series checkbox unchecked)
useBudgetStore.getState().deleteEntry('e-sub-2', 'single');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === 'e-sub-1'), true, 'Prior series entry preserved');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === 'e-sub-2'), false, 'Target single entry deleted');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === 'e-sub-3'), true, 'Future series entry preserved');
console.log('  ✓ Modal Selection: Single series deletion verified');

// Case 8B: Deleting Recurring Entry with seriesMode = 'future' (series checkbox checked)
useBudgetStore.getState().deleteEntry('e-sub-1', 'future');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === 'e-sub-1'), false, 'Target entry deleted');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === 'e-sub-3'), false, 'Future series entries deleted');
console.log('  ✓ Modal Selection: Future series deletion cascade verified');

// Case 8C: Deleting Inflow Entry with deleteLinkedLoan = true (loan checkbox checked)
useBudgetStore.getState().deleteEntry('e-loan-inflow', 'single', { deleteLinkedLoan: true });
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === 'e-loan-inflow'), false, 'Inflow entry deleted');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.loanId === 'inst-loan-1'), false, 'All linked loan repayment entries removed');
assert.strictEqual(useBudgetStore.getState().installments.some((i) => i.id === 'inst-loan-1'), false, 'Installment record deleted');
assert.strictEqual(useBudgetStore.getState().entries.some((e) => e.id === 'e-unrelated'), true, 'Unrelated book entry preserved');
console.log('  ✓ Modal Selection: Linked loan cascading deletion verified\n');

// -------------------------------------------------------------
// SCENARIO 9: Installment Deletion with Selective Cashflow Cascade
// -------------------------------------------------------------
console.log('▶ Test Scenario 9: Installment Deletion (Selective Cashflow Cascade)');

useBudgetStore.setState({
  installments: [
    { id: 'inst-gym', name: 'Gym Annual Membership', amount: 1500, totalMonths: 12, remainingMonths: 6, startMonth: '2026-01' },
  ],
  entries: [
    { id: 'e-gym-1', date: '2026-10-01', category: 'Gym Annual Membership', amount: 1500, type: 'expense', account: 'cib', loanId: 'inst-gym' },
    { id: 'e-gym-2', date: '2026-11-01', category: 'Gym Annual Membership', amount: 1500, type: 'expense', account: 'cib', loanId: 'inst-gym' },
    { id: 'e-food', date: '2026-10-01', category: 'Dinner', amount: 400, type: 'expense', account: 'cib' },
  ],
  archivedEntries: [],
});

// Delete installment with deleteCashEntries = false (user unchecked cashflow in modal)
useBudgetStore.getState().deleteInstallment('inst-gym', { deleteCashEntries: false });
assert.strictEqual(useBudgetStore.getState().installments.length, 0, 'Installment tracker record deleted');
assert.strictEqual(useBudgetStore.getState().entries.length, 3, 'All 3 cash entries preserved when unchecked');

// Reset and delete with deleteCashEntries = true (user checked cashflow in modal)
useBudgetStore.setState({
  installments: [
    { id: 'inst-gym', name: 'Gym Annual Membership', amount: 1500, totalMonths: 12, remainingMonths: 6, startMonth: '2026-01' },
  ],
  entries: [
    { id: 'e-gym-1', date: '2026-10-01', category: 'Gym Annual Membership', amount: 1500, type: 'expense', account: 'cib', loanId: 'inst-gym' },
    { id: 'e-gym-2', date: '2026-11-01', category: 'Gym Annual Membership', amount: 1500, type: 'expense', account: 'cib', loanId: 'inst-gym' },
    { id: 'e-food', date: '2026-10-01', category: 'Dinner', amount: 400, type: 'expense', account: 'cib' },
  ],
  archivedEntries: [],
});
useBudgetStore.getState().deleteInstallment('inst-gym', { deleteCashEntries: true });
assert.strictEqual(useBudgetStore.getState().installments.length, 0, 'Installment deleted');
assert.strictEqual(useBudgetStore.getState().entries.length, 1, 'Linked entries deleted, Dinner entry preserved');
assert.strictEqual(useBudgetStore.getState().entries[0].id, 'e-food');
console.log('  ✓ Modal Selection: Installment cashflow cascade toggle verified\n');

// -------------------------------------------------------------
// SCENARIO 10: Job Deletion with Linked Cash Entries Cascade
// -------------------------------------------------------------
console.log('▶ Test Scenario 10: Job Deletion (Selective Cash Entries Cascade)');

useBudgetStore.setState({
  partTimeJobs: [
    {
      id: 'job-freelance',
      title: 'App Design',
      client: 'StartupX',
      forecastEntryId: 'e-job-forecast-1',
      payments: [{ id: 'p-1', date: '2026-09-01', amount: 5000, entryId: 'e-job-forecast-1' }],
      currency: 'USD',
      type: 'lumpsum',
      lumpSumAmount: 10000,
    },
  ],
  entries: [
    { id: 'e-job-forecast-1', date: '2026-09-01', category: 'App Design', amount: 50000, type: 'income', account: 'hsbc' },
    { id: 'e-independent', date: '2026-09-01', category: 'Salary', amount: 20000, type: 'income', account: 'hsbc' },
  ],
  archivedEntries: [],
});

// Delete job with deleteCashEntries = true
useBudgetStore.getState().deleteJob('partTime', 'job-freelance', { deleteCashEntries: true });
assert.strictEqual(useBudgetStore.getState().partTimeJobs.length, 0, 'Job deleted from tracker');
assert.strictEqual(useBudgetStore.getState().entries.length, 1, 'Linked forecast entry deleted');
assert.strictEqual(useBudgetStore.getState().entries[0].id, 'e-independent', 'Independent salary preserved');
console.log('  ✓ Modal Selection: Job cash entries deletion cascade verified\n');

// -------------------------------------------------------------
// SCENARIO 11: Job Payment Deletion with Cashflow Sync & Storage Reversal
// -------------------------------------------------------------
console.log('▶ Test Scenario 11: Job Payment Deletion (Sync Cashflow + Revert Storage)');

useBudgetStore.setState({
  storageAssets: [
    { id: 'storage-usd', name: 'HSBC USD Account', category: 'Currency', quantity: 3000, unit: 'USD', buyPrice: 50, rate: 50, currency: 'EGP' },
  ],
  partTimeJobs: [
    {
      id: 'job-dev',
      title: 'Backend API',
      client: 'FinTech',
      currency: 'USD',
      type: 'lumpsum',
      lumpSumAmount: 2000,
      payments: [
        {
          id: 'pay-dev-1',
          date: '2026-09-20',
          amount: 1000, // 1000 USD
          currency: 'USD',
          egpAmount: 50000,
          entryId: 'e-dev-forecast',
          settlementAccount: 'HSBC USD Account',
        },
      ],
    },
  ],
  entries: [
    {
      id: 'e-dev-forecast',
      date: '2026-09-20',
      category: 'Backend API',
      amount: 100000,
      type: 'income',
      account: 'HSBC USD Account',
      actualAmount: 50000,
      draws: [{ id: 'pay-dev-1', date: '2026-09-20', amount: 50000, account: 'HSBC USD Account' }],
    },
  ],
  rates: { USD: 50 },
});

// Delete payment with syncCashflow = true & revertStorage = true
useBudgetStore.getState().deleteJobPayment('partTime', 'job-dev', 'pay-dev-1', {
  syncCashflow: true,
  revertStorage: true,
});

const updatedJob = useBudgetStore.getState().partTimeJobs.find((j) => j.id === 'job-dev');
assert.strictEqual(updatedJob.payments.length, 0, 'Payment removed from job');

const updatedStorage = useBudgetStore.getState().storageAssets.find((a) => a.id === 'storage-usd');
assert.strictEqual(updatedStorage.quantity, 2000, '1000 USD reverted from storage (3000 -> 2000 USD)');

const updatedForecast = useBudgetStore.getState().entries.find((e) => e.id === 'e-dev-forecast');
assert.strictEqual(updatedForecast.draws.length, 0, 'Tranche draw removed from linked forecast entry');
assert.strictEqual(updatedForecast.actualAmount, undefined, 'Actual amount cleared on forecast entry');
console.log('  ✓ Modal Selection: Job payment multi-entity sync & reversal verified\n');

// -------------------------------------------------------------
// SCENARIO 12: Multi-Option Modal State Selection Logic
// -------------------------------------------------------------
console.log('▶ Test Scenario 12: Selection State Helper Verification');

const testOptions = [
  { id: 'opt-required', label: 'Primary Record', required: true, defaultChecked: true },
  { id: 'opt-recommended', label: 'Linked Loan', defaultChecked: true },
  { id: 'opt-optional', label: 'Series Scope', defaultChecked: false },
];

// Initial selection simulation
const initialSelection = {};
testOptions.forEach((o) => {
  initialSelection[o.id] = o.required ? true : o.defaultChecked !== false;
});
assert.strictEqual(initialSelection['opt-required'], true, 'Required option initialized to true');
assert.strictEqual(initialSelection['opt-recommended'], true, 'Recommended option initialized to true');
assert.strictEqual(initialSelection['opt-optional'], false, 'Optional series initialized to false');

// Select All action
const selectAllState = {};
testOptions.forEach((o) => { selectAllState[o.id] = true; });
assert.strictEqual(Object.values(selectAllState).every(Boolean), true, 'All options selected');

// Deselect Non-Required action
const clearNonRequiredState = {};
testOptions.forEach((o) => { clearNonRequiredState[o.id] = Boolean(o.required); });
assert.strictEqual(clearNonRequiredState['opt-required'], true, 'Required option stays checked');
assert.strictEqual(clearNonRequiredState['opt-recommended'], false, 'Non-required option cleared');
assert.strictEqual(clearNonRequiredState['opt-optional'], false, 'Non-required option cleared');
console.log('  ✓ Modal Selection: "Select all" and "Clear non-required" state transitions verified\n');

// -------------------------------------------------------------
// SCENARIO 13: Single Installment Occurrence Deletion (Recalculates Top Totals)
// -------------------------------------------------------------
console.log('▶ Test Scenario 13: Installment Occurrence Deletion & Top Totals Recalculation');

const testInst = {
  id: 'inst-phone-1',
  name: 'iPhone 16 Pro',
  amount: 5000,
  totalMonths: 12,
  remainingMonths: 12,
  startMonth: '2026-10',
  frequency: 1,
  day: 10,
  account: 'cib',
};

const generatedEntries = buildInstallmentEntries([testInst]);
assert.strictEqual(generatedEntries.length, 12, '12 installment candidate entries generated');
const targetOccurrence = generatedEntries[0]; // 'installment-inst-phone-1-2026-10'

// Test modal builder options for this installment occurrence
const occurrenceModalData = buildEntryDeleteOptions(targetOccurrence, {
  installments: [testInst],
  storageAssets: [],
  partTimeJobs: [],
  asfJobs: [],
  irqJobs: [],
});

assert.ok(occurrenceModalData.options.some((o) => o.id === 'cashflow'), 'Has single occurrence dismiss option');
assert.ok(occurrenceModalData.options.some((o) => o.id === 'installment_plan'), 'Has full installment plan delete option');
const dismissOption = occurrenceModalData.options.find((o) => o.id === 'cashflow');
const fullPlanOption = occurrenceModalData.options.find((o) => o.id === 'installment_plan');
assert.strictEqual(dismissOption.defaultChecked, true, 'Dismiss single occurrence is default checked');
assert.strictEqual(fullPlanOption.defaultChecked, false, 'Delete full plan is unchecked by default');

// Setup store
useBudgetStore.setState({
  installments: [testInst],
  entries: [],
  archivedEntries: [],
  deletedForecasts: [],
  entryActuals: {},
});

// Initial progress check: 12 remaining, 0 paid, 0 dismissed, outstanding 60,000 EGP
const initialProgress = calculateInstallmentProgress(testInst, {}, []);
assert.strictEqual(initialProgress.remaining, 12);
assert.strictEqual(initialProgress.dismissed, 0);
assert.strictEqual(initialProgress.outstandingAmount, 60000);
assert.strictEqual(initialProgress.monthlyAmount, 5000);

// Delete/Dismiss single occurrence via deleteEntry
useBudgetStore.getState().deleteEntry(targetOccurrence.id, 'single');
assert.ok(useBudgetStore.getState().deletedForecasts.includes(targetOccurrence.id), 'Occurrence ID tracked in deletedForecasts');

// Recalculate progress with updated deletedForecasts
const updatedProgress = calculateInstallmentProgress(
  useBudgetStore.getState().installments[0],
  useBudgetStore.getState().entryActuals,
  useBudgetStore.getState().deletedForecasts
);

assert.strictEqual(updatedProgress.remaining, 11, 'Remaining count reduced from 12 to 11');
assert.strictEqual(updatedProgress.dismissed, 1, 'Dismissed count increased to 1');
assert.strictEqual(updatedProgress.outstandingAmount, 55000, 'Outstanding total reduced by 5,000 EGP (60,000 -> 55,000)');
assert.strictEqual(updatedProgress.monthlyAmount, 5000, 'Monthly commitment remains active while remaining > 0');
console.log('  ✓ Deleting an installment occurrence immediately updates top totals (remaining count & outstanding balance)\n');

// -------------------------------------------------------------
// SCENARIO 14: Full Installment Plan Deletion Cascade
// -------------------------------------------------------------
console.log('▶ Test Scenario 14: Full Installment Plan Deletion Cascade');

// Delete entire installment plan
useBudgetStore.getState().deleteEntry(targetOccurrence.id, 'single', { deleteInstallmentPlan: true });
assert.strictEqual(useBudgetStore.getState().installments.length, 0, 'Installment plan removed from store');
console.log('  ✓ Choosing full installment plan deletion cleanly purges installment from store\n');

// -------------------------------------------------------------
// SCENARIO 15: Dot Indicators & Linking Verification
// -------------------------------------------------------------
console.log('▶ Test Scenario 15: Dot Indicators & Robust Entity Linking');

// 1. Standalone entry has NO dot
const plainEntry = { id: 'plain-1', date: '2026-10-01', amount: 100, category: 'Coffee', type: 'expense', account: 'cib' };
assert.strictEqual(hasEntryAffectedParties(plainEntry, { installments: [], storageAssets: [], partTimeJobs: [], asfJobs: [], irqJobs: [] }), false, 'Plain entry has no affected dot');

// 2. Entry with recurring series HAS dot
const recurringEntryWithDot = { id: 'rec-1', date: '2026-10-01', amount: 500, category: 'Internet', type: 'expense', account: 'cib', seriesId: 'series-net' };
assert.strictEqual(hasEntryAffectedParties(recurringEntryWithDot, { installments: [], storageAssets: [], partTimeJobs: [], asfJobs: [], irqJobs: [] }), true, 'Recurring entry has affected dot');

// 3. Entry with linked job (by jobId, category, or payment) HAS dot
const jobLinkedEntry = { id: 'job-entry-1', date: '2026-10-01', amount: 10000, category: 'Barakat', type: 'income', account: 'hsbc' };
const barakatJob = { id: 'job-barakat-1', title: 'Barakat', client: 'Jadeela', currency: 'EGP' };
assert.strictEqual(hasEntryAffectedParties(jobLinkedEntry, { installments: [], storageAssets: [], partTimeJobs: [barakatJob], asfJobs: [], irqJobs: [] }), true, 'Job-linked entry has affected dot');

// 4. Installment with linked entries HAS dot
const gymInstallment = { id: 'inst-gym-dot', name: 'Gym Membership', amount: 1000, totalMonths: 6, remainingMonths: 6, startMonth: '2026-10', account: 'cib' };
const linkedGymEntry = { id: 'e-gym-1', date: '2026-10-01', category: 'Gym Membership', amount: 1000, type: 'expense', account: 'cib' };
assert.strictEqual(hasInstallmentAffectedParties(gymInstallment, { entries: [linkedGymEntry] }), true, 'Installment with linked entries has affected dot');
assert.strictEqual(hasInstallmentAffectedParties(gymInstallment, { entries: [] }), false, 'Installment without linked entries has no affected dot');

// 5. Job with payments HAS dot
const jobWithPayments = { id: 'j-1', title: 'Project A', currency: 'EGP', payments: [{ id: 'p-1', date: '2026-10-01', amount: 5000 }] };
const jobWithoutPayments = { id: 'j-2', title: 'Project B', currency: 'EGP', payments: [] };
assert.strictEqual(hasJobAffectedParties(jobWithPayments), true, 'Job with payments has affected dot');
assert.strictEqual(hasJobAffectedParties(jobWithoutPayments), false, 'Job without payments has no affected dot');

// 6. Storage asset with linked jobs HAS dot
const usdCashAsset = { id: 'storage-usd', name: 'USD Cash', category: 'Cash', quantity: 1000, unit: 'USD', buyPrice: 50, currency: 'USD' };
const jobTargetingUsd = { id: 'j-usd', title: 'US Client', currency: 'USD', forecastDestination: 'storage:existing-storage-usd' };
assert.strictEqual(hasStorageAffectedParties(usdCashAsset, { partTimeJobs: [jobTargetingUsd], asfJobs: [], irqJobs: [] }), true, 'Storage asset with linked job destination has affected dot');
assert.strictEqual(hasStorageAffectedParties(usdCashAsset, { partTimeJobs: [], asfJobs: [], irqJobs: [] }), false, 'Storage asset without linked jobs has no affected dot');

console.log('  ✓ All affected party dot indicator helpers verified for entries, installments, jobs, and storage assets\n');

// -------------------------------------------------------------
// SCENARIO 16: Job Payment Deletion with Unticked Storage & Cloud Conflict Handling
// -------------------------------------------------------------
console.log('▶ Test Scenario 16: Job Payment Deletion with Unticked Storage & Conflict Handling');

// 1. Setup a job with a payment linked to an entry and a storage asset
const testAssetId = 'asset-hsbc-usd-test';
useBudgetStore.setState({
  storageAssets: [
    {
      id: testAssetId,
      name: 'HSBC USD Account',
      category: 'Currency',
      quantity: 5000,
      unit: 'USD',
      currency: 'USD',
      buyPrice: 50,
      rate: 50,
    },
  ],
  partTimeJobs: [
    {
      id: 'job-uncheck-storage-test',
      title: 'Consulting Contract',
      currency: 'USD',
      totalInvoice: 2000,
      forecastEntryId: 'entry-job-test-1',
      status: 'paid',
      payments: [
        {
          id: 'pay-test-1',
          entryId: 'entry-job-test-1',
          date: '2026-10-15',
          amount: 2000,
          currency: 'USD',
          settlementAccount: 'HSBC USD Account',
        },
      ],
    },
  ],
  entries: [
    {
      id: 'entry-job-test-1',
      date: '2026-10-15',
      category: 'Consulting Contract',
      amount: 100000,
      actualAmount: 100000,
      type: 'income',
      account: 'HSBC USD Account',
      draws: [
        {
          id: 'pay-test-1',
          date: '2026-10-15',
          amount: 100000,
          account: 'HSBC USD Account',
        },
      ],
    },
  ],
  entryActuals: { 'entry-job-test-1': 100000 },
  entryActualDates: { 'entry-job-test-1': '2026-10-15' },
});

const initialQty = useBudgetStore.getState().storageAssets.find((a) => a.id === testAssetId)?.quantity;
assert.strictEqual(initialQty, 5000, 'Storage asset starts with 5000 USD');

// User deletes the job payment and explicitly UNTICKS revertStorage
useBudgetStore.getState().deleteJobPayment('partTime', 'job-uncheck-storage-test', 'pay-test-1', {
  syncCashflow: true,
  deleteCashEntry: false,
  revertStorage: false, // User unticked storage
  storageAssetId: testAssetId,
});

const qtyAfterDelete = useBudgetStore.getState().storageAssets.find((a) => a.id === testAssetId)?.quantity;
assert.strictEqual(qtyAfterDelete, 5000, 'Storage quantity MUST remain strictly 5000 USD when unticked!');

// Cashflow entry should have actual cleared since its single draw was removed
const updatedCashEntry = useBudgetStore.getState().entries.find((e) => e.id === 'entry-job-test-1');
assert.strictEqual(updatedCashEntry?.actualAmount, undefined, 'Cashflow entry actualAmount cleared');
assert.strictEqual(updatedCashEntry?.draws?.length, 0, 'Draws cleared');
assert.strictEqual(useBudgetStore.getState().entryActuals['entry-job-test-1'], undefined, 'entryActuals entry deleted');

// Job should be reverted to invoiced with remaining payments empty
const revertedJobCheck = useBudgetStore.getState().partTimeJobs.find((j) => j.id === 'job-uncheck-storage-test');
assert.strictEqual(revertedJobCheck?.payments?.length, 0, 'Job payments empty');
assert.strictEqual(revertedJobCheck?.status, 'invoiced', 'Job status reverted to invoiced');

console.log('  ✓ Unticking revertStorage guarantees zero storage deductions even when entry actual is cleared');

// 2. Verify Cloud Conflict logic does NOT trigger false positive on local mutation
// Mock fetch to simulate remote Gist with older export
const originalFetch = globalThis.fetch;
const oldRemoteExport = JSON.stringify({
  version: '2.1',
  exportedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  data: {
    cashEntries: [],
    partTimeJobs: [],
  },
});

globalThis.fetch = async (url) => {
  if (typeof url === 'string' && url.includes('api.github.com/gists/')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        files: {
          'budget-data.json': { content: oldRemoteExport, truncated: false },
        },
      }),
    };
  }
  return { ok: false, status: 404 };
};

// With local mutations pending, downloading an older Gist backup must NOT flag a conflict
const syncResult = await useBudgetStore.getState().syncFromGist('mock-token', 'mock-gist-id');
assert.strictEqual(useBudgetStore.getState().gistConflict, null, 'No false gistConflict flagged on local mutations');
assert.strictEqual(syncResult, true, 'syncFromGist handles local mutation gracefully without conflict popup');

globalThis.fetch = originalFetch;
console.log('  ✓ Older cloud backup does not trigger false conflict warning on local mutations\n');

// -------------------------------------------------------------
// SCENARIO 17: History Clear Actual Affected Records Dialogue
// -------------------------------------------------------------
console.log('▶ Test Scenario 17: History Clear Actual Options & Affected Indicator');

const testEntryWithJobAndStorage = {
  id: 'e-clear-test',
  date: '2026-10-15',
  category: 'Freelance Design',
  amount: 50000,
  type: 'income',
  currency: 'USD',
  originalAmount: 1000,
  account: 'hsbc_usd',
  draws: [
    { id: 'd-1', date: '2026-10-15', amount: 50000, account: 'hsbc_usd' },
  ],
};

const clearContext = {
  installments: [],
  storageAssets: [{ id: 's-usd', name: 'HSBC USD Holding', unit: 'USD', quantity: 5000 }],
  partTimeJobs: [{
    id: 'j-clear-1',
    title: 'Design Project',
    client: 'Acme Corp',
    currency: 'USD',
    payments: [{ id: 'p-clear-1', entryId: 'e-clear-test', amount: 1000 }],
  }],
  asfJobs: [],
  irqJobs: [],
  entryActuals: { 'e-clear-test': 50000 },
};

const clearOptionsData = buildEntryClearOptions(testEntryWithJobAndStorage, clearContext);
assert.strictEqual(clearOptionsData.options.length, 4, 'Should have 4 options (Revert Actual, Linked Job, Storage Holding, Recorded Tranches)');
assert.strictEqual(clearOptionsData.options[0].id, 'revert_actual', 'Primary option is revert_actual');
assert.strictEqual(clearOptionsData.options[0].required, true, 'Primary option is required');
assert.strictEqual(clearOptionsData.options.some((o) => o.id === 'job'), true, 'Contains linked job option');
assert.strictEqual(clearOptionsData.options.some((o) => o.id === 'storage'), true, 'Contains storage option');
assert.strictEqual(clearOptionsData.options.some((o) => o.id === 'draws'), true, 'Contains draws option');

const hasAffected = hasEntryClearAffectedParties(testEntryWithJobAndStorage, clearContext);
assert.strictEqual(hasAffected, true, 'hasEntryClearAffectedParties returns true when multi-party linkages exist');

console.log('  ✓ buildEntryClearOptions builds complete multi-entity options for clear actual');
console.log('  ✓ hasEntryClearAffectedParties correctly identifies linked job, storage, and tranche records\n');

// -------------------------------------------------------------
// SCENARIO 18: Expense Bank Account Refund on History Clear / Delete
// -------------------------------------------------------------
console.log('▶ Test Scenario 18: Expense Bank Account Refund on Clear & Delete');

const testExpenseEntry = {
  id: 'e-expense-bank-test',
  date: '2026-10-20',
  category: 'Home Repairs',
  amount: 3500,
  type: 'expense',
  account: 'cib',
};

const expenseContext = {
  installments: [],
  storageAssets: [],
  partTimeJobs: [],
  asfJobs: [],
  irqJobs: [],
  accounts: {
    cib: { name: 'CIB Current', balance: 50000, maturityDay: 1 },
    hsbc: { name: 'HSBC Savings', balance: 25000, maturityDay: 1 },
  },
  entryActuals: { 'e-expense-bank-test': 3500 },
};

// Test delete options builder includes bank refund
const expDeleteData = buildEntryDeleteOptions(testExpenseEntry, expenseContext);
const bankDeleteOpt = expDeleteData.options.find((o) => o.id === 'storage');
assert.ok(bankDeleteOpt, 'Delete options include bank refund option');
assert.strictEqual(bankDeleteOpt.label, 'Bank Account Refund: CIB Current', 'Label mentions bank refund');
assert.strictEqual(bankDeleteOpt.badge, 'Bank Refund', 'Badge is Bank Refund');
assert.strictEqual(bankDeleteOpt.defaultChecked, false, 'Selective tickmark defaults to unchecked on delete');

// Test clear options builder includes bank refund
const expClearData = buildEntryClearOptions(testExpenseEntry, expenseContext);
const bankClearOpt = expClearData.options.find((o) => o.id === 'storage');
assert.ok(bankClearOpt, 'Clear options include bank refund option');
assert.strictEqual(bankClearOpt.label, 'Bank Account Refund: CIB Current', 'Label mentions bank refund');
assert.strictEqual(bankClearOpt.badge, 'Bank Refund', 'Badge is Bank Refund');

// Test store execution: clearing actual expense with revertStorage adds back amount to bank
useBudgetStore.setState({
  accounts: {
    cib: { name: 'CIB Current', balance: 50000, maturityDay: 1 },
    hsbc: { name: 'HSBC Savings', balance: 25000, maturityDay: 1 },
  },
  entries: [testExpenseEntry],
  entryActuals: { 'e-expense-bank-test': 3500 },
  entryActualDates: { 'e-expense-bank-test': '2026-10-20' },
});

useBudgetStore.getState().clearActual('e-expense-bank-test', { revertStorage: true });
assert.strictEqual(useBudgetStore.getState().accounts['cib'].balance, 53500, 'Bank balance refunded +3500 EGP upon clearActual with revertStorage: true');

// Test store execution: deleting expense with revertStorage adds back amount to bank
useBudgetStore.setState({
  accounts: {
    cib: { name: 'CIB Current', balance: 50000, maturityDay: 1 },
  },
  entries: [testExpenseEntry],
  entryActuals: { 'e-expense-bank-test': 3500 },
});

useBudgetStore.getState().deleteEntry('e-expense-bank-test', 'single', { revertStorage: true });
assert.strictEqual(useBudgetStore.getState().accounts['cib'].balance, 53500, 'Bank balance refunded +3500 EGP upon deleteEntry with revertStorage: true');

console.log('  ✓ buildEntryDeleteOptions & buildEntryClearOptions generate selective Bank Account Refund option');
console.log('  ✓ clearActual and deleteEntry with revertStorage: true correctly add back amount to bank balance\n');

console.log('===============================================================');
console.log('🌟 100% OF ALL AFFECTED RECORDS MODAL TESTS PASSED! 🌟');
console.log('===============================================================');


