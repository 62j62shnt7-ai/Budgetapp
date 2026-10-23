import type {
  CashEntry,
  Installment,
  StorageAsset,
  JobItem,
  JobPayment,
  AccountBalance,
  CreditSettlementOverride,
} from '../types';
import type { AffectedRecordOption } from '../components/Modals/AffectedRecordsModal';
import { formatMoney, DateUtils } from '../engine/dateUtils';
import { formatNativeCurrency } from '../engine/currency';
import { findLinkedLoanRepayment } from '../engine/forecast';
import {
  isCreditCardExpense,
  getCreditSettlementMonth,
} from '../engine/creditCards';

export interface EntryDeleteAffectedData {
  itemDescription: string;
  amountFormatted: string;
  options: AffectedRecordOption[];
}

export type ResolvedLinkedLoanRepayment =
  | { type: 'installment'; target: Installment; id: string; name: string }
  | { type: 'single'; target: CashEntry; id: string; name: string };

// --- Shared installment-occurrence / linked-loan resolution ------------------------
// These are used both when building the "affected records" checkbox list (what the
// user is shown) and by the store's deleteEntry (what actually happens), so the two
// can never drift apart the way they used to (a "Linked Loan" checkbox that appeared
// and did nothing).

export function isInstallmentOccurrenceEntry(
  entry: CashEntry,
  linkedInstallment: Installment | undefined
): boolean {
  return Boolean(
    entry.source === 'installment' ||
      entry.id.startsWith('installment-') ||
      (linkedInstallment && !entry.loanId && entry.type === 'expense') ||
      (entry.tag && entry.tag.toLowerCase() === 'installment')
  );
}

export function findLinkedInstallmentByNameOrId(
  entry: CashEntry,
  installments: Installment[]
): Installment | undefined {
  return installments.find((i) => {
    const normName = (i.name || '').toLowerCase().trim();
    const normCategory = (entry.category || '').toLowerCase().trim();
    const normSubcategory = (entry.subcategory || '').toLowerCase().trim();
    const normNote = (entry.note || '').toLowerCase().trim();
    const normSource = (entry.source || '').toLowerCase().trim();
    return (
      entry.id.includes(i.id) ||
      (entry.loanId && (i.id === entry.loanId || i.loanId === entry.loanId)) ||
      (normName &&
        (normCategory === normName ||
          normSubcategory === normName ||
          normNote.includes(normName) ||
          normSource.includes(normName)))
    );
  });
}

// Resolves the linked loan repayment record (installment or single expense entry)
// for this loan entry.
export function resolveLinkedLoan(
  entry: CashEntry,
  installments: Installment[],
  entries?: CashEntry[]
): ResolvedLinkedLoanRepayment | undefined {
  if (entries && entries.length > 0) {
    const linked = findLinkedLoanRepayment(entry, entries, installments);
    if (linked) {
      if (linked.type === 'installment') {
        return {
          type: 'installment',
          target: linked.target,
          id: linked.target.id,
          name: linked.target.name,
        };
      } else {
        return {
          type: 'single',
          target: linked.target,
          id: linked.target.id,
          name: linked.target.category || 'Loan Repayment',
        };
      }
    }
  }

  const linkedInstallment = findLinkedInstallmentByNameOrId(entry, installments);
  const isInstallmentOccurrence = isInstallmentOccurrenceEntry(entry, linkedInstallment);

  const byLoanId = entry.loanId
    ? installments.find((i) => i.id === entry.loanId || i.loanId === entry.loanId)
    : undefined;

  const resolvedInst = byLoanId || (!isInstallmentOccurrence ? linkedInstallment : undefined);
  if (resolvedInst) {
    return {
      type: 'installment',
      target: resolvedInst,
      id: resolvedInst.id,
      name: resolvedInst.name,
    };
  }

  // Also check if entry.loanId or entry.id matches a single expense entry in entries if provided
  if (entries && entries.length > 0) {
    const single = entries.find(
      (e) =>
        e.id !== entry.id &&
        e.type === 'expense' &&
        Boolean(
          (entry.loanId && (e.loanId === entry.loanId || e.id === entry.loanId)) ||
          (entry.id && e.loanId === entry.id)
        )
    );
    if (single) {
      return {
        type: 'single',
        target: single,
        id: single.id,
        name: single.category || 'Loan Repayment',
      };
    }
  }

  return undefined;
}

