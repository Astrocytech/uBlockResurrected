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

test.describe('Dashboard Extension', () => {
    test('dashboard.html renders the classic stripped dashboard shell instead of a blank page', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dashboard-'));

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
            const pageMessages: string[] = [];
            page.on('console', message => {
                pageMessages.push(`${message.type()}: ${message.text()}`);
            });
            page.on('pageerror', error => {
                pageMessages.push(`pageerror: ${error.message}`);
            });

            await page.goto(
                `chrome-extension://${extensionId}/dashboard.html`,
                { waitUntil: 'domcontentloaded' },
            );

            await expect(
                page.locator('body'),
                `dashboard console:\n${pageMessages.join('\n')}`,
            ).not.toHaveClass(/notReady/);
            await expect(page.locator('#dashboard-nav')).toBeVisible();
            await expect(page.locator('#dashboard-nav .tabButton[data-pane="settings.html"]')).toHaveText(/Settings/i);
            await expect(page.locator('#dashboard-nav .tabButton[data-pane="3p-filters.html"]')).toHaveText(/Filter lists/i);
            await expect(page.locator('#dashboard-nav .tabButton[data-pane="1p-filters.html"]')).toHaveText(/My filters/i);
            await expect(page.locator('#dashboard-nav .tabButton[data-pane="dyna-rules.html"]')).toHaveText(/My rules/i);
            await expect(page.locator('#dashboard-nav .tabButton[data-pane="whitelist.html"]')).toHaveText(/Trusted sites/i);
            // Note: support.html and about.html are not in lite dashboard shell
            // await expect(page.locator('#dashboard-nav .tabButton[data-pane="support.html"]')).toHaveText(/Support/i);
            // await expect(page.locator('#dashboard-nav .tabButton[data-pane="about.html"]')).toHaveText(/About/i);
            await expect(
                page.locator('#dashboard-nav .tabButton.selected[data-pane="settings.html"]'),
            ).toBeVisible();
            await expect(page.locator('#iframe')).toHaveAttribute('src', /settings\.html$/);
            const frame = page.frameLocator('#iframe');
            await expect(frame.locator('.fieldset').first()).toBeVisible();
            await expect(frame.locator('[data-i18n="settingsCollapseBlockedPrompt"]')).not.toBeEmpty();

            await page.locator('#dashboard-nav .tabButton[data-pane="3p-filters.html"]').click();
            await expect(page.locator('#iframe')).toHaveAttribute('src', /3p-filters\.html$/);
            await expect(frame.locator('#actions')).toBeVisible();
            await expect(frame.locator('#lists')).toBeVisible();
            await expect(frame.locator('#buttonApply')).toBeVisible();

            await page.locator('#dashboard-nav .tabButton[data-pane="1p-filters.html"]').click();
            await expect(page.locator('#iframe')).toHaveAttribute('src', /1p-filters\.html$/);
            await expect(frame.locator('#userFiltersApply')).toBeVisible();
            await expect(frame.locator('#userFilters')).toBeVisible();
            await expect(frame.locator('#enableMyFilters')).toBeVisible();

            await page.locator('#dashboard-nav .tabButton[data-pane="dyna-rules.html"]').click();
            await expect(page.locator('#iframe')).toHaveAttribute('src', /dyna-rules\.html$/);
            await expect(frame.locator('#diff')).toBeVisible();
            await expect(frame.locator('#ruleFilter')).toBeVisible();
            await expect(frame.locator('#commitButton')).toBeVisible();

            await page.locator('#dashboard-nav .tabButton[data-pane="whitelist.html"]').click();
            await expect(page.locator('#iframe')).toHaveAttribute('src', /whitelist\.html$/);
            await expect(frame.locator('#whitelistApply')).toBeVisible();
            await expect(frame.locator('#whitelist')).toBeVisible();

            // Note: support.html and about.html are not in lite dashboard shell
            // await page.locator('#dashboard-nav .tabButton[data-pane="support.html"]').click();
            // await expect(page.locator('#iframe')).toHaveAttribute('src', /support\.html$/);
            // await expect(frame.locator('#filterReport')).toBeVisible();

            // await page.locator('#dashboard-nav .tabButton[data-pane="about.html"]').click();
            // await expect(page.locator('#iframe')).toHaveAttribute('src', /about\.html$/);
            // await expect(page.locator('#dashboard-nav .tabButton.selected[data-pane="about.html"]')).toBeVisible();
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
