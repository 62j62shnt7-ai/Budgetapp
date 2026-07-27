import { on, clone } from "./utils/formatters.js";
import {
  keys,
  seedVersion,
  saveSetting,
  readResetBackup,
  exportableDataKeys
} from "./store/storage.js";
import {
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
  editingEntry,
  setEditingEntry,
  forecastStartMonth,
  forecastQuarters,
  setForecastStartMonth,
  setForecastQuarters,
  generateId,
  normalizeCashEntries,
  materializeLegacySalaryEntries,
  buildSalaryEntries,
  buildRecurringEntries,
  getEntryId,
  getEntryActualAmount,
  setEntryActualAmount,
  syncForecastPeriodSettings,
  updateStateFromBackup,
  resetStateToDefault,
  defaultSalaryPattern,
  defaultAccountBalances,
  defaultRates
} from "./store/state.js";
import { initTheme, toggleTheme } from "./ui/theme.js";
import { confirmAction } from "./ui/confirm.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderSalarySchedule, renderEntries, renderInstallments, canDeleteEntry, isEditableEntry, findEntryById, commitEntryActualInput } from "./views/cashflow.js";
import { renderAccounts, focusAccountBalance } from "./views/accounts.js";
import { renderStorage, renderStorageTotals, storageValue, rateSourceOptionsHtml } from "./views/storage.js";
import { renderJobs } from "./views/jobs.js";
import { renderRates, openManualCurrencyEdit, openManualGoldEdit } from "./views/ratesView.js";
import { renderHistory, commitHistoryActualInput, findHistoryEntry, permanentlyRemoveEntry } from "./views/history.js";
import {
  fetchLiveCurrencyRates,
  fetchLiveGoldSpotUsd,
  computeSpreadPct,
  applySpread,
  egpPerUnit,
  syncStorageRates,
  resolveRateSourceValue
} from "./api/rates.js";

const TROY_OUNCE_GRAMS = 31.1035;

export function renderAll() {
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

export function activateView(viewId) {
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

  setForecastStartMonth(startMonth || forecastStartMonth);
  setForecastQuarters(Math.max(1, Number(quarters || forecastQuarters)));

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

function openEntryDialog(type, entry = null) {
  const form = document.getElementById("entryForm");
  if (!form) return;
  form.reset();
  setEditingEntry(entry);
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
    setEditingEntry(null);
    if (dialog) dialog.close("cancel");
    return;
  }

  const plannedAmount = Number(form.elements.amount.value);

  if (editingEntry) {
    const idx = cashEntries.findIndex((entry) => getEntryId(entry) === getEntryId(editingEntry));
    const updatedEntry = {
      ...(idx !== -1 ? cashEntries[idx] : editingEntry),
      id: idx !== -1 ? cashEntries[idx].id : editingEntry.id || generateId(),
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

    const actualAmount = Number(form.elements.actualAmount.value || 0);
    if (actualAmount > 0) {
      setEntryActualAmount(cashEntries[cashEntries.length - months], actualAmount);
    }
  }

  const action = editingEntry ? "update" : "save";
  saveSetting(keys.entries, cashEntries);
  saveSetting(keys.entryActuals, entryActuals);
  setEditingEntry(null);
  if (dialog) {
    dialog.returnValue = action;
    dialog.close(action);
  }
  renderAll();
}

let editingInstallmentIndex = null;

function setupEventListeners() {
  // Navigation
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activateView(button.dataset.view);
    });
  });

  // Theme toggle
  on("themeToggle", "click", toggleTheme);

  // Deficit banner shortcut
  on("deficitBannerAction", "click", () => {
    activateView("deficits");
  });

  // Export / Import / Reset / Undo
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
      archivedEntries: clone(archivedEntries)
    });

    resetStateToDefault();
    updateUndoResetVisibility();
    renderAll();
  });

  on("undoReset", "click", () => {
    const backup = readResetBackup();
    if (!backup) return;

    updateStateFromBackup(backup);
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

    localStorage.removeItem(keys.resetBackup);
    updateUndoResetVisibility();
    renderAll();
  });

  // Income / Expense Add Buttons
  on("addIncome", "click", () => openEntryDialog("income"));
  on("addEntry", "click", () => openEntryDialog("expense"));

  const entryForm = document.getElementById("entryForm");
  if (entryForm) {
    if (entryForm.elements && entryForm.elements.creditType) {
      entryForm.elements.creditType.addEventListener("change", syncEntryFormMode);
    }
    entryForm.addEventListener("submit", persistEntryForm);
  }

  // Cashflow Filters & Table Event Delegation
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

  // Salary Controls & Schedule
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

  // Installments
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

  // Accounts List (Single listener registration - duplicate removed!)
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

  // Storage Assets
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

  // Jobs: ASF & IRQ
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

  // Rates tab live updates
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

  // History Event Listeners
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

function initApp() {
  try {
    initTheme();
    materializeLegacySalaryEntries();
    updateUndoResetVisibility();
    setupEventListeners();
    renderAll();
  } catch (e) {
    console.error("Error during app initialization:", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
