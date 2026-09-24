import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { computeAssetEgpValue, computeTotalStorageValue } from '../../engine/currency';
import { formatMoney } from '../../engine/dateUtils';
import { Boxes, Plus, Trash2, X, Check } from 'lucide-react';

export const StorageView: React.FC = () => {
  const { storageAssets, rates, addStorageAsset, deleteStorageAsset } = useBudgetStore();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Gold');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('grams');
  const [buyPrice, setBuyPrice] = useState('');
  const [currency] = useState('EGP');

  const totalValue = computeTotalStorageValue(storageAssets, rates);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addStorageAsset({
      name: name.trim(),
      category,
      quantity: Number(quantity) || 1,
      unit,
      buyPrice: Number(buyPrice) || 0,
      currency,
    });

    setName('');
    setBuyPrice('');
    setIsAddOpen(false);
  };

  return (
    <div>
      {/* Header & Total Summary */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(6, 182, 212, 0.15)',
              color: '#06b6d4',
            }}
          >
            <Boxes size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', fontFamily: 'var(--font-heading)' }}>
              Storage &amp; Reserve Assets
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Total Estimated Valuation: <strong>{formatMoney(totalValue)}</strong>
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
          <Plus size={16} />
          <span>Add Reserve Asset</span>
        </button>
      </div>

      {/* Assets Table */}
      <div className="card">
        {storageAssets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
            No storage assets registered yet. Add gold, coins, or foreign currency cash reserves to track your total net worth!
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Asset Name</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Cost Basis</th>
                  <th>Current Market Value</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {storageAssets.map((asset) => {
                  const currentVal = computeAssetEgpValue(asset, rates);
                  return (
                    <tr key={asset.id}>
                      <td style={{ fontWeight: 600 }}>{asset.name}</td>
                      <td>
                        <span className="badge badge-warning">{asset.category}</span>
                      </td>
                      <td>
                        {asset.quantity} {asset.unit}
                      </td>
                      <td style={{ color: 'var(--text-dim)' }}>
                        {formatMoney(asset.buyPrice)}
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#06b6d4' }}>
                        {formatMoney(currentVal)}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.35rem', border: 'none' }}
                          onClick={() => deleteStorageAsset(asset.id)}
                          title="Delete asset"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {isAddOpen && (
        <div className="modal-overlay" onClick={() => setIsAddOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Add Reserve Asset</span>
              <button
                onClick={() => setIsAddOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdd}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Asset Name</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Gold 21, USD Cash, Gold Coin"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="Gold">Gold</option>
                      <option value="Currency">Foreign Currency</option>
                      <option value="Investment">Investment / Bond</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      required
                      className="form-input"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Unit</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. grams, coins, $"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Original Buy Price</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="0.00"
                      value={buyPrice}
                      onChange={(e) => setBuyPrice(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} />
                  <span>Save Asset</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
