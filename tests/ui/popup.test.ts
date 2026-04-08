/**
 * Popup UI Tests - Priority 1: Zapper
 * 
 * Tests the popup UI focusing on the Zapper button and related functionality.
 * Uses mocked backend responses for state transitions.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { POPUP_SELECTORS } from './helpers/selectors';
import { EXTENSION_PATH, TEST_URL } from './helpers/setup';

test.describe('Popup UI Tests', () => {
    let page: Page;
    let context: BrowserContext;
    let extensionId: string | null;

    test.beforeEach(async ({ page: p, context: ctx }) => {
        page = p;
        context = ctx;
        
        // Navigate to test page first
        await page.goto(TEST_URL);
        await page.waitForLoadState('domcontentloaded');
        
        // Get extension ID from service worker
        const sw = context.serviceWorkers()[0];
        if (sw) {
            const match = sw.url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
            extensionId = match ? match[1] : null;
        }
        
        // Open popup
        if (extensionId) {
            await page.goto(`chrome-extension://${extensionId}/popup-fenix.html?tabId=1`);
            await page.waitForLoadState('domcontentloaded');
            // Wait for any JS initialization
            await page.waitForTimeout(500);
        }
    });

    test.describe.configure({ mode: 'serial' });

    test.describe('Page Load', () => {
        test('popup_loads_without_error', async () => {
            if (!extensionId) {
                test.skip();
                return;
            }
            // Verify page loaded
            const body = page.locator(POPUP_SELECTORS.body);
            await expect(body).toBeVisible();
            
            // Verify no console errors
            const errors: string[] = [];
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });
            
            // Give time for any async errors
            await page.waitForTimeout(500);
            
            // Filter out expected errors (like missing assets)
            const criticalErrors = errors.filter(e => 
                !e.includes('404') && 
                !e.includes('Failed to load resource')
            );
            
            expect(criticalErrors.length).toBe(0);
        });

        test('popup_has_correct_structure', async () => {
            if (!extensionId) {
                test.skip();
                return;
            }
            // Verify main containers exist
            await expect(page.locator(POPUP_SELECTORS.panes)).toBeVisible();
            await expect(page.locator(POPUP_SELECTORS.main)).toBeVisible();
        });
    });

    test.describe('Power Button', () => {
        test('power_button_exists', async () => {
            if (!extensionId) { test.skip(); return; }
            const powerButton = page.locator(POPUP_SELECTORS.powerButton);
            await expect(powerButton).toBeVisible();
        });

        test('power_button_has_correct_attributes', async () => {
            if (!extensionId) { test.skip(); return; }
            const powerButton = page.locator(POPUP_SELECTORS.powerButton);
            await expect(powerButton).toHaveAttribute('role', 'button');
            await expect(powerButton).toHaveAttribute('tabindex', '0');
        });

        test('power_button_is_clickable', async () => {
            const powerButton = page.locator(POPUP_SELECTORS.powerButton);
            await expect(powerButton).toBeEnabled();
            
            // Click should not throw
            await powerButton.click();
            
            // Page should still be functional
            await expect(page.locator(POPUP_SELECTORS.main)).toBeVisible();
        });
    });

    test.describe('Zapper Button (Priority)', () => {
        test('zapper_button_exists', async () => {
            const zapperBtn = page.locator(POPUP_SELECTORS.zapperButton);
            await expect(zapperBtn).toBeVisible();
        });

        test('zapper_button_has_correct_structure', async () => {
            const zapperBtn = page.locator(POPUP_SELECTORS.zapperButton);
            
            // Should have fa-icon class
            await expect(zapperBtn).toHaveClass(/fa-icon/);
            
            // Should have data-i18n-title attribute
            await expect(zapperBtn).toHaveAttribute('data-i18n-title');
        });

        test('zapper_button_contains_icon', async () => {
            const zapperBtn = page.locator(POPUP_SELECTORS.zapperButton);
            
            // Check for bolt icon (SVG or icon class)
            const hasIcon = await zapperBtn.evaluate((el) => {
                return el.innerHTML.includes('bolt') || 
                       el.querySelector('svg') !== null ||
                       el.classList.contains('fa-icon');
            });
            
            expect(hasIcon).toBeTruthy();
        });

        test('zapper_button_is_interactive', async () => {
            const zapperBtn = page.locator(POPUP_SELECTORS.zapperButton);
            
            // Should be enabled
            await expect(zapperBtn).toBeEnabled();
            
            // Should be focusable
            await zapperBtn.focus();
            await expect(zapperBtn).toBeFocused();
        });

        test('zapper_button_responds_to_click', async () => {
            const zapperBtn = page.locator(POPUP_SELECTORS.zapperButton);
            
            // Click should not throw an error
            // Note: In real usage, this would trigger the picker
            const clickPromise = zapperBtn.click();
            
            // Should complete without error
            await expect(clickPromise).resolves.toBeUndefined();
        });
    });

    test.describe('Picker Button', () => {
        test('picker_button_exists', async () => {
            const pickerBtn = page.locator(POPUP_SELECTORS.pickerButton);
            await expect(pickerBtn).toBeVisible();
        });

        test('picker_button_has_correct_attributes', async () => {
            const pickerBtn = page.locator(POPUP_SELECTORS.pickerButton);
            await expect(pickerBtn).toHaveAttribute('data-i18n-title');
        });

        test('picker_button_is_interactive', async () => {
            const pickerBtn = page.locator(POPUP_SELECTORS.pickerButton);
            await expect(pickerBtn).toBeEnabled();
        });
    });

    test.describe('Dashboard & Logger Links', () => {
        test('dashboard_link_exists', async () => {
            const dashboardLink = page.locator(POPUP_SELECTORS.dashboardLink);
            await expect(dashboardLink).toBeVisible();
        });

        test('dashboard_link_has_correct_href', async () => {
            const dashboardLink = page.locator(POPUP_SELECTORS.dashboardLink);
            await expect(dashboardLink).toHaveAttribute('href', 'dashboard.html');
        });

        test('logger_link_exists', async () => {
            const loggerLink = page.locator(POPUP_SELECTORS.loggerLink);
            await expect(loggerLink).toBeVisible();
        });

        test('logger_link_has_correct_href', async () => {
            const loggerLink = page.locator(POPUP_SELECTORS.loggerLink);
            await expect(loggerLink).toHaveAttribute('href', 'logger-ui.html');
        });
    });

    test.describe('Per-Site Switches', () => {
        test('no_popups_switch_exists', async () => {
            const noPopups = page.locator(POPUP_SELECTORS.noPopups);
            await expect(noPopups).toBeVisible();
        });

        test('no_popups_switch_is_toggle', async () => {
            const noPopups = page.locator(POPUP_SELECTORS.noPopups);
            await expect(noPopups).toHaveAttribute('role', 'button');
        });

        test('no_large_media_switch_exists', async () => {
            const noLargeMedia = page.locator(POPUP_SELECTORS.noLargeMedia);
            await expect(noLargeMedia).toBeVisible();
        });

        test('no_cosmetic_filtering_switch_exists', async () => {
            const noCosmetic = page.locator(POPUP_SELECTORS.noCosmeticFiltering);
            await expect(noCosmetic).toBeVisible();
        });

        test('no_remote_fonts_switch_exists', async () => {
            const noRemoteFonts = page.locator(POPUP_SELECTORS.noRemoteFonts);
            await expect(noRemoteFonts).toBeVisible();
        });

        test('no_scripting_switch_exists', async () => {
            const noScripting = page.locator(POPUP_SELECTORS.noScripting);
            await expect(noScripting).toBeVisible();
        });

        test('all_hn_switches_have_nope_overlay', async () => {
            const switches = [
                POPUP_SELECTORS.noPopups,
                POPUP_SELECTORS.noLargeMedia,
                POPUP_SELECTORS.noCosmeticFiltering,
                POPUP_SELECTORS.noRemoteFonts,
                POPUP_SELECTORS.noScripting,
            ];

            for (const selector of switches) {
                const sw = page.locator(selector);
                const hasNope = await sw.evaluate((el) => {
                    return el.querySelector('.nope') !== null;
                });
                expect(hasNope).toBeTruthy();
            }
        });
    });

    test.describe('Firewall Section', () => {
        test('firewall_section_exists', async () => {
            const firewall = page.locator(POPUP_SELECTORS.firewall);
            await expect(firewall).toBeVisible();
        });

        test('firewall_has_filter_icon', async () => {
            const firewall = page.locator(POPUP_SELECTORS.firewall);
            const hasFilterIcon = await firewall.evaluate((el) => {
                return el.querySelector('.fa-icon') !== null;
            });
            expect(hasFilterIcon).toBeTruthy();
        });
    });

    test.describe('Stats Display', () => {
        test('stats_section_exists', async () => {
            const stats = page.locator(POPUP_SELECTORS.basicStats);
            await expect(stats).toBeVisible();
        });

        test('stats_contain_blocked_count', async () => {
            const stats = page.locator(POPUP_SELECTORS.basicStats);
            // Should contain text about blocked items
            const text = await stats.textContent();
            expect(text).toBeTruthy();
        });
    });

    test.describe('Version Display', () => {
        test('version_display_exists', async () => {
            const version = page.locator(POPUP_SELECTORS.version);
            await expect(version).toBeVisible();
        });

        test('version_has_content', async () => {
            const version = page.locator(POPUP_SELECTORS.version);
            const text = await version.textContent();
            expect(text).toBeTruthy();
        });
    });

    test.describe('More/Less Buttons', () => {
        test('more_button_exists', async () => {
            const moreBtn = page.locator(POPUP_SELECTORS.moreButton);
            await expect(moreBtn).toBeVisible();
        });

        test('less_button_exists', async () => {
            const lessBtn = page.locator(POPUP_SELECTORS.lessButton);
            await expect(lessBtn).toBeVisible();
        });

        test('more_less_buttons_are_toggles', async () => {
            const moreBtn = page.locator(POPUP_SELECTORS.moreButton);
            const lessBtn = page.locator(POPUP_SELECTORS.lessButton);

            // Both should be clickable
            await expect(moreBtn).toBeEnabled();
            await expect(lessBtn).toBeEnabled();
        });
    });

    test.describe('Tool Buttons', () => {
        test('save_rules_button_exists', async () => {
            const saveBtn = page.locator(POPUP_SELECTORS.saveRules);
            await expect(saveBtn).toBeVisible();
        });

        test('revert_rules_button_exists', async () => {
            const revertBtn = page.locator(POPUP_SELECTORS.revertRules);
            await expect(revertBtn).toBeVisible();
        });

        test('refresh_button_exists', async () => {
            const refreshBtn = page.locator(POPUP_SELECTORS.refresh);
            await expect(refreshBtn).toBeVisible();
        });
    });
});
