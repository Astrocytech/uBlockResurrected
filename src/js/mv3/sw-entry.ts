/*******************************************************************************

    uBlock Origin - MV3 Service Worker Entry Point
    https://github.com/gorhill/uBlock

    This is the main entry point for the MV3 service worker. It coordinates
    all background tasks including messaging, element picker/zapper, and
    DNR rule management.

******************************************************************************/

import "./sw-runtime-shim.js";
const legacyBackground: any = undefined;

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
} from "./sw-helpers.js";

import { initContextMenu } from "./sw-context-menu.js";

import { setEngineReferences as setSharedEngineReferences } from "./sw-engine-references.js";

import {
  legacyBackendState,
  epickerArgs,
  getLegacyMessaging,
  broadcastFilteringBehaviorChanged,
  broadcastFilteringBehaviorChangedToTabs,
  withDisabledRuntimeOnConnect,
} from "./sw-messaging.js";

import {
  ensureTabRequestState,
  persistTabRequestState,
  loadTabRequestState,
  loadTabRequestStateWithRetry,
  clearTabRequestState,
  tabRequestStates,
  getTabRequestStateKey,
  incrementCounts,
} from "./sw-request-tracking.js";

import { registerMessagingHandlers } from "./sw-messaging-handlers.js";

import {
  FILTER_LIST_USER_PATH,
  FILTER_LIST_ASSETS_URL,
  getFilterListState,
  applyFilterListSelection,
  reloadAllFilterLists,
  updateFilterListsNow,
  syncFilterListDnrRules,
} from "./sw-policies.js";

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
} from "./sw-storage.js";

import {
  modifyDashboardRuleset as modifyDashboardRulesetFromModule,
  resetDashboardRules as resetDashboardRulesFromModule,
} from "./sw-initialization.js";

import { setUserSetting } from "./sw-settings-handler.js";

import { createToggleHandlers } from "./sw-toggle-handlers.js";

import { createMessageHandlers } from "./sw-message-handlers.js";

import { createDashboardMessageHandler } from "./sw-dashboard-message-handler.js";

import { createMessagingRouter } from "./sw-message-router.js";

import { createZapper } from "./sw-zapper.js";

import { createPicker } from "./sw-picker.js";

import { applyPersistedHostnameSwitchesForTab } from "./sw-whitelist.js";

import { registerVideoAdBlocker } from "./sw-video-blocker.js";

import { registerChromeEventHandlers } from "./sw-chrome-events.js";

import * as s14e from "../s14e-serializer.js";

import {
  pageStoreFromTabId,
  mustLookup,
  pageStores,
  pageStoresToken,
} from "./sw-pagestore.js";

import {
  syncFirewallDnrRules,
  syncWhitelistDnrRules,
  syncPowerSwitchDnrRules,
  syncHostnameSwitchDnrRules,
  getFirewallRulesForPopup,
  firewallRuleTypes,
  firewallRuleResourceTypes,
  compileFirewallRulesToDnr,
} from "./sw-firewall.js";

import {
  getTabSwitchMetrics,
  getHiddenElementCountForTab as getHiddenElementCountForTabFromModule,
  updateToolbarIcon as updateToolbarIconFromModule,
  updateBadge,
  persistGlobalRequestCounts,
} from "./sw-tab-metrics.js";

import {
  recordTabRequest,
  trackPendingRequest,
  finalizeTrackedRequest,
  collectTabHostnameData,
  getMatchedBlockedRequestCountForTab,
} from "./sw-request-handlers.js";

import {
  findFilterListFromNetFilter,
  findFilterListFromCosmeticFilter,
} from "./sw-filter-finders.js";

import { getPopupData } from "./sw-popup-data.js";

import type { LegacyMessagingAPI } from "./sw-types.js";
import {
  userSettingsDefault,
  reWhitelistBadHostname,
  reWhitelistHostnameExtractor,
  hostnameSwitchNames,
  HOSTNAME_SWITCHES_SCHEMA_VERSION,
} from "./sw-types.js";

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
  listeners: Map<
    string,
    {
      fn: (
        request: any,
        sender: any,
        callback: (response?: any) => void,
      ) => any;
      privileged?: boolean;
    }
  >;
  defaultHandler:
    | null
    | ((request: any, sender: any, callback: (response?: any) => void) => any);
  PRIVILEGED_ORIGIN: string;
  UNHANDLED: string;
  onFrameworkMessage?: (
    request: any,
    port: chrome.runtime.Port,
    callback: (response?: any) => void,
  ) => void;
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
  if (refs == null) {
    return;
  }
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
  target: "",
  mouse: "",
  zap: false,
  eprom: null as any,
};

const getLegacyMessaging = (): LegacyMessagingAPI | undefined => {
  return (globalThis as any).vAPI?.messaging;
};

// Duplicate functions removed - using imported versions from sw-messaging.ts

