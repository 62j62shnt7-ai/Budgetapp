import { DateUtils } from "../utils/date.js";
import { money, escapeHtml } from "../utils/formatters.js";
import {
  actualizedEntries,
  getEntryActualAmount,
  archivedEntries,
  entryActuals,
  saveSetting,
  cashEntries,
  deletedForecasts,
  getEntryId
} from "../store/state.js";
import { keys } from "../store/storage.js";
import { isEditableEntry, findEntryById } from "./cashflow.js";

export function findHistoryEntry(entryId) {
  const active = findEntryById(entryId);
  if (active) return { entry: active, isArchived: false };
  const archivedIndex = archivedEntries.findIndex((e) => getEntryId(e) === entryId);
  if (archivedIndex !== -1) return { entry: archivedEntries[archivedIndex], isArchived: true, archivedIndex };
  return { entry: null, isArchived: false, archivedIndex: -1 };
}

export function renderHistory() {
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

export function commitHistoryActualInput(input) {
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

export function permanentlyRemoveEntry(entry) {
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
