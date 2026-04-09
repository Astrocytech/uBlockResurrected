/**
 * My Filters - Integration Tests
 * 
 * Tests for integration with background and other components
 * 
 * Test Cases: TC-INT-01 to TC-INT-06
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

test.describe('My Filters - Integration', () => {
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

    // TC-INT-01: Should send getAllCustomFilters message to background
    test('TC-INT-01: should load filters from background storage', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1', '.ad2'],
            'test.org': ['#promo'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toHaveLength(2);
        expect(hostnames).toContain('example.com');
        expect(hostnames).toContain('test.org');
    });

    // TC-INT-02: Should send addCustomFilters message to background
    test('TC-INT-02: should persist new filters to background storage', async ({ page }) => {
        await helper.importFilter('newsite.com##.new-ad');
        
        await helper.waitForReadonlyRemoved();
        
        const storageValue = await page.evaluate(() => {
            return localStorage.getItem('site.newsite.com');
        });
        
        expect(storageValue).toBeTruthy();
        expect(storageValue).toContain('.new-ad');
    });

    // TC-INT-03: Should send removeCustomFilters message to background
    test('TC-INT-03: should remove filters from background storage', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1', '.ad2'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('example.com', '.ad1');
        
        await helper.waitForReadonlyRemoved();
        
        const storageValue = await page.evaluate(() => {
            return localStorage.getItem('site.example.com');
        });
        
        expect(storageValue).toContain('.ad2');
        expect(storageValue).not.toContain('.ad1');
    });

    // TC-INT-04: Should send removeAllCustomFilters message to background
    test('TC-INT-04: should remove all filters for hostname from background', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1', '.ad2'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.evaluate(() => {
            const hostnameLi = document.querySelector('li.hostname');
            const removeBtn = hostnameLi?.querySelector('.remove') as HTMLElement;
            removeBtn?.click();
        });
        
        await helper.waitForReadonlyRemoved();
        
        const storageValue = await page.evaluate(() => {
            return localStorage.getItem('site.example.com');
        });
        
        expect(storageValue).toBeNull();
    });

    // TC-INT-05: Should work with Picker-created filters
    test('TC-INT-05: should work with Picker-created filters', async ({ page }) => {
        await page.evaluate(() => {
            localStorage.setItem('site.picker-created.com', JSON.stringify(['.picker-ad']));
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('picker-created.com');
        
        const selectors = await helper.getSelectorsForHostname('picker-created.com');
        expect(selectors).toContain('.picker-ad');
    });

    // TC-INT-06: Should persist across dashboard reopen
    test('TC-INT-06: should persist filters across dashboard reopen', async ({ page }) => {
        await helper.importFilter('persist.com##.persistent-ad');
        
        await helper.waitForReadonlyRemoved();
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('persist.com');
        
        const selectors = await helper.getSelectorsForHostname('persist.com');
        expect(selectors).toContain('.persistent-ad');
    });

    // Additional integration tests

    // TC-INT-07: Should handle multiple filter operations in sequence
    test('TC-INT-07: should handle multiple filter operations in sequence', async ({ page }) => {
        await helper.importFilter('site1.com##.ad1');
        await helper.waitForReadonlyRemoved();
        
        await helper.importFilter('site2.com##.ad2');
        await helper.waitForReadonlyRemoved();
        
        await helper.editHostname('site1.com', 'site1-updated.com');
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('site1-updated.com');
        expect(hostnames).toContain('site2.com');
    });

    // TC-INT-08: Should integrate with storage events
    test('TC-INT-08: should update when storage changes externally', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'initial.com': ['.initial-ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.evaluate(() => {
            localStorage.setItem('site.external.com', JSON.stringify(['.external-ad']));
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'site.external.com',
                newValue: '[" .external-ad"]',
                storageArea: localStorage,
            }));
        });
        
        await page.waitForTimeout(300);
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('external.com');
    });

    // TC-INT-09: Should handle cloud sync integration
    test('TC-INT-09: should expose cloud data for sync', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'cloud.com': ['.cloud-ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const exportData = await helper.getExportContent();
        
        expect(exportData).toContain('cloud.com');
        expect(exportData).toContain('.cloud-ad');
    });

    // TC-INT-10: Should work with different filter types
    test('TC-INT-10: should handle different filter types', async ({ page }) => {
        await helper.importFilter('example.com##.plain-css');
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.plain-css');
    });

    // TC-INT-11: Should handle large number of filters
    test('TC-INT-11: should handle large number of filters', async ({ page }) => {
        const filters: string[] = [];
        for (let i = 0; i < 50; i++) {
            filters.push(`example.com##.ad${i}`);
        }
        
        await page.evaluate((filters) => {
            localStorage.setItem('site.example.com', JSON.stringify(filters));
        }, filters);
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors.length).toBeGreaterThanOrEqual(50);
    });

    // TC-INT-12: Should properly escape special characters in storage
    test('TC-INT-12: should properly escape special characters in storage', async ({ page }) => {
        await helper.importFilter('example.com##[data-test="value"]');
        
        await helper.waitForReadonlyRemoved();
        
        const storageValue = await page.evaluate(() => {
            return localStorage.getItem('site.example.com');
        });
        
        expect(storageValue).toContain('data-test');
    });

    // TC-INT-13: Should handle case sensitivity correctly
    test('TC-INT-13: should handle case sensitivity correctly', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'Example.COM': ['.Ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnames = await helper.getHostnames();
        const found = hostnames.some(h => 
            h.toLowerCase() === 'example.com'
        );
        expect(found).toBe(true);
    });

    // TC-INT-14: Should work after page refresh
    test('TC-INT-14: should maintain filters after page refresh', async ({ page }) => {
        await helper.importFilter('refresh.com##.refresh-ad');
        
        await helper.waitForReadonlyRemoved();
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const storageValue = await page.evaluate(() => {
            return localStorage.getItem('site.refresh.com');
        });
        
        expect(storageValue).toBeTruthy();
    });

    // TC-INT-15: Should handle concurrent modifications
    test('TC-INT-15: should handle concurrent modifications gracefully', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'site.com': ['.ad1'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.evaluate(() => {
            localStorage.setItem('site.site.com', JSON.stringify(['.ad1', '.ad2', '.ad3']));
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'site.site.com',
                newValue: '[" .ad1", ".ad2", ".ad3"]',
                storageArea: localStorage,
            }));
        });
        
        await page.waitForTimeout(300);
        
        const selectors = await helper.getSelectorsForHostname('site.com');
        expect(selectors.length).toBeGreaterThanOrEqual(1);
    });
});
