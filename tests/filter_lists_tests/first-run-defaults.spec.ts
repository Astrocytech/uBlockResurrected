import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Worker } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

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

const getServiceWorker = async (context: BrowserContext): Promise<Worker> => {
    let [serviceWorker] = context.serviceWorkers();
    if ( serviceWorker === undefined ) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }
    return serviceWorker;
};

test.describe('Filter Lists First Run Defaults', () => {
    test('bootstraps default selected filter lists and installs DNR rules on a fresh profile', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-filter-defaults-'));

        let context: BrowserContext | undefined;
        try {
            context = await launchExtension(userDataDir);
            const serviceWorker = await getServiceWorker(context);

            const readState = async () => {
                return serviceWorker.evaluate(async () => {
                    const storage = await chrome.storage.local.get([
                        'selectedFilterLists',
                        'availableFilterLists',
                    ]);
                    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
                    return {
                        selectedFilterLists: Array.isArray(storage.selectedFilterLists)
                            ? storage.selectedFilterLists
                            : [],
                        availableCount: storage.availableFilterLists &&
                            typeof storage.availableFilterLists === 'object'
                            ? Object.keys(storage.availableFilterLists).length
                            : 0,
                        dynamicRuleCount: dynamicRules.length,
                    };
                });
            };

            await expect.poll(async () => (await readState()).selectedFilterLists.length, {
                timeout: 30000,
            }).toBeGreaterThan(1);

            await expect.poll(async () => (await readState()).dynamicRuleCount, {
                timeout: 30000,
            }).toBeGreaterThan(0);

            const result = await readState();

            expect(result.selectedFilterLists.length).toBeGreaterThan(1);
            expect(result.selectedFilterLists).toContain('user-filters');
            expect(result.availableCount).toBeGreaterThan(1);
            expect(result.dynamicRuleCount).toBeGreaterThan(0);
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
