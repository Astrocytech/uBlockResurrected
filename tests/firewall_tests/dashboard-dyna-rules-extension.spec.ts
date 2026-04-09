import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

type ResourceHits = Map<string, { image: number; script: number }>;

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
    getHits: (uid: string) => { image: number; script: number };
}> => {
    const hits: ResourceHits = new Map();

    const recordHit = (uid: string, type: 'image' | 'script') => {
        const entry = hits.get(uid) || { image: 0, script: 0 };
        entry[type] += 1;
        hits.set(uid, entry);
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
        getHits: uid => hits.get(uid) || { image: 0, script: 0 },
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
});
