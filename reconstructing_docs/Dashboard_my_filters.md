# Dashboard - My Filters Implementation Documentation

This document describes the "My Filters" (custom filters) tab in the uBlock Resurrected dashboard. This tab allows users to create, edit, and manage custom cosmetic filters (element hiding rules).

---

## Overview

The "My Filters" tab allows users to:
- Add hostname-specific CSS selectors to hide elements
- Edit hostnames and selectors inline
- Remove/unremove selectors
- Import filters from text or file
- Export filters to file
- Supports cosmetic filters in format: `hostname##selector`

**Important:** This tab handles cosmetic filters (element hiding), NOT network filters. Network filters are handled in the "My rules" tab (develop pane).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DASHBOARD (dashboard.html)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    FILTERS PANE (data-pane="filters")                │  │
│  │                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │              <ul class="hostnames">                            │  │  │
│  │  │                                                                  │  │  │
│  │  │  <li class="hostname">                                          │  │  │
│  │  │    <div>                                                         │  │  │
│  │  │      <span class="hostname" contenteditable>example.com</span>  │  │  │
│  │  │      <span class="remove fa-icon">trash-o</span>                │  │  │
│  │  │      <span class="undo fa-icon">undo</span>                    │  │  │
│  │  │    </div>                                                         │  │  │
│  │  │    <ul class="selectors">                                        │  │  │
│  │  │      <li class="selector">                                      │  │  │
│  │  │        <div>                                                     │  │  │
│  │  │          <span class="selector" contenteditable>.ad-banner</span>│  │  │
│  │  │          <span class="remove">...</span>                        │  │  │
│  │  │          <span class="undo">...</span>                          │  │  │
│  │  │        </div>                                                    │  │  │
│  │  │      </li>                                                       │  │  │
│  │  │    </ul>                                                         │  │  │
│  │  │  </li>                                                           │  │  │
│  │  │                                                                  │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                      <aside>                                    │  │  │
│  │  │  <details class="importFromText">                               │  │  │
│  │  │    <summary>Import/Export</summary>                             │  │  │
│  │  │    <textarea placeholder="Paste filters here..."></textarea>    │  │  │
│  │  │    <button>Add</button>                                         │  │  │
│  │  │    <button>Import</button>                                       │  │  │
│  │  │    <button>Export</button>                                       │  │  │
│  │  │  </details>                                                      │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│           │ browser.runtime.sendMessage                                    │
│           ▼                                                                 │
│  ┌──────────────────┐                                                      │
│  │    Background     │                                                      │
│  │ (service worker)  │                                                      │
│  │  - getAllCustomFilters                                                 │
│  │  - addCustomFilters                                                    │
│  │  - removeCustomFilters                                                  │
│  │  - removeAllCustomFilters                                              │
│  └──────────────────┘                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── dashboard.html              # Main dashboard with inline panes
├── css/
│   ├── dashboard.css          # Dashboard layout styles
│   ├── dashboard-common.css  # Shared dashboard styles
│   └── settings.css          # Filters pane specific styles
└── js/
    ├── filter-manager-ui.js  # MV3 inline filter management (TO BE CREATED)
    ├── messaging.ts          # Message handler for filter operations
    └── storage.ts            # Filter storage implementation
```

---

## HTML Structure

### Filters Pane

```html
<section data-pane="filters">
    <ul class="hostnames"></ul>
    <aside>
        <details class="importFromText">
            <summary data-i18n="customFiltersImportExportLabel">_</summary>
            <div><textarea spellcheck="false" placeholder="..."></textarea></div>
            <p>
                <button>Add</button>
                <button>Import</button>
                <button>Export</button>
                <input type="file" accept="text/plain">
            </p>
        </details>
    </aside>
</section>
```

### Templates

The following templates are used for rendering:

```html
<template id="customFiltersHostname">
    <li class="hostname">
        <div>
            <span class="hostname" contenteditable data-pretty="" data-ugly=""></span>
            <span class="remove fa-icon">trash-o</span>
            <span class="undo fa-icon">undo</span>
        </div>
        <ul class="selectors"></ul>
    </li>
</template>

<template id="customFiltersSelector">
    <li class="selector">
        <div>
            <span class="selector" contenteditable data-pretty="" data-ugly=""></span>
            <span class="remove fa-icon">trash-o</span>
            <span class="undo fa-icon">undo</span>
        </div>
    </li>
</template>
```

---

## Data Flow

### Storage Format

Custom filters are stored in browser storage with the following structure:

```javascript
{
    "userFilters": {
        "example.com": [".ad-banner", ".sidebar-ad"],
        "another.com": ["#promo"]
    }
}
```

The key is the hostname, and the value is an array of compiled CSS selectors.

### Format: `hostname##selector`

Cosmetic filters follow the format: `hostname##selector`

Examples:
- `example.com##.ad-banner` - Hide `.ad-banner` on `example.com`
- `example.com##div.ad` - Hide `div.ad` on `example.com`
- `##.ad` - Hide `.ad` on all domains (empty hostname)

---

## Functions

### Core Functions

#### `isValidHostname(hostname: string): boolean`

Validates if a hostname is properly formatted.

