// ==========================================================================
// Financial Health & Smart Insights Engine
// ==========================================================================
import type { DeficitSummary, HealthScoreResult, MonthlyForecast, SmartInsight } from '../types';

export function computeFinancialHealthScore(
  forecast: MonthlyForecast[],
  deficitSummary: DeficitSummary,
  actualCashNow: number,
  storageTotal: number
): HealthScoreResult {
  // 1. Deficit Analysis (Max 40 points)
  let deficitScore = 40;
  let summaryNote = 'Strong liquidity position with positive projected runway.';

  if (deficitSummary.hasDeficit) {
    const worst = deficitSummary.worstDeficit;
    if (worst > actualCashNow * 2) {
      deficitScore = 5;
      summaryNote = 'Critical cashflow gap forecasted in upcoming months.';
    } else if (worst > actualCashNow) {
      deficitScore = 15;
      summaryNote = 'Projected balance drops into negative before end of forecast horizon.';
    } else {
      deficitScore = 25;
      summaryNote = 'Temporary deficit period detected; monitor upcoming obligations.';
    }
  }

  // 2. Runway Analysis (Max 35 points)
  const avgMonthlyExpense =
    forecast.length > 0
      ? forecast.reduce((s, f) => s + f.expense, 0) / forecast.length
      : 1;

  const runwayMonths = avgMonthlyExpense > 0 ? (actualCashNow + storageTotal) / avgMonthlyExpense : 0;
  let runwayScore = 10;
  if (runwayMonths >= 6) {
    runwayScore = 35;
  } else if (runwayMonths >= 3) {
    runwayScore = 25;
  } else if (runwayMonths >= 1) {
    runwayScore = 18;
  }

  // 3. Asset & Savings Buffer (Max 25 points)
  let savingsScore = 10;
  if (storageTotal > avgMonthlyExpense * 3) {
    savingsScore = 25;
  } else if (storageTotal > 0) {
    savingsScore = 18;
  }

  const rawScore = Math.min(100, Math.max(0, deficitScore + runwayScore + savingsScore));
  const score = deficitSummary.hasDeficit && deficitSummary.worstDeficit > actualCashNow ? Math.min(rawScore, 58) : rawScore;

  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 40) grade = 'D';

  return {
    score,
    grade,
    deficitScore,
    runwayScore,
    savingsScore,
    summaryNote,
    runwayMonths: Math.round(runwayMonths * 10) / 10,
  };
}

export function generateSmartInsights(
  _forecast: MonthlyForecast[],
  deficitSummary: DeficitSummary,
  actualCashNow: number,
  storageTotal: number
): SmartInsight[] {
  const insights: SmartInsight[] = [];

  if (deficitSummary.hasDeficit) {
    insights.push({
      id: 'deficit-alert',
      type: 'critical',
      title: 'Cashflow Deficit Ahead',
      message: `A deficit of up to ${Math.round(deficitSummary.worstDeficit).toLocaleString()} EGP is projected. Consider deferring non-essential expenses or adjusting credit card cycle drawdowns.`,
      actionText: 'View Forecast',
    });
  } else {
    insights.push({
      id: 'positive-runway',
      type: 'positive',
      title: 'Stable Cash Runway',
      message: 'All projected months maintain a positive closing cash balance under current spending patterns.',
    });
  }

  if (storageTotal > 0) {
    insights.push({
      id: 'storage-buffer',
      type: 'tip',
      title: 'Reserve Asset Safety Net',
      message: `You have ${Math.round(storageTotal).toLocaleString()} EGP in stored gold & foreign currency acting as secondary liquidity.`,
    });
  }

  if (actualCashNow < 10000 && !deficitSummary.hasDeficit) {
    insights.push({
      id: 'low-cash-warning',
      type: 'warning',
      title: 'Low Cash Buffer',
      message: 'Current cash in active accounts is below 10,000 EGP. Ensure immediate bills are accounted for.',
    });
  }

  return insights;
}
