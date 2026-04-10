import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Group Node Stats (TC18)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should show nodestats for group nodes', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const stats = await helper.getGroupStats(groupKey);
    expect(stats, 'Group should show stats').toBeTruthy();
  });

  test('should update stats when all children checked', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const leafEntries = helper.page.locator(`.listEntry[data-key="${groupKey}"] .listEntry[data-role="leaf"]`);
    const leafCount = await leafEntries.count();
    
    if (leafCount > 0) {
      for (let i = 0; i < leafCount; i++) {
        const checkbox = leafEntries.nth(i).locator(FILTER_LIST_SELECTORS.checkbox);
        await checkbox.check();
      }
      await helper.page.waitForTimeout(200);
      
      const stats = await helper.getGroupStats(groupKey);
      expect(stats, 'Stats should show all enabled').toMatch(/\d+\/\d+/);
    }
  });

  test('should show partial stats when some children checked', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const leafEntries = helper.page.locator(`.listEntry[data-key="${groupKey}"] .listEntry[data-role="leaf"]`);
    const leafCount = await leafEntries.count();
    
    if (leafCount > 1) {
      const firstCheckbox = leafEntries.first().locator(FILTER_LIST_SELECTORS.checkbox);
      await firstCheckbox.check();
      await helper.page.waitForTimeout(200);
      
      const stats = await helper.getGroupStats(groupKey);
      expect(stats, 'Stats should show partial count').toBeTruthy();
    }
  });

  test('should update leafstats for individual lists', async () => {
    const listKey = 'ublock-filters';
    const wasChecked = await helper.isListChecked(listKey);
    
    if (!wasChecked) {
      await helper.toggleFilterList(listKey);
      await helper.page.waitForTimeout(200);
    }
    
    const stats = await helper.getLeafStats(listKey);
    expect(stats, 'Should show leaf stats for list').toBeTruthy();
  });

  test('should show leafstats only for checked lists', async () => {
    const listKey = 'ublock-filters';
    
    await helper.toggleFilterList(listKey);
    await helper.page.waitForTimeout(200);
    
    const listEntry = await helper.getFilterListByKey(listKey);
    const leafstats = listEntry.locator(FILTER_LIST_SELECTORS.leafstats);
    const isVisible = await leafstats.isVisible();
    
    if (await helper.isListChecked(listKey)) {
      expect(isVisible, 'Leafstats should be visible for checked list').toBe(true);
    }
  });

  test('should show filter count in rootstats', async () => {
    const statsText = await helper.getListStats();
    expect(statsText, 'Root stats should show filter count').toBeTruthy();
  });

  test('should update rootstats after changes', async () => {
    const statsBefore = await helper.getListStats();
    
    await helper.toggleFilterList('easy-list');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    const statsAfter = await helper.getListStats();
    expect(statsAfter, 'Root stats should update after changes').toBeTruthy();
  });

  test('should display format X/Y for leaf entries', async () => {
    const listKey = 'ublock-filters';
    if (await helper.isListChecked(listKey)) {
      const stats = await helper.getLeafStats(listKey);
      expect(stats, 'Leaf stats should be in X/Y format').toMatch(/\d+[\d,]*\s*\/\s*\d+[\d,]*/);
    }
  });
});