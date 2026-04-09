/**
 * Dashboard UI Tests
 *
 * Tests for dashboard UI (HTML/CSS only):
 * - All CSS files load without errors
 * - All panes render correctly
 * - Navigation between panes works
 * - Templates are present
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';

const DASHBOARD_PATH = path.resolve(__dirname, '../../src/dashboard.html');

test.describe('Dashboard UI', () => {
    test('should load dashboard.html with all CSS files', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto(`file://${DASHBOARD_PATH}`);

        await page.waitForLoadState('domcontentloaded');

        const cssLinks = await page.locator('link[rel="stylesheet"]').count();
        expect(cssLinks).toBeGreaterThan(0);
    });

    test('should have all five panes present', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const settingsPane = page.locator('section[data-pane="settings"]');
        const rulesetsPane = page.locator('section[data-pane="rulesets"]');
        const filtersPane = page.locator('section[data-pane="filters"]');
        const developPane = page.locator('section[data-pane="develop"]');
        const aboutPane = page.locator('section[data-pane="about"]');

        await expect(settingsPane).toBeVisible();
        await expect(rulesetsPane).toBeVisible();
        await expect(filtersPane).toBeVisible();
        await expect(developPane).toBeVisible();
        await expect(aboutPane).toBeVisible();
    });

    test('should have navigation with all five tabs', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const settingsTab = page.locator('button.tabButton[data-pane="settings"]');
        const rulesetsTab = page.locator('button.tabButton[data-pane="rulesets"]');
        const filtersTab = page.locator('button.tabButton[data-pane="filters"]');
        const developTab = page.locator('button.tabButton[data-pane="develop"]');
        const aboutTab = page.locator('button.tabButton[data-pane="about"]');

        await expect(settingsTab).toBeVisible();
        await expect(rulesetsTab).toBeVisible();
        await expect(filtersTab).toBeVisible();
        await expect(developTab).toBeVisible();
        await expect(aboutTab).toBeVisible();
    });

    test('should have all required templates', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const templates = [
            'listEntryLeaf',
            'listEntryNode',
            'listEntryRoot',
            'listEntries',
            'customFiltersHostname',
            'customFiltersSelector',
            'io-panel',
            'summary-panel',
            'feedback-panel',
            'ro-summary-panel',
            'badmark-tooltip',
        ];

        for (const templateId of templates) {
            const template = page.locator(`template#${templateId}`);
            await expect(template).toBeAttached();
        }
    });

    test('should have filtering mode cards in settings pane', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const filteringModeCards = page.locator('.filteringModeCard');
        await expect(filteringModeCards).toHaveCount(3);
    });

    test('should have rulesets list container', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const listsContainer = page.locator('#lists');
        await expect(listsContainer).toBeVisible();
    });

    test('should have custom filters hostname list', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const hostnamesList = page.locator('section[data-pane="filters"] ul.hostnames');
        await expect(hostnamesList).toBeVisible();
    });

    test('should have code editor container in develop pane', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const cmContainer = page.locator('#cm-container');
        await expect(cmContainer).toBeVisible();
    });

    test('should have editor dropdown in develop pane', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const editorsDropdown = page.locator('#editors');
        await expect(editorsDropdown).toBeVisible();

        const options = page.locator('#editors option');
        await expect(options).toHaveCount(5);
    });

    test('should have about section with version info', async ({ page }) => {
        await page.goto(`file://${DASHBOARD_PATH}`);

        const aboutNameVer = page.locator('#aboutNameVer');
        await expect(aboutNameVer).toBeVisible();
    });
});
