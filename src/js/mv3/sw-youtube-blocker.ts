/*******************************************************************************

    uBlock Origin - MV3 YouTube Ad Blocker
    Injects ad blocking code into YouTube pages at document_start

******************************************************************************/

export const registerYouTubeAdBlocker = (
    applyPersistedHostnameSwitchesForTab: (tabId: number, url: string) => Promise<void>,
) => {
    chrome.webNavigation?.onCommitted?.addListener(async (details) => {
        if (details.frameId !== 0) { return; }
        await applyPersistedHostnameSwitchesForTab(details.tabId, details.url);
        
        const url = details.url;
        if (!url || !url.includes('youtube.com')) { return; }
        
        if (chrome.scripting?.executeScript === undefined) {
            console.log('[MV3] chrome.scripting not available');
            return;
        }
        
        console.log('[MV3] Injecting YouTube ad blocker early into tab', details.tabId);
        
        try {
            await chrome.scripting.executeScript({
                target: { tabId: details.tabId },
                world: 'MAIN',
                func: () => {
                    console.log('[YT-MAIN] Early page context injection');
                    
                    const stripAdData = (obj: any): any => {
                        if (obj === null || obj === undefined) return obj;
                        if (typeof obj !== 'object') return obj;
                        const newObj: any = Array.isArray(obj) ? [] : {};
                        for (const key of Object.keys(obj)) {
                            if (['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adServerLogger', 'adBreakOverlays'].includes(key)) continue;
                            try { newObj[key] = stripAdData(obj[key]); } catch { newObj[key] = obj[key]; }
                        }
                        return newObj;
                    };
                    
                    const originalFetch = window.fetch;
                    window.fetch = function(...args) {
                        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
                        if (url && url.includes('youtube.com/youtubei/v1/player')) {
                            console.log('[YT-MAIN] Fetch to player API');
                        }
                        return originalFetch.apply(this, args).then((response: Response) => {
                            if (url && url.includes('youtube.com/youtubei/v1/player') && response.ok) {
                                return response.clone().text().then((text: string) => {
                                    if (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"')) {
                                        console.log('[YT-MAIN] Stripping ad data from fetch');
                                        try {
                                            const json = JSON.parse(text);
                                            const stripped = stripAdData(json);
                                            return new Response(JSON.stringify(stripped), {
                                                status: response.status,
                                                statusText: response.statusText,
                                                headers: response.headers
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
                                        const stripped = JSON.stringify(stripAdData(json));
                                        Object.defineProperty(this, 'responseText', { value: stripped, writable: false, configurable: true });
                                        Object.defineProperty(this, 'response', { value: stripped, writable: false, configurable: true });
                                    } catch {}
                                }
                            });
                        }
                        return originalSend.apply(this, arguments);
                    };
                    
                    const originalJSONParse = JSON.parse;
                    JSON.parse = function(text: string, reviver?: (key: string, value: any) => any) {
                        const result = originalJSONParse.call(this, text, reviver);
                        if (text && (text.includes('"adPlacements"') || text.includes('"playerAds"') || text.includes('"adSlots"'))) {
                            console.log('[YT-MAIN] JSON.parse catching ad data');
                            try {
                                return stripAdData(result);
                            } catch {}
                        }
                        return result;
                    };
                    
                    console.log('[YT-MAIN] All patches applied');
                },
            });
            console.log('[MV3] Early injection complete for tab', details.tabId);
        } catch (e) {
            console.error('[MV3] Failed to inject:', e);
        }
    }, { url: [{ urlContains: 'youtube.com' }] });
};
