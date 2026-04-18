import { chromium, expect } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
  '/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected',
  'dist/build/uBlock0.chromium-mv3',
);

const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dashboard-panes-'));
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
  page.on('console', msg => console.log(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[pageerror] ${err.message}`));

  await page.goto(`chrome-extension://${extensionId}/dashboard.html`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.locator('body')).not.toHaveClass(/notReady/);
  console.log('shell ready');

  const panes = [
    'settings.html',
    '3p-filters.html',
    '1p-filters.html',
    'dyna-rules.html',
    'whitelist.html',
  ];

  for (const pane of panes) {
    await page.locator(`#dashboard-nav .tabButton[data-pane="${pane}"]`).click();
    await expect(page.locator('#iframe')).toHaveAttribute('src', new RegExp(pane.replace('.', '\\.')));
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const iframe = document.querySelector('#iframe');
      const frameDoc = iframe?.contentDocument;
      return {
        bodyClass: document.body.className,
        iframeSrc: iframe?.getAttribute('src') ?? null,
        frameHref: iframe?.contentWindow?.location?.href ?? null,
        frameTitle: frameDoc?.title ?? null,
        frameBodyClass: frameDoc?.body?.className ?? null,
        frameHtmlLength: frameDoc?.documentElement?.outerHTML?.length ?? 0,
      };
    });
    console.log(pane, JSON.stringify(info));
  }
} finally {
  await context?.close();
  await rm(userDataDir, { recursive: true, force: true });
}
