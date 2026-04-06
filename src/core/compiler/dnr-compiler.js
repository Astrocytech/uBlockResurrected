/*******************************************************************************

    uBlock Origin - DNR Compiler
    Copyright (C) 2024-present Raymond Hill

    This module compiles uBlock filters to Chrome's Declarative Net Request (DNR)
    rules for MV3 compatibility.

*******************************************************************************/

import staticNetFilteringEngine from '../../js/static-net-filtering.js';
import staticExtFilteringEngine from '../../js/static-ext-filtering.js';
import { redirectEngine } from '../../js/redirect-engine.js';

/******************************************************************************/

// DNR rule limits
const MAX_STATIC_RULES = 30000;
const MAX_SESSION_RULES = 5000;
const MAX_DYNAMIC_RULES = 30000;

// Resource type mapping from uBlock to DNR
const resourceTypeMap = {
    'main_frame': 'main_frame',
    'sub_frame': 'sub_frame',
    'stylesheet': 'stylesheet',
    'script': 'script',
    'image': 'image',
    'object': 'object',
    'xhr': 'xmlhttprequest',
    'fetch': 'fetch',
    'font': 'font',
    'media': 'media',
    'websocket': 'websocket',
    'ping': 'ping',
    'other': 'other',
    'popup': 'popup',
    'popunder': 'popup',
    'document': 'main_frame',
};

// Action type mapping
const ACTION_BLOCK = 'block';
const ACTION_ALLOW = 'allow';
const ACTION_CAPTURE = 'capture';

/******************************************************************************/

/**
 * DNRCompiler - Converts uBlock filters to DNR rules
 */
class DNRCompiler {
    constructor() {
        this.compiledRules = [];
        this.ruleIdCounter = 1;
        this.staticRules = [];
        this.sessionRules = [];
        this.dynamicRules = [];
    }

    /**
     * Compile all static filters to DNR rules
     * @returns {Promise<Array>} Array of DNR rules
     */
    async compileStaticRules() {
        this.staticRules = [];
        this.ruleIdCounter = 1;
        
        // Get all filters from static net filtering engine
        // This requires iterating through the internal data structures
        const filters = this.extractStaticFilters();
        
        for (const filter of filters) {
            const dnrRule = this.filterToDNRRule(filter);
            if (dnrRule) {
                dnrRule.id = this.ruleIdCounter++;
                this.staticRules.push(dnrRule);
            }
            
            // Check budget
            if (this.staticRules.length >= MAX_STATIC_RULES) {
                console.warn(`[DNRCompiler] Reached max static rules (${MAX_STATIC_RULES})`);
                break;
            }
        }
        
        console.log(`[DNRCompiler] Compiled ${this.staticRules.length} static rules`);
        return this.staticRules;
    }

    /**
     * Extract filters from static filtering engine
     * This is a simplified implementation - actual extraction would need
     * to access internal filter data structures
     * @returns {Array} Array of filter objects
     */
    extractStaticFilters() {
        const filters = [];
        
        // The static filtering engine stores filters in various tries
        // For MVP, we'll create rules based on what we can extract
        // A full implementation would need to iterate through the internal
        
        // For now, return empty - full implementation requires deeper
        // integration with static-net-filtering.js internals
        // This is where the complexity lies - the trie structures
        // don't expose a simple "getAllFilters()" API
        
        return filters;
    }

    /**
     * Convert a uBlock filter to DNR rule format
     * @param {Object} filter - Filter object
     * @returns {Object|null} DNR rule or null if not convertible
     */
    filterToDNRRule(filter) {
        if (!filter || !filter.pattern) {
            return null;
        }

        const dnrRule = {
            priority: filter.priority || 1,
            action: {
                type: filter.type === 'allow' ? ACTION_ALLOW : ACTION_BLOCK,
            },
            condition: {
                urlFilter: this.normalizeUrlFilter(filter.pattern),
                resourceTypes: this.getResourceTypes(filter.types),
                requestMethods: filter.methods ? filter.methods.map(m => m.toUpperCase()) : undefined,
                domains: filter.domains ? filter.domains.map(d => d.startsWith('~') ? d.slice(1) : d) : undefined,
                excludedDomains: filter.excludedDomains,
            },
        };

        // Handle redirect
        if (filter.redirect) {
            dnrRule.action.type = 'redirect';
            dnrRule.action.redirect = { url: filter.redirect };
        }

        // Handle important rules
        if (filter.important) {
            dnrRule.priority = 2;
        }

        return dnrRule;
    }

