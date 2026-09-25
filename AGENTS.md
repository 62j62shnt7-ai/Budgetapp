# Budget Control v2 — Agent Guidelines & Architecture

This file provides context and operational rules for AI agents working in this repository to prevent hallucinations, reduce token usage, and ensure error-free code generation.

---

## 1. Project Overview & Tech Stack
* **Framework:** React 19 (`react`, `react-dom`) + TypeScript ~6.0 + Vite 8
* **State Management:** Zustand 5 (`src/store/useBudgetStore.ts`)
* **Styling:** Vanilla CSS (`src/index.css` & `styles.css`) using custom design tokens, modern glassmorphism, responsive grid/flex layouts. No Tailwind.
* **Icons:** `lucide-react`
* **Linter:** `oxlint`
* **Testing & Verification:** `tsx` + Playwright (`test/verifyMath.mjs`, `test/ui-audit.mjs`)

---

## 2. Directory Structure Map
```
src/
├── components/          # Modular feature-based UI components
│   ├── Accounts/        # Bank / cash / asset accounts management
│   ├── Cashflow/        # Cashflow view and summaries
│   ├── Common/          # Reusable UI primitives (Buttons, Badges, Cards, Modals)
│   ├── CreditDues/      # Credit card settlement tracking & scheduling
│   ├── Dashboard/       # Main overview dashboard
│   ├── Deficits/        # Deficit detection and remediation timelines
│   ├── Entries/         # Income and Expense transactions & recurring entries
│   ├── Forecast/        # Day-level cash forecast engine visualizations
│   ├── History/         # Transaction & audit log history
│   ├── Jobs/            # Salary matrix & schedule projections
│   ├── Layout/          # App navigation, sidebar, header, and container shell
│   ├── Modals/          # Dialog modals (Add/Edit Entry, Account, Settings, etc.)
│   ├── Rates/           # Currency exchange rates, gold valuation, throttle cache
│   ├── Settings/        # User configuration, preferences, export/import
│   └── Storage/         # LocalStorage persistence & backup migration logic
├── engine/              # Pure deterministic financial math (NO React dependencies)
│   ├── accounts.ts
│   ├── creditDues.ts
│   ├── currency.ts
│   ├── deficits.ts
│   ├── forecast.ts
│   ├── healthScore.ts
│   ├── jobs.ts
│   ├── recurrence.ts
│   └── simulator.ts
├── store/
│   └── useBudgetStore.ts # Central Zustand store with action dispatchers
├── types/
│   └── index.ts          # Central type definitions, interfaces, and union types
└── utils/                # Helper utilities (date formatting, number parsing, etc.)

test/
├── verifyMath.mjs       # Pure math & engine verification suite (run via `npm test`)
├── ui-audit.mjs         # Playwright-based UI & visual layout audit
└── sample-data.json     # Test fixture data
```

---

## 3. Core Architectural Rules

### A. Pure Financial Engine (`src/engine/`)
* Any calculation logic (forecasts, deficits, health scores, interest, settlement dates, recurring schedules) must live strictly in `src/engine/`.
* **Zero UI coupling:** Engine modules must NEVER import React, JSX, or Zustand store hooks. They must remain pure deterministic functions.
* When updating calculation logic, verify engine math immediately:
  ```bash
  npm test
  ```

### B. State Management (`src/store/useBudgetStore.ts`)
* All global application state is coordinated via `useBudgetStore`.
* When adding or updating state actions:
  1. Define the action in `src/types/index.ts` first if modifying payload shapes.
  2. Implement state mutations immutably in `useBudgetStore.ts`.
  3. Ensure persistence and migration handling remain backward compatible.

### C. TypeScript & Type Safety
* Never use `any`. Always use explicit interfaces or discriminated unions defined in `src/types/index.ts`.
* Run `npx tsc -b` before finalizing changes to guarantee 0 compiler errors.

### D. Styling & UI Conventions
* Use existing design system variables from `src/index.css` (e.g., `--bg-primary`, `--accent`, `--border-color`, glassmorphism utility classes).
* Do not introduce arbitrary inline styles or external CSS libraries.

---

## 4. Pre-Flight Verification Commands (Run Before Submitting)

To avoid breaking runtime errors and maintain test parity:
1. **Math & Logic Test:** `npm test`
2. **Type Check:** `npx tsc -b`
3. **Lint Check:** `npm run lint`
