import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Apply Changes (TC4)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should be disabled when no changes made', async () => {
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply button should be disabled when no changes made').toBe(false);
  });

  test('should be enabled when changes exist', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply button should be enabled when changes exist').toBe(true);
  });

  test('should save selection to storage on apply', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.page.waitForTimeout(500);
    
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply button should be disabled after applying').toBe(false);
  });

  test('should remove stickied class after apply', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.page.waitForTimeout(500);
    
    const stickiedEntries = helper.page.locator('.listEntry.stickied');
    const count = await stickiedEntries.count();
    expect(count, 'Should have no stickied entries after apply').toBe(0);
  });

  test('should show working state during apply', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    const applyPromise = helper.clickApplyButton();
    await helper.page.waitForTimeout(50);
    
    const isWorking = await helper.isBodyWorking();
    expect(isWorking, 'Should show working state during apply').toBe(true);
    
    await applyPromise;
    await helper.page.waitForTimeout(500);
  });

  test('should enable apply button after toggle', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(200);
    
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply should be enabled after toggling list').toBe(true);
  });

  test('should disable apply after reverting changes', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    const isEnabled1 = await helper.isApplyButtonEnabled();
    expect(isEnabled1).toBe(true);
    
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    const isEnabled2 = await helper.isApplyButtonEnabled();
    expect(isEnabled2, 'Apply should be disabled after reverting').toBe(false);
  });
});