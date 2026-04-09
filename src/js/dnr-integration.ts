/*******************************************************************************

    uBlock Resurrected - DNR Integration Module
    Copyright (C) 2024-present Raymond Hill

    This module handles switching between webRequest (MV2) and DNR (MV3)
    for network filtering. It integrates with uBlock's existing MV3 infrastructure.

*******************************************************************************/

import {
    sessionFirewall,
    permanentFirewall,
    sessionURLFiltering,
    permanentURLFiltering,
    sessionSwitches,
    permanentSwitches,
} from '../js/filtering-engines.js';

import µb from '../js/background.js';
import { onBroadcast } from '../js/broadcast.js';
import { storage } from './mv3/storage.js';

/******************************************************************************/

const isMV3 = ( ) => {
    return typeof browser !== 'undefined' &&
           browser.runtime?.getManifest?.()?.manifest_version === 3;
};

const isGecko = vAPI.webextFlavor?.isGecko === true;

/******************************************************************************/

class DNRIntegration {
    constructor() {
        this.enabled = false;
        this.dnrApi = null;
        this.ruleIdCounter = 1;
    }

    async initialize() {
        if ( isGecko && !isMV3() ) {
            console.log('[DNR] Running in Firefox MV2 mode - using webRequest');
            return;
        }

        this.dnrApi = browser?.declarativeNetRequest;
        if ( !this.dnrApi ) {
            console.log('[DNR] DNR API not available');
            return;
        }

        console.log('[DNR] Initializing MV3 mode with DNR');
        this.enabled = true;

        onBroadcast(msg => {
            if ( msg.what === 'filteringBehaviorChanged' ) {
                this.updateRules();
            }
        });

        try {
            await this.compileAndInstallRules();
        } catch (e) {
            console.error('[DNR] Failed to initialize:', e);
        }
    }

    async compileAndInstallRules() {
        if ( !this.enabled ) return;

        console.log('[DNR] Compiling filter rules...');

        try {
            this.ruleIdCounter = 1;
            
            const firewallRules = this.compileUserRules();
            const whitelistRules = this.compileWhitelist();
            const userFilterRules = await this.compileUserFiltersFromStorage();

            const allRules = [
                ...firewallRules,
                ...whitelistRules,
                ...userFilterRules
            ];

            // Get existing rule IDs to remove them
            const existingRules = await this.dnrApi.getDynamicRules();
            const removeRuleIds = existingRules.map(r => r.id);

            if ( allRules.length === 0 && removeRuleIds.length === 0 ) {
                console.log('[DNR] No rules to update');
                return;
            }

            // Remove all existing dynamic rules first
            if ( removeRuleIds.length > 0 ) {
                await this.dnrApi.updateDynamicRules({
                    removeRuleIds: removeRuleIds
                });
            }

            // Add new rules in chunks
            const chunkSize = 100; // Smaller chunk size for reliability
            for ( let i = 0; i < allRules.length; i += chunkSize ) {
                const chunk = allRules.slice(i, i + chunkSize);
                await this.dnrApi.updateDynamicRules({
                    addRules: chunk
                });
            }

            console.log(`[DNR] Installed ${allRules.length} rules (firewall: ${firewallRules.length}, whitelist: ${whitelistRules.length}, userFilters: ${userFilterRules.length})`);
        } catch (e) {
            console.error('[DNR] Failed to compile/install rules:', e);
        }
    }

    compileUserRules() {
        const rules: any[] = [];
        
        // Compile firewall rules using the proper method
        const permRules = this.compileFirewallRules(permanentFirewall, 9000000);
        const sessRules = this.compileFirewallRules(sessionFirewall, 9001000);
        
        rules.push(...permRules, ...sessRules);
        
        console.log(`[DNR] Compiled ${rules.length} firewall rules`);
        return rules;
    }

