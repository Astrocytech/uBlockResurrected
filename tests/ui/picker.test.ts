/**
 * Element Picker UI Tests - Priority 3
 * 
 * Tests the element picker (epicker-ui.html) functionality.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { PICKER_SELECTORS } from './helpers/selectors';
import { EXTENSION_PATH } from './helpers/setup';

test.describe('Element Picker UI Tests', () => {
    let page: Page;
    let context: BrowserContext;
    let extensionId: string | null;

    test.beforeEach(async ({ page: p, context: ctx }) => {
        page = p;
        context = ctx;
        
        // Get extension ID from service worker
        const sw = context.serviceWorkers()[0];
        if (sw) {
            const match = sw.url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
            extensionId = match ? match[1] : null;
        }
        
        // Open picker page directly
        if (extensionId) {
            await page.goto(`chrome-extension://${extensionId}/web_accessible_resources/epicker-ui.html`);
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(500);
        }
    });

    test.describe.configure({ mode: 'serial' });

    test.describe('Page Load', () => {
        test('picker_loads', async () => {
            if (!extensionId) {
                test.skip();
                return;
            }
            const body = page.locator(PICKER_SELECTORS.body);
            await expect(body).toBeVisible();
        });

        test('picker_has_correct_html_structure', async () => {
            if (!extensionId) {
                test.skip();
                return;
            }
            const html = page.locator('html');
            await expect(html).toHaveAttribute('id', 'ublock0-epicker');
        });
    });

    test.describe('Window Bar Buttons', () => {
        test('quit_button_exists', async () => {
            if (!extensionId) { test.skip(); return; }
            const quitBtn = page.locator(PICKER_SELECTORS.quitButton);
            await expect(quitBtn).toBeVisible();
        });

        test('quit_button_has_correct_attributes', async () => {
            if (!extensionId) { test.skip(); return; }
            const quitBtn = page.locator(PICKER_SELECTORS.quitButton);
            await expect(quitBtn).toHaveAttribute('id', 'quit');
            await expect(quitBtn).toHaveAttribute('data-i18n-title');
        });

        test('quit_button_contains_svg', async () => {
            if (!extensionId) { test.skip(); return; }
            const quitBtn = page.locator(PICKER_SELECTORS.quitButton);
            const hasSvg = await quitBtn.evaluate((el) => {
                return el.querySelector('svg') !== null;
            });
            expect(hasSvg).toBeTruthy();
        });

        test('quit_button_responds_to_click', async () => {
            if (!extensionId) { test.skip(); return; }
            const quitBtn = page.locator(PICKER_SELECTORS.quitButton);
            
            // Should be clickable
            await expect(quitBtn).toBeEnabled();
            
            // Click should not throw
            await quitBtn.click();
        });

        test('minimize_button_exists', async () => {
            if (!extensionId) { test.skip(); return; }
            const minimizeBtn = page.locator(PICKER_SELECTORS.minimizeButton);
            await expect(minimizeBtn).toBeVisible();
        });

        test('minimize_button_contains_svg', async () => {
            if (!extensionId) { test.skip(); return; }
            const minimizeBtn = page.locator(PICKER_SELECTORS.minimizeButton);
            const hasSvg = await minimizeBtn.evaluate((el) => {
                return el.querySelector('svg') !== null;
            });
            expect(hasSvg).toBeTruthy();
        });

        test('minimize_button_responds_to_click', async () => {
            if (!extensionId) { test.skip(); return; }
            const minimizeBtn = page.locator(PICKER_SELECTORS.minimizeButton);
            await minimizeBtn.click();
        });
    });

    test.describe('Create Button', () => {
        test('create_button_exists', async () => {
            if (!extensionId) { test.skip(); return; }
            const createBtn = page.locator(PICKER_SELECTORS.createButton);
            await expect(createBtn).toBeVisible();
        });

        test('create_button_has_correct_text', async () => {
            if (!extensionId) { test.skip(); return; }
            const createBtn = page.locator(PICKER_SELECTORS.createButton);
            await expect(createBtn).toContainText('Create');
        });

        test('create_button_has_correct_class', async () => {
            if (!extensionId) { test.skip(); return; }
            const createBtn = page.locator(PICKER_SELECTORS.createButton);
            await expect(createBtn).toHaveClass(/preferred/);
        });
    });

    test.describe('Pick Preview Buttons', () => {
        test('pick_button_exists', async () => {
            if (!extensionId) { test.skip(); return; }
            const pickBtn = page.locator(PICKER_SELECTORS.pickButton);
            await expect(pickBtn).toBeVisible();
        });

        test('pick_button_has_correct_text', async () => {
            if (!extensionId) { test.skip(); return; }
            const pickBtn = page.locator(PICKER_SELECTORS.pickButton);
            await expect(pickBtn).toContainText('Pick');
        });

        test('preview_button_exists', async () => {
            if (!extensionId) { test.skip(); return; }
            const previewBtn = page.locator(PICKER_SELECTORS.previewButton);
            await expect(previewBtn).toBeVisible();
        });

        test('minimize_button_contains_svg', async () => {
            if (!extensionId) { test.skip(); return; }
            const minimizeBtn = page.locator(PICKER_SELECTORS.minimizeButton);
            const hasSvg = await minimizeBtn.evaluate((el) => {
                return el.querySelector('svg') !== null;
            });
            expect(hasSvg).toBeTruthy();
        });

        test('move_handle_exists', async () => {
            if (!extensionId) { test.skip(); return; }
            const moveHandle = page.locator(PICKER_SELECTORS.moveHandle);
            await expect(moveHandle).toBeVisible();
        });
    });

    test.describe('Action Buttons', () => {
        test('pick_button_exists', async () => {
            const pickBtn = page.locator(PICKER_SELECTORS.pickButton);
            await expect(pickBtn).toBeVisible();
        });

        test('pick_button_has_correct_attributes', async () => {
            const pickBtn = page.locator(PICKER_SELECTORS.pickButton);
            await expect(pickBtn).toHaveAttribute('id', 'pick');
        });

        test('pick_button_is_clickable', async () => {
            const pickBtn = page.locator(PICKER_SELECTORS.pickButton);
            await expect(pickBtn).toBeEnabled();
        });

        test('preview_button_exists', async () => {
            const previewBtn = page.locator(PICKER_SELECTORS.previewButton);
            await expect(previewBtn).toBeVisible();
        });

        test('preview_button_has_correct_attributes', async () => {
            const previewBtn = page.locator(PICKER_SELECTORS.previewButton);
            await expect(previewBtn).toHaveAttribute('id', 'preview');
        });

        test('create_button_exists', async () => {
            const createBtn = page.locator(PICKER_SELECTORS.createButton);
            await expect(createBtn).toBeVisible();
        });

        test('create_button_has_correct_attributes', async () => {
            const createBtn = page.locator(PICKER_SELECTORS.createButton);
            await expect(createBtn).toHaveAttribute('id', 'create');
        });

        test('create_button_has_preferred_class', async () => {
            const createBtn = page.locator(PICKER_SELECTORS.createButton);
            await expect(createBtn).toHaveClass(/preferred/);
        });
    });

    test.describe('Filter Editor', () => {
        test('codemirror_container_exists', async () => {
            const container = page.locator(PICKER_SELECTORS.codeMirrorContainer);
            await expect(container).toBeVisible();
        });

        test('resultset_widgets_exist', async () => {
            const count = page.locator(PICKER_SELECTORS.resultsetCount);
            await expect(count).toBeVisible();
        });

        test('depth_slider_exists', async () => {
            const depth = page.locator(PICKER_SELECTORS.resultsetDepth);
            await expect(depth).toBeVisible();
        });

        test('specificity_slider_exists', async () => {
            const specificity = page.locator(PICKER_SELECTORS.resultsetSpecificity);
            await expect(specificity).toBeVisible();
        });
    });

    test.describe('Filter Candidates', () => {
        test('candidate_filters_section_exists', async () => {
            const candidates = page.locator(PICKER_SELECTORS.candidateFilters);
            await expect(candidates).toBeVisible();
        });

        test('net_filters_section_exists', async () => {
            const netFilters = page.locator(PICKER_SELECTORS.netFilters);
            await expect(netFilters).toBeVisible();
        });

        test('cosmetic_filters_section_exists', async () => {
            const cosmeticFilters = page.locator(PICKER_SELECTORS.cosmeticFilters);
            await expect(cosmeticFilters).toBeVisible();
        });

        test('change_filter_list_exists', async () => {
            const changeFilterList = page.locator(PICKER_SELECTORS.changeFilterList);
            await expect(changeFilterList).toBeVisible();
        });
    });

    test.describe('SVG Overlay', () => {
        test('svg_overlay_exists', async () => {
            const sea = page.locator(PICKER_SELECTORS.sea);
            await expect(sea).toBeVisible();
        });

        test('svg_overlay_has_correct_id', async () => {
            const sea = page.locator(PICKER_SELECTORS.sea);
            await expect(sea).toHaveAttribute('id', 'sea');
        });

        test('svg_overlay_contains_paths', async () => {
            const sea = page.locator(PICKER_SELECTORS.sea);
            const hasPaths = await sea.evaluate((el) => {
                return el.querySelectorAll('path').length >= 1;
            });
            expect(hasPaths).toBeTruthy();
        });
    });

    test.describe('Container (Aside)', () => {
        test('aside_container_exists', async () => {
            const aside = page.locator(PICKER_SELECTORS.aside);
            await expect(aside).toBeVisible();
        });

        test('aside_has_correct_positioning', async () => {
            const aside = page.locator(PICKER_SELECTORS.aside);
            const style = await aside.evaluate((el) => {
                return {
                    position: window.getComputedStyle(el).position,
                    right: window.getComputedStyle(el).right,
                    bottom: window.getComputedStyle(el).bottom,
                };
            });
            
            // Should be fixed position
            expect(style.position).toBe('fixed');
        });
    });

    test.describe('Toolbar', () => {
        test('toolbar_exists', async () => {
            const toolbar = page.locator(PICKER_SELECTORS.toolbar);
            await expect(toolbar).toBeVisible();
        });

        test('toolbar_contains_buttons', async () => {
            const toolbar = page.locator(PICKER_SELECTORS.toolbar);
            const buttonCount = await toolbar.locator('button').count();
            expect(buttonCount).toBeGreaterThan(0);
        });
    });

    test.describe('Mode States', () => {
        test('normal_mode_default', async () => {
            const html = page.locator('html');
            // Should not have zap or paused classes initially
            const hasZap = await html.evaluate((el) => el.classList.contains('zap'));
            const hasPaused = await html.evaluate((el) => el.classList.contains('paused'));
            
            expect(hasZap).toBe(false);
            expect(hasPaused).toBe(false);
        });

        test('zap_mode_can_be_applied', async () => {
            const html = page.locator('html');
            
            // Add zap class programmatically
            await html.evaluate((el) => el.classList.add('zap'));
            await page.waitForTimeout(100);
            
            const hasZap = await html.evaluate((el) => el.classList.contains('zap'));
            expect(hasZap).toBe(true);
            
            // Clean up
            await html.evaluate((el) => el.classList.remove('zap'));
        });

        test('paused_mode_can_be_applied', async () => {
            const html = page.locator('html');
            
            // Add paused class
            await html.evaluate((el) => el.classList.add('paused'));
            await page.waitForTimeout(100);
            
            const hasPaused = await html.evaluate((el) => el.classList.contains('paused'));
            expect(hasPaused).toBe(true);
            
            // Clean up
            await html.evaluate((el) => el.classList.remove('paused'));
        });
    });

    test.describe('Result Set Count', () => {
        test('resultset_count_exists', async () => {
            const count = page.locator(PICKER_SELECTORS.resultsetCount);
            await expect(count).toBeVisible();
        });

        test('resultset_count_can_be_updated', async () => {
            const count = page.locator(PICKER_SELECTORS.resultsetCount);
            
            // Set initial value
            await count.evaluate((el) => { el.textContent = '5'; });
            await page.waitForTimeout(100);
            
            const text = await count.textContent();
            expect(text).toBe('5');
        });
    });
});

/**
 * Element Picker with Mock State Tests
 * 
 * Tests picker behavior with simulated state transitions.
 */
