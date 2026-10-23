import type { RatesData, StorageAsset, JobItem } from '../../types';
import {
  resolveRateSourceValue,
  computeTotalStorageValue,
  defaultRates,
  inferAssetLocation,
} from '../../engine/currency';
import { DateUtils } from '../../engine/dateUtils';
import { isJobLinkedToStorageAsset } from '../../utils/affectedRecords';
import {
  STORAGE_KEYS,
  loadStorage,
  saveStorage,
  scheduleAutoDriveSync,
  setSuppressDirtyMarking,
} from './common';
import type { SliceCreator, RatesSlice } from './types';

export const createRatesSlice: SliceCreator<RatesSlice> = (set, get) => ({
  rates: loadStorage<RatesData>(STORAGE_KEYS.rates, defaultRates),
  storageAssets: (loadStorage<StorageAsset[]>(STORAGE_KEYS.storage, []) || []).map((asset) => {
    const loc = inferAssetLocation(asset);
    return {
      ...asset,
      locationType: asset.locationType || loc.locationType,
      location: asset.location || loc.location,
      locationLabel: asset.locationLabel || loc.locationLabel,
    };
  }),

  syncStorageRates: (customRates) => {
    const activeRates = customRates || get().rates;
    let changed = false;
    const updated = get().storageAssets.map((item) => {
      const resolved = resolveRateSourceValue(item.rateSource, activeRates);
      if (resolved !== null && resolved !== item.rate) {
        changed = true;
        return { ...item, rate: resolved, buyPrice: item.buyPrice ?? resolved };
      }
      return item;
    });
    if (changed) {
      saveStorage(STORAGE_KEYS.storage, updated);
      set({ storageAssets: updated });
    }
  },

  updateRates: (newRates, syncImmediately = false) => {
    const currentStorageTotal = computeTotalStorageValue(get().storageAssets, get().rates);
    const nextStorageTotal = computeTotalStorageValue(get().storageAssets, newRates);

    const ratesToSave: RatesData = { ...newRates };
    if (currentStorageTotal > 0 && Math.round(nextStorageTotal) !== Math.round(currentStorageTotal)) {
      ratesToSave.previousStorageTotal = currentStorageTotal;
    } else if (newRates.previousStorageTotal === undefined && get().rates.previousStorageTotal) {
      ratesToSave.previousStorageTotal = get().rates.previousStorageTotal;
    }

    saveStorage(STORAGE_KEYS.rates, ratesToSave);
    let changed = false;
    const updatedStorage = get().storageAssets.map((item) => {
      const resolved = resolveRateSourceValue(item.rateSource, ratesToSave);
      if (resolved !== null && resolved !== item.rate) {
        changed = true;
        return { ...item, rate: resolved, buyPrice: item.buyPrice ?? resolved };
      }
      return item;
    });

    const isMachineRateRefresh = !syncImmediately;
    if (isMachineRateRefresh) setSuppressDirtyMarking(true);
    try {
      if (changed) {
        saveStorage(STORAGE_KEYS.storage, updatedStorage);
        set({ rates: ratesToSave, storageAssets: updatedStorage });
      } else {
        set({ rates: ratesToSave });
      }
      scheduleAutoDriveSync(get, syncImmediately, { rateRefresh: isMachineRateRefresh });
    } finally {
      if (isMachineRateRefresh) setSuppressDirtyMarking(false);
    }
  },

  addStorageAsset: (assetData) => {
    return get().runTransaction(`Add Asset: ${assetData.name}`, () => {
      const loc = inferAssetLocation(assetData);
      const newAsset: StorageAsset = {
        ...assetData,
        locationType: assetData.locationType || loc.locationType,
        location: assetData.location || loc.location,
        locationLabel: assetData.locationLabel || loc.locationLabel,
        id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };
      const updated = [...get().storageAssets, newAsset];
      saveStorage(STORAGE_KEYS.storage, updated);
      set({ storageAssets: updated });
      scheduleAutoDriveSync(get);
    });
  },

  updateStorageAsset: (id, updates) => {
    const asset = get().storageAssets.find((a) => a.id === id);
    return get().runTransaction(`Update Asset: ${asset?.name || 'Asset'}`, () => {
      const updated = get().storageAssets.map((a) => {
        if (a.id !== id) return a;
        const merged = { ...a, ...updates };
        if (updates.locationType || updates.location) {
          const loc = inferAssetLocation(merged);
          merged.locationType = updates.locationType || merged.locationType || loc.locationType;
          merged.location = updates.location || merged.location || loc.location;
          merged.locationLabel = updates.locationLabel || loc.locationLabel;
        }
        return merged;
      });
      saveStorage(STORAGE_KEYS.storage, updated);
      set({ storageAssets: updated });
      scheduleAutoDriveSync(get);
    });
  },

  deleteStorageAsset: (id, options) => {
    const asset = get().storageAssets.find((a) => a.id === id);
    return get().runTransaction(`Delete Asset: ${asset?.name || 'Asset'}`, () => {
      const updated = get().storageAssets.filter((a) => a.id !== id);
      saveStorage(STORAGE_KEYS.storage, updated);

      let asfJobsUpdated = false;
      let irqJobsUpdated = false;
      let partTimeJobsUpdated = false;
      let updatedAsf = get().asfJobs;
      let updatedIrq = get().irqJobs;
      let updatedPartTime = get().partTimeJobs;

      if (options?.resetJobDestinations && asset) {
        const resetJob = (j: JobItem): JobItem =>
          isJobLinkedToStorageAsset(j, asset) ? { ...j, forecastDestination: undefined } : j;

        const nextAsf = get().asfJobs.map(resetJob);
        if (nextAsf.some((j, i) => j !== get().asfJobs[i])) {
          asfJobsUpdated = true;
          updatedAsf = nextAsf;
        }
        const nextIrq = get().irqJobs.map(resetJob);
        if (nextIrq.some((j, i) => j !== get().irqJobs[i])) {
          irqJobsUpdated = true;
          updatedIrq = nextIrq;
        }
        const nextPartTime = get().partTimeJobs.map(resetJob);
        if (nextPartTime.some((j, i) => j !== get().partTimeJobs[i])) {
          partTimeJobsUpdated = true;
          updatedPartTime = nextPartTime;
        }

        if (asfJobsUpdated) saveStorage(STORAGE_KEYS.asf, updatedAsf);
        if (irqJobsUpdated) saveStorage(STORAGE_KEYS.irq, updatedIrq);
        if (partTimeJobsUpdated) saveStorage(STORAGE_KEYS.partTimeJobs, updatedPartTime);
      }

      set({
        storageAssets: updated,
        ...(asfJobsUpdated ? { asfJobs: updatedAsf } : {}),
        ...(irqJobsUpdated ? { irqJobs: updatedIrq } : {}),
        ...(partTimeJobsUpdated ? { partTimeJobs: updatedPartTime } : {}),
      });
      scheduleAutoDriveSync(get);
    });
  },

  depositToStorageAsset: (assetId, amount) => {
    if (!amount || amount <= 0) return;
    const current = get().storageAssets.find((a) => a.id === assetId);
    if (!current) return;
    return get().runTransaction(`Deposit to ${current.name}`, () => {
      const nextQty = (Number(current.quantity) || 0) + Number(amount);
      get().updateStorageAsset(assetId, { quantity: nextQty });
    });
  },

  transferStorageAsset: (fromAssetId, toAssetId, amount) => {
    if (fromAssetId === toAssetId || !amount || amount <= 0) return false;
    const fromAsset = get().storageAssets.find((a) => a.id === fromAssetId);
    const toAsset = get().storageAssets.find((a) => a.id === toAssetId);
    if (!fromAsset || !toAsset) return false;
    if ((Number(fromAsset.quantity) || 0) < amount) return false;
    if ((fromAsset.unit || '').toLowerCase() !== (toAsset.unit || '').toLowerCase()) return false;

    return get().runTransaction(`Transfer ${amount} ${fromAsset.unit || ''}`, () => {
      const updated = get().storageAssets.map((a) => {
        if (a.id === fromAssetId) {
          const raw = Math.max(0, (Number(a.quantity) || 0) - amount);
          return { ...a, quantity: Math.round(raw * 10000) / 10000 };
        }
        if (a.id === toAssetId) {
          const raw = (Number(a.quantity) || 0) + amount;
          return { ...a, quantity: Math.round(raw * 10000) / 10000 };
        }
        return a;
      });

      saveStorage(STORAGE_KEYS.storage, updated);
      set({ storageAssets: updated });
      scheduleAutoDriveSync(get);
      return true;
    });
  },

  convertStorageAssetToEgp: (assetId, foreignAmount, targetAccount, customRate) => {
    if (!foreignAmount || foreignAmount <= 0) return undefined;
    const asset = get().storageAssets.find((a) => a.id === assetId);
    if (!asset || (Number(asset.quantity) || 0) < foreignAmount) return undefined;

    return get().runTransaction(`Convert ${foreignAmount} ${asset.unit || asset.currency} to EGP`, () => {
      const rate = customRate || (asset.rateSource ? resolveRateSourceValue(asset.rateSource, get().rates) : null) || asset.rate || asset.buyPrice || 1;
      const egpGained = Math.round(foreignAmount * rate * 100) / 100;

      // 1. Deduct foreign quantity from storage asset
      const updatedAssets = get().storageAssets.map((a) => {
        if (a.id === assetId) {
          const raw = Math.max(0, (Number(a.quantity) || 0) - foreignAmount);
          return { ...a, quantity: Math.round(raw * 10000) / 10000 };
        }
        return a;
      });
      saveStorage(STORAGE_KEYS.storage, updatedAssets);

      // 2. Deposit EGP to bank account
      const accounts = { ...get().accounts };
      if (accounts[targetAccount]) {
        accounts[targetAccount] = {
          ...accounts[targetAccount],
          balance: Math.round(((accounts[targetAccount].balance || 0) + egpGained) * 100) / 100,
        };
        saveStorage(STORAGE_KEYS.accounts, accounts);
      }

      // 3. Log an income entry for record tracking.
      const today = DateUtils.todayString();
      const entryId = get().addEntry({
        date: today,
        category: 'FX Conversion',
        subcategory: `Sold ${asset.name}`,
        tag: 'FX Exchange',
        account: targetAccount,
        type: 'income',
        amount: egpGained,
        actualAmount: egpGained,
        actualDate: today,
        currency: 'EGP',
        source: `Converted ${foreignAmount} ${asset.unit || asset.currency} @ ${rate} EGP`,
        storageAssetId: assetId,
        originalAmount: foreignAmount,
        fxRateAtEntry: rate,
        conversionType: 'fx-sale',
        excludeFromForecast: true,
      });

      set({ storageAssets: updatedAssets, accounts });
      scheduleAutoDriveSync(get);
      return entryId;
    });
  },
});
