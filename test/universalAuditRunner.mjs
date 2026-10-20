import fs from 'node:fs';

// Setup localStorage shim
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

import { buildInstallmentEntries } from '../src/engine/salaryAndInstallments.ts';
import { calculateForecast, simulateSpend, getDeficitPeriods, getActiveForecastEntries, getEntryActualAmount } from '../src/engine/forecast.ts';
import { buildCreditDueEntries, computeSettlementUncovered } from '../src/engine/creditCards.ts';
import { getCreditDueFundingAlerts } from '../src/engine/creditDueAlerts.ts';
import { computeTotalStorageValue, storageValue } from '../src/engine/currency.ts';
import { calculateJobFinancials } from '../src/engine/jobs.ts';
import { computeFinancialHealthScore, analyzeSettledMonths } from '../src/engine/healthScore.ts';
import { useBudgetStore } from '../src/store/useBudgetStore.ts';

if (!fs.existsSync('test/audit_user_data.json')) {
  console.log('Skipping universal audit runner: test/audit_user_data.json not found.');
  process.exit(0);
}
const raw = fs.readFileSync('test/audit_user_data.json', 'utf8');
const userPayload = JSON.parse(raw);
const d = userPayload.data;
const today = "2026-10-17";

console.log('=== UNIVERSAL DOMAIN AUDIT WITH FULL REAL-WORLD JSON ===');

// -------------------------------------------------------------
// DOMAIN 1: Cash Flow & Rolling Forecast Engine
// -------------------------------------------------------------
console.log('\n--- DOMAIN 1: Cash Flow & Rolling Forecast ---');

const installmentEntries = buildInstallmentEntries(d.installments);
const creditDueEntries = buildCreditDueEntries({
  accounts: d.accountBalances,
  creditDues: d.creditDues || {},
  cashEntries: d.cashEntries,
  archivedEntries: d.archivedEntries,
  entryActuals: d.entryActuals,
  entryActualDates: d.entryActualDates,
  creditSettlementOverrides: d.creditSettlementOverrides,
});

const candidateEntries = getActiveForecastEntries(
  d.cashEntries,
  installmentEntries,
  creditDueEntries,
  d.deletedForecasts || [],
  d.entryActuals,
  today
);

const openingCash = (d.accountBalances.cib.balance || 0) + (d.accountBalances.hsbc.balance || 0);
const forecast12 = calculateForecast(candidateEntries, openingCash, 12, '2026-10');
const dailyDeficits = getDeficitPeriods(candidateEntries, openingCash);

console.log('Total Cash Now:', openingCash);
console.log('Active Candidate Entries count:', candidateEntries.length);
console.log('Forecast 12 Months:');
forecast12.forEach((m) => {
  console.log(`  Month ${m.month}: income=${m.income}, expense=${m.expense}, net=${m.net}, closingBalance=${m.balance}`);
});

console.log('Daily Deficit Periods count:', dailyDeficits.length);
dailyDeficits.forEach((def, i) => {
  console.log(`  Deficit #${i+1}: start=${def.startDate} (amount=${def.startAmount}), lowest=${def.lowestDate} (lowestBalance=${def.lowestBalance}), trigger=${def.initialTrigger}, resolved=${def.isResolved}, daysInDeficit=${def.daysInDeficit}`);
});

// Spend simulation
const simSpendResult = simulateSpend(candidateEntries, openingCash, '2026-10-20', 20000);
console.log('Spend Simulation (20k on 2026-10-20):', simSpendResult);

// -------------------------------------------------------------
// DOMAIN 2: Credit Card & Settlement Facilities
// -------------------------------------------------------------
console.log('\n--- DOMAIN 2: Credit Card & Settlement Facilities ---');
console.log('Built Credit Settlement Entries:');
creditDueEntries.forEach((c) => {
  console.log(`  ${c.id} on ${c.date} (account=${c.account}): amount=${c.amount}, statementAmount=${c.statementAmount}, calculatedAmount=${c.calculatedAmount}, variance=${c.variance}, actualAmount=${c.actualAmount}, isClosed=${c.isClosed}, cardSpendTotal=${c.cardSpendTotal}, cardExpenseCount=${c.cardExpenseCount}`);
});

const alerts = getCreditDueFundingAlerts({
  creditDueEntries,
  accounts: d.accountBalances,
  entryActuals: d.entryActuals,
  today,
  proximityDays: 14,
  candidateEntries
});
console.log('Funding Shortfall Alerts:');
alerts.forEach((a) => {
  console.log(`  Alert: ${a.cardName} (${a.accountName}): status=${a.status}, remainingDue=${a.remainingDue}, shortfall=${a.shortfall}, daysUntilSettlement=${a.daysUntilSettlement}`);
});

