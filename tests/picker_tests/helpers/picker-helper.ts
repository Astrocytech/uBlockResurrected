/**
 * Picker Test Helper Utilities
 * 
 * Provides mock implementation for testing picker functionality
 */

import { type Page, type BrowserContext } from '@playwright/test';

/**
 * Picker state during testing
 */
export interface PickerState {
    isActive: boolean;
    highlightedElements: string[];
    selectedSelector: string;
    candidateCount: number;
    sliderPosition: number;
    previewMode: boolean;
    viewState: number;
}

/**
 * Selectors for picker UI elements
 */
export const PICKER_SELECTORS = {
    pickerFrame: '#ubol-picker-frame, [data-ubol-overlay]',
    quitButton: '#quit',
    minimizeButton: '#minimize',
    pickButton: '#pick',
    previewButton: '#preview',
    createButton: '#create',
    overlaySvg: 'svg#overlay',
    overlayPath: 'svg#overlay path',
    textarea: 'textarea, #filterText',
    slider: '#slider',
    resultsetCount: '#resultsetCount',
    candidateFilters: '#candidateFilters',
    candidateList: '#candidateFilters ul',
    moreOrLess: '#moreOrLess',
    toolbar: '#toolbar',
    windowbar: '#windowbar',
    dialog: '#dialog',
    filterArea: '#filterArea',
    // Test elements
    simpleDiv: '#simple-div',
    simpleSpan: '#simple-span',
    simpleParagraph: '#simple-paragraph',
    nestedContainer: '#nested-container',
    nestedInner: '#nested-inner',
    elementWithId: '#element-with-id',
    elementWithClass: '.element-with-class',
    dataElement: '[data-testid="test-element"]',
    nestedDataElement: '[data-nested="true"]',
    multipleClasses: '.class-one.class-two',
    attributeTest: '[data-attribute="test-value"]',
} as const;

/**
 * Create mock picker frame for testing
 */
export async function createMockPickerFrame(page: Page): Promise<void> {
    await page.evaluate(() => {
        const existing = document.getElementById('ubol-picker-frame');
        if (existing) existing.remove();
        
        const frame = document.createElement('iframe');
        frame.id = 'ubol-picker-frame';
        frame.setAttribute('data-ubol-overlay', '');
        frame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:2147483647;background:transparent;';
        
        document.body.appendChild(frame);
    });
}

/**
 * Remove mock picker frame
 */
export async function removeMockPickerFrame(page: Page): Promise<void> {
    await page.evaluate(() => {
        const frame = document.getElementById('ubol-picker-frame');
        frame?.remove();
    });
}

/**
 * PickerTestHelper class
 */
export class PickerTestHelper {
    private page: Page;
    private context: BrowserContext;
    
    constructor(page: Page, context: BrowserContext) {
        this.page = page;
        this.context = context;
    }
    
    async navigateToTestPage(): Promise<void> {
        const testPageUrl = `file://${process.cwd()}/tests/picker_tests/fixtures/test-page.html`;
        await this.page.goto(testPageUrl);
        await this.page.waitForLoadState('domcontentloaded');
    }
    
    async activatePicker(): Promise<void> {
        await this.page.evaluate(() => {
            const secretAttr = 'ubol-test-secret';
            (window as any).pickerSecret = secretAttr;
            
            // Create frame
            const frame = document.createElement('iframe');
            frame.id = 'ubol-picker-frame';
            frame.setAttribute('data-ubol-overlay', '');
            frame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:2147483647;background:transparent;';
            document.body.appendChild(frame);
            
            // Create a mock port
            const mockPort = {
                postMessage: () => {},
                onmessage: null,
                onmessageerror: null,
                close: () => {}
            };
            
            // Initialize ubolOverlay with port
            (window as any).ubolOverlay = {
                secretAttr: secretAttr,
                file: '/picker-ui.html',
                isActive: true,
                highlightedElements: [],
                port: mockPort,
                frame: frame,
                highlightedElementsArr: [] as Element[],
                
                highlightElements: function(elems: Element[]) {
                    this.highlightedElementsArr = Array.from(elems || []).filter((e: Element) => 
                        e instanceof Element && e.id !== 'ubol-picker-frame'
                    );
                    this.highlightedElements = this.highlightedElementsArr.map((e: Element) => e.id || e.tagName);
                },
                
                elementFromPoint: function(x: number, y: number): Element | null {
                    if (!this.frame) return null;
                    (this.frame as HTMLElement).setAttribute('data-ubol-overlay-click', '');
                    const elem = document.elementFromPoint(x, y);
                    (this.frame as HTMLElement).removeAttribute('data-ubol-overlay-click');
                    if (elem === document.body || elem === document.documentElement) return null;
                    if (elem === this.frame) return null;
                    return elem as Element;
                },
                
                stop: function() {
                    this.isActive = false;
                    if (this.frame) {
                        this.frame.remove();
                        this.frame = null;
                    }
                }
            };
            
            // Initialize picker state
            (window as any).pickerState = {
                isActive: true,
                selectedSelector: '',
                candidateCount: 0,
                sliderPosition: -1,
                previewMode: false,
                paused: false,
                minimized: true,
                viewState: 0,
            };
            
            // Initialize message handler
            (window as any).pickerMessageHandler = (msg: any) => {
                switch (msg.what) {
                    case 'startTool':
                        (window as any).pickerState.isActive = true;
                        break;
                    case 'quitTool':
                        (window as any).ubolOverlay.stop();
                        (window as any).pickerState.isActive = false;
                        break;
                    case 'highlightElementAtPoint':
                        const elem = (window as any).ubolOverlay.elementFromPoint(msg.mx, msg.my);
                        if (elem) {
                            (window as any).ubolOverlay.highlightElements([elem]);
                        }
                        break;
                    case 'unhighlight':
                        (window as any).ubolOverlay.highlightElements([]);
                        break;
                    case 'candidatesAtPoint':
                        // Return mock candidates
                        return {
                            partsDB: [],
                            listParts: [],
                            sliderParts: []
                        };
                }
            };
            
            (window as any).toolOverlay = {
                port: mockPort,
                highlightElementUnderMouse: (state: boolean) => {},
                postMessage: (msg: any) => {
                    if (msg.what === 'candidatesAtPoint') {
                        return Promise.resolve({
                            partsDB: [
                                [4096, 'div'],
                                [4097, '#element-with-id'],
                                [4098, '.element-with-class'],
                            ],
                            listParts: [
                                [4096, 4097, 4098],
                            ],
                            sliderParts: [
                                [4096, 4097, 4098],
                                [4096, 4098],
                                [4096],
                            ]
                        });
                    }
                    return Promise.resolve();
                }
            };
            
            (window as any).pickerCandidates = [];
            (window as any).pickerPartsDB = new Map();
            (window as any).sliderParts = [];
        });
    }
    
