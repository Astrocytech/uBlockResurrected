# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: popup_tests/power-switch.spec.ts >> popup loads and shows switch
- Location: tests/popup_tests/power-switch.spec.ts:8:1

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Matcher error: received value must not be null nor undefined

Received has value: null
```

# Test source

```ts
  1  | import { test, expect, chromium } from '@playwright/test';
  2  | import { createServer } from 'node:http';
  3  | import { mkdtemp, rm } from 'node:fs/promises';
  4  | import os from 'node:os';
  5  | 
  6  | const extPath = process.cwd() + '/dist/build/uBlock0.chromium-mv3';
  7  | 
  8  | test('popup loads and shows switch', async () => {
  9  |     const server = createServer((_, r) => { r.writeHead(200); r.end('<h1>Test</h1>'); });
  10 |     server.listen(0);
  11 |     const pageUrl = `http://localhost:${(server.address() as any).port}/`;
  12 |     
  13 |     const udir = await mkdtemp(os.tmpdir() + '/t-');
  14 |     const ctx = await chromium.launchPersistentContext(udir, {
  15 |         channel: 'chromium',
  16 |         headless: true,
  17 |         args: [
  18 |             `--disable-extensions-except=${extPath}`,
  19 |             `--load-extension=${extPath}`,
  20 |             '--no-sandbox',
  21 |             '--disable-setuid-sandbox',
  22 |         ],
  23 |     });
  24 |     
  25 |     const page = await ctx.newPage();
  26 |     await page.goto(pageUrl);
  27 |     let navigationCount = 0;
  28 |     page.on('framenavigated', frame => {
  29 |         if (frame === page.mainFrame()) {
  30 |             navigationCount += 1;
  31 |         }
  32 |     });
  33 |     
  34 |     let sw = ctx.serviceWorkers()[0];
  35 |     if (!sw) sw = await ctx.waitForEvent('serviceworker');
  36 |     const extId = sw.url().match(/chrome-extension:\/\/(\w+)\//)?.[1] || '';
  37 |     
  38 |     const popup = await ctx.newPage();
  39 |     await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { waitUntil: 'domcontentloaded' });
  40 |     
  41 |     await popup.waitForSelector('#switch');
  42 | 
  43 |     // Switch should exist
  44 |     const count = await popup.locator('#switch').count();
  45 |     expect(count).toBe(1);
  46 |     
  47 |     await popup.locator('#switch').click({ force: true });
  48 |     await popup.waitForTimeout(200);
  49 |     
  50 |     // Body should now have 'off' class
  51 |     const cls = await popup.locator('body').getAttribute('class');
> 52 |     expect(cls).toContain('off');
     |                 ^ Error: expect(received).toContain(expected) // indexOf
  53 | 
  54 |     await expect(popup.locator('#gotoZap')).toBeHidden();
  55 |     await expect(popup.locator('#gotoPick')).toBeHidden();
  56 |     await expect(popup.locator('#gotoReport')).toBeHidden();
  57 | 
  58 |     const storedFiltering = await popup.evaluate(async () => {
  59 |         const items = await chrome.storage.local.get('perSiteFiltering');
  60 |         return items.perSiteFiltering || {};
  61 |     });
  62 |     expect(storedFiltering['localhost']).toBe(false);
  63 | 
  64 |     const dynamicRules = await popup.evaluate(async () => {
  65 |         return await chrome.declarativeNetRequest.getDynamicRules();
  66 |     });
  67 |     expect(dynamicRules.some(rule => rule.action?.type === 'allowAllRequests')).toBe(true);
  68 |     expect(navigationCount).toBe(0);
  69 |     
  70 |     await ctx.close();
  71 |     await rm(udir, { force: true, recursive: true });
  72 |     server.close();
  73 | });
  74 | 
```