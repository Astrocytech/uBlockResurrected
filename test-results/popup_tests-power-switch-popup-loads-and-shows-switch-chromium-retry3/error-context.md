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
  1  | import { test, expect, chromium } from "@playwright/test";
  2  | import { createServer } from "node:http";
  3  | import { mkdtemp, rm } from "node:fs/promises";
  4  | import os from "node:os";
  5  | 
  6  | const extPath = process.cwd() + "/dist/build/uBlock0.chromium-mv3";
  7  | 
  8  | test("popup loads and shows switch", async () => {
  9  |   const server = createServer((_, r) => {
  10 |     r.writeHead(200);
  11 |     r.end("<h1>Test</h1>");
  12 |   });
  13 |   server.listen(0);
  14 |   const pageUrl = `http://localhost:${(server.address() as any).port}/`;
  15 | 
  16 |   const udir = await mkdtemp(os.tmpdir() + "/t-");
  17 |   const ctx = await chromium.launchPersistentContext(udir, {
  18 |     channel: "chromium",
  19 |     headless: true,
  20 |     args: [
  21 |       `--disable-extensions-except=${extPath}`,
  22 |       `--load-extension=${extPath}`,
  23 |       "--no-sandbox",
  24 |       "--disable-setuid-sandbox",
  25 |     ],
  26 |   });
  27 | 
  28 |   const page = await ctx.newPage();
  29 |   await page.goto(pageUrl);
  30 |   let navigationCount = 0;
  31 |   page.on("framenavigated", (frame) => {
  32 |     if (frame === page.mainFrame()) {
  33 |       navigationCount += 1;
  34 |     }
  35 |   });
  36 | 
  37 |   let sw = ctx.serviceWorkers()[0];
  38 |   if (!sw) sw = await ctx.waitForEvent("serviceworker");
  39 |   const extId = sw.url().match(/chrome-extension:\/\/(\w+)\//)?.[1] || "";
  40 | 
  41 |   const popup = await ctx.newPage();
  42 |   await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, {
  43 |     waitUntil: "domcontentloaded",
  44 |   });
  45 | 
  46 |   await popup.waitForSelector("#switch");
  47 | 
  48 |   // Switch should exist
  49 |   const count = await popup.locator("#switch").count();
  50 |   expect(count).toBe(1);
  51 | 
  52 |   // Click using evaluate to ensure it fires in page context
  53 |   await popup.locator("#switch").click();
  54 |   await popup.waitForTimeout(500);
  55 | 
  56 |   // Check if click registered - if not, try clicking directly from page
  57 |   let cls = await popup.locator("body").getAttribute("class");
  58 |   if (!cls?.includes("off")) {
  59 |     await popup.evaluate(() => {
  60 |       document.querySelector("#switch")?.click();
  61 |     });
  62 |     await popup.waitForTimeout(300);
  63 |   }
  64 | 
  65 |   // Body should now have 'off' class
  66 |   const finalCls = await popup.locator("body").getAttribute("class");
> 67 |   expect(finalCls).toContain("off");
     |                    ^ Error: expect(received).toContain(expected) // indexOf
  68 | 
  69 |   await expect(popup.locator("#gotoZap")).toBeHidden();
  70 |   await expect(popup.locator("#gotoPick")).toBeHidden();
  71 |   await expect(popup.locator("#gotoReport")).toBeHidden();
  72 | 
  73 |   const storedFiltering = await popup.evaluate(async () => {
  74 |     const items = await chrome.storage.local.get("perSiteFiltering");
  75 |     return items.perSiteFiltering || {};
  76 |   });
  77 |   expect(storedFiltering["localhost"]).toBe(false);
  78 | 
  79 |   const dynamicRules = await popup.evaluate(async () => {
  80 |     return await chrome.declarativeNetRequest.getDynamicRules();
  81 |   });
  82 |   expect(
  83 |     dynamicRules.some((rule) => rule.action?.type === "allowAllRequests"),
  84 |   ).toBe(true);
  85 |   expect(navigationCount).toBe(0);
  86 | 
  87 |   await ctx.close();
  88 |   await rm(udir, { force: true, recursive: true });
  89 |   server.close();
  90 | });
  91 | 
```