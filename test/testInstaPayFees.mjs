import assert from 'node:assert/strict';
import { buildInstaPayRefunds, calculateInstaPayFee } from '../src/engine/instapayFees.ts';
import { useBudgetStore, STORAGE_KEYS } from '../src/store/useBudgetStore.ts';
import { upgradeLoadedEntries } from '../src/store/slices/common.ts';
import { loadStorageSync } from '../src/utils/storageAdapter.ts';

const defaults = { rate: 0.001, minimum: 0.5, maximum: 20, currency: 'EGP' };

assert.equal(calculateInstaPayFee(100, defaults), 0.5, 'minimum fee applies to small transfers');
assert.equal(calculateInstaPayFee(1000, defaults), 1, 'percentage applies in the middle of the range');
assert.equal(calculateInstaPayFee(5000, defaults), 5, 'fee uses the transfer amount');
assert.equal(calculateInstaPayFee(30000, defaults), 20, 'maximum fee caps large transfers');
assert.equal(calculateInstaPayFee(123.456, defaults), 0.5, 'minimum wins when the raw fee is below the minimum');
assert.equal(calculateInstaPayFee(1234.56, defaults), 1.23, 'fee rounds to piastres');
assert.equal(calculateInstaPayFee(0, defaults), 0, 'zero transfer has no fee');
assert.equal(calculateInstaPayFee(-10, defaults), 0, 'negative transfer has no fee');
assert.equal(calculateInstaPayFee(Number.NaN, defaults), 0, 'non-finite transfer has no fee');
const rehydratedFeeEntry = upgradeLoadedEntries([{
  id: 'rehydrated-fee', date: '2026-11-10', category: 'Transfer', account: 'hsbc', type: 'expense', amount: 100,
  draws: [{ id: 'fee-draw', date: '2026-11-10', amount: 100, account: 'hsbc', paymentMethod: 'instapay', instapayFeeAmount: 0.5 }],
}]);
assert.equal(rehydratedFeeEntry[0].draws[0].instapayFeeAmount, 0.5, 'single fee-bearing draw survives store hydration');
assert.equal(calculateInstaPayFee(5000, { ...defaults, rate: 0.002, minimum: 2, maximum: 50 }), 10, 'custom rate is applied');
assert.equal(calculateInstaPayFee(500, { ...defaults, rate: 0.002, minimum: 3, maximum: 50 }), 3, 'custom minimum is applied');
assert.equal(calculateInstaPayFee(50000, { ...defaults, rate: 0.002, minimum: 1, maximum: 40 }), 40, 'custom maximum is applied');

const store = useBudgetStore.getState();
assert.deepEqual(store.instapayFeeConfig, defaults, 'new store starts with the default fee rule');
const customConfig = { rate: 0.002, minimum: 1, maximum: 40, currency: 'EGP' };
store.updateInstaPayFeeConfig(customConfig);
assert.deepEqual(useBudgetStore.getState().instapayFeeConfig, customConfig, 'valid config updates store state');
assert.deepEqual(loadStorageSync(STORAGE_KEYS.instapayFeeConfig, null), customConfig, 'config persists under its storage key');
assert.equal(useBudgetStore.getState().undo(), true, 'config edit is undoable');
assert.deepEqual(useBudgetStore.getState().instapayFeeConfig, defaults, 'undo restores the prior config');
assert.equal(useBudgetStore.getState().redo(), true, 'config edit is redoable');
assert.deepEqual(useBudgetStore.getState().instapayFeeConfig, customConfig, 'redo restores the new config');
assert.throws(() => useBudgetStore.getState().updateInstaPayFeeConfig({ ...customConfig, maximum: 0 }), /fee/i, 'invalid config is rejected');

