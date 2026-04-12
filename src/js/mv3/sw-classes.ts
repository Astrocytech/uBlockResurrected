/*******************************************************************************

    uBlock Origin - MV3 Classes
    https://github.com/gorhill/uBlock

    This file contains DynamicFirewallRules, FrameStore, and MV3PageStore classes.

******************************************************************************/

import { firewallTypeBitOffsets } from './sw-types.js';

export type FirewallCount = {
    any: number;
    frame: number;
    script: number;
};

export type FirewallCounts = {
    allowed: FirewallCount;
    blocked: FirewallCount;
};

export type HostnameDetails = {
    domain: string;
    counts: FirewallCounts;
    hasSubdomains?: boolean;
    hasScript?: boolean;
    hasFrame?: boolean;
    totals?: FirewallCounts;
};

export class DynamicFirewallRules {
    private rules = new Map<string, number>();
    private r = 0;
    private type = '';
    private y = '';
    private z = '';

    reset() {
        this.rules.clear();
        this.clearRegisters();
    }

    clearRegisters() {
        this.r = 0;
        this.type = '';
        this.y = '';
        this.z = '';
    }

    assign(other: DynamicFirewallRules) {
        this.rules = new Map(other.rules);
        this.clearRegisters();
    }

    setCell(srcHostname: string, desHostname: string, type: string, state: number) {
        const bitOffset = firewallTypeBitOffsets[type];
        const key = `${srcHostname} ${desHostname}`;
        const oldBitmap = this.rules.get(key) || 0;
        const newBitmap = (oldBitmap & ~(3 << bitOffset)) | (state << bitOffset);
        if (newBitmap === 0) {
            this.rules.delete(key);
        } else {
            this.rules.set(key, newBitmap);
        }
    }

    unsetCell(srcHostname: string, desHostname: string, type: string) {
        this.evaluateCellZY(srcHostname, desHostname, type);
        if (this.r === 0) { return false; }
        this.setCell(srcHostname, desHostname, type, 0);
        return true;
    }

    evaluateCell(srcHostname: string, desHostname: string, type: string) {
        const bitmap = this.rules.get(`${srcHostname} ${desHostname}`);
        if (bitmap === undefined) { return 0; }
        return (bitmap >> firewallTypeBitOffsets[type]) & 3;
    }

    private evaluateCellZ(srcHostname: string, desHostname: string, type: string) {
        this.type = type;
        this.evaluateCellZY(srcHostname, desHostname, type);
    }

    private evaluateCellZY(srcHostname: string, desHostname: string, type: string) {
        this.z = '';
        if (srcHostname === '*' || desHostname === '*') {
            this.r = this.evaluateCell('*', '*', type);
            return;
        }
        if (srcHostname === desHostname) {
            const root = srcHostname.split('.').slice(-2).join('.');
            const domain = (this.evaluateCell(root, root, type) || this.evaluateCell('*', root, type) || this.evaluateCell('*', '*', type));
            if (domain !== 0) {
                this.r = domain;
                this.z = root;
                return;
            }
            this.r = this.evaluateCell('*', '*', type);
            this.z = srcHostname;
        } else {
            const srcRoot = srcHostname.split('.').slice(-2).join('.');
            const desRoot = desHostname.split('.').slice(-2).join('.');
            let domain: number;
            if (srcRoot !== desRoot) {
                domain = this.evaluateCell('*', desRoot, type) || this.evaluateCell('*', '*', type);
            } else {
                domain = this.evaluateCell(srcHostname, desHostname, type) ||
                    this.evaluateCell('*', desHostname, type) ||
                    this.evaluateCell(srcRoot, '*', type) ||
                    this.evaluateCell('*', '*', type);
            }
            if (domain !== 0) {
                this.r = domain;
                this.z = desHostname;
                return;
            }
            this.r = this.evaluateCell('*', '*', type);
            this.z = desHostname;
        }
    }

    lookupRuleData(srcHostname: string, desHostname: string, type: string) {
        const bitmap = this.rules.get(`${srcHostname} ${desHostname}`);
        if (bitmap === undefined) { return undefined; }
        const value = (bitmap >> firewallTypeBitOffsets[type]) & 3;
        if (value === 0) { return undefined; }
        const actionNames: Record<number, string> = { 1: 'block', 2: 'allow', 3: 'noop' };
        return actionNames[value];
    }

    toArray(): string[] {
        const out: string[] = [];
        for (const [key, bitmap] of this.rules) {
            const [src, dest] = key.split(' ');
            for (const type of Object.keys(firewallTypeBitOffsets)) {
                const value = (bitmap >> firewallTypeBitOffsets[type]) & 3;
                if (value === 0) { continue; }
                const actionNames: Record<number, string> = { 1: 'block', 2: 'allow', 3: 'noop' };
                out.push(`${src} ${dest} ${type} ${actionNames[value]}`);
            }
        }
        return out;
    }

    fromString(text: string) {
        this.reset();
        const lines = text.split('\n').filter(l => l.trim() !== '' && !l.trim().startsWith('#'));
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) { continue; }
            const [src, dest, type, action] = parts;
            const actionValues: Record<string, number> = { block: 1, allow: 2, noop: 3 };
            const value = actionValues[action];
            if (value) {
                this.setCell(src, dest, type, value);
            }
        }
    }

    toString() {
        return this.toArray().join('\n');
    }
}

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
    counts: FirewallCounts;
    hostnameDetailsMap: Map<string, any>;
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
            allowed: { any: 0, frame: 0, script: 0 },
            blocked: { any: 0, frame: 0, script: 0 },
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

            const storedDetails = await chrome.storage.local.get('hostnameDetailsMap');
            const detailsMap = storedDetails?.hostnameDetailsMap || {};
            const tabDetails = detailsMap[tab.id] || {};
            for (const [hostname, detail] of Object.entries(tabDetails)) {
                this.hostnameDetailsMap.set(hostname, detail);
            }

            const storedExtraData = await chrome.storage.local.get('pageStoreExtraData');
            const extraDataMap = storedExtraData?.pageStoreExtraData || {};
            const tabExtraData = extraDataMap[tab.id] || {};
            for (const [key, value] of Object.entries(tabExtraData)) {
                this.extraData.set(key, value);
            }

            const storedLargeMedia = await chrome.storage.local.get('allowLargeMediaElements');
            const largeMediaMap = storedLargeMedia?.allowLargeMediaElements || {};
            this.allowLargeMediaElementsUntil = largeMediaMap[tab.id] || 0;
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

    async clickToLoad(frameId: number, frameURL: string): Promise<void> {
        const frameStore = this.frameStores.get(frameId);
        if (frameStore) {
            frameStore.clickToLoad = true;
        }
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