const ensureLegacyBackend = async (): Promise<void> => {
  if (legacyBackendState.initialized) {
    return;
  }
  if (legacyBackendState.initializing) {
    return legacyBackendState.initializing;
  }

  legacyBackendState.initializing = withDisabledRuntimeOnConnect(async () => {
    if (legacyBackground?.isReadyPromise instanceof Promise) {
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

const registerLegacyPort = (
  port: chrome.runtime.Port,
): LegacyPortDetails | undefined => {
  const messaging = getLegacyMessaging();
  if (messaging === undefined) {
    return;
  }

  const sender = port.sender || {};
  const { origin, tab, url } = sender;
  const details: LegacyPortDetails = {
    port,
    frameId: sender.frameId,
    frameURL: url,
    privileged:
      origin !== undefined
        ? origin === messaging.PRIVILEGED_ORIGIN
        : typeof url === "string" &&
          url.startsWith(messaging.PRIVILEGED_ORIGIN),
  };
  if (tab) {
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
  method: "addFromRuleParts" | "removeFromRuleParts",
) => {
  for (const rawRule of text.split(/\s*[\n\r]+\s*/)) {
    const rule = rawRule.trim();
    if (rule === "") {
      continue;
    }
    const parts = rule.split(/\s+/);
    if (method === "addFromRuleParts") {
      ruleset.addFromRuleParts(parts as [string, string, string, string]);
    } else {
      ruleset.removeFromRuleParts(parts as [string, string, string, string]);
    }
  }
};

// Use getPopupData from sw-popup-data module (imported above)

const getToggleHandlers = () =>
  createToggleHandlers({
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

const toggleFirewallRule = (request: PopupRequest) =>
  getToggleHandlers().toggleFirewallRule(request);
const saveFirewallRules = (request: PopupRequest) =>
  getToggleHandlers().saveFirewallRules(request);
const revertFirewallRules = (request: PopupRequest) =>
  getToggleHandlers().revertFirewallRules(request);
const toggleHostnameSwitch = (request: PopupRequest) =>
  getToggleHandlers().toggleHostnameSwitch(request);
const toggleNetFiltering = (request: PopupRequest) =>
  getToggleHandlers().toggleNetFiltering(request);

const extensionOriginURL = chrome.runtime.getURL("");
const documentBlockedURL = chrome.runtime.getURL("document-blocked.html");

const isAbsoluteURL = (url: string) => /^[a-z][a-z\d+\-.]*:/i.test(url);

const normalizeExtensionPageURL = (url: string) => {
  if (isAbsoluteURL(url)) {
    return url;
  }
  return chrome.runtime.getURL(url.replace(/^\/+/, ""));
};

const isHiddenExtensionPage = (rawURL: string) =>
  rawURL.startsWith(extensionOriginURL) &&
  rawURL.startsWith(documentBlockedURL) === false;

const purgeAllCachesForDevTools = async () => {
  const bytesBefore = await chrome.storage.local.getBytesInUse(null);
  const keys = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(keys).filter(
    (key) => key.startsWith("assetCache_") || key.startsWith("cachedAsset_"),
  );
  if (cacheKeys.length !== 0) {
    await chrome.storage.local.remove(cacheKeys);
  }
  await chrome.storage.local.remove(["filterLists", "cachedAssets"]);
  const bytesAfter = await chrome.storage.local.getBytesInUse(null);
  return [
    `Storage used before: ${formatCount(bytesBefore)}B`,
    `Storage used after: ${formatCount(bytesAfter)}B`,
  ].join("\n");
};

const getDevToolsResponse = async (request: any) => {
  switch (request.what) {
    case "purgeAllCaches":
      return purgeAllCachesForDevTools();
    case "snfeBenchmark":
    case "cfeBenchmark":
    case "sfeBenchmark":
      return "Benchmark not implemented in MV3";
    case "snfeToDNR":
      return s14e.serialize("Static network filters already use DNR in MV3");
    case "snfeDump": {
      const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
      return [
        `Dynamic DNR rule count: ${dynamicRules.length}`,
        JSON.stringify(dynamicRules, null, 2),
      ].join("\n");
    }
    case "snfeQuery":
      return "Static network filter query is not implemented in MV3";
    case "cfeDump":
      return JSON.stringify(popupState.specificCosmeticFilters || {}, null, 2);
    default:
      return undefined;
  }
};

const getLoggerVisibleTabs = async () => {
  const tabs = await chrome.tabs.query({});
  const visibleTabs: Array<[number, string]> = [];

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }
    const rawURL = tab.url || tab.pendingUrl || "";
    if (rawURL !== "" && isHiddenExtensionPage(rawURL)) {
      continue;
    }
    const pageStore = pageStores.get(tab.id);
    const title =
      tab.title ||
      pageStore?.title ||
      pageStore?.hostname ||
      rawURL ||
      `${tab.id}`;
    visibleTabs.push([tab.id, title]);
  }

  visibleTabs.sort((a, b) => a[0] - b[0]);
  return visibleTabs;
};

const computeLoggerTabIdsToken = (tabIds: Array<[number, string]>) => {
  let token = tabIds.length;
  for (const [tabId, title] of tabIds) {
    token = (token * 33 + tabId) >>> 0;
    token = (token * 33 + title.length) >>> 0;
  }
  return token;
};

const getLoggerData = async (details: { ownerId: number; tabIdsToken?: number }) => {
  const activeTab = await getActiveTab().catch(() => null);
  const tabIds = await getLoggerVisibleTabs().catch(() => []);
  const tabIdsToken = computeLoggerTabIdsToken(tabIds);
  const response: {
    activeTabId?: number;
    colorBlind: boolean;
    entries: string[];
    tabIds?: Array<[number, string]>;
    tabIdsToken: number;
    tooltips: boolean;
  } = {
    activeTabId: activeTab?.id,
    colorBlind: popupState.userSettings.colorBlindFriendly === true,
    entries:
      logger?.readAll instanceof Function ? logger.readAll(details.ownerId) : [],
    tabIdsToken,
    tooltips: popupState.userSettings.tooltipsDisabled === false,
  };

  if (tabIdsToken !== details.tabIdsToken) {
    response.tabIds = tabIds;
  }

  if (response.activeTabId) {
    const activePageStore = await pageStoreFromTabId(response.activeTabId);
    const rawURL = activePageStore?.rawURL;
    if (typeof rawURL !== "string" || rawURL === "" || isHiddenExtensionPage(rawURL)) {
      response.activeTabId = undefined;
    }
  }

  return response;
};

const handlePopupPanelMessage = (request: PopupRequest) => {
  void ensureLegacyBackend().catch(() => {});
  // Handle gotoURL directly
  if (request.what === "gotoURL") {
    const details = request.details || request;
    const url = details?.url;
    if (url) {
      const createDetails: chrome.tabs.CreateProperties = {
        url: normalizeExtensionPageURL(url),
        active: details.shiftKey ? false : details.select !== false,
      };
      if (typeof details.index === "number" && details.index >= 0) {
        createDetails.index = details.index;
      }
      chrome.tabs.create({
        ...createDetails,
      });
      return { success: true };
    }
    return { success: false };
  }

  // Handle launchReporter - open support page
  if (request.what === "launchReporter") {
    return handleDashboardMessage(request);
  }

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
    redirectEngine:
      (globalThis as any).vAPI?.redirectEngine ||
      (globalThis as any).redirectEngine,
  }).handlePopupPanelMessage(request);
};

const getDashboardEngineState = () => ({
  logger,
  µb,
  cosmeticFilteringEngine,
  staticFilteringEngine: staticNetFilteringEngine,
  staticFilteringReverseLookup: (globalThis as any).vAPI
    ?.staticFilteringReverseLookup,
  publicSuffixList,
  redirectEngine:
    (globalThis as any).vAPI?.redirectEngine ||
    (globalThis as any).redirectEngine,
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
  reloadAllFilterLists: () =>
    reloadAllFilterLists(popupState, ensurePopupState),
  updateFilterListsNow: (request?: {
    assetKeys?: string[];
    preferOrigin?: boolean;
  }) => updateFilterListsNow(request, popupState, ensurePopupState),
  syncFirewallDnrRules,
  syncPowerSwitchDnrRules,
  findFilterListFromNetFilter,
  findFilterListFromCosmeticFilter,
  parseStoredCosmeticFilterData,
  elementPickerExec: (
    tabId: number,
    frameId: number,
    target?: string,
    zap?: boolean,
  ) => (self as any).µb.elementPickerExec(tabId, frameId, target, zap),
  getEngineState: getDashboardEngineState,
});

const handleLoggerUIMessage = async (request: PopupRequest) => {
  await ensureLegacyBackend().catch(() => {});
  switch (request.what) {
    case "readAll":
      if (logger?.ownerId !== undefined && logger.ownerId !== request.ownerId) {
        return { unavailable: true };
      }
      return getLoggerData(request as { ownerId: number; tabIdsToken?: number });

    case "toggleInMemoryFilter":
      if (typeof request.filter !== "string" || request.filter === "") {
        return false;
      }
      return µb.hasInMemoryFilter(request.filter)
        ? µb.removeInMemoryFilter(request.filter)
        : µb.addInMemoryFilter(request.filter);

    case "hasInMemoryFilter":
      return typeof request.filter === "string"
        ? µb.hasInMemoryFilter(request.filter)
        : false;

    case "releaseView":
      if (request.ownerId !== logger?.ownerId) {
        return;
      }
      logger.ownerId = undefined;
      await µb.clearInMemoryFilters();
      return;

    default:
      return handleDashboardMessage(request);
  }
};

// Requests in this set already have MV3-safe implementations in the modular
// dashboard handler. Route them there first so the giant legacy fallback block
// in sw-entry.ts does not reintroduce stale MV2-era behavior.
const defaultDashboardRoutedRequests = new Set([
  "gotoURL",
  "reloadTab",
  "dismissUnprocessedRequest",
  "launchReporter",
  "launchElementPicker",
  "scriptlet",
  "getAssetContent",
  "getTrustedScriptletTokens",
  "listsFromNetFilter",
  "listsFromCosmeticFilter",
  "getSupportData",
  "loggerDisabled",
  "readAll",
  "toggleInMemoryFilter",
  "hasInMemoryFilter",
  "releaseView",
  "snfeBenchmark",
  "cfeBenchmark",
  "sfeBenchmark",
  "snfeToDNR",
  "snfeDump",
  "snfeQuery",
  "cfeDump",
]);

const Messaging = createMessagingRouter({
  getLegacyMessaging,
  handlePopupPanelMessage,
  handleDashboardMessage,
  handleLoggerUIMessage,
});

const Zapper = createZapper(Messaging as unknown as LegacyMessagingAPI);
const Picker = createPicker(Messaging as unknown as LegacyMessagingAPI, Zapper);

const getHostnameSwitchState = (): Record<string, Record<string, boolean>> => {
  return popupState.sessionHostnameSwitches;
};

const getWhitelist = async () => {
  await ensurePopupState();
  return {
    whitelist: popupState.whitelist || [],
    whitelistDefault: userSettingsDefault.netWhitelistDefault || [],
    reBadHostname: reWhitelistBadHostname.source,
    reHostnameExtractor: reWhitelistHostnameExtractor.source,
  };
};

const setWhitelist = async (payload: { whitelist: string }) => {
  const whitelist =
    typeof payload?.whitelist === "string"
      ? payload.whitelist.split("\n").filter(Boolean)
      : [];
  await ensurePopupState();
  popupState.whitelist = whitelist;
  await chrome.storage.local.set({ whitelist: whitelist.join("\n") });
  await syncWhitelistDnrRules();
  broadcastFilteringBehaviorChanged();
  return { success: true };
};

registerMessagingHandlers(Messaging, {
  popupState,
  handlePopupPanelMessage,
  handleDashboardMessage,
  getHostnameSwitchState,
  parseStoredCosmeticFilterData,
  buildSpecificCosmeticPayload,
  getTabSwitchMetrics,
  getHiddenElementCountForTab: getHiddenElementCountForTabFromModule,
  getFilterListState,
  applyFilterListSelection,
  reloadAllFilterLists,
  updateFilterListsNow,
  getDashboardRules: () =>
    handleDashboardMessage({ what: "getRules" }),
  modifyDashboardRuleset: (payload: any) =>
    modifyDashboardRulesetFromModule(
      payload,
      popupState,
      ensurePopupState,
      persistPermanentFirewall,
      syncFirewallDnrRules,
    ),
  resetDashboardRules: () =>
    resetDashboardRulesFromModule(
      popupState,
      ensurePopupState,
      syncFirewallDnrRules,
    ),
  getLocalData,
  backupUserData,
  restoreUserData,
  resetUserData,
  getWhitelist,
  setWhitelist,
  pageStoreFromTabId,
});

// Use ping from sw-messaging-handlers module

// Use popupPanel from sw-messaging-handlers module

// Content script handlers for MV3
Messaging.on("retrieveContentScriptParameters", async (payload, callback) => {
  try {
    const tabId = payload?._tabId;
    const url = payload?.url || "";
    const frameId = payload?.frameId || 0;
    const hostname = url ? new URL(url).hostname : "";
    const origin = url ? new URL(url).origin : "";

    // Get frame ancestor details
    const ancestors: string[] = [];
    if (tabId !== undefined && frameId !== 0) {
      try {
        const stored = await chrome.storage.local.get("pageStoreMap");
        const pageStoreData = stored?.pageStoreMap?.[tabId];
        if (pageStoreData?.frameAncestors) {
          ancestors.push(...pageStoreData.frameAncestors);
        }
      } catch (e) {}
    }

    // Get per-site filtering state
    const storedFiltering = await chrome.storage.local.get("perSiteFiltering");
    const perSiteFiltering: Record<string, boolean> =
      storedFiltering?.perSiteFiltering || {};
    const pageScopeKey =
      hostname !== "" && url !== "" ? `${hostname}:${url}` : "";
    const netFilteringEnabled =
      hostname === ""
        ? true
        : (perSiteFiltering[pageScopeKey] ??
          perSiteFiltering[hostname] ??
          true);

    // Get user settings from storage
    const stored = await chrome.storage.local.get("userSettings");
    const userSettings = stored.userSettings || popupState.userSettings;

    // Get hostname switches
    const hostnameSwitches = await getHostnameSwitchState();
    const noCosmeticFilteringSwitch =
      hostname !== "" &&
      hostnameSwitches[hostname]?.["no-cosmetic-filtering"] === true;
    const noCosmeticFiltering =
      netFilteringEnabled === false || noCosmeticFilteringSwitch;

    // Get cosmetic filter data
    const storedCosmeticData = await chrome.storage.local.get(
      "cosmeticFiltersData",
    );
    const cosmeticData = parseStoredCosmeticFilterData(
      storedCosmeticData.cosmeticFiltersData,
    );

    // Get trusted scriptlet tokens
    let trustedScriptletTokens: string[] = [];
    try {
      const redirectEngine =
        (globalThis as any).vAPI?.redirectEngine ||
        (globalThis as any).redirectEngine;
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
      cloudStorageEnabled: typeof chrome.storage.sync !== "undefined",
      consoleLogEnabled: userSettings.consoleLogEnabled === true,
      contextMenuEnabled: userSettings.contextMenuEnabled === true,
      debugScriptlet: userSettings.debugScriptlet === true,
      extensionPopupEnabled: userSettings.extensionPopupEnabled !== false,
      externalRendererEnabled: false,
      filterAuthorMode: false,
      genericCosmeticFiltersHidden: noCosmeticFiltering,
      getSelection: () => {
        try {
          return window.getSelection()?.toString() || "";
        } catch (e) {
          return "";
        }
      },
      hidePlaceholders: userSettings.hidePlaceholders === true,
      hostname: hostname,
      ignoreGenericCosmeticFilters:
        userSettings.ignoreGenericCosmeticFilters === true,
      noCosmeticFiltering,
      noGenericCosmeticFiltering: noCosmeticFiltering,
      noSpecificCosmeticFiltering: noCosmeticFiltering,
      origin,
      pageUrl: url,
      parseAllABPHideFilters: userSettings.parseAllABPHideFilters === true,
      popupPanelType: "legacy",
      removeWLCollections: () => {},
      scriptletInjectable: true,
      scriptletWillInject: true,
      specificCosmeticFilters: noCosmeticFiltering
        ? {
            ready: true,
            injectedCSS: "",
            proceduralFilters: [],
            exceptionFilters: [],
            exceptedFilters: [],
            convertedProceduralFilters: [],
            genericCosmeticHashes: [],
            disableSurveyor: true,
          }
        : buildSpecificCosmeticPayload(hostname, cosmeticData),
      showIconBadge: userSettings.showIconBadge !== false,
      supportWebSocket: true,
      tabId: tabId,
      trustedScriptletTokens,
      url: url,
      userSettings: userSettings,
      userStyles: "",
      userScripts: "",
      webAllowWildcard: true,
      webextFlavor: "chromium",
    };

    if (callback) callback(response);
  } catch (e) {
    if (callback) callback({ error: (e as Error).message });
  }
});

Messaging.on("retrieveGenericCosmeticSelectors", async (payload, callback) => {
  try {
    const tabId = payload?._tabId;
    const hostname = payload?.hostname || "";
    const pageURL = payload?.url || "";
    const hashes = payload?.hashes || [];
    const exceptions = payload?.exceptions || [];
    const safeOnly = payload?.safeOnly === true;
    const storedFiltering = await chrome.storage.local.get("perSiteFiltering");
    const perSiteFiltering: Record<string, boolean> =
      storedFiltering?.perSiteFiltering || {};
    const pageScopeKey =
      hostname !== "" && pageURL !== "" ? `${hostname}:${pageURL}` : "";
    const netFilteringEnabled =
      hostname === ""
        ? true
        : (perSiteFiltering[pageScopeKey] ??
          perSiteFiltering[hostname] ??
          true);
    if (netFilteringEnabled === false) {
      const result = { injectedCSS: "", excepted: [] };
      if (callback) callback({ result });
      return;
    }

    // Load stored cosmetic filters
    const stored = await chrome.storage.local.get("cosmeticFiltersData");
    const cosmeticData = parseStoredCosmeticFilterData(
      stored.cosmeticFiltersData,
    );

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
    const pageHostname = payload?.hostname || "";

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
      } else if (matches.includes("*") || matches.includes(pageHostname)) {
        // Wildcard or exact match
        appliesToHostname = true;
      } else if (pageHostname) {
        // Check for subdomain match
        for (const match of matches) {
          if (pageHostname === match || pageHostname.endsWith("." + match)) {
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
    const filteredSelectors = selectors.filter((selector) => {
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

    const injectedCSS =
      filteredSelectors.join(",\n") + "\n{display:none!important;}";

    // Inject CSS into the tab
    if (tabId && injectedCSS) {
      try {
        await chrome.scripting.insertCSS({
          target: { tabId },
          css: injectedCSS,
        });
      } catch (e) {
        console.warn("[MV3] Failed to insert cosmetic CSS:", e);
      }
    }

    const result = {
      injectedCSS,
      excepted,
    };

    if (callback) callback({ result });
  } catch (e) {
    if (callback) callback({ error: (e as Error).message });
  }
});

// Use getTabId from sw-messaging-handlers module

// Use userSettings, setUserSettings, dashboardGetRules, dashboardModifyRuleset,
// dashboardResetRules, getWhitelist, setWhitelist from sw-messaging-handlers.

Messaging.on("documentBlocked", async (request, callback) => {
  if (
    request.what === "listsFromNetFilter" ||
    request.what === "listsFromCosmeticFilter"
  ) {
    const result = await handleDashboardMessage(request);
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (request.what === "closeThisTab") {
    const tabId = request._sender?.tab?.id;
    if (typeof tabId === "number") {
      await chrome.tabs.remove(tabId);
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "temporarilyWhitelistDocument") {
    const hostname = request.hostname as string;
    if (hostname) {
      // Use webRequest.strictBlockBypass if available
      const webRequest = (globalThis as any).vAPI?.webRequest;
      if (webRequest?.strictBlockBypass) {
        webRequest.strictBlockBypass(hostname);
      }

      // Also set session hostname switch for DNR
      await ensurePopupState();
      popupState.sessionHostnameSwitches[`${hostname}:no-strict-blocking`] =
        true;
      await persistHostnameSwitches();
      await syncHostnameSwitchDnrRules();
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "toggleHostnameSwitch") {
    const hostname = request.hostname as string;
    const switchName = request.name as string;
    const state = request.state !== false;
    const persist = request.persist === true;

    if (hostname && switchName === "no-strict-blocking") {
      await ensurePopupState();
      const sessionSwitches = cloneHostnameSwitchState(
        popupState.sessionHostnameSwitches,
      );
      sessionSwitches[hostname] = {
        ...(sessionSwitches[hostname] || {}),
        [switchName]: state,
      };
      popupState.sessionHostnameSwitches = sessionSwitches;

      if (persist) {
        popupState.permanentHostnameSwitches = cloneHostnameSwitchState(
          sessionSwitches,
        );
        await persistPermanentHostnameSwitches();
      }

      await syncHostnameSwitchDnrRules();
      broadcastFilteringBehaviorChanged();

      const result = { success: true };
      if (callback) {
        callback(result);
      }
      return result;
    }

    const result = await toggleHostnameSwitch(request);
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (callback) {
    callback({ success: false });
  }
  return { success: false };
});

Messaging.on("devTools", async (request, callback) => {
  const result = await getDevToolsResponse(request);
  if (result !== undefined) {
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (callback) {
    callback({ success: false });
  }
  return { success: false };
});

// Use getAssetContent from sw-messaging-handlers module
// Use getAutoCompleteDetails from sw-messaging-handlers module
// Use getTrustedScriptletTokens from sw-messaging-handlers module

Messaging.on("scriptlets", async (request, callback) => {
  if (request.what === "applyFilterListSelection") {
    const result = await applyFilterListSelection(
      request as {
        toSelect?: string[];
        toImport?: string;
        toRemove?: string[];
      },
      popupState,
      ensurePopupState,
    );
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (request.what === "reloadAllFilters") {
    const result = await reloadAllFilterLists(popupState, ensurePopupState);
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (request.what === "getAdvancedSettings") {
    const items = await chrome.storage.local.get("advancedSettings");
    const result = items.advancedSettings || {};
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (request.what === "setAdvancedSettings") {
    const settings = request.settings as Record<string, string>;
    if (settings) {
      await chrome.storage.local.set({ advancedSettings: settings });
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "readHiddenSettings") {
    const items = await chrome.storage.local.get("hiddenSettings");
    const result = items.hiddenSettings || {};
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (request.what === "writeHiddenSettings") {
    const settings = request.settings as Record<string, any>;
    if (settings) {
      await chrome.storage.local.set({ hiddenSettings: settings });
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "cloudUsed") {
    const now = Date.now();
    await chrome.storage.local.set({ lastCloudSync: now });
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (callback) {
    callback({ success: false });
  }
  return { success: false };
});

Messaging.on("default", async (request, callback) => {
  const what = request.what || request?.details?.what;

  if (typeof what === "string" && defaultDashboardRoutedRequests.has(what)) {
    const delegated = await handleDashboardMessage({ ...request, what });
    if (callback) {
      callback(delegated);
    }
    return delegated;
  }

  if (what === "assetViewerRead") {
    const assetKey = request.assetKey as string;
    if (assetKey) {
      const items = await chrome.storage.local.get("assetViewerReadList");
      const readList: string[] = items.assetViewerReadList || [];
      if (!readList.includes(assetKey)) {
        readList.push(assetKey);
        await chrome.storage.local.set({ assetViewerReadList: readList });
      }
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "getHiddenElementCount") {
    const tabId = request.tabId as number;
    if (typeof tabId === "number") {
      try {
        const results = await chrome.tabs.sendMessage(tabId, {
          what: "getHiddenElementCount",
        });
        if (callback) {
          callback(results);
        }
        return results;
      } catch (e) {
        if (callback) {
          callback({ count: 0 });
        }
        return { count: 0 };
      }
    }
    if (callback) {
      callback({ count: 0 });
    }
    return { count: 0 };
  }
  if (request.what === "getScriptCount") {
    const tabId = request.tabId as number;
    if (typeof tabId === "number") {
      try {
        const results = await chrome.tabs.sendMessage(tabId, {
          what: "getScriptCount",
        });
        if (callback) {
          callback(results);
        }
        return results;
      } catch (e) {
        if (callback) {
          callback({ count: 0 });
        }
        return { count: 0 };
      }
    }
    if (callback) {
      callback({ count: 0 });
    }
    return { count: 0 };
  }
  if (request.what === "readyToFilter") {
    const tabId = request.tabId as number;
    const url = request.url as string;

    // Return readyToFilter status - just the boolean like reference
    const isReady = popupState.initialized === true;

    if (typeof tabId === "number") {
      try {
        // Signal content script that page is ready for filtering
        await chrome.tabs.sendMessage(tabId, { what: "readyToFilter", url });

        // Update toolbar icon to show filtering is active
        await updateToolbarIcon(tabId, { filtering: true });
      } catch (e) {
        // Ignore errors
      }
    }
    if (callback) {
      callback(isReady);
    }
    return isReady;
  }
  if (request.what === "clickToLoad") {
    const tabId = request.tabId as number;
    const hostname = request.hostname as string;
    if (typeof tabId === "number" && hostname) {
      try {
        // Notify content script to allow blocked element
        await chrome.tabs.sendMessage(tabId, { what: "clickToLoad", hostname });

        // Update toolbar icon to reflect change
        await updateToolbarIcon(tabId, { clickToLoad: hostname });
      } catch (e) {
        // Ignore errors
      }
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "updateLists") {
    await reloadAllFilterLists(popupState, ensurePopupState);
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "createUserFilter") {
    const filter = request.filter as string;
    if (filter) {
      try {
        const stored = await chrome.storage.local.get([
          "userFilters",
          "user-filters",
        ]);
        const userFilters =
          typeof stored?.userFilters === "string"
            ? stored.userFilters
            : typeof stored?.["user-filters"] === "string"
              ? stored["user-filters"]
              : "";
        const newFilters = userFilters + "\n" + filter;
        await chrome.storage.local.set({
          userFilters: newFilters,
          "user-filters": newFilters,
        });
        await reloadAllFilterLists(popupState, ensurePopupState);
      } catch (e) {
        /* ignore */
      }
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "purgeAllCaches") {
    try {
      const result = {
        success: true,
        report: await purgeAllCachesForDevTools(),
      };
      if (callback) {
        callback(result);
      }
      return result;
    } catch (e) {
      const result = { success: false, error: (e as Error).message };
      if (callback) {
        callback(result);
      }
      return result;
    }
  }
  if (request.what === "saveURLFilteringRules") {
    const rules = request.rules as any[];
    const colors = request.colors as Record<string, string>;
    if (rules) {
      // Save URL filtering rules with colors
      await chrome.storage.local.set({
        urlFilteringRules: rules,
        urlFilteringColors: colors || {
          allow: "#4caf50",
          block: "#f44336",
          noop: "#ff9800",
        },
        urlFilteringDirty: false,
      });
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "setURLFilteringRule") {
    const rule = request.rule as any;
    if (rule) {
      const stored = await chrome.storage.local.get("urlFilteringRules");
      const rules = stored?.urlFilteringRules || [];

      // Check if rule already exists and toggle it
      const existingIndex = rules.findIndex(
        (r: any) =>
          r.urlPattern === rule.urlPattern && r.action === rule.action,
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
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  if (request.what === "getURLFilteringData") {
    const stored = await chrome.storage.local.get("urlFilteringRules");
    const storedColors = await chrome.storage.local.get("urlFilteringColors");
    const storedDirty = await chrome.storage.local.get("urlFilteringDirty");

    // Default URL filtering colors
    const defaultColors = {
      allow: "#4caf50",
      block: "#f44336",
      noop: "#ff9800",
    };

    const result = {
      urlFilters: stored?.urlFilteringRules || [],
      colors: storedColors?.urlFilteringColors || defaultColors,
      dirty: storedDirty?.urlFilteringDirty || false,
    };
    if (callback) {
      callback(result);
    }
    return result;
  }
  // UI styles handlers
  if (request.what === "uiStyles") {
    const stored = await chrome.storage.local.get("userSettings");
    const hiddenStored = await chrome.storage.local.get("hiddenSettings");
    const userSettings = stored?.userSettings || {};
    const hiddenSettings = hiddenStored?.hiddenSettings || {};
    const dark =
      typeof self.matchMedia === "function" &&
      self.matchMedia("(prefers-color-scheme: dark)").matches;
    const accent = userSettings.uiAccentCustom || "#717191";

    // Build accent stylesheet
    const accentStylesheet =
      popupState.uiAccentStylesheet || generateAccentStylesheet(accent, dark);

    const result = {
      dark,
      accent,
      uiAccentCustom: userSettings.uiAccentCustom || false,
      uiAccentCustom0: userSettings.uiAccentCustom0 || "#3498d6",
      uiAccentStylesheet: accentStylesheet,
      uiStyles: hiddenSettings.uiStyles || "",
      uiTheme: userSettings.uiTheme || "default",
    };
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (request.what === "uiAccentStylesheet") {
    const stored = await chrome.storage.local.get("userSettings");
    const userSettings = stored?.userSettings || {};

    const accent = userSettings.uiAccentCustom || "#717191";
    const dark =
      userSettings.darkMode === true ||
      (userSettings.darkMode === undefined &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

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

${
  dark
    ? `
:root {
    --dark: 1;
}
`
    : ""
}
`;

    // Store the accent stylesheet in popupState for reference
    popupState.uiAccentStylesheet = result;

    if (callback) {
      callback(result);
    }
    return result;
  }
  // Store custom accent stylesheet when sent from UI
  if (request.what === "saveUiAccentStylesheet") {
    const stylesheet = request.stylesheet as string;
    if (typeof stylesheet === "string") {
      popupState.uiAccentStylesheet = stylesheet;
      await chrome.storage.local.set({ uiAccentStylesheet: stylesheet });
    }
    if (callback) {
      callback({ success: true });
    }
    return { success: true };
  }
  // DOM Inspector args
  if (request.what === "getInspectorArgs") {
    const tabId = request.tabId as number;
    const frameId = request.frameId as number;

    // Create BroadcastChannel for inspector communication
    try {
      const bc = new BroadcastChannel("contentInspectorChannel");
      bc.postMessage({
        topic: "inspector",
        tabId,
        frameId,
        timestamp: Date.now(),
      });
      bc.close();
    } catch (e) {
      // BroadcastChannel not available
    }

    // Get war secret for secure URL
    const warSecret =
      (globalThis as any).vAPI?.warSecret?.short?.() ||
      Math.random().toString(36).slice(2, 10);

    const result = {
      tabId,
      frameId,
      inspectorURL: `/web_accessible_resources/dom-inspector.html?secret=${warSecret}`,
    };
    if (callback) {
      callback(result);
    }
    return result;
  }
  if (callback) {
    callback(undefined);
  }
  return undefined;
});

// Use findFilterListFromNetFilter from sw-filter-finders module
// Use findFilterListFromCosmeticFilter from sw-filter-finders module
// Use pickerContextMenuPoint from sw-messaging-handlers module

registerChromeEventHandlers(
  trackPendingRequest,
  finalizeTrackedRequest,
  clearTabRequestState,
  pageStores,
  Zapper,
  Picker,
  applyPersistedHostnameSwitchesForTab,
  registerVideoAdBlocker,
);

void ensureLegacyBackend().catch(() => {});

ensurePopupState()
  .then(() => {
    syncFirewallDnrRules();
    // syncFilterListDnrRules is already imported from sw-policies
    syncFilterListDnrRules();
    syncPowerSwitchDnrRules();
    syncHostnameSwitchDnrRules();
    syncWhitelistDnrRules();
  })
  .catch(() => {
    /* ignore */
  });

(self as any).µBlockMV3 = {
  userSettings: popupState.userSettings,
  permanentFirewall: popupState.permanentFirewall,
  sessionFirewall: popupState.sessionFirewall,
};

(self as any).Messaging = Messaging;
(self as any).Zapper = Zapper;
(self as any).Picker = Picker;

(self as any).µb = {
  elementPickerExec: async function (
    tabId: number,
    frameId: number,
    target?: string,
  ) {
    const point =
      getPickerContextPoint(tabId, 0) || getPickerContextPoint(tabId, frameId);
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
  reWhitelistBadHostname:
    /(^|\.)(localhost|localhost\.localdomain|127\.0\.0\.1|0\.0\.0\.0|255\.255\.255\.255)$/,
  reWhitelistHostnameExtractor: /^https?:\/\/([^/:]+)/,
  selectedFilterLists: [] as string[],
  pageStores: pageStores,
  pageStoresToken: pageStoresToken,
  cloudStorageSupported: typeof chrome.storage.sync !== "undefined",
  privacySettingsSupported:
    typeof navigator !== "undefined" &&
    typeof navigator.connection !== "undefined",
  restoreBackupSettings: {},
  userFiltersPath: "user-filters",
  maybeGoodPopup: { tabId: 0, url: "" },
  epickerArgs: { target: "", mouse: false, zap: false, eprom: null },
  tabContextManager: {
    mustLookup: (tabId: number) => ({ tabId, hostname: "" }),
    lookup: (tabId: number) => null,
  },
  arrayFromWhitelist: (whitelist: string[]) => {
    if (!whitelist) return [];
    return whitelist.split("\n").filter((line) => line.trim() !== "");
  },
  whitelistFromString: (str: string) => {
    if (!str) return "";
    return str
      .split("\n")
      .filter((line) => line.trim() !== "")
      .join("\n");
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
    return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  },
  getBytesInUse: async () => {
    const result = await chrome.storage.local.getBytesInUse();
    return result;
  },
  saveLocalSettings: async () => {
    await chrome.storage.local.set({ userSettings: popupState.userSettings });
  },
  saveWhitelist: async () => {
    await chrome.storage.local.set({
      whitelist: popupState.whitelist.join("\n"),
    });
  },
  saveUserFilters: async (filters: string) => {
    await chrome.storage.local.set({
      userFilters: filters,
      "user-filters": filters,
    });
    await reloadAllFilterLists(popupState, ensurePopupState);
  },
  loadUserFilters: async () => {
    const stored = await chrome.storage.local.get([
      "userFilters",
      "user-filters",
    ]);
    if (typeof stored?.userFilters === "string") {
      return stored.userFilters;
    }
    if (typeof stored?.["user-filters"] === "string") {
      return stored["user-filters"];
    }
    return "";
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
    const filters = request.filters || "";
    await chrome.storage.local.set({
      userFilters: filters,
      "user-filters": filters,
    });
    await reloadAllFilterLists(popupState, ensurePopupState);
    return { success: true };
  },
  updateToolbarIcon: async (
    tabId: number,
    state:
      | number
      | { filtering?: boolean; largeMedia?: boolean; noPopups?: boolean },
  ) => {
    await updateToolbarIcon(tabId, state);
  },
  openNewTab: async (details: {
    url: string;
    select?: boolean;
    index?: number;
  }) => {
    const createDetails: chrome.tabs.CreateProperties = {
      url: normalizeExtensionPageURL(details.url),
      active: details.select !== false,
    };
    if (typeof details.index === "number" && details.index >= 0) {
      createDetails.index = details.index;
    }
    const created = await chrome.tabs.create(createDetails);
    return { tabId: created.id };
  },
  clearInMemoryFilters: () => {
    popupState.inMemoryFilter = "";
  },
  toggleHostnameSwitch: (request: any) => {
    return toggleHostnameSwitch(request);
  },
  getTabId: (sender: any) => sender?.tab?.id,
  pageStoreFromTabId: pageStoreFromTabId,
};

initContextMenu(popupState.userSettings);
