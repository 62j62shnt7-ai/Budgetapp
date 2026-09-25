// ==========================================================================
// Forecast Engine & Deficit Detection
// Faithful port of legacy getDeficitPeriods(), forecastEntries(),
// getForecastCandidateEntries(), and calculateForecast()
// ==========================================================================
import { DateUtils } from './dateUtils';
import { isCreditCardExpense, isCreditDueLumpSum } from './creditCards';
import type { CashEntry, DeficitPeriod, DeficitSummary, Installment, MonthlyForecast } from '../types';

// --- Helper: resolve actual amount from entryActuals map (matches legacy getEntryActualAmount) ---
export function getEntryActualAmount(
  entry: CashEntry,
  entryActuals: Record<string, number>
): number {
  const id = entry.id || '';
  let rawValue = entryActuals[id];
  if ((rawValue === undefined || rawValue === null) && entry.id) {
    const legacyId = `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || 'cash'}`;
    rawValue = entryActuals[legacyId];
  }
  if (rawValue !== undefined && rawValue !== null) {
    return Math.round(Number(rawValue) || 0);
  }
  if (entry.actualAmount !== undefined && entry.actualAmount !== null) {
    return Math.round(Number(entry.actualAmount) || 0);
  }
  return 0;
}

// --- Helper: resolve actual date ---
export function getEntryActualDate(
  entry: CashEntry,
  entryActualDates: Record<string, string>
): string {
  if (!entry) return DateUtils.todayString();
  if ((entry as any).actualDate) return (entry as any).actualDate;
  const id = entry.id || '';
  if (entryActualDates && entryActualDates[id]) return entryActualDates[id];
  if (entry.draws && Array.isArray(entry.draws) && entry.draws.length > 0) {
    const lastDraw = entry.draws[entry.draws.length - 1];
    return lastDraw ? lastDraw.date : (entry.date || DateUtils.todayString());
  }
  return entry.date || DateUtils.todayString();
}

// --- Partial tracking (matches legacy isPartialTracked exactly) ---
export function isPartialTracked(entry: CashEntry): boolean {
  if (!entry) return false;
  if (entry.type === 'expense') return true;
  if (entry.source === 'loan') return true;
  const cat = (entry.category || '').toLowerCase();
  if (cat.includes('loan')) return true;
  return false;
}

// --- Remaining forecast amount (matches legacy getRemainingForecastAmount) ---
export function getRemainingForecastAmount(
  entry: CashEntry,
  entryActuals: Record<string, number>
): number {
  if (entry && entry.isClosed) return 0;
  const actualAmount = getEntryActualAmount(entry, entryActuals);
  if (isPartialTracked(entry) && actualAmount > 0) {
    return Math.max(0, Number(entry.amount || 0) - actualAmount);
  }
  return Number(entry.amount || 0);
}

// --- getEntryId (matches legacy) ---
export function getEntryId(entry: CashEntry): string {
  return entry.id || `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || 'cash'}`;
}

// --- isLoanInflow (matches legacy) ---
export function isLoanInflow(entry: CashEntry): boolean {
  if (!entry) return false;
  const isLoan = entry.source === 'loan' || (entry.category && /loan/i.test(entry.category));
  return Boolean(isLoan && entry.type === 'income');
}

// --- isOngoingEntry (matches legacy) ---
export function isOngoingEntry(
  entry: CashEntry,
  entryActuals: Record<string, number>
): boolean {
  if (!entry) return false;
  if (entry.isClosed) return false;
  if ((entry as any).keepOngoing) return true;
  if (isLoanInflow(entry)) return true;
  if (
    isPartialTracked(entry) &&
    getEntryActualAmount(entry, entryActuals) > 0 &&
    getRemainingForecastAmount(entry, entryActuals) > 0
  ) {
    return true;
  }
  return false;
}