// Settlement Uncovered Math
const uncoveredMap = computeSettlementUncovered(
  [...d.cashEntries, ...(d.archivedEntries || []), ...creditDueEntries],
  (e) => getEntryActualAmount(e, d.entryActuals) || Number(e.amount || 0),
  (e) => d.entryActualDates[e.id] || e.actualDate || e.date,
  d.creditSettlementOverrides,
  d.entryActualDates
);
console.log('Settlement Uncovered Map:');
for (const [k, v] of uncoveredMap.entries()) {
  console.log(`  ${k} uncovered = ${v}`);
}

// -------------------------------------------------------------
// DOMAIN 3: Multi-Currency Wealth & Asset Valuation
// -------------------------------------------------------------
console.log('\n--- DOMAIN 3: Multi-Currency Wealth & Asset Valuation ---');
const totalStorage = computeTotalStorageValue(d.storageAssets, d.ratesData);
console.log('Storage Asset Portfolio Total:', totalStorage, 'EGP');
d.storageAssets.forEach((a) => {
  const val = storageValue(a, d.ratesData);
  console.log(`  ${a.name} (${a.quantity} ${a.unit}): rate=${a.rate}, buyPrice=${a.buyPrice}, EGP Value=${val}`);
});

// -------------------------------------------------------------
// DOMAIN 4: Project Billing & Freelance Tracking
// -------------------------------------------------------------
console.log('\n--- DOMAIN 4: Project Billing & Freelance Tracking ---');
d.partTimeJobs.forEach((job) => {
  const fin = calculateJobFinancials(job, d.ratesData);
  console.log(`  Job "${job.title}" (${job.client}): totalInvoice=${fin.totalInvoice} ${fin.currency} (${fin.totalInvoiceEgp} EGP), totalPaid=${fin.totalPaid} ${fin.currency} (${fin.totalPaidEgp} EGP), remaining=${fin.remainingBalance} ${fin.currency}, status=${fin.computedStatus}`);
});

// -------------------------------------------------------------
// DOMAIN 5: Historical Auditing & Health Index
// -------------------------------------------------------------
console.log('\n--- DOMAIN 5: Historical Auditing & Health Index ---');
const settled = analyzeSettledMonths({
  historyEntries: d.cashEntries,
  archivedEntries: d.archivedEntries,
  entryActuals: d.entryActuals,
  entryActualDates: d.entryActualDates,
  creditSettlementOverrides: d.creditSettlementOverrides,
  today,
  maxMonths: 6,
});
console.log('Settled Months Analyzed:', settled.length);
settled.forEach((s) => {
  console.log(`  Settled Month ${s.month}: plannedExp=${s.plannedExpense}, realizedExp=${s.realizedExpense}, realizedInc=${s.realizedIncome}, savingsRate=${s.savingsRate}, adherenceScore=${s.adherenceScore}`);
});

const healthScore = computeFinancialHealthScore({
  entries: candidateEntries,
  historyEntries: d.cashEntries,
  archivedEntries: d.archivedEntries,
  forecast: forecast12,
  deficitPeriods: dailyDeficits,
  actualCashNow: openingCash,
  storageTotal: totalStorage,
  entryActuals: d.entryActuals,
  entryActualDates: d.entryActualDates,
  creditSettlementOverrides: d.creditSettlementOverrides,
  today,
});
console.log('Health Score Result:', {
  score: healthScore.score,
  grade: healthScore.grade,
  label: healthScore.label,
  deficitScore: healthScore.deficitScore,
  runwayScore: healthScore.runwayScore,
  budgetScore: healthScore.budgetScore,
  savingsScore: healthScore.savingsScore,
  runwayMonths: healthScore.runwayMonths,
  summaryNote: healthScore.summaryNote,
});

// -------------------------------------------------------------
// DOMAIN 6: State Persistence & Store Transactions
// -------------------------------------------------------------
console.log('\n--- DOMAIN 6: State Persistence & Store Load ---');
useBudgetStore.getState().importJSON(userPayload);
const s = useBudgetStore.getState();
console.log('Imported state verified:');
console.log('  Entries count:', s.entries.length);
console.log('  Archived entries count:', s.archivedEntries.length);
console.log('  Installments count:', s.installments.length);
console.log('  Storage Assets count:', s.storageAssets.length);
console.log('  Part Time Jobs count:', s.partTimeJobs.length);
console.log('  Entry Actuals count:', Object.keys(s.entryActuals).length);
console.log('  Credit Settlement Overrides count:', Object.keys(s.creditSettlementOverrides).length);

console.log('\n--- AUDIT COMPLETE ---');
