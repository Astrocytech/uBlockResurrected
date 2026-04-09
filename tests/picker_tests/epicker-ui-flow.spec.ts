import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const epickerHtmlPath = path.resolve(
    process.cwd(),
    'src/web_accessible_resources/epicker-ui.html',
);
const epickerBundlePath = path.resolve(
    process.cwd(),
    'dist/build/uBlock0.chromium-mv3/js/epicker-ui-bundle.js',
);

test.describe('Element Picker UI Flow', () => {
    test('clicking the overlay opens the dialog with cosmetic candidates and the default selected filter', async ({ page }) => {
        const html = await readFile(epickerHtmlPath, 'utf8');
        const bundle = await readFile(epickerBundlePath, 'utf8');

        await page.setContent(
            html.replace(/<script[\s\S]*?<\/script>/g, ''),
            { waitUntil: 'domcontentloaded' },
        );

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                CodeMirror?: {
                    (container: Element): {
                        getValue: () => string;
                        setValue: (value: string) => void;
                        clearHistory: () => void;
                        setOption: () => void;
                        on: (name: string, handler: () => void) => void;
                    };
                    defineOption: () => void;
                    registerHelper: () => void;
                    defineMode: () => void;
                    defineInitHook: () => void;
                    signal: () => void;
                    Pos: (line: number, ch: number) => { line: number; ch: number };
                    commands: Record<string, () => void>;
                };
                vAPI?: {
                    getURL: (path?: string) => string;
                    messaging: {
                        send: (channel: string, msg: { what: string }) => Promise<unknown>;
                    };
                    webextFlavor: { env: string[] };
                };
                __cmValue?: string;
                __pickerRequests?: Array<{ what: string; filter?: string; slot?: number }>;
                __createRequests?: Array<unknown>;
            };

            globalWindow.__cmValue = '';
            globalWindow.__pickerRequests = [];
            globalWindow.__createRequests = [];

            const codeMirrorFactory = function(container: Element) {
                const textarea = document.createElement('textarea');
                textarea.id = 'filterText';
                container.appendChild(textarea);

                const handlers = new Map<string, Array<() => void>>();
                const trigger = (name: string) => {
                    for ( const handler of handlers.get(name) || [] ) {
                        handler();
                    }
                };

                return {
                    getValue() {
                        return textarea.value;
                    },
                    setValue(value: string) {
                        textarea.value = value;
                        globalWindow.__cmValue = value;
                        trigger('changes');
                    },
                    clearHistory() {},
                    setOption() {},
                    on(name: string, handler: () => void) {
                        const list = handlers.get(name) || [];
                        list.push(handler);
                        handlers.set(name, list);
                    },
                };
            } as typeof globalWindow.CodeMirror;

            codeMirrorFactory.defineOption = () => {};
            codeMirrorFactory.registerHelper = () => {};
            codeMirrorFactory.defineMode = () => {};
            codeMirrorFactory.defineInitHook = () => {};
            codeMirrorFactory.signal = () => {};
            codeMirrorFactory.Pos = (line: number, ch: number) => ({ line, ch });
            codeMirrorFactory.commands = {
                foldAll() {},
                unfoldAll() {},
            };

            globalWindow.CodeMirror = codeMirrorFactory;

            globalWindow.vAPI = {
                getURL(path = '') {
                    return `https://extension.invalid/${path}`;
                },
                messaging: {
                    send(channel: string, msg: { what: string }) {
                        if ( channel === 'dashboard' && msg.what === 'getAutoCompleteDetails' ) {
                            return Promise.resolve({});
                        }
                        if ( channel === 'elementPicker' && msg.what === 'createUserFilter' ) {
                            globalWindow.__createRequests?.push(msg);
                        }
                        return Promise.resolve(undefined);
                    },
                },
                webextFlavor: {
                    env: [ 'native_css_has' ],
                },
            };
        });

        await page.addScriptTag({ content: bundle });

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __pickerRequests?: Array<{ what: string; filter?: string; slot?: number }>;
            };

            const channel = new MessageChannel();
            const testPort = channel.port1;

            testPort.onmessage = ev => {
                const msg = ev.data || {};
                globalWindow.__pickerRequests?.push(msg);

                switch ( msg.what ) {
                case 'filterElementAtPoint':
                    testPort.postMessage({
                        what: 'showDialog',
                        url: 'https://www.reddit.com/',
                        netFilters: [],
                        cosmeticFilters: [
                            '##.listingsignupbar.infobar',
                            '##.content',
                        ],
                        filter: {
                            filters: [
                                '##.listingsignupbar.infobar',
                                '##.content',
                            ],
                            slot: 0,
                        },
                    });
                    break;
                case 'optimizeCandidates':
                    if ( msg.slot === 0 ) {
                        testPort.postMessage({
                            what: 'candidatesOptimized',
                            slot: 0,
                            candidates: [
                                '##.listing',
                                '##.listing.infobar',
                                '##a.listingsignupbar__container',
                                '##.listingsignupbar__container',
                                '##.listingsignupbar',
                                '##.listingsignupbar.infobar',
                                '##.listingsignupbar.infobar',
                                '##.listingsignupbar.infobar',
                            ],
                        });
                    } else if ( msg.slot === 1 ) {
                        testPort.postMessage({
                            what: 'candidatesOptimized',
                            slot: 1,
                            candidates: [
                                '##body .content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                            ],
                        });
                    }
                    break;
                case 'dialogSetFilter': {
                    const countByFilter: Record<string, number> = {
                        '##.listingsignupbar.infobar': 1,
                        '##.listingsignupbar': 2,
                        '##.listing.infobar': 3,
                        '##.listing': 8,
                        '##.content': 4,
                        '##body .content': 9,
                    };
                    testPort.postMessage({
                        what: 'resultsetDetails',
                        count: countByFilter[msg.filter || ''] ?? 0,
                    });
                    break;
                }
                default:
                    break;
                }
            };

            window.postMessage({ what: 'epickerStart' }, '*', [ channel.port2 ]);
        });

        await page.locator('svg#sea').click({ position: { x: 120, y: 120 } });

        await expect(page.locator('html')).toHaveClass(/paused/);
        await expect(page.locator('#cosmeticFilters li')).toHaveCount(2);
        await expect(page.locator('#cosmeticFilters li').nth(0)).toHaveText('##.listingsignupbar.infobar');
        await expect(page.locator('#cosmeticFilters li').nth(1)).toHaveText('##.content');
        await expect(page.locator('#filterText')).toHaveValue('##.listingsignupbar.infobar');
        await expect(page.locator('#resultsetCount')).toHaveText('1');
        await expect(page.locator('#resultsetDepth input')).toBeVisible();
        await expect(page.locator('#resultsetSpecificity input')).toBeVisible();

        const requests = await page.evaluate(() =>
            (window as typeof window & {
                __pickerRequests?: Array<{ what: string; filter?: string; slot?: number }>;
            }).__pickerRequests || []
        );

        expect(requests.some(req => req.what === 'filterElementAtPoint')).toBe(true);
        expect(requests.some(req => req.what === 'optimizeCandidates' && req.slot === 0)).toBe(true);
        expect(requests.some(req => req.what === 'dialogSetFilter' && req.filter === '##.listingsignupbar.infobar')).toBe(true);
    });

    test('depth and specificity sliders refine the selected cosmetic filter', async ({ page }) => {
        const html = await readFile(epickerHtmlPath, 'utf8');
        const bundle = await readFile(epickerBundlePath, 'utf8');

        await page.setContent(
            html.replace(/<script[\s\S]*?<\/script>/g, ''),
            { waitUntil: 'domcontentloaded' },
        );

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                CodeMirror?: {
                    (container: Element): {
                        getValue: () => string;
                        setValue: (value: string) => void;
                        clearHistory: () => void;
                        setOption: () => void;
                        on: (name: string, handler: () => void) => void;
                    };
                    defineOption: () => void;
                    registerHelper: () => void;
                    defineMode: () => void;
                    defineInitHook: () => void;
                    signal: () => void;
                    Pos: (line: number, ch: number) => { line: number; ch: number };
                    commands: Record<string, () => void>;
                };
                vAPI?: {
                    getURL: (path?: string) => string;
                    messaging: {
                        send: (channel: string, msg: { what: string }) => Promise<unknown>;
                    };
                    webextFlavor: { env: string[] };
                };
                __cmValue?: string;
                __pickerRequests?: Array<{ what: string; filter?: string; slot?: number }>;
            };

            globalWindow.__cmValue = '';
            globalWindow.__pickerRequests = [];

            const codeMirrorFactory = function(container: Element) {
                const textarea = document.createElement('textarea');
                textarea.id = 'filterText';
                container.appendChild(textarea);

                const handlers = new Map<string, Array<() => void>>();
                const trigger = (name: string) => {
                    for ( const handler of handlers.get(name) || [] ) {
                        handler();
                    }
                };

                return {
                    getValue() {
                        return textarea.value;
                    },
                    setValue(value: string) {
                        textarea.value = value;
                        globalWindow.__cmValue = value;
                        trigger('changes');
                    },
                    clearHistory() {},
                    setOption() {},
                    on(name: string, handler: () => void) {
                        const list = handlers.get(name) || [];
                        list.push(handler);
                        handlers.set(name, list);
                    },
                };
            } as typeof globalWindow.CodeMirror;

            codeMirrorFactory.defineOption = () => {};
            codeMirrorFactory.registerHelper = () => {};
            codeMirrorFactory.defineMode = () => {};
            codeMirrorFactory.defineInitHook = () => {};
            codeMirrorFactory.signal = () => {};
            codeMirrorFactory.Pos = (line: number, ch: number) => ({ line, ch });
            codeMirrorFactory.commands = {
                foldAll() {},
                unfoldAll() {},
            };

            globalWindow.CodeMirror = codeMirrorFactory;

            globalWindow.vAPI = {
                getURL(path = '') {
                    return `https://extension.invalid/${path}`;
                },
                messaging: {
                    send(channel: string, msg: { what: string }) {
                        if ( channel === 'dashboard' && msg.what === 'getAutoCompleteDetails' ) {
                            return Promise.resolve({});
                        }
                        return Promise.resolve(undefined);
                    },
                },
                webextFlavor: {
                    env: [ 'native_css_has' ],
                },
            };
        });

        await page.addScriptTag({ content: bundle });

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __pickerRequests?: Array<{ what: string; filter?: string; slot?: number }>;
            };

            const channel = new MessageChannel();
            const testPort = channel.port1;

            testPort.onmessage = ev => {
                const msg = ev.data || {};
                globalWindow.__pickerRequests?.push(msg);

                switch ( msg.what ) {
                case 'filterElementAtPoint':
                    testPort.postMessage({
                        what: 'showDialog',
                        url: 'https://www.reddit.com/',
                        netFilters: [],
                        cosmeticFilters: [
                            '##.listingsignupbar.infobar',
                            '##.content',
                        ],
                        filter: {
                            filters: [
                                '##.listingsignupbar.infobar',
                                '##.content',
                            ],
                            slot: 0,
                        },
                    });
                    break;
                case 'optimizeCandidates':
                    if ( msg.slot === 0 ) {
                        testPort.postMessage({
                            what: 'candidatesOptimized',
                            slot: 0,
                            candidates: [
                                '##.listing',
                                '##.listing.infobar',
                                '##.listing.infobar',
                                '##.listingsignupbar',
                                '##.listingsignupbar',
                                '##.listingsignupbar.infobar',
                                '##.listingsignupbar.infobar',
                                '##.listingsignupbar.infobar',
                            ],
                        });
                    } else if ( msg.slot === 1 ) {
                        testPort.postMessage({
                            what: 'candidatesOptimized',
                            slot: 1,
                            candidates: [
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                                '##.content',
                            ],
                        });
                    }
                    break;
                case 'dialogSetFilter': {
                    const countByFilter: Record<string, number> = {
                        '##.listingsignupbar.infobar': 1,
                        '##.listingsignupbar': 2,
                        '##.listing.infobar': 3,
                        '##.listing': 8,
                        '##.content': 4,
                    };
                    testPort.postMessage({
                        what: 'resultsetDetails',
                        count: countByFilter[msg.filter || ''] ?? 0,
                    });
                    break;
                }
                default:
                    break;
                }
            };

            window.postMessage({ what: 'epickerStart' }, '*', [ channel.port2 ]);
        });

        await page.locator('svg#sea').click({ position: { x: 120, y: 120 } });
        await expect(page.locator('#filterText')).toHaveValue('##.listingsignupbar.infobar');
        await expect(page.locator('#resultsetCount')).toHaveText('1');

        await page.locator('#resultsetSpecificity input').evaluate((input: HTMLInputElement) => {
            input.value = '0';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await expect(page.locator('#filterText')).toHaveValue('##.listing');
        await expect(page.locator('#resultsetCount')).toHaveText('8');

        await page.locator('#resultsetDepth input').evaluate((input: HTMLInputElement) => {
            input.value = '0';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await expect(page.locator('#filterText')).toHaveValue('##.content');
        await expect(page.locator('#resultsetCount')).toHaveText('4');

        const requests = await page.evaluate(() =>
            (window as typeof window & {
                __pickerRequests?: Array<{ what: string; filter?: string; slot?: number }>;
            }).__pickerRequests || []
        );

        expect(requests.some(req => req.what === 'optimizeCandidates' && req.slot === 1)).toBe(true);
        expect(requests.some(req => req.what === 'dialogSetFilter' && req.filter === '##.listing')).toBe(true);
        expect(requests.some(req => req.what === 'dialogSetFilter' && req.filter === '##.content')).toBe(true);
    });
});
