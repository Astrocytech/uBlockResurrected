import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Filter Reload (TC5)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should reload filters after apply', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const statsText = await helper.getListsOfBlockedHostsText();
    expect(statsText, 'Should have filter count after reload').toBeTruthy();
  });

  test('should update filter count in header after reload', async () => {
    const statsBefore = await helper.getListStats();
    
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const statsAfter = await helper.getListStats();
    expect(statsAfter, 'Filter count should update after reload').toBeTruthy();
  });

  test('should complete reload without errors', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    
    await helper.page.waitForFunction(() => {
      return !document.body.classList.contains('working');
    }, { timeout: 30000 });
    
    const hasErrors = await helper.page.evaluate(() => {
      return window.__testErrors?.length > 0 || false;
    });
    
    expect(hasErrors, 'Should complete reload without errors').toBe(false);
  });

  test('should reload all selected filter lists', async () => {
    const enabledBefore = await helper.getEnabledListsCount();
    
    await helper.toggleFilterList('easy-list');
    await helper.toggleFilterList('easy-privacy');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const enabledAfter = await helper.getEnabledListsCount();
    expect(enabledAfter, 'Should have more enabled lists after apply').toBeGreaterThan(enabledBefore);
  });
});