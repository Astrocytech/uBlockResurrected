# Zapper Implementation Documentation

This document describes the Zapper feature implementation. The zapper allows users to click on page elements to remove them from the DOM.

---

## Overview

The zapper is a **simple element removal tool** that:
- Highlights elements on hover (desktop) or tap (touch)
- Removes elements on click or Delete key
- Uses MV3-compliant `scripting.executeScript` API

**Important:** The zapper does NOT save filters or generate cosmetic selectors. It simply removes elements from the DOM. Elements reappear on page refresh.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CHROME EXTENSION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │      Popup       │                                                      │
│  │ (popup-fenix.ts)│                                                      │
│  └────────┬─────────┘                                                      │
│           │ scripting.executeScript                                          │
│           ▼                                                                 │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                        WEB PAGE                                     │    │
│  │  ┌─────────────────┐                                               │    │
│  │  │ tool-overlay.js │  ← Content script (injected)                  │    │
│  │  │  - Creates iframe                                               │    │
│  │  │  - Handles DOM manipulation                                     │    │
│  │  │  - CSS injection via background                                   │    │
│  │  └────────┬────────┘                                               │    │
│  │           │                                                           │    │
│  │           │ MessageChannel                                            │    │
│  │           ▼                                                           │    │
│  │  ┌───────────────────────────────────────────────────────────────┐ │    │
│  │  │                   IFRAME (zapper-ui.html)                      │ │    │
│  │  │                                                                │ │    │
│  │  │  ┌─────────────────────────────────────────────────────────┐  │ │    │
│  │  │  │              tool-overlay-ui.js (imported)               │  │ │    │
│  │  │  │  - Handles mouse/touch events                            │  │ │    │
│  │  │  │  - Sends messages to content script                     │  │ │    │
│  │  │  │  - Updates SVG overlay                                   │  │ │    │
│  │  │  └─────────────────────────────────────────────────────────┘  │ │    │
│  │  │                                                                │ │    │
│  │  │  ┌──────────┐  ┌──────────┐                                  │ │    │
│  │  │  │  QUIT    │  │   PICK   │  ← Buttons                     │ │    │
│  │  │  └──────────┘  └──────────┘                                  │ │    │
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
│  │  - removeCSS    │                                                      │
│  └──────────────────┘                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── js/
│   ├── scripting/
│   │   ├── tool-overlay.js      # Content script (injected into page)
│   │   ├── tool-overlay-ui.js  # UI logic (imported by zapper-ui.js)
│   │   ├── zapper-ui.js        # Zapper UI entry point (imported by zapper-ui.html)
│   │   ├── zapper.js           # Zapper content script (injected into page)
│   │   ├── dom.js              # DOM utility functions
│   │   └── ext.js              # Extension API utilities
│   └── popup-fenix.ts          # Popup handler
├── zapper-ui.html               # HTML loaded in iframe
└── css/
    └── zapper-ui.css           # Zapper styles
```

**Note:** The popup handler references `/js/scripting/` for injection paths.

---

## Flow 1: Activation from Popup

### 1.1 User clicks Zapper icon

**File:** `popup.html`
```html
<span id="gotoZapper" class="tool enabled" tabindex="0">
    ...
</span>
```

### 1.2 Event handler

**File:** `src/js/popup-fenix.ts`
```javascript
dom.on('#gotoZapper', 'click', async ( ) => {
    if ( browser.scripting === undefined ) { return; }
    const currentTab = await getCurrentTab();
    browser.scripting.executeScript({
        files: [
            '/js/scripting/tool-overlay.js',
            '/js/scripting/zapper.js'
        ],
        target: { tabId: currentTab.id },
    });
    vAPI.closePopup();
});

