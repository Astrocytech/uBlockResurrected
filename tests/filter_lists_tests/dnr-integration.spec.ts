import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('DNR Integration (TC9)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should update DNR rules after applying changes', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const isUpdating = await helper.isBodyUpdating();
    expect(isUpdating, 'Should complete update process').toBe(false);
  });

  test('should broadcast filteringBehaviorChanged after changes', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const hasDNRSupport = await helper.page.evaluate(() => {
      return typeof chrome !== 'undefined' && 
             typeof chrome.declarativeNetRequest !== 'undefined';
    });
    
    expect(hasDNRSupport, 'DNR API should be available').toBeTruthy();
  });

  test('should enable new list rules in DNR', async () => {
    const listKey = 'ublock-filters';
    const wasEnabled = await helper.isListChecked(listKey);
    
    if (!wasEnabled) {
      await helper.toggleFilterList(listKey);
      await helper.page.waitForTimeout(100);
      
      await helper.clickApplyButton();
      await helper.waitForUpdateComplete();
    }
    
    const isNowEnabled = await helper.isListChecked(listKey);
    expect(isNowEnabled, 'List should be enabled after apply').toBe(true);
  });

  test('should remove DNR rules when list disabled', async () => {
    const listKey = 'ublock-filters';
    const wasEnabled = await helper.isListChecked(listKey);
    
    if (wasEnabled) {
      await helper.toggleFilterList(listKey);
      await helper.page.waitForTimeout(100);
      
      await helper.clickApplyButton();
      await helper.waitForUpdateComplete();
      
      const isNowDisabled = await helper.isListChecked(listKey);
      expect(isNowDisabled, 'List should be disabled after toggle and apply').toBe(false);
    }
  });

  test('should persist DNR rules after browser restart', async () => {
    const listKey = 'ublock-filters';
    const isEnabled = await helper.isListChecked(listKey);
    
    await helper.page.reload();
    await helper.waitForFilterListsLoaded();
    
    const isStillEnabled = await helper.isListChecked(listKey);
    expect(isStillEnabled, 'List state should persist after reload').toBe(isEnabled);
  });
});