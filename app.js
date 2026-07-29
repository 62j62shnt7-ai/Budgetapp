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
  const [startYear, startMonth, startDay] = DateUtils.parseDate(baseEntry.date);
  return Array.from({ length: months }, (_, index) => {
    const zeroBasedMonth = startMonth - 1 + index;
    const year = startYear + Math.floor(zeroBasedMonth / 12);
    const month = ((zeroBasedMonth % 12) + 12) % 12;
    const lastDay = DateUtils.getLastDayOfMonth(year, month + 1);
    const day = Math.min(startDay, lastDay);
    return {
      ...baseEntry,
      id: generateId(),
      date: DateUtils.formatDate(year, month + 1, day),
      source: `${baseEntry.source} monthly`
    };
  });
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
    return Number(rawValue);
  }
  if (entry && entry.actualAmount !== undefined && entry.actualAmount !== null && entry.actualAmount !== "") {
    return Number(entry.actualAmount);
  }
  return 0;
}

function setEntryActualAmount(entry, value) {
  const id = getEntryId(entry);
  entryActuals[id] = value === "" || value === null || value === undefined ? 0 : Number(value);
  saveSetting(keys.entryActuals, entryActuals);
}

function getRemainingForecastAmount(entry) {
  const actualAmount = getEntryActualAmount(entry);
  if (entry.type === "expense" && actualAmount > 0) {
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
    .filter((entry) => !entry.date || entry.date >= today)
    .filter((entry) => {
      if (entry.type === "expense") {
        const actualAmount = getEntryActualAmount(entry);
        if (actualAmount > 0) {
          return getRemainingForecastAmount(entry) > 0;
        }
      }
      return getEntryActualAmount(entry) <= 0;
    })
    .map((entry) => {
      if (entry.type === "expense" && getEntryActualAmount(entry) > 0) {
        return { ...entry, amount: getRemainingForecastAmount(entry) };
      }
      return entry;
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
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return DateUtils.getMonthKey(DateUtils.formatDate(nextMonth.getFullYear(), nextMonth.getMonth() + 1, nextMonth.getDate()));
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

  const cibCredit = getCreditDueAmount("cib");
  const hsbcCredit = getCreditDueAmount("hsbc");
  const totalCreditDue = cibCredit + hsbcCredit;
  const manualCreditExpenses = cashEntries.filter(
    (entry) => entry.type === "expense" && ["cib", "hsbc"].includes((entry.creditType || "").toLowerCase())
  );
  const manualCibCredit = manualCreditExpenses
    .filter((entry) => (entry.creditType || "").toLowerCase() === "cib")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const manualHsbcCredit = manualCreditExpenses
    .filter((entry) => (entry.creditType || "").toLowerCase() === "hsbc")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

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
  if (cibCreditEl) cibCreditEl.textContent = money(cibCredit + manualCibCredit);

  const hsbcCreditEl = document.getElementById("hsbcCreditDue");
  if (hsbcCreditEl) hsbcCreditEl.textContent = money(hsbcCredit + manualHsbcCredit);

  const storageTotalEl = document.getElementById("storageTotal");
  if (storageTotalEl) storageTotalEl.textContent = money(storageTotal);

  const forecastLowEl = document.getElementById("forecastLow");
  if (forecastLowEl) forecastLowEl.textContent = money(lowPoint.balance);

  const forecastLowDateEl = document.getElementById("forecastLowDate");
  if (forecastLowDateEl) forecastLowDateEl.textContent = `Lowest in ${escapeHtml(lowPoint.month)}`;

  const isNegative = forecast.some((item) => item.balance < 0);
  const cashflowStatusEl = document.getElementById("cashflowStatus");
  if (cashflowStatusEl) {
    cashflowStatusEl.textContent = isNegative ? "Risk" : "OK";
    cashflowStatusEl.classList.toggle("danger-text", isNegative);
  }

  const cashflowNoteEl = document.getElementById("cashflowStatusNote");
  if (cashflowNoteEl) {
    cashflowNoteEl.textContent = isNegative ? "Expenses exceed cash in forecast" : "Cash stays above zero";
  }

  renderBalanceChart(forecast);
  renderCategoryBreakdown(entries);
  renderExpenseMix(entries);
  renderWarnings(forecast);

  const deficitSummary = getDeficitSummary();
  renderDeficitBanner(deficitSummary);
  renderDeficits(deficitSummary);
}

function renderCategoryBreakdown(entries) {
  const container = document.getElementById("categoryBreakdownList");
  if (!container) return;

  const totals = entries
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

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => {
      const pct = Math.round((amount / totalExpense) * 100);
      return `
        <div class="list-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700;">
            <span>${escapeHtml(cat)}</span>
            <span>${escapeHtml(money(amount))} (${pct}%)</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${pct}%;"></div>
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
  const maxAbs = Math.max(...forecast.map((item) => Math.abs(item.balance)), 1);
  chart.innerHTML = forecast
    .map((item) => {
      const height = Math.max(6, Math.round((Math.abs(item.balance) / maxAbs) * 230));
      const label = DateUtils.getShortMonth(item.month);
      const tone = item.balance < 0 ? "negative" : "";
      return `<div class="bar-wrap" title="${escapeHtml(item.month)}: ${escapeHtml(money(item.balance))}"><div class="bar ${tone}" style="height:${height}px"></div><span>${escapeHtml(label)}</span></div>`;
    })
    .join("");

  const rangeEl = document.getElementById("forecastRange");
  if (rangeEl) {
    const range = forecast.length ? `${forecast[0].month} to ${forecast[forecast.length - 1].month}` : "No entries";
    rangeEl.textContent = range;
  }
}

function renderWarnings(forecast) {
  const riskyMonths = forecast.filter((item) => item.balance < 0);
  const list = document.getElementById("forecastWarnings");
  if (!list) return;

  if (!riskyMonths.length) {
    list.innerHTML = `<div class="list-row success-row"><span>Cashflow is covered</span><strong>No deficit</strong></div>`;
    return;
  }

  list.innerHTML = riskyMonths
    .slice(0, 5)
    .map((item) => `<div class="list-row danger-row"><span>${escapeHtml(item.month)}</span><strong>${escapeHtml(money(item.balance))}</strong></div>`)
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
  const today = DateUtils.todayString();
  const overdueItems = getForecastCandidateEntries()
    .filter((entry) => entry.date && entry.date < today)
    .map((entry) => {
      const isExpense = entry.type === "expense";
      const remaining = isExpense ? getRemainingForecastAmount(entry) : Number(entry.amount || 0);
      const settled = isExpense ? remaining <= 0 : getEntryActualAmount(entry) > 0;
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

  return { forecastMonths, overdueItems, actualMonths };
}

function renderDeficitBanner(summary) {
  const banner = document.getElementById("deficitBanner");
  if (!banner) return;
  const { forecastMonths, overdueItems, actualMonths } = summary;
  const hasAny = forecastMonths.length || overdueItems.length || actualMonths.length;

  if (!hasAny) {
    banner.hidden = true;
    return;
  }

  const parts = [];
  if (forecastMonths.length) parts.push(`${forecastMonths.length} month${forecastMonths.length === 1 ? "" : "s"} projected to go negative`);
  if (overdueItems.length) parts.push(`${overdueItems.length} item${overdueItems.length === 1 ? "" : "s"} overdue`);
  if (actualMonths.length) parts.push(`${actualMonths.length} past month${actualMonths.length === 1 ? "" : "s"} with an actual shortfall`);

  banner.hidden = false;
  const summaryEl = document.getElementById("deficitBannerSummary");
  if (summaryEl) summaryEl.textContent = parts.join(" · ");
}

function renderDeficits(summary) {
  const { forecastMonths, overdueItems, actualMonths } = summary;

  const fcEl = document.getElementById("deficitForecastCount");
  if (fcEl) fcEl.textContent = String(forecastMonths.length);

  const odEl = document.getElementById("deficitOverdueCount");
  if (odEl) odEl.textContent = String(overdueItems.length);

  const acEl = document.getElementById("deficitActualCount");
  if (acEl) acEl.textContent = String(actualMonths.length);

  const forecastList = document.getElementById("deficitForecastList");
  if (forecastList) {
    forecastList.innerHTML = forecastMonths.length
      ? forecastMonths
          .map(
            (item) => `
              <div class="list-row danger-row">
                <span>${escapeHtml(item.month)}</span>
                <strong>${escapeHtml(money(item.balance))}</strong>
              </div>
            `
          )
          .join("")
      : `<div class="list-row success-row"><span>No forecasted deficit</span><strong>Balance stays positive</strong></div>`;
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
                <span>${escapeHtml(item.month)}</span>
                <strong>${escapeHtml(money(item.balance))}</strong>
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
      const colorClass = pct >= 100 ? "red" : pct >= 75 ? "amber" : "";

      return `
        <div class="list-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span><strong>${escapeHtml(item.category)}</strong> <small>(${money(spent)} / ${money(cap)})</small></span>
            <button class="delete-button" data-cap-delete="${index}" type="button">Delete</button>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${colorClass}" style="width:${pct}%;"></div>
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

  const entries = forecastEntries().filter((entry) => {
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
      return entry.type === "expense" && getRemainingForecastAmount(entry) > 0;
    })
    .map((entry) => {
      const actualAmount = getEntryActualAmount(entry);
      if (entry.type === "expense" && actualAmount > 0) {
        return { ...entry, amount: getRemainingForecastAmount(entry) };
      }
      return entry;
    })
    .filter(matchesFilters)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const filtered = [...openingRows, ...forecastRows];

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
      const action = !deleteKey || !canDelete ? "" : `<button class="delete-button" data-delete-key="${escapeHtml(deleteKey)}" type="button">Delete</button>`;
      const actualValue = getEntryActualAmount(entry);
      const editable = isEditableEntry(entry);
      const clickable = editable || isOpeningBalance;
      const actualCell = editable
        ? `<div>
            <input class="inline-actual-input" data-entry-actual-input="${escapeHtml(deleteKey)}" type="number" min="0" step="0.01" value="" placeholder="Add spend">
            ${actualValue > 0 ? `<small style="display:block;color:var(--muted);margin-top:4px;white-space:nowrap;">Spent so far: ${escapeHtml(money(actualValue))}</small>` : ""}
          </div>`
        : `<span>${actualValue > 0 ? escapeHtml(money(actualValue)) : "—"}</span>`;
      const dateCell = escapeHtml(entry.date);
      return `
        <tr data-entry-id="${escapeHtml(deleteKey)}" class="entry-row${isOpeningBalance ? " opening-balance-row" : ""}" style="cursor:${clickable ? "pointer" : "default"};" title="${isOpeningBalance ? "Edit on the Accounts page" : ""}">
          <td>${dateCell}</td>
          <td>${escapeHtml(entry.category)}</td>
          <td>${escapeHtml(entry.account || "cash")}</td>
          <td><span class="pill ${escapeHtml(entry.type)}">${escapeHtml(entry.type)}</span></td>
          <td><span class="source-pill">${escapeHtml(entry.source || "manual")}</span></td>
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

function commitEntryActualInput(input) {
  if (!input) return;
  const entryId = input.dataset.entryActualInput;
  const entry = findEntryById(entryId);
  if (!entry || !isEditableEntry(entry)) return;

  const typedAmount = input.value === "" ? 0 : Number(input.value);
  if (typedAmount > 0) {
    const previousActual = getEntryActualAmount(entry);
    setEntryActualAmount(entry, previousActual + typedAmount);
  }
  input.value = "";

  renderDashboard();
  renderHistory();
  renderEntries();
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
  const months = new Set();
  actualEntries.forEach((entry) => {
    const key = DateUtils.getMonthKey(entry.date);
    if (key) months.add(key);
  });
  const orderedMonths = [...months].sort();

  const rows = orderedMonths.map((month) => {
    const monthlyEntries = actualEntries.filter((entry) => DateUtils.getMonthKey(entry.date) === month);
    const income = monthlyEntries
      .filter((entry) => entry.type === "income")
      .reduce((sum, entry) => sum + getEntryActualAmount(entry), 0);
    const expenses = monthlyEntries
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + getEntryActualAmount(entry), 0);
    const net = income - expenses;

    return `<tr><td>${escapeHtml(month)}</td><td class="number">${escapeHtml(money(income))}</td><td class="number">${escapeHtml(money(expenses))}</td><td class="number">${escapeHtml(money(net))}</td></tr>`;
  });

  table.innerHTML = rows.join("") || `<tr><td colspan="4">No actual activity yet</td></tr>`;

  const groups = new Map();
  actualEntries.forEach((entry) => {
    const month = DateUtils.getMonthKey(entry.date);
    const groupKey = `${month}|${entry.type}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        month,
        type: entry.type,
        total: 0,
        editable: true,
        canRemove: false,
        memberIds: []
      });
    }
    const group = groups.get(groupKey);
    group.total += getEntryActualAmount(entry);
    group.editable = group.editable && isEditableEntry(entry);
    group.canRemove = group.canRemove || (isEditableEntry(entry) && entry.source !== "starting balance");
    group.memberIds.push(getEntryId(entry));
  });

  const detailRows = [...groups.values()]
    .sort((a, b) => `${a.month}-${a.type}`.localeCompare(`${b.month}-${b.type}`))
    .map((group) => {
      const groupKey = group.memberIds.join(",");
      const actualCell = group.editable
        ? `<input class="inline-actual-input" data-history-actual-input="${escapeHtml(groupKey)}" type="number" min="0" step="0.01" value="${group.total || ""}" placeholder="0">`
        : `<span>${group.total > 0 ? escapeHtml(money(group.total)) : "—"}</span>`;
      const action = group.canRemove
        ? `<button class="delete-button" data-history-delete-key="${escapeHtml(groupKey)}" type="button">Remove</button>`
        : "";

      return `
        <tr>
          <td>${escapeHtml(group.month)}</td>
          <td>${group.type === "expense" ? "All expenses" : "All income"}</td>
          <td><span class="pill ${escapeHtml(group.type)}">${escapeHtml(group.type)}</span></td>
          <td class="number">${actualCell}</td>
          <td class="number">${action}</td>
        </tr>
      `;
    })
    .join("");

  detailsTable.innerHTML = detailRows || `<tr><td colspan="5">No actualized entries yet</td></tr>`;
}

