/*******************************************************************************

    uBlock Origin - Content Script vAPI
    https://github.com/gorhill/uBlock

    This is a minimal vAPI implementation for MV3 compatibility.
    The content script is injected by the extension and communicates
    with the background service worker via chrome.runtime.sendMessage.

    Field naming conventions:
    - Public fields/methods are direct properties
    - Private fields use vAPI_ prefix
    - Constants use UPPER_SNAKE_CASE

*******************************************************************************/

(function() {
    'use strict';

    var vAPI = {};

    try {
        vAPI.clientId = chrome.runtime.id;
    } catch (e) {
        vAPI.clientId = 'unknown';
    }

    vAPI.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);

    vAPI.extensionURL = function(path) {
        try {
            if (path === undefined) {
                return chrome.runtime.getURL('/');
            }
            return chrome.runtime.getURL(path);
        } catch (e) {
            return '/' + (path || '');
        }
    };

    vAPI.getMessage = function(key, args) {
        try {
            return chrome.i18n.getMessage(key, args) || '';
        } catch (e) {
            return key || '';
        }
    };

    vAPI.i18n = function(text) {
        if (text === undefined) { return text; }
        if (typeof text !== 'string') { return text; }
        var s = text.replace(/[<>]/g, '');
        return vAPI.getMessage(s) || s;
    };

    vAPI.chrome = typeof chrome !== 'undefined' ? chrome : undefined;

    vAPI.randomToken = function() {
        return Math.random().toString(36).slice(2);
    };

    vAPI.closePopup = function() {
        window.close();
    };

    vAPI.shutdown = vAPI.shutdown || {
        _callbacks: new Set(),
        add: function(callback) {
            if ( typeof callback !== 'function' ) { return; }
            this._callbacks.add(callback);
        },
        remove: function(callback) {
            if ( typeof callback !== 'function' ) { return; }
            this._callbacks.delete(callback);
        },
        exec: function() {
            var callbacks = Array.from(this._callbacks);
            this._callbacks.clear();
            for ( var i = 0; i < callbacks.length; i++ ) {
                try {
                    callbacks[i]();
                } catch {
                }
            }
        },
    };

    vAPI.messaging = {
        _port: null,
        _callbacks: {},
        _seq: 0,
        _ready: false,
        _queue: [],

        _unwrapResponse: function(response) {
            if ( response && typeof response === 'object' ) {
                if ( Object.prototype.hasOwnProperty.call(response, 'payload') ) {
                    return response.payload;
                }
                if ( Object.prototype.hasOwnProperty.call(response, 'msg') ) {
                    return response.msg;
                }
            }
            return response;
        },

        _useRuntimeMessage: function() {
            try {
                return typeof self.location?.protocol === 'string' &&
                    /^(chrome|moz)-extension:$/.test(self.location.protocol);
            } catch (e) {
            }
            return false;
        },

        _connect: function() {
            var self = this;
            try {
                this._port = chrome.runtime.connect({ name: 'vapi-client' });
                this._port.onMessage.addListener(function(response) {
                    self._handleMessage(response);
                });
                this._port.onDisconnect.addListener(function() {
                    self._port = null;
                    self._ready = false;
                    setTimeout(function() { self._connect(); }, 1000);
                });
                this._ready = true;
                this._flushQueue();
            } catch (e) {
                setTimeout(function() { self._connect(); }, 1000);
            }
        },

        _handleMessage: function(response) {
            if (response && response.seq !== undefined && this._callbacks[response.seq]) {
                var callback = this._callbacks[response.seq];
                delete this._callbacks[response.seq];
                if (callback) {
                    callback(this._unwrapResponse(response));
                }
            }
        },

        _flushQueue: function() {
            while (this._queue.length > 0) {
                var msg = this._queue.shift();
                this._send(msg.topic, msg.payload, msg.callback);
            }
        },

        _send: function(topic, payload, callback) {
            var self = this;
            var msg = { topic: topic, payload: payload };
            
            console.log('[VAPI] _send called with topic:', topic, 'payload:', payload);
            
            if (callback) {
                msg.seq = this._seq++;
                this._callbacks[msg.seq] = callback;
            }

            if ( this._useRuntimeMessage() === false && this._port && this._port.postMessage ) {
                try {
                    console.log('[VAPI] Sending via port');
                    this._port.postMessage(msg);
                } catch (e) {
                    console.error('[VAPI] Port send error:', e);
                    if (callback) {
                        callback({ error: e.message });
                    }
                }
            } else {
                console.log('[VAPI] No port, using sendMessage');
                chrome.runtime.sendMessage(msg, function(response) {
                    // Ignore runtime.lastError - this happens when page reloads
                    if (chrome.runtime.lastError) {
                        // Silently ignore
                        return;
                    }
                    console.log('[VAPI] sendMessage response:', response);
                    if (callback) {
                        callback(self._unwrapResponse(response));
                    }
                });
            }
        },

        send: function(topic, payload, callback) {
            var self = this;
            return new Promise(function(resolve) {
                var wrappedCallback = function(response) {
                    if ( typeof callback === 'function' ) {
                        try {
                            callback(response);
                        } catch {
                        }
                    }
                    resolve(response);
                };

                if (!self._ready) {
                    self._queue.push({ topic: topic, payload: payload, callback: wrappedCallback });
                    if (!self._port) {
                        self._connect();
                    }
                    return;
                }
                self._send(topic, payload, wrappedCallback);
            });
        }
    };

    vAPI.messaging._connect();

    // Add localStorage for MV3 Chrome - use chrome.storage.local
    vAPI.localStorage = {
        getItemAsync: function(key) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    var result = chrome.storage.local.get(key);
                    if ( result && typeof result.then === 'function' ) {
                        return result.then(function(data) {
                            var stored = data[key];
                            return stored === undefined || stored === null ? "" : stored;
                        });
                    }
                } catch (e) {
                }
                return new Promise(function(resolve) {
                    chrome.storage.local.get(key, function(data) {
                        var stored = data && data[key];
                        resolve(stored === undefined || stored === null ? "" : stored);
                    });
                });
            }
            return Promise.resolve("");
        },
        setItemAsync: function(key, value) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    var result = chrome.storage.local.set({[key]: value});
                    if ( result && typeof result.then === 'function' ) {
                        return result;
                    }
                } catch (e) {
                }
                return new Promise(function(resolve) {
                    chrome.storage.local.set({[key]: value}, function() {
                        resolve();
                    });
                });
            }
            return Promise.resolve();
        },
        removeItemAsync: function(key) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    var result = chrome.storage.local.remove(key);
                    if ( result && typeof result.then === 'function' ) {
                        return result;
                    }
                } catch (e) {
                }
                return new Promise(function(resolve) {
                    chrome.storage.local.remove(key, function() {
                        resolve();
                    });
                });
            }
            return Promise.resolve();
        },
        getItem: function(key, callback) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(key, function(data) {
                    callback(data[key] || "");
                });
            } else {
                callback("");
            }
        },
        setItem: function(key, value) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({[key]: value});
            }
        },
        removeItem: function(key) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(key);
            }
        },
    };

    // Listen for messages from service worker (like pickerActivate)
    vAPI.messaging._onMessageHandlers = {};
    
    vAPI.messaging.onMessage = function(handler) {
        this._onMessageHandlers = this._onMessageHandlers || {};
        // Store handler, can be called from _handleMessage
    };
    
    // Override _handleMessage to also handle broadcast messages
    var originalHandleMessage = vAPI.messaging._handleMessage;
    vAPI.messaging._handleMessage = function(response) {
        // Handle response to our sent messages
        if (response && response.seq !== undefined && this._callbacks[response.seq]) {
            var callback = this._callbacks[response.seq];
            delete this._callbacks[response.seq];
            if (callback) {
                callback(response);
            }
        }
        // Handle broadcast messages (no seq, has topic)
        if (response && response.topic && !response.seq) {
            if (response.topic === 'pickerActivate' && typeof vAPI !== 'undefined' && vAPI.pickerCallback) {
                vAPI.pickerCallback(response.payload);
            }
            if (response.topic === 'pickerDeactivate' && typeof vAPI !== 'undefined' && vAPI.pickerDeactivateCallback) {
                vAPI.pickerDeactivateCallback();
            }
        }
    };

    // Also set up chrome.runtime.onMessage listener for direct messages
    try {
        chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
            if (message && message.topic) {
                if (message.topic === 'pickerActivate' && vAPI.pickerCallback) {
                    vAPI.pickerCallback(message.payload);
                    sendResponse({ success: true });
                }
                if (message.topic === 'pickerDeactivate' && vAPI.pickerDeactivateCallback) {
                    vAPI.pickerDeactivateCallback();
                    sendResponse({ success: true });
                }
                if (message.topic === 'pickerMessage' && vAPI.pickerMessageCallback) {
                    vAPI.pickerMessageCallback(message.payload);
                    sendResponse({ success: true });
                }
            }
        });
    } catch (e) {
        // Might not be available in all contexts
    }

    vAPI.mustInject = function() {
        return true;
    };

    vAPI.net = {
        floating: false
    };

    vAPI.userSettings = {
        alwaysDetach: true,
        collapseBlocked: true,
        colorBlindFriendly: false,
        contextMenuEnabled: true,
        defaultPaneSize: 400,
        externalProtocolUrl: 'auto',
        hnRunning: true,
        iconBadgeDisabled: false,
        legacyStatsEnabled: false,
        loggerEnabled: false,
        microphoneDefaultPolicy: '0',
        microphoneDenyPolicy: '0',
        noCosmeticFiltering: false,
        popupFontSize: 'unset',
        prefsVersion: 1,
        remoteCSSFontSize: 'unset',
        showIconBadge: true,
        userCSSFontSize: 'unset',
        webcamDefaultPolicy: '0',
        webcamDenyPolicy: '0'
    };

    vAPI.cloud = {
        enabled: false
    };

    vAPI.hiddenElements = {
        logger: null,
        picker: null
    };

    vAPI.epicker = {
        logger: null
    };

    if (typeof window !== 'undefined') {
        window.vAPI = vAPI;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = vAPI;
    }

})();
