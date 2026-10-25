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
  if (!entry) return 0;
  const id = entry.id || '';
  let rawValue = entryActuals[id];
  if ((rawValue === undefined || rawValue === null) && entry.id) {
    const legacyId = `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || 'cash'}`;
    rawValue = entryActuals[legacyId];
  }
  // Fallback for legacy installment index keys (e.g. installment-id-0)
  if ((rawValue === undefined || rawValue === null) && id.startsWith('installment-')) {
    const parts = id.split('-');
    if (parts.length >= 4) {
      // id is installment-{instId}-{year}-{month}
      const instId = parts.slice(1, parts.length - 2).join('-');
      const yStr = parts[parts.length - 2];
      const mStr = parts[parts.length - 1];
      const escapedId = instId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const legacyPattern = new RegExp(`^installment-${escapedId}-(\\d+)$`);
      for (const [key, val] of Object.entries(entryActuals || {})) {
        const match = key.match(legacyPattern);
        if (match && val !== undefined && val !== null) {
          // If installment has note/occurrence matching this year and month
          const legacyIdx = parseInt(match[1], 10);
          if (entry.note && (entry.note.includes(`(${legacyIdx + 1}/`) || entry.note.includes(`(${legacyIdx}/`))) {
            rawValue = val;
            break;
          }
          if (entry.date && (entry.date.startsWith(`${yStr}-${mStr}`) || entry.date.startsWith(`${yStr}-${mStr.padStart(2, '0')}`))) {
            rawValue = val;
            break;
          }
        }
      }
    }
  }
  if (rawValue !== undefined && rawValue !== null) {
    return Math.round((Number(rawValue) || 0) * 100) / 100;
  }
  if (entry.actualAmount !== undefined && entry.actualAmount !== null) {
    return Math.round((Number(entry.actualAmount) || 0) * 100) / 100;
  }
  return 0;
}

// --- Helper: resolve actual date ---
export function getEntryActualDate(
  entry: CashEntry,
  entryActualDates: Record<string, string>
): string {
  if (!entry) return DateUtils.todayString();
  if (entry.draws && Array.isArray(entry.draws) && entry.draws.length > 0) {
    const validDates = entry.draws.map((d) => d.date).filter(Boolean).sort();
    if (validDates.length > 0) return validDates[validDates.length - 1];
  }
  const id = entry.id || '';
  if (entryActualDates && entryActualDates[id]) return entryActualDates[id];
  if (entry.actualDate) return entry.actualDate;
  return entry.date || DateUtils.todayString();
}