function commitHistoryActualInput(input) {
  if (!input) return;
  const entryIds = input.dataset.historyActualInput.split(",").filter(Boolean);
  const members = entryIds
    .map((id) => findHistoryEntry(id))
    .filter((m) => m.entry && isEditableEntry(m.entry));
  if (!members.length) return;

  const newTotal = input.value === "" ? 0 : Number(input.value);
  const previousTotal = members.reduce((sum, m) => sum + getEntryActualAmount(m.entry), 0);

  members.forEach((member, index) => {
    const entryKey = getEntryId(member.entry);
    if (newTotal <= 0) {
      delete entryActuals[entryKey];
      return;
    }
    if (members.length === 1) {
      entryActuals[entryKey] = newTotal;
    } else if (previousTotal > 0) {
      const share = getEntryActualAmount(member.entry) / previousTotal;
      const amount = index === members.length - 1
        ? newTotal - members.slice(0, -1).reduce((sum, m) => sum + Math.round((getEntryActualAmount(m.entry) / previousTotal) * newTotal * 100) / 100, 0)
        : Math.round(share * newTotal * 100) / 100;
      entryActuals[entryKey] = Math.max(0, amount);
    } else {
      entryActuals[entryKey] = index === 0 ? newTotal : 0;
    }
  });

  saveSetting(keys.entryActuals, entryActuals);
}

