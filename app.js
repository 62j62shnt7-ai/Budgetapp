const DateUtils = {
  formatDate: (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,

  currentYearMonth: () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  },
  
  getMonthKey: (dateString) => dateString.slice(0, 7),
  
  // Accepts a 1-based `month` (1-12) and returns the last day of that month
  getLastDayOfMonth: (year, month) => new Date(year, month, 0).getDate(),
  
  parseYearMonth: (ymString) => ymString.split("-").map(Number),
  
  parseDate: (dateString) => dateString.split("-").map(Number),
  
  getShortMonth: (ymString) => ymString.slice(5)
};

const defaultSalaryPattern = [];

const defaultCashEntries = [];

const defaultInstallments = [];

const defaultStorage = [];

// Safe deep-clone with fallback for environments without structuredClone
function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

// Helper to safely attach event listeners to elements that may not exist
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

// Keep focus stable while typing, but avoid forcing a re-render loop.
document.addEventListener("input", (e) => {
  const target = e.target;
  if (!target || !(target instanceof HTMLElement)) return;
  const tag = target.tagName;
  if (!/(INPUT|TEXTAREA|SELECT)/.test(tag)) return;
  if (target.dataset && target.dataset.commitOnEnter === "true") return;
  setTimeout(() => {
    if (document.activeElement !== target && document.body.contains(target)) {
      try { target.focus(); } catch (err) { /* ignore */ }
    }
  }, 0);
}, true);

// Seed data is now handled via loadSetting and default constants
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
  salaryMaterialized: "budget-control-salary-materialized",
  resetBackup: "budget-control-reset-backup"
};
const seedVersion = "blank-template-v1";

const defaultAccountBalances = {
  cib: { name: "CIB", balance: 0, maturityDay: 15 },
  hsbc: { name: "HSBC", balance: 0, maturityDay: 30 }
};

const defaultAsf = [];

const defaultRates = {
  currencies: [
    { name: "USD", sell: 0, buy: 0 },
    { name: "EUR", sell: 0, buy: 0 },
    { name: "SAR", sell: 0, buy: 0 },
    { name: "AED", sell: 0, buy: 0 },
    { name: "GBP", sell: 0, buy: 0 }
  ],
  gold: [
    { name: "Gold 24", sell: 0, buy: 0 },
    { name: "Gold 22", sell: 0, buy: 0 },
    { name: "Gold 21", sell: 0, buy: 0 },
    { name: "Gold 18", sell: 0, buy: 0 },
    { name: "Gold coin", sell: 0, buy: 0 }
  ]
};

const defaultIrq = [];

const defaultArchivedEntries = [];

