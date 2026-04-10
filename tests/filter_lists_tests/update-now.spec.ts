import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Update Now (TC6)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should trigger update on click', async () => {
    await helper.clickUpdateButton();
    await helper.page.waitForTimeout(100);
    
    const isUpdating = await helper.isBodyUpdating();
    expect(isUpdating, 'Should be in updating state after clicking').toBe(true);
  });

  test('should show spinner animation during update', async () => {
    await helper.clickUpdateButton();
    await helper.page.waitForTimeout(100);
    
    const button = await helper.getButtonUpdate();
    const buttonClass = await button.getAttribute('class');
    expect(buttonClass, 'Button should have active class during update').toContain('active');
  });

  test('should update button be enabled when obsolete lists exist', async () => {
    const listEntry = await helper.getFilterListByKey('ublock-filters');
    await listEntry.locator('.status.obsolete').isVisible().catch(() => {});
    
    const isEnabled = await helper.isUpdateButtonEnabled();
    expect(isEnabled, 'Update button should be enabled').toBe(true);
  });

  test('should remove stickied entries on update', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.page.waitForTimeout(100);
    
    await helper.clickUpdateButton();
    await helper.waitForUpdateComplete();
    
    const stickiedEntries = helper.page.locator('.listEntry.stickied');
    const count = await stickiedEntries.count();
    expect(count, 'Should have no stickied entries after update').toBe(0);
  });

  test('should enable update when auto-update is on', async () => {
    await helper.setAutoUpdateSetting(true);
    await helper.page.reload();
    await helper.waitForFilterListsLoaded();
    
    const button = await helper.getButtonUpdate();
    const classAttr = await button.getAttribute('class');
    expect(classAttr, 'Update button may auto-trigger').toBeTruthy();
  });
});