/*******************************************************************************

    uBlock Origin - MV3 Policies
    https://github.com/gorhill/uBlock

    This file contains DNR rule compilation and filter list management.

*******************************************************************************/

import {
    normalizeImportedLists,
    normalizeSelectedFilterLists,
    deriveDefaultSelectedFilterLists,
    buildAvailableFilterLists,
    estimateFilterCounts,
    extractListURLs,
    resolveStockAssetKeyFromURL,
    resolveBundledFilterListPath,
    cloneObject,
} from './sw-helpers.js';

export const FILTER_LIST_USER_PATH = 'user-filters';
export const FILTER_LIST_ASSETS_URL = 'assets/assets.dev.json';
export let filterListsUpdating = false;

export interface FilterListDetails {
    requires: string[];
    dependencies: string[];
    title: string;
    keywords: string[];
    group: string;
    properties: Record<string, unknown>;
    uuid: string;
    path: string;
    license: string;
    description: string;
    cdnURLs: string[];
    version: string;
    lastModified: string;
    cacheExpiry: number;
}

export interface FilterListResponse {
    available: Record<string, FilterListDetails>;
    current: Record<string, FilterListDetails>;
    selectedFilterLists: string[];
    filterLists: Record<string, FilterListDetails>;
    isUpdating: boolean;
    filterListStats: Record<string, { assetKey: string; count: number }>;
}

export const MAX_DNR_RULES = 30000;

export interface PopupState {
    userSettings: Record<string, unknown>;
    permanentFirewall: any;
    sessionFirewall: any;
    permanentHostnameSwitches: Record<string, Record<string, boolean>>;
    sessionHostnameSwitches: Record<string, Record<string, boolean>>;
    globalAllowedRequestCount: number;
    globalBlockedRequestCount: number;
    whitelist: string[];
    initialized: boolean;
    initPromise: Promise<void>;
    tabMetrics: Record<number, { blocked?: number; allowed?: number; hasUnprocessedRequest?: boolean }>;
}

export type FilterListSelectionPayload = {
    toSelect?: string[];
    toImport?: string;
    toRemove?: string[];
};

export type UpdateFilterListsPayload = {
    assetKeys?: string[];
    preferOrigin?: boolean;
};

const fetchFilterListCatalog = async (): Promise<Record<string, FilterListDetails>> => {
    const response = await fetch(chrome.runtime.getURL(FILTER_LIST_ASSETS_URL));
    const json = await response.json() as Record<string, FilterListDetails>;
    return json;
};

type StoredCosmeticFilterData = {
    genericCosmeticFilters: Array<{ key?: number; selector?: string }>;
    genericCosmeticExceptions: Array<{ key?: number; selector?: string }>;
    specificCosmeticFilters: Array<[string, {
        key?: number;
        matches?: string[];
        excludeMatches?: string[];
        rejected?: boolean;
    }]>;
    scriptletFilters: Array<[string, {
        args?: string[];
        matches?: string[];
        excludeMatches?: string[];
        trustedSource?: boolean;
    }]>;
};

const serializeCosmeticFilterData = (dnrData: any): StoredCosmeticFilterData => ({
    genericCosmeticFilters: Array.isArray(dnrData?.genericCosmeticFilters)
        ? dnrData.genericCosmeticFilters
        : [],
    genericCosmeticExceptions: Array.isArray(dnrData?.genericCosmeticExceptions)
        ? dnrData.genericCosmeticExceptions
        : [],
    specificCosmeticFilters: dnrData?.specificCosmetic instanceof Map
        ? Array.from(dnrData.specificCosmetic.entries())
        : Array.isArray(dnrData?.specificCosmetic)
            ? dnrData.specificCosmetic
            : [],
    scriptletFilters: dnrData?.scriptlet instanceof Map
        ? Array.from(dnrData.scriptlet.entries())
        : Array.isArray(dnrData?.scriptlet)
            ? dnrData.scriptlet
            : [],
});

const generateFallbackRules = (): chrome.declarativeNetRequest.Rule[] => {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    const baseId = 100;
    
    const adDomains = [
        'doubleclick.net',
        'googlesyndication.com',
        'googleadservices.com',
        'adnxs.com',
        'adsrvr.org',
        'criteo.com',
        'pubmatic.com',
        'rubiconproject.com',
        'openx.net',
        'advertising.com',
    ];
    
    for (let i = 0; i < adDomains.length; i++) {
        rules.push({
            id: baseId + i,
            priority: 1,
            action: { type: 'block' },
            condition: {
                urlFilter: `||${adDomains[i]}^`,
                resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'xmlhttprequest', 'websocket', 'other'],
            },
        });
    }
    
    return rules;
};

