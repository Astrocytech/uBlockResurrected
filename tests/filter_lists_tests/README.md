# Filter Lists Tests

Playwright test suite for uBlock Resurrected Filter Lists tab (3p-filters.html).

## Test Status

- **Tests in development** - Based on Dashboard_filter_list.md acceptance criteria
- Tests cover all 18 acceptance criteria plus additional UI/visual tests

## Test Structure

```
tests/filter_lists_tests/
├── README.md                    # This file
├── helpers/
│   └── filter-lists-helper.ts   # Test utilities and helpers
├── fixtures/
│   └── test-page.html          # Test page for filter list testing
├── filter-list-display.spec.ts      # TC 1: Display all available lists
├── checkbox-state.spec.ts            # TC 2: Checkbox state reflects enabled lists
├── toggle-behavior.spec.ts           # TC 3: Toggle checkbox updates UI immediately
├── apply-changes.spec.ts             # TC 4: Apply changes saves to storage
├── filter-reload.spec.ts             # TC 5: Filters reload after apply
├── update-now.spec.ts                # TC 6: Update now triggers message
├── user-settings.spec.ts             # TC 7: User settings are saved
├── search-functionality.spec.ts      # TC 8: Search filters displayed lists
├── dnr-integration.spec.ts           # TC 9: DNR rules update after changes
├── first-time-setup.spec.ts          # TC 10: First-time users get defaults
├── cloud-storage-sync.spec.ts        # TC 11: Cloud storage push/pull
├── expanded-state.spec.ts            # TC 12: Expanded state persists
├── auto-update-on-load.spec.ts       # TC 13: Auto-update on page load
├── unsaved-changes.spec.ts           # TC 14: Unsaved changes detection
├── purge-cache.spec.ts               # TC 15: Purge cache functionality
├── import-custom-lists.spec.ts       # TC 16: Import custom filter lists
├── remove-filter-list.spec.ts        # TC 17: Remove/delete filter list
├── group-node-stats.spec.ts          # TC 18: Group stats update correctly
└── ui-visual.spec.ts                 # Additional: UI/visual tests
```

## Running Tests

### Run all filter list tests
```bash
npx playwright test filter_lists_tests/
```

### Run specific test file
```bash
npx playwright test filter_lists_tests/filter-list-display.spec.ts
```

### Run with UI (headed mode)
```bash
npx playwright test filter_lists_tests/ --headed
```

### Run specific test
```bash
npx playwright test --grep "should display all filter list groups"
```

### Run tests with trace viewer
```bash
npx playwright test --trace on
```

## Test Categories

### Filter List Display Tests (`filter-list-display.spec.ts`)
Based on Acceptance Criteria #1:
- Filter lists tab displays all available lists from `getAvailableLists()`
- All filter list groups displayed (user, default, ads, privacy, malware, etc.)
- Group headers show correct localized names
- User-filters entry appears under "User" group

### Checkbox State Tests (`checkbox-state.spec.ts`)
Based on Acceptance Criteria #2:
- Checkboxes reflect current enabled lists from `selectedFilterLists`
- Fresh install shows default lists checked
- Toggling list updates checkbox state

### Toggle Behavior Tests (`toggle-behavior.spec.ts`)
Based on Acceptance Criteria #3:
- Toggling checkbox updates UI state immediately
- Checkbox toggles immediately, `.checked` class added/removed
- Parent node toggles all children accordingly

### Apply Changes Tests (`apply-changes.spec.ts`)
Based on Acceptance Criteria #4:
- Clicking "Apply changes" saves selection to storage
- Button disabled when no changes made
- Button enabled when changes exist

### Filter Reload Tests (`filter-reload.spec.ts`)
Based on Acceptance Criteria #5:
- After apply, filters are reloaded via `loadFilterLists()`
- Filter count updates in header after reload

### Update Now Tests (`update-now.spec.ts`)
Based on Acceptance Criteria #6:
- Clicking "Update now" triggers `updateNow` message
- Spinner animation shows during update
- Button enabled when obsolete lists exist

### User Settings Tests (`user-settings.spec.ts`)
Based on Acceptance Criteria #7:
- Auto-update, suspend, parse cosmetic, ignore generic settings persist

### Search Functionality Tests (`search-functionality.spec.ts`)
Based on Acceptance Criteria #8:
- Search filters the displayed lists
- Clear search shows all lists

### DNR Integration Tests (`dnr-integration.spec.ts`)
Based on Acceptance Criteria #9:
- Broadcast system notifies DNR to update rules after changes
- DNR rules update when lists enabled/disabled

### First-Time Setup Tests (`first-time-setup.spec.ts`)
Based on Acceptance Criteria #10:
- Clean install triggers `autoSelectRegionalFilterLists()`

### Cloud Storage Sync Tests (`cloud-storage-sync.spec.ts`)
Based on Acceptance Criteria #11:
- Cloud sync push/pull filter list selection

### Expanded State Tests (`expanded-state.spec.ts`)
Based on Acceptance Criteria #12:
- Expanded/collapsed state persists across page reloads

### Auto-Update on Load Tests (`auto-update-on-load.spec.ts`)
Based on Acceptance Criteria #13:
- Auto-update triggers on page load when enabled

### Unsaved Changes Tests (`unsaved-changes.spec.ts`)
Based on Acceptance Criteria #14:
- `hasUnsavedData()` returns true when changes exist
- Warning on navigation/close when unsaved changes

### Purge Cache Tests (`purge-cache.spec.ts`)
Based on Acceptance Criteria #15:
- Clicking cache icon marks list for re-download

### Import Custom Lists Tests (`import-custom-lists.spec.ts`)
Based on Acceptance Criteria #16:
- Import custom filter list URLs works

### Remove Filter List Tests (`remove-filter-list.spec.ts`)
Based on Acceptance Criteria #17:
- Remove/delete filter list functionality works

### Group Node Stats Tests (`group-node-stats.spec.ts`)
Based on Acceptance Criteria #18:
- Group node stats update when children change

### UI/Visual Tests (`ui-visual.spec.ts`)
- Status icons display correctly
- Loading states show spinners
- Dark mode support

## Test Fixtures

The test page (`fixtures/test-page.html`) includes:
- Sample filter list data for testing
- Mock DOM structure matching 3p-filters.html

## Helper Utilities

`helpers/filter-lists-helper.ts` provides:
- `FilterListsTestHelper` - Main test helper class
- `FILTER_LIST_SELECTORS` - CSS selectors for filter list UI
- Navigation to filter lists tab
- Methods to interact with filter list UI

## Writing New Tests

### Basic test structure
```typescript
import { test, expect } from '@playwright/test';
import { FilterListsTestHelper } from './helpers/filter-lists-helper';

test.describe('Filter List Feature', () => {
    let helper: FilterListsTestHelper;

    test.beforeEach(async ({ page, context }) => {
        helper = new FilterListsTestHelper(page, context);
        await helper.navigateToFilterLists();
    });

    test('should display filter lists', async () => {
        // Test implementation
        await expect(helper.getFilterListContainer()).toBeVisible();
    });
});
```

### Key helper methods
- `navigateToFilterLists()` - Navigate to filter lists tab
- `getFilterListContainer()` - Get #lists element
- `getGroupHeaders()` - Get all group header elements
- `toggleFilterList(listKey)` - Toggle a specific filter
- `clickApplyButton()` - Click Apply changes button
- `clickUpdateButton()` - Click Update now button
- `searchLists(query)` - Enter search query

## Notes

- Tests run in mock extension context
- Full integration tests require actual extension runtime
- Tests verify UI behavior and state management