```javascript
function isValidHostname(hostname) {
    try {
        const url = new URL(`https://${hostname}/`);
        return url.hostname === hostname;
    } catch {
    }
    return false;
}
```

---

#### `hostnameFromNode(node: Element): string | undefined`

Extracts the hostname from a hostname node.

```javascript
function hostnameFromNode(node) {
    const li = node.closest('li.hostname');
    if (li === null) { return; }
    const span = qs$(li, '.hostname[data-pretty]');
    if (span === null) { return; }
    return span.dataset.ugly || undefined;
}
```

---

#### `selectorFromNode(node: Element): string | undefined`

Extracts the selector from a selector node.

```javascript
function selectorFromNode(node) {
    const li = node.closest('li.selector');
    if (li === null) { return; }
    const span = qs$(li, '.selector[data-pretty]');
    if (span === null) { return; }
    return span.dataset.ugly || undefined;
}
```

---

#### `selectorsFromNode(node: Element, all: boolean): string[]`

Gets all selectors for a hostname node.

```javascript
function selectorsFromNode(node, all = false) {
    const li = node.closest('li.hostname');
    if (li === null) { return []; }
    const qsel = all
        ? 'li.selector [contenteditable]'
        : 'li.selector:not(.removed) [contenteditable]';
    return Array.from(qsa$(li, qsel)).map(a => a.dataset.ugly);
}
```

---

### Filter Management Functions

#### `toPrettySelector(selector: string): string`

Converts a stored selector to human-readable format, handling procedural filters.

```javascript
function toPrettySelector(selector) {
    if (selector.startsWith('{') === false) { return selector; }
    try {
        return JSON.parse(selector).raw;
    } catch {
    }
    return selector;
}
```

---

#### `dataFromDOM(): Map<string, string[]>`

Extracts all hostname/selector data from the current DOM state.

```javascript
function dataFromDOM() {
    const data = new Map();
    for (const hostnameNode of qsa$('li.hostname')) {
        const hostname = hostnameFromNode(hostnameNode);
        const selectors = [];
        for (const selectorNode of qsa$(hostnameNode, 'li.selector')) {
            selectors.push(selectorFromNode(selectorNode));
        }
        data.set(hostname, selectors);
    }
    return data;
}
```

This function is used during rendering to merge stored data with current DOM state (handles concurrent edits).

---

#### `removeSelectorsFromHostname(node: Element): Promise<void>`

Removes selectors marked as "removed" from storage.

```javascript
async function removeSelectorsFromHostname(node) {
    const hostnameNode = node.closest('li.hostname');
    if (hostnameNode === null) { return; }
    const hostname = hostnameFromNode(hostnameNode);
    if (hostname === undefined) { return; }
    const selectors = Array.from(
        qsa$(hostnameNode, 'li.selector.removed [contenteditable]')
    ).map(a => a.dataset.ugly);
    if (selectors.length === 0) { return; }
    dom.cl.add(dom.body, 'readonly');
    updateContentEditability();
    await sendMessage({ what: 'removeCustomFilters', hostname, selectors });
    await debounceRenderCustomFilters();
    dom.cl.remove(dom.body, 'readonly');
    updateContentEditability();
}
```

**Flow:**
1. Get hostname node
2. Find all selectors marked with `.removed` class
3. Send message to background to remove from storage
4. Re-render the list

---

#### `unremoveSelectorsFromHostname(node: Element): Promise<void>`

Restores (un-removes) selectors that were previously removed.

```javascript
async function unremoveSelectorsFromHostname(node) {
    const hostnameNode = node.closest('li.hostname');
    if (hostnameNode === null) { return; }
    const hostname = hostnameFromNode(hostnameNode);
    if (hostname === undefined) { return; }
    const selectors = Array.from(
        qsa$(hostnameNode, 'li.selector:not(.removed) [contenteditable]')
    ).map(a => a.dataset.ugly);
    if (selectors.length === 0) { return; }
    dom.cl.add(dom.body, 'readonly');
    updateContentEditability();
    await sendMessage({ what: 'addCustomFilters', hostname, selectors });
    await debounceRenderCustomFilters();
    dom.cl.remove(dom.body, 'readonly');
    updateContentEditability();
}
```

---

#### `onHostnameChanged(target: Element, before: string, after: string): Promise<void>`

Handles hostname edit changes.

```javascript
async function onHostnameChanged(target, before, after) {
    const uglyAfter = punycode.toASCII(after);
    if (isValidHostname(uglyAfter) === false) {
        target.textContent = before;
        return;
    }

    dom.cl.add(dom.body, 'readonly');
    updateContentEditability();

    // Remove old hostname from storage
    await sendMessage({
        what: 'removeAllCustomFilters',
        hostname: target.dataset.ugly,
    });

    // Add selectors under new hostname to storage
    target.dataset.ugly = uglyAfter;
    target.dataset.pretty = after;
    await sendMessage({
        what: 'addCustomFilters',
        hostname: hostnameFromNode(target),
        selectors: selectorsFromNode(target),
    });

    await debounceRenderCustomFilters();
    dom.cl.remove(dom.body, 'readonly');
    updateContentEditability();
}
```

**Flow:**
1. Validate new hostname
2. Remove all selectors from old hostname
3. Add all selectors to new hostname
4. Re-render

---

#### `onSelectorChanged(target: Element, before: string, after: string): Promise<void>`

Handles selector edit changes with validation.

```javascript
async function onSelectorChanged(target, before, after) {
    // Validate selector using static-filtering-parser
    const parserModule = await import('./static-filtering-parser.js');
    const compiler = new parserModule.ExtSelectorCompiler({ nativeCssHas: true });
    const result = {};
    if (compiler.compile(after, result) === false) {
        target.textContent = before;
        return;
    }

    const hostname = hostnameFromNode(target);

    dom.cl.add(dom.body, 'readonly');
    updateContentEditability();

    // Remove old selector from storage
    await sendMessage({
        what: 'removeCustomFilters',
        hostname,
        selectors: [target.dataset.ugly],
    });

    // Add new selector to storage
    target.dataset.ugly = result.compiled;
    target.dataset.pretty = result.raw;
    await sendMessage({
        what: 'addCustomFilters',
        hostname,
        selectors: [result.compiled],
    });

    await debounceRenderCustomFilters();
    dom.cl.remove(dom.body, 'readonly');
    updateContentEditability();
}
```

**Flow:**
1. Compile selector to verify it's valid
2. Remove old selector from storage
3. Add new (compiled) selector to storage
4. Re-render

---

### Rendering Functions

#### `renderCustomFilters(): Promise<void>`

Renders all custom filters from storage.

```javascript
async function renderCustomFilters() {
    const data = await sendMessage({ what: 'getAllCustomFilters' });
    if (Boolean(data) === false) { return; }
    const storedData = new Map(data);
    const domData = dataFromDOM();
    const hostnames = Array.from(
        new Set([
            ...Array.from(storedData.keys()),
            ...Array.from(domData.keys()),
        ])
    ).sort();
    const fragment = document.createDocumentFragment();
    for (const hostname of hostnames) {
        const hostnameNode = nodeFromTemplate('customFiltersHostname');
        const label = qs$(hostnameNode, 'span.hostname');
        label.dataset.ugly = hostname;
        const pretty = punycode.toUnicode(hostname);
        label.dataset.pretty = pretty;
        dom.text(label, pretty);
        const storedSelectors = new Set(storedData.get(hostname));
        const domSelectors = new Set(domData.get(hostname));
        const selectors = Array.from(
            new Set([
                ...Array.from(storedSelectors),
                ...Array.from(domSelectors),
            ])
        ).sort();
        const ulSelectors = qs$(hostnameNode, '.selectors');
        for (const selector of selectors) {
            const selectorNode = nodeFromTemplate('customFiltersSelector');
            const label = qs$(selectorNode, 'span.selector');
            label.dataset.ugly = selector;
            const pretty = toPrettySelector(selector);
            label.dataset.pretty = pretty;
            dom.text(label, pretty);
            if (storedSelectors.has(selector) === false) {
                dom.cl.add(selectorNode, 'removed');
            }
            ulSelectors.append(selectorNode);
        }
        fragment.append(hostnameNode);
    }
    dom.remove('section[data-pane="filters"] .hostnames > .hostname');
    dataContainer.prepend(fragment);
}
```

**Flow:**
1. Fetch all custom filters from storage
2. Get current DOM data
3. Merge stored + DOM data (handles concurrent edits)
4. Build DOM nodes from templates
5. Mark removed selectors
6. Replace old content

---

#### `debounceRenderCustomFilters(): Promise<void>`

Debounced version of render to prevent rapid re-renders.

```javascript
async function debounceRenderCustomFilters() {
    let { debouncer } = debounceRenderCustomFilters;
    if (debouncer === undefined) {
        debouncer = debounceRenderCustomFilters.debouncer = {};
        debouncer.promise = new Promise(resolve => {
            debouncer.resolve = resolve;
        });
    }
    if (debouncer.timer !== undefined) {
        self.clearTimeout(debouncer.timer);
    }
    debouncer.timer = self.setTimeout(() => {
        const { resolve } = debounceRenderCustomFilters.debouncer;
        debounceRenderCustomFilters.debouncer = undefined;
        renderCustomFilters().then(resolve);
    }, 151);
    return debouncer.promise;
}
debounceRenderCustomFilters.debouncer = undefined;
```

---

#### `updateContentEditability(): void`

Updates contenteditable attributes based on state.

```javascript
function updateContentEditability() {
    if (dom.cl.has(dom.body, 'readonly')) {
        dom.attr('[contenteditable]', 'contenteditable', 'false');
        return;
    }
    dom.attr('section[data-pane="filters"] li:not(.removed) [contenteditable]',
        'contenteditable',
        'plaintext-only'
    );
    // No point editing a removed hostname
    dom.attr('section[data-pane="filters"] li.hostname:not(:has(li.selector:not(.removed))) > div [contenteditable]',
        'contenteditable',
        'false'
    );
    // No point editing a removed selector
    dom.attr('section[data-pane="filters"] .selector.removed [contenteditable]',
        'contenteditable',
        'false'
    );
}
```

---

### Event Handlers

#### `onTextChanged(target: Element): void`

Central handler for text changes.

```javascript
function onTextChanged(target) {
    const before = target.dataset.pretty;
    const after = target.textContent.trim();
    if (after !== target.textContent) {
        target.textContent = after;
    }
    if (after === before) { return; }
    if (after === '') {
        target.textContent = before;
        return;
    }
    if (target.matches('.hostname')) {
        onHostnameChanged(target, before, after);
    } else if (target.matches('.selector')) {
        onSelectorChanged(target, before, after);
    }
}
```

---

#### `startEdit(ev: Event): void`, `endEdit(ev: Event): void`, `commitEdit(ev: Event): void`

Edit lifecycle handlers.

```javascript
function startEdit(ev) {
    focusedEditableContent = ev.target;
}

