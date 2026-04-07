/*******************************************************************************

    uBlock Origin - a comprehensive, efficient content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock

 *******************************************************************************

    MODULE STRUCTURE (epicker.ts)
    =============================
    
    This file contains the element picker functionality for uBlock Origin.
    Due to tight coupling between components, it remains monolithic for safety.
    
    SECTIONS:
    ---------
    1.  Header & Initialization (lines ~1-65)
        - License, globals, vAPI validation
        - Global state: netFilterCandidates, cosmeticFilterCandidates, 
          targetElements, candidateElements, bestCandidateFilter
    
    2.  Utility Functions (lines ~66-94)
        - safeQuerySelectorAll, getElementBoundingClientRect
    
    3.  Highlight System (lines ~96-164)
        - highlightElements - SVG overlay drawing
    
    4.  String Processing (lines ~166-229)
        - mergeStrings, trimFragmentFromURL, backgroundImageURLFromElement
    
    5.  URL Extraction (lines ~231-302)
        - resourceURLsFromElement, resourceURLsFromSrcset, resourceURLsFromPicture
    
    6.  Network Filter Generation (lines ~304-409)
        - netFilterFromUnion, netFilterFromElement, netFilter1stSources, filterTypes
    
    7.  Cosmetic Filter Generation (lines ~411-546)
        - cosmeticFilterFromElement
    
    8.  DOM Context Helpers (lines ~548-577)
        - getPageDocument, epickerLog, getPageCoordinates
    
    9.  Filter Extraction (lines ~579-671)
        - filtersFrom - main filter extraction orchestrator
    
    10. DOM Interface (lines ~673-959)
        - filterToDOMInterface - queryAll, preview, apply, unapply
    
    11. Optimize Candidates (lines ~961-993)
        - onOptimizeCandidates
    
    12. Dialog/Session (lines ~995-1032)
        - showDialog
    
    13. Element Lookup (lines ~1034-1129)
        - elementFromPoint (closure with state)
    
    14. Interaction Handlers (lines ~1131-1295)
        - highlightElementAtPoint, filterElementAtPoint, zapElementAtPoint
    
    15. Event Handlers (lines ~1297-1328)
        - onKeyPressed, onViewportChanged
    
    16. Picker Lifecycle (lines ~1330-1394)
        - startPicker, quitPicker
    
    17. Message Handler (lines ~1396-1473)
        - onDialogMessage - main message router
    
    18. Bootstrap & CSS (lines ~1494-1655)
        - getNoCosmeticFiltering, CSS, bootstrap, initialization

 ******************************************************************************/

interface vAPI {
    domFilterer: {
        getAllSelectors: () => {
            declarative?: string[];
            procedural?: Array<{ raw: string; hit?: boolean; exec: () => Element[] }>;
            exceptions?: string[];
        } | null;
        createProceduralFilter: (details: unknown) => {
            test: () => boolean;
            exec: () => Element[];
            raw: string;
        };
        addCSS: (css: string, options?: { mustInject?: boolean }) => void;
        addProceduralSelectors: (selectors: string[]) => void;
        toggle: (state: boolean, callback?: () => void) => void;
        addListener: (handlers: object) => void;
        removeListener: (handlers: object) => void;
    } | null;
    noSpecificCosmeticFiltering?: boolean;
    randomToken: () => string;
    messaging: {
        send: (channel: string, msg: object) => Promise<unknown>;
    };
    userStylesheet: {
        add: (css: string, donottype?: boolean) => void;
        apply: () => void;
        remove: (css: string) => void;
    };
    epickerStyleProxies: Map<string, string>;
    hideStyle: string;
    mouseClick: { x: number; y: number } | null;
    shutdown: {
        add: (callback: () => void) => void;
    };
    pickerFrame: boolean;
}

interface BestCandidateFilter {
    type: 'net' | 'cosmetic';
    filters: string[];
    slot: number;
}

interface FilterResult {
    elem: Element;
    src?: string;
    opt?: string;
    style?: string;
    bg?: boolean;
    raw?: string;
}

interface PickerBootArgs {
    zap?: boolean;
    pickerURL: string;
    eprom?: {
        lastNetFilterSession?: string;
        lastNetFilterHostname?: string;
        lastNetFilterUnion?: string;
    };
}

interface DiffMatchPatch {
    diff_main: (text1: string, text2: string) => Array<[number, string]>;
}

var debugLog = function(source: string, ...args: unknown[]): void {
    // Disabled in production - enable for debugging only
};

