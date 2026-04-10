/*******************************************************************************

    uBlock Resurrected - YouTube Ad Blocker Injection Script
    
    This script runs IN THE PAGE CONTEXT (not sandboxed) at document_start.
    It patches APIs before YouTube's own scripts run.
    
    This is the key to blocking YouTube ads in MV3 - we must inject
    into the page context before YouTube's scripts initialize.

******************************************************************************/

(function() {
    'use strict';
    
    console.log('[YT-INJECT] YouTube ad blocker injection starting...');
    
    const isYouTube = function() {
        return window.location.hostname.includes('youtube.com') && 
               !window.location.hostname.includes('youtu.be');
    };
    
    if (!isYouTube()) {
        console.log('[YT-INJECT] Not YouTube, skipping');
        return;
    }
    
    console.log('[YT-INJECT] YouTube detected, setting up interceptors');
    
    const AD_KEYS = [
        'adPlacements',
        'playerAds', 
        'adSlots',
        'adBreakHeartbeatParams',
        'adServerLogger',
        'adBreakOverlays',
        'instreamVideoAds'
    ];
    
    const stripAdData = function(obj, depth) {
        depth = depth || 0;
        if (depth > 20) return obj;
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;
        
        var newObj = Array.isArray(obj) ? [] : {};
        
        for (var key in obj) {
            if (AD_KEYS.indexOf(key) !== -1 || 
                (key === 'trackingParams' && typeof obj[key] === 'string' && obj[key].indexOf('AB') === 0)) {
                console.log('[YT-INJECT] Stripping key:', key);
                continue;
            }
            
            try {
                newObj[key] = stripAdData(obj[key], depth + 1);
            } catch (e) {
                newObj[key] = obj[key];
            }
        }
        
        return newObj;
    };
    
    var fetchOverride = window.fetch;
    window.fetch = function(resource, options) {
        var url = typeof resource === 'string' ? resource : (resource && resource.url);
        
        var isYouTubeApi = url && (
            url.indexOf('youtube.com/youtubei/v1/player') !== -1 ||
            url.indexOf('youtube.com/apiManifest') !== -1
        );
        
        if (isYouTubeApi) {
            console.log('[YT-INJECT] Fetch to YouTube API:', url.substring(0, 60));
        }
        
        return fetchOverride.apply(this, arguments).then(function(response) {
            if (isYouTubeApi && response.ok) {
                return response.clone().text().then(function(text) {
                    if (text.indexOf('"adPlacements"') !== -1 || 
                        text.indexOf('"playerAds"') !== -1 ||
                        text.indexOf('"adSlots"') !== -1) {
                        
                        console.log('[YT-INJECT] Stripping ad data from fetch response');
                        var json = JSON.parse(text);
                        var stripped = stripAdData(json);
                        return new Response(JSON.stringify(stripped), {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers
                        });
                    }
                    return response;
                }).catch(function(e) {
                    return response;
                });
            }
            return response;
        });
    };
    
    console.log('[YT-INJECT] Fetch patched');
    
    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        this._ytApi = url && (
            url.indexOf('youtube.com/youtubei/v1/player') !== -1 ||
            url.indexOf('youtube.com/apiManifest') !== -1
        );
        this._url = url;
        return xhrOpen.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
        if (this._ytApi) {
            console.log('[YT-INJECT] XHR to YouTube API:', this._url);
            
            this.addEventListener('load', function() {
                if (this.responseType === '' || this.responseType === 'text') {
                    var text = this.responseText;
                    if (text && (text.indexOf('"adPlacements"') !== -1 || 
                                 text.indexOf('"playerAds"') !== -1 ||
                                 text.indexOf('"adSlots"') !== -1)) {
                        
                        console.log('[YT-INJECT] Stripping ad data from XHR response');
                        var json = JSON.parse(text);
                        var stripped = stripAdData(json);
                        
                        Object.defineProperty(this, 'responseText', {
                            value: JSON.stringify(stripped),
                            writable: false,
                            configurable: true
                        });
                    }
                }
            });
        }
        return xhrSend.apply(this, arguments);
    };
    
    console.log('[YT-INJECT] XHR patched');
    
    var jsonParse = JSON.parse;
    JSON.parse = function(text, reviver) {
        var parsed = jsonParse.call(this, text, reviver);
        
        if (isYouTube() && parsed && typeof parsed === 'object') {
            if (text.indexOf('"adPlacements"') !== -1 || 
                text.indexOf('"playerAds"') !== -1 ||
                text.indexOf('"adSlots"') !== -1) {
                console.log('[YT-INJECT] JSON.parse caught ad data');
                return stripAdData(parsed);
            }
        }
        
        return parsed;
    };
    
    console.log('[YT-INJECT] JSON.parse patched');
    
    var elementProto = Element.prototype;
    var originalAppendChild = elementProto.appendChild;
    
    elementProto.appendChild = function(newChild) {
        if (newChild && newChild.nodeName === 'SCRIPT') {
            var src = newChild.src || newChild.textContent || '';
            if (src.indexOf('ytinitialplayerresponse') !== -1 || 
                src.indexOf('player') !== -1) {
                console.log('[YT-INJECT] Script added:', newChild.id || newChild.className);
            }
        }
        return originalAppendChild.apply(this, arguments);
    };
    
    console.log('[YT-INJECT] appendChild patched');
    
    setTimeout(function() {
        var playerResp = document.getElementById('ytinitialplayerresponse');
        if (playerResp) {
            try {
                var text = playerResp.textContent;
                if (text && text.indexOf('"adPlacements"') !== -1) {
                    console.log('[YT-INJECT] Found initial player response, stripping');
                    var json = JSON.parse(text);
                    var stripped = stripAdData(json);
                    playerResp.textContent = JSON.stringify(stripped);
                }
            } catch (e) {}
        }
    }, 500);
    
    setTimeout(function() {
        var keys = ['ytInitialPlayerResponse', 'playerResponse'];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (window[key] !== undefined) {
                try {
                    var str = JSON.stringify(window[key]);
                    if (str.indexOf('"adPlacements"') !== -1 || str.indexOf('"playerAds"') !== -1) {
                        console.log('[YT-INJECT] Neutering window.' + key);
                        window[key] = stripAdData(window[key]);
                    }
                } catch (e) {}
            }
        }
    }, 1000);
    
    console.log('[YT-INJECT] YouTube ad blocker injection complete');
    
})();