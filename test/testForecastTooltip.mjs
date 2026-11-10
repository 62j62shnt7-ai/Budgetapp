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
  const page = await browser.newPage({ viewport: { width: 637, height: 868 } });
  page.setDefaultTimeout(8000);
  await page.goto('http://localhost:5173');
  await page.evaluate(() => {
    localStorage.clear();
    const entries = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 10 + index, 15));
      return {
        id: `tooltip-entry-${index}`,
        date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
        category: `Expense ${index + 1}`,
        account: 'hsbc',
        type: 'expense',
        amount: 1000 + index * 100,
        currency: 'EGP',
      };
    });
    localStorage.setItem('budget-control-cash-entries', JSON.stringify(entries));
  });
  await page.reload();

  const chart = page.locator('#forecastLineChartContainer');
  await chart.waitFor({ state: 'visible' });
  await chart.scrollIntoViewIfNeeded();
  const svg = chart.locator('svg.forecast-line-svg');
  const box = await svg.boundingBox();
  assert.ok(box, 'forecast chart is visible');
  const hitArea = svg.locator('rect[fill="transparent"]').last();
  const hitBox = await hitArea.boundingBox();
  assert.ok(hitBox, 'chart has an interactive hover area');
  await page.mouse.move(hitBox.x + hitBox.width - 2, hitBox.y + hitBox.height * 0.3);

  const tooltip = page.locator('.forecast-tooltip');
  await tooltip.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const element = document.querySelector('.forecast-tooltip');
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.left >= 7 && rect.right <= document.documentElement.clientWidth - 7
      && rect.top >= 7 && rect.bottom <= document.documentElement.clientHeight - 7;
  });
  const bounds = await tooltip.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  assert.ok(bounds.left >= 7, `tooltip left edge should be visible, got ${bounds.left}`);
  assert.ok(bounds.right <= 630, `tooltip right edge should be visible, got ${bounds.right}`);
  assert.ok(bounds.top >= 7, `tooltip top edge should be visible, got ${bounds.top}`);
  assert.ok(bounds.bottom <= 861, `tooltip bottom edge should be visible, got ${bounds.bottom}`);
  console.log('Forecast chart tooltip stays within viewport edges.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
