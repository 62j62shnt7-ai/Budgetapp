import { money, usd, escapeHtml } from "../utils/formatters.js";
import { asfJobs, irqJobs } from "../store/state.js";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function renderJobs() {
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