    /**
     * Compile a DynamicHostRuleFiltering instance to DNR rules
     * Uses firewall.toArray() to get rules as strings
     */
    compileFirewallRules(firewall: any, baseId: number): any[] {
        const rules: any[] = [];
        
        if (typeof firewall?.toArray !== 'function') {
            return rules;
        }
        
        const ruleStrings = firewall.toArray();
        let ruleId = 0;
        
        for (const ruleStr of ruleStrings) {
            // Format: "src des type action" e.g., "example.com ads.example.com 3p-script block"
            const parts = ruleStr.split(' ');
            if (parts.length < 4) { continue; }
            
            const [src, des, type, action] = parts;
            
            // Skip noop - DNR doesn't support it, only used for logging
            if (action === 'noop') { continue; }
            
            // Get resource types for this firewall type
            const resourceTypes = this.getDNRResourceTypes(type);
            
            // Build URL filter from destination
            const urlFilter = this.buildURLFilter(des);
            
            // Determine action type
            const dnrAction = action === 'allow' ? 'allow' : 'block';
            
            // Create one DNR rule per resource type
            for (const rt of resourceTypes) {
                rules.push({
                    id: baseId + ruleId,
                    priority: 1000000 + ruleId,
                    action: { type: dnrAction },
                    condition: {
                        initiatorDomains: src !== '*' ? [src] : undefined,
                        urlFilter: urlFilter,
                        resourceTypes: [rt]
                    }
                });
                ruleId++;
            }
        }
        
        return rules;
    }

    /**
     * Map firewall types to DNR resource types
     * Note: Some firewall types require multiple DNR rules
     */
    getDNRResourceTypes(firewallType: string): string[] {
        const map: Record<string, string[]> = {
            '*': ['main_frame', 'sub_frame', 'script', 'image', 'other'],
            'image': ['image'],
            '3p-script': ['script'],
            '3p-frame': ['sub_frame'],
            '1p-script': ['script'],
            'inline-script': ['script'],
            '3p': ['script', 'image', 'sub_frame']
        };
        return map[firewallType] || ['script'];
    }

    /**
     * Convert firewall destination to URL filter
     */
    buildURLFilter(destination: string): string {
        if (destination === '*') {
            return '.*';
        }
        return destination.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }

    async compileUserFiltersFromStorage() {
        const rules = [];
        try {
            const userFiltersData = await storage.readUserFilters();
            const content = userFiltersData.content || '';
            const filterLines = content.split('\n');
            
            for ( const line of filterLines ) {
                const filter = line.trim();
                if ( !filter || filter.startsWith('!') || filter.startsWith('[') ) continue;
                
                const rule = this.parseFilterToDNRRule(filter);
                if ( rule ) {
                    rules.push(rule);
                }
            }
            
            console.log(`[DNR] Compiled ${rules.length} rules from user filters`);
        } catch ( e ) {
            console.error('[DNR] Failed to compile user filters:', e);
        }
        
        return rules;
    }

    parseFilterToDNRRule(filter) {
        const id = this.ruleIdCounter++;
        
        if ( filter.startsWith('@@') ) {
            return this.parseAllowRule(filter.slice(2), id);
        } else if ( filter.startsWith('||') ) {
            return this.parseBlockRule(filter.slice(2), id);
        } else if ( filter.startsWith('|') ) {
            return this.parseBlockRule(filter.slice(1), id);
        }
        
        return null;
    }