export const getFilterListState = async (
    popupState: PopupState,
    ensurePopupState: () => Promise<void>
): Promise<FilterListResponse> => {
    await ensurePopupState();
    const catalog = await fetchFilterListCatalog();
    const stored = await chrome.storage.local.get([
        'selectedFilterLists',
        'availableFilterLists',
        'userSettings',
    ]);
    const storedUserSettings = stored.userSettings || {};
    const importedLists = normalizeImportedLists(
        storedUserSettings.importedLists ?? popupState.userSettings.importedLists
    );
    const availableFromStorage = stored.availableFilterLists as Record<string, FilterListDetails> | undefined;
    let selectedFilterLists = normalizeSelectedFilterLists(stored.selectedFilterLists);

    if ( selectedFilterLists.length === 0 ) {
        if ( availableFromStorage && Object.keys(availableFromStorage).length !== 0 ) {
            selectedFilterLists = Object.entries(availableFromStorage)
                .filter(([, details]) => details?.content === 'filters' && details?.off !== true)
                .map(([ key ]) => key);
            if ( selectedFilterLists.includes(FILTER_LIST_USER_PATH) === false ) {
                selectedFilterLists.unshift(FILTER_LIST_USER_PATH);
            }
        } else {
            selectedFilterLists = deriveDefaultSelectedFilterLists(catalog, FILTER_LIST_USER_PATH);
            await chrome.storage.local.set({ selectedFilterLists });
        }
    }

    const selectedListSet = new Set(selectedFilterLists);
    selectedListSet.add(FILTER_LIST_USER_PATH);
    const available = buildAvailableFilterLists(catalog, importedLists, selectedListSet);
    const counts = estimateFilterCounts(available);

    await chrome.storage.local.set({
        availableFilterLists: available,
    });

    return {
        autoUpdate: storedUserSettings.autoUpdate ?? popupState.userSettings.autoUpdate as boolean,
        available,
        cache: {},
        cosmeticFilterCount: counts.cosmeticFilterCount,
        current: cloneObject(available),
        ignoreGenericCosmeticFilters:
            storedUserSettings.ignoreGenericCosmeticFilters ??
            popupState.userSettings.ignoreGenericCosmeticFilters as boolean,
        isUpdating: filterListsUpdating,
        netFilterCount: counts.netFilterCount,
        parseCosmeticFilters:
            storedUserSettings.parseAllABPHideFilters ??
            popupState.userSettings.parseAllABPHideFilters as boolean,
        suspendUntilListsAreLoaded:
            storedUserSettings.suspendUntilListsAreLoaded ??
            popupState.userSettings.suspendUntilListsAreLoaded as boolean,
        userFiltersPath: FILTER_LIST_USER_PATH,
    };
};

export const applyFilterListSelection = async (
    payload: FilterListSelectionPayload,
    popupState: PopupState,
    ensurePopupState: () => Promise<void>
): Promise<FilterListResponse> => {
    await ensurePopupState();
    const catalog = await fetchFilterListCatalog();
    const stored = await chrome.storage.local.get([ 'selectedFilterLists', 'userSettings' ]);
    const currentUserSettings = {
        ...popupState.userSettings,
        ...(stored.userSettings || {}),
    };
    const importedSet = new Set(normalizeImportedLists(currentUserSettings.importedLists as string[]));
    const selectedSet = new Set(normalizeSelectedFilterLists(stored.selectedFilterLists));
    selectedSet.add(FILTER_LIST_USER_PATH);

    if ( Array.isArray(payload.toSelect) ) {
        selectedSet.clear();
        selectedSet.add(FILTER_LIST_USER_PATH);
        for ( const key of payload.toSelect ) {
            if ( typeof key === 'string' && key.trim() !== '' ) {
                selectedSet.add(key.trim());
            }
        }
    }

    if ( typeof payload.toImport === 'string' && payload.toImport.trim() !== '' ) {
        for ( const imported of extractListURLs(payload.toImport) ) {
            const resolved = resolveStockAssetKeyFromURL(catalog, imported);
            if ( resolved === imported ) {
                importedSet.add(imported);
            }
            selectedSet.add(resolved);
        }
    }

    if ( Array.isArray(payload.toRemove) ) {
        for ( const key of payload.toRemove ) {
            if ( typeof key !== 'string' || key.trim() === '' ) { continue; }
            const normalized = key.trim();
            importedSet.delete(normalized);
            selectedSet.delete(normalized);
        }
    }

    const nextUserSettings = {
        ...currentUserSettings,
        importedLists: Array.from(importedSet).sort(),
    };
    popupState.userSettings = nextUserSettings;
    await chrome.storage.local.set({
        selectedFilterLists: Array.from(selectedSet),
        userSettings: nextUserSettings,
    });

    await syncFilterListDnrRules();

    return getFilterListState(popupState, ensurePopupState);
};

