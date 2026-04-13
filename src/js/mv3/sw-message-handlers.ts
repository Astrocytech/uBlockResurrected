/*******************************************************************************

    uBlock Origin - MV3 Message Handlers
    https://github.com/gorhill/uBlock

    This file contains message handlers for popup panel and dashboard.

*******************************************************************************/

import { PopupState } from "./sw-storage.js";
import {
  getFilterListState,
  applyFilterListSelection,
  reloadAllFilterLists,
  updateFilterListsNow,
} from "./sw-policies.js";

export interface PopupRequest {
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
  url?: string;
  scope?: string;
  frameId?: number;
  frameURL?: string;
  userFilters?: string;
  enabled?: boolean;
  data?: any;
  deviceName?: string;
  syncEnabled?: boolean;
  assetKeys?: string[];
  preferOrigin?: boolean;
  toSelect?: string[];
  toImport?: string;
  toRemove?: string[];
  userData?: unknown;
  file?: string;
}

export type MessageHandlersDeps = {
  popupState: PopupState;
  getPopupData: (request: PopupRequest) => Promise<any>;
  getTabSwitchMetrics: (tabId: number) => Promise<any>;
  getHiddenElementCountForTab: (tabId: number) => Promise<number>;
  pageStoreFromTabId: (tabId: number) => Promise<any>;
  setUserSetting: (request: PopupRequest) => Promise<any>;
  getLocalData: () => Promise<any>;
  backupUserData: () => Promise<void>;
  restoreUserData: (request: any) => Promise<void>;
  resetUserData: () => Promise<void>;
  reloadAllFilterLists: () => Promise<any>;
  getDeviceName: () => Promise<string>;
  encodeCloudData: (data: any) => Promise<string>;
  decodeCloudData: (encoded: string) => Promise<any>;
  cloudPull: () => Promise<any>;
  cloudPush: (data: any) => Promise<void>;
  toggleNetFiltering: (request: PopupRequest) => Promise<any>;
  toggleFirewallRule: (request: PopupRequest) => Promise<any>;
  saveFirewallRules: (request: PopupRequest) => Promise<any>;
  revertFirewallRules: (request: PopupRequest) => Promise<any>;
  toggleHostnameSwitch: (request: PopupRequest) => Promise<any>;
  getFirewallRulesForPopup: (
    srcHostname: string,
    hostnameDict: Record<string, any>,
  ) => Record<string, string>;
  hostnameSwitchNames: Set<string>;
  updateToolbarIcon: (
    tabId: number,
    options: { filtering?: boolean },
  ) => Promise<void>;
  µb: any;
  redirectEngine: any;
};

