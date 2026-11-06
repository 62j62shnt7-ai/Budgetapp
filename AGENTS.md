# Budget Control v2 — Agent Guidelines & Architecture

This file provides context and operational rules for AI agents working in this repository to prevent hallucinations, reduce token usage, and ensure error-free code generation.

> **Keep this file true.** The directory map and design-token notes below are load-bearing: agents trust them instead of re-reading the tree. If you add, rename, or delete a module, update this file in the same change.

---

## 1. Project Overview & Tech Stack
* **Framework:** React 19 (`react`, `react-dom`) + TypeScript ~6.0 + Vite 8
* **State Management:** Zustand 5 (`src/store/useBudgetStore.ts`)
* **Styling:** Vanilla CSS, no Tailwind. Two layers, both imported by `src/main.tsx` in this order:
  1. `src/styles/base.css` — **legacy base layer**. Defines the original design tokens and component defaults. Rarely edited.
  2. `src/index.css` — **live theme + override layer**. Loaded last, so it wins the cascade at equal specificity. This is where current design tokens and modern glassmorphism live, and it is where you should normally work.
  Because `src/index.css` re-declares selectors that already exist in `src/styles/base.css`, both files contain `!important` rules. Prefer adding to `src/index.css` and **do not add new `!important`** unless overriding an inline style or a third-party default.
* **Icons:** `lucide-react` (named imports only, so unused icons tree-shake)
* **Linter:** `oxlint` (`npm run lint`)
* **Testing:** `tsx` for engine/store suites, raw Playwright (`playwright` package, no `@playwright/test` runner) for UI

---

## 2. Directory Structure Map
Verified against the repository. `src/` contains 74 `.ts`/`.tsx` files at commit `9ace497`; the map groups components by feature.

```
src/
├── components/               # Feature-based UI components
│   ├── Accounts/             # AccountsView — bank/cash balances, CD maturity
│   ├── Cashflow/             # CashflowView (largest view) + SalaryStructure/Installments/ExpenseMix sections
│   ├── Common/               # Modal, ErrorBoundary, UndoToast (showAppNotice/requestAppConfirm), LedgerFilterBar, DriveReconnectBanner
│   ├── Dashboard/            # DashboardView — net worth, health index, forecast chart
│   ├── Deficits/             # DeficitsView — deficit timeline & remediation
│   ├── Forecast/             # ForecastChart
│   ├── History/              # HistoryView + HistorySummaryTab + HistoryAnalyticsSection
│   ├── Jobs/                 # JobsView — project billing, logged days, payments
│   ├── Layout/               # App shell: Sidebar, Topbar, BottomNav, MobileActionSheet
│   ├── Modals/               # EntryModal, QuickAddModal (CommandPaletteModal), JobModals, DataToolsModal, DriveSyncModal, SyncConflictModal, Loan/Storage/Rate modals, AffectedRecordsModal
│   ├── Rates/                # RatesView — currency & gold rates editor
│   └── Storage/              # StorageView — physical assets & valuables
├── engine/                   # Pure financial math. NO React/JSX/Zustand imports.
│   ├── creditCards.ts        # Card detection, settlement dates, dues aggregation
│   ├── creditDueAlerts.ts    # Account-funding shortfall alerts before due dates
│   ├── currency.ts           # Currency/gold rates, conversion, asset valuation, live fetch
│   ├── dateUtils.ts          # Date parsing, formatting, addMonths, daysBetween, money formatters
│   ├── forecast.ts           # Forecast, deficit detection, spend simulation, actual-amount resolution
│   ├── healthScore.ts        # Financial health score + settled-month analysis + smart insights
│   ├── jobs.ts               # Job invoicing math, job currency formatting
│   ├── migration.ts          # Legacy backup → v2 payload migration (import path)
│   ├── salaryAndInstallments.ts # Salary matrix + installment schedule generation & progress
│   └── tags.ts               # Tag inference
├── hooks/
│   ├── useAppUpdateStatus.ts
│   ├── useForecastCandidates.ts  # Shared salary/installment/credit → forecast candidate pipeline
│   └── useHashRouting.ts         # Hash-based routing (#/cashflow) for back/forward navigation
├── services/
│   ├── googleDriveClient.ts  # Google Drive API client, OAuth PKCE/GIS, folder structure, 401 recovery
│   ├── googleDriveTypes.ts   # Google Drive domain types & telemetry interfaces
│   └── syncEngine.ts         # Unified Sync Engine (single mutex, 4-row OCC, sanity guards, conflict handling)
├── store/
│   ├── slices/               # Domain-specific Zustand slices
│   │   ├── accountsSlice.ts  # Bank balances, credit cards, dues, settlements, transfers
│   │   ├── common.ts         # Shared storage helpers, flags, defaults, snapshot/revert logic
│   │   ├── entriesSlice.ts   # Entries CRUD, draws, actuals, recurring series, salary, installments
│   │   ├── jobsSlice.ts      # ASF, IRQ, part-time jobs, invoicing, payments, settlement
│   │   ├── ratesSlice.ts     # Currencies, gold rates, live fetching, storage valuation
│   │   ├── syncSlice.ts      # Google Drive cloud sync, legacy Gist compatibility, JSON import/export, initStorage
│   │   ├── types.ts          # Slice interface definitions & BudgetStoreState composition
│   │   ├── uiSlice.ts        # Theme, active tab, navigation intents, sidebar state
│   │   └── undoSlice.ts      # Undo/redo stack, runTransaction, snapshot management
│   └── useBudgetStore.ts     # Unified store composition re-exporting slices & auto-sync subscriber
├── types/
│   └── index.ts              # Central type definitions, interfaces, union types
├── styles/
│   └── base.css              # Legacy base stylesheet (design tokens + component defaults)
├── index.css                 # Live theme & override stylesheet
├── App.tsx                   # Shell: tab switch, modal orchestration, sync/rate effects, shortcuts
├── main.tsx                  # Entry point: StrictMode + ErrorBoundary, imports both stylesheets
└── utils/
    ├── affectedRecords.ts    # Linked-record discovery & cascading delete/clear option builders
    ├── appRefresh.ts         # Service-worker cache purge / update refresh
    ├── recurringDetector.ts  # Recurring-series detection, link/unlink
    ├── storageAdapter.ts     # IndexedDB bridge, localStorage fallback, auto-migration & persistent undo/redo
    └── syncPresentation.ts   # Shared sync status labels, pill classes & connection state
public/                       # PWA assets: manifest.webmanifest, sw.js, 404.html, icons
test/                         # See section 4 — wired individually into npm scripts
```

