import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'node:http';
import { spawn } from 'node:child_process';

function isServerReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => resolve(response.statusCode >= 200 && response.statusCode < 400));
    request.on('error', () => resolve(false));
    request.setTimeout(1500, () => { request.destroy(); resolve(false); });
  });
}

async function ensureServer() {
  const url = 'http://localhost:5173';
  if (await isServerReady(url)) return null;
  const child = spawn('npx', ['vite', '--port', '5173'], {
    stdio: 'ignore',
    detached: false,
    shell: process.platform === 'win32',
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await isServerReady(url)) return child;
  }
  throw new Error('Vite did not start on port 5173.');
}

const server = await ensureServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto('http://localhost:5173');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('budget-control-cash-entries', JSON.stringify([
      { id: 'instapay-partial', date: '2026-11-10', category: 'Rent', account: 'hsbc', type: 'expense', amount: 12000, currency: 'EGP' },
      { id: 'instapay-next', date: '2026-11-10', category: 'Food', account: 'hsbc', type: 'expense', amount: 2000, currency: 'EGP' },
      { id: 'instapay-income', date: '2026-11-10', category: 'Salary', account: 'hsbc', type: 'income', amount: 1000, currency: 'EGP' },
      { id: 'instapay-foreign', date: '2026-11-10', category: 'Travel', account: 'hsbc', type: 'expense', amount: 5000, currency: 'USD', originalAmount: 100, fxRateAtEntry: 50 },
    ]));
    localStorage.setItem('budget-control-account-balances', JSON.stringify({
      cib: { name: 'CIB', balance: 0, maturityDay: 15 },
      hsbc: { name: 'HSBC', balance: 20000, maturityDay: 30 },
    }));
  });
  await page.reload();
  await page.getByRole('button', { name: /Cash Flow/i }).first().click();

  const partialRow = page.locator('#cashflow-row-instapay-partial');
  const actualInput = partialRow.locator('input.inline-actual-input');
  await actualInput.fill('5000');
  await actualInput.press('Enter');

  const feeCheckbox = page.getByRole('checkbox', { name: 'Include InstaPay transfer fee' });
  await feeCheckbox.waitFor({ state: 'visible' });
  assert.equal(await feeCheckbox.isChecked(), false, 'InstaPay starts unchecked');
  await feeCheckbox.check();
  const summary = page.getByRole('status').filter({ hasText: 'Bank deduction' });
  await summary.waitFor({ state: 'visible' });
  assert.match(await summary.innerText(), /InstaPay fee\n5 EGP/);
  assert.match(await summary.innerText(), /Bank deduction\n5,005 EGP/);
  await page.getByRole('button', { name: /Deduct from HSBC & Save/i }).click();

  const saved = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (key) => new Promise((resolve, reject) => {
      const request = database.transaction('keyval', 'readonly').objectStore('keyval').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return {
      entries: await read('budget-control-cash-entries'),
      accounts: await read('budget-control-account-balances'),
    };
  });
  const paid = saved.entries.find((entry) => entry.id === 'instapay-partial');
  assert.equal(paid.actualAmount, 5000, 'partial actual remains principal-only');
  assert.equal(paid.draws[0].instapayFeeAmount, 5, 'fee is saved on the paid draw');
  assert.equal(saved.accounts.hsbc.balance, 14995, 'bank deduction includes the fee');

  await partialRow.click();
  const editActualInput = page.locator('#entryForm input[name="actualAmount"]');
  await editActualInput.waitFor({ state: 'visible' });
  await editActualInput.fill('3000');
  await page.getByRole('button', { name: 'Update entry' }).click();
  await page.getByRole('heading', { name: /Refund InstaPay Payment/i }).waitFor({ state: 'visible' });
  const refundSummary = page.getByRole('status').filter({ hasText: 'refund' });
  await refundSummary.waitFor({ state: 'visible' });
  assert.match(await refundSummary.innerText(), /2,002 EGP \(fee 2 EGP\)/, 'partial reduction returns the proportional saved fee');
  await page.getByRole('button', { name: 'Refund & Save' }).click();
  const afterPartialRefund = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (key) => new Promise((resolve, reject) => {
      const request = database.transaction('keyval', 'readonly').objectStore('keyval').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return { entries: await read('budget-control-cash-entries'), accounts: await read('budget-control-account-balances') };
  });
  assert.equal(afterPartialRefund.accounts.hsbc.balance, 16997, 'partial reduction refunds bank principal plus saved fee');
  const reducedPayment = afterPartialRefund.entries.find((entry) => entry.id === 'instapay-partial');
  assert.equal(reducedPayment.actualAmount, 3000, 'partial reduction updates cashflow principal');
  assert.equal(reducedPayment.draws[0].instapayFeeAmount, 3, 'remaining draw fee is reduced with its principal');
  assert.equal(reducedPayment.draws[0].instapayFeeBaseAmount, 3000, 'remaining fee basis tracks edited principal');

  const nextRow = page.locator('#cashflow-row-instapay-next');
  const nextInput = nextRow.locator('input.inline-actual-input');
  await nextInput.fill('1000');
  await nextInput.press('Enter');
  await feeCheckbox.waitFor({ state: 'visible' });
  assert.equal(await feeCheckbox.isChecked(), false, 'a new deduction starts unchecked');
  await feeCheckbox.check();
  await page.getByRole('button', { name: /Don't deduct/i }).click();
  const afterNoDeduct = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (key) => new Promise((resolve, reject) => {
      const request = database.transaction('keyval', 'readonly').objectStore('keyval').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return { entries: await read('budget-control-cash-entries'), accounts: await read('budget-control-account-balances') };
  });
  const ignoredFee = afterNoDeduct.entries.find((entry) => entry.id === 'instapay-next');
  assert.equal(Boolean(ignoredFee.draws?.some((draw) => draw.paymentMethod === 'instapay')), false, "Don't deduct records no InstaPay fee");
  assert.equal(afterNoDeduct.accounts.hsbc.balance, 16997, "Don't deduct leaves the bank balance unchanged");

  const incomeRow = page.locator('#cashflow-row-instapay-income');
  await incomeRow.locator('input.inline-actual-input').fill('500');
  await incomeRow.locator('input.inline-actual-input').press('Enter');
  await page.getByRole('button', { name: /Don't deposit/i }).waitFor({ state: 'visible' });
  assert.equal(await feeCheckbox.count(), 0, 'income deposits do not offer InstaPay fees');
  await page.getByRole('button', { name: /Don't deposit/i }).click();

  const foreignRow = page.locator('#cashflow-row-instapay-foreign');
  await foreignRow.locator('input.inline-actual-input').fill('50');
  await foreignRow.locator('input.inline-actual-input').press('Enter');
  await page.getByRole('button', { name: /Don't deduct/i }).waitFor({ state: 'visible' });
  assert.equal(await feeCheckbox.count(), 0, 'foreign-currency deductions do not offer InstaPay fees');
  await page.getByRole('button', { name: /Don't deduct/i }).click();
  await page.getByRole('button', { name: /History/i }).first().click();
  await page.locator('#historyLifetimeInstaPayFees').waitFor({ state: 'visible' });
  assert.match(await page.locator('#historyLifetimeInstaPayFees').innerText(), /3 EGP/, 'History reports the remaining saved fee separately');
  assert.match(await page.locator('#historyLifetimeExpenses').innerText(), /6,500 EGP/, 'expense principal totals exclude InstaPay fees');
  assert.match(await page.locator('#historyLifetimeNet').innerText(), /-6,003 EGP/, 'net cash surplus includes InstaPay fees');
  console.log('InstaPay modal and Cashflow partial-payment UI tests passed.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
