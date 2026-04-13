import { MRUCache } from './mrucache.js';
import { StaticExtFilteringHostnameDB } from './static-ext-filtering-db.js';
import { entityFromHostname } from './uri-utils.js';
import logger from './logger.js';
import µb from './background.js';

interface SelectorCacheEntryDetails {
    selectors: string[];
    hashes: number[];
    type: string;
    hostname?: string;
}

interface SelectorCacheEntry {
    cosmetic: Set<string>;
    cosmeticHashes: Set<number>;
    disableSurveyor: boolean;
    net: Map<string, number>;
    accessId: number;
    reset(): SelectorCacheEntry;
    dispose(): void;
    addCosmetic(details: SelectorCacheEntryDetails): void;
    addNet(selectors: string | string[]): void;
    addNetOne(selector: string, token: number): void;
    add(details: SelectorCacheEntryDetails): void;
    remove(type?: string): void;
    retrieveToArray(iterator: IterableIterator<string>, out: string[]): void;
    retrieveToSet(iterator: Iterable<string>, out: Set<string>): boolean;
    retrieveNet(out: string[]): boolean;
    retrieveCosmetic(selectors: Set<string>, hashes: number[]): boolean;
    static factory(): SelectorCacheEntry;
}

const SelectorCacheEntry = class implements SelectorCacheEntry {
    static accessId = 1;
    static netLowWaterMark = 20;
    static netHighWaterMark = 30;
    static junkyard: SelectorCacheEntry[] = [];

    cosmetic: Set<string>;
    cosmeticHashes: Set<number>;
    disableSurveyor: boolean;
    net: Map<string, number>;
    accessId: number;

    constructor() {
        this.reset();
    }

    reset(): SelectorCacheEntry {
        this.cosmetic = new Set();
        this.cosmeticHashes = new Set();
        this.disableSurveyor = false;
        this.net = new Map();
        this.accessId = SelectorCacheEntry.accessId++;
        return this;
    }

    dispose(): void {
        this.cosmetic = this.cosmeticHashes = this.net = null as unknown as Set<string>;
        if ( SelectorCacheEntry.junkyard.length < 25 ) {
            SelectorCacheEntry.junkyard.push(this);
        }
    }

    addCosmetic(details: SelectorCacheEntryDetails): void {
        const selectors = details.selectors.join(',\n');
        if ( selectors.length !== 0 ) {
            this.cosmetic.add(selectors);
        }
        for ( const hash of details.hashes ) {
            this.cosmeticHashes.add(hash);
        }
    }

    addNet(selectors: string | string[]): void {
        if ( typeof selectors === 'string' ) {
            this.net.set(selectors, this.accessId);
        } else {
            this.net.set(selectors.join(',\n'), this.accessId);
        }
        if ( this.net.size < SelectorCacheEntry.netHighWaterMark ) { return; }
        const keys = Array.from(this.net)
            .sort((a, b) => b[1] - a[1])
            .slice(SelectorCacheEntry.netLowWaterMark)
            .map(a => a[0]);
        for ( const key of keys ) {
            this.net.delete(key);
        }
    }

    addNetOne(selector: string, token: number): void {
        this.net.set(selector, token);
    }

    add(details: SelectorCacheEntryDetails): void {
        this.accessId = SelectorCacheEntry.accessId++;
        if ( details.type === 'cosmetic' ) {
            this.addCosmetic(details);
        } else {
            this.addNet(details.selectors);
        }
    }

    remove(type?: string): void {
        this.accessId = SelectorCacheEntry.accessId++;
        if ( type === undefined || type === 'cosmetic' ) {
            this.cosmetic.clear();
        }
        if ( type === undefined || type === 'net' ) {
            this.net.clear();
        }
    }

    retrieveToArray(iterator: IterableIterator<string>, out: string[]): void {
        for ( const selector of iterator ) {
            out.push(selector);
        }
    }

    retrieveToSet(iterator: Iterable<string>, out: Set<string>): void {
        for ( const selector of iterator ) {
            out.add(selector);
        }
    }

    retrieveNet(out: string[]): boolean {
        this.accessId = SelectorCacheEntry.accessId++;
        if ( this.net.size === 0 ) { return false; }
        this.retrieveToArray(this.net.keys(), out);
        return true;
    }

    retrieveCosmetic(selectors: Set<string>, hashes: number[]): boolean {
        this.accessId = SelectorCacheEntry.accessId++;
        if ( this.cosmetic.size === 0 ) { return false; }
        this.retrieveToSet(this.cosmetic, selectors);
        this.retrieveToArray(this.cosmeticHashes, hashes);
        return true;
    }

    static factory(): SelectorCacheEntry {
        const entry = SelectorCacheEntry.junkyard.pop();
        return entry
            ? entry.reset()
            : new SelectorCacheEntry();
    }
};

