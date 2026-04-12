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
    hostname?: string;
    state?: boolean;
    srcHostname?: string;
    desHostname?: string;
    desHostnames?: Record<string, unknown>;
    requestType?: string;
    action?: number;
    persist?: boolean;
};

type FirewallCount = {
    any: number;
    frame: number;
    script: number;
};

type FirewallCounts = {
    allowed: FirewallCount;
    blocked: FirewallCount;
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
    startedAt: number;
    pageHostname: string;
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

type PendingRequestInfo = {
    tabId: number;
    url: string;
    type: chrome.webRequest.ResourceType;
};

type TabSwitchMetrics = {
    popupBlockedCount: number;
    largeMediaCount: number;
    remoteFontCount: number;
    scriptCount: number;
};

type CollectedHostnameData = {
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

type HostnameSwitchState = Record<string, Partial<Record<string, boolean>>>;

type LegacyMessagingAPI = {
    ports: Map<string, any>;
    listeners: Map<string, { fn: (request: any, sender: any, callback: (response?: any) => void) => any; privileged?: boolean }>;
    defaultHandler: null | ((request: any, sender: any, callback: (response?: any) => void) => any);
    PRIVILEGED_ORIGIN: string;
    UNHANDLED: string;
    onFrameworkMessage?: (request: any, port: chrome.runtime.Port, callback: (response?: any) => void) => void;
    onPortDisconnect?: (port: chrome.runtime.Port) => void;
};

type LegacyPortDetails = {
    port: chrome.runtime.Port;
    frameId?: number;
    frameURL?: string;
    privileged: boolean;
    tabId?: number;
    tabURL?: string;
};

let cosmeticFilteringEngine: any = null;
let staticNetFilteringEngine: any = null;
let staticExtFilteringEngine: any = null;
let logger: any = null;
let pageStore: any = null;
let µb: any = null;
let filteringContext: any = null;
let filteringEngines: any = null;
let io: any = null;
let publicSuffixList: any = null;

const setEngineReferences = () => {
    try {
        cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
        staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
        staticExtFilteringEngine = (globalThis as any).vAPI?.staticExtFilteringEngine || (globalThis as any).staticExtFilteringEngine;
        logger = (globalThis as any).vAPI?.logger || (globalThis as any).logger;
        µb = (globalThis as any).vAPI?.µb || (globalThis as any).µb;
        filteringContext = (globalThis as any).vAPI?.filteringContext || (globalThis as any).filteringContext;
        filteringEngines = (globalThis as any).vAPI?.filteringEngines || (globalThis as any).filteringEngines;
        io = (globalThis as any).vAPI?.io || (globalThis as any).io;
        publicSuffixList = (globalThis as any).vAPI?.publicSuffixList || (globalThis as any).publicSuffixList;
        
        // Additional engine references for full emulation
        const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
        const staticFilteringReverseLookup = (globalThis as any).vAPI?.staticFilteringReverseLookup;
        const scriptletFilteringEngine = (globalThis as any).vAPI?.scriptletFilteringEngine;
        const htmlFilteringEngine = (globalThis as any).vAPI?.htmlFilteringEngine;
        const permanentURLFiltering = (globalThis as any).vAPI?.permanentURLFiltering;
        const sessionURLFiltering = (globalThis as any).vAPI?.sessionURLFiltering;
        const webRequest = (globalThis as any).vAPI?.webRequest;
        
        // Expose these engines to globalThis.vAPI for handlers to use
        (globalThis as any).vAPI.redirectEngine = redirectEngine;
        (globalThis as any).vAPI.staticFilteringReverseLookup = staticFilteringReverseLookup;
        (globalThis as any).vAPI.scriptletFilteringEngine = scriptletFilteringEngine;
        (globalThis as any).vAPI.htmlFilteringEngine = htmlFilteringEngine;
        (globalThis as any).vAPI.permanentURLFiltering = permanentURLFiltering;
        (globalThis as any).vAPI.sessionURLFiltering = sessionURLFiltering;
        (globalThis as any).vAPI.webRequest = webRequest;
        
        // Create a simple filteringContext wrapper if not available
        if (!filteringContext) {
            const createFilterContext = (init?: Partial<{
                hostname: string; url: string; origin: string; type: string; realm: string; filter: unknown;
            }>) => {
                const state = init || {};
                const ctx = {
                    duplicate: () => createFilterContext(state),
                    fromTabId: async (tabId: number) => {
                        try {
                            const tab = await chrome.tabs.get(tabId);
                            if (tab?.url) {
                                const url = new URL(tab.url);
                                const newState = { ...state, hostname: url.hostname, url: url.href, origin: url.origin };
                                return createFilterContext(newState);
                            }
                        } catch (e) {}
                        return createFilterContext({});
                    },
                    setType: (type: string) => {
                        return createFilterContext({ ...state, type });
                    },
                    setURL: (url: string) => {
                        try {
                            const parsed = new URL(url);
                            return createFilterContext({ ...state, url: parsed.href, hostname: parsed.hostname, origin: parsed.origin });
                        } catch {
                            return ctx;
                        }
                    },
                    setDocOriginFromURL: (url: string) => {
                        try {
                            const parsed = new URL(url);
                            return createFilterContext({ ...state, origin: parsed.origin });
                        } catch {
                            return ctx;
                        }
                    },
                    setRealm: (realm: string) => {
                        return createFilterContext({ ...state, realm });
                    },
                    setFilter: (filter: unknown) => {
                        return createFilterContext({ ...state, filter });
                    },
                    toLogger: () => {
                        if (logger?.enabled) {
                            logger.writeOne({
                                tabId: 0,
                                realm: state.realm || 'network',
                                type: 'filter',
                                text: state.url || '',
                                filter: state.filter,
                            });
                        }
                    },
                    // Accessors
                    get hostname() { return state.hostname || ''; },
                    get url() { return state.url || ''; },
                    get origin() { return state.origin || ''; },
                    get type() { return state.type || ''; },
                    get realm() { return state.realm || 'network'; },
                    get filter() { return state.filter; },
                };
                return ctx;
            };
            
            const createRootFilterContext = () => {
                const state: any = {};
                
                const ctx = {
                    duplicate: () => createFilterContext({ ...state }),
                    fromTabId: async (tabId: number) => {
                        try {
                            const tab = await chrome.tabs.get(tabId);
                            if (tab?.url) {
                                const url = new URL(tab.url);
                                return createFilterContext({ hostname: url.hostname, url: url.href, origin: url.origin });
                            }
                        } catch (e) {}
                        return createFilterContext({});
                    },
                    setRealm: function(this: any, realm: string) {
                        state.realm = realm;
                        return this;
                    },
                    setType: function(this: any, type: string) {
                        state.type = type;
                        return this;
                    },
                    setURL: function(this: any, url: string) {
                        state.url = url;
                        try {
                            const parsed = new URL(url);
                            state.hostname = parsed.hostname;
                            state.origin = parsed.origin;
                        } catch (e) {}
                        return this;
                    },
                    setDocOriginFromURL: function(this: any, url: string) {
                        try {
                            const parsed = new URL(url);
                            state.docOrigin = parsed.origin;
                        } catch (e) {}
                        return this;
                    },
                toLogger: function() {
                    if (logger?.log) {
                        logger.log(state);
                    }
                },
                    get hostname() { return state.hostname || ''; },
                    get url() { return state.url || ''; },
                    get origin() { return state.origin || ''; },
                    get type() { return state.type || ''; },
                    get realm() { return state.realm || 'network'; },
                    get filter() { return state.filter; },
                };
                return ctx;
            };
            
            filteringContext = createRootFilterContext();
        }
    } catch (e) {
        console.log('[MV3] Could not get engine references:', e);
    }
};

const legacyBackendState = {
    initializing: null as Promise<void> | null,
    initialized: false,
};

const hostnameSwitchNames = new Set([
    'no-popups',
    'no-large-media',
    'no-cosmetic-filtering',
    'no-remote-fonts',
    'no-scripting',
]);
const HOSTNAME_SWITCHES_SCHEMA_VERSION = 2;

// Element picker state
const epickerArgs = {
    target: '',
    mouse: '',
    zap: false,
    eprom: null as any,
};

// Helper function to adjust color brightness
const adjustColor = (color: string, percent: number): string => {
    // Handle hex colors
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const num = parseInt(hex, 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + percent));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    }
    return color;
};

const getLegacyMessaging = (): LegacyMessagingAPI | undefined => {
    return (globalThis as any).vAPI?.messaging;
};

// Cloud data encoding/decoding helpers
const getDeviceName = async (): Promise<string> => {
    const stored = await chrome.storage.local.get('cloudOptions');
    const name = stored?.cloudOptions?.deviceName;
    if (name) return name;
    
    // Generate default device name
    const info = await chrome.runtime.getPlatformInfo();
    const os = info.os || 'unknown';
    const deviceName = `${os}-device-${Date.now().toString(36).slice(-6)}`;
    await chrome.storage.local.set({ cloudOptions: { deviceName } });
    return deviceName;
};

const encodeCloudData = async (data: any): Promise<string> => {
    const json = JSON.stringify(data);
    const stored = await chrome.storage.local.get('hiddenSettings');
    const hiddenSettings = stored?.hiddenSettings || {};
    
    // s14e format with compression support if enabled
    const useCompression = hiddenSettings.cloudStorageCompression === true;
    
    let encoded = json;
    if (useCompression) {
        // Simple compression using encodeURIComponent
        // In a full implementation, this would use lz4 or similar
        encoded = btoa(unescape(encodeURIComponent(json)));
        // Mark as compressed version
        return '2:' + encoded;
    }
    
    encoded = btoa(unescape(encodeURIComponent(json)));
    // Add s14e version marker
    return '1:' + encoded;
};

const decodeCloudData = async (encoded: string): Promise<any> => {
    try {
        // Handle s14e format
        let dataStr = encoded;
        let isCompressed = false;
        
        if (encoded.startsWith('2:')) {
            dataStr = encoded.substring(2);
            isCompressed = true;
        } else if (encoded.startsWith('1:')) {
            dataStr = encoded.substring(2);
        }
        
        const json = decodeURIComponent(escape(atob(dataStr)));
        const parsed = JSON.parse(json);
        
        // Check for merge conflict markers and handle appropriately
        if (parsed._mergeConflict) {
            // Return data with conflict info
            return parsed;
        }
        
        return parsed;
    } catch (e) {
        throw new Error('Failed to decode cloud data: ' + (e as Error).message);
    }
};

// Broadcast filtering behavior change to all tabs
const broadcastFilteringBehaviorChanged = async (): Promise<void> => {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.id) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { what: 'filteringBehaviorChanged' });
                } catch {
                    // Tab may not have content script
                }
            }
        }
    } catch (e) {}
};

const withDisabledRuntimeOnConnect = async <T>(callback: () => Promise<T>): Promise<T> => {
    const runtime = (globalThis as any).browser?.runtime || (globalThis as any).chrome?.runtime;
    const onConnect = runtime?.onConnect;
    if ( typeof onConnect?.addListener !== 'function' ) {
        return callback();
    }
    const originalAddListener = onConnect.addListener.bind(onConnect);
    onConnect.addListener = () => {};
    try {
        return await callback();
    } finally {
        onConnect.addListener = originalAddListener;
    }
};

const ensureLegacyBackend = async (): Promise<void> => {
    if ( legacyBackendState.initialized ) { return; }
    if ( legacyBackendState.initializing ) { return legacyBackendState.initializing; }

    legacyBackendState.initializing = withDisabledRuntimeOnConnect(async () => {
        if ( typeof (globalThis as any).window === 'undefined' ) {
            (globalThis as any).window = globalThis;
        }
        const vAPI = ((globalThis as any).vAPI ||= {});
        if ( typeof (globalThis as any).window.vAPI === 'undefined' ) {
            (globalThis as any).window.vAPI = vAPI;
        }
        if ( typeof vAPI.T0 !== 'number' ) {
            vAPI.T0 = Date.now();
        }
        if ( typeof vAPI.sessionId !== 'string' ) {
            vAPI.sessionId = 'mv3-sw';
        }
        if ( typeof vAPI.getURL !== 'function' ) {
            vAPI.getURL = (path = '') => chrome.runtime.getURL(path);
        }
        if ( typeof vAPI.setTimeout !== 'function' ) {
            vAPI.setTimeout = globalThis.setTimeout.bind(globalThis);
        }
        if ( typeof vAPI.clearTimeout !== 'function' ) {
            vAPI.clearTimeout = globalThis.clearTimeout.bind(globalThis);
        }
        if ( typeof vAPI.localStorage !== 'object' || vAPI.localStorage === null ) {
            const storageMap = new Map<string, string>();
            vAPI.localStorage = {
                getItem(key: string) {
                    return Promise.resolve(storageMap.has(key) ? storageMap.get(key) : null);
                },
                setItem(key: string, value: string) {
                    storageMap.set(key, `${value}`);
                    return Promise.resolve();
                },
                removeItem(key: string) {
                    storageMap.delete(key);
                    return Promise.resolve();
                },
                clear() {
                    storageMap.clear();
                    return Promise.resolve();
                },
            };
        }
        if (
            typeof vAPI.webextFlavor !== 'object' ||
            vAPI.webextFlavor === null ||
            typeof vAPI.webextFlavor.soup?.has !== 'function'
        ) {
            vAPI.webextFlavor = {
                major: 120,
                env: [],
                soup: new Set([ 'chromium', 'mv3', 'ublock' ]),
            };
        } else {
            vAPI.webextFlavor.major ??= 120;
            vAPI.webextFlavor.env ??= [];
            if ( typeof vAPI.webextFlavor.soup?.add === 'function' ) {
                vAPI.webextFlavor.soup.add('chromium');
                vAPI.webextFlavor.soup.add('mv3');
                vAPI.webextFlavor.soup.add('ublock');
            }
        }
        if ( typeof (globalThis as any).screen === 'undefined' ) {
            (globalThis as any).screen = { width: 1280, height: 720 };
        }
        if ( typeof (globalThis as any).window.screen === 'undefined' ) {
            (globalThis as any).window.screen = (globalThis as any).screen;
        }
        if ( typeof (globalThis as any).document === 'undefined' ) {
            const noop = () => {};
            const nullFn = () => null;
            (globalThis as any).document = {
                body: null,
                head: null,
                documentElement: null,
                hidden: true,
                visibilityState: 'hidden',
                readyState: 'complete',
                addEventListener: noop,
                removeEventListener: noop,
                dispatchEvent: noop,
                createElement: () => ({
                    style: {},
                    setAttribute: noop,
                    removeAttribute: noop,
                    addEventListener: noop,
                    removeEventListener: noop,
                    appendChild: noop,
                    remove: noop,
                    classList: {
                        add: noop,
                        remove: noop,
                        contains: () => false,
                    },
                }),
                querySelector: nullFn,
                querySelectorAll: () => [],
                getElementById: nullFn,
            };
        }
        if ( typeof (globalThis as any).window.document === 'undefined' ) {
            (globalThis as any).window.document = (globalThis as any).document;
        }
        if ( typeof (globalThis as any).Image === 'undefined' ) {
            (globalThis as any).Image = class {
                onload: null | (() => void) = null;
                onerror: null | (() => void) = null;
                width = 0;
                height = 0;
                complete = false;
                private listeners = new Map<string, Set<() => void>>();
                addEventListener(type: string, listener: () => void) {
                    const bucket = this.listeners.get(type) || new Set<() => void>();
                    bucket.add(listener);
                    this.listeners.set(type, bucket);
                }
                removeEventListener(type: string, listener: () => void) {
                    this.listeners.get(type)?.delete(listener);
                }
                set src(_value: string) {
                    this.complete = true;
                    queueMicrotask(() => {
                        if ( typeof this.onload === 'function' ) {
                            this.onload();
                        }
                        for ( const listener of this.listeners.get('load') || [] ) {
                            listener();
                        }
                    });
                }
            };
        }
        await import('../start.ts');
        const backgroundModule = await import('../background.js');
        const legacyBackground = backgroundModule.default as { isReadyPromise?: Promise<unknown> };
        if ( legacyBackground?.isReadyPromise instanceof Promise ) {
            await legacyBackground.isReadyPromise.catch(() => {});
        }
        legacyBackendState.initialized = true;
        setEngineReferences();
    });

    try {
        await legacyBackendState.initializing;
    } finally {
        legacyBackendState.initializing = null;
    }
};

const registerLegacyPort = (port: chrome.runtime.Port): LegacyPortDetails | undefined => {
    const messaging = getLegacyMessaging();
    if ( messaging === undefined ) { return; }

    const sender = port.sender || {};
    const { origin, tab, url } = sender;
    const details: LegacyPortDetails = {
        port,
        frameId: sender.frameId,
        frameURL: url,
        privileged: origin !== undefined
            ? origin === messaging.PRIVILEGED_ORIGIN
            : typeof url === 'string' && url.startsWith(messaging.PRIVILEGED_ORIGIN),
    };
    if ( tab ) {
        details.tabId = tab.id;
        details.tabURL = tab.url;
    }
    messaging.ports.set(port.name, details);
    return details;
};

const userSettingsDefault = {
    advancedUserEnabled: false,
    autoUpdate: true,
    cloudStorageEnabled: false,
    collapseBlocked: true,
    colorBlindFriendly: false,
    contextMenuEnabled: true,
    cnameUncloakEnabled: false,
    hyperlinkAuditingDisabled: true,
    ignoreGenericCosmeticFilters: false,
    importedLists: [] as string[],
    largeMediaSize: 10485760,
    netWhitelistDefault: [
        'about:blank',
        'about:srcdoc',
        'http://127.0.0.1/*',
        'http://localhost/*',
        'https://127.0.0.1/*',
        'https://localhost/*',
    ],
    noCosmeticFiltering: false,
    noLargeMedia: false,
    noRemoteFonts: false,
    noScripting: false,
    noCSPReports: true,
    parseAllABPHideFilters: true,
    prefetchingDisabled: false,
    firewallPaneMinimized: true,
    popupPanelSections: 0b111,
    showIconBadge: true,
    suspendUntilListsAreLoaded: false,
    tooltipsDisabled: false,
    uiAccentCustom: false,
    uiAccentCustom0: '#3498d6',
    uiTheme: 'auto',
};

const reWhitelistBadHostname = /[^a-z0-9.\-_[\]:]/;
const reWhitelistHostnameExtractor = /([a-z0-9.\-_[\]]+)(?::[\d*]+)?\/(?:[^\x00-\x20/]|$)[^\x00-\x20]*$/;

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
const POWER_RULE_ID_MIN = 9_100_000;
const POWER_RULE_ID_MAX = 9_199_999;
const HOSTNAME_SWITCH_RULE_ID_MIN = 9_200_000;
const HOSTNAME_SWITCH_RULE_ID_MAX = 9_299_999;
const WHITELIST_RULE_ID_MIN = 9_300_000;
const WHITELIST_RULE_ID_MAX = 9_399_999;

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

const domainFromURI = (uri: string): string => {
    try {
        const url = new URL(uri);
        return domainFromHostname(url.hostname);
    } catch {
        return '';
    }
};

const hostnameFromURI = (uri: string): string => {
    try {
        const url = new URL(uri);
        return url.hostname;
    } catch {
        return '';
    }
};

const isNetworkURI = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const formatCount = (count: number): string => {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return String(count);
};

const dateNowToSensibleString = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}-${hour}${minute}`;
};

const generateAccentStylesheet = (accent: string, dark: boolean): string => {
    const baseColor = accent.replace('#', '');
    const r = parseInt(baseColor.substring(0, 2), 16);
    const g = parseInt(baseColor.substring(2, 4), 16);
    const b = parseInt(baseColor.substring(4, 6), 16);
    
    const lighter = `rgba(${Math.min(255, r + 30)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 30)}, 0.5)`;
    const darker = `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 0.5)`;
    
    return `
