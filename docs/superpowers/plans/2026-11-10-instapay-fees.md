# InstaPay Fee Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional InstaPay checkbox to Budgetapp’s shared Deduct & Save modal, recording each transfer’s fee separately while deducting the exact combined amount from the selected bank account.

**Architecture:** Keep fee calculation pure in `src/engine/`, store the fee and the rule snapshot on the payment draw that incurred it, and use the existing `DeductAccountModal` for every entry point. Persist editable fee settings through the existing Zustand financial snapshot, storage, JSON import/export, undo, and Drive sync paths. Preserve the expense principal and outstanding partial balance; derive bank deduction and fee reporting from principal plus the draw’s fee.

**Tech Stack:** React 19, TypeScript, Zustand 5, Vite, `tsx` engine/store tests, standalone Playwright UI scripts.

**Spec:** Referenced conversation “Automate InstaPay Fees” (ChatGPT conversation `6af33bbb-ccd4-83e9-995b-8128cdd04b04`) and the user’s current request. The plan was prepared against local repository `C:\Users\xear0\Desktop\my repos\Budgetapp`, default branch `main`.

## Global Constraints

- Fee option appears only inside the existing Deduct & Save modal, is unchecked whenever a new deduction prompt opens, and is offered only for expense deductions from an EGP operating account.
- Apply the fee to the amount of the current actual transfer, including each separate partial payment, never to the whole planned expense unless that is the actual transfer amount.
- Proposed default fee rule: 0.10%, minimum EGP 0.50, maximum EGP 20 per transfer; keep all three values configurable. Confirm against the current tariff before shipping and make the settings authoritative for new payments only.
- Round monetary values to piastres (`Math.round(v * 100) / 100`) at each calculation and accumulation step.
- Never add the fee to `CashEntry.amount`, `actualAmount`, `entryActuals`, forecast expense principal, or the remaining obligation. Keep it separately identifiable for reports and audit.
- The bank balance change for a new deduction is principal plus fee; `Don't deduct`, income deposits, credit-card swipes, and foreign-currency storage deductions do not incur InstaPay fees.
- Run every multi-field financial change inside the existing `runTransaction`; preserve undo/redo and offline recovery behavior.
- Old records without fee metadata mean zero historical fee. Changing settings must not recalculate old payments.
- Extend the existing tests and commands. Do not introduce `any`, a new UI framework, a new modal, or direct `localStorage.setItem` in store actions.

## Review Focus

- A partial payment of an expense uses the current tranche as the fee basis and leaves the parent’s outstanding amount based on principal only. Pin in Task 4 with a two-payment test and a Cashflow partial UI test.
- A single payment that is the first payment on an entry, and the first InstaPay payment after earlier non-fee payments, preserve a draw history whose principal totals still reconcile to `actualAmount`. Pin in Tasks 3–4 with store tests.
- Unchecking InstaPay, choosing `Don't deduct`, or selecting an unsupported destination creates no fee and preserves the old bank balance behavior. Pin in Task 3 with modal UI assertions.
- Editing, reducing, deleting, or clearing a fee-bearing draw uses its saved fee snapshot and never applies today’s changed rule to a historical transfer. Pin in Task 5 with store tests.
- Importing older and current backups, undo/redo, reset/restore, and cross-device sync preserve configured rules and fee-bearing draws; malformed config falls back safely. Pin in Task 2 with migration/storage tests.

---

## Repository Map (verified)

