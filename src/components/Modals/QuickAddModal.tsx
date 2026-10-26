import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore, type ViewTab } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import { Modal } from '../Common/Modal';
import { 
  MinusCircle, 
  PlusCircle, 
  ArrowLeftRight, 
  CreditCard, 
  X,
  Search,
  LayoutDashboard,
  AlertTriangle,
  TrendingUp,
  History,
  Landmark,
  Coins,
  Briefcase,
  Sun,
  Moon,
  RotateCcw,
  Cloud,
  Database,
  CornerDownLeft,
} from 'lucide-react';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExpense: () => void;
  onOpenIncome: () => void;
  onOpenTransfer: () => void;
  onOpenLoan: () => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onOpenExpense,
  onOpenIncome,
  onOpenTransfer,
  onOpenLoan,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();

    return () => {
      previousActiveRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key !== 'Tab') return;
    const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const actionItems = [
    {
      id: 'expense',
      label: 'Add Expense',
      description: 'Record an expense, card purchase, or bill',
      icon: <MinusCircle size={22} color="var(--red, #ef4444)" />,
      badgeColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'rgba(239, 68, 68, 0.3)',
      onClick: () => {
        onClose();
        onOpenExpense();
      },
    },
    {
      id: 'income',
      label: 'Add Income',
      description: 'Record salary, client revenue, or cash inflow',
      icon: <PlusCircle size={22} color="var(--green, #10b981)" />,
      badgeColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: 'rgba(16, 185, 129, 0.3)',
      onClick: () => {
        onClose();
        onOpenIncome();
      },
    },
    {
      id: 'transfer',
      label: 'Transfer Funds',
      description: 'Move money between your liquid bank accounts',
      icon: <ArrowLeftRight size={22} color="var(--blue, #3b82f6)" />,
      badgeColor: 'rgba(59, 130, 246, 0.12)',
      borderColor: 'rgba(59, 130, 246, 0.3)',
      onClick: () => {
        onClose();
        onOpenTransfer();
      },
    },
    {
      id: 'loan',
      label: 'Bridge Deficit / Loan',
      description: 'Borrow funds or inject liquidity into cashflow',
      icon: <CreditCard size={22} color="var(--teal, #14b8a6)" />,
      badgeColor: 'rgba(20, 184, 166, 0.12)',
      borderColor: 'rgba(20, 184, 166, 0.3)',
      onClick: () => {
        onClose();
        onOpenLoan();
      },
    },
  ];

  return (
    <div className="mobile-action-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="mobile-action-sheet quick-add-sheet"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickAddTitle"
      >
        <div className="action-sheet-header">
          <div className="action-sheet-drag-handle" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Create
              </span>
              <h3 id="quickAddTitle" style={{ margin: '2px 0 0', fontSize: '17px', fontWeight: 800 }}>
                New Transaction
              </h3>
            </div>
            <button
              className="ghost-button icon-button"
              type="button"
              onClick={onClose}
              aria-label="Close quick add menu"
              style={{ width: '36px', height: '36px', minHeight: '36px', padding: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="quick-add-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {actionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="action-sheet-btn quick-add-item-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '14px',
                background: item.badgeColor,
                border: `1px solid ${item.borderColor}`,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                minHeight: '60px',
                touchAction: 'manipulation',
              }}
              onClick={item.onClick}
            >
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {item.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)' }}>
                  {item.label}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.3 }}>
                  {item.description}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExpense: () => void;
  onOpenIncome: () => void;
  onOpenTransfer: () => void;
  onOpenLoan: () => void;
  onOpenDataTools: () => void;
  onOpenDriveSync: () => void;
}