function endEdit(ev) {
    const { target } = ev;
    if (target.textContent !== target.dataset.pretty) {
        onTextChanged(target);
    }
    focusedEditableContent = null;
}

function commitEdit(ev) {
    const { target } = ev;
    if (target === focusedEditableContent) {
        if (ev.inputType === 'insertLineBreak') { target.blur(); }
        return;
    }
    onTextChanged(target);
}

let focusedEditableContent = null;
```

---

#### `onTrashClicked(ev: Event): void`

Handles trash icon click - marks selector as removed.

```javascript
function onTrashClicked(ev) {
    const { target } = ev;
    const node = target.closest('li.selector');
    if (node) {
        dom.cl.add(node, 'removed');
    } else {
        dom.cl.add(qsa$(target.closest('li.hostname'), 'li.selector'), 'removed');
    }
    removeSelectorsFromHostname(target);
}
```

---

#### `onUndoClicked(ev: Event): void`

Handles undo icon click - restores removed selector.

```javascript
function onUndoClicked(ev) {
    const { target } = ev;
    const node = target.closest('li.selector');
    if (node) {
        dom.cl.remove(node, 'removed');
    } else {
        dom.cl.remove(qsa$(target.closest('li.hostname'), 'li.selector'), 'removed');
    }
    unremoveSelectorsFromHostname(target);
}
```

---

### Import/Export Functions

#### `importFromText(text: string): Promise<void>`

Parses and imports filters from text.

```javascript
async function importFromText(text) {
    const parserModule = await import('./static-filtering-parser.js');
    const parser = new parserModule.AstFilterParser({ nativeCssHas: true });
    const lines = text.split(/\n/);
    const hostnameToSelectorsMap = new Map();

    for (const line of lines) {
        parser.parse(line);
        if (parser.hasError()) { continue; }
        if (parser.isCosmeticFilter() === false) { continue; }
        if (parser.hasOptions() === false) { continue; }
        const { compiled, exception } = parser.result;
        if (compiled === undefined) { continue; }
        if (exception) { continue; }
        const hostnames = new Set();
        for (const { hn, not, bad } of parser.getExtFilterDomainIterator()) {
            if (bad) { continue; }
            if (hn.includes('/')) { continue; }
            if (hn.includes('*')) { continue; }
            if (not) { hostnames.length = 0; break; }
            hostnames.add(hn);
        }
        for (const hn of hostnames) {
            const selectors = hostnameToSelectorsMap.get(hn) || new Set();
            if (selectors.size === 0) {
                hostnameToSelectorsMap.set(hn, selectors)
            }
            selectors.add(compiled);
        }
    }

    if (hostnameToSelectorsMap.size === 0) { return; }

    dom.cl.add(dom.body, 'readonly');
    updateContentEditability();

    const promises = [];
    for (const [hostname, selectors] of hostnameToSelectorsMap) {
        promises.push(
            sendMessage({
                what: 'addCustomFilters',
                hostname,
                selectors: Array.from(selectors),
            })
        );
    }
    await Promise.all(promises);

    await debounceRenderCustomFilters();
    dom.cl.remove(dom.body, 'readonly');
    updateContentEditability();
}
```

**Flow:**
1. Parse each line using AstFilterParser
2. Extract cosmetic filters only (filters with `##`)
3. Extract hostnames from filter options
4. Group selectors by hostname
5. Add all to storage
6. Re-render

