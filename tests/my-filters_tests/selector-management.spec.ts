/**
 * My Filters - Selector Management Tests
 * 
 * Tests for selector-related functionality in the My Filters tab
 * 
 * Test Cases: TC-SM-01 through TC-SM-10
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import {
    MyFiltersTestHelper,
    MY_FILTERS_SELECTORS,
    TEST_FILTERS,
    setupMockFilterStorage,
    clearMockFilterStorage,
} from './helpers/my-filters-helper';

const DASHBOARD_PATH = path.resolve(__dirname, '../../src/dashboard.html');

test.describe('My Filters - Selector Management', () => {
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

    // TC-SM-01: Should display selectors under correct hostname
    test('TC-SM-01: should display selectors under correct hostname', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
            'test.org': ['#promo'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const exampleSelectors = await helper.getSelectorsForHostname('example.com');
        expect(exampleSelectors).toContain('.ad-banner');
        expect(exampleSelectors).toContain('.sidebar');
        
        const testSelectors = await helper.getSelectorsForHostname('test.org');
        expect(testSelectors).toContain('#promo');
    });

    // TC-SM-02: Should update selector when valid CSS entered
    test('TC-SM-02: should update selector when valid CSS entered', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.old-selector'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.editSelector('example.com', '.old-selector', '.new-selector');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.new-selector');
        expect(selectors).not.toContain('.old-selector');
    });

    // TC-SM-03: Should reject invalid selector and revert
    test('TC-SM-03: should reject invalid selector and revert', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.valid-selector'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.editSelector('example.com', '.valid-selector', '<<<invalid>>>');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.valid-selector');
        expect(selectors).not.toContain('<<<invalid>>>');
    });

    // TC-SM-04: Should compile procedural filters correctly
    test('TC-SM-04: should compile procedural filters correctly', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.editSelector('example.com', '.ad-banner', '.ad-banner:has(> img)');
        
        await helper.waitForReadonlyRemoved();
        
        const uglyValue = await helper.getUglyValue('example.com', false);
        expect(uglyValue).toBeTruthy();
        expect(uglyValue).not.toBe('.ad-banner:has(> img)');
    });

    // TC-SM-05: Should store compiled selector in data-ugly
    test('TC-SM-05: should store compiled selector in data-ugly', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.plain-selector'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const uglyValue = await helper.getUglyValue('example.com', false);
        expect(uglyValue).toBe('.plain-selector');
    });

    // TC-SM-06: Should correctly extract selector from DOM node
    test('TC-SM-06: should correctly extract selector from DOM node', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.test-selector', '#test-id'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const uglyValue = await helper.getUglyValue('example.com', false);
        expect(uglyValue).toBeTruthy();
    });

    // TC-SM-07: Should mark single selector as removed
    test('TC-SM-07: should mark single selector as removed', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('example.com', '.ad-banner');
        
        await helper.waitForReadonlyRemoved();
        
        const isRemoved = await helper.isSelectorRemoved('example.com', '.ad-banner');
        expect(isRemoved).toBe(true);
        
        const isNotRemoved = await helper.isSelectorRemoved('example.com', '.sidebar');
        expect(isNotRemoved).toBe(false);
    });

    // TC-SM-08: Should restore single removed selector
    test('TC-SM-08: should restore single removed selector', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('example.com', '.ad-banner');
        await helper.waitForReadonlyRemoved();
        
        await helper.undoRemoveSelector('example.com', '.ad-banner');
        await helper.waitForReadonlyRemoved();
        
        const isRemoved = await helper.isSelectorRemoved('example.com', '.ad-banner');
        expect(isRemoved).toBe(false);
    });

    // TC-SM-09: Should return raw selector for plain CSS
    test('TC-SM-09: should return raw selector for plain CSS', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.plain-selector'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.plain-selector');
    });

    // TC-SM-10: Should extract raw from procedural JSON
    test('TC-SM-10: should extract raw from procedural JSON', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['{"raw":".procedural-selector","style":{"display":"none"}}'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.procedural-selector');
    });
});
