/*******************************************************************************

    uBlock Origin - MV3 Page Store
    https://github.com/gorhill/uBlock

    This file contains MV3PageStore, FrameStore, and pageStores management.

******************************************************************************/

import type { FirewallCounts, FirewallCount } from './sw-types.js';

export class FrameStore {
    frameURL: string;
    parentId: number;
    clickToLoad: boolean;
    type: number;
    timestamp: number;
    
    constructor(frameURL: string, parentId: number) {
        this.frameURL = frameURL;
        this.parentId = parentId;
        this.clickToLoad = false;
        this.type = 0;
        this.timestamp = Date.now();
    }
    
    init(frameURL: string, parentId: number): void {
        this.frameURL = frameURL;
        this.parentId = parentId;
        this.clickToLoad = false;
        this.type = 0;
        this.timestamp = Date.now();
    }
    
    dispose(): void {
        this.frameURL = '';
        this.parentId = 0;
        this.clickToLoad = false;
    }
    
    updateURL(url: string): void {
        this.frameURL = url;
        this.timestamp = Date.now();
    }
    
    getCosmeticFilteringBits(tabId: number): number {
        return 0;
    }
    
    shouldApplySpecificCosmeticFilters(tabId: number): boolean {
        return true;
    }
    
    shouldApplyGenericCosmeticFilters(tabId: number): boolean {
        return true;
    }
}

export class MV3PageStore {
    tabId: number;
    rawURL: string;
    hostname: string;
    rootHostname: string;
    rootDomain: string;
    netFilteringSwitch: boolean;
    contentLastModified: number;
    largeMediaCount: number;
    remoteFontCount: number;
    popupBlockedCount: number;
    counts: { blocked: FirewallCounts; allowed: FirewallCounts };
    hostnameDetailsMap: Map<string, { domain: string; counts: FirewallCounts; cname?: string }>;
    frameStores: Map<number, FrameStore>;
    extraData: Map<string, any>;
    allowLargeMediaElementsUntil: number;
    
    constructor(tabId: number) {
        this.tabId = tabId;
        this.rawURL = '';
        this.hostname = '';
        this.rootHostname = '';
        this.rootDomain = '';
        this.netFilteringSwitch = true;
        this.contentLastModified = 0;
        this.largeMediaCount = 0;
        this.remoteFontCount = 0;
        this.popupBlockedCount = 0;
        this.counts = {
            blocked: { any: 0, frame: 0, script: 0 },
            allowed: { any: 0, frame: 0, script: 0 },
        };
        this.hostnameDetailsMap = new Map();
        this.frameStores = new Map();
        this.extraData = new Map();
        this.allowLargeMediaElementsUntil = 0;
    }
    
    async initialize(tab: chrome.tabs.Tab): Promise<void> {
        if (!tab?.url) return;
        
        try {
            const url = new URL(tab.url);
            this.rawURL = url.href;
            this.hostname = url.hostname;
            
            const parts = this.hostname.split('.');
            if (parts.length >= 2) {
                this.rootHostname = parts.slice(-2)[0];
                this.rootDomain = parts.slice(-2).join('.');
            } else {
                this.rootHostname = this.hostname;
                this.rootDomain = this.hostname;
            }
            
            const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
            const perSiteFiltering = storedFiltering?.perSiteFiltering || {};
            this.netFilteringSwitch = perSiteFiltering[this.hostname] !== false;
            
            const storedVersions = await chrome.storage.local.get('popupContentVersions');
            const versions = storedVersions?.popupContentVersions || {};
            this.contentLastModified = versions[tab.id] || 0;
            
            const storedMetrics = await chrome.storage.local.get('tabMetrics');
            const metrics = storedMetrics?.tabMetrics || {};
            const tabMetric = metrics[tab.id] || {};
            this.largeMediaCount = tabMetric.largeMediaCount || 0;
            this.remoteFontCount = tabMetric.remoteFontCount || 0;
            this.popupBlockedCount = tabMetric.popupBlockedCount || 0;
            this.counts.blocked = tabMetric.blocked || { any: 0, frame: 0, script: 0 };
            this.counts.allowed = tabMetric.allowed || { any: 0, frame: 0, script: 0 };
        } catch (e) {
            console.log('[MV3] MV3PageStore.initialize error:', e);
        }
    }
    
    getNetFilteringSwitch(): boolean {
        return this.netFilteringSwitch;
    }
    
    getAllHostnameDetails(): Map<string, any> {
        return this.hostnameDetailsMap;
    }
    
    disposeFrameStores(): void {
        this.frameStores.clear();
    }
}

export const pageStores = new Map<number, MV3PageStore>();
export let pageStoresToken = 0;

export const pageStoreFromTabId = async (tabId: number): Promise<MV3PageStore | null> => {
    let pageStore = pageStores.get(tabId);
    if (pageStore) {
        pageStoresToken += 1;
        return pageStore;
    }
    
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) return null;
        
        pageStore = new MV3PageStore(tabId);
        await pageStore.initialize(tab);
        pageStores.set(tabId, pageStore);
        pageStoresToken += 1;
        return pageStore;
    } catch {
        return null;
    }
};

export const mustLookup = async (tabId: number): Promise<MV3PageStore | null> => {
    return pageStoreFromTabId(tabId);
};