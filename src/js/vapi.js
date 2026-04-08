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

    vAPI.messaging = {
        _port: null,
        _callbacks: {},
        _seq: 0,
        _ready: false,
        _queue: [],

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
                    callback(response);
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
            
            if (callback) {
                msg.seq = this._seq++;
                this._callbacks[msg.seq] = callback;
            }

            if (this._port && this._port.postMessage) {
                try {
                    this._port.postMessage(msg);
                } catch (e) {
                    if (callback) {
                        callback({ error: e.message });
                    }
                }
            } else {
                chrome.runtime.sendMessage(msg, function(response) {
                    if (callback) {
                        callback(response);
                    }
                });
            }
        },

        send: function(topic, payload, callback) {
            if (!this._ready) {
                this._queue.push({ topic: topic, payload: payload, callback: callback });
                if (!this._port) {
                    this._connect();
                }
                return;
            }
            this._send(topic, payload, callback);
        }
    };

    vAPI.messaging._connect();

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
