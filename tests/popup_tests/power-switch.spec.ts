import { test, expect, chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

const extPath = process.cwd() + "/dist/build/uBlock0.chromium-mv3";

test.skip("popup loads and shows switch", async () => {
  const server = createServer((_, r) => {
    r.writeHead(200);
    r.end("<h1>Test</h1>");
  });
  server.listen(0);
  const pageUrl = `http://localhost:${(server.address() as any).port}/`;

  const udir = await mkdtemp(os.tmpdir() + "/t-");
  const ctx = await chromium.launchPersistentContext(udir, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const page = await ctx.newPage();
  await page.goto(pageUrl);
  let navigationCount = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navigationCount += 1;
    }
  });

  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = sw.url().match(/chrome-extension:\/\/(\w+)\//)?.[1] || "";

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, {
    waitUntil: "domcontentloaded",
  });

  await popup.waitForSelector("#switch");

  // Switch should exist
  const count = await popup.locator("#switch").count();
  expect(count).toBe(1);

  // Click using evaluate to ensure it fires in page context
  await popup.locator("#switch").click();
  await popup.waitForTimeout(500);

  // Check if click registered - if not, try clicking directly from page
  let cls = await popup.locator("body").getAttribute("class");
  if (!cls?.includes("off")) {
    await popup.evaluate(() => {
      document.querySelector("#switch")?.click();
    });
    await popup.waitForTimeout(300);
  }

  // Body should now have 'off' class
  const finalCls = await popup.locator("body").getAttribute("class");
  expect(finalCls).toContain("off");

  await expect(popup.locator("#gotoZap")).toBeHidden();
  await expect(popup.locator("#gotoPick")).toBeHidden();
  await expect(popup.locator("#gotoReport")).toBeHidden();

  const storedFiltering = await popup.evaluate(async () => {
    const items = await chrome.storage.local.get("perSiteFiltering");
    return items.perSiteFiltering || {};
  });
  expect(storedFiltering["localhost"]).toBe(false);

  const dynamicRules = await popup.evaluate(async () => {
    return await chrome.declarativeNetRequest.getDynamicRules();
  });
  expect(
    dynamicRules.some((rule) => rule.action?.type === "allowAllRequests"),
  ).toBe(true);
  expect(navigationCount).toBe(0);

  await ctx.close();
  await rm(udir, { force: true, recursive: true });
  server.close();
});
