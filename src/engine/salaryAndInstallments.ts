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
    const count = installment.remainingMonths !== undefined
      ? Math.max(0, Number(installment.remainingMonths))
      : total;
    if (count === 0) return [];
    const entries: CashEntry[] = [];

    for (let i = 0; i < count; i += 1) {
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
        account: installment.account || 'cib',
        type: 'expense',
        amount: Number(installment.amount) || 0,
        source: 'installment',
        loanId: installment.id,
        tag: installment.tag || 'Installment',
        note: `Installment: ${installment.name} (${i + 1}/${count})`,
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
  const count = installment.remainingMonths !== undefined
    ? Math.max(0, Number(installment.remainingMonths))
    : total;
  const deletedSet = new Set(deletedForecasts || []);
  const amount = Number(installment.amount) || 0;

  if (count === 0) {
    return {
      total: total,
      paid: total,
      dismissed: 0,
      remaining: 0,
      outstandingAmount: 0,
      monthlyAmount: 0,
      isActive: false,
    };
  }

  let paid = 0;
  let dismissed = 0;

  for (let i = 0; i < count; i += 1) {
    const totalMonthIndex = startYear * 12 + (startMonth - 1) + i * frequency;
    const y = Math.floor(totalMonthIndex / 12);
    const m = (totalMonthIndex % 12) + 1;
    const dateId = getInstallmentDateId(installment.id, y, m);

    if (deletedSet.has(dateId)) {
      dismissed += 1;
    } else {
      const actual = Number(entryActuals[dateId]) || 0;
      if (actual >= amount && actual > 0) {
        paid += 1;
      }
    }
  }

  const remaining = Math.max(0, count - paid - dismissed);
  const outstandingAmount = amount * remaining;
  const isActive = remaining > 0;
  const monthlyAmount = isActive ? amount : 0;

  return {
    total: count,
    paid,
    dismissed,
    remaining,
    outstandingAmount,
    monthlyAmount,
    isActive,
  };
}

