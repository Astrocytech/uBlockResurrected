/*******************************************************************************

    uBlock Origin - MV3 Service Worker Popup Data
    Handles gathering all data needed for the popup panel

*******************************************************************************/

import {
  createCounts,
  cloneHostnameDetails,
  zeroHostnameDetails,
  mergeCounts,
  domainFromHostname,
  getTabForRequest,
} from "./sw-helpers.js";

import { ensurePopupState, popupState } from "./sw-storage.js";

import { pageStoreFromTabId } from "./sw-pagestore.js";

import { loadTabRequestStateWithRetry } from "./sw-request-tracking.js";

import { getMatchedBlockedRequestCountForTab } from "./sw-request-handlers.js";

import { getTabSwitchMetrics } from "./sw-tab-metrics.js";

import { getFirewallRulesForPopup } from "./sw-firewall.js";

import type { PopupRequest, HostnameDetails } from "./sw-types.js";

const hasSameHostnameSwitches = (
  hostname: string,
  sessionSwitches: Record<string, Record<string, boolean>>,
  permanentSwitches: Record<string, Record<string, boolean>>,
) => {
  const session = sessionSwitches[hostname] || {};
  const permanent = permanentSwitches[hostname] || {};
  const keys = new Set([...Object.keys(session), ...Object.keys(permanent)]);
  for (const key of keys) {
    if ((session[key] === true) !== (permanent[key] === true)) {
      return false;
    }
  }
  return true;
};

