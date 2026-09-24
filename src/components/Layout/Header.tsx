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
import { calculateForecast, detectDeficits } from '../../engine/forecast';
import { computeFinancialHealthScore } from '../../engine/healthScore';
import { computeTotalStorageValue } from '../../engine/currency';
import { buildSalaryEntries, buildInstallmentEntries } from '../../engine/salaryAndInstallments';
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
    installments, 
    rates, 
    storageAssets 
  } = useBudgetStore();

  const totalCash = Object.values(accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const storageTotal = computeTotalStorageValue(storageAssets, rates);

  // Dynamic forecast & health calculation
  const currentYm = DateUtils.currentYearMonth();
  const salaryEntries = buildSalaryEntries(salaryPattern, currentYm, 4);
  const installmentEntries = buildInstallmentEntries(installments);
  const allCandidateEntries = [...entries, ...salaryEntries, ...installmentEntries];

  const forecast = calculateForecast(allCandidateEntries, totalCash, 12);
  const deficits = detectDeficits(forecast);
  const health = computeFinancialHealthScore(forecast, deficits, totalCash, storageTotal);

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

        {deficits.hasDeficit ? (
          <div className="badge badge-danger" title="Projected cash deficit detected">
            <ShieldAlert size={14} />
            <span>Deficit: -{formatMoney(deficits.worstDeficit)}</span>
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
