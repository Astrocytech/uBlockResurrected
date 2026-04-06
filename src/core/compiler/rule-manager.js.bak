/*******************************************************************************

    uBlock Origin - Rule Manager
    Copyright (C) 2024-present Raymond Hill

    This module manages the lifecycle of DNR rules, including
    add, remove, update operations and state management.

*******************************************************************************/

import { dnrCompiler, MAX_STATIC_RULES, MAX_DYNAMIC_RULES, MAX_SESSION_RULES } from './dnr-compiler.js';

/******************************************************************************/

/**
 * RuleManager - Manages DNR rule lifecycle
 */
class RuleManager {
    constructor() {
        this.initialized = false;
        this.isDirty = false;
        
        // Rule storage by category
        this.staticRules = new Map();  // filterListId -> rules[]
        this.dynamicRules = new Map();  // user-defined permanent rules
        this.sessionRules = new Map();  // user-defined temporary rules
        
        // Change callbacks
        this.onRulesChanged = null;
        
        // Pending changes
        this.pendingUpdates = [];
    }

    /**
     * Initialize the rule manager
     * @param {Object} options - Initialization options
     */
    async initialize(options = {}) {
        if (this.initialized) {
            return;
        }

        this.onRulesChanged = options.onRulesChanged || (() => {});
        
        // Initialize DNR compiler
        await dnrCompiler.compileStaticRules();
        
        this.initialized = true;
        console.log('[RuleManager] Initialized');
    }

    /**
     * Add a static rule from a filter list
     * @param {string} listId - Filter list ID
     * @param {Object} rule - DNR rule
     */
    addStaticRule(listId, rule) {
        if (!this.staticRules.has(listId)) {
            this.staticRules.set(listId, []);
        }
        
        const rules = this.staticRules.get(listId);
        rules.push(rule);
        
        this.isDirty = true;
    }

    /**
     * Remove all static rules from a filter list
     * @param {string} listId - Filter list ID
     */
    removeStaticRules(listId) {
        if (this.staticRules.has(listId)) {
            this.staticRules.delete(listId);
            this.isDirty = true;
        }
    }

    /**
     * Add a dynamic (permanent) rule
     * @param {Object} rule - DNR rule
     * @param {string} key - Unique key for this rule
     */
    addDynamicRule(rule, key) {
        this.dynamicRules.set(key, rule);
        this.isDirty = true;
    }

    /**
     * Remove a dynamic rule
     * @param {string} key - Key of the rule to remove
     */
    removeDynamicRule(key) {
        if (this.dynamicRules.has(key)) {
            this.dynamicRules.delete(key);
            this.isDirty = true;
        }
    }

    /**
     * Add a session (temporary) rule
     * @param {Object} rule - DNR rule
     * @param {string} key - Unique key for this rule
     */
    addSessionRule(rule, key) {
        this.sessionRules.set(key, rule);
        this.isDirty = true;
    }

    /**
     * Remove a session rule
     * @param {string} key - Key of the rule to remove
     */
    removeSessionRule(key) {
        if (this.sessionRules.has(key)) {
            this.sessionRules.delete(key);
            this.isDirty = true;
        }
    }

    /**
     * Get all current rules as array
     * @returns {Object} Object with static, dynamic, session rule arrays
     */
    getAllRules() {
        const staticArr = [];
        for (const rules of this.staticRules.values()) {
            staticArr.push(...rules);
        }
        
        const dynamicArr = Array.from(this.dynamicRules.values());
        const sessionArr = Array.from(this.sessionRules.values());
        
        return {
            static: staticArr,
            dynamic: dynamicArr,
            session: sessionArr,
        };
    }

    /**
     * Check if we have room for more rules
     * @param {string} type - 'static', 'dynamic', or 'session'
     * @returns {boolean} True if can add more
     */
    canAddRules(type) {
        const rules = this.getAllRules();
        
        switch (type) {
            case 'static':
                return rules.static.length < MAX_STATIC_RULES;
            case 'dynamic':
                return rules.dynamic.length < MAX_DYNAMIC_RULES;
            case 'session':
                return rules.session.length < MAX_SESSION_RULES;
            default:
                return false;
        }
    }

    /**
     * Get rule count by type
     * @returns {Object} Counts by type
     */
    getRuleCounts() {
        const rules = this.getAllRules();
        return {
            static: rules.static.length,
            dynamic: rules.dynamic.length,
            session: rules.session.length,
            total: rules.static.length + rules.dynamic.length + rules.session.length,
            maxStatic: MAX_STATIC_RULES,
            maxDynamic: MAX_DYNAMIC_RULES,
            maxSession: MAX_SESSION_RULES,
        };
    }