async function getCurrentTab() {
    return new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            resolve(tabs[0]);
        });
    });
}
```

**Note:** `popupData.tabId` can also be used if called from within the popup context where `popupData` is available.

---

## Flow 2: Content Script (tool-overlay.js)

**Important:** There are two separate overlay objects:
- `ubolOverlay` - Runs in the **content script** (page context)
- `toolOverlay` - Runs in the **iframe UI** (isolated context)

### 2.1 Entry Point

**File:** `src/js/scripting/tool-overlay.js` (line 22)
```javascript
(function uBOLOverlay() {
    if ( self.ubolOverlay ) {
        self.ubolOverlay.stop();
        self.ubolOverlay = undefined;
    }
    self.ubolOverlay = { /* ... */ };
})();
```

### 2.2 Creates ubolOverlay Singleton (Content Script Side)

The overlay uses a **secret attribute technique** to bypass `pointer-events: none`:

```javascript
self.ubolOverlay = {
    secretAttr: (( ) => {
        let secret = String.fromCharCode((Math.random() * 26) + 97);
        do {
            secret += (Math.floor(Math.random() * 2147483647) + 2147483647)
                .toString(36).slice(2);
        } while ( secret.length < 8 );
        return secret;
    })(),
    // ...
};
```

### 2.3 CSS Injection via Background

CSS is NOT injected directly - it sends a message to the background:

```javascript
start() {
    // CSS styles with secret attribute
    this.pickerCSS = [
        `:root > [${this.secretAttr}] { ${cssStyle} }`,
        `:root > [${this.secretAttr}-loaded] { visibility: visible !important; }`,
        `:root > [${this.secretAttr}-click] { pointer-events: none !important; }`,
    ].join('\n');
    
    // Send to background for injection
    this.sendMessage({ what: 'insertCSS', css: this.pickerCSS });
    // ...
}

sendMessage(msg) {
    try {
        return this.webext.runtime.sendMessage(msg).catch(( ) => { });
    } catch { }
}
```

### 2.4 Iframe Creation

The `install()` function creates the iframe and establishes communication:

```javascript
async install(file, onmessage) {
    this.file = file;
    const dynamicURL = new URL(this.webext.runtime.getURL(file));
    return new Promise(resolve => {
        const frame = document.createElement('iframe');
        const secretAttr = this.secretAttr;
        frame.setAttribute(secretAttr, '');
        
        const onLoad = ( ) => {
            frame.onload = null;
            frame.setAttribute(`${secretAttr}-loaded`, '');
            
            // Create MessageChannel for communication
            const channel = new MessageChannel();
            const port = channel.port1;
            port.onmessage = ev => {
                self.ubolOverlay && self.ubolOverlay.onMessage(ev.data || {});
            };
            port.onmessageerror = ( ) => {
                self.ubolOverlay && self.ubolOverlay.onMessage({ what: 'quitTool' });
            };
            
            const realURL = new URL(dynamicURL);
            realURL.hostname = this.webext.i18n.getMessage('@@extension_id');
            
            frame.contentWindow.postMessage(
                { 
                    what: 'startOverlay', 
                    url: document.baseURI, 
                    width: self.innerWidth,   // FIXED: was undefined 'width'
                    height: self.innerHeight  // FIXED: was undefined 'height'
                },
                realURL.origin,
                [channel.port2]
            );
            
            frame.contentWindow.focus();
            self.ubolOverlay.onmessage = onmessage;
            self.ubolOverlay.port = port;
            self.ubolOverlay.frame = frame;
            resolve(true);
        };
        
        // Handle non-Safari protocols
        if ( dynamicURL.protocol !== 'safari-web-extension:' ) {
            frame.onload = ( ) => {
                frame.onload = onLoad;
                frame.contentWindow.location = dynamicURL.href;
            };
        } else {
            frame.onload = onLoad;
            frame.setAttribute('src', dynamicURL.href);
        }
        
        document.documentElement.append(frame);
    });
}
```

### 2.5 ESC Key Handler (Content Script Side)

The content script also handles ESC key to ensure zapper closes properly:

```javascript
onKeyPressed(ev) {
    if ( ev.key !== 'Escape' && ev.which !== 27 ) { return; }
    ev.stopPropagation();
    ev.preventDefault();
    if ( self.ubolOverlay.onmessage ) {
        self.ubolOverlay.onmessage({ what: 'quitTool' });
    }
}
```

This ensures ESC works even if the iframe doesn't respond.

### 2.6 Key Methods

```javascript
// Get element at point (using secret attribute trick)
elementFromPoint(x, y) {
    const magicAttr = `${this.secretAttr}-click`;
    this.frame.setAttribute(magicAttr, '');
    let elem = document.elementFromPoint(x, y);
    if ( elem === document.body || elem === document.documentElement ) {
        elem = null;
    }
    this.frame.removeAttribute(magicAttr);
    return elem;
}

