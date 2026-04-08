/*******************************************************************************

    uBlock Origin - Service Worker (MV3)
    https://github.com/gorhill/uBlock

    This is the main background service worker for uBlock Origin in MV3.
    It handles all background tasks including:
    - Messaging between content scripts, popup, and dashboard
    - Element zapper/picker functionality
    - Rule management (DNR integration)
    - Storage operations

*******************************************************************************/

(function() {
    'use strict';

    var messaging = {
        _portMap: new Map(),
        _handlers: new Map(),

        _onPortConnected: function(port) {
            var self = this;
            var name = port.name || 'unknown';
            
            this._portMap.set(name, port);

            port.onMessage.addListener(function(message) {
                self._handleMessage(port, message);
            });

            port.onDisconnect.addListener(function() {
                self._portMap.delete(name);
            });
        },

        _handleMessage: function(port, message) {
            var self = this;
            
            if (!message || !message.topic) {
                return;
            }

            var topic = message.topic;
            var payload = message.payload;
            var seq = message.seq;

            var handler = this._handlers.get(topic);
            
            if (handler) {
                try {
                    var result = handler(payload, function(response) {
                        if (seq !== undefined) {
                            port.postMessage({
                                seq: seq,
                                payload: response
                            });
                        }
                    });
                    
                    if (result instanceof Promise) {
                        result.then(function(response) {
                            if (seq !== undefined) {
                                port.postMessage({
                                    seq: seq,
                                    payload: response
                                });
                            }
                        }).catch(function(error) {
                            if (seq !== undefined) {
                                port.postMessage({
                                    seq: seq,
                                    payload: { error: error.message }
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.error('Messaging handler error:', e);
                    if (seq !== undefined) {
                        port.postMessage({
                            seq: seq,
                            payload: { error: e.message }
                        });
                    }
                }
            } else {
                this._broadcastToTabs(topic, payload);
            }
        },

        _broadcastToTabs: function(topic, payload) {
            var self = this;
            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(function(tab) {
                    try {
                        chrome.tabs.sendMessage(tab.id, {
                            topic: topic,
                            payload: payload
                        }, function() {
                        });
                    } catch (e) {
                    }
                });
            });
        },

        _handleRuntimeMessage: function(message, sender, sendResponse) {
            var self = this;
            
            if (!message || !message.topic) {
                return false;
            }

            var topic = message.topic;
            var payload = message.payload;
            var seq = message.seq;

            if (message.ch === 'content-script') {
                return this._handleContentScriptMessage(message, sender, sendResponse);
            }

            var handler = this._handlers.get(topic);
            
            if (handler) {
                try {
                    var result = handler(payload, sendResponse);
                    
                    if (result instanceof Promise) {
                        result.then(function(response) {
                            sendResponse(response);
                        }).catch(function(error) {
                            sendResponse({ error: error.message });
                        });
                        return true;
                    }
                    
                    return result;
                } catch (e) {
                    console.error('Messaging handler error:', e);
                    sendResponse({ error: e.message });
                }
            }

            return false;
        },

        _handleContentScriptMessage: function(message, sender, sendResponse) {
            var self = this;
            var fn = message.fn;
            var args = message.args || [];
            var tabId = sender.tab ? sender.tab.id : null;

            var handler = this._handlers.get(fn);
            
            if (handler) {
                try {
                    var payload = args[0] || {};
                    payload._tabId = tabId;
                    payload._sender = sender;

                    var result = handler(payload, function(response) {
                        sendResponse(response);
                    });
                    
                    if (result instanceof Promise) {
                        result.then(function(response) {
                            sendResponse(response);
                        }).catch(function(error) {
                            sendResponse({ error: error.message });
                        });
                        return true;
                    }
                    
                    return result !== undefined;
                } catch (e) {
                    console.error('Content script handler error:', e);
                    sendResponse({ error: e.message });
                }
            }

            return false;
        },

        on: function(topic, handler) {
            this._handlers.set(topic, handler);
        },

        off: function(topic) {
            this._handlers.delete(topic);
        },

        sendToTab: function(tabId, topic, payload, callback) {
            chrome.tabs.sendMessage(tabId, {
                topic: topic,
                payload: payload
            }, callback);
        },

        sendToAllTabs: function(topic, payload) {
            var self = this;
            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(function(tab) {
                    chrome.tabs.sendMessage(tab.id, {
                        topic: topic,
                        payload: payload
                    }, function() {
                    });
                });
            });
        },

        getPort: function(name) {
            return this._portMap.get(name);
        }
    };

    var zapper = {
        _active: false,
        _tabId: null,
        _sessionId: null,

        activate: function(tabId, callback) {
            var self = this;
            this._active = true;
            this._tabId = tabId;
            this._sessionId = Date.now().toString(36);

            chrome.tabs.sendMessage(tabId, {
                topic: 'zapperActivate',
                payload: {
                    sessionId: this._sessionId
                }
            }, function(response) {
                if (callback) {
                    callback(response || { success: true });
                }
            });
        },

        deactivate: function(callback) {
            var self = this;
            
            if (this._tabId) {
                chrome.tabs.sendMessage(this._tabId, {
                    topic: 'zapperDeactivate'
                }, function() {
                    self._active = false;
                    self._tabId = null;
                    self._sessionId = null;
                    if (callback) {
                        callback({ success: true });
                    }
                });
            } else {
                this._active = false;
                this._sessionId = null;
                if (callback) {
                    callback({ success: true });
                }
            }
        },

        isActive: function() {
            return this._active;
        },

        getSessionId: function() {
            return this._sessionId;
        },

        highlightElement: function(details, callback) {
            if (!this._tabId) {
                if (callback) callback({ error: 'No active zapper session' });
                return;
            }

            chrome.tabs.sendMessage(this._tabId, {
                topic: 'zapperHighlight',
                payload: details
            }, callback);
        },

        clickElement: function(details, callback) {
            if (!this._tabId) {
                if (callback) callback({ error: 'No active zapper session' });
                return;
            }

            chrome.tabs.sendMessage(this._tabId, {
                topic: 'zapperClick',
                payload: details
            }, callback);
        }
    };

    var picker = {
        _active: false,
        _tabId: null,
        _sessionId: null,

        activate: function(tabId, callback) {
            var self = this;
            this._active = true;
            this._tabId = tabId;
            this._sessionId = Date.now().toString(36);

            chrome.tabs.sendMessage(tabId, {
                topic: 'pickerActivate',
                payload: {
                    sessionId: this._sessionId
                }
            }, function(response) {
                if (callback) {
                    callback(response || { success: true });
                }
            });
        },

        deactivate: function(callback) {
            var self = this;
            
            if (this._tabId) {
                chrome.tabs.sendMessage(this._tabId, {
                    topic: 'pickerDeactivate'
                }, function() {
                    self._active = false;
                    self._tabId = null;
                    self._sessionId = null;
                    if (callback) {
                        callback({ success: true });
                    }
                });
            } else {
                this._active = false;
                this._sessionId = null;
                if (callback) {
                    callback({ success: true });
                }
            }
        },

        isActive: function() {
            return this._active;
        },

        getSessionId: function() {
            return this._sessionId;
        },

        createFilter: function(details, callback) {
            if (!this._tabId) {
                if (callback) callback({ error: 'No active picker session' });
                return;
            }

            chrome.tabs.sendMessage(this._tabId, {
                topic: 'pickerCreateFilter',
                payload: details
            }, callback);
        }
    };

    messaging.on('ping', function(payload, callback) {
        callback({ pong: true, timestamp: Date.now() });
    });

    messaging.on('zapperLaunch', function(payload, callback) {
        var tabId = payload && payload.tabId;
        if (!tabId) {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs && tabs.length > 0) {
                    zapper.activate(tabs[0].id, callback);
                } else if (callback) {
                    callback({ error: 'No active tab' });
                }
            });
        } else {
            zapper.activate(tabId, callback);
        }
    });

    messaging.on('zapperQuery', function(payload, callback) {
        callback({
            active: zapper.isActive(),
            sessionId: zapper.getSessionId()
        });
    });

    messaging.on('zapperHighlight', function(payload, callback) {
        zapper.highlightElement(payload, callback);
    });

    messaging.on('zapperClick', function(payload, callback) {
        zapper.clickElement(payload, callback);
    });

    messaging.on('pickerLaunch', function(payload, callback) {
        var tabId = payload && payload.tabId;
        if (!tabId) {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs && tabs.length > 0) {
                    picker.activate(tabs[0].id, callback);
                } else if (callback) {
                    callback({ error: 'No active tab' });
                }
            });
        } else {
            picker.activate(tabId, callback);
        }
    });

    messaging.on('pickerQuery', function(payload, callback) {
        callback({
            active: picker.isActive(),
            sessionId: picker.getSessionId()
        });
    });

    messaging.on('pickerCreateFilter', function(payload, callback) {
        picker.createFilter(payload, callback);
    });

    messaging.on('pickerMessage', function(payload, callback) {
        if (zapper.isActive()) {
            chrome.tabs.sendMessage(zapper._tabId, {
                topic: 'zapperMessage',
                payload: payload
            }, callback);
        } else if (picker.isActive()) {
            chrome.tabs.sendMessage(picker._tabId, {
                topic: 'pickerMessage',
                payload: payload
            }, callback);
        } else if (callback) {
            callback({ error: 'No active picker session' });
        }
    });

    messaging.on('getTabId', function(payload, callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0 && callback) {
                callback({ tabId: tabs[0].id });
            } else if (callback) {
                callback({ tabId: null });
            }
        });
    });

    messaging.on('userSettings', function(payload, callback) {
        chrome.storage.local.get('userSettings', function(items) {
            if (callback) {
                callback(items.userSettings || {});
            }
        });
    });

    messaging.on('setUserSettings', function(payload, callback) {
        chrome.storage.local.get('userSettings', function(items) {
            var settings = items.userSettings || {};
            Object.assign(settings, payload);
            chrome.storage.local.set({ userSettings: settings }, function() {
                if (callback) {
                    callback({ success: true });
                }
            });
        });
    });

    chrome.runtime.onConnect.addListener(function(port) {
        messaging._onPortConnected(port);
    });

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        return messaging._handleRuntimeMessage(message, sender, sendResponse);
    });

    chrome.commands.onCommand.addListener(function(command) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs || tabs.length === 0) return;
            var tabId = tabs[0].id;

            switch (command) {
                case 'launch-element-zapper':
                    zapper.activate(tabId);
                    break;
                case 'launch-element-picker':
                    picker.activate(tabId);
                    break;
                case 'open-dashboard':
                    chrome.runtime.openOptionsPage();
                    break;
                case 'launch-logger':
                    chrome.tabs.create({ url: 'logger-ui.html' });
                    break;
            }
        });
    });

    chrome.runtime.onInstalled.addListener(function(details) {
        if (details.reason === 'install') {
            console.log('uBlock Origin installed');
        } else if (details.reason === 'update') {
            console.log('uBlock Origin updated');
        }
    });

    console.log('uBlock Origin Service Worker started');

    self.messaging = messaging;
    self.zapper = zapper;
    self.picker = picker;

})();
