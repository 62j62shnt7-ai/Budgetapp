import type { CashEntry, Installment, StorageAsset, JobItem, JobPayment, AccountBalance } from '../types';
import type { AffectedRecordOption } from '../components/Modals/AffectedRecordsModal';
import { formatMoney, DateUtils } from '../engine/dateUtils';
import { formatNativeCurrency } from '../engine/currency';

export interface EntryDeleteAffectedData {
  itemDescription: string;
  amountFormatted: string;
  options: AffectedRecordOption[];
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
    entries?: CashEntry[];
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
    ? `${formatNativeCurrency(nativeQty, entry.currency!)} (≈ ${formatMoney(entry.amount)})`
    : formatMoney(entry.amount);

  const normCategory = (entry.category || '').toLowerCase().trim();
  const normSubcategory = (entry.subcategory || '').toLowerCase().trim();
  const normNote = (entry.note || '').toLowerCase().trim();
  const normSource = (entry.source || '').toLowerCase().trim();

  const linkedInstallment = context.installments.find(
    (i) => {
      const normName = (i.name || '').toLowerCase().trim();
      return (
        entry.id.includes(i.id) ||
        (entry.loanId && (i.id === entry.loanId || (i as any).loanId === entry.loanId)) ||
        (normName && (normCategory === normName || normSubcategory === normName || normNote.includes(normName) || normSource.includes(normName)))
      );
    }
  );

  const isInstallmentOccurrence = Boolean(
    entry.source === 'installment' ||
    entry.id.startsWith('installment-') ||
    (linkedInstallment && !entry.loanId && entry.type === 'expense') ||
    (entry.tag && entry.tag.toLowerCase() === 'installment')
  );

  const itemDescription = isInstallmentOccurrence
    ? `Installment: "${entry.category}" on ${DateUtils.formatDisplayDate(entry.date)}`
    : `${entry.type === 'income' ? 'Income' : 'Expense'}: "${entry.category}" on ${DateUtils.formatDisplayDate(entry.date)}`;

  const isRecurring = Boolean(
    entry.seriesId ||
    entry.isRecurring ||
    (entry.source && entry.source.toLowerCase().includes('monthly')) ||
    (entry.frequency && entry.frequency.trim() !== '')
  );

  const linkedLoanId = entry.loanId;
  const linkedLoan =
    (linkedLoanId
      ? context.installments.find(
          (i) => i.id === linkedLoanId || (i as any).loanId === linkedLoanId
        )
      : undefined) ||
    (!isInstallmentOccurrence && linkedInstallment ? linkedInstallment : undefined);

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

  if (entry.draws && entry.draws.length > 0) {
    options.push({
      id: 'draws',
      label: `Recorded Tranches (${entry.draws.length})`,
      sublabel: `Remove all recorded draw installments and actual payouts linked to this entry.`,
      icon: '📑',
      badge: 'Draws',
      defaultChecked: true,
    });
  }

  const actualAmount =
    context.entryActuals?.[entry.id] ??
    (entry.actualAmount !== undefined && entry.actualAmount !== null
      ? Number(entry.actualAmount) || 0
      : (entry.isClosed ? Number(entry.amount) || 0 : 0));

  const hasActualMoneyTransacted = actualAmount > 0 || Boolean(entry.draws && entry.draws.length > 0);

