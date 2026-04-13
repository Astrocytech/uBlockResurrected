# Debug Plan: Context Menu Element Picker

## Problem Summary

When user right-clicks on a page element and selects "Block element...", the picker UI fails to activate. The epicker.js script fails to load due to CSP restrictions.

## Known Symptoms

1. Error: `[MV3-CS] epicker.js failed to load: [object Event]`
2. The script is being injected via DOM (document.createElement('script')) which triggers CSP violation
3. Multiple attempts to fix via different injection methods have failed

## Root Cause Hypotheses

1. **CSP Blocking DOM Script Injection** (HIGH CONFIDENCE)
   - Content script creates a `<script>` tag and appends to DOM
   - Page CSP blocks loading of extension URLs via this method
   - chrome.runtime.getURL() generates extension:// URL which fails CSP

2. **chrome.scripting.executeScript In Page Context Not Available** (HIGH CONFIDENCE)
   - chrome.scripting.executeScript injects into isolated world, not page context
   - The injected script cannot be accessed by page scripts but doesn't trigger CSP either
   - However, the script needs vAPI which is in content script context

3. **MV3 Messaging Timing Issue** (MEDIUM)
   - Message sent before content script is ready to receive
   - Connection closed before response

## Attempt History

### Attempt 1: Direct sendMessage

- Action: Send pickerActivate directly via chrome.tabs.sendMessage
- Result: "Could not establish connection. Receiving end does not exist"
- Reason: Content script not ready / message port closed

### Attempt 2: Add return true to message listener

- Action: Added `return true` to content script onMessage handler for async response
- Result: Still connection error
- Reason: Content script still not receiving messages properly

### Attempt 3: Inject all scripts via scripting API

- Action: Inject vapi.js, vapi-client.js, contentscript.js via chrome.scripting.executeScript
- Result: Connection error persisted
- Reason: Scripting API injection may not register with message system properly

### Attempt 4: Inject via DOM with chrome.runtime.getURL

- Action: Use chrome.runtime.getURL('/js/scriptlets/epicker.js') in content script
- Result: CSP blocked - "script-src 'self' 'wasm-unsafe-eval'..."
- Reason: Page CSP blocks extension URLs injected via DOM script tag

### Attempt 5: Remove injectEpickerScript call

- Action: Remove DOM injection from content script, rely on SW injection
- Result: Still fails - no picker UI appears
- Reason: epicker.js injected into isolated world cannot communicate properly

### Attempt 6 (CURRENT): Remove content script DOM injection

- Action: Content script no longer tries to inject via DOM - SW does injection via scripting API
- Result: Still fails
- Reason: Scripting API injects into isolated world, not accessible to page for UI

## Current Plan

The core issue is that epicker.js needs to run in the PAGE context (not isolated world) to create the iframe and interact with page DOM, but pages have CSP that blocks extension scripts loaded via DOM.

**Solution: Use web_accessible_resources**

The proper MV3 way to inject scripts that need to interact with page DOM is:

1. Add epicker.js to web_accessible_resources in manifest.json
2. Use iframe with srcdoc or blob URL to load it
3. Alternatively, inject via the page's document itself using a different approach

However, the simpler fix may be to:

- Since epicker.js already checks for `vAPI` object, and vAPI is available in the content script's isolated world
- The issue is the script is loaded via DOM which triggers CSP
- Instead, we should use a different method to make the script available

**Next Actions:**

1. Add `/js/scriptlets/epicker.js` to web_accessible_resources in manifest.json
2. In content script, instead of creating script element, inject via chrome.runtime.getURL from web_accessible_resources
3. Verify the script runs properly

Actually, web_accessible_resources are accessible to page scripts via extension:// URLs - they are NOT blocked by CSP because they are served by the extension, not the page.

The current error shows the script URL being used is `chrome-extension://.../js/scriptlets/epicker.js` - this IS the extension URL. The issue is that when loaded via DOM script tag, the browser treats it as a page script and applies page CSP.

**Key Insight:** Files in web_accessible_resources can be loaded via `<iframe>` or other mechanisms that bypass CSP for extension resources. But `<script src="extension://...">` is still treated as a page script.

**Alternative Fix:** Instead of script tag, inject epicker.js code directly using chrome.scripting.executeScript with `world: 'PAGE'` - but this requires the PAGE_WORLD injection feature.

Let's try a different approach: Since the content script already has vAPI, we can dynamically import the epicker code as a string and eval() it in the content script context.