- `src/engine/`: pure deterministic financial logic; add `instapayFees.ts` here.
- `src/components/Modals/DeductAccountModal.tsx`: shared account deduction modal, account balance change, and transaction draw account assignment.
- `src/components/Cashflow/CashflowView.tsx`: inline actual input; partial payments call `handleActualSpend`, record the payment, and queue `onDeductPrompt` until other decision modals close.
- `src/components/Modals/EntryModal.tsx`: standard expense creation/edit and the positive or negative actual delta prompt path.
- `src/App.tsx`: shared modal ownership and all current prompt entry points (Cashflow, Deficits, EntryModal).
- `src/types/index.ts`, `src/store/slices/types.ts`, `src/store/useBudgetStore.ts`: core models, slice contracts, and Zustand composition.
- `src/store/slices/common.ts`: `STORAGE_KEYS`, storage validation, financial snapshot capture/persist, and undo snapshot behavior.
- `src/store/slices/entriesSlice.ts`: actual recording, draw mutations, clearing/reverting actuals, and entry deletion.
- `src/store/slices/syncSlice.ts`: storage hydration, JSON export/import, reset/restore, and sync payload handling.
- `src/components/Accounts/AccountsView.tsx`: existing Account Settings panel; use it for fee configuration rather than introducing a separate settings destination.
- `src/components/History/HistorySummaryTab.tsx` and `src/components/History/HistoryView.tsx`: existing history summaries and transaction presentation; add a separately labeled fee total/details without inflating expense-category principal.
- `test/verifyMath.mjs`, `test/testMigrationSafety.mjs`, `test/testUndoRedo.mjs`, `test/testStorageAdapter.mjs`, and `test/testCreditSettlementModal.mjs`: established math, migration, undo, persistence, and UI conventions.

## Approaches

1. **Recommended — fee metadata on each payment draw, shared modal.** Extend `EntryDraw` with principal-linked InstaPay fee data and an immutable rule snapshot. The shared modal attaches it to the draw and subtracts principal plus fee once. This matches existing partial-payment history and avoids counting an additional synthetic bank withdrawal.
2. **Add a separate fee CashEntry for each transfer.** This makes fee reporting direct, but adds linked transaction lifecycle, forecast exclusions, delete/reversal cascades, and risks double-counting the bank withdrawal.
3. **Put an InstaPay checkbox in each expense form.** This misses the user’s preferred decision point, duplicates behavior across Cashflow and normal entry, and chooses payment rail before the actual payment amount/account is known.

Proceed with approach 1. The user selected the shared Deduct & Save modal in the referenced conversation. Keep the fee calculator/config independent from UI and attach fee metadata only when that modal commits an InstaPay payment.

## Implementation Tasks

### Task 1: Map transaction lifecycle and fee contract before coding

**Files:**
- Read: `src/components/Modals/DeductAccountModal.tsx`, `src/components/Cashflow/CashflowView.tsx`, `src/components/Modals/EntryModal.tsx`, `src/components/Deficits/DeficitsView.tsx`, `src/App.tsx`
- Read: `src/store/slices/entriesSlice.ts`, `src/store/slices/common.ts`, `src/store/slices/syncSlice.ts`, `src/types/index.ts`, `src/store/slices/types.ts`, `src/store/useBudgetStore.ts`

- [x] Trace how the selected account, current actual delta, draw IDs, `entryActuals`, undo snapshots, import/export, clear/delete, and account balance rollback connect. Before any code step, write down the exact functions and add any newly discovered lifecycle path to the tasks below.
- [x] Confirm whether a negative `onDeductPrompt` delta currently represents a refund or an edit correction in the UI. Preserve the app’s chosen semantics and make InstaPay fee reversal exact and explicit; do not route a negative number through the ordinary “Deduct” label or silently recalculate it.
- [x] Confirm the fee rule defaults against ALEXBANK’s 2026 Schedule of Charges: 0.10%, minimum EGP 0.50, maximum EGP 20. Keep the app rule editable because individual bank charges may vary.

### Task 2: Add pure fee calculation, config model, and durable config state

**Files:**
- Create: `src/engine/instapayFees.ts`
- Modify: `src/types/index.ts`
- Create: `src/store/slices/instapayFeesSlice.ts`
- Modify: `src/store/slices/types.ts`, `src/store/useBudgetStore.ts`
- Modify: `src/store/slices/common.ts`, `src/store/slices/syncSlice.ts`, `src/App.tsx`
- Create: `test/testInstaPayFees.mjs`
- Modify: `package.json`

