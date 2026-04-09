import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const pickerHtmlPath = path.resolve(process.cwd(), 'src/picker-ui.html');
const pickerUiPath = path.resolve(process.cwd(), 'src/js/scripting/picker-ui.js');

test.describe('Picker UI Flow', () => {
    test('clicking the overlay shows cosmetic filters and the two sliders refine the selected filter', async ({ page }) => {
        const html = await readFile(pickerHtmlPath, 'utf8');
        const pickerUiScript = await readFile(pickerUiPath, 'utf8');

        await page.setContent(
            html.replace(/<script[\s\S]*?<\/script>/g, ''),
            { waitUntil: 'domcontentloaded' },
        );

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __faIconsInitCalls?: number;
                __hoverStates?: boolean[];
                __highlightSelectors?: string[];
                toolOverlay?: unknown;
            };
            globalWindow.__faIconsInitCalls = 0;
            globalWindow.__hoverStates = [];
            globalWindow.__highlightSelectors = [];

            globalWindow.faIconsInit = () => {
                globalWindow.__faIconsInitCalls = (globalWindow.__faIconsInitCalls || 0) + 1;
            };

            globalWindow.toolOverlay = {
                start(onmessage: (msg: { what: string }) => void) {
                    onmessage({ what: 'startTool' });
                },
                stop() {},
                highlightElementUnderMouse(state: boolean) {
                    globalWindow.__hoverStates?.push(state);
                },
                postMessage(msg: { what: string; selector?: string }) {
                    switch ( msg.what ) {
                    case 'startTool':
                    case 'unhighlight':
                    case 'previewSelector':
                        return Promise.resolve();
                    case 'candidatesAtPoint':
                        return Promise.resolve({
                            cosmeticFilters: [
                                {
                                    label: '##.listingsignupbar.infobar',
                                    filters: [
                                        '##.listingsignupbar.infobar',
                                        '##a.listingsignupbar.infobar',
                                    ],
                                },
                                {
                                    label: '##.content',
                                    filters: [
                                        '##.content',
                                        '##main.content',
                                    ],
                                },
                            ],
                            filter: {
                                slot: 0,
                                specificity: 0,
                            },
                        });
                    case 'highlightFromSelector':
                        globalWindow.__highlightSelectors?.push(msg.selector || '');
                        if ( msg.selector === '.listingsignupbar.infobar' ) {
                            return Promise.resolve({ count: 1 });
                        }
                        if ( msg.selector === 'a.listingsignupbar.infobar' ) {
                            return Promise.resolve({ count: 1 });
                        }
                        if ( msg.selector === '.content' ) {
                            return Promise.resolve({ count: 1 });
                        }
                        if ( msg.selector === 'main.content' ) {
                            return Promise.resolve({ count: 1 });
                        }
                        return Promise.resolve({ count: 0, error: 'Unexpected selector' });
                    default:
                        return Promise.resolve();
                    }
                },
            };
        });

        await page.addScriptTag({ content: pickerUiScript });

        await expect.poll(async () => {
            return page.evaluate(() =>
                (window as typeof window & { __faIconsInitCalls?: number }).__faIconsInitCalls || 0,
            );
        }).toBe(1);

        await page.locator('#overlay').click({ position: { x: 40, y: 40 } });

        await expect(page.locator('html')).toHaveClass(/paused/);
        await expect(page.locator('#filterText')).toHaveValue('##.listingsignupbar.infobar');
        await expect(page.locator('#cosmeticFilters .changeFilter li')).toHaveCount(2);
        await expect(page.locator('#cosmeticFilters .changeFilter li').nth(0)).toHaveText('##.listingsignupbar.infobar');
        await expect(page.locator('#cosmeticFilters .changeFilter li').nth(1)).toHaveText('##.content');
        await expect(page.locator('#resultsetCount')).toHaveText('1');

        await page.locator('#resultsetSpecificity input').evaluate((input: HTMLInputElement) => {
            input.value = '1';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect(page.locator('#filterText')).toHaveValue('##a.listingsignupbar.infobar');

        await page.locator('#resultsetDepth input').evaluate((input: HTMLInputElement) => {
            input.value = '0';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect(page.locator('#filterText')).toHaveValue('##.content');

        const state = await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __hoverStates?: boolean[];
                __highlightSelectors?: string[];
                pickerState?: {
                    paused: boolean;
                    candidateCount: number;
                    selectedSelector: string;
                    selectedDepth: number;
                    selectedSpecificity: number;
                };
            };
            return {
                hoverStates: globalWindow.__hoverStates,
                highlightSelectors: globalWindow.__highlightSelectors,
                pickerState: globalWindow.pickerState,
            };
        });

        expect(state.hoverStates).toEqual([ true, false ]);
        expect(state.highlightSelectors).toContain('.listingsignupbar.infobar');
        expect(state.highlightSelectors).toContain('a.listingsignupbar.infobar');
        expect(state.highlightSelectors).toContain('.content');
        expect(state.pickerState).toEqual(expect.objectContaining({
            paused: true,
            candidateCount: 1,
            selectedSelector: '##.content',
            selectedDepth: 1,
            selectedSpecificity: 0,
        }));
    });

    test('manual filter editing keeps preview usable while create stays disabled', async ({ page }) => {
        const html = await readFile(pickerHtmlPath, 'utf8');
        const pickerUiScript = await readFile(pickerUiPath, 'utf8');

        await page.setContent(
            html.replace(/<script[\s\S]*?<\/script>/g, ''),
            { waitUntil: 'domcontentloaded' },
        );

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                faIconsInit?: () => void;
                toolOverlay?: unknown;
                __selectors?: string[];
            };
            globalWindow.__selectors = [];
            globalWindow.faIconsInit = () => {};
            globalWindow.toolOverlay = {
                start(onmessage: (msg: { what: string }) => void) {
                    onmessage({ what: 'startTool' });
                },
                stop() {},
                highlightElementUnderMouse() {},
                postMessage(msg: { what: string; selector?: string }) {
                    if ( msg.what === 'candidatesAtPoint' ) {
                        return Promise.resolve({
                            cosmeticFilters: [
                                {
                                    label: '##.listingsignupbar.infobar',
                                    filters: [
                                        '##.listingsignupbar.infobar',
                                    ],
                                },
                            ],
                            filter: {
                                slot: 0,
                                specificity: 0,
                            },
                        });
                    }
                    if ( msg.what === 'highlightFromSelector' ) {
                        globalWindow.__selectors?.push(msg.selector || '');
                        if ( msg.selector === '.content' ) {
                            return Promise.resolve({ count: 1 });
                        }
                        return Promise.resolve({ count: 0, error: 'Unexpected selector' });
                    }
                    return Promise.resolve();
                },
            };
        });

        await page.addScriptTag({ content: pickerUiScript });
        await page.locator('#overlay').click({ position: { x: 40, y: 40 } });

        await page.locator('#filterText').fill('##.content');
        await page.locator('#filterText').dispatchEvent('input');

        await expect(page.locator('#filterText')).toHaveValue('##.content');
        await expect(page.locator('#resultsetCount')).toHaveText('1');
        await expect(page.locator('#create')).toBeDisabled();

        const selectors = await page.evaluate(() =>
            (window as typeof window & { __selectors?: string[] }).__selectors || [],
        );
        expect(selectors).toContain('.content');
    });
});
