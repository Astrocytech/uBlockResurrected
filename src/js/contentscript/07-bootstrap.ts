/*******************************************************************************

    uBlock Resurrected - Content Script Module
    Bootstrap

    Bootstrapping allows all components of the content script
    to be launched if/when needed.

*******************************************************************************/

interface Messaging {
    send(channel: string, message: object): Promise<unknown>;
}

interface DOMFilterer {
    commitNow(): void;
    exceptions: string[];
    addCSS(css: string, details?: { mustInject?: boolean; silent?: boolean }): void;
    addProceduralSelectors(selectors: string[]): void;
    exceptCSSRules(exceptions: string[]): void;
    convertedProceduralFilters: unknown[];
}

interface DOMWatcher {
    start(): void;
}

interface DOMCollapser {
    start(): void;
}

interface DOMSurveyor {
    start(details: { hostname: string }): void;
    addHashes(hashes: number[]): void;
}

interface ShutdownCallbacks {
    add(callback: () => void): void;
}

interface UserStylesheet {
    apply(callback?: () => void): void;
}

interface MouseClick {
    x: number;
    y: number;
}

interface VAPI {
    messaging: Messaging;
    domFilterer: DOMFilterer | null;
    domWatcher: DOMWatcher | null;
    domCollapser: DOMCollapser | null;
    domSurveyor: DOMSurveyor | null;
    domIsLoaded: boolean | null;
    shutdown: ShutdownCallbacks;
    userStylesheet: UserStylesheet;
    effectiveSelf: Window;
    mouseClick: MouseClick;
    noSpecificCosmeticFiltering: boolean;
    noGenericCosmeticFiltering: boolean;
    bootstrap: (() => void) | undefined;
}

declare const vAPI: VAPI;
declare const chrome: typeof globalThis.chrome;

interface CFEDetails {
    ready: boolean;
    injectedCSS?: string;
    proceduralFilters?: string[];
    exceptionFilters?: string[];
    exceptedFilters?: string[];
    convertedProceduralFilters?: unknown[];
    genericCosmeticHashes?: number[];
    disableSurveyor?: boolean;
}

interface BootstrapResponse {
    specificCosmeticFilters?: CFEDetails;
    noSpecificCosmeticFiltering?: boolean;
    noGenericCosmeticFiltering?: boolean;
}

type StorageBin = {
    'user-filters'?: string;
    selectedFilterLists?: string[];
};

type ContextMenuTargetDetails = {
    selector: string;
};

const blockLikeTags = new Set([
    'article',
    'aside',
    'div',
    'li',
    'main',
    'section',
]);

const userFilterStyleId = 'ublock-resurrected-user-filters';

const storageGet = (keys: string[]): Promise<StorageBin> => {
    const browserAPI = globalThis.browser;
    if ( browserAPI?.storage?.local?.get instanceof Function ) {
        return browserAPI.storage.local.get(keys);
    }
    const chromeAPI = globalThis.chrome;
    if ( chromeAPI?.storage?.local?.get instanceof Function ) {
        return new Promise(resolve => {
            chromeAPI.storage.local.get(keys, (bin: StorageBin) => resolve(bin || {}));
        });
    }
    return Promise.resolve({});
};

const matchesFilterHostname = (filterHostname: string, pageHostname: string): boolean => {
    if ( filterHostname === '' ) { return true; }
    return (
        pageHostname === filterHostname ||
        pageHostname.endsWith(`.${filterHostname}`)
    );
};

const shouldApplyCosmeticLine = (line: string, pageHostname: string): string | undefined => {
    if ( line === '' || line.startsWith('!') ) { return; }
    const exceptionIndex = line.indexOf('#@#');
    if ( exceptionIndex !== -1 ) { return; }
    const separatorIndex = line.indexOf('##');
    if ( separatorIndex === -1 ) { return; }

    const scope = line.slice(0, separatorIndex).trim();
    const selector = line.slice(separatorIndex + 2).trim();
    if ( selector === '' ) { return; }

    if ( scope === '' ) { return selector; }

    const includes = [];
    const excludes = [];
    for ( const token of scope.split(',').map(part => part.trim()).filter(Boolean) ) {
        if ( token.startsWith('~') ) {
            excludes.push(token.slice(1));
        } else {
            includes.push(token);
        }
    }

    if ( excludes.some(token => matchesFilterHostname(token, pageHostname)) ) {
        return;
    }
    if ( includes.length === 0 ) { return selector; }
    if ( includes.some(token => matchesFilterHostname(token, pageHostname)) ) {
        return selector;
    }
};

