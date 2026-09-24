// ==========================================================================
// Financial Health & Smart Insights Engine
// Faithful port of legacy computeFinancialHealthScore() and
// generateSmartInsights() — includes all 4 factors:
//   1. Deficit Safety & Proximity (0-25 pts)
//   2. Liquid Cash & Runway (0-25 pts)
//   3. Budget Adherence via category caps (0-25 pts)
//   4. Savings & Reserve Target (0-25 pts)
// ==========================================================================
import { DateUtils } from './dateUtils';
import { groupByMonth } from './forecast';
import type { CashEntry, CategoryCap, SavingsGoal, DeficitSummary, MonthlyForecast, HealthScoreResult, SmartInsight } from '../types';
import type { DailyDeficitPeriod } from './forecast';

export function computeFinancialHealthScore(params: {
  entries: CashEntry[];
  forecast: MonthlyForecast[];
  deficitPeriods: DailyDeficitPeriod[];
  actualCashNow: number;
  storageTotal: number;
  categoryCaps: CategoryCap[];
  savingsGoals: SavingsGoal[];
  entryActuals: Record<string, number>;
}): HealthScoreResult;
/** Backward-compatible adapter for the original positional engine API. */
export function computeFinancialHealthScore(
  forecast: MonthlyForecast[],
  deficits: DeficitSummary,
  actualCashNow: number,
  storageTotal: number
): HealthScoreResult;
export function computeFinancialHealthScore(
  paramsOrForecast: {
    entries: CashEntry[];
    forecast: MonthlyForecast[];
    deficitPeriods: DailyDeficitPeriod[];
    actualCashNow: number;
    storageTotal: number;
    categoryCaps: CategoryCap[];
    savingsGoals: SavingsGoal[];
    entryActuals: Record<string, number>;
  } | MonthlyForecast[],
  legacyDeficits?: DeficitSummary,
  legacyActualCashNow?: number,
  legacyStorageTotal?: number
): HealthScoreResult {
  const params = Array.isArray(paramsOrForecast)
    ? {
        entries: [],
        forecast: paramsOrForecast,
        deficitPeriods: [],
        actualCashNow: legacyActualCashNow || 0,
        storageTotal: legacyStorageTotal || 0,
        categoryCaps: [],
        savingsGoals: [],
        entryActuals: {},
      }
    : paramsOrForecast;
  const {
    entries,
    forecast,
    deficitPeriods,
    actualCashNow,
    storageTotal,
    categoryCaps,
    savingsGoals,
  } = params;
  const effectiveDeficitPeriods = Array.isArray(paramsOrForecast)
    ? (legacyDeficits?.deficitPeriods || []).map((period) => ({
        startDate: period.startDate,
        startAmount: -period.maxDeficit,
        initialTrigger: 'Deficit',
        initialEntry: {} as CashEntry,
        lowestBalance: -period.maxDeficit,
        lowestDate: period.endDate,
        lowestEntry: {} as CashEntry,
        resolvedDate: period.isResolved ? period.endDate : null,
        resolvedBy: null,
        isResolved: period.isResolved,
        daysInDeficit: period.shortfallDays,
        steps: [],
      }))
    : deficitPeriods;

  const today = DateUtils.todayString();
  const currentMonth = DateUtils.currentYearMonth();

  // Negative-balance months from the forecast
  const forecastNegMonths = forecast.filter((f) => f.balance < 0);

  // 1. Deficit Safety & Proximity Gatekeeper (0 - 25 pts + hard score cap)
  let deficitScore = 25;
  let hardScoreCap = 100;
  let deficitSummaryNote = '';

  if (effectiveDeficitPeriods && effectiveDeficitPeriods.length > 0) {
    const firstDeficit = effectiveDeficitPeriods[0];
    const daysUntilDeficit = firstDeficit.startDate ? DateUtils.daysBetween(today, firstDeficit.startDate) : 0;
    const isUnresolved = !firstDeficit.isResolved;

    if (daysUntilDeficit <= 30) {
      deficitScore = 0;
      hardScoreCap = isUnresolved ? 35 : 45;
      deficitSummaryNote = `Imminent deficit projected starting ${DateUtils.formatDisplayDate(firstDeficit.startDate)}.`;
    } else if (daysUntilDeficit <= 60) {
      deficitScore = isUnresolved ? 4 : 8;
      hardScoreCap = 60;
      deficitSummaryNote = `Near-term deficit projected in ${daysUntilDeficit} days (${DateUtils.formatDisplayDate(firstDeficit.startDate)}).`;
    } else {
      deficitScore = isUnresolved ? 8 : 14;
      hardScoreCap = 74;
      deficitSummaryNote = `Deficit projected in ${daysUntilDeficit} days (${DateUtils.formatDisplayDate(firstDeficit.startDate)}).`;
    }
  } else if (forecastNegMonths.length > 0) {
    deficitScore = 6;
    hardScoreCap = 52;
    deficitSummaryNote = `${forecastNegMonths.length} month(s) projected negative in forecast.`;
  }

  // 2. Liquid Cash & Overall Runway (0 - 25 pts)
  const currentMonthExpenses = entries
    .filter((e) => e.type === 'expense' && DateUtils.getMonthKey(e.date) === currentMonth)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const allMonthlyExpenses = groupByMonth(entries.filter((e) => e.type === 'expense'), (e) => Number(e.amount || 0));
  const expVals = Object.values(allMonthlyExpenses);
  const avgMonthlyExpense = expVals.length ? expVals.reduce((a, b) => a + b, 0) / expVals.length : (currentMonthExpenses || 1);

  let runwayScore = 25;
  if (avgMonthlyExpense > 0) {
    const liquidRunway = actualCashNow / avgMonthlyExpense;
    const totalNetWorth = actualCashNow + storageTotal;
    const totalRunway = totalNetWorth / avgMonthlyExpense;

    if (liquidRunway < 0.5 && storageTotal <= 0) {
      runwayScore = 4;
    } else if (totalRunway >= 6 && liquidRunway >= 1.5) {
      runwayScore = 25;
    } else if (totalRunway >= 3 && liquidRunway >= 1.0) {
      runwayScore = 20;
    } else if (totalRunway >= 1.5) {
      runwayScore = 14;
    } else if (totalRunway >= 0.5) {
      runwayScore = 8;
    } else {
      runwayScore = 4;
    }
  }

  // 3. Budget Adherence (0 - 25 pts) — matches legacy exactly
  let budgetScore = 20; // Default neutral if no caps
  if (categoryCaps && categoryCaps.length > 0) {
    let exceededCount = 0;
    categoryCaps.forEach((item) => {
      const spent = entries
        .filter(
          (e) =>
            e.type === 'expense' &&
            DateUtils.getMonthKey(e.date) === currentMonth &&
            (e.category || '').toLowerCase() === (item.category || '').toLowerCase()
        )
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const cap = Number(item.cap || 0);
      if (cap > 0 && spent > cap) exceededCount++;
    });
    if (exceededCount === 0) budgetScore = 25;
    else if (exceededCount === 1) budgetScore = 14;
    else budgetScore = 6;
  }

  // 4. Savings & Reserve Target (0 - 25 pts) — matches legacy exactly
  let savingsScore = 15;
  if (savingsGoals && savingsGoals.length > 0) {
    const totalTarget = savingsGoals.reduce((s, g) => s + Number(g.target || 0), 0);
    const totalCurrent = savingsGoals.reduce((s, g) => s + Number(g.current || 0), 0);
    if (totalTarget > 0) {
      const pct = totalCurrent / totalTarget;
      if (pct >= 0.8) savingsScore = 25;
      else if (pct >= 0.5) savingsScore = 20;
      else if (pct >= 0.25) savingsScore = 15;
      else savingsScore = 10;
    }
  }

  const rawScore = Math.round(deficitScore + runwayScore + budgetScore + savingsScore);
  const score = Math.min(hardScoreCap, Math.max(0, rawScore));

  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
  let label = 'Strong';
  let tone = 'strong';
  let summaryNote = 'Strong liquidity runway and positive cashflow horizon.';

  if (score < 55) {
    grade = 'C';
    label = 'Needs Focus';
    tone = 'attention';
    summaryNote = deficitSummaryNote || 'Deficit pressure or tight runway detected. Review upcoming expenses.';
  } else if (score < 78) {
    grade = 'B';
    label = 'Moderate';
    tone = 'moderate';
    summaryNote = deficitSummaryNote || 'Stable cashflow with opportunities to build larger reserve buffers.';
  }

  const runwayMonths = avgMonthlyExpense > 0 ? Math.round(((actualCashNow + storageTotal) / avgMonthlyExpense) * 10) / 10 : 0;

  return {
    score,
    grade,
    deficitScore,
    runwayScore,
    budgetScore,
    savingsScore,
    summaryNote,
    runwayMonths,
    label,
    tone,
    hardScoreCap,
  };
}