**Persistence keys** are all `budget-control-*`, declared once in `STORAGE_KEYS` (`src/store/slices/common.ts`, re-exported by `useBudgetStore.ts`). The financial key set is duplicated across roughly 8 places (initial load, `captureFinancialSnapshot`, `persistFinancialSnapshot`, `exportJSON`, `importJSON`, `resetData`, `restoreResetBackup`, `undoImport`, `syncedDataKeys`) — adding a financial field means touching all of them.

---

## 3. Core Architectural Rules

### A. Pure Financial Engine (`src/engine/`)
* Any calculation logic (forecasts, deficits, health scores, interest, settlement dates, recurring schedules) must live strictly in `src/engine/`.
* **Zero UI coupling:** engine modules must NEVER import React, JSX, or Zustand store hooks. They must remain pure deterministic functions.
* **Determinism:** engine functions must not read the ambient clock. Pass `today`/`todayString` in as an optional trailing parameter (see `computeFinancialHealthScore` and `analyzeSettledMonths`) rather than calling `new Date()` inside. Network access also does not belong here; `autoFetchLatestRates` in `currency.ts` is the one historical exception.
* **Money rounding:** round to piastres (`Math.round(v * 100) / 100`) at every accumulation step, and never mix whole-EGP rounding with piastre rounding for the same quantity.
* **Credit Settlement Netting in Historical Analysis:** `analyzeSettledMonths` in `healthScore.ts` must only count the uncovered excess delta (`uncoveredMap.get(entry.id)`) for lump credit settlement entries to avoid double-counting card purchases already accounted for in their swipe months.
* Historical health counts recorded actuals and draws in their actual months; scheduled amounts remain plans. Credit statement IDs retain their original cycle when a payment date is overridden.
* Backup import rejects unsupported emergency `storageDump` exports; it accepts valid empty and account-only backups.
* Persistence failures retain recoverable in-memory values, expose an unsaved banner with retry/export, and prevent sync acknowledgement. Without IndexedDB, writes use localStorage and legacy keys are retained.
* Hydration validates financial collections before replacing state and preserves invalid stored sources for recovery. Legacy installment index actuals/dates migrate using the plan start month and frequency.
* Drive updates read the v2 JSON `etag` field and use v2 media PUT with `If-Match`; missing preconditions stop uploads, and HTTP 412 enters conflict handling. Live Drive enforcement remains separate from mocked coverage.
* **Installment Frequency Amortization:** In `salaryAndInstallments.ts`, `monthlyAmount` must divide the installment amount by `frequency` (`Math.round((amount / freq) * 100) / 100`) so multi-month obligations (quarterly, semi-annual) amortize accurately without distorting monthly burn rates.
* When updating calculation logic, verify engine math immediately:
  ```bash
  npm test
  ```