interface CommandItem {
  id: string;
  group: 'Quick Actions' | 'Navigation' | 'Ledger Entries';
  label: string;
  subtitle?: string;
  shortcut?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onOpenExpense,
  onOpenIncome,
  onOpenTransfer,
  onOpenLoan,
  onOpenDataTools,
  onOpenDriveSync,
}) => {
  const {
    theme,
    setTheme,
    setActiveTab,
    navigateTo,
    entries,
    archivedEntries,
    entryActuals,
    undoStack,
    undo,
  } = useBudgetStore(
    useShallow((state) => ({
      theme: state.theme,
      setTheme: state.setTheme,
      setActiveTab: state.setActiveTab,
      navigateTo: state.navigateTo,
      entries: state.entries,
      archivedEntries: state.archivedEntries,
      entryActuals: state.entryActuals,
      undoStack: state.undoStack,
      undo: state.undo,
    }))
  );

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [isOpen]);

  const items: CommandItem[] = useMemo(() => {
    const baseActions: CommandItem[] = [
      {
        id: 'act-expense',
        group: 'Quick Actions',
        label: 'Add Expense',
        subtitle: 'Record a planned or actual expense, bill, or card purchase',
        shortcut: 'E',
        icon: <MinusCircle size={16} style={{ color: 'var(--red, #f43f5e)' }} />,
        onSelect: () => {
          onClose();
          onOpenExpense();
        },
      },
      {
        id: 'act-income',
        group: 'Quick Actions',
        label: 'Add Income',
        subtitle: 'Record salary, client invoice, or cash inflow',
        shortcut: 'I',
        icon: <PlusCircle size={16} style={{ color: 'var(--green, #10b981)' }} />,
        onSelect: () => {
          onClose();
          onOpenIncome();
        },
      },
      {
        id: 'act-transfer',
        group: 'Quick Actions',
        label: 'Transfer Between Accounts',
        subtitle: 'Move funds between HSBC, CIB, or other liquid accounts',
        shortcut: 'T',
        icon: <ArrowLeftRight size={16} style={{ color: 'var(--kpi-cyan, #38bdf8)' }} />,
        onSelect: () => {
          onClose();
          onOpenTransfer();
        },
      },
      {
        id: 'act-loan',
        group: 'Quick Actions',
        label: 'Bridge Deficit / Take Loan',
        subtitle: 'Inject short-term liquidity with linked repayment schedule',
        shortcut: 'L',
        icon: <CreditCard size={16} style={{ color: 'var(--teal, #06b6d4)' }} />,
        onSelect: () => {
          onClose();
          onOpenLoan();
        },
      },
      {
        id: 'act-theme',
        group: 'Quick Actions',
        label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        subtitle: 'Toggle display appearance',
        icon: theme === 'dark' ? <Sun size={16} style={{ color: 'var(--amber)' }} /> : <Moon size={16} style={{ color: 'var(--brand-primary)' }} />,
        onSelect: () => {
          setTheme(theme === 'dark' ? 'light' : 'dark');
          onClose();
        },
      },
      ...(undoStack.length > 0
        ? [
            {
              id: 'act-undo',
              group: 'Quick Actions' as const,
              label: `Undo: ${undoStack[0].label}`,
              subtitle: `${undoStack.length} undo step${undoStack.length === 1 ? '' : 's'} available`,
              shortcut: '⌘Z',
              icon: <RotateCcw size={16} style={{ color: 'var(--amber)' }} />,
              onSelect: () => {
                undo();
                onClose();
              },
            },
          ]
        : []),
      {
        id: 'act-sync',
        group: 'Quick Actions',
        label: 'Google Drive Cloud Sync',
        subtitle: 'Configure cloud sync, snapshots, and backups',
        icon: <Cloud size={16} style={{ color: 'var(--blue)' }} />,
        onSelect: () => {
          onClose();
          onOpenDriveSync();
        },
      },
      {
        id: 'act-tools',
        group: 'Quick Actions',
        label: 'Manage Data & System Tools',
        subtitle: 'Export CSV/JSON, archive settled entries, scan recurring series',
        icon: <Database size={16} style={{ color: 'var(--muted)' }} />,
        onSelect: () => {
          onClose();
          onOpenDataTools();
        },
      },
    ];

    const navViews: Array<{ id: ViewTab; label: string; subtitle: string; icon: React.ReactNode }> = [
      { id: 'dashboard', label: 'Go to Dashboard', subtitle: 'Net worth, health index, and forecast trajectory', icon: <LayoutDashboard size={16} /> },
      { id: 'deficits', label: 'Go to Deficits', subtitle: 'Deficit spells, overdue obligations, and credit solvency', icon: <AlertTriangle size={16} /> },
      { id: 'cashflow', label: 'Go to Cash Flow', subtitle: 'Forecast ledger, salary matrix, and installments', icon: <TrendingUp size={16} /> },
      { id: 'history', label: 'Go to History', subtitle: 'Settled monthly summaries and category analytics', icon: <History size={16} /> },
      { id: 'accounts', label: 'Go to Accounts', subtitle: 'Bank balances and inter-account transfers', icon: <Landmark size={16} /> },
      { id: 'storage', label: 'Go to Storage', subtitle: 'Foreign currency reserves and gold holdings', icon: <Coins size={16} /> },
      { id: 'jobs', label: 'Go to Jobs', subtitle: 'Client projects, logged shifts, and invoicing', icon: <Briefcase size={16} /> },
      { id: 'rates', label: 'Go to Rates', subtitle: 'Live FX exchange rates and gold valuations', icon: <ArrowLeftRight size={16} /> },
    ];

    const navItems: CommandItem[] = navViews.map((v) => ({
      id: `nav-${v.id}`,
      group: 'Navigation',
      label: v.label,
      subtitle: v.subtitle,
      icon: v.icon,
      onSelect: () => {
        setActiveTab(v.id);
        onClose();
      },
    }));

    const term = query.trim().toLowerCase();
    if (!term) {
      return [...baseActions, ...navItems];
    }

    const filteredStatic = [...baseActions, ...navItems].filter(
      (item) =>
        item.label.toLowerCase().includes(term) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(term))
    );

    const archivedIds = new Set(archivedEntries.map((e) => e.id));
    const allSearchableEntries = [...entries, ...archivedEntries];

    const matchingEntries: CommandItem[] =
      term.length >= 2
        ? allSearchableEntries
            .filter(
              (e) =>
                e.category.toLowerCase().includes(term) ||
                (e.tag && e.tag.toLowerCase().includes(term)) ||
                (e.subcategory && e.subcategory.toLowerCase().includes(term)) ||
                (e.account && e.account.toLowerCase().includes(term))
            )
            .slice(0, 6)
            .map((e) => {
              const isSettled =
                archivedIds.has(e.id) ||
                Boolean(e.isClosed) ||
                (entryActuals[e.id] ?? e.actualAmount ?? 0) > 0;
              const targetTab: ViewTab = isSettled ? 'history' : 'cashflow';
              return {
                id: `entry-${e.id}`,
                group: 'Ledger Entries' as const,
                label: `${e.category} (${e.type === 'income' ? '+' : '-'}${formatMoney(e.amount)})`,
                subtitle: `${e.date} · ${(e.account || 'cib').toUpperCase()}${e.tag ? ` · ${e.tag}` : ''} · ${isSettled ? 'History' : 'Forecast'}`,
                icon: <TrendingUp size={15} style={{ color: e.type === 'income' ? 'var(--green)' : 'var(--red)' }} />,
                onSelect: () => {
                  navigateTo(targetTab, {
                    month: e.date ? e.date.slice(0, 7) : 'all',
                    highlightId: e.id,
                  });
                  onClose();
                },
              };
            })
        : [];

    return [...filteredStatic, ...matchingEntries];
  }, [
    query,
    theme,
    undoStack,
    entries,
    archivedEntries,
    entryActuals,
    onClose,
    onOpenExpense,
    onOpenIncome,
    onOpenTransfer,
    onOpenLoan,
    onOpenDataTools,
    onOpenDriveSync,
    setTheme,
    setActiveTab,
    navigateTo,
    undo,
  ]);

  const safeIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % items.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[safeIndex];
      if (target) {
        target.onSelect();
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="560px"
      className="command-palette-dialog"
      showCloseButton={false}
    >
      <div className="command-palette-shell" onKeyDown={handleKeyDown}>
        <div className="command-palette-search-bar">
          <Search size={17} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="search"
            className="command-palette-input"
            placeholder="Type a command, view, or search ledger entries..."
            aria-label="Command palette search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <kbd className="kbd-badge" onClick={onClose} style={{ cursor: 'pointer' }} title="Close (Esc)">
            ESC
          </kbd>
        </div>

        <div className="command-palette-results" role="listbox" aria-label="Commands">
          {items.length === 0 ? (
            <div className="command-palette-empty">
              No matching commands or ledger entries for "{query}".
            </div>
          ) : (
            (['Quick Actions', 'Navigation', 'Ledger Entries'] as const).map((groupName) => {
              const groupItems = items
                .map((item, idx) => ({ item, idx }))
                .filter((entry) => entry.item.group === groupName);
              if (groupItems.length === 0) return null;

              return (
                <div key={groupName} className="command-palette-group">
                  <div className="command-palette-group-label">{groupName}</div>
                  {groupItems.map(({ item, idx }) => {
                    const isActive = idx === safeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`command-palette-item ${isActive ? 'is-active' : ''}`}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={item.onSelect}
                      >
                        <span className="command-palette-item-icon">{item.icon}</span>
                        <span className="command-palette-item-text">
                          <strong>{item.label}</strong>
                          {item.subtitle && <small>{item.subtitle}</small>}
                        </span>
                        {item.shortcut ? (
                          <kbd className="kbd-badge">{item.shortcut}</kbd>
                        ) : (
                          <CornerDownLeft size={13} className="command-palette-enter-hint" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
