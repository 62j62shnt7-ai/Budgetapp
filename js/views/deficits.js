import { DateUtils } from "../utils/date.js";
import { money, escapeHtml } from "../utils/formatters.js";
import {
  forecastEntries,
  getForecastCandidateEntries,
  getRemainingForecastAmount,
  getEntryActualAmount,
  actualizedEntries,
  accountBalances
} from "../store/state.js";
import { calculateForecast, groupByMonth } from "./dashboard.js";

export function getForecastDeficitMonths() {
  return calculateForecast(forecastEntries()).filter((item) => item.balance < 0);
}

export function getOverdueItems() {
  const today = DateUtils.todayString();
  return getForecastCandidateEntries()
    .filter((entry) => entry.date && entry.date < today)
    .map((entry) => {
      const isExpense = entry.type === "expense";
      const remaining = isExpense ? getRemainingForecastAmount(entry) : Number(entry.amount || 0);
      const settled = isExpense ? remaining <= 0 : getEntryActualAmount(entry) > 0;
      return { entry, remaining, settled, daysOverdue: DateUtils.daysBetween(entry.date, today) };
    })
    .filter((item) => !item.settled)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function getActualMovement(entry) {
  const actualAmount = getEntryActualAmount(entry);
  if (!actualAmount) return 0;
  return entry.type === "income" ? actualAmount : -actualAmount;
}

export function getActualDeficitMonths() {
  const today = DateUtils.todayString();
  const realized = actualizedEntries().filter((entry) => entry.date && entry.date <= today);
  const months = groupByMonth(realized, getActualMovement);
  const ordered = Object.keys(months).sort();
  const totalOpeningBalance = Object.values(accountBalances).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  let running = totalOpeningBalance;
  const balances = [];
  ordered.forEach((month) => {
    running += months[month];
    balances.push({ month, balance: running, net: months[month] });
  });
  return balances.filter((item) => item.balance < 0);
}

export function getDeficitSummary() {
  return {
    forecastMonths: getForecastDeficitMonths(),
    overdueItems: getOverdueItems(),
    actualMonths: getActualDeficitMonths()
  };
}

export function renderDeficitBanner(summary) {
  const banner = document.getElementById("deficitBanner");
  if (!banner) return;
  const { forecastMonths, overdueItems, actualMonths } = summary;
  const hasAny = forecastMonths.length || overdueItems.length || actualMonths.length;

  if (!hasAny) {
    banner.hidden = true;
    return;
  }

  const parts = [];
  if (forecastMonths.length) parts.push(`${forecastMonths.length} month${forecastMonths.length === 1 ? "" : "s"} projected to go negative`);
  if (overdueItems.length) parts.push(`${overdueItems.length} item${overdueItems.length === 1 ? "" : "s"} overdue`);
  if (actualMonths.length) parts.push(`${actualMonths.length} past month${actualMonths.length === 1 ? "" : "s"} with an actual shortfall`);

  banner.hidden = false;
  const summaryEl = document.getElementById("deficitBannerSummary");
  if (summaryEl) summaryEl.textContent = parts.join(" · ");
}

export function renderDeficits(summary) {
  const { forecastMonths, overdueItems, actualMonths } = summary;

  const fcEl = document.getElementById("deficitForecastCount");
  if (fcEl) fcEl.textContent = String(forecastMonths.length);

  const odEl = document.getElementById("deficitOverdueCount");
  if (odEl) odEl.textContent = String(overdueItems.length);

  const acEl = document.getElementById("deficitActualCount");
  if (acEl) acEl.textContent = String(actualMonths.length);

  const forecastList = document.getElementById("deficitForecastList");
  if (forecastList) {
    forecastList.innerHTML = forecastMonths.length
      ? forecastMonths
          .map(
            (item) => `
              <div class="list-row danger-row">
                <span>${escapeHtml(item.month)}</span>
                <strong>${escapeHtml(money(item.balance))}</strong>
              </div>
            `
          )
          .join("")
      : `<div class="list-row success-row"><span>No forecasted deficit</span><strong>Balance stays positive</strong></div>`;
  }

  const overdueList = document.getElementById("deficitOverdueList");
  if (overdueList) {
    overdueList.innerHTML = overdueItems.length
      ? overdueItems
          .map(
            (item) => `
              <div class="list-row danger-row deficit-row">
                <span>
                  <strong>${escapeHtml(item.entry.category)}</strong><br>
                  <small>Due ${escapeHtml(item.entry.date)}</small>
                </span>
                <div class="deficit-meta">
                  <span class="overdue-pill">${item.daysOverdue}d overdue</span>
                  <strong>${escapeHtml(money(item.remaining))}</strong>
                </div>
              </div>
            `
          )
          .join("")
      : `<div class="list-row success-row"><span>Nothing overdue</span><strong>All settled</strong></div>`;
  }

  const actualList = document.getElementById("deficitActualList");
  if (actualList) {
    actualList.innerHTML = actualMonths.length
      ? actualMonths
          .map(
            (item) => `
              <div class="list-row danger-row">
                <span>${escapeHtml(item.month)}</span>
                <strong>${escapeHtml(money(item.balance))}</strong>
              </div>
            `
          )
          .join("")
      : `<div class="list-row success-row"><span>No actual shortfall on record</span><strong>Realized balance stayed positive</strong></div>`;
  }
}
