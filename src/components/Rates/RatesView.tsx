import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { computeSpreadPct } from '../../engine/currency';
import type { RatesData } from '../../types';
import { Edit2, Check, X } from 'lucide-react';

interface RatesViewProps {
  onOpenRateModal?: (type: 'currency' | 'gold') => void;
}

export const RatesView: React.FC<RatesViewProps> = ({ onOpenRateModal }) => {
  const { rates, updateRates } = useBudgetStore();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [draftRates, setDraftRates] = useState<RatesData | null>(null);

  const handleStartEdit = () => {
    setDraftRates(JSON.parse(JSON.stringify(rates)));
    setIsEditing(true);
  };

  const handleSave = () => {
    if (draftRates) {
      updateRates(draftRates);
      setIsEditing(false);
      setDraftRates(null);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraftRates(null);
  };

  const current = isEditing && draftRates ? draftRates : rates;

  return (
    <section className="view" id="rates" style={{ display: 'block' }}>
      <div className="content-grid">
        {/* Currencies Panel */}
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Currency rates</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
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
                  className="ghost-button"
                  id="editCurrencies"
                  type="button"
                  onClick={onOpenRateModal ? () => onOpenRateModal('currency') : handleStartEdit}
                >
                  <Edit2 size={14} style={{ marginRight: '4px' }} /> Update Rates
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
                          value={c.sell}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.currencies[idx].sell = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                          style={{ width: '100%', fontSize: '12px', padding: '3px 6px' }}
                        />
                      </label>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Buy
                        <input
                          type="number"
                          step="0.01"
                          value={c.buy}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.currencies[idx].buy = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                          style={{ width: '100%', fontSize: '12px', padding: '3px 6px' }}
                        />
                      </label>
                    </div>
                  ) : (
                    <small>Sell {c.sell.toFixed(2)} / Buy {c.buy.toFixed(2)} ({spread.toFixed(1)}%)</small>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Gold Rates Panel */}
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Gold rates</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
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
                  className="ghost-button"
                  id="editGold"
                  type="button"
                  onClick={onOpenRateModal ? () => onOpenRateModal('gold') : handleStartEdit}
                >
                  <Edit2 size={14} style={{ marginRight: '4px' }} /> Update Rates
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
                          value={g.sell}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.gold[idx].sell = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                          style={{ width: '100%', fontSize: '12px', padding: '3px 6px' }}
                        />
                      </label>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Buy
                        <input
                          type="number"
                          step="0.01"
                          value={g.buy}
                          onChange={(e) => {
                            const copy = { ...draftRates };
                            copy.gold[idx].buy = Number(e.target.value) || 0;
                            setDraftRates(copy);
                          }}
                          style={{ width: '100%', fontSize: '12px', padding: '3px 6px' }}
                        />
                      </label>
                    </div>
                  ) : (
                    <small>Sell {g.sell.toFixed(0)} / Buy {g.buy.toFixed(0)} ({spread.toFixed(1)}%)</small>
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
