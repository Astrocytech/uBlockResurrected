# Picker Implementation Documentation

This document describes the Picker feature implementation. The picker allows users to visually select DOM elements and generate CSS selectors or procedural filters for content blocking.

---

## Overview

The picker is an **element selection tool** that:
- Highlights elements on hover (desktop) or tap (touch)
- Generates CSS selector candidates
- Allows specificity adjustment via slider
- Supports procedural filters (Extended CSS)
- Creates filters and saves to user filter list
- Uses MV3-compliant `scripting.executeScript` API

**Important:** The picker generates and saves cosmetic filters to block elements on future page loads.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CHROME EXTENSION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │      Popup        │                                                      │
│  │   (popup.js)      │                                                      │
│  └────────┬─────────┘                                                      │
│           │ scripting.executeScript                                         │
│           ▼                                                                 │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                        WEB PAGE                                     │    │
│  │  ┌─────────────────┐                                               │    │
│  │  │ picker.js       │  ← Content script (injected)                    │    │
│  │  │ tool-overlay.js │    - Handles DOM manipulation                  │    │
│  │  │ css-procedural-api.js │ - Procedural filter engine              │    │
│  │  └────────┬────────┘                                               │    │
│  │           │                                                           │    │
│  │           │ MessageChannel                                            │    │
│  │           ▼                                                           │    │
│  │  ┌───────────────────────────────────────────────────────────────┐ │    │
│  │  │                   IFRAME (picker-ui.html)                      │ │    │
│  │  │                                                                │ │    │
│  │  │  ┌─────────────────────────────────────────────────────────┐  │ │    │
│  │  │  │              picker-ui.js (imported)                    │  │ │    │
│  │  │  │  - Handles UI events                                   │  │ │    │
│  │  │  │  - Selector building                                   │  │ │    │
│  │  │  │  - Filter creation                                     │  │ │    │
│  │  │  └─────────────────────────────────────────────────────────┘  │ │    │
│  │  │                                                                │ │    │
│  │  │  ┌─────────────────────────────────────────────────────────┐  │ │    │
│  │  │  │         tool-overlay-ui.js (imported)                  │  │ │    │
│  │  │  │  - Handles mouse/touch events                        │  │ │    │
│  │  │  │  - Sends messages to content script                 │  │ │    │
│  │  │  │  - Updates SVG overlay                               │  │ │    │
│  │  │  └─────────────────────────────────────────────────────────┘  │ │    │
│  │  │                                                                │ │    │
│  │  │  ┌──────────────┐ ┌────────┐ ┌────────┐ ┌──────────┐      │ │    │
│  │  │  │    QUIT      │ │  PICK  │ │ PREVIEW │ │  CREATE  │      │ │    │
│  │  │  └──────────────┘ └────────┘ └────────┘ └──────────┘      │ │    │
│  │  │                                                                │ │    │
│  │  │  ┌─────────────────────────────────────────────────────────┐  │ │    │
│  │  │  │              SVG Overlay (highlighting)                  │  │ │    │
│  │  │  └─────────────────────────────────────────────────────────┘  │ │    │
│  │  └───────────────────────────────────────────────────────────────┘ │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│           │ browser.runtime.sendMessage                                     │
│           ▼                                                                 │
│  ┌──────────────────┐                                                      │
│  │    Background    │                                                      │
│  │ (service worker) │                                                      │
│  │  - insertCSS    │                                                      │
│  │  - addCustomFilters                                                     │
│  └──────────────────┘                                                      │
│                                                                             │
└────────────────────���────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── js/
│   ├── scripting/
│   │   ├── tool-overlay.js      # Content script (REUSED from zapper)
│   │   ├── tool-overlay-ui.js  # UI logic (REUSED from zapper)
│   │   ├── picker-ui.js         # Picker UI entry point
│   │   ├── picker.js          # Picker content script
│   │   ├── dom.js            # DOM utility functions
│   │   └── ext.js            # Extension API utilities
│   └── popup.ts              # Popup handler
├── picker-ui.html               # HTML loaded in iframe
└── css/
    ├── tool-overlay-ui.css      # Shared overlay styles (REUSED from zapper)
    └── picker-ui.css           # Picker-specific styles
```

**Note:** The following files are shared with the Zapper and should not be duplicated:
- `tool-overlay.js` - provides the foundational ubolOverlay singleton
- `tool-overlay-ui.js` - provides the toolOverlay communication bridge
- `tool-overlay-ui.css` - shared overlay styling

---

## Shared Components with Zapper

The Picker reuses several core components from the Zapper:

| Component | File | Reused By | Description |
|-----------|------|----------|-------------|
| `ubolOverlay` | `tool-overlay.js` | Both | Singleton for overlay management |
| `toolOverlay` | `tool-overlay-ui.js` | Both | Iframe communication bridge |
| CSS | `tool-overlay-ui.css` | Both | Shared SVG overlay styles |
| DOM utilities | `dom.js` | Both | Query/manipulation helpers |
| Extension utils | `ext.js` | Both | API and i18n helpers |

**Key differences:**
- Zapper: element removal from DOM only
- Picker: selector generation + filter creation

---

## Flow 1: Activation from Popup

### 1.1 User clicks Picker icon

**File:** `popup.html`
```html
<span id="gotoPicker" class="tool enabled" tabindex="0">
    ...
</span>
```

### 1.2 Event handler

**File:** `src/js/popup.ts` (or `popup.js`)
```javascript
dom.on('#gotoPicker', 'click', async ( ) => {
    if ( browser.scripting === undefined ) { return; }
    const tab = await getCurrentTab();
    if ( tab.id === undefined ) { return; }
    browser.scripting.executeScript({
        files: [
            '/js/scripting/css-procedural-api.js',
            '/js/scripting/tool-overlay.js',
            '/js/scripting/picker.js',
        ],
        target: { tabId: tab.id },
    });
    self.close();
});

async function getCurrentTab() {
    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    return tabs[0];
}
```

**Notes:**
- `css-procedural-api.js` provides procedural filter support
- Three files are injected: tool-overlay.js, picker.js, and css-procedural-api.js
- The popup closes after injection
- `getCurrentTab()` must be called first to get the tab ID for injection

---

## Flow 2: Content Script (tool-overlay.js)

**Important:** There are two separate overlay objects:
- `ubolOverlay` - Runs in the **content script** (page context) - **SHARED with Zapper**
- `toolOverlay` - Runs in the **iframe UI** (isolated context) - **SHARED with Zapper**

**Note:** This file is **identical to Zapper.md Flow 2**. The following additions are Picker-specific:

### 2.1 Picker-Specific Additions

```javascript
// Additional methods in ubolOverlay (Picker extends basic overlay):

elementsFromSelector(selector) {
    const elems = this.qsa(document, selector);
    return { elems, error: this.qsa.error };
}

qsa(node, selector) {
    if ( node === null ) { return []; }
    if ( selector.startsWith('{') ) {
        if ( this.proceduralFiltererAPI === undefined ) {
            if ( self.ProceduralFiltererAPI === undefined ) { return []; }
            this.proceduralFiltererAPI = new self.ProceduralFiltererAPI();
        }
        return this.proceduralFiltererAPI.qsa(selector);
    }
    selector = selector.replace(/::[^:]+$/, '');
    try {
        const elems = node.querySelectorAll(selector);
        this.qsa.error = undefined;
        return elems;
    } catch (reason) {
        this.qsa.error = `${reason}`;
    }
    return [];
}
```

See Zapper.md Flow 2 for base implementation:
- `ubolOverlay` singleton with secret attribute
- `start()`, `stop()`, `sendMessage()`, `onMessage()`, `postMessage()`
- `install()` - iframe creation with MessageChannel
- ESC key handler
- `elementFromPoint()`, `highlightElements()`, `highlightUpdate()`, etc.
    if ( self.ubolOverlay.onmessage ) {
        self.ubolOverlay.onmessage({ what: 'quitTool' });
    }
}
```

