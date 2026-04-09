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

const blockquoteHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
    body {
        margin: 0;
        font-family: sans-serif;
    }
    .md {
        margin: 40px;
        max-width: 640px;
    }
    blockquote {
        margin: 16px 0;
        padding: 12px 16px;
        border-left: 4px solid #ccc;
        background: #f7f7f7;
    }
    </style>
</head>
<body>
    <div class="md">
        <blockquote>
            <p>First quote</p>
        </blockquote>
        <blockquote>
            <h1>Welcome!</h1>
            <p><a href="/r/worldnews">/r/worldnews</a> is for major news from around the world except US-internal news / US politics</p>
            <p><a href="https://bsky.app/profile/redditworldnews.bsky.social">Follow us on Bluesky @RedditWorldNews</a></p>
            <p><a href="http://www.reddit.com/r/worldnews/wiki/ama">See all of our AMA events here</a></p>
        </blockquote>
        <blockquote>
            <p>Third quote</p>
        </blockquote>
    </div>
</body>
</html>`;

const startTestServer = async (html = testHtml): Promise<{ server: Server; url: string }> => {
    const server = createServer((_, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
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

test.describe('Popup Picker Extension', () => {
    test('clicking inside a picked element keeps that element selected in the picker window', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-picker-exact-element-'));
        const { server, url } = await startTestServer();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);

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

            const box = await page.locator('a.listingsignupbar.infobar h2').boundingBox();
            if ( box === null ) {
                throw new Error('Nested heading inside target element was not found');
            }

            await pickerFrame.locator('#overlay').click({
                position: {
                    x: Math.round(box.x + Math.min(box.width / 2, 120)),
                    y: Math.round(box.y + Math.min(box.height / 2, 20)),
                },
            });

            await expect(pickerFrame.locator('#filterText')).toHaveValue('##.listingsignupbar.infobar');
            await expect(pickerFrame.locator('#cosmeticFilters li').first()).toHaveText('##.listingsignupbar.infobar');
        } finally {
            await context?.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('Confirm appends the selected filter to My filters permanently and removes the element from the page', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-picker-confirm-'));
        const { server, url } = await startTestServer();

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);

            let extensionId = await getExtensionId(context);
            let serviceWorker = context.serviceWorkers()[0]
                ?? await context.waitForEvent('serviceworker');
            let page = await context.newPage();
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
            await expect(pickerFrame.locator('#create')).toBeEnabled();
            await pickerFrame.locator('#create').click();

            await expect(page.locator('iframe[src*="/picker-ui.html"]')).toHaveCount(0);
            await expect.poll(async () => {
                return page.locator('a.listingsignupbar.infobar').count();
            }).toBe(0);

            const dashboardPage = await context.newPage();
            await dashboardPage.goto(
                `chrome-extension://${extensionId}/dashboard.html`,
                { waitUntil: 'domcontentloaded' },
            );
            await dashboardPage.locator('#dashboard-nav .tabButton[data-pane="1p-filters.html"]').click();
            await expect(dashboardPage.locator('#iframe')).toHaveAttribute('src', /1p-filters\.html$/);
            const dashboardFrame = dashboardPage.frameLocator('#iframe');
            await expect(dashboardFrame.locator('.CodeMirror')).toBeVisible();
            await expect.poll(async () => {
                return dashboardFrame.locator('.CodeMirror').evaluate(node =>
                    node.CodeMirror.getValue().trim()
                );
            }).toContain('##.listingsignupbar.infobar');
        } finally {
            await context?.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('clicking a bare blockquote prefers an :nth-of-type selector over a broad ancestor class', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-picker-blockquote-'));
        const { server, url } = await startTestServer(blockquoteHtml);

        let context: BrowserContext | undefined;
        try {
            context = await launchExtensionContext(userDataDir);

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

            const box = await page.locator('blockquote').nth(1).boundingBox();
            if ( box === null ) {
                throw new Error('Target blockquote not found');
            }

            await pickerFrame.locator('#overlay').click({
                position: {
                    x: Math.round(box.x + Math.min(box.width / 2, 120)),
                    y: Math.round(box.y + Math.min(box.height / 2, 40)),
                },
            });

            await expect(pickerFrame.locator('#filterText')).toHaveValue('##blockquote:nth-of-type(2)');
            await expect(pickerFrame.locator('#cosmeticFilters li').first()).toHaveText('##blockquote:nth-of-type(2)');
        } finally {
            await context?.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