    parseBlockRule(pattern, id) {
        let urlFilter = pattern;
        let domains = null;
        
        const domainOptionMatch = urlFilter.match(/\$domain=([^,]+)/i);
        if ( domainOptionMatch ) {
            const domainStr = domainOptionMatch[1];
            domains = domainStr.split('|').map(d => d.trim());
            urlFilter = urlFilter.replace(/\$domain=[^,]+/i, '');
        }
        
        const thirdPartyMatch = urlFilter.match(/\$third-party/i);
        const firstPartyMatch = urlFilter.match(/\$first-party/i);
        
        urlFilter = urlFilter.replace(/\$[^,]+/g, '');
        
        if ( !urlFilter || urlFilter === '^' ) {
            urlFilter = '.*';
        } else {
            urlFilter = urlFilter
                .replace(/\^/g, '[/:?#&]')
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
        }
        
        if ( !urlFilter.startsWith('^') && !urlFilter.startsWith('.*') ) {
            urlFilter = '^' + urlFilter;
        }
        
        return {
            id,
            priority: 1,
            action: { type: 'block' },
            condition: {
                urlFilter,
                ...(domains && { initiatorDomains: domains }),
                ...(thirdPartyMatch && { resourceTypes: ['image', 'script', 'stylesheet', 'font', 'websocket', 'media', 'other'] }),
            }
        };
    }

    parseAllowRule(pattern, id) {
        let urlFilter = pattern;
        let domains = null;
        
        const domainOptionMatch = urlFilter.match(/\$domain=([^,]+)/i);
        if ( domainOptionMatch ) {
            const domainStr = domainOptionMatch[1];
            domains = domainStr.split('|').map(d => d.trim());
            urlFilter = urlFilter.replace(/\$domain=[^,]+/i, '');
        }
        
        urlFilter = urlFilter.replace(/\$[^,]+/g, '');
        
        if ( !urlFilter || urlFilter === '^' ) {
            urlFilter = '.*';
        } else {
            urlFilter = urlFilter
                .replace(/\^/g, '[/:?#&]')
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
        }
        
        return {
            id,
            priority: 2,
            action: { type: 'allow' },
            condition: {
                urlFilter,
                ...(domains && { initiatorDomains: domains }),
            }
        };
    }

    compileWhitelist() {
        const rules = [];
        const whitelist = µb.arrayFromWhitelist(µb.netWhitelist) || [];
        
        for ( const pattern of whitelist ) {
            if ( typeof pattern !== 'string' || pattern.length === 0 ) continue;
            if ( pattern.startsWith('#') ) continue; // Skip comments
            
            rules.push({
                id: this.ruleIdCounter++,
                priority: 3,
                action: { type: 'allow' },
                condition: {
                    urlFilter: this.patternToRegex(pattern),
                }
            });
        }

        return rules;
    }

    patternToRegex(pattern) {
        if ( !pattern || pattern === '*' ) return '.*';
        
        let regex = pattern;
        
        if ( regex.startsWith('||') ) {
            regex = '^https?://([^/]+\\.)?' + regex.slice(2);
        } else if ( regex.startsWith('|') ) {
            regex = '^' + regex.slice(1);
        } else if ( regex.endsWith('|') ) {
            regex = regex.slice(0, -1) + '$';
        }
        
        regex = regex.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        regex = regex.replace(/\\\*/g, '.*');
        
        return regex || '.*';
    }

    async updateRules() {
        if ( !this.enabled ) return;
        await this.compileAndInstallRules();
    }

    async clear() {
        if ( !this.enabled || !this.dnrApi ) return;
        
        try {
            const rules = await this.dnrApi.getDynamicRules();
            const ids = rules.map( r => r.id );
            
            if ( ids.length > 0 ) {
                await this.dnrApi.updateDynamicRules({ removeRuleIds: ids });
            }
            console.log('[DNR] Cleared all dynamic rules');
        } catch ( e ) {
            console.error('[DNR] Failed to clear rules:', e);
        }
    }

    getStats() {
        if ( !this.enabled ) return null;
        
        return {
            enabled: true,
            mode: isMV3() ? 'MV3' : 'MV2-webRequest',
            platform: isGecko ? 'Firefox' : 'Chrome/Chromium'
        };
    }
}

/******************************************************************************/

const dnrIntegration = new DNRIntegration();

export { dnrIntegration, DNRIntegration, isMV3, isGecko };
export default dnrIntegration;