// Highlight elements
highlightElements(iter = []) {
    this.highlightedElements = Array.from(iter).filter(a =>
        a instanceof Element && a !== this.frame
    );
    this.highlightUpdate();
}

// Update SVG paths
highlightUpdate() {
    const ow = self.innerWidth;    // FIXED: define viewport dimensions
    const oh = self.innerHeight;
    const islands = [];            // FIXED: initialize islands array
    
    // Create SVG path from bounding rectangles
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
```

---

## Cross-Context Communication

The zapper runs in THREE separate JavaScript contexts:

1. **Popup context** - `popup-fenix.ts`: Initiates zapper via `scripting.executeScript`
2. **Page context (content script)** - `tool-overlay.js` + `zapper.js`: Handles DOM manipulation, CSS injection
3. **Iframe context** - `zapper-ui.js` + `tool-overlay-ui.js`: Handles UI events

Communication paths:
- Popup → Content Script: `chrome.scripting.executeScript`
- Content Script → Background: `browser.runtime.sendMessage`
- Content Script ↔ Iframe: `MessageChannel` via `ubolOverlay.port`

**Critical:** Code in the content script CANNOT directly reference code in the iframe. Messages must be sent via `ubolOverlay.port.postMessage()`. The iframe's `toolOverlay` object is NOT accessible from the content script.

---

## Flow 3: Zapper UI (zapper-ui.html + tool-overlay-ui.js)

### 3.1 HTML Structure

**File:** `src/zapper-ui.html`

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="/css/zapper-ui.css">
</head>
<body>
    <aside>
        <div id="quit" data-i18n-title="zapperTipQuit">
            <svg viewBox="0 0 64 64">...</svg>
        </div>
        <div id="pick">
            <svg viewBox="0 0 64 64">...</svg>
        </div>
    </aside>
    <svg id="overlay">
        <path/>  <!-- Ocean -->
        <path/>  <!-- Islands (highlight) -->
    </svg>
    <script type="module" src="/js/scripting/zapper-ui.js"></script>
</body>
</html>
```

### 3.2 toolOverlay Object (Iframe UI Side)

**File:** `src/js/scripting/tool-overlay-ui.js`

The `toolOverlay` handles UI events and message passing (runs in iframe context):

```javascript
export const toolOverlay = {
    svgRoot: qs$('svg#overlay'),
    svgOcean: qs$('svg#overlay > path'),
    svgIslands: qs$('svg#overlay > path + path'),
    
    // Start communication
    start(onmessage) {
        globalThis.addEventListener('message', ev => {
            const msg = ev.data || {};
            if ( msg.what === 'startOverlay' ) {
                this.port = ev.ports[0];
                this.onMessage({ what: 'startTool', url: msg.url, width: msg.width, height: msg.height });
            }
        });
    },
    
    // Send message to content script
    postMessage(msg) {
        const wrapped = { fromFrameId: this.messageId++, msg };
        return new Promise(resolve => {
            this.pendingMessages.set(wrapped.fromFrameId, resolve);
            this.port.postMessage(wrapped);
        });
    },
    
    // Handle messages from content script
    onMessage(wrapped) {
        const msg = wrapped.msg || wrapped;
        switch ( msg.what ) {
        case 'svgPaths':
            this.svgOcean.setAttribute('d', msg.ocean + msg.islands);
            this.svgIslands.setAttribute('d', msg.islands);
            break;
        case 'showTooltip':
            this.showTooltip(msg.text, msg.x, msg.y);
            break;
        case 'hideTooltip':
            this.hideTooltip();
            break;
        case 'updateCount':
            this.updateCount(msg.count);
            break;
        case 'stopTool':
            // Notify content script that zapper is stopping
            if ( this.onmessage ) {
                this.onmessage({ what: 'stopTool' });
            }
            break;
        }
    },
    
    showTooltip(text, x, y) {
        const tooltip = qs$('#tooltip');
        tooltip.textContent = text;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y + 20}px`; // Offset below cursor
        tooltip.style.display = 'block';
    },
    
    hideTooltip() {
        const tooltip = qs$('#tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    },
    
    updateCount(count) {
        const counter = qs$('#removeCount');
        if (counter) {
            counter.textContent = count;
        }
    },
    
    // Enable/disable mouse tracking
    highlightElementUnderMouse(state) {
        if ( state ) {
            dom.on(document, 'mousemove', this.onHover, { passive: true });
        } else {
            dom.off(document, 'mousemove', this.onHover, { passive: true });
        }
    },
    
    // Mouse tracking state
    mstrackerOn: false,
    mstrackerX: 0, mstrackerY: 0,
    mstrackerTimer: undefined,
    
    // Mouse hover handler - throttled via requestAnimationFrame
    onHover(ev) {
        this.mstrackerX = ev.clientX;
        this.mstrackerY = ev.clientY;
        if ( this.mstrackerTimer !== undefined ) { return; }
        this.mstrackerTimer = self.requestAnimationFrame(( ) => this.onTimer());
    },
    
    // Timer callback - sends highlight request to content script
    onTimer() {
        this.mstrackerTimer = undefined;
        if ( this.port === null ) { return; }
        this.port.postMessage({
            what: 'highlightElementAtPoint',
            mx: this.mstrackerX,
            my: this.mstrackerY,
        });
    },
    
    // Message tracking
    messageId: 1,
    pendingMessages: new Map(),
};
```

### 3.3 Event Handlers

**File:** `src/js/scripting/zapper-ui.js`

```javascript
import { dom } from './dom.js';
import { toolOverlay } from './tool-overlay-ui.js';

// Start zapper when overlay is ready
toolOverlay.start(onMessage);

// Touch handler - distinguishes tap from swipe
const onSvgTouch = (( ) => {
    let startX = 0, startY = 0;
    let t0 = 0;
    return ev => {
        if ( ev.type === 'touchstart' ) {
            startX = ev.touches[0].screenX;
            startY = ev.touches[0].screenY;
            t0 = ev.timeStamp;
            return;
        }
        if ( startX === undefined ) { return; }
        const stopX = ev.changedTouches[0].screenX;
        const stopY = ev.changedTouches[0].screenY;
        const distance = Math.sqrt(
            Math.pow(stopX - startX, 2) +
            Math.pow(stopY - startY, 2)
        );
        const duration = ev.timeStamp - t0;
        // Interpret as tap if swipe distance < 32px and duration < 200ms
        if ( distance >= 32 || duration >= 200 ) { return; }
        onSvgClicked({
            type: 'touch',
            target: ev.target,
            clientX: ev.changedTouches[0].pageX,
            clientY: ev.changedTouches[0].pageY,
        });
        ev.preventDefault();
    };
})();

function onSvgClicked(ev) {
    toolOverlay.postMessage({
        what: 'zapElementAtPoint',
        mx: ev.clientX,
        my: ev.clientY,
        options: {
            stay: true,
            highlight: dom.cl.has(dom.root, 'mobile') &&
                ev.target !== toolOverlay.svgIslands,
        },
    });
}

function onKeyPressed(ev) {
    // Delete/Backspace - remove element
    if ( ev.key === 'Delete' || ev.key === 'Backspace' ) {
        toolOverlay.postMessage({
            what: 'zapElementAtPoint',
            options: { stay: true },
        });
        return;
    }
    // Escape - close zapper
    if ( ev.key === 'Escape' ) {
        quitZapper();
    }
}

function startZapper() {
    toolOverlay.postMessage({ what: 'startTool' });
    self.addEventListener('keydown', onKeyPressed, true);
    
    dom.on('svg#overlay', 'click', onSvgClicked);
    dom.on('svg#overlay', 'touchstart', onSvgTouch, { passive: true });
    dom.on('svg#overlay', 'touchend', onSvgTouch);
    dom.on('#quit', 'click', quitZapper);
    dom.on('#pick', 'click', resetZapper);
    
    // Start mouse tracking (desktop only)
    toolOverlay.highlightElementUnderMouse(true);
}

function quitZapper() {
    self.removeEventListener('keydown', onKeyPressed, true);
    toolOverlay.stop();  // Sends quitTool message
}

function resetZapper() {
    toolOverlay.postMessage({ what: 'unhighlight' });
}

function onMessage(msg) {
    switch ( msg.what ) {
    case 'startTool':
        startZapper();
        break;
    }
}
```

---

## Flow 4: Element Removal (zapper.js)

### 4.1 Content Script Entry Point

**File:** `src/js/scripting/zapper.js`

```javascript
const ubolOverlay = self.ubolOverlay;
if ( ubolOverlay === undefined ) { return; }
if ( ubolOverlay.file === '/zapper-ui.html' ) { return; }

await ubolOverlay.install('/zapper-ui.html', onMessage);
```

### 4.2 Message Handler

```javascript
const undoStack = [];

function onMessage(msg) {
    switch ( msg.what ) {
    case 'startTool':
        startZapper();
        break;
    case 'quitTool':
        quitZapper();
        break;
    case 'zapElementAtPoint':
        zapElementAtPoint(msg.mx, msg.my, msg.options);
        break;
    case 'unhighlight':
        ubolOverlay.highlightElements([]);
        break;
    case 'undoLastRemoval':
        undoLastRemoval();
        break;
    }
}

function undoLastRemoval() {
    if ( undoStack.length === 0 ) { return; }
    const { elem, parent, nextSibling } = undoStack.pop();
    if (nextSibling) {
        parent.insertBefore(elem, nextSibling);
    } else {
        parent.appendChild(elem);
    }
    updateRemovalCount();
}

function updateRemovalCount() {
    if ( ubolOverlay.port === null ) { return; }
    const wrapped = {
        fromScriptId: ubolOverlay.messageId++,
        msg: {
            what: 'updateCount',
            count: undoStack.length,
        },
    };
    ubolOverlay.port.postMessage(wrapped);
}
```

**Note:** The `undoStack`, `undoLastRemoval()`, and `updateRemovalCount()` functions are defined here and used by `zapElementAtPoint()`.

**IMPORTANT:** `updateRemovalCount()` uses `ubolOverlay.port.postMessage()` - NOT `toolOverlay.postMessage()`. The `toolOverlay` object runs in the iframe context and cannot be directly accessed from the content script. The content script communicates with the iframe via the `MessageChannel` port stored in `ubolOverlay.port`.

### 4.3 Zap Element Function

```javascript
function zapElementAtPoint(mx, my, options) {
    // First click on touch: highlight only
    if ( options.highlight ) {
        const elem = ubolOverlay.elementFromPoint(mx, my);
        if ( elem ) {
            ubolOverlay.highlightElements([ elem ]);
        }
        return;
    }

    // Get element to remove
    let elemToRemove = ubolOverlay.highlightedElements?.[0] ?? null;
    if ( elemToRemove === null && mx !== undefined ) {
        elemToRemove = ubolOverlay.elementFromPoint(mx, my);
    }

    if ( elemToRemove instanceof Element === false ) { return; }

    // Save element for potential undo before removing
    undoStack.push({
        elem: elemToRemove,
        parent: elemToRemove.parentNode,
        nextSibling: elemToRemove.nextSibling,
    });

    // Remove scroll-lock if detected
    handleScrollLock(elemToRemove);

    // Remove element from DOM
    elemToRemove.remove();

    // Highlight next element
    ubolOverlay.highlightElementAtPoint(mx, my);
    
    // Update removal counter
    updateRemovalCount();
}
```

### 4.4 Scroll Lock Detection

```javascript
// Helper function to get computed style property
function getStyleValue(elem, prop) {
    const style = window.getComputedStyle(elem);
    return style ? style[prop] : '';
}

function handleScrollLock(elem) {
    let maybeScrollLocked = elem.shadowRoot instanceof DocumentFragment;
    if ( maybeScrollLocked === false ) {
        let current = elem;
        do {
            maybeScrollLocked =
                parseInt(getStyleValue(current, 'zIndex'), 10) >= 1000 ||
                getStyleValue(current, 'position') === 'fixed';
            current = current.parentElement;
        } while ( current !== null && maybeScrollLocked === false );
    }
    
    if ( maybeScrollLocked ) {
        const doc = document;
        if ( getStyleValue(doc.body, 'overflowY') === 'hidden' ) {
            doc.body.style.setProperty('overflow', 'auto', 'important');
        }
        if ( getStyleValue(doc.body, 'position') === 'fixed' ) {
            doc.body.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'position') === 'fixed' ) {
            doc.documentElement.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'overflowY') === 'hidden' ) {
            doc.documentElement.style.setProperty('overflow', 'auto', 'important');
        }
    }
}
```

---

## Flow 5: Close Zapper

### 5.1 Close via ESC key

ESC is handled in **two places** to ensure reliable closing:

**In zapper-ui.js (UI iframe):**
```javascript
function onKeyPressed(ev) {
    if ( ev.key === 'Escape' ) {
        quitZapper();
    }
}
```

**In tool-overlay.js (content script) - backup handler:**
```javascript
onKeyPressed(ev) {
    if ( ev.key !== 'Escape' && ev.which !== 27 ) { return; }
    ev.stopPropagation();
    ev.preventDefault();
    if ( self.ubolOverlay.onmessage ) {
        self.ubolOverlay.onmessage({ what: 'quitTool' });
    }
}
```

### 5.2 Close via QUIT button

```javascript
function quitZapper() {
    toolOverlay.stop();  // Sends quitTool message
}
```

### 5.3 toolOverlay.stop()

```javascript
// In tool-overlay-ui.js
stop() {
    this.highlightElementUnderMouse(false);
    if ( this.port ) {
        this.port.postMessage({ what: 'quitTool' });
        this.port = null;
    }
}
```

---

## Message Types

### UI (Iframe) → Content Script (via toolOverlay.postMessage → port)

| Message | Parameters | Purpose |
|---------|------------|---------|
| `zapElementAtPoint` | `mx`, `my`, `options` | Highlight or remove element |
| `unhighlight` | - | Clear current highlight |
| `quitTool` | - | Close zapper |
| `undoLastRemoval` | - | Restore last removed element |

### Content Script → UI (via port.postMessage)

| Message | Parameters | Purpose |
|---------|------------|---------|
| `svgPaths` | `ocean`, `islands` | Update SVG overlay |
| `startTool` | `url`, `width`, `height` | Initialize UI (sent when iframe loads) |
| `stopTool` | - | Stop zapper (on port error) |
| `showTooltip` | `text`, `x`, `y` | Show element info tooltip |
| `hideTooltip` | - | Hide tooltip |
| `updateCount` | `count` | Update removal counter |

### Content Script ↔ Background (via runtime.sendMessage)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `insertCSS` | Content → Background | Inject CSS for overlay |
| `removeCSS` | Content → Background | Remove injected CSS |

---

## CSS Classes

### Base Zapper

| Class | Element | Purpose |
|-------|---------|---------|
| `#overlay` | SVG | Full-screen overlay for mouse events |
| `#quit` | DIV | Close button |
| `#pick` | DIV | Clear highlight button |

