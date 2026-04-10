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

type ResourceHits = Map<string, { image: number; script: number; frame: number }>;
type FirstPartyHits = Map<string, { image: number; script: number }>;

type TestServers = {
    appServer: Server;
    resourceServer: Server;
    appURL: string;
    appURLAlt: string;
    blankURL: string;
    blankURLAlt: string;
    resourcePageURL: (uid: string) => string;
    resourcePageURLAlt: (uid: string) => string;
    resourcePageHost2URL: (uid: string) => string;
    resourcePageHost2URLAlt: (uid: string) => string;
    multiHostResourcePageURL: (uid: string) => string;
    framePageURL: (uid: string) => string;
    firstPartyPageURL: (uid: string) => string;
    mixedPageURL: (uid: string) => string;
    inlineScriptPageURL: (uid: string) => string;
    getHits: (uid: string) => { image: number; script: number; frame: number };
    getFirstPartyHits: (uid: string) => { image: number; script: number };
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
    const popupURL = `chrome-extension://${extensionId}/popup-fenix.html?tabId=${tabId}`;

    for ( let attempt = 0; attempt < 3; attempt++ ) {
        await popupPage.goto(popupURL, { waitUntil: 'domcontentloaded' });
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

        try {
            await expect(popupPage.locator('body')).toHaveClass(/advancedUser/, { timeout: 3000 });
            await expect(popupPage.locator('#firewall')).toBeVisible({ timeout: 3000 });
            return popupPage;
        } catch (error) {
            if ( attempt === 2 ) {
                throw error;
            }
        }
    }

    return popupPage;
};

const firewallCell = (popupPage: Page, rowType: string, scope: '/' | '.') => {
    return popupPage.locator(
        `#firewall > [data-des="*"][data-type="${rowType}"] > span[data-src="${scope}"]`,
    );
};

const firewallHostCell = (
    popupPage: Page,
    desHostname: string,
    rowType: string,
    scope: '/' | '.',
) => {
    return popupPage.locator(
        `#firewall > [data-des="${desHostname}"][data-type="${rowType}"] > span[data-src="${scope}"]`,
    );
};


const setFirewallCellAction = async (
    popupPage: Page,
    rowType: string,
    scope: '/' | '.',
    action: 'block' | 'allow' | 'noop',
): Promise<void> => {
    const cell = firewallCell(popupPage, rowType, scope);
    await cell.scrollIntoViewIfNeeded();
    await cell.hover();
    const hotspotId = action === 'allow'
        ? '#dynaAllow'
        : action === 'noop'
            ? '#dynaNoop'
            : '#dynaBlock';
    await popupPage.locator(hotspotId).click();
};