export function generateSmartInsights(params: {
  entries: CashEntry[];
  forecast: MonthlyForecast[];
  deficitPeriods: DailyDeficitPeriod[];
  actualCashNow: number;
  storageTotal: number;
  savingsGoals: SavingsGoal[];
}): SmartInsight[] {
  const { entries, forecast, deficitPeriods, actualCashNow, storageTotal, savingsGoals } = params;
  const insights: SmartInsight[] = [];
  const currentMonth = DateUtils.currentYearMonth();
  const today = DateUtils.todayString();
  const formatMoney = (v: number) => `${Math.round(v).toLocaleString()} EGP`;

  // 1. Deficit Horizon or Clean Projection
  if (deficitPeriods && deficitPeriods.length > 0) {
    const nextDeficit = deficitPeriods[0];
    const startFmt = DateUtils.formatDisplayDate(nextDeficit.startDate);
    const durStr = nextDeficit.daysInDeficit > 0 ? ` for ~${nextDeficit.daysInDeficit} days` : '';
    const fixStr = nextDeficit.resolvedBy ? ` until recovered by ${nextDeficit.resolvedBy}` : '';
    insights.push({
      id: 'deficit-alert',
      type: 'critical',
      title: 'Deficit Horizon',
      message: `Projected balance turns negative on ${startFmt}${durStr}${fixStr} (Peak deficit: ${formatMoney(Math.abs(nextDeficit.lowestBalance))}).`,
      actionText: 'View Deficits',
    });
  } else {
    // Calculate entry-by-entry cash floor for the clean runway insight
    const sortedFuture = [...entries]
      .filter((e) => e.date && e.date >= today)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
        return 0;
      });
    let runningFloor = actualCashNow;
    let minFloor = actualCashNow;
    let minDate = today;
    sortedFuture.forEach((e) => {
      runningFloor += Number(e.amount || 0) * (e.type === 'income' ? 1 : -1);
      if (runningFloor < minFloor) {
        minFloor = runningFloor;
        minDate = e.date;
      }
    });
    const floorLabel = minDate === today
      ? `Lowest floor: ${formatMoney(minFloor)} (Current)`
      : `Lowest floor: ${formatMoney(minFloor)} on ${DateUtils.formatDisplayDate(minDate)}`;
    insights.push({
      id: 'positive-runway',
      type: 'positive',
      title: 'Clean Runway',
      message: `Projected cash balance remains positive across all ${forecast.length} forecasted months (${floorLabel}).`,
    });
  }

  // 2. Top Expense Driver
  const currentExpenses = entries.filter((e) => e.type === 'expense' && DateUtils.getMonthKey(e.date) === currentMonth);
  const totalExp = currentExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  if (totalExp > 0) {
    const catMap: Record<string, number> = {};
    currentExpenses.forEach((e) => {
      const c = e.category || 'General';
      catMap[c] = (catMap[c] || 0) + Number(e.amount || 0);
    });
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length > 0) {
      const [topCat, topAmt] = sortedCats[0];
      const topPct = Math.round((topAmt / totalExp) * 100);
      if (topPct >= 35) {
        insights.push({
          id: 'top-expense-driver',
          type: 'tip',
          title: 'Top Expense Driver',
          message: `${topCat} represents ${topPct}% (${formatMoney(topAmt)}) of current month expenses.`,
        });
      }
    }
  }

  // 3. Stored Assets Vault
  if (storageTotal > 0) {
    const totalNetWorth = actualCashNow + storageTotal;
    const ratio = totalNetWorth > 0 ? Math.round((storageTotal / totalNetWorth) * 100) : 100;
    insights.push({
      id: 'storage-buffer',
      type: 'tip',
      title: 'Asset Vault',
      message: `${formatMoney(storageTotal)} held in gold/foreign reserves (${ratio}% of total net worth).`,
    });
  }

  // 4. Savings Goal Progress
  if (savingsGoals && savingsGoals.length > 0) {
    const totalTarget = savingsGoals.reduce((s, g) => s + Number(g.target || 0), 0);
    const totalCurrent = savingsGoals.reduce((s, g) => s + Number(g.current || 0), 0);
    if (totalTarget > 0) {
      const pct = Math.round((totalCurrent / totalTarget) * 100);
      insights.push({
        id: 'savings-progress',
        type: pct >= 80 ? 'positive' : pct >= 50 ? 'tip' : 'warning',
        title: 'Savings Progress',
        message: `${formatMoney(totalCurrent)} of ${formatMoney(totalTarget)} saved (${pct}% of target across ${savingsGoals.length} goal(s)).`,
      });
    }
  }

  // 5. Low Cash Buffer
  if (actualCashNow < 10000 && deficitPeriods.length === 0) {
    insights.push({
      id: 'low-cash-warning',
      type: 'warning',
      title: 'Low Cash Buffer',
      message: 'Current cash in active accounts is below 10,000 EGP. Ensure immediate bills are accounted for.',
    });
  }

  return insights;
}