(async function() {

/******************************************************************************/

if ( typeof vAPI !== 'object' ) { 
    debugLog('epicker', 'vAPI is not an object');
    return; 
}
if ( vAPI === null ) { 
    debugLog('epicker', 'vAPI is null');
    return; 
}

if ( vAPI.pickerFrame ) { return; }
vAPI.pickerFrame = true;

const pickerUniqueId = vAPI.randomToken();

const reCosmeticAnchor = /^#(\$|\?|\$\?)?#/;

const netFilterCandidates: string[] = [];
const cosmeticFilterCandidates: string[] = [];

let targetElements: Element[] = [];
let candidateElements: Element[] = [];
let bestCandidateFilter: BestCandidateFilter | null = null;

const lastNetFilterSession = window.location.host + window.location.pathname;
let lastNetFilterHostname = '';
let lastNetFilterUnion = '';

const hideBackgroundStyle = 'background-image:none!important;';

const DEBUG_LOGS: string[] = [];

/******************************************************************************/

const safeQuerySelectorAll = function(node: Element | null, selector: string): Element[] {
    if ( node !== null ) {
        try {
            return Array.from(node.querySelectorAll(selector));
        } catch {
        }
    }
    return [];
};

/******************************************************************************/

interface BoundingRect {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
}

const getElementBoundingClientRect = function(elem: Element): BoundingRect {
    if ( typeof elem.getBoundingClientRect !== 'function' ) {
        return { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
    }
    const rect = elem.getBoundingClientRect();
    return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width
    };
};

/******************************************************************************/

let pickerFrame: HTMLIFrameElement | null = null;
let pickerFramePort: browser.runtime.Port | null = null;

const highlightElements = function(elems: Element[], force?: boolean): void {
    debugLog('epicker', 'highlightElements START - elems:', elems ? elems.length : 0, 'force:', force);
    
    if (
        (force !== true) &&
        (elems.length === targetElements.length) &&
        (elems.length === 0 || elems[0] === targetElements[0])
    ) {
        debugLog('epicker', 'highlightElements: skipping (no change)');
        return;
    }
    targetElements = [];

    const pageDoc = getPageDocument();
    const pageWin = pageDoc.defaultView || window;
    const ow = pageWin.innerWidth;
    const oh = pageWin.innerHeight;
    
    debugLog('epicker', 'highlightElements: viewport', ow, oh);
    
    const islands: string[] = [];

    for ( const elem of elems ) {
        if ( elem === pickerFrame ) { 
            debugLog('epicker', 'highlightElements: skipping pickerFrame');
            continue; 
        }
        targetElements.push(elem);
        const rect = getElementBoundingClientRect(elem);
        debugLog('epicker', 'highlightElements: elem', elem.tagName, 'rect:', JSON.stringify(rect));
        
        if (
            rect.left > ow || rect.top > oh ||
            rect.left + rect.width < 0 || rect.top + rect.height < 0
        ) {
            debugLog('epicker', 'elem is offscreen, skipping');
            continue;
        }
        
        if (rect.width === 0 || rect.height === 0) {
            debugLog('epicker', 'elem has zero dimensions, skipping');
            continue;
        }
        
        const path = `M${rect.left} ${rect.top}h${rect.width}v${rect.height}h-${rect.width}z`;
        debugLog('epicker', 'SVG path:', path);
        islands.push(path);
    }
    
    debugLog('epicker', 'highlightElements: islands:', islands.length);
    debugLog('epicker', 'highlightElements: pickerFramePort exists:', !!pickerFramePort);

    if (!pickerFramePort) {
        debugLog('epicker', 'ERROR: pickerFramePort is null!');
        return;
    }

    pickerFramePort.postMessage({
        what: 'svgPaths',
        ocean: `M0 0h${ow}v${oh}h-${ow}z`,
        islands: islands.join(''),
    });
    
    debugLog('epicker', 'highlightElements END - sent svgPaths message');
};

/******************************************************************************/

const mergeStrings = function(urls: string[]): string {
    if ( urls.length === 0 ) { return ''; }
    if (
        urls.length === 1 ||
        (self as unknown as { diff_match_patch?: DiffMatchPatch }).diff_match_patch instanceof Function === false
    ) {
        return urls[0];
    }
    const differ = new (self as unknown as { diff_match_patch: new () => DiffMatchPatch }).diff_match_patch();
    let merged = urls[0];
    for ( let i = 1; i < urls.length; i++ ) {
        const diffs = differ.diff_main(
            urls[i].split('').join('\n'),
            merged.split('').join('\n')
        );
        const result: string[] = [];
        for ( const diff of diffs ) {
            if ( diff[0] !== 0 ) {
                result.push('*');
            } else {
                result.push(diff[1].replace(/\n+/g, ''));
            }
            merged = result.join('');
        }
    }
    merged = merged.replace(/^\*+$/, '')
                   .replace(/\*{2,}/g, '*')
                   .replace(/([^*]{1,3}\*)(?:[^*]{1,3}\*)+/g, '$1');

    let pos = merged.indexOf('/');
    if ( pos === -1 ) { pos = merged.length; }
    return merged.slice(0, pos).includes('*') ? urls[0] : merged;
};

/******************************************************************************/

const trimFragmentFromURL = function(url: string): string {
    const pos = url.indexOf('#');
    return pos !== -1 ? url.slice(0, pos) : url;
};

/******************************************************************************/

const backgroundImageURLFromElement = function(elem: Element): string {
    const style = window.getComputedStyle(elem);
    const bgImg = style.backgroundImage || '';
    const matches = /^url\((["']?)([^"']+)\1\)$/.exec(bgImg);
    const url = matches !== null && matches.length === 3 ? matches[2] : '';
    return url.lastIndexOf('data:', 0) === -1
        ? trimFragmentFromURL(url.slice(0, 1024))
        : '';
};

/******************************************************************************/

const resourceURLsFromElement = function(elem: Element): string[] {
    const urls: string[] = [];
    const tagName = elem.localName;
    const prop = netFilter1stSources[tagName as keyof typeof netFilter1stSources];
    if ( prop === undefined ) {
        const url = backgroundImageURLFromElement(elem);
        if ( url !== '' ) { urls.push(url); }
        return urls;
    }
    let s = (elem as Record<string, unknown>)[prop];
    if ( s instanceof SVGAnimatedString ) {
        s = (s as SVGAnimatedString).baseVal;
    }
    if ( typeof s === 'string' && /^https?:\/\//.test(s) ) {
        urls.push(trimFragmentFromURL(s.slice(0, 1024)));
    }
    resourceURLsFromSrcset(elem, urls);
    resourceURLsFromPicture(elem, urls);
    return urls;
};

const resourceURLsFromSrcset = function(elem: Element, out: string[]): void {
    let srcset = (elem as HTMLImageElement).srcset;
    if ( typeof srcset !== 'string' || srcset === '' ) { return; }
    for(;;) {
        srcset = srcset.trim();
        if ( srcset.length === 0 ) { break; }
        if ( /^,/.test(srcset) ) { break; }
        let match = /^\S+/.exec(srcset);
        if ( match === null ) { break; }
        srcset = srcset.slice(match.index + match[0].length);
        let url = match[0];
        if ( /,$/.test(url) ) {
            url = url.replace(/,$/, '');
            if ( /,$/.test(url) ) { break; }
        } else {
            match = /^[^,]*(?:\(.+?\))?[^,]*(?:,|$)/.exec(srcset);
            if ( match === null ) { break; }
            srcset = srcset.slice(match.index + match[0].length);
        }
        const parsedURL = new URL(url, document.baseURI);
        if ( parsedURL.pathname.length === 0 ) { continue; }
        out.push(trimFragmentFromURL(parsedURL.href));
    }
};

const resourceURLsFromPicture = function(elem: Element, out: string[]): void {
    if ( elem.localName === 'source' ) { return; }
    const picture = elem.parentElement;
    if ( picture === null || picture.localName !== 'picture' ) { return; }
    const sources = picture.querySelectorAll(':scope > source');
    for ( const source of sources ) {
        const urls = resourceURLsFromElement(source);
        if ( urls.length === 0 ) { continue; }
        out.push(...urls);
    }
};

/******************************************************************************/

const netFilterFromUnion = function(patternIn: string, out: string[]): void {
    const currentHostname = self.location.hostname;
    if (
        lastNetFilterUnion === '' ||
        currentHostname === '' ||
        currentHostname !== lastNetFilterHostname
    ) {
        lastNetFilterHostname = currentHostname;
        lastNetFilterUnion = patternIn;
        vAPI.messaging.send('elementPicker', {
            what: 'elementPickerEprom',
            lastNetFilterSession,
            lastNetFilterHostname,
            lastNetFilterUnion,
        });
        return;
    }

    lastNetFilterHostname = currentHostname;
    let patternOut = mergeStrings([ patternIn, lastNetFilterUnion ]);
    if ( patternOut !== '/*' && patternOut !== patternIn ) {
        const filter = `||${patternOut}`;
        if ( out.indexOf(filter) === -1 ) {
            out.push(filter);
        }
        lastNetFilterUnion = patternOut;
    }

    vAPI.messaging.send('elementPicker', {
        what: 'elementPickerEprom',
        lastNetFilterSession,
        lastNetFilterHostname,
        lastNetFilterUnion,
    });
};

/******************************************************************************/

const netFilterFromElement = function(elem: Element): number {
    if ( elem === null ) { return 0; }
    if ( elem.nodeType !== 1 ) { return 0; }
    const urls = resourceURLsFromElement(elem);
    if ( urls.length === 0 ) { return 0; }

    if ( candidateElements.indexOf(elem) === -1 ) {
        candidateElements.push(elem);
    }

    const candidates = netFilterCandidates;
    const len = candidates.length;

    for ( let i = 0; i < urls.length; i++ ) {
        urls[i] = urls[i].replace(/^https?:\/\//, '');
    }
    const pattern = mergeStrings(urls);


    if ( bestCandidateFilter === null && elem.matches('html,body') === false ) {
        bestCandidateFilter = {
            type: 'net',
            filters: candidates,
            slot: candidates.length
        };
    }

    candidates.push(`||${pattern}`);

    const pos = pattern.indexOf('?');
    if ( pos !== -1 ) {
        candidates.push(`||${pattern.slice(0, pos)}`);
    }

    netFilterFromUnion(pattern, candidates);

    return candidates.length - len;
};

const netFilter1stSources = {
     'audio': 'src',
     'embed': 'src',
    'iframe': 'src',
       'img': 'src',
     'image': 'href',
    'object': 'data',
    'source': 'src',
     'video': 'src'
} as const;

const filterTypes = {
     'audio': 'media',
     'embed': 'object',
    'iframe': 'subdocument',
       'img': 'image',
    'object': 'object',
     'video': 'media',
} as const;

/******************************************************************************/

const cosmeticFilterFromElement = function(elem: Element): number {
    if ( elem === null ) { return 0; }
    if ( elem.nodeType !== 1 ) { return 0; }
    if ( getNoCosmeticFiltering() ) { return 0; }

    if ( candidateElements.indexOf(elem) === -1 ) {
        candidateElements.push(elem);
    }

    let selector = '';

    let v = typeof elem.id === 'string' && CSS.escape(elem.id);
    if ( v ) {
        selector = '#' + v;
    }

    v = elem.classList;
    if ( v ) {
        let i = v.length || 0;
        while ( i-- ) {
            selector += '.' + CSS.escape(v.item(i));
        }
    }

    const tagName = CSS.escape(elem.localName);

    if ( selector === '' ) {
        let attributes: Array<{ k: string; v: string }> = [], attr;
        switch ( tagName ) {
        case 'a':
            v = elem.getAttribute('href');
            if ( v ) {
                v = v.trim().replace(/\?.*$/, '');
                if ( v.length ) {
                    attributes.push({ k: 'href', v: v });
                }
            }
            break;
        case 'iframe':
        case 'img':
            v = elem.getAttribute('src');
            if ( v && v.length !== 0 ) {
                v = v.trim();
                if ( v.startsWith('data:') ) {
                    let pos = v.indexOf(',');
                    if ( pos !== -1 ) {
                        v = v.slice(0, pos + 1);
                    }
                } else if ( v.startsWith('blob:') ) {
                    v = new URL(v.slice(5));
                    v.pathname = '';
                    v = 'blob:' + v.href;
                }
                attributes.push({ k: 'src', v: v.slice(0, 256) });
                break;
            }
            v = elem.getAttribute('alt');
            if ( v && v.length !== 0 ) {
                attributes.push({ k: 'alt', v: v });
                break;
            }
            break;
        default:
            break;
        }
        while ( (attr = attributes.pop()) ) {
            if ( attr.v.length === 0 ) { continue; }
            const w = attr.v.replace(/([^\\])"/g, '$1\\"');
            v = elem.getAttribute(attr.k);
            if ( attr.v === v ) {
                selector += `[${attr.k}="${w}"]`;
            } else if ( v && v.startsWith(attr.v) ) {
                selector += `[${attr.k}^="${w}"]`;
            } else {
                selector += `[${attr.k}*="${w}"]`;
            }
        }
    }

    const parentNode = elem.parentNode;
    if (
        selector === '' ||
        safeQuerySelectorAll(parentNode as Element, `:scope > ${selector}`).length > 1
    ) {
        selector = tagName + selector;
    }

    if ( safeQuerySelectorAll(parentNode as Element, `:scope > ${selector}`).length > 1 ) {
        let i = 1;
        while ( elem.previousSibling !== null ) {
            elem = elem.previousSibling as Element;
            if (
                typeof elem.localName === 'string' &&
                elem.localName === tagName
            ) {
                i++;
            }
        }
        selector += `:nth-of-type(${i})`;
    }

    if ( bestCandidateFilter === null ) {
        bestCandidateFilter = {
            type: 'cosmetic',
            filters: cosmeticFilterCandidates,
            slot: cosmeticFilterCandidates.length
        };
    }

    cosmeticFilterCandidates.push(`##${selector}`);

    return 1;
};

/******************************************************************************/

var getPageDocument = function(): Document {
    debugLog('epicker', 'getPageDocument: using self.document (page context)');
    return self.document;
};

var epickerLog = (function() {
    var fn = function() {};
    fn.getLog = function() { return ''; };
    fn.clear = function() {};
    return fn;
})();

var getPageCoordinates = function(ev: MouseEvent): { x: number; y: number } {
    var x = typeof ev.pageX === 'number' ? ev.pageX : ev.clientX;
    var y = typeof ev.pageY === 'number' ? ev.pageY : ev.clientY;
    debugLog('epicker', 'getPageCoordinates:', x, y);
    return { x: x, y: y };
};

const getDebugLogs = (): string => DEBUG_LOGS.join('\n');

self.getDebugLogs = getDebugLogs;

/******************************************************************************/

const filtersFrom = function(x: number | undefined, y: number | undefined): number {
    debugLog('epicker', 'filtersFrom called with x:', x, 'y:', y);
    debugLog('epicker', 'self.location.protocol:', self.location.protocol);
    
    const pageDoc = getPageDocument();
    debugLog('epicker', 'pageDoc elementsFromPoint:', typeof pageDoc.elementsFromPoint);
    
    bestCandidateFilter = null;
    netFilterCandidates.length = 0;
    cosmeticFilterCandidates.length = 0;
    candidateElements.length = 0;

    let first: Element | null = null;
    if ( typeof x === 'number' ) {
        first = elementFromPoint(x, y);
        debugLog('epicker', 'elementFromPoint result:', first);
    } else if ( x instanceof HTMLElement ) {
        first = x;
        x = undefined;
    }

    debugLog('epicker', 'first element:', first);

    if ( typeof x === 'number' ) {
        const magicAttr = `${pickerUniqueId}-clickblind`;
        if (pickerFrame) {
            pickerFrame.setAttribute(magicAttr, '');
        }
        const elems = pageDoc.elementsFromPoint(x, y);
        if (pickerFrame) {
            pickerFrame.removeAttribute(magicAttr);
        }
        debugLog('epicker', 'elements from point:', elems.length);
        for ( const elem of elems ) {
            netFilterFromElement(elem);
        }
    } else if ( first !== null ) {
        netFilterFromElement(first);
    }

    let elem = first;
    while ( elem && elem !== pageDoc.body ) {
        cosmeticFilterFromElement(elem);
        elem = elem.parentNode as Element;
    }
    let i = cosmeticFilterCandidates.length;
    if ( i !== 0 ) {
        const selector = cosmeticFilterCandidates[i-1].slice(2);
        if ( safeQuerySelectorAll(pageDoc.body, selector).length > 1 ) {
            cosmeticFilterCandidates.push('##body');
        }
    }

    if ( bestCandidateFilter === null && netFilterCandidates.length !== 0 ) {
        bestCandidateFilter = {
            type: 'net',
            filters: netFilterCandidates,
            slot: 0
        };
    }
    
    if ( bestCandidateFilter === null && cosmeticFilterCandidates.length !== 0 ) {
        bestCandidateFilter = {
            type: 'cosmetic',
            filters: cosmeticFilterCandidates,
            slot: 0
        };
    }

    const result = netFilterCandidates.length + cosmeticFilterCandidates.length;
    debugLog('epicker', 'filtersFrom final - result:', result, 'netFilterCandidates:', netFilterCandidates.length, 'cosmeticFilterCandidates:', cosmeticFilterCandidates.length, 'bestCandidateFilter:', bestCandidateFilter);
    return result;
};

/*******************************************************************************

    filterToDOMInterface.queryAll
    filterToDOMInterface.preview
    filterToDOMInterface.apply
    filterToDOMInterface.unapply

*/

const filterToDOMInterface = (( ) => {
    const reHnAnchorPrefix = '^[\\w-]+://(?:[^/?#]+\\.)?';
    const reCaret = '(?:[^%.0-9a-z_-]|$)';
    const rePseudoElements = /:(?::?after|:?before|:[a-z-]+)$/;

    const matchElemToRegex = (elem: Element, re: RegExp): string | undefined => {
        const srcProp = netFilter1stSources[elem.localName as keyof typeof netFilter1stSources];
        let src = (elem as Record<string, unknown>)[srcProp as string];
        if ( src instanceof SVGAnimatedString ) {
            src = (src as SVGAnimatedString).baseVal;
        }
        if ( typeof src === 'string' && /^https?:\/\//.test(src) ) {
            if ( re.test(src) ) { return srcProp as string; }
        }
        src = (elem as HTMLImageElement).currentSrc;
        if ( typeof src === 'string' && /^https?:\/\//.test(src) ) {
            if ( re.test(src) ) { return srcProp as string; }
        }
    };

    const fromNetworkFilter = function(filter: string): FilterResult[] {
        const out: FilterResult[] = [];
        if ( /^[0-9a-z]$/i.test(filter) ) { return out; }
        let reStr = '';
        if (
            filter.length > 2 &&
            filter.startsWith('/') &&
            filter.endsWith('/')
        ) {
            reStr = filter.slice(1, -1);
        } else if ( /^\w[\w.-]*[a-z]$/i.test(filter) ) {
            reStr = reHnAnchorPrefix +
                    filter.toLowerCase().replace(/\./g, '\\.') +
                    reCaret;
        } else {
            let rePrefix = '', reSuffix = '';
            if ( filter.startsWith('||') ) {
                rePrefix = reHnAnchorPrefix;
                filter = filter.slice(2);
            } else if ( filter.startsWith('|') ) {
                rePrefix = '^';
                filter = filter.slice(1);   
            }
            if ( filter.endsWith('|') ) {
                reSuffix = '$';
                filter = filter.slice(0, -1);
            }
            reStr = rePrefix +
                    filter.replace(/[.+?${}()|[\]\\]/g, '\\$&')
                          .replace(/\*+/g, '.*')
                          .replace(/\^/g, reCaret) +
                    reSuffix;
        }
        let reFilter: RegExp | null = null;
        try {
            reFilter = new RegExp(reStr, 'i');
        } catch {
            return out;
        }

        const pageDoc = getPageDocument();
        const elems = pageDoc.querySelectorAll(
            Object.keys(netFilter1stSources).join()
        );
        for ( const elem of elems ) {
            const srcProp = matchElemToRegex(elem, reFilter!);
            if ( srcProp === undefined ) { continue; }
            out.push({
                elem,
                src: srcProp,
                opt: filterTypes[elem.localName as keyof typeof filterTypes],
                style: vAPI.hideStyle,
            });
        }

        for ( const elem of candidateElements ) {
            if ( reFilter!.test(backgroundImageURLFromElement(elem)) ) {
                out.push({
                    elem,
                    bg: true,
                    opt: 'image',
                    style: hideBackgroundStyle,
                });
            }
        }

        return out;
    };

    const fromPlainCosmeticFilter = function(raw: string): FilterResult[] | undefined {
        let elems: Element[];
        const pageDoc = getPageDocument();
        try {
            pageDoc.documentElement.matches(`${raw},\na`);
            elems = Array.from(pageDoc.querySelectorAll(
                raw.replace(rePseudoElements, '')
            ));
        } catch {
            return;
        }
        const out: FilterResult[] = [];
        for ( const elem of elems ) {
            if ( elem === pickerFrame ) { continue; }
            out.push({ elem, raw, style: vAPI.hideStyle });
        }
        return out;
    };

    const fromCompiledCosmeticFilter = function(raw: string): FilterResult[] | undefined {
        if ( getNoCosmeticFiltering() ) { return; }
        if ( typeof raw !== 'string' ) { return; }
        let elems: Element[] | null, style: string | undefined;
        try {
            const o = JSON.parse(raw);
            elems = vAPI.domFilterer!.createProceduralFilter(o).exec();
            switch ( o.action && o.action[0] || '' ) {
            case '':
            case 'remove':
                style = vAPI.hideStyle;
                break;
            case 'style':
                style = o.action[1];
                break;
            default:
                break;
            }
        } catch {
            return;
        }
        if ( !elems ) { return; }
        const out: FilterResult[] = [];
        for ( const elem of elems ) {
            out.push({ elem, raw, style });
        }
        return out;
    };

    vAPI.epickerStyleProxies = vAPI.epickerStyleProxies || new Map();

    let lastFilter: string = '';
    let lastResultset: FilterResult[] | undefined;
    let previewing = false;

    const queryAll = function(details: { filter: string; compiled: string }): FilterResult[] | undefined {
        let { filter, compiled } = details;
        filter = filter.trim();
        if ( filter === lastFilter ) { return lastResultset; }
        unapply();
        if ( filter === '' || filter === '!' ) {
            lastFilter = '';
            lastResultset = undefined;
            return;
        }
        lastFilter = filter;
        if ( reCosmeticAnchor.test(filter) === false ) {
            lastResultset = fromNetworkFilter(filter);
            if ( previewing ) { apply(); }
            return lastResultset;
        }
        lastResultset = fromPlainCosmeticFilter(compiled);
        if ( lastResultset ) {
            if ( previewing ) { apply(); }
            return lastResultset;
        }
        lastResultset = fromCompiledCosmeticFilter(compiled);
        if ( previewing ) { apply(); }
        return lastResultset;
    };

    const apply = function(): void {
        unapply();
        if ( Array.isArray(lastResultset) === false ) { return; }
        const pageDoc = getPageDocument();
        const rootElem = pageDoc.documentElement;
        for ( const { elem, style } of lastResultset ) {
            if ( elem === pickerFrame ) { continue; }
            if ( style === undefined ) { continue; }
            if ( elem === rootElem && style === vAPI.hideStyle ) { continue; }
            let styleToken = vAPI.epickerStyleProxies.get(style);
            if ( styleToken === undefined ) {
                styleToken = vAPI.randomToken();
                vAPI.epickerStyleProxies.set(style, styleToken);
                vAPI.userStylesheet.add(`[${styleToken}]\n{${style}}`, true);
            }
            elem.setAttribute(styleToken, '');
        }
    };

    const unapply = function(): void {
        const pageDoc = getPageDocument();
        for ( const styleToken of vAPI.epickerStyleProxies.values() ) {
            for ( const elem of pageDoc.querySelectorAll(`[${styleToken}]`) ) {
                elem.removeAttribute(styleToken);
            }
        }
    };

    const preview = function(state: boolean | undefined, permanent = false): void {
        previewing = state !== false;
        if ( previewing === false ) {
            return unapply();
        }
        if ( Array.isArray(lastResultset) === false ) { return; }
        if ( permanent === false || reCosmeticAnchor.test(lastFilter) === false ) {
            return apply();
        }
        if ( getNoCosmeticFiltering() ) { return; }
        const cssSelectors = new Set<string>();
        const proceduralSelectors = new Set<string>();
        for ( const { raw } of lastResultset ) {
            if ( raw!.startsWith('{') ) {
                proceduralSelectors.add(raw!);
            } else {
                cssSelectors.add(raw!);
            }
        }
        if ( cssSelectors.size !== 0 ) {
            vAPI.domFilterer!.addCSS(
                `${Array.from(cssSelectors).join('\n')}\n{${vAPI.hideStyle}}`,
                { mustInject: true }
            );
        }
        if ( proceduralSelectors.size !== 0 ) {
            vAPI.domFilterer!.addProceduralSelectors(
                Array.from(proceduralSelectors)
            );
        }
    };

    return { preview, queryAll, apply, unapply };
})();

/******************************************************************************/

const onOptimizeCandidates = function(details: { candidates: string[][]; slot: number }): void {
    const { candidates } = details;
    const results: Array<{ selector: string; count: number }> = [];
    const pageDoc = getPageDocument();
    for ( const paths of candidates ) {
        let count = Number.MAX_SAFE_INTEGER;
        let selector = '';
        for ( let i = 0, n = paths.length; i < n; i++ ) {
            const s = paths.slice(n - i - 1).join('');
            const elems = pageDoc.querySelectorAll(s);
            if ( elems.length < count ) {
                selector = s;
                count = elems.length;
            }
        }
        results.push({ selector: `##${selector}`, count });
    }
    results.sort((a, b) => {
        const r = b.count - a.count;
        if ( r !== 0 ) { return r; }
        return a.selector.length - b.selector.length;
    });

    pickerFramePort!.postMessage({
        what: 'candidatesOptimized',
        candidates: results.map(a => a.selector),
        slot: details.slot,
    });
};

/******************************************************************************/

const showDialog = function(options: { broad?: boolean }): void {
    debugLog('epicker', 'showDialog called, pickerFramePort:', pickerFramePort ? 'exists' : 'null');
    debugLog('epicker', 'netFilterCandidates:', JSON.stringify(netFilterCandidates));
    debugLog('epicker', 'cosmeticFilterCandidates:', JSON.stringify(cosmeticFilterCandidates));
    debugLog('epicker', 'bestCandidateFilter:', JSON.stringify(bestCandidateFilter));
    
    if (!pickerFramePort) {
        debugLog('epicker', 'ERROR: pickerFramePort is null, cannot show dialog!');
        return;
    }
    
    let selectedFilter = '';
    if (bestCandidateFilter && bestCandidateFilter.filters && bestCandidateFilter.filters.length > 0) {
        const slot = bestCandidateFilter.slot || 0;
        selectedFilter = bestCandidateFilter.filters[slot] || bestCandidateFilter.filters[bestCandidateFilter.filters.length - 1];
    }
    
    pickerFramePort.postMessage({
        what: 'showDialog',
        url: self.location.href,
        netFilters: netFilterCandidates,
        cosmeticFilters: cosmeticFilterCandidates,
        filter: bestCandidateFilter,
        options,
        debugLogs: getDebugLogs(),
    });
    
    debugLog('epicker', 'showDialog message sent');
};

/******************************************************************************/

const elementFromPoint = (function() {
    var lastX: number | undefined, lastY: number | undefined;
    var pickerFrameRef: HTMLIFrameElement | null = null;

    return function(x: number | undefined, y: number | undefined): Element | null {
        if ( x !== undefined ) {
            lastX = x; lastY = y;
        } else if ( lastX !== undefined ) {
            x = lastX; y = lastY;
        } else {
            debugLog('epicker', 'elementFromPoint: no coordinates');
            return null;
        }
        
        var frame = pickerFrameRef || pickerFrame;
        debugLog('epicker', 'elementFromPoint: frame from closure:', frame ? 'found' : 'null');
        
        if ( !frame ) {
            debugLog('epicker', 'elementFromPoint: no pickerFrame, attempting to find it');
            var pageDoc = getPageDocument();
            var iframes = pageDoc.querySelectorAll('iframe');
            debugLog('epicker', 'elementFromPoint: found', iframes.length, 'iframes in document');
            for (var i = 0; i < iframes.length; i++) {
                debugLog('epicker', 'elementFromPoint: checking iframe', i, 'id:', iframes[i].id, 'has picker attr:', iframes[i].hasAttribute(pickerUniqueId));
                if (iframes[i].hasAttribute(pickerUniqueId)) {
                    frame = iframes[i];
                    pickerFrameRef = frame;
                    debugLog('epicker', 'elementFromPoint: found picker frame by attribute');
                    break;
                }
            }
        }
        
        if ( !frame ) {
            debugLog('epicker', 'elementFromPoint: still no pickerFrame');
            var pageDoc = getPageDocument();
            var elem = pageDoc.elementFromPoint(x!, y!);
            debugLog('epicker', 'elementFromPoint fallback result:', elem ? elem.tagName : 'null');
            return elem;
        }
        
        var pageDoc = getPageDocument();
        var magicAttr = pickerUniqueId + '-clickblind';
        debugLog('epicker', 'elementFromPoint: setting clickblind on frame (attr:', magicAttr, ')');
        frame.setAttribute(magicAttr, '');
        
        const oldPointerEvents = frame.style.getPropertyValue('pointer-events');
        const oldPointerEventsPriority = frame.style.getPropertyPriority('pointer-events');
        frame.style.setProperty('pointer-events', 'none', 'important');

        debugLog('epicker', 'elementFromPoint: frame has clickblind attr:', frame.hasAttribute(magicAttr));
        
        var elems = pageDoc.elementsFromPoint(x!, y!);
        var elem: Element | null = null;
        for ( var i = 0; i < elems.length; i++ ) {
            if ( elems[i] === frame ) { continue; }
            if ( elems[i].hasAttribute && elems[i].hasAttribute(pickerUniqueId) ) { continue; }
            elem = elems[i];
            break;
        }
        
        debugLog('epicker', 'elementFromPoint: raw result:', elem ? elem.tagName + ' (id=' + (elem.id||'none') + ')' : 'null');
        
        if (oldPointerEvents) {
            frame.style.setProperty('pointer-events', oldPointerEvents, oldPointerEventsPriority);
        } else {
            frame.style.removeProperty('pointer-events');
        }

        if (
            elem === null ||
            elem === pageDoc.body ||
            elem === pageDoc.documentElement || (
                pickerBootArgs.zap !== true &&
                getNoCosmeticFiltering() &&
                resourceURLsFromElement(elem).length === 0
            )
        ) {
            elem = null;
        }
        frame.removeAttribute(magicAttr);
        debugLog('epicker', 'elementFromPoint final result:', elem ? elem.tagName : 'null');
        return elem;
    };
})();

/******************************************************************************/

const highlightElementAtPoint = function(mx: number, my: number): void {
    debugLog('epicker', 'highlightElementAtPoint START - page coords:', mx, my);
    
    const x = mx;
    const y = my;
    
    debugLog('epicker', 'Using page coords:', x, y);
    
    const elem = elementFromPoint(x, y);
    debugLog('epicker', 'elementFromPoint result:', elem ? elem.tagName : 'null');
    
    debugLog('epicker', 'Calling highlightElements');
    highlightElements(elem ? [ elem ] : []);
    
    debugLog('epicker', 'highlightElementAtPoint END');
};

/******************************************************************************/

const filterElementAtPoint = function(mx: number, my: number, broad?: boolean): void {
    debugLog('epicker', 'filterElementAtPoint page coords:', mx, my);
    if ( filtersFrom(mx, my) === 0 ) { return; }
    showDialog({ broad });
};

const zapElementAtPoint = function(mx: number, my: number, options: { highlight?: boolean; stay?: boolean }): void {
    debugLog('epicker', 'zapElementAtPoint START - mx:', mx, 'my:', my, 'options:', options);
    console.log('[ZAPPER] Starting - mx:', mx, 'my:', my, 'options:', options);
    
    if ( options.highlight ) {
        console.log('[ZAPPER] Highlight mode');
        debugLog('epicker', 'zapElementAtPoint: highlight mode');
        const elem = elementFromPoint(mx, my);
        debugLog('epicker', 'zapElementAtPoint: found elem:', elem ? elem.tagName : 'null');
        if ( elem ) {
            debugLog('epicker', 'zapElementAtPoint: calling highlightElements');
            highlightElements([ elem ]);
        }
        return;
    }

    console.log('[ZAPPER] Remove mode - finding element');
    debugLog('epicker', 'zapElementAtPoint: remove mode');
    let elemToRemove = targetElements.length !== 0 && targetElements[0] || null;
    if ( elemToRemove === null && mx !== undefined ) {
        elemToRemove = elementFromPoint(mx, my);
    }

    console.log('[ZAPPER] Element to remove:', elemToRemove ? elemToRemove.tagName : 'NULL');
    debugLog('epicker', 'zapElementAtPoint: elemToRemove:', elemToRemove ? elemToRemove.tagName : 'null');

    if ( elemToRemove instanceof Element === false ) { 
        console.log('[ZAPPER] Not an element, returning');
        debugLog('epicker', 'zapElementAtPoint: not an Element, returning');
        return; 
    }

    console.log('[ZAPPER] Calling filtersFrom to get filter candidates...');
    debugLog('epicker', 'zapElementAtPoint: calling filtersFrom to generate filter (element still exists)');
    filtersFrom(mx, my);
    
    console.log('[ZAPPER] After filtersFrom - net:', netFilterCandidates.length, 'cosmetic:', cosmeticFilterCandidates.length, 'bestCandidateFilter:', bestCandidateFilter);
    debugLog('epicker', 'zapElementAtPoint: filtersFrom result - net:', netFilterCandidates.length, 'cosmetic:', cosmeticFilterCandidates.length, 'bestCandidateFilter:', bestCandidateFilter);
    
    let filterToSave: string | null = null;
    debugLog('epicker', 'zapElementAtPoint: bestCandidateFilter:', JSON.stringify(bestCandidateFilter));
    debugLog('epicker', 'zapElementAtPoint: cosmeticFilterCandidates:', cosmeticFilterCandidates);
    debugLog('epicker', 'zapElementAtPoint: netFilterCandidates:', netFilterCandidates);
    if (bestCandidateFilter && bestCandidateFilter.filters && bestCandidateFilter.filters.length > 0) {
        const slot = bestCandidateFilter.slot !== undefined ? bestCandidateFilter.slot : bestCandidateFilter.filters.length - 1;
        filterToSave = bestCandidateFilter.filters[slot];
        debugLog('epicker', 'zapElementAtPoint: got filter from bestCandidateFilter, slot:', slot, 'filter:', filterToSave);
    } else if (cosmeticFilterCandidates.length > 0) {
        filterToSave = cosmeticFilterCandidates[cosmeticFilterCandidates.length - 1];
        debugLog('epicker', 'zapElementAtPoint: got filter from cosmeticFilterCandidates:', filterToSave);
    } else if (netFilterCandidates.length > 0) {
        filterToSave = netFilterCandidates[0];
        debugLog('epicker', 'zapElementAtPoint: got filter from netFilterCandidates:', filterToSave);
    }
    
    debugLog('epicker', 'zapElementAtPoint: filterToSave:', filterToSave);
    
    if (!filterToSave) {
        debugLog('epicker', 'zapElementAtPoint: NO FILTER FOUND - aborting');
        return;
    }

    const getStyleValue = (elem: Element, prop: string): string => {
        const style = window.getComputedStyle(elem);
        return style ? style[prop] : '';
    };

    let maybeScrollLocked = elemToRemove.shadowRoot instanceof DocumentFragment;
    if ( maybeScrollLocked === false ) {
        let elem: Element | null = elemToRemove;
        do {
            maybeScrollLocked =
                parseInt(getStyleValue(elem, 'zIndex'), 10) >= 1000 ||
                getStyleValue(elem, 'position') === 'fixed';
            elem = elem.parentElement;
        } while ( elem !== null && maybeScrollLocked === false );
    }
    if ( maybeScrollLocked ) {
        const doc = document;
        if ( getStyleValue(doc.body, 'overflowY') === 'hidden' ) {
            doc.body.style.setProperty('overflow', 'auto', 'important');
        }
        if ( getStyleValue(doc.body, 'position') === 'fixed' ) {
            doc.body.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'position') === 'fixed' ) {
            doc.documentElement.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'overflowY') === 'hidden' ) {
            doc.documentElement.style.setProperty('overflow', 'auto', 'important');
        }
    }

    console.log('[ZAPPER] Removing element');
    debugLog('epicker', 'zapElementAtPoint: removing element');
    elemToRemove.remove();
    
    console.log('[ZAPPER] Generated filter:', self.location.hostname + '##' + filterToSave);
    if (pickerFramePort) {
        pickerFramePort.postMessage({
            what: 'saveFilterFromZapper',
            filter: filterToSave,
            docURL: self.location.href,
        });
        debugLog('epicker', 'zapElementAtPoint: sent saveFilterFromZapper to epicker-ui');
    }
    
    if (pickerFramePort && options.stay !== true) {
        debugLog('epicker', 'zapElementAtPoint: sending dialogCreate message');
        pickerFramePort.postMessage({
            what: 'dialogCreate',
            filter: filterToSave,
        });
    } else {
        debugLog('epicker', 'zapElementAtPoint: staying in zapper mode (stay=true)');
    }
    
    highlightElementAtPoint(mx, my);
    debugLog('epicker', 'zapElementAtPoint END');
};

/******************************************************************************/

const onKeyPressed = function(ev: KeyboardEvent): void {
    if (
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        pickerBootArgs.zap
    ) {
        ev.stopPropagation();
        ev.preventDefault();
        zapElementAtPoint(0, 0, { highlight: false, stay: false });
        return;
    }
    if ( ev.key === 'Escape' || ev.which === 27 ) {
        ev.stopPropagation();
        ev.preventDefault();
        filterToDOMInterface.preview(false);
        quitPicker();
        return;
    }
};

/******************************************************************************/

const onViewportChanged = function(): void {
    highlightElements(targetElements, true);
};

/******************************************************************************/

let pickerBootArgs: PickerBootArgs;

const startPicker = function(): void {
    debugLog('epicker', 'startPicker called, pickerBootArgs:', pickerBootArgs);
    pickerFrame!.focus();

    self.addEventListener('scroll', onViewportChanged, { passive: true });
    self.addEventListener('resize', onViewportChanged, { passive: true });
    self.addEventListener('keydown', onKeyPressed, true);
    self.addEventListener('click', function(ev: MouseEvent) {
        debugLog('epicker', 'Click detected in page context');
        if (vAPI.mouseClick instanceof Object && vAPI.mouseClick.x >= 0) {
            debugLog('epicker', 'Using vAPI.mouseClick position:', vAPI.mouseClick.x, vAPI.mouseClick.y);
            if ( filtersFrom(vAPI.mouseClick.x, vAPI.mouseClick.y) !== 0 ) {
                return showDialog();
            }
        }
    }, true);

    if (
        vAPI.mouseClick instanceof Object &&
        typeof vAPI.mouseClick.x === 'number' &&
        vAPI.mouseClick.x >= 0 &&
        typeof vAPI.mouseClick.y === 'number' &&
        vAPI.mouseClick.y >= 0
    ) {
        debugLog('epicker', 'Initial mouse position:', vAPI.mouseClick.x, vAPI.mouseClick.y);
        if ( filtersFrom(vAPI.mouseClick.x, vAPI.mouseClick.y) !== 0 ) {
            return showDialog();
        }
    } else {
        debugLog('epicker', 'No initial mouse position - will use UI mouse tracking');
    }

    debugLog('epicker', 'startPicker complete - waiting for UI messages');
};

/******************************************************************************/

const quitPicker = function(): void {
    self.removeEventListener('scroll', onViewportChanged, { passive: true });
    self.removeEventListener('resize', onViewportChanged, { passive: true });
    self.removeEventListener('keydown', onKeyPressed, true);
    vAPI.shutdown.remove(quitPicker);
    if ( pickerFramePort ) {
        pickerFramePort.close();
        pickerFramePort = null;
    }
    if ( pickerFrame ) {
        pickerFrame.remove();
        pickerFrame = null;
    }
    vAPI.userStylesheet.remove(pickerCSS);
    vAPI.userStylesheet.apply();
    vAPI.pickerFrame = false;
    self.focus();
};

vAPI.shutdown.add(quitPicker);

/******************************************************************************/

type DialogMessage =
    | { what: 'getLog' }
    | { what: 'start' }
    | { what: 'optimizeCandidates'; candidates: string[][]; slot: number }
    | { what: 'dialogCreate'; filter?: string; stay?: boolean }
    | { what: 'dialogSetFilter'; filter: string }
    | { what: 'quitPicker' }
    | { what: 'highlightElementAtPoint'; mx: number; my: number }
    | { what: 'unhighlight' }
    | { what: 'filterElementAtPoint'; mx: number; my: number; broad?: boolean }
    | { what: 'zapElementAtPoint'; mx: number; my: number; options: { highlight?: boolean; stay?: boolean } }
    | { what: 'togglePreview'; state: boolean };

const onDialogMessage = function(msg: DialogMessage): void {
    switch ( msg.what ) {
    case 'getLog':
        if (pickerFramePort) {
            pickerFramePort.postMessage({
                what: 'logContent',
                log: epickerLog.getLog()
            });
        }
        break;
    case 'start':
        startPicker();
        if ( pickerFramePort === null ) { break; }
        if ( targetElements.length === 0 ) {
            highlightElements([], true);
        }
        break;
    case 'optimizeCandidates':
        onOptimizeCandidates(msg as { candidates: string[][]; slot: number });
        break;
    case 'dialogCreate':
        debugLog('epicker', 'dialogCreate: calling queryAll and preview');
        filterToDOMInterface.queryAll(msg as { filter: string; compiled: string });
        filterToDOMInterface.preview(true, true);
        if (msg.stay !== true) {
            debugLog('epicker', 'dialogCreate: calling quitPicker');
            quitPicker();
        } else {
            debugLog('epicker', 'dialogCreate: staying in zapper mode (stay=true)');
        }
        break;
    case 'dialogSetFilter': {
        const resultset = filterToDOMInterface.queryAll(msg as { filter: string; compiled: string }) || [];
        highlightElements(resultset.map(a => a.elem), true);
        if ( msg.filter === '!' ) { break; }
        pickerFramePort!.postMessage({
            what: 'resultsetDetails',
            count: resultset.length,
            opt: resultset.length !== 0 ? resultset[0].opt : undefined,
        });
        break;
    }
    case 'quitPicker':
        filterToDOMInterface.preview(false);
        quitPicker();
        break;
    case 'highlightElementAtPoint':
        highlightElementAtPoint(msg.mx, msg.my);
        break;
    case 'unhighlight':
        highlightElements([]);
        break;
    case 'filterElementAtPoint':
        filterElementAtPoint(msg.mx, msg.my, msg.broad);
        break;
    case 'zapElementAtPoint':
        zapElementAtPoint(msg.mx, msg.my, msg.options);
        if ( msg.options.highlight !== true && msg.options.stay !== true ) {
            quitPicker();
        }
        break;
    case 'togglePreview':
        filterToDOMInterface.preview(msg.state);
        if ( msg.state === false ) {
            highlightElements(targetElements, true);
        }
        break;
    default:
        break;
    }
};

/******************************************************************************/

const getNoCosmeticFiltering = ( ): boolean => {
    if ( pickerBootArgs && pickerBootArgs.zap === true ) { return false; }
    return vAPI.domFilterer instanceof Object === false ||
           vAPI.noSpecificCosmeticFiltering === true;
};

const pickerCSSStyle = [
    'background: transparent',
    'border: 0',
    'border-radius: 0',
    'box-shadow: none',
    'color-scheme: light dark',
    'display: block',
    'filter: none',
    'height: 100vh',
    '    height: 100svh',
    'left: 0',
    'margin: 0',
    'max-height: none',
    'max-width: none',
    'min-height: unset',
    'min-width: unset',
    'opacity: 1',
    'outline: 0',
    'padding: 0',
    'pointer-events: auto',
    'position: fixed',
    'top: 0',
    'transform: none',
    'visibility: hidden',
    'width: 100%',
    'z-index: 2147483647',
    ''
].join(' !important;\n');


const pickerCSS = `
:root > [${pickerUniqueId}] {
    ${pickerCSSStyle}
}
:root > [${pickerUniqueId}-loaded] {
    visibility: visible !important;
}
:root [${pickerUniqueId}-clickblind] {
    pointer-events: none !important;
}
`;

vAPI.userStylesheet.add(pickerCSS);
vAPI.userStylesheet.apply();

const bootstrap = async ( ): Promise<HTMLIFrameElement | undefined> => {
    try {
        pickerBootArgs = await vAPI.messaging.send('elementPicker', {
            what: 'elementPickerArguments',
        }) as PickerBootArgs;
    } catch (e) {
        return;
    }
    if ( typeof pickerBootArgs !== 'object' ) { return; }
    if ( pickerBootArgs === null ) { return; }
    const eprom = pickerBootArgs.eprom || null;
    if ( eprom !== null && eprom.lastNetFilterSession === lastNetFilterSession ) {
        lastNetFilterHostname = eprom.lastNetFilterHostname || '';
        lastNetFilterUnion = eprom.lastNetFilterUnion || '';
    }
    const url = new URL(pickerBootArgs.pickerURL);
    if ( pickerBootArgs.zap ) {
        url.searchParams.set('zap', '1');
    }
    return new Promise<HTMLIFrameElement>(resolve => {
        var iframe = document.createElement('iframe');
        iframe.setAttribute(pickerUniqueId, '');
        
        iframe.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100vw',
            'height: 100vh',
            'height: 100dvh',
            'border: none',
            'z-index: 2147483647',
            'background: transparent',
            'pointer-events: auto'
        ].join(' !important; ');
        
        document.documentElement.appendChild(iframe);
        
        iframe.addEventListener('load', ( ) => {
            iframe.setAttribute(`${pickerUniqueId}-loaded`, '');
            const channel = new MessageChannel();
            pickerFramePort = channel.port1;
            pickerFramePort.onmessage = ev => {
                onDialogMessage(ev.data as DialogMessage);
            };
            pickerFramePort.onmessageerror = ( ) => {
                quitPicker();
            };
            iframe.contentWindow.postMessage(
                { what: 'epickerStart' },
                url.href,
                [ channel.port2 ]
            );
            resolve(iframe);
        }, { once: true });
        
        iframe.addEventListener('error', (e) => {
        });
        
        iframe.contentWindow.location = url.href;
    });
};

pickerFrame = await bootstrap();
if ( Boolean(pickerFrame) === false ) {
    quitPicker();
}

/******************************************************************************/

})();

/*******************************************************************************

    DO NOT:
    - Remove the following code
    - Add code beyond the following code
    Reason:
    - https://github.com/gorhill/uBlock/pull/3721
    - uBO never uses the return value from injected content scripts

**/

void 0;
