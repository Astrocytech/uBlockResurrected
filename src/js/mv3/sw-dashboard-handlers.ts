/*******************************************************************************

    uBlock Origin - MV3 Dashboard Handlers
    Handles all dashboard-related messages

*******************************************************************************/

import { PopupState } from './sw-storage.js';
import {
    getFilterListState,
    applyFilterListSelection,
    reloadAllFilterLists,
    updateFilterListsNow,
} from './sw-policies.js';

import {
    getFirewallRulesForPopup,
} from './sw-firewall.js';

import type { PopupRequest } from './sw-types.js';

export const createDashboardHandlers = (deps: {
    popupState: PopupState;
    ensurePopupState: () => Promise<void>;
    setUserSetting: (request: PopupRequest) => Promise<any>;
    getLocalData: () => Promise<any>;
    backupUserData: () => Promise<void>;
    restoreUserData: (request: any) => Promise<void>;
    resetUserData: () => Promise<void>;
    reloadAllFilterLists: () => Promise<any>;
    getDeviceName: () => Promise<string>;
    encodeCloudData: (data: any) => Promise<string>;
    decodeCloudData: (encoded: string) => Promise<any>;
    syncPowerSwitchDnrRules: () => Promise<void>;
    updateToolbarIcon: (tabId: number, options: { filtering?: boolean }) => Promise<void>;
    parseStoredCosmeticFilterData: (raw: unknown) => any;
    getPopupData: (request: PopupRequest) => Promise<any>;
    µb: any;
    redirectEngine: any;
    staticFilteringReverseLookup: any;
    publicSuffixList: any;
    staticFilteringEngine: any;
    cosmeticFilteringEngine: any;
}) => {
    const {
        popupState,
        ensurePopupState,
        setUserSetting,
        getLocalData,
        backupUserData,
        restoreUserData,
        resetUserData,
        reloadAllFilterLists,
        getDeviceName,
        encodeCloudData,
        decodeCloudData,
        syncPowerSwitchDnrRules,
        updateToolbarIcon,
        parseStoredCosmeticFilterData,
        getPopupData,
        µb,
        redirectEngine,
        staticFilteringReverseLookup,
        publicSuffixList,
        staticFilteringEngine,
        cosmeticFilteringEngine,
    } = deps;

    const handleDashboardMessage = async (request: PopupRequest) => {
        switch ( request.what ) {
        case 'getLists':
            return getFilterListState(popupState, ensurePopupState);
        case 'applyFilterListSelection':
            return applyFilterListSelection(request as {
                toSelect?: string[];
                toImport?: string;
                toRemove?: string[];
            }, popupState, ensurePopupState);
        case 'reloadAllFilters':
            return reloadAllFilterLists(popupState, ensurePopupState);
        case 'updateNow':
            return updateFilterListsNow(undefined, popupState, ensurePopupState);
        case 'listsUpdateNow':
            return updateFilterListsNow(request as { assetKeys?: string[]; preferOrigin?: boolean }, popupState, ensurePopupState);
        case 'userSettings':
            return setUserSetting(request);
        case 'getLocalData':
            return getLocalData();
        case 'backupUserData':
            return backupUserData();
        case 'restoreUserData':
            return restoreUserData(request as { userData?: unknown; file?: string });
        case 'resetUserData':
            return resetUserData();
        case 'readUserFilters': {
            const items = await chrome.storage.local.get('userFilters');
            const enabled = await chrome.storage.local.get('userFiltersEnabled');
            const selectedLists = await chrome.storage.local.get('selectedFilterLists');
            
            const userFiltersPath = 'userfilters';
            const isSelected = selectedLists?.selectedFilterLists?.includes(userFiltersPath) || false;
            const isTrusted = popupState.trustedLists?.[userFiltersPath] === true;
            
            return { 
                userFilters: items.userFilters || '',
                enabled: enabled?.userFiltersEnabled !== false ? isSelected : false,
                trusted: isTrusted,
            };
        }
        case 'writeUserFilters': {
            const userFilters = request.userFilters as string;
            const enabled = request.enabled as boolean;
            if ( typeof userFilters === 'string' ) {
                const MAX_FILTER_SIZE = 10 * 1024 * 1024;
                if (userFilters.length > MAX_FILTER_SIZE) {
                    return { success: false, error: 'Filter size exceeds limit' };
                }
                await chrome.storage.local.set({ userFilters });
                if (typeof enabled === 'boolean') {
                    await chrome.storage.local.set({ userFiltersEnabled: enabled });
                }
                await reloadAllFilterLists(popupState, ensurePopupState);
                return { success: true };
            }
            return { success: false, error: 'Invalid userFilters' };
        }
        case 'cloudGetOptions': {
            const stored = await chrome.storage.local.get('cloudOptions');
            const userSettings = (await chrome.storage.local.get('userSettings')).userSettings || {};
            const options = stored?.cloudOptions || {};
            const deviceName = options.deviceName || await getDeviceName();
            const syncStorageAvailable = typeof chrome.storage.sync !== 'undefined';
            return {
                deviceName,
                syncEnabled: options.syncEnabled !== false,
                enabled: userSettings.cloudStorageEnabled === true,
                cloudStorageSupported: syncStorageAvailable,
            };
        }
        case 'cloudSetOptions': {
            const options = request as { deviceName?: string; syncEnabled?: boolean };
            const stored = await chrome.storage.local.get('cloudOptions');
            const existing = stored?.cloudOptions || {};
            if (typeof options.deviceName === 'string') {
                existing.deviceName = options.deviceName;
            }
            if (typeof options.syncEnabled === 'boolean') {
                existing.syncEnabled = options.syncEnabled;
            }
            await chrome.storage.local.set({ cloudOptions: existing });
            return { success: true };
        }
        case 'cloudPull': {
            const useSync = typeof chrome.storage.sync !== 'undefined';
            const cloudKey = 'cloudData';
            const stored = useSync 
                ? await chrome.storage.sync.get(cloudKey)
                : await chrome.storage.local.get(cloudKey);
            const cloudData = stored?.[cloudKey];
            if (!cloudData) return { error: 'No cloud data' };
            
            try {
                const decoded = await decodeCloudData(cloudData);
                return { 
                    data: decoded, 
                    clientId: decoded.clientId, 
                    lastModified: decoded.lastModified,
                    serverTime: decoded.serverTime,
                };
            } catch (e) {
                return { error: (e as Error).message };
            }
        }
        case 'cloudPush': {
            const cloudData = request.data;
            if (!cloudData) return { error: 'No data to push' };
            
            try {
                const dataToPush = {
                    ...cloudData,
                    serverTime: Date.now(),
                    clientTime: Date.now(),
                };
                
                const encoded = await encodeCloudData(dataToPush);
                
                const useSync = typeof chrome.storage.sync !== 'undefined';
                if (useSync) {
                    await chrome.storage.sync.set({ cloudData: encoded });
                } else {
                    await chrome.storage.local.set({ cloudData: encoded });
                }
                
                const storageUsed = useSync 
                    ? await chrome.storage.sync.getBytesInUse()
                    : await chrome.storage.local.getBytesInUse();
                if (useSync) {
                    await chrome.storage.sync.set({ 
                        cloudStorageUsed: storageUsed,
                        lastCloudSync: Date.now() 
                    });
                } else {
                    await chrome.storage.local.set({ 
                        cloudStorageUsed: storageUsed,
                        lastCloudSync: Date.now() 
                    });
                }
                
                return { success: true, clientId: cloudData.clientId };
            } catch (e) {
                return { error: (e as Error).message };
            }
        }
        case 'cloudUsed': {
            const useSync = typeof chrome.storage.sync !== 'undefined';
            const storageUsed = useSync 
                ? await chrome.storage.sync.getBytesInUse()
                : await chrome.storage.local.getBytesInUse();
            
            const cloudKey = useSync ? 'cloudData' : 'cloudData';
            const cloudData = useSync 
                ? await chrome.storage.sync.get(cloudKey)
                : await chrome.storage.local.get(cloudKey);
            const cloudSize = cloudData?.[cloudKey] ? JSON.stringify(cloudData[cloudKey]).length : 0;
            
            const lastCloudSync = useSync 
                ? await chrome.storage.sync.get('lastCloudSync')
                : await chrome.storage.local.get('lastCloudSync');
            
            return { 
                used: cloudSize,
                total: storageUsed,
                lastSync: lastCloudSync?.lastCloudSync || 0,
            };
        }
        case 'getAppData': {
            const manifest = chrome.runtime.getManifest();
            const stored = await chrome.storage.local.get('hiddenSettings');
            const hiddenSettings = stored?.hiddenSettings || {};
            const whitelistStored = await chrome.storage.local.get('whitelist');
            const whitelist = whitelistStored?.whitelist || '';
            
            return {
                name: manifest.name || 'uBlock Resurrected',
                version: manifest.version || '1.0.0',
                canBenchmark: hiddenSettings?.benchmarkDatasetURL !== 'unset',
                whitelist: µb?.arrayFromWhitelist?.(whitelist) || [],
                whitelistDefault: µb?.netWhitelistDefault || [],
                reBadHostname: µb?.reWhitelistBadHostname?.source || '(^|\\.)(localhost|localhost\\.localdomain|127\\.0\\.0\\.1|0\\.0\\.0\\.0|255\\.255\\.255\\.255)$/',
                reHostnameExtractor: µb?.reWhitelistHostnameExtractor?.source || '^https?:\\/\\/([^/:]+)',
            };
        }
        case 'getTrustedScriptletTokens': {
            if (redirectEngine?.getTrustedScriptletTokens) {
                return redirectEngine.getTrustedScriptletTokens();
            }
            return [];
        }
        case 'getWhitelist': {
            const whitelistStored = await chrome.storage.local.get('whitelist');
            const whitelist = whitelistStored?.whitelist || '';
            return {
                whitelist: µb?.arrayFromWhitelist?.(whitelist) || [],
                whitelistDefault: µb?.netWhitelistDefault || [],
                reBadHostname: µb?.reWhitelistBadHostname?.source || '(^|\\.)(localhost|localhost\\.localdomain|127\\.0\\.0\\.1|0\\.0\\.0\\.0|255\\.255\\.255\\.255)$/',
                reHostnameExtractor: µb?.reWhitelistHostnameExtractor?.source || '^https?:\\/\\/([^/:]+)',
            };
        }
        case 'setWhitelist': {
            const whitelist = request.whitelist as string;
            if (typeof whitelist === 'string' && whitelist.length > 0) {
                popupState.whitelist = µb?.whitelistFromString?.(whitelist) || [];
                try {
                    await chrome.storage.local.set({ whitelist });
                    return { success: true };
                } catch (e) {
                    return { success: false, error: (e as Error).message };
                }
            }
            return { success: false, error: 'Invalid whitelist' };
        }
        case 'getDomainNames': {
            const target = request.target as string;
            if (typeof target !== 'string' || target === '') { return []; }
            
            const domains: string[] = [];
            
            const extractDomain = (hostname: string): string | null => {
                if (!hostname) return null;
                const parts = hostname.split('.');
                if (parts.length >= 2) {
                    return parts.slice(-2).join('.');
                }
                return hostname;
            };
            
            try {
                if (target.includes('/') || target.includes(':')) {
                    const url = new URL(target);
                    const domain = extractDomain(url.hostname);
                    if (domain) domains.push(domain);
                } else {
                    const domain = extractDomain(target);
                    if (domain) domains.push(domain);
                }
            } catch {
                const domain = extractDomain(target);
                if (domain) domains.push(domain);
            }
            
            return domains;
        }
        case 'getCollapsibleBlockedRequests': {
            const tabId = request.tabId as number;
            if ( typeof tabId !== 'number' ) { return { requests: [] }; }
            try {
                const results = await chrome.tabs.sendMessage(tabId, { what: 'getCollapsibleBlockedRequests' });
                return results || { requests: [] };
            } catch {
                return { requests: [] };
            }
        }
        case 'hasPopupContentChanged': {
            const tabId = request.tabId as number;
            const contentLastModified = request.contentLastModified as number;
            
            if (typeof tabId !== 'number') {
                return { changed: false };
            }
            
            const stored = await chrome.storage.local.get('popupContentVersions');
            const versions = stored?.popupContentVersions || {};
            const storedVersion = versions[tabId] || 0;
            
            const changed = storedVersion !== 0 && storedVersion !== contentLastModified;
            
            if (changed || storedVersion === 0) {
                versions[tabId] = Date.now();
                await chrome.storage.local.set({ popupContentVersions: versions });
            }
            
            return { changed };
        }
        case 'toggleInMemoryFilter': {
            const filter = request.filter as string;
            const tabId = request.tabId as number;
            if ( filter && typeof tabId === 'number' ) {
                try {
                    await chrome.tabs.sendMessage(tabId, { what: 'toggleInMemoryFilter', filter });
                } catch (e) {}
            }
            return { success: true };
        }
        case 'hasInMemoryFilter': {
            const tabId = request.tabId as number;
            if ( typeof tabId === 'number' ) {
                try {
                    const results = await chrome.tabs.sendMessage(tabId, { what: 'hasInMemoryFilter' });
                    return results || { hasFilter: false };
                } catch {
                    return { hasFilter: false };
                }
            }
            return { hasFilter: false };
        }
        case 'readAll': {
            const ownerId = request.ownerId as number;
            if (µb?.logger?.ownerId !== undefined && µb?.logger?.ownerId !== ownerId) {
                return { unavailable: true };
            }
            
            try {
                const allData = await chrome.storage.local.get(null);
                return allData;
            } catch (e) {
                return { error: (e as Error).message };
            }
        }
        case 'toggleNetFiltering': {
            const { url, scope, state, tabId } = request;
            if (!url || !tabId) { return getPopupData(request); }
            
            let hostname = '';
            try {
                hostname = new URL(url).hostname;
            } catch {
                return getPopupData(request);
            }
            
            const stored = await chrome.storage.local.get('perSiteFiltering');
            const perSiteFiltering: Record<string, boolean> = stored?.perSiteFiltering || {};
            
            const scopeKey = scope === 'page' ? `${hostname}:${url}` : hostname;
            
            perSiteFiltering[scopeKey] = state;
            
            await chrome.storage.local.set({ perSiteFiltering: perSiteFiltering });
            await syncPowerSwitchDnrRules();
            
            if ( tabId ) {
                try {
                    const result = chrome.tabs.sendMessage(tabId, {
                        topic: 'uBlockPowerSwitch',
                        payload: {
                            enabled: state === true,
                        },
                    }) as Promise<unknown> | undefined;
                    result?.catch(() => {});
                } catch {
                }
            }
            
            console.log('[MV3] toggleNetFiltering:', scopeKey, '=', state);
            
            return getPopupData(request);
        }
        case 'reloadTab': {
            const { tabId, bypassCache, url } = request;
            if (tabId) {
                if (typeof url === 'string' && url !== '') {
                    chrome.tabs.get(tabId, (tab) => {
                        if (tab?.url && tab.url !== url) {
                            chrome.tabs.update(tabId, { url });
                        } else {
                            chrome.tabs.reload(tabId, { bypassCache: !!bypassCache });
                        }
                    });
                } else {
                    chrome.tabs.reload(tabId, { bypassCache: !!bypassCache });
                }
            }
            return {};
        }
        case 'dismissUnprocessedRequest': {
            const tabId = request.tabId as number;
            if (typeof tabId === 'number') {
                const vAPINet = (globalThis as any).vAPI?.net;
                if (vAPINet?.removeUnprocessedRequest) {
                    vAPINet.removeUnprocessedRequest(tabId);
                }
                
                const stored = await chrome.storage.local.get('unprocessedRequests');
                const unprocessed = stored?.unprocessedRequests || {};
                delete unprocessed[tabId];
                await chrome.storage.local.set({ unprocessedRequests: unprocessed });
                
                await updateToolbarIcon(tabId, { filtering: true });
            }
            return { success: true };
        }
        case 'launchReporter': {
            const tabId = request.tabId as number;
            const pageURL = request.pageURL as string;
            if (tabId && pageURL) {
                const stored = await chrome.storage.local.get('popupStats');
                const stats = stored?.popupStats?.[tabId] || {};
                
                const filterLists = (await chrome.storage.local.get('filterLists')).filterLists || {};
                const selectedLists = (await chrome.storage.local.get('selectedFilterLists')).selectedFilterLists || [];
                const updateAges: Record<string, number> = {};
                
                for (const listKey of selectedLists) {
                    const list = filterLists[listKey];
                    if (list?.lastFetchTime) {
                        updateAges[listKey] = Date.now() - list.lastFetchTime;
                    }
                }
                
                const cosmeticData = (await chrome.storage.local.get('cosmeticFiltersData')).cosmeticFiltersData || {};
                const cosmeticFilterCount = Object.keys(cosmeticData).length;
                
                const url = new URL(chrome.runtime.getURL('reporter.html'));
                url.searchParams.set('url', pageURL);
                url.searchParams.set('tabId', String(tabId));
                url.searchParams.set('blocked', String(stats.blocked || 0));
                url.searchParams.set('allowed', String(stats.allowed || 0));
                url.searchParams.set('cosmeticFilters', String(cosmeticFilterCount));
                url.searchParams.set('updateAges', JSON.stringify(updateAges));
                
                chrome.tabs.create({ url: url.toString(), active: true });
            }
            return { success: true };
        }
        case 'gotoURL': {
            const { url, newTab, tabId: targetTabId, select, index, shiftKey } = request as {
                url?: string;
                newTab?: boolean;
                tabId?: number;
                select?: boolean;
                index?: number;
                shiftKey?: boolean;
            };
            if (!url) return { success: false };
            
            const createProps: chrome.tabs.CreateProperties = { url, active: select !== false };
            if (typeof index === 'number') createProps.index = index;
            if (shiftKey) createProps.active = false;
            
            if (newTab) {
                const created = await chrome.tabs.create(createProps);
                return { tabId: created.id };
            } else if (targetTabId) {
                await chrome.tabs.update(targetTabId, { url, active: true });
                return { tabId: targetTabId };
            } else {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]?.id) {
                    await chrome.tabs.update(tabs[0].id, { url, active: true });
                    return { tabId: tabs[0].id };
                }
            }
            return { success: false };
        }
        case 'getAssetContent': {
            const url = request.url as string;
            if (!url) return { error: 'No URL provided' };
            try {
                const response = await fetch(url);
                const text = await response.text();
                return {
                    content: text,
                    assetKey: url,
                    sourceURL: url,
                };
            } catch (e) {
                return { error: (e as Error).message };
            }
        }
        case 'listsFromNetFilter': {
            const rawFilter = request.rawFilter as string;
            if (!rawFilter) return { notFound: true };
            if (staticFilteringReverseLookup) {
                try {
                    const result = await staticFilteringReverseLookup.fromNetFilter(rawFilter);
                    return result;
                } catch (e) {
                    return { notFound: true };
                }
            }
            return { notFound: true };
        }
        case 'listsFromCosmeticFilter': {
            const rawFilter = request.rawFilter as string;
            if (!rawFilter) return { notFound: true };
            if (staticFilteringReverseLookup) {
                try {
                    const result = await staticFilteringReverseLookup.fromExtendedFilter({ rawFilter });
                    return result;
                } catch (e) {
                    return { notFound: true };
                }
            }
            return { notFound: true };
        }
        case 'reloadAllFilters':
            return reloadAllFilterLists(popupState, ensurePopupState);
        case 'scriptlet': {
            const tabId = request.tabId as number;
            const scriptletName = request.scriptlet as string;
            if (tabId && scriptletName) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId },
                        files: [`/js/scriptlets/${scriptletName}.js`],
                    });
                    return { success: true };
                } catch (e) {
                    return { error: (e as Error).message };
                }
            }
            return { error: 'Invalid parameters' };
        }
        case 'loggerDisabled': {
            return µb?.logger?.enabled !== true;
        }
        case 'snfeBenchmark': {
            return { result: 'Benchmark not implemented in MV3' };
        }
        case 'cfeBenchmark': {
            return { result: 'Benchmark not implemented in MV3' };
        }
        case 'sfeBenchmark': {
            return { result: 'Benchmark not implemented in MV3' };
        }
        case 'snfeToDNR': {
            return { success: true, message: 'Static network filters already use DNR in MV3' };
        }
        case 'snfeDump': {
            if (staticFilteringEngine) {
                return { dump: 'Static filtering engine state not available' };
            }
            return { dump: 'No engine' };
        }
        case 'snfeQuery': {
            const filter = request.filter as string;
            if (!filter || !staticFilteringEngine) return { result: [] };
            return { result: [] };
        }
        case 'cfeDump': {
            if (cosmeticFilteringEngine) {
                return { dump: 'Cosmetic filtering engine state not available' };
            }
            return { dump: 'No engine' };
        }
        case 'dashboardConfig': {
            const noDashboard = popupState.noDashboard === true;
            return {
                defaultURL: '/dashboard.html',
                noDashboardURL: '/no-dashboard.html',
                noDashboard,
            };
        }
        case 'getRules': {
            const stored = await chrome.storage.local.get('dynamicRules');
            const storedFirewall = await chrome.storage.local.get('permanentFirewall');
            const storedSwitches = await chrome.storage.local.get('permanentSwitches');
            const storedSession = await chrome.storage.local.get('sessionFirewall');
            
            let urlFilters: any[] = [];
            const permanentURLFiltering = (globalThis as any).vAPI?.permanentURLFiltering;
            if (permanentURLFiltering?.toArray) {
                try {
                    urlFilters = permanentURLFiltering.toArray();
                } catch (e) {}
            }
            if (urlFilters.length === 0) {
                const storedURLFilters = await chrome.storage.local.get('permanentURLFiltering');
                urlFilters = storedURLFilters?.permanentURLFiltering || [];
            }
            
            let pslSelfieValue: string | null = null;
            if (publicSuffixList?.toSelfie) {
                try {
                    pslSelfieValue = publicSuffixList.toSelfie();
                } catch (e) {}
            }
            
            return {
                dynamicRules: stored?.dynamicRules || [],
                firewall: storedFirewall?.permanentFirewall || [],
                switches: storedSwitches?.permanentSwitches || [],
                urlFilters,
                sessionFirewall: storedSession?.sessionFirewall || [],
                pslSelfie: pslSelfieValue,
            };
        }
        case 'modifyRuleset': {
            const { type, action, raw, rule } = request;
            
            if (cosmeticFilteringEngine?.removeFromSelectorCache) {
                cosmeticFilteringEngine.removeFromSelectorCache('*');
            }
            
            if (type === 'user' && raw) {
                const stored = await chrome.storage.local.get('userRules');
                const existingRules = stored?.userRules || [];
                if (action === 'remove') {
                    const index = existingRules.indexOf(raw);
                    if (index > -1) existingRules.splice(index, 1);
                } else {
                    existingRules.push(raw);
                }
                await chrome.storage.local.set({ userRules: existingRules });
            }
            
            if (type === 'firewall' && rule) {
                const stored = await chrome.storage.local.get('permanentFirewall');
                const rules = stored?.permanentFirewall || [];
                if (action === 'remove') {
                    const index = rules.findIndex((r: any) => r.src === rule.src && r.dest === rule.dest && r.type === rule.type);
                    if (index > -1) rules.splice(index, 1);
                } else {
                    rules.push(rule);
                }
                await chrome.storage.local.set({ permanentFirewall: rules });
            }
            
            if (type === 'switch' && rule) {
                const stored = await chrome.storage.local.get('permanentSwitches');
                const rules = stored?.permanentSwitches || [];
                if (action === 'remove') {
                    const index = rules.findIndex((r: any) => r.hostname === rule.hostname && r.switch === rule.switch);
                    if (index > -1) rules.splice(index, 1);
                } else {
                    rules.push(rule);
                }
                await chrome.storage.local.set({ permanentSwitches: rules });
            }
            
            if (type === 'urlRuleset' && rule) {
                const stored = await chrome.storage.local.get('permanentURLFiltering');
                const rules = stored?.permanentURLFiltering || [];
                if (action === 'remove') {
                    const index = rules.findIndex((r: any) => r.urlPattern === rule.urlPattern);
                    if (index > -1) rules.splice(index, 1);
                } else {
                    rules.push(rule);
                }
                await chrome.storage.local.set({ permanentURLFiltering: rules });
            }
            
            return { success: true };
        }
        case 'listsUpdateNow': {
            const assetKeys = request.assetKeys as string[];
            const preferOrigin = request.preferOrigin as boolean;
            if (assetKeys && assetKeys.length > 0) {
                await updateFilterListsNow({ assetKeys, preferOrigin });
            }
            return { success: true };
        }
        case 'supportUpdateNow': {
            try {
                const stored = await chrome.storage.local.get('selectedFilterLists');
                const lists = stored?.selectedFilterLists || [];
                if (!lists.includes('support')) {
                    lists.push('support');
                    await chrome.storage.local.set({ selectedFilterLists: lists });
                }
                await updateFilterListsNow({ assetKeys: ['support'] });
            } catch (e) {
                console.log('[MV3] supportUpdateNow error:', e);
            }
            return { success: true };
        }
        case 'readHiddenSettings': {
            const stored = await chrome.storage.local.get('hiddenSettings');
            const storedAdmin = await chrome.storage.local.get('adminHiddenSettings');
            const current = stored?.hiddenSettings || {};
            const admin = storedAdmin?.adminHiddenSettings || {};
            
            const defaults: Record<string, unknown> = {
                benchmarkDatasetURL: 'unset',
                debugScriptlet: false,
                profiler: false,
            };
            
            return {
                defaults,
                admin,
                current,
            };
        }
        case 'writeHiddenSettings': {
            const content = request.content as string;
            const hiddenSettings = request.hiddenSettings as Record<string, unknown> | undefined;
            
            let parsedSettings: Record<string, unknown> = {};
            
            if (typeof content === 'string' && content.trim() !== '') {
                try {
                    parsedSettings = JSON.parse(content);
                } catch {
                    const pairs = content.split('\n').filter(p => p.includes('='));
                    for (const pair of pairs) {
                        const [key, ...valueParts] = pair.split('=');
                        if (key && valueParts.length > 0) {
                            let value: unknown = valueParts.join('=').trim();
                            if (value === 'true') value = true;
                            else if (value === 'false') value = false;
                            parsedSettings[key.trim()] = value;
                        }
                    }
                }
            } else if (hiddenSettings) {
                parsedSettings = hiddenSettings;
            }
            
            if (Object.keys(parsedSettings).length > 0) {
                const stored = await chrome.storage.local.get('hiddenSettings');
                const existing = stored?.hiddenSettings || {};
                
                const updated = { ...existing };
                for (const [key, value] of Object.entries(parsedSettings)) {
                    if (value !== undefined) {
                        updated[key] = value;
                    }
                }
                
                await chrome.storage.local.set({ hiddenSettings: updated });
            }
            return { success: true };
        }
        case 'getAutoCompleteDetails': {
            const stored = await chrome.storage.local.get('userFilters');
            const userFilters = stored?.userFilters || '';
            const lines = userFilters.split('\n').filter(line => line.trim() !== '');
            
            const redirectResources: string[] = [];
            try {
                const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
                if (redirectEngine?.getResourceDetails) {
                    const details = redirectEngine.getResourceDetails();
                    redirectResources.push(...Object.keys(details));
                } else if (redirectEngine?.resources) {
                    redirectResources.push(...redirectEngine.resources);
                }
            } catch (e) {}
            
            const originHintsSet = new Set<string>([
                '127.0.0.1',
                'localhost',
                'chrome-extension:',
                'chrome:',
                'about:',
            ]);
            
            try {
                const tabs = await chrome.tabs.query({});
                for (const tab of tabs) {
                    if (tab?.url) {
                        try {
                            const url = new URL(tab.url);
                            if (url.hostname) {
                                originHintsSet.add(url.hostname);
                            }
                            if (url.origin) {
                                originHintsSet.add(url.origin);
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            
            return {
                filterCount: lines.length,
                filterCharCount: userFilters.length,
                filterParts: lines.filter(l => !l.startsWith('!') && !l.startsWith('#')),
                filterRegexes: lines.filter(l => l.includes(' regexp')),
                whitelistParts: lines.filter(l => l.startsWith('@@')),
                needCommit: false,
                originHints: Array.from(originHintsSet),
                redirectResources,
                preparseDirectiveHints: ['|', '||', '|https:', '|http:', '^', '*', '~'],
                preparseDirectiveEnv: {
                    flavor: 'chromium',
                    hasWebSocket: true,
                },
                hintUpdateToken: Date.now().toString(36),
            };
        }
        case 'getSupportData': {
            const userSettings = await chrome.storage.local.get('userSettings');
            const selectedLists = await chrome.storage.local.get('selectedFilterLists');
            const filterLists = await chrome.storage.local.get('filterLists');
            const hiddenSettings = await chrome.storage.local.get('hiddenSettings');
            
            const manifest = chrome.runtime.getManifest();
            
            let filterCount = 0;
            let cosmeticFilterCount = 0;
            try {
                const stored = await chrome.storage.local.get('cosmeticFiltersData');
                const data = parseStoredCosmeticFilterData(stored.cosmeticFiltersData);
                cosmeticFilterCount = (data.genericCosmeticFilters?.length || 0) + (data.specificCosmeticFilters?.length || 0);
            } catch (e) {}
            
            return {
                userSettings: userSettings?.userSettings || {},
                selectedFilterLists: selectedLists?.selectedFilterLists || [],
                filterLists: filterLists?.filterLists || {},
                hiddenSettings: hiddenSettings?.hiddenSettings || {},
                version: manifest?.version || '1.0.0',
                platform: 'chrome',
                filterCount,
                cosmeticFilterCount,
            };
        }
        default:
            return undefined;
        }
    };

    return { handleDashboardMessage };
};
