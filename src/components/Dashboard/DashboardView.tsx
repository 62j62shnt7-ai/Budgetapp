import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { calculateForecast, detectDeficits } from '../../engine/forecast';
import { computeFinancialHealthScore, generateSmartInsights } from '../../engine/healthScore';
import { computeTotalStorageValue } from '../../engine/currency';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import { isCreditCardExpense, calculateCreditSettlementDate } from '../../engine/creditCards';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { ForecastChart } from '../Forecast/ForecastChart';

export const DashboardView: React.FC = () => {
  const {
    accounts,
    entries,
    salaryPattern,
    installments,
    rates,
    storageAssets,
    setActiveTab,
  } = useBudgetStore();

  const [forecastRangeMonths, setForecastRangeMonths] = useState<number>(12);
  const [forecastMode, setForecastMode] = useState<'entries' | 'monthly'>('entries');
  const [simAmount, setSimAmount] = useState<string>('');
  const [simDate, setSimDate] = useState<string>(DateUtils.todayString());
  const [simVerdict, setSimVerdict] = useState<{ text: string; isDanger: boolean } | null>(null);

  // Financial calculations
  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const storageTotal = computeTotalStorageValue(storageAssets, rates);
  const netWorth = totalCash + storageTotal;

  // Credit dues with this month / next month breakdown
  const currentYm = DateUtils.currentYearMonth();
  const nextYm = DateUtils.addMonths(currentYm, 1);

  const creditExpenses = entries.filter((e) => isCreditCardExpense(e));

  const cibExpenses = creditExpenses.filter((e) => (e.creditType || e.account || '').toLowerCase().includes('cib'));
  const hsbcExpenses = creditExpenses.filter((e) => (e.creditType || e.account || '').toLowerCase().includes('hsbc'));

  const cibTotal = cibExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const hsbcTotal = hsbcExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const cibThisMonth = cibExpenses
    .filter((e) => DateUtils.getMonthKey(calculateCreditSettlementDate(e.date, 'cib')) === currentYm)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const cibNextMonth = cibExpenses
    .filter((e) => DateUtils.getMonthKey(calculateCreditSettlementDate(e.date, 'cib')) === nextYm)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const hsbcThisMonth = hsbcExpenses
    .filter((e) => DateUtils.getMonthKey(calculateCreditSettlementDate(e.date, 'hsbc')) === currentYm)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const hsbcNextMonth = hsbcExpenses
    .filter((e) => DateUtils.getMonthKey(calculateCreditSettlementDate(e.date, 'hsbc')) === nextYm)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Forecast & Deficits
  const salaryEntries = buildSalaryEntries(salaryPattern, currentYm, 4);
  const installmentEntries = buildInstallmentEntries(installments);
  const allCandidateEntries = [...entries, ...salaryEntries, ...installmentEntries];

  const forecast = calculateForecast(allCandidateEntries, totalCash, forecastRangeMonths);
  const deficits = detectDeficits(forecast);
  const health = computeFinancialHealthScore(forecast, deficits, totalCash, storageTotal);
  const insights = generateSmartInsights(forecast, deficits, totalCash, storageTotal);

  const lowestPoint = forecast.reduce(
    (min, f) => (f.balance < min ? f.balance : min),
    forecast.length > 0 ? forecast[0].balance : totalCash
  );

  const safeToSpend = Math.max(0, lowestPoint);

  // Spend Simulator
  const handleRunSim = () => {
    const amt = Number(simAmount);
    if (!amt || amt <= 0) return;
    const testDate = simDate || DateUtils.todayString();
    const testMonth = DateUtils.getMonthKey(testDate);

    let lowestSim = Infinity;
    let hitDeficit = false;

    forecast.forEach((f) => {
      let bal = f.balance;
      if (f.month >= testMonth) bal -= amt;
      if (bal < lowestSim) lowestSim = bal;
      if (bal < 0) hitDeficit = true;
    });

    if (hitDeficit) {
      setSimVerdict({
        text: `Spending ${formatMoney(amt)} triggers a deficit! Lowest balance drops to ${formatMoney(lowestSim)}.`,
        isDanger: true,
      });
    } else {
      setSimVerdict({
        text: `Safe to spend ${formatMoney(amt)}! Balance remains positive (lowest floor: ${formatMoney(lowestSim)}).`,
        isDanger: false,
      });
    }
  };

  const handleClearSim = () => {
    setSimAmount('');
    setSimVerdict(null);
  };

  return (
    <section className="view" id="dashboard" style={{ display: 'block' }}>
      {/* Deficit Alert Banner */}
      {deficits.hasDeficit && (
        <div className="alert-banner" id="deficitBanner">
          <div className="alert-banner-icon">!</div>
          <div className="alert-banner-body">
            <strong>Deficiencies detected</strong>
            <p id="deficitBannerSummary">
              Projected deficit of up to -{formatMoney(deficits.worstDeficit)} within the next {forecastRangeMonths} months.
            </p>
            <div id="deficitRemediationAdvice" className="deficit-remediation-pill" style={{ display: 'block' }}>
              Action recommended: Defer non-essential expenses or utilize credit card grace cycle.
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
          <strong id="totalNetWorth">{formatMoney(netWorth)}</strong>
          <small>Cash + Stored assets</small>
        </article>

        <article className="metric">
          <span>Actual cash today</span>
          <strong id="actualCashToday">{formatMoney(totalCash)}</strong>
          <small>Sum of account balances only</small>
        </article>

        {/* CIB Dual Metric */}
        <article className="metric credit-dual-metric">
          <div className="metric-header-row">
            <span>CIB credit due</span>
            <span className="credit-metric-badge" id="cibCreditBadge">15th Cutoff</span>
          </div>
          <strong id="cibCreditDue">{formatMoney(cibTotal)}</strong>
          <div className="credit-sub-grid">
            <div className="credit-sub-item">
              <span className="credit-sub-label" id="cibCurrentMonthLabel">This Month</span>
              <span className="credit-sub-val" id="cibCurrentDue">{formatMoney(cibThisMonth)}</span>
            </div>
            <div className="credit-sub-divider" />
            <div className="credit-sub-item">
              <span className="credit-sub-label" id="cibNextMonthLabel">Next Month</span>
              <span className="credit-sub-val" id="cibNextDue">{formatMoney(cibNextMonth)}</span>
            </div>
          </div>
        </article>

        {/* HSBC Dual Metric */}
        <article className="metric credit-dual-metric">
          <div className="metric-header-row">
            <span>HSBC credit due</span>
            <span className="credit-metric-badge" id="hsbcCreditBadge">End of Month</span>
          </div>
          <strong id="hsbcCreditDue">{formatMoney(hsbcTotal)}</strong>
          <div className="credit-sub-grid">
            <div className="credit-sub-item">
              <span className="credit-sub-label" id="hsbcCurrentMonthLabel">This Month</span>
              <span className="credit-sub-val" id="hsbcCurrentDue">{formatMoney(hsbcThisMonth)}</span>
            </div>
            <div className="credit-sub-divider" />
            <div className="credit-sub-item">
              <span className="credit-sub-label" id="hsbcNextMonthLabel">Next Month</span>
              <span className="credit-sub-val" id="hsbcNextDue">{formatMoney(hsbcNextMonth)}</span>
            </div>
          </div>
        </article>

        <article className="metric">
          <span>Stored assets</span>
          <strong id="storageTotal">{formatMoney(storageTotal)}</strong>
          <small>Gold, USD, EUR</small>
        </article>

        <article className="metric">
          <span>Forecast low point</span>
          <strong id="forecastLow" style={{ color: lowestPoint < 0 ? 'var(--red)' : 'inherit' }}>
            {formatMoney(lowestPoint)}
          </strong>
          <small id="forecastLowDate">Lowest projected cash</small>
        </article>

        <article className="metric">
          <span>Cashflow status</span>
          <strong id="cashflowStatus" style={{ color: deficits.hasDeficit ? 'var(--red)' : 'var(--green)' }}>
            {deficits.hasDeficit ? 'Deficit Risk' : 'Healthy'}
          </strong>
          <small id="cashflowStatusNote">
            {deficits.hasDeficit ? 'Review upcoming obligations' : 'Positive cash runway'}
          </small>
        </article>
      </div>

      {/* Advisory & Health Score */}
      <div className="content-grid dashboard-advisory-grid" style={{ marginTop: '18px' }}>
        <section className="panel health-score-panel">
          <div className="panel-heading" style={{ marginBottom: '10px' }}>
            <h3>Financial Health Score</h3>
            <span id="healthScoreBadge" className="health-badge">
              Grade {health.grade}
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
                <small id="healthScoreSummary" style={{ color: 'var(--muted)', display: 'block', marginTop: '8px', lineHeight: 1.4 }}>
                  {health.summaryNote} ({health.runwayMonths} months estimated runway)
                </small>
              </div>
            </div>
          </div>
        </section>

        <section className="panel insights-panel">
          <div className="panel-heading" style={{ marginBottom: '10px' }}>
            <h3>Smart Financial Insights</h3>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Real-time Advisory</span>
          </div>
          <div id="smartInsightsList" className="smart-insights-list">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="insight-item"
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'var(--surface-soft)',
                  marginBottom: '6px',
                  borderLeft: `3px solid ${insight.type === 'critical' ? 'var(--red)' : insight.type === 'warning' ? 'var(--amber)' : 'var(--green)'}`,
                }}
              >
                <strong style={{ fontSize: '12px', display: 'block' }}>{insight.title}</strong>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{insight.message}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Forecast Line Trajectory Section */}
      <div className="content-grid" style={{ marginTop: '18px' }}>
        <section className="panel panel-full-width forecast-line-panel">
          <div className="panel-heading forecast-line-heading">
            <div className="forecast-heading-left">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Forecast Trajectory</h3>
                <span id="forecastLineRangeBadge" className="forecast-range-badge">
                  {forecastRangeMonths} Months Projection
                </span>
                {deficits.hasDeficit && (
                  <span id="forecastDeficitAlertBadge" className="forecast-deficit-alert-badge" style={{ display: 'inline-block' }}>
                    ⚠️ Deficit Detected
                  </span>
                )}
              </div>
              <span id="forecastLineDateSpan" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                Entry-by-entry cashflow trajectory with deficit awareness
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
            <div className="forecast-sim-inputs">
              <span className="forecast-sim-label">🎯 Can I Spend:</span>
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
              <span className="forecast-sim-label">on</span>
              <input
                type="date"
                id="forecastSimDate"
                className="forecast-sim-date"
                value={simDate}
                onChange={(e) => setSimDate(e.target.value)}
              />
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
                {formatMoney(forecast.length > 0 ? forecast[forecast.length - 1].balance : totalCash)}
              </strong>
              <small className="forecast-kpi-sub" id="fLineEndMonth">
                {forecast.length > 0 ? forecast[forecast.length - 1].month : '—'}
              </small>
            </div>
            <div className="forecast-kpi-card">
              <span className="forecast-kpi-label">Lowest Balance</span>
              <strong className="forecast-kpi-value" id="fLineLowestPoint" style={{ color: lowestPoint < 0 ? 'var(--red)' : 'inherit' }}>
                {formatMoney(lowestPoint)}
              </strong>
              <small className="forecast-kpi-sub" id="fLineLowestDate">Lowest cash floor</small>
            </div>
            <div className="forecast-kpi-card" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
              <span className="forecast-kpi-label" style={{ color: 'var(--green)' }}>Safe to Spend Today</span>
              <strong className="forecast-kpi-value" id="fLineSafeToSpend" style={{ color: 'var(--green)' }}>
                {formatMoney(safeToSpend)}
              </strong>
              <small className="forecast-kpi-sub" id="fLineSafeSub">Before any deficit</small>
            </div>
            <div className="forecast-kpi-card">
              <span className="forecast-kpi-label">Plotted Entries</span>
              <strong className="forecast-kpi-value" id="fLineEntryCount">
                {allCandidateEntries.length}
              </strong>
              <small className="forecast-kpi-sub" id="fLineNetChange">Active records</small>
            </div>
          </div>

          {/* Interactive SVG Line Chart */}
          <div className="forecast-chart-container" id="forecastLineChartContainer">
            <ForecastChart data={forecast} />
          </div>
        </section>
      </div>
    </section>
  );
};
