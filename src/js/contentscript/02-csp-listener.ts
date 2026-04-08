/*******************************************************************************

    uBlock Resurrected - Content Script Module
    CSP Violation Listener

    Listens and reports CSP violations so that blocked resources through CSP
    are properly reported in the logger.

*******************************************************************************/

interface SecurityPolicyViolationEvent extends Event {
    isTrusted: boolean;
    disposition: string;
    blockedURL?: string;
    blockedURI?: string;
    originalPolicy: string;
    effectiveDirective?: string;
    violatedDirective?: string;
}

interface ShutdownCallbacks {
    add(callback: () => void): void;
    remove(callback: () => void): void;
}

interface VAPIMessaging {
    send(channel: string, message: object): Promise<unknown>;
}

interface VAPI {
    shutdown: ShutdownCallbacks;
    messaging: VAPIMessaging;
}

declare const vAPI: VAPI;

export function initCSPlistener(): void {
    const newEvents = new Set<string>();
    const allEvents = new Set<string>();
    let timer: number | undefined;

    const send = function(): void {
        if ( vAPI instanceof Object === false ) { return; }
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

    const sendAsync = function(): void {
        if ( timer !== undefined ) { return; }
        timer = self.requestIdleCallback(
            () => { timer = undefined; send(); },
            { timeout: 2063 }
        );
    };

    const listener = function(ev: Event): void {
        const cspEv = ev as SecurityPolicyViolationEvent;
        if ( cspEv.isTrusted !== true ) { return; }
        if ( cspEv.disposition !== 'enforce' ) { return; }
        const json = JSON.stringify({
            url: cspEv.blockedURL || cspEv.blockedURI,
            policy: cspEv.originalPolicy,
            directive: cspEv.effectiveDirective || cspEv.violatedDirective,
        });
        if ( allEvents.has(json) ) { return; }
        newEvents.add(json);
        sendAsync();
    };

    const stop = function(): void {
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

    sendAsync();
}

/******************************************************************************/
