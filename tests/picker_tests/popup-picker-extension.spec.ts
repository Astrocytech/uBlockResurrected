import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

const testHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
    body {
        margin: 0;
        font-family: sans-serif;
    }
    main.content {
        margin: 40px;
        max-width: 480px;
    }
    a.listingsignupbar.infobar {
        display: block;
        padding: 16px;
        border: 1px solid #ccc;
        background: #f4f4f4;
        color: inherit;
        text-decoration: none;
    }
    </style>
</head>
<body>
    <main class="content">
        <a href="/login" class="login-required listingsignupbar__container listingsignupbar infobar">
            <h2 class="listingsignupbar__title">Welcome to Reddit.</h2>
            <p class="listingsignupbar__desc">Come for the cats, stay for the empathy.</p>
            <div class="listingsignupbar__cta-container">
                <span class="c-btn c-btn-primary c-pull-left listingsignupbar__cta-button">Become a Redditor</span>
                <p class="listingsignupbar__cta-desc">and start exploring.</p>
            </div>
        </a>
        <a href="#" class="listingsignupbar__close" title="close">x</a>
    </main>
</body>
</html>`;

const startTestServer = async (): Promise<{ server: Server; url: string }> => {
    const server = createServer((_, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(testHtml);
    });

    await new Promise<void>((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => resolve());
        server.once('error', reject);
    });

    const address = server.address();
    if ( address === null || typeof address === 'string' ) {
        throw new Error('Failed to determine test server address');
    }

    return {
        server,
        url: `http://127.0.0.1:${address.port}/`,
    };
};

const getExtensionId = async (context: BrowserContext): Promise<string> => {
    let [serviceWorker] = context.serviceWorkers();
    if ( serviceWorker === undefined ) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }
    const url = serviceWorker.url();
    const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(url);
    if ( match === null ) {
        throw new Error(`Unexpected extension service worker URL: ${url}`);
    }
    return match[1];
};