---

#### `importFromTextarea(): void`

Imports from the textarea element.

```javascript
function importFromTextarea() {
    dom.prop('section[data-pane="filters"] details', 'open', false);
    const textarea = qs$('section[data-pane="filters"] .importFromText textarea');
    importFromText(textarea.value);
    textarea.value = '';
}
```

---

#### `importFromFile(): void`

Opens file picker and imports selected file.

```javascript
function importFromFile() {
    const input = qs$('section[data-pane="filters"] input[type="file"]');
    input.onchange = ev => {
        input.onchange = null;
        const file = ev.target.files[0];
        if (file === undefined || file.name === '') { return; }
        const fr = new FileReader();
        fr.onload = () => {
            if (typeof fr.result !== 'string') { return; }
            importFromText(fr.result);
        };
        fr.readAsText(file);
    };
    input.value = '';
    input.click();
    dom.prop('section[data-pane="filters"] details', 'open', false);
}
```

---

#### `exportToFile(): void`

Exports all filters to a downloadable file.

```javascript
function exportToFile() {
    const lines = [];
    for (const hostnameNode of qsa$('.hostnames li.hostname')) {
        const hostname = punycode.toUnicode(hostnameFromNode(hostnameNode));
        const selectors = selectorsFromNode(hostnameNode);
        for (const selector of selectors) {
            lines.push(`${hostname}##${toPrettySelector(selector)}`);
        }
        lines.push('');
    }
    const text = lines.join('\n').trim();
    if (text.length === 0) { return; }
    const a = document.createElement('a');
    a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(text + '\n')}`;
    dom.attr(a, 'download', 'my-ubol-filters.txt');
    dom.attr(a, 'type', 'text/plain');
    a.click();
    dom.prop('section[data-pane="filters"] details', 'open', false);
}
```

