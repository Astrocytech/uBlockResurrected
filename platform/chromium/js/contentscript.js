(() => {
  // contentscript/01-vapi-extensions.ts
  if (typeof vAPI !== "undefined") {
    {
      let context = self;
      try {
        while (context !== self.top && context.location.href.startsWith("about:blank") && context.parent.location.href) {
          context = context.parent;
        }
      } catch {
      }
      vAPI.effectiveSelf = context;
    }
    vAPI.userStylesheet = {
      added: /* @__PURE__ */ new Set(),
      removed: /* @__PURE__ */ new Set(),
      apply(callback) {
        if (this.added.size === 0 && this.removed.size === 0) {
          return;
        }
        vAPI.messaging.send("vapi", {
          what: "userCSS",
          add: Array.from(this.added),
          remove: Array.from(this.removed)
        }).then(() => {
          if (typeof callback !== "function") {
            return;
          }
          callback();
        });
        this.added.clear();
        this.removed.clear();
      },
      add(cssText, now) {
        if (cssText === "") {
          return;
        }
        this.added.add(cssText);
        if (now) {
          this.apply();
        }
      },
      remove(cssText, now) {
        if (cssText === "") {
          return;
        }
        this.removed.add(cssText);
        if (now) {
          this.apply();
        }
      }
    };
    vAPI.SafeAnimationFrame = class SafeAnimationFrame {
      fid;
      tid;
      callback;
      constructor(callback) {
        this.fid = void 0;
        this.tid = void 0;
        this.callback = callback;
      }
      start(delay) {
        if (vAPI instanceof Object === false) {
          return;
        }
        if (delay === void 0) {
          if (this.fid === void 0) {
            this.fid = requestAnimationFrame(() => {
              this.onRAF();
            });
          }
          if (this.tid === void 0) {
            this.tid = vAPI.setTimeout(() => {
              this.onSTO();
            }, 2e4);
          }
          return;
        }
        if (this.fid === void 0 && this.tid === void 0) {
          this.tid = vAPI.setTimeout(() => {
            this.macroToMicro();
          }, delay);
        }
      }
      clear() {
        if (this.fid !== void 0) {
          cancelAnimationFrame(this.fid);
          this.fid = void 0;
        }
        if (this.tid !== void 0) {
          clearTimeout(this.tid);
          this.tid = void 0;
        }
      }
      macroToMicro() {
        this.tid = void 0;
        this.start();
      }
      onRAF() {
        if (this.tid !== void 0) {
          clearTimeout(this.tid);
          this.tid = void 0;
        }
        this.fid = void 0;
        this.callback();
      }
      onSTO() {
        if (this.fid !== void 0) {
          cancelAnimationFrame(this.fid);
          this.fid = void 0;
        }
        this.tid = void 0;
        this.callback();
      }
    };
  }

  // contentscript/yt-ad-blocker.ts
  ((self2) => {
    "use strict";
    const DEBUG = true;
    const log = (...args) => {
      console.log("[YT-AB]", ...args);
    };
    log("YouTube Ad Blocker starting...");
    log("Global:", typeof self2, "Window:", typeof window);
    const isYouTube = () => {
      return window.location.hostname.includes("youtube.com") && !window.location.hostname.includes("youtu.be");
    };
    const AD_KEYS = [
      "adPlacements",
      "playerAds",
      "adSlots",
      "adBreakHeartbeatParams",
      "adServerLogger",
      "playerResponse",
      "adBreakOverlays",
      "instreamVideoAds"
    ];
    const AD_PATTERNS_TO_CHECK = ["adPlacements", "playerAds", "adSlots"];
    const AD_PATTERNS = ["adPlacements", "playerAds", "adSlots", "adBreak"];
    const stripAdDataFromObject = (obj, depth = 0) => {
      if (obj === null || obj === void 0) return obj;
      if (depth > 20) return obj;
      if (typeof obj !== "object") return obj;
      const newObj = Array.isArray(obj) ? [] : {};
      for (const key of Object.keys(obj)) {
        const lowerKey = key.toLowerCase();
        const isAdKey = AD_KEYS.includes(key);
        if (isAdKey) {
          log("Stripping ad key:", key);
          continue;
        }
        try {
          newObj[key] = stripAdDataFromObject(obj[key], depth + 1);
        } catch (e) {
          newObj[key] = obj[key];
        }
      }
      return newObj;
    };
    const hasAdPattern = (text) => {
      return AD_PATTERNS.some((p) => text.includes(`"${p}"`));
    };
    const parseAndStripResponse = (text) => {
      try {
        if (!hasAdPattern(text)) return text;
        const json = JSON.parse(text);
        const stripped = stripAdDataFromObject(json);
        return JSON.stringify(stripped);
      } catch (e) {
        return text;
      }
    };
    const initJsonParseInterceptor = () => {
      const originalParse = JSON.parse;
      JSON.parse = function(text, reviver) {
        try {
          const parsed = originalParse.call(this, text, reviver);
          if (isYouTube() && typeof parsed === "object" && parsed !== null) {
            if (hasAdPattern(text)) {
              log("JSON.parse: Found ad data in YouTube response");
              return stripAdDataFromObject(parsed);
            }
          }
          return parsed;
        } catch (e) {
          return originalParse.call(this, text, reviver);
        }
      };
      log("JSON.parse interceptor initialized");
    };
    initJsonParseInterceptor();
    const initFetchInterceptor = () => {
      const originalFetch = self2.fetch;
      self2.fetch = async function(...args) {
        const [resource, options] = args;
        const url = typeof resource === "string" ? resource : resource.url;
        const isYouTubeApi = url && (url.includes("youtube.com/youtubei/v1/player") || url.includes("youtube.com/apiManifest") || url.includes("googlevideo.com") && url.includes("ad"));
        if (isYouTubeApi) {
          log("Fetch to YouTube API:", url.substring(0, 80));
        }
        const response = await originalFetch.apply(this, args);
        if (isYouTubeApi && response.ok) {
          try {
            const clone = response.clone();
            const text = await clone.text();
            if (hasAdPattern(text)) {
              const stripped = parseAndStripResponse(text);
              log("Returning stripped response");
              return new Response(stripped, {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers)
              });
            }
          } catch (e) {
            log("Failed to process fetch response:", e);
          }
        }
        return response;
      };
      log("Fetch interceptor initialized");
    };
    const initXHRInterceptor = () => {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._isYouTubeApi = url && (url.includes("youtube.com/youtubei/v1/player") || url.includes("youtube.com/apiManifest"));
        this._url = url;
        return originalOpen.apply(this, [method, url, ...rest]);
      };
      XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        this._headers = this._headers || {};
        this._headers[header.toLowerCase()] = value;
        return originalSetHeader.apply(this, [header, value]);
      };
      XMLHttpRequest.prototype.send = function(...args) {
        if (this._isYouTubeApi) {
          log("XHR to YouTube API:", this._url);
          this.addEventListener("load", () => {
            if (this.responseType === "" || this.responseType === "text") {
              const text = this.responseText;
              if (hasAdPattern(text)) {
                const stripped = parseAndStripResponse(text);
                try {
                  Object.defineProperty(this, "responseText", {
                    value: stripped,
                    writable: false,
                    configurable: true
                  });
                  Object.defineProperty(this, "response", {
                    value: stripped,
                    writable: false,
                    configurable: true
                  });
                  log("XHR response stripped for ads");
                } catch (e) {
                  log("Failed to override responseText:", e);
                }
              }
            }
          });
        }
        return originalSend.apply(this, args);
      };
      log("XHR interceptor initialized");
    };
    const initPlayerResponseInterceptor = () => {
      const scriptSelectors = [
        "#ytinitialplayerresponse",
        "#ytinitial-data",
        'script[data-target="ytinitialplayerresponse"]'
      ];
      const checkForPlayerResponse = () => {
        for (const selector of scriptSelectors) {
          const scripts = document.querySelectorAll(selector);
          for (const script of scripts) {
            try {
              const text = script.textContent;
              if (hasAdPattern(text)) {
                const stripped = parseAndStripResponse(text);
                if (stripped !== text) {
                  script.textContent = stripped;
                  log("Stripped player response from script:", selector);
                }
              }
            } catch (e) {
              log("Failed to process script:", e);
            }
          }
        }
      };
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                for (const selector of scriptSelectors) {
                  if (node.matches && node.matches(selector)) {
                    checkForPlayerResponse();
                  }
                  const scripts = node.querySelectorAll ? node.querySelectorAll(selector) : [];
                  for (const script of scripts) {
                    try {
                      const text = script.textContent;
                      if (hasAdPattern(text)) {
                        const stripped = parseAndStripResponse(text);
                        if (stripped !== text) {
                          script.textContent = stripped;
                          log("Stripped player response from dynamic script");
                        }
                      }
                    } catch (e) {
                    }
                  }
                }
              }
            }
          }
        }
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
      checkForPlayerResponse();
      log("Player response interceptors initialized");
    };
    const initWindowVariableInterceptor = () => {
      const variableNames = [
        "ytInitialPlayerResponse",
        "ytInitialData",
        "playerResponse"
      ];
      const checkAndNeuter = () => {
        for (const name of variableNames) {
          if (window[name] !== void 0) {
            try {
              const val = window[name];
              if (val && typeof val === "object") {
                const str = JSON.stringify(val);
                if (str.includes('"adPlacements"') || str.includes('"playerAds"') || str.includes('"adSlots"')) {
                  const stripped = stripAdDataFromObject(val);
                  window[name] = stripped;
                  log("Neutered window." + name);
                }
              }
            } catch (e) {
              log("Failed to neuter", name, e);
            }
          }
        }
      };
      const interval = setInterval(checkAndNeuter, 100);
      setTimeout(() => clearInterval(interval), 1e4);
      checkAndNeuter();
      log("Window variable interceptor initialized");
    };
    const init = () => {
      if (!isYouTube()) {
        log("Not YouTube, skipping");
        return;
      }
      log("YouTube detected, initializing ad blockers");
      log("Hostname:", window.location.hostname);
      log("HREF:", window.location.href);
      log("Document state:", document.readyState);
      initJsonParseInterceptor();
      initFetchInterceptor();
      initXHRInterceptor();
      initPlayerResponseInterceptor();
      initWindowVariableInterceptor();
      log("All YouTube ad blocking initialized");
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })(
    typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : self
  );

  // contentscript/yandex-blocker.ts
  ((self2) => {
    "use strict";
    const log = (...args) => console.log("[YN-AB]", ...args);
    const isYandexVideo = () => {
      const h = window.location.hostname;
      return h.includes("yandex.ru") || h.includes("yandex.com");
    };
    const AD_KEYS = [
      "adPlacements",
      "playerAds",
      "adSlots",
      "preroll",
      "adBreaks",
      "ad",
      "ads",
      "advertising"
    ];
    const AD_URLS = ["yandex.ru/ads", "adfox", "/adsdk"];
    const stripAdKeys = (obj, depth = 0) => {
      if (obj === null || obj === void 0) return obj;
      if (depth > 15) return obj;
      if (typeof obj !== "object") return obj;
      const newObj = Array.isArray(obj) ? [] : {};
      for (const key of Object.keys(obj)) {
        if (AD_KEYS.includes(key)) {
          log("Stripping:", key);
          continue;
        }
        try {
          newObj[key] = stripAdKeys(obj[key], depth + 1);
        } catch {
          newObj[key] = obj[key];
        }
      }
      return newObj;
    };
    const init = () => {
      if (!isYandexVideo()) return;
      log("Yandex detected, setting up ad blocker");
      const originalFetch = self2.fetch;
      self2.fetch = async function(...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        const isAdRequest = url && (url.includes("yandex.ru/ads") || url.includes("adfox") || url.includes("/adsdk"));
        const resp = await originalFetch.apply(this, args);
        if (isAdRequest && resp.ok) {
          try {
            const clone = resp.clone();
            const text = await clone.text();
            const hasAd = AD_KEYS.some((k) => text.includes(`"${k}"`));
            if (hasAd) {
              log("Stripping ads from fetch");
              const json = JSON.parse(text);
              const stripped = stripAdKeys(json);
              return new Response(JSON.stringify(stripped), {
                status: resp.status,
                statusText: resp.statusText,
                headers: resp.headers
              });
            }
          } catch {
          }
        }
        return resp;
      };
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        this._isYandexAd = url && (url.includes("yandex.ru/ads") || url.includes("adfox"));
        return origOpen.apply(this, arguments);
      };
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function() {
        if (this._isYandexAd) {
          this.addEventListener("load", () => {
            try {
              const text = this.responseText;
              const hasAd = AD_KEYS.some((k) => text.includes(`"${k}"`));
              if (hasAd) {
                log("Stripping ads from XHR");
                const json = JSON.parse(text);
                const stripped = stripAdKeys(json);
                Object.defineProperty(this, "responseText", {
                  value: JSON.stringify(stripped),
                  writable: false,
                  configurable: true
                });
              }
            } catch {
            }
          });
        }
        return origSend.apply(this, arguments);
      };
      log("Yandex ad blocker initialized");
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })(typeof window !== "undefined" ? window : self);

  // contentscript/universal-ad-interceptor.ts
  ((self2) => {
    "use strict";
    const DEBUG = false;
    const LOG_PREFIX = "[UAi] Universal Ad Interceptor:";
    const log = (...args) => {
      if (DEBUG) {
        console.log(LOG_PREFIX, ...args);
      }
    };
    const CONFIG = {
      // Known ad network domains (partial matches)
      adDomains: [
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "googleads.g.doubleclick.net",
        "adsense.google.com",
        "adnxs.com",
        "adnexus.net",
        "adnxs.org",
        "amazon-adsystem.com",
        "amazonadsystem.com",
        "advertising.com",
        "adtech.com",
        "adtechus.com",
        "adform.net",
        "adform.com",
        "pubmatic.com",
        "pubmatic.io",
        "rubiconproject.com",
        "rubicon.com",
        "openx.net",
        "openx.com",
        "indexexchange.com",
        "indexexchange.io",
        "criteo.com",
        "criteo.fr",
        "taboola.com",
        "taboola.com.cn",
        "outbrain.com",
        "outbrainimg.com",
        "mgid.com",
        "adsrvr.org",
        "adsrvr.com",
        "adcolony.com",
        "admob.com",
        "unity3d.com/ads",
        "unityads.unity3d.com",
        "moatads.com",
        "moat.com",
        "scorecardresearch.com",
        "quantserve.com",
        "adform.net",
        "adtech.de",
        "bidswitch.net",
        "casalemedia.com",
        "contextweb.com",
        "conversantmedia.com",
        "demdex.net",
        "exelator.com",
        "eyeota.net",
        "krxd.net",
        "lijit.com",
        "liveramp.com",
        "mathtag.com",
        "mediamath.com",
        "mxptint.net",
        "nativo.com",
        "openx.net",
        "pardot.com",
        "rfihub.com",
        "richrelevance.com",
        "rfihub.com",
        "rlcdn.com",
        "rubiconproject.com",
        "sharethrough.com",
        "simpli.fi",
        "sitescout.com",
        "smartadserver.com",
        "spotxchange.com",
        "stackadapt.com",
        "steelhousemedia.com",
        "stickyadstv.com",
        "taboola.com",
        "teads.tv",
        "tribalfusion.com",
        "triplelift.com",
        "turn.com",
        "undertone.com",
        "yahoo.com/ads",
        "yieldmo.com",
        "zeotap.com",
        // Video ads
        "ima3.js",
        "googlevideo.com/ad",
        "vast",
        "vmgcp",
        // Social ads
        "facebook.com/tr",
        "facebook.com/ads",
        "connect.facebook.net",
        "linkedin.com/ads",
        "twitter.com/ads"
      ],
      // URL patterns that indicate ad requests
      adUrlPatterns: [
        /\/ads\//i,
        /\/ad\/ /i,
        /\/advert/i,
        /\/adview/i,
        /\/adclick/i,
        /\/adframe/i,
        /\/adbanner/i,
        /\/sponsor/i,
        /\/promoted/i,
        /\/api\/ads/i,
        /\/api\/ad/i,
        /\/ads\/api/i,
        /\/adservice/i,
        /\/ad-serving/i,
        /\/adsense/i,
        /\/dfp\//i,
        /\/gpt\//i,
        /pagead/i,
        /\/pagead2\//i,
        /\/pubads\//i,
        /\/cmad/i,
        /bid/i,
        /\/bidder/i,
        /\/bids/i,
        /prebid/i,
        /rubicon/i,
        /\/vast\//i,
        /\/vmap\//i,
        /\/syndication\//i
      ],
      // JSON keys that indicate ad data
      adJSONKeys: [
        "adPlacements",
        "playerAds",
        "adSlots",
        "adBreakHeartbeatParams",
        "adServerLogger",
        "adSlotId",
        "adSlotId",
        "adUnitId",
        "ads",
        "advertisements",
        "advertising",
        "sponsored",
        "sponsoredContent",
        "sponsoredLinks",
        "promoted",
        "promotedContent",
        "isAd",
        "isAdvertisement",
        "isSponsored",
        "adMetadata",
        "adData",
        "adContext",
        "adTracking",
        "adImpressions",
        "googleAds",
        "dfpAds",
        "gptAds"
      ],
      // Tracking parameter patterns
      trackingParams: [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
        "gclsrc",
        "dclid",
        "msclkid",
        "mc_eid",
        "mc_cid",
        "ref",
        "ref_src",
        "ref_url",
        "_hsenc",
        "_hsmi",
        "vero_id",
        "vero_conv",
        "wickedid",
        "wbraid",
        "gbraid"
      ],
      // Whitelist - known non-ad domains that might trigger heuristics
      whitelist: [
        "google.com",
        "googleapis.com",
        "googletagmanager.com",
        "facebook.com",
        "facebook.net",
        "connect.facebook.net",
        "twitter.com",
        "linkedin.com",
        "instagram.com",
        "github.com",
        "github.io",
        "githubusercontent.com",
        "cdn.jsdelivr.net",
        "unpkg.com",
        "raw.githubusercontent.com",
        "reddit.com",
        "redditstatic.com",
        "wikipedia.org",
        "wikimedia.org",
        "cloudflare.com",
        "cloudfront.net"
      ],
      // DOM selectors for common ad containers (for cosmetic filtering)
      adContainerSelectors: [
        // Generic
        '[class*="ad-"]',
        '[class*="-ad"]',
        '[class*="advert"]',
        '[id*="ad-"]',
        '[id*="-ad"]',
        '[id*="advert"]',
        "[data-ad]",
        "[data-ad-slot]",
        "[data-ad-client]",
        // Google
        ".adsbygoogle",
        "ins.adsbygoogle",
        '[id^="google_ads"]',
        '[id^="div-gpt-ad"]',
        ".dfp-ad",
        // Common ad networks
        ".taboola",
        "#taboola",
        '[id*="taboola"]',
        ".outbrain",
        "#outbrain",
        '[id*="outbrain"]',
        ".mgid",
        "#mgid",
        // Generic ad containers
        ".ad-container",
        ".ad-wrapper",
        ".ad-box",
        ".ad-banner",
        ".ad-slot",
        ".ad-unit",
        ".advertisement",
        ".sponsored-content",
        'iframe[src*="ads"]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]'
      ]
    };
    class HeuristicScorer {
      constructor(config) {
        this.config = config;
      }
      scoreUrl(url) {
        if (!url) return 0;
        const urlLower = url.toLowerCase();
        let score = 0;
        for (const domain of this.config.adDomains) {
          if (urlLower.includes(domain.toLowerCase())) {
            score += 0.5;
            break;
          }
        }
        for (const pattern of this.config.adUrlPatterns) {
          if (pattern.test(url)) {
            score += 0.3;
            break;
          }
        }
        if (/\d{4,}/.test(url)) score += 0.1;
        if (/[?&](ad|ads)=/.test(url)) score += 0.2;
        return Math.min(score, 1);
      }
      isWhitelisted(url) {
        if (!url) return false;
        const urlLower = url.toLowerCase();
        return this.config.whitelist.some(
          (domain) => urlLower.includes(domain.toLowerCase())
        );
      }
    }
    class AdDataStripper {
      constructor(config) {
        this.config = config;
      }
      shouldStripKey(key) {
        return this.config.adJSONKeys.some(
          (adKey) => key.toLowerCase().includes(adKey.toLowerCase())
        );
      }
      strip(obj) {
        if (obj === null || obj === void 0) return obj;
        if (typeof obj !== "object") return obj;
        const isArray = Array.isArray(obj);
        const result = isArray ? [] : {};
        for (const key of Object.keys(obj)) {
          if (this.shouldStripKey(key)) {
            log("Stripping ad key:", key);
            continue;
          }
          try {
            result[key] = this.strip(obj[key]);
          } catch (e) {
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
          return text;
        }
      }
    }
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
        log("Initialized universal ad interceptor");
      }
      interceptFetch() {
        const originalFetch = self2.fetch;
        self2.fetch = async function(...args) {
          const [resource, options] = args;
          const url = typeof resource === "string" ? resource : resource?.url;
          if (url && interceptor.scorer.isWhitelisted(url)) {
            return originalFetch.apply(this, args);
          }
          const score = interceptor.scorer.scoreUrl(url);
          const shouldIntercept = score > 0.4;
          if (shouldIntercept) {
            log("Fetch to potential ad URL:", url, "score:", score);
          }
          const response = await originalFetch.apply(this, args);
          if (shouldIntercept && response.ok) {
            try {
              const clone = response.clone();
              const contentType = clone.headers.get("content-type") || "";
              if (contentType.includes("application/json") || contentType.includes("text/") || url.includes("player") || url.includes("ads") || url.includes("api")) {
                const text = await clone.text();
                const stripped = interceptor.stripper.parseAndStrip(text);
                if (stripped !== text) {
                  log("Stripped ad data from fetch response:", url);
                  return new Response(stripped, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: new Headers(response.headers)
                  });
                }
              }
            } catch (e) {
            }
          }
          return response;
        };
        log("Fetch interceptor installed");
      }
      interceptXHR() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this._ubor_url = url;
          this._ubor_score = url ? interceptor.scorer.scoreUrl(url) : 0;
          this._ubor_shouldIntercept = this._ubor_score > 0.4;
          if (this._ubor_shouldIntercept && !interceptor.scorer.isWhitelisted(url)) {
            log("XHR to potential ad URL:", url, "score:", this._ubor_score);
          }
          return originalOpen.apply(this, [method, url, ...rest]);
        };
        XMLHttpRequest.prototype.send = function(...args) {
          if (this._ubor_shouldIntercept && !interceptor.scorer.isWhitelisted(this._ubor_url)) {
            this.addEventListener("load", function() {
              if (this.status >= 200 && this.status < 300) {
                const contentType = this.getResponseHeader("content-type") || "";
                if (contentType.includes("application/json") || contentType.includes("text/") || this._ubor_url?.includes("player") || this._ubor_url?.includes("ads") || this._ubor_url?.includes("api")) {
                  try {
                    const stripped = interceptor.stripper.parseAndStrip(this.responseText);
                    if (stripped !== this.responseText) {
                      log("Stripped ad data from XHR response:", this._ubor_url);
                      Object.defineProperty(this, "responseText", {
                        value: stripped,
                        writable: false
                      });
                      if (this.response !== void 0) {
                        try {
                          Object.defineProperty(this, "response", {
                            value: stripped,
                            writable: false
                          });
                        } catch (e) {
                        }
                      }
                    }
                  } catch (e) {
                  }
                }
              }
            });
          }
          return originalSend.apply(this, args);
        };
        log("XHR interceptor installed");
      }
      initDOMObserver() {
        const observer = new MutationObserver((mutations) => {
          if (DEBUG) {
            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  for (const selector of CONFIG.adContainerSelectors) {
                    if (node.matches && node.matches(selector)) {
                      log("Found potential ad container:", selector);
                      break;
                    }
                  }
                }
              }
            }
          }
        });
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
        } else {
          document.addEventListener("DOMContentLoaded", () => {
            if (document.body) {
              observer.observe(document.body, { childList: true, subtree: true });
            }
          });
        }
        log("DOM observer initialized (cosmetic filtering handled separately)");
      }
    }
    const interceptor = new UniversalAdInterceptor();
    log("Universal Ad Interceptor ready");
  })(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : self);

  // contentscript/first-party-ad-detector.ts
  ((self2) => {
    "use strict";
    const DEBUG = false;
    const LOG_PREFIX = "[FPAD] First-Party Ad Detector:";
    const log = (...args) => {
      if (DEBUG) {
        console.log(LOG_PREFIX, ...args);
      }
    };
    const CONFIG = {
      // Attributes that indicate ad containers
      adAttributes: [
        "data-ad",
        "data-ad-slot",
        "data-ad-client",
        "data-ad-unit",
        "data-advertisement",
        "data-advert",
        "data-ads",
        "data-ad-id",
        "data-google-query-id",
        "data-ad-status",
        "data-slot",
        "data-adunit",
        "data-dfp",
        "data-gpt"
      ],
      // ID patterns for ad containers
      adIdPatterns: [
        /^ad[-_]/i,
        /^ads[-_]/i,
        /^advert/i,
        /^sponsor/i,
        /[-_]ad$/i,
        /[-_]ads$/i,
        /[-_]advert/i,
        /^div[-_]gpt/i,
        /^google_ads/i,
        /^dfp[-_]/i,
        /adunit/i,
        /adslot/i,
        /adcontainer/i
      ],
      // Class patterns for ad containers
      adClassPatterns: [
        /^ad[-_]/i,
        /^ads[-_]/i,
        /^advert/i,
        /^sponsor/i,
        /[-_]ad$/i,
        /[-_]ads$/i,
        /[-_]advert/i,
        /ad[-_]?container/i,
        /ad[-_]?wrapper/i,
        /ad[-_]?box/i,
        /ad[-_]?banner/i,
        /ad[-_]?slot/i,
        /ad[-_]?unit/i,
        /ad[-_]?placeholder/i,
        /advertisement/i,
        /dfp[-_]/i,
        /gpt[-_]/i,
        /google[-_]?ads/i,
        /sponsored[-_]?content/i,
        /promoted[-_]?content/i
      ],
      // Known ad network iframe patterns
      adIframePatterns: [
        /doubleclick\.net/i,
        /googlesyndication/i,
        /googleadservices/i,
        /adnxs/i,
        /criteo/i,
        /taboola/i,
        /outbrain/i,
        /amazon-adsystem/i,
        /pubmatic/i,
        /rubicon/i,
        /facebook\.com\/ads/i,
        /linkedin/i,
        /twitter/i
      ],
      // Text patterns that indicate ad content
      adTextPatterns: [
        "advertisement",
        "advertisement",
        "sponsored",
        "ad",
        "ads",
        "advert",
        "promoted",
        "Advertisement",
        "Sponsored"
      ],
      // Elements commonly used for ads
      adElementTypes: [
        "ins",
        // Google AdSense
        "iframe"
        // Ad iframes
      ],
      // Mutation observer config
      observerConfig: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["id", "class", "data-ad", "data-ads"]
      },
      // Debounce delay for mutation processing
      debounceMs: 100
    };
    class FirstPartyAdDetector {
      constructor() {
        this.observer = null;
        this.pendingNodes = /* @__PURE__ */ new Set();
        this.debounceTimer = null;
        this.init();
      }
      init() {
        if (document.body) {
          this.startObserver();
        } else {
          document.addEventListener("DOMContentLoaded", () => this.startObserver());
        }
        this.scanDocument();
        log("First-party ad detector initialized");
      }
      startObserver() {
        this.observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === "childList") {
              for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  this.queueNode(node);
                }
              }
            } else if (mutation.type === "attributes") {
              if (mutation.target.nodeType === Node.ELEMENT_NODE) {
                this.queueNode(mutation.target);
              }
            }
          }
          this.scheduleProcessing();
        });
        this.observer.observe(document.documentElement, CONFIG.observerConfig);
        log("Mutation observer started");
      }
      queueNode(node) {
        this.pendingNodes.add(node);
      }
      scheduleProcessing() {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.processPendingNodes();
        }, CONFIG.debounceMs);
      }
      processPendingNodes() {
        const nodes = Array.from(this.pendingNodes);
        this.pendingNodes.clear();
        for (const node of nodes) {
          this.analyzeNode(node);
        }
      }
      analyzeNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const tagName = node.tagName?.toLowerCase() || "";
        if (CONFIG.adElementTypes.includes(tagName)) {
          log("Found ad element type:", tagName);
          this.handleAdElement(node);
          return;
        }
        const id = node.getAttribute("id") || "";
        for (const pattern of CONFIG.adIdPatterns) {
          if (pattern.test(id)) {
            log("Found ad by ID pattern:", id);
            this.handleAdElement(node);
            return;
          }
        }
        const className = node.getAttribute("class") || "";
        for (const pattern of CONFIG.adClassPatterns) {
          if (pattern.test(className)) {
            log("Found ad by class pattern:", className.substring(0, 50));
            this.handleAdElement(node);
            return;
          }
        }
        for (const attr of CONFIG.adAttributes) {
          if (node.hasAttribute(attr)) {
            log("Found ad by attribute:", attr);
            this.handleAdElement(node);
            return;
          }
        }
        if (tagName === "iframe") {
          const src = node.getAttribute("src") || "";
          for (const pattern of CONFIG.adIframePatterns) {
            if (pattern.test(src)) {
              log("Found ad iframe by src pattern");
              this.handleAdElement(node);
              return;
            }
          }
        }
      }
      handleAdElement(node) {
        node.classList.add("ubor-ad-detected");
        log("Detected ad element:", node.tagName, node.getAttribute("id") || node.getAttribute("class")?.substring(0, 30));
      }
      scanDocument() {
        const allElements = document.querySelectorAll("*");
        let count = 0;
        for (const el of allElements) {
          this.analyzeNode(el);
          count++;
        }
        log("Scanned", count, "elements");
      }
      // Check if element contains "sponsored" or similar text
      containsAdText(element) {
        const text = element.textContent?.toLowerCase() || "";
        for (const pattern of CONFIG.adTextPatterns) {
          if (text.includes(pattern.toLowerCase())) {
            return true;
          }
        }
        return false;
      }
      destroy() {
        if (this.observer) {
          this.observer.disconnect();
        }
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        log("Detector destroyed");
      }
    }
    const detector = new FirstPartyAdDetector();
    log("First-party ad detector ready");
  })(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : self);

  // contentscript/04-dom-filterer.ts
  var DOMFilterer = class {
    commitTimer;
    disabled;
    listeners;
    stylesheets;
    exceptedCSSRules;
    exceptions;
    convertedProceduralFilters;
    proceduralFilterer;
    constructor() {
      this.commitTimer = new vAPI.SafeAnimationFrame(
        () => {
          this.commitNow();
        }
      );
      this.disabled = false;
      this.listeners = [];
      this.stylesheets = [];
      this.exceptedCSSRules = [];
      this.exceptions = [];
      this.convertedProceduralFilters = [];
      this.proceduralFilterer = null;
    }
    explodeCSS(css) {
      const out = [];
      const cssHide = `{${vAPI.hideStyle}}`;
      const blocks = css.trim().split(/\n\n+/);
      for (const block of blocks) {
        if (block.endsWith(cssHide) === false) {
          continue;
        }
        out.push(block.slice(0, -cssHide.length).trim());
      }
      return out;
    }
    addCSS(css, details = {}) {
      if (typeof css !== "string" || css.length === 0) {
        return;
      }
      if (this.stylesheets.includes(css)) {
        return;
      }
      this.stylesheets.push(css);
      if (details.mustInject && this.disabled === false) {
        vAPI.userStylesheet.add(css);
      }
      if (this.hasListeners() === false) {
        return;
      }
      if (details.silent) {
        return;
      }
      this.triggerListeners({ declarative: this.explodeCSS(css) });
    }
    exceptCSSRules(exceptions) {
      if (exceptions.length === 0) {
        return;
      }
      this.exceptedCSSRules.push(...exceptions);
      if (this.hasListeners()) {
        this.triggerListeners({ exceptions });
      }
    }
    addListener(listener) {
      if (this.listeners.indexOf(listener) !== -1) {
        return;
      }
      this.listeners.push(listener);
    }
    removeListener(listener) {
      const pos = this.listeners.indexOf(listener);
      if (pos === -1) {
        return;
      }
      this.listeners.splice(pos, 1);
    }
    hasListeners() {
      return this.listeners.length !== 0;
    }
    triggerListeners(changes) {
      for (const listener of this.listeners) {
        listener.onFiltersetChanged(changes);
      }
    }
    toggle(state, callback) {
      if (state === void 0) {
        state = this.disabled;
      }
      if (state !== this.disabled) {
        return;
      }
      this.disabled = !state;
      const uss = vAPI.userStylesheet;
      for (const css of this.stylesheets) {
        if (this.disabled) {
          uss.remove(css);
        } else {
          uss.add(css);
        }
      }
      uss.apply(callback);
    }
    commitNow() {
      this.commitTimer.clear();
      if (vAPI instanceof Object === false) {
        return;
      }
      vAPI.userStylesheet.apply();
      if (this.proceduralFilterer instanceof Object) {
        this.proceduralFilterer.commitNow();
      }
    }
    commit(commitNow) {
      if (commitNow) {
        this.commitTimer.clear();
        this.commitNow();
      } else {
        this.commitTimer.start();
      }
    }
    proceduralFiltererInstance() {
      if (this.proceduralFilterer instanceof Object === false) {
        if (vAPI.DOMProceduralFilterer instanceof Object === false) {
          return null;
        }
        this.proceduralFilterer = new vAPI.DOMProceduralFilterer(this);
      }
      return this.proceduralFilterer;
    }
    addProceduralSelectors(selectors) {
      const procedurals = [];
      for (const raw of selectors) {
        procedurals.push(JSON.parse(raw));
      }
      if (procedurals.length === 0) {
        return;
      }
      const pfilterer = this.proceduralFiltererInstance();
      if (pfilterer !== null) {
        pfilterer.addProceduralSelectors(procedurals);
      }
    }
    createProceduralFilter(o) {
      const pfilterer = this.proceduralFiltererInstance();
      if (pfilterer === null) {
        return;
      }
      return pfilterer.createProceduralFilter(o);
    }
    getAllSelectors(bits = 0) {
      const out = {
        declarative: [],
        exceptions: this.exceptedCSSRules
      };
      const hasProcedural = this.proceduralFilterer instanceof Object;
      const includePrivateSelectors = (bits & 1) !== 0;
      const masterToken = hasProcedural ? `[${this.proceduralFilterer.masterToken}]` : void 0;
      for (const css of this.stylesheets) {
        for (const block of this.explodeCSS(css)) {
          if (includePrivateSelectors === false && masterToken !== void 0 && block.startsWith(masterToken)) {
            continue;
          }
          out.declarative.push(block);
        }
      }
      const excludeProcedurals = (bits & 2) !== 0;
      if (excludeProcedurals === false) {
        out.procedural = [];
        if (hasProcedural) {
          out.procedural.push(
            ...this.proceduralFilterer.selectors.values()
          );
        }
        const proceduralFilterer = this.proceduralFiltererInstance();
        if (proceduralFilterer !== null) {
          for (const json of this.convertedProceduralFilters) {
            const pfilter = proceduralFilterer.createProceduralFilter(json);
            pfilter.converted = true;
            out.procedural.push(pfilter);
          }
        }
      }
      return out;
    }
    getAllExceptionSelectors() {
      return this.exceptions.join(",\n");
    }
  };
  function initDOMFilterer() {
    vAPI.hideStyle = "display:none!important;";
    vAPI.DOMFilterer = DOMFilterer;
    return vAPI.DOMFilterer;
  }

  // contentscript/02-csp-listener.ts
  function initCSPlistener() {
    const newEvents = /* @__PURE__ */ new Set();
    const allEvents = /* @__PURE__ */ new Set();
    let timer;
    const send = function() {
      if (vAPI instanceof Object === false) {
        return;
      }
      Promise.resolve(vAPI.messaging?.send?.("scriptlets", {
        what: "securityPolicyViolation",
        type: "net",
        docURL: document.location.href,
        violations: Array.from(newEvents)
      })).then((response) => {
        if (response === true) {
          return;
        }
        stop();
      }).catch(() => {
      });
      for (const event of newEvents) {
        allEvents.add(event);
      }
      newEvents.clear();
    };
    const sendAsync = function() {
      if (timer !== void 0) {
        return;
      }
      timer = self.requestIdleCallback(
        () => {
          timer = void 0;
          send();
        },
        { timeout: 2063 }
      );
    };
    const listener = function(ev) {
      const cspEv = ev;
      if (cspEv.isTrusted !== true) {
        return;
      }
      if (cspEv.disposition !== "enforce") {
        return;
      }
      const json = JSON.stringify({
        url: cspEv.blockedURL || cspEv.blockedURI,
        policy: cspEv.originalPolicy,
        directive: cspEv.effectiveDirective || cspEv.violatedDirective
      });
      if (allEvents.has(json)) {
        return;
      }
      newEvents.add(json);
      sendAsync();
    };
    const stop = function() {
      newEvents.clear();
      allEvents.clear();
      if (timer !== void 0) {
        self.cancelIdleCallback(timer);
        timer = void 0;
      }
      document.removeEventListener("securitypolicyviolation", listener);
      if (vAPI?.shutdown?.remove instanceof Function) {
        vAPI.shutdown.remove(stop);
      }
    };
    document.addEventListener("securitypolicyviolation", listener);
    if (vAPI?.shutdown?.add instanceof Function) {
      vAPI.shutdown.add(stop);
    }
    sendAsync();
  }

  // contentscript/03-dom-watcher.ts
  function initDOMWatcher(afterInit) {
    vAPI.domMutationTime = Date.now();
    const addedNodeLists = [];
    const removedNodeLists = [];
    const addedNodes = [];
    const ignoreTags = /* @__PURE__ */ new Set(["br", "head", "link", "meta", "script", "style"]);
    const listeners = [];
    let domLayoutObserver;
    let listenerIterator = [];
    let listenerIteratorDirty = false;
    let removedNodes = false;
    let safeObserverHandlerTimer;
    const safeObserverHandler = function() {
      let i = addedNodeLists.length;
      while (i--) {
        const nodeList = addedNodeLists[i];
        let iNode = nodeList.length;
        while (iNode--) {
          const node = nodeList[iNode];
          if (node.nodeType !== 1) {
            continue;
          }
          if (ignoreTags.has(node.localName)) {
            continue;
          }
          if (node.parentElement === null) {
            continue;
          }
          addedNodes.push(node);
        }
      }
      addedNodeLists.length = 0;
      i = removedNodeLists.length;
      while (i-- && removedNodes === false) {
        const nodeList = removedNodeLists[i];
        let iNode = nodeList.length;
        while (iNode--) {
          if (nodeList[iNode].nodeType !== 1) {
            continue;
          }
          removedNodes = true;
          break;
        }
      }
      removedNodeLists.length = 0;
      if (addedNodes.length === 0 && removedNodes === false) {
        return;
      }
      for (const listener of getListenerIterator()) {
        try {
          listener.onDOMChanged(addedNodes, removedNodes);
        } catch {
        }
      }
      addedNodes.length = 0;
      removedNodes = false;
      vAPI.domMutationTime = Date.now();
    };
    const observerHandler = function(mutations) {
      let i = mutations.length;
      while (i--) {
        const mutation = mutations[i];
        if (mutation.addedNodes.length !== 0) {
          addedNodeLists.push(mutation.addedNodes);
        }
        if (mutation.removedNodes.length !== 0) {
          removedNodeLists.push(mutation.removedNodes);
        }
      }
      if (addedNodeLists.length !== 0 || removedNodeLists.length !== 0) {
        safeObserverHandlerTimer.start(
          addedNodeLists.length < 100 ? 1 : void 0
        );
      }
    };
    const startMutationObserver = function() {
      if (domLayoutObserver !== void 0) {
        return;
      }
      domLayoutObserver = new MutationObserver(observerHandler);
      domLayoutObserver.observe(document, {
        childList: true,
        subtree: true
      });
      safeObserverHandlerTimer = new vAPI.SafeAnimationFrame(safeObserverHandler);
      if (vAPI?.shutdown?.add instanceof Function) {
        vAPI.shutdown.add(cleanup);
      }
    };
    const stopMutationObserver = function() {
      if (domLayoutObserver === void 0) {
        return;
      }
      cleanup();
      if (vAPI?.shutdown?.remove instanceof Function) {
        vAPI.shutdown.remove(cleanup);
      }
    };
    const getListenerIterator = function() {
      if (listenerIteratorDirty) {
        listenerIterator = listeners.slice();
        listenerIteratorDirty = false;
      }
      return listenerIterator;
    };
    const addListener = function(listener) {
      if (listeners.indexOf(listener) !== -1) {
        return;
      }
      listeners.push(listener);
      listenerIteratorDirty = true;
      if (domLayoutObserver === void 0) {
        return;
      }
      try {
        listener.onDOMCreated();
      } catch {
      }
      startMutationObserver();
    };
    const removeListener = function(listener) {
      const pos = listeners.indexOf(listener);
      if (pos === -1) {
        return;
      }
      listeners.splice(pos, 1);
      listenerIteratorDirty = true;
      if (listeners.length === 0) {
        stopMutationObserver();
      }
    };
    const cleanup = function() {
      if (domLayoutObserver !== void 0) {
        domLayoutObserver.disconnect();
        domLayoutObserver = void 0;
      }
      if (safeObserverHandlerTimer !== void 0) {
        safeObserverHandlerTimer.clear();
        safeObserverHandlerTimer = void 0;
      }
    };
    const start = function() {
      for (const listener of getListenerIterator()) {
        try {
          listener.onDOMCreated();
        } catch {
        }
      }
      startMutationObserver();
    };
    initCSPlistener();
    vAPI.domWatcher = { start, addListener, removeListener };
    if (typeof afterInit === "function") {
      afterInit();
    }
  }

  // contentscript/05-dom-collapser.ts
  function initDOMCollapser() {
    const messaging = vAPI.messaging;
    const toCollapse = /* @__PURE__ */ new Map();
    const src1stProps = {
      audio: "currentSrc",
      embed: "src",
      iframe: "src",
      img: "currentSrc",
      object: "data",
      video: "currentSrc"
    };
    const src2ndProps = {
      audio: "src",
      img: "src",
      video: "src"
    };
    const tagToTypeMap = {
      audio: "media",
      embed: "object",
      iframe: "sub_frame",
      img: "image",
      object: "object",
      video: "media"
    };
    let requestIdGenerator = 1;
    let processTimer;
    let cachedBlockedSet;
    let cachedBlockedSetHash;
    let cachedBlockedSetTimer;
    let toProcess = [];
    let toFilter = [];
    let netSelectorCacheCount = 0;
    const cachedBlockedSetClear = function() {
      cachedBlockedSet = void 0;
      cachedBlockedSetHash = void 0;
      cachedBlockedSetTimer = void 0;
    };
    let collapseToken;
    const getCollapseToken = () => {
      if (collapseToken === void 0) {
        collapseToken = vAPI.randomToken();
        vAPI.userStylesheet.add(
          `[${collapseToken}]
{display:none!important;}`,
          true
        );
      }
      return collapseToken;
    };
    const onProcessed = function(response) {
      if (response instanceof Object === false) {
        toCollapse.clear();
        return;
      }
      const res = response;
      const targets = toCollapse.get(res.id);
      if (targets === void 0) {
        return;
      }
      toCollapse.delete(res.id);
      if (cachedBlockedSetHash !== res.hash) {
        cachedBlockedSet = new Set(res.blockedResources);
        cachedBlockedSetHash = res.hash;
        if (cachedBlockedSetTimer !== void 0) {
          clearTimeout(cachedBlockedSetTimer);
        }
        cachedBlockedSetTimer = vAPI.setTimeout(cachedBlockedSetClear, 3e4);
      }
      if (cachedBlockedSet === void 0 || cachedBlockedSet.size === 0) {
        return;
      }
      const selectors = [];
      const netSelectorCacheCountMax = 0;
      for (const target of targets) {
        const tag = target.localName;
        if (tag === void 0) continue;
        let prop = src1stProps[tag];
        if (prop === void 0) {
          continue;
        }
        let src = target[prop];
        if (typeof src !== "string" || src.length === 0) {
          prop = src2ndProps[tag];
          if (prop === void 0) {
            continue;
          }
          src = target[prop];
          if (typeof src !== "string" || src.length === 0) {
            continue;
          }
        }
        if (cachedBlockedSet.has(tagToTypeMap[tag] + " " + src) === false) {
          continue;
        }
        target.setAttribute(getCollapseToken(), "");
        if (netSelectorCacheCount > netSelectorCacheCountMax) {
          continue;
        }
        const value = target.getAttribute(prop);
        if (value) {
          selectors.push(`${tag}[${prop}="${CSS.escape(value)}"]`);
          netSelectorCacheCount += 1;
        }
      }
      if (selectors.length === 0) {
        return;
      }
      messaging.send("contentscript", {
        what: "cosmeticFiltersInjected",
        type: "net",
        hostname: window.location.hostname,
        selectors
      });
    };
    const send = function() {
      processTimer = void 0;
      toCollapse.set(requestIdGenerator, toProcess);
      messaging.send("contentscript", {
        what: "getCollapsibleBlockedRequests",
        id: requestIdGenerator,
        frameURL: window.location.href,
        resources: toFilter,
        hash: cachedBlockedSetHash
      }).then((response) => {
        onProcessed(response);
      });
      toProcess = [];
      toFilter = [];
      requestIdGenerator += 1;
    };
    const process = function(delay) {
      if (toProcess.length === 0) {
        return;
      }
      if (delay === 0) {
        if (processTimer !== void 0) {
          clearTimeout(processTimer);
        }
        send();
      } else if (processTimer === void 0) {
        processTimer = vAPI.setTimeout(send, delay || 20);
      }
    };
    const add = function(target) {
      toProcess[toProcess.length] = target;
    };
    const addMany = function(targets) {
      for (const target of targets) {
        add(target);
      }
    };
    const iframeSourceModified = function(mutations) {
      for (const mutation of mutations) {
        addIFrame(mutation.target, true);
      }
      process();
    };
    const iframeSourceObserver = new MutationObserver(iframeSourceModified);
    const iframeSourceObserverOptions = {
      attributes: true,
      attributeFilter: ["src"]
    };
    const addIFrame = function(iframe, dontObserve) {
      if (dontObserve !== true) {
        iframeSourceObserver.observe(iframe, iframeSourceObserverOptions);
      }
      const src = iframe.src;
      if (typeof src !== "string" || src === "") {
        return;
      }
      if (src.startsWith("http") === false) {
        return;
      }
      toFilter.push({ type: "sub_frame", url: iframe.src });
      add(iframe);
    };
    const addIFrames = function(iframes) {
      for (const iframe of iframes) {
        addIFrame(iframe);
      }
    };
    const onResourceFailed = function(ev) {
      const target = ev.target;
      if (target && tagToTypeMap[target.localName] !== void 0) {
        add(target);
        process();
      }
    };
    const stop = function() {
      document.removeEventListener("error", onResourceFailed, true);
      if (processTimer !== void 0) {
        clearTimeout(processTimer);
      }
      if (vAPI.domWatcher instanceof Object) {
        vAPI.domWatcher.removeListener(domWatcherInterface);
      }
      vAPI.shutdown.remove(stop);
      vAPI.domCollapser = null;
    };
    const start = function() {
      if (vAPI.domWatcher instanceof Object) {
        vAPI.domWatcher.addListener(domWatcherInterface);
      }
    };
    const domWatcherInterface = {
      onDOMCreated() {
        if (vAPI instanceof Object === false) {
          return;
        }
        if (vAPI.domCollapser instanceof Object === false) {
          if (vAPI.domWatcher instanceof Object) {
            vAPI.domWatcher.removeListener(domWatcherInterface);
          }
          return;
        }
        const elems = document.images || document.getElementsByTagName("img");
        for (const elem of elems) {
          if (elem.complete) {
            add(elem);
          }
        }
        const embeds = document.embeds || document.getElementsByTagName("embed");
        addMany(Array.from(embeds));
        addMany(Array.from(document.getElementsByTagName("object")));
        addIFrames(document.getElementsByTagName("iframe"));
        process(0);
        document.addEventListener("error", onResourceFailed, true);
        vAPI.shutdown.add(stop);
      },
      onDOMChanged(addedNodes) {
        if (addedNodes.length === 0) {
          return;
        }
        for (const node of addedNodes) {
          const elem = node;
          if (elem.localName === "iframe") {
            addIFrame(elem);
          }
          if (elem.firstElementChild === null) {
            continue;
          }
          const iframes = elem.getElementsByTagName("iframe");
          if (iframes.length !== 0) {
            addIFrames(iframes);
          }
        }
        process();
      }
    };
    vAPI.domCollapser = { start };
  }

  // contentscript/06-dom-surveyor.ts
  function initDOMSurveyor() {
    const queriedHashes = /* @__PURE__ */ new Set();
    const newHashes = /* @__PURE__ */ new Set();
    const maxSurveyNodes = 65536;
    const pendingLists = [];
    const pendingNodes = [];
    const processedSet = /* @__PURE__ */ new Set();
    const ignoreTags = Object.assign(/* @__PURE__ */ Object.create(null), {
      br: 1,
      head: 1,
      link: 1,
      meta: 1,
      script: 1,
      style: 1
    });
    let domObserver;
    let domFilterer;
    let hostname = "";
    let domChanged = false;
    let scannedCount = 0;
    let stopped = false;
    const hashFromStr = (type, s) => {
      const len = s.length;
      const step = len + 7 >>> 3;
      let hash = (type << 5) + type ^ len;
      for (let i = 0; i < len; i += step) {
        hash = (hash << 5) + hash ^ s.charCodeAt(i);
      }
      return hash & 16777215;
    };
    const addHashes = (hashes) => {
      for (const hash of hashes) {
        queriedHashes.add(hash);
      }
    };
    const qsa = (context, selector) => Array.from(context.querySelectorAll(selector));
    const addPendingList = (list) => {
      if (list.length === 0) {
        return;
      }
      pendingLists.push(list);
    };
    const nextPendingNodes = () => {
      if (pendingLists.length === 0) {
        return 0;
      }
      const bufferSize = 256;
      let j = 0;
      do {
        const nodeList = pendingLists[0];
        let n = bufferSize - j;
        if (n > nodeList.length) {
          n = nodeList.length;
        }
        for (let i = 0; i < n; i++) {
          pendingNodes[j + i] = nodeList[i];
        }
        j += n;
        if (n !== nodeList.length) {
          pendingLists[0] = nodeList.slice(n);
          break;
        }
        pendingLists.shift();
      } while (j < bufferSize && pendingLists.length !== 0);
      return j;
    };
    const hasPendingNodes = () => {
      return pendingLists.length !== 0 || newHashes.size !== 0;
    };
    const idFromNode = (node) => {
      const raw = node.id;
      if (typeof raw !== "string" || raw.length === 0) {
        return;
      }
      const hash = hashFromStr(35, raw.trim());
      if (queriedHashes.has(hash)) {
        return;
      }
      queriedHashes.add(hash);
      newHashes.add(hash);
    };
    const classesFromNode = (node) => {
      const s = node.getAttribute("class");
      if (typeof s !== "string") {
        return;
      }
      const len = s.length;
      for (let beg = 0, end = 0; beg < len; beg += 1) {
        end = s.indexOf(" ", beg);
        if (end === beg) {
          continue;
        }
        if (end === -1) {
          end = len;
        }
        const token = s.slice(beg, end).trimEnd();
        beg = end;
        if (token.length === 0) {
          continue;
        }
        const hash = hashFromStr(46, token);
        if (queriedHashes.has(hash)) {
          continue;
        }
        queriedHashes.add(hash);
        newHashes.add(hash);
      }
    };
    const getSurveyResults = (safeOnly) => {
      if (vAPI?.messaging === void 0) {
        return stop();
      }
      const promise = newHashes.size === 0 ? Promise.resolve(null) : vAPI.messaging.send("contentscript", {
        what: "retrieveGenericCosmeticSelectors",
        hostname,
        hashes: Array.from(newHashes),
        exceptions: domFilterer.exceptions,
        safeOnly
      });
      promise.then((response) => {
        processSurveyResults(response);
      });
      newHashes.clear();
    };
    const doSurvey = () => {
      const t0 = performance.now();
      const nodes = pendingNodes;
      const deadline = t0 + 4;
      let scanned = 0;
      for (; ; ) {
        const n = nextPendingNodes();
        if (n === 0) {
          break;
        }
        for (let i = 0; i < n; i++) {
          const node = nodes[i];
          nodes[i] = null;
          if (domChanged) {
            if (processedSet.has(node)) {
              continue;
            }
            processedSet.add(node);
          }
          idFromNode(node);
          classesFromNode(node);
          scanned += 1;
        }
        if (performance.now() >= deadline) {
          break;
        }
      }
      scannedCount += scanned;
      if (scannedCount >= maxSurveyNodes) {
        stop();
      }
      processedSet.clear();
      getSurveyResults(false);
    };
    const surveyTimer = new vAPI.SafeAnimationFrame(doSurvey);
    let canShutdownAfter = Date.now() + 3e5;
    let surveyResultMissCount = 0;
    const processSurveyResults = (response) => {
      if (stopped) {
        return;
      }
      const res = response;
      const result = res && res.result;
      let mustCommit = false;
      if (result) {
        const css = result.injectedCSS;
        if (typeof css === "string" && css.length !== 0) {
          domFilterer.addCSS(css);
          mustCommit = true;
        }
        const selectors = result.excepted;
        if (Array.isArray(selectors) && selectors.length !== 0) {
          domFilterer.exceptCSSRules(selectors);
        }
      }
      if (hasPendingNodes()) {
        surveyTimer.start(1);
      }
      if (mustCommit) {
        surveyResultMissCount = 0;
        canShutdownAfter = Date.now() + 3e5;
        return;
      }
      surveyResultMissCount += 1;
      if (surveyResultMissCount < 256 || Date.now() < canShutdownAfter) {
        return;
      }
      stop();
      vAPI.messaging.send("contentscript", {
        what: "disableGenericCosmeticFilteringSurveyor",
        hostname
      });
    };
    const onDomChanged = (mutations) => {
      domChanged = true;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const { addedNodes } = mutation;
          if (addedNodes.length === 0) {
            continue;
          }
          for (const node of addedNodes) {
            if (node.nodeType !== 1) {
              continue;
            }
            const elem = node;
            if (ignoreTags[elem.localName]) {
              continue;
            }
            if (elem.parentElement === null) {
              continue;
            }
            addPendingList([elem]);
            if (elem.firstElementChild === null) {
              continue;
            }
            addPendingList(qsa(elem, "[id],[class]"));
          }
        } else if (mutation.attributeName === "class") {
          classesFromNode(mutation.target);
        } else {
          idFromNode(mutation.target);
        }
      }
      if (hasPendingNodes()) {
        surveyTimer.start();
      }
    };
    const start = (details) => {
      if (vAPI?.domFilterer === void 0) {
        return stop();
      }
      hostname = details.hostname;
      domFilterer = vAPI.domFilterer;
      if (document.documentElement !== null) {
        idFromNode(document.documentElement);
        classesFromNode(document.documentElement);
      }
      if (document.body !== null) {
        idFromNode(document.body);
        classesFromNode(document.body);
      }
      if (newHashes.size !== 0) {
        getSurveyResults(true);
      }
      addPendingList(qsa(document, "[id],[class]"));
      if (hasPendingNodes()) {
        surveyTimer.start();
      }
      domObserver = new MutationObserver(onDomChanged);
      domObserver.observe(document, {
        attributeFilter: ["class", "id"],
        attributes: true,
        childList: true,
        subtree: true
      });
    };
    const stop = () => {
      stopped = true;
      pendingLists.length = 0;
      surveyTimer.clear();
      if (domObserver) {
        domObserver.disconnect();
        domObserver = void 0;
      }
      if (vAPI?.domSurveyor) {
        vAPI.domSurveyor = null;
      }
    };
    vAPI.domSurveyor = { start, addHashes };
  }

  // contentscript/07-bootstrap.ts
  var blockLikeTags = /* @__PURE__ */ new Set([
    "article",
    "aside",
    "div",
    "li",
    "main",
    "section"
  ]);
  var userFilterStyleId = "ublock-resurrected-user-filters";
  var storageGet = (keys) => {
    const browserAPI = globalThis.browser;
    if (browserAPI?.storage?.local?.get instanceof Function) {
      return browserAPI.storage.local.get(keys);
    }
    const chromeAPI = globalThis.chrome;
    if (chromeAPI?.storage?.local?.get instanceof Function) {
      return new Promise((resolve) => {
        chromeAPI.storage.local.get(
          keys,
          (bin) => resolve(bin || {})
        );
      });
    }
    return Promise.resolve({});
  };
  var matchesFilterHostname = (filterHostname, pageHostname) => {
    if (filterHostname === "") {
      return true;
    }
    return pageHostname === filterHostname || pageHostname.endsWith(`.${filterHostname}`);
  };
  var shouldApplyCosmeticLine = (line, pageHostname) => {
    if (line === "" || line.startsWith("!")) {
      return;
    }
    const exceptionIndex = line.indexOf("#@#");
    if (exceptionIndex !== -1) {
      return;
    }
    const separatorIndex = line.indexOf("##");
    if (separatorIndex === -1) {
      return;
    }
    const scope = line.slice(0, separatorIndex).trim();
    const selector = line.slice(separatorIndex + 2).trim();
    if (selector === "") {
      return;
    }
    if (scope === "") {
      return selector;
    }
    const includes = [];
    const excludes = [];
    for (const token of scope.split(",").map((part) => part.trim()).filter(Boolean)) {
      if (token.startsWith("~")) {
        excludes.push(token.slice(1));
      } else {
        includes.push(token);
      }
    }
    if (excludes.some((token) => matchesFilterHostname(token, pageHostname))) {
      return;
    }
    if (includes.length === 0) {
      return selector;
    }
    if (includes.some((token) => matchesFilterHostname(token, pageHostname))) {
      return selector;
    }
  };
  var collectStoredCosmeticSelectors = (rawFilters, pageHostname) => {
    const selectors = [];
    const seen = /* @__PURE__ */ new Set();
    for (const rawLine of rawFilters.split(/\r?\n/)) {
      const line = rawLine.trim();
      const selector = shouldApplyCosmeticLine(line, pageHostname);
      if (selector === void 0 || seen.has(selector)) {
        continue;
      }
      try {
        document.querySelector(selector);
      } catch {
        continue;
      }
      seen.add(selector);
      selectors.push(selector);
    }
    return selectors;
  };
  var cssEscape = (value) => {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  };
  var nthOfTypeIndex = (elem) => {
    let index = 1;
    let prev = elem.previousElementSibling;
    while (prev !== null) {
      if (prev.localName === elem.localName) {
        index += 1;
      }
      prev = prev.previousElementSibling;
    }
    return index;
  };
  var distanceToAncestor = (start, matcher) => {
    let current = start;
    let distance = 0;
    while (current !== null && current !== document.documentElement) {
      if (current.matches(matcher)) {
        return { element: current, distance };
      }
      current = current.parentElement;
      distance += 1;
    }
  };
  var buildContextMenuTargetSelector = (elem) => {
    if (elem === null) {
      return "";
    }
    const parts = [];
    let current = elem;
    let depth = 0;
    while (current !== null && current !== document.documentElement && depth < 5) {
      let part = current.localName || "*";
      const id = current.getAttribute("id") || "";
      if (id !== "") {
        part += `#${cssEscape(id)}`;
        parts.unshift(part);
        break;
      }
      const classAttr = current.getAttribute("class") || "";
      const classes = classAttr.split(/\s+/).map((token) => token.trim()).filter(Boolean).slice(0, 6);
      if (classes.length !== 0) {
        part += classes.map((name) => `.${cssEscape(name)}`).join("");
      }
      const href = current.getAttribute("href");
      if (href) {
        part += `[href="${cssEscape(href)}"]`;
      }
      const src = current.getAttribute("src");
      if (src) {
        part += `[src="${cssEscape(src)}"]`;
      }
      const eventAction = current.getAttribute("data-event-action");
      if (eventAction) {
        part += `[data-event-action="${cssEscape(eventAction)}"]`;
      }
      if (classes.length === 0 && !href && !src && !eventAction) {
        part += `:nth-of-type(${nthOfTypeIndex(current)})`;
      }
      parts.unshift(part);
      current = current.parentElement;
      depth += 1;
    }
    return parts.join(" > ");
  };
  var getContextMenuTargetDetails = (ev) => {
    const rawTarget = ev.target;
    const element = rawTarget instanceof Element ? rawTarget : rawTarget instanceof Node ? rawTarget.parentElement : null;
    if (element === null) {
      return;
    }
    const actionable = distanceToAncestor(
      element,
      "a[href], img[src], iframe[src], video[src], audio[src], [data-event-action], [href], [src]"
    );
    const identifiable = distanceToAncestor(element, "[id]");
    const actionableElement = actionable?.element;
    const actionableTag = actionableElement?.localName || "";
    const actionableEvent = actionableElement?.getAttribute("data-event-action") || "";
    const identifiableElement = identifiable?.element;
    const identifiableTag = identifiableElement?.localName || "";
    const preferred = identifiable?.distance === 0 ? identifiable.element : actionableEvent === "title" ? actionableElement : identifiable && actionable ? actionableTag === "a" && blockLikeTags.has(identifiableTag) && identifiable.distance <= actionable.distance + 2 ? identifiable.element : identifiable.distance <= actionable.distance + 1 ? identifiable.element : actionable.element : actionable?.element || identifiable?.element || element.closest("[class]") || element;
    const selector = buildContextMenuTargetSelector(preferred);
    if (selector === "") {
      return;
    }
    return { selector };
  };
  var applyStoredUserFilters = async () => {
    const pageHostname = self.location.hostname;
    if (pageHostname === "") {
      return;
    }
    const bin = await storageGet([
      "user-filters",
      "selectedFilterLists",
      "perSiteFiltering",
      "hostnameSwitches"
    ]);
    const perSiteFiltering = bin.perSiteFiltering || {};
    const hostnameSwitches = bin.hostnameSwitches || {};
    const pageURL = self.location.href;
    const pageScopeKey = `${pageHostname}:${pageURL}`;
    const netFilteringEnabled = perSiteFiltering[pageScopeKey] ?? perSiteFiltering[pageHostname] ?? true;
    if (netFilteringEnabled === false) {
      return;
    }
    const hostnameSwitchState = hostnameSwitches[pageHostname] || {};
    if (hostnameSwitchState["no-cosmetic-filtering"] === true) {
      return;
    }
    if (hostnameSwitchState["no-large-media"] === true) {
      await applyImmediateHostnameSwitchState("no-large-media", true);
    }
    if (hostnameSwitchState["no-remote-fonts"] === true) {
      await applyImmediateHostnameSwitchState("no-remote-fonts", true);
    }
    if (Array.isArray(bin.selectedFilterLists) === false) {
      return;
    }
    if (bin.selectedFilterLists.includes("user-filters") === false) {
      return;
    }
    if (typeof bin["user-filters"] !== "string" || bin["user-filters"].trim() === "") {
      return;
    }
    const selectors = collectStoredCosmeticSelectors(
      bin["user-filters"],
      pageHostname
    );
    if (selectors.length === 0) {
      return;
    }
    let style = document.getElementById(
      userFilterStyleId
    );
    if (style === null) {
      style = document.createElement("style");
      style.id = userFilterStyleId;
      (document.head || document.documentElement).append(style);
    }
    style.textContent = selectors.map((selector) => `${selector}
{display:none!important;}`).join("\n");
  };
  var applyImmediatePowerSwitchState = async (enabled) => {
    const style = document.getElementById(userFilterStyleId);
    if (enabled) {
      await applyStoredUserFilters();
      vAPI.domFilterer?.toggle?.(true);
      vAPI.domFilterer?.commitNow?.();
      return;
    }
    style?.remove();
    vAPI.domFilterer?.toggle?.(false);
    vAPI.domFilterer?.commitNow?.();
  };
  var hostnameSwitchStyleIds = {
    "no-large-media": "ublock-resurrected-no-large-media",
    "no-remote-fonts": "ublock-resurrected-no-remote-fonts"
  };
  var upsertStyle = (id, css, enabled) => {
    let style = document.getElementById(id);
    if (enabled) {
      if (style === null) {
        style = document.createElement("style");
        style.id = id;
        (document.head || document.documentElement).append(style);
      }
      style.textContent = css;
      return;
    }
    style?.remove();
  };
  var applyImmediateHostnameSwitchState = async (name, enabled) => {
    switch (name) {
      case "no-cosmetic-filtering":
        await applyImmediatePowerSwitchState(!enabled);
        break;
      case "no-large-media":
        upsertStyle(
          hostnameSwitchStyleIds["no-large-media"],
          "video, audio { display: none !important; }",
          enabled
        );
        break;
      case "no-remote-fonts":
        upsertStyle(
          hostnameSwitchStyleIds["no-remote-fonts"],
          "html, body, body * { font-family: system-ui, sans-serif !important; }",
          enabled
        );
        break;
      default:
        break;
    }
  };
  function initBootstrap() {
    const onDomReady = () => {
      if (window.location === null) {
        return;
      }
      if (vAPI instanceof Object === false) {
        return;
      }
      vAPI.messaging.send("contentscript", {
        what: "shouldRenderNoscriptTags"
      });
      if (vAPI.domFilterer instanceof Object) {
        vAPI.domFilterer.commitNow();
      }
      if (vAPI.domWatcher instanceof Object) {
        vAPI.domWatcher.start();
      }
      if (window !== window.top || vAPI.domFilterer instanceof Object === false) {
        return;
      }
      vAPI.mouseClick = { x: -1, y: -1 };
      const onMouseClick = function(ev) {
        if (ev.isTrusted === false) {
          return;
        }
        vAPI.mouseClick.x = ev.clientX;
        vAPI.mouseClick.y = ev.clientY;
        const elem = ev.target?.closest("a[href]");
        if (elem === null || typeof elem.href !== "string") {
          return;
        }
        vAPI.messaging.send("contentscript", {
          what: "maybeGoodPopup",
          url: elem.href || ""
        });
      };
      const onContextMenu = function(ev) {
        if (ev.isTrusted === false) {
          return;
        }
        if (chrome?.runtime?.sendMessage instanceof Function === false) {
          return;
        }
        vAPI.mouseClick.x = ev.clientX;
        vAPI.mouseClick.y = ev.clientY;
        const target = getContextMenuTargetDetails(ev);
        const result = chrome.runtime.sendMessage({
          topic: "pickerContextMenuPoint",
          payload: {
            x: ev.clientX,
            y: ev.clientY,
            pageURL: window.location.href,
            target
          }
        });
        result?.catch(() => {
        });
      };
      document.addEventListener("mousedown", onMouseClick, true);
      document.addEventListener("contextmenu", onContextMenu, true);
      vAPI.shutdown.add(function() {
        document.removeEventListener("mousedown", onMouseClick, true);
        document.removeEventListener("contextmenu", onContextMenu, true);
      });
    };
    const onResponseReady = (response) => {
      if (response instanceof Object === false) {
        return;
      }
      vAPI.bootstrap = void 0;
      const res = response;
      const cfeDetails = res && res.specificCosmeticFilters;
      if (!cfeDetails || !cfeDetails.ready) {
        vAPI.domWatcher = null;
        vAPI.domCollapser = null;
        vAPI.domFilterer = null;
        vAPI.domSurveyor = null;
        vAPI.domIsLoaded = null;
        return;
      }
      vAPI.domCollapser.start();
      const { noSpecificCosmeticFiltering, noGenericCosmeticFiltering } = res;
      vAPI.noSpecificCosmeticFiltering = noSpecificCosmeticFiltering || false;
      vAPI.noGenericCosmeticFiltering = noGenericCosmeticFiltering || false;
      if (noSpecificCosmeticFiltering && noGenericCosmeticFiltering) {
        vAPI.domFilterer = null;
        vAPI.domSurveyor = null;
      } else {
        const domFilterer = new vAPI.DOMFilterer();
        vAPI.domFilterer = domFilterer;
        if (noGenericCosmeticFiltering || cfeDetails.disableSurveyor) {
          vAPI.domSurveyor = null;
        }
        domFilterer.exceptions = cfeDetails.exceptionFilters || [];
        domFilterer.addCSS(cfeDetails.injectedCSS || "", { mustInject: true });
        domFilterer.addProceduralSelectors(cfeDetails.proceduralFilters || []);
        domFilterer.exceptCSSRules(cfeDetails.exceptedFilters || []);
        domFilterer.convertedProceduralFilters = cfeDetails.convertedProceduralFilters || [];
        vAPI.userStylesheet.apply();
      }
      if (vAPI.domSurveyor) {
        if (Array.isArray(cfeDetails.genericCosmeticHashes)) {
          vAPI.domSurveyor.addHashes(cfeDetails.genericCosmeticHashes);
        }
        vAPI.domSurveyor.start(cfeDetails);
      }
      const readyState = document.readyState;
      if (readyState === "interactive" || readyState === "complete") {
        return onDomReady();
      }
      document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
    };
    vAPI.bootstrap = function() {
      try {
        document.title = "uBR MV3 CS LOADING...";
      } catch (e) {
      }
      console.log("########################################");
      console.log("[MV3-CS] \u2605\u2605\u2605 BOOTSTRAP STARTING \u2605\u2605\u2605");
      console.log("[MV3-CS] Page URL:", vAPI.effectiveSelf.location.href);
      console.log("[MV3-CS] About to call vAPI.messaging.send");
      if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener(
          (message, _sender, sendResponse) => {
            const msg = message;
            console.log("[MV3-CS] Message received:", msg?.topic);
            if (msg?.topic === "pickerActivate") {
              console.log("[MV3-CS] pickerActivate received, launching picker");
              launchPickerInContentScript();
            }
            if (msg?.topic === "pickerDeactivate") {
              console.log("[MV3-CS] pickerDeactivate received");
            }
            if (msg?.topic === "uBlockPowerSwitch") {
              const enabled = msg.payload?.enabled === true;
              void applyImmediatePowerSwitchState(enabled);
            }
            if (msg?.topic === "uBlockHostnameSwitch") {
              const payload = msg.payload || {};
              if (typeof payload.name === "string") {
                void applyImmediateHostnameSwitchState(
                  payload.name,
                  payload.enabled === true
                );
              }
            }
            return true;
          }
        );
      }
      applyStoredUserFilters().catch((err) => {
        console.error("[MV3-CS] Stored user filters error:", err);
      }).finally(() => {
        vAPI.messaging.send("contentscript", {
          what: "retrieveContentScriptParameters",
          url: vAPI.effectiveSelf.location.href,
          needScriptlets: self.uBR_scriptletsInjected === void 0
        }).then((response) => {
          if (response && response.specificCosmeticFilters) {
            const scf = response.specificCosmeticFilters;
            if (scf.injectedCSS && scf.injectedCSS.length > 0) {
            }
          }
          onResponseReady(response);
        }).catch((err) => {
          console.error("[MV3-CS] Promise error:", err);
        });
      });
    };
    const launchPickerInContentScript = async () => {
      console.log("[MV3-CS] launchPickerInContentScript called");
      try {
        const pickerBootArgs = await vAPI.messaging.send("elementPicker", {
          what: "elementPickerArguments"
        });
        if (!pickerBootArgs || typeof pickerBootArgs !== "object") {
          console.error("[MV3-CS] No pickerBootArgs received");
          return;
        }
        console.log("[MV3-CS] pickerBootArgs received:", pickerBootArgs);
        const pickerUniqueId = vAPI.randomToken();
        let pickerURL = pickerBootArgs.pickerURL || "/web_accessible_resources/epicker-ui.html";
        if (pickerBootArgs.zap) {
          pickerURL += (pickerURL.includes("?") ? "&" : "?") + "zap=1";
        }
        const epickerUrl = chrome.runtime.getURL(pickerURL);
        console.log("[MV3-CS] epicker URL:", epickerUrl);
        const iframe = document.createElement("iframe");
        iframe.setAttribute(pickerUniqueId, "");
        iframe.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647;
        border: none;
        background: transparent;
      `;
        const channel = new MessageChannel();
        const port1 = channel.port1;
        const port2 = channel.port2;
        port1.onmessage = async (ev) => {
          const msg = ev.data;
          console.log("[MV3-CS] Picker message received:", msg);
          if (msg.what === "pickerCreateFilter") {
            await vAPI.messaging.send("elementPicker", {
              what: "elementPickerCreateFilter",
              ...msg
            });
          } else if (msg.what === "pickerQuit") {
            port1.close();
            iframe.remove();
          }
        };
        (document.documentElement || document.head || document.body)?.appendChild(
          iframe
        );
        iframe.addEventListener(
          "load",
          () => {
            console.log("[MV3-CS] epicker iframe loaded");
            iframe.contentWindow?.postMessage(
              { what: "epickerStart", eprom: pickerBootArgs.eprom },
              "*",
              [port2]
            );
          },
          { once: true }
        );
        iframe.src = epickerUrl;
        console.log("[MV3-CS] Picker iframe created and navigated");
      } catch (e) {
        console.error("[MV3-CS] Error launching picker:", e);
      }
    };
  }
  function startBootstrap() {
    vAPI.bootstrap?.();
  }

  // contentscript/contentscript-entry.ts
  vAPI.contentScript = true;
  initDOMFilterer();
  initDOMCollapser();
  initDOMSurveyor();
  initBootstrap();
  initDOMWatcher();
  startBootstrap();
})();
