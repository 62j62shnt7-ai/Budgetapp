import type { JobItem, JobPayment } from '../../types';
import type { SliceCreator, JobsSlice } from './types';
import {
  STORAGE_KEYS,
  loadStorage,
  saveStorage,
  revertStorageOrAccountBalance,
  scheduleAutoDriveSync,
} from './common';
import { calculateJobFinancials } from '../../engine/jobs';
import { normalizeCurrencyCode, getCurrencyRateOr } from '../../engine/currency';
import { DateUtils } from '../../engine/dateUtils';

export const createJobsSlice: SliceCreator<JobsSlice> = (set, get) => ({
  asfJobs: loadStorage<JobItem[]>(STORAGE_KEYS.asf, []),
  irqJobs: loadStorage<JobItem[]>(STORAGE_KEYS.irq, []),
  partTimeJobs: loadStorage<JobItem[]>(STORAGE_KEYS.partTimeJobs, []),

  saveJob: (jobType, job) => {
    return get().runTransaction(`Save Job: ${job.title}`, () => {
      const key = jobType === 'asf' ? STORAGE_KEYS.asf : jobType === 'irq' ? STORAGE_KEYS.irq : STORAGE_KEYS.partTimeJobs;
      const currentList = jobType === 'asf' ? get().asfJobs : jobType === 'irq' ? get().irqJobs : get().partTimeJobs;
      const exists = currentList.some((j) => j.id === job.id);
      const updated = exists ? currentList.map((j) => (j.id === job.id ? job : j)) : [...currentList, job];

      saveStorage(key, updated);
      if (jobType === 'asf') set({ asfJobs: updated });
      else if (jobType === 'irq') set({ irqJobs: updated });
      else set({ partTimeJobs: updated });
      scheduleAutoDriveSync(get);
    });
  },

  deleteJob: (jobType, jobId, options) => {
    const key = jobType === 'asf' ? STORAGE_KEYS.asf : jobType === 'irq' ? STORAGE_KEYS.irq : STORAGE_KEYS.partTimeJobs;
    const currentList = jobType === 'asf' ? get().asfJobs : jobType === 'irq' ? get().irqJobs : get().partTimeJobs;
    const targetJob = currentList.find((j) => j.id === jobId);
    return get().runTransaction(`Delete Job: ${targetJob?.title || 'Job'}`, () => {
      const updated = currentList.filter((j) => j.id !== jobId);

      const shouldDeleteCashEntries = options?.deleteCashEntries === true;
      const linkedEntryIds = new Set(
        (targetJob?.payments || []).map((p) => p.entryId).filter(Boolean) as string[]
      );
      if (targetJob?.forecastEntryId) {
        linkedEntryIds.add(targetJob.forecastEntryId);
      }
      let updatedEntries = get().entries;
      let updatedArchived = get().archivedEntries;
      let actuals = { ...get().entryActuals };
      let actualDates = { ...get().entryActualDates };
      let storageUpdated = false;

      if (shouldDeleteCashEntries) {
        // Collect any entries explicitly tagged with this jobId as well
        get().entries.forEach((e) => {
          if (e.jobId === jobId) linkedEntryIds.add(e.id);
        });
        get().archivedEntries.forEach((e) => {
          if (e.jobId === jobId) linkedEntryIds.add(e.id);
        });

        if (linkedEntryIds.size > 0) {
          updatedEntries = get().entries.filter((e) => !linkedEntryIds.has(e.id));
          updatedArchived = get().archivedEntries.filter((e) => !linkedEntryIds.has(e.id));
          saveStorage(STORAGE_KEYS.entries, updatedEntries);
          saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);

          for (const id of linkedEntryIds) {
            delete actuals[id];
            delete actualDates[id];
          }
          saveStorage(STORAGE_KEYS.entryActuals, actuals);
          saveStorage(STORAGE_KEYS.entryActualDates, actualDates);
          storageUpdated = true;
        }
      }

      saveStorage(key, updated);
      const stateUpdates: Partial<ReturnType<typeof get>> = {
        entries: updatedEntries,
        ...(storageUpdated ? { archivedEntries: updatedArchived, entryActuals: actuals, entryActualDates: actualDates } : {}),
      };
      if (jobType === 'asf') set({ ...stateUpdates, asfJobs: updated });
      else if (jobType === 'irq') set({ ...stateUpdates, irqJobs: updated });
      else set({ ...stateUpdates, partTimeJobs: updated });
      scheduleAutoDriveSync(get);
    });
  },

  deleteJobPayment: (jobType, jobId, paymentId, options) => {
    return get().runTransaction('Delete Job Payment', () => {
      const currentList = jobType === 'asf' ? get().asfJobs : jobType === 'irq' ? get().irqJobs : get().partTimeJobs;
      const targetJob = currentList.find((j) => j.id === jobId);
      if (!targetJob) return;

      const payment = (targetJob.payments || []).find((p) => p.id === paymentId);
      const remainingPayments = (targetJob.payments || []).filter((p) => p.id !== paymentId);

      const fin = calculateJobFinancials({ ...targetJob, payments: remainingPayments }, get().rates);
      const totalPaid = remainingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const updatedJob = {
        ...targetJob,
        payments: remainingPayments,
        status: (totalPaid >= fin.totalInvoice && fin.totalInvoice > 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'invoiced')) as JobItem['status'],
        forecastAmount: Math.max(0, fin.totalInvoice - totalPaid),
      };

      get().saveJob(jobType, updatedJob);

      if (options?.syncCashflow !== false && payment?.entryId) {
        const shouldDeleteCashEntry = options?.deleteCashEntry === true;
        if (shouldDeleteCashEntry) {
          get().deleteEntry(payment.entryId, undefined, { syncJob: false, revertStorage: false });
        } else {
          const entry = get().entries.find((e) => e.id === payment.entryId) ||
            get().archivedEntries.find((e) => e.id === payment.entryId);
          if (entry) {
            const remainingDraws = (entry.draws || []).filter((d) => d.id !== paymentId);
            const newActual = remainingDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
            const validDates = remainingDraws.map((d) => d.date).filter(Boolean).sort();
            const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : entry.date;
            get().updateEntry(payment.entryId, {
              actualAmount: newActual > 0 ? newActual : undefined,
              actualDate: newActual > 0 ? lastDate : undefined,
              draws: remainingDraws,
              isClosed: false,
            });
            if (newActual === 0) {
              get().clearActual(payment.entryId, { revertStorage: false, syncJob: false });
            }
          }
        }
      }

      if (options?.revertStorage && payment) {
        const rawAcc = (payment.settlementAccount || payment.account || '').replace('account:', '').trim();
        revertStorageOrAccountBalance(get, {
          assetId: options.storageAssetId,
          account: rawAcc,
          currency: payment.currency || targetJob.currency || 'USD',
          amount: Number(payment.amount) || 0,
          isEgpAmount: false,
        });
      }
    });
  },

  settleJobForecastPayment: (entryId, actualEgp, isFinishing = false) => {
    if (!entryId || actualEgp < 0) return false;
    return get().runTransaction('Settle Job Payment', () => {
      const entry = get().entries.find((e) => e.id === entryId) || get().archivedEntries.find((e) => e.id === entryId);

      let jobType: 'partTime' | 'asf' | 'irq' = 'partTime';
      let targetJob = get().partTimeJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
      if (!targetJob) {
        targetJob = get().asfJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
        if (targetJob) jobType = 'asf';
      }
      if (!targetJob) {
        targetJob = get().irqJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
        if (targetJob) jobType = 'irq';
      }
      if (!targetJob) return false;

      const jobCurrency = normalizeCurrencyCode(targetJob.currency || entry?.currency) || 'USD';
      const isForeign = jobCurrency !== 'EGP';
      const fxRate = entry?.fxRateAtEntry || (isForeign ? getCurrencyRateOr(get().rates, jobCurrency, 1) : 1);

      let nativeAmt = actualEgp;
      if (isForeign) {
        if (entry?.originalAmount && actualEgp >= (entry.amount || 0)) {
          nativeAmt = entry.originalAmount;
        } else if (fxRate > 0) {
          nativeAmt = Math.round((actualEgp / fxRate) * 100) / 100;
        }
      }

      const actDate = entry?.actualDate || DateUtils.todayString();
      const settlementAcc = entry?.account || (targetJob.forecastDestination?.replace('storage:', '').replace('account:', '')) || 'Operating';

      let updatedPayments = [...(targetJob.payments || [])];
      if (entry?.draws && entry.draws.length > 0) {
        updatedPayments = entry.draws.map((d, idx) => {
          const existingP = targetJob.payments?.find((p) => p.id === d.id);
          const dEgp = Number(d.amount) || 0;
          const dNative = isForeign ? (fxRate > 0 ? Math.round((dEgp / fxRate) * 100) / 100 : dEgp) : dEgp;
          return {
            id: d.id || existingP?.id || `pay-${idx}-${entryId}`,
            entryId,
            date: d.date || actDate,
            amount: existingP?.currency === jobCurrency && existingP.amount ? existingP.amount : dNative,
            currency: jobCurrency,
            egpAmount: dEgp,
            settlementAccount: d.account || existingP?.settlementAccount || settlementAcc,
            account: d.account || existingP?.account || settlementAcc,
            syncToBudget: true,
            paymentNote: d.note || existingP?.paymentNote || 'Tranche payment via Cashflow',
          };
        });
      } else {
        const existingPayment = targetJob.payments?.find((p) => p.entryId === entryId);
        if (existingPayment) {
          if ((targetJob.payments || []).length <= 1) {
            updatedPayments = [{ ...existingPayment, amount: nativeAmt, egpAmount: actualEgp, date: actDate }];
          } else {
            updatedPayments = (targetJob.payments || []).map((p) =>
              p.id === existingPayment.id
                ? { ...p, amount: nativeAmt, egpAmount: actualEgp, date: actDate }
                : p
            );
          }
        } else if (nativeAmt > 0) {
          const newPay: JobPayment = {
            id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            entryId,
            date: actDate,
            amount: nativeAmt,
            currency: jobCurrency,
            egpAmount: actualEgp,
            settlementAccount: settlementAcc,
            account: settlementAcc,
            syncToBudget: true,
            paymentNote: 'Received & settled via Cashflow Forecast',
          };
          updatedPayments.push(newPay);
        }
      }

      const fin = calculateJobFinancials({ ...targetJob, payments: updatedPayments }, get().rates);
      const totalPaid = updatedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const isFullyPaid = isFinishing || (totalPaid >= fin.totalInvoice && fin.totalInvoice > 0);

      const updatedJob: JobItem = {
        ...targetJob,
        payments: updatedPayments,
        status: isFullyPaid ? 'paid' : (totalPaid > 0 ? 'partial' : targetJob.status),
        forecastDueDate: isFullyPaid ? undefined : targetJob.forecastDueDate,
        forecastEntryId: isFullyPaid ? undefined : targetJob.forecastEntryId,
        forecastAmount: isFullyPaid ? undefined : Math.max(0, fin.totalInvoice - totalPaid),
        forecastDestination: isFullyPaid ? undefined : targetJob.forecastDestination,
      };

      get().saveJob(jobType, updatedJob);
      return true;
    });
  },
});
