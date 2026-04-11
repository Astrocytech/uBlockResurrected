import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.cwd(), 'dist/build/uBlock0.chromium-mv3');

const launchExtensionContext = async (userDataDir: string): Promise<BrowserContext> => {
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

const getExtensionId = async (context: BrowserContext): Promise<string> => {
    const serviceWorker = await getServiceWorker(context);
    const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(serviceWorker.url());
    if ( match === null ) {
        throw new Error(`Unexpected extension service worker URL: ${serviceWorker.url()}`);
    }
    return match[1];
};

const getTabIdForURL = async (serviceWorker: Worker, targetURL: string): Promise<number> => {
    const [activeTab] = await serviceWorker.evaluate(async url => {
        const tabs = await chrome.tabs.query({ url });
        return tabs.map(tab => ({ id: tab.id, url: tab.url }));
    }, targetURL);
    if ( typeof activeTab?.id !== 'number' ) {
        throw new Error(`Unable to resolve active tab for ${targetURL}`);
    }
    return activeTab.id;
};

const openPopupForTab = async (
    context: BrowserContext,
    extensionId: string,
    tabId: number,
): Promise<Page> => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup-fenix.html?tabId=${tabId}`, {
        waitUntil: 'domcontentloaded',
    });
    await popupPage.waitForSelector('#switch');
    await expect(popupPage.locator('body')).not.toHaveClass(/loading/);
    return popupPage;
};

const dispatchClick = async (page: Page, selector: string): Promise<void> => {
    await page.locator(selector).evaluate(element => {
        element.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        }));
    });
};

const getHostnameSwitches = async (page: Page) => {
    return page.evaluate(async () => {
        const items = await chrome.storage.local.get('hostnameSwitches');
        return items.hostnameSwitches || {};
    });
};

const startTestServer = async (): Promise<{ server: Server; baseURL: string }> => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if ( url.pathname === '/test.js' ) {
            res.writeHead(200, {
                'content-type': 'application/javascript; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end('window.__externalScriptExecuted = (window.__externalScriptExecuted || 0) + 1;');
            return;
        }
        if ( url.pathname === '/font.woff2' ) {
            res.writeHead(200, {
                'content-type': 'font/woff2',
                'cache-control': 'no-store',
            });
            res.end(Buffer.from('d09GMgABAAAAA', 'base64'));
            return;
        }
        if ( url.pathname === '/popup-target' ) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><html><body>popup</body></html>');
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(`<!doctype html>
<html>
<head>
    <style>
        @font-face {
            font-family: "RemoteFixture";
            src: url("/font.woff2") format("woff2");
        }
        body { font-family: serif; }
        .to-hide { width: 32px; height: 32px; background: red; }
    </style>
</head>
<body>
    <div class="to-hide">hidden fixture</div>
    <button id="popup-opener" onclick="window.open('/popup-target', '_blank')">popup</button>
    <video id="video" controls></video>
    <audio id="audio" controls></audio>
    <script>window.__inlineExecuted = (window.__inlineExecuted || 0) + 1;</script>
    <script src="/test.js"></script>
</body>
</html>`);
    });

    await new Promise<void>((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => resolve());
        server.once('error', reject);
    });

    const address = server.address();
    if ( address === null || typeof address === 'string' ) {
        throw new Error('Unable to resolve test server address');
    }
    return {
        server,
        baseURL: `http://127.0.0.1:${address.port}`,
    };
};

