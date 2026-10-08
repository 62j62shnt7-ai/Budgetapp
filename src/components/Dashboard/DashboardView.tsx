import React, { useEffect, useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  getLowestProjectedBalance,
  simulateSpend,
  isOngoingEntry,
  isPartialTracked,
  getRemainingForecastAmount,
  getEntryActualAmount,
  type DailyDeficitPeriod,
} from '../../engine/forecast';
import { computeFinancialHealthScore, generateSmartInsights } from '../../engine/healthScore';
import { computeAssetEgpValue, computeTotalStorageValue, formatNativeCurrency, getCurrencyRate } from '../../engine/currency';
import { DateUtils, formatMoney, formatLastUpdated } from '../../engine/dateUtils';
import { ForecastChart } from '../Forecast/ForecastChart';
import { CreditCard, CheckCircle2, Clock, Target, AlertTriangle, Lightbulb } from 'lucide-react';
import {
  getCreditDueFundingAlerts,
  getCriticalFundingAlerts,
} from '../../engine/creditDueAlerts';
import type { CreditDueFundingAlert } from '../../types';

import { useForecastCandidates } from '../../hooks/useForecastCandidates';

interface DashboardViewProps {
  onOpenTransferModal?: (from?: string, to?: string, amount?: number, reason?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenTransferModal }) => {
  const {
    rates,
    accounts,
    storageAssets,
    entries,
    archivedEntries,
    entryActuals,
    entryActualDates,
    creditSettlementOverrides,
    setActiveTab,
    navigateTo,
  } = useBudgetStore();

  const [forecastRangeMonths, setForecastRangeMonths] = useState<number>(12);
  const [forecastMode, setForecastMode] = useState<'entries' | 'monthly'>('entries');
  const [simAmount, setSimAmount] = useState<string>('');
  const [simDate, setSimDate] = useState<string>(DateUtils.todayString());
  const [simVerdict, setSimVerdict] = useState<{ text: string; isDanger: boolean } | null>(null);
  const [dashboardDensity, setDashboardDensity] = useState<'comfortable' | 'compact'>(() =>
    localStorage.getItem('budget-control-dashboard-density') === 'compact' ? 'compact' : 'comfortable'
  );

  const {
    totalCash,
    creditDueEntries,
    allCandidateEntries,
    forecast,
    deficitPeriods,
    hasDeficit,
  } = useForecastCandidates(forecastRangeMonths);

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
  const remainingDue = (entry: (typeof creditDueEntries)[number]) =>
    Math.max(0, Number(entry.amount || 0) - getEntryActualAmount(entry, entryActuals));
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

  // Credit Due Account Solvency & Funding Alerts
  const fundingAlerts = React.useMemo(() => {
    return getCreditDueFundingAlerts({
      creditDueEntries,
      accounts,
      entryActuals,
      candidateEntries: allCandidateEntries,
    });
  }, [creditDueEntries, accounts, entryActuals, allCandidateEntries]);

  const criticalFundingAlerts = React.useMemo(() => {
    return getCriticalFundingAlerts(fundingAlerts);
  }, [fundingAlerts]);

  const cibFundingAlert =
    fundingAlerts.find(
      (a) => a.accountKey === 'cib' && a.entryId === `credit-settlement-cib-${activeCibMonth}`
    ) ||
    fundingAlerts.find((a) => a.accountKey === 'cib' && a.remainingDue > 0) ||
    fundingAlerts.find((a) => a.accountKey === 'cib');

  const hsbcFundingAlert =
    fundingAlerts.find(
      (a) => a.accountKey === 'hsbc' && a.entryId === `credit-settlement-hsbc-${activeHsbcMonth}`
    ) ||
    fundingAlerts.find((a) => a.accountKey === 'hsbc' && a.remainingDue > 0) ||
    fundingAlerts.find((a) => a.accountKey === 'hsbc');

  const handleOpenAlertTransfer = (alert: CreditDueFundingAlert) => {
    if (onOpenTransferModal) {
      const transferAmount = alert.maxTransferableAmount || alert.shortfall;
      const desc = alert.canBeCoveredByTransfer
        ? `${alert.cardName} due ${DateUtils.formatDisplayDate(alert.settlementDate)} (Shortfall: ${formatMoney(alert.shortfall)})`
        : `${alert.cardName} due ${DateUtils.formatDisplayDate(alert.settlementDate)} (Partial transfer: ${formatMoney(transferAmount)} · Remaining shortfall: ${formatMoney(alert.remainingUncoveredShortfall || 0)})`;

      onOpenTransferModal(
        alert.suggestedSourceAccount?.accountKey,
        alert.accountKey,
        transferAmount,
        desc
      );
    } else {
      navigateTo('accounts');
    }
  };

  const renderFundingPill = (alert: CreditDueFundingAlert | undefined) => {
    if (!alert || alert.totalPlannedDue <= 0) return null;

    const isFunded = alert.shortfall <= 0;

    if (isFunded) {
      const isFundedByIncome = alert.isFundedByProjectedIncome && alert.accountBalance < alert.remainingDue;
      const fundedText = isFundedByIncome
        ? `🟢 ${alert.accountName} funded by upcoming income (${formatMoney(alert.projectedAccountBalance || alert.accountBalance)} projected)`
        : `🟢 ${alert.accountName} Account funded (${formatMoney(alert.accountBalance)} avail)`;
      const fundedTooltip = isFundedByIncome
        ? `${alert.accountName} current balance: ${formatMoney(alert.accountBalance)}, projected to reach ${formatMoney(alert.projectedAccountBalance || 0)} from scheduled income before settlement date (${DateUtils.formatDisplayDate(alert.settlementDate)}). Fully covers ${formatMoney(alert.remainingDue)} due with no deficits.`
        : `${alert.accountName} Account has ${formatMoney(alert.accountBalance)} (Fully covers ${formatMoney(alert.remainingDue)} due)`;

      return (
        <div
          className="credit-funding-card-pill is-funded"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 8px',
            borderRadius: '6px',
            fontSize: '11px',
            lineHeight: '1.35',
            marginTop: '6px',
            marginBottom: '8px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid var(--green, #10b981)',
            color: 'var(--green, #10b981)',
          }}
          title={fundedTooltip}
        >
          <span style={{ wordBreak: 'break-word' }}>{fundedText}</span>
        </div>
      );
    }

    const isClose = alert.isAlert; // <= 7 days or overdue
    const canCover = Boolean(alert.canBeCoveredByTransfer && alert.suggestedSourceAccount);

    const hasPartialSource = Boolean(
      !canCover &&
      alert.suggestedSourceAccount &&
      alert.maxTransferableAmount &&
      alert.maxTransferableAmount > 0
    );
    const canTransferAny = canCover || hasPartialSource;

    // Styling & color tokens
    // If fully covered & close: amber warning ("Needs Transfer")
    // If fully covered & not close: blue notice ("Scheduled Transfer")
    // If partially covered: amber warning mentioning remaining shortfall only ("Remaining Shortfall: X")
    // If completely uncovered & close: red critical ("Unfunded Shortfall: X")
    // If completely uncovered & not close: amber ("Upcoming Shortfall: X")
    let borderColor = 'var(--line)';
    let bgColor = 'var(--surface-soft)';
    let textColor = 'var(--ink)';
    let label = '';

    if (canCover) {
      if (isClose) {
        borderColor = 'var(--amber, #f59e0b)';
        bgColor = 'rgba(245, 158, 11, 0.14)';
        textColor = 'var(--amber, #f59e0b)';
        label = `⚠️ Needs Transfer: ${formatMoney(alert.shortfall)} (covered by ${alert.suggestedSourceAccount?.accountName})`;
      } else {
        borderColor = 'rgba(59, 130, 246, 0.4)';
        bgColor = 'rgba(59, 130, 246, 0.08)';
        textColor = '#60a5fa';
        label = `ℹ️ Scheduled Transfer: ${formatMoney(alert.shortfall)} available in ${alert.suggestedSourceAccount?.accountName}`;
      }
    } else if (hasPartialSource) {
      // By the settlement date, only put the amount that will be available to partially cover it:
      const availableToCover = alert.maxTransferableAmount || 0;
      const remainingShortfall = alert.remainingUncoveredShortfall ?? (alert.shortfall - availableToCover);
      borderColor = isClose ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)';
      bgColor = isClose ? 'rgba(244, 63, 94, 0.14)' : 'rgba(245, 158, 11, 0.12)';
      textColor = isClose ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)';
      label = `⚠️ ${formatMoney(availableToCover)} available to partially cover from ${alert.suggestedSourceAccount?.accountName} (${formatMoney(remainingShortfall)} remaining shortfall)`;
    } else {
      // Nothing can cover shortfall at all: no account has any funds
      if (isClose) {
        borderColor = 'var(--red, #f43f5e)';
        bgColor = 'rgba(244, 63, 94, 0.16)';
        textColor = 'var(--red, #f43f5e)';
        label = `🚨 Unfunded Shortfall: ${formatMoney(alert.shortfall)} (no account has funds)`;
      } else {
        borderColor = 'var(--amber, #f59e0b)';
        bgColor = 'rgba(245, 158, 11, 0.12)';
        textColor = 'var(--amber, #f59e0b)';
        label = `⚠️ Upcoming Shortfall: ${formatMoney(alert.shortfall)} (uncovered)`;
      }
    }

    return (
      <div
        className={`credit-funding-card-pill ${canCover ? (isClose ? 'is-transfer-warning' : 'is-transfer-notice') : hasPartialSource ? 'is-partial-transfer' : 'is-shortfall'}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '5px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          lineHeight: '1.35',
          marginTop: '6px',
          marginBottom: '8px',
          background: bgColor,
          border: `1px solid ${borderColor}`,
          color: textColor,
          cursor: canTransferAny ? 'pointer' : 'default',
        }}
        onClick={(e) => {
          if (canTransferAny) {
            e.stopPropagation();
            handleOpenAlertTransfer(alert);
          }
        }}
        title={`Due ${DateUtils.formatDisplayDate(alert.settlementDate)} on ${alert.cardName}. ${alert.accountName} has ${formatMoney(alert.accountBalance)}. ${canCover ? `Can be covered by transferring ${formatMoney(alert.shortfall)} from ${alert.suggestedSourceAccount?.accountName} (${formatMoney(alert.suggestedSourceAccount?.projectedBalance ?? alert.suggestedSourceAccount?.balance ?? 0)} projected by settlement date).` : hasPartialSource ? `${alert.suggestedSourceAccount?.accountName} can partially cover ${formatMoney(alert.maxTransferableAmount || 0)} based on projected balance (${formatMoney(alert.suggestedSourceAccount?.projectedBalance ?? alert.suggestedSourceAccount?.balance ?? 0)} at settlement), leaving a remaining shortfall of ${formatMoney(alert.remainingUncoveredShortfall || 0)}.` : `Shortfall of ${formatMoney(alert.shortfall)} — no other account has projected funds to cover.`} ${canTransferAny ? 'Click to transfer.' : ''}`}
      >
        <span style={{ wordBreak: 'break-word', flex: 1 }}>
          {label}
        </span>
        {canTransferAny && (
          <span style={{ fontWeight: 700, textDecoration: 'underline', flexShrink: 0, whiteSpace: 'nowrap' }}>
            Transfer →
          </span>
        )}
      </div>
    );
  };

  // Forecast & Deficits
  const visibleForecast = forecast.slice(0, forecastRangeMonths);
  const health = computeFinancialHealthScore({
    entries: allCandidateEntries,
    forecast,
    deficitPeriods,
    actualCashNow: totalCash,
    storageTotal,
    entryActuals,
    // Settled ledger rows so budget adherence and savings rate can be measured.
    historyEntries: entries,
    archivedEntries,
    entryActualDates,
    creditSettlementOverrides,
  });
  const insights = generateSmartInsights({
    entries: allCandidateEntries,
    forecast,
    deficitPeriods,
    actualCashNow: totalCash,
    storageTotal,
  });
  const deficits = {
    hasDeficit,
    worstDeficit: Math.max(0, ...deficitPeriods.map((item) => Math.abs(item.lowestBalance))),
  };

  // Overdue & unpaid obligations (same resolution as the Deficits view) so the
  // Cashflow status metric reacts the moment an obligation slips past due.
  const overdueNow = allCandidateEntries
    .filter((entry) => entry.date && entry.date < DateUtils.todayString())
    .filter((entry) => !isOngoingEntry(entry, entryActuals))
    .map((entry) => {
      const partial = isPartialTracked(entry);
      const remaining = partial
        ? getRemainingForecastAmount(entry, entryActuals)
        : Number(entry.amount || 0);
      const settled = Boolean(entry.isClosed) || (partial
        ? remaining <= 0
        : getEntryActualAmount(entry, entryActuals) > 0);
      return { entry, remaining, settled };
    })
    .filter((item) => !item.settled && item.remaining > 0);

  const lowestProjection = getLowestProjectedBalance(allCandidateEntries, totalCash);
  const lowestPoint = lowestProjection.balance;

  const safeToSpend = Math.max(0, lowestPoint);
  const targetCutoffYm = DateUtils.addMonths(DateUtils.todayString(), forecastRangeMonths);
  const [cutoffY, cutoffM] = DateUtils.parseYearMonth(targetCutoffYm);
  const lastDayOfCutoffMonth = DateUtils.getLastDayOfMonth(cutoffY, cutoffM);
  const plottedCutoff = `${targetCutoffYm}-${String(lastDayOfCutoffMonth).padStart(2, '0')}`;
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
  const worstDeficitPeriod = deficitPeriods.reduce<DailyDeficitPeriod | null>((worst, curr) => {
    if (!worst) return curr;
    return curr.lowestBalance < worst.lowestBalance ? curr : worst;
  }, null);

  const targetPeriod = worstDeficitPeriod || firstDeficit;
  const lowestDeficitNumber = targetPeriod
    ? targetPeriod.lowestBalance
    : (forecast.length > 0 ? Math.min(0, ...forecast.map((f) => f.balance)) : 0);
  const peakDeficit = Math.ceil(Math.abs(lowestDeficitNumber));

  const remediationAdvice = targetPeriod && peakDeficit > 0
    ? (() => {
        const peak = peakDeficit;
        const fx = storageAssets.find(
          (asset) =>
            /eur|euro|usd|dollar|currency|foreign/i.test(`${asset.name || ''} ${asset.unit || ''}`) &&
            Number(asset.quantity ?? (asset as any).amount ?? 0) > 0
        );
        const goldAsset = storageAssets.find(
          (asset) =>
            /gold/i.test(`${asset.name || ''} ${asset.unit || ''}`) &&
            Number(asset.quantity ?? (asset as any).amount ?? 0) > 0
        );
        const goldRate = goldAsset
          ? Number(goldAsset.rate || goldAsset.currentPrice || (goldAsset as any).buyPrice || 0)
          : 0;
        const goldGramsNeeded = goldRate > 0 ? (peak / goldRate).toFixed(1) : null;

        const flexible = targetPeriod.steps.find(
          (step) =>
            step.type === 'expense' &&
            !/installment|credit due|loan repayment|bill/i.test(step.category) &&
            step.amount > 0
        ) || deficitPeriods.flatMap((p) => p.steps).find(
          (step) =>
            step.type === 'expense' &&
            !/installment|credit due|loan repayment|bill/i.test(step.category) &&
            step.amount > 0
        );

        const fxRate = fx
          ? Math.max(1, Number(fx.rate || fx.currentPrice || (fx as any).buyPrice || getCurrencyRate(rates, fx.unit || 'USD') || 1))
          : 1;
        const fxAmountNeeded = Math.ceil(peak / fxRate);
        const fxLabel = fx ? (fx.unit || fx.name || 'USD') : 'foreign currency';

        const options = [
          fx
            ? `Exchange approx. ${fxAmountNeeded.toLocaleString()} ${fxLabel}`
            : 'Exchange foreign currency if available',
          goldGramsNeeded
            ? `Liquidate approx. ${goldGramsNeeded}g gold (${formatMoney(peak)})`
            : 'Liquidate gold or another liquid asset',
          flexible ? `Postpone ${flexible.category} (${formatMoney(flexible.amount)})` : 'Postpone a flexible expense',
          targetPeriod.resolvedDate
            ? `Bridge ${formatMoney(peak)} until ${DateUtils.formatDisplayDate(targetPeriod.resolvedDate)}`
            : `Bridge ${formatMoney(peak)} via short-term loan or credit`,
        ];
        return `Remediation (peak deficit ${formatMoney(peak)}): ${options.join(' · ')}`;
      })()
    : '';

  return (
    <section className={`view dashboard-view dashboard-density-${dashboardDensity}`} id="dashboard" style={{ display: 'block' }}>
      {/* Credit Settlement Account Funding Deficit Warning Banner */}
      {criticalFundingAlerts.length > 0 && (() => {
        const hasUncovered = criticalFundingAlerts.some((a) => !a.canBeCoveredByTransfer);
        const bannerBorder = hasUncovered ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)';
        const bannerBg = hasUncovered
          ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.14) 0%, rgba(239, 68, 68, 0.05) 100%)'
          : 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.05) 100%)';
        const bannerIconBg = hasUncovered ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)';
        const bannerTitleColor = hasUncovered ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)';
        const bannerTitle = hasUncovered
          ? 'Credit Due Account Shortfall'
          : 'Credit Settlement: Transfer Needed Before Due Date';

        return (
          <div
            className="alert-banner credit-funding-alert-banner"
            id="creditFundingAlertBanner"
            style={{
              borderColor: bannerBorder,
              background: bannerBg,
              marginBottom: '16px',
            }}
          >
            <div className="alert-banner-icon" style={{ background: bannerIconBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={16} />
            </div>
            <div className="alert-banner-body">
              <strong style={{ color: bannerTitleColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{bannerTitle}</span>
                <span
                  style={{
                    fontSize: '11px',
                    background: hasUncovered ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: bannerTitleColor,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {criticalFundingAlerts.length} Action Needed
                </span>
              </strong>
              <div id="creditFundingAlertList" style={{ marginTop: '4px', fontSize: '13px', lineHeight: '1.4' }}>
                {criticalFundingAlerts.map((alert) => (
                  <div key={alert.entryId} style={{ marginTop: '3px' }}>
                    <strong>{alert.cardName}</strong> settlement of{' '}
                    <strong>{formatMoney(alert.remainingDue)}</strong> is due on{' '}
                    {DateUtils.formatDisplayDate(alert.settlementDate)} (
                    {alert.daysUntilSettlement < 0
                      ? `${Math.abs(alert.daysUntilSettlement)}d overdue`
                      : alert.daysUntilSettlement === 0
                      ? 'Today'
                      : `in ${alert.daysUntilSettlement}d`}
                    ), but <strong>{alert.accountName}</strong> has only{' '}
                    <strong>{formatMoney(alert.accountBalance)}</strong>. Shortfall:{' '}
                    <strong style={{ color: hasUncovered ? 'var(--red, #f43f5e)' : 'var(--amber, #f59e0b)' }}>
                      {formatMoney(alert.shortfall)}
                    </strong>
                    {alert.canBeCoveredByTransfer && alert.suggestedSourceAccount ? (
                      <span style={{ color: 'var(--muted)', marginLeft: '4px' }}>
                        (can be covered by transfer from {alert.suggestedSourceAccount.accountName})
                      </span>
                    ) : alert.suggestedSourceAccount && alert.maxTransferableAmount && alert.maxTransferableAmount > 0 ? (
                      <span style={{ color: 'var(--muted)', marginLeft: '4px' }}>
                        ({formatMoney(alert.maxTransferableAmount)} can be transferred from {alert.suggestedSourceAccount.accountName}; <strong>Remaining Shortfall: {formatMoney(alert.remainingUncoveredShortfall ?? (alert.shortfall - alert.maxTransferableAmount))}</strong>)
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              {criticalFundingAlerts[0]?.suggestedSourceAccount && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Lightbulb size={13} style={{ flexShrink: 0 }} />
                  <span>
                    Suggested transfer:{' '}
                    {criticalFundingAlerts[0].canBeCoveredByTransfer ? (
                    <>
                      {formatMoney(criticalFundingAlerts[0].shortfall)} from{' '}
                      {criticalFundingAlerts[0].suggestedSourceAccount.accountName} (projected at settlement:{' '}
                      {formatMoney(criticalFundingAlerts[0].suggestedSourceAccount.projectedBalance ?? criticalFundingAlerts[0].suggestedSourceAccount.balance)}) into{' '}
                      {criticalFundingAlerts[0].accountName}.
                    </>
                  ) : (
                    <>
                      Partial transfer of {formatMoney(criticalFundingAlerts[0].maxTransferableAmount || 0)} from{' '}
                      {criticalFundingAlerts[0].suggestedSourceAccount.accountName} (projected at settlement:{' '}
                      {formatMoney(criticalFundingAlerts[0].suggestedSourceAccount.projectedBalance ?? criticalFundingAlerts[0].suggestedSourceAccount.balance)}). Remaining shortfall:{' '}
                      <strong>{formatMoney(criticalFundingAlerts[0].remainingUncoveredShortfall || 0)}</strong>.
                    </>
                  )}
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {(criticalFundingAlerts[0]?.canBeCoveredByTransfer || (criticalFundingAlerts[0]?.maxTransferableAmount && criticalFundingAlerts[0].maxTransferableAmount > 0)) && (
                <button
                  className="primary-button"
                  id="creditFundingTransferAction"
                  type="button"
                  style={{
                    background: hasUncovered ? '#be123c' : '#b45309',
                    borderColor: hasUncovered ? '#9f1239' : '#92400e',
                    color: '#ffffff',
                    fontSize: '12px',
                    padding: '6px 14px',
                    height: 'auto',
                    fontWeight: 700,
                  }}
                  onClick={() => handleOpenAlertTransfer(criticalFundingAlerts[0])}
                >
                  Transfer Funds
                </button>
              )}
              <button
                className="ghost-button"
                type="button"
                style={{ fontSize: '12px', padding: '6px 10px', height: 'auto' }}
                onClick={() => setActiveTab('deficits')}
              >
                View Deficits
              </button>
            </div>
          </div>
        );
      })()}

      {/* Deficit Alert Banner */}
      {deficits.hasDeficit && (
        <div className="alert-banner" id="deficitBanner">
          <div className="alert-banner-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={16} />
          </div>
          <div className="alert-banner-body">
            <strong>Deficiencies detected</strong>
            <p id="deficitBannerSummary">
              Balance turns negative on {DateUtils.formatDisplayDate(firstDeficit?.startDate || DateUtils.todayString())}
              {' · '}peak deficit {formatMoney(deficits.worstDeficit)}
              {targetPeriod?.isResolved ? ` · recovers on ${DateUtils.formatDisplayDate(targetPeriod.resolvedDate || targetPeriod.lowestDate)}` : ' · remains unresolved'}
              {overdueNow.length > 0 ? ` · ${overdueNow.length} overdue obligation${overdueNow.length === 1 ? '' : 's'}` : ''}
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
        <article
          className="metric highlight-metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('storage')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('storage');
            }
          }}
          tabIndex={0}
          role="button"
          title="Click to view Stored Assets & Valuations"
        >
          <span>Total Net Worth</span>
          <strong id="totalNetWorth" style={{ color: 'var(--green, #10b981)', fontWeight: 800 }}>
            {formatMoney(netWorth)}
          </strong>
          <small>Cash + Stored assets</small>
        </article>

        <article
          className="metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('accounts')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('accounts');
            }
          }}
          tabIndex={0}
          role="button"
          title="Click to view and adjust Bank & Cash Accounts"
        >
          <span>Actual cash today</span>
          <strong id="actualCashToday" style={{ color: '#38bdf8', fontWeight: 800 }}>
            {formatMoney(totalCash)}
          </strong>
          <small>Sum of account balances only</small>
        </article>

        {/* CIB Dual Metric */}
        <article
          className="metric credit-dual-metric cib-metric-card history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() =>
            navigateTo('cashflow', {
              category: 'CIB Credit Due',
              month: activeCibMonth,
              highlightId: `credit-settlement-cib-${activeCibMonth}`,
            })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigateTo('cashflow', {
                category: 'CIB Credit Due',
                month: activeCibMonth,
                highlightId: `credit-settlement-cib-${activeCibMonth}`,
              });
            }
          }}
          tabIndex={0}
          role="button"
          title={`Click to view CIB credit due for ${activeCibMonth} in Cash Flow`}
        >
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
          {renderFundingPill(cibFundingAlert)}
          <div className="credit-sub-grid">
            <div
              className={`credit-sub-item ${cibThisMonth > 0 ? 'is-due' : 'is-settled'}`}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('cashflow', {
                  category: 'CIB Credit Due',
                  month: currentYm,
                  highlightId: `credit-settlement-cib-${currentYm}`,
                });
              }}
              title={`Click to view CIB credit due for ${currentYm}`}
            >
              <span className="credit-sub-label" id="cibCurrentMonthLabel">{monthLabel(currentYm, 'THIS MO')}</span>
              <span className="credit-sub-val" id="cibCurrentDue">
                {cibThisMonth > 0 ? formatMoney(cibThisMonth) : '0 EGP · Settled'}
              </span>
            </div>
            <div
              className="credit-sub-item upcoming"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('cashflow', {
                  category: 'CIB Credit Due',
                  month: nextYm,
                  highlightId: `credit-settlement-cib-${nextYm}`,
                });
              }}
              title={`Click to view CIB credit due for ${nextYm}`}
            >
              <span className="credit-sub-label" id="cibNextMonthLabel">{monthLabel(nextYm, 'NEXT MO')}</span>
              <span className="credit-sub-val" id="cibNextDue">
                {formatMoney(cibNextMonth)}
              </span>
            </div>
          </div>
        </article>

        {/* HSBC Dual Metric */}
        <article
          className="metric credit-dual-metric hsbc-metric-card history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() =>
            navigateTo('cashflow', {
              category: 'HSBC Credit Due',
              month: activeHsbcMonth,
              highlightId: `credit-settlement-hsbc-${activeHsbcMonth}`,
            })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigateTo('cashflow', {
                category: 'HSBC Credit Due',
                month: activeHsbcMonth,
                highlightId: `credit-settlement-hsbc-${activeHsbcMonth}`,
              });
            }
          }}
          tabIndex={0}
          role="button"
          title={`Click to view HSBC credit due for ${activeHsbcMonth} in Cash Flow`}
        >
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
          {renderFundingPill(hsbcFundingAlert)}
          <div className="credit-sub-grid">
            <div
              className={`credit-sub-item ${hsbcThisMonth > 0 ? 'is-due' : 'is-settled'}`}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('cashflow', {
                  category: 'HSBC Credit Due',
                  month: currentYm,
                  highlightId: `credit-settlement-hsbc-${currentYm}`,
                });
              }}
              title={`Click to view HSBC credit due for ${currentYm}`}
            >
              <span className="credit-sub-label" id="hsbcCurrentMonthLabel">{monthLabel(currentYm, 'THIS MO')}</span>
              <span className="credit-sub-val" id="hsbcCurrentDue">
                {hsbcThisMonth > 0 ? formatMoney(hsbcThisMonth) : '0 EGP · Settled'}
              </span>
            </div>
            <div
              className="credit-sub-item upcoming"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('cashflow', {
                  category: 'HSBC Credit Due',
                  month: nextYm,
                  highlightId: `credit-settlement-hsbc-${nextYm}`,
                });
              }}
              title={`Click to view HSBC credit due for ${nextYm}`}
            >
              <span className="credit-sub-label" id="hsbcNextMonthLabel">{monthLabel(nextYm, 'NEXT MO')}</span>
              <span className="credit-sub-val" id="hsbcNextDue">
                {formatMoney(hsbcNextMonth)}
              </span>
            </div>
          </div>
        </article>

        <article
          className="metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('storage')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('storage');
            }
          }}
          tabIndex={0}
          role="button"
          title="Click to view Stored Assets & Valuations"
        >
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

        <article
          className="metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('deficits')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('deficits');
            }
          }}
          tabIndex={0}
          role="button"
          title="Click to view Deficit analysis and recovery plan"
        >
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

        <article
          className="metric history-summary-clickable-row"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            if (overdueNow.length > 0 || deficits.hasDeficit) {
              setActiveTab('deficits');
            } else {
              setActiveTab('cashflow');
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (overdueNow.length > 0 || deficits.hasDeficit) {
                setActiveTab('deficits');
              } else {
                setActiveTab('cashflow');
              }
            }
          }}
          tabIndex={0}
          role="button"
          title={
            overdueNow.length > 0
              ? 'Click to view overdue obligations in Deficits view'
              : deficits.hasDeficit
              ? 'Click to view Deficit analysis and recovery plan'
              : 'Click to view Cash Flow forecast'
          }
        >
          <span>Cashflow status</span>
          <strong
            id="cashflowStatus"
            style={{
              color: overdueNow.length > 0
                ? 'var(--amber, #f59e0b)'
                : deficits.hasDeficit
                ? 'var(--red, #f43f5e)'
                : 'var(--green, #10b981)',
              fontWeight: 800,
            }}
          >
            {overdueNow.length > 0
              ? 'Overdue'
              : deficits.hasDeficit
              ? 'Deficit Risk'
              : 'OK'}
          </strong>
          <small id="cashflowStatusNote">
            {overdueNow.length > 0
              ? `${overdueNow.length} past due obligation${overdueNow.length === 1 ? '' : 's'} · ${formatMoney(overdueNow.reduce((s, o) => s + o.remaining, 0))} unpaid`
              : deficits.hasDeficit
              ? 'Review upcoming obligations'
              : 'Cash stays positive across entire forecast'}
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
                <div className="health-score-breakdown" id="healthScoreBreakdown">
                  <span title="Deficit safety & proximity (0-25)">Deficit {health.deficitScore}/25</span>
                  <span title="Liquid cash & runway (0-25)">Runway {health.runwayScore}/25</span>
                  <span
                    title={
                      health.budgetAdherencePct !== undefined
                        ? `Realized spend ${health.budgetAdherencePct}% of planned budget across ${health.monthsAnalyzed} settled month(s)`
                        : 'Neutral until a full month of history exists'
                    }
                  >
                    Budget {health.budgetScore}/25
                  </span>
                  <span
                    title={
                      health.savingsRatePct !== undefined
                        ? `Saved ${health.savingsRatePct}% of income across the measured window · reserves cover ${health.reserveMonths ?? 0} month(s) of expenses`
                        : 'Neutral until a full month of history exists'
                    }
                  >
                    Savings {health.savingsScore}/25
                  </span>
                  {health.monthsAnalyzed ? (
                    <span className="health-score-breakdown-note">
                      measured over {health.monthsAnalyzed} settled month{health.monthsAnalyzed === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="health-score-breakdown-note">no settled history yet</span>
                  )}
                </div>
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
          <div
            className={`dashboard-focus-card ${nextUpcomingExpense ? 'history-summary-clickable-row' : ''}`}
            style={{ cursor: nextUpcomingExpense ? 'pointer' : 'default' }}
            onClick={() => {
              if (nextUpcomingExpense) {
                navigateTo('cashflow', {
                  category: nextUpcomingExpense.category,
                  month: DateUtils.getMonthKey(nextUpcomingExpense.date),
                  highlightId: nextUpcomingExpense.id,
                });
              }
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && nextUpcomingExpense) {
                e.preventDefault();
                navigateTo('cashflow', {
                  category: nextUpcomingExpense.category,
                  month: DateUtils.getMonthKey(nextUpcomingExpense.date),
                  highlightId: nextUpcomingExpense.id,
                });
              }
            }}
            tabIndex={nextUpcomingExpense ? 0 : undefined}
            role={nextUpcomingExpense ? 'button' : undefined}
            title={nextUpcomingExpense ? `Click to view ${nextUpcomingExpense.category} in Cash Flow` : undefined}
          >
            <span className="dashboard-focus-label">Next expense</span>
            <strong style={{ color: nextUpcomingExpense ? 'var(--red, #f43f5e)' : 'var(--muted)', fontWeight: 700 }}>
              {nextUpcomingExpense ? `-${formatMoney(nextUpcomingExpense.amount)}` : 'None'}
            </strong>
            <small>{nextUpcomingExpense ? `${nextUpcomingExpense.category} · ${DateUtils.formatDisplayDate(nextUpcomingExpense.date)}` : 'No upcoming expense in range'}</small>
          </div>
          <div
            className={`dashboard-focus-card ${nextUpcomingIncome ? 'history-summary-clickable-row' : ''}`}
            style={{ cursor: nextUpcomingIncome ? 'pointer' : 'default' }}
            onClick={() => {
              if (nextUpcomingIncome) {
                navigateTo('cashflow', {
                  category: nextUpcomingIncome.category,
                  month: DateUtils.getMonthKey(nextUpcomingIncome.date),
                  highlightId: nextUpcomingIncome.id,
                });
              }
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && nextUpcomingIncome) {
                e.preventDefault();
                navigateTo('cashflow', {
                  category: nextUpcomingIncome.category,
                  month: DateUtils.getMonthKey(nextUpcomingIncome.date),
                  highlightId: nextUpcomingIncome.id,
                });
              }
            }}
            tabIndex={nextUpcomingIncome ? 0 : undefined}
            role={nextUpcomingIncome ? 'button' : undefined}
            title={nextUpcomingIncome ? `Click to view ${nextUpcomingIncome.category} in Cash Flow` : undefined}
          >
            <span className="dashboard-focus-label">Next income</span>
            <strong style={{ color: nextUpcomingIncome ? 'var(--green, #10b981)' : 'var(--muted)', fontWeight: 700 }}>
              {nextUpcomingIncome ? `+${formatMoney(nextUpcomingIncome.amount)}` : 'None'}
            </strong>
            <small>{nextUpcomingIncome ? `${nextUpcomingIncome.category} · ${DateUtils.formatDisplayDate(nextUpcomingIncome.date)}` : 'No upcoming income in range'}</small>
          </div>
        </div>
        {nextUpcomingEntries.length > 0 && (
          <div className="dashboard-upcoming-list" aria-label="Next upcoming entries">
            {nextUpcomingEntries.map((entry) => {
              const isForeign = Boolean(entry.currency && entry.currency !== 'EGP');
              const nativeQty = isForeign
                ? (entry.originalAmount !== undefined && entry.originalAmount !== null
                    ? entry.originalAmount
                    : (entry.fxRateAtEntry ? Math.round((entry.amount / entry.fxRateAtEntry) * 100) / 100 : entry.amount))
                : entry.amount;

              return (
                <div
                  key={entry.id}
                  className="dashboard-upcoming-row history-summary-clickable-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    navigateTo('cashflow', {
                      category: entry.category,
                      month: DateUtils.getMonthKey(entry.date),
                      highlightId: entry.id,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigateTo('cashflow', {
                        category: entry.category,
                        month: DateUtils.getMonthKey(entry.date),
                        highlightId: entry.id,
                      });
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  title={`Click to view ${entry.category} in Cash Flow`}
                >
                  <span>{DateUtils.formatDisplayDate(entry.date)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>{entry.category}</strong>
                    {isForeign && (
                      <span className="source-pill" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', fontWeight: 700, fontSize: '10px' }}>
                        💵 {entry.currency}
                      </span>
                    )}
                  </div>
                  <span className={`pill ${entry.type}`}>
                    {entry.type === 'income' ? '+' : '-'}
                    {isForeign ? formatNativeCurrency(nativeQty, entry.currency) : formatMoney(entry.amount)}
                  </span>
                </div>
              );
            })}
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
              <span className="forecast-sim-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Target size={16} /> Can I Spend:
              </span>
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
                  <div
                    key={category}
                    className="list-row history-summary-clickable-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigateTo('cashflow', { category })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigateTo('cashflow', { category });
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    title={`Click to view ${category} in Cash Flow`}
                  >
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
                .map(([label, amount]) => {
                  const targetTab = label === 'Liquid Cash / Bank' ? 'accounts' : 'storage';
                  return (
                    <div
                      key={label}
                      className="list-row history-summary-clickable-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setActiveTab(targetTab)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveTab(targetTab);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      title={`Click to view ${label === 'Liquid Cash / Bank' ? 'Accounts' : 'Storage'}`}
                    >
                      <span>
                        {label === 'Foreign Currency' ? '💱 ' : label === 'Gold Assets' ? '🪙 ' : label === 'Liquid Cash / Bank' ? '💵 ' : ''}
                        {label}
                      </span>
                      <strong>{formatMoney(amount)} ({assetTotal ? Math.round((amount / assetTotal) * 100) : 0}%)</strong>
                    </div>
                  );
                })}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3 style={{ margin: 0 }}>Forecast warning</h3>
            </div>
            {deficits.hasDeficit ? (
              <div
                className="stack-list history-summary-clickable-row"
                style={{ cursor: 'pointer', borderRadius: '6px' }}
                onClick={() => setActiveTab('deficits')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTab('deficits');
                  }
                }}
                tabIndex={0}
                role="button"
                title="Click to view Deficit analysis and recovery plan"
              >
                <div className="list-row danger-row">
                  <span>Projected deficit peak</span>
                  <strong>{formatMoney(deficits.worstDeficit)}</strong>
                </div>
                <div className="list-row">
                  <span>Trigger date</span>
                  <strong>{DateUtils.formatDisplayDate(firstDeficit?.startDate || DateUtils.todayString())}</strong>
                </div>
                <div className="list-row">
                  <span>Recovery date</span>
                  <strong>{targetPeriod?.resolvedDate ? DateUtils.formatDisplayDate(targetPeriod.resolvedDate) : 'Unresolved'}</strong>
                </div>
                <div className="list-row">
                  <span>Status</span>
                  <strong style={{ color: 'var(--red)' }}>Action Required →</strong>
                </div>
              </div>
            ) : (
              <div className="stack-list">
                <div className="list-row success-row">
                  <span>Cashflow status</span>
                  <strong>Fully Covered</strong>
                </div>
                <div className="list-row">
                  <span>Projected cash floor</span>
                  <strong>{formatMoney(lowestPoint)}</strong>
                </div>
                <div className="list-row">
                  <span>Forecast horizon</span>
                  <strong>{visibleForecast.length} months safe</strong>
                </div>
                <div className="list-row">
                  <span>Deficit risk</span>
                  <strong style={{ color: 'var(--green)' }}>None detected</strong>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </section>
  );
};
