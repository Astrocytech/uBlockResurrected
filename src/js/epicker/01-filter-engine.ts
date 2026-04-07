/*******************************************************************************

    uBlock Resurrected - Element Picker Module
    Filter Engine

    Generates network and cosmetic filters from DOM elements.

*******************************************************************************/

const reCosmeticAnchor = /^#(\$|\?|\$\?)?#/;

const netFilter1stSources: Record<string, string> = {
    audio: 'currentSrc',
    video: 'currentSrc',
    source: 'src',
    img: 'currentSrc',
    iframe: 'src',
    embed: 'src',
    object: 'data',
};

const netFilter2ndSrcs: Record<string, string> = {
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

interface EpickerState {
    lastNetFilterUnion: string;
    lastNetFilterHostname: string;
    netFilterCandidates: string[];
    cosmeticFilterCandidates: string[];
    candidateElements: Element[];
    bestCandidateFilter: { type: string; filters: string[]; slot: number } | null;
    filtersFrom: (x: number, y: number, first?: Element) => number;
    netFilterFromElement: (elem: Element) => void;
    cosmeticFilterFromElement: (elem: Element) => number;
    resourceURLsFromElement: (elem: Element) => string[];
    filterTypes: string[];
    hideBackgroundStyle: string;
    reCosmeticAnchor: RegExp;
}

interface EpickerDeps {
    safeQuerySelectorAll: (node: Node | null, selector: string) => NodeListOf<Element>;
    getPageDocument: () => Document;
    debugLog: (source: string, ...args: unknown[]) => void;
    pickerFrame: HTMLElement | null;
}

let epickerState: EpickerState;
let safeQuerySelectorAll: (node: Node | null, selector: string) => NodeListOf<Element>;
let getPageDocument: () => Document;
let debugLog: (source: string, ...args: unknown[]) => void;
let pickerFrame: HTMLElement | null;

const mergeStrings = function(urls: string[]): string {
    if ( urls.length === 0 ) { return ''; }
    if (
        urls.length === 1 ||
        (self as unknown as { diff_match_patch?: unknown }).diff_match_patch instanceof Function === false
    ) {
        return urls[0];
    }
    const differ = new (self as unknown as { diff_match_patch: new () => { diff_main: (a: string, b: string) => [number, string][] } }).diff_match_patch();
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
    return merged;
};

const trimFragmentFromURL = function(url: string): string {
    const pos = url.indexOf('#');
    return pos !== -1 ? url.slice(0, pos) : url;
};

const backgroundImageURLFromElement = function(elem: Element): string {
    const style = window.getComputedStyle(elem);
    const bgImg = style.backgroundImage || '';
    const matches = /^url\((["']?)([^"']+)\1\)$/.exec(bgImg);
    const url = matches !== null && matches.length === 3 ? matches[2] : '';
    return url.lastIndexOf('data:', 0) === -1
        ? trimFragmentFromURL(url.slice(0, 1024))
        : '';
};

const resourceURLsFromSrcset = function(elem: Element, out: string[]): void {
    let srcset = (elem as HTMLSourceElement).srcset;
    if ( typeof srcset !== 'string' || srcset === '' ) { return; }
    for(;;) {
        srcset = srcset.trim();
        if ( srcset.length === 0 ) { break; }
        if ( /^,/.test(srcset) ) { break; }
        let match = /^\S+/.exec(srcset);
        if ( match === null ) { break; }
        srcset = srcset.slice(match.index! + match[0].length);
        let url = match[0];
        if ( /,$/.test(url) ) {
            url = url.replace(/,$/, '');
            if ( /,$/.test(url) ) { break; }
        } else {
            match = /^[^,]*(?:\(.+?\))?[^,]*(?:,|$)/.exec(srcset);
            if ( match === null ) { break; }
            srcset = srcset.slice(match.index! + match[0].length);
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

const resourceURLsFromElement = function(elem: Element): string[] {
    const urls: string[] = [];
    const tagName = elem.localName;
    const prop = netFilter1stSources[tagName || ''];
    if ( prop === undefined ) {
        const url = backgroundImageURLFromElement(elem);
        if ( url !== '' ) { urls.push(url); }
        return urls;
    }
    let s = (elem as HTMLElement & Record<string, unknown>)[prop];
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

const netFilterFromUnion = function(patternIn: string, out: string[]): void {
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

const netFilterFromElement = function(elem: Element): void {
    const urls = resourceURLsFromElement(elem);
    if ( urls.length === 0 ) { return; }
    for ( const url of urls ) {
        netFilterFromUnion(url, epickerState.netFilterCandidates);
    }
};

const cosmeticFilterFromElement = function(elem: Element): number {
    let selector = '';
    const tagName = elem.localName;

    if ( tagName === undefined ) { return 0; }

    if (
        tagName === 'a' ||
        tagName === 'body' ||
        tagName === 'html'
    ) {
        return 0;
    }

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

    const bgImg = backgroundImageURLFromElement(elem);
    if ( bgImg !== '' ) {
        epickerState.netFilterCandidates.push(bgImg);
    }

    const id = elem.id;
    if ( typeof id === 'string' && id.length !== 0 ) {
        selector = '#' + CSS.escape(id);
    }

    const className = elem.className;
    if (
        selector === '' &&
        typeof className === 'string' &&
        className.length !== 0
    ) {
        const classList = className.trim().split(/\s+/);
        for ( let i = 0; i < classList.length; i++ ) {
            const c = classList[i];
            if ( c.length < 2 ) { continue; }
            if ( /^ion-/.test(c) ) { continue; }
            selector += '.' + CSS.escape(c);
        }
    }

    const prop = netFilter1stSources[tagName];
    const src = prop !== undefined ? (elem as HTMLElement)[prop] || (elem as HTMLElement)[netFilter2ndSrcs[tagName]] : undefined;
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

    if (
        selector === '' &&
        typeof (elem as HTMLImageElement).srcset === 'string' &&
        (elem as HTMLImageElement).srcset.length !== 0
    ) {
        const match = /([^\s,]+)[,\s]/.exec((elem as HTMLImageElement).srcset);
        if ( match !== null ) {
            const src = new URL(match[1], document.baseURI).pathname;
            const filename = src.slice(src.lastIndexOf('/') + 1);
            const dotPos = filename.indexOf('.');
            if ( dotPos !== -1 ) {
                selector = tagName + '[srcset*="' + CSS.escape(filename.slice(0, dotPos)) + '"]';
            }
        }
    }

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

    const attributes: { k: string; v: string }[] = [];
    const attrNames = [ 'title', 'alt', 'aria-label', 'data-ublock-hover' ];
    for ( const attrName of attrNames ) {
        let v = elem.getAttribute(attrName);
        if ( v && v.length !== 0 ) {
            attributes.push({ k: attrName, v: v });
            break;
        }
    }
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

    if ( selector === '' ) {
        let v;
        while ( (v = attributes.pop()) ) {
            if ( v.v.length === 0 ) { continue; }
            const w = v.v.replace(/([^\\])"/g, '$1\\"');
            const attrVal = elem.getAttribute(v.k);
            if ( attrVal === v.v ) {
                selector += `[${v.k}="${w}"]`;
            } else if ( attrVal && attrVal.startsWith(v.v) ) {
                selector += `[${v.k}^="${w}"]`;
            } else {
                selector += `[${v.k}*="${w}"]`;
            }
        }
    }

    const parentNode = elem.parentNode;
    if (
        selector === '' ||
        safeQuerySelectorAll(parentNode, `:scope > ${selector}`).length > 1
    ) {
        selector = tagName + selector;
    }

    if ( safeQuerySelectorAll(parentNode, `:scope > ${selector}`).length > 1 ) {
        let i = 1;
        let sibling = elem.previousSibling;
        while ( sibling !== null ) {
            if (
                typeof (sibling as Element).localName === 'string' &&
                (sibling as Element).localName === tagName
            ) {
                i++;
            }
            sibling = sibling.previousSibling;
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

const filtersFrom = function(x: number | undefined, y: number | undefined, first?: Element): number {
    const pageDoc = getPageDocument();

    epickerState.bestCandidateFilter = null;
    epickerState.netFilterCandidates.length = 0;
    epickerState.cosmeticFilterCandidates.length = 0;
    epickerState.candidateElements.length = 0;

    let element = first;
    if ( element === undefined ) {
        if ( typeof x === 'number' && typeof y === 'number' ) {
            element = epickerState.elementFromPoint(x, y);
        }
    } else {
        x = undefined;
    }

    if ( typeof x === 'number' && typeof y === 'number' ) {
        const magicAttr = `${epickerState.pickerUniqueId}-clickblind`;
        if (pickerFrame) {
            pickerFrame.setAttribute(magicAttr, '');
        }
        const elems = pageDoc.elementsFromPoint(x, y);
        if (pickerFrame) {
            pickerFrame.removeAttribute(magicAttr);
        }
        for ( const elem of elems ) {
            if (elem instanceof Element) {
                netFilterFromElement(elem);
            }
        }
    } else if ( element !== null ) {
        netFilterFromElement(element);
    }

    let elem: Node | null = element;
    while ( elem !== null ) {
        if ( elem instanceof Element && cosmeticFilterFromElement(elem) !== 0 ) {
            epickerState.candidateElements.push(elem);
        }
        elem = elem.parentNode;
        if ( elem === pageDoc.body ) { break; }
    }

    return epickerState.netFilterCandidates.length + epickerState.cosmeticFilterCandidates.length;
};

export function initFilterEngine(state: EpickerState, deps: EpickerDeps): void {
    epickerState = state;
    safeQuerySelectorAll = deps.safeQuerySelectorAll;
    getPageDocument = deps.getPageDocument;
    debugLog = deps.debugLog;
    pickerFrame = deps.pickerFrame;

    state.filtersFrom = filtersFrom;
    state.netFilterFromElement = netFilterFromElement;
    state.cosmeticFilterFromElement = cosmeticFilterFromElement;
    state.resourceURLsFromElement = resourceURLsFromElement;
    state.filterTypes = filterTypes;
    state.hideBackgroundStyle = hideBackgroundStyle;
    state.reCosmeticAnchor = reCosmeticAnchor;
}

export { netFilter1stSources, netFilter2ndSrcs, filterTypes, hideBackgroundStyle, backgroundImageURLFromElement };

/******************************************************************************/
