/**
 * uBlock Resurrected - MV3 Service Worker
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

interface PortDetails {
    tabId?: number;
    frameId?: number;
    privileged?: boolean;
}

self.oninstall = function() {
    self.skipWaiting();
};

self.onactivate = function() {
    return (self as unknown as { clients: { claim: () => Promise<void> } }).clients.claim();
};

const defaultMessageHandler = function(
    request: { what?: string; channel?: string; msg?: unknown; filters?: string | string[] | { filter?: string } },
    portDetails: PortDetails,
    callback: (response?: unknown) => void
): string | undefined {
    if (request.what === "createUserFilter") {
        let filtersToSave: string[] = [];
        if (typeof request.filters === 'string' && request.filters.trim()) {
            filtersToSave = [request.filters.trim()];
        } else if (Array.isArray(request.filters)) {
            filtersToSave = request.filters;
        } else if (request.filters && typeof request.filters === 'object' && (request.filters as { filter?: string }).filter) {
            filtersToSave = [(request.filters as { filter: string }).filter.trim()];
        }

        storage.appendUserFilters(filtersToSave).then(function(result) {
            callback(result);
        }).catch(function(e: Error) {
            callback({ saved: false, error: e.message });
        });
        return;
    }

    if (request.channel === "elementPicker" || (request.msg && (request.msg as { channel?: string }).channel === "elementPicker")) {
        const msg = request.msg || request;
        const what = (msg as { what?: string }).what;

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
            const m = msg as { filters?: string | string[] };
            let filtersToSave: string[] = [];
            if (typeof m.filters === 'string' && m.filters.trim()) {
                filtersToSave = [m.filters.trim()];
            } else if (Array.isArray(m.filters)) {
                filtersToSave = m.filters;
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
    if (request.channel === "elementPicker" || (request.msg && (request.msg as { channel?: string }).channel === "elementPicker")) {
        const msg = request.msg || request;
        const what = (msg as { what?: string }).what;

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
            const m = msg as { filters?: string | string[] };
            let filtersToSave: string[] = [];
            if (typeof m.filters === 'string' && m.filters.trim()) {
                filtersToSave = [m.filters.trim()];
            } else if (Array.isArray(m.filters)) {
                filtersToSave = m.filters;
            }

            storage.appendUserFilters(filtersToSave).then(function(result) {
                sendResponse(result);
            }).catch(function(e: Error) {
                sendResponse({ saved: false, error: e.message });
            });
            return true;
        }
    }

    if (request.what === "getPopupData") {
        const tabId = (request as { tabId?: number }).tabId || -1;
        let canElementPicker = true;

        const buildPopupData = function(tab: chrome.tabs.Tab | null): void {
            let tabTitle = "";
            let pageURL = "";
            let pageHostname = "";
            let pageDomain = "";

            if (tab?.url) {
                tabTitle = tab.title || "";
                pageURL = tab.url;
                try {
                    const parsed = parseHostname(tab.url);
                    pageHostname = parsed.hostname;
                    pageDomain = parsed.domain;
                    canElementPicker = parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
                } catch {}
            }

            sendResponse({
                advancedUserEnabled: true,
                appName: "uBlock Resurrected",
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
        vAPI.inZapperMode = (request as { zap?: boolean }).zap === true;

        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0 && tabs[0].id) {
                const targetTabId = tabs[0].id;

                let injectChain = Promise.resolve();
                injectChain = injectChain.then(function() {
                    return new Promise(function(resolve) {
                        chrome.scripting.executeScript({
                            target: { tabId: targetTabId, allFrames: true },
                            files: ['js/vapi-content.js']
                        }, function() { resolve(); });
                    });
                });
                injectChain = injectChain.then(function() {
                    return new Promise(function(resolve) {
                        chrome.scripting.executeScript({
                            target: { tabId: targetTabId, allFrames: true },
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

chrome.commands.onCommand.addListener(function(command: string) {
    if (command === "launch-element-zapper") {
        vAPI.inZapperMode = true;
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0 && tabs[0].id) {
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
            if (tabs && tabs.length > 0 && tabs[0].id) {
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
