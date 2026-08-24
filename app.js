/* ==========================================================================
   Budget Control — Core Application Logic
   Fully compatible with direct file:// desktop double-click and HTTP web servers.
   ========================================================================== */

// --- Storage Keys & Defaults ---
const keys = {
  salary: "budget-control-salary-pattern",
  entries: "budget-control-cash-entries",
  installments: "budget-control-installments",
  storage: "budget-control-storage-assets",
  seedVersion: "budget-control-seed-version",
  accounts: "budget-control-account-balances",
  asf: "budget-control-asf-jobs",
  rates: "budget-control-rates",
  irq: "budget-control-irq-jobs",
  creditDues: "budget-control-credit-dues",
  creditDueMonths: "budget-control-credit-due-months",
  entryActuals: "budget-control-entry-actuals",
  deletedForecasts: "budget-control-deleted-forecasts",
  archivedEntries: "budget-control-archived-entries",
  categoryCaps: "budget-control-category-caps",
  savingsGoals: "budget-control-savings-goals",
  salaryMaterialized: "budget-control-salary-materialized",
  salaryAnchor: "budget-control-salary-anchor",
  resetBackup: "budget-control-reset-backup",
  theme: "budget-control-theme",
  gistToken: "budget-control-gist-token",
  gistId: "budget-control-gist-id",
  gistAutoSync: "budget-control-gist-autosync"
};

const seedVersion = "blank-template-v2";

const defaultSalaryPattern = [
  { monthOffset: 0, day: 15, amount: 0 },
  { monthOffset: 0, day: 30, amount: 0 },
  { monthOffset: 1, day: 15, amount: 0 },
  { monthOffset: 1, day: 30, amount: 0 },
  { monthOffset: 2, day: 15, amount: 0 },
  { monthOffset: 2, day: 30, amount: 0 }
];

const defaultAccountBalances = {
  cib: { name: "CIB", balance: 0, maturityDay: 15 },
  hsbc: { name: "HSBC", balance: 0, maturityDay: 30 }
};

const defaultRates = {
  currencies: [
    { name: "USD", sell: 48.5, buy: 48.4 },
    { name: "EUR", sell: 52.1, buy: 52.0 },
    { name: "SAR", sell: 12.9, buy: 12.8 },
    { name: "AED", sell: 13.2, buy: 13.1 },
    { name: "GBP", sell: 61.5, buy: 61.3 }
  ],
  gold: [
    { name: "Gold 24", sell: 3600, buy: 3580 },
    { name: "Gold 22", sell: 3300, buy: 3280 },
    { name: "Gold 21", sell: 3150, buy: 3130 },
    { name: "Gold 18", sell: 2700, buy: 2680 },
    { name: "Gold coin", sell: 25200, buy: 25000 }
  ]
};

const defaultCategoryCaps = [
  { category: "Home", cap: 15000 },
  { category: "Bills", cap: 5000 }
];

const defaultSavingsGoals = [
  { id: "g1", name: "Emergency Reserve", target: 50000, current: 15000 }
];

const exportableDataKeys = {
  salaryPattern: keys.salary,
  salaryAnchorMonth: keys.salaryAnchor,
  cashEntries: keys.entries,
  installments: keys.installments,
  storageAssets: keys.storage,
  accountBalances: keys.accounts,
  asfJobs: keys.asf,
  ratesData: keys.rates,
  irqJobs: keys.irq,
  creditDues: keys.creditDues,
  creditDueMonths: keys.creditDueMonths,
  entryActuals: keys.entryActuals,
  deletedForecasts: keys.deletedForecasts,
  archivedEntries: keys.archivedEntries,
  categoryCaps: keys.categoryCaps,
  savingsGoals: keys.savingsGoals
};

// --- Date Utilities ---
const DateUtils = {
  formatDate: (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  currentYearMonth: () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  },
  getMonthKey: (dateString) => (dateString ? dateString.slice(0, 7) : ""),
  getLastDayOfMonth: (year, month) => new Date(year, month, 0).getDate(),
  parseYearMonth: (ymString) => (ymString ? ymString.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1]),
  parseDate: (dateString) => (dateString ? dateString.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()]),
  getShortMonth: (ymString) => (ymString ? ymString.slice(5) : ""),
  todayString: () => {
    const now = new Date();
    return DateUtils.formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  },
  formatDisplayDate: (dateString) => {
    if (!dateString) return "";
    if (dateString.length === 7) return dateString; // YYYY-MM
    const [y, m, d] = dateString.split("-").map(Number);
    if (!y || !m || !d) return dateString;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  },
  daysBetween: (earlierDateString, laterDateString) => {
    if (!earlierDateString || !laterDateString) return 0;
    const [y1, m1, d1] = earlierDateString.split("-").map(Number);
    const [y2, m2, d2] = laterDateString.split("-").map(Number);
    const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
};

// --- Formatters & Helpers ---
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usdFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const money = (value) => `${numberFormatter.format(Math.round(Number(value) || 0))} EGP`;
const usd = (value) => `${usdFormatter.format(Number(value) || 0)} USD`;

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---- Color Interpolation & Debounce Helpers ---- */
function hex2rgb(h) {
  h = (h || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

function rgb2hex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smartColor(t) {
  // t in [0, 1]: 0 = green (#1f7a4d), 0.5 = amber (#d98e2b), 1 = red (#e5534b)
  t = Math.max(0, Math.min(1, Number(t) || 0));
  const green = hex2rgb("#1f7a4d");
  const amber = hex2rgb("#d98e2b");
  const red = hex2rgb("#e5534b");
  if (t <= 0.5) {
    const k = t * 2;
    return rgb2hex(lerp(green[0], amber[0], k), lerp(green[1], amber[1], k), lerp(green[2], amber[2], k));
  } else {
    const k = (t - 0.5) * 2;
    return rgb2hex(lerp(amber[0], red[0], k), lerp(amber[1], red[1], k), lerp(amber[2], red[2], k));
  }
}

function debounce(fn, delay = 200) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/* ---- Financial Health & Smart Insights Engine ---- */
function computeFinancialHealthScore({ entries, forecast, deficitSummary, actualCashNow, storageTotal }) {
  const { deficitPeriods, forecastMonths } = deficitSummary;
  const today = DateUtils.todayString();

  // 1. Deficit Safety & Proximity Gatekeeper (0 - 25 pts + hard score cap)
  let deficitScore = 25;
  let hardScoreCap = 100;
  let deficitSummaryNote = "";

  if (deficitPeriods && deficitPeriods.length > 0) {
    const firstDeficit = deficitPeriods[0];
    const daysUntilDeficit = firstDeficit.startDate ? DateUtils.daysBetween(today, firstDeficit.startDate) : 0;
    const isUnresolved = !firstDeficit.isResolved;

    if (daysUntilDeficit <= 30) {
      // Imminent deficit within 30 days
      deficitScore = 0;
      hardScoreCap = isUnresolved ? 35 : 45; // Hard cap into Red ("Needs Focus")
      deficitSummaryNote = `Imminent deficit projected starting ${DateUtils.formatDisplayDate(firstDeficit.startDate)}.`;
    } else if (daysUntilDeficit <= 60) {
      // Near-term deficit within 31-60 days
      deficitScore = isUnresolved ? 4 : 8;
      hardScoreCap = 60; // Hard cap into Amber ("Moderate")
      deficitSummaryNote = `Near-term deficit projected in ${daysUntilDeficit} days (${DateUtils.formatDisplayDate(firstDeficit.startDate)}).`;
    } else {
      // Mid/long-range deficit > 60 days
      deficitScore = isUnresolved ? 8 : 14;
      hardScoreCap = 74; // Cannot be higher than Moderate
      deficitSummaryNote = `Deficit projected in ${daysUntilDeficit} days (${DateUtils.formatDisplayDate(firstDeficit.startDate)}).`;
    }
  } else if (forecastMonths && forecastMonths.length > 0) {
    deficitScore = 6;
    hardScoreCap = 52;
    deficitSummaryNote = `${forecastMonths.length} month(s) projected negative in forecast.`;
  }

  // 2. Liquid Cash & Overall Runway (0 - 25 pts)
  const currentMonth = DateUtils.currentYearMonth();
  const currentMonthExpenses = entries
    .filter((e) => e.type === "expense" && DateUtils.getMonthKey(e.date) === currentMonth)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const allMonthlyExpenses = groupByMonth(entries.filter((e) => e.type === "expense"), (e) => Number(e.amount || 0));
  const expVals = Object.values(allMonthlyExpenses);
  const avgMonthlyExpense = expVals.length ? expVals.reduce((a, b) => a + b, 0) / expVals.length : (currentMonthExpenses || 1);

  let runwayScore = 25;
  if (avgMonthlyExpense > 0) {
    const liquidRunway = actualCashNow / avgMonthlyExpense;
    const totalNetWorth = actualCashNow + storageTotal;
    const totalRunway = totalNetWorth / avgMonthlyExpense;

    if (liquidRunway < 0.5 && storageTotal <= 0) {
      runwayScore = 4;
    } else if (totalRunway >= 6 && liquidRunway >= 1.5) {
      runwayScore = 25;
    } else if (totalRunway >= 3 && liquidRunway >= 1.0) {
      runwayScore = 20;
    } else if (totalRunway >= 1.5) {
      runwayScore = 14;
    } else if (totalRunway >= 0.5) {
      runwayScore = 8;
    } else {
      runwayScore = 4;
    }
  }

  // 3. Budget Adherence (0 - 25 pts)
  let budgetScore = 20; // Default neutral if no caps
  if (categoryCaps && categoryCaps.length > 0) {
    let exceededCount = 0;
    categoryCaps.forEach((item) => {
      const spent = entries
        .filter((e) => e.type === "expense" && DateUtils.getMonthKey(e.date) === currentMonth && (e.category || "").toLowerCase() === (item.category || "").toLowerCase())
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const cap = Number(item.cap || 0);
      if (cap > 0 && spent > cap) exceededCount++;
    });
    if (exceededCount === 0) budgetScore = 25;
    else if (exceededCount === 1) budgetScore = 14;
    else budgetScore = 6;
  }

  // 4. Savings & Reserve Target (0 - 25 pts)
  let savingsScore = 15;
  if (savingsGoals && savingsGoals.length > 0) {
    const totalTarget = savingsGoals.reduce((s, g) => s + Number(g.target || 0), 0);
    const totalCurrent = savingsGoals.reduce((s, g) => s + Number(g.current || 0), 0);
    if (totalTarget > 0) {
      const pct = totalCurrent / totalTarget;
      if (pct >= 0.8) savingsScore = 25;
      else if (pct >= 0.5) savingsScore = 20;
      else if (pct >= 0.25) savingsScore = 15;
      else savingsScore = 10;
    }
  }

  const rawScore = Math.round(deficitScore + runwayScore + budgetScore + savingsScore);
  const totalScore = Math.min(hardScoreCap, Math.max(0, rawScore));

  let band = { label: "Strong", grade: "A", tone: "strong", summary: "Strong liquidity runway and positive cashflow horizon." };
  if (totalScore < 55) {
    band = {
      label: "Needs Focus",
      grade: "C",
      tone: "attention",
      summary: deficitSummaryNote || "Deficit pressure or tight runway detected. Review upcoming expenses."
    };
  } else if (totalScore < 78) {
    band = {
      label: "Moderate",
      grade: "B",
      tone: "moderate",
      summary: deficitSummaryNote || "Stable cashflow with opportunities to build larger reserve buffers."
    };
  }

  return { totalScore, band, deficitScore, runwayScore, budgetScore, savingsScore, hardScoreCap };
}

function renderFinancialHealth(health) {
  const valEl = document.getElementById("healthScoreValue");
  const fillEl = document.getElementById("healthScoreFill");
  const badgeEl = document.getElementById("healthScoreBadge");
  const sumEl = document.getElementById("healthScoreSummary");

  if (valEl) valEl.textContent = String(health.totalScore);
  if (badgeEl) {
    badgeEl.textContent = health.band.label;
    badgeEl.className = `health-badge ${health.band.tone}`;
  }
  if (fillEl) {
    fillEl.style.width = `${health.totalScore}%`;
    fillEl.style.backgroundColor = smartColor(1 - (health.totalScore / 100));
  }
  if (sumEl) sumEl.textContent = health.band.summary;
}

function generateSmartInsights({ entries, forecast, deficitSummary, actualCashNow, storageTotal }) {
  const insights = [];
  const currentMonth = DateUtils.currentYearMonth();

  // 1. Credit Settlement Horizon
  const cibDue = getRemainingCreditDueAmount("cib");
  const hsbcDue = getRemainingCreditDueAmount("hsbc");
  if (cibDue > 0 || hsbcDue > 0) {
    const dues = [];
    if (cibDue > 0) dues.push(`CIB (${money(cibDue)})`);
    if (hsbcDue > 0) dues.push(`HSBC (${money(hsbcDue)})`);
    insights.push({
      icon: "💳",
      type: "warning",
      text: `<strong>Credit Settlement Due:</strong> ${dues.join(" & ")} scheduled for this billing cycle.`
    });
  }

  // 2. Deficit Horizon or Clean Projection
  const { deficitPeriods } = deficitSummary;
  if (deficitPeriods && deficitPeriods.length > 0) {
    const nextDeficit = deficitPeriods[0];
    const startFmt = DateUtils.formatDisplayDate(nextDeficit.startDate);
    const durStr = nextDeficit.daysInDeficit > 0 ? ` for ~${nextDeficit.daysInDeficit} days` : "";
    const fixStr = nextDeficit.resolvedBy ? ` until recovered by ${nextDeficit.resolvedBy}` : "";
    insights.push({
      icon: "⚠️",
      type: "danger",
      text: `<strong>Deficit Horizon:</strong> Projected balance turns negative on <strong>${startFmt}</strong>${durStr}${fixStr} (Peak deficit: ${money(nextDeficit.lowestBalance)}).`
    });
  } else {
    insights.push({
      icon: "✅",
      type: "success",
      text: `<strong>Clean Runway:</strong> Projected cash balance remains positive across all ${forecast.length} forecasted months.`
    });
  }

  // 3. Top Expense Driver
  const currentExpenses = entries.filter((e) => e.type === "expense" && DateUtils.getMonthKey(e.date) === currentMonth);
  const totalExp = currentExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  if (totalExp > 0) {
    const catMap = {};
    currentExpenses.forEach((e) => {
      const c = e.category || "General";
      catMap[c] = (catMap[c] || 0) + Number(e.amount || 0);
    });
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length > 0) {
      const [topCat, topAmt] = sortedCats[0];
      const topPct = Math.round((topAmt / totalExp) * 100);
      if (topPct >= 35) {
        insights.push({
          icon: "📊",
          type: "info",
          text: `<strong>Top Expense Driver:</strong> <strong>${escapeHtml(topCat)}</strong> represents ${topPct}% (${money(topAmt)}) of current month expenses.`
        });
      }
    }
  }

  // 4. Stored Assets Vault
  if (storageTotal > 0) {
    const totalNetWorth = actualCashNow + storageTotal;
    const ratio = totalNetWorth > 0 ? Math.round((storageTotal / totalNetWorth) * 100) : 100;
    insights.push({
      icon: "🪙",
      type: "info",
      text: `<strong>Asset Vault:</strong> ${money(storageTotal)} held in gold/foreign reserves (${ratio}% of total net worth).`
    });
  }

  // 5. Savings Goal Progress
  if (savingsGoals && savingsGoals.length > 0) {
    const topGoal = savingsGoals[0];
    const pct = topGoal.target > 0 ? Math.round((topGoal.current / topGoal.target) * 100) : 0;
    if (pct >= 70 && pct < 100) {
      insights.push({
        icon: "🎯",
        type: "success",
        text: `<strong>Savings Milestone:</strong> <strong>${escapeHtml(topGoal.name)}</strong> is ${pct}% funded (${money(topGoal.current)} / ${money(topGoal.target)}).`
      });
    }
  }

  return insights.slice(0, 4);
}

function renderSmartInsights(insights) {
  const container = document.getElementById("smartInsightsList");
  if (!container) return;

  if (!insights || !insights.length) {
    container.innerHTML = `<div class="insight-pill-item success"><span class="insight-pill-icon">✨</span><span class="insight-pill-content">All financial metrics within healthy operational limits.</span></div>`;
    return;
  }

  container.innerHTML = insights
    .map(
      (i) => `
      <div class="insight-pill-item ${i.type}">
        <span class="insight-pill-icon">${i.icon}</span>
        <span class="insight-pill-content">${i.text}</span>
      </div>
    `
    )
    .join("");
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function on(idOrElement, event, handler) {
  const el = typeof idOrElement === "string" ? document.getElementById(idOrElement) : idOrElement;
  if (el) el.addEventListener(event, handler);
}

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem(keys.theme);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(keys.theme, theme);
  const toggleBtn = document.getElementById("themeToggle");
  if (toggleBtn) {
    toggleBtn.textContent = theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
    toggleBtn.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  setTheme(current === "dark" ? "light" : "dark");
}

// --- Promise-based Modal Confirmation ---
function confirmAction(title, message, confirmButtonText = "Delete") {
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirmDialog");
    if (!dialog) {
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }

    const titleEl = document.getElementById("confirmTitle");
    const messageEl = document.getElementById("confirmMessage");
    const confirmBtn = document.getElementById("confirmOkButton");

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (confirmBtn) confirmBtn.textContent = confirmButtonText;

    const handleClose = () => {
      dialog.removeEventListener("close", handleClose);
      resolve(dialog.returnValue === "confirm");
    };

    dialog.addEventListener("close", handleClose);
    dialog.showModal();
  });
}

function promptAccountAdjustment(type, amount, defaultAccountKey = "cash", description = "") {
  return new Promise((resolve) => {
    const dialog = document.getElementById("deductAccountDialog");
    if (!dialog) {
      resolve(null);
      return;
    }

    const isIncome = (type || "").toLowerCase() === "income";
    const titleEl = document.getElementById("deductAccountTitle");
    const msgEl = document.getElementById("deductAccountMessage");
    const selectEl = document.getElementById("deductAccountSelect");
    const selectLabelEl = document.getElementById("deductAccountSelectLabel");
    const skipBtn = document.getElementById("deductAccountSkipBtn");
    const submitBtn = document.getElementById("deductAccountSubmitBtn");

    if (titleEl) {
      titleEl.textContent = isIncome ? "Deposit Income to Account?" : "Deduct Spend from Account?";
    }
    if (msgEl) {
      const verb = isIncome ? "received an actual income" : "recorded an actual payment";
      const actionVerb = isIncome ? "deposit this amount into" : "deduct this amount from";
      msgEl.textContent = `You ${verb} of ${money(amount)}${description ? ` for "${description}"` : ""}. Would you like to ${actionVerb} an account balance?`;
    }
    if (selectLabelEl) {
      selectLabelEl.textContent = isIncome ? "Select account to deposit into" : "Select account to deduct from";
    }
    if (skipBtn) {
      skipBtn.textContent = isIncome ? "Don't deposit" : "Don't deduct";
    }
    if (submitBtn) {
      submitBtn.textContent = isIncome ? "Deposit & Save" : "Deduct & Save";
    }

    if (selectEl) {
      const options = Object.entries(accountBalances).map(([id, acc]) => {
        const isSelected =
          (id || "").toLowerCase() === (defaultAccountKey || "").toLowerCase() ||
          (acc.name || "").toLowerCase() === (defaultAccountKey || "").toLowerCase();
        return `<option value="${escapeHtml(id)}"${isSelected ? " selected" : ""}>${escapeHtml(acc.name)} (Current: ${money(acc.balance)})</option>`;
      });
      selectEl.innerHTML = options.join("") || `<option value="cash">Cash (0)</option>`;
    }

    const form = document.getElementById("deductAccountForm");
    let settled = false;

    const cleanup = () => {
      if (form) form.removeEventListener("submit", handleSubmit);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };

    const handleSubmit = (event) => {
      event.preventDefault();
      if (settled) return;
      settled = true;
      const submitter = event.submitter;
      const val = submitter ? submitter.value : "confirm";
      const selectedAccId = selectEl ? selectEl.value : null;
      cleanup();
      dialog.close(val);
      if (val === "confirm" && selectedAccId) {
        resolve(selectedAccId);
      } else {
        resolve(null);
      }
    };

    const handleCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    const handleClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    if (form) form.addEventListener("submit", handleSubmit);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    dialog.showModal();
  });
}

function adjustAccountBalance(accountId, amount, type = "expense") {
  if (!accountId || !accountBalances[accountId] || !amount || amount <= 0) return;
  const current = Number(accountBalances[accountId].balance || 0);
  const roundedAmount = Math.round(Number(amount) || 0);
  if ((type || "").toLowerCase() === "income") {
    accountBalances[accountId].balance = Math.round(current + roundedAmount);
  } else {
    accountBalances[accountId].balance = Math.round(current - roundedAmount);
  }
  saveSetting(keys.accounts, accountBalances);
}

// Backwards compatibility aliases
const promptAccountDeduction = (amount, defaultAccountKey, description) => promptAccountAdjustment("expense", amount, defaultAccountKey, description);
const deductFromAccount = (accountId, amount) => adjustAccountBalance(accountId, amount, "expense");

// --- Storage Helpers ---
function loadSetting(key, fallback) {
  const saved = localStorage.getItem(key);
  if (!saved) {
    if (localStorage.getItem(keys.seedVersion) !== seedVersion) {
      localStorage.setItem(keys.seedVersion, seedVersion);
    }
    return clone(fallback);
  }
  try {
    return JSON.parse(saved);
  } catch (e) {
    console.error(`Error parsing localStorage key "${key}":`, e);
    return clone(fallback);
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (
      key !== keys.theme &&
      key !== keys.gistToken &&
      key !== keys.gistId &&
      key !== keys.gistAutoSync
    ) {
      triggerAutoGistSync();
    }
  } catch (e) {
    console.error(`Error saving to localStorage key "${key}":`, e);
  }
}

