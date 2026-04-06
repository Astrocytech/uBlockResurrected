/*******************************************************************************

    uBlock Origin - Content Script Module
    DOM Collapser

    Enforces the collapsing of DOM elements for which a corresponding
    resource was blocked through network filtering.

*******************************************************************************/

/**
 * Initialize DOM collapser.
 */
export function initDOMCollapser() {
    const messaging = vAPI.messaging;
    const toCollapse = new Map();
    const src1stProps = {
        audio: 'currentSrc',
        embed: 'src',
        iframe: 'src',
        img: 'currentSrc',
        object: 'data',
        video: 'currentSrc',
    };
    const src2ndProps = {
        audio: 'src',
        img: 'src',
        video: 'src',
    };
    const tagToTypeMap = {
        audio: 'media',
        embed: 'object',
        iframe: 'sub_frame',
        img: 'image',
        object: 'object',
        video: 'media',
    };
    let requestIdGenerator = 1,
        processTimer,
        cachedBlockedSet,
        cachedBlockedSetHash,
        cachedBlockedSetTimer,
        toProcess = [],
        toFilter = [],
        netSelectorCacheCount = 0;

    const cachedBlockedSetClear = function() {
        cachedBlockedSet =
        cachedBlockedSetHash =
        cachedBlockedSetTimer = undefined;
    };

    // https://github.com/chrisaljoudi/uBlock/issues/399
    // https://github.com/gorhill/uBlock/issues/2848
    //   Use a user stylesheet to collapse placeholders.
    const getCollapseToken = ( ) => {
        if ( collapseToken === undefined ) {
            collapseToken = vAPI.randomToken();
            vAPI.userStylesheet.add(
                `[${collapseToken}]\n{display:none!important;}`,
                true
            );
        }
        return collapseToken;
    };
    let collapseToken;

    // https://github.com/chrisaljoudi/uBlock/issues/174
    //   Do not remove fragment from src URL
    const onProcessed = function(response) {
        // This happens if uBO is disabled or restarted.
        if ( response instanceof Object === false ) {
            toCollapse.clear();
            return;
        }

        const targets = toCollapse.get(response.id);
        if ( targets === undefined ) { return; }

        toCollapse.delete(response.id);
        if ( cachedBlockedSetHash !== response.hash ) {
            cachedBlockedSet = new Set(response.blockedResources);
            cachedBlockedSetHash = response.hash;
            if ( cachedBlockedSetTimer !== undefined ) {
                clearTimeout(cachedBlockedSetTimer);
            }
            cachedBlockedSetTimer = vAPI.setTimeout(cachedBlockedSetClear, 30000);
        }
        if ( cachedBlockedSet === undefined || cachedBlockedSet.size === 0 ) {
            return;
        }

        const selectors = [];
        let netSelectorCacheCountMax = response.netSelectorCacheCountMax;

        for ( const target of targets ) {
            const tag = target.localName;
            let prop = src1stProps[tag];
            if ( prop === undefined ) { continue; }
            let src = target[prop];
            if ( typeof src !== 'string' || src.length === 0 ) {
                prop = src2ndProps[tag];
                if ( prop === undefined ) { continue; }
                src = target[prop];
                if ( typeof src !== 'string' || src.length === 0 ) { continue; }
            }
            if ( cachedBlockedSet.has(tagToTypeMap[tag] + ' ' + src) === false ) {
                continue;
            }
            target.setAttribute(getCollapseToken(), '');
            // https://github.com/chrisaljoudi/uBlock/issues/1048
            //   Use attribute to construct CSS rule
            if ( netSelectorCacheCount > netSelectorCacheCountMax ) { continue; }
            const value = target.getAttribute(prop);
            if ( value ) {
                selectors.push(`${tag}[${prop}="${CSS.escape(value)}"]`);
                netSelectorCacheCount += 1;
            }
        }

        if ( selectors.length === 0 ) { return; }
        messaging.send('contentscript', {
            what: 'cosmeticFiltersInjected',
            type: 'net',
            hostname: window.location.hostname,
            selectors,
        });
    };

    const send = function() {
        processTimer = undefined;
        toCollapse.set(requestIdGenerator, toProcess);
        messaging.send('contentscript', {
            what: 'getCollapsibleBlockedRequests',
            id: requestIdGenerator,
            frameURL: window.location.href,
            resources: toFilter,
            hash: cachedBlockedSetHash,
        }).then(response => {
            onProcessed(response);
        });
        toProcess = [];
        toFilter = [];
        requestIdGenerator += 1;
    };

    const process = function(delay) {
        if ( toProcess.length === 0 ) { return; }
        if ( delay === 0 ) {
            if ( processTimer !== undefined ) {
                clearTimeout(processTimer);
            }
            send();
        } else if ( processTimer === undefined ) {
            processTimer = vAPI.setTimeout(send, delay || 20);
        }
    };

    const add = function(target) {
        toProcess[toProcess.length] = target;
    };

    const addMany = function(targets) {
        for ( const target of targets ) {
            add(target);
        }
    };

    const iframeSourceModified = function(mutations) {
        for ( const mutation of mutations ) {
            addIFrame(mutation.target, true);
        }
        process();
    };
    const iframeSourceObserver = new MutationObserver(iframeSourceModified);
    const iframeSourceObserverOptions = {
        attributes: true,
        attributeFilter: [ 'src' ]
    };

    // https://github.com/gorhill/uBlock/issues/162
    //   Be prepared to deal with possible change of src attribute.
    const addIFrame = function(iframe, dontObserve) {
        if ( dontObserve !== true ) {
            iframeSourceObserver.observe(iframe, iframeSourceObserverOptions);
        }
        const src = iframe.src;
        if ( typeof src !== 'string' || src === '' ) { return; }
        if ( src.startsWith('http') === false ) { return; }
        toFilter.push({ type: 'sub_frame', url: iframe.src });
        add(iframe);
    };

    const addIFrames = function(iframes) {
        for ( const iframe of iframes ) {
            addIFrame(iframe);
        }
    };

    const onResourceFailed = function(ev) {
        if ( tagToTypeMap[ev.target.localName] !== undefined ) {
            add(ev.target);
            process();
        }
    };

    const stop = function() {
        document.removeEventListener('error', onResourceFailed, true);
        if ( processTimer !== undefined ) {
            clearTimeout(processTimer);
        }
        if ( vAPI.domWatcher instanceof Object ) {
            vAPI.domWatcher.removeListener(domWatcherInterface);
        }
        vAPI.shutdown.remove(stop);
        vAPI.domCollapser = null;
    };

    const start = function() {
        if ( vAPI.domWatcher instanceof Object ) {
            vAPI.domWatcher.addListener(domWatcherInterface);
        }
    };

    const domWatcherInterface = {
        onDOMCreated: function() {
            if ( self.vAPI instanceof Object === false ) { return; }
            if ( vAPI.domCollapser instanceof Object === false ) {
                if ( vAPI.domWatcher instanceof Object ) {
                    vAPI.domWatcher.removeListener(domWatcherInterface);
                }
                return;
            }
            // Listener to collapse blocked resources.
            // - Future requests not blocked yet
            // - Elements dynamically added to the page
            // - Elements which resource URL changes
            // https://github.com/chrisaljoudi/uBlock/issues/7
            // Preferring getElementsByTagName over querySelectorAll:
            //   http://jsperf.com/queryselectorall-vs-getelementsbytagname/145
            const elems = document.images ||
                          document.getElementsByTagName('img');
            for ( const elem of elems ) {
                if ( elem.complete ) {
                    add(elem);
                }
            }
            addMany(document.embeds || document.getElementsByTagName('embed'));
            addMany(document.getElementsByTagName('object'));
            addIFrames(document.getElementsByTagName('iframe'));
            process(0);

            document.addEventListener('error', onResourceFailed, true);

            vAPI.shutdown.add(stop);
        },
        onDOMChanged: function(addedNodes) {
            if ( addedNodes.length === 0 ) { return; }
            for ( const node of addedNodes ) {
                if ( node.localName === 'iframe' ) {
                    addIFrame(node);
                }
                if ( node.firstElementChild === null ) { continue; }
                const iframes = node.getElementsByTagName('iframe');
                if ( iframes.length !== 0 ) {
                    addIFrames(iframes);
                }
            }
            process();
        }
    };

    vAPI.domCollapser = { start };
}

/******************************************************************************/
