/*******************************************************************************

    uBlock Origin - MV3 Element Factories
    Creates Zapper and Picker instances with their message handlers

*******************************************************************************/

import type { LegacyMessagingAPI } from './sw-types.js';

export const createElementFactories = (messaging: LegacyMessagingAPI) => {
    // Element picker arguments - shared state
    const epickerArgs = {
        target: '',
        mouse: '',
        zap: false,
        eprom: null as any,
    };

    // Zapper factory
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

        messaging.on('zapperLaunch', (payload, callback) => {
            Zapper.activate(payload?.tabId ?? null, callback);
        });

        messaging.on('zapperQuery', (_, callback) => {
            if (callback) {
                callback({ active: Zapper.isActive(), sessionId: Zapper.getSessionId() });
            }
        });

        messaging.on('zapperHighlight', (payload, callback) => {
            Zapper.highlight(payload, callback);
        });

        messaging.on('zapperClick', (payload, callback) => {
            Zapper.click(payload, callback);
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

    // Picker factory
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

        messaging.on('pickerLaunch', (payload, callback) => {
            Picker.activate(payload?.tabId ?? null, callback);
        });

        messaging.on('pickerQuery', (_, callback) => {
            if (callback) {
                callback({ active: Picker.isActive(), sessionId: Picker.getSessionId() });
            }
        });

        messaging.on('pickerCreateFilter', (payload, callback) => {
            Picker.createFilter(payload, callback);
        });

        messaging.on('pickerMessage', (payload, callback) => {
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

        messaging.on('elementPicker', (payload, callback) => {
            if (payload?.what === 'elementPickerArguments') {
                const warSecret = (globalThis as any).vAPI?.warSecret?.short?.() || 
                                 Math.random().toString(36).slice(2, 10);
                callback({
                    target: epickerArgs.target,
                    mouse: epickerArgs.mouse,
                    zap: epickerArgs.zap,
                    pickerURL: `/web_accessible_resources/epicker-ui.html?zap=${warSecret}`,
                    eprom: epickerArgs.eprom || null,
                });
                epickerArgs.target = '';
                epickerArgs.eprom = null;
            } else if (payload?.what === 'elementPickerEprom') {
                const eprom = payload.eprom;
                if (eprom) {
                    epickerArgs.eprom = eprom;
                    chrome.storage.local.set({ elementPickerEprom: eprom }).catch(() => {});
                }
                callback({ success: true });
            } else {
                callback({});
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

    return {
        Zapper,
        Picker,
        epickerArgs,
    };
};
