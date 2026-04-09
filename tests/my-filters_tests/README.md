# My Filters Tests

This directory contains comprehensive end-to-end tests for the My Filters tab in the uBlock Resurrected dashboard.

## Test Structure

```
my-filters_tests/
├── helpers/
│   └── my-filters-helper.ts       # Test helper utilities
├── hostname-management.spec.ts    # Hostname-related tests (11 tests)
├── selector-management.spec.ts    # Selector-related tests (10 tests)
├── import-export.spec.ts          # Import/Export functionality tests (12 tests)
├── realtime-updates.spec.ts       # Real-time update tests (8 tests)
├── edge-cases.spec.ts             # Edge case and error handling tests (16 tests)
├── ui-interactions.spec.ts        # UI interaction tests (12 tests)
├── state-management.spec.ts       # State management tests (10 tests)
├── integration.spec.ts            # Integration tests (15 tests)
└── README.md                      # This file
```

## Running Tests

```bash
# Run all My Filters tests
npx playwright test my-filters_tests/

# Run specific test file
npx playwright test my-filters_tests/hostname-management.spec.ts

# Run with specific reporter
npx playwright test my-filters_tests/ --reporter=html
```

## Test Categories

### 1. Hostname Management (11 tests)
- Display empty state when no filters exist
- Load and display existing hostnames from storage
- Update hostname with valid input
- Reject invalid hostname and revert
- Transfer selectors from old to new hostname
- Extract hostname from DOM node
- Get all selectors for a hostname
- Remove all selectors when hostname trash clicked
- Restore all selectors when hostname undo clicked
- Validate correct hostnames
- Reject invalid hostnames

### 2. Selector Management (10 tests)
- Display selectors under correct hostname
- Update selector with valid CSS
- Reject invalid selector and revert
- Compile procedural filters correctly
- Store compiled selector in data-ugly
- Extract selector from DOM node
- Mark single selector as removed
- Restore single removed selector
- Return raw selector for plain CSS
- Extract raw from procedural JSON

### 3. Import/Export (12 tests)
- Parse cosmetic filters from text
- Create hostname and selectors from parsed filters
- Ignore non-cosmetic filters
- Import from textarea and clear it
- Open file picker and read file
- Import content from selected file
- Export filters as downloadable file
- Format as hostname##selector per line
- Handle multiple filters in one line
- Not duplicate existing filters on import
- Close import/export details after action
- Handle empty filter list for export

### 4. Real-time Updates (8 tests)
- Debounce re-renders
- Re-render when site.* keys change externally
- Merge DOM changes with storage data
- Extract current DOM state for merging
- Handle concurrent edits
- Update UI when filter removed from another source
- Preserve user edits during re-render
- Handle rapid storage changes

### 5. Edge Cases (16 tests)
- Handle empty input (revert)
- Handle punycode (IDN) conversion
- Handle malformed filter lines gracefully
- Handle empty text input
- Handle empty filter list for export
- Handle very long hostnames
- Handle special characters in selectors
- Handle duplicate hostname imports
- Handle subdomain filters
- Handle unicode selectors
- Handle selectors with quotes
- Handle very long selectors
- Handle whitespace-only input
- Handle comments in import text
- Handle global filters (no hostname)

### 6. UI Interactions (12 tests)
- Track focus for contenteditable elements
- Detect hostname vs selector changes
- Disable editing in readonly mode
- Disable editing for removed items
- Attach all event listeners on start
- Show/hide remove/undo buttons based on state
- Display correct FontAwesome icons
- Handle keyboard input in contenteditable
- Display hostname with proper styling
- Properly indent nested selectors
- Show hover effects on desktop
- Display textarea with placeholder

### 7. State Management (10 tests)
- Add readonly class during operations
- Remove readonly class after operations
- Add removed class to removed selectors
- Apply strikethrough style to removed items
- Handle multiple rapid state changes
- Maintain state during pane navigation
- Sync state with storage on load
- Handle state correctly after undo operation
- Apply opacity to readonly container
- Handle complex state transitions

### 8. Integration (15 tests)
- Load filters from background storage
- Persist new filters to background storage
- Remove filters from background storage
- Remove all filters for hostname from background
- Work with Picker-created filters
- Persist filters across dashboard reopen
- Handle multiple filter operations in sequence
- Update when storage changes externally
- Expose cloud data for sync
- Handle different filter types
- Handle large number of filters
- Properly escape special characters in storage
- Handle case sensitivity correctly
- Maintain filters after page refresh
- Handle concurrent modifications gracefully

## Test Data

Test filters are defined in `helpers/my-filters-helper.ts`:

```typescript
export const TEST_FILTERS = {
    valid: [
        'example.com##.ad-banner',
        'example.com##div[id="promo"]',
        'test.org##.sidebar-ad',
        'example.com##.popup-ad { display: none; }',
    ],
    invalid: [
        'invalid..hostname##.ad',
        '',
        '$$$invalid$$$',
    ],
    cosmetic: [
        'example.com##.ad-banner',
        'example.com###sponsored',
        'example.com##div[class*="ad-"]',
    ],
    procedural: [
        'example.com##.ad-banner:has(> img)',
        'example.com##div:style(display: none)',
    ],
    global: [
        '##.global-ad',
        '###popup',
    ],
};
```

## Helper Utilities

The `MyFiltersTestHelper` class provides:
- `navigateToDashboard()` - Navigate to dashboard page
- `switchToFiltersPane()` - Switch to filters tab
- `getHostnames()` - Get all hostnames from DOM
- `getSelectorsForHostname(hostname)` - Get selectors for a hostname
- `isReadonlyMode()` - Check readonly state
- `isSelectorRemoved(hostname, selector)` - Check if selector is removed
- `importFilter(text)` - Import filter via text
- `importFromFile(path)` - Import from file
- `getExportContent()` - Get export content
- `editHostname(old, new)` - Edit hostname inline
- `editSelector(hostname, old, new)` - Edit selector inline
- `removeSelector(hostname, selector)` - Remove a selector
- `undoRemoveSelector(hostname, selector)` - Undo remove
- And more...

## Dependencies

- `@playwright/test` - Test framework
- Dashboard HTML at `src/dashboard.html`
- CSS files in `src/css/`

## Notes

- Tests run against file:// protocol with local dashboard.html
- Mock storage is cleared before/after each test
- Tests verify both DOM state and storage state
- Real-time updates tested via storage event simulation
