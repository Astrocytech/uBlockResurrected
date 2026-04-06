/*******************************************************************************

    uBlock Origin - DNR Integration Module
    Copyright (C) 2024-present Raymond Hill

    This module handles switching between webRequest (MV2) and DNR (MV3)
    for network filtering. It integrates with uBlock's existing MV3 infrastructure.

******************************************************************************/

import {
    sessionFirewall,
    permanentFirewall,
    sessionURLFiltering,
    permanentURLFiltering,
    sessionSwitches,
    permanentSwitches,
} from '../js/filtering-engines.js';

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
            const userRules = this.compileUserRules();
            const whitelistRules = this.compileWhitelist();

            const allRules = [
                ...userRules,
                ...whitelistRules
            ];

            if ( allRules.length === 0 ) {
                console.log('[DNR] No rules to install');
                return;
            }

            const chunkSize = 30000;
            for ( let i = 0; i < allRules.length; i += chunkSize ) {
                const chunk = allRules.slice(i, i + chunkSize);
                await this.dnrApi.updateDynamicRules({
                    addRules: chunk
                });
            }

            console.log(`[DNR] Installed ${allRules.length} rules`);
        } catch (e) {
            console.error('[DNR] Failed to compile/install rules:', e);
        }
    }

    compileUserRules() {
        const rules = [];
        const compileFirewall = ( firewall, type ) => {
            if ( typeof firewall !== 'object' || firewall === null ) return;
            for ( const [domain, entries] of Object.entries(firewall) ) {
                if ( typeof entries !== 'object' ) continue;
                for ( const [subType, action] of Object.entries(entries) ) {
                    if ( action === 1 ) {
                        rules.push({
                            id: 0,
                            priority: 1,
                            action: { type: 'block' },
                            condition: {
                                urlFilter: '.*',
                                initiatorDomains: domain === '*' ? undefined : [ domain ],
                            }
                        });
                    }
                }
            }
        };

        try { compileFirewall(permanentFirewall, 'permanent'); } catch ( e ) { }
        try { compileFirewall(sessionFirewall, 'session'); } catch ( e ) { }

        return rules;
    }

    compileWhitelist() {
        const rules = [];
        const whitelist = vAPI.netWhitelist || [];
        
        for ( const pattern of whitelist ) {
            if ( typeof pattern !== 'string' || pattern.length === 0 ) continue;
            
            rules.push({
                id: 0,
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