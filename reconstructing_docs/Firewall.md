# Firewall Implementation Documentation

This document describes the Firewall feature implementation for uBlockResurrected. The Firewall allows users to dynamically block or allow network requests based on source hostname, destination hostname, and request type.

---

## Overview

The Firewall is a **dynamic hostname-based request filtering system** that:
- Allows users to set block/allow rules for specific source-destination pairs
- Supports multiple request types: scripts, frames, images, inline-scripts
- Distinguishes between 1st-party and 3rd-party requests
- Persists rules across browser sessions
- Uses MV3-compliant `declarativeNetRequest` (DNR) API for blocking

### Key Features

- **Global rules**: Apply to all websites
- **Per-site rules**: Apply to specific source domains
- **Request type filtering**: Different rules for scripts, frames, images, etc.
- **3rd-party detection**: Automatically detects cross-origin requests
- **Priority system**: More specific rules take precedence
- **Export/Import**: Rules are compatible with original uBlock format

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CHROME EXTENSION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      POPUP / DASHBOARD UI                          │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │    │
│  │  │  Firewall Grid  │  │  Message Handler │  │  Rule Display  │   │    │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │    │
│  └───────────│────────────────────│────────────────────│────────────┘    │
│              │                    │                    │                  │
│              ▼                    ▼                    ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    MESSAGING LAYER                                 │    │
│  │              chrome.runtime.sendMessage                             │    │
│  └────────────────────────────┬────────────────────────────────────────┘    │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  SERVICE WORKER (sw.js)                            │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │    │
│  │  │ FirewallManager │  │ DynamicHostRule │  │   DNR Adapter  │   │    │
│  │  │                 │  │   Filtering     │  │                 │   │    │
│  │  │ - load/save     │  │                 │  │ - rulesFromText│   │    │
│  │  │ - sync to DNR   │  │ - setCell       │  │ - toDNRRules   │   │    │
│  │  │ - handle msgs   │  │ - evaluateCell  │  │ - updateRules  │   │    │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │    │
│  │           │                   │                    │              │    │
│  │           ▼                   │                    ▼              │    │
│  │  ┌─────────────────┐         │          ┌─────────────────┐    │    │
│  │  │ localStorage    │         │          │   DNR API       │    │    │
│  │  │ permanentFirewall│         │          │ updateDynamic   │    │    │
│  │  │ sessionFirewall │         │          │ Rules()         │    │    │
│  │  └─────────────────┘         │          └─────────────────┘    │    │
│  └──────────────────────────────┼────────────────────────────────────┘    │
│                                 │                                          │
│                                 ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CHROME DNR ENGINE                               │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │              Dynamic Rules (ID: 9,000,000+)                │  │    │
│  │  │  - Block rules from firewall                               │  │    │
│  │  │  - Allow rules from firewall                               │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
uBlockResurrected/
├── src/
│   ├── js/
│   │   ├── dynamic-net-filtering.js     # Core rule logic (from uBlock)
│   │   ├── firewall-dnr.js              # Convert firewall → DNR rules
│   │   ├── firewall-manager.js         # Load/save/sync orchestration
│   │   ├── messaging.js                 # Message handlers
│   │   └── popup-firewall.js            # Popup UI handler
│   └── firewall-ui.html                 # Firewall grid in popup
├── platform/
│   └── chrome/
│       ├── js/
│       │   └── background.js            # Service worker entry
│       └── manifest.json                # Permissions (declarativeNetRequest)
└── reconstructing_docs/
    └── Firewall.md                      # This documentation
```

---

## Core Components

### 1. DynamicHostRuleFiltering Class

**Source:** Copied from `/Blocker/temporary_folder/mv3-references/uBlock/src/js/dynamic-net-filtering.js`

This class handles the **logical layer** of firewall rule management - storing and evaluating rules without actually blocking anything.

#### Internal Data Structure

The class uses a `Map` to store rules as bitmaps with keys in the format `"sourceHostname destinationHostname"`:

```javascript
this.rules = new Map();
// Example: rules.get('example.com ads.example.com') => 0x0501 (bitmap)
```

Each bitmap encodes multiple action types using bit offsets.

#### Supported Request Types

```javascript
const supportedDynamicTypes = {
    '3p': true,
    'image': true,
    'inline-script': true,
    '1p-script': true,
    '3p-script': true,
    '3p-frame': true
};
```

#### Type Bit Offsets

```javascript
const typeBitOffsets = {
    '*': 0,
    'inline-script': 2,
    '1p-script': 4,
    '3p-script': 6,
    '3p-frame': 8,
    'image': 10,
    '3p': 12
};
```

#### Actions

```javascript
const nameToActionMap = {
    'block': 1,
    'allow': 2,
    'noop': 3
};

