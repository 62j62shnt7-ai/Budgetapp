// ==========================================================================
// Salary Matrix & Installment Projection Generators
// ==========================================================================
import { DateUtils } from './dateUtils';
import type { CashEntry, Installment, SalaryPayment } from '../types';

export function monthIndexFromYearMonth(ymString: string): number {
  const [year, month] = DateUtils.parseYearMonth(ymString);
  return year * 12 + (month - 1);
}

export function groupPhaseForMonthIndex(absoluteMonthIndex: number, anchorMonth?: string): number {
  const anchorIndex = monthIndexFromYearMonth(anchorMonth || DateUtils.currentYearMonth());
  return (((absoluteMonthIndex - anchorIndex) % 3) + 3) % 3;
}

export function buildSalaryEntries(
  salaryPattern: SalaryPayment[],
  startYearMonth: string,
  quarters: number = 4,
  anchorMonth?: string
): CashEntry[] {
  const startIndex = monthIndexFromYearMonth(startYearMonth);
  const totalMonths = Math.max(1, quarters) * 3;
  const result: CashEntry[] = [];

  for (let offset = 0; offset < totalMonths; offset += 1) {
    const absoluteMonthIndex = startIndex + offset;
    const phase = groupPhaseForMonthIndex(absoluteMonthIndex, anchorMonth);
    const year = Math.floor(absoluteMonthIndex / 12);
    const month = ((absoluteMonthIndex % 12) + 12) % 12;

    salaryPattern
      .filter((payment) => (Number(payment.monthOffset) || 0) === phase && (Number(payment.amount) || 0) > 0)
      .forEach((payment, idx) => {
        const lastDay = DateUtils.getLastDayOfMonth(year, month + 1);
        const day = Math.min(Number(payment.day), lastDay);
        result.push({
          id: `salary-${year}-${month + 1}-${day}-${idx}`,
          date: DateUtils.formatDate(year, month + 1, day),
          category: 'Salary',
          account: 'hsbc',
          type: 'income',
          amount: Number(payment.amount) || 0,
          source: 'salary',
          tag: 'Salary',
        });
      });
  }

  return result;
}

export function getInstallmentDateId(installmentId: string, yearOrYm: number | string, month?: number): string {
  if (typeof yearOrYm === 'string') {
    const [y, m] = DateUtils.parseYearMonth(yearOrYm);
    const mm = String(m).padStart(2, '0');
    return `installment-${installmentId}-${y}-${mm}`;
  }
  const mm = String(month ?? 1).padStart(2, '0');
  return `installment-${installmentId}-${yearOrYm}-${mm}`;
}

export function buildInstallmentEntries(installments: Installment[]): CashEntry[] {
  return installments.flatMap((installment) => {
    const [startYear, startMonth] = DateUtils.parseYearMonth(installment.startMonth);
    const frequency = Math.max(1, Number(installment.frequency) || 1);
    const total = Math.max(0, Number(installment.totalMonths ?? installment.remainingMonths ?? 0));
    if (total === 0) return [];
    const entries: CashEntry[] = [];

    for (let i = 0; i < total; i += 1) {
      const totalMonthIndex = startYear * 12 + (startMonth - 1) + i * frequency;
      const y = Math.floor(totalMonthIndex / 12);
      const m = (totalMonthIndex % 12) + 1;
      const lastDay = DateUtils.getLastDayOfMonth(y, m);
      const day = Math.min(Number(installment.day) || 30, lastDay);
      const dateId = getInstallmentDateId(installment.id, y, m);

      entries.push({
        id: dateId,
        date: DateUtils.formatDate(y, m, day),
        category: installment.name,
        subcategory: installment.name,
        account: installment.account || 'hsbc',
        type: 'expense',
        amount: Number(installment.amount) || 0,
        source: 'installment',
        loanId: installment.id,
        tag: installment.tag || 'Installment',
        note: `Installment: ${installment.name} (${i + 1}/${total})`,
      });
    }

    return entries;
  });
}

export interface InstallmentProgress {
  total: number;
  paid: number;
  dismissed: number;
  remaining: number;
  outstandingAmount: number;
  monthlyAmount: number;
  isActive: boolean;
}

export function calculateInstallmentProgress(
  installment: Installment,
  entryActuals: Record<string, number> = {},
  deletedForecasts: string[] = []
): InstallmentProgress {
  const [startYear, startMonth] = DateUtils.parseYearMonth(installment.startMonth);
  const frequency = Math.max(1, Number(installment.frequency) || 1);
  const total = Math.max(0, Number(installment.totalMonths ?? installment.remainingMonths ?? 0));
  const deletedSet = new Set(deletedForecasts || []);
  const amount = Number(installment.amount) || 0;

  if (total === 0) {
    return {
      total: 0,
      paid: 0,
      dismissed: 0,
      remaining: 0,
      outstandingAmount: 0,
      monthlyAmount: 0,
      isActive: false,
    };
  }

  let paid = 0;
  let dismissed = 0;
  let totalActualPaid = 0;

  for (let i = 0; i < total; i += 1) {
    const totalMonthIndex = startYear * 12 + (startMonth - 1) + i * frequency;
    const y = Math.floor(totalMonthIndex / 12);
    const m = (totalMonthIndex % 12) + 1;
    const dateId = getInstallmentDateId(installment.id, y, m);

    if (deletedSet.has(dateId)) {
      dismissed += 1;
    } else {
      const actual = Number(entryActuals[dateId]) || 0;
      if (actual > 0) {
        totalActualPaid = Math.round((totalActualPaid + Math.min(amount, actual)) * 100) / 100;
        if (actual >= amount) {
          paid += 1;
        }
      }
    }
  }

  const remaining = Math.max(0, total - paid - dismissed);
  const maxPossiblePayable = amount * Math.max(0, total - dismissed);
  const outstandingAmount = Math.max(0, Math.round((maxPossiblePayable - totalActualPaid) * 100) / 100);
  const isActive = remaining > 0;
  const freq = Math.max(1, Number(installment.frequency) || 1);
  const monthlyAmount = isActive ? Math.round((amount / freq) * 100) / 100 : 0;

  return {
    total,
    paid,
    dismissed,
    remaining,
    outstandingAmount,
    monthlyAmount,
    isActive,
  };
}

