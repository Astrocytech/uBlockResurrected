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

    test('picker startup primes the highlight without opening the dialog', async ({ page }) => {
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
                __startToolCalls?: number;
            };
            globalWindow.__startToolCalls = 0;
            globalWindow.faIconsInit = () => {};
            globalWindow.toolOverlay = {
                start(onmessage: (msg: { what: string }) => void) {
                    onmessage({ what: 'startTool' });
                },
                stop() {},
                highlightElementUnderMouse() {},
                postMessage(msg: { what: string }) {
                    if ( msg.what === 'startTool' ) {
                        globalWindow.__startToolCalls = (globalWindow.__startToolCalls || 0) + 1;
                        return Promise.resolve({
                            primed: true,
                            highlighted: true,
                        });
                    }
                    if ( msg.what === 'highlightFromSelector' ) {
                        return Promise.resolve({ count: 1 });
                    }
                    return Promise.resolve();
                },
            };
        });

        await page.addScriptTag({ content: pickerUiScript });

        await expect(page.locator('html')).not.toHaveClass(/paused/);
        await expect(page.locator('#filterText')).toHaveValue('');
        await expect(page.locator('#cosmeticFilters .changeFilter li')).toHaveCount(0);
        await expect.poll(async () => {
            return page.evaluate(() =>
                (window as typeof window & { __startToolCalls?: number }).__startToolCalls || 0,
            );
        }).toBe(1);
    });

    test('startup does not open the dialog until the user clicks an element', async ({ page }) => {
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
            };
            globalWindow.faIconsInit = () => {};
            globalWindow.toolOverlay = {
                start(onmessage: (msg: { what: string }) => void) {
                    onmessage({ what: 'startTool' });
                },
                stop() {},
                highlightElementUnderMouse() {},
                postMessage(msg: { what: string }) {
                    if ( msg.what === 'startTool' ) {
                        return Promise.resolve({
                            primed: true,
                            highlighted: true,
                        });
                    }
                    return Promise.resolve();
                },
            };
        });

        await page.addScriptTag({ content: pickerUiScript });

        await expect(page.locator('html')).not.toHaveClass(/paused/);
        await expect(page.locator('#filterText')).toHaveValue('');
        await expect(page.locator('#cosmeticFilters .changeFilter li')).toHaveCount(0);
    });

    test('boot startup highlights the exact clicked element instead of normalizing upward', async ({ page }) => {
        const pickerScript = await readFile(
            path.resolve(process.cwd(), 'src/js/scripting/picker.js'),
            'utf8',
        );

        await page.setContent('<!doctype html><body><div class="card"><span id="picked">Label</span></div></body>', {
            waitUntil: 'domcontentloaded',
        });

        const result = await page.evaluate((script) => {
            const picked = document.getElementById('picked');
            const card = document.querySelector('.card');
            (window as typeof window & {
                __bootResult?: unknown;
                __highlightedTag?: string | null;
                ubolOverlay?: unknown;
                __ubrPickerBoot?: unknown;
            }).__ubrPickerBoot = {
                initialPoint: { x: 10, y: 10 },
            };
            (window as typeof window & { ubolOverlay?: unknown }).ubolOverlay = {
                file: null,
                frame: null,
                start() {},
                stop() {},
                install(_file: string, onmessage: (msg: { what: string }) => unknown) {
                    (window as typeof window & { __bootResult?: unknown }).__bootResult = onmessage({ what: 'startTool' });
                },
                elementFromPoint() {
                    return picked;
                },
                elementsFromSelector(selector: string) {
                    if ( selector === '#picked' || selector === 'span:nth-of-type(1)' ) {
                        return { elems: [ picked ], error: undefined };
                    }
                    if ( selector === '.card' || selector === 'div.card' ) {
                        return { elems: [ card ], error: undefined };
                    }
                    return { elems: [], error: undefined };
                },
                qsa(_node: ParentNode, selector: string) {
                    return Array.from(document.querySelectorAll(selector));
                },
                highlightElements(elems: Element[]) {
                    (window as typeof window & { __highlightedTag?: string | null }).__highlightedTag = elems[0]?.id || elems[0]?.className || null;
                },
                sendMessage() {
                    return Promise.resolve();
                },
                postMessage() {
                    return Promise.resolve();
                },
            };
            eval(script);
            return {
                bootResult: (window as typeof window & { __bootResult?: unknown }).__bootResult as {
                    primed?: boolean;
                    highlighted?: boolean;
                },
                highlightedTag: (window as typeof window & { __highlightedTag?: string | null }).__highlightedTag,
            };
        }, pickerScript);

        expect(result.bootResult.primed).toBe(true);
        expect(result.bootResult.highlighted).toBe(true);
        expect(result.highlightedTag).toBe('picked');
    });

    test('boot startup prefers exactTarget over an ambiguous initial point', async ({ page }) => {
        const pickerScript = await readFile(
            path.resolve(process.cwd(), 'src/js/scripting/picker.js'),
            'utf8',
        );

        await page.setContent(
            '<!doctype html><body><article><a class="invisible-when-pinned thumbnail outbound loggedin may-blank" data-event-action="thumbnail" href="https://example.com/story">Thumbnail</a><a class="outbound loggedin title may-blank" data-event-action="title" href="https://example.com/story"><span>Story title</span></a></article></body>',
            { waitUntil: 'domcontentloaded' },
        );

        const result = await page.evaluate((script) => {
            const thumbnail = document.querySelector('[data-event-action="thumbnail"]');
            const title = document.querySelector('[data-event-action="title"]');
            (window as typeof window & {
                __bootResult?: unknown;
                __highlightedAction?: string | null;
                ubolOverlay?: unknown;
                __ubrPickerBoot?: unknown;
            }).__ubrPickerBoot = {
                initialPoint: { x: 10, y: 10 },
                exactTarget: {
                    selector: 'a.outbound.loggedin.title.may-blank[href="https\\:\\/\\/example.com\\/story"][data-event-action="title"]',
                },
            };
            (window as typeof window & { ubolOverlay?: unknown }).ubolOverlay = {
                file: null,
                frame: null,
                start() {},
                stop() {},
                install(_file: string, onmessage: (msg: { what: string }) => unknown) {
                    (window as typeof window & { __bootResult?: unknown }).__bootResult = onmessage({ what: 'startTool' });
                },
                elementFromPoint() {
                    return thumbnail;
                },
                elementsFromSelector(selector: string) {
                    return {
                        elems: Array.from(document.querySelectorAll(selector)),
                        error: undefined,
                    };
                },
                qsa(_node: ParentNode, selector: string) {
                    return Array.from(document.querySelectorAll(selector));
                },
                highlightElements(elems: Element[]) {
                    (window as typeof window & { __highlightedAction?: string | null }).__highlightedAction =
                        elems[0]?.getAttribute('data-event-action') || null;
                },
                sendMessage() {
                    return Promise.resolve();
                },
                postMessage() {
                    return Promise.resolve();
                },
            };
            eval(script);
            return {
                bootResult: (window as typeof window & { __bootResult?: unknown }).__bootResult as {
                    primed?: boolean;
                    highlighted?: boolean;
                },
                highlightedAction: (window as typeof window & { __highlightedAction?: string | null }).__highlightedAction,
                titleExists: Boolean(title),
            };
        }, pickerScript);

        expect(result.titleExists).toBe(true);
        expect(result.bootResult.primed).toBe(true);
        expect(result.bootResult.highlighted).toBe(true);
        expect(result.highlightedAction).toBe('title');
    });

    test('boot startup can prefer an id-bearing container over a nearby actionable link', async ({ page }) => {
        const pickerScript = await readFile(
            path.resolve(process.cwd(), 'src/js/scripting/picker.js'),
            'utf8',
        );

        await page.setContent(
            '<!doctype html><body><div id="_DErZab3nHNnJ0PEP5o_p2AU_61"><a class="zReHs" href="https://www.reddit.com/r/recruitinghell/comments/1mht84e/is_innodata_a_scam/" data-ved="2ahUKEwiE7bCG_eOTAxUxCjQIHbIvCH8QFnoECCMQAQ"><span>Innodata result</span></a></div></body>',
            { waitUntil: 'domcontentloaded' },
        );

        const result = await page.evaluate((script) => {
            const link = document.querySelector('a.zReHs');
            (window as typeof window & {
                __bootResult?: unknown;
                __highlightedId?: string | null;
                ubolOverlay?: unknown;
                __ubrPickerBoot?: unknown;
            }).__ubrPickerBoot = {
                initialPoint: { x: 10, y: 10 },
                exactTarget: {
                    selector: 'div#_DErZab3nHNnJ0PEP5o_p2AU_61',
                },
            };
            (window as typeof window & { ubolOverlay?: unknown }).ubolOverlay = {
                file: null,
                frame: null,
                start() {},
                stop() {},
                install(_file: string, onmessage: (msg: { what: string }) => unknown) {
                    (window as typeof window & { __bootResult?: unknown }).__bootResult = onmessage({ what: 'startTool' });
                },
                elementFromPoint() {
                    return link;
                },
                elementsFromSelector(selector: string) {
                    return {
                        elems: Array.from(document.querySelectorAll(selector)),
                        error: undefined,
                    };
                },
                qsa(_node: ParentNode, selector: string) {
                    return Array.from(document.querySelectorAll(selector));
                },
                highlightElements(elems: Element[]) {
                    (window as typeof window & { __highlightedId?: string | null }).__highlightedId = elems[0]?.id || null;
                },
                sendMessage() {
                    return Promise.resolve();
                },
                postMessage() {
                    return Promise.resolve();
                },
            };
            eval(script);
            return {
                bootResult: (window as typeof window & { __bootResult?: unknown }).__bootResult as {
                    primed?: boolean;
                    highlighted?: boolean;
                },
                highlightedId: (window as typeof window & { __highlightedId?: string | null }).__highlightedId,
            };
        }, pickerScript);

        expect(result.bootResult.primed).toBe(true);
        expect(result.bootResult.highlighted).toBe(true);
        expect(result.highlightedId).toBe('_DErZab3nHNnJ0PEP5o_p2AU_61');
    });

    test('manual filter editing keeps preview usable while Confirm enables for valid selectors', async ({ page }) => {
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
        await expect(page.locator('#create')).toBeEnabled();

        const selectors = await page.evaluate(() =>
            (window as typeof window & { __selectors?: string[] }).__selectors || [],
        );
        expect(selectors).toContain('.content');
    });

    test('clicking Confirm sends the selected filter to the page script and quits the picker', async ({ page }) => {
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
                __messages?: Array<{ what: string; filter?: string }>;
                __stopped?: number;
            };
            globalWindow.__messages = [];
            globalWindow.__stopped = 0;
            globalWindow.faIconsInit = () => {};
            globalWindow.toolOverlay = {
                start(onmessage: (msg: { what: string }) => void) {
                    onmessage({ what: 'startTool' });
                },
                stop() {
                    globalWindow.__stopped = (globalWindow.__stopped || 0) + 1;
                },
                highlightElementUnderMouse() {},
                postMessage(msg: { what: string; selector?: string; filter?: string }) {
                    globalWindow.__messages?.push(msg);
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
                        return Promise.resolve({ count: 1 });
                    }
                    return Promise.resolve();
                },
            };
        });

        await page.addScriptTag({ content: pickerUiScript });
        await page.locator('#overlay').click({ position: { x: 40, y: 40 } });
        await expect(page.locator('#filterText')).toHaveValue('##.listingsignupbar.infobar');

        await page.locator('#create').click();

        const state = await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __messages?: Array<{ what: string; filter?: string }>;
                __stopped?: number;
            };
            return {
                messages: globalWindow.__messages || [],
                stopped: globalWindow.__stopped || 0,
            };
        });

        expect(state.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    what: 'confirmSelection',
                    filter: '##.listingsignupbar.infobar',
                }),
            ]),
        );
        expect(state.stopped).toBe(1);
    });
});
