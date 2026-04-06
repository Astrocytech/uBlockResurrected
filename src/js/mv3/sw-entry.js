/**
 * uBlock Origin - MV3 Service Worker
 * Entry Point
 */

import { vAPI } from './vapi-bg.js';
import { messaging } from './messaging.js';
import { storage } from './storage.js';
import { dnr } from './dnr.js';
import { createPopupHandler } from './handlers/popup.js';
import { createPickerHandler } from './handlers/picker.js';
import { createDashboardHandler } from './handlers/dashboard.js';
import { createContentHandler } from './handlers/content.js';
import { parseHostname } from './utils.js';

self.oninstall = function() {
    self.skipWaiting();
};

self.onactivate = function() {
    return self.clients.claim();
};

var defaultMessageHandler = function(request, portDetails, callback) {
    if (request.what === "createUserFilter") {
        var filtersToSave = [];
        if (typeof request.filters === 'string' && request.filters.trim()) {
            filtersToSave = [request.filters.trim()];
        } else if (Array.isArray(request.filters)) {
            filtersToSave = request.filters;
        } else if (request.filters && typeof request.filters === 'object' && request.filters.filter) {
            filtersToSave = [request.filters.filter.trim()];
        }

        storage.appendUserFilters(filtersToSave).then(function(result) {
            callback(result);
        }).catch(function(e) {
            callback({ saved: false, error: e.message });
        });
        return;
    }

    if (request.channel === "elementPicker" || (request.msg && request.msg.channel === "elementPicker")) {
        var msg = request.msg || request;
        var what = msg.what;

        if (what === "elementPickerArguments") {
            callback({
                pickerURL: chrome.runtime.getURL('web_accessible_resources/epicker-ui.html'),
                target: '',
                zap: vAPI.inZapperMode,
                eprom: null
            });
            return;
        }

        if (what === "createUserFilter") {
            var filtersToSave = [];
            if (typeof msg.filters === 'string' && msg.filters.trim()) {
                filtersToSave = [msg.filters.trim()];
            } else if (Array.isArray(msg.filters)) {
                filtersToSave = msg.filters;
            }

            storage.appendUserFilters(filtersToSave).then(function(result) {
                callback(result);
            });
            return;
        }
    }

    if (request.what === "uiStyles") {
        callback({});
        return;
    }

    return messaging.UNHANDLED;
};

messaging.setup(defaultMessageHandler);

messaging.listen({ name: 'popupPanel', listener: createPopupHandler(vAPI), privileged: false });
messaging.listen({ name: 'elementPicker', listener: createPickerHandler(), privileged: false });
messaging.listen({ name: 'dashboard', listener: createDashboardHandler(), privileged: true });
messaging.listen({ name: 'dom', listener: createContentHandler(), privileged: false });
messaging.listen({ name: 'contentscript', listener: createContentHandler(), privileged: false });

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.channel === "elementPicker" || (request.msg && request.msg.channel === "elementPicker")) {
        var msg = request.msg || request;
        var what = msg.what;

        if (what === "elementPickerArguments") {
            sendResponse({
                pickerURL: chrome.runtime.getURL('web_accessible_resources/epicker-ui.html'),
                target: '',
                zap: vAPI.inZapperMode,
                eprom: null
            });
            return true;
        }

        if (what === "createUserFilter") {
            var filtersToSave = [];
            if (typeof msg.filters === 'string' && msg.filters.trim()) {
                filtersToSave = [msg.filters.trim()];
            } else if (Array.isArray(msg.filters)) {
                filtersToSave = msg.filters;
            }

            storage.appendUserFilters(filtersToSave).then(function(result) {
                sendResponse(result);
            }).catch(function(e) {
                sendResponse({ saved: false, error: e.message });
            });
            return true;
        }
    }

    if (request.what === "getPopupData") {
        var tabId = request.tabId || -1;
        var canElementPicker = true;

        var buildPopupData = function(tab) {
            var tabTitle = "";
            var pageURL = "";
            var pageHostname = "";
            var pageDomain = "";

            if (tab && tab.url) {
                tabTitle = tab.title || "";
                pageURL = tab.url;
                try {
                    var parsed = parseHostname(tab.url);
                    pageHostname = parsed.hostname;
                    pageDomain = parsed.domain;
                    canElementPicker = parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
                } catch (e) {}
            }

            sendResponse({
                advancedUserEnabled: true,
                appName: "uBlock Origin",
                appVersion: vAPI.version,
                colorBlindFriendly: false,
                cosmeticFilteringSwitch: false,
                firewallPaneMinimized: true,
                hasUnprocessedRequest: false,
                netFilteringSwitch: true,
                userFiltersAreEnabled: true,
                tabId: tabId,
                tabTitle: tabTitle,
                rawURL: pageURL,
                pageURL: pageURL,
                pageHostname: pageHostname,
                pageDomain: pageDomain,
                hostnameDict: {},
                cnameMap: [],
                firewallRules: {},
                canElementPicker: canElementPicker,
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
        return true;
    }

    if (request.what === "launchElementPicker") {
        vAPI.inZapperMode = request.zap === true;

        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0) {
                var tabId = tabs[0].id;

                var injectChain = Promise.resolve();
                injectChain = injectChain.then(function() {
                    return new Promise(function(resolve) {
                        chrome.scripting.executeScript({
                            target: { tabId: tabId, allFrames: true },
                            files: ['js/vapi-content.js']
                        }, function() { resolve(); });
                    });
                });
                injectChain = injectChain.then(function() {
                    return new Promise(function(resolve) {
                        chrome.scripting.executeScript({
                            target: { tabId: tabId, allFrames: true },
                            files: ['js/scriptlets/epicker.js']
                        }, function() { resolve(); });
                    });
                });
            }
        });
        return true;
    }

    sendResponse({});
    return true;
});

chrome.commands.onCommand.addListener(function(command) {
    if (command === "launch-element-zapper") {
        vAPI.inZapperMode = true;
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id, allFrames: true },
                    files: ['js/vapi-content.js']
                }, function() {
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id, allFrames: true },
                        files: ['js/scriptlets/epicker.js']
                    });
                });
            }
        });
    } else if (command === "launch-element-picker") {
        vAPI.inZapperMode = false;
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id, allFrames: true },
                    files: ['js/vapi-content.js']
                }, function() {
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id, allFrames: true },
                        files: ['js/scriptlets/epicker.js']
                    });
                });
            }
        });
    } else if (command === "open-dashboard") {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    } else if (command === "launch-logger") {
        chrome.tabs.create({ url: chrome.runtime.getURL("logger-ui.html") });
    }
});

dnr.updateWhitelist();
