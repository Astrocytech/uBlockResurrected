/*******************************************************************************

    uBlock Origin - MV3 Dashboard Message Handler
    https://github.com/gorhill/uBlock

    Handles the large dashboard message switch with injected dependencies so
    sw-entry.ts can remain focused on orchestration.

*******************************************************************************/

import {
    getFilterListState,
    applyFilterListSelection,
    FILTER_LIST_USER_PATH,
} from './sw-policies.js';

const MV3_HIDDEN_SETTINGS_DEFAULTS = {
    allowGenericProceduralFilters: false,
    assetFetchTimeout: 30,
    autoCommentFilterTemplate: '{{date}} {{origin}}',
    autoUpdateAssetFetchPeriod: 5,
    autoUpdateDelayAfterLaunch: 37,
    autoUpdatePeriod: 1,
    benchmarkDatasetURL: 'unset',
    blockingProfiles: '11111/#F00 11010/#C0F 11001/#00F 00001',
    cacheStorageCompression: true,
    cacheStorageCompressionThreshold: 65536,
    cacheStorageMultithread: 2,
    cacheControlForFirefox1376932: 'unset',
    cloudStorageCompression: true,
    cnameIgnoreList: 'unset',
    cnameIgnore1stParty: true,
    cnameIgnoreExceptions: true,
    cnameIgnoreRootDocument: true,
    cnameReplayFullURL: false,
    consoleLogLevel: 'unset',
    debugAssetsJson: false,
    debugScriptlets: false,
    debugScriptletInjector: false,
    differentialUpdate: true,
    disableWebAssembly: false,
    dnsCacheTTL: 600,
    dnsResolveEnabled: true,
    extensionUpdateForceReload: false,
    filterAuthorMode: false,
    loggerPopupType: 'popup',
    manualUpdateAssetFetchPeriod: 500,
    modifyWebextFlavor: 'unset',
    noScriptingCSP: 'script-src http: https:',
    popupFontSize: 'unset',
    popupPanelDisabledSections: 0,
    popupPanelHeightMode: 0,
    popupPanelLockedSections: 0,
    popupPanelOrientation: 'unset',
    requestJournalProcessPeriod: 1000,
    requestStatsDisabled: false,
    selfieDelayInSeconds: 53,
    strictBlockingBypassDuration: 120,
    toolbarWarningTimeout: 60,
    trustedListPrefixes: 'ublock-',
    uiPopupConfig: 'unset',
    uiStyles: 'unset',
    updateAssetBypassBrowserCache: false,
    userResourcesLocation: 'unset',
};

const coerceHiddenSettingValue = (raw: string): unknown => {
    if ( raw === 'true' ) { return true; }
    if ( raw === 'false' ) { return false; }
    if ( raw === 'null' ) { return null; }
    if ( /^-?\d+(?:\.\d+)?$/.test(raw) ) {
        return Number(raw);
    }
    return raw;
};

type DashboardRequest = {
    what: string;
    [key: string]: any;
};

type EngineState = {
    logger: any;
    µb: any;
    cosmeticFilteringEngine: any;
    staticFilteringEngine: any;
    staticFilteringReverseLookup: any;
    publicSuffixList: any;
    redirectEngine: any;
};

export type DashboardMessageHandlerDeps = {
    popupState: any;
    ensurePopupState: () => Promise<void>;
    setUserSetting: (request: DashboardRequest) => Promise<any>;
    getLocalData: () => Promise<any>;
    backupUserData: () => Promise<void>;
    restoreUserData: (request: { userData?: unknown; file?: string }) => Promise<void>;
    resetUserData: () => Promise<void>;
    getDeviceName: () => Promise<string>;
    encodeCloudData: (data: any) => Promise<string>;
    decodeCloudData: (encoded: string) => Promise<any>;
    getPopupData: (request: DashboardRequest) => Promise<any>;
    updateToolbarIcon: (tabId: number, options: { filtering?: boolean }) => Promise<void>;
    reloadAllFilterLists: () => Promise<any>;
    updateFilterListsNow: (request?: { assetKeys?: string[]; preferOrigin?: boolean }) => Promise<any>;
    syncPowerSwitchDnrRules: () => Promise<void>;
    findFilterListFromNetFilter: (rawFilter: string) => Promise<any[]>;
    findFilterListFromCosmeticFilter: (rawFilter: string) => Promise<any[]>;
    parseStoredCosmeticFilterData: (data: any) => any;
    elementPickerExec: (tabId: number, frameId: number, target?: string, zap?: boolean) => Promise<any>;
    getEngineState: () => EngineState;
};

