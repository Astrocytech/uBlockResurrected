import { chromium } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
  '/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected',
  'dist/build/uBlock0.chromium-mv3',
);

const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dashboard-debug-'));
let context;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(serviceWorker.url());
  if (!match) {
    throw new Error(`Unexpected service worker URL: ${serviceWorker.url()}`);
  }
  const extensionId = match[1];

  const page = await context.newPage();
  page.on('console', msg => {
    console.log(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.log(`[pageerror] ${err.message}`);
  });

  await page.goto(`chrome-extension://${extensionId}/dashboard.html`, {
    waitUntil: 'domcontentloaded',
  });

  await page.waitForTimeout(5000);

  const info = await page.evaluate(() => {
    const body = document.body;
    const iframe = document.querySelector('#iframe');
    return {
      bodyClass: body?.className ?? null,
      title: document.title,
      dashboardNav: !!document.querySelector('#dashboard-nav'),
      selectedTab: document.querySelector('#dashboard-nav .tabButton.selected')?.getAttribute('data-pane') ?? null,
      iframeSrc: iframe?.getAttribute('src') ?? null,
      hasVapi: typeof globalThis.vAPI === 'object',
      hasMessaging: typeof globalThis.vAPI?.messaging === 'object',
      hasLocalStorageApi: typeof globalThis.vAPI?.localStorage === 'object',
    };
  });

  console.log(JSON.stringify(info, null, 2));
} finally {
  await context?.close();
  await rm(userDataDir, { recursive: true, force: true });
}
