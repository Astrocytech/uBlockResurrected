# Dashboard Filter Lists UI - Technical Documentation

## Overview

The Filter Lists UI (Dashboard → "Filter lists" tab) allows users to:
- View all available filter lists (EasyList, uBlock filters, etc.)
- Enable/disable filter lists via checkboxes
- Apply changes to reload filters into the blocking engine
- Update filter lists from their remote sources
- Import custom filter lists via URL
- Search/filter the list of available filter lists

---

## File Structure

### Source Files

| File | Purpose |
|------|---------|
| `src/3p-filters.html` | HTML page structure with UI elements and templates |
| `src/js/3p-filters.ts` | Frontend JavaScript (TypeScript) for UI interactions |
| `src/js/messaging.ts` | Background message handlers |
| `src/js/storage.ts` | Filter list management and storage |

### Build Output

| File | Purpose |
|------|---------|
| `js/3p-filters-bundle.js` | Bundled frontend code for HTML page |
| `js/vapi.js` | Core API (loaded by HTML) |
| `js/vapi-common.js` | Common utilities |
| `js/vapi-client.js` | Client messaging wrapper |
| `js/i18n-bundle.js` | Internationalization |
| `js/dashboard-common-bundle.js` | Shared dashboard code |
| `js/cloud-ui.js` | Cloud sync UI |

---

## HTML Structure (3p-filters.html)

### Basic Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1">
  <meta name="color-scheme" content="light dark" />
  <title>uBlock — Filter lists</title>
  <link rel="stylesheet" type="text/css" href="css/themes/default.css">
  <link rel="stylesheet" type="text/css" href="css/common.css">
  <link rel="stylesheet" type="text/css" href="css/fa-icons.css">
  <link rel="stylesheet" type="text/css" href="css/dashboard-common.css">
  <link rel="stylesheet" type="text/css" href="css/cloud-ui.css">
  <link rel="stylesheet" type="text/css" href="css/3p-filters.css">
</head>
<body>
  <div class="body">
    
    <!-- Action buttons -->
    <p id="actions">
      <button id="buttonApply" ...>Apply changes</button>
      <button id="buttonUpdate" ...>Update now</button>
    </p>
    
    <!-- Settings checkboxes -->
    <div>
      <label><input type="checkbox" id="autoUpdate">Auto-update</label>
      <label><input type="checkbox" id="suspendUntilListsAreLoaded">Suspend until loaded</label>
      <label><input type="checkbox" id="parseCosmeticFilters">Parse cosmetic filters</label>
      <label><input type="checkbox" id="ignoreGenericCosmeticFilters">Ignore generic cosmetic</label>
    </div>
    
    <!-- Filter lists container -->
    <div id="lists">
      <div class="rootstats expandable" data-key="*">All lists stats</div>
      <div class="searchfield"><input type="search" placeholder="Search..."></div>
      <div class="listEntries"></div>  <!-- Filter lists rendered here -->
      <div class="listEntry expandable" data-role="import">
        <span class="detailbar">
          <label><span class="fa-icon listExpander">angle-up</span><span class="listname" data-i18n="3pImport"></span></label>
          <a class="fa-icon info towiki" href="...">info-circle</a>
        </span>
        <textarea placeholder="3pExternalListsHint"></textarea>
      </div>
    </div>
  </div>
  
  <!-- Templates for filter list entries -->
  <div id="templates" style="display: none;">
    <div class="listEntries"></div>
    <div class="li listEntry" data-role="leaf">
      <span class="detailbar">
        <label><span class="input checkbox"><input type="checkbox"></span><span class="listname forinput"></span></label>
        <span class="iconbar">
          <a class="fa-icon content" href="#">eye-open</a>
          <a class="fa-icon support" href="#">home</a>
          <span class="fa-icon remove">trash-o</span>
          <a class="fa-icon mustread" href="#">info-circle</a>
          <span class="fa-icon status unsecure">unlock-alt</span>
          <span class="fa-icon status obsolete">exclamation-triangle</span>
          <span class="fa-icon status cache">clock-o</span>
          <span class="fa-icon status updating">spinner</span>
          <span class="fa-icon status failed">unlink</span>
        </span>
        <span class="leafstats"></span>
      </span>
    </div>
    <div class="li listEntry expandable" data-role="node">
      <span class="detailbar">
        <label><span class="input checkbox"><input type="checkbox"></span><span class="listname forinput"></span></label>
        <span class="nodestats"></span>
        <span class="fa-icon listExpander">angle-up</span>
        <span class="iconbar">...</span>
        <span class="leafstats"></span>
      </span>
    </div>
    <div class="li listEntry expandable" data-parent="root" data-role="node">
      <span class="detailbar">
        <label><span class="fa-icon listExpander">angle-up</span><span class="listname"></span></label>
        <span class="nodestats"></span>
      </span>
    </div>
  </div>
  </div>
  
  <!-- Scripts -->
  <script src="js/vapi.js"></script>
  <script src="js/vapi-common.js"></script>
  <script src="js/vapi-client.js"></script>
  <script src="js/fa-icons-bundle.js"></script>
  <script src="js/i18n-bundle.js"></script>
  <script src="js/dashboard-common-bundle.js"></script>
  <script src="js/cloud-ui.js"></script>
  <script src="js/3p-filters-bundle.js" type="module"></script>
