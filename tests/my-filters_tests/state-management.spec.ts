/**
 * My Filters - State Management Tests
 * 
 * Tests for state management in the My Filters tab
 * 
 * Test Cases: TC-ST-01 to TC-ST-04
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import {
    MyFiltersTestHelper,
    MY_FILTERS_SELECTORS,
    setupMockFilterStorage,
    clearMockFilterStorage,
} from './helpers/my-filters-helper';

const DASHBOARD_PATH = path.resolve(__dirname, '../../src/dashboard.html');

test.describe('My Filters - State Management', () => {
    let helper: MyFiltersTestHelper;

    test.beforeEach(async ({ page }) => {
        helper = new MyFiltersTestHelper(page, page.context());
        await helper.navigateToDashboard();
        await helper.switchToFiltersPane();
        await clearMockFilterStorage(page);
    });

    test.afterEach(async ({ page }) => {
        await clearMockFilterStorage(page);
    });

    // TC-ST-01: Should add readonly class during operations
    test('TC-ST-01: should add readonly class during operations', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hasReadonlyBefore = await helper.isReadonlyMode();
        expect(hasReadonlyBefore).toBe(false);
        
        await helper.importFilter('new.com##.ad');
        
        const hasReadonlyDuring = await helper.isReadonlyMode();
        expect(hasReadonlyDuring).toBe(true);
    });

    // TC-ST-02: Should remove readonly class after operations
    test('TC-ST-02: should remove readonly class after operations', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.importFilter('new.com##.ad');
        
        await helper.waitForReadonlyRemoved();
        
        const hasReadonly = await helper.isReadonlyMode();
        expect(hasReadonly).toBe(false);
    });

    // TC-ST-03: Should add removed class to removed selectors
    test('TC-ST-03: should add removed class to removed selectors', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('example.com', '.ad-banner');
        
        await helper.waitForReadonlyRemoved();
        
        const isRemoved = await helper.isSelectorRemoved('example.com', '.ad-banner');
        expect(isRemoved).toBe(true);
        
        const selectorLi = page.locator('li.selector').first();
        await expect(selectorLi).toHaveClass(/removed/);
    });

    // TC-ST-04: Should apply strikethrough style to removed items
    test('TC-ST-04: should apply strikethrough style to removed items', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('example.com', '.ad-banner');
        
        await helper.waitForReadonlyRemoved();
        
        const removedSpan = page.locator('li.selector.removed span.selector').first();
        
        const textDecoration = await removedSpan.evaluate(el => 
            window.getComputedStyle(el).textDecorationLine
        );
        expect(textDecoration).toBe('line-through');
        
        const color = await removedSpan.evaluate(el => 
            window.getComputedStyle(el).color
        );
        expect(color).toContain('rgb');
    });

    // Additional state management tests

    // TC-ST-05: Should handle multiple rapid state changes
    test('TC-ST-05: should handle multiple rapid state changes', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.importFilter('test1.com##.ad');
        await helper.waitForReadonlyRemoved();
        
        await helper.importFilter('test2.com##.ad');
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames.length).toBeGreaterThanOrEqual(2);
    });

    // TC-ST-06: Should maintain state during page navigation
    test('TC-ST-06: should maintain state during pane navigation', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.click('button.tabButton[data-pane="settings"]');
        await page.waitForTimeout(200);
        
        await page.click('button.tabButton[data-pane="filters"]');
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
    });

    // TC-ST-07: Should sync state with storage on load
    test('TC-ST-07: should sync state with storage on load', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1', '.ad2'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toHaveLength(2);
    });

    // TC-ST-08: Should handle state after undo
    test('TC-ST-08: should handle state correctly after undo operation', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('example.com', '.ad');
        await helper.waitForReadonlyRemoved();
        
        const isRemovedAfterDelete = await helper.isSelectorRemoved('example.com', '.ad');
        expect(isRemovedAfterDelete).toBe(true);
        
        await helper.undoRemoveSelector('example.com', '.ad');
        await helper.waitForReadonlyRemoved();
        
        const isRemovedAfterUndo = await helper.isSelectorRemoved('example.com', '.ad');
        expect(isRemovedAfterUndo).toBe(false);
    });

    // TC-ST-09: Should apply opacity to readonly container
    test('TC-ST-09: should apply opacity to readonly container', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.evaluate(() => {
            document.body.classList.add('readonly');
        });
        
        const hostnamesList = page.locator(MY_FILTERS_SELECTORS.hostnamesList);
        const pointerEvents = await hostnamesList.evaluate(el => 
            window.getComputedStyle(el).pointerEvents
        );
        expect(pointerEvents).toBe('none');
        
        const opacity = await hostnamesList.evaluate(el => 
            window.getComputedStyle(el).opacity
        );
        expect(opacity).toBe('0.5');
    });

    // TC-ST-10: Should handle complex state transitions
    test('TC-ST-10: should handle complex state transitions', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'site1.com': ['.ad1', '.ad2'],
            'site2.com': ['.ad3'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('site1.com', '.ad1');
        await helper.waitForReadonlyRemoved();
        
        await helper.editHostname('site1.com', 'updated.com');
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('updated.com');
        expect(hostnames).toContain('site2.com');
        expect(hostnames).not.toContain('site1.com');
        
        const selectors = await helper.getSelectorsForHostname('updated.com');
        expect(selectors).toContain('.ad2');
    });
});
