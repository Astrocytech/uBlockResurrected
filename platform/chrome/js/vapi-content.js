/*******************************************************************************

    uBlock Origin - vAPI Content Script
    https://github.com/gorhill/uBlock

    Web accessible resource version of vAPI for use in injected frames
    and element picker UI. Communicates with the content script via
    chrome.runtime.sendMessage.

*******************************************************************************/

(function() {
    'use strict';

    var vAPI = window.vAPI || {};

    vAPI.contentScript = {
        _tabId: null,
        _ready: false,
        _queue: [],

        _processQueue: function() {
            while (this._queue.length > 0) {
                var item = this._queue.shift();
                this._send(item.topic, item.payload, item.callback);
            }
        },

        _send: function(topic, payload, callback) {
            var msg = {
                ch: 'content-script',
                fn: topic,
                args: payload !== undefined ? [payload] : []
            };

            if (callback) {
                chrome.runtime.sendMessage(msg, function(response) {
                    if (callback) {
                        callback(response);
                    }
                });
            } else {
                chrome.runtime.sendMessage(msg);
            }
        },

        send: function(topic, payload, callback) {
            if (this._ready) {
                this._send(topic, payload, callback);
            } else {
                this._queue.push({ topic: topic, payload: payload, callback: callback });
            }
        },

        isReady: function() {
            return this._ready;
        },

        setReady: function(tabId) {
            this._tabId = tabId;
            this._ready = true;
            this._processQueue();
        }
    };

    vAPI.epickerUI = {
        highlightTimer: null,
        highlightRect: null,

        highlight: function(rect, options) {
            this.sendToPicker({
                action: 'highlightRect',
                rect: rect,
                options: options
            });
        },

        pick: function(target) {
            this.sendToPicker({
                action: 'pickElement',
                target: target
            });
        },

        cancel: function() {
            this.sendToPicker({
                action: 'cancel'
            });
        },

        createFilter: function(selector, filterType) {
            this.sendToPicker({
                action: 'createFilter',
                selector: selector,
                filterType: filterType || 'block'
            });
        },

        sendToPicker: function(message) {
            vAPI.contentScript.send('pickerMessage', message);
        }
    };

    vAPI.epicker = {
        logger: null,
        picker: null,

        show: function() {
            this.send({ action: 'showPicker' });
        },

        hide: function() {
            this.send({ action: 'hidePicker' });
        },

        highlighted: function(details) {
            this.send({ action: 'highlighted', details: details });
        },

        picked: function(details) {
            this.send({ action: 'picked', details: details });
        },

        sentinel: function(details) {
            this.send({ action: 'sentinel', details: details });
        },

        send: function(message) {
            vAPI.contentScript.send('pickerMessage', message);
        }
    };

    vAPI.mouseClick = function(target, options) {
        if (!target) return;
        
        var event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: options && options.button || 0
        });
        
        if (options && options.modifiers) {
            Object.defineProperty(event, 'ctrlKey', { value: options.modifiers.ctrlKey || false });
            Object.defineProperty(event, 'altKey', { value: options.modifiers.altKey || false });
            Object.defineProperty(event, 'shiftKey', { value: options.modifiers.shiftKey || false });
            Object.defineProperty(event, 'metaKey', { value: options.modifiers.metaKey || false });
        }
        
        target.dispatchEvent(event);
    };

    vAPI.getBytesInUse = function(keys, callback) {
        chrome.storage.local.getBytesInUse(keys, callback);
    };

    vAPI.storage = {
        _local: {},
        _changes: {},

        get: function(key, defaultValue, callback) {
            var self = this;
            chrome.storage.local.get(key, function(items) {
                var value = items[key];
                if (value === undefined && defaultValue !== undefined) {
                    value = defaultValue;
                }
                if (callback) {
                    callback(value);
                }
            });
        },

        set: function(key, value, callback) {
            var data = {};
            data[key] = value;
            chrome.storage.local.set(data, callback);
        },

        remove: function(key, callback) {
            chrome.storage.local.remove(key, callback);
        },

        onChanged: function(callback) {
            chrome.storage.onChanged.addListener(function(changes, areaName) {
                if (areaName === 'local' && callback) {
                    callback(changes);
                }
            });
        }
    };

    vAPI.epickerLog = {
        _entries: [],
        _maxEntries: 1000,

        add: function(entry) {
            this._entries.push({
                timestamp: Date.now(),
                entry: entry
            });
            if (this._entries.length > this._maxEntries) {
                this._entries.shift();
            }
        },

        getAll: function() {
            return this._entries.slice();
        },

        clear: function() {
            this._entries = [];
        }
    };

    window.vAPI = vAPI;

})();
