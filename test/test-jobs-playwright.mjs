import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runJobsVisualTest() {
  const screenshotDir = 'test/screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const sampleData = JSON.parse(fs.readFileSync('test/sample-data.json', 'utf-8'));
  
  // Launch Playwright using the system Google Chrome
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    console.log('Navigating to app on http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // Seed localStorage
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
      localStorage.setItem(STORAGE_KEYS.theme, 'dark');
      localStorage.setItem('budget-control-seed-version', 'blank-template-v2');
    }, sampleData);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // Switch to Jobs tab
    console.log('Switching to Jobs tab...');
    await page.evaluate(() => {
      const btn = document.querySelector('.sidebar button[data-view="jobs"]') ||
                  document.querySelector('button[data-view="jobs"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // Take overview screenshot
    const overviewPath = path.join(screenshotDir, 'jobs-overview.png');
    await page.screenshot({ path: overviewPath, fullPage: true });
    console.log(`Saved overview screenshot to ${overviewPath}`);

    // Check if job cards exist
    const jobCards = await page.$$('.jobs-job-card');
    console.log(`Found ${jobCards.length} job cards.`);

    if (jobCards.length > 0) {
      // Click 'View Records' or expand on the first job card
      console.log('Expanding first job card...');
      const expandBtn = await page.$('.jobs-toggle-details-btn');
      if (expandBtn) {
        await expandBtn.click();
        await page.waitForTimeout(400);
      }

      // Check subtab navigation (Shifts, Expenses, Payments)
      const subtabBtns = await page.$$('.jobs-subtab-pill');
      console.log(`Found ${subtabBtns.length} subtabs in expanded job.`);

      const expandedShiftsPath = path.join(screenshotDir, 'jobs-expanded-shifts.png');
      await page.screenshot({ path: expandedShiftsPath, fullPage: true });
      console.log(`Saved expanded shifts screenshot to ${expandedShiftsPath}`);

      // Click on Expenses tab
      if (subtabBtns[1]) {
        await subtabBtns[1].click();
        await page.waitForTimeout(300);
        const expensesPath = path.join(screenshotDir, 'jobs-expanded-expenses.png');
        await page.screenshot({ path: expensesPath, fullPage: true });
        console.log(`Saved expanded expenses screenshot to ${expensesPath}`);
      }

      // Click on Payments tab
      if (subtabBtns[2]) {
        await subtabBtns[2].click();
        await page.waitForTimeout(300);
        const paymentsPath = path.join(screenshotDir, 'jobs-expanded-payments.png');
        await page.screenshot({ path: paymentsPath, fullPage: true });
        console.log(`Saved expanded payments screenshot to ${paymentsPath}`);
      }

      // Audit scrollbars and overflow in the expanded tables
      const overflowAudit = await page.evaluate(() => {
        const tableWraps = Array.from(document.querySelectorAll('.jobs-clean-table-wrap'));
        const tables = Array.from(document.querySelectorAll('.jobs-clean-table'));
        return {
          windowScrollWidth: document.documentElement.scrollWidth,
          windowInnerWidth: window.innerWidth,
          hasBodyHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
          tableCount: tables.length,
          tablesWithScrollbars: tableWraps.filter(t => t.scrollHeight > t.clientHeight || t.scrollWidth > t.clientWidth).length
        };
      });
      console.log('Overflow & Scrollbar Audit Result:', JSON.stringify(overflowAudit, null, 2));
    }

    // Also test Mobile Viewport
    console.log('\nTesting Mobile Viewport (390x844)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    // Click Payments subtab on mobile
    const mobileSubtabs = await page.$$('.jobs-subtab-pill');
    if (mobileSubtabs[2]) {
      await mobileSubtabs[2].click();
      await page.waitForTimeout(300);
    }

    const mobilePath = path.join(screenshotDir, 'jobs-mobile.png');
    await page.screenshot({ path: mobilePath, fullPage: true });
    console.log(`Saved mobile screenshot to ${mobilePath}`);

    const mobileAudit = await page.evaluate(() => {
      const activePill = document.querySelector('.jobs-subtab-pill.is-active');
      const nav = document.querySelector('.jobs-subtabs-nav');
      const table = document.querySelector('.jobs-clean-table');
      return {
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        activePillText: activePill ? activePill.textContent.trim() : null,
        navWidth: nav ? nav.offsetWidth : null,
        tableWidth: table ? table.offsetWidth : null,
      };
    });
    console.log('Mobile Audit Result:', JSON.stringify(mobileAudit, null, 2));

    await context.close();
  } finally {
    await browser.close();
  }
}

runJobsVisualTest().catch(console.error);