interface HighGenericEntry {
    canonical: string;
    dict: Set<string>;
    str: string;
    mru: MRUCache;
}

interface HighlyGeneric {
    simple: HighGenericEntry;
    complex: HighGenericEntry;
}

interface SelfieData {
    version: number;
    acceptedCount: number;
    discardedCount: number;
    specificFilters: unknown;
    lowlyGeneric: Map<number, string>;
    highSimpleGenericHideDict: Set<string>;
    highSimpleGenericHideStr: string;
    highComplexGenericHideDict: Set<string>;
    highComplexGenericHideStr: string;
}

interface RetrieveGenericRequest {
    hashes: number[];
    safeOnly?: boolean;
    exceptions?: string[];
    hostname?: string;
    tabId?: number;
    frameId?: number;
    domain?: string;
    url?: string;
}

interface RetrieveSpecificRequest {
    hostname: string;
    tabId?: number;
    frameId?: number;
    domain: string;
    url: string;
}

interface RetrieveSpecificOptions {
    noSpecificCosmeticFiltering?: boolean;
    noGenericCosmeticFiltering?: boolean;
    dontInject?: boolean;
}

interface RetrieveResult {
    ready: boolean;
    hostname: string;
    domain: string;
    exceptionFilters: string[];
    exceptedFilters: string[];
    proceduralFilters: string[];
    convertedProceduralFilters: string[];
    disableSurveyor: boolean;
    injectedCSS?: string;
    genericCosmeticHashes?: number[];
}

const hashFromStr = (type: number, s: string): number => {
    const len = s.length;
    const step = len + 7 >>> 3;
    let hash = (type << 5) + type ^ len;
    for ( let i = 0; i < len; i += step ) {
        hash = (hash << 5) + hash ^ s.charCodeAt(i);
    }
    return hash & 0xFFFFFF;
};

const keyFromSelector = (selector: string): string | undefined => {
    let matches = reSimplestSelector.exec(selector);
    if ( matches !== null ) { return matches[0]; }
    let key = '';
    matches = rePlainSelector.exec(selector);
    if ( matches !== null ) {
        key = matches[0];
    } else {
        matches = rePlainSelectorEx.exec(selector);
        if ( matches === null ) { return; }
        key = matches[1] || matches[2];
    }
    if ( selector.includes(',') ) { return; }
    if ( key.includes('\\') === false ) { return key; }
    matches = rePlainSelectorEscaped.exec(selector);
    if ( matches === null ) { return; }
    key = '';
    const escaped = matches[0];
    let beg = 0;
    reEscapeSequence.lastIndex = 0;
    for (;;) {
        matches = reEscapeSequence.exec(escaped);
        if ( matches === null ) {
            return key + escaped.slice(beg);
        }
        key += escaped.slice(beg, matches.index);
        beg = reEscapeSequence.lastIndex;
        if ( matches[1].length === 1 ) {
            key += matches[1];
        } else {
            key += String.fromCharCode(parseInt(matches[1], 16));
        }
    }
};

