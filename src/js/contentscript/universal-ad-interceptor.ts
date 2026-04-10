/*******************************************************************************

    uBlock Resurrected - Universal Ad Interceptor for MV3
    
    A comprehensive content script that intercepts network requests and
    strips ad data from responses across ALL websites, not just YouTube.
    
    This is necessary because MV3's DNR API cannot:
    - Modify XHR/Fetch responses
    - Inject scriptlets
    - Perform JSON pruning
    
    This content script fills that gap by:
    1. Intercepting fetch/XHR at the JavaScript level
    2. Analyzing responses for ad-related data
    3. Stripping ad keys from JSON responses
    4. Using heuristic scoring for unknown ad patterns
    
*******************************************************************************/

((self) => {
    'use strict';

    const DEBUG = false;
    const LOG_PREFIX = '[UAi] Universal Ad Interceptor:';
    
    const log = (...args) => {
        if (DEBUG) {
            console.log(LOG_PREFIX, ...args);
        }
    };

    // Configuration
    const CONFIG = {
        // Known ad network domains (partial matches)
        adDomains: [
            'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
            'googleads.g.doubleclick.net', 'adsense.google.com',
            'adnxs.com', 'adnexus.net', 'adnxs.org',
            'amazon-adsystem.com', 'amazonadsystem.com',
            'advertising.com', 'adtech.com', 'adtechus.com',
            'adform.net', 'adform.com',
            'pubmatic.com', 'pubmatic.io',
            'rubiconproject.com', 'rubicon.com',
            'openx.net', 'openx.com',
            'indexexchange.com', 'indexexchange.io',
            'criteo.com', 'criteo.fr',
            'taboola.com', 'taboola.com.cn',
            'outbrain.com', 'outbrainimg.com',
            'mgid.com',
            'adsrvr.org', 'adsrvr.com',
            'adcolony.com', 'admob.com',
            'unity3d.com/ads', 'unityads.unity3d.com',
            'moatads.com', 'moat.com',
            'scorecardresearch.com', 'quantserve.com',
            'adform.net', 'adtech.de',
            'bidswitch.net', 'casalemedia.com',
            'contextweb.com', 'conversantmedia.com',
            'demdex.net', 'exelator.com',
            'eyeota.net', 'krxd.net',
            'lijit.com', 'liveramp.com',
            'mathtag.com', 'mediamath.com',
            'mxptint.net', 'nativo.com',
            'openx.net', 'pardot.com',
            'rfihub.com', 'richrelevance.com',
            'rfihub.com', 'rlcdn.com',
            'rubiconproject.com', 'sharethrough.com',
            'simpli.fi', 'sitescout.com',
            'smartadserver.com', 'spotxchange.com',
            'stackadapt.com', 'steelhousemedia.com',
            'stickyadstv.com', 'taboola.com',
            'teads.tv', 'tribalfusion.com',
            'triplelift.com', 'turn.com',
            'undertone.com', 'yahoo.com/ads',
            'yieldmo.com', 'zeotap.com',
            // Video ads
            'ima3.js', 'googlevideo.com/ad', 'vast', 'vmgcp',
            // Social ads
            'facebook.com/tr', 'facebook.com/ads', 'connect.facebook.net',
            'linkedin.com/ads', 'twitter.com/ads',
        ],
        
        // URL patterns that indicate ad requests
        adUrlPatterns: [
            /\/ads\//i, /\/ad\/ /i, /\/advert/i, /\/adview/i,
            /\/adclick/i, /\/adframe/i, /\/adbanner/i,
            /\/sponsor/i, /\/promoted/i,
            /\/api\/ads/i, /\/api\/ad/i, /\/ads\/api/i,
            /\/adservice/i, /\/ad-serving/i,
            /\/adsense/i, /\/dfp\//i, /\/gpt\//i,
            /pagead/i, /\/pagead2\//i,
            /\/pubads\//i, /\/cmad/i,
            /bid/i, /\/bidder/i, /\/bids/i,
            /prebid/i, /rubicon/i,
            /\/vast\//i, /\/vmap\//i,
            /\/syndication\//i,
        ],
        
        // JSON keys that indicate ad data
        adJSONKeys: [
            'adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams',
            'adServerLogger', 'adSlotId', 'adSlotId', 'adUnitId',
            'ads', 'advertisements', 'advertising',
            'sponsored', 'sponsoredContent', 'sponsoredLinks',
            'promoted', 'promotedContent',
            'isAd', 'isAdvertisement', 'isSponsored',
            'adMetadata', 'adData', 'adContext',
            'adTracking', 'adImpressions',
            'googleAds', 'dfpAds', 'gptAds',
        ],
        
        // Tracking parameter patterns
        trackingParams: [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'gclsrc', 'dclid',
            'msclkid', 'mc_eid', 'mc_cid',
            'ref', 'ref_src', 'ref_url',
            '_hsenc', '_hsmi',
            'vero_id', 'vero_conv',
            'wickedid', 'wbraid', 'gbraid',
        ],
        
        // Whitelist - known non-ad domains that might trigger heuristics
        whitelist: [
            'google.com', 'googleapis.com', 'googletagmanager.com',
            'facebook.com', 'facebook.net', 'connect.facebook.net',
            'twitter.com', 'linkedin.com', 'instagram.com',
            'github.com', 'github.io', 'githubusercontent.com',
            'cdn.jsdelivr.net', 'unpkg.com', 'raw.githubusercontent.com',
            'reddit.com', 'redditstatic.com',
            'wikipedia.org', 'wikimedia.org',
            'cloudflare.com', 'cloudfront.net',
        ],
        
        // DOM selectors for common ad containers (for cosmetic filtering)
        adContainerSelectors: [
            // Generic
            '[class*="ad-"]', '[class*="-ad"]', '[class*="advert"]',
            '[id*="ad-"]', '[id*="-ad"]', '[id*="advert"]',
            '[data-ad]', '[data-ad-slot]', '[data-ad-client]',
            // Google
            '.adsbygoogle', 'ins.adsbygoogle', '[id^="google_ads"]',
            '[id^="div-gpt-ad"]', '.dfp-ad',
            // Common ad networks
            '.taboola', '#taboola', '[id*="taboola"]',
            '.outbrain', '#outbrain', '[id*="outbrain"]',
            '.mgid', '#mgid',
            // Generic ad containers
            '.ad-container', '.ad-wrapper', '.ad-box',
            '.ad-banner', '.ad-slot', '.ad-unit',
            '.advertisement', '.sponsored-content',
            'iframe[src*="ads"]', 'iframe[src*="doubleclick"]',
            'iframe[src*="googlesyndication"]',
        ],
    };

    // Heuristic scoring system
    class HeuristicScorer {
        constructor(config) {
            this.config = config;
        }
        
        scoreUrl(url) {
            if (!url) return 0;
            
            const urlLower = url.toLowerCase();
            let score = 0;
            
            // Check against known ad domains
            for (const domain of this.config.adDomains) {
                if (urlLower.includes(domain.toLowerCase())) {
                    score += 0.5;
                    break;
                }
            }
            
            // Check URL patterns
            for (const pattern of this.config.adUrlPatterns) {
                if (pattern.test(url)) {
                    score += 0.3;
                    break;
                }
            }
            
            // Check for suspicious patterns
            if (/\d{4,}/.test(url)) score += 0.1; // Long numbers
            if (/[?&](ad|ads)=/.test(url)) score += 0.2;
            
            // Cap at 1.0
            return Math.min(score, 1.0);
        }
        
        isWhitelisted(url) {
            if (!url) return false;
            const urlLower = url.toLowerCase();
            return this.config.whitelist.some(domain => 
                urlLower.includes(domain.toLowerCase())
            );
        }
    }

    // Ad data stripper - recursively removes ad keys from objects
    class AdDataStripper {
        constructor(config) {
            this.config = config;
        }
        
        shouldStripKey(key) {
            return this.config.adJSONKeys.some(adKey => 
                key.toLowerCase().includes(adKey.toLowerCase())
            );
        }
        
        strip(obj) {
            if (obj === null || obj === undefined) return obj;
            
            if (typeof obj !== 'object') return obj;
            
            const isArray = Array.isArray(obj);
            const result = isArray ? [] : {};
            
            for (const key of Object.keys(obj)) {
                // Skip known ad keys
                if (this.shouldStripKey(key)) {
                    log('Stripping ad key:', key);
                    continue;
                }
                
                // Recursively process
                try {
                    result[key] = this.strip(obj[key]);
                } catch (e) {
                    // If recursive strip fails, keep original
                    result[key] = obj[key];
                }
            }
            
            return result;
        }
        
        parseAndStrip(text) {
            try {
                const json = JSON.parse(text);
                const stripped = this.strip(json);
                return JSON.stringify(stripped);
            } catch (e) {
                // Not JSON or parse error - return original
                return text;
            }
        }
    }

    // Main interceptor class
    class UniversalAdInterceptor {
        constructor() {
            this.scorer = new HeuristicScorer(CONFIG);
            this.stripper = new AdDataStripper(CONFIG);
            this.init();
        }
        
        init() {
            this.interceptFetch();
            this.interceptXHR();
            this.initDOMObserver();
            log('Initialized universal ad interceptor');
        }
        
        interceptFetch() {
            const originalFetch = self.fetch;
            
            self.fetch = async function(...args) {
                const [resource, options] = args;
                const url = typeof resource === 'string' ? resource : resource?.url;
                
                // Quick check - skip if whitelisted
                if (url && interceptor.scorer.isWhitelisted(url)) {
                    return originalFetch.apply(this, args);
                }
                
                const score = interceptor.scorer.scoreUrl(url);
                const shouldIntercept = score > 0.4;
                
                if (shouldIntercept) {
                    log('Fetch to potential ad URL:', url, 'score:', score);
                }
                
                const response = await originalFetch.apply(this, args);
                
                // Intercept response for potential ad URLs
                if (shouldIntercept && response.ok) {
                    try {
                        const clone = response.clone();
                        const contentType = clone.headers.get('content-type') || '';
                        
                        if (contentType.includes('application/json') || 
                            contentType.includes('text/') ||
                            url.includes('player') || 
                            url.includes('ads') ||
                            url.includes('api')) {
                            
                            const text = await clone.text();
                            const stripped = interceptor.stripper.parseAndStrip(text);
                            
                            if (stripped !== text) {
                                log('Stripped ad data from fetch response:', url);
                                
                                return new Response(stripped, {
                                    status: response.status,
                                    statusText: response.statusText,
                                    headers: new Headers(response.headers)
                                });
                            }
                        }
                    } catch (e) {
                        // Response interception failed, use original
                    }
                }
                
                return response;
            };
            
            log('Fetch interceptor installed');
        }
        
        interceptXHR() {
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;
            
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._ubor_url = url;
                this._ubor_score = url ? interceptor.scorer.scoreUrl(url) : 0;
                this._ubor_shouldIntercept = this._ubor_score > 0.4;
                
                if (this._ubor_shouldIntercept && !interceptor.scorer.isWhitelisted(url)) {
                    log('XHR to potential ad URL:', url, 'score:', this._ubor_score);
                }
                
                return originalOpen.apply(this, [method, url, ...rest]);
            };
            
            XMLHttpRequest.prototype.send = function(...args) {
                if (this._ubor_shouldIntercept && !interceptor.scorer.isWhitelisted(this._ubor_url)) {
                    this.addEventListener('load', function() {
                        if (this.status >= 200 && this.status < 300) {
                            const contentType = this.getResponseHeader('content-type') || '';
                            
                            if (contentType.includes('application/json') ||
                                contentType.includes('text/') ||
                                this._ubor_url?.includes('player') ||
                                this._ubor_url?.includes('ads') ||
                                this._ubor_url?.includes('api')) {
                                
                                try {
                                    const stripped = interceptor.stripper.parseAndStrip(this.responseText);
                                    
                                    if (stripped !== this.responseText) {
                                        log('Stripped ad data from XHR response:', this._ubor_url);
                                        
                                        Object.defineProperty(this, 'responseText', {
                                            value: stripped,
                                            writable: false
                                        });
                                        
                                        // Try to also update response if possible
                                        if (this.response !== undefined) {
                                            try {
                                                Object.defineProperty(this, 'response', {
                                                    value: stripped,
                                                    writable: false
                                                });
                                            } catch (e) {}
                                        }
                                    }
                                } catch (e) {
                                    // Failed to process
                                }
                            }
                        }
                    });
                }
                
                return originalSend.apply(this, args);
            };
            
            log('XHR interceptor installed');
        }
        
        initDOMObserver() {
            // Simple DOM observer for cosmetic filtering
            // This uses the existing cosmetic filtering from the main content script
            // Here we just identify potential ad containers for logging
            
            const observer = new MutationObserver((mutations) => {
                if (DEBUG) {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                for (const selector of CONFIG.adContainerSelectors) {
                                    if (node.matches && node.matches(selector)) {
                                        log('Found potential ad container:', selector);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            });
            
            // Start observing with minimal overhead
            // The actual cosmetic filtering is handled by the existing dom-filterer
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    if (document.body) {
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                });
            }
            
            log('DOM observer initialized (cosmetic filtering handled separately)');
        }
    }

    // Initialize
    const interceptor = new UniversalAdInterceptor();
    log('Universal Ad Interceptor ready');

})((typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self));