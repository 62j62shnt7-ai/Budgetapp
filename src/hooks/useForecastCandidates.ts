import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../store/useBudgetStore';
import { DateUtils } from '../engine/dateUtils';
import { buildSalaryEntries, buildInstallmentEntries } from '../engine/salaryAndInstallments';
import { buildCreditDueEntries } from '../engine/creditCards';
import { getActiveForecastEntries, calculateForecast, getDeficitPeriods, type DailyDeficitPeriod } from '../engine/forecast';
import type { CashEntry, MonthlyForecast } from '../types';

export interface ForecastInputsResult {
  totalCash: number;
  salaryEntries: CashEntry[];
  installmentEntries: CashEntry[];
  creditDueEntries: CashEntry[];
  allCandidateEntries: CashEntry[];
  forecast: MonthlyForecast[];
  deficitPeriods: DailyDeficitPeriod[];
  hasDeficit: boolean;
}

export function useForecastCandidates(forecastRangeMonths: number = 12): ForecastInputsResult {
  const {
    accounts,
    entries,
    archivedEntries,
    salaryPattern,
    salaryAnchorMonth,
    installments,
    creditDues,
    creditSettlementOverrides,
    entryActuals,
    entryActualDates,
    deletedForecasts,
  } = useBudgetStore(
    useShallow((state) => ({
      accounts: state.accounts,
      entries: state.entries,
      archivedEntries: state.archivedEntries,
      salaryPattern: state.salaryPattern,
      salaryAnchorMonth: state.salaryAnchorMonth,
      installments: state.installments,
      creditDues: state.creditDues,
      creditSettlementOverrides: state.creditSettlementOverrides,
      entryActuals: state.entryActuals,
      entryActualDates: state.entryActualDates,
      deletedForecasts: state.deletedForecasts,
    }))
  );

  return useMemo(() => {
    const totalCash = Object.values(accounts || {}).reduce(
      (sum, acc) => sum + (acc.balance || 0),
      0
    );
    const currentYm = DateUtils.currentYearMonth();
    const cutoffDateStr = DateUtils.formatDate(
      ...DateUtils.parseYearMonth(DateUtils.addMonths(currentYm, Math.max(0, forecastRangeMonths - 1))),
      DateUtils.getLastDayOfMonth(...DateUtils.parseYearMonth(DateUtils.addMonths(currentYm, Math.max(0, forecastRangeMonths - 1))))
    );
    const hasMaterializedSalary = (entries || []).some((entry) => entry.source === 'salary');
    const salaryEntries = hasMaterializedSalary
      ? []
      : buildSalaryEntries(salaryPattern || [], currentYm, Math.ceil(forecastRangeMonths / 3), salaryAnchorMonth);

    const installmentEntries = buildInstallmentEntries(installments || []);
    const creditDueEntries = buildCreditDueEntries({
      accounts: accounts || {},
      creditDues: creditDues || {},
      cashEntries: entries || [],
      archivedEntries: archivedEntries || [],
      entryActuals: entryActuals || {},
      entryActualDates: entryActualDates || {},
      creditSettlementOverrides: creditSettlementOverrides || {},
    });

    const candidateEntries = getActiveForecastEntries(
      [...(entries || []), ...salaryEntries],
      installmentEntries,
      creditDueEntries,
      deletedForecasts || [],
      entryActuals || {}
    );

    // Clamp candidate entries to the active forecast horizon so salary and installment horizons match
    const allCandidateEntries = candidateEntries.filter(
      (entry) => !entry.date || entry.date <= cutoffDateStr
    );

    const forecast = calculateForecast(allCandidateEntries, totalCash, forecastRangeMonths);
    const deficitPeriods = getDeficitPeriods(allCandidateEntries, totalCash);
    const hasDeficit = deficitPeriods.length > 0 || forecast.some((item) => item.balance < 0);

    return {
      totalCash,
      salaryEntries,
      installmentEntries,
      creditDueEntries,
      allCandidateEntries,
      forecast,
      deficitPeriods,
      hasDeficit,
    };
  }, [
    accounts,
    entries,
    archivedEntries,
    salaryPattern,
    salaryAnchorMonth,
    installments,
    creditDues,
    creditSettlementOverrides,
    entryActuals,
    entryActualDates,
    deletedForecasts,
    forecastRangeMonths,
  ]);
}
