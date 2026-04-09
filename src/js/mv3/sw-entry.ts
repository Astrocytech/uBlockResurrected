/*******************************************************************************

    uBlock Origin - MV3 Service Worker Entry Point
    https://github.com/gorhill/uBlock

    This is the main entry point for the MV3 service worker. It coordinates
    all background tasks including messaging, element picker/zapper, and
    DNR rule management.

*******************************************************************************/

type LegacyMessage = {
    channel?: string;
    msgId?: number;
    msg?: any;
};

type PopupRequest = {
    what: string;
    tabId?: number | null;
    name?: string;
    value?: any;
    srcHostname?: string;
    desHostname?: string;
    desHostnames?: Record<string, unknown>;
    requestType?: string;
    action?: number;
    persist?: boolean;
};

type FirewallCounts = {
    allowed: { any: number; frame: number; script: number };
    blocked: { any: number; frame: number; script: number };
};

type HostnameDetails = {
    domain: string;
    counts: FirewallCounts;
    hasSubdomains?: boolean;
    hasScript?: boolean;
    hasFrame?: boolean;
    totals?: FirewallCounts;
};

type TabRequestState = {
    pageHostname: string;
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

type CollectedHostnameData = {
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

const userSettingsDefault = {
    advancedUserEnabled: false,
    colorBlindFriendly: false,
    firewallPaneMinimized: true,
    popupPanelSections: 0b111,
    tooltipsDisabled: false,
};

const firewallRuleTypes = [
    '*',
    'image',
    '3p',
    'inline-script',
    '1p-script',
    '3p-script',
    '3p-frame',
];

const firewallTypeBitOffsets: Record<string, number> = {
    '*': 0,
    'inline-script': 2,
    '1p-script': 4,
    '3p-script': 6,
    '3p-frame': 8,
    image: 10,
    '3p': 12,
};

const firewallActionNames: Record<number, string> = {
    1: 'block',
    2: 'allow',
    3: 'noop',
};

const firewallActionValues: Record<string, number> = {
    block: 1,
    allow: 2,
    noop: 3,
};

const FIREWALL_RULE_ID_MIN = 9_000_000;
const FIREWALL_RULE_ID_MAX = 9_099_999;

const createCounts = (): FirewallCounts => ({
    allowed: { any: 0, frame: 0, script: 0 },
    blocked: { any: 0, frame: 0, script: 0 },
});

const isIPAddress = (hostname: string): boolean => {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
};

const domainFromHostname = (hostname: string): string => {
    if ( hostname === '' || hostname === '*' ) { return hostname; }
    if ( hostname === 'localhost' || isIPAddress(hostname) ) { return hostname; }
    const parts = hostname.split('.').filter(Boolean);
    if ( parts.length <= 2 ) { return hostname; }
    return parts.slice(-2).join('.');
};

const decomposeHostname = (hostname: string): string[] => {
    if ( hostname === '' || hostname === '*' ) {
        return [ '*' ];
    }
    const parts = hostname.split('.');
    const out: string[] = [];
    for ( let i = 0; i < parts.length; i++ ) {
        out.push(parts.slice(i).join('.'));
    }
    out.push('*');
    return out;
};

const isThirdParty = (srcHostname: string, desHostname: string): boolean => {
    if ( desHostname === '*' || srcHostname === '*' || srcHostname === '' ) {
        return false;
    }
    const srcDomain = domainFromHostname(srcHostname) || srcHostname;
    if ( desHostname.endsWith(srcDomain) === false ) {
        return true;
    }
    return desHostname.length !== srcDomain.length &&
        desHostname.charAt(desHostname.length - srcDomain.length - 1) !== '.';
};

class DynamicFirewallRules {
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
        if ( newBitmap === 0 ) {
            this.rules.delete(key);
        } else {
            this.rules.set(key, newBitmap);
        }
    }

    unsetCell(srcHostname: string, desHostname: string, type: string) {
        this.evaluateCellZY(srcHostname, desHostname, type);
        if ( this.r === 0 ) { return false; }
        this.setCell(srcHostname, desHostname, type, 0);
        return true;
    }

    evaluateCell(srcHostname: string, desHostname: string, type: string) {
        const bitmap = this.rules.get(`${srcHostname} ${desHostname}`);
        if ( bitmap === undefined ) { return 0; }
        return (bitmap >> firewallTypeBitOffsets[type]) & 3;
    }

    private evaluateCellZ(srcHostname: string, desHostname: string, type: string) {
        const bitOffset = firewallTypeBitOffsets[type];
        for ( const sourceHostname of decomposeHostname(srcHostname) ) {
            this.z = sourceHostname;
            const bitmap = this.rules.get(`${sourceHostname} ${desHostname}`);
            if ( bitmap === undefined ) { continue; }
            const value = (bitmap >>> bitOffset) & 3;
            if ( value === 0 ) { continue; }
            this.type = type;
            this.r = value;
            return value;
        }
        return 0;
    }

    evaluateCellZY(srcHostname: string, desHostname: string, type: string) {
        if ( desHostname === '' ) {
            this.clearRegisters();
            return 0;
        }

        for ( const destinationHostname of decomposeHostname(desHostname) ) {
            if ( destinationHostname === '*' ) { break; }
            this.y = destinationHostname;
            if ( this.evaluateCellZ(srcHostname, destinationHostname, '*') !== 0 ) {
                return this.r;
            }
        }

        const thirdParty = isThirdParty(srcHostname, desHostname);
        this.y = '*';

        if ( thirdParty ) {
            if ( type === 'script' ) {
                if ( this.evaluateCellZ(srcHostname, '*', '3p-script') !== 0 ) {
                    return this.r;
                }
            } else if ( type === 'sub_frame' || type === 'object' ) {
                if ( this.evaluateCellZ(srcHostname, '*', '3p-frame') !== 0 ) {
                    return this.r;
                }
            }
            if ( this.evaluateCellZ(srcHostname, '*', '3p') !== 0 ) {
                return this.r;
            }
        } else if ( type === 'script' ) {
            if ( this.evaluateCellZ(srcHostname, '*', '1p-script') !== 0 ) {
                return this.r;
            }
        }

        if ( firewallTypeBitOffsets[type] !== undefined ) {
            if ( this.evaluateCellZ(srcHostname, '*', type) !== 0 ) {
                return this.r;
            }
            if ( type.startsWith('3p-') ) {
                if ( this.evaluateCellZ(srcHostname, '*', '3p') !== 0 ) {
                    return this.r;
                }
            }
        }

        if ( this.evaluateCellZ(srcHostname, '*', '*') !== 0 ) {
            return this.r;
        }

        this.type = '';
        this.r = 0;
        return 0;
    }

    lookupRuleData(srcHostname: string, desHostname: string, type: string) {
        const result = this.evaluateCellZY(srcHostname, desHostname, type);
        if ( result === 0 ) { return undefined; }
        return `${this.z} ${this.y} ${this.type} ${result}`;
    }

    copyRules(from: DynamicFirewallRules, srcHostname: string, desHostnames: Record<string, unknown>) {
        let changed = false;
        const syncKey = (key: string) => {
            const current = this.rules.get(key);
            const next = from.rules.get(key);
            if ( current === next ) { return; }
            changed = true;
            if ( next === undefined ) {
                this.rules.delete(key);
            } else {
                this.rules.set(key, next);
            }
        };

        syncKey('* *');
        syncKey(`${srcHostname} *`);

        for ( const desHostname in desHostnames ) {
            syncKey(`* ${desHostname}`);
            syncKey(`${srcHostname} ${desHostname}`);
        }

        return changed;
    }

    hasSameRules(other: DynamicFirewallRules, srcHostname: string, desHostnames: Record<string, unknown>) {
        const sameKey = (key: string) => this.rules.get(key) === other.rules.get(key);
        if ( sameKey('* *') === false ) { return false; }
        if ( sameKey(`${srcHostname} *`) === false ) { return false; }
        for ( const desHostname in desHostnames ) {
            if ( sameKey(`* ${desHostname}`) === false ) { return false; }
            if ( sameKey(`${srcHostname} ${desHostname}`) === false ) { return false; }
        }
        return true;
    }

    toArray() {
        const out: string[] = [];
        for ( const [ key ] of this.rules ) {
            const spaceIndex = key.indexOf(' ');
            const srcHostname = key.slice(0, spaceIndex);
            const desHostname = key.slice(spaceIndex + 1);
            for ( const type of Object.keys(firewallTypeBitOffsets) ) {
                const value = this.evaluateCell(srcHostname, desHostname, type);
                if ( value === 0 ) { continue; }
                out.push(`${srcHostname} ${desHostname} ${type} ${firewallActionNames[value]}`);
            }
        }
        return out;
    }

    toString() {
        return this.toArray().join('\n');
    }

    fromString(text: string) {
        this.reset();
        for ( const line of text.split('\n') ) {
            const trimmed = line.trim();
            if ( trimmed === '' ) { continue; }
            const parts = trimmed.split(/\s+/);
            if ( parts.length < 4 ) { continue; }
            const [ srcHostname, desHostname, type, actionName ] = parts;
            const action = firewallActionValues[actionName];
            if ( action === undefined || firewallTypeBitOffsets[type] === undefined ) { continue; }
            this.setCell(srcHostname, desHostname, type, action);
        }
    }

    addFromRuleParts(parts: [string, string, string, string]) {
        if ( parts.length < 4 ) { return false; }
        const [ srcHostname, desHostname, type, actionName ] = parts;
        const action = firewallActionValues[actionName];
        if ( action === undefined || firewallTypeBitOffsets[type] === undefined ) {
            return false;
        }
        this.setCell(srcHostname, desHostname, type, action);
        return true;
    }

    removeFromRuleParts(parts: [string, string, string, string]) {
        if ( parts.length < 4 ) { return false; }
        const [ srcHostname, desHostname, type ] = parts;
        if ( firewallTypeBitOffsets[type] === undefined ) {
            return false;
        }
        return this.unsetCell(srcHostname, desHostname, type);
    }
}

const popupState = {
    initialized: false,
    initPromise: Promise.resolve(),
    userSettings: { ...userSettingsDefault },
    permanentFirewall: new DynamicFirewallRules(),
    sessionFirewall: new DynamicFirewallRules(),
};

const tabRequestStates = new Map<number, TabRequestState>();
const requestStateStorage = chrome.storage.session || chrome.storage.local;
const tabRequestStateKey = (tabId: number) => `firewallTabState:${tabId}`;

const getActiveTab = async () => {
    const [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
};

const getTabForRequest = async (tabId?: number | null) => {
    if ( typeof tabId === 'number' ) {
        return chrome.tabs.get(tabId);
    }
    return getActiveTab();
};

const mergeCounts = (into: FirewallCounts, from: FirewallCounts) => {
    into.allowed.any += from.allowed.any;
    into.allowed.frame += from.allowed.frame;
    into.allowed.script += from.allowed.script;
    into.blocked.any += from.blocked.any;
    into.blocked.frame += from.blocked.frame;
    into.blocked.script += from.blocked.script;
};

const delay = (ms: number) => new Promise(resolve => {
    self.setTimeout(resolve, ms);
});

const loadPopupState = async () => {
    const items = await chrome.storage.local.get([ 'userSettings', 'dynamicFilteringString' ]);
    Object.assign(
        popupState.userSettings,
        userSettingsDefault,
        items.userSettings || {},
    );
    popupState.permanentFirewall.fromString(items.dynamicFilteringString || '');
    popupState.sessionFirewall.assign(popupState.permanentFirewall);
    popupState.initialized = true;
};

const ensurePopupState = async () => {
    if ( popupState.initialized ) { return; }
    popupState.initPromise = popupState.initPromise.then(async () => {
        if ( popupState.initialized ) { return; }
        await loadPopupState();
    });
    await popupState.initPromise;
};

const persistUserSettings = async () => {
    await chrome.storage.local.set({ userSettings: popupState.userSettings });
};

const persistPermanentFirewall = async () => {
    await chrome.storage.local.set({
        dynamicFilteringString: popupState.permanentFirewall.toString(),
    });
};

const firewallRuleResourceTypes = (type: string) => {
    switch ( type ) {
    case 'image':
        return [ 'image' ];
    case '3p-script':
    case '1p-script':
    case 'inline-script':
        return [ 'script' ];
    case '3p-frame':
        return [ 'sub_frame' ];
    case '3p':
        return [ 'image', 'script', 'sub_frame' ];
    case '*':
        return [ 'image', 'script', 'sub_frame', 'xmlhttprequest', 'media', 'font', 'object', 'other' ];
    default:
        return [];
    }
};

const compileFirewallRulesToDnr = (firewall: DynamicFirewallRules) => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    let nextRuleId = FIREWALL_RULE_ID_MIN;

    for ( const rule of firewall.toArray() ) {
        const [ srcHostname, desHostname, type, actionName ] = rule.split(' ');
        const resourceTypes = firewallRuleResourceTypes(type);
        for ( const resourceType of resourceTypes ) {
            if ( nextRuleId > FIREWALL_RULE_ID_MAX ) { break; }
            const condition: chrome.declarativeNetRequest.RuleCondition = {
                resourceTypes: [ resourceType as chrome.declarativeNetRequest.ResourceType ],
            };
            if ( srcHostname !== '*' ) {
                condition.initiatorDomains = [ srcHostname ];
            }
            if ( desHostname !== '*' ) {
                condition.requestDomains = [ desHostname ];
            }
            if ( type === '3p' || type === '3p-script' || type === '3p-frame' ) {
                condition.domainType = 'thirdParty';
            } else if ( type === '1p-script' ) {
                condition.domainType = 'firstParty';
            }

            addRules.push({
                id: nextRuleId++,
                priority: 2_000_000 +
                    ((actionName === 'allow' || actionName === 'noop') ? 10_000 : 0) +
                    (srcHostname !== '*' ? 1_000 : 0),
                action: {
                    // MV3 DNR has no direct noop equivalent; treat it as a
                    // higher-priority allow so it cancels broader firewall blocks.
                    type: (actionName === 'allow' || actionName === 'noop') ? 'allow' : 'block',
                },
                condition,
            });
        }
    }

    return addRules;
};

const syncFirewallDnrRules = async () => {
    if ( chrome.declarativeNetRequest === undefined ) { return; }
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= FIREWALL_RULE_ID_MIN && id <= FIREWALL_RULE_ID_MAX);
    const addRules = compileFirewallRulesToDnr(popupState.sessionFirewall);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
};

