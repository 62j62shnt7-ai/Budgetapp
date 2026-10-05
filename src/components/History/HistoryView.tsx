import React, { useEffect, useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { formatNativeCurrency } from '../../engine/currency';
import {
  isCreditCardExpense,
  buildCreditDueEntries,
  isCreditSettlementRow,
  getCoveredCreditSettlementKeys,
} from '../../engine/creditCards';
import { buildInstallmentEntries } from '../../engine/salaryAndInstallments';
import type { CashEntry } from '../../types';
import { Lock, Unlock, Trash2, RotateCcw } from 'lucide-react';
import { HistorySummaryTab } from './HistorySummaryTab';
import { HistoryAnalyticsSection } from './HistoryAnalyticsSection';
import { AffectedRecordsModal } from '../Modals/AffectedRecordsModal';
import {
  buildEntryDeleteOptions,
  hasEntryAffectedParties,
  buildEntryClearOptions,
  hasEntryClearAffectedParties,
} from '../../utils/affectedRecords';

interface HistoryViewProps {
  onEditEntry?: (entry: CashEntry) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onEditEntry }) => {
  const {
    entries,
    archivedEntries,
    installments,
    accounts,
    creditDues,
    creditSettlementOverrides,
    entryActuals,
    entryActualDates,
    deletedForecasts,
    recordActual,
    clearActual,
    deleteEntry,
    storageAssets,
    partTimeJobs,
    asfJobs,
    irqJobs,
    pendingNavigation,
    clearPendingNavigation,
  } = useBudgetStore();

  const [deleteEntryTarget, setDeleteEntryTarget] = useState<CashEntry | null>(null);
  const [clearEntryTarget, setClearEntryTarget] = useState<CashEntry | null>(null);

  const initialMonth = pendingNavigation?.tab === 'history' && pendingNavigation.filters?.month
    ? pendingNavigation.filters.month
    : 'all';
  const initialTab = pendingNavigation?.tab === 'history' && (pendingNavigation.filters?.month || pendingNavigation.filters?.category || pendingNavigation.filters?.highlightId || pendingNavigation.filters?.search || pendingNavigation.filters?.type || pendingNavigation.filters?.account || pendingNavigation.filters?.tag)
    ? 'transactions'
    : 'summary';

  const [activeHistoryTab, setActiveHistoryTab] = useState<'summary' | 'transactions'>(initialTab);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() =>
    localStorage.getItem('budget-control-history-admin-unlocked') === 'true'
  );

  const initialCategory = pendingNavigation?.tab === 'history' && pendingNavigation.filters?.category
    ? pendingNavigation.filters.category
    : 'all';

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [selectedType, setSelectedType] = useState<string>(
    pendingNavigation?.tab === 'history' && pendingNavigation.filters?.type ? pendingNavigation.filters.type : 'all'
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedAccount, setSelectedAccount] = useState<string>(
    pendingNavigation?.tab === 'history' && pendingNavigation.filters?.account ? pendingNavigation.filters.account : 'all'
  );
  const [selectedTag, setSelectedTag] = useState<string>(
    pendingNavigation?.tab === 'history' && pendingNavigation.filters?.tag ? pendingNavigation.filters.tag : 'all'
  );
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>(
    pendingNavigation?.tab === 'history' && pendingNavigation.filters?.search ? pendingNavigation.filters.search : ''
  );
  const [expandedDraws, setExpandedDraws] = useState<Set<string>>(new Set());

  const initialHighlightId = pendingNavigation?.tab === 'history' && pendingNavigation.filters?.highlightId
    ? pendingNavigation.filters.highlightId
    : null;
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(initialHighlightId);
  const [highlightTrigger, setHighlightTrigger] = useState(0);

  // Respond to programmatic navigation intents
  const [prevNav, setPrevNav] = useState(pendingNavigation);
  if (pendingNavigation && pendingNavigation.tab === 'history' && pendingNavigation !== prevNav) {
    setPrevNav(pendingNavigation);
    const f = pendingNavigation.filters;
    if (f) {
      setSelectedMonth(f.month !== undefined ? f.month : 'all');
      setSelectedType(f.type !== undefined ? f.type : 'all');
      setSelectedCategory(f.category !== undefined ? f.category : 'all');
      setSelectedAccount(f.account !== undefined ? f.account : 'all');
      setSelectedTag(f.tag !== undefined ? f.tag : 'all');
      setSelectedCategoryGroup('all');
      setSearchTerm(f.search !== undefined ? f.search : '');
      if (f.month || f.highlightId || f.category || f.search || f.type || f.account || f.tag) {
        setActiveHistoryTab('transactions');
      }
      if (f.highlightId) {
        setHighlightedEntryId(f.highlightId);
        setHighlightTrigger((c) => c + 1);
      }
    }
  }

  useEffect(() => {
    if (pendingNavigation && pendingNavigation.tab === 'history') {
      clearPendingNavigation();
    }
  }, [pendingNavigation, clearPendingNavigation]);

  useEffect(() => {
    if (!highlightedEntryId) return;

    const scrollToTarget = () => {
      const row =
        document.getElementById(`history-row-${highlightedEntryId}`) ||
        (typeof CSS !== 'undefined' && CSS?.escape
          ? document.querySelector(`[data-entry-id="${CSS.escape(highlightedEntryId)}"]`) ||
            document.querySelector(`[data-legacy-id="${CSS.escape(highlightedEntryId)}"]`)
          : null);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
      return false;
    };

    const timer = setTimeout(() => {
      if (!scrollToTarget()) {
        setTimeout(scrollToTarget, 180);
      }
    }, 100);

    const clearGlowTimer = setTimeout(() => {
      setHighlightedEntryId(null);
    }, 3500);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearGlowTimer);
    };
  }, [highlightedEntryId, highlightTrigger]);

  // Analytics UI state
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState<boolean>(() =>
    localStorage.getItem('budget-control-history-analytics-collapsed') === 'true'
  );
  const [groupBy, setGroupBy] = useState<'category' | 'tag'>(() =>
    localStorage.getItem('budget-control-history-analytics-grouping') === 'tag' ? 'tag' : 'category'
  );
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'both'>(() => {
    const saved = localStorage.getItem('budget-control-history-analytics-view');
    return saved === 'table' || saved === 'both' ? saved : 'chart';
  });

  useEffect(() => {
    localStorage.setItem('budget-control-history-admin-unlocked', String(isAdminUnlocked));
  }, [isAdminUnlocked]);
  useEffect(() => {
    localStorage.setItem('budget-control-history-analytics-collapsed', String(analyticsCollapsed));
  }, [analyticsCollapsed]);
  useEffect(() => {
    localStorage.setItem('budget-control-history-analytics-grouping', groupBy);
  }, [groupBy]);
  useEffect(() => {
    localStorage.setItem('budget-control-history-analytics-view', viewMode);
  }, [viewMode]);

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedType('all');
    setSelectedCategory('all');
    setSelectedAccount('all');
    setSelectedTag('all');
    setSelectedCategoryGroup('all');
    setSearchTerm('');
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTag((current) => current.toLowerCase() === tag.toLowerCase() ? 'all' : tag);
  };

  const handleCategoryFilter = (cat: string) => {
    setSelectedCategory((current) => (current === cat ? 'all' : cat));
  };

  const handleAccountFilter = (acc: string) => {
    setSelectedAccount((current) => (current.toLowerCase() === acc.toLowerCase() ? 'all' : acc.toLowerCase()));
  };

  const handleClearActual = (entry: CashEntry) => {
    setClearEntryTarget(entry);
  };

  const getEntryActualAmount = React.useCallback((entry: CashEntry): number => {
    if (!entry) return 0;
    if (entryActuals[entry.id] !== undefined) return Math.round(Number(entryActuals[entry.id]) || 0);
    const legacyId = `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || 'cash'}`;
    if (entryActuals[legacyId] !== undefined) return Math.round(Number(entryActuals[legacyId]) || 0);
    if (entry.actualAmount !== undefined && entry.actualAmount !== null) return Math.round(Number(entry.actualAmount) || 0);
    return 0;
  }, [entryActuals]);

  const getEntryActualDate = React.useCallback((entry: CashEntry): string => {
    if (!entry) return DateUtils.todayString();
    if (entry.draws && Array.isArray(entry.draws) && entry.draws.length > 0) {
      const validDates = entry.draws.map((d) => d.date).filter(Boolean).sort();
      if (validDates.length > 0) return validDates[validDates.length - 1];
    }
    const id = entry.id || '';
    if (entryActualDates && entryActualDates[id]) return entryActualDates[id];
    if (entry.actualDate) return entry.actualDate;
    return entry.date || DateUtils.todayString();
  }, [entryActualDates]);

  // Actualized entries: matching legacy actualizedEntries() 1:1
  const actualEntries = React.useMemo(() => {
    const installmentEntries = buildInstallmentEntries(installments || []);
    const creditEntries = buildCreditDueEntries({
      accounts: accounts || {},
      creditDues: creditDues || {},
      cashEntries: entries || [],
      archivedEntries: archivedEntries || [],
      entryActuals: entryActuals || {},
      entryActualDates: entryActualDates || {},
      creditSettlementOverrides: creditSettlementOverrides || {},
    });

    const coveredSettlementKeys = getCoveredCreditSettlementKeys(
      entries || [],
      entryActuals || {},
      entryActualDates || {},
      creditSettlementOverrides || {},
      archivedEntries || []
    );

    const deletedSet = new Set(deletedForecasts || []);

    const validCreditDues = creditEntries.filter((entry) => {
      if (deletedSet.has(entry.id)) return false;
      if (getEntryActualAmount(entry) <= 0) return false;
      const parts = (entry.id || '').split('-');
      if (parts[0] === 'credit' && parts[1] === 'settlement') {
        const accKey = parts[2];
        const mKey = `${parts[3]}-${parts[4]}`;
        if (coveredSettlementKeys.has(`${accKey}-${mKey}`)) return false;
      }
      return true;
    });

    const activeCandidates = [
      ...(entries || []),
      ...installmentEntries,
      ...validCreditDues,
    ].filter((entry) => !deletedSet.has(entry.id) && getEntryActualAmount(entry) > 0);

    const seenIds = new Set<string>();
    const dedupedActive: CashEntry[] = [];
    activeCandidates.forEach((entry) => {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        dedupedActive.push(entry);
      }
    });

    const archivedWithActuals = (archivedEntries || []).filter(
      (entry) => getEntryActualAmount(entry) > 0 && !seenIds.has(entry.id) && !deletedSet.has(entry.id)
    );

    return [...dedupedActive, ...archivedWithActuals];
  }, [entries, archivedEntries, installments, accounts, creditDues, creditSettlementOverrides, entryActuals, entryActualDates, deletedForecasts, getEntryActualAmount]);

  // 1. Monthly Summary Calculation
  const monthsSet = new Set<string>();
  actualEntries.forEach((entry) => {
    if (entry.draws && entry.draws.length > 0) {
      entry.draws.forEach((d) => {
        const k = DateUtils.getMonthKey(d.date);
        if (k) monthsSet.add(k);
      });
    } else {
      const actDate = getEntryActualDate(entry);
      const k = DateUtils.getMonthKey(actDate);
      if (k) monthsSet.add(k);
    }
  });
  const orderedMonths = Array.from(monthsSet).sort();

  // Cash basis: card spends are not counted when swiped; the settlement is counted
  // in full in the month it is paid, so nothing is double counted. The settled
  // credit amount is reported separately (shown in brackets in the UI).
  const monthlySummaryRows = React.useMemo(() => {
    return orderedMonths.map((month) => {
      let income = 0;
      let expenses = 0;
      let creditSettled = 0;

      actualEntries.forEach((entry) => {
        if (entry.type !== 'income' && isCreditCardExpense(entry)) return;
        const settlement = isCreditSettlementRow(entry);
        if (entry.draws && entry.draws.length > 0) {
          const monthDraws = entry.draws.filter((d) => DateUtils.getMonthKey(d.date) === month);
          const monthTotal = monthDraws.reduce((sum, d) => sum + Number(d.amount || 0), 0);
          if (entry.type === 'income') income += monthTotal;
          else {
            expenses += monthTotal;
            if (settlement) creditSettled += monthTotal;
          }
        } else {
          const actDate = getEntryActualDate(entry);
          if (DateUtils.getMonthKey(actDate) === month) {
            const amt = getEntryActualAmount(entry);
            if (entry.type === 'income') {
              income += amt;
            } else {
              expenses += amt;
              if (settlement) creditSettled += amt;
            }
          }
        }
      });

      const net = income - expenses;
      const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

      return {
        month,
        income,
        expenses,
        creditSettled,
        net,
        savingsRate,
      };
    });
  }, [orderedMonths, actualEntries, getEntryActualAmount, getEntryActualDate]);

  const totalLifetimeIncome = monthlySummaryRows.reduce((sum, r) => sum + r.income, 0);
  const totalLifetimeExpenses = monthlySummaryRows.reduce((sum, r) => sum + r.expenses, 0);
  const totalLifetimeCredit = monthlySummaryRows.reduce((sum, r) => sum + r.creditSettled, 0);
  const lifetimeNet = totalLifetimeIncome - totalLifetimeExpenses;
  const lifetimeSavingsRate = totalLifetimeIncome > 0 ? Math.round((lifetimeNet / totalLifetimeIncome) * 100) : 0;

  // Filter options for Individual Validations
  const getEntryTags = (entry: CashEntry): string[] => {
    const tags = [entry.tag].filter((tag): tag is string => Boolean(tag && tag.trim()));
    (entry.draws || []).forEach((draw) => {
      if (draw.tag && draw.tag.trim()) tags.push(draw.tag.trim());
    });
    return Array.from(new Set(tags));
  };

  const allAccounts = Array.from(new Set(actualEntries.map((e) => e.account || 'cash'))).sort();
  const allTags = Array.from(new Set(actualEntries.flatMap(getEntryTags))).sort((a, b) => a.localeCompare(b));
  const allCategories = Array.from(
    new Set(actualEntries.map((e) => e.category).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const hasUntagged = actualEntries.some((entry) =>
    getEntryTags(entry).length === 0 || (entry.draws || []).some((draw) => !draw.tag || !draw.tag.trim())
  );

  // Helper for filtered entry amount
  const getFilteredEntryAmount = (entry: CashEntry): number => {
    const totalActual = getEntryActualAmount(entry);
    if (entry.draws && entry.draws.length > 0) {
      let trancheSum = 0;
      let matchedAny = false;
      entry.draws.forEach((d) => {
        const dAmt = Number(d.amount) || 0;
        const dMonth = DateUtils.getMonthKey(d.date);
        const dTag = (d.tag || entry.tag || '').trim();

        if (selectedMonth !== 'all' && dMonth !== selectedMonth) return;
        if (selectedTag !== 'all' && dTag.toLowerCase() !== selectedTag.toLowerCase()) return;
        if (selectedCategory !== 'all' && entry.category !== selectedCategory) return;

        trancheSum += dAmt;
        matchedAny = true;
      });
      if (matchedAny) return trancheSum;
      if (selectedMonth !== 'all' || selectedTag !== 'all' || selectedCategory !== 'all') return 0;
    }

    const actDate = getEntryActualDate(entry);
    if (selectedMonth !== 'all' && DateUtils.getMonthKey(actDate) !== selectedMonth) return 0;

    if (selectedCategory !== 'all' && entry.category !== selectedCategory) return 0;
    if (selectedCategoryGroup !== 'all' && getSmartGroupBucket(entry) !== selectedCategoryGroup) return 0;

    const eTag = (entry.tag || '').trim();
    if (selectedTag === '__untagged__') return eTag ? 0 : totalActual;
    if (selectedTag !== 'all' && eTag.toLowerCase() !== selectedTag.toLowerCase()) return 0;

    return totalActual;
  };

  const filteredEntries = actualEntries.filter((entry) => {
    if (selectedMonth !== 'all') {
      if (entry.draws && entry.draws.length > 0) {
        const hasDraw = entry.draws.some((d) => DateUtils.getMonthKey(d.date) === selectedMonth);
        if (!hasDraw) return false;
      } else {
        const actDate = getEntryActualDate(entry);
        if (DateUtils.getMonthKey(actDate) !== selectedMonth) return false;
      }
    }

    if (selectedType !== 'all' && entry.type !== selectedType) return false;
    if (selectedCategory !== 'all' && entry.category !== selectedCategory) return false;
    if (selectedAccount !== 'all' && (entry.account || 'cash').toLowerCase() !== selectedAccount.toLowerCase()) return false;
    if (selectedCategoryGroup !== 'all' && getSmartGroupBucket(entry) !== selectedCategoryGroup) return false;

    if (selectedTag !== 'all') {
      const eTag = (entry.tag || '').toLowerCase();
      const hasUntaggedDraw = (entry.draws || []).some((draw) => !draw.tag || !draw.tag.trim());
      const hasDrawTag = (entry.draws || []).some((draw) => (draw.tag || '').toLowerCase() === selectedTag.toLowerCase());
      if (selectedTag === '__untagged__') {
        if (eTag || !hasUntaggedDraw && getEntryTags(entry).length > 0) return false;
      } else if (eTag !== selectedTag.toLowerCase() && !hasDrawTag) {
        return false;
      }
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const cat = (entry.category || '').toLowerCase();
      const sub = (entry.subcategory || '').toLowerCase();
      const tag = getEntryTags(entry).join(' ').toLowerCase();
      const acc = (entry.account || '').toLowerCase();
      const source = (entry.source || '').toLowerCase();
      if (!cat.includes(term) && !sub.includes(term) && !tag.includes(term) && !acc.includes(term) && !source.includes(term)) return false;
    }

    return true;
  });

  // Sort newest first
  filteredEntries.sort((a, b) => (getEntryActualDate(b) || '').localeCompare(getEntryActualDate(a) || ''));

  const filteredIncome = filteredEntries
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  // Cash basis: card spends are excluded; settlements count in full.
  const getNettedExpenseAmount = (e: CashEntry): number =>
    isCreditCardExpense(e) ? 0 : getFilteredEntryAmount(e);

  const filteredExpenses = filteredEntries
    .filter((e) => e.type === 'expense')
    .reduce((sum, e) => sum + getNettedExpenseAmount(e), 0);

  const filteredCredit = filteredEntries
    .filter((e) => isCreditSettlementRow(e))
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  const filteredNet = filteredIncome - filteredExpenses;

  // Grouped Analytics breakdown
  const getSmartGroupBucket = (entry: CashEntry): string => {
    const category = (entry.category || '').toLowerCase();
    const source = (entry.source || '').toLowerCase();
    if (entry.type === 'income') {
      if (category.includes('salary')) return 'Salary';
      if (category.includes('loan') || source.includes('loan')) return 'Loans Received';
      return 'Other Income';
    }
    if (/bill|utility|rent|telecom|internet|subscription|mobile|phone|vodafone|orange|etisalat|electricity|water|gas|club/.test(category)) return 'Bills & Utilities';
    if (source.includes('recurring credit') || category.includes('credit') || category.includes('cib') || category.includes('hsbc')) return 'Credit & Cards';
    if (source.includes('installment') || /installment|valyou|sympl|souhoola/.test(category)) return 'Installments';
    if (source.includes('loan') || category.includes('loan') || category.includes('repay')) return 'Loan Repayments';
    if (/food|grocer|market|dining|cafe|coffee|restaurant|fuel|car|transport|uber|health|pharmacy|doctor|personal|shopping/.test(category)) return 'Living & Daily Spend';
    return entry.category || 'General Expenses';
  };

  const groups: Record<string, { count: number; total: number; type: 'income' | 'expense' }> = {};
  filteredEntries.forEach((e) => {
    if (groupBy === 'tag' && e.draws && e.draws.length > 0) {
      e.draws.forEach((draw) => {
        if (selectedMonth !== 'all' && DateUtils.getMonthKey(draw.date) !== selectedMonth) return;
        const tag = draw.tag?.trim() || 'Untagged';
        if (selectedTag === '__untagged__' && tag !== 'Untagged') return;
        if (selectedTag !== 'all' && selectedTag !== '__untagged__'
          && selectedTag.toLowerCase() !== tag.toLowerCase()) return;
        const key = `${tag}|${e.type}`;
        if (!groups[key]) groups[key] = { count: 0, total: 0, type: e.type };
        groups[key].count += 1;
        groups[key].total += Number(draw.amount) || 0;
      });
      return;
    }
    const key = `${groupBy === 'category' ? getSmartGroupBucket(e) : (e.tag || 'Untagged')}|${e.type}`;
    const amt = e.type === 'expense' ? getNettedExpenseAmount(e) : getFilteredEntryAmount(e);
    if (!groups[key]) groups[key] = { count: 0, total: 0, type: e.type };
    groups[key].count += 1;
    groups[key].total += amt;
  });

  const sortedGroups = Object.entries(groups)
    .map(([key, value]) => [key.split('|')[0], value] as [string, typeof value])
    .sort((a, b) => b[1].total - a[1].total);
  const totalAnalyticsAmount = sortedGroups.reduce((s, g) => s + g[1].total, 0);

  return (
    <section className="view history-view" id="history" style={{ display: 'block' }}>
      {/* Subnav Tabs */}
      <div className="subnav-tabs history-main-tabs" role="tablist" aria-label="History tabs" style={{ marginBottom: '20px' }}>
        <button
          className={`subnav-tab ${activeHistoryTab === 'summary' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeHistoryTab === 'summary'}
          aria-controls="historySummaryPane"
          onClick={() => setActiveHistoryTab('summary')}
        >
          📊 Monthly Summary
        </button>
        <button
          className={`subnav-tab ${activeHistoryTab === 'transactions' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeHistoryTab === 'transactions'}
          aria-controls="historyTransactionsPane"
          onClick={() => setActiveHistoryTab('transactions')}
        >
          📋 Individual Validations
        </button>
      </div>

      {/* Tab 1: Monthly Summary */}
      {activeHistoryTab === 'summary' && (
        <HistorySummaryTab
          totalLifetimeIncome={totalLifetimeIncome}
          totalLifetimeExpenses={totalLifetimeExpenses}
          totalLifetimeCredit={totalLifetimeCredit}
          lifetimeNet={lifetimeNet}
          lifetimeSavingsRate={lifetimeSavingsRate}
          monthlySummaryRows={monthlySummaryRows}
          onSelectMonth={(month) => {
            setSelectedMonth(month);
            setActiveHistoryTab('transactions');
            requestAnimationFrame(() => {
              const el = document.getElementById('historyFilteredSummary') || document.getElementById('historyTransactionsPane');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            });
          }}
        />
      )}

      {/* Tab 2: Individual Validations */}
      {activeHistoryTab === 'transactions' && (
        <div className="history-tab-pane" id="historyTransactionsPane">
          <div className="panel history-filter-panel" style={{ marginBottom: '18px' }}>
            <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Filter Validated Entries</h3>
              <span id="historyFilteredCount" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <div className="history-filters-bar">
              <label className="history-filter-field">
                <span className="field-label-text">Month</span>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  <option value="all">All months</option>
                  {orderedMonths.slice().reverse().map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="history-filter-field">
                <span className="field-label-text">Type</span>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                  <option value="all">All types</option>
                  <option value="expense">Expenses</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label className="history-filter-field">
                <span className="field-label-text">Category</span>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  <option value="all">All categories</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <label className="history-filter-field">
                <span className="field-label-text">Account</span>
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                  <option value="all">All accounts</option>
                  {allAccounts.map((acc) => (
                    <option key={acc} value={acc}>{acc.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label className="history-filter-field">
                <span className="field-label-text">Tag / Subcategory</span>
                <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
                  <option value="all">All tags</option>
                  {hasUntagged && <option value="__untagged__">📁 Untagged</option>}
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>🏷️ {tag}</option>
                  ))}
                </select>
              </label>
              <label className="history-filter-field history-search-field">
                <span className="field-label-text">Search</span>
                <input
                  id="historySearch"
                  type="search"
                  placeholder="Search category, tag..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </label>
              <button
                className="ghost-button history-reset-btn"
                type="button"
                onClick={handleResetFilters}
              >
                Reset filters
              </button>
            </div>
            {(selectedMonth !== 'all' || selectedCategory !== 'all' || selectedCategoryGroup !== 'all' || selectedTag !== 'all' || selectedType !== 'all' || selectedAccount !== 'all' || searchTerm) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '10px',
                  padding: '6px 12px',
                  background: 'rgba(99, 102, 241, 0.08)',
                  borderRadius: '6px',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  fontSize: '12px',
                  color: 'var(--text-main, var(--ink))',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--muted)' }}>Active filters:</span>
                {selectedMonth !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                    📅 Month: <strong>{selectedMonth}</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                      onClick={() => setSelectedMonth('all')}
                      title="Clear month filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {selectedCategory !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                    📁 Category: <strong>{selectedCategory}</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                      onClick={() => setSelectedCategory('all')}
                      title="Clear category filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {selectedCategoryGroup !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                    📁 Group: <strong>{selectedCategoryGroup}</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                      onClick={() => setSelectedCategoryGroup('all')}
                      title="Clear category group filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {selectedTag !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                    🏷️ Tag: <strong>{selectedTag === '__untagged__' ? 'Untagged' : selectedTag}</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                      onClick={() => setSelectedTag('all')}
                      title="Clear tag filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {selectedType !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                    Type: <strong>{selectedType}</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                      onClick={() => setSelectedType('all')}
                      title="Clear type filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {selectedAccount !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                    Account: <strong>{selectedAccount.toUpperCase()}</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                      onClick={() => setSelectedAccount('all')}
                      title="Clear account filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {searchTerm && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                    Search: <strong>&quot;{searchTerm}&quot;</strong>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--brand-primary, #6366f1)', fontWeight: 700 }}
                      onClick={() => setSearchTerm('')}
                      title="Clear search filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-primary, #6366f1)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: 0,
                    marginLeft: 'auto',
                  }}
                  onClick={handleResetFilters}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="metrics-grid history-summary-grid" id="historyFilteredSummary" style={{ marginBottom: '18px' }}>
            <article className="metric history-metric">
              <span>Filtered Income</span>
              <strong style={{ color: 'var(--green)' }}>{formatMoney(filteredIncome)}</strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric history-metric">
              <span>Filtered Expenses</span>
              <strong style={{ color: 'var(--red)' }}>
                {formatMoney(filteredExpenses - filteredCredit)}
                {filteredCredit > 0 && (
                  <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: '0.8em' }}> ({formatMoney(filteredCredit)} settlement)</span>
                )}
              </strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric history-metric">
              <span>Filtered Net</span>
              <strong style={{ color: filteredNet >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {filteredNet >= 0 ? '+' : ''}{formatMoney(filteredNet)}
              </strong>
              <small>Income minus expenses</small>
            </article>
          </div>

          {/* Collapsible Spending Analytics */}
          <HistoryAnalyticsSection
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            viewMode={viewMode}
            setViewMode={setViewMode}
            analyticsCollapsed={analyticsCollapsed}
            setAnalyticsCollapsed={setAnalyticsCollapsed}
            sortedGroups={sortedGroups}
            totalAnalyticsAmount={totalAnalyticsAmount}
            onSelectGroup={(groupName, currentGroupBy) => {
              if (currentGroupBy === 'tag') {
                setSelectedCategoryGroup('all');
                if (groupName.toLowerCase() === 'untagged') {
                  setSelectedTag('__untagged__');
                } else {
                  setSelectedTag(groupName);
                }
              } else {
                setSelectedTag('all');
                setSelectedCategoryGroup(groupName);
              }
              requestAnimationFrame(() => {
                const el = document.getElementById('historyEntriesHeading') || document.getElementById('historyTransactionsPane');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              });
            }}
          />

          {/* Validated Entries Table */}
          <section className="panel">
            <div className="panel-heading history-entries-heading" id="historyEntriesHeading">
              <h3 style={{ margin: 0 }}>Individual Validated Entries</h3>
              <button
                className="ghost-button history-admin-toggle-btn"
                type="button"
                onClick={() => setIsAdminUnlocked(!isAdminUnlocked)}
              >
                {isAdminUnlocked ? <Unlock size={14} color="var(--amber)" /> : <Lock size={14} />}
                <span>Admin Mode: {isAdminUnlocked ? 'Active' : 'Locked'}</span>
              </button>
            </div>

            {isAdminUnlocked && (
              <div style={{ background: 'rgba(217,142,43,0.12)', border: '1px solid rgba(217,142,43,0.35)', borderRadius: '6px', padding: '8px 12px', fontSize: '12.5px', color: 'var(--ink)', margin: '10px 0' }}>
                🔓 <strong>Admin Mode Active:</strong> Click an entry to edit it, or clear actual amounts and delete entries directly from this table.
              </div>
            )}

            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 12px' }}>
              Detailed record of every planned entry that has had an actual amount spent or received.
            </p>

            <div className="table-wrap responsive-cards">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th className="number">Forecast</th>
                    <th className="number">Actual</th>
                    <th className="number">Variance</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                        No validated entries match the current filter selection.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry) => {
                      const actual = getEntryActualAmount(entry);
                      const actDate = getEntryActualDate(entry);
                      const plannedVal = Number(entry.amount) || 0;
                      const entryId = entry.id;
                      const hasMultipleDraws = Boolean(entry.draws && entry.draws.length > 1);
                      const isDrawsExpanded = expandedDraws.has(entryId);
                      // FX-conversion entries are one-time completed transfers, not a
                      // "planned then actualized" forecast item — there's no meaningful
                      // planned state to revert to, so "Clear" doesn't apply. Deleting
                      // (with "Restore Foreign Storage Asset" checked) is the only valid undo.
                      const isFxConversionEntry = entry.conversionType === 'fx-sale';

                      let varianceText = '—';
                      let varianceClass = 'neutral';
                      if (plannedVal > 0) {
                        const roundedPlanned = Math.round(plannedVal);
                        const roundedActual = Math.round(actual);
                        if (entry.type === 'expense') {
                          const diff = roundedPlanned - roundedActual;
                          if (diff > 0) {
                            varianceText = `+${formatMoney(diff)} under`;
                            varianceClass = 'favorable';
                          } else if (diff < 0) {
                            varianceText = `-${formatMoney(Math.abs(diff))} over`;
                            varianceClass = 'unfavorable';
                          } else {
                            varianceText = 'On budget';
                            varianceClass = 'neutral';
                          }
                        } else {
                          const diff = roundedActual - roundedPlanned;
                          if (diff > 0) {
                            varianceText = `+${formatMoney(diff)} extra`;
                            varianceClass = 'favorable';
                          } else if (diff < 0) {
                            varianceText = `-${formatMoney(Math.abs(diff))} short`;
                            varianceClass = 'unfavorable';
                          } else {
                            varianceText = 'Exact';
                            varianceClass = 'neutral';
                          }
                        }
                      }

                        const isTargeted = highlightedEntryId === entry.id || highlightedEntryId === entryId;
                        const rowClass = `${isAdminUnlocked && onEditEntry ? 'history-entry-editable' : ''} ${isTargeted ? 'entry-row-targeted' : ''}`.trim() || undefined;

                        return (
                          <React.Fragment key={entryId}>
                          <tr
                            id={`history-row-${entry.id || entryId}`}
                            data-entry-id={entry.id}
                            data-legacy-id={entryId}
                            className={rowClass}
                            onClick={(event) => {
                              if (!isAdminUnlocked || !onEditEntry) return;
                              const target = event.target as HTMLElement;
                              if (target.closest('button, input, select, textarea, a')) return;
                            onEditEntry(entry);
                          }}
                          onKeyDown={(event) => {
                            if (!isAdminUnlocked || !onEditEntry || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            onEditEntry(entry);
                          }}
                          tabIndex={isAdminUnlocked && onEditEntry ? 0 : undefined}
                          role={isAdminUnlocked && onEditEntry ? 'button' : undefined}
                          title={isAdminUnlocked && onEditEntry ? 'Click to edit this entry' : undefined}
                        >
                          <td className="cell-date">
                            <strong>{DateUtils.formatDisplayDate(actDate)}</strong>
                            {hasMultipleDraws && (
                              <button
                                type="button"
                                className="ghost-button history-draws-toggle-btn"
                                style={{ display: 'inline-flex', alignItems: 'center', marginTop: '4px', padding: '2px 8px', fontSize: '11px', borderRadius: '6px' }}
                                onClick={() => setExpandedDraws((current) => {
                                  const next = new Set(current);
                                  if (next.has(entryId)) next.delete(entryId);
                                  else next.add(entryId);
                                  return next;
                                })}
                              >
                                {isDrawsExpanded ? '▴ Hide subspends' : `▾ ${entry.draws?.length} subspends`}
                              </button>
                            )}
                          </td>
                          <td className="cell-category">
                            <strong
                              className="history-summary-clickable-row"
                              style={{
                                cursor: 'pointer',
                                padding: '1px 5px',
                                margin: '-1px -5px',
                                borderRadius: '4px',
                                display: 'inline-block',
                                color: selectedCategory === entry.category ? 'var(--brand-primary, #6366f1)' : undefined,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCategoryFilter(entry.category);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCategoryFilter(entry.category);
                                }
                              }}
                              title={`Click to filter entries by category: ${entry.category}`}
                            >
                              {entry.category}
                            </strong>
                            {entry.currency && entry.currency !== 'EGP' && (
                              <span className="source-pill" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', fontWeight: 700, fontSize: '10px', marginLeft: '4px' }}>
                                💵 {entry.currency}
                              </span>
                            )}
                            {getEntryTags(entry).map((tag) => (
                              <button
                                key={`${entry.id}-${tag}`}
                                type="button"
                                className={`history-tag-filter ${selectedTag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTagFilter(tag);
                                }}
                                aria-pressed={selectedTag.toLowerCase() === tag.toLowerCase()}
                              >
                                <span aria-hidden="true">#</span>{tag}
                              </button>
                            ))}
                          </td>
                          <td className="cell-account">
                            <span
                              className="account-pill history-summary-clickable-row"
                              style={{
                                cursor: 'pointer',
                                border: selectedAccount.toLowerCase() === (entry.account || 'cash').toLowerCase() ? '1px solid var(--brand-primary, #6366f1)' : undefined,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAccountFilter(entry.account || 'cash');
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleAccountFilter(entry.account || 'cash');
                                }
                              }}
                              title={`Click to filter entries by account: ${(entry.account || 'cash').toUpperCase()}`}
                            >
                              {entry.account?.toUpperCase() || 'CASH'}
                            </span>
                          </td>
                          <td className="cell-type">
                            <span
                              className={`pill ${entry.type} history-summary-clickable-row`}
                              style={{
                                cursor: 'pointer',
                                outline: selectedType === entry.type ? '2px solid var(--brand-primary, #6366f1)' : undefined,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedType((prev) => (prev === entry.type ? 'all' : entry.type));
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedType((prev) => (prev === entry.type ? 'all' : entry.type));
                                }
                              }}
                              title={`Click to filter entries by type: ${entry.type}`}
                            >
                              {entry.type}
                            </span>
                          </td>
                          <td className="cell-source" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            {entry.source && !['manual', 'expense', 'income', 'direct', 'starting balance', 'cash', 'default'].includes(entry.source.toLowerCase()) ? (
                              <span className={`source-pill ${entry.source === 'loan' ? 'loan' : ''}`}>
                                {entry.source === 'recurring credit' ? '🏛️ Credit Settlement' : entry.source === 'credit card' ? '💳 Credit Card' : entry.source}
                              </span>
                            ) : null}
                          </td>
                          <td className="cell-planned number" style={{ color: 'var(--muted)', fontWeight: 600 }}>
                            <span className="mobile-cell-label">Planned: </span>
                            {entry.currency && entry.currency !== 'EGP' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                <span>
                                  {formatNativeCurrency(
                                    entry.originalAmount !== undefined && entry.originalAmount !== null
                                      ? entry.originalAmount
                                      : (entry.fxRateAtEntry ? Math.round((entry.amount / entry.fxRateAtEntry) * 100) / 100 : entry.amount),
                                    entry.currency
                                  )}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>
                                  ≈ {formatMoney(entry.amount)}
                                </span>
                              </div>
                            ) : (
                              <span>{formatMoney(entry.amount)}</span>
                            )}
                          </td>
                          <td className="cell-actual number" style={{ color: entry.type === 'income' ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>
                            {isAdminUnlocked ? (
                              <div className="history-admin-input-wrap">
                                <span className="mobile-cell-label">Actual:</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  defaultValue={actual || ''}
                                  className="history-admin-input form-input"
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      const value = Math.round(Number(event.currentTarget.value) || 0);
                                      if (value <= 0) handleClearActual(entry);
                                      else recordActual(entry.id, value, actDate, { tag: entry.tag, account: entry.account });
                                      event.currentTarget.blur();
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="history-actual-display" style={{ color: entry.type === 'income' ? 'var(--green)' : 'var(--red)' }}>
                                {entry.type === 'income' ? '+' : '-'}{formatMoney(actual)}
                              </span>
                            )}
                          </td>
                          <td className="cell-variance number">
                            <span className={`variance-pill ${varianceClass}`}>
                              {varianceText}
                            </span>
                          </td>
                          <td className="cell-actions">
                            {isAdminUnlocked ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {isFxConversionEntry ? (
                                  <button
                                    className="ghost-button icon-button"
                                    type="button"
                                    disabled
                                    style={{ position: 'relative', opacity: 0.4, cursor: 'not-allowed' }}
                                    title="Not applicable — this is a completed FX conversion, not a planned entry. Delete it (and restore the foreign asset) to undo it."
                                  >
                                    <RotateCcw size={13} />
                                  </button>
                                ) : (() => {
                                  const hasClearAffected = hasEntryClearAffectedParties(entry, {
                                    installments,
                                    storageAssets,
                                    partTimeJobs,
                                    asfJobs,
                                    irqJobs,
                                    accounts,
                                    entryActuals,
                                    entryActualDates,
                                  });
                                  return (
                                    <button
                                      className="ghost-button icon-button"
                                      type="button"
                                      style={{ position: 'relative' }}
                                      title={hasClearAffected ? 'Clear actual (has affected linked records)' : 'Clear actual (revert to forecast)'}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleClearActual(entry);
                                      }}
                                    >
                                      <RotateCcw size={13} />
                                      {hasClearAffected && (
                                        <span
                                          className="affected-parties-dot"
                                          title="Has affected linked records"
                                        />
                                      )}
                                    </button>
                                  );
                                })()}
                                {(() => {
                                  const hasAffected = hasEntryAffectedParties(entry, {
                                    installments,
                                    storageAssets,
                                    partTimeJobs,
                                    asfJobs,
                                    irqJobs,
                                    accounts,
                                    entryActuals,
                                    entries,
                                  });
                                  return (
                                    <button
                                      className="delete-button icon-button"
                                      type="button"
                                      style={{ position: 'relative' }}
                                      title={hasAffected ? 'Delete entry (has affected linked records)' : 'Delete entry'}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteEntryTarget(entry);
                                      }}
                                    >
                                      <Trash2 size={13} />
                                      {hasAffected && (
                                        <span
                                          className="affected-parties-dot"
                                          title="Has affected linked records"
                                        />
                                      )}
                                    </button>
                                  );
                                })()}
                              </div>
                            ) : isFxConversionEntry ? (
                              <button
                                className="ghost-button history-clear-btn"
                                type="button"
                                disabled
                                style={{ position: 'relative', opacity: 0.4, cursor: 'not-allowed' }}
                                title="Not applicable — this is a completed FX conversion, not a planned entry."
                              >
                                Clear
                              </button>
                            ) : (
                              (() => {
                                const hasClearAffected = hasEntryClearAffectedParties(entry, {
                                  installments,
                                  storageAssets,
                                  partTimeJobs,
                                  asfJobs,
                                  irqJobs,
                                  accounts,
                                  entryActuals,
                                  entryActualDates,
                                });
                                return (
                                  <button
                                    className="ghost-button history-clear-btn"
                                    type="button"
                                    style={{ position: 'relative' }}
                                    title={hasClearAffected ? 'Clear recorded actual (has affected linked records)' : 'Reset actual amount to 0'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClearActual(entry);
                                    }}
                                  >
                                    Clear
                                    {hasClearAffected && (
                                      <span
                                        className="affected-parties-dot"
                                        style={{ top: '4px', right: '4px' }}
                                        title="Has affected linked records"
                                      />
                                    )}
                                  </button>
                                );
                              })()
                            )}
                          </td>
                        </tr>
                        {hasMultipleDraws && isDrawsExpanded && (
                          <tr className="history-draws-subrow">
                            <td colSpan={9} className="cell-draws-details" style={{ padding: '0 16px 12px 36px', background: 'var(--surface-subtle, rgba(0,0,0,0.02))' }}>
                              <div style={{ marginTop: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', fontSize: '12px' }}>
                                  <span>Breakdown of {entry.draws?.length} payment tranches for {entry.category || 'Expense'}</span>
                                  <strong>Total spent: {formatMoney(actual)}</strong>
                                </div>
                                <div className="table-wrap compact">
                                  <table>
                                    <thead>
                                      <tr>
                                        <th>Payment Date</th>
                                        <th>Subcategory Tag</th>
                                        <th>Account</th>
                                        <th className="number">Tranche Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {entry.draws?.map((draw, index) => (
                                        <tr key={`${entryId}-draw-${index}`}>
                                          <td>{DateUtils.formatDisplayDate(draw.date)}</td>
                                          <td>
                                            {draw.tag ? (
                                              <button
                                                type="button"
                                                className={`history-tag-filter ${selectedTag.toLowerCase() === draw.tag.toLowerCase() ? 'active' : ''}`}
                                                onClick={() => handleTagFilter(draw.tag as string)}
                                                aria-pressed={selectedTag.toLowerCase() === draw.tag.toLowerCase()}
                                              >
                                                🏷️ {draw.tag}
                                              </button>
                                            ) : '—'}
                                          </td>
                                          <td>
                                            <span
                                              className="account-pill history-summary-clickable-row"
                                              style={{
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                border: selectedAccount.toLowerCase() === (draw.account || entry.account || 'cash').toLowerCase() ? '1px solid var(--brand-primary, #6366f1)' : undefined,
                                              }}
                                              onClick={() => handleAccountFilter(draw.account || entry.account || 'cash')}
                                              role="button"
                                              tabIndex={0}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                  e.preventDefault();
                                                  handleAccountFilter(draw.account || entry.account || 'cash');
                                                }
                                              }}
                                              title={`Click to filter entries by account: ${(draw.account || entry.account || 'cash').toUpperCase()}`}
                                            >
                                              {(draw.account || entry.account || 'cash').toUpperCase()}
                                            </span>
                                          </td>
                                          <td className="number">{formatMoney(Number(draw.amount) || 0)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Affected Records Modal for Entry Deletion */}
      {deleteEntryTarget && (() => {
        const affectedData = buildEntryDeleteOptions(deleteEntryTarget, {
          installments,
          storageAssets,
          partTimeJobs,
          asfJobs,
          irqJobs,
          accounts,
          entryActuals,
          entries,
        });

        return (
          <AffectedRecordsModal
            isOpen={Boolean(deleteEntryTarget)}
            mode="delete"
            title="Delete History Entry"
            subtitle="Choose which linked records and recurring occurrences should be affected."
            itemDescription={affectedData.itemDescription}
            amountFormatted={affectedData.amountFormatted}
            options={affectedData.options}
            onConfirm={(selectedIds) => {
              const seriesMode = selectedIds.includes('series') ? 'future' : 'single';
              deleteEntry(deleteEntryTarget.id, seriesMode, {
                deleteLinkedLoan: selectedIds.includes('loan'),
                deleteInstallmentPlan: selectedIds.includes('installment_plan'),
                syncJob: selectedIds.includes('job'),
                revertStorage: selectedIds.includes('storage'),
                restoreForeignAsset: selectedIds.includes('restore_fx_asset'),
              });
              setDeleteEntryTarget(null);
            }}
            onClose={() => setDeleteEntryTarget(null)}
          />
        );
      })()}

      {/* Affected Records Modal for Clearing Actual */}
      {clearEntryTarget && (() => {
        const affectedData = buildEntryClearOptions(clearEntryTarget, {
          installments,
          storageAssets,
          partTimeJobs,
          asfJobs,
          irqJobs,
          accounts,
          entryActuals,
          entryActualDates,
        });

        const targetAccount = (clearEntryTarget.account || '').trim().toLowerCase();
        const currUpper = (clearEntryTarget.currency || 'EGP').toUpperCase();
        const isForeign = currUpper !== 'EGP';
        const matchingStorage = (storageAssets || []).find((a) => {
          if (clearEntryTarget.storageAssetId && a.id === clearEntryTarget.storageAssetId) return true;
          if (a.name.trim().toLowerCase() === targetAccount) return true;
          if (isForeign && ((a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper)) return true;
          if (clearEntryTarget.draws && clearEntryTarget.draws.some((d) => d.storageAssetId === a.id || (d.account && d.account.trim().toLowerCase() === a.name.trim().toLowerCase()))) return true;
          return false;
        });

        return (
          <AffectedRecordsModal
            isOpen={Boolean(clearEntryTarget)}
            mode="update"
            title="Clear Recorded Actual"
            subtitle="Select which affected records, job settlements, and storage balances to revert."
            confirmLabel="Clear Actual"
            confirmVariant="danger"
            itemDescription={affectedData.itemDescription}
            amountFormatted={affectedData.amountFormatted}
            options={affectedData.options}
            onConfirm={(selectedIds) => {
              // Credit settlements are synthetic due rows: clearing must always revert
              // them to a single planned (overdue) due date, never an ongoing budget.
              const isSettlement = clearEntryTarget.id.startsWith('credit-settlement-');
              // Unchecked "Recorded Tranches" = restore the entry to Cash Flow as an
              // ongoing open budget, keeping its tranches and recorded actual intact.
              const keepDraws = !isSettlement
                && Boolean(clearEntryTarget.draws && clearEntryTarget.draws.length > 0)
                && !selectedIds.includes('draws');
              clearActual(clearEntryTarget.id, {
                keepDraws,
                revertStorage: isSettlement || selectedIds.includes('storage'),
                storageAssetId: matchingStorage?.id,
                syncJob: keepDraws ? false : selectedIds.includes('job'),
              });
              setClearEntryTarget(null);
            }}
            onClose={() => setClearEntryTarget(null)}
          />
        );
      })()}
    </section>
  );
};
