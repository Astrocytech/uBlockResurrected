/*******************************************************************************

    uBlock Origin - MV3 Zapper
    https://github.com/gorhill/uBlock

    This file contains the Zapper element blocking functionality.

*******************************************************************************/

import type { LegacyMessagingAPI } from './sw-types.js';

export const createZapper = (messaging: LegacyMessagingAPI) => {
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
        activate(payload?.tabId ?? null, callback);
    });

    messaging.on('zapperQuery', (_, callback) => {
        if (callback) {
            callback({ active: isActive(), sessionId: getSessionId() });
        }
    });

    messaging.on('zapperHighlight', (payload, callback) => {
        highlight(payload, callback);
    });

    messaging.on('zapperClick', (payload, callback) => {
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
};