const zeroHostnameDetails = (hostname: string): HostnameDetails => ({
    domain: domainFromHostname(hostname),
    counts: createCounts(),
});

const cloneHostnameDetails = (details: HostnameDetails): HostnameDetails => ({
    domain: details.domain,
    counts: {
        allowed: { ...details.counts.allowed },
        blocked: { ...details.counts.blocked },
    },
});

const ensureTabRequestState = (tabId: number, pageHostname = ''): TabRequestState => {
    let state = tabRequestStates.get(tabId);
    if ( state !== undefined ) { return state; }
    state = {
        pageHostname,
        pageCounts: createCounts(),
        hostnameDict: {},
    };
    if ( pageHostname !== '' ) {
        state.hostnameDict[pageHostname] = zeroHostnameDetails(pageHostname);
    }
    tabRequestStates.set(tabId, state);
    return state;
};

const persistTabRequestState = async (tabId: number) => {
    const state = tabRequestStates.get(tabId);
    if ( state === undefined ) { return; }
    await requestStateStorage.set({
        [tabRequestStateKey(tabId)]: state,
    });
};

const loadTabRequestState = async (tabId: number) => {
    const inMemory = tabRequestStates.get(tabId);
    if ( inMemory !== undefined ) { return inMemory; }
    const items = await requestStateStorage.get(tabRequestStateKey(tabId));
    const state = items[tabRequestStateKey(tabId)] as TabRequestState | undefined;
    if ( state !== undefined ) {
        tabRequestStates.set(tabId, state);
    }
    return state;
};