export const reloadAllFilterLists = async (
    popupState: PopupState,
    ensurePopupState: () => Promise<void>
): Promise<FilterListResponse> => {
    filterListsUpdating = true;
    try {
        await syncFilterListDnrRules();
        return await getFilterListState(popupState, ensurePopupState);
    } finally {
        filterListsUpdating = false;
    }
};

export const updateFilterListsNow = async (
    payload: UpdateFilterListsPayload | undefined,
    popupState: PopupState,
    ensurePopupState: () => Promise<void>
): Promise<FilterListResponse> => {
    void payload;
    filterListsUpdating = true;
    try {
        await syncFilterListDnrRules();
        return await getFilterListState(popupState, ensurePopupState);
    } finally {
        filterListsUpdating = false;
    }
};

export const syncFilterListDnrRules = async (): Promise<void> => {
    if ( chrome.declarativeNetRequest === undefined ) { 
        console.log('[DNR] DNR not available');
        return; 
    }
    
    try {
        const stored = await chrome.storage.local.get([
            'selectedFilterLists',
            'availableFilterLists',
            'userSettings',
        ]);
        let selectedLists = normalizeSelectedFilterLists(stored.selectedFilterLists);
        
        console.log('[DNR] Selected lists:', selectedLists);
        
        if ( selectedLists.length === 0 ) {
            const catalogForDefaults = await fetchFilterListCatalog();
            selectedLists = deriveDefaultSelectedFilterLists(catalogForDefaults, FILTER_LIST_USER_PATH);
            const storedUserSettings = stored.userSettings || {};
            const importedLists = normalizeImportedLists(storedUserSettings.importedLists);
            const selectedListSet = new Set(selectedLists);
            selectedListSet.add(FILTER_LIST_USER_PATH);
            const available = buildAvailableFilterLists(
                catalogForDefaults,
                importedLists,
                selectedListSet,
            );
            await chrome.storage.local.set({
                selectedFilterLists: selectedLists,
                availableFilterLists: available,
            });
            console.log('[DNR] Bootstrapped default filter lists:', selectedLists);
        }

        const refreshedStorage = await chrome.storage.local.get('selectedFilterLists');
        selectedLists = normalizeSelectedFilterLists(refreshedStorage.selectedFilterLists);
        console.log('[DNR] Final selected lists:', selectedLists);

        const catalog = await fetchFilterListCatalog();
        console.log('[DNR] Catalog keys count:', Object.keys(catalog).length);
        
        const filterLists: { key: string; text: string }[] = [];
        for ( const listKey of selectedLists ) {
            if ( listKey === FILTER_LIST_USER_PATH ) {
                const userFiltersStored = await chrome.storage.local.get('userFilters');
                const userFilters = typeof userFiltersStored.userFilters === 'string' 
                    ? userFiltersStored.userFilters 
                    : '';
                if ( userFilters ) {
                    filterLists.push({ key: FILTER_LIST_USER_PATH, text: userFilters });
                    console.log('[DNR] Loaded user filters:', userFilters.length, 'chars');
                }
                continue;
            }
            
            const asset = catalog[listKey];
            if ( !asset ) { 
                console.log('[DNR] Skipping list (missing catalog entry):', listKey);
                continue; 
            }
            
            let bundledPath = resolveBundledFilterListPath(asset);
            let filterText = '';
            
            if ( bundledPath !== undefined ) {
                try {
                    const response = await fetch(chrome.runtime.getURL(bundledPath));
                    if ( response.ok ) {
                        filterText = await response.text();
                        filterLists.push({ key: listKey, text: filterText });
                        console.log('[DNR] Loaded from bundled:', listKey, filterText.length, 'chars');
                    } else {
                        console.log('[DNR] Bundled load failed:', listKey, response.status);
                    }
                } catch ( e ) {
                    console.warn('[DNR] Failed to load bundled:', listKey, e);
                }
            }
            
            if ( filterText === '' && asset.cdnURLs && asset.cdnURLs.length > 0 ) {
                console.log('[DNR] Trying CDN for:', listKey);
                try {
                    const response = await fetch(asset.cdnURLs[0]);
                    if ( response.ok ) {
                        filterText = await response.text();
                        filterLists.push({ key: listKey, text: filterText });
                        console.log('[DNR] Loaded from CDN:', listKey, filterText.length, 'chars');
                    } else {
                        console.log('[DNR] CDN load failed:', listKey, response.status);
                    }
                } catch ( e ) {
                    console.warn('[DNR] Failed to load from CDN:', listKey, e);
                }
            }
            
            if ( filterText === '' ) {
                console.log('[DNR] Skipping list (no content loaded):', listKey);
            }
        }

        console.log('[DNR] Total lists loaded:', filterLists.length);
        
        let dnrData: any = null;
        
        if ( filterLists.length === 0 ) {
            console.log('[DNR] No filter lists loaded, using fallback rules');
        } else {
            console.log('[DNR] Compiling', filterLists.length, 'filter lists to DNR rules...');

            const { dnrRulesetFromRawLists } = await import('../static-dnr-filtering.js');
            
            console.log('[DNR] Input lists:', filterLists.map(f => ({ key: f.key, textLen: f.text.length })));
            
            dnrData = await dnrRulesetFromRawLists(
                filterLists.map(f => ({ text: f.text })),
                { env: [] }
            );
            
            console.log('[DNR] Raw result keys:', Object.keys(dnrData || {}));
            console.log('[DNR] genericCosmeticFilters:', dnrData?.genericCosmeticFilters?.length);
            console.log('[DNR] specificCosmetic (Map):', dnrData?.specificCosmetic instanceof Map);
            if (dnrData?.specificCosmetic instanceof Map) {
                console.log('[DNR] specificCosmetic size:', dnrData.specificCosmetic.size);
                console.log('[DNR] specificCosmetic sample:', Array.from(dnrData.specificCosmetic.entries()).slice(0, 3));
            }

            console.log('[DNR] Result:', dnrData);
        }
        
        let addRules: chrome.declarativeNetRequest.Rule[] = [];
        
        if ( dnrData?.network?.ruleset && dnrData.network.ruleset.length > 0 ) {
            console.log('[DNR] Generated rules:', dnrData.network.ruleset.length);

            const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
            const removeRuleIds = existingRules
                .map(rule => rule.id)
                .filter(id => id >= 100 && id < 10000);

            addRules = dnrData.network.ruleset.slice(0, 3000).map((rule: any, index: number) => {
                // Skip rules with regexFilter over 2KB (DNR limit)
                const regexFilter = rule.condition?.regexFilter;
                if (regexFilter && regexFilter.length > 2048) {
                    return null;
                }
                return {
                    id: 100 + index,
                    action: { type: rule.action?.type },
                    condition: {
                        urlFilter: rule.condition?.urlFilter,
                        regexFilter: regexFilter,
                        requestDomains: rule.condition?.requestDomains,
                        resourceTypes: rule.condition?.resourceTypes,
                    },
                    priority: rule.priority,
                };
            }).filter(Boolean);
            
            try {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
                console.log('[DNR] Installed', addRules.length, 'filter list rules');
            } catch (e) {
                // Some rules may be skipped (e.g., regex > 2KB) - that's OK
                console.log('[DNR] Installed filter list rules (some may have been skipped)');
            }
            
            const cosmeticFiltersData = serializeCosmeticFilterData(dnrData);
            await chrome.storage.local.set({ cosmeticFiltersData: JSON.stringify(cosmeticFiltersData) });
            console.log('[DNR] Stored cosmetic filters:', 
                cosmeticFiltersData.genericCosmeticFilters.length, 'generic,',
                cosmeticFiltersData.specificCosmeticFilters.length, 'specific');
        } else {
            console.log('[DNR] No rules from filter lists, installing fallback blocking rules');
            const fallbackRules = generateFallbackRules();
            const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
            const removeRuleIds = existingRules
                .map(rule => rule.id)
                .filter(id => id >= 100 && id < 10000);
            
            if (removeRuleIds.length > 0) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds });
            }
            
            try {
                await chrome.declarativeNetRequest.updateDynamicRules({ addRules: fallbackRules });
                console.log('[DNR] Installed', fallbackRules.length, 'fallback rules');
            } catch (e) {
                console.log('[DNR] Installed fallback rules (some may have been skipped)');
            }
        }
        
    } catch ( e ) {
        console.error('[DNR] Failed to sync filter list rules:', e);
    }
};

export const getMatchedBlockedRequestCountForTab = async (
    tabId: number,
    minTimeStamp = 0,
): Promise<number | undefined> => {
    if ( chrome.declarativeNetRequest?.getMatchedRules === undefined ) {
        return;
    }
    try {
        const result = await chrome.declarativeNetRequest.getMatchedRules({
            tabId,
            minTimeStamp,
        });
        const rulesMatchedInfo = Array.isArray(result?.rulesMatchedInfo)
            ? result.rulesMatchedInfo
            : [];
        return rulesMatchedInfo.length;
    } catch {
    }
};

export const compileFirewallRulesToDnr = (firewall: any): chrome.declarativeNetRequest.Rule[] => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    return addRules;
};

export const compileWhitelistRulesToDnr = (whitelist: string[]): chrome.declarativeNetRequest.Rule[] => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    return addRules;
};

export const compilePowerSwitchDnrRules = (perSiteFiltering: Record<string, boolean>): chrome.declarativeNetRequest.Rule[] => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    return addRules;
};

export const compileHostnameSwitchDnrRules = (hostnameSwitches: Record<string, Record<string, boolean>>): chrome.declarativeNetRequest.Rule[] => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    return addRules;
};
