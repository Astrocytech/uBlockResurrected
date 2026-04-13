/*******************************************************************************

    uBlock Origin - MV3 Service Worker Types
    https://github.com/gorhill/uBlock

    This file contains all TypeScript types, interfaces, and constants
    used by the MV3 service worker.

******************************************************************************/

export type LegacyMessage = {
    channel?: string;
    msgId?: number;
    msg?: any;
};

export type PopupRequest = {
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

export type TabRequestState = {
    startedAt: number;
    pageHostname: string;
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

export type PendingRequestInfo = {
    tabId: number;
    url: string;
    type: chrome.webRequest.ResourceType;
};

export type TabSwitchMetrics = {
    popupBlockedCount: number;
    largeMediaCount: number;
    remoteFontCount: number;
    scriptCount: number;
};

export type CollectedHostnameData = {
    pageCounts: FirewallCounts;
    hostnameDict: Record<string, HostnameDetails>;
};

export type HostnameSwitchState = Record<string, Partial<Record<string, boolean>>>;

export type LegacyMessagingAPI = {
    ports: Map<string, any>;
    listeners: Map<string, { fn: (request: any, sender: any, callback: (response?: any) => void) => any; privileged?: boolean }>;
    defaultHandler: null | ((request: any, sender: any, callback: (response?: any) => void) => any);
    PRIVILEGED_ORIGIN: string;
    UNHANDLED: string;
    on?: (topic: string, handler: any) => void;
    onFrameworkMessage?: (request: any, port: chrome.runtime.Port, callback: (response?: any) => void) => void;
    onPortDisconnect?: (port: chrome.runtime.Port) => void;
};

export type LegacyPortDetails = {
    port: chrome.runtime.Port;
    frameId?: number;
    frameURL?: string;
    privileged: boolean;
    tabId?: number;
    tabURL?: string;
};

export const hostnameSwitchNames = new Set([
    'no-popups',
    'no-large-media',
    'no-cosmetic-filtering',
    'no-remote-fonts',
    'no-scripting',
]);

export const HOSTNAME_SWITCHES_SCHEMA_VERSION = 2;

export const firewallRuleTypes = [
    '*',
    'image',
    '3p',
    'inline-script',
    '1p-script',
    '3p-script',
    '3p-frame',
];

export const firewallTypeBitOffsets: Record<string, number> = {
    '*': 0,
    'inline-script': 2,
    '1p-script': 4,
    '3p-script': 6,
    '3p-frame': 8,
    image: 10,
    '3p': 12,
};

export const firewallActionNames: Record<number, string> = {
    1: 'block',
    2: 'allow',
    3: 'noop',
};

export const firewallActionValues: Record<string, number> = {
    block: 1,
    allow: 2,
    noop: 3,
};

export const FIREWALL_RULE_ID_MIN = 9_000_000;
export const FIREWALL_RULE_ID_MAX = 9_099_999;
export const POWER_RULE_ID_MIN = 9_100_000;
export const POWER_RULE_ID_MAX = 9_199_999;
export const HOSTNAME_SWITCH_RULE_ID_MIN = 9_200_000;
export const HOSTNAME_SWITCH_RULE_ID_MAX = 9_299_999;
export const WHITELIST_RULE_ID_MIN = 9_300_000;
export const WHITELIST_RULE_ID_MAX = 9_399_999;

export const MAX_DNR_RULES = 30000;

export const reWhitelistBadHostname = /[^a-z0-9.\-_[\]:]/;
export const reWhitelistHostnameExtractor = /([a-z0-9.\-_[\]]+)(?::[\d*]+)?\/(?:[^\x00-\x20/]|$)[^\x00-\x20]*$/;

export const userSettingsDefault = {
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

export const createCounts = (): FirewallCounts => ({
    allowed: { any: 0, frame: 0, script: 0 },
    blocked: { any: 0, frame: 0, script: 0 },
});

export const isIPAddress = (hostname: string): boolean => {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
};

export const domainFromHostname = (hostname: string): string => {
    if ( hostname === '' || hostname === '*' ) { return hostname; }
    if ( hostname === 'localhost' || isIPAddress(hostname) ) { return hostname; }
    const parts = hostname.split('.').filter(Boolean);
    if ( parts.length <= 2 ) { return hostname; }
    return parts.slice(-2).join('.');
};

export const domainFromURI = (uri: string): string => {
    try {
        const url = new URL(uri);
        return domainFromHostname(url.hostname);
    } catch {
        return '';
    }
};

export const hostnameFromURI = (uri: string): string => {
    try {
        const url = new URL(uri);
        return url.hostname;
    } catch {
        return '';
    }
};

export const isNetworkURI = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

export const formatCount = (count: number): string => {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return String(count);
};

export const dateNowToSensibleString = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}-${hour}${minute}`;
};

export const generateAccentStylesheet = (accent: string, dark: boolean): string => {
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

export const adjustColor = (color: string, percent: number): string => {
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

export const decomposeHostname = (hostname: string): string[] => {
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

export const isThirdParty = (srcHostname: string, desHostname: string): boolean => {
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

export const delay = (ms: number) => new Promise(resolve => {
    self.setTimeout(resolve, ms);
});