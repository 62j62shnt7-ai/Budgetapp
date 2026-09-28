// ==========================================================================
// Health Score Report — measure the Financial Health Score from a real backup
//
// Usage:
//   npm run score                       # uses test/sample-data.json
//   npm run score -- ./my-backup.json   # uses your exported JSON backup
//
// Prints the four scoring factors plus the measured budget adherence and
// savings rate, using exactly the same engine the dashboard renders.
// ==========================================================================
import fs from 'node:fs';

// Lightweight in-memory storage for the store's localStorage persistence.
if (typeof globalThis.localStorage === 'undefined') {
  const storeMap = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
    clear: () => storeMap.clear(),
    get length() { return storeMap.size; },
    key: (i) => Array.from(storeMap.keys())[i] || null,
  };
}

const { useBudgetStore } = await import('../src/store/useBudgetStore.ts');
const { computeFinancialHealthScore, generateSmartInsights, analyzeSettledMonths } = await import('../src/engine/healthScore.ts');
const { buildSalaryEntries, buildInstallmentEntries } = await import('../src/engine/salaryAndInstallments.ts');
const { buildCreditDueEntries } = await import('../src/engine/creditCards.ts');
const { getActiveForecastEntries, calculateForecast, getDeficitPeriods } = await import('../src/engine/forecast.ts');
const { computeTotalStorageValue } = await import('../src/engine/currency.ts');
const { DateUtils, formatMoney } = await import('../src/engine/dateUtils.ts');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vly-run', 'test/screenshots']);