function permanentlyRemoveEntry(entry) {
  const deleteKey = getEntryId(entry);

  const index = cashEntries.findIndex((item) => getEntryId(item) === deleteKey);
  if (index !== -1) {
    cashEntries.splice(index, 1);
    saveSetting(keys.entries, cashEntries);
  } else if (!deletedForecasts.includes(deleteKey)) {
    deletedForecasts.push(deleteKey);
    saveSetting(keys.deletedForecasts, deletedForecasts);
  }

  delete entryActuals[deleteKey];
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

function persistEntryForm(event) {
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
  const plannedAmountInEgp = rawAmount * rate;

  if (editingEntry) {
    const idx = cashEntries.findIndex((entry) => getEntryId(entry) === getEntryId(editingEntry));
    const updatedEntry = {
      ...(idx !== -1 ? cashEntries[idx] : editingEntry),
      id: idx !== -1 ? cashEntries[idx].id : editingEntry.id || generateId(),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      account: form.elements.account.value.trim() || "cash",
      type: form.elements.type.value,
      amount: plannedAmountInEgp,
      creditType: form.elements.creditType.value || "",
      source: form.elements.type.value === "expense" ? "expense" : "income"
    };

    if (idx !== -1) {
      cashEntries[idx] = updatedEntry;
      const actualAmount = Number(form.elements.actualAmount.value || 0);
      if (actualAmount > 0) {
        setEntryActualAmount(updatedEntry, actualAmount * rate);
      } else {
        delete entryActuals[getEntryId(editingEntry)];
      }
    } else {
      const actualAmount = Number(form.elements.actualAmount.value || 0);
      const originalId = getEntryId(editingEntry);
      if (actualAmount > 0) {
        entryActuals[originalId] = Number(actualAmount * rate);
      } else {
        delete entryActuals[originalId];
      }
      saveSetting(keys.entryActuals, entryActuals);
    }
  } else {
    const baseEntry = {
      id: generateId(),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      account: form.elements.account.value.trim() || "cash",
      type: form.elements.type.value,
      amount: plannedAmountInEgp,
      creditType: form.elements.creditType.value || "",
      source: form.elements.type.value === "expense" ? "expense" : "income"
    };
    const months = form.elements.recurring.checked ? Number(form.elements.months.value) || 1 : 1;
    cashEntries.push(...buildRecurringEntries(baseEntry, months));

    const actualAmount = Number(form.elements.actualAmount.value || 0);
    if (actualAmount > 0) {
      setEntryActualAmount(cashEntries[cashEntries.length - months], actualAmount * rate);
    }
  }

  const action = editingEntry ? "update" : "save";
  saveSetting(keys.entries, cashEntries);
  saveSetting(keys.entryActuals, entryActuals);
  editingEntry = null;
  if (dialog) {
    dialog.returnValue = action;
    dialog.close(action);
  }
  renderAll();
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
  on("searchEntries", "input", renderEntries);

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

  document.addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-history-actual-input]");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    commitHistoryActualInput(input);
    renderDashboard();
    renderHistory();
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-history-actual-input]");
    if (!input) return;
    commitHistoryActualInput(input);
    renderDashboard();
    renderHistory();
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-delete-key]");
    if (!button) return;
    event.stopPropagation();

    const confirmed = await confirmAction("Remove Actualized History", "Remove this actualized entry record?");
    if (!confirmed) return;

    const entryIds = button.dataset.historyDeleteKey.split(",").filter(Boolean);

    entryIds.forEach((entryId) => {
      const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
      if (!entry || !isEditableEntry(entry)) return;

      if (isArchived && archivedIndex !== -1) {
        archivedEntries.splice(archivedIndex, 1);
        delete entryActuals[getEntryId(entry)];
      } else {
        permanentlyRemoveEntry(entry);
      }
    });

    saveSetting(keys.archivedEntries, archivedEntries);
    saveSetting(keys.entryActuals, entryActuals);
    renderDashboard();
    renderHistory();
    renderEntries();
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
  Object.entries(exportableDataKeys).forEach(([dataKey, storageKey]) => {
    if (incoming[dataKey] !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(incoming[dataKey]));
    }
  });
  localStorage.setItem(keys.salaryMaterialized, "true");
  localStorage.setItem(keys.seedVersion, seedVersion);
  location.reload();
}