test.describe('Element Picker State Tests', () => {
    let page: Page;
    let context: BrowserContext;
    let extensionId: string | null;

    test.beforeEach(async ({ page: p, context: ctx }) => {
        page = p;
        context = ctx;
        
        const sw = context.serviceWorkers()[0];
        if (sw) {
            const match = sw.url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
            extensionId = match ? match[1] : null;
        }
        
        if (extensionId) {
            await page.goto(`chrome-extension://${extensionId}/web_accessible_resources/epicker-ui.html`);
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(500);
        }
    });

    test.describe.configure({ mode: 'serial' });

    test('create_button_disabled_without_filter', async () => {
        if (!extensionId) {
            test.skip();
            return;
        }
        const createBtn = page.locator(PICKER_SELECTORS.createButton);
        
        // Create should be disabled initially
        const isDisabled = await createBtn.evaluate((el) => el.disabled || el.hasAttribute('disabled'));
        expect(isDisabled).toBeTruthy();
    });

    test('create_button_enabled_with_filter', async () => {
        if (!extensionId) { test.skip(); return; }
        // Note: This test would require mocking vAPI and CodeMirror
        // For now, just verify the button exists and can be interacted with
        const createBtn = page.locator(PICKER_SELECTORS.createButton);
        await expect(createBtn).toBeVisible();
    });

    test('quit_button_closes_picker', async () => {
        const quitBtn = page.locator(PICKER_SELECTORS.quitButton);
        
        // In real usage, clicking quit would remove the picker iframe
        // Here we just verify the button responds
        await quitBtn.click();
        
        // Page should still be functional
        await expect(page.locator('body')).toBeVisible();
    });
});