let forecastStartMonth = DateUtils.currentYearMonth();
let forecastQuarters = 12;
const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = (value) => `${formatter.format(Math.round(value))} EGP`;
const usd = (value) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} USD`;

let salaryPattern = loadSetting(keys.salary, defaultSalaryPattern);
let cashEntries = normalizeCashEntries(loadSetting(keys.entries, defaultCashEntries));
let installments = loadSetting(keys.installments, defaultInstallments);
let storageAssets = loadSetting(keys.storage, defaultStorage);
let accountBalances = loadSetting(keys.accounts, defaultAccountBalances);
let asfJobs = loadSetting(keys.asf, defaultAsf);
let ratesData = loadSetting(keys.rates, defaultRates);
let irqJobs = loadSetting(keys.irq, defaultIrq);
let creditDues = loadSetting(keys.creditDues, {});
let creditDueMonths = loadSetting(keys.creditDueMonths, {});
let entryActuals = loadSetting(keys.entryActuals, {});
let deletedForecasts = loadSetting(keys.deletedForecasts, []);
let archivedEntries = loadSetting(keys.archivedEntries, defaultArchivedEntries);
let editingEntry = null;

// One-time migration: salary entries used to be regenerated live on every
// render from salaryPattern + the global forecast window, rather than
// stored. That's what made "Update salary" wipe/rebuild everything. This
// converts whatever salary entries were currently visible into real,
// persisted cashEntries (preserving any actual amounts already recorded),
// so future updates only ever touch the specific range requested.
function materializeLegacySalaryEntries() {
  if (localStorage.getItem(keys.salaryMaterialized) === "true") return;

  const deletedSet = new Set(deletedForecasts || []);
  const legacyEntries = buildSalaryEntries(forecastStartMonth, forecastQuarters)
    .filter((entry) => !deletedSet.has(getEntryId(entry)))
    .map((entry) => {
      const legacyId = getEntryId(entry); // old composite fallback id
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
materializeLegacySalaryEntries();

function generateId() {
  return crypto && crypto.randomUUID ? crypto.randomUUID() : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCashEntries(entries) {
  return entries.map((entry) => ({
    ...entry,
    id: entry.id || generateId()
  }));
}

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
  localStorage.setItem(key, JSON.stringify(value));
}

function buildSalaryEntries(startYearMonth, quarters) {
  const [startYear, startMonth] = DateUtils.parseYearMonth(startYearMonth);
  const result = [];

  for (let quarter = 0; quarter < quarters; quarter += 1) {
    salaryPattern.forEach((payment) => {
      const zeroBasedMonth = startMonth - 1 + quarter * 3 + payment.monthOffset;
      const year = startYear + Math.floor(zeroBasedMonth / 12);
      const month = ((zeroBasedMonth % 12) + 12) % 12;
      const lastDay = DateUtils.getLastDayOfMonth(year, month + 1);
      const day = Math.min(Number(payment.day), lastDay);
      result.push({
        date: DateUtils.formatDate(year, month + 1, day),
        category: "salary",
        account: "cib",
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
    return Array.from({ length: Number(installment.months) || 0 }, (_, index) => {
      const zeroBasedMonth = startMonth - 1 + index;
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
  // Salary entries are materialized into cashEntries by upsertSalaryEntriesForPeriod
  // (the "Update salary" button), so they're already included via ...cashEntries.
  const all = [
    ...cashEntries,
    ...buildInstallmentEntries(),
    ...creditDueEntries()
  ];
  const deletedSet = new Set(deletedForecasts || []);
  return all.filter((entry) => !deletedSet.has(getEntryId(entry)));
}

function getRemainingForecastAmount(entry) {
  const actualAmount = getEntryActualAmount(entry);
  if (entry.type === "expense" && actualAmount > 0) {
    return Math.max(0, Number(entry.amount || 0) - actualAmount);
  }
  return Number(entry.amount || 0);
}

function forecastEntries() {
  return getForecastCandidateEntries()
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

function getDeletedEntriesWithActuals() {
  // Return archived entries that have actual amounts recorded
  return archivedEntries.filter((entry) => getEntryActualAmount(entry) > 0);
}

function actualizedEntries() {
  // Get all forecast candidates (active entries with actual amounts)
  syncForecastPeriodSettings();
  const activeCandidates = [
    ...cashEntries,
    ...buildInstallmentEntries(),
    ...creditDueEntries()
  ].filter((entry) => getEntryActualAmount(entry) > 0);
  
  // Also include archived entries that have actual amounts
  const archivedWithActuals = getDeletedEntriesWithActuals();
  
  return [...activeCandidates, ...archivedWithActuals];
}

function openingBalanceEntries() {
  // Dateless and persistent: these are not tied to the forecast window and
  // don't move as forecastStartMonth changes. They're locked so they can
  // only be changed from the Accounts page, not edited inline here.
  return Object.entries(accountBalances).map(([id, acc]) => ({
    date: "",
    category: `${acc.name} Opening Balance`,
    account: id,
    type: "income",
    amount: Number(acc.balance) || 0,
    source: "starting balance",
    locked: true
  }));
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

function getActualMovement(entry) {
  const actualAmount = getEntryActualAmount(entry);
  if (!actualAmount) return 0;
  return entry.type === "income" ? actualAmount : -actualAmount;
}

function signedAmount(entry) {
  const actualAmount = getEntryActualAmount(entry);
  const effectiveAmount = actualAmount > 0 ? actualAmount : Number(entry.amount || 0);
  return entry.type === "income" ? effectiveAmount : -effectiveAmount;
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

function getCreditDueMonthOptions(selectedMonthKey) {
  const start = new Date();
  const options = [];
  let hasSelected = false;

  for (let i = 0; i < 18; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = DateUtils.getMonthKey(DateUtils.formatDate(date.getFullYear(), date.getMonth() + 1, 1));
    const label = date.toLocaleString("en-US", { month: "long", year: "numeric" });
    if (key === selectedMonthKey) hasSelected = true;
    options.push(`<option value="${key}" ${key === selectedMonthKey ? "selected" : ""}>${label}</option>`);
  }

  if (selectedMonthKey && !hasSelected) {
    const [year, month] = DateUtils.parseYearMonth(selectedMonthKey);
    const label = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
    options.unshift(`<option value="${selectedMonthKey}" selected>${label}</option>`);
  }

  return options.join("");
}

function calculateActualCash(referenceDate = new Date()) {
  const cutoff = referenceDate.toISOString().slice(0, 10);
  const openingBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const seenIds = new Set();
  const actualEntries = [...cashEntries, ...actualizedEntries()]
    .filter((entry) => {
      if (!entry || !entry.date || entry.date > cutoff) return false;
      const id = getEntryId(entry);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  const net = actualEntries.reduce((sum, entry) => sum + signedAmount(entry), 0);
  return openingBalance + net;
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
}

function renderAccounts() {
  const list = document.getElementById("accountsList");
  const totalOpening = Object.values(accountBalances).reduce((sum, acc) => sum + acc.balance, 0);
  
  list.innerHTML = Object.entries(accountBalances)
    .map(([id, acc]) => `
      <div class="list-row">
        <span>
          <strong>${acc.name}</strong><br>
          <small>Maturity Day: ${acc.maturityDay}</small>
        </span>
        <div class="inline-fields" style="grid-template-columns: 120px 100px; gap: 10px; margin: 0;">
          <label>
            Balance
            <input data-account-id="${id}" data-account-field="balance" type="number" value="${acc.balance}">
          </label>
          <label>
            Day
            <input data-account-id="${id}" data-account-field="maturityDay" type="number" min="1" max="31" value="${acc.maturityDay}">
          </label>
        </div>
      </div>
    `)
    .join("");
    
  document.getElementById("totalOpeningBalance").textContent = money(totalOpening);
}

on("accountsList", "change", (event) => {
  const input = event.target.closest("[data-account-id]");
  if (!input) return;
  const id = input.dataset.accountId;
  const field = input.dataset.accountField;
  accountBalances[id][field] = Number(input.value);
  saveSetting(keys.accounts, accountBalances);
  const totalOpening = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const totalEl = document.getElementById("totalOpeningBalance");
  if (totalEl) totalEl.textContent = money(totalOpening);
  renderDashboard();
});

on("accountsList", "input", (event) => {
  const input = event.target.closest("[data-account-id]");
  if (!input) return;
  input.dataset.commitOnEnter = "true";
  const id = input.dataset.accountId;
  const field = input.dataset.accountField;
  accountBalances[id][field] = Number(input.value);
  saveSetting(keys.accounts, accountBalances);
  const totalOpening = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const totalEl = document.getElementById("totalOpeningBalance");
  if (totalEl) totalEl.textContent = money(totalOpening);
});

on("accountsList", "keydown", (event) => {
  const input = event.target.closest("[data-account-id]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  renderDashboard();
});

on("accountsList", "change", (event) => {
  const input = event.target.closest("[data-account-id]");
  if (!input) return;
  const id = input.dataset.accountId;
  const field = input.dataset.accountField;
  accountBalances[id][field] = Number(input.value);
  saveSetting(keys.accounts, accountBalances);
  const totalOpening = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const totalEl = document.getElementById("totalOpeningBalance");
  if (totalEl) totalEl.textContent = money(totalOpening);
  renderDashboard();
});


function renderDashboard() {
  const entries = forecastEntries();
  const forecast = calculateForecast(entries);

  const actualCashNow = calculateActualCash();
  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const currentCash = forecast.length ? forecast[forecast.length - 1].balance : totalOpeningBalance;
  const lowPoint = forecast.reduce((lowest, item) => (item.balance < lowest.balance ? item : lowest), { month: forecastStartMonth, balance: totalOpeningBalance });
  const storageTotal = storageAssets.reduce((sum, item) => sum + storageValue(item), 0);
  const cibCredit = getCreditDueAmount("cib");
  const hsbcCredit = getCreditDueAmount("hsbc");
  const totalCreditDue = cibCredit + hsbcCredit;
  const manualCreditExpenses = cashEntries.filter((entry) => entry.type === "expense" && ["cib", "hsbc"].includes((entry.creditType || "").toLowerCase()));
  const manualCibCredit = manualCreditExpenses.filter((entry) => (entry.creditType || "").toLowerCase() === "cib").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const manualHsbcCredit = manualCreditExpenses.filter((entry) => (entry.creditType || "").toLowerCase() === "hsbc").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  document.getElementById("cashBalance").textContent = money(currentCash);
  document.getElementById("actualCashToday").textContent = money(actualCashNow);
  document.getElementById("cibCreditDue").textContent = money(cibCredit + manualCibCredit);
  document.getElementById("hsbcCreditDue").textContent = money(hsbcCredit + manualHsbcCredit);
  document.getElementById("creditDueTotal").textContent = money(totalCreditDue + manualCibCredit + manualHsbcCredit);
  document.getElementById("storageTotal").textContent = money(storageTotal);
  document.getElementById("forecastLow").textContent = money(lowPoint.balance);
  document.getElementById("forecastLowDate").textContent = `Lowest in ${lowPoint.month}`;

  const isNegative = forecast.some((item) => item.balance < 0);
  document.getElementById("cashflowStatus").textContent = isNegative ? "Risk" : "OK";
  document.getElementById("cashflowStatus").classList.toggle("danger-text", isNegative);
  document.getElementById("cashflowStatusNote").textContent = isNegative ? "Expenses exceed cash in forecast" : "Cash stays above zero";

  renderBalanceChart(forecast);
  renderExpenseMix(entries);
  renderWarnings(forecast);
}

function getForecastMovement(entry) {
  // Use exactly what's in the entry's "amount" column — the same value
  // shown in the Entries table (already resolved to the remaining unpaid
  // balance for partially-actualized expenses, full amount otherwise).
  // Never fall back to a separate "actual" lookup here.
  const amount = Number(entry.amount || 0);
  return entry.type === "income" ? amount : -amount;
}

function calculateForecast(entries) {
  // Low point / warnings / status should be driven purely by the amount
  // column of the forecast sheet (entries passed in), never by a separate
  // "actual" figure. The baseline is the raw opening balance, which has no
  // entries baked into it yet — so every entry still on the forecast sheet
  // needs to be walked in, including ones dated today or already overdue
  // (a pending bill doesn't stop being owed just because its date passed).
  const months = groupByMonth(entries, getForecastMovement);
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

function renderBalanceChart(forecast) {
  const chart = document.getElementById("balanceChart");
  const maxAbs = Math.max(...forecast.map((item) => Math.abs(item.balance)), 1);
  chart.innerHTML = forecast
    .map((item) => {
      const height = Math.max(6, Math.round((Math.abs(item.balance) / maxAbs) * 230));
      const label = DateUtils.getShortMonth(item.month);
      const tone = item.balance < 0 ? "negative" : "";
      return `<div class="bar-wrap" title="${money(item.balance)}"><div class="bar ${tone}" style="height:${height}px"></div><span>${label}</span></div>`;
    })
    .join("");

  const range = forecast.length ? `${forecast[0].month} to ${forecast[forecast.length - 1].month}` : "No entries";
  document.getElementById("forecastRange").textContent = range;
}

function groupByMonth(source, amountFn = signedAmount) {
  return source.reduce((groups, entry) => {
    const month = DateUtils.getMonthKey(entry.date);
    groups[month] = (groups[month] || 0) + amountFn(entry);
    return groups;
  }, {});
}

function renderWarnings(forecast) {
  const riskyMonths = forecast.filter((item) => item.balance < 0);
  const list = document.getElementById("forecastWarnings");

  if (!riskyMonths.length) {
    list.innerHTML = `<div class="list-row success-row"><span>Cashflow is covered</span><strong>No deficit</strong></div>`;
    return;
  }

  list.innerHTML = riskyMonths
    .slice(0, 5)
    .map((item) => `<div class="list-row danger-row"><span>${item.month}</span><strong>${money(item.balance)}</strong></div>`)
    .join("");
}

function renderExpenseMix(entries) {
  const totals = entries
    .filter((entry) => entry.type === "expense")
    .reduce((groups, entry) => {
      groups[entry.category] = (groups[entry.category] || 0) + entry.amount;
      return groups;
    }, {});

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, total]) => `<div class="list-row"><span>${category}</span><strong>${money(total)}</strong></div>`)
    .join("");

  document.getElementById("expenseList").innerHTML = rows || `<div class="list-row"><span>No expenses yet</span><strong>0</strong></div>`;
}

function canDeleteEntry(entry) {
  return !entry.locked && entry.source !== "starting balance";
}

function isEditableEntry(entry) {
  return !entry.locked;
}

function activateView(viewId) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  const targetButton = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  document.getElementById("viewTitle").textContent = targetButton ? targetButton.textContent : "Dashboard";
}

function findEntryById(entryId) {
  const fromCash = cashEntries.find((entry) => getEntryId(entry) === entryId);
  if (fromCash) return fromCash;
  return [...openingBalanceEntries(), ...getForecastCandidateEntries()].find((entry) => getEntryId(entry) === entryId) || null;
}

// History's "Actualized entries" list can include archived (deleted) entries
// that still have an actual amount recorded — findEntryById alone won't see
// those since they're no longer in cashEntries or the live forecast. This
// checks both, so editing and deleting from History behave consistently.
function findHistoryEntry(entryId) {
  const active = findEntryById(entryId);
  if (active) return { entry: active, isArchived: false };
  const archivedIndex = archivedEntries.findIndex((e) => getEntryId(e) === entryId);
  if (archivedIndex !== -1) return { entry: archivedEntries[archivedIndex], isArchived: true, archivedIndex };
  return { entry: null, isArchived: false, archivedIndex: -1 };
}

function getEntryLookupKey(entry) {
  return entry && entry.id ? entry.id : getEntryId(entry);
}

function focusAccountBalance(accountId) {
  activateView("accounts");
  const input = document.querySelector(`[data-account-id="${accountId}"][data-account-field="balance"]`);
  if (input) {
    input.focus();
    input.select();
  }
}

function renderEntries() {
  const table = document.getElementById("entriesTable");
  const typeFilter = document.getElementById("typeFilter").value;
  const search = document.getElementById("searchEntries").value.trim().toLowerCase();
  const matchesFilters = (entry) =>
    (typeFilter === "all" || entry.type === typeFilter) &&
    (!search || entry.category.toLowerCase().includes(search));

  // Opening balance rows are pinned at the top, in account order, with no
  // date sort applied. The rest of the forecast is sorted by date below them.
  const openingRows = openingBalanceEntries().filter(matchesFilters);
  const forecastRows = forecastEntries()
    .filter(matchesFilters)
    .sort((a, b) => a.date.localeCompare(b.date));

  const filtered = [...openingRows, ...forecastRows];

  table.innerHTML = filtered
    .map((entry) => {
      const isOpeningBalance = entry.source === "starting balance";
      const deleteKey = getEntryId(entry);
      const canDelete = canDeleteEntry(entry);
      const action = !deleteKey || !canDelete ? "" : `<button class="delete-button" data-delete-key="${deleteKey}" type="button">Delete</button>`;
      const actualValue = getEntryActualAmount(entry);
      const editable = isEditableEntry(entry);
      const clickable = editable || isOpeningBalance;
      const actualCell = editable
        ? `<input class="inline-actual-input" data-entry-actual-input="${deleteKey}" type="number" min="0" step="0.01" value="${actualValue || ""}" placeholder="0">`
        : `<span>${actualValue > 0 ? money(actualValue) : "—"}</span>`;
      const dateCell = isOpeningBalance ? "—" : entry.date;
      return `
        <tr data-entry-id="${deleteKey}" class="entry-row${isOpeningBalance ? " opening-balance-row" : ""}" style="cursor:${clickable ? "pointer" : "default"};" title="${isOpeningBalance ? "Edit on the Accounts page" : ""}">
          <td>${dateCell}</td>
          <td>${entry.category}</td>
          <td>${entry.account || "cash"}</td>
          <td><span class="pill ${entry.type}">${entry.type}</span></td>
          <td><span class="source-pill">${entry.source || "manual"}</span></td>
          <td class="number">${money(entry.amount)}</td>
          <td class="number">${actualCell}</td>
          <td class="number">${action}</td>
        </tr>
      `;
    })
    .join("");
}

function renderHistory() {
  const table = document.getElementById("historyTable");
  const detailsTable = document.getElementById("historyEntriesTable");
  const actualEntries = actualizedEntries();
  const months = new Set();
  actualEntries.forEach((entry) => months.add(DateUtils.getMonthKey(entry.date)));
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

    return `<tr><td>${month}</td><td class="number">${money(income)}</td><td class="number">${money(expenses)}</td><td class="number">${money(net)}</td></tr>`;
  });

  table.innerHTML = rows.join("") || `<tr><td colspan="4">No actual activity yet</td></tr>`;

  const detailRows = actualEntries
    .slice()
    .sort((a, b) => `${a.date}-${a.category}`.localeCompare(`${b.date}-${b.category}`))
    .map((entry) => {
      const deleteKey = getEntryId(entry);
      const actualValue = getEntryActualAmount(entry);
      const editable = isEditableEntry(entry);
      const actualCell = editable
        ? `<input class="inline-actual-input" data-history-actual-input="${deleteKey}" type="number" min="0" step="0.01" value="${actualValue || ""}" placeholder="0">`
        : `<span>${actualValue > 0 ? money(actualValue) : "—"}</span>`;
      const action = editable && entry.source !== "starting balance"
        ? `<button class="delete-button" data-history-delete-key="${deleteKey}" type="button">Remove</button>`
        : "";

      return `
        <tr>
          <td>${DateUtils.getMonthKey(entry.date)}</td>
          <td>${entry.category}</td>
          <td><span class="pill ${entry.type}">${entry.type}</span></td>
          <td class="number">${actualCell}</td>
          <td class="number">${action}</td>
        </tr>
      `;
    })
    .join("");

  detailsTable.innerHTML = detailRows || `<tr><td colspan="5">No actualized entries yet</td></tr>`;
}

function syncSalaryPeriodControls() {
  syncForecastPeriodSettings();
  const startInput = document.getElementById("salaryPeriodStart");
  const quartersInput = document.getElementById("salaryPeriodQuarters");
  if (startInput && !startInput.value) startInput.value = forecastStartMonth;
  if (quartersInput && !quartersInput.value) quartersInput.value = String(forecastQuarters);
}

// Adds or refreshes salary payments only within [startMonth, startMonth + quarters)
// and never touches anything outside that range. A payment already in cashEntries
// for a given date/account/type gets its amount refreshed (in case the pattern
// changed); anything missing gets added. Nothing is ever deleted here — to remove
// a salary payment, delete that row directly like any other entry.
function upsertSalaryEntriesForPeriod(startMonth = forecastStartMonth, quarters = forecastQuarters) {
  // Save any modified salary pattern values (day/amount) before generating
  saveSetting(keys.salary, salaryPattern);

  forecastStartMonth = startMonth || forecastStartMonth;
  forecastQuarters = Math.max(1, Number(quarters || forecastQuarters));

  const templates = buildSalaryEntries(forecastStartMonth, forecastQuarters);

  templates.forEach((template) => {
    const existing = cashEntries.find((entry) =>
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

function renderSalarySchedule() {
  syncSalaryPeriodControls();
  const schedule = document.getElementById("salarySchedule");
  const quarterTotal = salaryPattern.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const labels = ["Month 1", "Month 1", "Month 2", "Month 2", "Month 3", "Month 3"];

  schedule.innerHTML = salaryPattern
    .map((payment, index) => `
      <article class="salary-card">
        <small>${labels[index]} - payment day</small>
        <div class="inline-fields">
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
  document.getElementById("salaryQuarterTotal").textContent = money(quarterTotal);
}

