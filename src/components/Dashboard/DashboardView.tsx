import React, { useEffect, useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  calculateForecast,
  getActiveForecastEntries,
  getDeficitPeriods,
  getLowestProjectedBalance,
  simulateSpend,
} from '../../engine/forecast';
import { computeFinancialHealthScore, generateSmartInsights } from '../../engine/healthScore';
import { computeAssetEgpValue, computeTotalStorageValue } from '../../engine/currency';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import {
  buildCreditDueEntries,
} from '../../engine/creditCards';
import { DateUtils, formatMoney, formatLastUpdated } from '../../engine/dateUtils';
import { ForecastChart } from '../Forecast/ForecastChart';
import { CreditCard, CheckCircle2, Clock } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const {
    accounts,
    entries,
    salaryPattern,
    salaryAnchorMonth,
    installments,
    rates,
    storageAssets,
    creditDues,
    archivedEntries,
    creditSettlementOverrides,
    entryActuals,
    deletedForecasts,
    setActiveTab,
  } = useBudgetStore();

  const [forecastRangeMonths, setForecastRangeMonths] = useState<number>(12);
  const [forecastMode, setForecastMode] = useState<'entries' | 'monthly'>('entries');
  const [simAmount, setSimAmount] = useState<string>('');
  const [simDate, setSimDate] = useState<string>(DateUtils.todayString());
  const [simVerdict, setSimVerdict] = useState<{ text: string; isDanger: boolean } | null>(null);
  const [dashboardDensity, setDashboardDensity] = useState<'comfortable' | 'compact'>(() =>
    localStorage.getItem('budget-control-dashboard-density') === 'compact' ? 'compact' : 'comfortable'
  );

  useEffect(() => {
    localStorage.setItem('budget-control-dashboard-density', dashboardDensity);
  }, [dashboardDensity]);

  // Periodic ticker so relative timestamps ("Just now", "5m ago") stay fresh in real-time
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Financial calculations
  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const storageTotal = computeTotalStorageValue(storageAssets, rates);
  const netWorth = totalCash + storageTotal;

  const storageChange = (() => {
    if (
      rates.previousStorageTotal &&
      rates.previousStorageTotal > 0 &&
      Math.round(storageTotal) !== Math.round(rates.previousStorageTotal)
    ) {
      const diff = storageTotal - rates.previousStorageTotal;
      const pct = (diff / rates.previousStorageTotal) * 100;
      return {
        pct,
        diff,
        isPositive: diff > 0,
        text: `${diff > 0 ? '+' : ''}${pct.toFixed(1)}%`,
        title: `${diff > 0 ? '+' : ''}${formatMoney(diff)} (${diff > 0 ? '+' : ''}${pct.toFixed(2)}%) since last rate update`,
      };
    }
    return null;
  })();

  // Credit dues with this month / next month breakdown
  const currentYm = DateUtils.currentYearMonth();
  const nextYm = DateUtils.addMonths(currentYm, 1);
  const creditDueEntries = buildCreditDueEntries({
    accounts,
    creditDues,
    cashEntries: entries,
    archivedEntries,
    entryActuals,
    creditSettlementOverrides,
  });
  const remainingDue = (entry: (typeof creditDueEntries)[number]) =>
    Math.max(0, Number(entry.amount || 0) - Number(entry.actualAmount || 0));
  const dueFor = (account: string, month: string) =>
    creditDueEntries
      .filter((entry) => {
        const prefix = `credit-settlement-${account}-`;
        return entry.id.startsWith(prefix) && entry.id.slice(prefix.length) === month;
      })
      .reduce((sum, entry) => sum + remainingDue(entry), 0);

  const cibThisMonth = dueFor('cib', currentYm);
  const cibNextMonth = dueFor('cib', nextYm);
  const hsbcThisMonth = dueFor('hsbc', currentYm);
  const hsbcNextMonth = dueFor('hsbc', nextYm);
  const cibTotal = cibThisMonth || cibNextMonth;
  const hsbcTotal = hsbcThisMonth || hsbcNextMonth;
  const activeCibMonth = cibThisMonth > 0 ? currentYm : nextYm;
  const activeHsbcMonth = hsbcThisMonth > 0 ? currentYm : nextYm;
  const monthLabel = (month: string, suffix: string) => {
    const [year, monthNumber] = month.split('-').map(Number);
    const name = new Date(Date.UTC(year, monthNumber - 1, 1))
      .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
      .toUpperCase();
    return `${name} (${suffix})`;
  };
  const cibDueDate = creditDueEntries.find(
    (entry) => entry.id === `credit-settlement-cib-${activeCibMonth}`
  )?.date;
  const hsbcDueDate = creditDueEntries.find(
    (entry) => entry.id === `credit-settlement-hsbc-${activeHsbcMonth}`
  )?.date;

  // Forecast & Deficits
  const hasMaterializedSalary = entries.some((entry) => entry.source === 'salary');
  const salaryEntries = hasMaterializedSalary ? [] : buildSalaryEntries(salaryPattern, currentYm, 12, salaryAnchorMonth);
  const installmentEntries = buildInstallmentEntries(installments);
  const allCandidateEntries = getActiveForecastEntries(
    [...entries, ...salaryEntries],
    installmentEntries,
    creditDueEntries,
    deletedForecasts,
    entryActuals
  );

  const forecast = calculateForecast(allCandidateEntries, totalCash, forecastRangeMonths);
  const visibleForecast = forecast.slice(0, forecastRangeMonths);
  const deficitPeriods = getDeficitPeriods(allCandidateEntries, totalCash);
  const health = computeFinancialHealthScore({
    entries: allCandidateEntries,
    forecast,
    deficitPeriods,
    actualCashNow: totalCash,
    storageTotal,
    entryActuals,
  });
  const insights = generateSmartInsights({
    entries: allCandidateEntries,
    forecast,
    deficitPeriods,
    actualCashNow: totalCash,
    storageTotal,
  });
  const deficits = {
    hasDeficit: deficitPeriods.length > 0 || forecast.some((item) => item.balance < 0),
    worstDeficit: Math.max(0, ...deficitPeriods.map((item) => Math.abs(item.lowestBalance))),
  };

  const lowestProjection = getLowestProjectedBalance(allCandidateEntries, totalCash);
  const lowestPoint = lowestProjection.balance;

  const safeToSpend = Math.max(0, lowestPoint);
  const plottedCutoff = DateUtils.addMonths(DateUtils.todayString(), forecastRangeMonths);
  const plottedEntryRows = allCandidateEntries.filter(
    (entry) => entry.date >= DateUtils.todayString() && entry.date <= plottedCutoff
  ).sort((a, b) => a.date.localeCompare(b.date));
  const plottedEntryCount = plottedEntryRows.length;
  const nextUpcomingEntries = plottedEntryRows.slice(0, 3);
  const nextUpcomingExpense = plottedEntryRows.find((entry) => entry.type === 'expense');
  const nextUpcomingIncome = plottedEntryRows.find((entry) => entry.type === 'income');
  const categoryTotals = allCandidateEntries
    .filter((entry) => entry.type === 'expense')
    .reduce<Record<string, number>>((totals, entry) => {
      const label = entry.subcategory || entry.category || 'Other';
      totals[label] = (totals[label] || 0) + Number(entry.amount || 0);
      return totals;
    }, {});
  const categoryRows = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const categoryTotal = categoryRows.reduce((sum, [, amount]) => sum + amount, 0);
  const assetRows = storageAssets.reduce<Record<string, number>>((totals, asset) => {
    const key = /gold/i.test(`${asset.category || ''} ${asset.name || ''} ${asset.rateSource || ''}`)
      ? 'Gold Assets'
      : 'Foreign Currency';
    totals[key] = (totals[key] || 0) + computeAssetEgpValue(asset, rates);
    return totals;
  }, {});
  assetRows['Liquid Cash / Bank'] = totalCash;
  const assetTotal = Object.values(assetRows).reduce((sum, amount) => sum + amount, 0);

  // Spend Simulator
  const handleRunSim = () => {
    const amt = Number(simAmount);
    if (!amt || amt <= 0) return;
    const testDate = simDate || DateUtils.todayString();
    const simulation = simulateSpend(
      allCandidateEntries,
      totalCash,
      testDate,
      amt
    );
    const hitDeficit = simulation.lowestBalance < 0;

    if (hitDeficit) {
      setSimVerdict({
        text: `Deficit Triggered: Spending ${formatMoney(amt)} on ${DateUtils.formatDisplayDate(testDate)} causes balance to turn negative on ${DateUtils.formatDisplayDate(simulation.triggerDate || testDate)} (${formatMoney(simulation.triggerBalance || 0)}), dropping to a low of ${formatMoney(simulation.lowestBalance)} on ${DateUtils.formatDisplayDate(simulation.lowestDate || testDate)}.`,
        isDanger: true,
      });
    } else {
      setSimVerdict({
        text: `Safe to spend ${formatMoney(amt)}! Balance remains positive (lowest floor: ${formatMoney(simulation.lowestBalance)} on ${DateUtils.formatDisplayDate(simulation.lowestDate || testDate)}).`,
        isDanger: false,
      });
    }
  };

  const handleClearSim = () => {
    setSimAmount('');
    setSimVerdict(null);
  };

  const firstDeficit = deficitPeriods[0];
  const remediationAdvice = firstDeficit
    ? (() => {
        const peak = Math.ceil(Math.abs(firstDeficit.lowestBalance));
        const fx = storageAssets.find((asset) => /eur|euro|usd|dollar|currency|foreign/i.test(asset.name) && Number(asset.quantity) > 0);
        const flexible = firstDeficit.steps.find((step) => step.type === 'expense' && !/installment|credit due|loan repayment|bill/i.test(step.category) && step.amount > 0);
        const options = [
          fx ? `Exchange approximately ${Math.ceil(peak / Math.max(1, Number(fx.rate || fx.currentPrice || 1)))} ${fx.unit || fx.name}` : 'Exchange foreign currency if available',
          'Liquidate gold or another liquid asset',
          flexible ? `Postpone ${flexible.category}` : 'Postpone a flexible expense',
          firstDeficit.resolvedDate
            ? `Bridge until ${DateUtils.formatDisplayDate(firstDeficit.resolvedDate)}`
            : `Bridge ${formatMoney(peak)} via short-term loan or credit`,
        ];
        return `Remediation: ${options.join(' · ')}`;
      })()
    : '';

  return (
    <section className={`view dashboard-view dashboard-density-${dashboardDensity}`} id="dashboard" style={{ display: 'block' }}>
      {/* Deficit Alert Banner */}
      {deficits.hasDeficit && (
        <div className="alert-banner" id="deficitBanner">
          <div className="alert-banner-icon">!</div>
          <div className="alert-banner-body">
            <strong>Deficiencies detected</strong>
            <p id="deficitBannerSummary">
              Balance turns negative on {DateUtils.formatDisplayDate(firstDeficit?.startDate || DateUtils.todayString())}
              {' · '}peak deficit {formatMoney(deficits.worstDeficit)}
              {firstDeficit?.isResolved ? ` · recovers on ${DateUtils.formatDisplayDate(firstDeficit.resolvedDate || firstDeficit.lowestDate)}` : ' · remains unresolved'}
            </p>
            <div id="deficitRemediationAdvice" className="deficit-remediation-pill" style={{ display: 'block' }}>
              {remediationAdvice}
            </div>
          </div>
          <button
            className="ghost-button"
            id="deficitBannerAction"
            type="button"
            onClick={() => setActiveTab('deficits')}
          >
            View Deficits
          </button>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <article className="metric highlight-metric">
          <span>Total Net Worth</span>
          <strong id="totalNetWorth" style={{ color: 'var(--green, #10b981)', fontWeight: 800 }}>
            {formatMoney(netWorth)}
          </strong>
          <small>Cash + Stored assets</small>
        </article>

        <article className="metric">
          <span>Actual cash today</span>
          <strong id="actualCashToday" style={{ color: '#38bdf8', fontWeight: 800 }}>
            {formatMoney(totalCash)}
          </strong>
          <small>Sum of account balances only</small>
        </article>

        {/* CIB Dual Metric */}
        <article className="metric credit-dual-metric cib-metric-card">
          <div className="metric-header-row">
            <div className="credit-card-title">
              <CreditCard size={15} className="credit-card-icon cib" />
              <span>CIB Credit Card</span>
            </div>
            <span
              className={`credit-metric-badge ${cibDueDate && DateUtils.daysBetween(DateUtils.todayString(), cibDueDate) >= 0 && DateUtils.daysBetween(DateUtils.todayString(), cibDueDate) <= 7 && cibThisMonth > 0 ? 'urgent' : cibThisMonth === 0 ? 'settled' : ''}`}
              id="cibCreditBadge"
            >
              {cibThisMonth === 0 ? (
                <>
                  <CheckCircle2 size={11} style={{ marginRight: '4px' }} />
                  {cibDueDate ? `Due ${DateUtils.formatDisplayDate(cibDueDate)}` : '15th Cutoff'}
                </>
              ) : (
                <>
                  <Clock size={11} style={{ marginRight: '4px' }} />
                  {cibDueDate ? `Due ${DateUtils.formatDisplayDate(cibDueDate)}` : '15th Cutoff'}
                </>
              )}
            </span>
          </div>
          <div className="credit-amount-hero">
            <strong
              id="cibCreditDue"
              className="credit-amount-value"
              style={{
                color: cibThisMonth > 0 ? 'var(--red, #f43f5e)' : cibTotal > 0 ? 'var(--amber, #f59e0b)' : 'var(--muted)',
                fontWeight: 800,
              }}
            >
              {formatMoney(cibTotal)}
            </strong>
            <span className="credit-amount-sublabel">
              {cibThisMonth > 0 ? 'Immediate due this cycle' : cibNextMonth > 0 ? 'Upcoming next cycle' : 'No dues pending'}
            </span>
          </div>
          <div className="credit-sub-grid">
            <div className={`credit-sub-item ${cibThisMonth > 0 ? 'is-due' : 'is-settled'}`}>
              <span className="credit-sub-label" id="cibCurrentMonthLabel">{monthLabel(currentYm, 'THIS MO')}</span>
              <span className="credit-sub-val" id="cibCurrentDue">
                {cibThisMonth > 0 ? formatMoney(cibThisMonth) : '0 EGP · Settled'}
              </span>
            </div>
            <div className="credit-sub-item upcoming">
              <span className="credit-sub-label" id="cibNextMonthLabel">{monthLabel(nextYm, 'NEXT MO')}</span>
              <span className="credit-sub-val" id="cibNextDue">
                {formatMoney(cibNextMonth)}
              </span>
            </div>
          </div>
        </article>

        {/* HSBC Dual Metric */}
        <article className="metric credit-dual-metric hsbc-metric-card">
          <div className="metric-header-row">
            <div className="credit-card-title">
              <CreditCard size={15} className="credit-card-icon hsbc" />
              <span>HSBC Credit Card</span>
            </div>
            <span
              className={`credit-metric-badge ${hsbcDueDate && DateUtils.daysBetween(DateUtils.todayString(), hsbcDueDate) >= 0 && DateUtils.daysBetween(DateUtils.todayString(), hsbcDueDate) <= 7 && hsbcThisMonth > 0 ? 'urgent' : hsbcThisMonth === 0 ? 'settled' : ''}`}
              id="hsbcCreditBadge"
            >
              {hsbcThisMonth === 0 ? (
                <>
                  <CheckCircle2 size={11} style={{ marginRight: '4px' }} />
                  {hsbcDueDate ? `Due ${DateUtils.formatDisplayDate(hsbcDueDate)}` : 'End of Month'}
                </>
              ) : (
                <>
                  <Clock size={11} style={{ marginRight: '4px' }} />
                  {hsbcDueDate ? `Due ${DateUtils.formatDisplayDate(hsbcDueDate)}` : 'End of Month'}
                </>
              )}
            </span>
          </div>
          <div className="credit-amount-hero">
            <strong
              id="hsbcCreditDue"
              className="credit-amount-value"
              style={{
                color: hsbcThisMonth > 0 ? 'var(--red, #f43f5e)' : hsbcTotal > 0 ? 'var(--amber, #f59e0b)' : 'var(--muted)',
                fontWeight: 800,
              }}
            >
              {formatMoney(hsbcTotal)}
            </strong>
            <span className="credit-amount-sublabel">
              {hsbcThisMonth > 0 ? 'Immediate due this cycle' : hsbcNextMonth > 0 ? 'Upcoming next cycle' : 'No dues pending'}
            </span>
          </div>
          <div className="credit-sub-grid">
            <div className={`credit-sub-item ${hsbcThisMonth > 0 ? 'is-due' : 'is-settled'}`}>
              <span className="credit-sub-label" id="hsbcCurrentMonthLabel">{monthLabel(currentYm, 'THIS MO')}</span>
              <span className="credit-sub-val" id="hsbcCurrentDue">
                {hsbcThisMonth > 0 ? formatMoney(hsbcThisMonth) : '0 EGP · Settled'}
              </span>
            </div>
            <div className="credit-sub-item upcoming">
              <span className="credit-sub-label" id="hsbcNextMonthLabel">{monthLabel(nextYm, 'NEXT MO')}</span>
              <span className="credit-sub-val" id="hsbcNextDue">
                {formatMoney(hsbcNextMonth)}
              </span>
            </div>
          </div>
        </article>

        <article className="metric">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>Stored assets</span>
            {rates.lastFetched && (
              <span
                id="storageLastPulled"
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--muted, #94a3b8)',
                  fontWeight: 500,
                }}
                title={`Last pulled: ${new Date(rates.lastFetched).toLocaleString()}`}
              >
                {formatLastUpdated(rates.lastFetched)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong id="storageTotal" style={{ color: '#fbbf24', fontWeight: 800 }}>
              {formatMoney(storageTotal)}
            </strong>
            {storageChange && (
              <span
                id="storageChangePct"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: storageChange.isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  color: storageChange.isPositive ? 'var(--green, #10b981)' : 'var(--red, #f43f5e)',
                }}
                title={storageChange.title}
              >
                {storageChange.text}
              </span>
            )}
          </div>
          <small>Gold, USD, EUR</small>
        </article>

        <article className="metric">
          <span>Forecast low point</span>
          <strong
            id="forecastLow"
            style={{
              color: lowestPoint < 0 ? 'var(--red, #f43f5e)' : lowestPoint < 15000 ? 'var(--amber, #f59e0b)' : '#34d399',
              fontWeight: 800,
            }}
          >
            {formatMoney(lowestPoint)}
          </strong>
          <small id="forecastLowDate">
            {lowestProjection.date ? `Floor on ${DateUtils.formatDisplayDate(lowestProjection.date)}` : 'Lowest projected cash'}
          </small>
        </article>

        <article className="metric">
          <span>Cashflow status</span>
          <strong id="cashflowStatus" style={{ color: deficits.hasDeficit ? 'var(--red, #f43f5e)' : 'var(--green, #10b981)', fontWeight: 800 }}>
            {deficits.hasDeficit ? 'Deficit Risk' : 'OK'}
          </strong>
          <small id="cashflowStatusNote">
            {deficits.hasDeficit ? 'Review upcoming obligations' : 'Cash stays positive across entire forecast'}
          </small>
        </article>
      </div>

      {/* Advisory & Health Score */}
      <div className="content-grid dashboard-advisory-grid dashboard-section-block">
        <section className="panel health-score-panel">
          <div className="panel-heading panel-heading-compact">
            <h3>Financial Health Score</h3>
            <span id="healthScoreBadge" className="health-badge">
              {health.label?.toUpperCase() ?? `GRADE ${health.grade}`}
            </span>
          </div>
          <div className="health-score-body">
            <div className="health-score-main">
              <div className="health-score-number" id="healthScoreValue">
                {health.score}
              </div>
              <div className="health-score-meta">
                <div className="health-score-track">
                  <div
                    className="health-score-fill"
                    id="healthScoreFill"
                    style={{ width: `${health.score}%` }}
                  />
                </div>
                <small id="healthScoreSummary" className="health-score-summary">
                  {health.summaryNote}
                </small>
              </div>
            </div>
          </div>
        </section>

        <section className="panel insights-panel">
          <div className="panel-heading panel-heading-compact">
            <h3>Smart Financial Insights</h3>
            <span className="panel-kicker">Real-time Advisory</span>
          </div>
          <div id="smartInsightsList" className="smart-insights-list">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`insight-item insight-item--${insight.type}`}
              >
                <strong>{insight.title}</strong>
                <span>{insight.message}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel dashboard-focus-panel dashboard-section-block" aria-labelledby="dashboardFocusHeading">
        <div className="panel-heading panel-heading-compact dashboard-focus-heading">
          <div className="dashboard-focus-title">
            <h3 id="dashboardFocusHeading">Today at a glance</h3>
            <span className="panel-kicker">Your next useful actions</span>
          </div>
          <button
            type="button"
            className="ghost-button dashboard-density-toggle"
            aria-pressed={dashboardDensity === 'compact'}
            onClick={() => setDashboardDensity((current) => current === 'compact' ? 'comfortable' : 'compact')}
          >
            {dashboardDensity === 'compact' ? 'Comfortable view' : 'Compact view'}
          </button>
        </div>
        <div className="dashboard-focus-grid">
          <div className="dashboard-focus-card dashboard-focus-card--safe">
            <span className="dashboard-focus-label">Safe to spend</span>
            <strong style={{ color: 'var(--green, #10b981)', fontWeight: 800 }}>{formatMoney(safeToSpend)}</strong>
            <small>Protected by your lowest projected floor</small>
          </div>
          <div className={`dashboard-focus-card ${deficits.hasDeficit ? 'dashboard-focus-card--danger' : 'dashboard-focus-card--safe'}`}>
            <span className="dashboard-focus-label">{deficits.hasDeficit ? 'Deficit watch' : 'Forecast status'}</span>
            <strong style={{ color: deficits.hasDeficit ? 'var(--red, #f43f5e)' : 'var(--green, #10b981)', fontWeight: 800 }}>
              {deficits.hasDeficit ? formatMoney(deficits.worstDeficit) : 'Covered'}
            </strong>
            <small>{deficits.hasDeficit ? 'Review the remediation plan above' : 'No negative balance in the forecast'}</small>
          </div>
          <div className="dashboard-focus-card">
            <span className="dashboard-focus-label">Next expense</span>
            <strong style={{ color: nextUpcomingExpense ? 'var(--red, #f43f5e)' : 'var(--muted)', fontWeight: 700 }}>
              {nextUpcomingExpense ? `-${formatMoney(nextUpcomingExpense.amount)}` : 'None'}
            </strong>
            <small>{nextUpcomingExpense ? `${nextUpcomingExpense.category} · ${DateUtils.formatDisplayDate(nextUpcomingExpense.date)}` : 'No upcoming expense in range'}</small>
          </div>
          <div className="dashboard-focus-card">
            <span className="dashboard-focus-label">Next income</span>
            <strong style={{ color: nextUpcomingIncome ? 'var(--green, #10b981)' : 'var(--muted)', fontWeight: 700 }}>
              {nextUpcomingIncome ? `+${formatMoney(nextUpcomingIncome.amount)}` : 'None'}
            </strong>
            <small>{nextUpcomingIncome ? `${nextUpcomingIncome.category} · ${DateUtils.formatDisplayDate(nextUpcomingIncome.date)}` : 'No upcoming income in range'}</small>
          </div>
        </div>
        {nextUpcomingEntries.length > 0 && (
          <div className="dashboard-upcoming-list" aria-label="Next upcoming entries">
            {nextUpcomingEntries.map((entry) => (
              <div key={entry.id} className="dashboard-upcoming-row">
                <span>{DateUtils.formatDisplayDate(entry.date)}</span>
                <strong>{entry.category}</strong>
                <span className={`pill ${entry.type}`}>{entry.type === 'income' ? '+' : '-'}{formatMoney(entry.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Forecast Line Trajectory Section */}
      <div className="dashboard-section-block">
        <section className="panel panel-full-width forecast-line-panel">
          <div className="panel-heading forecast-line-heading">
            <div className="forecast-heading-left">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Forecast Trajectory</h3>
                <span id="forecastLineRangeBadge" className="forecast-range-badge">
                  {forecastRangeMonths} Months
                </span>
                {deficits.hasDeficit && (
                  <span id="forecastDeficitAlertBadge" className="forecast-deficit-alert-badge" style={{ display: 'inline-block' }}>
                    ⚠️ Deficit Detected
                  </span>
                )}
              </div>
              <span id="forecastLineDateSpan" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                {DateUtils.formatDisplayDate(DateUtils.todayString())} (Current Balance)
                {' → '}
                {plottedEntryRows.length
                  ? DateUtils.formatDisplayDate(plottedEntryRows[plottedEntryRows.length - 1].date)
                  : DateUtils.formatDisplayDate(DateUtils.todayString())}
                {' • Entry-by-entry cashflow trajectory'}
              </span>
            </div>

            <div className="forecast-toolbar">
              <div className="forecast-view-toggle">
                <button
                  type="button"
                  className={`forecast-mode-btn ${forecastMode === 'entries' ? 'active' : ''}`}
                  onClick={() => setForecastMode('entries')}
                >
                  Entry Points
                </button>
                <button
                  type="button"
                  className={`forecast-mode-btn ${forecastMode === 'monthly' ? 'active' : ''}`}
                  onClick={() => setForecastMode('monthly')}
                >
                  Monthly
                </button>
              </div>

              <div className="forecast-range-group" role="group" aria-label="Forecast Month Range">
                <span className="forecast-range-label">Range:</span>
                <div className="forecast-presets">
                  {[3, 6, 12, 24].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`forecast-preset-btn ${forecastRangeMonths === m ? 'active' : ''}`}
                      onClick={() => setForecastRangeMonths(m)}
                    >
                      {m}M
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`forecast-preset-btn ${forecastRangeMonths === 36 ? 'active' : ''}`}
                    onClick={() => setForecastRangeMonths(36)}
                  >
                    All
                  </button>
                </div>
                <div className="forecast-slider-wrap" title="Custom month range">
                  <input
                    type="range"
                    id="forecastRangeSlider"
                    aria-label="Forecast month range"
                    min="1"
                    max="36"
                    value={forecastRangeMonths}
                    step="1"
                    onChange={(e) => setForecastRangeMonths(Number(e.target.value))}
                  />
                  <span id="forecastSliderValue" className="forecast-slider-val">
                    {forecastRangeMonths}m
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* "Can I Spend X?" Simulator Toolbar */}
          <div className="forecast-sim-bar" id="forecastSimBar">
            <div className="forecast-sim-header">
              <span className="forecast-sim-title">🎯 Can I Spend:</span>
            </div>
            <div className="forecast-sim-fields">
              <div className="forecast-sim-input-group">
                <input
                  type="number"
                  id="forecastSimAmount"
                  placeholder="Amount (e.g. 15,000)"
                  className="forecast-sim-input"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                />
                <span className="forecast-sim-currency">EGP</span>
              </div>
              <div className="forecast-sim-date-wrap">
                <span className="forecast-sim-on-label">on</span>
                <input
                  type="date"
                  id="forecastSimDate"
                  aria-label="Spend simulation date"
                  className="forecast-sim-date"
                  value={simDate}
                  onChange={(e) => setSimDate(e.target.value)}
                />
              </div>
            </div>
            <div className="forecast-sim-actions">
              <button
                type="button"
                className="primary-button forecast-sim-btn"
                id="forecastSimRunBtn"
                onClick={handleRunSim}
              >
                Test Spend
              </button>
              {simVerdict && (
                <button
                  type="button"
                  className="ghost-button forecast-sim-btn"
                  id="forecastSimClearBtn"
                  onClick={handleClearSim}
                >
                  Clear Test
                </button>
              )}
            </div>

            {simVerdict && (
              <div
                className="forecast-sim-verdict"
                id="forecastSimVerdict"
                style={{
                  display: 'block',
                  color: simVerdict.isDanger ? 'var(--red)' : 'var(--green)',
                  fontWeight: 600,
                  marginTop: '8px',
                }}
              >
                {simVerdict.text}
              </div>
            )}
          </div>

          {/* KPI Mini Cards Row */}
          <div className="forecast-kpi-grid">
            <div className="forecast-kpi-card">
              <span className="forecast-kpi-label">Starting Cash</span>
              <strong className="forecast-kpi-value" id="fLineStartCash">
                {formatMoney(totalCash)}
              </strong>
              <small className="forecast-kpi-sub" id="fLineStartMonth">Today</small>
            </div>
            <div className="forecast-kpi-card">
              <span className="forecast-kpi-label">Projected Ending</span>
              <strong className="forecast-kpi-value" id="fLineEndCash">
                {formatMoney(visibleForecast.length > 0 ? visibleForecast[visibleForecast.length - 1].balance : totalCash)}
              </strong>
              <small className="forecast-kpi-sub" id="fLineEndMonth">
                {visibleForecast.length > 0 ? visibleForecast[visibleForecast.length - 1].month : '—'}
              </small>
            </div>
            <div className="forecast-kpi-card">
              <span className="forecast-kpi-label">Lowest Balance</span>
              <strong className="forecast-kpi-value" id="fLineLowestPoint" style={{ color: lowestPoint < 0 ? 'var(--red)' : 'inherit' }}>
                {formatMoney(lowestPoint)}
              </strong>
              <small className="forecast-kpi-sub" id="fLineLowestDate">
                {lowestProjection.date ? `Floor: ${DateUtils.formatDisplayDate(lowestProjection.date)}` : 'Lowest cash floor'}
              </small>
            </div>
            <div className="forecast-kpi-card" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
              <span className="forecast-kpi-label" style={{ color: 'var(--green)' }}>Safe to Spend Today</span>
              <strong className="forecast-kpi-value" id="fLineSafeToSpend" style={{ color: 'var(--green)' }}>
                {formatMoney(safeToSpend)}
              </strong>
              <small className="forecast-kpi-sub" id="fLineSafeSub">Safe floor: {formatMoney(safeToSpend)}</small>
            </div>
            <div className="forecast-kpi-card">
              <span className="forecast-kpi-label">Plotted Entries</span>
              <strong className="forecast-kpi-value" id="fLineEntryCount">
                {plottedEntryCount} Entries
              </strong>
              <small className="forecast-kpi-sub" id="fLineNetChange">
                {(visibleForecast[visibleForecast.length - 1]?.balance || totalCash) - totalCash >= 0 ? '+' : ''}
                {formatMoney((visibleForecast[visibleForecast.length - 1]?.balance || totalCash) - totalCash)} Net
              </small>
            </div>
          </div>

          {/* Interactive SVG Line Chart */}
          <div className="forecast-chart-container" id="forecastLineChartContainer">
            <ForecastChart
              entries={allCandidateEntries}
              totalCash={totalCash}
              rangeMonths={forecastRangeMonths}
              mode={forecastMode}
              simAmount={Number(simAmount) || 0}
              simDate={simDate}
              onSelectDate={(date) => {
                setSimDate(date);
              }}
            />
          </div>
        </section>

        <section className="content-grid dashboard-summary-grid" style={{ marginTop: '16px' }}>
          <section className="panel">
            <div className="panel-heading">
              <h3 style={{ margin: 0 }}>Category expense breakdown</h3>
            </div>
            {categoryRows.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No expense categories yet</p>
            ) : (
              <div className="stack-list">
                {categoryRows.map(([category, amount]) => (
                  <div key={category} className="list-row">
                    <span>{category}</span>
                    <strong>{formatMoney(amount)} ({categoryTotal ? Math.round((amount / categoryTotal) * 100) : 0}%)</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3 style={{ margin: 0 }}>Asset allocation</h3>
              <strong>{formatMoney(assetTotal)}</strong>
            </div>
            <div className="stack-list">
              {Object.entries(assetRows)
                .filter(([, amount]) => amount > 0)
                .map(([label, amount]) => (
                  <div key={label} className="list-row">
                    <span>
                      {label === 'Foreign Currency' ? '💱 ' : label === 'Gold Assets' ? '🪙 ' : label === 'Liquid Cash / Bank' ? '💵 ' : ''}
                      {label}
                    </span>
                    <strong>{formatMoney(amount)} ({assetTotal ? Math.round((amount / assetTotal) * 100) : 0}%)</strong>
                  </div>
                ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3 style={{ margin: 0 }}>Forecast warning</h3>
            </div>
            {deficits.hasDeficit ? (
              <div className="list-row danger-row">
                <span>Cashflow deficit projected</span>
                <strong>{formatMoney(deficits.worstDeficit)}</strong>
              </div>
            ) : (
              <div className="list-row success-row">
                <span>Cashflow is covered</span>
                <strong>No deficit</strong>
              </div>
            )}
          </section>
        </section>
      </div>
    </section>
  );
};