export function buildEntryDeleteOptions(
  entry: CashEntry,
  context: {
    installments: Installment[];
    storageAssets: StorageAsset[];
    partTimeJobs: JobItem[];
    asfJobs: JobItem[];
    irqJobs: JobItem[];
    accounts?: Record<string, AccountBalance>;
    entryActuals?: Record<string, number>;
    entryActualDates?: Record<string, string>;
    entries?: CashEntry[];
    creditSettlementOverrides?: Record<string, CreditSettlementOverride>;
  }
): EntryDeleteAffectedData {
  const isForeign = (entry.currency || 'EGP').toUpperCase() !== 'EGP';
  const nativeQty = isForeign
    ? entry.originalAmount !== undefined && entry.originalAmount !== null
      ? entry.originalAmount
      : entry.fxRateAtEntry
      ? Math.round((entry.amount / entry.fxRateAtEntry) * 100) / 100
      : entry.amount
    : entry.amount;

  const amountFormatted = isForeign
    ? `${formatNativeCurrency(nativeQty, entry.currency)} (≈ ${formatMoney(entry.amount)})`
    : formatMoney(entry.amount);

  const normCategory = (entry.category || '').toLowerCase().trim();
  const normSubcategory = (entry.subcategory || '').toLowerCase().trim();
  const normNote = (entry.note || '').toLowerCase().trim();
  const normSource = (entry.source || '').toLowerCase().trim();

  const linkedInstallment = findLinkedInstallmentByNameOrId(entry, context.installments);
  const isInstallmentOccurrence = isInstallmentOccurrenceEntry(entry, linkedInstallment);

  const actualAmount =
    context.entryActuals?.[entry.id] ??
    (entry.actualAmount !== undefined && entry.actualAmount !== null
      ? Number(entry.actualAmount) || 0
      : (entry.isClosed ? Number(entry.amount) || 0 : 0));

  const isActualized = actualAmount > 0 || Boolean(entry.isClosed);

  const itemDescription = isInstallmentOccurrence
    ? `Installment: "${entry.category}" on ${DateUtils.formatDisplayDate(entry.date)}`
    : `${entry.type === 'income' ? 'Income' : 'Expense'}: "${entry.category}" on ${DateUtils.formatDisplayDate(entry.date)}`;

  // Recurring series scope only applies to unactualized forecast entries (historical actualized entries are standalone individual records)
  const isRecurring = !isActualized && Boolean(
    entry.seriesId ||
    entry.isRecurring ||
    (entry.source && entry.source.toLowerCase().includes('monthly')) ||
    (entry.frequency && entry.frequency.trim() !== '')
  );

  const linkedLoan = resolveLinkedLoan(entry, context.installments, context.entries);

  const allJobs = [
    ...(context.partTimeJobs || []),
    ...(context.asfJobs || []),
    ...(context.irqJobs || []),
  ];

  const linkedJob = allJobs.find(
    (j) => {
      if (entry.jobId && j.id === entry.jobId) return true;
      if (j.forecastEntryId === entry.id) return true;
      if (j.payments?.some((p) => p.entryId === entry.id || (entry.draws && entry.draws.some((d) => d.id === p.id)))) return true;
      const titleLower = (j.title || '').toLowerCase().trim();
      const clientLower = (j.client || '').toLowerCase().trim();
      if (titleLower && (normCategory === titleLower || normSubcategory === titleLower || normSource.includes(titleLower) || normNote.includes(titleLower))) return true;
      if (clientLower && (normCategory === clientLower || normSubcategory === clientLower || normSource.includes(clientLower) || normNote.includes(clientLower))) return true;
      return false;
    }
  );

  const options: AffectedRecordOption[] = [
    {
      id: 'cashflow',
      label: isInstallmentOccurrence
        ? "Dismiss This Month's Occurrence"
        : 'Forecast & Cash Flow Record',
      sublabel: isInstallmentOccurrence
        ? `Remove this payment (${amountFormatted}) from projections and deduct 1 payment from remaining balance.`
        : `Remove this entry (${amountFormatted}) from Cash Flow projections and historical actuals.`,
      icon: isInstallmentOccurrence ? '📅' : '📊',
      badge: isInstallmentOccurrence ? 'Occurrence' : 'Primary Record',
      required: true,
      defaultChecked: true,
    },
  ];

  if (isInstallmentOccurrence && linkedInstallment) {
    options.push({
      id: 'installment_plan',
      label: `Delete Entire Installment Plan: "${linkedInstallment.name}"`,
      sublabel: `Delete the installment tracker (${formatMoney(linkedInstallment.amount)}/mo) and cancel all future scheduled payments.`,
      icon: '💳',
      badge: 'Full Plan',
      defaultChecked: false,
    });
  }

  if (isRecurring) {
    const seriesId = entry.seriesId || entry.id;
    const targetDate = entry.date;
    const futureSeriesEntries = (context.entries || []).filter((e) => {
      const matchesSeries = (e.seriesId && e.seriesId === seriesId) || (e.id === entry.id);
      const isFutureOrCurrent = e.date >= targetDate;
      const isActualized = Number(context.entryActuals?.[e.id] ?? e.actualAmount ?? 0) > 0;
      return matchesSeries && isFutureOrCurrent && !isActualized;
    });
    const futureCount = futureSeriesEntries.length;
    const countLabel = futureCount > 1 ? ` (${futureCount} future records)` : '';
    const countSublabel = futureCount > 1
      ? `Apply deletion to all ${futureCount} future occurrences in this recurring series (from ${DateUtils.formatDisplayDate(entry.date)} onward). Uncheck to delete this date only.`
      : 'Apply deletion to all future occurrences in this series (uncheck to delete this date only).';

    options.push({
      id: 'series',
      label: `Recurring Series Scope${countLabel}`,
      sublabel: countSublabel,
      icon: '🔄',
      badge: futureCount > 1 ? `${futureCount} Records` : 'Series',
      defaultChecked: false,
    });
  }

  if (linkedLoan && !isInstallmentOccurrence) {
    options.push({
      id: 'loan',
      label: `Linked Loan Repayment: ${linkedLoan.name}`,
      sublabel: `Delete the linked loan debt record and remaining scheduled repayment entries.`,
      icon: '💳',
      badge: 'Linked Debt',
      defaultChecked: true,
    });
  }

  if (linkedJob) {
    options.push({
      id: 'job',
      label: `Linked Job: ${linkedJob.title || linkedJob.client}`,
      sublabel: `Sync "${linkedJob.title || linkedJob.client}" schedule and remaining invoice status.`,
      icon: '💼',
      badge: 'Linked Job',
      defaultChecked: true,
    });
  }

  const isCardSwipe = isCreditCardExpense(entry);

  // Suppress Recorded Tranches (1) on 1-click credit card swipes; only show for credit swipes when there are > 1 draws
  if (entry.draws && (isCardSwipe ? entry.draws.length > 1 : entry.draws.length > 0)) {
    options.push({
      id: 'draws',
      label: `Recorded Tranches (${entry.draws.length})`,
      sublabel: `All recorded draw installments and actual payouts are removed along with this entry.`,
      icon: '📑',
      badge: 'Draws',
      required: true,
      defaultChecked: true,
    });
  }

  if (isCardSwipe) {
    const accKey =
      entry.creditType === 'cib_card' || (entry.account || '').toLowerCase().includes('cib')
        ? 'cib'
        : 'hsbc';
    const bankLabel = accKey === 'cib' ? 'CIB' : 'HSBC';
    const sMonth = getCreditSettlementMonth(
      entry,
      context.creditSettlementOverrides,
      context.entryActualDates
    );
    const settlementId = sMonth ? `credit-settlement-${accKey}-${sMonth}` : '';
    const existingOverride = settlementId
      ? context.creditSettlementOverrides?.[settlementId]
      : undefined;
    const hasManualOverride = existingOverride?.amount !== undefined;

    if (sMonth) {
      options.push({
        id: 'credit_statement',
        label: hasManualOverride
          ? `Adjust ${bankLabel} Credit Due (${sMonth}) Statement Override`
          : `Credit Statement Cycle: ${bankLabel} Credit Due (${sMonth})`,
        sublabel: hasManualOverride
          ? `Reduce the manual statement override on ${bankLabel} Credit Due (${sMonth}) by ${amountFormatted}. (No bank account balance is refunded for a credit card swipe.)`
          : `Automatically reduces the calculated ${bankLabel} Credit Due (${sMonth}) statement by ${amountFormatted}. No bank account balance is refunded for a credit card swipe.`,
        icon: '💳',
        badge: 'Statement Cycle',
        required: !hasManualOverride,
        defaultChecked: true,
      });
    }
  }

  // FX-conversion entries: the entry's own account/currency reflect only the EGP side of
  // the transaction. The foreign asset that was drawn down is tracked separately via
  // storageAssetId/originalAmount and must NOT be treated as "this entry's own storage
  // target" (that would hijack the bank-account-refund detection below and offer the
  // wrong single checkbox instead of two independent ones).
  const isFxConversion = entry.conversionType === 'fx-sale';

  const hasActualMoneyTransacted = actualAmount > 0 || Boolean(entry.draws && entry.draws.length > 0);

  // If entry or its recorded draws were not deposited/deducted from any account
  // (e.g. user selected "Don't deposit", or account is 'none', 'unassigned', or unbanked 'cash'),
  // don't offer bank account or storage refund/revert options.
  const isNonDepositAccount = (acc?: string) => {
    if (!acc) return true;
    const clean = acc.trim().toLowerCase();
    return (
      clean === '' ||
      clean === 'none' ||
      clean === 'unassigned' ||
      clean === 'cash' ||
      clean === "don't deposit" ||
      clean === 'dont deposit' ||
      clean.includes('credit')
    );
  };

  const effectiveAccountRaw = (() => {
    if (entry.draws && entry.draws.length > 0) {
      const drawWithAcc = [...entry.draws].reverse().find((d) => !isNonDepositAccount(d.account));
      if (drawWithAcc?.account) return drawWithAcc.account;
      if (entry.draws.every((d) => isNonDepositAccount(d.account) && !d.storageAssetId)) {
        return 'none';
      }
    }
    return entry.account || '';
  })();

  const targetAccount = effectiveAccountRaw.trim().toLowerCase();
  const currUpper = (entry.currency || 'EGP').toUpperCase();

  const hasTransactedDrawAccount =
    !isCardSwipe &&
    (entry.draws && entry.draws.length > 0
      ? entry.draws.some((d) => !isNonDepositAccount(d.account) || Boolean(d.storageAssetId))
      : !isNonDepositAccount(entry.account) || Boolean(entry.storageAssetId));

  const isDirectOperatingBank = Boolean(
    !isCardSwipe &&
      !entry.storageAssetId &&
      !targetAccount.includes('credit') &&
      context.accounts &&
      Object.keys(context.accounts).some(
        (k) =>
          !k.toLowerCase().includes('credit') &&
          (k.toLowerCase() === targetAccount ||
            (context.accounts![k]?.name || '').toLowerCase().trim() === targetAccount)
      )
  );

  const matchingStorage = !isCardSwipe
    ? (context.storageAssets || []).find((a) => {
        if (!isFxConversion && entry.storageAssetId && a.id === entry.storageAssetId) return true;
        if (a.name.trim().toLowerCase() === targetAccount || `storage:${a.id}` === targetAccount) return true;
        if (
          !isDirectOperatingBank &&
          isForeign &&
          ((a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper)
        )
          return true;
        if (
          entry.draws &&
          entry.draws.some(
            (d) =>
              d.storageAssetId === a.id ||
              (d.account && d.account.trim().toLowerCase() === a.name.trim().toLowerCase())
          )
        )
          return true;
        return false;
      })
    : undefined;

  if (!isCardSwipe && hasActualMoneyTransacted && hasTransactedDrawAccount) {
    const actualFormatted = isForeign && !isDirectOperatingBank
      ? `${formatNativeCurrency(entry.fxRateAtEntry ? Math.round((actualAmount / entry.fxRateAtEntry) * 100) / 100 : (entry.originalAmount || actualAmount), entry.currency)} (≈ ${formatMoney(actualAmount)})`
      : formatMoney(actualAmount);

    if (matchingStorage && !isDirectOperatingBank && (isForeign || targetAccount.includes('storage') || targetAccount.includes('vault') || entry.storageAssetId)) {
      options.push({
        id: 'storage',
        label: entry.type === 'expense'
          ? `Storage Holding (Refund): ${matchingStorage.name}`
          : `Storage Holding: ${matchingStorage.name}`,
        sublabel: entry.type === 'expense'
          ? `Refund and add back ${actualFormatted} to ${matchingStorage.name}${matchingStorage.quantity !== undefined ? ` (Current: ${matchingStorage.quantity} ${matchingStorage.unit})` : ''}.`
          : `Revert / adjust balance in ${matchingStorage.name}${matchingStorage.quantity !== undefined ? ` (Current: ${matchingStorage.quantity} ${matchingStorage.unit})` : ''}.`,
        icon: '🏦',
        badge: entry.type === 'expense' ? 'Storage Refund' : 'Storage',
        defaultChecked: false,
      });
    } else if ((!isForeign || isDirectOperatingBank) && context.accounts) {
      const matchingAccountKey = Object.keys(context.accounts).find(
        (k) =>
          !k.toLowerCase().includes('credit') &&
          (k.toLowerCase() === targetAccount ||
            (context.accounts![k]?.name || '').toLowerCase().trim() === targetAccount)
      );
      const matchingAccount = matchingAccountKey ? context.accounts[matchingAccountKey] : undefined;

      if (matchingAccount && matchingAccountKey) {
        const accDisplayName = matchingAccount.name || matchingAccountKey.toUpperCase();
        options.push({
          id: 'storage',
          label: entry.type === 'expense'
            ? `Bank Account Refund: ${accDisplayName}`
            : `Bank Account: ${accDisplayName}`,
          sublabel: entry.type === 'expense'
            ? `Refund and add back ${actualFormatted} to ${accDisplayName} balance (Current: ${formatMoney(matchingAccount.balance || 0)}).`
            : `Deduct deposited ${actualFormatted} from ${accDisplayName} balance (Current: ${formatMoney(matchingAccount.balance || 0)}).`,
          icon: '🏦',
          badge: entry.type === 'expense' ? 'Bank Refund' : 'Bank Balance',
          defaultChecked: false,
        });
      }
    }
  }

  // FX-conversion entries drew a foreign-currency amount out of a storage asset in
  // addition to depositing EGP into an account (handled above). That foreign leg is
  // never restored automatically, so offer it as its own independent option here.
  if (isFxConversion && entry.storageAssetId) {
    const sourceAsset = (context.storageAssets || []).find((a) => a.id === entry.storageAssetId);
    if (sourceAsset) {
      const restoreQty = entry.originalAmount ?? 0;
      options.push({
        id: 'restore_fx_asset',
        label: `Restore Foreign Storage Asset: ${sourceAsset.name}`,
        sublabel: `Add back ${formatNativeCurrency(restoreQty, sourceAsset.unit)} to ${sourceAsset.name}${sourceAsset.quantity !== undefined ? ` (Current: ${sourceAsset.quantity} ${sourceAsset.unit})` : ''} — the amount converted in this transaction.`,
        icon: '💱',
        badge: 'FX Restore',
        defaultChecked: true,
      });
    }
  }

  return {
    itemDescription,
    amountFormatted,
    options,
  };
}

export function isEntryLinkedToInstallment(e: CashEntry, installment: Installment): boolean {
  if (e.type !== 'expense') return false;
  const matchKey = (installment.name || '').toLowerCase().trim();
  const matchLoanId = installment.loanId || installment.id;
  return Boolean(
    (e.loanId && (e.loanId === matchLoanId || e.loanId === installment.id)) ||
      (matchKey && e.category && e.category.toLowerCase().trim() === matchKey) ||
      (matchKey && e.subcategory && e.subcategory.toLowerCase().trim() === matchKey) ||
      (e.id && e.id.includes(installment.id))
  );
}

export function buildInstallmentDeleteOptions(
  installment: Installment,
  context: { entries: CashEntry[]; archivedEntries?: CashEntry[] }
): {
  itemDescription: string;
  amountFormatted: string;
  options: AffectedRecordOption[];
} {
  const itemDescription = `Installment / Debt: "${installment.name}" (${installment.account || 'Direct'})`;
  const remainingTotal = (installment.amount || 0) * (installment.remainingMonths || 0);
  const amountFormatted = `${formatMoney(installment.amount)} / mo (${installment.remainingMonths || 0} mos remaining — ≈ ${formatMoney(remainingTotal)})`;

  const allEntries = [...(context.entries || []), ...(context.archivedEntries || [])];
  const hasLinkedEntries = allEntries.some((e) => isEntryLinkedToInstallment(e, installment));

  const options: AffectedRecordOption[] = [
    {
      id: 'installment',
      label: 'Installment Tracker Record',
      sublabel: `Permanently remove "${installment.name}" from active debt and loan commitments.`,
      icon: '💳',
      badge: 'Installment',
      required: true,
      defaultChecked: true,
    },
  ];

  if (hasLinkedEntries) {
    options.push({
      id: 'cashflow',
      label: 'Linked Cash Flow Forecast Entries',
      sublabel: `Delete associated monthly repayment expense entries in Cash Flow.`,
      icon: '📊',
      badge: 'Cash Flow',
      defaultChecked: true,
    });
  }

  return { itemDescription, amountFormatted, options };
}

export function isJobLinkedToStorageAsset(j: JobItem, asset: StorageAsset): boolean {
  if (!j.forecastDestination) return false;
  const destLower = j.forecastDestination.toLowerCase().trim();
  const assetNameLower = (asset.name || '').toLowerCase().trim();
  return (
    j.forecastDestination === `storage:existing-${asset.id}` ||
    j.forecastDestination === `storage:${asset.id}` ||
    (Boolean(assetNameLower) && destLower.includes(assetNameLower))
  );
}

export function buildStorageDeleteOptions(
  asset: StorageAsset,
  context: {
    partTimeJobs: JobItem[];
    asfJobs: JobItem[];
    irqJobs: JobItem[];
  }
): {
  itemDescription: string;
  amountFormatted: string;
  options: AffectedRecordOption[];
} {
  const itemDescription = `Storage Holding: "${asset.name}" (${asset.category || 'Asset'})`;
  const amountFormatted = formatNativeCurrency(asset.quantity, asset.unit);

  const allJobs = [
    ...context.partTimeJobs,
    ...context.asfJobs,
    ...context.irqJobs,
  ];
  const linkedJobs = allJobs.filter((j) => isJobLinkedToStorageAsset(j, asset));

  const options: AffectedRecordOption[] = [
    {
      id: 'storage',
      label: 'Storage Asset Record',
      sublabel: `Permanently delete "${asset.name}" from storage holdings and portfolio balance.`,
      icon: '🏦',
      badge: 'Storage',
      required: true,
      defaultChecked: true,
    },
  ];

  if (linkedJobs.length > 0) {
    options.push({
      id: 'jobs',
      label: `Linked Job Destinations (${linkedJobs.length})`,
      sublabel: `Reset default payment settlement destination on ${linkedJobs.map((j) => j.title || j.client).join(', ')}.`,
      icon: '💼',
      badge: 'Job Sync',
      defaultChecked: true,
    });
  }

  return { itemDescription, amountFormatted, options };
}

export function hasEntryAffectedParties(
  entry: CashEntry,
  context: {
    installments: Installment[];
    storageAssets: StorageAsset[];
    partTimeJobs: JobItem[];
    asfJobs: JobItem[];
    irqJobs: JobItem[];
    accounts?: Record<string, AccountBalance>;
    entryActuals?: Record<string, number>;
    entryActualDates?: Record<string, string>;
    entries?: CashEntry[];
    creditSettlementOverrides?: Record<string, CreditSettlementOverride>;
  }
): boolean {
  if (!entry) return false;
  const res = buildEntryDeleteOptions(entry, context);
  const meaningfulOptions = res.options.filter(
    (o) => !(o.id === 'credit_statement' && o.required)
  );
  return meaningfulOptions.length > 1;
}

export function hasInstallmentAffectedParties(
  installment: Installment,
  context: { entries: CashEntry[]; archivedEntries?: CashEntry[] }
): boolean {
  if (!installment) return false;
  return buildInstallmentDeleteOptions(installment, context).options.length > 1;
}

export function hasStorageAffectedParties(
  asset: StorageAsset,
  context: {
    partTimeJobs: JobItem[];
    asfJobs: JobItem[];
    irqJobs: JobItem[];
  }
): boolean {
  if (!asset) return false;
  return buildStorageDeleteOptions(asset, context).options.length > 1;
}

export function hasJobAffectedParties(job: JobItem): boolean {
  if (!job) return false;
  return Boolean(
    (job.payments && job.payments.length > 0) ||
    job.forecastEntryId
  );
}

export function hasJobPaymentAffectedParties(
  payment: JobPayment,
  storageAssets?: StorageAsset[],
  accounts?: Record<string, AccountBalance>
): boolean {
  if (!payment) return false;
  if (payment.entryId) return true;
  const targetAccount = (payment.settlementAccount || payment.account || '').trim().toLowerCase();
  if (storageAssets && storageAssets.length > 0) {
    const curr = (payment.currency || 'USD').toUpperCase();
    const matching = storageAssets.find(
      (a) =>
        a.name.trim().toLowerCase() === targetAccount ||
        `storage:${a.id}` === targetAccount ||
        (curr !== 'EGP' && ((a.unit || '').toUpperCase() === curr || (a.currency || '').toUpperCase() === curr))
    );
    if (matching) return true;
  }
  if (accounts && targetAccount && !targetAccount.includes('credit')) {
    const cleanAcc = targetAccount.replace('account:', '');
    const matchingBank = Object.keys(accounts).find(
      (k) => k.toLowerCase() === cleanAcc || (accounts[k]?.name || '').toLowerCase().trim() === cleanAcc
    );
    if (matchingBank) return true;
  }
  return false;
}

export interface EntryClearAffectedData {
  itemDescription: string;
  amountFormatted: string;
  options: AffectedRecordOption[];
}

export function buildEntryClearOptions(
  entry: CashEntry,
  context: {
    installments?: Installment[];
    storageAssets?: StorageAsset[];
    partTimeJobs?: JobItem[];
    asfJobs?: JobItem[];
    irqJobs?: JobItem[];
    accounts?: Record<string, AccountBalance>;
    entryActuals?: Record<string, number>;
    entryActualDates?: Record<string, string>;
    creditSettlementOverrides?: Record<string, CreditSettlementOverride>;
  }
): EntryClearAffectedData {
  const isForeign = (entry.currency || 'EGP').toUpperCase() !== 'EGP';
  
  const rawActual =
    context.entryActuals?.[entry.id] ??
    (entry.actualAmount !== undefined && entry.actualAmount !== null
      ? entry.actualAmount
      : entry.amount);

  const nativeQty = isForeign
    ? entry.originalAmount !== undefined && entry.originalAmount !== null
      ? entry.originalAmount
      : entry.fxRateAtEntry
      ? Math.round((rawActual / entry.fxRateAtEntry) * 100) / 100
      : rawActual
    : rawActual;

  const amountFormatted = isForeign
    ? `${formatNativeCurrency(nativeQty, entry.currency)} (≈ ${formatMoney(rawActual)})`
    : formatMoney(rawActual);

  const normCategory = (entry.category || '').toLowerCase().trim();
  const normSubcategory = (entry.subcategory || '').toLowerCase().trim();
  const normNote = (entry.note || '').toLowerCase().trim();
  const normSource = (entry.source || '').toLowerCase().trim();

  const linkedInstallment = (context.installments || []).find((i) => {
    const normName = (i.name || '').toLowerCase().trim();
    return (
      entry.id.includes(i.id) ||
      (entry.loanId && (i.id === entry.loanId || i.loanId === entry.loanId)) ||
      (normName &&
        (normCategory === normName ||
          normSubcategory === normName ||
          normNote.includes(normName) ||
          normSource.includes(normName)))
    );
  });

  const isInstallmentOccurrence = Boolean(
    entry.source === 'installment' ||
      entry.id.startsWith('installment-') ||
      (linkedInstallment && !entry.loanId && entry.type === 'expense') ||
      (entry.tag && entry.tag.toLowerCase() === 'installment')
  );

  const actDate =
    context.entryActualDates?.[entry.id] ||
    entry.actualDate ||
    entry.date;

  const itemDescription = isInstallmentOccurrence
    ? `Installment: "${entry.category}" on ${DateUtils.formatDisplayDate(actDate)}`
    : `${entry.type === 'income' ? 'Income' : 'Expense'}: "${entry.category}" on ${DateUtils.formatDisplayDate(actDate)}`;

  const allJobs = [
    ...(context.partTimeJobs || []),
    ...(context.asfJobs || []),
    ...(context.irqJobs || []),
  ];

  const linkedJob = allJobs.find((j) => {
    if (entry.jobId && j.id === entry.jobId) return true;
    if (j.forecastEntryId === entry.id) return true;
    if (
      j.payments?.some(
        (p) => p.entryId === entry.id || (entry.draws && entry.draws.some((d) => d.id === p.id))
      )
    )
      return true;
    const titleLower = (j.title || '').toLowerCase().trim();
    const clientLower = (j.client || '').toLowerCase().trim();
    if (
      titleLower &&
      (normCategory === titleLower ||
        normSubcategory === titleLower ||
        normSource.includes(titleLower) ||
        normNote.includes(titleLower))
    )
      return true;
    if (
      clientLower &&
      (normCategory === clientLower ||
        normSubcategory === clientLower ||
        normSource.includes(clientLower) ||
        normNote.includes(clientLower))
    )
      return true;
    return false;
  });

  const isCardSwipe = isCreditCardExpense(entry);
  const isSettlementEntry =
    entry.id.startsWith('credit-settlement-') ||
    (entry.source || '').toLowerCase().includes('recurring credit');

  const showDrawsOption = Boolean(
    entry.draws &&
      (isCardSwipe || isSettlementEntry ? entry.draws.length > 1 : entry.draws.length > 0)
  );

  const options: AffectedRecordOption[] = [
    {
      id: 'revert_actual',
      label: 'Revert Actual to Planned Forecast',
      sublabel: showDrawsOption
        ? `Reopen the fulfilled entry and restore its planned forecast (${formatMoney(entry.amount)}). Pair with the Recorded Tranches option below to choose whether paid tranches are wiped or kept.`
        : isInstallmentOccurrence
        ? `Reset recorded payment (${amountFormatted}) and restore planned installment forecast (${formatMoney(entry.amount)}).`
        : `Reset recorded actual (${amountFormatted}) to 0 and restore planned forecast (${formatMoney(entry.amount)}).`,
      icon: '🔄',
      badge: 'Actual Status',
      required: true,
      defaultChecked: true,
    },
  ];

  if (linkedJob) {
    options.push({
      id: 'job',
      label: `Linked Job: ${linkedJob.title || linkedJob.client}`,
      sublabel: `Revert settled payment on "${linkedJob.title || linkedJob.client}" and restore outstanding invoice balance.`,
      icon: '💼',
      badge: 'Linked Job',
      defaultChecked: true,
    });
  }

  if (isCardSwipe) {
    const accKey =
      entry.creditType === 'cib_card' || (entry.account || '').toLowerCase().includes('cib')
        ? 'cib'
        : 'hsbc';
    const bankLabel = accKey === 'cib' ? 'CIB' : 'HSBC';
    const sMonth = getCreditSettlementMonth(
      entry,
      context.creditSettlementOverrides,
      context.entryActualDates
    );
    if (sMonth) {
      options.push({
        id: 'credit_statement',
        label: `Credit Statement Cycle: ${bankLabel} Credit Due (${sMonth})`,
        sublabel: `Swipe remains part of ${bankLabel} Credit Due (${sMonth}) as a planned card spend (${amountFormatted}). No bank account balance is refunded for a credit card swipe.`,
        icon: '💳',
        badge: 'Statement Cycle',
        required: true,
        defaultChecked: true,
      });
    }
  }

  const isFxConversion = entry.conversionType === 'fx-sale';

  const isNonDepositAccount = (acc?: string) => {
    if (!acc) return true;
    const clean = acc.trim().toLowerCase();
    return (
      clean === '' ||
      clean === 'none' ||
      clean === 'unassigned' ||
      clean === 'cash' ||
      clean === "don't deposit" ||
      clean === 'dont deposit' ||
      clean.includes('credit')
    );
  };

  const effectiveAccountRaw = (() => {
    if (entry.draws && entry.draws.length > 0) {
      const drawWithAcc = [...entry.draws].reverse().find((d) => !isNonDepositAccount(d.account));
      if (drawWithAcc?.account) return drawWithAcc.account;
      if (entry.draws.every((d) => isNonDepositAccount(d.account) && !d.storageAssetId)) {
        return 'none';
      }
    }
    return entry.account || '';
  })();

  const targetAccount = effectiveAccountRaw.trim().toLowerCase();
  const currUpper = (entry.currency || 'EGP').toUpperCase();
  const isDirectOperatingBank = Boolean(
    !isCardSwipe &&
      !entry.storageAssetId &&
      !targetAccount.includes('credit') &&
      context.accounts &&
      Object.keys(context.accounts).some(
        (k) =>
          !k.toLowerCase().includes('credit') &&
          (k.toLowerCase() === targetAccount ||
            (context.accounts![k]?.name || '').toLowerCase().trim() === targetAccount)
      )
  );
  const matchingStorage = !isCardSwipe
    ? (context.storageAssets || []).find((a) => {
        if (!isFxConversion && entry.storageAssetId && a.id === entry.storageAssetId) return true;
        if (a.name.trim().toLowerCase() === targetAccount || `storage:${a.id}` === targetAccount) return true;
        if (
          !isDirectOperatingBank &&
          isForeign &&
          ((a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper)
        )
          return true;
        if (
          entry.draws &&
          entry.draws.some(
            (d) =>
              d.storageAssetId === a.id ||
              (d.account && d.account.trim().toLowerCase() === a.name.trim().toLowerCase())
          )
        )
          return true;
        return false;
      })
    : undefined;

  const hasTransactedDrawAccount =
    !isCardSwipe &&
    (entry.draws && entry.draws.length > 0
      ? entry.draws.some((d) => !isNonDepositAccount(d.account) || Boolean(d.storageAssetId))
      : !isNonDepositAccount(entry.account) || Boolean(entry.storageAssetId));

  if (
    !isCardSwipe &&
    hasTransactedDrawAccount &&
    matchingStorage &&
    !isDirectOperatingBank &&
    (isForeign ||
      targetAccount.includes('storage') ||
      targetAccount.includes('vault') ||
      entry.storageAssetId ||
      linkedJob)
  ) {
    options.push({
      id: 'storage',
      label: entry.type === 'expense'
        ? `Storage Holding (Refund): ${matchingStorage.name}`
        : `Storage Holding: ${matchingStorage.name}`,
      sublabel: entry.type === 'expense'
        ? `Refund and add back ${amountFormatted} to ${matchingStorage.name}${
            matchingStorage.quantity !== undefined
              ? ` (Current: ${matchingStorage.quantity} ${matchingStorage.unit})`
              : ''
          }.`
        : `Revert / adjust balance in ${matchingStorage.name}${
            matchingStorage.quantity !== undefined
              ? ` (Current: ${matchingStorage.quantity} ${matchingStorage.unit})`
              : ''
          }.`,
      icon: '🏦',
      badge: entry.type === 'expense' ? 'Storage Refund' : 'Storage',
      defaultChecked: true,
    });
  } else if (!isCardSwipe && hasTransactedDrawAccount && (!isForeign || isDirectOperatingBank) && context.accounts) {
    const matchingAccountKey = Object.keys(context.accounts).find(
      (k) =>
        !k.toLowerCase().includes('credit') &&
        (k.toLowerCase() === targetAccount ||
          (context.accounts![k]?.name || '').toLowerCase().trim() === targetAccount)
    );
    const matchingAccount = matchingAccountKey ? context.accounts[matchingAccountKey] : undefined;

    if (matchingAccount && matchingAccountKey) {
      const accDisplayName = matchingAccount.name || matchingAccountKey.toUpperCase();
      options.push({
        id: 'storage',
        label: entry.type === 'expense'
          ? `Bank Account Refund: ${accDisplayName}`
          : `Bank Account: ${accDisplayName}`,
        sublabel: entry.type === 'expense'
          ? `Refund and add back ${amountFormatted} to ${accDisplayName} balance (Current: ${formatMoney(matchingAccount.balance || 0)}).`
          : `Deduct deposited ${amountFormatted} from ${accDisplayName} balance (Current: ${formatMoney(matchingAccount.balance || 0)}).`,
        icon: '🏦',
        badge: entry.type === 'expense' ? 'Bank Refund' : 'Bank Balance',
        defaultChecked: true,
      });
    }
  }

  if (showDrawsOption && entry.draws) {
    options.push({
      id: 'draws',
      label: `Recorded Tranches (${entry.draws.length})`,
      sublabel: isSettlementEntry
        ? `All ${entry.draws.length} recorded settlement payments are cleared and the settlement returns to a single planned due amount on its original due date.`
        : `Uncheck to restore this entry to Cash Flow as an ongoing open budget with its ${entry.draws.length} recorded tranche${entry.draws.length > 1 ? 's' : ''} and paid actual (${amountFormatted}) intact. Checked: tranches are cleared and only the planned forecast remains.`,
      icon: '📑',
      badge: 'Draws',
      required: isSettlementEntry,
      defaultChecked: true,
    });
  }

  return {
    itemDescription,
    amountFormatted,
    options,
  };
}

export function hasEntryClearAffectedParties(
  entry: CashEntry,
  context: {
    installments?: Installment[];
    storageAssets?: StorageAsset[];
    partTimeJobs?: JobItem[];
    asfJobs?: JobItem[];
    irqJobs?: JobItem[];
    accounts?: Record<string, AccountBalance>;
    entryActuals?: Record<string, number>;
    entryActualDates?: Record<string, string>;
    creditSettlementOverrides?: Record<string, CreditSettlementOverride>;
  }
): boolean {
  if (!entry) return false;
  const res = buildEntryClearOptions(entry, context);
  const meaningfulOptions = res.options.filter(
    (o) => !(o.id === 'credit_statement' && o.required)
  );
  return meaningfulOptions.length > 1;
}