const loadTabRequestStateWithRetry = async (tabId: number, attempts = 3) => {
    for ( let i = 0; i < attempts; i++ ) {
        const state = await loadTabRequestState(tabId);
        if ( state !== undefined && Object.keys(state.hostnameDict).length > 1 ) {
            return state;
        }
        if ( i + 1 < attempts ) {
            await delay(100);
        }
    }
    return loadTabRequestState(tabId);
};

const clearTabRequestState = async (tabId: number) => {
    tabRequestStates.delete(tabId);
    await requestStateStorage.remove(tabRequestStateKey(tabId));
};

const incrementCounts = (
    counts: FirewallCounts,
    resourceType: chrome.webRequest.ResourceType,
) => {
    counts.allowed.any += 1;
    if ( resourceType === 'script' ) {
        counts.allowed.script += 1;
    } else if ( resourceType === 'sub_frame' ) {
        counts.allowed.frame += 1;
    }
};

const recordTabRequest = (details: chrome.webRequest.WebRequestBodyDetails) => {
    if ( details.tabId < 0 ) { return; }
    let hostname = '';
    try {
        hostname = new URL(details.url).hostname;
    } catch {
        return;
    }

    if ( details.type === 'main_frame' ) {
        const state: TabRequestState = {
            pageHostname: hostname,
            pageCounts: createCounts(),
            hostnameDict: {},
        };
        state.hostnameDict[hostname] = zeroHostnameDetails(hostname);
        tabRequestStates.set(details.tabId, state);
        void persistTabRequestState(details.tabId);
        return;
    }

    const state = ensureTabRequestState(details.tabId);
    if ( state.hostnameDict[hostname] === undefined ) {
        state.hostnameDict[hostname] = zeroHostnameDetails(hostname);
    }
    incrementCounts(state.pageCounts, details.type);
    incrementCounts(state.hostnameDict[hostname].counts, details.type);
    void persistTabRequestState(details.tabId);
};

