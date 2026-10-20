import type {
  CreditSettlementOverride,
  CashEntry,
  AccountBalance,
  SalaryPayment,
  Installment,
  RatesData,
  StorageAsset,
  JobItem,
} from '../types';
import { DateUtils } from './dateUtils';
import { inferTag } from './tags';
import { defaultRates as currencyDefaultRates, inferAssetLocation, normalizeCurrencyCode } from './currency';

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
  creditSettlementOverrides: Record<string, CreditSettlementOverride>;
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

// Reuse the single source of truth for fallback rates so migrated/legacy
// backups are seeded with the same currencies and gold names as the app.
const defaultRates: RatesData = currencyDefaultRates;

/** Major schema version this migration pipeline produces and understands. */
export const CURRENT_SCHEMA_MAJOR = '2';
export const CURRENT_SCHEMA_VERSION = `${CURRENT_SCHEMA_MAJOR}.1`;

/** Payload keys that carry real financial data (used to tell an empty backup from a wrong-shaped file). */
const FINANCIAL_PAYLOAD_KEYS = [
  'entries', 'cashEntries', 'items', 'archivedEntries', 'accountBalances', 'accounts',
  'salaryPattern', 'installments', 'rates', 'ratesData', 'storageAssets', 'storage',
  'asfJobs', 'irqJobs', 'partTimeJobs', 'entryActuals', 'creditDues',
] as const;

/**
 * Parse a stored money value.
 *
 * Exports and hand-edited backups routinely contain thousands separators
 * (`"1,500"`), which `Number()` turns into `NaN`. Returning `undefined` for an
 * unreadable value lets each call site apply its own fallback instead of
 * silently writing `0` over a real amount.
 */
export function parseMoneyValue(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\s,]/g, '').trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Parse a count/quantity, treating blank values as `0`. */
function parseCount(value: unknown): number {
  return parseMoneyValue(value) ?? 0;
}

/**
 * Read the schema version from a payload, checking the wrapper first and then
 * an embedded `data` object. Returns `undefined` for pre-versioning backups.
 */
