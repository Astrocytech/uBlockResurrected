/*******************************************************************************

    uBlock Origin - MV3 Service Worker Entry Point
    https://github.com/gorhill/uBlock

    This is the main entry point for the MV3 service worker. It coordinates
    all background tasks including messaging, element picker/zapper, and
    DNR rule management.

******************************************************************************/

import {
    createCounts,
    isIPAddress,
    domainFromHostname,
    formatCount,
    dateNowToSensibleString,
    adjustColor,
    decomposeHostname,
    isThirdParty,
    delay,
    mergeCounts,
    cloneHostnameDetails,
    zeroHostnameDetails,
    getActiveTab,
    getTabForRequest,
    isOwnExtensionTab,
    pickMostRelevantBrowsingTab,
    updateToolbarIcon,
    normalizeListEntries,
    parseStoredCosmeticFilterData,
    buildSpecificCosmeticPayload,
    getHiddenElementCountForTab,
    cloudPush,
    cloudPull,
    getDeviceName,
    encodeCloudData,
    decodeCloudData,
    pickerContextPoints,
    pickerContextPointKey,
    getPickerContextPoint,
} from './sw-helpers.js';

import {
    initContextMenu,
} from './sw-context-menu.js';

import {
    setEngineReferences as setSharedEngineReferences,
} from './sw-engine-references.js';

import {
    legacyBackendState,
    epickerArgs,
    getLegacyMessaging,
    broadcastFilteringBehaviorChanged,
    broadcastFilteringBehaviorChangedToTabs,
    withDisabledRuntimeOnConnect,
} from './sw-messaging.js';

import {
    ensureTabRequestState,
    persistTabRequestState,
    loadTabRequestState,
    loadTabRequestStateWithRetry,
    clearTabRequestState,
    tabRequestStates,
    getTabRequestStateKey,
    incrementCounts,
} from './sw-request-tracking.js';

import {
    registerMessagingHandlers,
} from './sw-messaging-handlers.js';

import {
    FILTER_LIST_USER_PATH,
    FILTER_LIST_ASSETS_URL,
    getFilterListState,
    applyFilterListSelection,
    reloadAllFilterLists,
    updateFilterListsNow,
    syncFilterListDnrRules,
} from './sw-policies.js';

import {
    popupState,
    ensurePopupState,
    persistUserSettings,
    persistPermanentFirewall,
    persistPermanentHostnameSwitches,
    getLocalData,
    backupUserData,
    restoreUserData,
    resetUserData,
    cloneHostnameSwitchState,
    applyImmediateHostnameSwitchEffects,
} from './sw-storage.js';

import {
    modifyDashboardRuleset as modifyDashboardRulesetFromModule,
    resetDashboardRules as resetDashboardRulesFromModule,
} from './sw-initialization.js';

import {
    setUserSetting,
} from './sw-settings-handler.js';

import {
    createToggleHandlers,
} from './sw-toggle-handlers.js';

import {
    createMessageHandlers,
} from './sw-message-handlers.js';

import {
    createDashboardMessageHandler,
} from './sw-dashboard-message-handler.js';

import {
    createMessagingRouter,
} from './sw-message-router.js';

import {
    createZapper,
} from './sw-zapper.js';

import {
    createPicker,
} from './sw-picker.js';

import {
    pageStoreFromTabId,
    mustLookup,
    pageStores,
    pageStoresToken,
} from './sw-pagestore.js';

import {
    syncFirewallDnrRules,
    syncWhitelistDnrRules,
    syncPowerSwitchDnrRules,
    syncHostnameSwitchDnrRules,
    getFirewallRulesForPopup,
    firewallRuleTypes,
    firewallRuleResourceTypes,
    compileFirewallRulesToDnr,
} from './sw-firewall.js';

import {
    getTabSwitchMetrics,
    getHiddenElementCountForTab as getHiddenElementCountForTabFromModule,
    updateToolbarIcon as updateToolbarIconFromModule,
    updateBadge,
    persistGlobalRequestCounts,
} from './sw-tab-metrics.js';

import {
    recordTabRequest,
    trackPendingRequest,
    finalizeTrackedRequest,
    collectTabHostnameData,
    getMatchedBlockedRequestCountForTab,
} from './sw-request-handlers.js';

import type { LegacyMessagingAPI } from './sw-types.js';
import { userSettingsDefault, reWhitelistBadHostname, reWhitelistHostnameExtractor, hostnameSwitchNames, HOSTNAME_SWITCHES_SCHEMA_VERSION } from './sw-types.js';

type LegacyMessage = {
    channel?: string;
    msgId?: number;
    msg?: any;
};

type PopupRequest = {
    what: string;
    tabId?: number | null;
    name?: string;
    value?: any;
    hostname?: string;
    state?: boolean;
    srcHostname?: string;
    desHostname?: string;
    desHostnames?: Record<string, unknown>;
    requestType?: string;
    action?: number;
    persist?: boolean;
};

type FirewallCount = {
    any: number;
    frame: number;
    script: number;
};

type FirewallCounts = {
    allowed: FirewallCount;
    blocked: FirewallCount;
};

type HostnameDetails = {
    domain: string;
    counts: FirewallCounts;
    hasSubdomains?: boolean;
    hasScript?: boolean;
    hasFrame?: boolean;
    totals?: FirewallCounts;
};

