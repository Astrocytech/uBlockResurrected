import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Worker } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

const getServiceWorker = async (context: BrowserContext): Promise<Worker> => {
    let [serviceWorker] = context.serviceWorkers();
    if ( serviceWorker === undefined ) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }
    return serviceWorker;
};

const getExtensionId = async (context: BrowserContext): Promise<string> => {
    const serviceWorker = await getServiceWorker(context);
    const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(serviceWorker.url());
    if ( match === null ) {
        throw new Error(`Unexpected extension service worker URL: ${serviceWorker.url()}`);
    }
    return match[1];
};

test.describe('Long-tail MV3 pages', () => {
    test('asset-viewer initializes its editor in the built MV3 extension', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-long-tail-asset-'));
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

            const manifestURL = `chrome-extension://${extensionId}/manifest.json`;
            await page.goto(
                `chrome-extension://${extensionId}/asset-viewer.html?url=${encodeURIComponent(manifestURL)}`,
                { waitUntil: 'domcontentloaded' },
            );

            await expect(
                page.locator('body'),
                `asset-viewer console:\n${pageMessages.join('\n')}`,
            ).not.toHaveClass(/loading/);
            await expect(page.locator('.CodeMirror')).toBeVisible();
            await expect(page.locator('.CodeMirror-gutters')).toBeVisible();
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('devtools receives usable MV3 responses', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-long-tail-devtools-'));
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
                `chrome-extension://${extensionId}/devtools.html`,
                { waitUntil: 'domcontentloaded' },
            );

            await page.locator('#snfe-dump').click();
            await expect(
                page.locator('#console'),
                `devtools console after snfe-dump:\n${pageMessages.join('\n')}`,
            ).toContainText('Dynamic DNR rule count:');

            await page.locator('#snfe-todnr').click();
            await expect(page.locator('#console')).toContainText(
                'Static network filters already use DNR in MV3',
            );

            await page.locator('#purge-all-caches').click();
            await expect(page.locator('#console')).toContainText('Storage used before:');
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('document-blocked can persist the permanent no-strict-blocking switch', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-long-tail-docblocked-'));
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
            const serviceWorker = await getServiceWorker(context);
            const page = await context.newPage();
            const pageMessages: string[] = [];
            page.on('console', message => {
                pageMessages.push(`${message.type()}: ${message.text()}`);
            });
            page.on('pageerror', error => {
                pageMessages.push(`pageerror: ${error.message}`);
            });

            const details = encodeURIComponent(JSON.stringify({
                url: 'https://example.com/path?x=1',
                hn: 'example.com',
                fs: '||example.com^',
            }));

            await page.goto(
                `chrome-extension://${extensionId}/document-blocked.html?details=${details}`,
                { waitUntil: 'domcontentloaded' },
            );

            await expect(
                page.locator('#proceed'),
                `document-blocked console:\n${pageMessages.join('\n')}`,
            ).toBeVisible();

            await page.evaluate(() => {
                return (window as any).vAPI.messaging.send('documentBlocked', {
                    what: 'toggleHostnameSwitch',
                    name: 'no-strict-blocking',
                    hostname: 'example.com',
                    deep: true,
                    state: true,
                    persist: true,
                });
            });

            const permanentSwitches = await serviceWorker.evaluate(async () => {
                const stored = await chrome.storage.local.get('permanentSwitches');
                return stored?.permanentSwitches || {};
            });

            expect(
                permanentSwitches,
                `document-blocked console:\n${pageMessages.join('\n')}`,
            ).toMatchObject({
                'example.com': {
                    'no-strict-blocking': true,
                },
            });
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
