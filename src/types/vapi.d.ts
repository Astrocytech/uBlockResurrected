/**
 * VAPI Types for uBlock Resurrected
 * 
 * Defines types for the VAPI (uBlock API) shim that provides
 * a consistent interface for both background and content scripts.
 */

/**
 * UserStylesheet API for managing injected CSS
 */
export interface UserStylesheetAPI {
    added: Set<string>;
    removed: Set<string>;
    add(cssText: string, now?: boolean): void;
    remove(cssText: string, now?: boolean): void;
    apply(callback?: () => void): void;
}

/**
 * Messaging API for cross-context communication
 */
export interface MessagingAPI {
    send(channelName: string, request: unknown): Promise<unknown>;
    setup(defaultHandler: unknown): void;
    listen(options: {
        name: string;
        listener: (request: unknown, portDetails: unknown, callback: (response?: unknown) => void) => void;
        privileged?: boolean;
    }): void;
    UNHANDLED: symbol;
}

/**
 * Cloud Storage API
 */
export interface CloudStorageAPI {
    push(text: string, remoteURL?: string): Promise<boolean>;
    get(expectType: string, remoteURL?: string): Promise<string | null>;
    delete(remoteURL?: string): Promise<boolean>;
}

/**
 * Tabs API wrapper
 */
export interface TabsAPI {
    resolve(tabId: number): Promise<{
        url: string;
        origin: string;
        hostname: string;
    } | null>;
}

/**
 * VAPI main interface
 */
export interface VAPI {
    /** Version string */
    version: string;
    
    /** Whether running in uBR variant */
    uBR: boolean;
    
    /** Session start time */
    T0: number;
    
    /** Session ID */
    sessionId: string;
    
    /** Cloud storage */
    cloud: CloudStorageAPI;
    
    /** User stylesheet management */
    userStylesheet: UserStylesheetAPI;
    
    /** Cross-context messaging */
    messaging: MessagingAPI;
    
    /** Tabs API wrapper */
    tabs: TabsAPI;
    
    /** Zapper mode flag */
    inZapperMode: boolean;
    
    /** Shutdown handlers */
    shutdown: {
        jobs: Array<() => void>;
        add(job: () => void): void;
        remove(job: () => void): void;
        exec(): void;
    };
    
    /** DOM filterer instance */
    domFilterer?: unknown;
    
    /** DOM watcher instance */
    domWatcher?: unknown;
    
    /** DOM collapser instance */
    domCollapser?: unknown;
    
    /** DOM surveyor instance */
    domSurveyor?: unknown;
    
    /** Element picker frame flag */
    pickerFrame?: boolean;
    
    /** Mouse click coordinates */
    mouseClick?: { x: number; y: number };
    
    /** Whether specific cosmetic filtering is disabled */
    noSpecificCosmeticFiltering?: boolean;
    
    /** Whether generic cosmetic filtering is disabled */
    noGenericCosmeticFiltering?: boolean;
    
    /** Whether content script is loaded */
    contentScript?: boolean;
    
    /** Random token generator */
    randomToken(): string;
    
    /** Set timeout */
    setTimeout(fn: () => void, delay: number): number;
    
    /** Get extension URL */
    getURL(path: string): string;
    
    /** Close popup (no-op in SW) */
    closePopup(): void;
    
    /** Local storage API */
    localStorage: {
        getItemAsync(key: string): Promise<unknown>;
        setItemAsync(key: string, value: unknown): Promise<void>;
    };
    
    /** Style for hiding elements */
    hideStyle: string;
    
    /** Style proxies map */
    epickerStyleProxies?: Map<string, string>;
    
    /** Effective self (window in content, self in SW) */
    effectiveSelf: typeof globalThis;
    
    /** Create procedural filter */
    createProceduralFilter?: (o: unknown) => {
        exec(): Element[];
    };
}

/**
 * VAPI for background scripts (service worker)
 */
export interface VAPIBackground extends VAPI {
    /** Initialize the VAPI */
    init(): Promise<void>;
    
    /** Load specific cosmetic filters for a URL */
    loadCssRules(url: string): Promise<{
        css: string;
        exceptionCSS: string;
        procedurals: unknown[];
    } | null>;
    
    /** Get statistics */
    getStats(): Promise<Record<string, number>>;
    
    /** User filters management */
    userFilters: {
        append(text: string): Promise<{ saved: boolean }>;
        read(): Promise<string>;
        write(text: string): Promise<void>;
    };
}

/**
 * VAPI for content scripts
 */
export interface VAPIContent extends VAPI {
    /** The messaging object for sending messages to background */
    messaging: {
        send(channelName: string, request: unknown): Promise<unknown>;
    };
    
    /** Safe animation frame utility */
    SafeAnimationFrame: {
        new(callback: (time: number) => void): {
            start(delay?: number): void;
            clear(): void;
        };
    };
    
    /** DOM filterer constructor */
    DOMFilterer: new () => {
        addCSS(css: string, options?: { mustInject?: boolean }): void;
        addProceduralSelectors(selectors: string[]): void;
        exceptCSSRules(selectors: string[]): void;
        commitNow(): void;
        exceptions: string[];
    };
}