type TabRequestState = {
    startedAt: number;
    pageHostname: string;
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

type PendingRequestInfo = {
    tabId: number;
    url: string;
    type: chrome.webRequest.ResourceType;
};

type TabSwitchMetrics = {
    popupBlockedCount: number;
    largeMediaCount: number;
    remoteFontCount: number;
    scriptCount: number;
};

type CollectedHostnameData = {
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

type HostnameSwitchState = Record<string, Partial<Record<string, boolean>>>;

type LegacyMessagingAPI = {
    ports: Map<string, any>;
    listeners: Map<string, { fn: (request: any, sender: any, callback: (response?: any) => void) => any; privileged?: boolean }>;
    defaultHandler: null | ((request: any, sender: any, callback: (response?: any) => void) => any);
    PRIVILEGED_ORIGIN: string;
    UNHANDLED: string;
    onFrameworkMessage?: (request: any, port: chrome.runtime.Port, callback: (response?: any) => void) => void;
    onPortDisconnect?: (port: chrome.runtime.Port) => void;
};

type LegacyPortDetails = {
    port: chrome.runtime.Port;
    frameId?: number;
    frameURL?: string;
    privileged: boolean;
    tabId?: number;
    tabURL?: string;
};

let cosmeticFilteringEngine: any = null;
let staticNetFilteringEngine: any = null;
let staticExtFilteringEngine: any = null;
let logger: any = null;
let pageStore: any = null;
let µb: any = null;
let filteringContext: any = null;
let filteringEngines: any = null;
let io: any = null;
let publicSuffixList: any = null;

const setEngineReferences = () => {
    const refs = setSharedEngineReferences();
    if ( refs == null ) { return; }
    cosmeticFilteringEngine = refs.cosmeticFilteringEngine;
    staticNetFilteringEngine = refs.staticNetFilteringEngine;
    staticExtFilteringEngine = refs.staticExtFilteringEngine;
    logger = refs.logger;
    µb = refs.µb;
    filteringContext = refs.filteringContext;
    filteringEngines = refs.filteringEngines;
    io = refs.io;
    publicSuffixList = refs.publicSuffixList;
};

// Duplicate variables/objects - now imported from sw-messaging.js and sw-helpers.js
// Duplicate variables removed - now imported from sw-types.js

// Element picker state
const epickerArgs = {
    target: '',
    mouse: '',
    zap: false,
    eprom: null as any,
};

const getLegacyMessaging = (): LegacyMessagingAPI | undefined => {
    return (globalThis as any).vAPI?.messaging;
};

// Duplicate functions removed - using imported versions from sw-messaging.ts

const ensureLegacyBackend = async (): Promise<void> => {
    if ( legacyBackendState.initialized ) { return; }
    if ( legacyBackendState.initializing ) { return legacyBackendState.initializing; }

    legacyBackendState.initializing = withDisabledRuntimeOnConnect(async () => {
        if ( typeof (globalThis as any).window === 'undefined' ) {
            (globalThis as any).window = globalThis;
        }
        const vAPI = ((globalThis as any).vAPI ||= {});
        if ( typeof (globalThis as any).window.vAPI === 'undefined' ) {
            (globalThis as any).window.vAPI = vAPI;
        }
        if ( typeof vAPI.T0 !== 'number' ) {
            vAPI.T0 = Date.now();
        }
        if ( typeof vAPI.sessionId !== 'string' ) {
            vAPI.sessionId = 'mv3-sw';
        }
        if ( typeof vAPI.getURL !== 'function' ) {
            vAPI.getURL = (path = '') => chrome.runtime.getURL(path);
        }
        if ( typeof vAPI.setTimeout !== 'function' ) {
            vAPI.setTimeout = globalThis.setTimeout.bind(globalThis);
        }
        if ( typeof vAPI.clearTimeout !== 'function' ) {
            vAPI.clearTimeout = globalThis.clearTimeout.bind(globalThis);
        }
        if ( typeof vAPI.localStorage !== 'object' || vAPI.localStorage === null ) {
            const storageMap = new Map<string, string>();
            vAPI.localStorage = {
                getItem(key: string) {
                    return Promise.resolve(storageMap.has(key) ? storageMap.get(key) : null);
                },
                setItem(key: string, value: string) {
                    storageMap.set(key, `${value}`);
                    return Promise.resolve();
                },
                removeItem(key: string) {
                    storageMap.delete(key);
                    return Promise.resolve();
                },
                clear() {
                    storageMap.clear();
                    return Promise.resolve();
                },
            };
        }
        if (
            typeof vAPI.webextFlavor !== 'object' ||
            vAPI.webextFlavor === null ||
            typeof vAPI.webextFlavor.soup?.has !== 'function'
        ) {
            vAPI.webextFlavor = {
                major: 120,
                env: [],
                soup: new Set([ 'chromium', 'mv3', 'ublock' ]),
            };
        } else {
            vAPI.webextFlavor.major ??= 120;
            vAPI.webextFlavor.env ??= [];
            if ( typeof vAPI.webextFlavor.soup?.add === 'function' ) {
                vAPI.webextFlavor.soup.add('chromium');
                vAPI.webextFlavor.soup.add('mv3');
                vAPI.webextFlavor.soup.add('ublock');
            }
        }
        if ( typeof (globalThis as any).screen === 'undefined' ) {
            (globalThis as any).screen = { width: 1280, height: 720 };
        }
        if ( typeof (globalThis as any).window.screen === 'undefined' ) {
            (globalThis as any).window.screen = (globalThis as any).screen;
        }
        if ( typeof (globalThis as any).document === 'undefined' ) {
            const noop = () => {};
            const nullFn = () => null;
            (globalThis as any).document = {
                body: null,
                head: null,
                documentElement: null,
                hidden: true,
                visibilityState: 'hidden',
                readyState: 'complete',
                addEventListener: noop,
                removeEventListener: noop,
                dispatchEvent: noop,
                createElement: () => ({
                    style: {},
                    setAttribute: noop,
                    removeAttribute: noop,
                    addEventListener: noop,
                    removeEventListener: noop,
                    appendChild: noop,
                    remove: noop,
                    classList: {
                        add: noop,
                        remove: noop,
                        contains: () => false,
                    },
                }),
                querySelector: nullFn,
                querySelectorAll: () => [],
                getElementById: nullFn,
            };
        }
        if ( typeof (globalThis as any).window.document === 'undefined' ) {
            (globalThis as any).window.document = (globalThis as any).document;
        }
        if ( typeof (globalThis as any).Image === 'undefined' ) {
            (globalThis as any).Image = class {
                onload: null | (() => void) = null;
                onerror: null | (() => void) = null;
                width = 0;
                height = 0;
                complete = false;
                private listeners = new Map<string, Set<() => void>>();
                addEventListener(type: string, listener: () => void) {
                    const bucket = this.listeners.get(type) || new Set<() => void>();
                    bucket.add(listener);
                    this.listeners.set(type, bucket);
                }
                removeEventListener(type: string, listener: () => void) {
                    this.listeners.get(type)?.delete(listener);
                }
                set src(_value: string) {
                    this.complete = true;
                    queueMicrotask(() => {
                        if ( typeof this.onload === 'function' ) {
                            this.onload();
                        }
                        for ( const listener of this.listeners.get('load') || [] ) {
                            listener();
                        }
                    });
                }
            };
        }
        await import('../start.ts');
        const backgroundModule = await import('../background.js');
        const legacyBackground = backgroundModule.default as { isReadyPromise?: Promise<unknown> };
        if ( legacyBackground?.isReadyPromise instanceof Promise ) {
            await legacyBackground.isReadyPromise.catch(() => {});
        }
        legacyBackendState.initialized = true;
        setEngineReferences();
    });

    try {
        await legacyBackendState.initializing;
    } finally {
        legacyBackendState.initializing = null;
    }
};

const registerLegacyPort = (port: chrome.runtime.Port): LegacyPortDetails | undefined => {
    const messaging = getLegacyMessaging();
    if ( messaging === undefined ) { return; }

    const sender = port.sender || {};
    const { origin, tab, url } = sender;
    const details: LegacyPortDetails = {
        port,
        frameId: sender.frameId,
        frameURL: url,
        privileged: origin !== undefined
            ? origin === messaging.PRIVILEGED_ORIGIN
            : typeof url === 'string' && url.startsWith(messaging.PRIVILEGED_ORIGIN),
    };
    if ( tab ) {
        details.tabId = tab.id;
        details.tabURL = tab.url;
    }
    messaging.ports.set(port.name, details);
    return details;
};

// Duplicate userSettingsDefault - now imported from sw-types.ts

// Duplicate regexes - now imported from sw-types.ts

const applyRuleTextDelta = (
    ruleset: DynamicFirewallRules,
    text: string,
    method: 'addFromRuleParts' | 'removeFromRuleParts',
) => {
    for ( const rawRule of text.split(/\s*[\n\r]+\s*/) ) {
        const rule = rawRule.trim();
        if ( rule === '' ) { continue; }
        const parts = rule.split(/\s+/);
        if ( method === 'addFromRuleParts' ) {
            ruleset.addFromRuleParts(parts as [string, string, string, string]);
        } else {
            ruleset.removeFromRuleParts(parts as [string, string, string, string]);
        }
    }
};

const modifyDashboardRuleset = (payload: {
    permanent?: boolean;
    toAdd?: string;
    toRemove?: string;
}) => {
    return modifyDashboardRulesetFromModule(
        payload,
        popupState,
        ensurePopupState,
        persistPermanentFirewall,
        syncFirewallDnrRules,
    );
};

const resetDashboardRules = () => {
    return resetDashboardRulesFromModule(
        popupState,
        ensurePopupState,
        syncFirewallDnrRules,
    );
};

const getPopupData = async (request: PopupRequest) => {
    await ensurePopupState();
    const tab = await getTabForRequest(request.tabId);
    const tabId = tab?.id ?? 0;
    const pageURL = tab?.url || '';
    const pageTitle = tab?.title || '';
    const pageHostname = (() => {
        try {
            return pageURL ? new URL(pageURL).hostname : '';
        } catch {
            return '';
        }
    })();
    const pageDomain = domainFromHostname(pageHostname);

    const pageStore = tabId > 0 ? await pageStoreFromTabId(tabId) : null;

    const trackedState = typeof tabId === 'number'
        ? await loadTabRequestStateWithRetry(tabId)
        : undefined;
    const liveState = typeof tabId === 'number' && pageHostname !== ''
        ? await collectTabHostnameData(tabId, pageHostname)
        : undefined;

    const hostnameDict: Record<string, HostnameDetails> = {};
    if ( pageHostname !== '' ) {
        hostnameDict[pageHostname] = zeroHostnameDetails(pageHostname);
    }
    if ( pageStore ) {
        const hostnameDetailsMap = pageStore.getAllHostnameDetails();
        if ( hostnameDetailsMap ) {
            for ( const [ hostname, details ] of hostnameDetailsMap ) {
                hostnameDict[hostname] = cloneHostnameDetails({
                    domain: (details as any).domain || hostname,
                    counts: (details as any).counts || createCounts(),
                    cname: (details as any).cname,
                });
            }
        }
    }
    if ( trackedState?.hostnameDict ) {
        for ( const [ hostname, details ] of Object.entries(trackedState.hostnameDict) ) {
            if ( hostnameDict[hostname] === undefined ) {
                hostnameDict[hostname] = cloneHostnameDetails(details);
            }
        }
    }
    if ( liveState?.hostnameDict ) {
        for ( const [ hostname, details ] of Object.entries(liveState.hostnameDict) ) {
            if ( hostnameDict[hostname] === undefined ) {
                hostnameDict[hostname] = cloneHostnameDetails(details);
                continue;
            }
            if ( trackedState === undefined ) {
                mergeCounts(hostnameDict[hostname].counts, details.counts);
            }
        }
    }

    let pageCounts = pageStore?.counts 
        ? { blocked: { ...pageStore.counts.blocked }, allowed: { ...pageStore.counts.allowed } }
        : createCounts();
    if ( trackedState?.pageCounts ) {
        mergeCounts(pageCounts, trackedState.pageCounts);
    }
    if ( trackedState === undefined && liveState?.pageCounts ) {
        mergeCounts(pageCounts, liveState.pageCounts);
    }
    if ( tabId > 0 ) {
        const matchedBlockedCount = await getMatchedBlockedRequestCountForTab(
            tabId,
            trackedState?.startedAt || 0,
        );
        if ( typeof matchedBlockedCount === 'number' && matchedBlockedCount > pageCounts.blocked.any ) {
            pageCounts.blocked.any = matchedBlockedCount;
        }
    }

    const netFilteringSwitch = pageStore 
        ? pageStore.getNetFilteringSwitch()
        : true;

    const hostnameSwitches = popupState.sessionHostnameSwitches;
    const noPopups = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-popups'] === true;
    const noCosmeticFiltering = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-cosmetic-filtering'] === true;
    const noLargeMedia = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-large-media'] === true;
    const noRemoteFonts = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-remote-fonts'] === true;
    const noScripting = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-scripting'] === true;
    const switchMetrics = tabId > 0
        ? await getTabSwitchMetrics(tabId)
        : {
            popupBlockedCount: 0,
            largeMediaCount: 0,
            remoteFontCount: 0,
            scriptCount: 0,
        };

    const contentLastModified = pageStore?.contentLastModified || 0;
    const largeMediaCount = pageStore?.largeMediaCount ?? switchMetrics.largeMediaCount;
    const remoteFontCount = pageStore?.remoteFontCount ?? switchMetrics.remoteFontCount;
    const popupBlockedCount = pageStore?.popupBlockedCount ?? switchMetrics.popupBlockedCount;

    return {
        advancedUserEnabled: popupState.userSettings.advancedUserEnabled,
        appName: chrome.runtime.getManifest().name,
        appVersion: chrome.runtime.getManifest().version,
        colorBlindFriendly: popupState.userSettings.colorBlindFriendly,
        contentLastModified,
        cosmeticFilteringSwitch: noCosmeticFiltering !== true,
        firewallPaneMinimized: popupState.userSettings.firewallPaneMinimized,
        firewallRules: getFirewallRulesForPopup(pageHostname, hostnameDict),
        godMode: popupState.userSettings.filterAuthorMode === true,
        globalAllowedRequestCount: popupState.globalAllowedRequestCount,
        globalBlockedRequestCount: popupState.globalBlockedRequestCount,
        hasUnprocessedRequest: (() => {
            const vAPINet = (globalThis as any).vAPI?.net;
            if (vAPINet?.hasUnprocessedRequest) {
                return vAPINet.hasUnprocessedRequest(tabId) === true;
            }
            return popupState.tabMetrics?.[tabId]?.hasUnprocessedRequest === true;
        })(),
        hostnameDict,
        pageCounts,
        pageDomain,
        pageHostname,
        pageURL,
        popupBlockedCount,
        popupPanelDisabledSections: 0,
        popupPanelHeightMode: 0,
        popupPanelLockedSections: 0,
        popupPanelOrientation: '',
        popupPanelSections: popupState.userSettings.popupPanelSections,
        rawURL: pageURL,
        tabId,
        tabTitle: pageTitle,
        tooltipsDisabled: popupState.userSettings.tooltipsDisabled,
        netFilteringSwitch,
        largeMediaCount,
        remoteFontCount,
        noPopups,
        noLargeMedia,
        noRemoteFonts,
        noScripting,
        userSettings: popupState.userSettings,
        whitelist: popupState.whitelist,
        whitelistDefault: popupState.userSettings.netWhitelistDefault || [],
    };
};

const getToggleHandlers = () => createToggleHandlers({
    popupState,
    ensurePopupState,
    getPopupData,
    persistPermanentFirewall,
    persistPermanentHostnameSwitches,
    cloneHostnameSwitchState,
    hostnameSwitchNames,
    applyImmediateHostnameSwitchEffects,
    pageStoreFromTabId,
    updateToolbarIcon,
    cosmeticFilteringEngine,
    syncFirewallDnrRules,
    syncHostnameSwitchDnrRules,
    syncPowerSwitchDnrRules,
});

const toggleFirewallRule = (request: PopupRequest) => getToggleHandlers().toggleFirewallRule(request);
const saveFirewallRules = (request: PopupRequest) => getToggleHandlers().saveFirewallRules(request);
const revertFirewallRules = (request: PopupRequest) => getToggleHandlers().revertFirewallRules(request);
const toggleHostnameSwitch = (request: PopupRequest) => getToggleHandlers().toggleHostnameSwitch(request);
const toggleNetFiltering = (request: PopupRequest) => getToggleHandlers().toggleNetFiltering(request);

const handlePopupPanelMessage = (request: PopupRequest) => {
    return createMessageHandlers({
        popupState,
        getPopupData,
        getTabSwitchMetrics,
        getHiddenElementCountForTab,
        pageStoreFromTabId,
        setUserSetting,
        getLocalData,
        backupUserData,
        restoreUserData,
        resetUserData,
        reloadAllFilterLists,
        getDeviceName,
        encodeCloudData,
        decodeCloudData,
        cloudPull,
        cloudPush,
        toggleNetFiltering,
        toggleFirewallRule,
        saveFirewallRules,
        revertFirewallRules,
        toggleHostnameSwitch,
        getFirewallRulesForPopup,
        hostnameSwitchNames,
        updateToolbarIcon,
        µb,
        redirectEngine: (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine,
    }).handlePopupPanelMessage(request);
};

const getDashboardEngineState = () => ({
    logger,
    µb,
    cosmeticFilteringEngine,
    staticFilteringEngine: staticNetFilteringEngine,
    staticFilteringReverseLookup: (globalThis as any).vAPI?.staticFilteringReverseLookup,
    publicSuffixList,
    redirectEngine: (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine,
});

const handleDashboardMessage = createDashboardMessageHandler({
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
    reloadAllFilterLists: () => reloadAllFilterLists(popupState, ensurePopupState),
    updateFilterListsNow: (request?: { assetKeys?: string[]; preferOrigin?: boolean }) =>
        updateFilterListsNow(request, popupState, ensurePopupState),
    syncPowerSwitchDnrRules,
    findFilterListFromNetFilter,
    findFilterListFromCosmeticFilter,
    parseStoredCosmeticFilterData,
    elementPickerExec: (tabId: number, frameId: number, target?: string, zap?: boolean) =>
        (self as any).µb.elementPickerExec(tabId, frameId, target, zap),
    getEngineState: getDashboardEngineState,
});

// Sync DNR rules based on per-site filtering state - existing function handles this
// The syncPowerSwitchDnrRules function already exists and is called below

// Messaging router - core messaging infrastructure extracted to sw-message-router.ts
const Messaging = createMessagingRouter({
    getLegacyMessaging,
    handlePopupPanelMessage,
    handleDashboardMessage,
});

const Zapper = createZapper(Messaging as unknown as LegacyMessagingAPI);
const Picker = createPicker(Messaging as unknown as LegacyMessagingAPI, Zapper);

Messaging.on('ping', (_, callback) => {
    if (callback) callback({ pong: true, timestamp: Date.now() });
});

    // Handle popupPanel messages (including toggleNetFiltering)
    console.log('[MV3] Registering popupPanel handler');
    Messaging.on('popupPanel', async (payload, callback) => {
        console.log('[MV3] popupPanel message received:', payload);
        try {
            const result = await handlePopupPanelMessage(payload);
            console.log('[MV3] popupPanel result:', result);
            if (callback) callback(result);
        } catch (e) {
            console.error('[MV3] popupPanel error:', e);
            if (callback) callback({ error: (e as Error).message });
        }
    });

// Content script handlers for MV3
Messaging.on('retrieveContentScriptParameters', async (payload, callback) => {
    console.log('[MV3] retrieveContentScriptParameters:', payload);
    try {
        const tabId = payload?._tabId;
        const url = payload?.url || '';
        const frameId = payload?.frameId || 0;
        const hostname = url ? new URL(url).hostname : '';
        const origin = url ? new URL(url).origin : '';
        
        // Get frame ancestor details
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
        
        // Get per-site filtering state
        const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
        const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
        const pageScopeKey = hostname !== '' && url !== '' ? `${hostname}:${url}` : '';
        const netFilteringEnabled = hostname === ''
            ? true
            : perSiteFiltering[pageScopeKey] ?? perSiteFiltering[hostname] ?? true;
        
        // Get user settings from storage
        const stored = await chrome.storage.local.get('userSettings');
        const userSettings = stored.userSettings || popupState.userSettings;
        
        // Get hostname switches
        const hostnameSwitches = await getHostnameSwitchState();
        const noCosmeticFilteringSwitch = hostname !== '' &&
            hostnameSwitches[hostname]?.['no-cosmetic-filtering'] === true;
        const noCosmeticFiltering = netFilteringEnabled === false || noCosmeticFilteringSwitch;
        
        // Get cosmetic filter data
        const storedCosmeticData = await chrome.storage.local.get('cosmeticFiltersData');
        const cosmeticData = parseStoredCosmeticFilterData(storedCosmeticData.cosmeticFiltersData);
        
        // Get trusted scriptlet tokens
        let trustedScriptletTokens: string[] = [];
        try {
            const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
            if (redirectEngine?.getTrustedScriptletTokens) {
                trustedScriptletTokens = redirectEngine.getTrustedScriptletTokens();
            }
        } catch (e) {}
        
        // Build full response like reference
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
        
        console.log('[MV3] retrieveContentScriptParameters response:', response);
        if (callback) callback(response);
    } catch (e) {
        console.error('[MV3] retrieveContentScriptParameters error:', e);
        if (callback) callback({ error: (e as Error).message });
    }
});

Messaging.on('retrieveGenericCosmeticSelectors', async (payload, callback) => {
    console.log('[MV3] retrieveGenericCosmeticSelectors:', payload);
    try {
        const tabId = payload?._tabId;
        const hostname = payload?.hostname || '';
        const pageURL = payload?.url || '';
        const hashes = payload?.hashes || [];
        const exceptions = payload?.exceptions || [];
        const safeOnly = payload?.safeOnly === true;
        const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
        const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
        const pageScopeKey = hostname !== '' && pageURL !== '' ? `${hostname}:${pageURL}` : '';
        const netFilteringEnabled = hostname === ''
            ? true
            : perSiteFiltering[pageScopeKey] ?? perSiteFiltering[hostname] ?? true;
        if ( netFilteringEnabled === false ) {
            const result = { injectedCSS: '', excepted: [] };
            if (callback) callback({ result });
            return;
        }
        
        // Load stored cosmetic filters
        const stored = await chrome.storage.local.get('cosmeticFiltersData');
        const cosmeticData = parseStoredCosmeticFilterData(stored.cosmeticFiltersData);
        
        // Filter by hashes - the content script sends hashes of element classes/ids
        // We need to match these against our stored cosmetic filters
        const selectors: string[] = [];
        
        // Process generic cosmetic filters (apply to all sites)
        const genericFilters = cosmeticData.genericCosmeticFilters || [];
        for (const filter of genericFilters) {
            if (filter.key && hashes.includes(filter.key)) {
                selectors.push(filter.selector);
            }
        }
        
        // Process specific cosmetic filters (apply to specific hostnames)
        const specificFilters = cosmeticData.specificCosmeticFilters || [];
        const pageHostname = payload?.hostname || '';
        
        for (const entry of specificFilters) {
            // Entry is [selector, { matches: [...], key: "..." }]
            const selector = Array.isArray(entry) ? entry[0] : entry;
            const details = Array.isArray(entry) ? entry[1] : {};
            const matches = details?.matches || [];
            
            // Check if this filter applies to the current hostname
            let appliesToHostname = false;
            if (matches.length === 0) {
                // No specific hostnames = applies to all
                appliesToHostname = true;
            } else if (matches.includes('*') || matches.includes(pageHostname)) {
                // Wildcard or exact match
                appliesToHostname = true;
            } else if (pageHostname) {
                // Check for subdomain match
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
        
        // Remove exceptions
        const excepted: string[] = [];
        const genericExceptions = cosmeticData.genericCosmeticExceptions || [];
        
        // Filter out selectors that match exceptions
        const filteredSelectors = selectors.filter(selector => {
            // Check if selector or its key is in exceptions
            for (const exc of genericExceptions) {
                if (exc.selector === selector || exc.key === details?.key) {
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
        
        // Inject CSS into the tab
        if (tabId && injectedCSS) {
            try {
                await chrome.scripting.insertCSS({
                    target: { tabId },
                    css: injectedCSS,
                });
            } catch (e) {
                console.warn('[MV3] Failed to insert cosmetic CSS:', e);
            }
        }
        
        const result = {
            injectedCSS,
            excepted,
        };
        
        console.log('[MV3] retrieveGenericCosmeticSelectors result:', result);
        if (callback) callback({ result });
    } catch (e) {
        console.error('[MV3] retrieveGenericCosmeticSelectors error:', e);
        if (callback) callback({ error: (e as Error).message });
    }
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

Messaging.on('dashboardGetRules', async (_, callback) => {
    const details = await getDashboardRules();
    if ( callback ) {
        callback(details);
    }
    return details;
});

Messaging.on('dashboardModifyRuleset', async (payload, callback) => {
    const details = await modifyDashboardRuleset(payload || {});
    if ( callback ) {
        callback(details);
    }
    return details;
});

Messaging.on('dashboardResetRules', async (_, callback) => {
    const details = await resetDashboardRules();
    if ( callback ) {
        callback(details);
    }
    return details;
});

Messaging.on('getWhitelist', async (_, callback) => {
    await ensurePopupState();
    const response = {
        whitelist: popupState.whitelist || [],
        whitelistDefault: userSettingsDefault.netWhitelistDefault || [],
        reBadHostname: reWhitelistBadHostname.source,
        reHostnameExtractor: reWhitelistHostnameExtractor.source,
    };
    if ( callback ) {
        callback(response);
    }
    return response;
});

Messaging.on('setWhitelist', async (payload, callback) => {
    const whitelist = typeof payload?.whitelist === 'string' 
        ? payload.whitelist.split('\n').filter(Boolean) 
        : [];
    await ensurePopupState();
    popupState.whitelist = whitelist;
    const storage = chrome.storage.local;
    await storage.set({ whitelist: whitelist.join('\n') });
    await syncWhitelistDnrRules();
    
    // Notify about filtering behavior change
    broadcastFilteringBehaviorChanged();
    
    if ( callback ) {
        callback({ success: true });
    }
    return { success: true };
});

Messaging.on('documentBlocked', async (request, callback) => {
    if ( request.what === 'listsFromNetFilter' ) {
        const response: Record<string, any[]> = {};
        const rawFilter = request.rawFilter as string;
        if ( rawFilter ) {
            const results = await findFilterListFromNetFilter(rawFilter);
            if ( results.length > 0 ) {
                response[rawFilter] = results;
            }
        }
        if ( callback ) {
            callback(response);
        }
        return response;
    }
    if ( request.what === 'listsFromCosmeticFilter' ) {
        const response: Record<string, any[]> = {};
        const rawFilter = request.rawFilter as string;
        if ( rawFilter ) {
            const results = await findFilterListFromCosmeticFilter(rawFilter);
            if ( results.length > 0 ) {
                response[rawFilter] = results;
            }
        }
        if ( callback ) {
            callback(response);
        }
        return response;
    }
    if ( request.what === 'closeThisTab' ) {
        const tabId = request._sender?.tab?.id;
        if ( typeof tabId === 'number' ) {
            await chrome.tabs.remove(tabId);
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'temporarilyWhitelistDocument' ) {
        const hostname = request.hostname as string;
        if ( hostname ) {
            // Use webRequest.strictBlockBypass if available
            const webRequest = (globalThis as any).vAPI?.webRequest;
            if (webRequest?.strictBlockBypass) {
                webRequest.strictBlockBypass(hostname);
            }
            
            // Also set session hostname switch for DNR
            await ensurePopupState();
            popupState.sessionHostnameSwitches[`${hostname}:no-strict-blocking`] = true;
            await persistHostnameSwitches();
            await syncHostnameSwitchDnrRules();
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( callback ) {
        callback({ success: false });
    }
    return { success: false };
});

Messaging.on('getAssetContent', async (request, callback) => {
    const url = request.url as string;
    if ( !url ) {
        if ( callback ) {
            callback({ content: '', trustedSource: false });
        }
        return { content: '', trustedSource: false };
    }

    try {
        // Check cache first
        const cached = await chrome.storage.local.get(`assetCache_${url}`);
        if (cached[`assetCache_${url}`]) {
            const cachedData = cached[`assetCache_${url}`];
            const result = {
                content: cachedData.content,
                trustedSource: cachedData.trustedSource || false,
                sourceURL: url,
            };
            if ( callback ) { callback(result); }
            return result;
        }
        
        const response = await fetch(url);
        const content = await response.text();
        
        // Check if this is a trusted source (user filters or trusted list)
        const selectedLists = (await chrome.storage.local.get('selectedFilterLists')).selectedFilterLists || [];
        const isTrusted = selectedLists.some((list: string) => 
            url.includes(list) || url.includes('userfilters')
        );
        
        const result = {
            content,
            trustedSource: isTrusted,
            sourceURL: url,
        };
        
        // Cache the result
        await chrome.storage.local.set({
            [`assetCache_${url}`]: {
                content,
                trustedSource: isTrusted,
                timestamp: Date.now(),
            }
        });
        
        if ( callback ) { callback(result); }
        return result;
    } catch (e) {
        console.error('[MV3] Failed to fetch asset content:', e);
        if ( callback ) {
            callback({ content: '', trustedSource: false });
        }
        return { content: '', trustedSource: false };
    }
});

Messaging.on('getAutoCompleteDetails', async (_, callback) => {
    const stored = await chrome.storage.local.get('userFilters');
    const userFilters = stored?.userFilters || '';
    const lines = userFilters.split('\n').filter(line => line.trim() !== '');
    
    const redirectResources: string[] = [];
    try {
        const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
        if (redirectEngine?.resources) {
            redirectResources.push(...redirectEngine.resources);
        }
    } catch (e) {}
    
    const originHints: string[] = [];
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url) {
                try {
                    const hostname = new URL(tab.url).hostname;
                    if (hostname && !originHints.includes(hostname)) {
                        originHints.push(hostname);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
    
    const result = {
        filterParts: lines.filter(l => !l.startsWith('!') && !l.startsWith('#')),
        filterRegexes: lines.filter(l => l.includes(' regexp')),
        whitelistParts: lines.filter(l => l.startsWith('@@')),
        originHints,
        redirectResources,
        preparseDirectiveHints: ['|', '||', '|https:', '|http:', '^', '*', '~'],
        preparseDirectiveEnv: {
            flavor: 'chromium',
            hasWebSocket: true,
        },
        hintUpdateToken: Date.now().toString(36),
    };
    if ( callback ) { callback(result); }
    return result;
});

Messaging.on('getTrustedScriptletTokens', async (_, callback) => {
    const result: string[] = [];
    try {
        const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
        if (redirectEngine?.getTrustedScriptletTokens) {
            result.push(...redirectEngine.getTrustedScriptletTokens());
        } else if (redirectEngine?.tokens) {
            result.push(...redirectEngine.tokens);
        }
    } catch (e) {}
    if ( callback ) { callback(result); }
    return result;
});

Messaging.on('scriptlets', async (request, callback) => {
    if ( request.what === 'applyFilterListSelection' ) {
        const result = await applyFilterListSelection(request as {
            toSelect?: string[];
            toImport?: string;
            toRemove?: string[];
        }, popupState, ensurePopupState);
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'reloadAllFilters' ) {
        const result = await reloadAllFilterLists(popupState, ensurePopupState);
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'getAdvancedSettings' ) {
        const items = await chrome.storage.local.get('advancedSettings');
        const result = items.advancedSettings || {};
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'setAdvancedSettings' ) {
        const settings = request.settings as Record<string, string>;
        if ( settings ) {
            await chrome.storage.local.set({ advancedSettings: settings });
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'createUserFilter' ) {
        const filter = request.filter as string;
        if ( filter ) {
            const items = await chrome.storage.local.get('userFilters');
            const currentFilters = items.userFilters || '';
            const newFilters = currentFilters ? `${currentFilters}\n${filter}` : filter;
            await chrome.storage.local.set({ userFilters: newFilters });
            await reloadAllFilterLists(popupState, ensurePopupState);
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'readHiddenSettings' ) {
        const items = await chrome.storage.local.get('hiddenSettings');
        const result = items.hiddenSettings || {};
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'writeHiddenSettings' ) {
        const settings = request.settings as Record<string, any>;
        if ( settings ) {
            await chrome.storage.local.set({ hiddenSettings: settings });
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'cloudUsed' ) {
        const now = Date.now();
        await chrome.storage.local.set({ lastCloudSync: now });
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( callback ) {
        callback({ success: false });
    }
    return { success: false };
});

Messaging.on('default', async (request, callback) => {
    if ( request.what === 'getAssetContent' ) {
        const url = request.url as string;
        if ( !url ) {
            const result = { content: '', trustedSource: false };
            if ( callback ) { callback(result); }
            return result;
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
    if ( request.what === 'purgeAllCaches' ) {
        try {
            // Get bytes in use before
            const bytesBefore = await chrome.storage.local.getBytesInUse(null);
            
            // Clear all cached data
            const keys = await chrome.storage.local.get(null);
            const cacheKeys = Object.keys(keys).filter(k => 
                k.startsWith('assetCache_') || k.startsWith('cachedAsset_') || k === 'filterLists' || k === 'cachedAssets'
            );
            if (cacheKeys.length > 0) {
                await chrome.storage.local.remove(cacheKeys);
            }
            
            // Get bytes in use after
            const bytesAfter = await chrome.storage.local.getBytesInUse(null);
            
            const formatBytes = (bytes: number): string => {
                if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
                if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
                return bytes + ' B';
            };
            
            const result = { 
                success: true,
                before: formatBytes(bytesBefore),
                after: formatBytes(bytesAfter),
            };
            if ( callback ) { callback(result); }
            return result;
        } catch (e) {
            const result = { success: false, error: (e as Error).message };
            if ( callback ) { callback(result); }
            return result;
        }
    }
    if ( request.what === 'assetViewerRead' ) {
        const assetKey = request.assetKey as string;
        if ( assetKey ) {
            const items = await chrome.storage.local.get('assetViewerReadList');
            const readList: string[] = items.assetViewerReadList || [];
            if ( !readList.includes(assetKey) ) {
                readList.push(assetKey);
                await chrome.storage.local.set({ assetViewerReadList: readList });
            }
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'gotoURL' ) {
        const url = request.url as string;
        const tabId = request.tabId as number;
        const newTab = request.newTab as boolean;
        
        if ( newTab ) {
            const created = await chrome.tabs.create({ url, active: true });
            if ( callback ) { callback({ tabId: created.id }); }
            return { tabId: created.id };
        } else if ( typeof tabId === 'number' ) {
            await chrome.tabs.update(tabId, { url, active: true });
            if ( callback ) { callback({ tabId }); }
            return { tabId };
        } else {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if ( tabs[0]?.id ) {
                await chrome.tabs.update(tabs[0].id, { url, active: true });
                if ( callback ) { callback({ tabId: tabs[0].id }); }
                return { tabId: tabs[0].id };
            }
        }
        if ( callback ) { callback({ success: false }); }
        return { success: false };
    }
    if ( request.what === 'reloadTab' ) {
        const tabId = request.tabId as number;
        const bypassCache = request.bypassCache as boolean;
        
        if ( typeof tabId === 'number' ) {
            await chrome.tabs.reload(tabId, { bypassCache: !!bypassCache });
            if ( callback ) { callback({ success: true }); }
            return { success: true };
        }
        if ( callback ) { callback({ success: false }); }
        return { success: false };
    }
    if ( request.what === 'getHiddenElementCount' ) {
        const tabId = request.tabId as number;
        if ( typeof tabId === 'number' ) {
            try {
                const results = await chrome.tabs.sendMessage(tabId, { what: 'getHiddenElementCount' });
                if ( callback ) { callback(results); }
                return results;
            } catch (e) {
                if ( callback ) { callback({ count: 0 }); }
                return { count: 0 };
            }
        }
        if ( callback ) { callback({ count: 0 }); }
        return { count: 0 };
    }
    if ( request.what === 'getScriptCount' ) {
        const tabId = request.tabId as number;
        if ( typeof tabId === 'number' ) {
            try {
                const results = await chrome.tabs.sendMessage(tabId, { what: 'getScriptCount' });
                if ( callback ) { callback(results); }
                return results;
            } catch (e) {
                if ( callback ) { callback({ count: 0 }); }
                return { count: 0 };
            }
        }
        if ( callback ) { callback({ count: 0 }); }
        return { count: 0 };
    }
    if ( request.what === 'launchReporter' ) {
        const url = request.url as string;
        if ( url ) {
            const reporterUrl = chrome.runtime.getURL(`reporter.html?url=${encodeURIComponent(url)}`);
            await chrome.tabs.create({ url: reporterUrl, active: true });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'readyToFilter' ) {
        const tabId = request.tabId as number;
        const url = request.url as string;
        
        // Return readyToFilter status - just the boolean like reference
        const isReady = popupState.initialized === true;
        
        if ( typeof tabId === 'number' ) {
            try {
                // Signal content script that page is ready for filtering
                await chrome.tabs.sendMessage(tabId, { what: 'readyToFilter', url });
                
                // Update toolbar icon to show filtering is active
                await updateToolbarIcon(tabId, { filtering: true });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback(isReady); }
        return isReady;
    }
    if ( request.what === 'clickToLoad' ) {
        const tabId = request.tabId as number;
        const hostname = request.hostname as string;
        if ( typeof tabId === 'number' && hostname ) {
            try {
                // Notify content script to allow blocked element
                await chrome.tabs.sendMessage(tabId, { what: 'clickToLoad', hostname });
                
                // Update toolbar icon to reflect change
                await updateToolbarIcon(tabId, { clickToLoad: hostname });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'loggerDisabled' ) {
        const tabId = request.tabId as number;
        const hostname = request.hostname as string;
        
        // Clear in-memory filters when logger is disabled
        popupState.inMemoryFilter = '';
        await chrome.storage.local.set({ inMemoryFilter: '' });
        
        if ( typeof tabId === 'number' && hostname ) {
            try {
                await chrome.tabs.sendMessage(tabId, { what: 'clickToLoad', hostname });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'dismissUnprocessedRequest' ) {
        const tabId = request.tabId as number;
        if ( typeof tabId === 'number' ) {
            try {
                await chrome.tabs.sendMessage(tabId, { what: 'dismissUnprocessedRequest' });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'updateLists' ) {
        await reloadAllFilterLists(popupState, ensurePopupState);
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // scriptlet handler - execute scriptlet in a tab
    if ( request.what === 'scriptlet' ) {
        const tabId = request.tabId as number;
        const scriptletSrc = request.scriptletSrc as string;
        const scriptlet = request.scriptlet as string;
        
        let scriptletFile = scriptletSrc;
        
        // If using scriptlet name (like reference), construct path
        if (!scriptletFile && scriptlet) {
            scriptletFile = `/js/scriptlets/${scriptlet}.js`;
        }
        
        if (typeof tabId === 'number' && scriptletFile) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: [scriptletFile],
                    injectImmediately: false,
                    runAt: 'document_end',
                });
            } catch (e) {
                console.log('[MV3] scriptlet error:', e);
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // createUserFilter - add filter from popup/picker
    if ( request.what === 'createUserFilter' ) {
        const filter = request.filter as string;
        if (filter) {
            try {
                const stored = await chrome.storage.local.get('userFilters');
                const userFilters = stored?.userFilters || '';
                const newFilters = userFilters + '\n' + filter;
                await chrome.storage.local.set({ userFilters: newFilters });
                await reloadAllFilterLists(popupState, ensurePopupState);
            } catch (e) {
                console.log('[MV3] createUserFilter error:', e);
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // getTrustedScriptletTokens - get redirect engine tokens
    if ( request.what === 'getTrustedScriptletTokens' ) {
        const result: string[] = [];
        // Get tokens from redirect engine if available
        try {
            const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
            if (redirectEngine?.tokens) {
                result.push(...redirectEngine.tokens);
            }
        } catch (e) {
            // Return empty array if not available
        }
        if ( callback ) { callback(result); }
        return result;
    }
    // listsFromNetFilter - find filter lists containing a network filter
    if ( request.what === 'listsFromNetFilter' ) {
        const rawFilter = request.rawFilter as string;
        if (rawFilter) {
            const results = await findFilterListFromNetFilter(rawFilter);
            if ( callback ) { callback(results); }
            return results;
        }
        if ( callback ) { callback({}); }
        return {};
    }
    // listsFromCosmeticFilter - find filter lists containing a cosmetic filter
    if ( request.what === 'listsFromCosmeticFilter' ) {
        const rawFilter = request.rawFilter as string;
        if (rawFilter) {
            const results = await findFilterListFromCosmeticFilter(rawFilter);
            if ( callback ) { callback(results); }
            return results;
        }
        if ( callback ) { callback({}); }
        return {};
    }
    if ( request.what === 'getSupportData' ) {
        const items = await chrome.storage.local.get([
            'userSettings', 'filterLists', 'selectedFilterLists', 
            'hiddenSettings', 'whitelist', 'dynamicRules', 'permanentFirewall',
            'permanentSwitches', 'perSiteFiltering', 'cloudData', 'userFilters'
        ]);
        const manifest = chrome.runtime.getManifest();
        
        // Calculate filter counts from lists
        let netFilterCount = 0;
        let cosmeticFilterCount = 0;
        let scriptletFilterCount = 0;
        
        if (items.filterLists) {
            for (const [key, list] of Object.entries(items.filterLists as Record<string, any>)) {
                if (list?.content) {
                    const lines = list.content.split('\n');
                    const netFilters = lines.filter(l => !l.startsWith('!') && !l.startsWith('#') && l.trim() && !l.includes('##') && !l.includes('#@#'));
                    const cosmeticFilters = lines.filter(l => !l.startsWith('!') && (l.includes('##') || l.includes('#@#') || l.includes('#?') || l.includes('##@')));
                    const scriptletFilters = lines.filter(l => !l.startsWith('!') && l.includes('+js('));
                    netFilterCount += netFilters.length;
                    cosmeticFilterCount += cosmeticFilters.length;
                    scriptletFilterCount += scriptletFilters.length;
                }
            }
        }
        
        // Add user filters count
        if (items.userFilters) {
            const userLines = items.userFilters.split('\n');
            netFilterCount += userLines.filter(l => !l.startsWith('!') && l.trim() && !l.includes('##')).length;
            cosmeticFilterCount += userLines.filter(l => !l.startsWith('!') && l.includes('##')).length;
        }
        
        // Try to get counts from filtering engines
        let engineNetFilterCount = 0;
        let engineCosmeticFilterCount = 0;
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine?.acceptedCount) {
                engineNetFilterCount = staticNetFilteringEngine.acceptedCount;
            }
        } catch (e) {}
        
        try {
            const cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
            if (cosmeticFilteringEngine?.acceptedCount) {
                engineCosmeticFilterCount = cosmeticFilteringEngine.acceptedCount;
            }
        } catch (e) {}
        
        // Use engine counts if available
        if (engineNetFilterCount > 0) netFilterCount = engineNetFilterCount;
        if (engineCosmeticFilterCount > 0) cosmeticFilterCount = engineCosmeticFilterCount;
        
        const supportData = {
            userSettings: items.userSettings || {},
            filterLists: items.filterLists || {},
            selectedFilterLists: items.selectedFilterLists || [],
            hiddenSettings: items.hiddenSettings || {},
            netWhitelist: items.whitelist || '',
            dynamicRules: items.dynamicRules || [],
            permanentFirewallRules: items.permanentFirewall || [],
            permanentHostnameSwitches: items.permanentSwitches || [],
            perSiteFiltering: items.perSiteFiltering || {},
            version: manifest?.version || '1.0.0',
            platform: 'chrome',
            netFilterCount,
            cosmeticFilterCount,
            scriptletFilterCount,
            htmlFilterCount: 0,
            cloudStorageUsed: items.cloudData ? JSON.stringify(items.cloudData).length : 0,
            storageUsed: await chrome.storage.local.getBytesInUse(),
        };
        if ( callback ) { callback(supportData); }
        return supportData;
    }
    // DevTools handlers
    if ( request.what === 'snfeBenchmark' ) {
        const result = { duration: 0, count: 0 };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine) {
                const startTime = Date.now();
                const filters = staticNetFilteringEngine.filterParser?.filters;
                const count = filters ? filters.size || 0 : 0;
                
                // Run simple benchmark - count filters
                for (let i = 0; i < 1000; i++) {
                    staticNetFilteringEngine.matchRequest?.('http://example.com/test');
                }
                
                result.duration = Date.now() - startTime;
                result.count = count;
            }
        } catch (e) {
            console.log('[MV3] snfeBenchmark error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'cfeBenchmark' ) {
        const result = { duration: 0, count: 0 };
        try {
            const cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
            if (cosmeticFilteringEngine) {
                const startTime = Date.now();
                const count = cosmeticFilteringEngine.specificFilters?.size || 0;
                
                // Run simple benchmark
                for (let i = 0; i < 1000; i++) {
                    cosmeticFilteringEngine.retrieveSpecificSelectors?.({ hostname: 'example.com' });
                }
                
                result.duration = Date.now() - startTime;
                result.count = count;
            }
        } catch (e) {
            console.log('[MV3] cfeBenchmark error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'sfeBenchmark' ) {
        const result = { duration: 0, count: 0 };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine) {
                const startTime = Date.now();
                const count = staticNetFilteringEngine.acceptedCount || 0;
                
                result.duration = Date.now() - startTime;
                result.count = count;
            }
        } catch (e) {
            console.log('[MV3] sfeBenchmark error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'snfeToDNR' ) {
        const result = { rules: [], errors: [] };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            const stored = await chrome.storage.local.get('userFilters');
            const filterLists = await chrome.storage.local.get('filterLists');
            const selectedLists = await chrome.storage.local.get('selectedFilterLists');
            
            const allFilters: string[] = [];
            
            // Get user filters
            if (stored?.userFilters) {
                allFilters.push(...stored.userFilters.split('\n').filter(l => l.trim() && !l.startsWith('!')));
            }
            
            // Get selected filter list content
            if (selectedLists?.selectedFilterLists && filterLists?.filterLists) {
                for (const listKey of selectedLists.selectedFilterLists) {
                    const listData = filterLists.filterLists[listKey];
                    if (listData?.content) {
                        allFilters.push(...listData.content.split('\n').filter(l => l.trim() && !l.startsWith('!')));
                    }
                }
            }
            
            // Convert to DNR rules (simplified)
            let ruleId = 1;
            for (const filter of allFilters.slice(0, 1000)) {
                try {
                    if (filter.includes('||') || filter.includes('|') || filter.includes('^')) {
                        result.rules.push({
                            id: ruleId++,
                            priority: 1,
                            action: { type: 'block' },
                            condition: { urlFilter: filter.replace(/\*/g, '.*').replace(/\^/g, '.*') }
                        });
                    }
                } catch (e) {}
            }
        } catch (e) {
            result.errors.push((e as Error).message);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'snfeDump' ) {
        const result: any = { 
            filterCount: 0, 
            memoryUse: 0,
            acceptedCount: 0,
            discardedCount: 0,
            filterParser: {},
            hostnameToFilterMapSize: 0,
            domainToFilterMapSize: 0,
        };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine) {
                result.filterCount = staticNetFilteringEngine.acceptedCount || 0;
                result.acceptedCount = staticNetFilteringEngine.acceptedCount || 0;
                result.discardedCount = staticNetFilteringEngine.discardedCount || 0;
                result.memoryUse = result.filterCount * 100;
                result.hostnameToFilterMapSize = staticNetFilteringEngine.hostnameToFilterMap?.size || 0;
                result.domainToFilterMapSize = staticNetFilteringEngine.domainToFilterMap?.size || 0;
                
                // Get filter parser stats
                if (staticNetFilteringEngine.filterParser) {
                    result.filterParser = {
                        filterCount: staticNetFilteringEngine.filterParser.filters?.size || 0,
                        ruleCount: staticNetFilteringEngine.filterParser.rules?.size || 0,
                    };
                }
            }
        } catch (e) {
            console.log('[MV3] snfeDump error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'snfeQuery' ) {
        const result = { matches: [], statistics: {} };
        const url = request.url as string;
        const type = request.type as string;
        if (url) {
            try {
                const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
                const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
                if (staticNetFilteringEngine?.matchRequest) {
                    const startTime = Date.now();
                    const match = staticNetFilteringEngine.matchRequest({ url, type, redirectEngine });
                    const duration = Date.now() - startTime;
                    
                    if (match) {
                        result.matches.push({ 
                            filter: match.filter, 
                            type: match.type,
                            raw: match.raw,
                        });
                    }
                    
                    result.statistics = {
                        duration,
                        url,
                        type,
                        filterCount: staticNetFilteringEngine.acceptedCount || 0,
                    };
                }
            } catch (e) {
                console.log('[MV3] snfeQuery error:', e);
            }
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'cfeDump' ) {
        const result: any = { 
            cosmeticFilterCount: 0, 
            specificFilterCount: 0,
            genericFilterCount: 0,
            acceptedCount: 0,
            discardedCount: 0,
            netSelectorCacheCount: 0,
            proceduralFilterCount: 0,
        };
        try {
            const cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
            if (cosmeticFilteringEngine) {
                result.cosmeticFilterCount = cosmeticFilteringEngine.acceptedCount || 0;
                result.acceptedCount = cosmeticFilteringEngine.acceptedCount || 0;
                result.discardedCount = cosmeticFilteringEngine.discardedCount || 0;
                result.specificFilterCount = cosmeticFilteringEngine.specificFilters?.size || 0;
                result.genericFilterCount = cosmeticFilteringEngine.genericFilters?.size || 0;
                result.netSelectorCacheCount = cosmeticFilteringEngine.netSelectorCacheCountMax || 0;
                result.proceduralFilterCount = cosmeticFilteringEngine.proceduralFilters?.size || 0;
            }
        } catch (e) {
            console.log('[MV3] cfeDump error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'purgeAllCaches' ) {
        try {
            // Get bytes in use before
            const bytesBefore = await chrome.storage.local.getBytesInUse(null);
            
            // Clear all cached assets
            const keys = await chrome.storage.local.get(null);
            const cacheKeys = Object.keys(keys).filter(k => k.startsWith('assetCache_') || k.startsWith('cachedAsset_'));
            for (const key of cacheKeys) {
                await chrome.storage.local.remove(key);
            }
            await chrome.storage.local.remove(['filterLists', 'cachedAssets']);
            
            // Get bytes in use after
            const bytesAfter = await chrome.storage.local.getBytesInUse(null);
            
            const result = {
                success: true,
                before: bytesBefore,
                after: bytesAfter,
            };
            if ( callback ) { callback(result); }
            return result;
        } catch (e) {
            const result = { success: false, error: (e as Error).message };
            if ( callback ) { callback(result); }
            return result;
        }
    }
    // Logger UI handlers
    if ( request.what === 'readAll' ) {
        const tabId = request.tabId as number;
        const offset = request.offset as number;
        const limit = request.limit as number;
        const filter = request.filter as string;
        const ownerId = request.ownerId as number;
        
        // Check ownership - if another logger view exists, don't return data
        const loggerOwnerId = popupState.loggerOwnerId;
        if (loggerOwnerId !== undefined && loggerOwnerId !== ownerId) {
            const result = { unavailable: true };
            if ( callback ) { callback(result); }
            return result;
        }
        
        // Set ownership
        popupState.loggerOwnerId = ownerId;
        
        const items = await chrome.storage.local.get('loggerEntries');
        let entries = items?.loggerEntries || [];
        
        // Filter by tabId if provided
        if (typeof tabId === 'number') {
            entries = entries.filter((e: any) => e.tabId === tabId);
        }
        
        // Apply filter if provided
        if (filter) {
            const filterLower = filter.toLowerCase();
            entries = entries.filter((e: any) => {
                const text = e.text || '';
                const url = e.url || '';
                return text.toLowerCase().includes(filterLower) || url.toLowerCase().includes(filterLower);
            });
        }
        
        const userSettings = await chrome.storage.local.get('userSettings');
        const result = {
            entries: entries.slice(offset || 0, (offset || 0) + (limit || 100)),
            total: entries.length,
            colorBlind: userSettings?.userSettings?.colorBlindFriendly || false,
            tooltips: true,
            tabIds: [...new Set(entries.map((e: any) => e.tabId).filter(Boolean))],
        };
        
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'toggleInMemoryFilter' ) {
        const filter = request.filter as string;
        const tabId = request.tabId as number;
        const kind = request.kind as string;
        
        if (filter && typeof tabId === 'number') {
            const stored = await chrome.storage.local.get('loggerInMemoryFilters');
            const filters = stored?.loggerInMemoryFilters || {};
            const tabFilters = filters[tabId] || [];
            
            if (kind === 'add') {
                if (!tabFilters.includes(filter)) {
                    tabFilters.push(filter);
                }
            } else {
                const index = tabFilters.indexOf(filter);
                if (index > -1) tabFilters.splice(index, 1);
            }
            
            filters[tabId] = tabFilters;
            await chrome.storage.local.set({ loggerInMemoryFilters: filters });
        }
        
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'hasInMemoryFilter' ) {
        const filter = request.filter as string;
        const tabId = request.tabId as number;
        
        let hasFilter = false;
        if (filter && typeof tabId === 'number') {
            const stored = await chrome.storage.local.get('loggerInMemoryFilters');
            const filters = stored?.loggerInMemoryFilters || {};
            hasFilter = (filters[tabId] || []).includes(filter);
        }
        
        if ( callback ) { callback({ hasFilter }); }
        return { hasFilter };
    }
    if ( request.what === 'releaseView' ) {
        // Release logger view and clear owner
        const ownerId = request.ownerId as number;
        
        // Check ownership before releasing
        if (ownerId !== popupState.loggerOwnerId) {
            if ( callback ) { callback({ success: false }); }
            return { success: false };
        }
        
        // Clear ownership and in-memory filters
        popupState.loggerOwnerId = undefined;
        popupState.inMemoryFilter = '';
        await chrome.storage.local.set({ loggerOwnerId: null, inMemoryFilter: '' });
        
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'saveURLFilteringRules' ) {
        const rules = request.rules as any[];
        const colors = request.colors as Record<string, string>;
        if (rules) {
            // Save URL filtering rules with colors
            await chrome.storage.local.set({ 
                urlFilteringRules: rules,
                urlFilteringColors: colors || {
                    'allow': '#4caf50',
                    'block': '#f44336',
                    'noop': '#ff9800',
                },
                urlFilteringDirty: false,
            });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'setURLFilteringRule' ) {
        const rule = request.rule as any;
        if (rule) {
            const stored = await chrome.storage.local.get('urlFilteringRules');
            const rules = stored?.urlFilteringRules || [];
            
            // Check if rule already exists and toggle it
            const existingIndex = rules.findIndex((r: any) => 
                r.urlPattern === rule.urlPattern && r.action === rule.action
            );
            
            if (existingIndex >= 0) {
                // Remove existing rule (toggle off)
                rules.splice(existingIndex, 1);
            } else {
                // Add new rule
                rules.push({
                    ...rule,
                    id: Date.now(),
                    created: Date.now(),
                });
            }
            
            await chrome.storage.local.set({ 
                urlFilteringRules: rules,
                urlFilteringDirty: true,
            });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'getURLFilteringData' ) {
        const stored = await chrome.storage.local.get('urlFilteringRules');
        const storedColors = await chrome.storage.local.get('urlFilteringColors');
        const storedDirty = await chrome.storage.local.get('urlFilteringDirty');
        
        // Default URL filtering colors
        const defaultColors = {
            'allow': '#4caf50',
            'block': '#f44336',
            'noop': '#ff9800',
        };
        
        const result = {
            urlFilters: stored?.urlFilteringRules || [],
            colors: storedColors?.urlFilteringColors || defaultColors,
            dirty: storedDirty?.urlFilteringDirty || false,
        };
        if ( callback ) { callback(result); }
        return result;
    }
    // UI styles handlers
    if ( request.what === 'uiStyles' ) {
        const stored = await chrome.storage.local.get('userSettings');
        const hiddenStored = await chrome.storage.local.get('hiddenSettings');
        const userSettings = stored?.userSettings || {};
        const hiddenSettings = hiddenStored?.hiddenSettings || {};
        const dark = typeof self.matchMedia === 'function' &&
            self.matchMedia('(prefers-color-scheme: dark)').matches;
        const accent = userSettings.uiAccentCustom || '#717191';
        
        // Build accent stylesheet
        const accentStylesheet = popupState.uiAccentStylesheet || generateAccentStylesheet(accent, dark);
        
        const result = {
            dark,
            accent,
            uiAccentCustom: userSettings.uiAccentCustom || false,
            uiAccentCustom0: userSettings.uiAccentCustom0 || '#3498d6',
            uiAccentStylesheet: accentStylesheet,
            uiStyles: hiddenSettings.uiStyles || '',
            uiTheme: userSettings.uiTheme || 'default',
        };
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'uiAccentStylesheet' ) {
        const stored = await chrome.storage.local.get('userSettings');
        const userSettings = stored?.userSettings || {};
        
        const accent = userSettings.uiAccentCustom || '#717191';
        const dark = userSettings.darkMode === true || 
            (userSettings.darkMode === undefined && 
             typeof window.matchMedia === 'function' && 
             window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        // Build full accent stylesheet
        const result = `
:root {
    --accent: ${accent};
    --accent-light: ${adjustColor(accent, 20)};
    --accent-dark: ${adjustColor(accent, -20)};
    --accent-alpha: ${accent}20;
}

.accent { 
    --accent: ${accent};
}

.accent-light {
    --accent: ${adjustColor(accent, 20)};
}

.accent-dark {
    --accent: ${adjustColor(accent, -20)};
}

${dark ? `
:root {
    --dark: 1;
}
` : ''}
`;
        
        // Store the accent stylesheet in popupState for reference
        popupState.uiAccentStylesheet = result;
        
        if ( callback ) { callback(result); }
        return result;
    }
    // Store custom accent stylesheet when sent from UI
    if ( request.what === 'saveUiAccentStylesheet' ) {
        const stylesheet = request.stylesheet as string;
        if (typeof stylesheet === 'string') {
            popupState.uiAccentStylesheet = stylesheet;
            await chrome.storage.local.set({ uiAccentStylesheet: stylesheet });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // DOM Inspector args
    if ( request.what === 'getInspectorArgs' ) {
        const tabId = request.tabId as number;
        const frameId = request.frameId as number;
        
        // Create BroadcastChannel for inspector communication
        try {
            const bc = new BroadcastChannel('contentInspectorChannel');
            bc.postMessage({
                topic: 'inspector',
                tabId,
                frameId,
                timestamp: Date.now(),
            });
            bc.close();
        } catch (e) {
            // BroadcastChannel not available
        }
        
        // Get war secret for secure URL
        const warSecret = (globalThis as any).vAPI?.warSecret?.short?.() || 
                         Math.random().toString(36).slice(2, 10);
        
        const result = {
            tabId,
            frameId,
            inspectorURL: `/web_accessible_resources/dom-inspector.html?secret=${warSecret}`,
        };
        if ( callback ) { callback(result); }
        return result;
    }
    // launchElementPicker
    if ( request.what === 'launchElementPicker' ) {
        const tabId = request.tabId as number;
        const frameId = request.frameId as number;
        const target = request.target as string;
        
        // Clear context menu coordinates like reference does
        epickerArgs.mouse = '';
        
        if (typeof tabId === 'number') {
            try {
                // Set the target for the picker
                epickerArgs.target = target || '';
                
                await chrome.tabs.executeScript(tabId, {
                    file: '/js/contentscript-extra.js',
                    frameId: frameId || 0,
                    matchAboutBlank: true,
                    runAt: 'document_start',
                });
            } catch (e) {
                console.log('[MV3] launchElementPicker error:', e);
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( callback ) {
        callback(undefined);
    }
    return undefined;
});

const findFilterListFromNetFilter = async (rawFilter: string): Promise<any[]> => {
    const results: any[] = [];
    if (!rawFilter || rawFilter.trim() === '') {
        return results;
    }
    
    // Normalize the filter for searching
    const normalizedFilter = rawFilter.trim().toLowerCase();
    const isWhitelist = normalizedFilter.startsWith('@@');
    const filterPattern = isWhitelist ? normalizedFilter.slice(2) : normalizedFilter;
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        // Also check user filters
        const userFiltersContent = stored.userFilters || '';
        
        // Check user filters first
        if (userFiltersContent.toLowerCase().includes(filterPattern)) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        // Check selected filter lists
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                // Check for exact match or partial match
                if (content.includes(filterPattern) || content.includes(normalizedFilter)) {
                    results.push({
                        assetKey: listKey,
                        title: listInfo.title,
                        supportURL: listInfo.supportURL || '',
                        description: listInfo.description || '',
                        type: 'list',
                    });
                }
            }
        }
        
    } catch (e) {
        console.error('[MV3] findFilterListFromNetFilter error:', e);
    }
    return results;
};

const findFilterListFromCosmeticFilter = async (rawFilter: string): Promise<any[]> => {
    const results: any[] = [];
    if (!rawFilter || rawFilter.trim() === '') {
        return results;
    }
    
    // Normalize cosmetic filter for searching
    // Remove ## or #@# prefix
    const normalizedFilter = rawFilter.trim()
        .replace(/^##/, '')
        .replace(/^#@#/, '')
        .replace(/^#@/, '')
        .replace(/^##/, '')
        .toLowerCase();
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        // Check user filters for cosmetic rules
        const userFiltersContent = stored.userFilters || '';
        if (userFiltersContent.toLowerCase().includes(normalizedFilter) || 
            userFiltersContent.toLowerCase().includes(rawFilter.trim().toLowerCase())) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        // Check selected filter lists for cosmetic rules
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                // Look for cosmetic filter patterns
                if (content.includes(`##${normalizedFilter}`) || 
                    content.includes(`#@#${normalizedFilter}`) ||
                    content.includes(rawFilter.trim().toLowerCase())) {
                    results.push({
                        assetKey: listKey,
                        title: listInfo.title,
                        supportURL: listInfo.supportURL || '',
                        description: listInfo.description || '',
                        type: 'list',
                    });
                }
            }
        }
        
    } catch (e) {
        console.error('[MV3] findFilterListFromCosmeticFilter error:', e);
    }
    return results;
};

Messaging.on('pickerContextMenuPoint', (payload, callback) => {
    const tabId = typeof payload?._tabId === 'number' ? payload._tabId : payload?._sender?.tab?.id;
    const frameId = typeof payload?._sender?.frameId === 'number' ? payload._sender.frameId : 0;
    if (
        typeof tabId === 'number' &&
        typeof payload?.x === 'number' &&
        typeof payload?.y === 'number'
    ) {
        pickerContextPoints.set(pickerContextPointKey(tabId, frameId), {
            tabId,
            frameId,
            x: payload.x,
            y: payload.y,
            timestamp: Date.now(),
            target: payload?.target && typeof payload.target.selector === 'string'
                ? { selector: payload.target.selector }
                : undefined,
        });
    }
    if ( callback ) {
        callback({ success: true });
    }
    return { success: true };
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

chrome.webRequest.onBeforeRequest.addListener(
    details => {
        trackPendingRequest(details as chrome.webRequest.WebRequestBodyDetails);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.webRequest.onCompleted.addListener(
    details => {
        void finalizeTrackedRequest(details, false);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.webRequest.onErrorOccurred.addListener(
    details => {
        void finalizeTrackedRequest(details, true);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.tabs.onRemoved.addListener(tabId => {
    void clearTabRequestState(tabId);
    const pageStore = pageStores.get(tabId);
    if (pageStore) {
        pageStore.disposeFrameStores();
        pageStores.delete(tabId);
    }
});

// Inject YouTube ad blocking script into page context immediately
chrome.webNavigation?.onCommitted?.addListener(async (details) => {
    if (details.frameId !== 0) { return; }
    await applyPersistedHostnameSwitchesForTab(details.tabId, details.url);
    
    const url = details.url;
    if (!url || !url.includes('youtube.com')) { return; }
    
    if (chrome.scripting?.executeScript === undefined) {
        console.log('[MV3] chrome.scripting not available');
        return;
    }
    
    console.log('[MV3] Injecting YouTube ad blocker early into tab', details.tabId);
    
    try {
        await chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            world: 'MAIN',
            func: () => {
                // This runs in the page context at document_start
                console.log('[YT-MAIN] Early page context injection');
                
                // Patch fetch immediately
                const originalFetch = window.fetch;
                window.fetch = function(...args) {
                    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
                    if (url && url.includes('youtube.com/youtubei/v1/player')) {
                        console.log('[YT-MAIN] Fetch to player API');
                    }
                    return originalFetch.apply(this, args).then((response: Response) => {
                        if (url && url.includes('youtube.com/youtubei/v1/player') && response.ok) {
                            return response.clone().text().then((text: string) => {
                                if (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"')) {
                                    console.log('[YT-MAIN] Stripping ad data from fetch');
                                    try {
                                        const json = JSON.parse(text);
                                        const stripAdData = (obj: any): any => {
                                            if (obj === null || obj === undefined) return obj;
                                            if (typeof obj !== 'object') return obj;
                                            const newObj: any = Array.isArray(obj) ? [] : {};
                                            for (const key of Object.keys(obj)) {
                                                if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) {
                                                    console.log('[YT-MAIN] Stripping:', key);
                                                    continue;
                                                }
                                                try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                                            }
                                            return newObj;
                                        };
                                        const stripped = stripAdData(json);
                                        return new Response(JSON.stringify(stripped), {
                                            status: response.status,
                                            statusText: response.statusText,
                                            headers: response.headers
                                        });
                                    } catch {}
                                }
                                return response;
                            });
                        }
                        return response;
                    });
                };
                
                // Patch XHR immediately
                const originalOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method: string, url: string) {
                    (this as any)._isYtPlayer = url && (url.includes('youtube.com/youtubei/v1/player') || url.includes('youtube.com/apiManifest'));
                    return originalOpen.apply(this, arguments);
                };
                
                const originalSend = XMLHttpRequest.prototype.send;
                XMLHttpRequest.prototype.send = function(body?: any) {
                    if ((this as any)._isYtPlayer) {
                        console.log('[YT-MAIN] XHR to player API');
                        this.addEventListener('load', function() {
                            const text = this.responseText;
                            if (text && (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"'))) {
                                console.log('[YT-MAIN] Stripping ad data from XHR');
                                try {
                                    const json = JSON.parse(text);
                                    const stripAdData = (obj: any): any => {
                                        if (obj === null || obj === undefined) return obj;
                                        if (typeof obj !== 'object') return obj;
                                        const newObj: any = Array.isArray(obj) ? [] : {};
                                        for (const key of Object.keys(obj)) {
                                            if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) continue;
                                            try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                                        }
                                        return newObj;
                                    };
                                    const stripped = JSON.stringify(stripAdData(json));
                                    Object.defineProperty(this, 'responseText', { value: stripped, writable: false, configurable: true });
                                    Object.defineProperty(this, 'response', { value: stripped, writable: false, configurable: true });
                                } catch {}
                            }
                        });
                    }
                    return originalSend.apply(this, arguments);
                };
                
                // Patch JSON.parse immediately  
                const originalJSONParse = JSON.parse;
                JSON.parse = function(text: string, reviver?: (key: string, value: any) => any) {
                    const result = originalJSONParse.call(this, text, reviver);
                    if (text && (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"'))) {
                        console.log('[YT-MAIN] JSON.parse catching ad data');
                        try {
                            const stripAdData = (obj: any): any => {
                                if (obj === null || obj === undefined) return obj;
                                if (typeof obj !== 'object') return obj;
                                const newObj: any = Array.isArray(obj) ? [] : {};
                                for (const key of Object.keys(obj)) {
                                    if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) continue;
                                    try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                                }
                                return newObj;
                            };
                            return stripAdData(result);
                        } catch {}
                    }
                    return result;
                };
                
                console.log('[YT-MAIN] All patches applied');
            },
        });
        console.log('[MV3] Early injection complete for tab', details.tabId);
    } catch (e) {
        console.error('[MV3] Failed to inject:', e);
    }
}, { url: [{ urlContains: 'youtube.com' }] });

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('uBlock Origin installed');
    } else if (details.reason === 'update') {
        console.log('uBlock Origin updated');
    }
});

console.log('uBlock Origin MV3 Service Worker started');

ensurePopupState()
    .then(() => {
        syncFirewallDnrRules();
        // syncFilterListDnrRules is already imported from sw-policies
        syncFilterListDnrRules();
        syncPowerSwitchDnrRules();
        syncHostnameSwitchDnrRules();
        syncWhitelistDnrRules();
    })
    .catch(error => {
        console.error('Failed to initialize popup/firewall state', error);
    });

(self as any).µBlockMV3 = {
    userSettings: popupState.userSettings,
    permanentFirewall: popupState.permanentFirewall,
    sessionFirewall: popupState.sessionFirewall,
};

(self as any).Messaging = Messaging;
(self as any).Zapper = Zapper;
(self as any).Picker = Picker;

// elementPickerExec - called from context menu to launch the element picker
(self as any).µb = {
    elementPickerExec: async function(tabId: number, frameId: number, target?: string) {
        const point = getPickerContextPoint(tabId, 0) || getPickerContextPoint(tabId, frameId);
        await launchPickerInTab(tabId, 0, {
            initialPoint: point ? { x: point.x, y: point.y } : undefined,
            target,
            exactTarget: point?.target,
        });
        return { success: true };
    },
    userSettings: popupState.userSettings,
    hiddenSettings: {},
    hiddenSettingsDefault: {},
    requestStats: {
        allowedCount: 0,
        blockedCount: 0,
    },
    readyToFilter: false,
    netWhitelist: [] as string[],
    netWhitelistDefault: [] as string[],
    reWhitelistBadHostname: /(^|\.)(localhost|localhost\.localdomain|127\.0\.0\.1|0\.0\.0\.0|255\.255\.255\.255)$/,
    reWhitelistHostnameExtractor: /^https?:\/\/([^/:]+)/,
    selectedFilterLists: [] as string[],
    pageStores: pageStores,
    pageStoresToken: pageStoresToken,
    cloudStorageSupported: typeof chrome.storage.sync !== 'undefined',
    privacySettingsSupported: typeof navigator !== 'undefined' && typeof navigator.connection !== 'undefined',
    restoreBackupSettings: {},
    userFiltersPath: 'user-filters',
    maybeGoodPopup: { tabId: 0, url: '' },
    epickerArgs: { target: '', mouse: false, zap: false, eprom: null },
    tabContextManager: {
        mustLookup: (tabId: number) => ({ tabId, hostname: '' }),
        lookup: (tabId: number) => null,
    },
    arrayFromWhitelist: (whitelist: string[]) => {
        if (!whitelist) return [];
        return whitelist.split('\n').filter(line => line.trim() !== '');
    },
    whitelistFromString: (str: string) => {
        if (!str) return '';
        return str.split('\n').filter(line => line.trim() !== '').join('\n');
    },
    isTrustedList: (assetKey: string) => {
        return popupState.trustedLists?.[assetKey] === true;
    },
    userFiltersAreEnabled: () => {
        return popupState.userSettings.filteringEnabled !== false;
    },
    changeUserSettings: (name: string, value: any) => {
        popupState.userSettings[name] = value;
        return { done: true };
    },
    getModifiedSettings: (settings: any, defaults: any) => {
        const modified: any = {};
        for (const key in settings) {
            if (settings[key] !== defaults[key]) {
                modified[key] = settings[key];
            }
        }
        return modified;
    },
    getAvailableLists: () => {
        return getFilterListState(popupState, ensurePopupState);
    },
    dateNowToSensibleString: () => {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    },
    getBytesInUse: async () => {
        const result = await chrome.storage.local.getBytesInUse();
        return result;
    },
    saveLocalSettings: async () => {
        await chrome.storage.local.set({ userSettings: popupState.userSettings });
    },
    saveWhitelist: async () => {
        await chrome.storage.local.set({ whitelist: popupState.whitelist.join('\n') });
    },
    saveUserFilters: async (filters: string) => {
        await chrome.storage.local.set({ userFilters: filters });
        await reloadAllFilterLists(popupState, ensurePopupState);
    },
    loadUserFilters: async () => {
        const stored = await chrome.storage.local.get('userFilters');
        return stored?.userFilters || '';
    },
    saveSelectedFilterLists: async (lists: string[]) => {
        await chrome.storage.local.set({ selectedFilterLists: lists });
    },
    savePermanentFirewallRules: async () => {
        await persistPermanentFirewall();
    },
    saveHostnameSwitches: async () => {
        await persistPermanentHostnameSwitches();
    },
    savePermanentURLFilteringRules: async () => {
        await persistURLFilteringRules();
    },
    loadFilterLists: async () => {
        await reloadAllFilterLists(popupState, ensurePopupState);
    },
    applyFilterListSelection: async (request: any) => {
        return applyFilterListSelection(request, popupState, ensurePopupState);
    },
    createUserFilters: async (request: any) => {
        await chrome.storage.local.set({ userFilters: request.filters || '' });
        await reloadAllFilterLists(popupState, ensurePopupState);
        return { success: true };
    },
    updateToolbarIcon: async (tabId: number, state: number | { filtering?: boolean; largeMedia?: boolean; noPopups?: boolean }) => {
        await updateToolbarIcon(tabId, state);
    },
    openNewTab: async (details: { url: string; select?: boolean; index?: number }) => {
        const created = await chrome.tabs.create({
            url: details.url,
            active: details.select !== false,
            index: details.index,
        });
        return { tabId: created.id };
    },
    clearInMemoryFilters: () => {
        popupState.inMemoryFilter = '';
    },
    toggleHostnameSwitch: (request: any) => {
        return toggleHostnameSwitch(request);
    },
    getTabId: (sender: any) => sender?.tab?.id,
    pageStoreFromTabId: pageStoreFromTabId,
};

// Create context menu for "Block element..."
function createContextMenu() {
    if (typeof chrome.contextMenus === 'undefined') {
        console.log('[MV3] chrome.contextMenus not available');
        return;
    }
    
    chrome.contextMenus.removeAll(() => {
        if ( popupState.userSettings.contextMenuEnabled === false ) {
            return;
        }
        chrome.contextMenus.create({
            id: 'uBlock0-blockElement',
            title: 'Block element...',
            contexts: ['all'],
            documentUrlPatterns: ['http://*/*', 'https://*/*']
        }, () => {
            console.log('[MV3] Context menu created');
        });
    });
}

chrome.contextMenus?.onClicked?.addListener((details, tab) => {
    if (details.menuItemId === 'uBlock0-blockElement' && tab) {
        const tabId = tab.id;
        if ( typeof tabId !== 'number' ) { return; }
        const frameId = typeof details.frameId === 'number' ? details.frameId : 0;
        let target = '';
        
        // Build target from context menu details
        if (details.linkUrl) {
            target = `a\t${details.linkUrl}`;
        } else if (details.srcUrl) {
            if (details.mediaType === 'image') {
                target = `img\t${details.srcUrl}`;
            } else if (details.mediaType === 'video') {
                target = `video\t${details.srcUrl}`;
            } else if (details.mediaType === 'audio') {
                target = `audio\t${details.srcUrl}`;
            } else {
                target = `${details.tagName || 'img'}\t${details.srcUrl}`;
            }
        } else if (details.frameUrl) {
            target = `iframe\t${details.frameUrl}`;
        } else if (details.tagName) {
            target = details.tagName;
        }
        
        console.log('[MV3] Context menu clicked - target:', target);
        
        // Call elementPickerExec
        void (self as any).µb.elementPickerExec(tabId, frameId, target).catch(error => {
            console.error('[MV3] Failed to launch picker from context menu', error);
        });
    }
});

// Create context menu on service worker startup
createContextMenu();
