import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

type ResourceHits = Map<string, { image: number; script: number }>;

type TestServers = {
    appServer: Server;
    resourceServer: Server;
    appURL: string;
    blankURL: string;
    resourcePageURL: (uid: string) => string;
    getHits: (uid: string) => { image: number; script: number };
};

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

const getServiceWorker = async (context: BrowserContext): Promise<Worker> => {
    let [serviceWorker] = context.serviceWorkers();
    if ( serviceWorker === undefined ) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }
    return serviceWorker;
};

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
    await popupPage.goto(
        `chrome-extension://${extensionId}/popup-fenix.html?tabId=${tabId}`,
        { waitUntil: 'domcontentloaded' },
    );
    const hasAdvancedUser = await popupPage.locator('body').evaluate(body =>
        body.classList.contains('advancedUser')
    );
    if ( hasAdvancedUser === false ) {
        await popupPage.evaluate(async () => {
            await (window as typeof window & { vAPI: any }).vAPI.messaging.send('popupPanel', {
                what: 'userSettings',
                name: 'advancedUserEnabled',
                value: true,
            });
            await (window as typeof window & { vAPI: any }).vAPI.messaging.send('popupPanel', {
                what: 'userSettings',
                name: 'popupPanelSections',
                value: 31,
            });
            await (window as typeof window & { vAPI: any }).vAPI.messaging.send('popupPanel', {
                what: 'userSettings',
                name: 'firewallPaneMinimized',
                value: false,
            });
        });
        await popupPage.reload({ waitUntil: 'domcontentloaded' });
    }
    await expect(popupPage.locator('body')).toHaveClass(/advancedUser/);
    await expect(popupPage.locator('#firewall')).toBeVisible();
    return popupPage;
};

const firewallCell = (popupPage: Page, rowType: string, scope: '/' | '.') => {
    return popupPage.locator(
        `#firewall > [data-des="*"][data-type="${rowType}"] > span[data-src="${scope}"]`,
    );
};

const setFirewallCellAction = async (
    popupPage: Page,
    rowType: string,
    scope: '/' | '.',
    action: 'block' | 'allow' | 'noop',
): Promise<void> => {
    const cell = firewallCell(popupPage, rowType, scope);
    await cell.hover();
    const hotspotId = action === 'allow'
        ? '#dynaAllow'
        : action === 'noop'
            ? '#dynaNoop'
            : '#dynaBlock';
    await popupPage.locator(hotspotId).click();
};

const saveFirewallRules = async (popupPage: Page): Promise<void> => {
    await expect(popupPage.locator('body')).toHaveClass(/needSave/);
    await popupPage.locator('#saveRules').click();
    await expect(popupPage.locator('body')).not.toHaveClass(/needSave/);
};

const startTestServers = async (): Promise<TestServers> => {
    const hits: ResourceHits = new Map();

    const recordHit = (uid: string, type: 'image' | 'script') => {
        const entry = hits.get(uid) || { image: 0, script: 0 };
        entry[type] += 1;
        hits.set(uid, entry);
    };

    let resourcePort = 0;

    const resourceServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const uid = url.searchParams.get('uid') || 'default';

        if ( url.pathname === '/pixel.png' ) {
            recordHit(uid, 'image');
            const png = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9nW8AAAAASUVORK5CYII=',
                'base64',
            );
            res.writeHead(200, {
                'content-type': 'image/png',
                'cache-control': 'no-store',
            });
            res.end(png);
            return;
        }

        if ( url.pathname === '/third-party.js' ) {
            recordHit(uid, 'script');
            res.writeHead(200, {
                'content-type': 'application/javascript; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end('window.__thirdPartyScriptLoaded = (window.__thirdPartyScriptLoaded || 0) + 1;');
            return;
        }

        res.writeHead(404);
        res.end('not found');
    });

    await new Promise<void>((resolve, reject) => {
        resourceServer.listen(0, '127.0.0.1', () => resolve());
        resourceServer.once('error', reject);
    });

    const resourceAddress = resourceServer.address();
    if ( resourceAddress === null || typeof resourceAddress === 'string' ) {
        throw new Error('Failed to determine resource server address');
    }
    resourcePort = resourceAddress.port;

    const appServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if ( url.pathname === '/blank' ) {
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end('<!doctype html><html><body><main>blank</main></body></html>');
            return;
        }

        if ( url.pathname === '/resource-page' ) {
            const uid = url.searchParams.get('uid') || 'default';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="third-party-image" src="http://127.0.0.1:${resourcePort}/pixel.png?uid=${uid}" alt="pixel">
    <script src="http://127.0.0.1:${resourcePort}/third-party.js?uid=${uid}"></script>
</body>
</html>`);
            return;
        }

        res.writeHead(404);
        res.end('not found');
    });

    await new Promise<void>((resolve, reject) => {
        appServer.listen(0, '127.0.0.1', () => resolve());
        appServer.once('error', reject);
    });

    const appAddress = appServer.address();
    if ( appAddress === null || typeof appAddress === 'string' ) {
        throw new Error('Failed to determine app server address');
    }

    const appPort = appAddress.port;

    return {
        appServer,
        resourceServer,
        appURL: `http://localhost:${appPort}/`,
        blankURL: `http://localhost:${appPort}/blank`,
        resourcePageURL: (uid: string) => `http://localhost:${appPort}/resource-page?uid=${uid}`,
        getHits: (uid: string) => hits.get(uid) || { image: 0, script: 0 },
    };
};

