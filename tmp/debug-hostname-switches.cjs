const { chromium } = require('playwright');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, rm } = require('node:fs/promises');

(async() => {
  const extensionPath = path.resolve(process.cwd(), 'dist/build/uBlock0.chromium-mv3');
  const server = createServer((req, res) => {
    if (req.url === '/test.js') {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      res.end('window.__externalScriptExecuted = (window.__externalScriptExecuted || 0) + 1;');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body><div class="to-hide">x</div><video id="video"></video><audio id="audio"></audio><script>window.__inlineExecuted=(window.__inlineExecuted||0)+1;</script><script src="/test.js"></script></body></html>`);
  });
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/fixture`;
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-debug-host-'));
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
    const extId = sw.url().match(/^chrome-extension:\/\/([a-z]{32})\//)[1];
    const page = await context.newPage();
    page.on('console', msg => console.log('PAGE console', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE error', err.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const [tab] = await sw.evaluate(async targetURL => {
      const tabs = await chrome.tabs.query({ url: targetURL });
      return tabs.map(tab => ({ id: tab.id, url: tab.url }));
    }, url);
    console.log('tab', tab);
    const popup = await context.newPage();
    popup.on('console', msg => console.log('POPUP console', msg.type(), msg.text()));
    popup.on('pageerror', err => console.log('POPUP error', err.message));
    await popup.goto(`chrome-extension://${extId}/popup-fenix.html?tabId=${tab.id}`, { waitUntil: 'domcontentloaded' });
    console.log('popup url', popup.url());
    console.log('switch count', await popup.locator('#switch').count());
    await popup.waitForTimeout(2000);
    console.log('body class', await popup.locator('body').getAttribute('class'));
    console.log('no-popups count', await popup.locator('#no-popups').count());
    console.log('no-popups class', await popup.locator('#no-popups').getAttribute('class').catch(() => null));
    console.log('click no-popups');
    await popup.locator('#no-popups').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await popup.waitForTimeout(1000);
    console.log('no-popups class after', await popup.locator('#no-popups').getAttribute('class').catch(() => null));
    console.log('window.open result', await page.evaluate(() => window.open('/popup-target', '_blank') === null));
    await popup.reload({ waitUntil: 'domcontentloaded' });
    await popup.waitForTimeout(1000);
    console.log('no-popups badge', await popup.locator('#no-popups .fa-icon-badge').textContent());
    console.log('click no-large-media');
    await popup.locator('#no-large-media').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await popup.waitForTimeout(1000);
    console.log('video display', await page.evaluate(() => getComputedStyle(document.getElementById('video')).display));
    console.log('audio display', await page.evaluate(() => getComputedStyle(document.getElementById('audio')).display));
    console.log('large-media badge', await popup.locator('#no-large-media .fa-icon-badge').textContent());
    console.log('click no-remote-fonts');
    const beforeFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    await popup.locator('#no-remote-fonts').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await popup.waitForTimeout(1000);
    const afterFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    console.log('font before', beforeFont);
    console.log('font after', afterFont);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
