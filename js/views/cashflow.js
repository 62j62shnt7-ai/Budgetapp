import { DateUtils } from "../utils/date.js";
import { money, escapeHtml } from "../utils/formatters.js";
import {
  forecastEntries,
  openingBalanceEntries,
  getForecastCandidateEntries,
  getEntryActualAmount,
  getRemainingForecastAmount,
  getEntryId,
  salaryPattern,
  salaryAnchorMonth,
  installments,
  forecastStartMonth,
  forecastQuarters,
  syncForecastPeriodSettings,
  monthIndexFromYearMonth,
  groupPhaseForMonthIndex,
  cashEntries,
  deletedForecasts,
  archivedEntries,
  entryActuals,
  saveSetting
} from "../store/state.js";
import { keys } from "../store/storage.js";
import { renderDashboard } from "./dashboard.js";
import { renderHistory } from "./history.js";

export function canDeleteEntry(entry) {
  return !entry.locked && entry.source !== "starting balance";
}

export function isEditableEntry(entry) {
  return !entry.locked;
}

export function renderCashflowSummary() {
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

export function renderEntries() {
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

  // Render table with inputs preserving values if focus active
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

export function syncSalaryPeriodControls() {
  syncForecastPeriodSettings();
  const startInput = document.getElementById("salaryPeriodStart");
  const quartersInput = document.getElementById("salaryPeriodQuarters");
  if (startInput && !startInput.value) startInput.value = forecastStartMonth;
  if (quartersInput && !quartersInput.value) quartersInput.value = String(forecastQuarters);
}

export function renderSalarySchedule() {
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

export function frequencyLabel(frequency) {
  return frequencyLabels[Number(frequency) || 1] || `every ${Number(frequency) || 1} months`;
}

export function renderInstallments() {
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

export function commitEntryActualInput(input) {
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

export function findEntryById(entryId) {
  const fromCash = cashEntries.find((entry) => getEntryId(entry) === entryId);
  if (fromCash) return fromCash;
  return [...openingBalanceEntries(), ...getForecastCandidateEntries()].find((entry) => getEntryId(entry) === entryId) || null;
}
