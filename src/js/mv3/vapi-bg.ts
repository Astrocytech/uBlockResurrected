/**
 * vAPI Background Framework
 * Provides the vAPI object and all browser API shims for MV3 service workers.
 * 
 * @module mv3/vapi-bg
 */

export const VAPI_VERSION = '1.9.15';

// Ensure browser API is available
const browserAPI = self as unknown as typeof globalThis & {
    browser?: typeof chrome;
};

self.browser = self.browser || chrome;

/**
 * Main vAPI object providing uBlock Resurrected API shims
 */
const vAPI = {
    uBO: true,
    version: VAPI_VERSION,
    inElementPickerMode: false,
    inZapperMode: false,
    isBehindTheSceneTabId: function(tabId: number): boolean { return tabId === -1; },
    noTabId: -1,
    T0: Date.now()
};

vAPI.setTimeout = function(fn: () => void, delay: number): number {
    return setTimeout(fn, delay);
};

vAPI.getURL = function(path: string): string {
    return chrome.runtime.getURL(path);
};

vAPI.generateSecret = function(size?: number): string {
    return Math.random().toString(36).slice(2, 2 + (size || 1));
};

vAPI.download = function(): void {};
vAPI.closePopup = function(): void {};
vAPI.setIcon = function(): void {};
vAPI.setDefaultIcon = function(): void {};
vAPI.scriptletsInjector = function(): void {};
vAPI.prefetching = function(): void {};

vAPI.Net = function(): void {
    (this as { handlerBehaviorChanged: () => void }).handlerBehaviorChanged = function(): void {};
    (this as { setSuspendableListener: () => void }).setSuspendableListener = function(): void {};
};

vAPI.Net.prototype = {
    handlerBehaviorChanged: function(): void {},
    setSuspendableListener: function(): void {}
};

vAPI.net = {
    addListener: function(): void {},
    removeListener: function(): void {},
    handlerBehaviorChanged: function(): void {},
    setSuspendableListener: function(): void {},
    hasUnprocessedRequest: function(): boolean { return false; },
    suspend: function(): void {},
    unsuspend: function(): void {}
};

vAPI.defer = {
    create: function(callback: () => void) { return new vAPI.defer.Client(callback); },
    once: function(delay?: number) { return Promise.resolve(); },
    normalizeDelay: function(delay?: number) { return delay || 0; },
    Client: function(callback: () => void) { 
        (this as { callback: () => void; timer: number | null }).callback = callback; 
        (this as { timer: number | null }).timer = null; 
    }
};

(vAPI.defer.Client as any).prototype.on = function(delay?: number): void {
    const self = this as { callback: () => void; timer: number | null };
    self.timer = setTimeout(function() { self.callback(); }, delay || 0);
};

(vAPI.defer.Client as any).prototype.off = function(): void {
    const self = this as { timer: number | null };
    if (self.timer) { clearTimeout(self.timer); self.timer = null; }
};

// requestIdleCallback polyfill for service worker
self.requestIdleCallback = self.requestIdleCallback || function(cb: () => void, opts?: { timeout?: number }) {
    return setTimeout(cb, (opts && opts.timeout) || 100) as unknown as number;
};

self.cancelIdleCallback = self.cancelIdleCallback || function(id: number) { clearTimeout(id); };

vAPI.commands = {
    onCommand: {
        addListener: function(cb: (command: string) => void) { chrome.commands.onCommand.addListener(cb); },
        removeListener: function(cb: (command: string) => void) { chrome.commands.onCommand.removeListener(cb); }
    }
};

vAPI.alarms = {
    create: function(): void {},
    clear: function(): Promise<boolean> { return Promise.resolve(true); },
    clearAll: function(): Promise<void> { return Promise.resolve(); },
    get: function(): Promise<null> { return Promise.resolve(null); },
    getAll: function(): Promise<unknown[]> { return Promise.resolve([]); },
    onAlarm: { addListener: function(): void {}, removeListener: function(): void {} }
};

vAPI.tabs = {
    query: function(): Promise<chrome.tabs.Tab[]> { return Promise.resolve([]); },
    get: function(): Promise<chrome.tabs.Tab | null> { return Promise.resolve(null); },
    getCurrent: function(): Promise<{ id: number }> { return Promise.resolve({ id: -1 }); },
    create: function(opts: { url?: string; select?: boolean; index?: number }): Promise<chrome.tabs.Tab> {
        return chrome.tabs.create({
            url: opts.url,
            active: opts.select !== false,
            index: opts.index
        });
    },
    update: function(): Promise<chrome.tabs.Tab> { return Promise.resolve({} as chrome.tabs.Tab); },
    remove: function(): Promise<void> { return Promise.resolve(); },
    open: function(details: { url: string; select?: boolean; index?: number }): Promise<chrome.tabs.Tab> {
        let url = details.url;
        if (url.startsWith("/")) { url = chrome.runtime.getURL(url); }
        return chrome.tabs.create({
            url: url,
            active: details.select !== false,
            index: details.index
        });
    },
    insertCSS: function(): Promise<void> { return Promise.resolve(); },
    removeCSS: function(): Promise<void> { return Promise.resolve(); },
    executeScript: function(): Promise<unknown[]> { return Promise.resolve([]); },
    sendMessage: function(): Promise<void> { return Promise.resolve(); },
    reload: function(): void {}
};

