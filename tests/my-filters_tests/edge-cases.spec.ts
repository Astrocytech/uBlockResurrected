/**
 * My Filters - Edge Cases Tests
 * 
 * Tests for edge cases and error handling in the My Filters tab
 * 
 * Test Cases: TC-EC-01 through TC-EC-08
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

test.describe('My Filters - Edge Cases', () => {
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

    // TC-EC-01: Should handle empty input (revert)
    test('TC-EC-01: should handle empty hostname input and revert', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const originalHostnames = await helper.getHostnames();
        
        await page.evaluate(() => {
            const span = document.querySelector('li.hostname .hostname') as HTMLElement;
            span.textContent = '';
            span.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toEqual(originalHostnames);
    });

    // TC-EC-02: Should handle punycode (IDN) conversion
    test('TC-EC-02: should handle punycode IDN conversion', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.editHostname('example.com', 'münchen.de');
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames.some(h => h.includes('münchen'))).toBe(true);
    });

    // TC-EC-03: Should handle empty selector (revert)
    test('TC-EC-03: should handle empty selector input and revert', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const originalSelectors = await helper.getSelectorsForHostname('example.com');
        
        await page.evaluate(() => {
            const span = document.querySelector('li.selector .selector') as HTMLElement;
            span.textContent = '';
            span.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toEqual(originalSelectors);
    });

    // TC-EC-04: Should handle malformed filter lines gracefully
    test('TC-EC-04: should handle malformed filter lines gracefully', async ({ page }) => {
        await helper.importFilter(`
this is not a valid filter
another invalid line
@@notvalid##.ad
        `.trim());
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toHaveLength(0);
    });

    // TC-EC-05: Should handle empty text input
    test('TC-EC-05: should handle empty text input', async ({ page }) => {
        await page.fill(MY_FILTERS_SELECTORS.importTextarea, '');
        await page.click(MY_FILTERS_SELECTORS.addButton);
        
        await page.waitForTimeout(200);
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toHaveLength(0);
    });

    // TC-EC-06: Should handle empty filter list for export
    test('TC-EC-06: should handle empty filter list for export', async ({ page }) => {
        const exportContent = await helper.getExportContent();
        expect(exportContent.trim()).toBe('');
    });

    // TC-EC-07: Should handle very long hostnames
    test('TC-EC-07: should handle very long hostnames', async ({ page }) => {
        const longHostname = 'a'.repeat(100) + '.com';
        
        await helper.importFilter(`${longHostname}##.ad`);
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        const found = hostnames.some(h => h.length > 50);
        expect(found).toBe(true);
    });

    // TC-EC-08: Should handle special characters in selectors
    test('TC-EC-08: should handle special characters in selectors', async ({ page }) => {
        await helper.importFilter('example.com##[data-ad="true"]');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('[data-ad="true"]');
    });

    // Additional edge case tests

    // TC-EC-09: Should handle duplicate hostname imports
    test('TC-EC-09: should handle duplicate hostname imports', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.importFilter('example.com##.ad2');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toHaveLength(2);
    });

    // TC-EC-10: Should handle subdomain inheritance
    test('TC-EC-10: should handle subdomain filters', async ({ page }) => {
        await helper.importFilter('example.com##.ad');
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.ad');
    });

    // TC-EC-11: Should handle unicode selectors
    test('TC-EC-11: should handle unicode selectors', async ({ page }) => {
        await helper.importFilter('example.com##.日本語');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.日本語');
    });

    // TC-EC-12: Should handle selectors with quotes
    test('TC-EC-12: should handle selectors with quotes', async ({ page }) => {
        await helper.importFilter('example.com##[class="ad banner"]');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('[class="ad banner"]');
    });

    // TC-EC-13: Should handle very long selectors
    test('TC-EC-13: should handle very long selectors', async ({ page }) => {
        const longSelector = '.class-' + 'a'.repeat(200);
        
        await helper.importFilter(`example.com##${longSelector}`);
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors.some(s => s.length > 100)).toBe(true);
    });

    // TC-EC-14: Should handle whitespace-only input
    test('TC-EC-14: should handle whitespace-only input', async ({ page }) => {
        await page.fill(MY_FILTERS_SELECTORS.importTextarea, '   \n   \n   ');
        await page.click(MY_FILTERS_SELECTORS.addButton);
        
        await page.waitForTimeout(200);
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toHaveLength(0);
    });

    // TC-EC-15: Should handle comments in import text
    test('TC-EC-15: should handle comments in import text', async ({ page }) => {
        await helper.importFilter(`
! This is a comment
example.com##.ad-banner
! Another comment
        `.trim());
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
    });

    // TC-EC-16: Should handle global filters (no hostname)
    test('TC-EC-16: should handle global filters (no hostname)', async ({ page }) => {
        await helper.importFilter('##.global-ad');
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        const hasGlobal = hostnames.some(h => h === '' || h === undefined);
        expect(hasGlobal).toBe(true);
    });
});
