# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: picker_tests/activation.spec.ts >> Picker Activation >> Cross-Context Communication >> should use MessageChannel for content script to iframe communication
- Location: tests/picker_tests/activation.spec.ts:267:9

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
  229 |             });
  230 | 
  231 |             const state = await helper.getPickerState();
  232 |             expect(state.isActive).toBe(true);
  233 |         });
  234 | 
  235 |         test('should handle quitTool message', async () => {
  236 |             await helper.activatePicker();
  237 |             
  238 |             await createMockPickerFrame(page);
  239 | 
  240 |             await page.evaluate(() => {
  241 |                 const handler = (window as any).pickerMessageHandler;
  242 |                 if (handler) {
  243 |                     handler({ what: 'quitTool' });
  244 |                 }
  245 |             });
  246 | 
  247 |             await helper.waitForPickerInactive();
  248 | 
  249 |             const state = await helper.getPickerState();
  250 |             expect(state.isActive).toBe(false);
  251 |         });
  252 |     });
  253 | 
  254 |     test.describe('Cross-Context Communication', () => {
  255 |         test('should document three JavaScript contexts', async () => {
  256 |             await helper.activatePicker();
  257 | 
  258 |             const hasContentScriptContext = await page.evaluate(() => {
  259 |                 return (window as any).ubolOverlay !== undefined;
  260 |             });
  261 |             expect(hasContentScriptContext).toBe(true);
  262 | 
  263 |             const hasFrame = await page.locator('#ubol-picker-frame').count();
  264 |             expect(hasFrame).toBeGreaterThan(0);
  265 |         });
  266 | 
  267 |         test('should use MessageChannel for content script to iframe communication', async () => {
  268 |             await helper.activatePicker();
  269 | 
  270 |             const hasPort = await page.evaluate(() => {
  271 |                 const port = (window as any).ubolOverlay?.port;
  272 |                 return port instanceof MessagePort;
  273 |             });
  274 | 
> 275 |             expect(hasPort).toBe(true);
      |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  276 |         });
  277 |     });
  278 | });
  279 | 
  280 | export { test };
```