/**
 * Picker Filter Creation Tests
 * 
 * Tests for filter creation:
 * - Create button functionality
 * - validateSelector() with ExtSelectorCompiler
 * - addCustomFilters message to background
 * - Filter storage (site.{hostname} key)
 * - Auto-close after creation
 * 
 * Based on Picker.md Flow 6
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
    PickerTestHelper,
    PICKER_SELECTORS,
    createMockPickerFrame,
    removeMockPickerFrame,
} from './helpers/picker-helper';

test.describe('Picker Filter Creation', () => {
    let page: Page;
    let context: BrowserContext;
    let helper: PickerTestHelper;

    test.beforeEach(async ({ page: testPage, context: testContext }) => {
        page = testPage;
        context = testContext;
        helper = new PickerTestHelper(page, context);
        
        await helper.navigateToTestPage();
        await createMockPickerFrame(page);
    });

    test.afterEach(async () => {
        await removeMockPickerFrame(page);
    });

    test.describe('Create Button', () => {
        test.skip('should close picker after successful filter creation', async () => {
            await helper.activatePicker();
            
            await helper.triggerCandidatesAtPoint(100, 100);
            await helper.setSelectedSelector('#simple-div');
            
            await page.locator('#create').click();
            
            await helper.waitForPickerInactive();
            
            const inactive = await helper.getPickerState();
            expect(inactive.isActive).toBe(false);
        });

        test.skip('should send addCustomFilters message', async () => {
            await helper.activatePicker();
            
            await helper.triggerCandidatesAtPoint(100, 100);
            await helper.setSelectedSelector('#simple-div');
            
            await page.locator('#create').click();
            
            const messageSent = await page.evaluate(() => {
                return (window as any).addCustomFiltersSent === true;
            });
            
            expect(messageSent).toBe(true);
        });

        test.skip('should include hostname in message', async () => {
            await helper.activatePicker();
            
            await helper.triggerCandidatesAtPoint(100, 100);
            await helper.setSelectedSelector('#simple-div');
            
            await page.locator('#create').click();
            
            const includesHostname = await page.evaluate(() => {
                return (window as any).hostnameIncluded === true;
            });
            
            expect(includesHostname).toBe(true);
        });

        test.skip('should include selector in message', async () => {
            await helper.activatePicker();
            
            await helper.triggerCandidatesAtPoint(100, 100);
            await helper.setSelectedSelector('#simple-div');
            
            await page.locator('#create').click();
            
            const includesSelector = await page.evaluate(() => {
                return (window as any).selectorIncluded === true;
            });
            
            expect(includesSelector).toBe(true);
        });
    });

    test.describe('Selector Validation', () => {
        test.skip('should validate valid CSS selector', async () => {
            await helper.activatePicker();
            
            const valid = await page.evaluate(() => {
                return (window as any).validateSelector('#simple-div') !== undefined;
            });
            
            expect(valid).toBe(true);
        });

        test.skip('should validate valid attribute selector', async () => {
            await helper.activatePicker();
            
            const valid = await page.evaluate(() => {
                return (window as any).validateSelector('[data-testid]') !== undefined;
            });
            
            expect(valid).toBe(true);
        });

        test.skip('should validate valid class selector', async () => {
            await helper.activatePicker();
            
            const valid = await page.evaluate(() => {
                return (window as any).validateSelector('.element-with-class') !== undefined;
            });
            
            expect(valid).toBe(true);
        });

        test.skip('should return undefined for invalid selector', async () => {
            await helper.activatePicker();
            
            const invalid = await page.evaluate(() => {
                return (window as any).validateSelector('[invalid') === undefined;
            });
            
            expect(invalid).toBe(true);
        });

        test.skip('should store error message for invalid selector', async () => {
            await helper.activatePicker();
            
            await page.evaluate(() => {
                (window as any).validateSelector('[invalid');
            });
            
            const hasError = await page.evaluate(() => {
                return validateSelector.error === 'Error';
            });
            
            expect(hasError).toBe(true);
        });

        test.skip('should handle empty selector', async () => {
            await helper.activatePicker();
            
            const emptyHandled = await page.evaluate(() => {
                return (window as any).validateSelector('') !== undefined;
            });
            
            expect(emptyHandled).toBe(true);
        });
    });

    test.describe('Filter Storage', () => {
        test.skip('should use site.{hostname} key format', async () => {
            await helper.activatePicker();
            
            await page.evaluate(() => {
                (window as any).testHostname = 'example.com';
            });
            
            const keyFormat = await page.evaluate(() => {
                return (window as any).storageKey?.startsWith('site.');
            });
            
            expect(keyFormat).toBe(true);
        });

        test.skip('should deduplicate existing filters', async () => {
            await helper.activatePicker();
            
            const deduplicated = await page.evaluate(() => {
                return (window as any).filtersDeduplicated === true;
            });
            
            expect(deduplicated).toBe(true);
        });

        test.skip('should sort filters alphabetically', async () => {
            await helper.activatePicker();
            
            const sorted = await page.evaluate(() => {
                return (window as any).filtersSorted === true;
            });
            
            expect(sorted).toBe(true);
        });
    });

    test.describe('Procedural Filters', () => {
        test.skip('should accept JSON-encoded procedural filter', async () => {
            await helper.activatePicker();
            
            const accepted = await page.evaluate(() => {
                const selector = JSON.stringify({ selector: 'div', tasks: [{ hide: '' }] });
                return (window as any).validateSelector(selector) !== undefined;
            });
            
            expect(accepted).toBe(true);
        });

        test.skip('should handle :has() procedural selector', async () => {
            await helper.activatePicker();
            
            const handled = await page.evaluate(() => {
                return (window as any).validateSelector('div:has(.hidden)') !== undefined;
            });
            
            expect(handled).toBe(true);
        });

        test.skip('should handle :has-text() procedural selector', async () => {
            await helper.activatePicker();
            
            const handled = await page.evaluate(() => {
                return (window as any).validateSelector('div:has-text("advertisement")') !== undefined;
            });
            
            expect(handled).toBe(true);
        });

        test.skip('should handle :matches-css() procedural selector', async () => {
            await helper.activatePicker();
            
            const handled = await page.evaluate(() => {
                return (window as any).validateSelector('div:matches-css(display, none)') !== undefined;
            });
            
            expect(handled).toBe(true);
        });
    });

    test.describe('Custom Filters Lifecycle', () => {
        test.skip('should terminate existing custom filters before creating new', async () => {
            await helper.activatePicker();
            
            const terminated = await page.evaluate(() => {
                return (window as any).customFiltersTerminated === true;
            });
            
            expect(terminated).toBe(true);
        });

        test.skip('should restart custom filters after creation', async () => {
            await helper.activatePicker();
            
            await helper.triggerCandidatesAtPoint(100, 100);
            await helper.setSelectedSelector('#simple-div');
            
            await page.locator('#create').click();
            
            const restarted = await page.evaluate(() => {
                return (window as any).customFiltersRestarted === true;
            });
            
            expect(restarted).toBe(true);
        });
    });
});

export { test };