/**
 * uBlock Origin - MV3 Service Worker
 * vAPI Background Framework
 */

const VAPI_VERSION = '1.9.15';

self.browser = self.browser || chrome;

var vAPI = {
    uBO: true,
    version: VAPI_VERSION,
    inZapperMode: false,
    isBehindTheSceneTabId: function(tabId) { return tabId === -1; },
    noTabId: -1,
    T0: Date.now()
};

vAPI.setTimeout = function(fn, delay) { return setTimeout(fn, delay); };
vAPI.getURL = function(path) { return chrome.runtime.getURL(path); };
vAPI.generateSecret = function(size) { return Math.random().toString(36).slice(2, 2 + (size || 1)); };
vAPI.download = function() {};
vAPI.closePopup = function() {};
vAPI.setIcon = function() {};
vAPI.setDefaultIcon = function() {};
vAPI.scriptletsInjector = function() {};
vAPI.prefetching = function() {};

vAPI.Net = function() {
    this.handlerBehaviorChanged = function() {};
    this.setSuspendableListener = function() {};
};
vAPI.Net.prototype = {
    handlerBehaviorChanged: function() {},
    setSuspendableListener: function() {}
};

vAPI.net = {
    addListener: function() {},
    removeListener: function() {},
    handlerBehaviorChanged: function() {},
    setSuspendableListener: function() {},
    hasUnprocessedRequest: function() { return false; },
    suspend: function() {},
    unsuspend: function() {}
};

vAPI.defer = {
    create: function(callback) { return new vAPI.defer.Client(callback); },
    once: function(delay) { return Promise.resolve(); },
    normalizeDelay: function(delay) { return delay || 0; },
    Client: function(callback) { this.callback = callback; this.timer = null; }
};
vAPI.defer.Client.prototype.on = function(delay) {
    var self = this;
    this.timer = setTimeout(function() { self.callback(); }, delay || 0);
};
vAPI.defer.Client.prototype.off = function() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
};

self.requestIdleCallback = self.requestIdleCallback || function(cb, opts) {
    return setTimeout(cb, opts && opts.timeout || 100);
};
self.cancelIdleCallback = self.cancelIdleCallback || function(id) { clearTimeout(id); };

vAPI.commands = {
    onCommand: {
        addListener: function(cb) { chrome.commands.onCommand.addListener(cb); },
        removeListener: function(cb) { chrome.commands.onCommand.removeListener(cb); }
    }
};

vAPI.alarms = {
    create: function() {},
    clear: function() { return Promise.resolve(true); },
    clearAll: function() { return Promise.resolve(); },
    get: function() { return Promise.resolve(null); },
    getAll: function() { return Promise.resolve([]); },
    onAlarm: { addListener: function() {}, removeListener: function() {} }
};

vAPI.tabs = {
    query: function() { return Promise.resolve([]); },
    get: function() { return Promise.resolve(null); },
    getCurrent: function() { return Promise.resolve({ id: -1 }); },
    create: function(opts) {
        return chrome.tabs.create({
            url: opts.url,
            active: opts.select !== false,
            index: opts.index
        });
    },
    update: function() { return Promise.resolve({}); },
    remove: function() { return Promise.resolve(); },
    open: function(details) {
        var url = details.url;
        if (url.startsWith("/")) { url = chrome.runtime.getURL(url); }
        return chrome.tabs.create({
            url: url,
            active: details.select !== false,
            index: details.index
        });
    },
    insertCSS: function() { return Promise.resolve(); },
    removeCSS: function() { return Promise.resolve(); },
    executeScript: function() { return Promise.resolve([]); },
    sendMessage: function() { return Promise.resolve(); },
    reload: function() {}
};

vAPI.windows = {
    get: function() { return Promise.resolve(null); },
    create: function() { return Promise.resolve({ id: -1 }); },
    update: function() { return Promise.resolve({}); }
};

vAPI.browserAction = {
    setIcon: function() { return Promise.resolve(); },
    setTitle: function() { return Promise.resolve(); },
    setBadgeText: function() { return Promise.resolve(); },
    setBadgeBackgroundColor: function() { return Promise.resolve(); },
    setBadgeTextColor: function() { return Promise.resolve(); },
    getTitle: function() { return Promise.resolve(""); },
    getBadgeText: function() { return Promise.resolve(""); }
};

vAPI.contextMenu = {
    setEntries: function() {},
    onMustUpdate: function() {}
};

vAPI.webextFlavor = {
    soup: {
        chromium: true,
        user_stylesheet: true,
        has: function(s) { return !!this[s]; }
    },
    major: 120
};

vAPI.i18n = { t: function(s) { return s; } };

vAPI.cloud = {
    push: function() { return Promise.resolve(); },
    pull: function() { return Promise.resolve({}); },
    used: function() {},
    getOptions: function() {},
    setOptions: function() {}
};

vAPI.statistics = {
    add: function() {},
    save: function() { return Promise.resolve(); }
};

vAPI.app = {
    restart: function() {},
    version: VAPI_VERSION,
    intFromVersion: function(v) { return parseInt(v.replace(/\./g, ""), 10) || 0; }
};

(function() {
    var originalWebRequest = chrome.webRequest;
    chrome.webRequest = {
        onBeforeRequest: {
            addListener: function(cb, filters, opts) {
                if (opts && opts.indexOf("blocking") !== -1) {
                    return;
                }
                originalWebRequest.onBeforeRequest.addListener(cb, filters, opts);
            },
            removeListener: function(cb) { originalWebRequest.onBeforeRequest.removeListener(cb); }
        },
        onHeadersReceived: {
            addListener: function(cb, filters, opts) {
                originalWebRequest.onHeadersReceived.addListener(cb, filters, opts);
            },
            removeListener: function(cb) { originalWebRequest.onHeadersReceived.removeListener(cb); }
        },
        ResourceType: originalWebRequest.ResourceType,
        handlerBehaviorChanged: function() {}
    };
})();

self.CSS = self.CSS || {
    escape: function(s) { return s; },
    supports: function() { return false; }
};

self.Image = self.Image || function(w, h) {
    var img = {
        width: w || 0,
        height: h || 0,
        src: "",
        onload: null,
        onerror: null
    };
    img.addEventListener = function() {};
    img.removeEventListener = function() {};
    return img;
};

self.window = self;

self.Element = self.Element || function() {};
self.HTMLElement = self.HTMLElement || function() {};
self.Event = self.Event || function(type) { this.type = type; };

self.document = {
    createElement: function(tag) {
        return {
            tagName: tag.toUpperCase(),
            style: {},
            children: [],
            setAttribute: function() {},
            getAttribute: function() { return null; },
            removeAttribute: function() {},
            appendChild: function() {},
            addEventListener: function() {},
            removeEventListener: function() {}
        };
    },
    createElementNS: function() { return {}; },
    createTextNode: function(text) { return { textContent: text }; },
    createDocumentFragment: function() { return { children: [], appendChild: function() {} }; },
    getElementsByTagName: function() { return []; },
    getElementById: function() { return null; },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
    removeEventListener: function() {},
    body: {
        setAttribute: function() {},
        getAttribute: function() { return null; },
        appendChild: function() {},
        children: []
    },
    head: {
        setAttribute: function() {},
        getAttribute: function() { return null; },
        appendChild: function() {},
        children: []
    },
    documentElement: {
        setAttribute: function() {},
        getAttribute: function() { return null; },
        appendChild: function() {},
        children: []
    }
};

export { vAPI, VAPI_VERSION };