const intToActionMap = new Map([
    [ 1, 'block' ],
    [ 2, 'allow' ],
    [ 3, 'noop' ]
]);
```

#### Key Methods

```javascript
class DynamicHostRuleFiltering {
    // Set a rule for a specific source/destination/type combination
    setCell(srcHostname, desHostname, type, state) { }
    
    // Unset (remove) a rule
    unsetCell(srcHostname, desHostname, type) { }
    
    // Evaluate a rule (returns action: 0=none, 1=block, 2=allow, 3=noop)
    evaluateCellZY(srcHostname, desHostname, type) { }
    
    // Convert to/from string format
    toString() { }        // Returns "src des type action\n" lines
    fromString(text) { }  // Parse from string
    
    // Export rules as array
    toArray() { }
    
    // Import from another DynamicHostRuleFiltering instance
    assign(other) { }
    
    // Lookup rule data for UI display
    lookupRuleData(src, des, type) { }
    
    // Get log data for debugging
    toLogData() { }
}
```

#### Dependencies

The class depends on:
- `decomposeHostname()` from `./uri-utils.js` - for hostname decomposition
- `domainFromHostname()` from `./uri-utils.js` - for domain extraction
- `LineIterator` from `./text-utils.js` - for parsing text format
- `punycode` from `../lib/punycode.js` - for internationalized domain names

#### Session vs Permanent Firewall

Two instances are maintained:
- **`permanentFirewall`**: Rules that persist to localStorage
- **`sessionFirewall`**: Runtime rules (copied from permanent on startup)

Changes are made to `sessionFirewall`, then synced to DNR and saved to `permanentFirewall`.

---

### 2. Firewall DNR Converter

**File:** `src/js/firewall-dnr.js`

This module converts the logical firewall rules to DNR (Declarative Net Request) rules.

#### Rule Conversion Process

```
Firewall format:  "sourceHostname destinationHostname type action"
Example:          "example.com ads.example.com 3p-script block"

DNR format:
{
    id: 9000001,
    priority: 1000001,
    action: { type: 'block' },
    condition: {
        initiatorDomains: ['example.com'],
        urlFilter: 'ads\\.example\\.com',
        resourceTypes: ['script']
    }
}
```

#### Conversion Logic

```javascript
function firewallRulesToDNR(firewallRules, baseId = 9000000) {
    const dnrRules = [];
    let ruleId = 0;
    
    for (const rule of firewallRules) {
        const [src, des, type, action] = rule.split(' ');
        
        // Convert firewall type to DNR resource type
        const resourceType = typeToResourceType(type);
        
        // Build URL filter from destination hostname
        // Use regex for precise hostname matching
        const urlFilter = hostnameToRegex(des);
        
        dnrRules.push({
            id: baseId + ruleId++,
            priority: baseId + ruleId,  // Higher priority
            action: {
                type: action === 'allow' ? 'allow' : 'block'
            },
            condition: {
                initiatorDomains: src !== '*' ? [src] : undefined,
                urlFilter: urlFilter,
                resourceTypes: [resourceType]
            }
        });
    }
    
    return dnrRules;
}

function typeToResourceType(type) {
    const mapping = {
        '*': 'main_frame',
        'image': 'image',
        '3p-script': 'script',
        '3p-frame': 'sub_frame',
        '1p-script': 'script',
        'inline-script': 'script',
        '3p': 'script'  // 3p is catch-all for scripts
    };
    return mapping[type] || 'script';
}

