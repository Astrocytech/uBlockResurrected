# Plan: uBlock Origin MV3 for Firefox

## Overview

Convert uBlock Origin from MV2 to MV3 for Firefox 128+, using service workers for the background context, with the goal of creating a code path that can also work in Chrome MV3.

---

## Current State

- **Current build**: MV2 with background page (`background.html`)
- **Manifest**: `platform/firefox/manifest.json` (MV2)
- **Background entry**: `src/js/start.js` (uses ES modules via `import`)
- **DNR support**: Already exists in code (`dnr-integration.js`, `blocker-core/adapters/dnr/`)
- **Firefox requirement**: 115.0 (needs upgrade to 128+)

---

## Key Technical Findings

### Firefox MV3 Support (as of Firefox 128+)
- **Background**: Uses `scripts` array (NOT service worker like Chrome)
- **ES Modules**: Supported natively in background scripts (unlike Chrome SW)
- **DNR**: Available since Firefox 113
- **webRequestBlocking**: Still available in MV3 (unlike Chrome)

### Cross-Browser Strategy
Since Firefox uses `scripts` and Chrome uses `service_worker`, we have two options:

1. **Single code path with manifest variants**: Use the same JS code, but different manifests
2. **Service worker for both**: Bundle JS into single file, use service worker in both

Given the user requested "service workers for Firefox", we'll use Option 2:
- Bundle all background JS into a single file using esbuild
- Use `service_worker` in Chrome manifest, `scripts` in Firefox manifest (both work in modern versions)
- This ensures maximum cross-browser compatibility

---

## Implementation Plan

### Phase 1: Manifest & Build System Setup

#### 1.1 Create Firefox MV3 Platform Directory
- Create `platform/firefox-mv3/`
- Copy `platform/firefox/manifest.json` and modify for MV3
- Copy `platform/firefox/webext.js` and `vapi-background-ext.js`

#### 1.2 MV3 Manifest Changes
```json
{
  "manifest_version": 3,
  "background": {
    "type": "module",
    "scripts": ["js/background.js"]
  },
  "action": { ... },  // replaces browser_action
  "permissions": [
    "alarms", "storage", "tabs", "activeTab",
    "declarativeNetRequest"  // replaces webRequestBlocking
  ],
  "host_permissions": ["<all_urls>"]
}
```

#### 1.3 Create Build Script
- Create `tools/make-firefox-mv3.sh`
- Use esbuild to bundle `src/js/start.js` → `dist/build/js/background.js`
- Copy MV3-specific files

### Phase 2: Service Worker Implementation

#### 2.1 Esbuild Configuration
- Bundle all ES modules into single `background.js`
- Add shims for missing globals (if needed)
- Handle module resolution

#### 2.2 Background Entry Point
- Modify or create entry point that works in service worker context
- Ensure all imports are resolved at build time

#### 2.3 API Compatibility Layer
- Ensure `browser` API works correctly
- Add shims for any missing Chrome/Firefox APIs

### Phase 3: DNR Integration (Network Filtering)

#### 3.1 Leverage Existing DNR Code
The codebase already has:
- `src/js/dnr-integration.js` - DNR integration module
- `src/js/blocker-core/adapters/dnr/index.js` - DNR adapter
- `src/js/static-net-filtering.js` - DNR rule compilation

#### 3.2 Update Manifest for DNR
- Add `declarativeNetRequest` permission
- Add `declarative_net_request` key with rule resources

#### 3.3 Filter Conversion
- Ensure filter-to-DNR rule conversion works
- Handle rule limits (300,000 max, batch in chunks of 30,000)

### Phase 4: Testing & Verification

#### 4.1 Build Verification
- Run `make firefox-mv3`
- Verify bundle size and contents

#### 4.2 Firefox Loading
- Load unpacked extension in Firefox 128+
- Check background script loads without errors

#### 4.3 Functional Tests
- Verify UI loads (popup, dashboard)
- Verify DNR rules are installed
- Verify blocking works

---

## File Changes Required

### New Files
| File | Purpose |
|------|---------|
| `platform/firefox-mv3/manifest.json` | MV3 manifest for Firefox |
| `platform/firefox-mv3/webext.js` | Firefox-specific WebExtension APIs |
| `platform/firefox-mv3/vapi-background-ext.js` | Background API extensions |
| `tools/make-firefox-mv3.sh` | Build script for MV3 |

### Modified Files
| File | Changes |
|------|---------|
| `Makefile` | Add `firefox-mv3` build target |
| `src/js/start.js` | May need adjustments for SW context |
| `src/js/dnr-integration.js` | May need adjustments |

