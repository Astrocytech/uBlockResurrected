import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Toggle Behavior (TC3)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should toggle checkbox immediately on click', async () => {
    const listKey = 'ublock-filters';
    const checkbox = await helper.getCheckboxForList(listKey);
    
    const wasChecked = await checkbox.isChecked();
    await checkbox.click();
    const nowChecked = await checkbox.isChecked();
    
    expect(nowChecked, 'Checkbox should toggle immediately').toBe(!wasChecked);
  });

  test('should add checked class on toggle', async () => {
    const listKey = 'ublock-filters';
    const entry = await helper.getFilterListByKey(listKey);
    
    await helper.toggleFilterList(listKey);
    
    const hasCheckedClass = await entry.evaluate(el => el.classList.contains('checked'));
    expect(hasCheckedClass, 'Entry should have checked class after toggle').toBe(true);
  });

  test('should remove checked class when unchecked', async () => {
    const listKey = 'ublock-filters';
    const entry = await helper.getFilterListByKey(listKey);
    const checkbox = await helper.getCheckboxForList(listKey);
    
    await checkbox.check();
    await entry.waitForSelector('.checked', { state: 'visible' });
    
    await checkbox.uncheck();
    const hasCheckedClass = await entry.evaluate(el => el.classList.contains('checked'));
    expect(hasCheckedClass, 'Entry should not have checked class after uncheck').toBe(false);
  });

  test('should toggle parent node and children together', async () => {
    const groupKey = 'ads';
    
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const groupEntry = await helper.getGroupHeader(groupKey);
    const checkbox = groupEntry.locator(FILTER_LIST_SELECTORS.checkbox);
    
    await checkbox.click();
    await helper.page.waitForTimeout(200);
    
    const isGroupChecked = await groupEntry.evaluate(el => el.classList.contains('checked'));
    expect(isGroupChecked, 'Group should be checked after clicking checkbox').toBe(true);
  });

  test('should update ancestor nodes when child changes', async () => {
    const groupKey = 'ads';
    const listKey = 'easy-list';
    
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    await helper.toggleFilterList(listKey);
    await helper.page.waitForTimeout(200);
    
    const groupEntry = await helper.getGroupHeader(groupKey);
    const hasCheckedClass = await groupEntry.evaluate(el => el.classList.contains('checked'));
    expect(hasCheckedClass, 'Parent group should update when child changes').toBe(true);
  });

  test('should handle partial check state for parent nodes', async () => {
    const groupKey = 'ads';
    
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const groupEntry = await helper.getGroupHeader(groupKey);
    const leafEntries = groupEntry.locator('.listEntry[data-role="leaf"]');
    const leafCount = await leafEntries.count();
    
    if (leafCount > 1) {
      const firstLeaf = leafEntries.first();
      const firstCheckbox = firstLeaf.locator(FILTER_LIST_SELECTORS.checkbox);
      await firstCheckbox.click();
      await helper.page.waitForTimeout(200);
      
      const hasPartialClass = await groupEntry.evaluate(el => 
        el.querySelector('.checkbox')?.classList.contains('partial')
      );
      expect(hasPartialClass, 'Parent should show partial state when some children checked').toBe(true);
    }
  });

  test('should not toggle root group entries', async () => {
    const userGroup = await helper.getGroupHeader('user');
    const isVisible = await userGroup.isVisible().catch(() => false);
    
    if (isVisible) {
      const checkbox = userGroup.locator(FILTER_LIST_SELECTORS.checkbox);
      await checkbox.click();
      await helper.page.waitForTimeout(100);
      
      const isStillVisible = await checkbox.isVisible();
      expect(isStillVisible, 'User group checkbox should not be toggled').toBe(false);
    }
  });
});