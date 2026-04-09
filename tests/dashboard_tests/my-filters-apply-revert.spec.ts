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

const cosmeticTestHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
    body { font-family: sans-serif; margin: 24px; }
    .promo-banner {
        padding: 16px;
        margin-bottom: 16px;
        background: #f5d7d7;
        border: 1px solid #d88;
    }
    .article {
        padding: 16px;
        border: 1px solid #ccc;
    }
    </style>
</head>
<body>
    <div class="promo-banner">Promo banner</div>
    <div class="article">Article body</div>
</body>
</html>`;

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

const openMyFiltersPane = async (page: Page, extensionId: string) => {
    await page.goto(
        `chrome-extension://${extensionId}/dashboard.html`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator('#dashboard-nav .tabButton[data-pane="1p-filters.html"]').click();
    await expect(page.locator('#iframe')).toHaveAttribute('src', /1p-filters\.html$/);
    const frame = page.frameLocator('#iframe');
    await expect(frame.locator('.CodeMirror')).toBeVisible();
    return frame;
};

const startTestServer = async (
    html = cosmeticTestHtml,
): Promise<{ server: Server; url: string }> => {
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

const expectSelectorHidden = async (page: Page, selector: string) => {
    await expect.poll(async () => {
        return page.locator(selector).evaluateAll(elements => {
            if ( elements.length === 0 ) { return true; }
            return elements.every(element => {
                const style = window.getComputedStyle(element);
                return (
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    style.opacity === '0'
                );
            });
        });
    }).toBe(true);
};

test.describe('Dashboard My Filters', () => {
    test('apply and revert work in the real extension pane', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-my-filters-'));

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
            const messages: string[] = [];
            page.on('console', message => {
                messages.push(`${message.type()}: ${message.text()}`);
            });
            page.on('pageerror', error => {
                messages.push(`pageerror: ${error.message}`);
            });

            const frame = await openMyFiltersPane(page, extensionId);
            const editor = frame.locator('.CodeMirror');
            const applyButton = frame.locator('#userFiltersApply');
            const revertButton = frame.locator('#userFiltersRevert');
            const filterText = 'example.com##.promo-banner\nexample.com##.cta';

            await expect(applyButton).toBeDisabled();
            await expect(revertButton).toBeDisabled();

            await editor.evaluate((node, value) => {
                node.CodeMirror.setValue(value);
                node.CodeMirror.focus();
            }, filterText);

            await expect(applyButton, messages.join('\n')).toBeEnabled();
            await expect(revertButton, messages.join('\n')).toBeEnabled();

            await revertButton.click();
            await expect(applyButton).toBeDisabled();
            await expect(revertButton).toBeDisabled();
            await expect.poll(async () => {
                return editor.evaluate(node => node.CodeMirror.getValue().trim());
            }).toBe('');

            await editor.evaluate((node, value) => {
                node.CodeMirror.setValue(value);
                node.CodeMirror.focus();
            }, filterText);
            await expect(applyButton).toBeEnabled();
            await applyButton.click();

            await expect(applyButton, messages.join('\n')).toBeDisabled();
            await expect(revertButton, messages.join('\n')).toBeDisabled();

            await context.close();
            context = undefined;

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

            const restartedExtensionId = await getExtensionId(context);
            const restartedPage = await context.newPage();
            const restartedFrame = await openMyFiltersPane(restartedPage, restartedExtensionId);
            const restartedEditor = restartedFrame.locator('.CodeMirror');
            const restartedApplyButton = restartedFrame.locator('#userFiltersApply');
            const restartedRevertButton = restartedFrame.locator('#userFiltersRevert');

            await expect.poll(async () => {
                return restartedEditor.evaluate(node => node.CodeMirror.getValue().trim());
            }).toBe(filterText);
            await expect(restartedApplyButton).toBeDisabled();
            await expect(restartedRevertButton).toBeDisabled();
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });

    test('saved cosmetic My filters are applied automatically on page load and after browser restart', async () => {
        test.setTimeout(60000);
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-my-filters-cosmetic-'));
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
            const dashboardPage = await context.newPage();
            const frame = await openMyFiltersPane(dashboardPage, extensionId);
            const editor = frame.locator('.CodeMirror');
            const applyButton = frame.locator('#userFiltersApply');
            const filterText = '##.promo-banner';

            await editor.evaluate((node, value) => {
                node.CodeMirror.setValue(value);
                node.CodeMirror.focus();
            }, filterText);
            await expect(applyButton).toBeEnabled();
            await applyButton.click();
            await expect(applyButton).toBeDisabled();

            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await expectSelectorHidden(page, '.promo-banner');
            await expect(page.locator('.article')).toBeVisible();

            await context.close();
            context = undefined;

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

            const restartedPage = await context.newPage();
            await restartedPage.goto(url, { waitUntil: 'domcontentloaded' });
            await expectSelectorHidden(restartedPage, '.promo-banner');
            await expect(restartedPage.locator('.article')).toBeVisible();
        } finally {
            await context?.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
