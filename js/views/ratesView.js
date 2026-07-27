import { ratesData } from "../store/state.js";
import { escapeHtml } from "../utils/formatters.js";

export function renderRates() {
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

export function openManualCurrencyEdit() {
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

export function openManualGoldEdit() {
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
