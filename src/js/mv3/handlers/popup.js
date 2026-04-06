/**
 * @fileoverview Popup Handler
 * Handles messages from the browser action popup.
 * 
 * @module mv3/handlers/popup
 */

import { parseHostname, injectScripts } from '../utils.js';

/**
 * @typedef {Object} PortDetails
 * @property {number} [tabId] - Tab ID
 * @property {number} [frameId] - Frame ID
 * @property {boolean} [privileged] - Whether the port is from a privileged context
 */

/**
 * @typedef {Object} PopupRequest
 * @property {string} what - Request type
 * @property {number} [tabId] - Tab ID
 * @property {boolean} [zap] - Whether to launch in zapper mode
 * @property {Object} [details] - URL details for gotoURL
 */

/**
 * @typedef {Object} PopupData
 * @property {boolean} advancedUserEnabled
 * @property {string} appName
 * @property {string} appVersion
 * @property {string} pageHostname
 * @property {string} pageDomain
 * @property {number} tabId
 * @property {string} tabTitle
 * @property {string} pageURL
 * @property {boolean} canElementPicker
 * @property {Object} pageCounts
 */

/**
 * Create popup handler
 * @param {Object} api - vAPI object
 * @returns {Function} Handler function for messaging
 */
function createPopupHandler(api) {
    /**
     * @param {PopupRequest} request
     * @param {PortDetails} portDetails
     * @param {Function} callback
     */
    return function(request, portDetails, callback) {
        switch (request.what) {
        case 'getPopupData':
            handleGetPopupData(request, portDetails, callback, api);
            break;

        case 'launchElementPicker':
            handleLaunchElementPicker(request, portDetails, callback, api);
            break;

        case 'gotoURL':
            handleGotoURL(request, portDetails, callback, api);
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

/**
 * Handle getPopupData request
 * @param {PopupRequest} request
 * @param {PortDetails} portDetails
 * @param {Function} callback
 * @param {Object} api - vAPI object
 */
function handleGetPopupData(request, portDetails, callback, api) {
    var tabId = request.tabId || -1;
    var tabTitle = "";
    var rawURL = "";
    var pageURL = "";
    var pageHostname = "";
    var pageDomain = "";
    var canElementPicker = true;

    /**
     * @param {chrome.tabs.Tab|null} tab
     */
    var buildPopupData = function(tab) {
        if (tab && tab.url) {
            tabTitle = tab.title || "";
            rawURL = tab.url || "";
            pageURL = tab.url || "";
            try {
                var parsed = parseHostname(tab.url);
                pageHostname = parsed.hostname;
                pageDomain = parsed.domain;
                canElementPicker = parsed.protocol === 'http:' ||
                                   parsed.protocol === 'https:' ||
                                   parsed.protocol === 'file:';
            } catch (e) {
                console.warn('[PopupHandler] Failed to parse URL:', e);
            }
        }

        /** @type {PopupData} */
        callback({
            advancedUserEnabled: true,
            appName: "uBlock Origin",
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
    };

    if (tabId && tabId > 0) {
        chrome.tabs.get(tabId)
            .then(buildPopupData)
            .catch(function(err) {
                console.warn('[PopupHandler] Failed to get tab:', err);
                buildPopupData(null);
            });
    } else {
        buildPopupData(null);
    }
}

/**
 * Handle launchElementPicker request
 * @param {PopupRequest} request
 * @param {PortDetails} portDetails
 * @param {Function} callback
 * @param {Object} api - vAPI object
 */
function handleLaunchElementPicker(request, portDetails, callback, api) {
    var targetTabId = request.tabId;
    var zapMode = request.zap === true;

    api.inZapperMode = zapMode;

    /**
     * @param {number} tabId
     */
    var activatePicker = function(tabId) {
        if (!tabId || tabId <= 0) {
            callback({ success: false, error: 'no valid tabId' });
            return;
        }

        var chain = injectScripts(tabId, [
            ['js/vapi-content.js'],
            ['js/scriptlets/epicker.js']
        ]);

        chain.then(function() {
            callback({ success: true });
        }).catch(function(err) {
            console.error('[PopupHandler] Failed to inject scripts:', err);
            callback({ success: false, error: err instanceof Error ? err.message : 'Injection failed' });
        });
    };

    if (targetTabId && targetTabId > 0) {
        activatePicker(targetTabId);
    } else {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0) {
                activatePicker(tabs[0].id);
            } else {
                callback({ success: false, error: 'no active tab' });
            }
        });
    }
}

/**
 * Handle gotoURL request
 * @param {PopupRequest} request
 * @param {PortDetails} portDetails
 * @param {Function} callback
 * @param {Object} api - vAPI object
 */
function handleGotoURL(request, portDetails, callback, api) {
    var url = request.details && request.details.url;
    if (url) {
        if (url.startsWith("/")) {
            url = chrome.runtime.getURL(url);
        }
        chrome.tabs.create({ url: url, active: request.details.select !== false });
        callback({ success: true });
    } else {
        callback({ success: false });
    }
}

export { createPopupHandler };