    async deactivatePicker(): Promise<void> {
        await this.page.evaluate(() => {
            const frame = document.getElementById('ubol-picker-frame');
            if (frame) frame.remove();
            
            (window as any).ubolOverlay = undefined;
            (window as any).pickerState = undefined;
        });
    }
    
    async hoverOver(selector: string): Promise<void> {
        const box = await this.page.locator(selector).first().boundingBox();
        if (box) {
            await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        }
    }
    
    async clickElement(selector: string): Promise<void> {
        const box = await this.page.locator(selector).first().boundingBox();
        if (box) {
            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
    }
    
    async pressKey(key: string): Promise<void> {
        await this.page.keyboard.press(key);
    }
    
    async getPickerState(): Promise<PickerState> {
        return await this.page.evaluate(() => {
            return (window as any).pickerState || {
                isActive: false,
                highlightedElements: [],
                selectedSelector: '',
                candidateCount: 0,
                sliderPosition: -1,
                previewMode: false,
                viewState: 0,
            };
        });
    }
    
    async elementExists(selector: string): Promise<boolean> {
        return await this.page.locator(selector).count() > 0;
    }
    
    async waitForPickerActive(timeout: number = 5000): Promise<void> {
        await this.page.waitForFunction(() => {
            const state = (window as any).pickerState;
            return state && state.isActive === true;
        }, { timeout });
    }
    
    async waitForPickerInactive(timeout: number = 5000): Promise<void> {
        await this.page.waitForFunction(() => {
            const state = (window as any).pickerState;
            return !state || state.isActive === false;
        }, { timeout });
    }
    
    async getCandidates(): Promise<any[]> {
        return await this.page.evaluate(() => {
            return (window as any).pickerCandidates || [];
        });
    }
    
    async getSelectedSelector(): Promise<string> {
        return await this.page.evaluate(() => {
            const state = (window as any).pickerState;
            return state?.selectedSelector || '';
        });
    }
    
    async setSelectedSelector(selector: string): Promise<void> {
        await this.page.evaluate((sel) => {
            const state = (window as any).pickerState;
            if (state) {
                state.selectedSelector = sel;
            }
        }, selector);
    }
    
    async getElementCount(): Promise<number> {
        return await this.page.evaluate(() => {
            const state = (window as any).pickerState;
            return state?.candidateCount || 0;
        });
    }
    
    async sliderPosition(): Promise<number> {
        return await this.page.evaluate(() => {
            const state = (window as any).pickerState;
            return state?.sliderPosition ?? -1;
        });
    }
    
    async isPreviewMode(): Promise<boolean> {
        return await this.page.evaluate(() => {
            const state = (window as any).pickerState;
            return state?.previewMode || false;
        });
    }
    
    async viewState(): Promise<number> {
        return await this.page.evaluate(() => {
            const state = (window as any).pickerState;
            return state?.viewState ?? 0;
        });
    }
    
    async isPaused(): Promise<boolean> {
        return await this.page.evaluate(() => {
            const state = (window as any).pickerState;
            return state?.paused || false;
        });
    }
    
    async isMinimized(): Promise<boolean> {
        return await this.page.evaluate(() => {
            const state = (window as any).pickerState;
            return state?.minimized || false;
        });
    }
    
    async triggerCandidatesAtPoint(x: number, y: number): Promise<void> {
        await this.page.evaluate((coords) => {
            const pickerState = (window as any).pickerState;
            if (pickerState) {
                pickerState.paused = true;
                pickerState.minimized = false;
                pickerState.candidateCount = 3;
            }
            
            const toolOverlay = (window as any).toolOverlay;
            if (toolOverlay && toolOverlay.port && typeof toolOverlay.port.onmessage === 'function') {
                toolOverlay.port.onmessage({ data: { msg: { what: 'startTool' } } });
            }
        }, { x, y });
    }
    
    async getSliderParts(): Promise<any[]> {
        return await this.page.evaluate(() => {
            return (window as any).sliderParts || [];
        });
    }
    
    async getHighlightedElements(): Promise<string[]> {
        return await this.page.evaluate(() => {
            return (window as any).ubolOverlay?.highlightedElements || [];
        });
    }
}
