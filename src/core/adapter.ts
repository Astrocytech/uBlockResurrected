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

interface RequestDetails {
    url: string;
    originUrl?: string;
    documentUrl?: string;
    type?: string;
    method?: string;
    tabId?: number;
    frameId?: number;
    frameUrl?: string;
    [key: string]: unknown;
}

interface BlockResult {
    blocked: boolean;
    filter?: unknown;
    redirect?: string;
    type?: 'dynamic' | 'session';
}

interface PageDetails {
    url: string;
    documentUrl?: string;
    tabId?: number;
    frameId?: number;
    [key: string]: unknown;
}

interface AdapterOptions {
    onFilterChanged?: () => void;
    onWhitelistChanged?: () => void;
}

interface FilterStats {
    allowed: number;
    blocked: number;
    userFilters: number;
}

/**
 * BlockerAdapter - Interface between Blocker and uBlock core
 */
class BlockerAdapter {
    private initialized: boolean = false;
    private onFilterChanged: () => void = () => {};
    private onWhitelistChanged: () => void = () => {};

    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the filtering core
     * @param options - Initialization options
     */
    async initialize(options: AdapterOptions = {}): Promise<void> {
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
     * @param details - Request details
     * @returns Block decision or null
     */
    shouldBlock(details: RequestDetails): BlockResult | null {
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
     * @param details - Page details
     * @returns Array of cosmetic filters
     */
    getCosmeticFilters(details: PageDetails): unknown[] {
        if (!this.initialized) {
            return [];
        }

        return cosmeticFilteringEngine.getMatches(details);
    }

    /**
     * Get scriptlet injections for a page
     * @param details - Page details
     * @returns Array of scriptlet injections
     */
    getScriptlets(details: PageDetails): unknown[] {
        if (!this.initialized) {
            return [];
        }

        return scriptletFilteringEngine.getMatches(details);
    }

    /**
     * Add a user filter rule
     * @param filter - Filter string
     */
    async addUserFilter(filter: string): Promise<void> {
        await filterStorage.addUserFilter(filter);
        this.onFilterChanged();
    }

    /**
     * Remove a user filter rule
     * @param filter - Filter string
     */
    async removeUserFilter(filter: string): Promise<void> {
        await filterStorage.removeUserFilter(filter);
        this.onFilterChanged();
    }

    /**
     * Get all user filters
     * @returns Array of user filter strings
     */
    getUserFilters(): string[] {
        return filterStorage.getUserFilters();
    }

    /**
     * Check if a URL is whitelisted
     * @param url - URL to check
     * @param documentURL - Document URL
     * @returns Whether whitelisted
     */
    isWhitelisted(url: string, documentURL: string): boolean {
        return staticExtFilteringEngine.matchString(url, documentURL);
    }

    /**
     * Get the current filter lists
     * @returns Filter list status
     */
    getFilterLists(): unknown {
        return filterStorage.getFilterLists();
    }

    /**
     * Enable/disable a filter list
     * @param listId - List ID
     * @param enabled - Enable or disable
     */
    async toggleFilterList(listId: string, enabled: boolean): Promise<void> {
        await filterStorage.toggleFilterList(listId, enabled);
        this.onFilterChanged();
    }

    /**
     * Get statistics
     * @returns Filtering statistics
     */
    getStats(): FilterStats {
        return {
            allowed: staticNetFilteringEngine.getAllowedCount(),
            blocked: staticNetFilteringEngine.getBlockedCount(),
            userFilters: filterStorage.getUserFilters().length,
        };
    }

    /**
     * Shutdown the core
     */
    shutdown(): void {
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
