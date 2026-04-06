/*******************************************************************************

    uBlock Origin - Content Script Module
    CSP Violation Listener

    Listens and reports CSP violations so that blocked resources through CSP
    are properly reported in the logger.

*******************************************************************************/

/**
 * Initialize CSP violation listener.
 * Reports CSP violations to the background script.
 */
export function initCSPlistener() {
    const newEvents = new Set();
    const allEvents = new Set();
    let timer;

    const send = function() {
        if ( self.vAPI instanceof Object === false ) { return; }
        vAPI.messaging.send('scriptlets', {
            what: 'securityPolicyViolation',
            type: 'net',
            docURL: document.location.href,
            violations: Array.from(newEvents),
        }).then(response => {
            if ( response === true ) { return; }
            stop();
        });
        for ( const event of newEvents ) {
            allEvents.add(event);
        }
        newEvents.clear();
    };

    const sendAsync = function() {
        if ( timer !== undefined ) { return; }
        timer = self.requestIdleCallback(
            ( ) => { timer = undefined; send(); },
            { timeout: 2063 }
        );
    };

    const listener = function(ev) {
        if ( ev.isTrusted !== true ) { return; }
        if ( ev.disposition !== 'enforce' ) { return; }
        const json = JSON.stringify({
            url: ev.blockedURL || ev.blockedURI,
            policy: ev.originalPolicy,
            directive: ev.effectiveDirective || ev.violatedDirective,
        });
        if ( allEvents.has(json) ) { return; }
        newEvents.add(json);
        sendAsync();
    };

    const stop = function() {
        newEvents.clear();
        allEvents.clear();
        if ( timer !== undefined ) {
            self.cancelIdleCallback(timer);
            timer = undefined;
        }
        document.removeEventListener('securitypolicyviolation', listener);
        if ( vAPI ) { vAPI.shutdown.remove(stop); }
    };

    document.addEventListener('securitypolicyviolation', listener);
    vAPI.shutdown.add(stop);

    // We need to call at least once to find out whether we really need to
    // listen to CSP violations.
    sendAsync();
}

/******************************************************************************/
