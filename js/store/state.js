import { DateUtils } from "../utils/date.js";
import { clone } from "../utils/formatters.js";
import { keys, seedVersion, loadSetting, saveSetting } from "./storage.js";

export const defaultSalaryPattern = [
  { monthOffset: 0, day: 15, amount: 0 },
  { monthOffset: 0, day: 30, amount: 0 },
  { monthOffset: 1, day: 15, amount: 0 },
  { monthOffset: 1, day: 30, amount: 0 },
  { monthOffset: 2, day: 15, amount: 0 },
  { monthOffset: 2, day: 30, amount: 0 }
];

export const defaultAccountBalances = {
  cib: { name: "CIB", balance: 0, maturityDay: 15 },
  hsbc: { name: "HSBC", balance: 0, maturityDay: 30 }
};

export const defaultRates = {
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

export function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeCashEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    ...entry,
    id: entry.id || generateId()
  }));
}

// Initial state load
export let forecastStartMonth = DateUtils.currentYearMonth();
export let forecastQuarters = 12;

export function setForecastStartMonth(month) {
  forecastStartMonth = month;
}

export function setForecastQuarters(q) {
  forecastQuarters = q;
}

export let salaryAnchorMonth = loadSetting(keys.salaryAnchor, null);
if (!salaryAnchorMonth) {
  salaryAnchorMonth = DateUtils.currentYearMonth();
  saveSetting(keys.salaryAnchor, salaryAnchorMonth);
}
export function setSalaryAnchorMonth(val) {
  salaryAnchorMonth = val;
}

export let salaryPattern = loadSetting(keys.salary, defaultSalaryPattern);
export let cashEntries = normalizeCashEntries(loadSetting(keys.entries, []));
export let installments = loadSetting(keys.installments, []);
export let storageAssets = loadSetting(keys.storage, []);
export let accountBalances = loadSetting(keys.accounts, defaultAccountBalances);
export let asfJobs = loadSetting(keys.asf, []);
export let ratesData = loadSetting(keys.rates, defaultRates);
export let irqJobs = loadSetting(keys.irq, []);
export let creditDues = loadSetting(keys.creditDues, {});
export let creditDueMonths = loadSetting(keys.creditDueMonths, {});
export let entryActuals = loadSetting(keys.entryActuals, {});
export let deletedForecasts = loadSetting(keys.deletedForecasts, []);
export let archivedEntries = loadSetting(keys.archivedEntries, []);
export let editingEntry = null;

export function setEditingEntry(entry) {
  editingEntry = entry;
}

export function updateStateFromBackup(backup) {
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
  creditDues = backup.creditDues || {};
  creditDueMonths = backup.creditDueMonths || {};
  entryActuals = backup.entryActuals || {};
  deletedForecasts = backup.deletedForecasts || [];
  archivedEntries = backup.archivedEntries || [];
}

export function resetStateToDefault() {
  salaryPattern = clone(defaultSalaryPattern);
  salaryAnchorMonth = DateUtils.currentYearMonth();
  cashEntries = [];
  installments = [];
  storageAssets = [];
  accountBalances = clone(defaultAccountBalances);
  asfJobs = [];
  irqJobs = [];
  ratesData = clone(defaultRates);
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
  saveSetting(keys.creditDues, creditDues);
  saveSetting(keys.creditDueMonths, creditDueMonths);
  saveSetting(keys.entryActuals, entryActuals);
  saveSetting(keys.deletedForecasts, deletedForecasts);
  saveSetting(keys.archivedEntries, archivedEntries);
}

// State Helper Functions
export function monthIndexFromYearMonth(ymString) {
  const [year, month] = DateUtils.parseYearMonth(ymString);
  return year * 12 + (month - 1);
}

export function groupPhaseForMonthIndex(absoluteMonthIndex) {
  const anchorIndex = monthIndexFromYearMonth(salaryAnchorMonth || DateUtils.currentYearMonth());
  return (((absoluteMonthIndex - anchorIndex) % 3) + 3) % 3;
}

export function buildSalaryEntries(startYearMonth, quarters) {
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

export function buildInstallmentEntries() {
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

export function buildRecurringEntries(baseEntry, months) {
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

export function creditDueEntries() {
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
  return entries;
}

export function getSavedCreditDueMonths(id) {
  return Object.keys(creditDues[id] || {}).sort();
}

export function getDefaultCreditDueMonth() {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return DateUtils.getMonthKey(DateUtils.formatDate(nextMonth.getFullYear(), nextMonth.getMonth() + 1, nextMonth.getDate()));
}

export function getCreditDueMonthForAccount(id) {
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

export function getCreditDueAmount(id) {
  const monthKey = getCreditDueMonthForAccount(id);
  return (creditDues[id] && creditDues[id][monthKey]) || 0;
}

export function getEntryId(entry) {
  return entry.id || `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || "cash"}`;
}

export function getEntryActualAmount(entry) {
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

export function setEntryActualAmount(entry, value) {
  const id = getEntryId(entry);
  entryActuals[id] = value === "" || value === null || value === undefined ? 0 : Number(value);
  saveSetting(keys.entryActuals, entryActuals);
}

export function getRemainingForecastAmount(entry) {
  const actualAmount = getEntryActualAmount(entry);
  if (entry.type === "expense" && actualAmount > 0) {
    return Math.max(0, Number(entry.amount || 0) - actualAmount);
  }
  return Number(entry.amount || 0);
}

export function syncForecastPeriodSettings() {
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

export function getForecastCandidateEntries() {
  syncForecastPeriodSettings();
  const all = [
    ...cashEntries,
    ...buildInstallmentEntries(),
    ...creditDueEntries()
  ];
  const deletedSet = new Set(deletedForecasts || []);
  return all.filter((entry) => !deletedSet.has(getEntryId(entry)));
}

export function forecastEntries() {
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

export function openingBalanceEntries() {
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

export function actualizedEntries() {
  syncForecastPeriodSettings();
  const activeCandidates = [
    ...cashEntries,
    ...buildInstallmentEntries(),
    ...creditDueEntries()
  ].filter((entry) => getEntryActualAmount(entry) > 0);
  
  const archivedWithActuals = archivedEntries.filter((entry) => getEntryActualAmount(entry) > 0);
  return [...activeCandidates, ...archivedWithActuals];
}

export function materializeLegacySalaryEntries() {
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
