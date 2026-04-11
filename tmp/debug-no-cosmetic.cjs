const { chromium } = require('playwright');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, rm } = require('node:fs/promises');

(async() => {
  const extensionPath = path.resolve(process.cwd(), 'dist/build/uBlock0.chromium-mv3');
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end('<!doctype html><html><body><div class="to-hide">hide me</div></body></html>');
  });
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/fixture`;
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-debug-cos-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  try {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await sw.evaluate(async () => {
      await chrome.storage.local.set({
        'user-filters': '##.to-hide',
        userFilters: '##.to-hide',
        selectedFilterLists: ['user-filters'],
      });
    });
    const extId = sw.url().match(/^chrome-extension:\/\/([a-z]{32})\//)[1];
    const page = await context.newPage();
    page.on('console', msg => console.log('PAGE console', msg.type(), msg.text()));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('display before', await page.evaluate(() => getComputedStyle(document.querySelector('.to-hide')).display));
    const [tab] = await sw.evaluate(async targetURL => {
      const tabs = await chrome.tabs.query({ url: targetURL });
      return tabs.map(tab => ({ id: tab.id, url: tab.url }));
    }, url);
    const popup = await context.newPage();
    popup.on('console', msg => console.log('POPUP console', msg.type(), msg.text()));
    popup.on('pageerror', err => console.log('POPUP error', err.message));
    await popup.goto(`chrome-extension://${extId}/popup-fenix.html?tabId=${tab.id}`, { waitUntil: 'domcontentloaded' });
    await popup.waitForTimeout(1500);
    console.log('class before', await popup.locator('#no-cosmetic-filtering').getAttribute('class'));
    await popup.locator('#no-cosmetic-filtering').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await popup.waitForTimeout(1500);
    console.log('class after', await popup.locator('#no-cosmetic-filtering').getAttribute('class'));
    console.log('storage', await popup.evaluate(async () => (await chrome.storage.local.get('hostnameSwitches')).hostnameSwitches || {}));
    console.log('display after', await page.evaluate(() => getComputedStyle(document.querySelector('.to-hide')).display));
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
