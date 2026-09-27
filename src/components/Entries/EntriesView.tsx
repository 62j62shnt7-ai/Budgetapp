import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { DateUtils, formatMoney } from '../../engine/dateUtils';
import { formatNativeCurrency } from '../../engine/currency';
import { Search, Trash2, ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import { AffectedRecordsModal } from '../Modals/AffectedRecordsModal';
import { buildEntryDeleteOptions, hasEntryAffectedParties } from '../../utils/affectedRecords';
import type { CashEntry } from '../../types';

interface EntriesViewProps {
  onOpenAddModal: () => void;
}

export const EntriesView: React.FC<EntriesViewProps> = ({ onOpenAddModal }) => {
  const {
    entries,
    deleteEntry,
    installments,
    storageAssets,
    partTimeJobs,
    asfJobs,
    irqJobs,
    accounts,
  } = useBudgetStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<CashEntry | null>(null);

  const filtered = entries.filter((e) => {
    if (filterType !== 'all' && e.type !== filterType) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.category.toLowerCase().includes(term) ||
      (e.subcategory && e.subcategory.toLowerCase().includes(term)) ||
      (e.note && e.note.toLowerCase().includes(term)) ||
      (e.tag && e.tag.toLowerCase().includes(term)) ||
      e.account.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      {/* Controls Bar */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '32px' }}
              placeholder="Search category, tag, note..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-surface-elevated)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
            {(['all', 'income', 'expense'] as const).map((t) => (
              <button
                key={t}
                className="btn"
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  background: filterType === t ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  color: filterType === t ? '#818cf8' : 'var(--text-muted)',
                }}
                onClick={() => setFilterType(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" onClick={onOpenAddModal}>
          <Plus size={16} />
          <span>New Entry</span>
        </button>
      </div>

      {/* Entries Table */}
      <div className="card">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
            No entries match your search criteria.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Account / Card</th>
                  <th>Tag</th>
                  <th>Amount</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const isForeign = Boolean(e.currency && e.currency !== 'EGP');
                  const nativeQty = isForeign
                    ? (e.originalAmount !== undefined && e.originalAmount !== null
                        ? e.originalAmount
                        : (e.fxRateAtEntry ? Math.round((e.amount / e.fxRateAtEntry) * 100) / 100 : e.amount))
                    : e.amount;

                  return (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{DateUtils.formatDisplayDate(e.date)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>{e.category}</span>
                          {isForeign && (
                            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', fontSize: '0.7rem' }}>
                              💵 {e.currency}
                            </span>
                          )}
                        </div>
                        {e.subcategory && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            {e.subcategory}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge" style={{ background: 'var(--bg-surface-elevated)' }}>
                          {e.account.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {e.tag ? (
                          <span className="badge badge-cyan">#{e.tag}</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', color: e.type === 'income' ? '#10b981' : 'var(--text-main)' }}>
                        {isForeign ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {e.type === 'income' ? <ArrowDownLeft size={14} color="#10b981" /> : <ArrowUpRight size={14} color="#f43f5e" />}
                              {formatNativeCurrency(nativeQty, e.currency!)}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>
                              ≈ {formatMoney(e.amount)}
                            </span>
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {e.type === 'income' ? <ArrowDownLeft size={14} color="#10b981" /> : <ArrowUpRight size={14} color="#f43f5e" />}
                            {formatMoney(e.amount)}
                          </span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const hasAffected = hasEntryAffectedParties(e, {
                            installments,
                            storageAssets,
                            partTimeJobs,
                            asfJobs,
                            irqJobs,
                            accounts,
                          });
                          return (
                            <button
                              className="btn btn-danger"
                              style={{ position: 'relative', padding: '0.35rem', border: 'none' }}
                              onClick={() => setDeleteEntryTarget(e)}
                              title={hasAffected ? 'Delete entry (has affected linked records)' : 'Delete entry'}
                            >
                              <Trash2 size={14} />
                              {hasAffected && (
                                <span
                                  className="affected-parties-dot"
                                  title="Has affected linked records"
                                />
                              )}
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Affected Records Modal for Entry Deletion */}
      {deleteEntryTarget && (() => {
        const affectedData = buildEntryDeleteOptions(deleteEntryTarget, {
          installments,
          storageAssets,
          partTimeJobs,
          asfJobs,
          irqJobs,
          accounts,
        });

        return (
          <AffectedRecordsModal
            isOpen={Boolean(deleteEntryTarget)}
            mode="delete"
            title="Delete Entry"
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
              });
              setDeleteEntryTarget(null);
            }}
            onClose={() => setDeleteEntryTarget(null)}
          />
        );
      })()}
    </div>
  );
};