:root {
    --accent: ${accent};
    --accent-light: ${lighter};
    --accent-dark: ${darker};
}
::-webkit-scrollbar-thumb { background: var(--accent); }
::-webkit-scrollbar-thumb:hover { background: var(--accent-dark); }
::-webkit-scrollbar-corner { background: var(--accent-light); }
`;
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

type FirewallCount = {
    any: number;
    frame: number;
    script: number;
};

type FirewallCounts = {
    allowed: FirewallCount;
    blocked: FirewallCount;
};

class FrameStore {
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

class MV3PageStore {
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
            
            // Extract root hostname and root domain
            const parts = this.hostname.split('.');
            if (parts.length >= 2) {
                // Root hostname is second-level domain (e.g., "example" from "sub.example.com")
                this.rootHostname = parts.slice(-2)[0];
                // Root domain is second-level domain with TLD (e.g., "example.com")
                this.rootDomain = parts.slice(-2).join('.');
            } else {
                this.rootHostname = this.hostname;
                this.rootDomain = this.hostname;
            }
            
            // Load per-site filtering state
            const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
            const perSiteFiltering = storedFiltering?.perSiteFiltering || {};
            this.netFilteringSwitch = perSiteFiltering[this.hostname] !== false;
            
            // Load content version
            const storedVersions = await chrome.storage.local.get('popupContentVersions');
            const versions = storedVersions?.popupContentVersions || {};
            this.contentLastModified = versions[tab.id] || 0;
            
            // Load metrics
            const storedMetrics = await chrome.storage.local.get('tabMetrics');
            const metrics = storedMetrics?.tabMetrics || {};
            const tabMetric = metrics[tab.id] || {};
            this.largeMediaCount = tabMetric.largeMediaCount || 0;
            this.remoteFontCount = tabMetric.remoteFontCount || 0;
            this.popupBlockedCount = tabMetric.popupBlockedCount || 0;
            this.counts.blocked = tabMetric.blocked || { any: 0, frame: 0, script: 0 };
            this.counts.allowed = tabMetric.allowed || { any: 0, frame: 0, script: 0 };
            
            // Load hostname details
            const storedDetails = await chrome.storage.local.get('hostnameDetailsMap');
            const detailsMap = storedDetails?.hostnameDetailsMap || {};
            const tabDetails = detailsMap[tab.id] || {};
            for (const [hostname, detail] of Object.entries(tabDetails)) {
                this.hostnameDetailsMap.set(hostname, detail as any);
            }
            
            // Load extra data
            const storedExtraData = await chrome.storage.local.get('pageStoreExtraData');
            const extraDataMap = storedExtraData?.pageStoreExtraData || {};
            const tabExtraData = extraDataMap[tab.id] || {};
            for (const [key, value] of Object.entries(tabExtraData)) {
                this.extraData.set(key, value);
            }
            
            // Load allow large media timestamp
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
    
    async toggleNetFilteringSwitch(url: string, scope: string, state: boolean): Promise<void> {
        this.netFilteringSwitch = state;
        
        try {
            const hostname = new URL(url).hostname;
            const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
            const perSiteFiltering = storedFiltering?.perSiteFiltering || {};
            
            const key = scope === 'page' ? `${hostname}:${url}` : hostname;
            if (state) {
                delete perSiteFiltering[key];
            } else {
                perSiteFiltering[key] = false;
            }
            
            await chrome.storage.local.set({ perSiteFiltering });
            
            await syncHostnameSwitchDnrRules();
        } catch (e) {
            console.log('[MV3] toggleNetFilteringSwitch error:', e);
        }
    }
    
    getFrameStore(frameId: number): FrameStore | null {
        return this.frameStores.get(frameId) || null;
    }
    
    setFrameURL(details: { frameId: number; frameURL: string; parentId?: number }): void {
        const { frameId, frameURL, parentId } = details;
        let frameStore = this.frameStores.get(frameId);
        if (frameStore) {
            frameStore.updateURL(frameURL);
            if (parentId !== undefined) {
                frameStore.parentId = parentId;
            }
        } else {
            frameStore = new FrameStore(frameURL, parentId || 0);
            this.frameStores.set(frameId, frameStore);
        }
    }
    
    getEffectiveFrameURL(sender: { frameId?: number }): string {
        if (!sender?.frameId) return this.rawURL;
        const frameStore = this.frameStores.get(sender.frameId);
        return frameStore?.frameURL || this.rawURL;
    }
    
    getFrameAncestorDetails(frameId: number): { parent: string; ancestors: string[] } | null {
        const frameStore = this.frameStores.get(frameId);
        if (!frameStore) return null;
        
        const ancestors: string[] = [];
        let currentFrameId = frameId;
        
        while (currentFrameId) {
            const currentStore = this.frameStores.get(currentFrameId);
            if (currentStore && currentStore.parentId !== 0) {
                const parentStore = this.frameStores.get(currentStore.parentId);
                if (parentStore) {
                    ancestors.push(parentStore.frameURL);
                    currentFrameId = currentStore.parentId;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        
        return {
            parent: frameStore.parentId.toString(),
            ancestors: ancestors.reverse(),
        };
    }
    
    shouldApplySpecificCosmeticFilters(frameId: number): boolean {
        const frameStore = this.frameStores.get(frameId);
        if (frameStore) {
            return !frameStore.clickToLoad;
        }
        return true;
    }
    
    shouldApplyGenericCosmeticFilters(frameId: number): boolean {
        if (this.netFilteringSwitch === false) return false;
        const frameStore = this.frameStores.get(frameId);
        if (frameStore) {
            return !frameStore.clickToLoad;
        }
        return true;
    }
    
    async clickToLoad(frameId: number, frameURL: string): Promise<void> {
        let frameStore = this.frameStores.get(frameId);
        if (!frameStore) {
            frameStore = new FrameStore(frameURL, 0);
            this.frameStores.set(frameId, frameStore);
        }
        frameStore.clickToLoad = true;
        
        // Notify content script to reload
        try {
            await chrome.tabs.sendMessage(this.tabId, {
                what: 'reloadFrame',
                frameId: frameId,
            });
        } catch (e) {}
    }
    
    temporarilyAllowLargeMediaElements(state: boolean): void {
        this.allowLargeMediaElementsUntil = state ? Date.now() + 5000 : 0;
        
        // Persist to storage
        chrome.storage.local.get('allowLargeMediaElements').then(stored => {
            const largeMediaMap = stored?.allowLargeMediaElements || {};
            largeMediaMap[this.tabId] = this.allowLargeMediaElementsUntil;
            chrome.storage.local.set({ allowLargeMediaElements: largeMediaMap });
        }).catch(() => {});
    }
    
    disposeFrameStores(): void {
        for (const frameStore of this.frameStores.values()) {
            frameStore.dispose();
        }
        this.frameStores.clear();
    }
    
    filterRequest(fctxt: any): number {
        // This is a placeholder - actual filtering is done via vAPI
        // Return 0 = allowed, 1 = blocked
        return 0;
    }
    
    filterOnHeaders(fctxt: any, ...headers: any[]): number {
        return 0;
    }
    
    redirectBlockedRequest(fctxt: any): string | null {
        return null;
    }
    
    filterCSPReport(fctxt: any): boolean {
        return true;
    }
    
    filterFont(fctxt: any): boolean {
        return true;
    }
    
    filterScripting(fctxt: any, netFiltering: boolean): number {
        return 0;
    }
    
    filterLargeMediaElement(fctxt: any, headers: any): boolean {
        return this.allowLargeMediaElementsUntil > Date.now();
    }
    
    // extraData methods - allow storing arbitrary per-tab data
    setExtraData(key: string, value: any): void {
        this.extraData.set(key, value);
        // Persist to storage
        chrome.storage.local.get('pageStoreExtraData').then(stored => {
            const extraDataMap = stored?.pageStoreExtraData || {};
            if (!extraDataMap[this.tabId]) {
                extraDataMap[this.tabId] = {};
            }
            extraDataMap[this.tabId][key] = value;
            chrome.storage.local.set({ pageStoreExtraData: extraDataMap }).catch(() => {});
        }).catch(() => {});
    }
    
    getExtraData(key: string): any {
        return this.extraData.get(key);
    }
    
    getAllExtraData(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, value] of this.extraData) {
            result[key] = value;
        }
        return result;
    }
}

// Page stores map - one per tab
const pageStores = new Map<number, MV3PageStore>();
let pageStoresToken = 0;

const pageStoreFromTabId = async (tabId: number): Promise<MV3PageStore | null> => {
    let pageStore = pageStores.get(tabId);
    
    if (!pageStore) {
        try {
            const tab = await chrome.tabs.get(tabId);
            pageStore = new MV3PageStore(tabId);
            await pageStore.initialize(tab);
            pageStores.set(tabId, pageStore);
            pageStoresToken++;
            if ((self as any).µb) {
                (self as any).µb.pageStoresToken = pageStoresToken;
            }
        } catch (e) {
            return null;
        }
    }
    
    return pageStore;
};

const mustLookup = async (tabId: number): Promise<MV3PageStore | null> => {
    return pageStoreFromTabId(tabId);
};

const popupState = {
    initialized: false,
    initPromise: Promise.resolve(),
    userSettings: { ...userSettingsDefault },
    permanentFirewall: new DynamicFirewallRules(),
    sessionFirewall: new DynamicFirewallRules(),
    permanentHostnameSwitches: {} as HostnameSwitchState,
    sessionHostnameSwitches: {} as HostnameSwitchState,
    whitelist: [] as string[],
    globalAllowedRequestCount: 0,
    globalBlockedRequestCount: 0,
    trustedLists: {} as Record<string, boolean>,
    noDashboard: false,
    inMemoryFilter: '',
    loggerOwnerId: undefined as number | undefined,
    uiAccentStylesheet: '',
    tabMetrics: {} as Record<number, { blocked?: number; allowed?: number; hasUnprocessedRequest?: boolean }>,
    supportStats: { supportPageCount: 0 },
    pageStores,
};

type FilterListDetails = {
    content?: string;
    group?: string;
    group2?: string;
    parent?: string;
    title?: string;
    off?: boolean;
    preferred?: boolean;
    external?: boolean;
    submitter?: string;
    contentURL?: string | string[];
    supportURL?: string;
    supportName?: string;
    instructionURL?: string;
    isDefault?: boolean;
    isImportant?: boolean;
    tags?: string;
    entryCount?: number;
    entryUsedCount?: number;
};

type FilterListResponse = {
    autoUpdate: boolean;
    available: Record<string, FilterListDetails>;
    cache: Record<string, unknown>;
    cosmeticFilterCount: number;
    current: Record<string, FilterListDetails>;
    ignoreGenericCosmeticFilters: boolean;
    isUpdating: boolean;
    netFilterCount: number;
    parseCosmeticFilters: boolean;
    suspendUntilListsAreLoaded: boolean;
    userFiltersPath: string;
};

const FILTER_LIST_USER_PATH = 'user-filters';
const FILTER_LIST_ASSETS_URL = 'assets/assets.dev.json';
let filterListsUpdating = false;

const tabRequestStates = new Map<number, TabRequestState>();
const pickerContextPoints = new Map<string, {
    tabId: number;
    frameId: number;
    x: number;
    y: number;
    timestamp: number;
    target?: { selector: string };
}>();
const requestStateStorage = chrome.storage.session || chrome.storage.local;
const tabRequestStateKey = (tabId: number) => `firewallTabState:${tabId}`;
const pickerContextPointKey = (tabId: number, frameId: number) => `${tabId}:${frameId}`;

const isOwnExtensionTab = (tab?: chrome.tabs.Tab) => {
    const url = tab?.url || '';
    return url !== '' && url.startsWith(chrome.runtime.getURL(''));
};

const pickMostRelevantBrowsingTab = async () => {
    const tabs = await chrome.tabs.query({});
    const candidates = tabs.filter(tab => {
        const url = tab.url || '';
        if ( url === '' ) { return false; }
        if ( isOwnExtensionTab(tab) ) { return false; }
        return /^(https?|file):/.test(url);
    });
    candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return candidates[0];
};

const getActiveTab = async () => {
    let [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true });
    if ( tab && isOwnExtensionTab(tab) === false ) {
        return tab;
    }
    [ tab ] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if ( tab && isOwnExtensionTab(tab) === false ) {
        return tab;
    }
    return pickMostRelevantBrowsingTab();
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
    const items = await chrome.storage.local.get([
        'userSettings',
        'dynamicFilteringString',
        'hostnameSwitches',
        'hostnameSwitchesVersion',
        'globalAllowedRequestCount',
        'globalBlockedRequestCount',
        'whitelist',
    ]);
    Object.assign(
        popupState.userSettings,
        userSettingsDefault,
        items.userSettings || {},
    );
    popupState.permanentFirewall.fromString(items.dynamicFilteringString || '');
    popupState.sessionFirewall.assign(popupState.permanentFirewall);
    if ( items.hostnameSwitchesVersion === HOSTNAME_SWITCHES_SCHEMA_VERSION &&
        items.hostnameSwitches &&
        typeof items.hostnameSwitches === 'object'
    ) {
        popupState.permanentHostnameSwitches = structuredClone(items.hostnameSwitches as HostnameSwitchState);
    } else {
        popupState.permanentHostnameSwitches = {};
    }
    popupState.sessionHostnameSwitches = structuredClone(popupState.permanentHostnameSwitches);
    popupState.globalAllowedRequestCount = typeof items.globalAllowedRequestCount === 'number'
        ? items.globalAllowedRequestCount
        : 0;
    popupState.globalBlockedRequestCount = typeof items.globalBlockedRequestCount === 'number'
        ? items.globalBlockedRequestCount
        : 0;
    popupState.whitelist = typeof items.whitelist === 'string' 
        ? items.whitelist.split('\n').filter(Boolean)
        : [];
    
    // Update µb.netWhitelist to match
    if ((self as any).µb) {
        (self as any).µb.netWhitelist = popupState.whitelist.join('\n');
    }
    
    popupState.initialized = true;
    
    // Load filter lists on startup
    await reloadAllFilterLists();
    
    // Sync all DNR rules on startup after state is loaded
    void syncFirewallDnrRules();
    void syncHostnameSwitchDnrRules();
    void syncPowerSwitchDnrRules();
    void syncWhitelistDnrRules();
    
    // Load element picker eprom from storage
    const epromStored = await chrome.storage.local.get('elementPickerEprom');
    if (epromStored?.elementPickerEprom) {
        (self as any).µb = (self as any).µb || {};
        (self as any).µb.epickerArgs = (self as any).µb.epickerArgs || {};
        (self as any).µb.epickerArgs.eprom = epromStored.elementPickerEprom;
    }
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

const getModifiedSettings = (current: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> => {
    const modified: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(current)) {
        if (value !== defaults[key]) {
            modified[key] = value;
        }
    }
    return modified;
};

const backupUserData = async () => {
    await ensurePopupState();
    
    const storage = await chrome.storage.local.get(null);
    const storageUsed = await chrome.storage.local.getBytesInUse(null);
    
    const manifest = chrome.runtime.getManifest();
    const lastBackupFile = 'ublock-resurrected-backup-' + dateNowToSensibleString() + '.json';
    const lastBackupTime = Date.now();
    
    // Get hidden settings for backup
    const hiddenSettings = (await chrome.storage.local.get('hiddenSettings')).hiddenSettings || {};
    
    // Only include modified settings
    const modifiedUserSettings = getModifiedSettings(popupState.userSettings, userSettingsDefault);
    const modifiedHiddenSettings = getModifiedSettings(hiddenSettings, {});
    
    const userData = {
        timeStamp: lastBackupTime,
        version: manifest.version || '1.0.0',
        userSettings: modifiedUserSettings,
        hiddenSettings: modifiedHiddenSettings,
        selectedFilterLists: storage.selectedFilterLists || [],
        filterLists: storage.filterLists || {},
        netWhitelist: storage.netWhitelist || '',
        whitelist: (storage.whitelist || '').split('\n').filter(Boolean),
        dynamicRules: storage.dynamicRules || [],
        permanentFirewallRules: popupState.permanentFirewall.toArray(),
        sessionFirewallRules: popupState.sessionFirewall.toArray(),
    };
    
    // Save backup metadata
    await chrome.storage.local.set({
        localData: {
            lastBackupFile,
            lastBackupTime,
            storageUsed,
        },
    });
    
    return {
        userData,
        localData: {
            lastBackupFile,
            lastBackupTime,
            storageUsed,
        },
    };
};

const restoreUserData = async (request: { userData?: unknown; file?: string }) => {
    const userData = request.userData as {
        timeStamp?: number;
        version?: string;
        userSettings?: Record<string, unknown>;
        hiddenSettings?: Record<string, unknown>;
        selectedFilterLists?: string[];
        filterLists?: Record<string, unknown>;
        netWhitelist?: string;
        whitelist?: string[];
        dynamicRules?: unknown[];
        permanentFirewallRules?: unknown[];
        sessionFirewallRules?: unknown[];
        permanentURLFiltering?: unknown[];
        sessionURLFiltering?: unknown[];
    } | undefined;
    
    if (!userData) {
        return { error: 'No user data provided' };
    }
    
    // Clear caches before restoring
    try {
        const cacheKeys = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(cacheKeys).filter(k => 
            k.startsWith('assetCache_') || k.startsWith('cachedAsset_')
        );
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
    } catch (e) {}
    
    // Restore hiddenSettings
    if (userData.hiddenSettings) {
        const existingHidden = (await chrome.storage.local.get('hiddenSettings')).hiddenSettings || {};
        await chrome.storage.local.set({ 
            hiddenSettings: { ...existingHidden, ...userData.hiddenSettings } 
        });
    }
    
    // Restore userSettings
    if (userData.userSettings) {
        popupState.userSettings = { ...popupState.userSettings, ...userData.userSettings };
        await persistUserSettings();
    }
    
    // Restore filter lists selection
    if (userData.selectedFilterLists) {
        await chrome.storage.local.set({ selectedFilterLists: userData.selectedFilterLists });
    }
    
    // Restore filter lists data
    if (userData.filterLists) {
        await chrome.storage.local.set({ filterLists: userData.filterLists });
    }
    
    // Restore network whitelist
    if (userData.netWhitelist !== undefined) {
        await chrome.storage.local.set({ netWhitelist: userData.netWhitelist });
    }
    
    // Restore whitelist
    if (userData.whitelist) {
        await chrome.storage.local.set({ whitelist: userData.whitelist.join('\n') });
    }
    
    // Restore dynamic rules
    if (userData.dynamicRules) {
        await chrome.storage.local.set({ dynamicRules: userData.dynamicRules });
    }
    
    const lastRestoreFile = request.file || 'imported-backup.json';
    const lastRestoreTime = Date.now();
    const storageUsed = await chrome.storage.local.getBytesInUse(null);
    
    // Update restore metadata
    const localData = (await chrome.storage.local.get('localData')).localData || {};
    await chrome.storage.local.set({
        localData: {
            ...localData,
            lastRestoreFile,
            lastRestoreTime,
            storageUsed,
        },
    });
    
    // Reload filter lists to apply changes
    await reloadAllFilterLists();
    
    // Restart the extension to apply all changes
    chrome.runtime.reload();
    
    return {
        localData: {
            lastRestoreFile,
            lastRestoreTime,
            storageUsed,
        },
    };
};

const getLocalData = async () => {
    const storageUsed = await chrome.storage.local.getBytesInUse(null);
    const localData = (await chrome.storage.local.get('localData')).localData || {};
    const userSettings = (await chrome.storage.local.get('userSettings')).userSettings || {};
    
    return {
        storageUsed,
        lastBackupFile: localData.lastBackupFile || '',
        lastBackupTime: localData.lastBackupTime || 0,
        lastRestoreFile: localData.lastRestoreFile || '',
        lastRestoreTime: localData.lastRestoreTime || 0,
        cloudStorageSupported: userSettings.cloudStorageEnabled === true && typeof chrome.storage.sync !== 'undefined',
        privacySettingsSupported: typeof navigator !== 'undefined' && typeof navigator.connection !== 'undefined',
    };
};

const resetUserData = async () => {
    // Reset userSettings to defaults
    popupState.userSettings = { ...userSettingsDefault };
    await persistUserSettings();
    
    // Clear filter lists
    await chrome.storage.local.set({
        selectedFilterLists: [],
        filterLists: {},
        netWhitelist: '',
        whitelist: '',
        dynamicRules: [],
        permanentFirewallRules: [],
        sessionFirewallRules: [],
    });
    
    // Reset localData
    await chrome.storage.local.set({
        localData: {
            storageUsed: 0,
        },
    });
    
    // Reload filter lists
    await reloadAllFilterLists();
    
    return { success: true };
};

const getPickerContextPoint = (tabId: number, frameId = 0) => {
    const now = Date.now();
    const exact = pickerContextPoints.get(pickerContextPointKey(tabId, frameId));
    if ( exact && now - exact.timestamp < 10_000 ) {
        return exact;
    }
    const topFrame = pickerContextPoints.get(pickerContextPointKey(tabId, 0));
    if ( topFrame && now - topFrame.timestamp < 10_000 ) {
        return topFrame;
    }
    return undefined;
};

const launchPickerInTab = async (
    tabId: number,
    frameId = 0,
    boot: {
        initialPoint?: { x: number; y: number };
        target?: string;
        exactTarget?: { selector: string };
    } = {},
) => {
    if ( chrome.scripting?.executeScript === undefined ) {
        throw new Error('chrome.scripting.executeScript is unavailable');
    }
    const target = frameId !== 0
        ? { tabId, frameIds: [ frameId ] }
        : { tabId };
    await chrome.scripting.executeScript({
        target,
        func: (bootArgs: {
            initialPoint?: { x: number; y: number };
            target?: string;
            exactTarget?: { selector: string };
        }) => {
            (self as unknown as { __ubrPickerBoot?: typeof bootArgs }).__ubrPickerBoot = bootArgs;
        },
        args: [ boot ],
    });
    await chrome.scripting.executeScript({
        target,
        files: [
            '/js/scripting/tool-overlay.js',
            '/js/scripting/picker.js',
        ],
    });
};

const cloneObject = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const normalizeImportedLists = (value: unknown): string[] => {
    if ( Array.isArray(value) === false ) { return []; }
    return value
        .map(entry => typeof entry === 'string' ? entry.trim() : '')
        .filter(entry => entry !== '');
};

const normalizeSelectedFilterLists = (value: unknown): string[] => {
    if ( Array.isArray(value) === false ) { return []; }
    return value
        .map(entry => typeof entry === 'string' ? entry.trim() : '')
        .filter(entry => entry !== '');
};

const isValidExternalList = (value: string) =>
    /^[a-z-]+:\/\/(?:\S+\/\S*|\/\S+)/i.test(value);

const extractListURLs = (text: string): string[] => text
    .split(/\s+/)
    .map(line => line.trim())
    .filter(line => line !== '' && isValidExternalList(line));

const listSupportNameFromURL = (value: string): string => {
    try {
        return new URL(value).hostname;
    } catch {
        return '';
    }
};

const fetchFilterListCatalog = async (): Promise<Record<string, FilterListDetails>> => {
    const response = await fetch(chrome.runtime.getURL(FILTER_LIST_ASSETS_URL));
    const json = await response.json() as Record<string, FilterListDetails>;
    return json;
};

const deriveDefaultSelectedFilterLists = (available: Record<string, FilterListDetails>): string[] => {
    const selected = [ FILTER_LIST_USER_PATH ];
    for ( const [ key, details ] of Object.entries(available) ) {
        if ( key === FILTER_LIST_USER_PATH ) { continue; }
        if ( details.content !== 'filters' ) { continue; }
        if ( details.off === true ) { continue; }
        selected.push(key);
    }
    return selected;
};

const resolveBundledFilterListPath = (asset: FilterListDetails): string | undefined => {
    const contentURLs = Array.isArray(asset.contentURL)
        ? asset.contentURL
        : typeof asset.contentURL === 'string'
            ? [ asset.contentURL ]
            : [];
    return contentURLs.find(url => typeof url === 'string' && url.startsWith('assets/'));
};

const resolveStockAssetKeyFromURL = (
    catalog: Record<string, FilterListDetails>,
    urlKey: string,
): string => {
    const needle = urlKey.replace(/^https?:/, '');
    for ( const [ assetKey, asset ] of Object.entries(catalog) ) {
        if ( asset.content !== 'filters' ) { continue; }
        const contentURLs = Array.isArray(asset.contentURL)
            ? asset.contentURL
            : typeof asset.contentURL === 'string'
                ? [ asset.contentURL ]
                : [];
        for ( const contentURL of contentURLs ) {
            if ( contentURL.replace(/^https?:/, '') === needle ) {
                return assetKey;
            }
        }
    }
    return urlKey;
};

const buildAvailableFilterLists = (
    catalog: Record<string, FilterListDetails>,
    importedLists: string[],
    selectedListSet: Set<string>,
): Record<string, FilterListDetails> => {
    const available: Record<string, FilterListDetails> = {
        [FILTER_LIST_USER_PATH]: {
            content: 'filters',
            group: 'user',
            title: 'My filters',
            off: selectedListSet.has(FILTER_LIST_USER_PATH) === false,
        },
    };

    for ( const [ assetKey, asset ] of Object.entries(catalog) ) {
        if ( asset.content !== 'filters' ) { continue; }
        available[assetKey] = {
            ...cloneObject(asset),
            off: selectedListSet.has(assetKey) === false,
        };
    }

    for ( const importedList of importedLists ) {
        if ( available[importedList] !== undefined ) {
            available[importedList].off = selectedListSet.has(importedList) === false;
            continue;
        }
        available[importedList] = {
            content: 'filters',
            contentURL: importedList,
            external: true,
            group: 'custom',
            submitter: 'user',
            supportURL: importedList,
            supportName: listSupportNameFromURL(importedList),
            title: importedList,
            off: selectedListSet.has(importedList) === false,
        };
    }

    return available;
};

const estimateFilterCounts = (available: Record<string, FilterListDetails>) => {
    let netFilterCount = 0;
    let cosmeticFilterCount = 0;
    for ( const details of Object.values(available) ) {
        if ( details.off === true ) { continue; }
        netFilterCount += details.entryCount || 0;
        cosmeticFilterCount += details.entryUsedCount || 0;
    }
    return {
        netFilterCount,
        cosmeticFilterCount,
    };
};

const getFilterListState = async (): Promise<FilterListResponse> => {
    await ensurePopupState();
    const catalog = await fetchFilterListCatalog();
    const stored = await chrome.storage.local.get([
        'selectedFilterLists',
        'availableFilterLists',
        'userSettings',
    ]);
    const storedUserSettings = stored.userSettings || {};
    const importedLists = normalizeImportedLists(
        storedUserSettings.importedLists ?? popupState.userSettings.importedLists
    );
    const availableFromStorage = stored.availableFilterLists as Record<string, FilterListDetails> | undefined;
    let selectedFilterLists = normalizeSelectedFilterLists(stored.selectedFilterLists);

    if ( selectedFilterLists.length === 0 ) {
        if ( availableFromStorage && Object.keys(availableFromStorage).length !== 0 ) {
            selectedFilterLists = Object.entries(availableFromStorage)
                .filter(([, details]) => details?.content === 'filters' && details?.off !== true)
                .map(([ key ]) => key);
            if ( selectedFilterLists.includes(FILTER_LIST_USER_PATH) === false ) {
                selectedFilterLists.unshift(FILTER_LIST_USER_PATH);
            }
        } else {
            selectedFilterLists = deriveDefaultSelectedFilterLists(catalog);
            await chrome.storage.local.set({ selectedFilterLists });
        }
    }

    const selectedListSet = new Set(selectedFilterLists);
    selectedListSet.add(FILTER_LIST_USER_PATH);
    const available = buildAvailableFilterLists(catalog, importedLists, selectedListSet);
    const counts = estimateFilterCounts(available);

    await chrome.storage.local.set({
        availableFilterLists: available,
    });

    return {
        autoUpdate: storedUserSettings.autoUpdate ?? popupState.userSettings.autoUpdate,
        available,
        cache: {},
        cosmeticFilterCount: counts.cosmeticFilterCount,
        current: cloneObject(available),
        ignoreGenericCosmeticFilters:
            storedUserSettings.ignoreGenericCosmeticFilters ??
            popupState.userSettings.ignoreGenericCosmeticFilters,
        isUpdating: filterListsUpdating,
        netFilterCount: counts.netFilterCount,
        parseCosmeticFilters:
            storedUserSettings.parseAllABPHideFilters ??
            popupState.userSettings.parseAllABPHideFilters,
        suspendUntilListsAreLoaded:
            storedUserSettings.suspendUntilListsAreLoaded ??
            popupState.userSettings.suspendUntilListsAreLoaded,
        userFiltersPath: FILTER_LIST_USER_PATH,
    };
};

const applyFilterListSelection = async (payload: {
    toSelect?: string[];
    toImport?: string;
    toRemove?: string[];
}) => {
    await ensurePopupState();
    const catalog = await fetchFilterListCatalog();
    const stored = await chrome.storage.local.get([ 'selectedFilterLists', 'userSettings' ]);
    const currentUserSettings = {
        ...popupState.userSettings,
        ...(stored.userSettings || {}),
    };
    const importedSet = new Set(normalizeImportedLists(currentUserSettings.importedLists));
    const selectedSet = new Set(normalizeSelectedFilterLists(stored.selectedFilterLists));
    selectedSet.add(FILTER_LIST_USER_PATH);

    if ( Array.isArray(payload.toSelect) ) {
        selectedSet.clear();
        selectedSet.add(FILTER_LIST_USER_PATH);
        for ( const key of payload.toSelect ) {
            if ( typeof key === 'string' && key.trim() !== '' ) {
                selectedSet.add(key.trim());
            }
        }
    }

    if ( typeof payload.toImport === 'string' && payload.toImport.trim() !== '' ) {
        for ( const imported of extractListURLs(payload.toImport) ) {
            const resolved = resolveStockAssetKeyFromURL(catalog, imported);
            if ( resolved === imported ) {
                importedSet.add(imported);
            }
            selectedSet.add(resolved);
        }
    }

    if ( Array.isArray(payload.toRemove) ) {
        for ( const key of payload.toRemove ) {
            if ( typeof key !== 'string' || key.trim() === '' ) { continue; }
            const normalized = key.trim();
            importedSet.delete(normalized);
            selectedSet.delete(normalized);
        }
    }

    const nextUserSettings = {
        ...currentUserSettings,
        importedLists: Array.from(importedSet).sort(),
    };
    popupState.userSettings = nextUserSettings;
    await chrome.storage.local.set({
        selectedFilterLists: Array.from(selectedSet),
        userSettings: nextUserSettings,
    });

    // Sync filter list rules to DNR
    await syncFilterListDnrRules();

    return getFilterListState();
};

const reloadAllFilterLists = async () => {
    filterListsUpdating = true;
    try {
        // Sync filter list rules to DNR
        await syncFilterListDnrRules();
        return await getFilterListState();
    } finally {
        filterListsUpdating = false;
    }
};

const updateFilterListsNow = async (payload?: { assetKeys?: string[]; preferOrigin?: boolean }) => {
    void payload;
    filterListsUpdating = true;
    try {
        // Sync filter list rules to DNR
        await syncFilterListDnrRules();
        return await getFilterListState();
    } finally {
        filterListsUpdating = false;
    }
};

type StoredCosmeticFilterData = {
    genericCosmeticFilters: Array<{ key?: number; selector?: string }>;
    genericCosmeticExceptions: Array<{ key?: number; selector?: string }>;
    specificCosmeticFilters: Array<[string, {
        key?: number;
        matches?: string[];
        excludeMatches?: string[];
        rejected?: boolean;
    }]>;
    scriptletFilters: Array<[string, {
        args?: string[];
        matches?: string[];
        excludeMatches?: string[];
        trustedSource?: boolean;
    }]>;
};

const serializeCosmeticFilterData = (dnrData: any): StoredCosmeticFilterData => ({
    genericCosmeticFilters: Array.isArray(dnrData?.genericCosmeticFilters)
        ? dnrData.genericCosmeticFilters
        : [],
    genericCosmeticExceptions: Array.isArray(dnrData?.genericCosmeticExceptions)
        ? dnrData.genericCosmeticExceptions
        : [],
    specificCosmeticFilters: dnrData?.specificCosmetic instanceof Map
        ? Array.from(dnrData.specificCosmetic.entries())
        : Array.isArray(dnrData?.specificCosmetic)
            ? dnrData.specificCosmetic
            : [],
    scriptletFilters: dnrData?.scriptlet instanceof Map
        ? Array.from(dnrData.scriptlet.entries())
        : Array.isArray(dnrData?.scriptlet)
            ? dnrData.scriptlet
            : [],
});

const parseStoredCosmeticFilterData = (raw: unknown): StoredCosmeticFilterData => {
    let parsed = raw;
    if ( typeof parsed === 'string' && parsed !== '' ) {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = {};
        }
    }
    const data = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    return {
        genericCosmeticFilters: Array.isArray(data.genericCosmeticFilters)
            ? data.genericCosmeticFilters as StoredCosmeticFilterData['genericCosmeticFilters']
            : [],
        genericCosmeticExceptions: Array.isArray(data.genericCosmeticExceptions)
            ? data.genericCosmeticExceptions as StoredCosmeticFilterData['genericCosmeticExceptions']
            : [],
        specificCosmeticFilters: Array.isArray(data.specificCosmeticFilters)
            ? data.specificCosmeticFilters as StoredCosmeticFilterData['specificCosmeticFilters']
            : [],
        scriptletFilters: Array.isArray(data.scriptletFilters)
            ? data.scriptletFilters as StoredCosmeticFilterData['scriptletFilters']
            : [],
    };
};

const hostnameMatchesFilterScope = (pageHostname: string, scope: string): boolean => {
    if ( scope === '*' ) { return true; }
    if ( scope === pageHostname ) { return true; }
    return pageHostname.endsWith(`.${scope}`);
};

const buildSpecificCosmeticPayload = (
    pageHostname: string,
    storedData: StoredCosmeticFilterData,
) => {
    const injectedSelectors: string[] = [];
    for ( const entry of storedData.specificCosmeticFilters ) {
        if ( Array.isArray(entry) === false || entry.length < 2 ) { continue; }
        const [ selector, details ] = entry;
        if ( typeof selector !== 'string' || selector === '' ) { continue; }
        if ( selector.startsWith('{') ) { continue; }
        if ( details?.rejected === true ) { continue; }
        const matches = Array.isArray(details?.matches) ? details.matches : [];
        const excludeMatches = Array.isArray(details?.excludeMatches) ? details.excludeMatches : [];
        const included = matches.length === 0
            ? true
            : matches.some(scope => hostnameMatchesFilterScope(pageHostname, scope));
        if ( included === false ) { continue; }
        const excluded = excludeMatches.some(scope => hostnameMatchesFilterScope(pageHostname, scope));
        if ( excluded ) { continue; }
        injectedSelectors.push(selector);
    }

    const injectedCSS = injectedSelectors.length === 0
        ? ''
        : `${injectedSelectors.join(',\n')}\n{display:none!important;}`;

    return {
        ready: true,
        injectedCSS,
        proceduralFilters: [] as string[],
        exceptionFilters: [] as string[],
        exceptedFilters: [] as string[],
        convertedProceduralFilters: [] as unknown[],
        genericCosmeticHashes: storedData.genericCosmeticFilters
            .map(filter => filter?.key)
            .filter((key): key is number => typeof key === 'number'),
        disableSurveyor: false,
    };
};

// Sync filter list network rules to Chrome DNR
const syncFilterListDnrRules = async (): Promise<void> => {
    if ( chrome.declarativeNetRequest === undefined ) { 
        console.log('[DNR] DNR not available');
        return; 
    }
    
    try {
        // Get selected filter lists
        const stored = await chrome.storage.local.get([
            'selectedFilterLists',
            'availableFilterLists',
            'userSettings',
        ]);
        let selectedLists = normalizeSelectedFilterLists(stored.selectedFilterLists);
        
        console.log('[DNR] Selected lists:', selectedLists);
        
        // Always ensure we have default filter lists selected
        if ( selectedLists.length === 0 ) {
            const catalogForDefaults = await fetchFilterListCatalog();
            selectedLists = deriveDefaultSelectedFilterLists(catalogForDefaults);
            const storedUserSettings = stored.userSettings || {};
            const importedLists = normalizeImportedLists(storedUserSettings.importedLists);
            const selectedListSet = new Set(selectedLists);
            selectedListSet.add(FILTER_LIST_USER_PATH);
            const available = buildAvailableFilterLists(
                catalogForDefaults,
                importedLists,
                selectedListSet,
            );
            await chrome.storage.local.set({
                selectedFilterLists: selectedLists,
                availableFilterLists: available,
            });
            console.log('[DNR] Bootstrapped default filter lists:', selectedLists);
        }

        // Force refresh selected lists from storage after potential bootstrap
        const refreshedStorage = await chrome.storage.local.get('selectedFilterLists');
        selectedLists = normalizeSelectedFilterLists(refreshedStorage.selectedFilterLists);
        console.log('[DNR] Final selected lists:', selectedLists);

        // Get catalog
        const catalog = await fetchFilterListCatalog();
        console.log('[DNR] Catalog keys count:', Object.keys(catalog).length);
        
        // For MV3 first run, generate simple blocking rules for common ad patterns
        // This ensures we have some rules even if CDN is unreachable
        const generateFallbackRules = (): chrome.declarativeNetRequest.Rule[] => {
            const rules: chrome.declarativeNetRequest.Rule[] = [];
            const baseId = 100;
            
            // Common ad domains to block
            const adDomains = [
                'doubleclick.net',
                'googlesyndication.com',
                'googleadservices.com',
                'adnxs.com',
                'adsrvr.org',
                'criteo.com',
                'pubmatic.com',
                'rubiconproject.com',
                'openx.net',
                'advertising.com',
            ];
            
            for (let i = 0; i < adDomains.length; i++) {
                rules.push({
                    id: baseId + i,
                    priority: 1,
                    action: { type: 'block' },
                    condition: {
                        urlFilter: `||${adDomains[i]}^`,
                        resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'xmlhttprequest', 'websocket', 'other'],
                    },
                });
            }
            
            return rules;
        };
        
        // Load filter list content
        const filterLists: { key: string; text: string }[] = [];
        for ( const listKey of selectedLists ) {
            if ( listKey === FILTER_LIST_USER_PATH ) {
                // Get user filters from storage
                const userFiltersStored = await chrome.storage.local.get('userFilters');
                const userFilters = typeof userFiltersStored.userFilters === 'string' 
                    ? userFiltersStored.userFilters 
                    : '';
                if ( userFilters ) {
                    filterLists.push({ key: FILTER_LIST_USER_PATH, text: userFilters });
                    console.log('[DNR] Loaded user filters:', userFilters.length, 'chars');
                }
                continue;
            }
            
            const asset = catalog[listKey];
            if ( !asset ) { 
                console.log('[DNR] Skipping list (missing catalog entry):', listKey);
                continue; 
            }
            
            let bundledPath = resolveBundledFilterListPath(asset);
            let filterText = '';
            
            // First try bundled asset
            if ( bundledPath !== undefined ) {
                try {
                    const response = await fetch(chrome.runtime.getURL(bundledPath));
                    if ( response.ok ) {
                        filterText = await response.text();
                        filterLists.push({ key: listKey, text: filterText });
                        console.log('[DNR] Loaded from bundled:', listKey, filterText.length, 'chars');
                    } else {
                        console.log('[DNR] Bundled load failed:', listKey, response.status);
                    }
                } catch ( e ) {
                    console.warn('[DNR] Failed to load bundled:', listKey, e);
                }
            }
            
            // If no bundled text, try CDN URL as fallback
            if ( filterText === '' && asset.cdnURLs && asset.cdnURLs.length > 0 ) {
                console.log('[DNR] Trying CDN for:', listKey);
                try {
                    const response = await fetch(asset.cdnURLs[0]);
                    if ( response.ok ) {
                        filterText = await response.text();
                        filterLists.push({ key: listKey, text: filterText });
                        console.log('[DNR] Loaded from CDN:', listKey, filterText.length, 'chars');
                    } else {
                        console.log('[DNR] CDN load failed:', listKey, response.status);
                    }
                } catch ( e ) {
                    console.warn('[DNR] Failed to load from CDN:', listKey, e);
                }
            }
            
            if ( filterText === '' ) {
                console.log('[DNR] Skipping list (no content loaded):', listKey);
            }
        }

        console.log('[DNR] Total lists loaded:', filterLists.length);
        
        let dnrData: any = null;
        
        if ( filterLists.length === 0 ) {
            console.log('[DNR] No filter lists loaded, using fallback rules');
            // Use fallback rules when no lists can be loaded
        } else {
            console.log('[DNR] Compiling', filterLists.length, 'filter lists to DNR rules...');

            // Import the DNR conversion function (from built JS)
            const { dnrRulesetFromRawLists } = await import('../static-dnr-filtering.js');
            
            console.log('[DNR] Input lists:', filterLists.map(f => ({ key: f.key, textLen: f.text.length })));
            
            // Compile to DNR rules
            dnrData = await dnrRulesetFromRawLists(
                filterLists.map(f => ({ text: f.text })),
                { env: [] }
            );
            
            console.log('[DNR] Raw result keys:', Object.keys(dnrData || {}));
            console.log('[DNR] genericCosmeticFilters:', dnrData?.genericCosmeticFilters?.length);
            console.log('[DNR] specificCosmetic (Map):', dnrData?.specificCosmetic instanceof Map);
            if (dnrData?.specificCosmetic instanceof Map) {
                console.log('[DNR] specificCosmetic size:', dnrData.specificCosmetic.size);
                console.log('[DNR] specificCosmetic sample:', Array.from(dnrData.specificCosmetic.entries()).slice(0, 3));
            }

            console.log('[DNR] Result:', dnrData);
        }
        
        let addRules: chrome.declarativeNetRequest.Rule[] = [];
        
        if ( dnrData?.network?.ruleset && dnrData.network.ruleset.length > 0 ) {
            console.log('[DNR] Generated rules:', dnrData.network.ruleset.length);

            // Get existing rules and remove old filter list rules (ID range 100-9999)
            const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
            const removeRuleIds = existingRules
                .map(rule => rule.id)
                .filter(id => id >= 100 && id < 10000);

            // Assign IDs to new rules (start at 100 to avoid conflicts with firewall rules)
            addRules = dnrData.network.ruleset.map((rule: any, index: number) => ({
                ...rule,
                id: 100 + index,
            })).slice(0, 3000); // Chrome DNR limit is 3000 dynamic rules
            
            // Update DNR
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
            console.log('[DNR] Installed', addRules.length, 'filter list rules');
            
            // Store cosmetic filters for content script access
            const cosmeticFiltersData = serializeCosmeticFilterData(dnrData);
            await chrome.storage.local.set({ cosmeticFiltersData: JSON.stringify(cosmeticFiltersData) });
            console.log('[DNR] Stored cosmetic filters:', 
                cosmeticFiltersData.genericCosmeticFilters.length, 'generic,',
                cosmeticFiltersData.specificCosmeticFilters.length, 'specific');
        } else {
            // Fallback: Install basic blocking rules even if filter lists couldn't load
            console.log('[DNR] No rules from filter lists, installing fallback blocking rules');
            const fallbackRules = generateFallbackRules();
            const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
            const removeRuleIds = existingRules
                .map(rule => rule.id)
                .filter(id => id >= 100 && id < 10000);
            
            if (removeRuleIds.length > 0) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds });
            }
            
            await chrome.declarativeNetRequest.updateDynamicRules({ addRules: fallbackRules });
            console.log('[DNR] Installed', fallbackRules.length, 'fallback rules');
        }
        
    } catch ( e ) {
        console.error('[DNR] Failed to sync filter list rules:', e);
    }
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
        if ( type === 'inline-script' ) {
            if ( nextRuleId > FIREWALL_RULE_ID_MAX ) { break; }
            const condition: chrome.declarativeNetRequest.RuleCondition = {
                resourceTypes: [
                    'main_frame' as chrome.declarativeNetRequest.ResourceType,
                    'sub_frame' as chrome.declarativeNetRequest.ResourceType,
                ],
            };
            if ( srcHostname !== '*' ) {
                condition.requestDomains = [ srcHostname ];
            }
            addRules.push({
                id: nextRuleId++,
                priority: 2_000_000 +
                    ((actionName === 'allow' || actionName === 'noop') ? 10_000 : 0) +
                    (srcHostname !== '*' ? 1_000 : 0),
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: [{
                        header: 'content-security-policy',
                        operation: 'set',
                        value: actionName === 'block'
                            ? "script-src 'self' 'unsafe-eval' http: https: data: blob:; object-src 'none'; base-uri 'self'"
                            : "script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https: data: blob:; object-src 'none'; base-uri 'self'",
                    }],
                },
                condition,
            });
            continue;
        }
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
    
    // Validate addRules before updating
    const addRules = compileFirewallRulesToDnr(popupState.sessionFirewall);
    if (!Array.isArray(addRules)) {
        console.warn('[MV3] syncFirewallDnrRules: invalid addRules');
        return;
    }
    for (const rule of addRules) {
        if (!rule.id || !rule.action?.type || !rule.condition) {
            console.warn('[MV3] syncFirewallDnrRules: invalid rule', rule);
            return;
        }
    }
    
    // Check rule count limit (Chrome max is 30000 rules)
    const MAX_DNR_RULES = 30000;
    if (addRules.length > MAX_DNR_RULES) {
        console.warn('[MV3] syncFirewallDnrRules: rule count exceeds limit', addRules.length);
        // Truncate rules to fit limit
        addRules.length = MAX_DNR_RULES;
    }
    
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= FIREWALL_RULE_ID_MIN && id <= FIREWALL_RULE_ID_MAX);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
};

const compileWhitelistRulesToDnr = (whitelist: string[]): chrome.declarativeNetRequest.Rule[] => {
    const escapeRegex = (value: string) => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let nextRuleId = WHITELIST_RULE_ID_MIN;

    for ( const pattern of whitelist ) {
        if ( nextRuleId > WHITELIST_RULE_ID_MAX ) { break; }
        if ( typeof pattern !== 'string' || pattern.length === 0 ) { continue; }
        if ( pattern.startsWith('#') ) { continue; }

        let regex = pattern;
        if ( regex.startsWith('||') ) {
            regex = '^https?://([^/]+\\.)?' + regex.slice(2);
        } else if ( regex.startsWith('|') ) {
            regex = '^' + regex.slice(1);
        } else if ( regex.endsWith('|') ) {
            regex = regex.slice(0, -1) + '$';
        }
        regex = escapeRegex(regex).replace(/\\\*/g, '.*');

        rules.push({
            id: nextRuleId++,
            priority: 3,
            action: { type: 'allow' },
            condition: {
                urlFilter: regex || '.*',
                domainType: 'thirdParty',
            },
        });
    }

    return rules;
};

const syncWhitelistDnrRules = async () => {
    if ( chrome.declarativeNetRequest === undefined ) { return; }
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= WHITELIST_RULE_ID_MIN && id <= WHITELIST_RULE_ID_MAX);
    const addRules = compileWhitelistRulesToDnr(popupState.whitelist || []);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
};

const compilePowerSwitchDnrRules = (perSiteFiltering: Record<string, boolean>) => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    let nextRuleId = POWER_RULE_ID_MIN;
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for ( const [ scopeKey, enabled ] of Object.entries(perSiteFiltering).sort(([ a ], [ b ]) => a.localeCompare(b)) ) {
        if ( enabled !== false ) { continue; }
        if ( nextRuleId > POWER_RULE_ID_MAX ) { break; }

        const separator = scopeKey.indexOf(':http');
        const isPageScoped = separator !== -1;
        const hostname = isPageScoped ? scopeKey.slice(0, separator) : scopeKey;
        const scopedURL = isPageScoped ? scopeKey.slice(separator + 1) : '';

        const condition: chrome.declarativeNetRequest.RuleCondition = {
            resourceTypes: [
                'main_frame' as chrome.declarativeNetRequest.ResourceType,
                'sub_frame' as chrome.declarativeNetRequest.ResourceType,
            ],
        };

        if ( isPageScoped ) {
            condition.regexFilter = `^${escapeRegex(scopedURL)}$`;
        } else if ( hostname !== '' ) {
            condition.requestDomains = [ hostname ];
        } else {
            continue;
        }

        addRules.push({
            id: nextRuleId++,
            priority: 3_000_000,
            action: { type: 'allowAllRequests' },
            condition,
        });
    }

    return addRules;
};

const syncPowerSwitchDnrRules = async () => {
    if ( chrome.declarativeNetRequest === undefined ) { return; }
    const stored = await chrome.storage.local.get('perSiteFiltering');
    const perSiteFiltering: Record<string, boolean> = stored?.perSiteFiltering || {};
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= POWER_RULE_ID_MIN && id <= POWER_RULE_ID_MAX);
    const addRules = compilePowerSwitchDnrRules(perSiteFiltering);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
};

const getHostnameSwitchState = async (): Promise<HostnameSwitchState> => {
    const stored = await chrome.storage.local.get([
        'hostnameSwitches',
        'hostnameSwitchesVersion',
    ]);
    if ( stored?.hostnameSwitchesVersion !== HOSTNAME_SWITCHES_SCHEMA_VERSION ) {
        // Older builds wrote unstable hostname-switch state. Reset it once so
        // the controls start from a clean default and then persist correctly.
        await chrome.storage.local.set({
            hostnameSwitches: {},
            hostnameSwitchesVersion: HOSTNAME_SWITCHES_SCHEMA_VERSION,
        });
        return {};
    }
    const hostnameSwitches = stored?.hostnameSwitches;
    return hostnameSwitches && typeof hostnameSwitches === 'object'
        ? hostnameSwitches as HostnameSwitchState
        : {};
};

const cloneHostnameSwitchState = (state: HostnameSwitchState): HostnameSwitchState =>
    structuredClone(state);

const hostnameSwitchesEqual = (a: HostnameSwitchState, b: HostnameSwitchState, hostname: string) => {
    const names = Array.from(hostnameSwitchNames);
    return names.every(name => (a[hostname]?.[name] === true) === (b[hostname]?.[name] === true));
};

const persistPermanentHostnameSwitches = async () => {
    await chrome.storage.local.set({
        hostnameSwitches: popupState.permanentHostnameSwitches,
        hostnameSwitchesVersion: HOSTNAME_SWITCHES_SCHEMA_VERSION,
    });
};

const persistURLFilteringRules = async () => {
    const stored = await chrome.storage.local.get('urlFilteringRules');
    const rules = stored?.urlFilteringRules || [];
    await chrome.storage.local.set({ permanentURLFiltering: rules });
};

const compileHostnameSwitchDnrRules = (hostnameSwitches: HostnameSwitchState) => {
    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    let nextRuleId = HOSTNAME_SWITCH_RULE_ID_MIN;

    for ( const hostname of Object.keys(hostnameSwitches).sort() ) {
        const switches = hostnameSwitches[hostname];
        if ( switches?.['no-scripting'] === true && nextRuleId <= HOSTNAME_SWITCH_RULE_ID_MAX ) {
            addRules.push({
                id: nextRuleId++,
                priority: 2_100_000,
                action: { type: 'block' },
                condition: {
                    initiatorDomains: [ hostname ],
                    resourceTypes: [ 'script' ],
                },
            });
            if ( nextRuleId <= HOSTNAME_SWITCH_RULE_ID_MAX ) {
                addRules.push({
                    id: nextRuleId++,
                    priority: 2_100_001,
                    action: {
                        type: 'modifyHeaders',
                        responseHeaders: [{
                            header: 'content-security-policy',
                            operation: 'set',
                            value: "script-src 'none'; object-src 'none'; base-uri 'self'",
                        }],
                    },
                    condition: {
                        requestDomains: [ hostname ],
                        resourceTypes: [
                            'main_frame' as chrome.declarativeNetRequest.ResourceType,
                            'sub_frame' as chrome.declarativeNetRequest.ResourceType,
                        ],
                    },
                });
            }
        }
        if ( switches?.['no-remote-fonts'] === true && nextRuleId <= HOSTNAME_SWITCH_RULE_ID_MAX ) {
            addRules.push({
                id: nextRuleId++,
                priority: 2_100_010,
                action: { type: 'block' },
                condition: {
                    initiatorDomains: [ hostname ],
                    resourceTypes: [ 'font' ],
                },
            });
        }
        if ( switches?.['no-large-media'] === true && nextRuleId <= HOSTNAME_SWITCH_RULE_ID_MAX ) {
            addRules.push({
                id: nextRuleId++,
                priority: 2_100_020,
                action: { type: 'block' },
                condition: {
                    initiatorDomains: [ hostname ],
                    resourceTypes: [ 'media' ],
                },
            });
        }
    }

    return addRules;
};

const syncHostnameSwitchDnrRules = async () => {
    if ( chrome.declarativeNetRequest === undefined ) { return; }
    
    const addRules = compileHostnameSwitchDnrRules(popupState.sessionHostnameSwitches);
    if (!Array.isArray(addRules)) {
        console.warn('[MV3] syncHostnameSwitchDnrRules: invalid addRules');
        return;
    }
    
    // Check rule count limit (Chrome max is 30000 rules)
    const MAX_DNR_RULES = 30000;
    if (addRules.length > MAX_DNR_RULES) {
        console.warn('[MV3] syncHostnameSwitchDnrRules: rule count exceeds limit', addRules.length);
        addRules.length = MAX_DNR_RULES;
    }
    
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= HOSTNAME_SWITCH_RULE_ID_MIN && id <= HOSTNAME_SWITCH_RULE_ID_MAX);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
};

const applyMainWorldPopupBlock = async (tabId: number, enabled: boolean) => {
    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            world: 'MAIN',
            func: (isEnabled: boolean) => {
                const key = '__ubrOriginalWindowOpen';
                const clickKey = '__ubrPopupClickBlocker';
                const countKey = '__ubrPopupBlockedCount';
                const win = window as Window & Record<string, any>;
                if ( isEnabled ) {
                    if ( typeof win[countKey] !== 'number' ) {
                        win[countKey] = 0;
                    }
                    if ( typeof win[key] !== 'function' ) {
                        win[key] = window.open.bind(window);
                    }
                    window.open = function() {
                        win[countKey] += 1;
                        return null;
                    } as typeof window.open;
                    if ( typeof win[clickKey] !== 'function' ) {
                        win[clickKey] = (event: MouseEvent) => {
                            const target = event.target as Element | null;
                            const anchor = target?.closest?.('a[target]:not([target="_self"])') as HTMLAnchorElement | null;
                            if ( anchor === null ) { return; }
                            win[countKey] += 1;
                            event.preventDefault();
                            event.stopImmediatePropagation();
                        };
                        document.addEventListener('click', win[clickKey], true);
                    }
                    return;
                }
                if ( typeof win[key] === 'function' ) {
                    window.open = win[key];
                    delete win[key];
                }
                if ( typeof win[clickKey] === 'function' ) {
                    document.removeEventListener('click', win[clickKey], true);
                    delete win[clickKey];
                }
            },
            args: [ enabled ],
        });
    } catch {
    }
};

const getTabSwitchMetrics = async (tabId: number): Promise<TabSwitchMetrics> => {
    if ( chrome.scripting?.executeScript === undefined ) {
        return {
            popupBlockedCount: 0,
            largeMediaCount: 0,
            remoteFontCount: 0,
            scriptCount: 0,
        };
    }
    try {
        const [ result ] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                const win = window as Window & Record<string, any>;
                const popupBlockedCount = typeof win.__ubrPopupBlockedCount === 'number'
                    ? win.__ubrPopupBlockedCount
                    : 0;
                const largeMediaCount = document.querySelectorAll('video, audio').length;
                const scriptCount = document.scripts.length;
                const remoteFontCount = performance
                    .getEntriesByType('resource')
                    .filter(entry => {
                        const name = entry.name || '';
                        return (
                            entry.initiatorType === 'font' ||
                            /\.(woff2?|ttf|otf|eot)(?:$|[?#])/i.test(name) ||
                            /fonts\.(gstatic|googleapis)\.com/i.test(name)
                        );
                    })
                    .length;
                return {
                    popupBlockedCount,
                    largeMediaCount,
                    remoteFontCount,
                    scriptCount,
                };
            },
        });
        return (result?.result as TabSwitchMetrics | undefined) || {
            popupBlockedCount: 0,
            largeMediaCount: 0,
            remoteFontCount: 0,
            scriptCount: 0,
        };
    } catch {
        return {
            popupBlockedCount: 0,
            largeMediaCount: 0,
            remoteFontCount: 0,
            scriptCount: 0,
        };
    }
};

const getHiddenElementCountForTab = async (tabId: number): Promise<number> => {
    if ( chrome.scripting?.executeScript === undefined ) { return 0; }
    try {
        const [ result ] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => Array.from(document.querySelectorAll('body *'))
                .reduce((count, element) => {
                    const style = getComputedStyle(element);
                    return (
                        style.display === 'none' ||
                        style.visibility === 'hidden' ||
                        (element as HTMLElement).hidden
                    )
                        ? count + 1
                        : count;
                }, 0),
        });
        return typeof result?.result === 'number' ? result.result : 0;
    } catch {
        return 0;
    }
};

const applyPersistedHostnameSwitchesForTab = async (tabId: number, url?: string) => {
    let hostname = '';
    try {
        if ( typeof url === 'string' && url !== '' ) {
            hostname = new URL(url).hostname;
        } else {
            const tab = await chrome.tabs.get(tabId);
            hostname = tab.url ? new URL(tab.url).hostname : '';
        }
    } catch {
        hostname = '';
    }
    if ( hostname === '' ) { return; }
    const hostnameSwitches = await getHostnameSwitchState();
    const switches = hostnameSwitches[hostname];
    if ( switches === undefined ) { return; }
    for ( const name of hostnameSwitchNames ) {
        if ( switches[name] === true ) {
            await applyImmediateHostnameSwitchEffects(tabId, name, true);
        }
    }
};

const applyImmediateHostnameSwitchEffects = async (tabId: number, name: string, enabled: boolean) => {
    try {
        const result = chrome.tabs.sendMessage(tabId, {
            topic: 'uBlockHostnameSwitch',
            payload: { name, enabled },
        }) as Promise<unknown> | undefined;
        result?.catch(() => {});
    } catch {
    }

    if ( name === 'no-popups' ) {
        await applyMainWorldPopupBlock(tabId, enabled);
        return;
    }

    if ( name === 'no-remote-fonts' ) {
        const css = 'html, body, body * { font-family: system-ui, sans-serif !important; }';
        try {
            if ( enabled ) {
                await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, css });
            } else {
                await chrome.scripting.removeCSS({ target: { tabId, allFrames: true }, css });
            }
        } catch {
        }
        return;
    }

    if ( name === 'no-large-media' ) {
        const css = 'video, audio { display: none !important; }';
        try {
            if ( enabled ) {
                await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, css });
            } else {
                await chrome.scripting.removeCSS({ target: { tabId, allFrames: true }, css });
            }
        } catch {
        }
    }
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
        startedAt: Date.now(),
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

const persistGlobalRequestCounts = async () => {
    await chrome.storage.local.set({
        globalAllowedRequestCount: popupState.globalAllowedRequestCount,
        globalBlockedRequestCount: popupState.globalBlockedRequestCount,
    });
    void updateBadge();
};

const updateBadge = async () => {
    if ( chrome.action === undefined ) { return; }
    const count = popupState.globalBlockedRequestCount;
    if ( count > 0 ) {
        const displayCount = count > 999 ? '999+' : count.toString();
        await chrome.action.setBadgeText({ text: displayCount });
        await chrome.action.setBadgeBackgroundColor({ color: '#cc0000' });
    } else {
        await chrome.action.setBadgeText({ text: '' });
    }
};

const updateToolbarIcon = async (tabId: number, options: { filtering?: boolean; clickToLoad?: string }): Promise<void> => {
    try {
        // Get current state from storage
        const stored = await chrome.storage.local.get('tabIdToDetails');
        let currentParts = stored?.tabIdToDetails?.[tabId] || 0b0111;
        
        if (options.filtering === false) {
            currentParts = 0b0100; // hide badge = true, color = 0, text = 0
        } else if (options.filtering === true) {
            currentParts = 0b0111; // show all
        }
        
        // Store updated state
        const tabDetails = stored?.tabIdToDetails || {};
        tabDetails[tabId] = currentParts;
        await chrome.storage.local.set({ tabIdToDetails: tabDetails });
        
        // Get per-site filtering state for this tab
        const tab = await chrome.tabs.get(tabId);
        if (!tab?.url) return;
        
        const hostname = new URL(tab.url).hostname;
        const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
        const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
        
        // Check if filtering is enabled for this site
        const isFilteringEnabled = perSiteFiltering[hostname] !== false;
        
        // Update badge to reflect filtering state
        if (isFilteringEnabled && (currentParts & 0b001)) {
            const blockedCount = popupState.tabMetrics?.[tabId]?.blocked || 0;
            if (blockedCount > 0) {
                await chrome.action.setBadgeText({ text: blockedCount > 999 ? '999+' : String(blockedCount) });
                await chrome.action.setBadgeBackgroundColor({ color: '#cc0000' });
            } else {
                await chrome.action.setBadgeText({ text: '' });
            }
        } else if (!isFilteringEnabled) {
            await chrome.action.setBadgeText({ text: 'off', tabId });
            await chrome.action.setBadgeBackgroundColor({ color: '#888888', tabId });
        } else {
            await chrome.action.setBadgeText({ text: '' });
        }
        
        // Store click-to-load allowance
        if (options.clickToLoad) {
            const stored = await chrome.storage.local.get('clickToLoadAllowances');
            const allowances = stored?.clickToLoadAllowances || {};
            if (!allowances[tabId]) allowances[tabId] = [];
            if (!allowances[tabId].includes(options.clickToLoad)) {
                allowances[tabId].push(options.clickToLoad);
                await chrome.storage.local.set({ clickToLoadAllowances: allowances });
            }
        }
    } catch (e) {
        console.log('[MV3] updateToolbarIcon error:', e);
    }
};

const incrementCounts = (
    counts: FirewallCounts,
    resourceType: chrome.webRequest.ResourceType,
    blocked: boolean = false,
) => {
    if (blocked) {
        counts.blocked.any += 1;
        if ( resourceType === 'script' ) {
            counts.blocked.script += 1;
        } else if ( resourceType === 'sub_frame' ) {
            counts.blocked.frame += 1;
        }
    } else {
        counts.allowed.any += 1;
        if ( resourceType === 'script' ) {
            counts.allowed.script += 1;
        } else if ( resourceType === 'sub_frame' ) {
            counts.allowed.frame += 1;
        }
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
            startedAt: typeof (details as { timeStamp?: number }).timeStamp === 'number'
                ? (details as { timeStamp?: number }).timeStamp as number
                : Date.now(),
            pageHostname: hostname,
            pageCounts: createCounts(),
            hostnameDict: {},
        };
        state.hostnameDict[hostname] = zeroHostnameDetails(hostname);
        incrementCounts(state.pageCounts, details.type);
        incrementCounts(state.hostnameDict[hostname].counts, details.type);
        tabRequestStates.set(details.tabId, state);
        popupState.globalAllowedRequestCount += 1;
        void Promise.all([
            persistTabRequestState(details.tabId),
            persistGlobalRequestCounts(),
        ]);
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

const trackPendingRequest = (details: chrome.webRequest.WebRequestBodyDetails) => {
    if ( details.tabId < 0 ) { return; }
    if ( details.type === 'main_frame' ) {
        recordTabRequest(details);
    }
};

const finalizeTrackedRequest = async (
    details: chrome.webRequest.WebResponseCacheDetails | chrome.webRequest.WebResponseErrorDetails,
    blocked: boolean,
) => {
    if ( details.tabId < 0 || details.type === 'main_frame' ) { return; }
    if (
        blocked &&
        details.error !== 'net::ERR_BLOCKED_BY_CLIENT' &&
        details.error !== 'ERR_BLOCKED_BY_CLIENT'
    ) {
        return;
    }

    let hostname = '';
    try {
        hostname = new URL(details.url).hostname;
    } catch {
        return;
    }

    const state = ensureTabRequestState(details.tabId);
    if ( state.hostnameDict[hostname] === undefined ) {
        state.hostnameDict[hostname] = zeroHostnameDetails(hostname);
    }
    incrementCounts(state.pageCounts, details.type, blocked);
    incrementCounts(state.hostnameDict[hostname].counts, details.type, blocked);
    if ( blocked ) {
        popupState.globalBlockedRequestCount += 1;
    } else {
        popupState.globalAllowedRequestCount += 1;
    }
    await Promise.all([
        persistTabRequestState(details.tabId),
        persistGlobalRequestCounts(),
    ]);
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
                scanElements('link[href]', 'href', 'other');
                scanElements('video[src]', 'src', 'other');
                scanElements('audio[src]', 'src', 'other');
                scanElements('source[src]', 'src', 'other');
                scanElements('embed[src]', 'src', 'other');
                scanElements('object[data]', 'data', 'other');

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

const getMatchedBlockedRequestCountForTab = async (
    tabId: number,
    minTimeStamp = 0,
): Promise<number | undefined> => {
    if ( chrome.declarativeNetRequest?.getMatchedRules === undefined ) {
        return;
    }
    try {
        const result = await chrome.declarativeNetRequest.getMatchedRules({
            tabId,
            minTimeStamp,
        });
        const rulesMatchedInfo = Array.isArray(result?.rulesMatchedInfo)
            ? result.rulesMatchedInfo
            : [];
        return rulesMatchedInfo.length;
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

    const pageStore = tabId > 0 ? await pageStoreFromTabId(tabId) : null;

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
    if ( pageStore ) {
        const hostnameDetailsMap = pageStore.getAllHostnameDetails();
        if ( hostnameDetailsMap ) {
            for ( const [ hostname, details ] of hostnameDetailsMap ) {
                hostnameDict[hostname] = cloneHostnameDetails({
                    domain: (details as any).domain || hostname,
                    counts: (details as any).counts || createCounts(),
                    cname: (details as any).cname,
                });
            }
        }
    }
    if ( trackedState?.hostnameDict ) {
        for ( const [ hostname, details ] of Object.entries(trackedState.hostnameDict) ) {
            if ( hostnameDict[hostname] === undefined ) {
                hostnameDict[hostname] = cloneHostnameDetails(details);
            }
        }
    }
    if ( liveState?.hostnameDict ) {
        for ( const [ hostname, details ] of Object.entries(liveState.hostnameDict) ) {
            if ( hostnameDict[hostname] === undefined ) {
                hostnameDict[hostname] = cloneHostnameDetails(details);
                continue;
            }
            if ( trackedState === undefined ) {
                mergeCounts(hostnameDict[hostname].counts, details.counts);
            }
        }
    }

    let pageCounts = pageStore?.counts 
        ? { blocked: { ...pageStore.counts.blocked }, allowed: { ...pageStore.counts.allowed } }
        : createCounts();
    if ( trackedState?.pageCounts ) {
        mergeCounts(pageCounts, trackedState.pageCounts);
    }
    if ( trackedState === undefined && liveState?.pageCounts ) {
        mergeCounts(pageCounts, liveState.pageCounts);
    }
    if ( tabId > 0 ) {
        const matchedBlockedCount = await getMatchedBlockedRequestCountForTab(
            tabId,
            trackedState?.startedAt || 0,
        );
        if ( typeof matchedBlockedCount === 'number' && matchedBlockedCount > pageCounts.blocked.any ) {
            pageCounts.blocked.any = matchedBlockedCount;
        }
    }

    const netFilteringSwitch = pageStore 
        ? pageStore.getNetFilteringSwitch()
        : true;

    const hostnameSwitches = popupState.sessionHostnameSwitches;
    const noPopups = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-popups'] === true;
    const noCosmeticFiltering = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-cosmetic-filtering'] === true;
    const noLargeMedia = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-large-media'] === true;
    const noRemoteFonts = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-remote-fonts'] === true;
    const noScripting = pageHostname !== '' && hostnameSwitches[pageHostname]?.['no-scripting'] === true;
    const switchMetrics = tabId > 0
        ? await getTabSwitchMetrics(tabId)
        : {
            popupBlockedCount: 0,
            largeMediaCount: 0,
            remoteFontCount: 0,
            scriptCount: 0,
        };

    // Get content last modified time from pageStore
    const contentLastModified = pageStore?.contentLastModified || 0;

    // Use pageStore metrics if available
    const largeMediaCount = pageStore?.largeMediaCount ?? switchMetrics.largeMediaCount;
    const remoteFontCount = pageStore?.remoteFontCount ?? switchMetrics.remoteFontCount;
    const popupBlockedCount = pageStore?.popupBlockedCount ?? switchMetrics.popupBlockedCount;

    return {
        advancedUserEnabled: popupState.userSettings.advancedUserEnabled,
        appName: chrome.runtime.getManifest().name,
        appVersion: chrome.runtime.getManifest().version,
        colorBlindFriendly: popupState.userSettings.colorBlindFriendly,
        contentLastModified,
        cosmeticFilteringSwitch: noCosmeticFiltering !== true,
        firewallPaneMinimized: popupState.userSettings.firewallPaneMinimized,
        firewallRules: getFirewallRulesForPopup(pageHostname, hostnameDict),
        godMode: popupState.userSettings.filterAuthorMode === true,
        globalAllowedRequestCount: popupState.globalAllowedRequestCount,
        globalBlockedRequestCount: popupState.globalBlockedRequestCount,
        hasUnprocessedRequest: (() => {
            const vAPINet = (globalThis as any).vAPI?.net;
            if (vAPINet?.hasUnprocessedRequest) {
                return vAPINet.hasUnprocessedRequest(tabId) === true;
            }
            return popupState.tabMetrics?.[tabId]?.hasUnprocessedRequest === true;
        })(),
        hostnameDict,
        pageCounts,
        pageDomain,
        pageHostname,
        pageURL,
        popupBlockedCount,
        popupPanelDisabledSections: 0,
        popupPanelHeightMode: 0,
        popupPanelLockedSections: 0,
        popupPanelOrientation: '',
        popupPanelSections: popupState.userSettings.popupPanelSections,
        rawURL: pageURL,
        tabId,
        tabTitle: pageTitle,
        tooltipsDisabled: popupState.userSettings.tooltipsDisabled,
        userFiltersAreEnabled: popupState.userSettings.filteringEnabled !== false,
        netFilteringSwitch: netFilteringSwitch,
        canElementPicker: /^https?:/.test(pageURL),
        noPopups,
        noCosmeticFiltering,
        noLargeMedia,
        largeMediaCount,
        noRemoteFonts,
        remoteFontCount,
        noScripting,
        matrixIsDirty: (
            popupState.sessionFirewall.hasSameRules(
            popupState.permanentFirewall,
            pageHostname,
            hostnameDict,
        ) === false ) || (
            pageHostname !== '' &&
            hostnameSwitchesEqual(
                popupState.sessionHostnameSwitches,
                popupState.permanentHostnameSwitches,
                pageHostname,
            ) === false
        ),
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
    
    // Clear cosmetic selector cache after saving rules
    if (cosmeticFilteringEngine?.removeFromSelectorCache) {
        cosmeticFilteringEngine.removeFromSelectorCache(request.srcHostname || '*', 'net');
    }
    
    await persistPermanentFirewall();
    popupState.permanentHostnameSwitches = cloneHostnameSwitchState(popupState.sessionHostnameSwitches);
    await persistPermanentHostnameSwitches();
    await syncFirewallDnrRules();
    await syncHostnameSwitchDnrRules();
    return getPopupData(request);
};

const revertFirewallRules = async (request: PopupRequest) => {
    await ensurePopupState();
    popupState.sessionFirewall.copyRules(
        popupState.permanentFirewall,
        request.srcHostname || '',
        request.desHostnames || {},
    );
    
    // Clear cosmetic selector cache after reverting rules
    if (cosmeticFilteringEngine?.removeFromSelectorCache) {
        cosmeticFilteringEngine.removeFromSelectorCache(request.srcHostname || '*', 'net');
    }
    
    popupState.sessionHostnameSwitches = cloneHostnameSwitchState(popupState.permanentHostnameSwitches);
    await syncFirewallDnrRules();
    await syncHostnameSwitchDnrRules();
    if ( typeof request.tabId === 'number' ) {
        const hostname = request.srcHostname || '';
        const sessionSwitches = popupState.sessionHostnameSwitches[hostname] || {};
        for ( const name of hostnameSwitchNames ) {
            await applyImmediateHostnameSwitchEffects(
                request.tabId,
                name,
                sessionSwitches[name] === true,
            );
        }
    }
    return getPopupData(request);
};

const getDashboardRules = async () => {
    await ensurePopupState();
    return {
        permanentRules: popupState.permanentFirewall.toArray(),
        sessionRules: popupState.sessionFirewall.toArray(),
        pslSelfie: publicSuffixList.toSelfie(),
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
        if ( request.name === 'contextMenuEnabled' ) {
            createContextMenu();
        }
    }
    
    // Get vAPI.net capabilities
    const vAPINet = (globalThis as any).vAPI?.net;
    const canUncloakCnames = vAPINet?.canUncloakCnames === true;
    
    // Build response with conditional fields
    const response: Record<string, any> = { ...popupState.userSettings };
    
    // Only include cnameUncloakEnabled if CNAME uncloaking is available
    if (!canUncloakCnames) {
        delete response.cnameUncloakEnabled;
    }
    
    // Only include canLeakLocalIPAddresses if the feature is available  
    if (!vAPINet?.canLeakLocalIPAddresses) {
        delete response.canLeakLocalIPAddresses;
    }
    
    return response;
};

const toggleHostnameSwitch = async (request: PopupRequest) => {
    await ensurePopupState();
    const name = request.name || '';
    const hostname = request.srcHostname || request.hostname || '';
    const tabId = request.tabId ?? undefined;
    const enabled = request.state === true;

    if ( hostname === '' || hostnameSwitchNames.has(name) === false ) {
        return getPopupData(request);
    }

    const hostnameSwitches = cloneHostnameSwitchState(popupState.sessionHostnameSwitches);
    const current = { ...(hostnameSwitches[hostname] || {}) };
    if ( enabled ) {
        current[name] = true;
        hostnameSwitches[hostname] = current;
    } else {
        delete current[name];
        if ( Object.keys(current).length === 0 ) {
            delete hostnameSwitches[hostname];
        } else {
            hostnameSwitches[hostname] = current;
        }
    }

    popupState.sessionHostnameSwitches = hostnameSwitches;
    await syncHostnameSwitchDnrRules();

    if ( typeof tabId === 'number' ) {
        await applyImmediateHostnameSwitchEffects(tabId, name, enabled);
    }

    return getPopupData(request);
};

const toggleNetFiltering = async (request: PopupRequest) => {
    await ensurePopupState();
    const tabId = request.tabId ?? 0;
    const url = request.url || '';
    const scope = request.scope || 'page';
    const state = request.state !== false;
    
    if (!tabId || !url) {
        return getPopupData(request);
    }
    
    try {
        const pageStore = await pageStoreFromTabId(tabId);
        if (pageStore) {
            await pageStore.toggleNetFilteringSwitch(url, scope, state);
        } else {
            const hostname = new URL(url).hostname;
            const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
            const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
            const key = scope === 'page' ? `${hostname}:${url}` : hostname;
            if (state) {
                delete perSiteFiltering[key];
            } else {
                perSiteFiltering[key] = false;
            }
            await chrome.storage.local.set({ perSiteFiltering });
        }
        
        // Toggle associated switches
        const hostnameSwitches = cloneHostnameSwitchState(popupState.sessionHostnameSwitches);
        const hostname = new URL(url).hostname;
        const current = hostnameSwitches[hostname] || {};
        
        if (!state) {
            current['no-popups'] = true;
            current['no-cosmetic-filtering'] = true;
            current['no-large-media'] = true;
            current['no-remote-fonts'] = true;
            current['no-scripting'] = true;
        } else {
            delete current['no-popups'];
            delete current['no-cosmetic-filtering'];
            delete current['no-large-media'];
            delete current['no-remote-fonts'];
            delete current['no-scripting'];
        }
        
        if (Object.keys(current).length > 0) {
            hostnameSwitches[hostname] = current;
        } else {
            delete hostnameSwitches[hostname];
        }
        
        popupState.sessionHostnameSwitches = hostnameSwitches;
        await syncHostnameSwitchDnrRules();
        await syncPowerSwitchDnrRules();
        
        if (typeof tabId === 'number') {
            await updateToolbarIcon(tabId, { filtering: state });
        }
        
    } catch (e) {
        console.error('[MV3] toggleNetFiltering error:', e);
    }
    
    return getPopupData(request);
};

const handlePopupPanelMessage = async (request: PopupRequest) => {
    switch ( request.what ) {
    case 'getPopupData':
        return getPopupData(request);
    case 'toggleNetFiltering':
        return toggleNetFiltering(request);
    case 'toggleFirewallRule':
        return toggleFirewallRule(request);
    case 'saveFirewallRules':
        return saveFirewallRules(request);
    case 'revertFirewallRules':
        return revertFirewallRules(request);
    case 'getScriptCount':
        return request.tabId ? (await getTabSwitchMetrics(request.tabId)).scriptCount : 0;
    case 'getHiddenElementCount':
        return request.tabId ? await getHiddenElementCountForTab(request.tabId) : 0;
    case 'toggleHostnameSwitch':
        return toggleHostnameSwitch(request);
    case 'userSettings':
        return setUserSetting(request);
    case 'readyToFilter':
        return popupState.initialized;
    case 'clickToLoad': {
        const tabId = request.tabId as number;
        const frameId = request.frameId as number;
        const frameURL = request.frameURL as string;
        if (tabId && frameId && frameURL) {
            const pageStore = await pageStoreFromTabId(tabId);
            if (pageStore) {
                await pageStore.clickToLoad(frameId, frameURL);
            }
        }
        return { success: true };
    }
    default:
        return undefined;
    }
};

const handleDashboardMessage = async (request: PopupRequest) => {
    switch ( request.what ) {
    case 'getLists':
        return getFilterListState();
    case 'applyFilterListSelection':
        return applyFilterListSelection(request as {
            toSelect?: string[];
            toImport?: string;
            toRemove?: string[];
        });
    case 'reloadAllFilters':
        return reloadAllFilterLists();
    case 'updateNow':
        return updateFilterListsNow();
    case 'listsUpdateNow':
        return updateFilterListsNow(request as { assetKeys?: string[]; preferOrigin?: boolean });
    case 'userSettings':
        return setUserSetting(request);
    case 'getLocalData':
        return getLocalData();
    case 'backupUserData':
        return backupUserData();
    case 'restoreUserData':
        return restoreUserData(request as { userData?: unknown; file?: string });
    case 'resetUserData':
        return resetUserData();
    case 'readUserFilters': {
        const items = await chrome.storage.local.get('userFilters');
        const enabled = await chrome.storage.local.get('userFiltersEnabled');
        const selectedLists = await chrome.storage.local.get('selectedFilterLists');
        
        // Check if user filters is in selected filter lists (trust status)
        const userFiltersPath = 'userfilters';
        const isSelected = selectedLists?.selectedFilterLists?.includes(userFiltersPath) || false;
        const isTrusted = popupState.trustedLists?.[userFiltersPath] === true;
        
        return { 
            userFilters: items.userFilters || '',
            enabled: enabled?.userFiltersEnabled !== false ? isSelected : false,
            trusted: isTrusted,
        };
    }
    case 'writeUserFilters': {
        const userFilters = request.userFilters as string;
        const enabled = request.enabled as boolean;
        if ( typeof userFilters === 'string' ) {
            // Validate user filters - ensure it's not too large and is a valid string
            const MAX_FILTER_SIZE = 10 * 1024 * 1024; // 10MB limit
            if (userFilters.length > MAX_FILTER_SIZE) {
                return { success: false, error: 'Filter size exceeds limit' };
            }
            await chrome.storage.local.set({ userFilters });
            if (typeof enabled === 'boolean') {
                await chrome.storage.local.set({ userFiltersEnabled: enabled });
            }
            await reloadAllFilterLists();
            return { success: true };
        }
        return { success: false, error: 'Invalid userFilters' };
    }
    case 'cloudGetOptions': {
        const stored = await chrome.storage.local.get('cloudOptions');
        const userSettings = (await chrome.storage.local.get('userSettings')).userSettings || {};
        const options = stored?.cloudOptions || {};
        const deviceName = options.deviceName || await getDeviceName();
        const syncStorageAvailable = typeof chrome.storage.sync !== 'undefined';
        return {
            deviceName,
            syncEnabled: options.syncEnabled !== false,
            enabled: userSettings.cloudStorageEnabled === true,
            cloudStorageSupported: syncStorageAvailable,
        };
    }
    case 'cloudSetOptions': {
        const options = request as { deviceName?: string; syncEnabled?: boolean };
        const stored = await chrome.storage.local.get('cloudOptions');
        const existing = stored?.cloudOptions || {};
        if (typeof options.deviceName === 'string') {
            existing.deviceName = options.deviceName;
        }
        if (typeof options.syncEnabled === 'boolean') {
            existing.syncEnabled = options.syncEnabled;
        }
        await chrome.storage.local.set({ cloudOptions: existing });
        return { success: true };
    }
    case 'cloudPull': {
        const useSync = typeof chrome.storage.sync !== 'undefined';
        const cloudKey = 'cloudData';
        const stored = useSync 
            ? await chrome.storage.sync.get(cloudKey)
            : await chrome.storage.local.get(cloudKey);
        const cloudData = stored?.[cloudKey];
        if (!cloudData) return { error: 'No cloud data' };
        
        try {
            // Enhanced decoding with s14e format support
            const decoded = await decodeCloudData(cloudData);
            return { 
                data: decoded, 
                clientId: decoded.clientId, 
                lastModified: decoded.lastModified,
                serverTime: decoded.serverTime,
            };
        } catch (e) {
            return { error: (e as Error).message };
        }
    }
    case 'cloudPush': {
        const cloudData = request.data;
        if (!cloudData) return { error: 'No data to push' };
        
        try {
            // Add server timestamp
            const dataToPush = {
                ...cloudData,
                serverTime: Date.now(),
                clientTime: Date.now(),
            };
            
            const encoded = await encodeCloudData(dataToPush);
            
            // Use sync storage if available, otherwise use local
            const useSync = typeof chrome.storage.sync !== 'undefined';
            if (useSync) {
                await chrome.storage.sync.set({ cloudData: encoded });
            } else {
                await chrome.storage.local.set({ cloudData: encoded });
            }
            
            // Update storage usage tracking
            const storageUsed = useSync 
                ? await chrome.storage.sync.getBytesInUse()
                : await chrome.storage.local.getBytesInUse();
            if (useSync) {
                await chrome.storage.sync.set({ 
                    cloudStorageUsed: storageUsed,
                    lastCloudSync: Date.now() 
                });
            } else {
                await chrome.storage.local.set({ 
                    cloudStorageUsed: storageUsed,
                    lastCloudSync: Date.now() 
                });
            }
            
            return { success: true, clientId: cloudData.clientId };
        } catch (e) {
            return { error: (e as Error).message };
        }
    }
    case 'cloudUsed': {
        // Get actual cloud storage usage
        const useSync = typeof chrome.storage.sync !== 'undefined';
        const storageUsed = useSync 
            ? await chrome.storage.sync.getBytesInUse()
            : await chrome.storage.local.getBytesInUse();
        
        const cloudKey = useSync ? 'cloudData' : 'cloudData';
        const cloudData = useSync 
            ? await chrome.storage.sync.get(cloudKey)
            : await chrome.storage.local.get(cloudKey);
        const cloudSize = cloudData?.[cloudKey] ? JSON.stringify(cloudData[cloudKey]).length : 0;
        
        const lastCloudSync = useSync 
            ? await chrome.storage.sync.get('lastCloudSync')
            : await chrome.storage.local.get('lastCloudSync');
        
        return { 
            used: cloudSize,
            total: storageUsed,
            lastSync: lastCloudSync?.lastCloudSync || 0,
        };
    }
    case 'getAppData': {
        const manifest = chrome.runtime.getManifest();
        const stored = await chrome.storage.local.get('hiddenSettings');
        const hiddenSettings = stored?.hiddenSettings || {};
        const whitelistStored = await chrome.storage.local.get('whitelist');
        const whitelist = whitelistStored?.whitelist || '';
        
        return {
            name: manifest.name || 'uBlock Resurrected',
            version: manifest.version || '1.0.0',
            canBenchmark: hiddenSettings?.benchmarkDatasetURL !== 'unset',
            whitelist: µb?.arrayFromWhitelist?.(whitelist) || [],
            whitelistDefault: µb?.netWhitelistDefault || [],
            reBadHostname: µb?.reWhitelistBadHostname?.source || '(^|\\.)(localhost|localhost\\.localdomain|127\\.0\\.0\\.1|0\\.0\\.0\\.0|255\\.255\\.255\\.255)$/',
            reHostnameExtractor: µb?.reWhitelistHostnameExtractor?.source || '^https?:\\/\\/([^/:]+)',
        };
    }
    case 'getTrustedScriptletTokens': {
        if (redirectEngine?.getTrustedScriptletTokens) {
            return redirectEngine.getTrustedScriptletTokens();
        }
        return [];
    }
    case 'getWhitelist': {
        const whitelistStored = await chrome.storage.local.get('whitelist');
        const whitelist = whitelistStored?.whitelist || '';
        return {
            whitelist: µb?.arrayFromWhitelist?.(whitelist) || [],
            whitelistDefault: µb?.netWhitelistDefault || [],
            reBadHostname: µb?.reWhitelistBadHostname?.source || '(^|\\.)(localhost|localhost\\.localdomain|127\\.0\\.0\\.1|0\\.0\\.0\\.0|255\\.255\\.255\\.255)$/',
            reHostnameExtractor: µb?.reWhitelistHostnameExtractor?.source || '^https?:\\/\\/([^/:]+)',
        };
    }
    case 'setWhitelist': {
        const whitelist = request.whitelist as string;
        if (typeof whitelist === 'string' && whitelist.length > 0) {
            popupState.whitelist = µb?.whitelistFromString?.(whitelist) || [];
            try {
                await chrome.storage.local.set({ whitelist });
                return { success: true };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        }
        return { success: false, error: 'Invalid whitelist' };
    }
    case 'getDomainNames': {
        const target = request.target as string;
        if (typeof target !== 'string' || target === '') { return []; }
        
        const domains: string[] = [];
        
        const extractDomain = (hostname: string): string | null => {
            if (!hostname) return null;
            // Get second-level domain for public suffixes
            const parts = hostname.split('.');
            if (parts.length >= 2) {
                return parts.slice(-2).join('.');
            }
            return hostname;
        };
        
        // Handle URL or hostname
        try {
            if (target.includes('/') || target.includes(':')) {
                // It's a URL
                const url = new URL(target);
                const domain = extractDomain(url.hostname);
                if (domain) domains.push(domain);
            } else {
                // It's a hostname
                const domain = extractDomain(target);
                if (domain) domains.push(domain);
            }
        } catch {
            // Fallback - treat as hostname
            const domain = extractDomain(target);
            if (domain) domains.push(domain);
        }
        
        return domains;
    }
    case 'getCollapsibleBlockedRequests': {
        const tabId = request.tabId as number;
        if ( typeof tabId !== 'number' ) { return { requests: [] }; }
        try {
            const results = await chrome.tabs.sendMessage(tabId, { what: 'getCollapsibleBlockedRequests' });
            return results || { requests: [] };
        } catch {
            return { requests: [] };
        }
    }
    case 'hasPopupContentChanged': {
        const tabId = request.tabId as number;
        const contentLastModified = request.contentLastModified as number;
        
        if (typeof tabId !== 'number') {
            return { changed: false };
        }
        
        // Get stored content version for this tab
        const stored = await chrome.storage.local.get('popupContentVersions');
        const versions = stored?.popupContentVersions || {};
        const storedVersion = versions[tabId] || 0;
        
        // Compare stored version with requested version
        const changed = storedVersion !== 0 && storedVersion !== contentLastModified;
        
        // Update version if changed
        if (changed || storedVersion === 0) {
            versions[tabId] = Date.now();
            await chrome.storage.local.set({ popupContentVersions: versions });
        }
        
        return { changed };
    }
    case 'toggleInMemoryFilter': {
        const filter = request.filter as string;
        const tabId = request.tabId as number;
        if ( filter && typeof tabId === 'number' ) {
            try {
                await chrome.tabs.sendMessage(tabId, { what: 'toggleInMemoryFilter', filter });
            } catch (e) {
                // Ignore errors
            }
        }
        return { success: true };
    }
    case 'hasInMemoryFilter': {
        const tabId = request.tabId as number;
        if ( typeof tabId === 'number' ) {
            try {
                const results = await chrome.tabs.sendMessage(tabId, { what: 'hasInMemoryFilter' });
                return results || { hasFilter: false };
            } catch {
                return { hasFilter: false };
            }
        }
        return { hasFilter: false };
    }
    case 'readAll': {
        const ownerId = request.ownerId as number;
        if (logger?.ownerId !== undefined && logger?.ownerId !== ownerId) {
            return { unavailable: true };
        }
        
        try {
            const allData = await chrome.storage.local.get(null);
            return allData;
        } catch (e) {
            return { error: (e as Error).message };
        }
    }
    case 'toggleNetFiltering': {
        // Handle power switch toggle - enable/disable filtering for a site
        const { url, scope, state, tabId } = request;
        if (!url || !tabId) { return getPopupData(request); }
        
        // Extract hostname from URL
        let hostname = '';
        try {
            hostname = new URL(url).hostname;
        } catch {
            return getPopupData(request);
        }
        
        // Get current per-site filtering settings
        const stored = await chrome.storage.local.get('perSiteFiltering');
        const perSiteFiltering: Record<string, boolean> = stored?.perSiteFiltering || {};
        
        // Determine scope (page or entire site)
        const scopeKey = scope === 'page' ? `${hostname}:${url}` : hostname;
        
        // Set the filtering state
        perSiteFiltering[scopeKey] = state;
        
        // Save to storage
        await chrome.storage.local.set({ perSiteFiltering: perSiteFiltering });
        await syncPowerSwitchDnrRules();
        
        // Notify content script about the change
        if ( tabId ) {
            try {
                const result = chrome.tabs.sendMessage(tabId, {
                    topic: 'uBlockPowerSwitch',
                    payload: {
                        enabled: state === true,
                    },
                }) as Promise<unknown> | undefined;
                result?.catch(() => {});
            } catch {
            }
        }
        
        console.log('[MV3] toggleNetFiltering:', scopeKey, '=', state);
        
        return getPopupData(request);
    }
    case 'reloadTab': {
        const { tabId, bypassCache, url } = request;
        if (tabId) {
            if (typeof url === 'string' && url !== '') {
                // Replace URL in the tab if different
                chrome.tabs.get(tabId, (tab) => {
                    if (tab?.url && tab.url !== url) {
                        chrome.tabs.update(tabId, { url });
                    } else {
                        chrome.tabs.reload(tabId, { bypassCache: !!bypassCache });
                    }
                });
            } else {
                chrome.tabs.reload(tabId, { bypassCache: !!bypassCache });
            }
        }
        return {};
    }
    case 'dismissUnprocessedRequest': {
        const tabId = request.tabId as number;
        if (typeof tabId === 'number') {
            // Remove from vAPI.net tracking
            const vAPINet = (globalThis as any).vAPI?.net;
            if (vAPINet?.removeUnprocessedRequest) {
                vAPINet.removeUnprocessedRequest(tabId);
            }
            
            // Also remove from local storage
            const stored = await chrome.storage.local.get('unprocessedRequests');
            const unprocessed = stored?.unprocessedRequests || {};
            delete unprocessed[tabId];
            await chrome.storage.local.set({ unprocessedRequests: unprocessed });
            
            // Update toolbar icon after dismissing
            await updateToolbarIcon(tabId, { filtering: true });
        }
        return { success: true };
    }
    case 'launchReporter': {
        const tabId = request.tabId as number;
        const pageURL = request.pageURL as string;
        if (tabId && pageURL) {
            const stored = await chrome.storage.local.get('popupStats');
            const stats = stored?.popupStats?.[tabId] || {};
            
            // Get filter list update ages
            const filterLists = (await chrome.storage.local.get('filterLists')).filterLists || {};
            const selectedLists = (await chrome.storage.local.get('selectedFilterLists')).selectedFilterLists || [];
            const updateAges: Record<string, number> = {};
            
            for (const listKey of selectedLists) {
                const list = filterLists[listKey];
                if (list?.lastFetchTime) {
                    updateAges[listKey] = Date.now() - list.lastFetchTime;
                }
            }
            
            // Get cosmetic filter data
            const cosmeticData = (await chrome.storage.local.get('cosmeticFiltersData')).cosmeticFiltersData || {};
            const cosmeticFilterCount = Object.keys(cosmeticData).length;
            
            const url = new URL(chrome.runtime.getURL('reporter.html'));
            url.searchParams.set('url', pageURL);
            url.searchParams.set('tabId', String(tabId));
            url.searchParams.set('blocked', String(stats.blocked || 0));
            url.searchParams.set('allowed', String(stats.allowed || 0));
            url.searchParams.set('cosmeticFilters', String(cosmeticFilterCount));
            url.searchParams.set('updateAges', JSON.stringify(updateAges));
            
            chrome.tabs.create({ url: url.toString(), active: true });
        }
        return { success: true };
    }
    case 'gotoURL': {
        const { url, newTab, tabId: targetTabId, select, index, shiftKey } = request as {
            url?: string;
            newTab?: boolean;
            tabId?: number;
            select?: boolean;
            index?: number;
            shiftKey?: boolean;
        };
        if (!url) return { success: false };
        
        const createProps: chrome.tabs.CreateProperties = { url, active: select !== false };
        if (typeof index === 'number') createProps.index = index;
        if (shiftKey) createProps.active = false;
        
        if (newTab) {
            const created = await chrome.tabs.create(createProps);
            return { tabId: created.id };
        } else if (targetTabId) {
            await chrome.tabs.update(targetTabId, { url, active: true });
            return { tabId: targetTabId };
        } else {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]?.id) {
                await chrome.tabs.update(tabs[0].id, { url, active: true });
                return { tabId: tabs[0].id };
            }
        }
        return { success: false };
    }
    case 'hasPopupContentChanged': {
        const tabId = request.tabId as number;
        if (typeof tabId !== 'number') return { changed: false };
        
        const stored = await chrome.storage.local.get('popupContentVersions');
        const versions = stored?.popupContentVersions || {};
        const currentVersion = versions[tabId] || 0;
        const newVersion = Date.now();
        
        if (currentVersion !== newVersion) {
            versions[tabId] = newVersion;
            await chrome.storage.local.set({ popupContentVersions: versions });
            return { changed: currentVersion !== 0 && newVersion > currentVersion };
        }
        return { changed: false };
    }
    case 'getAssetContent': {
        const url = request.url as string;
        if (!url) return { error: 'No URL provided' };
        try {
            const response = await fetch(url);
            const text = await response.text();
            return {
                content: text,
                assetKey: url,
                sourceURL: url,
            };
        } catch (e) {
            return { error: (e as Error).message };
        }
    }
    case 'listsFromNetFilter': {
        const rawFilter = request.rawFilter as string;
        if (!rawFilter) return { notFound: true };
        if (staticFilteringReverseLookup) {
            try {
                const result = await staticFilteringReverseLookup.fromNetFilter(rawFilter);
                return result;
            } catch (e) {
                return { notFound: true };
            }
        }
        return { notFound: true };
    }
    case 'listsFromCosmeticFilter': {
        const rawFilter = request.rawFilter as string;
        if (!rawFilter) return { notFound: true };
        if (staticFilteringReverseLookup) {
            try {
                const result = await staticFilteringReverseLookup.fromExtendedFilter({ rawFilter });
                return result;
            } catch (e) {
                return { notFound: true };
            }
        }
        return { notFound: true };
    }
    case 'reloadAllFilters':
        return reloadAllFilterLists();
    case 'scriptlet': {
        const tabId = request.tabId as number;
        const scriptletName = request.scriptlet as string;
        if (tabId && scriptletName) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: [`/js/scriptlets/${scriptletName}.js`],
                });
                return { success: true };
            } catch (e) {
                return { error: (e as Error).message };
            }
        }
        return { error: 'Invalid parameters' };
    }
    case 'loggerDisabled': {
        return logger?.enabled !== true;
    }
    case 'launchElementPicker': {
        const tabId = request.tabId as number;
        const target = request.target as string;
        const zap = request.zap as boolean;
        if (tabId) {
            elementPickerExec(tabId, 0, target, zap);
        }
        return { success: true };
    }
    case 'snfeBenchmark': {
        return { result: 'Benchmark not implemented in MV3' };
    }
    case 'cfeBenchmark': {
        return { result: 'Benchmark not implemented in MV3' };
    }
    case 'sfeBenchmark': {
        return { result: 'Benchmark not implemented in MV3' };
    }
    case 'snfeToDNR': {
        return { success: true, message: 'Static network filters already use DNR in MV3' };
    }
    case 'snfeDump': {
        if (staticFilteringEngine) {
            return { dump: 'Static filtering engine state not available' };
        }
        return { dump: 'No engine' };
    }
    case 'snfeQuery': {
        const filter = request.filter as string;
        if (!filter || !staticFilteringEngine) return { result: [] };
        return { result: [] };
    }
    case 'cfeDump': {
        if (cosmeticFilteringEngine) {
            return { dump: 'Cosmetic filtering engine state not available' };
        }
        return { dump: 'No engine' };
    }
    case 'dashboardConfig': {
        const noDashboard = popupState.noDashboard === true;
        return {
            defaultURL: '/dashboard.html',
            noDashboardURL: '/no-dashboard.html',
            noDashboard,
        };
    }
    case 'getRules': {
        const stored = await chrome.storage.local.get('dynamicRules');
        const storedFirewall = await chrome.storage.local.get('permanentFirewall');
        const storedSwitches = await chrome.storage.local.get('permanentSwitches');
        const storedSession = await chrome.storage.local.get('sessionFirewall');
        
        // Get URL filtering from engine if available
        let urlFilters: any[] = [];
        const permanentURLFiltering = (globalThis as any).vAPI?.permanentURLFiltering;
        if (permanentURLFiltering?.toArray) {
            try {
                urlFilters = permanentURLFiltering.toArray();
            } catch (e) {}
        }
        // Fallback to storage if engine not available
        if (urlFilters.length === 0) {
            const storedURLFilters = await chrome.storage.local.get('permanentURLFiltering');
            urlFilters = storedURLFilters?.permanentURLFiltering || [];
        }
        
        // Generate PSL selfie if available
        let pslSelfieValue: string | null = null;
        if (publicSuffixList?.toSelfie) {
            try {
                pslSelfieValue = publicSuffixList.toSelfie();
            } catch (e) {}
        }
        
        return {
            dynamicRules: stored?.dynamicRules || [],
            firewall: storedFirewall?.permanentFirewall || [],
            switches: storedSwitches?.permanentSwitches || [],
            urlFilters,
            sessionFirewall: storedSession?.sessionFirewall || [],
            pslSelfie: pslSelfieValue,
        };
    }
    case 'modifyRuleset': {
        const { type, action, raw, rule } = request;
        
        // Clear cosmetic selector cache when modifying ruleset
        if (cosmeticFilteringEngine?.removeFromSelectorCache) {
            cosmeticFilteringEngine.removeFromSelectorCache('*');
        }
        
        if (type === 'user' && raw) {
            const stored = await chrome.storage.local.get('userRules');
            const existingRules = stored?.userRules || [];
            if (action === 'remove') {
                const index = existingRules.indexOf(raw);
                if (index > -1) existingRules.splice(index, 1);
            } else {
                existingRules.push(raw);
            }
            await chrome.storage.local.set({ userRules: existingRules });
        }
        
        if (type === 'firewall' && rule) {
            const stored = await chrome.storage.local.get('permanentFirewall');
            const rules = stored?.permanentFirewall || [];
            if (action === 'remove') {
                const index = rules.findIndex((r: any) => r.src === rule.src && r.dest === rule.dest && r.type === rule.type);
                if (index > -1) rules.splice(index, 1);
            } else {
                rules.push(rule);
            }
            await chrome.storage.local.set({ permanentFirewall: rules });
        }
        
        if (type === 'switch' && rule) {
            const stored = await chrome.storage.local.get('permanentSwitches');
            const rules = stored?.permanentSwitches || [];
            if (action === 'remove') {
                const index = rules.findIndex((r: any) => r.hostname === rule.hostname && r.switch === rule.switch);
                if (index > -1) rules.splice(index, 1);
            } else {
                rules.push(rule);
            }
            await chrome.storage.local.set({ permanentSwitches: rules });
        }
        
        if (type === 'urlRuleset' && rule) {
            const stored = await chrome.storage.local.get('permanentURLFiltering');
            const rules = stored?.permanentURLFiltering || [];
            if (action === 'remove') {
                const index = rules.findIndex((r: any) => r.urlPattern === rule.urlPattern);
                if (index > -1) rules.splice(index, 1);
            } else {
                rules.push(rule);
            }
            await chrome.storage.local.set({ permanentURLFiltering: rules });
        }
        
        return { success: true };
    }
    case 'listsUpdateNow': {
        const assetKeys = request.assetKeys as string[];
        const preferOrigin = request.preferOrigin as boolean;
        if (assetKeys && assetKeys.length > 0) {
            await updateFilterListsNow({ assetKeys, preferOrigin });
        }
        return { success: true };
    }
    case 'supportUpdateNow': {
        // Update support filter list
        try {
            const stored = await chrome.storage.local.get('selectedFilterLists');
            const lists = stored?.selectedFilterLists || [];
            if (!lists.includes('support')) {
                lists.push('support');
                await chrome.storage.local.set({ selectedFilterLists: lists });
            }
            await updateFilterListsNow({ assetKeys: ['support'] });
        } catch (e) {
            console.log('[MV3] supportUpdateNow error:', e);
        }
        return { success: true };
    }
    case 'readHiddenSettings': {
        // Return hidden settings with default and current values
        const stored = await chrome.storage.local.get('hiddenSettings');
        const storedAdmin = await chrome.storage.local.get('adminHiddenSettings');
        const current = stored?.hiddenSettings || {};
        const admin = storedAdmin?.adminHiddenSettings || {};
        
        // Default hidden settings - minimal set
        const defaults: Record<string, unknown> = {
            benchmarkDatasetURL: 'unset',
            debugScriptlet: false,
            profiler: false,
        };
        
        // Return full structure like reference
        return {
            defaults,
            admin,
            current,
        };
    }
    case 'writeHiddenSettings': {
        // Parse hidden settings from string or object and save
        const content = request.content as string;
        const hiddenSettings = request.hiddenSettings as Record<string, unknown> | undefined;
        
        let parsedSettings: Record<string, unknown> = {};
        
        // If content is a string, parse it
        if (typeof content === 'string' && content.trim() !== '') {
            try {
                parsedSettings = JSON.parse(content);
            } catch {
                // Try to parse as key=value pairs
                const pairs = content.split('\n').filter(p => p.includes('='));
                for (const pair of pairs) {
                    const [key, ...valueParts] = pair.split('=');
                    if (key && valueParts.length > 0) {
                        let value: unknown = valueParts.join('=').trim();
                        // Convert string booleans
                        if (value === 'true') value = true;
                        else if (value === 'false') value = false;
                        parsedSettings[key.trim()] = value;
                    }
                }
            }
        } else if (hiddenSettings) {
            parsedSettings = hiddenSettings;
        }
        
        if (Object.keys(parsedSettings).length > 0) {
            const stored = await chrome.storage.local.get('hiddenSettings');
            const existing = stored?.hiddenSettings || {};
            
            // Merge new settings
            const updated = { ...existing };
            for (const [key, value] of Object.entries(parsedSettings)) {
                if (value !== undefined) {
                    updated[key] = value;
                }
            }
            
            await chrome.storage.local.set({ hiddenSettings: updated });
        }
        return { success: true };
    }
    case 'getAutoCompleteDetails': {
        const stored = await chrome.storage.local.get('userFilters');
        const userFilters = stored?.userFilters || '';
        const lines = userFilters.split('\n').filter(line => line.trim() !== '');
        
        // Get redirect resources from redirect engine
        const redirectResources: string[] = [];
        try {
            const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
            if (redirectEngine?.getResourceDetails) {
                const details = redirectEngine.getResourceDetails();
                redirectResources.push(...Object.keys(details));
            } else if (redirectEngine?.resources) {
                redirectResources.push(...redirectEngine.resources);
            }
        } catch (e) {}
        
        // Get origin hints from actual open tabs
        const originHintsSet = new Set<string>([
            '127.0.0.1',
            'localhost',
            'chrome-extension:',
            'chrome:',
            'about:',
        ]);
        
        try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab?.url) {
                    try {
                        const url = new URL(tab.url);
                        if (url.hostname) {
                            originHintsSet.add(url.hostname);
                        }
                        if (url.origin) {
                            originHintsSet.add(url.origin);
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
        
        return {
            filterCount: lines.length,
            filterCharCount: userFilters.length,
            filterParts: lines.filter(l => !l.startsWith('!') && !l.startsWith('#')),
            filterRegexes: lines.filter(l => l.includes(' regexp')),
            whitelistParts: lines.filter(l => l.startsWith('@@')),
            needCommit: false,
            originHints: Array.from(originHintsSet),
            redirectResources,
            preparseDirectiveHints: ['|', '||', '|https:', '|http:', '^', '*', '~'],
            preparseDirectiveEnv: {
                flavor: 'chromium',
                hasWebSocket: true,
            },
            hintUpdateToken: Date.now().toString(36),
        };
    }
    case 'getSupportData': {
        const userSettings = await chrome.storage.local.get('userSettings');
        const selectedLists = await chrome.storage.local.get('selectedFilterLists');
        const filterLists = await chrome.storage.local.get('filterLists');
        const hiddenSettings = await chrome.storage.local.get('hiddenSettings');
        
        const manifest = chrome.runtime.getManifest();
        
        let filterCount = 0;
        let cosmeticFilterCount = 0;
        try {
            const stored = await chrome.storage.local.get('cosmeticFiltersData');
            const data = parseStoredCosmeticFilterData(stored.cosmeticFiltersData);
            cosmeticFilterCount = (data.genericCosmeticFilters?.length || 0) + (data.specificCosmeticFilters?.length || 0);
        } catch (e) {}
        
        return {
            userSettings: userSettings?.userSettings || {},
            selectedFilterLists: selectedLists?.selectedFilterLists || [],
            filterLists: filterLists?.filterLists || {},
            hiddenSettings: hiddenSettings?.hiddenSettings || {},
            version: manifest?.version || '1.0.0',
            platform: 'chrome',
            filterCount,
            cosmeticFilterCount,
        };
    }
    default:
        return undefined;
    }
};

// Sync DNR rules based on per-site filtering state - existing function handles this
// The syncPowerSwitchDnrRules function already exists and is called below

const Messaging = (() => {
    const portMap = new Map<string, chrome.runtime.Port>();
    const handlers = new Map<string, (payload: any, sendResponse?: (response: any) => void) => any>();
    const tabListeners = new Map<number, Set<(topic: string, payload: any) => void>>();

    function onPortConnected(port: chrome.runtime.Port) {
        portMap.set(port.name || 'unknown', port);

        port.onMessage.addListener((message) => {
            void handlePortMessage(port, message);
        });

        port.onDisconnect.addListener(() => {
            portMap.delete(port.name || 'unknown');
            const legacyMessaging = getLegacyMessaging();
            legacyMessaging?.onPortDisconnect?.(port);
        });
    }

    async function handlePortMessage(port: chrome.runtime.Port, message: any) {
        if ( message && typeof message.channel === 'string' ) {
            await handleLegacyPortMessage(port, message as LegacyMessage);
            return;
        }
        if (!message || !message.topic) return;

        const { topic, payload, seq } = message;

        if ( topic === 'popupPanel' || topic === 'dashboard' ) {
            try {
                const response = topic === 'popupPanel'
                    ? await handlePopupPanelMessage(payload || {})
                    : await handleDashboardMessage(payload || {});
                if ( seq !== undefined ) {
                    port.postMessage({ seq, payload: response });
                }
            } catch (error) {
                if ( seq !== undefined ) {
                    port.postMessage({
                        seq,
                        payload: { error: (error as Error).message },
                    });
                }
            }
            return;
        }

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

    async function handleLegacyPortMessage(port: chrome.runtime.Port, message: LegacyMessage) {
        const { channel, msgId, msg } = message;
        const respond = (response: any) => {
            if ( msgId === undefined ) { return; }
            port.postMessage({ msgId, msg: response });
        };

        // Handle dashboard and popupPanel natively without legacy backend
        if ( channel === 'dashboard' || channel === 'popupPanel' ) {
            try {
                const response = channel === 'popupPanel'
                    ? await handlePopupPanelMessage(msg || {})
                    : await handleDashboardMessage(msg || {});
                respond(response);
            } catch (error) {
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle contentscript channel for MV3 content script communication
        if ( channel === 'contentscript' ) {
            try {
                const response = await handleContentScriptRequest(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] contentscript error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle scriptlets channel
        if ( channel === 'scriptlets' ) {
            try {
                const response = await handleScriptletsMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] scriptlets error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle vapi channel for userCSS and other vAPI functions
        if ( channel === 'vapi' ) {
            try {
                const response = await handleVapiMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] vapi error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle elementPicker channel
        if ( channel === 'elementPicker' ) {
            try {
                const response = await handleElementPickerMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] elementPicker error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle cloudWidget channel
        if ( channel === 'cloudWidget' ) {
            try {
                const response = await handleCloudWidgetMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] cloudWidget error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle loggerUI channel
        if ( channel === 'loggerUI' ) {
            try {
                const response = await handleLoggerUIMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] loggerUI error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle domInspectorContent channel
        if ( channel === 'domInspectorContent' ) {
            try {
                const response = await handleDomInspectorContentMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] domInspectorContent error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle documentBlocked channel
        if ( channel === 'documentBlocked' ) {
            try {
                const response = await handleDocumentBlockedMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] documentBlocked error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle devTools channel
        if ( channel === 'devTools' ) {
            try {
                const response = await handleDevToolsMessage(msg || {}, port.sender);
                respond(response);
            } catch (error) {
                console.error('[MV3] devTools error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        console.log(`MV3: ${channel} channel - legacy not supported, returning empty response`);
        respond(null);
    }

    // Handle content script requests from the contentscript messaging channel
    async function handleContentScriptRequest(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        let response: any = null;
        const tabId = sender?.tab?.id;
        
        switch (what) {
            case 'retrieveContentScriptParameters':
                // Handled by Messaging.on handler above, just return null here
                return null;
            case 'retrieveGenericCosmeticSelectors':
                // Handled by Messaging.on handler above, just return null here
                return null;
            case 'getTabId':
                return new Promise(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        resolve({ tabId: tabs[0]?.id ?? null });
                    });
                });
            case 'setFrameURL':
                // Track frame URL in pageStore
                if (tabId !== undefined && request.frameId !== undefined && request.frameURL) {
                    const pageStore = await pageStoreFromTabId(tabId);
                    if (pageStore) {
                        pageStore.setFrameURL({
                            frameId: request.frameId,
                            frameURL: request.frameURL,
                            parentId: request.parentId,
                        });
                    }
                }
                return { success: true };
            case 'cosmeticFiltersInjected':
                // Store cosmetic filter injection state in pageStoreMap
                if (tabId !== undefined) {
                    try {
                        const stored = await chrome.storage.local.get('pageStoreMap');
                        const pageStoreMap = stored?.pageStoreMap || {};
                        if (!pageStoreMap[tabId]) pageStoreMap[tabId] = {};
                        pageStoreMap[tabId].cosmeticFiltersInjected = request.filters || [];
                        pageStoreMap[tabId].lastCosmeticInjectTime = Date.now();
                        await chrome.storage.local.set({ pageStoreMap });
                    } catch (e) {}
                }
                if (cosmeticFilteringEngine?.addToSelectorCache) {
                    cosmeticFilteringEngine.addToSelectorCache(request);
                }
                response = { success: true };
                break;
            case 'disableGenericCosmeticFilteringSurveyor':
                if (cosmeticFilteringEngine?.disableSurveyor) {
                    cosmeticFilteringEngine.disableSurveyor(request);
                }
                // Store surveyor disabled state
                if (tabId !== undefined) {
                    try {
                        const stored = await chrome.storage.local.get('pageStoreMap');
                        const pageStoreMap = stored?.pageStoreMap || {};
                        if (!pageStoreMap[tabId]) pageStoreMap[tabId] = {};
                        pageStoreMap[tabId].genericSurveyorDisabled = true;
                        await chrome.storage.local.set({ pageStoreMap });
                    } catch (e) {}
                }
                response = { success: true };
                break;
            case 'getCollapsibleBlockedRequests':
                // Get actual blocked element count from pageStore or calculate
                const storedCollapsible = await chrome.storage.local.get('pageStoreMap');
                const pageStoreData = storedCollapsible?.pageStoreMap?.[tabId];
                const blockedCount = pageStoreData?.blockedElementCount || 0;
                response = {
                    id: request.id,
                    hash: request.hash,
                    netSelectorCacheCountMax: cosmeticFilteringEngine?.netSelectorCacheCountMax || 0,
                    blockedCount,
                    collapsible: blockedCount > 0,
                };
                break;
            case 'maybeGoodPopup':
                // Mark popup as potentially good for future allow
                if (tabId !== undefined && request.url) {
                    try {
                        const stored = await chrome.storage.local.get('goodPopups');
                        const goodPopups = stored?.goodPopups || {};
                        if (!goodPopups[tabId]) goodPopups[tabId] = [];
                        const popupHost = new URL(request.url).hostname;
                        if (!goodPopups[tabId].includes(popupHost)) {
                            goodPopups[tabId].push(popupHost);
                            await chrome.storage.local.set({ goodPopups });
                        }
                    } catch (e) {}
                }
                if (µb?.maybeGoodPopup) {
                    µb.maybeGoodPopup.tabId = tabId;
                    µb.maybeGoodPopup.url = request.url;
                }
                response = { success: true };
                break;
            case 'messageToLogger':
                if (logger?.enabled === true && tabId !== undefined) {
                    logger.writeOne({
                        tabId,
                        realm: 'message',
                        type: request.type || 'info',
                        keywords: [ 'scriptlet' ],
                        text: request.text,
                    });
                }
                response = { success: true };
                break;
            case 'shouldRenderNoscriptTags':
                if (tabId !== undefined && filteringContext && µb) {
                    try {
                        const fctxt = filteringContext.fromTabId(tabId);
                        const stored = await chrome.storage.local.get('pageStoreMap');
                        const pageStoreData = stored?.pageStoreMap?.[tabId];
                        if (pageStoreData?.netFilteringSwitch !== false) {
                            await chrome.tabs.executeScript(tabId, {
                                file: '/js/scriptlets/noscript-spoof.js',
                                frameId: sender?.frameId,
                                runAt: 'document_end',
                            });
                        }
                    } catch (e) {
                        console.log('[MV3] shouldRenderNoscriptTags error:', e);
                    }
                }
                response = { success: true };
                break;
            default:
                console.log('[MV3] Unknown content script request:', what);
                return null;
        }
        
        return response;
    }

    // Handle scriptlets channel messages
    async function handleScriptletsMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        let response: any = null;
        const tabId = sender?.tab?.id;
        
        switch (what) {
            case 'inlinescriptFound':
                if (logger?.enabled === true && tabId !== undefined && filteringContext && µb) {
                    try {
                        const fctxt = filteringContext.duplicate();
                        fctxt.fromTabId(tabId)
                            .setType('inline-script')
                            .setURL(request.docURL)
                            .setDocOriginFromURL(request.docURL);
                        // Would need pageStore to check filterRequest
                    } catch (e) {
                        console.log('[MV3] inlinescriptFound error:', e);
                    }
                }
                break;
            case 'logCosmeticFilteringData':
                if (tabId !== undefined) {
                    try {
                        // Log cosmetic filtering data to logger if enabled
                        if (logger?.enabled) {
                            logger.writeOne({
                                tabId,
                                realm: 'cosmetic',
                                type: 'filter',
                                text: request.target || '',
                                selector: request.selector || '',
                            });
                        }
                    } catch (e) {
                        console.log('[MV3] logCosmeticFilteringData error:', e);
                    }
                }
                break;
            case 'securityPolicyViolation':
                if (tabId !== undefined && logger?.enabled) {
                    try {
                        // Log CSP violation to logger
                        logger.writeOne({
                            tabId,
                            realm: 'network',
                            type: 'csp',
                            text: request['violated-directive'] || 'default',
                            url: request.documentURL || '',
                        });
                    } catch (e) {
                        console.log('[MV3] securityPolicyViolation error:', e);
                    }
                }
                break;
            case 'temporarilyAllowLargeMediaElement':
                if (tabId !== undefined) {
                    try {
                        const stored = await chrome.storage.local.get('pageStoreMap');
                        if (stored?.pageStoreMap?.[tabId]) {
                            stored.pageStoreMap[tabId].allowLargeMediaElementsUntil = Date.now() + 5000;
                            await chrome.storage.local.set({ pageStoreMap: stored.pageStoreMap });
                        }
                    } catch (e) {
                        console.log('[MV3] temporarilyAllowLargeMediaElement error:', e);
                    }
                }
                break;
            case 'subscribeTo':
                if (request.location && /^(file|https?):\/\//.test(request.location)) {
                    const url = encodeURIComponent(request.location);
                    const title = encodeURIComponent(request.title || 'Filter List');
                    chrome.tabs.create({
                        url: `/asset-viewer.html?url=${url}&title=${title}&subscribe=1`,
                        active: true,
                    });
                }
                break;
            case 'updateLists':
                const listkeys = (request.listkeys || '').split(',').filter((s: string) => s !== '');
                if (listkeys.length > 0) {
                    try {
                        if (io) {
                            if (listkeys.includes('all')) {
                                io.purge(/./, 'public_suffix_list.dat');
                            } else {
                                for (const listkey of listkeys) {
                                    io.purge(listkey);
                                }
                            }
                        }
                        chrome.tabs.create({
                            url: 'dashboard.html#3p-filters.html',
                            active: true,
                        });
                        // Schedule asset updater
                        const stored = await chrome.storage.local.get('assetUpdaterScheduled');
                        if (!stored?.assetUpdaterScheduled) {
                            await chrome.storage.local.set({ assetUpdaterScheduled: true });
                            setTimeout(async () => {
                                await chrome.storage.local.set({ assetUpdaterScheduled: false });
                            }, 100);
                        }
                    } catch (e) {
                        console.log('[MV3] updateLists error:', e);
                    }
                }
                break;
            default:
                console.log('[MV3] Unknown scriptlets request:', what);
                return vAPI?.messaging?.UNHANDLED || null;
        }
        
        return response;
    }

    // Handle vapi channel messages (userCSS, etc.)
    async function handleVapiMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        const tabId = sender?.tab?.id;
        
        switch (what) {
            case 'userCSS': {
                if (!tabId) return { error: 'No tab ID' };
                const add = payload.add as string[] || [];
                const remove = payload.remove as string[] || [];
                
                try {
                    // Remove old CSS
                    if (remove.length > 0) {
                        for (const css of remove) {
                            try {
                                await chrome.scripting.removeCSS({
                                    target: { tabId },
                                    css: css,
                                });
                            } catch (e) {}
                        }
                    }
                    
                    // Add new CSS
                    if (add.length > 0) {
                        for (const css of add) {
                            try {
                                await chrome.scripting.insertCSS({
                                    target: { tabId },
                                    css: css,
                                });
                            } catch (e) {}
                        }
                    }
                    
                    return { success: true };
                } catch (e) {
                    return { error: (e as Error).message };
                }
            }
            case 'getClientId': {
                return { clientId: 'mv3-' + Date.now() };
            }
            case 'getSessionId': {
                return { sessionId: (globalThis as any).vAPI?.sessionId || 'mv3' };
            }
            default:
                console.log('[MV3] Unknown vapi request:', what);
                return { error: 'Unknown request' };
        }
    }

    async function handleElementPickerMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        
        switch (what) {
            case 'elementPickerArguments': {
                return {
                    target: (self as any).µb?.epickerArgs?.target || '',
                    mouse: (self as any).µb?.epickerArgs?.mouse || false,
                    zap: (self as any).µb?.epickerArgs?.zap || false,
                    eprom: (self as any).µb?.epickerArgs?.eprom || null,
                };
            }
            case 'elementPickerEprom': {
                const eprom = payload.eprom;
                if (eprom) {
                    (self as any).µb = (self as any).µb || {};
                    (self as any).µb.epickerArgs = (self as any).µb.epickerArgs || {};
                    (self as any).µb.epickerArgs.eprom = eprom;
                    await chrome.storage.local.set({ elementPickerEprom: eprom }).catch(() => {});
                }
                return { success: true };
            }
            default:
                return { error: 'Unknown elementPicker request' };
        }
    }

    async function handleCloudWidgetMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        const tabId = sender?.tab?.id;
        const useSync = typeof chrome.storage.sync !== 'undefined';
        const cloudKey = 'cloudData';
        
        switch (what) {
            case 'cloudPull': {
                const stored = useSync 
                    ? await chrome.storage.sync.get(cloudKey)
                    : await chrome.storage.local.get(cloudKey);
                const cloudData = stored?.[cloudKey];
                if (!cloudData) return { error: 'No cloud data' };
                try {
                    const decoded = await decodeCloudData(cloudData);
                    return { 
                        data: decoded, 
                        clientId: decoded.clientId, 
                        lastModified: decoded.lastModified,
                        serverTime: decoded.serverTime,
                    };
                } catch (e) {
                    return { error: (e as Error).message };
                }
            }
            case 'cloudPush': {
                const cloudData = payload.data;
                if (!cloudData) return { error: 'No data to push' };
                try {
                    const dataToPush = {
                        ...cloudData,
                        serverTime: Date.now(),
                        clientTime: Date.now(),
                    };
                    const encoded = await encodeCloudData(dataToPush);
                    if (useSync) {
                        await chrome.storage.sync.set({ cloudData: encoded });
                    } else {
                        await chrome.storage.local.set({ cloudData: encoded });
                    }
                    const storageUsed = useSync 
                        ? await chrome.storage.sync.getBytesInUse()
                        : await chrome.storage.local.getBytesInUse();
                    if (useSync) {
                        await chrome.storage.sync.set({ 
                            cloudStorageUsed: storageUsed,
                            lastCloudSync: Date.now() 
                        });
                    } else {
                        await chrome.storage.local.set({ 
                            cloudStorageUsed: storageUsed,
                            lastCloudSync: Date.now() 
                        });
                    }
                    return { success: true };
                } catch (e) {
                    return { error: (e as Error).message };
                }
            }
            case 'cloudUsed': {
                const used = await chrome.storage.local.getBytesInUse();
                return { used };
            }
            case 'cloudGetOptions': {
                const options = (await chrome.storage.local.get('cloudOptions'))?.cloudOptions || {};
                const userSettings = (await chrome.storage.local.get('userSettings'))?.userSettings || {};
                const syncStorageAvailable = typeof chrome.storage.sync !== 'undefined';
                return {
                    deviceName: options.deviceName || await getDeviceName(),
                    syncEnabled: options.syncEnabled !== false,
                    enabled: userSettings.cloudStorageEnabled === true,
                    cloudStorageSupported: syncStorageAvailable,
                };
            }
            case 'cloudSetOptions': {
                const options = payload as { deviceName?: string; syncEnabled?: boolean };
                const stored = (await chrome.storage.local.get('cloudOptions'))?.cloudOptions || {};
                if (options.deviceName) stored.deviceName = options.deviceName;
                if (typeof options.syncEnabled === 'boolean') stored.syncEnabled = options.syncEnabled;
                await chrome.storage.local.set({ cloudOptions: stored });
                return { success: true };
            }
            default:
                return { error: 'Unknown cloudWidget request' };
        }
    }

    async function handleLoggerUIMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        
        switch (what) {
            case 'loggerElementPicker':
            case 'loggerPing':
            case 'loggerOpen':
            case 'loggerUpdate':
                return { success: true };
            default:
                return { error: 'Unknown loggerUI request' };
        }
    }

    async function handleDomInspectorContentMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        
        switch (what) {
            case 'domInspectorStart':
            case 'domInspectorStop':
                return { success: true };
            default:
                return { error: 'Unknown domInspectorContent request' };
        }
    }

    async function handleDocumentBlockedMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        
        switch (what) {
            case 'getBlockedURL':
                return { url: '', type: '' };
            case 'temporarilyWhitelistDocument': {
                const tabId = sender?.tab?.id;
                if (tabId) {
                    try {
                        await chrome.tabs.reload(tabId);
                    } catch (e) {}
                }
                return { success: true };
            }
            default:
                return { error: 'Unknown documentBlocked request' };
        }
    }

    async function handleDevToolsMessage(request: { what?: string; [key: string]: any }, sender?: chrome.runtime.MessageSender): Promise<any> {
        const { what, ...payload } = request;
        
        switch (what) {
            case 'getInspectorArgs': {
                return {
                    autoCollapse: true,
                    tabId: sender?.tab?.id,
                };
            }
            default:
                return { error: 'Unknown devTools request' };
        }
    }

    function handleRuntimeMessage(
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        console.log('[MV3] handleRuntimeMessage received:', message.topic, message);
        if (!message || !message.topic) return false;

        const { topic, payload, seq } = message;

        if (message.ch === 'content-script') {
            return handleContentScriptMessage(message, sender, sendResponse);
        }

        if ( topic === 'popupPanel' || topic === 'dashboard' ) {
            Promise.resolve(
                topic === 'popupPanel'
                    ? handlePopupPanelMessage(payload || {})
                    : handleDashboardMessage(payload || {}),
            ).then(response => {
                if ( seq !== undefined ) {
                    sendResponse({ seq, payload: response });
                } else {
                    sendResponse(response);
                }
            }).catch(error => {
                sendResponse({ error: (error as Error).message });
            });
            return true;
        }

        const handler = handlers.get(topic);
        console.log('[MV3] Handler for', topic, ':', handler ? 'found' : 'not found');
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
                        chrome.tabs.sendMessage(tab.id, { topic, payload }, () => {
                            void chrome.runtime?.lastError;
                        });
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
        chrome.tabs.sendMessage(tabId, { topic, payload }, (response) => {
            if ( chrome.runtime?.lastError ) {
                if ( typeof callback === 'function' ) {
                    callback(undefined);
                }
                return;
            }
            if ( typeof callback === 'function' ) {
                callback(response);
            }
        });
    }

    function sendToAllTabs(topic: string, payload?: any) {
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { topic, payload }, () => {
                        void chrome.runtime?.lastError;
                    });
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

    // Handle element picker arguments request (for epicker.js)
    Messaging.on('elementPicker', (payload, callback) => {
        if (payload?.what === 'elementPickerArguments') {
            const warSecret = (globalThis as any).vAPI?.warSecret?.short?.() || 
                             Math.random().toString(36).slice(2, 10);
            callback({
                target: epickerArgs.target,
                mouse: epickerArgs.mouse,
                zap: epickerArgs.zap,
                pickerURL: `/web_accessible_resources/epicker-ui.html?zap=${warSecret}`,
                eprom: epickerArgs.eprom || null,
            });
            // Clear target after returning
            epickerArgs.target = '';
            epickerArgs.eprom = null;
        } else if (payload?.what === 'elementPickerEprom') {
            // Handle element picker eprom data - update local storage with picker state
            const eprom = payload.eprom;
            if (eprom) {
                epickerArgs.eprom = eprom;
                chrome.storage.local.set({ elementPickerEprom: eprom }).catch(() => {});
            }
            callback({ success: true });
        } else {
            callback({});
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

    // Handle popupPanel messages (including toggleNetFiltering)
    console.log('[MV3] Registering popupPanel handler');
    Messaging.on('popupPanel', async (payload, callback) => {
        console.log('[MV3] popupPanel message received:', payload);
        try {
            const result = await handlePopupPanelMessage(payload);
            console.log('[MV3] popupPanel result:', result);
            if (callback) callback(result);
        } catch (e) {
            console.error('[MV3] popupPanel error:', e);
            if (callback) callback({ error: (e as Error).message });
        }
    });

// Content script handlers for MV3
Messaging.on('retrieveContentScriptParameters', async (payload, callback) => {
    console.log('[MV3] retrieveContentScriptParameters:', payload);
    try {
        const tabId = payload?._tabId;
        const url = payload?.url || '';
        const frameId = payload?.frameId || 0;
        const hostname = url ? new URL(url).hostname : '';
        const origin = url ? new URL(url).origin : '';
        
        // Get frame ancestor details
        const ancestors: string[] = [];
        if (tabId !== undefined && frameId !== 0) {
            try {
                const stored = await chrome.storage.local.get('pageStoreMap');
                const pageStoreData = stored?.pageStoreMap?.[tabId];
                if (pageStoreData?.frameAncestors) {
                    ancestors.push(...pageStoreData.frameAncestors);
                }
            } catch (e) {}
        }
        
        // Get per-site filtering state
        const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
        const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
        const pageScopeKey = hostname !== '' && url !== '' ? `${hostname}:${url}` : '';
        const netFilteringEnabled = hostname === ''
            ? true
            : perSiteFiltering[pageScopeKey] ?? perSiteFiltering[hostname] ?? true;
        
        // Get user settings from storage
        const stored = await chrome.storage.local.get('userSettings');
        const userSettings = stored.userSettings || popupState.userSettings;
        
        // Get hostname switches
        const hostnameSwitches = await getHostnameSwitchState();
        const noCosmeticFilteringSwitch = hostname !== '' &&
            hostnameSwitches[hostname]?.['no-cosmetic-filtering'] === true;
        const noCosmeticFiltering = netFilteringEnabled === false || noCosmeticFilteringSwitch;
        
        // Get cosmetic filter data
        const storedCosmeticData = await chrome.storage.local.get('cosmeticFiltersData');
        const cosmeticData = parseStoredCosmeticFilterData(storedCosmeticData.cosmeticFiltersData);
        
        // Get trusted scriptlet tokens
        let trustedScriptletTokens: string[] = [];
        try {
            const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
            if (redirectEngine?.getTrustedScriptletTokens) {
                trustedScriptletTokens = redirectEngine.getTrustedScriptletTokens();
            }
        } catch (e) {}
        
        // Build full response like reference
        const response = {
            advancedUserEnabled: userSettings.advancedUserEnabled === true,
            ancestors,
            autoReload: userSettings.autoReload,
            beautify: userSettings.beautify,
            canDevtoolsBridge: false,
            cloudStorageEnabled: typeof chrome.storage.sync !== 'undefined',
            consoleLogEnabled: userSettings.consoleLogEnabled === true,
            contextMenuEnabled: userSettings.contextMenuEnabled === true,
            debugScriptlet: userSettings.debugScriptlet === true,
            extensionPopupEnabled: userSettings.extensionPopupEnabled !== false,
            externalRendererEnabled: false,
            filterAuthorMode: false,
            genericCosmeticFiltersHidden: noCosmeticFiltering,
            getSelection: () => {
                try {
                    return window.getSelection()?.toString() || '';
                } catch (e) { return ''; }
            },
            hidePlaceholders: userSettings.hidePlaceholders === true,
            hostname: hostname,
            ignoreGenericCosmeticFilters: userSettings.ignoreGenericCosmeticFilters === true,
            noCosmeticFiltering,
            noGenericCosmeticFiltering: noCosmeticFiltering,
            noSpecificCosmeticFiltering: noCosmeticFiltering,
            origin,
            pageUrl: url,
            parseAllABPHideFilters: userSettings.parseAllABPHideFilters === true,
            popupPanelType: 'legacy',
            removeWLCollections: () => {},
            scriptletInjectable: true,
            scriptletWillInject: true,
            specificCosmeticFilters: noCosmeticFiltering
                ? { ready: true, injectedCSS: '', proceduralFilters: [], exceptionFilters: [], exceptedFilters: [], convertedProceduralFilters: [], genericCosmeticHashes: [], disableSurveyor: true }
                : buildSpecificCosmeticPayload(hostname, cosmeticData),
            showIconBadge: userSettings.showIconBadge !== false,
            supportWebSocket: true,
            tabId: tabId,
            trustedScriptletTokens,
            url: url,
            userSettings: userSettings,
            userStyles: '',
            userScripts: '',
            webAllowWildcard: true,
            webextFlavor: 'chromium',
        };
        
        console.log('[MV3] retrieveContentScriptParameters response:', response);
        if (callback) callback(response);
    } catch (e) {
        console.error('[MV3] retrieveContentScriptParameters error:', e);
        if (callback) callback({ error: (e as Error).message });
    }
});

Messaging.on('retrieveGenericCosmeticSelectors', async (payload, callback) => {
    console.log('[MV3] retrieveGenericCosmeticSelectors:', payload);
    try {
        const tabId = payload?._tabId;
        const hostname = payload?.hostname || '';
        const pageURL = payload?.url || '';
        const hashes = payload?.hashes || [];
        const exceptions = payload?.exceptions || [];
        const safeOnly = payload?.safeOnly === true;
        const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
        const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
        const pageScopeKey = hostname !== '' && pageURL !== '' ? `${hostname}:${pageURL}` : '';
        const netFilteringEnabled = hostname === ''
            ? true
            : perSiteFiltering[pageScopeKey] ?? perSiteFiltering[hostname] ?? true;
        if ( netFilteringEnabled === false ) {
            const result = { injectedCSS: '', excepted: [] };
            if (callback) callback({ result });
            return;
        }
        
        // Load stored cosmetic filters
        const stored = await chrome.storage.local.get('cosmeticFiltersData');
        const cosmeticData = parseStoredCosmeticFilterData(stored.cosmeticFiltersData);
        
        // Filter by hashes - the content script sends hashes of element classes/ids
        // We need to match these against our stored cosmetic filters
        const selectors: string[] = [];
        
        // Process generic cosmetic filters (apply to all sites)
        const genericFilters = cosmeticData.genericCosmeticFilters || [];
        for (const filter of genericFilters) {
            if (filter.key && hashes.includes(filter.key)) {
                selectors.push(filter.selector);
            }
        }
        
        // Process specific cosmetic filters (apply to specific hostnames)
        const specificFilters = cosmeticData.specificCosmeticFilters || [];
        const pageHostname = payload?.hostname || '';
        
        for (const entry of specificFilters) {
            // Entry is [selector, { matches: [...], key: "..." }]
            const selector = Array.isArray(entry) ? entry[0] : entry;
            const details = Array.isArray(entry) ? entry[1] : {};
            const matches = details?.matches || [];
            
            // Check if this filter applies to the current hostname
            let appliesToHostname = false;
            if (matches.length === 0) {
                // No specific hostnames = applies to all
                appliesToHostname = true;
            } else if (matches.includes('*') || matches.includes(pageHostname)) {
                // Wildcard or exact match
                appliesToHostname = true;
            } else if (pageHostname) {
                // Check for subdomain match
                for (const match of matches) {
                    if (pageHostname === match || pageHostname.endsWith('.' + match)) {
                        appliesToHostname = true;
                        break;
                    }
                }
            }
            
            if (appliesToHostname && details.key && hashes.includes(details.key)) {
                selectors.push(selector);
            }
        }
        
        // Remove exceptions
        const excepted: string[] = [];
        const genericExceptions = cosmeticData.genericCosmeticExceptions || [];
        
        // Filter out selectors that match exceptions
        const filteredSelectors = selectors.filter(selector => {
            // Check if selector or its key is in exceptions
            for (const exc of genericExceptions) {
                if (exc.selector === selector || exc.key === details?.key) {
                    excepted.push(selector);
                    return false;
                }
            }
            return true;
        });
        
        if (filteredSelectors.length === 0 && excepted.length === 0) {
            if (callback) callback({ result: undefined });
            return;
        }
        
        const injectedCSS = filteredSelectors.join(',\n') + '\n{display:none!important;}';
        
        // Inject CSS into the tab
        if (tabId && injectedCSS) {
            try {
                await chrome.scripting.insertCSS({
                    target: { tabId },
                    css: injectedCSS,
                });
            } catch (e) {
                console.warn('[MV3] Failed to insert cosmetic CSS:', e);
            }
        }
        
        const result = {
            injectedCSS,
            excepted,
        };
        
        console.log('[MV3] retrieveGenericCosmeticSelectors result:', result);
        if (callback) callback({ result });
    } catch (e) {
        console.error('[MV3] retrieveGenericCosmeticSelectors error:', e);
        if (callback) callback({ error: (e as Error).message });
    }
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

Messaging.on('getWhitelist', async (_, callback) => {
    await ensurePopupState();
    const response = {
        whitelist: popupState.whitelist || [],
        whitelistDefault: userSettingsDefault.netWhitelistDefault || [],
        reBadHostname: reWhitelistBadHostname.source,
        reHostnameExtractor: reWhitelistHostnameExtractor.source,
    };
    if ( callback ) {
        callback(response);
    }
    return response;
});

Messaging.on('setWhitelist', async (payload, callback) => {
    const whitelist = typeof payload?.whitelist === 'string' 
        ? payload.whitelist.split('\n').filter(Boolean) 
        : [];
    await ensurePopupState();
    popupState.whitelist = whitelist;
    const storage = chrome.storage.local;
    await storage.set({ whitelist: whitelist.join('\n') });
    await syncWhitelistDnrRules();
    
    // Notify about filtering behavior change
    broadcastFilteringBehaviorChanged();
    
    if ( callback ) {
        callback({ success: true });
    }
    return { success: true };
});

Messaging.on('documentBlocked', async (request, callback) => {
    if ( request.what === 'listsFromNetFilter' ) {
        const response: Record<string, any[]> = {};
        const rawFilter = request.rawFilter as string;
        if ( rawFilter ) {
            const results = await findFilterListFromNetFilter(rawFilter);
            if ( results.length > 0 ) {
                response[rawFilter] = results;
            }
        }
        if ( callback ) {
            callback(response);
        }
        return response;
    }
    if ( request.what === 'listsFromCosmeticFilter' ) {
        const response: Record<string, any[]> = {};
        const rawFilter = request.rawFilter as string;
        if ( rawFilter ) {
            const results = await findFilterListFromCosmeticFilter(rawFilter);
            if ( results.length > 0 ) {
                response[rawFilter] = results;
            }
        }
        if ( callback ) {
            callback(response);
        }
        return response;
    }
    if ( request.what === 'closeThisTab' ) {
        const tabId = request._sender?.tab?.id;
        if ( typeof tabId === 'number' ) {
            await chrome.tabs.remove(tabId);
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'temporarilyWhitelistDocument' ) {
        const hostname = request.hostname as string;
        if ( hostname ) {
            // Use webRequest.strictBlockBypass if available
            const webRequest = (globalThis as any).vAPI?.webRequest;
            if (webRequest?.strictBlockBypass) {
                webRequest.strictBlockBypass(hostname);
            }
            
            // Also set session hostname switch for DNR
            await ensurePopupState();
            popupState.sessionHostnameSwitches[`${hostname}:no-strict-blocking`] = true;
            await persistHostnameSwitches();
            await syncHostnameSwitchDnrRules();
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( callback ) {
        callback({ success: false });
    }
    return { success: false };
});

Messaging.on('getAssetContent', async (request, callback) => {
    const url = request.url as string;
    if ( !url ) {
        if ( callback ) {
            callback({ content: '', trustedSource: false });
        }
        return { content: '', trustedSource: false };
    }

    try {
        // Check cache first
        const cached = await chrome.storage.local.get(`assetCache_${url}`);
        if (cached[`assetCache_${url}`]) {
            const cachedData = cached[`assetCache_${url}`];
            const result = {
                content: cachedData.content,
                trustedSource: cachedData.trustedSource || false,
                sourceURL: url,
            };
            if ( callback ) { callback(result); }
            return result;
        }
        
        const response = await fetch(url);
        const content = await response.text();
        
        // Check if this is a trusted source (user filters or trusted list)
        const selectedLists = (await chrome.storage.local.get('selectedFilterLists')).selectedFilterLists || [];
        const isTrusted = selectedLists.some((list: string) => 
            url.includes(list) || url.includes('userfilters')
        );
        
        const result = {
            content,
            trustedSource: isTrusted,
            sourceURL: url,
        };
        
        // Cache the result
        await chrome.storage.local.set({
            [`assetCache_${url}`]: {
                content,
                trustedSource: isTrusted,
                timestamp: Date.now(),
            }
        });
        
        if ( callback ) { callback(result); }
        return result;
    } catch (e) {
        console.error('[MV3] Failed to fetch asset content:', e);
        if ( callback ) {
            callback({ content: '', trustedSource: false });
        }
        return { content: '', trustedSource: false };
    }
});

Messaging.on('getAutoCompleteDetails', async (_, callback) => {
    const stored = await chrome.storage.local.get('userFilters');
    const userFilters = stored?.userFilters || '';
    const lines = userFilters.split('\n').filter(line => line.trim() !== '');
    
    const redirectResources: string[] = [];
    try {
        const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
        if (redirectEngine?.resources) {
            redirectResources.push(...redirectEngine.resources);
        }
    } catch (e) {}
    
    const originHints: string[] = [];
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url) {
                try {
                    const hostname = new URL(tab.url).hostname;
                    if (hostname && !originHints.includes(hostname)) {
                        originHints.push(hostname);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
    
    const result = {
        filterParts: lines.filter(l => !l.startsWith('!') && !l.startsWith('#')),
        filterRegexes: lines.filter(l => l.includes(' regexp')),
        whitelistParts: lines.filter(l => l.startsWith('@@')),
        originHints,
        redirectResources,
        preparseDirectiveHints: ['|', '||', '|https:', '|http:', '^', '*', '~'],
        preparseDirectiveEnv: {
            flavor: 'chromium',
            hasWebSocket: true,
        },
        hintUpdateToken: Date.now().toString(36),
    };
    if ( callback ) { callback(result); }
    return result;
});

Messaging.on('getTrustedScriptletTokens', async (_, callback) => {
    const result: string[] = [];
    try {
        const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
        if (redirectEngine?.getTrustedScriptletTokens) {
            result.push(...redirectEngine.getTrustedScriptletTokens());
        } else if (redirectEngine?.tokens) {
            result.push(...redirectEngine.tokens);
        }
    } catch (e) {}
    if ( callback ) { callback(result); }
    return result;
});

Messaging.on('scriptlets', async (request, callback) => {
    if ( request.what === 'applyFilterListSelection' ) {
        const result = await applyFilterListSelection(request as {
            toSelect?: string[];
            toImport?: string;
            toRemove?: string[];
        });
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'reloadAllFilters' ) {
        const result = await reloadAllFilterLists();
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'getAdvancedSettings' ) {
        const items = await chrome.storage.local.get('advancedSettings');
        const result = items.advancedSettings || {};
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'setAdvancedSettings' ) {
        const settings = request.settings as Record<string, string>;
        if ( settings ) {
            await chrome.storage.local.set({ advancedSettings: settings });
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'createUserFilter' ) {
        const filter = request.filter as string;
        if ( filter ) {
            const items = await chrome.storage.local.get('userFilters');
            const currentFilters = items.userFilters || '';
            const newFilters = currentFilters ? `${currentFilters}\n${filter}` : filter;
            await chrome.storage.local.set({ userFilters: newFilters });
            await reloadAllFilterLists();
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'readHiddenSettings' ) {
        const items = await chrome.storage.local.get('hiddenSettings');
        const result = items.hiddenSettings || {};
        if ( callback ) {
            callback(result);
        }
        return result;
    }
    if ( request.what === 'writeHiddenSettings' ) {
        const settings = request.settings as Record<string, any>;
        if ( settings ) {
            await chrome.storage.local.set({ hiddenSettings: settings });
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'cloudUsed' ) {
        const now = Date.now();
        await chrome.storage.local.set({ lastCloudSync: now });
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( callback ) {
        callback({ success: false });
    }
    return { success: false };
});

Messaging.on('default', async (request, callback) => {
    if ( request.what === 'getAssetContent' ) {
        const url = request.url as string;
        if ( !url ) {
            const result = { content: '', trustedSource: false };
            if ( callback ) { callback(result); }
            return result;
        }
        try {
            const response = await fetch(url);
            const content = await response.text();
            const result = { content, trustedSource: false, sourceURL: url };
            if ( callback ) { callback(result); }
            return result;
        } catch (e) {
            const result = { content: '', trustedSource: false };
            if ( callback ) { callback(result); }
            return result;
        }
    }
    if ( request.what === 'getURL' ) {
        const result = chrome.runtime.getURL(request.path as string);
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'purgeAllCaches' ) {
        try {
            // Get bytes in use before
            const bytesBefore = await chrome.storage.local.getBytesInUse(null);
            
            // Clear all cached data
            const keys = await chrome.storage.local.get(null);
            const cacheKeys = Object.keys(keys).filter(k => 
                k.startsWith('assetCache_') || k.startsWith('cachedAsset_') || k === 'filterLists' || k === 'cachedAssets'
            );
            if (cacheKeys.length > 0) {
                await chrome.storage.local.remove(cacheKeys);
            }
            
            // Get bytes in use after
            const bytesAfter = await chrome.storage.local.getBytesInUse(null);
            
            const formatBytes = (bytes: number): string => {
                if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
                if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
                return bytes + ' B';
            };
            
            const result = { 
                success: true,
                before: formatBytes(bytesBefore),
                after: formatBytes(bytesAfter),
            };
            if ( callback ) { callback(result); }
            return result;
        } catch (e) {
            const result = { success: false, error: (e as Error).message };
            if ( callback ) { callback(result); }
            return result;
        }
    }
    if ( request.what === 'assetViewerRead' ) {
        const assetKey = request.assetKey as string;
        if ( assetKey ) {
            const items = await chrome.storage.local.get('assetViewerReadList');
            const readList: string[] = items.assetViewerReadList || [];
            if ( !readList.includes(assetKey) ) {
                readList.push(assetKey);
                await chrome.storage.local.set({ assetViewerReadList: readList });
            }
        }
        if ( callback ) {
            callback({ success: true });
        }
        return { success: true };
    }
    if ( request.what === 'gotoURL' ) {
        const url = request.url as string;
        const tabId = request.tabId as number;
        const newTab = request.newTab as boolean;
        
        if ( newTab ) {
            const created = await chrome.tabs.create({ url, active: true });
            if ( callback ) { callback({ tabId: created.id }); }
            return { tabId: created.id };
        } else if ( typeof tabId === 'number' ) {
            await chrome.tabs.update(tabId, { url, active: true });
            if ( callback ) { callback({ tabId }); }
            return { tabId };
        } else {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if ( tabs[0]?.id ) {
                await chrome.tabs.update(tabs[0].id, { url, active: true });
                if ( callback ) { callback({ tabId: tabs[0].id }); }
                return { tabId: tabs[0].id };
            }
        }
        if ( callback ) { callback({ success: false }); }
        return { success: false };
    }
    if ( request.what === 'reloadTab' ) {
        const tabId = request.tabId as number;
        const bypassCache = request.bypassCache as boolean;
        
        if ( typeof tabId === 'number' ) {
            await chrome.tabs.reload(tabId, { bypassCache: !!bypassCache });
            if ( callback ) { callback({ success: true }); }
            return { success: true };
        }
        if ( callback ) { callback({ success: false }); }
        return { success: false };
    }
    if ( request.what === 'getHiddenElementCount' ) {
        const tabId = request.tabId as number;
        if ( typeof tabId === 'number' ) {
            try {
                const results = await chrome.tabs.sendMessage(tabId, { what: 'getHiddenElementCount' });
                if ( callback ) { callback(results); }
                return results;
            } catch (e) {
                if ( callback ) { callback({ count: 0 }); }
                return { count: 0 };
            }
        }
        if ( callback ) { callback({ count: 0 }); }
        return { count: 0 };
    }
    if ( request.what === 'getScriptCount' ) {
        const tabId = request.tabId as number;
        if ( typeof tabId === 'number' ) {
            try {
                const results = await chrome.tabs.sendMessage(tabId, { what: 'getScriptCount' });
                if ( callback ) { callback(results); }
                return results;
            } catch (e) {
                if ( callback ) { callback({ count: 0 }); }
                return { count: 0 };
            }
        }
        if ( callback ) { callback({ count: 0 }); }
        return { count: 0 };
    }
    if ( request.what === 'launchReporter' ) {
        const url = request.url as string;
        if ( url ) {
            const reporterUrl = chrome.runtime.getURL(`reporter.html?url=${encodeURIComponent(url)}`);
            await chrome.tabs.create({ url: reporterUrl, active: true });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'readyToFilter' ) {
        const tabId = request.tabId as number;
        const url = request.url as string;
        
        // Return readyToFilter status - just the boolean like reference
        const isReady = popupState.initialized === true;
        
        if ( typeof tabId === 'number' ) {
            try {
                // Signal content script that page is ready for filtering
                await chrome.tabs.sendMessage(tabId, { what: 'readyToFilter', url });
                
                // Update toolbar icon to show filtering is active
                await updateToolbarIcon(tabId, { filtering: true });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback(isReady); }
        return isReady;
    }
    if ( request.what === 'clickToLoad' ) {
        const tabId = request.tabId as number;
        const hostname = request.hostname as string;
        if ( typeof tabId === 'number' && hostname ) {
            try {
                // Notify content script to allow blocked element
                await chrome.tabs.sendMessage(tabId, { what: 'clickToLoad', hostname });
                
                // Update toolbar icon to reflect change
                await updateToolbarIcon(tabId, { clickToLoad: hostname });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'loggerDisabled' ) {
        const tabId = request.tabId as number;
        const hostname = request.hostname as string;
        
        // Clear in-memory filters when logger is disabled
        popupState.inMemoryFilter = '';
        await chrome.storage.local.set({ inMemoryFilter: '' });
        
        if ( typeof tabId === 'number' && hostname ) {
            try {
                await chrome.tabs.sendMessage(tabId, { what: 'clickToLoad', hostname });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'dismissUnprocessedRequest' ) {
        const tabId = request.tabId as number;
        if ( typeof tabId === 'number' ) {
            try {
                await chrome.tabs.sendMessage(tabId, { what: 'dismissUnprocessedRequest' });
            } catch (e) {
                // Ignore errors
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'updateLists' ) {
        await reloadAllFilterLists();
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // scriptlet handler - execute scriptlet in a tab
    if ( request.what === 'scriptlet' ) {
        const tabId = request.tabId as number;
        const scriptletSrc = request.scriptletSrc as string;
        const scriptlet = request.scriptlet as string;
        
        let scriptletFile = scriptletSrc;
        
        // If using scriptlet name (like reference), construct path
        if (!scriptletFile && scriptlet) {
            scriptletFile = `/js/scriptlets/${scriptlet}.js`;
        }
        
        if (typeof tabId === 'number' && scriptletFile) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: [scriptletFile],
                    injectImmediately: false,
                    runAt: 'document_end',
                });
            } catch (e) {
                console.log('[MV3] scriptlet error:', e);
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // createUserFilter - add filter from popup/picker
    if ( request.what === 'createUserFilter' ) {
        const filter = request.filter as string;
        if (filter) {
            try {
                const stored = await chrome.storage.local.get('userFilters');
                const userFilters = stored?.userFilters || '';
                const newFilters = userFilters + '\n' + filter;
                await chrome.storage.local.set({ userFilters: newFilters });
                await reloadAllFilterLists();
            } catch (e) {
                console.log('[MV3] createUserFilter error:', e);
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // getTrustedScriptletTokens - get redirect engine tokens
    if ( request.what === 'getTrustedScriptletTokens' ) {
        const result: string[] = [];
        // Get tokens from redirect engine if available
        try {
            const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
            if (redirectEngine?.tokens) {
                result.push(...redirectEngine.tokens);
            }
        } catch (e) {
            // Return empty array if not available
        }
        if ( callback ) { callback(result); }
        return result;
    }
    // listsFromNetFilter - find filter lists containing a network filter
    if ( request.what === 'listsFromNetFilter' ) {
        const rawFilter = request.rawFilter as string;
        if (rawFilter) {
            const results = await findFilterListFromNetFilter(rawFilter);
            if ( callback ) { callback(results); }
            return results;
        }
        if ( callback ) { callback({}); }
        return {};
    }
    // listsFromCosmeticFilter - find filter lists containing a cosmetic filter
    if ( request.what === 'listsFromCosmeticFilter' ) {
        const rawFilter = request.rawFilter as string;
        if (rawFilter) {
            const results = await findFilterListFromCosmeticFilter(rawFilter);
            if ( callback ) { callback(results); }
            return results;
        }
        if ( callback ) { callback({}); }
        return {};
    }
    if ( request.what === 'getSupportData' ) {
        const items = await chrome.storage.local.get([
            'userSettings', 'filterLists', 'selectedFilterLists', 
            'hiddenSettings', 'whitelist', 'dynamicRules', 'permanentFirewall',
            'permanentSwitches', 'perSiteFiltering', 'cloudData', 'userFilters'
        ]);
        const manifest = chrome.runtime.getManifest();
        
        // Calculate filter counts from lists
        let netFilterCount = 0;
        let cosmeticFilterCount = 0;
        let scriptletFilterCount = 0;
        
        if (items.filterLists) {
            for (const [key, list] of Object.entries(items.filterLists as Record<string, any>)) {
                if (list?.content) {
                    const lines = list.content.split('\n');
                    const netFilters = lines.filter(l => !l.startsWith('!') && !l.startsWith('#') && l.trim() && !l.includes('##') && !l.includes('#@#'));
                    const cosmeticFilters = lines.filter(l => !l.startsWith('!') && (l.includes('##') || l.includes('#@#') || l.includes('#?') || l.includes('##@')));
                    const scriptletFilters = lines.filter(l => !l.startsWith('!') && l.includes('+js('));
                    netFilterCount += netFilters.length;
                    cosmeticFilterCount += cosmeticFilters.length;
                    scriptletFilterCount += scriptletFilters.length;
                }
            }
        }
        
        // Add user filters count
        if (items.userFilters) {
            const userLines = items.userFilters.split('\n');
            netFilterCount += userLines.filter(l => !l.startsWith('!') && l.trim() && !l.includes('##')).length;
            cosmeticFilterCount += userLines.filter(l => !l.startsWith('!') && l.includes('##')).length;
        }
        
        // Try to get counts from filtering engines
        let engineNetFilterCount = 0;
        let engineCosmeticFilterCount = 0;
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine?.acceptedCount) {
                engineNetFilterCount = staticNetFilteringEngine.acceptedCount;
            }
        } catch (e) {}
        
        try {
            const cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
            if (cosmeticFilteringEngine?.acceptedCount) {
                engineCosmeticFilterCount = cosmeticFilteringEngine.acceptedCount;
            }
        } catch (e) {}
        
        // Use engine counts if available
        if (engineNetFilterCount > 0) netFilterCount = engineNetFilterCount;
        if (engineCosmeticFilterCount > 0) cosmeticFilterCount = engineCosmeticFilterCount;
        
        const supportData = {
            userSettings: items.userSettings || {},
            filterLists: items.filterLists || {},
            selectedFilterLists: items.selectedFilterLists || [],
            hiddenSettings: items.hiddenSettings || {},
            netWhitelist: items.whitelist || '',
            dynamicRules: items.dynamicRules || [],
            permanentFirewallRules: items.permanentFirewall || [],
            permanentHostnameSwitches: items.permanentSwitches || [],
            perSiteFiltering: items.perSiteFiltering || {},
            version: manifest?.version || '1.0.0',
            platform: 'chrome',
            netFilterCount,
            cosmeticFilterCount,
            scriptletFilterCount,
            htmlFilterCount: 0,
            cloudStorageUsed: items.cloudData ? JSON.stringify(items.cloudData).length : 0,
            storageUsed: await chrome.storage.local.getBytesInUse(),
        };
        if ( callback ) { callback(supportData); }
        return supportData;
    }
    // DevTools handlers
    if ( request.what === 'snfeBenchmark' ) {
        const result = { duration: 0, count: 0 };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine) {
                const startTime = Date.now();
                const filters = staticNetFilteringEngine.filterParser?.filters;
                const count = filters ? filters.size || 0 : 0;
                
                // Run simple benchmark - count filters
                for (let i = 0; i < 1000; i++) {
                    staticNetFilteringEngine.matchRequest?.('http://example.com/test');
                }
                
                result.duration = Date.now() - startTime;
                result.count = count;
            }
        } catch (e) {
            console.log('[MV3] snfeBenchmark error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'cfeBenchmark' ) {
        const result = { duration: 0, count: 0 };
        try {
            const cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
            if (cosmeticFilteringEngine) {
                const startTime = Date.now();
                const count = cosmeticFilteringEngine.specificFilters?.size || 0;
                
                // Run simple benchmark
                for (let i = 0; i < 1000; i++) {
                    cosmeticFilteringEngine.retrieveSpecificSelectors?.({ hostname: 'example.com' });
                }
                
                result.duration = Date.now() - startTime;
                result.count = count;
            }
        } catch (e) {
            console.log('[MV3] cfeBenchmark error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'sfeBenchmark' ) {
        const result = { duration: 0, count: 0 };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine) {
                const startTime = Date.now();
                const count = staticNetFilteringEngine.acceptedCount || 0;
                
                result.duration = Date.now() - startTime;
                result.count = count;
            }
        } catch (e) {
            console.log('[MV3] sfeBenchmark error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'snfeToDNR' ) {
        const result = { rules: [], errors: [] };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            const stored = await chrome.storage.local.get('userFilters');
            const filterLists = await chrome.storage.local.get('filterLists');
            const selectedLists = await chrome.storage.local.get('selectedFilterLists');
            
            const allFilters: string[] = [];
            
            // Get user filters
            if (stored?.userFilters) {
                allFilters.push(...stored.userFilters.split('\n').filter(l => l.trim() && !l.startsWith('!')));
            }
            
            // Get selected filter list content
            if (selectedLists?.selectedFilterLists && filterLists?.filterLists) {
                for (const listKey of selectedLists.selectedFilterLists) {
                    const listData = filterLists.filterLists[listKey];
                    if (listData?.content) {
                        allFilters.push(...listData.content.split('\n').filter(l => l.trim() && !l.startsWith('!')));
                    }
                }
            }
            
            // Convert to DNR rules (simplified)
            let ruleId = 1;
            for (const filter of allFilters.slice(0, 1000)) {
                try {
                    if (filter.includes('||') || filter.includes('|') || filter.includes('^')) {
                        result.rules.push({
                            id: ruleId++,
                            priority: 1,
                            action: { type: 'block' },
                            condition: { urlFilter: filter.replace(/\*/g, '.*').replace(/\^/g, '.*') }
                        });
                    }
                } catch (e) {}
            }
        } catch (e) {
            result.errors.push((e as Error).message);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'snfeDump' ) {
        const result: any = { 
            filterCount: 0, 
            memoryUse: 0,
            acceptedCount: 0,
            discardedCount: 0,
            filterParser: {},
            hostnameToFilterMapSize: 0,
            domainToFilterMapSize: 0,
        };
        try {
            const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
            if (staticNetFilteringEngine) {
                result.filterCount = staticNetFilteringEngine.acceptedCount || 0;
                result.acceptedCount = staticNetFilteringEngine.acceptedCount || 0;
                result.discardedCount = staticNetFilteringEngine.discardedCount || 0;
                result.memoryUse = result.filterCount * 100;
                result.hostnameToFilterMapSize = staticNetFilteringEngine.hostnameToFilterMap?.size || 0;
                result.domainToFilterMapSize = staticNetFilteringEngine.domainToFilterMap?.size || 0;
                
                // Get filter parser stats
                if (staticNetFilteringEngine.filterParser) {
                    result.filterParser = {
                        filterCount: staticNetFilteringEngine.filterParser.filters?.size || 0,
                        ruleCount: staticNetFilteringEngine.filterParser.rules?.size || 0,
                    };
                }
            }
        } catch (e) {
            console.log('[MV3] snfeDump error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'snfeQuery' ) {
        const result = { matches: [], statistics: {} };
        const url = request.url as string;
        const type = request.type as string;
        if (url) {
            try {
                const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
                const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
                if (staticNetFilteringEngine?.matchRequest) {
                    const startTime = Date.now();
                    const match = staticNetFilteringEngine.matchRequest({ url, type, redirectEngine });
                    const duration = Date.now() - startTime;
                    
                    if (match) {
                        result.matches.push({ 
                            filter: match.filter, 
                            type: match.type,
                            raw: match.raw,
                        });
                    }
                    
                    result.statistics = {
                        duration,
                        url,
                        type,
                        filterCount: staticNetFilteringEngine.acceptedCount || 0,
                    };
                }
            } catch (e) {
                console.log('[MV3] snfeQuery error:', e);
            }
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'cfeDump' ) {
        const result: any = { 
            cosmeticFilterCount: 0, 
            specificFilterCount: 0,
            genericFilterCount: 0,
            acceptedCount: 0,
            discardedCount: 0,
            netSelectorCacheCount: 0,
            proceduralFilterCount: 0,
        };
        try {
            const cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
            if (cosmeticFilteringEngine) {
                result.cosmeticFilterCount = cosmeticFilteringEngine.acceptedCount || 0;
                result.acceptedCount = cosmeticFilteringEngine.acceptedCount || 0;
                result.discardedCount = cosmeticFilteringEngine.discardedCount || 0;
                result.specificFilterCount = cosmeticFilteringEngine.specificFilters?.size || 0;
                result.genericFilterCount = cosmeticFilteringEngine.genericFilters?.size || 0;
                result.netSelectorCacheCount = cosmeticFilteringEngine.netSelectorCacheCountMax || 0;
                result.proceduralFilterCount = cosmeticFilteringEngine.proceduralFilters?.size || 0;
            }
        } catch (e) {
            console.log('[MV3] cfeDump error:', e);
        }
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'purgeAllCaches' ) {
        try {
            // Get bytes in use before
            const bytesBefore = await chrome.storage.local.getBytesInUse(null);
            
            // Clear all cached assets
            const keys = await chrome.storage.local.get(null);
            const cacheKeys = Object.keys(keys).filter(k => k.startsWith('assetCache_') || k.startsWith('cachedAsset_'));
            for (const key of cacheKeys) {
                await chrome.storage.local.remove(key);
            }
            await chrome.storage.local.remove(['filterLists', 'cachedAssets']);
            
            // Get bytes in use after
            const bytesAfter = await chrome.storage.local.getBytesInUse(null);
            
            const result = {
                success: true,
                before: bytesBefore,
                after: bytesAfter,
            };
            if ( callback ) { callback(result); }
            return result;
        } catch (e) {
            const result = { success: false, error: (e as Error).message };
            if ( callback ) { callback(result); }
            return result;
        }
    }
    // Logger UI handlers
    if ( request.what === 'readAll' ) {
        const tabId = request.tabId as number;
        const offset = request.offset as number;
        const limit = request.limit as number;
        const filter = request.filter as string;
        const ownerId = request.ownerId as number;
        
        // Check ownership - if another logger view exists, don't return data
        const loggerOwnerId = popupState.loggerOwnerId;
        if (loggerOwnerId !== undefined && loggerOwnerId !== ownerId) {
            const result = { unavailable: true };
            if ( callback ) { callback(result); }
            return result;
        }
        
        // Set ownership
        popupState.loggerOwnerId = ownerId;
        
        const items = await chrome.storage.local.get('loggerEntries');
        let entries = items?.loggerEntries || [];
        
        // Filter by tabId if provided
        if (typeof tabId === 'number') {
            entries = entries.filter((e: any) => e.tabId === tabId);
        }
        
        // Apply filter if provided
        if (filter) {
            const filterLower = filter.toLowerCase();
            entries = entries.filter((e: any) => {
                const text = e.text || '';
                const url = e.url || '';
                return text.toLowerCase().includes(filterLower) || url.toLowerCase().includes(filterLower);
            });
        }
        
        const userSettings = await chrome.storage.local.get('userSettings');
        const result = {
            entries: entries.slice(offset || 0, (offset || 0) + (limit || 100)),
            total: entries.length,
            colorBlind: userSettings?.userSettings?.colorBlindFriendly || false,
            tooltips: true,
            tabIds: [...new Set(entries.map((e: any) => e.tabId).filter(Boolean))],
        };
        
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'toggleInMemoryFilter' ) {
        const filter = request.filter as string;
        const tabId = request.tabId as number;
        const kind = request.kind as string;
        
        if (filter && typeof tabId === 'number') {
            const stored = await chrome.storage.local.get('loggerInMemoryFilters');
            const filters = stored?.loggerInMemoryFilters || {};
            const tabFilters = filters[tabId] || [];
            
            if (kind === 'add') {
                if (!tabFilters.includes(filter)) {
                    tabFilters.push(filter);
                }
            } else {
                const index = tabFilters.indexOf(filter);
                if (index > -1) tabFilters.splice(index, 1);
            }
            
            filters[tabId] = tabFilters;
            await chrome.storage.local.set({ loggerInMemoryFilters: filters });
        }
        
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'hasInMemoryFilter' ) {
        const filter = request.filter as string;
        const tabId = request.tabId as number;
        
        let hasFilter = false;
        if (filter && typeof tabId === 'number') {
            const stored = await chrome.storage.local.get('loggerInMemoryFilters');
            const filters = stored?.loggerInMemoryFilters || {};
            hasFilter = (filters[tabId] || []).includes(filter);
        }
        
        if ( callback ) { callback({ hasFilter }); }
        return { hasFilter };
    }
    if ( request.what === 'releaseView' ) {
        // Release logger view and clear owner
        const ownerId = request.ownerId as number;
        
        // Check ownership before releasing
        if (ownerId !== popupState.loggerOwnerId) {
            if ( callback ) { callback({ success: false }); }
            return { success: false };
        }
        
        // Clear ownership and in-memory filters
        popupState.loggerOwnerId = undefined;
        popupState.inMemoryFilter = '';
        await chrome.storage.local.set({ loggerOwnerId: null, inMemoryFilter: '' });
        
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'saveURLFilteringRules' ) {
        const rules = request.rules as any[];
        const colors = request.colors as Record<string, string>;
        if (rules) {
            // Save URL filtering rules with colors
            await chrome.storage.local.set({ 
                urlFilteringRules: rules,
                urlFilteringColors: colors || {
                    'allow': '#4caf50',
                    'block': '#f44336',
                    'noop': '#ff9800',
                },
                urlFilteringDirty: false,
            });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'setURLFilteringRule' ) {
        const rule = request.rule as any;
        if (rule) {
            const stored = await chrome.storage.local.get('urlFilteringRules');
            const rules = stored?.urlFilteringRules || [];
            
            // Check if rule already exists and toggle it
            const existingIndex = rules.findIndex((r: any) => 
                r.urlPattern === rule.urlPattern && r.action === rule.action
            );
            
            if (existingIndex >= 0) {
                // Remove existing rule (toggle off)
                rules.splice(existingIndex, 1);
            } else {
                // Add new rule
                rules.push({
                    ...rule,
                    id: Date.now(),
                    created: Date.now(),
                });
            }
            
            await chrome.storage.local.set({ 
                urlFilteringRules: rules,
                urlFilteringDirty: true,
            });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( request.what === 'getURLFilteringData' ) {
        const stored = await chrome.storage.local.get('urlFilteringRules');
        const storedColors = await chrome.storage.local.get('urlFilteringColors');
        const storedDirty = await chrome.storage.local.get('urlFilteringDirty');
        
        // Default URL filtering colors
        const defaultColors = {
            'allow': '#4caf50',
            'block': '#f44336',
            'noop': '#ff9800',
        };
        
        const result = {
            urlFilters: stored?.urlFilteringRules || [],
            colors: storedColors?.urlFilteringColors || defaultColors,
            dirty: storedDirty?.urlFilteringDirty || false,
        };
        if ( callback ) { callback(result); }
        return result;
    }
    // UI styles handlers
    if ( request.what === 'uiStyles' ) {
        const stored = await chrome.storage.local.get('userSettings');
        const hiddenStored = await chrome.storage.local.get('hiddenSettings');
        const userSettings = stored?.userSettings || {};
        const hiddenSettings = hiddenStored?.hiddenSettings || {};
        const dark = typeof self.matchMedia === 'function' &&
            self.matchMedia('(prefers-color-scheme: dark)').matches;
        const accent = userSettings.uiAccentCustom || '#717191';
        
        // Build accent stylesheet
        const accentStylesheet = popupState.uiAccentStylesheet || generateAccentStylesheet(accent, dark);
        
        const result = {
            dark,
            accent,
            uiAccentCustom: userSettings.uiAccentCustom || false,
            uiAccentCustom0: userSettings.uiAccentCustom0 || '#3498d6',
            uiAccentStylesheet: accentStylesheet,
            uiStyles: hiddenSettings.uiStyles || '',
            uiTheme: userSettings.uiTheme || 'default',
        };
        if ( callback ) { callback(result); }
        return result;
    }
    if ( request.what === 'uiAccentStylesheet' ) {
        const stored = await chrome.storage.local.get('userSettings');
        const userSettings = stored?.userSettings || {};
        
        const accent = userSettings.uiAccentCustom || '#717191';
        const dark = userSettings.darkMode === true || 
            (userSettings.darkMode === undefined && 
             typeof window.matchMedia === 'function' && 
             window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        // Build full accent stylesheet
        const result = `