useBudgetStore.getState().updateInstaPayFeeConfig(defaults);
const singleId = useBudgetStore.getState().addEntry({
  date: '2026-11-10', category: 'Single transfer', account: 'hsbc', type: 'expense', amount: 5000,
});
useBudgetStore.getState().recordActual(singleId, 5000, '2026-11-10');
const singleBalanceBefore = useBudgetStore.getState().accounts.hsbc.balance;
const singleResult = useBudgetStore.getState().recordInstaPayDeduction({
  entryId: singleId, principalAmount: 5000, accountKey: 'hsbc', date: '2026-11-10',
});
assert.deepEqual(singleResult, { feeAmount: 5, totalDeducted: 5005 }, 'single payment returns its fee and total bank deduction');
let singleEntry = useBudgetStore.getState().entries.find((entry) => entry.id === singleId);
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, singleBalanceBefore - 5005, 'single payment deducts principal plus fee');
assert.equal(singleEntry.actualAmount, 5000, 'single payment keeps principal actual unchanged');
assert.equal(singleEntry.draws?.[0].amount, 5000, 'single payment draw records principal only');
assert.equal(singleEntry.draws?.[0].instapayFeeAmount, 5, 'single payment fee is stored on its draw');

const partialId = useBudgetStore.getState().addEntry({
  date: '2026-11-10', category: 'Partial transfer', account: 'hsbc', type: 'expense', amount: 12000, keepOngoing: true,
});
const partialBalanceBefore = useBudgetStore.getState().accounts.hsbc.balance;
useBudgetStore.getState().recordActual(partialId, 5000, '2026-11-10');
useBudgetStore.getState().recordInstaPayDeduction({ entryId: partialId, principalAmount: 5000, accountKey: 'hsbc', date: '2026-11-10' });
useBudgetStore.getState().recordActual(partialId, 10000, '2026-11-11');
useBudgetStore.getState().recordInstaPayDeduction({ entryId: partialId, principalAmount: 5000, accountKey: 'hsbc', date: '2026-11-11' });
const partialEntry = useBudgetStore.getState().entries.find((entry) => entry.id === partialId);
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, partialBalanceBefore - 10010, 'each partial transfer is charged its own fee');
assert.equal(partialEntry.actualAmount, 10000, 'partial principal stays at the amount actually paid');
assert.equal(partialEntry.draws.reduce((sum, draw) => sum + draw.amount, 0), 10000, 'draw principal reconciles to actual paid');
assert.equal(partialEntry.draws.reduce((sum, draw) => sum + (draw.instapayFeeAmount || 0), 0), 10, 'draw fees are tracked separately');

const partialRefunds = buildInstaPayRefunds(partialEntry.draws, 4000, 'hsbc');
assert.deepEqual(partialRefunds, [{ accountKey: 'hsbc', principalAmount: 4000, feeAmount: 4 }], 'partial reversal uses the saved draw fee proportion');
const balanceBeforePartialRefund = useBudgetStore.getState().accounts.hsbc.balance;
useBudgetStore.getState().refundInstaPayPayments({ entryId: partialId, refunds: partialRefunds });
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, balanceBeforePartialRefund + 4004, 'refund restores principal and its recorded fee');

const balanceBeforeClear = useBudgetStore.getState().accounts.hsbc.balance;
useBudgetStore.getState().clearActual(singleId, { revertStorage: true });
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, balanceBeforeClear + 5005, 'clearing a fee-bearing payment restores the exact bank deduction');

const balanceBeforeDrawDelete = useBudgetStore.getState().accounts.hsbc.balance;
useBudgetStore.getState().deleteDraw(partialId, 1, { revertStorage: true });
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, balanceBeforeDrawDelete + 5005, 'deleting a full fee-bearing draw restores principal and fee');

const balanceBeforeEntryDelete = useBudgetStore.getState().accounts.hsbc.balance;
useBudgetStore.getState().deleteEntry(partialId, 'single', { revertStorage: true });
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, balanceBeforeEntryDelete + 5005, 'deleting a remaining fee-bearing entry restores its remaining bank deduction');

