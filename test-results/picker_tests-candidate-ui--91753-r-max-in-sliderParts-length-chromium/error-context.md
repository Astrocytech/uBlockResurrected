# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: picker_tests/candidate-ui.spec.ts >> Picker Candidate UI >> Slider >> should reflect slider max in sliderParts length
- Location: tests/picker_tests/candidate-ui.spec.ts:142:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: -1
Received: 0
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
  74  |             expect(listItems).toBeGreaterThan(0);
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
> 153 |             expect(sliderMax).toBe(sliderParts.length - 1);
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
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
  175 |             const firstPart = await page.locator('#candidateFilters li span').first();
  176 |             await firstPart.click();
  177 |             
  178 |             const toggled = await page.evaluate(() => {
  179 |                 return (window as any).partToggled === true;
  180 |             });
  181 |             
  182 |             expect(toggled).toBe(true);
  183 |         });
  184 | 
  185 |         test('should update selector when part toggled', async () => {
  186 |             await helper.activatePicker();
  187 |             
  188 |             await helper.triggerCandidatesAtPoint(100, 100);
  189 |             
  190 |             const selectorUpdated = await page.evaluate(() => {
  191 |                 return (window as any).selectorUpdated === true;
  192 |             });
  193 |             
  194 |             expect(selectorUpdated).toBe(true);
  195 |         });
  196 | 
  197 |         test('should show full attribute when toggled on', async () => {
  198 |             await helper.activatePicker();
  199 |             
  200 |             await helper.triggerCandidatesAtPoint(100, 100);
  201 |             
  202 |             const fullShown = await page.evaluate(() => {
  203 |                 return (window as any).fullAttrShown === true;
  204 |             });
  205 |             
  206 |             expect(fullShown).toBe(true);
  207 |         });
  208 | 
  209 |         test('should show abbreviated attribute when toggled off', async () => {
  210 |             await helper.activatePicker();
  211 |             
  212 |             await helper.triggerCandidatesAtPoint(100, 100);
  213 |             
  214 |             const abbreviatedShown = await page.evaluate(() => {
  215 |                 return (window as any).abbreviatedShown === true;
  216 |             });
  217 |             
  218 |             expect(abbreviatedShown).toBe(true);
  219 |         });
  220 | 
  221 |         test('should toggle all parts in li when li clicked', async () => {
  222 |             await helper.activatePicker();
  223 |             
  224 |             await helper.triggerCandidatesAtPoint(100, 100);
  225 |             
  226 |             const allToggled = await page.evaluate(() => {
  227 |                 return (window as any).allPartsToggled === true;
  228 |             });
  229 |             
  230 |             expect(allToggled).toBe(true);
  231 |         });
  232 |     });
  233 | 
  234 |     test.describe('View Toggle (More/Less)', () => {
  235 |         test('should toggle view between 0, 1, 2', async () => {
  236 |             await helper.activatePicker();
  237 |             
  238 |             await page.locator('#moreOrLess span:first-of-type').click();
  239 |             
  240 |             let view = await helper.viewState();
  241 |             expect(view).toBe(1);
  242 |             
  243 |             await page.locator('#moreOrLess span:first-of-type').click();
  244 |             view = await helper.viewState();
  245 |             expect(view).toBe(2);
  246 |             
  247 |             await page.locator('#moreOrLess span:last-of-type').click();
  248 |             view = await helper.viewState();
  249 |             expect(view).toBe(1);
  250 |         });
  251 | 
  252 |         test('should wrap around at view 0', async () => {
  253 |             await helper.activatePicker();
```