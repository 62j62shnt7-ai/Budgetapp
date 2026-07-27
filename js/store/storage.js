import { clone } from "../utils/formatters.js";

export const keys = {
  salary: "budget-control-salary-pattern",
  entries: "budget-control-cash-entries",
  installments: "budget-control-installments",
  storage: "budget-control-storage-assets",
  seedVersion: "budget-control-seed-version",
  accounts: "budget-control-account-balances",
  asf: "budget-control-asf-jobs",
  rates: "budget-control-rates",
  ratesCache: "budget-control-rates-cache",
  irq: "budget-control-irq-jobs",
  creditDues: "budget-control-credit-dues",
  creditDueMonths: "budget-control-credit-due-months",
  entryActuals: "budget-control-entry-actuals",
  deletedForecasts: "budget-control-deleted-forecasts",
  archivedEntries: "budget-control-archived-entries",
  salaryMaterialized: "budget-control-salary-materialized",
  salaryAnchor: "budget-control-salary-anchor",
  resetBackup: "budget-control-reset-backup",
  theme: "budget-control-theme"
};

export const seedVersion = "blank-template-v1";

export function loadSetting(key, fallback) {
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

export function saveSetting(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving to localStorage key "${key}":`, e);
  }
}

export function readResetBackup() {
  const raw = localStorage.getItem(keys.resetBackup);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export const exportableDataKeys = {
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
  archivedEntries: keys.archivedEntries
};