function renderInstallments() {
  const list = document.getElementById("installmentList");
  if (!installments.length) {
    list.innerHTML = `<div class="list-row"><span>No installments planned</span><strong>0</strong></div>`;
    return;
  }

  list.innerHTML = installments
    .map((item, index) => `
      <div class="list-row">
        <span>${item.name}<br><small>${money(item.amount)} monthly from ${item.startMonth} for ${item.months} months</small></span>
        <button class="delete-button" data-installment-delete="${index}" type="button">Delete</button>
      </div>
    `)
    .join("");
}

function renderStorage() {
  renderStorageTotals();
  document.getElementById("storageCards").innerHTML = storageAssets
    .map((item, index) => `
      <article class="asset-card">
        <div class="asset-heading">
          <strong>${item.name}</strong>
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
        <small>${item.unit || "units"}</small>
        <p data-storage-value>${money(storageValue(item))}</p>
      </article>
    `)
    .join("");
}

function renderStorageTotals() {
  const total = storageAssets.reduce((sum, item) => sum + storageValue(item), 0);
  const summaryEl = document.getElementById("storageSummary");
  if (summaryEl) summaryEl.textContent = money(total);
  const totalEl = document.getElementById("storageTotal");
  if (totalEl) totalEl.textContent = money(total);
}

