import { money, escapeHtml } from "../utils/formatters.js";
import { accountBalances, saveSetting } from "../store/state.js";
import { keys } from "../store/storage.js";

export function renderAccounts() {
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

export function focusAccountBalance(accountId) {
  const input = document.querySelector(`[data-account-id="${accountId}"][data-account-field="balance"]`);
  if (input) {
    input.focus();
    input.select();
  }
}
