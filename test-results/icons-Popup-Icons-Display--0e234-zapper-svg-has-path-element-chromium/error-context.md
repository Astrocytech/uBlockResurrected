# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: icons.test.ts >> Popup Icons Display >> SVG Content >> zapper_svg_has_path_element
- Location: tests/ui/icons.test.ts:159:9

# Error details

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

```
Error: write EPIPE
```

# Test source

```ts
  1  | /**
  2  |  * Playwright Setup for UI Tests
  3  |  * 
  4  |  * Configures Playwright for extension UI testing.
  5  |  * Handles cases where backend might not be available.
  6  |  */
  7  | 
  8  | import { test as base, chromium, Browser, BrowserContext, Page } from '@playwright/test';
  9  | import { join } from 'path';
  10 | import { mkdirSync } from 'fs';
  11 | 
  12 | const EXTENSION_PATH = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3');
  13 | const SOURCE_PATH = join(process.cwd(), 'src');
  14 | const TEST_URL = 'https://www.example.com/';
  15 | 
  16 | export interface ExtensionTestFixtures {
  17 |     browser: Browser;
  18 |     context: BrowserContext;
  19 |     page: Page;
  20 |     extensionId: string | null;
  21 | }
  22 | 
  23 | function getExtensionId(context: BrowserContext): string | null {
  24 |     const workers = context.serviceWorkers();
  25 |     if (workers.length === 0) return null;
  26 |     const match = workers[0].url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
  27 |     return match ? match[1] : null;
  28 | }
  29 | 
  30 | async function createExtensionContext(
  31 |     options?: { headless?: boolean }
  32 | ): Promise<{ context: BrowserContext; extensionId: string | null }> {
  33 |     const userDataDir = `/tmp/ublock-test-${Date.now()}`;
  34 |     mkdirSync(userDataDir, { recursive: true });
  35 | 
  36 |     const context = await chromium.launchPersistentContext(userDataDir, {
  37 |         headless: false, // MV3 service workers require non-headless mode
  38 |         args: [
  39 |             `--disable-extensions-except=${EXTENSION_PATH}`,
  40 |             `--load-extension=${EXTENSION_PATH}`,
  41 |             '--no-sandbox',
  42 |             '--disable-setuid-sandbox',
  43 |         ],
  44 |         viewport: { width: 1280, height: 720 },
  45 |     });
  46 | 
  47 |     // Wait for service worker to start (MV3 requirement)
  48 |     await new Promise(r => setTimeout(r, 2000));
  49 | 
  50 |     const extensionId = getExtensionId(context);
  51 | 
  52 |     return { context, extensionId };
  53 | }
  54 | 
  55 | // Create the test fixture
  56 | export const test = base.extend<ExtensionTestFixtures>({
  57 |     browser: async ({}, use) => {
  58 |         const browser = await chromium.launch({ headless: false });
  59 |         await use(browser);
  60 |         await browser.close();
  61 |     },
  62 |     
  63 |     context: async ({}, use) => {
  64 |         try {
  65 |             // MV3 service workers require non-headless mode
  66 |             const { context } = await createExtensionContext({ headless: false });
  67 |             await use(context);
> 68 |             await context.close();
     |             ^ Error: write EPIPE
  69 |         } catch (error) {
  70 |             console.error('Failed to create extension context:', error);
  71 |             // Create a basic context without extension as fallback
  72 |             const userDataDir = `/tmp/ublock-basic-test-${Date.now()}`;
  73 |             mkdirSync(userDataDir, { recursive: true });
  74 |             const context = await chromium.launchPersistentContext(userDataDir, {
  75 |                 headless: false,
  76 |                 viewport: { width: 1280, height: 720 },
  77 |             });
  78 |             await use(context);
  79 |             await context.close();
  80 |         }
  81 |     },
  82 |     
  83 |     page: async ({ context }, use) => {
  84 |         const page = context.pages()[0] || await context.newPage();
  85 |         await use(page);
  86 |     },
  87 |     
  88 |     extensionId: async ({ context }, use) => {
  89 |         const id = getExtensionId(context);
  90 |         await use(id);
  91 |     },
  92 | });
  93 | 
  94 | export { expect } from '@playwright/test';
  95 | 
  96 | export { EXTENSION_PATH, SOURCE_PATH, TEST_URL };
  97 | 
```