</body>
```

### Key HTML Elements

| Element ID/Class | Purpose |
|-----------------|---------|
| `#cloudWidget` | Cloud sync widget container |
| `#actions` | Container for action buttons (Apply, Update) |
| `#buttonApply` | Apply changes button - saves selection and reloads filters |
| `#buttonUpdate` | Update now button - updates all lists from sources |
| `#autoUpdate` | Checkbox for auto-updating filter lists |
| `#suspendUntilListsAreLoaded` | Checkbox to block before lists load |
| `#parseCosmeticFilters` | Checkbox for parsing cosmetic (element hiding) filters |
| `#ignoreGenericCosmeticFilters` | Checkbox to ignore generic cosmetic filters |
| `#lists` | Container for all filter list entries |
| `#listsOfBlockedHostsPrompt` | Stats display showing total filter counts |
| `.rootstats` | Root statistics element (clickable to expand all) |
| `.searchfield` | Search input container |
| `.listEntry[data-role="leaf"]` | Template for individual filter list |
| `.listEntry[data-role="node"]` | Template for group of lists |
| `.listEntry[data-role="import"]` | Import custom lists section |
| `.searchfield input` | Search/filter input |
| `#templates` | Hidden templates for creating list entries |

---

## Frontend JavaScript (3p-filters.ts)

### Constants and Global Variables

| Constant/Variable | Type | Purpose |
|-----------------|------|---------|
| `lastUpdateTemplateString` | string | i18n template for "Last updated X ago" |
| `obsoleteTemplateString` | string | i18n string for obsolete list warning |
| `reValidExternalList` | RegExp | Pattern to validate external list URLs |
| `recentlyUpdated` | number | Time in ms (1 hour) to consider list recently updated |
| `listsetDetails` | object | Global state holding all filter list data |
| `filteringSettingsHash` | string | Hash of current settings for change detection |
| `perListHaystack` | WeakMap | Cache for search matching text per list |
| `expandedListSet` | Set | Set of expanded group keys |
| `listStatsTemplate` | string | i18n template for list stats (e.g., "X/Y filters") |

### Key Functions

#### 1. `renderFilterLists()`
- **Purpose**: Fetches filter lists from background and renders them to the DOM
- **Flow**:
  1. Sends `getLists` message to background
  2. Receives available lists, cache metadata, current selection, user settings
  3. Builds tree structure of filter lists grouped by category
     - Uses `groupKeys` array: `['user','default','ads','privacy','malware','multipurpose','cookies','social','annoyances','regions','unknown','custom']`
     - Creates `listTree` object organizing lists by group
     - Handles nested lists via `parent` property (e.g., "ads|easylist")
  4. Creates DOM elements from templates using `createListEntry()` and `createListEntries()`
  5. Appends to `#lists .listEntries`
  6. Sets checkbox states based on `current` (enabled lists)
  7. Calls `renderWidgets()` to update button states
- **Called**: On page load, on `staticFilteringDataChanged` broadcast

#### 2. `selectFilterLists()`
- **Purpose**: Collects enabled/disabled lists from UI and sends to background
- **Flow**:
  1. Gets all checkboxes from `.listEntry[data-role="leaf"]`
  2. Builds `toSelect` array (enabled lists)
  3. Builds `toRemove` array (marked for removal)
  4. Gets imported lists from textarea
  5. Sends `applyFilterListSelection` message with arrays
- **Called**: By Apply button and Update button handlers

