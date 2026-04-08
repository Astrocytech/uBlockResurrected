/*******************************************************************************

    uBlock Resurrected - Content Script Module
    vAPI Extensions - userStylesheet, SafeAnimationFrame

    These extensions are shared across all content script modules.

*******************************************************************************/

/******************************************************************************/

interface VAPI {
    effectiveSelf: Window;
    messaging: {
        send(channel: string, message: object): Promise<void>;
    };
    setTimeout(callback: () => void, ms: number): number;
    SafeAnimationFrame: typeof SafeAnimationFrame;
}

declare const vAPI: VAPI;

if ( typeof vAPI !== 'undefined' ) {

/******************************************************************************/

{
    let context = self as unknown as Window;
    try {
        while (
            context !== self.top &&
            context.location.href.startsWith('about:blank') &&
            context.parent.location.href
        ) {
            context = context.parent as Window;
        }
    } catch {
    }
    vAPI.effectiveSelf = context;
}

/******************************************************************************/

vAPI.userStylesheet = {
    added: new Set<string>(),
    removed: new Set<string>(),
    apply(callback?: () => void): void {
        if ( this.added.size === 0 && this.removed.size === 0 ) { return; }
        vAPI.messaging.send('vapi', {
            what: 'userCSS',
            add: Array.from(this.added),
            remove: Array.from(this.removed),
        }).then(() => {
            if ( typeof callback !== 'function' ) { return; }
            callback();
        });
        this.added.clear();
        this.removed.clear();
    },
    add(cssText: string, now?: boolean): void {
        if ( cssText === '' ) { return; }
        this.added.add(cssText);
        if ( now ) { this.apply(); }
    },
    remove(cssText: string, now?: boolean): void {
        if ( cssText === '' ) { return; }
        this.removed.add(cssText);
        if ( now ) { this.apply(); }
    }
};

/******************************************************************************/

vAPI.SafeAnimationFrame = class SafeAnimationFrame {
    private fid: number | undefined;
    private tid: number | undefined;
    private callback: () => void;

    constructor(callback: () => void) {
        this.fid = undefined;
        this.tid = undefined;
        this.callback = callback;
    }

    start(delay?: number): void {
        if ( vAPI instanceof Object === false ) { return; }
        if ( delay === undefined ) {
            if ( this.fid === undefined ) {
                this.fid = requestAnimationFrame(() => { this.onRAF(); });
            }
            if ( this.tid === undefined ) {
                this.tid = vAPI.setTimeout(() => { this.onSTO(); }, 20000);
            }
            return;
        }
        if ( this.fid === undefined && this.tid === undefined ) {
            this.tid = vAPI.setTimeout(() => { this.macroToMicro(); }, delay);
        }
    }

    clear(): void {
        if ( this.fid !== undefined ) {
            cancelAnimationFrame(this.fid);
            this.fid = undefined;
        }
        if ( this.tid !== undefined ) {
            clearTimeout(this.tid);
            this.tid = undefined;
        }
    }

    private macroToMicro(): void {
        this.tid = undefined;
        this.start();
    }

    private onRAF(): void {
        if ( this.tid !== undefined ) {
            clearTimeout(this.tid);
            this.tid = undefined;
        }
        this.fid = undefined;
        this.callback();
    }

    private onSTO(): void {
        if ( this.fid !== undefined ) {
            cancelAnimationFrame(this.fid);
            this.fid = undefined;
        }
        this.tid = undefined;
        this.callback();
    }
};

/******************************************************************************/

} // end if (typeof vAPI !== 'undefined')
