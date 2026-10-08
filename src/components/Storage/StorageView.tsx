import React, { useEffect, useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { formatMoney } from '../../engine/dateUtils';
import {
  resolveRateSourceValue,
  storageValue,
  formatNativeCurrency,
  inferAssetLocation,
} from '../../engine/currency';
import { Plus, ArrowRightLeft, Coins } from 'lucide-react';
import { StorageTransferModal } from '../Modals/StorageTransferModal';
import { StorageFxModal } from '../Modals/StorageFxModal';
import { AffectedRecordsModal } from '../Modals/AffectedRecordsModal';
import { buildStorageDeleteOptions, hasStorageAffectedParties } from '../../utils/affectedRecords';
import type { StorageAsset, StorageLocationType } from '../../types';

interface StorageViewProps {
  onOpenStorageModal: () => void;
}

export const StorageView: React.FC<StorageViewProps> = ({ onOpenStorageModal }) => {
  const {
    storageAssets,
    rates,
    updateStorageAsset,
    deleteStorageAsset,
    syncStorageRates,
    partTimeJobs,
    asfJobs,
    irqJobs,
  } = useBudgetStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'bank' | 'cash' | 'vault'>('all');
  const [transferModalOpen, setTransferModalOpen] = useState<boolean>(false);
  const [selectedFromAsset, setSelectedFromAsset] = useState<StorageAsset | null>(null);
  const [fxModalOpen, setFxModalOpen] = useState<boolean>(false);
  const [selectedFxAsset, setSelectedFxAsset] = useState<StorageAsset | null>(null);
  const [deleteAssetTarget, setDeleteAssetTarget] = useState<StorageAsset | null>(null);

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');

  useEffect(() => {
    syncStorageRates();
  }, [rates, syncStorageRates]);

  const getAssetValue = (asset: StorageAsset) => {
    return storageValue(asset, rates);
  };

  const totalValue = storageAssets.reduce((sum, item) => sum + getAssetValue(item), 0);

  // Grouped values for summary
  const bankTotal = storageAssets
    .filter((a) => (inferAssetLocation(a).locationType === 'bank'))
    .reduce((sum, item) => sum + getAssetValue(item), 0);

  const cashTotal = storageAssets
    .filter((a) => (inferAssetLocation(a).locationType === 'cash'))
    .reduce((sum, item) => sum + getAssetValue(item), 0);

  const vaultTotal = storageAssets
    .filter((a) => (inferAssetLocation(a).locationType === 'vault' || inferAssetLocation(a).locationType === 'other'))
    .reduce((sum, item) => sum + getAssetValue(item), 0);

  const filteredAssets = storageAssets.filter((asset) => {
    if (activeFilter === 'all') return true;
    const loc = inferAssetLocation(asset);
    return loc.locationType === activeFilter;
  });

  const handleFieldChange = (assetId: string, field: string, value: any) => {
    const asset = storageAssets.find((a) => a.id === assetId);
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

  const handleRateSourceChange = (assetId: string, value: string) => {
    const asset = storageAssets.find((a) => a.id === assetId);
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

  const handleLocationChange = (assetId: string, val: string) => {
    const asset = storageAssets.find((a) => a.id === assetId);
    if (!asset) return;
    const [locType, loc] = val.split(':') as [StorageLocationType, string];
    let locLabel = 'Storage';
    if (locType === 'bank') locLabel = loc === 'hsbc' ? 'HSBC Account' : loc === 'cib' ? 'CIB Account' : `${loc.toUpperCase()} Account`;
    else if (locType === 'cash') locLabel = 'Physical Cash';
    else if (locType === 'vault') locLabel = 'Physical Vault';

    updateStorageAsset(asset.id, {
      ...asset,
      locationType: locType,
      location: loc,
      locationLabel: locLabel,
    });
  };

  const openTransferFor = (asset: StorageAsset) => {
    setSelectedFromAsset(asset);
    setTransferModalOpen(true);
  };

  const openFxFor = (asset: StorageAsset) => {
    setSelectedFxAsset(asset);
    setFxModalOpen(true);
  };

  return (
    <section className="view" id="storage" style={{ display: 'block' }}>
      <div className="content-grid">
        {/* Assets Cards Grid Panel */}
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0 }}>Stored Reserves & Foreign Currency</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="ghost-button"
                type="button"
                title="Transfer between cash & bank holdings"
                onClick={() => {
                  setSelectedFromAsset(null);
                  setTransferModalOpen(true);
                }}
              >
                <ArrowRightLeft size={14} style={{ marginRight: '4px' }} />
                <span>Transfer</span>
              </button>
              <button
                className="ghost-button"
                type="button"
                title="Sell or convert foreign currency to EGP"
                onClick={() => {
                  setSelectedFxAsset(null);
                  setFxModalOpen(true);
                }}
              >
                <Coins size={14} style={{ marginRight: '4px' }} />
                <span>Exchange</span>
              </button>
              <button className="ghost-button" id="addStorage" type="button" onClick={onOpenStorageModal}>
                <Plus size={14} style={{ marginRight: '4px' }} />
                <span>Add asset</span>
              </button>
            </div>
          </div>

          {/* Location Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chip-button ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All Assets ({storageAssets.length})
            </button>
            <button
              type="button"
              className={`chip-button ${activeFilter === 'bank' ? 'active' : ''}`}
              onClick={() => setActiveFilter('bank')}
            >
              🏦 HSBC Bank Accounts
            </button>
            <button
              type="button"
              className={`chip-button ${activeFilter === 'cash' ? 'active' : ''}`}
              onClick={() => setActiveFilter('cash')}
            >
              💵 Physical Cash
            </button>
            <button
              type="button"
              className={`chip-button ${activeFilter === 'vault' ? 'active' : ''}`}
              onClick={() => setActiveFilter('vault')}
            >
              🔒 Gold & Vault
            </button>
          </div>

          <div id="storageCards" className="asset-grid" style={{ marginTop: '16px' }}>
            {filteredAssets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', width: '100%', gridColumn: '1 / -1' }}>
                {activeFilter === 'all'
                  ? 'No stored assets added yet. Track your HSBC USD/EUR accounts, cash USD, or gold holdings.'
                  : `No assets found in the ${activeFilter} category.`}
              </div>
            ) : (
              filteredAssets.map((item) => {
                const currentSource = item.rateSource || 'manual';
                const resolvedLive = currentSource !== 'manual' ? resolveRateSourceValue(currentSource, rates) : null;
                const currentRate = resolvedLive !== null ? resolvedLive : (item.rate || item.buyPrice || 0);
                const assetVal = getAssetValue(item);
                const loc = inferAssetLocation(item);

                return (
                  <article key={item.id} className="asset-card">
                    <div className="asset-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, marginRight: '10px' }}>
                        {editingNameId === item.id ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="text"
                              className="form-input"
                              style={{ padding: '2px 8px', fontSize: '14px', height: '28px' }}
                              value={tempName}
                              autoFocus
                              onChange={(e) => setTempName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (tempName.trim()) {
                                    updateStorageAsset(item.id, { ...item, name: tempName.trim() });
                                  }
                                  setEditingNameId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingNameId(null);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="primary-button"
                              style={{ padding: '2px 8px', fontSize: '12px', height: '28px' }}
                              onClick={() => {
                                if (tempName.trim()) {
                                  updateStorageAsset(item.id, { ...item, name: tempName.trim() });
                                }
                                setEditingNameId(null);
                              }}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <strong
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Click to edit name"
                            onClick={() => {
                              setEditingNameId(item.id);
                              setTempName(item.name);
                            }}
                          >
                            {item.name} <span style={{ fontSize: '10px', color: 'var(--muted)' }}>✏️</span>
                          </strong>
                        )}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background:
                                loc.locationType === 'bank'
                                  ? 'rgba(59, 130, 246, 0.12)'
                                  : loc.locationType === 'cash'
                                  ? 'rgba(34, 197, 94, 0.12)'
                                  : 'rgba(234, 179, 8, 0.12)',
                              color:
                                loc.locationType === 'bank'
                                  ? '#60a5fa'
                                  : loc.locationType === 'cash'
                                  ? '#4ade80'
                                  : '#facc15',
                              fontWeight: 600,
                            }}
                          >
                            {loc.locationType === 'bank' ? '🏦 ' : loc.locationType === 'cash' ? '💵 ' : '🔒 '}
                            {loc.locationLabel}
                          </span>
                        </div>
                      </div>
                      {(() => {
                        const hasAffected = hasStorageAffectedParties(item, {
                          partTimeJobs,
                          asfJobs,
                          irqJobs,
                        });
                        return (
                          <button
                            className="delete-button"
                            type="button"
                            style={{ position: 'relative' }}
                            title={hasAffected ? 'Delete asset (linked to jobs/destinations)' : 'Delete asset'}
                            onClick={() => setDeleteAssetTarget(item)}
                          >
                            Delete
                            {hasAffected && (
                              <span
                                className="affected-parties-dot"
                                title="Linked to job settlement destinations"
                              />
                            )}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Prominent Native Balance & EGP Equivalent */}
                    <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--surface-soft)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Balance:</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>
                          {formatNativeCurrency(item.quantity, item.unit)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2px' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>EGP Value:</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>
                          ≈ {formatMoney(assetVal)}
                        </span>
                      </div>
                    </div>

                    <div className="storage-fields-grid" style={{ marginTop: '10px' }}>
                      <label className="storage-field-item">
                        <span className="field-label-text">Quantity</span>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => handleFieldChange(item.id, 'quantity', Number(e.target.value) || 0)}
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
                          onChange={(e) => handleFieldChange(item.id, 'rate', Number(e.target.value) || 0)}
                        />
                      </label>
                    </div>

                    <div className="storage-fields-grid" style={{ marginTop: '8px' }}>
                      <label className="storage-field-item">
                        <span className="field-label-text">Rate source</span>
                        <select
                          className="form-select"
                          value={currentSource}
                          onChange={(e) => handleRateSourceChange(item.id, e.target.value)}
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

                      <label className="storage-field-item">
                        <span className="field-label-text">Where held</span>
                        <select
                          className="form-select"
                          value={`${loc.locationType}:${loc.location}`}
                          onChange={(e) => handleLocationChange(item.id, e.target.value)}
                        >
                          <option value="bank:hsbc">🏦 HSBC Bank</option>
                          <option value="bank:cib">🏦 CIB Bank</option>
                          <option value="cash:cash">💵 Physical Cash</option>
                          <option value="vault:vault">🔒 Vault / Safe</option>
                          <option value="other:other">📁 Other</option>
                        </select>
                      </label>
                    </div>

                    {/* Action buttons on card */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ flex: 1, fontSize: '12px', padding: '6px' }}
                        onClick={() => openTransferFor(item)}
                      >
                        <ArrowRightLeft size={12} style={{ marginRight: '4px' }} />
                        Transfer
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ flex: 1, fontSize: '12px', padding: '6px' }}
                        onClick={() => openFxFor(item)}
                      >
                        <Coins size={12} style={{ marginRight: '4px' }} />
                        Sell to EGP
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Summary Panel */}
        <section className="panel">
          <div className="panel-heading">
            <h3 style={{ margin: 0 }}>Reserve Summary</h3>
          </div>
          <div className="summary-block" style={{ padding: '16px 0 0' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Total Stored Assets</span>
            <strong id="storageSummary" style={{ display: 'block', fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', margin: '4px 0' }}>
              {formatMoney(totalValue)}
            </strong>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: 0 }}>
              All foreign accounts, physical cash, and gold converted to EGP at live market rates.
            </p>

            <div style={{ marginTop: '16px', borderTop: '1px dashed var(--line)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--muted)' }}>🏦 HSBC Bank Foreign:</span>
                <strong>{formatMoney(bankTotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--muted)' }}>💵 Physical Cash Foreign:</span>
                <strong>{formatMoney(cashTotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--muted)' }}>🔒 Gold & Metals:</span>
                <strong>{formatMoney(vaultTotal)}</strong>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Transfer and FX Modals */}
      <StorageTransferModal
        isOpen={transferModalOpen}
        initialFromAsset={selectedFromAsset}
        onClose={() => setTransferModalOpen(false)}
      />
      <StorageFxModal
        isOpen={fxModalOpen}
        initialAsset={selectedFxAsset}
        onClose={() => setFxModalOpen(false)}
      />

      {/* Affected Records Modal for Storage Asset Deletion */}
      {deleteAssetTarget && (() => {
        const affectedData = buildStorageDeleteOptions(deleteAssetTarget, {
          partTimeJobs,
          asfJobs,
          irqJobs,
        });

        return (
          <AffectedRecordsModal
            isOpen={Boolean(deleteAssetTarget)}
            mode="delete"
            title="Delete Storage Asset"
            subtitle="Choose which records and destinations should be updated upon deleting this asset."
            itemDescription={affectedData.itemDescription}
            amountFormatted={affectedData.amountFormatted}
            options={affectedData.options}
            onConfirm={(selectedIds) => {
              deleteStorageAsset(deleteAssetTarget.id, {
                resetJobDestinations: selectedIds.includes('jobs'),
              });
              setDeleteAssetTarget(null);
            }}
            onClose={() => setDeleteAssetTarget(null)}
          />
        );
      })()}
    </section>
  );
};

