/*******************************************************************************

    uBlock Resurrected - Content Script Module
    DOM Surveyor

    Surveys the DOM for new classes/ids to query the filtering engine
    for potential cosmetic filter matches.

*******************************************************************************/

interface Messaging {
    send(channel: string, message: object): Promise<unknown>;
}

interface SafeAnimationFrame {
    start(delay?: number): void;
    clear(): void;
}

interface DOMFilterer {
    addCSS(css: string, details?: { mustInject?: boolean; silent?: boolean }): void;
    exceptCSSRules(exceptions: string[]): void;
    exceptions: string[];
}

interface VAPI {
    messaging: Messaging;
    domFilterer: DOMFilterer;
    domSurveyor: { start(details: { hostname: string }): void; addHashes(hashes: number[]): void } | null;
    SafeAnimationFrame: new (callback: () => void) => SafeAnimationFrame;
}

declare const vAPI: VAPI;

interface SurveyResult {
    result?: {
        injectedCSS?: string;
        excepted?: string[];
    };
}

interface StartDetails {
    hostname: string;
}

export function initDOMSurveyor(): void {
    const queriedHashes = new Set<number>();
    const newHashes = new Set<number>();
    const maxSurveyNodes = 65536;
    const pendingLists: Element[][] = [];
    const pendingNodes: (Element | null)[] = [];
    const processedSet = new Set<Element>();
    const ignoreTags: Record<string, number> = Object.assign(Object.create(null), {
        br: 1, head: 1, link: 1, meta: 1, script: 1, style: 1
    });
    let domObserver: MutationObserver | undefined;
    let domFilterer: DOMFilterer;
    let hostname = '';
    let domChanged = false;
    let scannedCount = 0;
    let stopped = false;

    const hashFromStr = (type: number, s: string): number => {
        const len = s.length;
        const step = len + 7 >>> 3;
        let hash = (type << 5) + type ^ len;
        for ( let i = 0; i < len; i += step ) {
            hash = (hash << 5) + hash ^ s.charCodeAt(i);
        }
        return hash & 0xFFFFFF;
    };

    const addHashes = (hashes: number[]): void => {
        for ( const hash of hashes ) {
            queriedHashes.add(hash);
        }
    };

    const qsa = (context: Element, selector: string): Element[] =>
        Array.from(context.querySelectorAll(selector));

    const addPendingList = (list: Element[]): void => {
        if ( list.length === 0 ) { return; }
        pendingLists.push(list);
    };

    const nextPendingNodes = (): number => {
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

    const hasPendingNodes = (): boolean => {
        return pendingLists.length !== 0 || newHashes.size !== 0 ;
    };

    const idFromNode = (node: Element): void => {
        const raw = node.id;
        if ( typeof raw !== 'string' || raw.length === 0 ) { return; }
        const hash = hashFromStr(0x23, raw.trim());
        if ( queriedHashes.has(hash) ) { return; }
        queriedHashes.add(hash);
        newHashes.add(hash);
    };

    const classesFromNode = (node: Element): void => {
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
            const hash = hashFromStr(0x2E, token);
            if ( queriedHashes.has(hash) ) { continue; }
            queriedHashes.add(hash);
            newHashes.add(hash);
        }
    };

    const getSurveyResults = (safeOnly: boolean): void => {
        if ( vAPI?.messaging === undefined ) { return stop(); }
        const promise = newHashes.size === 0
            ? Promise.resolve(null)
            : vAPI.messaging.send('contentscript', {
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

    const doSurvey = (): void => {
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
                    if ( processedSet.has(node as Element) ) { continue; }
                    processedSet.add(node as Element);
                }
                idFromNode(node as Element);
                classesFromNode(node as Element);
                scanned += 1;
            }
            if ( performance.now() >= deadline ) { break; }
        }
        scannedCount += scanned;
        if ( scannedCount >= maxSurveyNodes ) {
            stop();
        }
        processedSet.clear();
        getSurveyResults(false);
    };

    const surveyTimer = new vAPI.SafeAnimationFrame(doSurvey);

    let canShutdownAfter = Date.now() + 300000;
    let surveyResultMissCount = 0;

    const processSurveyResults = (response: unknown): void => {
        if ( stopped ) { return; }
        const res = response as SurveyResult | null;
        const result = res && res.result;
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
        stop();
        vAPI.messaging.send('contentscript', {
            what: 'disableGenericCosmeticFilteringSurveyor',
            hostname,
        });
    };

    const onDomChanged = (mutations: MutationRecord[]): void => {
        domChanged = true;
        for ( const mutation of mutations ) {
            if ( mutation.type === 'childList' ) {
                const { addedNodes } = mutation;
                if ( addedNodes.length === 0 ) { continue; }
                for ( const node of addedNodes ) {
                    if ( node.nodeType !== 1 ) { continue; }
                    const elem = node as Element;
                    if ( ignoreTags[elem.localName] ) { continue; }
                    if ( elem.parentElement === null ) { continue; }
                    addPendingList([ elem ]);
                    if ( elem.firstElementChild === null ) { continue; }
                    addPendingList(qsa(elem, '[id],[class]'));
                }
            } else if ( mutation.attributeName === 'class' ) {
                classesFromNode(mutation.target as Element);
            } else {
                idFromNode(mutation.target as Element);
            }
        }
        if ( hasPendingNodes() ) {
            surveyTimer.start();
        }
    };

    const start = (details: StartDetails): void => {
        if ( vAPI?.domFilterer === undefined ) { return stop(); }
        hostname = details.hostname;
        domFilterer = vAPI.domFilterer;
        if ( document.documentElement !== null ) {
            idFromNode(document.documentElement);
            classesFromNode(document.documentElement);
        }
        if ( document.body !== null ) {
            idFromNode(document.body);
            classesFromNode(document.body);
        }
        if ( newHashes.size !== 0 ) {
            getSurveyResults(true);
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

    const stop = (): void => {
        stopped = true;
        pendingLists.length = 0;
        surveyTimer.clear();
        if ( domObserver ) {
            domObserver.disconnect();
            domObserver = undefined;
        }
        if ( vAPI?.domSurveyor ) {
            vAPI.domSurveyor = null;
        }
    };

    vAPI.domSurveyor = { start, addHashes };
}

/******************************************************************************/
