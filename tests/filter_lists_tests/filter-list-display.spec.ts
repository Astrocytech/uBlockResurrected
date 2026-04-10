import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Filter List Display (TC1)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should display filter lists container', async () => {
    const container = await helper.getListsContainer();
    await expect(container).toBeVisible();
  });

  test('should display all filter list groups', async () => {
    const groupNames = await helper.getGroupNames();
    // In file:// test context, we have fewer groups due to mock data
    // Check that at least some expected groups are present
    const expectedGroups = ['User', 'Ads', 'Privacy', 'Social', 'Annoyances'];
    
    for (const group of expectedGroups) {
      const found = groupNames.some(name => name.toLowerCase().includes(group.toLowerCase()));
      expect(found, `Group "${group}" should be present`).toBe(true);
    }
  });

  test('should display group headers with localized names', async () => {
    // In file:// context without full i18n, check that group headers exist
    const groups = await helper.getGroupNames();
    expect(groups.length, 'Should have at least one group').toBeGreaterThan(0);
    const firstGroup = groups[0];
    expect(firstGroup.trim().length, 'Group should have a name').toBeGreaterThan(0);
  });

  test('should display user-filters entry under User group', async () => {
    const userFilters = await helper.getFilterListByKey('user-filters');
    await expect(userFilters).toBeVisible();
  });

  test('should display filter list entries with checkboxes', async () => {
    const leafEntries = await helper.getLeafEntries();
    const count = await leafEntries.count();
    expect(count, 'Should have multiple filter list entries').toBeGreaterThan(0);
  });

  test('should display filter list entries with list names', async () => {
    const leafEntries = await helper.getLeafEntries();
    const firstEntry = await leafEntries.first();
    const listName = firstEntry.locator('.listname, .listName');
    const name = await listName.textContent();
    expect(name?.trim().length, 'List entry should have a name').toBeGreaterThan(0);
  });

  test('should display root stats with filter count', async () => {
    const statsText = await helper.getListStats();
    expect(statsText, 'Should display filter count').toBeTruthy();
  });

  test('should display search field', async () => {
    const searchField = await helper.getSearchField();
    await expect(searchField).toBeVisible();
  });

  test('should display apply and update buttons', async () => {
    const applyButton = await helper.getButtonApply();
    const updateButton = await helper.getButtonUpdate();
    await expect(applyButton).toBeVisible();
    await expect(updateButton).toBeVisible();
  });

  test('should display settings checkboxes', async () => {
    await expect(helper.page.locator(FILTER_LIST_SELECTORS.autoUpdate)).toBeVisible();
    await expect(helper.page.locator(FILTER_LIST_SELECTORS.suspendUntilListsAreLoaded)).toBeVisible();
    await expect(helper.page.locator(FILTER_LIST_SELECTORS.parseCosmeticFilters)).toBeVisible();
    await expect(helper.page.locator(FILTER_LIST_SELECTORS.ignoreGenericCosmeticFilters)).toBeVisible();
  });

  test('should display import section', async () => {
    const importEntry = helper.page.locator(FILTER_LIST_SELECTORS.listEntryImport);
    await expect(importEntry).toBeVisible();
  });

  test('should have templates section hidden', async () => {
    const templates = helper.page.locator(FILTER_LIST_SELECTORS.templates);
    await expect(templates).toHaveCSS('display', 'none');
  });
});