:root {
    --accent: ${accent};
    --accent-light: ${adjustColor(accent, 20)};
    --accent-dark: ${adjustColor(accent, -20)};
    --accent-alpha: ${accent}20;
}

.accent { 
    --accent: ${accent};
}

.accent-light {
    --accent: ${adjustColor(accent, 20)};
}

.accent-dark {
    --accent: ${adjustColor(accent, -20)};
}

${dark ? `
:root {
    --dark: 1;
}
` : ''}
`;
        
        // Store the accent stylesheet in popupState for reference
        popupState.uiAccentStylesheet = result;
        
        if ( callback ) { callback(result); }
        return result;
    }
    // Store custom accent stylesheet when sent from UI
    if ( request.what === 'saveUiAccentStylesheet' ) {
        const stylesheet = request.stylesheet as string;
        if (typeof stylesheet === 'string') {
            popupState.uiAccentStylesheet = stylesheet;
            await chrome.storage.local.set({ uiAccentStylesheet: stylesheet });
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    // DOM Inspector args
    if ( request.what === 'getInspectorArgs' ) {
        const tabId = request.tabId as number;
        const frameId = request.frameId as number;
        
        // Create BroadcastChannel for inspector communication
        try {
            const bc = new BroadcastChannel('contentInspectorChannel');
            bc.postMessage({
                topic: 'inspector',
                tabId,
                frameId,
                timestamp: Date.now(),
            });
            bc.close();
        } catch (e) {
            // BroadcastChannel not available
        }
        
        // Get war secret for secure URL
        const warSecret = (globalThis as any).vAPI?.warSecret?.short?.() || 
                         Math.random().toString(36).slice(2, 10);
        
        const result = {
            tabId,
            frameId,
            inspectorURL: `/web_accessible_resources/dom-inspector.html?secret=${warSecret}`,
        };
        if ( callback ) { callback(result); }
        return result;
    }
    // launchElementPicker
    if ( request.what === 'launchElementPicker' ) {
        const tabId = request.tabId as number;
        const frameId = request.frameId as number;
        const target = request.target as string;
        
        // Clear context menu coordinates like reference does
        epickerArgs.mouse = '';
        
        if (typeof tabId === 'number') {
            try {
                // Set the target for the picker
                epickerArgs.target = target || '';
                
                await chrome.tabs.executeScript(tabId, {
                    file: '/js/contentscript-extra.js',
                    frameId: frameId || 0,
                    matchAboutBlank: true,
                    runAt: 'document_start',
                });
            } catch (e) {
                console.log('[MV3] launchElementPicker error:', e);
            }
        }
        if ( callback ) { callback({ success: true }); }
        return { success: true };
    }
    if ( callback ) {
        callback(undefined);
    }
    return undefined;
});

const findFilterListFromNetFilter = async (rawFilter: string): Promise<any[]> => {
    const results: any[] = [];
    if (!rawFilter || rawFilter.trim() === '') {
        return results;
    }
    
    // Normalize the filter for searching
    const normalizedFilter = rawFilter.trim().toLowerCase();
    const isWhitelist = normalizedFilter.startsWith('@@');
    const filterPattern = isWhitelist ? normalizedFilter.slice(2) : normalizedFilter;
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        // Also check user filters
        const userFiltersContent = stored.userFilters || '';
        
        // Check user filters first
        if (userFiltersContent.toLowerCase().includes(filterPattern)) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        // Check selected filter lists
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                // Check for exact match or partial match
                if (content.includes(filterPattern) || content.includes(normalizedFilter)) {
                    results.push({
                        assetKey: listKey,
                        title: listInfo.title,
                        supportURL: listInfo.supportURL || '',
                        description: listInfo.description || '',
                        type: 'list',
                    });
                }
            }
        }
        
    } catch (e) {
        console.error('[MV3] findFilterListFromNetFilter error:', e);
    }
    return results;
};

const findFilterListFromCosmeticFilter = async (rawFilter: string): Promise<any[]> => {
    const results: any[] = [];
    if (!rawFilter || rawFilter.trim() === '') {
        return results;
    }
    
    // Normalize cosmetic filter for searching
    // Remove ## or #@# prefix
    const normalizedFilter = rawFilter.trim()
        .replace(/^##/, '')
        .replace(/^#@#/, '')
        .replace(/^#@/, '')
        .replace(/^##/, '')
        .toLowerCase();
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        // Check user filters for cosmetic rules
        const userFiltersContent = stored.userFilters || '';
        if (userFiltersContent.toLowerCase().includes(normalizedFilter) || 
            userFiltersContent.toLowerCase().includes(rawFilter.trim().toLowerCase())) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        // Check selected filter lists for cosmetic rules
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                // Look for cosmetic filter patterns
                if (content.includes(`##${normalizedFilter}`) || 
                    content.includes(`#@#${normalizedFilter}`) ||
                    content.includes(rawFilter.trim().toLowerCase())) {
                    results.push({
                        assetKey: listKey,
                        title: listInfo.title,
                        supportURL: listInfo.supportURL || '',
                        description: listInfo.description || '',
                        type: 'list',
                    });
                }
            }
        }
        
    } catch (e) {
        console.error('[MV3] findFilterListFromCosmeticFilter error:', e);
    }
    return results;
};

