# 💰 Budget Control v2

> **Precision Personal Liquidity Forecasting, Day-Level Deficit Detection & Multi-Currency Wealth Tracking.**

Budget Control v2 is a local-first, privacy-focused financial management web application built with **React 19**, **TypeScript**, **Zustand**, and **Vite**. It is engineered to give you complete visibility over your future liquidity, day-by-day cash flow balances, loan facilities, credit card settlements, and foreign currency assets.

---

## ✨ Key Features

### 📊 1. Predictive Cash Flow & Day-Level Forecasting
- **Rolling Multi-Month Horizon:** Projects daily and month-end liquid cash balances across all liquid bank accounts.
- **Salary Cycle Matrix:** Configurable 3-month recurring salary distribution patterns with customizable day offsets.
- **Recurring Commitments & Installment Amortization:** Track scheduled installments across flexible frequency intervals (monthly, quarterly, semi-annual, annual). Displays true amortized monthly burn rates alongside lump commitments and outstanding balances.
- **Universal Piastre Precision Standard:** Enforces strict two-decimal precision (`Math.round(v * 100) / 100`) across all bank account balances, transfers, foreign asset sales, and transaction actuals, eliminating integer truncation and float drift.
- **Credit Card Billing Automation:** Faithfully models grace periods, statement closing dates, and settlement due dates for cards (e.g. CIB and HSBC 56-day rollover logic) with pre-settlement funding shortfall alerts.
- **Proactive Deficit Detection:** Flags exact negative-balance spells before they happen, identifying the specific date liquidity drops below zero and when upcoming income will restore it.

### 🧪 2. Interactive Spend Simulator & Deficit Bridging
- **Pre-Purchase Impact Analysis:** Test prospective large purchases against your daily forecast before spending. Immediately visualizes whether a purchase causes a deficit, the lowest projected balance dip, and the recovery timeline.
- **Loan Bridging Engine:** Schedule deficit-covering loan facilities with automatic disbursement dates, linked single or installment repayments, and margin calculation.

### 🔄 3. Multi-Draw Tranches & Adaptive Decision Modals
- **Subspend / Multi-Draw Tranche Persistence:** Record multiple partial spends or loan draws against an entry (`entry.draws`). Each tranche retains its own payment date, amount, account, and subcategory tag.
- **Exact Amount Decision Prompt:** When an actual spend, income, or loan draw meets or exceeds 100% of planned, prompts whether to **Finish & Fulfill** (close entry and remove remainder from future forecast) or **Keep Ongoing** (keep open in Cash Flow to log further transactions).
- **Loan Repayment Scaling:** When logging a partial draw against a credit or bridge facility, automatically calculates and offers to **Scale Repayment** obligations down proportionally to match what was actually borrowed.
- **Modal Ordering:** When an actual amount settles an entry in full (including calculated credit dues), the Finish/Keep decision appears first; the **Deduct & Save** account prompt follows once it is resolved.
- **Undo / Redo:** Compound mutations run inside `runTransaction`, so each user action (including multi-entry operations) reverts in a single undo step, with an undo toast.

### 🧭 4. Unified Interactive Navigation & Deep-Linking
- **Direct Entry Redirection & Row Flashing:** Clicking any credit due hero card or sub-cycle ("THIS MO" / "NEXT MO") on the Dashboard jumps directly to the exact settlement entry in Cash Flow (`credit-settlement-cib-${month}` / `credit-settlement-hsbc-${month}`) with automatic scroll-centering and a double-pulse glow animation.
- **Unfiltered Deficit-to-Cashflow Linking:** Clicking any entry in Deficits View (trigger text, daily progression steps, or overdue obligations) jumps right to that entry in Cash Flow without filtering out surrounding transactions, preserving complete ledger context.
- **In-Table Quick Filtering:** Clicking category names, `#tag` pills, account badges, or type pills inside Cash Flow and History tables instantly toggles active filters on and off with visible dismiss pills (✕).
- **Interactive Metric & Breakdown Cards:** 100% of Dashboard and Deficit summary cards are interactive — clicking total net worth, liquid cash, forecast low point, cashflow status, upcoming obligations, or category expense rows routes directly to the intended destination.

### 🏛️ 5. Multi-Currency Accounts, Storage & Gold Valuation
- **Liquid Accounts & CD Maturity:** Real-time visibility into bank accounts, cash reserves, and certificates of deposit (CDs) with maturity date tracking.
- **Real-Time FX & Gold Conversion:** Converts USD, EUR, GBP, AED, SAR, and 21K/24K Gold grams into local currency (EGP) using live bid/ask spreads.
- **Storage Assets:** Track physical or digital assets and gold holdings with live valuation and net worth contribution.

