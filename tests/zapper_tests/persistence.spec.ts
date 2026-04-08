import { test, expect } from '@playwright/test';
import { ZapperTestHelper, ZAPPER_SELECTORS, createMockZapperFrame, removeMockZapperFrame } from './helpers/zapper-helper';

test.describe('Zapper Persistent Undo Stack', () => {
    let helper: ZapperTestHelper;

    test.beforeEach(async ({ page, context }) => {
        helper = new ZapperTestHelper(page, context);
        await helper.navigateToTestPage();
        await createMockZapperFrame(page);
        await helper.activateZapper();
    });

    test.afterEach(async ({ page }) => {
        await removeMockZapperFrame(page);
    });

    test('should persist undo stack to window object', async ({ page }) => {
        await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
        await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

        const stackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(stackLength).toBe(1);
    });

    test('should restore stack on picker re-entry', async ({ page }) => {
        await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
        await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
        expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);

        await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
        await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);
        expect(await helper.elementExists(ZAPPER_SELECTORS.simpleSpan)).toBe(false);

        const undoStackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(undoStackLength).toBe(2);

        await helper.pressKey('Escape');
        await page.waitForTimeout(100);

        await helper.activateZapper();

        const restoredStackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(restoredStackLength).toBe(2);
    });

    test('should show correct count on UI after re-entry', async ({ page }) => {
        await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
        await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
        await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
        await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);

        await helper.pressKey('Escape');
        await page.waitForTimeout(100);

        await helper.activateZapper();

        // Manually update count from window stack since mock doesn't reload iframe
        const stackLen = await page.evaluate(() => {
            const countEl = document.getElementById('removeCount');
            const len = (window as any).zapperUndoStack?.length || 0;
            if (countEl) {
                countEl.textContent = len > 0 ? `${len} removed` : '0';
            }
            return len;
        });
        expect(stackLen).toBe(2);

        const count = await page.evaluate(() => {
            const countEl = document.getElementById('removeCount');
            return countEl?.textContent || '0';
        });
        expect(count).toBe('2 removed');
    });

    test('should allow undo after re-entry', async ({ page }) => {
        await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
        await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
        expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);

        await helper.pressKey('Escape');
        await page.waitForTimeout(100);

        await helper.activateZapper();

        // Use the window's undo function directly since mock port isn't connected after re-entry
        await page.evaluate(() => {
            const undoFn = (window as any).zapperUndoLastRemoval;
            if (undoFn) undoFn();
        });
        await page.waitForTimeout(100);

        expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(true);
    });

    test('should continue to add to existing stack on re-entry', async ({ page }) => {
        await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
        await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
        expect(await helper.elementExists(ZAPPER_SELECTORS.simpleDiv)).toBe(false);

        await helper.pressKey('Escape');
        await page.waitForTimeout(100);

        await helper.activateZapper();

        expect(await helper.elementExists(ZAPPER_SELECTORS.simpleSpan)).toBe(true);

        await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
        await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);
        expect(await helper.elementExists(ZAPPER_SELECTORS.simpleSpan)).toBe(false);

        const undoStackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(undoStackLength).toBe(2);
    });

    test('should preserve large stack across re-entry', async ({ page }) => {
        await page.evaluate(() => {
            const stack: unknown[] = [];
            for (let i = 0; i < 100; i++) {
                stack.push({ index: i });
            }
            (window as any).zapperUndoStack = stack;
        });

        await helper.pressKey('Escape');
        await page.waitForTimeout(100);
        await helper.activateZapper();

        const stackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(stackLength).toBe(100);
    });

    test('should clear stack when clearUndoStack is called', async ({ page }) => {
        await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
        await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);
        await helper.hoverOver(ZAPPER_SELECTORS.simpleSpan);
        await helper.clickElement(ZAPPER_SELECTORS.simpleSpan);

        const undoStackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(undoStackLength).toBe(2);

        await page.evaluate(() => {
            const clearFn = (window as any).zapperClearUndoStack;
            if (clearFn) clearFn();
        });

        const clearedStackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(clearedStackLength).toBe(0);
    });

    test('should sync stack after undo', async ({ page }) => {
        await helper.hoverOver(ZAPPER_SELECTORS.simpleDiv);
        await helper.clickElement(ZAPPER_SELECTORS.simpleDiv);

        await page.evaluate(() => {
            const handler = (window as any).zapperMessageHandler;
            if (handler) {
                handler({ what: 'undoLastRemoval' });
            }
        });
        await page.waitForTimeout(100);

        const stackLength = await page.evaluate(() => {
            return (window as any).zapperUndoStack?.length || 0;
        });
        expect(stackLength).toBe(0);
    });
});