// --- findLinkedLoanRepayment (matches legacy lines 6974-7014) ---
export function findLinkedLoanRepayment(
  inflowEntry: CashEntry,
  entries: CashEntry[],
  installments: Installment[]
): { type: 'single'; target: CashEntry } | { type: 'installment'; target: Installment } | null {
  if (!inflowEntry) return null;

  // 1. Check by explicit loanId
  if (inflowEntry.loanId) {
    const singleRepayment = entries.find(
      (e) => e.loanId === inflowEntry.loanId && e.type === 'expense'
    );
    if (singleRepayment) {
      return { type: 'single', target: singleRepayment };
    }
    const installmentRepayment = installments.find(
      (inst) => inst.loanId === inflowEntry.loanId
    );
    if (installmentRepayment) {
      return { type: 'installment', target: installmentRepayment };
    }
  }

  // 2. Fallback check by name: "Loan Inflow: <Name>" <-> "Loan Repayment: <Name>"
  const inflowCat = (inflowEntry.category || '').trim();
  if (inflowCat.toLowerCase().startsWith('loan inflow:')) {
    const loanName = inflowCat.replace(/^loan inflow:\s*/i, '').trim();
    if (loanName) {
      const expectedRepaymentCat = `loan repayment: ${loanName}`.toLowerCase();
      const singleRepayment = entries.find(
        (e) => (e.category || '').trim().toLowerCase() === expectedRepaymentCat && e.type === 'expense'
      );
      if (singleRepayment) {
        return { type: 'single', target: singleRepayment };
      }
      const installmentRepayment = installments.find(
        (inst) =>
          (inst.name || '').trim().toLowerCase() === expectedRepaymentCat ||
          (inst.name || '').trim().toLowerCase() === `${loanName} repayment`.toLowerCase()
      );
      if (installmentRepayment) {
        return { type: 'installment', target: installmentRepayment };
      }
    }
  }

  return null;
}

// --- calculateLoanRepaymentScale (matches legacy lines 7035-7071) ---
export function calculateLoanRepaymentScale(
  inflowEntry: CashEntry,
  linked: { type: 'single'; target: CashEntry } | { type: 'installment'; target: Installment },
  totalDrawn: number
): { scaledAmount: number; currentAmount: number; months?: number } | null {
  const plannedLoan = Number(inflowEntry.amount || 0);
  if (plannedLoan <= 0 || totalDrawn <= 0) return null;

  const isSingle = linked.type === 'single';
  const currentRepAmount = Number(linked.target.amount || 0);
  let baselineTotal = 0;
  let months = 1;

  if (isSingle) {
    const storedInitial = Number(linked.target.initialAmount || 0);
    if (storedInitial > 0) {
      baselineTotal = storedInitial;
    } else {
      baselineTotal = Math.max(currentRepAmount, plannedLoan);
    }
  } else {
    months = Number(linked.target.totalMonths || linked.target.remainingMonths || 1);
    const storedInitial = Number(linked.target.initialAmount || 0);
    if (storedInitial > 0) {
      baselineTotal = storedInitial * months;
    } else {
      baselineTotal = Math.max(currentRepAmount * months, plannedLoan);
    }
  }

  const markup = Math.max(1, baselineTotal / plannedLoan);
  const scaledTotal = Math.round(totalDrawn * markup);
  const scaledAmount = isSingle ? scaledTotal : Math.max(1, Math.round(scaledTotal / months));

  if (scaledAmount === currentRepAmount) {
    return null;
  }

  return { scaledAmount, currentAmount: currentRepAmount, months: isSingle ? undefined : months };
}

// --- groupByMonth (matches legacy) ---
export function groupByMonth(
  source: CashEntry[],
  amountFn: (entry: CashEntry) => number
): Record<string, number> {
  return source.reduce((groups: Record<string, number>, entry) => {
    const month = DateUtils.getMonthKey(entry.date);
    if (month) {
      groups[month] = (groups[month] || 0) + amountFn(entry);
    }
    return groups;
  }, {});
}

// ==========================================================================
// getForecastCandidateEntries — matches legacy exactly
// Excludes manually deleted forecasts and lump-sum credit entries from
// the raw candidate list.
// ==========================================================================
export function getForecastCandidateEntries(
  cashEntries: CashEntry[],
  installmentEntries: CashEntry[],
  creditDueEntries: CashEntry[],
  deletedForecasts: string[]
): CashEntry[] {
  const nonLumpCashEntries = cashEntries.filter((entry) => !isCreditDueLumpSum(entry));
  const all = [...nonLumpCashEntries, ...installmentEntries, ...creditDueEntries];
  const deletedSet = new Set(deletedForecasts || []);
  return all.filter((entry) => !deletedSet.has(getEntryId(entry)));
}