### B. State Management (`src/store/useBudgetStore.ts`)
* All global application state is coordinated via `useBudgetStore`.
* **Subscribe with a selector.** `const { a, b } = useBudgetStore()` subscribes to the *entire* store, so any `set()` re-renders the component. For anything that re-renders often, use the shallow pattern already proven in `DeficitsView.tsx`:
  ```tsx
  const { accounts, entries, runTransaction } = useBudgetStore(
    useShallow((state) => ({ accounts: state.accounts, entries: state.entries, runTransaction: state.runTransaction }))
  );
  ```
* When adding or updating state actions:
  1. Define the action in `src/types/index.ts` first if modifying payload shapes.
  2. Implement state mutations immutably in the appropriate `src/store/slices/` module.
  3. Ensure persistence and migration handling remain backward compatible.
  4. Wrap multi-step mutations in `runTransaction(label, fn)` so undo/redo reverts them atomically.
  5. Persist through `saveStorage`/`persistFinancialSnapshot`. Never call bare `localStorage.setItem` inside an action: an unguarded `QuotaExceededError` escapes the transaction body and is caught by `runTransaction`'s rollback, silently reverting a legitimate edit.
* **`loadStorage` validates fallback shapes** through `validateFallbackShape` in `common.ts`, including financial collection guards. Keep validation current when adding persisted keys; a generic `as T` cast alone does not validate stored data.
* Modals: `Modal` (via `showModal()`) renders in the top layer and hides plain `<dialog open>` elements. Never open two modals simultaneously; queue the follow-up (see `pendingDeductRef` in `CashflowView.tsx`) and open it after the first closes. **Always build new dialogs on `Common/Modal`** — a plain `<dialog open>` is not in the top layer, so any `Modal` opened later paints over it and its buttons become unclickable, no `zIndex` can fix that.

### C. TypeScript & Type Safety
* Never use `any`. Always use explicit interfaces or discriminated unions defined in `src/types/index.ts`.
* `oxlint` is configured only with `react/rules-of-hooks` and `react/only-export-components`, so `no-explicit-any` and `no-unsafe-*` are **not** enforced today. Do not treat a clean lint run as proof of type discipline.
* Run `npx tsc -b` before finalizing changes to guarantee 0 compiler errors.

### D. Styling & UI Conventions
* Current UI (through `9ace497`) uses shared page titles in `Layout/Topbar.tsx`; avoid reintroducing duplicate page headers in individual views. Per-view workspace overrides and compact dashboard spacing live near the end of `src/index.css`. Reuse current tokens such as `--bg-surface`, `--border-subtle`, and `--font-heading` after verifying their definitions.
* Design tokens are split across the two stylesheets: the block in `src/styles/base.css` establishes the base palette, and `src/index.css` adds the live theme tokens plus `data-theme` overrides. Read the token before inventing a value:
  ```bash
  grep -n -- "--accent\b\|--glass-bg\b\|--border-color\b" src/index.css src/styles/base.css
  ```
  Names referenced in older notes (for example `--bg-primary`) may no longer exist — verify before use.
* **Work in `src/index.css`** for new styles; it loads after `src/styles/base.css` and therefore wins at equal specificity.
* Do not introduce arbitrary inline styles or external CSS libraries. The inline styles that survive today are mostly dynamic values (computed gradients, per-row severity colors) — prefer a class if the value is static.
* Make interactive non-button elements keyboard accessible: `role`, `tabIndex={0}`, and an `onKeyDown` handling Enter/Space, matching the existing `history-summary-clickable-row` pattern.

