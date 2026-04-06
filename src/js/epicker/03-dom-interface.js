/*******************************************************************************

    uBlock Origin - Element Picker Module
    DOM Interface

    Handles DOM queries, filtering, and preview operations.

*******************************************************************************/

/**
 * Filter to DOM interface - manages filter preview and DOM queries
 */
const filterToDOMInterface = (( ) => {
    const reHnAnchorPrefix = '^[\\w-]+://(?:[^/?#]+\\.)?';
    const reCaret = '(?:[^%.0-9a-z_-]|$)';
    const rePseudoElements = /:(?::?after|:?before|:[a-z-]+)$/;

    const matchElemToRegex = (elem, re) => {
        const srcProp = netFilter1stSources[elem.localName];
        let src = elem[srcProp];
        if ( src instanceof SVGAnimatedString ) {
            src = src.baseVal;
        }
        if ( typeof src === 'string' && /^https?:\/\//.test(src) ) {
            if ( re.test(src) ) { return srcProp; }
        }
        src = elem.currentSrc;
        if ( typeof src === 'string' && /^https?:\/\//.test(src) ) {
            if ( re.test(src) ) { return srcProp; }
        }
    };

    const fromNetworkFilter = function(filter) {
        const out = [];
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
        let reFilter = null;
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
            const srcProp = matchElemToRegex(elem, reFilter);
            if ( srcProp === undefined ) { continue; }
            out.push({
                elem,
                src: srcProp,
                opt: filterTypes[elem.localName],
                style: vAPI.hideStyle,
            });
        }

        for ( const elem of epickerState.candidateElements ) {
            if ( reFilter.test(backgroundImageURLFromElement(elem)) ) {
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

    const fromPlainCosmeticFilter = function(raw) {
        let elems;
        const pageDoc = getPageDocument();
        try {
            pageDoc.documentElement.matches(`${raw},\na`);
            elems = pageDoc.querySelectorAll(
                raw.replace(rePseudoElements, '')
            );
        } catch {
            return;
        }
        const out = [];
        for ( const elem of elems ) {
            if ( elem === pickerFrame ) { continue; }
            out.push({ elem, raw, style: vAPI.hideStyle });
        }
        return out;
    };

    const fromCompiledCosmeticFilter = function(raw) {
        if ( getNoCosmeticFiltering() ) { return; }
        if ( typeof raw !== 'string' ) { return; }
        let elems, style;
        try {
            const o = JSON.parse(raw);
            elems = vAPI.domFilterer.createProceduralFilter(o).exec();
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
        const out = [];
        for ( const elem of elems ) {
            out.push({ elem, raw, style });
        }
        return out;
    };

    vAPI.epickerStyleProxies = vAPI.epickerStyleProxies || new Map();

    let lastFilter;
    let lastResultset;
    let previewing = false;

    const unapply = function() {
        const pageDoc = getPageDocument();
        for ( const styleToken of vAPI.epickerStyleProxies.values() ) {
            for ( const elem of pageDoc.querySelectorAll(`[${styleToken}]`) ) {
                elem.removeAttribute(styleToken);
            }
        }
    };

    const apply = function() {
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

    const preview = function(state, permanent = false) {
        previewing = state !== false;
        if ( previewing === false ) {
            return unapply();
        }
        if ( Array.isArray(lastResultset) === false ) { return; }
        if ( permanent === false || reCosmeticAnchor.test(lastFilter) === false ) {
            return apply();
        }
        if ( getNoCosmeticFiltering() ) { return; }
        const cssSelectors = new Set();
        const proceduralSelectors = new Set();
        for ( const { raw } of lastResultset ) {
            if ( raw.startsWith('{') ) {
                proceduralSelectors.add(raw);
            } else {
                cssSelectors.add(raw);
            }
        }
        if ( cssSelectors.size !== 0 ) {
            vAPI.domFilterer.addCSS(
                `${Array.from(cssSelectors).join('\n')}\n{${vAPI.hideStyle}}`,
                { mustInject: true }
            );
        }
        if ( proceduralSelectors.size !== 0 ) {
            vAPI.domFilterer.addProceduralSelectors(
                Array.from(proceduralSelectors)
            );
        }
    };

    const queryAll = function(details) {
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

    return { preview, queryAll };
})();

// Module-level references
let epickerState;
let getPageDocument;
let pickerFrame;
let vAPI;

/**
 * Initialize DOM interface module
 * @param {Object} state - Shared epicker state
 * @param {Object} deps - Dependencies
 */
export function initDOMInterface(state, deps) {
    epickerState = state;
    getPageDocument = deps.getPageDocument;
    pickerFrame = deps.pickerFrame;
    vAPI = deps.vAPI;
    
    state.filterToDOMInterface = filterToDOMInterface;
}

export { filterToDOMInterface };

/******************************************************************************/