### 2.6 Key Methods for Picker

```javascript
elementFromPoint(x, y) {
    if ( x !== undefined ) {
        this.lastX = x; this.lastY = y;
    } else if ( this.lastX !== undefined ) {
        x = this.lastX; y = this.lastY;
    } else {
        return null;
    }
    const magicAttr = `${this.secretAttr}-click`;
    this.frame.setAttribute(magicAttr, '');
    let elem = document.elementFromPoint(x, y);
    if ( elem === document.body || elem === document.documentElement ) {
        elem = null;
    }
    this.frame.removeAttribute(magicAttr);
    return elem;
}

highlightElements(iter = []) {
    this.highlightedElements =
        Array.from(iter).filter(a =>
            a instanceof Element && a !== this.frame
        );
    this.highlightUpdate();
}

highlightElementAtPoint(x, y) {
    const elem = self.ubolOverlay.elementFromPoint(x, y);
    this.highlightElements([ elem ]);
}

unhighlight() {
    this.highlightElements([]);
}

highlightUpdate() {
    const ow = self.innerWidth;
    const oh = self.innerHeight;
    const islands = [];
    for ( const elem of this.highlightedElements ) {
        const rect = this.getElementBoundingClientRect(elem);
        // Ignore offscreen areas
        if ( rect.left > ow ) { continue; }
        if ( rect.top > oh ) { continue; }
        if ( rect.left + rect.width < 0 ) { continue; }
        if ( rect.top + rect.height < 0 ) { continue; }
        islands.push(
            `M${rect.left} ${rect.top}h${rect.width}v${rect.height}h-${rect.width}z`
        );
    }
    this.port.postMessage({
        what: 'svgPaths',
        ocean: `M0 0h${ow}v${oh}h-${ow}z`,
        islands: islands.join(''),
    });
}

getElementBoundingClientRect(elem) {
    let rect = typeof elem.getBoundingClientRect === 'function'
        ? elem.getBoundingClientRect()
        : { height: 0, left: 0, top: 0, width: 0 };

    // Try not returning an empty bounding rect.
    if ( rect.width !== 0 && rect.height !== 0 ) {
        return rect;
    }
    if ( elem.shadowRoot instanceof DocumentFragment ) {
        return this.getElementBoundingClientRect(elem.shadowRoot);
    }
    let left = rect.left,
        right = left + rect.width,
        top = rect.top,
        bottom = top + rect.height;
    for ( const child of elem.children ) {
        rect = this.getElementBoundingClientRect(child);
        if ( rect.width === 0 || rect.height === 0 ) { continue; }
        if ( rect.left < left ) { left = rect.left; }
        if ( rect.right > right ) { right = rect.right; }
        if ( rect.top < top ) { top = rect.top; }
        if ( rect.bottom > bottom ) { bottom = rect.bottom; }
    }
    return {
        left, right,
        top, bottom,
        width: right - left,
        height: bottom - top,
    };
}

elementsFromSelector(selector) {
    const elems = this.qsa(document, selector);
    return { elems, error: this.qsa.error };
}

qsa(node, selector) {
    if ( node === null ) { return []; }
    if ( selector.startsWith('{') ) {
        if ( this.proceduralFiltererAPI === undefined ) {
            if ( self.ProceduralFiltererAPI === undefined ) { return []; }
            this.proceduralFiltererAPI = new self.ProceduralFiltererAPI();
        }
        return this.proceduralFiltererAPI.qsa(selector);
    }
    selector = selector.replace(/::[^:]+$/, '');
    try {
        const elems = node.querySelectorAll(selector);
        this.qsa.error = undefined;
        return elems;
    } catch (reason) {
        this.qsa.error = `${reason}`;
    }
    return [];
}

/******************************************************************************/

// Message handling in tool-overlay.js
onMessage(wrapped) {
    // Response to script-initiated message?
    if ( typeof wrapped?.fromScriptId === 'number' ) {
        const resolve = this.pendingMessages.get(wrapped.fromScriptId);
        if ( resolve ) {
            this.pendingMessages.delete(wrapped.fromScriptId);
            resolve(wrapped.msg);
        }
        return;
    }
    const onmessage = this.onmessage;
    const msg = wrapped.msg || wrapped;
    let response;
    switch ( msg.what ) {
    case 'startTool':
        this.start();
        break;
    case 'quitTool':
        this.stop();
        break;
    case 'highlightElementAtPoint':
        this.highlightElementAtPoint(msg.mx, msg.my);
        break;
    case 'highlightFromSelector': {
        const { elems, error } = this.elementsFromSelector(msg.selector);
        this.highlightElements(elems);
        response = { count: elems.length, error };
        break;
    }
    case 'unhighlight':
        this.unhighlight();
        break;
    }
    response = onmessage && onmessage(msg) || response;
    // Send response if this is frame-initiated message
    if ( wrapped?.fromFrameId && this.port ) {
        const { fromFrameId } = wrapped;
        if ( response instanceof Promise ) {
            response.then(response => {
                if ( this.port === null ) { return; }
                this.port.postMessage({ fromFrameId, msg: response });
            });
        } else {
            this.port.postMessage({ fromFrameId, msg: response });
        }
    }
}
```

---

## Cross-Context Communication

The picker runs in THREE separate JavaScript contexts:

1. **Popup context** - `popup.js`: Initiates picker via `scripting.executeScript`
2. **Page context (content script)** - `tool-overlay.js` + `picker.js`: Handles DOM manipulation, CSS injection
3. **Iframe context** - `picker-ui.js` + `tool-overlay-ui.js`: Handles UI events

Communication paths:
- Popup → Content Script: `chrome.scripting.executeScript`
- Content Script → Background: `browser.runtime.sendMessage`
- Content Script ↔ Iframe: `MessageChannel` via `ubolOverlay.port`

**Critical:** Code in the content script CANNOT directly reference code in the iframe. Messages must be sent via `ubolOverlay.port.postMessage()`. The iframe's `toolOverlay` object is NOT accessible from the content script.

---

## Flow 3: Picker UI (picker-ui.html + picker-ui.js)

**Note:** `tool-overlay-ui.js` is shared with Zapper. The Picker adds picker-specific logic on top.

### 3.1 HTML Structure

**File:** `src/picker-ui.html`

```html
<!DOCTYPE html>
<html id="ubol-picker" class="minimized" data-view="0">

<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<title>uBO Lite Picker</title>
<link rel="stylesheet" href="/css/default.css">
<link rel="stylesheet" href="/css/common.css">
<link rel="stylesheet" href="/css/fa-icons.css">
<link rel="stylesheet" href="/css/tool-overlay-ui.css">
<link rel="stylesheet" href="/css/picker-ui.css">
</head>

<body class="loading">
<aside style="right: 2px; bottom: 2px;">
<section id="windowbar">
    <div id="minimize"><svg viewBox="0 0 64 64"><path d="M 16,48 H 48" /><rect x="16" y="16" height="32" width="32" /></svg></div>
    <div id="move"></div>
    <div id="quit" data-i18n-title="pickerQuit"><svg viewBox="0 0 64 64"><path d="M16 16L48 48M16 48L48 16" /></svg></div>
</section>
<section data-view="2">
    <textarea spellcheck="false"></textarea>
</section>
<section class="resultsetWidgets" data-view="0">
    <span>
        <label for="slider" data-i18n="pickerSliderLabel">_</label>
        <span id="resultsetCount"></span>
    </span>
    <input id="slider" type="range" min="0" max="10" step="any">
</section>
<section id="toolbar" data-view="0">
    <div>
        <button id="pick" type="button" data-i18n="pickerPick">_<span class="hover"></span></button>
        <button id="preview" type="button" data-i18n="pickerPreview">_<span class="hover"></span></button>
    </div>
    <button id="create" type="button" class="preferred" disabled data-i18n="pickerCreate"><span class="hover"></span></button>
</section>
<section id="candidateFilters" data-view="1">
    <ul></ul>
</section>
<section id="moreOrLess">
    <span><span data-i18n="popupMoreButton"></span>&ensp;<span class="fa-icon fa-icon-vflipped">angle-up</span><span class="hover"></span></span>
    <span><span class="fa-icon">angle-up</span>&ensp;<span data-i18n="popupLessButton"></span><span class="hover"></span></span>
</section>
</aside>

<svg id="overlay"><path d></path><path d="M0 0"></path></svg>

<script src="js/theme.js" type="module"></script>
<script src="js/fa-icons.js" type="module"></script>
<script src="js/i18n.js" type="module"></script>
<script src="js/picker-ui.js" type="module"></script>

</body>
</html>
```

