/*******************************************************************************

    uBlock Origin - MV3 Message Router
    https://github.com/gorhill/uBlock

    This file contains the core messaging router - port management, message routing,
    and handler registration. Extracted from sw-entry.ts.

******************************************************************************/

import type { LegacyMessagingAPI, LegacyMessage, LegacyPortDetails } from './sw-types.js';

type MessageHandler = (payload: any, callback?: (response: any) => void) => any;
type TabListener = (topic: string, payload: any) => void;

export interface MessagingRouterDeps {
    getLegacyMessaging: () => LegacyMessagingAPI | undefined;
    handlePopupPanelMessage: (request: any) => Promise<any>;
    handleDashboardMessage: (request: any) => Promise<any>;
    handleLoggerUIMessage: (request: any) => Promise<any>;
}

export interface MessagingRouterAPI {
    on: (topic: string, handler: MessageHandler) => void;
    off: (topic: string, handler: MessageHandler) => void;
    sendToTab: (tabId: number, topic: string, payload?: any) => Promise<void>;
    sendToAllTabs: (topic: string, payload?: any) => Promise<void>;
    getPort: (name: string) => chrome.runtime.Port | undefined;
    addTabListener: (tabId: number, listener: TabListener) => void;
    removeTabListener: (tabId: number, listener: TabListener) => void;
    broadcastToTabs: (topic: string, payload?: any) => void;
}

export const createMessagingRouter = (deps: MessagingRouterDeps): MessagingRouterAPI => {
    const {
        getLegacyMessaging,
        handlePopupPanelMessage,
        handleDashboardMessage,
        handleLoggerUIMessage,
    } = deps;

    const portMap = new Map<string, chrome.runtime.Port>();
    const handlers = new Map<string, MessageHandler>();
    const tabListeners = new Map<number, Set<TabListener>>();

    function onPortConnected(port: chrome.runtime.Port) {
        portMap.set(port.name || 'unknown', port);

        port.onMessage.addListener((message) => {
            void handlePortMessage(port, message);
        });

        port.onDisconnect.addListener(() => {
            portMap.delete(port.name || 'unknown');
            const legacyMessaging = getLegacyMessaging();
            legacyMessaging?.onPortDisconnect?.(port);
        });
    }

    async function handlePortMessage(port: chrome.runtime.Port, message: any) {
        if (message && typeof message.channel === 'string') {
            await handleLegacyPortMessage(port, message as LegacyMessage);
            return;
        }
        if (!message || !message.topic) return;

        const { topic, payload, seq } = message;

        if (topic === 'popupPanel' || topic === 'dashboard' || topic === 'loggerUI') {
            try {
                const response = topic === 'popupPanel'
                    ? await handlePopupPanelMessage(payload || {})
                    : topic === 'dashboard'
                        ? await handleDashboardMessage(payload || {})
                        : await handleLoggerUIMessage(payload || {});
                if (seq !== undefined) {
                    port.postMessage({ seq, payload: response });
                }
            } catch (error) {
                if (seq !== undefined) {
                    port.postMessage({
                        seq,
                        payload: { error: (error as Error).message },
                    });
                }
            }
            return;
        }

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

    async function handleLegacyPortMessage(port: chrome.runtime.Port, message: LegacyMessage) {
        const { channel, msgId, msg } = message;
        const respond = (response: any) => {
            if (msgId === undefined) { return; }
            port.postMessage({ msgId, msg: response });
        };

        if (channel === 'dashboard' || channel === 'popupPanel' || channel === 'loggerUI') {
            try {
                const response = channel === 'popupPanel'
                    ? await handlePopupPanelMessage(msg || {})
                    : channel === 'dashboard'
                        ? await handleDashboardMessage(msg || {})
                        : await handleLoggerUIMessage(msg || {});
                respond(response);
            } catch (error) {
                respond({ error: (error as Error).message });
            }
            return;
        }

        console.log(`MV3: ${channel} channel - delegating to legacy handler`);
        respond(null);
    }

    function on(topic: string, handler: MessageHandler) {
        handlers.set(topic, handler);
    }

    function off(topic: string, handler: MessageHandler) {
        const existing = handlers.get(topic);
        if (existing === handler) {
            handlers.delete(topic);
        }
    }

    async function sendToTab(tabId: number, topic: string, payload?: any): Promise<void> {
        try {
            await chrome.tabs.sendMessage(tabId, { topic, payload });
        } catch (e) {
            console.log('[MV3] sendToTab error:', e);
        }
    }

    async function sendToAllTabs(topic: string, payload?: any): Promise<void> {
        try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.id) {
                    await sendToTab(tab.id, topic, payload);
                }
            }
        } catch (e) {
            console.log('[MV3] sendToAllTabs error:', e);
        }
    }

    function getPort(name: string): chrome.runtime.Port | undefined {
        return portMap.get(name);
    }

    function addTabListener(tabId: number, listener: TabListener) {
        if (!tabListeners.has(tabId)) {
            tabListeners.set(tabId, new Set());
        }
        tabListeners.get(tabId)!.add(listener);
    }

    function removeTabListener(tabId: number, listener: TabListener) {
        tabListeners.get(tabId)?.delete(listener);
    }

    function broadcastToTabs(topic: string, payload?: any) {
        const listeners = Array.from(tabListeners.values());
        for (const listenerSet of listeners) {
            for (const listener of listenerSet) {
                try {
                    listener(topic, payload);
                } catch (e) {
                    console.log('[MV3] broadcastToTabs error:', e);
                }
            }
        }
    }

    chrome.runtime.onConnect.addListener(onPortConnected);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    function handleRuntimeMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
        if (!message || !message.topic) {
            return undefined;
        }

        const { topic, payload, seq } = message;
        if (topic === 'popupPanel' || topic === 'dashboard' || topic === 'loggerUI') {
            const run = topic === 'popupPanel'
                ? handlePopupPanelMessage
                : topic === 'dashboard'
                    ? handleDashboardMessage
                    : handleLoggerUIMessage;

            run(payload || {}).then((response) => {
                if (seq !== undefined) {
                    sendResponse({ seq, payload: response });
                } else {
                    sendResponse(response);
                }
            }).catch((error) => {
                if (seq !== undefined) {
                    sendResponse({ seq, payload: { error: error.message } });
                } else {
                    sendResponse({ error: error.message });
                }
            });
            return true;
        }

        const handler = handlers.get(topic);

        if (handler) {
            try {
                const result = handler(payload, (response: any) => {
                    if (seq !== undefined) {
                        sendResponse({ seq, payload: response });
                    }
                });

                if (result instanceof Promise) {
                    result.then((response) => {
                        if (seq !== undefined && response !== undefined) {
                            sendResponse({ seq, payload: response });
                        }
                    }).catch((error) => {
                        if (seq !== undefined) {
                            sendResponse({ seq, payload: { error: error.message } });
                        }
                    });
                    return true;
                }
            } catch (e) {
                console.error('Runtime handler error:', e);
                if (seq !== undefined) {
                    sendResponse({ seq, payload: { error: (e as Error).message } });
                }
            }
        } else {
            broadcastToTabs(topic, payload);
        }

        return undefined;
    }

    return {
        on,
        off,
        sendToTab,
        sendToAllTabs,
        getPort,
        addTabListener,
        removeTabListener,
        broadcastToTabs,
    };
};
