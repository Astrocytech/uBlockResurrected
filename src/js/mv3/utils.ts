/**
 * uBlock Origin - MV3 Service Worker
 * Shared Utilities and Constants
 */

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

export interface ParsedHostname {
    hostname: string;
    domain: string;
    url: string;
    protocol: string;
}

export function parseHostname(url: string): ParsedHostname {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.hostname.split('.');
        return {
            hostname: urlObj.hostname,
            domain: parts.length > 2 ? parts.slice(-2).join('.') : urlObj.hostname,
            url: urlObj.href,
            protocol: urlObj.protocol
        };
    } catch {
        return { hostname: '', domain: '', url: '', protocol: '' };
    }
}

export function matchHostname(pageHostname: string, filterHostname: string, filterDomain?: string): boolean {
    if (!filterHostname) { return true; }
    if (pageHostname === filterHostname) { return true; }
    if (filterHostname.startsWith('*.') && pageHostname.endsWith(filterHostname.slice(1))) { return true; }
    if (filterDomain && pageHostname.endsWith('.' + filterDomain)) { return true; }
    return false;
}

export function toValidHostname(hostname: string): string {
    if (typeof hostname !== 'string') { return ''; }
    hostname = hostname.trim().toLowerCase();
    if (hostname.length === 0) { return ''; }
    if (hostname.startsWith('.')) { hostname = hostname.slice(1); }
    return hostname;
}

export function injectScript(tabId: number, files: string[], allFrames = true): Promise<void> {
    return new Promise(function(resolve) {
        chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: allFrames },
            files: files
        }, function() {
            resolve();
        });
    });
}

export function injectScripts(tabId: number, scripts: string | string[] | Array<string | string[]>, allFrames = false): Promise<void> {
    let chain = Promise.resolve();
    
    const scriptArray = Array.isArray(scripts) ? scripts : [[scripts as string]];
    
    scriptArray.forEach(function(files: string | string[]) {
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

export function wrapPromise<T>(api: Record<string, unknown>, method: string): (...args: unknown[]) => Promise<T> {
    return function(...args: unknown[]) {
        const callbackArgs = Array.prototype.slice.call(args);
        return new Promise(function(resolve) {
            ((api[method] as (...args: unknown[]) => void).apply(api, callbackArgs.concat(function(result: T) {
                resolve(result);
            })));
        });
    };
}

export function apiToPromise<T>(api: Record<string, unknown>, method: string): (data: unknown) => Promise<T> {
    return function(data: unknown) {
        return new Promise(function(resolve) {
            ((api[method] as (data: unknown, cb: (result: T) => void) => void))(data, function(result: T) {
                resolve(result);
            });
        });
    };
}

export function noop(): void {}

export { parseHostname as hostnameParser };
