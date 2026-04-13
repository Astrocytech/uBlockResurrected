/*******************************************************************************

    uBlock Origin - MV3 Service Worker Event Listeners
    Registers all chrome API event listeners

*******************************************************************************/

import { pageStores } from './sw-pagestore.js';
import { clearTabRequestState } from './sw-request-tracking.js';
import { finalizeTrackedRequest, trackPendingRequest } from './sw-request-handlers.js';
import { applyPersistedHostnameSwitchesForTab } from './sw-whitelist.js';
import type { LegacyMessagingAPI } from './sw-types.js';

export const registerEventListeners = (messaging: LegacyMessagingAPI) => {
    messaging.on('launchLogger', (request, callback) => {
        const tabId = request.tabId as number;
        if (typeof tabId === 'number') {
            chrome.tabs.create({ url: `logger-ui.html?tabId=${tabId}` });
        } else {
            chrome.tabs.create({ url: 'logger-ui.html' });
        }
        if (callback) callback({ success: true });
    });

    messaging.on('openPopup', (request, callback) => {
        const tabId = request.tabId as number;
        if (typeof tabId === 'number') {
            chrome.tabs.create({ url: `popup.html?tabId=${tabId}` });
        } else {
            chrome.tabs.create({ url: 'popup.html' });
        }
        if (callback) callback({ success: true });
    });

    messaging.on('launchStats', (request, callback) => {
        const tabId = request.tabId as number;
        if (typeof tabId === 'number') {
            chrome.tabs.create({ url: `statistics.html?tabId=${tabId}` });
        } else {
            chrome.tabs.create({ url: 'statistics.html' });
        }
        if (callback) callback({ success: true });
    });

    messaging.on('launchDashboard', (request, callback) => {
        chrome.tabs.create({ url: 'dashboard.html' });
        if (callback) callback({ success: true });
    });

    messaging.on('launchCloud', (request, callback) => {
        chrome.tabs.create({ url: 'cloud-ui.html' });
        if (callback) callback({ success: true });
    });

    messaging.on('launchLogger', (request, callback) => {
        switch (request.what) {
            case 'launchLogger':
                chrome.tabs.create({ url: 'logger-ui.html' });
                break;
        }
    });

    // WebRequest listeners
    chrome.webRequest.onBeforeRequest.addListener(
        details => {
            void trackPendingRequest(details as chrome.webRequest.WebRequestBodyDetails);
        },
        { urls: [ '<all_urls>' ] },
    );

    chrome.webRequest.onCompleted.addListener(
        details => {
            void finalizeTrackedRequest(details, false);
        },
        { urls: [ '<all_urls>' ] },
    );

    chrome.webRequest.onErrorOccurred.addListener(
        details => {
            void finalizeTrackedRequest(details, true);
        },
        { urls: [ '<all_urls>' ] },
    );

    // Tab removal handler
    chrome.tabs.onRemoved.addListener(tabId => {
        void clearTabRequestState(tabId);
        const pageStore = pageStores.get(tabId);
        if (pageStore) {
            pageStore.disposeFrameStores();
            pageStores.delete(tabId);
        }
    });

// Video platform hostname switch application
    chrome.webNavigation?.onCommitted?.addListener(async (details) => {
        if (details.frameId !== 0) { return; }
        await applyPersistedHostnameSwitchesForTab(details.tabId, details.url);
    });

    // Navigation listener for same-page navigation (including video platforms)
    chrome.webNavigation?.onHistoryStateUpdated?.addListener(async (details) => {
        if (details.frameId !== 0) { return; }
        const url = details.url;
        if (!url) { return; }
        // Re-apply hostname switches for SPA navigation
        await applyPersistedHostnameSwitchesForTab(details.tabId, url);
    });
                                        } catch {}
                                    }
                                    return response;
                                });
                            }
                            return response;
                        });
                    };
                    
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method: string, url: string) {
                        (this as any)._isYtPlayer = url && (url.includes('youtube.com/youtubei/v1/player') || url.includes('youtube.com/apiManifest'));
                        return originalOpen.apply(this, arguments);
                    };
                    
                    const originalSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.send = function(body?: any) {
                        if ((this as any)._isYtPlayer) {
                            console.log('[YT-MAIN] XHR to player API');
                            this.addEventListener('load', function() {
                                const text = this.responseText;
                                if (text && (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"'))) {
                                    console.log('[YT-MAIN] Stripping ad data from XHR');
                                    try {
                                        const json = JSON.parse(text);
                                        const stripAdData = (obj: any): any => {
                                            if (obj === null || obj === undefined) return obj;
                                            if (typeof obj !== 'object') return obj;
                                            const newObj: any = Array.isArray(obj) ? [] : {};
                                            for (const key of Object.keys(obj)) {
                                                if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) {
                                                    continue;
                                                }
                                                try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                                            }
                                            return newObj;
                                        };
                                        const stripped = stripAdData(json);
                                        Object.defineProperty(this, 'responseText', { value: JSON.stringify(stripped) });
                                        Object.defineProperty(this, 'response', { value: JSON.stringify(stripped) });
                                    } catch {}
                                }
                            });
                        }
                        return originalSend.apply(this, arguments);
                    };
                },
            });
            console.log('[MV3] YouTube injection complete for tab', details.tabId);
        } catch (e) {
            console.log('[MV3] YouTube injection error:', e);
        }
    });

    // YouTube navigation listener for same-page navigation
    chrome.webNavigation?.onHistoryStateUpdated?.addListener(async (details) => {
        if (details.frameId !== 0) { return; }
        
        const url = details.url;
        if (!url || !url.includes('youtube.com')) { return; }
        
        // Re-apply hostname switches
        await applyPersistedHostnameSwitchesForTab(details.tabId, url);
    });

    return {
        dispose: () => {
            // Cleanup function if needed
        }
    };
};
