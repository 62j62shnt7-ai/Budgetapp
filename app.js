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
  partTimeJobs: "budget-control-part-time-jobs",
  creditDues: "budget-control-credit-dues",
  creditDueMonths: "budget-control-credit-due-months",
  entryActuals: "budget-control-entry-actuals",
  entryActualDates: "budget-control-entry-actual-dates",
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
  gistAutoSync: "budget-control-gist-autosync",
  historyAdminUnlocked: "budget-control-history-admin-unlocked",
  forecastLineMonths: "budget-control-forecast-line-months",
  forecastLineMode: "budget-control-forecast-line-mode",
  sidebarCollapsed: "budget-control-sidebar-collapsed",
  salaryStructureCollapsed: "budget-control-salary-collapsed",
  installmentsCollapsed: "budget-control-installments-collapsed",
  expenseMixCollapsed: "budget-control-expense-mix-collapsed",
  historyAnalyticsCollapsed: "budget-control-history-analytics-collapsed",
  historyAnalyticsView: "budget-control-history-analytics-view",
  historyAnalyticsGrouping: "budget-control-history-analytics-grouping",
  historyDistributionCollapsed: "budget-control-history-dist-collapsed",
  historyGroupedSummaryCollapsed: "budget-control-history-grouped-collapsed",
  creditSettlementOverrides: "budget-control-credit-settlement-overrides"
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
  partTimeJobs: keys.partTimeJobs,
  creditDues: keys.creditDues,
  creditDueMonths: keys.creditDueMonths,
  entryActuals: keys.entryActuals,
  entryActualDates: keys.entryActualDates,
  deletedForecasts: keys.deletedForecasts,
  archivedEntries: keys.archivedEntries,
  categoryCaps: keys.categoryCaps,
  savingsGoals: keys.savingsGoals,
  creditSettlementOverrides: keys.creditSettlementOverrides
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
const formatJobCurrency = (value, code) => {
  const val = Number(value) || 0;
  const curr = (code || "USD").toUpperCase();
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: val % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2
  }).format(val);
  switch (curr) {
    case "USD": return `$${formatted} USD`;
    case "EUR": return `€${formatted} EUR`;
    case "GBP": return `£${formatted} GBP`;
    case "EGP": return `${formatted} EGP`;
    case "SAR": return `${formatted} SAR (﷼)`;
    case "AED": return `${formatted} AED (د.إ)`;
    default: return `${formatted} ${curr}`;
  }
};

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
    // Calculate entry-by-entry cash floor for the clean runway insight
    const today = DateUtils.todayString();
    const sortedFuture = [...entries]
      .filter((e) => e.date && e.date >= today)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.type !== b.type) return a.type === "income" ? -1 : 1;
        return 0;
      });
    let runningFloor = actualCashNow;
    let minFloor = actualCashNow;
    let minDate = today;
    sortedFuture.forEach((e) => {
      runningFloor += Number(e.amount || 0) * (e.type === "income" ? 1 : -1);
      if (runningFloor < minFloor) {
        minFloor = runningFloor;
        minDate = e.date;
      }
    });
    const floorLabel = minDate === today ? `Lowest floor: ${money(minFloor)} (Current)` : `Lowest floor: ${money(minFloor)} on ${DateUtils.formatDisplayDate(minDate)}`;
    insights.push({
      icon: "✅",
      type: "success",
      text: `<strong>Clean Runway:</strong> Projected cash balance remains positive across all ${forecast.length} forecasted months (${floorLabel}).`
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

// --- Sidebar Management ---
function isMobileLayout() {
  return window.innerWidth <= 980;
}

function setMobileDrawer(open) {
  document.body.classList.toggle("mobile-sidebar-open", Boolean(open));
}

function applySidebarState(collapsed = sidebarCollapsed) {
  sidebarCollapsed = Boolean(collapsed);
  document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
  const expandBtn = document.getElementById("sidebarExpandBtn");
  if (expandBtn) {
    expandBtn.setAttribute("aria-expanded", String(!sidebarCollapsed));
    expandBtn.title = sidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)";
  }
  const collapseBtn = document.getElementById("sidebarCollapseBtn");
  if (collapseBtn) {
    collapseBtn.setAttribute("aria-expanded", String(!sidebarCollapsed));
  }
}

function toggleSidebar() {
  if (isMobileLayout()) {
    const isOpen = document.body.classList.contains("mobile-sidebar-open");
    setMobileDrawer(!isOpen);
    return;
  }
  sidebarCollapsed = !sidebarCollapsed;
  saveSetting(keys.sidebarCollapsed, sidebarCollapsed);
  applySidebarState(sidebarCollapsed);
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

// --- Subcategory & Tag Helpers ---
const defaultCategorySubcats = {
  Home: ["Food", "Groceries", "Bills", "Electricity", "Internet", "Water", "Maintenance", "Cleaning", "Furniture", "Household"],
  Bills: ["Bills", "Electricity", "Internet", "Water", "Mobile Phone", "Gas", "Subscriptions", "Insurance"],
  Training: ["Courses", "Gym", "Books", "Certifications", "Coaching"],
  Kids: ["Kids", "School", "Clothes", "Toys", "Activities", "Medical", "Supplies"],
  Transportation: ["Kids", "Fuel", "Uber / Careem", "Maintenance", "Parking", "Tolls", "License"],
  Garage: ["Rent", "Maintenance", "Tools"],
  Other: ["Gifts", "Personal", "Dining Out", "Shopping", "Charity", "Healthcare"]
};

function inferTagForEntry(entry) {
  if (!entry) return "";
  const cat = (entry.category || "").toLowerCase().trim();
  const src = (entry.source || "").toLowerCase().trim();
  const cType = (entry.creditType || "").toLowerCase().trim();
  const acc = (entry.account || "").toLowerCase().trim();
  const id = (entry.id || "").toLowerCase();

  // 1. Credit Due / Settlement
  if (
    id.startsWith("credit-settlement-") ||
    src === "recurring credit" ||
    entry.isCreditSettlement ||
    cType === "cib" ||
    cType === "hsbc" ||
    cat.includes("credit due") ||
    cat.includes("cib credit") ||
    cat.includes("hsbc credit")
  ) {
    return "Credit";
  }

  // 2. Loans & Repayments
  if (
    src === "loan" ||
    Boolean(entry.loanId) ||
    cat.startsWith("loan inflow") ||
    cat.startsWith("loan repayment") ||
    cat.includes("repayment") ||
    cat.includes("bridge loan") ||
    cat === "loan"
  ) {
    return "Loan";
  }

  // 3. Garage / Rent
  if (cat === "garage" || cat.startsWith("garage") || cat.includes("rent")) {
    return "Rent";
  }

  // 4. Salary / Income patterns
  if (
    src === "salary" ||
    cat === "salary" ||
    cat.includes("profit share") ||
    cat.includes("bonus")
  ) {
    return "Salary";
  }

  // 5. Part-Time / Freelance Jobs
  if (
    src === "part-time job" ||
    cat.includes("barakat") ||
    cat.includes("jadeela") ||
    cat.includes("asf") ||
    cat.includes("irq")
  ) {
    return "Part-Time";
  }

  // 6. Bills & Utilities
  if (
    cat.includes("electric") ||
    cat.includes("mobile") ||
    cat.includes("phone") ||
    cat.includes("internet") ||
    cat.includes("wifi") ||
    cat.includes("gas") ||
    cat.includes("water") ||
    cat.includes("utility") ||
    cat === "bills"
  ) {
    return "Bills";
  }

  // 7. Kids & School
  if (
    cat.includes("kids") ||
    cat.includes("course") ||
    cat.includes("school") ||
    cat.includes("tuition") ||
    cat.includes("nursery") ||
    cat === "transportation"
  ) {
    return "Kids";
  }

  // 8. Food & Groceries
  if (
    cat === "home" ||
    cat.includes("food") ||
    cat.includes("grocer") ||
    cat.includes("supermarket") ||
    cat.includes("market")
  ) {
    return "Food";
  }

  // 9. Maintenance & Fixes
  if (
    cat.includes("fix") ||
    cat.includes("repair") ||
    cat.includes("maintenance")
  ) {
    return "Maintenance";
  }

  // 10. Shopping
  if (cat.includes("amazon") || cat.includes("noon") || cat.includes("shopping")) {
    return "Shopping";
  }

  // 11. Medical / Health
  if (
    cat.includes("medical") ||
    cat.includes("pharmacy") ||
    cat.includes("doctor") ||
    cat.includes("hospital") ||
    cat.includes("medicine")
  ) {
    return "Medical";
  }

  // 12. General Credit Card / Travel / Fuel
  if (cat.includes("accommodation") || cat.includes("hotel") || cat.includes("fuel") || cat.includes("petrol")) {
    return "Expense";
  }

  return "";
}

function autoTagUntaggedEntries({ notify = false } = {}) {
  let taggedEntriesCount = 0;
  let taggedDrawsCount = 0;

  if (Array.isArray(cashEntries)) {
    cashEntries.forEach((entry) => {
      const currentTag = (entry.tag || "").trim();
      const inferred = inferTagForEntry(entry);

      if (!currentTag && inferred) {
        entry.tag = inferred;
        taggedEntriesCount++;
      }

      const activeTag = (entry.tag || "").trim() || inferred;
      if (Array.isArray(entry.draws)) {
        entry.draws.forEach((draw) => {
          if (!draw.tag || !draw.tag.trim()) {
            if (activeTag) {
              draw.tag = activeTag;
              taggedDrawsCount++;
            }
          }
        });
      }
    });
  }

  if (taggedEntriesCount > 0 || taggedDrawsCount > 0) {
    saveSetting(keys.entries, cashEntries);
    renderAll();
  }

  if (notify) {
    if (taggedEntriesCount === 0 && taggedDrawsCount === 0) {
      alert("All entries and payments already have tags! No untagged items were found.");
    } else {
      alert(`Auto-tagged ${taggedEntriesCount} budget entries and ${taggedDrawsCount} payment tranches.`);
    }
  }

  return { taggedEntriesCount, taggedDrawsCount };
}

function tryAutoFillEntryTag(form) {
  if (!form || !form.elements || !form.elements.tag) return;
  if (form.elements.tag.value && form.elements.tag.value.trim()) return;

  const mockEntry = {
    category: form.elements.category?.value || "",
    creditType: form.elements.creditType?.value || "",
    account: form.elements.account?.value || "",
    type: form.elements.type?.value || "",
    source: ""
  };
  const inferred = inferTagForEntry(mockEntry);
  if (inferred) {
    form.elements.tag.value = inferred;
  }
}

function updateSubcategorySuggestions(categoryName, datalistId = "subcatSuggestions") {
  const datalist = document.getElementById(datalistId);
  if (!datalist) return;
  const key = Object.keys(defaultCategorySubcats).find(
    (k) => k.toLowerCase() === (categoryName || "").toLowerCase().trim()
  );
  const suggestions = key ? defaultCategorySubcats[key] : [
    "Food", "Groceries", "Bills", "Electricity", "Internet", "Water", "Maintenance", "Fuel", "Dining Out", "Shopping"
  ];
  datalist.innerHTML = suggestions.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("");
}

function getEntryTags(entry) {
  if (!entry) return [];
  const tags = new Set();
  if (entry.tag && typeof entry.tag === "string" && entry.tag.trim()) {
    tags.add(entry.tag.trim());
  }
  if (Array.isArray(entry.draws)) {
    entry.draws.forEach((d) => {
      if (d && d.tag && typeof d.tag === "string" && d.tag.trim()) {
        tags.add(d.tag.trim());
      }
    });
  }
  return [...tags];
}

function renderSubcatTagPills(entry) {
  const tags = getEntryTags(entry);
  if (!tags.length) return "";
  return tags.map((t) => {
    const safeTag = escapeHtml(t);
    const lower = t.toLowerCase();
    let modifier = "";
    if (lower === "food" || lower === "groceries") modifier = " subcat-food";
    else if (lower === "bills" || lower === "utilities" || lower === "electricity" || lower === "water" || lower === "internet") modifier = " subcat-bills";
    return `<span class="subcat-tag-pill${modifier}" data-tag-filter-click="${safeTag}" title="Filter history by tag: ${safeTag}">🏷️ ${safeTag}</span>`;
  }).join(" ");
}

function promptAccountAdjustment(type, amount, defaultAccountKey = "cash", description = "", initialTag = "") {
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
    const tagField = document.getElementById("deductAccountTagField");
    const tagInput = document.getElementById("deductAccountTagInput");

    updateSubcategorySuggestions(description || "");

    if (tagField) {
      tagField.style.display = isIncome ? "none" : "block";
    }
    if (tagInput) {
      tagInput.value = initialTag || inferTagForEntry({ category: description, type, account: defaultAccountKey }) || "";
    }

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
      const selectedAccId = val === "confirm" ? (selectEl ? selectEl.value : null) : null;
      const chosenTag = (tagInput ? tagInput.value : "").trim();
      cleanup();
      dialog.close(val);
      resolve({
        accountId: selectedAccId,
        tag: chosenTag,
        toString() { return this.accountId || ""; }
      });
    };

    const handleCancel = () => {
      if (settled) return;
      settled = true;
      const chosenTag = (tagInput ? tagInput.value : "").trim();
      cleanup();
      resolve({
        accountId: null,
        tag: chosenTag,
        toString() { return ""; }
      });
    };

    const handleClose = () => {
      if (settled) return;
      settled = true;
      const chosenTag = (tagInput ? tagInput.value : "").trim();
      const returnVal = dialog.returnValue;
      const selectedAccId = returnVal === "confirm" ? (selectEl ? selectEl.value : null) : null;
      cleanup();
      resolve({
        accountId: selectedAccId,
        tag: chosenTag,
        toString() { return this.accountId || ""; }
      });
    };

    if (form) form.addEventListener("submit", handleSubmit);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    dialog.showModal();
  });
}

