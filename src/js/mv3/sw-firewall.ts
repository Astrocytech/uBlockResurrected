/*******************************************************************************

    uBlock Origin - MV3 Firewall
    https://github.com/gorhill/uBlock

    This file contains firewall rule management and DNR compilation.

******************************************************************************/

import { DynamicFirewallRules } from './sw-classes.js';
import { popupState } from './sw-storage.js';

export const FIREWALL_RULE_ID_MIN = 9_000_000;
export const FIREWALL_RULE_ID_MAX = 9_099_999;
export const POWER_RULE_ID_MIN = 9_100_000;
export const POWER_RULE_ID_MAX = 9_199_999;
export const HOSTNAME_SWITCH_RULE_ID_MIN = 9_200_000;
export const HOSTNAME_SWITCH_RULE_ID_MAX = 9_299_999;
export const WHITELIST_RULE_ID_MIN = 9_300_000;
export const WHITELIST_RULE_ID_MAX = 9_399_999;

export const firewallRuleTypes = [
    '*',
    'image',
    '3p',
    'inline-script',
    '1p-script',
    '3p-script',
    '3p-frame',
];

export const firewallTypeBitOffsets: Record<string, number> = {
    '*': 0,
    'inline-script': 2,
    '1p-script': 4,
    '3p-script': 6,
    '3p-frame': 8,
    image: 10,
    '3p': 12,
};

export const firewallActionNames: Record<number, string> = {
    1: 'block',
    2: 'allow',
    3: 'noop',
};

export const firewallActionValues: Record<string, number> = {
    block: 1,
    allow: 2,
    noop: 3,
};

export const firewallRuleResourceTypes = (type: string) => {
    switch (type) {
    case 'image': return ['image'];
    case '3p-script':
    case '1p-script': return ['script'];
    case '3p-frame': return ['sub_frame'];
    case '3p': return ['image', 'script', 'sub_frame'];
    case '*': return ['image', 'script', 'sub_frame', 'xmlhttprequest', 'media', 'font', 'object', 'other'];
    default: return [];
    }
};

export const compileFirewallRulesToDnr = async (firewall: DynamicFirewallRules): Promise<chrome.declarativeNetRequest.Rule[]> => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    let nextRuleId = FIREWALL_RULE_ID_MIN;

    for (const rule of firewall.toArray()) {
        const [src, dest, type, actionName] = rule.split(' ');
        const resourceTypes = firewallRuleResourceTypes(type);

        if (type === 'inline-script') {
            if (nextRuleId > FIREWALL_RULE_ID_MAX) break;
            const condition: chrome.declarativeNetRequest.RuleCondition = {
                resourceTypes: ['main_frame', 'sub_frame'],
            };
            if (src !== '*') {
                condition.initiatorDomains = [src];
            }
            addRules.push({
                id: nextRuleId++,
                priority: 2000000 + (actionName === 'allow' || actionName === 'noop' ? 10000 : 0) + (src !== '*' ? 1000 : 0),
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: [{
                        header: 'content-security-policy',
                        operation: 'set',
                        value: actionName === 'block'
                            ? "script-src 'self' 'unsafe-eval' http: https: data: blob:; object-src 'none'; base-uri 'self'"
                            : "script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https: data: blob:; object-src 'none'; base-uri 'self'",
                    }],
                },
                condition,
            });
            continue;
        }

        for (const resourceType of resourceTypes) {
            if (nextRuleId > FIREWALL_RULE_ID_MAX) break;
            const condition: chrome.declarativeNetRequest.RuleCondition = {
                resourceTypes: [resourceType as chrome.declarativeNetRequest.ResourceType],
            };
            if (src !== '*') {
                condition.initiatorDomains = [src];
            }
            if (dest !== '*') {
                condition.requestDomains = [dest];
            }
            if (type === '3p' || type === '3p-script' || type === '3p-frame') {
                condition.domainType = 'thirdParty';
            } else if (type === '1p-script') {
                condition.domainType = 'firstParty';
            }

            addRules.push({
                id: nextRuleId++,
                priority: 2000000 + (actionName === 'allow' || actionName === 'noop' ? 10000 : 0) + (src !== '*' ? 1000 : 0),
                action: {
                    type: (actionName === 'allow' || actionName === 'noop') ? 'allow' : 'block',
                },
                condition,
            });
        }
    }

    return addRules;
};

export const syncFirewallDnrRules = async (): Promise<void> => {
    const firewall = popupState.sessionFirewall;
    const addRules = await compileFirewallRulesToDnr(firewall);

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const toRemove = existing.map(r => r.id).filter(id => id >= FIREWALL_RULE_ID_MIN && id < POWER_RULE_ID_MIN);

    if (toRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemove });
    }
    if (addRules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
    }
};

export const compilePowerSwitchDnrRules = async (perSiteFiltering: Record<string, boolean>): Promise<chrome.declarativeNetRequest.Rule[]> => {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let ruleId = POWER_RULE_ID_MIN;

    for (const [domain, enabled] of Object.entries(perSiteFiltering)) {
        if (ruleId > POWER_RULE_ID_MAX) break;
        rules.push({
            id: ruleId++,
            priority: 1,
            action: { type: enabled ? 'allow' : 'block' },
            condition: {
                urlFilter: '.*',
                requestDomains: [domain],
            },
        });
    }

    return rules;
};

