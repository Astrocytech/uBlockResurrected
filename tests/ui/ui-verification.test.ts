/**
 * UI Verification Tests
 * 
 * Tests that verify UI elements exist in the HTML files.
 * These tests load HTML files directly and check for element presence
 * without requiring the full backend.
 */

import { test, expect, Page } from '@playwright/test';
import { SOURCE_PATH } from './helpers/setup';

test.describe('Popup HTML UI Verification', () => {
    let page: Page;

    test.beforeEach(async ({ page: p }) => {
        page = p;
    });

    test.describe.configure({ mode: 'parallel' });

    test('popup_html_loads', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        // Verify page loaded (title may be empty with file:// due to i18n)
        const body = page.locator('body');
        await expect(body).toBeAttached();
    });

    test('popup_power_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const powerButton = page.locator('#switch');
        await expect(powerButton).toBeAttached();
    });

    test('popup_zapper_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const zapperBtn = page.locator('#gotoZap');
        await expect(zapperBtn).toBeAttached();
    });

    test('popup_picker_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const pickerBtn = page.locator('#gotoPick');
        await expect(pickerBtn).toBeAttached();
    });

    test('popup_dashboard_link_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const dashboardLink = page.locator('a[href="dashboard.html"]');
        await expect(dashboardLink).toBeAttached();
    });

    test('popup_logger_link_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const loggerLink = page.locator('a[href*="logger-ui.html"]');
        await expect(loggerLink).toBeAttached();
    });

    test('popup_firewall_section_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const firewall = page.locator('#firewall');
        await expect(firewall).toBeAttached();
    });

    test('popup_stats_section_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const stats = page.locator('#basicStats');
        await expect(stats).toBeAttached();
    });

    test('popup_version_display_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
        const version = page.locator('#version');
        await expect(version).toBeAttached();
    });
});

test.describe('Dashboard HTML UI Verification', () => {
    let page: Page;

    test.beforeEach(async ({ page: p }) => {
        page = p;
    });

    test.describe.configure({ mode: 'parallel' });

    test('dashboard_html_exists', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const body = page.locator('body');
        await expect(body).toBeAttached();
    });

    test('dashboard_nav_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const nav = page.locator('#dashboard-nav');
        await expect(nav).toBeAttached();
    });

    test('dashboard_iframe_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const iframe = page.locator('#iframe');
        await expect(iframe).toBeAttached();
    });

    test('dashboard_settings_tab_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const settingsTab = page.locator('[data-pane="settings.html"]');
        await expect(settingsTab).toBeAttached();
    });

    test('dashboard_3p_filters_tab_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const filtersTab = page.locator('[data-pane="3p-filters.html"]');
        await expect(filtersTab).toBeAttached();
    });

    test('dashboard_1p_filters_tab_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const myFiltersTab = page.locator('[data-pane="1p-filters.html"]');
        await expect(myFiltersTab).toBeAttached();
    });

    test('dashboard_rules_tab_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const rulesTab = page.locator('[data-pane="dyna-rules.html"]');
        await expect(rulesTab).toBeAttached();
    });

    test('dashboard_whitelist_tab_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/dashboard.html`);
        const whitelistTab = page.locator('[data-pane="whitelist.html"]');
        await expect(whitelistTab).toBeAttached();
    });
});

test.describe('Element Picker HTML UI Verification', () => {
    let page: Page;

    test.beforeEach(async ({ page: p }) => {
        page = p;
    });

    test.describe.configure({ mode: 'parallel' });

    test('epicker_html_exists', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        await expect(page).toHaveTitle(/picker/i);
    });

    test('epicker_quit_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const quitBtn = page.locator('#quit');
        await expect(quitBtn).toBeAttached();
    });

    test('epicker_minimize_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const minimizeBtn = page.locator('#minimize');
        await expect(minimizeBtn).toBeAttached();
    });

    test('epicker_pick_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const pickBtn = page.locator('#pick');
        await expect(pickBtn).toBeAttached();
    });

    test('epicker_preview_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const previewBtn = page.locator('#preview');
        await expect(previewBtn).toBeAttached();
    });

    test('epicker_create_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const createBtn = page.locator('#create');
        await expect(createBtn).toBeAttached();
    });

    test('epicker_svg_overlay_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const sea = page.locator('#sea');
        await expect(sea).toBeAttached();
    });

    test('epicker_aside_container_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const aside = page.locator('aside');
        await expect(aside).toBeAttached();
    });

    test('epicker_candidate_filters_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const candidates = page.locator('#candidateFilters');
        await expect(candidates).toBeAttached();
    });

    test('epicker_resultset_count_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/web_accessible_resources/epicker-ui.html`);
        const resultCount = page.locator('#resultsetCount');
        await expect(resultCount).toBeAttached();
    });
});

test.describe('Settings HTML UI Verification', () => {
    let page: Page;

    test.beforeEach(async ({ page: p }) => {
        page = p;
    });

    test.describe.configure({ mode: 'parallel' });

    test('settings_html_exists', async () => {
        await page.goto(`file://${SOURCE_PATH}/settings.html`);
        await expect(page).toHaveTitle(/settings/i);
    });

    test('settings_collapse_checkbox_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/settings.html`);
        const checkbox = page.locator('[data-setting-name="collapseBlocked"]');
        await expect(checkbox).toBeAttached();
    });

    test('settings_icon_badge_checkbox_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/settings.html`);
        const checkbox = page.locator('[data-setting-name="showIconBadge"]');
        await expect(checkbox).toBeAttached();
    });

    test('settings_export_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/settings.html`);
        const exportBtn = page.locator('#export');
        await expect(exportBtn).toBeAttached();
    });

    test('settings_import_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/settings.html`);
        const importBtn = page.locator('#import');
        await expect(importBtn).toBeAttached();
    });

    test('settings_reset_button_in_html', async () => {
        await page.goto(`file://${SOURCE_PATH}/settings.html`);
        const resetBtn = page.locator('#reset');
        await expect(resetBtn).toBeAttached();
    });
});