### 💼 6. Project & Freelance Billing (Jobs View)
- **Time & Day Logging:** Log billable project days, daily rates, and notes.
- **Client Project Expenses:** Record project-related expenses to be reimbursed or deducted.
- **Client Milestone Payments:** Track installment payments received in foreign currency (USD, EUR) and local currency (EGP), showing contract balances and remaining receivables.

### 📈 7. Historical Auditing & Financial Health Index
- **Composite Financial Health Score (0–100):** Real-time rating analyzing liquid runway, deficit safety, budget adherence, and reserve funding.
- **Credit Settlement Netting:** Historical settled-month auditing nets credit settlements against swiped transactions so only newly incurred excess deltas (bank fees, interest, or statement variance) count as expenses, preventing double-counting.
- **Validated Entry Analytics:** Filter historical transactions by month, type, account, and subcategory tags, with automatic variance analysis (favorable vs. unfavorable).
- **Admin Edit Mode:** Unlockable administrative table controls to quickly edit historical records, adjust actuals, or remove erroneous entries.

### 🔒 8. High-Capacity IndexedDB Storage, Hardened Google Drive Sync & Undo History
- **High-Capacity IndexedDB Architecture:** Unlimited local-first persistence via `storageAdapter` (IndexedDB / `idb-keyval`), automatically migrating legacy data and overcoming browser `localStorage` quota restrictions.
- **Persistent Undo / Redo Engine:** 30-depth undo/redo history persisted across page refreshes and browser restarts, with an automatic 24-hour TTL and transaction rollbacks.
- **Hardened Google Drive Cloud Sync:** Enterprise-grade background sync with single mutex lock, 4-row OCC (revision + base + device tags), atomic IDB batching, rolling local snapshots, and interactive conflict resolution modal.
- **Autonomous Cloudflare OAuth Proxy:** Secure PKCE token exchange and auto-refresh via `workers/drive-auth-proxy` with cross-origin isolation.
- **Full Data Portability:** Instant JSON backup export/import (fully backward-compatible with legacy formats) and Excel CSV export with sensitive credential redaction.
- **PWA Ready with Instant Cache Purge:** Progressive Web App support with service worker cache purging and one-click app updating.

### 🎨 9. Universal Theme System (OLED Dark & High-Contrast Light)
- **Zero-Flash Theme Bootloader:** Synchronous inline `<script>` in `<head>` applies active theme and updates `<meta name="theme-color">` before initial paint, eliminating white/dark flashes.
- **True OLED Dark Mode:** Deep pitch-black background optimized for OLED/AMOLED mobile and desktop displays.
- **High-Contrast Light Mode:** Fully tokenized design system (`--card-salary-bg`, `--summary-bg`, `--dialog-bg`, `--input-bg`, `--sidebar-*`) passing WCAG AA contrast standards across all 8 feature views, tables, KPI headers, and interactive dialogs.
- **Single-Click Theme Toggle:** Easily toggle between Dark and Light mode from Topbar or Mobile Navigation.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `/` | Focus search bar on active tab (**Cash Flow** or **History**) |
| `Ctrl + B` / `⌘ + B` | Toggle sidebar navigation |
| `E` | Open **Add Expense** modal |
| `I` | Open **Add Income** modal |
| `L` | Open **Bridge Deficit with Loan** modal |
| `Escape` | Close active modal or mobile navigation drawer |

---

## 🛠️ Technology Stack

