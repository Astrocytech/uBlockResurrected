import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Remove Filter List (TC17)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should show remove icon for external lists', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const customEntry = helper.page.locator('.listEntry[data-key="custom"]');
    const removeIcon = customEntry.locator('.iconbar .remove');
    const isVisible = await removeIcon.isVisible().catch(() => false);
    
    expect(isVisible, 'Remove icon should be visible for custom lists').toBe(true);
  });

  test('should mark list for removal on click', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    await helper.markListForRemoval('example.com-filters');
    await helper.page.waitForTimeout(200);
    
    const listEntry = await helper.getFilterListByKey('example.com-filters');
    const hasToRemove = await listEntry.evaluate(el => el.classList.contains('toRemove'));
    expect(hasToRemove, 'List should be marked for removal').toBe(true);
  });

  test('should show strikethrough on marked for removal', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    await helper.markListForRemoval('example.com-filters');
    await helper.page.waitForTimeout(200);
    
    const listEntry = await helper.getFilterListByKey('example.com-filters');
    const hasStrikethrough = await listEntry.evaluate(el => {
      const nameEl = el.querySelector('.listname, .listName');
      const style = window.getComputedStyle(nameEl as Element);
      return style.textDecorationLine === 'line-through';
    });
    
    expect(hasStrikethrough, 'Should show strikethrough for removed list').toBe(true);
  });

  test('should hide checkbox for toRemove list', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    await helper.markListForRemoval('example.com-filters');
    await helper.page.waitForTimeout(200);
    
    const listEntry = await helper.getFilterListByKey('example.com-filters');
    const checkbox = listEntry.locator('.checkbox');
    const isHidden = await checkbox.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.visibility === 'hidden';
    });
    
    expect(isHidden, 'Checkbox should be hidden for toRemove list').toBe(true);
  });

  test('should enable apply button after marking for removal', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    await helper.markListForRemoval('example.com-filters');
    await helper.page.waitForTimeout(200);
    
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply button should be enabled after marking for removal').toBe(true);
  });

  test('should remove list from storage on apply', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    await helper.markListForRemoval('example.com-filters');
    await helper.page.waitForTimeout(200);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const listEntry = await helper.getFilterListByKey('example.com-filters');
    const isVisible = await listEntry.isVisible().catch(() => false);
    expect(isVisible, 'List should be removed after apply').toBe(false);
  });

  test('should cancel removal by re-toggling', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    await helper.markListForRemoval('example.com-filters');
    await helper.page.waitForTimeout(200);
    
    await helper.toggleFilterList('example.com-filters');
    await helper.page.waitForTimeout(200);
    
    const listEntry = await helper.getFilterListByKey('example.com-filters');
    const hasToRemove = await listEntry.evaluate(el => el.classList.contains('toRemove'));
    expect(hasToRemove, 'Should cancel removal after re-toggling').toBe(false);
  });
});