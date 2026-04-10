import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Search Functionality (TC8)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should filter lists on search query', async () => {
    await helper.searchLists('easy');
    await helper.page.waitForTimeout(200);
    
    const listsContainer = helper.page.locator(FILTER_LIST_SELECTORS.listsContainer);
    const classAttr = await listsContainer.getAttribute('class');
    expect(classAttr, 'Lists container should have searchMode class').toContain('searchMode');
  });

  test('should show matching lists based on title', async () => {
    await helper.searchLists('privacy');
    await helper.page.waitForTimeout(200);
    
    const matchingLists = helper.page.locator('.listEntry.searchMatch');
    const count = await matchingLists.count();
    expect(count, 'Should show lists matching search').toBeGreaterThan(0);
  });

  test('should hide non-matching lists', async () => {
    await helper.searchLists('nonexistent');
    await helper.page.waitForTimeout(200);
    
    const allLeafEntries = await helper.getLeafEntries();
    const visibleCount = await allLeafEntries.filter({ hasNot: '.listEntry.searchMatch' }).count();
    
    const searchMatchEntries = helper.page.locator('.listEntry.searchMatch');
    const matchCount = await searchMatchEntries.count();
    
    expect(matchCount, 'Should have no matches for nonexistent query').toBe(0);
  });

  test('should clear search and show all lists', async () => {
    await helper.searchLists('easy');
    await helper.page.waitForTimeout(200);
    
    await helper.clearSearch();
    await helper.page.waitForTimeout(200);
    
    const listsContainer = helper.page.locator(FILTER_LIST_SELECTORS.listsContainer);
    const classAttr = await listsContainer.getAttribute('class');
    expect(classAttr, 'Should not have searchMode class after clearing').not.toContain('searchMode');
  });

  test('should search by group name', async () => {
    await helper.searchLists('ads');
    await helper.page.waitForTimeout(200);
    
    const groupHeaders = helper.page.locator('.listEntry[data-role="node"].searchMatch');
    const count = await groupHeaders.count();
    expect(count, 'Should show groups matching search').toBeGreaterThan(0);
  });

  test('should search case-insensitively', async () => {
    await helper.searchLists('EASY');
    await helper.page.waitForTimeout(200);
    
    const matchingLists = helper.page.locator('.listEntry.searchMatch');
    const count = await matchingLists.count();
    expect(count, 'Should find matches regardless of case').toBeGreaterThan(0);
  });

  test('should update ancestor nodes in search results', async () => {
    await helper.searchLists('privacy');
    await helper.page.waitForTimeout(200);
    
    const groupsWithMatches = helper.page.locator('.listEntry[data-role="node"].searchMatch');
    const count = await groupsWithMatches.count();
    expect(count, 'Should have groups with matching children').toBeGreaterThan(0);
  });
});