const collectTabHostnameData = async (
    tabId: number,
    pageHostname: string,
): Promise<CollectedHostnameData | undefined> => {
    if ( chrome.scripting?.executeScript === undefined ) { return; }
    try {
        const [ result ] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (currentPageHostname: string) => {
                const createCounts = () => ({
                    allowed: { any: 0, frame: 0, script: 0 },
                    blocked: { any: 0, frame: 0, script: 0 },
                });
                const isIPAddress = hostname =>
                    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
                const domainFromHostname = hostname => {
                    if ( hostname === '' || hostname === '*' ) { return hostname; }
                    if ( hostname === 'localhost' || isIPAddress(hostname) ) { return hostname; }
                    const parts = hostname.split('.').filter(Boolean);
                    if ( parts.length <= 2 ) { return hostname; }
                    return parts.slice(-2).join('.');
                };
                const hostnameDict = Object.create(null);
                const ensureHostname = hostname => {
                    if ( hostnameDict[hostname] !== undefined ) { return hostnameDict[hostname]; }
                    hostnameDict[hostname] = {
                        domain: domainFromHostname(hostname),
                        counts: createCounts(),
                    };
                    return hostnameDict[hostname];
                };
                ensureHostname(currentPageHostname);
                const pageCounts = createCounts();
                const addResource = (hostname, kind) => {
                    if ( hostname === '' || hostname === currentPageHostname ) { return; }
                    const entry = ensureHostname(hostname);
                    entry.counts.allowed.any += 1;
                    pageCounts.allowed.any += 1;
                    if ( kind === 'script' ) {
                        entry.counts.allowed.script += 1;
                        pageCounts.allowed.script += 1;
                    } else if ( kind === 'frame' ) {
                        entry.counts.allowed.frame += 1;
                        pageCounts.allowed.frame += 1;
                    }
                };

                const scanElements = (selector, attribute, kind) => {
                    for ( const element of document.querySelectorAll(selector) ) {
                        const raw = element.getAttribute(attribute);
                        if ( !raw ) { continue; }
                        try {
                            const url = new URL(raw, location.href);
                            addResource(url.hostname, kind);
                        } catch {
                        }
                    }
                };

                // DOM-scanning is more deterministic than relying only on
                // performance entries, especially in MV3 when the popup opens
                // after the page has already settled.
                scanElements('img[src]', 'src', 'other');
                scanElements('script[src]', 'src', 'script');
                scanElements('iframe[src]', 'src', 'frame');

                for ( const resource of performance.getEntriesByType('resource') ) {
                    try {
                        const url = new URL(resource.name, location.href);
                        let kind = 'other';
                        if ( resource.initiatorType === 'script' ) {
                            kind = 'script';
                        } else if ( resource.initiatorType === 'iframe' ) {
                            kind = 'frame';
                        }
                        addResource(url.hostname, kind);
                    } catch {
                    }
                }

                return { pageCounts, hostnameDict };
            },
            args: [ pageHostname ],
        });
        return result?.result as CollectedHostnameData | undefined;
    } catch {
    }
};

