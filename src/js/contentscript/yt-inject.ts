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

  console.log("[YT-INJECT-MAIN] YouTube ad blocker injection starting");

  var isYouTube = function () {
    return (
      window.location.hostname.indexOf("youtube.com") !== -1 &&
      window.location.hostname.indexOf("youtu.be") === -1
    );
  };

  if (!isYouTube()) {
    console.log("[YT-INJECT-MAIN] Not YouTube, skipping");
    return;
  }

  console.log("[YT-INJECT-MAIN] YouTube detected, setting up MAIN WORLD interceptors");

  var AD_KEYS = [
    "adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams",
    "adServerLogger", "adBreakOverlays", "adBreakResponse", "adShowing",
    "adFormat", "adNumSegments", "adDurationMillis", "adDeviceRestriction",
    "adEligibilityReasons", "adEngagementEnabled", "adLoadPolicyConfig",
    "adLogability", "adMentions", "adPlaybackMobile", "adPlaybackIos",
    "adPlaybackOther", "adPlaybackPC", "adPlayers", "adProduct", "adRye",
    "adSessionId", "adSlot", "adSlots", "adTag", "adTags", "adTargeting",
    "adThirdPartyAnchor", "adTimings", "adTracking", "adPrerolls", "hasAds",
    "isAd", "isTeva", "trafficType", "standalonePromoRenderer", "adConfig",
    "adInfo", "playerAds", "adShow", "adIntervals", "adActiveView", "adRenderer",
    "adWhitelist", "instream", "skipOffset", "adSkipOffset", "adSafetyReason",
    "streamingAds", "ad3Module", "adState", "adBreakParams", "adModule",
    "adPlaybackContext", "adVideoId", "adLayoutLoggingData", "adInfoRenderer",
    "adNextParams", "instreamVideoAdRenderer", "linearAdSequenceRenderer",
    "adSignalsInfo", "adBreakServiceRenderer", "adSlotRenderer", "adBreakRenderer",
    "advertiserInfoRenderer", "promotedSparklesWebRenderer", "playerResponse"
  ];

  var YOUTUBEI_PATTERNS = [
    "/youtubei/v1/player", "/youtubei/v1/next", "/youtubei/v1/browse",
    "/youtubei/v1/ad_break", "/youtubei/v1/reel/reel_watch_sequence"
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

  var patchFetch = function () {
    var originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      var response = await originalFetch.call(this, input, init);
      try {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (!isTargetYoutubeiRequest(url)) return response;

        var contentType = response.headers.get("content-type") || "";
        if (contentType.indexOf("application/json") === -1) return response;

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
    ".ytp-skip-ad-button", ".ytp-ad-skip-button", ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button", ".ytp-ad-skip-button-slot button",
    ".videoAdUiSkipButton", "button[class*='ytp-ad-skip']"
  ].join(",");

  var AD_OVERLAY_SEL = [
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

  var adHandling = false;
  var adSeekedToEnd = false;
  var savedMuted = false;
  var savedVolume = 1;
  var adIntervalId = null;
  var adRafId = null;

  var playerInAdMode = function () {
    var player = document.getElementById("movie_player");
    if (!player) return false;
    return player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
  };

  var clickSkipButtons = function () {
    var btns = document.querySelectorAll(SKIP_BTN_SEL);
    btns.forEach(function (btn) {
      try { btn.click(); } catch (e) {}
    });
  };

  var hideAdOverlays = function () {
    var els = document.querySelectorAll(AD_OVERLAY_SEL);
    els.forEach(function (el) {
      el.style.setProperty("display", "none", "important");
    });
  };

  var nukeAdFrame = function () {
    var player = document.getElementById("movie_player");
    if (!player) return;
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
        try { video.dispatchEvent(new Event("ended")); } catch (e) {}
      }
    }

    clickSkipButtons();
    hideAdOverlays();
  };

  var endAdLoop = function () {
    if (adIntervalId !== null) {
      clearInterval(adIntervalId);
      adIntervalId = null;
    }
    if (adRafId !== null) {
      cancelAnimationFrame(adRafId);
      adRafId = null;
    }

    var player = document.getElementById("movie_player");
    var video = player && player.querySelector("video");
    if (video) {
      video.muted = savedMuted;
      video.volume = savedVolume;
      if (video.playbackRate !== 1) video.playbackRate = 1;
    }

    adHandling = false;
  };

  var beginAdLoop = function () {
    if (adIntervalId !== null || adRafId !== null) return;

    var step = function () {
      if (!playerInAdMode()) {
        endAdLoop();
        return;
      }
      nukeAdFrame();
    };

    adIntervalId = setInterval(step, 16);

    var rAfStep = function () {
      if (!playerInAdMode()) return;
      nukeAdFrame();
      adRafId = requestAnimationFrame(rAfStep);
    };
    adRafId = requestAnimationFrame(rAfStep);
  };

  var trySkipAd = function () {
    var player = document.getElementById("movie_player");
    if (!player) return;

    try {
      if (typeof player.skipAd === "function") player.skipAd();
      if (typeof player.cancelPlayback === "function") player.cancelPlayback();

      if (typeof player.getVideoData === "function") {
        var vd = player.getVideoData();
        if (vd && vd.isAd) {
          var video = player.querySelector("video");
          if (video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 300) {
            if (typeof player.seekTo === "function") player.seekTo(video.duration, true);
            video.currentTime = video.duration;
          }
        }
      }
    } catch (e) {}
  };

  var onPlayerStateChange = function () {
    var player = document.getElementById("movie_player");
    if (!player) return;

    if (playerInAdMode()) {
      if (!adHandling) {
        adHandling = true;
        adSeekedToEnd = false;

        var video = player.querySelector("video");
        if (video) {
          savedMuted = video.muted;
          savedVolume = video.volume;

          var onMeta = function () {
            video.removeEventListener("loadedmetadata", onMeta, true);
            if (playerInAdMode() && !adSeekedToEnd) {
              var dur = video.duration;
              if (Number.isFinite(dur) && dur > 0 && dur < 300) {
                video.currentTime = dur;
              }
            }
          };
          video.addEventListener("loadedmetadata", onMeta, true);
        }
      }

      nukeAdFrame();
      trySkipAd();
      beginAdLoop();
    } else if (adHandling) {
      endAdLoop();
    }
  };

  var injectCSS = function () {
    var css = [
      "#movie_player.ad-showing video,",
      "#movie_player.ad-interrupting video { visibility: hidden !important; }",
      "#movie_player.ad-showing .ytp-spinner,",
      "#movie_player.ad-showing .ytp-spinner-container,",
      "#movie_player.ad-interrupting .ytp-spinner,",
      "#movie_player.ad-interrupting .ytp-spinner-container { display: none !important; }",
      AD_OVERLAY_SEL,
      "{display: none !important; visibility: hidden !important; opacity: 0 !important; }"
    ].join("");
    var style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };

  var installMainWorldAdSkipper = function () {
    var player = document.getElementById("movie_player");
    if (!player) {
      setTimeout(installMainWorldAdSkipper, 100);
      return;
    }

    injectCSS();
    onPlayerStateChange();

    new MutationObserver(function () {
      onPlayerStateChange();
    }).observe(player, { attributes: true, attributeFilter: ["class"] });

    setInterval(function () {
      if (playerInAdMode()) onPlayerStateChange();
    }, 100);
  };

  patchFetch();
  patchXhr();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installMainWorldAdSkipper);
  } else {
    installMainWorldAdSkipper();
  }

  console.log("[YT-INJECT-MAIN] YouTube ad blocker injection complete");
})();