vAPI.windows = {
    get: function(): Promise<unknown> { return Promise.resolve(null); },
    create: function(): Promise<{ id: number }> { return Promise.resolve({ id: -1 }); },
    update: function(): Promise<unknown> { return Promise.resolve({}); }
};

vAPI.browserAction = {
    setIcon: function(): Promise<void> { return Promise.resolve(); },
    setTitle: function(): Promise<void> { return Promise.resolve(); },
    setBadgeText: function(): Promise<void> { return Promise.resolve(); },
    setBadgeBackgroundColor: function(): Promise<void> { return Promise.resolve(); },
    setBadgeTextColor: function(): Promise<void> { return Promise.resolve(); },
    getTitle: function(): Promise<string> { return Promise.resolve(""); },
    getBadgeText: function(): Promise<string> { return Promise.resolve(""); }
};

vAPI.contextMenu = {
    setEntries: function(): void {},
    onMustUpdate: function(): void {}
};

vAPI.webextFlavor = {
    soup: {
        chromium: true,
        user_stylesheet: true,
        has: function(s: string): boolean { return !!((this as Record<string, boolean>)[s]); }
    },
    major: 120
};

vAPI.i18n = { t: function(s: string): string { return s; } };

vAPI.cloud = {
    push: function(): Promise<void> { return Promise.resolve(); },
    pull: function(): Promise<unknown> { return Promise.resolve({}); },
    used: function(): void {},
    getOptions: function(): void {},
    setOptions: function(): void {}
};

vAPI.statistics = {
    add: function(): void {},
    save: function(): Promise<void> { return Promise.resolve(); }
};

vAPI.app = {
    restart: function(): void {},
    version: VAPI_VERSION,
    intFromVersion: function(v: string): number { return parseInt(v.replace(/\./g, ""), 10) || 0; }
};

// WebRequest shim (MV3 doesn't support blocking webRequest)
(function() {
    const originalWebRequest = chrome.webRequest;
    chrome.webRequest = {
        onBeforeRequest: {
            addListener: function(
                cb: (details: chrome.webRequest.WebRequestDetails) => void,
                filters: chrome.webRequest.RequestFilter,
                opts?: string[]
            ) {
                if (opts && opts.indexOf("blocking") !== -1) {
                    return;
                }
                originalWebRequest.onBeforeRequest.addListener(cb, filters, opts as chrome.webRequest.RequestOptions);
            },
            removeListener: function(cb: (details: chrome.webRequest.WebRequestDetails) => void) { 
                originalWebRequest.onBeforeRequest.removeListener(cb); 
            }
        },
        onHeadersReceived: {
            addListener: function(
                cb: (details: chrome.webRequest.WebRequestHeadersDetails) => void,
                filters: chrome.webRequest.RequestFilter,
                opts?: chrome.webRequest.OnHeadersReceivedOptions
            ) {
                originalWebRequest.onHeadersReceived.addListener(cb, filters, opts);
            },
            removeListener: function(cb: (details: chrome.webRequest.WebRequestHeadersDetails) => void) { 
                originalWebRequest.onHeadersReceived.removeListener(cb); 
            }
        },
        ResourceType: originalWebRequest.ResourceType,
        handlerBehaviorChanged: function(): void {}
    };
})();

// DOM shims for service worker context
self.CSS = self.CSS || {
    escape: function(s: string): string { return s; },
    supports: function(): boolean { return false; }
};

self.Image = self.Image || function(w?: number, h?: number) {
    const img = {
        width: w || 0,
        height: h || 0,
        src: "",
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null
    };
    img.addEventListener = function(): void {};
    img.removeEventListener = function(): void {};
    return img;
};

self.window = self;

self.Element = self.Element || function(): void {};
self.HTMLElement = self.HTMLElement || function(): void {};
self.Event = self.Event || function(type: string) { 
    (this as { type: string }).type = type; 
};

self.document = {
    createElement: function(tag: string) {
        return {
            tagName: tag.toUpperCase(),
            style: {},
            children: [],
            setAttribute: function(): void {},
            getAttribute: function(): null { return null; },
            removeAttribute: function(): void {},
            appendChild: function(): void {},
            addEventListener: function(): void {},
            removeEventListener: function(): void {}
        };
    },
    createElementNS: function(): Record<string, unknown> { return {}; },
    createTextNode: function(text: string) { return { textContent: text }; },
    createDocumentFragment: function() { return { children: [], appendChild: function(): void {} }; },
    getElementsByTagName: function() { return []; },
    getElementById: function() { return null; },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function(): void {},
    removeEventListener: function(): void {},
    body: {
        setAttribute: function(): void {},
        getAttribute: function() { return null; },
        appendChild: function(): void {},
        children: []
    },
    head: {
        setAttribute: function(): void {},
        getAttribute: function() { return null; },
        appendChild: function(): void {},
        children: []
    },
    documentElement: {
        setAttribute: function(): void {},
        getAttribute: function() { return null; },
        appendChild: function(): void {},
        children: []
    }
};

export { vAPI };