// --- Partial tracking (matches legacy isPartialTracked exactly) ---
export function isPartialTracked(entry: CashEntry): boolean {
  if (!entry) return false;
  if (entry.type === 'expense') return true;
  if (entry.source === 'loan') return true;
  const cat = (entry.category || '').toLowerCase();
  if (cat.includes('loan') || cat.includes('job')) return true;
  const src = (entry.source || '').toLowerCase();
  if (src.includes('job') || src.includes('loan')) return true;
  const tag = (entry.tag || '').toLowerCase();
  if (tag.includes('part-time') || tag.includes('job') || tag.includes('loan')) return true;
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

// --- isLoanInflow ---
export function isLoanInflow(entry: CashEntry): boolean {
  if (!entry || entry.type !== 'income') return false;
  if (entry.loanId) return true;
  const src = (entry.source || '').toLowerCase();
  const cat = (entry.category || '').toLowerCase();
  const tag = (entry.tag || '').toLowerCase();
  return src.includes('loan') || cat.includes('loan') || tag.includes('loan');
}

// --- isOngoingEntry (matches legacy) ---
export function isOngoingEntry(
  entry: CashEntry,
  entryActuals: Record<string, number>
): boolean {
  if (!entry) return false;
  if (entry.isClosed) return false;
  if (entry.keepOngoing) return true;
  if ((entry.splitCount && entry.splitCount > 1) || (entry.plannedSplits && entry.plannedSplits.length > 1) || Boolean(entry.parentEntryId)) return true;
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

// --- findLinkedLoanRepayment ---
export function findLinkedLoanRepayment(
  inflowEntry: CashEntry,
  entries: CashEntry[],
  installments: Installment[]
): { type: 'single'; target: CashEntry } | { type: 'installment'; target: Installment } | null {
  if (!inflowEntry || inflowEntry.type !== 'income') return null;

  // 1. Check by explicit loanId
  if (inflowEntry.loanId) {
    const singleRepayment = entries.find(
      (e) => e.id !== inflowEntry.id && (e.loanId === inflowEntry.loanId || e.id === inflowEntry.loanId) && e.type === 'expense'
    );
    if (singleRepayment) {
      return { type: 'single', target: singleRepayment };
    }
    const installmentRepayment = installments.find(
      (inst) => inst.loanId === inflowEntry.loanId || inst.id === inflowEntry.loanId
    );
    if (installmentRepayment) {
      return { type: 'installment', target: installmentRepayment };
    }
  }

  // 2. Check if inflowEntry.id is referenced as loanId
  const singleByInflowId = entries.find(
    (e) => e.id !== inflowEntry.id && e.loanId === inflowEntry.id && e.type === 'expense'
  );
  if (singleByInflowId) {
    return { type: 'single', target: singleByInflowId };
  }
  const instByInflowId = installments.find(
    (inst) => inst.loanId === inflowEntry.id
  );
  if (instByInflowId) {
    return { type: 'installment', target: instByInflowId };
  }

  // 3. Fallback check by name matching
  const inflowCat = (inflowEntry.category || '').trim();
  const cleanLoanName = inflowCat
    .replace(/^(loan\s*inflow|bridge\s*loan|loan)\s*:\s*/i, '')
    .trim()
    .toLowerCase();

  if (cleanLoanName) {
    const singleRepayment = entries.find((e) => {
      if (e.type !== 'expense' || e.id === inflowEntry.id) return false;
      const cat = (e.category || '').toLowerCase();
      return (
        cat === `loan repayment: ${cleanLoanName}` ||
        cat === `${cleanLoanName} repayment` ||
        (cat.includes('repayment') && cat.includes(cleanLoanName)) ||
        (cat.includes('loan') && cat.includes(cleanLoanName))
      );
    });
    if (singleRepayment) {
      return { type: 'single', target: singleRepayment };
    }

    const installmentRepayment = installments.find((inst) => {
      const name = (inst.name || '').toLowerCase();
      return (
        name === `loan repayment: ${cleanLoanName}` ||
        name === `${cleanLoanName} repayment` ||
        (name.includes('repayment') && name.includes(cleanLoanName)) ||
        (name.includes('loan') && name.includes(cleanLoanName))
      );
    });
    if (installmentRepayment) {
      return { type: 'installment', target: installmentRepayment };
    }
  }

  return null;
}

export interface LoanRepaymentScaleResult {
  scaledAmount: number;
  currentAmount: number;
  months?: number;
  isScaleUp: boolean;
  baseDisbursement: number;
  baseRepaymentTotal: number;
  ratio: number;
}

// --- calculateLoanRepaymentScale ---
export function calculateLoanRepaymentScale(
  inflowEntry: CashEntry,
  linked: { type: 'single'; target: CashEntry } | { type: 'installment'; target: Installment },
  totalDrawn: number
): LoanRepaymentScaleResult | null {
  const baseDisbursement = Number(inflowEntry.initialAmount || inflowEntry.amount || 0);
  if (baseDisbursement <= 0 || totalDrawn < 0) return null;

  const isSingle = linked.type === 'single';
  const currentRepAmount = Number(linked.target.amount || 0);
  let baseRepaymentTotal = 0;
  let months = 1;

  if (isSingle) {
    const storedInitial = Number(linked.target.initialAmount || 0);
    baseRepaymentTotal = storedInitial > 0 ? storedInitial : Math.max(currentRepAmount, baseDisbursement);
  } else {
    months = Math.max(1, Number(linked.target.totalMonths || linked.target.remainingMonths || 1));
    const storedInitial = Number(linked.target.initialAmount || 0);
    baseRepaymentTotal = storedInitial > 0 ? storedInitial * months : Math.max(currentRepAmount * months, baseDisbursement);
  }

  // Ratio of drawn funds to original planned facility
  const ratio = totalDrawn / baseDisbursement;
  const scaledTotal = Math.round(baseRepaymentTotal * ratio * 100) / 100;
  const scaledAmount = isSingle
    ? scaledTotal
    : (totalDrawn === 0 ? 0 : Math.max(1, Math.round((scaledTotal / months) * 100) / 100));

  if (scaledAmount === currentRepAmount) {
    return null;
  }

  return {
    scaledAmount,
    currentAmount: currentRepAmount,
    months: isSingle ? undefined : months,
    isScaleUp: totalDrawn > baseDisbursement,
    baseDisbursement,
    baseRepaymentTotal,
    ratio,
  };
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

// --- expandEntrySplits ---
export function expandEntrySplits(
  entry: CashEntry,
  remainingAmount: number,
  effStartDate: string,
  entryActuals: Record<string, number>,
  today: string
): CashEntry[] {
  if (remainingAmount <= 0) {
    // If the entry has keepOngoing enabled, maintain an ongoing anchor row at 0 remaining
    // so the user can continue logging further spending/draws without the entry vanishing.
    if (entry.keepOngoing && !entry.isClosed) {
      return [{
        ...entry,
        id: entry.id,
        parentEntryId: entry.id,
        date: effStartDate < today ? today : effStartDate,
        amount: 0,
        splitIndex: 1,
        splitTotalCount: 1,
        isSplitGhost: false,
      }];
    }
    return [];
  }

  // Mode A: Custom plannedSplits array
  if (Array.isArray(entry.plannedSplits) && entry.plannedSplits.length > 1) {
    const sortedSplits = [...entry.plannedSplits].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let unallocatedActual = getEntryActualAmount(entry, entryActuals);

    const activeSlices: { date: string; amount: number; note?: string }[] = [];
    for (let i = 0; i < sortedSplits.length; i++) {
      const split = sortedSplits[i];
      const plannedAmt = Number(split.amount || 0);
      if (unallocatedActual >= plannedAmt) {
        unallocatedActual -= plannedAmt;
        continue;
      }
      const unspent = Math.round((plannedAmt - unallocatedActual) * 100) / 100;
      unallocatedActual = 0;
      if (unspent > 0) {
        let sDate = split.date || effStartDate;
        if (sDate < today) {
          sDate = today;
        }
        activeSlices.push({
          date: sDate,
          amount: unspent,
          note: split.note,
        });
      }
    }

    // Align sum with remainingAmount if user-defined tranches didn't sum to original or due to rounding
    const sumActive = activeSlices.reduce((sum, s) => sum + s.amount, 0);
    if (activeSlices.length > 0 && Math.abs(sumActive - remainingAmount) > 0.001) {
      const diff = Math.round((remainingAmount - sumActive) * 100) / 100;
      activeSlices[activeSlices.length - 1].amount = Math.max(0.01, Math.round((activeSlices[activeSlices.length - 1].amount + diff) * 100) / 100);
    }

    if (activeSlices.length === 0) {
      activeSlices.push({ date: effStartDate, amount: remainingAmount });
    }

    const totalCount = activeSlices.length;
    return activeSlices.map((slice, idx) => ({
      ...entry,
      id: idx === 0 ? entry.id : `${entry.id}::split-${idx + 1}`,
      parentEntryId: entry.id,
      date: slice.date,
      amount: slice.amount,
      splitIndex: idx + 1,
      splitTotalCount: totalCount,
      isSplitGhost: idx > 0,
      note: slice.note || entry.note,
    }));
  }

  // Mode B: Even splitCount
  const count = Math.min(30, Math.max(1, Math.floor(entry.splitCount || 1)));
  if (count <= 1) {
    return [{ ...entry, date: effStartDate, amount: remainingAmount }];
  }

  const interval = Math.max(1, Math.floor(entry.splitIntervalDays || 7));
  const baseAmount = Math.floor((remainingAmount / count) * 100) / 100;
  const remainder = Math.round((remainingAmount - baseAmount * count) * 100) / 100;

  const result: CashEntry[] = [];
  for (let i = 0; i < count; i++) {
    const sDate = DateUtils.addDays(effStartDate, i * interval);
    const sAmount = i === count - 1 ? Math.round((baseAmount + remainder) * 100) / 100 : baseAmount;
    result.push({
      ...entry,
      id: i === 0 ? entry.id : `${entry.id}::split-${i + 1}`,
      parentEntryId: entry.id,
      date: sDate,
      amount: sAmount,
      splitIndex: i + 1,
      splitTotalCount: count,
      isSplitGhost: i > 0,
    });
  }

  return result;
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
  return all.filter((entry) => !deletedSet.has(getEntryId(entry)) && !entry.excludeFromForecast);
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
  entryActuals: Record<string, number>,
  today: string = DateUtils.todayString()
): CashEntry[] {
  const candidates = getForecastCandidateEntries(
    cashEntries,
    installmentEntries,
    creditDueEntries,
    deletedForecasts
  );

  return candidates
    .filter((entry) => !entry.isClosed)
    .filter((entry) => {
      // Exclude individual credit card purchases — they're rolled into creditDueEntries
      if (isCreditCardExpense(entry)) return false;

      const hasSplits = Boolean((entry.splitCount && entry.splitCount > 1) || (entry.plannedSplits && entry.plannedSplits.length > 1));
      // Unclosed split entry with remaining balance: keep regardless of date so upcoming/future splits remain visible
      if (hasSplits && !entry.isClosed && getRemainingForecastAmount(entry, entryActuals) > 0) {
        return true;
      }
      // Unclosed partial-tracked entry with remaining balance: keep regardless of date
      if (isPartialTracked(entry) && !entry.isClosed && getRemainingForecastAmount(entry, entryActuals) > 0) {
        return true;
      }
      // Explicitly keep ongoing entries visible regardless of date or whether remaining is 0
      if (entry.keepOngoing && !entry.isClosed) {
        return true;
      }
      // Uncollected non-partial income (e.g. salary, freelance, refunds): keep when unclosed and remaining > 0 regardless of date
      if (entry.type === 'income' && !entry.isClosed && getEntryActualAmount(entry, entryActuals) <= 0) {
        return true;
      }
      return !entry.date || entry.date >= today;
    })
    .filter((entry) => {
      if (entry.keepOngoing && !entry.isClosed) return true;
      const hasSplits = Boolean((entry.splitCount && entry.splitCount > 1) || (entry.plannedSplits && entry.plannedSplits.length > 1));
      if (hasSplits && !entry.isClosed) {
        return getRemainingForecastAmount(entry, entryActuals) > 0;
      }
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
      // Single-dated contractual obligations: credit card settlements, installments,
      // and loan repayments. Their due date must be preserved when unpaid so they surface
      // as OVERDUE in deficits and dashboard views instead of sliding to today.
      const isStrictObligation =
        entry.id.startsWith('credit-settlement-') ||
        entry.id.startsWith('installment-') ||
        isCreditDueLumpSum(entry) ||
        entry.tag === 'Loan Repayment' ||
        entry.subcategory === 'Loan Repayment' ||
        Boolean(entry.loanId && entry.type === 'expense');

      // Uncollected overdue income: scheduled due date must be preserved when uncollected/unpaid
      // so it surfaces as OVERDUE in deficits, dashboard, and cashflow views instead of sliding to today.
      const isOverdueIncome = entry.type === 'income' && !isOngoingEntry(entry, entryActuals);

      // Regular ongoing flexible expenses: undrawn/unspent carry forward to today (or if keepOngoing is active)
      if (!isStrictObligation && !isOverdueIncome && (isPartialTracked(entry) || entry.keepOngoing) && effDate && effDate < today) {
        effDate = today;
      }
      const remaining = isPartialTracked(entry) && getEntryActualAmount(entry, entryActuals) > 0
        ? getRemainingForecastAmount(entry, entryActuals)
        : Number(entry.amount || 0);

      // Check if entry has split configuration and should expand into multiple tranches
      const hasSplits =
        !isStrictObligation &&
        !isOverdueIncome &&
        ((entry.splitCount && entry.splitCount > 1) || (entry.plannedSplits && entry.plannedSplits.length > 1));

      if (hasSplits) {
        return expandEntrySplits(entry, remaining, effDate, entryActuals, today);
      }

      if (entry.keepOngoing && !entry.isClosed && getRemainingForecastAmount(entry, entryActuals) <= 0) {
        return [{ ...entry, date: effDate, amount: 0 }];
      }

      if (isPartialTracked(entry) && getEntryActualAmount(entry, entryActuals) > 0) {
        return [{ ...entry, date: effDate, amount: remaining }];
      }
      return [{ ...entry, date: effDate }];
    })
    .flat();
}

// ==========================================================================
// ==========================================================================
// calculateForecast
// Uses groupByMonth-based aggregation, opening balance from accounts.
// The returned window is exactly [currentYm, currentYm + monthsAhead - 1] — see
// the clamp below for why months outside it are deliberately excluded.
// ==========================================================================
export function calculateForecast(
  entries: CashEntry[],
  openingCashBalance: number,
  monthsAhead: number = 12,
  startYm?: string
): MonthlyForecast[] {
  const months = groupByMonth(entries, (entry) => Number(entry.amount || 0) * (entry.type === 'income' ? 1 : -1));
  const currentYm = startYm || DateUtils.currentYearMonth();

  // Ensure all horizon months exist
  for (let i = 0; i < monthsAhead; i += 1) {
    const ym = DateUtils.addMonths(currentYm, i);
    if (!(ym in months)) months[ym] = 0;
  }

  // Clamp strictly to [currentYm, currentYm + monthsAhead - 1]. Entries beyond the
  // requested horizon (long installments, far-future recurring rows) and months
  // already in the past must not extend the forecast, otherwise `forecast.length`
  // disagrees with `monthsAhead` and every consumer that derives a date range,
  // label, or "across N months" statement from it reports the wrong window.
  const firstYm = currentYm;
  const lastYm = DateUtils.addMonths(currentYm, Math.max(0, monthsAhead - 1));

  // Prior-month overdue entries (e.g. overdue settlements or installments from before firstYm)
  // must be included in firstYm expenses so the monthly balance projection matches daily deficit cashflow
  const priorNet = Object.keys(months)
    .filter((month) => month < firstYm)
    .reduce((sum, m) => sum + (months[m] || 0), 0);

  const priorIncome = entries
    .filter((e) => {
      const m = DateUtils.getMonthKey(e.date);
      return m && m < firstYm && e.type === 'income';
    })
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const priorExpense = entries
    .filter((e) => {
      const m = DateUtils.getMonthKey(e.date);
      return m && m < firstYm && e.type === 'expense';
    })
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const ordered = Object.keys(months)
    .filter((month) => month >= firstYm && month <= lastYm)
    .sort();
  let running = openingCashBalance;
  const result: MonthlyForecast[] = [];

  ordered.forEach((month, idx) => {
    const net = months[month] + (idx === 0 ? priorNet : 0);
    // Split into income/expense for the MonthlyForecast interface
    const currentMonthIncome = entries
      .filter((e) => DateUtils.getMonthKey(e.date) === month && e.type === 'income')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const currentMonthExpense = entries
      .filter((e) => DateUtils.getMonthKey(e.date) === month && e.type === 'expense')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const income = currentMonthIncome + (idx === 0 ? priorIncome : 0);
    const expense = currentMonthExpense + (idx === 0 ? priorExpense : 0);

    running = Math.round((running + net) * 100) / 100;
    result.push({
      month,
      balance: running,
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      net: Math.round(net * 100) / 100,
    });
  });

  return result;
}

export function getLowestProjectedBalance(
  entries: CashEntry[],
  openingBalance: number
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
      const days = DateUtils.daysBetween(p.startDate, lastStepDate);
      p.daysInDeficit = Math.max(1, days);
    }
  });

  return periods;
}

