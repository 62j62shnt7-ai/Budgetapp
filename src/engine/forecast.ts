// ==========================================================================
// Forecast Engine & Deficit Detection
// ==========================================================================
import { DateUtils } from './dateUtils';
import type { CashEntry, DeficitPeriod, DeficitSummary, MonthlyForecast } from '../types';

export function isPartialTracked(entry: CashEntry): boolean {
  if (!entry) return false;
  if (entry.type === 'expense') return true;
  if (entry.source === 'loan') return true;
  const cat = (entry.category || '').toLowerCase();
  if (cat.includes('loan')) return true;
  return false;
}

export function getRemainingForecastAmount(entry: CashEntry, actualAmount: number = 0): number {
  if (entry && (entry as any).isClosed) return 0;
  if (isPartialTracked(entry) && actualAmount > 0) {
    return Math.max(0, Number(entry.amount || 0) - actualAmount);
  }
  return Number(entry.amount || 0);
}

export function calculateForecast(
  entries: CashEntry[],
  openingCashBalance: number,
  monthsAhead: number = 12
): MonthlyForecast[] {
  const currentYm = DateUtils.currentYearMonth();
  const monthMap: Record<string, { income: number; expense: number }> = {};

  // Initialize horizon months
  for (let i = 0; i < monthsAhead; i += 1) {
    const ym = DateUtils.addMonths(currentYm, i);
    monthMap[ym] = { income: 0, expense: 0 };
  }

  // Aggregate candidate entries
  entries.forEach((entry) => {
    const ym = DateUtils.getMonthKey(entry.date);
    if (!ym || !monthMap[ym]) return;

    const amt = Number(entry.amount) || 0;
    if (entry.type === 'income') {
      monthMap[ym].income += amt;
    } else {
      monthMap[ym].expense += amt;
    }
  });

  const sortedMonths = Object.keys(monthMap).sort();
  let runningBalance = openingCashBalance;
  const result: MonthlyForecast[] = [];

  sortedMonths.forEach((month) => {
    const data = monthMap[month];
    const net = data.income - data.expense;
    runningBalance = Math.round((runningBalance + net) * 100) / 100;
    result.push({
      month,
      balance: runningBalance,
      income: data.income,
      expense: data.expense,
      net,
    });
  });

  return result;
}

export function detectDeficits(forecast: MonthlyForecast[]): DeficitSummary {
  const deficitPeriods: DeficitPeriod[] = [];
  let currentPeriod: DeficitPeriod | null = null;
  let worstDeficit = 0;

  forecast.forEach((f) => {
    if (f.balance < 0) {
      const deficitAmt = Math.abs(f.balance);
      if (deficitAmt > worstDeficit) worstDeficit = deficitAmt;

      if (!currentPeriod) {
        currentPeriod = {
          startDate: `${f.month}-01`,
          endDate: `${f.month}-28`,
          maxDeficit: deficitAmt,
          isResolved: false,
          shortfallDays: 30,
        };
      } else {
        currentPeriod.endDate = `${f.month}-28`;
        currentPeriod.maxDeficit = Math.max(currentPeriod.maxDeficit, deficitAmt);
        currentPeriod.shortfallDays += 30;
      }
    } else if (currentPeriod) {
      currentPeriod.isResolved = true;
      deficitPeriods.push(currentPeriod);
      currentPeriod = null;
    }
  });

  if (currentPeriod) {
    deficitPeriods.push(currentPeriod);
  }

  return {
    hasDeficit: deficitPeriods.length > 0,
    totalPeriods: deficitPeriods.length,
    worstDeficit,
    deficitPeriods,
    forecastMonths: forecast.length,
  };
}
