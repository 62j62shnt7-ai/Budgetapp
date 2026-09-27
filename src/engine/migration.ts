import type {
  CashEntry,
  AccountBalance,
  SalaryPayment,
  Installment,
  RatesData,
  StorageAsset,
  JobItem,
} from '../types';
import { DateUtils } from './dateUtils';
import { inferTag } from '../store/useBudgetStore';

export interface MigratedBudgetDataset {
  schemaVersion: string;
  migratedAt: string;
  exportedAt?: string;
  entries: CashEntry[];
  archivedEntries: CashEntry[];
  accounts: Record<string, AccountBalance>;
  salaryPattern: SalaryPayment[];
  salaryAnchorMonth: string;
  installments: Installment[];
  rates: RatesData;
  storageAssets: StorageAsset[];
  asfJobs: JobItem[];
  irqJobs: JobItem[];
  partTimeJobs: JobItem[];
  entryActuals: Record<string, number>;
  entryActualDates: Record<string, string>;
  creditDues: Record<string, Record<string, number>>;
  creditDueMonths: Record<string, string[]>;
  creditSettlementOverrides: Record<string, { amount?: number; date?: string; note?: string }>;
  deletedForecasts: string[];
}

const defaultAccounts: Record<string, AccountBalance> = {
  cib: { name: 'CIB', balance: 0, maturityDay: 15 },
  hsbc: { name: 'HSBC', balance: 0, maturityDay: 30 },
};

const defaultSalaryPattern: SalaryPayment[] = [
  { monthOffset: 0, day: 15, amount: 0 },
  { monthOffset: 0, day: 30, amount: 0 },
  { monthOffset: 1, day: 15, amount: 0 },
  { monthOffset: 1, day: 30, amount: 0 },
  { monthOffset: 2, day: 15, amount: 0 },
  { monthOffset: 2, day: 30, amount: 0 },
];

const defaultRates: RatesData = {
  currencies: [
    { name: 'USD', buy: 48.5, sell: 48.6 },
    { name: 'EUR', buy: 52.0, sell: 52.2 },
    { name: 'SAR', buy: 12.9, sell: 13.0 },
    { name: 'AED', buy: 13.2, sell: 13.3 },
  ],
  gold: [
    { name: '24K', buy: 4100, sell: 4150 },
    { name: '21K', buy: 3600, sell: 3650 },
    { name: '18K', buy: 3080, sell: 3120 },
  ],
};

