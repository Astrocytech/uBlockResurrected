/*******************************************************************************

    uBlock Origin - Content Script Module
    vAPI Extensions - userStylesheet, SafeAnimationFrame

    These extensions are shared across all content script modules.

*******************************************************************************/

/******************************************************************************/

/**
 * https://github.com/uBlockOrigin/uBlock-issues/issues/688#issuecomment-663657508
 * Find the effective context for content script execution (handles iframes).
 */
{
    let context = self;
    try {
        while (
            context !== self.top &&
            context.location.href.startsWith('about:blank') &&
            context.parent.location.href
        ) {
            context = context.parent;
        }
    } catch {
    }
    vAPI.effectiveSelf = context;
}

/******************************************************************************/

/**
 * User stylesheet manager.
 * Manages CSS injection through vAPI.messaging.
 */
vAPI.userStylesheet = {
    added: new Set(),
    removed: new Set(),
    apply: function(callback) {
        if ( this.added.size === 0 && this.removed.size === 0 ) { return; }
        vAPI.messaging.send('vapi', {
            what: 'userCSS',
            add: Array.from(this.added),
            remove: Array.from(this.removed),
        }).then(( ) => {
            if ( callback instanceof Function === false ) { return; }
            callback();
        });
        this.added.clear();
        this.removed.clear();
    },
    add: function(cssText, now) {
        if ( cssText === '' ) { return; }
        this.added.add(cssText);
        if ( now ) { this.apply(); }
    },
    remove: function(cssText, now) {
        if ( cssText === '' ) { return; }
        this.removed.add(cssText);
        if ( now ) { this.apply(); }
    }
};

/******************************************************************************/

/**

    The purpose of SafeAnimationFrame is to take advantage of the behavior of
    window.requestAnimationFrame[1]. If we use an animation frame as a timer,
    then this timer is described as follow:

    - time events are throttled by the browser when the viewport is not visible --
      there is no point for uBO to play with the DOM if the document is not
      visible.
    - time events are micro tasks[2].
    - time events are synchronized to monitor refresh, meaning that they can fire
      at most 1/60 (typically).

    If a delay value is provided, a plain timer is first used. Plain timers are
    macro-tasks, so this is good when uBO wants to yield to more important tasks
    on a page. Once the plain timer elapse, an animation frame is used to trigger
    the next time at which to execute the job.

    [1] https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame
    [2] https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/

*/

// https://github.com/gorhill/uBlock/issues/2147

vAPI.SafeAnimationFrame = class {
    constructor(callback) {
        this.fid = this.tid = undefined;
        this.callback = callback;
    }
    start(delay) {
        if ( self.vAPI instanceof Object === false ) { return; }
        if ( delay === undefined ) {
            if ( this.fid === undefined ) {
                this.fid = requestAnimationFrame(( ) => { this.onRAF(); } );
            }
            if ( this.tid === undefined ) {
                this.tid = vAPI.setTimeout(( ) => { this.onSTO(); }, 20000);
            }
            return;
        }
        if ( this.fid === undefined && this.tid === undefined ) {
            this.tid = vAPI.setTimeout(( ) => { this.macroToMicro(); }, delay);
        }
    }
    clear() {
        if ( this.fid !== undefined ) {
            cancelAnimationFrame(this.fid);
            this.fid = undefined;
        }
        if ( this.tid !== undefined ) {
            clearTimeout(this.tid);
            this.tid = undefined;
        }
    }
    macroToMicro() {
        this.tid = undefined;
        this.start();
    }
    onRAF() {
        if ( this.tid !== undefined ) {
            clearTimeout(this.tid);
            this.tid = undefined;
        }
        this.fid = undefined;
        this.callback();
    }
    onSTO() {
        if ( this.fid !== undefined ) {
            cancelAnimationFrame(this.fid);
            this.fid = undefined;
        }
        this.tid = undefined;
        this.callback();
    }
};

/******************************************************************************/
