/**
 * Zapper Removal Tests
 * 
 * Tests for element removal functionality:
 * - Click to remove
 * - Delete/Backspace key removal
 * - Undo functionality
 * - Scroll lock detection
 * 
 * Based on Zapper.md Flow 4 and zapper.js
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
    ZapperTestHelper,
    ZAPPER_SELECTORS,
    createMockZapperFrame,
    removeMockZapperFrame,
} from './helpers/zapper-helper';

test.describe('Zapper Element Removal', () => {
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

    test.describe('Click to Remove', () => {
        test('should remove element on click', async () => {
            // Verify element exists before
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(true);

            // First highlight the element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);

            // Click to remove
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            // Verify element is removed
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);
        });

        test('should add removed element to undo stack', async () => {
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            const undoStackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });

            expect(undoStackLength).toBe(1);
        });

        test('should remove multiple elements', async () => {
            // Remove first element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);

            // Remove second element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
            await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleSpan)).toBe(false);

            // Check undo stack
            const undoStackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });

            expect(undoStackLength).toBe(2);
        });

        test('should track removal count', async () => {
            const initialCount = await helper.getRemovedCount();

            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            const finalCount = await helper.getRemovedCount();
            expect(finalCount).toBe(initialCount + 1);
        });

        test('should send updateCount message to UI', async () => {
            // Mock the port postMessage
            await page.evaluate(() => {
                (window as any).updateCountMessages = [];
                const port = (window as any).ubolOverlay?.port;
                if (port) {
                    const originalPostMessage = port.postMessage.bind(port);
                    port.postMessage = (msg: any) => {
                        if (msg.what === 'updateCount') {
                            (window as any).updateCountMessages.push(msg);
                        }
                        originalPostMessage(msg);
                    };
                }
            });

            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            const messages = await page.evaluate(() => {
                return (window as any).updateCountMessages || [];
            });

            expect(messages.length).toBeGreaterThan(0);
            expect(messages[messages.length - 1].count).toBe(1);
        });
    });

    test.describe('Keyboard Removal', () => {
        test('should remove highlighted element on Delete key', async () => {
            // Highlight element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);

            // Press Delete
            await helper.pressKey('Delete');

            // Element should be removed
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);
        });

        test('should remove highlighted element on Backspace key', async () => {
            // Highlight element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);

            // Press Backspace
            await helper.pressKey('Backspace');

            // Element should be removed
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleSpan)).toBe(false);
        });

        test('should not remove if no element highlighted on Delete', async () => {
            const initialCount = await helper.getRemainingTestElements();

            // Press Delete without highlighting anything
            await helper.pressKey('Delete');

            const finalCount = await helper.getRemainingTestElements();
            expect(finalCount).toBe(initialCount);
        });

        test('should update undo stack on keyboard removal', async () => {
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.pressKey('Delete');

            const undoStackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });

            expect(undoStackLength).toBe(1);
        });
    });

    test.describe('Undo Functionality', () => {
        test('should restore last removed element', async () => {
            // Remove element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);

            // Undo
            await page.evaluate(() => {
                const undoFn = (window as any).zapperUndoLastRemoval;
                if (undoFn) undoFn();
            });

            // Element should be restored
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(true);
        });

        test('should decrement undo stack on undo', async () => {
            // Remove element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            let stackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });
            expect(stackLength).toBe(1);

            // Undo
            await page.evaluate(() => {
                const undoFn = (window as any).zapperUndoLastRemoval;
                if (undoFn) undoFn();
            });

            stackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });
            expect(stackLength).toBe(0);
        });

        test('should restore element at correct position', async () => {
            // Get initial next sibling
            const initialNextSibling = await page.evaluate(() => {
                const elem = document.getElementById('simple-div');
                return elem?.nextSibling?.textContent?.trim() || '';
            });

            // Remove element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            // Undo
            await page.evaluate(() => {
                const undoFn = (window as any).zapperUndoLastRemoval;
                if (undoFn) undoFn();
            });

            // Verify position restored
            const restoredNextSibling = await page.evaluate(() => {
                const elem = document.getElementById('simple-div');
                return elem?.nextSibling?.textContent?.trim() || '';
            });

            expect(restoredNextSibling).toBe(initialNextSibling);
        });

        test('should not error on empty undo stack', async () => {
            // Undo without removing anything
            await expect(async () => {
                await page.evaluate(() => {
                    const undoFn = (window as any).zapperUndoLastRemoval;
                    if (undoFn) undoFn();
                });
            }).not.toThrow();
        });

        test('should restore multiple elements in LIFO order', async () => {
            // Remove multiple elements
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
            await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
            await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);

            // Undo last removal (should restore span)
            await page.evaluate(() => {
                const undoFn = (window as any).zapperUndoLastRemoval;
                if (undoFn) undoFn();
            });

            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleSpan)).toBe(true);
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);

            // Undo again (should restore div)
            await page.evaluate(() => {
                const undoFn = (window as any).zapperUndoLastRemoval;
                if (undoFn) undoFn();
            });

            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(true);
        });

        test('should handle undo with null nextSibling', async () => {
            // Remove last element in container
            await helper.hoverOver(ZAPPER_SELECTORS.simpleParagraph);
            await helper.clickElement(ZAPPER_SELECTORS.simpleParagraph);

            // Undo
            await page.evaluate(() => {
                const undoFn = (window as any).zapperUndoLastRemoval;
                if (undoFn) undoFn();
            });

            // Element should be restored at end
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleParagraph)).toBe(true);
        });
    });

    test.describe('zapElementAtPoint Function', () => {
        test('should handle undefined coordinates', async () => {
            // Call with undefined coords
            await page.evaluate(() => {
                const handler = (window as any).zapperMessageHandler;
                if (handler) {
                    handler({
                        what: 'zapElementAtPoint',
                        mx: undefined,
                        my: undefined,
                        options: {},
                    });
                }
            });

            // Should not error
            const state = await helper.getZapperState();
            expect(state).toBeDefined();
        });

        test('should handle highlight-only option for touch', async () => {
            // Call with highlight option (touch first tap)
            const box = await page.locator(ZAPPER_SELECTORS.simpleDiv).boundingBox();
            
            await page.evaluate((coords: { x: number; y: number }) => {
                const handler = (window as any).zapperMessageHandler;
                if (handler) {
                    handler({
                        what: 'zapElementAtPoint',
                        mx: coords.x,
                        my: coords.y,
                        options: { highlight: true },
                    });
                }
            }, { x: box!.x + 50, y: box!.y + 50 });

            // Element should be highlighted but not removed
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(true);
            const state = await helper.getZapperState();
            expect(state.highlightedElement).toBe('simple-div');
        });

        test('should use existing highlight when available', async () => {
            // First highlight
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            
            // Then click elsewhere but should still remove highlighted
            await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);

            // The highlighted element (div) should be removed
            expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);
        });

        test('should clear highlight after removal', async () => {
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            const state = await helper.getZapperState();
            expect(state.highlightedElement).toBeNull();
        });
    });

    test.describe('DOM State After Removal', () => {
        test('should not leave broken DOM after removal', async () => {
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            // Check document is still valid
            const isValid = await page.evaluate(() => {
                return document.body !== null && 
                       document.documentElement !== null &&
                       document.contains(document.body);
            });

            expect(isValid).toBe(true);
        });

        test('should maintain sibling relationships for undo', async () => {
            // Remove middle element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
            await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);

            // Check siblings are intact
            const siblings = await page.evaluate(() => {
                const div = document.getElementById('simple-div');
                const para = document.getElementById('simple-paragraph');
                return {
                    divNext: div?.nextElementSibling?.id,
                    paraPrev: para?.previousElementSibling?.id,
                };
            });

            expect(siblings.divNext).toBe('simple-paragraph');
            expect(siblings.paraPrev).toBe('simple-div');
        });

        test('should handle removal of nested elements', async () => {
            // Remove nested inner element
            await helper.hoverOver(ZAPPER_SELECTORS.nestedInner);
            await helper.clickElement(ZAPPER_SELECTORS.nestedInner);

            expect(await helper.elementExists(ZAPPER_SELECTORS.nestedInner)).toBe(false);
            expect(await helper.elementExists(ZAPPER_SELECTORS.nestedContainer)).toBe(true);
        });

        test('should track removed elements via MutationObserver', async () => {
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            const removedInfo = await page.evaluate(() => {
                const removed = (window as any).removedElements || [];
                return removed[removed.length - 1];
            });

            expect(removedInfo.tagName).toBe('DIV');
            expect(removedInfo.id).toBe('simple-div');
        });
    });

    test.describe('Edge Cases', () => {
        test('should handle removal of already removed element gracefully', async () => {
            // Remove element
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            // Try to remove again
            await expect(async () => {
                await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
            }).not.toThrow();
        });

        test('should handle removal of null element', async () => {
            // Click in empty area
            await page.mouse.click(1, 1);

            // Should not error
            const state = await helper.getZapperState();
            expect(state).toBeDefined();
        });

        test('should handle rapid consecutive removals', async () => {
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
            
            await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
            await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);

            const stackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });

            expect(stackLength).toBe(2);
        });

        test('should handle removal followed by undo followed by remove', async () => {
            // Remove
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
            
            // Undo
            await page.evaluate(() => {
                const undoFn = (window as any).zapperUndoLastRemoval;
                if (undoFn) undoFn();
            });

            // Remove again
            await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
            await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

            const stackLength = await page.evaluate(() => {
                return (window as any).zapperUndoStack?.length || 0;
            });

            expect(stackLength).toBe(1);
        });
    });
});

export { test };
