import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Zapper and Picker Tests
 *
 * Tests for uBlock Resurrected zapper and picker features
 * See: reconstructing_docs/Zapper.md, reconstructing_docs/Picker.md
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 3,
  workers: 1,
  reporter: "list",
  timeout: 180000,
  expect: {
    timeout: 60000,
  },

  use: {
    baseURL: "http://localhost",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
    launchOptions: {
      args: ["--enable-logging", "--v=1"],
    },
  },

  on: {
    trace: "on",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--disable-extensions-except",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
          ],
        },
      },
    },
    {
      name: "chromium-touch",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: true,
        launchOptions: {
          args: [
            "--disable-extensions-except",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
          ],
        },
      },
    },
  ],

  webServer: undefined,
});
