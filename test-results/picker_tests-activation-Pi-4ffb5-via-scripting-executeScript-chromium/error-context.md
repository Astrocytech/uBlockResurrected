# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: picker_tests/activation.spec.ts >> Picker Activation >> Activation Flow >> should inject three files via scripting.executeScript
- Location: tests/picker_tests/activation.spec.ts:112:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
  28  |         context = testContext;
  29  |         helper = new PickerTestHelper(page, context);
  30  |         
  31  |         await helper.navigateToTestPage();
  32  |         await createMockPickerFrame(page);
  33  |     });
  34  | 
  35  |     test.afterEach(async () => {
  36  |         await removeMockPickerFrame(page);
  37  |     });
  38  | 
  39  |     test.describe('Activation Flow', () => {
  40  |         test('should create ubolOverlay singleton when activated', async () => {
  41  |             const beforeActivation = await page.evaluate(() => {
  42  |                 return (window as any).ubolOverlay === undefined;
  43  |             });
  44  |             expect(beforeActivation).toBe(true);
  45  | 
  46  |             await helper.activatePicker();
  47  | 
  48  |             const ubolOverlayExists = await page.evaluate(() => {
  49  |                 return (window as any).ubolOverlay !== undefined;
  50  |             });
  51  |             expect(ubolOverlayExists).toBe(true);
  52  |         });
  53  | 
  54  |         test('should generate unique secret attribute', async () => {
  55  |             await helper.activatePicker();
  56  | 
  57  |             const secretAttr = await page.evaluate(() => {
  58  |                 return (window as any).ubolOverlay?.secretAttr;
  59  |             });
  60  | 
  61  |             expect(secretAttr).toBeDefined();
  62  |             expect(secretAttr).toMatch(/^ubol-[a-z0-9-]+$/);
  63  |             expect(secretAttr.length).toBeGreaterThan(5);
  64  |         });
  65  | 
  66  |         test('should create picker iframe', async () => {
  67  |             await helper.activatePicker();
  68  |             
  69  |             const iframeExists = await page.locator(PICKER_SELECTORS.pickerFrame).count();
  70  |             expect(iframeExists).toBeGreaterThan(0);
  71  |         });
  72  | 
  73  |         test('should set iframe src to picker-ui.html for UI to load', async () => {
  74  |             await helper.activatePicker();
  75  | 
  76  |             const iframeSrc = await page.evaluate(() => {
  77  |                 const overlay = (window as any).ubolOverlay;
  78  |                 const frame = overlay?.frame as HTMLIFrameElement | null;
  79  |                 if (!frame) return null;
  80  |                 return frame.getAttribute('src');
  81  |             });
  82  | 
  83  |             expect(iframeSrc).toBeTruthy();
  84  |             expect(iframeSrc).toContain('picker-ui.html');
  85  |         });
  86  | 
  87  |         test('should initialize port for MessageChannel communication', async () => {
  88  |             await helper.activatePicker();
  89  | 
  90  |             const portExists = await page.evaluate(() => {
  91  |                 return (window as any).ubolOverlay?.port !== null;
  92  |             });
  93  |             expect(portExists).toBe(true);
  94  |         });
  95  | 
  96  |         test('should not create duplicate overlay on re-activation', async () => {
  97  |             await helper.activatePicker();
  98  | 
  99  |             const firstSecret = await page.evaluate(() => {
  100 |                 return (window as any).ubolOverlay?.secretAttr;
  101 |             });
  102 | 
  103 |             await helper.activatePicker();
  104 | 
  105 |             const secondSecret = await page.evaluate(() => {
  106 |                 return (window as any).ubolOverlay?.secretAttr;
  107 |             });
  108 | 
  109 |             expect(firstSecret).toBe(secondSecret);
  110 |         });
  111 | 
  112 |         test('should inject three files via scripting.executeScript', async () => {
  113 |             await helper.activatePicker();
  114 | 
  115 |             const cssApiLoaded = await page.evaluate(() => {
  116 |                 return typeof (window as any).ProceduralFiltererAPI !== 'undefined' ||
  117 |                        typeof (window as any).cssProceduralApi !== 'undefined';
  118 |             });
  119 | 
  120 |             const overlayLoaded = await page.evaluate(() => {
  121 |                 return (window as any).ubolOverlay !== undefined;
  122 |             });
  123 | 
  124 |             const pickerLoaded = await page.evaluate(() => {
  125 |                 return (window as any).pickerState !== undefined;
  126 |             });
  127 | 
> 128 |             expect(cssApiLoaded).toBe(true);
      |                                  ^ Error: expect(received).toBe(expected) // Object.is equality
  129 |             expect(overlayLoaded).toBe(true);
  130 |             expect(pickerLoaded).toBe(true);
  131 |         });
  132 |     });
  133 | 
  134 |     test.describe('Picker State', () => {
  135 |         test('should initialize with empty highlight state', async () => {
  136 |             await helper.activatePicker();
  137 | 
  138 |             const state = await helper.getPickerState();
  139 |             
  140 |             expect(state.highlightedElements).toEqual([]);
  141 |             expect(state.candidateCount).toBe(0);
  142 |         });
  143 | 
  144 |         test('should mark picker as active after activation', async () => {
  145 |             await helper.activatePicker();
  146 | 
  147 |             const state = await helper.getPickerState();
  148 |             expect(state.isActive).toBe(true);
  149 |         });
  150 | 
  151 |         test('should initialize with default slider position', async () => {
  152 |             await helper.activatePicker();
  153 | 
  154 |             const sliderPos = await helper.sliderPosition();
  155 |             expect(sliderPos).toBe(-1);
  156 |         });
  157 | 
  158 |         test('should start in minimized state', async () => {
  159 |             await helper.activatePicker();
  160 | 
  161 |             const minimized = await helper.isMinimized();
  162 |             expect(minimized).toBe(true);
  163 |         });
  164 | 
  165 |         test('should not be in preview mode initially', async () => {
  166 |             await helper.activatePicker();
  167 | 
  168 |             const preview = await helper.isPreviewMode();
  169 |             expect(preview).toBe(false);
  170 |         });
  171 | 
  172 |         test('should start with view state 0', async () => {
  173 |             await helper.activatePicker();
  174 | 
  175 |             const view = await helper.viewState();
  176 |             expect(view).toBe(0);
  177 |         });
  178 |     });
  179 | 
  180 |     test.describe('CSS Injection', () => {
  181 |         test('should have content script context available', async () => {
  182 |             await helper.activatePicker();
  183 | 
  184 |             const hasContext = await page.evaluate(() => {
  185 |                 return typeof document !== 'undefined' && typeof window !== 'undefined';
  186 |             });
  187 | 
  188 |             expect(hasContext).toBe(true);
  189 |         });
  190 | 
  191 |         test('should have access to DOM manipulation APIs', async () => {
  192 |             await helper.activatePicker();
  193 | 
  194 |             const hasAPIs = await page.evaluate(() => {
  195 |                 return {
  196 |                     hasDocument: typeof document !== 'undefined',
  197 |                     hasElementFromPoint: typeof document.elementFromPoint === 'function',
  198 |                     hasCreateElement: typeof document.createElement === 'function',
  199 |                     hasGetComputedStyle: typeof window.getComputedStyle === 'function',
  200 |                 };
  201 |             });
  202 | 
  203 |             expect(hasAPIs.hasDocument).toBe(true);
  204 |             expect(hasAPIs.hasElementFromPoint).toBe(true);
  205 |             expect(hasAPIs.hasCreateElement).toBe(true);
  206 |             expect(hasAPIs.hasGetComputedStyle).toBe(true);
  207 |         });
  208 |     });
  209 | 
  210 |     test.describe('Message Communication', () => {
  211 |         test('should have message handler registered', async () => {
  212 |             await helper.activatePicker();
  213 | 
  214 |             const handlerExists = await page.evaluate(() => {
  215 |                 return typeof (window as any).pickerMessageHandler === 'function';
  216 |             });
  217 | 
  218 |             expect(handlerExists).toBe(true);
  219 |         });
  220 | 
  221 |         test('should handle startTool message', async () => {
  222 |             await helper.activatePicker();
  223 | 
  224 |             await page.evaluate(() => {
  225 |                 const handler = (window as any).pickerMessageHandler;
  226 |                 if (handler) {
  227 |                     handler({ what: 'startTool' });
  228 |                 }
```