// ==========================================================================
// forecastEntries — matches legacy forecastEntries() exactly
// Filters out:
//   1. Individual credit card purchases (consolidated into settlement entries)
//   2. Fully actualized entries (already in History)
//   3. Partial-tracked entries with zero remaining
// ==========================================================================
export function getActiveForecastEntries(
  cashEntries: CashEntry[],
  installmentEntries: CashEntry[],
  creditDueEntries: CashEntry[],
  deletedForecasts: string[],
  entryActuals: Record<string, number>
): CashEntry[] {
  const today = DateUtils.todayString();
  const candidates = getForecastCandidateEntries(
    cashEntries,
    installmentEntries,
    creditDueEntries,
    deletedForecasts
  );

  return candidates
    .filter((entry) => {
      // Exclude individual credit card purchases — they're rolled into creditDueEntries
      if (isCreditCardExpense(entry)) return false;

      // Unclosed partial-tracked entry with remaining balance: keep regardless of date
      if (isPartialTracked(entry) && !entry.isClosed && getRemainingForecastAmount(entry, entryActuals) > 0) {
        return true;
      }
      return !entry.date || entry.date >= today;
    })
    .filter((entry) => {
      if (isPartialTracked(entry)) {
        const actualAmount = getEntryActualAmount(entry, entryActuals);
        if (actualAmount > 0) {
          return getRemainingForecastAmount(entry, entryActuals) > 0;
        }
      }
      return getEntryActualAmount(entry, entryActuals) <= 0;
    })
    .map((entry) => {
      let effDate = entry.date;
      // Carry forward undrawn/unspent to today
      if (isPartialTracked(entry) && effDate && effDate < today && getRemainingForecastAmount(entry, entryActuals) > 0) {
        effDate = today;
      }
      if (isPartialTracked(entry) && getEntryActualAmount(entry, entryActuals) > 0) {
        return { ...entry, date: effDate, amount: getRemainingForecastAmount(entry, entryActuals) };
      }
      return { ...entry, date: effDate };
    });
}

// ==========================================================================
// calculateForecast — matches legacy exactly
// Uses groupByMonth-based aggregation, opening balance from accounts
// ==========================================================================
export function calculateForecast(
  entries: CashEntry[],
  openingCashBalance: number,
  monthsAhead: number = 12
): MonthlyForecast[] {
  const months = groupByMonth(entries, (entry) => Number(entry.amount || 0) * (entry.type === 'income' ? 1 : -1));
  const currentYm = DateUtils.currentYearMonth();

  // Ensure all horizon months exist
  for (let i = 0; i < monthsAhead; i += 1) {
    const ym = DateUtils.addMonths(currentYm, i);
    if (!(ym in months)) months[ym] = 0;
  }

  const ordered = Object.keys(months).sort();
  let running = openingCashBalance;
  const result: MonthlyForecast[] = [];

  ordered.forEach((month) => {
    const net = months[month];
    // Split into income/expense for the MonthlyForecast interface
    const income = entries
      .filter((e) => DateUtils.getMonthKey(e.date) === month && e.type === 'income')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const expense = entries
      .filter((e) => DateUtils.getMonthKey(e.date) === month && e.type === 'expense')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    running = Math.round((running + net) * 100) / 100;
    result.push({ month, balance: running, income, expense, net });
  });

  return result;
}