### Enhanced Features (Optional)

These are **optional** enhancements. The base zapper works without them.

| Class | Element | Purpose |
|-------|---------|---------|
| `#undo` | DIV | Undo last removal button |
| `#removeCount` | SPAN | Shows number of removed elements |
| `#tooltip` | DIV | Element info tooltip |

### Highlight Styling

```css
/* Yellow highlight for zapper mode */
svg#overlay > path + path {
    stroke: #FF0;
    fill: rgba(255, 255, 63, 0.20);
}
```

### Enhanced Tooltip Styling

```css
#tooltip {
    background: rgba(0, 0, 0, 0.85);
    border-radius: 4px;
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    padding: 4px 8px;
    position: fixed;
    pointer-events: none;
    white-space: pre;
    z-index: 2147483647;
}
```

---

## Key Differences from Original uBlock Origin

| Feature | Original uBlock | This Implementation |
|---------|----------------|--------------------|
| Filter Creation | Full dialog | **None** |
| Filter Storage | Saves to list | **None** |
| Overlay Method | Web accessible resources | Secret attribute |
| CSS Injection | Direct | Via background script |
| API | `tabs.executeScript` | `scripting.executeScript` |
| Element Removal | Creates filter + removes | **Just removes** |
| Persistence | Elements stay blocked | Elements reappear on refresh |

