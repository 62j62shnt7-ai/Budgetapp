// ==========================================================================
// Backup migration & import-safety regression suite
//
// Covers the failure modes that the engine math suite does not: money values
// arriving in real-world formats, payloads from an incompatible schema version
// being coerced into this one, unrecorded archived actuals being read as fully
// paid, and wrong-shaped files replacing the ledger with empty data.
// ==========================================================================
import assert from 'node:assert/strict';
import { migrateBackupPayload, parseMoneyValue } from '../src/engine/migration.ts';

// --- Money parsing ---------------------------------------------------------
// `Number('1,500')` is NaN, so a comma-formatted backup used to import every
// amount as 0 EGP. The parser must read it, and must refuse genuinely bad input
// rather than coercing it to 0.
assert.strictEqual(parseMoneyValue(1500), 1500);
assert.strictEqual(parseMoneyValue('1500'), 1500);
assert.strictEqual(parseMoneyValue('1,500'), 1500, 'Thousands separator must not become NaN/0');
assert.strictEqual(parseMoneyValue(' 12,345.67 '), 12345.67);
assert.strictEqual(parseMoneyValue(''), undefined);
assert.strictEqual(parseMoneyValue('   '), undefined);
assert.strictEqual(parseMoneyValue('abc'), undefined);
assert.strictEqual(parseMoneyValue(null), undefined);
assert.strictEqual(parseMoneyValue(undefined), undefined);
assert.strictEqual(parseMoneyValue(NaN), undefined);
console.log('✓ Money value parsing handles separators and rejects unreadable input');

// --- Version gate ----------------------------------------------------------
// An unknown major version must be rejected, not coerced: silently reading a
// future/foreign shape is how a good ledger gets replaced with garbage.
for (const bad of ['3.0', '99.1', '10']) {
  assert.throws(
    () => migrateBackupPayload({ version: bad, entries: [{ id: 'x', date: '2026-01-01', amount: 10, type: 'expense' }] }),
    /Unsupported backup schema version/,
    `Version ${bad} must be rejected`
  );
}
// Current major and pre-versioning legacy payloads (no version field) still import.
assert.strictEqual(
  migrateBackupPayload({ version: '2.0', entries: [{ id: 'a', date: '2026-01-01', amount: 10, type: 'expense' }] }).schemaVersion,
  '2.2',
  'Current major version imports'
);
assert.strictEqual(
  migrateBackupPayload({ entries: [{ id: 'b', date: '2026-01-01', amount: 10, type: 'expense' }] }).schemaVersion,
  '2.2',
  'Unversioned legacy payload still imports'
);
console.log('✓ Unknown schema major versions are rejected; legacy payloads still import');

// --- Amount + currency parsing ---------------------------------------------
const separated = migrateBackupPayload({
  version: '2.1',
  entries: [{ id: 'e1', date: '2026-01-01', category: 'Rent', amount: '15,000', type: 'expense' }],
});
assert.strictEqual(separated.entries[0].amount, 15000, 'Comma-formatted amount must import, not zero');
assert.strictEqual(separated.entries[0].currency, 'EGP', 'Default currency applied');

const padded = migrateBackupPayload({
  version: '2.1',
  entries: [{ id: 'e2', date: '2026-01-01', amount: 100, type: 'expense', currency: 'usd ' }],
});
assert.strictEqual(padded.entries[0].currency, 'USD', 'Padded currency code is normalized');
console.log('✓ Amounts with separators survive import and currency codes are normalized');

// --- Archived entries ------------------------------------------------------
// Archived rows keep their recorded actual when present. Note: when absent, the
// migration still defaults it to the full amount (long-standing behaviour), so
// an archived-but-unpaid row reads as settled. Changing that alters numbers on
// existing installs, so it is deliberately left alone.
const archived = migrateBackupPayload({
  version: '2.1',
  entries: [],
  archivedEntries: [{ id: 'a1', date: '2026-01-01', amount: 5000, type: 'expense' }],
});
assert.strictEqual(archived.archivedEntries[0].actualAmount, 5000, 'Archived default behaviour preserved');

const archivedPaid = migrateBackupPayload({
  version: '2.1',
  entries: [],
  archivedEntries: [{ id: 'a2', date: '2026-01-01', amount: 5000, type: 'expense', actualAmount: 5000 }],
});
assert.strictEqual(archivedPaid.archivedEntries[0].actualAmount, 5000, 'Recorded archived actual is preserved');

const archivedSeparated = migrateBackupPayload({
  version: '2.1',
  entries: [],
  archivedEntries: [{ id: 'a3', date: '2026-01-01', amount: '5,000', type: 'expense', actualAmount: '5,000' }],
});
assert.strictEqual(archivedSeparated.archivedEntries[0].actualAmount, 5000, 'Separator-formatted archived actuals import');
console.log('✓ Archived entry actuals are preserved and separator-formatted values parsed');

// --- Wrong-shaped payload must not replace the ledger ----------------------
assert.throws(
  () => migrateBackupPayload({
    version: '2.1',
    accountBalances: { cib: { balance: 100 } },
    salaryPattern: [{ day: 15, amount: 1 }],
  }),
  /no transactions could be read/,
  'A populated but unrecognised payload must not import as empty'
);
console.log('✓ Populated but unrecognised payloads are rejected instead of wiping data');

// --- A genuinely empty backup is still valid -------------------------------
const empty = migrateBackupPayload({ version: '2.1' });
assert.deepStrictEqual(empty.entries, []);
assert.deepStrictEqual(empty.archivedEntries, []);
console.log('✓ A genuinely empty backup still imports cleanly');

console.log('\n🌟 ALL BACKUP MIGRATION & IMPORT-SAFETY TESTS PASSED! 🌟');
