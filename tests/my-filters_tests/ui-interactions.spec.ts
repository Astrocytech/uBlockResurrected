/**
 * My Filters - UI Interactions Tests
 * 
 * Tests for UI interactions in the My Filters tab
 * 
 * Test Cases: TC-UI-01 to TC-UI-07
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

test.describe('My Filters - UI Interactions', () => {
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

    // TC-UI-01: Should track focus for contenteditable
    test('TC-UI-01: should track focus for contenteditable elements', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnameSpan = page.locator('li.hostname span.hostname').first();
        await hostnameSpan.focus();
        
        const isFocused = await hostnameSpan.evaluate(el => document.activeElement === el);
        expect(isFocused).toBe(true);
    });

    // TC-UI-02: Should detect hostname vs selector changes
    test('TC-UI-02: should detect hostname vs selector changes', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnameSpan = page.locator('li.hostname span.hostname').first();
        await hostnameSpan.fill('newhost.com');
        await hostnameSpan.blur();
        
        await helper.waitForReadonlyRemoved();
        
        const hostnames = await helper.getHostnames();
        expect(hostnames).toContain('newhost.com');
    });

    // TC-UI-03: Should disable editing in readonly mode
    test('TC-UI-03: should disable editing in readonly mode', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await page.evaluate(() => {
            document.body.classList.add('readonly');
        });
        
        const isEditable = await page.locator('li.hostname span.hostname').first()
            .evaluate(el => el.getAttribute('contenteditable') === 'plaintext-only');
        
        expect(isEditable).toBeFalsy();
        
        await page.evaluate(() => {
            document.body.classList.remove('readonly');
        });
    });

    // TC-UI-04: Should disable editing for removed items
    test('TC-UI-04: should disable editing for removed items', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        await helper.removeSelector('example.com', '.ad-banner');
        
        await helper.waitForReadonlyRemoved();
        
        const isEditable = await page.locator('li.selector.removed span.selector').first()
            .evaluate(el => el.getAttribute('contenteditable'));
        
        expect(isEditable).toBe('false');
    });

    // TC-UI-05: Should attach all event listeners on start
    test('TC-UI-05: should attach all event listeners on start', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const removeButton = page.locator('li.selector span.remove').first();
        await expect(removeButton).toBeVisible();
        
        const undoButton = page.locator('li.selector span.undo').first();
        await expect(undoButton).toBeHidden();
    });

    // TC-UI-06: Should show/hide remove/undo buttons based on state
    test('TC-UI-06: should show/hide remove/undo buttons based on state', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner', '.sidebar'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const removeButton = page.locator('li.selector:first-child span.remove').first();
        const undoButton = page.locator('li.selector:first-child span.undo').first();
        
        await expect(removeButton).toBeVisible();
        await expect(undoButton).toBeHidden();
        
        await helper.removeSelector('example.com', '.ad-banner');
        await helper.waitForReadonlyRemoved();
        
        await expect(removeButton).toBeHidden();
        await expect(undoButton).toBeVisible();
    });

    // TC-UI-07: Should display correct icons (FontAwesome)
    test('TC-UI-07: should display correct FontAwesome icons', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad-banner'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const removeIcon = page.locator('li.selector span.remove.fa-icon').first();
        await expect(removeIcon).toBeVisible();
        
        const iconClass = await removeIcon.evaluate(el => el.textContent);
        expect(iconClass).toContain('trash-o');
        
        const undoIcon = page.locator('li.selector span.undo.fa-icon').first();
        await expect(undoIcon).toBeVisible();
        
        const undoIconClass = await undoIcon.evaluate(el => el.textContent);
        expect(undoIconClass).toContain('undo');
    });

    // Additional UI interaction tests

    // TC-UI-08: Should handle keyboard input in contenteditable
    test('TC-UI-08: should handle keyboard input in contenteditable', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const selectorSpan = page.locator('li.selector span.selector').first();
        await selectorSpan.click();
        await page.keyboard.type('.new-ad');
        await page.keyboard.press('Tab');
        
        await helper.waitForReadonlyRemoved();
        
        const selectors = await helper.getSelectorsForHostname('example.com');
        expect(selectors.some(s => s.includes('.new-ad'))).toBe(true);
    });

    // TC-UI-09: Should display hostname with proper styling
    test('TC-UI-09: should display hostname with proper styling', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const hostnameDiv = page.locator('li.hostname > div').first();
        await expect(hostnameDiv).toBeVisible();
        
        const display = await hostnameDiv.evaluate(el => window.getComputedStyle(el).display);
        expect(display).toBe('flex');
    });

    // TC-UI-10: Should properly indent nested selectors
    test('TC-UI-10: should properly indent nested selectors', async ({ page }) => {
        await setupMockFilterStorage(page, {
            'example.com': ['.ad1', '.ad2', '.ad3'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const selectorsList = page.locator('li.hostname ul.selectors').first();
        await expect(selectorsList).toBeVisible();
        
        const padding = await selectorsList.evaluate(el => 
            window.getComputedStyle(el).paddingInlineStart
        );
        expect(padding).not.toBe('0px');
    });

    // TC-UI-11: Should handle hover state on desktop
    test('TC-UI-11: should show hover effects on desktop', async ({ page }) => {
        await page.evaluate(() => {
            document.documentElement.classList.add('desktop');
        });
        
        await setupMockFilterStorage(page, {
            'example.com': ['.ad'],
        });
        
        await page.reload();
        await helper.switchToFiltersPane();
        
        const row = page.locator('li.hostname > div').first();
        
        await row.hover();
        
        const bgColor = await row.evaluate(el => 
            window.getComputedStyle(el).backgroundColor
        );
        expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });

    // TC-UI-12: Should update textarea placeholder
    test('TC-UI-12: should display textarea with placeholder', async ({ page }) => {
        await helper.switchToFiltersPane();
        
        const textarea = page.locator(MY_FILTERS_SELECTORS.importTextarea);
        await expect(textarea).toBeVisible();
        
        const placeholder = await textarea.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();
    });
});