---

## Implementation Checklist

- [x] Popup click handler (`#gotoZapper`)
- [x] MV3 `scripting.executeScript` injection
- [x] `tool-overlay.js` with secret attribute
- [x] CSS injection via background script
- [x] `zapper-ui.html` iframe
- [x] `tool-overlay-ui.js` UI logic
- [x] `zapper.js` content script
- [x] SVG overlay for highlighting
- [x] Hover highlighting (desktop)
- [x] Tap to highlight (touch)
- [x] Tap again to remove (touch)
- [x] Click to remove (desktop)
- [x] Delete key to remove
- [x] ESC to close
- [x] QUIT button
- [x] PICK button (clear highlight)
- [x] Scroll lock detection
- [x] Element removal from DOM
- [x] **DONE** - Zapper removes elements only, no filter storage

---

## Behavior Summary

| Platform | Action | Result |
|----------|--------|--------|
| Desktop | Hover | Highlights element under cursor |
| Desktop | Click on element | Removes element, highlights next |
| Desktop | Delete/Backspace | Removes highlighted element |
| Touch | Tap on element | Highlights element |
| Touch | Tap again | Removes element |
| Any | ESC | Closes zapper (handled in both UI and content script) |
| Any | Refresh | Removed elements reappear |

---

## What Zapper Does NOT Do