test.describe('Popup hostname switches', () => {
    test('no-popups, no-large-media, and no-remote-fonts apply to the live page and persist', async () => {
        const { server, baseURL } = await startTestServer();
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-host-switches-'));

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);
            const page = await context.newPage();
            await page.goto(`${baseURL}/fixture`, { waitUntil: 'domcontentloaded' });
            const tabId = await getTabIdForURL(serviceWorker, `${baseURL}/fixture`);
            const popup = await openPopupForTab(context, extensionId, tabId);

            await dispatchClick(popup, '#moreButton');
            await expect(popup.locator('#no-popups')).not.toHaveClass(/on/);
            await expect(popup.locator('#no-large-media')).not.toHaveClass(/on/);
            await expect(popup.locator('#no-remote-fonts')).not.toHaveClass(/on/);
            await expect.poll(() => getHostnameSwitches(popup)).toEqual({});

            await dispatchClick(popup, '#no-popups');
            await expect(popup.locator('#no-popups')).toHaveClass(/on/);
            await expect
                .poll(async () => page.evaluate(() => window.open('/popup-target', '_blank') === null))
                .toBe(true);
            await popup.reload({ waitUntil: 'domcontentloaded' });
            await expect(popup.locator('#no-popups .fa-icon-badge')).toHaveText('1');

            await dispatchClick(popup, '#no-large-media');
            await expect(popup.locator('#no-large-media')).toHaveClass(/on/);
            await expect
                .poll(async () => page.evaluate(() => {
                    const video = document.getElementById('video');
                    const audio = document.getElementById('audio');
                    return {
                        video: video ? getComputedStyle(video).display : '',
                        audio: audio ? getComputedStyle(audio).display : '',
                    };
                }))
                .toEqual({ video: 'none', audio: 'none' });
            await expect(popup.locator('#no-large-media .fa-icon-badge')).toHaveText('2');

            const beforeFontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
            await dispatchClick(popup, '#no-remote-fonts');
            await expect(popup.locator('#no-remote-fonts')).toHaveClass(/on/);
            await expect
                .poll(async () => page.evaluate(() => getComputedStyle(document.body).fontFamily))
                .not.toBe(beforeFontFamily);

            const hostnameSwitches = await getHostnameSwitches(popup);
            expect(hostnameSwitches['127.0.0.1']['no-popups']).toBe(true);
            expect(hostnameSwitches['127.0.0.1']['no-large-media']).toBe(true);
            expect(hostnameSwitches['127.0.0.1']['no-remote-fonts']).toBe(true);

            const dynamicRules = await popup.evaluate(async () => chrome.declarativeNetRequest.getDynamicRules());
            expect(dynamicRules.some(rule =>
                rule.condition?.resourceTypes?.includes('media') &&
                rule.condition?.initiatorDomains?.includes('127.0.0.1')
            )).toBe(true);
            expect(dynamicRules.some(rule =>
                rule.condition?.resourceTypes?.includes('font') &&
                rule.condition?.initiatorDomains?.includes('127.0.0.1')
            )).toBe(true);
        } finally {
            await context?.close();
            await rm(userDataDir, { force: true, recursive: true });
            server.close();
        }
    });

    test('no-cosmetic-filtering and no-scripting do not auto-reload but take effect after toggle/reload', async () => {
        const { server, baseURL } = await startTestServer();
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-host-switches-'));

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            await serviceWorker.evaluate(async () => {
                await chrome.storage.local.set({
                    'user-filters': '##.to-hide',
                    userFilters: '##.to-hide',
                    selectedFilterLists: [ 'user-filters' ],
                });
            });

            const page = await context.newPage();
            let navigationCount = 0;
            page.on('framenavigated', frame => {
                if ( frame === page.mainFrame() ) {
                    navigationCount += 1;
                }
            });
            await page.goto(`${baseURL}/fixture`, { waitUntil: 'domcontentloaded' });
            await expect
                .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector('.to-hide') as Element).display))
                .toBe('none');

            const tabId = await getTabIdForURL(serviceWorker, `${baseURL}/fixture`);
            const popup = await openPopupForTab(context, extensionId, tabId);

            await dispatchClick(popup, '#no-cosmetic-filtering');
            await expect(popup.locator('#no-cosmetic-filtering')).toHaveClass(/on/);
            await expect(popup.locator('body')).toHaveClass(/needReload/);

            await dispatchClick(popup, '#no-scripting');
            await expect(popup.locator('#no-scripting')).toHaveClass(/on/);
            expect(navigationCount).toBe(1);

            const hostnameSwitches = await getHostnameSwitches(popup);
            expect(hostnameSwitches['127.0.0.1']['no-cosmetic-filtering']).toBe(true);
            expect(hostnameSwitches['127.0.0.1']['no-scripting']).toBe(true);

            const beforeReload = await page.evaluate(() => ({
                inline: (window as any).__inlineExecuted || 0,
                external: (window as any).__externalScriptExecuted || 0,
            }));
            expect(beforeReload.inline).toBeGreaterThan(0);
            expect(beforeReload.external).toBeGreaterThan(0);

            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect
                .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector('.to-hide') as Element).display))
                .not.toBe('none');
            const afterReload = await page.evaluate(() => ({
                inline: (window as any).__inlineExecuted || 0,
                external: (window as any).__externalScriptExecuted || 0,
            }));
            expect(afterReload.inline).toBe(0);
            expect(afterReload.external).toBe(0);
        } finally {
            await context?.close();
            await rm(userDataDir, { force: true, recursive: true });
            server.close();
        }
    });
});
