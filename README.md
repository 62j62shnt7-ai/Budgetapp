# 💰 Budget Control v2

> **Precision Personal Liquidity Forecasting, Day-Level Deficit Detection & Multi-Currency Wealth Tracking.**

Budget Control v2 is a local-first, privacy-focused financial management web application built with **React 19**, **TypeScript**, **Zustand**, and **Vite**. It is engineered to give you complete visibility over your future liquidity, day-by-day cash flow balances, loan facilities, credit card settlements, and foreign currency assets.

---

## ✨ Key Features

### 📊 1. Predictive Cash Flow & Day-Level Forecasting
- **Rolling Multi-Month Horizon:** Projects daily and month-end liquid cash balances across all liquid bank accounts.
- **Salary Cycle Matrix:** Configurable 3-month recurring salary distribution patterns with customizable day offsets.
- **Recurring Commitments & Installments:** Track scheduled monthly installments, remaining terms, and remaining principal balances.
- **Credit Card Billing Automation:** Faithfully models grace periods, statement closing dates, and settlement due dates for cards (e.g. CIB and HSBC 56-day rollover logic).
- **Proactive Deficit Detection:** Flags exact negative-balance spells before they happen, identifying the specific date liquidity drops below zero and when upcoming income will restore it.

### 🧪 2. Interactive Spend Simulator & Deficit Bridging
- **Pre-Purchase Impact Analysis:** Test prospective large purchases against your daily forecast before spending. Immediately visualizes whether a purchase causes a deficit, the lowest projected balance dip, and the recovery timeline.
- **Loan Bridging Engine:** Schedule deficit-covering loan facilities with automatic disbursement dates, linked single or installment repayments, and margin calculation.

### 🔄 3. Multi-Draw Tranches & Adaptive Decision Modals
- **Subspend / Multi-Draw Tranche Persistence:** Record multiple partial spends or loan draws against an entry (`entry.draws`). Each tranche retains its own payment date, amount, account, and subcategory tag.
- **Exact Amount Decision Prompt:** When an actual spend, income, or loan draw meets or exceeds 100% of planned, prompts whether to **Finish & Fulfill** (close entry and remove remainder from future forecast) or **Keep Ongoing** (keep open in Cash Flow to log further transactions).
- **Loan Repayment Scaling:** When logging a partial draw against a credit or bridge facility, automatically calculates and offers to **Scale Repayment** obligations down proportionally to match what was actually borrowed.

### 🏛️ 4. Multi-Currency Accounts, Storage & Gold Valuation
- **Liquid Accounts & CD Maturity:** Real-time visibility into bank accounts, cash reserves, and certificates of deposit (CDs) with maturity date tracking.
- **Real-Time FX & Gold Conversion:** Converts USD, EUR, GBP, AED, SAR, and 21K/24K Gold grams into local currency (EGP) using live bid/ask spreads.
- **Storage Assets:** Track physical or digital assets and gold holdings with live valuation and net worth contribution.

### 💼 5. Project & Freelance Billing (Jobs View)
- **Time & Day Logging:** Log billable project days, daily rates, and notes.
- **Client Project Expenses:** Record project-related expenses to be reimbursed or deducted.
- **Client Milestone Payments:** Track installment payments received in foreign currency (USD, EUR) and local currency (EGP), showing contract balances and remaining receivables.

### 📈 6. Historical Auditing & Financial Health Index
- **Composite Financial Health Score (0–100):** Real-time rating analyzing liquid runway, deficit safety, budget adherence, and reserve funding.
- **Validated Entry Analytics:** Filter historical transactions by month, type, account, and subcategory tags, with automatic variance analysis (favorable vs. unfavorable).
- **Admin Edit Mode:** Unlockable administrative table controls to quickly edit historical records, adjust actuals, or remove erroneous entries.

### 🔒 7. Privacy-First Storage & GitHub Gist Sync
- **Local-First Architecture:** All data stays directly in your browser's `localStorage` by default — zero mandatory backend accounts or third-party trackers.
- **GitHub Gist Cloud Sync:** Seamless encrypted sync to a private GitHub Gist with auto-sync debouncing, manual pull/push, and `#gist=` URL deep-linking.
- **Full Data Portability:** Instant JSON backup export/import (fully backward-compatible with legacy formats) and Excel CSV export.
- **PWA Ready with Instant Cache Purge:** Progressive Web App support with service worker cache purging and one-click app updating.

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
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/) with reactive local persistence
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

---

## 🧪 Testing & Quality Assurance

Budget Control v2 includes a dedicated unit test suite verifying all core math, financial algorithms, and edge cases:

- Credit card statement cycle and 56-day settlement rules
- Salary matrix schedule calculation
- Forecast calculation & deficit detection algorithms
- Day-level spend simulator and recovery timelines
- Multi-draw tranches and partial entry handling
- Currency FX and gold Gram valuation formulas
- Financial health score scoring matrix
- Legacy JSON data backup normalization

Run the test suite with:

```bash
npm run test
```

To build for production with full type-checking and automated test verification:

```bash
npm run build
```

---

## 📁 Project Structure

```text
Budgetapp/
├── src/
│   ├── components/
│   │   ├── Accounts/        # Account balances & CD maturity tracking
│   │   ├── Cashflow/        # Forecast table, filters & spend actions
│   │   ├── Dashboard/       # Net worth, health index & overview widgets
│   │   ├── Deficits/        # Timeline of negative cash spells & top KPI cards
│   │   ├── History/         # Historical transactions, analytics & admin tools
│   │   ├── Jobs/            # Project billing, logged days & client expenses
│   │   ├── Layout/          # Header, Sidebar & Topbar
│   │   ├── Modals/          # Decision modals, loan bridge, sync & forms
│   │   ├── Rates/           # Currency rates & gold prices editor
│   │   └── Storage/         # Physical storage assets & valuables
│   ├── engine/              # Pure business logic and financial calculation functions
│   │   ├── creditCards.ts
│   │   ├── currency.ts
│   │   ├── dateUtils.ts
│   │   ├── forecast.ts
│   │   ├── healthScore.ts
│   │   ├── jobs.ts
│   │   └── salaryAndInstallments.ts
│   ├── store/
│   │   └── useBudgetStore.ts # Central Zustand store with localStorage sync
│   ├── types/
│   │   └── index.ts         # TypeScript domain models & interfaces
│   └── utils/
│       └── appRefresh.ts    # Service Worker cache purge & update utilities
├── test/
│   └── verifyMath.mjs       # Comprehensive financial math test suite
└── legacy/                  # Legacy reference implementation
```

---

## 📄 License

Private / Personal Project. All rights reserved.