- Does NOT generate cosmetic filters
- Does NOT save to user filter list
- Does NOT block elements on future page loads
- Does NOT show filter creation dialog
- Does NOT support network request blocking

---

## Enhanced Features

The following enhancements improve user experience without adding filter generation complexity.

### 1. Session Undo Stack

Elements removed during a session can be restored.

**Changes to zapper.js:**
- Add `undoStack` array to store removed elements
- In `zapElementAtPoint()`: push element to stack before removing
- Add `undoLastRemoval()` function to restore last element
- Add `updateRemovalCount()` to notify UI of count change

**New Messages:**
- `undoLastRemoval` (UI → Content): Restore last removed element

**Changes to zapper-ui.js:**
- Add Ctrl+Z handler to send `undoLastRemoval` message
- Add click handler for UNDO button

**UI Changes:**
```html
<aside>
    <div id="quit">...</div>
    <div id="pick">...</div>
    <div id="undo">↶</div>
    <span id="removeCount">0</span>
</aside>
```

### 2. Element Info Tooltip

Shows details about the element under the cursor.

**Changes to tool-overlay.js:**
- Add `showElementInfo()` function that extracts element details
- Call on mouse move to update tooltip

**New Messages:**
- `showTooltip` (Content → UI): `{ text, x, y }`
- `hideTooltip` (Content → UI): no parameters

