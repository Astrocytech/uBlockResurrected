/*******************************************************************************

    uBlock Origin - MV3 Generalized Video Ad Blocker
    Blocks ads across YouTube, Kinopoisk, Rutube, Yandex
    
    CONSERVATIVE approach with YouTube-specific aggression

******************************************************************************/

interface PlatformConfig {
  hosts: string[];
  playerPaths: string[];
  adKeys: string[];
}

const PLATFORMS: Record<string, PlatformConfig> = {
  youtube: {
    hosts: ["youtube.com", "youtu.be"],
    playerPaths: ["/youtubei/v1/player", "/apiManifest"],
    adKeys: [
      "adPlacements",
      "playerAds",
      "adSlots",
      "adBreakHeartbeatParams",
      "adServerLogger",
      "adBreakOverlays",
      "adBreakResponse",
      "adShowing",
      "adFormat",
      "adNumSegments",
      "playerResponse",
      "instreamVideoAds",
      "midrollAds",
      "bumperAds",
    ],
  },
  kinopoisk: {
    hosts: ["kinopoisk.ru"],
    playerPaths: ["/getVideoPlayer", "/video", "/api/player"],
    adKeys: ["adPlacements", "playerAds", "adSlots", "adBreakResponse"],
  },
  rutube: {
    hosts: ["rutube.ru"],
    playerPaths: ["/api/play", "/api/video", "/api/player", "/api/v1/player"],
    adKeys: ["adPlacements", "playerAds", "adSlots", "adBreaks", "adMarkers"],
  },
  yandex: {
    hosts: [
      "yandex.ru",
      "yandex.com",
      "yandex.kz",
      "yandex.by",
      "yandex.ua",
      "ya.ru",
    ],
    playerPaths: ["/video", "/player", "/api/video", "/api/player"],
    adKeys: ["adPlacements", "playerAds", "adSlots", "preroll", "adBreaks"],
  },
};

function detectPlatform(url: string): string | null {
  if (!url) return null;
  for (const [name, config] of Object.entries(PLATFORMS)) {
    for (const host of config.hosts) {
      if (url.includes(host)) {
        return name;
      }
    }
  }
  return null;
}

function stripAdKeys(obj: any, adKeys: string[]): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  const newObj: any = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (adKeys.includes(key)) continue;
    try {
      newObj[key] = stripAdKeys(obj[key], adKeys);
    } catch {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}

function createVideoBlocker() {
  const injectedTabs = new Set();

  chrome.webNavigation?.onCommitted?.addListener(async (details) => {
    if (details.frameId !== 0) return;

    const url = details.url;
    if (!url) return;

    const platform = detectPlatform(url);
    if (!platform) return;

    if (injectedTabs.has(details.tabId)) return;
    injectedTabs.add(details.tabId);

    const config = PLATFORMS[platform];
    if (!config) return;

    if (chrome.scripting?.executeScript === undefined) {
      console.log("[VB] chrome.scripting not available");
      return;
    }

    console.log(
      "[VB] Injecting video ad blocker:",
      platform,
      "tab",
      details.tabId,
    );

    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        world: "MAIN",
        func: (plat: string, playerPaths: string[], adKeys: string[]) => {
          console.log("[VB-MAIN] Injection for", plat);

          const stripAdKeys = (obj: any): any => {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj !== "object") return obj;
            const newObj: any = Array.isArray(obj) ? [] : {};
            for (const key of Object.keys(obj)) {
              if (adKeys.includes(key)) continue;
              try {
                newObj[key] = stripAdKeys(obj[key]);
              } catch {
                newObj[key] = obj[key];
              }
            }
            return newObj;
          };

          let isPlayerApiRequest = false;

          const originalOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function (
            method: string,
            url: string,
          ) {
            isPlayerApiRequest = false;
            if (url) {
              for (const p of playerPaths) {
                if (url.includes(p)) {
                  isPlayerApiRequest = true;
                  break;
                }
              }
            }
            return originalOpen.apply(this, arguments);
          };

          const originalSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.send = function (body?: any) {
            if (isPlayerApiRequest) {
              this.addEventListener("load", function () {
                const text = this.responseText;
                if (text) {
                  const found = adKeys.some((k) => text.includes(`"${k}"`));
                  if (found) {
                    console.log("[VB-MAIN] Stripping ad keys from XHR");
                    try {
                      const json = JSON.parse(text);
                      const stripped = stripAdKeys(json);
                      Object.defineProperty(this, "responseText", {
                        value: JSON.stringify(stripped),
                        writable: false,
                        configurable: true,
                      });
                      Object.defineProperty(this, "response", {
                        value: JSON.stringify(stripped),
                        writable: false,
                        configurable: true,
                      });
                    } catch {}
                  }
                }
              });
            }
            return originalSend.apply(this, arguments);
          };

          const originalFetch = window.fetch;
          window.fetch = function (...args) {
            let isPlayer = false;
            const reqUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
            if (reqUrl) {
              for (const p of playerPaths) {
                if (reqUrl.includes(p)) {
                  isPlayer = true;
                  break;
                }
              }
            }
            return originalFetch
              .apply(this, args)
              .then((response: Response) => {
                if (isPlayer && response.ok) {
                  return response
                    .clone()
                    .text()
                    .then((text: string) => {
                      const found = adKeys.some((k) => text.includes(`"${k}"`));
                      if (found) {
                        console.log("[VB-MAIN] Stripping ad keys from fetch");
                        try {
                          const json = JSON.parse(text);
                          const stripped = stripAdKeys(json);
                          return new Response(JSON.stringify(stripped), {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers,
                          });
                        } catch {}
                      }
                      return response;
                    });
                }
                return response;
              });
          };

          console.log("[VB-MAIN] Patches ready for", plat);
        },
        args: [platform, config.playerPaths, config.adKeys],
      });
      console.log("[VB] Done for", platform, "tab", details.tabId);
    } catch (e) {
      console.error("[VB] Error:", e);
    }
  });
}

export const registerVideoAdBlocker = () => {
  createVideoBlocker();
};

export { detectPlatform, PLATFORMS };
