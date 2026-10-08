// ==========================================================================
// Credit Card Settlement Account Funding & Deficit Alert Engine
// ==========================================================================
import { DateUtils } from './dateUtils';
import { getEntryActualAmount } from './forecast';
import type { AccountBalance, CashEntry, CreditDueFundingAlert, CreditDueFundingStatus } from '../types';

export interface CheckCreditDueFundingParams {
  creditDueEntries: CashEntry[];
  accounts: Record<string, AccountBalance>;
  entryActuals: Record<string, number>;
  today?: string;
  proximityDays?: number;
  candidateEntries?: CashEntry[];
}

export function resolveSettlementAccountKey(
  entry: CashEntry,
  accounts: Record<string, AccountBalance>
): string {
  const acc = (entry.account || '').toLowerCase().trim();
  if (accounts[acc]) return acc;

  const id = (entry.id || '').toLowerCase();
  const cat = (entry.category || '').toLowerCase();
  const credType = (entry.creditType || '').toLowerCase();

  if (acc.includes('hsbc') || id.includes('hsbc') || cat.includes('hsbc') || credType.includes('hsbc')) {
    if (accounts['hsbc']) return 'hsbc';
  }

  if (acc.includes('cib') || id.includes('cib') || cat.includes('cib') || credType.includes('cib')) {
    if (accounts['cib']) return 'cib';
  }

  // Find any account key that partially matches or default to first available or 'cib'
  const matchedKey = Object.keys(accounts).find((k) => k.toLowerCase() === acc);
  if (matchedKey) return matchedKey;

  return accounts['cib'] ? 'cib' : (Object.keys(accounts)[0] || 'cib');
}

export function resolveCardDisplayName(entry: CashEntry): string {
  const cat = (entry.category || '').trim();
  const id = (entry.id || '').toLowerCase();
  if (cat.toLowerCase().includes('hsbc') || id.includes('hsbc')) {
    return 'HSBC Credit Card';
  }
  if (cat.toLowerCase().includes('cib') || id.includes('cib')) {
    return 'CIB Credit Card';
  }
  return cat || 'Credit Card';
}

