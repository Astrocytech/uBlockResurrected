/**
 * uBlock Origin - MV3 Service Worker
 * Port-based Messaging System
 */

import { vAPI } from './vapi-bg.js';

var messaging = {
    ports: new Map(),
    listeners: new Map(),
    defaultHandler: null,
    PRIVILEGED_ORIGIN: vAPI.getURL('').slice(0, -1),
    NOOPFUNC: function() {},
    UNHANDLED: 'vAPI.messaging.notHandled',

    /**
     * Register a message handler for a specific channel
     * @param {Object} details - { name: string, listener: function, privileged: boolean }
     */
    listen: function(details) {
        this.listeners.set(details.name, {
            fn: details.listener,
            privileged: details.privileged === true
        });
    },

    /**
     * Handle port disconnect
     * @param {Port} port - The disconnected port
     */
    onPortDisconnect: function(port) {
        this.ports.delete(port.name);
        void chrome.runtime.lastError;
    },

    /**
     * Handle new port connection
     * @param {Port} port - The connected port
     */
    onPortConnect: function(port) {
        var self = this;

        port.onDisconnect.addListener(function(p) {
            self.onPortDisconnect(p);
        });

        port.onMessage.addListener(function(request, p) {
            self.onPortMessage(request, p);
        });

        var portDetails = { port: port };
        var sender = port.sender;
        var origin = sender ? sender.origin : undefined;
        var tab = sender ? sender.tab : undefined;
        var url = sender ? sender.url : undefined;

        portDetails.frameId = sender ? sender.frameId : undefined;
        portDetails.frameURL = url;

        portDetails.privileged = origin !== undefined
            ? origin === this.PRIVILEGED_ORIGIN
            : url && url.startsWith(this.PRIVILEGED_ORIGIN);

        if (tab) {
            portDetails.tabId = tab.id;
            portDetails.tabURL = tab.url;
        }

        this.ports.set(port.name, portDetails);
        port.sender = undefined;
    },

    /**
     * Set up messaging with a default handler
     * @param {Function} defaultHandler - Default handler for privileged messages
     */
    setup: function(defaultHandler) {
        if (this.defaultHandler !== null) {
            return;
        }

        this.defaultHandler = defaultHandler;

        var self = this;
        chrome.runtime.onConnect.addListener(function(port) {
            self.onPortConnect(port);
        });
    },

    /**
     * Handle framework messages (vapi channel)
     * @param {Object} request - The message request
     * @param {Port} port - The port
     * @param {Function} callback - Response callback
     */
    onFrameworkMessage: function(request, port, callback) {
        var portDetails = this.ports.get(port.name) || {};
        var tabId = portDetails.tabId;
        var msg = request.msg;

        switch (msg.what) {
        case 'localStorage': {
            if (portDetails.privileged !== true) break;
            if (!vAPI.localStorage || !vAPI.localStorage[msg.fn]) {
                callback(null);
                break;
            }
            var args = msg.args || [];
            var fn = vAPI.localStorage[msg.fn];
            var result = fn.apply(vAPI.localStorage, args);
            if (result && typeof result.then === 'function') {
                result.then(function(data) { callback(data); }).catch(function() {
                    callback(null);
                });
            } else {
                callback(result);
            }
            break;
        }
        case 'userCSS': {
            if (tabId === undefined) break;
            var promises = [];
            if (msg.add) {
                for (var i = 0; i < msg.add.length; i++) {
                    var cssText = msg.add[i];
                    promises.push(new Promise(function(resolve) {
                        chrome.scripting.insertCSS({
                            target: { tabId: tabId },
                            css: cssText
                        }, function() {
                            resolve();
                        });
                    }));
                }
            }
            Promise.all(promises).then(function() {
                callback();
            });
            break;
        }
        default:
            break;
        }
    },

    /**
     * Create a response callback for a port message
     * @param {Port} port - The port
     * @param {number} msgId - Message ID
     * @returns {Function} Callback function
     */
    createCallback: function(port, msgId) {
        var messaging = this;
        return function(response) {
            try {
                port.postMessage({
                    msgId: msgId,
                    msg: response !== undefined ? response : null
                });
            } catch (e) {
                messaging.onPortDisconnect(port);
            }
        };
    },

    /**
     * Handle incoming port message
     * @param {Object} request - The message request
     * @param {Port} port - The port
     */
    onPortMessage: function(request, port) {
        var callback = this.NOOPFUNC;
        if (request.msgId !== undefined) {
            callback = this.createCallback(port, request.msgId);
        }

        if (request.channel === 'vapi') {
            this.onFrameworkMessage(request, port, callback);
            return;
        }

        var portDetails = this.ports.get(port.name);
        if (portDetails === undefined) {
            callback();
            return;
        }

        var listenerDetails = this.listeners.get(request.channel);
        var r = this.UNHANDLED;

        if (listenerDetails !== undefined) {
            if (listenerDetails.privileged === false || portDetails.privileged) {
                r = listenerDetails.fn(request.msg, portDetails, callback);
            }
        }

        if (r !== this.UNHANDLED) {
            return;
        }

        if (portDetails.privileged && this.defaultHandler) {
            r = this.defaultHandler(request.msg, portDetails, callback);
        }

        if (r !== this.UNHANDLED) {
            return;
        }

        callback();
    },

    /**
     * Send a one-time message (not port-based)
     * @param {string} channel - Message channel
     * @param {Object} msg - Message payload
     * @returns {Promise} Response promise
     */
    send: function(channel, msg) {
        return chrome.runtime.sendMessage({ channel: channel, msg: msg });
    },

    /**
     * Send native message (placeholder)
     * @returns {Promise} Empty response
     */
    sendNative: function() {
        return Promise.resolve({});
    }
};

export { messaging };
