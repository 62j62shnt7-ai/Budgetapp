import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { computeSpreadPct } from '../../engine/currency';
import { Coins, DollarSign, Check, Edit2 } from 'lucide-react';
import type { RatesData } from '../../types';

export const RatesView: React.FC = () => {
  const { rates, updateRates } = useBudgetStore();
  const [editingRates, setEditingRates] = useState<RatesData | null>(null);

  const handleStartEdit = () => {
    setEditingRates(JSON.parse(JSON.stringify(rates)));
  };

  const handleSave = () => {
    if (editingRates) {
      updateRates(editingRates);
      setEditingRates(null);
    }
  };

  const current = editingRates || rates;

  return (
    <div>
      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.35rem', fontFamily: 'var(--font-heading)' }}>
            Exchange Rates &amp; Gold Prices
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Buy &amp; Sell market prices used for multi-currency storage valuation
          </div>
        </div>

        {editingRates ? (
          <button className="btn btn-primary" onClick={handleSave}>
            <Check size={16} />
            <span>Save Changes</span>
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={handleStartEdit}>
            <Edit2 size={16} />
            <span>Edit Rates</span>
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* Currencies */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
            <DollarSign size={18} color="#10b981" />
            <span>Foreign Currencies (vs EGP)</span>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Sell Rate</th>
                  <th>Buy Rate</th>
                  <th>Spread</th>
                </tr>
              </thead>
              <tbody>
                {current.currencies.map((c, idx) => {
                  const spread = computeSpreadPct(c.sell, c.buy);
                  return (
                    <tr key={c.name}>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td>
                        {editingRates ? (
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            style={{ width: '80px', padding: '0.25rem 0.5rem' }}
                            value={c.sell}
                            onChange={(e) => {
                              const copy = { ...editingRates };
                              copy.currencies[idx].sell = Number(e.target.value);
                              setEditingRates(copy);
                            }}
                          />
                        ) : (
                          `${c.sell.toFixed(2)} EGP`
                        )}
                      </td>
                      <td>
                        {editingRates ? (
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            style={{ width: '80px', padding: '0.25rem 0.5rem' }}
                            value={c.buy}
                            onChange={(e) => {
                              const copy = { ...editingRates };
                              copy.currencies[idx].buy = Number(e.target.value);
                              setEditingRates(copy);
                            }}
                          />
                        ) : (
                          `${c.buy.toFixed(2)} EGP`
                        )}
                      </td>
                      <td>
                        <span className="badge badge-cyan">{spread.toFixed(2)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gold */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
            <Coins size={18} color="#f59e0b" />
            <span>Gold Rates (per gram / coin)</span>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Sell Rate</th>
                  <th>Buy Rate</th>
                  <th>Spread</th>
                </tr>
              </thead>
              <tbody>
                {current.gold.map((g, idx) => {
                  const spread = computeSpreadPct(g.sell, g.buy);
                  return (
                    <tr key={g.name}>
                      <td style={{ fontWeight: 700 }}>{g.name}</td>
                      <td>
                        {editingRates ? (
                          <input
                            type="number"
                            step="1"
                            className="form-input"
                            style={{ width: '90px', padding: '0.25rem 0.5rem' }}
                            value={g.sell}
                            onChange={(e) => {
                              const copy = { ...editingRates };
                              copy.gold[idx].sell = Number(e.target.value);
                              setEditingRates(copy);
                            }}
                          />
                        ) : (
                          `${g.sell.toLocaleString()} EGP`
                        )}
                      </td>
                      <td>
                        {editingRates ? (
                          <input
                            type="number"
                            step="1"
                            className="form-input"
                            style={{ width: '90px', padding: '0.25rem 0.5rem' }}
                            value={g.buy}
                            onChange={(e) => {
                              const copy = { ...editingRates };
                              copy.gold[idx].buy = Number(e.target.value);
                              setEditingRates(copy);
                            }}
                          />
                        ) : (
                          `${g.buy.toLocaleString()} EGP`
                        )}
                      </td>
                      <td>
                        <span className="badge badge-warning">{spread.toFixed(2)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