export function getCreditDueFundingAlerts(
  params: CheckCreditDueFundingParams
): CreditDueFundingAlert[] {
  const {
    creditDueEntries = [],
    accounts = {},
    entryActuals = {},
    today = DateUtils.todayString(),
    proximityDays = 7,
    candidateEntries = [],
  } = params;

  const alerts: CreditDueFundingAlert[] = [];

  creditDueEntries.forEach((entry) => {
    if (!entry) return;

    const accountKey = resolveSettlementAccountKey(entry, accounts);
    const accObj = accounts[accountKey];
    const accountName = accObj?.name || accountKey.toUpperCase();
    const accountBalance = Math.round((Number(accObj?.balance || 0)) * 100) / 100;

    const totalPlannedDue = Math.round((Number(entry.amount || 0)) * 100) / 100;
    const actualPaid = getEntryActualAmount(entry, entryActuals);
    const isClosed = Boolean(entry.isClosed);
    const remainingDue = isClosed ? 0 : Math.round(Math.max(0, totalPlannedDue - actualPaid) * 100) / 100;

    const settlementDate = entry.date || today;
    const daysUntilSettlement = DateUtils.daysBetween(today, settlementDate);

    // Today's liquid shortfall (capped at remainingDue)
    const currentShortfall = Math.max(0, remainingDue - Math.max(0, accountBalance));

    // Projected account solvency up to settlement date
    let projectedAccountBalance: number | undefined;
    let projectedShortfall: number | undefined;
    let lowestProjectedBalance: number | undefined;
    let isFundedByProjectedIncome = false;

    if (candidateEntries.length > 0 && settlementDate >= today) {
      // Filter entries affecting this account between today and settlementDate (excluding this settlement entry)
      const relevantEntries = candidateEntries
        .filter((cand) => {
          if (!cand || cand.id === entry.id || !cand.date) return false;
          const candAcc = (cand.account || '').toLowerCase().trim();
          return candAcc === accountKey && cand.date >= today && cand.date <= settlementDate;
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      let runningBal = accountBalance;
      let minBal = accountBalance;

      for (const item of relevantEntries) {
        const amt = Number(item.amount || 0);
        if (item.type === 'income') {
          runningBal += amt;
        } else if (item.type === 'expense') {
          runningBal -= amt;
        }
        if (runningBal < minBal) {
          minBal = runningBal;
        }
      }

      projectedAccountBalance = Math.round(runningBal);
      // The settlement account can only contribute its positive balance towards this settlement due.
      // A negative balance (prior overdraft) cannot inflate the credit card due beyond remainingDue.
      const availableProjected = Math.max(0, projectedAccountBalance);
      projectedShortfall = Math.max(0, remainingDue - availableProjected);
      lowestProjectedBalance = Math.round(minBal);

      // If the settlement date is in the future or today:
      // An upcoming income covers the due if:
      // 1. Projected account balance at settlement date >= remaining due (projectedShortfall <= 0)
      // 2. The account does not dip into a negative deficit before settlement date (lowestProjectedBalance >= 0)
      if (projectedShortfall <= 0 && lowestProjectedBalance >= 0) {
        isFundedByProjectedIncome = true;
      }
    }

    // Effective shortfall:
    // If the settlement date is upcoming (>= today) and candidate entries were evaluated,
    // use projectedShortfall unless there's an intermediate deficit (lowestProjectedBalance < 0).
    // If overdue (< today), use currentShortfall directly.
    let effectiveShortfall = currentShortfall;
    if (settlementDate >= today && projectedShortfall !== undefined) {
      if (isFundedByProjectedIncome) {
        effectiveShortfall = 0;
      } else {
        effectiveShortfall = Math.min(remainingDue, projectedShortfall);
      }
    }

    let status: CreditDueFundingStatus = 'funded';
    let isAlert = false;

    if (remainingDue <= 0) {
      status = 'settled';
      isAlert = false;
    } else if (effectiveShortfall <= 0) {
      status = 'funded';
      isAlert = false;
    } else {
      if (daysUntilSettlement < 0) {
        status = 'overdue_unfunded';
        isAlert = true;
      } else if (daysUntilSettlement <= 2) {
        status = 'critical_shortfall';
        isAlert = true;
      } else if (daysUntilSettlement <= proximityDays) {
        status = 'approaching_shortfall';
        isAlert = true;
      } else {
        status = 'upcoming_shortfall';
        isAlert = false;
      }
    }

    const shortfall = effectiveShortfall;

    // Determine suggested source account for transferring funds based on PROJECTED balance at settlement date
    let suggestedSourceAccount: CreditDueFundingAlert['suggestedSourceAccount'];
    let canBeCoveredByTransfer = false;
    let maxTransferableAmount = 0;
    let remainingUncoveredShortfall = shortfall;

    if (shortfall > 0) {
      // Calculate total projected liquid cash across all accounts up to settlement date
      // (accounting for all scheduled incomes, expenses, and deficits on any account)
      let totalProjectedLiquidCash = 0;
      if (candidateEntries.length > 0 && settlementDate >= today) {
        for (const [k, acc] of Object.entries(accounts)) {
          let running = Math.round(Number(acc.balance || 0));
          const accEntries = candidateEntries
            .filter((cand) => {
              if (!cand || cand.id === entry.id || !cand.date) return false;
              const candAcc = (cand.account || '').toLowerCase().trim();
              return candAcc === k && cand.date >= today && cand.date <= settlementDate;
            });
          for (const item of accEntries) {
            const amt = Number(item.amount || 0);
            if (item.type === 'income') running += amt;
            else if (item.type === 'expense') running -= amt;
          }
          totalProjectedLiquidCash += Math.round(running);
        }
      } else {
        totalProjectedLiquidCash = Object.values(accounts).reduce(
          (sum, a) => sum + Math.round(Number(a.balance || 0)),
          0
        );
      }

      // For each other account, calculate its projected available balance at settlementDate
      // bearing in mind scheduled expenses and incomes during that period
      const candidateSources = Object.entries(accounts)
        .filter(([key]) => key !== accountKey)
        .map(([key, acc]) => {
          const startingBal = Math.round(Number(acc.balance || 0));
          let projectedBal = startingBal;
          let minInterimBal = startingBal;

          if (candidateEntries.length > 0 && settlementDate >= today) {
            const sourceEntries = candidateEntries
              .filter((cand) => {
                if (!cand || cand.id === entry.id || !cand.date) return false;
                const candAcc = (cand.account || '').toLowerCase().trim();
                return candAcc === key && cand.date >= today && cand.date <= settlementDate;
              })
              .sort((a, b) => a.date.localeCompare(b.date));

            let running = startingBal;
            for (const item of sourceEntries) {
              const amt = Number(item.amount || 0);
              if (item.type === 'income') {
                running += amt;
              } else if (item.type === 'expense') {
                running -= amt;
              }
              if (running < minInterimBal) {
                minInterimBal = running;
              }
            }
            projectedBal = Math.round(running);
          }

          // The transferable amount available at settlementDate is the account's projected balance at settlement date,
          // provided the account does not run into an intermediate deficit (minInterimBal >= 0)
          // and does not exceed the net liquid cash actually available across the budget on settlement date
          const hasIntermediateDeficit = minInterimBal < 0;
          const rawCapacity = hasIntermediateDeficit ? 0 : Math.max(0, projectedBal);
          const transferableCapacity = Math.max(0, Math.min(rawCapacity, totalProjectedLiquidCash));

          return {
            accountKey: key,
            accountName: acc.name || key.toUpperCase(),
            balance: startingBal,
            projectedBalance: projectedBal,
            transferableCapacity,
          };
        })
        .filter((src) => src.transferableCapacity > 0 || src.balance > 0)
        .sort((a, b) => b.transferableCapacity - a.transferableCapacity || b.balance - a.balance);

      if (candidateSources.length > 0) {
        const bestSource = candidateSources[0];
        suggestedSourceAccount = {
          accountKey: bestSource.accountKey,
          accountName: bestSource.accountName,
          balance: bestSource.balance,
          projectedBalance: bestSource.projectedBalance,
        };

        // Transferable amount is calculated based on the settlement date (projected capacity)
        maxTransferableAmount = Math.min(shortfall, bestSource.transferableCapacity);
        remainingUncoveredShortfall = Math.max(0, shortfall - maxTransferableAmount);
        // Can be fully covered if source account's projected capacity at settlement date >= shortfall
        canBeCoveredByTransfer = bestSource.transferableCapacity >= shortfall;
      }
    }

    alerts.push({
      entryId: entry.id,
      cardName: resolveCardDisplayName(entry),
      settlementDate,
      daysUntilSettlement,
      accountKey,
      accountName,
      accountBalance,
      totalPlannedDue,
      remainingDue,
      shortfall,
      status,
      isAlert,
      canBeCoveredByTransfer,
      maxTransferableAmount,
      remainingUncoveredShortfall,
      projectedAccountBalance,
      projectedShortfall,
      isFundedByProjectedIncome,
      lowestProjectedBalance,
      suggestedSourceAccount,
    });
  });

  // Sort alerts: critical alerts first, then approaching, then upcoming shortfalls, funded, settled
  return alerts.sort((a, b) => {
    const priority = (item: CreditDueFundingAlert) => {
      switch (item.status) {
        case 'overdue_unfunded':
          return 1;
        case 'critical_shortfall':
          return 2;
        case 'approaching_shortfall':
          return 3;
        case 'upcoming_shortfall':
          return 4;
        case 'funded':
          return 5;
        case 'settled':
          return 6;
      }
    };
    const priDiff = priority(a) - priority(b);
    if (priDiff !== 0) return priDiff;
    return a.settlementDate.localeCompare(b.settlementDate);
  });
}

export function hasActiveFundingDeficit(alerts: CreditDueFundingAlert[]): boolean {
  return alerts.some((a) => a.isAlert);
}

export function getCriticalFundingAlerts(alerts: CreditDueFundingAlert[]): CreditDueFundingAlert[] {
  return alerts.filter((a) => a.isAlert);
}
