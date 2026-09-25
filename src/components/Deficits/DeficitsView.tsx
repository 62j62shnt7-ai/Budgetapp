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
          <strong id="deficitForecastCount" style={{ color: deficitPeriods.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {deficitPeriods.length}
          </strong>
          <small id="deficitForecastNote">{deficitNote}</small>
        </article>
        <article className="metric">
          <span>Overdue & unpaid</span>
          <strong id="deficitOverdueCount" style={{ color: overdueEntries.length > 0 ? 'var(--amber)' : 'inherit' }}>
            {overdueEntries.length}
          </strong>
          <small id="deficitOverdueNote">Past due, not yet settled</small>
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
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: '8px' }}>
                <CheckCircle size={28} color="var(--green)" style={{ margin: '0 auto 8px' }} />
                <strong>No cashflow deficits projected</strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Your forecast maintains positive liquidity across the projected horizon.</p>
              </div>
            ) : (
              deficits.deficitPeriods.map((period, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(192, 61, 53, 0.08)',
                    border: '1px solid rgba(192, 61, 53, 0.25)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'stretch',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <AlertCircle size={20} color="var(--red)" />
                    <div>
                      <strong style={{ display: 'block', color: 'var(--red)', fontSize: '14px' }}>
                        {DateUtils.formatDisplayDate(period.startDate)} → {period.resolvedDate ? DateUtils.formatDisplayDate(period.resolvedDate) : 'Ongoing'}
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Turns negative on {period.initialTrigger}
                        {period.isResolved ? ` · Fixed by ${period.resolvedBy}` : ' · Remains negative'}
                        {' · '}{period.daysInDeficit} days
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ color: 'var(--red)', display: 'block' }}>{formatMoney(period.lowestBalance)}</strong>
                      <small style={{ color: 'var(--muted)' }}>Peak deficit</small>
                      {onBridgeDeficit && (
                        <button className="ghost-button" type="button" style={{ display: 'block', marginTop: '6px', fontSize: '11px' }} onClick={onBridgeDeficit}>
                          💳 Bridge with Loan
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--line)' }}>
                    <small style={{ color: 'var(--muted)', textTransform: 'uppercase' }}>Daily deficit progression</small>
                    {period.steps.map((step) => (
                      <div key={`${step.entryId}-${step.date}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '5px 0', fontSize: '12px' }}>
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
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: '8px' }}>
                <Clock size={28} color="var(--muted)" style={{ margin: '0 auto 8px' }} />
                <span>No overdue entries found</span>
              </div>
            ) : (
              overdueEntries.slice(0, 10).map(({ entry, remaining, daysOverdue }) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-soft)',
                    marginBottom: '6px',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '13px', display: 'block' }}>{entry.category}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Due: {DateUtils.formatDisplayDate(entry.date)} · {daysOverdue}d overdue · Account: {entry.account.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ color: 'var(--red)', fontFamily: 'var(--font-heading)' }}>{formatMoney(remaining)}</strong>
                    <button className="ghost-button" type="button" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => recordActual(entry.id, remaining, today)}>
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