### 3.2 toolOverlay Object (Iframe UI Side)

**File:** `src/js/scripting/tool-overlay-ui.js`

**Note:** Base implementation is identical to Zapper.md Flow 3.2. The Picker adds these imports:

```javascript
import { localRead, localWrite } from './ext.js';
import { ExtSelectorCompiler } from './static-filtering-parser.js';
```

**Additional state for picker:**

```javascript
let previewedSelector = '';
let previewedCSS = '';
```

See Zapper.md Flow 3.2 for base `toolOverlay` object:
- `start()`, `stop()`, `postMessage()`, `sendMessage()`
- `highlightElementUnderMouse()`, `onHover()`, `onTimer()`
- Message handling (`onMessage()`)
- Dialog drag/move functionality

The `toolOverlay` handles UI events and message passing (runs in iframe context):

```javascript
export const toolOverlay = {
    url: new URL('about:blank'),
    svgRoot: qs$('svg#overlay'),
    svgOcean: qs$('svg#overlay > path'),
    svgIslands: qs$('svg#overlay > path + path'),
    emptyPath: 'M0 0',
    port: null,

    start(onmessage) {
        this.onmessage = onmessage;
        globalThis.addEventListener('message', ev => {
            const msg = ev.data || {};
            if ( msg.what !== 'startOverlay' ) { return; }
            if ( Array.isArray(ev.ports) === false ) { return; }
            if ( ev.ports.length === 0 ) { return; }
            toolOverlay.port = ev.ports[0];
            toolOverlay.port.onmessage = ev => {
                this.onMessage(ev.data || {});
            };
            toolOverlay.port.onmessageerror = ( ) => {
                this.onmessage({ what: 'stopTool' });
            };
            this.moveable = qs$('aside:has(#move)');
            if ( this.moveable !== null ) {
                dom.on('aside #move', 'pointerdown', ev => { this.mover(ev); });
                dom.on('aside #move', 'touchstart', this.eatTouchEvent);
            }
            this.onMessage({ what: 'startTool',
                url: msg.url,
                width: msg.width,
                height: msg.height,
            });
            dom.cl.remove(dom.body, 'loading');
        }, { once: true });
    },

    stop() {
        this.highlightElementUnderMouse(false);
        if ( this.port ) {
            this.port.postMessage({ what: 'quitTool' });
            this.port.onmessage = null;
            this.port.onmessageerror = null;
            this.port = null;
        }
    },

    onMessage(wrapped) {
        // Response to frame-initiated message?
        if ( typeof wrapped?.fromFrameId === 'number' ) {
            const resolve = this.pendingMessages.get(wrapped.fromFrameId);
            if ( resolve ) {
                this.pendingMessages.delete(wrapped.fromFrameId);
                resolve(wrapped.msg);
            }
            return;
        }
        const msg = wrapped.msg || wrapped;
        switch ( msg.what ) {
        case 'startTool': {
            this.url.href = msg.url;
            const ow = msg.width;
            const oh = msg.height;
            this.svgOcean.setAttribute('d', `M0 0h${ow}v${oh}h-${ow}z`);
            break;
        }
        case 'svgPaths':
            this.svgOcean.setAttribute('d', msg.ocean + msg.islands);
            this.svgIslands.setAttribute('d', msg.islands || this.emptyPath);
            break;
        default:
            break;
        }
        const response = this.onmessage && this.onmessage(msg) || undefined;
        // Send response if this is script-initiated message
        if ( wrapped?.fromScriptId && this.port ) {
            const { fromScriptId } = wrapped;
            if ( response instanceof Promise ) {
                response.then(response => {
                    if ( this.port === null ) { return; }
                    this.port.postMessage({ fromScriptId, msg: response });
                });
            } else {
                this.port.postMessage({ fromScriptId, msg: response });
            }
        }
    },
    postMessage(msg) {
        if ( this.port === null ) { return; }
        const wrapped = {
            fromFrameId: this.messageId++,
            msg,
        };
        return new Promise(resolve => {
            this.pendingMessages.set(wrapped.fromFrameId, resolve);
            this.port.postMessage(wrapped);
        });
    },
    messageId: 1,
    pendingMessages: new Map(),

    sendMessage(msg) {
        return sendMessage(msg);
    },

    highlightElementUnderMouse(state) {
        if ( dom.cl.has(dom.root, 'mobile') ) { return; }
        if ( state === this.mstrackerOn ) { return; }
        this.mstrackerOn = state;
        if ( this.mstrackerOn ) {
            dom.on(document, 'mousemove', this.onHover, { passive: true });
            return;
        }
        dom.off(document, 'mousemove', this.onHover, { passive: true });
        if ( this.mstrackerTimer === undefined ) { return; }
        self.cancelAnimationFrame(this.mstrackerTimer);
        this.mstrackerTimer = undefined;
    },
    onTimer() {
        toolOverlay.mstrackerTimer = undefined;
        if ( toolOverlay.port === null ) { return; }
        toolOverlay.port.postMessage({
            what: 'highlightElementAtPoint',
            mx: toolOverlay.mstrackerX,
            my: toolOverlay.mstrackerY,
        });
    },
    onHover(ev) {
        toolOverlay.mstrackerX = ev.clientX;
        toolOverlay.mstrackerY = ev.clientY;
        if ( toolOverlay.mstrackerTimer !== undefined ) { return; }
        toolOverlay.mstrackerTimer =
            self.requestAnimationFrame(toolOverlay.onTimer);
    },
    mstrackerOn: false,
    mstrackerX: 0, mstrackerY: 0,
    mstrackerTimer: undefined,

    // Dialog move/drag functionality
    mover(ev) {
        const target = ev.target;
        if ( target.matches('#move') === false ) { return; }
        if ( dom.cl.has(this.moveable, 'moving') ) { return; }
        target.setPointerCapture(ev.pointerId);
        this.moverX0 = ev.pageX;
        this.moverY0 = ev.pageY;
        const rect = this.moveable.getBoundingClientRect();
        this.moverCX0 = rect.x + rect.width / 2;
        this.moverCY0 = rect.y + rect.height / 2;
        dom.cl.add(this.moveable, 'moving');
        self.addEventListener('pointermove', this.moverMoveAsync, {
            passive: true,
            capture: true,
        });
        self.addEventListener('pointerup', this.moverStop, { capture: true, once: true });
        ev.stopPropagation();
        ev.preventDefault();
    },
    moverMove() {
        this.moverTimer = undefined;
        const cx1 = this.moverCX0 + this.moverX1 - this.moverX0;
        const cy1 = this.moverCY0 + this.moverY1 - this.moverY0;
        const rootW = dom.root.clientWidth;
        const rootH = dom.root.clientHeight;
        const moveableW = this.moveable.clientWidth;
        const moveableH = this.moveable.clientHeight;
        if ( cx1 < rootW / 2 ) {
            this.moveable.style.setProperty('left', `${Math.max(cx1-moveableW/2,2)}px`);
            this.moveable.style.removeProperty('right');
        } else {
            this.moveable.style.removeProperty('left');
            this.moveable.style.setProperty('right', `${Math.max(rootW-cx1-moveableW/2,2)}px`);
        }
        if ( cy1 < rootH / 2 ) {
            this.moveable.style.setProperty('top', `${Math.max(cy1-moveableH/2,2)}px`);
            this.moveable.style.removeProperty('bottom');
        } else {
            this.moveable.style.removeProperty('top');
            this.moveable.style.setProperty('bottom', `${Math.max(rootH-cy1-moveableH/2,2)}px`);
        }
    },
    moverMoveAsync(ev) {
        toolOverlay.moverX1 = ev.pageX;
        toolOverlay.moverY1 = ev.pageY;
        if ( toolOverlay.moverTimer !== undefined ) { return; }
        toolOverlay.moverTimer = self.requestAnimationFrame(( ) => {
            toolOverlay.moverMove();
        });
    },
    moverStop(ev) {
        if ( dom.cl.has(toolOverlay.moveable, 'moving') === false ) { return; }
        dom.cl.remove(toolOverlay.moveable, 'moving');
        self.removeEventListener('pointermove', toolOverlay.moverMoveAsync, {
            passive: true,
            capture: true,
        });
        ev.target.releasePointerCapture(ev.pointerId);
        ev.stopPropagation();
        ev.preventDefault();
    },
    eatTouchEvent(ev) {
        if ( ev.target !== qs$('aside #move') ) { return; }
        ev.stopPropagation();
        ev.preventDefault();
    },
    moveable: null,
    moverX0: 0, moverY0: 0,
    moverX1: 0, moverY1: 0,
    moverCX0: 0, moverCY0: 0,
    moverTimer: undefined,
};
```

