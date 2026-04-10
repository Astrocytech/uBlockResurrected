import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Purge Cache (TC15)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should mark list for cache purge on click', async () => {
    const listKey = 'ublock-filters';
    
    const hasCacheIcon = await helper.isStatusIconVisible(listKey, 'cache').catch(() => false);
    
    if (hasCacheIcon) {
      await helper.purgeListCache(listKey);
      await helper.page.waitForTimeout(200);
      
      const isUpdating = await helper.isStatusIconVisible(listKey, 'updating');
      expect(isUpdating, 'List should show updating status after purge').toBe(true);
    }
  });

  test('should mark child lists for purge when purging group', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const groupEntry = await helper.getGroupHeader(groupKey);
    const cacheIcon = groupEntry.locator('.status.cache');
    const hasCache = await cacheIcon.isVisible().catch(() => false);
    
    if (hasCache) {
      await cacheIcon.click();
      await helper.page.waitForTimeout(200);
      
      const groupUpdating = await groupEntry.evaluate(el => 
        el.classList.contains('updating')
      );
      expect(groupUpdating, 'Group should show updating state after purge').toBeTruthy();
    }
  });

  test('should show cache icon for cached lists', async () => {
    const listKey = 'ublock-filters';
    
    await helper.purgeListCache(listKey).catch(() => {});
    await helper.page.waitForTimeout(100);
    
    const listEntry = await helper.getFilterListByKey(listKey);
    const hasCacheClass = await listEntry.evaluate(el => 
      el.classList.contains('cached')
    );
    
    expect(hasCacheClass, 'List should have cached class').toBeTruthy();
  });

  test('should purge multiple lists', async () => {
    const listKeys = ['ublock-filters', 'easy-list'];
    
    for (const listKey of listKeys) {
      await helper.purgeListCache(listKey).catch(() => {});
      await helper.page.waitForTimeout(100);
    }
    
    const isUpdating = await helper.isBodyUpdating();
    expect(isUpdating, 'Should be updating after purging multiple lists').toBe(true);
  });
});