function readResetBackup() {
  const raw = localStorage.getItem(keys.resetBackup);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCashEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    ...entry,
    id: entry.id || generateId()
  }));
}

// --- App State ---
let forecastStartMonth = DateUtils.currentYearMonth();
let forecastQuarters = 12;

let salaryAnchorMonth = loadSetting(keys.salaryAnchor, null);
if (!salaryAnchorMonth) {
  salaryAnchorMonth = DateUtils.currentYearMonth();
  saveSetting(keys.salaryAnchor, salaryAnchorMonth);
}

let salaryPattern = loadSetting(keys.salary, defaultSalaryPattern);
let cashEntries = normalizeCashEntries(loadSetting(keys.entries, []));
let installments = loadSetting(keys.installments, []);
let storageAssets = loadSetting(keys.storage, []);
let accountBalances = loadSetting(keys.accounts, defaultAccountBalances);
let asfJobs = loadSetting(keys.asf, []);
let ratesData = loadSetting(keys.rates, defaultRates);
let irqJobs = loadSetting(keys.irq, []);
let creditDues = loadSetting(keys.creditDues, {});
let creditDueMonths = loadSetting(keys.creditDueMonths, {});
let entryActuals = loadSetting(keys.entryActuals, {});
let deletedForecasts = loadSetting(keys.deletedForecasts, []);
let archivedEntries = loadSetting(keys.archivedEntries, []);
let categoryCaps = loadSetting(keys.categoryCaps, defaultCategoryCaps);
let savingsGoals = loadSetting(keys.savingsGoals, defaultSavingsGoals);
let editingEntry = null;
let editingInstallmentIndex = null;

function sanitizeStoredActuals() {
  let changed = false;
  if (entryActuals && typeof entryActuals === "object") {
    Object.keys(entryActuals).forEach((key) => {
      const val = Number(entryActuals[key]);
      if (Number.isNaN(val) || val <= 0) {
        delete entryActuals[key];
        changed = true;
      } else {
        const rounded = Math.round(val);
        if (rounded !== entryActuals[key]) {
          entryActuals[key] = rounded;
          changed = true;
        }
      }
    });
  }
  if (Array.isArray(cashEntries)) {
    cashEntries.forEach((e) => {
      if (e && e.actualAmount !== undefined && e.actualAmount !== null) {
        const val = Number(e.actualAmount);
        const rounded = Number.isNaN(val) || val <= 0 ? 0 : Math.round(val);
        if (rounded !== e.actualAmount) {
          e.actualAmount = rounded;
          changed = true;
        }
      }
    });
  }
  if (Array.isArray(archivedEntries)) {
    archivedEntries.forEach((e) => {
      if (e && e.actualAmount !== undefined && e.actualAmount !== null) {
        const val = Number(e.actualAmount);
        const rounded = Number.isNaN(val) || val <= 0 ? 0 : Math.round(val);
        if (rounded !== e.actualAmount) {
          e.actualAmount = rounded;
          changed = true;
        }
      }
    });
  }
  if (changed) {
    saveSetting(keys.entryActuals, entryActuals);
    saveSetting(keys.entries, cashEntries);
    saveSetting(keys.archivedEntries, archivedEntries);
  }
}
sanitizeStoredActuals();

// --- Calculation Logic ---
function monthIndexFromYearMonth(ymString) {
  const [year, month] = DateUtils.parseYearMonth(ymString);
  return year * 12 + (month - 1);
}

function groupPhaseForMonthIndex(absoluteMonthIndex) {
  const anchorIndex = monthIndexFromYearMonth(salaryAnchorMonth || DateUtils.currentYearMonth());
  return (((absoluteMonthIndex - anchorIndex) % 3) + 3) % 3;
}

function buildSalaryEntries(startYearMonth, quarters) {
  const startIndex = monthIndexFromYearMonth(startYearMonth);
  const totalMonths = Math.max(1, Number(quarters) || 1) * 3;
  const result = [];

  for (let offset = 0; offset < totalMonths; offset += 1) {
    const absoluteMonthIndex = startIndex + offset;
    const phase = groupPhaseForMonthIndex(absoluteMonthIndex);
    const year = Math.floor(absoluteMonthIndex / 12);
    const month = ((absoluteMonthIndex % 12) + 12) % 12;

    salaryPattern
      .filter((payment) => (Number(payment.monthOffset) || 0) === phase)
      .forEach((payment) => {
        const lastDay = DateUtils.getLastDayOfMonth(year, month + 1);
        const day = Math.min(Number(payment.day), lastDay);
        result.push({
          date: DateUtils.formatDate(year, month + 1, day),
          category: "salary",
          account: "hsbc",
          type: "income",
          amount: Number(payment.amount) || 0,
          source: "salary"
        });
      });
  }

  return result;
}

function buildInstallmentEntries() {
  return installments.flatMap((installment) => {
    const [startYear, startMonth] = DateUtils.parseYearMonth(installment.startMonth);
    const frequency = Number(installment.frequency) || 1;
    return Array.from({ length: Number(installment.months) || 0 }, (_, index) => {
      const zeroBasedMonth = startMonth - 1 + index * frequency;
      const year = startYear + Math.floor(zeroBasedMonth / 12);
      const month = ((zeroBasedMonth % 12) + 12) % 12;
      const lastDay = DateUtils.getLastDayOfMonth(year, month + 1);
      const day = Math.min(Number(installment.day), lastDay);
      return {
        date: DateUtils.formatDate(year, month + 1, day),
        category: installment.name,
        account: "installment",
        type: "expense",
        amount: Number(installment.amount) || 0,
        source: "installment"
      };
    });
  });
}

function buildRecurringEntries(baseEntry, months) {
  const [startYear, startMonth, day] = baseEntry.date.split("-").map(Number);
  const result = [];
  for (let index = 0; index < months; index += 1) {
    const targetMonthIndex = startMonth - 1 + index;
    const year = startYear + Math.floor(targetMonthIndex / 12);
    const month = (targetMonthIndex % 12) + 1;
    const lastDay = DateUtils.getLastDayOfMonth(year, month);
    result.push({
      ...baseEntry,
      id: generateId(),
      date: DateUtils.formatDate(year, month, Math.min(day, lastDay))
    });
  }
  return result;
}

function creditDueEntries() {
  const entries = [];
  Object.entries(creditDues).forEach(([id, monthData]) => {
    const acc = accountBalances[id];
    if (!acc) return;

    Object.entries(monthData).forEach(([monthKey, amount]) => {
      if (Number(amount) <= 0) return;
      const [year, month] = DateUtils.parseYearMonth(monthKey);
      const lastDay = DateUtils.getLastDayOfMonth(year, month);
      const day = Math.min(acc.maturityDay, lastDay);
      entries.push({
        date: DateUtils.formatDate(year, month, day),
        category: `${acc.name} Credit`,
        account: id,
        type: "expense",
        amount: Number(amount),
        source: "recurring credit"
      });
    });
  });
  return entries;
}

function getEntryId(entry) {
  return entry.id || `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || "cash"}`;
}

function getEntryActualAmount(entry) {
  const id = getEntryId(entry);
  const rawValue = entryActuals[id];
  if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
    return Math.round(Number(rawValue) || 0);
  }
  if (entry && entry.actualAmount !== undefined && entry.actualAmount !== null && entry.actualAmount !== "") {
    return Math.round(Number(entry.actualAmount) || 0);
  }
  return 0;
}

function setEntryActualAmount(entry, value) {
  const id = getEntryId(entry);
  const rounded = value === "" || value === null || value === undefined ? 0 : Math.round(Number(value) || 0);
  entryActuals[id] = rounded;
  if (entry && entry.actualAmount !== undefined) {
    entry.actualAmount = rounded;
  }
  saveSetting(keys.entryActuals, entryActuals);
}

function isPartialTracked(entry) {
  if (!entry) return false;
  if (entry.type === "expense") return true;
  if (entry.source === "loan") return true;
  const cat = (entry.category || "").toLowerCase();
  if (cat.includes("loan")) return true;
  return false;
}

function isLoanInflow(entry) {
  if (!entry) return false;
  const isLoan = entry.source === "loan" || (entry.category && /loan/i.test(entry.category));
  return Boolean(isLoan && entry.type === "income");
}

function getRemainingForecastAmount(entry) {
  if (entry && entry.isClosed) return 0;
  const actualAmount = getEntryActualAmount(entry);
  if (isPartialTracked(entry) && actualAmount > 0) {
    return Math.max(0, Number(entry.amount || 0) - actualAmount);
  }
  return Number(entry.amount || 0);
}

function syncForecastPeriodSettings() {
  const startInput = document.getElementById("salaryPeriodStart");
  const quartersInput = document.getElementById("salaryPeriodQuarters");

  if (startInput && startInput.value) {
    forecastStartMonth = startInput.value;
  } else if (!startInput || !startInput.value) {
    forecastStartMonth = DateUtils.currentYearMonth();
    if (startInput) startInput.value = forecastStartMonth;
  }

  if (quartersInput && quartersInput.value !== "") {
    forecastQuarters = Math.max(1, Number(quartersInput.value) || 12);
  } else {
    forecastQuarters = 12;
    if (quartersInput) quartersInput.value = String(forecastQuarters);
  }

  return { startMonth: forecastStartMonth, quarters: forecastQuarters };
}

function getForecastCandidateEntries() {
  syncForecastPeriodSettings();
  const all = [
    ...cashEntries,
    ...buildInstallmentEntries(),
    ...creditDueEntries()
  ];
  const deletedSet = new Set(deletedForecasts || []);
  return all.filter((entry) => !deletedSet.has(getEntryId(entry)));
}

function forecastEntries() {
  const today = DateUtils.todayString();
  return getForecastCandidateEntries()
    .filter((entry) => {
      // If it's an unclosed loan inflow with remaining undrawn funds, persist it even if date is in the past
      if (isLoanInflow(entry) && !entry.isClosed && getRemainingForecastAmount(entry) > 0) {
        return true;
      }
      return !entry.date || entry.date >= today;
    })
    .filter((entry) => {
      if (isPartialTracked(entry)) {
        const actualAmount = getEntryActualAmount(entry);
        if (actualAmount > 0) {
          return getRemainingForecastAmount(entry) > 0;
        }
      }
      return getEntryActualAmount(entry) <= 0;
    })
    .map((entry) => {
      let effDate = entry.date;
      // Carry forward undrawn loan funds to today in the projection so they remain available
      if (isLoanInflow(entry) && entry.date && entry.date < today && getRemainingForecastAmount(entry) > 0) {
        effDate = today;
      }
      if (isPartialTracked(entry) && getEntryActualAmount(entry) > 0) {
        return { ...entry, date: effDate, amount: getRemainingForecastAmount(entry) };
      }
      return { ...entry, date: effDate };
    });
}

function openingBalanceEntries() {
  return Object.entries(accountBalances).map(([id, acc]) => ({
    date: DateUtils.todayString(),
    category: `${acc.name} Opening Balance`,
    account: id,
    type: "income",
    amount: Number(acc.balance) || 0,
    source: "starting balance",
    locked: true
  }));
}

function actualizedEntries() {
  syncForecastPeriodSettings();
  const activeCandidates = [
    ...cashEntries,
    ...buildInstallmentEntries(),
    ...creditDueEntries()
  ].filter((entry) => getEntryActualAmount(entry) > 0);
  
  const archivedWithActuals = archivedEntries.filter((entry) => getEntryActualAmount(entry) > 0);
  return [...activeCandidates, ...archivedWithActuals];
}

function materializeLegacySalaryEntries() {
  if (localStorage.getItem(keys.salaryMaterialized) === "true") return;

  const deletedSet = new Set(deletedForecasts || []);
  const legacyEntries = buildSalaryEntries(forecastStartMonth, forecastQuarters)
    .filter((entry) => !deletedSet.has(getEntryId(entry)))
    .map((entry) => {
      const legacyId = getEntryId(entry);
      const newId = generateId();
      if (entryActuals[legacyId] !== undefined) {
        entryActuals[newId] = entryActuals[legacyId];
        delete entryActuals[legacyId];
      }
      return { ...entry, id: newId };
    });

  if (legacyEntries.length) {
    cashEntries.push(...legacyEntries);
    saveSetting(keys.entries, cashEntries);
    saveSetting(keys.entryActuals, entryActuals);
  }
  localStorage.setItem(keys.salaryMaterialized, "true");
}

function getSavedCreditDueMonths(id) {
  return Object.keys(creditDues[id] || {}).sort();
}

function getDefaultCreditDueMonth() {
  return DateUtils.currentYearMonth();
}

function getCreditDueMonthForAccount(id) {
  const savedMonths = getSavedCreditDueMonths(id);
  if (creditDueMonths[id] && savedMonths.includes(creditDueMonths[id])) {
    return creditDueMonths[id];
  }
  if (savedMonths.length) {
    creditDueMonths[id] = savedMonths[0];
    saveSetting(keys.creditDueMonths, creditDueMonths);
    return savedMonths[0];
  }
  return getDefaultCreditDueMonth();
}

function getCreditDueAmount(id) {
  const monthKey = getCreditDueMonthForAccount(id);
  return (creditDues[id] && creditDues[id][monthKey]) || 0;
}

function getRemainingCreditDueAmount(id) {
  const accountKey = (id || "").toLowerCase();
  const selectedMonth = getCreditDueMonthForAccount(id);

  // 1. Recurring credit due set in settings
  const baseDue = getCreditDueAmount(id);

  // 2. Manual credit entries added via "Add expense" with creditType matching this account
  const manualCreditEntries = cashEntries.filter(
    (entry) => entry.type === "expense" && (entry.creditType || "").toLowerCase() === accountKey
  );

  const activeManualEntries = manualCreditEntries.filter((entry) => {
    if (entry.date && selectedMonth) {
      return DateUtils.getMonthKey(entry.date) === selectedMonth;
    }
    return true;
  });

  const totalPlannedDue = baseDue + activeManualEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  // 3. Actual payments made on recurring credit due
  const creditEntries = creditDueEntries();
  const monthRecurringEntry = creditEntries.find(
    (e) => (e.account || "").toLowerCase() === accountKey && DateUtils.getMonthKey(e.date) === selectedMonth
  );
  const recurringActualPaid = monthRecurringEntry ? getEntryActualAmount(monthRecurringEntry) : 0;

  // 4. Actual payments made on manual credit entries
  const manualActualPaid = activeManualEntries.reduce((sum, entry) => sum + getEntryActualAmount(entry), 0);

  const totalPaid = recurringActualPaid + manualActualPaid;

  return Math.max(0, totalPlannedDue - totalPaid);
}

// --- Foreign Exchange Conversion Helper ---
function getCurrencyRate(code) {
  if (!code || code.toUpperCase() === "EGP") return 1;
  const match = (ratesData.currencies || []).find((c) => c.name.toUpperCase() === code.toUpperCase());
  return match && Number(match.sell) > 0 ? Number(match.sell) : 1;
}

// --- Live Rates API Functions ---
const CURRENCY_RATES_ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const GOLD_PRICE_ENDPOINT = "https://api.gold-api.com/price/XAU";
const TROY_OUNCE_GRAMS = 31.1035;

function computeSpreadPct(sell, buy) {
  const mid = (Number(sell) + Number(buy)) / 2;
  if (!mid) return 0.006;
  return (Number(buy) - Number(sell)) / mid;
}

function applySpread(mid, spreadPct) {
  return {
    sell: Math.round(mid * (1 - spreadPct / 2) * 100) / 100,
    buy: Math.round(mid * (1 + spreadPct / 2) * 100) / 100
  };
}

async function fetchLiveCurrencyRates() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(CURRENCY_RATES_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Currency rate request failed (${response.status})`);
    const data = await response.json();
    if (data.result !== "success" || !data.rates || typeof data.rates.EGP !== "number") {
      throw new Error("Unexpected currency rate response");
    }
    return data.rates;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function egpPerUnit(liveRates, code) {
  if (code === "USD") return liveRates.EGP;
  const perUsd = liveRates[code];
  if (!perUsd) return null;
  return liveRates.EGP / perUsd;
}

async function fetchLiveGoldSpotUsd() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(GOLD_PRICE_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Gold price request failed (${response.status})`);
    const data = await response.json();
    const price = Number(data.price ?? data.price_usd ?? data.rate ?? data.spotPrice);
    if (!price || Number.isNaN(price)) throw new Error("Unexpected gold price response");
    return price;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function resolveRateSourceValue(sourceValue) {
  if (!sourceValue || sourceValue === "manual") return null;
  const sep = sourceValue.indexOf(":");
  if (sep === -1) return null;
  const type = sourceValue.slice(0, sep);
  const name = sourceValue.slice(sep + 1);
  const list = type === "gold" ? ratesData.gold : ratesData.currencies;
  const match = (list || []).find((item) => item.name === name);
  return match ? match.sell : null;
}

function syncStorageRates() {
  let changed = false;
  storageAssets.forEach((item) => {
    const resolved = resolveRateSourceValue(item.rateSource);
    if (resolved !== null && resolved !== item.rate) {
      item.rate = resolved;
      changed = true;
    }
  });
  if (changed) saveSetting(keys.storage, storageAssets);
}

// --- View Renderers ---
function renderDashboard() {
  const entries = forecastEntries();
  const forecast = calculateForecast(entries);

  const actualCashNow = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const currentCash = forecast.length ? forecast[forecast.length - 1].balance : totalOpeningBalance;
  const lowPoint = forecast.reduce(
    (lowest, item) => (item.balance < lowest.balance ? item : lowest),
    { month: forecastStartMonth, balance: totalOpeningBalance }
  );
  const storageTotal = storageAssets.reduce((sum, item) => sum + storageValue(item), 0);
  const totalNetWorth = actualCashNow + storageTotal;

  const cibCredit = getRemainingCreditDueAmount("cib");
  const hsbcCredit = getRemainingCreditDueAmount("hsbc");
  const totalCreditDue = cibCredit + hsbcCredit;

  // Financial Analytics metrics
  const netWorthEl = document.getElementById("totalNetWorth");
  if (netWorthEl) netWorthEl.textContent = money(totalNetWorth);

  const totalIncome = entries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalExpense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount || 0), 0);
  const savingsRatePct = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100)) : 0;

  const savingsRateEl = document.getElementById("savingsRate");
  if (savingsRateEl) savingsRateEl.textContent = `${savingsRatePct}%`;

  const cashBalanceEl = document.getElementById("cashBalance");
  if (cashBalanceEl) cashBalanceEl.textContent = money(currentCash);

  const actualCashEl = document.getElementById("actualCashToday");
  if (actualCashEl) actualCashEl.textContent = money(actualCashNow);

  const cibCreditEl = document.getElementById("cibCreditDue");
  if (cibCreditEl) cibCreditEl.textContent = money(cibCredit);

  const hsbcCreditEl = document.getElementById("hsbcCreditDue");
  if (hsbcCreditEl) hsbcCreditEl.textContent = money(hsbcCredit);

  const storageTotalEl = document.getElementById("storageTotal");
  if (storageTotalEl) storageTotalEl.textContent = money(storageTotal);

  const forecastLowEl = document.getElementById("forecastLow");
  if (forecastLowEl) forecastLowEl.textContent = money(lowPoint.balance);

  const forecastLowDateEl = document.getElementById("forecastLowDate");
  if (forecastLowDateEl) {
    forecastLowDateEl.textContent = `Lowest in ${escapeHtml(lowPoint.month)}`;
  }

  const isNegative = forecast.some((item) => item.balance < 0);
  updateCashflowStatus(isNegative);

  renderBalanceChart(forecast);
  renderCategoryBreakdown(entries);
  renderAssetDistribution(actualCashNow, storageTotal);
  renderExpenseMix(entries);
  renderWarnings(forecast);

  const deficitSummary = getDeficitSummary();
  renderDeficitBanner(deficitSummary);
  renderDeficits(deficitSummary);

  const healthScore = computeFinancialHealthScore({ entries, forecast, deficitSummary, actualCashNow, storageTotal });
  renderFinancialHealth(healthScore);

  const smartInsights = generateSmartInsights({ entries, forecast, deficitSummary, actualCashNow, storageTotal });
  renderSmartInsights(smartInsights);
}

function updateCashflowStatus(isNegative) {
  ["cashflowStatus", "cfCashflowStatus"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = isNegative ? "Risk" : "OK";
      el.classList.toggle("danger-text", isNegative);
    }
  });
  ["cashflowStatusNote", "cfCashflowStatusNote"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = isNegative ? "Expenses exceed cash in forecast" : "Cash stays above zero";
    }
  });
}

