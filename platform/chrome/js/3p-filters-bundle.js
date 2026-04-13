(() => {
  // dom.ts
  var normalizeTarget = (target) => {
    if (typeof target === "string") {
      return Array.from(qsa$(target));
    }
    if (target instanceof Element) {
      return [target];
    }
    if (target === null) {
      return [];
    }
    if (Array.isArray(target)) {
      return target;
    }
    return Array.from(target);
  };
  var makeEventHandler = (selector, callback) => {
    return function(event2) {
      const dispatcher = event2.currentTarget;
      if (dispatcher instanceof HTMLElement === false || typeof dispatcher.querySelectorAll !== "function") {
        return;
      }
      const receiver = event2.target;
      const ancestor = receiver?.closest(selector);
      if (ancestor === receiver && ancestor !== dispatcher && dispatcher.contains(ancestor)) {
        callback.call(receiver, event2);
      }
    };
  };
  var dom = class {
    static attr(target, attr, value) {
      for (const elem of normalizeTarget(target)) {
        if (value === void 0) {
          return elem.getAttribute(attr);
        }
        if (value === null) {
          elem.removeAttribute(attr);
        } else {
          elem.setAttribute(attr, value);
        }
      }
      return void 0;
    }
    static clear(target) {
      for (const elem of normalizeTarget(target)) {
        while (elem.firstChild !== null) {
          elem.removeChild(elem.firstChild);
        }
      }
    }
    static clone(target) {
      const elements = normalizeTarget(target);
      if (elements.length === 0) {
        return null;
      }
      return elements[0].cloneNode(true);
    }
    static create(a) {
      if (typeof a === "string") {
        return document.createElement(a);
      }
      return void 0;
    }
    static prop(target, prop, value) {
      for (const elem of normalizeTarget(target)) {
        if (value === void 0) {
          return elem[prop];
        }
        elem[prop] = value;
      }
      return void 0;
    }
    static text(target, text) {
      const targets = normalizeTarget(target);
      if (text === void 0) {
        return targets.length !== 0 ? targets[0].textContent ?? void 0 : void 0;
      }
      for (const elem of targets) {
        elem.textContent = text;
      }
      return void 0;
    }
    static remove(target) {
      for (const elem of normalizeTarget(target)) {
        elem.remove();
      }
    }
    static empty(target) {
      for (const elem of normalizeTarget(target)) {
        while (elem.firstElementChild !== null) {
          elem.firstElementChild.remove();
        }
      }
    }
    // target, type, callback, [options]
    // target, type, subtarget, callback, [options]
    static on(target, type, subtarget, callback, options) {
      let actualCallback;
      let actualOptions;
      if (typeof subtarget === "function") {
        actualOptions = options;
        actualCallback = subtarget;
        subtarget = "";
        if (typeof actualOptions === "boolean") {
          actualOptions = { capture: true };
        }
      } else {
        actualCallback = makeEventHandler(subtarget, callback);
        if (actualOptions === void 0 || typeof actualOptions === "boolean") {
          actualOptions = { capture: true };
        } else {
          actualOptions.capture = true;
        }
      }
      const targets = target instanceof Window || target instanceof Document ? [target] : normalizeTarget(target);
      for (const elem of targets) {
        elem.addEventListener(type, actualCallback, actualOptions);
      }
    }
    static off(target, type, callback, options) {
      if (typeof callback !== "function") {
        return;
      }
      let actualOptions;
      if (typeof options === "boolean") {
        actualOptions = { capture: true };
      } else {
        actualOptions = options;
      }
      const targets = target instanceof Window || target instanceof Document ? [target] : normalizeTarget(target);
      for (const elem of targets) {
        elem.removeEventListener(type, callback, actualOptions);
      }
    }
    static onFirstShown(fn, elem) {
      let observer = new IntersectionObserver((entries) => {
        if (entries.every((a) => a.isIntersecting === false)) {
          return;
        }
        try {
          fn();
        } catch {
        }
        observer?.disconnect();
        observer = void 0;
      });
      observer.observe(elem);
    }
  };
  dom.cl = class {
    static add(target, name) {
      for (const elem of normalizeTarget(target)) {
        elem.classList.add(name);
      }
    }
    static remove(target, ...names) {
      for (const elem of normalizeTarget(target)) {
        elem.classList.remove(...names);
      }
    }
    static toggle(target, name, state) {
      let r;
      for (const elem of normalizeTarget(target)) {
        r = elem.classList.toggle(name, state);
      }
      return r;
    }
    static has(target, name) {
      for (const elem of normalizeTarget(target)) {
        if (elem.classList.contains(name)) {
          return true;
        }
      }
      return false;
    }
  };
  function qs$(a, b) {
    if (typeof a === "string") {
      return document.querySelector(a);
    }
    if (a === null) {
      return null;
    }
    return a.querySelector(b ?? "");
  }
  function qsa$(a, b) {
    if (typeof a === "string") {
      return document.querySelectorAll(a);
    }
    if (a === null) {
      return [];
    }
    return a.querySelectorAll(b ?? "");
  }
  dom.root = qs$(":root");
  dom.html = document.documentElement;
  dom.head = document.head;
  dom.body = document.body;

  // i18n.ts
  var i18n = null;
  if (typeof self.browser !== "undefined" && self.browser instanceof Object && !(self.browser instanceof Element)) {
    i18n = self.browser.i18n;
  } else if (typeof self.chrome !== "undefined" && self.chrome.i18n) {
    i18n = self.chrome.i18n;
  }
  if (!i18n) {
    i18n = {
      getMessage: function(key, _args) {
        return key;
      },
      safeTemplateToDOM: function(_id, _dict, parent) {
        if (parent === void 0) {
          return document.createDocumentFragment();
        }
        return parent;
      },
      render: function(_context) {
      },
      renderElapsedTimeToString: function(_tstamp) {
        return "";
      },
      patchUnicodeFlags: function(_text) {
        return document.createDocumentFragment();
      }
    };
  }
  var i18n$ = (...args) => i18n.getMessage(args[0], args.slice(1));
  var isBackgroundProcess = document.title === "uBlock Resurrected Background Page";
  if (isBackgroundProcess !== true) {
    document.body.setAttribute(
      "dir",
      ["ar", "he", "fa", "ps", "ur"].indexOf(i18n$("@@ui_locale")) !== -1 ? "rtl" : "ltr"
    );
    const allowedTags = /* @__PURE__ */ new Set([
      "a",
      "b",
      "code",
      "em",
      "i",
      "span",
      "u"
    ]);
    const expandHtmlEntities = /* @__PURE__ */ (() => {
      const entities = /* @__PURE__ */ new Map([
        ["&shy;", "\xAD"],
        ["&ldquo;", "\u201C"],
        ["&rdquo;", "\u201D"],
        ["&lsquo;", "\u2018"],
        ["&rsquo;", "\u2019"],
        ["&lt;", "<"],
        ["&gt;", ">"]
      ]);
      const decodeEntities = (match) => {
        return entities.get(match) || match;
      };
      return function(text) {
        if (text.indexOf("&") !== -1) {
          text = text.replace(/&[a-z]+;/g, decodeEntities);
        }
        return text;
      };
    })();
    const safeTextToTextNode = function(text) {
      return document.createTextNode(expandHtmlEntities(text));
    };
    const sanitizeElement = function(node) {
      if (allowedTags.has(node.localName) === false) {
        return null;
      }
      node.removeAttribute("style");
      let child = node.firstElementChild;
      while (child !== null) {
        const next = child.nextElementSibling;
        if (sanitizeElement(child) === null) {
          child.remove();
        }
        child = next;
      }
      return node;
    };
    const safeTextToDOM = function(text, parent) {
      if (text === "") {
        return;
      }
      const hasTemplate = text.indexOf("{{") !== -1;
      if (text.indexOf("<") === -1 && !hasTemplate) {
        const toInsert = safeTextToTextNode(text);
        if (parent.childNodes.length !== 0) {
          const toRemove = [];
          let child = parent.firstChild;
          while (child !== null) {
            const next = child.nextSibling;
            if (child.nodeType === 3 && child.nodeValue !== null) {
              toRemove.push(child);
            }
            child = next;
          }
          for (const node2 of toRemove) {
            node2.remove();
          }
        }
        parent.appendChild(toInsert);
        return;
      }
      text = text.replace(/^<p>|<\/p>/g, "").replace(/<p>/g, "\n\n");
      const domParser = new DOMParser();
      const parsedDoc = domParser.parseFromString(text, "text/html");
      if (parent.childNodes.length !== 0) {
        const toRemove = [];
        let child = parent.firstChild;
        while (child !== null) {
          const next = child.nextSibling;
          if (child.nodeType === 3 && child.nodeValue !== null) {
            toRemove.push(child);
          }
          child = next;
        }
        for (const node2 of toRemove) {
          node2.remove();
        }
      }
      let node = parsedDoc.body.firstChild;
      while (node !== null) {
        const next = node.nextSibling;
        switch (node.nodeType) {
          case 1:
            if (sanitizeElement(node) === null) {
              break;
            }
            parent.appendChild(node);
            break;
          case 3:
            parent.appendChild(node);
            break;
          default:
            break;
        }
        node = next;
      }
    };
    i18n.safeTemplateToDOM = function(id, dict, parent) {
      if (parent === void 0) {
        parent = document.createDocumentFragment();
      }
      let textin = i18n$(id);
      if (textin === "") {
        return parent;
      }
      if (textin.indexOf("{{") === -1) {
        safeTextToDOM(textin, parent);
        return parent;
      }
      const re = /\{\{\w+\}\}/g;
      let textout = "";
      for (; ; ) {
        const match = re.exec(textin);
        if (match === null) {
          textout += textin;
          break;
        }
        textout += textin.slice(0, match.index);
        let prop = match[0].slice(2, -2);
        if (Object.hasOwn(dict, prop)) {
          textout += dict[prop].replace(/</g, "&lt;").replace(/>/g, "&gt;");
        } else {
          textout += prop;
        }
        textin = textin.slice(re.lastIndex);
      }
      safeTextToDOM(textout, parent);
      return parent;
    };
    i18n.render = function(context) {
      const docu = document;
      const root = context || docu;
      const elems = root.querySelectorAll("[data-i18n]");
      for (let i = 0; i < elems.length; i++) {
        const elem = elems[i];
        let text = i18n$(elem.getAttribute("data-i18n") || "");
        if (!text) {
          continue;
        }
        if (text.indexOf("{{") === -1) {
          safeTextToDOM(text, elem);
          continue;
        }
        const parts = text.split(/(\{\{[^}]+\}\})/);
        const fragment = document.createDocumentFragment();
        let textBefore = "";
        for (let j = 0; j < parts.length; j++) {
          const part = parts[j];
          if (part === "") {
            continue;
          }
          if (part.startsWith("{{") && part.endsWith("}}")) {
            const pos = part.indexOf(":");
            if (pos !== -1) {
              part.slice(0, pos) + part.slice(-2);
            }
            const selector = part.slice(2, -2);
            let node;
            if (selector.charCodeAt(0) !== 46) {
              node = elem.querySelector(`.${selector}`);
            }
            if (node instanceof Element === false) {
              node = elem.querySelector(selector);
            }
            if (node instanceof Element) {
              safeTextToDOM(textBefore, fragment);
              fragment.appendChild(node);
              textBefore = "";
              continue;
            }
          }
          textBefore += part;
        }
        if (textBefore !== "") {
          safeTextToDOM(textBefore, fragment);
        }
        elem.appendChild(fragment);
      }
      const elemsTitle = root.querySelectorAll("[data-i18n-title]");
      for (let i = 0; i < elemsTitle.length; i++) {
        const elem = elemsTitle[i];
        const text = i18n$(elem.getAttribute("data-i18n-title") || "");
        if (!text) {
          continue;
        }
        elem.setAttribute("title", expandHtmlEntities(text));
      }
      const elemsPlaceholder = root.querySelectorAll("[placeholder]");
      for (let i = 0; i < elemsPlaceholder.length; i++) {
        const elem = elemsPlaceholder[i];
        const text = i18n$(elem.getAttribute("placeholder") || "");
        if (text === "") {
          continue;
        }
        elem.setAttribute("placeholder", text);
      }
      const elemsTip = root.querySelectorAll("[data-i18n-tip]");
      for (let i = 0; i < elemsTip.length; i++) {
        const elem = elemsTip[i];
        const text = i18n$(elem.getAttribute("data-i18n-tip") || "").replace(/<br>/g, "\n").replace(/\n{3,}/g, "\n\n");
        elem.setAttribute("data-tip", text);
        if (elem.getAttribute("aria-label") === "data-tip") {
          elem.setAttribute("aria-label", text);
        }
      }
      const elemsLabel = root.querySelectorAll("[data-i18n-label]");
      for (let i = 0; i < elemsLabel.length; i++) {
        const elem = elemsLabel[i];
        const text = i18n$(elem.getAttribute("data-i18n-label") || "");
        elem.setAttribute("label", text);
      }
    };
    i18n.renderElapsedTimeToString = function(tstamp) {
      let value = (Date.now() - tstamp) / 6e4;
      if (value < 2) {
        return i18n$("elapsedOneMinuteAgo");
      }
      if (value < 60) {
        return i18n$("elapsedManyMinutesAgo").replace("{{value}}", Math.floor(value).toLocaleString());
      }
      value /= 60;
      if (value < 2) {
        return i18n$("elapsedOneHourAgo");
      }
      if (value < 24) {
        return i18n$("elapsedManyHoursAgo").replace("{{value}}", Math.floor(value).toLocaleString());
      }
      value /= 24;
      if (value < 2) {
        return i18n$("elapsedOneDayAgo");
      }
      return i18n$("elapsedManyDaysAgo").replace("{{value}}", Math.floor(value).toLocaleString());
    };
    const unicodeFlagToImageSrc = /* @__PURE__ */ new Map([
      ["\u{1F1E6}\u{1F1F1}", "al"],
      ["\u{1F1E6}\u{1F1F7}", "ar"],
      ["\u{1F1E6}\u{1F1F9}", "at"],
      ["\u{1F1E7}\u{1F1E6}", "ba"],
      ["\u{1F1E7}\u{1F1EA}", "be"],
      ["\u{1F1E7}\u{1F1EC}", "bg"],
      ["\u{1F1E7}\u{1F1F7}", "br"],
      ["\u{1F1E8}\u{1F1E6}", "ca"],
      ["\u{1F1E8}\u{1F1ED}", "ch"],
      ["\u{1F1E8}\u{1F1F3}", "cn"],
      ["\u{1F1E8}\u{1F1F4}", "co"],
      ["\u{1F1E8}\u{1F1FE}", "cy"],
      ["\u{1F1E8}\u{1F1FF}", "cz"],
      ["\u{1F1E9}\u{1F1EA}", "de"],
      ["\u{1F1E9}\u{1F1F0}", "dk"],
      ["\u{1F1E9}\u{1F1FF}", "dz"],
      ["\u{1F1EA}\u{1F1EA}", "ee"],
      ["\u{1F1EA}\u{1F1EC}", "eg"],
      ["\u{1F1EA}\u{1F1F8}", "es"],
      ["\u{1F1EB}\u{1F1EE}", "fi"],
      ["\u{1F1EB}\u{1F1F4}", "fo"],
      ["\u{1F1EB}\u{1F1F7}", "fr"],
      ["\u{1F1EC}\u{1F1F7}", "gr"],
      ["\u{1F1ED}\u{1F1F7}", "hr"],
      ["\u{1F1ED}\u{1F1FA}", "hu"],
      ["\u{1F1EE}\u{1F1E9}", "id"],
      ["\u{1F1EE}\u{1F1F1}", "il"],
      ["\u{1F1EE}\u{1F1F3}", "in"],
      ["\u{1F1EE}\u{1F1F7}", "ir"],
      ["\u{1F1EE}\u{1F1F8}", "is"],
      ["\u{1F1EE}\u{1F1F9}", "it"],
      ["\u{1F1EF}\u{1F1F5}", "jp"],
      ["\u{1F1F0}\u{1F1F7}", "kr"],
      ["\u{1F1F0}\u{1F1FF}", "kz"],
      ["\u{1F1F1}\u{1F1F0}", "lk"],
      ["\u{1F1F1}\u{1F1F9}", "lt"],
      ["\u{1F1F1}\u{1F1FB}", "lv"],
      ["\u{1F1F2}\u{1F1E6}", "ma"],
      ["\u{1F1F2}\u{1F1E9}", "md"],
      ["\u{1F1F2}\u{1F1F0}", "mk"],
      ["\u{1F1F2}\u{1F1FD}", "mx"],
      ["\u{1F1F2}\u{1F1FE}", "my"],
      ["\u{1F1F3}\u{1F1F1}", "nl"],
      ["\u{1F1F3}\u{1F1F4}", "no"],
      ["\u{1F1F3}\u{1F1F5}", "np"],
      ["\u{1F1F5}\u{1F1F1}", "pl"],
      ["\u{1F1F5}\u{1F1F9}", "pt"],
      ["\u{1F1F7}\u{1F1F4}", "ro"],
      ["\u{1F1F7}\u{1F1F8}", "rs"],
      ["\u{1F1F7}\u{1F1FA}", "ru"],
      ["\u{1F1F8}\u{1F1E6}", "sa"],
      ["\u{1F1F8}\u{1F1EE}", "si"],
      ["\u{1F1F8}\u{1F1F0}", "sk"],
      ["\u{1F1F8}\u{1F1EA}", "se"],
      ["\u{1F1F8}\u{1F1F7}", "sr"],
      ["\u{1F1F9}\u{1F1ED}", "th"],
      ["\u{1F1F9}\u{1F1EF}", "tj"],
      ["\u{1F1F9}\u{1F1FC}", "tw"],
      ["\u{1F1F9}\u{1F1F7}", "tr"],
      ["\u{1F1FA}\u{1F1E6}", "ua"],
      ["\u{1F1FA}\u{1F1FF}", "uz"],
      ["\u{1F1FB}\u{1F1F3}", "vn"],
      ["\u{1F1FD}\u{1F1F0}", "xk"]
    ]);
    const reUnicodeFlags = new RegExp(
      Array.from(unicodeFlagToImageSrc).map((a) => a[0]).join("|"),
      "gu"
    );
    i18n.patchUnicodeFlags = function(text) {
      const fragment = document.createDocumentFragment();
      let i = 0;
      for (; ; ) {
        const match = reUnicodeFlags.exec(text);
        if (match === null) {
          break;
        }
        if (match.index > i) {
          fragment.append(text.slice(i, match.index));
        }
        const img = document.createElement("img");
        const countryCode = unicodeFlagToImageSrc.get(match[0]);
        img.src = `/img/flags-of-the-world/${countryCode}.png`;
        img.title = countryCode;
        img.classList.add("countryFlag");
        fragment.append(img, "\u200A");
        i = reUnicodeFlags.lastIndex;
      }
      if (i < text.length) {
        fragment.append(text.slice(i));
      }
      return fragment;
    };
    i18n.render();
  }

  // webext.js
  var webext_default = browser;

  // broadcast.ts
  var broadcastChannel;
  function broadcast(message) {
    if (broadcastChannel === void 0) {
      broadcastChannel = new self.BroadcastChannel("uBR");
    }
    broadcastChannel.postMessage(message);
  }
  function onBroadcast(listener) {
    const bc = new self.BroadcastChannel("uBR");
    bc.onmessage = (ev) => listener(ev.data || {});
    return bc;
  }
  function filteringBehaviorChanged(details = {}) {
    if (typeof details.direction !== "number" || details.direction >= 0) {
      filteringBehaviorChanged.throttle.offon(727);
    }
    broadcast(Object.assign({ what: "filteringBehaviorChanged" }, details));
  }
  filteringBehaviorChanged.throttle = vAPI.defer.create(() => {
    const { history, max } = filteringBehaviorChanged;
    const now = Date.now() / 1e3 | 0;
    if (history.length >= max) {
      if (now - history[0] <= 10 * 60) {
        return;
      }
      history.shift();
    }
    history.push(now);
    vAPI.net.handlerBehaviorChanged();
  });
  filteringBehaviorChanged.history = [];
  filteringBehaviorChanged.max = Math.min(
    browser.webRequest.MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES - 1,
    19
  );

  // 3p-filters.ts
  self.cloud = self.cloud || {
    options: {},
    datakey: "",
    data: void 0,
    onPush: null,
    onPull: null
  };
  var lastUpdateTemplateString = i18n$("3pLastUpdate");
  var obsoleteTemplateString = i18n$("3pExternalListObsolete");
  var reValidExternalList = /^[a-z-]+:\/\/(?:\S+\/\S*|\/\S+)/m;
  var recentlyUpdated = 1 * 60 * 60 * 1e3;
  var listsetDetails = {
    current: {},
    available: {},
    cache: {}
  };
  onBroadcast((msg) => {
    switch (msg.what) {
      case "assetUpdated":
        updateAssetStatus(msg);
        break;
      case "assetsUpdated":
        dom.cl.remove(dom.body, "updating");
        renderWidgets();
        break;
      case "staticFilteringDataChanged":
        renderFilterLists();
        break;
      default:
        break;
    }
  });
  var renderNumber = (value) => {
    return value.toLocaleString();
  };
  var listStatsTemplate = i18n$("3pListsOfBlockedHostsPerListStats");
  var renderLeafStats = (used, total) => {
    if (isNaN(used) || isNaN(total)) {
      return "";
    }
    return listStatsTemplate.replace("{{used}}", renderNumber(used)).replace("{{total}}", renderNumber(total));
  };
  var renderNodeStats = (used, total) => {
    if (isNaN(used) || isNaN(total)) {
      return "";
    }
    return `${used.toLocaleString()}/${total.toLocaleString()}`;
  };
  var i18nGroupName = (name) => {
    const groupname = i18n$("3pGroup" + name.charAt(0).toUpperCase() + name.slice(1));
    if (groupname !== "") {
      return groupname;
    }
    return `${name.charAt(0).toLocaleUpperCase()}${name.slice(1)}`;
  };
  var renderFilterLists = () => {
    const listNameFromListKey = (listkey) => {
      const list = listsetDetails.current[listkey] || listsetDetails.available[listkey];
      const title = list && list.title || "";
      if (title !== "") {
        return title;
      }
      return listkey;
    };
    const initializeListEntry = (listDetails, listEntry) => {
      const listkey = listEntry.dataset.key;
      const groupkey = listDetails.group2 || listDetails.group;
      const listEntryPrevious = qs$(`[data-key="${groupkey}"] [data-key="${listkey}"]`);
      if (listEntryPrevious !== null) {
        if (dom.cl.has(listEntryPrevious, "checked")) {
          dom.cl.add(listEntry, "checked");
        }
        if (dom.cl.has(listEntryPrevious, "stickied")) {
          dom.cl.add(listEntry, "stickied");
        }
        if (dom.cl.has(listEntryPrevious, "toRemove")) {
          dom.cl.add(listEntry, "toRemove");
        }
        if (dom.cl.has(listEntryPrevious, "searchMatch")) {
          dom.cl.add(listEntry, "searchMatch");
        }
      } else {
        dom.cl.toggle(listEntry, "checked", listDetails.off !== true);
      }
      const on = dom.cl.has(listEntry, "checked");
      dom.prop(qs$(listEntry, ":scope > .detailbar input"), "checked", on);
      let elem = qs$(listEntry, ":scope > .detailbar a.content");
      if (elem) {
        dom.attr(elem, "href", "asset-viewer.html?url=" + encodeURIComponent(listkey));
        dom.attr(elem, "type", "text/html");
      }
      dom.cl.remove(listEntry, "toRemove");
      if (listDetails.supportName) {
        elem = qs$(listEntry, ":scope > .detailbar a.support");
        if (elem) {
          dom.attr(elem, "href", listDetails.supportURL || "#");
          dom.attr(elem, "title", listDetails.supportName);
        }
      }
      if (listDetails.external) {
        dom.cl.add(listEntry, "external");
      } else {
        dom.cl.remove(listEntry, "external");
      }
      if (listDetails.instructionURL) {
        elem = qs$(listEntry, ":scope > .detailbar a.mustread");
        if (elem) {
          dom.attr(elem, "href", listDetails.instructionURL || "#");
        }
      }
      dom.cl.toggle(
        listEntry,
        "isDefault",
        listDetails.isDefault === true || listDetails.isImportant === true || listkey === "user-filters"
      );
      elem = qs$(listEntry, ".leafstats");
      if (elem) {
        dom.text(elem, renderLeafStats(on ? listDetails.entryUsedCount : 0, listDetails.entryCount));
      }
      const asset = listsetDetails.cache[listkey] || {};
      const remoteURL = asset.remoteURL;
      dom.cl.toggle(
        listEntry,
        "unsecure",
        typeof remoteURL === "string" && remoteURL.lastIndexOf("http:", 0) === 0
      );
      dom.cl.toggle(listEntry, "failed", asset.error !== void 0);
      dom.cl.toggle(listEntry, "obsolete", asset.obsolete === true);
      const lastUpdateString = lastUpdateTemplateString.replace(
        "{{ago}}",
        i18n.renderElapsedTimeToString(asset.writeTime || 0)
      );
      if (asset.obsolete === true) {
        let title = obsoleteTemplateString;
        if (asset.cached && asset.writeTime !== 0) {
          title += "\n" + lastUpdateString;
        }
        const titleElem = qs$(listEntry, ":scope > .detailbar .status.obsolete");
        if (titleElem) {
          dom.attr(titleElem, "title", title);
        }
      }
      if (asset.cached === true) {
        dom.cl.add(listEntry, "cached");
        const cacheElem = qs$(listEntry, ":scope > .detailbar .status.cache");
        if (cacheElem) {
          dom.attr(cacheElem, "title", lastUpdateString);
        }
        const timeSinceLastUpdate = Date.now() - asset.writeTime;
        dom.cl.toggle(listEntry, "recent", timeSinceLastUpdate < recentlyUpdated);
      } else {
        dom.cl.remove(listEntry, "cached");
      }
    };
    const createListEntry = (listDetails, depth) => {
      if (listDetails.lists === void 0) {
        return dom.clone('#templates .listEntry[data-role="leaf"]');
      }
      if (depth !== 0) {
        return dom.clone('#templates .listEntry[data-role="node"]');
      }
      return dom.clone('#templates .listEntry[data-role="node"][data-parent="root"]');
    };
    const createListEntries = (parentkey, listTree, depth = 0) => {
      const listEntries = dom.clone("#templates .listEntries");
      const treeEntries = Object.entries(listTree);
      if (depth !== 0) {
        const reEmojis = new RegExp("\\p{Emoji}+", "gu");
        treeEntries.sort((a, b) => {
          const ap = a[1].preferred === true;
          const bp = b[1].preferred === true;
          if (ap !== bp) {
            return ap ? -1 : 1;
          }
          const as = (a[1].title || a[0]).replace(reEmojis, "");
          const bs = (b[1].title || b[0]).replace(reEmojis, "");
          return as.localeCompare(bs);
        });
      }
      for (const [listkey, listDetails] of treeEntries) {
        const listEntry = createListEntry(listDetails, depth);
        if (listEntry === null) {
          continue;
        }
        if (dom.cl.has(dom.root, "mobile")) {
          const leafStats = qs$(listEntry, ".leafstats");
          if (leafStats) {
            listEntry.append(leafStats);
          }
        }
        listEntry.dataset.key = listkey;
        listEntry.dataset.parent = parentkey;
        const listnameElem = qs$(listEntry, ":scope > .detailbar .listname");
        if (listnameElem) {
          listnameElem.append(
            i18n.patchUnicodeFlags(listDetails.title)
          );
        }
        if (listDetails.lists !== void 0) {
          listEntry.append(createListEntries(listEntry.dataset.key, listDetails.lists, depth + 1));
          dom.cl.toggle(listEntry, "expanded", listIsExpanded(listkey));
          updateListNode(listEntry);
        } else {
          initializeListEntry(listDetails, listEntry);
        }
        listEntries.append(listEntry);
      }
      return listEntries;
    };
    const onListsReceived = (response) => {
      listsetDetails = response;
      if (!response || !response.available) {
        return;
      }
      hashFromListsetDetails();
      const listTree = {};
      const groupKeys = [
        "user",
        "default",
        "ads",
        "privacy",
        "malware",
        "multipurpose",
        "cookies",
        "social",
        "annoyances",
        "regions",
        "unknown",
        "custom"
      ];
      for (const key of groupKeys) {
        listTree[key] = {
          title: i18nGroupName(key),
          lists: {}
        };
      }
      for (const [listkey, listDetails] of Object.entries(response.available)) {
        let groupkey = listDetails.group2 || listDetails.group;
        if (Object.hasOwn(listTree, groupkey) === false) {
          groupkey = "unknown";
        }
        const groupDetails = listTree[groupkey];
        if (typeof listDetails.parent === "string" && listDetails.parent !== "") {
          let lists = groupDetails.lists;
          for (const parent of listDetails.parent.split("|")) {
            if (lists[parent] === void 0) {
              lists[parent] = { title: parent, lists: {} };
            }
            if (listDetails.preferred === true) {
              lists[parent].preferred = true;
            }
            lists = lists[parent].lists;
          }
          lists[listkey] = listDetails;
        } else {
          listDetails.title = listNameFromListKey(listkey);
          groupDetails.lists[listkey] = listDetails;
        }
      }
      for (const groupkey of groupKeys) {
        const groupDetails = listTree[groupkey];
        if (groupDetails === void 0) {
          continue;
        }
        if (Object.keys(groupDetails.lists).length !== 0) {
          continue;
        }
        delete listTree[groupkey];
      }
      const listEntries = createListEntries("root", listTree);
      const listsContainer = qs$("#lists .listEntries");
      if (listsContainer) {
        listsContainer.replaceWith(listEntries);
      }
      const autoUpdateElem = qs$("#autoUpdate");
      if (autoUpdateElem) {
        autoUpdateElem.checked = listsetDetails.autoUpdate === true;
      }
      dom.text(
        "#listsOfBlockedHostsPrompt",
        i18n$("3pListsOfBlockedHostsPrompt").replace("{{netFilterCount}}", renderNumber(response.netFilterCount)).replace("{{cosmeticFilterCount}}", renderNumber(response.cosmeticFilterCount))
      );
      const parseCosmeticElem = qs$("#parseCosmeticFilters");
      if (parseCosmeticElem) {
        parseCosmeticElem.checked = listsetDetails?.parseCosmeticFilters === true;
      }
      const ignoreGenericElem = qs$("#ignoreGenericCosmeticFilters");
      if (ignoreGenericElem) {
        ignoreGenericElem.checked = listsetDetails?.ignoreGenericCosmeticFilters === true;
      }
      const suspendElem = qs$("#suspendUntilListsAreLoaded");
      if (suspendElem) {
        suspendElem.checked = listsetDetails.suspendUntilListsAreLoaded === true;
      }
      dom.cl.toggle(dom.body, "updating", listsetDetails.isUpdating);
      renderWidgets();
    };
    return vAPI.messaging.send("dashboard", {
      what: "getLists"
    }).then((response) => {
      onListsReceived(response);
    });
  };
  var renderWidgets = () => {
    const updating = dom.cl.has(dom.body, "updating");
    const hasObsolete = qs$("#lists .listEntry.checked.obsolete:not(.toRemove)") !== null;
    dom.cl.toggle(
      "#buttonApply",
      "disabled",
      filteringSettingsHash === hashFromCurrentFromSettings()
    );
    dom.cl.toggle("#buttonUpdate", "active", updating);
    dom.cl.toggle(
      "#buttonUpdate",
      "disabled",
      updating === false && hasObsolete === false
    );
  };
  var updateAssetStatus = (details) => {
    const listEntry = qs$(`#lists .listEntry[data-key="${details.key}"]`);
    if (listEntry === null) {
      return;
    }
    dom.cl.toggle(listEntry, "failed", !!details.failed);
    dom.cl.toggle(listEntry, "obsolete", !details.cached);
    dom.cl.toggle(listEntry, "cached", !!details.cached);
    if (details.cached) {
      const cacheTitleElem = qs$(listEntry, ".status.cache");
      if (cacheTitleElem) {
        dom.attr(
          cacheTitleElem,
          "title",
          lastUpdateTemplateString.replace("{{ago}}", i18n.renderElapsedTimeToString(Date.now()))
        );
      }
      dom.cl.add(listEntry, "recent");
    }
    updateAncestorListNodes(listEntry, (ancestor) => {
      updateListNode(ancestor);
    });
    renderWidgets();
  };
  var filteringSettingsHash = "";
  var hashFromListsetDetails = () => {
    const hashParts = [
      listsetDetails.parseCosmeticFilters === true,
      listsetDetails.ignoreGenericCosmeticFilters === true
    ];
    const listHashes = [];
    for (const [listkey, listDetails] of Object.entries(listsetDetails.available)) {
      if (listDetails.off === true) {
        continue;
      }
      listHashes.push(listkey);
    }
    hashParts.push(listHashes.sort().join(), "", false);
    filteringSettingsHash = hashParts.join();
  };
  var hashFromCurrentFromSettings = () => {
    const hashParts = [
      qs$("#parseCosmeticFilters")?.checked ?? false,
      qs$("#ignoreGenericCosmeticFilters")?.checked ?? false
    ];
    const listHashes = [];
    const listEntries = qsa$("#lists .listEntry[data-key]:not(.toRemove)");
    for (const liEntry of listEntries) {
      if (liEntry.dataset.role !== "leaf") {
        continue;
      }
      if (dom.cl.has(liEntry, "checked") === false) {
        continue;
      }
      listHashes.push(liEntry.dataset.key);
    }
    const textarea = qs$('#lists .listEntry[data-role="import"].expanded textarea');
    hashParts.push(
      listHashes.sort().join(),
      textarea !== null && textarea.value.trim() || "",
      qs$("#lists .listEntry.toRemove") !== null
    );
    return hashParts.join();
  };
  var onListsetChanged = (ev) => {
    const input = ev.target.closest("input");
    if (input === null) {
      return;
    }
    toggleFilterList(input, input.checked, true);
  };
  dom.on("#lists", "change", ".listEntry > .detailbar input", onListsetChanged);
  var toggleFilterList = (elem, on, ui = false) => {
    const listEntry = elem.closest(".listEntry");
    if (listEntry === null) {
      return;
    }
    if (listEntry.dataset.parent === "root") {
      return;
    }
    const searchMode = dom.cl.has("#lists", "searchMode");
    const input = qs$(listEntry, ":scope > .detailbar input");
    if (input === null) {
      return;
    }
    if (on === void 0) {
      on = input.checked === false;
    }
    input.checked = on;
    dom.cl.toggle(listEntry, "checked", on);
    dom.cl.toggle(listEntry, "stickied", ui && !on && !searchMode);
    const childListEntries = searchMode ? qsa$(listEntry, ".listEntry.searchMatch") : qsa$(listEntry, ".listEntry");
    for (const descendantList of childListEntries) {
      dom.cl.toggle(descendantList, "checked", on);
      const descendantInput = qs$(descendantList, ":scope > .detailbar input");
      if (descendantInput) {
        descendantInput.checked = on;
      }
    }
    updateAncestorListNodes(listEntry, (ancestor) => {
      updateListNode(ancestor);
    });
    onFilteringSettingsChanged();
  };
  var updateListNode = (listNode) => {
    if (listNode === null) {
      return;
    }
    if (listNode.dataset.role !== "node") {
      return;
    }
    const checkedListLeaves = qsa$(listNode, '.listEntry[data-role="leaf"].checked');
    const allListLeaves = qsa$(listNode, '.listEntry[data-role="leaf"]');
    const nodestatsElem = qs$(listNode, ".nodestats");
    if (nodestatsElem) {
      dom.text(
        nodestatsElem,
        renderNodeStats(checkedListLeaves.length, allListLeaves.length)
      );
    }
    dom.cl.toggle(
      listNode,
      "searchMatch",
      qs$(listNode, ":scope > .listEntries > .listEntry.searchMatch") !== null
    );
    if (listNode.dataset.parent === "root") {
      return;
    }
    let usedFilterCount = 0;
    let totalFilterCount = 0;
    let isCached = false;
    let isObsolete = false;
    let latestWriteTime = 0;
    let oldestWriteTime = Number.MAX_SAFE_INTEGER;
    for (const listLeaf of checkedListLeaves) {
      const listkey = listLeaf.dataset.key;
      const listDetails = listsetDetails.available[listkey];
      if (!listDetails) {
        continue;
      }
      usedFilterCount += listDetails.off ? 0 : listDetails.entryUsedCount || 0;
      totalFilterCount += listDetails.entryCount || 0;
      const assetCache = listsetDetails.cache[listkey] || {};
      isCached = isCached || dom.cl.has(listLeaf, "cached");
      isObsolete = isObsolete || dom.cl.has(listLeaf, "obsolete");
      latestWriteTime = Math.max(latestWriteTime, assetCache.writeTime || 0);
      oldestWriteTime = Math.min(oldestWriteTime, assetCache.writeTime || Number.MAX_SAFE_INTEGER);
    }
    dom.cl.toggle(listNode, "checked", checkedListLeaves.length !== 0);
    const checkboxElem = qs$(listNode, ":scope > .detailbar .checkbox");
    if (checkboxElem) {
      dom.cl.toggle(
        checkboxElem,
        "partial",
        checkedListLeaves.length !== allListLeaves.length
      );
    }
    const inputElem = qs$(listNode, ":scope > .detailbar input");
    if (inputElem) {
      dom.prop(
        inputElem,
        "checked",
        checkedListLeaves.length !== 0
      );
    }
    const leafstatsElem = qs$(listNode, ".leafstats");
    if (leafstatsElem) {
      dom.text(
        leafstatsElem,
        renderLeafStats(usedFilterCount, totalFilterCount)
      );
    }
    const firstLeaf = qs$(listNode, '.listEntry[data-role="leaf"]');
    if (firstLeaf !== null) {
      const supportElem = qs$(listNode, ":scope > .detailbar a.support");
      const firstLeafSupportElem = qs$(firstLeaf, ":scope > .detailbar a.support");
      if (supportElem && firstLeafSupportElem) {
        dom.attr(
          supportElem,
          "href",
          dom.attr(firstLeafSupportElem, "href") || "#"
        );
      }
      const mustreadElem = qs$(listNode, ":scope > .detailbar a.mustread");
      const firstLeafMustreadElem = qs$(firstLeaf, ":scope > .detailbar a.mustread");
      if (mustreadElem && firstLeafMustreadElem) {
        dom.attr(
          mustreadElem,
          "href",
          dom.attr(firstLeafMustreadElem, "href") || "#"
        );
      }
    }
    dom.cl.toggle(listNode, "cached", isCached);
    dom.cl.toggle(listNode, "obsolete", isObsolete);
    if (isCached) {
      const cacheElem = qs$(listNode, ":scope > .detailbar .cache");
      if (cacheElem) {
        dom.attr(
          cacheElem,
          "title",
          lastUpdateTemplateString.replace("{{ago}}", i18n.renderElapsedTimeToString(latestWriteTime))
        );
      }
      dom.cl.toggle(listNode, "recent", Date.now() - oldestWriteTime < recentlyUpdated);
    }
    if (qs$(listNode, ".listEntry.isDefault") !== null) {
      dom.cl.add(listNode, "isDefault");
    }
    if (qs$(listNode, ".listEntry.stickied") !== null) {
      dom.cl.add(listNode, "stickied");
    }
  };
  var updateAncestorListNodes = (listEntry, fn) => {
    while (listEntry !== null) {
      fn(listEntry);
      listEntry = qs$(`.listEntry[data-key="${listEntry.dataset.parent}"]`);
    }
  };
  var onFilteringSettingsChanged = () => {
    renderWidgets();
  };
  dom.on("#parseCosmeticFilters", "change", onFilteringSettingsChanged);
  dom.on("#ignoreGenericCosmeticFilters", "change", onFilteringSettingsChanged);
  dom.on("#lists", "input", '[data-role="import"] textarea', onFilteringSettingsChanged);
  var onRemoveExternalList = (ev) => {
    const listEntry = ev.target.closest("[data-key]");
    if (listEntry === null) {
      return;
    }
    dom.cl.toggle(listEntry, "toRemove");
    renderWidgets();
  };
  dom.on("#lists", "click", ".listEntry .remove", onRemoveExternalList);
  var onPurgeClicked = (ev) => {
    const liEntry = ev.target.closest("[data-key]");
    if (!liEntry) {
      return;
    }
    const listkey = liEntry.dataset.key || "";
    if (listkey === "") {
      return;
    }
    const assetKeys = [listkey];
    for (const listLeaf of qsa$(liEntry, '[data-role="leaf"]')) {
      assetKeys.push(listLeaf.dataset.key);
      dom.cl.add(listLeaf, "obsolete");
      dom.cl.remove(listLeaf, "cached");
    }
    vAPI.messaging.send("dashboard", {
      what: "listsUpdateNow",
      assetKeys,
      preferOrigin: ev.shiftKey
    });
    dom.cl.add(dom.body, "updating");
    dom.cl.add(liEntry, "obsolete");
    const checkbox = qs$(liEntry, 'input[type="checkbox"]');
    if (checkbox && checkbox.checked) {
      renderWidgets();
    }
  };
  dom.on("#lists", "click", "span.cache", onPurgeClicked);
  var selectFilterLists = async () => {
    const toImport = (() => {
      const textarea = qs$('#lists .listEntry[data-role="import"].expanded textarea');
      if (textarea === null) {
        return "";
      }
      const lists = listsetDetails.available;
      const lines = textarea.value.split(/\s+/);
      const after = [];
      for (const line of lines) {
        after.push(line);
        if (/^https?:\/\//.test(line) === false) {
          continue;
        }
        for (const [listkey, list] of Object.entries(lists)) {
          if (list.content !== "filters") {
            continue;
          }
          if (list.contentURL === void 0) {
            continue;
          }
          const contentURLs = Array.isArray(list.contentURL) ? list.contentURL : typeof list.contentURL === "string" ? [list.contentURL] : [];
          if (contentURLs.includes(line) === false) {
            continue;
          }
          const groupkey = list.group2 || list.group;
          const listEntry = qs$(`[data-key="${groupkey}"] [data-key="${listkey}"]`);
          if (listEntry === null) {
            break;
          }
          toggleFilterList(listEntry, true);
          after.pop();
          break;
        }
      }
      const expandable = textarea.closest(".expandable");
      if (expandable) {
        dom.cl.remove(expandable, "expanded");
      }
      textarea.value = "";
      return after.join("\n");
    })();
    let checked = qs$("#parseCosmeticFilters")?.checked ?? false;
    vAPI.messaging.send("dashboard", {
      what: "userSettings",
      name: "parseAllABPHideFilters",
      value: checked
    });
    listsetDetails && (listsetDetails.parseCosmeticFilters = checked);
    checked = qs$("#ignoreGenericCosmeticFilters")?.checked ?? false;
    vAPI.messaging.send("dashboard", {
      what: "userSettings",
      name: "ignoreGenericCosmeticFilters",
      value: checked
    });
    listsetDetails && (listsetDetails.ignoreGenericCosmeticFilters = checked);
    const toSelect = [];
    const toRemove = [];
    for (const liEntry of qsa$('#lists .listEntry[data-role="leaf"]')) {
      const listkey = liEntry.dataset.key;
      if (listkey === void 0) {
        continue;
      }
      if (Object.hasOwn(listsetDetails.available, listkey) === false) {
        continue;
      }
      const listDetails = listsetDetails.available[listkey];
      if (dom.cl.has(liEntry, "toRemove")) {
        toRemove.push(listkey);
        listDetails.off = true;
        continue;
      }
      if (dom.cl.has(liEntry, "checked")) {
        toSelect.push(listkey);
        listDetails.off = false;
      } else {
        listDetails.off = true;
      }
    }
    hashFromListsetDetails();
    await vAPI.messaging.send("dashboard", {
      what: "applyFilterListSelection",
      toSelect,
      toImport,
      toRemove
    });
  };
  var buttonApplyHandler = async () => {
    await selectFilterLists();
    dom.cl.add(dom.body, "working");
    dom.cl.remove("#lists .listEntry.stickied", "stickied");
    renderWidgets();
    await vAPI.messaging.send("dashboard", { what: "reloadAllFilters" });
    dom.cl.remove(dom.body, "working");
  };
  dom.on("#buttonApply", "click", () => {
    buttonApplyHandler();
  });
  var buttonUpdateHandler = async () => {
    dom.cl.remove("#lists .listEntry.stickied", "stickied");
    await selectFilterLists();
    dom.cl.add(dom.body, "updating");
    renderWidgets();
    vAPI.messaging.send("dashboard", { what: "updateNow" });
  };
  dom.on("#buttonUpdate", "click", () => {
    buttonUpdateHandler();
  });
  var userSettingCheckboxChanged = () => {
    const target = event.target;
    vAPI.messaging.send("dashboard", {
      what: "userSettings",
      name: target.id,
      value: target.checked
    });
    listsetDetails[target.id] = target.checked;
  };
  dom.on("#autoUpdate", "change", userSettingCheckboxChanged);
  dom.on("#suspendUntilListsAreLoaded", "change", userSettingCheckboxChanged);
  var searchFilterLists = () => {
    const pattern = dom.prop(".searchfield input", "value") || "";
    dom.cl.toggle("#lists", "searchMode", pattern !== "");
    if (pattern === "") {
      return;
    }
    const reflectSearchMatches = (listEntry) => {
      if (listEntry.dataset.role !== "node") {
        return;
      }
      dom.cl.toggle(
        listEntry,
        "searchMatch",
        qs$(listEntry, ":scope > .listEntries > .listEntry.searchMatch") !== null
      );
    };
    const toI18n = (tags) => {
      if (tags === "") {
        return "";
      }
      return tags.toLowerCase().split(/\s+/).reduce((a, v) => {
        let s = i18n$(v);
        if (s === "") {
          s = i18nGroupName(v);
          if (s === "") {
            return a;
          }
        }
        return `${a} ${s}`.trim();
      }, "");
    };
    const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    for (const listEntry of qsa$('#lists [data-role="leaf"]')) {
      const listkey = listEntry.dataset.key;
      const listDetails = listsetDetails.available[listkey];
      if (listDetails === void 0) {
        continue;
      }
      let haystack = perListHaystack.get(listDetails);
      if (haystack === void 0) {
        const groupkey = listDetails.group2 || listDetails.group || "";
        haystack = [
          listDetails.title,
          groupkey,
          i18nGroupName(groupkey),
          listDetails.tags || "",
          toI18n(listDetails.tags || "")
        ].join(" ").trim();
        perListHaystack.set(listDetails, haystack);
      }
      dom.cl.toggle(listEntry, "searchMatch", re.test(haystack));
      updateAncestorListNodes(listEntry, reflectSearchMatches);
    }
  };
  var perListHaystack = /* @__PURE__ */ new WeakMap();
  dom.on(".searchfield input", "input", searchFilterLists);
  var expandedListSet = /* @__PURE__ */ new Set([
    "cookies",
    "social"
  ]);
  var listIsExpanded = (which) => {
    return expandedListSet.has(which);
  };
  var applyListExpansion = (listkeys) => {
    if (listkeys === void 0) {
      listkeys = Array.from(expandedListSet);
    }
    expandedListSet.clear();
    dom.cl.remove('#lists [data-role="node"]', "expanded");
    listkeys.forEach((which) => {
      expandedListSet.add(which);
      dom.cl.add(`#lists [data-key="${which}"]`, "expanded");
    });
  };
  var toggleListExpansion = (which) => {
    const isExpanded = expandedListSet.has(which);
    if (which === "*") {
      if (isExpanded) {
        expandedListSet.clear();
        dom.cl.remove("#lists .expandable", "expanded");
        dom.cl.remove("#lists .stickied", "stickied");
      } else {
        expandedListSet.clear();
        expandedListSet.add("*");
        dom.cl.add("#lists .rootstats", "expanded");
        for (const expandable of qsa$("#lists > .listEntries .expandable")) {
          const listkey = expandable.dataset.key || "";
          if (listkey === "") {
            continue;
          }
          expandedListSet.add(listkey);
          dom.cl.add(expandable, "expanded");
        }
      }
    } else {
      if (isExpanded) {
        expandedListSet.delete(which);
        const listNode = qs$(`#lists > .listEntries [data-key="${which}"]`);
        if (listNode) {
          dom.cl.remove(listNode, "expanded");
          if (listNode.dataset.parent === "root") {
            dom.cl.remove(qsa$(listNode, ".stickied"), "stickied");
          }
        }
      } else {
        expandedListSet.add(which);
        dom.cl.add(`#lists > .listEntries [data-key="${which}"]`, "expanded");
      }
    }
    vAPI.localStorage.setItem("expandedListSet", Array.from(expandedListSet));
    vAPI.localStorage.removeItem("hideUnusedFilterLists");
  };
  dom.on("#listsOfBlockedHostsPrompt", "click", () => {
    toggleListExpansion("*");
  });
  dom.on("#lists", "click", ".listExpander", (ev) => {
    const expandable = ev.target.closest(".expandable");
    if (expandable === null) {
      return;
    }
    const which = expandable.dataset.key;
    if (which !== void 0) {
      toggleListExpansion(which);
    } else {
      dom.cl.toggle(expandable, "expanded");
      if (expandable.dataset.role === "import") {
        onFilteringSettingsChanged();
      }
    }
    ev.preventDefault();
  });
  dom.on("#lists", "click", '[data-parent="root"] > .detailbar .listname', (ev) => {
    const listEntry = ev.target.closest(".listEntry");
    if (listEntry === null) {
      return;
    }
    const listkey = listEntry.dataset.key;
    if (listkey === void 0) {
      return;
    }
    toggleListExpansion(listkey);
    ev.preventDefault();
  });
  dom.on("#lists", "click", '[data-role="import"] > .detailbar .listname', (ev) => {
    const expandable = ev.target.closest(".listEntry");
    if (expandable === null) {
      return;
    }
    dom.cl.toggle(expandable, "expanded");
    ev.preventDefault();
  });
  dom.on("#lists", "click", ".listEntry > .detailbar .nodestats", (ev) => {
    const listEntry = ev.target.closest(".listEntry");
    if (listEntry === null) {
      return;
    }
    const listkey = listEntry.dataset.key;
    if (listkey === void 0) {
      return;
    }
    toggleListExpansion(listkey);
    ev.preventDefault();
  });
  vAPI.localStorage.getItemAsync("expandedListSet").then((listkeys) => {
    if (Array.isArray(listkeys) === false) {
      return;
    }
    applyListExpansion(listkeys);
  });
  self.cloud.onPush = function toCloudData() {
    const bin = {
      parseCosmeticFilters: qs$("#parseCosmeticFilters")?.checked ?? false,
      ignoreGenericCosmeticFilters: qs$("#ignoreGenericCosmeticFilters")?.checked ?? false,
      selectedLists: []
    };
    const liEntries = qsa$('#lists .listEntry.checked[data-role="leaf"]');
    for (const liEntry of liEntries) {
      bin.selectedLists.push(liEntry.dataset.key);
    }
    return bin;
  };
  self.cloud.onPull = function fromCloudData(data, append) {
    if (typeof data !== "object" || data === null) {
      return;
    }
    let elem = qs$("#parseCosmeticFilters");
    let checked = data?.parseCosmeticFilters === true || append && elem?.checked === true;
    if (elem) {
      elem.checked = checked;
      listsetDetails && (listsetDetails.parseCosmeticFilters = checked);
    }
    elem = qs$("#ignoreGenericCosmeticFilters");
    checked = data?.ignoreGenericCosmeticFilters === true || append && elem?.checked === true;
    if (elem) {
      elem.checked = checked;
      listsetDetails && (listsetDetails.ignoreGenericCosmeticFilters = checked);
    }
    const selectedSet = new Set(Array.isArray(data?.selectedLists) ? data.selectedLists : []);
    for (const listEntry of qsa$('#lists .listEntry[data-role="leaf"]')) {
      const listkey = listEntry.dataset.key;
      if (!listkey) {
        continue;
      }
      const mustEnable = selectedSet.has(listkey);
      selectedSet.delete(listkey);
      if (mustEnable === false && append) {
        continue;
      }
      toggleFilterList(listEntry, mustEnable);
    }
    for (const listkey of selectedSet) {
      if (reValidExternalList.test(listkey)) {
        continue;
      }
      selectedSet.delete(listkey);
    }
    if (selectedSet.size !== 0) {
      const textarea = qs$('#lists .listEntry[data-role="import"] textarea');
      if (!textarea) {
        return;
      }
      const lines = append ? textarea.value.split(/[\n\r]+/) : [];
      lines.push(...selectedSet);
      if (lines.length !== 0) {
        lines.push("");
      }
      textarea.value = lines.join("\n");
      const importEntry = qs$('#lists .listEntry[data-role="import"]');
      if (importEntry) {
        dom.cl.toggle(importEntry, "expanded", textarea.value !== "");
      }
    }
    renderWidgets();
  };
  self.wikilink = "https://github.com/gorhill/uBlock/wiki/Dashboard:-Filter-lists";
  self.hasUnsavedData = function() {
    return hashFromCurrentFromSettings() !== filteringSettingsHash;
  };
  renderFilterLists().then(() => {
    const buttonUpdate = qs$("#buttonUpdate");
    if (buttonUpdate === null) {
      return;
    }
    if (dom.cl.has(buttonUpdate, "active")) {
      return;
    }
    if (dom.cl.has(buttonUpdate, "disabled")) {
      return;
    }
    if (listsetDetails.autoUpdate !== true) {
      return;
    }
    buttonUpdateHandler();
  });
})();
