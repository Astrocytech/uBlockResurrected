/**
 * My Filters - Hostname Management Tests
 * 
 * Tests for hostname-related functionality in the My Filters tab
 * 
 * Test Cases: TC-HM-01 through TC-HM-11
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

test.describe('My Filters - Hostname Management', () => {
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

    // TC-HM-01: Should display empty state when no filters exist
    test('TC-HM-01: should display empty state when no filters exist', async ({ page }) => {
        const count = await helper.getHostnameCount();
        expect(count).toBe(0);
        
        const hostnamesList = page.locator(MY_FILTERS_SELECTORS.hostnamesList);
        await expect(hostnamesList).toBeEmpty();
    });

    // TC-HM-02: Should load and display existing hostnames from storage
    test('TC-HM-02: should load and display existing hostnames from storage', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
            'test.org': ['#promo'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
        expect(hostnames).toContain('test.org');
    });

    // TC-HM-03: Should update hostname when valid hostname entered
    test('TC-HM-03: should update hostname when valid hostname entered', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.editHostname('example.com', 'newhost.com');
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('newhost.com');
        expect(hostnames).not.toContain('example.com');
    });

    // TC-HM-04: Should reject invalid hostname and revert
    test('TC-HM-04: should reject invalid hostname and revert', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const originalHostnames = await helper.getHostnames();
        expect(originalHostnames).toContain('example.com');
        
        await helper.editHostname('example.com', 'invalid..hostname');
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
        expect(hostnames).not.toContain('invalid..hostname');
    });

    // TC-HM-05: Should transfer selectors from old to new hostname
    test('TC-HM-05: should transfer selectors from old to new hostname', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'old.example.com': ['.ad-banner', '.sidebar'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.editHostname('old.example.com', 'new.example.com');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('new.example.com');
        expect(selectors).toContain('.ad-banner');
        expect(selectors).toContain('.sidebar');
    });

    // TC-HM-06: Should correctly extract hostname from DOM node
    test('TC-HM-06: should correctly extract hostname from DOM node', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
            'test.org': ['#promo'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const uglyValue = await helper.getUglyValue('example.com', true);
        expect(uglyValue).toBe('example.com');
        
        const testOrgUgly = await helper.getUglyValue('test.org', true);
        expect(testOrgUgly).toBe('test.org');
    });

    // TC-HM-07: Should get all selectors for a hostname
    test('TC-HM-07: should get all selectors for a hostname', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar', '.popup'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const count = await helper.getSelectorCount('example.com');
        expect(count).toBe(3);
    });

    // TC-HM-08: Should remove all selectors when hostname trash clicked
    test('TC-HM-08: should remove all selectors when hostname trash clicked', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.evaluate(() => {
            const hostnameLi = document.querySelector('li.hostname');
            const removeBtn = hostnameLi?.querySelector('.remove') as HTMLElement;
            removeBtn?.click();
        });
        
        await helper.waitForReadonlyRemoved();
        
        const count = await helper.getSelectorCount('example.com');
        expect(count).toBe(0);
    });

    // TC-HM-09: Should restore all selectors when hostname undo clicked
    test('TC-HM-09: should restore all selectors when hostname undo clicked', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.evaluate(() => {
            const hostnameLi = document.querySelector('li.hostname');
            const removeBtn = hostnameLi?.querySelector('.remove') as HTMLElement;
            removeBtn?.click();
        });
        
        await helper.waitForReadonlyRemoved();
        
        await page.evaluate(() => {
            const hostnameLi = document.querySelector('li.hostname');
            const undoBtn = hostnameLi?.querySelector('.undo') as HTMLElement;
            undoBtn?.click();
        });
        
        await helper.waitForReadonlyRemoved();
        
        const count = await helper.getSelectorCount('example.com');
        expect(count).toBe(1);
    });

    // TC-HM-10: Should validate correct hostnames
    test('TC-HM-10: should validate correct hostnames', async ({ page }) => {
        const validHostnames = ['example.com', 'sub.example.com', 'test.org', 'my-site.co.uk'];
        
        for (const hostname of validHostnames) {
            await setupMockFilterStorage(page, { [hostname]: ['.ad'] });
            await page.reload();
            await helper.switchToFiltersPane();
            
            const hostnames = await helper.getHostnames();
            expect(hostnames).toContain(hostname);
            
            await clearMockFilterStorage(page);
        }
    });

    // TC-HM-11: Should reject invalid hostnames
    test('TC-HM-11: should reject invalid hostnames', async ({ page }) => {
        const invalidHostnames = ['invalid..hostname', 'has spaces', 'has/slash'];
        
        for (const hostname of invalidHostnames) {
            await setupMockFilterStorage(page, { [hostname]: ['.ad'] });
            await page.reload();
            await helper.switchToFiltersPane();
            
            const hostnames = await helper.getHostnames();
            expect(hostnames).not.toContain(hostname);
            
            await clearMockFilterStorage(page);
        }
    });
});
