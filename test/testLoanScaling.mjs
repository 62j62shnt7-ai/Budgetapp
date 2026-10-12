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

import { calculateLoanRepaymentScale, isLoanInflow, findLinkedLoanRepayment } from '../src/engine/forecast.ts';
import { useBudgetStore } from '../src/store/useBudgetStore.ts';

console.log('--- Starting Dedicated Loan Scaling & Draw Finishing Tests ---');

// =========================================================================
// SECTION 1: Pure Engine Math (calculateLoanRepaymentScale)
// =========================================================================

console.log('▶ Test 1: Single repayment scaling down (partial draw)');
{
  const inflowEntry = {
    id: 'loan-inflow-1',
    date: '2026-10-01',
    category: 'Loan Inflow: Bridge Loan',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'loan',
    loanId: 'loan-facility-1',
  };

  const linkedExpense = {
    id: 'loan-repay-1',
    date: '2026-11-01',
    category: 'Loan Repayment: Bridge Loan',
    type: 'expense',
    amount: 120000,
    initialAmount: 120000,
    source: 'loan',
    loanId: 'loan-facility-1',
  };

  // Half drawn (50,000 out of 100,000)
  const result = calculateLoanRepaymentScale(inflowEntry, { type: 'single', target: linkedExpense }, 50000);
  assert.ok(result !== null, 'Scale result should not be null');
  assert.strictEqual(result.scaledAmount, 60000, '50k drawn should scale 120k repayment to 60k (1.2x markup preserved)');
  assert.strictEqual(result.currentAmount, 120000);
  assert.strictEqual(result.isScaleUp, false, 'Should be scale down');
  assert.strictEqual(result.ratio, 0.5);
  console.log('  ✓ Single repayment scaled down proportionally with interest preserved');
}

console.log('▶ Test 2: Installment repayment scaling down (partial draw)');
{
  const inflowEntry = {
    id: 'loan-inflow-inst',
    date: '2026-10-01',
    category: 'Loan Inflow: Partner A',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'loan',
    loanId: 'loan-facility-inst',
  };

  const linkedInstallment = {
    id: 'inst-repay-1',
    name: 'Partner A Repayment',
    amount: 10000, // 10k/mo for 12 months = 120k total
    totalMonths: 12,
    remainingMonths: 12,
    startMonth: '2026-11',
    initialAmount: 10000,
    loanId: 'loan-facility-inst',
  };

  // 40,000 drawn (ratio 0.4, total repayment should be 48,000 -> 4,000/mo)
  const result = calculateLoanRepaymentScale(inflowEntry, { type: 'installment', target: linkedInstallment }, 40000);
  assert.ok(result !== null, 'Scale result should not be null');
  assert.strictEqual(result.scaledAmount, 4000, '40k drawn should scale monthly installment to 4k/mo');
  assert.strictEqual(result.currentAmount, 10000);
  assert.strictEqual(result.months, 12);
  assert.strictEqual(result.isScaleUp, false);
  console.log('  ✓ Installment plan scaled down proportionally to 4,000/mo');
}

console.log('▶ Test 3: Scaling UP (draw exceeds planned facility)');
{
  const inflowEntry = {
    id: 'loan-inflow-up',
    date: '2026-10-01',
    category: 'Loan Inflow: Partner B',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'loan',
    loanId: 'loan-facility-up',
  };

  const linkedExpense = {
    id: 'loan-repay-up',
    date: '2026-11-01',
    category: 'Loan Repayment: Partner B',
    type: 'expense',
    amount: 120000,
    initialAmount: 120000,
    source: 'loan',
    loanId: 'loan-facility-up',
  };

  // 150,000 drawn (1.5 ratio -> 180,000 repayment)
  const result = calculateLoanRepaymentScale(inflowEntry, { type: 'single', target: linkedExpense }, 150000);
  assert.ok(result !== null);
  assert.strictEqual(result.scaledAmount, 180000, '150k drawn should scale 120k repayment to 180k');
  assert.strictEqual(result.isScaleUp, true, 'isScaleUp should be true');
  assert.strictEqual(result.ratio, 1.5);
  console.log('  ✓ Scale up calculation verified (180,000)');
}

console.log('▶ Test 4: Sequential draws idempotency & interest preservation');
{
  const inflowEntry = {
    id: 'loan-seq',
    date: '2026-10-01',
    category: 'Loan Inflow: Equipment Loan',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'loan',
    loanId: 'loan-eq',
  };

  // Target already scaled once to 36,000 (from 120,000 planned when 30,000 was drawn)
  const linkedExpenseScaled = {
    id: 'loan-seq-repay',
    date: '2026-11-01',
    category: 'Loan Repayment: Equipment Loan',
    type: 'expense',
    amount: 36000,
    initialAmount: 120000, // safely preserved initial amount!
    source: 'loan',
    loanId: 'loan-eq',
  };

  // Next tranche brings total drawn to 60,000 (60% of 100,000 facility)
  const result = calculateLoanRepaymentScale(inflowEntry, { type: 'single', target: linkedExpenseScaled }, 60000);
  assert.ok(result !== null);
  assert.strictEqual(result.scaledAmount, 72000, '60k total drawn should scale from base 120k to 72k, NOT from 36k');
  console.log('  ✓ Preserved baseline prevents compound degradation across multiple draws');
}

