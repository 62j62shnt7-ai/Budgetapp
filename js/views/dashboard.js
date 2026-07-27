import { DateUtils } from "../utils/date.js";
import { money, escapeHtml } from "../utils/formatters.js";
import {
  forecastEntries,
  accountBalances,
  forecastStartMonth,
  storageAssets,
  cashEntries,
  getCreditDueAmount,
  renderDeficitBanner,
  renderDeficits,
  getDeficitSummary
} from "../store/state.js";
import { storageValue } from "./storage.js";

export function renderDashboard() {
  const entries = forecastEntries();
  const forecast = calculateForecast(entries);

  const actualCashNow = calculateActualCash();
  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const currentCash = forecast.length ? forecast[forecast.length - 1].balance : totalOpeningBalance;
  const lowPoint = forecast.reduce(
    (lowest, item) => (item.balance < lowest.balance ? item : lowest),
    { month: forecastStartMonth, balance: totalOpeningBalance }
  );
  const storageTotal = storageAssets.reduce((sum, item) => sum + storageValue(item), 0);
  const cibCredit = getCreditDueAmount("cib");
  const hsbcCredit = getCreditDueAmount("hsbc");
  const totalCreditDue = cibCredit + hsbcCredit;
  const manualCreditExpenses = cashEntries.filter(
    (entry) => entry.type === "expense" && ["cib", "hsbc"].includes((entry.creditType || "").toLowerCase())
  );
  const manualCibCredit = manualCreditExpenses
    .filter((entry) => (entry.creditType || "").toLowerCase() === "cib")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const manualHsbcCredit = manualCreditExpenses
    .filter((entry) => (entry.creditType || "").toLowerCase() === "hsbc")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const cashBalanceEl = document.getElementById("cashBalance");
  if (cashBalanceEl) cashBalanceEl.textContent = money(currentCash);

  const actualCashEl = document.getElementById("actualCashToday");
  if (actualCashEl) actualCashEl.textContent = money(actualCashNow);

  const cibCreditEl = document.getElementById("cibCreditDue");
  if (cibCreditEl) cibCreditEl.textContent = money(cibCredit + manualCibCredit);

  const hsbcCreditEl = document.getElementById("hsbcCreditDue");
  if (hsbcCreditEl) hsbcCreditEl.textContent = money(hsbcCredit + manualHsbcCredit);

  const creditDueTotalEl = document.getElementById("creditDueTotal");
  if (creditDueTotalEl) creditDueTotalEl.textContent = money(totalCreditDue + manualCibCredit + manualHsbcCredit);

  const storageTotalEl = document.getElementById("storageTotal");
  if (storageTotalEl) storageTotalEl.textContent = money(storageTotal);

  const forecastLowEl = document.getElementById("forecastLow");
  if (forecastLowEl) forecastLowEl.textContent = money(lowPoint.balance);

  const forecastLowDateEl = document.getElementById("forecastLowDate");
  if (forecastLowDateEl) forecastLowDateEl.textContent = `Lowest in ${escapeHtml(lowPoint.month)}`;

  const isNegative = forecast.some((item) => item.balance < 0);
  const cashflowStatusEl = document.getElementById("cashflowStatus");
  if (cashflowStatusEl) {
    cashflowStatusEl.textContent = isNegative ? "Risk" : "OK";
    cashflowStatusEl.classList.toggle("danger-text", isNegative);
  }

  const cashflowNoteEl = document.getElementById("cashflowStatusNote");
  if (cashflowNoteEl) {
    cashflowNoteEl.textContent = isNegative ? "Expenses exceed cash in forecast" : "Cash stays above zero";
  }

  renderBalanceChart(forecast);
  renderExpenseMix(entries);
  renderWarnings(forecast);

  const deficitSummary = getDeficitSummary();
  renderDeficitBanner(deficitSummary);
  renderDeficits(deficitSummary);
}

export function calculateActualCash() {
  return Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
}

export function getForecastMovement(entry) {
  const amount = Number(entry.amount || 0);
  return entry.type === "income" ? amount : -amount;
}

export function calculateForecast(entries) {
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

export function groupByMonth(source, amountFn) {
  return source.reduce((groups, entry) => {
    const month = DateUtils.getMonthKey(entry.date);
    if (month) {
      groups[month] = (groups[month] || 0) + amountFn(entry);
    }
    return groups;
  }, {});
}

export function renderBalanceChart(forecast) {
  const chart = document.getElementById("balanceChart");
  if (!chart) return;
  const maxAbs = Math.max(...forecast.map((item) => Math.abs(item.balance)), 1);
  chart.innerHTML = forecast
    .map((item) => {
      const height = Math.max(6, Math.round((Math.abs(item.balance) / maxAbs) * 230));
      const label = DateUtils.getShortMonth(item.month);
      const tone = item.balance < 0 ? "negative" : "";
      return `<div class="bar-wrap" title="${escapeHtml(item.month)}: ${escapeHtml(money(item.balance))}"><div class="bar ${tone}" style="height:${height}px"></div><span>${escapeHtml(label)}</span></div>`;
    })
    .join("");

  const rangeEl = document.getElementById("forecastRange");
  if (rangeEl) {
    const range = forecast.length ? `${forecast[0].month} to ${forecast[forecast.length - 1].month}` : "No entries";
    rangeEl.textContent = range;
  }
}

export function renderWarnings(forecast) {
  const riskyMonths = forecast.filter((item) => item.balance < 0);
  const list = document.getElementById("forecastWarnings");
  if (!list) return;

  if (!riskyMonths.length) {
    list.innerHTML = `<div class="list-row success-row"><span>Cashflow is covered</span><strong>No deficit</strong></div>`;
    return;
  }

  list.innerHTML = riskyMonths
    .slice(0, 5)
    .map((item) => `<div class="list-row danger-row"><span>${escapeHtml(item.month)}</span><strong>${escapeHtml(money(item.balance))}</strong></div>`)
    .join("");
}

export function renderExpenseMix(entries) {
  const totals = entries
    .filter((entry) => entry.type === "expense")
    .reduce((groups, entry) => {
      const cat = entry.category || "Uncategorized";
      groups[cat] = (groups[cat] || 0) + entry.amount;
      return groups;
    }, {});

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, total]) => `<div class="list-row"><span>${escapeHtml(category)}</span><strong>${escapeHtml(money(total))}</strong></div>`)
    .join("");

  const el = document.getElementById("expenseList");
  if (el) el.innerHTML = rows || `<div class="list-row"><span>No expenses yet</span><strong>0</strong></div>`;
}
