import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
import { isLoanInflow } from '../../engine/forecast';
import { getEntryTags } from '../../engine/tags';
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
import { loadStorageSync, saveStorage } from '../../utils/storageAdapter';
import { LedgerFilterBar } from '../Common/LedgerFilterBar';

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
    updateEntry,
    runTransaction,
    storageAssets,
    partTimeJobs,
    pendingNavigation,
    clearPendingNavigation,
    analyticsCollapsed,
    setAnalyticsCollapsed,
  } = useBudgetStore(
    useShallow((state) => ({
      entries: state.entries,
      archivedEntries: state.archivedEntries,
      installments: state.installments,
      accounts: state.accounts,
      creditDues: state.creditDues,
      creditSettlementOverrides: state.creditSettlementOverrides,
      entryActuals: state.entryActuals,
      entryActualDates: state.entryActualDates,
      deletedForecasts: state.deletedForecasts,
      recordActual: state.recordActual,
      clearActual: state.clearActual,
      deleteEntry: state.deleteEntry,
      updateEntry: state.updateEntry,
      runTransaction: state.runTransaction,
      storageAssets: state.storageAssets,
      partTimeJobs: state.partTimeJobs,
      pendingNavigation: state.pendingNavigation,
      clearPendingNavigation: state.clearPendingNavigation,
      analyticsCollapsed: state.historyAnalyticsCollapsed,
      setAnalyticsCollapsed: state.setHistoryAnalyticsCollapsed,
    }))
  );

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
    loadStorageSync<boolean>('budget-control-history-admin-unlocked', false)
  );
  const [addingTagEntryId, setAddingTagEntryId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState<string>('');

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
  const [groupBy, setGroupBy] = useState<'category' | 'tag'>(() =>
    loadStorageSync<string>('budget-control-history-analytics-grouping', 'category') === 'tag' ? 'tag' : 'category'
  );
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'both'>(() => {
    const saved = loadStorageSync<string>('budget-control-history-analytics-view', 'chart');
    return saved === 'table' || saved === 'both' ? saved : 'chart';
  });

  useEffect(() => {
    saveStorage('budget-control-history-admin-unlocked', isAdminUnlocked);
  }, [isAdminUnlocked]);
  useEffect(() => {
    saveStorage('budget-control-history-analytics-grouping', groupBy);
  }, [groupBy]);
  useEffect(() => {
    saveStorage('budget-control-history-analytics-view', viewMode);
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
    if (entryActuals[entry.id] !== undefined) return Math.round((Number(entryActuals[entry.id]) || 0) * 100) / 100;
    const legacyId = `${entry.date}-${entry.category}-${entry.amount}-${entry.type}-${entry.account || 'cash'}`;
    if (entryActuals[legacyId] !== undefined) return Math.round((Number(entryActuals[legacyId]) || 0) * 100) / 100;
    if (entry.actualAmount !== undefined && entry.actualAmount !== null) return Math.round((Number(entry.actualAmount) || 0) * 100) / 100;
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

  // Monthly calculations:
  // - directExpenses: anything except card swipes and settlements
  // - cardSpends: credit card swipes
  // - creditSettled: credit settlements paid
  // - net: income - (directExpenses + creditSettled)
  // - savingsRate: income > 0 ? Math.round((net / income) * 100) : 0
  const monthlySummaryRows = React.useMemo(() => {
    return orderedMonths.map((month) => {
      let income = 0;
      let directExpenses = 0;
      let cardSpends = 0;
      let creditSettled = 0;

      actualEntries.forEach((entry) => {
        // Exclude internal FX conversions and borrowed loan principal from realized earnings/spending
        if (entry.conversionType === 'fx-sale' || isLoanInflow(entry)) return;
        const isSwipe = isCreditCardExpense(entry);
        const isSettlement = isCreditSettlementRow(entry);
        if (entry.draws && entry.draws.length > 0) {
          const monthDraws = entry.draws.filter((d) => DateUtils.getMonthKey(d.date) === month);
          const monthTotal = monthDraws.reduce((sum, d) => sum + Number(d.amount || 0), 0);
          if (entry.type === 'income') {
            income += monthTotal;
          } else if (isSwipe) {
            cardSpends += monthTotal;
          } else if (isSettlement) {
            creditSettled += monthTotal;
          } else {
            directExpenses += monthTotal;
          }
        } else {
          const actDate = getEntryActualDate(entry);
          if (DateUtils.getMonthKey(actDate) === month) {
            const amt = getEntryActualAmount(entry);
            if (entry.type === 'income') {
              income += amt;
            } else if (isSwipe) {
              cardSpends += amt;
            } else if (isSettlement) {
              creditSettled += amt;
            } else {
              directExpenses += amt;
            }
          }
        }
      });

      const net = income - (directExpenses + creditSettled);
      const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

      return {
        month,
        income,
        expenses: directExpenses,
        cardSpends,
        creditSettled,
        net,
        savingsRate,
      };
    });
  }, [orderedMonths, actualEntries, getEntryActualAmount, getEntryActualDate]);

  const totalLifetimeIncome = monthlySummaryRows.reduce((sum, r) => sum + r.income, 0);
  const totalLifetimeExpenses = monthlySummaryRows.reduce((sum, r) => sum + r.expenses, 0);
  const totalLifetimeCardSpends = monthlySummaryRows.reduce((sum, r) => sum + (r.cardSpends || 0), 0);
  const totalLifetimeCredit = monthlySummaryRows.reduce((sum, r) => sum + (r.creditSettled || 0), 0);
  const lifetimeNet = totalLifetimeIncome - (totalLifetimeExpenses + totalLifetimeCredit);
  const lifetimeSavingsRate = totalLifetimeIncome > 0 ? Math.round((lifetimeNet / totalLifetimeIncome) * 100) : 0;

  const allAccounts = Array.from(new Set(actualEntries.map((e) => e.account || 'cash'))).sort();
  const getEffectiveEntryTags = React.useCallback((entry: CashEntry): string[] => {
    const tags = getEntryTags(entry);
    if (isCreditCardExpense(entry) && !tags.some((t) => t.toLowerCase() === 'credit swipes')) {
      tags.push('Credit Swipes');
    }
    if (isCreditSettlementRow(entry) && !tags.some((t) => t.toLowerCase() === 'credit settlement')) {
      tags.push('Credit Settlement');
    }
    return tags;
  }, []);

  const allTags = Array.from(new Set(actualEntries.flatMap(getEffectiveEntryTags))).sort((a, b) => a.localeCompare(b));
  const allCategories = Array.from(
    new Set(actualEntries.map((e) => e.category).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const hasUntagged = actualEntries.some((entry) =>
    getEntryTags(entry).length === 0 || (entry.draws || []).some((draw) => !draw.tag || !draw.tag.trim())
  );

  const allAvailableTagSuggestions = Array.from(new Set([
    'Food', 'Groceries', 'Credit Swipes', 'Credit Settlement', 'Credit', 'Loan', 'Installment', 'Rent',
    'Salary', 'Bills', 'Kids', 'Part-Time', 'Maintenance', 'Electricity',
    'Internet', 'Water', 'Fuel', 'Shopping', 'Dining Out', 'Medical',
    ...allTags
  ])).sort((a, b) => a.localeCompare(b));

  const handleRemoveTag = (entry: CashEntry, tagToRemove: string) => {
    const normToRemove = tagToRemove.toLowerCase().trim();
    const currentTags = getEntryTags(entry);
    const remainingTags = currentTags.filter((t) => t.toLowerCase().trim() !== normToRemove);

    const updatedDraws = (entry.draws || []).map((d) => {
      if ((d.tag || '').toLowerCase().trim() === normToRemove) {
        return { ...d, tag: remainingTags[0] || '' };
      }
      return d;
    });

    runTransaction(`Remove tag "${tagToRemove}" from ${entry.category}`, () => {
      updateEntry(
        entry.id,
        {
          tag: remainingTags.join(', '),
          subcategory: remainingTags[0] || '',
          ...(entry.draws && entry.draws.length > 0 ? { draws: updatedDraws } : {}),
        },
        'single'
      );
    });
  };

  const handleAddTag = (entry: CashEntry, newTagStr: string) => {
    const cleanTokens = newTagStr.split(',').map((t) => t.trim()).filter(Boolean);
    if (cleanTokens.length === 0) return;
    const currentTags = getEntryTags(entry);
    const addedTokens: string[] = [];
    cleanTokens.forEach((t) => {
      if (!currentTags.some((existing) => existing.toLowerCase() === t.toLowerCase()) &&
          !addedTokens.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
        addedTokens.push(t);
      }
    });
    if (addedTokens.length === 0) return;
    const nextTags = [...currentTags, ...addedTokens];

    runTransaction(`Add tag "${addedTokens.join(', ')}" to ${entry.category}`, () => {
      updateEntry(
        entry.id,
        {
          tag: nextTags.join(', '),
          subcategory: nextTags[0] || '',
        },
        'single'
      );
    });
  };

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

  // Helper for filtered entry amount
  const getFilteredEntryAmount = (entry: CashEntry): number => {
    const totalActual = getEntryActualAmount(entry);
    if (totalActual <= 0) return 0;

    if (entry.draws && entry.draws.length > 0) {
      let trancheSum = 0;
      let matchedAny = false;
      const parentTags = getEntryTags(entry).map((t) => t.toLowerCase());

      entry.draws.forEach((d) => {
        const dAmt = Number(d.amount) || 0;
        if (dAmt <= 0) return;

        // Month filter
        if (selectedMonth !== 'all') {
          const dMonth = DateUtils.getMonthKey(d.date);
          if (dMonth !== selectedMonth) return;
        }

        // Tag filter
        if (selectedTag === '__untagged__') {
          const isDrawUntagged = (!d.tag || !d.tag.trim()) && parentTags.length === 0;
          if (!isDrawUntagged) return;
        } else if (selectedTag !== 'all') {
          const drawTags = d.tag && d.tag.trim()
            ? d.tag.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
            : [];
          const combined = Array.from(new Set([...parentTags, ...drawTags]));
          if (isCreditCardExpense(entry) && !combined.includes('credit swipes')) {
            combined.push('credit swipes');
          }
          if (isCreditSettlementRow(entry) && !combined.includes('credit settlement')) {
            combined.push('credit settlement');
          }
          if (!combined.includes(selectedTag.toLowerCase())) return;
        }

        // Account filter
        if (selectedAccount !== 'all') {
          const dAcc = (d.account || entry.account || 'cash').toLowerCase();
          if (dAcc !== selectedAccount.toLowerCase()) return;
        }

        // Category filter
        if (selectedCategory !== 'all' && entry.category !== selectedCategory) return;

        // Category group filter
        if (selectedCategoryGroup !== 'all' && getSmartGroupBucket(entry) !== selectedCategoryGroup) return;

        trancheSum += dAmt;
        matchedAny = true;
      });

      if (matchedAny) return trancheSum;

      // If no individual draw matched, but no draw-specific filters (month, tag, account) were specified,
      // fall back to totalActual so the entry is never incorrectly dropped.
      if (selectedMonth === 'all' && selectedTag === 'all' && selectedAccount === 'all') {
        return totalActual;
      }
      return 0;
    }

    // For validated entries without draws that passed filteredEntries:
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

    if (selectedAccount !== 'all') {
      const parentAccMatches = (entry.account || 'cash').toLowerCase() === selectedAccount.toLowerCase();
      const hasMatchingDraw = Boolean(
        entry.draws &&
        entry.draws.some((d) => (d.account || entry.account || 'cash').toLowerCase() === selectedAccount.toLowerCase())
      );
      if (!parentAccMatches && !hasMatchingDraw) return false;
    }

    if (selectedCategoryGroup !== 'all' && getSmartGroupBucket(entry) !== selectedCategoryGroup) return false;

    if (selectedTag !== 'all') {
      const entryTags = getEffectiveEntryTags(entry).map((t) => t.toLowerCase());
      const hasUntaggedDraw = (entry.draws || []).some((draw) => !draw.tag || !draw.tag.trim());
      if (selectedTag === '__untagged__') {
        if (entryTags.length > 0 && !hasUntaggedDraw) return false;
      } else if (!entryTags.includes(selectedTag.toLowerCase())) {
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
      const drawNotes = (entry.draws || []).map((d) => d.note || '').join(' ').toLowerCase();
      if (!cat.includes(term) && !sub.includes(term) && !tag.includes(term) && !acc.includes(term) && !source.includes(term) && !drawNotes.includes(term)) return false;
    }

    return true;
  });

  // Sort newest first
  filteredEntries.sort((a, b) => (getEntryActualDate(b) || '').localeCompare(getEntryActualDate(a) || ''));

  const filteredIncome = filteredEntries
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  const filteredCardSpends = filteredEntries
    .filter((e) => isCreditCardExpense(e))
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  const filteredCredit = filteredEntries
    .filter((e) => isCreditSettlementRow(e))
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  const filteredDirectExpenses = filteredEntries
    .filter((e) => e.type === 'expense' && !isCreditCardExpense(e) && !isCreditSettlementRow(e))
    .reduce((sum, e) => sum + getFilteredEntryAmount(e), 0);

  // Check if current filter is explicitly targeting credit card swipes or settlements
  const isTargetingCardSwipes =
    selectedTag.toLowerCase() === 'credit swipes' ||
    (selectedAccount !== 'all' && selectedAccount.toLowerCase().includes('credit')) ||
    (filteredEntries.length > 0 &&
      filteredDirectExpenses === 0 &&
      filteredCredit === 0 &&
      filteredCardSpends > 0);

  const isTargetingSettlements =
    selectedTag.toLowerCase() === 'credit settlement' ||
    (filteredEntries.length > 0 &&
      filteredDirectExpenses === 0 &&
      filteredCardSpends === 0 &&
      filteredCredit > 0);

  // Cash basis netting for expenses:
  // - If explicitly inspecting card swipes: card swipes count in full.
  // - If explicitly inspecting settlements: settlements count in full.
  // - In mixed/global view: card spends are excluded (0); settlements and direct expenses count in full.
  const getNettedExpenseAmount = (e: CashEntry): number => {
    if (isTargetingCardSwipes) {
      return isCreditCardExpense(e) ? getFilteredEntryAmount(e) : 0;
    }
    if (isTargetingSettlements) {
      return isCreditSettlementRow(e) ? getFilteredEntryAmount(e) : 0;
    }
    return isCreditCardExpense(e) ? 0 : getFilteredEntryAmount(e);
  };

  // When explicitly filtering for card swipes or settlements, show their specific amount.
  // In mixed/global view: primary expense is direct expenses (anything except card swipes and settlements).
  const filteredDisplayExpenses = isTargetingCardSwipes
    ? filteredCardSpends
    : isTargetingSettlements
    ? filteredCredit
    : filteredDirectExpenses;

  const filteredNet = isTargetingCardSwipes
    ? filteredIncome - filteredCardSpends
    : isTargetingSettlements
    ? filteredIncome - filteredCredit
    : filteredIncome - (filteredDirectExpenses + filteredCredit);

  const groups: Record<string, { name: string; count: number; total: number; type: 'income' | 'expense' }> = {};
  filteredEntries.forEach((e) => {
    if (groupBy === 'tag' && e.draws && e.draws.length > 0) {
      e.draws.forEach((draw) => {
        if (selectedMonth !== 'all' && DateUtils.getMonthKey(draw.date) !== selectedMonth) return;
        const tag = draw.tag?.trim() || e.tag?.trim() || 'Untagged';
        if (selectedTag === '__untagged__' && tag !== 'Untagged') return;
        if (selectedTag !== 'all' && selectedTag !== '__untagged__'
          && selectedTag.toLowerCase() !== tag.toLowerCase()) return;
        const key = `${tag}|${e.type}`;
        if (!groups[key]) groups[key] = { name: tag, count: 0, total: 0, type: e.type };
        groups[key].count += 1;
        const drawAmt = Number(draw.amount) || 0;
        groups[key].total += drawAmt;
      });
      return;
    }
    const name = groupBy === 'category' ? getSmartGroupBucket(e) : (e.tag?.trim() || 'Untagged');
    const key = `${name}|${e.type}`;
    const amt = e.type === 'expense' ? getNettedExpenseAmount(e) : getFilteredEntryAmount(e);
    if (!groups[key]) groups[key] = { name, count: 0, total: 0, type: e.type };
    groups[key].count += 1;
    groups[key].total += amt;
  });

  const sortedGroups = Object.entries(groups)
    .map(([, value]) => [value.name, value] as [string, typeof value])
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
          Monthly Summary
        </button>
        <button
          className={`subnav-tab ${activeHistoryTab === 'transactions' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeHistoryTab === 'transactions'}
          aria-controls="historyTransactionsPane"
          onClick={() => setActiveHistoryTab('transactions')}
        >
          Transactions
        </button>
      </div>

      {/* Tab 1: Monthly Summary */}
      {activeHistoryTab === 'summary' && (
        <HistorySummaryTab
          totalLifetimeIncome={totalLifetimeIncome}
          totalLifetimeExpenses={totalLifetimeExpenses}
          totalLifetimeCardSpends={totalLifetimeCardSpends}
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

      {/* Tab 2: Individual Transactions */}
      {activeHistoryTab === 'transactions' && (
        <div className="history-tab-pane" id="historyTransactionsPane">
          <div className="panel history-filter-panel" style={{ marginBottom: '18px' }}>
            <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Filter Transactions</h3>
              <span id="historyFilteredCount" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <LedgerFilterBar
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              orderedMonths={orderedMonths}
              typeFilter={selectedType}
              onTypeChange={setSelectedType}
              categoryFilter={selectedCategory}
              onCategoryChange={setSelectedCategory}
              allCategories={allCategories}
              selectedAccount={selectedAccount}
              onAccountChange={setSelectedAccount}
              allAccounts={allAccounts}
              selectedTag={selectedTag}
              onTagChange={setSelectedTag}
              allTags={allTags}
              hasUntagged={hasUntagged}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onResetFilters={handleResetFilters}
              isAnyFilterActive={
                selectedMonth !== 'all' ||
                selectedCategory !== 'all' ||
                selectedCategoryGroup !== 'all' ||
                selectedTag !== 'all' ||
                selectedType !== 'all' ||
                selectedAccount !== 'all' ||
                Boolean(searchTerm)
              }
            />
          </div>

          <div className="metrics-grid history-summary-grid" id="historyFilteredSummary" style={{ marginBottom: '18px' }}>
            <article className="metric history-metric">
              <span>Filtered Income</span>
              <strong style={{ color: 'var(--green)', fontSize: '26px', fontWeight: 800, lineHeight: 1.2 }}>{formatMoney(filteredIncome)}</strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric history-metric">
              <span>Filtered Expenses</span>
              <strong style={{ color: 'var(--red)', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px', lineHeight: 1.2 }}>
                <span style={{ color: 'var(--red)', fontSize: '26px', fontWeight: 800 }}>{formatMoney(filteredDisplayExpenses)}</span>
                {!isTargetingCardSwipes && !isTargetingSettlements && (
                  <>
                    {filteredCardSpends > 0 && (
                      <span className="history-bracket-card-swipes" title="Credit card swipes">
                        💳 ({formatMoney(filteredCardSpends)} card swipes)
                      </span>
                    )}
                    {filteredCredit > 0 && (
                      <span className="history-bracket-settlements" title="Credit settlements paid">
                        🏛️ ({formatMoney(filteredCredit)} settlements)
                      </span>
                    )}
                  </>
                )}
                {isTargetingCardSwipes && (
                  <span className="history-bracket-card-swipes" title="Credit card swipes">
                    💳 (card swipes)
                  </span>
                )}
                {isTargetingSettlements && (
                  <span className="history-bracket-settlements" title="Credit settlements">
                    🏛️ (settlements)
                  </span>
                )}
              </strong>
              <small>Total for selected criteria</small>
            </article>
            <article className="metric history-metric">
              <span>Filtered Net</span>
              <strong style={{ color: filteredNet >= 0 ? 'var(--green)' : 'var(--red)', fontSize: '26px', fontWeight: 800, lineHeight: 1.2 }}>
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
            setAnalyticsCollapsed={(action) => {
              const next = typeof action === 'function' ? action(analyticsCollapsed) : action;
              setAnalyticsCollapsed(next);
            }}
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
                🔓 <strong>Admin Mode Active:</strong> Add or remove tags directly, edit actuals, or click an entry to open full edit controls.
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
                        const roundedPlanned = Math.round(plannedVal * 100) / 100;
                        const roundedActual = Math.round(actual * 100) / 100;
                        if (entry.type === 'expense') {
                          const diff = Math.round((roundedPlanned - roundedActual) * 100) / 100;
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
                                maxWidth: '100%',
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
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
                            {isAdminUnlocked ? (
                              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center', marginLeft: '4px' }}>
                                {getEntryTags(entry).map((tag) => (
                                  <span
                                    key={`${entry.id}-${tag}`}
                                    className="history-admin-tag-chip"
                                  >
                                    <button
                                      type="button"
                                      className={`history-admin-tag-filter-btn ${selectedTag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTagFilter(tag);
                                      }}
                                      title={`Click to filter by #${tag}`}
                                    >
                                      #{tag}
                                    </button>
                                    <button
                                      type="button"
                                      className="history-admin-tag-remove-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveTag(entry, tag);
                                      }}
                                      title={`Remove tag #${tag}`}
                                      aria-label={`Remove tag ${tag}`}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                {addingTagEntryId === entry.id ? (
                                  <span
                                    className="history-admin-add-tag-form"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      list="adminTagSuggestionsList"
                                      placeholder="Tag..."
                                      className="history-admin-add-tag-input"
                                      value={newTagInput}
                                      onChange={(e) => setNewTagInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleAddTag(entry, newTagInput);
                                          setAddingTagEntryId(null);
                                          setNewTagInput('');
                                        } else if (e.key === 'Escape') {
                                          e.stopPropagation();
                                          setAddingTagEntryId(null);
                                          setNewTagInput('');
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="ghost-button icon-button"
                                      style={{ padding: '2px 5px', fontSize: '11px', height: '22px' }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddTag(entry, newTagInput);
                                        setAddingTagEntryId(null);
                                        setNewTagInput('');
                                      }}
                                      title="Save tag"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button icon-button"
                                      style={{ padding: '2px 5px', fontSize: '11px', height: '22px' }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAddingTagEntryId(null);
                                        setNewTagInput('');
                                      }}
                                      title="Cancel"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="history-admin-add-tag-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAddingTagEntryId(entry.id);
                                      setNewTagInput('');
                                    }}
                                    title="Add tag to this entry"
                                  >
                                    + Tag
                                  </button>
                                )}
                              </span>
                            ) : (
                              getEntryTags(entry).map((tag) => (
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
                              ))
                            )}
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
                                  step="any"
                                  defaultValue={actual || ''}
                                  className="history-admin-input form-input"
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      const value = Math.round((Number(event.currentTarget.value) || 0) * 100) / 100;
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

            <datalist id="adminTagSuggestionsList">
              {allAvailableTagSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </section>
        </div>
      )}

      {/* Affected Records Modal for Entry Deletion */}
      {deleteEntryTarget && (() => {
        const affectedData = buildEntryDeleteOptions(deleteEntryTarget, {
          installments,
          storageAssets,
          partTimeJobs,
          accounts,
          entryActuals,
          entries,
          creditSettlementOverrides,
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
                adjustCreditOverride: selectedIds.includes('credit_statement'),
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
          accounts,
          entryActuals,
          entryActualDates,
          creditSettlementOverrides,
        });

        const isCardSwipe = isCreditCardExpense(clearEntryTarget);
        const targetAccount = (clearEntryTarget.account || '').trim().toLowerCase();
        const currUpper = (clearEntryTarget.currency || 'EGP').toUpperCase();
        const isForeign = currUpper !== 'EGP';
        const matchingStorage = !isCardSwipe
          ? (storageAssets || []).find((a) => {
              if (clearEntryTarget.storageAssetId && a.id === clearEntryTarget.storageAssetId) return true;
              if (a.name.trim().toLowerCase() === targetAccount) return true;
              if (isForeign && ((a.unit || '').toUpperCase() === currUpper || (a.currency || '').toUpperCase() === currUpper)) return true;
              if (clearEntryTarget.draws && clearEntryTarget.draws.some((d) => d.storageAssetId === a.id || (d.account && d.account.trim().toLowerCase() === a.name.trim().toLowerCase()))) return true;
              return false;
            })
          : undefined;

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
              const hasDrawsOption = affectedData.options.some((o) => o.id === 'draws');
              // Unchecked "Recorded Tranches" = restore the entry to Cash Flow as an
              // ongoing open budget, keeping its tranches and recorded actual intact.
              const keepDraws = !isSettlement
                && hasDrawsOption
                && Boolean(clearEntryTarget.draws && clearEntryTarget.draws.length > 1)
                && !selectedIds.includes('draws');
              clearActual(clearEntryTarget.id, {
                keepDraws,
                revertStorage: selectedIds.includes('storage'),
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
