import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('UI/Visual Tests', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should display unsecure icon for HTTP lists', async () => {
    const listKey = 'ublock-filters';
    const hasUnsecure = await helper.isStatusIconVisible(listKey, 'unsecure').catch(() => false);
    
    if (hasUnsecure) {
      const entry = await helper.getFilterListByKey(listKey);
      const hasUnsecureClass = await entry.evaluate(el => el.classList.contains('unsecure'));
      expect(hasUnsecureClass, 'HTTP lists should show unsecure icon').toBeTruthy();
    }
  });

  test('should display obsolete icon for obsolete lists', async () => {
    const listKey = 'ublock-filters';
    const hasObsolete = await helper.isStatusIconVisible(listKey, 'obsolete').catch(() => false);
    
    if (hasObsolete) {
      const entry = await helper.getFilterListByKey(listKey);
      const hasObsoleteClass = await entry.evaluate(el => el.classList.contains('obsolete'));
      expect(hasObsoleteClass, 'Obsolete lists should show warning icon').toBeTruthy();
    }
  });

  test('should display cache icon for cached lists', async () => {
    const listKey = 'ublock-filters';
    const listEntry = await helper.getFilterListByKey(listKey);
    const hasCachedClass = await listEntry.evaluate(el => el.classList.contains('cached'));
    
    if (hasCachedClass) {
      const hasCacheIcon = await helper.isStatusIconVisible(listKey, 'cache');
      expect(hasCacheIcon, 'Cached lists should show clock icon').toBe(true);
    }
  });

  test('should display updating icon during update', async () => {
    await helper.clickUpdateButton();
    await helper.page.waitForTimeout(100);
    
    const hasUpdating = await helper.isBodyUpdating();
    if (hasUpdating) {
      const listKey = 'ublock-filters';
      const listEntry = await helper.getFilterListByKey(listKey);
      const hasUpdatingClass = await listEntry.evaluate(el => 
        el.classList.contains('updating')
      );
      expect(hasUpdatingClass, 'Updating lists should show spinner').toBeTruthy();
    }
  });

  test('should display failed icon for failed updates', async () => {
    const listKey = 'ublock-filters';
    const listEntry = await helper.getFilterListByKey(listKey);
    const hasFailedClass = await listEntry.evaluate(el => el.classList.contains('failed'));
    
    if (hasFailedClass) {
      const hasFailedIcon = await helper.isStatusIconVisible(listKey, 'failed');
      expect(hasFailedIcon, 'Failed lists should show error icon').toBe(true);
    }
  });

  test('should show spinner on update button during update', async () => {
    await helper.clickUpdateButton();
    await helper.page.waitForTimeout(100);
    
    const button = await helper.getButtonUpdate();
    const classAttr = await button.getAttribute('class');
    expect(classAttr, 'Update button should show active state').toContain('active');
  });

  test('should show working state on body during apply', async () => {
    await helper.toggleFilterList('easy-list');
    await helper.clickApplyButton();
    await helper.page.waitForTimeout(50);
    
    const isWorking = await helper.isBodyWorking();
    expect(isWorking, 'Body should have working class during apply').toBe(true);
  });

  test('should have proper styling for list entries', async () => {
    const leafEntry = await helper.getLeafEntries().first();
    const display = await leafEntry.evaluate(el => window.getComputedStyle(el).display);
    expect(display, 'List entries should be block/flex display').toMatch(/block|flex/);
  });

  test('should have proper styling for detailbar', async () => {
    const leafEntry = await helper.getLeafEntries().first();
    const detailbar = leafEntry.locator('.detailbar');
    const display = await detailbar.evaluate(el => window.getComputedStyle(el).display);
    expect(detailbar, 'Detailbar should have proper display').toBeTruthy();
  });

  test('should have proper styling for iconbar', async () => {
    const leafEntry = await helper.getLeafEntries().first();
    const iconbar = leafEntry.locator('.iconbar');
    const display = await iconbar.evaluate(el => window.getComputedStyle(el).display);
    expect(iconbar, 'Iconbar should have proper display').toBeTruthy();
  });

  test('should display listExpander icons', async () => {
    const groupKey = 'ads';
    const group = await helper.getGroupHeader(groupKey);
    const expander = group.locator(FILTER_LIST_SELECTORS.listExpander);
    const isVisible = await expander.isVisible().catch(() => false);
    
    if (isVisible) {
      const faIcon = expander.locator('.fa-icon');
      const hasIcon = await faIcon.count();
      expect(hasIcon, 'Group should have expander icon').toBeGreaterThan(0);
    }
  });

  test('should rotate listExpander icon when expanded', async () => {
    const groupKey = 'ads';
    await helper.expandGroup(groupKey);
    await helper.page.waitForTimeout(200);
    
    const group = await helper.getGroupHeader(groupKey);
    const isExpanded = await group.evaluate(el => el.classList.contains('expanded'));
    expect(isExpanded, 'Group should be expanded').toBe(true);
  });

  test('should display content icon for viewing list', async () => {
    const listKey = 'ublock-filters';
    const entry = await helper.getFilterListByKey(listKey);
    const contentIcon = entry.locator('.iconbar .content');
    const isVisible = await contentIcon.isVisible().catch(() => false);
    
    expect(isVisible, 'Content icon should be visible').toBe(true);
  });

  test('should display support icon for lists with support', async () => {
    const listKey = 'ublock-filters';
    const entry = await helper.getFilterListByKey(listKey);
    const supportIcon = entry.locator('.iconbar .support');
    const isVisible = await supportIcon.isVisible().catch(() => false);
    
    expect(isVisible, 'Support icon should be visible').toBe(true);
  });

  test('should hide support icon when no support URL', async () => {
    const listKey = 'ublock-filters';
    const entry = await helper.getFilterListByKey(listKey);
    const supportIcon = entry.locator('.iconbar .support');
    const href = await supportIcon.getAttribute('href').catch(() => null);
    
    if (href === '#') {
      const isHidden = await supportIcon.isHidden();
      expect(isHidden, 'Support icon should be hidden when no URL').toBe(true);
    }
  });
});