function storageValue(item) {
  return (Number(item.quantity) || 0) * (Number(item.rate) || 0);
}

// Builds the <option>/<optgroup> markup for a "rate source" dropdown,
// letting a storage asset link to a live entry from the Rates tab
// (currency or gold karat) instead of a hand-typed number. Selecting an
// entry here only sets a *default* rate value — it's copied onto the
// asset, not kept in permanent sync, so editing the Rate field directly
// still works as plain manual entry.
function rateSourceOptionsHtml(selected) {
  const current = selected || "manual";
  const currencyOptions = (ratesData.currencies || [])
    .map((c) => {
      const value = `currency:${c.name}`;
      return `<option value="${value}"${value === current ? " selected" : ""}>${c.name} (${c.sell})</option>`;
    })
    .join("");
  const goldOptions = (ratesData.gold || [])
    .map((g) => {
      const value = `gold:${g.name}`;
      return `<option value="${value}"${value === current ? " selected" : ""}>${g.name} (${g.sell})</option>`;
    })
    .join("");
  return `
    <option value="manual"${current === "manual" ? " selected" : ""}>Manual entry</option>
    <optgroup label="Currencies">${currencyOptions}</optgroup>
    <optgroup label="Gold karats">${goldOptions}</optgroup>
  `;
}

