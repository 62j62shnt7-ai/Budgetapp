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
  const id = entry.id || '';
  if (id.startsWith('credit-settlement-')) return false;
  if (entry.source === 'recurring credit' || (entry as any).isCreditSettlement) return false;
  const cat = (entry.category || '').toLowerCase();
  if (cat.includes('credit due')) return false;
  const t = (entry.creditType || '').toLowerCase();
  const acc = (entry.account || '').toLowerCase();
  const src = (entry.source || '').toLowerCase();
  const tag = (entry.tag || '').toLowerCase();

  if (src === 'credit card' || src === 'credit-card' || src === 'credit_card' || src === 'card') return true;
  if (t === 'cib_card' || t === 'hsbc_card' || t === 'cib-card' || t === 'hsbc-card' || t === 'cib_credit' || t === 'hsbc_credit') return true;
  if ((t === 'cib' || t === 'hsbc' || acc === 'cib' || acc === 'hsbc') && !cat.includes('credit due')) return true;
  if (acc.includes('cib') && (acc.includes('credit') || acc.includes('card'))) return true;
  if (acc.includes('hsbc') && (acc.includes('credit') || acc.includes('card'))) return true;
  if (acc === 'cib credit' || acc === 'cib_credit' || acc === 'cib-credit' || acc === 'hsbc credit' || acc === 'hsbc_credit' || acc === 'hsbc-credit') return true;
  if (tag.includes('credit card') || tag.includes('credit-card') || tag.includes('credit_card') || tag.includes('card spend')) return true;
  return false;
}

export function isCreditDueLumpSum(entry: CashEntry): boolean {
  if (!entry || entry.type !== 'expense') return false;
  if (isCreditCardExpense(entry)) return false;
  const id = entry.id || '';
  if (id.startsWith('credit-settlement-')) return true;
  const t = (entry.creditType || '').toLowerCase();
  const cat = (entry.category || '').toLowerCase();
  const acc = (entry.account || '').toLowerCase();
  if (t === 'cib' || t === 'hsbc') return true;
  if (cat.includes('credit due')) return true;
  if ((acc.includes('cib') || acc.includes('hsbc')) && cat.includes('credit')) return true;
  return false;
}

export function isLumpCreditDueForAccount(entry: CashEntry, accountKey: string): boolean {
  if (!entry || entry.type !== 'expense') return false;
  if (isCreditCardExpense(entry)) return false;
  const id = entry.id || '';
  const target = (accountKey || '').toLowerCase();
  if (id.startsWith('credit-settlement-')) {
    const parts = id.split('-');
    return parts[2] === target;
  }
  const t = (entry.creditType || '').toLowerCase();
  const cat = (entry.category || '').toLowerCase();
  const acc = (entry.account || '').toLowerCase();
  if (t === target) return true;
  if (cat.includes('credit due') && (acc === target || acc.includes(target) || cat.includes(target))) return true;
  if (acc.includes(target) && cat.includes('credit')) return true;
  return false;
}

export function isCardExpenseForAccount(entry: CashEntry, accountKey: string): boolean {
  if (!isCreditCardExpense(entry)) return false;
  const t = (entry.creditType || '').toLowerCase();
  const acc = (entry.account || '').toLowerCase();
  const cat = (entry.category || '').toLowerCase();
  const tag = (entry.tag || '').toLowerCase();
  const target = (accountKey || '').toLowerCase();
  if (target === 'cib') {
    return t.includes('cib') || acc.includes('cib') || (!t.includes('hsbc') && !acc.includes('hsbc') && !cat.includes('hsbc') && !tag.includes('hsbc'));
  }
  if (target === 'hsbc') {
    return t.includes('hsbc') || acc.includes('hsbc') || cat.includes('hsbc') || tag.includes('hsbc');
  }
  return false;
}

export function getCreditSettlementDate(
  entry: CashEntry,
  creditSettlementOverrides?: Record<string, { amount?: number; date?: string }>
): string {
  if (!entry) return '';
  if (isCreditCardExpense(entry)) {
    const accKey = (entry.creditType || entry.account || '').toLowerCase().includes('hsbc') ? 'hsbc' : 'cib';
    const defaultDate = calculateCreditSettlementDate(entry.date, accKey);
    const sMonth = defaultDate ? DateUtils.getMonthKey(defaultDate) : '';
    if (sMonth && creditSettlementOverrides) {
      const override = creditSettlementOverrides[`credit-settlement-${accKey}-${sMonth}`];
      if (override && override.date) {
        return override.date;
      }
    }
    return defaultDate;
  }
  if (entry.settlementDate) return entry.settlementDate;
  return entry.date || '';
}

export function getCreditSettlementMonth(entry: CashEntry): string {
  if (entry.settlementDate) {
    return DateUtils.getMonthKey(entry.settlementDate);
  }
  const date = calculateCreditSettlementDate(entry.date, entry.creditType || entry.account);
  return DateUtils.getMonthKey(date);
}

