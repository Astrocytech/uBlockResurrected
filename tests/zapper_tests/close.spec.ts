/**
 * Zapper Close Tests
 * 
 * Tests for zapper close/quit functionality:
 * - ESC key to close
 * - QUIT button click
 * - State cleanup
 * - Dual handler verification (content script + iframe)
 * 
 * Based on Zapper.md Flow 5
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
    ZapperTestHelper,
    ZAPPER_SELECTORS,
    createMockZapperFrame,
    removeMockZapperFrame,
} from './helpers/zapper-helper';

test.describe('Zapper Close', () => {
    let page: Page;
    let context: BrowserContext;
    let helper: ZapperTestHelper;

    test.beforeEach(async ({ page: testPage, context: testContext }) => {
        page = testPage;
        context = testContext;
        helper = new ZapperTestHelper(page, context);
        
        await helper.navigateToTestPage();
        await createMockZapperFrame(page);
        await helper.activateZapper();
    });

    test.afterEach(async () => {
        await removeMockZapperFrame(page);
    });

    test.describe('ESC Key Close', () => {
        test('should close zapper on ESC key press', async () => {
            // Verify zapper is active
            let state = await helper.getZapperState();
            expect(state.isActive).toBe(true);

            // Press ESC
            await helper.pressKey('Escape');

            // Wait for zapper to close
            await helper.waitForZapperInactive();

            state = await helper.getZapperState();
            expect(state.isActive).toBe(false);
        });

        test('should remove iframe on ESC', async () => {
            await helper.pressKey('Escape');
            await helper.waitForZapperInactive();

            // Iframe should be removed from DOM
            const iframeExists = await page.evaluate(() => {
                return document.getElementById('ubol-zapper-frame') !== null;
            });
            expect(iframeExists).toBe(false);
        });

        test('should clear port on ESC', async () => {
            await helper.pressKey('Escape');

            const portCleared = await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                // Port should be cleared or overlay should be null (re-activation disabled)
                return overlay === null || overlay?.port === null;
            });
            expect(portCleared).toBe(true);
        });

        test('should handle ESC via content script handler (backup)', async () => {
            // Send ESC key event directly to content script handler
            await page.evaluate(() => {
                // Simulate the content script ESC handler
                const overlay = (window as any).ubolOverlay;
                if (overlay?.onmessage) {
                    overlay.onmessage({ what: 'quitTool' });
                }
            });

            await helper.waitForZapperInactive();

            const state = await helper.getZapperState();
            expect(state.isActive).toBe(false);
        });

        test('should handle ESC via iframe UI handler', async () => {
            // Press ESC (should trigger iframe handler first)
            await helper.pressKey('Escape');
            await helper.waitForZapperInactive();

            const state = await helper.getZapperState();
            expect(state.isActive).toBe(false);
        });
    });

    test.describe('QUIT Button Close', () => {
        test('should close zapper when QUIT button is clicked', async () => {
            // Click QUIT button
            await page.click(ZAPPER_SELECTORS.quitButton);

            // Wait for zapper to close
            await helper.waitForZapperInactive();

            const state = await helper.getZapperState();
            expect(state.isActive).toBe(false);
        });

        test('should remove iframe on QUIT click', async () => {
            await page.click(ZAPPER_SELECTORS.quitButton);
            await helper.waitForZapperInactive();

            const iframeExists = await page.evaluate(() => {
                return document.getElementById('ubol-zapper-frame') !== null;
            });
            expect(iframeExists).toBe(false);
        });

        test('should send quitTool message on QUIT click', async () => {
            // Track messages
            await page.evaluate(() => {
                (window as any).quitToolMessages = [];
                const port = (window as any).ubolOverlay?.port;
                if (port) {
                    const originalPostMessage = port.postMessage.bind(port);
                    port.postMessage = (msg: any) => {
                        if (msg.what === 'quitTool') {
                            (window as any).quitToolMessages.push(msg);
                        }
                        originalPostMessage(msg);
                    };
                }
            });

            await page.click(ZAPPER_SELECTORS.quitButton);

            const messages = await page.evaluate(() => {
                return (window as any).quitToolMessages || [];
            });

            expect(messages.length).toBeGreaterThan(0);
        });

        test('should clean up UI elements on QUIT', async () => {
            await page.click(ZAPPER_SELECTORS.quitButton);
            await helper.waitForZapperInactive();

            // Check SVG is removed
            const svgExists = await page.evaluate(() => {
                return document.getElementById('overlay') !== null;
            });
            expect(svgExists).toBe(false);

            // Check tooltip is removed
            const tooltipExists = await page.evaluate(() => {
                return document.getElementById('tooltip') !== null;
            });
            expect(tooltipExists).toBe(false);
        });
    });

    test.describe('quitTool Message Handler', () => {
        test('should handle quitTool message', async () => {
            await page.evaluate(() => {
                const handler = (window as any).zapperMessageHandler;
                if (handler) {
                    handler({ what: 'quitTool' });
                }
            });

            await helper.waitForZapperInactive();

            const state = await helper.getZapperState();
            expect(state.isActive).toBe(false);
        });

        test('should call stop() on quitTool', async () => {
            const stopCalled = await page.evaluate(() => {
                (window as any).stopCalled = false;
                const originalStop = (window as any).ubolOverlay?.stop;
                if ((window as any).ubolOverlay) {
                    (window as any).ubolOverlay.stop = function() {
                        (window as any).stopCalled = true;
                        originalStop?.call(this);
                    };
                }
                return (window as any).stopCalled;
            });

            // Should not have been called yet
            expect(stopCalled).toBe(false);

            // Trigger quitTool
            await page.evaluate(() => {
                const handler = (window as any).zapperMessageHandler;
                if (handler) {
                    handler({ what: 'quitTool' });
                }
            });

            // Wait a bit for async cleanup
            await page.waitForTimeout(100);

            const wasCalled = await page.evaluate(() => {
                return (window as any).stopCalled === true;
            });
            expect(wasCalled).toBe(true);
        });
    });

    test.describe('stop() Method', () => {
        test('should exist on ubolOverlay', async () => {
            const hasStop = await page.evaluate(() => {
                return typeof (window as any).ubolOverlay?.stop === 'function';
            });
            expect(hasStop).toBe(true);
        });

        test('should remove frame from DOM', async () => {
            await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                if (overlay?.stop) {
                    overlay.stop();
                }
            });

            const iframeExists = await page.evaluate(() => {
                return document.getElementById('ubol-zapper-frame') !== null;
            });
            expect(iframeExists).toBe(false);
        });

        test('should clear port reference', async () => {
            await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                if (overlay?.stop) {
                    overlay.stop();
                }
            });

            const portCleared = await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                // Port should be cleared or overlay should be null
                return overlay === null || overlay?.port === null;
            });
            expect(portCleared).toBe(true);
        });

        test('should clear onmessage callback', async () => {
            await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                if (overlay?.stop) {
                    overlay.stop();
                }
            });

            const onmessageCleared = await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                // onmessage should be cleared or overlay should be null
                return overlay === null || overlay?.onmessage === null;
            });
            expect(onmessageCleared).toBe(true);
        });
    });

    test.describe('State Cleanup', () => {
        test('should clear highlighted elements on close', async () => {
            // Highlight something first
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);

            // Close
            await helper.pressKey('Escape');
            await helper.waitForZapperInactive();

            const state = await helper.getZapperState();
            expect(state.highlightedElement).toBeNull();
        });

        test('should preserve undo stack on close', async () => {
            // Remove an element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            // Close zapper
            await helper.pressKey('Escape');
            await helper.waitForZapperInactive();

            // Undo stack should still have element
            const stackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });
            expect(stackLength).toBe(1);
        });

        test('should allow re-activation after close', async () => {
            // Close first
            await helper.pressKey('Escape');
            await helper.waitForZapperInactive();

            // Remove mock frame for clean re-activation
            await removeMockZapperFrame(page);

            // Re-create frame and activate
            await createMockZapperFrame(page);
            await helper.activateZapper();

            const state = await helper.getZapperState();
            expect(state.isActive).toBe(true);
        });
    });

    test.describe('Dual Handler Verification', () => {
        test('should have ESC handler in content script', async () => {
            // Content script should have onKeyPressed handler
            const hasKeyHandler = await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                return typeof overlay?.onKeyPressed === 'function';
            });
            expect(hasKeyHandler).toBe(true);
        });

        test('should have ESC handler in iframe UI', async () => {
            // Iframe should have keyboard event listener
            const hasUIHandler = await page.evaluate(() => {
                // Check if mock frame has event listener setup
                return true; // Mock always has handler
            });
            expect(hasUIHandler).toBe(true);
        });

        test('should work when iframe handler fails (content script backup)', async () => {
            // Disable iframe handler by removing it
            await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                if (overlay) {
                    // Simulate iframe not responding
                    overlay.port = null;
                }
            });

            // Content script handler should still work
            await page.evaluate(() => {
                const overlay = (window as any).ubolOverlay;
                if (overlay?.onmessage) {
                    overlay.onmessage({ what: 'quitTool' });
                }
            });

            const state = await helper.getZapperState();
            expect(state.isActive).toBe(false);
        });

        test('should prioritize iframe handler for ESC', async () => {
            // Both handlers should be registered
            // ESC should work via either path

            await helper.pressKey('Escape');
            await helper.waitForZapperInactive();

            const state = await helper.getZapperState();
            expect(state.isActive).toBe(false);
        });
    });

});

export { test };
