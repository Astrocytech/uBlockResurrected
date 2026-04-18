/*******************************************************************************

    uBlock Origin - MV3 Messaging Handlers
    https://github.com/gorhill/uBlock

    This file contains all the Messaging.on() handler registrations.

*******************************************************************************/

import type { LegacyMessagingAPI } from './sw-types.js';

interface PopupState {
    userSettings: Record<string, any>;
    initialized?: boolean;
}

interface PopupRequest {
    what?: string;
    [key: string]: any;
}

export const registerMessagingHandlers = (
    messaging: LegacyMessagingAPI,
    deps: {
        popupState: PopupState;
        handlePopupPanelMessage: (request: PopupRequest) => Promise<any>;
        handleDashboardMessage: (request: PopupRequest) => Promise<any>;
        getHostnameSwitchState: () => Promise<Record<string, any>>;
        parseStoredCosmeticFilterData: (raw: unknown) => any;
        buildSpecificCosmeticPayload: (hostname: string, storedData: any) => any;
        getTabSwitchMetrics: (tabId: number) => Promise<any>;
        getHiddenElementCountForTab: (tabId: number) => Promise<number>;
        getFilterListState: () => Promise<any>;
        applyFilterListSelection: (payload: any) => Promise<any>;
        reloadAllFilterLists: () => Promise<any>;
        updateFilterListsNow: (payload?: any) => Promise<any>;
        getDashboardRules: () => Promise<any>;
        modifyDashboardRuleset: (payload: any) => Promise<any>;
        resetDashboardRules: () => Promise<any>;
        getLocalData: () => Promise<any>;
        backupUserData: () => Promise<any>;
        restoreUserData: (request: any) => Promise<any>;
        resetUserData: () => Promise<any>;
        getWhitelist: () => Promise<any>;
        setWhitelist: (request: any) => Promise<any>;
        pageStoreFromTabId: (tabId: number) => Promise<any>;
    }
) => {
    const { 
        popupState,
        handlePopupPanelMessage,
        handleDashboardMessage,
        getHostnameSwitchState,
        parseStoredCosmeticFilterData,
        buildSpecificCosmeticPayload,
    } = deps;

    messaging.on('ping', (_, callback) => {
        if (callback) callback({ pong: true, timestamp: Date.now() });
    });

    messaging.on('popupPanel', async (payload, callback) => {
        try {
            const result = await handlePopupPanelMessage(payload);
            if (callback) callback(result);
        } catch (e) {
            if (callback) callback({ error: (e as Error).message });
        }
    });

    messaging.on('retrieveContentScriptParameters', async (payload, callback) => {
        try {
            const tabId = payload?._tabId;
            const url = payload?.url || '';
            const frameId = payload?.frameId || 0;
            const hostname = url ? new URL(url).hostname : '';
            const origin = url ? new URL(url).origin : '';
            
            const ancestors: string[] = [];
            if (tabId !== undefined && frameId !== 0) {
                try {
                    const stored = await chrome.storage.local.get('pageStoreMap');
                    const pageStoreData = stored?.pageStoreMap?.[tabId];
                    if (pageStoreData?.frameAncestors) {
                        ancestors.push(...pageStoreData.frameAncestors);
                    }
                } catch (e) {}
            }
            
            const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
            const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
            const pageScopeKey = hostname !== '' && url !== '' ? `${hostname}:${url}` : '';
            const netFilteringEnabled = hostname === ''
                ? true
                : perSiteFiltering[pageScopeKey] ?? perSiteFiltering[hostname] ?? true;
            
            const stored = await chrome.storage.local.get('userSettings');
            const userSettings = stored.userSettings || popupState.userSettings;
            
            const hostnameSwitches = await getHostnameSwitchState();
            const noCosmeticFilteringSwitch = hostname !== '' &&
                hostnameSwitches[hostname]?.['no-cosmetic-filtering'] === true;
            const noCosmeticFiltering = netFilteringEnabled === false || noCosmeticFilteringSwitch;
            
            const storedCosmeticData = await chrome.storage.local.get('cosmeticFiltersData');
            const cosmeticData = parseStoredCosmeticFilterData(storedCosmeticData.cosmeticFiltersData);
            
            let trustedScriptletTokens: string[] = [];
            try {
                const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
                if (redirectEngine?.getTrustedScriptletTokens) {
                    trustedScriptletTokens = redirectEngine.getTrustedScriptletTokens();
                }
            } catch (e) {}
            
            const response = {
                advancedUserEnabled: userSettings.advancedUserEnabled === true,
                ancestors,
                autoReload: userSettings.autoReload,
                beautify: userSettings.beautify,
                canDevtoolsBridge: false,
                cloudStorageEnabled: typeof chrome.storage.sync !== 'undefined',
                consoleLogEnabled: userSettings.consoleLogEnabled === true,
                contextMenuEnabled: userSettings.contextMenuEnabled === true,
                debugScriptlet: userSettings.debugScriptlet === true,
                extensionPopupEnabled: userSettings.extensionPopupEnabled !== false,
                externalRendererEnabled: false,
                filterAuthorMode: false,
                genericCosmeticFiltersHidden: noCosmeticFiltering,
                getSelection: () => {
                    try {
                        return window.getSelection()?.toString() || '';
                    } catch (e) { return ''; }
                },
                hidePlaceholders: userSettings.hidePlaceholders === true,
                hostname: hostname,
                ignoreGenericCosmeticFilters: userSettings.ignoreGenericCosmeticFilters === true,
                noCosmeticFiltering,
                noGenericCosmeticFiltering: noCosmeticFiltering,
                noSpecificCosmeticFiltering: noCosmeticFiltering,
                origin,
                pageUrl: url,
                parseAllABPHideFilters: userSettings.parseAllABPHideFilters === true,
                popupPanelType: 'legacy',
                removeWLCollections: () => {},
                scriptletInjectable: true,
                scriptletWillInject: true,
                specificCosmeticFilters: noCosmeticFiltering
                    ? { ready: true, injectedCSS: '', proceduralFilters: [], exceptionFilters: [], exceptedFilters: [], convertedProceduralFilters: [], genericCosmeticHashes: [], disableSurveyor: true }
                    : buildSpecificCosmeticPayload(hostname, cosmeticData),
                showIconBadge: userSettings.showIconBadge !== false,
                supportWebSocket: true,
                tabId: tabId,
                trustedScriptletTokens,
                url: url,
                userSettings: userSettings,
                userStyles: '',
                userScripts: '',
                webAllowWildcard: true,
                webextFlavor: 'chromium',
            };
            
            if (callback) callback(response);
        } catch (e) {
            if (callback) callback({ error: (e as Error).message });
        }
    });

    messaging.on('retrieveGenericCosmeticSelectors', async (payload, callback) => {
        try {
            const tabId = payload?._tabId;
            const hostname = payload?.hostname || '';
            const pageURL = payload?.url || '';
            const hashes = payload?.hashes || [];
            
            const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
            const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
            const pageScopeKey = hostname !== '' && pageURL !== '' ? `${hostname}:${pageURL}` : '';
            const netFilteringEnabled = hostname === ''
                ? true
                : perSiteFiltering[pageScopeKey] ?? perSiteFiltering[hostname] ?? true;
            
            if ( netFilteringEnabled === false ) {
                if (callback) callback({ result: { injectedCSS: '', excepted: [] } });
                return;
            }
            
            const stored = await chrome.storage.local.get('cosmeticFiltersData');
            const cosmeticData = parseStoredCosmeticFilterData(stored.cosmeticFiltersData);
            
            const selectors: string[] = [];
            const genericFilters = cosmeticData.genericCosmeticFilters || [];
            for (const filter of genericFilters) {
                if (filter.key && hashes.includes(filter.key)) {
                    selectors.push(filter.selector);
                }
            }
            
            const specificFilters = cosmeticData.specificCosmeticFilters || [];
            const pageHostname = payload?.hostname || '';
            
            for (const entry of specificFilters) {
                const selector = Array.isArray(entry) ? entry[0] : entry;
                const details = Array.isArray(entry) ? entry[1] : {};
                const matches = details?.matches || [];
                
                let appliesToHostname = false;
                if (matches.length === 0) {
                    appliesToHostname = true;
                } else if (matches.includes('*') || matches.includes(pageHostname)) {
                    appliesToHostname = true;
                } else if (pageHostname) {
                    for (const match of matches) {
                        if (pageHostname === match || pageHostname.endsWith('.' + match)) {
                            appliesToHostname = true;
                            break;
                        }
                    }
                }
                
                if (appliesToHostname && details.key && hashes.includes(details.key)) {
                    selectors.push(selector);
                }
            }
            
            const excepted: string[] = [];
            const genericExceptions = cosmeticData.genericCosmeticExceptions || [];
            
            const filteredSelectors = selectors.filter(selector => {
                for (const exc of genericExceptions) {
                    if (exc.selector === selector) {
                        excepted.push(selector);
                        return false;
                    }
                }
                return true;
            });
            
            if (filteredSelectors.length === 0 && excepted.length === 0) {
                if (callback) callback({ result: undefined });
                return;
            }
            
            const injectedCSS = filteredSelectors.join(',\n') + '\n{display:none!important;}';
            
            if (callback) callback({ result: { injectedCSS, excepted } });
        } catch (e) {
            if (callback) callback({ error: (e as Error).message });
        }
    });

    messaging.on('getTabId', (_, callback) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (callback) {
                callback({ tabId: tabs[0]?.id ?? null });
            }
        });
    });

    messaging.on('userSettings', (_, callback) => {
        chrome.storage.local.get('userSettings', (items) => {
            if (callback) {
                callback(items.userSettings || {});
            }
        });
    });

    messaging.on('setUserSettings', (payload, callback) => {
        chrome.storage.local.get('userSettings', (items) => {
            const settings = { ...(items.userSettings || {}), ...payload };
            chrome.storage.local.set({ userSettings: settings }, () => {
                if (callback) callback({ success: true });
            });
        });
    });

    // Continue with more handlers...
    messaging.on('dashboardGetRules', async (_, callback) => {
        try {
            const details = await deps.getDashboardRules();
            if ( callback ) {
                callback(details);
            }
            return details;
        } catch (e) {
            const result = { error: (e as Error).message };
            if ( callback ) {
                callback(result);
            }
            return result;
        }
    });

    messaging.on('dashboardModifyRuleset', async (payload, callback) => {
        try {
            const details = await deps.modifyDashboardRuleset(payload || {});
            if ( callback ) {
                callback(details);
            }
            return details;
        } catch (e) {
            const result = { error: (e as Error).message };
            if ( callback ) {
                callback(result);
            }
            return result;
        }
    });

    messaging.on('dashboardResetRules', async (_, callback) => {
        try {
            const details = await deps.resetDashboardRules();
            if ( callback ) {
                callback(details);
            }
            return details;
        } catch (e) {
            const result = { error: (e as Error).message };
            if ( callback ) {
                callback(result);
            }
            return result;
        }
    });

    messaging.on('getWhitelist', async (_, callback) => {
        const details = await deps.getWhitelist();
        if ( callback ) {
            callback(details);
        }
        return details;
    });

    messaging.on('setWhitelist', async (payload, callback) => {
        const details = await deps.setWhitelist(payload);
        if ( callback ) {
            callback(details);
        }
        return details;
    });

    messaging.on('documentBlocked', async (request, callback) => {
        if (callback) callback({ success: true });
    });

    messaging.on('getAssetContent', async (request, callback) => {
        try {
            const url = request.url as string;
            if (!url) {
                if (callback) callback({ content: '', trustedSource: false });
                return;
            }
            const response = await fetch(url);
            const content = await response.text();
            if (callback) callback({ content, trustedSource: false, sourceURL: url });
        } catch (e) {
            if (callback) callback({ content: '', trustedSource: false });
        }
    });

    messaging.on('getAutoCompleteDetails', async (_, callback) => {
        try {
            const stored = await chrome.storage.local.get('selectedFilterLists');
            const selectedLists = stored?.selectedFilterLists || [];
            const lists = await deps.getFilterListState();
            if (callback) callback({ selectedFilterLists: selectedLists, lists });
        } catch (e) {
            if (callback) callback({ selectedFilterLists: [], lists: {} });
        }
    });

    messaging.on('getTrustedScriptletTokens', async (_, callback) => {
        try {
            const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
            const tokens = redirectEngine?.getTrustedScriptletTokens?.() || [];
            if (callback) callback(tokens);
        } catch (e) {
            if (callback) callback([]);
        }
    });

    messaging.on('scriptlets', async (request, callback) => {
        if (callback) callback({ success: true });
    });

    messaging.on('default', async (request, callback) => {
        // Default handler - many cases handled inline
        if ( request.what === 'getAssetContent' ) {
            const url = request.url as string;
            if ( !url ) {
                if ( callback ) { callback({ content: '', trustedSource: false }); }
                return { content: '', trustedSource: false };
            }
            try {
                const response = await fetch(url);
                const content = await response.text();
                const result = { content, trustedSource: false, sourceURL: url };
                if ( callback ) { callback(result); }
                return result;
            } catch (e) {
                const result = { content: '', trustedSource: false };
                if ( callback ) { callback(result); }
                return result;
            }
        }
        if ( request.what === 'getURL' ) {
            const result = chrome.runtime.getURL(request.path as string);
            if ( callback ) { callback(result); }
            return result;
        }
        if ( callback ) { callback({}); }
        return {};
    });
};
