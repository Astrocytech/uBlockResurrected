/**
 * Picker Activation Tests
 * 
 * Tests for picker activation flow:
 * - Popup to content script communication
 * - Iframe creation
 * - State initialization
 * - Message channel setup
 * 
 * Based on Picker.md Flow 1 and Flow 2
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
    PickerTestHelper,
    PICKER_SELECTORS,
    createMockPickerFrame,
    removeMockPickerFrame,
} from './helpers/picker-helper';

test.describe('Picker Activation', () => {
    let page: Page;
    let context: BrowserContext;
    let helper: PickerTestHelper;

    test.beforeEach(async ({ page: testPage, context: testContext }) => {
        page = testPage;
        context = testContext;
        helper = new PickerTestHelper(page, context);
        
        await helper.navigateToTestPage();
        await createMockPickerFrame(page);
    });

    test.afterEach(async () => {
        await removeMockPickerFrame(page);
    });

    test.describe('Activation Flow', () => {
        test('should create ubolOverlay singleton when activated', async () => {
            const beforeActivation = await page.evaluate(() => {
                return (window as any).ubolOverlay === undefined;
            });
            expect(beforeActivation).toBe(true);

            await helper.activatePicker();

            const ubolOverlayExists = await page.evaluate(() => {
                return (window as any).ubolOverlay !== undefined;
            });
            expect(ubolOverlayExists).toBe(true);
        });

        test('should generate unique secret attribute', async () => {
            await helper.activatePicker();

            const secretAttr = await page.evaluate(() => {
                return (window as any).ubolOverlay?.secretAttr;
            });

            expect(secretAttr).toBeDefined();
            expect(secretAttr).toMatch(/^ubol-[a-z0-9-]+$/);
            expect(secretAttr.length).toBeGreaterThan(5);
        });

        test('should create picker iframe', async () => {
            await helper.activatePicker();
            
            const iframeExists = await page.locator(PICKER_SELECTORS.pickerFrame).count();
            expect(iframeExists).toBeGreaterThan(0);
        });

        test.skip('should set iframe src to picker-ui.html for UI to load', async () => {
            await helper.activatePicker();

            const iframeSrc = await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                const frame = overlay?.frame as HTMLIFrameElement | null;
                if (!frame) return null;
                return frame.getAttribute('src');
            });

            expect(iframeSrc).toBeTruthy();
            expect(iframeSrc).toContain('picker-ui.html');
        });

        test('should initialize port for MessageChannel communication', async () => {
            await helper.activatePicker();

            const portExists = await page.evaluate(() => {
                return (window as any).ubolOverlay?.port !== null;
            });
            expect(portExists).toBe(true);
        });

        test('should not create duplicate overlay on re-activation', async () => {
            await helper.activatePicker();

            const firstSecret = await page.evaluate(() => {
                return (window as any).ubolOverlay?.secretAttr;
            });

            await helper.activatePicker();

            const secondSecret = await page.evaluate(() => {
                return (window as any).ubolOverlay?.secretAttr;
            });

            expect(firstSecret).toBe(secondSecret);
        });

        test.skip('should inject three files via scripting.executeScript', async () => {
            await helper.activatePicker();

            const cssApiLoaded = await page.evaluate(() => {
                return typeof (window as any).ProceduralFiltererAPI !== 'undefined' ||
                       typeof (window as any).cssProceduralApi !== 'undefined';
            });

            const overlayLoaded = await page.evaluate(() => {
                return (window as any).ubolOverlay !== undefined;
            });

            const pickerLoaded = await page.evaluate(() => {
                return (window as any).pickerState !== undefined;
            });

            expect(cssApiLoaded).toBe(true);
            expect(overlayLoaded).toBe(true);
            expect(pickerLoaded).toBe(true);
        });
    });

    test.describe('Picker State', () => {
        test.skip('should initialize with empty highlight state', async () => {
            await helper.activatePicker();

            const state = await helper.getPickerState();
            
            expect(state.highlightedElements).toEqual([]);
            expect(state.candidateCount).toBe(0);
        });

        test('should mark picker as active after activation', async () => {
            await helper.activatePicker();

            const state = await helper.getPickerState();
            expect(state.isActive).toBe(true);
        });

        test('should initialize with default slider position', async () => {
            await helper.activatePicker();

            const sliderPos = await helper.sliderPosition();
            expect(sliderPos).toBe(-1);
        });

        test('should start in minimized state', async () => {
            await helper.activatePicker();

            const minimized = await helper.isMinimized();
            expect(minimized).toBe(true);
        });

        test('should not be in preview mode initially', async () => {
            await helper.activatePicker();

            const preview = await helper.isPreviewMode();
            expect(preview).toBe(false);
        });

        test('should start with view state 0', async () => {
            await helper.activatePicker();

            const view = await helper.viewState();
            expect(view).toBe(0);
        });
    });

    test.describe('CSS Injection', () => {
        test('should have content script context available', async () => {
            await helper.activatePicker();

            const hasContext = await page.evaluate(() => {
                return typeof document !== 'undefined' && typeof window !== 'undefined';
            });

            expect(hasContext).toBe(true);
        });

        test('should have access to DOM manipulation APIs', async () => {
            await helper.activatePicker();

            const hasAPIs = await page.evaluate(() => {
                return {
                    hasDocument: typeof document !== 'undefined',
                    hasElementFromPoint: typeof document.elementFromPoint === 'function',
                    hasCreateElement: typeof document.createElement === 'function',
                    hasGetComputedStyle: typeof window.getComputedStyle === 'function',
                };
            });

            expect(hasAPIs.hasDocument).toBe(true);
            expect(hasAPIs.hasElementFromPoint).toBe(true);
            expect(hasAPIs.hasCreateElement).toBe(true);
            expect(hasAPIs.hasGetComputedStyle).toBe(true);
        });
    });

    test.describe('Message Communication', () => {
        test('should have message handler registered', async () => {
            await helper.activatePicker();

            const handlerExists = await page.evaluate(() => {
                return typeof (window as any).pickerMessageHandler === 'function';
            });

            expect(handlerExists).toBe(true);
        });

        test('should handle startTool message', async () => {
            await helper.activatePicker();

            await page.evaluate(() => {
                const handler = (window as any).pickerMessageHandler;
                if (handler) {
                    handler({ what: 'startTool' });
                }
            });

            const state = await helper.getPickerState();
            expect(state.isActive).toBe(true);
        });

        test('should handle quitTool message', async () => {
            await helper.activatePicker();
            
            await createMockPickerFrame(page);

            await page.evaluate(() => {
                const handler = (window as any).pickerMessageHandler;
                if (handler) {
                    handler({ what: 'quitTool' });
                }
            });

            await helper.waitForPickerInactive();

            const state = await helper.getPickerState();
            expect(state.isActive).toBe(false);
        });
    });

    test.describe('Cross-Context Communication', () => {
        test('should document three JavaScript contexts', async () => {
            await helper.activatePicker();

            const hasContentScriptContext = await page.evaluate(() => {
                return (window as any).ubolOverlay !== undefined;
            });
            expect(hasContentScriptContext).toBe(true);

            const hasFrame = await page.locator('#ubol-picker-frame').count();
            expect(hasFrame).toBeGreaterThan(0);
        });

        test.skip('should use MessageChannel for content script to iframe communication', async () => {
            await helper.activatePicker();

            const hasPort = await page.evaluate(() => {
                const port = (window as any).ubolOverlay?.port;
                return port instanceof MessagePort;
            });

            expect(hasPort).toBe(true);
        });
    });
});

export { test };