// Looks up the live sell rate for a "type:name" source value (e.g.
// "gold:Gold 21"). Returns null for manual entries or a source that no
// longer exists in the Rates tab.
// Re-pulls the rate for every storage asset that's linked to a Rates-tab
// entry (rather than manual), so updating a currency/gold rate there
// carries through to storage automatically. Manual-entry assets are
// untouched.
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

function renderJobs() {
  document.getElementById("asfTable").innerHTML = asfJobs
    .map((item, index) => `
      <tr>
        <td>${item.date}</td>
        <td class="number">${usd(item.invoice)}</td>
        <td class="number">${usd(item.actual)}</td>
        <td class="number">${money(item.egp)}</td>
        <td><button class="delete-button" data-asf-delete="${index}" type="button">Delete</button></td>
      </tr>
    `)
    .join("");

  document.getElementById("irqCards").innerHTML = irqJobs
    .map((item, index) => `
      <div class="list-row">
        <span>${item.label}<br><small>${item.note}</small></span>
        <div style="display:flex; align-items:center; gap:10px;">
          <strong>${formatter.format(item.value)}</strong>
          <button class="delete-button" data-irq-delete="${index}" type="button">Delete</button>
        </div>
      </div>
    `)
    .join("");
}

function renderRates() {
  const currencyEl = document.getElementById('currencyRates');
  if (currencyEl && ratesData && Array.isArray(ratesData.currencies)) {
    currencyEl.innerHTML = ratesData.currencies.map(c => `
      <div class="rate-card">
        <strong>${c.name}</strong>
        <small>Sell ${c.sell} / Buy ${c.buy}</small>
      </div>
    `).join('');
  }

  const goldEl = document.getElementById('goldRates');
  if (goldEl && ratesData && Array.isArray(ratesData.gold)) {
    goldEl.innerHTML = ratesData.gold.map(g => `
      <div class="rate-card">
        <strong>${g.name}</strong>
        <small>Sell ${g.sell} / Buy ${g.buy}</small>
      </div>
    `).join('');
  }
}

on("asfDialog", "close", () => {
  const dialog = document.getElementById("asfDialog");
  if (!dialog || dialog.returnValue !== "save") return;
  const form = document.getElementById("asfForm");
  asfJobs.push({
    date: form.elements.date.value,
    invoice: Number(form.elements.invoice.value),
    actual: Number(form.elements.actual.value),
    egp: Number(form.elements.egp.value)
  });
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
  irqJobs.push({
    label: form.elements.label.value.trim(),
    value: Number(form.elements.value.value),
    note: form.elements.note.value.trim()
  });
  saveSetting(keys.irq, irqJobs);
  renderAll();
});

// Free, keyless, CORS-friendly endpoints. These give a mid-market
// reference rate — not any specific bank/dealer's posted sell/buy — so we
// derive sell/buy by preserving whatever spread the existing entry already
// had, and clearly flag them as reference values to double-check.
const CURRENCY_RATES_ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const GOLD_PRICE_ENDPOINT = "https://api.gold-api.com/price/XAU";
const TROY_OUNCE_GRAMS = 31.1035;

function computeSpreadPct(sell, buy) {
  const mid = (Number(sell) + Number(buy)) / 2;
  if (!mid) return 0.006; // no existing spread to preserve — default to ~0.6%
  return (Number(buy) - Number(sell)) / mid;
}

function applySpread(mid, spreadPct) {
  return {
    sell: Math.round(mid * (1 - spreadPct / 2) * 100) / 100,
    buy: Math.round(mid * (1 + spreadPct / 2) * 100) / 100
  };
}

async function fetchLiveCurrencyRates() {
  const response = await fetch(CURRENCY_RATES_ENDPOINT);
  if (!response.ok) throw new Error(`Currency rate request failed (${response.status})`);
  const data = await response.json();
  if (data.result !== "success" || !data.rates || typeof data.rates.EGP !== "number") {
    throw new Error("Unexpected currency rate response");
  }
  return data.rates; // USD-based: 1 USD = rates[CODE] units of CODE
}

function egpPerUnit(liveRates, code) {
  if (code === "USD") return liveRates.EGP;
  const perUsd = liveRates[code];
  if (!perUsd) return null;
  return liveRates.EGP / perUsd;
}

async function fetchLiveGoldSpotUsd() {
  const response = await fetch(GOLD_PRICE_ENDPOINT);
  if (!response.ok) throw new Error(`Gold price request failed (${response.status})`);
  const data = await response.json();
  const price = Number(data.price ?? data.price_usd ?? data.rate ?? data.spotPrice);
  if (!price || Number.isNaN(price)) throw new Error("Unexpected gold price response");
  return price; // USD per troy ounce
}

