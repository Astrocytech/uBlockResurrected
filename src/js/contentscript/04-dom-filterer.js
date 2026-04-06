/*******************************************************************************

    uBlock Origin - Content Script Module
    DOM Filterer

    The DOM filterer is the heart of uBO's cosmetic filtering.

    DOMFilterer: adds procedural cosmetic filtering

*******************************************************************************/

/**
 * Initialize DOM filterer.
 * @returns {vAPI.DOMFilterer} The DOMFilterer instance
 */
export function initDOMFilterer() {
    vAPI.hideStyle = 'display:none!important;';

    vAPI.DOMFilterer = class {
        constructor() {
            this.commitTimer = new vAPI.SafeAnimationFrame(
                ( ) => { this.commitNow(); }
            );
            this.disabled = false;
            this.listeners = [];
            this.stylesheets = [];
            this.exceptedCSSRules = [];
            this.exceptions = [];
            this.convertedProceduralFilters = [];
            this.proceduralFilterer = null;
        }

        explodeCSS(css) {
            const out = [];
            const cssHide = `{${vAPI.hideStyle}}`;
            const blocks = css.trim().split(/\n\n+/);
            for ( const block of blocks ) {
                if ( block.endsWith(cssHide) === false ) { continue; }
                out.push(block.slice(0, -cssHide.length).trim());
            }
            return out;
        }

        addCSS(css, details = {}) {
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

        exceptCSSRules(exceptions) {
            if ( exceptions.length === 0 ) { return; }
            this.exceptedCSSRules.push(...exceptions);
            if ( this.hasListeners() ) {
                this.triggerListeners({ exceptions });
            }
        }

        addListener(listener) {
            if ( this.listeners.indexOf(listener) !== -1 ) { return; }
            this.listeners.push(listener);
        }

        removeListener(listener) {
            const pos = this.listeners.indexOf(listener);
            if ( pos === -1 ) { return; }
            this.listeners.splice(pos, 1);
        }

        hasListeners() {
            return this.listeners.length !== 0;
        }

        triggerListeners(changes) {
            for ( const listener of this.listeners ) {
                listener.onFiltersetChanged(changes);
            }
        }

        toggle(state, callback) {
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

        commitNow() {
            this.commitTimer.clear();
            if ( vAPI instanceof Object === false ) { return; }
            vAPI.userStylesheet.apply();
            if ( this.proceduralFilterer instanceof Object ) {
                this.proceduralFilterer.commitNow();
            }
        }

        commit(commitNow) {
            if ( commitNow ) {
                this.commitTimer.clear();
                this.commitNow();
            } else {
                this.commitTimer.start();
            }
        }

        proceduralFiltererInstance() {
            if ( this.proceduralFilterer instanceof Object === false ) {
                if ( vAPI.DOMProceduralFilterer instanceof Object === false ) {
                    return null;
                }
                this.proceduralFilterer = new vAPI.DOMProceduralFilterer(this);
            }
            return this.proceduralFilterer;
        }

        addProceduralSelectors(selectors) {
            const procedurals = [];
            for ( const raw of selectors ) {
                procedurals.push(JSON.parse(raw));
            }
            if ( procedurals.length === 0 ) { return; }
            const pfilterer = this.proceduralFiltererInstance();
            if ( pfilterer !== null ) {
                pfilterer.addProceduralSelectors(procedurals);
            }
        }

        createProceduralFilter(o) {
            const pfilterer = this.proceduralFiltererInstance();
            if ( pfilterer === null ) { return; }
            return pfilterer.createProceduralFilter(o);
        }

        getAllSelectors(bits = 0) {
            const out = {
                declarative: [],
                exceptions: this.exceptedCSSRules,
            };
            const hasProcedural = this.proceduralFilterer instanceof Object;
            const includePrivateSelectors = (bits & 0b01) !== 0;
            const masterToken = hasProcedural
                ? `[${this.proceduralFilterer.masterToken}]`
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
                        ...this.proceduralFilterer.selectors.values()
                    );
                }
                const proceduralFilterer = this.proceduralFiltererInstance();
                if ( proceduralFilterer !== null ) {
                    for ( const json of this.convertedProceduralFilters ) {
                        const pfilter = proceduralFilterer.createProceduralFilter(json);
                        pfilter.converted = true;
                        out.procedural.push(pfilter);
                    }
                }
            }
            return out;
        }

        getAllExceptionSelectors() {
            return this.exceptions.join(',\n');
        }
    };

    return vAPI.DOMFilterer;
}

/******************************************************************************/