export function getLowestProjectedBalance(
  entries: CashEntry[],
  openingBalance: number
): { balance: number; date: string | null } {
  const sorted = [...entries]
    .filter((entry) => entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  let running = openingBalance;
  let lowest = openingBalance;
  let lowestDate: string | null = null;

  sorted.forEach((entry) => {
    running += Number(entry.amount || 0) * (entry.type === 'income' ? 1 : -1);
    if (running < lowest) {
      lowest = running;
      lowestDate = entry.date;
    }
  });

  return { balance: Math.round(lowest * 100) / 100, date: lowestDate };
}

export function getLowestProjectedBalanceAfterSpend(
  entries: CashEntry[],
  openingBalance: number,
  spendDate: string,
  spendAmount: number
): { balance: number; date: string | null } {
  const sorted = [...entries]
    .filter((entry) => entry.date)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
      return 0;
    });
  let running = openingBalance;
  let lowest = openingBalance;
  let lowestDate: string | null = null;
  let spendApplied = false;

  sorted.forEach((entry, index) => {
    if (!spendApplied && entry.date > spendDate) {
      running -= spendAmount;
      spendApplied = true;
      if (running < lowest) {
        lowest = running;
        lowestDate = spendDate;
      }
    }
    running += Number(entry.amount || 0) * (entry.type === 'income' ? 1 : -1);
    const nextEntry = sorted[index + 1];
    if (
      entry.date === spendDate &&
      !spendApplied &&
      (!nextEntry || nextEntry.date !== spendDate)
    ) {
      running -= spendAmount;
      spendApplied = true;
      if (running < lowest) {
        lowest = running;
        lowestDate = spendDate;
      }
    }
    if (running < lowest) {
      lowest = running;
      lowestDate = entry.date;
    }
  });

  if (!spendApplied) {
    running -= spendAmount;
    if (running < lowest) {
      lowest = running;
      lowestDate = spendDate;
    }
  }

  return { balance: Math.round(lowest * 100) / 100, date: lowestDate };
}

export function simulateSpend(
  entries: CashEntry[],
  openingBalance: number,
  spendDate: string,
  spendAmount: number
): {
  lowestBalance: number;
  lowestDate: string | null;
  triggerDate: string | null;
  triggerBalance: number | null;
} {
  const simulatedEntry: CashEntry = {
    id: `simulation-${spendDate}`,
    date: spendDate,
    amount: spendAmount,
    type: 'expense',
    category: 'Simulated spending',
    account: 'simulation',
    source: 'simulation',
  };
  const periods = getDeficitPeriods([...entries, simulatedEntry], openingBalance);
  const firstDeficit = periods[0];
  const lowest = getLowestProjectedBalanceAfterSpend(
    entries,
    openingBalance,
    spendDate,
    spendAmount
  );

  return {
    lowestBalance: lowest.balance,
    lowestDate: lowest.date,
    triggerDate: firstDeficit?.startDate || null,
    triggerBalance: firstDeficit ? firstDeficit.startAmount : null,
  };
}

// ==========================================================================
// detectDeficits — MONTHLY level (quick summary)
// ==========================================================================
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

// ==========================================================================
// getDeficitPeriods — DAY-LEVEL precision (matches legacy exactly)
// Walks entry-by-entry, records the exact date balance turns negative,
// which entry triggers it, when it recovers, and by which entry.
// ==========================================================================
export interface DailyDeficitPeriod {
  startDate: string;
  startAmount: number;
  initialTrigger: string;
  initialEntry: CashEntry;
  lowestBalance: number;
  lowestDate: string;
  lowestEntry: CashEntry;
  resolvedDate: string | null;
  resolvedBy: string | null;
  resolvedEntry?: CashEntry;
  isResolved: boolean;
  daysInDeficit: number;
  steps: DailyDeficitStep[];
}

export interface DailyDeficitStep {
  date: string;
  type: string;
  category: string;
  amount: number;
  balance: number;
  delta: number;
  source?: string;
  account?: string;
  entry?: CashEntry;
  entryId: string;
  isRecoveryStep?: boolean;
}

