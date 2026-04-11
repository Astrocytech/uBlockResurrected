import { test, chromium } from '@playwright/test';
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

test('debug first run filter state', async () => {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-first-run-debug-'));
    let context: BrowserContext | undefined;
    try {
        context = await launchExtension(userDataDir);
        const serviceWorker = await getServiceWorker(context);
        await new Promise(resolve => setTimeout(resolve, 5000));
        const state = await serviceWorker.evaluate(async () => {
            const storage = await chrome.storage.local.get([
                'selectedFilterLists',
                'availableFilterLists',
                'cosmeticFiltersData',
            ]);
            const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
            return {
                storage,
                dynamicRuleCount: dynamicRules.length,
                sampleRule: dynamicRules[0] || null,
            };
        });
        console.log(JSON.stringify(state, null, 2));
    } finally {
        await context?.close();
        await rm(userDataDir, { recursive: true, force: true });
    }
});