#### 3. `buttonApplyHandler()`
- **Purpose**: Handles Apply button click
- **Flow**:
  1. Calls `selectFilterLists()` to save selection
  2. Adds `working` class to body (shows spinner)
  3. Removes `stickied` class from list entries
  4. Sends `reloadAllFilters` message to reload filters
  5. Removes `working` class
- **Called**: When `#buttonApply` clicked

#### 4. `buttonUpdateHandler()`
- **Purpose**: Handles Update button click
- **Flow**:
  1. Calls `selectFilterLists()` to save selection first
  2. Adds `updating` class to body
  3. Sends `updateNow` message to trigger update
- **Called**: When `#buttonUpdate` clicked

#### 5. `toggleFilterList(elem, on, ui)`
- **Purpose**: Handle checkbox toggle for a filter list
- **Flow**:
  1. Gets associated list entry element
  2. Sets checkbox and `checked` class
  3. If parent node has all children unchecked, uncheck parent
  4. Updates ancestor node stats
  5. Calls `onFilteringSettingsChanged()` to update hash
- **Called**: When checkbox changes on a list entry

#### 6. `searchFilterLists()`
- **Purpose**: Filter visible lists based on search text
- **Flow**:
  1. Gets search pattern from input
  2. Toggles `searchMode` class on `#lists`
  3. For each leaf entry, tests pattern against title, group, tags
  4. Adds/removes `searchMatch` class accordingly
  5. Updates ancestor nodes to reflect matches
- **Called**: On search input change

### Event Handlers

| Event | Handler | Action |
|-------|---------|--------|
| `#buttonApply` click | `buttonApplyHandler` | Apply changes |
| `#buttonUpdate` click | `buttonUpdateHandler` | Update lists |
| `#lists .listEntry > .detailbar input` change | `onListsetChanged` | Toggle list enabled |
| `.searchfield input` input | `searchFilterLists` | Search filter lists |
| `#autoUpdate` change | `userSettingCheckboxChanged` | Save auto-update setting |
| `#suspendUntilListsAreLoaded` change | `userSettingCheckboxChanged` | Save suspend setting |
| `#parseCosmeticFilters` change | `userSettingCheckboxChanged` | Save parse cosmetic setting |
| `#ignoreGenericCosmeticFilters` change | `userSettingCheckboxChanged` | Save ignore cosmetic setting |
| `#lists` click on `.cache` | `onPurgeClicked` | Purge list cache |
| `#lists` click on `.remove` | `onRemoveExternalList` | Mark external list for removal |
| `#listsOfBlockedHostsPrompt` click | `toggleListExpansion('*')` | Expand/collapse all |
| `#lists` click on `.listExpander` | (anonymous) | Toggle individual group expand/collapse |
| `#lists` click on `[data-role="import"] .listname` | (anonymous) | Toggle import section |
| `#lists` click on `[data-parent="root"] > .detailbar .listname` | (anonymous) | Toggle root group expansion |
| `#lists` click on `.nodestats` | (anonymous) | Toggle group expansion |

### Local Storage - Expanded List State
- **Purpose**: Remember which filter list groups are expanded/collapsed
- **Flow**:
  1. On init, read `expandedListSet` from localStorage via `vAPI.localStorage.getItemAsync()`
  2. Call `applyListExpansion(listkeys)` to restore expanded state
- **Called**: On page load

### Auto-Update on Load
- **Purpose**: Automatically update lists when page loads if auto-update is enabled
- **Flow**:
  1. After `renderFilterLists()` completes
  2. Check if `#buttonUpdate` is not active and not disabled
  3. Check if `listsetDetails.autoUpdate === true`
  4. If all true, call `buttonUpdateHandler()` to trigger automatic update
- **Called**: After renderFilterLists() completes

### Cloud Storage Integration

The Filter Lists UI integrates with cloud sync for settings backup:

#### `self.cloud.onPush()`
- **Purpose**: Push current filter list settings to cloud storage
- **Returns**: Object containing:
  - `parseCosmeticFilters`: Current checkbox state
  - `ignoreGenericCosmeticFilters`: Current checkbox state  
  - `selectedLists`: Array of enabled list keys (from `.listEntry.checked[data-role="leaf"]`)

#### `self.cloud.onPull(data, append)`
- **Purpose**: Apply filter list settings from cloud storage
- **Flow**:
  1. Update `#parseCosmeticFilters` and `#ignoreGenericCosmeticFilters` checkboxes
  2. For each leaf entry, call `toggleFilterList()` based on cloud data
  3. If URL-like list keys remain in set, add to import textarea
  4. Call `renderWidgets()` to update UI state

