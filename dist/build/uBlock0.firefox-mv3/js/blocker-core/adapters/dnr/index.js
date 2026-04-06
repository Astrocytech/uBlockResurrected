class FirefoxDNRAdapter {
    async getDynamicRules() {
        return browser.declarativeNetRequest.getDynamicRules();
    }
    
    async updateDynamicRules(options) {
        const addRules = options.addRules?.map(rule => ({
            id: rule.id,
            priority: rule.priority,
            action: rule.action,
            condition: rule.condition,
        })) ?? [];
        
        // Firefox MV2 uses webRequest, but we can use DNR if available
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            await browser.declarativeNetRequest.updateDynamicRules({
                addRules: addRules,
                removeRuleIds: options.removeRuleIds ?? [],
            });
        } else {
            console.warn('[FirefoxDNRAdapter] DNR API not available in MV2 mode');
        }
    }
    
    async getSessionRules() {
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            return browser.declarativeNetRequest.getSessionRules();
        }
        return [];
    }
    
    async updateSessionRules(options) {
        const addRules = options.addRules?.map(rule => ({
            id: rule.id,
            priority: rule.priority,
            action: rule.action,
            condition: rule.condition,
        })) ?? [];
        
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            await browser.declarativeNetRequest.updateSessionRules({
                addRules: addRules,
                removeRuleIds: options.removeRuleIds ?? [],
            });
        }
    }
    
    async getAvailableStaticRuleCount() {
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            return browser.declarativeNetRequest.getAvailableStaticRuleCount();
        }
        return 0;
    }
    
    async getMatchedRules(options) {
        const filterOptions = {};
        if (options?.tabId !== undefined) {
            filterOptions.tabId = options.tabId;
        }
        if (options?.initiator) {
            filterOptions.initiator = options.initiator;
        }
        
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            const result = await browser.declarativeNetRequest.getMatchedRules(filterOptions);
            return result.rules ?? [];
        }
        return [];
    }
    
    async installDynamicRules(dynamicRules, sessionRules = []) {
        const allRules = [...dynamicRules, ...sessionRules];
        
        if (allRules.length === 0) return;
        
        // For Firefox MV2, we primarily use webRequest
        // DNR is optional for MV2 when webRequest is available
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            await browser.declarativeNetRequest.updateDynamicRules({
                addRules: allRules.map(rule => ({
                    id: rule.id,
                    priority: rule.priority,
                    action: rule.action,
                    condition: rule.condition,
                })),
                removeRuleIds: [],
            });
            console.log(`[FirefoxDNRAdapter] Installed ${allRules.length} DNR rules`);
        } else {
            console.log(`[FirefoxDNRAdapter] Would install ${allRules.length} rules (webRequest mode)`);
        }
    }
    
    async clearDynamicRules(site) {
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            const rules = await browser.declarativeNetRequest.getDynamicRules();
            const siteRules = rules.filter(r => 
                r.condition?.initiatorDomains?.includes(site)
            );
            if (siteRules.length > 0) {
                await browser.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: siteRules.map(r => r.id)
                });
            }
        }
    }
}

class ChromeDNRAdapter {
    async getDynamicRules() {
        return chrome.declarativeNetRequest.getDynamicRules();
    }
    async updateDynamicRules(options) {
        const addRules = options.addRules?.map(rule => ({
            id: rule.id,
            priority: rule.priority,
            action: rule.action,
            condition: rule.condition,
        })) ?? [];
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: addRules,
            removeRuleIds: options.removeRuleIds ?? [],
        });
    }
    async getSessionRules() {
        return chrome.declarativeNetRequest.getSessionRules();
    }
    async updateSessionRules(options) {
        const addRules = options.addRules?.map(rule => ({
            id: rule.id,
            priority: rule.priority,
            action: rule.action,
            condition: rule.condition,
        })) ?? [];
        await chrome.declarativeNetRequest.updateSessionRules({
            addRules: addRules,
            removeRuleIds: options.removeRuleIds ?? [],
        });
    }
    async getAvailableStaticRuleCount() {
        return chrome.declarativeNetRequest.getAvailableStaticRuleCount();
    }
    async getMatchedRules(options) {
        const filterOptions = {};
        if (options?.tabId !== undefined) {
            filterOptions.tabId = options.tabId;
        }
        if (options?.initiator) {
            filterOptions.initiator = options.initiator;
        }
        const result = await chrome.declarativeNetRequest.getMatchedRules(filterOptions);
        return result.rules ?? [];
    }
    
    async installDynamicRules(dynamicRules, sessionRules = []) {
        const allRules = [...dynamicRules, ...sessionRules];
        
        if (allRules.length === 0) return;
        
        // First, get existing rules to avoid conflicts
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingIds = new Set(existingRules.map(r => r.id));
        
        // Filter out rules with conflicting IDs
        const newRules = allRules.filter(r => !existingIds.has(r.id));
        
        if (newRules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: newRules.map(rule => ({
                    id: rule.id,
                    priority: rule.priority,
                    action: rule.action,
                    condition: rule.condition,
                })),
                removeRuleIds: [],
            });
            console.log(`[ChromeDNRAdapter] Installed ${newRules.length} new rules`);
        }
    }
    
    async clearDynamicRules(site) {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        const siteRules = rules.filter(r => 
            r.condition?.initiatorDomains?.includes(site)
        );
        if (siteRules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: siteRules.map(r => r.id)
            });
        }
    }
}

let instance = null;

export function getDNRAdapter() {
    if (instance) return instance;
    
    // Detect browser/environment
    const isFirefox = typeof browser !== 'undefined' && 
                     browser.runtime?.getBrowserInfo !== undefined;
    const isChromeMV3 = typeof chrome !== 'undefined' && 
                        chrome.runtime?.getManifest?.()?.manifest_version === 3;
    
    if (isFirefox || isChromeMV3) {
        // Check if DNR is available
        if (typeof browser !== 'undefined' && browser.declarativeNetRequest) {
            instance = new FirefoxDNRAdapter();
        } else if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
            instance = new ChromeDNRAdapter();
        } else {
            console.warn('[DNR] DNR API not available, using fallback');
            instance = new FirefoxDNRAdapter(); // Fallback
        }
    } else {
        instance = new ChromeDNRAdapter();
    }
    
    return instance;
}

export function createFirefoxDNRAdapter() {
    return new FirefoxDNRAdapter();
}

export function createChromeDNRAdapter() {
    return new ChromeDNRAdapter();
}

export function setDNRAdapter(adapter) {
    instance = adapter;
}