function openManualCurrencyEdit() {
  const rate = prompt("Which currency to update? (e.g. USD, EUR)");
  if (!rate) return;
  const currency = ratesData.currencies.find(c => c.name.toUpperCase() === rate.toUpperCase());
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
  const gold = ratesData.gold.find(g => g.name.toLowerCase().includes(rate.toLowerCase()));
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

on("editCurrencies", "click", async () => {
  const button = document.getElementById("editCurrencies");
  const originalLabel = button.textContent;
  button.textContent = "Fetching…";
  button.disabled = true;

  try {
    const liveRates = await fetchLiveCurrencyRates();
    const changes = [];
    const updated = ratesData.currencies.map((currency) => {
      const mid = egpPerUnit(liveRates, currency.name.toUpperCase());
      if (mid === null) return currency; // not in the live feed — leave untouched
      const spreadPct = computeSpreadPct(currency.sell, currency.buy);
      const next = applySpread(mid, spreadPct);
      changes.push(`${currency.name}: ${currency.sell}/${currency.buy} \u2192 ${next.sell}/${next.buy}`);
      return { ...currency, ...next };
    });

    if (!changes.length) {
      alert("None of the saved currencies matched the live feed.");
      return;
    }

    const confirmed = confirm(
      `Update these currency rates from live market data? (sell/buy, EGP)\n\n${changes.join("\n")}\n\nThese are market-reference rates, not any specific bank's posted price — adjust afterward if needed.`
    );
    if (!confirmed) return;

    ratesData.currencies = updated;
    saveSetting(keys.rates, ratesData);
    syncStorageRates();
    renderAll();
  } catch (err) {
    console.error("Live currency rate fetch failed:", err);
    const manual = confirm("Couldn't fetch live rates (no connection, or the rate service is unavailable). Enter a rate manually instead?");
    if (manual) openManualCurrencyEdit();
  } finally {
    button.textContent = originalLabel;
    button.disabled = false;
  }
});

on("editGold", "click", async () => {
  const button = document.getElementById("editGold");
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

    let message = `Update these gold rates from the live spot price? (sell/buy, EGP per gram)\n\n${changes.join("\n")}`;
    if (skipped.length) message += `\n\nNot updated (no karat detected in the name): ${skipped.join(", ")}`;
    message += `\n\nThese are derived from the international spot price — adjust afterward for your local dealer's premium.`;

    const confirmed = confirm(message);
    if (!confirmed) return;

    ratesData.gold = updated;
    saveSetting(keys.rates, ratesData);
    syncStorageRates();
    renderAll();
  } catch (err) {
    console.error("Live gold rate fetch failed:", err);
    const manual = confirm("Couldn't fetch the live gold price (no connection, or the rate service is unavailable). Enter a rate manually instead?");
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
  const id = Number(form.elements.rateId.value);
  const name = form.elements.name.value.trim();
  const sell = Number(form.elements.sell.value);
  const buy = Number(form.elements.buy.value);

  const isCurrency = ratesData.currencies.some(c => c.name === name);
  if (isCurrency) {
    const idx = ratesData.currencies.findIndex(c => c.name === name);
    ratesData.currencies[idx] = { name, sell, buy };
  } else {
    const idx = ratesData.gold.findIndex(g => g.name === name);
    if (idx !== -1) ratesData.gold[idx] = { name, sell, buy };
  }
  
  saveSetting(keys.rates, ratesData);
  syncStorageRates();
  renderAll();
});

on("asfTable", "click", (event) => {
  const button = event.target.closest("[data-asf-delete]");
  if (!button) return;
  asfJobs.splice(Number(button.dataset.asfDelete), 1);
  saveSetting(keys.asf, asfJobs);
  renderAll();
});

on("irqCards", "click", (event) => {
  const button = event.target.closest("[data-irq-delete]");
  if (!button) return;
  irqJobs.splice(Number(button.dataset.irqDelete), 1);
  saveSetting(keys.irq, irqJobs);
  renderAll();
});


document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    activateView(button.dataset.view);
  });
});

on("typeFilter", "change", renderEntries);
on("searchEntries", "input", renderEntries);

on("salarySchedule", "input", (event) => {
  const input = event.target.closest("[data-salary-index]");
  if (!input) return;
  input.dataset.commitOnEnter = "true";
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

on("salaryPeriodStart", "input", (event) => {
  const input = event.target;
  if (input) input.dataset.commitOnEnter = "true";
  syncForecastPeriodSettings();
});

on("salaryPeriodStart", "keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  syncForecastPeriodSettings();
  upsertSalaryEntriesForPeriod(forecastStartMonth, forecastQuarters);
});

on("salaryPeriodStart", "change", () => {
  syncForecastPeriodSettings();
  upsertSalaryEntriesForPeriod(forecastStartMonth, forecastQuarters);
});

on("salaryPeriodQuarters", "input", (event) => {
  const input = event.target;
  if (input) input.dataset.commitOnEnter = "true";
  syncForecastPeriodSettings();
});

on("salaryPeriodQuarters", "keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
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

on("entriesTable", "change", (event) => {
  const input = event.target.closest("[data-entry-actual-input]");
  if (!input) return;
  event.stopPropagation();
  const entryId = input.dataset.entryActualInput;
  const entry = findEntryById(entryId);
  if (!entry || !isEditableEntry(entry)) return;

  const actualAmount = input.value === "" ? 0 : Number(input.value);
  if (actualAmount > 0) {
    setEntryActualAmount(entry, actualAmount);
  } else {
    delete entryActuals[getEntryId(entry)];
    saveSetting(keys.entryActuals, entryActuals);
  }

  renderDashboard();
  renderHistory();
  renderEntries();
});

function commitHistoryActualInput(input) {
  if (!input) return;
  const entryId = input.dataset.historyActualInput;
  const { entry } = findHistoryEntry(entryId);
  if (!entry || !isEditableEntry(entry)) return;

  const actualAmount = input.value === "" ? 0 : Number(input.value);
  // Use getEntryId to match what getEntryActualAmount uses for reading
  const entryKey = getEntryId(entry);
  if (actualAmount > 0) {
    entryActuals[entryKey] = actualAmount;
  } else {
    delete entryActuals[entryKey];
  }
  saveSetting(keys.entryActuals, entryActuals);
  renderDashboard();
  renderHistory();
}

document.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-history-actual-input]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  commitHistoryActualInput(input);
});

document.addEventListener("change", (event) => {
  const input = event.target.closest("[data-history-actual-input]");
  if (!input) return;
  commitHistoryActualInput(input);
});

document.addEventListener("blur", (event) => {
  const input = event.target.closest("[data-history-actual-input]");
  if (!input) return;
  commitHistoryActualInput(input);
}, true);

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-delete-key]");
  if (!button) return;
  event.stopPropagation();
  const entryId = button.dataset.historyDeleteKey;

  const { entry, isArchived, archivedIndex } = findHistoryEntry(entryId);
  if (!entry || !isEditableEntry(entry)) return;

  // Delete the actual amount record - use getEntryId to match what getEntryActualAmount uses
  delete entryActuals[getEntryId(entry)];
  // If archived, also remove from archived entries
  if (isArchived && archivedIndex !== -1) {
    archivedEntries.splice(archivedIndex, 1);
    saveSetting(keys.archivedEntries, archivedEntries);
  }

  renderDashboard();
  renderHistory();
});