function renderAssetDistribution(actualCashNow, storageTotal) {
  const container = document.getElementById("assetAllocationList");
  const summaryEl = document.getElementById("assetAllocationSummary");
  if (!container) return;

  let goldTotal = 0;
  let fxTotal = 0;
  let otherStorageTotal = 0;

  storageAssets.forEach((item) => {
    const val = storageValue(item);
    const src = (item.rateSource || "").toLowerCase();
    const name = (item.name || "").toLowerCase();
    if (src.startsWith("gold:") || name.includes("gold") || name.includes("karat") || name.includes("ounce") || name.includes("gram")) {
      goldTotal += val;
    } else if (src.startsWith("currency:") || name.includes("usd") || name.includes("eur") || name.includes("gbp") || name.includes("aed") || name.includes("sar")) {
      fxTotal += val;
    } else {
      otherStorageTotal += val;
    }
  });

  const totalNetWorth = actualCashNow + storageTotal;
  if (summaryEl) {
    summaryEl.textContent = money(totalNetWorth);
  }

  if (totalNetWorth <= 0) {
    container.innerHTML = `<div class="list-row"><span>No assets recorded</span><strong>0</strong></div>`;
    return;
  }

  const assets = [
    { label: "Liquid Cash / Bank", icon: "💵", amount: actualCashNow, color: "var(--teal)" },
    { label: "Gold Assets", icon: "🪙", amount: goldTotal, color: "var(--amber)" },
    { label: "Foreign Currency", icon: "💱", amount: fxTotal, color: "var(--blue)" },
  ];
  if (otherStorageTotal > 0) {
    assets.push({ label: "Other Stored Assets", icon: "📦", amount: otherStorageTotal, color: "var(--green)" });
  }

  const filtered = assets.filter((a) => a.amount > 0).sort((a, b) => b.amount - a.amount);

  container.innerHTML = filtered
    .map((item) => {
      const pct = Math.round((item.amount / totalNetWorth) * 100);
      return `
        <div class="list-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700;">
            <span>${item.icon} ${escapeHtml(item.label)}</span>
            <span>${escapeHtml(money(item.amount))} <small style="font-weight:normal; color:var(--muted)">(${pct}%)</small></span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${pct}%; background-color:${item.color};"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderCategoryBreakdown(entries) {
  const container = document.getElementById("categoryBreakdownList");
  if (!container) return;

  const totals = (entries || [])
    .filter((entry) => entry.type === "expense")
    .reduce((groups, entry) => {
      const cat = entry.category || "Other";
      groups[cat] = (groups[cat] || 0) + Number(entry.amount || 0);
      return groups;
    }, {});

  const totalExpense = Object.values(totals).reduce((a, b) => a + b, 0);
  if (totalExpense <= 0) {
    container.innerHTML = `<div class="list-row"><span>No expense categories yet</span><strong>0</strong></div>`;
    return;
  }

  const palette = [
    "var(--teal)", "var(--blue)", "var(--amber)", "var(--red)", "var(--green)", "#8b5cf6", "#ec4899", "#f97316"
  ];

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount], idx) => {
      const pct = Math.round((amount / totalExpense) * 100);
      const color = palette[idx % palette.length];
      return `
        <div class="list-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700;">
            <span style="display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}"></span>${escapeHtml(cat)}</span>
            <span>${escapeHtml(money(amount))} <small style="font-weight:normal; color:var(--muted)">(${pct}%)</small></span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${pct}%; background-color:${color};"></div>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = rows;
}

function calculateForecast(entries) {
  const months = groupByMonth(entries, (entry) => Number(entry.amount || 0) * (entry.type === "income" ? 1 : -1));
  const ordered = Object.keys(months).sort();

  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  let running = totalOpeningBalance;
  const balances = [];

  ordered.forEach((month) => {
    running += months[month];
    balances.push({ month, balance: running, net: months[month] });
  });

  return balances;
}

function groupByMonth(source, amountFn) {
  return source.reduce((groups, entry) => {
    const month = DateUtils.getMonthKey(entry.date);
    if (month) {
      groups[month] = (groups[month] || 0) + amountFn(entry);
    }
    return groups;
  }, {});
}

function renderBalanceChart(forecast) {
  const chart = document.getElementById("balanceChart");
  if (!chart) return;
  
  if (!forecast.length) {
    chart.innerHTML = `<div style="padding: 24px; color: var(--muted); text-align: center; width: 100%;">No forecast data available</div>`;
    return;
  }

  const maxAbs = Math.max(...forecast.map((item) => Math.abs(item.balance)), 1);

  const allEntries = forecastEntries();
  const monthlyIncomes = groupByMonth(allEntries, (e) => (e.type === "income" ? Number(e.amount || 0) : 0));
  const monthlyExpenses = groupByMonth(allEntries, (e) => (e.type === "expense" ? Number(e.amount || 0) : 0));

  chart.innerHTML = forecast
    .map((item) => {
      const height = Math.max(8, Math.round((Math.abs(item.balance) / maxAbs) * 210));
      const label = DateUtils.getShortMonth(item.month);
      const isNegative = item.balance < 0;
      const tone = isNegative ? "negative" : "";
      
      const income = monthlyIncomes[item.month] || 0;
      const expense = monthlyExpenses[item.month] || 0;
      const net = item.net || (income - expense);

      const tooltipText = `${item.month}\n• Projected Balance: ${money(item.balance)}\n• Net Month Change: ${net >= 0 ? "+" : ""}${money(net)}\n• Income: +${money(income)}\n• Expenses: -${money(expense)}`;

      return `
        <div class="bar-wrap" data-month="${escapeHtml(item.month)}" title="${escapeHtml(tooltipText)}">
          <div class="bar-value-preview ${tone}">${money(item.balance)}</div>
          <div class="bar ${tone}" style="height:${height}px"></div>
          <span>${escapeHtml(label)}</span>
        </div>
      `;
    })
    .join("");

  const rangeEl = document.getElementById("forecastRange");
  if (rangeEl) {
    const range = forecast.length ? `${forecast[0].month} to ${forecast[forecast.length - 1].month}` : "No entries";
    rangeEl.textContent = range;
  }
}

function getDeficitPeriods(entries = forecastEntries()) {
  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const sorted = [...entries]
    .filter((e) => e.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let running = totalOpeningBalance;
  const periods = [];
  let currentPeriod = null;

  sorted.forEach((entry) => {
    const delta = Number(entry.amount || 0) * (entry.type === "income" ? 1 : -1);
    running += delta;

    if (running < 0) {
      if (!currentPeriod) {
        // Exact day balance turns negative
        currentPeriod = {
          startDate: entry.date,
          startAmount: running,
          initialTrigger: entry.category || (entry.type === "income" ? "Income adjustment" : "Expense"),
          initialEntry: entry,
          lowestBalance: running,
          lowestDate: entry.date,
          lowestEntry: entry,
          resolvedDate: null,
          resolvedBy: null,
          isResolved: false,
          daysInDeficit: 0,
          steps: [
            {
              date: entry.date,
              type: entry.type,
              category: entry.category || "Expense",
              amount: Number(entry.amount || 0),
              balance: running,
              delta,
              entryId: getEntryId(entry)
            }
          ]
        };
        periods.push(currentPeriod);
      } else {
        // Consequent day still negative
        if (running < currentPeriod.lowestBalance) {
          currentPeriod.lowestBalance = running;
          currentPeriod.lowestDate = entry.date;
          currentPeriod.lowestEntry = entry;
        }
        currentPeriod.steps.push({
          date: entry.date,
          type: entry.type,
          category: entry.category || "Expense",
          amount: Number(entry.amount || 0),
          balance: running,
          delta,
          entryId: getEntryId(entry)
        });
      }
    } else {
      // Balance is non-negative (>= 0)
      if (currentPeriod) {
        // Income fixed the negative balance
        currentPeriod.isResolved = true;
        currentPeriod.resolvedDate = entry.date;
        currentPeriod.resolvedBy = entry.category || (entry.type === "income" ? "Income" : "Adjustment");
        currentPeriod.resolvedEntry = entry;
        currentPeriod.daysInDeficit = DateUtils.daysBetween(currentPeriod.startDate, currentPeriod.resolvedDate);
        currentPeriod.steps.push({
          date: entry.date,
          type: entry.type,
          category: entry.category || "Income",
          amount: Number(entry.amount || 0),
          balance: running,
          delta,
          isRecoveryStep: true,
          entryId: getEntryId(entry)
        });
        currentPeriod = null;
      }
    }
  });

  // For any unresolved periods, calculate days up to the last recorded date
  periods.forEach((p) => {
    if (!p.isResolved) {
      const lastStepDate = p.steps.length ? p.steps[p.steps.length - 1].date : p.startDate;
      p.daysInDeficit = DateUtils.daysBetween(p.startDate, lastStepDate);
    }
  });

  return periods;
}

function renderWarnings(forecast) {
  const periods = getDeficitPeriods(forecastEntries());
  const list = document.getElementById("forecastWarnings");
  if (!list) return;

  if (!periods.length) {
    list.innerHTML = `<div class="list-row success-row"><span>Cashflow is covered</span><strong>No deficit</strong></div>`;
    return;
  }

  list.innerHTML = periods
    .slice(0, 5)
    .map((p) => {
      const startFmt = DateUtils.formatDisplayDate(p.startDate);
      const endFmt = p.resolvedDate ? DateUtils.formatDisplayDate(p.resolvedDate) : "Ongoing";
      const subtitle = p.isResolved
        ? `Deficit on ${startFmt} (${escapeHtml(p.initialTrigger)}) · Fixed on ${endFmt} by ${escapeHtml(p.resolvedBy)}`
        : `Deficit on ${startFmt} (${escapeHtml(p.initialTrigger)}) · Stays negative`;
      return `
        <div class="list-row danger-row">
          <span>
            <strong style="font-size:13.5px;">${escapeHtml(startFmt)} → ${escapeHtml(endFmt)}</strong>
            <span style="font-size:11px; margin-left:6px; color:var(--muted)">(${p.daysInDeficit}d)</span><br>
            <small style="color:var(--muted)">${subtitle}</small>
          </span>
          <strong style="color:var(--red); font-size:14px;">${escapeHtml(money(p.lowestBalance))}</strong>
        </div>
      `;
    })
    .join("");
}

function renderExpenseMix(entries) {
  const totals = entries
    .filter((entry) => entry.type === "expense")
    .reduce((groups, entry) => {
      const cat = entry.category || "Uncategorized";
      groups[cat] = (groups[cat] || 0) + entry.amount;
      return groups;
    }, {});

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, total]) => `<div class="list-row"><span>${escapeHtml(category)}</span><strong>${escapeHtml(money(total))}</strong></div>`)
    .join("");

  const el = document.getElementById("expenseList");
  if (el) el.innerHTML = rows || `<div class="list-row"><span>No expenses yet</span><strong>0</strong></div>`;
}

function getDeficitSummary() {
  const forecastMonths = calculateForecast(forecastEntries()).filter((item) => item.balance < 0);
  const deficitPeriods = getDeficitPeriods(forecastEntries());
  const today = DateUtils.todayString();
  const overdueItems = getForecastCandidateEntries()
    .filter((entry) => entry.date && entry.date < today)
    .map((entry) => {
      const isPartial = isPartialTracked(entry);
      const remaining = isPartial ? getRemainingForecastAmount(entry) : Number(entry.amount || 0);
      const settled = isPartial ? remaining <= 0 : getEntryActualAmount(entry) > 0;
      return { entry, remaining, settled, daysOverdue: DateUtils.daysBetween(entry.date, today) };
    })
    .filter((item) => !item.settled)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const realized = actualizedEntries().filter((entry) => entry.date && entry.date <= today);
  const months = groupByMonth(realized, (entry) => {
    const actualAmount = getEntryActualAmount(entry);
    if (!actualAmount) return 0;
    return entry.type === "income" ? actualAmount : -actualAmount;
  });
  const ordered = Object.keys(months).sort();
  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  let running = totalOpeningBalance;
  const actualMonths = [];
  ordered.forEach((month) => {
    running += months[month];
    if (running < 0) actualMonths.push({ month, balance: running, net: months[month] });
  });

  return { forecastMonths, deficitPeriods, overdueItems, actualMonths };
}

function renderDeficitBanner(summary) {
  const banner = document.getElementById("deficitBanner");
  if (!banner) return;
  const { forecastMonths, deficitPeriods, overdueItems, actualMonths } = summary;
  const hasAny = (deficitPeriods && deficitPeriods.length) || forecastMonths.length || overdueItems.length || actualMonths.length;

  if (!hasAny) {
    banner.hidden = true;
    return;
  }

  const parts = [];
  if (deficitPeriods && deficitPeriods.length) {
    const firstPeriod = deficitPeriods[0];
    const durStr = firstPeriod.daysInDeficit > 0 ? ` (${firstPeriod.daysInDeficit} days negative)` : "";
    const deficitAmt = money(firstPeriod.startAmount || firstPeriod.lowestBalance);
    parts.push(`Balance turns negative on ${DateUtils.formatDisplayDate(firstPeriod.startDate)}${durStr} · First deficit: ${deficitAmt}`);
  } else if (forecastMonths.length) {
    parts.push(`${forecastMonths.length} month${forecastMonths.length === 1 ? "" : "s"} projected negative (First deficit: ${money(forecastMonths[0].balance)})`);
  }

  if (overdueItems.length) parts.push(`${overdueItems.length} item${overdueItems.length === 1 ? "" : "s"} overdue`);
  if (actualMonths.length) parts.push(`${actualMonths.length} past month${actualMonths.length === 1 ? "" : "s"} with an actual shortfall`);

  banner.hidden = false;
  const summaryEl = document.getElementById("deficitBannerSummary");
  if (summaryEl) summaryEl.textContent = parts.join(" · ");
}

