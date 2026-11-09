# Budget UI Migration Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Accounts, Storage, Jobs, and Rates into the demo's shared visual system while retaining live financial data and useful controls.

**Architecture:** Add view-specific page hierarchy and focused CSS on top of the shared Phase 1/2 tokens. Existing data, calculations, store actions, navigation, edit flows, and modal callbacks remain the source of behavior.

**Tech Stack:** Existing React/TypeScript components, Zustand, lucide-react, and vanilla CSS in `src/index.css`; no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-budget-app-ui-migration-design.md`, as updated by the user's instruction that the demo is the visual source of truth and legacy presentation need not be retained.

## Global Constraints

- Work only on Accounts, Storage, Jobs, and Rates presentation plus `src/index.css`.
- Keep calculations, financial state, persistence, routes, state actions, and modal behavior unchanged.
- Keep app data and useful actions available while adapting legacy presentation.
- Support dark/light themes, keyboard access, and responsive layouts.
- Add no dependencies and no new `!important` declarations.

## Review Focus

- Account edits, transfers, credit dues, and settlements still reach existing actions — inspect forms and transfer controls.
- Storage valuation and asset edits still use current live rates and callbacks — inspect empty and populated assets.
- Job billing, payment logging, and settlement actions remain intact — inspect representative job cards and empty state.
- Rate refresh/edit controls and currency/gold values remain available — inspect empty and populated rates.
- Each view remains readable and operable at mobile, tablet, and desktop widths in both themes.

---

### Task 1: Accounts view

**Files:**
- Modify: `src/components/Accounts/AccountsView.tsx`
- Modify: `src/index.css`

- [x] Map account summaries, settings, transfer actions, dues, and settlement information.
- [x] Reorganize the page into a clear liquidity overview and account/obligation workspace while retaining all controls.
- [x] Add scoped responsive styles for balances, account cards, transfers, and due states.
- [x] Verify edit, transfer, and settlement entry points and empty states.

### Task 2: Storage view

**Files:**
- Modify: `src/components/Storage/StorageView.tsx`
- Modify: `src/index.css`

- [x] Map asset valuation, currency/gold controls, stored items, summary, and edit/delete actions.
- [x] Recompose valuation and item presentation into a clear reserve overview while keeping current live values.
- [x] Style asset cards, valuation summary, rates, and responsive item layouts.
- [x] Verify existing add/edit/delete actions and valuation paths.

### Task 3: Jobs and Rates views

**Files:**
- Modify: `src/components/Jobs/JobsView.tsx`
- Modify: `src/components/Rates/RatesView.tsx`
- Modify: `src/index.css`

- [x] Map project/job status, invoices, payments, and job actions; map exchange/gold rate displays and editing/refresh controls.
- [x] Add clear page hierarchy and compact, scannable summaries without changing job or rate behavior.
- [x] Style job cards/tables and rates panels with shared tokens and mobile stacking.
- [x] Verify representative job actions and all rate controls remain present.

### Task 4: Verification and scope review

- [x] Run `npm run typecheck`, `npm run lint`, and `npm run test:ui`.
- [x] Inspect dark/light themes, empty/populated views, and mobile/tablet/desktop layouts.
- [x] Run `git diff --check`; confirm no engine/store/types/routing/persistence/dependency/test changes and preserve existing untracked content.