### Bundling (esbuild)
- Input: `src/js/start.js`
- Output: `dist/build/js/background.js`
- Options: `bundle: true`, `format: 'iife'`, `minify: true`

---

## Build Commands

```bash
# Build Firefox MV3
make firefox-mv3

# Or run build script directly
bash tools/make-firefox-mv3.sh all
```

---

## Known Challenges

1. **Service worker lifecycle**: SW can be terminated after 30s of inactivity
   - Solution: Use alarms for periodic tasks, message passing for communication

2. **No DOM in service worker**: Some code may assume DOM presence
   - Solution: Add shims or ensure code checks for DOM availability
   - Note: Most DOM usage is in content scripts, not background

3. **DNR rule limits**: 300,000 rules max
   - Solution: Use session rules for dynamic filtering, static rules for blocklists

4. **ES modules in SW**: Chrome doesn't support ES modules in SW
   - Solution: Bundle all code (esbuild handles this)

5. **No webRequestBlocking in Chrome MV3**: DNR must handle all blocking
   - Solution: Already handled by existing DNR code

6. **Safari compatibility**: Safari uses different DNR API
   - Note: Out of scope for this phase

---

## Cross-Browser Path (Future)

Once Firefox MV3 works, adding Chrome MV3 support:

1. Create `platform/chromium-mv3/manifest.json` with Chrome-specific keys
2. Use same bundled JS (`background.js`)
3. May need minor API shims for Chrome-specific differences

---

## Timeline Estimate

| Phase | Task | Complexity |
|-------|------|------------|
| 1 | Manifest & build setup | Low |
| 2 | Service worker bundling | Medium |
| 3 | DNR integration | Medium |
| 4 | Testing & fixes | High |

Total estimated effort: 2-4 hours for basic MV3 build, additional time for full testing.

---

## Questions/Clarifications Needed

1. Should we require Firefox 128+ explicitly in manifest?
2. Should we keep MV2 build as fallback, or replace it entirely?
3. What's the priority: quick MV3 working, or full feature parity with current MV2?

---

## Additional Considerations (Post-Plan Review)

### Covered in Plan:
- ✅ Manifest version change (2 → 3)
- ✅ Background script changes (page → scripts/service_worker)
- ✅ browser_action → action
- ✅ Permissions changes (webRequestBlocking → declarativeNetRequest)
- ✅ host_permissions for URL access
- ✅ DNR integration
- ✅ Esbuild bundling for service worker
- ✅ Firefox version requirement (128+)
- ✅ Build script creation
- ✅ Makefile updates

### Not Previously Covered (Now Added):
- ✅ `sidebar_action` - This is MV2 only, not in MV3 spec
  - Solution: Use side panel API in MV3 or remove feature (REMOVED - not supported in MV3)
- ✅ `options_ui` → `options_page` in MV3
  - Solution: Already handled (dashboard.html) - not a breaking change
- ✅ `default_popup` changes - popup-fenix.html exists (use same file for MV3)
  - Solution: Use popup-fenix.html for MV3 (only popup file available)
- ✅ web_accessible_resources format change in MV3
  - Solution: Use new MV3 format with `resources` + `matches` + `use_dynamic_url`
- ✅ Content script changes - vapi-client.js may need updates for MV3 (checked - appears compatible)
- ✅ Incognito mode handling - different in MV3 (handled by `incognito: "split"`)
- ✅ Badge API changes - `browser.action.setBadgeText` vs `browser.browserAction`
  - Note: Uses vAPI.setIcon() abstraction which handles both APIs
- ✅ `webRequest` permission - Still needed for non-blocking operations
- ✅ Commands - Still supported in MV3
- ✅ Icons - Full SVG support confirmed
- ✅ gecko data_collection_permissions - Still supported in MV3
- ✅ Storage managed_schema - Needed for MV3 managed storage (NOT USED in uBO - not needed)
- ✅ Manifest version detection - Code already checks `browser.runtime.getManifest().manifest_version`
- ✅ gecko_android support - Keep in MV3 for Android Firefox
- ✅ Scripting API - Uses `browser.contentScripts` in Firefox (not `chrome.scripting`)
  - Note: `chrome.scripting` is Chrome-only; Firefox uses different API
- ✅ Firefox MV3 uses `background.scripts` (not `service_worker` like Chrome)
  - We can use ES modules natively in Firefox background scripts
  - For Chrome compatibility, we'll bundle with esbuild anyway