### 3.3 Picker UI Entry Point

**File:** `src/js/scripting/picker-ui.js`

```javascript
import { dom, qs$, qsa$ } from './dom.js';
import { localRead, localWrite } from './ext.js';
import { ExtSelectorCompiler } from './static-filtering-parser.js';
import { toolOverlay } from './tool-overlay-ui.js';

/******************************************************************************/

const selectorCompiler = new ExtSelectorCompiler({ nativeCssHas: true });

let selectorPartsDB = new Map();
let sliderParts = [];
let sliderPartsPos = -1;

/******************************************************************************/

function validateSelector(selector) {
    validateSelector.error = undefined;
    if ( selector === '' ) { return; }
    const result = {};
    if ( selectorCompiler.compile(selector, result) ) {
        return result.compiled;
    }
    validateSelector.error = 'Error';
}

/******************************************************************************/

function onSvgTouch(ev) {
    if ( ev.type === 'touchstart' ) {
        onSvgTouch.x0 = ev.touches[0].screenX;
        onSvgTouch.y0 = ev.touches[0].screenY;
        onSvgTouch.t0 = ev.timeStamp;
        return;
    }
    if ( onSvgTouch.x0 === undefined ) { return; }
    const stopX = ev.changedTouches[0].screenX;
    const stopY = ev.changedTouches[0].screenY;
    const distance = Math.sqrt(
        Math.pow(stopX - onSvgTouch.x0, 2) +
        Math.pow(stopY - onSvgTouch.y0, 2)
    );
    // Interpret touch events as a tap if:
    // - Swipe is not valid; and
    // - The time between start and stop was less than 200ms.
    const duration = ev.timeStamp - onSvgTouch.t0;
    if ( distance >= 32 || duration >= 200 ) { return; }
    onSvgClicked({
        type: 'touch',
        target: ev.target,
        clientX: ev.changedTouches[0].pageX,
        clientY: ev.changedTouches[0].pageY,
    });
    ev.preventDefault();
}
onSvgTouch.x0 = onSvgTouch.y0 = 0;
onSvgTouch.t0 = 0;

/******************************************************************************/

function onSvgClicked(ev) {
    // Unpause picker if:
    // - click outside dialog AND
    // - not in preview mode
    if ( dom.cl.has(dom.root, 'paused') ) {
        if ( dom.cl.has(dom.root, 'preview') ) {
            updatePreview(false);
        }
        unpausePicker();
        return;
    }
    // Force dialog to always be visible when using a touch-driven device.
    if ( ev.type === 'touch' ) {
        dom.cl.add(dom.root, 'show');
    }
    toolOverlay.postMessage({
        what: 'candidatesAtPoint',
        mx: ev.clientX,
        my: ev.clientY,
        broad: ev.ctrlKey,
    }).then(details => {
        showDialog(details);
    });
}

/******************************************************************************/

function onKeyPressed(ev) {
    if ( ev.key === 'Escape' || ev.which === 27 ) {
        quitPicker();
        return;
    }
}

/******************************************************************************/

function onMinimizeClicked() {
    if ( dom.cl.has(dom.root, 'paused') === false ) {
        pausePicker();
        highlightCandidate();
        return;
    }
    dom.cl.toggle(dom.root, 'minimized');
}

/******************************************************************************/

function onFilterTextChanged() {
    highlightCandidate();
}

/******************************************************************************/

function toggleView(view, persist = false) {
    dom.root.dataset.view = `${view}`;
    if ( persist !== true ) { return; }
    localWrite('picker.view', dom.root.dataset.view);
}

function onViewToggled(dir) {
    let view = parseInt(dom.root.dataset.view, 10);
    view += dir;
    if ( view < 0 ) { view = 0; }
    if ( view > 2 ) { view = 2; }
    toggleView(view, true);
}

/******************************************************************************/

function selectorFromCandidates() {
    const selectorParts = [];
    let liPrevious = null;
    for ( const li of qsa$('#candidateFilters li') ) {
        const selector = [];
        for ( const span of qsa$(li, '.on[data-part]') ) {
            selector.push(span.textContent);
        }
        if ( selector.length !== 0 ) {
            if ( liPrevious !== null ) {
                if ( li.previousElementSibling === liPrevious ) {
                    selectorParts.unshift(' > ');
                } else if ( liPrevious !== li ) {
                    selectorParts.unshift(' ');
                }
            }
            liPrevious = li;
            selectorParts.unshift(selector.join(''));
        }
    }
    return selectorParts.join('');
}

/******************************************************************************/

function onSliderChanged(ev) {
    updateSlider(Math.round(ev.target.valueAsNumber));
}

function updateSlider(i) {
    if ( i === sliderPartsPos ) { return; }
    sliderPartsPos = i;
    dom.cl.remove('#candidateFilters [data-part]', 'on');
    const parts = sliderParts[i];
    for ( const address of parts ) {
        dom.cl.add(`#candidateFilters [data-part="${address}"]`, 'on');
    }
    const selector = selectorFromCandidates();
    qs$('textarea').value = selector;
    highlightCandidate();
}

/******************************************************************************/

function updateElementCount(details) {
    const { count, error } = details;
    const span = qs$('#resultsetCount');
    if ( error ) {
        span.textContent = 'Error';
        span.setAttribute('title', error);
    } else {
        span.textContent = count;
        span.removeAttribute('title');
    }
    const disabled = Boolean(count) === false ? '' : null;
    dom.attr('#create', 'disabled', disabled);
    updatePreview();
}

/******************************************************************************/

function onPreviewClicked() {
    dom.cl.toggle(dom.root, 'preview');
    updatePreview();
}