Messaging.on('pickerContextMenuPoint', (payload, callback) => {
    const tabId = typeof payload?._tabId === 'number' ? payload._tabId : payload?._sender?.tab?.id;
    const frameId = typeof payload?._sender?.frameId === 'number' ? payload._sender.frameId : 0;
    if (
        typeof tabId === 'number' &&
        typeof payload?.x === 'number' &&
        typeof payload?.y === 'number'
    ) {
        pickerContextPoints.set(pickerContextPointKey(tabId, frameId), {
            tabId,
            frameId,
            x: payload.x,
            y: payload.y,
            timestamp: Date.now(),
            target: payload?.target && typeof payload.target.selector === 'string'
                ? { selector: payload.target.selector }
                : undefined,
        });
    }
    if ( callback ) {
        callback({ success: true });
    }
    return { success: true };
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
        trackPendingRequest(details as chrome.webRequest.WebRequestBodyDetails);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.webRequest.onCompleted.addListener(
    details => {
        void finalizeTrackedRequest(details, false);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.webRequest.onErrorOccurred.addListener(
    details => {
        void finalizeTrackedRequest(details, true);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.tabs.onRemoved.addListener(tabId => {
    void clearTabRequestState(tabId);
    const pageStore = pageStores.get(tabId);
    if (pageStore) {
        pageStore.disposeFrameStores();
        pageStores.delete(tabId);
    }
});

// Inject YouTube ad blocking script into page context immediately
chrome.webNavigation?.onCommitted?.addListener(async (details) => {
    if (details.frameId !== 0) { return; }
    await applyPersistedHostnameSwitchesForTab(details.tabId, details.url);
    
    const url = details.url;
    if (!url || !url.includes('youtube.com')) { return; }
    
    if (chrome.scripting?.executeScript === undefined) {
        console.log('[MV3] chrome.scripting not available');
        return;
    }
    
    console.log('[MV3] Injecting YouTube ad blocker early into tab', details.tabId);
    
    try {
        await chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            world: 'MAIN',
            func: () => {
                // This runs in the page context at document_start
                console.log('[YT-MAIN] Early page context injection');
                
                // Patch fetch immediately
                const originalFetch = window.fetch;
                window.fetch = function(...args) {
                    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
                    if (url && url.includes('youtube.com/youtubei/v1/player')) {
                        console.log('[YT-MAIN] Fetch to player API');
                    }
                    return originalFetch.apply(this, args).then((response: Response) => {
                        if (url && url.includes('youtube.com/youtubei/v1/player') && response.ok) {
                            return response.clone().text().then((text: string) => {
                                if (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"')) {
                                    console.log('[YT-MAIN] Stripping ad data from fetch');
                                    try {
                                        const json = JSON.parse(text);
                                        const stripAdData = (obj: any): any => {
                                            if (obj === null || obj === undefined) return obj;
                                            if (typeof obj !== 'object') return obj;
                                            const newObj: any = Array.isArray(obj) ? [] : {};
                                            for (const key of Object.keys(obj)) {
                                                if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) {
                                                    console.log('[YT-MAIN] Stripping:', key);
                                                    continue;
                                                }
                                                try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                                            }
                                            return newObj;
                                        };
                                        const stripped = stripAdData(json);
                                        return new Response(JSON.stringify(stripped), {
                                            status: response.status,
                                            statusText: response.statusText,
                                            headers: response.headers
                                        });
                                    } catch {}
                                }
                                return response;
                            });
                        }
                        return response;
                    });
                };
                
                // Patch XHR immediately
                const originalOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method: string, url: string) {
                    (this as any)._isYtPlayer = url && (url.includes('youtube.com/youtubei/v1/player') || url.includes('youtube.com/apiManifest'));
                    return originalOpen.apply(this, arguments);
                };
                
                const originalSend = XMLHttpRequest.prototype.send;
                XMLHttpRequest.prototype.send = function(body?: any) {
                    if ((this as any)._isYtPlayer) {
                        console.log('[YT-MAIN] XHR to player API');
                        this.addEventListener('load', function() {
                            const text = this.responseText;
                            if (text && (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"'))) {
                                console.log('[YT-MAIN] Stripping ad data from XHR');
                                try {
                                    const json = JSON.parse(text);
                                    const stripAdData = (obj: any): any => {
                                        if (obj === null || obj === undefined) return obj;
                                        if (typeof obj !== 'object') return obj;
                                        const newObj: any = Array.isArray(obj) ? [] : {};
                                        for (const key of Object.keys(obj)) {
                                            if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) continue;
                                            try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                                        }
                                        return newObj;
                                    };
                                    const stripped = JSON.stringify(stripAdData(json));
                                    Object.defineProperty(this, 'responseText', { value: stripped, writable: false, configurable: true });
                                    Object.defineProperty(this, 'response', { value: stripped, writable: false, configurable: true });
                                } catch {}
                            }
                        });
                    }
                    return originalSend.apply(this, arguments);
                };
                
                // Patch JSON.parse immediately  
                const originalJSONParse = JSON.parse;
                JSON.parse = function(text: string, reviver?: (key: string, value: any) => any) {
                    const result = originalJSONParse.call(this, text, reviver);
                    if (text && (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"'))) {
                        console.log('[YT-MAIN] JSON.parse catching ad data');
                        try {
                            const stripAdData = (obj: any): any => {
                                if (obj === null || obj === undefined) return obj;
                                if (typeof obj !== 'object') return obj;
                                const newObj: any = Array.isArray(obj) ? [] : {};
                                for (const key of Object.keys(obj)) {
                                    if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) continue;
                                    try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                                }
                                return newObj;
                            };
                            return stripAdData(result);
                        } catch {}
                    }
                    return result;
                };
                
                console.log('[YT-MAIN] All patches applied');
            },
        });
        console.log('[MV3] Early injection complete for tab', details.tabId);
    } catch (e) {
        console.error('[MV3] Failed to inject:', e);
    }
}, { url: [{ urlContains: 'youtube.com' }] });

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('uBlock Origin installed');
    } else if (details.reason === 'update') {
        console.log('uBlock Origin updated');
    }
});

