import React from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import { 
  Wallet, 
  Sun, 
  Moon, 
  Plus, 
  ShieldAlert, 
  Activity 
} from 'lucide-react';
import { calculateForecast, getActiveForecastEntries, getDeficitPeriods } from '../../engine/forecast';
import { computeFinancialHealthScore } from '../../engine/healthScore';
import { computeTotalStorageValue } from '../../engine/currency';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import { buildCreditDueEntries } from '../../engine/creditCards';
import { DateUtils } from '../../engine/dateUtils';

interface HeaderProps {
  onOpenAddModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAddModal }) => {
  const { 
    theme, 
    setTheme, 
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
    categoryCaps,
    savingsGoals,
    entryActuals,
    deletedForecasts,
  } = useBudgetStore();

  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const storageTotal = computeTotalStorageValue(storageAssets, rates);

  // Dynamic forecast & health calculation
  const currentYm = DateUtils.currentYearMonth();
  const hasMaterializedSalary = entries.some((entry) => entry.source === 'salary');
  const salaryEntries = hasMaterializedSalary ? [] : buildSalaryEntries(salaryPattern, currentYm, 12, salaryAnchorMonth);
  const installmentEntries = buildInstallmentEntries(installments);
  const creditEntries = buildCreditDueEntries({
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
    creditEntries,
    deletedForecasts,
    entryActuals
  );

  const forecast = calculateForecast(allCandidateEntries, totalCash, 12);
  const deficitPeriods = getDeficitPeriods(allCandidateEntries, totalCash);
  const health = computeFinancialHealthScore({
    entries: allCandidateEntries,
    forecast,
    deficitPeriods,
    actualCashNow: totalCash,
    storageTotal,
    categoryCaps,
    savingsGoals,
    entryActuals,
  });
  const hasDeficit = deficitPeriods.length > 0 || forecast.some((item) => item.balance < 0);

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand-badge">
          <div className="brand-icon">
            <Wallet size={20} />
          </div>
          <span>Budget Control</span>
        </div>

        <div className="badge badge-cyan" title="Total active liquid cash across all accounts">
          <span>{formatMoney(totalCash)}</span>
        </div>

        {hasDeficit ? (
          <div className="badge badge-danger" title="Projected cash deficit detected">
            <ShieldAlert size={14} />
            <span>Deficit: -{formatMoney(Math.max(0, ...deficitPeriods.map((item) => Math.abs(item.lowestBalance))))}</span>
          </div>
        ) : (
          <div className="badge badge-success" title="Cashflow forecast healthy">
            <Activity size={14} />
            <span>Healthy Runway</span>
          </div>
        )}
      </div>

      <div className="header-right">
        <div className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', fontWeight: 700 }}>
          Score: {health.score}/100 ({health.grade})
        </div>

        <button 
          className="btn btn-primary" 
          onClick={onOpenAddModal}
          id="quickAddEntryBtn"
        >
          <Plus size={16} />
          <span>New Entry</span>
        </button>

        <button 
          className="btn btn-secondary" 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ padding: '0.55rem' }}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
};
