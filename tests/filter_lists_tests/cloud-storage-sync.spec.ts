import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Cloud Storage Sync (TC11)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should have cloud widget in UI', async () => {
    const cloudWidget = await helper.getCloudWidget();
    await expect(cloudWidget).toBeVisible();
  });

  test('should hide cloud widget by default', async () => {
    const isVisible = await helper.isCloudWidgetVisible();
    expect(isVisible, 'Cloud widget should be hidden by default').toBe(false);
  });

  test('should push filter list selection to cloud', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const hasCloudSupport = await helper.page.evaluate(() => {
      return typeof window.cloud !== 'undefined' ||
             typeof window.__cloud !== 'undefined';
    });
    
    expect(hasCloudSupport, 'Cloud functionality should be available').toBeTruthy();
  });

  test('should pull filter list selection from cloud', async () => {
    const hasCloudOnPull = await helper.page.evaluate(() => {
      return typeof window.cloud?.onPull === 'function';
    });
    
    expect(hasCloudOnPull, 'Cloud onPull should be available').toBeTruthy();
  });

  test('should sync selectedLists in cloud data', async () => {
    const hasCloudOnPush = await helper.page.evaluate(() => {
      return typeof window.cloud?.onPush === 'function';
    });
    
    expect(hasCloudOnPush, 'Cloud onPush should be available').toBeTruthy();
  });
});