function updatePreview(state) {
    if ( state === undefined ) {
        state = dom.cl.has(dom.root, 'preview');
    } else {
        dom.cl.toggle(dom.root, 'preview', state)
    }
    const selector = state && validateSelector(qs$('textarea').value) || '';
    return toolOverlay.postMessage({ what: 'previewSelector', selector });
}

/******************************************************************************/

async function onCreateClicked() {
    const selector = validateSelector(qs$('textarea').value);
    if ( selector === undefined ) { return; }
    await toolOverlay.postMessage({ what: 'terminateCustomFilters' });
    await toolOverlay.sendMessage({
        what: 'addCustomFilters',
        hostname: toolOverlay.url.hostname,
        selectors: [ selector ],
    });
    await toolOverlay.postMessage({ what: 'startCustomFilters' });
    qs$('textarea').value = '';
    dom.cl.remove(dom.root, 'preview');
    quitPicker();
}

/******************************************************************************/

function attributeNameFromSelector(part) {
    const pos = part.search(/\^?=/);
    return part.slice(1, pos);
}

/******************************************************************************/

function onCandidateClicked(ev) {
    const target = ev.target;
    if ( target.matches('[data-part]') ) {
        const address = target.dataset.part;
        const part = selectorPartsDB.get(parseInt(address, 10));
        if ( part.startsWith('[') ) {
            if ( target.textContent === part ) {
                target.textContent = `[${attributeNameFromSelector(part)}]`;
                dom.cl.remove(target, 'on');
            } else if ( dom.cl.has(target, 'on') ) {
                target.textContent = part;
            } else {
                dom.cl.add(target, 'on');
            }
        } else {
            dom.cl.toggle(target, 'on');
        }
    } else if ( target.matches('li') ) {
        if ( qs$(target, ':scope > span:not(.on)') !== null ) {
            dom.cl.add(qsa$(target, ':scope > [data-part]:not(.on)'), 'on');
        } else {
            dom.cl.remove(qsa$(target, ':scope > [data-part]'), 'on');
        }
    }
    const selector = selectorFromCandidates();
    qs$('textarea').value = selector;
    highlightCandidate();
}

/******************************************************************************/

function showDialog(msg) {
    pausePicker();

    /* global */selectorPartsDB = new Map(msg.partsDB);
    const { listParts } = msg;
    const root = qs$('#candidateFilters');
    const ul = qs$(root, 'ul');
    while ( ul.firstChild !== null ) {
        ul.firstChild.remove();
    }
    for ( const parts of listParts ) {
        const li = document.createElement('li');
        for ( const address of parts ) {
            const span = document.createElement('span');
            const part = selectorPartsDB.get(address);
            span.dataset.part = address;
            if ( part.startsWith('[') ) {
                span.textContent = `[${attributeNameFromSelector(part)}]`;
            } else {
                span.textContent = part;
            }
            li.append(span);
        }
        ul.appendChild(li);
    }

    /* global */sliderParts = msg.sliderParts;
    /* global */sliderPartsPos = -1;
    const slider = qs$('#slider');
    const last = sliderParts.length - 1;
    dom.attr(slider, 'max', last);
    dom.attr(slider, 'value', last);
    dom.attr(slider, 'disabled', last !== 0 ? null : '');
    slider.value = last;
    updateSlider(last);
}

/******************************************************************************/

function highlightCandidate() {
    const selector = validateSelector(qs$('textarea').value);
    if ( selector === undefined ) {
        toolOverlay.postMessage({ what: 'unhighlight' });
        updateElementCount({ count: 0, error: validateSelector.error });
        return;
    }
    toolOverlay.postMessage({
        what: 'highlightFromSelector',
        selector,
    }).then(result => {
        updateElementCount(result);
    });
}

/*******************************************************************************
 * 
 * paused:
 * - select element mode disabled
 * - preview mode enabled or disabled
 * - dialog unminimized
 * 
 * unpaused:
 * - select element mode enabled
 * - preview mode disabled
 * - dialog minimized
 * 
 * */

function pausePicker() {
    dom.cl.add(dom.root, 'paused');
    dom.cl.remove(dom.root, 'minimized');
    toolOverlay.highlightElementUnderMouse(false);
}

function unpausePicker() {
    dom.cl.remove(dom.root, 'paused', 'preview');
    dom.cl.add(dom.root, 'minimized');
    updatePreview(false);
    toolOverlay.highlightElementUnderMouse(true);
}

/******************************************************************************/

function startPicker() {
    toolOverlay.postMessage({ what: 'startTool' });

    localRead('picker.view').then(value => {
        if ( Boolean(value) === false ) { return; }
        toggleView(value);
    });

    self.addEventListener('keydown', onKeyPressed, true);
    dom.on('svg#overlay', 'click', onSvgClicked);
    dom.on('svg#overlay', 'touchstart', onSvgTouch, { passive: true });
    dom.on('svg#overlay', 'touchend', onSvgTouch);
    dom.on('#minimize', 'click', onMinimizeClicked);
    dom.on('textarea', 'input', onFilterTextChanged);
    dom.on('#quit', 'click', quitPicker);
    dom.on('#slider', 'input', onSliderChanged);
    dom.on('#pick', 'click', resetPicker);
    dom.on('#preview', 'click', onPreviewClicked);
    dom.on('#moreOrLess > span:first-of-type', 'click', ( ) => { onViewToggled(1); });
    dom.on('#moreOrLess > span:last-of-type', 'click', ( ) => { onViewToggled(-1); });
    dom.on('#create', 'click', ( ) => { onCreateClicked(); });
    dom.on('#candidateFilters ul', 'click', onCandidateClicked);
    toolOverlay.highlightElementUnderMouse(true);
}

/******************************************************************************/

function quitPicker() {
    updatePreview(false);
    toolOverlay.stop();
}

/******************************************************************************/

function resetPicker() {
    toolOverlay.postMessage({ what: 'unhighlight' });
    unpausePicker();
}

/******************************************************************************/

function onMessage(msg) {
    switch ( msg.what ) {
    case 'startTool':
        startPicker();
        break;
    default:
        break;
    }
}

/******************************************************************************/

// Wait for the content script to establish communication
toolOverlay.start(onMessage);

