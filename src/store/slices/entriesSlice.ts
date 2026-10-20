import type {
  CashEntry,
  EntryDraw,
  Installment,
  SalaryPayment,
  JobItem,
  CreditSettlementOverride,
} from '../../types';
import { DateUtils } from '../../engine/dateUtils';
import { inferTag } from '../../engine/tags';
import { isOngoingEntry } from '../../engine/forecast';
import { calculateJobFinancials } from '../../engine/jobs';
import {
  isLumpCreditDueForAccount,
  isCreditSettlementRow,
  isCreditCardExpense,
} from '../../engine/creditCards';
import { buildSalaryEntries } from '../../engine/salaryAndInstallments';
import { getCurrencyRateOr } from '../../engine/currency';
import {
  linkEntriesToSeries,
  unlinkEntriesFromSeries,
  detectRecurringCandidateGroups,
} from '../../utils/recurringDetector';
import { resolveLinkedLoan } from '../../utils/affectedRecords';
import {
  STORAGE_KEYS,
  loadStorage,
  saveStorage,
  scheduleAutoDriveSync,
  upgradeLoadedEntries,
  defaultSalaryPattern,
  revertStorageOrAccountBalance,
} from './common';
import type { SliceCreator, EntriesSlice } from './types';

export const createEntriesSlice: SliceCreator<EntriesSlice> = (set, get) => ({
  entries: upgradeLoadedEntries(loadStorage<CashEntry[]>(STORAGE_KEYS.entries, [])),
  archivedEntries: upgradeLoadedEntries(loadStorage<CashEntry[]>(STORAGE_KEYS.archivedEntries, [])),
  deletedForecasts: loadStorage<string[]>(STORAGE_KEYS.deletedForecasts, []),
  salaryPattern: loadStorage<SalaryPayment[]>(STORAGE_KEYS.salary, defaultSalaryPattern),
  installments: loadStorage<Installment[]>(STORAGE_KEYS.installments, []),
  entryActuals: loadStorage<Record<string, number>>(STORAGE_KEYS.entryActuals, {}),
  entryActualDates: loadStorage<Record<string, string>>(STORAGE_KEYS.entryActualDates, {}),
  salaryAnchorMonth: loadStorage<string>(STORAGE_KEYS.salaryAnchor, DateUtils.currentYearMonth()),

  addEntry: (entryData) => {
    const typeLabel = entryData.type === 'income' ? 'Income' : 'Expense';
    const label = `Add ${typeLabel}: ${entryData.category || 'Entry'}`;
    return get().runTransaction(label, () => {
      const id = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newEntry: CashEntry = {
        ...entryData,
        id,
      };
      const updated = [newEntry, ...get().entries];
      saveStorage(STORAGE_KEYS.entries, updated);
      set({ entries: updated });
      scheduleAutoDriveSync(get);
      return id;
    });
  },

  updateEntry: (id, updates, seriesMode = 'single', options) => {
    const existing = get().entries.find((e) => e.id === id) || get().archivedEntries.find((e) => e.id === id);
    const label = id.startsWith('credit-settlement-')
      ? 'Update Credit Settlement'
      : `Edit: ${existing?.category || 'Entry'}`;
    return get().runTransaction(label, () => {
      if (id.startsWith('credit-settlement-')) {
        const existingOverride = get().creditSettlementOverrides[id] || {};
        const updatedOverride: CreditSettlementOverride = {
          ...existingOverride,
          ...(updates.amount !== undefined ? { amount: Number(updates.amount) } : {}),
          ...(updates.date ? { date: updates.date } : {}),
          ...(updates.statementNote !== undefined ? { note: updates.statementNote } : {}),
          ...(updates.tag !== undefined ? { tag: updates.tag } : {}),
          ...(updates.account !== undefined ? { account: updates.account } : {}),
          ...(updates.draws !== undefined ? { draws: updates.draws } : {}),
          ...(updates.isClosed !== undefined ? { isClosed: updates.isClosed } : {}),
        };
        const nextOverrides = { ...get().creditSettlementOverrides, [id]: updatedOverride };
        saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
        set({ creditSettlementOverrides: nextOverrides });
        if (updates.actualAmount !== undefined) {
          const actuals = { ...get().entryActuals, [id]: updates.actualAmount };
          const dates = { ...get().entryActualDates, [id]: updates.actualDate || DateUtils.todayString() };
          saveStorage(STORAGE_KEYS.entryActuals, actuals);
          saveStorage(STORAGE_KEYS.entryActualDates, dates);
          set({ entryActuals: actuals, entryActualDates: dates });
        }
        scheduleAutoDriveSync(get);
        return;
      }

      const inEntries = get().entries.find((e) => e.id === id);
      const inArchived = get().archivedEntries.find((e) => e.id === id);

      // If entry is not yet in persisted ledger (e.g. virtual salary or installment entry),
      // materialize it directly into entries with the user's updated properties so the change persists.
      if (!inEntries && !inArchived) {
        if (id.startsWith('salary-') || id.startsWith('installment-')) {
          const isSalary = id.startsWith('salary-');
          const materializedEntry: CashEntry = {
            id,
            date: updates.date || DateUtils.todayString(),
            amount: Number(updates.amount) || 0,
            type: updates.type || (isSalary ? 'income' : 'expense'),
            category: updates.category || (isSalary ? 'Salary' : 'Installment'),
            subcategory: updates.subcategory,
            account: updates.account || 'hsbc',
            tag: updates.tag || (isSalary ? 'Salary' : 'Installment'),
            source: updates.source || (isSalary ? 'salary' : 'installment'),
            note: updates.note,
            currency: updates.currency || 'EGP',
            originalAmount: updates.originalAmount,
            fxRateAtEntry: updates.fxRateAtEntry,
            creditType: updates.creditType,
            creditSettlementDate: updates.creditSettlementDate,
            draws: updates.draws,
            isClosed: updates.isClosed,
            keepOngoing: updates.keepOngoing,
            loanId: updates.loanId,
            ...updates,
          };
          const nextEntries = [...get().entries, materializedEntry];
          saveStorage(STORAGE_KEYS.entries, nextEntries);
          set({ entries: nextEntries });

          if (updates.actualAmount !== undefined) {
            const actuals = { ...get().entryActuals, [id]: updates.actualAmount };
            const dates = { ...get().entryActualDates, [id]: updates.actualDate || DateUtils.todayString() };
            saveStorage(STORAGE_KEYS.entryActuals, actuals);
            saveStorage(STORAGE_KEYS.entryActualDates, dates);
            set({ entryActuals: actuals, entryActualDates: dates });
          }
          scheduleAutoDriveSync(get);
        }
        return;
      }

      if (!inEntries && inArchived) {
        const updatedArchived = get().archivedEntries.map((e) => (e.id === id ? { ...e, ...updates } : e));
        saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
        set({ archivedEntries: updatedArchived });
        if (updates.actualAmount !== undefined) {
          const actuals = { ...get().entryActuals, [id]: updates.actualAmount };
          const dates = { ...get().entryActualDates, [id]: updates.actualDate || DateUtils.todayString() };
          saveStorage(STORAGE_KEYS.entryActuals, actuals);
          saveStorage(STORAGE_KEYS.entryActualDates, dates);
          set({ entryActuals: actuals, entryActualDates: dates });
        }
        if (updates.isClosed === true) {
          const currentActual = get().entryActuals[id] ?? updates.actualAmount ?? updates.amount ?? 0;
          get().settleJobForecastPayment(id, Number(currentActual) || 0, true);
        }
        scheduleAutoDriveSync(get);
        return;
      }

      const current = inEntries!;

      if (seriesMode === 'future' && (current.seriesId || current.isRecurring)) {
        const seriesId = current.seriesId || id;
        const targetDate = current.date;
        const updated = get().entries.map((e) => {
          const matchesSeries = (e.seriesId && e.seriesId === seriesId) || (e.id === id);
          const isFutureOrCurrent = e.date >= targetDate;
          const isActualized = Number(get().entryActuals[e.id] ?? e.actualAmount ?? 0) > 0;
          if (matchesSeries && isFutureOrCurrent && !isActualized) {
            return {
              ...e,
              ...updates,
              id: e.id,
              date: e.date, // keep original scheduled date
              seriesId,
            };
          }
          return e;
        });
        saveStorage(STORAGE_KEYS.entries, updated);
        set({ entries: updated });
        scheduleAutoDriveSync(get);
        return;
      }

      const updated = get().entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
      const updatedEntry = updated.find((e) => e.id === id);
      let finalEntries = updated;
      if (
        !options?.skipLoanScaling &&
        current &&
        updatedEntry &&
        current.type === 'income' &&
        current.loanId &&
        Number(updates.amount) > 0 &&
        Number(updates.amount) !== Number(current.amount)
      ) {
        const baseDisbursement = Number(current.initialAmount || current.amount || 1);
        const ratio = Number(updates.amount) / baseDisbursement;
        finalEntries = updated.map((entry) => {
          if (entry.id === id) {
            return { ...entry, initialAmount: baseDisbursement };
          }
          if (entry.loanId === current.loanId && entry.type === 'expense') {
            const baseRepayment = Number(entry.initialAmount || entry.amount);
            return {
              ...entry,
              amount: Math.round(baseRepayment * ratio * 100) / 100,
              initialAmount: baseRepayment,
            };
          }
          return entry;
        });

        const updatedInstallments = get().installments.map((inst) => {
          if (inst.loanId === current.loanId || inst.id === current.loanId) {
            const baseRep = Number(inst.initialAmount || inst.amount);
            return {
              ...inst,
              amount: Math.max(0.01, Math.round(baseRep * ratio * 100) / 100),
              initialAmount: baseRep,
            };
          }
          return inst;
        });
        if (updatedInstallments !== get().installments) {
          saveStorage(STORAGE_KEYS.installments, updatedInstallments);
          set({ installments: updatedInstallments });
        }
      }
      saveStorage(STORAGE_KEYS.entries, finalEntries);
      set({ entries: finalEntries });
      if (updates.actualAmount !== undefined) {
        const actuals = { ...get().entryActuals, [id]: updates.actualAmount };
        const dates = { ...get().entryActualDates, [id]: updates.actualDate || DateUtils.todayString() };
        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({ entryActuals: actuals, entryActualDates: dates });
      }
      if (updates.isClosed === true) {
        const currentActual = get().entryActuals[id] ?? updates.actualAmount ?? updates.amount ?? 0;
        get().settleJobForecastPayment(id, Number(currentActual) || 0, true);
      }
      scheduleAutoDriveSync(get);
    });
  },

  deleteEntry: (id, seriesMode = 'single', options) => {
    const inEntries = get().entries.find((e) => e.id === id);
    const inArchived = get().archivedEntries.find((e) => e.id === id);
    const target = inEntries || inArchived;
    const label = seriesMode === 'future'
      ? `Delete Series: ${target?.category || 'Entry'}`
      : `Delete: ${target?.category || 'Entry'}`;
    return get().runTransaction(label, () => {
      // 1. Series deletion
      let updatedEntries = get().entries;
      let updatedArchived = get().archivedEntries;

      if (seriesMode === 'future' && target && (target.seriesId || target.isRecurring)) {
        const seriesId = target.seriesId || id;
        const targetDate = target.date;
        updatedEntries = updatedEntries.filter((e) => {
          const matchesSeries = (e.seriesId && e.seriesId === seriesId) || (e.id === id);
          const isFutureOrCurrent = e.date >= targetDate;
          const isActualized = Number(get().entryActuals[e.id] ?? e.actualAmount ?? 0) > 0;
          return !(matchesSeries && isFutureOrCurrent && !isActualized);
        });
        updatedArchived = updatedArchived.filter((e) => {
          const matchesSeries = (e.seriesId && e.seriesId === seriesId) || (e.id === id);
          const isFutureOrCurrent = e.date >= targetDate;
          const isActualized = Number(get().entryActuals[e.id] ?? e.actualAmount ?? 0) > 0;
          return !(matchesSeries && isFutureOrCurrent && !isActualized);
        });
      } else {
        updatedEntries = updatedEntries.filter((e) => e.id !== id);
        updatedArchived = updatedArchived.filter((e) => e.id !== id);
      }

      // 2. Handle linked loans & installment plans
      const resolvedLinkedLoan = target ? resolveLinkedLoan(target, get().installments, get().entries) : undefined;
      const linkedLoanId = target?.loanId || resolvedLinkedLoan?.id;
      const shouldDeleteLinked = Boolean(
        linkedLoanId && (options?.deleteLinkedLoan !== undefined ? options.deleteLinkedLoan : false)
      );
      const shouldDeleteInstallmentPlan = Boolean(options?.deleteInstallmentPlan);
      if (shouldDeleteLinked && linkedLoanId) {
        updatedEntries = updatedEntries.filter(
          (e) => e.loanId !== linkedLoanId && e.id !== linkedLoanId && (!resolvedLinkedLoan || e.id !== resolvedLinkedLoan.id)
        );
        updatedArchived = updatedArchived.filter(
          (e) => e.loanId !== linkedLoanId && e.id !== linkedLoanId && (!resolvedLinkedLoan || e.id !== resolvedLinkedLoan.id)
        );
      }
      let updatedInstallments = shouldDeleteLinked && linkedLoanId
        ? get().installments.filter(
            (installment) =>
              installment.id !== linkedLoanId &&
              installment.loanId !== linkedLoanId &&
              (!resolvedLinkedLoan || installment.id !== resolvedLinkedLoan.id)
          )
        : get().installments;

      if (shouldDeleteInstallmentPlan) {
        updatedInstallments = updatedInstallments.filter((inst) => {
          if (id.includes(inst.id)) return false;
          if (target?.loanId && (inst.id === target.loanId || inst.loanId === target.loanId)) return false;
          if (target?.category && inst.name.toLowerCase().trim() === target.category.toLowerCase().trim()) return false;
          return true;
        });
      }

      // 3. If credit settlement entry, clean up manual lump payment and overrides
      const updatedOverrides = { ...get().creditSettlementOverrides };
      if (id.startsWith('credit-settlement-')) {
        const parts = id.split('-');
        const accountKey = parts[2];
        const monthKey = `${parts[3]}-${parts[4]}`;
        updatedEntries = updatedEntries.filter((e) => !(isLumpCreditDueForAccount(e, accountKey) && DateUtils.getMonthKey(e.date) === monthKey));
        updatedArchived = updatedArchived.filter((e) => !(isLumpCreditDueForAccount(e, accountKey) && DateUtils.getMonthKey(e.date) === monthKey));
        delete updatedOverrides[id];
      } else if (updatedOverrides[id]) {
        delete updatedOverrides[id];
      }

      // 4. Clean up entryActuals and entryActualDates
      const actuals = { ...get().entryActuals };
      delete actuals[id];
      const dates = { ...get().entryActualDates };
      delete dates[id];

      // 5. Track in deletedForecasts so virtual/calculated forecasts won't regenerate
      const deletedForecasts = get().deletedForecasts.includes(id)
        ? get().deletedForecasts
        : [...get().deletedForecasts, id];

      // 6. Clean up linked forecast scheduling or payments on any job
      const cleanJobForecast = (job: JobItem): JobItem => {
        let changed = false;
        let nextForecastEntryId = job.forecastEntryId;
        let nextForecastDueDate = job.forecastDueDate;
        let nextForecastAmount = job.forecastAmount;
        let nextForecastDestination = job.forecastDestination;
        let nextPayments = job.payments;

        if (job.forecastEntryId === id) {
          changed = true;
          nextForecastEntryId = undefined;
          nextForecastDueDate = undefined;
          nextForecastAmount = undefined;
          nextForecastDestination = undefined;
        }

        if (options?.syncJob !== false && job.payments && job.payments.some((p) => p.entryId === id || (target?.draws && target.draws.some((d) => d.id === p.id)))) {
          changed = true;
          nextPayments = job.payments.filter((p) => !(p.entryId === id || (target?.draws && target.draws.some((d) => d.id === p.id))));
        }

        if (changed) {
          const updatedJob: JobItem = {
            ...job,
            forecastEntryId: nextForecastEntryId,
            forecastDueDate: nextForecastDueDate,
            forecastAmount: nextForecastAmount,
            forecastDestination: nextForecastDestination,
            payments: nextPayments,
          };
          if (nextPayments !== job.payments) {
            const fin = calculateJobFinancials(updatedJob, get().rates);
            updatedJob.status = fin.computedStatus;
          }
          return updatedJob;
        }
        return job;
      };

      let asfJobsUpdated = false;
      const updatedAsf = get().asfJobs.map((j) => {
        const next = cleanJobForecast(j);
        if (next !== j) asfJobsUpdated = true;
        return next;
      });

      let irqJobsUpdated = false;
      const updatedIrq = get().irqJobs.map((j) => {
        const next = cleanJobForecast(j);
        if (next !== j) irqJobsUpdated = true;
        return next;
      });

      let partTimeJobsUpdated = false;
      const updatedPartTime = get().partTimeJobs.map((j) => {
        const next = cleanJobForecast(j);
        if (next !== j) partTimeJobsUpdated = true;
        return next;
      });

      // 7. Restore the foreign-currency leg of an FX-conversion entry, if selected.
      if (options?.restoreForeignAsset && target?.conversionType === 'fx-sale' && target.storageAssetId) {
        const sourceAsset = get().storageAssets.find((a) => a.id === target.storageAssetId);
        if (sourceAsset) {
          const restoreQty = Number(target.originalAmount) || 0;
          if (restoreQty > 0) {
            get().updateStorageAsset(sourceAsset.id, {
              quantity: (Number(sourceAsset.quantity) || 0) + restoreQty,
            });
          }
        }
      }

      // 8. Revert storage holding if selected
      if (options?.revertStorage && target) {
        const isNonDeductAcc = (acc?: string) => {
          if (!acc) return false;
          const clean = acc.trim().toLowerCase();
          return clean === 'none' || clean === 'unassigned' || clean === 'cash' || clean === "don't deposit" || clean === 'dont deposit';
        };
        if (Array.isArray(target.draws) && target.draws.length > 0) {
          target.draws.forEach((d) => {
            if (!isNonDeductAcc(d.account)) {
              revertStorageOrAccountBalance(get, {
                assetId: d.storageAssetId || options.storageAssetId,
                account: d.account || target.account,
                currency: target.currency,
                amount: Number(d.amount) || 0,
                isEgpAmount: true,
                fxRate: target.fxRateAtEntry,
                entryType: target.type,
              });
            }
          });
        } else {
          const actualAmt = Number(get().entryActuals[id] ?? target.actualAmount ?? target.amount ?? 0);
          if (!isNonDeductAcc(target.account)) {
            revertStorageOrAccountBalance(get, {
              assetId: options.storageAssetId,
              account: target.account,
              currency: target.currency,
              amount: actualAmt,
              isEgpAmount: true,
              fxRate: target.fxRateAtEntry,
              entryType: target.type,
            });
          }
        }
      }

      // 9. Persist
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      if (updatedInstallments !== get().installments) {
        saveStorage(STORAGE_KEYS.installments, updatedInstallments);
      }
      saveStorage(STORAGE_KEYS.creditSettlementOverrides, updatedOverrides);
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      saveStorage(STORAGE_KEYS.deletedForecasts, deletedForecasts);
      if (asfJobsUpdated) saveStorage(STORAGE_KEYS.asf, updatedAsf);
      if (irqJobsUpdated) saveStorage(STORAGE_KEYS.irq, updatedIrq);
      if (partTimeJobsUpdated) saveStorage(STORAGE_KEYS.partTimeJobs, updatedPartTime);

      set({
        entries: updatedEntries,
        archivedEntries: updatedArchived,
        installments: updatedInstallments,
        creditSettlementOverrides: updatedOverrides,
        entryActuals: actuals,
        entryActualDates: dates,
        deletedForecasts,
        asfJobs: updatedAsf,
        irqJobs: updatedIrq,
        partTimeJobs: updatedPartTime,
      });
      scheduleAutoDriveSync(get);
    });
  },

  recordActual: (entryId, amount, date, drawMeta) => {
    const entry = get().entries.find((e) => e.id === entryId) || get().archivedEntries.find((e) => e.id === entryId);
    const label = `Record Actual: ${entry?.category || 'Entry'}`;
    return get().runTransaction(label, () => {
      const actDate = date || DateUtils.todayString();
      const actuals = { ...get().entryActuals, [entryId]: amount };
      const dates = { ...get().entryActualDates };
      if (date) dates[entryId] = date;

      if (entryId.startsWith('credit-settlement-')) {
        const existingOverride = get().creditSettlementOverrides[entryId] || {};
        const settlementAcc = entryId.split('-')[2] || 'hsbc';
        const prevActual = Number(get().entryActuals[entryId] ?? 0);
        const tranche = amount > prevActual ? Math.round((amount - prevActual) * 100) / 100 : amount;

        let draws = Array.isArray(existingOverride.draws) ? [...existingOverride.draws] : [];
        if (draws.length === 0 && prevActual > 0) {
          draws.push({
            id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            date: actDate,
            amount: prevActual,
            tag: existingOverride.tag || 'Credit',
            account: existingOverride.account || settlementAcc,
          });
        }

        if (amount > prevActual) {
          if (tranche > 0) {
            draws.push({
              id: `draw-${Date.now()}-${draws.length}`,
              date: actDate,
              amount: tranche,
              tag: drawMeta?.tag || existingOverride.tag || 'Credit',
              account: drawMeta?.account || existingOverride.account || settlementAcc,
              note: drawMeta?.note,
            });
          }
        } else if (amount < prevActual) {
          if (amount === 0) {
            draws = [];
          } else if (draws.length > 0) {
            let needed = amount;
            const adjustedDraws: EntryDraw[] = [];
            for (const d of draws) {
              const dAmt = Number(d.amount) || 0;
              if (needed <= 0) break;
              if (dAmt <= needed) {
                adjustedDraws.push(d);
                needed -= dAmt;
              } else {
                adjustedDraws.push({ ...d, amount: Math.round(needed * 100) / 100 });
                needed = 0;
                break;
              }
            }
            draws = adjustedDraws;
          }
        }

        const updatedOverride = {
          ...existingOverride,
          actualPaid: amount,
          tag: drawMeta?.tag || existingOverride.tag || 'Credit',
          account: drawMeta?.account || existingOverride.account || settlementAcc,
          draws,
        };
        const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
        saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
        set({ creditSettlementOverrides: nextOverrides });
      }

      const existingIndex = get().entries.findIndex((e) => e.id === entryId);
      let updatedEntries = get().entries;
      let updatedArchived = get().archivedEntries;

      if (existingIndex !== -1) {
        const entry = get().entries[existingIndex];
        const prevActual = Number(get().entryActuals[entryId] ?? entry.actualAmount ?? 0);
        const tranche = amount > prevActual ? Math.round((amount - prevActual) * 100) / 100 : amount;

        let draws = Array.isArray(entry.draws) ? [...entry.draws] : [];
        if (draws.length === 0 && prevActual > 0) {
          draws.push({
            id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            date: entry.actualDate || entry.date || actDate,
            amount: prevActual,
            tag: entry.tag || '',
            account: entry.account || 'hsbc',
          });
        }

        if (amount > prevActual) {
          if (tranche > 0) {
            draws.push({
              id: `draw-${Date.now()}-${draws.length}`,
              date: actDate,
              amount: tranche,
              tag: drawMeta?.tag || entry.tag || '',
              account: drawMeta?.account || entry.account || 'hsbc',
              note: drawMeta?.note,
            });
          }
        } else if (amount < prevActual) {
          if (amount === 0) {
            draws = [];
          } else if (draws.length > 0) {
            let needed = amount;
            const adjustedDraws: EntryDraw[] = [];
            for (const d of draws) {
              const dAmt = Number(d.amount) || 0;
              if (needed <= 0) break;
              if (dAmt <= needed) {
                adjustedDraws.push(d);
                needed -= dAmt;
              } else {
                adjustedDraws.push({ ...d, amount: Math.round(needed * 100) / 100 });
                needed = 0;
                break;
              }
            }
            draws = adjustedDraws;
          }
        }

        const updatedEntry: CashEntry = {
          ...entry,
          actualAmount: amount,
          actualDate: actDate,
          draws,
        };
        updatedEntries = [...get().entries];
        updatedEntries[existingIndex] = updatedEntry;
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
      } else {
        const archivedIndex = get().archivedEntries.findIndex((e) => e.id === entryId);
        if (archivedIndex !== -1) {
          const entry = get().archivedEntries[archivedIndex];
          const prevActual = Number(get().entryActuals[entryId] ?? entry.actualAmount ?? 0);
          const tranche = amount > prevActual ? Math.round((amount - prevActual) * 100) / 100 : amount;

          let draws = Array.isArray(entry.draws) ? [...entry.draws] : [];
          if (draws.length === 0 && prevActual > 0) {
            draws.push({
              id: `draw-${Date.now()}-0`,
              date: entry.actualDate || entry.date || actDate,
              amount: prevActual,
              tag: entry.tag || '',
              account: entry.account || 'hsbc',
            });
          }

          if (amount > prevActual) {
            if (tranche > 0) {
              draws.push({
                id: `draw-${Date.now()}-${draws.length}`,
                date: actDate,
                amount: tranche,
                tag: drawMeta?.tag || entry.tag || '',
                account: drawMeta?.account || entry.account || 'hsbc',
                note: drawMeta?.note,
              });
            }
          } else if (amount < prevActual) {
            if (amount === 0) {
              draws = [];
            } else if (draws.length > 0) {
              let needed = amount;
              const adjustedDraws: EntryDraw[] = [];
              for (const d of draws) {
                const dAmt = Number(d.amount) || 0;
                if (needed <= 0) break;
                if (dAmt <= needed) {
                  adjustedDraws.push(d);
                  needed -= dAmt;
                } else {
                  adjustedDraws.push({ ...d, amount: Math.round(needed * 100) / 100 });
                  needed = 0;
                  break;
                }
              }
              draws = adjustedDraws;
            }
          }

          const updatedEntry: CashEntry = {
            ...entry,
            actualAmount: amount,
            actualDate: actDate,
            draws,
          };
          updatedArchived = [...get().archivedEntries];
          updatedArchived[archivedIndex] = updatedEntry;
          saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
        }
      }

      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({
        entries: updatedEntries,
        archivedEntries: updatedArchived,
        entryActuals: actuals,
        entryActualDates: dates,
      });
      get().settleJobForecastPayment(entryId, amount, false);
      scheduleAutoDriveSync(get);
    });
  },

  clearActual: (entryId, options) => {
    const target = get().entries.find((e) => e.id === entryId) || get().archivedEntries.find((e) => e.id === entryId);
    const label = `Clear Actual: ${target?.category || 'Entry'}`;
    return get().runTransaction(label, () => {
      const prevActualAmt = Number(get().entryActuals[entryId] ?? target?.actualAmount ?? target?.amount ?? 0);

      const actuals = { ...get().entryActuals };
      delete actuals[entryId];
      const dates = { ...get().entryActualDates };
      delete dates[entryId];

      if (entryId.startsWith('credit-settlement-')) {
        const settlementOverride = get().creditSettlementOverrides[entryId];
        if (settlementOverride && ((Array.isArray(settlementOverride.draws) && settlementOverride.draws.length > 0) || settlementOverride.isClosed)) {
          const nextOverrides: Record<string, CreditSettlementOverride> = {
            ...get().creditSettlementOverrides,
            [entryId]: { ...settlementOverride, draws: [], isClosed: false },
          };
          saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
          set({ creditSettlementOverrides: nextOverrides });
        }

        if (options?.revertStorage && prevActualAmt > 0) {
          const settlementAccountKey = entryId.split('-')[2] || 'hsbc';
          const isNonDeductAcc = (acc?: string) => {
            if (!acc) return false;
            const clean = acc.trim().toLowerCase();
            return clean === 'none' || clean === 'unassigned' || clean === 'cash' || clean === "don't deposit" || clean === 'dont deposit';
          };
          if (settlementOverride?.draws && settlementOverride.draws.length > 0) {
            settlementOverride.draws.forEach((d) => {
              const drawAcc = d.account || settlementOverride?.account || settlementAccountKey;
              if (!isNonDeductAcc(drawAcc)) {
                revertStorageOrAccountBalance(get, {
                  account: drawAcc,
                  currency: 'EGP',
                  amount: Number(d.amount) || 0,
                  isEgpAmount: true,
                  entryType: 'expense',
                });
              }
            });
          } else {
            const acc = settlementOverride?.account || settlementAccountKey;
            if (!isNonDeductAcc(acc)) {
              revertStorageOrAccountBalance(get, {
                account: acc,
                currency: 'EGP',
                amount: prevActualAmt,
                isEgpAmount: true,
                entryType: 'expense',
              });
            }
          }
        }

        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({ entryActuals: actuals, entryActualDates: dates });
        scheduleAutoDriveSync(get);
        return;
      }

      const keepDraws = options?.keepDraws === true;
      const existingDraws = (target && Array.isArray(target.draws)) ? target.draws : [];
      const drawsTotal = existingDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

      const existingIndex = get().entries.findIndex((e) => e.id === entryId);
      let updatedEntries = get().entries;
      if (existingIndex !== -1) {
        const entry = get().entries[existingIndex];
        const updatedEntry: CashEntry = {
          ...entry,
          actualAmount: keepDraws && drawsTotal > 0 ? drawsTotal : undefined,
          actualDate: keepDraws && existingDraws.length > 0
            ? (existingDraws.map((d) => d.date).filter(Boolean).sort().slice(-1)[0] || entry.actualDate || entry.date)
            : undefined,
          draws: keepDraws ? existingDraws : [],
          isClosed: false,
        };
        if (keepDraws && existingDraws.length > 0) {
          updatedEntry.keepOngoing = true;
        } else {
          delete updatedEntry.keepOngoing;
        }
        updatedEntries = [...get().entries];
        updatedEntries[existingIndex] = updatedEntry;
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
      }

      const archivedIndex = get().archivedEntries.findIndex((e) => e.id === entryId);
      let updatedArchived = get().archivedEntries;
      if (archivedIndex !== -1) {
        const entry = get().archivedEntries[archivedIndex];
        const updatedEntry: CashEntry = {
          ...entry,
          actualAmount: keepDraws && drawsTotal > 0 ? drawsTotal : undefined,
          actualDate: keepDraws && existingDraws.length > 0
            ? (existingDraws.map((d) => d.date).filter(Boolean).sort().slice(-1)[0] || entry.actualDate || entry.date)
            : undefined,
          draws: keepDraws ? existingDraws : [],
          isClosed: false,
        };
        if (keepDraws && existingDraws.length > 0) {
          updatedEntry.keepOngoing = true;
        } else {
          delete updatedEntry.keepOngoing;
        }
        updatedArchived = [...get().archivedEntries];
        updatedArchived[archivedIndex] = updatedEntry;
        saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      }

      if (keepDraws && existingDraws.length > 0) {
        if (drawsTotal > 0) actuals[entryId] = drawsTotal;
        const lastDrawDate = existingDraws.map((d) => d.date).filter(Boolean).sort().slice(-1)[0];
        if (lastDrawDate) dates[entryId] = lastDrawDate;
      }

      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({
        entries: updatedEntries,
        archivedEntries: updatedArchived,
        entryActuals: actuals,
        entryActualDates: dates,
      });

      if (keepDraws && existingDraws.length > 0) {
        scheduleAutoDriveSync(get);
        return;
      }

      let targetJob: JobItem | undefined = undefined;
      let jobType: 'partTime' | 'asf' | 'irq' = 'partTime';
      if (options?.syncJob !== false) {
        targetJob = get().partTimeJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
        if (!targetJob) {
          targetJob = get().asfJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
          if (targetJob) jobType = 'asf';
        }
        if (!targetJob) {
          targetJob = get().irqJobs.find((j) => j.forecastEntryId === entryId || j.payments?.some((p) => p.entryId === entryId));
          if (targetJob) jobType = 'irq';
        }

        if (targetJob) {
          const entry = target;
          const linkedPayment = targetJob.payments?.find((p) => p.entryId === entryId);

          if (options?.revertStorage !== false) {
            const isNoDeposit = (entry?.account || linkedPayment?.account || linkedPayment?.settlementAccount || '').toLowerCase().includes('no deposit') || (entry?.account || linkedPayment?.account || linkedPayment?.settlementAccount || '').toLowerCase().includes('recorded only');
            if (linkedPayment && linkedPayment.amount > 0 && !isNoDeposit) {
              const paidAmt = Number(linkedPayment.amount) || 0;
              const jobCurrency = (targetJob.currency || linkedPayment.currency || 'USD').toUpperCase();
              const isForeign = jobCurrency !== 'EGP';
              const dest = (targetJob.forecastDestination || '').trim();
              const accountField = (entry?.account || linkedPayment.account || linkedPayment.settlementAccount || '').toLowerCase().trim();

              if (options?.storageAssetId) {
                const existing = get().storageAssets.find((a) => a.id === options.storageAssetId);
                if (existing) {
                  get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
                }
              } else if (dest === 'storage:hsbc_usd' || (!dest && isForeign && jobCurrency === 'USD' && accountField.includes('hsbc')) || accountField.includes('hsbc_usd') || accountField.includes('hsbc usd')) {
                const existing = get().storageAssets.find((a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'USD');
                if (existing) {
                  get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
                }
              } else if (dest === 'storage:cash_usd' || (!dest && isForeign && jobCurrency === 'USD' && (accountField.includes('cash') || !accountField.includes('hsbc'))) || accountField.includes('cash_usd') || accountField.includes('usd cash')) {
                const existing = get().storageAssets.find((a) => a.name.toLowerCase().includes('cash') && a.unit.toUpperCase() === 'USD');
                if (existing) {
                  get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
                }
              } else if (dest === 'storage:hsbc_eur' || (!dest && isForeign && jobCurrency === 'EUR' && accountField.includes('hsbc')) || accountField.includes('hsbc_eur') || accountField.includes('hsbc eur')) {
                const existing = get().storageAssets.find((a) => a.name.toLowerCase().includes('hsbc') && a.unit.toUpperCase() === 'EUR');
                if (existing) {
                  get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
                }
              } else if (dest.startsWith('storage:existing-')) {
                const assetId = dest.replace('storage:existing-', '');
                const existing = get().storageAssets.find((a) => a.id === assetId);
                if (existing) {
                  get().updateStorageAsset(assetId, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
                }
              } else if (dest.startsWith('account:') || get().accounts[accountField]) {
                const accKey = dest.startsWith('account:') ? dest.replace('account:', '') : accountField;
                const egpAmt = linkedPayment.egpAmount || Math.round(paidAmt * (entry?.fxRateAtEntry || getCurrencyRateOr(get().rates, jobCurrency, 1)));
                if (get().accounts[accKey]) {
                  const currentBal = get().accounts[accKey].balance || 0;
                  get().updateAccountBalance(accKey, Math.max(0, currentBal - egpAmt));
                }
              } else if (isForeign) {
                const existing = get().storageAssets.find((a) => a.unit.toUpperCase() === jobCurrency);
                if (existing) {
                  get().updateStorageAsset(existing.id, { quantity: Math.max(0, (Number(existing.quantity) || 0) - paidAmt) });
                }
              }
            }
          }

          const remainingPayments = (targetJob.payments || []).filter((p) => p.entryId !== entryId);
          const remainingJob = { ...targetJob, payments: remainingPayments };
          const fin = calculateJobFinancials(remainingJob, get().rates);
          const totalPaid = remainingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

          let newStatus: JobItem['status'] = targetJob.status;
          if (remainingPayments.length === 0) {
            newStatus = 'invoiced';
          } else {
            newStatus = totalPaid >= fin.totalInvoice ? 'paid' : 'partial';
          }

          const updatedJob: JobItem = {
            ...targetJob,
            payments: remainingPayments,
            status: newStatus,
            forecastDueDate: entry?.date || targetJob.forecastDueDate || DateUtils.todayString(),
            forecastEntryId: entryId,
            forecastAmount: entry?.originalAmount || fin.remainingBalance || targetJob.forecastAmount,
            forecastDestination: targetJob.forecastDestination || (entry?.account ? `account:${entry.account}` : undefined),
          };

          get().saveJob(jobType, updatedJob);
        }
      }

      if (!targetJob && options?.revertStorage && target) {
        const isNonDeductAcc = (acc?: string) => {
          if (!acc) return false;
          const clean = acc.trim().toLowerCase();
          return clean === 'none' || clean === 'unassigned' || clean === 'cash' || clean === "don't deposit" || clean === 'dont deposit';
        };
        if (Array.isArray(target.draws) && target.draws.length > 0) {
          target.draws.forEach((d) => {
            if (!isNonDeductAcc(d.account)) {
              revertStorageOrAccountBalance(get, {
                assetId: d.storageAssetId || options.storageAssetId,
                account: d.account || target.account,
                currency: target.currency || 'EGP',
                amount: Number(d.amount) || 0,
                isEgpAmount: true,
                fxRate: target.fxRateAtEntry,
                entryType: target.type,
              });
            }
          });
        } else {
          if (!isNonDeductAcc(target.account)) {
            revertStorageOrAccountBalance(get, {
              assetId: options.storageAssetId,
              account: target.account,
              currency: target.currency || 'EGP',
              amount: prevActualAmt,
              isEgpAmount: true,
              fxRate: target.fxRateAtEntry,
              entryType: target.type,
            });
          }
        }
      }

      scheduleAutoDriveSync(get);
    });
  },

  addDraw: (entryId, draw) => {
    return get().runTransaction('Add Payment Tranche', () => {
      if (entryId.startsWith('credit-settlement-')) {
        const existingOverride = get().creditSettlementOverrides[entryId] || {};
        const newDraws = [
          ...(existingOverride.draws || []),
          { ...draw, id: draw.id || `draw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
        ];
        const totalAmount = Math.round(newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) * 100) / 100;
        const validDates = newDraws.map((d) => d.date).filter(Boolean).sort();
        const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : draw.date || DateUtils.todayString();
        const settlementAcc = entryId.split('-')[2] || 'hsbc';
        const updatedOverride = {
          ...existingOverride,
          draws: newDraws,
          tag: draw.tag || existingOverride.tag || 'Credit',
          account: draw.account || existingOverride.account || settlementAcc,
        };
        const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
        saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
        const actuals = { ...get().entryActuals, [entryId]: totalAmount };
        const dates = { ...get().entryActualDates, [entryId]: lastDate };
        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({
          creditSettlementOverrides: nextOverrides,
          entryActuals: actuals,
          entryActualDates: dates,
        });
        scheduleAutoDriveSync(get);
        return;
      }

      const inEntries = get().entries.findIndex((e) => e.id === entryId);
      const inArchived = get().archivedEntries.findIndex((e) => e.id === entryId);
      if (inEntries === -1 && inArchived === -1) return;

      const isArchived = inEntries === -1;
      const entry = isArchived ? get().archivedEntries[inArchived] : get().entries[inEntries];
      const newDraws = [
        ...(entry.draws || []),
        { ...draw, id: draw.id || `draw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
      ];
      const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const validDates = newDraws.map((d) => d.date).filter(Boolean).sort();
      const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : draw.date || DateUtils.todayString();
      const updatedEntry: CashEntry = {
        ...entry,
        actualAmount: totalAmount,
        actualDate: lastDate,
        draws: newDraws,
      };

      if (isArchived) {
        const updatedArchived = [...get().archivedEntries];
        updatedArchived[inArchived] = updatedEntry;
        saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
        set({ archivedEntries: updatedArchived });
      } else {
        const updatedEntries = [...get().entries];
        updatedEntries[inEntries] = updatedEntry;
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
        set({ entries: updatedEntries });
      }
      const actuals = { ...get().entryActuals, [entryId]: totalAmount };
      const dates = { ...get().entryActualDates, [entryId]: lastDate };
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({ entryActuals: actuals, entryActualDates: dates });
      get().settleJobForecastPayment(entryId, totalAmount, false);
      scheduleAutoDriveSync(get);
    });
  },

  updateDraw: (entryId, drawIndex, draw) => {
    return get().runTransaction('Update Payment Tranche', () => {
      if (entryId.startsWith('credit-settlement-')) {
        const existingOverride = get().creditSettlementOverrides[entryId] || {};
        const newDraws = [...(existingOverride.draws || [])];
        if (drawIndex >= 0 && drawIndex < newDraws.length) {
          newDraws[drawIndex] = { ...newDraws[drawIndex], ...draw };
        }
        const totalAmount = Math.round(newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) * 100) / 100;
        const validDates = newDraws.map((d) => d.date).filter(Boolean).sort();
        const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : DateUtils.todayString();
        const settlementAcc = entryId.split('-')[2] || 'hsbc';
        const updatedOverride = {
          ...existingOverride,
          draws: newDraws,
          tag: draw.tag || existingOverride.tag || 'Credit',
          account: draw.account || existingOverride.account || settlementAcc,
        };
        const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
        saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
        const actuals = { ...get().entryActuals, [entryId]: totalAmount };
        const dates = { ...get().entryActualDates, [entryId]: lastDate };
        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({
          creditSettlementOverrides: nextOverrides,
          entryActuals: actuals,
          entryActualDates: dates,
        });
        scheduleAutoDriveSync(get);
        return;
      }

      const inEntries = get().entries.findIndex((e) => e.id === entryId);
      const inArchived = get().archivedEntries.findIndex((e) => e.id === entryId);
      if (inEntries === -1 && inArchived === -1) return;

      const isArchived = inEntries === -1;
      const entry = isArchived ? get().archivedEntries[inArchived] : get().entries[inEntries];
      const newDraws = [...(entry.draws || [])];
      if (drawIndex >= 0 && drawIndex < newDraws.length) {
        newDraws[drawIndex] = { ...newDraws[drawIndex], ...draw };
      }
      const totalAmount = newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const validDates = newDraws.map((d) => d.date).filter(Boolean).sort();
      const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : entry.date || DateUtils.todayString();
      const updatedEntry: CashEntry = {
        ...entry,
        actualAmount: totalAmount,
        actualDate: lastDate,
        draws: newDraws,
      };

      if (isArchived) {
        const updatedArchived = [...get().archivedEntries];
        updatedArchived[inArchived] = updatedEntry;
        saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
        set({ archivedEntries: updatedArchived });
      } else {
        const updatedEntries = [...get().entries];
        updatedEntries[inEntries] = updatedEntry;
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
        set({ entries: updatedEntries });
      }
      const actuals = { ...get().entryActuals, [entryId]: totalAmount };
      const dates = { ...get().entryActualDates, [entryId]: lastDate };
      saveStorage(STORAGE_KEYS.entryActuals, actuals);
      saveStorage(STORAGE_KEYS.entryActualDates, dates);
      set({ entryActuals: actuals, entryActualDates: dates });
      get().settleJobForecastPayment(entryId, totalAmount, false);
      scheduleAutoDriveSync(get);
    });
  },

  deleteDraw: (entryId, drawIndex, options) => {
    return get().runTransaction('Delete Payment Tranche', () => {
      if (entryId.startsWith('credit-settlement-')) {
        const existingOverride = get().creditSettlementOverrides[entryId] || {};
        const newDraws = [...(existingOverride.draws || [])];
        let deletedDraw: EntryDraw | undefined;
        if (drawIndex >= 0 && drawIndex < newDraws.length) {
          deletedDraw = newDraws.splice(drawIndex, 1)[0];
        }
        const totalAmount = Math.round(newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) * 100) / 100;
        const validDates = newDraws.map((d) => d.date).filter(Boolean).sort();
        const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : DateUtils.todayString();
        const updatedOverride = {
          ...existingOverride,
          draws: newDraws,
        };
        const nextOverrides = { ...get().creditSettlementOverrides, [entryId]: updatedOverride };
        saveStorage(STORAGE_KEYS.creditSettlementOverrides, nextOverrides);
        const actuals = { ...get().entryActuals };
        const dates = { ...get().entryActualDates };
        if (totalAmount > 0) {
          actuals[entryId] = totalAmount;
          dates[entryId] = lastDate;
        } else {
          delete actuals[entryId];
          delete dates[entryId];
        }
        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({
          creditSettlementOverrides: nextOverrides,
          entryActuals: actuals,
          entryActualDates: dates,
        });

        if (options?.revertStorage && deletedDraw) {
          const settlementAcc = entryId.split('-')[2] || 'hsbc';
          revertStorageOrAccountBalance(get, {
            assetId: options.storageAssetId || deletedDraw.storageAssetId,
            account: deletedDraw.account || existingOverride.account || settlementAcc,
            currency: 'EGP',
            amount: deletedDraw.amount,
            isEgpAmount: true,
            entryType: 'expense',
          });
        }

        scheduleAutoDriveSync(get);
        return;
      }

      const inEntries = get().entries.findIndex((e) => e.id === entryId);
      const inArchived = get().archivedEntries.findIndex((e) => e.id === entryId);
      if (inEntries === -1 && inArchived === -1) return;

      const isArchived = inEntries === -1;
      const entry = isArchived ? get().archivedEntries[inArchived] : get().entries[inEntries];
      const newDraws = [...(entry.draws || [])];
      let deletedDraw: EntryDraw | undefined;
      if (drawIndex >= 0 && drawIndex < newDraws.length) {
        deletedDraw = newDraws.splice(drawIndex, 1)[0];
      }

      if (options?.updateCashflow !== false) {
        const totalAmount = Math.round(newDraws.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) * 100) / 100;
        const validDates = newDraws.map((d) => d.date).filter(Boolean).sort();
        const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : entry.date;
        const updatedEntry: CashEntry = {
          ...entry,
          actualAmount: totalAmount > 0 ? totalAmount : undefined,
          actualDate: totalAmount > 0 ? lastDate : undefined,
          draws: newDraws,
        };
        if (isArchived) {
          const updatedArchived = [...get().archivedEntries];
          updatedArchived[inArchived] = updatedEntry;
          saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
          set({ archivedEntries: updatedArchived });
        } else {
          const updatedEntries = [...get().entries];
          updatedEntries[inEntries] = updatedEntry;
          saveStorage(STORAGE_KEYS.entries, updatedEntries);
          set({ entries: updatedEntries });
        }

        const actuals = { ...get().entryActuals };
        const dates = { ...get().entryActualDates };
        if (totalAmount > 0) {
          actuals[entryId] = totalAmount;
          dates[entryId] = lastDate;
        } else {
          delete actuals[entryId];
          delete dates[entryId];
        }
        saveStorage(STORAGE_KEYS.entryActuals, actuals);
        saveStorage(STORAGE_KEYS.entryActualDates, dates);
        set({ entryActuals: actuals, entryActualDates: dates });

        if (options?.syncJob !== false) {
          get().settleJobForecastPayment(entryId, totalAmount, false);
        }
      }

      if (options?.revertStorage && deletedDraw) {
        revertStorageOrAccountBalance(get, {
          assetId: options.storageAssetId || deletedDraw.storageAssetId,
          account: deletedDraw.account || entry.account,
          currency: entry.currency || 'EGP',
          amount: deletedDraw.amount,
          isEgpAmount: true,
          fxRate: entry.fxRateAtEntry,
          entryType: entry.type,
        });
      }

      scheduleAutoDriveSync(get);
    });
  },

  updateSalaryPattern: (salaryPattern) => {
    return get().runTransaction('Update Salary Pattern', () => {
      saveStorage(STORAGE_KEYS.salary, salaryPattern);
      set({ salaryPattern });
      scheduleAutoDriveSync(get);
    });
  },

  setSalaryAnchorMonth: (salaryAnchorMonth) => {
    return get().runTransaction('Set Salary Forecast Anchor', () => {
      saveStorage(STORAGE_KEYS.salaryAnchor, salaryAnchorMonth);
      set({ salaryAnchorMonth });
      scheduleAutoDriveSync(get);
    });
  },

  populateSalaryForecast: (startMonth, quarters, anchorMonth) => {
    return get().runTransaction('Generate Salary Forecast', () => {
      const templates = buildSalaryEntries(
        get().salaryPattern,
        startMonth,
        Math.max(1, Number(quarters) || 1),
        anchorMonth || get().salaryAnchorMonth,
      );
      const currentEntries = [...get().entries];
      let added = 0;
      templates.forEach((template) => {
        const existing = currentEntries.find(
          (entry) =>
            entry.source === 'salary' &&
            entry.date === template.date &&
            entry.account === template.account &&
            entry.type === template.type,
        );
        if (existing) {
          const existingIndex = currentEntries.indexOf(existing);
          currentEntries[existingIndex] = {
            ...existing,
            amount: template.amount,
            category: template.category,
          };
        } else {
          currentEntries.push({
            ...template,
            id: `salary-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${added}`,
          });
          added += 1;
        }
      });
      saveStorage(STORAGE_KEYS.entries, currentEntries);
      set({ entries: currentEntries });
      scheduleAutoDriveSync(get);
      return added;
    });
  },

  clearSalaryForecast: (startMonth, quarters) => {
    return get().runTransaction('Clear Salary Forecast', () => {
      const hasActual = (entry: CashEntry) =>
        Number(get().entryActuals[entry.id] ?? entry.actualAmount ?? 0) > 0 ||
        Boolean(get().entryActualDates[entry.id] || entry.actualDate);
      const hasPeriod = Boolean(startMonth && quarters);
      const periodStart = hasPeriod ? `${startMonth}-01` : '';
      const [year, month] = hasPeriod ? (startMonth as string).split('-').map(Number) : [0, 0];
      const endMonthIndex = hasPeriod ? year * 12 + (month - 1) + Math.max(1, Number(quarters) || 1) * 3 : 0;
      const shouldRemove = (entry: CashEntry) => {
        const isSalary = entry.source === 'salary' || entry.category?.toLowerCase() === 'salary';
        if (!isSalary || hasActual(entry)) return false;
        if (!hasPeriod) return true;
        const entryMonth = entry.date.slice(0, 7);
        const [entryYear, entryMonthNumber] = entryMonth.split('-').map(Number);
        const entryMonthIndex = entryYear * 12 + (entryMonthNumber - 1);
        return entry.date >= periodStart && entryMonthIndex < endMonthIndex;
      };
      const removedIds = new Set(get().entries.filter(shouldRemove).map((entry) => entry.id));
      if (removedIds.size === 0) return 0;
      const updated = get().entries.filter((entry) => !removedIds.has(entry.id));
      saveStorage(STORAGE_KEYS.entries, updated);
      set({ entries: updated });
      scheduleAutoDriveSync(get);
      return removedIds.size;
    });
  },

  addInstallment: (instData) => {
    return get().runTransaction(`Add Installment: ${instData.name}`, () => {
      const newInst: Installment = {
        ...instData,
        id: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };
      const updated = [...get().installments, newInst];
      saveStorage(STORAGE_KEYS.installments, updated);
      set({ installments: updated });
      scheduleAutoDriveSync(get);
    });
  },

  updateInstallment: (id, updates) => {
    const current = get().installments.find((i) => i.id === id);
    return get().runTransaction(`Update Installment: ${current?.name || 'Installment'}`, () => {
      const updated = get().installments.map((i) => {
        if (i.id === id) {
          const preservedInitial = i.initialAmount !== undefined
            ? i.initialAmount
            : (updates.amount !== undefined && Number(updates.amount) !== Number(i.amount) ? i.amount : undefined);
          return {
            ...i,
            ...updates,
            ...(preservedInitial !== undefined ? { initialAmount: preservedInitial } : {}),
          };
        }
        return i;
      });
      saveStorage(STORAGE_KEYS.installments, updated);
      set({ installments: updated });
      scheduleAutoDriveSync(get);
    });
  },

  deleteInstallment: (id, options) => {
    const inst = get().installments.find((i) => i.id === id);
    return get().runTransaction(`Delete Installment: ${inst?.name || 'Installment'}`, () => {
      const updated = get().installments.filter((i) => i.id !== id);
      let updatedEntries = get().entries;
      let updatedArchived = get().archivedEntries;
      const updatedDeletedForecasts = get().deletedForecasts.filter(
        (df) => !df.startsWith(`installment-${id}-`) && df !== id
      );

      if (options?.deleteCashEntries && inst) {
        const matchKey = (inst.name || '').toLowerCase().trim();
        const matchLoanId = inst.loanId || inst.id;
        updatedEntries = updatedEntries.filter((e) => {
          if (e.loanId && (e.loanId === matchLoanId || e.loanId === inst.id)) return false;
          if (e.category && e.category.toLowerCase().trim() === matchKey) return false;
          return true;
        });
        updatedArchived = updatedArchived.filter((e) => {
          if (e.loanId && (e.loanId === matchLoanId || e.loanId === inst.id)) return false;
          if (e.category && e.category.toLowerCase().trim() === matchKey) return false;
          return true;
        });
      }

      saveStorage(STORAGE_KEYS.installments, updated);
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      saveStorage(STORAGE_KEYS.deletedForecasts, updatedDeletedForecasts);
      set({
        installments: updated,
        entries: updatedEntries,
        archivedEntries: updatedArchived,
        deletedForecasts: updatedDeletedForecasts,
      });
      scheduleAutoDriveSync(get);
    });
  },

  archiveSettledEntries: () => {
    return get().runTransaction('Archive Settled Transactions', () => {
      const currentYm = DateUtils.currentYearMonth();
      const toArchive: CashEntry[] = [];
      const remaining: CashEntry[] = [];

      get().entries.forEach((entry) => {
        const actAmount = Number(get().entryActuals[entry.id] ?? entry.actualAmount ?? 0);
        const effDate = entry.actualDate || entry.date || '';
        const entryMonth = effDate.slice(0, 7);

        const ongoing = isOngoingEntry(entry, get().entryActuals);
        if (actAmount > 0 && entryMonth < currentYm && !ongoing) {
          toArchive.push({
            ...entry,
            archivedAt: new Date().toISOString(),
          });
        } else {
          remaining.push(entry);
        }
      });

      if (toArchive.length === 0) return 0;

      const updatedArchived = [...get().archivedEntries, ...toArchive];
      saveStorage(STORAGE_KEYS.entries, remaining);
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      set({ entries: remaining, archivedEntries: updatedArchived });
      scheduleAutoDriveSync(get, true);
      return toArchive.length;
    });
  },

  unarchiveEntry: (id) => {
    const target = get().archivedEntries.find((e) => e.id === id);
    if (!target) return;
    return get().runTransaction(`Unarchive: ${target.category || 'Entry'}`, () => {
      const updatedArchived = get().archivedEntries.filter((e) => e.id !== id);
      const restoredEntry: CashEntry = { ...target };
      delete restoredEntry.archivedAt;
      const updatedEntries = [restoredEntry, ...get().entries];
      saveStorage(STORAGE_KEYS.entries, updatedEntries);
      saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
      set({ entries: updatedEntries, archivedEntries: updatedArchived });
      scheduleAutoDriveSync(get, true);
    });
  },

  autoTagEntries: () => {
    return get().runTransaction('Auto-Tag Entries', () => {
      const state = get();
      let count = 0;

      const upgradeTag = (entry: CashEntry): { newTag: string | undefined; changed: boolean } => {
        let newTag = entry.tag;
        const lower = (newTag || '').toLowerCase().trim();
        let changed = false;
        if (!lower || lower === 'credit' || lower === 'credit card' || lower === 'card spend') {
          const inferred = inferTag(entry);
          if (inferred && inferred !== newTag) {
            newTag = inferred;
            changed = true;
          }
        }
        if (isCreditSettlementRow(entry) && !((newTag || '').toLowerCase().includes('credit settlement'))) {
          newTag = newTag ? `${newTag}, Credit Settlement` : 'Credit Settlement';
          changed = true;
        } else if (isCreditCardExpense(entry) && !((newTag || '').toLowerCase().includes('credit swipes'))) {
          newTag = newTag ? `${newTag}, Credit Swipes` : 'Credit Swipes';
          changed = true;
        }
        return { newTag, changed };
      };

      const updatedEntries = state.entries.map((entry) => {
        const { newTag, changed } = upgradeTag(entry);
        let entryChanged = changed;
        if (changed) count += 1;
        let updatedDraws = entry.draws;
        if (entry.draws && entry.draws.length > 0 && newTag) {
          const hasUntagged = entry.draws.some((d) => !d.tag || !d.tag.trim());
          if (hasUntagged) {
            entryChanged = true;
            updatedDraws = entry.draws.map((d) => (!d.tag || !d.tag.trim() ? { ...d, tag: newTag } : d));
          }
        }
        return entryChanged ? { ...entry, tag: newTag, draws: updatedDraws } : entry;
      });

      const updatedArchived = state.archivedEntries.map((entry) => {
        const { newTag, changed } = upgradeTag(entry);
        let entryChanged = changed;
        if (changed) count += 1;
        let updatedDraws = entry.draws;
        if (entry.draws && entry.draws.length > 0 && newTag) {
          const hasUntagged = entry.draws.some((d) => !d.tag || !d.tag.trim());
          if (hasUntagged) {
            entryChanged = true;
            updatedDraws = entry.draws.map((d) => (!d.tag || !d.tag.trim() ? { ...d, tag: newTag } : d));
          }
        }
        return entryChanged ? { ...entry, tag: newTag, draws: updatedDraws } : entry;
      });

      let overridesChanged = false;
      const updatedOverrides = { ...state.creditSettlementOverrides };
      Object.entries(updatedOverrides).forEach(([id, override]) => {
        const tagLower = (override.tag || '').toLowerCase().trim();
        if (!tagLower || tagLower === 'credit' || tagLower === 'credit card') {
          updatedOverrides[id] = { ...override, tag: 'Credit Settlement' };
          overridesChanged = true;
          count += 1;
        }
      });

      const updatedInstallments = state.installments.map((installment) => {
        if (installment.tag?.trim()) return installment;
        count += 1;
        return { ...installment, tag: inferTag({ category: installment.name, source: 'installment' }) || 'Installment' };
      });

      if (count > 0 || overridesChanged) {
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
        saveStorage(STORAGE_KEYS.archivedEntries, updatedArchived);
        saveStorage(STORAGE_KEYS.installments, updatedInstallments);
        if (overridesChanged) {
          saveStorage(STORAGE_KEYS.creditSettlementOverrides, updatedOverrides);
        }
        set({
          entries: updatedEntries,
          archivedEntries: updatedArchived,
          installments: updatedInstallments,
          ...(overridesChanged ? { creditSettlementOverrides: updatedOverrides } : {}),
        });
        scheduleAutoDriveSync(get);
      }
      return count;
    });
  },

  restoreDeletedForecast: (id) => {
    return get().runTransaction('Restore Forecast Entry', () => {
      const updated = get().deletedForecasts.filter((fId) => fId !== id);
      saveStorage(STORAGE_KEYS.deletedForecasts, updated);
      set({ deletedForecasts: updated });
      scheduleAutoDriveSync(get);
    });
  },

  clearAllDeletedForecasts: () => {
    return get().runTransaction('Clear All Deleted Forecasts', () => {
      saveStorage(STORAGE_KEYS.deletedForecasts, []);
      set({ deletedForecasts: [] });
      scheduleAutoDriveSync(get);
    });
  },

  linkRecurringSeries: (entryIds, customSeriesId) => {
    return get().runTransaction('Link Recurring Series', () => {
      const { updatedEntries, seriesId, modifiedCount } = linkEntriesToSeries(
        get().entries,
        entryIds,
        customSeriesId
      );
      if (modifiedCount > 0) {
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
        set({ entries: updatedEntries });
        scheduleAutoDriveSync(get);
      }
      return { seriesId, modifiedCount };
    });
  },

  unlinkRecurringSeries: (seriesId) => {
    return get().runTransaction('Unlink Recurring Series', () => {
      const { updatedEntries, modifiedCount } = unlinkEntriesFromSeries(get().entries, seriesId);
      if (modifiedCount > 0) {
        saveStorage(STORAGE_KEYS.entries, updatedEntries);
        set({ entries: updatedEntries });
        scheduleAutoDriveSync(get);
      }
      return modifiedCount;
    });
  },

  autoLinkAllRecurringCandidates: () => {
    return get().runTransaction('Auto-Link Recurring Candidates', () => {
      const candidateGroups = detectRecurringCandidateGroups(get().entries, get().entryActuals);
      let currentEntries = get().entries;
      let linkedGroupsCount = 0;
      let modifiedEntriesCount = 0;

      candidateGroups.forEach((group) => {
        if (!group.isFullyLinked) {
          const res = linkEntriesToSeries(currentEntries, group.entryIds, group.existingSeriesId);
          if (res.modifiedCount > 0) {
            currentEntries = res.updatedEntries;
            linkedGroupsCount++;
            modifiedEntriesCount += res.modifiedCount;
          }
        }
      });

      if (modifiedEntriesCount > 0) {
        saveStorage(STORAGE_KEYS.entries, currentEntries);
        set({ entries: currentEntries });
        scheduleAutoDriveSync(get);
      }

      return { linkedGroupsCount, modifiedEntriesCount };
    });
  },
});
