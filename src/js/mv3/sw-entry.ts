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

const getLegacyMessaging = (): LegacyMessagingAPI | undefined => {
    return (globalThis as any).vAPI?.messaging;
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
    colorBlindFriendly: false,
    contextMenuEnabled: true,
    ignoreGenericCosmeticFilters: false,
    importedLists: [] as string[],
    parseAllABPHideFilters: true,
    firewallPaneMinimized: true,
    popupPanelSections: 0b111,
    suspendUntilListsAreLoaded: false,
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
const POWER_RULE_ID_MIN = 9_100_000;
const POWER_RULE_ID_MAX = 9_199_999;
const HOSTNAME_SWITCH_RULE_ID_MIN = 9_200_000;
const HOSTNAME_SWITCH_RULE_ID_MAX = 9_299_999;

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
const syncFilterListDnrRules = async () => {
    if ( chrome.declarativeNetRequest === undefined ) { 
        console.log('[DNR] DNR not available');
        return; 
    }
    
    try {
        // Get selected filter lists
        const stored = await chrome.storage.local.get('selectedFilterLists');
        const selectedLists = normalizeSelectedFilterLists(stored.selectedFilterLists);
        
        console.log('[DNR] Selected lists:', selectedLists);
        
        if ( selectedLists.length === 0 ) {
            console.log('[DNR] No filter lists selected');
            return;
        }

        // Get catalog
        const catalog = await fetchFilterListCatalog();
        console.log('[DNR] Catalog keys:', Object.keys(catalog).slice(0, 5));
        
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
            if ( !asset || !asset.asset ) { 
                console.log('[DNR] Skipping list (no asset):', listKey);
                continue; 
            }
            
            // Load from bundled asset
            const assetPath = `assets/${asset.asset}`;
            console.log('[DNR] Loading:', assetPath);
            try {
                const response = await fetch(chrome.runtime.getURL(assetPath));
                if ( response.ok ) {
                    const text = await response.text();
                    filterLists.push({ key: listKey, text });
                    console.log('[DNR] Loaded:', listKey, text.length, 'chars');
                } else {
                    console.log('[DNR] Failed to load:', listKey, response.status);
                }
            } catch ( e ) {
                console.warn('[DNR] Failed to load filter list:', listKey, e);
            }
        }

        console.log('[DNR] Total lists loaded:', filterLists.length);
        
        if ( filterLists.length === 0 ) {
            console.log('[DNR] No filter lists loaded');
            return;
        }

        console.log('[DNR] Compiling', filterLists.length, 'filter lists to DNR rules...');

        // Import the DNR conversion function (from built JS)
        const { dnrRulesetFromRawLists } = await import('../static-dnr-filtering.js');
        
        // Compile to DNR rules
        const dnrData = await dnrRulesetFromRawLists(
            filterLists.map(f => ({ text: f.text })),
            { env: [] }
        );

        console.log('[DNR] Result:', dnrData);
        
        if ( !dnrData?.network?.ruleset ) {
            console.log('[DNR] No network rules from filter lists');
            return;
        }

        console.log('[DNR] Generated rules:', dnrData.network.ruleset.length);

        // Get existing rules and remove old filter list rules (ID range 100-9999)
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const removeRuleIds = existingRules
            .map(rule => rule.id)
            .filter(id => id >= 100 && id < 10000);

        // Assign IDs to new rules (start at 100 to avoid conflicts with firewall rules)
        const addRules = dnrData.network.ruleset.map((rule: any, index: number) => ({
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
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= FIREWALL_RULE_ID_MIN && id <= FIREWALL_RULE_ID_MAX);
    const addRules = compileFirewallRulesToDnr(popupState.sessionFirewall);
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
    const hostnameSwitches = await getHostnameSwitchState();
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
        .map(rule => rule.id)
        .filter(id => id >= HOSTNAME_SWITCH_RULE_ID_MIN && id <= HOSTNAME_SWITCH_RULE_ID_MAX);
    const addRules = compileHostnameSwitchDnrRules(hostnameSwitches);
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

    // Get per-site filtering state
    const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
    const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
    const hostnameSwitches = await getHostnameSwitchState();
    
    // Determine if filtering is enabled for this page
    let netFilteringEnabled = true;
    if (pageHostname) {
        const pageScopeKey = pageHostname;
        const pageUrlScopeKey = `${pageHostname}:${pageURL}`;
        // Check page-specific setting first, then hostname setting
        netFilteringEnabled = perSiteFiltering[pageUrlScopeKey] ?? perSiteFiltering[pageScopeKey] ?? true;
    }

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
        popupBlockedCount: switchMetrics.popupBlockedCount,
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
        netFilteringSwitch: netFilteringEnabled,
        canElementPicker: /^https?:/.test(pageURL),
        noPopups,
        noCosmeticFiltering,
        noLargeMedia,
        largeMediaCount: switchMetrics.largeMediaCount,
        noRemoteFonts,
        remoteFontCount: switchMetrics.remoteFontCount,
        noScripting,
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
        if ( request.name === 'contextMenuEnabled' ) {
            createContextMenu();
        }
    }
    return { ...popupState.userSettings };
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

    const hostnameSwitches = await getHostnameSwitchState();
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

    await chrome.storage.local.set({ hostnameSwitches });
    await syncHostnameSwitchDnrRules();

    if ( typeof tabId === 'number' ) {
        await applyImmediateHostnameSwitchEffects(tabId, name, enabled);
    }

    return getPopupData(request);
};

const handlePopupPanelMessage = async (request: PopupRequest) => {
    switch ( request.what ) {
    case 'getPopupData':
        return getPopupData(request);
    case 'toggleNetFiltering':
        return handleDashboardMessage(request);
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
        const { tabId, bypassCache } = request;
        if (tabId) {
            chrome.tabs.reload(tabId, { bypassCache: !!bypassCache });
        }
        return {};
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
                const response = await handleContentScriptRequest(msg || {});
                respond(response);
            } catch (error) {
                console.error('[MV3] contentscript error:', error);
                respond({ error: (error as Error).message });
            }
            return;
        }

        // Handle scriptlets channel
        if ( channel === 'scriptlets' ) {
            respond({});
            return;
        }

        console.log(`MV3: ${channel} channel - legacy not supported, returning empty response`);
        respond(null);
    }

    // Handle content script requests from the contentscript messaging channel
    async function handleContentScriptRequest(request: { what?: string; [key: string]: any }): Promise<any> {
        const { what, ...payload } = request;
        
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
            default:
                console.log('[MV3] Unknown content script request:', what);
                return null;
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
            callback({
                target: epickerArgs.target,
                mouse: epickerArgs.mouse,
                zap: epickerArgs.zap,
                pickerURL: '/web_accessible_resources/epicker-ui.html',
            });
            // Clear target after returning
            epickerArgs.target = '';
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
        const hostname = url ? new URL(url).hostname : '';
        const storedFiltering = await chrome.storage.local.get('perSiteFiltering');
        const perSiteFiltering: Record<string, boolean> = storedFiltering?.perSiteFiltering || {};
        const pageScopeKey = hostname !== '' && url !== '' ? `${hostname}:${url}` : '';
        const netFilteringEnabled = hostname === ''
            ? true
            : perSiteFiltering[pageScopeKey] ?? perSiteFiltering[hostname] ?? true;
        
        // Get user settings from storage
        const stored = await chrome.storage.local.get('userSettings');
        const userSettings = stored.userSettings || popupState.userSettings;
        
        const hostnameSwitches = await getHostnameSwitchState();
        const noCosmeticFilteringSwitch = hostname !== '' &&
            hostnameSwitches[hostname]?.['no-cosmetic-filtering'] === true;
        const noCosmeticFiltering = netFilteringEnabled === false || noCosmeticFilteringSwitch;
        const storedCosmeticData = await chrome.storage.local.get('cosmeticFiltersData');
        const cosmeticData = parseStoredCosmeticFilterData(storedCosmeticData.cosmeticFiltersData);

        const response = {
            advancedUserEnabled: userSettings.advancedUserEnabled === true,
            autoReload: userSettings.autoReload,
            beautify: userSettings.beautify,
            cloudStorageEnabled: false,
            consoleLogEnabled: userSettings.consoleLogEnabled,
            contextMenuEnabled: userSettings.contextMenuEnabled,
            debugScriptlet: userSettings.debugScriptlet,
            extensionPopupEnabled: userSettings.extensionPopupEnabled,
            externalRendererEnabled: false,
            genericCosmeticFiltersHidden: false,
            getSelection: () => window.getSelection()?.toString() || '',
            hidePlaceholders: userSettings.hidePlaceholders === true,
            hostname: hostname,
            ignoreGenericCosmeticFilters: userSettings.ignoreGenericCosmeticFilters === true,
            ioPush: () => {},
            noCosmeticFiltering,
            noGenericCosmeticFiltering: noCosmeticFiltering,
            noSpecificCosmeticFiltering: noCosmeticFiltering,
            parseAllABPHideFilters: userSettings.parseAllABPHideFilters === true,
            popupPanelType: 'legacy',
            removeWLCollections: () => {},
            specificCosmeticFilters: noCosmeticFiltering
                ? { ready: true, injectedCSS: '', proceduralFilters: [], exceptionFilters: [], exceptedFilters: [], convertedProceduralFilters: [], genericCosmeticHashes: [], disableSurveyor: true }
                : buildSpecificCosmeticPayload(hostname, cosmeticData),
            showIconBadge: userSettings.showIconBadge,
            storage: null,
            tabId: tabId,
            userSettings: userSettings,
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
        const genericFilters = cosmeticData.genericCosmeticFilters || [];
        
        // Simple matching - in a full implementation this would use proper hash lookup
        for (const filter of genericFilters) {
            if (filter.key && hashes.includes(filter.key)) {
                selectors.push(filter.selector);
            }
        }
        
        // Remove exceptions
        const excepted: string[] = [];
        const filteredSelectors = selectors.filter(selector => {
            if (exceptions.includes(selector)) {
                excepted.push(selector);
                return false;
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
        recordTabRequest(details as chrome.webRequest.WebRequestBodyDetails);
    },
    { urls: [ '<all_urls>' ] },
);

chrome.tabs.onRemoved.addListener(tabId => {
    void clearTabRequestState(tabId);
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
        // Match the popup picker path: always launch in the top page frame.
        // Keep the saved point/target when it came from the top frame, and only
        // fall back to the clicked frame's stored point if needed.
        const point = getPickerContextPoint(tabId, 0) || getPickerContextPoint(tabId, frameId);
        await launchPickerInTab(tabId, 0, {
            initialPoint: point ? { x: point.x, y: point.y } : undefined,
            target,
            exactTarget: point?.target,
        });
        return { success: true };
    },
    userSettings: popupState.userSettings,
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