function hostnameToRegex(hostname) {
    if (hostname === '*') {
        '.*';  // Match all
    }
    // Escape special regex characters and convert to regex
    return hostname.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
```

#### Resource Type Mapping

| Firewall Type | DNR Resource Type | Description |
|---------------|-------------------|-------------|
| `*` | `main_frame` | All request types |
| `image` | `image` | Image requests |
| `3p-script` | `script` | Third-party scripts |
| `3p-frame` | `sub_frame` | Third-party frames/iframes |
| `1p-script` | `script` | First-party scripts |
| `inline-script` | `script` | Inline scripts (heuristic) |
| `3p` | `script` | Third-party (catch-all) |

---

### 3. Firewall Manager

**File:** `src/js/firewall-manager.js`

This module orchestrates loading, saving, and syncing firewall rules with DNR.

#### Initialization

```javascript
class FirewallManager {
    constructor() {
        this.permanentFirewall = new DynamicHostRuleFiltering();
        this.sessionFirewall = new DynamicHostRuleFiltering();
        this.dnrAdapter = getDNRAdapter();
    }
    
    async init() {
        // Load permanent rules from storage
        const storedRules = await this.loadFromStorage();
        if (storedRules) {
            this.permanentFirewall.fromString(storedRules);
        }
        
        // Copy to session firewall
        this.sessionFirewall.assign(this.permanentFirewall);
        
        // Sync to DNR
        await this.syncToDNR();
    }
    
    async loadFromStorage() {
        return new Promise(resolve => {
            chrome.storage.local.get('dynamicFilteringString', items => {
                resolve(items.dynamicFilteringString || '');
            });
        });
    }
    
    async saveToStorage() {
        const rules = this.permanentFirewall.toString();
        return new Promise(resolve => {
            chrome.storage.local.set({ dynamicFilteringString: rules }, resolve);
        });
    }
    
    async syncToDNR() {
        // Get existing firewall rules in DNR
        const existingRules = await this.dnrAdapter.getDynamicRules();
        const firewallRuleIds = existingRules
            .filter(r => r.id >= 9000000 && r.id < 10000000)
            .map(r => r.id);
        
        // Convert current firewall rules to DNR
        const newRules = this.firewallRulesToDNR(this.sessionFirewall.toArray());
        
        // Update DNR
        await this.dnrAdapter.updateDynamicRules({
            addRules: newRules,
            removeRuleIds: firewallRuleIds
        });
    }
}
```

#### Setting a Rule

```javascript
async setCell(src, des, type, action) {
    // action: 0=unset, 1=block, 2=allow, 3=noop
    
    if (action === 0) {
        this.sessionFirewall.unsetCell(src, des, type);
    } else {
        this.sessionFirewall.setCell(src, des, type, action);
    }
    
    // Save to storage (permanent)
    await this.saveToStorage();
    
    // Sync to DNR
    await this.syncToDNR();
}
```

#### Copying Rules (Session-specific)

```javascript
// Copy rules from permanent to session (used on startup)
sessionFirewall.assign(permanentFirewall);

// Copy rules from one firewall to another with hostname filtering
// Used when creating per-site rules from global rules
sessionFirewall.copyRules(permanentFirewall, srcHostname, desHostnames);
```

#### Checking for Changes

```javascript
// Check if firewall rules have changed (for UI dirty state)
const isDirty = sessionFirewall.hasSameRules(permanentFirewall, srcHostname, desHostnames);
```

---

## Integration with User Rules System

### Overview

The firewall rules coexist with user-defined DNR rules in the same DNR rule space. Both use ID range 9,000,000+, so we need to coordinate.

### User Rules (from dnr-parser)

The existing user rules system (`updateUserRules()` in `ruleset-manager.js`) also uses DNR:

```javascript
const USER_RULES_BASE_RULE_ID = 9000000;
const USER_RULES_PRIORITY = 1000000;
```

### Firewall Rule IDs

To avoid conflicts:
- **Firewall block rules**: IDs 9,000,000 - 9,099,999
- **Firewall allow rules**: IDs 9,100,000 - 9,199,999
- **User rules**: IDs 9,200,000+

Alternatively, we can use a different priority for firewall rules:
- **Firewall priority**: 2,000,000 (higher than user rules)
- **User rules priority**: 1,000,000

### Shared DNR Adapter

The firewall uses the same DNR adapter as the rest of the extension:

```javascript
import { dnr } from './ext-compat.js';

// Methods used:
// dnr.getDynamicRules()
// dnr.updateDynamicRules({ addRules, removeRuleIds })
// dnr.getSessionRules()
// dnr.updateSessionRules({ addRules, removeRuleIds })
```

### Coordination with Static Filters

Firewall rules need **highest priority** to override static filter rules. This is achieved by:
1. Using priority values > 1,000,000
2. Placing firewall rules at the top of the rule list

---

## Integration with Request Processing

### How Firewall Blocks Requests

The firewall integrates with the request processing pipeline in `pagestore.js`:

```javascript
// In filterRequest() method
// Dynamic hostname/type filtering
if (result === 0 && µb.userSettings.advancedUserEnabled) {
    result = sessionFirewall.evaluateCellZY(
        fctxt.getTabHostname(),      // Source hostname (page)
        fctxt.getHostname(),          // Destination hostname
        requestType                   // e.g., 'script', 'image'
    );
    
    // Log the filter that was applied
    if (result !== 0 && result !== 3 && loggerEnabled) {
        fctxt.filter = sessionFirewall.toLogData();
    }
}
```

**Note:** This integration uses the **in-memory evaluation** via `sessionFirewall.evaluateCellZY()`. The DNR rules act as a backup for when the service worker isn't loaded, but the primary blocking happens through the logical layer during request processing in the page store.

This is a key difference from MV2: In MV2, both the logical evaluation and the actual blocking happened via webRequest. In MV3, we have:
1. **Logical evaluation** (in pagestore) - for logging, statistics, UI
2. **DNR rules** - for actual browser-level blocking

### Request Type Mapping

The firewall maps browser request types to firewall types:

| Browser Type | Firewall Type Used in evaluateCellZY |
|--------------|--------------------------------------|
| `script` | 3rd-party? `3p-script` : `1p-script` |
| `sub_frame`, `object` | `3p-frame` |
| `image` | `image` |
| Other | Type-specific, then `3p` catch-all |

---

## UI Implementation

---

## Request Type Handling

### 3rd-Party Detection

The firewall automatically detects 3rd-party requests based on the relationship between source and destination hostnames:

```javascript
function is3rdParty(srcHostname, desHostname) {
    // If either is wildcard, not 3rd party
    if (desHostname === '*' || srcHostname === '*' || srcHostname === '') {
        return false;
    }
    
    const srcDomain = domainFromHostname(srcHostname) || srcHostname;
    
    // Check if destination ends with source domain
    if (desHostname.endsWith(srcDomain) === false) {
        return true;
    }
    
    // Ensure it's actually a subdomain, not same domain
    return desHostname.length !== srcDomain.length &&
           desHostname.charAt(desHostname.length - srcDomain.length - 1) !== '.';
}
```

### Precedence Order

When evaluating a request, rules are checked in this order (most specific first):

1. **Specific destination, any party** - `example.com ads.example.com * block`
2. **Any destination, 3rd-party scripts** - `example.com * 3p-script block`
3. **Any destination, 3rd-party frames** - `example.com * 3p-frame block`
4. **Any destination, 3rd-party (catch-all)** - `example.com * 3p block`
5. **Any destination, 1st-party scripts** - `example.com * 1p-script block`
6. **Any destination, specific type** - `example.com * image block`
7. **Any destination, any party, any type** - `example.com * * block`
8. **Global rules** - `* * * block`

---

## UI Implementation

### Popup Data Flow

When the popup opens, it requests firewall rules for the current tab:

```javascript
// In messaging.js - popupDataFromTabId()
const getFirewallRules = function(src, out) {
    const ruleset = out.firewallRules = {};
    const df = sessionFirewall;

    // Get global rules (source = '*')
    for (const type of firewallRuleTypes) {
        const r = df.lookupRuleData('*', '*', type);
        if (r === undefined) { continue; }
        ruleset[`/ * ${type}`] = r;
    }
    if (typeof src !== 'string') { return; }

    // Get global rules for specific source
    for (const type of firewallRuleTypes) {
        const r = df.lookupRuleData(src, '*', type);
        if (r === undefined) { continue; }
        ruleset[`. * ${type}`] = r;
    }

    // Get per-destination rules
    const { hostnameDict } = out;
    for (const des in hostnameDict) {
        let r = df.lookupRuleData('*', des, '*');
        if (r !== undefined) { ruleset[`/ ${des} *`] = r; }
        r = df.lookupRuleData(src, des, '*');
        if (r !== undefined) { ruleset[`. ${des} *`] = r; }
    }
};
```

The returned format uses prefixes:
- `/` = global rules (source = '*')
- `.` = per-site rules (source = current site)

### Firewall Rule Types (for UI)

```javascript
const firewallRuleTypes = [
    '*',
    'image',
    '3p',
    'inline-script',
    '1p-script',
    '3p-script',
    '3p-frame',
];
```

### Firewall Grid (Popup)

The firewall displays as a matrix in the popup:

```
                    |  *  | image | script | frame | 3p | 1p-script | inline
--------------------|------|-------|--------|-------|----|-----------|--------
        * (global)  |  ○  |   ○   |   ○    |   ○   | ○  |     ○     |   ○
--------------------|------|-------|--------|-------|----|-----------|--------
example.com         |  ●  |   ○   |   ●    |   ○   | ●  |     ○     |   ○
  ads.example.com   |  ○  |   ○   |   ●    |   ○   |    |           |
  tracker.com       |  ●  |   ○   |   ●    |   ●   |    |           |
```

Legend: ○ = no rule, ● = blocked, ✓ = allowed, ⊘ = noop

### Click to Cycle

Clicking a cell cycles through:
1. **Block** (●) - block requests
2. **Allow** (✓) - allow requests  
3. **Noop** (⊘) - pass through without blocking
4. **None** (○) - no rule (use default)

### Domain Expansion

When displaying the firewall UI, the system expands hostnames to show all parent domains. For example, if you have rules for `ads.example.com`, the UI shows:

- `example.com` (root)
  - `ads.example.com`
  - `tracker.example.com`

This is done using `decomposeHostname()` which returns all parent domains plus the full hostname.

---

## Export/Import Compatibility

### Original uBlock Format

The firewall uses the same text format as the original uBlock, making it fully compatible:

```
# Global rules
* * 3p block
* * 3p-script block

# Per-site rules  
example.com * 3p block
example.com ads.example.com 3p-script block
```

### Parsing

```javascript
const lineIter = new LineIterator(text);
while (lineIter.eot() === false) {
    const parts = lineIter.next().trim().split(/\s+/);
    // parts = ['example.com', 'ads.example.com', '3p-script', 'block']
    this.addFromRuleParts(parts);
}
```

### Validation

Rules are validated before being added:
- Hostnames must not contain invalid characters: `/[^0-9a-z_.[\]:%-]/`
- Type must be one of the supported types
- Action must be block, allow, or noop
- If type is not `*`, destination must be `*` (per uBlock convention)

### Backup/Restore

The firewall integrates with the existing backup/restore system:
- Rules are stored in localStorage under `dynamicFilteringString`
- Export includes all firewall rules
- Import parses and applies rules

### Message Handling

```javascript
// From popup to service worker
messaging.on('firewallGetRules', function(payload, callback) {
    callback({
        firewallRules: getFirewallRulesForPopup(tabHostname)
    });
});

messaging.on('firewallSetCell', function(payload, callback) {
    const { src, des, type, action } = payload;
    firewallManager.setCell(src, des, type, action);
    callback({ success: true });
});
```

---

## Storage Format

### localStorage

Rules are stored in localStorage under the key `dynamicFilteringString`:

```
* * 3p block
* * 3p-script block
example.com * 3p block
example.com ads.example.com 3p-script block
```

Format: `sourceHostname destinationHostname type action`

### Supported Actions

| Action | Meaning |
|--------|---------|
| `block` | Block matching requests |
| `allow` | Allow matching requests (whitelist) |
| `noop` | No operation - pass through without blocking |

---

## DNR Integration Details

### Rule ID Ranges

| Range | Purpose |
|-------|---------|
| 1-4,999,999 | Static rules (built-in filter lists) |
| 5,000,000-5,999,999 | Special rules (strict-block) |
| 9,000,000+ | User rules (firewall + user filters) |

### Firewall Rules in DNR

```javascript
// Example: Block all 3rd-party scripts from example.com to anywhere
{
    id: 9000001,
    priority: 1000001,
    action: { type: 'block' },
    condition: {
        initiatorDomains: ['example.com'],
        urlFilter: '.*',  // Match all URLs
        resourceTypes: ['script']
    }
}

// Example: Block ads.example.com when initiated from example.com
{
    id: 9000002,
    priority: 1000002,
    action: { type: 'block' },
    condition: {
        initiatorDomains: ['example.com'],
        urlFilter: 'ads\\.example\\.com',
        resourceTypes: ['script', 'image', 'sub_frame']
    }
}
```

### Priority

DNR rules are evaluated by priority (higher = more important). Firewall rules use priority 1,000,000+ to ensure they take precedence over static filter rules.

### Blocking Mechanism in MV3

**Important Note:** The architecture differs significantly from MV2:

1. **Service Worker Running**: 
   - The service worker (`sw.js`) is loaded
   - Page stores (`pagestore.js`) exist in the page context
   - The logical firewall (`sessionFirewall`) evaluates requests via `evaluateCellZY()`
   - Blocking happens in the page context through the filtering engine

2. **Service Worker Not Running** (e.g., after timeout):
   - Service worker is terminated by Chrome
   - Page context still processes requests but can't communicate with SW
   - **DNR rules serve as the fallback** - they block at the browser level
   - This is why we need both: logical evaluation + DNR rules

The flow is:
```
Request → Page Store → sessionFirewall.evaluateCellZY() 
         → if block: don't process request (no network call)
         → DNR (backup if SW not running) → browser blocks
```

### Optimization: Batching DNR Updates

To avoid excessive DNR updates when user clicks multiple cells rapidly:

```javascript
class FirewallManager {
    constructor() {
        this.dnrUpdatePending = false;
        this.dnrUpdateScheduled = false;
    }
    
    async setCell(src, des, type, action) {
        // Update in-memory rules immediately
        this.sessionFirewall.setCell(src, des, type, action);
        
        // Save to storage
        await this.saveToStorage();
        
        // Schedule DNR sync (debounced)
        this.scheduleDnrSync();
    }
    
    scheduleDnrSync() {
        if (this.dnrUpdateScheduled) { return; }
        this.dnrUpdateScheduled = true;
        
        // Debounce: wait 100ms for more changes
        setTimeout(async () => {
            this.dnrUpdateScheduled = false;
            await this.syncToDNR();
        }, 100);
    }
}
```

---

## Differences from MV2 (Original uBlock)

| Feature | MV2 (Original) | MV3 (This Implementation) |
|---------|---------------|---------------------------|
| Blocking API | `webRequest` | `declarativeNetRequest` |
| Rule Storage | In-memory + storage | DNR + localStorage (backup) |
| Real-time blocking | Immediate | Requires sync to DNR |
| Regex support | Full regex in filters | Limited to URL filters |
| Rule count limit | None (in-memory) | 1,500 dynamic rules |
| Session rules | N/A | Can use session rules |

### Key Limitations

1. **No regex in URL filters**: DNR's `urlFilter` has limited regex support
2. **Rule count limit**: ~1,500 dynamic regex rules maximum
3. **No per-tab session rules**: DNR session rules are browser-wide
4. **Latency**: Rule changes require async DNR update

---

## Message Types

### Popup → Service Worker

| Message | Parameters | Purpose |
|---------|------------|---------|
| `firewallGetRules` | `tabHostname` | Get rules for a site |
| `firewallSetCell` | `src, des, type, action` | Set a rule |
| `firewallGetAll` | - | Get all rules |
| `firewallExport` | - | Export rules as text |

### Service Worker → Popup

| Message | Parameters | Purpose |
|---------|------------|---------|
| `firewallRules` | `rules` | Rule data for display |
| `firewallUpdated` | - | Rules changed notification |

---

## Implementation Checklist

- [ ] Copy `dynamic-net-filtering.js` from reference
- [ ] Create `firewall-dnr.js` converter
- [ ] Create `firewall-manager.js` orchestration
- [ ] Add message handlers in `messaging.js`
- [ ] Create firewall UI in popup
- [ ] Handle initialization in service worker
- [ ] Add DNR permissions to manifest
- [ ] Test rule persistence
- [ ] Test blocking behavior
- [ ] Test export/import compatibility

---

## Behavior Summary

| Action | Result |
|--------|--------|
| Set block rule | Request blocked at browser level |
| Set allow rule | Request allowed (whitelist) |
| Set noop | Request passed through (no blocking) |
| No rule | Falls through to static filters |
| Change rule | Async sync to DNR (~100ms) |
| Restart browser | Rules restored from localStorage |

---

## Testing Notes

### Manual Testing

1. Open popup on any website
2. Click firewall cells to set block/allow
3. Reload page - verify rules persist
4. Check chrome://extensions (see DNR rules)
5. Test with service worker terminated (wait 30s, reload page)

### Debugging

```javascript
// Check DNR rules in console
chrome.declarativeNetRequest.getDynamicRules().then(console.log);

// Check localStorage
chrome.storage.local.get('dynamicFilteringString', console.log);

// Check in-memory firewall state (from popup console)
// Requires messaging to service worker
chrome.runtime.sendMessage({ topic: 'firewallGetAll' }, console.log);
```

### Testing Checklist

- [ ] Set block rule → verify request blocked
- [ ] Set allow rule → verify request allowed (whitelist)
- [ ] Set noop → verify no blocking but logged
- [ ] Clear rule → verify falls through to filters
- [ ] Reload page → rules persist
- [ ] Restart browser → rules restored
- [ ] Service worker timeout → DNR still blocks
- [ ] Export rules → valid text format
- [ ] Import rules → rules applied correctly
- [ ] Many rules → DNR limit handled gracefully
- [ ] Complex hostnames → regex escaping works
- [ ] Punycode domains → IDN handled correctly

### Edge Cases

1. **Empty hostname**: Treated as no rule
2. **Wildcard destination**: Matches any destination
3. **Wildcard source**: Matches any source (global rules)
4. **IDN domains**: Converted to punycode for storage/DNR
5. **IP addresses**: Not supported (hostnames only)
6. **Port in hostname**: Stripped before processing

---

## Required Manifest Permissions

For the firewall to work, the manifest needs:

```json
{
    "permissions": [
        "declarativeNetRequest"
    ],
    "host_permissions": [
        "<all_urls>"
    ]
}
```

Note: The `declarativeNetRequest` permission allows the extension to add blocking rules. The `<all_urls>` host permission is needed to evaluate requests on any website.

---

## Required HTML Elements

### Popup HTML Structure

```html
<div id="firewallPane" class="collapse">
    <div class="firewall-header">
        <span data-i18n="firewallTooltip"></span>
    </div>
    
    <table id="firewallMatrix">
        <thead>
            <tr>
                <th></th>  <!-- Empty corner cell -->
                <th data-type="*" data-i18n="typeAny"></th>
                <th data-type="image" data-i18n="typeImage"></th>
                <th data-type="3p-script" data-i18n="typeScript"></th>
                <th data-type="3p-frame" data-i18n="typeFrame"></th>
                <th data-type="3p" data-i18n="type3p"></th>
                <th data-type="1p-script" data-i18n="type1pScript"></th>
                <th data-type="inline-script" data-i18n="typeInlineScript"></th>
            </tr>
        </thead>
        <tbody id="firewallBody">
            <!-- Rows populated dynamically -->
        </tbody>
    </table>
</div>
```

### CSS Classes

```css
#firewall {
    /* Main firewall container */
}

