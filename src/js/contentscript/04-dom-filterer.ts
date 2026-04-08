/*******************************************************************************

    uBlock Resurrected - Content Script Module
    DOM Filterer

    The DOM filterer is the heart of uBR's cosmetic filtering.

    DOMFilterer: adds procedural cosmetic filtering

*******************************************************************************/

interface SafeAnimationFrame {
    start(delay?: number): void;
    clear(): void;
}

interface UserStylesheet {
    added: Set<string>;
    removed: Set<string>;
    apply(callback?: () => void): void;
    add(cssText: string, now?: boolean): void;
    remove(cssText: string, now?: boolean): void;
}

interface VAPI {
    hideStyle: string;
    DOMFilterer: new () => DOMFilterer;
    DOMProceduralFilterer: new (filterer: DOMFilterer) => DOMProceduralFilterer;
    SafeAnimationFrame: new (callback: () => void) => SafeAnimationFrame;
    userStylesheet: UserStylesheet;
}

declare const vAPI: VAPI;

interface DOMProceduralFilterer {
    commitNow(): void;
    masterToken: string;
    selectors: Map<string, unknown>;
    addProceduralSelectors(selectors: object[]): void;
    createProceduralFilter(o: object): object;
}

interface DOMFiltererListener {
    onFiltersetChanged(changes: {
        declarative?: string[];
        exceptions?: string[];
        procedural?: unknown[];
    }): void;
}

interface CSSDetails {
    mustInject?: boolean;
    silent?: boolean;
}

interface FilterSelectorOptions {
    bits?: number;
}

interface FilterSelectorResult {
    declarative: string[];
    exceptions: string[];
    procedural?: unknown[];
}

class DOMFilterer {
    commitTimer: SafeAnimationFrame;
    disabled: boolean;
    listeners: DOMFiltererListener[];
    stylesheets: string[];
    exceptedCSSRules: string[];
    exceptions: string[];
    convertedProceduralFilters: object[];
    proceduralFilterer: DOMProceduralFilterer | null;

    constructor() {
        this.commitTimer = new vAPI.SafeAnimationFrame(
            () => { this.commitNow(); }
        );
        this.disabled = false;
        this.listeners = [];
        this.stylesheets = [];
        this.exceptedCSSRules = [];
        this.exceptions = [];
        this.convertedProceduralFilters = [];
        this.proceduralFilterer = null;
    }

    explodeCSS(css: string): string[] {
        const out: string[] = [];
        const cssHide = `{${vAPI.hideStyle}}`;
        const blocks = css.trim().split(/\n\n+/);
        for ( const block of blocks ) {
            if ( block.endsWith(cssHide) === false ) { continue; }
            out.push(block.slice(0, -cssHide.length).trim());
        }
        return out;
    }

    addCSS(css: string, details: CSSDetails = {}): void {
        if ( typeof css !== 'string' || css.length === 0 ) { return; }
        if ( this.stylesheets.includes(css) ) { return; }
        this.stylesheets.push(css);
        if ( details.mustInject && this.disabled === false ) {
            vAPI.userStylesheet.add(css);
        }
        if ( this.hasListeners() === false ) { return; }
        if ( details.silent ) { return; }
        this.triggerListeners({ declarative: this.explodeCSS(css) });
    }

    exceptCSSRules(exceptions: string[]): void {
        if ( exceptions.length === 0 ) { return; }
        this.exceptedCSSRules.push(...exceptions);
        if ( this.hasListeners() ) {
            this.triggerListeners({ exceptions });
        }
    }

    addListener(listener: DOMFiltererListener): void {
        if ( this.listeners.indexOf(listener) !== -1 ) { return; }
        this.listeners.push(listener);
    }

    removeListener(listener: DOMFiltererListener): void {
        const pos = this.listeners.indexOf(listener);
        if ( pos === -1 ) { return; }
        this.listeners.splice(pos, 1);
    }

    hasListeners(): boolean {
        return this.listeners.length !== 0;
    }

