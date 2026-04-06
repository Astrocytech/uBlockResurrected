/**
 * @fileoverview Content Script Handler
 * Handles messages from content scripts including cosmetic filters and CSS injection.
 * 
 * @module mv3/handlers/content
 * @requires mv3/storage
 * @requires mv3/utils
 */

/**
 * @typedef {Object} PortDetails
 * @property {number} [tabId] - Tab ID
 * @property {number} [frameId] - Frame ID
 * @property {boolean} [privileged] - Whether the port is from a privileged context
 */

/**
 * @typedef {Object} ContentScriptRequest
 * @property {string} what - Request type
 * @property {string} [url] - Page URL for retrieveContentScriptParameters
 * @property {string[]} [add] - CSS to add
 * @property {string[]} [remove] - CSS to remove
 */

/**
 * @typedef {Object} ContentScriptParameters
 * @property {string} hostname - Page hostname
 * @property {string} domain - Page domain
 * @property {Object} deepServices - Deep services config
 * @property {boolean} privileged - Is privileged
 * @property {Object} cnameToParentMap - CNAME mapping
 * @property {*} redirectEngine - Redirect engine instance
 * @property {string} staticFilters - Static filters
 * @property {string} staticExtendedFilters - Extended static filters
 * @property {string} proceduralFilters - Procedural filters
 * @property {string} cosmeticFilterEngine - Cosmetic filter engine type
 * @property {Object} extraSettings - Extra settings
 * @property {string} userFilters - User filters
 */

import { vAPI } from '../vapi-bg.js';
import { storage } from '../storage.js';
import { parseHostname } from '../utils.js';
import { CONSTANTS } from '../utils.js';

/**
 * Handle retrieveContentScriptParameters request
 * @param {Object} request - The request object
 * @param {PortDetails} portDetails - Port details
 * @param {Function} callback - Callback function
 */
function handleRetrieveContentScriptParameters(request, portDetails, callback) {
    var parsed = parseHostname(request.url || '');
    var hostname = parsed.hostname;
    var domain = parsed.domain;

    storage.readUserFilters()
        .then(function(data) {
            var userFilters = data.content || '';
            var cosmeticFilters = [];

            var lines = userFilters.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line && 
                    line.includes(CONSTANTS.FILTERS.SELECTOR_SEPARATOR) && 
                    !line.startsWith(CONSTANTS.FILTERS.COMMENT_PREFIX) && 
                    !line.startsWith(CONSTANTS.FILTERS.INCLUDE_PREFIX)) {
                    cosmeticFilters.push(line);
                }
            }

            var matchedSelectors = [];
            for (var j = 0; j < cosmeticFilters.length; j++) {
                var filter = cosmeticFilters[j];
                if (!filter) continue;

                var parts = filter.split(CONSTANTS.FILTERS.SELECTOR_SEPARATOR);
                if (parts.length !== 2) continue;

                var filterHostname = parts[0];
                var selector = parts[1];

                var matches = false;
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

            /** @type {ContentScriptParameters} */
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

/**
 * Handle userCSS request - inject CSS into tab
 * @param {Object} request - The request object
 * @param {PortDetails} portDetails - Port details
 * @param {Function} callback - Callback function
 */
function handleUserCSS(request, portDetails, callback) {
    var tabId = portDetails.tabId;
    var frameId = portDetails.frameId;

    if (tabId === undefined) {
        callback({});
        return;
    }

    var cssPromises = [];

    if (request.add && request.add.length > 0) {
        for (var i = 0; i < request.add.length; i++) {
            var cssText = request.add[i];
            if (!cssText) continue;

            cssPromises.push(new Promise(function(resolve) {
                var injectDetails = {
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
        for (var j = 0; j < request.remove.length; j++) {
            var removeCss = request.remove[j];
            if (!removeCss) continue;

            cssPromises.push(new Promise(function(resolve) {
                var removeDetails = {
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

/**
 * Create content script handler
 * @returns {Function} Handler function for messaging
 */
function createContentHandler() {
    /**
     * @param {ContentScriptRequest} request
     * @param {PortDetails} portDetails
     * @param {Function} callback
     */
    return function(request, portDetails, callback) {
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
