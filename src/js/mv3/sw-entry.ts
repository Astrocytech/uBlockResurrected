/*******************************************************************************

    uBlock Origin - MV3 Service Worker Entry Point
    https://github.com/gorhill/uBlock

    This is the main entry point for the MV3 service worker. It coordinates
    all background tasks including messaging, element picker/zapper, and
    DNR rule management.

*******************************************************************************/

const Messaging = (() => {
    const portMap = new Map<string, chrome.runtime.Port>();
    const handlers = new Map<string, (payload: any, sendResponse?: (response: any) => void) => any>();
    const tabListeners = new Map<number, Set<(topic: string, payload: any) => void>>();

    function onPortConnected(port: chrome.runtime.Port) {
        portMap.set(port.name || 'unknown', port);
        
        port.onMessage.addListener((message) => {
            handlePortMessage(port, message);
        });

        port.onDisconnect.addListener(() => {
            portMap.delete(port.name || 'unknown');
        });
    }

    function handlePortMessage(port: chrome.runtime.Port, message: any) {
        if (!message || !message.topic) return;

        const { topic, payload, seq } = message;
        const handler = handlers.get(topic);

        if (handler) {
            try {
                const result = handler(payload, (response: any) => {
                    if (seq !== undefined) {
                        port.postMessage({ seq, payload: response });
                    }
                });

                if (result instanceof Promise) {
                    result.then((response) => {
                        if (seq !== undefined && response !== undefined) {
                            port.postMessage({ seq, payload: response });
                        }
                    }).catch((error) => {
                        if (seq !== undefined) {
                            port.postMessage({ seq, payload: { error: error.message } });
                        }
                    });
                }
            } catch (e) {
                console.error('Handler error:', e);
                if (seq !== undefined) {
                    port.postMessage({ seq, payload: { error: (e as Error).message } });
                }
            }
        } else {
            broadcastToTabs(topic, payload);
        }
    }

    function handleRuntimeMessage(
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        if (!message || !message.topic) return false;

        const { topic, payload, seq } = message;

        if (message.ch === 'content-script') {
            return handleContentScriptMessage(message, sender, sendResponse);
        }

        const handler = handlers.get(topic);
        if (handler) {
            try {
                const result = handler(payload, (response: any) => {
                    if (seq !== undefined) {
                        sendResponse({ seq, payload: response });
                    } else {
                        sendResponse(response);
                    }
                });

                if (result instanceof Promise) {
                    result.then((response) => {
                        sendResponse(response);
                    }).catch((error) => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                }

                return result !== undefined;
            } catch (e) {
                console.error('Handler error:', e);
                sendResponse({ error: (e as Error).message });
            }
        }

        return false;
    }

    function handleContentScriptMessage(
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        const fn = message.fn;
        const args = message.args || [];
        const tabId = sender.tab?.id ?? null;

        const handler = handlers.get(fn);
        if (handler) {
            try {
                const payload = args[0] || {};
                (payload as any)._tabId = tabId;
                (payload as any)._sender = sender;

                const result = handler(payload, (response: any) => {
                    sendResponse(response);
                });

                if (result instanceof Promise) {
                    result.then((response) => {
                        sendResponse(response);
                    }).catch((error) => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                }

                return result !== undefined;
            } catch (e) {
                console.error('Content script handler error:', e);
                sendResponse({ error: (e as Error).message });
            }
        }

        return false;
    }

    function broadcastToTabs(topic: string, payload: any) {
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id) {
                    try {
                        chrome.tabs.sendMessage(tab.id, { topic, payload });
                    } catch (e) {
                    }
                }
            }
        });
    }

    function on(topic: string, handler: (payload: any, sendResponse?: (response: any) => void) => any) {
        handlers.set(topic, handler);
    }

    function off(topic: string) {
        handlers.delete(topic);
    }

    function sendToTab(tabId: number, topic: string, payload?: any, callback?: (response: any) => void) {
        chrome.tabs.sendMessage(tabId, { topic, payload }, callback);
    }

    function sendToAllTabs(topic: string, payload?: any) {
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { topic, payload });
                }
            }
        });
    }

    function getPort(name: string): chrome.runtime.Port | undefined {
        return portMap.get(name);
    }

    function addTabListener(tabId: number, listener: (topic: string, payload: any) => void) {
        if (!tabListeners.has(tabId)) {
            tabListeners.set(tabId, new Set());
        }
        tabListeners.get(tabId)!.add(listener);
    }

    function removeTabListener(tabId: number, listener: (topic: string, payload: any) => void) {
        tabListeners.get(tabId)?.delete(listener);
    }

    chrome.runtime.onConnect.addListener(onPortConnected);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    return {
        on,
        off,
        sendToTab,
        sendToAllTabs,
        getPort,
        addTabListener,
        removeTabListener,
    };
})();