on("entriesTable", "click", (event) => {
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

    const index = cashEntries.findIndex((item) => getEntryId(item) === deleteKey);
    if (index !== -1) {
      // If entry has an actual amount, move it to archived so History can still show it
      const actualAmount = getEntryActualAmount(entry);
      cashEntries.splice(index, 1);
      saveSetting(keys.entries, cashEntries);
      
      if (actualAmount > 0) {
        // Move entry to archived entries with its actual amount preserved
        archivedEntries.push(entry);
        saveSetting(keys.archivedEntries, archivedEntries);
      } else {
        // No actual amount recorded, just delete the actuals record too
        // Use getEntryId for consistency with how we read actual amounts
        delete entryActuals[getEntryId(entry)];
        saveSetting(keys.entryActuals, entryActuals);
      }
      renderAll();
      return;
    }

    // For forecast entries (salary/installments), move to archived if they have actual amounts
    const actualAmount = getEntryActualAmount(entry);
    if (actualAmount > 0) {
      // Move entry to archived entries with its actual amount preserved
      archivedEntries.push(entry);
      saveSetting(keys.archivedEntries, archivedEntries);
    }
    
    // Add to deletedForecasts so it won't appear in Cash Flow anymore
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

on("installmentList", "click", (event) => {
  const button = event.target.closest("[data-installment-delete]");
  if (!button) return;
  installments.splice(Number(button.dataset.installmentDelete), 1);
  saveSetting(keys.installments, installments);
  renderAll();
});

function syncEntryFormMode() {
  const form = document.getElementById("entryForm");
  const creditType = (form.elements.creditType.value || "").trim().toLowerCase();
  const isCreditDue = creditType === "cib" || creditType === "hsbc";

  document.getElementById("categoryField").classList.toggle("is-hidden", isCreditDue);
  document.getElementById("typeField").classList.toggle("is-hidden", isCreditDue);
  document.getElementById("recurringField").classList.toggle("is-hidden", isCreditDue);

  if (isCreditDue) {
    form.elements.type.value = "expense";
    form.elements.category.value = "Credit Due";
    form.elements.recurring.checked = false;
  }
}

function openEntryDialog(type, entry = null) {
  const form = document.getElementById("entryForm");
  form.reset();
  editingEntry = entry;
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  form.elements.type.value = type;
  form.elements.months.value = 12;
  form.elements.actualAmount.value = "";

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
  const title = entry ? "Edit entry" : (type === "income" ? "Add income" : "Add expense");
  document.getElementById("entryDialogTitle").textContent = title;
  document.getElementById("entrySubmitButton").textContent = entry ? "Update entry" : "Save entry";
  document.getElementById("entrySubmitButton").value = entry ? "update" : "save";
  document.getElementById("entryDialog").showModal();
}

on("addIncome", "click", () => {
  openEntryDialog("income");
});

on("addEntry", "click", () => {
  openEntryDialog("expense");
});

// creditType select may not exist in non-interactive contexts
const entryForm = document.getElementById("entryForm");
if (entryForm && entryForm.elements && entryForm.elements.creditType) {
  entryForm.elements.creditType.addEventListener("change", syncEntryFormMode);
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
    dialog.close("cancel");
    return;
  }

  const plannedAmount = Number(form.elements.amount.value);

  if (editingEntry) {
    const idx = cashEntries.findIndex((entry) => getEntryId(entry) === getEntryId(editingEntry));
    const updatedEntry = {
      ...(idx !== -1 ? cashEntries[idx] : editingEntry),
      id: (idx !== -1 ? cashEntries[idx].id : (editingEntry.id || generateId())),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      account: form.elements.account.value.trim() || "cash",
      type: form.elements.type.value,
      amount: plannedAmount,
      creditType: form.elements.creditType.value || "",
      source: form.elements.type.value === "expense" ? "expense" : "income"
    };

    if (idx !== -1) {
      cashEntries[idx] = updatedEntry;
      const actualAmount = Number(form.elements.actualAmount.value || 0);
      if (actualAmount > 0) {
        setEntryActualAmount(updatedEntry, actualAmount);
      } else {
        delete entryActuals[getEntryId(editingEntry)];
      }
    } else {
      // Editing a forecast entry: do not create a duplicate in cashEntries.
      // Persist only the actual amount (if any) against the original forecast id.
      const actualAmount = Number(form.elements.actualAmount.value || 0);
      const originalId = getEntryId(editingEntry);
      if (actualAmount > 0) {
        entryActuals[originalId] = Number(actualAmount);
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
      amount: plannedAmount,
      creditType: form.elements.creditType.value || "",
      source: form.elements.type.value === "expense" ? "expense" : "income"
    };
    const months = form.elements.recurring.checked ? Number(form.elements.months.value) || 1 : 1;
    cashEntries.push(...buildRecurringEntries(baseEntry, months));
    
    // Set actual amount for new entries
    const actualAmount = Number(form.elements.actualAmount.value || 0);
    if (actualAmount > 0) {
      setEntryActualAmount(cashEntries[cashEntries.length - months], actualAmount);
    }
  }

  const action = editingEntry ? "update" : "save";
  saveSetting(keys.entries, cashEntries);
  saveSetting(keys.entryActuals, entryActuals);
  editingEntry = null;
  dialog.returnValue = action;
  dialog.close(action);
  renderAll();
}

document.getElementById("entryForm").addEventListener("submit", persistEntryForm);

document.getElementById("storageCards").addEventListener("input", (event) => {
  const input = event.target.closest("[data-storage-index]");
  if (!input) return;
  input.dataset.commitOnEnter = "true";
  const index = Number(input.dataset.storageIndex);
  const field = input.dataset.storageField;
  storageAssets[index][field] = Number(input.value);
  const card = input.closest(".asset-card");
  if (field === "rate") {
    // Typing a rate by hand overrides whatever rate source was linked.
    storageAssets[index].rateSource = "manual";
    const select = card?.querySelector("[data-storage-rate-index]");
    if (select) select.value = "manual";
  }
  saveSetting(keys.storage, storageAssets);
  renderStorageTotals();
  const value = card?.querySelector("[data-storage-value]");
  if (value) value.textContent = money(storageValue(storageAssets[index]));
});

document.getElementById("storageCards").addEventListener("change", (event) => {
  const select = event.target.closest("[data-storage-rate-index]");
  if (!select) return;
  const index = Number(select.dataset.storageRateIndex);
  const sourceValue = select.value;
  storageAssets[index].rateSource = sourceValue;
  const resolved = resolveRateSourceValue(sourceValue);
  if (resolved !== null) {
    storageAssets[index].rate = resolved;
  }
  saveSetting(keys.storage, storageAssets);
  renderStorage();
});

document.getElementById("storageCards").addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-storage-index]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  renderStorageTotals();
});