const getFirewallRulesForPopup = (srcHostname: string, hostnameDict: Record<string, HostnameDetails>) => {
    const firewallRules: Record<string, string> = {};

    for ( const type of firewallRuleTypes ) {
        const globalRule = popupState.sessionFirewall.lookupRuleData('*', '*', type);
        if ( globalRule !== undefined ) {
            firewallRules[`/ * ${type}`] = globalRule;
        }
        const localRule = popupState.sessionFirewall.lookupRuleData(srcHostname, '*', type);
        if ( localRule !== undefined ) {
            firewallRules[`. * ${type}`] = localRule;
        }
    }

    for ( const desHostname of Object.keys(hostnameDict) ) {
        const globalRule = popupState.sessionFirewall.lookupRuleData('*', desHostname, '*');
        if ( globalRule !== undefined ) {
            firewallRules[`/ ${desHostname} *`] = globalRule;
        }
        const localRule = popupState.sessionFirewall.lookupRuleData(srcHostname, desHostname, '*');
        if ( localRule !== undefined ) {
            firewallRules[`. ${desHostname} *`] = localRule;
        }
    }

    return firewallRules;
};

const getPopupData = async (request: PopupRequest) => {
    await ensurePopupState();
    const tab = await getTabForRequest(request.tabId);
    const tabId = tab?.id ?? 0;
    const pageURL = tab?.url || '';
    const pageTitle = tab?.title || '';
    const pageHostname = (() => {
        try {
            return pageURL ? new URL(pageURL).hostname : '';
        } catch {
            return '';
        }
    })();
    const pageDomain = domainFromHostname(pageHostname);
    const trackedState = typeof tabId === 'number'
        ? await loadTabRequestStateWithRetry(tabId)
        : undefined;
    const liveState = typeof tabId === 'number' && pageHostname !== ''
        ? await collectTabHostnameData(tabId, pageHostname)
        : undefined;
    const hostnameDict: Record<string, HostnameDetails> = {};
    if ( pageHostname !== '' ) {
        hostnameDict[pageHostname] = zeroHostnameDetails(pageHostname);
    }
    if ( trackedState?.hostnameDict ) {
        for ( const [ hostname, details ] of Object.entries(trackedState.hostnameDict) ) {
            hostnameDict[hostname] = cloneHostnameDetails(details);
        }
    }
    if ( liveState?.hostnameDict ) {
        for ( const [ hostname, details ] of Object.entries(liveState.hostnameDict) ) {
            if ( hostnameDict[hostname] === undefined ) {
                hostnameDict[hostname] = cloneHostnameDetails(details);
                continue;
            }
            mergeCounts(hostnameDict[hostname].counts, details.counts);
        }
    }
    const pageCounts = createCounts();
    if ( trackedState?.pageCounts ) {
        mergeCounts(pageCounts, trackedState.pageCounts);
    }
    if ( liveState?.pageCounts ) {
        mergeCounts(pageCounts, liveState.pageCounts);
    }

    return {
        advancedUserEnabled: popupState.userSettings.advancedUserEnabled,
        appName: chrome.runtime.getManifest().name,
        appVersion: chrome.runtime.getManifest().version,
        colorBlindFriendly: popupState.userSettings.colorBlindFriendly,
        cosmeticFilteringSwitch: false,
        firewallPaneMinimized: popupState.userSettings.firewallPaneMinimized,
        firewallRules: getFirewallRulesForPopup(pageHostname, hostnameDict),
        godMode: true,
        globalAllowedRequestCount: 0,
        globalBlockedRequestCount: 0,
        hasUnprocessedRequest: false,
        hostnameDict,
        pageCounts,
        pageDomain,
        pageHostname,
        pageURL,
        popupBlockedCount: 0,
        popupPanelDisabledSections: 0,
        popupPanelHeightMode: 0,
        popupPanelLockedSections: 0,
        popupPanelOrientation: '',
        popupPanelSections: popupState.userSettings.popupPanelSections,
        rawURL: pageURL,
        tabId,
        tabTitle: pageTitle,
        tooltipsDisabled: popupState.userSettings.tooltipsDisabled,
        userFiltersAreEnabled: true,
        netFilteringSwitch: true,
        canElementPicker: /^https?:/.test(pageURL),
        noPopups: false,
        noCosmeticFiltering: false,
        noLargeMedia: false,
        largeMediaCount: 0,
        noRemoteFonts: false,
        remoteFontCount: 0,
        noScripting: false,
        matrixIsDirty: popupState.sessionFirewall.hasSameRules(
            popupState.permanentFirewall,
            pageHostname,
            hostnameDict,
        ) === false,
    };
};

const toggleFirewallRule = async (request: PopupRequest) => {
    await ensurePopupState();
    const srcHostname = request.srcHostname || '*';
    const desHostname = request.desHostname || '*';
    const requestType = request.requestType || '*';
    const action = Number(request.action) || 0;

    if ( action !== 0 ) {
        popupState.sessionFirewall.setCell(srcHostname, desHostname, requestType, action);
    } else {
        popupState.sessionFirewall.unsetCell(srcHostname, desHostname, requestType);
    }

    if ( request.persist ) {
        if ( action !== 0 ) {
            popupState.permanentFirewall.setCell(srcHostname, desHostname, requestType, action);
        } else {
            popupState.permanentFirewall.unsetCell(srcHostname, desHostname, requestType);
        }
        await persistPermanentFirewall();
    }

    await syncFirewallDnrRules();

    return getPopupData(request);
};