console.log('uBlock Origin MV3 Service Worker started');

ensurePopupState()
    .then(() => {
        syncFirewallDnrRules();
        syncFilterListDnrRules();
        syncPowerSwitchDnrRules();
        syncHostnameSwitchDnrRules();
        syncWhitelistDnrRules();
    })
    .catch(error => {
        console.error('Failed to initialize popup/firewall state', error);
    });

(self as any).µBlockMV3 = {
    userSettings: popupState.userSettings,
    permanentFirewall: popupState.permanentFirewall,
    sessionFirewall: popupState.sessionFirewall,
};

(self as any).Messaging = Messaging;
(self as any).Zapper = Zapper;
(self as any).Picker = Picker;

// elementPickerExec - called from context menu to launch the element picker
(self as any).µb = {
    elementPickerExec: async function(tabId: number, frameId: number, target?: string) {
        const point = getPickerContextPoint(tabId, 0) || getPickerContextPoint(tabId, frameId);
        await launchPickerInTab(tabId, 0, {
            initialPoint: point ? { x: point.x, y: point.y } : undefined,
            target,
            exactTarget: point?.target,
        });
        return { success: true };
    },
    userSettings: popupState.userSettings,
    hiddenSettings: {},
    hiddenSettingsDefault: {},
    requestStats: {
        allowedCount: 0,
        blockedCount: 0,
    },
    readyToFilter: false,
    netWhitelist: [] as string[],
    netWhitelistDefault: [] as string[],
    reWhitelistBadHostname: /(^|\.)(localhost|localhost\.localdomain|127\.0\.0\.1|0\.0\.0\.0|255\.255\.255\.255)$/,
    reWhitelistHostnameExtractor: /^https?:\/\/([^/:]+)/,
    selectedFilterLists: [] as string[],
    pageStores: pageStores,
    pageStoresToken: pageStoresToken,
    cloudStorageSupported: typeof chrome.storage.sync !== 'undefined',
    privacySettingsSupported: typeof navigator !== 'undefined' && typeof navigator.connection !== 'undefined',
    restoreBackupSettings: {},
    userFiltersPath: 'user-filters',
    maybeGoodPopup: { tabId: 0, url: '' },
    epickerArgs: { target: '', mouse: false, zap: false, eprom: null },
    tabContextManager: {
        mustLookup: (tabId: number) => ({ tabId, hostname: '' }),
        lookup: (tabId: number) => null,
    },
    arrayFromWhitelist: (whitelist: string[]) => {
        if (!whitelist) return [];
        return whitelist.split('\n').filter(line => line.trim() !== '');
    },
    whitelistFromString: (str: string) => {
        if (!str) return '';
        return str.split('\n').filter(line => line.trim() !== '').join('\n');
    },
    isTrustedList: (assetKey: string) => {
        return popupState.trustedLists?.[assetKey] === true;
    },
    userFiltersAreEnabled: () => {
        return popupState.userSettings.filteringEnabled !== false;
    },
    changeUserSettings: (name: string, value: any) => {
        popupState.userSettings[name] = value;
        return { done: true };
    },
    getModifiedSettings: (settings: any, defaults: any) => {
        const modified: any = {};
        for (const key in settings) {
            if (settings[key] !== defaults[key]) {
                modified[key] = settings[key];
            }
        }
        return modified;
    },
    getAvailableLists: () => {
        return getFilterListState();
    },
    dateNowToSensibleString: () => {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    },
    getBytesInUse: async () => {
        const result = await chrome.storage.local.getBytesInUse();
        return result;
    },
    saveLocalSettings: async () => {
        await chrome.storage.local.set({ userSettings: popupState.userSettings });
    },
    saveWhitelist: async () => {
        await chrome.storage.local.set({ whitelist: popupState.whitelist.join('\n') });
    },
    saveUserFilters: async (filters: string) => {
        await chrome.storage.local.set({ userFilters: filters });
        await reloadAllFilterLists();
    },
    loadUserFilters: async () => {
        const stored = await chrome.storage.local.get('userFilters');
        return stored?.userFilters || '';
    },
    saveSelectedFilterLists: async (lists: string[]) => {
        await chrome.storage.local.set({ selectedFilterLists: lists });
    },
    savePermanentFirewallRules: async () => {
        await persistPermanentFirewall();
    },
    saveHostnameSwitches: async () => {
        await persistPermanentHostnameSwitches();
    },
    savePermanentURLFilteringRules: async () => {
        await persistURLFilteringRules();
    },
    loadFilterLists: async () => {
        await reloadAllFilterLists();
    },
    applyFilterListSelection: async (request: any) => {
        return applyFilterListSelection(request);
    },
    createUserFilters: async (request: any) => {
        await chrome.storage.local.set({ userFilters: request.filters || '' });
        await reloadAllFilterLists();
        return { success: true };
    },
    updateToolbarIcon: async (tabId: number, state: number | { filtering?: boolean; largeMedia?: boolean; noPopups?: boolean }) => {
        await updateToolbarIcon(tabId, state);
    },
    openNewTab: async (details: { url: string; select?: boolean; index?: number }) => {
        const created = await chrome.tabs.create({
            url: details.url,
            active: details.select !== false,
            index: details.index,
        });
        return { tabId: created.id };
    },
    clearInMemoryFilters: () => {
        popupState.inMemoryFilter = '';
    },
    toggleHostnameSwitch: (request: any) => {
        return toggleHostnameSwitch(request);
    },
    getTabId: (sender: any) => sender?.tab?.id,
    pageStoreFromTabId: pageStoreFromTabId,
};

