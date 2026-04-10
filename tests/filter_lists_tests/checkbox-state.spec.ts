import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Checkbox State (TC2)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should have default lists checked on fresh install', async () => {
    const ublockFilters = await helper.getFilterListByKey('ublock-filters');
    const isChecked = await ublockFilters.evaluate(el => el.classList.contains('checked'));
    expect(isChecked, 'Default uBlock filters should be checked').toBe(true);
  });

  test('should reflect enabled state in checkbox', async () => {
    const listKey = 'ublock-filters';
    const isChecked = await helper.isCheckboxChecked(listKey);
    const isListChecked = await helper.isListChecked(listKey);
    
    expect(isChecked, 'Checkbox should reflect checked state').toBe(isListChecked);
  });

  test('should show unchecked state for disabled list', async () => {
    const listKey = 'ublock-filters';
    const checkbox = await helper.getCheckboxForList(listKey);
    
    await checkbox.uncheck();
    const isListChecked = await helper.isListChecked(listKey);
    
    expect(isListChecked, 'List should not be checked after unchecking').toBe(false);
  });

  test('should show checked state for enabled list', async () => {
    const listKey = 'ublock-filters';
    const checkbox = await helper.getCheckboxForList(listKey);
    
    await checkbox.check();
    const isListChecked = await helper.isListChecked(listKey);
    
    expect(isListChecked, 'List should be checked after checking').toBe(true);
  });

  test('should persist checkbox state in UI', async () => {
    const listKey = 'easy-list';
    
    await helper.toggleFilterList(listKey);
    await helper.page.waitForTimeout(100);
    
    const isChecked = await helper.isListChecked(listKey);
    expect(isChecked, 'Checkbox state should persist in UI').toBe(true);
  });

  test('should count enabled lists correctly', async () => {
    const enabledCount = await helper.getEnabledListsCount();
    const totalCount = await helper.getTotalListsCount();
    
    expect(enabledCount, 'Enabled count should be less than or equal to total').toBeLessThanOrEqual(totalCount);
    expect(enabledCount, 'Should have at least one enabled list').toBeGreaterThan(0);
  });
});