/** Find the newest Budget Control backup JSON anywhere in the project (1 level deep). */
function findBackupFile() {
  const candidates = [];
  const dirs = ['.', ...fs.readdirSync('.').filter((name) => {
    if (SKIP_DIRS.has(name)) return false;
    try {
      return fs.statSync(name).isDirectory();
    } catch {
      return false;
    }
  })];
  dirs.forEach((dir) => {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    names
      .filter((name) => /^budget-control-backup.*\.json$/i.test(name) || /^.*backup-\d{4}-\d{2}-\d{2}\.json$/i.test(name))
      .forEach((name) => {
        const full = dir === '.' ? name : `${dir}/${name}`;
        try {
          candidates.push({ full, mtime: fs.statSync(full).mtimeMs });
        } catch {
          // ignore unreadable entries
        }
      });
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].full;
}

// Flags: --detail prints the month-by-month measurement table.
const cliArgs = process.argv.slice(2);
const showDetail = cliArgs.includes('--detail');
const explicitFile = cliArgs.find((arg) => !arg.startsWith('--'));
// `-` reads the backup from stdin, e.g. `git show origin/main:legacy/backup.json | npm run score -- -`
const useStdin = explicitFile === '-';
const file = useStdin ? '<stdin>' : explicitFile || findBackupFile() || 'test/sample-data.json';
if (!useStdin && !fs.existsSync(file)) {
  console.error(`Backup file not found: ${file}`);
  console.error('Usage: npm run score -- ./my-backup.json');
  console.error('Tip: drop your exported JSON anywhere in the project and run `npm run score`.');
  process.exit(1);
}

let rawText;
try {
  rawText = useStdin ? fs.readFileSync(0, 'utf-8') : fs.readFileSync(file, 'utf-8');
} catch (err) {
  console.error(`Could not read the backup: ${err.message}`);
  process.exit(1);
}

const raw = JSON.parse(rawText);
if (!useBudgetStore.getState().importJSON(JSON.stringify(raw))) {
  console.error('That file could not be read as a Budget Control backup.');
  process.exit(1);
}

const state = useBudgetStore.getState();
const {
  accounts,
  entries,
  archivedEntries,
  salaryPattern,
  salaryAnchorMonth,
  installments,
  creditDues,
  creditSettlementOverrides,
  entryActuals,
  entryActualDates,
  deletedForecasts,
  storageAssets,
  rates,
} = state;

// Mirror the dashboard's forecast inputs (useForecastCandidates).
const FORECAST_MONTHS = 12;
const totalCash = Object.values(accounts || {}).reduce((sum, acc) => sum + (acc.balance || 0), 0);
const currentYm = DateUtils.currentYearMonth();
const hasMaterializedSalary = (entries || []).some((entry) => entry.source === 'salary');
const salaryEntries = hasMaterializedSalary
  ? []
  : buildSalaryEntries(salaryPattern || [], currentYm, Math.ceil(FORECAST_MONTHS / 3), salaryAnchorMonth);
const installmentEntries = buildInstallmentEntries(installments || []);
const creditDueEntries = buildCreditDueEntries({
  accounts: accounts || {},
  creditDues: creditDues || {},
  cashEntries: entries || [],
  archivedEntries: archivedEntries || [],
  entryActuals: entryActuals || {},
  entryActualDates: entryActualDates || {},
  creditSettlementOverrides: creditSettlementOverrides || {},
});
const allCandidateEntries = getActiveForecastEntries(
  [...(entries || []), ...salaryEntries],
  installmentEntries,
  creditDueEntries,
  deletedForecasts || [],
  entryActuals || {},
);
const forecast = calculateForecast(allCandidateEntries, totalCash, FORECAST_MONTHS);
const deficitPeriods = getDeficitPeriods(allCandidateEntries, totalCash);
const storageTotal = computeTotalStorageValue(storageAssets || [], rates);

const health = computeFinancialHealthScore({
  entries: allCandidateEntries,
  forecast,
  deficitPeriods,
  actualCashNow: totalCash,
  storageTotal,
  entryActuals: entryActuals || {},
  historyEntries: entries || [],
  archivedEntries: archivedEntries || [],
  entryActualDates: entryActualDates || {},
  creditSettlementOverrides: creditSettlementOverrides || {},
});

const insights = generateSmartInsights({
  entries: allCandidateEntries,
  forecast,
  deficitPeriods,
  actualCashNow: totalCash,
  storageTotal,
});

const bar = (value, max) => {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return `[${'#'.repeat(filled)}${'.'.repeat(Math.max(0, max - filled))}]`;
};

console.log('');
console.log(`Budget Control — Financial Health Report`);
console.log(`Source: ${file}  ·  generated from ${raw.exportedAt || 'unknown export time'}`);
console.log('─'.repeat(64));
console.log(`Score: ${health.score}/100   Grade ${health.grade}   ${health.label ?? ''}${health.hardScoreCap && health.hardScoreCap < 100 ? `   (capped at ${health.hardScoreCap})` : ''}`);
console.log(`Cash now: ${formatMoney(totalCash)}   Reserves: ${formatMoney(storageTotal)}   Net worth: ${formatMoney(totalCash + storageTotal)}`);
console.log(`Runway: ${health.runwayMonths} months of average expenses`);
console.log('');
console.log('Factors');
console.log(`  Deficit safety   ${String(health.deficitScore).padStart(2)}/25 ${bar(health.deficitScore, 25)}`);
console.log(`  Liquidity/runway ${String(health.runwayScore).padStart(2)}/25 ${bar(health.runwayScore, 25)}`);
console.log(`  Budget adherence ${String(health.budgetScore).padStart(2)}/25 ${bar(health.budgetScore, 25)}`);
console.log(`  Savings/reserve  ${String(health.savingsScore).padStart(2)}/25 ${bar(health.savingsScore, 25)}`);
console.log('');
console.log('Measured detail');
console.log(`  Settled months analyzed : ${health.monthsAnalyzed ?? 0}`);
console.log(`  Realized spend vs plan  : ${health.budgetAdherencePct !== undefined ? `${health.budgetAdherencePct}% of planned budget` : 'not measurable yet'}`);
console.log(`  Savings rate (window)   : ${health.savingsRatePct !== undefined ? `${health.savingsRatePct}% of income` : 'not measurable yet'}`);
console.log(`  Reserve coverage        : ${health.reserveMonths ?? 0} month(s) of expenses held outside cash`);
console.log('');
if (showDetail) {
  const rows = analyzeSettledMonths({
    historyEntries: entries || [],
    archivedEntries: archivedEntries || [],
    entryActuals: entryActuals || {},
    entryActualDates: entryActualDates || {},
    creditSettlementOverrides: creditSettlementOverrides || {},
    today: DateUtils.todayString(),
  });
  console.log('');
  console.log('Settled months (what drives budget + savings)');
  console.log('  month     plan exp   real exp   real inc   vs plan   savings   pts');
  if (rows.length === 0) {
    console.log('  (no fully-elapsed month with activity yet)');
  }
  rows.forEach((row) => {
    const pct = row.ratio === null ? '     —' : `${String(Math.round(row.ratio * 100)).padStart(5)}%`;
    const savings = row.savingsRate === null ? '      —' : `${String(Math.round(row.savingsRate * 100)).padStart(5)}%`;
    console.log(
      `  ${row.month}  ${String(Math.round(row.plannedExpense)).padStart(9)}  ${String(Math.round(row.realizedExpense)).padStart(9)}  ` +
      `${String(Math.round(row.realizedIncome)).padStart(9)}  ${pct}  ${savings}  ${row.adherenceScore === null ? '  —' : String(row.adherenceScore).padStart(4)}`
    );
  });
}

console.log('');
console.log(`Summary: ${health.summaryNote}`);
if (insights.length > 0) {
  console.log('');
  console.log('Top insights');
  insights.slice(0, 5).forEach((insight) => {
    console.log(`  · [${insight.type}] ${insight.title}: ${insight.message}`);
  });
}
console.log('');
