/*******************************************************************************

    uBlock Resurrected - YouTube Ad Blocker Injection Script (MAIN WORLD)
    
    This script runs IN THE PAGE CONTEXT (MAIN world) at document_start.
    It patches APIs before YouTube's own scripts run and provides access
    to YouTube's internal player API for ad skipping.

    Based on AdEclipse's approach:
    - Monitors ad-showing/ad-interrupting classes on #movie_player
    - Uses player.skipAd(), player.cancelPlayback() methods
    - Checks player.getVideoData().isAd for ad detection
    - Uses player.seekTo() to skip ad playback
    - Mutes video during ads and restores after

*******************************************************************************/

(function () {
  "use strict";

  console.log("[YT-INJECT] YouTube ad blocker injection starting (MAIN WORLD)...");

  var isYouTube = function () {
    return (
      window.location.hostname.includes("youtube.com") &&
      !window.location.hostname.includes("youtu.be")
    );
  };

  if (!isYouTube()) {
    console.log("[YT-INJECT] Not YouTube, skipping");
    return;
  }

  console.log("[YT-INJECT] YouTube detected, setting up MAIN WORLD interceptors");

  var AD_KEYS = [
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
  ];

  var AD_RENDERER_PATTERNS = [
    "adSlotRenderer",
    "promotedSparkles",
    "promotedVideo",
    "displayAd",
    "inFeedAdLayout",
    "CompanionAd",
    "companionAd",
    "adSlot",
    "searchPyv"
  ];

  var YOUTUBEI_PATTERNS = [
    "/youtubei/v1/player",
    "/youtubei/v1/next",
    "/youtubei/v1/browse",
    "/youtubei/v1/ad_break",
    "/youtubei/v1/reel/reel_watch_sequence",
  ];

  var isTargetYoutubeiRequest = function (url) {
    for (var i = 0; i < YOUTUBEI_PATTERNS.length; i++) {
      if (url.indexOf(YOUTUBEI_PATTERNS[i]) !== -1) return true;
    }
    return false;
  };

  var cleanseObject = function (obj, seen) {
    if (!obj || typeof obj !== "object") return obj;
    seen = seen || new WeakSet();
    if (seen.has(obj)) return obj;
    seen.add(obj);

    if (Array.isArray(obj)) {
      for (var j = 0; j < obj.length; j++) {
        cleanseObject(obj[j], seen);
      }
      return obj;
    }

    for (var i = 0; i < AD_KEYS.length; i++) {
      var key = AD_KEYS[i];
      if (key in obj) {
        delete obj[key];
      }
    }

    if (obj.adPlacements && Array.isArray(obj.adPlacements)) obj.adPlacements = [];
    if (obj.playerAds && Array.isArray(obj.playerAds)) obj.playerAds = [];

    var ARRAY_KEYS = ["contents", "items", "results", "richItems"];
    for (var ai = 0; ai < ARRAY_KEYS.length; ai++) {
      var arrKey = ARRAY_KEYS[ai];
      if (Array.isArray(obj[arrKey])) {
        obj[arrKey] = obj[arrKey].filter(function (item) {
          if (!item || typeof item !== "object") return true;
          var itemKeys = Object.keys(item);
          return !itemKeys.some(function (k) {
            return AD_RENDERER_PATTERNS.some(function (pat) {
              return k.indexOf(pat) !== -1;
            });
          });
        });
      }
    }

    if (obj.playabilityStatus && typeof obj.playabilityStatus === "object") {
      var reason = String(obj.playabilityStatus.reason || "").toLowerCase();
      if (obj.playabilityStatus.status === "ERROR" && reason.indexOf("ad") !== -1) {
        delete obj.playabilityStatus;
      }
    }

    var values = Object.values(obj);
    for (var vi = 0; vi < values.length; vi++) {
      cleanseObject(values[vi], seen);
    }

    return obj;
  };

  var cloneHeaders = function (headers) {
    var next = new Headers();
    headers.forEach(function (value, key) {
      next.set(key, value);
    });
    next.delete("content-length");
    return next;
  };

  var buildJsonResponse = function (json, origin) {
    return new Response(JSON.stringify(json), {
      status: origin.status,
      statusText: origin.statusText,
      headers: cloneHeaders(origin.headers)
    });
  };

  var patchInitialResponse = function () {
    try {
      if (window.ytInitialPlayerResponse) {
        cleanseObject(window.ytInitialPlayerResponse);
      }
    } catch (e) {}
    try {
      if (window.ytInitialData) {
        cleanseObject(window.ytInitialData);
      }
    } catch (e) {}
  };

  var patchInitialPlayerResponseSetter = function () {
    try {
      var current = window.ytInitialPlayerResponse;
      Object.defineProperty(window, "ytInitialPlayerResponse", {
        configurable: true,
        get: function () {
          return current;
        },
        set: function (value) {
          current = cleanseObject(value);
        }
      });
    } catch (e) {}
  };

  var patchInitialDataSetter = function () {
    try {
      var currentData = window.ytInitialData;
      Object.defineProperty(window, "ytInitialData", {
        configurable: true,
        get: function () {
          return currentData;
        },
        set: function (value) {
          currentData = cleanseObject(value);
        }
      });
    } catch (e) {}
  };

  var patchFetch = function () {
    var originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      var response = await originalFetch.call(this, input, init);
      try {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (!isTargetYoutubeiRequest(url)) return response;

        var contentType = response.headers.get("content-type") || "";
        if (!contentType.indexOf("application/json") !== -1) return response;

        var json = await response.clone().json();
        cleanseObject(json);
        return buildJsonResponse(json, response);
      } catch (e) {
        return response;
      }
    };
  };

  var patchXhr = function () {
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ytInjectUrl = String(url || "");
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      if (this.__ytInjectUrl && isTargetYoutubeiRequest(this.__ytInjectUrl)) {
        this.addEventListener("readystatechange", function () {
          if (this.readyState !== 4) return;
          try {
            if (typeof this.responseText !== "string" || !this.responseText) return;
            var parsed = JSON.parse(this.responseText);
            cleanseObject(parsed);
            var serialized = JSON.stringify(parsed);

            try {
              Object.defineProperty(this, "responseText", { configurable: true, value: serialized });
            } catch (err) {}
            try {
              Object.defineProperty(this, "response", { configurable: true, value: serialized });
            } catch (err) {}
          } catch (err) {}
        });
      }

      return originalSend.apply(this, arguments);
    };
  };

  var SKIP_BTN_SEL = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-slot button",
    ".videoAdUiSkipButton",
    "button[class*='ytp-ad-skip']"
  ].join(",");

  var AD_OVERLAY_SEL = [
    ".video-ads",
    ".ytp-ad-module",
    ".ytp-ad-overlay-container",
    ".ytp-ad-text-overlay",
    ".ytp-ad-image-overlay",
    ".ytp-ad-player-overlay",
    ".ytp-ad-player-overlay-layout",
    ".ytp-ad-action-interstitial-slot",
    ".ytp-ad-action-interstitial-background-container",
    ".ytp-ad-progress-list",
    ".ytp-ad-preview-container",
    ".ytp-ad-preview-text",
    ".ytp-ad-simple-ad-badge",
    ".ytp-ad-persistent-progress-bar-container",
    ".ytp-ad-player-overlay-instream-info",
    ".ytp-ad-player-overlay-skip-or-preview",
    ".ytp-ad-visit-advertiser-button",
    ".ad-simple-attributed-string",
    ".ytp-ad-badge__text--clean-player",
    "#player-ads",
    "#player-overlay\\:0",
    "#player-overlay-layout\\:0"
  ].join(",");

  var playerInAdMode = function (player) {
    return (
      player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting")
    );
  };

  var adHandling = false;
  var adSeekedToEnd = false;
  var savedMuted = false;
  var savedVolume = 1;
  var adIntervalId = null;
  var adRafId = null;

  var clickSkipButtons = function () {
    var btns = document.querySelectorAll(SKIP_BTN_SEL);
    for (var i = 0; i < btns.length; i++) {
      try {
        btns[i].click();
      } catch (e) {}
    }
  };

  var hideAdOverlays = function () {
    var els = document.querySelectorAll(AD_OVERLAY_SEL);
    for (var i = 0; i < els.length; i++) {
      els[i].style.setProperty("display", "none", "important");
    }
  };

  var nukeAdFrame = function (player) {
    var video = player.querySelector("video");
    if (!video) return;

    video.muted = true;

    if (!adSeekedToEnd) {
      var dur = video.duration;
      if (Number.isFinite(dur) && dur > 0 && dur < 300 && video.currentTime < dur - 0.01) {
        video.currentTime = dur;
      }

      if (Number.isFinite(dur) && dur > 0 && video.currentTime >= dur - 0.5) {
        adSeekedToEnd = true;
        try {
          video.dispatchEvent(new Event("ended"));
        } catch (e) {}
      }
    }

    clickSkipButtons();
    hideAdOverlays();
  };

  var endAdLoop = function (player) {
    if (adIntervalId !== null) {
      clearInterval(adIntervalId);
      adIntervalId = null;
    }
    if (adRafId !== null) {
      cancelAnimationFrame(adRafId);
      adRafId = null;
    }

    var video = player.querySelector("video");
    if (video) {
      video.muted = savedMuted;
      video.volume = savedVolume;
      if (video.playbackRate !== 1) video.playbackRate = 1;
    }

    adHandling = false;
  };

  var beginAdLoop = function (player) {
    if (adIntervalId !== null || adRafId !== null) return;

    var step = function () {
      if (!playerInAdMode(player)) {
        endAdLoop(player);
        return;
      }
      nukeAdFrame(player);
    };

    adIntervalId = setInterval(function () {
      step();
    }, 16);

    var rAfStep = function () {
      if (!playerInAdMode(player)) return;
      nukeAdFrame(player);
      adRafId = requestAnimationFrame(rAfStep);
    };
    adRafId = requestAnimationFrame(rAfStep);
  };

  var trySkipAd = function () {
    try {
      var player = document.getElementById("movie_player");
      if (!player) return;

      if (typeof player.skipAd === "function") player.skipAd();
      if (typeof player.cancelPlayback === "function") player.cancelPlayback();

      if (typeof player.getVideoData === "function") {
        var vd = player.getVideoData();
        if (vd && vd.isAd) {
          var video = player.querySelector("video");
          if (video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 300) {
            if (typeof player.seekTo === "function") {
              player.seekTo(video.duration, true);
            }
          }
        }
      }
    } catch (e) {}
  };

  var onPlayerStateChange = function (player) {
    if (playerInAdMode(player)) {
      if (!adHandling) {
        adHandling = true;
        adSeekedToEnd = false;

        var video = player.querySelector("video");
        if (video) {
          savedMuted = video.muted;
          savedVolume = video.volume;

          var onMeta = function () {
            video.removeEventListener("loadedmetadata", onMeta, true);
            if (playerInAdMode(player) && !adSeekedToEnd) {
              var dur = video.duration;
              if (Number.isFinite(dur) && dur > 0 && dur < 300) {
                video.currentTime = dur;
              }
            }
          };
          video.addEventListener("loadedmetadata", onMeta, true);
        }
      }

      nukeAdFrame(player);
      trySkipAd();
      beginAdLoop(player);
    } else if (adHandling) {
      endAdLoop(player);
    }
  };

  var installMainWorldAdSkipper = function () {
    var player = document.getElementById("movie_player");
    if (!player) {
      setTimeout(installMainWorldAdSkipper, 100);
      return;
    }

    onPlayerStateChange(player);

    new MutationObserver(function () {
      onPlayerStateChange(player);
    }).observe(player, { attributes: true, attributeFilter: ["class"] });

    setInterval(function () {
      if (playerInAdMode(player)) {
        onPlayerStateChange(player);
      }
    }, 100);
  };

  var injectAdHidingCSS = function () {
    var css = [
      "#movie_player.ad-showing video,",
      "#movie_player.ad-interrupting video",
      "{visibility:hidden!important}",

      "#movie_player.ad-showing .ytp-spinner,",
      "#movie_player.ad-showing .ytp-spinner-container,",
      "#movie_player.ad-interrupting .ytp-spinner,",
      "#movie_player.ad-interrupting .ytp-spinner-container",
      "{display:none!important}",

      AD_OVERLAY_SEL,
      "{display:none!important;visibility:hidden!important;opacity:0!important}",
      "height:0!important;width:0!important;overflow:hidden!important;pointer-events:none!important}"
    ].join("");

    var style = document.createElement("style");
    style.id = "yt-inject-ad-hiding";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };

  patchInitialResponse();
  patchInitialPlayerResponseSetter();
  patchInitialDataSetter();
  patchFetch();
  patchXhr();
  injectAdHidingCSS();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installMainWorldAdSkipper);
  } else {
    installMainWorldAdSkipper();
  }

  setTimeout(function () {
    purgeStaticAds();
  }, 1000);

  console.log("[YT-INJECT] MAIN WORLD YouTube ad blocker injection complete");
})();