### Unsaved Changes Detection

#### `self.hasUnsavedData()`
- **Purpose**: Check if user has unsaved changes before leaving page
- **Returns**: `true` if `hashFromCurrentFromSettings() !== filteringSettingsHash`
- **Used by**: Dashboard to show unsaved changes indicator and prevent accidental navigation

### Broadcast Listeners

| Message | Handler | Action |
|---------|---------|--------|
| `assetUpdated` | `updateAssetStatus` | Update single list status |
| `assetsUpdated` | (anonymous) | Remove updating class, render widgets |
| `staticFilteringDataChanged` | `renderFilterLists` | Re-render filter lists |

---

## Backend Message Handlers (messaging.ts)

### Message: `getLists`
- **Purpose**: Returns all filter list data for the UI
- **Response contains**:
  - `available`: All available filter lists from `µb.getAvailableLists()`
  - `cache`: Cache metadata from `io.metadata()`
  - `current`: Currently enabled lists from `µb.availableFilterLists`
  - `autoUpdate`: User setting
  - `parseCosmeticFilters`: User setting
  - `ignoreGenericCosmeticFilters`: User setting
  - `suspendUntilListsAreLoaded`: User setting
  - `netFilterCount`: Number of network filters loaded
  - `cosmeticFilterCount`: Number of cosmetic filters loaded
  - `isUpdating`: Whether lists are currently being updated
  - `userFiltersPath`: Path to user filters (e.g., "user-filters")
- **Helper function**: `prepListEntries(entries)` - Processes list entries to:
  - Extract support name from supportURL or homeURL
  - Generate supportURL from homeURL if needed
  - Generate supportName using hostnameFromURI
  - Called on both `available` and `cache` before returning
- **Note**: `netFilterCount` and `cosmeticFilterCount` come from `staticNetFilteringEngine.getFilterCount()` and `cosmeticFilteringEngine.getFilterCount()`

### Message: `applyFilterListSelection`
- **Purpose**: Saves filter list selection to storage
- **Request contains**:
  - `toSelect`: Array of list keys to enable
  - `toImport`: Custom filter list URLs to import
  - `toRemove`: Array of list keys to remove
- **Handler**: `µb.applyFilterListSelection(request)`

### Message: `reloadAllFilters`
- **Purpose**: Reloads all filter lists from storage
- **Handler**: `µb.loadFilterLists()` + callback

### Message: `updateNow`
- **Purpose**: Updates all filter lists from their sources
- **Handler**: `µb.scheduleAssetUpdater({ now: true, fetchDelay: 100, auto: true })`
- **Note**: Schedules immediate update of all enabled filter lists

### Message: `listsUpdateNow`
- **Purpose**: Updates specific filter lists (selected in UI)
- **Request contains**:
  - `assetKeys`: Array of specific list keys to update
  - `preferOrigin`: Boolean to prefer original source
- **Handler**: 
  1. Purge each asset key from cache (`io.purge(assetKey)`)
  2. Schedule asset updater with specific lists
- **Called by**: Update button when clicking on individual list update icons

### Message: `userSettings`
- **Purpose**: Saves user settings changes
- **Request contains**:
  - `name`: Setting name (e.g., "autoUpdate")
  - `value`: Setting value

### Message: `writeUserFilters`
- **Purpose**: Saves user filter text and optionally enables/disables user filters
- **Request contains**:
  - `content`: The user filter text
  - `enabled`: Boolean - whether to enable user filters
  - `trusted`: Boolean - whether filters are trusted
- **Handler**:
  1. If `enabled`, call `applyFilterListSelection({ toSelect: [userFiltersPath], merge: true })`
  2. If not `enabled`, call `applyFilterListSelection({ toRemove: [userFiltersPath] })`
  3. Update userSettings with `userFiltersTrusted` flag
  4. Call `saveUserFilters(content)` to persist

### Message: `readUserFilters`
- **Purpose**: Load user filter text and enabled state
- **Response contains**:
  - `content`: The user filter text
  - `enabled`: Boolean - whether user filters are enabled
  - `trusted`: Boolean - whether filters are marked as trusted
- **Handler**:
  1. Call `loadUserFilters()` to get content
  2. Check if `userFiltersPath` is in `selectedFilterLists` for enabled state
  3. Call `isTrustedList(userFiltersPath)` for trusted state

