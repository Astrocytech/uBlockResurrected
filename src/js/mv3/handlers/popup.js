/**
 * uBlock Origin - MV3 Service Worker
 * Popup Panel Handler
 */

import { vAPI } from '../vapi-bg.js';
import { storage } from '../storage.js';
import { dnr } from '../dnr.js';
import { parseHostname, injectScripts } from '../utils.js';

function createPopupHandler() {
    return function(request, portDetails, callback) {
        switch (request.what) {
        case 'getPopupData':
            handleGetPopupData(request, portDetails, callback);
            break;

        case 'launchElementPicker':
            handleLaunchElementPicker(request, portDetails, callback);
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

function handleGetPopupData(request, portDetails, callback) {
    var tabId = request.tabId || -1;
    var tabTitle = "";
    var rawURL = "";
    var pageURL = "";
    var pageHostname = "";
    var pageDomain = "";
    var canElementPicker = true;

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
            }
        }

        callback({
            advancedUserEnabled: true,
            appName: "uBlock Origin",
            appVersion: vAPI.version,
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
        chrome.tabs.get(tabId).then(buildPopupData).catch(function() {
            buildPopupData(null);
        });
    } else {
        buildPopupData(null);
    }
}

function handleLaunchElementPicker(request, portDetails, callback) {
    var targetTabId = request.tabId;
    var zapMode = request.zap === true;

    vAPI.inZapperMode = zapMode;

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
        }).catch(function(e) {
            callback({ success: false, error: e.message });
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

function handleGotoURL(request, portDetails, callback) {
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
