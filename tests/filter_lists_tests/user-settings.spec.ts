import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('User Settings (TC7)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should toggle auto-update setting', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.autoUpdate);
    await checkbox.click();
    await helper.page.waitForTimeout(100);
    
    const isChecked = await checkbox.isChecked();
    expect(isChecked, 'Auto-update should be toggled').toBe(true);
  });

  test('should toggle suspend until lists loaded setting', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.suspendUntilListsAreLoaded);
    await checkbox.click();
    await helper.page.waitForTimeout(100);
    
    const isChecked = await checkbox.isChecked();
    expect(isChecked, 'Suspend setting should be toggled').toBe(true);
  });

  test('should toggle parse cosmetic filters setting', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.parseCosmeticFilters);
    await checkbox.click();
    await helper.page.waitForTimeout(100);
    
    const isChecked = await checkbox.isChecked();
    expect(isChecked, 'Parse cosmetic filters should be toggled').toBe(true);
  });

  test('should toggle ignore generic cosmetic filters setting', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.ignoreGenericCosmeticFilters);
    await checkbox.click();
    await helper.page.waitForTimeout(100);
    
    const isChecked = await checkbox.isChecked();
    expect(isChecked, 'Ignore generic cosmetic filters should be toggled').toBe(true);
  });

  test('should persist auto-update setting', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.autoUpdate);
    await checkbox.click();
    await helper.page.waitForTimeout(100);
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const isChecked = await checkbox.isChecked();
    expect(isChecked, 'Auto-update setting should persist').toBe(true);
  });

  test('should persist parse cosmetic filters setting', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.parseCosmeticFilters);
    await checkbox.click();
    await helper.page.waitForTimeout(100);
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const isChecked = await checkbox.isChecked();
    expect(isChecked, 'Parse cosmetic filters setting should persist').toBe(true);
  });

  test('should enable apply button when settings change', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.autoUpdate);
    await checkbox.click();
    await helper.page.waitForTimeout(200);
    
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply button should be enabled when settings change').toBe(true);
  });
});