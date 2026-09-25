import React, { useEffect } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import { resolveRateSourceValue, storageValue } from '../../engine/currency';
import { Plus } from 'lucide-react';

interface StorageViewProps {
  onOpenStorageModal: () => void;
}

export const StorageView: React.FC<StorageViewProps> = ({ onOpenStorageModal }) => {
  const { storageAssets, rates, updateStorageAsset, deleteStorageAsset, syncStorageRates } = useBudgetStore();

  useEffect(() => {
    syncStorageRates();
  }, [rates]);

  const getAssetValue = (asset: any) => {
    return storageValue(asset, rates);
  };

  const totalValue = storageAssets.reduce((sum, item) => sum + getAssetValue(item), 0);

  const handleFieldChange = (index: number, field: string, value: any) => {
    const asset = storageAssets[index];
    if (!asset) return;
    if (field === 'rate') {
      updateStorageAsset(asset.id, {
        ...asset,
        rateSource: 'manual',
        rate: value,
        buyPrice: value,
      });
    } else {
      updateStorageAsset(asset.id, {
        ...asset,
        [field]: value,
      });
    }
  };

  const handleRateSourceChange = (index: number, value: string) => {
    const asset = storageAssets[index];
    if (!asset) return;

    let newRate = Number(asset.rate) || Number(asset.buyPrice) || 0;
    if (value !== 'manual') {
      const resolved = resolveRateSourceValue(value, rates);
      if (resolved !== null) newRate = resolved;
    }

    updateStorageAsset(asset.id, {
      ...asset,
      rateSource: value,
      rate: newRate,
      buyPrice: newRate,
    });
  };

  return (
    <section className="view" id="storage" style={{ display: 'block' }}>
      <div className="content-grid">
        {/* Assets Cards Grid Panel */}
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Stored assets</h3>
            <button className="ghost-button" id="addStorage" type="button" onClick={onOpenStorageModal}>
              <Plus size={14} style={{ marginRight: '4px' }} />
              <span>Add asset</span>
            </button>
          </div>

          <div id="storageCards" className="asset-grid" style={{ marginTop: '16px' }}>
            {storageAssets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', width: '100%', gridColumn: '1 / -1' }}>
                No stored assets added yet. Track your gold, reserve currencies, or other precious holdings.
              </div>
            ) : (
              storageAssets.map((item, index) => {
                const currentSource = (item as any).rateSource || 'manual';
                const resolvedLive = currentSource !== 'manual' ? resolveRateSourceValue(currentSource, rates) : null;
                const currentRate = resolvedLive !== null ? resolvedLive : ((item as any).rate || item.buyPrice || 0);
                const assetVal = getAssetValue(item);

                return (
                  <article key={item.id} className="asset-card">
                    <div className="asset-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{item.name}</strong>
                      <button
                        className="delete-button"
                        type="button"
                        title="Delete asset"
                        onClick={() => deleteStorageAsset(item.id)}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="storage-fields-grid">
                      <label className="storage-field-item">
                        <span className="field-label-text">Quantity</span>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => handleFieldChange(index, 'quantity', Number(e.target.value) || 0)}
                        />
                      </label>
                      <label className="storage-field-item">
                        <span className="field-label-text">Rate (EGP)</span>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          step="0.01"
                          value={currentRate}
                          onChange={(e) => handleFieldChange(index, 'rate', Number(e.target.value) || 0)}
                        />
                      </label>
                    </div>

                    <label className="storage-field-item" style={{ marginTop: '8px' }}>
                      <span className="field-label-text">Rate source</span>
                      <select
                        className="form-select"
                        value={currentSource}
                        onChange={(e) => handleRateSourceChange(index, e.target.value)}
                      >
                        <option value="manual">Manual entry</option>
                        <optgroup label="Currencies">
                          {rates.currencies.map((c) => (
                            <option key={c.name} value={`currency:${c.name}`}>
                              {c.name} ({c.sell})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Gold karats">
                          {rates.gold.map((g) => (
                            <option key={g.name} value={`gold:${g.name}`}>
                              {g.name} ({g.sell})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>

                    <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                      {item.unit || 'units'}
                    </small>
                    <p style={{ fontWeight: 700, fontSize: '1.1rem', margin: '8px 0 0', color: 'var(--ink)' }}>
                      {formatMoney(assetVal)}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Summary Panel */}
        <section className="panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Summary</h3>
          </div>
          <div className="summary-block" style={{ padding: '16px 0 0' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Stored assets total</span>
            <strong id="storageSummary" style={{ display: 'block', fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', margin: '4px 0' }}>
              {formatMoney(totalValue)}
            </strong>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: 0 }}>
              Gold, USD, EUR and foreign holdings converted to EGP.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
};
