import React, { useState, useRef, useMemo } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { executeAppRefresh } from '../../utils/appRefresh';
import { detectRecurringCandidateGroups } from '../../utils/recurringDetector';

interface DataToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAutoTagPrompt?: () => void;
  onResetPrompt?: () => void;
}

export const DataToolsModal: React.FC<DataToolsModalProps> = ({
  isOpen,
  onClose,
  onAutoTagPrompt,
  onResetPrompt,
}) => {
  const {
    exportJSON,
    importJSON,
    entries,
    archivedEntries,
    deletedForecasts,
    restoreDeletedForecast,
    clearAllDeletedForecasts,
    linkRecurringSeries,
    unlinkRecurringSeries,
    autoLinkAllRecurringCandidates,
    entryActuals,
    entryActualDates,
    autoTagEntries,
    resetData,
    restoreResetBackup,
    undoImport,
    archiveSettledEntries,
  } = useBudgetStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  const [showDeletedModal, setShowDeletedModal] = useState<boolean>(false);
  const [deletedFilterTerm, setDeletedFilterTerm] = useState<string>('');
  const [showRecurringModal, setShowRecurringModal] = useState<boolean>(false);
  const [recurringFilterTerm, setRecurringFilterTerm] = useState<string>('');

  const recurringGroups = useMemo(() => detectRecurringCandidateGroups(entries), [entries]);
  const unlinkedRecurringCount = useMemo(() => recurringGroups.filter((g) => !g.isFullyLinked).length, [recurringGroups]);

  const filteredRecurringGroups = useMemo(() => {
    if (!recurringFilterTerm.trim()) return recurringGroups;
    const term = recurringFilterTerm.toLowerCase();
    return recurringGroups.filter((g) =>
      g.name.toLowerCase().includes(term) ||
      g.category.toLowerCase().includes(term) ||
      (g.subcategory && g.subcategory.toLowerCase().includes(term)) ||
      String(g.amount).includes(term) ||
      (g.account && g.account.toLowerCase().includes(term))
    );
  }, [recurringGroups, recurringFilterTerm]);

  if (!isOpen) return null;
  const hasResetBackup = Boolean(localStorage.getItem('budget-control-reset-backup'));
  const hasImportUndoBackup = Boolean(localStorage.getItem('budget-control-import-undo-backup'));

  const formatDeletedForecast = (id: string) => {
    if (id.startsWith('credit-settlement-')) {
      const parts = id.split('-');
      const account = (parts[2] || '').toUpperCase();
      const month = parts.length >= 5 ? `${parts[3]}-${parts[4]}` : '';
      return {
        icon: '💳',
        title: `${account} Credit Settlement`,
        subtitle: month ? `Cycle month: ${month}` : 'Credit card settlement forecast',
        badge: 'Credit Due',
      };
    }
    if (id.startsWith('installment-')) {
      const parts = id.split('-');
      const month = parts.length >= 4 ? `${parts[parts.length - 2]}-${parts[parts.length - 1]}` : '';
      return {
        icon: '📅',
        title: 'Installment Payment',
        subtitle: month ? `Scheduled for ${month}` : 'Recurring installment forecast',
        badge: 'Installment',
      };
    }
    if (id.startsWith('salary-')) {
      return {
        icon: '💼',
        title: 'Salary Forecast Schedule',
        subtitle: 'Calculated salary schedule matrix projection',
        badge: 'Salary',
      };
    }
    return {
      icon: '📝',
      title: 'Dismissed Forecast Record',
      subtitle: `ID: ${id}`,
      badge: 'Forecast',
    };
  };

  const filteredDeletedForecasts = (deletedForecasts || []).filter((id) => {
    if (!deletedFilterTerm.trim()) return true;
    const term = deletedFilterTerm.toLowerCase();
    const formatted = formatDeletedForecast(id);
    return (
      id.toLowerCase().includes(term) ||
      formatted.title.toLowerCase().includes(term) ||
      formatted.subtitle.toLowerCase().includes(term)
    );
  });

  // Export JSON file download
  const handleExportJSON = () => {
    const dataStr = exportJSON();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-control-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export CSV for Excel
  const handleExportCSV = () => {
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = ['Date', 'Actual Date', 'Category', 'Subcategory / Tags', 'Account', 'Type', 'Source', 'Planned Amount (EGP)', 'Actual Amount (EGP)'];
    const rows = [...entries, ...archivedEntries].map((e) => [
      escapeCsv(e.date),
      escapeCsv(entryActualDates[e.id] || e.actualDate || e.date),
      escapeCsv(e.category),
      escapeCsv([e.subcategory, e.tag].filter(Boolean).join(', ')),
      escapeCsv(e.account || 'cib'),
      escapeCsv(e.type),
      escapeCsv(e.source),
      Number(e.amount || 0),
      entryActuals[e.id] ?? e.actualAmount ?? '',
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-control-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // File import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = importJSON(content);
        if (ok) {
          const state = useBudgetStore.getState();
          alert(`✓ Data restored successfully!\n\n• ${state.entries.length} cash entries\n• ${Object.keys(state.accounts).length} accounts\n• ${state.storageAssets.length} storage assets\n• ${state.installments.length} installments\n\n(A rollback snapshot was saved; you can click 'Undo last import' if needed.)`);
          onClose();
        } else {
          alert('Failed to parse backup JSON file. Please ensure it is a valid Budget Control export.');
        }
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <>
      <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
        <div className="dialog-heading">
          <h3>⚙️ Data Backup &amp; System Tools</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
          <div className="data-tools-card" style={{ background: 'var(--surface-soft)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14px' }}>📊 Data Portability &amp; Spreadsheets</h4>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px' }}>
              Export clean records for Microsoft Excel / Sheets, or create complete device backups.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button className="ghost-button" type="button" onClick={handleExportCSV}>
                Export CSV (Excel)
              </button>
              <button className="ghost-button" type="button" onClick={handleExportJSON}>
                Export Backup (JSON)
              </button>
              <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
                Import Backup (JSON)
              </button>
              {hasImportUndoBackup && (
                <button
                  className="ghost-button"
                  type="button"
                  style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
                  onClick={() => {
                    if (window.confirm('Revert the last imported backup and restore previous data?')) {
                      if (undoImport()) {
                        alert('✓ Previous data restored from rollback snapshot.');
                        onClose();
                      }
                    }
                  }}
                >
                  ↩️ Undo last import
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                accept="application/json"
                hidden
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="data-tools-card" style={{ background: 'var(--surface-soft)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14px' }}>📦 Storage Maintenance &amp; Archival</h4>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px' }}>
              Archive fully settled past entries to keep active calculations and memory fast.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  const count = archiveSettledEntries();
                  setFeedbackMsg(count > 0 ? `✓ Archived ${count} settled entries to cold storage.` : 'ℹ️ No past settled entries need archiving.');
                  setTimeout(() => setFeedbackMsg(''), 4500);
                }}
              >
                📦 Archive Settled Entries ({archivedEntries.length} currently archived)
              </button>
              <button
                className="ghost-button"
                type="button"
                style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}
                onClick={onAutoTagPrompt ? onAutoTagPrompt : () => {
                  const count = autoTagEntries();
                  setFeedbackMsg(count > 0 ? `✓ Tagged ${count} untagged item(s).` : 'ℹ️ All entries and installments already tagged.');
                  setTimeout(() => setFeedbackMsg(''), 4500);
                }}
              >
                🏷️ Auto-Tag Untagged Items
              </button>
            </div>
            {feedbackMsg && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--green, #22c55e)', fontWeight: 500, background: 'rgba(34, 197, 94, 0.1)', padding: '6px 10px', borderRadius: '6px' }}>
                {feedbackMsg}
              </div>
            )}
          </div>

          {/* Recurring Series Scanner & Detector */}
          <div className="data-tools-card" style={{ background: 'var(--surface-soft)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h4 style={{ margin: 0, fontSize: '14px' }}>🔄 Recurring Series Scanner &amp; Detector</h4>
              <span style={{ fontSize: '12px', color: unlinkedRecurringCount > 0 ? 'var(--amber)' : 'var(--muted)', background: 'rgba(0,0,0,0.15)', padding: '2px 8px', borderRadius: '12px' }}>
                {recurringGroups.length} pattern{recurringGroups.length === 1 ? '' : 's'}{unlinkedRecurringCount > 0 ? ` (${unlinkedRecurringCount} unlinked)` : ''}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px' }}>
              Scan entries for repeating names and amounts (e.g. subscriptions, bills, salaries) to link them into unified recurring series.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                className="ghost-button"
                type="button"
                style={{ borderColor: unlinkedRecurringCount > 0 ? 'var(--blue)' : undefined, color: unlinkedRecurringCount > 0 ? 'var(--blue)' : undefined }}
                onClick={() => setShowRecurringModal(true)}
              >
                🔍 Scan Recurring Patterns ({recurringGroups.length})
              </button>
              {unlinkedRecurringCount > 0 && (
                <button
                  className="ghost-button"
                  type="button"
                  style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
                  onClick={() => {
                    const res = autoLinkAllRecurringCandidates();
                    setFeedbackMsg(`✓ Linked ${res.linkedGroupsCount} pattern(s) across ${res.modifiedEntriesCount} entries as recurring series.`);
                    setTimeout(() => setFeedbackMsg(''), 5000);
                  }}
                >
                  ⚡ Link All Detected ({unlinkedRecurringCount})
                </button>
              )}
            </div>
          </div>

          {/* Dismissed / Deleted Forecasts Inspector */}
          <div className="data-tools-card" style={{ background: 'var(--surface-soft)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h4 style={{ margin: 0, fontSize: '14px' }}>🗑️ Dismissed Forecasts &amp; Deleted Projections</h4>
              <span style={{ fontSize: '12px', color: 'var(--muted)', background: 'rgba(0,0,0,0.15)', padding: '2px 8px', borderRadius: '12px' }}>
                {deletedForecasts.length} dismissed
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px' }}>
              Review auto-calculated forecasts (credit settlements, installments, salary projections) that were dismissed or deleted, with 1-click restore.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                className="ghost-button"
                type="button"
                style={{ borderColor: deletedForecasts.length > 0 ? 'var(--amber)' : undefined, color: deletedForecasts.length > 0 ? 'var(--amber)' : undefined }}
                onClick={() => setShowDeletedModal(true)}
              >
                👁️ View Dismissed Forecasts ({deletedForecasts.length})
              </button>
            </div>
          </div>

          <div className="data-tools-card" style={{ background: 'var(--surface-soft)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14px' }}>🔄 App Lifecycle &amp; Reset</h4>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px' }}>
              Reload the application or reset template records.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button className="ghost-button" type="button" onClick={() => executeAppRefresh()}>
                🔄 Refresh App
              </button>
              <button
                className="ghost-button"
                type="button"
                style={{ color: 'var(--red)' }}
                onClick={onResetPrompt || (() => {
                  if (window.confirm('Reset all budget data? A backup will be saved first.')) {
                    resetData();
                    onClose();
                  }
                })}
              >
                Reset sample data
              </button>
              {hasResetBackup && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    if (window.confirm('Undo the last reset and restore the previous data?')) {
                      if (restoreResetBackup()) onClose();
                    }
                  }}
                >
                  Undo last reset
                </button>
              )}
            </div>
          </div>

          <div className="data-tools-shortcuts-box" style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
            <strong style={{ fontSize: '12px' }}>⌨️ Quick Shortcuts:</strong>
            <br />
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)' }}>
              [E] Add Expense &nbsp;|&nbsp; [I] Add Income &nbsp;|&nbsp; [L] Take Loan &nbsp;|&nbsp; [Ctrl+B] Toggle Sidebar
            </span>
          </div>
        </div>

        <div className="dialog-actions" style={{ marginTop: '14px' }}>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </dialog>

      {/* Sub-modal: Dismissed & Deleted Forecasts Inspector */}
      {showDeletedModal && (
        <dialog
          open
          className="native-dialog"
          onClick={(e) => e.target === e.currentTarget && setShowDeletedModal(false)}
          style={{ display: 'block', zIndex: 1050, maxWidth: '640px' }}
        >
          <div className="dialog-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🗑️ Dismissed Forecasts ({deletedForecasts.length})
            </h3>
            <button className="icon-button" type="button" aria-label="Close" onClick={() => setShowDeletedModal(false)}>
              ✕
            </button>
          </div>

          <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '12px 0' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', padding: '10px 12px', fontSize: '12.5px', color: 'var(--ink)' }}>
              ℹ️ When you delete an auto-calculated forecast (like a monthly credit card settlement due or an unmaterialized salary forecast date), it is recorded here so the projection engine knows not to regenerate it. Click <strong>Restore</strong> on any item to recalculate and display it again.
            </div>

            {deletedForecasts.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="search"
                  placeholder="Filter dismissed forecasts..."
                  value={deletedFilterTerm}
                  onChange={(e) => setDeletedFilterTerm(e.target.value)}
                  className="form-input"
                  style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
                />
                <button
                  type="button"
                  className="ghost-button"
                  style={{ color: 'var(--red)', fontSize: '12px', padding: '6px 12px' }}
                  onClick={() => {
                    if (window.confirm('Clear all dismissed forecast records? Any applicable calculated projections will reappear in Cashflow & Forecasts.')) {
                      clearAllDeletedForecasts();
                    }
                  }}
                >
                  Clear All ({deletedForecasts.length})
                </button>
              </div>
            )}

            <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {deletedForecasts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)', fontSize: '13.5px' }}>
                  ✨ No dismissed forecasts. All projection calculations are currently active.
                </div>
              ) : filteredDeletedForecasts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                  No dismissed forecasts match "{deletedFilterTerm}".
                </div>
              ) : (
                filteredDeletedForecasts.map((id) => {
                  const meta = formatDeletedForecast(id);
                  return (
                    <div
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'var(--surface-soft)',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{ fontSize: '20px' }}>{meta.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {meta.title}
                            </strong>
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--surface-sunken)', color: 'var(--muted)' }}>
                              {meta.badge}
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--muted)', wordBreak: 'break-all' }}>
                            {meta.subtitle}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="ghost-button"
                        style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--green)', borderColor: 'var(--green)', flexShrink: 0 }}
                        onClick={() => restoreDeletedForecast(id)}
                        title="Restore this forecast so it can be recalculated and displayed"
                      >
                        ↩️ Restore
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="dialog-actions" style={{ marginTop: '12px' }}>
            <button className="ghost-button" type="button" onClick={() => setShowDeletedModal(false)}>
              Back to Tools
            </button>
          </div>
        </dialog>
      )}

      {/* Sub-modal: Recurring Series Scanner */}
      {showRecurringModal && (
        <dialog
          open
          className="native-dialog"
          onClick={(e) => e.target === e.currentTarget && setShowRecurringModal(false)}
          style={{ display: 'block', zIndex: 1050, maxWidth: '680px' }}
        >
          <div className="dialog-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔄 Recurring Series Scanner ({recurringGroups.length})
            </h3>
            <button className="icon-button" type="button" aria-label="Close" onClick={() => setShowRecurringModal(false)}>
              ✕
            </button>
          </div>

          <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '12px 0' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', padding: '10px 12px', fontSize: '12.5px', color: 'var(--ink)' }}>
              ℹ️ Groups of 2 or more cash entries with the same name and amount are detected below. Flagging a group as a <strong>Recurring Series</strong> links them so future edits and deletions can apply across the entire series with accurate occurrence counts.
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Filter recurring patterns by name or amount..."
                value={recurringFilterTerm}
                onChange={(e) => setRecurringFilterTerm(e.target.value)}
                className="form-input"
                style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
              />
              {unlinkedRecurringCount > 0 && (
                <button
                  type="button"
                  className="ghost-button"
                  style={{ color: 'var(--green)', borderColor: 'var(--green)', fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    const res = autoLinkAllRecurringCandidates();
                    setFeedbackMsg(`✓ Linked ${res.linkedGroupsCount} pattern(s) across ${res.modifiedEntriesCount} entries.`);
                    setTimeout(() => setFeedbackMsg(''), 5000);
                  }}
                >
                  ⚡ Link All ({unlinkedRecurringCount})
                </button>
              )}
            </div>

            <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {recurringGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)', fontSize: '13.5px' }}>
                  ✨ No repeating name + amount patterns found across your entries.
                </div>
              ) : filteredRecurringGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                  No recurring patterns match "{recurringFilterTerm}".
                </div>
              ) : (
                filteredRecurringGroups.map((group) => {
                  return (
                    <div
                      key={group.key}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        padding: '12px',
                        background: 'var(--surface-soft)',
                        border: `1px solid ${group.isFullyLinked ? 'var(--line)' : 'rgba(245, 158, 11, 0.4)'}`,
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '20px' }}>{group.type === 'income' ? '💰' : '🔄'}</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '13.5px' }}>{group.name}</strong>
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: group.type === 'income' ? 'var(--green)' : 'var(--ink)' }}>
                                {group.amountFormatted}
                              </span>
                              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--surface-sunken)', color: 'var(--muted)' }}>
                                {group.estimatedFrequency}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: group.isFullyLinked ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: group.isFullyLinked ? 'var(--green)' : 'var(--amber)',
                                  fontWeight: 500,
                                }}
                              >
                                {group.isFullyLinked ? '✓ Linked Series' : '⚠️ Unlinked Candidate'}
                              </span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                              {group.entries.length} occurrences ({group.earliestDate} to {group.latestDate}) · Account: {group.account?.toUpperCase() || 'Direct'}
                            </div>
                          </div>
                        </div>

                        {group.isFullyLinked ? (
                          <button
                            type="button"
                            className="ghost-button"
                            style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--muted)', flexShrink: 0 }}
                            onClick={() => {
                              if (group.existingSeriesId) {
                                unlinkRecurringSeries(group.existingSeriesId);
                              }
                            }}
                            title="Unlink this series into standalone independent entries"
                          >
                            Unlink
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost-button"
                            style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--blue)', borderColor: 'var(--blue)', flexShrink: 0 }}
                            onClick={() => {
                              linkRecurringSeries(group.entryIds);
                            }}
                            title="Flag and link these entries as a recurring series"
                          >
                            🔗 Flag as Recurring
                          </button>
                        )}
                      </div>

                      {/* Micro list of occurrences */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                        {group.entries.map((e) => (
                          <span
                            key={e.id}
                            style={{
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--surface-sunken)',
                              color: 'var(--muted)',
                              border: '1px solid var(--line)',
                            }}
                          >
                            📅 {e.date}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="dialog-actions" style={{ marginTop: '12px' }}>
            <button className="ghost-button" type="button" onClick={() => setShowRecurringModal(false)}>
              Back to Tools
            </button>
          </div>
        </dialog>
      )}
    </>
  );
};