**Interfaces:**
- `InstaPayFeeConfig`: `{ rate: number; minimum: number; maximum: number; currency: 'EGP' }` (rate `0.001` means 0.1%).
- `calculateInstaPayFee(transferAmount: number, config: InstaPayFeeConfig): number`: pure calculation, returns a nonnegative piastre-rounded amount; non-finite/nonpositive transfer amounts return zero; reject invalid config at update time.
- Store action `updateInstaPayFeeConfig(config: InstaPayFeeConfig): void`; store state `instapayFeeConfig: InstaPayFeeConfig`.

- [x] Add engine assertions for EGP 100 → EGP 0.50, EGP 1,000 → EGP 1.00, EGP 5,000 → EGP 5.00, and EGP 30,000 → EGP 20.00; include piastre rounding, zero/negative, non-finite input, and alternate configured rate/min/max cases.
- [x] Run `npx tsx test/testInstaPayFees.mjs` against the implemented calculator and config types.
- [x] Implement the pure calculator and validated config update action using existing store slice composition and transaction/persistence conventions.
- [x] Add config controls to the existing Account Settings panel in `src/components/Accounts/AccountsView.tsx` for rate, minimum, maximum; display percent in human units, persist only valid nonnegative values with `maximum >= minimum`, and show the effective rule.
- [x] Add a new namespaced `STORAGE_KEYS.instapayFeeConfig`; include the config in store initialization, validation/defaulting, `BudgetFinancialSnapshot`, `captureFinancialSnapshot`, `persistFinancialSnapshot`, JSON export/import, reset/restore, sync hydration, and the App cross-tab data-key set.
- [x] Treat a missing config as the default rule without rewriting historical draws; invalid persisted config falls back to defaults while preserving unrelated user data.
- [x] Re-run `npx tsx test/testInstaPayFees.mjs`; engine/config validation and default cases pass.
- [x] Add the new engine/store suite to `npm test` in `package.json`.

### Task 3: Add modal option and one atomic payment commit

**Files:**
- Modify: `src/types/index.ts` (`EntryDraw` fee metadata)
- Modify: `src/components/Modals/DeductAccountModal.tsx`
- Modify: `src/store/slices/types.ts` and `src/store/slices/entriesSlice.ts` if a dedicated atomic payment action is needed
- Create or extend: `test/testInstaPayFeesModal.mjs`
- Modify: `package.json` only if adding a dedicated UI test script

**Interfaces:**
- Add optional `EntryDraw.instapayFeeAmount`, `instapayFeeBaseAmount`, and `instapayFeeRule` snapshot fields (rate, minimum, maximum, currency). Existing draws with absent fields remain fee-free.
- If keeping commit logic out of the modal, expose one store action that accepts `{ entryId, principalAmount, accountKey, date, tag, instapayFeeAmount, feeRuleSnapshot }` and atomically updates account balance and associated draw metadata. Follow existing naming and store patterns; do not split the same payment across independent transactions.

- [x] Add UI coverage for a default-unchecked “Include InstaPay transfer fee” checkbox, live fee/total preview, and account balance preview. Verify checkbox is absent for income, foreign storage mode, credit-card expense, and no-deduction path.
- [x] Run the focused UI script against the shared modal workflow.
- [x] In `DeductAccountModal`, show the checkbox only for eligible EGP operating-account expense deductions; reset it to unchecked when `currentDeductKey` changes. Show principal, fee, and total bank deduction clearly.
- [x] On save, reduce the selected account by `principal + fee` once, preserve `actualAmount` and `entryActuals` as principal, and attach fee metadata to the exact draw representing this transfer. Keep updates within one `runTransaction` and preserve the no-fee save path unchanged.
- [x] For the first InstaPay payment after an entry already has older fee-free actuals, retain a principal-only historical draw and append the new fee-bearing draw so draw principal sums still equal the entry actual. Preserve a one-draw fee record for a non-partial expense rather than stripping it as redundant.
- [x] On `Don't deduct`, save the entry/account association as currently implemented but persist no fee metadata and make no balance adjustment.
- [x] Re-run the focused UI script; modal gating, fee preview, selection reset, and saved bank total pass.

### Task 4: Cover Cashflow partial and all shared-modal entry points

**Files:**
- Modify only as needed: `src/components/Cashflow/CashflowView.tsx`, `src/components/Modals/EntryModal.tsx`, `src/components/Deficits/DeficitsView.tsx`, `src/App.tsx`
- Extend: `test/testInstaPayFees.mjs`, `test/testInstaPayFeesModal.mjs`

