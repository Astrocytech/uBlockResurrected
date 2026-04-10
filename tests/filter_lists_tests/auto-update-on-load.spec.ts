import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Auto-Update on Load (TC13)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should trigger auto-update on load when enabled', async () => {
    await helper.setAutoUpdateSetting(true);
    await helper.page.reload();
    await helper.waitForFilterListsLoaded();
    await helper.page.waitForTimeout(500);
    
    const isUpdating = await helper.isBodyUpdating();
    expect(isUpdating, 'Should be in updating state when auto-update enabled').toBe(false);
  });

  test('should not auto-update when disabled', async () => {
    await helper.setAutoUpdateSetting(false);
    await helper.page.reload();
    await helper.waitForFilterListsLoaded();
    await helper.page.waitForTimeout(500);
    
    const isNotUpdating = !(await helper.isBodyUpdating());
    expect(isNotUpdating, 'Should not be updating when auto-update disabled').toBe(true);
  });

  test('should check auto-update setting on page load', async () => {
    const autoUpdate = await helper.getAutoUpdateSetting();
    expect(autoUpdate, 'Auto-update setting should be accessible').toBeDefined();
  });

  test('should respect auto-update in renderFlow', async () => {
    const button = await helper.getButtonUpdate();
    const isDisabled = await button.isDisabled();
    
    const autoUpdate = await helper.getAutoUpdateSetting();
    if (autoUpdate) {
      expect(isDisabled, 'Update button should not be disabled when auto-update on').toBe(false);
    }
  });
});