import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const sampleData = JSON.parse(fs.readFileSync('test/sample-data.json', 'utf-8'));

async function run() {
  const screenshotDir = 'test/screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  
  const testViewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'desktop-wide', width: 1920, height: 1080 },
    { name: 'mobile', width: 390, height: 844 }
  ];

  for (const vp of testViewports) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();

    // Navigate to app
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // Seed localStorage with sample data
    await page.evaluate((data) => {
      const STORAGE_KEYS = {
        salary: 'budget-control-salary-pattern',
        entries: 'budget-control-cash-entries',
        installments: 'budget-control-installments',
        storage: 'budget-control-storage-assets',
        accounts: 'budget-control-account-balances',
        asf: 'budget-control-asf-jobs',
        irq: 'budget-control-irq-jobs',
        partTimeJobs: 'budget-control-part-time-jobs',
        rates: 'budget-control-rates',
        entryActuals: 'budget-control-entry-actuals',
        entryActualDates: 'budget-control-entry-actual-dates',
        deletedForecasts: 'budget-control-deleted-forecasts',
        archivedEntries: 'budget-control-archived-entries',
        creditDues: 'budget-control-credit-dues',
        creditDueMonths: 'budget-control-credit-due-months',
        creditSettlementOverrides: 'budget-control-credit-settlement-overrides',
        salaryAnchor: 'budget-control-salary-anchor',
        theme: 'budget-control-theme',
      };

      const payload = data.data || data;
      localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(payload.cashEntries || payload.entries || []));
      localStorage.setItem(STORAGE_KEYS.salary, JSON.stringify(payload.salaryPattern || []));
      localStorage.setItem(STORAGE_KEYS.installments, JSON.stringify(payload.installments || []));
      localStorage.setItem(STORAGE_KEYS.storage, JSON.stringify(payload.storageAssets || []));
      localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(payload.accountBalances || payload.accounts || {}));
      localStorage.setItem(STORAGE_KEYS.asf, JSON.stringify(payload.asfJobs || []));
      localStorage.setItem(STORAGE_KEYS.irq, JSON.stringify(payload.irqJobs || []));
      localStorage.setItem(STORAGE_KEYS.partTimeJobs, JSON.stringify(payload.partTimeJobs || []));
      localStorage.setItem(STORAGE_KEYS.rates, JSON.stringify(payload.ratesData || payload.rates || {}));
      localStorage.setItem(STORAGE_KEYS.entryActuals, JSON.stringify(payload.entryActuals || {}));
      localStorage.setItem(STORAGE_KEYS.entryActualDates, JSON.stringify(payload.entryActualDates || {}));
      localStorage.setItem(STORAGE_KEYS.deletedForecasts, JSON.stringify(payload.deletedForecasts || []));
      localStorage.setItem(STORAGE_KEYS.archivedEntries, JSON.stringify(payload.archivedEntries || []));
      localStorage.setItem(STORAGE_KEYS.creditDues, JSON.stringify(payload.creditDues || {}));
      localStorage.setItem(STORAGE_KEYS.creditDueMonths, JSON.stringify(payload.creditDueMonths || {}));
      localStorage.setItem(STORAGE_KEYS.creditSettlementOverrides, JSON.stringify(payload.creditSettlementOverrides || {}));
      localStorage.setItem(STORAGE_KEYS.salaryAnchor, JSON.stringify(payload.salaryAnchorMonth || ''));
      localStorage.setItem(STORAGE_KEYS.theme, 'dark');
      localStorage.setItem('budget-control-seed-version', 'blank-template-v2');
      localStorage.setItem('budget-control-salary-materialized', 'true');
    }, sampleData);

    // Reload with seeded data
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const tabs = ['dashboard', 'deficits', 'cashflow', 'history', 'accounts', 'storage', 'jobs', 'rates'];

    for (const tab of tabs) {
      await page.evaluate((t) => {
        const btn = document.querySelector(`.sidebar button[data-view="${t}"]`);
        if (btn) btn.click();
      }, tab);

      await page.waitForTimeout(300);

      // Check overflow
      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });

      console.log(`[${vp.name}] Tab: ${tab} - Horizontal Overflow: ${overflow.hasHorizontalScroll}`);

      await page.screenshot({
        path: path.join(screenshotDir, `${vp.name}-${tab}.png`),
        fullPage: true
      });
    }

    if (vp.name === 'desktop') {
      // Test Entry Modal
      await page.keyboard.press('e');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-entry.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Test Manage Data Tools Modal
      await page.click('#openDataToolsBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-tools.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Test Take Loan Modal
      await page.click('#addLoanBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-loan.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Test Gist Sync Modal
      await page.click('#gistSyncBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-gist.png`) });
      await page.keyboard.press('Escape');
    }

    await context.close();
  }

  await browser.close();
  console.log('UI Audit Complete.');
}

run().catch(console.error);