    /**
     * Normalize URL filter for DNR
     * DNR uses RE2 regex syntax
     * @param {string} pattern - uBlock pattern
     * @returns {string} DNR-compatible pattern
     */
    normalizeUrlFilter(pattern) {
        if (!pattern) {
            return '.*';
        }

        // Convert uBlock pattern to RE2
        let normalized = pattern;

        // Handle special characters
        normalized = normalized.replace(/[\^\$\*\+\?\!\|\\]/g, '\\$&');
        
        // Handle domain patterns
        normalized = normalized.replace(/^\|\|/, '^https?://([^/]+\\.)?');
        normalized = normalized.replace(/^\|/, '^');
        normalized = normalized.replace(/\|$/, '$');
        
        // Handle . and * wildcards (already handled by above, but ensure)
        normalized = normalized.replace(/\.\*/g, '.*');
        normalized = normalized.replace(/\./g, '\\.');

        return normalized || '.*';
    }

    /**
     * Get DNR resource types from uBlock types
     * @param {Array} types - uBlock resource types
     * @returns {Array} DNR resource types
     */
    getResourceTypes(types) {
        if (!types || types.length === 0) {
            return undefined;
        }
        
        const dnrTypes = types
            .map(t => resourceTypeMap[t])
            .filter(t => t !== undefined);
        
        return dnrTypes.length > 0 ? dnrTypes : undefined;
    }

    /**
     * Create a block rule for a specific domain
     * @param {string} domain - Domain to block
     * @param {string} type - Resource type to block
     * @returns {Object} DNR rule
     */
    createBlockRule(domain, type = 'main_frame') {
        return {
            id: this.ruleIdCounter++,
            priority: 1,
            action: { type: ACTION_BLOCK },
            condition: {
                urlFilter: `^https?://([^/]+\\.)?${this.escapeDomain(domain)}`,
                resourceTypes: [type],
            },
        };
    }

    /**
     * Create an allow rule for a specific domain
     * @param {string} domain - Domain to allow
     * @returns {Object} DNR rule
     */
    createAllowRule(domain) {
        return {
            id: this.ruleIdCounter++,
            priority: 2,
            action: { type: ACTION_ALLOW },
            condition: {
                urlFilter: `^https?://([^/]+\\.)?${this.escapeDomain(domain)}`,
            },
        };
    }

    /**
     * Create a redirect rule
     * @param {string} pattern - URL pattern to redirect
     * @param {string} redirectUrl - Target URL
     * @returns {Object} DNR rule
     */
    createRedirectRule(pattern, redirectUrl) {
        return {
            id: this.ruleIdCounter++,
            priority: 1,
            action: {
                type: 'redirect',
                redirect: { url: redirectUrl },
            },
            condition: {
                urlFilter: this.normalizeUrlFilter(pattern),
            },
        };
    }

