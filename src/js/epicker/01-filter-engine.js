/*******************************************************************************

    uBlock Origin - Element Picker Module
    Filter Engine

    Generates network and cosmetic filters from DOM elements.

*******************************************************************************/

const reCosmeticAnchor = /^#(\$|\?|\$\?)?#/;

const netFilter1stSources = {
    audio: 'currentSrc',
    video: 'currentSrc',
    source: 'src',
    img: 'currentSrc',
    iframe: 'src',
    embed: 'src',
    object: 'data',
};

const netFilter2ndSrcs = {
    audio: 'src',
    video: 'src',
    img: 'src',
};

const filterTypes = [
    'other',
    'script',
    'image',
    'stylesheets',
    'font',
    'media',
    'websocket',
    'ping',
    'xmlhttprequest',
    'popup',
    'document',
    'sub_frame',
];

const hideBackgroundStyle = 'background-image:none!important;';

/**
 * Merge URL strings using diff algorithm
 * @param {string[]} urls - Array of URLs to merge
 * @returns {string} - Merged URL string
 */
const mergeStrings = function(urls) {
    if ( urls.length === 0 ) { return ''; }
    if (
        urls.length === 1 ||
        self.diff_match_patch instanceof Function === false
    ) {
        return urls[0];
    }
    const differ = new self.diff_match_patch();
    let merged = urls[0];
    for ( let i = 1; i < urls.length; i++ ) {
        const diffs = differ.diff_main(
            urls[i].split('').join('\n'),
            merged.split('').join('\n')
        );
        const result = [];
        for ( const diff of diffs ) {
            if ( diff[0] !== 0 ) {
                result.push('*');
            } else {
                result.push(diff[1].replace(/\n+/g, ''));
            }
            merged = result.join('');
        }
    }
    return merged;
};

/**
 * Trim fragment from URL
 * @param {string} url - URL to trim
 * @returns {string} - Trimmed URL
 */
const trimFragmentFromURL = function(url) {
    const pos = url.indexOf('#');
    return pos !== -1 ? url.slice(0, pos) : url;
};

/**
 * Get background image URL from element
 * @param {Element} elem - Element to check
 * @returns {string} - Background image URL
 */