function renderDeficits(summary) {
  const { forecastMonths, deficitPeriods, overdueItems, actualMonths } = summary;

  const fcEl = document.getElementById("deficitForecastCount");
  if (fcEl) {
    const totalPeriods = deficitPeriods ? deficitPeriods.length : forecastMonths.length;
    fcEl.textContent = String(totalPeriods);
  }

  const fcNoteEl = document.getElementById("deficitForecastNote");
  if (fcNoteEl) {
    if (deficitPeriods && deficitPeriods.length) {
      const totalDays = deficitPeriods.reduce((s, p) => s + (p.daysInDeficit || 0), 0);
      fcNoteEl.textContent = `${deficitPeriods.length} spell${deficitPeriods.length === 1 ? "" : "s"} (${totalDays} days in deficit)`;
    } else {
      fcNoteEl.textContent = "Balance stays positive";
    }
  }

  const odEl = document.getElementById("deficitOverdueCount");
  if (odEl) odEl.textContent = String(overdueItems.length);

  const acEl = document.getElementById("deficitActualCount");
  if (acEl) acEl.textContent = String(actualMonths.length);

  const forecastList = document.getElementById("deficitForecastList");
  if (forecastList) {
    if (!deficitPeriods || !deficitPeriods.length) {
      forecastList.innerHTML = `<div class="list-row success-row"><span>No forecasted deficit</span><strong>Balance stays positive</strong></div>`;
    } else {
      forecastList.innerHTML = deficitPeriods
        .map((p) => {
          const startFmt = DateUtils.formatDisplayDate(p.startDate);
          const endFmt = p.resolvedDate ? DateUtils.formatDisplayDate(p.resolvedDate) : "Ongoing (Unresolved)";
          const badgeClass = p.isResolved ? "resolved" : "active";
          const badgeLabel = p.isResolved ? `Fixed in ${p.daysInDeficit}d` : `Active Deficit`;

          const stepsHtml = p.steps
            .map((s) => {
              const isRecovery = s.isRecoveryStep;
              const isLowest = s.date === p.lowestDate && !isRecovery;
              const rowClass = isRecovery ? "recovery" : (isLowest ? "worst" : "");
              const sign = s.delta >= 0 ? "+" : "-";
              const note = isRecovery
                ? `Fixed by ${escapeHtml(s.category)}`
                : (isLowest ? `Lowest point reached (${escapeHtml(s.category)})` : escapeHtml(s.category));

              return `
                <div class="deficit-step-item ${rowClass}">
                  <span>
                    <strong>${escapeHtml(DateUtils.formatDisplayDate(s.date))}</strong>: 
                    ${escapeHtml(note)} (${sign}${money(s.amount)})
                  </span>
                  <strong style="color:${s.balance < 0 ? "var(--red)" : "var(--green)"}">${escapeHtml(money(s.balance))}</strong>
                </div>
              `;
            })
            .join("");

          const resolutionSummary = p.isResolved
            ? `Turns negative on <strong>${escapeHtml(startFmt)}</strong> (${escapeHtml(p.initialTrigger)}) → Fixed on <strong>${escapeHtml(endFmt)}</strong> by <strong>${escapeHtml(p.resolvedBy)}</strong>`
            : `Turns negative on <strong>${escapeHtml(startFmt)}</strong> (${escapeHtml(p.initialTrigger)}) and remains negative`;

          const bridgeAmount = Math.ceil(Math.abs(p.lowestBalance));
          return `
            <div class="deficit-period-card">
              <div class="deficit-period-header">
                <div>
                  <div class="deficit-dates-title">
                    <span>${escapeHtml(startFmt)} → ${escapeHtml(endFmt)}</span>
                    <span class="deficit-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
                  </div>
                  <small style="color:var(--muted); margin-top: 5px; display: block; line-height: 1.4;">${resolutionSummary}</small>
                </div>
                <div style="text-align: right; min-width: 130px;">
                  <strong style="color:var(--red); font-size:16px;">${escapeHtml(money(p.lowestBalance))}</strong>
                  <small style="display:block; color:var(--muted); font-size:11px; margin-bottom: 4px;">Peak deficit</small>
                  <button class="ghost-button bridge-loan-btn" data-bridge-amount="${bridgeAmount}" data-bridge-date="${escapeHtml(p.startDate)}" type="button" style="font-size:11.5px; padding: 4px 9px;">
                    💳 Bridge with Loan
                  </button>
                </div>
              </div>

              <div class="deficit-steps-timeline">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); letter-spacing: 0.5px; margin-bottom: 2px;">
                  Daily Deficit Progression:
                </div>
                ${stepsHtml}
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  const overdueList = document.getElementById("deficitOverdueList");
  if (overdueList) {
    overdueList.innerHTML = overdueItems.length
      ? overdueItems
          .map(
            (item) => `
              <div class="list-row danger-row deficit-row">
                <span>
                  <strong>${escapeHtml(item.entry.category)}</strong><br>
                  <small>Due ${escapeHtml(item.entry.date)}</small>
                </span>
                <div class="deficit-meta">
                  <span class="overdue-pill">${item.daysOverdue}d overdue</span>
                  <strong>${escapeHtml(money(item.remaining))}</strong>
                  <button class="settle-button" data-settle-id="${escapeHtml(getEntryId(item.entry))}" data-settle-amount="${item.remaining}" type="button">Mark Paid</button>
                </div>
              </div>
            `
          )
          .join("")
      : `<div class="list-row success-row"><span>Nothing overdue</span><strong>All settled</strong></div>`;
  }

  const actualList = document.getElementById("deficitActualList");
  if (actualList) {
    actualList.innerHTML = actualMonths.length
      ? actualMonths
          .map(
            (item) => `
              <div class="list-row danger-row">
                <span><strong>${escapeHtml(item.month)}</strong></span>
                <strong style="color:var(--red); font-size:14px;">${escapeHtml(money(item.balance))}</strong>
              </div>
            `
          )
          .join("")
      : `<div class="list-row success-row"><span>No actual shortfall on record</span><strong>Realized balance stayed positive</strong></div>`;
  }
}

// --- Category Budget Caps Renderer ---
function renderCategoryCaps() {
  const container = document.getElementById("categoryCapsList");
  if (!container) return;

  if (!categoryCaps.length) {
    container.innerHTML = `<div class="list-row"><span>No budget caps set</span><strong>Click "Set cap"</strong></div>`;
    return;
  }

  const currentMonth = DateUtils.currentYearMonth();
  const currentMonthEntries = forecastEntries().filter(
    (e) => e.type === "expense" && DateUtils.getMonthKey(e.date) === currentMonth
  );

  container.innerHTML = categoryCaps
    .map((item, index) => {
      const spent = currentMonthEntries
        .filter((e) => (e.category || "").toLowerCase() === (item.category || "").toLowerCase())
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const cap = Number(item.cap || 0);
      const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
      const spentRatio = cap > 0 ? spent / cap : 0;
      const barColor = smartColor(spentRatio);

      return `
        <div class="list-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span><strong>${escapeHtml(item.category)}</strong> <small>(${money(spent)} / ${money(cap)})</small></span>
            <button class="delete-button" data-cap-delete="${index}" type="button">Delete</button>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${pct}%; background-color:${barColor};"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

// --- Savings Goals Renderer ---
function renderSavingsGoals() {
  const container = document.getElementById("savingsGoalsList");
  if (!container) return;

  if (!savingsGoals.length) {
    container.innerHTML = `<div class="list-row"><span>No savings goals yet</span><strong>Click "Add goal"</strong></div>`;
    return;
  }

  container.innerHTML = savingsGoals
    .map((goal, index) => {
      const target = Number(goal.target || 0);
      const current = Number(goal.current || 0);
      const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

      return `
        <div class="list-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span><strong>${escapeHtml(goal.name)}</strong> <small>(${money(current)} of ${money(target)})</small></span>
            <button class="delete-button" data-goal-delete="${index}" type="button">Delete</button>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${pct}%;"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

// --- CSV Exporter ---
function exportToCSV() {
  const allEntries = [...cashEntries, ...archivedEntries];
  if (!allEntries.length) {
    alert("No entries to export.");
    return;
  }

  const headers = ["Date", "Category", "Account", "Type", "Source", "Planned Amount (EGP)", "Actual Amount (EGP)"];
  const rows = allEntries.map((e) => [
    `"${e.date || ""}"`,
    `"${e.category || ""}"`,
    `"${e.account || ""}"`,
    `"${e.type || ""}"`,
    `"${e.source || ""}"`,
    Number(e.amount || 0),
    getEntryActualAmount(e)
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `budget-control-export-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderCashflowSummary() {
  const fromInput = document.getElementById("cfSummaryFrom");
  const toInput = document.getElementById("cfSummaryTo");
  const from = fromInput && fromInput.value ? fromInput.value : null;
  const to = toInput && toInput.value ? toInput.value : null;

  const allForecastEntries = forecastEntries();

  const entries = allForecastEntries.filter((entry) => {
    if (!entry.date) return true;
    if (from && entry.date < from) return false;
    if (to && entry.date > to) return false;
    return true;
  });

  const income = entries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const expenses = entries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const dated = entries.filter((entry) => entry.date).map((entry) => entry.date).sort();

  const incEl = document.getElementById("cfSummaryIncome");
  if (incEl) incEl.textContent = money(income);

  const expEl = document.getElementById("cfSummaryExpenses");
  if (expEl) expEl.textContent = money(expenses);

  const netEl = document.getElementById("cfSummaryNet");
  if (netEl) {
    netEl.textContent = money(income - expenses);
    netEl.classList.toggle("danger-text", income - expenses < 0);
  }

  const cntEl = document.getElementById("cfSummaryCount");
  if (cntEl) cntEl.textContent = String(entries.length);

  const rngEl = document.getElementById("cfSummaryRange");
  if (rngEl) rngEl.textContent = dated.length ? `${dated[0]} to ${dated[dated.length - 1]}` : "No entries";

  const periodNote = document.getElementById("cfPeriodNote");
  if (periodNote) {
    periodNote.textContent = from || to ? `${from || "start"} to ${to || "end"}` : "Full forecast list";
  }

  renderExpenseMix(allForecastEntries);
}

function canDeleteEntry(entry) {
  return !entry.locked && entry.source !== "starting balance";
}

function isEditableEntry(entry) {
  return !entry.locked;
}

function findEntryById(entryId) {
  const fromCash = cashEntries.find((entry) => getEntryId(entry) === entryId);
  if (fromCash) return fromCash;
  return [...openingBalanceEntries(), ...getForecastCandidateEntries()].find((entry) => getEntryId(entry) === entryId) || null;
}

function renderEntries() {
  const table = document.getElementById("entriesTable");
  if (!table) return;

  const typeFilterEl = document.getElementById("typeFilter");
  const typeFilter = typeFilterEl ? typeFilterEl.value : "all";

  const categoryFilterEl = document.getElementById("categoryFilter");
  const categoryFilter = categoryFilterEl ? categoryFilterEl.value : "all";

  const searchEl = document.getElementById("searchEntries");
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";

  const matchesFilters = (entry) =>
    (typeFilter === "all" || entry.type === typeFilter) &&
    (categoryFilter === "all" || entry.category === categoryFilter) &&
    (!search || (entry.category || "").toLowerCase().includes(search));

  const openingRows = openingBalanceEntries().filter(matchesFilters);
  const forecastRows = getForecastCandidateEntries()
    .filter((entry) => {
      const actualAmount = getEntryActualAmount(entry);
      if (actualAmount <= 0) return true;
      return isPartialTracked(entry) && getRemainingForecastAmount(entry) > 0;
    })
    .map((entry) => {
      const actualAmount = getEntryActualAmount(entry);
      const remainingAmount = isPartialTracked(entry) && actualAmount > 0
        ? getRemainingForecastAmount(entry)
        : Number(entry.amount || 0);
      return {
        ...entry,
        originalPlannedAmount: Number(entry.amount || 0),
        amount: remainingAmount,
        remainingAmount: remainingAmount
      };
    })
    .filter(matchesFilters)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const filtered = [...openingRows, ...forecastRows];

  const deficitPeriods = getDeficitPeriods(forecastEntries());
  const entryStatusMap = new Map();
  deficitPeriods.forEach((period) => {
    (period.steps || []).forEach((step) => {
      if (step.entryId) {
        if (step.isRecoveryStep) {
          entryStatusMap.set(step.entryId, { type: "recovery", balance: step.balance });
        } else {
          entryStatusMap.set(step.entryId, { type: "deficit", balance: step.balance });
        }
      }
    });
  });

  if (categoryFilterEl) {
    const allCategories = [...new Set([...openingBalanceEntries(), ...getForecastCandidateEntries()].map((entry) => entry.category))].sort();
    const previousValue = categoryFilterEl.value;
    categoryFilterEl.innerHTML = `<option value="all">All categories</option>${allCategories
      .map((category) => `<option value="${escapeHtml(category)}"${category === previousValue ? " selected" : ""}>${escapeHtml(category)}</option>`)
      .join("")}`;
  }

  table.innerHTML = filtered
    .map((entry) => {
      const isOpeningBalance = entry.source === "starting balance";
      const deleteKey = getEntryId(entry);
      const canDelete = canDeleteEntry(entry);
      const actualValue = getEntryActualAmount(entry);
      const editable = isEditableEntry(entry);
      const clickable = editable || isOpeningBalance;
      const isLoan = isLoanInflow(entry);
      const remainingAmt = entry.remainingAmount !== undefined ? entry.remainingAmount : getRemainingForecastAmount(entry);
      const isPastDate = entry.date && entry.date < DateUtils.todayString();
      const canFinish = isLoan && !entry.isClosed && remainingAmt > 0;

      const finishAction = canFinish
        ? `<button class="ghost-button finish-loan-btn" data-finish-loan-key="${escapeHtml(deleteKey)}" type="button" style="font-size:11px; padding:3px 8px; color:var(--green); border-color:var(--green); margin-right:4px;" title="Finish taking draws and close loan facility at current drawn amount">✓ Finish</button>`
        : "";
      const action = !deleteKey || !canDelete ? "" : `${finishAction}<button class="delete-button" data-delete-key="${escapeHtml(deleteKey)}" type="button">Delete</button>`;

      const inputPlaceholder = isLoan ? "Add draw" : entry.type === "income" ? "Add actual" : "Add spend";
      const progressLabel = isLoan
        ? `Drawn so far: ${escapeHtml(money(actualValue))} (Remaining: ${escapeHtml(money(remainingAmt))})`
        : `Spent so far: ${escapeHtml(money(actualValue))} (Remaining: ${escapeHtml(money(remainingAmt))})`;

      const actualCell = editable
        ? `<div>
            <input class="inline-actual-input" data-entry-actual-input="${escapeHtml(deleteKey)}" type="number" min="0" step="0.01" value="" placeholder="${escapeHtml(inputPlaceholder)}">
            ${actualValue > 0 ? `<small style="display:block;color:var(--muted);margin-top:4px;white-space:nowrap;">${progressLabel}</small>` : ""}
          </div>`
        : `<span>${actualValue > 0 ? escapeHtml(money(actualValue)) : "—"}</span>`;
      const dateCell = isPastDate && isLoan && remainingAmt > 0
        ? `<span>${escapeHtml(entry.date)} <span class="source-pill loan" style="font-size:10px; margin-left:4px; padding:1px 6px;" title="Undrawn balance carried forward">Ongoing</span></span>`
        : escapeHtml(entry.date);

      const statusInfo = !isOpeningBalance ? entryStatusMap.get(deleteKey) : null;
      const isDeficit = statusInfo && statusInfo.type === "deficit";
      const isRecovery = statusInfo && statusInfo.type === "recovery";

      let rowClass = "entry-row";
      let rowTitle = isOpeningBalance ? "Edit on the Accounts page" : "";
      let statusBadge = "";

      if (isOpeningBalance) {
        rowClass += " opening-balance-row";
      } else if (isDeficit) {
        rowClass += " deficit-entry-row danger-row";
        rowTitle = `Deficit spell: Projected cash balance ${money(statusInfo.balance)}`;
        statusBadge = `<span class="deficit-badge active" style="margin-left: 6px; font-size: 10px; vertical-align: middle;">Deficit</span>`;
      } else if (isRecovery) {
        rowClass += " recovery-entry-row success-row";
        rowTitle = `Recovery: Projected cash balance recovered to ${money(statusInfo.balance)}`;
        statusBadge = `<span class="deficit-badge resolved" style="margin-left: 6px; font-size: 10px; vertical-align: middle;">Recovery</span>`;
      }

      return `
        <tr data-entry-id="${escapeHtml(deleteKey)}" class="${rowClass}" style="cursor:${clickable ? "pointer" : "default"};" title="${escapeHtml(rowTitle)}">
          <td>${dateCell}</td>
          <td>${escapeHtml(entry.category)}${statusBadge}</td>
          <td>${escapeHtml(entry.account || "cash")}</td>
          <td><span class="pill ${escapeHtml(entry.type)}">${escapeHtml(entry.type)}</span></td>
          <td><span class="source-pill ${entry.source === "loan" ? "loan" : ""}">${escapeHtml(entry.source || "manual")}</span></td>
          <td class="number">${escapeHtml(money(entry.amount))}</td>
          <td class="number">${actualCell}</td>
          <td class="number">${action}</td>
        </tr>
      `;
    })
    .join("");

  renderCashflowSummary();
}

function syncSalaryPeriodControls() {
  syncForecastPeriodSettings();
  const startInput = document.getElementById("salaryPeriodStart");
  const quartersInput = document.getElementById("salaryPeriodQuarters");
  if (startInput && !startInput.value) startInput.value = forecastStartMonth;
  if (quartersInput && !quartersInput.value) quartersInput.value = String(forecastQuarters);
}

function renderSalarySchedule() {
  syncSalaryPeriodControls();
  const schedule = document.getElementById("salarySchedule");
  if (!schedule) return;
  const quarterTotal = salaryPattern.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if (!salaryPattern.length) {
    schedule.innerHTML = `<div class="list-row"><span>No salary payments yet</span><strong>Click "Add payment"</strong></div>`;
    const totEl = document.getElementById("salaryQuarterTotal");
    if (totEl) totEl.textContent = money(0);
    return;
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const anchorIndex = monthIndexFromYearMonth(salaryAnchorMonth || DateUtils.currentYearMonth());
  const groupMonthsLabel = (offset) => {
    let firstMatch = anchorIndex;
    while (groupPhaseForMonthIndex(firstMatch) !== offset) firstMatch += 1;
    const months = [0, 1, 2, 3].map((q) => monthNames[((firstMatch + q * 3) % 12 + 12) % 12]);
    return months.join(", ");
  };

  schedule.innerHTML = salaryPattern
    .map((payment, index) => `
      <article class="salary-card">
        <div class="asset-heading">
          <small>Payment ${index + 1} — ${escapeHtml(groupMonthsLabel(Number(payment.monthOffset) || 0))}</small>
          <button class="delete-button" data-salary-delete="${index}" type="button">Delete</button>
        </div>
        <div class="inline-fields" style="grid-template-columns: 60px 56px 1fr;">
          <label>
            Group
            <select data-salary-index="${index}" data-salary-field="monthOffset">
              <option value="0"${Number(payment.monthOffset) === 0 ? " selected" : ""}>G1</option>
              <option value="1"${Number(payment.monthOffset) === 1 ? " selected" : ""}>G2</option>
              <option value="2"${Number(payment.monthOffset) === 2 ? " selected" : ""}>G3</option>
            </select>
          </label>
          <label>
            Day
            <input data-salary-index="${index}" data-salary-field="day" type="number" min="1" max="31" value="${payment.day}">
          </label>
          <label>
            Amount
            <input data-salary-index="${index}" data-salary-field="amount" type="number" min="0" step="100" value="${payment.amount}">
          </label>
        </div>
      </article>
    `)
    .join("");

  const totEl = document.getElementById("salaryQuarterTotal");
  if (totEl) totEl.textContent = money(quarterTotal);
}

const frequencyLabels = {
  1: "monthly",
  2: "every 2 months",
  3: "quarterly",
  6: "semi-annually",
  12: "annually"
};

function frequencyLabel(frequency) {
  return frequencyLabels[Number(frequency) || 1] || `every ${Number(frequency) || 1} months`;
}

function renderInstallments() {
  const list = document.getElementById("installmentList");
  if (!list) return;
  if (!installments.length) {
    list.innerHTML = `<div class="list-row"><span>No installments planned</span><strong>0</strong></div>`;
    return;
  }

  list.innerHTML = installments
    .map((item, index) => `
      <div class="list-row">
        <span>${escapeHtml(item.name)}<br><small>${escapeHtml(money(item.amount))} ${escapeHtml(frequencyLabel(item.frequency))} from ${escapeHtml(item.startMonth)} for ${item.months} payments</small></span>
        <div class="deficit-meta">
          <button class="ghost-button" data-installment-edit="${index}" type="button">Edit</button>
          <button class="delete-button" data-installment-delete="${index}" type="button">Delete</button>
        </div>
      </div>
    `)
    .join("");
}

async function commitEntryActualInput(input) {
  if (!input) return;
  const entryId = input.dataset.entryActualInput;
  const entry = findEntryById(entryId);
  if (!entry || !isEditableEntry(entry)) return;

  const typedAmount = input.value === "" ? 0 : Math.round(Number(input.value) || 0);
  input.value = "";

  if (typedAmount > 0) {
    const previousActual = getEntryActualAmount(entry);
    const newActual = previousActual + typedAmount;
    setEntryActualAmount(entry, newActual);

    renderAll();

    const selectedAcc = await promptAccountAdjustment(entry.type || "expense", typedAmount, entry.account || "cash", entry.category || "");
    if (selectedAcc) {
      adjustAccountBalance(selectedAcc, typedAmount, entry.type || "expense");
      renderAll();
    }

    if (entry.source === "loan" && entry.type === "income") {
      await handleLoanRepaymentAdjustmentPrompt(entry, newActual);
    }
  } else {
    renderAll();
  }
}

function findHistoryEntry(entryId) {
  const active = findEntryById(entryId);
  if (active) return { entry: active, isArchived: false };
  const archivedIndex = archivedEntries.findIndex((e) => getEntryId(e) === entryId);
  if (archivedIndex !== -1) return { entry: archivedEntries[archivedIndex], isArchived: true, archivedIndex };
  return { entry: null, isArchived: false, archivedIndex: -1 };
}

function renderHistory() {
  const table = document.getElementById("historyTable");
  const detailsTable = document.getElementById("historyEntriesTable");
  if (!table || !detailsTable) return;

  const actualEntries = actualizedEntries();

  // 1. Monthly Summary Calculation
  const months = new Set();
  actualEntries.forEach((entry) => {
    const key = DateUtils.getMonthKey(entry.date);
    if (key) months.add(key);
  });
  const orderedMonths = [...months].sort();

  let totalLifetimeIncome = 0;
  let totalLifetimeExpenses = 0;

  const rows = orderedMonths.map((month) => {
    const monthlyEntries = actualEntries.filter((entry) => DateUtils.getMonthKey(entry.date) === month);
    const income = monthlyEntries
      .filter((entry) => entry.type === "income")
      .reduce((sum, entry) => sum + getEntryActualAmount(entry), 0);
    const expenses = monthlyEntries
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + getEntryActualAmount(entry), 0);
    const net = income - expenses;
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

    totalLifetimeIncome += income;
    totalLifetimeExpenses += expenses;

    const rateBadgeClass = savingsRate >= 20 ? "favorable" : savingsRate >= 0 ? "neutral" : "unfavorable";

    return `
      <tr>
        <td><strong>${escapeHtml(month)}</strong></td>
        <td class="number" style="color: var(--green); font-weight: 600;">+${escapeHtml(money(income))}</td>
        <td class="number" style="color: var(--red); font-weight: 600;">-${escapeHtml(money(expenses))}</td>
        <td class="number" style="font-weight: 700; color: ${net >= 0 ? "var(--green)" : "var(--red)"};">${net >= 0 ? "+" : ""}${escapeHtml(money(net))}</td>
        <td class="number"><span class="variance-pill ${rateBadgeClass}">${savingsRate}%</span></td>
      </tr>
    `;
  });

  table.innerHTML = rows.join("") || `<tr><td colspan="5">No actual activity yet</td></tr>`;

  // Lifetime metrics
  const totalLifetimeNet = totalLifetimeIncome - totalLifetimeExpenses;
  const lifetimeSavingsRate = totalLifetimeIncome > 0 ? Math.round((totalLifetimeNet / totalLifetimeIncome) * 100) : 0;

  const lifetimeIncomeEl = document.getElementById("historyLifetimeIncome");
  if (lifetimeIncomeEl) lifetimeIncomeEl.textContent = money(totalLifetimeIncome);

  const lifetimeExpensesEl = document.getElementById("historyLifetimeExpenses");
  if (lifetimeExpensesEl) lifetimeExpensesEl.textContent = money(totalLifetimeExpenses);

  const lifetimeNetEl = document.getElementById("historyLifetimeNet");
  if (lifetimeNetEl) lifetimeNetEl.textContent = money(totalLifetimeNet);

  const lifetimeRateEl = document.getElementById("historySavingsRate");
  if (lifetimeRateEl) lifetimeRateEl.textContent = `${lifetimeSavingsRate}%`;

  // 2. Individual Validations Tab: Populate filter dropdowns
  const monthFilterEl = document.getElementById("historyMonthFilter");
  if (monthFilterEl) {
    const prevMonthVal = monthFilterEl.value || "all";
    const allMonths = [...months].sort().reverse();
    monthFilterEl.innerHTML = `<option value="all">All months</option>${allMonths
      .map((m) => `<option value="${escapeHtml(m)}"${m === prevMonthVal ? " selected" : ""}>${escapeHtml(m)}</option>`)
      .join("")}`;
  }

  const accountFilterEl = document.getElementById("historyAccountFilter");
  if (accountFilterEl) {
    const prevAccVal = accountFilterEl.value || "all";
    const allAccounts = [...new Set(actualEntries.map((e) => e.account || "cash"))].sort();
    accountFilterEl.innerHTML = `<option value="all">All accounts</option>${allAccounts
      .map((acc) => `<option value="${escapeHtml(acc)}"${acc === prevAccVal ? " selected" : ""}>${escapeHtml(acc.toUpperCase())}</option>`)
      .join("")}`;
  }

  // Filter criteria
  const selectedMonth = monthFilterEl ? monthFilterEl.value : "all";
  const typeFilterEl = document.getElementById("historyTypeFilter");
  const selectedType = typeFilterEl ? typeFilterEl.value : "all";
  const selectedAccount = accountFilterEl ? accountFilterEl.value : "all";
  const searchEl = document.getElementById("historySearch");
  const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : "";

  const filteredEntries = actualEntries.filter((entry) => {
    const entryMonth = DateUtils.getMonthKey(entry.date);
    if (selectedMonth !== "all" && entryMonth !== selectedMonth) return false;
    if (selectedType !== "all" && entry.type !== selectedType) return false;
    if (selectedAccount !== "all" && (entry.account || "cash").toLowerCase() !== selectedAccount.toLowerCase()) return false;
    if (searchTerm) {
      const cat = (entry.category || "").toLowerCase();
      const acc = (entry.account || "").toLowerCase();
      const src = (entry.source || "").toLowerCase();
      if (!cat.includes(searchTerm) && !acc.includes(searchTerm) && !src.includes(searchTerm)) return false;
    }
    return true;
  });

  // Sort newest first
  filteredEntries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // Calculate filtered summary
  const filteredIncome = filteredEntries
    .filter((e) => e.type === "income")
    .reduce((sum, e) => sum + getEntryActualAmount(e), 0);
  const filteredExpenses = filteredEntries
    .filter((e) => e.type === "expense")
    .reduce((sum, e) => sum + getEntryActualAmount(e), 0);
  const filteredNet = filteredIncome - filteredExpenses;

  const fIncomeEl = document.getElementById("historyFilteredIncome");
  if (fIncomeEl) fIncomeEl.textContent = money(filteredIncome);

  const fExpensesEl = document.getElementById("historyFilteredExpenses");
  if (fExpensesEl) fExpensesEl.textContent = money(filteredExpenses);

  const fNetEl = document.getElementById("historyFilteredNet");
  if (fNetEl) fNetEl.textContent = money(filteredNet);

  const fCountEl = document.getElementById("historyFilteredCount");
  if (fCountEl) fCountEl.textContent = `${filteredEntries.length} ${filteredEntries.length === 1 ? "entry" : "entries"}`;

  // Render individual rows
  const detailRows = filteredEntries
    .map((entry) => {
      const entryId = getEntryId(entry);
      const actualVal = getEntryActualAmount(entry);
      const plannedVal = Number(entry.amount) || 0;
      const isEditable = isEditableEntry(entry);

      let varianceHtml = `<span class="variance-pill neutral">—</span>`;
      if (plannedVal > 0) {
        const roundedPlanned = Math.round(plannedVal);
        const roundedActual = Math.round(actualVal);
        if (entry.type === "expense") {
          const diff = roundedPlanned - roundedActual;
          if (diff > 0) {
            varianceHtml = `<span class="variance-pill favorable">+${escapeHtml(money(diff))} under</span>`;
          } else if (diff < 0) {
            varianceHtml = `<span class="variance-pill unfavorable">-${escapeHtml(money(Math.abs(diff)))} over</span>`;
          } else {
            varianceHtml = `<span class="variance-pill neutral">On budget</span>`;
          }
        } else {
          const diff = roundedActual - roundedPlanned;
          if (diff > 0) {
            varianceHtml = `<span class="variance-pill favorable">+${escapeHtml(money(diff))} extra</span>`;
          } else if (diff < 0) {
            varianceHtml = `<span class="variance-pill unfavorable">-${escapeHtml(money(Math.abs(diff)))} short</span>`;
          } else {
            varianceHtml = `<span class="variance-pill neutral">Exact</span>`;
          }
        }
      }

      const actualCell = isEditable
        ? `<input class="inline-actual-input" data-history-entry-input="${escapeHtml(entryId)}" type="number" min="0" step="1" value="${actualVal > 0 ? actualVal : ""}" placeholder="0" style="width: 100px; text-align: right;">`
        : `<span>${actualVal > 0 ? escapeHtml(money(actualVal)) : "—"}</span>`;

      const action = isEditable && entry.source !== "starting balance"
        ? `<button class="delete-button" data-history-entry-clear="${escapeHtml(entryId)}" type="button">Clear</button>`
        : "";

      return `
        <tr>
          <td><strong>${escapeHtml(entry.date || "—")}</strong></td>
          <td>${escapeHtml(entry.category || "—")}</td>
          <td>${escapeHtml((entry.account || "cash").toUpperCase())}</td>
          <td><span class="pill ${escapeHtml(entry.type)}">${escapeHtml(entry.type)}</span></td>
          <td><span class="source-pill ${entry.source === "loan" ? "loan" : ""}">${escapeHtml(entry.source || "manual")}</span></td>
          <td class="number">${plannedVal > 0 ? escapeHtml(money(plannedVal)) : "—"}</td>
          <td class="number">${actualCell}</td>
          <td class="number">${varianceHtml}</td>
          <td class="number">${action}</td>
        </tr>
      `;
    })
    .join("");

  detailsTable.innerHTML = detailRows || `<tr><td colspan="9">No validated entries match the selected filters</td></tr>`;

  // 3. Grouped Category & Source Summary + Donut Chart
  const categoryGroups = new Map();
  filteredEntries.forEach((entry) => {
    const key = `${entry.category || "Uncategorized"}|${entry.type || "expense"}`;
    if (!categoryGroups.has(key)) {
      categoryGroups.set(key, {
        category: entry.category || "Uncategorized",
        type: entry.type || "expense",
        count: 0,
        totalActual: 0,
        totalForecast: 0
      });
    }
    const group = categoryGroups.get(key);
    group.count += 1;
    group.totalActual += getEntryActualAmount(entry);
    group.totalForecast += Number(entry.amount || 0);
  });

  const sortedGroups = [...categoryGroups.values()].sort((a, b) => b.totalActual - a.totalActual);
  const totalFilteredActual = sortedGroups.reduce((sum, g) => sum + g.totalActual, 0);

  const groupTable = document.getElementById("historyGroupedTable");
  const categoryList = document.getElementById("historyCategoryGroupList");
  const pieChart = document.getElementById("historyPieChart");
  const pieCenterVal = document.getElementById("historyPieCenterValue");
  const groupedCountEl = document.getElementById("historyGroupedCount");

  if (groupedCountEl) {
    groupedCountEl.textContent = `${sortedGroups.length} ${sortedGroups.length === 1 ? "group" : "groups"}`;
  }

  const palette = [
    "#0f766e", "#2f5f9f", "#a46a18", "#b8463f", "#1f7a4d", "#8b5cf6", "#ec4899", "#f97316", "#06b6d4", "#84cc16"
  ];

  if (totalFilteredActual <= 0 || sortedGroups.length === 0) {
    if (groupTable) groupTable.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);">No actualized data for current filter</td></tr>`;
    if (categoryList) categoryList.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px 0;">No category data for selection</div>`;
    if (pieChart) pieChart.style.background = "var(--line)";
    if (pieCenterVal) pieCenterVal.textContent = "0 EGP";
  } else {
    // Generate Donut Chart conic-gradient slices
    let currentAngle = 0;
    const gradientSlices = sortedGroups.map((group, idx) => {
      const share = group.totalActual / totalFilteredActual;
      const angle = share * 360;
      const color = palette[idx % palette.length];
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      return `${color} ${startAngle.toFixed(1)}deg ${endAngle.toFixed(1)}deg`;
    });

    if (pieChart) {
      pieChart.style.background = `conic-gradient(${gradientSlices.join(", ")})`;
    }
    if (pieCenterVal) {
      pieCenterVal.textContent = money(totalFilteredActual);
    }

    // Render Grouped List with Progress bars
    if (categoryList) {
      categoryList.innerHTML = sortedGroups
        .map((group, idx) => {
          const color = palette[idx % palette.length];
          const pct = Math.round((group.totalActual / totalFilteredActual) * 100) || 0;
          return `
            <div class="list-row" style="flex-direction:column; align-items:stretch; gap:4px; padding:8px 10px;">
              <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:700;">
                <span style="display:flex; align-items:center; gap:6px;">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; flex-shrink:0;"></span>
                  ${escapeHtml(group.category)}
                  <span class="pill ${escapeHtml(group.type)}" style="font-size:10px; min-height:18px; padding:0 6px;">${escapeHtml(group.type)}</span>
                </span>
                <span>${escapeHtml(money(group.totalActual))} <small style="font-weight:normal; color:var(--muted)">(${pct}%)</small></span>
              </div>
              <div class="progress-bar-bg" style="height:5px;">
                <div class="progress-bar-fill" style="width:${pct}%; background-color:${color}; height:100%;"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // Render Grouped Table
    if (groupTable) {
      groupTable.innerHTML = sortedGroups
        .map((group, idx) => {
          const color = palette[idx % palette.length];
          const pct = Math.round((group.totalActual / totalFilteredActual) * 100) || 0;
          return `
            <tr>
              <td>
                <span style="display:inline-flex; align-items:center; gap:6px;">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;"></span>
                  <strong>${escapeHtml(group.category)}</strong>
                </span>
              </td>
              <td><span class="pill ${escapeHtml(group.type)}">${escapeHtml(group.type)}</span></td>
              <td class="number">${group.count}</td>
              <td class="number" style="font-weight:600;">${escapeHtml(money(group.totalActual))}</td>
              <td class="number"><span class="variance-pill neutral">${pct}%</span></td>
            </tr>
          `;
        })
        .join("");
    }
  }
}

async function commitHistoryEntryActual(input) {
  if (!input) return;
  const entryId = input.dataset.historyEntryInput;
  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry || !isEditableEntry(entry)) return;

  const newActual = input.value === "" ? 0 : Math.round(Number(input.value) || 0);
  const previousActual = getEntryActualAmount(entry);
  const delta = newActual - previousActual;

  if (newActual <= 0) {
    clearHistoryActualEntry(entry);
    if (isArchived && archivedIndex !== -1) {
      archivedEntries.splice(archivedIndex, 1);
      saveSetting(keys.archivedEntries, archivedEntries);
    }
  } else {
    setEntryActualAmount(entry, newActual);
  }

  if (delta > 0) {
    const desc = `${entry.category || "Entry"} (${entry.date || ""})`;
    const selectedAcc = await promptAccountAdjustment(entry.type || "expense", delta, entry.account || "cash", desc);
    if (selectedAcc) {
      adjustAccountBalance(selectedAcc, delta, entry.type || "expense");
    }
  }

  renderAll();
}

async function clearHistoryEntryActual(entryId) {
  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry || !isEditableEntry(entry)) return;

  const actualAmount = getEntryActualAmount(entry);
  const confirmed = await confirmAction(
    "Clear Actual Amount",
    `Clear recorded actual for "${entry.category}" (${money(actualAmount)})? The forecast entry will remain intact in Cash Flow.`
  );
  if (!confirmed) return;

  clearHistoryActualEntry(entry);

  if (isArchived && archivedIndex !== -1) {
    archivedEntries.splice(archivedIndex, 1);
    saveSetting(keys.archivedEntries, archivedEntries);
  }

  renderAll();
}

function clearHistoryActualEntry(entry) {
  const deleteKey = getEntryId(entry);
  delete entryActuals[deleteKey];
  if (entry && entry.actualAmount !== undefined) {
    entry.actualAmount = 0;
  }
  saveSetting(keys.entryActuals, entryActuals);
}

function renderAccounts() {
  const list = document.getElementById("accountsList");
  if (!list) return;

  const totalOpening = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  
  list.innerHTML = Object.entries(accountBalances)
    .map(([id, acc]) => `
      <div class="list-row">
        <span>
          <strong>${escapeHtml(acc.name)}</strong><br>
          <small>Maturity Day: ${acc.maturityDay}</small>
        </span>
        <div class="inline-fields" style="grid-template-columns: 120px 100px; gap: 10px; margin: 0;">
          <label>
            Balance
            <input data-account-id="${escapeHtml(id)}" data-account-field="balance" type="number" value="${acc.balance}">
          </label>
          <label>
            Day
            <input data-account-id="${escapeHtml(id)}" data-account-field="maturityDay" type="number" min="1" max="31" value="${acc.maturityDay}">
          </label>
        </div>
      </div>
    `)
    .join("");
    
  const totalEl = document.getElementById("totalOpeningBalance");
  if (totalEl) totalEl.textContent = money(totalOpening);
}

function focusAccountBalance(accountId) {
  activateView("accounts");
  const input = document.querySelector(`[data-account-id="${accountId}"][data-account-field="balance"]`);
  if (input) {
    input.focus();
    input.select();
  }
}

function storageValue(item) {
  return (Number(item.quantity) || 0) * (Number(item.rate) || 0);
}

function renderStorageTotals() {
  const total = storageAssets.reduce((sum, item) => sum + storageValue(item), 0);
  const summaryEl = document.getElementById("storageSummary");
  if (summaryEl) summaryEl.textContent = money(total);
  const totalEl = document.getElementById("storageTotal");
  if (totalEl) totalEl.textContent = money(total);
}

function rateSourceOptionsHtml(selected) {
  const current = selected || "manual";
  const currencyOptions = (ratesData.currencies || [])
    .map((c) => {
      const value = `currency:${c.name}`;
      return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(c.name)} (${c.sell})</option>`;
    })
    .join("");
  const goldOptions = (ratesData.gold || [])
    .map((g) => {
      const value = `gold:${g.name}`;
      return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(g.name)} (${g.sell})</option>`;
    })
    .join("");
  return `
    <option value="manual"${current === "manual" ? " selected" : ""}>Manual entry</option>
    <optgroup label="Currencies">${currencyOptions}</optgroup>
    <optgroup label="Gold karats">${goldOptions}</optgroup>
  `;
}

function renderStorage() {
  renderStorageTotals();
  const cards = document.getElementById("storageCards");
  if (!cards) return;

  cards.innerHTML = storageAssets
    .map((item, index) => `
      <article class="asset-card">
        <div class="asset-heading">
          <strong>${escapeHtml(item.name)}</strong>
          <button class="delete-button" data-storage-delete="${index}" type="button">Delete</button>
        </div>
        <div class="inline-fields storage-fields">
          <label>
            Quantity
            <input data-storage-index="${index}" data-storage-field="quantity" type="number" min="0" step="0.01" value="${item.quantity}">
          </label>
          <label>
            Rate
            <input data-storage-index="${index}" data-storage-field="rate" type="number" min="0" step="0.01" value="${item.rate}">
          </label>
        </div>
        <label>
          Rate source
          <select data-storage-rate-index="${index}" data-storage-rate-source>${rateSourceOptionsHtml(item.rateSource || "manual")}</select>
        </label>
        <small>${escapeHtml(item.unit || "units")}</small>
        <p data-storage-value>${escapeHtml(money(storageValue(item)))}</p>
      </article>
    `)
    .join("");
}

function renderJobs() {
  const asfTable = document.getElementById("asfTable");
  if (asfTable) {
    asfTable.innerHTML = asfJobs
      .map((item, index) => `
        <tr>
          <td>${escapeHtml(item.date)}</td>
          <td class="number">${escapeHtml(usd(item.invoice))}</td>
          <td class="number">${escapeHtml(usd(item.actual))}</td>
          <td class="number">${escapeHtml(money(item.egp))}</td>
          <td><button class="delete-button" data-asf-delete="${index}" type="button">Delete</button></td>
        </tr>
      `)
      .join("");
  }

  const irqCards = document.getElementById("irqCards");
  if (irqCards) {
    irqCards.innerHTML = irqJobs
      .map((item, index) => `
        <div class="list-row">
          <span>${escapeHtml(item.label)}<br><small>${escapeHtml(item.note || "")}</small></span>
          <div style="display:flex; align-items:center; gap:10px;">
            <strong>${escapeHtml(numberFormatter.format(item.value))}</strong>
            <button class="delete-button" data-irq-delete="${index}" type="button">Delete</button>
          </div>
        </div>
      `)
      .join("");
  }
}

function renderRates() {
  const currencyEl = document.getElementById("currencyRates");
  if (currencyEl && ratesData && Array.isArray(ratesData.currencies)) {
    currencyEl.innerHTML = ratesData.currencies
      .map(
        (c) => `
        <div class="rate-card">
          <strong>${escapeHtml(c.name)}</strong>
          <small>Sell ${c.sell} / Buy ${c.buy}</small>
        </div>
      `
      )
      .join("");
  }

  const goldEl = document.getElementById("goldRates");
  if (goldEl && ratesData && Array.isArray(ratesData.gold)) {
    goldEl.innerHTML = ratesData.gold
      .map(
        (g) => `
        <div class="rate-card">
          <strong>${escapeHtml(g.name)}</strong>
          <small>Sell ${g.sell} / Buy ${g.buy}</small>
        </div>
      `
      )
      .join("");
  }
}

function openManualCurrencyEdit() {
  const rate = prompt("Which currency to update? (e.g. USD, EUR)");
  if (!rate) return;
  const currency = ratesData.currencies.find((c) => c.name.toUpperCase() === rate.toUpperCase());
  if (!currency) return alert("Currency not found");

  const form = document.getElementById("rateForm");
  if (!form) return;
  form.elements.name.value = currency.name;
  form.elements.sell.value = currency.sell;
  form.elements.buy.value = currency.buy;
  form.elements.rateId.value = ratesData.currencies.indexOf(currency);
  const dlg = document.getElementById("rateDialog");
  if (dlg) dlg.showModal();
}

function openManualGoldEdit() {
  const rate = prompt("Which gold type to update? (e.g. Gold 24)");
  if (!rate) return;
  const gold = ratesData.gold.find((g) => g.name.toLowerCase().includes(rate.toLowerCase()));
  if (!gold) return alert("Gold type not found");

  const form = document.getElementById("rateForm");
  if (!form) return;
  form.elements.name.value = gold.name;
  form.elements.sell.value = gold.sell;
  form.elements.buy.value = gold.buy;
  form.elements.rateId.value = ratesData.gold.indexOf(gold);
  const dlg = document.getElementById("rateDialog");
  if (dlg) dlg.showModal();
}

function renderAll() {
  renderDashboard();
  renderSalarySchedule();
  renderEntries();
  renderInstallments();
  renderAccounts();
  renderStorage();
  renderJobs();
  renderRates();
  renderHistory();
  renderCategoryCaps();
  renderSavingsGoals();
}

function activateView(viewId) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  const targetButton = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  const titleEl = document.getElementById("viewTitle");
  if (titleEl) titleEl.textContent = targetButton ? targetButton.textContent : "Dashboard";
}

function updateUndoResetVisibility() {
  const button = document.getElementById("undoReset");
  if (!button) return;
  button.hidden = !readResetBackup();
}

function upsertSalaryEntriesForPeriod(startMonth = forecastStartMonth, quarters = forecastQuarters) {
  saveSetting(keys.salary, salaryPattern);

  forecastStartMonth = startMonth || forecastStartMonth;
  forecastQuarters = Math.max(1, Number(quarters || forecastQuarters));

  const templates = buildSalaryEntries(forecastStartMonth, forecastQuarters);

  templates.forEach((template) => {
    const existing = cashEntries.find(
      (entry) =>
        entry.source === "salary" &&
        entry.date === template.date &&
        entry.account === template.account &&
        entry.type === template.type
    );
    if (existing) {
      existing.amount = template.amount;
      existing.category = template.category;
    } else {
      cashEntries.push({ ...template, id: generateId() });
    }
  });

  saveSetting(keys.entries, cashEntries);
  renderAll();
}

function syncEntryFormMode() {
  const form = document.getElementById("entryForm");
  if (!form) return;
  const creditType = (form.elements.creditType.value || "").trim().toLowerCase();
  const isCreditDue = creditType === "cib" || creditType === "hsbc";

  const catField = document.getElementById("categoryField");
  if (catField) catField.classList.toggle("is-hidden", isCreditDue);

  const typeField = document.getElementById("typeField");
  if (typeField) typeField.classList.toggle("is-hidden", isCreditDue);

  const recField = document.getElementById("recurringField");
  if (recField) recField.classList.toggle("is-hidden", isCreditDue);

  if (isCreditDue) {
    form.elements.type.value = "expense";
    form.elements.category.value = "Credit Due";
    form.elements.recurring.checked = false;
  }
}

function updateCurrencyConversionNote() {
  const form = document.getElementById("entryForm");
  if (!form) return;
  const curr = form.elements.currency.value;
  const amt = Number(form.elements.amount.value || 0);
  const noteEl = document.getElementById("currencyConversionNote");
  if (!noteEl) return;

  if (curr !== "EGP" && amt > 0) {
    const rate = getCurrencyRate(curr);
    const convertedEgp = amt * rate;
    noteEl.textContent = `${amt} ${curr} @ ${rate} = ${money(convertedEgp)}`;
    noteEl.hidden = false;
  } else {
    noteEl.hidden = true;
  }
}

function openEntryDialog(type, entry = null) {
  const form = document.getElementById("entryForm");
  if (!form) return;
  form.reset();
  editingEntry = entry;
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  form.elements.type.value = type;
  form.elements.currency.value = "EGP";
  form.elements.months.value = 12;
  form.elements.actualAmount.value = "";
  updateCurrencyConversionNote();

  if (entry) {
    form.elements.date.value = entry.date || form.elements.date.value;
    form.elements.category.value = entry.category || "";
    form.elements.account.value = entry.account || "";
    form.elements.type.value = entry.type || type;
    form.elements.amount.value = entry.amount || "";
    form.elements.creditType.value = entry.creditType || "";
    form.elements.actualAmount.value = getEntryActualAmount(entry) || "";
    form.elements.recurring.checked = Boolean(entry.source && entry.source.includes("monthly"));
    form.elements.months.value = entry.months || 12;
  }

  syncEntryFormMode();
  const title = entry ? "Edit entry" : type === "income" ? "Add income" : "Add expense";
  const titleEl = document.getElementById("entryDialogTitle");
  if (titleEl) titleEl.textContent = title;

  const btnEl = document.getElementById("entrySubmitButton");
  if (btnEl) {
    btnEl.textContent = entry ? "Update entry" : "Save entry";
    btnEl.value = entry ? "update" : "save";
  }

  const dlg = document.getElementById("entryDialog");
  if (dlg) dlg.showModal();
}

async function persistEntryForm(event) {
  const form = event.currentTarget;
  const dialog = document.getElementById("entryDialog");
  const creditType = (form.elements.creditType.value || "").trim().toLowerCase();
  const isCreditDue = creditType === "cib" || creditType === "hsbc";
  const isExpense = form.elements.type.value === "expense";

  if (isCreditDue) {
    form.elements.category.value = "Credit Due";
  }

  if (isExpense && !isCreditDue && !form.elements.category.value.trim()) {
    form.elements.category.value = "Other";
  }

  form.elements.category.setCustomValidity("");
  event.preventDefault();

  const submitter = event.submitter;
  if (submitter && submitter.value === "cancel") {
    editingEntry = null;
    if (dialog) dialog.close("cancel");
    return;
  }

  const rawAmount = Number(form.elements.amount.value);
  const selectedCurrency = form.elements.currency.value;
  const rate = getCurrencyRate(selectedCurrency);
  const plannedAmountInEgp = Math.round(rawAmount * rate);
  const rawActual = Number(form.elements.actualAmount.value || 0);
  const actualAmountInEgp = rawActual > 0 ? Math.round(rawActual * rate) : 0;
  const prevActualInEgp = editingEntry ? getEntryActualAmount(editingEntry) : 0;
  const deltaActualAmount = actualAmountInEgp - prevActualInEgp;
  const chosenAccount = form.elements.account.value.trim() || "cash";
  const entryCat = form.elements.category.value.trim();
  const entryType = form.elements.type.value || "expense";

  if (editingEntry) {
    const idx = cashEntries.findIndex((entry) => getEntryId(entry) === getEntryId(editingEntry));
    const prevSource = idx !== -1 ? cashEntries[idx].source : editingEntry.source;
    const isLoanCat = form.elements.category.value.trim().toLowerCase().includes("loan");
    const updatedEntry = {
      ...(idx !== -1 ? cashEntries[idx] : editingEntry),
      id: idx !== -1 ? cashEntries[idx].id : editingEntry.id || generateId(),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      account: form.elements.account.value.trim() || "cash",
      type: form.elements.type.value,
      amount: plannedAmountInEgp,
      creditType: form.elements.creditType.value || "",
      source: prevSource || (isLoanCat ? "loan" : form.elements.type.value === "expense" ? "expense" : "income")
    };

    if (idx !== -1) {
      cashEntries[idx] = updatedEntry;
      if (actualAmountInEgp > 0) {
        setEntryActualAmount(updatedEntry, actualAmountInEgp);
      } else {
        delete entryActuals[getEntryId(editingEntry)];
      }
    } else {
      const originalId = getEntryId(editingEntry);
      if (actualAmountInEgp > 0) {
        entryActuals[originalId] = Math.round(Number(actualAmountInEgp));
      } else {
        delete entryActuals[originalId];
      }
      saveSetting(keys.entryActuals, entryActuals);
    }
  } else {
    const isLoanCat = form.elements.category.value.trim().toLowerCase().includes("loan");
    const baseEntry = {
      id: generateId(),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      account: form.elements.account.value.trim() || "cash",
      type: form.elements.type.value,
      amount: plannedAmountInEgp,
      creditType: form.elements.creditType.value || "",
      source: isLoanCat ? "loan" : form.elements.type.value === "expense" ? "expense" : "income"
    };
    const months = form.elements.recurring.checked ? Number(form.elements.months.value) || 1 : 1;
    cashEntries.push(...buildRecurringEntries(baseEntry, months));

    if (actualAmountInEgp > 0) {
      setEntryActualAmount(cashEntries[cashEntries.length - months], actualAmountInEgp);
    }
  }

  const action = editingEntry ? "update" : "save";
  const targetEntryForLoanPrompt = editingEntry;
  saveSetting(keys.entries, cashEntries);
  saveSetting(keys.entryActuals, entryActuals);
  editingEntry = null;
  if (dialog) {
    dialog.returnValue = action;
    dialog.close(action);
  }
  renderAll();

  if (deltaActualAmount > 0) {
    const selectedAcc = await promptAccountAdjustment(entryType, deltaActualAmount, chosenAccount, entryCat);
    if (selectedAcc) {
      adjustAccountBalance(selectedAcc, deltaActualAmount, entryType);
      renderAll();
    }

    if (entryType === "income" && ((targetEntryForLoanPrompt && targetEntryForLoanPrompt.source === "loan") || (entryCat && entryCat.toLowerCase().startsWith("loan inflow")))) {
      const entryRef = targetEntryForLoanPrompt || cashEntries[cashEntries.length - 1];
      if (entryRef) {
        await handleLoanRepaymentAdjustmentPrompt(entryRef, actualAmountInEgp);
      }
    }
  }
}

// --- Loan Bridge Helpers ---
function syncLoanBridgeRepaymentFields() {
  const form = document.getElementById("loanBridgeForm");
  if (!form) return;
  const isInstallments = form.elements.repaymentType.value === "installments";
  const singleBox = document.getElementById("loanSingleRepaymentFields");
  const instBox = document.getElementById("loanInstallmentRepaymentFields");
  if (singleBox) singleBox.hidden = isInstallments;
  if (instBox) instBox.hidden = !isInstallments;
}

function updateLoanBridgeAmounts() {
  const form = document.getElementById("loanBridgeForm");
  if (!form) return;
  const amt = Number(form.elements.amount.value) || 0;
  const months = Number(form.elements.installmentMonths.value) || 6;
  const instAmtInput = form.elements.installmentAmount;
  if (instAmtInput && (!instAmtInput.value || instAmtInput.dataset.autoCalc !== "false")) {
    instAmtInput.value = months > 0 ? Math.round(amt / months) : amt;
  }
}

function openLoanBridgeDialog(amount = null, date = null) {
  const dialog = document.getElementById("loanBridgeDialog");
  const form = document.getElementById("loanBridgeForm");
  if (!dialog || !form) return;

  form.reset();

  const accountSelect = document.getElementById("loanBridgeAccount");
  if (accountSelect) {
    const options = Object.entries(accountBalances)
      .map(([id, acc]) => `<option value="${escapeHtml(id)}">${escapeHtml(acc.name)}</option>`)
      .join("");
    accountSelect.innerHTML = options || `<option value="cash">Cash</option>`;
  }

  const defDate = date || DateUtils.todayString();
  const amtVal = amount ? Math.round(Math.abs(Number(amount))) : 10000;

  form.elements.disbursementDate.value = defDate;
  form.elements.amount.value = amtVal;
  form.elements.repaymentAmount.value = amtVal;

  // Single due date default: 3 months later
  const [y, m, d] = defDate.split("-").map(Number);
  const dueTargetMonthIndex = (m - 1) + 3;
  const dueYear = y + Math.floor(dueTargetMonthIndex / 12);
  const dueMonth = (dueTargetMonthIndex % 12) + 1;
  const dueLastDay = DateUtils.getLastDayOfMonth(dueYear, dueMonth);
  form.elements.dueDate.value = DateUtils.formatDate(dueYear, dueMonth, Math.min(d, dueLastDay));

  // Installment default: start next month
  const instTargetMonthIndex = m;
  const instYear = y + Math.floor(instTargetMonthIndex / 12);
  const instMonth = (instTargetMonthIndex % 12) + 1;
  form.elements.installmentStartMonth.value = `${instYear}-${String(instMonth).padStart(2, "0")}`;
  form.elements.installmentMonths.value = 6;
  form.elements.installmentAmount.value = Math.round(amtVal / 6);
  form.elements.installmentDay.value = Math.min(d, 28);

  form.elements.repaymentType.value = "single";
  syncLoanBridgeRepaymentFields();

  dialog.showModal();
}

function handleLoanBridgeSubmit(event) {
  event.preventDefault();
  const form = document.getElementById("loanBridgeForm");
  const dialog = document.getElementById("loanBridgeDialog");
  if (!form) return;

  const name = (form.elements.name.value || "Bridge Loan").trim();
  const amount = Number(form.elements.amount.value) || 0;
  const disbursementDate = form.elements.disbursementDate.value;
  const account = form.elements.account.value || "cash";
  const repaymentType = form.elements.repaymentType.value;

  if (amount <= 0 || !disbursementDate) {
    return;
  }

  const loanId = generateId();

  // 1. Inflow Entry (Income)
  const inflowEntry = {
    id: generateId(),
    loanId: loanId,
    date: disbursementDate,
    category: `Loan Inflow: ${name}`,
    account: account,
    type: "income",
    amount: amount,
    source: "loan"
  };
  cashEntries.push(inflowEntry);

  // 2. Repayment Entry / Installments
  if (repaymentType === "single") {
    const dueDate = form.elements.dueDate.value || disbursementDate;
    const repaymentAmount = Number(form.elements.repaymentAmount.value) || amount;
    const repaymentEntry = {
      id: generateId(),
      loanId: loanId,
      date: dueDate,
      category: `Loan Repayment: ${name}`,
      account: account,
      type: "expense",
      amount: repaymentAmount,
      source: "loan"
    };
    cashEntries.push(repaymentEntry);
  } else {
    const months = Number(form.elements.installmentMonths.value) || 6;
    const startMonth = form.elements.installmentStartMonth.value || DateUtils.currentYearMonth();
    const instAmount = Number(form.elements.installmentAmount.value) || Math.round(amount / months);
    const day = Number(form.elements.installmentDay.value) || 15;

    installments.push({
      id: generateId(),
      loanId: loanId,
      name: `Loan Repayment: ${name}`,
      amount: instAmount,
      day: day,
      startMonth: startMonth,
      months: months,
      frequency: 1
    });
    saveSetting(keys.installments, installments);
  }

  saveSetting(keys.entries, cashEntries);
  if (dialog) dialog.close("saved");
  renderAll();
}

function findLinkedLoanRepayment(inflowEntry) {
  if (!inflowEntry) return null;

  // 1. Check by explicit loanId
  if (inflowEntry.loanId) {
    const singleRepayment = cashEntries.find(
      (e) => e.loanId === inflowEntry.loanId && e.type === "expense"
    );
    if (singleRepayment) {
      return { type: "single", target: singleRepayment };
    }
    const installmentRepayment = installments.find(
      (inst) => inst.loanId === inflowEntry.loanId
    );
    if (installmentRepayment) {
      return { type: "installment", target: installmentRepayment };
    }
  }

  // 2. Fallback check by name: "Loan Inflow: <Name>" <-> "Loan Repayment: <Name>"
  const inflowCat = (inflowEntry.category || "").trim();
  if (inflowCat.toLowerCase().startsWith("loan inflow:")) {
    const loanName = inflowCat.replace(/^loan inflow:\s*/i, "").trim();
    if (loanName) {
      const expectedRepaymentCat = `loan repayment: ${loanName}`.toLowerCase();
      const singleRepayment = cashEntries.find(
        (e) => (e.category || "").trim().toLowerCase() === expectedRepaymentCat && e.type === "expense"
      );
      if (singleRepayment) {
        return { type: "single", target: singleRepayment };
      }
      const installmentRepayment = installments.find(
        (inst) => (inst.name || "").trim().toLowerCase() === expectedRepaymentCat
      );
      if (installmentRepayment) {
        return { type: "installment", target: installmentRepayment };
      }
    }
  }

  return null;
}

function promptLoanRepaymentAdjustment(inflowEntry, linkedInfo, totalDrawn) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("adjustLoanRepaymentDialog");
    if (!dialog) {
      resolve(null);
      return;
    }

    const plannedLoan = Number(inflowEntry.amount || 0);
    if (plannedLoan <= 0 || totalDrawn <= 0) {
      resolve(null);
      return;
    }

    const isSingle = linkedInfo.type === "single";
    const repTarget = linkedInfo.target;
    const currentRepAmount = Number(repTarget.amount || 0);

    // Calculate baseline total repayment from initial planned amount, not the already-scaled amount
    let baselineTotal = 0;
    let months = 1;

    if (isSingle) {
      const storedInitial = Number(repTarget.initialAmount || repTarget.plannedAmount || 0);
      if (storedInitial > 0) {
        baselineTotal = storedInitial;
      } else {
        // Fallback for existing loans where initialAmount wasn't recorded
        baselineTotal = Math.max(currentRepAmount, plannedLoan);
      }
      if (!repTarget.initialAmount) {
        repTarget.initialAmount = baselineTotal;
      }
    } else {
      months = Number(repTarget.months || 1);
      const storedInitialInst = Number(repTarget.initialAmount || repTarget.plannedAmount || 0);
      if (storedInitialInst > 0) {
        baselineTotal = storedInitialInst * months;
      } else {
        baselineTotal = Math.max(currentRepAmount * months, plannedLoan);
      }
      if (!repTarget.initialAmount) {
        repTarget.initialAmount = Math.round(baselineTotal / months);
      }
    }

    const markup = Math.max(1, baselineTotal / plannedLoan);
    const scaledTotal = Math.round(totalDrawn * markup);
    const scaledAmount = isSingle ? scaledTotal : Math.max(1, Math.round(scaledTotal / months));

    // If repayment is already exact, no need to prompt
    if (scaledAmount === currentRepAmount) {
      resolve(null);
      return;
    }

    const msgEl = document.getElementById("adjustLoanRepaymentMessage");
    const descEl = document.getElementById("adjustLoanRepaymentDetails");
    const keepBtn = document.getElementById("adjustLoanRepaymentKeepBtn");
    const scaleBtn = document.getElementById("adjustLoanRepaymentScaleBtn");

    if (msgEl) {
      msgEl.innerHTML = `You recorded a draw of <strong>${money(totalDrawn)}</strong> (out of <strong>${money(plannedLoan)}</strong> loan facility) for <em>${escapeHtml(inflowEntry.category)}</em>.`;
    }

    if (descEl) {
      if (isSingle) {
        descEl.innerHTML = `
          <div style="background: var(--bg-alt, #f6f8fa); padding: 12px; border-radius: 8px; border: 1px solid var(--line); font-size: 13px; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--muted)">Current Scheduled Repayment:</span>
              <strong>${money(currentRepAmount)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--blue, #2563eb);">
              <span>Scaled to Drawn (${money(totalDrawn)}):</span>
              <strong>${money(scaledAmount)}</strong>
            </div>
          </div>
        `;
      } else {
        descEl.innerHTML = `
          <div style="background: var(--bg-alt, #f6f8fa); padding: 12px; border-radius: 8px; border: 1px solid var(--line); font-size: 13px; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--muted)">Current Installments:</span>
              <strong>${months} × ${money(currentRepAmount)}/mo (${money(currentRepAmount * months)})</strong>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--blue, #2563eb);">
              <span>Scaled to Drawn (${money(totalDrawn)}):</span>
              <strong>${months} × ${money(scaledAmount)}/mo (${money(scaledAmount * months)})</strong>
            </div>
          </div>
        `;
      }
    }

    if (scaleBtn) {
      scaleBtn.textContent = isSingle ? `Scale to ${money(scaledAmount)}` : `Scale to ${money(scaledAmount)}/mo`;
    }

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      if (keepBtn) keepBtn.removeEventListener("click", handleKeep);
      if (scaleBtn) scaleBtn.removeEventListener("click", handleScale);
    };

    const handleKeep = () => {
      if (settled) return;
      settled = true;
      cleanup();
      dialog.close("keep");
      resolve("keep");
    };

    const handleScale = () => {
      if (settled) return;
      settled = true;
      cleanup();
      dialog.close("scale");
      resolve({ action: "scale", scaledAmount });
    };

    const handleCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve("keep");
    };

    const handleClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve("keep");
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    if (keepBtn) keepBtn.addEventListener("click", handleKeep);
    if (scaleBtn) scaleBtn.addEventListener("click", handleScale);

    dialog.showModal();
  });
}

async function handleLoanRepaymentAdjustmentPrompt(inflowEntry, totalDrawn) {
  const linked = findLinkedLoanRepayment(inflowEntry);
  if (!linked) return;

  const result = await promptLoanRepaymentAdjustment(inflowEntry, linked, totalDrawn);
  if (result && result.action === "scale" && result.scaledAmount) {
    if (linked.type === "single") {
      linked.target.amount = result.scaledAmount;
      saveSetting(keys.entries, cashEntries);
    } else if (linked.type === "installment") {
      linked.target.amount = result.scaledAmount;
      saveSetting(keys.installments, installments);
    }
    renderAll();
  }
}

function setupEventListeners() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activateView(button.dataset.view);
    });
  });

  on("themeToggle", "click", toggleTheme);
  on("exportCSV", "click", exportToCSV);

  on("deficitBannerAction", "click", () => {
    activateView("deficits");
  });

  on("exportData", "click", () => {
    const payload = {
      app: "budget-control",
      exportedAt: new Date().toISOString(),
      seedVersion,
      data: {
        salaryPattern,
        salaryAnchorMonth,
        cashEntries,
        installments,
        storageAssets,
        accountBalances,
        asfJobs,
        ratesData,
        irqJobs,
        creditDues,
        creditDueMonths,
        entryActuals,
        deletedForecasts,
        archivedEntries,
        categoryCaps,
        savingsGoals
      }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `budget-data-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  on("importData", "click", () => {
    const fileInput = document.getElementById("importDataFile");
    if (fileInput) fileInput.click();
  });

  on("importDataFile", "change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async () => {
      let payload;
      try {
        payload = JSON.parse(reader.result);
      } catch (e) {
        alert("That file isn't valid JSON.");
        event.target.value = "";
        return;
      }

      const incoming = payload && typeof payload === "object" ? payload.data : null;
      if (!incoming || typeof incoming !== "object") {
        alert("That file doesn't look like a budget data export.");
        event.target.value = "";
        return;
      }

      const confirmed = await confirmAction("Import Budget Data", "Import this data? It will replace everything currently in the app on this device.", "Import");
      if (!confirmed) {
        event.target.value = "";
        return;
      }

      Object.entries(exportableDataKeys).forEach(([dataKey, storageKey]) => {
        if (incoming[dataKey] !== undefined) {
          localStorage.setItem(storageKey, JSON.stringify(incoming[dataKey]));
        }
      });

      localStorage.setItem(keys.salaryMaterialized, "true");
      localStorage.setItem(keys.seedVersion, seedVersion);

      event.target.value = "";
      location.reload();
    };

    reader.onerror = () => {
      alert("Couldn't read that file.");
      event.target.value = "";
    };

    reader.readAsText(file);
  });

  setupGistSyncEventListeners();

  on("resetData", "click", async () => {
    const confirmed = await confirmAction(
      "Reset All Data",
      "Reset all data (salary schedule, forecast entries, installments, storage assets, account balances, ASF invoices, IRQ jobs, and rates) to blank?\n\nYou'll be able to undo this right after.",
      "Reset"
    );
    if (!confirmed) return;

    saveSetting(keys.resetBackup, {
      salaryPattern: clone(salaryPattern),
      salaryAnchorMonth,
      cashEntries: clone(cashEntries),
      installments: clone(installments),
      storageAssets: clone(storageAssets),
      accountBalances: clone(accountBalances),
      asfJobs: clone(asfJobs),
      irqJobs: clone(irqJobs),
      ratesData: clone(ratesData),
      creditDues: clone(creditDues),
      creditDueMonths: clone(creditDueMonths),
      entryActuals: clone(entryActuals),
      deletedForecasts: clone(deletedForecasts),
      archivedEntries: clone(archivedEntries),
      categoryCaps: clone(categoryCaps),
      savingsGoals: clone(savingsGoals)
    });

    salaryPattern = clone(defaultSalaryPattern);
    salaryAnchorMonth = DateUtils.currentYearMonth();
    cashEntries = [];
    installments = [];
    storageAssets = [];
    accountBalances = clone(defaultAccountBalances);
    asfJobs = [];
    irqJobs = [];
    ratesData = clone(defaultRates);
    categoryCaps = clone(defaultCategoryCaps);
    savingsGoals = clone(defaultSavingsGoals);
    creditDues = {};
    creditDueMonths = {};
    entryActuals = {};
    deletedForecasts = [];
    archivedEntries = [];

    localStorage.setItem(keys.seedVersion, seedVersion);
    saveSetting(keys.salary, salaryPattern);
    saveSetting(keys.salaryAnchor, salaryAnchorMonth);
    saveSetting(keys.entries, cashEntries);
    saveSetting(keys.installments, installments);
    saveSetting(keys.storage, storageAssets);
    saveSetting(keys.accounts, accountBalances);
    saveSetting(keys.asf, asfJobs);
    saveSetting(keys.irq, irqJobs);
    saveSetting(keys.rates, ratesData);
    saveSetting(keys.categoryCaps, categoryCaps);
    saveSetting(keys.savingsGoals, savingsGoals);
    saveSetting(keys.creditDues, creditDues);
    saveSetting(keys.creditDueMonths, creditDueMonths);
    saveSetting(keys.entryActuals, entryActuals);
    saveSetting(keys.deletedForecasts, deletedForecasts);
    saveSetting(keys.archivedEntries, archivedEntries);

    updateUndoResetVisibility();
    renderAll();
  });

  on("undoReset", "click", () => {
    const backup = readResetBackup();
    if (!backup) return;

    salaryPattern = backup.salaryPattern || clone(defaultSalaryPattern);
    salaryAnchorMonth = backup.salaryAnchorMonth || salaryAnchorMonth;
    cashEntries = normalizeCashEntries(backup.cashEntries || []);
    installments = backup.installments || [];
    storageAssets = backup.storageAssets || [];
    accountBalances = backup.accountBalances || defaultAccountBalances;
    asfJobs = backup.asfJobs || [];
    irqJobs = backup.irqJobs || [];
    ratesData = backup.ratesData || defaultRates;
    categoryCaps = backup.categoryCaps || defaultCategoryCaps;
    savingsGoals = backup.savingsGoals || defaultSavingsGoals;
    creditDues = backup.creditDues || {};
    creditDueMonths = backup.creditDueMonths || {};
    entryActuals = backup.entryActuals || {};
    deletedForecasts = backup.deletedForecasts || [];
    archivedEntries = backup.archivedEntries || [];

    saveSetting(keys.salary, salaryPattern);
    saveSetting(keys.salaryAnchor, salaryAnchorMonth);
    saveSetting(keys.entries, cashEntries);
    saveSetting(keys.installments, installments);
    saveSetting(keys.storage, storageAssets);
    saveSetting(keys.accounts, accountBalances);
    saveSetting(keys.asf, asfJobs);
    saveSetting(keys.irq, irqJobs);
    saveSetting(keys.rates, ratesData);
    saveSetting(keys.categoryCaps, categoryCaps);
    saveSetting(keys.savingsGoals, savingsGoals);
    saveSetting(keys.creditDues, creditDues);
    saveSetting(keys.creditDueMonths, creditDueMonths);
    saveSetting(keys.entryActuals, entryActuals);
    saveSetting(keys.deletedForecasts, deletedForecasts);
    saveSetting(keys.archivedEntries, archivedEntries);

    localStorage.removeItem(keys.resetBackup);
    updateUndoResetVisibility();
    renderAll();
  });

  on("addIncome", "click", () => openEntryDialog("income"));
  on("addEntry", "click", () => openEntryDialog("expense"));
  on("addLoanBtn", "click", () => openLoanBridgeDialog());

  const loanForm = document.getElementById("loanBridgeForm");
  if (loanForm) {
    loanForm.addEventListener("submit", handleLoanBridgeSubmit);
    loanForm.querySelectorAll('input[name="repaymentType"]').forEach((radio) => {
      radio.addEventListener("change", syncLoanBridgeRepaymentFields);
    });
    on("loanBridgeAmount", "input", () => {
      const amt = Number(document.getElementById("loanBridgeAmount").value) || 0;
      const repAmt = document.getElementById("loanRepaymentAmount");
      if (repAmt) repAmt.value = amt;
      updateLoanBridgeAmounts();
    });
    on("loanInstallmentMonths", "input", updateLoanBridgeAmounts);
  }

  // Deficits 1-click Bridge with Loan listener
  on("deficitForecastList", "click", (event) => {
    const button = event.target.closest("[data-bridge-amount]");
    if (!button) return;
    const amount = Number(button.dataset.bridgeAmount || 0);
    const date = button.dataset.bridgeDate;
    openLoanBridgeDialog(amount, date);
  });

  document.querySelectorAll("dialog").forEach((dlg) => {
    dlg.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const target = event.target;
        if (target && (target.tagName === "TEXTAREA" || target.tagName === "BUTTON")) return;
        const form = dlg.querySelector("form");
        const submitBtn = dlg.querySelector('button[type="submit"]:not(.icon-button)');
        if (form && submitBtn) {
          event.preventDefault();
          submitBtn.click();
        }
      }
    });
  });

  const entryForm = document.getElementById("entryForm");
  if (entryForm) {
    if (entryForm.elements && entryForm.elements.creditType) {
      entryForm.elements.creditType.addEventListener("change", syncEntryFormMode);
    }
    on("entryCurrencySelect", "change", updateCurrencyConversionNote);
    on("entryAmountInput", "input", updateCurrencyConversionNote);
    entryForm.addEventListener("submit", persistEntryForm);
  }

  // Category Caps listeners
  on("setCategoryCap", "click", () => {
    const form = document.getElementById("capForm");
    if (form) form.reset();
    const dlg = document.getElementById("capDialog");
    if (dlg) dlg.showModal();
  });

  on("capDialog", "close", () => {
    const dialog = document.getElementById("capDialog");
    if (!dialog || dialog.returnValue !== "save") return;
    const form = document.getElementById("capForm");
    if (!form) return;

    const category = form.elements.category.value.trim();
    const cap = Number(form.elements.cap.value);

    const existingIdx = categoryCaps.findIndex((item) => item.category.toLowerCase() === category.toLowerCase());
    if (existingIdx !== -1) {
      categoryCaps[existingIdx].cap = cap;
    } else {
      categoryCaps.push({ category, cap });
    }

    saveSetting(keys.categoryCaps, categoryCaps);
    renderAll();
  });

  on("categoryCapsList", "click", async (event) => {
    const button = event.target.closest("[data-cap-delete]");
    if (!button) return;
    const index = Number(button.dataset.capDelete);
    const confirmed = await confirmAction("Delete Budget Cap", "Remove this category budget limit?");
    if (!confirmed) return;
    categoryCaps.splice(index, 1);
    saveSetting(keys.categoryCaps, categoryCaps);
    renderAll();
  });

  // Savings Goals listeners
  on("addSavingsGoal", "click", () => {
    const form = document.getElementById("goalForm");
    if (form) form.reset();
    const dlg = document.getElementById("goalDialog");
    if (dlg) dlg.showModal();
  });

  on("goalDialog", "close", () => {
    const dialog = document.getElementById("goalDialog");
    if (!dialog || dialog.returnValue !== "save") return;
    const form = document.getElementById("goalForm");
    if (!form) return;

    savingsGoals.push({
      id: generateId(),
      name: form.elements.name.value.trim(),
      target: Number(form.elements.target.value),
      current: Number(form.elements.current.value || 0)
    });

    saveSetting(keys.savingsGoals, savingsGoals);
    renderAll();
  });

  on("savingsGoalsList", "click", async (event) => {
    const button = event.target.closest("[data-goal-delete]");
    if (!button) return;
    const index = Number(button.dataset.goalDelete);
    const confirmed = await confirmAction("Delete Savings Goal", "Remove this savings goal?");
    if (!confirmed) return;
    savingsGoals.splice(index, 1);
    saveSetting(keys.savingsGoals, savingsGoals);
    renderAll();
  });

  // Deficits 1-click Quick Settlement
  on("deficitOverdueList", "click", (event) => {
    const button = event.target.closest("[data-settle-id]");
    if (!button) return;
    const entryId = button.dataset.settleId;
    const amount = Number(button.dataset.settleAmount || 0);

    const entry = findEntryById(entryId);
    if (!entry) return;

    setEntryActualAmount(entry, amount);
    renderAll();
  });

  on("typeFilter", "change", renderEntries);
  on("categoryFilter", "change", renderEntries);
  on("searchEntries", "input", debounce(renderEntries, 180));

  on("entriesTable", "change", (event) => {
    const input = event.target.closest("[data-entry-actual-input]");
    if (!input) return;
    event.stopPropagation();
    commitEntryActualInput(input);
  });

  on("entriesTable", "keydown", (event) => {
    const input = event.target.closest("[data-entry-actual-input]");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    commitEntryActualInput(input);
  });

  on("entriesTable", "click", async (event) => {
    const finishButton = event.target.closest("[data-finish-loan-key]");
    if (finishButton) {
      event.stopPropagation();
      const deleteKey = finishButton.dataset.finishLoanKey;
      const entry = findEntryById(deleteKey);
      if (!entry) return;

      const drawnAmount = getEntryActualAmount(entry);
      const remainingAmount = getRemainingForecastAmount(entry);
      const loanName = entry.category || "Loan";

      const confirmed = await confirmAction(
        "Finish & Close Loan",
        `Do you want to finalize "${loanName}"?\n\n• Amount Drawn: ${money(drawnAmount)}\n• Undrawn Remaining (${money(remainingAmount)}) will be closed and removed from forecast.\n• Linked repayment will be finalized to match ${money(drawnAmount)}.`,
        "Finish Loan"
      );
      if (!confirmed) return;

      entry.isClosed = true;
      entry.amount = drawnAmount;
      saveSetting(keys.entries, cashEntries);

      // Finalize linked repayment to drawn amount
      const linked = findLinkedLoanRepayment(entry);
      if (linked) {
        const isSingle = linked.type === "single";
        const repTarget = linked.target;
        const months = Number(repTarget.months || 1);
        const baselineTotal = Number(repTarget.initialAmount || repTarget.plannedAmount || (isSingle ? repTarget.amount : repTarget.amount * months) || drawnAmount);
        const originalLoan = Number(entry.initialAmount || entry.amount || drawnAmount) || 1;
        const markup = Math.max(1, baselineTotal / originalLoan);
        const scaledTotal = Math.round(drawnAmount * markup);
        const scaledAmount = isSingle ? scaledTotal : Math.max(1, Math.round(scaledTotal / months));

        if (isSingle) {
          repTarget.amount = scaledAmount;
          saveSetting(keys.entries, cashEntries);
        } else {
          repTarget.amount = scaledAmount;
          saveSetting(keys.installments, installments);
        }
      }

      renderAll();
      return;
    }

    const button = event.target.closest("[data-delete-key]");
    if (button) {
      event.stopPropagation();
      const deleteKey = button.dataset.deleteKey;
      const entry = findEntryById(deleteKey);
      if (!entry || !canDeleteEntry(entry)) return;

      if (entry.source === "starting balance") {
        focusAccountBalance(entry.account);
        return;
      }

      const confirmed = await confirmAction("Delete Budget Entry", `Are you sure you want to delete "${entry.category}" (${entry.amount} EGP)?`);
      if (!confirmed) return;

      const index = cashEntries.findIndex((item) => getEntryId(item) === deleteKey);
      if (index !== -1) {
        const actualAmount = getEntryActualAmount(entry);
        cashEntries.splice(index, 1);
        saveSetting(keys.entries, cashEntries);

        if (actualAmount > 0) {
          archivedEntries.push(entry);
          saveSetting(keys.archivedEntries, archivedEntries);
        } else {
          delete entryActuals[getEntryId(entry)];
          saveSetting(keys.entryActuals, entryActuals);
        }
        renderAll();
        return;
      }

      const actualAmount = getEntryActualAmount(entry);
      if (actualAmount > 0) {
        archivedEntries.push(entry);
        saveSetting(keys.archivedEntries, archivedEntries);
      }

      if (!deletedForecasts.includes(deleteKey)) {
        deletedForecasts.push(deleteKey);
        saveSetting(keys.deletedForecasts, deletedForecasts);
      }
      renderAll();
      return;
    }

    if (event.target.closest("[data-entry-actual-input]")) return;

    const row = event.target.closest("tr[data-entry-id]");
    if (!row) return;
    const entry = findEntryById(row.dataset.entryId);
    if (!entry) return;
    if (entry.source === "starting balance") {
      focusAccountBalance(entry.account);
      return;
    }
    if (!isEditableEntry(entry)) return;
    openEntryDialog(entry.type, entry);
  });

  on("salarySchedule", "input", (event) => {
    const input = event.target.closest("[data-salary-index]");
    if (!input) return;
    const index = Number(input.dataset.salaryIndex);
    const field = input.dataset.salaryField;
    salaryPattern[index][field] = Number(input.value);
    saveSetting(keys.salary, salaryPattern);
  });

  on("salarySchedule", "change", (event) => {
    const input = event.target.closest("[data-salary-index]");
    if (!input) return;
    const index = Number(input.dataset.salaryIndex);
    const field = input.dataset.salaryField;
    salaryPattern[index][field] = Number(input.value);
    saveSetting(keys.salary, salaryPattern);
    renderAll();
  });

  on("salarySchedule", "click", async (event) => {
    const button = event.target.closest("[data-salary-delete]");
    if (!button) return;
    const confirmed = await confirmAction("Delete Salary Payment", "Are you sure you want to remove this salary payment slot?");
    if (!confirmed) return;
    salaryPattern.splice(Number(button.dataset.salaryDelete), 1);
    saveSetting(keys.salary, salaryPattern);
    renderAll();
  });

  on("addSalaryPayment", "click", () => {
    salaryPattern.push({ monthOffset: 0, day: 30, amount: 0 });
    saveSetting(keys.salary, salaryPattern);
    renderAll();
  });

  on("salaryPeriodStart", "change", () => {
    syncForecastPeriodSettings();
    upsertSalaryEntriesForPeriod(forecastStartMonth, forecastQuarters);
  });

  on("salaryPeriodQuarters", "change", () => {
    syncForecastPeriodSettings();
    upsertSalaryEntriesForPeriod(forecastStartMonth, forecastQuarters);
  });

  on("refreshSalaryEntries", "click", () => {
    const startInput = document.getElementById("salaryPeriodStart");
    const quartersInput = document.getElementById("salaryPeriodQuarters");
    upsertSalaryEntriesForPeriod(
      startInput ? startInput.value : forecastStartMonth,
      quartersInput ? Number(quartersInput.value) : forecastQuarters
    );
  });

  on("addInstallment", "click", () => {
    editingInstallmentIndex = null;
    const form = document.getElementById("installmentForm");
    if (!form) return;
    form.reset();
    form.elements.startMonth.value = new Date().toISOString().slice(0, 7);
    form.elements.day.value = 30;
    form.elements.months.value = 12;
    form.elements.frequency.value = "1";
    const titleEl = document.getElementById("installmentDialogTitle");
    if (titleEl) titleEl.textContent = "Add installment";
    const dlg = document.getElementById("installmentDialog");
    if (dlg) dlg.showModal();
  });

  on("installmentList", "click", async (event) => {
    const editButton = event.target.closest("[data-installment-edit]");
    if (editButton) {
      const index = Number(editButton.dataset.installmentEdit);
      const item = installments[index];
      if (!item) return;
      editingInstallmentIndex = index;
      const form = document.getElementById("installmentForm");
      if (!form) return;
      form.reset();
      form.elements.name.value = item.name;
      form.elements.amount.value = item.amount;
      form.elements.frequency.value = String(item.frequency || 1);
      form.elements.day.value = item.day;
      form.elements.startMonth.value = item.startMonth;
      form.elements.months.value = item.months;
      const titleEl = document.getElementById("installmentDialogTitle");
      if (titleEl) titleEl.textContent = "Edit installment";
      const dlg = document.getElementById("installmentDialog");
      if (dlg) dlg.showModal();
      return;
    }

    const deleteButton = event.target.closest("[data-installment-delete]");
    if (deleteButton) {
      const index = Number(deleteButton.dataset.installmentDelete);
      const item = installments[index];
      const confirmed = await confirmAction("Delete Installment", `Delete recurring installment "${item ? item.name : ""}"?`);
      if (!confirmed) return;
      installments.splice(index, 1);
      saveSetting(keys.installments, installments);
      renderAll();
    }
  });

  on("installmentDialog", "close", () => {
    const dialog = document.getElementById("installmentDialog");
    if (!dialog || dialog.returnValue !== "save") {
      editingInstallmentIndex = null;
      return;
    }
    const form = document.getElementById("installmentForm");
    if (!form) return;
    const values = {
      name: form.elements.name.value.trim(),
      amount: Number(form.elements.amount.value),
      day: Number(form.elements.day.value),
      startMonth: form.elements.startMonth.value,
      months: Number(form.elements.months.value),
      frequency: Number(form.elements.frequency.value) || 1
    };

    if (editingInstallmentIndex !== null && installments[editingInstallmentIndex]) {
      installments[editingInstallmentIndex] = {
        ...installments[editingInstallmentIndex],
        ...values
      };
    } else {
      installments.push({
        id: generateId(),
        ...values
      });
    }
    editingInstallmentIndex = null;
    saveSetting(keys.installments, installments);
    renderAll();
  });

  on("accountsList", "input", (event) => {
    const input = event.target.closest("[data-account-id]");
    if (!input) return;
    const id = input.dataset.accountId;
    const field = input.dataset.accountField;
    if (accountBalances[id]) {
      accountBalances[id][field] = Number(input.value);
      saveSetting(keys.accounts, accountBalances);
      const totalOpening = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
      const totalEl = document.getElementById("totalOpeningBalance");
      if (totalEl) totalEl.textContent = money(totalOpening);
    }
  });

  on("accountsList", "change", (event) => {
    const input = event.target.closest("[data-account-id]");
    if (!input) return;
    const id = input.dataset.accountId;
    const field = input.dataset.accountField;
    if (accountBalances[id]) {
      accountBalances[id][field] = Number(input.value);
      saveSetting(keys.accounts, accountBalances);
      renderDashboard();
    }
  });

  on("addStorage", "click", () => {
    const form = document.getElementById("storageForm");
    if (!form) return;
    form.reset();
    form.elements.rateSource.innerHTML = rateSourceOptionsHtml("manual");
    const dlg = document.getElementById("storageDialog");
    if (dlg) dlg.showModal();
  });

  on("storageForm", "change", (event) => {
    if (event.target.name !== "rateSource") return;
    const form = document.getElementById("storageForm");
    const sourceValue = event.target.value;
    const resolved = resolveRateSourceValue(sourceValue);
    if (resolved === null) return;
    form.elements.rate.value = resolved;
    const sep = sourceValue.indexOf(":");
    const type = sourceValue.slice(0, sep);
    const name = sourceValue.slice(sep + 1);
    if (!form.elements.name.value.trim()) form.elements.name.value = name;
    if (!form.elements.unit.value.trim()) form.elements.unit.value = type === "gold" ? "grams" : "";
  });

  on("storageDialog", "close", () => {
    const dialog = document.getElementById("storageDialog");
    if (!dialog || dialog.returnValue !== "save") return;
    const form = document.getElementById("storageForm");
    if (!form) return;
    storageAssets.push({
      name: form.elements.name.value.trim(),
      quantity: Number(form.elements.quantity.value),
      unit: form.elements.unit.value.trim() || "units",
      rate: Number(form.elements.rate.value),
      rateSource: form.elements.rateSource.value || "manual"
    });
    saveSetting(keys.storage, storageAssets);
    renderAll();
  });

  on("storageCards", "input", (event) => {
    const input = event.target.closest("[data-storage-index]");
    if (!input) return;
    const index = Number(input.dataset.storageIndex);
    const field = input.dataset.storageField;
    if (storageAssets[index]) {
      storageAssets[index][field] = Number(input.value);
      const card = input.closest(".asset-card");
      if (field === "rate") {
        storageAssets[index].rateSource = "manual";
        const select = card?.querySelector("[data-storage-rate-index]");
        if (select) select.value = "manual";
      }
      saveSetting(keys.storage, storageAssets);
      renderStorageTotals();
      const valueEl = card?.querySelector("[data-storage-value]");
      if (valueEl) valueEl.textContent = money(storageValue(storageAssets[index]));
    }
  });

  on("storageCards", "change", (event) => {
    const select = event.target.closest("[data-storage-rate-index]");
    if (!select) return;
    const index = Number(select.dataset.storageRateIndex);
    const sourceValue = select.value;
    if (storageAssets[index]) {
      storageAssets[index].rateSource = sourceValue;
      const resolved = resolveRateSourceValue(sourceValue);
      if (resolved !== null) {
        storageAssets[index].rate = resolved;
      }
      saveSetting(keys.storage, storageAssets);
      renderStorage();
    }
  });

  on("storageCards", "click", async (event) => {
    const button = event.target.closest("[data-storage-delete]");
    if (!button) return;
    const index = Number(button.dataset.storageDelete);
    const asset = storageAssets[index];
    const confirmed = await confirmAction("Delete Asset", `Delete storage asset "${asset ? asset.name : ""}"?`);
    if (!confirmed) return;
    storageAssets.splice(index, 1);
    saveSetting(keys.storage, storageAssets);
    renderAll();
  });

  on("addAsf", "click", () => {
    const form = document.getElementById("asfForm");
    if (form) form.reset();
    const dlg = document.getElementById("asfDialog");
    if (dlg) dlg.showModal();
  });

  on("asfDialog", "close", () => {
    const dialog = document.getElementById("asfDialog");
    if (!dialog || dialog.returnValue !== "save") return;
    const form = document.getElementById("asfForm");
    if (!form) return;
    asfJobs.push({
      date: form.elements.date.value,
      invoice: Number(form.elements.invoice.value),
      actual: Number(form.elements.actual.value),
      egp: Number(form.elements.egp.value)
    });
    saveSetting(keys.asf, asfJobs);
    renderAll();
  });

  on("asfTable", "click", async (event) => {
    const button = event.target.closest("[data-asf-delete]");
    if (!button) return;
    const index = Number(button.dataset.asfDelete);
    const confirmed = await confirmAction("Delete Invoice", "Delete this ASF invoice entry?");
    if (!confirmed) return;
    asfJobs.splice(index, 1);
    saveSetting(keys.asf, asfJobs);
    renderAll();
  });

  on("addIrq", "click", () => {
    const form = document.getElementById("irqForm");
    if (form) form.reset();
    const dlg = document.getElementById("irqDialog");
    if (dlg) dlg.showModal();
  });

  on("irqDialog", "close", () => {
    const dialog = document.getElementById("irqDialog");
    if (!dialog || dialog.returnValue !== "save") return;
    const form = document.getElementById("irqForm");
    if (!form) return;
    irqJobs.push({
      label: form.elements.label.value.trim(),
      value: Number(form.elements.value.value),
      note: form.elements.note.value.trim()
    });
    saveSetting(keys.irq, irqJobs);
    renderAll();
  });

  on("irqCards", "click", async (event) => {
    const button = event.target.closest("[data-irq-delete]");
    if (!button) return;
    const index = Number(button.dataset.irqDelete);
    const confirmed = await confirmAction("Delete IRQ Work", "Delete this IRQ work item?");
    if (!confirmed) return;
    irqJobs.splice(index, 1);
    saveSetting(keys.irq, irqJobs);
    renderAll();
  });

  on("editCurrencies", "click", async () => {
    const button = document.getElementById("editCurrencies");
    if (!button) return;
    const originalLabel = button.textContent;
    button.textContent = "Fetching…";
    button.disabled = true;

    try {
      const liveRates = await fetchLiveCurrencyRates();
      const changes = [];
      const updated = ratesData.currencies.map((currency) => {
        const mid = egpPerUnit(liveRates, currency.name.toUpperCase());
        if (mid === null) return currency;
        const spreadPct = computeSpreadPct(currency.sell, currency.buy);
        const next = applySpread(mid, spreadPct);
        changes.push(`${currency.name}: ${currency.sell}/${currency.buy} \u2192 ${next.sell}/${next.buy}`);
        return { ...currency, ...next };
      });

      if (!changes.length) {
        alert("None of the saved currencies matched the live feed.");
        return;
      }

      const confirmed = await confirmAction(
        "Update Live Currency Rates",
        `Update currency rates from market data?\n\n${changes.join("\n")}`,
        "Update"
      );
      if (!confirmed) return;

      ratesData.currencies = updated;
      saveSetting(keys.rates, ratesData);
      syncStorageRates();
      renderAll();
    } catch (err) {
      console.error("Live currency rate fetch failed:", err);
      const manual = confirm("Couldn't fetch live rates (offline or rate service unavailable). Enter rate manually?");
      if (manual) openManualCurrencyEdit();
    } finally {
      button.textContent = originalLabel;
      button.disabled = false;
    }
  });

  on("editGold", "click", async () => {
    const button = document.getElementById("editGold");
    if (!button) return;
    const originalLabel = button.textContent;
    button.textContent = "Fetching…";
    button.disabled = true;

    try {
      const [liveRates, xauUsd] = await Promise.all([fetchLiveCurrencyRates(), fetchLiveGoldSpotUsd()]);
      const egpPerOz = xauUsd * liveRates.EGP;
      const egpPerGram24k = egpPerOz / TROY_OUNCE_GRAMS;

      const changes = [];
      const skipped = [];
      const updated = ratesData.gold.map((item) => {
        const match = item.name.match(/(\d+)/);
        if (!match) {
          skipped.push(item.name);
          return item;
        }
        const karat = Number(match[1]);
        const mid = egpPerGram24k * (karat / 24);
        const spreadPct = computeSpreadPct(item.sell, item.buy);
        const next = applySpread(mid, spreadPct);
        changes.push(`${item.name}: ${item.sell}/${item.buy} \u2192 ${next.sell}/${next.buy}`);
        return { ...item, ...next };
      });

      if (!changes.length) {
        alert('None of the saved gold entries could be matched to a karat (e.g. "Gold 21").');
        return;
      }

      let message = `Update gold rates from spot price?\n\n${changes.join("\n")}`;
      if (skipped.length) message += `\n\nSkipped (no karat in name): ${skipped.join(", ")}`;

      const confirmed = await confirmAction("Update Live Gold Rates", message, "Update");
      if (!confirmed) return;

      ratesData.gold = updated;
      saveSetting(keys.rates, ratesData);
      syncStorageRates();
      renderAll();
    } catch (err) {
      console.error("Live gold rate fetch failed:", err);
      const manual = confirm("Couldn't fetch live gold price. Enter rate manually?");
      if (manual) openManualGoldEdit();
    } finally {
      button.textContent = originalLabel;
      button.disabled = false;
    }
  });

  on("rateDialog", "close", () => {
    const dialog = document.getElementById("rateDialog");
    if (!dialog || dialog.returnValue !== "save") return;
    const form = document.getElementById("rateForm");
    if (!form) return;
    const name = form.elements.name.value.trim();
    const sell = Number(form.elements.sell.value);
    const buy = Number(form.elements.buy.value);

    const isCurrency = ratesData.currencies.some((c) => c.name === name);
    if (isCurrency) {
      const idx = ratesData.currencies.findIndex((c) => c.name === name);
      ratesData.currencies[idx] = { name, sell, buy };
    } else {
      const idx = ratesData.gold.findIndex((g) => g.name === name);
      if (idx !== -1) ratesData.gold[idx] = { name, sell, buy };
    }

    saveSetting(keys.rates, ratesData);
    syncStorageRates();
    renderAll();
  });

  // History sub-tab switcher
  document.addEventListener("click", (event) => {
    const tabBtn = event.target.closest(".subnav-tab[data-history-tab]");
    if (!tabBtn) return;
    const tabKey = tabBtn.dataset.historyTab;
    document.querySelectorAll(".subnav-tab[data-history-tab]").forEach((btn) => {
      const isActive = btn.dataset.historyTab === tabKey;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    const summaryPane = document.getElementById("historySummaryPane");
    const transPane = document.getElementById("historyTransactionsPane");
    if (summaryPane && transPane) {
      summaryPane.hidden = tabKey !== "summary";
      summaryPane.classList.toggle("active", tabKey === "summary");
      transPane.hidden = tabKey !== "transactions";
      transPane.classList.toggle("active", tabKey === "transactions");
    }
  });

  // History filters
  on("historyMonthFilter", "change", () => renderHistory());
  on("historyTypeFilter", "change", () => renderHistory());
  on("historyAccountFilter", "change", () => renderHistory());
  on("historySearch", "input", debounce(renderHistory, 180));
  on("historyFiltersReset", "click", () => {
    const monthEl = document.getElementById("historyMonthFilter");
    if (monthEl) monthEl.value = "all";
    const typeEl = document.getElementById("historyTypeFilter");
    if (typeEl) typeEl.value = "all";
    const accEl = document.getElementById("historyAccountFilter");
    if (accEl) accEl.value = "all";
    const searchEl = document.getElementById("historySearch");
    if (searchEl) searchEl.value = "";
    renderHistory();
  });

  // History inline actual input
  document.addEventListener("keydown", async (event) => {
    const input = event.target.closest("[data-history-entry-input]");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    await commitHistoryEntryActual(input);
  });

  document.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-history-entry-input]");
    if (!input) return;
    await commitHistoryEntryActual(input);
  });

  // History clear entry actual
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-entry-clear]");
    if (!button) return;
    event.stopPropagation();
    const entryId = button.dataset.historyEntryClear;
    if (entryId) {
      await clearHistoryEntryActual(entryId);
    }
  });
}

// --- GitHub Gist Cloud Sync Engine ---
let gistSyncDebounceTimer = null;

function getGistConfig() {
  const token = localStorage.getItem(keys.gistToken) || "";
  const gistId = localStorage.getItem(keys.gistId) || "";
  const autoSyncRaw = localStorage.getItem(keys.gistAutoSync);
  const autoSync = autoSyncRaw === null ? true : autoSyncRaw === "true";
  return { token: token.trim(), gistId: gistId.trim(), autoSync };
}

function updateGistSyncStatus(statusText, className) {
  const pill = document.getElementById("gistSyncStatus");
  if (!pill) return;
  pill.textContent = statusText;
  pill.className = `sync-pill ${className || ""}`;
}

function getFullBudgetPayload() {
  return {
    app: "budget-control",
    exportedAt: new Date().toISOString(),
    seedVersion,
    data: {
      salaryPattern,
      salaryAnchorMonth,
      cashEntries,
      installments,
      storageAssets,
      accountBalances,
      asfJobs,
      ratesData,
      irqJobs,
      creditDues,
      creditDueMonths,
      entryActuals,
      deletedForecasts,
      archivedEntries,
      categoryCaps,
      savingsGoals
    }
  };
}

function applyIncomingDataPayload(incoming) {
  if (!incoming || typeof incoming !== "object") return;
  let updatedAny = false;

  Object.entries(exportableDataKeys).forEach(([dataKey, storageKey]) => {
    if (incoming[dataKey] !== undefined) {
      const currentVal = localStorage.getItem(storageKey);
      const incomingVal = JSON.stringify(incoming[dataKey]);
      if (currentVal !== incomingVal) {
        localStorage.setItem(storageKey, incomingVal);
        updatedAny = true;
      }
    }
  });

  if (updatedAny) {
    localStorage.setItem(keys.salaryMaterialized, "true");
    localStorage.setItem(keys.seedVersion, seedVersion);
    location.reload();
  }
}

async function pushToGist(token, gistId, silent = false, force = false) {
  if (!token || !gistId) {
    if (!silent) alert("Please enter both a GitHub PAT token and a Gist ID.");
    return false;
  }

  // Safety check: Avoid overwriting cloud data with empty local state unless explicitly forced
  const localHasData = cashEntries.length > 0 || installments.length > 0 || storageAssets.length > 0;
  if (!localHasData && !force) {
    try {
      const checkRes = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json"
        }
      });
      if (checkRes.ok) {
        const gistData = await checkRes.json();
        const budgetFile = gistData.files && gistData.files["budget-data.json"];
        if (budgetFile && budgetFile.content) {
          const payload = JSON.parse(budgetFile.content);
          const incoming = payload && typeof payload === "object" ? (payload.data || payload) : null;
          const cloudHasData = incoming && (
            (incoming.cashEntries && incoming.cashEntries.length > 0) ||
            (incoming.installments && incoming.installments.length > 0) ||
            (incoming.storageAssets && incoming.storageAssets.length > 0)
          );
          if (cloudHasData) {
            console.log("Cloud Gist contains data while local browser is empty. Pulling cloud data.");
            return await pullFromGist(token, gistId, silent);
          }
        }
      }
    } catch (e) {
      console.warn("Safety check failed, proceeding:", e);
    }
  }

  updateGistSyncStatus("Syncing...", "syncing");

  try {
    const payload = getFullBudgetPayload();
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        description: "Budget Control App Backup Data",
        files: {
          "budget-data.json": {
            content: JSON.stringify(payload, null, 2)
          }
        }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    updateGistSyncStatus("Synced", "synced");
    const msgEl = document.getElementById("gistSyncMessage");
    if (msgEl && !silent) {
      msgEl.style.display = "block";
      msgEl.style.background = "rgba(31,122,77,0.1)";
      msgEl.style.color = "var(--green)";
      msgEl.textContent = "Successfully saved and pushed to GitHub Gist!";
    }
    return true;
  } catch (err) {
    console.error("Gist push failed:", err);
    updateGistSyncStatus("Error", "error");
    if (!silent) {
      const msgEl = document.getElementById("gistSyncMessage");
      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.style.background = "rgba(184,70,63,0.1)";
        msgEl.style.color = "var(--red)";
        msgEl.textContent = `Sync Error: ${err.message}`;
      }
    }
    return false;
  }
}

