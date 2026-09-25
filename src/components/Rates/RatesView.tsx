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
import { Edit2, Check, X } from 'lucide-react';

interface RatesViewProps {
  onOpenRateModal?: (type: 'currency' | 'gold') => void;
}

export const RatesView: React.FC<RatesViewProps> = ({ onOpenRateModal }) => {
  const { rates, updateRates } = useBudgetStore();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [draftRates, setDraftRates] = useState<RatesData | null>(null);
  const [isFetchingCurrencies, setIsFetchingCurrencies] = useState<boolean>(false);
  const [isFetchingGold, setIsFetchingGold] = useState<boolean>(false);

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
      });
      setIsEditing(false);
      setDraftRates(null);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraftRates(null);
  };

  const handleFetchLiveCurrencies = async () => {
    setIsFetchingCurrencies(true);
    try {
      const liveRates = await fetchLiveCurrencyRates();
      const changes: string[] = [];
      const updated = rates.currencies.map((currency) => {
        const mid = egpPerUnit(liveRates, currency.name.toUpperCase());
        if (mid === null) return currency;
        const spreadPct = computeSpreadPct(currency.sell, currency.buy);
        const next = applySpread(mid, spreadPct);
        changes.push(`${currency.name}: ${currency.sell.toFixed(2)}/${currency.buy.toFixed(2)} → ${next.sell.toFixed(2)}/${next.buy.toFixed(2)}`);
        return { ...currency, ...next };
      });

      if (!changes.length) {
        alert("None of the saved currencies matched the live market feed.");
        return;
      }

      const confirmed = window.confirm(
        `Update Currency Rates from live market data?\n\n${changes.join("\n")}`
      );
      if (!confirmed) return;

      const now = new Date().toISOString();
      updateRates({
        ...rates,
        currencies: updated,
        currenciesLastFetched: now,
        lastFetched: now,
      });
    } catch (err: any) {
      console.error("Live currency rate fetch failed:", err);
      const manual = window.confirm("Couldn't fetch live rates (offline or rate service unavailable). Enter rates manually?");
      if (manual) handleStartEdit();
    } finally {
      setIsFetchingCurrencies(false);
    }
  };

  const handleFetchLiveGold = async () => {
    setIsFetchingGold(true);
    try {
      const [liveRates, xauUsd] = await Promise.all([fetchLiveCurrencyRates(), fetchLiveGoldSpotUsd()]);
      const egpPerOz = xauUsd * liveRates.EGP;
      const egpPerGram24k = egpPerOz / TROY_OUNCE_GRAMS;

      const changes: string[] = [];
      const skipped: string[] = [];
      const updated = rates.gold.map((item) => {
        let mid: number | null = null;
        const match = item.name.match(/(\d+)/);
        if (match) {
          const karat = Number(match[1]);
          mid = egpPerGram24k * (karat / 24);
        } else if (item.name.toLowerCase().includes('coin') || item.name.toLowerCase().includes('pound')) {
          // A Gold Coin (جنيه ذهب) is 8 grams of 21k gold
          mid = egpPerGram24k * (21 / 24) * 8;
        }

        if (mid === null) {
          skipped.push(item.name);
          return item;
        }

        const spreadPct = computeSpreadPct(item.sell, item.buy);
        const next = applySpread(mid, spreadPct);
        next.sell = Math.round(next.sell);
        next.buy = Math.round(next.buy);
        changes.push(`${item.name}: ${item.sell}/${item.buy} → ${next.sell}/${next.buy}`);
        return { ...item, ...next };
      });

      if (!changes.length) {
        alert('None of the saved gold entries could be matched to a karat (e.g. "Gold 21" or "Gold coin").');
        return;
      }

      let message = `Update Gold Rates from live spot price ($${xauUsd.toFixed(2)}/oz)?\n\n${changes.join("\n")}`;
      if (skipped.length) message += `\n\nSkipped: ${skipped.join(", ")}`;

      const confirmed = window.confirm(message);
      if (!confirmed) return;

      const now = new Date().toISOString();
      updateRates({
        ...rates,
        gold: updated,
        goldLastFetched: now,
        lastFetched: now,
      });
    } catch (err: any) {
      console.error("Live gold rate fetch failed:", err);
      const manual = window.confirm("Couldn't fetch live gold price. Enter rates manually?");
      if (manual) handleStartEdit();
    } finally {
      setIsFetchingGold(false);
    }
  };

  const current = isEditing && draftRates ? draftRates : rates;

  return (
    <section className="view" id="rates" style={{ display: 'block' }}>
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
                <>
                  <button
                    className="primary-button"
                    id="editCurrencies"
                    type="button"
                    disabled={isFetchingCurrencies}
                    onClick={handleFetchLiveCurrencies}
                  >
                    {isFetchingCurrencies ? 'Fetching…' : 'Update from Live'}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onOpenRateModal ? () => onOpenRateModal('currency') : handleStartEdit}
                  >
                    <Edit2 size={14} style={{ marginRight: '4px' }} /> Edit
                  </button>
                </>
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
                <>
                  <button
                    className="primary-button"
                    id="editGold"
                    type="button"
                    disabled={isFetchingGold}
                    onClick={handleFetchLiveGold}
                  >
                    {isFetchingGold ? 'Fetching…' : 'Update from Live'}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onOpenRateModal ? () => onOpenRateModal('gold') : handleStartEdit}
                  >
                    <Edit2 size={14} style={{ marginRight: '4px' }} /> Edit
                  </button>
                </>
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