---

### Initialization

#### `start(): void`

Main initialization function.

```javascript
async function start() {
    renderCustomFilters();

    dom.on(dataContainer, 'focusin', 'section[data-pane="filters"] [contenteditable]', startEdit);
    dom.on(dataContainer, 'focusout', 'section[data-pane="filters"] [contenteditable]', endEdit);
    dom.on(dataContainer, 'input', 'section[data-pane="filters"] [contenteditable]', commitEdit);
    dom.on(dataContainer, 'click', 'section[data-pane="filters"] .remove', onTrashClicked);
    dom.on(dataContainer, 'click', 'section[data-pane="filters"] .undo', onUndoClicked);
    dom.on('section[data-pane="filters"] [data-i18n="addButton"]', 'click', importFromTextarea);
    dom.on('section[data-pane="filters"] [data-i18n="importAndAppendButton"]', 'click', importFromFile);
    dom.on('section[data-pane="filters"] [data-i18n="exportButton"]', 'click', exportToFile);

    browser.storage.local.onChanged.addListener((changes, area) => {
        if (area !== undefined && area !== 'local') { return; }
        if (Object.keys(changes).some(a => a.startsWith('site.'))) {
            debounceRenderCustomFilters();
        }
    });
}
```

---

## Background Messaging

The following messages are sent to the background script:

### `getAllCustomFilters`

Request all custom filters from storage.

```javascript
await sendMessage({ what: 'getAllCustomFilters' });
// Returns: Map<hostname, string[]> or undefined
```

---

### `addCustomFilters`

Add selectors to a hostname.

```javascript
await sendMessage({
    what: 'addCustomFilters',
    hostname: 'example.com',
    selectors: ['.ad-banner', '.sidebar']
});
```

---

### `removeCustomFilters`

Remove specific selectors from a hostname.

```javascript
await sendMessage({
    what: 'removeCustomFilters',
    hostname: 'example.com',
    selectors: ['.ad-banner']
});
```

---

### `removeAllCustomFilters`

Remove all selectors for a hostname.

```javascript
await sendMessage({
    what: 'removeAllCustomFilters',
    hostname: 'example.com'
});
```

---

## Background Service Worker Functions

The background service worker handles the actual storage and injection of custom filters. These functions are in `filter-manager.js`:

### Storage Format

Custom filters are stored in browser `localStorage` with keys prefixed with `site.`:
- Key format: `site.{hostname}`
- Value: Array of compiled CSS selectors

Examples:
- `site.example.com` → `[".ad-banner", "div.sidebar"]`
- `site.sub.example.com` → `[".promo"]`

### `customFiltersFromHostname(hostname: string): Promise<string[]>`

Gets all custom filters for a hostname, including parent domains.

```javascript
export async function customFiltersFromHostname(hostname) {
    const promises = [];
    let hn = hostname;
    while (hn !== '') {
        promises.push(readFromStorage(`site.${hn}`));
        const pos = hn.indexOf('.');
        if (pos === -1) { break; }
        hn = hn.slice(pos + 1);
    }
    const results = await Promise.all(promises);
    const out = [];
    for (let i = 0; i < promises.length; i++) {
        const selectors = results[i];
        if (selectors === undefined) { continue; }
        selectors.forEach(selector => {
            out.push(selector.startsWith('0') ? selector.slice(1) : selector);
        });
    }
    return out.sort();
}
```

**Flow:**
1. Start with the full hostname
2. For each level (example.com, com), fetch selectors
3. Filter out selectors prefixed with '0' (disabled)
4. Return sorted list

---

### `hasCustomFilters(hostname: string): Promise<boolean>`

Checks if a hostname has any custom filters.

```javascript
export async function hasCustomFilters(hostname) {
    const selectors = await customFiltersFromHostname(hostname);
    return selectors?.length ?? 0;
}
```

---

### `getAllCustomFilters(): Promise<Array<[string, string[]]>>`

Gets all custom filters across all hostnames.

```javascript
export async function getAllCustomFilters() {
    const collect = async key => {
        const selectors = await readFromStorage(key);
        return [key.slice(5), selectors.map(a => a.startsWith('0') ? a.slice(1) : a)];
    };
    const keys = await getAllCustomFilterKeys();
    const promises = keys.map(k => collect(k));
    return Promise.all(promises);
}
```

Returns: `[["hostname1", ["selector1", "selector2"]], ["hostname2", ["selector3"]]]`

---

### `getAllCustomFilterKeys(): Promise<string[]>`

Gets all storage keys starting with `site.`.

```javascript
async function getAllCustomFilterKeys() {
    const storageKeys = await keysFromStorage() || [];
    return storageKeys.filter(a => a.startsWith('site.'));
}
```

---

### `addCustomFilters(hostname: string, toAdd: string[]): Promise<boolean>`

Adds selectors to a hostname's filter list.