export function buildCreditDueEntries(params: {
  accounts: Record<string, { name: string; balance?: number; maturityDay?: number }>;
  creditDues: Record<string, Record<string, number>>;
  cashEntries: CashEntry[];
  archivedEntries?: CashEntry[];
  entryActuals: Record<string, number>;
  creditSettlementOverrides?: Record<string, { amount?: number; date?: string }>;
}): CashEntry[] {
  const {
    accounts = {},
    creditDues = {},
    cashEntries = [],
    archivedEntries = [],
    entryActuals = {},
    creditSettlementOverrides = {},
  } = params;

  const entries: CashEntry[] = [];
  const targetAccounts = ['cib', 'hsbc'];

  const allExpenses = [...cashEntries, ...(archivedEntries || [])].filter(
    (entry) => entry && entry.type === 'expense'
  );

  const getActual = (entry: CashEntry): number => {
    if (entryActuals[entry.id] !== undefined) return Number(entryActuals[entry.id]) || 0;
    return Number(entry.actualAmount) || 0;
  };

  targetAccounts.forEach((accountKey) => {
    const matchingBalanceKey =
      Object.keys(accounts || {}).find((k) => k.toLowerCase() === accountKey) || accountKey;
    const acc = accounts[matchingBalanceKey] || {
      name: accountKey === 'cib' ? 'CIB' : 'HSBC',
      maturityDay: accountKey === 'cib' ? 15 : 30,
    };
    const monthData = creditDues[accountKey] || creditDues[matchingBalanceKey] || {};

    const settlementMonths = new Set(Object.keys(monthData));

    Object.keys(entryActuals || {}).forEach((k) => {
      const prefix = `credit-settlement-${accountKey}-`;
      if (k.startsWith(prefix) && Number(entryActuals[k]) > 0) {
        settlementMonths.add(k.slice(prefix.length));
      }
    });

    allExpenses.forEach((entry) => {
      if (isCardExpenseForAccount(entry, accountKey)) {
        const sMonth = getCreditSettlementMonth(entry);
        if (sMonth) settlementMonths.add(sMonth);
      } else if (isLumpCreditDueForAccount(entry, accountKey)) {
        const sMonth = DateUtils.getMonthKey(entry.date);
        if (sMonth) settlementMonths.add(sMonth);
      }
    });

    Object.keys(creditSettlementOverrides || {}).forEach((k) => {
      const prefix = `credit-settlement-${accountKey}-`;
      if (k.startsWith(prefix)) {
        settlementMonths.add(k.slice(prefix.length));
      }
    });

    const orderedSettlementMonths = [...settlementMonths].sort();

    orderedSettlementMonths.forEach((monthKey) => {
      const baseDue = Number(monthData[monthKey] || 0);

      const manualLumpEntries = allExpenses.filter(
        (entry) =>
          isLumpCreditDueForAccount(entry, accountKey) &&
          DateUtils.getMonthKey(entry.date) === monthKey &&
          !entry.id.startsWith('credit-settlement-')
      );
      const lumpAmount = manualLumpEntries.reduce((sum, e) => {
        const act = getActual(e);
        return sum + (act > 0 ? act : Number(e.amount || 0));
      }, 0);

      const cardExpenses = allExpenses.filter(
        (entry) => isCardExpenseForAccount(entry, accountKey) && getCreditSettlementMonth(entry) === monthKey
      );
      const cardSpendTotal = cardExpenses.reduce((sum, e) => {
        const act = getActual(e);
        return sum + (act > 0 ? act : Number(e.amount || 0));
      }, 0);

      const settlementId = `credit-settlement-${accountKey}-${monthKey}`;
      const lumpActual = manualLumpEntries.reduce((sum, e) => sum + getActual(e), 0);
      const actualPaid = Math.max(Number(entryActuals[settlementId] || 0), lumpActual);
      const calculatedPlannedDue = baseDue + lumpAmount + cardSpendTotal;

      const override = creditSettlementOverrides[settlementId];
      const hasPlannedOverride =
        override &&
        override.amount !== undefined &&
        override.amount !== null &&
        !isNaN(Number(override.amount));
      const totalPlannedDue = hasPlannedOverride
        ? Math.max(Number(override.amount), calculatedPlannedDue)
        : calculatedPlannedDue;

      if (totalPlannedDue <= 0 && actualPaid <= 0 && calculatedPlannedDue <= 0) return;

      const [year, month] = DateUtils.parseYearMonth(monthKey);
      const lastDay = DateUtils.getLastDayOfMonth(year, month);
      const maturityDay = Number(acc.maturityDay) || (accountKey === 'cib' ? 15 : lastDay);
      const day = Math.min(maturityDay, lastDay);
      const defaultSettlementDate = DateUtils.formatDate(year, month, day);

      let settlementDate = defaultSettlementDate;
      if (override && override.date) {
        settlementDate = override.date;
      }

      entries.push({
        id: settlementId,
        date: settlementDate,
        category: `${acc.name} Credit Due`,
        account: matchingBalanceKey,
        type: 'expense',
        amount:
          totalPlannedDue > 0
            ? totalPlannedDue
            : calculatedPlannedDue > 0
            ? calculatedPlannedDue
            : actualPaid,
        actualAmount: actualPaid,
        source: 'recurring credit',
        tag: 'Credit',
      });
    });
  });

  return entries;
}