const Zapper = (() => {
    let active = false;
    let tabId: number | null = null;
    let sessionId: string | null = null;

    function activate(targetTabId: number | null, callback?: (response: any) => void) {
        if (targetTabId === null) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    activate(tabs[0].id, callback);
                } else if (callback) {
                    callback({ error: 'No active tab' });
                }
            });
            return;
        }

        active = true;
        tabId = targetTabId;
        sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);

        chrome.tabs.sendMessage(tabId, {
            topic: 'zapperActivate',
            payload: { sessionId }
        }, (response) => {
            if (callback) {
                callback(response || { success: true });
            }
        });
    }

    function deactivate(callback?: (response: any) => void) {
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { topic: 'zapperDeactivate' }, () => {
                active = false;
                tabId = null;
                sessionId = null;
                if (callback) callback({ success: true });
            });
        } else {
            active = false;
            sessionId = null;
            if (callback) callback({ success: true });
        }
    }

    function isActive() { return active; }
    function getSessionId() { return sessionId; }
    function getTabId() { return tabId; }

    function highlight(details: any, callback?: (response: any) => void) {
        if (!tabId) {
            if (callback) callback({ error: 'No active zapper session' });
            return;
        }
        chrome.tabs.sendMessage(tabId, { topic: 'zapperHighlight', payload: details }, callback);
    }

    function click(details: any, callback?: (response: any) => void) {
        if (!tabId) {
            if (callback) callback({ error: 'No active zapper session' });
            return;
        }
        chrome.tabs.sendMessage(tabId, { topic: 'zapperClick', payload: details }, callback);
    }

    Messaging.on('zapperLaunch', (payload, callback) => {
        activate(payload?.tabId ?? null, callback);
    });

    Messaging.on('zapperQuery', (_, callback) => {
        if (callback) {
            callback({ active: isActive(), sessionId: getSessionId() });
        }
    });

    Messaging.on('zapperHighlight', (payload, callback) => {
        highlight(payload, callback);
    });

    Messaging.on('zapperClick', (payload, callback) => {
        click(payload, callback);
    });

    return {
        activate,
        deactivate,
        isActive,
        getSessionId,
        getTabId,
        highlight,
        click,
    };
})();

const Picker = (() => {
    let active = false;
    let tabId: number | null = null;
    let sessionId: string | null = null;

    function activate(targetTabId: number | null, callback?: (response: any) => void) {
        if (targetTabId === null) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    activate(tabs[0].id, callback);
                } else if (callback) {
                    callback({ error: 'No active tab' });
                }
            });
            return;
        }

        active = true;
        tabId = targetTabId;
        sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);

        chrome.tabs.sendMessage(tabId, {
            topic: 'pickerActivate',
            payload: { sessionId }
        }, (response) => {
            if (callback) {
                callback(response || { success: true });
            }
        });
    }

    function deactivate(callback?: (response: any) => void) {
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { topic: 'pickerDeactivate' }, () => {
                active = false;
                tabId = null;
                sessionId = null;
                if (callback) callback({ success: true });
            });
        } else {
            active = false;
            sessionId = null;
            if (callback) callback({ success: true });
        }
    }

    function isActive() { return active; }
    function getSessionId() { return sessionId; }
    function getTabId() { return tabId; }

    function createFilter(details: any, callback?: (response: any) => void) {
        if (!tabId) {
            if (callback) callback({ error: 'No active picker session' });
            return;
        }
        chrome.tabs.sendMessage(tabId, { topic: 'pickerCreateFilter', payload: details }, callback);
    }

    Messaging.on('pickerLaunch', (payload, callback) => {
        activate(payload?.tabId ?? null, callback);
    });

    Messaging.on('pickerQuery', (_, callback) => {
        if (callback) {
            callback({ active: isActive(), sessionId: getSessionId() });
        }
    });

    Messaging.on('pickerCreateFilter', (payload, callback) => {
        createFilter(payload, callback);
    });

    Messaging.on('pickerMessage', (payload, callback) => {
        const targetTab = Zapper.isActive() ? Zapper.getTabId() : Picker.getTabId();
        if (targetTab) {
            chrome.tabs.sendMessage(targetTab, {
                topic: Zapper.isActive() ? 'zapperMessage' : 'pickerMessage',
                payload
            }, callback);
        } else if (callback) {
            callback({ error: 'No active picker session' });
        }
    });

    return {
        activate,
        deactivate,
        isActive,
        getSessionId,
        getTabId,
        createFilter,
    };
})();

Messaging.on('ping', (_, callback) => {
    if (callback) callback({ pong: true, timestamp: Date.now() });
});

Messaging.on('getTabId', (_, callback) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (callback) {
            callback({ tabId: tabs[0]?.id ?? null });
        }
    });
});

Messaging.on('userSettings', (_, callback) => {
    chrome.storage.local.get('userSettings', (items) => {
        if (callback) {
            callback(items.userSettings || {});
        }
    });
});

Messaging.on('setUserSettings', (payload, callback) => {
    chrome.storage.local.get('userSettings', (items) => {
        const settings = { ...(items.userSettings || {}), ...payload };
        chrome.storage.local.set({ userSettings: settings }, () => {
            if (callback) callback({ success: true });
        });
    });
});

chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;

        switch (command) {
            case 'launch-element-zapper':
                Zapper.activate(tabId);
                break;
            case 'launch-element-picker':
                Picker.activate(tabId);
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

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('uBlock Origin installed');
    } else if (details.reason === 'update') {
        console.log('uBlock Origin updated');
    }
});

console.log('uBlock Origin MV3 Service Worker started');

(self as any).Messaging = Messaging;
(self as any).Zapper = Zapper;
(self as any).Picker = Picker;
