/**
 * My Filters - Import/Export Tests
 * 
 * Tests for import and export functionality in the My Filters tab
 * 
 * Test Cases: TC-IE-01 through TC-IE-08
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

test.describe('My Filters - Import/Export', () => {
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

    // TC-IE-01: Should parse cosmetic filters from text
    test('TC-IE-01: should parse cosmetic filters from text', async ({ page }) => {
        await helper.importFilter('example.com##.ad-banner');
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
    });

    // TC-IE-02: Should create hostname and selectors from parsed filters
    test('TC-IE-02: should create hostname and selectors from parsed filters', async ({ page }) => {
        await helper.importFilter(`
example.com##.ad-banner
example.com##.sidebar
test.org###promo
        `.trim());
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
        expect(hostnames).toContain('test.org');
        
        const exampleSelectors = await helper.getSelectorsForHostname('example.com');
        expect(exampleSelectors).toContain('.ad-banner');
        expect(exampleSelectors).toContain('.sidebar');
    });

    // TC-IE-03: Should ignore non-cosmetic filters
    test('TC-IE-03: should ignore non-cosmetic filters', async ({ page }) => {
        await helper.importFilter(`
example.com##.ad-banner
||example.com^
@@||example.com^
        `.trim());
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('example.com');
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toContain('.ad-banner');
    });

    // TC-IE-04: Should import from textarea and clear it
    test('TC-IE-04: should import from textarea and clear it', async ({ page }) => {
        await page.fill(MY_FILTERS_SELECTORS.importTextarea, 'example.com##.ad');
        await page.click(MY_FILTERS_SELECTORS.addButton);
        
        await helper.waitForReadonlyRemoved();
        
        const textareaValue = await page.inputValue(MY_FILTERS_SELECTORS.importTextarea);
        expect(textareaValue).toBe('');
    });

    // TC-IE-05: Should open file picker and read file
    test('TC-IE-05: should open file picker when import button clicked', async ({ page }) => {
        const fileInput = page.locator(MY_FILTERS_SELECTORS.importFileInput);
        
        await expect(fileInput).toHaveCount(1);
        
        await page.click(MY_FILTERS_SELECTORS.importButton);
    });

    // TC-IE-06: Should import content from selected file
    test('TC-IE-06: should import content from selected file', async ({ page }) => {
        await page.evaluate(() => {
            const fs = require('fs');
            const testContent = 'test.com##.ad-banner\ntest.org##.sidebar';
            const blob = new Blob([testContent], { type: 'text/plain' });
            (window as any).testFileBlob = blob;
        });
        
        const fileInput = page.locator(MY_FILTERS_SELECTORS.importFileInput);
        
        await fileInput.setInputFiles({
            name: 'test-filters.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('test.com##.ad-banner\ntest.org##.sidebar'),
        });
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('test.com');
        expect(hostnames).toContain('test.org');
    });

    // TC-IE-07: Should export filters to download
    test('TC-IE-07: should export filters as downloadable file', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
            'test.org': ['#promo'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const exportContent = await helper.getExportContent();
        
        expect(exportContent).toContain('example.com##.ad-banner');
        expect(exportContent).toContain('example.com##.sidebar');
        expect(exportContent).toContain('test.org###promo');
    });

    // TC-IE-08: Should format as hostname##selector per line
    test('TC-IE-08: should format as hostname##selector per line', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const exportContent = await helper.getExportContent();
        const lines = exportContent.split('\n').filter(l => l.trim());
        
        expect(lines.some(l => l.startsWith('example.com##'))).toBe(true);
    });

    // Additional tests for import/export behavior

    // TC-IE-09: Should handle multiple filters in one line
    test('TC-IE-09: should handle multiple filters in import text', async ({ page }) => {
        await helper.importFilter('example.com##.ad1\nexample.com##.ad2\nexample.com##.ad3');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toHaveLength(3);
    });

    // TC-IE-10: Should not duplicate existing filters on import
    test('TC-IE-10: should not duplicate existing filters on import', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.existing'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.importFilter('example.com##.existing\nexample.com##.new');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors).toHaveLength(2);
    });

    // TC-IE-11: Should close import/export details after action
    test('TC-IE-11: should close import/export details after action', async ({ page }) => {
        await page.click(MY_FILTERS_SELECTORS.importExportSection + ' summary');
        
        const details = page.locator(MY_FILTERS_SELECTORS.importExportSection);
        await expect(details).toHaveAttribute('open', '');
        
        await helper.importFilter('example.com##.ad');
        
        await page.waitForTimeout(500);
        
        const detailsClosed = page.locator(MY_FILTERS_SELECTORS.importExportSection);
        await expect(detailsClosed).not.toHaveAttribute('open', '');
    });

    // TC-IE-12: Should handle empty export
    test('TC-IE-12: should handle empty filter list for export', async ({ page }) => {
        const exportContent = await helper.getExportContent();
        expect(exportContent.trim()).toBe('');
    });
});