const editId = useBudgetStore.getState().addEntry({
  date: '2026-11-10', category: 'Edited transfer', account: 'hsbc', type: 'expense', amount: 7000,
});
useBudgetStore.getState().recordActual(editId, 5000, '2026-11-10');
const editStartingBalance = useBudgetStore.getState().accounts.hsbc.balance;
useBudgetStore.getState().recordInstaPayDeduction({ entryId: editId, principalAmount: 5000, accountKey: 'hsbc', date: '2026-11-10' });
useBudgetStore.getState().updateInstaPayFeeConfig({ rate: 0.01, minimum: 10, maximum: 100, currency: 'EGP' });
const oldFeeRule = useBudgetStore.getState().entries.find((entry) => entry.id === editId).draws[0].instapayFeeRule;
assert.deepEqual(oldFeeRule, defaults, 'payment stores the fee rule used at the time');
useBudgetStore.getState().updateDraw(editId, 0, { date: '2026-11-10', amount: 4000, account: 'cib' });
let editedEntry = useBudgetStore.getState().entries.find((entry) => entry.id === editId);
assert.equal(editedEntry.draws[0].instapayFeeAmount, 4, 'edited payment recalculates using its saved historical rule');
assert.equal(editedEntry.draws[0].instapayFeeBaseAmount, 4000, 'edited payment snapshot base follows edited principal');
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, editStartingBalance, 'reducing and moving payment refunds original account principal and fee');
assert.equal(useBudgetStore.getState().accounts.cib.balance, -4004, 'edited account receives the revised principal and fee deduction');
assert.equal(useBudgetStore.getState().undo(), true, 'payment edit is undoable');
assert.equal(useBudgetStore.getState().accounts.hsbc.balance, editStartingBalance - 5005, 'undo restores original InstaPay deduction');
assert.equal(useBudgetStore.getState().accounts.cib.balance, 0, 'undo restores target account balance');
assert.equal(useBudgetStore.getState().redo(), true, 'payment edit is redoable');
assert.equal(useBudgetStore.getState().accounts.cib.balance, -4004, 'redo reapplies revised principal and historical fee');
useBudgetStore.getState().updateEntry(editId, { amount: 8000 });
assert.equal(useBudgetStore.getState().entries.find((entry) => entry.id === editId).draws[0].instapayFeeAmount, 4, 'planned expense edits leave historical fees untouched');

const roundTripMultiId = useBudgetStore.getState().addEntry({
  date: '2026-11-10', category: 'Two payment backup', account: 'hsbc', type: 'expense', amount: 12000, keepOngoing: true,
});
useBudgetStore.getState().recordActual(roundTripMultiId, 5000, '2026-11-10');
useBudgetStore.getState().recordInstaPayDeduction({ entryId: roundTripMultiId, principalAmount: 5000, accountKey: 'hsbc', date: '2026-11-10' });
useBudgetStore.getState().recordActual(roundTripMultiId, 10000, '2026-11-11');
useBudgetStore.getState().recordInstaPayDeduction({ entryId: roundTripMultiId, principalAmount: 5000, accountKey: 'hsbc', date: '2026-11-11' });

const roundTripPayload = JSON.parse(useBudgetStore.getState().exportJSON());
assert.deepEqual(roundTripPayload.data.instapayFeeConfig, { rate: 0.01, minimum: 10, maximum: 100, currency: 'EGP' }, 'JSON export contains the configured fee rule');
assert.equal(roundTripPayload.data.cashEntries.find((entry) => entry.id === editId).draws[0].instapayFeeAmount, 4, 'JSON export contains the saved historical fee');
assert.deepEqual(roundTripPayload.data.cashEntries.find((entry) => entry.id === roundTripMultiId).draws.map((draw) => draw.instapayFeeAmount), [50, 50], 'sync/export payload preserves multiple per-payment fee draws');
useBudgetStore.getState().updateInstaPayFeeConfig(defaults);
assert.equal(useBudgetStore.getState().importJSON(JSON.stringify(roundTripPayload)), true, 'fee-bearing backup imports cleanly');
assert.deepEqual(useBudgetStore.getState().instapayFeeConfig, roundTripPayload.data.instapayFeeConfig, 'JSON import restores custom fee settings');
assert.equal(useBudgetStore.getState().entries.find((entry) => entry.id === editId).draws[0].instapayFeeAmount, 4, 'JSON import preserves saved historical fees');
useBudgetStore.getState().resetData();
assert.deepEqual(useBudgetStore.getState().instapayFeeConfig, defaults, 'reset uses default fee configuration');
assert.equal(useBudgetStore.getState().restoreResetBackup(), true, 'reset backup restores successfully');
assert.deepEqual(useBudgetStore.getState().instapayFeeConfig, roundTripPayload.data.instapayFeeConfig, 'reset restore recovers custom fee configuration');
assert.equal(useBudgetStore.getState().entries.find((entry) => entry.id === editId).draws[0].instapayFeeAmount, 4, 'reset restore recovers historical fee metadata');

console.log('All InstaPay fee calculation tests passed.');
