/**
 * uBlock Origin - MV3 Service Worker
 * Shared Utilities and Constants
 */

/******************************************************************************/

export const CONSTANTS = {
    DNR: {
        WHITELIST_RULE_START: 10000,
        WHITELIST_RULE_END: 20000,
        MAX_STATIC_RULES: 30000,
        MAX_SESSION_RULES: 5000,
        MAX_DYNAMIC_RULES: 30000,
        RULE_BUDGET_WARNING: 0.9
    },
    FILTERS: {
        SELECTOR_SEPARATOR: '##',
        COMMENT_PREFIX: '!',
        INCLUDE_PREFIX: '[',
        MATCH_ALL: ''
    },
    STORAGE: {
        DEFAULT_QUOTA: 10485760
    }
};

/******************************************************************************/

export function parseHostname(url) {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.hostname.split('.');
        return {
            hostname: urlObj.hostname,
            domain: parts.length > 2 ? parts.slice(-2).join('.') : urlObj.hostname,
            url: urlObj.href,
            protocol: urlObj.protocol
        };
    } catch (e) {
        return { hostname: '', domain: '', url: '', protocol: '' };
    }
}

/******************************************************************************/

export function matchHostname(pageHostname, filterHostname, filterDomain) {
    if (!filterHostname) { return true; }
    if (pageHostname === filterHostname) { return true; }
    if (filterHostname.startsWith('*.') && pageHostname.endsWith(filterHostname.slice(1))) { return true; }
    if (filterDomain && pageHostname.endsWith('.' + filterDomain)) { return true; }
    return false;
}

/******************************************************************************/

export function toValidHostname(hostname) {
    if (typeof hostname !== 'string') { return ''; }
    hostname = hostname.trim().toLowerCase();
    if (hostname.length === 0) { return ''; }
    if (hostname.startsWith('.')) { hostname = hostname.slice(1); }
    return hostname;
}

/******************************************************************************/

export function injectScript(tabId, files, allFrames = true) {
    return new Promise(function(resolve) {
        chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: allFrames },
            files: files
        }, function() {
            resolve();
        });
    });
}

/******************************************************************************/

export function injectScripts(tabId, scripts, allFrames = false) {
    var chain = Promise.resolve();
    scripts.forEach(function(files) {
        if (Array.isArray(files)) {
            chain = chain.then(function() {
                return injectScript(tabId, files, allFrames);
            });
        } else {
            chain = chain.then(function() {
                return injectScript(tabId, [files], allFrames);
            });
        }
    });
    return chain;
}

/******************************************************************************/

export function wrapPromise(api, method) {
    return function() {
        var args = Array.prototype.slice.call(arguments);
        return new Promise(function(resolve) {
            api[method].apply(api, args.concat(function(result) {
                resolve(result);
            }));
        });
    };
}

/******************************************************************************/

export function apiToPromise(api, method) {
    return function(data) {
        return new Promise(function(resolve) {
            api[method](data, function(result) {
                resolve(result);
            });
        });
    };
}

/******************************************************************************/

export function noop() {}

/******************************************************************************/
