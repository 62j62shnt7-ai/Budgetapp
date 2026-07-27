import { money, escapeHtml } from "../utils/formatters.js";
import { storageAssets, ratesData } from "../store/state.js";

export function storageValue(item) {
  return (Number(item.quantity) || 0) * (Number(item.rate) || 0);
}

export function renderStorageTotals() {
  const total = storageAssets.reduce((sum, item) => sum + storageValue(item), 0);
  const summaryEl = document.getElementById("storageSummary");
  if (summaryEl) summaryEl.textContent = money(total);
  const totalEl = document.getElementById("storageTotal");
  if (totalEl) totalEl.textContent = money(total);
}

export function rateSourceOptionsHtml(selected) {
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

export function renderStorage() {
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