const reSimplestSelector = /^[#.][\w-]+$/;
const rePlainSelector = /^[#.][\w\\-]+/;
const rePlainSelectorEx = /^[^#.[(]+([#.][\w-]+)|([#.][\w-]+)$/;
const rePlainSelectorEscaped = /^[#.](?:\\[0-9A-Fa-f]+ |\\.|\w|-)+/;
const reEscapeSequence = /\\([0-9A-Fa-f]+ |.)/g;

interface Parser {
    hasOptions(): boolean;
    isException(): boolean;
    result: {
        raw: string;
        compiled?: string;
        exception?: boolean;
    };
    getExtFilterDomainIterator(): IterableIterator<{ hn: string; not: boolean; bad: boolean }>;
}

interface Writer {
    select(section: string): void;
    push(args: unknown[]): void;
    properties: Map<string, string>;
}

interface Reader {
    select(section: string): void;
    next(): boolean;
    fingerprint(): string;
    args(): unknown[];
}

interface FromCompiledOptions {
    skipCosmetic: boolean;
    skipGenericCosmetic: boolean;
}

const CosmeticFilteringEngine = function(this: CosmeticFilteringEngine) {
    this.reSimpleHighGeneric = /^(?:[a-z]*\[[^\]]+\]|\S+)$/;

    this.selectorCache = new Map<string, SelectorCacheEntry>();
    this.selectorCachePruneDelay = 10;
    this.selectorCacheCountMin = 40;
    this.selectorCacheCountMax = 50;
    this.selectorCacheTimer = vAPI.defer.create(() => {
        this.pruneSelectorCacheAsync();
    });

    this.specificFilters = new StaticExtFilteringHostnameDB();

    this.lowlyGeneric = new Map<number, string>();

    this.highlyGeneric = Object.create(null) as HighlyGeneric;
    this.highlyGeneric.simple = {
        canonical: 'highGenericHideSimple',
        dict: new Set(),
        str: '',
        mru: new MRUCache(16)
    };
    this.highlyGeneric.complex = {
        canonical: 'highGenericHideComplex',
        dict: new Set(),
        str: '',
        mru: new MRUCache(16)
    };
    this.reset();
} as unknown as new () => CosmeticFilteringEngine;

interface CosmeticFilteringEngine {
    reSimpleHighGeneric: RegExp;
    selectorCache: Map<string, SelectorCacheEntry>;
    selectorCachePruneDelay: number;
    selectorCacheCountMin: number;
    selectorCacheCountMax: number;
    selectorCacheTimer: unknown;
    specificFilters: StaticExtFilteringHostnameDB;
    lowlyGeneric: Map<number, string>;
    highlyGeneric: HighlyGeneric;
    frozen: boolean;
    acceptedCount: number;
    discardedCount: number;
    duplicateBuster: Set<string>;
    selfieVersion: number;
    reset(): void;
    freeze(): void;
    compile(parser: Parser, writer: Writer): boolean;
    compileGenericSelector(parser: Parser, writer: Writer): void;
    compileGenericHideSelector(parser: Parser, writer: Writer): void;
    compileGenericUnhideSelector(parser: Parser, writer: Writer): void;
    compileSpecificSelector(parser: Parser, hostname: string, not: boolean, writer: Writer): void;
    fromCompiledContent(reader: Reader, options: FromCompiledOptions): void;
    skipCompiledContent(reader: Reader, sectionId: string): void;
    toSelfie(): SelfieData;
    fromSelfie(selfie: SelfieData): void;
    addToSelectorCache(details: { hostname: string; selectors: string[]; type: string }): void;
    removeFromSelectorCache(targetHostname?: string, type?: string): void;
    pruneSelectorCacheAsync(): void;
    disableSurveyor(details: { hostname: string }): void;
    cssRuleFromProcedural(pfilter: { cssable?: boolean; tasks?: unknown[]; action?: unknown[]; selector?: string }): string | undefined;
    retrieveGenericSelectors(request: RetrieveGenericRequest): { injectedCSS: string; excepted: string[] } | undefined;
    retrieveSpecificSelectors(request: RetrieveSpecificRequest, options: RetrieveSpecificOptions): RetrieveResult;
    getFilterCount(): number;
    dump(): string;
}

CosmeticFilteringEngine.prototype.reset = function() {
    this.frozen = false;
    this.acceptedCount = 0;
    this.discardedCount = 0;
    this.duplicateBuster = new Set();

    this.selectorCache.clear();
    this.selectorCacheTimer.off();

    this.specificFilters.clear();

    this.lowlyGeneric.clear();

    this.highlyGeneric.simple.dict.clear();
    this.highlyGeneric.simple.str = '';
    this.highlyGeneric.simple.mru.reset();
    this.highlyGeneric.complex.dict.clear();
    this.highlyGeneric.complex.str = '';
    this.highlyGeneric.complex.mru.reset();

    this.selfieVersion = 2;
};

CosmeticFilteringEngine.prototype.freeze = function() {
    this.duplicateBuster.clear();
    this.specificFilters.collectGarbage();

    this.highlyGeneric.simple.str = Array.from(this.highlyGeneric.simple.dict).join(',\n');
    this.highlyGeneric.simple.mru.reset();
    this.highlyGeneric.complex.str = Array.from(this.highlyGeneric.complex.dict).join(',\n');
    this.highlyGeneric.complex.mru.reset();

    this.frozen = true;
};

CosmeticFilteringEngine.prototype.compile = function(parser: Parser, writer: Writer): boolean {
    if ( parser.hasOptions() === false ) {
        this.compileGenericSelector(parser, writer);
        return true;
    }

    let applyGlobally = true;
    for ( const { hn, not, bad } of parser.getExtFilterDomainIterator() ) {
        if ( bad ) { continue; }
        if ( not === false ) {
            applyGlobally = false;
        }
        this.compileSpecificSelector(parser, hn, not, writer);
    }
    if ( applyGlobally ) {
        this.compileGenericSelector(parser, writer);
    }

    return true;
};

CosmeticFilteringEngine.prototype.compileGenericSelector = function(parser: Parser, writer: Writer): void {
    if ( parser.isException() ) {
        this.compileGenericUnhideSelector(parser, writer);
    } else {
        this.compileGenericHideSelector(parser, writer);
    }
};

CosmeticFilteringEngine.prototype.compileGenericHideSelector = function(
    parser: Parser,
    writer: Writer
): void {
    const { raw, compiled } = parser.result;
    if ( compiled === undefined ) {
        const who = writer.properties.get('name') || '?';
        logger.writeOne({
            realm: 'message',
            type: 'error',
            text: `Invalid generic cosmetic filter in ${who}: ${raw}`
        });
        return;
    }

    writer.select('COSMETIC_FILTERS:GENERIC');

    if ( compiled.charCodeAt(0) === 0x7B /* '{' */ ) {
        if ( µb.hiddenSettings.allowGenericProceduralFilters === true ) {
            return this.compileSpecificSelector(parser, '', false, writer);
        }
        const who = writer.properties.get('name') || '?';
        logger.writeOne({
            realm: 'message',
            type: 'error',
            text: `Invalid generic cosmetic filter in ${who}: ##${raw}`
        });
        return;
    }

    const key = keyFromSelector(compiled);
    if ( key !== undefined ) {
        writer.push([
            0,
            hashFromStr(key.charCodeAt(0), key.slice(1)),
            compiled,
        ]);
        return;
    }

    if ( this.reSimpleHighGeneric.test(compiled) ) {
        writer.push([ 4 /* simple */, compiled ]);
    } else {
        writer.push([ 5 /* complex */, compiled ]);
    }
};

CosmeticFilteringEngine.prototype.compileGenericUnhideSelector = function(
    parser: Parser,
    writer: Writer
): void {
    const { raw, compiled } = parser.result;
    if ( compiled === undefined ) {
        const who = writer.properties.get('name') || '?';
        logger.writeOne({
            realm: 'message',
            type: 'error',
            text: `Invalid cosmetic filter in ${who}: #@#${raw}`
        });
        return;
    }

    writer.select('COSMETIC_FILTERS:SPECIFIC');

    writer.push([ 8, '', `-${compiled}` ]);
};

CosmeticFilteringEngine.prototype.compileSpecificSelector = function(
    parser: Parser,
    hostname: string,
    not: boolean,
    writer: Writer
): void {
    const { raw, compiled, exception } = parser.result;
    if ( compiled === undefined ) {
        const who = writer.properties.get('name') || '?';
        logger.writeOne({
            realm: 'message',
            type: 'error',
            text: `Invalid cosmetic filter in ${who}: ##${raw}`
        });
        return;
    }

    writer.select('COSMETIC_FILTERS:SPECIFIC');
    const prefix = ((exception ? 1 : 0) ^ (not ? 1 : 0)) ? '-' : '+';
    writer.push([ 8, hostname, `${prefix}${compiled}` ]);
};

CosmeticFilteringEngine.prototype.fromCompiledContent = function(reader: Reader, options: FromCompiledOptions): void {
    console.log('[MV3-CFE] fromCompiledContent called - skipCosmetic:', options.skipCosmetic, 'skipGenericCosmetic:', options.skipGenericCosmetic);
    if ( options.skipCosmetic ) {
        this.skipCompiledContent(reader, 'SPECIFIC');
        this.skipCompiledContent(reader, 'GENERIC');
        return;
    }

    reader.select('COSMETIC_FILTERS:SPECIFIC');
    let specificCount = 0;
    while ( reader.next() ) {
        this.acceptedCount += 1;
        const fingerprint = reader.fingerprint();
        if ( this.duplicateBuster.has(fingerprint) ) {
            this.discardedCount += 1;
            continue;
        }
        this.duplicateBuster.add(fingerprint);
        const args = reader.args();
        switch ( args[0] ) {
        case 8: {
            if ( args[1] === '*' && args[2].charCodeAt(0) === 0x2D /* + */ ) {
                const selector = args[2].slice(1);
                if ( selector.charCodeAt(0) !== 0x7B /* { */ ) {
                    if ( this.reSimpleHighGeneric.test(selector) ) {
                        this.highlyGeneric.simple.dict.add(selector);
                    } else {
                        this.highlyGeneric.complex.dict.add(selector);
                    }
                    break;
                }
            }
            specificCount++;
            if (specificCount <= 10 || args[1].includes('reddit')) {
                console.log('[MV3-CFE] Storing specific filter - hostname:', args[1], 'selector:', args[2]);
            }
            this.specificFilters.store(args[1] as string, args[2] as string);
            break;
        }
        default:
            this.discardedCount += 1;
            break;
        }
    }
    console.log('[MV3-CFE] Total specific filters stored:', specificCount);

    if ( options.skipGenericCosmetic ) {
        this.skipCompiledContent(reader, 'GENERIC');
        return;
    }

    reader.select('COSMETIC_FILTERS:GENERIC');
    while ( reader.next() ) {
        this.acceptedCount += 1;
        const fingerprint = reader.fingerprint();
        if ( this.duplicateBuster.has(fingerprint) ) {
            this.discardedCount += 1;
            continue;
        }
        this.duplicateBuster.add(fingerprint);
        const args = reader.args();
        switch ( args[0] ) {
        case 0: {
            if ( this.lowlyGeneric.has(args[1] as number) ) {
                const selector = this.lowlyGeneric.get(args[1] as number);
                this.lowlyGeneric.set(args[1] as number, `${selector},\n${args[2]}`);
            } else {
                this.lowlyGeneric.set(args[1] as number, args[2] as string);
            }
            break;
        }
        case 4:
            this.highlyGeneric.simple.dict.add(args[1] as string);
            break;
        case 5:
            this.highlyGeneric.complex.dict.add(args[1] as string);
            break;
        default:
            this.discardedCount += 1;
            break;
        }
    }
};

CosmeticFilteringEngine.prototype.skipCompiledContent = function(reader: Reader, sectionId: string): void {
    reader.select(`COSMETIC_FILTERS:${sectionId}`);
    while ( reader.next() ) {
        this.acceptedCount += 1;
        this.discardedCount += 1;
    }
};

CosmeticFilteringEngine.prototype.toSelfie = function(): SelfieData {
    return {
        version: this.selfieVersion,
        acceptedCount: this.acceptedCount,
        discardedCount: this.discardedCount,
        specificFilters: this.specificFilters.toSelfie(),
        lowlyGeneric: this.lowlyGeneric,
        highSimpleGenericHideDict: this.highlyGeneric.simple.dict,
        highSimpleGenericHideStr: this.highlyGeneric.simple.str,
        highComplexGenericHideDict: this.highlyGeneric.complex.dict,
        highComplexGenericHideStr: this.highlyGeneric.complex.str,
    };
};

CosmeticFilteringEngine.prototype.fromSelfie = function(selfie: SelfieData): void {
    if ( selfie.version !== this.selfieVersion ) {
        throw new TypeError('Bad selfie');
    }
    this.acceptedCount = selfie.acceptedCount;
    this.discardedCount = selfie.discardedCount;
    this.specificFilters.fromSelfie(selfie.specificFilters);
    this.lowlyGeneric = selfie.lowlyGeneric;
    this.highlyGeneric.simple.dict = selfie.highSimpleGenericHideDict;
    this.highlyGeneric.simple.str = selfie.highSimpleGenericHideStr;
    this.highlyGeneric.complex.dict = selfie.highComplexGenericHideDict;
    this.highlyGeneric.complex.str = selfie.highComplexGenericHideStr;
    this.frozen = true;
};

CosmeticFilteringEngine.prototype.addToSelectorCache = function(details: { hostname: string; selectors: string[] }): void {
    const hostname = details.hostname;
    if ( typeof hostname !== 'string' || hostname === '' ) { return; }
    const selectors = details.selectors;
    if ( Array.isArray(selectors) === false ) { return; }
    let entry = this.selectorCache.get(hostname);
    if ( entry === undefined ) {
        entry = SelectorCacheEntry.factory();
        this.selectorCache.set(hostname, entry);
        if ( this.selectorCache.size > this.selectorCacheCountMax ) {
            this.selectorCacheTimer.on({ min: this.selectorCachePruneDelay });
        }
    }
    entry.add({ selectors, hashes: [], type: 'cosmetic', hostname });
};

CosmeticFilteringEngine.prototype.removeFromSelectorCache = function(
    targetHostname = '*',
    type?: string
): void {
    const targetHostnameLength = targetHostname.length;
    for ( const [ hostname, item ] of this.selectorCache ) {
        if ( targetHostname !== '*' ) {
            if ( hostname.endsWith(targetHostname) === false ) { continue; }
            if ( hostname.length !== targetHostnameLength ) {
                if ( hostname.at(-1) !== '.' ) { continue; }
            }
        }
        item.remove(type);
    }
};

CosmeticFilteringEngine.prototype.pruneSelectorCacheAsync = function(): void {
    if ( this.selectorCache.size <= this.selectorCacheCountMax ) { return; }
    const cache = this.selectorCache;
    const hostnames = Array.from(cache.keys())
        .sort((a, b) => cache.get(b).accessId - cache.get(a).accessId)
        .slice(this.selectorCacheCountMin);
    for ( const hn of hostnames ) {
        cache.get(hn).dispose();
        cache.delete(hn);
    }
};

CosmeticFilteringEngine.prototype.disableSurveyor = function(details: { hostname: string }): void {
    const hostname = details.hostname;
    if ( typeof hostname !== 'string' || hostname === '' ) { return; }
    const cacheEntry = this.selectorCache.get(hostname);
    if ( cacheEntry === undefined ) { return; }
    cacheEntry.disableSurveyor = true;
};

CosmeticFilteringEngine.prototype.cssRuleFromProcedural = function(pfilter: { cssable?: boolean; tasks?: unknown[]; action?: unknown[]; selector?: string }): string | undefined {
    if ( pfilter.cssable !== true ) { return; }
    const { tasks, action } = pfilter;
    let mq: string | undefined, selector: string | undefined;
    if ( Array.isArray(tasks) ) {
        if ( tasks[0][0] !== 'matches-media' ) { return; }
        mq = tasks[0][1] as string;
        if ( tasks.length > 2 ) { return; }
        if ( tasks.length === 2 ) {
            if ( tasks[1][0] !== 'spath' ) { return; }
            selector = tasks[1][1] as string;
        }
    }
    let style: string | undefined;
    if ( Array.isArray(action) ) {
        if ( action[0] !== 'style' ) { return; }
        selector = selector || pfilter.selector;
        style = action[1] as string;
    }
    if ( mq === undefined && style === undefined && selector === undefined ) { return; }
    if ( mq === undefined ) {
        return `${selector}\n{${style}}`;
    }
    if ( style === undefined ) {
        return `@media ${mq} {\n${selector}\n{display:none!important;}\n}`;
    }
    return `@media ${mq} {\n${selector}\n{${style}}\n}`;
};

CosmeticFilteringEngine.prototype.retrieveGenericSelectors = function(request: RetrieveGenericRequest): { injectedCSS: string; excepted: string[] } | undefined {
    if ( this.lowlyGeneric.size === 0 ) { return; }
    if ( Array.isArray(request.hashes) === false ) { return; }
    if ( request.hashes.length === 0 ) { return; }

    const selectorsSet = new Set<string>();
    const hashes: number[] = [];
    const safeOnly = request.safeOnly === true;
    for ( const hash of request.hashes ) {
        const bucket = this.lowlyGeneric.get(hash);
        if ( bucket === undefined ) { continue; }
        for ( const selector of bucket.split(',\n') ) {
            if ( safeOnly && selector === keyFromSelector(selector) ) { continue; }
            selectorsSet.add(selector);
        }
        hashes.push(hash);
    }

    const excepted: string[] = [];
    if ( selectorsSet.size !== 0 && Array.isArray(request.exceptions) ) {
        for ( const exception of request.exceptions ) {
            if ( selectorsSet.delete(exception) ) {
                excepted.push(exception);
            }
        }
    }

    if ( selectorsSet.size === 0 && excepted.length === 0 ) { return; }

    const out = { injectedCSS: '', excepted, };
    const selectors = Array.from(selectorsSet);

    if ( typeof request.hostname === 'string' && request.hostname !== '' ) {
        this.addToSelectorCache({
            hostname: request.hostname,
            selectors,
            type: 'cosmetic',
        });
    }

    if ( selectors.length === 0 ) { return out; }

    out.injectedCSS = `${selectors.join(',\n')}\n{display:none!important;}`;
    vAPI.tabs.insertCSS(request.tabId as number, {
        code: out.injectedCSS,
        frameId: request.frameId as number,
        matchAboutBlank: true,
        runAt: 'document_start',
    });

    return out;
};

CosmeticFilteringEngine.prototype.retrieveSpecificSelectors = function(
    request: RetrieveSpecificRequest,
    options: RetrieveSpecificOptions
): RetrieveResult {
    const hostname = request.hostname;
    console.log('[MV3-CFE] retrieveSpecificSelectors called for hostname:', hostname, 'url:', request.url);
    console.log('[MV3-CFE] specificFilters.size:', this.specificFilters.size);
    if (hostname.includes('reddit')) {
        console.log('[MV3-CFE] Reddit hostname detected, checking specificFilters...');
        const testSet = new Set<string>();
        this.specificFilters.retrieveSpecifics(testSet, hostname);
        console.log('[MV3-CFE] Filters for', hostname, ':', Array.from(testSet).slice(0, 10));
    }
    const cacheEntry = this.selectorCache.get(hostname);

    const out: RetrieveResult = {
        ready: this.frozen,
        hostname: hostname,
        domain: request.domain,
        exceptionFilters: [],
        exceptedFilters: [],
        proceduralFilters: [],
        convertedProceduralFilters: [],
        disableSurveyor: this.lowlyGeneric.size === 0,
    };
    const injectedCSS: string[] = [];
    const exceptionSet = new Set<string>();

    if ( options.noSpecificCosmeticFiltering !== true ) {
        const specificSet = new Set<string>();
        if ( cacheEntry !== undefined ) {
            cacheEntry.retrieveCosmetic(specificSet, out.genericCosmeticHashes = []);
            if ( cacheEntry.disableSurveyor ) {
                out.disableSurveyor = true;
            }
        }

        const allSet = new Set<string>();
        console.log('[MV3-CFE] Retrieving specifics for hostname:', hostname);
        this.specificFilters.retrieveSpecifics(allSet, hostname);
        const entity = entityFromHostname(hostname, request.domain);
        console.log('[MV3-CFE] Retrieving specifics for entity:', entity);
        this.specificFilters.retrieveSpecifics(allSet, entity);
        console.log('[MV3-CFE] Retrieving regex specifics for:', hostname);
        this.specificFilters.retrieveSpecificsByRegex(allSet, hostname, request.url);
        console.log('[MV3-CFE] Retrieving generics');
        this.specificFilters.retrieveGenerics(allSet);
        
        console.log('[MV3-CFE] allSet size:', allSet.size, 'filters:', Array.from(allSet).slice(0, 20));

        const proceduralSet = new Set<string>();
        for ( const s of allSet ) {
            const selector = s.slice(1);
            if ( s.charCodeAt(0) === 0x2D /* - */ ) {
                exceptionSet.add(selector);
            } else if ( selector.charCodeAt(0) === 0x7B /* { */ ) {
                proceduralSet.add(selector);
            } else {
                specificSet.add(selector);
            }
        }

        if ( exceptionSet.size !== 0 ) {
            out.exceptionFilters = Array.from(exceptionSet);
            for ( const selector of specificSet ) {
                if ( exceptionSet.has(selector) === false ) { continue; }
                specificSet.delete(selector);
                out.exceptedFilters.push(selector);
            }
        }

        console.log('[MV3-CFE] specificSet size:', specificSet.size, 'proceduralSet size:', proceduralSet.size);
        if ( specificSet.size !== 0 ) {
            console.log('[MV3-CFE] CSS to inject:', Array.from(specificSet).slice(0, 10));
            injectedCSS.push(
                `${Array.from(specificSet).join(',\n')}\n{display:none!important;}`
            );
        }

        if ( proceduralSet.size !== 0 ) {
            for ( const json of proceduralSet ) {
                if ( exceptionSet.has(json) ) {
                    proceduralSet.delete(json);
                    out.exceptedFilters.push(json);
                    continue;
                }
                const pfilter = JSON.parse(json);
                if ( exceptionSet.has(pfilter.raw) ) {
                    proceduralSet.delete(json);
                    out.exceptedFilters.push(pfilter.raw);
                    continue;
                }
                const cssRule = this.cssRuleFromProcedural(pfilter);
                if ( cssRule === undefined ) { continue; }
                injectedCSS.push(cssRule);
                proceduralSet.delete(json);
                out.convertedProceduralFilters.push(json);
            }
            out.proceduralFilters.push(...proceduralSet);
        }
    }

    if ( options.noGenericCosmeticFiltering !== true ) {
        const exceptionSetHash = out.exceptionFilters.join();
        for ( const key in this.highlyGeneric ) {
            const entry = this.highlyGeneric[key as keyof HighlyGeneric];
            let str = entry.mru.lookup(exceptionSetHash) as { s: string; excepted: string[] } | undefined;
            if ( str === undefined ) {
                str = { s: entry.str, excepted: [] };
                let genericSet = entry.dict;
                let hit = false;
                for ( const exception of exceptionSet ) {
                    if ( (hit = genericSet.has(exception)) ) { break; }
                }
                if ( hit ) {
                    genericSet = new Set(entry.dict);
                    for ( const exception of exceptionSet ) {
                        if ( genericSet.delete(exception) ) {
                            str.excepted.push(exception);
                        }
                    }
                    str.s = Array.from(genericSet).join(',\n');
                }
                entry.mru.add(exceptionSetHash, str);
            }
            if ( str.excepted.length !== 0 ) {
                out.exceptedFilters.push(...str.excepted);
            }
            if ( str.s.length !== 0 ) {
                injectedCSS.push(`${str.s}\n{display:none!important;}`);
            }
        }
    }

    const details = {
        code: '',
        frameId: request.frameId,
        matchAboutBlank: true,
        runAt: 'document_start',
    };

    if ( injectedCSS.length !== 0 ) {
        out.injectedCSS = injectedCSS.join('\n\n');
        details.code = out.injectedCSS;
        if ( request.tabId !== undefined && options.dontInject !== true ) {
            vAPI.tabs.insertCSS(request.tabId, details);
        }
    }

    if ( cacheEntry ) {
        const networkFilters: string[] = [];
        if ( cacheEntry.retrieveNet(networkFilters) ) {
            details.code = `${networkFilters.join('\n')}\n{display:none!important;}`;
            if ( request.tabId !== undefined && options.dontInject !== true ) {
                vAPI.tabs.insertCSS(request.tabId, details);
            }
        }
    }

    return out;
};

CosmeticFilteringEngine.prototype.getFilterCount = function(): number {
    return this.acceptedCount - this.discardedCount;
};

CosmeticFilteringEngine.prototype.dump = function(): string {
    const lowlyGenerics: string[] = [];
    for ( const selectors of this.lowlyGeneric.values() ) {
        lowlyGenerics.push(...selectors.split(',\n'));
    }
    lowlyGenerics.sort();
    const highlyGenerics = Array.from(this.highlyGeneric.simple.dict).sort();
    highlyGenerics.push(...Array.from(this.highlyGeneric.complex.dict).sort());
    return [
        'Cosmetic Filtering Engine internals:',
        `specific: ${this.specificFilters.size}`,
        `generic: ${lowlyGenerics.length + highlyGenerics.length}`,
        `+ lowly generic: ${lowlyGenerics.length}`,
        ...lowlyGenerics.map(a => `  ${a}`),
        `+ highly generic: ${highlyGenerics.length}`,
        ...highlyGenerics.map(a => `  ${a}`),
    ].join('\n');
};

const cosmeticFilteringEngine = new CosmeticFilteringEngine();

export default cosmeticFilteringEngine;