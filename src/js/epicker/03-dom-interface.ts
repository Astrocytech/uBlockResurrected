/*******************************************************************************

    uBlock Resurrected - Element Picker Module
    DOM Interface

    Handles DOM queries, filtering, and preview operations.

*******************************************************************************/

import { netFilter1stSources, filterTypes, hideBackgroundStyle, backgroundImageURLFromElement } from './01-filter-engine.js';

interface EpickerState {
    candidateElements: Element[];
    pickerUniqueId: string;
    filterToDOMInterface: typeof filterToDOMInterface;
}

interface EpickerDeps {
    getPageDocument: () => Document;
    pickerFrame: HTMLElement | null;
    vAPI: {
        hideStyle: string;
        domFilterer: {
            createProceduralFilter(o: unknown): { exec(): Element[] };
        };
        randomToken(): string;
        userStylesheet: {
            add(css: string, now?: boolean): void;
            remove(css: string, now?: boolean): void;
            apply(callback?: () => void): void;
        };
        epickerStyleProxies?: Map<string, string>;
    };
}

let epickerState: EpickerState;
let getPageDocument: () => Document;
let pickerFrame: HTMLElement | null;
let vAPI: EpickerDeps['vAPI'];

const reCosmeticAnchor = /^#(\$|\?|\$\?)?#/;

const matchElemToRegex = (elem: Element, re: RegExp): string | undefined => {
    const srcProp = netFilter1stSources[elem.localName || ''];
    let src = (elem as HTMLElement & Record<string, unknown>)[srcProp];
    if ( src instanceof SVGAnimatedString ) {
        src = (src as SVGAnimatedString).baseVal;
    }
    if ( typeof src === 'string' && /^https?:\/\//.test(src) ) {
        if ( re.test(src) ) { return srcProp; }
    }
    src = (elem as HTMLImageElement).currentSrc;
    if ( typeof src === 'string' && /^https?:\/\//.test(src) ) {
        if ( re.test(src) ) { return srcProp; }
    }
    return undefined;
};

const fromNetworkFilter = function(filter: string): { elem: Element; src: string; opt: string; style: string }[] {
    const out: { elem: Element; src: string; opt: string; style: string }[] = [];
    if ( /^[0-9a-z]$/i.test(filter) ) { return out; }
    let reStr = '';
    if (
        filter.length > 2 &&
        filter.startsWith('/') &&
        filter.endsWith('/')
    ) {
        reStr = filter.slice(1, -1);
    } else if ( /^\w[\w.-]*[a-z]$/i.test(filter) ) {
        reStr = '^[\\w-]+://(?:[^/?#]+\\.)?' +
                filter.toLowerCase().replace(/\./g, '\\.') +
                '(?:[^%.0-9a-z_-]|$)';
    } else {
        let rePrefix = '', reSuffix = '';
        if ( filter.startsWith('||') ) {
            rePrefix = '^[\\w-]+://(?:[^/?#]+\\.)?';
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
                      .replace(/\^/g, '(?:[^%.0-9a-z_-]|$)') +
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
        const srcProp = matchElemToRegex(elem, reFilter);
        if ( srcProp === undefined ) { continue; }
        out.push({
            elem,
            src: srcProp,
            opt: filterTypes[elem.localName as keyof typeof filterTypes] || 'other',
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
            } as unknown as { elem: Element; src: string; opt: string; style: string });
        }
    }

    return out;
};

const rePseudoElements = /:(?::?after|:?before|:[a-z-]+)$/;

const fromPlainCosmeticFilter = function(raw: string): { elem: Element; raw: string; style: string }[] | undefined {
    let elems: NodeListOf<Element>;
    const pageDoc = getPageDocument();
    try {
        pageDoc.documentElement.matches(`${raw},\na`);
        elems = pageDoc.querySelectorAll(
            raw.replace(rePseudoElements, '')
        );
    } catch {
        return;
    }
    const out: { elem: Element; raw: string; style: string }[] = [];
    for ( const elem of elems ) {
        if ( elem === pickerFrame ) { continue; }
        out.push({ elem, raw, style: vAPI.hideStyle });
    }
    return out;
};

const fromCompiledCosmeticFilter = function(raw: string): { elem: Element; raw: string; style: string | undefined }[] | undefined {
    let elems: Element[] | undefined;
    let style: string | undefined;
    try {
        const o = JSON.parse(raw);
        const filter = vAPI.domFilterer.createProceduralFilter(o);
        elems = filter.exec();
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
    const out: { elem: Element; raw: string; style: string | undefined }[] = [];
    for ( const elem of elems ) {
        out.push({ elem, raw, style });
    }
    return out;
};

interface ResultSetItem {
    elem: Element;
    raw: string;
    style?: string;
    bg?: boolean;
    src?: string;
    opt?: string;
}

let epickerStyleProxies: Map<string, string> | undefined;

const filterToDOMInterface = (() => {
    let lastFilter: string;
    let lastResultset: ResultSetItem[] | undefined;
    let previewing = false;

    const unapply = function(): void {
        if ( epickerStyleProxies === undefined ) { return; }
        const pageDoc = getPageDocument();
        for ( const styleToken of epickerStyleProxies.values() ) {
            for ( const elem of pageDoc.querySelectorAll(`[${styleToken}]`) ) {
                elem.removeAttribute(styleToken);
            }
        }
    };

    const apply = function(): void {
        if ( epickerStyleProxies === undefined ) { return; }
        unapply();
        if ( Array.isArray(lastResultset) === false ) { return; }
        const pageDoc = getPageDocument();
        const rootElem = pageDoc.documentElement;
        for ( const item of lastResultset ) {
            const { elem, style } = item;
            if ( elem === pickerFrame ) { continue; }
            if ( style === undefined ) { continue; }
            if ( elem === rootElem && style === vAPI.hideStyle ) { continue; }
            let styleToken = epickerStyleProxies!.get(style);
            if ( styleToken === undefined ) {
                styleToken = vAPI.randomToken();
                epickerStyleProxies!.set(style, styleToken);
                vAPI.userStylesheet.add(`[${styleToken}]\n{${style}}`, true);
            }
            elem.setAttribute(styleToken, '');
        }
    };

    const preview = function(state: unknown, permanent = false): void {
        previewing = state !== false;
        if ( previewing === false ) {
            return unapply();
        }
        if ( Array.isArray(lastResultset) === false ) { return; }
        if ( permanent === false || reCosmeticAnchor.test(lastFilter) === false ) {
            return apply();
        }
        const cssSelectors = new Set<string>();
        const proceduralSelectors = new Set<string>();
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

    const queryAll = function(details: { filter: string; compiled?: string }): ResultSetItem[] | undefined {
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
        lastResultset = fromPlainCosmeticFilter(compiled || '');
        if ( lastResultset ) {
            if ( previewing ) { apply(); }
            return lastResultset;
        }
        lastResultset = fromCompiledCosmeticFilter(compiled || '');
        if ( previewing ) { apply(); }
        return lastResultset;
    };

    return { preview, queryAll };
})();

export function initDOMInterface(state: EpickerState, deps: EpickerDeps): void {
    epickerState = state;
    getPageDocument = deps.getPageDocument;
    pickerFrame = deps.pickerFrame;
    vAPI = deps.vAPI;
    epickerStyleProxies = vAPI.epickerStyleProxies = vAPI.epickerStyleProxies || new Map<string, string>();

    state.filterToDOMInterface = filterToDOMInterface;
}

export { filterToDOMInterface };

/******************************************************************************/
