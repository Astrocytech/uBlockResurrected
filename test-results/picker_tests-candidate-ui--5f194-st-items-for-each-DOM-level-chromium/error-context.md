# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: picker_tests/candidate-ui.spec.ts >> Picker Candidate UI >> Dialog Display >> should create list items for each DOM level
- Location: tests/picker_tests/candidate-ui.spec.ts:64:9

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - heading "Picker Test Page" [level=1] [ref=e2]
  - paragraph [ref=e3]: This page contains various elements for testing the picker functionality.
  - generic [ref=e4]:
    - heading "Simple Elements" [level=2] [ref=e5]
    - generic [ref=e6]: Simple div element
    - generic [ref=e7]: Simple span element
    - paragraph [ref=e8]: Simple paragraph element
  - generic [ref=e9]:
    - heading "Elements with ID" [level=2] [ref=e10]
    - generic [ref=e11]: Element with ID
  - generic [ref=e12]:
    - heading "Elements with Classes" [level=2] [ref=e13]
    - generic [ref=e14]: Element with class
    - generic [ref=e15]: Another element with class
    - generic [ref=e16]: Element with multiple classes
  - generic [ref=e17]:
    - heading "Elements with Data Attributes" [level=2] [ref=e18]
    - generic [ref=e19]: Element with data-testid
    - generic [ref=e20]: Element with data-attribute
  - generic [ref=e21]:
    - heading "Nested Elements" [level=2] [ref=e22]
    - generic [ref=e23]:
      - generic [ref=e24]: Outer container
      - generic [ref=e25]:
        - text: Inner element
        - generic [ref=e26]: Deeply nested element
  - generic [ref=e27]:
    - heading "Same Tag Elements" [level=2] [ref=e28]
    - generic [ref=e29]: Target one
    - generic [ref=e30]: Target two
    - generic [ref=e31]: Target three
  - generic [ref=e32]:
    - heading "Same Class Elements" [level=2] [ref=e33]
    - generic [ref=e34]: Same class one
    - generic [ref=e35]: Same class two
    - generic [ref=e36]: Same class three
  - generic [ref=e37]:
    - heading "List Elements" [level=2] [ref=e38]
    - list [ref=e39]:
      - listitem [ref=e40]: List item one
      - listitem [ref=e41]: List item two
      - listitem [ref=e42]: List item three
  - generic [ref=e43]:
    - heading "Clickable Elements" [level=2] [ref=e44]
    - generic [ref=e45] [cursor=pointer]: Click me
  - generic [ref=e46]:
    - heading "Anchor Elements" [level=2] [ref=e47]
    - link "Anchor link" [ref=e48] [cursor=pointer]:
      - /url: "#"
  - generic [ref=e49]:
    - heading "Image Elements" [level=2] [ref=e50]
    - img "Test image" [ref=e51]
  - generic [ref=e52]:
    - heading "Dynamic Content" [level=2] [ref=e53]
    - generic [ref=e54]: Dynamic content
  - generic [ref=e55]:
    - heading "Hidden Elements" [level=2] [ref=e56]
    - generic [ref=e57]: Visible element
  - iframe [ref=e58]:
    
