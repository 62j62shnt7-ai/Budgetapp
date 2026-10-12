import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'http';
import { spawn } from 'child_process';

function checkServer(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer(port = 5173) {
  const url = `http://localhost:${port}`;
  const isRunning = await checkServer(url);
  if (isRunning) return null;

  const serverProcess = spawn('npx.cmd', ['vite', '--port', String(port)], {
    stdio: 'ignore',
    shell: true,
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkServer(url)) {
      return serverProcess;
    }
  }
  throw new Error('Vite dev server failed to start');
}

async function run() {
  const server = await ensureServer(5173);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14
  });
  const page = await context.newPage();

  // Seed sample transactions matching user screenshots
  await page.addInitScript(() => {
    const entries = [
      {
        id: 'entry-loan',
        date: '2026-10-16',
        category: 'Loan Repayment: nono Bridge loan',
        tag: 'Loan Repayment',
        account: 'hsbc',
        type: 'expense',
        amount: 3000,
      },
      {
        id: 'entry-settlement',
        date: '2026-10-28',
        category: 'HSBC Credit Due',
        tag: 'Credit',
        account: 'hsbc',
        type: 'expense',
        amount: 55407,
        calculatedAmount: 55345,
        creditType: 'hsbc',
        source: 'credit settlement',
      },
      {
        id: 'entry-kamal',
        date: '2026-10-30',
        category: 'kamal',
        account: 'hsbc',
        type: 'income',
        amount: 5000,
      },
    ];
    localStorage.setItem('budget-control-cash-entries', JSON.stringify(entries));
    localStorage.setItem('budget-control-account-balances', JSON.stringify({
      cib: 580,
      hsbc: 1000,
    }));
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.locator('.mobile-bottom-nav button:has-text("Cash Flow")').click();
  await page.waitForTimeout(500);

  console.log('--- Verifying Mobile View Fixes ---');

  // Test 1: Category & Amount collision check on loan row
  const loanRow = page.locator('tr[id="cashflow-row-entry-loan"]');
  assert.ok(await loanRow.isVisible(), 'Loan row must be visible');

  const strongBox = await loanRow.locator('.cell-category strong').boundingBox();
  const amtBox = await loanRow.locator('.cell-amount').boundingBox();
  console.log('Loan Strong Box:', strongBox);
  console.log('Loan Amount Box:', amtBox);

  assert.ok(
    strongBox.x + strongBox.width <= amtBox.x + 1, // allow 1px subpixel tolerance
    `Overlap detected: Strong ends at ${strongBox.x + strongBox.width}, Amount starts at ${amtBox.x}`
  );
  console.log('✓ Test 1 Passed: Long category wraps and does NOT collide with amount!');

  // Test 2: Date vertical tick check (no inset box-shadow cutting through date text)
  const dateShadow = await page.evaluate(() => {
    const loanDate = document.querySelector('tr[id="cashflow-row-entry-loan"] .cell-date');
    const loanFirstTd = document.querySelector('tr[id="cashflow-row-entry-loan"] td:first-child');
    return {
      dateShadow: window.getComputedStyle(loanDate).boxShadow,
      firstTdShadow: window.getComputedStyle(loanFirstTd).boxShadow,
    };
  });
  console.log('Date box shadows:', dateShadow);
  assert.strictEqual(dateShadow.dateShadow, 'none', 'cell-date must not have inset box shadow');
  assert.strictEqual(dateShadow.firstTdShadow, 'none', 'td:first-child must not have inset box shadow');
  console.log('✓ Test 2 Passed: No vertical box-shadow line cutting through date text!');

  // Test 3: Card left border indicator check
  const cardBorder = await page.evaluate(() => {
    const row = document.querySelector('tr[id="cashflow-row-entry-loan"]');
    return window.getComputedStyle(row).borderLeftWidth;
  });
  console.log('Loan Card border-left-width:', cardBorder);
  assert.strictEqual(cardBorder, '4px', 'Loan card must have 4px status border on its left edge');
  console.log('✓ Test 3 Passed: Loan card has clean 4px left status border!');

  // Test 4: Shortfall tag overflow check
  const shortfallOverflow = await page.evaluate(() => {
    const tags = Array.from(document.querySelectorAll('.credit-funding-shortfall-tag'));
    return tags.map((t) => {
      const rect = t.getBoundingClientRect();
      const tr = t.closest('tr')?.getBoundingClientRect();
      return {
        text: t.innerText,
        rectRight: rect.right,
        trRight: tr?.right,
        overflows: tr ? rect.right > tr.right + 2 : false,
      };
    });
  });
  console.log('Shortfall tags evaluation:', shortfallOverflow);
  for (const st of shortfallOverflow) {
    assert.strictEqual(st.overflows, false, `Shortfall tag overflows card boundary: ${st.text}`);
  }
  console.log('✓ Test 4 Passed: Shortfall tag wraps and does not overflow or clip!');

  await page.screenshot({ path: 'test/screenshots/mobile-cashflow-fixed.png', fullPage: true });

  await browser.close();
  if (server) server.kill();
  console.log('\n🌟 ALL MOBILE AUDIT TESTS PASSED CLEANLY! 🌟');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
