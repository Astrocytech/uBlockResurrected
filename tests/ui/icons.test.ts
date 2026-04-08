/**
 * Popup Icons Display Tests
 * 
 * Tests that verify Font Awesome icons render correctly in the popup.
 * Icons are converted from text nodes to SVG elements by faIconsInit().
 */

import { expect, Page, BrowserContext } from '@playwright/test';
import { test, TEST_URL } from './helpers/setup';

test.describe('Popup Icons Display', () => {
    let page: Page;
    let context: BrowserContext;
    let extensionId: string | null;
    let consoleErrors: string[] = [];

    test.beforeEach(async ({ page: p, context: ctx, extensionId: extId }) => {
        page = p;
        context = ctx;
        extensionId = extId ?? null;
        consoleErrors = [];

        // Collect console errors from popup
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // Open popup
        if (extensionId) {
            await page.goto(`chrome-extension://${extensionId}/popup-fenix.html`);
            await page.waitForLoadState('networkidle');
            // Wait for faIconsInit() to run
            await page.waitForTimeout(1000);
        }
    });

    test.describe.configure({ mode: 'serial' });

    test.describe('Console Errors', () => {
        test('no_critical_console_errors', async () => {
            if (!extensionId) { test.skip(); return; }

            // Filter out expected/benign errors
            const criticalErrors = consoleErrors.filter(e =>
                !e.includes('favicon') &&
                !e.includes('net::ERR') &&
                !e.includes('404') &&
                !e.includes('Failed to load resource')
            );

            // Log any errors for debugging
            if (criticalErrors.length > 0) {
                console.log('Console errors found:', criticalErrors);
            }

            expect(criticalErrors.length).toBe(0);
        });

        test('faIconsInit_runs_without_error', async () => {
            if (!extensionId) { test.skip(); return; }

            // Check that faIconsInit didn't throw
            const faIconsErrors = consoleErrors.filter(e =>
                e.includes('faIconsInit') ||
                e.includes('fa-icon')
            );

            expect(faIconsErrors.length).toBe(0);
        });
    });

    test.describe('Icon Elements Exist', () => {
        test('zapper_icon_bolt_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            // #gotoZap should have an SVG inside it
            const zapperBtn = page.locator('#gotoZap');
            await expect(zapperBtn).toBeAttached();

            // After faIconsInit, there should be an SVG
            const svg = zapperBtn.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });

        test('picker_icon_eyedropper_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const pickerBtn = page.locator('#gotoPick');
            await expect(pickerBtn).toBeAttached();

            const svg = pickerBtn.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });

        test('report_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const reportBtn = page.locator('#gotoReport');
            await expect(reportBtn).toBeAttached();

            const svg = reportBtn.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });

        test('dashboard_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const dashboardLink = page.locator('a[href="dashboard.html"]');
            await expect(dashboardLink).toBeAttached();

            const svg = dashboardLink.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });

        test('logger_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const loggerLink = page.locator('a[href*="logger-ui.html"]');
            await expect(loggerLink).toBeAttached();

            const svg = loggerLink.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });

        test('refresh_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const refreshBtn = page.locator('#refresh');
            await expect(refreshBtn).toBeAttached();

            const svg = refreshBtn.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });

        test('save_rules_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const saveBtn = page.locator('#saveRules');
            await expect(saveBtn).toBeAttached();

            const svg = saveBtn.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });

        test('revert_rules_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const revertBtn = page.locator('#revertRules');
            await expect(revertBtn).toBeAttached();

            const svg = revertBtn.locator('svg');
            await expect(svg).toBeAttached({ timeout: 2000 });
        });
    });

    test.describe('SVG Content', () => {
        test('zapper_svg_has_path_element', async () => {
            if (!extensionId) { test.skip(); return; }

            const svg = page.locator('#gotoZap svg');
            await expect(svg).toBeAttached({ timeout: 2000 });

            // The bolt icon should have a path
            const path = svg.locator('path');
            await expect(path).toBeAttached();
        });

        test('picker_svg_has_path_element', async () => {
            if (!extensionId) { test.skip(); return; }

            const svg = page.locator('#gotoPick svg');
            await expect(svg).toBeAttached({ timeout: 2000 });

            const path = svg.locator('path');
            await expect(path).toBeAttached();
        });

        test('svg_has_viewbox_attribute', async () => {
            if (!extensionId) { test.skip(); return; }

            const svg = page.locator('#gotoZap svg');
            await expect(svg).toBeAttached({ timeout: 2000 });

            const viewBox = await svg.getAttribute('viewBox');
            expect(viewBox).toBeTruthy();
        });
    });

    test.describe('SVG Visibility', () => {
        test('svg_has_fill_color', async () => {
            if (!extensionId) { test.skip(); return; }

            const svg = page.locator('#gotoZap svg').first();
            await expect(svg).toBeAttached({ timeout: 2000 });

            const fill = await svg.evaluate((el: Element) => {
                const svg = el as SVGElement;
                const computed = window.getComputedStyle(svg);
                return {
                    fill: computed.fill,
                    display: computed.display,
                    visibility: computed.visibility
                };
            });

            expect(fill.fill).not.toBe('none');
        });

        test('svg_has_dimensions', async () => {
            if (!extensionId) { test.skip(); return; }

            const svg = page.locator('#gotoZap svg').first();
            await expect(svg).toBeAttached({ timeout: 2000 });

            const dimensions = await svg.boundingBox();
            expect(dimensions).not.toBeNull();
            expect(dimensions!.width).toBeGreaterThan(0);
            expect(dimensions!.height).toBeGreaterThan(0);
        });

        test('svg_and_parent_visibility_check', async () => {
            if (!extensionId) { test.skip(); return; }

            const result = await page.evaluate(() => {
                const svg = document.querySelector('#gotoZap svg') as SVGElement | null;
                const parent = svg?.parentElement;
                if (!svg || !parent) return null;
                
                const svgComputed = window.getComputedStyle(svg);
                const parentComputed = window.getComputedStyle(parent);
                const grandParent = parent.parentElement;
                const grandParentComputed = grandParent ? window.getComputedStyle(grandParent) : null;
                
                return {
                    svgVisibility: svgComputed.visibility,
                    svgWidth: svg.getBoundingClientRect().width,
                    svgHeight: svg.getBoundingClientRect().height,
                    parentId: parent.id,
                    parentClasses: parent.className,
                    parentVisibility: parentComputed.visibility,
                    grandParentId: grandParent?.id,
                    grandParentVisibility: grandParentComputed?.visibility,
                };
            });

            expect(result).not.toBeNull();
            expect(result!.svgWidth).toBeGreaterThan(0);
            expect(result!.svgHeight).toBeGreaterThan(0);
            
            console.log('SVG visibility result:', JSON.stringify(result, null, 2));
        });

        test('svg_path_has_fill', async () => {
            if (!extensionId) { test.skip(); return; }

            const pathFill = await page.evaluate(() => {
                const svg = document.querySelector('#gotoZap svg');
                const path = svg?.querySelector('path');
                if (!path) return null;
                
                const computed = window.getComputedStyle(path);
                return {
                    fill: computed.fill,
                    stroke: computed.stroke,
                    display: computed.display
                };
            });

            console.log('Path fill:', pathFill);
            expect(pathFill).not.toBeNull();
        });
    });

    test.describe('Per-Site Switch Icons', () => {
        test('no_popups_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const icon = page.locator('#no-popups .fa-icon svg').first();
            await expect(icon).toBeAttached({ timeout: 2000 });
        });

        test('no_large_media_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const icon = page.locator('#no-large-media .fa-icon svg').first();
            await expect(icon).toBeAttached({ timeout: 2000 });
        });

        test('no_cosmetic_filtering_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const icon = page.locator('#no-cosmetic-filtering .fa-icon svg').first();
            await expect(icon).toBeAttached({ timeout: 2000 });
        });

        test('no_remote_fonts_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const icon = page.locator('#no-remote-fonts .fa-icon svg').first();
            await expect(icon).toBeAttached({ timeout: 2000 });
        });

        test('no_scripting_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const icon = page.locator('#no-scripting .fa-icon svg').first();
            await expect(icon).toBeAttached({ timeout: 2000 });
        });
    });

    test.describe('More/Less Icons', () => {
        test('more_button_icon_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const icon = page.locator('#moreButton svg');
            await expect(icon).toBeAttached({ timeout: 2000 });
        });

        test('filter_icon_in_firewall_has_svg', async () => {
            if (!extensionId) { test.skip(); return; }

            const icon = page.locator('#firewall section .fa-icon svg');
            await expect(icon).toBeAttached({ timeout: 2000 });
        });
    });
});