export const createMessageHandlers = (deps: MessageHandlersDeps) => {
  const {
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
    toggleNetFiltering,
    toggleFirewallRule,
    saveFirewallRules,
    revertFirewallRules,
    toggleHostnameSwitch,
    getFirewallRulesForPopup,
    hostnameSwitchNames,
    updateToolbarIcon,
    µb,
    redirectEngine,
  } = deps;

  const handlePopupPanelMessage = async (request: PopupRequest) => {
    switch (request.what) {
      case "getPopupData": {
        const result = await getPopupData(request);
        // Update toolbar icon when popup opens to reflect current filtering state
        if (request.tabId) {
          const storedFiltering =
            await chrome.storage.local.get("perSiteFiltering");
          const perSiteFiltering = storedFiltering?.perSiteFiltering || {};
          try {
            const tab = await chrome.tabs.get(request.tabId);
            if (tab?.url) {
              const hostname = new URL(tab.url).hostname;
              const pageKey = `${hostname}:${tab.url}`;
              const isFiltering =
                perSiteFiltering[pageKey] !== false &&
                perSiteFiltering[hostname] !== false;
              await updateToolbarIcon(request.tabId, {
                filtering: isFiltering,
              });
            }
          } catch {}
        }
        return result;
      }
      case "toggleNetFiltering":
        return toggleNetFiltering(request);
      case "toggleFirewallRule":
        return toggleFirewallRule(request);
      case "saveFirewallRules":
        return saveFirewallRules(request);
      case "revertFirewallRules":
        return revertFirewallRules(request);
      case "getScriptCount":
        return request.tabId
          ? (await getTabSwitchMetrics(request.tabId)).scriptCount
          : 0;
      case "getHiddenElementCount":
        return request.tabId
          ? await getHiddenElementCountForTab(request.tabId)
          : 0;
      case "toggleHostnameSwitch":
        return toggleHostnameSwitch(request);
      case "userSettings":
        return setUserSetting(request);
      case "readyToFilter":
        return popupState.initialized;
      case "clickToLoad": {
        const tabId = request.tabId as number;
        const frameId = request.frameId as number;
        const frameURL = request.frameURL as string;
        if (tabId && frameId && frameURL) {
          const pageStore = await pageStoreFromTabId(tabId);
          if (pageStore) {
            await pageStore.clickToLoad(frameId, frameURL);
          }
        }
        return { success: true };
      }
      default:
        return undefined;
    }
  };

  const handleDashboardMessage = async (request: PopupRequest) => {
    switch (request.what) {
      case "getLists":
        return getFilterListState(popupState, () => Promise.resolve());
      case "applyFilterListSelection":
        return applyFilterListSelection(
          request as {
            toSelect?: string[];
            toImport?: string;
            toRemove?: string[];
          },
          popupState,
          () => Promise.resolve(),
        );
      case "reloadAllFilters":
        return reloadAllFilterLists(popupState, () => Promise.resolve());
      case "updateNow":
        return updateFilterListsNow(undefined, popupState, () =>
          Promise.resolve(),
        );
      case "listsUpdateNow":
        return updateFilterListsNow(
          request as { assetKeys?: string[]; preferOrigin?: boolean },
          popupState,
          () => Promise.resolve(),
        );
      case "userSettings":
        return setUserSetting(request);
      case "getLocalData":
        return getLocalData();
      case "backupUserData":
        return backupUserData();
      case "restoreUserData":
        return restoreUserData(
          request as { userData?: unknown; file?: string },
        );
      case "resetUserData":
        return resetUserData();
      case "readUserFilters": {
        const items = await chrome.storage.local.get("userFilters");
        const enabled = await chrome.storage.local.get("userFiltersEnabled");
        const selectedLists = await chrome.storage.local.get(
          "selectedFilterLists",
        );

        const userFiltersPath = "userfilters";
        const isSelected =
          selectedLists?.selectedFilterLists?.includes(userFiltersPath) ||
          false;
        const isTrusted = popupState.trustedLists?.[userFiltersPath] === true;

        return {
          userFilters: items.userFilters || "",
          enabled: enabled?.userFiltersEnabled !== false ? isSelected : false,
          trusted: isTrusted,
        };
      }
      case "writeUserFilters": {
        const userFilters = request.userFilters as string;
        const enabled = request.enabled as boolean;
        if (typeof userFilters === "string") {
          const MAX_FILTER_SIZE = 10 * 1024 * 1024;
          if (userFilters.length > MAX_FILTER_SIZE) {
            return { success: false, error: "Filter size exceeds limit" };
          }
          await chrome.storage.local.set({ userFilters });
          if (typeof enabled === "boolean") {
            await chrome.storage.local.set({ userFiltersEnabled: enabled });
          }
          await reloadAllFilterLists(popupState, () => Promise.resolve());
          return { success: true };
        }
        return { success: false, error: "Invalid userFilters" };
      }
      case "cloudGetOptions": {
        const stored = await chrome.storage.local.get("cloudOptions");
        const userSettings =
          (await chrome.storage.local.get("userSettings")).userSettings || {};
        const options = stored?.cloudOptions || {};
        const deviceName = options.deviceName || (await getDeviceName());
        const syncStorageAvailable = typeof chrome.storage.sync !== "undefined";
        return {
          deviceName,
          syncEnabled: options.syncEnabled !== false,
          enabled: userSettings.cloudStorageEnabled === true,
          cloudStorageSupported: syncStorageAvailable,
        };
      }
      case "cloudSetOptions": {
        const options = request as {
          deviceName?: string;
          syncEnabled?: boolean;
        };
        const stored = await chrome.storage.local.get("cloudOptions");
        const existing = stored?.cloudOptions || {};
        if (typeof options.deviceName === "string") {
          existing.deviceName = options.deviceName;
        }
        if (typeof options.syncEnabled === "boolean") {
          existing.syncEnabled = options.syncEnabled;
        }
        await chrome.storage.local.set({ cloudOptions: existing });
        return { success: true };
      }
      case "cloudPull": {
        const useSync = typeof chrome.storage.sync !== "undefined";
        const cloudKey = "cloudData";
        const stored = useSync
          ? await chrome.storage.sync.get(cloudKey)
          : await chrome.storage.local.get(cloudKey);
        const cloudData = stored?.[cloudKey];
        if (!cloudData) return { error: "No cloud data" };

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
      case "cloudPush": {
        const cloudData = request.data;
        if (!cloudData) return { error: "No data to push" };

        try {
          const dataToPush = {
            ...cloudData,
            serverTime: Date.now(),
            clientTime: Date.now(),
          };

          const encoded = await encodeCloudData(dataToPush);

          const useSync = typeof chrome.storage.sync !== "undefined";
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
              lastCloudSync: Date.now(),
            });
          } else {
            await chrome.storage.local.set({
              cloudStorageUsed: storageUsed,
              lastCloudSync: Date.now(),
            });
          }

          return { success: true, clientId: cloudData.clientId };
        } catch (e) {
          return { error: (e as Error).message };
        }
      }
      case "cloudUsed": {
        const useSync = typeof chrome.storage.sync !== "undefined";
        const storageUsed = useSync
          ? await chrome.storage.sync.getBytesInUse()
          : await chrome.storage.local.getBytesInUse();

        const cloudKey = useSync ? "cloudData" : "cloudData";
        const cloudData = useSync
          ? await chrome.storage.sync.get(cloudKey)
          : await chrome.storage.local.get(cloudKey);
        const cloudSize = cloudData?.[cloudKey]
          ? JSON.stringify(cloudData[cloudKey]).length
          : 0;

        const lastCloudSync = useSync
          ? await chrome.storage.sync.get("lastCloudSync")
          : await chrome.storage.local.get("lastCloudSync");

        return {
          used: cloudSize,
          total: storageUsed,
          lastSync: lastCloudSync?.lastCloudSync || 0,
        };
      }
      case "getAppData": {
        const manifest = chrome.runtime.getManifest();
        const stored = await chrome.storage.local.get("hiddenSettings");
        const hiddenSettings = stored?.hiddenSettings || {};
        const whitelistStored = await chrome.storage.local.get("whitelist");
        const whitelist = whitelistStored?.whitelist || "";

        return {
          name: manifest.name || "uBlock Resurrected",
          version: manifest.version || "1.0.0",
          canBenchmark: hiddenSettings?.benchmarkDatasetURL !== "unset",
          whitelist: µb?.arrayFromWhitelist?.(whitelist) || [],
          whitelistDefault: µb?.netWhitelistDefault || [],
          reBadHostname:
            µb?.reWhitelistBadHostname?.source ||
            "(^|\\.)(localhost|localhost\\.localdomain|127\\.0\\.0\\.1|0\\.0\\.0\\.0|255\\.255\\.255\\.255)$/",
          reHostnameExtractor:
            µb?.reWhitelistHostnameExtractor?.source ||
            "^https?:\\/\\/([^/:]+)",
        };
      }
      case "getTrustedScriptletTokens": {
        if (redirectEngine?.getTrustedScriptletTokens) {
          return redirectEngine.getTrustedScriptletTokens();
        }
        return [];
      }
      case "getWhitelist": {
        const whitelistStored = await chrome.storage.local.get("whitelist");
        const whitelist = whitelistStored?.whitelist || "";
        return {
          whitelist: µb?.arrayFromWhitelist?.(whitelist) || [],
          whitelistDefault: µb?.netWhitelistDefault || [],
        };
      }
      case "setWhitelist": {
        const whitelist = request.whitelist as string[];
        if (Array.isArray(whitelist)) {
          const whitelistText =
            µb?.whitelistToString?.(whitelist) || whitelist.join("\n");
          await chrome.storage.local.set({ whitelist: whitelistText });
          return { success: true };
        }
        return { success: false };
      }
      case "getFirewallRules": {
        const srcHostname = (request.srcHostname as string) || "*";
        const desHostnames =
          (request.desHostnames as Record<string, unknown>) || {};
        const hostnameDict =
          (request.hostnameDict as Record<string, any>) || {};
        return getFirewallRulesForPopup(srcHostname, hostnameDict);
      }
      case "getDynamicRules": {
        return popupState.sessionFirewall.toArray();
      }
      case "setFirewallRule": {
        return toggleFirewallRule(request);
      }
      case "saveFirewallRules": {
        return saveFirewallRules(request);
      }
      case "revertFirewallRules": {
        return revertFirewallRules(request);
      }
      case "getHostnameSwitches": {
        return popupState.sessionHostnameSwitches;
      }
      case "setHostnameSwitch": {
        return toggleHostnameSwitch(request);
      }
      case "getPerSiteSwitchMetrics": {
        const tabId = request.tabId as number;
        if (typeof tabId === "number") {
          return getTabSwitchMetrics(tabId);
        }
        return { popupBlockedCount: 0, scriptCount: 0 };
      }
      case "getStats": {
        const tabId = request.tabId as number;
        const which = request.whatStats || "all";

        if (which === "all" || which === "global") {
          return {
            allowedCount: popupState.globalAllowedRequestCount,
            blockedCount: popupState.globalBlockedRequestCount,
          };
        }

        if (which === "tab" && typeof tabId === "number") {
          const tabMetrics = popupState.tabMetrics[tabId];
          return {
            allowedCount: tabMetrics?.allowed || 0,
            blockedCount: tabMetrics?.blocked || 0,
          };
        }

        return { allowedCount: 0, blockedCount: 0 };
      }
      default:
        return undefined;
    }
  };

  return {
    handlePopupPanelMessage,
    handleDashboardMessage,
  };
};

export const handleDashboardMessage = createMessageHandlers({
  popupState: {} as any,
  getPopupData: async () => ({}),
  getTabSwitchMetrics: async () => ({ scriptCount: 0 }),
  getHiddenElementCountForTab: async () => 0,
  pageStoreFromTabId: async () => null,
  setUserSetting: async () => ({}),
  getLocalData: async () => ({}),
  backupUserData: async () => {},
  restoreUserData: async () => {},
  resetUserData: async () => {},
  reloadAllFilterLists: async () => ({}),
  getDeviceName: async () => "",
  encodeCloudData: async () => "",
  decodeCloudData: async () => ({}),
  cloudPull: async () => ({}),
  cloudPush: async () => {},
  toggleNetFiltering: async () => ({}),
  toggleFirewallRule: async () => ({}),
  saveFirewallRules: async () => ({}),
  revertFirewallRules: async () => ({}),
  toggleHostnameSwitch: async () => ({}),
  getFirewallRulesForPopup: () => ({}),
  hostnameSwitchNames: new Set<string>(),
  updateToolbarIcon: async () => {},
  µb: null,
  redirectEngine: null,
} as MessageHandlersDeps).handleDashboardMessage;
