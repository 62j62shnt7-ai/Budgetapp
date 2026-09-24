// ==========================================================================
// Credit Card Settlement & Cycle Calculation Engine
// ==========================================================================
import { DateUtils } from './dateUtils';
import type { CashEntry } from '../types';

export function calculateCreditSettlementDate(dateStr: string, creditType?: string): string {
  const safeDate = dateStr || DateUtils.todayString();
  const [y, m, d] = DateUtils.parseDate(safeDate);
  const type = (creditType || '').toLowerCase();

  if (type.includes('hsbc')) {
    // HSBC Rule: Spend in month M settles on the last day of following month (M+1)
    let targetYear = y;
    let targetMonth = m + 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
    const lastDay = DateUtils.getLastDayOfMonth(targetYear, targetMonth);
    return DateUtils.formatDate(targetYear, targetMonth, lastDay);
  }

  // CIB Rule: Cycle cutoff is the 15th.
  // Spent <= 15th -> settles 15th of next month (M+1).
  // Spent > 15th -> settles 15th of 2 months later (M+2).
  let targetYear = y;
  let targetMonth = d <= 15 ? m + 1 : m + 2;
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  return DateUtils.formatDate(targetYear, targetMonth, 15);
}

export function getCreditCycleHint(dateStr: string, creditType?: string): string {
  if (!dateStr) return '';
  const [y, m, d] = DateUtils.parseDate(dateStr);
  const type = (creditType || '').toLowerCase();
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });

  if (type.includes('hsbc')) {
    const dueStr = calculateCreditSettlementDate(dateStr, creditType);
    return `HSBC cycle: ${monthName} spending settles end of following month (${DateUtils.formatDisplayDate(dueStr)})`;
  }
  
  const dueStr = calculateCreditSettlementDate(dateStr, creditType);
  if (d <= 15) {
    return `CIB cycle: ${monthName} 1-15 settles on ${DateUtils.formatDisplayDate(dueStr)}`;
  }
  return `CIB cycle: Spent after 15th (${monthName} 16-end) settles on ${DateUtils.formatDisplayDate(dueStr)}`;
}

export function isCreditCardExpense(entry: CashEntry): boolean {
  if (!entry || entry.type !== 'expense') return false;
  const acc = (entry.account || '').toLowerCase();
  const cat = (entry.category || '').toLowerCase();
  const tag = (entry.tag || '').toLowerCase();
  const cType = (entry.creditType || '').toLowerCase();

  return (
    cType === 'cib' ||
    cType === 'hsbc' ||
    acc === 'cib' ||
    acc === 'hsbc' ||
    cat.includes('credit card') ||
    tag.includes('credit card')
  );
}

export function getCreditSettlementMonth(entry: CashEntry): string {
  if (entry.settlementDate) {
    return DateUtils.getMonthKey(entry.settlementDate);
  }
  const date = calculateCreditSettlementDate(entry.date, entry.creditType || entry.account);
  return DateUtils.getMonthKey(date);
}