    triggerListeners(changes: {
        declarative?: string[];
        exceptions?: string[];
        procedural?: unknown[];
    }): void {
        for ( const listener of this.listeners ) {
            listener.onFiltersetChanged(changes);
        }
    }

    toggle(state?: boolean, callback?: () => void): void {
        if ( state === undefined ) { state = this.disabled; }
        if ( state !== this.disabled ) { return; }
        this.disabled = !state;
        const uss = vAPI.userStylesheet;
        for ( const css of this.stylesheets ) {
            if ( this.disabled ) {
                uss.remove(css);
            } else {
                uss.add(css);
            }
        }
        uss.apply(callback);
    }

    commitNow(): void {
        this.commitTimer.clear();
        if ( vAPI instanceof Object === false ) { return; }
        vAPI.userStylesheet.apply();
        if ( this.proceduralFilterer instanceof Object ) {
            this.proceduralFilterer.commitNow();
        }
    }

    commit(commitNow: boolean): void {
        if ( commitNow ) {
            this.commitTimer.clear();
            this.commitNow();
        } else {
            this.commitTimer.start();
        }
    }

    proceduralFiltererInstance(): DOMProceduralFilterer | null {
        if ( this.proceduralFilterer instanceof Object === false ) {
            if ( vAPI.DOMProceduralFilterer instanceof Object === false ) {
                return null;
            }
            this.proceduralFilterer = new vAPI.DOMProceduralFilterer(this);
        }
        return this.proceduralFilterer;
    }

    addProceduralSelectors(selectors: string[]): void {
        const procedurals: object[] = [];
        for ( const raw of selectors ) {
            procedurals.push(JSON.parse(raw));
        }
        if ( procedurals.length === 0 ) { return; }
        const pfilterer = this.proceduralFiltererInstance();
        if ( pfilterer !== null ) {
            pfilterer.addProceduralSelectors(procedurals);
        }
    }

    createProceduralFilter(o: object): object | undefined {
        const pfilterer = this.proceduralFiltererInstance();
        if ( pfilterer === null ) { return; }
        return pfilterer.createProceduralFilter(o);
    }

    getAllSelectors(bits: number = 0): FilterSelectorResult {
        const out: FilterSelectorResult = {
            declarative: [],
            exceptions: this.exceptedCSSRules,
        };
        const hasProcedural = this.proceduralFilterer instanceof Object;
        const includePrivateSelectors = (bits & 0b01) !== 0;
        const masterToken = hasProcedural
            ? `[${(this.proceduralFilterer as DOMProceduralFilterer).masterToken}]`
            : undefined;
        for ( const css of this.stylesheets ) {
            for ( const block of this.explodeCSS(css) ) {
                if (
                    includePrivateSelectors === false &&
                    masterToken !== undefined &&
                    block.startsWith(masterToken)
                ) {
                    continue;
                }
                out.declarative.push(block);
            }
        }
        const excludeProcedurals = (bits & 0b10) !== 0;
        if ( excludeProcedurals === false ) {
            out.procedural = [];
            if ( hasProcedural ) {
                out.procedural.push(
                    ...(this.proceduralFilterer as DOMProceduralFilterer).selectors.values()
                );
            }
            const proceduralFilterer = this.proceduralFiltererInstance();
            if ( proceduralFilterer !== null ) {
                for ( const json of this.convertedProceduralFilters ) {
                    const pfilter = proceduralFilterer.createProceduralFilter(json);
                    (pfilter as { converted?: boolean }).converted = true;
                    out.procedural!.push(pfilter);
                }
            }
        }
        return out;
    }

    getAllExceptionSelectors(): string {
        return this.exceptions.join(',\n');
    }
}

export function initDOMFilterer(): typeof DOMFilterer {
    vAPI.hideStyle = 'display:none!important;';

    vAPI.DOMFilterer = DOMFilterer;

    return vAPI.DOMFilterer;
}

/******************************************************************************/
