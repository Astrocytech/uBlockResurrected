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
    playerPaths: [
      "/youtubei/v1/player",
      "/youtubei/v1/next",
      "/youtubei/v1/browse",
      "/youtubei/v1/ad_break",
      "/youtubei/v1/reel/reel_watch_sequence",
      "/apiManifest",
      "/get_player",
      "/api/chromeless",
    ],
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
      "adDurationMillis",
      "adDeviceRestriction",
      "adEligibilityReasons",
      "adEngagementEnabled",
      "adLoadPolicyConfig",
      "adLogability",
      "adMentions",
      "adPlaybackMobile",
      "adPlaybackIos",
      "adPlaybackOther",
      "adPlaybackPC",
      "adPlayers",
      "adProduct",
      "adRye",
      "adSessionId",
      "adSlot",
      "adSlots",
      "adTag",
      "adTags",
      "adTargeting",
      "adThirdPartyAnchor",
      "adTimings",
      "adTracking",
      "adPrerolls",
      "hasAds",
      "isAd",
      "isTeva",
      "trafficType",
      "standalonePromoRenderer",
      "adConfig",
      "adInfo",
      "ad服务体系",
      "playerAds",
      "adShow",
      "adIntervals",
      "adActiveView",
      "ad1Plugins",
      "ad2Plugins",
      "adRenderer",
      "adWhitelist",
      "instream",
      "skipOffset",
      "adSkipOffset",
      "adSafetyReason",
      "streamingAds",
      "ad3Module",
      "adState",
      "adBreakParams",
      "adModule",
      "adPlaybackContext",
      "adVideoId",
      "adLayoutLoggingData",
      "adInfoRenderer",
      "adNextParams",
      "instreamVideoAdRenderer",
      "linearAdSequenceRenderer",
      "adSignalsInfo",
      "adBreakServiceRenderer",
      "adSlotRenderer",
      "adBreakRenderer",
      "advertiserInfoRenderer",
      "promotedSparklesWebRenderer",
      "promotedSparklesTextSearchRenderer",
      "compactPromotedVideoRenderer",
      "promotedVideoRenderer",
      "playerLegacyDesktopWatchAdsRenderer",
      "actionCompanionAdRenderer",
      "adPlacementConfig",
      "adPlacementRenderer",
      "instreamAdPlayerOverlayRenderer",
      "invideoOverlayAdRenderer",
      "adActionInterstitialRenderer",
      "adFeedbackRenderer",
      "adSlotAndLayout",
      "adSlotMetadata",
      "adLayoutMetadata",
      "adLayoutRenderData",
      "adHoverTextButtonRenderer",
      "adInfoDialogRenderer",
      "adReasonRenderer",
      "adPlacementsConfig",
      "adRendererConfig",
      "playerWrapperRenderers",
      "isMutedPlayback",
      "segmentType",
      "segmentData",
      "playerResponse",
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
                const val = obj[key];

                if (key === "streamingData") {
                  const sd = val as any;
                  if (sd.formats) {
                    const cleanFormats = stripAdKeys(sd.formats);
                    const cleanAdaptiveFormats = sd.adaptiveFormats ? stripAdKeys(sd.adaptiveFormats) : undefined;
                    newObj.streamingData = { ...sd };
                    newObj.streamingData.formats = cleanFormats;
                    if (cleanAdaptiveFormats) newObj.streamingData.adaptiveFormats = cleanAdaptiveFormats;
                    continue;
                  }
                }

                if (key === "playerResponse" && typeof val === "object") {
                  newObj[key] = stripAdKeys(val);
                  continue;
                }

                newObj[key] = stripAdKeys(val);
              } catch {
                newObj[key] = obj[key];
              }
            }
            return newObj;
          };

          const neuterPlayerResponse = (json: any): any => {
            if (!json || typeof json !== "object") return json;

            const result = { ...json };

            const adIndicators = [
              "adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams",
              "adBreakOverlays", "adBreakResponse", "adShowing", "adFormat",
              "adNumSegments", "adDurationMillis", "adDeviceRestriction",
              "adEligibilityReasons", "adEngagementEnabled", "adLoadPolicyConfig",
              "adLogability", "adMentions", "adPlaybackMobile", "adPlaybackIos",
              "adPlaybackOther", "adPlaybackPC", "adPlayers", "adProduct",
              "adSessionId", "adSlot", "adSlots", "adTag", "adTags",
              "adTargeting", "adThirdPartyAnchor", "adTimings", "adTracking",
              "adPrerolls", "adConfig", "adInfo", "adShow", "adIntervals",
              "adActiveView", "adRenderer", "instream", "instreamVideoAds",
              "midrollAds", "bumperAds", "skipOffset", "adSkipOffset",
              "ad服务体系"
            ];

            for (const key of adIndicators) {
              if (key in result) delete result[key];
            }

            if (result.playbackTracking) {
              delete result.playbackTracking.pinging;
              delete result.playbackTracking.heartbeats;
            }

            if (result.playerResponse && typeof result.playerResponse === "object") {
              const pr = result.playerResponse;
              for (const key of adIndicators) {
                if (key in pr) delete pr[key];
              }
              if (pr.playbackTracking) {
                delete pr.playbackTracking.pinging;
                delete pr.playbackTracking.heartbeats;
              }
            }

            if (result.streamingData) {
              const sd = result.streamingData;
              if (Array.isArray(sd.formats)) {
                sd.formats = sd.formats.filter((f: any) => {
                  const url = f.url || f.signatureCipher || f.cipher || "";
                  return !url.includes("googlesyndication") && !url.includes("doubleclick");
                });
              }
              if (Array.isArray(sd.adaptiveFormats)) {
                sd.adaptiveFormats = sd.adaptiveFormats.filter((f: any) => {
                  const url = f.url || f.signatureCipher || f.cipher || "";
                  return !url.includes("googlesyndication") && !url.includes("doubleclick");
                });
              }
            }

            return result;
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
                    console.log("[VB-MAIN] Neutering player response from XHR");
                    try {
                      const json = JSON.parse(text);
                      const neutered = neuterPlayerResponse(json);
                      Object.defineProperty(this, "responseText", {
                        value: JSON.stringify(neutered),
                        writable: false,
                        configurable: true,
                      });
                      Object.defineProperty(this, "response", {
                        value: JSON.stringify(neutered),
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
                        console.log("[VB-MAIN] Neutering player response from fetch");
                        try {
                          const json = JSON.parse(text);
                          const neutered = neuterPlayerResponse(json);
                          return new Response(JSON.stringify(neutered), {
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