    /**
     * Apply all pending changes to DNR
     * @returns {Promise} Promise resolving when rules are applied
     */
    async applyChanges() {
        if (!this.isDirty) {
            return;
        }

        const rules = this.getAllRules();
        
        try {
            // Update static rules
            if (browser.declarativeNetRequest) {
                // Get existing static rules
                const existing = await browser.declarativeNetRequest.getStaticRuleCount();
                
                // For now, we'll do a full replacement
                // In production, you'd want to track changes more efficiently
                
                // Clear all static rules first (this is expensive)
                // A better approach would be to track which lists changed
                // and only update those
                
                // For now, skip - static rules are pre-installed via manifest
                // or updated separately
            }
            
            // Update dynamic rules
            if (browser.declarativeNetRequest && rules.dynamic.length > 0) {
                await browser.declarativeNetRequest.updateDynamicRules({
                    addRules: rules.dynamic,
                });
            }
            
            // Update session rules
            if (browser.declarativeNetRequest && rules.session.length > 0) {
                await browser.declarativeNetRequest.updateSessionRules({
                    addRules: rules.session,
                });
            }
            
            this.isDirty = false;
            this.onRulesChanged();
            
            console.log('[RuleManager] Changes applied:', this.getRuleCounts());
        } catch (error) {
            console.error('[RuleManager] Failed to apply changes:', error);
            throw error;
        }
    }

    /**
     * Create a user-defined block rule
     * @param {string} pattern - URL pattern or domain
     * @param {Object} options - Rule options
     * @returns {string} Rule key
     */
    createBlockRule(pattern, options = {}) {
        const rule = {
            priority: options.priority || 1,
            action: { type: 'block' },
            condition: {
                urlFilter: this.normalizePattern(pattern),
            },
        };
        
        if (options.resourceTypes) {
            rule.condition.resourceTypes = options.resourceTypes;
        }
        if (options.domains) {
            rule.condition.domains = options.domains;
        }
        if (options.excludedDomains) {
            rule.condition.excludedDomains = options.excludedDomains;
        }
        
        const key = `block_${pattern}_${Date.now()}`;
        this.addDynamicRule(rule, key);
        
        return key;
    }

    /**
     * Create a user-defined allow rule
     * @param {string} pattern - URL pattern or domain
     * @returns {string} Rule key
     */
    createAllowRule(pattern) {
        const rule = {
            priority: 2,
            action: { type: 'allow' },
            condition: {
                urlFilter: this.normalizePattern(pattern),
            },
        };
        
        const key = `allow_${pattern}_${Date.now()}`;
        this.addDynamicRule(rule, key);
        
        return key;
    }

    /**
     * Create a user-defined redirect rule
     * @param {string} pattern - URL pattern
     * @param {string} targetUrl - Redirect target
     * @returns {string} Rule key
     */
    createRedirectRule(pattern, targetUrl) {
        const rule = {
            priority: 1,
            action: {
                type: 'redirect',
                redirect: { url: targetUrl },
            },
            condition: {
                urlFilter: this.normalizePattern(pattern),
            },
        };
        
        const key = `redirect_${pattern}_${Date.now()}`;
        this.addDynamicRule(rule, key);
        
        return key;
    }

    /**
     * Remove a user-defined rule
     * @param {string} key - Rule key
     */
    removeRule(key) {
        this.removeDynamicRule(key);
    }

    /**
     * Normalize URL pattern for DNR
     * @param {string} pattern - uBlock pattern
     * @returns {string} DNR-compatible pattern
     */
    normalizePattern(pattern) {
        if (!pattern) {
            return '.*';
        }

        let normalized = pattern;
        
        // Convert uBlock patterns to RE2
        normalized = normalized.replace(/[\^\$\*\+\?\!\|\\]/g, '\\$&');
        normalized = normalized.replace(/^\|\|/, '^https?://([^/]+\\.)?');
        normalized = normalized.replace(/^\|/, '^');
        normalized = normalized.replace(/\|$/, '$');
        normalized = normalized.replace(/\.\*/g, '.*');
        normalized = normalized.replace(/\./g, '\\.');

        return normalized || '.*';
    }

    /**
     * Clear all rules
     */
    async clearAll() {
        this.staticRules.clear();
        this.dynamicRules.clear();
        this.sessionRules.clear();
        
        this.isDirty = true;
        await this.applyChanges();
    }

    /**
     * Get current state for serialization
     * @returns {Object} Serializable state
     */
    getState() {
        const state = {
            dynamic: [],
            session: [],
        };
        
        for (const [key, rule] of this.dynamicRules) {
            state.dynamic.push({ key, rule });
        }
        
        for (const [key, rule] of this.sessionRules) {
            state.session.push({ key, rule });
        }
        
        return state;
    }

    /**
     * Restore state from serialized data
     * @param {Object} state - State to restore
     */
    async restoreState(state) {
        this.dynamicRules.clear();
        this.sessionRules.clear();
        
        if (state.dynamic) {
            for (const { key, rule } of state.dynamic) {
                this.dynamicRules.set(key, rule);
            }
        }
        
        if (state.session) {
            for (const { key, rule } of state.session) {
                this.sessionRules.set(key, rule);
            }
        }
        
        this.isDirty = true;
        await this.applyChanges();
    }
}

/******************************************************************************/

// Export singleton instance
const ruleManager = new RuleManager();

export { ruleManager, RuleManager };
export default ruleManager;