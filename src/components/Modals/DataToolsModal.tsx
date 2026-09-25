import React, { useRef } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';

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
  const { exportJSON, importJSON, entries, archivedEntries, entryActuals, entryActualDates, autoTagEntries, resetData, restoreResetBackup } = useBudgetStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;
  const hasResetBackup = Boolean(localStorage.getItem('budget-control-reset-backup'));

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
      escapeCsv(entryActualDates[e.id] || e.date),
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
          alert(`✓ Data restored successfully!\n\n• ${state.entries.length} cash entries\n• ${Object.keys(state.accounts).length} accounts\n• ${state.storageAssets.length} storage assets\n• ${state.installments.length} installments`);
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
    <dialog open className="native-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <div className="dialog-heading">
        <h3>⚙️ Data Backup &amp; System Tools</h3>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
          x
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
          <h4 style={{ margin: '0 0 4px', fontSize: '14px' }}>🏷️ Tags &amp; Auto-Classification</h4>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px' }}>
            Automatically tag untagged past entries using category and description hints.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              className="ghost-button"
              type="button"
              style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}
              onClick={onAutoTagPrompt ? onAutoTagPrompt : () => alert(`${autoTagEntries()} item(s) tagged.`)}
            >
              🏷️ Auto-Tag Untagged Items
            </button>
          </div>
        </div>

        <div className="data-tools-card" style={{ background: 'var(--surface-soft)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '14px' }}>🔄 App Lifecycle &amp; Reset</h4>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px' }}>
            Reload the application or reset template records.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button className="ghost-button" type="button" onClick={() => window.location.reload()}>
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
  );
};
