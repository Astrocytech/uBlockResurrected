import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const root = '/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected';
const extensionPath = path.join(root, 'dist/build/uBlock0.chromium-mv3');

const getExtensionId = async context => {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(serviceWorker.url());
  if (!match) throw new Error(`bad worker url ${serviceWorker.url()}`);
  return match[1];
};

const getServiceWorker = async context => {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return serviceWorker;
};

const openMyRulesPane = async (page, extensionId) => {
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#dashboard-nav .tabButton[data-pane="dyna-rules.html"]').click();
  await page.waitForFunction(() => document.querySelector('#iframe')?.getAttribute('src') === 'dyna-rules.html');
  const frame = page.frameLocator('#iframe');
  await frame.locator('.CodeMirror-merge').waitFor();
  return frame;
};

const setCodeMirrorValue = async (locator, value) => {
  await locator.evaluate((node, nextValue) => {
    node.CodeMirror.setValue(nextValue);
    node.CodeMirror.focus();
  }, value);
};

let appServer;
let resourceServer;
let context;
let userDataDir;
try {
  const hits = new Map();
  const record = (uid, type) => {
    const entry = hits.get(uid) || { image: 0, script: 0 };
    entry[type] += 1;
    hits.set(uid, entry);
  };
  resourceServer = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const uid = url.searchParams.get('uid') || 'default';
    if (url.pathname === '/pixel.png') {
      record(uid, 'image');
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9nW8AAAAASUVORK5CYII=', 'base64'));
      return;
    }
    if (url.pathname === '/third-party.js') {
      record(uid, 'script');
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end('window.__thirdPartyLoaded = true;');
      return;
    }
    res.writeHead(404); res.end('nope');
  });
  await new Promise((resolve, reject) => { resourceServer.listen(0, '0.0.0.0', resolve); resourceServer.once('error', reject); });
  const resourcePort = resourceServer.address().port;
  appServer = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const uid = url.searchParams.get('uid') || 'default';
    if (url.pathname === '/resource-page') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`<!doctype html><html><body><img src="http://127.0.0.2:${resourcePort}/pixel.png?uid=${uid}"><script src="http://127.0.0.2:${resourcePort}/third-party.js?uid=${uid}"></script></body></html>`);
      return;
    }
    res.writeHead(404); res.end('nope');
  });
  await new Promise((resolve, reject) => { appServer.listen(0, '127.0.0.1', resolve); appServer.once('error', reject); });
  const appPort = appServer.address().port;

  userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-valid-'));
  console.log('launching context');
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-sandbox', '--disable-setuid-sandbox'],
  });
  console.log('launched context');
  const extensionId = await getExtensionId(context);
  const serviceWorker = await getServiceWorker(context);
  console.log('extension id', extensionId);
  const page = await context.newPage();
  console.log('created page');
  const frame = await openMyRulesPane(page, extensionId);
  console.log('opened my rules pane');
  const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
  console.log('worker dnr direct', await serviceWorker.evaluate(async () => {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    if (existing.length !== 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map(rule => rule.id),
      });
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: 9999001,
        priority: 1,
        action: { type: 'block' },
        condition: { urlFilter: '||example.com^', resourceTypes: ['script'] },
      }],
    });
    return chrome.declarativeNetRequest.getDynamicRules();
  }));
  console.log('direct response', await page.evaluate(async () => {
    return chrome.runtime.sendMessage({
      topic: 'dashboardModifyRuleset',
      payload: {
        permanent: false,
        toAdd: '* * 3p block',
        toRemove: '',
      },
    });
  }));
  await page.waitForTimeout(500);
  await setCodeMirrorValue(rightEditor, '* * 3p block\n');
  await frame.locator('#editSaveButton').click();
  await page.waitForTimeout(1000);
  console.log('dnr after editSave', await serviceWorker.evaluate(async () => await chrome.declarativeNetRequest.getDynamicRules()));
  const blockedPage = await context.newPage();
  await blockedPage.goto(`http://127.0.0.1:${appPort}/resource-page?uid=valid`, { waitUntil: 'domcontentloaded' });
  await blockedPage.waitForTimeout(1500);
  console.log('hits', hits.get('valid') || { image: 0, script: 0 });
} finally {
  await context?.close();
  await new Promise(resolve => appServer?.close(() => resolve()));
  await new Promise(resolve => resourceServer?.close(() => resolve()));
  await rm(userDataDir, { recursive: true, force: true });
}
