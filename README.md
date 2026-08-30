# Budget Control (Budgetapp)

A lightweight, local-first personal financial planning and cashflow forecasting web application built with vanilla web technologies.

---

## 🌟 Key Features

### 1. Dashboard & Net Worth Overview
- **Financial Health Stability Index (0–100)**: Real-time composite health rating with dynamic grade pills (`Strong` / `Moderate` / `Needs Focus`) evaluating deficit safety, liquid runway, budget adherence, and reserve funding.
- **Deficit Priority & Proximity Gatekeeper**: Imminent liquid cash deficits (< 30 days) automatically override asset valuations to enforce critical advisory alerts and score caps.
- **Automated Smart Financial Insights**: Real-time contextual advisory strip flagging credit maturity count downs, top monthly spending drivers, deficit horizons, and asset reserve backing.
- **Total Net Worth Tracking**: Aggregates liquid cash across bank accounts with stored assets (Gold, USD, EUR, etc.).
- **Cash Flow Projections**: Real-time balance forecasting curve showing projected low points and cash flow status.
- **Visual Analytics**: Interactive balance forecast chart, category expense breakdowns, and asset allocation summaries.
- **Dynamic Color Interpolation**: Continuous RGB color transitions (Green → Amber → Red) on category budget progress bars and financial health tracks.

### 2. Deficit & Liquidity Monitoring
- **Forecast Deficit Spells**: Identifies exact time windows where projected cash drops below zero before incoming revenue arrives.
- **Overdue & Unpaid Tracker**: Flags past-due expenses that lack recorded actual amounts.

### 3. Cashflow & Planning
- **Customizable Summary Range**: Filter forecast metrics across custom date ranges or view full lifetime projections.
- **Category Budget Caps**: Monthly spending thresholds per category with real-time visual progress bars.
- **Savings Goals**: Track target funding amounts and progress toward emergency reserves and long-term milestones.
- **Salary & Income Scheduling**: Multi-quarter salary generator (supports split payments like 15th / 30th) and income streams.
- **Recurring Entries & Installments**: Configure fixed monthly, weekly, or bi-weekly recurring expenses and income on custom schedules (including set weekdays like Friday) with flexible durations.
- **Forecast Ledger**: Searchable, filterable entries table supporting forecast amounts vs. actual amounts.

### 4. Historical Actuals & Validations Ledger
- **Monthly Financial Summary**: Track monthly realized income, actual expenditures, net cash surpluses, and savings rate percentages.
- **Individual Validations Ledger**: Itemized ledger of every validated spend or income with date, category, account, type, source, forecast, actual amount, and budget variance.
- **Granular Filter Toolbar**: Instant filtering by Month, Type (Income/Expense), Account, and live text search.
- **Dynamic KPI Header**: Real-time totals (Income, Expenses, Net) calculated dynamically based on active filter selections.
- **Direct Entry Editing**: Adjust or clear validated amounts directly from the history ledger.

### 5. Multi-Account Management
- Configure opening balances across multiple institutions (e.g., CIB, HSBC, Cash).
- Track credit card due dates and automated settlement projections.

### 5. Stored Assets & Valuation Rates
- **Asset Vault**: Track physical and foreign reserves (Gold bars/coins in 24k/21k/18k, USD, EUR, etc.).
- **Real-Time Valuation**: Live currency conversion rates and karat-specific gold valuation against local base currency (EGP).

### 6. Jobs & External Invoicing
- **ASF Invoices**: Track foreign invoice milestones with actual realization dates and currency conversion.
- **IRQ / Freelance Work**: Manage project-based income cards with due dates and delivery tracking.

### 7. Cloud Sync & Data Portability
- **GitHub Gist Sync**: Secure, private cloud synchronization using GitHub Personal Access Tokens (PAT).
- **JSON Import / Export**: Complete backup and restore of all local settings, transactions, and assets.
- **CSV Export**: Export all forecast and actual transaction logs for spreadsheet analysis.
- **Local-First Privacy**: All data lives locally in the browser (`localStorage`) by default; no third-party backend servers.
- **Dark Mode**: Sleek modern UI with dynamic dark/light theme toggle.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3 (Custom properties & CSS Grid/Flexbox)
- **Storage**: Browser `localStorage` + GitHub Gist REST API for cloud backup
- **Dependencies**: Zero external build dependencies or node packages required.

---

## 🚀 Getting Started

### Run Locally

Because the application is built with standard vanilla web technologies, no build step or package installation is needed:

1. **Directly in Browser**:
   - Double-click or open `index.html` in any modern web browser.

2. **Using a Local Static Server (Recommended)**:
   - Using Python:
     ```bash
     python3 -m http.server 8000
     ```
     Then open `http://localhost:8000` in your browser.
   - Using Node.js:
     ```bash
     npx serve .
     ```

---

## ☁️ GitHub Gist Cloud Sync Setup

To sync your financial data seamlessly across devices:

1. Generate a GitHub Personal Access Token (classic or fine-grained) with `gist` permissions.
2. Click **☁️ Sync** in the top action bar of the app.
3. Paste your GitHub Token and specify an optional Gist ID (or let the app auto-create a private Gist for you).
4. Save to enable one-click cloud upload and download.

---

## 📁 Project Structure

```text
Budgetapp/
├── index.html        # Main application markup & UI dialogs
├── styles.css        # Responsive styling, design tokens, light/dark themes
├── app.js            # Core business logic, calculations, state, and UI handlers
├── .gitignore        # Git ignore file
└── README.md         # Documentation
```

---

## 📄 License

This project is licensed under the MIT License.
