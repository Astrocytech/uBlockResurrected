import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
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
    <meta charset="utf-8">
    <title>Logger Test</title>
</head>
<body>
    <h1>Logger flow test</h1>
    <img src="/pixel?initial=1" alt="">
</body>
</html>`;

const startTestServer = async (): Promise<{ server: Server; url: string }> => {
    const server = createServer((req, res) => {
        if ( req.url?.startsWith('/pixel') ) {
            res.writeHead(200, {
                'content-type': 'image/gif',
                'cache-control': 'no-store',
            });
            res.end(
                Buffer.from(
                    'R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=',
                    'base64',
                ),
            );
            return;
        }

        if ( req.url?.startsWith('/ping') ) {
            res.writeHead(200, {
                'content-type': 'text/plain; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(`pong:${Date.now()}`);
            return;
        }

        res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
        });
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

test.describe('Popup Logger Extension', () => {
    test('popup logger button opens a bound logger tab and receives live requests', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-logger-'));
        const { server, url } = await startTestServer();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);

            const extensionId = await getExtensionId(context);
            const serviceWorker = context.serviceWorkers()[0]
                ?? await context.waitForEvent('serviceworker');

            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'networkidle' });
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

            const loggerPagePromise = context.waitForEvent('page', candidate =>
                candidate.url().includes('/logger-ui.html'),
            );

            await popupPage.locator('a[href="logger-ui.html#_"]').click({ noWaitAfter: true });

            const loggerPage = await loggerPagePromise;
            await loggerPage.waitForLoadState('domcontentloaded');

            await expect(loggerPage.locator('#pageSelector')).toBeVisible();
            await expect.poll(
                async () => getVisibleLogEntryCount(loggerPage),
                { timeout: 15000 },
            ).toBeGreaterThan(0);

            const beforeCount = await getVisibleLogEntryCount(loggerPage);

            await page.evaluate(async () => {
                await fetch(`/ping?ts=${Date.now()}`, { cache: 'no-store' });
            });

            await expect.poll(
                async () => getVisibleLogEntryCount(loggerPage),
                { timeout: 15000 },
            ).toBeGreaterThanOrEqual(beforeCount);
        } finally {
            await context?.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});

const getVisibleLogEntryCount = async (page: Page): Promise<number> => {
    return page.locator('#vwContent .logEntry').count();
};
