import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Unsaved Changes Detection (TC14)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should detect unsaved changes after toggle', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    const hasChanges = await helper.hasUnsavedData();
    expect(hasChanges, 'Should detect unsaved changes after toggle').toBe(true);
  });

  test('should not have unsaved changes initially', async () => {
    const hasChanges = await helper.hasUnsavedData();
    expect(hasChanges, 'Should not have unsaved changes initially').toBe(false);
  });

  test('should clear unsaved changes after apply', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const hasChanges = await helper.hasUnsavedData();
    expect(hasChanges, 'Should not have unsaved changes after apply').toBe(false);
  });

  test('should detect unsaved changes after settings change', async () => {
    const checkbox = helper.page.locator(FILTER_LIST_SELECTORS.autoUpdate);
    await checkbox.click();
    await helper.page.waitForTimeout(100);
    
    const hasChanges = await helper.hasUnsavedData();
    expect(hasChanges, 'Should detect unsaved changes after settings toggle').toBe(true);
  });

  test('should detect unsaved changes after import', async () => {
    await helper.expandImportSection();
    const textarea = await helper.getImportTextarea();
    await textarea.fill('https://example.com/filters.txt');
    await helper.page.waitForTimeout(100);
    
    const hasChanges = await helper.hasUnsavedData();
    expect(hasChanges, 'Should detect unsaved changes after import').toBe(true);
  });

  test('should detect unsaved changes after marking for removal', async () => {
    await helper.markListForRemoval('easy-list');
    await helper.page.waitForTimeout(100);
    
    const hasChanges = await helper.hasUnsavedData();
    expect(hasChanges, 'Should detect unsaved changes after marking for removal').toBe(true);
  });

  test('should not have unsaved changes after reverting', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    const hasChanges = await helper.hasUnsavedData();
    expect(hasChanges, 'Should not have unsaved changes after reverting').toBe(false);
  });
});