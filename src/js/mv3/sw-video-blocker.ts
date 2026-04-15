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

  console.log("[VB-SW] createVideoBlocker() starting");

  if (!chrome.scripting?.executeScript) {
    console.error("[VB-SW] ERROR: chrome.scripting.executeScript not available!");
    return;
  }

  const shouldInject = (tabId: number) => {
    if (!injectedTabs.has(tabId)) {
      injectedTabs.add(tabId);
      return true;
    }
    return false;
  };

  const handleNavigation = async (details: any) => {
    if (details.frameId !== 0) return;

    const url = details.url;
    if (!url) return;

    const platform = detectPlatform(url);
    if (!platform) return;

    if (!shouldInject(details.tabId)) {
      return;
    }

    const config = PLATFORMS[platform];
    if (!config) return;

    console.log("[VB-SW] Injecting for:", platform, "url:", url);

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

          console.log("[VB-MAIN] Installing full YouTube ad blocker...");

          const SKIP_BTN_SEL = [
            ".ytp-skip-ad-button",
            ".ytp-ad-skip-button",
            ".ytp-ad-skip-button-modern",
            ".ytp-ad-skip-button-container button",
            ".ytp-ad-skip-button-slot button",
            ".videoAdUiSkipButton",
            "button[class*='ytp-ad-skip']"
          ].join(",");

          const AD_OVERLAY_SEL = [
            ".video-ads", ".ytp-ad-module", ".ytp-ad-overlay-container",
            ".ytp-ad-text-overlay", ".ytp-ad-image-overlay", ".ytp-ad-player-overlay",
            ".ytp-ad-player-overlay-layout", ".ytp-ad-action-interstitial-slot",
            ".ytp-ad-action-interstitial-background-container", ".ytp-ad-progress-list",
            ".ytp-ad-preview-container", ".ytp-ad-preview-text", ".ytp-ad-simple-ad-badge",
            ".ytp-ad-persistent-progress-bar-container", ".ytp-ad-player-overlay-instream-info",
            ".ytp-ad-player-overlay-skip-or-preview", ".ytp-ad-visit-advertiser-button",
            ".ad-simple-attributed-string", ".ytp-ad-badge__text--clean-player",
            "#player-ads", "#player-overlay\\:0", "#player-overlay-layout\\:0"
          ].join(",");

          let adHandling = false;
          let adSeekedToEnd = false;
          let savedMuted = false;
          let savedVolume = 1;
          let adIntervalId: any = null;
          let adRafId: any = null;

          const playerInAdMode = () => {
            const player = document.getElementById("movie_player");
            if (!player) return false;
            return player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
          };

          const clickSkipButtons = () => {
            const btns = document.querySelectorAll(SKIP_BTN_SEL);
            btns.forEach((btn: any) => {
              try { btn.click(); } catch (e) {}
            });
          };

          const hideAdOverlays = () => {
            const els = document.querySelectorAll(AD_OVERLAY_SEL);
            els.forEach((el: any) => {
              el.style.setProperty("display", "none", "important");
            });
          };

          const nukeAdFrame = () => {
            const player = document.getElementById("movie_player");
            if (!player) return;
            const video = player.querySelector("video");
            if (!video) return;

            video.muted = true;

            if (!adSeekedToEnd) {
              const dur = video.duration;
              if (Number.isFinite(dur) && dur > 0 && dur < 300 && video.currentTime < dur - 0.01) {
                video.currentTime = dur;
              }
              if (Number.isFinite(dur) && dur > 0 && video.currentTime >= dur - 0.5) {
                adSeekedToEnd = true;
                try { video.dispatchEvent(new Event("ended")); } catch (e) {}
              }
            }

            clickSkipButtons();
            hideAdOverlays();
          };

          const endAdLoop = () => {
            if (adIntervalId !== null) {
              clearInterval(adIntervalId);
              adIntervalId = null;
            }
            if (adRafId !== null) {
              cancelAnimationFrame(adRafId);
              adRafId = null;
            }

            const player = document.getElementById("movie_player");
            const video = player?.querySelector("video");
            if (video) {
              video.muted = savedMuted;
              video.volume = savedVolume;
              if (video.playbackRate !== 1) video.playbackRate = 1;
            }

            adHandling = false;
          };

          const beginAdLoop = () => {
            if (adIntervalId !== null || adRafId !== null) return;

            const step = () => {
              if (!playerInAdMode()) {
                endAdLoop();
                return;
              }
              nukeAdFrame();
            };

            adIntervalId = setInterval(step, 16);

            const rAfStep = () => {
              if (!playerInAdMode()) return;
              nukeAdFrame();
              adRafId = requestAnimationFrame(rAfStep);
            };
            adRafId = requestAnimationFrame(rAfStep);
          };

          const trySkipAd = () => {
            const player = document.getElementById("movie_player");
            if (!player) return;

            try {
              if (typeof (player as any).skipAd === "function") {
                console.log("[VB-MAIN] Calling player.skipAd()");
                (player as any).skipAd();
              }
              if (typeof (player as any).cancelPlayback === "function") {
                (player as any).cancelPlayback();
              }

              if (typeof (player as any).getVideoData === "function") {
                const vd = (player as any).getVideoData();
                if (vd && vd.isAd) {
                  console.log("[VB-MAIN] Detected isAd=true, seeking to end");
                  const video = player.querySelector("video");
                  if (video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 300) {
                    if (typeof (player as any).seekTo === "function") {
                      (player as any).seekTo(video.duration, true);
                    }
                    video.currentTime = video.duration;
                  }
                }
              }
            } catch (e) {}
          };

          attachPlayerObserver();

          console.log("[VB-MAIN] Patches ready for", plat);
        },
        args: [platform, config.playerPaths, config.adKeys],
      });
      console.log("[VB] Done for", platform, "tab", details.tabId);
    } catch (e) {
      console.error("[VB] Error:", e);
    }
  };

  chrome.webNavigation?.onCommitted?.addListener(handleNavigation);

  chrome.webNavigation?.onHistoryStateUpdated?.addListener(handleNavigation);

  chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab?.url) {
      const platform = detectPlatform(tab.url);
      if (platform && shouldInject(tabId)) {
        console.log("[VB-SW] Tab updated, injecting:", tab.url);
        handleNavigation({ tabId, frameId: 0, url: tab.url });
      }
    }
  });
}

export const registerVideoAdBlocker = () => {
  console.log("[VB-SW] registerVideoAdBlocker called");
  console.log("[VB-SW] chrome.scripting available:", typeof chrome.scripting);
  console.log("[VB-SW] chrome.webNavigation available:", typeof chrome.webNavigation);
  createVideoBlocker();
};

export { detectPlatform, PLATFORMS };
