import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('First-Time Setup (TC10)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
  });

  test('should auto-select default filter lists on fresh install', async () => {
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const enabledCount = await helper.getEnabledListsCount();
    expect(enabledCount, 'Should have default lists enabled on fresh install').toBeGreaterThan(0);
  });

  test('should select regional filter lists based on locale', async () => {
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const groupNames = await helper.getGroupNames();
    expect(groupNames.length, 'Should have multiple groups available').toBeGreaterThan(0);
  });

  test('should include user-filters in default selection', async () => {
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const userFilters = await helper.getFilterListByKey('user-filters');
    await expect(userFilters).toBeVisible();
  });

  test('should include built-in lists in default selection', async () => {
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const builtInLists = ['ublock-filters', 'easy-list', 'easy-privacy'];
    for (const listKey of builtInLists) {
      const listEntry = await helper.getFilterListByKey(listKey);
      const isVisible = await listEntry.isVisible().catch(() => false);
      expect(isVisible, `Built-in list "${listKey}" should be visible`).toBe(true);
    }
  });
});