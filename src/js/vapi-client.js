/*******************************************************************************

    uBlock Origin - vAPI Client
    https://github.com/gorhill/uBlock

    Client-side messaging wrapper for content scripts and UI pages.
    Provides a clean API for communicating with the background service worker.

*******************************************************************************/

(function() {
    'use strict';

    if (typeof vAPI === 'undefined') {
        console.error('vapi-client.js: vAPI not loaded');
        return;
    }

    vAPI.MessageEmitter = (function() {
        function MessageEmitter() {
            this._port = null;
            this._listeners = {};
            this._seq = 0;
            this._pending = {};
            this._connected = false;
        }

        MessageEmitter.prototype._connect = function(name) {
            var self = this;
            try {
                this._port = chrome.runtime.connect({ name: name || 'vapi-client' });
                this._port.onMessage.addListener(function(response) {
                    self._handleMessage(response);
                });
                this._port.onDisconnect.addListener(function() {
                    self._port = null;
                    self._connected = false;
                    setTimeout(function() {
                        self._connect(name);
                    }, 1000);
                });
                this._connected = true;
            } catch (e) {
                setTimeout(function() {
                    self._connect(name);
                }, 1000);
            }
        };

        MessageEmitter.prototype._handleMessage = function(response) {
            if (response && response.topic && this._listeners[response.topic]) {
                var listeners = this._listeners[response.topic];
                for (var i = 0; i < listeners.length; i++) {
                    try {
                        listeners[i](response.payload || response);
                    } catch (e) {
                        console.error('vAPI.MessageEmitter: Listener error', e);
                    }
                }
            }
            if (response && response.seq !== undefined && this._pending[response.seq]) {
                var callback = this._pending[response.seq];
                delete this._pending[response.seq];
                if (callback) {
                    try {
                        callback(response);
                    } catch (e) {
                        console.error('vAPI.MessageEmitter: Callback error', e);
                    }
                }
            }
        };

        MessageEmitter.prototype.sendMessage = function(topic, payload, callback) {
            var self = this;
            var msg = { topic: topic, payload: payload };
            
            if (typeof payload === 'function') {
                callback = payload;
                payload = undefined;
            }

            if (callback) {
                msg.seq = this._seq++;
                this._pending[msg.seq] = callback;
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
        };

        MessageEmitter.prototype.on = function(topic, callback) {
            if (!this._listeners[topic]) {
                this._listeners[topic] = [];
            }
            this._listeners[topic].push(callback);
        };

        MessageEmitter.prototype.off = function(topic, callback) {
            if (!this._listeners[topic]) return;
            var idx = this._listeners[topic].indexOf(callback);
            if (idx !== -1) {
                this._listeners[topic].splice(idx, 1);
            }
        };

        MessageEmitter.prototype.connect = function(name) {
            this._connect(name);
        };

        return MessageEmitter;
    })();

    vAPI.client = new vAPI.MessageEmitter();

    vAPI.sendMessage = function(topic, payload, callback) {
        vAPI.client.sendMessage(topic, payload, callback);
    };

    vAPI.onMessage = function(topic, callback) {
        vAPI.client.on(topic, callback);
    };

    vAPI.removeMessageListener = function(topic, callback) {
        vAPI.client.off(topic, callback);
    };

    vAPI.shutdown = {
        add: function(callback) {
            if (!vAPI._shutdownHandlers) {
                vAPI._shutdownHandlers = [];
            }
            vAPI._shutdownHandlers.push(callback);
        },
        exec: function() {
            if (vAPI._shutdownHandlers) {
                for (var i = 0; i < vAPI._shutdownHandlers.length; i++) {
                    try {
                        vAPI._shutdownHandlers[i]();
                    } catch (e) {
                        console.error('vAPI.shutdown handler error', e);
                    }
                }
                vAPI._shutdownHandlers = [];
            }
        }
    };

})();