const backgroundImageURLFromElement = function(elem) {
    const style = window.getComputedStyle(elem);
    const bgImg = style.backgroundImage || '';
    const matches = /^url\((["']?)([^"']+)\1\)$/.exec(bgImg);
    const url = matches !== null && matches.length === 3 ? matches[2] : '';
    return url.lastIndexOf('data:', 0) === -1
        ? trimFragmentFromURL(url.slice(0, 1024))
        : '';
};

/**
 * Get resource URLs from srcset attribute
 * @param {Element} elem - Element to check
 * @param {string[]} out - Output array for URLs
 */
const resourceURLsFromSrcset = function(elem, out) {
    let srcset = elem.srcset;
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

/**
 * Get resource URLs from picture element
 * @param {Element} elem - Picture or media element
 * @param {string[]} out - Output array for URLs
 */
const resourceURLsFromPicture = function(elem, out) {
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

/**
 * Get resource URLs from element
 * @param {Element} elem - Element to extract URLs from
 * @returns {string[]} - Array of resource URLs
 */
const resourceURLsFromElement = function(elem) {
    const urls = [];
    const tagName = elem.localName;
    const prop = netFilter1stSources[tagName];
    if ( prop === undefined ) {
        const url = backgroundImageURLFromElement(elem);
        if ( url !== '' ) { urls.push(url); }
        return urls;
    }
    let s = elem[prop];
    if ( s instanceof SVGAnimatedString ) {
        s = s.baseVal;
    }
    if ( typeof s === 'string' && /^https?:\/\//.test(s) ) {
        urls.push(trimFragmentFromURL(s.slice(0, 1024)));
    }
    resourceURLsFromSrcset(elem, urls);
    resourceURLsFromPicture(elem, urls);
    return urls;
};

/**
 * Generate network filter from URL union
 * @param {string} patternIn - URL pattern
 * @param {string[]} out - Output array for filters
 */
const netFilterFromUnion = function(patternIn, out) {
    const currentHostname = self.location.hostname;
    if (
        epickerState.lastNetFilterUnion === '' ||
        currentHostname === '' ||
        currentHostname !== epickerState.lastNetFilterHostname
    ) {
        epickerState.lastNetFilterHostname = currentHostname;
        epickerState.lastNetFilterUnion = patternIn;
        return;
    }
    const reResult = new RegExp('^https?://' + currentHostname.replace(/\./g, '\\.') + '/(.+)$').exec(patternIn);
    if ( reResult === null ) {
        epickerState.lastNetFilterUnion = patternIn;
        return;
    }
    const urlUnion = mergeStrings([epickerState.lastNetFilterUnion, patternIn]);
    const domain = '||' + currentHostname + '^';
    if ( urlUnion.startsWith(domain) === false ) {
        out.push(urlUnion);
    } else {
        out.push(urlUnion.slice(2));
    }
    epickerState.lastNetFilterUnion = patternIn;
};

/**
 * Generate network filter from element
 * @param {Element} elem - Element to generate filter from
 */
const netFilterFromElement = function(elem) {
    const urls = resourceURLsFromElement(elem);
    if ( urls.length === 0 ) { return; }
    for ( const url of urls ) {
        netFilterFromUnion(url, epickerState.netFilterCandidates);
    }
};

/**
 * Generate cosmetic filter from element
 * @param {Element} elem - Element to generate filter from
 * @returns {number} - Number of filters generated
 */
const cosmeticFilterFromElement = function(elem) {
    let selector = '';
    const tagName = elem.localName;

    // https://github.com/uBlockOrigin/uBlock-issues/issues/17
    //   Ignore non-element nodes
    if ( tagName === undefined ) { return 0; }

    // https://github.com/gorhill/uBlock/issues/1725
    if (
        tagName === 'a' ||
        tagName === 'body' ||
        tagName === 'html'
    ) {
        return 0;
    }

    // https://github.com/gorhill/uBlock/issues/3456
    if ( tagName === 'link' ) {
        const rel = elem.getAttribute('rel');
        if ( typeof rel === 'string' ) {
            const re = new RegExp('(^|\\s)' + 'stylesheet' + '(\\s|$)', 'i');
            if ( re.test(rel) === false ) { return 0; }
        }
    }

    if (
        tagName === 'style' ||
        tagName === 'script' ||
        tagName === 'link'
    ) {
        return 0;
    }

    // https://github.com/gorhill/uBlock/issues/1897
    // Ignore `data:` URI, they can't be handled by an HTTP observer.
    const bgImg = backgroundImageURLFromElement(elem);
    if ( bgImg !== '' ) {
        epickerState.netFilterCandidates.push(bgImg);
    }

    // https://github.com/gorhill/uBlock/issues/1143
    //   Try to find a unique identifier for the element
    const id = elem.id;
    if ( typeof id === 'string' && id.length !== 0 ) {
        selector = '#' + CSS.escape(id);
    }

    // https://github.com/gorhill/uBlock/issues/1143
    //   Try to find a identifier from CSS classes
    const className = elem.className;
    if (
        selector === '' &&
        typeof className === 'string' &&
        className.length !== 0
    ) {
        const classList = className.trim().split(/\s+/);
        // Collect non-single-letter CSS classes
        for ( let i = 0; i < classList.length; i++ ) {
            const c = classList[i];
            if ( c.length < 2 ) { continue; }
            if ( /^ion-/.test(c) ) { continue; }
            selector += '.' + CSS.escape(c);
        }
    }

    // https://github.com/uBlockOrigin/uBlock-issues/issues/16
    //   Use src as fallback
    const prop = netFilter1stSources[tagName];
    const src = prop !== undefined ? elem[prop] || elem[netFilter2ndSrcs[tagName]] : undefined;
    if (
        selector === '' &&
        typeof src === 'string' &&
        src.length !== 0 &&
        /^https?:\/\//.test(src)
    ) {
        const urls = new URL(src, document.baseURI);
        const pathname = urls.pathname;
        const filename = pathname.slice(pathname.lastIndexOf('/') + 1);
        const dotPos = filename.indexOf('.');
        if ( dotPos !== -1 ) {
            selector = tagName + '[src*="' + CSS.escape(filename.slice(0, dotPos)) + '"]';
        }
    }

    // For `srcset`, use img[srcset*=...] selector
    if (
        selector === '' &&
        typeof elem.srcset === 'string' &&
        elem.srcset.length !== 0
    ) {
        const match = /([^\s,]+)[,\s]/.exec(elem.srcset);
        if ( match !== null ) {
            const src = new URL(match[1], document.baseURI).pathname;
            const filename = src.slice(src.lastIndexOf('/') + 1);
            const dotPos = filename.indexOf('.');
            if ( dotPos !== -1 ) {
                selector = tagName + '[srcset*="' + CSS.escape(filename.slice(0, dotPos)) + '"]';
            }
        }
    }

    // Handle special elements
    switch ( tagName ) {
    case 'audio':
    case 'video':
        if ( selector === '' ) {
            let v = elem.getAttribute('poster');
            if ( v && v.length !== 0 ) {
                selector = tagName + '[poster="' + CSS.escape(v) + '"]';
            }
        }
        if ( selector === '' ) {
            let v = elem.getAttribute('title');
            if ( v && v.length !== 0 ) {
                selector = tagName + '[title="' + CSS.escape(v) + '"]';
            }
        }
        break;
    case 'source':
        if ( selector === '' ) {
            let v = elem.getAttribute('src');
            if ( v && v.length !== 0 ) {
                selector = tagName + '[src="' + CSS.escape(v) + '"]';
            }
        }
        if ( selector === '' ) {
            let v = elem.getAttribute('type');
            if ( v && v.length !== 0 ) {
                selector = tagName + '[type="' + CSS.escape(v) + '"]';
            }
        }
        if ( selector === '' ) {
            let v = elem.getAttribute('media');
            if ( v && v.length !== 0 ) {
                selector = tagName + '[media="' + CSS.escape(v) + '"]';
            }
        }
        break;
    case 'a':
    case 'area':
        if ( selector === '' ) {
            let v = elem.getAttribute('href');
            if ( v && v.length !== 0 ) {
                selector = tagName + '[href="' + CSS.escape(v) + '"]';
            }
        }
        if ( selector === '' ) {
            let v = elem.getAttribute('alt');
            if ( v && v.length !== 0 ) {
                selector = tagName + '[alt="' + CSS.escape(v) + '"]';
            }
        }
        break;
    default:
        break;
    }

    // Try to extract from attributes
    const attributes = [];
    const attrNames = [ 'title', 'alt', 'aria-label', 'data-ublock-hover' ];
    for ( const attrName of attrNames ) {
        let v = elem.getAttribute(attrName);
        if ( v && v.length !== 0 ) {
            attributes.push({ k: attrName, v: v });
            break;
        }
    }
    // For inputs, try type and placeholder
    if ( tagName === 'input' || tagName === 'textarea' ) {
        let v = elem.getAttribute('type');
        if ( v && v.length !== 0 ) {
            attributes.push({ k: 'type', v: v });
        }
        v = elem.getAttribute('placeholder');
        if ( v && v.length !== 0 ) {
            attributes.push({ k: 'placeholder', v: v });
        }
    }

    // Build selector from attributes
    if ( selector === '' ) {
        let v;
        while ( (v = attributes.pop()) ) {
            if ( v.v.length === 0 ) { continue; }
            const w = v.v.replace(/([^\\])"/g, '$1\\"');
            const attrVal = elem.getAttribute(v.k);
            if ( attrVal === v.v ) {
                selector += `[${v.k}="${w}"]`;
            } else if ( attrVal.startsWith(v.v) ) {
                selector += `[${v.k}^="${w}"]`;
            } else {
                selector += `[${v.k}*="${w}"]`;
            }
        }
    }

    // Add tag name if selector is empty or ambiguous
    const parentNode = elem.parentNode;
    if (
        selector === '' ||
        safeQuerySelectorAll(parentNode, `:scope > ${selector}`).length > 1
    ) {
        selector = tagName + selector;
    }

    // Use nth-of-type for further specificity
    if ( safeQuerySelectorAll(parentNode, `:scope > ${selector}`).length > 1 ) {
        let i = 1;
        while ( elem.previousSibling !== null ) {
            elem = elem.previousSibling;
            if (
                typeof elem.localName === 'string' &&
                elem.localName === tagName
            ) {
                i++;
            }
        }
        selector += `:nth-of-type(${i})`;
    }

    if ( epickerState.bestCandidateFilter === null ) {
        epickerState.bestCandidateFilter = {
            type: 'cosmetic',
            filters: epickerState.cosmeticFilterCandidates,
            slot: epickerState.cosmeticFilterCandidates.length
        };
    }

    epickerState.cosmeticFilterCandidates.push(`##${selector}`);

    return 1;
};

/**
 * Extract filters from position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Element} [first] - Pre-selected element
 * @returns {number} - Number of filters found
 */
const filtersFrom = function(x, y, first) {
    debugLog('epicker', 'filtersFrom called with x:', x, 'y:', y);
    debugLog('epicker', 'self.location.protocol:', self.location.protocol);
    
    const pageDoc = getPageDocument();
    debugLog('epicker', 'pageDoc elementsFromPoint:', typeof pageDoc.elementsFromPoint);
    
    epickerState.bestCandidateFilter = null;
    epickerState.netFilterCandidates.length = 0;
    epickerState.cosmeticFilterCandidates.length = 0;
    epickerState.candidateElements.length = 0;

    // Get first element
    let element = first;
    if ( element === undefined ) {
        if ( typeof x === 'number' ) {
            element = elementFromPoint(x, y);
            debugLog('epicker', 'elementFromPoint result:', element);
        }
    } else {
        x = undefined;
    }

    debugLog('epicker', 'first element:', element);

    // Extract network filter candidates
    if ( typeof x === 'number' ) {
        const magicAttr = `${epickerState.pickerUniqueId}-clickblind`;
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
    } else if ( element !== null ) {
        netFilterFromElement(element);
    }

    // Extract cosmetic filter candidates from ancestors
    let elem = element;
    while ( elem !== null ) {
        if ( cosmeticFilterFromElement(elem) !== 0 ) {
            epickerState.candidateElements.push(elem);
        }
        elem = elem.parentNode;
        if ( elem === pageDoc.body ) { break; }
    }

    // Return count of total candidates
    return epickerState.netFilterCandidates.length + epickerState.cosmeticFilterCandidates.length;
};

/**
 * Initialize filter engine
 * @param {Object} state - Shared epicker state
 * @param {Object} deps - Dependencies (utilities)
 */
export function initFilterEngine(state, deps) {
    // Store references
    epickerState = state;
    safeQuerySelectorAll = deps.safeQuerySelectorAll;
    getPageDocument = deps.getPageDocument;
    debugLog = deps.debugLog;
    elementFromPoint = deps.elementFromPoint;
    pickerFrame = deps.pickerFrame;
    
    // Export functions
    state.filtersFrom = filtersFrom;
    state.netFilterFromElement = netFilterFromElement;
    state.cosmeticFilterFromElement = cosmeticFilterFromElement;
    state.resourceURLsFromElement = resourceURLsFromElement;
    state.filterTypes = filterTypes;
    state.hideBackgroundStyle = hideBackgroundStyle;
    state.reCosmeticAnchor = reCosmeticAnchor;
}

// Module-level references (will be set by initFilterEngine)
let epickerState;
let safeQuerySelectorAll;
let getPageDocument;
let debugLog;
let elementFromPoint;
let pickerFrame;

/******************************************************************************/