export const syncPowerSwitchDnrRules = async (): Promise<void> => {
    const stored = await chrome.storage.local.get('perSiteFiltering');
    const perSite = stored?.perSiteFiltering || {};
    const rules = await compilePowerSwitchDnrRules(perSite);

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const toRemove = existing.map(r => r.id).filter(id => id >= POWER_RULE_ID_MIN && id < 9300000);

    if (toRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemove });
    }
    if (rules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }
};

export const persistFirewallRules = async (): Promise<void> => {
    await chrome.storage.local.set({
        dynamicFilteringString: popupState.permanentFirewall.toString(),
    });
};

export const revertFirewallRules = async (): Promise<void> => {
    popupState.sessionFirewall.assign(popupState.permanentFirewall);
    await syncFirewallDnrRules();
};

export const getFirewallRulesForPopup = (srcHostname: string, hostnameDict: Record<string, any>): Record<string, string> => {
    const firewallRules: Record<string, string> = {};
    const firewallRuleTypes = ['*', 'image', '3p', 'inline-script', '1p-script', '3p-script', '3p-frame'];

    for (const type of firewallRuleTypes) {
        const globalRule = popupState.sessionFirewall.lookupRuleData('*', '*', type);
        if (globalRule !== undefined) {
            firewallRules[`/ * ${type}`] = globalRule;
        }
        const localRule = popupState.sessionFirewall.lookupRuleData(srcHostname, '*', type);
        if (localRule !== undefined) {
            firewallRules[`. * ${type}`] = localRule;
        }
    }

    for (const desHostname of Object.keys(hostnameDict)) {
        const globalRule = popupState.sessionFirewall.lookupRuleData('*', desHostname, '*');
        if (globalRule !== undefined) {
            firewallRules[`/ ${desHostname} *`] = globalRule;
        }
        const localRule = popupState.sessionFirewall.lookupRuleData(srcHostname, desHostname, '*');
        if (localRule !== undefined) {
            firewallRules[`. ${desHostname} *`] = localRule;
        }
    }

    return firewallRules;
};

export const compileHostnameSwitchDnrRules = (hostnameSwitches: Record<string, Record<string, boolean>>): chrome.declarativeNetRequest.Rule[] => {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let ruleId = HOSTNAME_SWITCH_RULE_ID_MIN;

    const noScripting = new Set<string>();
    const noCosmetic = new Set<string>();
    const noPopup = new Set<string>();
    const noLargeMedia = new Set<string>();
    const noRemoteFonts = new Set<string>();

    for (const [hostname, switches] of Object.entries(hostnameSwitches)) {
        if (switches['no-scripting']) noScripting.add(hostname);
        if (switches['no-cosmetic-filtering']) noCosmetic.add(hostname);
        if (switches['no-popups']) noPopup.add(hostname);
        if (switches['no-large-media']) noLargeMedia.add(hostname);
        if (switches['no-remote-fonts']) noRemoteFonts.add(hostname);
    }

    for (const hostname of noScripting) {
        if (ruleId > HOSTNAME_SWITCH_RULE_ID_MAX) break;
        rules.push({
            id: ruleId++,
            priority: 1,
            action: { type: 'block' },
            condition: { urlFilter: '.*', requestDomains: [hostname] },
        });
    }

    return rules;
};

export const syncHostnameSwitchDnrRules = async (): Promise<void> => {
    if (chrome.declarativeNetRequest === undefined) { return; }
    
    const addRules = compileHostnameSwitchDnrRules(popupState.sessionHostnameSwitches);
    
    const MAX_DNR_RULES = 30000;
    if (addRules.length > MAX_DNR_RULES) {
        addRules.length = MAX_DNR_RULES;
    }
    
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= HOSTNAME_SWITCH_RULE_ID_MIN && id <= HOSTNAME_SWITCH_RULE_ID_MAX);
    
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
};

export const compileWhitelistRulesToDnr = (whitelist: string[]): chrome.declarativeNetRequest.Rule[] => {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let ruleId = WHITELIST_RULE_ID_MIN;

    for (const entry of whitelist) {
        if (ruleId > WHITELIST_RULE_ID_MAX) break;
        const trimmed = entry.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        
        try {
            rules.push({
                id: ruleId++,
                priority: 1,
                action: { type: 'allow' },
                condition: {
                    urlFilter: `.*${trimmed.replace(/\./g, '\\.').replace(/\*/g, '.*')}.*`,
                },
            });
        } catch {
            // Skip invalid entries
        }
    }

    return rules;
};

export const syncWhitelistDnrRules = async (): Promise<void> => {
    if (chrome.declarativeNetRequest === undefined) { return; }
    
    const stored = await chrome.storage.local.get('whitelist');
    const whitelist = typeof stored?.whitelist === 'string' 
        ? stored.whitelist.split('\n').filter(l => l.trim())
        : [];
    
    const addRules = compileWhitelistRulesToDnr(whitelist);
    
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= WHITELIST_RULE_ID_MIN && id <= WHITELIST_RULE_ID_MAX);
    
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
};