function readSchemaVersion(payload: Record<string, unknown>, data: Record<string, unknown>): string | undefined {
  for (const candidate of [payload.schemaVersion, payload.version, data.schemaVersion, data.version]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return undefined;
}

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
      schemaVersion: CURRENT_SCHEMA_VERSION,
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

  const parsed = raw as Record<string, unknown>;
  const data = (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
    ? (parsed.data as Record<string, unknown>)
    : parsed;

  const exportedAt = typeof parsed.exportedAt === 'string'
    ? parsed.exportedAt
    : typeof data.exportedAt === 'string'
      ? data.exportedAt
      : undefined;

  // 0. Version gate. Reject payloads from an incompatible major version rather
  // than coercing unknown shapes into this one, which would silently replace the
  // user's ledger with zeroed/garbage fields.
  const sourceVersion = readSchemaVersion(parsed, data);
  if (sourceVersion && sourceVersion.split('.')[0] !== CURRENT_SCHEMA_MAJOR) {
    throw new Error(
      `Unsupported backup schema version "${sourceVersion}" — this build reads version ${CURRENT_SCHEMA_MAJOR}.x. ` +
      'Update the app before importing this backup.'
    );
  }

  // 1. Cash Entries
  const rawEntries = data.cashEntries || data.entries || data.items || parsed.cashEntries || parsed.entries || [];
  const entries: CashEntry[] = (Array.isArray(rawEntries) ? rawEntries : []).map((rawItem: unknown, idx: number) => {
    const e = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
    return {
      ...(e as unknown as Partial<CashEntry>),
      id: typeof e.id === 'string' && e.id ? e.id : `entry-${Date.now()}-${idx}`,
      date: typeof e.date === 'string' && e.date.length >= 10 ? e.date.slice(0, 10) : DateUtils.todayString(),
      amount: parseMoneyValue(e.amount) ?? 0,
      type: (e.type === 'income' ? 'income' : 'expense') as 'income' | 'expense',
      category: typeof e.category === 'string' ? e.category : 'General',
      account: e.account === 'cash' ? 'cib' : (typeof e.account === 'string' ? e.account : 'cib'),
      tag: typeof e.tag === 'string' ? e.tag : (inferTag(e as unknown as CashEntry) || ''),
      currency: normalizeCurrencyCode(typeof e.currency === 'string' ? e.currency : undefined) || 'EGP',
      actualAmount: parseMoneyValue(e.actualAmount),
      actualDate: typeof e.actualDate === 'string' ? e.actualDate.slice(0, 10) : undefined,
    };
  });

  // 2. Archived Entries
  const rawArchived = data.archivedEntries || parsed.archivedEntries || [];
  const archivedEntries: CashEntry[] = (Array.isArray(rawArchived) ? rawArchived : []).map((rawItem: unknown, idx: number) => {
    const e = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
    return {
      ...(e as unknown as Partial<CashEntry>),
      id: typeof e.id === 'string' && e.id ? e.id : `archived-${Date.now()}-${idx}`,
      date: typeof e.date === 'string' && e.date.length >= 10 ? e.date.slice(0, 10) : DateUtils.todayString(),
      amount: parseMoneyValue(e.amount) ?? 0,
      type: (e.type === 'income' ? 'income' : 'expense') as 'income' | 'expense',
      category: typeof e.category === 'string' ? e.category : 'General',
      account: e.account === 'cash' ? 'cib' : (typeof e.account === 'string' ? e.account : 'cib'),
      currency: normalizeCurrencyCode(typeof e.currency === 'string' ? e.currency : undefined) || 'EGP',
      actualAmount: parseMoneyValue(e.actualAmount) ?? parseMoneyValue(e.amount) ?? 0,
      archivedAt: typeof e.archivedAt === 'string' ? e.archivedAt : new Date().toISOString(),
    };
  });

  // 3. Accounts
  const rawAccounts = data.accountBalances || data.accounts || parsed.accountBalances || parsed.accounts;
  let accounts: Record<string, AccountBalance> = defaultAccounts;
  if (rawAccounts && typeof rawAccounts === 'object') {
    const accMap: Record<string, AccountBalance> = {};
    for (const [k, v] of Object.entries(rawAccounts)) {
      if (k === 'cash') continue; // omit legacy cash pool
      const accRecord = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
      if (accRecord && 'balance' in accRecord) {
        accMap[k] = {
          name: typeof accRecord.name === 'string' ? accRecord.name : k.toUpperCase(),
          balance: parseMoneyValue(accRecord.balance) ?? 0,
          maturityDay: parseCount(accRecord.maturityDay) || (k.toLowerCase().includes('hsbc') ? 30 : 15),
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
    salaryPattern = rawSalary.map((rawItem: unknown) => {
      const s = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
      return {
        monthOffset: parseCount(s.monthOffset),
        day: parseCount(s.day) || 15,
        amount: parseMoneyValue(s.amount) ?? 0,
      };
    });
  }

  // 5. Installments
  const rawInstallments = data.installments || parsed.installments;
  let installments: Installment[] = [];
  if (Array.isArray(rawInstallments)) {
    installments = rawInstallments.map((rawItem: unknown, idx: number) => {
      const inst = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
      return {
        ...(inst as unknown as Partial<Installment>),
        id: typeof inst.id === 'string' && inst.id ? inst.id : `inst-${Date.now()}-${idx}`,
        name: typeof inst.name === 'string' ? inst.name : (typeof inst.item === 'string' ? inst.item : 'Installment'),
        amount: parseMoneyValue(inst.amount) ?? parseMoneyValue(inst.monthlyAmount) ?? 0,
        totalMonths: parseCount(inst.totalMonths ?? inst.months ?? inst.installmentsCount ?? 1),
        remainingMonths: inst.remainingMonths !== undefined
          ? Math.max(0, parseCount(inst.remainingMonths))
          : parseCount(inst.totalMonths ?? inst.months ?? inst.installmentsCount ?? 1),
        startMonth: typeof inst.startMonth === 'string' ? inst.startMonth : DateUtils.currentYearMonth(),
        day: parseCount(inst.day) || 10,
        account: inst.account === 'cash' ? 'cib' : (typeof inst.account === 'string' ? inst.account : 'cib'),
      };
    });
  }

  // 6. Rates
  const rawRates = data.ratesData || data.rates || parsed.ratesData || parsed.rates;
  let rates: RatesData = defaultRates;
  if (rawRates && typeof rawRates === 'object') {
    rates = {
      currencies: Array.isArray((rawRates as Record<string, unknown>).currencies) && ((rawRates as Record<string, unknown>).currencies as unknown[]).length > 0 ? (rawRates as Record<string, unknown>).currencies as RatesData['currencies'] : defaultRates.currencies,
      gold: Array.isArray((rawRates as Record<string, unknown>).gold) && ((rawRates as Record<string, unknown>).gold as unknown[]).length > 0 ? (rawRates as Record<string, unknown>).gold as RatesData['gold'] : defaultRates.gold,
      lastFetched: typeof (rawRates as Record<string, unknown>).lastFetched === 'string' ? (rawRates as Record<string, unknown>).lastFetched as string : undefined,
      currenciesLastFetched: typeof (rawRates as Record<string, unknown>).currenciesLastFetched === 'string' ? (rawRates as Record<string, unknown>).currenciesLastFetched as string : undefined,
      goldLastFetched: typeof (rawRates as Record<string, unknown>).goldLastFetched === 'string' ? (rawRates as Record<string, unknown>).goldLastFetched as string : undefined,
      previousStorageTotal: typeof (rawRates as Record<string, unknown>).previousStorageTotal === 'number' ? (rawRates as Record<string, unknown>).previousStorageTotal as number : undefined,
    };
  }

  // 7. Storage Assets
  const rawStorage = data.storageAssets || data.storage || parsed.storageAssets || parsed.storage;
  const storageAssets: StorageAsset[] = Array.isArray(rawStorage)
    ? rawStorage.map((rawItem: unknown, idx: number) => {
        const a = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
        const loc = inferAssetLocation(a);
        return {
          id: typeof a.id === 'string' && a.id ? a.id : `asset-${Date.now()}-${idx}`,
          name: typeof a.name === 'string' ? a.name : 'Asset',
          category: (typeof a.category === 'string' ? a.category : (typeof a.type === 'string' ? a.type : 'gold')) as StorageAsset['category'],
          quantity: parseMoneyValue(a.quantity) ?? parseMoneyValue(a.amount) ?? 1,
          unit: typeof a.unit === 'string' ? a.unit : (a.category === 'gold' || a.type === 'gold' ? 'g' : 'units'),
          buyPrice: parseMoneyValue(a.buyPrice) ?? parseMoneyValue(a.buyRate) ?? parseMoneyValue(a.value) ?? 0,
          currentPrice: parseMoneyValue(a.currentPrice),
          currency: normalizeCurrencyCode(typeof a.currency === 'string' ? a.currency : undefined) || 'EGP',
          rate: parseMoneyValue(a.rate) || undefined,
          rateSource: a.rateSource ? String(a.rateSource) : (a.karat ? String(a.karat) : undefined),
          locationType: (a.locationType as StorageAsset['locationType']) || loc.locationType,
          location: typeof a.location === 'string' ? a.location : loc.location,
          locationLabel: typeof a.locationLabel === 'string' ? a.locationLabel : loc.locationLabel,
          notes: typeof a.notes === 'string' ? a.notes : undefined,
        };
      })
    : [];

  // 8. Jobs
  const rawAsf = data.asfJobs || parsed.asfJobs;
  const asfJobs: JobItem[] = Array.isArray(rawAsf) ? (rawAsf as JobItem[]) : [];
  const rawIrq = data.irqJobs || parsed.irqJobs;
  const irqJobs: JobItem[] = Array.isArray(rawIrq) ? (rawIrq as JobItem[]) : [];
  const rawPt = data.partTimeJobs || parsed.partTimeJobs;
  const partTimeJobs: JobItem[] = Array.isArray(rawPt) ? (rawPt as JobItem[]) : [];

  // 9. Actuals Maps & Overrides
  const rawActuals = data.entryActuals || parsed.entryActuals || {};
  const entryActuals: Record<string, number> = {};
  if (typeof rawActuals === 'object' && rawActuals !== null) {
    for (const [k, v] of Object.entries(rawActuals as Record<string, unknown>)) {
      const parsedVal = parseMoneyValue(v);
      if (parsedVal !== undefined && parsedVal !== null && !isNaN(parsedVal)) {
        entryActuals[k] = parsedVal;
      }
    }
  }

  const rawActualDates = data.entryActualDates || parsed.entryActualDates || {};
  const entryActualDates: Record<string, string> = {};
  if (typeof rawActualDates === 'object' && rawActualDates !== null) {
    for (const [k, v] of Object.entries(rawActualDates as Record<string, unknown>)) {
      if (typeof v === 'string') {
        entryActualDates[k] = v.slice(0, 10);
      }
    }
  }

  const rawCreditDues = (data.creditDues || parsed.creditDues) as Record<string, Record<string, number>> | undefined;
  const creditDues: Record<string, Record<string, number>> = rawCreditDues && typeof rawCreditDues === 'object' ? rawCreditDues : {};

  const rawCreditDueMonths = (data.creditDueMonths || parsed.creditDueMonths) as Record<string, string[]> | undefined;
  const creditDueMonths: Record<string, string[]> = rawCreditDueMonths && typeof rawCreditDueMonths === 'object' ? rawCreditDueMonths : {};

  const rawSettlementOverrides = (data.creditSettlementOverrides || parsed.creditSettlementOverrides) as Record<string, { amount?: number; date?: string; note?: string }> | undefined;
  const creditSettlementOverrides: Record<string, { amount?: number; date?: string; note?: string }> = rawSettlementOverrides && typeof rawSettlementOverrides === 'object' ? rawSettlementOverrides : {};

  const rawSalaryAnchor = data.salaryAnchorMonth || parsed.salaryAnchorMonth;
  const salaryAnchorMonth = typeof rawSalaryAnchor === 'string' ? rawSalaryAnchor : DateUtils.currentYearMonth();

  const rawDeleted = data.deletedForecasts || parsed.deletedForecasts;
  const deletedForecasts: string[] = Array.isArray(rawDeleted) ? (rawDeleted as string[]) : [];

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

  // Tighter name-based installment linking: only match expense entries that explicitly reference the installment
  for (const inst of installments) {
    const instName = (inst.name || '').toLowerCase().trim();
    if (!instName) continue;
    for (const e of entries) {
      if (!e.loanId && e.type === 'expense') {
        const cat = (e.category || '').toLowerCase().trim();
        const sub = (e.subcategory || '').toLowerCase().trim();
        const tag = (e.tag || '').toLowerCase().trim();
        const isLoanCat = cat.includes('loan') || sub.includes('loan') || tag.includes('loan') || tag === 'installment';
        if (e.id.includes(inst.id) || (isLoanCat && (cat === instName || sub === instName || cat.includes(`repayment: ${instName}`)))) {
          e.loanId = inst.id;
        }
      }
    }
  }

  // Reject a payload that clearly carried data but produced nothing usable.
  // Without this, a wrong-shaped or truncated file replaces the user's whole
  // ledger with empty/default values while the import still reports success.
  const payloadLooksPopulated = FINANCIAL_PAYLOAD_KEYS.some((key) => {
    const value = (data as Record<string, unknown>)[key] ?? (parsed as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return false;
  });
  if (entries.length === 0 && archivedEntries.length === 0 && payloadLooksPopulated) {
    throw new Error(
      'This file contains budget data in a shape this build does not recognise, so no transactions could be read. ' +
      'Nothing was imported. Check that you selected a Budget Control JSON backup.'
    );
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
