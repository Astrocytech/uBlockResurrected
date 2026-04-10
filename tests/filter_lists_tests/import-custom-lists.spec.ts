import { test, expect } from '@playwright/test';
import { FilterListsTestHelper, FILTER_LIST_SELECTORS } from './helpers/filter-lists-helper';

test.describe('Import Custom Lists (TC16)', () => {
  let helper: FilterListsTestHelper;

  test.beforeEach(async ({ page, context }) => {
    helper = new FilterListsTestHelper(page, context);
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
  });

  test('should expand import section', async () => {
    await helper.expandImportSection();
    await helper.page.waitForTimeout(200);
    
    const importEntry = helper.page.locator(FILTER_LIST_SELECTORS.listEntryImport);
    const isExpanded = await importEntry.evaluate(el => el.classList.contains('expanded'));
    expect(isExpanded, 'Import section should be expanded').toBe(true);
  });

  test('should show textarea when expanded', async () => {
    await helper.expandImportSection();
    await helper.page.waitForTimeout(200);
    
    const textarea = await helper.getImportTextarea();
    const isVisible = await textarea.isVisible();
    expect(isVisible, 'Textarea should be visible when expanded').toBe(true);
  });

  test('should accept valid URL in import textarea', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.page.waitForTimeout(100);
    
    const textarea = await helper.getImportTextarea();
    const value = await textarea.inputValue();
    expect(value, 'Should contain the imported URL').toContain('example.com');
  });

  test('should enable apply button after import', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.page.waitForTimeout(200);
    
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply button should be enabled after import').toBe(true);
  });

  test('should add imported list to custom group', async () => {
    await helper.expandImportSection();
    await helper.importCustomList('https://example.com/filters.txt');
    await helper.page.waitForTimeout(100);
    
    await helper.clickApplyButton();
    await helper.waitForUpdateComplete();
    
    await helper.navigateToFilterLists();
    await helper.waitForFilterListsLoaded();
    
    const customLists = helper.page.locator('.listEntry[data-key="custom"]');
    const isVisible = await customLists.isVisible().catch(() => false);
    expect(isVisible, 'Custom group should have imported list').toBe(true);
  });

  test('should import multiple URLs', async () => {
    await helper.expandImportSection();
    const textarea = await helper.getImportTextarea();
    await textarea.fill('https://example.com/filters.txt\nhttps://test.com/list.txt');
    await helper.page.waitForTimeout(100);
    
    const value = await textarea.inputValue();
    expect(value, 'Should contain multiple URLs').toContain('\n');
  });

  test('should validate external list URL format', async () => {
    await helper.expandImportSection();
    const textarea = await helper.getImportTextarea();
    await textarea.fill('invalid-url');
    await helper.page.waitForTimeout(100);
    
    const isEnabled = await helper.isApplyButtonEnabled();
    expect(isEnabled, 'Apply button should not be enabled for invalid URL').toBe(false);
  });

  test('should link to filter list documentation', async () => {
    await helper.expandImportSection();
    
    const wikiLink = helper.page.locator('.listEntry[data-role="import"] a.towiki');
    const href = await wikiLink.getAttribute('href');
    expect(href, 'Should have link to filter list documentation').toContain('github.com');
  });
});