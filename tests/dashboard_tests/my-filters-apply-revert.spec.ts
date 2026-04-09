import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
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

const openMyFiltersPane = async (page: Page, extensionId: string) => {
    await page.goto(
        `chrome-extension://${extensionId}/dashboard.html`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator('#dashboard-nav .tabButton[data-pane="1p-filters.html"]').click();
    await expect(page.locator('#iframe')).toHaveAttribute('src', /1p-filters\.html$/);
    const frame = page.frameLocator('#iframe');
    await expect(frame.locator('.CodeMirror')).toBeVisible();
    return frame;
};

test.describe('Dashboard My Filters', () => {
    test('apply and revert work in the real extension pane', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-my-filters-'));

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
            const messages: string[] = [];
            page.on('console', message => {
                messages.push(`${message.type()}: ${message.text()}`);
            });
            page.on('pageerror', error => {
                messages.push(`pageerror: ${error.message}`);
            });

            const frame = await openMyFiltersPane(page, extensionId);
            const editor = frame.locator('.CodeMirror');
            const applyButton = frame.locator('#userFiltersApply');
            const revertButton = frame.locator('#userFiltersRevert');
            const filterText = 'example.com##.promo-banner\nexample.com##.cta';

            await expect(applyButton).toBeDisabled();
            await expect(revertButton).toBeDisabled();

            await editor.evaluate((node, value) => {
                node.CodeMirror.setValue(value);
                node.CodeMirror.focus();
            }, filterText);

            await expect(applyButton, messages.join('\n')).toBeEnabled();
            await expect(revertButton, messages.join('\n')).toBeEnabled();

            await revertButton.click();
            await expect(applyButton).toBeDisabled();
            await expect(revertButton).toBeDisabled();
            await expect.poll(async () => {
                return editor.evaluate(node => node.CodeMirror.getValue().trim());
            }).toBe('');

            await editor.evaluate((node, value) => {
                node.CodeMirror.setValue(value);
                node.CodeMirror.focus();
            }, filterText);
            await expect(applyButton).toBeEnabled();
            await applyButton.click();

            await expect(applyButton, messages.join('\n')).toBeDisabled();
            await expect(revertButton, messages.join('\n')).toBeDisabled();

            await context.close();
            context = undefined;

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

            const restartedExtensionId = await getExtensionId(context);
            const restartedPage = await context.newPage();
            const restartedFrame = await openMyFiltersPane(restartedPage, restartedExtensionId);
            const restartedEditor = restartedFrame.locator('.CodeMirror');
            const restartedApplyButton = restartedFrame.locator('#userFiltersApply');
            const restartedRevertButton = restartedFrame.locator('#userFiltersRevert');

            await expect.poll(async () => {
                return restartedEditor.evaluate(node => node.CodeMirror.getValue().trim());
            }).toBe(filterText);
            await expect(restartedApplyButton).toBeDisabled();
            await expect(restartedRevertButton).toBeDisabled();
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