  const targetAccount = (entry.account || '').trim().toLowerCase();
  const currUpper = (entry.currency || 'EGP').toUpperCase();
  const matchingStorage = (context.storageAssets || []).find((a) => {
    if (entry.storageAssetId && a.id === entry.storageAssetId) return true;
    if (a.name.trim().toLowerCase() === targetAccount) return true;
    if (isForeign && ((a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper)) return true;
    if (entry.draws && entry.draws.some((d) => (d as any).storageAssetId === a.id || (d.account && d.account.trim().toLowerCase() === a.name.trim().toLowerCase()))) return true;
    return false;
  });

  if (hasActualMoneyTransacted) {
    const actualFormatted = isForeign
      ? `${formatNativeCurrency(entry.fxRateAtEntry ? Math.round((actualAmount / entry.fxRateAtEntry) * 100) / 100 : (entry.originalAmount || actualAmount), entry.currency!)} (≈ ${formatMoney(actualAmount)})`
      : formatMoney(actualAmount);

    if (matchingStorage && (isForeign || targetAccount.includes('storage') || targetAccount.includes('vault') || entry.storageAssetId)) {
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
    } else if (!isForeign && context.accounts) {
      const matchingAccountKey = Object.keys(context.accounts).find(
        (k) => k.toLowerCase() === targetAccount || (context.accounts![k]?.name || '').toLowerCase().trim() === targetAccount
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

  return {
    itemDescription,
    amountFormatted,
    options,
  };
}

export function buildInstallmentDeleteOptions(
  installment: Installment,
  context: { entries: CashEntry[] }
): {
  itemDescription: string;
  amountFormatted: string;
  options: AffectedRecordOption[];
} {
  const itemDescription = `Installment / Debt: "${installment.name}" (${installment.account || 'Direct'})`;
  const remainingTotal = (installment.amount || 0) * (installment.remainingMonths || 0);
  const amountFormatted = `${formatMoney(installment.amount)} / mo (${installment.remainingMonths || 0} mos remaining — ≈ ${formatMoney(remainingTotal)})`;

  const matchKey = (installment.name || '').toLowerCase().trim();
  const matchLoanId = (installment as any).loanId || installment.id;

  const hasLinkedEntries = context.entries.some(
    (e) =>
      (e.loanId && (e.loanId === matchLoanId || e.loanId === installment.id)) ||
      (e.category && e.category.toLowerCase().trim() === matchKey) ||
      (e.subcategory && e.subcategory.toLowerCase().trim() === matchKey) ||
      (e.id && e.id.includes(installment.id))
  );

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
  const linkedJobs = allJobs.filter(
    (j) =>
      j.forecastDestination === `storage:existing-${asset.id}` ||
      (j.forecastDestination &&
        j.forecastDestination.toLowerCase().includes(asset.name.toLowerCase()))
  );

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
    entries?: CashEntry[];
  }
): boolean {
  if (!entry) return false;
  const res = buildEntryDeleteOptions(entry, context);
  return res.options.length > 1;
}

export function hasInstallmentAffectedParties(
  installment: Installment,
  context: { entries: CashEntry[] }
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
  storageAssets?: StorageAsset[]
): boolean {
  if (!payment) return false;
  if (payment.entryId) return true;
  if (storageAssets && storageAssets.length > 0) {
    const targetAccount = (payment.settlementAccount || payment.account || '').trim().toLowerCase();
    const curr = (payment.currency || 'USD').toUpperCase();
    const matching = storageAssets.find(
      (a) =>
        a.name.trim().toLowerCase() === targetAccount ||
        (curr !== 'EGP' && ((a.unit || '').toUpperCase() === curr || (a.currency || '').toUpperCase() === curr))
    );
    if (matching) return true;
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
    ? `${formatNativeCurrency(nativeQty, entry.currency!)} (≈ ${formatMoney(rawActual)})`
    : formatMoney(rawActual);

  const normCategory = (entry.category || '').toLowerCase().trim();
  const normSubcategory = (entry.subcategory || '').toLowerCase().trim();
  const normNote = (entry.note || '').toLowerCase().trim();
  const normSource = (entry.source || '').toLowerCase().trim();

  const linkedInstallment = (context.installments || []).find((i) => {
    const normName = (i.name || '').toLowerCase().trim();
    return (
      entry.id.includes(i.id) ||
      (entry.loanId && (i.id === entry.loanId || (i as any).loanId === entry.loanId)) ||
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

  const options: AffectedRecordOption[] = [
    {
      id: 'revert_actual',
      label: 'Revert Actual to Planned Forecast',
      sublabel: isInstallmentOccurrence
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

  const targetAccount = (entry.account || '').trim().toLowerCase();
  const currUpper = (entry.currency || 'EGP').toUpperCase();
  const matchingStorage = (context.storageAssets || []).find((a) => {
    if (entry.storageAssetId && a.id === entry.storageAssetId) return true;
    if (a.name.trim().toLowerCase() === targetAccount) return true;
    if (
      isForeign &&
      ((a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper)
    )
      return true;
    if (
      entry.draws &&
      entry.draws.some(
        (d) =>
          (d as any).storageAssetId === a.id ||
          (d.account && d.account.trim().toLowerCase() === a.name.trim().toLowerCase())
      )
    )
      return true;
    return false;
  });

  if (
    matchingStorage &&
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
  } else if (!isForeign && context.accounts) {
    const matchingAccountKey = Object.keys(context.accounts).find(
      (k) => k.toLowerCase() === targetAccount || (context.accounts![k]?.name || '').toLowerCase().trim() === targetAccount
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

  if (entry.draws && entry.draws.length > 0) {
    options.push({
      id: 'draws',
      label: `Recorded Tranches (${entry.draws.length})`,
      sublabel: `Clear all ${entry.draws.length} recorded draw installments and actual payouts.`,
      icon: '📑',
      badge: 'Draws',
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
  }
): boolean {
  if (!entry) return false;
  const res = buildEntryClearOptions(entry, context);
  return res.options.length > 1;
}