/******************************************************************************/
```

---

## Flow 4: Element Picking (picker.js)

### 4.1 Content Script Entry Point

**File:** `src/js/scripting/picker.js`

```javascript
(async () => {

/******************************************************************************/

const ubolOverlay = self.ubolOverlay;
if ( ubolOverlay === undefined ) { return; }
if ( ubolOverlay.file === '/picker-ui.html' ) { return; }

/******************************************************************************/

// Candidate generation functions
function attributeNameFromPart(part) {
    const pos = part.search(/\^?=/);
    return part.slice(1, pos);
}

function selectorFromAddresses(partsDB, addresses) {
    const selector = [];
    let majorLast = -1;
    for ( const address of addresses ) {
        const major = address >>> 12;
        if ( majorLast !== -1 ) {
            const delta = majorLast - major;
            if ( delta > 1 ) {
                selector.push(' ');
            } else if ( delta === 1 ) {
                selector.push(' > ');
            }
        }
        majorLast = major;
        const part = partsDB.get(address);
        selector.push(
            (address & 0xF) === 3
                ? `[${attributeNameFromPart(part)}]`
                : part
        );
    }
    return selector.join('');
}

/*******************************************************************************
 * 
 * Selector part address:
 * 0b00000000_00000000_0000
 *          |        |    |
 *          |        |    +-- 4-bit: Descriptor
 *          |        +------- 8-bit: Part index
 *          +---------------- 8-bit: List index
 * Descriptor:
 * - 0: tag name
 * - 1: id
 * - 2: class
 * - 3: attribute
 * - 4: :nth-of-type
 * List index: 0 is deepest
 * 
 * Selector part addresses are used to reference parts in associated database.
 * 
 * */

function candidatesAtPoint(x, y, broad) {
    // We need at least one element.
    let elem = null;
    if ( typeof x === 'number' ) {
        elem = ubolOverlay.elementFromPoint(x, y);
    } else if ( x instanceof HTMLElement ) {
        elem = x;
        x = undefined;
    }

    const partsDB = new Map();
    const listParts = [];
    while ( elem && elem !== document.body ) {
        const tagName = elem.localName;
        const addressMajor = listParts.length << 12;
        partsDB.set(addressMajor, CSS.escape(tagName));
        const parts = [ addressMajor ];
        // Id
        if ( typeof elem.id === 'string' && elem.id !== '' ) {
            const address = addressMajor | parts.length << 4 | 1;
            partsDB.set(address, `#${CSS.escape(elem.id)}`);
            parts.push(address);
        }
        // Classes
        for ( const name of elem.classList.values() ) {
            const address = addressMajor | parts.length << 4 | 2;
            partsDB.set(address, `.${CSS.escape(name)}`);
            parts.push(address);
        }
        // Attributes
        for ( const name of elem.getAttributeNames() ) {
            if ( name === 'id' || name === 'class' ) { continue; }
            if ( excludedAttributeExpansion.includes(name) ) {
                const address = addressMajor | parts.length << 4 | 3;
                partsDB.set(address, `[${CSS.escape(name)}]`);
                parts.push(address);
                continue;
            }
            let value = elem.getAttribute(name);
            const pos = value.search(/[\n\r]/);
            if ( pos !== -1 ) {
                value = value.slice(0, pos);
            }
            const address = addressMajor | parts.length << 4 | 3;
            partsDB.set(address, `[${CSS.escape(name)}="${value}"]`);
            parts.push(address);
        }
        // https://github.com/chrisaljoudi/uBlock/issues/637
        //   If the selector is still ambiguous at this point, further narrow
        // using `:nth-of-type`.
        const parentNode = elem.parentNode;
        if ( ubolOverlay.qsa(parentNode, `:scope > ${selectorFromAddresses(partsDB, parts)}`).length > 1 ) {
            let i = 1;
            while ( elem.previousSibling !== null ) {
                elem = elem.previousSibling;
                if ( typeof elem.localName !== 'string' ) { continue; }
                if ( elem.localName !== tagName ) { continue; }
                i++;
            }
            const address = addressMajor | parts.length << 4 | 4;
            partsDB.set(address, `:nth-of-type(${i})`);
            parts.push(address);
        }
        listParts.push(parts);
        elem = elem.parentElement;
    }
    if ( listParts.length === 0 ) { return; }

    // Generate slider candidates - all combinations from deepest to root
    const sliderCandidates = [];
    for ( let i = 0, n = listParts.length; i < n; i++ ) {
        sliderCandidates.push(listParts[i]);
        for ( let j = i + 1; j < n; j++ ) {
            sliderCandidates.push([
                ...listParts[j],
                ...sliderCandidates.at(-1),
            ]);
        }
    }
    
    // Deduplicate based on descriptor type
    const sliderMap = new Map();
    for ( const candidates of sliderCandidates ) {
        // ID-based selectors
        if ( candidates.some(a => (a & 0xF) === 1) ) {
            const selectorPath = candidates.filter(a => (a & 0xF) === 1);
            sliderMap.set(JSON.stringify(selectorPath), 0);
        } else if ( candidates.some(a => (a & 0xF) === 4) ) {
            // nth-of-type selectors
            const selectorPath = candidates.filter(a => {
                return a &= 0xF, a === 0 || a === 4;
            });
            sliderMap.set(JSON.stringify(selectorPath), 0);
        }
        if ( candidates.some(a => (a & 0xF) === 2) ) {
            // Class-based selectors
            const selectorPath = candidates.filter(a => {
                return a &= 0xF, a === 0 || a === 2;
            });
            sliderMap.set(JSON.stringify(selectorPath), 0);
        }
        // Attribute-based selectors
        const selectorPath = candidates.filter(a => {
            return a &= 0xF, a === 0 || a === 3;
        });
        sliderMap.set(JSON.stringify(selectorPath), 0);
    }
    sliderMap.delete('[]');
    
    // Result set deduplication - find most specific selector
    const elemToIdMap = new Map();
    const resultSetMap = new Map();
    let elemId = 1;
    for ( const json of sliderMap.keys() ) {
        const addresses = JSON.parse(json);
        const selector = selectorFromAddresses(partsDB, addresses);
        if ( excludedSelectors.includes(selector) ) { continue; }
        const elems = ubolOverlay.qsa(document, selector);
        if ( elems.length === 0 ) { continue; }
        const resultSet = [];
        for ( const elem of elems ) {
            if ( elemToIdMap.has(elem) === false ) {
                elemToIdMap.set(elem, elemId++);
            }
            resultSet.push(elemToIdMap.get(elem));
        }
        const resultSetKey = JSON.stringify(resultSet.sort());
        const current = resultSetMap.get(resultSetKey);
        if ( current ) {
            if ( current.length < addresses.length ) { continue; }
            if ( current.length === addresses.length ) {
                if ( addresses.some(a => (a & 0xF) === 2) === false ) {
                    if ( current.some(a => (a & 0xF) === 2) ) { continue; }
                }
            }
        }
        resultSetMap.set(resultSetKey, addresses);
    }
    
    // Sort by specificity: deepest element first, then least parts
    const sliderParts = Array.from(resultSetMap).toSorted((a, b) => {
        let amajor = a[1].at(-1) >>> 12;
        let bmajor = b[1].at(-1) >>> 12;
        if ( amajor !== bmajor ) { return bmajor - amajor; }
        amajor = a[1].at(0) >>> 12;
        bmajor = b[1].at(0) >>> 12;
        if ( amajor !== bmajor ) { return bmajor - amajor; }
        if ( a[0].length !== b[0].length ) {
            return b[0].length - a[0].length;
        }
        return b[1].length - a[1].length;
    }).map(a => a[1]);
    
    return {
        partsDB: Array.from(partsDB),
        listParts,
        sliderParts,
    };
}

const excludedAttributeExpansion = [
    'sizes',
    'srcset',
];
const excludedSelectors = [
    'div',
    'span',
];

/******************************************************************************/

// Preview functionality
async function previewSelector(selector) {
    if ( selector === previewedSelector ) { return; }
    if ( previewedSelector !== '' ) {
        if ( previewedSelector.startsWith('{') ) {
            if ( self.pickerProceduralFilteringAPI ) {
                await self.pickerProceduralFilteringAPI.reset();
            }
        }
        if ( previewedCSS !== '' ) {
            await ubolOverlay.sendMessage({ what: 'removeCSS', css: previewedCSS });
            previewedCSS = '';
        }
    }
    previewedSelector = selector || '';
    if ( selector === '' ) { return; }
    if ( selector.startsWith('{') ) {
        if ( self.ProceduralFiltererAPI === undefined ) { return; }
        if ( self.pickerProceduralFilteringAPI === undefined ) {
            self.pickerProceduralFilteringAPI = new self.ProceduralFiltererAPI();
        }
        self.pickerProceduralFilteringAPI.addSelectors([ JSON.parse(selector) ]);
        return;
    }
    previewedCSS = `${selector}{display:none!important;}`;
    await ubolOverlay.sendMessage({ what: 'insertCSS', css: previewedCSS });
}

let previewedSelector = '';
let previewedCSS = '';

/******************************************************************************/

// Procedural filter API instance
const previewProceduralFiltererAPI = new self.ProceduralFiltererAPI(); 

/******************************************************************************/

// Message handler
function onMessage(msg) {
    switch ( msg.what ) {
    case 'quitTool':
        previewProceduralFiltererAPI.reset();
        break;
    case 'startCustomFilters':
        return ubolOverlay.sendMessage({ what: 'startCustomFilters' });
    case 'terminateCustomFilters':
        return ubolOverlay.sendMessage({ what: 'terminateCustomFilters' });
    case 'candidatesAtPoint':
        return candidatesAtPoint(msg.mx, msg.my, msg.broad);
    case 'previewSelector':
        return previewSelector(msg.selector);
    default:
        break;
    }
}

/******************************************************************************/

// Install the picker UI
await ubolOverlay.install('/picker-ui.html', onMessage);

/******************************************************************************/

})();

