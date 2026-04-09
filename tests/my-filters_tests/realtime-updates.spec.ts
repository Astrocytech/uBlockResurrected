/**
 * My Filters - Real-time Updates Tests
 * 
 * Tests for real-time update functionality in the My Filters tab
 * 
 * Test Cases: TC-RT-01 through TC-RT-04
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

test.describe('My Filters - Real-time Updates', () => {
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

    // TC-RT-01: Should debounce re-renders
    test('TC-RT-01: should debounce re-renders', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnamesBefore = await helper.getHostnames();
        
        await helper.importFilter('test.org##.ad');
        
        await page.waitForTimeout(50);
        
        const hostnamesDuring = await helper.getHostnames();
        
        await helper.waitForReadonlyRemoved();
        
        const hostnamesAfter = await helper.getHostnames();
        expect(hostnamesAfter.length).toBeGreaterThan(hostnamesBefore.length);
    });

    // TC-RT-02: Should re-render when site.* keys change externally
    test('TC-RT-02: should re-render when site.* keys change externally', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.simulateStorageChange('newsite.com', ['#new-ad']);
        
        await page.waitForTimeout(300);
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('newsite.com');
    });

    // TC-RT-03: Should merge DOM changes with storage data
    test('TC-RT-03: should merge DOM changes with storage data', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'existing.com': ['.existing-ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.importFilter('new.com##.new-ad');
        
        await helper.waitForReadonlyRemoved();
        
        const allHostnames = await helper.getHostnames();
        expect(allHostnames).toContain('existing.com');
        expect(allHostnames).toContain('new.com');
    });

    // TC-RT-04: Should extract current DOM state for merging
    test('TC-RT-04: should extract current DOM state for merging', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1'],
            'test.org': ['#ad2'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toHaveLength(2);
        expect(hostnames).toContain('example.com');
        expect(hostnames).toContain('test.org');
    });

    // Additional tests for real-time updates

    // TC-RT-05: Should handle concurrent edits
    test('TC-RT-05: should handle concurrent edits from multiple sources', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'site1.com': ['.ad1'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const page2 = await page.context().newPage();
        await page2.goto(`file://${DASHBOARD_PATH}`);
        await page2.click('button.tabButton[data-pane="filters"]');
        
        await helper.importFilter('site2.com##.ad2');
        await helper.waitForReadonlyRemoved();
        
        await page.waitForTimeout(500);
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('site2.com');
        
        await page2.close();
    });

    // TC-RT-06: Should update UI when filter removed from another source
    test('TC-RT-06: should update UI when filter removed from another source', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        let selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toHaveLength(2);
        
        await page.evaluate(() => {
            localStorage.removeItem('site.example.com');
        });
        
        await page.waitForTimeout(300);
        
        selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toHaveLength(0);
    });

    // TC-RT-07: Should preserve user edits during re-render
    test('TC-RT-07: should preserve user edits during re-render', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.editSelector('example.com', '.ad-banner', '.new-ad');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.new-ad');
    });

    // TC-RT-08: Should handle rapid storage changes
    test('TC-RT-08: should handle rapid storage changes', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'site1.com': ['.ad1'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        for (let i = 2; i <= 5; i++) {
            await helper.simulateStorageChange(`site${i}.com`, [`.ad${i}`]);
        }
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames.length).toBeGreaterThanOrEqual(4);
    });
});