const setFirewallHostCellAction = async (
    popupPage: Page,
    desHostname: string,
    rowType: string,
    scope: '/' | '.',
    action: 'block' | 'allow' | 'noop',
): Promise<void> => {
    const cell = firewallHostCell(popupPage, desHostname, rowType, scope);
    await cell.scrollIntoViewIfNeeded();
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

const revertFirewallRules = async (popupPage: Page): Promise<void> => {
    await expect(popupPage.locator('body')).toHaveClass(/needSave/);
    await popupPage.locator('#revertRules').click();
    await expect(popupPage.locator('body')).not.toHaveClass(/needSave/);
};

const startTestServers = async (): Promise<TestServers> => {
    const hits: ResourceHits = new Map();
    const firstPartyHits: FirstPartyHits = new Map();

    const recordHit = (uid: string, type: 'image' | 'script' | 'frame') => {
        const entry = hits.get(uid) || { image: 0, script: 0, frame: 0 };
        entry[type] += 1;
        hits.set(uid, entry);
    };

    const recordFirstPartyHit = (uid: string, type: 'image' | 'script') => {
        const entry = firstPartyHits.get(uid) || { image: 0, script: 0 };
        entry[type] += 1;
        firstPartyHits.set(uid, entry);
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

        if ( url.pathname === '/frame' ) {
            recordHit(uid, 'frame');
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end('<!doctype html><html><body><main id="frame-content">frame</main></body></html>');
            return;
        }

        res.writeHead(404);
        res.end('not found');
    });

    await new Promise<void>((resolve, reject) => {
        resourceServer.listen(0, '0.0.0.0', () => resolve());
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

        if ( url.pathname === '/first-party.js' ) {
            const uid = url.searchParams.get('uid') || 'default';
            recordFirstPartyHit(uid, 'script');
            res.writeHead(200, {
                'content-type': 'application/javascript; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end('window.__firstPartyScriptLoaded = (window.__firstPartyScriptLoaded || 0) + 1;');
            return;
        }

        if ( url.pathname === '/first-party-pixel.png' ) {
            const uid = url.searchParams.get('uid') || 'default';
            recordFirstPartyHit(uid, 'image');
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

        if ( url.pathname === '/resource-page-host2' ) {
            const uid = url.searchParams.get('uid') || 'default';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="third-party-image" src="http://127.0.0.2:${resourcePort}/pixel.png?uid=${uid}" alt="pixel">
    <script src="http://127.0.0.2:${resourcePort}/third-party.js?uid=${uid}"></script>
</body>
</html>`);
            return;
        }

        if ( url.pathname === '/first-party-page' ) {
            const uid = url.searchParams.get('uid') || 'default';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="first-party-image" src="/first-party-pixel.png?uid=${uid}" alt="self-pixel">
    <script src="/first-party.js?uid=${uid}"></script>
</body>
</html>`);
            return;
        }

        if ( url.pathname === '/mixed-page' ) {
            const uid = url.searchParams.get('uid') || 'default';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="first-party-image" src="/first-party-pixel.png?uid=${uid}" alt="self-pixel">
    <script src="/first-party.js?uid=${uid}"></script>
    <img id="third-party-image" src="http://127.0.0.1:${resourcePort}/pixel.png?uid=${uid}" alt="third-party-pixel">
</body>
</html>`);
            return;
        }

        if ( url.pathname === '/inline-script-page' ) {
            const uid = url.searchParams.get('uid') || 'default';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="third-party-image" src="http://127.0.0.2:${resourcePort}/pixel.png?uid=${uid}" alt="third-party-pixel">
    <script>
    window.__inlineScriptRan = (window.__inlineScriptRan || 0) + 1;
    </script>
    <script src="/first-party.js?uid=${uid}"></script>
</body>
</html>`);
            return;
        }

        if ( url.pathname === '/multi-host-resource-page' ) {
            const uid = url.searchParams.get('uid') || 'default';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="host1-image" src="http://127.0.0.1:${resourcePort}/pixel.png?uid=${uid}-host1" alt="pixel-1">
    <script src="http://127.0.0.1:${resourcePort}/third-party.js?uid=${uid}-host1"></script>
    <img id="host2-image" src="http://127.0.0.2:${resourcePort}/pixel.png?uid=${uid}-host2" alt="pixel-2">
    <script src="http://127.0.0.2:${resourcePort}/third-party.js?uid=${uid}-host2"></script>
</body>
</html>`);
            return;
        }

        if ( url.pathname === '/frame-page' ) {
            const uid = url.searchParams.get('uid') || 'default';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <iframe id="third-party-frame" src="http://127.0.0.1:${resourcePort}/frame?uid=${uid}"></iframe>
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
        appURLAlt: `http://127.0.0.1:${appPort}/`,
        blankURL: `http://localhost:${appPort}/blank`,
        blankURLAlt: `http://127.0.0.1:${appPort}/blank`,
        resourcePageURL: (uid: string) => `http://localhost:${appPort}/resource-page?uid=${uid}`,
        resourcePageURLAlt: (uid: string) => `http://127.0.0.1:${appPort}/resource-page?uid=${uid}`,
        resourcePageHost2URL: (uid: string) => `http://localhost:${appPort}/resource-page-host2?uid=${uid}`,
        resourcePageHost2URLAlt: (uid: string) => `http://127.0.0.1:${appPort}/resource-page-host2?uid=${uid}`,
        multiHostResourcePageURL: (uid: string) => `http://localhost:${appPort}/multi-host-resource-page?uid=${uid}`,
        framePageURL: (uid: string) => `http://localhost:${appPort}/frame-page?uid=${uid}`,
        firstPartyPageURL: (uid: string) => `http://localhost:${appPort}/first-party-page?uid=${uid}`,
        mixedPageURL: (uid: string) => `http://localhost:${appPort}/mixed-page?uid=${uid}`,
        inlineScriptPageURL: (uid: string) => `http://localhost:${appPort}/inline-script-page?uid=${uid}`,
        getHits: (uid: string) => hits.get(uid) || { image: 0, script: 0, frame: 0 },
        getFirstPartyHits: (uid: string) => firstPartyHits.get(uid) || { image: 0, script: 0 },
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

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 0, script: 0, frame: 0 });
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

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 1, script: 1, frame: 0 });
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

    test('image rule blocks only third-party images while allowing third-party scripts', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-image-'));
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

            await setFirewallCellAction(popupPage, 'image', '/', 'block');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const resourcePage = await context.newPage();
            const uid = `image-only-${Date.now()}`;
            await resourcePage.goto(servers.resourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await resourcePage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 0, script: 1, frame: 0 });
            await expect.poll(async () => {
                return resourcePage.evaluate(() => ({
                    scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
                    imageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({ scriptLoaded: true, imageWidth: 0 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('3p-script rule blocks only third-party scripts while allowing third-party images', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-3pscript-'));
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

            await setFirewallCellAction(popupPage, '3p-script', '/', 'block');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const resourcePage = await context.newPage();
            const uid = `script-only-${Date.now()}`;
            await resourcePage.goto(servers.resourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await resourcePage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 1, script: 0, frame: 0 });
            await expect.poll(async () => {
                return resourcePage.evaluate(() => ({
                    scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
                    imageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({ scriptLoaded: false, imageWidth: 1 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('3p-frame rule blocks only third-party frames', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-3pframe-'));
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

            await setFirewallCellAction(popupPage, '3p-frame', '/', 'block');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const framePage = await context.newPage();
            const uid = `frame-only-${Date.now()}`;
            await framePage.goto(servers.framePageURL(uid), { waitUntil: 'domcontentloaded' });
            await framePage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 0, script: 0, frame: 0 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('1p-script rule blocks first-party scripts while allowing first-party images', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-1pscript-'));
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

            await setFirewallCellAction(popupPage, '1p-script', '/', 'block');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const page = await context.newPage();
            const uid = `1pscript-${Date.now()}`;
            await page.goto(servers.firstPartyPageURL(uid), { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            await expect.poll(() => servers.getFirstPartyHits(uid)).toEqual({ image: 1, script: 0 });
            await expect.poll(async () => {
                return page.evaluate(() => ({
                    firstPartyScriptLoaded: Boolean((window as Window & { __firstPartyScriptLoaded?: number }).__firstPartyScriptLoaded),
                    firstPartyImageWidth: (document.getElementById('first-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({ firstPartyScriptLoaded: false, firstPartyImageWidth: 1 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('wildcard rule blocks both first-party and third-party resources for the page', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-any-'));
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

            await setFirewallCellAction(popupPage, '*', '/', 'block');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const page = await context.newPage();
            const uid = `any-${Date.now()}`;
            await page.goto(servers.mixedPageURL(uid), { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            await expect.poll(() => servers.getFirstPartyHits(uid)).toEqual({ image: 0, script: 0 });
            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 0, script: 0, frame: 0 });
            await expect.poll(async () => {
                return page.evaluate(() => ({
                    firstPartyScriptLoaded: Boolean((window as Window & { __firstPartyScriptLoaded?: number }).__firstPartyScriptLoaded),
                    firstPartyImageWidth: (document.getElementById('first-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                    thirdPartyImageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({
                firstPartyScriptLoaded: false,
                firstPartyImageWidth: 0,
                thirdPartyImageWidth: 0,
            });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('site-specific 1p-script allow overrides a broader global wildcard block only for first-party scripts', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-any-1pscript-allow-'));
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

            await setFirewallCellAction(popupPage, '*', '/', 'block');
            await setFirewallCellAction(popupPage, '1p-script', '.', 'allow');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const page = await context.newPage();
            const uid = `any-1pscript-${Date.now()}`;
            await page.goto(servers.mixedPageURL(uid), { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            await expect.poll(() => servers.getFirstPartyHits(uid)).toEqual({ image: 0, script: 1 });
            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 0, script: 0, frame: 0 });
            await expect.poll(async () => {
                return page.evaluate(() => ({
                    firstPartyScriptLoaded: Boolean((window as Window & { __firstPartyScriptLoaded?: number }).__firstPartyScriptLoaded),
                    firstPartyImageWidth: (document.getElementById('first-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                    thirdPartyImageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({
                firstPartyScriptLoaded: true,
                firstPartyImageWidth: 0,
                thirdPartyImageWidth: 0,
            });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('inline-script rule blocks inline scripts while allowing first-party external scripts and third-party images', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-inline-script-'));
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

            await setFirewallCellAction(popupPage, 'inline-script', '/', 'block');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const page = await context.newPage();
            const uid = `inline-script-${Date.now()}`;
            await page.goto(servers.inlineScriptPageURL(uid), { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            await expect.poll(() => servers.getFirstPartyHits(uid)).toEqual({ image: 0, script: 1 });
            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 1, script: 0, frame: 0 });
            await expect.poll(async () => {
                return page.evaluate(() => ({
                    inlineScriptRan: Boolean((window as Window & { __inlineScriptRan?: number }).__inlineScriptRan),
                    firstPartyScriptLoaded: Boolean((window as Window & { __firstPartyScriptLoaded?: number }).__firstPartyScriptLoaded),
                    thirdPartyImageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({
                inlineScriptRan: false,
                firstPartyScriptLoaded: true,
                thirdPartyImageWidth: 1,
            });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('site-specific noop overrides the broader global 3p block for the active page hostname', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-noop-'));
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
            await setFirewallCellAction(popupPage, '3p', '.', 'noop');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const resourcePage = await context.newPage();
            const uid = `noop-${Date.now()}`;
            await resourcePage.goto(servers.resourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await resourcePage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(uid)).toEqual({ image: 1, script: 1, frame: 0 });
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

    test('site-scoped rules apply only to the current page hostname and do not leak to a different hostname', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-hostscope-'));
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

            const localUid = `hostscope-local-${Date.now()}`;
            const localhostPage = await context.newPage();
            await localhostPage.goto(servers.resourcePageHost2URL(localUid), { waitUntil: 'domcontentloaded' });
            await localhostPage.waitForTimeout(1000);
            await expect.poll(() => servers.getHits(localUid)).toEqual({ image: 1, script: 1, frame: 0 });

            const altUid = `hostscope-alt-${Date.now()}`;
            const altPage = await context.newPage();
            await altPage.goto(servers.resourcePageHost2URLAlt(altUid), { waitUntil: 'domcontentloaded' });
            await altPage.waitForTimeout(1000);
            await expect.poll(() => servers.getHits(altUid)).toEqual({ image: 0, script: 0, frame: 0 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('site-scoped popup rules on one localhost subdomain do not leak to a sibling localhost subdomain', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-subdomain-scope-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);
            const appPort = new URL(servers.blankURL).port;
            const fooBlankURL = `http://foo.localhost:${appPort}/blank`;
            const fooResourceURL = (uid: string) => `http://foo.localhost:${appPort}/resource-page-host2?uid=${uid}`;
            const barResourceURL = (uid: string) => `http://bar.localhost:${appPort}/resource-page-host2?uid=${uid}`;

            const page = await context.newPage();
            await page.goto(fooBlankURL, { waitUntil: 'domcontentloaded' });
            const tabId = await getTabIdForURL(serviceWorker, fooBlankURL);
            const popupPage = await openPopupForTab(context, extensionId, tabId);

            await setFirewallCellAction(popupPage, '3p', '/', 'block');
            await setFirewallCellAction(popupPage, '3p', '.', 'allow');
            await saveFirewallRules(popupPage);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const fooUid = `subscope-foo-${Date.now()}`;
            const fooPage = await context.newPage();
            await fooPage.goto(fooResourceURL(fooUid), { waitUntil: 'domcontentloaded' });
            await fooPage.waitForTimeout(1000);
            await expect.poll(() => servers.getHits(fooUid)).toEqual({ image: 1, script: 1, frame: 0 });

            const barUid = `subscope-bar-${Date.now()}`;
            const barPage = await context.newPage();
            await barPage.goto(barResourceURL(barUid), { waitUntil: 'domcontentloaded' });
            await barPage.waitForTimeout(1000);
            await expect.poll(() => servers.getHits(barUid)).toEqual({ image: 0, script: 0, frame: 0 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('revert discards unsaved firewall changes and restores the persisted matrix', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-revert-'));
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
            await saveFirewallRules(popupPage);

            await setFirewallCellAction(popupPage, 'image', '/', 'block');
            await expect(firewallCell(popupPage, 'image', '/')).toHaveClass(/blockRule/);

            await revertFirewallRules(popupPage);

            await expect(firewallCell(popupPage, '3p', '/')).toHaveClass(/blockRule/);
            await expect(firewallCell(popupPage, 'image', '/')).not.toHaveClass(/blockRule/);
            await expect.poll(async () => {
                return serviceWorker.evaluate(() => self.µBlock.sessionFirewall.toString());
            }).toContain('* * 3p block');
            await expect.poll(async () => {
                return serviceWorker.evaluate(() => self.µBlock.sessionFirewall.toString());
            }).not.toContain('* * image block');
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('popup shows destination-host rows after third-party requests are observed on the page', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-hostrows-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const resourcePage = await context.newPage();
            const uid = `hostrows-${Date.now()}`;
            await resourcePage.goto(servers.multiHostResourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await expect.poll(() => servers.getHits(`${uid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });

            const tabId = await getTabIdForURL(serviceWorker, servers.multiHostResourcePageURL(uid));
            const popupPage = await openPopupForTab(context, extensionId, tabId);

            await expect(firewallHostCell(popupPage, '127.0.0.1', '*', '/')).toBeVisible();
            await expect(firewallHostCell(popupPage, '127.0.0.2', '*', '/')).toBeVisible();
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('host-specific block rule blocks only the targeted destination host', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-hostblock-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const resourcePage = await context.newPage();
            const setupUid = `hostblock-setup-${Date.now()}`;
            await resourcePage.goto(servers.multiHostResourcePageURL(setupUid), { waitUntil: 'domcontentloaded' });
            await expect.poll(() => servers.getHits(`${setupUid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });

            const tabId = await getTabIdForURL(serviceWorker, servers.multiHostResourcePageURL(setupUid));
            const popupPage = await openPopupForTab(context, extensionId, tabId);

            await expect(firewallHostCell(popupPage, '127.0.0.1', '*', '/')).toBeVisible();
            await setFirewallHostCellAction(popupPage, '127.0.0.1', '*', '/', 'block');
            await saveFirewallRules(popupPage);

            await expect.poll(async () => {
                return serviceWorker.evaluate(() => self.µBlock.permanentFirewall.toString());
            }).toContain('* 127.0.0.1 * block');

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const uid = `hostblock-${Date.now()}`;
            const verifyPage = await context.newPage();
            await verifyPage.goto(servers.multiHostResourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await verifyPage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(`${uid}-host1`)).toEqual({ image: 0, script: 0, frame: 0 });
            await expect.poll(() => servers.getHits(`${uid}-host2`)).toEqual({ image: 1, script: 1, frame: 0 });
            await expect.poll(async () => {
                return verifyPage.evaluate(() => ({
                    host1Width: (document.getElementById('host1-image') as HTMLImageElement | null)?.naturalWidth || 0,
                    host2Width: (document.getElementById('host2-image') as HTMLImageElement | null)?.naturalWidth || 0,
                    scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
                }));
            }).toEqual({ host1Width: 0, host2Width: 1, scriptLoaded: true });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('host-specific allow overrides a broader global 3p block only for the targeted destination host', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-hostallow-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const resourcePage = await context.newPage();
            const setupUid = `hostallow-setup-${Date.now()}`;
            await resourcePage.goto(servers.multiHostResourcePageURL(setupUid), { waitUntil: 'domcontentloaded' });
            await expect.poll(() => servers.getHits(`${setupUid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });

            const tabId = await getTabIdForURL(serviceWorker, servers.multiHostResourcePageURL(setupUid));
            const popupPage = await openPopupForTab(context, extensionId, tabId);

            await setFirewallCellAction(popupPage, '3p', '/', 'block');
            await setFirewallHostCellAction(popupPage, '127.0.0.1', '*', '/', 'allow');
            await saveFirewallRules(popupPage);

            await expect.poll(async () => {
                return serviceWorker.evaluate(() => self.µBlock.permanentFirewall.toString());
            }).toContain('* * 3p block');
            await expect.poll(async () => {
                return serviceWorker.evaluate(() => self.µBlock.permanentFirewall.toString());
            }).toContain('* 127.0.0.1 * allow');

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);

            const uid = `hostallow-${Date.now()}`;
            const verifyPage = await context.newPage();
            await verifyPage.goto(servers.multiHostResourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await verifyPage.waitForTimeout(1000);

            await expect.poll(() => servers.getHits(`${uid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });
            await expect.poll(() => servers.getHits(`${uid}-host2`)).toEqual({ image: 0, script: 0, frame: 0 });
            await expect.poll(async () => {
                return verifyPage.evaluate(() => ({
                    host1Width: (document.getElementById('host1-image') as HTMLImageElement | null)?.naturalWidth || 0,
                    host2Width: (document.getElementById('host2-image') as HTMLImageElement | null)?.naturalWidth || 0,
                    scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
                }));
            }).toEqual({ host1Width: 1, host2Width: 0, scriptLoaded: true });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

});