export function getDeficitPeriods(
  entries: CashEntry[],
  openingBalance: number
): DailyDeficitPeriod[] {
  const sorted = [...entries]
    .filter((e) => e.date)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
      return 0;
    });

  let running = openingBalance;
  const periods: DailyDeficitPeriod[] = [];
  let currentPeriod: DailyDeficitPeriod | null = null;

  sorted.forEach((entry) => {
    const delta = Number(entry.amount || 0) * (entry.type === 'income' ? 1 : -1);
    running = Math.round((running + delta) * 100) / 100;

    if (running < -0.005) {
      if (!currentPeriod) {
        currentPeriod = {
          startDate: entry.date,
          startAmount: running,
          initialTrigger: entry.category || (entry.type === 'income' ? 'Income adjustment' : 'Expense'),
          initialEntry: entry,
          lowestBalance: running,
          lowestDate: entry.date,
          lowestEntry: entry,
          resolvedDate: null,
          resolvedBy: null,
          isResolved: false,
          daysInDeficit: 0,
          steps: [
            {
              date: entry.date,
              type: entry.type,
              category: entry.category || 'Expense',
              amount: Number(entry.amount || 0),
              balance: running,
              delta,
              source: entry.source,
              account: entry.account,
              entry,
              entryId: getEntryId(entry),
            },
          ],
        };
        periods.push(currentPeriod);
      } else {
        if (running < currentPeriod.lowestBalance) {
          currentPeriod.lowestBalance = running;
          currentPeriod.lowestDate = entry.date;
          currentPeriod.lowestEntry = entry;
        }
        currentPeriod.steps.push({
          date: entry.date,
          type: entry.type,
          category: entry.category || 'Expense',
          amount: Number(entry.amount || 0),
          balance: running,
          delta,
          source: entry.source,
          account: entry.account,
          entry,
          entryId: getEntryId(entry),
        });
      }
    } else {
      if (currentPeriod) {
        currentPeriod.isResolved = true;
        currentPeriod.resolvedDate = entry.date;
        currentPeriod.resolvedBy = entry.category || (entry.type === 'income' ? 'Income' : 'Adjustment');
        currentPeriod.resolvedEntry = entry;
        currentPeriod.daysInDeficit = DateUtils.daysBetween(currentPeriod.startDate, currentPeriod.resolvedDate);
        currentPeriod.steps.push({
          date: entry.date,
          type: entry.type,
          category: entry.category || 'Income',
          amount: Number(entry.amount || 0),
          balance: running,
          delta,
          isRecoveryStep: true,
          entryId: getEntryId(entry),
        });
        currentPeriod = null;
      }
    }
  });

  // For unresolved periods, calculate days up to last step
  periods.forEach((p) => {
    if (!p.isResolved) {
      const lastStepDate = p.steps.length ? p.steps[p.steps.length - 1].date : p.startDate;
      p.daysInDeficit = DateUtils.daysBetween(p.startDate, lastStepDate);
    }
  });

  return periods;
}

// ==========================================================================
// getDeficitSummary — full legacy-compatible summary with overdue items
// ==========================================================================
export interface OverdueItem {
  entry: CashEntry;
  remaining: number;
  settled: boolean;
  daysOverdue: number;
}

export function getDeficitSummary(
  forecastEntriesArr: CashEntry[],
  candidateEntries: CashEntry[],
  openingBalance: number,
  entryActuals: Record<string, number>
): {
  forecastMonths: MonthlyForecast[];
  deficitPeriods: DailyDeficitPeriod[];
  overdueItems: OverdueItem[];
} {
  const forecastMonths = calculateForecast(forecastEntriesArr, openingBalance).filter(
    (item) => item.balance < 0
  );
  const deficitPeriods = getDeficitPeriods(forecastEntriesArr, openingBalance);
  const today = DateUtils.todayString();
  const overdueItems = candidateEntries
    .filter((entry) => entry.date && entry.date < today)
    .filter((entry) => !isOngoingEntry(entry, entryActuals))
    .map((entry) => {
      const partial = isPartialTracked(entry);
      const remaining = partial ? getRemainingForecastAmount(entry, entryActuals) : Number(entry.amount || 0);
      const settled = Boolean(entry.isClosed) || (partial ? remaining <= 0 : getEntryActualAmount(entry, entryActuals) > 0);
      return { entry, remaining, settled, daysOverdue: DateUtils.daysBetween(entry.date, today) };
    })
    .filter((item) => !item.settled)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { forecastMonths, deficitPeriods, overdueItems };
}
