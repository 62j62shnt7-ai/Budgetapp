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

export function buildInstallmentEntries(installments: Installment[]): CashEntry[] {
  return installments.flatMap((installment) => {
    const [startYear, startMonth] = DateUtils.parseYearMonth(installment.startMonth);
    const frequency = Math.max(1, Number(installment.frequency) || 1);
    const count = Number(installment.remainingMonths) || Number(installment.totalMonths) || 0;
    const entries: CashEntry[] = [];

    for (let i = 0; i < count; i += 1) {
      const totalMonthIndex = startYear * 12 + (startMonth - 1) + i * frequency;
      const y = Math.floor(totalMonthIndex / 12);
      const m = (totalMonthIndex % 12) + 1;
      const lastDay = DateUtils.getLastDayOfMonth(y, m);
      const day = Math.min(Number(installment.day) || 30, lastDay);

      entries.push({
        id: `installment-${installment.id}-${i}`,
        date: DateUtils.formatDate(y, m, day),
        category: installment.name,
        subcategory: installment.name,
        account: installment.account || 'cib',
        type: 'expense',
        amount: Number(installment.amount) || 0,
        source: 'installment',
        tag: installment.tag || 'Installment',
        note: `Installment: ${installment.name} (${i + 1}/${count})`,
      });
    }

    return entries;
  });
}
