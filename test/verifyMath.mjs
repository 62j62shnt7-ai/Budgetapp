import assert from 'node:assert';
import { calculateCreditSettlementDate, isCreditCardExpense } from '../src/engine/creditCards.ts';
import { buildSalaryEntries } from '../src/engine/salaryAndInstallments.ts';
import { calculateForecast, detectDeficits } from '../src/engine/forecast.ts';
import { computeSpreadPct, computeAssetEgpValue, defaultRates } from '../src/engine/currency.ts';
import { computeFinancialHealthScore } from '../src/engine/healthScore.ts';
import { DateUtils } from '../src/engine/dateUtils.ts';

console.log('Running test suite for Budget Control Financial Engine...\n');

// 1. Credit Card Settlement Rules
const cibEarly = calculateCreditSettlementDate('2026-05-10', 'cib');
assert.strictEqual(cibEarly, '2026-06-15', `CIB early cycle mismatch: got ${cibEarly}`);

const cibLate = calculateCreditSettlementDate('2026-05-20', 'cib');
assert.strictEqual(cibLate, '2026-07-15', `CIB late cycle mismatch: got ${cibLate}`);

const hsbcSpend = calculateCreditSettlementDate('2026-05-10', 'hsbc');
assert.strictEqual(hsbcSpend, '2026-06-30', `HSBC cycle mismatch: got ${hsbcSpend}`);

console.log('✓ Credit card settlement dates verified');

// 2. Credit Card Expense Identification
assert.strictEqual(isCreditCardExpense({ id: '1', date: '2026-05-01', amount: 100, type: 'expense', category: 'General', account: 'cib' }), true);
assert.strictEqual(isCreditCardExpense({ id: '2', date: '2026-05-01', amount: 100, type: 'expense', category: 'General', account: 'hsbc' }), true);
assert.strictEqual(isCreditCardExpense({ id: '3', date: '2026-05-01', amount: 100, type: 'expense', category: 'General', account: 'cash' }), false);
console.log('✓ Credit card identification logic verified');

// 3. Salary Generator
const currentYm = DateUtils.currentYearMonth();
const pattern = [
  { monthOffset: 0, day: 15, amount: 20000 },
  { monthOffset: 0, day: 30, amount: 20000 },
];
const salaryEntries = buildSalaryEntries(pattern, currentYm, 1);
assert.strictEqual(salaryEntries.length >= 2, true);
assert.strictEqual(salaryEntries[0].amount, 20000);
console.log('✓ Salary matrix schedule generation verified');

// 4. Forecast Engine & Deficits
const mockEntries = [
  { id: '1', date: `${currentYm}-05`, amount: 10000, type: 'income', category: 'Salary', account: 'cash' },
  { id: '2', date: `${currentYm}-10`, amount: 15000, type: 'expense', category: 'Rent', account: 'cash' },
];
const forecast = calculateForecast(mockEntries, 1000, 3);
assert.strictEqual(forecast[0].income, 10000);
assert.strictEqual(forecast[0].expense, 15000);
assert.strictEqual(forecast[0].balance, -4000); // 1000 + (10000 - 15000) = -4000

const deficits = detectDeficits(forecast);
assert.strictEqual(deficits.hasDeficit, true);
assert.strictEqual(deficits.worstDeficit, 4000);
console.log('✓ Forecast calculation & deficit detection verified');

// 5. Currency Spread & Valuation
const spread = computeSpreadPct(48.5, 48.4);
assert.strictEqual(spread > 0 && spread < 1, true);

const goldAsset = {
  id: 'g1',
  name: 'Gold 24',
  category: 'Gold',
  quantity: 10,
  unit: 'grams',
  buyPrice: 3500,
  currency: 'EGP'
};
const goldVal = computeAssetEgpValue(goldAsset, defaultRates);
assert.strictEqual(goldVal, 10 * 3580); // 10 grams * 3580 buy rate
console.log('✓ Gold & currency valuation formulas verified');

// 6. Financial Health Score
const health = computeFinancialHealthScore(forecast, deficits, 1000, 35800);
assert.strictEqual(typeof health.score, 'number');
assert.strictEqual(['A', 'B', 'C', 'D', 'F'].includes(health.grade), true);
console.log('✓ Financial health score engine verified');

console.log('\n======================================================');
console.log('🌟 100% OF ENGINE AND BUSINESS LOGIC TESTS PASSED! 🌟');
console.log('======================================================');
