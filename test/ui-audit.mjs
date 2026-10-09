import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';

const sampleData = JSON.parse(fs.readFileSync('test/sample-data.json', 'utf-8'));

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

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    console.log('Playwright bundled chromium not found, attempting system Google Chrome channel...');
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch (err2) {
      console.log('Attempting system Chrome executable path directly...');
      const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (fs.existsSync(macPath)) {
        return await chromium.launch({ executablePath: macPath, headless: true });
      }
      throw err2;
    }
  }
}

async function run() {
  const screenshotDir = 'test/screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const serverProcess = await ensureServer(5173);
  let browser;

  try {
    browser = await launchBrowser();
  
  const testViewports = [
    { name: 'mobile-small', width: 320, height: 740 },
    { name: 'tablet', width: 768, height: 1024 },
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
      if (vp.width > 768) {
        const sidebarButton = page.locator(`.sidebar button[data-view="${tab}"]`);
        await sidebarButton.click();
      } else if (['dashboard', 'cashflow', 'deficits', 'history'].includes(tab)) {
        const label = tab === 'cashflow' ? 'Cash Flow' : tab[0].toUpperCase() + tab.slice(1);
        await page.getByRole('navigation', { name: 'Mobile primary navigation' }).getByRole('button', { name: label, exact: true }).click();
      } else {
        const labels = { accounts: 'Accounts', storage: 'Storage', jobs: 'Jobs', rates: 'Rates' };
        await page.getByRole('button', { name: 'More views' }).click();
        await page.getByRole('dialog', { name: 'Menu & Quick Actions' }).getByRole('button', { name: labels[tab], exact: true }).click();
      }

      await page.evaluate(() => window.scrollTo(0, 0));

      await page.waitForTimeout(300);
      await page.evaluate(() => window.scrollTo(0, 0));

      // Check overflow
      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });

      console.log(`[${vp.name}] Tab: ${tab} - Horizontal Overflow: ${overflow.hasHorizontalScroll}`);
      assert.equal(overflow.hasHorizontalScroll, false, `${vp.name}/${tab} has horizontal page overflow`);

      const elementBounds = await page.evaluate(() => {
        const title = document.querySelector('#viewTitle')?.getBoundingClientRect();
        const quickAdd = document.querySelector('.mobile-quick-add-btn')?.getBoundingClientRect();
        const controls = document.querySelector('.cashflow-period-controls');
        const controlsBounds = controls?.getBoundingClientRect();
        const dashboardRows = Array.from(document.querySelectorAll('.dashboard-summary-grid .list-row'));
        const chartLabels = Array.from(document.querySelectorAll('.forecast-x-axis-label'))
          .map((element) => element.getBoundingClientRect())
          .sort((a, b) => a.left - b.left);
        const overlaps = Boolean(title && quickAdd && title.left < quickAdd.right && title.right > quickAdd.left && title.top < quickAdd.bottom && title.bottom > quickAdd.top);
        const periodControlsOverflow = Boolean(controls && controlsBounds && Array.from(controls.querySelectorAll('input[type="date"], .full-list-btn')).some((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > controlsBounds.right + 1 || bounds.left < controlsBounds.left - 1;
        }));
        const dashboardRowOverflow = dashboardRows.some((row) => {
          const rowBounds = row.getBoundingClientRect();
          const paddingRight = Number.parseFloat(getComputedStyle(row).paddingRight) || 0;
          return Array.from(row.children).some((child) => child.getBoundingClientRect().right > rowBounds.right - paddingRight + 1);
        });
        const chartLabelsOverlap = chartLabels.some((bounds, index) => index > 0 && chartLabels[index - 1].right > bounds.left + 1);

        return { overlaps, periodControlsOverflow, dashboardRowOverflow, chartLabelsOverlap };
      });

      if (vp.width <= 768) {
        assert.equal(elementBounds.overlaps, false, `${vp.name}/${tab} topbar title overlaps quick add`);
      }
      if (tab === 'cashflow') {
        assert.equal(elementBounds.periodControlsOverflow, false, `${vp.name} Cashflow period controls exceed their container`);
      }
      if (tab === 'dashboard' && vp.width <= 360) {
        assert.equal(elementBounds.dashboardRowOverflow, false, `${vp.name} Dashboard summary text exceeds its row`);
      }
      if (tab === 'dashboard' && vp.width <= 390) {
        assert.equal(elementBounds.chartLabelsOverlap, false, `${vp.name} Dashboard forecast date labels overlap`);
      }

      await page.screenshot({
        path: path.join(screenshotDir, `${vp.name}-${tab}.png`),
        fullPage: true
      });
    }

    if (vp.name === 'desktop') {
      const closeModal = async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        const openModal = await page.$('dialog.native-dialog[open]');
        if (openModal) {
          const btn = await openModal.$('button[aria-label="Close"], button[aria-label="Close dialog"], button.close-dialog-btn');
          if (btn) await btn.click();
          await page.waitForTimeout(200);
        }
      };

      // Test Entry Modal
      await page.keyboard.press('e');
      await page.waitForTimeout(300);
      const entryDialogHasFocus = await page.evaluate(() => {
        const dialog = document.querySelector('dialog.entry-dialog[open]');
        return Boolean(dialog && dialog.contains(document.activeElement));
      });
      assert.equal(entryDialogHasFocus, true, 'Entry dialog should receive keyboard focus when opened');
      const lastEntryControlHasFocus = await page.evaluate(() => {
        const dialog = document.querySelector('dialog.entry-dialog[open]');
        const focusableElements = Array.from(dialog?.querySelectorAll(
          'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)'
        ) || []).filter((element) => element.getClientRects().length > 0);
        focusableElements?.[focusableElements.length - 1]?.focus();
        return document.activeElement === focusableElements[focusableElements.length - 1];
      });
      assert.equal(lastEntryControlHasFocus, true, 'The final visible entry control should receive focus before boundary testing');
      await page.keyboard.press('Tab');
      const entryDialogKeepsFocus = await page.evaluate(() => {
        const dialog = document.querySelector('dialog.entry-dialog[open]');
        return Boolean(dialog && dialog.contains(document.activeElement));
      });
      assert.equal(entryDialogKeepsFocus, true, 'Tab navigation should remain inside the entry dialog');
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-entry.png`) });
      await closeModal();
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute('data-view')),
        'rates',
        'Closing the entry dialog should return focus to its launcher context'
      );

      // Test Manage Data Tools Modal
      await page.click('#openDataToolsBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-tools.png`) });
      await closeModal();

      // Test Take Loan Modal
      await page.click('#addLoanBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-loan.png`) });
      await closeModal();

      // Test Gist Sync Modal
      await page.click('#gistSyncBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, `desktop-modal-gist.png`) });
      await closeModal();
    }

    if (vp.width <= 768) {
      const moreButton = page.getByRole('button', { name: 'More views' });
      await moreButton.click();

      const actionSheet = page.getByRole('dialog', { name: 'Menu & Quick Actions' });
      const closeButton = actionSheet.getByRole('button', { name: 'Close action sheet' });
      await assert.doesNotReject(() => closeButton.waitFor({ state: 'visible' }));
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Close action sheet');

      await page.keyboard.press('Shift+Tab');
      assert.match(await page.evaluate(() => document.activeElement?.textContent || ''), /Refresh App/);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close action sheet');

      await page.keyboard.press('Escape');
      await actionSheet.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'More views');

      if (vp.width <= 360) {
        const addExpenseButton = page.getByRole('button', { name: 'Add Expense' });
        await addExpenseButton.click();
        const entryDialog = page.getByRole('dialog', { name: 'Add Expense' });
        await entryDialog.waitFor({ state: 'visible' });
        assert.equal(
          await page.evaluate(() => document.querySelector('dialog.entry-dialog')?.contains(document.activeElement)),
          true,
          'Mobile entry dialog should receive keyboard focus'
        );
        await page.keyboard.press('Escape');
        await entryDialog.waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Add Expense');
      }
    }

    await context.close();
  }
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  if (serverProcess) {
    serverProcess.kill();
  }
}
console.log('UI Audit Complete.');
}

run().catch(console.error);