console.log('▶ Test 5: Facility cancelled / finished with $0 drawn');
{
  const inflowEntry = {
    id: 'loan-zero',
    date: '2026-10-01',
    category: 'Loan Inflow: Unused',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'loan',
    loanId: 'loan-zero-id',
  };

  const linkedExpense = {
    id: 'loan-zero-repay',
    date: '2026-11-01',
    category: 'Loan Repayment: Unused',
    type: 'expense',
    amount: 120000,
    initialAmount: 120000,
    source: 'loan',
    loanId: 'loan-zero-id',
  };

  const result = calculateLoanRepaymentScale(inflowEntry, { type: 'single', target: linkedExpense }, 0);
  assert.ok(result !== null);
  assert.strictEqual(result.scaledAmount, 0, 'Zero drawn scales repayment to 0');
  console.log('  ✓ Zero drawn scales repayment to 0');
}

console.log('▶ Test 6: Exact full draw returns null (no adjustment needed)');
{
  const inflowEntry = {
    id: 'loan-exact',
    date: '2026-10-01',
    category: 'Loan Inflow: Exact',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'loan',
    loanId: 'loan-exact-id',
  };

  const linkedExpense = {
    id: 'loan-exact-repay',
    date: '2026-11-01',
    category: 'Loan Repayment: Exact',
    type: 'expense',
    amount: 120000,
    initialAmount: 120000,
    source: 'loan',
    loanId: 'loan-exact-id',
  };

  const result = calculateLoanRepaymentScale(inflowEntry, { type: 'single', target: linkedExpense }, 100000);
  assert.strictEqual(result, null, 'Exact full draw matching current repayment returns null');
  console.log('  ✓ Exact full draw returns null cleanly');
}

// =========================================================================
// SECTION 2: Store Integration & Finish Flow
// =========================================================================

console.log('▶ Test 7: Store updateEntry with skipLoanScaling and atomic finish');
{
  const store = useBudgetStore.getState();
  store.clearUndoHistory();

  const loanId = 'store-loan-1';
  const inflowId = store.addEntry({
    date: '2026-10-01',
    category: 'Loan Inflow: Test Store Facility',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'loan',
    loanId,
    account: 'cib',
  });

  const repayId = store.addEntry({
    date: '2026-11-01',
    category: 'Loan Repayment: Test Store Facility',
    type: 'expense',
    amount: 120000,
    initialAmount: 120000,
    source: 'loan',
    loanId,
    account: 'cib',
  });

  const stateBefore = useBudgetStore.getState();
  const inflow = stateBefore.entries.find((e) => e.id === inflowId);
  const repay = stateBefore.entries.find((e) => e.id === repayId);
  assert.ok(inflow && repay);
  assert.strictEqual(isLoanInflow(inflow), true);

  const linked = findLinkedLoanRepayment(inflow, stateBefore.entries, stateBefore.installments);
  assert.ok(linked !== null);
  assert.strictEqual(linked.type === 'single' ? linked.target.id : '', repayId);

  // Simulate user drawing 50k and clicking "Finish & Close Facility"
  const actualDrawn = 50000;
  const baseDisbursement = Number(inflow.initialAmount || inflow.amount);

  store.runTransaction('Finish Loan Entry', () => {
    store.updateEntry(
      inflowId,
      {
        isClosed: true,
        keepOngoing: false,
        amount: actualDrawn,
        initialAmount: baseDisbursement,
      },
      'single',
      { skipLoanScaling: true }
    );

    const scaleCalc = calculateLoanRepaymentScale(inflow, linked, actualDrawn);
    assert.ok(scaleCalc !== null);
    assert.strictEqual(scaleCalc.scaledAmount, 60000);

    const baseRep = Number(linked.target.initialAmount || linked.target.amount);
    store.updateEntry(linked.target.id, {
      amount: scaleCalc.scaledAmount,
      initialAmount: baseRep,
    });
  });

  const stateAfter = useBudgetStore.getState();
  const updatedInflow = stateAfter.entries.find((e) => e.id === inflowId);
  const updatedRepay = stateAfter.entries.find((e) => e.id === repayId);

  assert.strictEqual(updatedInflow.isClosed, true, 'Inflow entry should be closed');
  assert.strictEqual(updatedInflow.amount, 50000, 'Inflow amount finalized at 50,000');
  assert.strictEqual(updatedInflow.initialAmount, 100000, 'Original planned facility preserved');
  assert.strictEqual(updatedRepay.amount, 60000, 'Repayment scaled exactly to 60,000 (no double scaling)');
  assert.strictEqual(updatedRepay.initialAmount, 120000, 'Original planned repayment preserved');

  // Test 1-click atomic undo
  store.undo();
  const stateReverted = useBudgetStore.getState();
  const revertedInflow = stateReverted.entries.find((e) => e.id === inflowId);
  const revertedRepay = stateReverted.entries.find((e) => e.id === repayId);

  assert.strictEqual(revertedInflow.isClosed, undefined, 'Reverted inflow should not be closed');
  assert.strictEqual(revertedInflow.amount, 100000, 'Reverted inflow should be 100,000');
  assert.strictEqual(revertedRepay.amount, 120000, 'Reverted repayment should be 120,000');
  console.log('  ✓ Store finish flow executes cleanly with exact scaling and 1-click atomic undo');
}

