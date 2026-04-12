/*******************************************************************************

    uBlock Origin - MV3 Request Handlers
    https://github.com/gorhill/uBlock

    This file contains webRequest handlers for tracking requests.

*******************************************************************************/

import { popupState } from './sw-storage.js';
import { createCounts, zeroHostnameDetails } from './sw-helpers.js';
import {
    ensureTabRequestState,
    persistTabRequestState,
    incrementCounts,
} from './sw-request-tracking.js';
import { persistGlobalRequestCounts } from './sw-tab-metrics.js';

export type TabRequestState = {
    startedAt: number;
    pageHostname: string;
    pageCounts: any;
    hostnameDict: Record<string, any>;
};

export type CollectedHostnameData = {
    pageCounts: any;
    hostnameDict: Record<string, any>;
};

export const recordTabRequest = (details: chrome.webRequest.WebRequestBodyDetails) => {
    if (details.tabId < 0) { return; }
    let hostname = '';
    try {
        hostname = new URL(details.url).hostname;
    } catch {
        return;
    }

    if (details.type === 'main_frame') {
        const state: TabRequestState = {
            startedAt: typeof (details as { timeStamp?: number }).timeStamp === 'number'
                ? (details as { timeStamp?: number }).timeStamp as number
                : Date.now(),
            pageHostname: hostname,
            pageCounts: createCounts(),
            hostnameDict: {},
        };
        state.hostnameDict[hostname] = zeroHostnameDetails(hostname);
        incrementCounts(state.pageCounts, details.type);
        incrementCounts(state.hostnameDict[hostname].counts, details.type);
        // Note: tabRequestStates would need to be imported or passed
        popupState.globalAllowedRequestCount += 1;
        void Promise.all([
            persistTabRequestState(details.tabId),
            persistGlobalRequestCounts(),
        ]);
        return;
    }

    const state = ensureTabRequestState(details.tabId);
    if (state.hostnameDict[hostname] === undefined) {
        state.hostnameDict[hostname] = zeroHostnameDetails(hostname);
    }
    incrementCounts(state.pageCounts, details.type);
    incrementCounts(state.hostnameDict[hostname].counts, details.type);
    void persistTabRequestState(details.tabId);
};

export const trackPendingRequest = (details: chrome.webRequest.WebRequestBodyDetails) => {
    if (details.tabId < 0) { return; }
    if (details.type === 'main_frame') {
        recordTabRequest(details);
    }
};

export const finalizeTrackedRequest = async (
    details: chrome.webRequest.WebResponseCacheDetails | chrome.webRequest.WebResponseErrorDetails,
    blocked: boolean,
) => {
    if (details.tabId < 0 || details.type === 'main_frame') { return; }
    if (
        blocked &&
        details.error !== 'net::ERR_BLOCKED_BY_CLIENT' &&
        details.error !== 'ERR_BLOCKED_BY_CLIENT'
    ) {
        return;
    }

    let hostname = '';
    try {
        hostname = new URL(details.url).hostname;
    } catch {
        return;
    }

    const state = ensureTabRequestState(details.tabId);
    if (state.hostnameDict[hostname] === undefined) {
        state.hostnameDict[hostname] = zeroHostnameDetails(hostname);
    }
    incrementCounts(state.pageCounts, details.type, blocked);
    incrementCounts(state.hostnameDict[hostname].counts, details.type, blocked);
    if (blocked) {
        popupState.globalBlockedRequestCount += 1;
    } else {
        popupState.globalAllowedRequestCount += 1;
    }
    await Promise.all([
        persistTabRequestState(details.tabId),
        persistGlobalRequestCounts(),
    ]);
};

export const collectTabHostnameData = async (
    tabId: number,
    pageHostname: string,
): Promise<CollectedHostnameData | undefined> => {
    if (chrome.scripting?.executeScript === undefined) { return; }
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (currentPageHostname: string) => {
                const createCounts = () => ({
                    allowed: { any: 0, frame: 0, script: 0 },
                    blocked: { any: 0, frame: 0, script: 0 },
                });
                const isIPAddress = (hostname: string) =>
                    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
                const domainFromHostname = (hostname: string) => {
                    if (hostname === '' || hostname === '*') { return hostname; }
                    if (hostname === 'localhost' || isIPAddress(hostname)) { return hostname; }
                    const parts = hostname.split('.').filter(Boolean);
                    if (parts.length <= 2) { return hostname; }
                    return parts.slice(-2).join('.');
                };
                const hostnameDict = Object.create(null);
                const ensureHostname = (hostname: string) => {
                    if (hostnameDict[hostname] !== undefined) { return hostnameDict[hostname]; }
                    hostnameDict[hostname] = {
                        domain: domainFromHostname(hostname),
                        counts: createCounts(),
                    };
                    return hostnameDict[hostname];
                };
                ensureHostname(currentPageHostname);
                const pageCounts = createCounts();

                const docURL = document.URL;
                if (docURL) {
                    try {
                        const docHostname = new URL(docURL).hostname;
                        if (docHostname) {
                            const is3p = docHostname !== currentPageHostname;
                            pageCounts.allowed.any++;
                            if (docHostname !== currentPageHostname) {
                                pageCounts.allowed.frame++;
                            }
                        }
                    } catch {
                    }
                }

                return {
                    pageCounts,
                    hostnameDict,
                };
            },
            args: [pageHostname],
        });

        if (result?.result) {
            return result.result as CollectedHostnameData;
        }
    } catch {
    }
    return undefined;
};

export const getMatchedBlockedRequestCountForTab = async (
    tabId: number,
    minTimeStamp = 0,
): Promise<number | undefined> => {
    if (chrome.declarativeNetRequest?.getMatchedRules === undefined) {
        return;
    }
    try {
        const result = await chrome.declarativeNetRequest.getMatchedRules({
            tabId,
            minTimeStamp,
        });
        const rulesMatchedInfo = Array.isArray(result?.rulesMatchedInfo)
            ? result.rulesMatchedInfo
            : [];
        return rulesMatchedInfo.length;
    } catch {
    }
};