    /**
     * Escape domain for regex
     * @param {string} domain - Domain to escape
     * @returns {string} Escaped domain
     */
    escapeDomain(domain) {
        return domain.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Compile dynamic rules from filtering engines
     * @param {Object} engines - Filtering engines
     * @returns {Array} Array of dynamic DNR rules
     */
    compileDynamicRules(engines) {
        const rules = [];
        
        if (!engines) {
            return rules;
        }

        // Compile permanent firewall rules
        if (engines.permanentFirewall) {
            const permRules = this.compileFirewallRules(engines.permanentFirewall, 'permanent');
            rules.push(...permRules);
        }

        // Compile session firewall rules
        if (engines.sessionFirewall) {
            const sessRules = this.compileFirewallRules(engines.sessionFirewall, 'session');
            rules.push(...sessRules);
        }

        // Compile permanent URL rules
        if (engines.permanentURLFiltering) {
            const urlRules = this.compileURLRules(engines.permanentURLFiltering, 'permanent');
            rules.push(...urlRules);
        }

        // Check budget
        if (rules.length > MAX_DYNAMIC_RULES) {
            console.warn(`[DNRCompiler] Dynamic rules exceed limit, truncating`);
            rules.length = MAX_DYNAMIC_RULES;
        }

        this.dynamicRules = rules;
        console.log(`[DNRCompiler] Compiled ${rules.length} dynamic rules`);
        
        return rules;
    }

    /**
     * Compile firewall rules to DNR
     * @param {Object} firewall - Firewall engine
     * @param {string} type - 'permanent' or 'session'
     * @returns {Array} Array of DNR rules
     */
    compileFirewallRules(firewall, type) {
        const rules = [];
        
        // This would need access to internal firewall data
        // Simplified placeholder - actual implementation would
        // iterate through firewall's internal trie
        
        return rules;
    }

    /**
     * Compile URL rules to DNR
     * @param {Object} urlFiltering - URL filtering engine
     * @param {string} type - 'permanent' or 'session'
     * @returns {Array} Array of DNR rules
     */
    compileURLRules(urlFiltering, type) {
        const rules = [];
        
        // Similar to firewall - would need internal access
        
        return rules;
    }

    /**
     * Install rules to Chrome DNR API
     * @returns {Promise} Promise resolving when rules are installed
     */
    async installRules() {
        if (typeof browser === 'undefined' || !browser.declarativeNetRequest) {
            console.warn('[DNRCompiler] DNR API not available');
            return;
        }

        try {
            // Update static rules
            if (this.staticRules.length > 0) {
                await browser.declarativeNetRequest.updateStaticRules({
                    addRules: this.staticRules,
                });
            }

            // Update dynamic rules
            if (this.dynamicRules.length > 0) {
                await browser.declarativeNetRequest.updateDynamicRules({
                    addRules: this.dynamicRules,
                });
            }

            console.log('[DNRCompiler] Rules installed successfully');
        } catch (error) {
            console.error('[DNRCompiler] Failed to install rules:', error);
            throw error;
        }
    }

    /**
     * Clear all DNR rules
     * @returns {Promise} Promise resolving when rules are cleared
     */
    async clearRules() {
        if (typeof browser === 'undefined' || !browser.declarativeNetRequest) {
            return;
        }

        try {
            // Clear static rules
            await browser.declarativeNetRequest.updateStaticRules({
                removeRuleIds: this.staticRules.map(r => r.id),
            });

            // Clear dynamic rules
            await browser.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: this.dynamicRules.map(r => r.id),
            });

            // Clear session rules
            await browser.declarativeNetRequest.updateSessionRules({
                removeRuleIds: this.sessionRules.map(r => r.id),
            });

            console.log('[DNRCompiler] All rules cleared');
        } catch (error) {
            console.error('[DNRCompiler] Failed to clear rules:', error);
        }
    }

    /**
     * Get statistics about compiled rules
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            static: this.staticRules.length,
            dynamic: this.dynamicRules.length,
            session: this.sessionRules.length,
            total: this.staticRules.length + this.dynamicRules.length + this.sessionRules.length,
            maxStatic: MAX_STATIC_RULES,
            maxDynamic: MAX_DYNAMIC_RULES,
            maxSession: MAX_SESSION_RULES,
        };
    }
}

/******************************************************************************/

// Export singleton instance
const dnrCompiler = new DNRCompiler();

export { dnrCompiler, DNRCompiler, MAX_STATIC_RULES, MAX_DYNAMIC_RULES, MAX_SESSION_RULES };
export default dnrCompiler;