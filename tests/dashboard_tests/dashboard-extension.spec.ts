import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const extensionPath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3',
);

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

test.describe('Dashboard Extension', () => {
    test('dashboard.html renders the classic stripped dashboard shell instead of a blank page', async () => {
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-dashboard-'));

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
                `chrome-extension://${extensionId}/dashboard.html`,
                { waitUntil: 'domcontentloaded' },
            );

            await page.waitForTimeout(3000);

            const shell = await page.evaluate(() => {
                const iframe = document.querySelector<HTMLIFrameElement>('#iframe');
                const selected = document.querySelector<HTMLElement>('#dashboard-nav .tabButton.selected');
                const tabText = (pane: string) =>
                    document.querySelector<HTMLElement>(`#dashboard-nav .tabButton[data-pane="${pane}"]`)?.textContent?.trim() || '';
                return {
                    bodyClass: document.body.className,
                    hasNav: document.querySelector('#dashboard-nav') !== null,
                    selectedPane: selected?.dataset.pane || '',
                    iframeSrc: iframe?.getAttribute('src') || '',
                    tabs: {
                        settings: tabText('settings.html'),
                        lists3p: tabText('3p-filters.html'),
                        lists1p: tabText('1p-filters.html'),
                        dyna: tabText('dyna-rules.html'),
                        whitelist: tabText('whitelist.html'),
                    },
                };
            });

            expect(shell.bodyClass).toBe('');
            expect(shell.hasNav).toBe(true);
            expect(shell.selectedPane).toBe('settings.html');
            expect(shell.iframeSrc).toBe('settings.html');
            expect(shell.tabs.settings).toMatch(/Settings/i);
            expect(shell.tabs.lists3p).toMatch(/Filter lists/i);
            expect(shell.tabs.lists1p).toMatch(/My filters/i);
            expect(shell.tabs.dyna).toMatch(/My rules/i);
            expect(shell.tabs.whitelist).toMatch(/Trusted sites/i);

            const panes: Array<[string, string]> = [
                ['settings.html', '.fieldset'],
                ['3p-filters.html', '#buttonApply'],
                ['1p-filters.html', '#userFilters'],
                ['dyna-rules.html', '.CodeMirror-merge'],
                ['whitelist.html', '#whitelist'],
            ];

            for ( const [pane, selector] of panes ) {
                await page.locator(`#dashboard-nav .tabButton[data-pane="${pane}"]`).click();
                await page.waitForTimeout(1000);
                const paneState = await page.evaluate(expected => {
                    const iframe = document.querySelector<HTMLIFrameElement>('#iframe');
                    const frameDoc = iframe?.contentDocument;
                    return {
                        iframeSrc: iframe?.getAttribute('src') || '',
                        selectedPane: document.querySelector<HTMLElement>('#dashboard-nav .tabButton.selected')?.dataset.pane || '',
                        hasSelector: frameDoc?.querySelector(expected.selector) !== null,
                    };
                }, { pane, selector });
                expect(paneState.iframeSrc).toBe(pane);
                expect(paneState.selectedPane).toBe(pane);
                expect(paneState.hasSelector).toBe(true);
            }
        } finally {
            await context?.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    });
});