const saveFirewallRules = async (request: PopupRequest) => {
    await ensurePopupState();
    popupState.permanentFirewall.copyRules(
        popupState.sessionFirewall,
        request.srcHostname || '',
        request.desHostnames || {},
    );
    await persistPermanentFirewall();
    await syncFirewallDnrRules();
    return getPopupData(request);
};

const revertFirewallRules = async (request: PopupRequest) => {
    await ensurePopupState();
    popupState.sessionFirewall.copyRules(
        popupState.permanentFirewall,
        request.srcHostname || '',
        request.desHostnames || {},
    );
    await syncFirewallDnrRules();
    return getPopupData(request);
};

const getDashboardRules = async () => {
    await ensurePopupState();
    return {
        permanentRules: popupState.permanentFirewall.toArray(),
        sessionRules: popupState.sessionFirewall.toArray(),
    };
};

const applyRuleTextDelta = (
    ruleset: DynamicFirewallRules,
    text: string,
    method: 'addFromRuleParts' | 'removeFromRuleParts',
) => {
    for ( const rawRule of text.split(/\s*[\n\r]+\s*/) ) {
        const rule = rawRule.trim();
        if ( rule === '' ) { continue; }
        const parts = rule.split(/\s+/);
        if ( method === 'addFromRuleParts' ) {
            ruleset.addFromRuleParts(parts as [string, string, string, string]);
        } else {
            ruleset.removeFromRuleParts(parts as [string, string, string, string]);
        }
    }
};

const modifyDashboardRuleset = async (payload: {
    permanent?: boolean;
    toAdd?: string;
    toRemove?: string;
}) => {
    await ensurePopupState();
    const ruleset = payload.permanent ? popupState.permanentFirewall : popupState.sessionFirewall;
    applyRuleTextDelta(ruleset, payload.toRemove || '', 'removeFromRuleParts');
    applyRuleTextDelta(ruleset, payload.toAdd || '', 'addFromRuleParts');

    if ( payload.permanent ) {
        await persistPermanentFirewall();
    }

    await syncFirewallDnrRules();

    return {
        permanentRules: popupState.permanentFirewall.toArray(),
        sessionRules: popupState.sessionFirewall.toArray(),
    };
};

const resetDashboardRules = async () => {
    await ensurePopupState();
    popupState.sessionFirewall.assign(popupState.permanentFirewall);
    await syncFirewallDnrRules();
    return {
        permanentRules: popupState.permanentFirewall.toArray(),
        sessionRules: popupState.sessionFirewall.toArray(),
    };
};

const setUserSetting = async (request: PopupRequest) => {
    await ensurePopupState();
    if ( typeof request.name === 'string' ) {
        (popupState.userSettings as Record<string, any>)[request.name] = request.value;
        await persistUserSettings();
    }
    return { ...popupState.userSettings };
};

const handlePopupPanelMessage = async (request: PopupRequest) => {
    switch ( request.what ) {
    case 'getPopupData':
        return getPopupData(request);
    case 'toggleFirewallRule':
        return toggleFirewallRule(request);
    case 'saveFirewallRules':
        return saveFirewallRules(request);
    case 'revertFirewallRules':
        return revertFirewallRules(request);
    case 'userSettings':
        return setUserSetting(request);
    default:
        return undefined;
    }
};