/**
 * Calculates authoritative running bank balance across the active forecast sequence.
 * Immune to UI filters so that filtering by category, account, or month does not distort
 * the true chronological account balance projection after each entry.
 */
export function calculateForecastRunningBalances(
  forecastEntriesArr: CashEntry[],
  openingBalance: number
): Map<string, number> {
  const sorted = [...forecastEntriesArr]
    .filter((e) => e.date)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
      return 0;
    });

  let running = openingBalance;
  const map = new Map<string, number>();

  sorted.forEach((entry) => {
    const isCardSwipe = isCreditCardExpense(entry);
    const delta = isCardSwipe ? 0 : Number(entry.amount || 0) * (entry.type === 'income' ? 1 : -1);
    running = Math.round((running + delta) * 100) / 100;
    if (entry.id) {
      map.set(entry.id, running);
    }
    const legacyId = getEntryId(entry);
    if (legacyId) {
      map.set(legacyId, running);
    }
  });

  return map;
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
  entryActuals: Record<string, number>,
  today: string = DateUtils.todayString()
): {
  forecastMonths: MonthlyForecast[];
  deficitPeriods: DailyDeficitPeriod[];
  overdueItems: OverdueItem[];
} {
  const forecastMonths = calculateForecast(forecastEntriesArr, openingBalance).filter(
    (item) => item.balance < 0
  );
  const deficitPeriods = getDeficitPeriods(forecastEntriesArr, openingBalance);
  const overdueItems = candidateEntries
    .filter((entry) => entry.date && entry.date < today)
    .filter((entry) => !isCreditCardExpense(entry))
    .filter((entry) => !isOngoingEntry(entry, entryActuals))
    .map((entry) => {
      const partial = isPartialTracked(entry);
      const remaining = partial ? getRemainingForecastAmount(entry, entryActuals) : Number(entry.amount || 0);
      const settled = Boolean(entry.isClosed) || (partial ? remaining <= 0 : getEntryActualAmount(entry, entryActuals) > 0);
      return { entry, remaining, settled, daysOverdue: DateUtils.daysBetween(entry.date, today) };
    })
    .filter((item) => !item.settled && item.remaining > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { forecastMonths, deficitPeriods, overdueItems };
}
