import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBudgetStore } from '../../store/useBudgetStore';
import { autoFetchLatestRates, computeSpreadPct } from '../../engine/currency';
import { formatFullDateTime } from '../../engine/dateUtils';
import type { RatesData } from '../../types';
import { Edit2, Check, X, RefreshCw } from 'lucide-react';
import { showAppNotice, requestAppConfirm } from '../Common/UndoToast';

interface RatesViewProps {
  onOpenRateModal?: (type: 'currency' | 'gold') => void;
}

export const RatesView: React.FC<RatesViewProps> = ({ onOpenRateModal }) => {
  const { rates, updateRates } = useBudgetStore(
    useShallow((state) => ({
      rates: state.rates,
      updateRates: state.updateRates,
    }))
  );
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [draftRates, setDraftRates] = useState<RatesData | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const handleStartEdit = () => {
    setDraftRates(JSON.parse(JSON.stringify(rates)));
    setIsEditing(true);
  };

  const handleSave = () => {
    if (draftRates) {
      const now = new Date().toISOString();
      updateRates({
        ...draftRates,
        currenciesLastFetched: now,
        goldLastFetched: now,
        lastFetched: now,
      }, true);
      setIsEditing(false);
      setDraftRates(null);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraftRates(null);
  };

  const handleFetchAllLiveRates = async () => {
    setIsFetching(true);
    try {
      const currentRates = useBudgetStore.getState().rates;
      const updated = await autoFetchLatestRates(currentRates, 0);

      if (!updated) {
        throw new Error('Rate service returned no updates or failed.');
      }

      const changes: string[] = [];
      (updated.currencies || []).forEach((c) => {
        const prev = (currentRates.currencies || []).find((old) => old.name === c.name);
        if (prev && (prev.sell !== c.sell || prev.buy !== c.buy)) {
          changes.push(`• ${c.name}: ${prev.sell.toFixed(2)}/${prev.buy.toFixed(2)} → ${c.sell.toFixed(2)}/${c.buy.toFixed(2)}`);
        }
      });
      (updated.gold || []).forEach((g) => {
        const prev = (currentRates.gold || []).find((old) => old.name === g.name);
        if (prev && (prev.sell !== g.sell || prev.buy !== g.buy)) {
          changes.push(`• ${g.name}: ${prev.sell}/${prev.buy} → ${g.sell}/${g.buy}`);
        }
      });

      updateRates(updated, true);

      if (changes.length > 0) {
        showAppNotice(`Updated live rates (${changes.length} changed)`, 'success');
      } else {
        showAppNotice('Live market feed checked: all currency & gold rates are up to date.', 'info');
      }
    } catch (err: unknown) {
      console.error("Live rates fetch failed:", err);
      const manual = await requestAppConfirm({
        title: 'Live Rate Feed Unavailable',
        message: "Couldn't fetch live rates (offline or rate service unavailable). Would you like to edit rates manually?",
        confirmLabel: 'Edit Manually',
        tone: 'warning',
      });
      if (manual) handleStartEdit();
    } finally {
      setIsFetching(false);
    }
  };

  const current = isEditing && draftRates ? draftRates : rates;

  return (
    <section className="view" id="rates" style={{ display: 'block' }}>
      {/* Unified Rates Action Bar */}
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-heading rates-panel-heading">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Exchange & Gold Rates</h3>
            {(rates.lastFetched || rates.currenciesLastFetched || rates.goldLastFetched) && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', marginTop: '3px' }}>
                Last updated: {formatFullDateTime(rates.lastFetched || rates.currenciesLastFetched || rates.goldLastFetched)}
              </div>
            )}
          </div>
          <div className="rates-heading-actions">
            {isEditing ? (
              <>
                <button className="primary-button" type="button" onClick={handleSave}>
                  <Check size={14} style={{ marginRight: '4px' }} /> Save
                </button>
                <button className="ghost-button" type="button" onClick={handleCancel}>
                  <X size={14} style={{ marginRight: '4px' }} /> Cancel
                </button>
              </>
            ) : (
              <button
                className="primary-button"
                id="updateAllRates"
                type="button"
                disabled={isFetching}
                onClick={handleFetchAllLiveRates}
              >
                <RefreshCw size={14} className={isFetching ? 'spin' : ''} style={{ marginRight: '6px' }} />
                {isFetching ? 'Fetching Live Rates…' : 'Update from Live'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="content-grid">
        {/* Currencies Panel */}
        <section className="panel">
          <div className="panel-heading rates-panel-heading">
            <div>
              <h3 style={{ margin: 0 }}>Currency rates</h3>
              {(rates.currenciesLastFetched || rates.lastFetched) && (
                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', marginTop: '3px' }}>
                  Last updated: {formatFullDateTime(rates.currenciesLastFetched || rates.lastFetched)}
                </div>
              )}
            </div>
            <div className="rates-heading-actions">
              {!isEditing && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={onOpenRateModal ? () => onOpenRateModal('currency') : handleStartEdit}
                >
                  <Edit2 size={14} style={{ marginRight: '4px' }} /> Edit
                </button>
              )}
            </div>
          </div>

          <div id="currencyRates" className="rate-grid" style={{ marginTop: '16px' }}>
            {current.currencies.map((c, idx) => {
              const spread = computeSpreadPct(c.sell, c.buy);
              return (
                <div key={c.name} className="rate-card">
                  <strong>{c.name}</strong>
                  {isEditing && draftRates ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Sell
                        <input
                          type="number"
                          step="0.01"
                          className="rate-edit-input form-input"
                          value={c.sell}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.currencies[idx].sell = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                        />
                      </label>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Buy
                        <input
                          type="number"
                          step="0.01"
                          className="rate-edit-input form-input"
                          value={c.buy}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.currencies[idx].buy = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <small>Sell {c.sell.toFixed(2)} / Buy {c.buy.toFixed(2)} ({(spread * 100).toFixed(1)}%)</small>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Gold Rates Panel */}
        <section className="panel">
          <div className="panel-heading rates-panel-heading">
            <div>
              <h3 style={{ margin: 0 }}>Gold rates</h3>
              {(rates.goldLastFetched || rates.lastFetched) && (
                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', marginTop: '3px' }}>
                  Last updated: {formatFullDateTime(rates.goldLastFetched || rates.lastFetched)}
                </div>
              )}
            </div>
            <div className="rates-heading-actions">
              {!isEditing && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={onOpenRateModal ? () => onOpenRateModal('gold') : handleStartEdit}
                >
                  <Edit2 size={14} style={{ marginRight: '4px' }} /> Edit
                </button>
              )}
            </div>
          </div>

          <div id="goldRates" className="rate-grid" style={{ marginTop: '16px' }}>
            {current.gold.map((g, idx) => {
              const spread = computeSpreadPct(g.sell, g.buy);
              return (
                <div key={g.name} className="rate-card">
                  <strong>{g.name}</strong>
                  {isEditing && draftRates ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Sell
                        <input
                          type="number"
                          step="0.01"
                          className="rate-edit-input form-input"
                          value={g.sell}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.gold[idx].sell = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                        />
                      </label>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Buy
                        <input
                          type="number"
                          step="0.01"
                          className="rate-edit-input form-input"
                          value={g.buy}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.gold[idx].buy = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <small>Sell {g.sell.toFixed(0)} / Buy {g.buy.toFixed(0)} ({(spread * 100).toFixed(1)}%)</small>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
};