export const getPopupData = async (request: PopupRequest) => {
  await ensurePopupState();
  const tab = await getTabForRequest(request.tabId);
  const tabId = tab?.id ?? 0;
  const pageURL = tab?.url || "";
  const pageTitle = tab?.title || "";
  const pageHostname = (() => {
    try {
      return pageURL ? new URL(pageURL).hostname : "";
    } catch {
      return "";
    }
  })();
  const pageDomain = domainFromHostname(pageHostname);
  const canElementPicker =
    tabId > 0 &&
    /^(https?:|file:)/.test(pageURL) &&
    pageURL.startsWith(chrome.runtime.getURL("")) === false;

  const pageStore = tabId > 0 ? await pageStoreFromTabId(tabId) : null;

  const trackedState =
    typeof tabId === "number"
      ? await loadTabRequestStateWithRetry(tabId)
      : undefined;
  const liveState =
    typeof tabId === "number" && pageHostname !== ""
      ? await collectTabHostnameData(tabId, pageHostname)
      : undefined;

  const hostnameDict: Record<string, HostnameDetails> = {};
  if (pageHostname !== "") {
    hostnameDict[pageHostname] = zeroHostnameDetails(pageHostname);
  }
  if (pageStore) {
    const hostnameDetailsMap = pageStore.getAllHostnameDetails();
    if (hostnameDetailsMap) {
      for (const [hostname, details] of hostnameDetailsMap) {
        hostnameDict[hostname] = cloneHostnameDetails({
          domain: (details as any).domain || hostname,
          counts: (details as any).counts || createCounts(),
          cname: (details as any).cname,
        });
      }
    }
  }
  if (trackedState?.hostnameDict) {
    for (const [hostname, details] of Object.entries(
      trackedState.hostnameDict,
    )) {
      if (hostnameDict[hostname] === undefined) {
        hostnameDict[hostname] = cloneHostnameDetails(details);
      }
    }
  }
  if (liveState?.hostnameDict) {
    for (const [hostname, details] of Object.entries(liveState.hostnameDict)) {
      if (hostnameDict[hostname] === undefined) {
        hostnameDict[hostname] = cloneHostnameDetails(details);
        continue;
      }
      if (trackedState === undefined) {
        mergeCounts(hostnameDict[hostname].counts, details.counts);
      }
    }
  }

  let pageCounts = pageStore?.counts
    ? {
        blocked: { ...pageStore.counts.blocked },
        allowed: { ...pageStore.counts.allowed },
      }
    : createCounts();
  if (trackedState?.pageCounts) {
    mergeCounts(pageCounts, trackedState.pageCounts);
  }
  if (trackedState === undefined && liveState?.pageCounts) {
    mergeCounts(pageCounts, liveState.pageCounts);
  }
  if (tabId > 0) {
    const matchedBlockedCount = await getMatchedBlockedRequestCountForTab(
      tabId,
      trackedState?.startedAt || 0,
    );
    if (
      typeof matchedBlockedCount === "number" &&
      matchedBlockedCount > pageCounts.blocked.any
    ) {
      pageCounts.blocked.any = matchedBlockedCount;
    }
  }

  // Get netFilteringSwitch - ALWAYS read from storage to get current state
  // This ensures we get the latest state even if pageStore was cached before toggle
  let netFilteringSwitch = true;
  if (pageHostname !== "") {
    const storedFiltering = await chrome.storage.local.get("perSiteFiltering");
    const perSiteFiltering = storedFiltering?.perSiteFiltering || {};
    const pageKey = `${pageHostname}:${pageURL}`;
    console.log(
      "[MV3] getPopupData: perSiteFiltering =",
      perSiteFiltering,
      "pageKey =",
      pageKey,
      "hostname =",
      pageHostname,
    );
    netFilteringSwitch = !(
      perSiteFiltering[pageKey] === false ||
      perSiteFiltering[pageHostname] === false
    );
    console.log("[MV3] getPopupData: from storage =", netFilteringSwitch);
  }
  console.log(
    "[MV3] getPopupData: final netFilteringSwitch =",
    netFilteringSwitch,
  );

  const hostnameSwitches = popupState.sessionHostnameSwitches;
  const noPopups =
    pageHostname !== "" &&
    hostnameSwitches[pageHostname]?.["no-popups"] === true;
  const noCosmeticFiltering =
    pageHostname !== "" &&
    hostnameSwitches[pageHostname]?.["no-cosmetic-filtering"] === true;
  const noLargeMedia =
    pageHostname !== "" &&
    hostnameSwitches[pageHostname]?.["no-large-media"] === true;
  const noRemoteFonts =
    pageHostname !== "" &&
    hostnameSwitches[pageHostname]?.["no-remote-fonts"] === true;
  const noScripting =
    pageHostname !== "" &&
    hostnameSwitches[pageHostname]?.["no-scripting"] === true;
  const switchMetrics =
    tabId > 0
      ? await getTabSwitchMetrics(tabId)
      : {
          popupBlockedCount: 0,
          largeMediaCount: 0,
          remoteFontCount: 0,
          scriptCount: 0,
        };

  const contentLastModified = pageStore?.contentLastModified || 0;
  const largeMediaCount =
    pageStore?.largeMediaCount ?? switchMetrics.largeMediaCount;
  const remoteFontCount =
    pageStore?.remoteFontCount ?? switchMetrics.remoteFontCount;
  const popupBlockedCount =
    pageStore?.popupBlockedCount ?? switchMetrics.popupBlockedCount;
  const hiddenSettings =
    (await chrome.storage.local.get("hiddenSettings")).hiddenSettings || {};
  const matrixIsDirty =
    popupState.sessionFirewall.hasSameRules(
      popupState.permanentFirewall,
      pageHostname,
      hostnameDict,
    ) === false ||
    hasSameHostnameSwitches(
      pageHostname,
      popupState.sessionHostnameSwitches,
      popupState.permanentHostnameSwitches,
    ) === false;

  return {
    advancedUserEnabled: popupState.userSettings.advancedUserEnabled,
    appName: chrome.runtime.getManifest().name,
    appVersion: chrome.runtime.getManifest().version,
    canElementPicker,
    colorBlindFriendly: popupState.userSettings.colorBlindFriendly,
    contentLastModified,
    cosmeticFilteringSwitch: noCosmeticFiltering !== true,
    firewallPaneMinimized: popupState.userSettings.firewallPaneMinimized,
    firewallRules: getFirewallRulesForPopup(pageHostname, hostnameDict),
    godMode: hiddenSettings.filterAuthorMode === true,
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
    popupPanelOrientation: "",
    popupPanelSections: popupState.userSettings.popupPanelSections,
    rawURL: pageURL,
    tabId,
    tabTitle: pageTitle,
    tooltipsDisabled: popupState.userSettings.tooltipsDisabled,
    netFilteringSwitch,
    largeMediaCount,
    matrixIsDirty,
    remoteFontCount,
    noPopups,
    noLargeMedia,
    noRemoteFonts,
    noScripting,
    userFiltersAreEnabled: true,
    userSettings: popupState.userSettings,
    whitelist: popupState.whitelist,
    whitelistDefault: popupState.userSettings.netWhitelistDefault || [],
  };
};

async function collectTabHostnameData(
  tabId: number,
  pageHostname: string,
): Promise<any> {
  const tabMetrics = popupState.tabMetrics?.[tabId];
  if (!tabMetrics) return undefined;

  const hostnameDict: Record<string, HostnameDetails> = {};
  if (pageHostname) {
    hostnameDict[pageHostname] = zeroHostnameDetails(pageHostname);
  }

  return {
    hostnameDict,
    pageCounts: tabMetrics.counts,
  };
}