- [x] Add a store test with two EGP 5,000 payments on one partial expense: each incurs its own configured EGP 5 fee, selected account falls by EGP 10,010 in total, principal actual is EGP 10,000, and remaining balance is calculated from principal only.
- [x] Add a Cashflow UI scenario that enters an actual amount in the inline partial-payment field, opens the shared modal, selects InstaPay, and verifies the preview and post-save values. Principal actual remains fee-free.
- [x] Wire EntryModal and Deficits entry paths to the same shared modal callback without adding duplicate fee controls; retain the existing credit-card exclusion.
- [x] Preserve `pendingDeductRef` ordering when other decision dialogs are open.
- [x] Run the fee store suite and focused UI script; per-payment and Cashflow assertions pass.

### Task 5: Preserve fee accounting through edit, reduction, reversal, delete, and undo

**Files:**
- Modify: `src/store/slices/entriesSlice.ts`, `src/components/Modals/EntryModal.tsx`, `src/components/Modals/DeductAccountModal.tsx`
- Extend: `test/testInstaPayFees.mjs`, `test/testUndoRedo.mjs` or dedicated tests in `test/testInstaPayFees.mjs`

- [x] Add cases for changing the planned expense amount without rewriting saved fee metadata; reducing actual paid amount; clearing/reverting a paid entry; deleting a draw; and undo/redo of a fee-bearing payment.
- [x] When a user adds another actual payment, create a new draw and calculate with current config. When editing an existing fee-bearing draw, preserve its saved rule snapshot and use the established correction semantics; never silently recalculate historical amounts under new settings.
- [x] Ensure reversal/clear/delete restores the selected account using the exact principal plus fee recorded on affected draws. Reversals must not create fee-on-fee entries or orphan fee metadata. If existing editing supports changing the account, refund the old account and apply the revised principal-plus-fee to the new account atomically.
- [x] Preserve draw amounts and fee metadata together through truncation of partial draws, including the final partial draw. Keep `entryActuals` and forecast obligation based on principal only.
- [x] Run focused fee and undo suites; expected: PASS with balances restored exactly and historical fee snapshots unchanged.

### Task 6: Separate fee reporting and verify backups/migrations end to end

**Files:**
- Modify: `src/components/History/HistorySummaryTab.tsx`, `src/components/History/HistoryView.tsx` as needed
- Extend: `test/testInstaPayFees.mjs`, `test/testMigrationSafety.mjs`, `test/testStorageAdapter.mjs`, `test/testUndoRedo.mjs`, `test/testInstaPayFeesModal.mjs`

- [x] Add a clearly labeled InstaPay fee total/detail in History, derived from saved draw fee amounts. Ensure expense category totals remain principal-only and bank balance reflects the inclusive deduction.
- [x] Test legacy v2 JSON with no fee config and no fee fields; import succeeds with default settings and zero historical fees. Test new export/import round-trip with custom config and multiple fee-bearing draws.
- [x] Test reset/restore, undo/redo, local storage hydration, and sync serialization for config and fee-bearing draws. Add malformed-config and malformed-fee-value cases that safely fall back/reject without discarding valid entries.
- [x] Ensure config and historical fee values enter content hash/sync payloads and migration logic preserves fields without recalculation.
- [x] Run `npm test`, `npm run typecheck`, `npm run lint`, and the focused InstaPay modal UI script; all pass. `npm run build` also passes.

## Fee Schedule Reference

ALEXBANK’s 2026 Schedule of Charges lists 0.10%, EGP 0.50 minimum, and EGP 20 maximum for InstaPay. The app treats these as editable settings and saves a rule snapshot with each payment.

- [ALEXBANK Schedule of Charges, Jan 2026](https://www.alexbank.com/document/documents/ALEX/2026/SOC/SOC-EN-Jan-26-Update.pdf)
- [Central Bank of Egypt — Instant Payment Network](https://www.cbe.org.eg/en/payment-systems-and-services/instant-payment-network)