test.describe('Popup Firewall Extension', () => {
    test('can set and persist a global 3p block rule from the popup', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-persist-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const page = await context.newPage();
            await page.goto(servers.blankURL, { waitUntil: 'domcontentloaded' });
            const tabId = await getTabIdForURL(serviceWorker, servers.blankURL);

            const popupPage = await openPopupForTab(context, extensionId, tabId);
            const global3pCell = firewallCell(popupPage, '3p', '/');

            await setFirewallCellAction(popupPage, '3p', '/', 'block');
            await expect(global3pCell).toHaveClass(/blockRule/);
            await expect(global3pCell).toHaveClass(/ownRule/);

            await saveFirewallRules(popupPage);

            await expect.poll(async () => {
                return serviceWorker.evaluate(() => self.µBlock.permanentFirewall.toString());
            }).toContain('* * 3p block');

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);
            const restartedWorker = await getServiceWorker(context);
            const restartedExtensionId = await getExtensionId(context);
            const restartedPage = await context.newPage();
            await restartedPage.goto(servers.blankURL, { waitUntil: 'domcontentloaded' });
            const restartedTabId = await getTabIdForURL(restartedWorker, servers.blankURL);
            const restartedPopup = await openPopupForTab(context, restartedExtensionId, restartedTabId);

            await expect(firewallCell(restartedPopup, '3p', '/')).toHaveClass(/blockRule/);
            await expect.poll(async () => {
                return restartedWorker.evaluate(() => self.µBlock.permanentFirewall.toString());
            }).toContain('* * 3p block');
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('persisted global 3p block prevents third-party image and script requests after browser restart', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-block-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const blankPage = await context.newPage();
            await blankPage.goto(servers.blankURL, { waitUntil: 'domcontentloaded' });
            const blankTabId = await getTabIdForURL(serviceWorker, servers.blankURL);
            const popupPage = await openPopupForTab(context, extensionId, blankTabId);
            await setFirewallCellAction(popupPage, '3p', '/', 'block');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);
            const restartedWorker = await getServiceWorker(context);

            const resourcePage = await context.newPage();
            const uid = `blocked-${Date.now()}`;
            await resourcePage.goto(servers.resourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await resourcePage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 0, script: 0 });
            await expect.poll(async () => {
                return resourcePage.evaluate(() => ({
                    scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
                    imageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({ scriptLoaded: false, imageWidth: 0 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('site-specific 3p allow overrides the broader global 3p block for the active page hostname', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-allow-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const page = await context.newPage();
            await page.goto(servers.blankURL, { waitUntil: 'domcontentloaded' });
            const tabId = await getTabIdForURL(serviceWorker, servers.blankURL);
            const popupPage = await openPopupForTab(context, extensionId, tabId);

            await setFirewallCellAction(popupPage, '3p', '/', 'block');
            await setFirewallCellAction(popupPage, '3p', '.', 'allow');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);
            const restartedWorker = await getServiceWorker(context);

            const resourcePage = await context.newPage();
            const uid = `allowed-${Date.now()}`;
            await resourcePage.goto(servers.resourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await resourcePage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 1, script: 1 });
            await expect.poll(async () => {
                return resourcePage.evaluate(() => ({
                    scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
                    imageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({ scriptLoaded: true, imageWidth: 1 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
