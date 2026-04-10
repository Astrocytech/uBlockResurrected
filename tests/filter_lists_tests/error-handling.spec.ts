import { test, expect } from '@playwright/test';
import { FilterListsTestHelper } from './helpers/filter-lists-helper';

const isIgnoredError = (msg: string) => {
  // Ignore file loading errors in test (loads from file:// path, not extension)
  if (msg.includes('net::ERR_FILE_NOT_FOUND')) return true;
  if (msg.includes('Failed to load resource')) return true;
  // Ignore test env missing browser APIs
  if (msg.includes("reading 'local'")) return true;
  if (msg.includes("reading 'then'")) return true;
  return false;
};

test.describe('Error Handling Tests', () => {
  test('Should have no console errors when loading Filter Lists', async ({ page, context }) => {
    const helper = new FilterListsTestHelper(page, context);
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error' && !isIgnoredError(msg.text())) {
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', err => {
      if (!isIgnoredError(err.message)) {
        errors.push(err.message);
      }
    });
    
    page.on('unhandledrejection', err => {
      if (!isIgnoredError(err.message)) {
        errors.push(err.message);
      }
    });
    
    await helper.navigateToFilterLists('src/3p-filters.html');
    await helper.waitForFilterListsLoaded();
    
    expect(errors, `No console errors should occur: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('Should have no console errors when applying changes', async ({ page, context }) => {
    const helper = new FilterListsTestHelper(page, context);
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error' && !isIgnoredError(msg.text())) {
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', err => {
      if (!isIgnoredError(err.message)) {
        errors.push(err.message);
      }
    });
    
    page.on('unhandledrejection', err => {
      if (!isIgnoredError(err.message)) {
        errors.push(err.message);
      }
    });
    
    await helper.navigateToFilterLists('src/3p-filters.html');
    await helper.waitForFilterListsLoaded();
    
    await helper.page.locator('#buttonApply').click({ force: true });
    await helper.page.waitForTimeout(1000);
    
    expect(errors, `No console errors should occur: ${errors.join('\n')}`).toHaveLength(0);
  });
});