export function migrateBackupPayload(raw: unknown): MigratedBudgetDataset {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid payload: expected an object or array');
  }

  // Handle raw entry array backup
  if (Array.isArray(raw)) {
    const entries: CashEntry[] = raw.map((e, idx) => ({
      ...e,
      id: e.id || `entry-import-${Date.now()}-${idx}`,
      date: typeof e.date === 'string' && e.date.length >= 10 ? e.date.slice(0, 10) : DateUtils.todayString(),
      amount: Number(e.amount) || 0,
      type: e.type === 'income' ? 'income' : 'expense',
      category: e.category || 'General',
      account: e.account === 'cash' ? 'cib' : (e.account || 'cib'),
      tag: e.tag || inferTag(e) || '',
      actualAmount: e.actualAmount !== undefined && e.actualAmount !== '' ? Number(e.actualAmount) : undefined,
    }));

    return {
      schemaVersion: '2.1',
      migratedAt: new Date().toISOString(),
      entries,
      archivedEntries: [],
      accounts: defaultAccounts,
      salaryPattern: defaultSalaryPattern,
      salaryAnchorMonth: DateUtils.currentYearMonth(),
      installments: [],
      rates: defaultRates,
      storageAssets: [],
      asfJobs: [],
      irqJobs: [],
      partTimeJobs: [],
      entryActuals: {},
      entryActualDates: {},
      creditDues: {},
      creditDueMonths: {},
      creditSettlementOverrides: {},
      deletedForecasts: [],
    };
  }

  const parsed = raw as Record<string, any>;
  const data = (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
    ? parsed.data
    : parsed;

  const exportedAt = typeof parsed.exportedAt === 'string'
    ? parsed.exportedAt
    : typeof data.exportedAt === 'string'
      ? data.exportedAt
      : undefined;

  // 1. Cash Entries
  const rawEntries = data.cashEntries || data.entries || data.items || parsed.cashEntries || parsed.entries || [];
  const entries: CashEntry[] = (Array.isArray(rawEntries) ? rawEntries : []).map((e: any, idx: number) => ({
    ...e,
    id: e.id || `entry-${Date.now()}-${idx}`,
    date: typeof e.date === 'string' && e.date.length >= 10 ? e.date.slice(0, 10) : DateUtils.todayString(),
    amount: Number(e.amount) || 0,
    type: e.type === 'income' ? 'income' : 'expense',
    category: e.category || 'General',
    account: e.account === 'cash' ? 'cib' : (e.account || 'cib'),
    tag: e.tag || inferTag(e) || '',
    currency: e.currency || 'EGP',
    actualAmount: e.actualAmount !== undefined && e.actualAmount !== '' ? Number(e.actualAmount) : undefined,
    actualDate: typeof e.actualDate === 'string' ? e.actualDate.slice(0, 10) : undefined,
  }));

  // 2. Archived Entries
  const rawArchived = data.archivedEntries || parsed.archivedEntries || [];
  const archivedEntries: CashEntry[] = (Array.isArray(rawArchived) ? rawArchived : []).map((e: any, idx: number) => ({
    ...e,
    id: e.id || `archived-${Date.now()}-${idx}`,
    date: typeof e.date === 'string' && e.date.length >= 10 ? e.date.slice(0, 10) : DateUtils.todayString(),
    amount: Number(e.amount) || 0,
    type: e.type === 'income' ? 'income' : 'expense',
    category: e.category || 'General',
    account: e.account === 'cash' ? 'cib' : (e.account || 'cib'),
    currency: e.currency || 'EGP',
    actualAmount: Number(e.actualAmount) || Number(e.amount) || 0,
    archivedAt: e.archivedAt || new Date().toISOString(),
  }));

  // 3. Accounts
  const rawAccounts = data.accountBalances || data.accounts || parsed.accountBalances || parsed.accounts;
  let accounts: Record<string, AccountBalance> = defaultAccounts;
  if (rawAccounts && typeof rawAccounts === 'object') {
    const accMap: Record<string, AccountBalance> = {};
    for (const [k, v] of Object.entries(rawAccounts)) {
      if (k === 'cash') continue; // omit legacy cash pool
      if (v && typeof v === 'object' && 'balance' in (v as any)) {
        accMap[k] = {
          name: (v as any).name || k.toUpperCase(),
          balance: Number((v as any).balance) || 0,
          maturityDay: Number((v as any).maturityDay) || (k.toLowerCase().includes('hsbc') ? 30 : 15),
        };
      } else if (typeof v === 'number') {
        accMap[k] = {
          name: k.toUpperCase(),
          balance: v,
          maturityDay: k.toLowerCase().includes('hsbc') ? 30 : 15,
        };
      }
    }
    if (Object.keys(accMap).length > 0) {
      accounts = accMap;
    }
  }

  // 4. Salary Pattern
  const rawSalary = data.salaryPattern || parsed.salaryPattern;
  let salaryPattern: SalaryPayment[] = defaultSalaryPattern;
  if (Array.isArray(rawSalary) && rawSalary.length > 0) {
    salaryPattern = rawSalary.map((s: any) => ({
      monthOffset: Number(s.monthOffset) || 0,
      day: Number(s.day) || 15,
      amount: Number(s.amount) || 0,
    }));
  }

  // 5. Installments
  const rawInstallments = data.installments || parsed.installments;
  let installments: Installment[] = [];
  if (Array.isArray(rawInstallments)) {
    installments = rawInstallments.map((inst: any, idx: number) => ({
      ...inst,
      id: inst.id || `inst-${Date.now()}-${idx}`,
      name: inst.name || inst.item || 'Installment',
      amount: Number(inst.amount) || Number(inst.monthlyAmount) || 0,
      totalMonths: Number(inst.totalMonths) || Number(inst.months) || Number(inst.installmentsCount) || 1,
      remainingMonths: Number(inst.remainingMonths) || Number(inst.totalMonths) || Number(inst.months) || 1,
      startMonth: inst.startMonth || DateUtils.currentYearMonth(),
      day: Number(inst.day) || 10,
      account: inst.account === 'cash' ? 'cib' : (inst.account || 'cib'),
    }));
  }

  // 6. Rates
  const rawRates = data.ratesData || data.rates || parsed.ratesData || parsed.rates;
  let rates: RatesData = defaultRates;
  if (rawRates && typeof rawRates === 'object') {
    rates = {
      currencies: Array.isArray(rawRates.currencies) && rawRates.currencies.length > 0 ? rawRates.currencies : defaultRates.currencies,
      gold: Array.isArray(rawRates.gold) && rawRates.gold.length > 0 ? rawRates.gold : defaultRates.gold,
      lastFetched: typeof rawRates.lastFetched === 'string' ? rawRates.lastFetched : undefined,
      currenciesLastFetched: typeof rawRates.currenciesLastFetched === 'string' ? rawRates.currenciesLastFetched : undefined,
      goldLastFetched: typeof rawRates.goldLastFetched === 'string' ? rawRates.goldLastFetched : undefined,
      previousStorageTotal: typeof rawRates.previousStorageTotal === 'number' ? rawRates.previousStorageTotal : undefined,
    };
  }

  // 7. Storage Assets
  const rawStorage = data.storageAssets || data.storage || parsed.storageAssets || parsed.storage;
  const storageAssets: StorageAsset[] = Array.isArray(rawStorage)
    ? rawStorage.map((a: any, idx: number) => ({
        id: a.id || `asset-${Date.now()}-${idx}`,
        name: a.name || 'Asset',
        category: a.category || a.type || 'gold',
        quantity: Number(a.quantity) || Number(a.amount) || 1,
        unit: a.unit || (a.category === 'gold' || a.type === 'gold' ? 'g' : 'units'),
        buyPrice: Number(a.buyPrice) || Number(a.buyRate) || Number(a.value) || 0,
        currentPrice: a.currentPrice !== undefined ? Number(a.currentPrice) : undefined,
        currency: a.currency || 'EGP',
        rate: Number(a.rate) || undefined,
        rateSource: a.rateSource || a.karat,
        notes: a.notes,
      }))
    : [];

  // 8. Jobs
  const asfJobs: JobItem[] = Array.isArray(data.asfJobs || parsed.asfJobs) ? (data.asfJobs || parsed.asfJobs) : [];
  const irqJobs: JobItem[] = Array.isArray(data.irqJobs || parsed.irqJobs) ? (data.irqJobs || parsed.irqJobs) : [];
  const partTimeJobs: JobItem[] = Array.isArray(data.partTimeJobs || parsed.partTimeJobs) ? (data.partTimeJobs || parsed.partTimeJobs) : [];

  // 9. Actuals Maps & Overrides
  const rawActuals = data.entryActuals || parsed.entryActuals || {};
  const entryActuals: Record<string, number> = {};
  if (typeof rawActuals === 'object') {
    for (const [k, v] of Object.entries(rawActuals)) {
      if (v !== undefined && v !== null && !isNaN(Number(v))) {
        entryActuals[k] = Number(v);
      }
    }
  }

  const rawActualDates = data.entryActualDates || parsed.entryActualDates || {};
  const entryActualDates: Record<string, string> = {};
  if (typeof rawActualDates === 'object') {
    for (const [k, v] of Object.entries(rawActualDates)) {
      if (typeof v === 'string') {
        entryActualDates[k] = v.slice(0, 10);
      }
    }
  }

  const rawCreditDues = data.creditDues || parsed.creditDues;
  const creditDues = rawCreditDues && typeof rawCreditDues === 'object' ? rawCreditDues : {};

  const rawCreditDueMonths = data.creditDueMonths || parsed.creditDueMonths;
  const creditDueMonths = rawCreditDueMonths && typeof rawCreditDueMonths === 'object' ? rawCreditDueMonths : {};

  const rawSettlementOverrides = data.creditSettlementOverrides || parsed.creditSettlementOverrides;
  const creditSettlementOverrides = rawSettlementOverrides && typeof rawSettlementOverrides === 'object' ? rawSettlementOverrides : {};

  const rawSalaryAnchor = data.salaryAnchorMonth || parsed.salaryAnchorMonth;
  const salaryAnchorMonth = typeof rawSalaryAnchor === 'string' ? rawSalaryAnchor : DateUtils.currentYearMonth();

  const deletedForecasts = Array.isArray(data.deletedForecasts || parsed.deletedForecasts)
    ? (data.deletedForecasts || parsed.deletedForecasts)
    : [];

  // Auto-reconcile & link entities together for smooth affected tracking
  const allMigratedJobs = [...partTimeJobs, ...asfJobs, ...irqJobs];
  for (const job of allMigratedJobs) {
    const jTitle = (job.title || '').toLowerCase().trim();
    const jClient = (job.client || '').toLowerCase().trim();

    if (job.payments && job.payments.length > 0) {
      for (const p of job.payments) {
        if (!p.entryId) {
          const matchingEntry = entries.find((e) =>
            e.type === 'income' &&
            (e.amount === p.amount || e.amount === p.egpAmount || (e.draws && e.draws.some((d) => d.amount === p.amount || d.id === p.id))) &&
            ((jTitle && (e.category?.toLowerCase() === jTitle || e.subcategory?.toLowerCase() === jTitle || e.source?.toLowerCase().includes(jTitle))) ||
             (jClient && (e.category?.toLowerCase() === jClient || e.subcategory?.toLowerCase() === jClient || e.source?.toLowerCase().includes(jClient))))
          );
          if (matchingEntry) {
            p.entryId = matchingEntry.id;
            if (!matchingEntry.jobId) matchingEntry.jobId = job.id;
          }
        } else {
          const entry = entries.find((e) => e.id === p.entryId);
          if (entry && !entry.jobId) {
            entry.jobId = job.id;
          }
        }
      }
    }
    if (job.forecastEntryId) {
      const fe = entries.find((e) => e.id === job.forecastEntryId);
      if (fe && !fe.jobId) {
        fe.jobId = job.id;
      }
    }
  }

  for (const inst of installments) {
    const instName = (inst.name || '').toLowerCase().trim();
    if (!instName) continue;
    for (const e of entries) {
      if (!e.loanId) {
        const cat = (e.category || '').toLowerCase().trim();
        const sub = (e.subcategory || '').toLowerCase().trim();
        const note = (e.note || '').toLowerCase().trim();
        const src = (e.source || '').toLowerCase().trim();
        if (cat === instName || sub === instName || note.includes(instName) || src.includes(instName) || e.id.includes(inst.id)) {
          e.loanId = inst.id;
        }
      }
    }
  }

  return {
    schemaVersion: '2.1',
    migratedAt: new Date().toISOString(),
    exportedAt,
    entries,
    archivedEntries,
    accounts,
    salaryPattern,
    salaryAnchorMonth,
    installments,
    rates,
    storageAssets,
    asfJobs,
    irqJobs,
    partTimeJobs,
    entryActuals,
    entryActualDates,
    creditDues,
    creditDueMonths,
    creditSettlementOverrides,
    deletedForecasts,
  };
}
