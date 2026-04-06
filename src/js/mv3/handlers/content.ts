/**
 * @fileoverview Content Script Handler
 * Handles messages from content scripts including cosmetic filters and CSS injection.
 */

import { storage } from '../storage.js';
import { parseHostname, CONSTANTS } from '../utils.js';

interface PortDetails {
    tabId?: number;
    frameId?: number;
    privileged?: boolean;
}

interface ContentScriptRequest {
    what: string;
    url?: string;
    add?: string[];
    remove?: string[];
}

interface ContentScriptParameters {
    hostname: string;
    domain: string;
    deepServices: Record<string, unknown>;
    privileged: boolean;
    cnameToParentMap: Record<string, unknown>;
    redirectEngine: null;
    staticFilters: string;
    staticExtendedFilters: string;
    proceduralFilters: string;
    cosmeticFilterEngine: string;
    extraSettings: { forceLocalPolicies: boolean };
    userFilters: string;
}

function handleRetrieveContentScriptParameters(
    request: ContentScriptRequest,
    portDetails: PortDetails,
    callback: (response?: unknown) => void
): void {
    const parsed = parseHostname(request.url || '');
    const hostname = parsed.hostname;
    const domain = parsed.domain;

    storage.readUserFilters()
        .then(function(data) {
            const userFilters = data.content || '';
            const cosmeticFilters: string[] = [];

            const lines = userFilters.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && 
                    trimmedLine.includes(CONSTANTS.FILTERS.SELECTOR_SEPARATOR) && 
                    !trimmedLine.startsWith(CONSTANTS.FILTERS.COMMENT_PREFIX) && 
                    !trimmedLine.startsWith(CONSTANTS.FILTERS.INCLUDE_PREFIX)) {
                    cosmeticFilters.push(trimmedLine);
                }
            }

            const matchedSelectors: string[] = [];
            for (const filter of cosmeticFilters) {
                if (!filter) continue;

                const parts = filter.split(CONSTANTS.FILTERS.SELECTOR_SEPARATOR);
                if (parts.length !== 2) continue;

                const filterHostname = parts[0];
                const selector = parts[1];

                let matches = false;
                if (!filterHostname) {
                    matches = true;
                } else if (filterHostname === hostname || filterHostname === domain) {
                    matches = true;
                } else if (filterHostname.startsWith('*.') && hostname.endsWith(filterHostname.slice(1))) {
                    matches = true;
                }

                if (matches && selector) {
                    matchedSelectors.push(selector);
                }
            }

            callback({
                hostname: hostname,
                domain: domain,
                deepServices: {},
                privileged: true,
                cnameToParentMap: {},
                redirectEngine: null,
                staticFilters: '',
                staticExtendedFilters: '',
                proceduralFilters: matchedSelectors.join(',\n'),
                cosmeticFilterEngine: matchedSelectors.length > 0 ? 'procedural' : '',
                extraSettings: {
                    forceLocalPolicies: true
                },
                userFilters: matchedSelectors.join(',\n')
            });
        })
        .catch(function(err) {
            console.error('[ContentHandler] Failed to read user filters:', err);
            callback({
                hostname: hostname,
                domain: domain,
                deepServices: {},
                privileged: true,
                cnameToParentMap: {},
                redirectEngine: null,
                staticFilters: '',
                staticExtendedFilters: '',
                proceduralFilters: '',
                cosmeticFilterEngine: '',
                extraSettings: { forceLocalPolicies: true },
                userFilters: ''
            });
        });
}

function handleUserCSS(
    request: ContentScriptRequest,
    portDetails: PortDetails,
    callback: (response?: unknown) => void
): void {
    const tabId = portDetails.tabId;
    const frameId = portDetails.frameId;

    if (tabId === undefined) {
        callback({});
        return;
    }

    const cssPromises: Array<Promise<void>> = [];

    if (request.add && request.add.length > 0) {
        for (const cssText of request.add) {
            if (!cssText) continue;

            cssPromises.push(new Promise(function(resolve) {
                const injectDetails: {
                    target: { tabId: number; frameIds?: number[] };
                    css: string;
                } = {
                    target: { tabId: tabId },
                    css: cssText
                };

                if (typeof frameId === 'number' && frameId >= 0) {
                    injectDetails.target.frameIds = [frameId];
                }

                chrome.scripting.insertCSS(injectDetails, function() {
                    if (chrome.runtime.lastError) {
                        console.warn('[ContentHandler] CSS injection warning:', chrome.runtime.lastError.message);
                    }
                    resolve();
                });
            }));
        }
    }

    if (request.remove && request.remove.length > 0) {
        for (const removeCss of request.remove) {
            if (!removeCss) continue;

            cssPromises.push(new Promise(function(resolve) {
                const removeDetails: {
                    target: { tabId: number; frameIds?: number[] };
                    code: string;
                } = {
                    target: { tabId: tabId },
                    code: removeCss
                };

                if (typeof frameId === 'number' && frameId >= 0) {
                    removeDetails.target.frameIds = [frameId];
                }

                chrome.scripting.removeCSS(removeDetails, function() {
                    if (chrome.runtime.lastError) {
                        console.warn('[ContentHandler] CSS removal warning:', chrome.runtime.lastError.message);
                    }
                    resolve();
                });
            }));
        }
    }

    Promise.all(cssPromises)
        .then(function() {
            callback({});
        })
        .catch(function(err) {
            console.error('[ContentHandler] CSS operations failed:', err);
            callback({});
        });
}

function createContentHandler() {
    return function(request: ContentScriptRequest, portDetails: PortDetails, callback: (response?: unknown) => void): void {
        switch (request.what) {
        case 'retrieveContentScriptParameters':
            handleRetrieveContentScriptParameters(request, portDetails, callback);
            break;

        case 'cosmeticFiltersInjected':
            callback({});
            break;

        case 'userCSS':
            handleUserCSS(request, portDetails, callback);
            break;

        default:
            callback({});
            break;
        }
    };
}

export { createContentHandler };