document.getElementById("storageCards").addEventListener("click", (event) => {
  const button = event.target.closest("[data-storage-delete]");
  if (!button) return;
  storageAssets.splice(Number(button.dataset.storageDelete), 1);
  saveSetting(keys.storage, storageAssets);
  renderAll();
});

document.getElementById("addStorage").addEventListener("click", () => {
  const form = document.getElementById("storageForm");
  form.reset();
  form.elements.rateSource.innerHTML = rateSourceOptionsHtml("manual");
  document.getElementById("storageDialog").showModal();
});

// Picking a currency/gold karat from the dropdown fills in a default
// rate (and, if left blank, a matching name/unit) pulled straight from
// the Rates tab. Everything stays editable afterward — this is just a
// convenient starting point, not a permanent link.
document.getElementById("storageForm").elements.rateSource.addEventListener("change", (event) => {
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

document.getElementById("storageDialog").addEventListener("close", () => {
  const dialog = document.getElementById("storageDialog");
  if (dialog.returnValue !== "save") return;
  const form = document.getElementById("storageForm");
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

document.getElementById("addInstallment").addEventListener("click", () => {
  const form = document.getElementById("installmentForm");
  form.reset();
  form.elements.startMonth.value = new Date().toISOString().slice(0, 7);
  form.elements.day.value = 30;
  form.elements.months.value = 12;
  document.getElementById("installmentDialog").showModal();
});

document.getElementById("installmentDialog").addEventListener("close", () => {
  const dialog = document.getElementById("installmentDialog");
  if (dialog.returnValue !== "save") return;
  const form = document.getElementById("installmentForm");
  installments.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: form.elements.name.value.trim(),
    amount: Number(form.elements.amount.value),
    day: Number(form.elements.day.value),
    startMonth: form.elements.startMonth.value,
    months: Number(form.elements.months.value)
  });
  saveSetting(keys.installments, installments);
  renderAll();
});

function readResetBackup() {
  const raw = localStorage.getItem(keys.resetBackup);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function updateUndoResetVisibility() {
  const button = document.getElementById("undoReset");
  if (!button) return;
  button.hidden = !readResetBackup();
}

document.getElementById("resetData").addEventListener("click", () => {
  const confirmed = confirm(
    "Reset all data (salary schedule, forecast entries, installments, storage assets, account balances, ASF invoices, IRQ jobs, and rates) to blank?\n\nYou'll be able to undo this right after, until you reset again."
  );
  if (!confirmed) return;

  // Snapshot exactly what this reset touches, so Undo can restore it.
  saveSetting(keys.resetBackup, {
    salaryPattern: clone(salaryPattern),
    cashEntries: clone(cashEntries),
    installments: clone(installments),
    storageAssets: clone(storageAssets),
    accountBalances: clone(accountBalances),
    asfJobs: clone(asfJobs),
    irqJobs: clone(irqJobs),
    ratesData: clone(ratesData)
  });

  salaryPattern = clone(defaultSalaryPattern);
  cashEntries = clone(defaultCashEntries);
  installments = clone(defaultInstallments);
  storageAssets = clone(defaultStorage);
  accountBalances = clone(defaultAccountBalances);
  asfJobs = clone(defaultAsf);
  irqJobs = clone(defaultIrq);
  ratesData = clone(defaultRates);
  localStorage.setItem(keys.seedVersion, seedVersion);
  saveSetting(keys.salary, salaryPattern);
  saveSetting(keys.entries, cashEntries);
  saveSetting(keys.installments, installments);
  saveSetting(keys.storage, storageAssets);
  saveSetting(keys.accounts, accountBalances);
  saveSetting(keys.asf, asfJobs);
  saveSetting(keys.irq, irqJobs);
  saveSetting(keys.rates, ratesData);
  updateUndoResetVisibility();
  renderAll();
});

document.getElementById("undoReset").addEventListener("click", () => {
  const backup = readResetBackup();
  if (!backup) return;

  salaryPattern = backup.salaryPattern;
  cashEntries = normalizeCashEntries(backup.cashEntries);
  installments = backup.installments;
  storageAssets = backup.storageAssets;
  accountBalances = backup.accountBalances || accountBalances;
  asfJobs = backup.asfJobs || asfJobs;
  irqJobs = backup.irqJobs || irqJobs;
  ratesData = backup.ratesData || ratesData;

  saveSetting(keys.salary, salaryPattern);
  saveSetting(keys.entries, cashEntries);
  saveSetting(keys.installments, installments);
  saveSetting(keys.storage, storageAssets);
  saveSetting(keys.accounts, accountBalances);
  saveSetting(keys.asf, asfJobs);
  saveSetting(keys.irq, irqJobs);
  saveSetting(keys.rates, ratesData);

  // Single-level undo: once used, the backup is gone.
  localStorage.removeItem(keys.resetBackup);
  updateUndoResetVisibility();
  renderAll();
});

// All the app's data lives in localStorage, which never travels with the
// files themselves (it's scoped to whichever browser/machine/file path you
// opened the app from). Export/Import moves it as a plain JSON file instead,
// so it can be carried between machines or browsers by hand.
const exportableDataKeys = {
  salaryPattern: keys.salary,
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
  archivedEntries: keys.archivedEntries
};

document.getElementById("exportData").addEventListener("click", () => {
  const payload = {
    app: "budget-control",
    exportedAt: new Date().toISOString(),
    seedVersion,
    data: {
      salaryPattern,
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
      archivedEntries
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

document.getElementById("importData").addEventListener("click", () => {
  document.getElementById("importDataFile").click();
});

document.getElementById("importDataFile").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
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

    const confirmed = confirm(
      "Import this data? It will replace everything currently in the app on this device."
    );
    if (!confirmed) {
      event.target.value = "";
      return;
    }

    Object.entries(exportableDataKeys).forEach(([dataKey, storageKey]) => {
      if (incoming[dataKey] !== undefined) {
        localStorage.setItem(storageKey, JSON.stringify(incoming[dataKey]));
      }
    });

    // Mark as fully migrated/seeded so the normal load path doesn't try to
    // re-run one-time migrations or reseed anything on top of the import.
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

function initApp() {
  try {
    updateUndoResetVisibility();
    renderAll();
  } catch (e) {
    console.error("Error during initialization:", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