**Changes to tool-overlay-ui.js:**
- Add `showTooltip()` method to display tooltip
- Add `hideTooltip()` method to hide tooltip

**Tooltip Styling:**
```css
#tooltip {
    background: rgba(0, 0, 0, 0.85);
    border-radius: 4px;
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    padding: 4px 8px;
    position: fixed;
    pointer-events: none;
    white-space: pre;
    z-index: 2147483647;
}
```

### 3. Removal Counter

Shows how many elements have been removed in current session.

**New Messages:**
- `updateCount` (Content → UI): `{ count: number }`

**Changes to tool-overlay-ui.js:**
- Add `updateCount()` method to update counter display

**Styling:**
```css
#removeCount {
    font-size: 0.8em;
    opacity: 0.7;
    padding: 4px;
}
```

### 4. Smart Highlight Modes (Optional)

Different highlight styles for different purposes.

```javascript
// Modes: 'element' (default), 'parent', 'batch'

function highlightMode(mode, elem) {
    switch (mode) {
        case 'parent':
            return getParentContainer(elem);
        case 'batch':
            return querySelectorAll(buildSelector(elem));
        default:
            return [elem];
    }
}
```

---

## Script Dependencies

The zapper UI has the following import chain:

1. `zapper-ui.html` loads `zapper-ui.js` as a module
2. `zapper-ui.js` imports `tool-overlay-ui.js` and `dom.js`
3. `tool-overlay-ui.js` imports `dom.js` and `ext.js`

```
zapper-ui.html
  └── zapper-ui.js (entry point)
        ├── dom.js (DOM utilities)
        └── tool-overlay-ui.js (UI logic)
              ├── dom.js
              └── ext.js (extension API)
```

---

## Enhanced File Structure

```
src/
├── js/
│   ├── scripting/
│   │   ├── tool-overlay.js      # Content script with undo stack
│   │   ├── tool-overlay-ui.js  # UI with tooltip display
│   │   ├── zapper-ui.js       # UI entry point
│   │   ├── zapper.js           # Element removal logic
│   │   ├── dom.js              # DOM utilities
│   │   └── ext.js              # Extension utilities
│   └── popup-fenix.ts          # Popup handler
├── zapper-ui.html               # HTML with undo button, tooltip
└── css/
    ├── zapper-ui.css           # Updated with tooltip styles
    └── zapper-enhanced.css     # Optional: additional styles
```

---