test.describe('Popup Picker Extension', () => {
    test('clicking Picker in the real popup injects the element-picker iframe into the active tab', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-picker-'));
        const { server, url } = await startTestServer();

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
            const serviceWorker = context.serviceWorkers()[0]
                ?? await context.waitForEvent('serviceworker');
            const serviceWorkerConsoleMessages: string[] = [];
            serviceWorker.on('console', message => {
                serviceWorkerConsoleMessages.push(`${message.type()}: ${message.text()}`);
            });
            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.bringToFront();

            const [activeTab] = await serviceWorker.evaluate(async targetURL => {
                const tabs = await chrome.tabs.query({
                    url: targetURL,
                });
                return tabs.map(tab => ({
                    id: tab.id,
                    url: tab.url,
                }));
            }, url);
            if ( typeof activeTab?.id !== 'number' ) {
                throw new Error(`Unable to resolve active tab for ${url}`);
            }

            const popupPage = await context.newPage();
            const popupConsoleMessages: string[] = [];
            popupPage.on('console', message => {
                popupConsoleMessages.push(`${message.type()}: ${message.text()}`);
            });
            popupPage.on('pageerror', error => {
                popupConsoleMessages.push(`pageerror: ${error.message}`);
            });
            await popupPage.goto(
                `chrome-extension://${extensionId}/popup-fenix.html?tabId=${activeTab.id}`,
                { waitUntil: 'domcontentloaded' },
            );
            await popupPage.waitForURL(
                new RegExp(`^chrome-extension://${extensionId}/popup-fenix\\.html\\?tabId=${activeTab.id}`),
            );
            await popupPage.bringToFront();

            const popupData = await popupPage.evaluate(async () => {
                await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
                return chrome.tabs.query({
                    active: true,
                    lastFocusedWindow: true,
                });
            });
            void popupData;

            await expect(popupPage.locator('#gotoPick')).toBeVisible();
            await popupPage.locator('#gotoPick').click({ noWaitAfter: true });

            const diagnostics = await serviceWorker.evaluate(async targetURL => {
                const [tab] = await chrome.tabs.query({
                    url: targetURL,
                });
                const tabId = tab?.id;
                if ( typeof tabId !== 'number' ) {
                    return { tabId: null };
                }
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        const maybeVAPI = (self as typeof self & {
                            vAPI?: {
                                pickerFrame?: boolean;
                                userStylesheet?: object;
                                messaging?: object;
                            };
                        }).vAPI;
                        return {
                            href: location.href,
                            iframeCount: document.querySelectorAll('iframe').length,
                            hasVAPI: typeof maybeVAPI === 'object' && maybeVAPI !== null,
                            hasPickerFrameFlag: maybeVAPI?.pickerFrame === true,
                            hasUserStylesheet: typeof maybeVAPI?.userStylesheet === 'object',
                            hasMessaging: typeof maybeVAPI?.messaging === 'object',
                            iframeSrcs: Array.from(document.querySelectorAll('iframe')).map(frame => frame.src),
                        };
                    },
                });
                return {
                    tabId,
                    ...(result?.result ?? {}),
                };
            }, url);
            expect(
                diagnostics,
                `picker diagnostics: ${JSON.stringify(diagnostics)}\npopup console: ${popupConsoleMessages.join('\n')}\nservice worker console: ${serviceWorkerConsoleMessages.join('\n')}`,
            ).toMatchObject({
                tabId: expect.any(Number),
                iframeCount: 1,
            });

            await page.waitForFunction(() => {
                return Array.from(document.querySelectorAll('iframe'))
                    .some(frame => frame.src.includes('/picker-ui.html'));
            });

            const pickerFrameHandle = await page.locator('iframe').elementHandle();
            if ( pickerFrameHandle === null ) {
                throw new Error('Picker iframe did not appear');
            }

            const pickerFrame = await pickerFrameHandle.contentFrame();
            expect(pickerFrame).not.toBeNull();
            await expect(
                pickerFrame!.locator('html#ubol-picker'),
            ).toBeVisible();
        } finally {
            await context?.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('clicking the signup bar shows cosmetic filters and the selected filter in the picker window', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-picker-'));
        const { server, url } = await startTestServer();

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
            const serviceWorker = context.serviceWorkers()[0]
                ?? await context.waitForEvent('serviceworker');
            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.bringToFront();

            const [activeTab] = await serviceWorker.evaluate(async targetURL => {
                const tabs = await chrome.tabs.query({ url: targetURL });
                return tabs.map(tab => ({ id: tab.id, url: tab.url }));
            }, url);
            if ( typeof activeTab?.id !== 'number' ) {
                throw new Error(`Unable to resolve active tab for ${url}`);
            }

            const popupPage = await context.newPage();
            await popupPage.goto(
                `chrome-extension://${extensionId}/popup-fenix.html?tabId=${activeTab.id}`,
                { waitUntil: 'domcontentloaded' },
            );
            await expect(popupPage.locator('#gotoPick')).toBeVisible();
            await popupPage.locator('#gotoPick').click({ noWaitAfter: true });

            const pickerFrameHost = page.locator('iframe[src*="/picker-ui.html"]');
            await expect(pickerFrameHost).toBeVisible();
            const pickerFrameHandle = await pickerFrameHost.elementHandle();
            if ( pickerFrameHandle === null ) {
                throw new Error('Picker iframe did not appear');
            }
            const pickerFrame = await pickerFrameHandle.contentFrame();
            if ( pickerFrame === null ) {
                throw new Error('Picker iframe content frame was unavailable');
            }

            await pickerFrame.locator('#overlay').click({ position: { x: 80, y: 80 } });

            await expect(pickerFrame.locator('#filterText')).toHaveValue('##.listingsignupbar.infobar');
            await expect(pickerFrame.locator('#cosmeticFilters')).toContainText('Cosmetic filters');
            await expect(pickerFrame.locator('#cosmeticFilters li').nth(0)).toHaveText('##.listingsignupbar.infobar');
            await expect(pickerFrame.locator('#cosmeticFilters li').nth(1)).toHaveText('##.content');
        } finally {
            await context?.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
