# Zapper Tests

Playwright test suite for uBlock Resurrected zapper feature.

## Test Structure

```
tests/zapper_tests/
├── README.md                    # This file
├── helpers/
│   └── zapper-helper.ts        # Test utilities and helpers
├── fixtures/
│   └── test-page.html          # HTML page with test elements
├── activation.spec.ts          # Zapper activation tests
├── highlight.spec.ts           # Element highlighting tests
├── removal.spec.ts             # Element removal tests
├── close.spec.ts               # Zapper close/quit tests
└── scroll-lock.spec.ts          # Scroll lock detection tests
```

## Running Tests

### Run all zapper tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test activation.spec.ts
```

### Run with UI (headed mode)
```bash
npx playwright test --headed
```

### Run specific test
```bash
npx playwright test --grep "should highlight element on hover"
```

### Run tests with trace viewer
```bash
npx playwright test --trace on
```

## Test Categories

### Activation Tests (`activation.spec.ts`)
- Popup to content script communication
- Iframe creation
- State initialization
- Message channel setup
- Cross-context communication verification

### Highlight Tests (`highlight.spec.ts`)
- Desktop hover highlighting
- Touch highlighting (mobile)
- SVG overlay path updates
- Secret attribute technique
- Bypassing pointer-events: none
- Element filtering (offscreen, non-Element nodes)

### Removal Tests (`removal.spec.ts`)
- Click to remove elements
- Delete/Backspace key removal
- Undo functionality (LIFO stack)
- zapElementAtPoint function
- DOM state after removal
- Edge cases (rapid removal, null elements)

### Close Tests (`close.spec.ts`)
- ESC key to close
- QUIT button click
- State cleanup
- Dual handler verification (content script + iframe backup)

### Scroll Lock Tests (`scroll-lock.spec.ts`)
- Fixed position detection
- High z-index detection
- Overflow hidden restoration
- Modal overlay handling
- Shadow DOM elements
- Combined scenarios

## Test Fixtures

The test page (`fixtures/test-page.html`) includes:
- Simple removable elements (div, span, paragraph)
- Nested elements for parent highlighting
- Fixed position elements
- High z-index elements
- Modal overlays with overflow hidden
- Elements with data attributes for targeting
- Shadow DOM containers
- List items for batch testing
- Overflow hidden containers

## Helper Utilities

`helpers/zapper-helper.ts` provides:
- `ZapperTestHelper` - Main test helper class
- `ZAPPER_SELECTORS` - CSS selectors for zapper UI elements
- `createMockZapperFrame()` - Create mock zapper iframe
- `removeMockZapperFrame()` - Remove mock zapper iframe

## Writing New Tests

### Basic test structure
```typescript
import { test, expect } from '@playwright/test';
import { ZapperTestHelper, ZAPPER_SELECTORS } from './helpers/zapper-helper';

test.describe('My Feature', () => {
    let helper: ZapperTestHelper;

    test.beforeEach(async ({ page, context }) => {
        helper = new ZapperTestHelper(page, context);
        await helper.navigateToTestPage();
        await helper.activateZapper();
    });

    test('should do something', async () => {
        // Test implementation
        await helper.hoverOver('#my-element');
        // assertions...
    });
});
```

### Key helper methods
- `activateZapper()` - Activate zapper
- `hoverOver(selector)` - Hover over element
- `clickElement(selector)` - Click element
- `pressKey(key)` - Press keyboard key
- `getZapperState()` - Get current zapper state
- `elementExists(selector)` - Check element exists
- `waitForZapperActive()` - Wait for zapper to be active
- `waitForZapperInactive()` - Wait for zapper to close

## Debugging Tests

### Check zapper state
```typescript
const state = await helper.getZapperState();
console.log(state);
```

### Inspect undo stack
```typescript
const stack = await page.evaluate(() => window.zapperUndoStack);
console.log(stack);
```

### Check removed elements
```typescript
const removed = await page.evaluate(() => window.removedElements);
console.log(removed);
```

## Notes

- Tests use mock zapper frame since they run without full extension context
- In real extension, the zapper would run in actual content script and iframe contexts
- Mock simulates the basic behavior for unit testing
- Integration tests with actual extension would require loading the extension