---

## Storage Functions (storage.ts)

### `µb.getAvailableLists()`
- **Purpose**: Returns all available filter lists from asset registry
- **Flow**:
  1. Create user filter list entry (`user-filters` with group "user")
  2. Add custom imported filter lists from `userSettings.importedLists`
  3. Load previously saved available lists from storage (`availableFilterLists`)
  4. Load badlists from `ublock-badlists` asset
  5. Get registered assets from `io.metadata()`
  6. Merge all into single available lists object
  7. Return object keyed by asset ID with list metadata
- **Also sets**: `µb.badLists` with known bad filter list URLs

### `µb.applyFilterListSelection(details)`
- **Purpose**: Updates the selected filter lists
- **Flow**:
  1. Start with current `selectedFilterLists`
  2. Add lists from `details.toSelect` (or replace if not merge mode)
  3. Remove lists from `details.toRemove`
  4. Process imported lists from `details.toImport`
  5. Save to storage via `saveSelectedFilterLists()`
- **Called by**: `applyFilterListSelection` message handler

### `µb.saveSelectedFilterLists(newKeys)`
- **Purpose**: Persists selected filter lists to browser storage
- **Flow**:
  1. Remove old lists from cache
  2. Update `selectedFilterLists` array
  3. Save to `browser.storage.local` with key `selectedFilterLists`

### `µb.loadSelectedFilterLists()`
- **Purpose**: Loads selected filter lists from storage
- **Flow**:
  1. Try to load from `selectedFilterLists` in storage
  2. If not found (first run), call `autoSelectRegionalFilterLists()` to get defaults
  3. Save the selected lists