void 0;
```

---

## Flow 5: Close Picker

**Note:** Base close mechanism is identical to Zapper.md Flow 5:
- ESC key handled in both iframe and content script
- QUIT button sends `quitTool` message
- `toolOverlay.stop()` cleans up mouse tracking and port

### 5.1 Auto-close on filter creation

After a filter is created via "Create" button, the picker automatically closes:

```javascript
async function onCreateClicked() {
    const selector = validateSelector(qs$('textarea').value);
    if ( selector === undefined ) { return; }
    await toolOverlay.postMessage({ what: 'terminateCustomFilters' });
    await toolOverlay.sendMessage({
        what: 'addCustomFilters',
        hostname: toolOverlay.url.hostname,
        selectors: [ selector ],
    });
    await toolOverlay.postMessage({ what: 'startCustomFilters' });
    qs$('textarea').value = '';
    dom.cl.remove(dom.root, 'preview');
    quitPicker();
}
```

See Zapper.md Flow 5 for identical:
- ESC key handlers (both iframe and content script)
- QUIT button implementation
- `toolOverlay.stop()` cleanup

---

## Message Types

### UI (Iframe) → Content Script (via toolOverlay.postMessage → port)

| Message | Parameters | Purpose |
|---------|------------|---------|
| `candidatesAtPoint` | `mx`, `my`, `broad` | Get selector candidates at position |
| `highlightFromSelector` | `selector` | Highlight elements matching selector |
| `previewSelector` | `selector` | Apply preview CSS |
| `unhighlight` | - | Clear highlights |
| `quitTool` | - | Close picker |
| `terminateCustomFilters` | - | Stop custom filters |
| `startCustomFilters` | - | Restart custom filters |

**Note:** `broad` parameter (Ctrl+click) allows broader selector matching.

### Content Script → UI (via port.postMessage)

| Message | Parameters | Purpose |
|---------|------------|---------|
| `svgPaths` | `ocean`, `islands` | Update SVG overlay |
| `startTool` | `url`, `width`, `height` | Initialize UI |
| `stopTool` | - | Stop picker |
| `showTooltip` | `text`, `x`, `y` | Show element info tooltip |
| `hideTooltip` | - | Hide tooltip |
| (response to highlightFromSelector) | `{count, error}` | Result count + error |
| (response to candidatesAtPoint) | `{partsDB, listParts, sliderParts}` | Selector candidates |

### Content Script ↔ Background (via runtime.sendMessage)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `insertCSS` | Content → Background | Inject CSS for preview |
| `removeCSS` | Content → Background | Remove injected CSS |
| `addCustomFilters` | Content → Background | Add new filters to storage |
| `startCustomFilters` | Content → Background | Apply custom filters |
| `terminateCustomFilters` | Content → Background | Remove custom filters |

---

## Flow 6: Background Service Worker (filter handling)

### 6.1 addCustomFilters Message Handler

**File:** `src/js/background.js` (or equivalent service worker)

```javascript
// Message handler in service worker
case 'addCustomFilters':
    addCustomFilters(request.hostname, request.selectors);
    break;
```

### 6.2 Filter Storage (filter-manager.js)

**File:** `src/js/filter-manager.js`

```javascript
export async function addCustomFilters(hostname, toAdd) {
    if ( hostname === '' ) { return false; }
    const key = `site.${hostname}`;
    const selectors = await readFromStorage(key) || [];
    const countBefore = selectors.length;
    for ( const selector of toAdd ) {
        if ( selectors.includes(selector) ) { continue; }
        selectors.push(selector);
    }
    if ( selectors.length === countBefore ) { return false; }
    selectors.sort();
    writeToStorage(key, selectors);
    return true;
}
```

**Key points:**
- Filters stored per hostname under `site.{hostname}` key
- Storage key is literal: `site.example.com` not template literal `{{hostname}}`
- Uses backtick syntax: `` `site.${hostname}` `` in code
- Duplicate selectors are ignored
- Selectors are sorted alphabetically
- Returns true if filters were actually added

### 6.3 Filter Application

Custom filters are applied to pages matching the hostname via:
1. Content script reads stored filters
2. Filters are injected as CSS or procedural rules
3. Elements matching selectors are hidden

---

## CSS Classes

### Base Picker

| Class | Element | Purpose |
|-------|---------|---------|
| `#overlay` | SVG | Full-screen overlay for mouse events |
| `#windowbar` | SECTION | Window controls (minimize, move, quit) |
| `#quit` | DIV | Close button |
| `#pick` | BUTTON | Reset picker button |
| `#preview` | BUTTON | Preview toggle button |
| `#create` | BUTTON | Create filter button |
| `#slider` | INPUT | Specificity slider |
| `#resultsetCount` | SPAN | Shows number of matched elements |
| `#candidateFilters` | SECTION | Selector parts list |
| `#moreOrLess` | SECTION | View toggle |

### View States

| Data Attribute | Value | Description |
|----------------|-------|-------------|
| `data-view` | `0` | Basic view (slider + count) |
| `data-view` | `1` | Candidates view (selector parts) |
| `data-view` | `2` | Raw view (textarea) |

### Full Picker UI CSS