function findBudgetFileInGist(gistFiles) {
  if (!gistFiles) return null;
  if (gistFiles["budget-data.json"]) return gistFiles["budget-data.json"];
  const fileKeys = Object.keys(gistFiles);
  const jsonKey = fileKeys.find((k) => k.endsWith(".json"));
  if (jsonKey) return gistFiles[jsonKey];
  if (fileKeys.length > 0) return gistFiles[fileKeys[0]];
  return null;
}

async function inspectGistData() {
  const tokenInput = document.getElementById("gistTokenInput");
  const gistIdInput = document.getElementById("gistIdInput");
  const token = (tokenInput ? tokenInput.value.trim() : "") || getGistConfig().token;
  const gistId = (gistIdInput ? gistIdInput.value.trim() : "") || getGistConfig().gistId;
  const inspectorBox = document.getElementById("gistInspectorBox");
  const detailsEl = document.getElementById("gistInspectorDetails");

  if (!inspectorBox || !detailsEl) return;
  inspectorBox.style.display = "block";

  if (!token || !gistId) {
    detailsEl.style.color = "var(--amber)";
    detailsEl.textContent = "Please enter both Personal Access Token and Gist ID above first.";
    return;
  }

  detailsEl.style.color = "var(--muted)";
  detailsEl.textContent = "Fetching Gist status from GitHub API...";

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json"
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const gistData = await res.json();
    const budgetFile = findBudgetFileInGist(gistData.files);

    if (!budgetFile || !budgetFile.content) {
      detailsEl.style.color = "var(--red)";
      detailsEl.textContent = "⚠️ Gist found, but contains no valid budget JSON file.";
      return;
    }

    let payload;
    try {
      payload = JSON.parse(budgetFile.content);
    } catch (e) {
      detailsEl.style.color = "var(--red)";
      detailsEl.textContent = "⚠️ Gist file found, but JSON parsing failed.";
      return;
    }

    const incoming = payload && typeof payload === "object" ? (payload.data || payload) : null;
    if (!incoming || typeof incoming !== "object") {
      detailsEl.style.color = "var(--red)";
      detailsEl.textContent = "⚠️ Gist JSON structure does not match Budget Control format.";
      return;
    }

    const cashCount = Array.isArray(incoming.cashEntries) ? incoming.cashEntries.length : 0;
    const installmentsCount = Array.isArray(incoming.installments) ? incoming.installments.length : 0;
    const storageCount = Array.isArray(incoming.storageAssets) ? incoming.storageAssets.length : 0;
    const exportTime = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : "Unknown date";

    detailsEl.style.color = "var(--ink)";
    detailsEl.innerHTML = `
      <ul style="margin: 4px 0 0; padding-left: 18px;">
        <li><strong>File Name:</strong> ${escapeHtml(budgetFile.filename || "budget-data.json")} (${(budgetFile.size / 1024).toFixed(1)} KB)</li>
        <li><strong>Export Date:</strong> ${escapeHtml(exportTime)}</li>
        <li><strong>Cashflow Entries:</strong> ${cashCount} entries</li>
        <li><strong>Installments:</strong> ${installmentsCount} items</li>
        <li><strong>Storage Assets:</strong> ${storageCount} items</li>
      </ul>
    `;
  } catch (err) {
    console.error("Gist inspection failed:", err);
    detailsEl.style.color = "var(--red)";
    detailsEl.textContent = `Error connecting to Gist: ${err.message}`;
  }
}

