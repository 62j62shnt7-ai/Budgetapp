import { chromium } from 'playwright';
import fs from 'fs';
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
  if (isRunning) {
    console.log(`Server already running at ${url}`);
    return null;
  }

  console.log(`Starting Vite dev server on port ${port}...`);
  const serverProcess = spawn('npx', ['vite', '--port', String(port)], {
    stdio: 'ignore',
    detached: false
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await checkServer(url)) {
      console.log(`Vite dev server is ready at ${url}`);
      return serverProcess;
    }
  }
  throw new Error(`Failed to start Vite dev server on ${url} within 10 seconds.`);
}

async function run() {
  const serverProcess = await ensureServer(5173);
  let browser;
  try {
    const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(macPath)) {
      browser = await chromium.launch({ executablePath: macPath, headless: true });
    } else {
      browser = await chromium.launch({ headless: true });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    // Setup initial storage with a credit card expense so there is a calculated credit settlement
    await page.goto('http://localhost:5173');
    await page.evaluate(() => {
      localStorage.clear();
      // Add a card expense charged to CIB card
      const entries = [
        {
          id: 'test-card-expense-1',
          date: '2026-10-02',
          category: 'Shopping',
          account: 'cib',
          type: 'expense',
          amount: 5000,
          currency: 'EGP',
          creditType: 'cib_card',
          source: 'credit card'
        }
      ];
      localStorage.setItem('budget-control-entries', JSON.stringify(entries));
      localStorage.setItem('budget-control-account-balances', JSON.stringify({
        cib: { name: 'CIB', balance: 20000, maturityDay: 15 },
        hsbc: { name: 'HSBC', balance: 10000, maturityDay: 30 }
      }));
    });

    await page.reload();
    await page.waitForTimeout(500);

    // Navigate to Cashflow
    await page.click('button:has-text("Cash Flow"), a:has-text("Cash Flow"), [data-tab="cashflow"], nav button:nth-child(2)');
    await page.waitForTimeout(500);

    // Find the credit settlement row
    const settlementRow = page.locator('tr[id^="cashflow-row-credit-settlement-"]');
    const count = await settlementRow.count();
    console.log(`Found ${count} credit settlement rows`);

    if (count > 0) {
      const rowText = await settlementRow.first().innerText();
      console.log('Row text:\n', rowText);

      // Locate the actual input
      const actualInput = settlementRow.first().locator('input.inline-actual-input');
      console.log('Actual input placeholder:', await actualInput.getAttribute('placeholder'));

      // Fill and press Enter
      await actualInput.fill('5000');
      await actualInput.press('Enter');
      await page.waitForTimeout(600);

      // Check open dialogs
      const openDialogs = await page.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll('dialog[open], dialog'));
        return dialogs.map((d) => ({
          tag: d.tagName,
          id: d.id,
          className: d.className,
          open: d.open,
          display: window.getComputedStyle(d).display,
          zIndex: window.getComputedStyle(d).zIndex,
          title: d.querySelector('h2, h3, .dialog-heading')?.innerText || '',
          bodyText: d.innerText.slice(0, 200)
        }));
      });

      console.log('Open dialogs after Enter:\n', JSON.stringify(openDialogs, null, 2));
    }
  } finally {
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