console.log('▶ Test 8: Store updateInstallment preserves initialAmount cleanly');
{
  const store = useBudgetStore.getState();
  store.addInstallment({
    name: 'Car Loan Installment',
    amount: 5000,
    totalMonths: 10,
    remainingMonths: 10,
    startMonth: '2026-10',
    account: 'cib',
  });

  const createdInst = useBudgetStore.getState().installments.find((i) => i.name === 'Car Loan Installment');
  assert.ok(createdInst, 'Installment should be present');

  // Update installment amount directly
  store.updateInstallment(createdInst.id, { amount: 3500 });
  const inst = useBudgetStore.getState().installments.find((i) => i.id === createdInst.id);
  assert.strictEqual(inst.amount, 3500);
  assert.strictEqual(inst.initialAmount, 5000, 'initialAmount preserved from previous amount');
  console.log('  ✓ updateInstallment preserves initialAmount without prompt or ratio corruption');
}

console.log('▶ Test 9: Flexible loan linking with "bridge loan" source and custom categories');
{
  const bridgeInflow = {
    id: 'bridge-1',
    category: 'Bridge Loan: Dad Support',
    type: 'income',
    amount: 50000,
    source: 'bridge loan',
    account: 'cash',
  };

  assert.strictEqual(isLoanInflow(bridgeInflow), true, 'source "bridge loan" recognized as loan inflow');

  const allEntries = [
    bridgeInflow,
    {
      id: 'bridge-repay-1',
      category: 'Dad Support Repayment',
      type: 'expense',
      amount: 50000,
      source: 'loan repayment',
      account: 'cash',
    },
  ];

  const linked = findLinkedLoanRepayment(bridgeInflow, allEntries, []);
  assert.ok(linked !== null, 'Should find linked repayment despite different prefixes');
  assert.strictEqual(linked.type === 'single' ? linked.target.id : '', 'bridge-repay-1');
  console.log('  ✓ Flexible name and source matching resolves linked loan repayment');
}

console.log('▶ Test 10: Finishing loan facility when user chooses NOT to scale repayment');
{
  const store = useBudgetStore.getState();
  const inflowId = store.addEntry({
    date: '2026-10-01',
    category: 'Loan Inflow: Project Alpha',
    type: 'income',
    amount: 100000,
    initialAmount: 100000,
    source: 'bridge loan',
    loanId: 'proj-alpha',
    account: 'cib',
  });

  const repayId = store.addEntry({
    date: '2026-12-01',
    category: 'Loan Repayment: Project Alpha',
    type: 'expense',
    amount: 120000,
    initialAmount: 120000,
    source: 'loan repayment',
    loanId: 'proj-alpha',
    account: 'cib',
  });

  // User drew 40,000, but in ExactAmountDecisionModal unticked "Scale repayment" (wants to keep original 120k repayment)
  const actualDrawn = 40000;
  const shouldScale = false; // user choice!

  store.runTransaction('Finish Loan Entry (Keep Repayment)', () => {
    store.updateEntry(
      inflowId,
      {
        isClosed: true,
        keepOngoing: false,
        amount: actualDrawn,
        initialAmount: 100000,
      },
      'single',
      { skipLoanScaling: true }
    );

    if (shouldScale) {
      store.updateEntry(repayId, { amount: 48000 });
    }
  });

  const state = useBudgetStore.getState();
  const closedInflow = state.entries.find((e) => e.id === inflowId);
  const untouchedRepay = state.entries.find((e) => e.id === repayId);

  assert.strictEqual(closedInflow.isClosed, true);
  assert.strictEqual(closedInflow.amount, 40000);
  assert.strictEqual(untouchedRepay.amount, 120000, 'Repayment kept at original amount per user decision');
  console.log('  ✓ User choice to keep original repayment is cleanly respected upon finish');
}

console.log('\n===============================================================');
console.log('🌟 100% OF ALL DEDICATED LOAN SCALING TESTS PASSED! 🌟');
console.log('===============================================================\n');