async function pullFromGist(token, gistId, silent = false) {
  if (!token || !gistId) {
    if (!silent) alert("Please enter both a GitHub PAT token and a Gist ID.");
    return false;
  }

  updateGistSyncStatus("Pulling...", "syncing");

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json"
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const gistData = await res.json();
    const budgetFile = findBudgetFileInGist(gistData.files);
    if (!budgetFile || !budgetFile.content) {
      throw new Error("No valid JSON file found in this Gist.");
    }

    const payload = JSON.parse(budgetFile.content);
    const incoming = payload && typeof payload === "object" ? (payload.data || payload) : null;
    if (!incoming || typeof incoming !== "object") {
      throw new Error("Invalid budget data format inside Gist.");
    }

    applyIncomingDataPayload(incoming);
    updateGistSyncStatus("Synced", "synced");
    return true;
  } catch (err) {
    console.error("Gist pull failed:", err);
    updateGistSyncStatus("Error", "error");
    if (!silent) {
      const msgEl = document.getElementById("gistSyncMessage");
      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.style.background = "rgba(184,70,63,0.1)";
        msgEl.style.color = "var(--red)";
        msgEl.textContent = `Pull Error: ${err.message}`;
      }
    }
    return false;
  }
}

async function findUserGists(token) {
  if (!token) return [];
  try {
    const res = await fetch("https://api.github.com/gists?per_page=100", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json"
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const gists = await res.json();
    return gists.filter((g) => {
      if (!g.files) return false;
      const fileNames = Object.keys(g.files);
      return fileNames.some((name) => name === "budget-data.json" || name.includes("budget"));
    });
  } catch (e) {
    console.error("Failed to fetch user Gists:", e);
    throw e;
  }
}

async function createPrivateGist(token) {
  if (!token) {
    alert("Please enter a GitHub Personal Access Token first.");
    return null;
  }

  updateGistSyncStatus("Creating...", "syncing");

  try {
    const payload = getFullBudgetPayload();
    const res = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        description: "Budget Control App Backup Data (Private)",
        public: false,
        files: {
          "budget-data.json": {
            content: JSON.stringify(payload, null, 2)
          }
        }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      let msg = err.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403 || res.status === 404 || msg.includes("Resource not accessible")) {
        msg += "\n\n🔑 GitHub Token Requirement:\n" +
               "• Classic Token (ghp_...): Ensure the 'gist' checkbox is checked.\n" +
               "• Fine-Grained Token (github_pat_...): Under 'Account Permissions', set 'Gists' to 'Read and write'.";
      }
      throw new Error(msg);
    }

    const created = await res.json();
    updateGistSyncStatus("Synced", "synced");
    return created.id;
  } catch (err) {
    console.error("Failed to create Gist:", err);
    updateGistSyncStatus("Error", "error");
    alert(`Failed to create Gist:\n${err.message}`);
    return null;
  }
}

