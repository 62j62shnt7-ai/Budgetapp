import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import {
  computeSpreadPct,
  applySpread,
  fetchLiveCurrencyRates,
  fetchLiveGoldSpotUsd,
  egpPerUnit,
  TROY_OUNCE_GRAMS,
} from '../../engine/currency';
import { formatFullDateTime } from '../../engine/dateUtils';
import type { RatesData } from '../../types';
import { Edit2, Check, X, RefreshCw } from 'lucide-react';

interface RatesViewProps {
  onOpenRateModal?: (type: 'currency' | 'gold') => void;
}

export const RatesView: React.FC<RatesViewProps> = ({ onOpenRateModal }) => {
  const { rates, updateRates } = useBudgetStore();
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
      const [liveRatesResult, goldSpotResult] = await Promise.allSettled([
        fetchLiveCurrencyRates(),
        fetchLiveGoldSpotUsd(),
      ]);

      if (liveRatesResult.status === 'rejected' && goldSpotResult.status === 'rejected') {
        throw new Error('Both currency and gold rate services failed.');
      }

      const currentRates = useBudgetStore.getState().rates;
      const changes: string[] = [];
      const now = new Date().toISOString();
      let updatedCurrencies = currentRates.currencies;
      let currenciesFetched = false;

      if (liveRatesResult.status === 'fulfilled') {
        const liveRates = liveRatesResult.value;
        updatedCurrencies = currentRates.currencies.map((currency) => {
          const mid = egpPerUnit(liveRates, currency.name.toUpperCase());
          if (mid === null) return currency;
          const spreadPct = computeSpreadPct(currency.sell, currency.buy);
          const next = applySpread(mid, spreadPct);
          if (next.sell !== currency.sell || next.buy !== currency.buy) {
            changes.push(`• ${currency.name}: ${currency.sell.toFixed(2)}/${currency.buy.toFixed(2)} → ${next.sell.toFixed(2)}/${next.buy.toFixed(2)}`);
          }
          return { ...currency, ...next };
        });
        currenciesFetched = true;
      }

      let updatedGold = currentRates.gold;
      let goldFetched = false;

      if (goldSpotResult.status === 'fulfilled' && liveRatesResult.status === 'fulfilled') {
        const xauUsd = goldSpotResult.value;
        const liveRates = liveRatesResult.value;
        const egpPerOz = xauUsd * liveRates.EGP;
        const egpPerGram24k = egpPerOz / TROY_OUNCE_GRAMS;

        updatedGold = currentRates.gold.map((item) => {
          let mid: number | null = null;
          const match = item.name.match(/(\d+)/);
          if (match) {
            const karat = Number(match[1]);
            mid = egpPerGram24k * (karat / 24);
          } else if (item.name.toLowerCase().includes('coin') || item.name.toLowerCase().includes('pound')) {
            mid = egpPerGram24k * (21 / 24) * 8;
          }

          if (mid === null) return item;

          const spreadPct = computeSpreadPct(item.sell, item.buy);
          const next = applySpread(mid, spreadPct);
          next.sell = Math.round(next.sell);
          next.buy = Math.round(next.buy);
          if (next.sell !== item.sell || next.buy !== item.buy) {
            changes.push(`• ${item.name}: ${item.sell}/${item.buy} → ${next.sell}/${next.buy}`);
          }
          return { ...item, ...next };
        });
        goldFetched = true;
      }

      updateRates({
        ...currentRates,
        currencies: updatedCurrencies,
        gold: updatedGold,
        currenciesLastFetched: currenciesFetched ? now : (currentRates.currenciesLastFetched || currentRates.lastFetched),
        goldLastFetched: goldFetched ? now : (currentRates.goldLastFetched || currentRates.lastFetched),
        lastFetched: now,
      }, true);

      if (changes.length > 0) {
        alert(`Updated Live Market Rates:\n\n${changes.join("\n")}`);
      } else {
        alert("Live market feed checked: All currency and gold rates are already up to date.");
      }
    } catch (err: any) {
      console.error("Live rates fetch failed:", err);
      const manual = window.confirm("Couldn't fetch live rates (offline or rate service unavailable). Enter rates manually?");
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
