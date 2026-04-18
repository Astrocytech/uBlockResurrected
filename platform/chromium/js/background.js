/*******************************************************************************

    uBlock Resurrected - Chrome MV3 Service Worker
    This file initializes the service worker environment and loads scripts
    using importScripts() to ensure proper loading order.

******************************************************************************/

'use strict';

self.console = self.console || {
    log: function() {},
    error: function() {},
    warn: function() {},
    info: function() {}
};

self.vAPI = self.vAPI || { uBR: true };
self.vAPI.T0 = Date.now();

self.window = self;
// Note: self is read-only in Chrome service workers, don't reassign

self.document = {
    createElement: function(tag) {
        return {
            tagName: (tag || '').toUpperCase(),
            style: {},
            children: [],
            setAttribute: function(name, value) { this[name] = value; },
            getAttribute: function(name) { return this[name] || null; },
            removeAttribute: function(name) { delete this[name]; },
            appendChild: function(child) { this.children.push(child); },
            removeChild: function(child) {
                var idx = this.children.indexOf(child);
                if (idx > -1) this.children.splice(idx, 1);
                return child;
            },
            addEventListener: function() {},
            removeEventListener: function() {},
            querySelector: function() { return null; },
            querySelectorAll: function() { return []; }
        };
    },
    createElementNS: function(ns, tag) { return this.createElement(tag); },
    createTextNode: function(text) { return { textContent: text, nodeType: 3 }; },
    createDocumentFragment: function() {
        return { nodeType: 11, children: [], appendChild: function(c) { this.children.push(c); } };
    },
    getElementsByTagName: function() { return []; },
    getElementById: function() { return null; },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    head: null,
    body: null,
    documentElement: null,
    addEventListener: function() {},
    removeEventListener: function() {},
    contentType: 'text/html'
};

self.HTMLDocument = function() {};
self.HTMLDocument.prototype = {};
self.XMLDocument = function() {};
self.XMLDocument.prototype = {};

self.HTMLDivElement = function() {};
self.HTMLDivElement.prototype = Object.create(null);

self.document.head = self.document.createElement('head');
self.document.body = self.document.createElement('body');
self.document.documentElement = self.document.createElement('html');

self.Element = function() {};
self.Element.prototype = Object.create(null);
self.Element.prototype.constructor = self.Element;

self.HTMLElement = function() {};
self.HTMLElement.prototype = Object.create(self.Element.prototype);
self.HTMLElement.prototype.constructor = self.HTMLElement;

self.HTMLDivElement = function() {};
self.HTMLDivElement.prototype = Object.create(self.HTMLElement.prototype);
self.HTMLDivElement.prototype.constructor = self.HTMLDivElement;

self.Event = function(type) { this.type = type; };
self.Event.prototype = Object.create(null);

self.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 };
self.Node.prototype = Object.create(null);

try {
    self.console.log('Trying to load js/test.js...');
    importScripts('js/test.js');
    self.console.log('test.js loaded OK, testVar =', testVar);
} catch (e) {
    self.console.error('Error loading test.js:', e);
}

self.oninstall = function(event) {
    self.skipWaiting();
};

self.onactivate = function(event) {
    self.clients.claim();
};

self.onfetch = function(event) {
    event.respondWith(fetch(event.request));
};