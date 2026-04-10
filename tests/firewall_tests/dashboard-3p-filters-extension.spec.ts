import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

const getExtensionId = async (context: BrowserContext): Promise<string> => {
    let [serviceWorker] = context.serviceWorkers();
    if ( serviceWorker === undefined ) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }
    const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(serviceWorker.url());
    if ( match === null ) {
        throw new Error(`Unexpected extension service worker URL: ${serviceWorker.url()}`);
    }
    return match[1];
};

test.describe('Dashboard 3p-filters Pane', () => {
    test('dashboard shell navigates to 3p-filters and shows lists container', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-3p-filters-'));

        let context: BrowserContext | undefined;
        try {
            context = await chromium.launchPersistentContext(userDataDir, {
                channel: 'chromium',
                headless: true,
                args: [
                    `--disable-extensions-except=${extensionPath}`,
                    `--load-extension=${extensionPath}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            });

            const extensionId = await getExtensionId(context);
            const page = await context.newPage();

            // Navigate to dashboard
            const dashboardURL = `chrome-extension://${extensionId}/dashboard.html`;
            await page.goto(dashboardURL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            // Verify dashboard nav exists
            await expect(page.locator('#dashboard-nav')).toBeVisible();

            // Click the Filter Lists tab
            await page.locator('#dashboard-nav .tabButton[data-pane="3p-filters.html"]').click();
            await page.waitForTimeout(2000);

            // Verify the iframe is loaded with 3p-filters
            await expect(page.locator('#iframe')).toHaveAttribute('src', /3p-filters\.html$/);

            // Switch to iframe and check key elements
            const frame = page.frameLocator('#iframe');
            
            // The lists container should exist (may be empty but should be present)
            const listsContainer = frame.locator('#lists');
            await expect(listsContainer).toBeVisible({ timeout: 10000 });

            // Button container should exist
            const actions = frame.locator('#actions');
            await expect(actions).toBeVisible();

        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('3p-filters shows apply and update buttons', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-3p-filters-buttons-'));

        let context: BrowserContext | undefined;
        try {
            context = await chromium.launchPersistentContext(userDataDir, {
                channel: 'chromium',
                headless: true,
                args: [
                    `--disable-extensions-except=${extensionPath}`,
                    `--load-extension=${extensionPath}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            });

            const extensionId = await getExtensionId(context);
            const page = await context.newPage();

            const dashboardURL = `chrome-extension://${extensionId}/dashboard.html`;
            await page.goto(dashboardURL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            await page.locator('#dashboard-nav .tabButton[data-pane="3p-filters.html"]').click();
            await page.waitForTimeout(2000);

            const frame = page.frameLocator('#iframe');
            
            // Check Apply button exists
            await expect(frame.locator('#buttonApply')).toBeVisible();
            await expect(frame.locator('#buttonApply')).toContainText(/apply/i);
            
            // Check Update button exists  
            await expect(frame.locator('#buttonUpdate')).toBeVisible();
            await expect(frame.locator('#buttonUpdate')).toContainText(/update/i);

            await expect(frame.locator('label[for="autoUpdate"], #autoUpdate')).toBeVisible();
            await expect(frame.locator('body')).toContainText(/auto-update|auto update/i);
            await expect(frame.locator('body')).toContainText(/parse cosmetic/i);
            await expect(frame.locator('body')).toContainText(/ignore generic/i);

        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