const Messaging = (() => {
    const portMap = new Map<string, chrome.runtime.Port>();
    const handlers = new Map<string, (payload: any, sendResponse?: (response: any) => void) => any>();
    const tabListeners = new Map<number, Set<(topic: string, payload: any) => void>>();

    function onPortConnected(port: chrome.runtime.Port) {
        portMap.set(port.name || 'unknown', port);
        
        port.onMessage.addListener((message) => {
            handlePortMessage(port, message);
        });

        port.onDisconnect.addListener(() => {
            portMap.delete(port.name || 'unknown');
        });
    }

    function handlePortMessage(port: chrome.runtime.Port, message: any) {
        if ( message && typeof message.channel === 'string' ) {
            handleLegacyPortMessage(port, message as LegacyMessage);
            return;
        }
        if (!message || !message.topic) return;

        const { topic, payload, seq } = message;
        const handler = handlers.get(topic);

        if (handler) {
            try {
                const result = handler(payload, (response: any) => {
                    if (seq !== undefined) {
                        port.postMessage({ seq, payload: response });
                    }
                });

                if (result instanceof Promise) {
                    result.then((response) => {
                        if (seq !== undefined && response !== undefined) {
                            port.postMessage({ seq, payload: response });
                        }
                    }).catch((error) => {
                        if (seq !== undefined) {
                            port.postMessage({ seq, payload: { error: error.message } });
                        }
                    });
                }
            } catch (e) {
                console.error('Handler error:', e);
                if (seq !== undefined) {
                    port.postMessage({ seq, payload: { error: (e as Error).message } });
                }
            }
        } else {
            broadcastToTabs(topic, payload);
        }
    }

    function handleLegacyPortMessage(port: chrome.runtime.Port, message: LegacyMessage) {
        const { channel, msgId, msg } = message;
        const respond = (response: any) => {
            if ( msgId === undefined ) { return; }
            port.postMessage({ msgId, msg: response });
        };

        if ( channel === 'popupPanel' ) {
            handlePopupPanelMessage(msg || {}).then(respond).catch(error => {
                respond({ error: error instanceof Error ? error.message : String(error) });
            });
            return;
        }

        if ( channel === 'default' && msg?.what === 'userSettings' ) {
            setUserSetting(msg).then(respond).catch(error => {
                respond({ error: error instanceof Error ? error.message : String(error) });
            });
            return;
        }

        respond(undefined);
    }

    function handleRuntimeMessage(
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        if (!message || !message.topic) return false;

        const { topic, payload, seq } = message;

        if (message.ch === 'content-script') {
            return handleContentScriptMessage(message, sender, sendResponse);
        }

        const handler = handlers.get(topic);
        if (handler) {
            try {
                const result = handler(payload, (response: any) => {
                    if (seq !== undefined) {
                        sendResponse({ seq, payload: response });
                    } else {
                        sendResponse(response);
                    }
                });

                if (result instanceof Promise) {
                    result.then((response) => {
                        sendResponse(response);
                    }).catch((error) => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                }

                return result !== undefined;
            } catch (e) {
                console.error('Handler error:', e);
                sendResponse({ error: (e as Error).message });
            }
        }

        return false;
    }

    function handleContentScriptMessage(
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        const fn = message.fn;
        const args = message.args || [];
        const tabId = sender.tab?.id ?? null;

        const handler = handlers.get(fn);
        if (handler) {
            try {
                const payload = args[0] || {};
                (payload as any)._tabId = tabId;
                (payload as any)._sender = sender;

                const result = handler(payload, (response: any) => {
                    sendResponse(response);
                });

                if (result instanceof Promise) {
                    result.then((response) => {
                        sendResponse(response);
                    }).catch((error) => {
                        sendResponse({ error: error.message });
                    });
                    return true;
                }

                return result !== undefined;
            } catch (e) {
                console.error('Content script handler error:', e);
                sendResponse({ error: (e as Error).message });
            }
        }

        return false;
    }

    function broadcastToTabs(topic: string, payload: any) {
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id) {
                    try {
                        chrome.tabs.sendMessage(tab.id, { topic, payload });
                    } catch (e) {
                    }
                }
            }
        });
    }

    function on(topic: string, handler: (payload: any, sendResponse?: (response: any) => void) => any) {
        handlers.set(topic, handler);
    }

    function off(topic: string) {
        handlers.delete(topic);
    }

    function sendToTab(tabId: number, topic: string, payload?: any, callback?: (response: any) => void) {
        chrome.tabs.sendMessage(tabId, { topic, payload }, callback);
    }

    function sendToAllTabs(topic: string, payload?: any) {
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { topic, payload });
                }
            }
        });
    }

    function getPort(name: string): chrome.runtime.Port | undefined {
        return portMap.get(name);
    }

    function addTabListener(tabId: number, listener: (topic: string, payload: any) => void) {
        if (!tabListeners.has(tabId)) {
            tabListeners.set(tabId, new Set());
        }
        tabListeners.get(tabId)!.add(listener);
    }

    function removeTabListener(tabId: number, listener: (topic: string, payload: any) => void) {
        tabListeners.get(tabId)?.delete(listener);
    }

    chrome.runtime.onConnect.addListener(onPortConnected);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    return {
        on,
        off,
        sendToTab,
        sendToAllTabs,
        getPort,
        addTabListener,
        removeTabListener,
    };
})();

const Zapper = (() => {
    let active = false;
    let tabId: number | null = null;
    let sessionId: string | null = null;

    function activate(targetTabId: number | null, callback?: (response: any) => void) {
        if (targetTabId === null) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    activate(tabs[0].id, callback);
                } else if (callback) {
                    callback({ error: 'No active tab' });
                }
            });
            return;
        }

        active = true;
        tabId = targetTabId;
        sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);

        chrome.tabs.sendMessage(tabId, {
            topic: 'zapperActivate',
            payload: { sessionId }
        }, (response) => {
            if (callback) {
                callback(response || { success: true });
            }
        });
    }

    function deactivate(callback?: (response: any) => void) {
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { topic: 'zapperDeactivate' }, () => {
                active = false;
                tabId = null;
                sessionId = null;
                if (callback) callback({ success: true });
            });
        } else {
            active = false;
            sessionId = null;
            if (callback) callback({ success: true });
        }
    }

    function isActive() { return active; }
    function getSessionId() { return sessionId; }
    function getTabId() { return tabId; }

    function highlight(details: any, callback?: (response: any) => void) {
        if (!tabId) {
            if (callback) callback({ error: 'No active zapper session' });
            return;
        }
        chrome.tabs.sendMessage(tabId, { topic: 'zapperHighlight', payload: details }, callback);
    }

    function click(details: any, callback?: (response: any) => void) {
        if (!tabId) {
            if (callback) callback({ error: 'No active zapper session' });
            return;
        }
        chrome.tabs.sendMessage(tabId, { topic: 'zapperClick', payload: details }, callback);
    }

    Messaging.on('zapperLaunch', (payload, callback) => {
        activate(payload?.tabId ?? null, callback);
    });

    Messaging.on('zapperQuery', (_, callback) => {
        if (callback) {
            callback({ active: isActive(), sessionId: getSessionId() });
        }
    });

    Messaging.on('zapperHighlight', (payload, callback) => {
        highlight(payload, callback);
    });

    Messaging.on('zapperClick', (payload, callback) => {
        click(payload, callback);
    });

    return {
        activate,
        deactivate,
        isActive,
        getSessionId,
        getTabId,
        highlight,
        click,
    };
})();

