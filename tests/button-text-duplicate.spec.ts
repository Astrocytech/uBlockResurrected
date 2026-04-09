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

test('button text should not be duplicated', async () => {
    test.setTimeout(60000);
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-button-text-'));

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

        await page.goto(
            `chrome-extension://${extensionId}/dashboard.html`,
            { waitUntil: 'domcontentloaded' },
        );
        await page.locator('#dashboard-nav .tabButton[data-pane="1p-filters.html"]').click();
        await expect(page.locator('#iframe')).toHaveAttribute('src', /1p-filters\.html$/);
        
        // Wait for iframe to load
        await page.waitForTimeout(2000);
        
        const frame = page.frameLocator('#iframe');
        await frame.locator('body').waitFor();

        // Check button texts
        const applyButton = frame.locator('#userFiltersApply');
        const revertButton = frame.locator('#userFiltersRevert');
        const importButton = frame.locator('#importUserFiltersFromFile');
        const exportButton = frame.locator('#exportUserFiltersToFile');

        // Get the text content of each button
        const applyText = await applyButton.evaluate(el => el.textContent);
        const revertText = await revertButton.evaluate(el => el.textContent);
        const importText = await importButton.evaluate(el => el.textContent);
        const exportText = await exportButton.evaluate(el => el.textContent);

        // Check for duplicates
        const hasApplyDuplicate = applyText.includes('Apply changesApply');
        const hasRevertDuplicate = revertText.includes('RevertRevert');
        const hasImportDuplicate = importText.includes('ImportImport') || importText.includes('Import and appendImport');
        const hasExportDuplicate = exportText.includes('ExportExport');

        expect(hasApplyDuplicate, `Apply button has duplicate text: "${applyText}"`).toBe(false);
        expect(hasRevertDuplicate, `Revert button has duplicate text: "${revertText}"`).toBe(false);
        expect(hasImportDuplicate, `Import button has duplicate text: "${importText}"`).toBe(false);
        expect(hasExportDuplicate, `Export button has duplicate text: "${exportText}"`).toBe(false);

    } finally {
        await context?.close();
        await rm(userDataDir, { recursive: true, force: true });
    }
});