// Create context menu for "Block element..."
function createContextMenu() {
    if (typeof chrome.contextMenus === 'undefined') {
        console.log('[MV3] chrome.contextMenus not available');
        return;
    }
    
    chrome.contextMenus.removeAll(() => {
        if ( popupState.userSettings.contextMenuEnabled === false ) {
            return;
        }
        chrome.contextMenus.create({
            id: 'uBlock0-blockElement',
            title: 'Block element...',
            contexts: ['all'],
            documentUrlPatterns: ['http://*/*', 'https://*/*']
        }, () => {
            console.log('[MV3] Context menu created');
        });
    });
}

chrome.contextMenus?.onClicked?.addListener((details, tab) => {
    if (details.menuItemId === 'uBlock0-blockElement' && tab) {
        const tabId = tab.id;
        if ( typeof tabId !== 'number' ) { return; }
        const frameId = typeof details.frameId === 'number' ? details.frameId : 0;
        let target = '';
        
        // Build target from context menu details
        if (details.linkUrl) {
            target = `a\t${details.linkUrl}`;
        } else if (details.srcUrl) {
            if (details.mediaType === 'image') {
                target = `img\t${details.srcUrl}`;
            } else if (details.mediaType === 'video') {
                target = `video\t${details.srcUrl}`;
            } else if (details.mediaType === 'audio') {
                target = `audio\t${details.srcUrl}`;
            } else {
                target = `${details.tagName || 'img'}\t${details.srcUrl}`;
            }
        } else if (details.frameUrl) {
            target = `iframe\t${details.frameUrl}`;
        } else if (details.tagName) {
            target = details.tagName;
        }
        
        console.log('[MV3] Context menu clicked - target:', target);
        
        // Call elementPickerExec
        void (self as any).µb.elementPickerExec(tabId, frameId, target).catch(error => {
            console.error('[MV3] Failed to launch picker from context menu', error);
        });
    }
});

// Create context menu on service worker startup
createContextMenu();
