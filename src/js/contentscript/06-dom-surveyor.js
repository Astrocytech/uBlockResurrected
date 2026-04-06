/*******************************************************************************

    uBlock Origin - Content Script Module
    DOM Surveyor

    Surveys the DOM for new classes/ids to query the filtering engine
    for potential cosmetic filter matches.

*******************************************************************************/

/**
 * Initialize DOM surveyor.
 */
export function initDOMSurveyor() {
    const queriedHashes = new Set();
    const newHashes = new Set();
    const maxSurveyNodes = 65536;
    const pendingLists = [];
    const pendingNodes = [];
    const processedSet = new Set();
    const ignoreTags = Object.assign(Object.create(null), {
        br: 1, head: 1, link: 1, meta: 1, script: 1, style: 1
    });
    let domObserver;
    let domFilterer;
    let hostname = '';
    let domChanged = false;
    let scannedCount = 0;
    let stopped = false;

    // http://www.cse.yorku.ca/~oz/hash.html#djb2
    //   Must mirror cosmetic filtering compiler's version
    const hashFromStr = (type, s) => {
        const len = s.length;
        const step = len + 7 >>> 3;
        let hash = (type << 5) + type ^ len;
        for ( let i = 0; i < len; i += step ) {
            hash = (hash << 5) + hash ^ s.charCodeAt(i);
        }
        return hash & 0xFFFFFF;
    };

    const addHashes = hashes => {
        for ( const hash of hashes ) {
            queriedHashes.add(hash);
        }
    };

    const qsa = (context, selector) =>
        Array.from(context.querySelectorAll(selector));

    const addPendingList = list => {
        if ( list.length === 0 ) { return; }
        pendingLists.push(list);
    };

    const nextPendingNodes = ( ) => {
        if ( pendingLists.length === 0 ) { return 0; }
        const bufferSize = 256;
        let j = 0;
        do {
            const nodeList = pendingLists[0];
            let n = bufferSize - j;
            if ( n > nodeList.length ) {
                n = nodeList.length;
            }
            for ( let i = 0; i < n; i++ ) {
                pendingNodes[j+i] = nodeList[i];
            }
            j += n;
            if ( n !== nodeList.length ) {
                pendingLists[0] = nodeList.slice(n);
                break;
            }
            pendingLists.shift();
        } while ( j < bufferSize && pendingLists.length !== 0 );
        return j;
    };

    const hasPendingNodes = ( ) => {
        return pendingLists.length !== 0 || newHashes.size !== 0 ;
    };

    // Extract all classes/ids: these will be passed to the cosmetic
    // filtering engine, and in return we will obtain only the relevant
    // CSS selectors.

    // https://github.com/gorhill/uBlock/issues/672
    // http://www.w3.org/TR/2014/REC-html5-20141028/infrastructure.html#space-separated-tokens
    // http://jsperf.com/enumerate-classes/6

    const idFromNode = node => {
        const raw = node.id;
        if ( typeof raw !== 'string' || raw.length === 0 ) { return; }
        const hash = hashFromStr(0x23 /* '#' */, raw.trim());
        if ( queriedHashes.has(hash) ) { return; }
        queriedHashes.add(hash);
        newHashes.add(hash);
    };

    // https://github.com/uBlockOrigin/uBlock-issues/discussions/2076
    //   Performance: avoid using Element.classList
    const classesFromNode = node => {
        const s = node.getAttribute('class');
        if ( typeof s !== 'string' ) { return; }
        const len = s.length;
        for ( let beg = 0, end = 0; beg < len; beg += 1 ) {
            end = s.indexOf(' ', beg);
            if ( end === beg ) { continue; }
            if ( end === -1 ) { end = len; }
            const token = s.slice(beg, end).trimEnd();
            beg = end;
            if ( token.length === 0 ) { continue; }
            const hash = hashFromStr(0x2E /* '.' */, token);
            if ( queriedHashes.has(hash) ) { continue; }
            queriedHashes.add(hash);
            newHashes.add(hash);
        }
    };

    const getSurveyResults = safeOnly => {
        if ( Boolean(self.vAPI?.messaging) === false ) { return stop(); }
        const promise = newHashes.size === 0
            ? Promise.resolve(null)
            : self.vAPI.messaging.send('contentscript', {
                what: 'retrieveGenericCosmeticSelectors',
                hostname,
                hashes: Array.from(newHashes),
                exceptions: domFilterer.exceptions,
                safeOnly,
            });
        promise.then(response => {
            processSurveyResults(response);
        });
        newHashes.clear();
    };

    const doSurvey = ( ) => {
        const t0 = performance.now();
        const nodes = pendingNodes;
        const deadline = t0 + 4;
        let scanned = 0;
        for (;;) {
            const n = nextPendingNodes();
            if ( n === 0 ) { break; }
            for ( let i = 0; i < n; i++ ) {
                const node = nodes[i]; nodes[i] = null;
                if ( domChanged ) {
                    if ( processedSet.has(node) ) { continue; }
                    processedSet.add(node);
                }
                idFromNode(node);
                classesFromNode(node);
                scanned += 1;
            }
            if ( performance.now() >= deadline ) { break; }
        }
        scannedCount += scanned;
        if ( scannedCount >= maxSurveyNodes ) {
            stop();
        }
        processedSet.clear();
        getSurveyResults();
    };

    const surveyTimer = new vAPI.SafeAnimationFrame(doSurvey);

    // This is to shutdown the surveyor if result of surveying keeps being
    // fruitless. This is useful on long-lived web page. I arbitrarily
    // picked 5 minutes before the surveyor is allowed to shutdown. I also
    // arbitrarily picked 256 misses before the surveyor is allowed to
    // shutdown.
    let canShutdownAfter = Date.now() + 300000;
    let surveyResultMissCount = 0;

    // Handle main process' response.

    const processSurveyResults = response => {
        if ( stopped ) { return; }
        const result = response && response.result;
        let mustCommit = false;
        if ( result ) {
            const css = result.injectedCSS;
            if ( typeof css === 'string' && css.length !== 0 ) {
                domFilterer.addCSS(css);
                mustCommit = true;
            }
            const selectors = result.excepted;
            if ( Array.isArray(selectors) && selectors.length !== 0 ) {
                domFilterer.exceptCSSRules(selectors);
            }
        }
        if ( hasPendingNodes() ) {
            surveyTimer.start(1);
        }
        if ( mustCommit ) {
            surveyResultMissCount = 0;
            canShutdownAfter = Date.now() + 300000;
            return;
        }
        surveyResultMissCount += 1;
        if ( surveyResultMissCount < 256 || Date.now() < canShutdownAfter ) {
            return;
        }
        //console.info(`[domSurveyor][${hostname}] Shutting down, too many misses`);
        stop();
        self.vAPI.messaging.send('contentscript', {
            what: 'disableGenericCosmeticFilteringSurveyor',
            hostname,
        });
    };

    const onDomChanged = mutations => {
        domChanged = true;
        for ( const mutation of mutations ) {
            if ( mutation.type === 'childList' ) {
                const { addedNodes } = mutation;
                if ( addedNodes.length === 0 ) { continue; }
                for ( const node of addedNodes ) {
                    if ( node.nodeType !== 1 ) { continue; }
                    if ( ignoreTags[node.localName] ) { continue; }
                    if ( node.parentElement === null ) { continue; }
                    addPendingList([ node ]);
                    if ( node.firstElementChild === null ) { continue; }
                    addPendingList(qsa(node, '[id],[class]'));
                }
            } else if ( mutation.attributeName === 'class' ) {
                classesFromNode(mutation.target);
            } else {
                idFromNode(mutation.target);
            }
        }
        if ( hasPendingNodes() ) {
            surveyTimer.start();
        }
    };

    const start = details => {
        if ( Boolean(self.vAPI?.domFilterer) === false ) { return stop(); }
        hostname = details.hostname;
        domFilterer = vAPI.domFilterer;
        // https://github.com/uBlockOrigin/uBlock-issues/issues/1692
        //   Look-up safe-only selectors to mitigate probability of
        //   html/body elements of erroneously being targeted.
        if ( document.documentElement !== null ) {
            idFromNode(document.documentElement);
            classesFromNode(document.documentElement);
        }
        if ( document.body !== null ) {
            idFromNode(document.body);
            classesFromNode(document.body);
        }
        if ( newHashes.size !== 0 ) {
            getSurveyResults(newHashes, true);
        }
        addPendingList(qsa(document, '[id],[class]'));
        if ( hasPendingNodes() ) {
            surveyTimer.start();
        }
        domObserver = new MutationObserver(onDomChanged);
        domObserver.observe(document, {
            attributeFilter: [ 'class', 'id' ],
            attributes: true,
            childList: true,
            subtree: true
        });
    };

    const stop = ( ) => {
        stopped = true;
        pendingLists.length = 0;
        surveyTimer.clear();
        if ( domObserver ) {
            domObserver.disconnect();
            domObserver = undefined;
        }
        if ( self.vAPI?.domSurveyor ) {
            self.vAPI.domSurveyor = null;
        }
    };

    self.vAPI.domSurveyor = { start, addHashes };
}

/******************************************************************************/
