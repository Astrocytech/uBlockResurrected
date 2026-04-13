/*******************************************************************************

    uBlock Origin - MV3 Service Worker Messaging Setup
    Handles legacy messaging initialization and port registration

*******************************************************************************/

import type { LegacyMessagingAPI, LegacyPortDetails } from './sw-types.js';

export const getLegacyMessaging = (): LegacyMessagingAPI | undefined => {
    return (globalThis as any).vAPI?.messaging;
};

export const registerLegacyPort = (port: chrome.runtime.Port): LegacyPortDetails | undefined => {
    const messaging = getLegacyMessaging();
    if ( messaging === undefined ) { return; }

    const sender = port.sender || {};
    const { origin, tab, url } = sender;
    const details: LegacyPortDetails = {
        port,
        frameId: sender.frameId,
        frameURL: url,
        privileged: origin !== undefined
            ? origin === messaging.PRIVILEGED_ORIGIN
            : typeof url === 'string' && url.startsWith(messaging.PRIVILEGED_ORIGIN),
    };
    if ( tab ) {
        details.tabId = tab.id;
        details.tabURL = tab.url;
    }
    messaging.ports.set(port.name, details);
    return details;
};
