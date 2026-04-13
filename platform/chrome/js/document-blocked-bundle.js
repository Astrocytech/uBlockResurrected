(() => {
  // src/js/document-blocked.ts
  var fallbackText = /* @__PURE__ */ new Map([
    ["docblockedTitle", "uBlock \u2014 Document blocked"],
    ["docblockedPrompt1", "The document at"],
    ["docblockedPrompt2", "has been blocked by"],
    ["docblockedBack", "Back"],
    ["docblockedClose", "Close"],
    ["docblockedDisable", "Proceed"],
    ["docblockedDontWarn", "Do not warn me again"],
    ["docblockedReasonLabel", "Reason:"],
    ["docblockedRedirectPrompt", "This document was blocked and was to be redirected to {{url}}"],
    ["docblockedFoundIn", "Found in"],
    ["docblockedNoParamsPrompt", "URL parameters"]
  ]);
  var browserRuntime = typeof browser !== "undefined" ? browser.runtime : void 0;
  var sendMessage = async (topic, payload = {}) => {
    const message = { topic, payload };
    if (browserRuntime !== void 0) {
      return await browserRuntime.sendMessage(message);
    }
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(response);
      });
    });
  };
  var details = {};
  {
    const matches = /details=([^&]+)/.exec(window.location.search);
    if (matches !== null) {
      try {
        Object.assign(details, JSON.parse(decodeURIComponent(matches[1])));
      } catch (e) {
        console.error("Failed to parse blocked document details:", e);
      }
    }
  }
  var urlToFragment = (raw) => {
    try {
      const fragment = document.createDocumentFragment();
      const url = new URL(raw);
      const hn = url.hostname;
      const i = raw.indexOf(hn);
      const b = document.createElement("b");
      b.append(hn);
      fragment.append(raw.slice(0, i), b, raw.slice(i + hn.length));
      return fragment;
    } catch {
    }
    return document.createTextNode(raw);
  };
  var applyFallbackTranslations = () => {
    for (const element of document.querySelectorAll("[data-i18n]")) {
      const key = element.dataset.i18n || "";
      const fallback = fallbackText.get(key);
      if (fallback === void 0) {
        continue;
      }
      if (element.textContent?.trim() === "" || element.textContent?.trim() === "_") {
        element.textContent = fallback;
      }
    }
  };
  var applyThemeClasses = () => {
    const root = document.documentElement;
    const dark = typeof self.matchMedia === "function" && self.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", dark === false);
    root.classList.add((navigator.maxTouchPoints || 0) > 0 ? "mobile" : "desktop");
    if (self.matchMedia("(min-resolution: 150dpi)").matches) {
      root.classList.add("hidpi");
    }
  };
  var theUrlSpan = document.querySelector("#theURL > p > span:first-of-type");
  if (theUrlSpan && details.url) {
    theUrlSpan.innerHTML = "";
    theUrlSpan.append(urlToFragment(details.url));
  }
  var lookupFilterLists = async () => {
    if (!details.fs) {
      return [];
    }
    try {
      const response = await sendMessage("documentBlocked", {
        what: "listsFromNetFilter",
        rawFilter: details.fs
      });
      if (response instanceof Object === false) {
        return [];
      }
      for (const rawFilter in response) {
        if (Object.hasOwn(response, rawFilter)) {
          return response[rawFilter] || [];
        }
      }
    } catch (e) {
      console.error("Failed to lookup filter lists:", e);
    }
    return [];
  };
  if (typeof details.to === "string" && details.to.length !== 0) {
    const urlskip = document.getElementById("urlskip");
    if (urlskip) {
      const link = document.createElement("a");
      link.href = details.to;
      link.className = "code";
      link.append(urlToFragment(details.to));
      urlskip.appendChild(link);
      urlskip.hidden = false;
    }
  }
  var reURL = /^https?:\/\//;
  var liFromParam = (name, value) => {
    const li = document.createElement("li");
    const spanName = document.createElement("span");
    spanName.textContent = name;
    li.appendChild(spanName);
    if (name !== "" && value !== "") {
      li.appendChild(document.createTextNode(" = "));
    }
    const spanValue = document.createElement("span");
    if (reURL.test(value)) {
      const a = document.createElement("a");
      a.href = value;
      a.textContent = value;
      spanValue.appendChild(a);
    } else {
      spanValue.textContent = value;
    }
    li.appendChild(spanValue);
    return li;
  };
  var renderParams = (parentNode, rawURL, depth = 0) => {
    let url;
    try {
      url = new URL(rawURL);
    } catch {
      return false;
    }
    const search = url.search.slice(1);
    if (search === "") {
      return false;
    }
    url.search = "";
    const noParamsLi = liFromParam("URL parameters", url.href);
    parentNode.appendChild(noParamsLi);
    const params = new URLSearchParams(search);
    for (const [name, value] of params) {
      const li = liFromParam(name, value);
      if (depth < 2 && reURL.test(value)) {
        const ul = document.createElement("ul");
        renderParams(ul, value, depth + 1);
        li.appendChild(ul);
      }
      parentNode.appendChild(li);
    }
    return true;
  };
  var parsed = document.getElementById("parsed");
  if (parsed && details.url) {
    if (renderParams(parsed, details.url)) {
      const toggleParse2 = document.getElementById("toggleParse");
      if (toggleParse2) {
        toggleParse2.classList.remove("hidden");
      }
    }
  }
  var toggleParse = document.getElementById("toggleParse");
  var theUrl = document.getElementById("theURL");
  toggleParse?.addEventListener("click", () => {
    theUrl?.classList.toggle("collapsed");
    const isExpanded = !theUrl?.classList.contains("collapsed");
    chrome.storage.local.set({ documentBlockedExpandUrl: isExpanded.toString() });
  });
  chrome.storage.local.get("documentBlockedExpandUrl", (items) => {
    const isExpanded = items.documentBlockedExpandUrl === "true";
    if (theUrl && isExpanded) {
      theUrl.classList.remove("collapsed");
    }
  });
  var backBtn = document.getElementById("back");
  var byeBtn = document.getElementById("bye");
  if (window.history.length > 1) {
    backBtn?.addEventListener("click", () => {
      window.history.back();
    });
    if (byeBtn) {
      byeBtn.style.display = "none";
    }
  } else {
    byeBtn?.addEventListener("click", () => {
      void sendMessage("documentBlocked", { what: "closeThisTab" });
    });
    if (backBtn) {
      backBtn.style.display = "none";
    }
  }
  var proceedToURL = () => {
    if (details.url) {
      window.location.replace(details.url);
    }
  };
  var proceedTemporary = async () => {
    if (details.hn) {
      await sendMessage("documentBlocked", {
        what: "temporarilyWhitelistDocument",
        hostname: details.hn
      });
    }
    proceedToURL();
  };
  var proceedPermanent = async () => {
    if (details.hn) {
      await sendMessage("documentBlocked", {
        what: "toggleHostnameSwitch",
        name: "no-strict-blocking",
        hostname: details.hn,
        deep: true,
        state: true,
        persist: true
      });
    }
    proceedToURL();
  };
  var disableWarning = document.getElementById("disableWarning");
  var proceedBtn = document.getElementById("proceed");
  disableWarning?.addEventListener("change", (ev) => {
    const checked = ev.target.checked;
    if (backBtn) {
      backBtn.disabled = checked;
    }
    if (byeBtn) {
      byeBtn.disabled = checked;
    }
  });
  proceedBtn?.addEventListener("click", () => {
    if (disableWarning?.checked) {
      proceedPermanent();
    } else {
      proceedTemporary();
    }
  });
  var renderWhy = (lists) => {
    let reason = details.reason;
    if (!reason && lists.length > 0) {
      reason = lists.reduce((a, b) => a || b.reason, void 0);
    }
    const whyContainer = document.getElementById("why");
    if (!whyContainer) {
      return;
    }
    const template = document.querySelector(reason ? "template.why-reason" : "template.why");
    if (!template) {
      return;
    }
    const why = template.content.cloneNode(true);
    const whyText = why.querySelector(".why");
    if (whyText && details.fs) {
      whyText.textContent = details.fs;
    }
    if (reason) {
      const summary = why.querySelector("summary");
      if (summary) {
        summary.textContent = `Reason: ${reason}`;
      }
    }
    whyContainer.appendChild(why);
    document.body.classList.remove("loading");
    if (lists.length === 0) {
      return;
    }
    const whyExtraTemplate = document.querySelector("template.why-extra");
    const listTemplate = document.querySelector("template.filterList");
    if (!whyExtraTemplate || !listTemplate) {
      return;
    }
    const whyExtra = whyExtraTemplate.content.cloneNode(true);
    const parent = whyExtra.querySelector(".why-extra");
    if (!parent) {
      return;
    }
    let separator = "\xA0\u2022\xA0";
    for (const list of lists) {
      const listElem = listTemplate.content.cloneNode(true);
      const sourceElem = listElem.querySelector(".filterListSource");
      if (sourceElem && list.assetKey) {
        sourceElem.href += encodeURIComponent(list.assetKey);
        sourceElem.textContent = list.title || list.assetKey;
      }
      const supportElem = listElem.querySelector(".filterListSupport");
      if (supportElem && list.supportURL) {
        supportElem.href = list.supportURL;
        supportElem.classList.remove("hidden");
      }
      parent.appendChild(document.createTextNode(separator));
      parent.appendChild(listElem);
      separator = "\xA0\u2022\xA0";
    }
    const whyElement = whyContainer.querySelector(".why");
    if (whyElement && whyExtra) {
      whyElement.after(whyExtra);
    }
  };
  void lookupFilterLists().then((lists) => {
    renderWhy(lists || []);
  });
  applyThemeClasses();
  applyFallbackTranslations();
})();