export function getInstallmentFrequencyLabel(frequency?: number): {
  unit: string;
  perUnitSuffix: string;
  cadenceDescription: string;
} {
  const freq = Math.max(1, Number(frequency) || 1);
  switch (freq) {
    case 1:
      return { unit: 'month', perUnitSuffix: '/mo', cadenceDescription: 'Monthly' };
    case 2:
      return { unit: '2 months', perUnitSuffix: '/2 mos', cadenceDescription: 'Every 2 months' };
    case 3:
      return { unit: 'quarter', perUnitSuffix: '/quarter', cadenceDescription: 'Quarterly' };
    case 6:
      return { unit: 'half-year', perUnitSuffix: '/6 mos', cadenceDescription: 'Semi-annually' };
    case 12:
      return { unit: 'year', perUnitSuffix: '/yr', cadenceDescription: 'Annually' };
    default:
      return { unit: `${freq} months`, perUnitSuffix: `/every ${freq} mos`, cadenceDescription: `Every ${freq} months` };
  }
}

export function formatInstallmentRate(amount: number, frequency?: number): string {
  const { perUnitSuffix } = getInstallmentFrequencyLabel(frequency);
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0));
  return `${formatted} EGP${perUnitSuffix}`;
}

export interface ActiveInstallmentCommitmentSummary {
  hasActive: boolean;
  activeCount: number;
  monthlyTotal: number;
  quarterlyTotal: number;
  otherPeriodicTotal: number;
  primaryAmount: number;
  primaryUnitSuffix: string;
  primaryLabel: string;
  secondaryLabel?: string;
}

export function summarizeActiveInstallments(
  installments: Installment[],
  getProgress: (inst: Installment) => InstallmentProgress
): ActiveInstallmentCommitmentSummary {
  let monthlyTotal = 0;
  let quarterlyTotal = 0;
  let otherPeriodicTotal = 0;
  let activeCount = 0;
  let hasMonthly = false;
  let hasQuarterly = false;
  let hasOther = false;

  for (const inst of installments) {
    const progress = getProgress(inst);
    if (!progress.isActive) continue;
    activeCount += 1;
    const freq = Math.max(1, Number(inst.frequency) || 1);
    const amt = Number(inst.amount) || 0;

    if (freq === 1) {
      monthlyTotal += amt;
      hasMonthly = true;
    } else if (freq === 3) {
      quarterlyTotal += amt;
      hasQuarterly = true;
    } else {
      otherPeriodicTotal += amt;
      hasOther = true;
    }
  }

  const formatEgp = (val: number) =>
    `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(val))} EGP`;

  if (activeCount === 0) {
    return {
      hasActive: false,
      activeCount: 0,
      monthlyTotal: 0,
      quarterlyTotal: 0,
      otherPeriodicTotal: 0,
      primaryAmount: 0,
      primaryUnitSuffix: '',
      primaryLabel: '0 EGP',
    };
  }

  // Purely quarterly
  if (hasQuarterly && !hasMonthly && !hasOther) {
    return {
      hasActive: true,
      activeCount,
      monthlyTotal: 0,
      quarterlyTotal,
      otherPeriodicTotal: 0,
      primaryAmount: quarterlyTotal,
      primaryUnitSuffix: '/quarter',
      primaryLabel: `${formatEgp(quarterlyTotal)}/quarter`,
    };
  }

  // Purely monthly
  if (hasMonthly && !hasQuarterly && !hasOther) {
    return {
      hasActive: true,
      activeCount,
      monthlyTotal,
      quarterlyTotal: 0,
      otherPeriodicTotal: 0,
      primaryAmount: monthlyTotal,
      primaryUnitSuffix: '/mo',
      primaryLabel: `${formatEgp(monthlyTotal)}/mo`,
    };
  }

  // Mixed monthly + quarterly (or others)
  if (hasMonthly && hasQuarterly && !hasOther) {
    return {
      hasActive: true,
      activeCount,
      monthlyTotal,
      quarterlyTotal,
      otherPeriodicTotal: 0,
      primaryAmount: monthlyTotal,
      primaryUnitSuffix: '/mo',
      primaryLabel: `${formatEgp(monthlyTotal)}/mo`,
      secondaryLabel: `+ ${formatEgp(quarterlyTotal)}/qtr`,
    };
  }

  // If there are other frequencies
  const parts: string[] = [];
  if (hasMonthly) parts.push(`${formatEgp(monthlyTotal)}/mo`);
  if (hasQuarterly) parts.push(`${formatEgp(quarterlyTotal)}/qtr`);
  if (hasOther) parts.push(`${formatEgp(otherPeriodicTotal)} periodic`);

  return {
    hasActive: true,
    activeCount,
    monthlyTotal,
    quarterlyTotal,
    otherPeriodicTotal,
    primaryAmount: hasMonthly ? monthlyTotal : hasQuarterly ? quarterlyTotal : otherPeriodicTotal,
    primaryUnitSuffix: hasMonthly ? '/mo' : hasQuarterly ? '/qtr' : '',
    primaryLabel: parts[0] || '0 EGP',
    secondaryLabel: parts.length > 1 ? `+ ${parts.slice(1).join(' + ')}` : undefined,
  };
}