const collectStoredCosmeticSelectors = (rawFilters: string, pageHostname: string): string[] => {
    const selectors: string[] = [];
    const seen = new Set<string>();

    for ( const rawLine of rawFilters.split(/\r?\n/) ) {
        const line = rawLine.trim();
        const selector = shouldApplyCosmeticLine(line, pageHostname);
        if ( selector === undefined || seen.has(selector) ) { continue; }
        try {
            document.querySelector(selector);
        } catch {
            continue;
        }
        seen.add(selector);
        selectors.push(selector);
    }

    return selectors;
};

const cssEscape = (value: string): string => {
    if ( typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ) {
        return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
};

const nthOfTypeIndex = (elem: Element): number => {
    let index = 1;
    let prev = elem.previousElementSibling;
    while ( prev !== null ) {
        if ( prev.localName === elem.localName ) {
            index += 1;
        }
        prev = prev.previousElementSibling;
    }
    return index;
};

const distanceToAncestor = (start: Element, matcher: string): { element: Element; distance: number } | undefined => {
    let current: Element | null = start;
    let distance = 0;
    while ( current !== null && current !== document.documentElement ) {
        if ( current.matches(matcher) ) {
            return { element: current, distance };
        }
        current = current.parentElement;
        distance += 1;
    }
};

const buildContextMenuTargetSelector = (elem: Element | null): string => {
    if ( elem === null ) { return ''; }

    const parts: string[] = [];
    let current: Element | null = elem;
    let depth = 0;

    while ( current !== null && current !== document.documentElement && depth < 5 ) {
        let part = current.localName || '*';
        const id = current.getAttribute('id') || '';
        if ( id !== '' ) {
            part += `#${cssEscape(id)}`;
            parts.unshift(part);
            break;
        }

        const classAttr = current.getAttribute('class') || '';
        const classes = classAttr
            .split(/\s+/)
            .map(token => token.trim())
            .filter(Boolean)
            .slice(0, 6);
        if ( classes.length !== 0 ) {
            part += classes.map(name => `.${cssEscape(name)}`).join('');
        }

        const href = current.getAttribute('href');
        if ( href ) {
            part += `[href="${cssEscape(href)}"]`;
        }
        const src = current.getAttribute('src');
        if ( src ) {
            part += `[src="${cssEscape(src)}"]`;
        }
        const eventAction = current.getAttribute('data-event-action');
        if ( eventAction ) {
            part += `[data-event-action="${cssEscape(eventAction)}"]`;
        }

        if ( classes.length === 0 && !href && !src && !eventAction ) {
            part += `:nth-of-type(${nthOfTypeIndex(current)})`;
        }

        parts.unshift(part);
        current = current.parentElement;
        depth += 1;
    }

    return parts.join(' > ');
};

const getContextMenuTargetDetails = (ev: MouseEvent): ContextMenuTargetDetails | undefined => {
    const rawTarget = ev.target;
    const element = rawTarget instanceof Element
        ? rawTarget
        : rawTarget instanceof Node
            ? rawTarget.parentElement
            : null;
    if ( element === null ) { return; }

    const actionable = distanceToAncestor(
        element,
        'a[href], img[src], iframe[src], video[src], audio[src], [data-event-action], [href], [src]',
    );
    const identifiable = distanceToAncestor(element, '[id]');
    const actionableElement = actionable?.element;
    const actionableTag = actionableElement?.localName || '';
    const actionableEvent = actionableElement?.getAttribute('data-event-action') || '';
    const identifiableElement = identifiable?.element;
    const identifiableTag = identifiableElement?.localName || '';

    // Prefer the nearest meaningful exact element:
    // - if the click landed directly on an element with an id, use it
    // - if the actionable target is an explicit "title", keep it
    // - if a nearby block-like id container wraps an actionable link, prefer the container
    // - otherwise use the closer actionable/id ancestor
    const preferred = identifiable?.distance === 0
        ? identifiable.element
        : actionableEvent === 'title'
            ? actionableElement
        : identifiable && actionable
            ? actionableTag === 'a' &&
              blockLikeTags.has(identifiableTag) &&
              identifiable.distance <= actionable.distance + 2
                ? identifiable.element
                : identifiable.distance <= actionable.distance + 1
                ? identifiable.element
                : actionable.element
            : actionable?.element ||
              identifiable?.element ||
              element.closest('[class]') ||
              element;
    const selector = buildContextMenuTargetSelector(preferred);
    if ( selector === '' ) { return; }
    return { selector };
};

const applyStoredUserFilters = async (): Promise<void> => {
    const pageHostname = self.location.hostname;
    if ( pageHostname === '' ) { return; }

    const bin = await storageGet([ 'user-filters', 'selectedFilterLists', 'perSiteFiltering' ]);
    const perSiteFiltering = (bin.perSiteFiltering || {}) as Record<string, boolean>;
    const pageURL = self.location.href;
    const pageScopeKey = `${pageHostname}:${pageURL}`;
    const netFilteringEnabled =
        perSiteFiltering[pageScopeKey] ?? perSiteFiltering[pageHostname] ?? true;
    if ( netFilteringEnabled === false ) { return; }
    if ( Array.isArray(bin.selectedFilterLists) === false ) { return; }
    if ( bin.selectedFilterLists.includes('user-filters') === false ) { return; }
    if ( typeof bin['user-filters'] !== 'string' || bin['user-filters'].trim() === '' ) {
        return;
    }

    const selectors = collectStoredCosmeticSelectors(bin['user-filters'], pageHostname);
    if ( selectors.length === 0 ) { return; }

    let style = document.getElementById(userFilterStyleId) as HTMLStyleElement | null;
    if ( style === null ) {
        style = document.createElement('style');
        style.id = userFilterStyleId;
        (document.head || document.documentElement).append(style);
    }
    style.textContent = selectors
        .map(selector => `${selector}\n{display:none!important;}`)
        .join('\n');
};

const applyImmediatePowerSwitchState = async (enabled: boolean): Promise<void> => {
    const style = document.getElementById(userFilterStyleId);
    if ( enabled ) {
        await applyStoredUserFilters();
        vAPI.domFilterer?.toggle?.(true);
        vAPI.domFilterer?.commitNow?.();
        return;
    }

    style?.remove();
    vAPI.domFilterer?.toggle?.(false);
    vAPI.domFilterer?.commitNow?.();
};

export function initBootstrap(): void {
    const onDomReady = (): void => {
        if ( window.location === null ) { return; }
        if ( vAPI instanceof Object === false ) { return; }

        vAPI.messaging.send('contentscript', {
            what: 'shouldRenderNoscriptTags',
        });

        if ( vAPI.domFilterer instanceof Object ) {
            vAPI.domFilterer.commitNow();
        }

        if ( vAPI.domWatcher instanceof Object ) {
            vAPI.domWatcher.start();
        }

        if (
            window !== window.top ||
            vAPI.domFilterer instanceof Object === false
        ) {
            return;
        }

        vAPI.mouseClick = { x: -1, y: -1 };

        const onMouseClick = function(ev: MouseEvent): void {
            if ( ev.isTrusted === false ) { return; }
            vAPI.mouseClick.x = ev.clientX;
            vAPI.mouseClick.y = ev.clientY;

            const elem = ev.target?.closest('a[href]');
            if ( elem === null || typeof (elem as HTMLAnchorElement).href !== 'string' ) { return; }
            vAPI.messaging.send('contentscript', {
                what: 'maybeGoodPopup',
                url: (elem as HTMLAnchorElement).href || '',
            });
        };

        const onContextMenu = function(ev: MouseEvent): void {
            if ( ev.isTrusted === false ) { return; }
            if ( chrome?.runtime?.sendMessage instanceof Function === false ) { return; }
            vAPI.mouseClick.x = ev.clientX;
            vAPI.mouseClick.y = ev.clientY;
            const target = getContextMenuTargetDetails(ev);
            const result = chrome.runtime.sendMessage({
                topic: 'pickerContextMenuPoint',
                payload: {
                    x: ev.clientX,
                    y: ev.clientY,
                    pageURL: window.location.href,
                    target,
                },
            }) as Promise<unknown> | undefined;
            result?.catch(() => {});
        };

        document.addEventListener('mousedown', onMouseClick, true);
        document.addEventListener('contextmenu', onContextMenu, true);

        vAPI.shutdown.add(function(): void {
            document.removeEventListener('mousedown', onMouseClick, true);
            document.removeEventListener('contextmenu', onContextMenu, true);
        });
    };

    const onResponseReady = (response: unknown): void => {
        if ( response instanceof Object === false ) { return; }
        vAPI.bootstrap = undefined;

        const res = response as BootstrapResponse;
        const cfeDetails = res && res.specificCosmeticFilters;
        if ( !cfeDetails || !cfeDetails.ready ) {
            vAPI.domWatcher = null;
            vAPI.domCollapser = null;
            vAPI.domFilterer = null;
            vAPI.domSurveyor = null;
            vAPI.domIsLoaded = null;
            return;
        }

        vAPI.domCollapser!.start();

        const {
            noSpecificCosmeticFiltering,
            noGenericCosmeticFiltering,
        } = res;

        vAPI.noSpecificCosmeticFiltering = noSpecificCosmeticFiltering || false;
        vAPI.noGenericCosmeticFiltering = noGenericCosmeticFiltering || false;

        if ( noSpecificCosmeticFiltering && noGenericCosmeticFiltering ) {
            vAPI.domFilterer = null;
            vAPI.domSurveyor = null;
        } else {
            const domFilterer = new vAPI.DOMFilterer();
            vAPI.domFilterer = domFilterer;
            if ( noGenericCosmeticFiltering || cfeDetails.disableSurveyor ) {
                vAPI.domSurveyor = null;
            }
            domFilterer.exceptions = cfeDetails.exceptionFilters || [];
            domFilterer.addCSS(cfeDetails.injectedCSS || '', { mustInject: true });
            domFilterer.addProceduralSelectors(cfeDetails.proceduralFilters || []);
            domFilterer.exceptCSSRules(cfeDetails.exceptedFilters || []);
            domFilterer.convertedProceduralFilters = cfeDetails.convertedProceduralFilters || [];
            vAPI.userStylesheet.apply();
        }

        if ( vAPI.domSurveyor ) {
            if ( Array.isArray(cfeDetails.genericCosmeticHashes) ) {
                vAPI.domSurveyor.addHashes(cfeDetails.genericCosmeticHashes);
            }
            vAPI.domSurveyor.start(cfeDetails);
        }

        const readyState = document.readyState;
        if ( readyState === 'interactive' || readyState === 'complete' ) {
            return onDomReady();
        }
        document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    };

    vAPI.bootstrap = function(): void {
        try {
            document.title = "uBR MV3 CS LOADING...";
        } catch(e) {}

        console.log('########################################');
        console.log('[MV3-CS] ★★★ BOOTSTRAP STARTING ★★★');
        console.log('[MV3-CS] Page URL:', vAPI.effectiveSelf.location.href);
        console.log('[MV3-CS] About to call vAPI.messaging.send');

        // Set up pickerActivate listener
        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: unknown) => {
                const msg = message as { topic?: string; payload?: unknown };
                if (msg?.topic === 'pickerActivate') {
                    console.log('[MV3-CS] pickerActivate received');
                    // Inject epicker.js when picker is activated from context menu
                    injectEpickerScript();
                }
                if (msg?.topic === 'pickerDeactivate') {
                    console.log('[MV3-CS] pickerDeactivate received');
                }
                if (msg?.topic === 'uBlockPowerSwitch') {
                    const enabled = (msg.payload as { enabled?: boolean } | undefined)?.enabled === true;
                    void applyImmediatePowerSwitchState(enabled);
                }
            });
        }

        applyStoredUserFilters().catch(err => {
            console.error('[MV3-CS] Stored user filters error:', err);
        }).finally(() => {
            vAPI.messaging.send('contentscript', {
                what: 'retrieveContentScriptParameters',
                url: vAPI.effectiveSelf.location.href,
                needScriptlets: (self as Record<string, unknown>).uBR_scriptletsInjected === undefined,
            }).then(response => {
                if (response && (response as BootstrapResponse).specificCosmeticFilters) {
                    const scf = (response as BootstrapResponse).specificCosmeticFilters!;
                    if (scf.injectedCSS && scf.injectedCSS.length > 0) {
                    }
                }
                onResponseReady(response);
            }).catch(err => {
                console.error('[MV3-CS] Promise error:', err);
            });
        });
    };

    // Function to inject epicker.js into the page
    const injectEpickerScript = async (): Promise<void> => {
        console.log('[MV3-CS] injectEpickerScript called');
        const epickerUrl = vAPI.extensionURL('/js/scriptlets/epicker.js');
        console.log('[MV3-CS] epicker URL:', epickerUrl);
        
        try {
            // Create script element
            const script = document.createElement('script');
            script.src = epickerUrl;
            script.id = 'ublock-epicker';
            script.async = false;
            
            // Note: This injects into the content script context, not page context
            // For full page context injection, we need chrome.scripting.executeScript
            // But for now, let's just create the script element
            (document.documentElement || document.head || document.body)?.appendChild(script);
            
            console.log('[MV3-CS] epicker.js script element added to DOM');
        } catch (e) {
            console.error('[MV3-CS] Failed to inject epicker script:', e);
        }
    };
}

export function startBootstrap(): void {
    vAPI.bootstrap?.();
}

/******************************************************************************/
