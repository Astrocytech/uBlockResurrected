/*******************************************************************************

    uBlock Resurrected - Yandex Video Ad Blocker
    
    CONSERVATIVE - only targets known Yandex ad endpoints without breaking functionality

******************************************************************************/

((self) => {
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
    "advertising",
  ];

  const AD_URLS = ["yandex.ru/ads", "adfox", "/adsdk"];

  const stripAdKeys = (obj, depth = 0) => {
    if (obj === null || obj === undefined) return obj;
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

    const originalFetch = self.fetch;
    self.fetch = async function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      const isAdRequest =
        url &&
        (url.includes("yandex.ru/ads") ||
          url.includes("adfox") ||
          url.includes("/adsdk"));

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
              headers: resp.headers,
            });
          }
        } catch {}
      }
      return resp;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._isYandexAd =
        url && (url.includes("yandex.ru/ads") || url.includes("adfox"));
      return origOpen.apply(this, arguments);
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
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
                configurable: true,
              });
            }
          } catch {}
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