function triggerAutoGistSync() {
  const { token, gistId, autoSync } = getGistConfig();
  if (!token || !gistId || !autoSync) {
    if (token && gistId) {
      updateGistSyncStatus("Ready", "");
    } else {
      updateGistSyncStatus("Setup", "");
    }
    return;
  }

  updateGistSyncStatus("Unsaved", "unsaved");
  if (gistSyncDebounceTimer) clearTimeout(gistSyncDebounceTimer);
  gistSyncDebounceTimer = setTimeout(() => {
    pushToGist(token, gistId, true);
  }, 2500);
}

function setupGistSyncEventListeners() {
  on("gistSyncBtn", "click", () => {
    const dialog = document.getElementById("gistSyncDialog");
    if (!dialog) return;

    const { token, gistId, autoSync } = getGistConfig();
    const tokenInput = document.getElementById("gistTokenInput");
    const gistIdInput = document.getElementById("gistIdInput");
    const autoSyncCheckbox = document.getElementById("gistAutoSyncCheckbox");
    const msgEl = document.getElementById("gistSyncMessage");

    if (tokenInput) tokenInput.value = token;
    if (gistIdInput) gistIdInput.value = gistId;
    if (autoSyncCheckbox) autoSyncCheckbox.checked = autoSync;
    if (msgEl) msgEl.style.display = "none";

    dialog.showModal();
    if (token && gistId) {
      inspectGistData();
    }
  });

  on("gistFindBtn", "click", async () => {
    const tokenInput = document.getElementById("gistTokenInput");
    const token = tokenInput ? tokenInput.value.trim() : "";
    const msgEl = document.getElementById("gistSyncMessage");

    if (!token) {
      alert("Please paste your GitHub Personal Access Token (PAT) first.");
      return;
    }

    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.background = "rgba(47,95,159,0.1)";
      msgEl.style.color = "var(--blue)";
      msgEl.textContent = "🔍 Searching your GitHub account for your existing budget Gists...";
    }

    try {
      const foundGists = await findUserGists(token);
      if (foundGists.length === 0) {
        if (msgEl) {
          msgEl.style.display = "block";
          msgEl.style.background = "rgba(164,106,24,0.1)";
          msgEl.style.color = "var(--amber)";
          msgEl.textContent = "No existing budget Gist found under this token. Click 'Auto-Create Gist' below to create one!";
        }
        return;
      }

      const bestGist = foundGists[0];
      const gistIdInput = document.getElementById("gistIdInput");
      if (gistIdInput) gistIdInput.value = bestGist.id;

      localStorage.setItem(keys.gistToken, token);
      localStorage.setItem(keys.gistId, bestGist.id);
      localStorage.setItem(keys.gistAutoSync, "true");

      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.style.background = "rgba(31,122,77,0.1)";
        msgEl.style.color = "var(--green)";
        msgEl.textContent = `Found your Cloud Gist (ID: ${bestGist.id})! Downloading your data now...`;
      }

      await inspectGistData();
      await pullFromGist(token, bestGist.id, false);
    } catch (err) {
      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.style.background = "rgba(184,70,63,0.1)";
        msgEl.style.color = "var(--red)";
        msgEl.textContent = `Error searching Gists: ${err.message}. Make sure your token has 'gist' permission.`;
      }
    }
  });

  on("gistInspectBtn", "click", () => {
    inspectGistData();
  });

  on("gistPushBtn", "click", async () => {
    const tokenInput = document.getElementById("gistTokenInput");
    const gistIdInput = document.getElementById("gistIdInput");
    const autoSyncCheckbox = document.getElementById("gistAutoSyncCheckbox");

    const token = tokenInput ? tokenInput.value.trim() : "";
    const gistId = gistIdInput ? gistIdInput.value.trim() : "";
    const autoSync = autoSyncCheckbox ? autoSyncCheckbox.checked : true;

    if (!token || !gistId) {
      alert("Please provide both Personal Access Token and Gist ID, or click 'Auto-Create Gist'.");
      return;
    }

    localStorage.setItem(keys.gistToken, token);
    localStorage.setItem(keys.gistId, gistId);
    localStorage.setItem(keys.gistAutoSync, String(autoSync));

    const confirmed = await confirmAction(
      "Upload Local Data to GitHub Gist",
      "This will replace the budget data stored in your GitHub Gist with the current data in this browser. Continue?",
      "Upload Data"
    );
    if (!confirmed) return;

    await pushToGist(token, gistId, false, true);
  });

  on("gistShareBtn", "click", (e) => {
    e.preventDefault();
    const gistIdInput = document.getElementById("gistIdInput");
    const gistId = (gistIdInput ? gistIdInput.value.trim() : "") || getGistConfig().gistId;

    if (!gistId) {
      alert("No Gist ID found. Please create or enter a Gist ID first.");
      return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}#gist=${encodeURIComponent(gistId)}`;
    const shareBtn = document.getElementById("gistShareBtn");
    const originalText = shareBtn ? shareBtn.textContent : "🔗 Copy Sync Link";

    const copyToClipboard = (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          const successful = document.execCommand("copy");
          document.body.removeChild(textarea);
          return successful ? Promise.resolve() : Promise.reject(new Error("execCommand failed"));
        } catch (err) {
          document.body.removeChild(textarea);
          return Promise.reject(err);
        }
      }
    };

    copyToClipboard(shareUrl)
      .then(() => {
        if (shareBtn) shareBtn.textContent = "Copied! ✓";
        const msgEl = document.getElementById("gistSyncMessage");
        if (msgEl) {
          msgEl.style.display = "block";
          msgEl.style.background = "rgba(31,122,77,0.1)";
          msgEl.style.color = "var(--green)";
          msgEl.textContent = "🔗 Sync Link copied to clipboard! Open this link on your other device to connect.";
        }
        setTimeout(() => {
          if (shareBtn) shareBtn.textContent = originalText;
        }, 3000);
      })
      .catch(() => {
        prompt("Copy this Sync Link for your other devices:", shareUrl);
      });
  });

  on("gistPullBtn", "click", async () => {
    const { token, gistId } = getGistConfig();
    if (!token || !gistId) {
      alert("Please enter and save your PAT token and Gist ID first.");
      return;
    }

    await pullFromGist(token, gistId, false);
  });

  on("gistCreateBtn", "click", async () => {
    const tokenInput = document.getElementById("gistTokenInput");
    const token = tokenInput ? tokenInput.value.trim() : "";
    if (!token) {
      alert("Please enter your GitHub Personal Access Token first.");
      return;
    }

    const createdId = await createPrivateGist(token);
    if (createdId) {
      const gistIdInput = document.getElementById("gistIdInput");
      if (gistIdInput) gistIdInput.value = createdId;

      localStorage.setItem(keys.gistToken, token);
      localStorage.setItem(keys.gistId, createdId);
      localStorage.setItem(keys.gistAutoSync, "true");

      const msgEl = document.getElementById("gistSyncMessage");
      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.style.background = "rgba(31,122,77,0.1)";
        msgEl.style.color = "var(--green)";
        msgEl.textContent = `Private Gist created successfully! (ID: ${createdId})`;
      }
    }
  });

  on("gistDisconnectBtn", "click", () => {
    localStorage.removeItem(keys.gistToken);
    localStorage.removeItem(keys.gistId);
    localStorage.removeItem(keys.gistAutoSync);
    sessionStorage.removeItem("gist_auto_pulled");

    const tokenInput = document.getElementById("gistTokenInput");
    const gistIdInput = document.getElementById("gistIdInput");
    if (tokenInput) tokenInput.value = "";
    if (gistIdInput) gistIdInput.value = "";

    updateGistSyncStatus("Setup", "");

    const msgEl = document.getElementById("gistSyncMessage");
    if (msgEl) {
      msgEl.style.display = "block";
      msgEl.style.background = "rgba(164,106,24,0.1)";
      msgEl.style.color = "var(--amber)";
      msgEl.textContent = "Disconnected from GitHub Gist.";
    }
  });
}

