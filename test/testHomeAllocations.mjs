import assert from 'node:assert/strict';
import { apportionHomeReduction, buildHomeAllocations, getHomePaymentParts, splitHomePayment, projectHomeActuals, getHomePlanAmount, summarizeHomeAllocations, indexHomeFunding } from '../src/engine/homeAllocations.ts';
import { getActiveForecastEntries } from '../src/engine/forecast.ts';
import { DEFAULT_INSTAPAY_FEE_CONFIG } from '../src/engine/instapayFees.ts';
import { analyzeSettledMonths } from '../src/engine/healthScore.ts';
import { useBudgetStore } from '../src/store/useBudgetStore.ts';

const entry = (id, category, amount, extra = {}) => ({
  id, category, amount, type: 'expense', date: '2026-11-01', account: 'none',
  actualAmount: amount, ...extra,
});
const home = entry('home', 'Home', 22409, {
  amount: 15000,
  draws: [
    { date: '2026-11-01', amount: 15200, account: 'none' },
    { date: '2026-11-08', amount: 7209, account: 'hsbc', instapayFeeAmount: 2.5 },
  ],
});
const transportation = entry('transport', 'Transportation', 1700, {
  actualDate: '2026-11-08', paidFromHome: 1700,
});
const course = entry('course', 'Kids course', 1500, {
  draws: [{ date: '2026-11-06', amount: 1500, paidFromHome: 900 }],
});
const bankPayment = entry('bank', 'Other', 100, { account: 'hsbc', paidFromHome: 100 });

const entries = [home, transportation, course, bankPayment];
const payment = { id: 'new', date: '2026-11-08', amount: 1700, tag: 'Kids', account: 'hsbc' };
const split = splitHomePayment(payment, 800, 'hsbc', DEFAULT_INSTAPAY_FEE_CONFIG);
assert.equal(split.length, 2);
assert.deepEqual(split.map(({ account, amount, paidFromHome }) => [account, amount, paidFromHome]), [
  ['hsbc', 900, undefined], ['none', 800, 800],
]);
assert.equal(split[0].instapayFeeAmount, 0.9);
assert.equal(split[0].instapayFeeBaseAmount, 900);
assert.equal(split[1].instapayFeeAmount, undefined);
assert.equal(splitHomePayment(payment, 1700, 'hsbc').length, 1);
const splitExpense = { ...transportation, draws: split };
assert.equal(buildHomeAllocations([home, splitExpense]).get(home.id)[0].total, 800);
const adjustment = buildHomeAllocations(entries).get(home.id)[0];
assert.equal(adjustment.month, '2026-11');
assert.equal(adjustment.total, 2600);
assert.deepEqual(adjustment.payments.map(({ category, amount }) => [category, amount]), [
  ['Kids course', 900], ['Transportation', 1700],
]);
assert.equal(getHomePaymentParts(bankPayment, {}, {}).length, 0);
assert.equal(buildHomeAllocations([home, { ...transportation, actualAmount: 0 }]).get(home.id)[0].total, 0);
assert.equal(buildHomeAllocations([home, transportation], {}, { transport: '2026-12-01' }).get(home.id)[0].total, 0);
assert.equal(buildHomeAllocations([entry('small', 'Home', 200), transportation]).get('small')[0].total, 200);
assert.equal(analyzeSettledMonths({ historyEntries: entries, today: '2026-12-01' })[0].realizedExpense, 23109);
assert.equal(home.draws[1].instapayFeeAmount, 2.5);

const homePlan = { ...home, actualAmount: 12000, draws: [{ date: '2026-11-01', amount: 12000 }] };
const school = entry('school', 'School', 6000, {
  actualAmount: 4500, paidFromHome: 4500, actualDate: '2026-11-12',
});
const spending = { home: 12000, school: 4500 };
const netActuals = projectHomeActuals(spending, [homePlan, school], buildHomeAllocations([homePlan, school], spending));
assert.deepEqual(netActuals, { home: 7500, school: 4500 });
assert.deepEqual(spending, { home: 12000, school: 4500 });
assert.deepEqual(getActiveForecastEntries([homePlan, school], [], [], [], netActuals, '2026-11-15')
  .map(({ id, amount }) => [id, amount]), [['home', 7500], ['school', 1500]]);
const zeroNet = projectHomeActuals(spending, [homePlan, school], buildHomeAllocations([
  homePlan, { ...school, actualAmount: 12000, paidFromHome: 12000 },
]));
assert.equal(getActiveForecastEntries([homePlan], [], [], [], zeroNet, '2026-11-15')[0].amount, 15000);
assert.equal(getHomePlanAmount({ ...homePlan, isClosed: true, amount: 12000, initialAmount: 15000 }), 15000);
const pooled = buildHomeAllocations([
  entry('first-home', 'Home', 3000),
  entry('second-home', 'Home', 2000),
  school,
]);
assert.equal(summarizeHomeAllocations(pooled).get('2026-11').capacity, 5000);
assert.equal(pooled.get('first-home')[0].total, 3000);
assert.equal(pooled.get('second-home')[0].total, 1500);
assert.equal(indexHomeFunding(pooled).entries.get(school.id).get('2026-11').amount, 4500);
assert.deepEqual([...apportionHomeReduction(10, { Food: 20, Bills: 40 })],
  [['Food', 3.33], ['Bills', 6.67]]);

useBudgetStore.setState({
  entries: [home],
  archivedEntries: [{ ...transportation, paidFromHome: undefined }],
  entryActuals: {},
  entryActualDates: {},
});
const currentAdjustment = () => {
  const state = useBudgetStore.getState();
  return buildHomeAllocations(
    [...state.entries, ...state.archivedEntries], state.entryActuals, state.entryActualDates
  ).get(home.id)[0].total;
};
const accounts = useBudgetStore.getState().accounts;
useBudgetStore.getState().updateEntry(transportation.id, { paidFromHome: 1700 });
assert.equal(currentAdjustment(), 1700);
assert.deepEqual(useBudgetStore.getState().accounts, accounts);
useBudgetStore.getState().undo();
assert.equal(currentAdjustment(), 0);
useBudgetStore.getState().redo();
assert.equal(currentAdjustment(), 1700);
const backup = useBudgetStore.getState().exportJSON();
assert.equal(useBudgetStore.getState().importJSON(backup), true);
assert.equal(currentAdjustment(), 1700);
useBudgetStore.getState().clearActual(transportation.id);
assert.equal(currentAdjustment(), 0);
assert.equal(useBudgetStore.getState().archivedEntries.find((row) => row.id === transportation.id).paidFromHome, undefined);
useBudgetStore.setState({
  entries: [{ ...homePlan, draws: undefined, actualDate: '2026-11-01', account: 'hsbc' }],
  archivedEntries: [school],
  entryActuals: { home: 12000 },
  entryActualDates: { home: '2026-11-01' },
});
useBudgetStore.getState().recordActual(home.id, 13000, '2026-11-15');
assert.deepEqual(useBudgetStore.getState().entries[0].draws.map(({ date, amount }) => [date, amount]),
  [['2026-11-01', 12000], ['2026-11-15', 1000]]);
assert.equal(currentAdjustment(), 4500);
console.log('Home payment allocation regressions passed');
