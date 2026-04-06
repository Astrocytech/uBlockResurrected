/*******************************************************************************

    uBlock Origin - Content Script Module
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

        document.addEventListener('mousedown', onMouseClick, true);

        vAPI.shutdown.add(function(): void {
            document.removeEventListener('mousedown', onMouseClick, true);
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
            document.title = "uBO MV3 CS LOADING...";
        } catch(e) {}

        console.log('########################################');
        console.log('[MV3-CS] ★★★ BOOTSTRAP STARTING ★★★');
        console.log('[MV3-CS] Page URL:', vAPI.effectiveSelf.location.href);
        console.log('[MV3-CS] About to call vAPI.messaging.send');

        vAPI.messaging.send('contentscript', {
            what: 'retrieveContentScriptParameters',
            url: vAPI.effectiveSelf.location.href,
            needScriptlets: (self as Record<string, unknown>).uBO_scriptletsInjected === undefined,
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
    };
}

export function startBootstrap(): void {
    vAPI.bootstrap?.();
}

/******************************************************************************/