function initGistSync() {
  // Auto-detect Gist ID from URL hash (e.g. #gist=xxxx)
  if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const urlGistId = hashParams.get("gist");
    if (urlGistId) {
      localStorage.setItem(keys.gistId, urlGistId.trim());
      history.replaceState(null, "", window.location.pathname + window.location.search);

      setTimeout(() => {
        const dialog = document.getElementById("gistSyncDialog");
        if (dialog) {
          const tokenInput = document.getElementById("gistTokenInput");
          const gistIdInput = document.getElementById("gistIdInput");
          const msgEl = document.getElementById("gistSyncMessage");

          if (gistIdInput) gistIdInput.value = urlGistId.trim();
          const { token } = getGistConfig();
          if (tokenInput) tokenInput.value = token;

          if (msgEl) {
            msgEl.style.display = "block";
            msgEl.style.background = "rgba(47,95,159,0.1)";
            msgEl.style.color = "var(--blue)";
            msgEl.textContent = "Gist ID detected from Sync Link! Enter your GitHub PAT token to connect.";
          }
          dialog.showModal();
        }
      }, 300);
    }
  }

  const { token, gistId } = getGistConfig();
  if (token && gistId) {
    updateGistSyncStatus("Synced", "synced");
    // Automatically pull latest data from Gist on startup (once per session tab)
    if (!sessionStorage.getItem("gist_auto_pulled")) {
      sessionStorage.setItem("gist_auto_pulled", "true");
      pullFromGist(token, gistId, true);
    }
  } else {
    updateGistSyncStatus("Setup", "");
  }
}

function initApp() {
  try {
    initTheme();
    materializeLegacySalaryEntries();
    updateUndoResetVisibility();
    setupEventListeners();
    renderAll();
    initGistSync();
  } catch (e) {
    console.error("Error during app initialization:", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