```

# Test source

```ts
  1   | /**
  2   |  * Picker Candidate UI Tests
  3   |  * 
  4   |  * Tests for picker UI dialog:
  5   |  * - Dialog display on click
  6   |  * - Slider specificity adjustment
  7   |  * - Candidate parts toggle
  8   |  * - View toggle (More/Less)
  9   |  * - Element count display
  10  |  * - Raw textarea editing
  11  |  * 
  12  |  * Based on Picker.md Flow 3 (picker-ui.js)
  13  |  */
  14  | 
  15  | import { test, expect, type Page, type BrowserContext } from '@playwright/test';
  16  | import {
  17  |     PickerTestHelper,
  18  |     PICKER_SELECTORS,
  19  |     createMockPickerFrame,
  20  |     removeMockPickerFrame,
  21  | } from './helpers/picker-helper';
  22  | 
  23  | test.describe('Picker Candidate UI', () => {
  24  |     let page: Page;
  25  |     let context: BrowserContext;
  26  |     let helper: PickerTestHelper;
  27  | 
  28  |     test.beforeEach(async ({ page: testPage, context: testContext }) => {
  29  |         page = testPage;
  30  |         context = testContext;
  31  |         helper = new PickerTestHelper(page, context);
  32  |         
  33  |         await helper.navigateToTestPage();
  34  |         await createMockPickerFrame(page);
  35  |     });
  36  | 
  37  |     test.afterEach(async () => {
  38  |         await removeMockPickerFrame(page);
  39  |     });
  40  | 
  41  |     test.describe('Dialog Display', () => {
  42  |         test('should show dialog on element click', async () => {
  43  |             await helper.activatePicker();
  44  |             
  45  |             await helper.clickElement('#simple-div');
  46  |             
  47  |             const paused = await helper.isPaused();
  48  |             expect(paused).toBe(true);
  49  |         });
  50  | 
  51  |         test('should populate candidate list', async () => {
  52  |             await helper.activatePicker();
  53  |             
  54  |             await helper.triggerCandidatesAtPoint(100, 100);
  55  |             
  56  |             const hasCandidates = await page.evaluate(() => {
  57  |                 const list = document.querySelector('#candidateFilters ul');
  58  |                 return list && list.children.length > 0;
  59  |             });
  60  |             
  61  |             expect(hasCandidates).toBe(true);
  62  |         });
  63  | 
  64  |         test('should create list items for each DOM level', async () => {
  65  |             await helper.activatePicker();
  66  |             
  67  |             await helper.triggerCandidatesAtPoint(100, 100);
  68  |             
  69  |             const listItems = await page.evaluate(() => {
  70  |                 const list = document.querySelector('#candidateFilters ul');
  71  |                 return list?.children.length || 0;
  72  |             });
  73  |             
> 74  |             expect(listItems).toBeGreaterThan(0);
      |                               ^ Error: expect(received).toBeGreaterThan(expected)
  75  |         });
  76  | 
  77  |         test('should show element count', async () => {
  78  |             await helper.activatePicker();
  79  |             
  80  |             await helper.triggerCandidatesAtPoint(100, 100);
  81  |             
  82  |             const count = await helper.getElementCount();
  83  |             expect(count).toBeGreaterThan(0);
  84  |         });
  85  | 
  86  |         test('should display count in resultsetCount span', async () => {
  87  |             await helper.activatePicker();
  88  |             
  89  |             await helper.triggerCandidatesAtPoint(100, 100);
  90  |             
  91  |             const countText = await page.locator(PICKER_SELECTORS.resultsetCount).textContent();
  92  |             expect(countText).toBeTruthy();
  93  |         });
  94  |     });
  95  | 
  96  |     test.describe('Slider', () => {
  97  |         test('should initialize slider at highest specificity', async () => {
  98  |             await helper.activatePicker();
  99  |             
  100 |             await helper.triggerCandidatesAtPoint(100, 100);
  101 |             
  102 |             const sliderPos = await helper.sliderPosition();
  103 |             const sliderParts = await helper.getSliderParts();
  104 |             expect(sliderPos).toBe(sliderParts.length - 1);
  105 |         });
  106 | 
  107 |         test('should update position on slider change', async () => {
  108 |             await helper.activatePicker();
  109 |             
  110 |             await helper.triggerCandidatesAtPoint(100, 100);
  111 |             
  112 |             await page.locator(PICKER_SELECTORS.slider).fill('1');
  113 |             
  114 |             const newPos = await helper.sliderPosition();
  115 |             expect(newPos).toBe(1);
  116 |         });
  117 | 
  118 |         test('should update selected selector on slider change', async () => {
  119 |             await helper.activatePicker();
  120 |             
  121 |             await helper.triggerCandidatesAtPoint(100, 100);
  122 |             
  123 |             const initialSelector = await helper.getSelectedSelector();
  124 |             
  125 |             await page.locator(PICKER_SELECTORS.slider).fill('0');
  126 |             
  127 |             const newSelector = await helper.getSelectedSelector();
  128 |             expect(newSelector).not.toBe(initialSelector);
  129 |         });
  130 | 
  131 |         test('should match element count on slider change', async () => {
  132 |             await helper.activatePicker();
  133 |             
  134 |             await helper.triggerCandidatesAtPoint(100, 100);
  135 |             
  136 |             await page.locator(PICKER_SELECTORS.slider).fill('0');
  137 |             
  138 |             const newCount = await helper.getElementCount();
  139 |             expect(newCount).toBeGreaterThan(0);
  140 |         });
  141 | 
  142 |         test('should reflect slider max in sliderParts length', async () => {
  143 |             await helper.activatePicker();
  144 |             
  145 |             await helper.triggerCandidatesAtPoint(100, 100);
  146 |             
  147 |             const sliderMax = await page.evaluate(() => {
  148 |                 const slider = document.querySelector('#slider') as HTMLInputElement;
  149 |                 return parseInt(slider?.max || '0', 10);
  150 |             });
  151 |             
  152 |             const sliderParts = await helper.getSliderParts();
  153 |             expect(sliderMax).toBe(sliderParts.length - 1);
  154 |         });
  155 | 
  156 |         test('should select less specific selector at lower positions', async () => {
  157 |             await helper.activatePicker();
  158 |             
  159 |             await helper.triggerCandidatesAtPoint(100, 100);
  160 |             
  161 |             const lessSpecific = await page.evaluate(() => {
  162 |                 return (window as any).lessSpecificSelected === true;
  163 |             });
  164 |             
  165 |             expect(lessSpecific).toBe(true);
  166 |         });
  167 |     });
  168 | 
  169 |     test.describe('Candidate Parts Toggle', () => {
  170 |         test('should toggle part on click', async () => {
  171 |             await helper.activatePicker();
  172 |             
  173 |             await helper.triggerCandidatesAtPoint(100, 100);
  174 |             
```