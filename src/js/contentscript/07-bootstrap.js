/*******************************************************************************

    uBlock Origin - Content Script Module
    Bootstrap

    Bootstrapping allows all components of the content script
    to be launched if/when needed.

*******************************************************************************/

/**
 * Initialize bootstrap.
 * This coordinates the initialization of all content script components.
 */
export function initBootstrap() {
    const onDomReady = ( ) => {
        if ( window.location === null ) { return; }
        if ( self.vAPI instanceof Object === false ) { return; }

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

        const onMouseClick = function(ev) {
            if ( ev.isTrusted === false ) { return; }
            vAPI.mouseClick.x = ev.clientX;
            vAPI.mouseClick.y = ev.clientY;

            const elem = ev.target.closest('a[href]');
            if ( elem === null || typeof elem.href !== 'string' ) { return; }
            vAPI.messaging.send('contentscript', {
                what: 'maybeGoodPopup',
                url: elem.href || '',
            });
        };

        document.addEventListener('mousedown', onMouseClick, true);

        vAPI.shutdown.add(function() {
            document.removeEventListener('mousedown', onMouseClick, true);
        });
    };

    const onResponseReady = response => {
        if ( response instanceof Object === false ) { return; }
        vAPI.bootstrap = undefined;

        const cfeDetails = response && response.specificCosmeticFilters;
        if ( !cfeDetails || !cfeDetails.ready ) {
            vAPI.domWatcher = vAPI.domCollapser = vAPI.domFilterer =
            vAPI.domSurveyor = vAPI.domIsLoaded = null;
            return;
        }

        vAPI.domCollapser.start();

        const {
            noSpecificCosmeticFiltering,
            noGenericCosmeticFiltering,
        } = response;

        vAPI.noSpecificCosmeticFiltering = noSpecificCosmeticFiltering;
        vAPI.noGenericCosmeticFiltering = noGenericCosmeticFiltering;

        if ( noSpecificCosmeticFiltering && noGenericCosmeticFiltering ) {
            vAPI.domFilterer = null;
            vAPI.domSurveyor = null;
        } else {
            const domFilterer = vAPI.domFilterer = new vAPI.DOMFilterer();
            if ( noGenericCosmeticFiltering || cfeDetails.disableSurveyor ) {
                vAPI.domSurveyor = null;
            }
            domFilterer.exceptions = cfeDetails.exceptionFilters;
            domFilterer.addCSS(cfeDetails.injectedCSS, { mustInject: true });
            domFilterer.addProceduralSelectors(cfeDetails.proceduralFilters);
            domFilterer.exceptCSSRules(cfeDetails.exceptedFilters);
            domFilterer.convertedProceduralFilters = cfeDetails.convertedProceduralFilters;
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

    vAPI.bootstrap = function() {
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
            needScriptlets: self.uBO_scriptletsInjected === undefined,
        }).then(response => {
            if (response && response.specificCosmeticFilters) {
                if (response.specificCosmeticFilters.injectedCSS && response.specificCosmeticFilters.injectedCSS.length > 0) {
                }
            }
            onResponseReady(response);
        }).catch(err => {
            console.error('[MV3-CS] Promise error:', err);
        });
    };
}

/**
 * Start the bootstrap process.
 */
export function startBootstrap() {
    vAPI.bootstrap();
}

/******************************************************************************/
