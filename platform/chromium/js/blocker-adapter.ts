/*******************************************************************************

    Blocker Core Adapter - Bridges uBlock Resurrected and Blocker Core
    
    This adapter integrates Blocker Core (policy management, compilation,
    DNR adapter) into uBlock Resurrected while maintaining all existing functionality.
    
    Works with both MV2 (Firefox) and MV3 (Chrome).

******************************************************************************/

import * as Blocker from './blocker-core/index.js';

const blocker = {
    initialized: false,
    storage: null,
    policy: null,
    compiler: null,
    dnrAdapter: null,
    budget: null,
};

async function initBlocker() {
    if (blocker.initialized) return;
    
    console.log('[BlockerAdapter] Initializing Blocker Core...');
    
    try {
        // Get browser storage
        const stored = await browser.storage.local.get('blocker_storage');
        
        if (stored.blocker_storage) {
            // Load existing state
            const result = Blocker.deserializeStorageSchema(stored.blocker_storage);
            if (result && result.success && result.schema) {
                blocker.storage = result.schema;
                console.log('[BlockerAdapter] Loaded existing storage');
            } else {
                blocker.storage = Blocker.createDefaultStorageSchema();
                console.log('[BlockerAdapter] Created new storage (deserialization failed)');
            }
        } else {
            blocker.storage = Blocker.createDefaultStorageSchema();
            console.log('[BlockerAdapter] Created new storage');
        }
        
        blocker.policy = blocker.storage.policy;
        
        // Determine which DNR adapter to use
        const isFirefox = typeof browser !== 'undefined' && 
                         browser.runtime?.getBrowserInfo !== undefined;
        
        if (isFirefox) {
            blocker.dnrAdapter = Blocker.createFirefoxDNRAdapter();
            console.log('[BlockerAdapter] Using Firefox DNR adapter');
        } else {
            blocker.dnrAdapter = Blocker.createChromeDNRAdapter();
            console.log('[BlockerAdapter] Using Chrome DNR adapter');
        }
        
        // Initialize budget tracking
        blocker.budget = blocker.storage.budget || {
            dynamicRuleCount: 0,
            sessionRuleCount: 0,
            dynamicCeiling: 30000,
            sessionCeiling: 5000,
            perSiteRules: {},
            globalOverridePool: 3000,
        };
        
        blocker.initialized = true;
        console.log('[BlockerAdapter] Blocker Core initialized successfully');
        
    } catch (err) {
        console.error('[BlockerAdapter] Failed to initialize Blocker Core:', err);
        // Continue with limited functionality
        blocker.initialized = true;
    }
}

async function saveStorage() {
    if (!blocker.storage) return;
    
    blocker.storage.lastUpdated = Date.now();
    
    const serialized = Blocker.serializeStorageSchema(blocker.storage);
    
    try {
        await browser.storage.local.set({ blocker_storage: serialized });
    } catch (err) {
        console.error('[BlockerAdapter] Failed to save storage:', err);
    }
}

export async function createSitePolicy(site, profile = 'balanced') {
    await initBlocker();
    
    const sitePolicy = Blocker.normalizeSitePolicy({
        site,
        profile,
        rules: {},
        resourceDefaults: Blocker.PROFILE_DEFAULTS[profile],
    });
    
    blocker.policy = Blocker.mergeSitePolicy(blocker.policy, { sites: { [site]: sitePolicy } });
    blocker.storage.policy = blocker.policy;
    
    await saveStorage();
    
    return sitePolicy;
}

export async function updateSitePolicy(site, updates) {
    await initBlocker();
    
    const existing = blocker.policy.sites[site];
    if (!existing) {
        return createSitePolicy(site);
    }
    
    const merged = Blocker.mergeSitePolicy(existing, updates);
    blocker.policy = Blocker.mergeSitePolicy(blocker.policy, { 
        sites: { [site]: merged } 
    });
    blocker.storage.policy = blocker.policy;
    
    await saveStorage();
    
    return merged;
}

