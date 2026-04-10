/*******************************************************************************

    uBlock Resurrected - YouTube Ad Blocker Page Context Injector
    
    This content script injects the ad blocking code into the page context.
    It creates a script element with the blocking code and injects it
    before YouTube's own scripts run.

******************************************************************************/

(function() {
    'use strict';
    
    console.log('[YT-PAGE-INJECT] Starting page context injection');
    
    const isYouTube = () => {
        return window.location.hostname.includes('youtube.com') && 
               !window.location.hostname.includes('youtu.be');
    };
    
    if (!isYouTube()) {
        return;
    }
    
    console.log('[YT-PAGE-INJECT] Injecting ad blocker into page context');
    
    const adBlockerCode = `
    (function() {
        'use strict';
        
        console.log('[YT-PAGE] Ad blocker running in page context');
        
        var AD_KEYS = [
            'adPlacements',
            'playerAds', 
            'adSlots',
            'adBreakHeartbeatParams',
            'adServerLogger',
            'adBreakOverlays',
            'instreamVideoAds'
        ];
        
        function stripAdData(obj, depth) {
            depth = depth || 0;
            if (depth > 20 || obj === null || obj === undefined) return obj;
            if (typeof obj !== 'object') return obj;
            
            var newObj = Array.isArray(obj) ? [] : {};
            
            for (var key in obj) {
                if (AD_KEYS.indexOf(key) !== -1 || 
                    (key === 'trackingParams' && typeof obj[key] === 'string' && obj[key].indexOf('AB') === 0)) {
                    console.log('[YT-PAGE] Stripping:', key);
                    continue;
                }
                try {
                    newObj[key] = stripAdData(obj[key], depth + 1);
                } catch (e) {
                    newObj[key] = obj[key];
                }
            }
            
            return newObj;
        }
        
        // Patch fetch
        var originalFetch = window.fetch;
        window.fetch = function(resource, options) {
            var url = typeof resource === 'string' ? resource : (resource && resource.url);
            var isYtApi = url && url.indexOf('youtube.com/youtubei/v1/player') !== -1;
            
            if (isYtApi) console.log('[YT-PAGE] Fetch:', url.substring(0,50));
            
            return originalFetch.apply(this, arguments).then(function(response) {
                if (isYtApi && response.ok) {
                    return response.clone().text().then(function(text) {
                        if (text.indexOf('"adPlacements"') !== -1 || text.indexOf('"playerAds"') !== -1) {
                            console.log('[YT-PAGE] Stripping fetch response');
                            var json = JSON.parse(text);
                            return new Response(JSON.stringify(stripAdData(json)), {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        }
                        return response;
                    }).catch(function() { return response; });
                }
                return response;
            });
        };
        
        // Patch XHR
        var originalOpen = XMLHttpRequest.prototype.open;
        var originalSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url) {
            this._isYtApi = url && url.indexOf('youtube.com/youtubei/v1/player') !== -1;
            this._url = url;
            return originalOpen.apply(this, arguments);
        };
        
        XMLHttpRequest.prototype.send = function(body) {
            if (this._isYtApi) {
                console.log('[YT-PAGE] XHR:', this._url);
                this.addEventListener('load', function() {
                    var text = this.responseText;
                    if (text && (text.indexOf('"adPlacements"') !== -1 || text.indexOf('"playerAds"') !== -1)) {
                        console.log('[YT-PAGE] Stripping XHR response');
                        var stripped = JSON.stringify(stripAdData(JSON.parse(text)));
                        Object.defineProperty(this, 'responseText', { value: stripped, writable: false });
                    }
                });
            }
            return originalSend.apply(this, arguments);
        };
        
        // Patch JSON.parse
        var originalParse = JSON.parse;
        JSON.parse = function(text, reviver) {
            var result = originalParse.call(this, text, reviver);
            if (text && (text.indexOf('"adPlacements"') !== -1 || text.indexOf('"playerAds"') !== -1)) {
                console.log('[YT-PAGE] JSON.parse stripping');
                return stripAdData(result);
            }
            return result;
        };
        
        console.log('[YT-PAGE] All patches applied in page context');
        
        // Clean existing player response
        setTimeout(function() {
            var scripts = document.querySelectorAll('#ytinitialplayerresponse');
            for (var i = 0; i < scripts.length; i++) {
                try {
                    var text = scripts[i].textContent;
                    if (text.indexOf('"adPlacements"') !== -1) {
                        scripts[i].textContent = JSON.stringify(stripAdData(JSON.parse(text)));
                    }
                } catch (e) {}
            }
        }, 500);
        
    })();
    `;
    
    // Create and inject the script into page context
    const script = document.createElement('script');
    script.textContent = adBlockerCode;
    script.id = 'yt-ad-blocker-inject';
    script.async = false;
    script.defer = false;
    
    // Insert as early as possible
    (document.documentElement || document.head || document.documentElement).appendChild(script);
    
    console.log('[YT-PAGE-INJECT] Script injected into page context');
    
    // Try to clean any existing player response
    setTimeout(function() {
        const scripts = document.querySelectorAll('#ytinitialplayerresponse');
        scripts.forEach(function(script) {
            try {
                const text = script.textContent;
                if (text && text.indexOf('"adPlacements"') !== -1) {
                    console.log('[YT-PAGE-INJECT] Cleaning existing player response');
                    script.textContent = JSON.stringify((function() {
                        var json = JSON.parse(text);
                        var AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
                        function strip(obj) {
                            if (obj === null || obj === undefined) return obj;
                            if (typeof obj !== 'object') return obj;
                            var result = Array.isArray(obj) ? [] : {};
                            for (var key in obj) {
                                if (AD_KEYS.indexOf(key) === -1) {
                                    result[key] = strip(obj[key]);
                                }
                            }
                            return result;
                        }
                        return strip(json);
                    })());
                }
            } catch (e) {}
        });
    }, 100);
    
})();