- **Framework:** [React 19](https://react.dev/) + [Vite 8](https://vite.dev/)
- **Language:** [TypeScript 5](https://www.typescriptlang.org/) (Strict typing across domain models and calculations)
- **State Management:** [Zustand 5](https://zustand-demo.pmnd.rs/) partitioned into domain slices (`src/store/slices/`)
- **Storage Adapter:** [idb-keyval](https://github.com/jakearchibald/idb-keyval) (IndexedDB bridge with automatic migration and persistent 24h undo/redo)
- **Cloud Sync:** Autonomous Google Drive REST API v3 + GitHub Gist API
- **Icons:** [Lucide React](https://lucide.dev/)
- **Testing & Tooling:** [TSX](https://github.com/privatenumber/tsx) (Fast TypeScript test runner) & [Oxlint](https://oxc.rs/)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18+ recommended)
- `npm` or `pnpm`

### Installation

```bash
# Clone repository
git clone https://github.com/62j62shnt7-ai/Budgetapp.git
cd Budgetapp

# Install dependencies
npm install
```

### Running Locally

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

### ⚡ Quick-Launch Shortcuts (Mac & Windows)
Double-click executable scripts are included in the repository root for one-click local launching:
- **macOS:** Double-click [`run-app.command`](run-app.command)
- **Windows:** Double-click [`run-app.bat`](run-app.bat)

These scripts automatically ensure dependencies are installed, start the Vite development server, and open your default browser.

---

## 🧪 Testing & Quality Assurance

Budget Control v2 includes a dedicated unit and integration test suite verifying all core math, financial algorithms, and edge cases:

- Credit card statement cycle and 56-day settlement rules
- Salary matrix schedule calculation
- Multi-interval installment amortized burn rate calculations
- Forecast calculation & deficit detection algorithms
- Day-level spend simulator and recovery timelines
- Multi-draw tranches and partial entry handling
- Currency FX bid/ask and gold gram valuation formulas
- Financial health score scoring matrix and settlement netting
- Legacy JSON data backup normalization and schema migrations
- Universal real-world user payload verification (`test/audit_user_data.json`)

Run the test suite with:

```bash
npm test
```

To run the live real-world payload universal audit runner:

```bash
npx tsx test/universalAuditRunner.mjs
```

To build for production with full type-checking and automated test verification:

```bash
npm run build
```

For detailed architectural and audit deliverables, see:
- [`UNIVERSAL_LOGIC_AUDIT.md`](UNIVERSAL_LOGIC_AUDIT.md) — Comprehensive Universal Domain & Business Logic Audit Report
- [`AUDIT_REPORT.md`](AUDIT_REPORT.md) — Master Verification & Defect Ledger Report

---

## 📁 Project Structure

```text
Budgetapp/
├── src/
│   ├── components/
│   │   ├── Accounts/        # Account balances & CD maturity tracking
│   │   ├── Cashflow/        # Forecast table, installments, filters & spend actions
│   │   ├── Dashboard/       # Net worth, health index & overview widgets
│   │   ├── Deficits/        # Timeline of negative cash spells & top KPI cards
│   │   ├── History/         # Historical transactions, analytics & admin tools
│   │   ├── Jobs/            # Project billing, logged days & client expenses
│   │   ├── Layout/          # Header, Sidebar, Topbar, BottomNav & MobileActionSheet
│   │   ├── Modals/          # Decision modals, loan bridge, sync, deduct & forms
│   │   ├── Rates/           # Currency rates & gold prices editor
│   │   └── Storage/         # Physical storage assets & valuables
│   ├── engine/              # Pure business logic and financial calculation functions
│   │   ├── creditCards.ts
│   │   ├── creditDueAlerts.ts
│   │   ├── currency.ts
│   │   ├── dateUtils.ts
│   │   ├── forecast.ts
│   │   ├── healthScore.ts
│   │   ├── jobs.ts
│   │   ├── migration.ts
│   │   └── salaryAndInstallments.ts
│   ├── hooks/              # Shared React hooks (forecast candidates, update status, hash routing)
│   ├── services/           # External service clients (Google Drive REST API bridge)
│   ├── store/
│   │   ├── slices/         # Domain-specific Zustand slices (ui, undo, entries, accounts, jobs, rates, sync)
│   │   └── useBudgetStore.ts # Unified store composition & auto-sync subscriber
│   ├── types/
│   │   └── index.ts         # TypeScript domain models & interfaces
│   ├── styles/             # Modular base stylesheets (base.css)
│   ├── index.css           # Design tokens, modern glassmorphism & responsive overrides
│   └── utils/
│       ├── affectedRecords.ts # Linked entity discovery & cascading options
│       ├── appRefresh.ts    # Service Worker cache purge & update utilities
│       ├── recurringDetector.ts # Recurring candidate grouping & series linking
│       └── storageAdapter.ts # High-capacity IndexedDB bridge with persistent undo/redo
├── public/                 # Static PWA assets (manifest, service worker, 404)
├── test/
│   ├── audit_user_data.json # Full real-world backup test payload
│   ├── universalAuditRunner.mjs # Universal domain test runner
│   ├── verifyMath.mjs       # Comprehensive financial math test suite
│   ├── testStorageAdapter.mjs # IndexedDB storage adapter & cloud sync test suite
│   ├── testSyncEngine.mjs   # Google Drive sync engine & 10 hardening scenarios suite
│   ├── testCreditSettlementModal.mjs # Credit settlement modal test suite
│   ├── test-jobs-playwright.mjs # Jobs flows visual Playwright tests
│   └── ui-audit.mjs         # Playwright visual audit test suite
├── workers/                # Cloudflare Workers
│   └── drive-auth-proxy/   # Google Drive OAuth PKCE exchange & token refresh proxy
├── AUDIT_REPORT.md         # Master Verification & Defect Ledger Report
└── UNIVERSAL_LOGIC_AUDIT.md # Comprehensive Universal Domain & Business Logic Audit Report
```

---

## 📄 License

Private / Personal Project. All rights reserved.
