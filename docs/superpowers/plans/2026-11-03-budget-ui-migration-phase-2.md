# Budget UI Migration Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Deficits, Cash Flow, and History closer to the approved Sites demo visual system while adapting legacy layouts where the demo provides a clearer experience.

**Architecture:** Reshape presentation markup and add focused styles in the existing live stylesheet. Preserve actual values, calculations, state selectors/actions, filters, navigation, row targeting, and modals; presentation groupings may change and low-priority details may be visually de-emphasized or collapsed when they remain accessible.

**Tech Stack:** Existing React/TypeScript components, Zustand selectors, lucide-react, and vanilla CSS in `src/index.css`; no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-budget-app-ui-migration-design.md`, as updated by the user's instruction that the demo is the visual source of truth and legacy presentation does not need to be retained.

## Global Constraints

- Work only on Deficits, Cash Flow, and History presentation plus `src/index.css`.
- Do not change calculations, financial state, persistence, routes, filter semantics, action destinations, or modal behavior.
- Keep existing data and actions available while restructuring visual hierarchy.
- Support both `data-theme="dark"` and `data-theme="light"`, keyboard access, and responsive layouts.
- Add no dependencies and no new `!important` declarations.

## Review Focus

- Deficit summary shortcuts and account-funding/bridge actions still reach the same records and handlers — inspect their click and keyboard behavior.
- Cash Flow month/range filters, forecast/setup tabs, editable inputs, row targeting, and transaction actions retain their current state transitions — inspect both tabs and filter states.
- History month/category/type/search/tag filters, month-to-transaction navigation, editing, actuals, and row highlighting remain reachable — inspect both tabs and representative rows.
- Empty, warning, and populated data states retain clear meaning and status contrast — inspect audit fixtures and empty state.
- Narrow screens retain access to controls and information — audit 320px, 390px, 768px, and desktop widths.

---

### Task 1: Deficits view

**Files:**
- Modify: `src/components/Deficits/DeficitsView.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes existing deficit calculations, selectors, bridge/transfer callbacks, and navigation intents.
- Produces clearer summary, forecast, overdue, and credit-funding sections using existing live data.

- [x] Map the existing metrics, empty states, forecast checkpoints, overdue actions, and credit-funding actions.
- [x] Reorder or regroup presentation to make forecast status and next actions easy to scan; keep existing actions and information available.
- [x] Add scoped, token-based styles for summary cards, severity, timeline, overdue records, and responsive stacking.
- [x] Compare all existing conditions and event destinations with the edited view; inspect populated and empty states.

### Task 2: Cash Flow view

**Files:**
- Modify: `src/components/Cashflow/CashflowView.tsx`
- Modify: `src/components/Cashflow/SalaryStructureSection.tsx` only if markup changes are needed
- Modify: `src/components/Cashflow/InstallmentsSection.tsx` only if markup changes are needed
- Modify: `src/components/Cashflow/ExpenseMixSection.tsx` only if markup changes are needed
- Modify: `src/index.css`

**Interfaces:**
- Consumes existing forecast pipeline, selectors/actions, filter state, row targeting, and modal sequencing.
- Produces an at-a-glance cash-flow hierarchy with forecast ledger and plan setup still available.

- [x] Map forecast summary, month controls, ledger filters/table, setup tabs, salary/installment sections, and row actions.
- [x] Reshape the view into clearer summary, forecast, and plan-setup groupings; retain all controls and live content.
- [x] Style forecast and setup sections with compact surfaces, clear typography, token-based statuses, and responsive layouts.
- [x] Verify existing filters, month/range selection, transaction actions, row targeting, and tab transitions.

### Task 3: History view

**Files:**
- Modify: `src/components/History/HistoryView.tsx`
- Modify: `src/components/History/HistorySummaryTab.tsx`
- Modify: `src/components/History/HistoryAnalyticsSection.tsx` only if markup changes are needed
- Modify: `src/index.css`

**Interfaces:**
- Consumes existing monthly aggregates, transaction filters, navigation intents, row targeting, and admin/edit actions.
- Produces a clearer split between monthly overview and searchable transaction ledger.

- [x] Map summary metrics, monthly rows, analytics, filters, ledger, and all row/action destinations.
- [x] Recompose summary and transaction presentations for faster scanning while keeping existing data and actions available.
- [x] Style filter controls, monthly summaries, analytics, ledger rows, and responsive behavior with shared tokens.
- [x] Verify month selection opens the same filtered transactions and that row targeting, filters, and edit actions remain available.

### Task 4: Verification and scope review

- [x] Run `npm run typecheck`, `npm run lint`, and `npm run test:ui`.
- [x] Inspect dark and light themes at mobile, tablet, and desktop widths, including populated and empty states.
- [x] Run `git diff --check`; confirm no engine/store/types/routing/persistence/dependency/test changes and preserve existing untracked content.
