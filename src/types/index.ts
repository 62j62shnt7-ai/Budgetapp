// ==========================================================================
// Core Domain Models & Complete TypeScript Interfaces
// ==========================================================================

export type EntryType = 'income' | 'expense';

export interface EntryDraw {
  id?: string;
  date: string;
  amount: number;
  note?: string;
  tag?: string;
  account?: string;
  /** Storage asset this draw was paid from/into (foreign holdings / vault). */
  storageAssetId?: string;
}

export interface CreditSettlementOverride {
  amount?: number;
  date?: string;
  note?: string;
  tag?: string;
  account?: string;
  draws?: EntryDraw[];
  isClosed?: boolean;
}

export interface CashEntry {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: EntryType;
  category: string;
  subcategory?: string;
  account: string;
  tag?: string;
  note?: string;
  isRecurring?: boolean;
  frequency?: string;
  seriesId?: string;
  creditType?: string; // 'cib' | 'hsbc' | ''
  source?: string;
  isDraw?: boolean;
  isClosed?: boolean;
  keepOngoing?: boolean;
  draws?: EntryDraw[];
  settlementDate?: string;
  creditSettlementDate?: string;
  calculatedAmount?: number;
  statementAmount?: number;
  variance?: number;
  statementNote?: string;
  baseDue?: number;
  cardSpendTotal?: number;
  cardExpenseCount?: number;
  isCreditSettlement?: boolean;
  isCustomized?: boolean;
  // Read-only synthetic rows (e.g. opening balances) that must never be edited/deleted.
  locked?: boolean;
  linkedInflowId?: string;
  archivedAt?: string;
  currency?: string;
  originalAmount?: number;
  fxRateAtEntry?: number;
  actualAmount?: number;
  actualDate?: string;
  loanId?: string;
  jobId?: string;
  storageAssetId?: string;
  initialAmount?: number;
  // Marks an entry as a one-time internal transfer (e.g. FX conversion) rather than
  // a real forecastable inflow/outflow. Entries with this set are always excluded
  // from forecast/cashflow candidate lists, even if their actual is cleared.
  conversionType?: 'fx-sale';
  excludeFromForecast?: boolean;
}

export interface SalaryPayment {
  monthOffset: number; // 0, 1, 2
  day: number;
  amount: number;
}

export interface AccountBalance {
  name: string;
  balance: number;
  maturityDay: number;
}

export interface CurrencyRate {
  name: string;
  sell: number;
  buy: number;
}

export interface GoldRate {
  name: string;
  sell: number;
  buy: number;
}

export interface RatesData {
  currencies: CurrencyRate[];
  gold: GoldRate[];
  lastFetched?: string;
  currenciesLastFetched?: string;
  goldLastFetched?: string;
  previousStorageTotal?: number;
}

export interface Installment {
  id: string;
  loanId?: string;
  name: string;
  amount: number;
  day?: number;
  totalMonths: number;
  remainingMonths: number;
  startMonth: string; // YYYY-MM
  frequency?: number;
  account?: string;
  tag?: string;
  initialAmount?: number;
}

export type StorageLocationType = 'bank' | 'cash' | 'vault' | 'other';

export interface StorageAsset {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  buyPrice: number;
  currentPrice?: number;
  currency: string;
  notes?: string;
  rate?: number;
  rateSource?: string;
  locationType?: StorageLocationType;
  location?: string;
  locationLabel?: string;
}



export interface JobDayLog {
  id?: string;
  date: string;
  units?: number;
  hours?: number;
  rate?: number;
  note?: string;
}

export interface JobPayment {
  id: string;
  entryId?: string;
  date: string;
  amount: number;
  currency?: string;
  egpAmount?: number;
  account?: string;
  settlementAccount?: string;
  syncToBudget?: boolean;
  paymentNote?: string;
  note?: string;
}

export interface JobExpense {
  id: string;
  date: string;
  title?: string;
  description?: string;
  amount: number;
  currency?: string;
  isReimbursable?: boolean;
  receiptNote?: string;
  note?: string;
}

