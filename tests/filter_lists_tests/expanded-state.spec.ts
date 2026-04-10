import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Expanded State Persistence (TC12)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should expand group on click', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const isExpanded = await helper.isGroupExpanded(groupKey);
    expect(isExpanded, 'Group should be expanded after click').toBe(true);
  });

  test('should collapse expanded group on click', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    await helper.collapseGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const isExpanded = await helper.isGroupExpanded(groupKey);
    expect(isExpanded, 'Group should be collapsed after second click').toBe(false);
  });

  test('should persist expanded state to localStorage', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const stored = await helper.getExpandedGroupsFromStorage();
    expect(stored, 'Expanded state should be stored').toBeTruthy();
  });

  test('should restore expanded state on page reload', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const isExpanded = await helper.isGroupExpanded(groupKey);
    expect(isExpanded, 'Group should remain expanded after reload').toBe(true);
  });

  test('should expand all groups', async () => {
    await helper.expandAllGroups();
    await helper.page.waitForTimeout(500);
    
    const groups = FILTER_LIST_SELECTORS.groupKeys;
    for (const groupKey of groups) {
      const isExpanded = await helper.isGroupExpanded(groupKey);
      if (isExpanded !== null) {
        expect(isExpanded, `Group "${groupKey}" should be expanded`).toBe(true);
      }
    }
  });

  test('should toggle root stats to expand all', async () => {
    const rootstats = helper.page.locator(FILTER_LIST_SELECTORS.rootstats);
    await rootstats.click();
    await helper.page.waitForTimeout(300);
    
    const rootstatsClass = await rootstats.getAttribute('class');
    expect(rootstatsClass, 'Rootstats should have expanded class').toContain('expanded');
  });

  test('should clear hideUnusedFilterLists on expansion', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const hasHideUnused = await helper.page.evaluate(async () => {
      const value = await vAPI?.localStorage?.getItem('hideUnusedFilterLists');
      return value !== null;
    });
    
    expect(hasHideUnused, 'hideUnusedFilterLists should be cleared').toBe(false);
  });
});