export const createDashboardMessageHandler = (deps: DashboardMessageHandlerDeps) => {
    const {
        popupState,
        ensurePopupState,
        setUserSetting,
        getLocalData,
        backupUserData,
        restoreUserData,
        resetUserData,
        getDeviceName,
        encodeCloudData,
        decodeCloudData,
        getPopupData,
        updateToolbarIcon,
        reloadAllFilterLists,
        updateFilterListsNow,
        syncPowerSwitchDnrRules,
        findFilterListFromNetFilter,
        findFilterListFromCosmeticFilter,
        parseStoredCosmeticFilterData,
        elementPickerExec,
        getEngineState,
    } = deps;

    const waitForStoredUserFilters = async (expected: string) => {
        for ( let attempt = 0; attempt < 8; attempt += 1 ) {
            const stored = await chrome.storage.local.get([
                'userFilters',
                FILTER_LIST_USER_PATH,
            ]);
            const actual = typeof stored.userFilters === 'string'
                ? stored.userFilters
                : typeof stored[FILTER_LIST_USER_PATH] === 'string'
                    ? stored[FILTER_LIST_USER_PATH]
                    : '';
            if ( actual === expected ) {
                return;
            }
            await new Promise(resolve => self.setTimeout(resolve, 25));
        }
    };

    return async (request: DashboardRequest) => {
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
            return reloadAllFilterLists();
        case 'updateNow':
            return updateFilterListsNow();
        case 'listsUpdateNow':
            return updateFilterListsNow(request as { assetKeys?: string[]; preferOrigin?: boolean });
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
            const items = await chrome.storage.local.get([
                'userFilters',
                FILTER_LIST_USER_PATH,
            ]);
            const selectedLists = await chrome.storage.local.get('selectedFilterLists');
            const userSettingsStored = await chrome.storage.local.get('userSettings');
            const selected = Array.isArray(selectedLists?.selectedFilterLists)
                ? selectedLists.selectedFilterLists
                : [];
            const userSettings = userSettingsStored?.userSettings || popupState.userSettings || {};
            const content = typeof items.userFilters === 'string'
                ? items.userFilters
                : typeof items[FILTER_LIST_USER_PATH] === 'string'
                    ? items[FILTER_LIST_USER_PATH]
                    : '';
            let enabled = selected.includes(FILTER_LIST_USER_PATH);
            if ( enabled === false && content.trim() === '' ) {
                enabled = true;
                await chrome.storage.local.set({
                    selectedFilterLists: [ FILTER_LIST_USER_PATH, ...selected ],
                });
            }
            return {
                content,
                enabled,
                trusted: userSettings.userFiltersTrusted === true,
            };
        }
        case 'writeUserFilters': {
            const userFilters = (request.content ?? request.userFilters) as string;
            const enabled = request.enabled as boolean;
            const trusted = request.trusted === true;
            if ( typeof userFilters === 'string' ) {
                const maxFilterSize = 10 * 1024 * 1024;
                if ( userFilters.length > maxFilterSize ) {
                    return { success: false, error: 'Filter size exceeds limit' };
                }
                const selectedStored = await chrome.storage.local.get('selectedFilterLists');
                const selected = new Set(
                    Array.isArray(selectedStored?.selectedFilterLists)
                        ? selectedStored.selectedFilterLists
                        : []
                );
                if ( enabled ) {
                    selected.add(FILTER_LIST_USER_PATH);
                } else {
                    selected.delete(FILTER_LIST_USER_PATH);
                }
                const userSettingsStored = await chrome.storage.local.get('userSettings');
                const nextUserSettings = {
                    ...(popupState.userSettings || {}),
                    ...(userSettingsStored?.userSettings || {}),
                    userFiltersTrusted: trusted,
                };
                popupState.userSettings = nextUserSettings;
                await chrome.storage.local.set({
                    userFilters,
                    [FILTER_LIST_USER_PATH]: userFilters,
                    selectedFilterLists: Array.from(selected),
                    userSettings: nextUserSettings,
                });
                await waitForStoredUserFilters(userFilters);
                await reloadAllFilterLists();
                return { success: true };
            }
            return { success: false, error: 'Invalid userFilters' };
        }
        case 'cloudGetOptions': {
            const stored = await chrome.storage.local.get('cloudOptions');
            const userSettings = (await chrome.storage.local.get('userSettings')).userSettings || {};
            const options = stored?.cloudOptions || {};
            const deviceName = options.deviceName || await getDeviceName();
            return {
                deviceName,
                syncEnabled: options.syncEnabled !== false,
                enabled: userSettings.cloudStorageEnabled === true,
                cloudStorageSupported: typeof chrome.storage.sync !== 'undefined',
            };
        }
        case 'cloudSetOptions': {
            const options = request as { deviceName?: string; syncEnabled?: boolean };
            const stored = await chrome.storage.local.get('cloudOptions');
            const existing = stored?.cloudOptions || {};
            if ( typeof options.deviceName === 'string' ) {
                existing.deviceName = options.deviceName;
            }
            if ( typeof options.syncEnabled === 'boolean' ) {
                existing.syncEnabled = options.syncEnabled;
            }
            await chrome.storage.local.set({ cloudOptions: existing });
            return { success: true };
        }
        case 'cloudPull': {
            const useSync = typeof chrome.storage.sync !== 'undefined';
            const cloudKey = 'cloudData';
            const stored = useSync ? await chrome.storage.sync.get(cloudKey) : await chrome.storage.local.get(cloudKey);
            const cloudData = stored?.[cloudKey];
            if ( !cloudData ) {
                return { error: 'No cloud data' };
            }
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
            if ( !cloudData ) {
                return { error: 'No data to push' };
            }
            try {
                const dataToPush = {
                    ...cloudData,
                    serverTime: Date.now(),
                    clientTime: Date.now(),
                };
                const encoded = await encodeCloudData(dataToPush);
                const useSync = typeof chrome.storage.sync !== 'undefined';
                if ( useSync ) {
                    await chrome.storage.sync.set({ cloudData: encoded });
                } else {
                    await chrome.storage.local.set({ cloudData: encoded });
                }
                const storageUsed = useSync
                    ? await chrome.storage.sync.getBytesInUse()
                    : await chrome.storage.local.getBytesInUse();
                if ( useSync ) {
                    await chrome.storage.sync.set({ cloudStorageUsed: storageUsed, lastCloudSync: Date.now() });
                } else {
                    await chrome.storage.local.set({ cloudStorageUsed: storageUsed, lastCloudSync: Date.now() });
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
            const cloudData = useSync
                ? await chrome.storage.sync.get('cloudData')
                : await chrome.storage.local.get('cloudData');
            const cloudSize = cloudData?.cloudData ? JSON.stringify(cloudData.cloudData).length : 0;
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
            const { µb } = getEngineState();
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
        case 'getTrustedScriptletTokens':
            return getEngineState().redirectEngine?.getTrustedScriptletTokens?.() || [];
        case 'getWhitelist': {
            const { µb } = getEngineState();
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
            const { µb } = getEngineState();
            const whitelist = request.whitelist as string;
            if ( typeof whitelist === 'string' && whitelist.length > 0 ) {
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
            if ( typeof target !== 'string' || target === '' ) {
                return [];
            }
            const domains: string[] = [];
            const extractDomain = (hostname: string): string | null => {
                if ( !hostname ) {
                    return null;
                }
                const parts = hostname.split('.');
                return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
            };
            try {
                if ( target.includes('/') || target.includes(':') ) {
                    const url = new URL(target);
                    const domain = extractDomain(url.hostname);
                    if ( domain ) {
                        domains.push(domain);
                    }
                } else {
                    const domain = extractDomain(target);
                    if ( domain ) {
                        domains.push(domain);
                    }
                }
            } catch {
                const domain = extractDomain(target);
                if ( domain ) {
                    domains.push(domain);
                }
            }
            return domains;
        }
        case 'getCollapsibleBlockedRequests': {
            const tabId = request.tabId as number;
            if ( typeof tabId !== 'number' ) {
                return { requests: [] };
            }
            try {
                return await chrome.tabs.sendMessage(tabId, { what: 'getCollapsibleBlockedRequests' }) || { requests: [] };
            } catch {
                return { requests: [] };
            }
        }
        case 'hasPopupContentChanged': {
            const tabId = request.tabId as number;
            const contentLastModified = request.contentLastModified as number;
            if ( typeof tabId !== 'number' ) {
                return { changed: false };
            }
            const stored = await chrome.storage.local.get('popupContentVersions');
            const versions = stored?.popupContentVersions || {};
            const storedVersion = versions[tabId] || 0;
            const changed = storedVersion !== 0 && storedVersion !== contentLastModified;
            if ( changed || storedVersion === 0 ) {
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
                } catch {}
            }
            return { success: true };
        }
        case 'hasInMemoryFilter': {
            const tabId = request.tabId as number;
            if ( typeof tabId === 'number' ) {
                try {
                    return await chrome.tabs.sendMessage(tabId, { what: 'hasInMemoryFilter' }) || { hasFilter: false };
                } catch {
                    return { hasFilter: false };
                }
            }
            return { hasFilter: false };
        }
        case 'readAll': {
            const ownerId = request.ownerId as number;
            if ( getEngineState().logger?.ownerId !== undefined && getEngineState().logger?.ownerId !== ownerId ) {
                return { unavailable: true };
            }
            try {
                return await chrome.storage.local.get(null);
            } catch (e) {
                return { error: (e as Error).message };
            }
        }
        case 'toggleNetFiltering': {
            const { url, scope, state, tabId } = request;
            if ( !url || !tabId ) {
                return getPopupData(request);
            }
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
            await chrome.storage.local.set({ perSiteFiltering });
            await syncPowerSwitchDnrRules();
            if ( tabId ) {
                try {
                    const result = chrome.tabs.sendMessage(tabId, {
                        topic: 'uBlockPowerSwitch',
                        payload: { enabled: state === true },
                    }) as Promise<unknown> | undefined;
                    result?.catch(() => {});
                } catch {}
            }
            return getPopupData(request);
        }
        case 'reloadTab': {
            const { tabId, bypassCache, url } = request;
            if ( tabId ) {
                if ( typeof url === 'string' && url !== '' ) {
                    chrome.tabs.get(tabId, (tab) => {
                        if ( tab?.url && tab.url !== url ) {
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
            if ( typeof tabId === 'number' ) {
                const vAPINet = (globalThis as any).vAPI?.net;
                vAPINet?.removeUnprocessedRequest?.(tabId);
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
            if ( tabId && pageURL ) {
                const stored = await chrome.storage.local.get('popupStats');
                const stats = stored?.popupStats?.[tabId] || {};
                const filterLists = (await chrome.storage.local.get('filterLists')).filterLists || {};
                const selectedLists = (await chrome.storage.local.get('selectedFilterLists')).selectedFilterLists || [];
                const updateAges: Record<string, number> = {};
                for ( const listKey of selectedLists ) {
                    const list = filterLists[listKey];
                    if ( list?.lastFetchTime ) {
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
            if ( !url ) {
                return { success: false };
            }
            const createProps: chrome.tabs.CreateProperties = { url, active: select !== false };
            if ( typeof index === 'number' ) {
                createProps.index = index;
            }
            if ( shiftKey ) {
                createProps.active = false;
            }
            if ( newTab ) {
                const created = await chrome.tabs.create(createProps);
                return { tabId: created.id };
            }
            if ( targetTabId ) {
                await chrome.tabs.update(targetTabId, { url, active: true });
                return { tabId: targetTabId };
            }
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if ( tabs[0]?.id ) {
                await chrome.tabs.update(tabs[0].id, { url, active: true });
                return { tabId: tabs[0].id };
            }
            return { success: false };
        }
        case 'getAssetContent': {
            const url = request.url as string;
            if ( !url ) {
                return { error: 'No URL provided' };
            }
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
            if ( !rawFilter ) {
                return { notFound: true };
            }
            const reverseLookup = getEngineState().staticFilteringReverseLookup;
            if ( reverseLookup ) {
                try {
                    return await reverseLookup.fromNetFilter(rawFilter);
                } catch {
                    return { notFound: true };
                }
            }
            const results = await findFilterListFromNetFilter(rawFilter);
            return results.length > 0 ? { [rawFilter]: results } : { notFound: true };
        }
        case 'listsFromCosmeticFilter': {
            const rawFilter = request.rawFilter as string;
            if ( !rawFilter ) {
                return { notFound: true };
            }
            const reverseLookup = getEngineState().staticFilteringReverseLookup;
            if ( reverseLookup ) {
                try {
                    return await reverseLookup.fromExtendedFilter({ rawFilter });
                } catch {
                    return { notFound: true };
                }
            }
            const results = await findFilterListFromCosmeticFilter(rawFilter);
            return results.length > 0 ? { [rawFilter]: results } : { notFound: true };
        }
        case 'scriptlet': {
            const tabId = request.tabId as number;
            const scriptletName = request.scriptlet as string;
            if ( tabId && scriptletName ) {
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
        case 'loggerDisabled':
            return getEngineState().logger?.enabled !== true;
        case 'launchElementPicker': {
            const tabId = request.tabId as number;
            const target = request.target as string;
            const zap = request.zap as boolean;
            if ( tabId ) {
                await elementPickerExec(tabId, 0, target, zap);
            }
            return { success: true };
        }
        case 'snfeBenchmark':
        case 'cfeBenchmark':
        case 'sfeBenchmark':
            return { result: 'Benchmark not implemented in MV3' };
        case 'snfeToDNR':
            return { success: true, message: 'Static network filters already use DNR in MV3' };
        case 'snfeDump':
            return { dump: getEngineState().staticFilteringEngine ? 'Static filtering engine state not available' : 'No engine' };
        case 'snfeQuery': {
            const filter = request.filter as string;
            if ( !filter || !getEngineState().staticFilteringEngine ) {
                return { result: [] };
            }
            return { result: [] };
        }
        case 'cfeDump':
            return { dump: getEngineState().cosmeticFilteringEngine ? 'Cosmetic filtering engine state not available' : 'No engine' };
        case 'readyToFilter':
            await ensurePopupState();
            return true;
        case 'dashboardConfig':
            return {
                defaultURL: '/dashboard.html',
                noDashboardURL: '/no-dashboard.html',
                noDashboard: popupState.noDashboard === true,
            };
        case 'getRules': {
            const stored = await chrome.storage.local.get('dynamicRules');
            const storedFirewall = await chrome.storage.local.get('permanentFirewall');
            const storedSwitches = await chrome.storage.local.get('permanentSwitches');
            const storedSession = await chrome.storage.local.get('sessionFirewall');
            let urlFilters: any[] = [];
            const permanentURLFiltering = (globalThis as any).vAPI?.permanentURLFiltering;
            if ( permanentURLFiltering?.toArray ) {
                try {
                    urlFilters = permanentURLFiltering.toArray();
                } catch {}
            }
            if ( urlFilters.length === 0 ) {
                const storedURLFilters = await chrome.storage.local.get('permanentURLFiltering');
                urlFilters = storedURLFilters?.permanentURLFiltering || [];
            }
            let pslSelfieValue: string | null = null;
            if ( getEngineState().publicSuffixList?.toSelfie ) {
                try {
                    pslSelfieValue = getEngineState().publicSuffixList.toSelfie();
                } catch {}
            }
            return {
                dynamicRules: stored?.dynamicRules || [],
                permanentRules: storedFirewall?.permanentFirewall || [],
                sessionRules: storedSession?.sessionFirewall || [],
                firewall: storedFirewall?.permanentFirewall || [],
                switches: storedSwitches?.permanentSwitches || [],
                urlFilters,
                sessionFirewall: storedSession?.sessionFirewall || [],
                pslSelfie: pslSelfieValue,
            };
        }
        case 'modifyRuleset': {
            const { type, action, raw, rule } = request;
            getEngineState().cosmeticFilteringEngine?.removeFromSelectorCache?.('*');
            if ( type === 'user' && raw ) {
                const stored = await chrome.storage.local.get('userRules');
                const existingRules = stored?.userRules || [];
                if ( action === 'remove' ) {
                    const index = existingRules.indexOf(raw);
                    if ( index > -1 ) {
                        existingRules.splice(index, 1);
                    }
                } else {
                    existingRules.push(raw);
                }
                await chrome.storage.local.set({ userRules: existingRules });
            }
            if ( type === 'firewall' && rule ) {
                const stored = await chrome.storage.local.get('permanentFirewall');
                const rules = stored?.permanentFirewall || [];
                if ( action === 'remove' ) {
                    const index = rules.findIndex((r: any) => r.src === rule.src && r.dest === rule.dest && r.type === rule.type);
                    if ( index > -1 ) {
                        rules.splice(index, 1);
                    }
                } else {
                    rules.push(rule);
                }
                await chrome.storage.local.set({ permanentFirewall: rules });
            }
            if ( type === 'switch' && rule ) {
                const stored = await chrome.storage.local.get('permanentSwitches');
                const rules = stored?.permanentSwitches || [];
                if ( action === 'remove' ) {
                    const index = rules.findIndex((r: any) => r.hostname === rule.hostname && r.switch === rule.switch);
                    if ( index > -1 ) {
                        rules.splice(index, 1);
                    }
                } else {
                    rules.push(rule);
                }
                await chrome.storage.local.set({ permanentSwitches: rules });
            }
            if ( type === 'urlRuleset' && rule ) {
                const stored = await chrome.storage.local.get('permanentURLFiltering');
                const rules = stored?.permanentURLFiltering || [];
                if ( action === 'remove' ) {
                    const index = rules.findIndex((r: any) => r.urlPattern === rule.urlPattern);
                    if ( index > -1 ) {
                        rules.splice(index, 1);
                    }
                } else {
                    rules.push(rule);
                }
                await chrome.storage.local.set({ permanentURLFiltering: rules });
            }
            return { success: true };
        }
        case 'supportUpdateNow': {
            try {
                const assetKeys = Array.isArray(request.assetKeys)
                    ? request.assetKeys.filter((key): key is string => typeof key === 'string' && key !== '')
                    : [];
                await updateFilterListsNow({
                    assetKeys,
                    preferOrigin: true,
                });
            } catch (e) {
                console.log('[MV3] supportUpdateNow error:', e);
            }
            return { success: true };
        }
        case 'readHiddenSettings': {
            const stored = await chrome.storage.local.get('hiddenSettings');
            const storedAdmin = await chrome.storage.local.get('adminHiddenSettings');
            const current = {
                ...MV3_HIDDEN_SETTINGS_DEFAULTS,
                ...(stored?.hiddenSettings || {}),
            };
            return {
                default: MV3_HIDDEN_SETTINGS_DEFAULTS,
                admin: storedAdmin?.adminHiddenSettings || {},
                current,
            };
        }
        case 'writeHiddenSettings': {
            const content = request.content as string;
            const hiddenSettings = request.hiddenSettings as Record<string, unknown> | undefined;
            let parsedSettings: Record<string, unknown> = {};
            if ( typeof content === 'string' && content.trim() !== '' ) {
                try {
                    parsedSettings = JSON.parse(content);
                } catch {
                    const lines = content.split(/\r?\n/);
                    for ( const rawLine of lines ) {
                        const line = rawLine.trim();
                        if ( line === '' ) { continue; }
                        const pos = line.indexOf(' ');
                        const key = pos === -1 ? line : line.slice(0, pos).trim();
                        const value = pos === -1 ? '' : line.slice(pos + 1).trim();
                        if ( key === '' ) { continue; }
                        parsedSettings[key] = coerceHiddenSettingValue(value);
                    }
                }
            } else if ( hiddenSettings ) {
                parsedSettings = hiddenSettings;
            }
            if ( Object.keys(parsedSettings).length > 0 ) {
                const stored = await chrome.storage.local.get('hiddenSettings');
                const existing = stored?.hiddenSettings || {};
                const updated = { ...existing };
                for ( const [ key, value ] of Object.entries(parsedSettings) ) {
                    if ( value !== undefined ) {
                        updated[key] = value;
                    }
                }
                await chrome.storage.local.set({ hiddenSettings: updated });
            }
            return { success: true };
        }
        case 'getAutoCompleteDetails': {
            const stored = await chrome.storage.local.get([
                'userFilters',
                FILTER_LIST_USER_PATH,
            ]);
            const userFilters = typeof stored?.userFilters === 'string'
                ? stored.userFilters
                : typeof stored?.[FILTER_LIST_USER_PATH] === 'string'
                    ? stored[FILTER_LIST_USER_PATH]
                    : '';
            const lines = userFilters.split('\n').filter(line => line.trim() !== '');
            const redirectResources: string[] = [];
            try {
                const redirectEngine = getEngineState().redirectEngine;
                if ( redirectEngine?.getResourceDetails ) {
                    const details = redirectEngine.getResourceDetails();
                    redirectResources.push(...Object.keys(details));
                } else if ( redirectEngine?.resources ) {
                    redirectResources.push(...redirectEngine.resources);
                }
            } catch {}
            const originHintsSet = new Set<string>(['127.0.0.1', 'localhost', 'chrome-extension:', 'chrome:', 'about:']);
            try {
                const tabs = await chrome.tabs.query({});
                for ( const tab of tabs ) {
                    if ( tab?.url ) {
                        try {
                            const url = new URL(tab.url);
                            if ( url.hostname ) originHintsSet.add(url.hostname);
                            if ( url.origin ) originHintsSet.add(url.origin);
                        } catch {}
                    }
                }
            } catch {}
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
                preparseDirectiveEnv: { flavor: 'chromium', hasWebSocket: true },
                hintUpdateToken: Date.now().toString(36),
            };
        }
        case 'getSupportData': {
            const userSettings = await chrome.storage.local.get('userSettings');
            const selectedLists = await chrome.storage.local.get('selectedFilterLists');
            const filterLists = await chrome.storage.local.get('filterLists');
            const hiddenSettings = await chrome.storage.local.get('hiddenSettings');
            const manifest = chrome.runtime.getManifest();
            const availableFilterLists = await chrome.storage.local.get('availableFilterLists');
            const userFilters = await chrome.storage.local.get([
                'userFilters',
                FILTER_LIST_USER_PATH,
            ]);
            let cosmeticFilterCount = 0;
            try {
                const stored = await chrome.storage.local.get('cosmeticFiltersData');
                const data = parseStoredCosmeticFilterData(stored.cosmeticFiltersData);
                cosmeticFilterCount = (data.genericCosmeticFilters?.length || 0) + (data.specificCosmeticFilters?.length || 0);
            } catch {}
            const userFilterText = typeof userFilters?.userFilters === 'string'
                ? userFilters.userFilters
                : typeof userFilters?.[FILTER_LIST_USER_PATH] === 'string'
                    ? userFilters[FILTER_LIST_USER_PATH]
                    : '';
            const filterset = userFilterText
                .split(/\s*\n+\s*/)
                .filter(line => line !== '' && /^![^#]/.test(line) === false);
            const currentLists = filterLists?.filterLists || availableFilterLists?.availableFilterLists || {};
            const enabledListset: Record<string, string | null> = {};
            for ( const key of selectedLists?.selectedFilterLists || [] ) {
                enabledListset[key] = null;
            }
            return {
                [manifest?.name || 'uBlock Resurrected']: manifest?.version || '1.0.0',
                userSettings: userSettings?.userSettings || {},
                selectedFilterLists: selectedLists?.selectedFilterLists || [],
                filterLists: currentLists,
                listset: enabledListset,
                'filterset (user)': filterset,
                hiddenSettings: {
                    ...MV3_HIDDEN_SETTINGS_DEFAULTS,
                    ...(hiddenSettings?.hiddenSettings || {}),
                },
                version: manifest?.version || '1.0.0',
                platform: 'chrome',
                filterCount: 0,
                cosmeticFilterCount,
            };
        }
        default:
            return undefined;
        }
    };
};
