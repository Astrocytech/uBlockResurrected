/*******************************************************************************

    uBlock Origin - MV3 Service Worker Messaging Listeners
    Registers all Messaging.on() handlers

*******************************************************************************/

import type { LegacyMessagingAPI } from './sw-types.js';

export const registerMessagingListeners = (
    messaging: LegacyMessagingAPI,
    deps: {
        handlePopupPanelMessage: (request: any) => Promise<any>;
        getHostnameSwitchState: () => Promise<any>;
        parseStoredCosmeticFilterData: (raw: any) => any;
        getDashboardRules: () => Promise<any>;
        modifyDashboardRuleset: (payload: any) => Promise<any>;
        resetDashboardRules: () => Promise<any>;
        findFilterListFromNetFilter: (rawFilter: string) => Promise<any[]>;
        findFilterListFromCosmeticFilter: (rawFilter: string) => Promise<any[]>;
        popupState: any;
        userSettingsDefault: any;
        reWhitelistBadHostname: RegExp;
        reWhitelistHostnameExtractor: RegExp;
        syncWhitelistDnrRules: () => Promise<void>;
        broadcastFilteringBehaviorChanged: () => void;
    }
) => {
    const {
        handlePopupPanelMessage,
        getHostnameSwitchState,
        parseStoredCosmeticFilterData,
        getDashboardRules,
        modifyDashboardRuleset,
        resetDashboardRules,
        findFilterListFromNetFilter,
        findFilterListFromCosmeticFilter,
        popupState,
        userSettingsDefault,
        reWhitelistBadHostname,
        reWhitelistHostnameExtractor,
        syncWhitelistDnrRules,
        broadcastFilteringBehaviorChanged,
    } = deps;

    // Ping handler
    messaging.on('ping', (_, callback) => {
        if (callback) callback({ pong: true, timestamp: Date.now() });
    });

    // Popup panel handler
    messaging.on('popupPanel', async (payload, callback) => {
        try {
            const result = await handlePopupPanelMessage(payload);
            if (callback) callback(result);
        } catch (e) {
            if (callback) callback({ error: (e as Error).message });
        }
    });

    // Get tab ID
    messaging.on('getTabId', (_, callback) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (callback) callback({ tabId: tabs[0]?.id ?? null });
        });
    });

    // Get user settings
    messaging.on('userSettings', (_, callback) => {
        chrome.storage.local.get('userSettings', (items) => {
            if (callback) callback(items.userSettings || {});
        });
    });

    // Set user settings
    messaging.on('setUserSettings', (payload, callback) => {
        chrome.storage.local.get('userSettings', (items) => {
            const settings = { ...(items.userSettings || {}), ...payload };
            chrome.storage.local.set({ userSettings: settings }, () => {
                if (callback) callback({ success: true });
            });
        });
    });

    // Dashboard rules
    messaging.on('dashboardGetRules', async (_, callback) => {
        const details = await getDashboardRules();
        if (callback) callback(details);
        return details;
    });

    messaging.on('dashboardModifyRuleset', async (payload, callback) => {
        const details = await modifyDashboardRuleset(payload || {});
        if (callback) callback(details);
        return details;
    });

    messaging.on('dashboardResetRules', async (_, callback) => {
        const details = await resetDashboardRules();
        if (callback) callback(details);
        return details;
    });

    // Whitelist handlers
    messaging.on('getWhitelist', async (_, callback) => {
        const response = {
            whitelist: popupState.whitelist || [],
            whitelistDefault: userSettingsDefault.netWhitelistDefault || [],
            reBadHostname: reWhitelistBadHostname.source,
            reHostnameExtractor: reWhitelistHostnameExtractor.source,
        };
        if (callback) callback(response);
        return response;
    });

    messaging.on('setWhitelist', async (payload, callback) => {
        const whitelist = typeof payload?.whitelist === 'string' 
            ? payload.whitelist.split('\n').filter(Boolean) 
            : [];
        popupState.whitelist = whitelist;
        const storage = chrome.storage.local;
        await storage.set({ whitelist: whitelist.join('\n') });
        await syncWhitelistDnrRules();
        broadcastFilteringBehaviorChanged();
        if (callback) callback({ success: true });
        return { success: true };
    });

    // Document blocked handler
    messaging.on('documentBlocked', async (request, callback) => {
        const response: Record<string, any[]> = {};
        if (request.what === 'listsFromNetFilter') {
            const rawFilter = request.rawFilter as string;
            if (rawFilter) {
                const results = await findFilterListFromNetFilter(rawFilter);
                if (results.length > 0) {
                    response[rawFilter] = results;
                }
            }
        }
        if (request.what === 'listsFromCosmeticFilter') {
            const rawFilter = request.rawFilter as string;
            if (rawFilter) {
                const results = await findFilterListFromCosmeticFilter(rawFilter);
                if (results.length > 0) {
                    response[rawFilter] = results;
                }
            }
        }
        if (callback) callback(response);
        return response;
    });

    // Default handler
    messaging.on('default', async (request, callback) => {
        if (callback) callback({ error: 'Unsupported messaging channel' });
        return { error: 'Unsupported messaging channel' };
    });
};
