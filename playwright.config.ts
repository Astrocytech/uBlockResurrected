import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Zapper and Picker Tests
 * 
 * Tests for uBlock Resurrected zapper and picker features
 * See: reconstructing_docs/Zapper.md, reconstructing_docs/Picker.md
 */
export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'list',
    
    use: {
        baseURL: 'http://localhost',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        headless: true,
    },
    
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: [
                        '--disable-extensions-except',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                    ],
                },
            },
        },
        {
            name: 'chromium-touch',
            use: {
                ...devices['Desktop Chrome'],
                hasTouch: true,
                launchOptions: {
                    args: [
                        '--disable-extensions-except',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                    ],
                },
            },
        },
    ],
    
    webServer: undefined,
});
