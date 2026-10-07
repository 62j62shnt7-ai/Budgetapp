import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  getEntryActualAmount,
  isPartialTracked,
  getRemainingForecastAmount,
  isOngoingEntry,
} from '../../engine/forecast';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { AlertCircle, Clock, CheckCircle, CreditCard } from 'lucide-react';
import { useForecastCandidates } from '../../hooks/useForecastCandidates';
import { getCreditDueFundingAlerts } from '../../engine/creditDueAlerts';
import type { CashEntry } from '../../types';

interface DeficitsViewProps {
  onBridgeDeficit?: () => void;
  onDeductPrompt?: (entry: CashEntry, actualAmount: number) => void;
  onOpenTransferModal?: (from?: string, to?: string, amount?: number, reason?: string) => void;
}

export const DeficitsView: React.FC<DeficitsViewProps> = ({
  onBridgeDeficit,
  onDeductPrompt,
  onOpenTransferModal,
}) => {
  const {
    accounts,
    entryActuals,
    creditSettlementOverrides,
    recordActual,
    updateEntry,
    runTransaction,
    navigateTo,
  } = useBudgetStore();

  const {
    allCandidateEntries,
    creditDueEntries,
    deficitPeriods,
    hasDeficit,
  } = useForecastCandidates(12);

  const fundingAlerts = React.useMemo(() => {
    const rawAlerts = getCreditDueFundingAlerts({
      creditDueEntries,
      accounts,
      entryActuals,
      candidateEntries: allCandidateEntries,
    });
    // Filter out past settled cycles: only display open obligations or active future settlements
    return rawAlerts.filter((a) => a.remainingDue > 0 || a.status !== 'settled');
  }, [creditDueEntries, accounts, entryActuals, allCandidateEntries]);

  const activeFundingAlerts = React.useMemo(() => {
    return fundingAlerts.filter((a) => a.isAlert || a.shortfall > 0);
  }, [fundingAlerts]);

  const deficits = {
    hasDeficit,
    deficitPeriods,
  };

  const today = DateUtils.todayString();
  const overdueEntries = allCandidateEntries
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
        <article
          className="metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            const list = document.getElementById('deficitForecastList');
            if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const list = document.getElementById('deficitForecastList');
              if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          tabIndex={0}
          role="button"
          title="Click to jump to Forecast deficit timeline"
        >
          <span>Forecast deficit spells</span>
          <strong id="deficitForecastCount" style={{ color: deficitPeriods.length > 0 ? 'var(--red, #f43f5e)' : 'var(--green, #10b981)', fontWeight: 800 }}>
            {deficitPeriods.length}
          </strong>
          <small id="deficitForecastNote">{deficitNote}</small>
        </article>
        <article
          className="metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            const list = document.getElementById('deficitOverdueList');
            if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const list = document.getElementById('deficitOverdueList');
              if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          tabIndex={0}
          role="button"
          title="Click to jump to Overdue & unpaid obligations"
        >
          <span>Overdue & unpaid</span>
          <strong id="deficitOverdueCount" style={{ color: overdueEntries.length > 0 ? 'var(--amber, #f59e0b)' : 'var(--green, #10b981)', fontWeight: 800 }}>
            {overdueEntries.length}
          </strong>
          <small id="deficitOverdueNote">{overdueEntries.length > 0 ? `${overdueEntries.length} past due obligations` : 'All scheduled entries up to date'}</small>
        </article>
        <article
          className="metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            const list = document.getElementById('deficitCreditFundingList');
            if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const list = document.getElementById('deficitCreditFundingList');
              if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          tabIndex={0}
          role="button"
          title="Click to jump to Credit settlement account solvency"
        >
          <span>Credit due shortfalls</span>
          <strong
            id="deficitCreditFundingCount"
            style={{
              color: activeFundingAlerts.length > 0 ? 'var(--red, #f43f5e)' : 'var(--green, #10b981)',
              fontWeight: 800,
            }}
          >
            {activeFundingAlerts.length}
          </strong>
          <small id="deficitCreditFundingNote">
            {activeFundingAlerts.length > 0
              ? `${activeFundingAlerts.length} account shortfall${activeFundingAlerts.length === 1 ? '' : 's'}`
              : 'All settlement accounts funded'}
          </small>
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
                        <span
                          className="deficit-card-desc"
                          style={{ cursor: period.steps[0]?.entryId ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (period.steps[0]?.entryId) {
                              navigateTo('cashflow', {
                                month: 'all',
                                highlightId: period.steps[0].entryId,
                              });
                            }
                          }}
                          title={period.steps[0]?.entryId ? `Click to view trigger entry (${period.initialTrigger}) in Cash Flow` : undefined}
                        >
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
                      <CreditCard size={14} />
                      <span>Bridge with Loan</span>
                    </button>
                  )}
                  <div className="deficit-progression-wrap">
                    <small className="deficit-progression-title">Daily deficit progression</small>
                    {period.steps.map((step) => (
                      <div
                        key={`${step.entryId}-${step.date}`}
                        className="deficit-step-row history-summary-clickable-row"
                        style={{ cursor: step.entryId ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (step.entryId) {
                            navigateTo('cashflow', {
                              month: 'all',
                              highlightId: step.entryId,
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && step.entryId) {
                            e.preventDefault();
                            navigateTo('cashflow', {
                              month: 'all',
                              highlightId: step.entryId,
                            });
                          }
                        }}
                        tabIndex={step.entryId ? 0 : undefined}
                        role={step.entryId ? 'button' : undefined}
                        title={step.entryId ? `Click to view ${step.category} in Cash Flow` : undefined}
                      >
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
                  <div
                    className="overdue-entry-info history-summary-clickable-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      navigateTo('cashflow', {
                        month: 'all',
                        highlightId: entry.id,
                      })
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigateTo('cashflow', {
                          month: 'all',
                          highlightId: entry.id,
                        });
                      }
                    }}
                    title={`Click to view ${entry.category} in Cash Flow`}
                  >
                    <strong className="overdue-entry-title">{entry.category}</strong>
                    <span className="overdue-entry-meta">
                      Due: {DateUtils.formatDisplayDate(entry.date)} · {daysOverdue}d overdue · Account: {entry.account.toUpperCase()}
                    </span>
                  </div>
                  <div className="overdue-entry-actions">
                    <strong className="overdue-entry-amount">
                      {entry.id.startsWith('credit-settlement-') ? (
                        <span title="Remaining settlement due for this cycle">{formatMoney(remaining)}</span>
                      ) : (
                        formatMoney(remaining)
                      )}
                    </strong>
                    <button
                      className="ghost-button overdue-mark-paid-btn"
                      type="button"
                      onClick={() => {
                        const plannedAmt = Number(entry.amount || 0);
                        const isSettlement = entry.id.startsWith('credit-settlement-');

                        if (isSettlement) {
                          const settlementAccountKey = entry.id.split('-')[2] || entry.account || 'cib';
                          const existingOverride = creditSettlementOverrides[entry.id] || {};
                          runTransaction(`Mark Paid Credit Settlement: ${entry.category}`, () => {
                            recordActual(entry.id, plannedAmt, today, {
                              tag: entry.tag || existingOverride.tag || 'Credit',
                              account: settlementAccountKey,
                            });
                            updateEntry(entry.id, {
                              isClosed: true,
                              amount: existingOverride.amount ?? plannedAmt,
                              account: settlementAccountKey,
                            });
                          });

                          onDeductPrompt?.(
                            {
                              ...entry,
                              account: settlementAccountKey,
                              isClosed: true,
                            },
                            plannedAmt
                          );
                        } else {
                          recordActual(entry.id, plannedAmt, today, {
                            tag: entry.tag || '',
                            account: entry.account || 'cash',
                          });
                          // Offer to deduct the paid amount from the operating account
                          // (same flow as recording an actual spend elsewhere).
                          onDeductPrompt?.(entry, plannedAmt);
                        }
                      }}
                    >
                      Mark Paid
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Credit Settlement Account Solvency */}
        <section className="panel" id="deficitCreditFundingList" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={18} color="var(--primary, #3b82f6)" />
                <span>Credit settlement account solvency</span>
              </h3>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Checks whether each bank account has sufficient funds before the credit settlement due date
              </span>
            </div>
            {activeFundingAlerts.length > 0 && onOpenTransferModal && (
              <button
                className="primary-button"
                type="button"
                style={{ fontSize: '12px', padding: '6px 12px', height: 'auto', fontWeight: 600 }}
                onClick={() => {
                  const first = activeFundingAlerts[0];
                  onOpenTransferModal(
                    first.suggestedSourceAccount?.accountKey,
                    first.accountKey,
                    first.shortfall,
                    `${first.cardName} settlement due ${DateUtils.formatDisplayDate(first.settlementDate)}`
                  );
                }}
              >
                Transfer Top Shortfall
              </button>
            )}
          </div>

          <div className="stack-list" style={{ marginTop: '14px' }}>
            {fundingAlerts.length === 0 ? (
              <div
                style={{
                  padding: '28px 20px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  background: 'var(--surface-soft)',
                  borderRadius: '12px',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle size={30} color="var(--green, #10b981)" style={{ marginBottom: '8px' }} />
                <strong style={{ fontSize: '14px', color: 'var(--ink, #f8fafc)', marginBottom: '3px' }}>
                  No upcoming credit settlements
                </strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted)' }}>
                  There are no scheduled credit card settlements in the forecast.
                </p>
              </div>
            ) : (
              fundingAlerts.map((alert) => {
                const isShortfall = alert.isAlert || alert.shortfall > 0;
                return (
                  <div
                    key={alert.entryId}
                    className="overdue-entry-card"
                    style={{
                      borderLeft: `4px solid ${
                        alert.isAlert
                          ? 'var(--red, #f43f5e)'
                          : isShortfall
                          ? 'var(--amber, #f59e0b)'
                          : alert.status === 'settled'
                          ? 'var(--muted)'
                          : 'var(--green, #10b981)'
                      }`,
                    }}
                  >
                    <div
                      className="overdue-entry-info history-summary-clickable-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        navigateTo('cashflow', {
                          month: 'all',
                          highlightId: alert.entryId,
                        })
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigateTo('cashflow', {
                            month: 'all',
                            highlightId: alert.entryId,
                          });
                        }
                      }}
                      title={`Click to view ${alert.cardName} in Cash Flow`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong className="overdue-entry-title">{alert.cardName}</strong>
                        <span
                          className="badge"
                          style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: alert.isAlert
                              ? 'rgba(244, 63, 94, 0.15)'
                              : alert.status === 'settled'
                              ? 'var(--surface-soft)'
                              : 'rgba(16, 185, 129, 0.12)',
                            color: alert.isAlert
                              ? 'var(--red, #f43f5e)'
                              : alert.status === 'settled'
                              ? 'var(--muted)'
                              : 'var(--green, #10b981)',
                            fontWeight: 600,
                          }}
                        >
                          {alert.status === 'overdue_unfunded'
                            ? alert.canBeCoveredByTransfer
                              ? 'Overdue: Transfer Needed'
                              : 'Overdue & Underfunded'
                            : alert.status === 'critical_shortfall'
                            ? alert.canBeCoveredByTransfer
                              ? 'Due Soon: Covered by Transfer'
                              : 'Critical Shortfall'
                            : alert.status === 'approaching_shortfall'
                            ? alert.canBeCoveredByTransfer
                              ? 'Approaching: Covered by Transfer'
                              : 'Approaching Shortfall'
                            : alert.status === 'upcoming_shortfall'
                            ? alert.canBeCoveredByTransfer
                              ? 'Covered by Transfer (Scheduled)'
                              : 'Upcoming Shortfall'
                            : alert.status === 'settled'
                            ? 'Settled'
                            : alert.isFundedByProjectedIncome && alert.accountBalance < alert.remainingDue
                            ? 'Funded by Scheduled Income'
                            : 'Fully Funded'}
                        </span>
                      </div>
                      <span className="overdue-entry-meta" style={{ marginTop: '4px', display: 'block' }}>
                        Due: {DateUtils.formatDisplayDate(alert.settlementDate)} (
                        {alert.status === 'settled' || alert.remainingDue <= 0
                          ? 'Settled'
                          : alert.daysUntilSettlement < 0
                          ? `${Math.abs(alert.daysUntilSettlement)}d overdue`
                          : alert.daysUntilSettlement === 0
                          ? 'Today'
                          : `in ${alert.daysUntilSettlement}d`}
                        ) · Linked Account: <strong>{alert.accountName}</strong> (Available: {formatMoney(alert.accountBalance)})
                        {alert.projectedAccountBalance !== undefined && (
                          <> · Projected balance before due: {formatMoney(alert.projectedAccountBalance)}</>
                        )}
                      </span>
                    </div>

                    <div className="overdue-entry-actions" style={{ alignItems: 'flex-end', gap: '8px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Planned Due</div>
                        <strong className="overdue-entry-amount">{formatMoney(alert.remainingDue)}</strong>
                        {isShortfall && (
                          <div style={{ fontSize: '12px', color: 'var(--red, #f43f5e)', fontWeight: 700, marginTop: '2px' }}>
                            {!alert.canBeCoveredByTransfer && alert.maxTransferableAmount && alert.maxTransferableAmount > 0
                              ? `Remaining Shortfall: -${formatMoney(alert.remainingUncoveredShortfall ?? (alert.shortfall - alert.maxTransferableAmount))}`
                              : `Deficit: -${formatMoney(alert.shortfall)}`}
                          </div>
                        )}
                      </div>
                      {isShortfall && (alert.canBeCoveredByTransfer || (alert.maxTransferableAmount && alert.maxTransferableAmount > 0)) && onOpenTransferModal && (
                        <button
                          className="primary-button"
                          type="button"
                          style={{
                            background: alert.isAlert ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)',
                            borderColor: alert.isAlert ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)',
                            color: '#fff',
                            fontSize: '12px',
                            padding: '6px 12px',
                            height: 'auto',
                            fontWeight: 600,
                          }}
                          onClick={() => {
                            const transferAmt = alert.maxTransferableAmount || alert.shortfall;
                            onOpenTransferModal(
                              alert.suggestedSourceAccount?.accountKey,
                              alert.accountKey,
                              transferAmt,
                              alert.canBeCoveredByTransfer
                                ? `${alert.cardName} due ${DateUtils.formatDisplayDate(alert.settlementDate)} (Shortfall: ${formatMoney(alert.shortfall)})`
                                : `${alert.cardName} due ${DateUtils.formatDisplayDate(alert.settlementDate)} (Partial transfer: ${formatMoney(transferAmt)} · Remaining shortfall: ${formatMoney(alert.remainingUncoveredShortfall || 0)})`
                            );
                          }}
                        >
                          {alert.canBeCoveredByTransfer ? 'Transfer Funds' : `Transfer ${formatMoney(alert.maxTransferableAmount || 0)}`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </section>
  );
};
