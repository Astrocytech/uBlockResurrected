import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for uBlock Resurrected UI Tests
 */
export default defineConfig({
    testDir: './tests/ui',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    
    use: {
        baseURL: 'http://localhost',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
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
                    ],
                },
            },
        },
    ],
    
    webServer: undefined,
});
