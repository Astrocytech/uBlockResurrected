/*******************************************************************************

    uBlock Resurrected - YouTube Video Ad Blocking for MV3
    
    Uses JSON.parse interception to strip ad data at parse time.
    This is more reliable than network interception because it catches
    the data regardless of how it was loaded.

******************************************************************************/

((self) => {
  "use strict";

  const DEBUG = false;

  const log = (...args) => {
    console.log("[YT-AB]", ...args);
  };

  log("YouTube Ad Blocker starting...");
  log("Global:", typeof self, "Window:", typeof window);

  const isYouTube = () => {
    return (
      window.location.hostname.includes("youtube.com") &&
      !window.location.hostname.includes("youtu.be")
    );
  };

  const AD_KEYS = [
    "adPlacements",
    "playerAds",
    "adSlots",
    "adBreakHeartbeatParams",
    "adServerLogger",
    "playerResponse",
    "adBreakOverlays",
    "instreamVideoAds",
  ];

  const AD_PATTERNS_TO_CHECK = ["adPlacements", "playerAds", "adSlots"];

  const AD_PATTERNS = ["adPlacements", "playerAds", "adSlots", "adBreak"];

  const stripAdDataFromObject = (obj, depth = 0) => {
    if (obj === null || obj === undefined) return obj;
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

  const hasAdPattern = (text: string) => {
    return AD_PATTERNS.some((p) => text.includes(`"${p}"`));
  };

  const parseAndStripResponse = (text: string) => {
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

    JSON.parse = function (text, reviver) {
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
    const originalFetch = self.fetch;

    self.fetch = async function (...args) {
      const [resource, options] = args;
      const url = typeof resource === "string" ? resource : resource.url;

      const isYouTubeApi =
        url &&
        (url.includes("youtube.com/youtubei/v1/player") ||
          url.includes("youtube.com/apiManifest") ||
          (url.includes("googlevideo.com") && url.includes("ad")));

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
              headers: new Headers(response.headers),
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

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._isYouTubeApi =
        url &&
        (url.includes("youtube.com/youtubei/v1/player") ||
          url.includes("youtube.com/apiManifest"));
      this._url = url;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
      this._headers = this._headers || {};
      this._headers[header.toLowerCase()] = value;
      return originalSetHeader.apply(this, [header, value]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
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
                  configurable: true,
                });
                Object.defineProperty(this, "response", {
                  value: stripped,
                  writable: false,
                  configurable: true,
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
      'script[data-target="ytinitialplayerresponse"]',
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
                const scripts = node.querySelectorAll
                  ? node.querySelectorAll(selector)
                  : [];
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
                  } catch (e) {}
                }
              }
            }
          }
        }
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });

    checkForPlayerResponse();
    log("Player response interceptors initialized");
  };

  const initWindowVariableInterceptor = () => {
    const variableNames = [
      "ytInitialPlayerResponse",
      "ytInitialData",
      "playerResponse",
    ];

    const checkAndNeuter = () => {
      for (const name of variableNames) {
        if (window[name] !== undefined) {
          try {
            const val = window[name];
            if (val && typeof val === "object") {
              const str = JSON.stringify(val);
              if (
                str.includes('"adPlacements"') ||
                str.includes('"playerAds"') ||
                str.includes('"adSlots"')
              ) {
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
    setTimeout(() => clearInterval(interval), 10000);

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
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : self,
);