### `µb.autoSelectRegionalFilterLists(lists)`
- **Purpose**: Selects appropriate default filter lists for the user's region/environment
- **Flow**:
  1. Always include `user-filters` (user's custom filters)
  2. Include all lists where `off !== true` (already enabled in assets.json)
  3. Add lists matching user's environment (language, region)
  4. Returns array of selected list keys

### `µb.loadFilterLists()`
- **Purpose**: Loads and compiles all selected filter lists
- **Flow**:
  1. Get list of selected lists from `selectedFilterLists`
  2. For each list, call `getCompiledFilterList()` to get compiled filters
  3. Call `applyCompiledFilters()` to add to filtering engines
  4. Call `filteringBehaviorChanged()` to notify all components

### `µb.getCompiledFilterList(assetKey)`
- **Purpose**: Gets compiled filter list (or compiles if not cached)
- **Flow**:
  1. Check cache for compiled version
  2. If valid, return cached
  3. If not, read raw content, compile, save to cache, return

### `applyCompiledFilters(assetKey, compiledContent)`
- **Purpose**: Applies compiled filter content to filtering engines
- **Flow**:
  1. Parse compiled content using `staticNetFilteringEngine.fromCompiled()`
  2. Add network filters
  3. Parse cosmetic filters using `staticExtFilteringEngine.fromCompiledContent()`
  4. Add cosmetic filters

### `µb.listKeysFromCustomFilterLists(raw)`
- **Purpose**: Extract valid URLs from raw custom filter list text
- **Flow**:
  1. Split raw text by newlines
  2. Filter out lines starting with `!` or `#` (comments)
  3. Filter out invalid URLs (must match `^[a-z-]+://\S+`)
  4. Filter out known bad lists from `badLists`
  5. Return array of valid URLs
- **Used by**: `applyFilterListSelection()` to process imported lists

### `µb.removeFilterList(assetKey)`
- **Purpose**: Remove a filter list from cache and storage
- **Flow**:
  1. Remove from `io` cache
  2. Remove from `assetSourceRegistry`
  3. Clear any related cache entries

### `µb.scheduleAssetUpdater(options)`
- **Purpose**: Schedule filter list update task
- **Options**:
  - `now`: Boolean - immediately trigger update
  - `fetchDelay`: Number - delay in ms before fetching
  - `auto`: Boolean - automatic vs manual update
  - `assetKeys`: Array - specific keys to update (optional)

---

## Data Flow Diagram

### Initialization Flow
```
3p-filters.html loads
       ↓
3p-filters-bundle.js (module)
       ↓
renderFilterLists()
       ↓
vAPI.messaging.send('dashboard', { what: 'getLists' })
       ↓
messaging.ts: getLists handler
       ↓
µb.getAvailableLists() → all available lists
io.metadata() → cache info
µb.availableFilterLists → current enabled lists
       ↓
Response returned with full list data
       ↓
renderFilterLists() builds DOM tree
       ↓
Filter lists displayed with checkboxes
```

### User Applies Changes Flow
```
User toggles checkbox on filter list
       ↓
toggleFilterList() updates UI state
       ↓
User clicks "Apply changes"
       ↓
buttonApplyHandler()
       ↓
selectFilterLists() builds toSelect/toRemove arrays
       ↓
vAPI.messaging.send('dashboard', { what: 'applyFilterListSelection', ... })
       ↓
messaging.ts: applyFilterListSelection handler
       ↓
µb.applyFilterListSelection() updates selectedFilterLists
       ↓
µb.saveSelectedFilterLists() persists to browser.storage.local
       ↓
vAPI.messaging.send('dashboard', { what: 'reloadAllFilters' })
       ↓
messaging.ts: reloadAllFilters handler
       ↓
µb.loadFilterLists() loads all selected lists
       ↓
For each selected list: getCompiledFilterList() + applyCompiledFilters()
       ↓
Filters added to staticNetFilteringEngine and staticExtFilteringEngine
       ↓
filteringBehaviorChanged() broadcast
       ↓
dnrIntegration.updateRules() (if MV3)
       ↓
DNR rules updated with new filter lists
```

---

## Data Structures

### Filter List Entry (from getAvailableLists)
```typescript
interface ListDetails {
    title?: string;           // Display name
    group?: string;           // Group category (e.g., "ads", "privacy")
    group2?: string;          // Secondary grouping
    content?: string;         // "filters", "hosts", etc.
    contentURL?: string | string[];  // URL to fetch list
    subInfo?: string;         // Additional info
    supportName?: string;     // Support page name
    supportURL?: string;      // Support page URL
    external?: boolean;       // Is external/custom list
    instructionURL?: string;  // Info URL
    isDefault?: boolean;     // Is default list
    isImportant?: boolean;    // Is important list
    off?: boolean;           // Is disabled (undefined = enabled)
    parent?: string;         // Parent group key
    preferred?: boolean;      // Is preferred variant
    tags?: string;           // Tags for search
    entryCount?: number;     // Number of entries
    entryUsedCount?: number; // Number of used entries
}
```

### listsetDetails (UI State)
```typescript
interface ListsetDetails {
    current: Record<string, ListDetails>;     // Currently enabled lists
    available: Record<string, ListDetails>;  // All available lists
    cache: Record<string, AssetCache>;      // Cache metadata
    autoUpdate?: boolean;
    parseCosmeticFilters?: boolean;
    ignoreGenericCosmeticFilters?: boolean;
    suspendUntilListsAreLoaded?: boolean;
    isUpdating?: boolean;
}
```

### applyFilterListSelection Request
```typescript
interface ApplyFilterListSelectionRequest {
    toSelect?: string[];     // List keys to enable
    toRemove?: string[];     // List keys to remove
    toImport?: string;       // URLs to import as custom lists
    merge?: boolean;         // If true, add toSelect to existing; if false, replace
}
```

---

## Filter List Groups

Filter lists are organized into groups based on their `group` property:

| Group | Display Name | Examples |
|-------|--------------|----------|
| `user` | User filters | user-filters |
| `default` | Default | uBlock filters |
| `ads` | Ads | EasyList, AdGuard |
| `privacy` | Privacy | EasyPrivacy, AdGuard Privacy |
| `malware` | Malware | Malware Domain List |
| `multipurpose` | Multi-purpose | - |
| `cookies` | Cookies | - |
| `social` | Social | Fanboy's Social Blocking |
| `annoyances` | Annoyances | Fanboy's Annoyances |
| `regions` | Regions | Language-specific lists |
| `unknown` | Unknown | Uncategorised |
| `custom` | Custom | User-imported |

---

## UI Templates

### Leaf Entry (Individual Filter List)
```html
<div class="li listEntry" data-role="leaf" data-key="ublock-filters">
  <span class="detailbar">
    <label>
      <span class="input checkbox">
        <input type="checkbox" checked>
        <svg>...</svg>
      </span>
      <span class="listname forinput">uBlock filters – Ads</span>
    </label>
    <span class="iconbar">
      <a class="fa-icon content" href="asset-viewer.html?url=...">eye-open</a>
      <a class="fa-icon support" href="...">home</a>
      <span class="fa-icon remove">trash-o</span>
      <a class="fa-icon mustread" href="...">info-circle</a>
      <span class="fa-icon status unsecure">unlock-alt</span>
      <span class="fa-icon status obsolete">exclamation-triangle</span>
      <span class="fa-icon status cache">clock-o</span>
      <span class="fa-icon status updating">spinner</span>
      <span class="fa-icon status failed">unlink</span>
    </span>
    <span class="leafstats">567/1234</span>
  </span>
</div>
```

### Node Entry (Group)
```html
<div class="li listEntry expandable" data-role="node" data-key="ads">
  <span class="detailbar">
    <label>
      <span class="input checkbox">
        <input type="checkbox" checked>
        <svg>...</svg>
      </span>
      <span class="listname forinput">Ads</span>
    </label>
    <span class="nodestats">5/10</span>
    <span class="fa-icon listExpander">angle-up</span>
    <span class="iconbar">...</span>
    <span class="leafstats"></span>
  </span>
  <div class="listEntries">  <!-- Child entries go here -->
  </div>
</div>
```

---

## Status Icons

| Icon Class | Meaning |
|------------|---------|
| `.unsecure` | List uses HTTP instead of HTTPS |
| `.obsolete` | List is marked as obsolete |
| `.cached` | List is cached locally |
| `.updating` | List is currently being updated |
| `.failed` | Last update failed (network error) |

---

## DNR Integration (MV3)

The Filter Lists UI integrates with DNR through the broadcast system:

```
filteringBehaviorChanged() broadcast
       ↓
dnr-integration.ts: onBroadcast listener
       ↓
updateRules()
       ↓
compileStaticFiltersFromLists()
       ↓
dnrRulesetFromRawLists() from static-dnr-filtering.ts
       ↓
browser.declarativeNetRequest.updateDynamicRules()
       ↓
Network filters applied to Chrome's DNR
```

This ensures that when users enable/disable filter lists via the UI, the changes are reflected in actual network blocking.

---

## Implementation in uBlockResurrected

### Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| 3p-filters.html | ✅ Complete | Script imports verified |
| 3p-filters.ts | ✅ Implemented | All 33 functions implemented |
| getLists handler | ✅ Implemented | In messaging.ts |
| applyFilterListSelection | ✅ Implemented | In storage.ts |
| reloadAllFilters | ✅ Implemented | In messaging.ts |
| autoSelectRegionalFilterLists | ✅ Implemented | In storage.ts |
| DNR integration | ✅ Implemented | Via filteringBehaviorChanged |
| Import/require | ✅ Documented | Uses ES6 modules with dom, i18n, onBroadcast from ./dom.js, ./i18n.js, ./broadcast.js |

### Module Imports

```typescript
import { dom, qs$, qsa$ } from './dom.js';
import { i18n, i18n$ } from './i18n.js';
import { onBroadcast } from './broadcast.js';
import µb from './background.js';
```

### Broadcast Listeners (onBroadcast)

The filter list UI listens for these broadcast messages:

| Message | Handler | Action |
|---------|---------|--------|
| `assetUpdated` | `updateAssetStatus` | Update single list status icon |
| `assetsUpdated` | (anonymous) | Remove 'updating' class, render widgets |
| `staticFilteringDataChanged` | `renderFilterLists` | Re-render entire filter list UI |

### Key Implementation Notes

1. **ES6 Module**: Uses `<script type="module">` for 3p-filters-bundle.js
2. **Broadcast System**: Uses onBroadcast to receive filter list updates
3. **Local Storage**: Persists expanded list state via vAPI.localStorage
4. **Cloud Sync**: Implements self.cloud.onPush/onPull for settings sync
5. **Search**: Uses WeakMap (perListHaystack) to cache search text per list

---

## Acceptance Criteria

1. ✅ Filter lists tab displays all available lists from `getAvailableLists()`
2. ✅ Checkboxes correctly reflect current enabled lists from `selectedFilterLists`
3. ✅ Toggling checkbox updates UI state immediately
4. ✅ Clicking "Apply changes" saves selection to storage
5. ✅ After apply, filters are reloaded via `loadFilterLists()`
6. ✅ Clicking "Update now" triggers `updateNow` message
7. ✅ User settings (auto-update, parse cosmetic, etc.) are saved
8. ✅ Search filters the displayed lists
9. ✅ Broadcast system notifies DNR to update rules after changes
10. ✅ First-time users get default filter lists via `autoSelectRegionalFilterLists()`
11. ✅ Cloud storage sync works - push/pull filter list selection
12. ✅ Expanded/collapsed state persists across page reloads
13. ✅ Auto-update on page load works when enabled
14. ✅ Unsaved changes detection works (hasUnsavedData)
15. ✅ Purge cache functionality works for individual lists
16. ✅ Import custom filter list URLs works
17. ✅ Remove/delete filter list functionality works
18. ✅ Group node stats update correctly when children change

---

## Additional Functions Reference

Additional helper functions in 3p-filters.js (lines reference):

| Function | Lines | Purpose |
|----------|-------|---------|
| `lastUpdateTemplateString` | 28 | i18n template string for last update |
| `obsoleteTemplateString` | 29 | i18n string for obsolete list warning |
| `reValidExternalList` | 30 | Regex to validate external list URLs |
| `recentlyUpdated` | 31 | Time in ms (1 hour) for recent update threshold |
| `renderNumber()` | 56-58 | Format number with locale string |
| `listStatsTemplate` | 60 | i18n template for list stats |
| `renderLeafStats()` | 62-67 | Format leaf entry stats display |
| `renderNodeStats()` | 69-72 | Format group node stats display |
| `i18nGroupName()` | 74-78 | Get localized group name |
| `renderFilterLists()` | 82-303 | Main render function - fetch and display filter lists |
| `renderWidgets()` | 307-317 | Update button states based on changes |
| `updateAssetStatus()` | 321-337 | Update single list's status in UI |
| `hashFromListsetDetails()` | 348-360 | Create hash from current listset state |
| `hashFromCurrentFromSettings()` | 362-381 | Create hash from current UI settings |
| `onListsetChanged()` | 385-389 | Handle checkbox change events |
| `toggleFilterList()` | 393-418 | Toggle filter list enabled/disabled |
| `updateListNode()` | 420-484 | Update a group node's stats and state |
| `updateAncestorListNodes()` | 486-491 | Update parent nodes when child changes |
| `onFilteringSettingsChanged()` | 495-497 | Trigger hash update when settings change |
| `onRemoveExternalList()` | 505-513 | Handle external list removal click |
| `onPurgeClicked()` | 516-548 | Handle cache purge click |
| `selectFilterLists()` | 551-627 | Collect enabled/disabled lists and send to backend |
| `buttonApplyHandler()` | 631-638 | Handle Apply button click |
| `buttonUpdateHandler()` | 644-652 | Handle Update button click |
| `userSettingCheckboxChanged()` | 656-664 | Handle user setting checkbox changes |
| `searchFilterLists()` | 671-712 | Filter visible lists based on search text |
| `perListHaystack` | 714 | WeakMap cache for search matching text per list |
| `expandedListSet` | 720-723 | Set of expanded group keys |
| `listIsExpanded()` | 725-727 | Check if group is expanded |
| `applyListExpansion()` | 729-739 | Apply expanded state to groups |
| `toggleListExpansion()` | 741-774 | Toggle group expansion state |
| `createListEntry()` | 167-175 | Create DOM element for leaf or node entry |
| `createListEntries()` | 177-214 | Recursively create list entry tree |
| `listNameFromListKey()` | 84-89 | Get display name for a list key (inner function) |
| `self.cloud.onPush` | 830-843 | Push filter list settings to cloud |
| `self.cloud.onPull` | 845-882 | Pull filter list settings from cloud |
| `self.wikilink` | 886 | Wiki link for help |
| `self.hasUnsavedData()` | 888-890 | Check for unsaved changes |

---

## References

- Reference implementation: `/home/glompy/Desktop/ASTROCYTECH/git_project/Blocker/temporary_folder/mv3-references/uBlock/src/3p-filters.js`
- Reference HTML: `/home/glompy/Desktop/ASTROCYTECH/git_project/Blocker/temporary_folder/mv3-references/uBlock/src/3p-filters.html`
- Reference messaging: `/home/glompy/Desktop/ASTROCYTECH/git_project/Blocker/temporary_folder/mv3-references/uBlock/src/js/messaging.js`
- Reference storage: `/home/glompy/Desktop/ASTROCYTECH/git_project/Blocker/temporary_folder/mv3-references/uBlock/src/js/storage.js`