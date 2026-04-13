/*******************************************************************************

    uBlock Origin - MV3 Service Worker Legacy Backend
    Handles initialization of the legacy backend for MV3

*******************************************************************************/

import { legacyBackendState, withDisabledRuntimeOnConnect } from './sw-messaging.js';
import { setEngineReferences } from './sw-engine-references.js';

export const ensureLegacyBackend = async (): Promise<void> => {
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
