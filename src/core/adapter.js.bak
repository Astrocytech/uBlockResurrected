/*******************************************************************************

    uBlock Origin - Blocker Adapter
    Copyright (C) 2014-present Raymond Hill

    This adapter provides the interface between the Blocker extension
    and the uBlock Origin filtering core.

*******************************************************************************/

import {
    permanentFirewall,
    sessionFirewall,
    permanentURLFiltering,
    sessionURLFiltering,
    permanentSwitches,
    sessionSwitches,
    staticNetFilteringEngine,
    staticExtFilteringEngine,
    cosmeticFilteringEngine,
    scriptletFilteringEngine,
    redirectEngine,
    io as assetsIO,
    storage as filterStorage,
    cacheStorage,
} from './index.js';

/**
 * BlockerAdapter - Interface between Blocker and uBlock core
 */
class BlockerAdapter {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the filtering core
     * @param {Object} options - Initialization options
     * @param {Function} options.onFilterChanged - Callback when filters change
     * @param {Function} options.onWhitelistChanged - Callback when whitelist changes
     */
    async initialize(options = {}) {
        if (this.initialized) {
            return;
        }

        this.onFilterChanged = options.onFilterChanged || (() => {});
        this.onWhitelistChanged = options.onWhitelistChanged || (() => {});

        // Initialize static filtering engines
        await staticNetFilteringEngine.freeze();
        await staticExtFilteringEngine.freeze();
        
        // Initialize cosmetic filtering
        cosmeticFilteringEngine.init();

        // Initialize scriptlet filtering  
        scriptletFilteringEngine.init();

        // Initialize redirect engine
        redirectEngine.init();

        // Initialize asset storage
        await assetsIO.init();

        // Initialize filter storage
        await filterStorage.init();

        this.initialized = true;
        
        console.log('[BlockerAdapter] Core initialized');
    }

    /**
     * Check if a request should be blocked
     * @param {Object} details - Request details
     * @returns {Object|null} - Block decision or null
     */
    shouldBlock(details) {
        if (!this.initialized) {
            console.warn('[BlockerAdapter] Not initialized');
            return null;
        }

        const result = staticNetFilteringEngine.matchRequest(details);
        
        if (result instanceof Object) {
            if (result.block) {
                return { blocked: true, filter: result };
            }
            
            // Check redirect
            if (result.redirect !== undefined) {
                return { 
                    blocked: true, 
                    redirect: result.redirect,
                    filter: result 
                };
            }
        }

        // Check dynamic rules
        const firewallResult = permanentFirewall.matchCell(details);
        if ( firewallResult !== 0 ) {
            return { blocked: firewallResult === 1, type: 'dynamic' };
        }

        const sessionResult = sessionFirewall.matchCell(details);
        if ( sessionResult !== 0 ) {
            return { blocked: sessionResult === 1, type: 'session' };
        }

        return { blocked: false };
    }

    /**
     * Check if cosmetic filters match
     * @param {Object} details - Page details
     * @returns {Array} - Array of cosmetic filters
     */
    getCosmeticFilters(details) {
        if (!this.initialized) {
            return [];
        }

        return cosmeticFilteringEngine.getMatches(details);
    }

    /**
     * Get scriptlet injections for a page
     * @param {Object} details - Page details
     * @returns {Array} - Array of scriptlet injections
     */
    getScriptlets(details) {
        if (!this.initialized) {
            return [];
        }

        return scriptletFilteringEngine.getMatches(details);
    }

    /**
     * Add a user filter rule
     * @param {string} filter - Filter string
     */
    async addUserFilter(filter) {
        await filterStorage.addUserFilter(filter);
        this.onFilterChanged();
    }

    /**
     * Remove a user filter rule
     * @param {string} filter - Filter string
     */
    async removeUserFilter(filter) {
        await filterStorage.removeUserFilter(filter);
        this.onFilterChanged();
    }

    /**
     * Get all user filters
     * @returns {Array} - Array of user filter strings
     */
    getUserFilters() {
        return filterStorage.getUserFilters();
    }

    /**
     * Check if a URL is whitelisted
     * @param {string} url - URL to check
     * @param {string} documentURL - Document URL
     * @returns {boolean} - Whether whitelisted
     */
    isWhitelisted(url, documentURL) {
        return staticExtFilteringEngine.matchString(url, documentURL);
    }

    /**
     * Get the current filter lists
     * @returns {Object} - Filter list status
     */
    getFilterLists() {
        return filterStorage.getFilterLists();
    }

    /**
     * Enable/disable a filter list
     * @param {string} listId - List ID
     * @param {boolean} enabled - Enable or disable
     */
    async toggleFilterList(listId, enabled) {
        await filterStorage.toggleFilterList(listId, enabled);
        this.onFilterChanged();
    }

    /**
     * Get statistics
     * @returns {Object} - Filtering statistics
     */
    getStats() {
        return {
            allowed: staticNetFilteringEngine.getAllowedCount(),
            blocked: staticNetFilteringEngine.getBlockedCount(),
            userFilters: filterStorage.getUserFilters().length,
        };
    }

    /**
     * Shutdown the core
     */
    shutdown() {
        if (!this.initialized) {
            return;
        }

        staticNetFilteringEngine.release();
        staticExtFilteringEngine.release();
        cosmeticFilteringEngine.destroy();
        scriptletFilteringEngine.destroy();

        this.initialized = false;
        console.log('[BlockerAdapter] Core shutdown');
    }
}

// Export singleton instance
export default new BlockerAdapter();