/*******************************************************************************

    uBlock Resurrected - a comprehensive, efficient content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

import { dom, qs$ } from './dom.js';

/******************************************************************************/

interface VAPI {
    messaging: {
        send: (topic: string, details: object) => Promise<unknown>;
    };
    localStorage: {
        setItem: (key: string, value: string) => void;
        getItemAsync: (key: string) => Promise<string | null>;
    };
    defer: {
        once: (delay: number) => { then: (callback: () => void) => void };
    };
}

declare const vAPI: VAPI;

interface DashboardConfig {
    noDashboard?: boolean;
}

function discardUnsavedData(synchronous = false): boolean | Promise<boolean> {
    const paneFrame = qs$('#iframe') as HTMLIFrameElement;
    const paneWindow = paneFrame.contentWindow as Window & { hasUnsavedData?: () => boolean };
    if (
        typeof paneWindow.hasUnsavedData !== 'function' ||
        paneWindow.hasUnsavedData() === false
    ) {
        return true;
    }

    if ( synchronous ) {
        return false;
    }

    return new Promise(resolve => {
        const modal = qs$('#unsavedWarning') as HTMLElement;
        dom.cl.add(modal, 'on');
        modal.focus();

        const onDone = (status: boolean): void => {
            dom.cl.remove(modal, 'on');
            dom.off(document, 'click', onClick, true);
            resolve(status);
        };

        const onClick = (ev: Event): void => {
            const target = ev.target as HTMLElement;
            if ( target.matches('[data-i18n="dashboardUnsavedWarningStay"]') ) {
                return onDone(false);
            }
            if ( target.matches('[data-i18n="dashboardUnsavedWarningIgnore"]') ) {
                return onDone(true);
            }
            if ( qs$(modal, '[data-i18n="dashboardUnsavedWarning"]')!.contains(target) ) {
                return;
            }
            onDone(false);
        };

        dom.on(document, 'click', onClick, true);
    });
}

function loadDashboardPanel(pane: string, first: boolean): void {
    const tabButton = qs$(`[data-pane="${pane}"]`) as HTMLElement | null;
    if ( tabButton === null || dom.cl.has(tabButton, 'selected') ) { return; }
    const loadPane = ( ) => {
        self.location.replace(`#${pane}`);
        dom.cl.remove('.tabButton.selected', 'selected');
        dom.cl.add(tabButton, 'selected');
        tabButton.scrollIntoView();
        const iframe = qs$('#iframe') as HTMLIFrameElement;
        iframe.contentWindow!.location.replace(pane);
        if ( pane !== 'no-dashboard.html' ) {
            iframe.addEventListener('load', ( ) => {
                const wikilink = (iframe.contentWindow as unknown as { wikilink?: string }).wikilink;
                const link = qs$('.wikilink') as HTMLAnchorElement | null;
                if ( link ) {
                    link.href = wikilink || '';
                }
            }, { once: true });
            vAPI.localStorage.setItem('dashboardLastVisitedPane', pane);
        }
    };
    if ( first ) {
        return loadPane();
    }
    const r = discardUnsavedData();
    if ( r === false ) { return; }
    if ( r === true ) { return loadPane(); }
    (r as Promise<boolean>).then(status => {
        if ( status === false ) { return; }
        loadPane();
    });
}

function onTabClickHandler(ev: Event): void {
    const target = ev.target as HTMLElement;
    const pane = dom.attr(target, 'data-pane');
    if ( pane ) {
        loadDashboardPanel(pane, false);
    }
}

if ( self.location.hash.slice(1) === 'no-dashboard.html' ) {
    dom.cl.add(dom.body, 'noDashboard');
}

(async ( ) => {
    await new Promise(resolve => {
        const check = async ( ) => {
            try {
                const response = await vAPI.messaging.send('dashboard', {
                    what: 'readyToFilter'
                });
                if ( response ) { return resolve(true); }
                const iframe = qs$('#iframe') as HTMLIFrameElement;
                if ( iframe.src !== '' ) {
                    iframe.src = '';
                }
            } catch {
            }
            vAPI.defer.once(250).then(( ) => check());
        };
        check();
    });

    dom.cl.remove(dom.body, 'notReady');

    const results = await Promise.all([
        vAPI.messaging.send('dashboard', { what: 'dashboardConfig' }) as Promise<DashboardConfig>,
        vAPI.localStorage.getItemAsync('dashboardLastVisitedPane'),
    ]);

    {
        const details = results[0] || {} as DashboardConfig;
        if ( details.noDashboard ) {
            self.location.hash = '#no-dashboard.html';
            dom.cl.add(dom.body, 'noDashboard');
        } else if ( self.location.hash === '#no-dashboard.html' ) {
            self.location.hash = '';
        }
    }

    {
        let pane = results[1] || null;
        if ( self.location.hash !== '' ) {
            pane = self.location.hash.slice(1) || null;
        }
        loadDashboardPanel(pane !== null ? pane : 'settings.html', true);

        dom.on('.tabButton', 'click', onTabClickHandler);

        dom.on(self, 'beforeunload', ( ) => {
            if ( discardUnsavedData(true) ) { return; }
            event.preventDefault();
            event.returnValue = '';
        });

        dom.on(self, 'hashchange', ( ) => {
            const pane = self.location.hash.slice(1);
            if ( pane === '' ) { return; }
            loadDashboardPanel(pane);
        });

    }
})();