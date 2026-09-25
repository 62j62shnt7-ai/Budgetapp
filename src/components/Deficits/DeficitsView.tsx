import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  calculateForecast,
  getActiveForecastEntries,
  getDeficitPeriods,
  getEntryActualAmount,
  getForecastCandidateEntries,
  isPartialTracked,
  getRemainingForecastAmount,
  isOngoingEntry,
} from '../../engine/forecast';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import { buildCreditDueEntries } from '../../engine/creditCards';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { AlertCircle, Clock, CheckCircle } from 'lucide-react';

interface DeficitsViewProps {
  onBridgeDeficit?: () => void;
}

export const DeficitsView: React.FC<DeficitsViewProps> = ({ onBridgeDeficit }) => {
  const {
    accounts,
    entries,
    salaryPattern,
    salaryAnchorMonth,
    installments,
    creditDues,
    archivedEntries,
    creditSettlementOverrides,
    entryActuals,
    deletedForecasts,
    recordActual,
  } = useBudgetStore();

  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const currentYm = DateUtils.currentYearMonth();
  const hasMaterializedSalary = entries.some((entry) => entry.source === 'salary');
  const salaryEntries = hasMaterializedSalary ? [] : buildSalaryEntries(salaryPattern, currentYm, 12, salaryAnchorMonth);
  const installmentEntries = buildInstallmentEntries(installments);
  const creditDueEntries = buildCreditDueEntries({
    accounts,
    creditDues,
    cashEntries: entries,
    archivedEntries,
    entryActuals,
    creditSettlementOverrides,
  });
  const allCandidateEntries = getActiveForecastEntries(
    [...entries, ...salaryEntries],
    installmentEntries,
    creditDueEntries,
    deletedForecasts,
    entryActuals
  );

  const forecast = calculateForecast(allCandidateEntries, totalCash, 12);
  const deficitPeriods = getDeficitPeriods(allCandidateEntries, totalCash);
  const deficits = {
    hasDeficit: deficitPeriods.length > 0 || forecast.some((item) => item.balance < 0),
    deficitPeriods,
  };

  const today = DateUtils.todayString();
  const overdueEntries = getForecastCandidateEntries(
    [...entries, ...salaryEntries],
    installmentEntries,
    creditDueEntries,
    deletedForecasts
  )
    .filter((entry) => entry.date && entry.date < today)
    .filter((entry) => !isOngoingEntry(entry, entryActuals))
    .map((entry) => {
      const partial = isPartialTracked(entry);
      const remaining = partial
        ? getRemainingForecastAmount(entry, entryActuals)
        : Number(entry.amount || 0);
      const settled = Boolean(entry.isClosed) || (partial
        ? remaining <= 0
        : getEntryActualAmount(entry, entryActuals) > 0);
      return { entry, remaining, settled, daysOverdue: DateUtils.daysBetween(entry.date, today) };
    })
    .filter((item) => !item.settled && item.remaining > 0)
  const totalDaysInDeficit = deficitPeriods.reduce((sum, p) => sum + (p.daysInDeficit || 0), 0);
  const deficitNote = deficitPeriods.length > 0
    ? `${deficitPeriods.length} spell${deficitPeriods.length === 1 ? '' : 's'} (${totalDaysInDeficit} days in deficit)`
    : 'Balance stays positive';

  return (
    <section className="view" id="deficits" style={{ display: 'block' }}>
      <div className="metrics-grid" style={{ marginBottom: '18px' }}>
        <article className="metric">
          <span>Forecast deficit spells</span>
          <strong id="deficitForecastCount" style={{ color: deficitPeriods.length > 0 ? 'var(--red, #f43f5e)' : 'var(--green, #10b981)', fontWeight: 800 }}>
            {deficitPeriods.length}
          </strong>
          <small id="deficitForecastNote">{deficitNote}</small>
        </article>
        <article className="metric">
          <span>Overdue & unpaid</span>
          <strong id="deficitOverdueCount" style={{ color: overdueEntries.length > 0 ? 'var(--amber, #f59e0b)' : 'var(--green, #10b981)', fontWeight: 800 }}>
            {overdueEntries.length}
          </strong>
          <small id="deficitOverdueNote">{overdueEntries.length > 0 ? `${overdueEntries.length} past due obligations` : 'All scheduled entries up to date'}</small>
        </article>
      </div>

      <div className="content-grid salary-layout">
        {/* Forecast Deficit Timeline */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3 style={{ margin: 0 }}>Forecast deficit timeline</h3>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Exact days balance turns negative until income recovers it
              </span>
            </div>
          </div>

          <div id="deficitForecastList" className="stack-list" style={{ marginTop: '12px' }}>
            {!deficits.hasDeficit ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: '12px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={32} color="var(--green, #10b981)" style={{ marginBottom: '10px' }} />
                <strong style={{ fontSize: '15px', color: 'var(--ink, #f8fafc)', marginBottom: '4px' }}>No cashflow deficits projected</strong>
                <p style={{ margin: 0, fontSize: '13px', maxWidth: '380px', lineHeight: '1.45', color: 'var(--muted)' }}>
                  Your forecast maintains positive liquidity across the projected horizon.
                </p>
              </div>
            ) : (
              deficits.deficitPeriods.map((period, idx) => (
                <div
                  key={idx}
                  className="deficit-card-item"
                >
                  <div className="deficit-card-header">
                    <div className="deficit-card-lead">
                      <AlertCircle size={20} color="var(--red)" className="deficit-card-icon" />
                      <div>
                        <strong className="deficit-card-dates">
                          {DateUtils.formatDisplayDate(period.startDate)} → {period.resolvedDate ? DateUtils.formatDisplayDate(period.resolvedDate) : 'Ongoing'}
                        </strong>
                        <span className="deficit-card-desc">
                          Turns negative on {period.initialTrigger}
                          {period.isResolved ? ` · Fixed by ${period.resolvedBy}` : ' · Remains negative'}
                          {' · '}{period.daysInDeficit} days
                        </span>
                      </div>
                    </div>
                    <div className="deficit-card-peak">
                      <strong className="deficit-peak-val">{formatMoney(period.lowestBalance)}</strong>
                      <small className="deficit-peak-label">Peak deficit</small>
                    </div>
                  </div>
                  {onBridgeDeficit && (
                    <button className="ghost-button deficit-bridge-btn" type="button" onClick={onBridgeDeficit}>
                      💳 Bridge with Loan
                    </button>
                  )}
                  <div className="deficit-progression-wrap">
                    <small className="deficit-progression-title">Daily deficit progression</small>
                    {period.steps.map((step) => (
                      <div key={`${step.entryId}-${step.date}`} className="deficit-step-row">
                        <span>
                          <strong>{DateUtils.formatDisplayDate(step.date)}</strong> · {step.isRecoveryStep ? `Fixed by ${step.category}` : step.category}
                          {' '}({step.delta >= 0 ? '+' : '-'}{formatMoney(step.amount)})
                        </span>
                        <strong style={{ color: step.balance < 0 ? 'var(--red)' : 'var(--green)' }}>{formatMoney(step.balance)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Overdue & Unpaid */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3 style={{ margin: 0 }}>Overdue &amp; unpaid</h3>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Past their scheduled date without recorded payment
              </span>
            </div>
          </div>

          <div id="deficitOverdueList" className="stack-list" style={{ marginTop: '12px' }}>
            {overdueEntries.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: '12px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={30} color="var(--muted)" style={{ marginBottom: '8px' }} />
                <strong style={{ fontSize: '14px', color: 'var(--ink, #f8fafc)', marginBottom: '3px' }}>No overdue entries found</strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted)' }}>All scheduled expenses and obligations are up to date.</p>
              </div>
            ) : (
              overdueEntries.slice(0, 10).map(({ entry, remaining, daysOverdue }) => (
                <div
                  key={entry.id}
                  className="overdue-entry-card"
                >
                  <div className="overdue-entry-info">
                    <strong className="overdue-entry-title">{entry.category}</strong>
                    <span className="overdue-entry-meta">
                      Due: {DateUtils.formatDisplayDate(entry.date)} · {daysOverdue}d overdue · Account: {entry.account.toUpperCase()}
                    </span>
                  </div>
                  <div className="overdue-entry-actions">
                    <strong className="overdue-entry-amount">{formatMoney(remaining)}</strong>
                    <button className="ghost-button overdue-mark-paid-btn" type="button" onClick={() => recordActual(entry.id, remaining, today)}>
                      Mark Paid
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
};