const Picker = (() => {
    let active = false;
    let tabId: number | null = null;
    let sessionId: string | null = null;

    function activate(targetTabId: number | null, callback?: (response: any) => void) {
        if (targetTabId === null) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    activate(tabs[0].id, callback);
                } else if (callback) {
                    callback({ error: 'No active tab' });
                }
            });
            return;
        }

        active = true;
        tabId = targetTabId;
        sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);

        chrome.tabs.sendMessage(tabId, {
            topic: 'pickerActivate',
            payload: { sessionId }
        }, (response) => {
            if (callback) {
                callback(response || { success: true });
            }
        });
    }

    function deactivate(callback?: (response: any) => void) {
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { topic: 'pickerDeactivate' }, () => {
                active = false;
                tabId = null;
                sessionId = null;
                if (callback) callback({ success: true });
            });
        } else {
            active = false;
            sessionId = null;
            if (callback) callback({ success: true });
        }
    }

    function isActive() { return active; }
    function getSessionId() { return sessionId; }
    function getTabId() { return tabId; }

    function createFilter(details: any, callback?: (response: any) => void) {
        if (!tabId) {
            if (callback) callback({ error: 'No active picker session' });
            return;
        }
        chrome.tabs.sendMessage(tabId, { topic: 'pickerCreateFilter', payload: details }, callback);
    }

    Messaging.on('pickerLaunch', (payload, callback) => {
        activate(payload?.tabId ?? null, callback);
    });

    Messaging.on('pickerQuery', (_, callback) => {
        if (callback) {
            callback({ active: isActive(), sessionId: getSessionId() });
        }
    });

    Messaging.on('pickerCreateFilter', (payload, callback) => {
        createFilter(payload, callback);
    });

    Messaging.on('pickerMessage', (payload, callback) => {
        const targetTab = Zapper.isActive() ? Zapper.getTabId() : Picker.getTabId();
        if (targetTab) {
            chrome.tabs.sendMessage(targetTab, {
                topic: Zapper.isActive() ? 'zapperMessage' : 'pickerMessage',
                payload
            }, callback);
        } else if (callback) {
            callback({ error: 'No active picker session' });
        }
    });

    return {
        activate,
        deactivate,
        isActive,
        getSessionId,
        getTabId,
        createFilter,
    };
})();

Messaging.on('ping', (_, callback) => {
    if (callback) callback({ pong: true, timestamp: Date.now() });
});

Messaging.on('getTabId', (_, callback) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (callback) {
            callback({ tabId: tabs[0]?.id ?? null });
        }
    });
});

Messaging.on('userSettings', (_, callback) => {
    chrome.storage.local.get('userSettings', (items) => {
        if (callback) {
            callback(items.userSettings || {});
        }
    });
});

Messaging.on('setUserSettings', (payload, callback) => {
    chrome.storage.local.get('userSettings', (items) => {
        const settings = { ...(items.userSettings || {}), ...payload };
        chrome.storage.local.set({ userSettings: settings }, () => {
            if (callback) callback({ success: true });
        });
    });
});

Messaging.on('dashboardGetRules', async (_, callback) => {
    const details = await getDashboardRules();
    if ( callback ) {
        callback(details);
    }
    return details;
});

Messaging.on('dashboardModifyRuleset', async (payload, callback) => {
    const details = await modifyDashboardRuleset(payload || {});
    if ( callback ) {
        callback(details);
    }
    return details;
});

Messaging.on('dashboardResetRules', async (_, callback) => {
    const details = await resetDashboardRules();
    if ( callback ) {
        callback(details);
    }
    return details;
});

chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;

        switch (command) {
            case 'launch-element-zapper':
                Zapper.activate(tabId);
                break;
            case 'launch-element-picker':
                Picker.activate(tabId);
                break;
            case 'open-dashboard':
                chrome.runtime.openOptionsPage();
                break;
            case 'launch-logger':
                chrome.tabs.create({ url: 'logger-ui.html' });
                break;
        }
    });
});

chrome.webRequest.onBeforeRequest.addListener(
    details => {
        recordTabRequest(details as chrome.webRequest.WebRequestBodyDetails);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.tabs.onRemoved.addListener(tabId => {
    void clearTabRequestState(tabId);
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('uBlock Origin installed');
    } else if (details.reason === 'update') {
        console.log('uBlock Origin updated');
    }
});

console.log('uBlock Origin MV3 Service Worker started');

ensurePopupState()
    .then(() => syncFirewallDnrRules())
    .catch(error => {
        console.error('Failed to initialize popup/firewall state', error);
    });

(self as any).µBlock = {
    userSettings: popupState.userSettings,
    permanentFirewall: popupState.permanentFirewall,
    sessionFirewall: popupState.sessionFirewall,
};

(self as any).Messaging = Messaging;
(self as any).Zapper = Zapper;
(self as any).Picker = Picker;