async function pushToGist(token, gistId, silent = false) {
  if (!token || !gistId) {
    if (!silent) alert("Please enter both a GitHub PAT token and a Gist ID.");
    return false;
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
    const budgetFile = gistData.files && gistData.files["budget-data.json"];
    if (!budgetFile || !budgetFile.content) {
      throw new Error("No 'budget-data.json' file found in this Gist.");
    }

    const payload = JSON.parse(budgetFile.content);
    const incoming = payload && typeof payload === "object" ? payload.data : null;
    if (!incoming || typeof incoming !== "object") {
      throw new Error("Invalid budget data format inside Gist.");
    }

    applyIncomingDataPayload(incoming);
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
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const created = await res.json();
    updateGistSyncStatus("Synced", "synced");
    return created.id;
  } catch (err) {
    console.error("Failed to create Gist:", err);
    updateGistSyncStatus("Error", "error");
    alert(`Failed to create Gist: ${err.message}`);
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
  });

  on("gistSaveBtn", "click", async () => {
    const tokenInput = document.getElementById("gistTokenInput");
    const gistIdInput = document.getElementById("gistIdInput");
    const autoSyncCheckbox = document.getElementById("gistAutoSyncCheckbox");

    const token = tokenInput ? tokenInput.value.trim() : "";
    const gistId = gistIdInput ? gistIdInput.value.trim() : "";
    const autoSync = autoSyncCheckbox ? autoSyncCheckbox.checked : true;

    localStorage.setItem(keys.gistToken, token);
    localStorage.setItem(keys.gistId, gistId);
    localStorage.setItem(keys.gistAutoSync, String(autoSync));

    if (!token || !gistId) {
      alert("Please provide both Personal Access Token and Gist ID, or click 'Auto-Create Gist'.");
      return;
    }

    await pushToGist(token, gistId, false);
  });

  on("gistPullBtn", "click", async () => {
    const { token, gistId } = getGistConfig();
    if (!token || !gistId) {
      alert("Please enter and save your PAT token and Gist ID first.");
      return;
    }

    const confirmed = await confirmAction(
      "Pull Data from GitHub Gist",
      "This will overwrite all local budget data on this browser with the data stored in your Gist. Continue?",
      "Pull Data"
    );
    if (!confirmed) return;

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
  const { token, gistId } = getGistConfig();
  if (token && gistId) {
    updateGistSyncStatus("Synced", "synced");
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