```javascript
export async function addCustomFilters(hostname, toAdd) {
    if (hostname === '') { return false; }
    const key = `site.${hostname}`;
    const selectors = await readFromStorage(key) || [];
    const countBefore = selectors.length;
    for (const selector of toAdd) {
        if (selectors.includes(selector)) { continue; }
        selectors.push(selector);
    }
    if (selectors.length === countBefore) { return false; }
    selectors.sort();
    writeToStorage(key, selectors);
    return true;
}
```

**Features:**
- Prevents duplicates
- Sorts selectors alphabetically
- Returns `true` if filters were added

---

### `removeAllCustomFilters(hostname: string): Promise<boolean>`

Removes all selectors for a hostname.

```javascript
export async function removeAllCustomFilters(hostname) {
    if (hostname === '*') {
        const keys = await getAllCustomFilterKeys();
        if (keys.length === 0) { return false; }
        for (const key of keys) {
            removeFromStorage(key);
        }
        return true;
    }
    const key = `site.${hostname}`;
    const selectors = await readFromStorage(key) || [];
    removeFromStorage(key);
    return selectors.length !== 0;
}
```

**Special handling:**
- `hostname === '*'` clears ALL custom filters

---

### `removeCustomFilters(hostname: string, selectors: string[]): Promise<boolean>`

Removes specific selectors from a hostname and its parent domains.

```javascript
export async function removeCustomFilters(hostname, selectors) {
    const promises = [];
    let hn = hostname;
    while (hn !== '') {
        promises.push(removeCustomFiltersByKey(`site.${hn}`, selectors));
        const pos = hn.indexOf('.');
        if (pos === -1) { break; }
        hn = hn.slice(pos + 1);
    }
    const results = await Promise.all(promises);
    return results.some(a => a);
}
```

---

### `injectCustomFilters(tabId: number, frameId: number, hostname: string): Promise`

Injects custom filters into a page via content script.

```javascript
export async function injectCustomFilters(tabId, frameId, hostname) {
    const selectors = await customFiltersFromHostname(hostname);
    if (selectors.length === 0) { return; }
    const promises = [];
    const plainSelectors = selectors.filter(a => a.startsWith('{') === false);
    if (plainSelectors.length !== 0) {
        promises.push(
            browser.scripting.insertCSS({
                css: `${plainSelectors.join(',\n')}{display:none!important;}`,
                origin: 'USER',
                target: { tabId, frameIds: [frameId] },
            })
        );
    }
    const proceduralSelectors = selectors.filter(a => a.startsWith('{'));
    if (proceduralSelectors.length !== 0) {
        promises.push(
            browser.scripting.executeScript({
                files: ['/js/scripting/css-procedural-api.js'],
                target: { tabId, frameIds: [frameId] },
                injectImmediately: true,
            })
        );
    }
    await Promise.all(promises);
    return { plainSelectors, proceduralSelectors };
}
```

**Features:**
- Separates plain CSS selectors from procedural filters
- Plain selectors injected via `insertCSS` API
- Procedural filters require script injection
- Returns info about injected filter types

---

### `startCustomFilters(tabId: number, frameId: number): Promise`

Starts custom filters for a page frame.

```javascript
export function startCustomFilters(tabId, frameId) {
    return browser.scripting.executeScript({
        files: ['/js/scripting/css-user.js'],
        target: { tabId, frameIds: [frameId] },
        injectImmediately: true,
    });
}
```

---

### `terminateCustomFilters(tabId: number, frameId: number): Promise`

Stops custom filters for a page frame.

```javascript
export function terminateCustomFilters(tabId, frameId) {
    return browser.scripting.executeScript({
        files: ['/js/scripting/css-user-terminate.js'],
        target: { tabId, frameIds: [frameId] },
        injectImmediately: true,
    });
}
```

---

### `registerCustomFilters(context: object): Promise`

Registers custom filters with the content script system for automatic injection.

```javascript
export async function registerCustomFilters(context) {
    const siteKeys = await getAllCustomFilterKeys();
    if (siteKeys.length === 0) { return; }

    const { none } = context.filteringModeDetails;
    let hostnames = siteKeys.map(a => a.slice(5));
    if (none.has('all-urls')) {
        const { basic, optimal, complete } = context.filteringModeDetails;
        hostnames = intersectHostnameIters(hostnames, [
            ...basic, ...optimal, ...complete
        ]);
    } else if (none.size !== 0) {
        hostnames = [...subtractHostnameIters(hostnames, none)];
    }
    if (hostnames.length === 0) { return; }

    const directive = {
        id: 'css-user',
        js: ['/js/scripting/css-user.js'],
        matches: matchesFromHostnames(hostnames),
        runAt: 'document_start',
    };

    context.toAdd.push(directive);
}
```

---

## Procedural Filters

Custom filters support procedural cosmetic filters (Extended CSS) using JSON format:

### Format

```json
{"raw": ".ad-banner", "style": {"display": "none"}}
```

The selector is prefixed with `0` in storage when disabled:
- `{"raw": ".ad-banner", ...}` - enabled
- `0{"raw": ".ad-banner", ...}` - disabled

### Storage Key Prefix

In storage, selectors starting with `{` (procedural) or `0{` (disabled procedural) are identified as procedural filters.

### Parsing

The `toPrettySelector()` function handles procedural filters:

```javascript
function toPrettySelector(selector) {
    if (selector.startsWith('{') === false) { return selector; }
    try {
        return JSON.parse(selector).raw;
    } catch {
    }
    return selector;
}
```

---

## UI States

### Readonly State

When performing operations, the body gets `readonly` class:
- All contenteditable elements become non-editable
- Prevents race conditions during save/load

```css
body.readonly section[data-pane="filters"] .hostnames {
    pointer-events: none;
    opacity: 0.5;
}
```

### Removed State

Selectors marked for removal get `.removed` class:
- Visual strikethrough styling
- Hidden from active filters
- Can be restored via undo button

```css
section[data-pane="filters"] li.selector.removed {
    opacity: 0.5;
    text-decoration: line-through;
}
```

---

## CSS Styles

Key CSS rules for the filters pane (`settings.css`):

```css
/* Hostname list container */
body section[data-pane="filters"] .hostnames {
    padding: 0;
    margin: 0;
    list-style: none;
}

/* Hostname item */
section[data-pane="filters"] .hostnames > li.hostname > div {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.5em;
}

/* Selector list */
section[data-pane="filters"] ul ul {
    padding-inline-start: 1.5em;
}

/* Contenteditable styling */
section[data-pane="filters"] li [contenteditable] {
    outline: none;
    border-radius: var(--border-radius);
    padding: 0.25em 0.5em;
}

section[data-pane="filters"] li [contenteditable]:focus {
    background-color: var(--surface-1);
}

/* Import/Export aside */
section[data-pane="filters"] aside {
    padding: 1em;
    border-top: 1px solid var(--border-color);
}

section[data-pane="filters"] aside details {
    margin-top: 0.5em;
}
```

---

## Unpicker Tool

The "unpicker" is a tool that allows users to view and manage custom filters for the **current page** from within the page itself. It's opened from the picker/zapper tool when viewing filters for a page.

### HTML Structure (`unpicker-ui.html`)

```html
<!DOCTYPE html>
<html id="ubol-unpicker">
<head>
    <title>uBO Lite Unpicker</title>
    <link rel="stylesheet" href="/css/default.css">
    <link rel="stylesheet" href="/css/common.css">
    <link rel="stylesheet" href="/css/fa-icons.css">
    <link rel="stylesheet" href="/css/tool-overlay-ui.css">
    <link rel="stylesheet" href="/css/unpicker-ui.css">
</head>
<body class="loading">
    <aside>
        <section id="windowbar">
            <div id="minimize">...</div>
            <div id="move"></div>
            <div id="quit">...</div>
        </section>
        <section>
            <span>unpickerUsage</span>
        </section>
        <section id="customFilters"></section>
    </aside>
    <svg id="overlay">...</svg>
    <template id="customFilterRow">
        <div class="customFilter">
            <span class="selector"></span>
            <span class="remove fa-icon">trash-o</span>
            <span class="undo fa-icon">undo</span>
        </div>
    </template>
</body>
</html>
```

### Key Functions in `unpicker-ui.js`

#### `populateFilters(selectors: string[]): void`

Populates the custom filters list for the current page.

```javascript
function populateFilters(selectors) {
    const container = qs$('#customFilters');
    dom.clear(container);
    const rowTemplate = qs$('template#customFilterRow');
    for (const selector of selectors) {
        const fragment = rowTemplate.content.cloneNode(true);
        const row = qs$(fragment, '.customFilter');
        row.dataset.selector = selector;
        let text = selector;
        if (selector.startsWith('{')) {
            const o = JSON.parse(selector);
            text = o.raw;
        }
        qs$(row, '.selector').textContent = text;
        container.append(fragment);
    }
    autoSelectFilter();
}
```

#### `highlight(): void`

Highlights selected filters on the page.

```javascript
function highlight() {
    const selectors = [];
    for (const selectorElem of qsa$('#customFilters .customFilter.on')) {
        selectors.push(selectorElem.dataset.selector);
    }
    if (selectors.length !== 0) {
        toolOverlay.postMessage({
            what: 'highlightFromSelector',
            selector: selectors.join(','),
            scrollTo: true,
        });
    } else {
        toolOverlay.postMessage({ what: 'unhighlight' });
    }
}
```

#### `onFilterClicked(ev: Event): void`

Handles clicks on filter items - toggle, remove, or restore.

```javascript
function onFilterClicked(ev) {
    const filterElem = target.closest('.customFilter');
    // Toggle filter on/off
    if (target === selectorElem) {
        if (dom.cl.has(filterElem, 'on')) {
            dom.cl.remove(filterElem, 'on');
        } else {
            dom.cl.remove('.customFilter.on', 'on');
            dom.cl.add(filterElem, 'on');
        }
        highlight();
        return;
    }
    // Remove filter
    if (target === trashElem) {
        dom.cl.add(filterElem, 'removed');
        toolOverlay.sendMessage({
            what: 'removeCustomFilters',
            hostname: toolOverlay.url.hostname,
            selectors: [selector],
        });
        return;
    }
    // Restore filter
    if (target === undoElem) {
        dom.cl.remove(filterElem, 'removed');
        toolOverlay.sendMessage({
            what: 'addCustomFilters',
            hostname: toolOverlay.url.hostname,
            selectors: [selector],
        });
        return;
    }
}
```