export async function compileSite(site, options = {}) {
    await initBlocker();
    
    const sitePolicy = blocker.policy.sites[site];
    if (!sitePolicy) {
        console.warn(`[BlockerAdapter] No policy found for site: ${site}`);
        return null;
    }
    
    const compilerOptions = {
        site,
        policy: sitePolicy,
        startDynamicId: blocker.storage.idAllocator.nextDynamicId || 1000000,
        startSessionId: blocker.storage.idAllocator.nextSessionId || 2000000,
        includeTemporary: true,
        includePermanent: true,
        excludeMainFrame: true,
    };
    
    const result = Blocker.compileSitePolicy(compilerOptions);
    
    // Update ID allocator
    blocker.storage.idAllocator.nextDynamicId = result.nextDynamicId;
    blocker.storage.idAllocator.nextSessionId = result.nextSessionId;
    blocker.storage.ruleMapping = { 
        ...blocker.storage.ruleMapping,
        ...Object.fromEntries(
            Object.entries(result.mapping).map(([k, v]) => [k, v])
        )
    };
    
    // Update budget
    blocker.storage.budget.dynamicRuleCount += result.dynamicRules.length;
    blocker.storage.budget.sessionRuleCount += result.sessionRules.length;
    
    await saveStorage();
    
    return result;
}

export async function installRules(site) {
    await initBlocker();
    
    const compiled = await compileSite(site);
    if (!compiled) return false;
    
    try {
        await blocker.dnrAdapter.installDynamicRules(
            compiled.dynamicRules,
            compiled.sessionRules
        );
        console.log(`[BlockerAdapter] Installed ${compiled.dynamicRules.length} dynamic and ${compiled.sessionRules.length} session rules for ${site}`);
        return true;
    } catch (err) {
        console.error('[BlockerAdapter] Failed to install rules:', err);
        return false;
    }
}

export async function clearRules(site) {
    await initBlocker();
    
    try {
        await blocker.dnrAdapter.clearDynamicRules(site);
        console.log(`[BlockerAdapter] Cleared rules for ${site}`);
        return true;
    } catch (err) {
        console.error('[BlockerAdapter] Failed to clear rules:', err);
        return false;
    }
}

export function getBudgetState() {
    return blocker.budget || { 
        dynamicRuleCount: 0, 
        sessionRuleCount: 0,
        dynamicCeiling: 30000,
        sessionCeiling: 5000,
    };
}

export function getPolicy() {
    return blocker.policy || { sites: {} };
}

export async function addCosmeticSelector(site, selector, isActive = false) {
    await initBlocker();
    
    const cosmeticSelector = {
        site,
        selector,
        status: isActive ? 'active' : 'saved',
        createdAt: Date.now(),
    };
    
    blocker.storage.cosmeticSelectors = Blocker.normalizeCosmeticSelectors([
        ...(blocker.storage.cosmeticSelectors || []),
        cosmeticSelector
    ]);
    
    await saveStorage();
    
    return cosmeticSelector;
}

export async function removeCosmeticSelector(site, selector) {
    await initBlocker();
    
    blocker.storage.cosmeticSelectors = (blocker.storage.cosmeticSelectors || [])
        .filter(s => !(s.site === site && s.selector === selector));
    
    await saveStorage();
}

export function getCosmeticSelectors(site) {
    return (blocker.storage.cosmeticSelectors || [])
        .filter(s => s.site === site);
}

export function getAllCosmeticSelectors() {
    return blocker.storage.cosmeticSelectors || [];
}

export async function snapshotState() {
    await initBlocker();
    
    return {
        policy: blocker.policy,
        storage: blocker.storage,
        budget: blocker.budget,
        timestamp: Date.now(),
    };
}

export async function restoreFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.storage) return false;
    
    blocker.storage = snapshot.storage;
    blocker.policy = snapshot.policy;
    blocker.budget = snapshot.budget;
    
    await saveStorage();
    
    console.log('[BlockerAdapter] Restored from snapshot');
    return true;
}

export function isInitialized() {
    return blocker.initialized;
}

export default {
    init: initBlocker,
    createSitePolicy,
    updateSitePolicy,
    compileSite,
    installRules,
    clearRules,
    getBudgetState,
    getPolicy,
    addCosmeticSelector,
    removeCosmeticSelector,
    getCosmeticSelectors,
    getAllCosmeticSelectors,
    snapshotState,
    restoreFromSnapshot,
    isInitialized,
};