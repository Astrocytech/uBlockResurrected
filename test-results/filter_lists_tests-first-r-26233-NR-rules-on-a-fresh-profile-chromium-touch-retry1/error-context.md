# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: filter_lists_tests/first-run-defaults.spec.ts >> Filter Lists First Run Defaults >> bootstraps default selected filter lists and installs DNR rules on a fresh profile
- Location: tests/filter_lists_tests/first-run-defaults.spec.ts:34:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0

Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Test source

```ts
  1  | import { test, expect, chromium } from '@playwright/test';
  2  | import type { BrowserContext, Worker } from '@playwright/test';
  3  | import os from 'node:os';
  4  | import path from 'node:path';
  5  | import { mkdtemp, rm } from 'node:fs/promises';
  6  | 
  7  | const extensionPath = path.resolve(
  8  |     process.cwd(),
  9  |     'dist/build/uBlock0.chromium-mv3',
  10 | );
  11 | 
  12 | const launchExtension = async (userDataDir: string): Promise<BrowserContext> => {
  13 |     return chromium.launchPersistentContext(userDataDir, {
  14 |         channel: 'chromium',
  15 |         headless: true,
  16 |         args: [
  17 |             `--disable-extensions-except=${extensionPath}`,
  18 |             `--load-extension=${extensionPath}`,
  19 |             '--no-sandbox',
  20 |             '--disable-setuid-sandbox',
  21 |         ],
  22 |     });
  23 | };
  24 | 
  25 | const getServiceWorker = async (context: BrowserContext): Promise<Worker> => {
  26 |     let [serviceWorker] = context.serviceWorkers();
  27 |     if ( serviceWorker === undefined ) {
  28 |         serviceWorker = await context.waitForEvent('serviceworker');
  29 |     }
  30 |     return serviceWorker;
  31 | };
  32 | 
  33 | test.describe('Filter Lists First Run Defaults', () => {
  34 |     test('bootstraps default selected filter lists and installs DNR rules on a fresh profile', async () => {
  35 |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-filter-defaults-'));
  36 | 
  37 |         let context: BrowserContext | undefined;
  38 |         try {
  39 |             context = await launchExtension(userDataDir);
  40 |             const serviceWorker = await getServiceWorker(context);
  41 | 
  42 |             const readState = async () => {
  43 |                 return serviceWorker.evaluate(async () => {
  44 |                     const storage = await chrome.storage.local.get([
  45 |                         'selectedFilterLists',
  46 |                         'availableFilterLists',
  47 |                     ]);
  48 |                     const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
  49 |                     return {
  50 |                         selectedFilterLists: Array.isArray(storage.selectedFilterLists)
  51 |                             ? storage.selectedFilterLists
  52 |                             : [],
  53 |                         availableCount: storage.availableFilterLists &&
  54 |                             typeof storage.availableFilterLists === 'object'
  55 |                             ? Object.keys(storage.availableFilterLists).length
  56 |                             : 0,
  57 |                         dynamicRuleCount: dynamicRules.length,
  58 |                     };
  59 |                 });
  60 |             };
  61 | 
  62 |             await expect.poll(async () => (await readState()).selectedFilterLists.length, {
  63 |                 timeout: 30000,
  64 |             }).toBeGreaterThan(1);
  65 | 
> 66 |             await expect.poll(async () => (await readState()).dynamicRuleCount, {
     |             ^ Error: expect(received).toBeGreaterThan(expected)
  67 |                 timeout: 30000,
  68 |             }).toBeGreaterThan(0);
  69 | 
  70 |             const result = await readState();
  71 | 
  72 |             expect(result.selectedFilterLists.length).toBeGreaterThan(1);
  73 |             expect(result.selectedFilterLists).toContain('user-filters');
  74 |             expect(result.availableCount).toBeGreaterThan(1);
  75 |             expect(result.dynamicRuleCount).toBeGreaterThan(0);
  76 |         } finally {
  77 |             await context?.close();
  78 |             await rm(userDataDir, { recursive: true, force: true });
  79 |         }
  80 |     });
  81 | });
  82 | 
```