#firewall > [data-des] {
    /* Row for each destination hostname */
}

#firewall > [data-des][data-type] > span[data-src] {
    /* Cell for each source/type combination */
}

#firewall .cell-block {
    background-color: #f00;
}

#firewall .cell-allow {
    background-color: #0f0;
}

#firewall .cell-noop {
    background-color: #ff0;
}
```

---

## Revision History

### 2026-04-09

1. Initial documentation created
2. Documented architecture and components
3. Included rule format specifications
4. Added DNR integration details
5. Documented differences from MV2

### 2026-04-09 (Updated)

6. Added integration with user rules system
7. Added popup data flow documentation
8. Added export/import compatibility
9. Added blocking mechanism explanation (dual-layer)
10. Added DNR update optimization (debouncing)
11. Added testing checklist and edge cases
12. Added manifest permissions required
13. Added HTML elements structure

---

## References

- Original uBlock: `/Blocker/temporary_folder/mv3-references/uBlock/src/js/dynamic-net-filtering.js`
- uBlock MV3: `/Blocker/temporary_folder/mv3-references/uBlock-mv3/`
- ubol-lite ruleset-manager: `/Blocker/src/extension/js/ruleset-manager.js`
- DNR API: https://developer.chrome.com/docs/extensions/mv3/declarativeNetRequest/