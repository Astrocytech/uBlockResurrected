import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdtemp as makeTempDir, readFile, rm, writeFile } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

type ResourceHits = Map<string, { image: number; script: number }>;
type FirstPartyHits = Map<string, { script: number }>;

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

const openMyRulesPane = async (page: Page, extensionId: string) => {
    await page.goto(
        `chrome-extension://${extensionId}/dashboard.html`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator('#dashboard-nav .tabButton[data-pane="dyna-rules.html"]').click();
    await expect(page.locator('#iframe')).toHaveAttribute('src', /dyna-rules\.html$/);
    const frame = page.frameLocator('#iframe');
    await expect(frame.locator('.CodeMirror-merge')).toBeVisible();
    return frame;
};

const setCodeMirrorValue = async (
    locator: ReturnType<ReturnType<Page['frameLocator']>['locator']>,
    value: string,
) => {
    await locator.evaluate((node, nextValue) => {
        node.CodeMirror.setValue(nextValue);
        node.CodeMirror.focus();
    }, value);
};

const getCodeMirrorValue = async (
    locator: ReturnType<ReturnType<Page['frameLocator']>['locator']>,
) => {
    return locator.evaluate(node => node.CodeMirror.getValue().trim());
};

const getCodeMirrorLines = async (
    locator: ReturnType<ReturnType<Page['frameLocator']>['locator']>,
) => {
    const value = await getCodeMirrorValue(locator);
    return value.split('\n').map(line => line.trim()).filter(Boolean).sort();
};

const startTestServers = async (): Promise<{
    appServer: Server;
    resourceServer: Server;
    resourcePageURL: (uid: string) => string;
    resourcePageHost2URL: (uid: string) => string;
    resourcePageHost2URLAlt: (uid: string) => string;
    inlineScriptPageURL: (uid: string) => string;
    inlineScriptPageHost2URL: (uid: string) => string;
    inlineScriptPageHost2URLAlt: (uid: string) => string;
    getHits: (uid: string) => { image: number; script: number };
    getFirstPartyHits: (uid: string) => { script: number };
}> => {
    const hits: ResourceHits = new Map();
    const firstPartyHits: FirstPartyHits = new Map();

    const recordHit = (uid: string, type: 'image' | 'script') => {
        const entry = hits.get(uid) || { image: 0, script: 0 };
        entry[type] += 1;
        hits.set(uid, entry);
    };

    const recordFirstPartyHit = (uid: string) => {
        const entry = firstPartyHits.get(uid) || { script: 0 };
        entry.script += 1;
        firstPartyHits.set(uid, entry);
    };

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
        resourceServer.listen(0, '0.0.0.0', () => resolve());
        resourceServer.once('error', reject);
    });

    const resourceAddress = resourceServer.address();
    if ( resourceAddress === null || typeof resourceAddress === 'string' ) {
        throw new Error('Failed to determine resource server address');
    }

    const appServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const uid = url.searchParams.get('uid') || 'default';
        const resourceHost = `127.0.0.2:${resourceAddress.port}`;

        if ( url.pathname === '/resource-page' ) {
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="third-party-image" src="http://${resourceHost}/pixel.png?uid=${uid}">
    <script src="http://${resourceHost}/third-party.js?uid=${uid}"></script>
</body>
</html>`);
            return;
        }

        if ( url.pathname === '/resource-page-host2' ) {
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="third-party-image" src="http://127.0.0.2:${resourceAddress.port}/pixel.png?uid=${uid}">
    <script src="http://127.0.0.2:${resourceAddress.port}/third-party.js?uid=${uid}"></script>
</body>
</html>`);
            return;
        }

        if ( url.pathname === '/first-party.js' ) {
            recordFirstPartyHit(uid);
            res.writeHead(200, {
                'content-type': 'application/javascript; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end('window.__firstPartyScriptLoaded = (window.__firstPartyScriptLoaded || 0) + 1;');
            return;
        }

        if ( url.pathname === '/inline-script-page' ) {
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`<!doctype html>
<html>
<body>
    <img id="third-party-image" src="http://${resourceHost}/pixel.png?uid=${uid}">
    <script>
    window.__inlineScriptRan = (window.__inlineScriptRan || 0) + 1;
    </script>
    <script src="/first-party.js?uid=${uid}"></script>
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

    return {
        appServer,
        resourceServer,
        resourcePageURL: uid => `http://127.0.0.1:${appAddress.port}/resource-page?uid=${uid}`,
        resourcePageHost2URL: uid => `http://localhost:${appAddress.port}/resource-page-host2?uid=${uid}`,
        resourcePageHost2URLAlt: uid => `http://127.0.0.1:${appAddress.port}/resource-page-host2?uid=${uid}`,
        inlineScriptPageURL: uid => `http://127.0.0.1:${appAddress.port}/inline-script-page?uid=${uid}`,
        inlineScriptPageHost2URL: uid => `http://localhost:${appAddress.port}/inline-script-page?uid=${uid}`,
        inlineScriptPageHost2URLAlt: uid => `http://127.0.0.1:${appAddress.port}/inline-script-page?uid=${uid}`,
        getHits: uid => hits.get(uid) || { image: 0, script: 0 },
        getFirstPartyHits: uid => firstPartyHits.get(uid) || { script: 0 },
    };
};

test.describe('Dashboard My Rules', () => {
    test('edit save updates temporary rules, commit persists them, and revert restores the permanent rules', async () => {
        test.setTimeout(90000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-rules-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const extensionId = await getExtensionId(context);
            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);

            const leftEditor = frame.locator('.CodeMirror-merge-left .CodeMirror').first();
            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const revertButton = frame.locator('#revertButton');

            await expect(editSaveButton).toBeDisabled();
            await expect(commitButton).toBeDisabled();
            await expect(revertButton).toBeDisabled();

            const tempRule = '127.0.0.1 127.0.0.2 3p block';
            await setCodeMirrorValue(rightEditor, `${tempRule}\n`);

            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();

            await expect(editSaveButton).toBeDisabled();
            await expect(commitButton).toBeEnabled();
            await expect(revertButton).toBeEnabled();
            await expect.poll(() => getCodeMirrorValue(leftEditor)).toBe('');
            await expect.poll(() => getCodeMirrorValue(rightEditor)).toBe(tempRule);

            const blockedPage = await context.newPage();
            await blockedPage.goto(servers.resourcePageURL('temp-rule'), { waitUntil: 'domcontentloaded' });
            await blockedPage.waitForTimeout(1500);
            expect(servers.getHits('temp-rule')).toEqual({ image: 0, script: 0 });

            await commitButton.click();
            await expect(commitButton).toBeDisabled();
            await expect(revertButton).toBeDisabled();
            await expect.poll(() => getCodeMirrorValue(leftEditor)).toBe(tempRule);
            await expect.poll(() => getCodeMirrorValue(rightEditor)).toBe(tempRule);

            const extraRule = `${tempRule}\n127.0.0.1 127.0.0.2 image block`;
            await setCodeMirrorValue(rightEditor, `${extraRule}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();
            await expect(revertButton).toBeEnabled();
            await expect.poll(() => getCodeMirrorLines(rightEditor)).toEqual([
                '127.0.0.1 127.0.0.2 3p block',
                '127.0.0.1 127.0.0.2 image block',
            ]);

            await revertButton.click();
            await expect(commitButton).toBeDisabled();
            await expect(revertButton).toBeDisabled();
            await expect.poll(() => getCodeMirrorValue(leftEditor)).toBe(tempRule);
            await expect.poll(() => getCodeMirrorValue(rightEditor)).toBe(tempRule);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);
            const restartedExtensionId = await getExtensionId(context);
            const restartedDashboard = await context.newPage();
            const restartedFrame = await openMyRulesPane(restartedDashboard, restartedExtensionId);
            const restartedLeft = restartedFrame.locator('.CodeMirror-merge-left .CodeMirror').first();
            const restartedRight = restartedFrame.locator('.CodeMirror-merge-editor .CodeMirror').first();

            await expect.poll(() => getCodeMirrorValue(restartedLeft)).toBe(tempRule);
            await expect.poll(() => getCodeMirrorValue(restartedRight)).toBe(tempRule);

            const restartedBlockedPage = await context.newPage();
            await restartedBlockedPage.goto(servers.resourcePageURL('persisted-rule'), { waitUntil: 'domcontentloaded' });
            await restartedBlockedPage.waitForTimeout(1500);
            expect(servers.getHits('persisted-rule')).toEqual({ image: 0, script: 0 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('committed dashboard firewall rules are reflected in the popup matrix', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-popup-sync-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);
            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const rule = '* * 3p block';

            await setCodeMirrorValue(rightEditor, `${rule}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();
            await commitButton.click();
            await expect(commitButton).toBeDisabled();

            const page = await context.newPage();
            await page.goto(servers.resourcePageURL(`popup-sync-${Date.now()}`), { waitUntil: 'domcontentloaded' });
            const tabId = await getTabIdForURL(serviceWorker, page.url());
            const popupPage = await openPopupForTab(context, extensionId, tabId);

            await expect(firewallCell(popupPage, '3p', '/')).toHaveClass(/blockRule/);
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('temporary dashboard firewall rules apply immediately but do not persist across restart until committed', async () => {
        test.setTimeout(90000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-temp-only-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const serviceWorker = await getServiceWorker(context);
            const extensionId = await getExtensionId(context);

            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);
            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const rule = '* * 3p block';

            await setCodeMirrorValue(rightEditor, `${rule}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();

            const blockedPage = await context.newPage();
            const tempUid = `temp-only-${Date.now()}`;
            await blockedPage.goto(servers.resourcePageURL(tempUid), { waitUntil: 'domcontentloaded' });
            await blockedPage.waitForTimeout(1500);
            expect(servers.getHits(tempUid)).toEqual({ image: 0, script: 0 });

            const popupPage = await openPopupForTab(
                context,
                extensionId,
                await getTabIdForURL(serviceWorker, blockedPage.url()),
            );
            await expect(firewallCell(popupPage, '3p', '/')).toHaveClass(/blockRule/);

            await context.close();
            context = undefined;

            context = await launchExtensionContext(userDataDir);
            const restartedPage = await context.newPage();
            const restartedUid = `temp-only-restart-${Date.now()}`;
            await restartedPage.goto(servers.resourcePageURL(restartedUid), { waitUntil: 'domcontentloaded' });
            await restartedPage.waitForTimeout(1500);
            expect(servers.getHits(restartedUid)).toEqual({ image: 1, script: 1 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('import merges new rules into the editor and export downloads the current temporary rules', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-import-export-'));
        const importDir = await makeTempDir(path.join(os.tmpdir(), 'ubr-dyna-import-file-'));
        const importPath = path.join(importDir, 'rules.txt');
        const importedRule = 'example.com * 3p block';
        const existingRule = '* * image block';
        await writeFile(importPath, `${importedRule}\n`, 'utf8');

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const extensionId = await getExtensionId(context);
            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);

            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const importInput = frame.locator('#importFilePicker');
            const exportButton = frame.locator('#exportButton');

            await setCodeMirrorValue(rightEditor, `${existingRule}\n`);
            await expect(editSaveButton).toBeEnabled();

            await importInput.setInputFiles(importPath);
            await expect.poll(() => getCodeMirrorLines(rightEditor)).toEqual([
                existingRule,
                importedRule,
            ]);

            const downloadPromise = dashboardPage.waitForEvent('download');
            await exportButton.click();
            const download = await downloadPromise;
            const exportPath = await download.path();
            if ( exportPath === null ) {
                throw new Error('Expected exported My rules download path');
            }
            const exportedText = await readFile(exportPath, 'utf8');
            const exportedLines = exportedText.split('\n').map(line => line.trim()).filter(Boolean).sort();
            expect(exportedLines).toEqual([
                existingRule,
                importedRule,
            ]);
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
            await rm(importDir, { recursive: true, force: true });
        }
    });

    test('host-specific image allow can override a broader global 3p block through My rules', async () => {
        test.setTimeout(90000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-hostimageallow-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const extensionId = await getExtensionId(context);
            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);

            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const rules = [
                '* * 3p block',
                '* 127.0.0.2 image allow',
            ].join('\n');

            await setCodeMirrorValue(rightEditor, `${rules}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();
            await commitButton.click();
            await expect(commitButton).toBeDisabled();

            const page = await context.newPage();
            const uid = `hostimageallow-${Date.now()}`;
            await page.goto(servers.resourcePageURL(uid), { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500);

            expect(servers.getHits(uid)).toEqual({ image: 1, script: 0 });
            await expect.poll(async () => {
                return page.evaluate(() => ({
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

    test('committed inline-script My rules block inline scripts while allowing first-party external scripts and third-party images', async () => {
        test.setTimeout(90000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-inline-script-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const extensionId = await getExtensionId(context);
            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);

            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const rule = '* * inline-script block';

            await setCodeMirrorValue(rightEditor, `${rule}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();
            await commitButton.click();
            await expect(commitButton).toBeDisabled();

            const page = await context.newPage();
            const uid = `inline-script-${Date.now()}`;
            await page.goto(servers.inlineScriptPageURL(uid), { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500);

            expect(servers.getHits(uid)).toEqual({ image: 1, script: 0 });
            expect(servers.getFirstPartyHits(uid)).toEqual({ script: 1 });
            await expect.poll(async () => {
                return page.evaluate(() => ({
                    inlineScriptRan: Boolean((window as Window & { __inlineScriptRan?: number }).__inlineScriptRan),
                    firstPartyScriptLoaded: Boolean((window as Window & { __firstPartyScriptLoaded?: number }).__firstPartyScriptLoaded),
                    imageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({
                inlineScriptRan: false,
                firstPartyScriptLoaded: true,
                imageWidth: 1,
            });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('source-host inline-script allow overrides a broader global inline-script block only for that source hostname', async () => {
        test.setTimeout(90000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-inline-allow-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const extensionId = await getExtensionId(context);
            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);

            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const rules = [
                '* * inline-script block',
                'localhost * inline-script allow',
            ].join('\n');

            await setCodeMirrorValue(rightEditor, `${rules}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();
            await commitButton.click();
            await expect(commitButton).toBeDisabled();

            const allowedPage = await context.newPage();
            const allowedUid = `inline-allow-local-${Date.now()}`;
            await allowedPage.goto(servers.inlineScriptPageHost2URL(allowedUid), {
                waitUntil: 'domcontentloaded',
            });
            await allowedPage.waitForTimeout(1500);

            expect(servers.getHits(allowedUid)).toEqual({ image: 1, script: 0 });
            expect(servers.getFirstPartyHits(allowedUid)).toEqual({ script: 1 });
            await expect.poll(async () => {
                return allowedPage.evaluate(() => ({
                    inlineScriptRan: Boolean((window as Window & { __inlineScriptRan?: number }).__inlineScriptRan),
                    firstPartyScriptLoaded: Boolean((window as Window & { __firstPartyScriptLoaded?: number }).__firstPartyScriptLoaded),
                    imageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({
                inlineScriptRan: true,
                firstPartyScriptLoaded: true,
                imageWidth: 1,
            });

            const blockedPage = await context.newPage();
            const blockedUid = `inline-allow-alt-${Date.now()}`;
            await blockedPage.goto(servers.inlineScriptPageHost2URLAlt(blockedUid), {
                waitUntil: 'domcontentloaded',
            });
            await blockedPage.waitForTimeout(1500);

            expect(servers.getHits(blockedUid)).toEqual({ image: 1, script: 0 });
            expect(servers.getFirstPartyHits(blockedUid)).toEqual({ script: 1 });
            await expect.poll(async () => {
                return blockedPage.evaluate(() => ({
                    inlineScriptRan: Boolean((window as Window & { __inlineScriptRan?: number }).__inlineScriptRan),
                    firstPartyScriptLoaded: Boolean((window as Window & { __firstPartyScriptLoaded?: number }).__firstPartyScriptLoaded),
                    imageWidth: (document.getElementById('third-party-image') as HTMLImageElement | null)?.naturalWidth || 0,
                }));
            }).toEqual({
                inlineScriptRan: false,
                firstPartyScriptLoaded: true,
                imageWidth: 1,
            });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('source-host-specific My rules apply only to that source hostname', async () => {
        test.setTimeout(90000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-source-host-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const extensionId = await getExtensionId(context);
            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);

            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const rule = 'localhost * 3p block';

            await setCodeMirrorValue(rightEditor, `${rule}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();
            await commitButton.click();
            await expect(commitButton).toBeDisabled();

            const localhostUid = `source-host-local-${Date.now()}`;
            const localhostPage = await context.newPage();
            await localhostPage.goto(servers.resourcePageHost2URL(localhostUid), {
                waitUntil: 'domcontentloaded',
            });
            await localhostPage.waitForTimeout(1500);
            expect(servers.getHits(localhostUid)).toEqual({ image: 0, script: 0 });

            const altUid = `source-host-alt-${Date.now()}`;
            const altPage = await context.newPage();
            await altPage.goto(servers.resourcePageHost2URLAlt(altUid), {
                waitUntil: 'domcontentloaded',
            });
            await altPage.waitForTimeout(1500);
            expect(servers.getHits(altUid)).toEqual({ image: 1, script: 1 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('ancestor source-host My rules apply to descendant subdomains but not unrelated sibling hosts', async () => {
        test.setTimeout(90000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dyna-ancestor-source-host-'));
        const servers = await startTestServers();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);
            const extensionId = await getExtensionId(context);
            const dashboardPage = await context.newPage();
            const frame = await openMyRulesPane(dashboardPage, extensionId);

            const rightEditor = frame.locator('.CodeMirror-merge-editor .CodeMirror').first();
            const editSaveButton = frame.locator('#editSaveButton');
            const commitButton = frame.locator('#commitButton');
            const rule = 'foo.localhost * 3p block';

            await setCodeMirrorValue(rightEditor, `${rule}\n`);
            await expect(editSaveButton).toBeEnabled();
            await editSaveButton.click();
            await expect(commitButton).toBeEnabled();
            await commitButton.click();
            await expect(commitButton).toBeDisabled();

            const appPort = new URL(servers.resourcePageHost2URL('x')).port;

            const descendantUid = `ancestor-desc-${Date.now()}`;
            const descendantPage = await context.newPage();
            await descendantPage.goto(
                `http://bar.foo.localhost:${appPort}/resource-page-host2?uid=${descendantUid}`,
                { waitUntil: 'domcontentloaded' },
            );
            await descendantPage.waitForTimeout(1500);
            expect(servers.getHits(descendantUid)).toEqual({ image: 0, script: 0 });

            const siblingUid = `ancestor-sibling-${Date.now()}`;
            const siblingPage = await context.newPage();
            await siblingPage.goto(
                `http://baz.localhost:${appPort}/resource-page-host2?uid=${siblingUid}`,
                { waitUntil: 'domcontentloaded' },
            );
            await siblingPage.waitForTimeout(1500);
            expect(servers.getHits(siblingUid)).toEqual({ image: 1, script: 1 });
        } finally {
            await context?.close();
            await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
            await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
