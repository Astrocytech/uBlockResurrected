/**
 * @fileoverview Popup Handler
 * Handles messages from the browser action popup.
 */

import { parseHostname, injectScripts } from '../utils.js';

interface PortDetails {
    tabId?: number;
    frameId?: number;
    privileged?: boolean;
}

interface PopupRequest {
    what: string;
    tabId?: number;
    zap?: boolean;
    details?: {
        url?: string;
        select?: boolean;
    };
}

interface PopupData {
    advancedUserEnabled: boolean;
    appName: string;
    appVersion: string;
    colorBlindFriendly: boolean;
    cosmeticFilteringSwitch: boolean;
    firewallPaneMinimized: boolean;
    fontSize?: string;
    godMode: boolean;
    tooltipsDisabled: boolean;
    uiPopupConfig?: unknown;
    hasUnprocessedRequest: boolean;
    netFilteringSwitch: boolean;
    userFiltersAreEnabled: boolean;
    tabId: number;
    tabTitle: string;
    rawURL: string;
    pageURL: string;
    pageHostname: string;
    pageDomain: string;
    pageCounts: {
        blocked: Record<string, number>;
        allowed: Record<string, number>;
    };
    globalBlockedRequestCount: number;
    globalAllowedRequestCount: number;
    popupBlockedCount: number;
    largeMediaCount: number;
    remoteFontCount: number;
    contentLastModified: number;
    noPopups: boolean;
    noLargeMedia: boolean;
    noCosmeticFiltering: boolean;
    noRemoteFonts: boolean;
    noScripting: boolean;
    hostnameDict: Record<string, unknown>;
    cnameMap: unknown[];
    firewallRules: Record<string, unknown>;
    canElementPicker: boolean;
    matrixIsDirty: boolean;
    popupPanelSections: number;
    popupPanelDisabledSections: number;
    popupPanelLockedSections: number;
    popupPanelHeightMode: number;
    popupPanelOrientation: string;
}

function createPopupHandler(api: { version: string; inZapperMode: boolean }) {
    return function(request: PopupRequest, portDetails: PortDetails, callback: (response?: unknown) => void): void {
        switch (request.what) {
        case 'getPopupData':
            handleGetPopupData(request, portDetails, callback, api);
            break;

        case 'launchElementPicker':
            handleLaunchElementPicker(request, portDetails, callback, api);
            break;

        case 'gotoURL':
            handleGotoURL(request, portDetails, callback);
            break;

        case 'getScriptCount':
            callback({ count: 0 });
            break;

        case 'toggleNetFiltering':
            callback({});
            break;

        default:
            callback({});
            break;
        }
    };
}

function handleGetPopupData(
    request: PopupRequest,
    portDetails: PortDetails,
    callback: (response?: unknown) => void,
    api: { version: string; inZapperMode: boolean }
): void {
    let tabId = request.tabId || -1;
    let tabTitle = "";
    let rawURL = "";
    let pageURL = "";
    let pageHostname = "";
    let pageDomain = "";
    let canElementPicker = true;

    function buildPopupData(tab: chrome.tabs.Tab | null): void {
        if (tab) {
            tabId = tab.id || tabId;  // Use actual tab ID
        }
        if (tab?.url) {
            tabTitle = tab.title || "";
            rawURL = tab.url;
            pageURL = tab.url;
            try {
                const parsed = parseHostname(tab.url);
                pageHostname = parsed.hostname;
                pageDomain = parsed.domain;
                canElementPicker = parsed.protocol === 'http:' ||
                                   parsed.protocol === 'https:' ||
                                   parsed.protocol === 'file:';
            } catch {
                console.warn('[PopupHandler] Failed to parse URL');
            }
        }

        callback({
            advancedUserEnabled: true,
            appName: "uBlock Resurrected",
            appVersion: api.version,
            colorBlindFriendly: false,
            cosmeticFilteringSwitch: false,
            firewallPaneMinimized: true,
            fontSize: undefined,
            godMode: false,
            tooltipsDisabled: false,
            uiPopupConfig: undefined,
            hasUnprocessedRequest: false,
            netFilteringSwitch: true,
            userFiltersAreEnabled: true,
            tabId: tabId,
            tabTitle: tabTitle,
            rawURL: rawURL,
            pageURL: pageURL,
            pageHostname: pageHostname,
            pageDomain: pageDomain,
            pageCounts: {
                blocked: { any: 0, image: 0, script: 0, stylesheet: 0, font: 0, object: 0, xmlhttprequest: 0, ping: 0, websocket: 0, other: 0 },
                allowed: { any: 0, image: 0, script: 0, stylesheet: 0, font: 0, object: 0, xmlhttprequest: 0, ping: 0, websocket: 0, other: 0 }
            },
            globalBlockedRequestCount: 0,
            globalAllowedRequestCount: 0,
            popupBlockedCount: 0,
            largeMediaCount: 0,
            remoteFontCount: 0,
            contentLastModified: 0,
            noPopups: false,
            noLargeMedia: false,
            noCosmeticFiltering: false,
            noRemoteFonts: false,
            noScripting: false,
            hostnameDict: {},
            cnameMap: [],
            firewallRules: {},
            canElementPicker: canElementPicker,
            matrixIsDirty: false,
            popupPanelSections: 31,
            popupPanelDisabledSections: 0,
            popupPanelLockedSections: 0,
            popupPanelHeightMode: 0,
            popupPanelOrientation: "landscape"
        });
    }

    if (tabId && tabId > 0) {
        chrome.tabs.get(tabId)
            .then(buildPopupData)
            .catch(function() {
                buildPopupData(null);
            });
    } else {
        buildPopupData(null);
    }
}

function handleLaunchElementPicker(
    request: PopupRequest,
    portDetails: PortDetails,
    callback: (response?: unknown) => void,
    api: { inZapperMode: boolean }
): void {
    const targetTabId = request.tabId;
    const zapMode = request.zap === true;

    api.inZapperMode = zapMode;

    function activatePicker(tabId: number): void {
        if (!tabId || tabId <= 0) {
            callback({ success: false, error: 'no valid tabId' });
            return;
        }

        const chain = injectScripts(tabId, [
            ['js/vapi-content.js'],
            ['js/scriptlets/epicker.js']
        ], true);

        chain.then(function() {
            callback({ success: true });
        }).catch(function(err: Error) {
            callback({ success: false, error: err instanceof Error ? err.message : 'Injection failed' });
        });
    }

    if (targetTabId && targetTabId > 0) {
        activatePicker(targetTabId);
    } else {
        chrome.tabs.query({}, function(tabs) {
            const webTab = tabs?.find(function(tab) {
                const url = tab.url || '';
                return (
                    (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) &&
                    !url.startsWith('chrome-extension://')
                );
            });
            if (webTab && webTab.id) {
                activatePicker(webTab.id);
            } else {
                callback({ success: false, error: 'no active tab' });
            }
        });
    }
}

function handleGotoURL(
    request: PopupRequest,
    portDetails: PortDetails,
    callback: (response?: unknown) => void
): void {
    const url = request.details?.url;
    if (url) {
        let targetUrl = url;
        if (targetUrl.startsWith("/")) {
            targetUrl = chrome.runtime.getURL(targetUrl);
        }
        chrome.tabs.create({ url: targetUrl, active: request.details?.select !== false });
        callback({ success: true });
    } else {
        callback({ success: false });
    }
}

export { createPopupHandler };