```css
:root#ubol-picker {
    --ubol-overlay-fill: rgba(255,64,64,0.10);
    --ubol-overlay-border: #F00;
}

#ubol-picker.paused svg#overlay {
    cursor: not-allowed;
}

:root aside {
    background-color: var(--surface-1);
    border: 1px solid var(--border-2);
    max-width: min(32rem, 100vw - 4px);
    min-width: min(24rem, 100vw - 4px);
    row-gap: 1em;
    width: min(32rem, 100vw - 4px);
}

#ubol-picker aside > section:last-of-type {
    margin-block-end: 0;
}
#ubol-picker aside > section:not(#windowbar,#moreOrLess) {
    padding: 0 4px;
}

#ubol-picker[data-view="0"] aside section[data-view="1"],
#ubol-picker[data-view="0"] aside section[data-view="2"] {
    display: none;
}
#ubol-picker[data-view="1"] aside section[data-view="2"] {
    display: none;
}

#ubol-picker:not(.paused) aside > section:not(#windowbar) {
    display: none;
}

#ubol-picker textarea {
    border: 0;
    box-sizing: border-box;
    font-size: var(--monospace-size);
    min-height: 5em;
    resize: none;
    width: 100%;
}
#ubol-picker.mobile textarea {
    height: unset;
}
#ubol-picker .resultsetWidgets {
    color: var(--ink-2);
    display: flex;
    flex-direction: column;
    font-size: var(--monospace-size);
    gap: 0.25em;
}
#ubol-picker .resultsetWidgets > span:first-of-type {
    display: flex;
    margin: 0 1em;
}
#ubol-picker .resultsetWidgets label {
    flex-grow: 1;
}
#ubol-picker .resultsetWidgets #resultsetCount {
    display: inline-block;
    text-align: right;
    width: 8ch;
}

#ubol-picker #toolbar {
    display: flex;
    justify-content: space-between;
}
#ubol-picker #toolbar button {
    min-width: 5em;
}

#ubol-picker #candidateFilters {
    font-family: monospace;
    font-size: var(--monospace-size);
    max-height: min(20em, 30vh);
    min-height: 6em;
    overflow-y: auto;
    word-break: break-all;
}
#ubol-picker #candidateFilters ul {
    margin: 0;
    padding-inline-start: calc(2ch + 4px);
    user-select: none;
    -webkit-user-select: none;
}
#ubol-picker #candidateFilters ul > li {
    list-style-type: '\25A0\00A0';
}
#ubol-picker #candidateFilters ul >li:has(:not(span.on)) {
    list-style-type: '\25A1\00A0';
}
#ubol-picker #candidateFilters ul > li:nth-of-type(2n+1) {
    background-color: var(--surface-2);
}
#ubol-picker #candidateFilters ul > li > span {
    border: 1px solid transparent;
    padding: 1px 2px;
}
#ubol-picker #candidateFilters ul > li > span.on {
    background-color: var(--accent-surface-1);
    color: var(--accent-ink-1);
}
#ubol-picker #candidateFilters ul > li > span:hover {
    border: 1px solid var(--ink-1);
}

#ubol-picker #moreOrLess {
    color: var(--ink-2);
    column-gap: 0;
    display: grid;
    font-size: var(--font-size-smaller);
    grid-template: auto / 1fr 1fr;
    justify-items: stretch;
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
}
#ubol-picker #moreOrLess > span {
    cursor: pointer;
    padding: var(--default-gap-xxsmall) var(--default-gap-xsmall);
}
#ubol-picker #moreOrLess > span:last-of-type {
    text-align: end;
}
#ubol-picker[data-view="2"] aside #moreOrLess > span:first-of-type {
    visibility: hidden;
}
#ubol-picker[data-view="0"] aside #moreOrLess > span:last-of-type {
    visibility: hidden;
}
#ubol-picker.desktop aside #moreOrLess > span:hover {
    background-color: var(--surface-2);
}

#ubol-picker.preview #toolbar #preview {
    color: var(--accent-ink-1);
    background-color: var(--accent-surface-1);
}
#ubol-picker.preview #overlay path {
    display: none;
}
```

---

## Key Differences from Zapper

| Feature | Zapper | Picker |
|---------|--------|--------|
| Element Removal | Removes from DOM | N/A |
| Filter Generation | None | Creates CSS selectors |
| Filter Storage | None | Saves to user list |
| Slider UI | None | Specificity adjustment |
| Candidate UI | None | Toggle selector parts |
| Preview Mode | None | Show/hide before creating |
| Persistence | Elements reappear | Elements blocked |

---

## Implementation Checklist

- [ ] Popup click handler (`#gotoPicker`)
- [ ] MV3 `scripting.executeScript` injection
- [ ] `css-procedural-api.js` loaded first
- [ ] `tool-overlay.js` with secret attribute
- [ ] CSS injection via background script
- [ ] `picker-ui.html` iframe
- [ ] `tool-overlay-ui.js` UI logic
- [ ] `picker.js` content script
- [ ] SVG overlay for highlighting
- [ ] Hover highlighting (desktop)
- [ ] Tap to highlight (touch)
- [ ] Candidate generation algorithm
- [ ] Slider for specificity
- [ ] Candidate parts toggle UI
- [ ] Preview mode
- [ ] Filter creation
- [ ] ESC to close
- [ ] QUIT button
- [ ] PICK button (reset)
- [ ] Minimized state
- [ ] Procedural filter support
- [ ] **DONE** - Full picker with filter generation

---

## Behavior Summary

| Platform | Action | Result |
|----------|--------|--------|
| Desktop | Hover | Highlights element under cursor |
| Desktop | Click on element | Shows selector candidates dialog |
| Desktop | Adjust slider | Changes selector specificity |
| Desktop | Toggle parts | Enable/disable selector parts |
| Desktop | Click Preview | Shows/hides matching elements |
| Desktop | Click Create | Saves filter, closes picker |
| Touch | Tap on element | Shows selector candidates |
| Touch | Tap again | Selects candidate at position |
| Any | ESC | Closes picker |

---

## Enhanced Features

### 1. Element Info Tooltip

Shows details about the element under the cursor.

**Changes to tool-overlay.js:**
```javascript
showElementInfo(elem) {
    const info = [
        elem.tagName.toLowerCase(),
        elem.id ? '#' + elem.id : '',
        Array.from(elem.classList).slice(0, 2).join('.'),
    ].filter(v => v).join(' ');
    
    this.port.postMessage({
        what: 'showTooltip',
        text: info,
        x: this.lastMouseX,
        y: this.lastMouseY,
    });
}
```

### 2. Raw Text View

Toggle between basic, candidates, and raw selector views.

```javascript
function onViewToggled(delta) {
    const root = dom.root;
    let view = parseInt(root.getAttribute('data-view') || '0', 10);
    view = Math.max(0, Math.min(2, view + delta));
    root.setAttribute('data-view', String(view));
}
```

### 3. Procedural Filter Support

For Extended CSS (`:has`, `:has-text`, `:matches-css`, etc.), selectors are JSON-encoded:

```javascript
if ( selector.startsWith('{') ) {
    if ( ubolOverlay.pickerProceduralFilteringAPI === undefined ) {
        ubolOverlay.pickerProceduralFilteringAPI = new ProceduralFiltererAPI();
    }
    ubolOverlay.pickerProceduralFilteringAPI.addSelectors([JSON.parse(selector)]);
}
```

---

## Script Dependencies

The picker UI has the following import chain:

1. `picker-ui.html` loads `picker-ui.js` as a module
2. `picker-ui.js` imports `tool-overlay-ui.js` and `dom.js`
3. `tool-overlay-ui.js` imports `dom.js` and `ext.js`

```
picker-ui.html
  └── picker-ui.js (entry point)
        ├��─ dom.js (DOM utilities)
        └── tool-overlay-ui.js (UI logic)
              ├── dom.js
              └── ext.js (extension API)
```

---

## File Structure

```
src/
├── js/
│   ├── scripting/
│   │   ├── tool-overlay.js      # Content script (shared with zapper)
│   │   ├── tool-overlay-ui.js  # UI logic (shared with zapper)
│   │   ├── picker-ui.js        # Picker UI entry point
│   │   ├── picker.js           # Picker content script
│   │   ├── dom.js             # DOM utilities
│   │   └── ext.js             # Extension utilities
│   └── popup.ts               # Popup handler
├── picker-ui.html             # HTML loaded in iframe
└── css/
    └── picker-ui.css         # Picker styles
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ESC | Close picker |
| Delete/Backspace | Create filter |
| Ctrl+Enter | Create filter |
| M | Toggle minimize |
| V | Cycle views (0/1/2) |
| P | Toggle preview |

---

## Procedural Filters

The picker supports Extended CSS procedural filters:

```json
{"selector": "div", "tasks": [{"hide": ""}]}
```

Common tasks:
- `hide` - Hide element
- `style` - Apply CSS style
- `rewrite` - Rewrite text content
- `redirect` - Redirect request

Used via JSON-encoded selector strings starting with `{`.

---

## Revision History

### Fixed Issues (2026-04-08)

1. **Popup handler**: Added proper injection with three files including css-procedural-api.js

2. **Cross-context communication**: Documented MessageChannel setup between content script and iframe

3. **Candidate generation**: Implemented complete algorithm with address encoding and slider generation

4. **Filter creation flow**: Documented the full flow from element selection to filter saving

5. **Procedural filter support**: Added documentation for Extended CSS support via JSON-encoded selectors