#### `autoSelectFilter(): void`

Automatically selects the first non-removed filter when unpicker opens.

```javascript
function autoSelectFilter() {
    let filterElem = qs$('.customFilter.on');
    if (filterElem !== null) { return; }
    filterElem = qs$('.customFilter:not(.removed)');
    if (filterElem !== null) {
        dom.cl.add(filterElem, 'on');
    }
    highlight();
}
```

#### `startUnpicker(): Promise<void>`

Initializes the unpicker tool.

```javascript
async function startUnpicker() {
    const selectors = await toolOverlay.sendMessage({
        what: 'customFiltersFromHostname',
        hostname: toolOverlay.url.hostname,
    });
    if (selectors.length === 0) {
        return quitUnpicker();
    }
    await toolOverlay.postMessage({ what: 'terminateCustomFilters' });
    await toolOverlay.postMessage({ what: 'startTool' });
    populateFilters(selectors);
}
```

### Workflow

1. User opens picker/zapper on a page
2. User clicks "unpicker" button (if available)
3. `customFiltersFromHostname` fetilters filters for current hostname
4. User can toggle, remove, or restore filters
5. Changes are immediately saved to storage
6. On quit, `startCustomFilters` is called to re-enable filters

### Interaction with Picker

The unpicker works in conjunction with the picker:
- Picker creates filters → stored via `addCustomFilters`
- Unpicker manages existing filters → add/remove via messaging
- Both tools share the same underlying filter storage

---

## Testing Considerations

### Manual Tests

1. **Add hostname and selector**
   - Click on empty area in hostnames list
   - Type hostname, press Enter
   - Type selector, press Enter

2. **Edit hostname**
   - Click on hostname text
   - Modify and blur
   - Verify old hostname removed, new one added

3. **Edit selector**
   - Click on selector text
   - Modify and blur
   - Verify selector updated in storage

4. **Remove selector**
   - Click trash icon
   - Selector should be marked removed
   - Verify removed from storage

5. **Restore selector**
   - Click undo icon
   - Selector should be restored
   - Verify added to storage

6. **Import filters**
   - Open Import/Export details
   - Paste `example.com##.ad-banner`
   - Click Add
   - Verify hostname and selector appear

7. **Export filters**
   - Add some filters
   - Click Export
   - Verify downloaded file contains correct format

### Playwright Tests

See `tests/dashboard_tests/dashboard-filters.spec.ts` for automated tests.

---

## Differences from Reference (uBlock-mv3)

The uBlock-mv3 reference has two implementations:

1. **MV3 inline** - What we're implementing (hostname→selector tree)
2. **Standalone** - Full CodeMirror editor (`1p-filters.html`)

The standalone version includes:
- CodeMirror text editor for raw filter syntax
- Enable/Trust checkboxes for filter list
- Apply/Revert buttons
- Full filter syntax support (not just cosmetic)

Our current implementation focuses on the MV3 inline approach which is more user-friendly for managing cosmetic filters visually.

---

## Cosmetic vs Network Filters

### Cosmetic Filters (My Filters Tab)

These hide elements on pages:
- Format: `hostname##selector`
- Examples:
  - `example.com##.ad-banner` - Hide .ad-banner on example.com
  - `##.ad` - Hide .ad everywhere
  - `example.com##div[id="promo"]` - Procedural filter

### Network Filters (My Rules Tab)

These block network requests:
- Handled in the "develop" pane
- Uses declarative rules (DNR API)
- Not covered in this document

---

## Integration with Picker

The Picker tool allows users to visually select elements and create filters. When a filter is created from the picker, it uses the same custom filters system.

### Flow

1. User clicks "Create filter" in picker
2. Picker sends `addCustomFilters` message with hostname and selector
3. Background stores the filter
4. When dashboard is opened, `renderCustomFilters()` loads all filters
5. Filter appears in the hostname list

### Source Files

- `src/js/scripting/picker-ui.js` - Handles filter creation from picker
- `src/unpicker-ui.html` - Shows custom filters for a hostname

### Unpicker

The "unpicker" is a tool to view/manage custom filters for the current page:

```javascript
// From unpicker-ui.js
const container = qs$('#customFilters');
// ...
what: 'customFiltersFromHostname',
hostname: details.hostname
```

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Render hostname list | ✅ Done | Via renderCustomFilters() |
| Edit hostname inline | ✅ Done | Via onHostnameChanged() |
| Edit selector inline | ✅ Done | Via onSelectorChanged() |
| Remove selector | ✅ Done | Via onTrashClicked() |
| Restore selector | ✅ Done | Via onUndoClicked() |
| Import from text | ✅ Done | Via importFromText() |
| Import from file | ✅ Done | Via importFromFile() |
| Export to file | ✅ Done | Via exportToFile() |
| Storage integration | ✅ Done | Via messaging |
| Real-time updates | ✅ Done | Via storage listener |

---

## References

- [uBlock Origin Wiki: Dashboard - My filters](https://github.com/gorhill/uBlock/wiki/Dashboard:-My-filters)
- [Cosmetic filter syntax](https://github.com/gorhill/uBlock/wiki/Cosmetic-filter)
- [Procedural cosmetic filters](https://github.com/gorhill/uBlock/wiki/Procedural-cosmetic-filters)