### E. Navigation Intents & Interactive Deep-Linking (`NavigationIntent`)
* Cross-view navigation must use `useBudgetStore.getState().navigateTo(tab, filters)`.
* **Row Targeting & Glow Animation:** Consuming table views (`CashflowView`, `HistoryView`) must:
  - Assign `id="<view>-row-${id}"`, `data-entry-id`, and `data-legacy-id` to the table row (`<tr>`).
  - Attach `.entry-row-targeted` when `highlightedEntryId === entry.id || highlightedEntryId === legacyId`.
  - Smooth-scroll the row to center (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) with double-check fallback.
* **Filter Reset Consistency:** When routing without explicit category or search filters (e.g. from Deficits View), consuming views must reset unspecified filters (`category: 'all'`, `type: 'all'`, `search: ''`) so the target row is rendered within its full ledger context.
* **Interactive Summary Rows:** Make clickable metrics and cards keyboard accessible: include `.history-summary-clickable-row`, `tabIndex={0}`, `role="button"`, and both mouse and keyboard handlers (`onKeyDown` for Enter / Space).

---

## 4. Pre-Flight Verification Commands (Run Before Submitting)

To avoid breaking runtime errors and maintain test parity:
1. **Math & Logic Test:** `npm test`
2. **Type Check:** `npm run typecheck`
3. **Lint Check:** `npm run lint`

`npm test` includes math, migration safety, user JSON, affected records, undo/redo, loan scaling, storage adapter, and sync engine suites.

Additional suites that exist but are **not** part of `npm test` — run them when you touch their area:

| Command | Covers |
| --- | --- |
| `node test/testReviewBrowser.mjs` | Targeted synthetic regressions; requires Vite on localhost:5174 (external requests blocked) |
| `npm run test:ui` | Playwright visual/UI audit against a Vite dev server (spawns its own if port 5173 is free) |
| `npx tsx test/universalAuditRunner.mjs` | Universal domain audit runner against live real-world payload (`test/audit_user_data.json`) |
| `npx tsx test/testCreditSettlementModal.mjs` | Credit settlement modal |
| `node test/test-jobs-playwright.mjs` | Jobs flows via Playwright |
| `npm run score` | `healthReport.mjs` — health-score report |

Notes:
* `npm run build` runs `npm test`, `npm run typecheck`, then `vite build`. CI (`.github/workflows/deploy.yml`) runs `lint` + `build` only, so the Playwright suites are **not** gated.
* `playwright.config.ts` matches `*.spec.*` files and imports `@playwright/test`, which is not installed — `npx playwright test` therefore fails. The browser suites under `test/` are standalone scripts meant to be run with `npx tsx` / `node`, as in the table above.
* Engine/store `.mjs` suites that import TypeScript sources use `tsx`; standalone browser scripts can use `node` as shown above. Plain `node test/verifyMath.mjs` fails to resolve extensionless `.ts` imports.

---

## 5. Token Budgeting & TPM Discipline (Strictly Under 2M TPM)

To prevent API rate-limit errors and token exhaustion:
* **Targeted File Reads:** Never dump entire large source files. Files exceeding 150 lines or 10KB must be queried using `grep` or read in narrow slices using bounded line ranges (`view_range`).
* **Paced Tool Calls:** Do not issue rapid-fire massive tool batches. Keep tool execution batches to at most 2–3 actions per turn.
* **Subagent Restraint:** Do not launch background or subagent processes unless strictly requested by the user. Subagents duplicate prompt context and consume tokens rapidly.
* **Compact Command Output:** Run targeted test files (e.g. `npx tsx test/verifyMath.mjs`) during iteration rather than full verbose audit suites unless performing the final pre-flight check. Avoid unneeded directory or file tree dumps.
* **Incremental Context:** Prefer reading only files directly implicated by the task. Re-use existing directory structure maps from this file instead of re-listing repository folders.


* Salary forecast merging: legacy saved salary schedules (arbitrary IDs) define their own end date. Dated virtual salary IDs represent individual overrides and must not truncate the generated schedule. Archived occurrences prevent regeneration without changing payments or balances.

* Cross-tab hydration persists legacy actual-key migration only when values change. Persistence status listeners fire asynchronously on status transitions, and localStorage fallback deletion removes the durable key.