export interface JobItem {
  id: string;
  title: string;
  client?: string;
  startDate?: string;
  endDate?: string;
  currency: string;
  type?: 'daily_rate' | 'lumpsum' | 'hourly' | 'fixed';
  dailyRate?: number;
  lumpSumAmount?: number;
  rateType?: 'daily' | 'hourly' | 'fixed';
  rateAmount?: number;
  status?: 'active' | 'invoiced' | 'partial' | 'paid' | 'completed' | 'paused';
  notes?: string;
  daysWorked?: JobDayLog[];
  logs?: JobDayLog[];
  payments?: JobPayment[];
  expenses?: JobExpense[];
  forecastDueDate?: string;
  forecastEntryId?: string;
  forecastAmount?: number;
  forecastDestination?: string;
}

export interface DeficitPeriod {
  startDate: string;
  endDate: string;
  maxDeficit: number;
  isResolved: boolean;
  shortfallDays: number;
}

export interface DeficitSummary {
  hasDeficit: boolean;
  totalPeriods: number;
  worstDeficit: number;
  deficitPeriods: DeficitPeriod[];
  forecastMonths: number;
}

export interface MonthlyForecast {
  month: string; // YYYY-MM
  balance: number;
  income: number;
  expense: number;
  net: number;
}

export interface HealthScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  deficitScore: number;
  runwayScore: number;
  budgetScore: number;
  savingsScore: number;
  summaryNote: string;
  runwayMonths: number;
  label?: string;
  tone?: string;
  hardScoreCap?: number;
  /** Number of settled months the budget/savings factors were measured from. */
  monthsAnalyzed?: number;
  /** Realized spend as a percentage of planned budget across measured months (100 = exactly on plan). */
  budgetAdherencePct?: number;
  /** Average realized savings rate (%) across measured months. */
  savingsRatePct?: number;
  /** Months of expenses covered by non-liquid reserves (storage assets). */
  reserveMonths?: number;
}

/** Realized performance for one fully-elapsed month (health score input detail). */
export interface SettledMonthRow {
  month: string;
  plannedExpense: number;
  realizedExpense: number;
  realizedIncome: number;
  /** (income - expense) / income, or null when no income was recorded. */
  savingsRate: number | null;
  /** realizedExpense / plannedExpense, or null when nothing was planned. */
  ratio: number | null;
  /** Budget-adherence points (0-25) for this month, or null when nothing was planned. */
  adherenceScore: number | null;
}

export interface SmartInsight {
  id: string;
  type: 'critical' | 'warning' | 'positive' | 'tip';
  title: string;
  message: string;
  actionText?: string;
}

export type CreditDueFundingStatus =
  | 'settled'
  | 'funded'
  | 'critical_shortfall'
  | 'approaching_shortfall'
  | 'upcoming_shortfall'
  | 'overdue_unfunded';

export interface CreditDueFundingAlert {
  entryId: string;
  cardName: string;
  settlementDate: string;
  daysUntilSettlement: number;
  accountKey: string;
  accountName: string;
  accountBalance: number;
  totalPlannedDue: number;
  remainingDue: number;
  shortfall: number;
  status: CreditDueFundingStatus;
  isAlert: boolean;
  canBeCoveredByTransfer?: boolean;
  maxTransferableAmount?: number;
  remainingUncoveredShortfall?: number;
  projectedAccountBalance?: number;
  projectedShortfall?: number;
  isFundedByProjectedIncome?: boolean;
  lowestProjectedBalance?: number;
  suggestedSourceAccount?: {
    accountKey: string;
    accountName: string;
    balance: number;
    projectedBalance?: number;
  };
}

export type ViewTab =
  | 'dashboard'
  | 'deficits'
  | 'cashflow'
  | 'history'
  | 'accounts'
  | 'storage'
  | 'jobs'
  | 'rates';

export interface NavigationIntent {
  tab: ViewTab;
  filters?: {
    month?: string;
    category?: string;
    type?: 'all' | 'income' | 'expense';
    search?: string;
    tag?: string;
    account?: string;
    highlightId?: string;
  };
}

export interface BudgetFinancialSnapshot {
  entries: CashEntry[];
  archivedEntries: CashEntry[];
  deletedForecasts: string[];
  accounts: Record<string, AccountBalance>;
  salaryPattern: SalaryPayment[];
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
  creditSettlementOverrides: Record<string, {
    amount?: number;
    date?: string;
    note?: string;
    tag?: string;
    account?: string;
    draws?: EntryDraw[];
  }>;
  salaryAnchorMonth: string;
}

export interface UndoableAction {
  id: string;
  label: string;
  timestamp: number;
  snapshot: BudgetFinancialSnapshot;
}

export interface UndoToastState {
  id: string;
  label: string;
  timestamp: number;
}

