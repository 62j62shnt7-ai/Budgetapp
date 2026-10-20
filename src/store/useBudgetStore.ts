import { create } from 'zustand';
import type { ViewTab } from '../types';
import { inferTag } from '../engine/tags';
import {
  STORAGE_KEYS,
  loadStorage,
  saveStorage,
  scheduleAutoDriveSync,
  suppressAutoSync,
  suppressDirtyMarking,
  hasPendingUserEdit,
} from './slices/common';
import type { BudgetStoreState } from './slices/types';
import { createUISlice } from './slices/uiSlice';
import { createUndoSlice } from './slices/undoSlice';
import { createEntriesSlice } from './slices/entriesSlice';
import { createAccountsSlice } from './slices/accountsSlice';
import { createJobsSlice } from './slices/jobsSlice';
import { createRatesSlice } from './slices/ratesSlice';
import { createSyncSlice } from './slices/syncSlice';

export type { ViewTab, BudgetStoreState };
export { STORAGE_KEYS, loadStorage, saveStorage, inferTag };

export const useBudgetStore = create<BudgetStoreState>((set, get, api) => ({
  ...createUISlice(set, get, api),
  ...createUndoSlice(set, get, api),
  ...createEntriesSlice(set, get, api),
  ...createAccountsSlice(set, get, api),
  ...createJobsSlice(set, get, api),
  ...createRatesSlice(set, get, api),
  ...createSyncSlice(set, get, api),
}));

const syncedDataKeys: Array<keyof BudgetStoreState> = [
  'entries',
  'archivedEntries',
  'deletedForecasts',
  'accounts',
  'salaryPattern',
  'installments',
  'rates',
  'storageAssets',
  'asfJobs',
  'irqJobs',
  'partTimeJobs',
  'entryActuals',
  'entryActualDates',
  'creditDues',
  'creditDueMonths',
  'creditSettlementOverrides',
  'salaryAnchorMonth',
];

useBudgetStore.subscribe((state, previousState) => {
  if (suppressAutoSync) return;
  if (suppressDirtyMarking) return;
  if (syncedDataKeys.some((key) => state[key] !== previousState[key])) {
    scheduleAutoDriveSync(() => useBudgetStore.getState(), false, { isUserEdit: hasPendingUserEdit });
  }
});
