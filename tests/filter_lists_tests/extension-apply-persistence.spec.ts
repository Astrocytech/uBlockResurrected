import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, FrameLocator, Locator } from '@playwright/test';
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

const launchExtension = async (userDataDir: string): Promise<BrowserContext> => {
    return chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: true,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    });
};

const openFilterListsFrame = async (context: BrowserContext): Promise<{ page: Page; frame: FrameLocator }> => {
    const extensionId = await getExtensionId(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#dashboard-nav')).toBeVisible();
    await page.locator('#dashboard-nav .tabButton[data-pane="3p-filters.html"]').click();
    await expect(page.locator('#iframe')).toHaveAttribute('src', /3p-filters\.html$/);
    const frame = page.frameLocator('#iframe');
    await expect(frame.locator('#lists')).toBeVisible({ timeout: 30000 });
    return { page, frame };
};

const revealListEntry = async (frame: FrameLocator, groupKey: string, key: string): Promise<Locator> => {
    const groupEntry = frame.locator(`#lists .listEntry[data-key="${groupKey}"]`).first();
    await expect(groupEntry).toBeVisible({ timeout: 10000 });
    const groupClass = await groupEntry.getAttribute('class');
    if ( /\bexpanded\b/.test(groupClass || '') === false ) {
        await groupEntry.locator('.listExpander').click();
    }
    const entry = frame.locator(`#lists .listEntry[data-key="${key}"]`).first();
    await expect(entry).toBeVisible({ timeout: 10000 });
    return entry;
};

const isEntryChecked = async (entry: Locator): Promise<boolean> => {
    const klass = await entry.getAttribute('class');
    return /\bchecked\b/.test(klass || '');
};

const isButtonClassDisabled = async (button: Locator): Promise<boolean> => {
    const klass = await button.getAttribute('class');
    return /\bdisabled\b/.test(klass || '');
};

test.describe('Filter Lists Extension Apply/Persistence', () => {
    test('can toggle a stock filter list, apply it, and keep it after browser restart', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-filter-lists-'));

        let context: BrowserContext | undefined;
        try {
            context = await launchExtension(userDataDir);
            const firstSession = await openFilterListsFrame(context);
            const firstEntry = await revealListEntry(firstSession.frame, 'ads', 'easylist');
            const before = await isEntryChecked(firstEntry);

            await firstEntry.locator('.detailbar input[type="checkbox"]').click({ force: true });
            await expect(firstSession.frame.locator('#buttonApply')).toBeEnabled({ timeout: 10000 });
            await firstSession.frame.locator('#buttonApply').click();
            await expect
                .poll(async () => isButtonClassDisabled(firstSession.frame.locator('#buttonApply')), {
                    timeout: 30000,
                })
                .toBe(true);

            const afterApply = await isEntryChecked(firstEntry);
            expect(afterApply).toBe(!before);

            await context.close();
            context = undefined;

            context = await launchExtension(userDataDir);
            const secondSession = await openFilterListsFrame(context);
            const secondEntry = await revealListEntry(secondSession.frame, 'ads', 'easylist');
            const afterRestart = await isEntryChecked(secondEntry);

            expect(afterRestart).toBe(afterApply);
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