function adjustAccountBalance(accountId, amount, type = "expense") {
  const accKey = typeof accountId === "object" && accountId !== null ? accountId.accountId : accountId;
  if (!accKey || !accountBalances[accKey] || !amount || amount <= 0) return;
  const current = Number(accountBalances[accKey].balance || 0);
  const roundedAmount = Math.round(Number(amount) || 0);
  if ((type || "").toLowerCase() === "income") {
    accountBalances[accKey].balance = Math.round(current + roundedAmount);
  } else {
    accountBalances[accKey].balance = Math.round(current - roundedAmount);
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

function notifyStorageQuotaExceeded() {
  if (window._quotaAlertShown) return;
  window._quotaAlertShown = true;
  alert("⚠️ Browser Storage Quota Reached!\n\nYour browser's local storage is almost full. Please export a JSON backup immediately and archive old transactions or clear unused history to prevent data loss.");
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
    if (e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014)) {
      notifyStorageQuotaExceeded();
    }
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
let partTimeJobs = loadSetting(keys.partTimeJobs, null);
if (!partTimeJobs || !Array.isArray(partTimeJobs)) {
  partTimeJobs = [];
  if (Array.isArray(asfJobs) && asfJobs.length > 0) {
    asfJobs.forEach((item, idx) => {
      partTimeJobs.push({
        id: "job-legacy-asf-" + idx,
        title: "ASF Invoice #" + (idx + 1),
        client: "ASF",
        currency: "USD",
        type: "lumpsum",
        dailyRate: 0,
        lumpSumAmount: Number(item.invoice) || 0,
        daysWorked: [],
        expenses: [],
        status: item.actual > 0 ? "paid" : "invoiced",
        invoiceDate: item.date || "",
        paidDate: item.actual > 0 ? item.date || "" : null,
        settlementAccount: "cib",
        actualPaidAmount: Number(item.actual) || Number(item.invoice) || 0,
        notes: item.egp ? `Original converted EGP: ${item.egp}` : ""
      });
    });
  }
  if (Array.isArray(irqJobs) && irqJobs.length > 0) {
    irqJobs.forEach((item, idx) => {
      partTimeJobs.push({
        id: "job-legacy-irq-" + idx,
        title: item.label || "IRQ Work",
        client: "IRQ",
        currency: "EGP",
        type: "lumpsum",
        dailyRate: 0,
        lumpSumAmount: Number(item.value) || 0,
        daysWorked: [],
        expenses: [],
        status: "paid",
        invoiceDate: "",
        paidDate: "",
        settlementAccount: "cib",
        actualPaidAmount: Number(item.value) || 0,
        notes: item.note || ""
      });
    });
  }
  saveSetting(keys.partTimeJobs, partTimeJobs);
}

// Ensure every job in partTimeJobs has a payments array for partial payments tracking
if (Array.isArray(partTimeJobs)) {
  let migratedPayments = false;
  partTimeJobs.forEach((job) => {
    if (!Array.isArray(job.payments)) {
      job.payments = [];
      migratedPayments = true;
      if (Number(job.actualPaidAmount) > 0) {
        job.payments.push({
          id: generateId(),
          date: job.paidDate || new Date().toISOString().slice(0, 10),
          amount: Number(job.actualPaidAmount),
          account: job.settlementAccount || "cib",
          paymentNote: job.paymentNote || "Settlement payment"
        });
      }
    }
  });
  if (migratedPayments) {
    saveSetting(keys.partTimeJobs, partTimeJobs);
  }
}
let creditDues = loadSetting(keys.creditDues, {});
let creditDueMonths = loadSetting(keys.creditDueMonths, {});
let creditSettlementOverrides = loadSetting(keys.creditSettlementOverrides, {});
let entryActuals = loadSetting(keys.entryActuals, {});
let entryActualDates = loadSetting(keys.entryActualDates, {});
let deletedForecasts = loadSetting(keys.deletedForecasts, []);
let archivedEntries = loadSetting(keys.archivedEntries, []);
let categoryCaps = loadSetting(keys.categoryCaps, defaultCategoryCaps);
let savingsGoals = loadSetting(keys.savingsGoals, defaultSavingsGoals);
let historyAdminUnlocked = loadSetting(keys.historyAdminUnlocked, false);
let sidebarCollapsed = loadSetting(keys.sidebarCollapsed, false);
let salaryStructureCollapsed = loadSetting(keys.salaryStructureCollapsed, false);
let installmentsCollapsed = loadSetting(keys.installmentsCollapsed, false);
let expenseMixCollapsed = loadSetting(keys.expenseMixCollapsed, false);
let historyAnalyticsCollapsed = loadSetting(
  keys.historyAnalyticsCollapsed,
  loadSetting(keys.historyDistributionCollapsed, false)
);
let historyAnalyticsView = loadSetting(keys.historyAnalyticsView, "chart");
let historyAnalyticsGrouping = loadSetting(keys.historyAnalyticsGrouping, "category");
let historyDistributionCollapsed = historyAnalyticsCollapsed;
let historyGroupedSummaryCollapsed = historyAnalyticsCollapsed;
let forecastLineRangeMonths = loadSetting(keys.forecastLineMonths, 12);
let forecastLineChartMode = loadSetting(keys.forecastLineMode, "entries");
let simulatedSpendAmount = 0;
let simulatedSpendDate = null;
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
      .filter((payment) => (Number(payment.monthOffset) || 0) === phase && (Number(payment.amount) || 0) > 0)
      .forEach((payment) => {
        const lastDay = DateUtils.getLastDayOfMonth(year, month + 1);
        const day = Math.min(Number(payment.day), lastDay);
        result.push({
          date: DateUtils.formatDate(year, month + 1, day),
          category: "salary",
          account: "hsbc",
          type: "income",
          amount: Number(payment.amount) || 0,
          source: "salary",
          tag: "Salary"
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

function buildRecurringEntries(baseEntry, optionsOrMonths) {
  let frequency = "monthly";
  let count = 1;
  let dayOfWeek = null;

  if (typeof optionsOrMonths === "number") {
    count = Math.max(1, optionsOrMonths);
  } else if (optionsOrMonths && typeof optionsOrMonths === "object") {
    frequency = optionsOrMonths.frequency || "monthly";
    count = Math.max(1, Number(optionsOrMonths.count) || 1);
    dayOfWeek = optionsOrMonths.dayOfWeek;
  }

  const result = [];
  const [startYear, startMonth, startDay] = (baseEntry.date || DateUtils.todayString()).split("-").map(Number);

  if (frequency === "weekly" || frequency === "biweekly") {
    const intervalWeeks = frequency === "biweekly" ? 2 : 1;
    const baseUtc = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    const baseDayOfWeek = baseUtc.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat

    let firstUtc = new Date(baseUtc);
    if (dayOfWeek !== null && dayOfWeek !== undefined && dayOfWeek !== "") {
      const targetDow = Number(dayOfWeek);
      const diffDays = (targetDow - baseDayOfWeek + 7) % 7;
      firstUtc.setUTCDate(firstUtc.getUTCDate() + diffDays);
    }

    for (let index = 0; index < count; index += 1) {
      const entryUtc = new Date(firstUtc);
      entryUtc.setUTCDate(firstUtc.getUTCDate() + index * (intervalWeeks * 7));
      const year = entryUtc.getUTCFullYear();
      const month = entryUtc.getUTCMonth() + 1;
      const day = entryUtc.getUTCDate();
      result.push({
        ...baseEntry,
        id: generateId(),
        date: DateUtils.formatDate(year, month, day),
        source: baseEntry.source || "expense"
      });
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      const targetMonthIndex = startMonth - 1 + index;
      const year = startYear + Math.floor(targetMonthIndex / 12);
      const month = (targetMonthIndex % 12) + 1;
      const lastDay = DateUtils.getLastDayOfMonth(year, month);
      result.push({
        ...baseEntry,
        id: generateId(),
        date: DateUtils.formatDate(year, month, Math.min(startDay, lastDay)),
        source: baseEntry.source || "expense"
      });
    }
  }
  return result;
}

// --- Credit Card Cycle & Settlement Calculations ---
function isCreditCardExpense(entry) {
  if (!entry || entry.type !== "expense") return false;
  const id = getEntryId(entry);
  if (id.startsWith("credit-settlement-")) return false;
  if (entry.source === "recurring credit" || entry.isCreditSettlement) return false;
  const cat = (entry.category || "").toLowerCase();
  if (cat.includes("credit due")) return false;
  const t = (entry.creditType || "").toLowerCase();
  const acc = (entry.account || "").toLowerCase();
  if (t === "cib_card" || t === "hsbc_card" || t === "cib-card" || t === "hsbc-card") return true;
  if ((t === "cib" || t === "hsbc") && !cat.includes("credit due")) return true;
  if (acc === "cib credit" || acc === "cib_credit" || acc === "cib-credit" || acc === "hsbc credit" || acc === "hsbc_credit" || acc === "hsbc-credit") return true;
  return false;
}

function isCardExpenseForAccount(entry, accountKey) {
  if (!isCreditCardExpense(entry)) return false;
  const t = (entry.creditType || "").toLowerCase();
  const acc = (entry.account || "").toLowerCase();
  const target = (accountKey || "").toLowerCase();
  if (target === "cib") {
    return t.includes("cib") || acc.includes("cib");
  }
  if (target === "hsbc") {
    return t.includes("hsbc") || acc.includes("hsbc");
  }
  return false;
}

function isCreditDueLumpSum(entry) {
  if (!entry || entry.type !== "expense") return false;
  if (isCreditCardExpense(entry)) return false;
  const id = getEntryId(entry);
  if (id.startsWith("credit-settlement-")) return true;
  const t = (entry.creditType || "").toLowerCase();
  const cat = (entry.category || "").toLowerCase();
  const acc = (entry.account || "").toLowerCase();
  if (t === "cib" || t === "hsbc") return true;
  if (cat.includes("credit due")) return true;
  if ((acc.includes("cib") || acc.includes("hsbc")) && cat.includes("credit")) return true;
  return false;
}

function isLumpCreditDueForAccount(entry, accountKey) {
  if (!entry || entry.type !== "expense") return false;
  if (isCreditCardExpense(entry)) return false;
  const id = getEntryId(entry);
  const target = (accountKey || "").toLowerCase();
  if (id.startsWith("credit-settlement-")) {
    const parts = id.split("-");
    return parts[2] === target;
  }
  const t = (entry.creditType || "").toLowerCase();
  const cat = (entry.category || "").toLowerCase();
  const acc = (entry.account || "").toLowerCase();
  if (t === target) return true;
  if (cat.includes("credit due") && (acc === target || acc.includes(target) || cat.includes(target))) return true;
  if (acc.includes(target) && cat.includes("credit")) return true;
  return false;
}

function calculateCreditSettlementDate(dateStr, creditType) {
  if (!dateStr) dateStr = DateUtils.todayString();
  const [y, m, d] = DateUtils.parseDate(dateStr);
  const type = (creditType || "").toLowerCase();

  if (type.includes("hsbc")) {
    // HSBC Rule: Spend in month M settles on the last day of following month (M+1)
    let targetYear = y;
    let targetMonth = m + 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
    const lastDay = DateUtils.getLastDayOfMonth(targetYear, targetMonth);
    return DateUtils.formatDate(targetYear, targetMonth, lastDay);
  }

  // CIB Rule: Cycle starts on 15th.
  // Spent <= 15th -> settles 15th of next month (M+1).
  // Spent > 15th -> settles 15th of 2 months later (M+2).
  let targetYear = y;
  let targetMonth = d <= 15 ? m + 1 : m + 2;
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  return DateUtils.formatDate(targetYear, targetMonth, 15);
}

function getCreditCycleHint(dateStr, creditType) {
  if (!dateStr) return "";
  const [y, m, d] = DateUtils.parseDate(dateStr);
  const type = (creditType || "").toLowerCase();
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

  if (type.includes("hsbc")) {
    const dueStr = calculateCreditSettlementDate(dateStr, creditType);
    return `HSBC cycle: ${monthName} spending settles end of following month (${DateUtils.formatDisplayDate(dueStr)})`;
  }
  if (type.includes("cib") || !type) {
    const dueStr = calculateCreditSettlementDate(dateStr, creditType);
    if (d <= 15) {
      return `CIB cycle: ${monthName} 1–15 settles on ${DateUtils.formatDisplayDate(dueStr)}`;
    }
    return `CIB cycle: Spent after 15th (${monthName} 16–next 15th) settles on ${DateUtils.formatDisplayDate(dueStr)}`;
  }
  return "";
}

function getCreditSettlementDate(entry) {
  if (!entry) return "";
  if (isCreditCardExpense(entry)) {
    const t = (entry.creditType || "").toLowerCase();
    const acc = (entry.account || "").toLowerCase();
    const type = (t.includes("hsbc") || acc.includes("hsbc")) ? "hsbc_card" : "cib_card";
    const accKey = type === "hsbc_card" ? "hsbc" : "cib";
    const d = getEntryActualDate(entry) || entry.date;
    const defaultDate = entry.creditSettlementDate || calculateCreditSettlementDate(d, type);
    const sMonth = defaultDate ? DateUtils.getMonthKey(defaultDate) : "";
    if (sMonth && creditSettlementOverrides) {
      const override = creditSettlementOverrides[`credit-settlement-${accKey}-${sMonth}`];
      if (override && override.date) {
        return override.date;
      }
    }
    return defaultDate;
  }
  if (entry.creditSettlementDate) return entry.creditSettlementDate;
  return entry.date || "";
}

function getCreditSettlementMonth(entry) {
  if (!entry) return "";
  if (isCreditCardExpense(entry)) {
    const t = (entry.creditType || "").toLowerCase();
    const acc = (entry.account || "").toLowerCase();
    const type = (t.includes("hsbc") || acc.includes("hsbc")) ? "hsbc_card" : "cib_card";
    const d = getEntryActualDate(entry) || entry.date;
    const defaultDate = entry.creditSettlementDate || calculateCreditSettlementDate(d, type);
    return defaultDate ? DateUtils.getMonthKey(defaultDate) : "";
  }
  const sDate = entry.creditSettlementDate || entry.date;
  return sDate ? DateUtils.getMonthKey(sDate) : "";
}

function getEntryForecastCashDate(entry) {
  if (isCreditCardExpense(entry)) {
    return getCreditSettlementDate(entry);
  }
  return entry.date;
}

function creditDueEntries() {
  const entries = [];
  const targetAccounts = ["cib", "hsbc"];
  const allAccountIds = new Set([
    ...Object.keys(accountBalances || {}),
    ...Object.keys(creditDues || {}),
    ...targetAccounts
  ]);

  const allExpenses = [
    ...(cashEntries || []),
    ...(archivedEntries || [])
  ].filter((entry) => entry && entry.type === "expense");

  targetAccounts.forEach((accountKey) => {
    const matchingBalanceKey = Object.keys(accountBalances || {}).find((k) => k.toLowerCase() === accountKey) || accountKey;
    const acc = (accountBalances && accountBalances[matchingBalanceKey]) || {
      name: accountKey === "cib" ? "CIB" : "HSBC",
      maturityDay: accountKey === "cib" ? 15 : 30
    };
    const monthData = (creditDues && (creditDues[accountKey] || creditDues[matchingBalanceKey])) || {};

    // Collect all months that have base dues, manual lump sums, tracked card purchases, or recorded actual settlement payments
    const settlementMonths = new Set(Object.keys(monthData));

    // Also include any months where an actual payment was recorded for this credit account
    Object.keys(entryActuals || {}).forEach((k) => {
      const prefix = `credit-settlement-${accountKey}-`;
      if (k.startsWith(prefix) && Number(entryActuals[k]) > 0) {
        settlementMonths.add(k.slice(prefix.length));
      }
    });

    allExpenses.forEach((entry) => {
      if (isCardExpenseForAccount(entry, accountKey)) {
        const sMonth = getCreditSettlementMonth(entry);
        if (sMonth) settlementMonths.add(sMonth);
      } else if (isLumpCreditDueForAccount(entry, accountKey)) {
        const sMonth = DateUtils.getMonthKey(entry.date);
        if (sMonth) settlementMonths.add(sMonth);
      }
    });

    // Also include any overridden settlement months
    Object.keys(creditSettlementOverrides || {}).forEach((k) => {
      const prefix = `credit-settlement-${accountKey}-`;
      if (k.startsWith(prefix)) {
        settlementMonths.add(k.slice(prefix.length));
      }
    });

    const orderedSettlementMonths = [...settlementMonths].sort();

    orderedSettlementMonths.forEach((monthKey) => {
      const baseDue = Number(monthData[monthKey] || 0);

      const manualLumpEntries = allExpenses.filter(
        (entry) => isLumpCreditDueForAccount(entry, accountKey) && DateUtils.getMonthKey(entry.date) === monthKey && !getEntryId(entry).startsWith("credit-settlement-")
      );
      const lumpAmount = manualLumpEntries.reduce((sum, e) => {
        const act = getEntryActualAmount(e);
        return sum + (act > 0 ? act : Number(e.amount || 0));
      }, 0);

      const cardExpenses = allExpenses.filter(
        (entry) => isCardExpenseForAccount(entry, accountKey) && getCreditSettlementMonth(entry) === monthKey
      );
      const cardSpendTotal = cardExpenses.reduce((sum, e) => {
        const act = getEntryActualAmount(e);
        return sum + (act > 0 ? act : Number(e.amount || 0));
      }, 0);

      const settlementId = `credit-settlement-${accountKey}-${monthKey}`;
      const lumpActual = manualLumpEntries.reduce((sum, e) => sum + getEntryActualAmount(e), 0);
      const actualPaid = Math.max(Number(entryActuals[settlementId] || 0), lumpActual);
      const calculatedPlannedDue = baseDue + lumpAmount + cardSpendTotal;

      const override = creditSettlementOverrides && creditSettlementOverrides[settlementId];
      const hasPlannedOverride = override && override.amount !== undefined && override.amount !== null && !isNaN(Number(override.amount));
      const totalPlannedDue = hasPlannedOverride ? Number(override.amount) : calculatedPlannedDue;

      // Keep entry if there is a planned due OR if an actual payment was recorded (for past settled history) OR if overridden
      if (totalPlannedDue <= 0 && actualPaid <= 0 && calculatedPlannedDue <= 0) return;

      // Auto-heal ONLY current and future cycles (monthKey >= currentMonthKey). NEVER un-delete past months!
      const currentMonthKey = DateUtils.currentYearMonth();
      if (monthKey >= currentMonthKey && deletedForecasts && deletedForecasts.includes(settlementId)) {
        if (cardSpendTotal > 0 || lumpAmount > 0 || hasPlannedOverride || (override && override.date)) {
          deletedForecasts = deletedForecasts.filter((id) => id !== settlementId);
          saveSetting(keys.deletedForecasts, deletedForecasts);
        }
      }

      const [year, month] = DateUtils.parseYearMonth(monthKey);
      const lastDay = DateUtils.getLastDayOfMonth(year, month);
      const maturityDay = Number(acc.maturityDay) || (accountKey === "cib" ? 15 : lastDay);
      const day = Math.min(maturityDay, lastDay);
      const defaultSettlementDate = DateUtils.formatDate(year, month, day);

      const explicitDateEntry = cardExpenses.find((e) => e.creditSettlementDate);
      let settlementDate = explicitDateEntry && explicitDateEntry.creditSettlementDate ? explicitDateEntry.creditSettlementDate : defaultSettlementDate;
      if (override && override.date) {
        settlementDate = override.date;
      }

      entries.push({
        id: settlementId,
        date: settlementDate,
        cycleMonth: monthKey,
        category: `${acc.name} Credit Due`,
        account: matchingBalanceKey,
        type: "expense",
        amount: totalPlannedDue > 0 ? totalPlannedDue : (calculatedPlannedDue > 0 ? calculatedPlannedDue : actualPaid),
        actualAmount: actualPaid,
        calculatedAmount: calculatedPlannedDue,
        baseDue,
        cardSpendTotal,
        cardExpenseCount: cardExpenses.length,
        creditType: accountKey,
        isCreditSettlement: true,
        isCustomized: Boolean(override && (override.date || hasPlannedOverride)),
        source: "recurring credit",
        tag: "Credit"
      });
    });
  });

  // Also include any other credit accounts with monthData in creditDues
  allAccountIds.forEach((id) => {
    const accountKey = (id || "").toLowerCase();
    if (targetAccounts.includes(accountKey)) return;
    const acc = accountBalances && accountBalances[id];
    if (!acc) return;
    const monthData = (creditDues && creditDues[id]) || {};
    Object.entries(monthData).forEach(([monthKey, amount]) => {
      const num = Number(amount || 0);
      if (num <= 0) return;
      const [year, month] = DateUtils.parseYearMonth(monthKey);
      const lastDay = DateUtils.getLastDayOfMonth(year, month);
      const day = Math.min(Number(acc.maturityDay) || lastDay, lastDay);
      const settlementId = `credit-settlement-${accountKey}-${monthKey}`;
      const override = creditSettlementOverrides && creditSettlementOverrides[settlementId];
      const hasPlannedOverride = override && override.amount !== undefined && override.amount !== null && !isNaN(Number(override.amount));

      const currentMonthKey = DateUtils.currentYearMonth();
      if (monthKey >= currentMonthKey && deletedForecasts && deletedForecasts.includes(settlementId)) {
        if (num > 0 || hasPlannedOverride || (override && override.date)) {
          deletedForecasts = deletedForecasts.filter((id) => id !== settlementId);
          saveSetting(keys.deletedForecasts, deletedForecasts);
        }
      }
      entries.push({
        id: settlementId,
        date: (override && override.date) || DateUtils.formatDate(year, month, day),
        cycleMonth: monthKey,
        category: `${acc.name} Credit Due`,
        account: id,
        type: "expense",
        amount: hasPlannedOverride ? Number(override.amount) : num,
        calculatedAmount: num,
        baseDue: num,
        cardSpendTotal: 0,
        cardExpenseCount: 0,
        creditType: accountKey,
        isCreditSettlement: true,
        isCustomized: Boolean(override && (override.date || hasPlannedOverride)),
        source: "recurring credit",
        tag: "Credit"
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
  let rawValue = entryActuals[id];
  if ((rawValue === undefined || rawValue === null || rawValue === "") && entry && entry.id) {
    const legacyId = `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || "cash"}`;
    rawValue = entryActuals[legacyId];
  }
  if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
    return Math.round(Number(rawValue) || 0);
  }
  if (entry && entry.actualAmount !== undefined && entry.actualAmount !== null && entry.actualAmount !== "") {
    return Math.round(Number(entry.actualAmount) || 0);
  }
  return 0;
}

function getEntryActualDate(entry) {
  if (!entry) return DateUtils.todayString();
  if (entry.actualDate) return entry.actualDate;
  const id = getEntryId(entry);
  if (entryActualDates && entryActualDates[id]) return entryActualDates[id];
  if (entry.draws && Array.isArray(entry.draws) && entry.draws.length > 0) {
    const lastDraw = entry.draws[entry.draws.length - 1];
    return lastDraw ? lastDraw.date : (entry.date || DateUtils.todayString());
  }
  return entry.date || DateUtils.todayString();
}

function setEntryActualDate(entry, date) {
  if (!entry) return;
  const dateStr = date || DateUtils.todayString();
  entry.actualDate = dateStr;
  const id = getEntryId(entry);
  entryActualDates[id] = dateStr;
  saveSetting(keys.entryActualDates, entryActualDates);
}

function setEntryActualAmount(entry, value) {
  const id = getEntryId(entry);
  const rounded = value === "" || value === null || value === undefined ? 0 : Math.round(Number(value) || 0);
  entryActuals[id] = rounded;
  if (entry && entry.actualAmount !== undefined) {
    entry.actualAmount = rounded;
  }
  if (rounded > 0) {
    if (!entry.actualDate && (!entryActualDates || !entryActualDates[id])) {
      setEntryActualDate(entry, DateUtils.todayString());
    }
  } else {
    delete entryActualDates[id];
    delete entry.actualDate;
    saveSetting(keys.entryActualDates, entryActualDates);
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

function healSingleDrawMismatches() {
  let changed = false;
  const syncEntry = (entry) => {
    if (!entry) return;
    const actual = getEntryActualAmount(entry);
    if (actual > 0) {
      if (!Array.isArray(entry.draws) || entry.draws.length === 0) {
        if (isPartialTracked(entry)) {
          entry.draws = [{
            date: getEntryActualDate(entry),
            amount: actual,
            tag: entry.tag || "",
            account: entry.account || "cash"
          }];
          changed = true;
        }
      } else if (entry.draws.length === 1) {
        if (Math.round(entry.draws[0].amount || 0) !== actual) {
          entry.draws[0].amount = actual;
          changed = true;
        }
        if (entry.tag && !entry.draws[0].tag) {
          entry.draws[0].tag = entry.tag;
          changed = true;
        }
        if (entry.account && !entry.draws[0].account) {
          entry.draws[0].account = entry.account;
          changed = true;
        }
      }
    } else if (actual <= 0 && Array.isArray(entry.draws) && entry.draws.length > 0) {
      entry.draws = [];
      changed = true;
    }
  };

  cashEntries.forEach(syncEntry);
  archivedEntries.forEach(syncEntry);

  if (changed) {
    saveSetting(keys.entries, cashEntries);
    saveSetting(keys.archivedEntries, archivedEntries);
  }
}

function isOngoingEntry(entry) {
  if (!entry) return false;
  if (entry.isClosed) return false;
  if (entry.keepOngoing) return true;
  if (isLoanInflow(entry)) {
    // Unclosed loan facilities that have begun or are active are ongoing facilities, not overdue
    return true;
  }
  if (isPartialTracked(entry) && getEntryActualAmount(entry) > 0 && getRemainingForecastAmount(entry) > 0) {
    return true;
  }
  return false;
}

function getRemainingForecastAmount(entry) {
  if (entry && entry.isClosed) return 0;
  const actualAmount = getEntryActualAmount(entry);
  if (isPartialTracked(entry) && actualAmount > 0) {
    return Math.max(0, Number(entry.amount || 0) - actualAmount);
  }
  return Number(entry.amount || 0);
}

function getEntryDateSpan(entry) {
  if (!entry) return { isSpan: false, startDate: "", endDate: "", display: "" };
  const startDate = entry.date || DateUtils.todayString();
  const actualAmount = getEntryActualAmount(entry);

  if (isPartialTracked(entry) && actualAmount > 0 && (!entry.draws || !Array.isArray(entry.draws) || entry.draws.length === 0)) {
    entry.draws = [{ date: startDate, amount: actualAmount }];
  }

  if (entry.draws && Array.isArray(entry.draws) && entry.draws.length > 0) {
    const dates = entry.draws.map((d) => d.date).filter(Boolean).sort();
    const firstDate = dates[0] || startDate;
    const lastDate = dates[dates.length - 1] || startDate;
    if (firstDate !== lastDate) {
      return {
        isSpan: true,
        startDate: firstDate,
        endDate: lastDate,
        display: `${DateUtils.formatDisplayDate(firstDate)} → ${DateUtils.formatDisplayDate(lastDate)}`
      };
    }
    return {
      isSpan: false,
      startDate: firstDate,
      endDate: firstDate,
      display: DateUtils.formatDisplayDate(firstDate)
    };
  }
  return {
    isSpan: false,
    startDate: startDate,
    endDate: startDate,
    display: DateUtils.formatDisplayDate(startDate)
  };
}

function getEntryDrawsSummary(entry) {
  if (!entry || !entry.draws || !Array.isArray(entry.draws) || entry.draws.length <= 1) {
    return "";
  }
  const isIncome = entry.type === "income";
  const verb = isIncome ? "draws" : "payments";
  const parts = entry.draws.map(
    (d) => `${money(d.amount)}${d.tag ? ` [${d.tag}]` : ""} (${DateUtils.formatDisplayDate(d.date)})`
  );
  return `${entry.draws.length} ${verb}: ${parts.join(" · ")}`;
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
  const nonLumpCashEntries = cashEntries.filter((entry) => !isCreditDueLumpSum(entry));
  const all = [
    ...nonLumpCashEntries,
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
      // Exclude individual credit card purchases from being direct cash outflows,
      // because creditDueEntries() creates the consolidated credit settlement entry on their due date!
      if (isCreditCardExpense(entry)) return false;

      // If it's an unclosed partial-tracked entry (expense or loan) with remaining balance, persist it past its date
      if (isPartialTracked(entry) && !entry.isClosed && getRemainingForecastAmount(entry) > 0) {
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
      // Carry forward undrawn/unspent funds to today in the projection so they remain active
      if (isPartialTracked(entry) && effDate && effDate < today && getRemainingForecastAmount(entry) > 0) {
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

  // Track accounts and months already covered by manual credit due payments in cashEntries
  const coveredSettlementKeys = new Set();
  (cashEntries || []).forEach((entry) => {
    if (getEntryActualAmount(entry) > 0) {
      ["cib", "hsbc"].forEach((accKey) => {
        if (isLumpCreditDueForAccount(entry, accKey)) {
          const actDate = getEntryActualDate(entry) || entry.date;
          const mKey = DateUtils.getMonthKey(actDate);
          if (mKey) coveredSettlementKeys.add(`${accKey}-${mKey}`);
        }
      });
    }
  });

  // Only include dynamic creditDueEntries if not already recorded as manual payment in cashEntries
  const validCreditDues = creditDueEntries().filter((entry) => {
    if (getEntryActualAmount(entry) <= 0) return false;
    const parts = (entry.id || "").split("-");
    if (parts[0] === "credit" && parts[1] === "settlement") {
      const accKey = parts[2];
      const mKey = `${parts[3]}-${parts[4]}`;
      if (coveredSettlementKeys.has(`${accKey}-${mKey}`)) return false;
    }
    return true;
  });

  const activeCandidates = [
    ...cashEntries,
    ...buildInstallmentEntries(),
    ...validCreditDues
  ].filter((entry) => getEntryActualAmount(entry) > 0);
  
  // Deduplicate active candidates so that identical IDs are not added twice
  const seenIds = new Set();
  const dedupedActive = [];
  activeCandidates.forEach((entry) => {
    const id = getEntryId(entry);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      dedupedActive.push(entry);
    }
  });

  const archivedWithActuals = (archivedEntries || [])
    .filter((entry) => getEntryActualAmount(entry) > 0 && !seenIds.has(getEntryId(entry)));

  return [...dedupedActive, ...archivedWithActuals];
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
  const accountKey = (id || "").toLowerCase();
  const months = new Set(Object.keys((creditDues && creditDues[id]) || {}));
  // Also include months that had recorded actual payments
  Object.keys(entryActuals || {}).forEach((k) => {
    const prefix = `credit-settlement-${accountKey}-`;
    if (k.startsWith(prefix) && Number(entryActuals[k]) > 0) {
      months.add(k.slice(prefix.length));
    }
  });
  const allExpenses = [...(cashEntries || []), ...(archivedEntries || [])];
  allExpenses.forEach((entry) => {
    if (isCardExpenseForAccount(entry, accountKey)) {
      const sm = getCreditSettlementMonth(entry);
      if (sm) months.add(sm);
    }
  });
  return [...months].sort();
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

function getRemainingCreditDueAmount(id, targetMonth) {
  const accountKey = (id || "").toLowerCase();
  const selectedMonth = targetMonth || getCreditDueMonthForAccount(id);

  // 1. Base recurring credit due set in settings
  const baseDue = targetMonth ? ((creditDues[id] && creditDues[id][targetMonth]) || 0) : getCreditDueAmount(id);

  const allExpenses = [
    ...(cashEntries || []),
    ...(archivedEntries || [])
  ].filter((entry) => entry && entry.type === "expense");

  // 2. Manual lump sum credit entries
  const activeLumpEntries = allExpenses.filter(
    (entry) => isLumpCreditDueForAccount(entry, accountKey) && (!selectedMonth || DateUtils.getMonthKey(entry.date) === selectedMonth)
  );

  // 3. Tracked credit card purchases maturing in selectedMonth
  const activeCardExpenses = allExpenses.filter(
    (entry) => isCardExpenseForAccount(entry, accountKey) && (!selectedMonth || getCreditSettlementMonth(entry) === selectedMonth)
  );

  const cardSpendTotal = activeCardExpenses.reduce((sum, entry) => {
    const act = getEntryActualAmount(entry);
    return sum + (act > 0 ? act : Number(entry.amount || 0));
  }, 0);

  const lumpAmount = activeLumpEntries.reduce((sum, entry) => {
    const act = getEntryActualAmount(entry);
    return sum + (act > 0 ? act : Number(entry.amount || 0));
  }, 0);

  const settlementId = `credit-settlement-${accountKey}-${selectedMonth}`;
  const override = creditSettlementOverrides && creditSettlementOverrides[settlementId];
  const hasPlannedOverride = override && override.amount !== undefined && override.amount !== null && !isNaN(Number(override.amount));
  const totalPlannedDue = hasPlannedOverride ? Number(override.amount) : (baseDue + lumpAmount + cardSpendTotal);

  // 4. Actual payments made on recurring credit due
  const creditEntries = creditDueEntries();
  const monthRecurringEntry = creditEntries.find(
    (e) => (e.account || "").toLowerCase() === accountKey && DateUtils.getMonthKey(e.date) === selectedMonth
  );
  const recurringActualPaid = monthRecurringEntry ? getEntryActualAmount(monthRecurringEntry) : 0;

  // 5. Actual payments made directly on manual lump sum entries
  const lumpActualPaid = activeLumpEntries.reduce((sum, entry) => sum + getEntryActualAmount(entry), 0);

  // Total paid towards the settlement / bill (monthRecurringEntry already includes lumpActual via Math.max)
  const totalPaid = Math.max(recurringActualPaid, lumpActualPaid);

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
  return Math.abs(Number(sell) - Number(buy)) / mid;
}

function applySpread(mid, spreadPct) {
  return {
    sell: Math.round(mid * (1 + spreadPct / 2) * 100) / 100,
    buy: Math.round(mid * (1 - spreadPct / 2) * 100) / 100
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
  const today = DateUtils.todayString();
  const sortedFutureEntries = [...entries]
    .filter((e) => e.date && e.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return 0;
    });

  let runningCash = totalOpeningBalance;
  let lowestBal = totalOpeningBalance;
  let lowestDate = today;

  sortedFutureEntries.forEach((entry) => {
    const delta = Number(entry.amount || 0) * (entry.type === "income" ? 1 : -1);
    runningCash += delta;
    if (runningCash < lowestBal) {
      lowestBal = runningCash;
      lowestDate = entry.date;
    }
  });

  const storageTotal = storageAssets.reduce((sum, item) => sum + storageValue(item), 0);
  const totalNetWorth = actualCashNow + storageTotal;

  // Credit dues: calculate for Current Month and Next Month cycles
  const currentMonthKey = DateUtils.currentYearMonth();
  const [cmYear, cmMonth] = DateUtils.parseYearMonth(currentMonthKey);
  const nextMonthKey = cmMonth === 12
    ? `${cmYear + 1}-01`
    : `${cmYear}-${String(cmMonth + 1).padStart(2, "0")}`;

  const currentMonthName = new Date(Date.UTC(cmYear, cmMonth - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const nextMonthName = new Date(Date.UTC(cmMonth === 12 ? cmYear + 1 : cmYear, cmMonth === 12 ? 0 : cmMonth, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

  const cibCurrent = getRemainingCreditDueAmount("cib", currentMonthKey);
  const cibNext = getRemainingCreditDueAmount("cib", nextMonthKey);
  // Main total due is current month if pending, else next cycle due (or sum if both)
  const cibMainDisplay = (cibCurrent > 0 ? cibCurrent : cibNext);

  const hsbcCurrent = getRemainingCreditDueAmount("hsbc", currentMonthKey);
  const hsbcNext = getRemainingCreditDueAmount("hsbc", nextMonthKey);
  const hsbcMainDisplay = (hsbcCurrent > 0 ? hsbcCurrent : hsbcNext);

  const cibCredit = cibMainDisplay;
  const hsbcCredit = hsbcMainDisplay;
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

  // Render CIB Dual-Cycle Card
  const allCreditDueEntries = creditDueEntries();
  const cibCreditEl = document.getElementById("cibCreditDue");
  if (cibCreditEl) cibCreditEl.textContent = money(cibMainDisplay);

  const cibActiveMonthKey = cibCurrent > 0 ? currentMonthKey : nextMonthKey;
  const cibActiveEntry = allCreditDueEntries.find((e) => e.creditType === "cib" && DateUtils.getMonthKey(e.date) === cibActiveMonthKey);
  const cibDueDateStr = cibActiveEntry && cibActiveEntry.date ? DateUtils.formatDisplayDate(cibActiveEntry.date) : (cibCurrent > 0 ? `${currentMonthName} 15` : `${nextMonthName} 15`);
  const cibBadgeEl = document.getElementById("cibCreditBadge");
  if (cibBadgeEl) {
    cibBadgeEl.textContent = `Due ${cibDueDateStr}`;
  }

  const cibCurLabelEl = document.getElementById("cibCurrentMonthLabel");
  if (cibCurLabelEl) cibCurLabelEl.textContent = `${currentMonthName} (This Mo)`;
  const cibCurValEl = document.getElementById("cibCurrentDue");
  if (cibCurValEl) {
    cibCurValEl.textContent = money(cibCurrent);
    cibCurValEl.style.color = cibCurrent > 0 ? "var(--red)" : "var(--muted)";
  }

  const cibNextLabelEl = document.getElementById("cibNextMonthLabel");
  if (cibNextLabelEl) cibNextLabelEl.textContent = `${nextMonthName} (Next Mo)`;
  const cibNextValEl = document.getElementById("cibNextDue");
  if (cibNextValEl) {
    cibNextValEl.textContent = money(cibNext);
    cibNextValEl.style.color = cibNext > 0 ? "var(--ink)" : "var(--muted)";
  }

  // Render HSBC Dual-Cycle Card
  const hsbcCreditEl = document.getElementById("hsbcCreditDue");
  if (hsbcCreditEl) hsbcCreditEl.textContent = money(hsbcMainDisplay);

  const hsbcActiveMonthKey = hsbcCurrent > 0 ? currentMonthKey : nextMonthKey;
  const hsbcActiveEntry = allCreditDueEntries.find((e) => e.creditType === "hsbc" && DateUtils.getMonthKey(e.date) === hsbcActiveMonthKey);
  const hsbcCurLastDay = DateUtils.getLastDayOfMonth(cmYear, cmMonth);
  const hsbcNextLastDay = DateUtils.getLastDayOfMonth(cmMonth === 12 ? cmYear + 1 : cmYear, cmMonth === 12 ? 1 : cmMonth + 1);
  const hsbcDefaultDueStr = hsbcCurrent > 0 ? `${currentMonthName} ${hsbcCurLastDay}` : `${nextMonthName} ${hsbcNextLastDay}`;
  const hsbcDueDateStr = hsbcActiveEntry && hsbcActiveEntry.date ? DateUtils.formatDisplayDate(hsbcActiveEntry.date) : hsbcDefaultDueStr;
  const hsbcBadgeEl = document.getElementById("hsbcCreditBadge");
  if (hsbcBadgeEl) {
    hsbcBadgeEl.textContent = `Due ${hsbcDueDateStr}`;
  }

  const hsbcCurLabelEl = document.getElementById("hsbcCurrentMonthLabel");
  if (hsbcCurLabelEl) hsbcCurLabelEl.textContent = `${currentMonthName} (This Mo)`;
  const hsbcCurValEl = document.getElementById("hsbcCurrentDue");
  if (hsbcCurValEl) {
    hsbcCurValEl.textContent = money(hsbcCurrent);
    hsbcCurValEl.style.color = hsbcCurrent > 0 ? "var(--red)" : "var(--muted)";
  }

  const hsbcNextLabelEl = document.getElementById("hsbcNextMonthLabel");
  if (hsbcNextLabelEl) hsbcNextLabelEl.textContent = `${nextMonthName} (Next Mo)`;
  const hsbcNextValEl = document.getElementById("hsbcNextDue");
  if (hsbcNextValEl) {
    hsbcNextValEl.textContent = money(hsbcNext);
    hsbcNextValEl.style.color = hsbcNext > 0 ? "var(--ink)" : "var(--muted)";
  }

  const storageTotalEl = document.getElementById("storageTotal");
  if (storageTotalEl) storageTotalEl.textContent = money(storageTotal);

  const forecastLowEl = document.getElementById("forecastLow");
  if (forecastLowEl) {
    forecastLowEl.textContent = money(lowestBal);
    forecastLowEl.classList.toggle("f-trend-down", lowestBal < 0);
  }

  const forecastLowDateEl = document.getElementById("forecastLowDate");
  if (forecastLowDateEl) {
    if (lowestBal < 0) {
      forecastLowDateEl.textContent = `⚠️ Deficit on ${DateUtils.formatDisplayDate(lowestDate)}`;
      forecastLowDateEl.classList.add("danger-text");
    } else {
      forecastLowDateEl.textContent = lowestDate === today ? "Cash floor (Today)" : `Floor on ${DateUtils.formatDisplayDate(lowestDate)}`;
      forecastLowDateEl.classList.remove("danger-text");
    }
  }

  const deficitSummary = getDeficitSummary();
  const risk = evaluateCashflowRisk(forecast, deficitSummary);
  updateCashflowStatus(risk);

  renderForecastLineChart();
  renderCategoryBreakdown(entries);
  renderAssetDistribution(actualCashNow, storageTotal);
  renderExpenseMix(entries);
  renderWarnings(forecast);

  renderDeficitBanner(deficitSummary);
  renderDeficits(deficitSummary);

  const healthScore = computeFinancialHealthScore({ entries, forecast, deficitSummary, actualCashNow, storageTotal });
  renderFinancialHealth(healthScore);

  const smartInsights = generateSmartInsights({ entries, forecast, deficitSummary, actualCashNow, storageTotal });
  renderSmartInsights(smartInsights);
}

function isStrictObligation(entryOrStep) {
  if (!entryOrStep) return false;
  const e = entryOrStep.entry || entryOrStep;
  if (e.source === "installment" || e.source === "recurring credit" || e.source === "loan") return true;
  if (e.source && (e.source.includes("credit") || e.source.includes("installment"))) return true;
  if (e.account === "installment" || (e.account && e.account.includes("credit"))) return true;
  if (e.creditType) return true;
  const cat = (e.category || "").toLowerCase().trim();
  if (cat.includes("installment") || cat.includes("check") || cat.includes("cheque") || cat.includes("chq")) return true;
  if (cat.includes("credit") || cat.includes("loan") || cat.includes("tuition") || cat.includes("school") || cat.includes("mortgage") || cat.includes("rent")) return true;
  if (Array.isArray(installments) && installments.some((inst) => (inst.name || "").trim().toLowerCase() === cat)) return true;
  return false;
}

function evaluateCashflowRisk(forecast, deficitSummary) {
  const { deficitPeriods } = deficitSummary || {};
  const hasMonthEndDeficit = forecast.some((item) => item.balance < 0);
  const periods = deficitPeriods || [];

  if (!hasMonthEndDeficit && periods.length === 0) {
    return {
      status: "OK",
      tier: "safe",
      note: "Cash stays positive across entire forecast"
    };
  }

  // Check if any deficit spell involves a strict hard deadline (checks, installments, credit dues, loans)
  const strictPeriod = periods.find((p) => {
    return (p.steps || []).some((s) => isStrictObligation(s)) || isStrictObligation(p.initialEntry);
  });

  const firstPeriod = periods.length ? periods[0] : null;

  // RED (Risk): Strict obligation during deficit, or month-end negative, or unresolved/long deficit (> 14 days)
  if (hasMonthEndDeficit || strictPeriod || (firstPeriod && (!firstPeriod.isResolved || firstPeriod.daysInDeficit > 14))) {
    const targetPeriod = strictPeriod || firstPeriod;
    const strictStep = targetPeriod ? (targetPeriod.steps || []).find((s) => isStrictObligation(s)) : null;
    const triggerLabel = strictStep ? strictStep.category : (targetPeriod ? targetPeriod.initialTrigger : "Expenses");
    const peakAmt = targetPeriod ? money(targetPeriod.lowestBalance) : (forecast.find((f) => f.balance < 0) ? money(forecast.find((f) => f.balance < 0).balance) : "");
    const dateLabel = targetPeriod && targetPeriod.startDate ? ` on ${DateUtils.formatDisplayDate(targetPeriod.startDate)}` : "";

    return {
      status: "Risk",
      tier: "danger",
      note: targetPeriod
        ? `Strict payment in deficit (${triggerLabel} ${peakAmt}${dateLabel})`
        : `Expenses exceed cash in forecast (${peakAmt})`
    };
  }

  // AMBER (Tight): Short flexible timing gap with only discretionary spending that recovers automatically
  return {
    status: "Tight",
    tier: "warning",
    note: `Flexible ${firstPeriod.daysInDeficit}d gap until ${DateUtils.formatDisplayDate(firstPeriod.resolvedDate)} salary (${money(firstPeriod.lowestBalance)})`
  };
}

function updateCashflowStatus(risk) {
  const isDanger = risk.tier === "danger";
  const isWarning = risk.tier === "warning";

  ["cashflowStatus", "cfCashflowStatus"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = risk.status;
      el.classList.toggle("danger-text", isDanger);
      el.classList.toggle("warning-text", isWarning);
    }
  });
  ["cashflowStatusNote", "cfCashflowStatusNote"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = risk.note;
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
    container.innerHTML = `<div class="list-row empty-row"><span>🪙 No assets recorded yet · Add gold, currency, or account balances</span></div>`;
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

  const segmentsHtml = `<div class="asset-segmented-bar">${filtered
    .map((item) => {
      const pct = (item.amount / totalNetWorth) * 100;
      return `<div class="asset-segment" style="width: ${pct.toFixed(1)}%; background: ${item.color};" title="${escapeHtml(item.label)}: ${pct.toFixed(0)}%"></div>`;
    })
    .join("")}</div>`;

  container.innerHTML = segmentsHtml + filtered
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
    container.innerHTML = `<div class="list-row empty-row"><span>📊 No expense categories yet · Add upcoming expenses to view distribution</span></div>`;
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
    running = Math.round((running + months[month]) * 100) / 100;
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

// --- Forecast Line Chart & Trajectory Logic ---

function buildSmoothSvgPath(points) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function getForecastTimeSeries(requestedMonths = forecastLineRangeMonths) {
  const currentYm = DateUtils.currentYearMonth();
  const [startYear, startMonth] = DateUtils.parseYearMonth(currentYm);
  const today = DateUtils.todayString();

  // Base candidate entries from forecastEntries()
  const baseEntries = forecastEntries();

  // Find max horizon in entries
  const allMonthsInEntries = baseEntries
    .map((e) => DateUtils.getMonthKey(e.date))
    .filter((m) => m && m >= currentYm)
    .sort();

  let maxHorizonMonths = 12;
  if (allMonthsInEntries.length > 0) {
    const lastMonth = allMonthsInEntries[allMonthsInEntries.length - 1];
    const [ly, lm] = DateUtils.parseYearMonth(lastMonth);
    const diff = (ly - startYear) * 12 + (lm - startMonth) + 1;
    maxHorizonMonths = Math.max(12, diff);
  }

  let count = 12;
  if (requestedMonths === "all") {
    count = maxHorizonMonths;
  } else {
    count = Math.max(1, Number(requestedMonths) || 12);
  }

  // End cutoff month and date for selected window
  const endMonthIndex = count - 1;
  const cutoffYear = startYear + Math.floor((startMonth - 1 + endMonthIndex) / 12);
  const cutoffMonth = ((startMonth - 1 + endMonthIndex) % 12) + 1;
  const cutoffYm = `${cutoffYear}-${String(cutoffMonth).padStart(2, "0")}`;
  const cutoffDate = `${cutoffYm}-${String(DateUtils.getLastDayOfMonth(cutoffYear, cutoffMonth)).padStart(2, "0")}`;

  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

  const series = [];

  if (forecastLineChartMode === "entries") {
    // --- MODE: ENTRY POINTS ---
    // Initial entry represents starting position today
    series.push({
      index: 0,
      date: today,
      shortLabel: "Today",
      fullLabel: `${DateUtils.formatDisplayDate(today)} (Current Balance)`,
      category: "Current Cash",
      type: "opening",
      amount: 0,
      delta: 0,
      openingBalance: totalOpeningBalance,
      closingBalance: totalOpeningBalance,
      balance: totalOpeningBalance,
      net: 0,
      isOpening: true,
      direction: "flat"
    });

    const filtered = baseEntries
      .filter((e) => e.date && e.date >= today && e.date <= cutoffDate)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.type !== b.type) return a.type === "income" ? -1 : 1;
        return 0;
      });

    let running = totalOpeningBalance;
    filtered.forEach((entry) => {
      const amt = Number(entry.amount || 0);
      const delta = entry.type === "income" ? amt : -amt;
      const prevBal = running;
      running = Math.round((running + delta) * 100) / 100;

      const [ey, em, ed] = DateUtils.parseDate(entry.date);
      const dObj = new Date(Date.UTC(ey, em - 1, ed));
      const shortLabel = dObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const fullLabel = DateUtils.formatDisplayDate(entry.date);

      series.push({
        index: series.length,
        date: entry.date,
        shortLabel,
        fullLabel,
        category: entry.category || (entry.type === "income" ? "Income" : "Expense"),
        type: entry.type,
        amount: amt,
        delta,
        openingBalance: prevBal,
        closingBalance: running,
        balance: running,
        net: delta,
        direction: delta >= 0 ? "up" : "down",
        entry
      });
    });

  } else {
    // --- MODE: MONTHLY ---
    const monthlyIncomes = {};
    const monthlyExpenses = {};
    const monthlyIncomeCount = {};
    const monthlyExpenseCount = {};

    baseEntries.forEach((entry) => {
      const month = DateUtils.getMonthKey(entry.date);
      if (!month) return;
      const amount = Number(entry.amount || 0);
      if (entry.type === "income") {
        monthlyIncomes[month] = (monthlyIncomes[month] || 0) + amount;
        monthlyIncomeCount[month] = (monthlyIncomeCount[month] || 0) + 1;
      } else {
        monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amount;
        monthlyExpenseCount[month] = (monthlyExpenseCount[month] || 0) + 1;
      }
    });

    let running = totalOpeningBalance;
    for (let i = 0; i < count; i++) {
      const y = startYear + Math.floor((startMonth - 1 + i) / 12);
      const m = ((startMonth - 1 + i) % 12) + 1;
      const monthKey = `${y}-${String(m).padStart(2, "0")}`;

      const income = monthlyIncomes[monthKey] || 0;
      const expense = monthlyExpenses[monthKey] || 0;
      const net = Math.round((income - expense) * 100) / 100;
      const opening = running;
      running = Math.round((running + net) * 100) / 100;

      const dateObj = new Date(Date.UTC(y, m - 1, 1));
      const shortLabel = dateObj.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
      const fullLabel = dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

      series.push({
        index: i,
        month: monthKey,
        shortLabel,
        fullLabel,
        openingBalance: opening,
        closingBalance: running,
        balance: running,
        income,
        expense,
        net,
        incomeCount: monthlyIncomeCount[monthKey] || 0,
        expenseCount: monthlyExpenseCount[monthKey] || 0,
        direction: net >= 0 ? "up" : "down"
      });
    }
  }

  // Backward-pass: Compute Safe-to-Spend for every point i = max(0, min_{j >= i}(balance_j))
  let minFromRight = Infinity;
  let baselineLowestBal = totalOpeningBalance;
  let baselineLowestDate = today;

  for (let i = series.length - 1; i >= 0; i--) {
    const b = series[i].balance;
    if (b < minFromRight) minFromRight = b;
    series[i].safeToSpend = Math.max(0, minFromRight);
    series[i].minFutureBal = minFromRight;
    if (b < baselineLowestBal) {
      baselineLowestBal = b;
      baselineLowestDate = series[i].date || series[i].shortLabel;
    }
  }

  // If simulation is active, compute simulated balance curve for each point
  const isSimActive = simulatedSpendAmount > 0 && !!simulatedSpendDate;
  series.forEach((s) => {
    let isPost = false;
    if (isSimActive) {
      if (s.date) {
        isPost = s.date >= simulatedSpendDate;
      } else if (s.month) {
        isPost = s.month >= DateUtils.getMonthKey(simulatedSpendDate);
      }
    }
    s.simulatedBalance = isPost ? s.balance - simulatedSpendAmount : s.balance;
    s.isPostSim = isPost;
  });

  const safeToSpend = series[0] ? series[0].safeToSpend : Math.max(0, baselineLowestBal);

  return {
    series,
    openingBalance: totalOpeningBalance,
    totalAvailableMonths: maxHorizonMonths,
    activeMonthsCount: count,
    cutoffDate,
    baselineLowestBal,
    baselineLowestDate,
    safeToSpend,
    isSimActive
  };
}

function setForecastLineRange(months) {
  if (months === "all") {
    forecastLineRangeMonths = "all";
  } else {
    forecastLineRangeMonths = Math.max(1, Number(months) || 12);
  }
  saveSetting(keys.forecastLineMonths, forecastLineRangeMonths);
  renderForecastLineChart();
}

function setForecastLineMode(mode) {
  if (mode !== "entries" && mode !== "monthly") mode = "entries";
  forecastLineChartMode = mode;
  saveSetting(keys.forecastLineMode, forecastLineChartMode);
  renderForecastLineChart();
}

function runSpendSimulator() {
  const amtInput = document.getElementById("forecastSimAmount");
  const dateInput = document.getElementById("forecastSimDate");
  const clearBtn = document.getElementById("forecastSimClearBtn");

  const amount = Number(amtInput ? amtInput.value : 0);
  if (!amount || amount <= 0) {
    if (amtInput) {
      amtInput.focus();
      amtInput.style.borderColor = "#ef4444";
      setTimeout(() => (amtInput.style.borderColor = ""), 1500);
    }
    return;
  }

  const date = (dateInput && dateInput.value) ? dateInput.value : DateUtils.todayString();
  simulatedSpendAmount = amount;
  simulatedSpendDate = date;

  if (clearBtn) clearBtn.style.display = "inline-flex";

  renderForecastLineChart();
  updateSimulatorVerdict();
}

function clearSpendSimulator() {
  simulatedSpendAmount = 0;
  simulatedSpendDate = null;
  const amtInput = document.getElementById("forecastSimAmount");
  const verdictEl = document.getElementById("forecastSimVerdict");
  const clearBtn = document.getElementById("forecastSimClearBtn");

  if (amtInput) amtInput.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  if (verdictEl) {
    verdictEl.style.display = "none";
    verdictEl.className = "forecast-sim-verdict";
    verdictEl.innerHTML = "";
  }

  renderForecastLineChart();
}

function updateSimulatorVerdict() {
  const verdictEl = document.getElementById("forecastSimVerdict");
  if (!verdictEl) return;

  if (!simulatedSpendAmount || !simulatedSpendDate) {
    verdictEl.style.display = "none";
    verdictEl.className = "forecast-sim-verdict";
    verdictEl.innerHTML = "";
    return;
  }

  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const allEntries = forecastEntries();
  const sorted = [
    ...allEntries,
    {
      date: simulatedSpendDate,
      amount: Number(simulatedSpendAmount),
      type: "expense",
      category: "Test Spend",
      isSimulated: true
    }
  ]
    .filter((e) => e.date && e.date >= DateUtils.todayString())
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return 0;
    });

  let running = totalOpeningBalance;
  let lowestPostBal = Infinity;
  let lowestPostItem = null;
  let firstDeficitItem = null;

  sorted.forEach((e) => {
    const delta = Number(e.amount || 0) * (e.type === "income" ? 1 : -1);
    running += delta;
    if (e.date >= simulatedSpendDate) {
      if (running < 0 && !firstDeficitItem) {
        firstDeficitItem = { date: e.date, balance: running, entry: e };
      }
      if (running < lowestPostBal) {
        lowestPostBal = running;
        lowestPostItem = e;
      }
    }
  });

  if (lowestPostBal === Infinity) {
    lowestPostBal = running;
    lowestPostItem = { date: simulatedSpendDate };
  }

  const formattedDate = DateUtils.formatDisplayDate(simulatedSpendDate);
  const lowestDateStr = lowestPostItem && lowestPostItem.date ? DateUtils.formatDisplayDate(lowestPostItem.date) : formattedDate;

  verdictEl.style.display = "flex";
  if (lowestPostBal < 0) {
    verdictEl.className = "forecast-sim-verdict danger";
    const firstDeficitDateStr = firstDeficitItem && firstDeficitItem.date ? DateUtils.formatDisplayDate(firstDeficitItem.date) : lowestDateStr;
    const firstDeficitAmt = firstDeficitItem ? Math.abs(firstDeficitItem.balance) : Math.abs(lowestPostBal);

    let deficitMsg = "";
    if (firstDeficitItem && lowestPostItem && firstDeficitItem.date !== lowestPostItem.date) {
      deficitMsg = `causes balance to turn negative on <strong>${escapeHtml(firstDeficitDateStr)}</strong> (-${money(firstDeficitAmt)}), dropping to a low of <strong>-${money(Math.abs(lowestPostBal))}</strong> on ${escapeHtml(lowestDateStr)}.`;
    } else {
      deficitMsg = `causes a deficit of <strong>-${money(Math.abs(lowestPostBal))}</strong> on ${escapeHtml(firstDeficitDateStr)}.`;
    }

    verdictEl.innerHTML = `
      <span>⚠️ <strong>Deficit Triggered:</strong> Spending ${money(simulatedSpendAmount)} on ${escapeHtml(formattedDate)} ${deficitMsg}</span>
    `;
  } else {
    verdictEl.className = "forecast-sim-verdict safe";
    verdictEl.innerHTML = `
      <span>✅ <strong>Safe to Spend:</strong> Spending ${money(simulatedSpendAmount)} on ${escapeHtml(formattedDate)} leaves a safe cash cushion of <strong>${money(lowestPostBal)}</strong> (lowest point on ${escapeHtml(lowestDateStr)}).</span>
    `;
  }
}

function renderForecastLineChart() {
  const container = document.getElementById("forecastLineChartContainer");
  if (!container) return;

  const data = getForecastTimeSeries(forecastLineRangeMonths);
  const { series, openingBalance, totalAvailableMonths, activeMonthsCount, baselineLowestBal, safeToSpend, isSimActive } = data;

  // 1. Update Range Badge & Date Description
  const badgeEl = document.getElementById("forecastLineRangeBadge");
  if (badgeEl) {
    badgeEl.textContent = forecastLineRangeMonths === "all" ? `All (${activeMonthsCount}M)` : `${activeMonthsCount} Month${activeMonthsCount === 1 ? "" : "s"}`;
  }

  // Deficit Alert Badge
  const deficitBadge = document.getElementById("forecastDeficitAlertBadge");
  const hasDeficit = baselineLowestBal < 0 || (isSimActive && series.some((s) => s.simulatedBalance < 0));
  if (deficitBadge) {
    deficitBadge.style.display = hasDeficit ? "inline-flex" : "none";
  }

  const dateSpanEl = document.getElementById("forecastLineDateSpan");
  if (dateSpanEl && series.length > 0) {
    const startStr = series[0].fullLabel;
    const endStr = series[series.length - 1].fullLabel;
    const modeDesc = forecastLineChartMode === "entries" ? "Entry-by-entry cashflow trajectory" : "Monthly closing trajectory";
    dateSpanEl.textContent = `${startStr} → ${endStr} • ${modeDesc}`;
  }

  // 2. Update Toolbar Preset Buttons & Slider
  document.querySelectorAll(".forecast-preset-btn").forEach((btn) => {
    const btnVal = btn.dataset.months;
    const isActive = (forecastLineRangeMonths === "all" && btnVal === "all") || (String(forecastLineRangeMonths) === btnVal);
    btn.classList.toggle("active", isActive);
  });

  const slider = document.getElementById("forecastRangeSlider");
  const sliderVal = document.getElementById("forecastSliderValue");
  if (slider) {
    slider.max = String(Math.max(24, totalAvailableMonths));
    slider.value = String(forecastLineRangeMonths === "all" ? totalAvailableMonths : activeMonthsCount);
  }
  if (sliderVal) {
    sliderVal.textContent = forecastLineRangeMonths === "all" ? "All" : `${activeMonthsCount}m`;
  }

  // 3. Update Mode Toggle Buttons
  const modeEntriesBtn = document.getElementById("forecastModeEntries");
  const modeMonthlyBtn = document.getElementById("forecastModeMonthly");
  if (modeEntriesBtn) modeEntriesBtn.classList.toggle("active", forecastLineChartMode === "entries");
  if (modeMonthlyBtn) modeMonthlyBtn.classList.toggle("active", forecastLineChartMode === "monthly");

  // 4. Update KPI Mini Cards
  const startCashEl = document.getElementById("fLineStartCash");
  const startMonthEl = document.getElementById("fLineStartMonth");
  if (startCashEl) startCashEl.textContent = money(openingBalance);
  if (startMonthEl) startMonthEl.textContent = "Today";

  const endItem = series[series.length - 1];
  const endCashEl = document.getElementById("fLineEndCash");
  const endMonthEl = document.getElementById("fLineEndMonth");
  if (endCashEl) endCashEl.textContent = endItem ? money(isSimActive ? endItem.simulatedBalance : endItem.balance) : money(openingBalance);
  if (endMonthEl) endMonthEl.textContent = endItem ? (endItem.shortLabel || endItem.fullLabel) : "—";

  // Lowest Balance KPI
  const lowestPoint = series.reduce(
    (min, cur) => {
      const b = isSimActive ? cur.simulatedBalance : cur.balance;
      const minB = isSimActive ? min.simulatedBalance : min.balance;
      return b < minB ? cur : min;
    },
    series[0] || { balance: openingBalance, simulatedBalance: openingBalance, fullLabel: "Today" }
  );
  const currentLowestVal = isSimActive ? lowestPoint.simulatedBalance : lowestPoint.balance;

  const lowEl = document.getElementById("fLineLowestPoint");
  const lowDateEl = document.getElementById("fLineLowestDate");
  if (lowEl) {
    lowEl.textContent = money(currentLowestVal);
    lowEl.classList.toggle("f-trend-down", currentLowestVal < 0);
  }
  if (lowDateEl) {
    lowDateEl.textContent = currentLowestVal < 0 ? `⚠️ Deficit: ${lowestPoint.shortLabel || lowestPoint.fullLabel}` : `Floor: ${lowestPoint.shortLabel || lowestPoint.fullLabel}`;
  }

  // Safe to Spend Today KPI
  const safeEl = document.getElementById("fLineSafeToSpend");
  const safeSubEl = document.getElementById("fLineSafeSub");
  if (safeEl) {
    safeEl.textContent = money(safeToSpend);
    if (safeToSpend > 0) {
      safeEl.style.color = "#10b981";
    } else if (baselineLowestBal < 0) {
      safeEl.style.color = "#ef4444";
    } else {
      safeEl.style.color = "var(--ink)";
    }
  }
  if (safeSubEl) {
    if (baselineLowestBal < 0) {
      safeSubEl.textContent = `Deficit of ${money(Math.abs(baselineLowestBal))} ahead`;
      safeSubEl.style.color = "#ef4444";
    } else {
      safeSubEl.textContent = `Safe floor: ${money(baselineLowestBal)}`;
      safeSubEl.style.color = "var(--muted)";
    }
  }

  // Plotted Entries / Net Change KPI
  const entryCountEl = document.getElementById("fLineEntryCount");
  const netChangeEl = document.getElementById("fLineNetChange");
  if (entryCountEl) {
    if (forecastLineChartMode === "entries") {
      const cnt = Math.max(0, series.length - 1);
      entryCountEl.textContent = `${cnt} Entr${cnt === 1 ? "y" : "ies"}`;
    } else {
      entryCountEl.textContent = `${series.length} Months`;
    }
  }

  const effectiveEndBal = endItem ? (isSimActive ? endItem.simulatedBalance : endItem.balance) : openingBalance;
  const netTrajectory = effectiveEndBal - openingBalance;
  if (netChangeEl) {
    const sign = netTrajectory >= 0 ? "+" : "-";
    netChangeEl.textContent = `${sign}${money(Math.abs(netTrajectory))} Net`;
    netChangeEl.classList.remove("f-trend-up", "f-trend-down");
    netChangeEl.classList.add(netTrajectory >= 0 ? "f-trend-up" : "f-trend-down");
  }

  // 5. Render SVG Line Chart
  const svgWrap = document.getElementById("forecastLineSvgWrap");
  if (!svgWrap) return;

  if (series.length === 0) {
    svgWrap.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--muted);">No forecast data available</div>`;
    return;
  }

  const baseValues = series.map((s) => s.balance);
  const simValues = isSimActive ? series.map((s) => s.simulatedBalance) : [];
  const allPlotValues = [...baseValues, ...simValues];

  const rawMin = Math.min(...allPlotValues);
  const rawMax = Math.max(...allPlotValues);

  let minVal, maxVal;
  if (rawMin === rawMax) {
    if (rawMin >= 0) {
      minVal = 0;
      maxVal = rawMin === 0 ? 1000 : rawMin * 1.35;
    } else {
      minVal = rawMin * 1.35;
      maxVal = 0;
    }
  } else {
    if (rawMin < 0) {
      minVal = rawMin * 1.18;
    } else {
      minVal = Math.max(0, rawMin - (rawMax - rawMin) * 0.22);
    }
    maxVal = rawMax + (rawMax - minVal) * 0.20;
  }

  const viewBoxW = 860;
  const viewBoxH = 340;
  const padL = 74;
  const padR = 40;
  const padT = 38;
  const padB = 40;
  const chartW = viewBoxW - padL - padR;
  const chartH = viewBoxH - padT - padB;

  const getX = (i) => padL + (series.length === 1 ? chartW / 2 : (i / (series.length - 1)) * chartW);
  const getY = (v) => padT + chartH - ((v - minVal) / (maxVal - minVal || 1)) * chartH;

  const points = series.map((s, i) => ({
    x: getX(i),
    y: getY(s.balance),
    val: s.balance,
    data: s
  }));

  // Generate gridlines and Y-axis tick labels
  const tickCount = 4;
  let gridLinesHtml = "";
  for (let t = 0; t <= tickCount; t++) {
    const val = minVal + (t / tickCount) * (maxVal - minVal);
    const y = getY(val);
    let label;
    const absVal = Math.abs(val);
    if (absVal >= 1000000) {
      label = `${(val / 1000000).toFixed(1)}M`;
    } else if (absVal >= 1000) {
      label = `${Math.round(val / 1000)}k`;
    } else {
      label = `${Math.round(val)}`;
    }
    gridLinesHtml += `
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${viewBoxW - padR}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3" />
      <text x="${padL - 10}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" font-weight="600" fill="var(--muted)">${label}</text>
    `;
  }

  // Deficit Hazard Zone & Zero Reference Line
  let zeroLineHtml = "";
  let deficitZoneHtml = "";
  if (minVal < 0 && maxVal >= 0) {
    const zeroY = getY(0);
    const zoneH = Math.max(0, padT + chartH - zeroY);
    deficitZoneHtml = `
      <rect x="${padL}" y="${zeroY.toFixed(1)}" width="${chartW}" height="${zoneH.toFixed(1)}" fill="rgba(239, 68, 68, 0.08)" />
      <text x="${padL + 8}" y="${Math.min(padT + chartH - 6, zeroY + 14).toFixed(1)}" font-size="9" font-weight="700" fill="#ef4444" opacity="0.85">⚠️ DEFICIT HAZARD ZONE (&lt; 0 EGP)</text>
    `;
    zeroLineHtml = `
      <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${viewBoxW - padR}" y2="${zeroY.toFixed(1)}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.9" />
      <text x="${viewBoxW - padR}" y="${(zeroY - 5).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="700" fill="#ef4444">0 EGP Threshold</text>
    `;
  }

  // Smooth line path for baseline
  const pathD = buildSmoothSvgPath(points);

  // Area Fill path
  const areaBottomY = padT + chartH;
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)},${areaBottomY} L ${points[0].x.toFixed(1)},${areaBottomY} Z`;

  // Secondary "What-If" Simulation Trajectory Path
  let simPathHtml = "";
  if (isSimActive) {
    const simPoints = series.map((s, i) => ({
      x: getX(i),
      y: getY(s.simulatedBalance)
    }));
    const simPathD = buildSmoothSvgPath(simPoints);
    simPathHtml = `
      <path d="${simPathD}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.95" />
    `;
  }

  // Segmented colored indicators / micro-badges & dots
  let nodesHtml = "";
  let hoverColsHtml = "";
  const colW = chartW / Math.max(1, series.length);

  // Determine interval for X-axis labels
  const maxXTicks = 7;
  const tickStep = Math.max(1, Math.floor(series.length / maxXTicks));

  points.forEach((p, i) => {
    const s = p.data;
    const isClimbing = i === 0 ? true : s.balance >= series[i - 1].balance;
    const isNegativeBalance = isSimActive ? s.simulatedBalance < 0 : s.balance < 0;
    const dotColor = isNegativeBalance ? "#ef4444" : isClimbing ? "#10b981" : "#0f766e";
    const dotRadius = series.length > 36 ? "3" : "4.5";

    // Baseline Data Point Dot
    nodesHtml += `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${dotRadius}" fill="${dotColor}" stroke="var(--surface)" stroke-width="2" id="fLineDot-${i}" class="forecast-dot" />
    `;

    // Simulated secondary dot if active and post-sim date
    if (isSimActive && s.isPostSim) {
      const simY = getY(s.simulatedBalance);
      nodesHtml += `
        <circle cx="${p.x.toFixed(1)}" cy="${simY.toFixed(1)}" r="3.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" />
      `;
    }

    if (series.length <= 16 && i > 0 && !s.isOpening) {
      const arrowChar = isClimbing ? "▲" : "▼";
      const arrowColor = isClimbing ? "#10b981" : "#ef4444";
      const arrowY = isClimbing ? p.y - 9 : p.y + 15;
      nodesHtml += `
        <text x="${p.x.toFixed(1)}" y="${arrowY.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${arrowColor}">${arrowChar}</text>
      `;
    }

    // X-Axis Month/Date Label
    if (i === 0 || i === series.length - 1 || (i % tickStep === 0 && i < series.length - Math.floor(tickStep / 2))) {
      nodesHtml += `
        <text x="${p.x.toFixed(1)}" y="${padT + chartH + 18}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--muted)">${escapeHtml(s.shortLabel)}</text>
      `;
    }

    // Invisible interactive hover/click column
    hoverColsHtml += `
      <rect x="${(p.x - colW / 2).toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${chartH}" fill="transparent" style="cursor: pointer;" data-fline-idx="${i}" title="Click to test spend at this date" />
    `;
  });

  const svgContent = `
    <svg class="forecast-line-svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="forecastAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f766e" stop-opacity="0.32" />
          <stop offset="60%" stop-color="#0f766e" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#0f766e" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="forecastLineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0f766e" />
          <stop offset="50%" stop-color="#14b8a6" />
          <stop offset="100%" stop-color="#2dd4bf" />
        </linearGradient>
      </defs>

      <!-- Deficit Hazard Area -->
      ${deficitZoneHtml}

      <!-- Background Grid & Axes -->
      ${gridLinesHtml}
      ${zeroLineHtml}

      <!-- Area Fill -->
      <path d="${areaD}" fill="url(#forecastAreaGrad)" />

      <!-- Baseline Trajectory Line -->
      <path d="${pathD}" fill="none" stroke="url(#forecastLineGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Simulated What-If Comparison Curve -->
      ${simPathHtml}

      <!-- Active Hover Crosshair Line -->
      <line id="fLineCrosshair" x1="0" y1="${padT}" x2="0" y2="${padT + chartH}" stroke="var(--teal)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0" pointer-events="none" />

      <!-- Nodes & Labels -->
      ${nodesHtml}

      <!-- Interactive Columns -->
      ${hoverColsHtml}
    </svg>
  `;

  svgWrap.innerHTML = svgContent;

  // 6. Tooltip & Crosshair Interactive Events
  const tooltip = document.getElementById("forecastLineTooltip");
  const crosshair = document.getElementById("fLineCrosshair");

  const showTooltipForIndex = (idx) => {
    const s = series[idx];
    const p = points[idx];
    if (!s || !p || !tooltip) return;

    const isClimbing = idx === 0 ? true : s.balance >= series[idx - 1].balance;
    const cumChange = s.balance - openingBalance;
    const cumPct = openingBalance !== 0 ? ((cumChange / Math.abs(openingBalance)) * 100).toFixed(1) : 0;
    const sign = cumChange >= 0 ? "+" : "";
    const safeBuffer = s.safeToSpend || 0;

    let simRowHtml = "";
    if (isSimActive && s.isPostSim) {
      simRowHtml = `
        <div class="forecast-tooltip-row sub" style="border-top: 1px dashed rgba(245, 158, 11, 0.4); margin-top: 5px; padding-top: 4px;">
          <span style="color: #f59e0b; font-weight: 600;">With Test Spend (-${money(simulatedSpendAmount)}):</span>
          <strong style="color: ${s.simulatedBalance < 0 ? "#ef4444" : "#f59e0b"};">${money(s.simulatedBalance)}</strong>
        </div>
      `;
    }

    if (s.isOpening) {
      tooltip.innerHTML = `
        <div class="forecast-tooltip-title">
          <span>Starting Balance</span>
          <span class="forecast-tooltip-badge up">Opening</span>
        </div>
        <div class="forecast-tooltip-row">
          <span style="color: var(--muted);">Current Cash:</span>
          <strong style="color: var(--ink);">${money(s.balance)}</strong>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Safe-to-Spend Today:</span>
          <strong style="color: ${safeBuffer > 0 ? "#10b981" : "#ef4444"};">${money(safeBuffer)}</strong>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Date:</span>
          <span>${escapeHtml(s.fullLabel)}</span>
        </div>
        ${simRowHtml}
      `;
    } else if (forecastLineChartMode === "entries") {
      const isIncome = s.type === "income";
      tooltip.innerHTML = `
        <div class="forecast-tooltip-title">
          <span style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(s.category)}</span>
          <span class="forecast-tooltip-badge ${isIncome ? "up" : "down"}">
            ${isIncome ? "▲ +" : "▼ -"}${money(s.amount)}
          </span>
        </div>
        <div class="forecast-tooltip-row">
          <span style="color: var(--muted);">Running Cash:</span>
          <strong style="color: ${s.balance < 0 ? "#ef4444" : "var(--ink)"};">${money(s.balance)}</strong>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Date:</span>
          <span>${escapeHtml(s.fullLabel)}</span>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Type:</span>
          <span style="text-transform: capitalize; color: ${isIncome ? "#10b981" : "#ef4444"}; font-weight: 600;">${escapeHtml(s.type)}</span>
        </div>
        <div class="forecast-tooltip-row sub" style="margin-top: 5px; border-top: 1px dashed var(--line); padding-top: 4px;">
          <span>Safe-to-Spend Here:</span>
          <strong style="color: ${safeBuffer > 0 ? "#10b981" : "#ef4444"};">${money(safeBuffer)}</strong>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Net from Start:</span>
          <span style="font-weight: 700; color: ${cumChange >= 0 ? "#10b981" : "#ef4444"};">
            ${sign}${money(cumChange)} (${cumPct}%)
          </span>
        </div>
        ${simRowHtml}
      `;
    } else {
      tooltip.innerHTML = `
        <div class="forecast-tooltip-title">
          <span>${escapeHtml(s.fullLabel)}</span>
          <span class="forecast-tooltip-badge ${isClimbing ? "up" : "down"}">
            ${isClimbing ? "▲" : "▼"} ${s.net >= 0 ? "+" : ""}${money(s.net)}
          </span>
        </div>
        <div class="forecast-tooltip-row">
          <span style="color: var(--muted);">Closing Balance:</span>
          <strong style="color: ${s.balance < 0 ? "#ef4444" : "var(--ink)"};">${money(s.balance)}</strong>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Safe-to-Spend Here:</span>
          <strong style="color: ${safeBuffer > 0 ? "#10b981" : "#ef4444"};">${money(safeBuffer)}</strong>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Forecast Income (${s.incomeCount}):</span>
          <span style="color: #10b981; font-weight: 600;">+${money(s.income)}</span>
        </div>
        <div class="forecast-tooltip-row sub">
          <span>Forecast Expenses (${s.expenseCount}):</span>
          <span style="color: #ef4444; font-weight: 600;">-${money(s.expense)}</span>
        </div>
        <div class="forecast-tooltip-row sub" style="margin-top: 5px; border-top: 1px dashed var(--line); padding-top: 4px;">
          <span>Net from Start:</span>
          <span style="font-weight: 700; color: ${cumChange >= 0 ? "#10b981" : "#ef4444"};">
            ${sign}${money(cumChange)} (${cumPct}%)
          </span>
        </div>
        ${simRowHtml}
      `;
    }

    // Position tooltip relative to container
    const leftPct = (p.x / viewBoxW) * 100;
    const topPct = (p.y / viewBoxH) * 100;

    tooltip.style.left = `${leftPct}%`;
    tooltip.style.top = `${topPct}%`;

    // Smart adaptive positioning so tooltip is never cut off:
    // If point is in upper portion (topPct < 45%), flip tooltip downwards below the dot
    const flipDown = topPct < 45;
    let xAlign = "-50%";
    if (leftPct < 22) xAlign = "0%";
    else if (leftPct > 78) xAlign = "-100%";

    const yAlign = flipDown ? "16px" : "calc(-100% - 14px)";
    tooltip.style.transform = `translate(${xAlign}, ${yAlign})`;
    tooltip.removeAttribute("hidden");

    // Move crosshair
    if (crosshair) {
      crosshair.setAttribute("x1", String(p.x));
      crosshair.setAttribute("x2", String(p.x));
      crosshair.setAttribute("opacity", "0.9");
    }

    // Highlight dot
    const dot = document.getElementById(`fLineDot-${idx}`);
    if (dot) {
      dot.setAttribute("r", "7");
      dot.setAttribute("stroke-width", "3.5");
    }
  };

  const hideTooltip = () => {
    if (tooltip) tooltip.setAttribute("hidden", "");
    if (crosshair) crosshair.setAttribute("opacity", "0");
    document.querySelectorAll(".forecast-dot").forEach((d) => {
      d.setAttribute("r", series.length > 36 ? "3" : "4.5");
      d.setAttribute("stroke-width", "2");
    });
  };

  svgWrap.querySelectorAll("[data-fline-idx]").forEach((col) => {
    const idx = Number(col.dataset.flineIdx);
    col.addEventListener("mouseenter", () => showTooltipForIndex(idx));
    col.addEventListener("mousemove", () => showTooltipForIndex(idx));
    col.addEventListener("mouseleave", hideTooltip);
    col.addEventListener("click", () => {
      const s = series[idx];
      if (s) {
        const targetDate = s.date || DateUtils.todayString();
        const dateInput = document.getElementById("forecastSimDate");
        const amtInput = document.getElementById("forecastSimAmount");
        if (dateInput) dateInput.value = targetDate;
        if (amtInput) amtInput.focus();
      }
    });
  });

  svgWrap.addEventListener("mouseleave", hideTooltip);
}

function getDeficitPeriods(entries = forecastEntries()) {
  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const sorted = [...entries]
    .filter((e) => e.date)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return 0;
    });

  let running = totalOpeningBalance;
  const periods = [];
  let currentPeriod = null;

  sorted.forEach((entry) => {
    const delta = Number(entry.amount || 0) * (entry.type === "income" ? 1 : -1);
    running = Math.round((running + delta) * 100) / 100;

    if (running < -0.005) {
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
              source: entry.source,
              account: entry.account,
              entry,
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
          source: entry.source,
          account: entry.account,
          entry,
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
  if (el) el.innerHTML = rows || `<div class="list-row empty-row"><span>💳 No expenses logged yet · Add an expense to view category mix</span></div>`;

  const expenseMixPanel = document.getElementById("expenseMixPanel");
  if (expenseMixPanel) {
    expenseMixPanel.classList.toggle("is-collapsed", Boolean(expenseMixCollapsed));
  }
}

function getDeficitSummary() {
  const forecastMonths = calculateForecast(forecastEntries()).filter((item) => item.balance < 0);
  const deficitPeriods = getDeficitPeriods(forecastEntries());
  const today = DateUtils.todayString();
  const overdueItems = getForecastCandidateEntries()
    .filter((entry) => entry.date && entry.date < today)
    .filter((entry) => !isOngoingEntry(entry))
    .map((entry) => {
      const isPartial = isPartialTracked(entry);
      const remaining = isPartial ? getRemainingForecastAmount(entry) : Number(entry.amount || 0);
      const settled = Boolean(entry.isClosed) || (isPartial ? remaining <= 0 : getEntryActualAmount(entry) > 0);
      return { entry, remaining, settled, daysOverdue: DateUtils.daysBetween(entry.date, today) };
    })
    .filter((item) => !item.settled)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { forecastMonths, deficitPeriods, overdueItems };
}

function renderDeficitBanner(summary) {
  const banner = document.getElementById("deficitBanner");
  if (!banner) return;
  const { forecastMonths, deficitPeriods, overdueItems } = summary;
  const hasAny = (deficitPeriods && deficitPeriods.length) || forecastMonths.length || overdueItems.length;

  if (!hasAny) {
    banner.hidden = true;
    const adviceEl = document.getElementById("deficitRemediationAdvice");
    if (adviceEl) adviceEl.style.display = "none";
    return;
  }

  const parts = [];
  let peakDeficit = 0;
  if (deficitPeriods && deficitPeriods.length) {
    const firstPeriod = deficitPeriods[0];
    const durStr = firstPeriod.daysInDeficit > 0 ? ` (${firstPeriod.daysInDeficit} days negative)` : "";
    const deficitAmt = money(firstPeriod.startAmount || firstPeriod.lowestBalance);
    peakDeficit = Math.abs(firstPeriod.lowestBalance || firstPeriod.startAmount || 0);
    parts.push(`Balance turns negative on ${DateUtils.formatDisplayDate(firstPeriod.startDate)}${durStr} · First deficit: ${deficitAmt}`);
  } else if (forecastMonths.length) {
    peakDeficit = Math.abs(forecastMonths[0].balance || 0);
    parts.push(`${forecastMonths.length} month${forecastMonths.length === 1 ? "" : "s"} projected negative (First deficit: ${money(forecastMonths[0].balance)})`);
  }

  if (overdueItems.length) parts.push(`${overdueItems.length} item${overdueItems.length === 1 ? "" : "s"} overdue`);

  banner.hidden = false;
  const summaryEl = document.getElementById("deficitBannerSummary");
  if (summaryEl) summaryEl.textContent = parts.join(" · ");

  const adviceEl = document.getElementById("deficitRemediationAdvice");
  if (adviceEl) {
    if (peakDeficit > 0) {
      const suggestions = [];
      const firstPeriod = deficitPeriods && deficitPeriods.length ? deficitPeriods[0] : null;

      // Available active storage assets
      const userAssets = (storageAssets || []).filter(
        (a) => Number(a.quantity || 0) > 0 && Number(a.rate || 0) > 0
      );

      // --- Option 1: Foreign Currency FIRST (EUR & USD) ---
      const eurAsset = userAssets.find((a) => {
        const n = (a.name || "").toLowerCase();
        return n.includes("eur") || n.includes("euro");
      });
      const usdAsset = userAssets.find((a) => {
        const n = (a.name || "").toLowerCase();
        return n.includes("usd") || n.includes("dollar");
      });
      const otherFxAsset = userAssets.find((a) => {
        const n = (a.name || "").toLowerCase();
        return a !== eurAsset && a !== usdAsset && ["sar", "aed", "gbp", "currency", "foreign"].some((c) => n.includes(c));
      });

      const marketEur = (ratesData.currencies || []).find((c) => c.name === "EUR")?.sell || 52.0;
      const marketUsd = (ratesData.currencies || []).find((c) => c.name === "USD")?.sell || 48.5;

      const eurRate = eurAsset ? Number(eurAsset.rate) || marketEur : marketEur;
      const usdRate = usdAsset ? Number(usdAsset.rate) || marketUsd : marketUsd;

      const eurNeeded = Math.ceil(peakDeficit / (eurRate || 52.0));
      const usdNeeded = Math.round(peakDeficit / (usdRate || 48.5));

      if (eurAsset && usdAsset) {
        suggestions.push(`Exchange ~€${eurNeeded} EUR (or ~$${usdNeeded} USD)`);
      } else if (eurAsset) {
        suggestions.push(`Exchange ~€${eurNeeded} EUR`);
      } else if (usdAsset) {
        suggestions.push(`Exchange ~$${usdNeeded} USD`);
      } else if (otherFxAsset) {
        const needed = Math.ceil(peakDeficit / Number(otherFxAsset.rate));
        suggestions.push(`Exchange ~${needed} ${escapeHtml(otherFxAsset.name)}`);
      } else {
        suggestions.push(`Exchange ~€${eurNeeded} EUR or ~$${usdNeeded} USD`);
      }

      // --- Option 2: Liquidate Gold SECOND ---
      const goldAsset = userAssets.find((a) => {
        const n = (a.name || "").toLowerCase();
        return n.includes("gold") || n.includes("ذهب");
      });

      if (goldAsset) {
        const needed = (peakDeficit / Number(goldAsset.rate)).toFixed(1);
        suggestions.push(`Liquidate ~${needed}${goldAsset.unit ? ` ${goldAsset.unit}` : "g"} ${escapeHtml(goldAsset.name)}`);
      } else {
        const gold21Rate = (ratesData.gold || []).find((g) => g.name === "Gold 21")?.sell || 3150;
        const goldGramsNeeded = (peakDeficit / gold21Rate).toFixed(1);
        suggestions.push(`Liquidate ~${goldGramsNeeded}g Gold 21`);
      }

      // --- Option 3: Postpone ONLY flexible / discretionary expenses (NEVER installments or credit dues) ---
      let flexibleCandidate = null;
      if (firstPeriod) {
        // Step 1: Check steps within the deficit spell that are strictly flexible
        if (Array.isArray(firstPeriod.steps)) {
          flexibleCandidate = firstPeriod.steps.find((s) => s.type === "expense" && !isStrictObligation(s) && Number(s.amount || 0) > 0);
        }
        // Step 2: Check candidate upcoming expenses right before deficit start date
        if (!flexibleCandidate) {
          const entries = forecastEntries();
          const discretionary = entries.filter((e) =>
            e.type === "expense" &&
            e.date &&
            e.date <= firstPeriod.startDate &&
            !isStrictObligation(e) &&
            Number(e.amount || 0) >= peakDeficit * 0.25
          );
          discretionary.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
          flexibleCandidate = discretionary[0] || null;
        }
      }

      if (flexibleCandidate && flexibleCandidate.amount) {
        const catName = escapeHtml(flexibleCandidate.category || "flexible expense");
        suggestions.push(`Postpone <strong>${catName}</strong> (${money(flexibleCandidate.amount)})`);
      }

      // --- Option 4: Short-term bridging until next forecasted income ---
      if (firstPeriod && firstPeriod.resolvedDate) {
        const dur = firstPeriod.daysInDeficit > 0 ? ` (${firstPeriod.daysInDeficit}d)` : "";
        suggestions.push(`Bridge via loan/credit until ${DateUtils.formatDisplayDate(firstPeriod.resolvedDate)}${dur}`);
      } else {
        suggestions.push(`Bridge ${money(peakDeficit)} via short-term loan/credit`);
      }

      const suggestion = `💡 <strong>Remediation:</strong> ${suggestions.join(" · ")}`;
      adviceEl.innerHTML = suggestion;
      adviceEl.style.display = "inline-flex";
    } else {
      adviceEl.style.display = "none";
    }
  }
}

function renderDeficits(summary) {
  const { forecastMonths, deficitPeriods, overdueItems } = summary;

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

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const headers = ["Date", "Actual Date", "Category", "Subcategory / Tags", "Account", "Type", "Source", "Planned Amount (EGP)", "Actual Amount (EGP)"];
  const rows = allEntries.map((e) => [
    escapeCsv(e.date || ""),
    escapeCsv(getEntryActualDate(e) || ""),
    escapeCsv(e.category || ""),
    escapeCsv(getEntryTags(e).join(", ") || ""),
    escapeCsv(e.account || ""),
    escapeCsv(e.type || ""),
    escapeCsv(e.source || ""),
    Number(e.amount || 0),
    getEntryActualAmount(e)
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
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

  const matchesFilters = (entry) => {
    if (typeFilter !== "all" && entry.type !== typeFilter) return false;
    if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
    if (search) {
      const cat = (entry.category || "").toLowerCase();
      const tags = getEntryTags(entry).map((t) => t.toLowerCase()).join(" ");
      if (!cat.includes(search) && !tags.includes(search)) return false;
    }
    return true;
  };

  const today = DateUtils.todayString();
  const openingRows = openingBalanceEntries().filter(matchesFilters);
  const forecastRows = getForecastCandidateEntries()
    .filter((entry) => {
      if (entry.isClosed) return false;
      const actualAmount = getEntryActualAmount(entry);
      // Only past closed billing cycles (< currentMonthKey) with no unpaid balance are excluded from forecasts
      if (entry.isCreditSettlement) {
        const currentMonthKey = DateUtils.currentYearMonth();
        const cycleMonth = entry.cycleMonth || (entry.id ? entry.id.split("-").slice(3).join("-") : "");
        if (cycleMonth && cycleMonth < currentMonthKey && actualAmount <= 0 && !entry.isCustomized) {
          return false;
        }
      }
      if (actualAmount <= 0) return true;
      if (entry.keepOngoing) return true;
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
    .sort((a, b) => {
      const dateCmp = (a.date || "").localeCompare(b.date || "");
      if (dateCmp !== 0) return dateCmp;
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return 0;
    });

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
      const isPartial = isPartialTracked(entry);
      const isLoan = isLoanInflow(entry);
      const remainingAmt = entry.remainingAmount !== undefined ? entry.remainingAmount : getRemainingForecastAmount(entry);
      const isPastDate = entry.date && entry.date < DateUtils.todayString();
      const canFinish = isPartial && !entry.isClosed && (remainingAmt > 0 || entry.keepOngoing) && (actualValue > 0 || isPastDate || isLoan);

      const finishTitle = isLoan
        ? "Finish loan facility at current drawn amount"
        : "Finish spending and close budget at current spent amount";
      const finishAction = canFinish
        ? `<button class="ghost-button finish-loan-btn" data-finish-loan-key="${escapeHtml(deleteKey)}" type="button" style="font-size:11px; padding:3px 8px; color:var(--green); border-color:var(--green); margin-right:4px;" title="${escapeHtml(finishTitle)}">✓ Finish</button>`
        : "";
      const action = !deleteKey || !canDelete ? "" : `${finishAction}<button class="delete-button" data-delete-key="${escapeHtml(deleteKey)}" type="button">Delete</button>`;

      const inputPlaceholder = isLoan ? "Add draw" : entry.type === "income" ? "Add actual" : "Add spend";
      const origPlanned = Number(entry.originalPlannedAmount !== undefined ? entry.originalPlannedAmount : entry.amount) || 0;
      const isFull = origPlanned > 0 && actualValue >= origPlanned;
      const progressLabel = isLoan
        ? (isFull ? `Drawn so far: ${escapeHtml(money(actualValue))} (Full amount reached · Ongoing)` : `Drawn so far: ${escapeHtml(money(actualValue))} (Remaining: ${escapeHtml(money(remainingAmt))})`)
        : (isFull ? `Spent so far: ${escapeHtml(money(actualValue))} (Full budget reached · Ongoing)` : `Spent so far: ${escapeHtml(money(actualValue))} (Remaining: ${escapeHtml(money(remainingAmt))})`);

      const actualCell = editable
        ? `<div>
            <input class="inline-actual-input" data-entry-actual-input="${escapeHtml(deleteKey)}" type="number" min="0" step="0.01" value="" placeholder="${escapeHtml(inputPlaceholder)}">
            ${actualValue > 0 ? `<small style="display:block;color:var(--muted);margin-top:4px;white-space:nowrap;">${progressLabel}</small>` : ""}
          </div>`
        : `<span>${actualValue > 0 ? escapeHtml(money(actualValue)) : "—"}</span>`;
      const span = getEntryDateSpan(entry);
      let dateCell = escapeHtml(DateUtils.formatDisplayDate(entry.date) || entry.date || "—");
      if (isPartial && (remainingAmt > 0 || entry.keepOngoing) && !entry.isClosed) {
        if (span.isSpan) {
          dateCell = `<span><strong>${escapeHtml(span.display)}</strong> <span class="source-pill ${isLoan ? "loan" : ""}" style="font-size:10px; margin-left:4px; padding:1px 6px;" title="Active ongoing budget">Ongoing</span></span>`;
        } else if (actualValue > 0 || isPastDate) {
          const todayFormatted = DateUtils.formatDisplayDate(DateUtils.todayString());
          const startFormatted = DateUtils.formatDisplayDate(entry.date);
          const displaySpan = startFormatted !== todayFormatted ? `${startFormatted} → Today` : `From ${startFormatted}`;
          dateCell = `<span><strong>${escapeHtml(displaySpan)}</strong> <span class="source-pill ${isLoan ? "loan" : ""}" style="font-size:10px; margin-left:4px; padding:1px 6px;" title="Active ongoing budget">Ongoing</span></span>`;
        }
      }

      const statusInfo = !isOpeningBalance ? entryStatusMap.get(deleteKey) : null;
      const isDeficit = statusInfo && statusInfo.type === "deficit";
      const isRecovery = statusInfo && statusInfo.type === "recovery";

      let rowClass = "entry-row";
      let rowTitle = isOpeningBalance ? "Edit on the Accounts page" : "";
      let statusBadge = "";

      if (isOpeningBalance) {
        rowClass += " opening-balance-row";
      } else {
        if (isLoan) {
          rowClass += " loan-entry-row";
          rowTitle = "Loan facility / borrowed funds (not your earned income)";
          statusBadge += `<span class="borrowed-funds-tag" title="Borrowed funds · not your earned income">💳 Borrowed</span>`;
        }
        if (isDeficit) {
          rowClass += " deficit-entry-row danger-row";
          rowTitle = `Deficit spell: Projected cash balance ${money(statusInfo.balance)}`;
          statusBadge += `<span class="deficit-badge active" style="margin-left: 6px; font-size: 10px; vertical-align: middle;">Deficit</span>`;
        } else if (isRecovery) {
          rowClass += " recovery-entry-row success-row";
          rowTitle = `Recovery: Projected cash balance recovered to ${money(statusInfo.balance)}`;
          statusBadge += `<span class="deficit-badge resolved" style="margin-left: 6px; font-size: 10px; vertical-align: middle;">Recovery</span>`;
        }
      }

      let sourceCellHtml = "";
      if (isCreditCardExpense(entry)) {
        const setDateStr = DateUtils.formatDisplayDate(getCreditSettlementDate(entry));
        sourceCellHtml = `<span class="source-pill" style="display:inline-flex; align-items:center; gap:3px; color:var(--blue); font-weight:600;" title="Paid via credit card · Cash settles ${setDateStr}">💳 Settles ${setDateStr}</span>`;
      } else if (entry.source === "recurring credit" || (entry.id && entry.id.startsWith("credit-settlement-")) || isCreditDueLumpSum(entry)) {
        sourceCellHtml = `<span class="source-pill credit-due-pill" title="Credit settlement due">🏛️ Credit Due</span>`;
      } else {
        sourceCellHtml = `<span class="source-pill ${entry.source === "loan" ? "loan" : ""}">${escapeHtml(entry.source || "manual")}</span>`;
      }

      let categoryDisplayHtml = escapeHtml(entry.category || "—");
      const tagPills = renderSubcatTagPills(entry);
      if (tagPills) {
        categoryDisplayHtml += ` ${tagPills}`;
      }
      if (entry.cardSpendTotal > 0 || (entry.isCreditSettlement && entry.cardExpenseCount > 0)) {
        const customNote = entry.isCustomized ? ` <span style="font-size:10px; color:var(--accent, #eab308); font-weight:600;">(Edited)</span>` : "";
        categoryDisplayHtml += `<small style="display:block; color:var(--muted); font-size:11px; margin-top:2px;">Covers ${money(entry.cardSpendTotal)} card spend${entry.baseDue > 0 ? ` + ${money(entry.baseDue)} base due` : ""}${customNote}</small>`;
      }

      return `
        <tr data-entry-id="${escapeHtml(deleteKey)}" class="${rowClass}" style="cursor:${clickable ? "pointer" : "default"};" title="${escapeHtml(rowTitle)}">
          <td class="cell-date">${dateCell}</td>
          <td class="cell-category">${categoryDisplayHtml}${statusBadge}</td>
          <td class="cell-account">${escapeHtml(entry.account || "cash")}</td>
          <td class="cell-type"><span class="pill ${escapeHtml(entry.type)}">${escapeHtml(entry.type)}</span></td>
          <td class="cell-source">${sourceCellHtml}</td>
          <td class="cell-amount number">${escapeHtml(money(entry.amount))}</td>
          <td class="cell-actual number">${actualCell}</td>
          <td class="cell-actions number">${action}</td>
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
        <div class="inline-fields salary-fields">
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

  const salaryPanel = document.getElementById("salaryStructurePanel");
  if (salaryPanel) {
    salaryPanel.classList.toggle("is-collapsed", Boolean(salaryStructureCollapsed));
  }
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
  const installmentsPanel = document.getElementById("installmentsPanel");
  if (installmentsPanel) {
    installmentsPanel.classList.toggle("is-collapsed", Boolean(installmentsCollapsed));
  }
  const countBadge = document.getElementById("installmentCountBadge");
  if (countBadge) {
    countBadge.textContent = `${installments.length} active`;
  }

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

    // Record dated transaction tranche (spend or draw)
    const adjustmentResult = await promptAccountAdjustment(
      entry.type || "expense",
      typedAmount,
      entry.account || "cash",
      entry.category || "",
      entry.tag || ""
    );

    const trancheTag = (adjustmentResult && adjustmentResult.tag) ? adjustmentResult.tag : (entry.tag || "");
    const trancheAccount = (adjustmentResult && adjustmentResult.accountId) ? adjustmentResult.accountId : (entry.account || "cash");

    if (trancheTag && !entry.tag) {
      entry.tag = trancheTag;
    }

    if (!Array.isArray(entry.draws)) {
      entry.draws = previousActual > 0
        ? [{ date: entry.actualDate || entry.date || DateUtils.todayString(), amount: previousActual, tag: entry.tag || "", account: entry.account || "cash" }]
        : [];
    } else if (entry.draws.length === 1 && previousActual > 0 && Math.round(entry.draws[0].amount || 0) !== previousActual) {
      entry.draws[0].amount = previousActual;
    }
    entry.draws.push({
      date: DateUtils.todayString(),
      amount: typedAmount,
      tag: trancheTag,
      account: trancheAccount
    });
    setEntryActualDate(entry, DateUtils.todayString());
    saveSetting(keys.entries, cashEntries);

    if (adjustmentResult && adjustmentResult.accountId) {
      adjustAccountBalance(adjustmentResult.accountId, typedAmount, entry.type || "expense");
    }
    renderAll();

    if (isLoanInflow(entry)) {
      await handleLoanRepaymentAdjustmentPrompt(entry, newActual);
    }

    const plannedAmount = Number(entry.amount || 0);
    // Modal prompt when exact or full planned amount is reached
    if (newActual >= plannedAmount && plannedAmount > 0 && !entry.isClosed) {
      const decision = await promptExactAmountDecision(entry, newActual, plannedAmount);
      if (decision === "keep") {
        entry.keepOngoing = true;
        entry.isClosed = false;
      } else {
        entry.isClosed = true;
        entry.keepOngoing = false;
      }
      saveSetting(keys.entries, cashEntries);
      renderAll();
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
    if (entry.draws && Array.isArray(entry.draws) && entry.draws.length > 0) {
      entry.draws.forEach((d) => {
        const k = DateUtils.getMonthKey(d.date);
        if (k) months.add(k);
      });
    } else {
      const actDate = getEntryActualDate(entry);
      const key = DateUtils.getMonthKey(actDate);
      if (key) months.add(key);
    }
  });
  const orderedMonths = [...months].sort();

  let totalLifetimeIncome = 0;
  let totalLifetimeExpenses = 0;

  const rows = orderedMonths.map((month) => {
    let income = 0;
    let expenses = 0;

    // Track credit card actuals maturing in this settlement month to prevent double counting on credit due payments
    let cibOffset = actualEntries
      .filter((e) => isCreditCardExpense(e) && (e.creditType || "").toLowerCase().startsWith("cib") && getCreditSettlementMonth(e) === month)
      .reduce((sum, e) => sum + getEntryActualAmount(e), 0);
    let hsbcOffset = actualEntries
      .filter((e) => isCreditCardExpense(e) && (e.creditType || "").toLowerCase().startsWith("hsbc") && getCreditSettlementMonth(e) === month)
      .reduce((sum, e) => sum + getEntryActualAmount(e), 0);

    actualEntries.forEach((entry) => {
      if (entry.draws && Array.isArray(entry.draws) && entry.draws.length > 0) {
        const monthDraws = entry.draws.filter((d) => DateUtils.getMonthKey(d.date) === month);
        const monthTotal = monthDraws.reduce((sum, d) => sum + Number(d.amount || 0), 0);
        if (entry.type === "income") income += monthTotal;
        else expenses += monthTotal;
      } else {
        const actDate = getEntryActualDate(entry);
        if (DateUtils.getMonthKey(actDate) === month) {
          const amt = getEntryActualAmount(entry);
          if (entry.type === "income") {
            income += amt;
          } else {
            if (entry.source === "recurring credit" || isCreditDueLumpSum(entry)) {
              const acc = (entry.account || entry.creditType || "").toLowerCase();
              if (acc.includes("cib")) {
                const ded = Math.min(amt, cibOffset);
                cibOffset = Math.max(0, cibOffset - ded);
                expenses += (amt - ded);
              } else if (acc.includes("hsbc")) {
                const ded = Math.min(amt, hsbcOffset);
                hsbcOffset = Math.max(0, hsbcOffset - ded);
                expenses += (amt - ded);
              } else {
                expenses += amt;
              }
            } else {
              expenses += amt;
            }
          }
        }
      }
    });

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

  const tagFilterEl = document.getElementById("historyTagFilter");
  if (tagFilterEl) {
    const prevTagVal = tagFilterEl.value || "all";
    const tagSet = new Set();
    let hasUntagged = false;
    actualEntries.forEach((e) => {
      const tags = getEntryTags(e);
      if (tags.length === 0) {
        hasUntagged = true;
      } else {
        tags.forEach((t) => tagSet.add(t));
      }
      if (Array.isArray(e.draws) && e.draws.length > 0) {
        e.draws.forEach((d) => {
          if (!d.tag || !d.tag.trim()) {
            hasUntagged = true;
          }
        });
      }
    });
    const sortedTags = [...tagSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    tagFilterEl.innerHTML = `
      <option value="all"${prevTagVal === "all" ? " selected" : ""}>All tags</option>
      ${hasUntagged ? `<option value="__untagged__"${prevTagVal === "__untagged__" ? " selected" : ""}>📁 Untagged</option>` : ""}
      ${sortedTags.map((t) => `<option value="${escapeHtml(t)}"${t === prevTagVal ? " selected" : ""}>🏷️ ${escapeHtml(t)}</option>`).join("")}
    `;
  }

  // Filter criteria
  const selectedMonth = monthFilterEl ? monthFilterEl.value : "all";
  const typeFilterEl = document.getElementById("historyTypeFilter");
  const selectedType = typeFilterEl ? typeFilterEl.value : "all";
  const selectedAccount = accountFilterEl ? accountFilterEl.value : "all";
  const selectedTag = tagFilterEl ? tagFilterEl.value : "all";
  const searchEl = document.getElementById("historySearch");
  const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : "";

  // Helper to compute actual amount attributed to this entry under the active month & tag filter
  function getFilteredEntryAmount(entry) {
    const totalActual = getEntryActualAmount(entry);

    if (Array.isArray(entry.draws) && entry.draws.length > 0) {
      let trancheSum = 0;
      let matchedAny = false;
      entry.draws.forEach((d) => {
        const dAmt = Number(d.amount) || 0;
        const dMonth = DateUtils.getMonthKey(d.date);
        const dTag = (d.tag || entry.tag || "").trim();

        if (selectedMonth !== "all" && dMonth !== selectedMonth) return;

        if (selectedTag !== "all") {
          if (selectedTag === "__untagged__") {
            if (dTag) return;
          } else if (dTag.toLowerCase() !== selectedTag.toLowerCase()) {
            return;
          }
        }

        trancheSum += dAmt;
        matchedAny = true;
      });
      if (matchedAny) return trancheSum;
      if (selectedMonth !== "all" || selectedTag !== "all") return 0;
    }

    const actDate = getEntryActualDate(entry);
    if (selectedMonth !== "all" && DateUtils.getMonthKey(actDate) !== selectedMonth) return 0;

    const eTag = (entry.tag || "").trim();
    if (selectedTag === "__untagged__") {
      return !eTag ? totalActual : 0;
    }
    if (selectedTag !== "all") {
      return eTag.toLowerCase() === selectedTag.toLowerCase() ? totalActual : 0;
    }
    return totalActual;
  }

  const filteredEntries = actualEntries.filter((entry) => {
    if (selectedMonth !== "all") {
      if (Array.isArray(entry.draws) && entry.draws.length > 0) {
        const hasDrawInMonth = entry.draws.some((d) => DateUtils.getMonthKey(d.date) === selectedMonth);
        if (!hasDrawInMonth) return false;
      } else {
        const actDate = getEntryActualDate(entry);
        const entryMonth = DateUtils.getMonthKey(actDate);
        if (entryMonth !== selectedMonth) return false;
      }
    }
    if (selectedType !== "all" && entry.type !== selectedType) return false;
    if (selectedAccount !== "all" && (entry.account || "cash").toLowerCase() !== selectedAccount.toLowerCase()) return false;
    if (selectedTag !== "all") {
      const entryTags = getEntryTags(entry);
      if (selectedTag === "__untagged__") {
        const hasUntaggedDraw = Array.isArray(entry.draws) && entry.draws.some((d) => !d.tag || !d.tag.trim());
        if (entryTags.length > 0 && !hasUntaggedDraw) return false;
      } else {
        const tagLower = selectedTag.toLowerCase();
        const matchesEntryTag = (entry.tag || "").toLowerCase() === tagLower;
        const matchesDrawTag = Array.isArray(entry.draws) && entry.draws.some((d) => (d.tag || "").toLowerCase() === tagLower);
        if (!matchesEntryTag && !matchesDrawTag) return false;
      }
    }
    if (searchTerm) {
      const cat = (entry.category || "").toLowerCase();
      const acc = (entry.account || "").toLowerCase();
      const src = (entry.source || "").toLowerCase();
      const tags = getEntryTags(entry).map((t) => t.toLowerCase()).join(" ");
      if (!cat.includes(searchTerm) && !acc.includes(searchTerm) && !src.includes(searchTerm) && !tags.includes(searchTerm)) return false;
    }
    return true;
  });

  // Sort newest first by actual date
  filteredEntries.sort((a, b) => (getEntryActualDate(b) || "").localeCompare(getEntryActualDate(a) || ""));

  // Calculate filtered summary
  const filteredIncome = filteredEntries
    .filter((e) => e.type === "income")
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);
  const filteredExpenses = filteredEntries
    .filter((e) => e.type === "expense")
    .reduce((sum, e) => {
      const amt = getFilteredEntryAmount(e);
      if (e.source === "recurring credit" || isCreditDueLumpSum(e)) {
        const acc = (e.account || e.creditType || "").toLowerCase().includes("hsbc") ? "hsbc" : "cib";
        const entryMonth = DateUtils.getMonthKey(getEntryActualDate(e));
        const matchingCardActuals = actualEntries
          .filter((card) => isCreditCardExpense(card) && (card.creditType || "").toLowerCase().startsWith(acc) && getCreditSettlementMonth(card) === entryMonth)
          .reduce((s, card) => s + getEntryActualAmount(card), 0);
        return sum + Math.max(0, amt - matchingCardActuals);
      }
      return sum + amt;
    }, 0);
  const filteredNet = filteredIncome - filteredExpenses;

  const fIncomeEl = document.getElementById("historyFilteredIncome");
  if (fIncomeEl) fIncomeEl.textContent = money(filteredIncome);

  const fExpensesEl = document.getElementById("historyFilteredExpenses");
  if (fExpensesEl) fExpensesEl.textContent = money(filteredExpenses);

  const fNetEl = document.getElementById("historyFilteredNet");
  if (fNetEl) fNetEl.textContent = money(filteredNet);

  const fCountEl = document.getElementById("historyFilteredCount");
  if (fCountEl) fCountEl.textContent = `${filteredEntries.length} ${filteredEntries.length === 1 ? "entry" : "entries"}`;

  // Update Admin Mode Button & Banner
  const adminToggleBtn = document.getElementById("historyAdminToggleBtn");
  const adminLockIcon = document.getElementById("historyAdminLockIcon");
  const adminLockText = document.getElementById("historyAdminLockText");
  const adminBanner = document.getElementById("historyAdminBanner");

  if (adminToggleBtn) {
    adminToggleBtn.classList.toggle("admin-unlocked", historyAdminUnlocked);
    if (adminLockIcon) adminLockIcon.textContent = historyAdminUnlocked ? "🔓" : "🔒";
    if (adminLockText) adminLockText.textContent = historyAdminUnlocked ? "Admin Mode: Unlocked" : "Admin Mode: Locked";
  }
  if (adminBanner) {
    adminBanner.style.display = historyAdminUnlocked ? "block" : "none";
  }

  // Render individual rows
  const detailRows = filteredEntries
    .map((entry) => {
      const entryId = getEntryId(entry);
      const actualVal = getEntryActualAmount(entry);
      const plannedVal = Number(entry.amount) || 0;
      const isEditable = isEditableEntry(entry);
      const span = getEntryDateSpan(entry);
      const actualDate = getEntryActualDate(entry);
      const hasMultipleDraws = Array.isArray(entry.draws) && entry.draws.length > 1;
      const filteredVal = getFilteredEntryAmount(entry);
      const isFilteredDiff = (selectedMonth !== "all" || selectedTag !== "all") && filteredVal !== actualVal;
      const expandBtnHtml = hasMultipleDraws
        ? `<div style="margin-top:4px;"><button type="button" class="history-expand-draws-btn" data-expand-draws="${escapeHtml(entryId)}" data-count="${entry.draws.length}">▾ ${entry.draws.length} subspends${isFilteredDiff ? ` (${escapeHtml(money(filteredVal))} filtered)` : ""}</button></div>`
        : "";

      let dateCellHtml = "";
      if (span.isSpan) {
        dateCellHtml = `<strong style="white-space:nowrap;">${escapeHtml(span.display)}</strong>${expandBtnHtml}`;
      } else if (isLoanInflow(entry) && actualVal > 0) {
        const startFormatted = DateUtils.formatDisplayDate(actualDate);
        dateCellHtml = `<strong style="white-space:nowrap;">From ${escapeHtml(startFormatted)}</strong>${expandBtnHtml}`;
      } else {
        const displayActualDate = DateUtils.formatDisplayDate(actualDate);
        const isDiffFromForecast = entry.date && entry.date !== actualDate;
        dateCellHtml = `<strong>${escapeHtml(displayActualDate || "—")}</strong>${isDiffFromForecast ? `<small style="display:block;color:var(--muted);font-size:11px;margin-top:2px;" title="Originally forecasted for ${escapeHtml(DateUtils.formatDisplayDate(entry.date))}">Forecasted: ${escapeHtml(DateUtils.formatDisplayDate(entry.date))}</small>` : ""}${expandBtnHtml}`;
      }

      let categoryCellHtml = escapeHtml(entry.category || "—");
      const tagPills = renderSubcatTagPills(entry);
      if (tagPills) {
        categoryCellHtml += ` ${tagPills}`;
      }
      if (historyAdminUnlocked) {
        categoryCellHtml += `
          <input class="inline-subcat-input" data-history-tag-input="${escapeHtml(entryId)}" type="text" list="subcatSuggestions" value="${escapeHtml(entry.tag || "")}" placeholder="+ Tag" style="width: 84px; font-size: 11px; padding: 2px 6px; margin-left: 6px; vertical-align: middle; border-radius: 4px; border: 1px dashed var(--blue); background: var(--surface);" title="Edit or add subcategory tag in Admin Mode" onclick="event.stopPropagation()">
        `;
      }
      if (entry.source === "recurring credit" || isCreditDueLumpSum(entry)) {
        const acc = (entry.account || entry.creditType || "").toLowerCase().includes("hsbc") ? "hsbc" : "cib";
        const entryMonth = DateUtils.getMonthKey(getEntryActualDate(entry));
        const matchingCardActuals = actualEntries
          .filter((card) => isCreditCardExpense(card) && (card.creditType || "").toLowerCase().startsWith(acc) && getCreditSettlementMonth(card) === entryMonth)
          .reduce((s, card) => s + getEntryActualAmount(card), 0);
        if (matchingCardActuals > 0) {
          categoryCellHtml += `<small style="display:block;color:var(--muted);font-size:10px;margin-top:2px;">Settlement covers ${money(matchingCardActuals)} card spend${actualVal > matchingCardActuals ? ` + ${money(actualVal - matchingCardActuals)} untracked` : ""}</small>`;
        }
      }

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

      let actualDisplayHtml = actualVal > 0 ? escapeHtml(money(actualVal)) : "—";
      if (isFilteredDiff && actualVal > 0) {
        actualDisplayHtml = `${escapeHtml(money(filteredVal))} <small style="display:block;color:var(--muted);font-size:11px;" title="Full entry total is ${escapeHtml(money(actualVal))}">(${escapeHtml(money(actualVal))} total)</small>`;
      }

      const actualCell = isEditable || historyAdminUnlocked
        ? `<input class="inline-actual-input" data-history-entry-input="${escapeHtml(entryId)}" type="number" min="0" step="1" value="${actualVal > 0 ? actualVal : ""}" placeholder="0" style="width: 100px; text-align: right;">`
        : `<span>${actualDisplayHtml}</span>`;

      let action = "";
      if (historyAdminUnlocked) {
        action = `
          <div style="display:inline-flex; gap:4px; justify-content:flex-end; align-items:center; white-space:nowrap;">
            <button class="ghost-button" data-history-entry-edit="${escapeHtml(entryId)}" type="button" style="font-size:11px; padding:2px 7px; color:var(--blue); border-color:var(--blue);" title="Edit all fields of this entry">✏️ Edit</button>
            ${actualVal > 0 ? `<button class="delete-button" data-history-entry-clear="${escapeHtml(entryId)}" type="button" style="font-size:11px; padding:2px 7px;" title="Reset actual amount to 0">Clear</button>` : ""}
            <button class="delete-button" data-history-entry-delete="${escapeHtml(entryId)}" type="button" style="font-size:11px; padding:2px 7px;" title="Permanently delete this entry from history and forecast">🗑️</button>
          </div>
        `;
      } else if (isEditable && entry.source !== "starting balance") {
        action = `<button class="delete-button" data-history-entry-clear="${escapeHtml(entryId)}" type="button">Clear</button>`;
      }

      const rowClass = historyAdminUnlocked ? "history-admin-row" : "";
      const rowTitle = historyAdminUnlocked ? "Click to edit full entry details" : "";

      let historySourceCellHtml = "";
      if (isCreditCardExpense(entry)) {
        const sDate = DateUtils.formatDisplayDate(getCreditSettlementDate(entry));
        historySourceCellHtml = `<span class="source-pill" style="display:inline-flex; align-items:center; gap:3px; color:var(--blue); font-weight:600;" title="Paid via credit card · Settles ${sDate}">💳 Settles ${sDate}</span>`;
      } else if (entry.source === "recurring credit" || (entry.id && entry.id.startsWith("credit-settlement-")) || isCreditDueLumpSum(entry)) {
        historySourceCellHtml = `<span class="source-pill credit-due-pill" title="Credit settlement paid">🏛️ Credit Due</span>`;
      } else {
        historySourceCellHtml = `<span class="source-pill ${entry.source === "loan" ? "loan" : ""}">${escapeHtml(entry.source || "manual")}</span>`;
      }

      const mainRowHtml = `
        <tr class="${rowClass}" data-history-row-id="${escapeHtml(entryId)}" title="${escapeHtml(rowTitle)}">
          <td class="cell-date history-date-cell">${dateCellHtml}</td>
          <td class="cell-category">${categoryCellHtml}</td>
          <td class="cell-account">${escapeHtml((entry.account || "cash").toUpperCase())}</td>
          <td class="cell-type"><span class="pill ${escapeHtml(entry.type)}">${escapeHtml(entry.type)}</span></td>
          <td class="cell-source">${historySourceCellHtml}</td>
          <td class="cell-amount cell-planned number">${plannedVal > 0 ? escapeHtml(money(plannedVal)) : "—"}</td>
          <td class="cell-actual number">${actualCell}</td>
          <td class="cell-variance number">${varianceHtml}</td>
          <td class="cell-actions number">${action}</td>
        </tr>
      `;

      const subRowHtml = hasMultipleDraws
        ? `
          <tr class="history-subspends-row is-hidden" id="subspends-${escapeHtml(entryId)}">
            <td colspan="9" style="padding: 0 16px 12px 36px; background: var(--surface-subtle, rgba(0,0,0,0.02));">
              <div class="history-subspends-container">
                <div class="history-subspends-header">
                  <span>Breakdown of ${entry.draws.length} payment tranches for ${escapeHtml(entry.category || "Expense")}</span>
                  <span style="font-weight:600; color:var(--text); text-transform:none;">Total spent: ${escapeHtml(money(actualVal))}</span>
                </div>
                <table class="history-subspends-table">
                  <thead>
                    <tr>
                      <th style="width: 140px;">Payment Date</th>
                      <th>Subcategory Tag</th>
                      <th>Account</th>
                      <th style="text-align: right; width: 140px;">Tranche Amount</th>
                      ${historyAdminUnlocked ? `<th style="width: 40px; text-align: center;"></th>` : ""}
                    </tr>
                  </thead>
                  <tbody>
                    ${entry.draws.map((d, dIdx) => {
                      const tagLower = (d.tag || "").toLowerCase();
                      let mod = "";
                      if (tagLower === "food" || tagLower === "groceries") mod = " subcat-food";
                      else if (tagLower === "bills" || tagLower === "utilities" || tagLower === "electricity" || tagLower === "water" || tagLower === "internet") mod = " subcat-bills";
                      const tagBadge = d.tag
                        ? `<span class="subcat-tag-pill${mod}" data-tag-filter-click="${escapeHtml(d.tag)}" title="Filter history by tag: ${escapeHtml(d.tag)}" style="cursor: pointer;">🏷️ ${escapeHtml(d.tag)}</span>`
                        : `<span style="color:var(--muted); font-size:12px;">—</span>`;
                      const tagCellHtml = historyAdminUnlocked
                        ? `<div style="display:inline-flex; align-items:center; gap:6px;">
                            ${d.tag ? tagBadge : ""}
                            <input class="inline-subcat-input" data-draw-tag-input="${escapeHtml(entryId)}" data-draw-index="${dIdx}" type="text" list="subcatSuggestions" value="${escapeHtml(d.tag || "")}" placeholder="+ Tag" style="width: 100px; font-size: 11px; padding: 2px 6px; border-radius: 4px; border: 1px dashed var(--blue); background: var(--surface);" onclick="event.stopPropagation()" title="Edit subcategory tag for this payment">
                          </div>`
                        : tagBadge;
                      const adminActionCell = historyAdminUnlocked
                        ? `<td style="text-align: center; width: 40px;">
                            <button class="delete-button" data-draw-delete-entry="${escapeHtml(entryId)}" data-draw-delete-index="${dIdx}" type="button" style="font-size: 10px; padding: 2px 6px;" title="Delete this payment tranche" onclick="event.stopPropagation()">✕</button>
                          </td>`
                        : "";
                      const dateCellContent = historyAdminUnlocked
                        ? `<input class="inline-subcat-input" data-draw-date-input="${escapeHtml(entryId)}" data-draw-index="${dIdx}" type="date" value="${escapeHtml(d.date || "")}" style="font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px dashed var(--blue); background: var(--surface); color: var(--ink);" onclick="event.stopPropagation()" title="Edit payment date for this tranche">`
                        : `<strong>${escapeHtml(DateUtils.formatDisplayDate(d.date))}</strong>`;
                      const isFilterActive = (selectedMonth !== "all" || selectedTag !== "all");
                      const matchesMonth = selectedMonth === "all" || DateUtils.getMonthKey(d.date) === selectedMonth;
                      const matchesTag = selectedTag === "all" || (
                        selectedTag === "__untagged__"
                          ? (!d.tag || !d.tag.trim())
                          : (d.tag || "").toLowerCase() === selectedTag.toLowerCase()
                      );
                      const isTrancheMatch = isFilterActive && matchesMonth && matchesTag;
                      const trancheStyle = isTrancheMatch ? ` style="background: rgba(37,99,235,0.08);"` : "";
                      return `
                        <tr${trancheStyle}>
                          <td>${dateCellContent}</td>
                          <td>${tagCellHtml}</td>
                          <td><span style="font-size:11px; font-weight:700; text-transform:uppercase;">${escapeHtml(d.account || entry.account || "cash")}</span></td>
                          <td style="text-align: right; font-weight:700;">${escapeHtml(money(d.amount))}${isTrancheMatch ? ` <small style="color:var(--blue); font-size:10.5px; font-weight:600; display:inline-block; margin-left:4px;">(match)</small>` : ""}</td>
                          ${adminActionCell}
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        `
        : "";

      return `${mainRowHtml}${subRowHtml}`;
    })
    .join("");

  detailsTable.innerHTML = detailRows || `<tr><td colspan="9">No validated entries match the selected filters</td></tr>`;

  // 3. Grouped Category & Source Summary + Donut Chart
  // Helper to map category and type into high-level smart buckets
  function getSmartGroupBucket(category, type, source) {
    const cat = (category || "").toLowerCase();
    const src = (source || "").toLowerCase();
    if (type === "income") {
      if (cat.includes("salary")) return "Salary";
      if (cat.includes("loan") || src.includes("loan")) return "Loans Received";
      return "Other Income";
    }
    // Expense grouping
    if (cat.includes("bill") || cat.includes("utility") || cat.includes("utilities") || cat.includes("rent") || cat.includes("telecom") || cat.includes("internet") || cat.includes("subscription") || cat.includes("mobile") || cat.includes("phone") || cat.includes("we") || cat.includes("vodafone") || cat.includes("orange") || cat.includes("etisalat") || cat.includes("electricity") || cat.includes("water") || cat.includes("gas") || cat.includes("club")) {
      return "Bills & Utilities";
    }
    if (src.includes("recurring credit") || isCreditDueLumpSum({ type: "expense", category, creditType: cat, account: cat }) || cat.includes("credit") || cat.includes("cib") || cat.includes("hsbc")) {
      return "Credit & Cards";
    }
    if (src.includes("installment") || cat.includes("installment") || cat.includes("valyou") || cat.includes("sympl") || cat.includes("souhoola")) {
      return "Installments";
    }
    if (src.includes("loan") || cat.includes("loan") || cat.includes("repay")) {
      return "Loan Repayments";
    }
    if (cat.includes("food") || cat.includes("grocer") || cat.includes("market") || cat.includes("dining") || cat.includes("cafe") || cat.includes("coffee") || cat.includes("restaurant") || cat.includes("fuel") || cat.includes("car") || cat.includes("transport") || cat.includes("uber") || cat.includes("health") || cat.includes("pharmacy") || cat.includes("doctor") || cat.includes("personal") || cat.includes("shopping")) {
      return "Living & Daily Spend";
    }
    return category || "General Expenses";
  }

  // Update Grouping Tabs UI
  const groupByCategoryBtn = document.getElementById("historyGroupByCategory");
  const groupByTagBtn = document.getElementById("historyGroupByTag");
  if (groupByCategoryBtn) groupByCategoryBtn.classList.toggle("active", historyAnalyticsGrouping === "category");
  if (groupByTagBtn) groupByTagBtn.classList.toggle("active", historyAnalyticsGrouping === "tag");

  const groupTableHeaderEl = document.querySelector("#historyAnalyticsTableView thead th:first-child");
  if (groupTableHeaderEl) {
    groupTableHeaderEl.textContent = historyAnalyticsGrouping === "tag" ? "Subcategory / Tag" : "Group / Category";
  }

  const categoryGroups = new Map();

  if (historyAnalyticsGrouping === "tag") {
    // --- MODE: GROUP BY SUBCATEGORY / TAG ---
    filteredEntries.forEach((entry) => {
      const entryType = entry.type || "expense";
      if (Array.isArray(entry.draws) && entry.draws.length > 0) {
        entry.draws.forEach((d) => {
          const dAmt = Number(d.amount) || 0;
          if (dAmt <= 0) return;
          if (selectedMonth !== "all" && DateUtils.getMonthKey(d.date) !== selectedMonth) return;
          const rawTag = (d.tag || entry.tag || "").trim();
          if (selectedTag !== "all") {
            if (selectedTag === "__untagged__" && rawTag) return;
            if (selectedTag !== "__untagged__" && rawTag.toLowerCase() !== selectedTag.toLowerCase()) return;
          }
          const tagName = rawTag || "Untagged";
          const groupKey = `${tagName}|${entryType}`;
          if (!categoryGroups.has(groupKey)) {
            categoryGroups.set(groupKey, {
              category: tagName === "Untagged" ? "📁 Untagged" : `🏷️ ${tagName}`,
              rawName: tagName,
              isTag: true,
              type: entryType,
              count: 0,
              totalActual: 0,
              totalForecast: 0,
              subCategories: new Map()
            });
          }
          const g = categoryGroups.get(groupKey);
          g.count += 1;
          g.totalActual += dAmt;
          const parentCat = entry.category || "General";
          g.subCategories.set(parentCat, (g.subCategories.get(parentCat) || 0) + dAmt);
        });
      } else {
        const actualAmt = getFilteredEntryAmount(entry);
        if (actualAmt <= 0) return;
        const rawTag = (entry.tag || "").trim();
        const tagName = rawTag || "Untagged";
        const groupKey = `${tagName}|${entryType}`;
        if (!categoryGroups.has(groupKey)) {
          categoryGroups.set(groupKey, {
            category: tagName === "Untagged" ? "📁 Untagged" : `🏷️ ${tagName}`,
            rawName: tagName,
            isTag: true,
            type: entryType,
            count: 0,
            totalActual: 0,
            totalForecast: 0,
            subCategories: new Map()
          });
        }
        const g = categoryGroups.get(groupKey);
        g.count += 1;
        g.totalActual += actualAmt;
        g.totalForecast += Number(entry.amount || 0);
        const parentCat = entry.category || "General";
        g.subCategories.set(parentCat, (g.subCategories.get(parentCat) || 0) + actualAmt);
      }
    });
  } else {
    // --- MODE: GROUP BY HIGH-LEVEL CATEGORY ---
    filteredEntries.forEach((entry) => {
      const smartBucket = getSmartGroupBucket(entry.category, entry.type || "expense", entry.source);
      const key = `${smartBucket}|${entry.type || "expense"}`;
      if (!categoryGroups.has(key)) {
        categoryGroups.set(key, {
          category: smartBucket,
          rawName: smartBucket,
          isTag: false,
          type: entry.type || "expense",
          count: 0,
          totalActual: 0,
          totalForecast: 0,
          subCategories: new Map()
        });
      }
      const group = categoryGroups.get(key);
      group.count += 1;
      let actualForGroup = getFilteredEntryAmount(entry);
      if (entry.source === "recurring credit" || isCreditDueLumpSum(entry)) {
        const acc = (entry.account || entry.creditType || "").toLowerCase().includes("hsbc") ? "hsbc" : "cib";
        const entryMonth = DateUtils.getMonthKey(getEntryActualDate(entry));
        const matchingCardActuals = actualEntries
          .filter((card) => isCreditCardExpense(card) && (card.creditType || "").toLowerCase().startsWith(acc) && getCreditSettlementMonth(card) === entryMonth)
          .reduce((s, card) => s + getEntryActualAmount(card), 0);
        actualForGroup = Math.max(0, actualForGroup - matchingCardActuals);
      }
      group.totalActual += actualForGroup;
      group.totalForecast += Number(entry.amount || 0);

      const subCatName = entry.category || "General";
      group.subCategories.set(subCatName, (group.subCategories.get(subCatName) || 0) + actualForGroup);
    });
  }

  const sortedGroups = [...categoryGroups.values()].sort((a, b) => b.totalActual - a.totalActual);
  const totalFilteredActual = sortedGroups.reduce((sum, g) => sum + g.totalActual, 0);

  const groupTable = document.getElementById("historyGroupedTable");
  const categoryList = document.getElementById("historyCategoryGroupList");
  const pieChart = document.getElementById("historyPieChart");
  const pieCenterVal = document.getElementById("historyPieCenterValue");
  const groupedCountEl = document.getElementById("historyGroupedCount");
  const summaryNoteEl = document.getElementById("historyAnalyticsSummaryNote");

  // Apply collapsible panel state and view mode
  const analyticsPanel = document.getElementById("historyAnalyticsPanel");
  if (analyticsPanel) {
    analyticsPanel.classList.toggle("is-collapsed", Boolean(historyAnalyticsCollapsed));
  }
  applyHistoryAnalyticsView(historyAnalyticsView);

  if (summaryNoteEl) {
    const groupUnit = historyAnalyticsGrouping === "tag"
      ? (sortedGroups.length === 1 ? "tag" : "tags")
      : (sortedGroups.length === 1 ? "group" : "groups");
    const groupModeLabel = historyAnalyticsGrouping === "tag" ? "by Subcategory / Tag" : "by Category";
    summaryNoteEl.innerHTML = `Filtered actuals ${groupModeLabel} · <span id="historyGroupedCount">${sortedGroups.length} ${groupUnit}</span>`;
  } else if (groupedCountEl) {
    const groupUnit = historyAnalyticsGrouping === "tag"
      ? (sortedGroups.length === 1 ? "tag" : "tags")
      : (sortedGroups.length === 1 ? "group" : "groups");
    groupedCountEl.textContent = `${sortedGroups.length} ${groupUnit}`;
  }

  const palette = [
    "#0f766e", "#2f5f9f", "#a46a18", "#b8463f", "#1f7a4d", "#8b5cf6", "#ec4899", "#f97316", "#06b6d4", "#84cc16"
  ];

  if (totalFilteredActual <= 0 || sortedGroups.length === 0) {
    if (groupTable) groupTable.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);">No actualized data for current filter</td></tr>`;
    if (categoryList) categoryList.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px 0;">No actualized data for selection</div>`;
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

    // Render Grouped List with Progress bars and subcategory breakdowns
    if (categoryList) {
      categoryList.innerHTML = sortedGroups
        .map((group, idx) => {
          const color = palette[idx % palette.length];
          const pct = Math.round((group.totalActual / totalFilteredActual) * 100) || 0;
          const subItemsText = [...group.subCategories.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([subName, subAmt]) => `${subName} (${money(subAmt)})`)
            .join(" · ");

          const tagClickAttr = group.isTag && group.rawName && group.rawName !== "Untagged"
            ? ` data-tag-filter-click="${escapeHtml(group.rawName)}" style="cursor:pointer;" title="Filter history by tag: ${escapeHtml(group.rawName)}"`
            : "";

          return `
            <div class="list-row" style="flex-direction:column; align-items:stretch; gap:4px; padding:8px 10px;">
              <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:700;">
                <span style="display:flex; align-items:center; gap:6px;">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; flex-shrink:0;"></span>
                  <span${tagClickAttr}>${escapeHtml(group.category)}</span>
                  <span class="pill ${escapeHtml(group.type)}" style="font-size:10px; min-height:18px; padding:0 6px;">${escapeHtml(group.type)}</span>
                </span>
                <span>${escapeHtml(money(group.totalActual))} <small style="font-weight:normal; color:var(--muted)">(${pct}%)</small></span>
              </div>
              <div class="progress-bar-bg" style="height:5px;">
                <div class="progress-bar-fill" style="width:${pct}%; background-color:${color}; height:100%;"></div>
              </div>
              ${subItemsText ? `<span class="history-subitems-summary" title="${escapeHtml(subItemsText)}">${escapeHtml(subItemsText)}</span>` : ""}
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
          const subItemsText = [...group.subCategories.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([subName, subAmt]) => `${subName}: ${money(subAmt)}`)
            .join(", ");

          const tagClickAttr = group.isTag && group.rawName && group.rawName !== "Untagged"
            ? ` data-tag-filter-click="${escapeHtml(group.rawName)}" style="cursor:pointer;" title="Filter history by tag: ${escapeHtml(group.rawName)}"`
            : "";

          return `
            <tr>
              <td>
                <span style="display:inline-flex; align-items:center; gap:6px;">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;"></span>
                  <strong${tagClickAttr}>${escapeHtml(group.category)}</strong>
                </span>
                ${subItemsText ? `<small style="display:block; color:var(--muted); font-size:11px; margin-top:2px;" title="${escapeHtml(subItemsText)}">${escapeHtml(subItemsText)}</small>` : ""}
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

function setHistoryAnalyticsGrouping(mode) {
  if (mode !== "category" && mode !== "tag") mode = "category";
  historyAnalyticsGrouping = mode;
  saveSetting(keys.historyAnalyticsGrouping, historyAnalyticsGrouping);
  renderHistory();
}

function applyHistoryAnalyticsView(mode = historyAnalyticsView) {
  historyAnalyticsView = mode;
  const chartView = document.getElementById("historyAnalyticsChartView");
  const tableView = document.getElementById("historyAnalyticsTableView");
  const chartBtn = document.getElementById("historyViewModeChart");
  const tableBtn = document.getElementById("historyViewModeTable");
  const bothBtn = document.getElementById("historyViewModeBoth");

  if (chartBtn) chartBtn.classList.toggle("active", mode === "chart");
  if (tableBtn) tableBtn.classList.toggle("active", mode === "table");
  if (bothBtn) bothBtn.classList.toggle("active", mode === "both");

  if (chartView && tableView) {
    if (mode === "table") {
      chartView.style.display = "none";
      tableView.style.display = "block";
    } else if (mode === "both") {
      chartView.style.display = "flex";
      chartView.style.marginBottom = "16px";
      chartView.style.borderBottom = "1px solid var(--line)";
      chartView.style.paddingBottom = "16px";
      tableView.style.display = "block";
    } else {
      chartView.style.display = "flex";
      chartView.style.marginBottom = "0";
      chartView.style.borderBottom = "none";
      chartView.style.paddingBottom = "0";
      tableView.style.display = "none";
    }
  }
}

function setHistoryAnalyticsView(mode) {
  historyAnalyticsView = mode;
  saveSetting(keys.historyAnalyticsView, mode);
  applyHistoryAnalyticsView(mode);
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
    if (!Array.isArray(entry.draws) || entry.draws.length <= 1) {
      entry.draws = [{
        date: getEntryActualDate(entry),
        amount: newActual,
        tag: entry.tag || "",
        account: entry.account || "cash"
      }];
    }
    saveSetting(keys.entries, cashEntries);
    if (isArchived && archivedIndex !== -1) {
      saveSetting(keys.archivedEntries, archivedEntries);
    }
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
  delete entryActualDates[deleteKey];
  if (entry) {
    if (entry.actualAmount !== undefined) {
      entry.actualAmount = 0;
    }
    if (Array.isArray(entry.draws)) {
      entry.draws = [];
    }
    delete entry.actualDate;
  }
  saveSetting(keys.entryActuals, entryActuals);
  saveSetting(keys.entryActualDates, entryActualDates);
  saveSetting(keys.entries, cashEntries);
}

async function commitHistoryEntryTag(input) {
  if (!input) return;
  const entryId = input.dataset.historyTagInput;
  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry) return;

  const newTag = (input.value || "").trim();
  entry.tag = newTag;

  if (Array.isArray(entry.draws) && entry.draws.length === 1) {
    entry.draws[0].tag = newTag;
  }

  saveSetting(keys.entries, cashEntries);
  if (isArchived && archivedIndex !== -1) {
    saveSetting(keys.archivedEntries, archivedEntries);
  }
  renderHistory();
}

async function commitHistoryDrawTag(input) {
  if (!input) return;
  const entryId = input.dataset.drawTagInput;
  const drawIndex = Number(input.dataset.drawIndex);
  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry || !Array.isArray(entry.draws) || !entry.draws[drawIndex]) return;

  const newTag = (input.value || "").trim();
  entry.draws[drawIndex].tag = newTag;

  if (!entry.tag || entry.draws.length === 1) {
    entry.tag = newTag;
  }

  saveSetting(keys.entries, cashEntries);
  if (isArchived && archivedIndex !== -1) {
    saveSetting(keys.archivedEntries, archivedEntries);
  }
  renderHistory();
}

async function commitHistoryDrawDate(input) {
  if (!input) return;
  const entryId = input.dataset.drawDateInput;
  const drawIndex = Number(input.dataset.drawIndex);
  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry || !Array.isArray(entry.draws) || !entry.draws[drawIndex]) return;

  const newDate = (input.value || "").trim();
  if (!newDate) return;

  entry.draws[drawIndex].date = newDate;
  entry.draws.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  if (entry.draws.length > 0) {
    const latestDate = entry.draws[entry.draws.length - 1].date;
    setEntryActualDate(entry, latestDate);
  }

  saveSetting(keys.entries, cashEntries);
  if (isArchived && archivedIndex !== -1) {
    saveSetting(keys.archivedEntries, archivedEntries);
  }
  renderHistory();
}

async function deleteHistoryEntryDraw(entryId, drawIndex) {
  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry || !Array.isArray(entry.draws) || !entry.draws[drawIndex]) return;

  const targetDraw = entry.draws[drawIndex];
  const confirmed = await confirmAction(
    "Delete Subspend Tranche",
    `Delete ${money(targetDraw.amount)}${targetDraw.tag ? ` (${targetDraw.tag})` : ""} from ${DateUtils.formatDisplayDate(targetDraw.date)}? This will reduce recorded actuals.`
  );
  if (!confirmed) return;

  entry.draws.splice(drawIndex, 1);
  const newActual = entry.draws.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  setEntryActualAmount(entry, newActual);

  if (entry.draws.length > 0) {
    const latestDate = entry.draws[entry.draws.length - 1].date;
    setEntryActualDate(entry, latestDate);
  } else {
    delete entry.actualDate;
    delete entryActualDates[entryId];
    saveSetting(keys.entryActualDates, entryActualDates);
  }

  saveSetting(keys.entries, cashEntries);
  if (isArchived && archivedIndex !== -1) {
    saveSetting(keys.archivedEntries, archivedEntries);
  }
  renderAll();
}

async function deleteHistoryEntryCompletely(entryId) {
  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry) return;

  const confirmed = await confirmAction(
    "Delete History Entry",
    `Permanently delete "${entry.category}" (${money(entry.amount || getEntryActualAmount(entry))}) from budget history and forecasts?`
  );
  if (!confirmed) return;

  const cashIdx = cashEntries.findIndex((e) => getEntryId(e) === entryId);
  if (cashIdx !== -1) {
    cashEntries.splice(cashIdx, 1);
    saveSetting(keys.entries, cashEntries);
  }

  if (isArchived && archivedIndex !== -1) {
    archivedEntries.splice(archivedIndex, 1);
    saveSetting(keys.archivedEntries, archivedEntries);
  }

  if (entryId.startsWith("credit-settlement-")) {
    const parts = entryId.split("-");
    const accountKey = parts[2];
    const monthKey = `${parts[3]}-${parts[4]}`;
    const prevLen = cashEntries.length;
    cashEntries = cashEntries.filter((e) => !(isLumpCreditDueForAccount(e, accountKey) && DateUtils.getMonthKey(e.date) === monthKey));
    if (cashEntries.length !== prevLen) {
      saveSetting(keys.entries, cashEntries);
    }
    if (creditSettlementOverrides && creditSettlementOverrides[entryId]) {
      delete creditSettlementOverrides[entryId];
      saveSetting(keys.creditSettlementOverrides, creditSettlementOverrides);
    }
  }

  delete entryActuals[entryId];
  delete entryActualDates[entryId];
  saveSetting(keys.entryActuals, entryActuals);
  saveSetting(keys.entryActualDates, entryActualDates);

  if (!deletedForecasts.includes(entryId)) {
    deletedForecasts.push(entryId);
    saveSetting(keys.deletedForecasts, deletedForecasts);
  }

  renderAll();
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

let activeJobFilter = "all"; // 'all' | 'active' | 'invoiced' | 'paid'
let activeJobCurrencyFilter = "all";
let activeJobSort = "newest"; // 'newest' | 'oldest'
let jobDaysSortDirection = "asc"; // 'asc' (oldest first) | 'desc' (newest first)
const expandedJobIds = new Set();

function getJobEffectiveDate(job) {
  if (job.startDate) return job.startDate;
  if (Array.isArray(job.daysWorked) && job.daysWorked.length > 0) {
    const dates = job.daysWorked.map((d) => d.date).filter(Boolean).sort();
    if (dates.length > 0) return dates[0];
  }
  if (job.invoiceDate) return job.invoiceDate;
  if (job.paidDate) return job.paidDate;
  return "";
}

function formatJobDateBadge(job) {
  const start = job.startDate;
  const end = job.endDate;
  if (!start && !end) {
    if (Array.isArray(job.daysWorked) && job.daysWorked.length > 0) {
      const dates = job.daysWorked.map((d) => d.date).filter(Boolean).sort();
      if (dates.length === 1) {
        return `<span class="job-date-badge" title="Logged date">📅 ${escapeHtml(DateUtils.formatDisplayDate(dates[0]))}</span>`;
      }
      if (dates.length > 1) {
        return `<span class="job-date-badge" title="Logged work period">📅 ${escapeHtml(DateUtils.formatDisplayDate(dates[0]))} – ${escapeHtml(DateUtils.formatDisplayDate(dates[dates.length - 1]))}</span>`;
      }
    }
    if (job.invoiceDate) {
      return `<span class="job-date-badge" title="Invoice Date">📅 Invoiced ${escapeHtml(DateUtils.formatDisplayDate(job.invoiceDate))}</span>`;
    }
    return "";
  }

  if (start && end) {
    return `<span class="job-date-badge" title="Job Duration">📅 ${escapeHtml(DateUtils.formatDisplayDate(start))} – ${escapeHtml(DateUtils.formatDisplayDate(end))}</span>`;
  }
  if (start) {
    const isOngoing = (job.status || "active") === "active";
    return `<span class="job-date-badge" title="Start Date">📅 ${escapeHtml(DateUtils.formatDisplayDate(start))}${isOngoing ? " – Ongoing" : ""}</span>`;
  }
  return `<span class="job-date-badge" title="Target End Date">📅 Due ${escapeHtml(DateUtils.formatDisplayDate(end))}</span>`;
}

function calculateJobFinancials(job) {
  const type = job.type || "daily_rate";
  const currency = (job.currency || "USD").toUpperCase();
  const daysWorked = Array.isArray(job.daysWorked) ? job.daysWorked : [];
  const expenses = Array.isArray(job.expenses) ? job.expenses : [];
  const payments = Array.isArray(job.payments) ? job.payments : [];

  const totalDays = daysWorked.reduce((sum, d) => sum + (Number(d.units) || 1), 0);

  let grossFee = 0;
  if (type === "daily_rate") {
    grossFee = (Number(job.dailyRate) || 0) * totalDays;
  } else {
    grossFee = Number(job.lumpSumAmount) || 0;
  }

  let billableExpenses = 0;
  let deductibleExpenses = 0;
  expenses.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.isReimbursable !== false) {
      billableExpenses += amt;
    } else {
      deductibleExpenses += amt;
    }
  });

  const totalInvoice = grossFee + billableExpenses;
  const netEarnings = grossFee - deductibleExpenses;

  // Payments & Balance Calculations
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingBalance = Math.max(0, Math.round((totalInvoice - totalPaid) * 100) / 100);
  const percentPaid = totalInvoice > 0 ? Math.min(100, Math.round((totalPaid / totalInvoice) * 100)) : (totalPaid > 0 ? 100 : 0);

  // Computed Status
  let computedStatus = job.status || "active";
  if (totalPaid >= totalInvoice && totalInvoice > 0 && job.status !== "active") {
    computedStatus = "paid";
  } else if (totalPaid > 0 && remainingBalance > 0 && job.status !== "active" && job.status !== "invoiced") {
    computedStatus = "partial";
  } else if (job.status === "paid") {
    computedStatus = "paid";
  } else if (job.status === "invoiced") {
    computedStatus = "invoiced";
  } else if (job.status === "partial") {
    computedStatus = "partial";
  } else {
    computedStatus = "active";
  }

  const fxRate = getCurrencyRate(currency);
  const totalInvoiceEgp = Math.round(totalInvoice * fxRate);
  const netEarningsEgp = Math.round(netEarnings * fxRate);
  const grossFeeEgp = Math.round(grossFee * fxRate);
  const billableExpensesEgp = Math.round(billableExpenses * fxRate);
  const totalPaidEgp = Math.round(totalPaid * fxRate);
  const remainingBalanceEgp = Math.round(remainingBalance * fxRate);

  return {
    type,
    currency,
    totalDays,
    grossFee,
    billableExpenses,
    deductibleExpenses,
    totalInvoice,
    netEarnings,
    payments,
    totalPaid,
    remainingBalance,
    percentPaid,
    computedStatus,
    fxRate,
    totalInvoiceEgp,
    netEarningsEgp,
    grossFeeEgp,
    billableExpensesEgp,
    totalPaidEgp,
    remainingBalanceEgp
  };
}

function renderJobs() {
  const jobsListEl = document.getElementById("jobsList");
  if (!jobsListEl) return;

  // 1. Calculate Aggregated Metrics across all jobs
  let totalPendingEgp = 0;
  const pendingByCurrency = {};
  let totalPaidEgp = 0;
  let paidJobsCount = 0;
  let activeJobsCount = 0;
  let totalReimbursableEgp = 0;

  partTimeJobs.forEach((job) => {
    const fin = calculateJobFinancials(job);
    const curr = fin.currency;

    // Track all payments collected
    totalPaidEgp += fin.totalPaidEgp;
    if (fin.computedStatus === "paid") {
      paidJobsCount++;
    }

    // Pending receivables: remaining unpaid balance on invoiced or partial jobs
    if (fin.remainingBalance > 0 && (fin.computedStatus === "invoiced" || fin.computedStatus === "partial")) {
      totalPendingEgp += fin.remainingBalanceEgp;
      pendingByCurrency[curr] = (pendingByCurrency[curr] || 0) + fin.remainingBalance;
    }

    if (fin.computedStatus === "active") {
      activeJobsCount++;
    }

    if (fin.computedStatus !== "paid") {
      totalReimbursableEgp += fin.billableExpensesEgp;
    }
  });

  // Update Top KPIs
  const kpiPendingEgp = document.getElementById("jobsKpiPendingEgp");
  const kpiPendingBreakdown = document.getElementById("jobsKpiPendingBreakdown");
  const kpiPaidEgp = document.getElementById("jobsKpiPaidEgp");
  const kpiPaidSub = document.getElementById("jobsKpiPaidSub");
  const kpiActiveCount = document.getElementById("jobsKpiActiveCount");
  const kpiActiveSub = document.getElementById("jobsKpiActiveSub");
  const kpiExpensesEgp = document.getElementById("jobsKpiExpensesEgp");

  if (kpiPendingEgp) kpiPendingEgp.textContent = money(totalPendingEgp);
  if (kpiPendingBreakdown) {
    const breakdownEntries = Object.entries(pendingByCurrency);
    if (breakdownEntries.length === 0) {
      kpiPendingBreakdown.textContent = "No pending receivables";
    } else {
      kpiPendingBreakdown.textContent = breakdownEntries
        .map(([curr, amt]) => `${formatJobCurrency(amt, curr)} due`)
        .join(" + ");
    }
  }
  if (kpiPaidEgp) kpiPaidEgp.textContent = money(totalPaidEgp);
  if (kpiPaidSub) kpiPaidSub.textContent = `${paidJobsCount} job${paidJobsCount === 1 ? "" : "s"} settled`;
  if (kpiActiveCount) kpiActiveCount.textContent = String(activeJobsCount);
  if (kpiActiveSub) kpiActiveSub.textContent = `${activeJobsCount} job${activeJobsCount === 1 ? "" : "s"} in progress`;
  if (kpiExpensesEgp) kpiExpensesEgp.textContent = money(totalReimbursableEgp);

  // 2. Filter & Sort Jobs for Display
  const filteredJobs = partTimeJobs.filter((job) => {
    const fin = calculateJobFinancials(job);
    if (activeJobFilter !== "all") {
      if (activeJobFilter === "partial" && fin.computedStatus !== "partial") return false;
      if (activeJobFilter === "active" && fin.computedStatus !== "active") return false;
      if (activeJobFilter === "invoiced" && fin.computedStatus !== "invoiced") return false;
      if (activeJobFilter === "paid" && fin.computedStatus !== "paid") return false;
    }
    if (activeJobCurrencyFilter !== "all" && (job.currency || "USD").toUpperCase() !== activeJobCurrencyFilter.toUpperCase()) return false;
    return true;
  });

  filteredJobs.sort((a, b) => {
    const dateA = getJobEffectiveDate(a);
    const dateB = getJobEffectiveDate(b);
    if (dateA && dateB) {
      return activeJobSort === "oldest" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    return 0;
  });

  if (filteredJobs.length === 0) {
    jobsListEl.innerHTML = `
      <div class="glass-panel" style="text-align: center; padding: 48px 20px;">
        <div style="font-size: 38px; margin-bottom: 12px;">💼</div>
        <h3 style="font-size: 18px; margin-bottom: 6px; color: var(--ink);">No part-time jobs found</h3>
        <p style="color: var(--muted); font-size: 13px; max-width: 440px; margin: 0 auto 16px;">
          ${partTimeJobs.length === 0 ? "You haven't added any part-time jobs yet. Track your daily rates, milestones, client expenses, and multi-currency income." : "No jobs match the current filter selection."}
        </p>
        <button class="primary-button" type="button" onclick="document.getElementById('addNewJobBtn').click()">+ Create New Job</button>
      </div>
    `;
    return;
  }

  // 3. Render Jobs Stream Cards
  jobsListEl.innerHTML = filteredJobs
    .map((job) => {
      const fin = calculateJobFinancials(job);
      const isExpanded = expandedJobIds.has(job.id);
      const days = (Array.isArray(job.daysWorked) ? [...job.daysWorked] : []).sort((a, b) => {
        const dateA = a.date || "";
        const dateB = b.date || "";
        const cmp = dateA.localeCompare(dateB);
        return jobDaysSortDirection === "desc" ? -cmp : cmp;
      });
      const expenses = (Array.isArray(job.expenses) ? [...job.expenses] : []).sort((a, b) => {
        return (a.date || "").localeCompare(b.date || "");
      });
      const payments = (Array.isArray(fin.payments) ? [...fin.payments] : []).sort((a, b) => {
        return (a.date || "").localeCompare(b.date || "");
      });
      const dateBadgeHtml = formatJobDateBadge(job);

      const statusOptions = [
        { value: "active", label: "⏳ Active" },
        { value: "invoiced", label: "📄 Invoiced" },
        { value: "partial", label: `💳 Partial (${fin.percentPaid}%)` },
        { value: "paid", label: "✓ Paid" }
      ];

      const statusBadge = `
        <select class="job-badge job-status-select ${fin.computedStatus}" data-job-status-select="${job.id}" title="Click to change job status">
          ${statusOptions
            .map(
              (opt) =>
                `<option value="${opt.value}" ${fin.computedStatus === opt.value ? "selected" : ""}>${opt.label}</option>`
            )
            .join("")}
        </select>
      `;

      const rateTypeLabel = fin.type === "daily_rate"
        ? `${formatJobCurrency(job.dailyRate, fin.currency)}/day`
        : `Fixed Lump Sum`;

      const progressBarHtml = fin.totalInvoice > 0 ? `
        <div class="job-progress-wrap">
          <div class="job-progress-info">
            <span>Payment Progress</span>
            <span>${fin.percentPaid}% paid (${escapeHtml(formatJobCurrency(fin.totalPaid, fin.currency))} of ${escapeHtml(formatJobCurrency(fin.totalInvoice, fin.currency))})</span>
          </div>
          <div class="job-progress-track">
            <div class="job-progress-fill ${fin.computedStatus === 'paid' ? 'paid' : 'partial'}" style="width: ${fin.percentPaid}%;"></div>
          </div>
        </div>
      ` : "";

      return `
        <article class="job-card" data-job-card-id="${job.id}">
          <header class="job-card-header">
            <div class="job-card-title-wrap">
              <h4 class="job-card-title">${escapeHtml(job.title)}</h4>
              <span class="job-client-pill">🏢 ${escapeHtml(job.client)}</span>
              <span class="job-currency-badge">${escapeHtml(fin.currency)}</span>
              ${dateBadgeHtml}
              ${statusBadge}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="icon-button" data-job-edit="${job.id}" type="button" title="Edit Job">✏️</button>
              <button class="delete-button" data-job-delete="${job.id}" type="button" title="Delete Job">Delete</button>
            </div>
          </header>

          ${progressBarHtml}

          <!-- Summary Metric Grid with Accumulated Income & Expenses Cards -->
          <div class="job-summary-grid">
            <div class="job-summary-col highlight-income">
              <span class="job-summary-label">💼 Accumulated Income</span>
              <span class="job-summary-value text-green">${escapeHtml(formatJobCurrency(fin.grossFee, fin.currency))}</span>
              <span class="job-summary-eq">${fin.type === "daily_rate" ? `${fin.totalDays} day${fin.totalDays === 1 ? "" : "s"} logged` : "Fixed fee"} &bull; ≈ ${money(fin.grossFeeEgp)}</span>
            </div>
            <div class="job-summary-col highlight-expense">
              <span class="job-summary-label">🧾 Accumulated Expenses</span>
              <span class="job-summary-value text-amber">${escapeHtml(formatJobCurrency(fin.billableExpenses, fin.currency))}</span>
              <span class="job-summary-eq">${expenses.filter(e => e.isReimbursable !== false).length} client receipt${expenses.filter(e => e.isReimbursable !== false).length === 1 ? "" : "s"} &bull; ≈ ${money(fin.billableExpensesEgp)}</span>
            </div>
            <div class="job-summary-col highlight-charge">
              <span class="job-summary-label">🏷️ Total to Charge</span>
              <span class="job-summary-value text-blue">${escapeHtml(formatJobCurrency(fin.totalInvoice, fin.currency))}</span>
              <span class="job-summary-eq">Labor + Exp &bull; ≈ ${money(fin.totalInvoiceEgp)}</span>
            </div>
            <div class="job-summary-col">
              <span class="job-summary-label">💵 Paid So Far</span>
              <span class="job-summary-value">${escapeHtml(formatJobCurrency(fin.totalPaid, fin.currency))}</span>
              <span class="job-summary-eq">${payments.length} installment${payments.length === 1 ? "" : "s"} (${fin.percentPaid}%)</span>
            </div>
            <div class="job-summary-col">
              <span class="job-summary-label">⏳ Remaining Due</span>
              <span class="job-summary-value ${fin.remainingBalance > 0 ? 'text-amber' : 'text-green'}">
                ${escapeHtml(formatJobCurrency(fin.remainingBalance, fin.currency))}
              </span>
              <span class="job-summary-eq" style="font-weight: 700; ${fin.remainingBalance > 0 ? 'color: var(--amber);' : 'color: var(--green);'}">
                ${fin.remainingBalance > 0 ? `≈ ${money(fin.remainingBalanceEgp)} due` : '✓ Fully Settled'}
              </span>
            </div>
            <div class="job-summary-col">
              <span class="job-summary-label">📈 Net Profit</span>
              <span class="job-summary-value">${escapeHtml(formatJobCurrency(fin.netEarnings, fin.currency))}</span>
              <span class="job-summary-eq">≈ ${money(fin.netEarningsEgp)}</span>
            </div>
          </div>

          ${job.notes ? `<p style="font-size: 12px; color: var(--muted); margin: 0 0 12px; line-height: 1.4;">📝 ${escapeHtml(job.notes)}</p>` : ""}

          <!-- Action bar -->
          <div class="job-card-actions">
            <div class="job-btn-group">
              ${fin.type === "daily_rate" ? `<button class="ghost-button" data-job-log-day="${job.id}" type="button" style="font-size: 12px; padding: 0 10px; min-height: 32px;">+ Log Day</button>` : ""}
              <button class="ghost-button" data-job-add-expense="${job.id}" type="button" style="font-size: 12px; padding: 0 10px; min-height: 32px;">+ Add Expense</button>
              <button class="ghost-button" data-job-copy-invoice="${job.id}" type="button" style="font-size: 12px; padding: 0 10px; min-height: 32px;" title="Copy client billing summary to clipboard">📋 Copy Bill</button>
              <button class="job-toggle-btn" data-job-toggle-details="${job.id}" type="button">
                ${isExpanded ? "▲ Hide Breakdown" : `▼ Breakdown (${days.length} days, ${expenses.length} exp, ${payments.length} pay)`}
              </button>
            </div>
            <div class="job-btn-group">
              ${fin.computedStatus === "active" ? `<button class="ghost-button" data-job-mark-invoiced="${job.id}" type="button" style="font-size: 12px; padding: 0 12px; min-height: 32px;">Mark Invoiced ➔</button>` : ""}
              ${fin.computedStatus === "invoiced" ? `<button class="ghost-button" data-job-mark-active="${job.id}" type="button" style="font-size: 12px; padding: 0 12px; min-height: 32px;">↩ Back to Active</button>` : ""}
              ${fin.remainingBalance > 0 ? `
                <button class="primary-button" data-job-record-payment="${job.id}" type="button" style="font-size: 12px; padding: 0 14px; min-height: 32px;">
                  ${fin.totalPaid > 0 ? "+ Add Payment 💵" : "Record Payment 💵"}
                </button>
              ` : `
                <span style="font-size: 12px; color: var(--green); font-weight: 600;">✓ Fully Paid</span>
                <button class="ghost-button" data-job-reopen="${job.id}" type="button" style="font-size: 11px; padding: 0 8px; min-height: 28px;">Reopen</button>
              `}
            </div>
          </div>

          <!-- Collapsible Worklog, Expenses & Payments Details Drawer -->
          ${isExpanded ? `
            <div class="job-drawer">
              ${fin.type === "daily_rate" ? `
                <div class="job-subpanel">
                  <div class="job-subpanel-header">
                    <h5 class="job-subpanel-title">🗓️ Days / Shifts Worked (${days.length} entries &bull; ${fin.totalDays} total units)</h5>
                    <button class="ghost-button" data-job-log-day="${job.id}" type="button" style="font-size: 11px; padding: 0 8px; min-height: 26px;">+ Log Day</button>
                  </div>
                  ${days.length === 0 ? `<div class="job-empty-hint">No days logged yet. Click '+ Log Day' to record your shifts.</div>` : `
                    <table class="job-sub-table">
                      <thead>
                        <tr>
                          <th style="cursor: pointer; user-select: none;" data-job-sort-days="${job.id}" title="Click to toggle chronological sort">
                            Date ${jobDaysSortDirection === "desc" ? "▼ (Newest)" : "▲ (Oldest)"}
                          </th>
                          <th>Units</th>
                          <th>Note</th>
                          <th style="text-align: right;">Gross</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${days.map((d, dIdx) => `
                          <tr>
                            <td>
                              <strong>${escapeHtml(DateUtils.formatDisplayDate(d.date) || d.date || "—")}</strong>
                              ${d.date ? `<small style="color: var(--muted); display: block; font-size: 10px;">${escapeHtml(d.date)}</small>` : ""}
                            </td>
                            <td><strong>${Number(d.units) || 1}</strong></td>
                            <td style="color: var(--muted);">${escapeHtml(d.note || "—")}</td>
                            <td style="text-align: right; font-variant-numeric: tabular-nums;">
                              ${escapeHtml(formatJobCurrency((Number(job.dailyRate) || 0) * (Number(d.units) || 1), fin.currency))}
                            </td>
                            <td style="text-align: right;">
                              <button class="delete-button" data-job-del-day="${job.id}" data-day-id="${d.id || ""}" data-day-index="${dIdx}" type="button" style="font-size: 11px; padding: 2px 6px;" title="Delete day entry">&times;</button>
                            </td>
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                  `}
                </div>
              ` : ""}

              <div class="job-subpanel">
                <div class="job-subpanel-header">
                  <h5 class="job-subpanel-title">🧾 Job Expenses (${expenses.length} entries)</h5>
                  <button class="ghost-button" data-job-add-expense="${job.id}" type="button" style="font-size: 11px; padding: 0 8px; min-height: 26px;">+ Add Expense</button>
                </div>
                ${expenses.length === 0 ? `<div class="job-empty-hint">No expenses logged for this job.</div>` : `
                  <table class="job-sub-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Billing</th>
                        <th style="text-align: right;">Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${expenses.map((e, eIdx) => `
                        <tr>
                          <td>
                            <strong>${escapeHtml(DateUtils.formatDisplayDate(e.date) || e.date || "—")}</strong>
                            ${e.date ? `<small style="color: var(--muted); display: block; font-size: 10px;">${escapeHtml(e.date)}</small>` : ""}
                          </td>
                          <td>
                            <strong>${escapeHtml(e.title)}</strong>
                            ${e.receiptNote ? `<br><small style="color: var(--muted);">${escapeHtml(e.receiptNote)}</small>` : ""}
                          </td>
                          <td>
                            ${e.isReimbursable !== false
                              ? `<span class="badge-billable">Billable</span>`
                              : `<span class="badge-deductible">Deductible</span>`}
                          </td>
                          <td style="text-align: right; font-variant-numeric: tabular-nums; font-weight: 700;">
                            ${escapeHtml(formatJobCurrency(e.amount, fin.currency))}
                          </td>
                          <td style="text-align: right;">
                            <button class="delete-button" data-job-del-expense="${job.id}" data-expense-id="${e.id || ""}" data-expense-index="${eIdx}" type="button" style="font-size: 11px; padding: 2px 6px;" title="Delete expense">&times;</button>
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                `}
              </div>

              <!-- Payments Received Subpanel -->
              <div class="job-subpanel">
                <div class="job-subpanel-header">
                  <h5 class="job-subpanel-title">💳 Payments Received (${payments.length} installment${payments.length === 1 ? "" : "s"} &bull; Total: ${escapeHtml(formatJobCurrency(fin.totalPaid, fin.currency))})</h5>
                  ${fin.remainingBalance > 0 ? `
                    <button class="ghost-button" data-job-record-payment="${job.id}" type="button" style="font-size: 11px; padding: 0 8px; min-height: 26px;">+ Record Payment</button>
                  ` : ""}
                </div>
                ${payments.length === 0 ? `<div class="job-empty-hint">No payments recorded yet.</div>` : `
                  <table class="job-sub-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Account</th>
                        <th>Note</th>
                        <th style="text-align: right;">Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${payments.map((p, pIdx) => `
                        <tr>
                          <td>
                            <strong>${escapeHtml(DateUtils.formatDisplayDate(p.date) || p.date || "—")}</strong>
                            ${p.date ? `<small style="color: var(--muted); display: block; font-size: 10px;">${escapeHtml(p.date)}</small>` : ""}
                          </td>
                          <td><strong>${escapeHtml(p.account ? (accountBalances[p.account]?.name || p.account.toUpperCase()) : "Cash")}</strong></td>
                          <td style="color: var(--muted);">${escapeHtml(p.paymentNote || p.note || "—")}</td>
                          <td style="text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--green);">
                            ${escapeHtml(formatJobCurrency(p.amount, fin.currency))}
                          </td>
                          <td style="text-align: right;">
                            <button class="delete-button" data-job-del-payment="${job.id}" data-payment-id="${p.id || ""}" data-payment-index="${pIdx}" type="button" style="font-size: 11px; padding: 2px 6px;" title="Delete this payment">&times;</button>
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                `}
              </div>
            </div>
          ` : ""}
        </article>
      `;
    })
    .join("");
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

let currentActiveView = "dashboard";
const dirtyViews = new Set(["dashboard", "deficits", "cashflow", "history", "accounts", "storage", "jobs", "rates"]);

function renderView(viewId) {
  switch (viewId) {
    case "dashboard":
      renderDashboard();
      renderCategoryCaps();
      renderSavingsGoals();
      break;
    case "deficits":
      renderDeficits(getDeficitSummary());
      break;
    case "cashflow":
      renderSalarySchedule();
      renderEntries();
      renderInstallments();
      renderCashflowSummary();
      break;
    case "history":
      renderHistory();
      break;
    case "accounts":
      renderAccounts();
      break;
    case "storage":
      renderStorage();
      break;
    case "jobs":
      renderJobs();
      break;
    case "rates":
      renderRates();
      break;
    default:
      break;
  }
  dirtyViews.delete(viewId);
}

function renderAll() {
  // Always update core Dashboard summaries so metrics and alerts remain synchronized
  renderDashboard();
  renderCategoryCaps();
  renderSavingsGoals();
  dirtyViews.delete("dashboard");

  // Mark other views as dirty
  ["deficits", "cashflow", "history", "accounts", "storage", "jobs", "rates"].forEach((v) => dirtyViews.add(v));

  // If the user is on an active non-dashboard view, render that view immediately
  if (currentActiveView && currentActiveView !== "dashboard") {
    renderView(currentActiveView);
  }
}

function activateView(viewId) {
  currentActiveView = viewId;
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  const targetButton = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  const titleEl = document.getElementById("viewTitle");
  if (titleEl) titleEl.textContent = targetButton ? targetButton.textContent : "Dashboard";

  // Lazily render view if marked dirty
  if (dirtyViews.has(viewId) || viewId === "deficits") {
    renderView(viewId);
  }
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

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function syncRecurringFields(autoSyncDayOfWeek = false) {
  const form = document.getElementById("entryForm");
  if (!form) return;

  const isRecurring = Boolean(form.elements.recurring && form.elements.recurring.checked);
  const optionsEl = document.getElementById("recurringOptions");
  if (optionsEl) optionsEl.classList.toggle("is-hidden", !isRecurring);

  if (!isRecurring) return;

  const freq = form.elements.recurringFrequency ? form.elements.recurringFrequency.value : "monthly";
  const dowField = document.getElementById("recurringDayOfWeekField");
  const countLabel = document.getElementById("recurringCountLabelText");
  const summaryEl = document.getElementById("recurringSummaryNote");

  const isWeeklyOrBi = freq === "weekly" || freq === "biweekly";
  if (dowField) dowField.classList.toggle("is-hidden", !isWeeklyOrBi);

  if (autoSyncDayOfWeek && form.elements.date && form.elements.date.value && form.elements.recurringDayOfWeek) {
    const [y, m, d] = form.elements.date.value.split("-").map(Number);
    if (y && m && d) {
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      form.elements.recurringDayOfWeek.value = String(dow);
    }
  }

  const countVal = Number(form.elements.months.value) || 1;

  if (countLabel) {
    if (freq === "weekly") {
      countLabel.textContent = "Number of weeks";
    } else if (freq === "biweekly") {
      countLabel.textContent = "Number of occurrences (every 2 weeks)";
    } else {
      countLabel.textContent = "Number of months";
    }
  }

  if (summaryEl) {
    const dateVal = form.elements.date ? form.elements.date.value : "";
    if (!dateVal) {
      summaryEl.textContent = "";
      return;
    }
    const [y, m, d] = dateVal.split("-").map(Number);
    const dateUtc = new Date(Date.UTC(y, m - 1, d));
    const baseDow = dateUtc.getUTCDay();

    if (freq === "weekly" || freq === "biweekly") {
      const targetDow = Number(form.elements.recurringDayOfWeek ? form.elements.recurringDayOfWeek.value : baseDow);
      const diffDays = (targetDow - baseDow + 7) % 7;
      const firstDateUtc = new Date(dateUtc);
      firstDateUtc.setUTCDate(firstDateUtc.getUTCDate() + diffDays);
      const firstDateStr = DateUtils.formatDate(firstDateUtc.getUTCFullYear(), firstDateUtc.getUTCMonth() + 1, firstDateUtc.getUTCDate());
      const dayName = WEEKDAY_NAMES[targetDow] || "Friday";
      const scheduleText = freq === "biweekly" ? `every 2 weeks on ${dayName}` : `weekly on ${dayName}`;
      summaryEl.textContent = `Generates ${countVal} entries (${scheduleText}), starting ${DateUtils.formatDisplayDate(firstDateStr)}.`;
    } else {
      summaryEl.textContent = `Generates ${countVal} monthly entries on the ${d}${getOrdinalSuffix(d)} of each month, starting ${DateUtils.formatDisplayDate(dateVal)}.`;
    }
  }
}

function syncEntryFormMode() {
  const form = document.getElementById("entryForm");
  if (!form) return;
  const creditType = (form.elements.creditType.value || "").trim().toLowerCase();
  const catVal = (form.elements.category.value || "").trim().toLowerCase();
  const isCardExpense = creditType === "cib_card" || creditType === "hsbc_card" ||
    ((creditType === "cib" || creditType === "hsbc") && !catVal.includes("credit due") && catVal !== "");
  const isCreditDue = (creditType === "cib" || creditType === "hsbc") && !isCardExpense;

  const catField = document.getElementById("categoryField");
  if (catField) catField.classList.toggle("is-hidden", isCreditDue);

  const typeField = document.getElementById("typeField");
  if (typeField) typeField.classList.toggle("is-hidden", isCreditDue || isCardExpense);

  const recField = document.getElementById("recurringField");
  if (recField) recField.classList.toggle("is-hidden", isCreditDue || isCardExpense);

  const settlementField = document.getElementById("creditSettlementField");
  if (settlementField) settlementField.classList.toggle("is-hidden", !isCardExpense);

  const hintEl = document.getElementById("creditSettlementHint");

  if (isCardExpense) {
    form.elements.type.value = "expense";
    if (form.elements.recurring) form.elements.recurring.checked = false;

    const purchaseDate = form.elements.date.value || DateUtils.todayString();
    const settlementInput = form.elements.creditSettlementDate;
    if (settlementInput) {
      if (!settlementInput.value || settlementInput.dataset.autoGenerated === "true") {
        settlementInput.value = calculateCreditSettlementDate(purchaseDate, creditType);
        settlementInput.dataset.autoGenerated = "true";
      }
    }
    if (hintEl) {
      hintEl.textContent = getCreditCycleHint(purchaseDate, creditType);
    }
    if (form.elements.account && (!form.elements.account.value || form.elements.account.value.toLowerCase() === "cash")) {
      form.elements.account.value = creditType.includes("hsbc") ? "HSBC Credit" : "CIB Credit";
    }
  } else {
    if (hintEl) hintEl.textContent = "";
  }

  if (isCreditDue) {
    form.elements.type.value = "expense";
    if (!form.elements.category.value || !form.elements.category.value.toLowerCase().includes("credit due")) {
      form.elements.category.value = `${creditType === "cib" ? "CIB" : "HSBC"} Credit Due`;
    }
    if (form.elements.recurring) form.elements.recurring.checked = false;
    if (form.elements.account && (!form.elements.account.value || form.elements.account.value.toLowerCase() === "cash")) {
      form.elements.account.value = creditType === "cib" ? "cib" : "hsbc";
    }
    if (form.elements.tag && !form.elements.tag.value) {
      form.elements.tag.value = "Credit";
    }
  }

  const recalcContainer = document.getElementById("recalcCreditDueContainer");
  if (recalcContainer) {
    const isSettlement = editingEntry && ((editingEntry.id && editingEntry.id.startsWith("credit-settlement-")) || editingEntry.isCreditSettlement || isCreditDue);
    recalcContainer.style.display = isSettlement ? "block" : "none";
  }

  syncRecurringFields();
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
  const todayStr = DateUtils.todayString();
  form.elements.date.value = todayStr;
  form.elements.type.value = type;
  form.elements.currency.value = "EGP";
  form.elements.months.value = 12;
  if (form.elements.recurringFrequency) form.elements.recurringFrequency.value = "monthly";
  if (form.elements.recurring) form.elements.recurring.checked = false;
  if (form.elements.recurringDayOfWeek) {
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const todayDow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay();
    form.elements.recurringDayOfWeek.value = String(todayDow);
  }
  form.elements.actualAmount.value = "";
  updateCurrencyConversionNote();

  if (entry) {
    const actDate = getEntryActualDate(entry);
    form.elements.date.value = actDate || entry.date || form.elements.date.value;
    form.elements.category.value = entry.category || "";
    if (form.elements.tag) form.elements.tag.value = entry.tag || "";
    form.elements.account.value = entry.account || "";
    form.elements.type.value = entry.type || type;
    form.elements.amount.value = entry.amount || "";
    const isSettlement = (entry.id && entry.id.startsWith("credit-settlement-")) || entry.isCreditSettlement;
    if (isSettlement) {
      const parts = (entry.id || "").split("-");
      const accKey = entry.creditType || parts[2] || (entry.account || "").toLowerCase();
      form.elements.creditType.value = accKey.includes("hsbc") ? "hsbc" : "cib";
      form.elements.category.value = entry.category || `${form.elements.creditType.value.toUpperCase()} Credit Due`;
    } else {
      form.elements.creditType.value = entry.creditType || "";
    }
    if (form.elements.creditSettlementDate) {
      form.elements.creditSettlementDate.value = entry.creditSettlementDate || "";
      form.elements.creditSettlementDate.dataset.autoGenerated = entry.creditSettlementDate ? "false" : "true";
    }
    form.elements.actualAmount.value = getEntryActualAmount(entry) || "";
    if (form.elements.recurring) form.elements.recurring.checked = false;
    form.elements.months.value = entry.months || 12;
    updateSubcategorySuggestions(entry.category || "");

    const recalcStatus = document.getElementById("recalcCreditDueStatus");
    if (recalcStatus) {
      recalcStatus.textContent = "";
      recalcStatus.className = "recalc-credit-status";
    }
  } else {
    delete form.dataset.clearedOverride;
    const recalcStatus = document.getElementById("recalcCreditDueStatus");
    if (recalcStatus) {
      recalcStatus.textContent = "";
      recalcStatus.className = "recalc-credit-status";
    }
    if (form.elements.tag) form.elements.tag.value = "";
    if (form.elements.creditSettlementDate) {
      form.elements.creditSettlementDate.value = "";
      form.elements.creditSettlementDate.dataset.autoGenerated = "true";
    }
    updateSubcategorySuggestions(type === "expense" ? "Home" : "");
    tryAutoFillEntryTag(form);
  }

  syncEntryFormMode();
  syncRecurringFields(false);
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
  const catVal = (form.elements.category.value || "").trim().toLowerCase();
  const isCardExpense = creditType === "cib_card" || creditType === "hsbc_card" ||
    ((creditType === "cib" || creditType === "hsbc") && !catVal.includes("credit due") && catVal !== "");
  const isCreditDue = (creditType === "cib" || creditType === "hsbc") && !isCardExpense;
  const isExpense = form.elements.type.value === "expense";

  let creditSettlementDate = "";
  if (isCardExpense) {
    creditSettlementDate = form.elements.creditSettlementDate ? form.elements.creditSettlementDate.value : "";
    if (!creditSettlementDate) {
      creditSettlementDate = calculateCreditSettlementDate(form.elements.date.value, creditType);
    }
  }

  if (isCreditDue) {
    if (!form.elements.category.value || !form.elements.category.value.toLowerCase().includes("credit due")) {
      form.elements.category.value = `${creditType === "cib" ? "CIB" : "HSBC"} Credit Due`;
    }
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
  let chosenAccount = form.elements.account.value.trim() || "cash";
  if (isCardExpense && (!chosenAccount || chosenAccount.toLowerCase() === "cash")) {
    chosenAccount = creditType.includes("hsbc") ? "HSBC Credit" : "CIB Credit";
  }
  const entryCat = form.elements.category.value.trim();
  const entryType = form.elements.type.value || "expense";

  if (editingEntry) {
    const idx = cashEntries.findIndex((entry) => getEntryId(entry) === getEntryId(editingEntry));
    const prevSource = idx !== -1 ? cashEntries[idx].source : editingEntry.source;
    const isLoanCat = form.elements.category.value.trim().toLowerCase().includes("loan");
    const updatedEntry = {
      ...(idx !== -1 ? cashEntries[idx] : editingEntry),
      id: idx !== -1 ? (cashEntries[idx].id || generateId()) : (editingEntry.id || generateId()),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      tag: (form.elements.tag?.value || "").trim(),
      account: chosenAccount,
      type: form.elements.type.value,
      amount: plannedAmountInEgp,
      creditType: form.elements.creditType.value || "",
      creditSettlementDate: isCardExpense ? creditSettlementDate : "",
      source: isCardExpense ? "credit card" : (prevSource || (isLoanCat ? "loan" : form.elements.type.value === "expense" ? "expense" : "income"))
    };

    if (idx !== -1) {
      cashEntries[idx] = updatedEntry;
      if (actualAmountInEgp > 0) {
        setEntryActualAmount(updatedEntry, actualAmountInEgp);
        setEntryActualDate(updatedEntry, form.elements.date.value);
        if (isLoanInflow(updatedEntry)) {
          if (!Array.isArray(updatedEntry.draws) || updatedEntry.draws.length === 0) {
            updatedEntry.draws = [{ date: form.elements.date.value || DateUtils.todayString(), amount: actualAmountInEgp }];
          } else if (deltaActualAmount > 0) {
            updatedEntry.draws.push({ date: form.elements.date.value || DateUtils.todayString(), amount: deltaActualAmount });
          }
        } else {
          if (!Array.isArray(updatedEntry.draws) || updatedEntry.draws.length <= 1) {
            updatedEntry.draws = [{
              date: form.elements.date.value || DateUtils.todayString(),
              amount: actualAmountInEgp,
              tag: updatedEntry.tag || "",
              account: chosenAccount
            }];
          }
        }
      } else {
        delete entryActuals[getEntryId(editingEntry)];
        delete entryActualDates[getEntryId(editingEntry)];
        updatedEntry.draws = [];
      }
    } else {
      const originalId = getEntryId(editingEntry);
      if (originalId.startsWith("credit-settlement-")) {
        const parts = originalId.split("-");
        const accountKey = parts[2];
        const monthKey = `${parts[3]}-${parts[4]}`;

        if (form.dataset.clearedOverride === "true") {
          delete creditSettlementOverrides[originalId];
          delete form.dataset.clearedOverride;
        } else {
          if (!creditSettlementOverrides[originalId]) {
            creditSettlementOverrides[originalId] = {};
          }
          creditSettlementOverrides[originalId].date = form.elements.date.value;
          creditSettlementOverrides[originalId].amount = plannedAmountInEgp;
        }
        saveSetting(keys.creditSettlementOverrides, creditSettlementOverrides);

        if (deletedForecasts && deletedForecasts.includes(originalId)) {
          deletedForecasts = deletedForecasts.filter((id) => id !== originalId);
          saveSetting(keys.deletedForecasts, deletedForecasts);
        }

        // Clean up any legacy manual lump entries for this month/account if present so they don't double count
        const lumpIdx = cashEntries.findIndex((e) => isLumpCreditDueForAccount(e, accountKey) && DateUtils.getMonthKey(e.date) === monthKey && !getEntryId(e).startsWith("credit-settlement-"));
        if (lumpIdx !== -1) {
          cashEntries.splice(lumpIdx, 1);
          saveSetting(keys.entries, cashEntries);
        }

        if (actualAmountInEgp > 0) {
          setEntryActualAmount(editingEntry, actualAmountInEgp);
          setEntryActualDate(editingEntry, form.elements.date.value);
        } else {
          delete entryActuals[originalId];
          delete entryActualDates[originalId];
          saveSetting(keys.entryActuals, entryActuals);
          saveSetting(keys.entryActualDates, entryActualDates);
        }
      } else {
        const archIdx = archivedEntries.findIndex((e) => getEntryId(e) === originalId);
        if (archIdx !== -1) {
          if (Array.isArray(updatedEntry.draws) && updatedEntry.draws.length <= 1 && actualAmountInEgp > 0) {
            updatedEntry.draws = [{
              date: form.elements.date.value || DateUtils.todayString(),
              amount: actualAmountInEgp,
              tag: updatedEntry.tag || "",
              account: chosenAccount
            }];
          }
          archivedEntries[archIdx] = updatedEntry;
          saveSetting(keys.archivedEntries, archivedEntries);
        } else {
          if (Array.isArray(updatedEntry.draws) && updatedEntry.draws.length <= 1 && actualAmountInEgp > 0) {
            updatedEntry.draws = [{
              date: form.elements.date.value || DateUtils.todayString(),
              amount: actualAmountInEgp,
              tag: updatedEntry.tag || "",
              account: chosenAccount
            }];
          }
          cashEntries.push(updatedEntry);
          saveSetting(keys.entries, cashEntries);
        }

        if (actualAmountInEgp > 0) {
          setEntryActualAmount(updatedEntry, actualAmountInEgp);
          setEntryActualDate(updatedEntry, form.elements.date.value);
        } else {
          delete entryActuals[originalId];
          delete entryActualDates[originalId];
          saveSetting(keys.entryActuals, entryActuals);
          saveSetting(keys.entryActualDates, entryActualDates);
        }
      }
    }
  } else {
    const isLoanCat = form.elements.category.value.trim().toLowerCase().includes("loan");
    const baseEntry = {
      id: generateId(),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      tag: (form.elements.tag?.value || "").trim(),
      account: chosenAccount,
      type: form.elements.type.value,
      amount: plannedAmountInEgp,
      creditType: form.elements.creditType.value || "",
      creditSettlementDate: isCardExpense ? creditSettlementDate : "",
      source: isCardExpense ? "credit card" : isLoanCat ? "loan" : form.elements.type.value === "expense" ? "expense" : "income"
    };

    const isRecurring = Boolean(form.elements.recurring && form.elements.recurring.checked);
    const frequency = isRecurring && form.elements.recurringFrequency ? form.elements.recurringFrequency.value : "monthly";
    const dayOfWeek = isRecurring && form.elements.recurringDayOfWeek ? form.elements.recurringDayOfWeek.value : null;
    const count = isRecurring ? Math.max(1, Number(form.elements.months.value) || 1) : 1;

    const entriesToAdd = isRecurring
      ? buildRecurringEntries(baseEntry, { frequency, count, dayOfWeek })
      : [baseEntry];

    cashEntries.push(...entriesToAdd);

    if (actualAmountInEgp > 0) {
      setEntryActualAmount(entriesToAdd[0], actualAmountInEgp);
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

function handleRecalculateCreditDueFromHistory() {
  if (!editingEntry) return;
  const form = document.getElementById("entryForm");
  if (!form) return;

  const id = getEntryId(editingEntry);
  let accountKey = "cib";
  let monthKey = DateUtils.currentYearMonth();

  if (id.startsWith("credit-settlement-")) {
    const parts = id.split("-");
    accountKey = parts[2] || "cib";
    monthKey = `${parts[3]}-${parts[4]}`;
  } else {
    accountKey = (form.elements.creditType.value || editingEntry.creditType || editingEntry.account || "cib").toLowerCase();
    accountKey = accountKey.includes("hsbc") ? "hsbc" : "cib";
    const curDate = form.elements.date.value || editingEntry.date || DateUtils.todayString();
    monthKey = DateUtils.getMonthKey(curDate);
  }

  const allExpenses = [
    ...(cashEntries || []),
    ...(archivedEntries || [])
  ].filter((entry) => entry && entry.type === "expense");

  const matchingCardExpenses = allExpenses.filter(
    (e) => isCardExpenseForAccount(e, accountKey) && getCreditSettlementMonth(e) === monthKey
  );

  const cardSpendTotal = matchingCardExpenses.reduce((sum, e) => {
    const act = getEntryActualAmount(e);
    return sum + (act > 0 ? act : Number(e.amount || 0));
  }, 0);

  const monthData = (creditDues && (creditDues[accountKey] || creditDues[accountKey.toUpperCase()])) || {};
  const baseDue = Number(monthData[monthKey] || 0);

  const manualLumpEntries = allExpenses.filter(
    (entry) => isLumpCreditDueForAccount(entry, accountKey) && DateUtils.getMonthKey(entry.date) === monthKey && !getEntryId(entry).startsWith("credit-settlement-")
  );
  const lumpAmount = manualLumpEntries.reduce((sum, e) => {
    const act = getEntryActualAmount(e);
    return sum + (act > 0 ? act : Number(e.amount || 0));
  }, 0);

  const calculatedTotal = baseDue + lumpAmount + cardSpendTotal;

  // Calculate default maturity date for this month
  const [year, month] = DateUtils.parseYearMonth(monthKey);
  const lastDay = DateUtils.getLastDayOfMonth(year, month);
  const matchingKey = Object.keys(accountBalances || {}).find((k) => k.toLowerCase() === accountKey) || accountKey;
  const acc = (accountBalances && accountBalances[matchingKey]) || {
    maturityDay: accountKey === "cib" ? 15 : lastDay
  };
  const maturityDay = Number(acc.maturityDay) || (accountKey === "cib" ? 15 : lastDay);
  const defaultDate = DateUtils.formatDate(year, month, Math.min(maturityDay, lastDay));

  form.elements.amount.value = calculatedTotal;
  form.elements.actualAmount.value = "";
  delete form.dataset.clearedOverride;

  const statusEl = document.getElementById("recalcCreditDueStatus");
  if (statusEl) {
    const curDateStr = form.elements.date.value;
    const dateNotice = curDateStr ? ` (settlement date preserved: ${DateUtils.formatDisplayDate(curDateStr)})` : "";
    statusEl.innerHTML = `<span class="recalc-status-success">✓ Recalculated planned amount: <strong>${money(cardSpendTotal)}</strong> card spend (${matchingCardExpenses.length} transaction${matchingCardExpenses.length === 1 ? "" : "s"})${baseDue > 0 ? ` + ${money(baseDue)} base due` : ""}${dateNotice}. Click "Update entry" to save.</span>`;
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
    source: "loan",
    tag: "Loan"
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
      source: "loan",
      tag: "Loan"
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

function promptExactAmountDecision(entry, actualAmount, plannedAmount) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("exactAmountDecisionDialog");
    if (!dialog) {
      resolve("finish");
      return;
    }

    const titleEl = document.getElementById("exactAmountDecisionTitle");
    const msgEl = document.getElementById("exactAmountDecisionMessage");
    const subtitleEl = document.getElementById("exactAmountDecisionSubtitle");
    const detailsEl = document.getElementById("exactAmountDecisionDetails");
    const keepBtn = document.getElementById("exactAmountKeepBtn");
    const finishBtn = document.getElementById("exactAmountFinishBtn");

    const isIncome = entry.type === "income";
    const isLoan = isLoanInflow(entry);
    const itemName = entry.category || (isIncome ? "Income" : "Expense");
    const verb = isLoan ? "drawn" : isIncome ? "received" : "spent";

    if (titleEl) {
      titleEl.innerHTML = isLoan ? "💳 Full Loan Facility Drawn" : isIncome ? "💰 Full Income Received" : "✓ Full Budget Reached";
    }

    if (msgEl) {
      msgEl.innerHTML = `You recorded ${verb} of <strong>${money(actualAmount)}</strong> (100% of planned <strong>${money(plannedAmount)}</strong>) for <em>${escapeHtml(itemName)}</em>.`;
    }

    if (subtitleEl) {
      subtitleEl.textContent = isLoan
        ? "Choose whether to finish and close this loan facility, or keep it open in your Cash Flow to log further draws."
        : isIncome
        ? "Choose whether to finish and complete this income (move to History), or keep it ongoing in Cash Flow."
        : "Choose whether to finish and complete this expense budget (move to History), or keep it ongoing in Cash Flow to log more spends.";
    }

    if (detailsEl) {
      detailsEl.innerHTML = `
        <div style="background: var(--bg-alt, #f6f8fa); padding: 12px; border-radius: 8px; border: 1px solid var(--line); font-size: 13px; margin: 10px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: var(--muted)">Planned Amount:</span>
            <strong>${money(plannedAmount)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: var(--green);">
            <span>Total ${isLoan ? "Drawn" : isIncome ? "Received" : "Spent"}:</span>
            <strong>${money(actualAmount)}</strong>
          </div>
        </div>
      `;
    }

    if (keepBtn) {
      keepBtn.textContent = isLoan ? "Keep Loan Open" : "Keep Ongoing in Cash Flow";
    }
    if (finishBtn) {
      finishBtn.textContent = isLoan ? "Finish & Close Facility" : "Finish & Fulfill";
    }

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      if (keepBtn) keepBtn.removeEventListener("click", handleKeep);
      if (finishBtn) finishBtn.removeEventListener("click", handleFinish);
    };

    const handleKeep = () => {
      if (settled) return;
      settled = true;
      cleanup();
      dialog.close("keep");
      resolve("keep");
    };

    const handleFinish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      dialog.close("finish");
      resolve("finish");
    };

    const handleCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve("finish");
    };

    const handleClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve("finish");
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    if (keepBtn) keepBtn.addEventListener("click", handleKeep);
    if (finishBtn) finishBtn.addEventListener("click", handleFinish);

    dialog.showModal();
  });
}

const CURRENT_APP_VERSION = "v43";
let isAppUpdateAvailable = false;

function updateAppUpdateStatus(hasUpdate, customText) {
  isAppUpdateAvailable = !!hasUpdate;
  const statusEl = document.getElementById("appUpdateStatus");
  if (!statusEl) return;
  if (hasUpdate) {
    statusEl.className = "sync-pill update-ready";
    statusEl.textContent = customText || "Update ready";
    statusEl.title = "A newer version of the app is available. Click Refresh to apply.";
  } else {
    statusEl.className = "sync-pill synced";
    statusEl.textContent = customText || "Latest";
    statusEl.title = "App is running the latest version.";
  }
}

async function checkForAppVersionUpdate() {
  if (!navigator.onLine) {
    updateAppUpdateStatus(false, "Offline");
    return;
  }
  try {
    // 1. Check if ServiceWorker has a waiting worker
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        if (reg.waiting) {
          updateAppUpdateStatus(true, "Update ready");
          return;
        }
        reg.update().catch(() => {});
      }
    }

    // 2. Fetch sw.js with cache: "no-store" and extract CACHE_NAME version
    const res = await fetch("./sw.js?check=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/CACHE_NAME\s*=\s*["']budget-control-(.+?)["']/);
      if (match && match[1]) {
        const remoteVersion = match[1];
        if (remoteVersion !== CURRENT_APP_VERSION) {
          console.info(`[AppUpdate] New version detected: ${remoteVersion} (current: ${CURRENT_APP_VERSION})`);
          updateAppUpdateStatus(true, "Update ready");
          return;
        }
      }
    }
    updateAppUpdateStatus(false, "Latest");
  } catch (err) {
    console.debug("[AppUpdate] Version check:", err);
  }
}

async function executeAppRefresh() {
  const btns = [
    document.getElementById("refreshAppBtn"),
    document.getElementById("refreshAppDialogBtn")
  ].filter(Boolean);

  btns.forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = `Updating… 🔄`;
  });

  try {
    // 1. Tell all waiting or active service workers to skip waiting
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        if (reg.waiting) {
          reg.waiting.postMessage({ action: "skipWaiting" });
        }
        if (reg.active) {
          reg.active.postMessage({ action: "skipWaiting" });
        }
      }
    }

    // 2. Purge all Service Worker CacheStorage
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    // 3. Trigger active Service Worker update
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.update().catch(() => {})));
    }
  } catch (err) {
    console.warn("Cache purge error during Refresh App:", err);
  }

  // 4. Force hard reload bypassing cache with cache-busting timestamp
  const targetUrl = new URL(window.location.href);
  targetUrl.searchParams.set("reload", Date.now().toString());
  window.location.replace(targetUrl.toString());
}

window.executeAppRefresh = executeAppRefresh;

function setupEventListeners() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activateView(button.dataset.view);
      if (isMobileLayout()) {
        setMobileDrawer(false);
      }
    });
  });

  on("sidebarBackdrop", "click", () => {
    setMobileDrawer(false);
  });

  on("themeToggle", "click", toggleTheme);
  on("sidebarCollapseBtn", "click", () => {
    if (isMobileLayout()) {
      setMobileDrawer(false);
    } else {
      toggleSidebar();
    }
  });
  on("sidebarExpandBtn", "click", toggleSidebar);

  // Cashflow collapsible panels
  on("salaryStructureToggle", "click", (e) => {
    if (e.target.closest("#addSalaryPayment")) return;
    salaryStructureCollapsed = !salaryStructureCollapsed;
    saveSetting(keys.salaryStructureCollapsed, salaryStructureCollapsed);
    const panel = document.getElementById("salaryStructurePanel");
    if (panel) panel.classList.toggle("is-collapsed", salaryStructureCollapsed);
  });

  on("installmentsToggle", "click", (e) => {
    if (e.target.closest("#addInstallment")) return;
    installmentsCollapsed = !installmentsCollapsed;
    saveSetting(keys.installmentsCollapsed, installmentsCollapsed);
    const panel = document.getElementById("installmentsPanel");
    if (panel) panel.classList.toggle("is-collapsed", installmentsCollapsed);
  });

  on("expenseMixToggle", "click", () => {
    expenseMixCollapsed = !expenseMixCollapsed;
    saveSetting(keys.expenseMixCollapsed, expenseMixCollapsed);
    const panel = document.getElementById("expenseMixPanel");
    if (panel) panel.classList.toggle("is-collapsed", expenseMixCollapsed);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("mobile-sidebar-open")) {
      setMobileDrawer(false);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      toggleSidebar();
    }
  });

  on("exportCSV", "click", exportToCSV);

  on("openDataToolsBtn", "click", () => {
    const dlg = document.getElementById("dataToolsDialog");
    if (dlg) dlg.showModal();
  });

  // Forecast Line Chart Controls
  document.querySelectorAll(".forecast-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setForecastLineRange(btn.dataset.months);
    });
  });

  on("forecastRangeSlider", "input", (e) => {
    setForecastLineRange(e.target.value);
  });

  on("forecastModeEntries", "click", () => {
    setForecastLineMode("entries");
  });

  on("forecastModeMonthly", "click", () => {
    setForecastLineMode("monthly");
  });

  // "Can I Spend X?" Simulator Event Listeners
  on("forecastSimRunBtn", "click", () => {
    runSpendSimulator();
  });

  on("forecastSimClearBtn", "click", () => {
    clearSpendSimulator();
  });

  on("forecastSimAmount", "keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSpendSimulator();
    }
  });

  const simDateInput = document.getElementById("forecastSimDate");
  if (simDateInput && !simDateInput.value) {
    simDateInput.value = DateUtils.todayString();
    simDateInput.min = DateUtils.todayString();
  }

  // Re-render forecast line chart on window resize with debounce
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!currentActiveView || currentActiveView === "dashboard") {
        renderForecastLineChart();
      }
    }, 150);
  });

  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) {
      const targetId = closeBtn.dataset.close;
      const dlg = document.getElementById(targetId);
      if (dlg) dlg.close();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      return;
    }

    const active = document.activeElement;
    const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable);
    if (isInput) return;

    if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      openEntryDialog("expense");
    } else if (e.key === "i" || e.key === "I") {
      e.preventDefault();
      openEntryDialog("income");
    } else if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      openLoanBridgeDialog();
    } else if (e.key === "/") {
      e.preventDefault();
      if (currentActiveView === "history") {
        const s = document.getElementById("historySearch");
        if (s) s.focus();
      } else {
        const s = document.getElementById("searchEntries") || document.getElementById("cfSearch");
        if (s) s.focus();
      }
    }
  });

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
        irqJobs,
        partTimeJobs,
        ratesData,
        creditDues,
        creditDueMonths,
        entryActuals,
        entryActualDates,
        deletedForecasts,
        creditSettlementOverrides,
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

  on("refreshAppBtn", "click", executeAppRefresh);
  on("refreshAppDialogBtn", "click", executeAppRefresh);
  on("autoTagBtn", "click", () => {
    autoTagUntaggedEntries({ notify: true });
  });

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
      partTimeJobs: clone(partTimeJobs),
      ratesData: clone(ratesData),
      creditDues: clone(creditDues),
      creditDueMonths: clone(creditDueMonths),
      entryActuals: clone(entryActuals),
      entryActualDates: clone(entryActualDates),
      deletedForecasts: clone(deletedForecasts),
      creditSettlementOverrides: clone(creditSettlementOverrides),
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
    partTimeJobs = [];
    ratesData = clone(defaultRates);
    categoryCaps = clone(defaultCategoryCaps);
    savingsGoals = clone(defaultSavingsGoals);
    creditDues = {};
    creditDueMonths = {};
    creditSettlementOverrides = {};
    entryActuals = {};
    entryActualDates = {};
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
    saveSetting(keys.partTimeJobs, partTimeJobs);
    saveSetting(keys.rates, ratesData);
    saveSetting(keys.categoryCaps, categoryCaps);
    saveSetting(keys.savingsGoals, savingsGoals);
    saveSetting(keys.creditDues, creditDues);
    saveSetting(keys.creditDueMonths, creditDueMonths);
    saveSetting(keys.creditSettlementOverrides, creditSettlementOverrides);
    saveSetting(keys.entryActuals, entryActuals);
    saveSetting(keys.entryActualDates, entryActualDates);
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
    partTimeJobs = backup.partTimeJobs || [];
    ratesData = backup.ratesData || defaultRates;
    categoryCaps = backup.categoryCaps || defaultCategoryCaps;
    savingsGoals = backup.savingsGoals || defaultSavingsGoals;
    creditDues = backup.creditDues || {};
    creditDueMonths = backup.creditDueMonths || {};
    creditSettlementOverrides = backup.creditSettlementOverrides || {};
    entryActuals = backup.entryActuals || {};
    entryActualDates = backup.entryActualDates || {};
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
    saveSetting(keys.partTimeJobs, partTimeJobs);
    saveSetting(keys.rates, ratesData);
    saveSetting(keys.categoryCaps, categoryCaps);
    saveSetting(keys.savingsGoals, savingsGoals);
    saveSetting(keys.creditDues, creditDues);
    saveSetting(keys.creditDueMonths, creditDueMonths);
    saveSetting(keys.creditSettlementOverrides, creditSettlementOverrides);
    saveSetting(keys.entryActuals, entryActuals);
    saveSetting(keys.entryActualDates, entryActualDates);
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
          if (target && typeof target.blur === "function") {
            target.blur();
          }
          submitBtn.click();
        }
      }
    });
  });

  const entryForm = document.getElementById("entryForm");
  if (entryForm) {
    if (entryForm.elements && entryForm.elements.category) {
      entryForm.elements.category.addEventListener("input", (e) => {
        updateSubcategorySuggestions(e.target.value);
        tryAutoFillEntryTag(entryForm);
      });
      entryForm.elements.category.addEventListener("change", (e) => {
        updateSubcategorySuggestions(e.target.value);
        tryAutoFillEntryTag(entryForm);
      });
    }
    if (entryForm.elements && entryForm.elements.creditType) {
      entryForm.elements.creditType.addEventListener("change", () => {
        syncEntryFormMode();
        tryAutoFillEntryTag(entryForm);
      });
    }
    if (entryForm.elements && entryForm.elements.recurring) {
      entryForm.elements.recurring.addEventListener("change", () => syncRecurringFields(false));
    }
    if (entryForm.elements && entryForm.elements.recurringFrequency) {
      entryForm.elements.recurringFrequency.addEventListener("change", () => syncRecurringFields(false));
    }
    if (entryForm.elements && entryForm.elements.recurringDayOfWeek) {
      entryForm.elements.recurringDayOfWeek.addEventListener("change", () => syncRecurringFields(false));
    }
    if (entryForm.elements && entryForm.elements.months) {
      entryForm.elements.months.addEventListener("input", () => syncRecurringFields(false));
    }
    if (entryForm.elements && entryForm.elements.date) {
      entryForm.elements.date.addEventListener("change", () => {
        syncRecurringFields(false);
        const cType = (entryForm.elements.creditType?.value || "").toLowerCase();
        if (cType === "cib_card" || cType === "hsbc_card") {
          const sInput = entryForm.elements.creditSettlementDate;
          if (sInput && (sInput.dataset.autoGenerated === "true" || !sInput.value)) {
            sInput.value = calculateCreditSettlementDate(entryForm.elements.date.value, cType);
            sInput.dataset.autoGenerated = "true";
          }
          const hintEl = document.getElementById("creditSettlementHint");
          if (hintEl) hintEl.textContent = getCreditCycleHint(entryForm.elements.date.value, cType);
        }
      });
    }
    if (entryForm.elements && entryForm.elements.creditSettlementDate) {
      entryForm.elements.creditSettlementDate.addEventListener("input", () => {
        entryForm.elements.creditSettlementDate.dataset.autoGenerated = "false";
      });
    }
    on("entryCurrencySelect", "change", updateCurrencyConversionNote);
    on("entryAmountInput", "input", updateCurrencyConversionNote);
    const recalcBtn = document.getElementById("recalcCreditDueBtn");
    if (recalcBtn) {
      recalcBtn.addEventListener("click", handleRecalculateCreditDueFromHistory);
    }
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
  on("deficitOverdueList", "click", async (event) => {
    const button = event.target.closest("[data-settle-id]");
    if (!button) return;
    const entryId = button.dataset.settleId;
    const amount = Number(button.dataset.settleAmount || 0);

    const entry = findEntryById(entryId);
    if (!entry || amount <= 0) return;

    const previousActual = getEntryActualAmount(entry);
    const newActual = previousActual + amount;
    setEntryActualAmount(entry, newActual);

    // Record dated transaction tranche (spend or draw)
    const adjustmentResult = await promptAccountAdjustment(
      entry.type || "expense",
      amount,
      entry.account || "cash",
      entry.category || "",
      entry.tag || ""
    );

    const trancheTag = (adjustmentResult && adjustmentResult.tag) ? adjustmentResult.tag : (entry.tag || "");
    const trancheAccount = (adjustmentResult && adjustmentResult.accountId) ? adjustmentResult.accountId : (entry.account || "cash");

    if (trancheTag && !entry.tag) {
      entry.tag = trancheTag;
    }

    if (!Array.isArray(entry.draws)) {
      entry.draws = previousActual > 0
        ? [{ date: entry.actualDate || entry.date || DateUtils.todayString(), amount: previousActual, tag: entry.tag || "", account: entry.account || "cash" }]
        : [];
    } else if (entry.draws.length === 1 && previousActual > 0 && Math.round(entry.draws[0].amount || 0) !== previousActual) {
      entry.draws[0].amount = previousActual;
    }
    entry.draws.push({
      date: DateUtils.todayString(),
      amount: amount,
      tag: trancheTag,
      account: trancheAccount
    });
    setEntryActualDate(entry, DateUtils.todayString());
    saveSetting(keys.entries, cashEntries);

    if (adjustmentResult && adjustmentResult.accountId) {
      adjustAccountBalance(adjustmentResult.accountId, amount, entry.type || "expense");
    }
    renderAll();

    if (isLoanInflow(entry)) {
      await handleLoanRepaymentAdjustmentPrompt(entry, newActual);
    }

    const plannedAmount = Number(entry.amount || 0);
    if (newActual >= plannedAmount && plannedAmount > 0 && !entry.isClosed) {
      entry.isClosed = true;
      saveSetting(keys.entries, cashEntries);
      renderAll();
    }
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

      const actualSpentOrDrawn = getEntryActualAmount(entry);
      const remainingAmount = getRemainingForecastAmount(entry);
      const itemName = entry.category || (entry.type === "income" ? "Income" : "Expense");
      const isLoan = isLoanInflow(entry);

      const confirmTitle = isLoan ? "Finish & Close Loan" : "Finish & Close Expense";
      const promptBody = isLoan
        ? `Do you want to finalize "${itemName}"?\n\n• Amount Drawn: ${money(actualSpentOrDrawn)}\n• Undrawn Remaining (${money(remainingAmount)}) will be closed and removed from forecast.\n• Linked repayment will be finalized to match ${money(actualSpentOrDrawn)}.`
        : `Do you want to finalize "${itemName}"?\n\n• Amount Spent to Date: ${money(actualSpentOrDrawn)}\n• Remaining Budget (${money(remainingAmount)}) will be closed and removed from future forecast.`;

      const confirmed = await confirmAction(
        confirmTitle,
        promptBody,
        "Finish"
      );
      if (!confirmed) return;

      entry.isClosed = true;
      entry.amount = actualSpentOrDrawn;
      saveSetting(keys.entries, cashEntries);

      // Finalize linked repayment if it's a loan
      if (isLoan) {
        const linked = findLinkedLoanRepayment(entry);
        if (linked) {
          const isSingle = linked.type === "single";
          const repTarget = linked.target;
          const months = Number(repTarget.months || 1);
          const baselineTotal = Number(repTarget.initialAmount || repTarget.plannedAmount || (isSingle ? repTarget.amount : repTarget.amount * months) || actualSpentOrDrawn);
          const originalLoan = Number(entry.initialAmount || entry.amount || actualSpentOrDrawn) || 1;
          const markup = Math.max(1, baselineTotal / originalLoan);
          const scaledTotal = Math.round(actualSpentOrDrawn * markup);
          const scaledAmount = isSingle ? scaledTotal : Math.max(1, Math.round(scaledTotal / months));

          if (isSingle) {
            repTarget.amount = scaledAmount;
            saveSetting(keys.entries, cashEntries);
          } else {
            repTarget.amount = scaledAmount;
            saveSetting(keys.installments, installments);
          }
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

      if (deleteKey.startsWith("credit-settlement-")) {
        const parts = deleteKey.split("-");
        const accountKey = parts[2];
        const monthKey = `${parts[3]}-${parts[4]}`;
        const prevLen = cashEntries.length;
        cashEntries = cashEntries.filter((e) => !(isLumpCreditDueForAccount(e, accountKey) && DateUtils.getMonthKey(e.date) === monthKey));
        if (cashEntries.length !== prevLen) {
          saveSetting(keys.entries, cashEntries);
        }
        if (creditSettlementOverrides && creditSettlementOverrides[deleteKey]) {
          delete creditSettlementOverrides[deleteKey];
          saveSetting(keys.creditSettlementOverrides, creditSettlementOverrides);
        }
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

  // --- Part-Time Jobs Event Listeners ---
  const updateJobFormCurrencyIndicators = () => {
    const sel = document.getElementById("jobCurrencySelect");
    if (!sel) return;
    const curr = sel.value;
    document.querySelectorAll(".job-currency-indicator").forEach((el) => {
      el.textContent = curr;
    });
  };

  const updateJobFormRateFields = () => {
    const sel = document.getElementById("jobTypeSelect");
    const dailyWrap = document.getElementById("jobDailyRateWrap");
    const lumpWrap = document.getElementById("jobLumpSumWrap");
    if (!sel || !dailyWrap || !lumpWrap) return;
    if (sel.value === "daily_rate") {
      dailyWrap.classList.remove("is-hidden");
      lumpWrap.classList.add("is-hidden");
    } else {
      dailyWrap.classList.add("is-hidden");
      lumpWrap.classList.remove("is-hidden");
    }
  };

  on("jobCurrencySelect", "change", updateJobFormCurrencyIndicators);
  on("jobTypeSelect", "change", updateJobFormRateFields);

  const updateJobDayUnitPreset = () => {
    const sel = document.getElementById("jobDayUnitPreset");
    const customWrap = document.getElementById("jobDayUnitsCustomWrap");
    if (!sel || !customWrap) return;
    if (sel.value === "custom") {
      customWrap.classList.remove("is-hidden");
    } else {
      customWrap.classList.add("is-hidden");
    }
  };
  on("jobDayUnitPreset", "change", updateJobDayUnitPreset);

  // Filter pills
  document.querySelectorAll("[data-job-filter]").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("[data-job-filter]").forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      activeJobFilter = pill.dataset.jobFilter;
      renderJobs();
    });
  });

  on("jobCurrencyFilter", "change", (e) => {
    activeJobCurrencyFilter = e.target.value;
    renderJobs();
  });

  on("jobSortFilter", "change", (e) => {
    activeJobSort = e.target.value;
    renderJobs();
  });

  // Open New Job Dialog
  on("addNewJobBtn", "click", () => {
    const form = document.getElementById("jobForm");
    const dlg = document.getElementById("jobDialog");
    if (!form || !dlg) return;
    form.reset();
    form.elements.jobId.value = "";
    if (form.elements.startDate) form.elements.startDate.value = new Date().toISOString().slice(0, 10);
    if (form.elements.endDate) form.elements.endDate.value = "";
    document.getElementById("jobDialogTitle").textContent = "Add Part-Time Job";
    updateJobFormCurrencyIndicators();
    updateJobFormRateFields();
    dlg.showModal();
  });

  // Save Job Dialog Form Submit
  on("jobForm", "submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dlg = document.getElementById("jobDialog");

    const id = form.elements.jobId.value;
    const title = form.elements.title.value.trim();
    const client = form.elements.client.value.trim();
    const currency = form.elements.currency.value;
    const type = form.elements.type.value;
    const startDate = form.elements.startDate ? form.elements.startDate.value : "";
    const endDate = form.elements.endDate ? form.elements.endDate.value : "";
    const dailyRate = Number(form.elements.dailyRate.value) || 0;
    const lumpSumAmount = Number(form.elements.lumpSumAmount.value) || 0;
    const status = form.elements.status.value;
    const notes = form.elements.notes.value.trim();

    if (!title || !client) return;

    if (id) {
      const idx = partTimeJobs.findIndex((j) => j.id === id);
      if (idx !== -1) {
        partTimeJobs[idx] = {
          ...partTimeJobs[idx],
          title,
          client,
          currency,
          type,
          startDate,
          endDate,
          dailyRate,
          lumpSumAmount,
          status,
          notes
        };
        if (status === "invoiced" && !partTimeJobs[idx].invoiceDate) {
          partTimeJobs[idx].invoiceDate = new Date().toISOString().slice(0, 10);
        }
        if (status === "paid" && !partTimeJobs[idx].paidDate) {
          partTimeJobs[idx].paidDate = new Date().toISOString().slice(0, 10);
        }
      }
    } else {
      const newJobId = generateId();
      partTimeJobs.unshift({
        id: newJobId,
        title,
        client,
        currency,
        type,
        startDate,
        endDate,
        dailyRate,
        lumpSumAmount,
        daysWorked: [],
        expenses: [],
        payments: [],
        status,
        invoiceDate: status === "invoiced" ? new Date().toISOString().slice(0, 10) : "",
        paidDate: status === "paid" ? new Date().toISOString().slice(0, 10) : null,
        settlementAccount: "cib",
        actualPaidAmount: null,
        notes
      });
      expandedJobIds.add(newJobId);
    }

    saveSetting(keys.partTimeJobs, partTimeJobs);
    renderJobs();
    if (dlg) dlg.close();
  });

  // Save Day Worked Dialog Form Submit
  on("jobLogDayForm", "submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dlg = document.getElementById("jobLogDayDialog");

    const jobId = form.elements.jobId.value;
    const job = partTimeJobs.find((j) => j.id === jobId);
    if (!job) return;

    const date = form.elements.date.value;
    const preset = form.elements.unitPreset.value;
    const units = preset === "custom" ? (Number(form.elements.units.value) || 1) : Number(preset);
    const note = form.elements.note.value.trim();

    if (!Array.isArray(job.daysWorked)) job.daysWorked = [];
    job.daysWorked.push({ id: generateId(), date, units, note });
    job.daysWorked.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    expandedJobIds.add(job.id);
    saveSetting(keys.partTimeJobs, partTimeJobs);
    renderJobs();
    if (dlg) dlg.close();
  });

  // Save Expense Dialog Form Submit
  on("jobExpenseForm", "submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dlg = document.getElementById("jobExpenseDialog");

    const jobId = form.elements.jobId.value;
    const job = partTimeJobs.find((j) => j.id === jobId);
    if (!job) return;

    const date = form.elements.date.value;
    const title = form.elements.title.value.trim();
    const amount = Number(form.elements.amount.value) || 0;
    const isReimbursable = form.elements.isReimbursable.checked;
    const receiptNote = form.elements.receiptNote.value.trim();

    if (!Array.isArray(job.expenses)) job.expenses = [];
    job.expenses.push({
      id: generateId(),
      date,
      title,
      amount,
      isReimbursable,
      receiptNote
    });
    job.expenses.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    expandedJobIds.add(job.id);
    saveSetting(keys.partTimeJobs, partTimeJobs);
    renderJobs();
    if (dlg) dlg.close();
  });

  // Save Payment Settlement Dialog Form Submit
  on("jobPaymentForm", "submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dlg = document.getElementById("jobPaymentDialog");

    const jobId = form.elements.jobId.value;
    const job = partTimeJobs.find((j) => j.id === jobId);
    if (!job) return;

    const paidDate = form.elements.paidDate.value;
    const actualPaidAmount = Number(form.elements.actualPaidAmount.value) || 0;
    if (actualPaidAmount <= 0) return;
    const settlementAccount = form.elements.settlementAccount.value;
    const syncToBudget = form.elements.syncToBudget.checked;
    const paymentNote = form.elements.paymentNote.value.trim();

    if (!Array.isArray(job.payments)) job.payments = [];
    job.payments.push({
      id: generateId(),
      date: paidDate,
      amount: actualPaidAmount,
      account: settlementAccount,
      paymentNote
    });
    job.paidDate = paidDate;

    // Recalculate status
    const updatedFin = calculateJobFinancials(job);
    if (updatedFin.remainingBalance <= 0) {
      job.status = "paid";
    } else {
      job.status = "partial";
    }

    if (syncToBudget) {
      const fxRate = getCurrencyRate(job.currency);
      const egpVal = Math.round(actualPaidAmount * fxRate);
      const newEntryId = generateId();
      const newEntry = {
        id: newEntryId,
        date: paidDate,
        category: "Part-Time Job",
        account: settlementAccount || "cash",
        type: "income",
        amount: egpVal,
        source: "part-time job",
        creditType: "",
        tag: "Part-Time"
      };
      cashEntries.push(newEntry);
      entryActuals[newEntryId] = egpVal;
      entryActualDates[newEntryId] = paidDate;

      if (settlementAccount && accountBalances[settlementAccount]) {
        accountBalances[settlementAccount].balance = (Number(accountBalances[settlementAccount].balance) || 0) + egpVal;
        saveSetting(keys.accounts, accountBalances);
      }

      saveSetting(keys.entries, cashEntries);
      saveSetting(keys.entryActuals, entryActuals);
      saveSetting(keys.entryActualDates, entryActualDates);
      renderAll();
    }

    expandedJobIds.add(job.id);
    saveSetting(keys.partTimeJobs, partTimeJobs);
    renderJobs();
    if (dlg) dlg.close();
  });

  // Jobs Stream Delegated Actions
  on("jobsList", "click", async (event) => {
    // 1. Toggle Breakdown
    const toggleBtn = event.target.closest("[data-job-toggle-details]");
    if (toggleBtn) {
      const id = toggleBtn.dataset.jobToggleDetails;
      if (expandedJobIds.has(id)) {
        expandedJobIds.delete(id);
      } else {
        expandedJobIds.add(id);
      }
      renderJobs();
      return;
    }

    // 1b. Toggle Days Sort Direction
    const sortDaysBtn = event.target.closest("[data-job-sort-days]");
    if (sortDaysBtn) {
      jobDaysSortDirection = jobDaysSortDirection === "asc" ? "desc" : "asc";
      renderJobs();
      return;
    }

    // 2. Quick Log Day
    const logDayBtn = event.target.closest("[data-job-log-day]");
    if (logDayBtn) {
      const id = logDayBtn.dataset.jobLogDay;
      const job = partTimeJobs.find((j) => j.id === id);
      if (!job) return;
      const dlg = document.getElementById("jobLogDayDialog");
      const form = document.getElementById("jobLogDayForm");
      if (form && dlg) {
        form.reset();
        form.elements.jobId.value = id;
        form.elements.date.value = new Date().toISOString().slice(0, 10);
        updateJobDayUnitPreset();
        dlg.showModal();
      }
      return;
    }

    // 3. Quick Add Expense
    const addExpBtn = event.target.closest("[data-job-add-expense]");
    if (addExpBtn) {
      const id = addExpBtn.dataset.jobAddExpense;
      const job = partTimeJobs.find((j) => j.id === id);
      if (!job) return;
      const dlg = document.getElementById("jobExpenseDialog");
      const form = document.getElementById("jobExpenseForm");
      if (form && dlg) {
        form.reset();
        form.elements.jobId.value = id;
        form.elements.date.value = new Date().toISOString().slice(0, 10);
        document.querySelectorAll(".job-expense-currency-indicator").forEach((el) => {
          el.textContent = job.currency || "USD";
        });
        dlg.showModal();
      }
      return;
    }

    // 3b. Copy Bill Summary to Clipboard
    const copyBtn = event.target.closest("[data-job-copy-invoice]");
    if (copyBtn) {
      const id = copyBtn.dataset.jobCopyInvoice;
      const job = partTimeJobs.find((j) => j.id === id);
      if (!job) return;
      const fin = calculateJobFinancials(job);
      const expenses = Array.isArray(job.expenses) ? job.expenses : [];
      const billableExp = expenses.filter((e) => e.isReimbursable !== false);

      const laborDetail = fin.type === "daily_rate"
        ? `${fin.totalDays} day${fin.totalDays === 1 ? "" : "s"} @ ${formatJobCurrency(job.dailyRate, fin.currency)}/day`
        : "Fixed Lump Sum Project";

      const summaryLines = [
        `INVOICE / BILLING BREAKDOWN`,
        `Client: ${job.client}`,
        `Project: ${job.title}`,
        job.startDate ? `Period: ${job.startDate}${job.endDate ? ` to ${job.endDate}` : " (Ongoing)"}` : "",
        `----------------------------------------`,
        `• Accumulated Labor Income: ${formatJobCurrency(fin.grossFee, fin.currency)} (${laborDetail})`,
        `• Accumulated Client Expenses: ${formatJobCurrency(fin.billableExpenses, fin.currency)} (${billableExp.length} billable receipt${billableExp.length === 1 ? "" : "s"})`,
        `----------------------------------------`,
        `TOTAL TO CHARGE CLIENT: ${formatJobCurrency(fin.totalInvoice, fin.currency)} (≈ ${money(fin.totalInvoiceEgp)})`,
        `Payments Collected: ${formatJobCurrency(fin.totalPaid, fin.currency)}`,
        `REMAINING BALANCE DUE: ${formatJobCurrency(fin.remainingBalance, fin.currency)} (≈ ${money(fin.remainingBalanceEgp)})`
      ].filter(Boolean).join("\n");

      try {
        await navigator.clipboard.writeText(summaryLines);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "✓ Copied!";
        copyBtn.classList.add("text-green");
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.classList.remove("text-green");
        }, 2000);
      } catch {
        alert(summaryLines);
      }
      return;
    }

    // 4. Mark Invoiced
    const invoiceBtn = event.target.closest("[data-job-mark-invoiced]");
    if (invoiceBtn) {
      const id = invoiceBtn.dataset.jobMarkInvoiced;
      const job = partTimeJobs.find((j) => j.id === id);
      if (job) {
        job.status = "invoiced";
        job.invoiceDate = new Date().toISOString().slice(0, 10);
        saveSetting(keys.partTimeJobs, partTimeJobs);
        renderJobs();
      }
      return;
    }

    // 4b. Revert to Active
    const markActiveBtn = event.target.closest("[data-job-mark-active]");
    if (markActiveBtn) {
      const id = markActiveBtn.dataset.jobMarkActive;
      const job = partTimeJobs.find((j) => j.id === id);
      if (job) {
        job.status = "active";
        saveSetting(keys.partTimeJobs, partTimeJobs);
        renderJobs();
      }
      return;
    }

    // 5. Record Payment
    const payBtn = event.target.closest("[data-job-record-payment]");
    if (payBtn) {
      const id = payBtn.dataset.jobRecordPayment;
      const job = partTimeJobs.find((j) => j.id === id);
      if (!job) return;
      const fin = calculateJobFinancials(job);
      const dlg = document.getElementById("jobPaymentDialog");
      const form = document.getElementById("jobPaymentForm");
      if (dlg && form) {
        form.reset();
        form.elements.jobId.value = id;
        form.elements.paidDate.value = new Date().toISOString().slice(0, 10);
        form.elements.actualPaidAmount.value = fin.remainingBalance > 0 ? fin.remainingBalance : fin.totalInvoice;

        const elInvoiced = document.getElementById("jobPayTotalInvoiced");
        if (elInvoiced) elInvoiced.textContent = formatJobCurrency(fin.totalInvoice, fin.currency);
        const elAlreadyPaid = document.getElementById("jobPayAlreadyPaid");
        if (elAlreadyPaid) elAlreadyPaid.textContent = formatJobCurrency(fin.totalPaid, fin.currency);
        const elRemaining = document.getElementById("jobPayRemainingDue");
        if (elRemaining) elRemaining.textContent = formatJobCurrency(fin.remainingBalance, fin.currency);
        const elEgp = document.getElementById("jobPayEgpApprox");
        if (elEgp) elEgp.textContent = money(fin.remainingBalanceEgp);

        document.querySelectorAll(".job-pay-currency-indicator").forEach((el) => {
          el.textContent = fin.currency;
        });

        const acctSel = document.getElementById("jobPayAccountSelect");
        if (acctSel) {
          const acctKeys = Object.keys(accountBalances);
          acctSel.innerHTML = acctKeys
            .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(accountBalances[k].name || k.toUpperCase())}</option>`)
            .join("");
          if (!acctKeys.includes("cash")) {
            acctSel.innerHTML += `<option value="cash">Cash</option>`;
          }
        }
        dlg.showModal();
      }
      return;
    }

    // 6. Reopen Job
    const reopenBtn = event.target.closest("[data-job-reopen]");
    if (reopenBtn) {
      const id = reopenBtn.dataset.jobReopen;
      const job = partTimeJobs.find((j) => j.id === id);
      if (job) {
        job.status = "active";
        saveSetting(keys.partTimeJobs, partTimeJobs);
        renderJobs();
      }
      return;
    }

    // 7. Edit Job
    const editBtn = event.target.closest("[data-job-edit]");
    if (editBtn) {
      const id = editBtn.dataset.jobEdit;
      const job = partTimeJobs.find((j) => j.id === id);
      if (!job) return;
      const dlg = document.getElementById("jobDialog");
      const form = document.getElementById("jobForm");
      if (dlg && form) {
        form.reset();
        form.elements.jobId.value = job.id;
        form.elements.title.value = job.title;
        form.elements.client.value = job.client;
        if (form.elements.startDate) form.elements.startDate.value = job.startDate || "";
        if (form.elements.endDate) form.elements.endDate.value = job.endDate || "";
        form.elements.currency.value = job.currency || "USD";
        form.elements.type.value = job.type || "daily_rate";
        form.elements.dailyRate.value = job.dailyRate || "";
        form.elements.lumpSumAmount.value = job.lumpSumAmount || "";
        form.elements.status.value = job.status || "active";
        form.elements.notes.value = job.notes || "";
        document.getElementById("jobDialogTitle").textContent = "Edit Job / Project";
        updateJobFormCurrencyIndicators();
        updateJobFormRateFields();
        dlg.showModal();
      }
      return;
    }

    // 8. Delete Job
    const delJobBtn = event.target.closest("[data-job-delete]");
    if (delJobBtn) {
      const id = delJobBtn.dataset.jobDelete;
      const idx = partTimeJobs.findIndex((j) => j.id === id);
      if (idx === -1) return;
      const confirmed = await confirmAction(
        "Delete Job",
        `Are you sure you want to delete "${partTimeJobs[idx].title}"? All logged days and expenses will be removed.`
      );
      if (!confirmed) return;
      partTimeJobs.splice(idx, 1);
      expandedJobIds.delete(id);
      saveSetting(keys.partTimeJobs, partTimeJobs);
      renderJobs();
      return;
    }

    // 9. Delete Logged Day
    const delDayBtn = event.target.closest("[data-job-del-day]");
    if (delDayBtn) {
      const jobId = delDayBtn.dataset.jobDelDay;
      const dayId = delDayBtn.dataset.dayId;
      const dayIdx = Number(delDayBtn.dataset.dayIndex);
      const job = partTimeJobs.find((j) => j.id === jobId);
      if (job && Array.isArray(job.daysWorked)) {
        let idx = -1;
        if (dayId) idx = job.daysWorked.findIndex((d) => d.id === dayId);
        if (idx === -1 && !isNaN(dayIdx)) idx = dayIdx;
        if (idx !== -1 && job.daysWorked[idx]) {
          job.daysWorked.splice(idx, 1);
          saveSetting(keys.partTimeJobs, partTimeJobs);
          renderJobs();
        }
      }
      return;
    }

    // 10. Delete Logged Expense
    const delExpBtn = event.target.closest("[data-job-del-expense]");
    if (delExpBtn) {
      const jobId = delExpBtn.dataset.jobDelExpense;
      const expId = delExpBtn.dataset.expenseId;
      const expIdx = Number(delExpBtn.dataset.expenseIndex);
      const job = partTimeJobs.find((j) => j.id === jobId);
      if (job && Array.isArray(job.expenses)) {
        let idx = -1;
        if (expId) idx = job.expenses.findIndex((e) => e.id === expId);
        if (idx === -1 && !isNaN(expIdx)) idx = expIdx;
        if (idx !== -1 && job.expenses[idx]) {
          job.expenses.splice(idx, 1);
          saveSetting(keys.partTimeJobs, partTimeJobs);
          renderJobs();
        }
      }
      return;
    }

    // 11. Delete Logged Payment
    const delPayBtn = event.target.closest("[data-job-del-payment]");
    if (delPayBtn) {
      const jobId = delPayBtn.dataset.jobDelPayment;
      const payId = delPayBtn.dataset.paymentId;
      const payIdx = Number(delPayBtn.dataset.paymentIndex);
      const job = partTimeJobs.find((j) => j.id === jobId);
      if (job && Array.isArray(job.payments)) {
        let idx = -1;
        if (payId) idx = job.payments.findIndex((p) => p.id === payId);
        if (idx === -1 && !isNaN(payIdx)) idx = payIdx;
        if (idx !== -1 && job.payments[idx]) {
          const p = job.payments[idx];
          const confirmed = await confirmAction(
            "Delete Payment",
            `Remove this payment installment of ${formatJobCurrency(p.amount, job.currency)}?`
          );
          if (!confirmed) return;
          job.payments.splice(idx, 1);
          const updatedFin = calculateJobFinancials(job);
          job.status = updatedFin.computedStatus;
          saveSetting(keys.partTimeJobs, partTimeJobs);
          renderJobs();
        }
      }
      return;
    }
  });

  // Change Job Status directly from card dropdown selector
  on("jobsList", "change", (event) => {
    const statusSelect = event.target.closest("[data-job-status-select]");
    if (statusSelect) {
      const id = statusSelect.dataset.jobStatusSelect;
      const job = partTimeJobs.find((j) => j.id === id);
      if (job) {
        const nextStatus = statusSelect.value;
        job.status = nextStatus;
        if (nextStatus === "invoiced" && !job.invoiceDate) {
          job.invoiceDate = new Date().toISOString().slice(0, 10);
        }
        if (nextStatus === "paid" && !job.paidDate) {
          job.paidDate = new Date().toISOString().slice(0, 10);
        }
        saveSetting(keys.partTimeJobs, partTimeJobs);
        renderJobs();
      }
    }
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
  on("historyTagFilter", "change", () => renderHistory());
  on("historySearch", "input", debounce(renderHistory, 180));
  on("historyFiltersReset", "click", () => {
    const monthEl = document.getElementById("historyMonthFilter");
    if (monthEl) monthEl.value = "all";
    const typeEl = document.getElementById("historyTypeFilter");
    if (typeEl) typeEl.value = "all";
    const accEl = document.getElementById("historyAccountFilter");
    if (accEl) accEl.value = "all";
    const tagEl = document.getElementById("historyTagFilter");
    if (tagEl) tagEl.value = "all";
    const searchEl = document.getElementById("historySearch");
    if (searchEl) searchEl.value = "";
    renderHistory();
  });

  // Click on any subcategory tag pill to instantly filter history by that tag
  document.addEventListener("click", (event) => {
    const pill = event.target.closest("[data-tag-filter-click]");
    if (pill) {
      const tag = pill.getAttribute("data-tag-filter-click");
      const tagFilter = document.getElementById("historyTagFilter");
      if (tagFilter && tag) {
        event.preventDefault();
        event.stopPropagation();
        tagFilter.value = tag;
        renderHistory();
        tagFilter.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  });

  // History admin lock toggle
  on("historyAdminToggleBtn", "click", () => {
    historyAdminUnlocked = !historyAdminUnlocked;
    saveSetting(keys.historyAdminUnlocked, historyAdminUnlocked);
    renderHistory();
  });

  // History collapsible analytics panel & view toggles
  on("historyAnalyticsToggle", "click", (e) => {
    if (e.target.closest(".history-view-tabs") || e.target.closest(".history-groupby-tabs")) return;
    historyAnalyticsCollapsed = !historyAnalyticsCollapsed;
    saveSetting(keys.historyAnalyticsCollapsed, historyAnalyticsCollapsed);
    const panel = document.getElementById("historyAnalyticsPanel");
    if (panel) panel.classList.toggle("is-collapsed", historyAnalyticsCollapsed);
  });

  on("historyGroupByCategory", "click", (e) => {
    e.stopPropagation();
    setHistoryAnalyticsGrouping("category");
  });

  on("historyGroupByTag", "click", (e) => {
    e.stopPropagation();
    setHistoryAnalyticsGrouping("tag");
  });

  on("historyViewModeChart", "click", (e) => {
    e.stopPropagation();
    setHistoryAnalyticsView("chart");
  });

  on("historyViewModeTable", "click", (e) => {
    e.stopPropagation();
    setHistoryAnalyticsView("table");
  });

  on("historyViewModeBoth", "click", (e) => {
    e.stopPropagation();
    setHistoryAnalyticsView("both");
  });

  // History inline inputs (actual amount & subcategory tags)
  document.addEventListener("keydown", async (event) => {
    const input = event.target.closest("[data-history-entry-input]");
    if (input && event.key === "Enter") {
      event.preventDefault();
      await commitHistoryEntryActual(input);
      return;
    }
    const tagInput = event.target.closest("[data-history-tag-input]");
    if (tagInput && event.key === "Enter") {
      event.preventDefault();
      await commitHistoryEntryTag(tagInput);
      return;
    }
    const drawTagInput = event.target.closest("[data-draw-tag-input]");
    if (drawTagInput && event.key === "Enter") {
      event.preventDefault();
      await commitHistoryDrawTag(drawTagInput);
      return;
    }
    const drawDateInput = event.target.closest("[data-draw-date-input]");
    if (drawDateInput && event.key === "Enter") {
      event.preventDefault();
      await commitHistoryDrawDate(drawDateInput);
      return;
    }
  });

  document.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-history-entry-input]");
    if (input) {
      await commitHistoryEntryActual(input);
      return;
    }
    const tagInput = event.target.closest("[data-history-tag-input]");
    if (tagInput) {
      await commitHistoryEntryTag(tagInput);
      return;
    }
    const drawTagInput = event.target.closest("[data-draw-tag-input]");
    if (drawTagInput) {
      await commitHistoryDrawTag(drawTagInput);
      return;
    }
    const drawDateInput = event.target.closest("[data-draw-date-input]");
    if (drawDateInput) {
      await commitHistoryDrawDate(drawDateInput);
      return;
    }
  });

  // History action buttons & row click
  document.addEventListener("click", async (event) => {
    const editBtn = event.target.closest("[data-history-entry-edit]");
    if (editBtn) {
      event.stopPropagation();
      const entryId = editBtn.dataset.historyEntryEdit;
      const { entry } = findHistoryEntry(entryId);
      if (entry) {
        openEntryDialog(entry.type, entry);
      }
      return;
    }

    const delBtn = event.target.closest("[data-history-entry-delete]");
    if (delBtn) {
      event.stopPropagation();
      const entryId = delBtn.dataset.historyEntryDelete;
      if (entryId) {
        await deleteHistoryEntryCompletely(entryId);
      }
      return;
    }

    const clearBtn = event.target.closest("[data-history-entry-clear]");
    if (clearBtn) {
      event.stopPropagation();
      const entryId = clearBtn.dataset.historyEntryClear;
      if (entryId) {
        await clearHistoryEntryActual(entryId);
      }
      return;
    }

    const expandBtn = event.target.closest("[data-expand-draws]");
    if (expandBtn) {
      event.stopPropagation();
      const entryId = expandBtn.dataset.expandDraws;
      const subRow = document.getElementById(`subspends-${entryId}`);
      if (subRow) {
        const isHidden = subRow.classList.toggle("is-hidden");
        const count = expandBtn.dataset.count || "";
        expandBtn.innerHTML = isHidden ? `▾ ${count} subspends` : `▴ Hide subspends`;
        expandBtn.classList.toggle("active", !isHidden);
      }
      return;
    }

    const drawDelBtn = event.target.closest("[data-draw-delete-entry]");
    if (drawDelBtn) {
      event.stopPropagation();
      const entryId = drawDelBtn.dataset.drawDeleteEntry;
      const drawIndex = Number(drawDelBtn.dataset.drawDeleteIndex);
      await deleteHistoryEntryDraw(entryId, drawIndex);
      return;
    }

    if (historyAdminUnlocked) {
      const row = event.target.closest("tr[data-history-row-id]");
      if (row && !event.target.closest("input, button, select")) {
        const entryId = row.dataset.historyRowId;
        const { entry } = findHistoryEntry(entryId);
        if (entry) {
          openEntryDialog(entry.type, entry);
        }
      }
    }
  });

  setupGistSyncEventListeners();
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
      irqJobs,
      partTimeJobs,
      ratesData,
      creditDues,
      creditDueMonths,
      entryActuals,
      entryActualDates,
      deletedForecasts,
      creditSettlementOverrides,
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

function openGistSyncDialog() {
  setupGistSyncEventListeners();
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

  if (!dialog.open) {
    dialog.showModal();
  }
  if (token && gistId) {
    inspectGistData();
  }
}
window.openGistSyncDialog = openGistSyncDialog;

let gistSyncEventListenersAttached = false;
function setupGistSyncEventListeners() {
  if (gistSyncEventListenersAttached) return;
  gistSyncEventListenersAttached = true;

  on("gistSyncBtn", "click", openGistSyncDialog);

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
  setupGistSyncEventListeners();

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
    applySidebarState(sidebarCollapsed);
    materializeLegacySalaryEntries();
    healSingleDrawMismatches();
    autoTagUntaggedEntries({ notify: false });
    updateUndoResetVisibility();
    setupEventListeners();
    setupGistSyncEventListeners();
    renderAll();
    initGistSync();

    // Register PWA Service Worker when served via HTTP / HTTPS
    if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").then((reg) => {
          if (reg.waiting) {
            updateAppUpdateStatus(true, "Update ready");
          }
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  updateAppUpdateStatus(true, "Update ready");
                }
              });
            }
          });
        }).catch((err) => {
          console.warn("ServiceWorker registration failed:", err);
        });

        checkForAppVersionUpdate();
        window.addEventListener("focus", checkForAppVersionUpdate);
        window.addEventListener("online", checkForAppVersionUpdate);
      });
    } else {
      checkForAppVersionUpdate();
    }
  } catch (e) {
    console.error("Error during app initialization:", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
