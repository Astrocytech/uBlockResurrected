/*******************************************************************************

    uBlock Origin - MV3 Whitelist
    https://github.com/gorhill/uBlock

    This file contains whitelist and URL filtering management.

******************************************************************************/

import { popupState } from './sw-storage.js';

export const WHITELIST_RULE_ID_MIN = 9_300_000;
export const WHITELIST_RULE_ID_MAX = 9_399_999;
export const HOSTNAME_SWITCH_RULE_ID_MIN = 9_200_000;
export const HOSTNAME_SWITCH_RULE_ID_MAX = 9_299_999;

export const compileWhitelistRulesToDnr = async (whitelist: string[]): Promise<chrome.declarativeNetRequest.Rule[]> => {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let ruleId = WHITELIST_RULE_ID_MIN;

    for (const hostname of whitelist) {
        if (ruleId > WHITELIST_RULE_ID_MAX) break;
        rules.push({
            id: ruleId++,
            priority: 1,
            action: { type: 'allow' },
            condition: {
                urlFilter: '.*',
                requestDomains: [hostname],
            },
        });
    }

    return rules;
};

export const syncWhitelistDnrRules = async (): Promise<void> => {
    const whitelist = popupState.whitelist;
    const rules = await compileWhitelistRulesToDnr(whitelist);

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const toRemove = existing.map(r => r.id).filter(id => id >= WHITELIST_RULE_ID_MIN && id < HOSTNAME_SWITCH_RULE_ID_MIN);

    if (toRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemove });
    }
    if (rules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }
};

export const compilePowerSwitchDnrRules = (perSiteFiltering: Record<string, boolean>): chrome.declarativeNetRequest.Rule[] => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    let nextRuleId = 9_100_000;
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for ( const [ scopeKey, enabled ] of Object.entries(perSiteFiltering).sort(([ a ], [ b ]) => a.localeCompare(b)) ) {
        if ( enabled !== false ) { continue; }
        if ( nextRuleId > 9_199_999 ) { break; }

        const separator = scopeKey.indexOf(':http');
        const isPageScoped = separator !== -1;
        const hostname = isPageScoped ? scopeKey.slice(0, separator) : scopeKey;
        const scopedURL = isPageScoped ? scopeKey.slice(separator + 1) : '';

        const condition: chrome.declarativeNetRequest.RuleCondition = {
            resourceTypes: [
                'main_frame' as chrome.declarativeNetRequest.ResourceType,
                'sub_frame' as chrome.declarativeNetRequest.ResourceType,
            ],
        };

        if ( isPageScoped ) {
            condition.regexFilter = `^${escapeRegex(scopedURL)}$`;
        } else if ( hostname !== '' ) {
            condition.requestDomains = [ hostname ];
        } else {
            continue;
        }

        addRules.push({
            id: nextRuleId++,
            priority: 3_000_000,
            action: { type: 'allowAllRequests' },
            condition,
        });
    }

    return addRules;
};

export const compileHostnameSwitchDnrRules = async (hostnameSwitches: Record<string, Record<string, boolean>>): Promise<chrome.declarativeNetRequest.Rule[]> => {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let ruleId = HOSTNAME_SWITCH_RULE_ID_MIN;

    for (const [hostname, hostSwitches] of Object.entries(hostnameSwitches)) {
        for (const [switchName, enabled] of Object.entries(hostSwitches)) {
            if (ruleId > HOSTNAME_SWITCH_RULE_ID_MAX) break;

            if (switchName === 'no-popups') {
                rules.push({
                    id: ruleId++,
                    priority: 1,
                    action: { type: enabled ? 'allow' : 'block' },
                    condition: {
                        urlFilter: '.*',
                        resourceTypes: ['sub_frame'],
                        initiatorDomains: [hostname],
                    },
                });
            } else if (switchName === 'no-large-media') {
                rules.push({
                    id: ruleId++,
                    priority: 1,
                    action: { type: enabled ? 'allow' : 'block' },
                    condition: {
                        urlFilter: '.*',
                        resourceTypes: ['media', 'font'],
                        initiatorDomains: [hostname],
                    },
                });
            } else if (switchName === 'no-remote-fonts') {
                rules.push({
                    id: ruleId++,
                    priority: 1,
                    action: { type: enabled ? 'allow' : 'block' },
                    condition: {
                        urlFilter: '.*',
                        resourceTypes: ['font'],
                        initiatorDomains: [hostname],
                    },
                });
            } else if (switchName === 'no-scripting') {
                rules.push({
                    id: ruleId++,
                    priority: 1,
                    action: { type: enabled ? 'allow' : 'block' },
                    condition: {
                        urlFilter: '.*',
                        resourceTypes: ['script'],
                        initiatorDomains: [hostname],
                    },
                });
            } else if (switchName === 'no-cosmetic-filtering') {
                // Cosmetic filtering is handled separately
            }
        }
    }

    return rules;
};

export const syncHostnameSwitchDnrRules = async (): Promise<void> => {
    const switches = popupState.sessionHostnameSwitches;
    const rules = await compileHostnameSwitchDnrRules(switches);

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const toRemove = existing.map(r => r.id).filter(id => id >= HOSTNAME_SWITCH_RULE_ID_MIN && id < WHITELIST_RULE_ID_MIN);

    if (toRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemove });
    }
    if (rules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }
};

export const setWhitelist = async (hostname: string, scope: string, state: boolean): Promise<void> => {
    const index = popupState.whitelist.indexOf(hostname);
    if (state && index === -1) {
        popupState.whitelist.push(hostname);
    } else if (!state && index !== -1) {
        popupState.whitelist.splice(index, 1);
    }

    await chrome.storage.local.set({ whitelist: popupState.whitelist.join('\n') });
    await syncWhitelistDnrRules();

    // Broadcast to all tabs
    const broadcastFilteringBehaviorChanged = async () => {
        const messaging = (globalThis as any).vAPI?.messaging;
        if (!messaging) return;

        for (const [, details] of messaging.ports) {
            try {
                details.port.postMessage({
                    channel: 'filtersBehaviorChanged',
                    payload: null,
                });
            } catch {}
        }
    };

    await broadcastFilteringBehaviorChanged();
};

export const applyPersistedHostnameSwitchesForTab = async (tabId: number, url: string): Promise<void> => {
    if (!url) return;

    let hostname = '';
    try {
        hostname = new URL(url).hostname;
    } catch {
        return;
    }

    const stored = await chrome.storage.local.get('perSiteFiltering');
    const perSiteFiltering = stored?.perSiteFiltering || {};

    for (const [domain, enabled] of Object.entries(perSiteFiltering)) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
            try {
                chrome.tabs.sendMessage(tabId, {
                    what: 'powerSwitch',
                    hostname: domain,
                    state: enabled,
                });
            } catch {}
        }
    }
};