## Enhanced HTML Structure

```html
<aside>
    <div id="quit" title="Close (ESC)">
        <svg>...</svg>
    </div>
    <div id="pick" title="Pick element">
        <svg>...</svg>
    </div>
    <div id="undo" title="Undo (Ctrl+Z)">
        <svg>...</svg>
    </div>
    <span id="removeCount" title="Elements removed">0</span>
</aside>

<!-- Tooltip positioned outside aside to avoid z-index issues -->
<div id="tooltip" style="display: none;"></div>

<svg id="overlay">...</svg>
```

---

## Enhanced Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ESC | Close zapper |
| Delete/Backspace | Remove highlighted element |
| Ctrl+Z | Undo last removal |
| H | Toggle highlight mode (element/parent) |
| ? | Show keyboard shortcuts |

---

## Enhanced Behavior Summary

| Platform | Action | Result |
|----------|--------|--------|
| Desktop | Hover | Highlights element + shows tooltip |
| Desktop | Click | Removes element + updates counter |
| Desktop | Delete/Backspace | Removes highlighted element |
| Desktop | Ctrl+Z | Undo last removal |
| Touch | Tap | Highlights element + shows tooltip |
| Touch | Tap again | Removes element + updates counter |
| Any | ESC | Closes zapper |
| Any | Refresh | Removed elements lost (session only) |

---

## Implementation Priority

1. **P0 - Essential**
   - Basic highlight and remove ✓
   - ESC to close ✓
   - QUIT button ✓

2. **P1 - Important**
   - Removal counter (feedback)
   - Session undo (recover mistakes)
   - Element info tooltip (context)

3. **P2 - Nice to have**
   - Parent highlighting
   - Keyboard navigation
   - Batch removal mode

---

## Revision History

### Fixed Issues (2026-04-08)

1. **Popup handler undefined variable**: `currentTab.id` was undefined. Added `getCurrentTab()` helper function. Alternative: use `popupData.tabId`.

2. **install() undefined variables**: `width` and `height` were undefined. Fixed to use `self.innerWidth` and `self.innerHeight`. Also added complete implementation with `MessageChannel` setup and `onLoad` handler.

3. **highlightUpdate() undefined variables**: `ow`, `oh`, `islands` were referenced before definition. Added proper variable declarations and offscreen area checks from reference implementation.

4. **Cross-context communication bug**: `updateRemovalCount()` called `toolOverlay.postMessage()` but `toolOverlay` runs in iframe context, not content script. Fixed to use `ubolOverlay.port.postMessage()` with proper message wrapping format.

5. **stopTool handler**: Changed from `this.stop()` to `this.onmessage({ what: 'stopTool' })` to properly notify content script.

6. **File structure inconsistency**: Paths showed `src/extension/picker-src/` but popup handler referenced `js/scripting/`. Updated to consistent structure.

7. **Added Cross-Context Communication section**: Documented the three JavaScript contexts and communication paths to prevent future confusion.

### Fixed Issues (2026-04-08 - Round 2)

8. **Architecture diagram inconsistency**: Diagram showed `popup.js` but file structure shows `popup-fenix.ts`. Updated diagram to match.

9. **Multiple file path inconsistencies**: File header comments still used old `picker-src/` paths. Updated all references to use `src/js/scripting/` structure.

10. **Missing zapper-ui.js in file structure**: The file `zapper-ui.js` was referenced in HTML but missing from file structure. Added to both base and enhanced file structures.

11. **Added Script Dependencies section**: Documented the import chain between zapper UI files to clarify how scripts depend on each other.

### Fixed Issues (2026-04-08 - Round 3)

12. **Missing toolOverlay state properties**: `mstrackerOn`, `mstrackerX`, `mstrackerY`, `mstrackerTimer`, `messageId`, and `pendingMessages` were not documented. Added these to toolOverlay object definition.

13. **Missing onHover and onTimer methods**: The mouse tracking implementation was incomplete. Added `onHover()` (throttled via requestAnimationFrame) and `onTimer()` (sends `highlightElementAtPoint` to content script).

14. **Missing onSvgTouch function**: Touch event handling for distinguishing taps from swipes was not documented. Added the full `onSvgTouch` implementation.

15. **Missing getStyleValue helper**: The `handleScrollLock` function referenced `getStyleValue` but it was not defined. Added the helper function.
