(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/js/dom.ts
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
    return function(event) {
      const dispatcher = event.currentTarget;
      if (dispatcher instanceof HTMLElement === false || typeof dispatcher.querySelectorAll !== "function") {
        return;
      }
      const receiver = event.target;
      const ancestor = receiver?.closest(selector);
      if (ancestor === receiver && ancestor !== dispatcher && dispatcher.contains(ancestor)) {
        callback.call(receiver, event);
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

  // src/js/i18n.ts
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

  // src/js/webext.ts
  var webext = {
    tabs: {
      sendMessage: function(tabId, message, options) {
        return chrome.tabs.sendMessage(tabId, message, options);
      }
    },
    storage: {
      local: void 0,
      session: void 0,
      sync: void 0
    }
  };
  try {
    if (typeof chrome !== "undefined" && chrome.storage) {
      webext.storage.local = chrome.storage.local;
      webext.storage.session = chrome.storage.session;
      webext.storage.sync = chrome.storage.sync;
    }
  } catch (e) {
  }
  window.webext = webext;

  // src/js/broadcast.ts
  var broadcastChannel;
  function broadcast(message) {
    if (broadcastChannel === void 0) {
      broadcastChannel = new self.BroadcastChannel("uBR");
    }
    broadcastChannel.postMessage(message);
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

  // src/lib/punycode.js
  var punycode_default = function() {
    var punycode, maxInt = 2147483647, base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128, delimiter = "-", regexPunycode = /^xn--/, regexNonASCII = /[^\x20-\x7E]/, regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, errors = {
      "overflow": "Overflow: input needs wider integers to process",
      "not-basic": "Illegal input >= 0x80 (not a basic code point)",
      "invalid-input": "Invalid input"
    }, baseMinusTMin = base - tMin, floor = Math.floor, stringFromCharCode = String.fromCharCode, key;
    function error(type) {
      throw new RangeError(errors[type]);
    }
    function map(array, fn) {
      var length = array.length;
      var result = [];
      while (length--) {
        result[length] = fn(array[length]);
      }
      return result;
    }
    function mapDomain(string, fn) {
      if (string === null || string === void 0) {
        return "";
      }
      var parts = string.split("@");
      var result = "";
      if (parts.length > 1) {
        result = parts[0] + "@";
        string = parts[1];
      }
      string = string.replace(regexSeparators, ".");
      var labels = string.split(".");
      var encoded = map(labels, fn).join(".");
      return result + encoded;
    }
    function ucs2decode(string) {
      var output = [], counter = 0, length = string.length, value, extra;
      while (counter < length) {
        value = string.charCodeAt(counter++);
        if (value >= 55296 && value <= 56319 && counter < length) {
          extra = string.charCodeAt(counter++);
          if ((extra & 64512) == 56320) {
            output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
          } else {
            output.push(value);
            counter--;
          }
        } else {
          output.push(value);
        }
      }
      return output;
    }
    function ucs2encode(array) {
      return map(array, function(value) {
        var output = "";
        if (value > 65535) {
          value -= 65536;
          output += stringFromCharCode(value >>> 10 & 1023 | 55296);
          value = 56320 | value & 1023;
        }
        output += stringFromCharCode(value);
        return output;
      }).join("");
    }
    function basicToDigit(codePoint) {
      if (codePoint - 48 < 10) {
        return codePoint - 22;
      }
      if (codePoint - 65 < 26) {
        return codePoint - 65;
      }
      if (codePoint - 97 < 26) {
        return codePoint - 97;
      }
      return base;
    }
    function digitToBasic(digit, flag) {
      return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
    }
    function adapt(delta, numPoints, firstTime) {
      var k = 0;
      delta = firstTime ? floor(delta / damp) : delta >> 1;
      delta += floor(delta / numPoints);
      for (; delta > baseMinusTMin * tMax >> 1; k += base) {
        delta = floor(delta / baseMinusTMin);
      }
      return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
    }
    function decode(input) {
      var output = [], inputLength = input.length, out, i = 0, n = initialN, bias = initialBias, basic, j, index, oldi, w, k, digit, t, baseMinusT;
      basic = input.lastIndexOf(delimiter);
      if (basic < 0) {
        basic = 0;
      }
      for (j = 0; j < basic; ++j) {
        if (input.charCodeAt(j) >= 128) {
          error("not-basic");
        }
        output.push(input.charCodeAt(j));
      }
      for (index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
        for (oldi = i, w = 1, k = base; ; k += base) {
          if (index >= inputLength) {
            error("invalid-input");
          }
          digit = basicToDigit(input.charCodeAt(index++));
          if (digit >= base || digit > floor((maxInt - i) / w)) {
            error("overflow");
          }
          i += digit * w;
          t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (digit < t) {
            break;
          }
          baseMinusT = base - t;
          if (w > floor(maxInt / baseMinusT)) {
            error("overflow");
          }
          w *= baseMinusT;
        }
        out = output.length + 1;
        bias = adapt(i - oldi, out, oldi == 0);
        if (floor(i / out) > maxInt - n) {
          error("overflow");
        }
        n += floor(i / out);
        i %= out;
        output.splice(i++, 0, n);
      }
      return ucs2encode(output);
    }
    function encode(input) {
      var n, delta, handledCPCount, basicLength, bias, j, m, q, k, t, currentValue, output = [], inputLength, handledCPCountPlusOne, baseMinusT, qMinusT;
      input = ucs2decode(input);
      inputLength = input.length;
      n = initialN;
      delta = 0;
      bias = initialBias;
      for (j = 0; j < inputLength; ++j) {
        currentValue = input[j];
        if (currentValue < 128) {
          output.push(stringFromCharCode(currentValue));
        }
      }
      handledCPCount = basicLength = output.length;
      if (basicLength) {
        output.push(delimiter);
      }
      while (handledCPCount < inputLength) {
        for (m = maxInt, j = 0; j < inputLength; ++j) {
          currentValue = input[j];
          if (currentValue >= n && currentValue < m) {
            m = currentValue;
          }
        }
        handledCPCountPlusOne = handledCPCount + 1;
        if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
          error("overflow");
        }
        delta += (m - n) * handledCPCountPlusOne;
        n = m;
        for (j = 0; j < inputLength; ++j) {
          currentValue = input[j];
          if (currentValue < n && ++delta > maxInt) {
            error("overflow");
          }
          if (currentValue == n) {
            for (q = delta, k = base; ; k += base) {
              t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
              if (q < t) {
                break;
              }
              qMinusT = q - t;
              baseMinusT = base - t;
              output.push(
                stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
              );
              q = floor(qMinusT / baseMinusT);
            }
            output.push(stringFromCharCode(digitToBasic(q, 0)));
            bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
            delta = 0;
            ++handledCPCount;
          }
        }
        ++delta;
        ++n;
      }
      return output.join("");
    }
    function toUnicode(input) {
      if (input === null || input === void 0) {
        return "";
      }
      return mapDomain(input, function(string) {
        return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
      });
    }
    function toASCII(input) {
      if (input === null || input === void 0) {
        return "";
      }
      return mapDomain(input, function(string) {
        return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
      });
    }
    punycode = {
      /**
       * A string representing the current Punycode.js version number.
       * @memberOf punycode
       * @type String
       */
      "version": "1.3.2",
      /**
       * An object of methods to convert from JavaScript's internal character
       * representation (UCS-2) to Unicode code points, and back.
       * @see <https://mathiasbynens.be/notes/javascript-encoding>
       * @memberOf punycode
       * @type Object
       */
      "ucs2": {
        "decode": ucs2decode,
        "encode": ucs2encode
      },
      "decode": decode,
      "encode": encode,
      "toASCII": toASCII,
      "toUnicode": toUnicode
    };
    return punycode;
  }();

  // src/js/uri-utils.ts
  var reHostnameFromCommonURL = /^https:\/\/[0-9a-z._-]+[0-9a-z]\//;
  var reAuthorityFromURI = /^(?:[^:/?#]+:)?(\/\/[^/?#]+)/;
  var reHostFromNakedAuthority = /^[0-9a-z._-]+[0-9a-z]$/i;
  var reHostFromAuthority = /^(?:[^@]*@)?([^:]+)(?::\d*)?$/;
  var reIPv6FromAuthority = /^(?:[^@]*@)?(\[[0-9a-f:]+\])(?::\d*)?$/i;
  var reMustNormalizeHostname = /[^0-9a-z._-]/;
  function hostnameFromURI(uri) {
    let match = reHostnameFromCommonURL.exec(uri);
    if (match !== null) {
      return match[0].slice(8, -1);
    }
    match = reAuthorityFromURI.exec(uri);
    if (match === null) {
      return "";
    }
    const authority = match[1].slice(2);
    if (reHostFromNakedAuthority.test(authority)) {
      return authority.toLowerCase();
    }
    match = reHostFromAuthority.exec(authority);
    if (match === null) {
      match = reIPv6FromAuthority.exec(authority);
      if (match === null) {
        return "";
      }
    }
    let hostname = match[1];
    while (hostname.endsWith(".")) {
      hostname = hostname.slice(0, -1);
    }
    if (reMustNormalizeHostname.test(hostname)) {
      hostname = punycode_default.toASCII(hostname.toLowerCase());
    }
    return hostname;
  }

  // src/js/logger-ui.ts
  var messaging = vAPI.messaging;
  var logger = self.logger = { ownerId: Date.now() };
  var logDate = /* @__PURE__ */ new Date();
  var logDateTimezoneOffset = logDate.getTimezoneOffset() * 60;
  var loggerEntries = [];
  var COLUMN_TIMESTAMP = 0;
  var COLUMN_FILTER = 1;
  var COLUMN_MESSAGE = 1;
  var COLUMN_RESULT = 2;
  var COLUMN_INITIATOR = 3;
  var COLUMN_PARTYNESS = 4;
  var COLUMN_METHOD = 5;
  var COLUMN_TYPE = 6;
  var COLUMN_URL = 7;
  var filteredLoggerEntries = [];
  var filteredLoggerEntryVoidedCount = 0;
  var popupLoggerBox;
  var popupLoggerTooltips;
  var activeTabId = 0;
  var selectedTabId = 0;
  var netInspectorPaused = false;
  var cnameOfEnabled = false;
  var tabIdFromPageSelector = logger.tabIdFromPageSelector = function() {
    const value = qs$("#pageSelector").value;
    return value !== "_" ? parseInt(value, 10) || 0 : activeTabId;
  };
  var tabIdFromAttribute = function(elem) {
    const value = dom.attr(elem, "data-tabid") || "";
    const tabId = parseInt(value, 10);
    return isNaN(tabId) ? 0 : tabId;
  };
  var dispatchTabidChange = vAPI.defer.create(() => {
    document.dispatchEvent(new Event("tabIdChanged"));
  });
  var escapeRegexStr = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var modalDialog = (() => {
    const overlay = qs$("#modalOverlay");
    const container = qs$("#modalOverlayContainer");
    const closeButton = qs$(overlay, ":scope .closeButton");
    let onDestroyed;
    const removeChildren = logger.removeAllChildren = function(node) {
      while (node.firstChild) {
        node.removeChild(node.firstChild);
      }
    };
    const create = function(selector, destroyListener) {
      const template = qs$(selector);
      const dialog = dom.clone(template);
      removeChildren(container);
      container.appendChild(dialog);
      onDestroyed = destroyListener;
      return dialog;
    };
    const show = function() {
      dom.cl.add(overlay, "on");
    };
    const destroy = function() {
      dom.cl.remove(overlay, "on");
      const dialog = container.firstElementChild;
      removeChildren(container);
      if (typeof onDestroyed === "function") {
        onDestroyed(dialog);
      }
      onDestroyed = void 0;
    };
    const onClose = function(ev) {
      if (ev.target === overlay || ev.target === closeButton) {
        destroy();
      }
    };
    dom.on(overlay, "click", onClose);
    dom.on(closeButton, "click", onClose);
    return { create, show, destroy };
  })();
  self.logger.modalDialog = modalDialog;
  var prettyRequestTypes = {
    "main_frame": "doc",
    "stylesheet": "css",
    "sub_frame": "frame",
    "xmlhttprequest": "xhr"
  };
  var uglyRequestTypes = {
    "doc": "main_frame",
    "css": "stylesheet",
    "frame": "sub_frame",
    "xhr": "xmlhttprequest"
  };
  var allTabIds = /* @__PURE__ */ new Map();
  var allTabIdsToken;
  var regexFromURLFilteringResult = function(result) {
    const beg = result.indexOf(" ");
    const end = result.indexOf(" ", beg + 1);
    const url = result.slice(beg + 1, end);
    if (url === "*") {
      return new RegExp("^.*$", "gi");
    }
    return new RegExp("^" + escapeRegexStr(url), "gi");
  };
  var nodeFromURL = function(parent, url, re, type) {
    const fragment = document.createDocumentFragment();
    if (re === void 0) {
      fragment.textContent = url;
    } else {
      if (typeof re === "string") {
        re = new RegExp(escapeRegexStr(re), "g");
      }
      const matches = re.exec(url);
      if (matches === null || matches[0].length === 0) {
        fragment.textContent = url;
      } else {
        if (matches.index !== 0) {
          fragment.appendChild(
            document.createTextNode(url.slice(0, matches.index))
          );
        }
        const b = document.createElement("b");
        b.textContent = url.slice(matches.index, re.lastIndex);
        fragment.appendChild(b);
        if (re.lastIndex !== url.length) {
          fragment.appendChild(
            document.createTextNode(url.slice(re.lastIndex))
          );
        }
      }
    }
    if (/^https?:\/\//.test(url)) {
      const a = document.createElement("a");
      let href = url;
      switch (type) {
        case "css":
        case "doc":
        case "frame":
        case "object":
        case "other":
        case "script":
        case "xhr":
          href = `code-viewer.html?url=${encodeURIComponent(href)}`;
          break;
        default:
          break;
      }
      dom.attr(a, "href", href);
      dom.attr(a, "target", "_blank");
      fragment.appendChild(a);
    }
    parent.appendChild(fragment);
  };
  var padTo2 = function(v) {
    return v < 10 ? "0" + v : v;
  };
  var normalizeToStr = function(s) {
    return typeof s === "string" && s !== "" ? s : "";
  };
  var _LogEntry = class _LogEntry {
    constructor(details) {
      this.aliased = false;
      this.dead = false;
      this.docDomain = "";
      this.docHostname = "";
      this.domain = "";
      this.filter = void 0;
      this.id = _LogEntry.IdGenerator++;
      this.method = "";
      this.realm = "";
      this.tabDomain = "";
      this.tabHostname = "";
      this.tabId = void 0;
      this.textContent = "";
      this.tstamp = 0;
      this.type = "";
      this.voided = false;
      if (details instanceof Object === false) {
        return;
      }
      for (const prop in this) {
        if (Object.hasOwn(details, prop) === false) {
          continue;
        }
        this[prop] = details[prop];
      }
      if (details.aliasURL !== void 0) {
        this.aliased = true;
      }
      if (this.tabDomain === "") {
        this.tabDomain = this.tabHostname || "";
      }
      if (this.docDomain === "") {
        this.docDomain = this.docHostname || "";
      }
      if (this.domain === "") {
        this.domain = details.hostname || "";
      }
    }
  };
  __publicField(_LogEntry, "IdGenerator", 1);
  var LogEntry = _LogEntry;
  var createLogSeparator = function(details, text) {
    const separator = new LogEntry();
    separator.tstamp = details.tstamp;
    separator.realm = "message";
    separator.tabId = details.tabId;
    separator.type = "tabLoad";
    separator.textContent = "";
    const textContent = [];
    logDate.setTime((separator.tstamp - logDateTimezoneOffset) * 1e3);
    textContent.push(
      // cell 0
      padTo2(logDate.getUTCHours()) + ":" + padTo2(logDate.getUTCMinutes()) + ":" + padTo2(logDate.getSeconds()),
      // cell 1
      text
    );
    separator.textContent = textContent.join("");
    if (details.voided) {
      separator.voided = true;
    }
    return separator;
  };
  var processLoggerEntries = function(response) {
    const entries = response.entries;
    if (entries.length === 0) {
      return;
    }
    const autoDeleteVoidedRows = qs$("#pageSelector").value === "_";
    const previousCount = filteredLoggerEntries.length;
    for (const entry of entries) {
      const unboxed = JSON.parse(entry);
      if (unboxed.filter instanceof Object) {
        loggerStats.processFilter(unboxed.filter);
      }
      if (netInspectorPaused) {
        continue;
      }
      const parsed = parseLogEntry(unboxed);
      if (parsed.tabId !== void 0 && allTabIds.has(parsed.tabId) === false) {
        if (autoDeleteVoidedRows) {
          continue;
        }
        parsed.voided = true;
      }
      if (parsed.type === "main_frame" && parsed.aliased === false && (parsed.filter === void 0 || parsed.filter.modifier !== true && parsed.filter.source !== "redirect")) {
        const separator = createLogSeparator(parsed, unboxed.url);
        loggerEntries.unshift(separator);
        if (rowFilterer.filterOne(separator)) {
          filteredLoggerEntries.unshift(separator);
          if (separator.voided) {
            filteredLoggerEntryVoidedCount += 1;
          }
        }
      }
      if (cnameOfEnabled === false && parsed.aliased) {
        qs$("#filterExprCnameOf").style.display = "";
        cnameOfEnabled = true;
      }
      loggerEntries.unshift(parsed);
      if (rowFilterer.filterOne(parsed)) {
        filteredLoggerEntries.unshift(parsed);
        if (parsed.voided) {
          filteredLoggerEntryVoidedCount += 1;
        }
      }
    }
    const addedCount = filteredLoggerEntries.length - previousCount;
    if (addedCount === 0) {
      return;
    }
    viewPort.updateContent(addedCount);
    rowJanitor.inserted(addedCount);
    consolePane.updateContent();
  };
  var parseLogEntry = function(details) {
    if (details.realm === "cosmetic") {
      details.realm = "extended";
    }
    const entry = new LogEntry(details);
    const textContent = [];
    logDate.setTime((details.tstamp - logDateTimezoneOffset) * 1e3);
    textContent.push(
      padTo2(logDate.getUTCHours()) + ":" + padTo2(logDate.getUTCMinutes()) + ":" + padTo2(logDate.getSeconds())
    );
    if (details.realm === "message") {
      textContent.push(details.text);
      if (details.type) {
        textContent.push(details.type);
      }
      if (details.keywords) {
        textContent.push(...details.keywords);
      }
      entry.textContent = textContent.join("") + "";
      return entry;
    }
    if (entry.filter !== void 0) {
      textContent.push(entry.filter.raw);
      if (entry.filter.result === 1) {
        textContent.push("--");
      } else if (entry.filter.result === 2) {
        textContent.push("++");
      } else if (entry.filter.result === 3) {
        textContent.push("**");
      } else if (entry.filter.source === "redirect") {
        textContent.push("<<");
      } else {
        textContent.push("");
      }
    } else {
      textContent.push("", "");
    }
    textContent.push(normalizeToStr(entry.docHostname));
    if (entry.realm === "network" && typeof entry.domain === "string" && entry.domain !== "") {
      let partyness = "";
      if (entry.tabDomain !== void 0) {
        if (entry.tabId < 0) {
          partyness += "0,";
        }
        partyness += entry.domain === entry.tabDomain ? "1" : "3";
      } else {
        partyness += "?";
      }
      if (entry.docDomain !== entry.tabDomain) {
        partyness += ",";
        if (entry.docDomain !== void 0) {
          partyness += entry.domain === entry.docDomain ? "1" : "3";
        } else {
          partyness += "?";
        }
      }
      textContent.push(partyness);
    } else {
      textContent.push("");
    }
    textContent.push(entry.method || "");
    textContent.push(
      normalizeToStr(prettyRequestTypes[entry.type] || entry.type)
    );
    textContent.push(normalizeToStr(details.url));
    if (entry.aliased) {
      textContent.push(`aliasURL=${details.aliasURL}`);
    }
    entry.textContent = textContent.join("");
    return entry;
  };
  var viewPort = (() => {
    const vwRenderer = qs$("#vwRenderer");
    const vwScroller = qs$("#vwScroller");
    const vwVirtualContent = qs$("#vwVirtualContent");
    const vwContent = qs$("#vwContent");
    const vwLineSizer = qs$("#vwLineSizer");
    const vwLogEntryTemplate = qs$("#logEntryTemplate > div");
    const vwEntries = [];
    const detailableRealms = /* @__PURE__ */ new Set(["network", "extended"]);
    let vwHeight = 0;
    let lineHeight = 0;
    let wholeHeight = 0;
    let lastTopPix = 0;
    let lastTopRow = 0;
    const ViewEntry = function() {
      this.div = document.createElement("div");
      this.div.className = "logEntry";
      vwContent.appendChild(this.div);
      this.logEntry = void 0;
    };
    ViewEntry.prototype = {
      dispose: function() {
        vwContent.removeChild(this.div);
      }
    };
    const rowFromScrollTopPix = function(px) {
      return lineHeight !== 0 ? Math.floor(px / lineHeight) : 0;
    };
    const onScrollChanged = function() {
      const newScrollTopPix = vwScroller.scrollTop;
      const delta = newScrollTopPix - lastTopPix;
      if (delta === 0) {
        return;
      }
      lastTopPix = newScrollTopPix;
      if (filteredLoggerEntries.length <= 2) {
        return;
      }
      if (rollLines(rowFromScrollTopPix(newScrollTopPix))) {
        fillLines();
      }
      positionLines();
      vwContent.style.top = `${lastTopPix}px`;
    };
    const scrollTimer = vAPI.defer.create(onScrollChanged);
    const onScroll = () => {
      scrollTimer.onvsync(1e3 / 32);
    };
    dom.on(vwScroller, "scroll", onScroll, { passive: true });
    const onLayoutChanged = function() {
      vwHeight = vwRenderer.clientHeight;
      vwContent.style.height = `${vwScroller.clientHeight}px`;
      const vExpanded = dom.cl.has("#netInspector .vCompactToggler", "vExpanded");
      let newLineHeight = qs$(vwLineSizer, ".oneLine").clientHeight;
      if (vExpanded) {
        newLineHeight *= loggerSettings.linesPerEntry;
      }
      const lineCount = newLineHeight !== 0 ? Math.ceil(vwHeight / newLineHeight) + 1 : 0;
      if (lineCount > vwEntries.length) {
        do {
          vwEntries.push(new ViewEntry());
        } while (lineCount > vwEntries.length);
      } else if (lineCount < vwEntries.length) {
        do {
          vwEntries.pop().dispose();
        } while (lineCount < vwEntries.length);
      }
      const cellWidths = Array.from(
        qsa$(vwLineSizer, ".oneLine span")
      ).map((el, i) => {
        return loggerSettings.columns[i] !== false ? el.clientWidth + 1 : 0;
      });
      const reservedWidth = cellWidths[COLUMN_TIMESTAMP] + cellWidths[COLUMN_RESULT] + cellWidths[COLUMN_PARTYNESS] + cellWidths[COLUMN_METHOD] + cellWidths[COLUMN_TYPE];
      cellWidths[COLUMN_URL] = 0.5;
      if (cellWidths[COLUMN_FILTER] === 0 && cellWidths[COLUMN_INITIATOR] === 0) {
        cellWidths[COLUMN_URL] = 1;
      } else if (cellWidths[COLUMN_FILTER] === 0) {
        cellWidths[COLUMN_INITIATOR] = 0.35;
        cellWidths[COLUMN_URL] = 0.65;
      } else if (cellWidths[COLUMN_INITIATOR] === 0) {
        cellWidths[COLUMN_FILTER] = 0.35;
        cellWidths[COLUMN_URL] = 0.65;
      } else {
        cellWidths[COLUMN_FILTER] = 0.25;
        cellWidths[COLUMN_INITIATOR] = 0.25;
        cellWidths[COLUMN_URL] = 0.5;
      }
      const style = qs$("#vwRendererRuntimeStyles");
      const cssRules = [
        "#vwContent .logEntry {",
        `  height: ${newLineHeight}px;`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_TIMESTAMP + 1}) {`,
        `  width: ${cellWidths[COLUMN_TIMESTAMP]}px;`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_FILTER + 1}) {`,
        `  width: calc(calc(100% - ${reservedWidth}px) * ${cellWidths[COLUMN_FILTER]});`,
        "}",
        `#vwContent .logEntry > div.messageRealm > span:nth-of-type(${COLUMN_MESSAGE + 1}) {`,
        `  width: calc(100% - ${cellWidths[COLUMN_TIMESTAMP]}px);`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_RESULT + 1}) {`,
        `  width: ${cellWidths[COLUMN_RESULT]}px;`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_INITIATOR + 1}) {`,
        `  width: calc(calc(100% - ${reservedWidth}px) * ${cellWidths[COLUMN_INITIATOR]});`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_PARTYNESS + 1}) {`,
        `  width: ${cellWidths[COLUMN_PARTYNESS]}px;`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_METHOD + 1}) {`,
        `  width: ${cellWidths[COLUMN_METHOD]}px;`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_TYPE + 1}) {`,
        `  width: ${cellWidths[COLUMN_TYPE]}px;`,
        "}",
        `#vwContent .logEntry > div > span:nth-of-type(${COLUMN_URL + 1}) {`,
        `  width: calc(calc(100% - ${reservedWidth}px) * ${cellWidths[COLUMN_URL]});`,
        "}",
        ""
      ];
      for (let i = 0; i < cellWidths.length; i++) {
        if (cellWidths[i] !== 0) {
          continue;
        }
        cssRules.push(
          `#vwContent .logEntry > div > span:nth-of-type(${i + 1}) {`,
          "  display: none;",
          "}"
        );
      }
      style.textContent = cssRules.join("\n");
      lineHeight = newLineHeight;
      positionLines();
      dom.cl.toggle("#netInspector", "vExpanded", vExpanded);
      updateContent(0);
    };
    const resizeTimer = vAPI.defer.create(onLayoutChanged);
    const updateLayout = () => {
      resizeTimer.onvsync(1e3 / 8);
    };
    const resizeObserver = new self.ResizeObserver(updateLayout);
    resizeObserver.observe(qs$("#netInspector .vscrollable"));
    updateLayout();
    const renderFilterToSpan = function(span, filter) {
      if (filter.charCodeAt(0) !== 35) {
        return false;
      }
      const match = /^#@?#/.exec(filter);
      if (match === null) {
        return false;
      }
      let child = document.createElement("span");
      child.textContent = match[0];
      span.appendChild(child);
      child = document.createElement("span");
      child.textContent = filter.slice(match[0].length);
      span.appendChild(child);
      return true;
    };
    const renderToDiv = function(vwEntry, i) {
      if (i >= filteredLoggerEntries.length) {
        vwEntry.logEntry = void 0;
        return null;
      }
      const details = filteredLoggerEntries[i];
      if (vwEntry.logEntry === details) {
        return vwEntry.div.firstElementChild;
      }
      vwEntry.logEntry = details;
      const cells = details.textContent.split("");
      const div = dom.clone(vwLogEntryTemplate);
      const divcl = div.classList;
      let span;
      if (details.realm !== void 0) {
        divcl.add(details.realm + "Realm");
      }
      span = div.children[COLUMN_TIMESTAMP];
      span.textContent = cells[COLUMN_TIMESTAMP];
      if (details.tabId !== void 0) {
        dom.attr(div, "data-tabid", details.tabId);
        if (details.voided) {
          divcl.add("voided");
        }
      }
      if (details.realm === "message") {
        if (details.type !== void 0) {
          dom.attr(div, "data-type", details.type);
        }
        span = div.children[COLUMN_MESSAGE];
        span.textContent = cells[COLUMN_MESSAGE];
        return div;
      }
      if (detailableRealms.has(details.realm)) {
        divcl.add("canDetails");
      }
      const filter = details.filter || void 0;
      let filteringType;
      if (filter !== void 0) {
        if (typeof filter.source === "string") {
          filteringType = filter.source;
        }
        if (filteringType === "static") {
          divcl.add("canLookup");
        } else if (details.realm === "extended") {
          divcl.toggle("canLookup", /^#@?#/.test(filter.raw));
          divcl.toggle("isException", filter.raw.startsWith("#@#"));
        }
        if (filter.modifier === true) {
          dom.attr(div, "data-modifier", "");
        }
      }
      span = div.children[COLUMN_FILTER];
      if (renderFilterToSpan(span, cells[COLUMN_FILTER])) {
        if (/^\+js\(.*\)$/.test(span.children[1].textContent)) {
          divcl.add("scriptlet");
        }
      } else {
        span.textContent = cells[COLUMN_FILTER];
      }
      if (cells[COLUMN_RESULT] === "--") {
        dom.attr(div, "data-status", "1");
      } else if (cells[COLUMN_RESULT] === "++") {
        dom.attr(div, "data-status", "2");
      } else if (cells[COLUMN_RESULT] === "**") {
        dom.attr(div, "data-status", "3");
      } else if (cells[COLUMN_RESULT] === "<<") {
        divcl.add("redirect");
      }
      span = div.children[COLUMN_RESULT];
      span.textContent = cells[COLUMN_RESULT];
      if (details.tabHostname) {
        dom.attr(div, "data-tabhn", details.tabHostname);
      }
      if (details.docHostname) {
        dom.attr(div, "data-dochn", details.docHostname);
      }
      span = div.children[COLUMN_INITIATOR];
      span.textContent = cells[COLUMN_INITIATOR];
      if (cells[COLUMN_PARTYNESS] !== "" && details.realm === "network" && details.domain !== void 0) {
        let text = `${details.tabDomain}`;
        if (details.docDomain !== details.tabDomain) {
          text += ` \u22EF ${details.docDomain}`;
        }
        text += ` \u21D2 ${details.domain}`;
        dom.attr(div, "data-parties", text);
      }
      span = div.children[COLUMN_PARTYNESS];
      span.textContent = cells[COLUMN_PARTYNESS];
      span = div.children[COLUMN_METHOD];
      span.textContent = cells[COLUMN_METHOD];
      span = div.children[COLUMN_TYPE];
      span.textContent = cells[COLUMN_TYPE];
      let re;
      if (filteringType === "static") {
        re = new RegExp(filter.regex, "gi");
      } else if (filteringType === "dynamicUrl") {
        re = regexFromURLFilteringResult(filter.rule.join(" "));
      }
      nodeFromURL(div.children[COLUMN_URL], cells[COLUMN_URL], re, cells[COLUMN_TYPE]);
      if (cells.length > 8) {
        const pos = details.textContent.lastIndexOf("aliasURL=");
        if (pos !== -1) {
          div.dataset.aliasid = `${details.id}`;
        }
      }
      return div;
    };
    const positionLines = function() {
      if (lineHeight === 0) {
        return;
      }
      let y = -(lastTopPix % lineHeight);
      for (const vwEntry of vwEntries) {
        vwEntry.div.style.top = `${y}px`;
        y += lineHeight;
      }
    };
    const rollLines = function(topRow) {
      let delta = topRow - lastTopRow;
      let deltaLength = Math.abs(delta);
      if (deltaLength > 0 && deltaLength < vwEntries.length) {
        if (delta < 0) {
          vwEntries.unshift(...vwEntries.splice(delta));
        } else {
          vwEntries.push(...vwEntries.splice(0, delta));
        }
      }
      lastTopRow = topRow;
      return delta;
    };
    const fillLines = function() {
      let rowBeg = lastTopRow;
      for (const vwEntry of vwEntries) {
        const newDiv = renderToDiv(vwEntry, rowBeg);
        const container = vwEntry.div;
        const oldDiv = container.firstElementChild;
        if (newDiv !== null) {
          if (oldDiv === null) {
            container.appendChild(newDiv);
          } else if (newDiv !== oldDiv) {
            container.removeChild(oldDiv);
            container.appendChild(newDiv);
          }
        } else if (oldDiv !== null) {
          container.removeChild(oldDiv);
        }
        rowBeg += 1;
      }
    };
    const contentChanged = function(addedCount) {
      lastTopRow += addedCount;
      const newWholeHeight = Math.max(
        filteredLoggerEntries.length * lineHeight,
        vwRenderer.clientHeight
      );
      if (newWholeHeight !== wholeHeight) {
        vwVirtualContent.style.height = `${newWholeHeight}px`;
        wholeHeight = newWholeHeight;
      }
    };
    const updateContent = function(addedCount) {
      contentChanged(addedCount);
      if (addedCount === 0) {
        if (lastTopRow !== 0 && lastTopRow + vwEntries.length > filteredLoggerEntries.length) {
          lastTopRow = filteredLoggerEntries.length - vwEntries.length;
          if (lastTopRow < 0) {
            lastTopRow = 0;
          }
          lastTopPix = lastTopRow * lineHeight;
          vwContent.style.top = `${lastTopPix}px`;
          vwScroller.scrollTop = lastTopPix;
          positionLines();
        }
        fillLines();
        return;
      }
      if (lastTopPix === 0) {
        rollLines(0);
        positionLines();
        fillLines();
        return;
      }
      lastTopPix += lineHeight * addedCount;
      vwContent.style.top = `${lastTopPix}px`;
      vwScroller.scrollTop = lastTopPix;
    };
    return { updateContent, updateLayout };
  })();
  var updateCurrentTabTitle = (() => {
    const i18nCurrentTab = i18n$("loggerCurrentTab");
    return () => {
      const select = qs$("#pageSelector");
      if (select.value !== "_" || activeTabId === 0) {
        return;
      }
      const opt0 = qs$(select, '[value="_"]');
      const opt1 = qs$(select, `[value="${activeTabId}"]`);
      let text = i18nCurrentTab;
      if (opt1 !== null) {
        text += " / " + opt1.textContent;
      }
      opt0.textContent = text;
    };
  })();
  var synchronizeTabIds = function(newTabIds) {
    const select = qs$("#pageSelector");
    const selectedTabValue = select.value;
    const oldTabIds = allTabIds;
    const toVoid = /* @__PURE__ */ new Set();
    for (const tabId of oldTabIds.keys()) {
      if (newTabIds.has(tabId)) {
        continue;
      }
      toVoid.add(tabId);
    }
    allTabIds = newTabIds;
    if (toVoid.size !== 0) {
      const autoDeleteVoidedRows = selectedTabValue === "_";
      let rowVoided = false;
      for (let i = 0, n = loggerEntries.length; i < n; i++) {
        const entry = loggerEntries[i];
        if (toVoid.has(entry.tabId) === false) {
          continue;
        }
        if (entry.voided) {
          continue;
        }
        rowVoided = entry.voided = true;
        if (autoDeleteVoidedRows) {
          entry.dead = true;
        }
        loggerEntries[i] = new LogEntry(entry);
      }
      if (rowVoided) {
        rowFilterer.filterAll();
      }
    }
    if (toVoid.has(popupManager.tabId)) {
      popupManager.toggleOff();
    }
    const tabIds = Array.from(newTabIds.keys()).sort(function(a, b) {
      return newTabIds.get(a).localeCompare(newTabIds.get(b));
    });
    let j = 3;
    for (const tabId of tabIds) {
      if (tabId <= 0) {
        continue;
      }
      if (j === select.options.length) {
        select.appendChild(document.createElement("option"));
      }
      const option = select.options[j];
      option.textContent = newTabIds.get(tabId).slice(0, 80);
      dom.attr(option, "value", tabId);
      if (option.value === selectedTabValue) {
        select.selectedIndex = j;
        dom.attr(option, "selected", "");
      } else {
        dom.attr(option, "selected", null);
      }
      j += 1;
    }
    while (j < select.options.length) {
      select.removeChild(select.options[j]);
    }
    if (select.value !== selectedTabValue) {
      select.selectedIndex = 0;
      select.value = "";
      dom.attr(select.options[0], "selected", "");
      pageSelectorChanged();
    }
    updateCurrentTabTitle();
  };
  var onLogBufferRead = function(response) {
    if (!response || response.unavailable) {
      return;
    }
    if (popupLoggerTooltips === void 0 && response.tooltips !== void 0) {
      popupLoggerTooltips = response.tooltips;
      if (popupLoggerTooltips === false) {
        dom.attr("[data-i18n-title]", "title", "");
      }
    }
    let activeTabIdChanged = false;
    if (response.activeTabId) {
      activeTabIdChanged = response.activeTabId !== activeTabId;
      activeTabId = response.activeTabId;
    }
    if (Array.isArray(response.tabIds)) {
      response.tabIds = new Map(response.tabIds);
    }
    if (response.tabIds !== void 0) {
      synchronizeTabIds(response.tabIds);
      allTabIdsToken = response.tabIdsToken;
    }
    if (activeTabIdChanged) {
      pageSelectorFromURLHash();
    }
    processLoggerEntries(response);
    dom.cl.toggle(dom.html, "colorBlind", response.colorBlind === true);
    dom.cl.toggle("#clean", "disabled", filteredLoggerEntryVoidedCount === 0);
    dom.cl.toggle("#clear", "disabled", filteredLoggerEntries.length === 0);
  };
  var readLogBuffer = (() => {
    let reading = false;
    const readLogBufferNow = async function() {
      if (logger.ownerId === void 0) {
        return;
      }
      if (reading) {
        return;
      }
      reading = true;
      const msg = {
        what: "readAll",
        ownerId: logger.ownerId,
        tabIdsToken: allTabIdsToken
      };
      if (popupLoggerBox instanceof Object && (self.screenX !== popupLoggerBox.x || self.screenY !== popupLoggerBox.y || self.outerWidth !== popupLoggerBox.w || self.outerHeight !== popupLoggerBox.h)) {
        popupLoggerBox.x = self.screenX;
        popupLoggerBox.y = self.screenY;
        popupLoggerBox.w = self.outerWidth;
        popupLoggerBox.h = self.outerHeight;
        msg.popupLoggerBoxChanged = true;
      }
      const response = await vAPI.messaging.send("loggerUI", msg);
      onLogBufferRead(response);
      reading = false;
      timer.on(1200);
    };
    const timer = vAPI.defer.create(readLogBufferNow);
    readLogBufferNow();
    return () => {
      timer.on(1200);
    };
  })();
  var pageSelectorChanged = function() {
    const select = qs$("#pageSelector");
    window.location.replace("#" + select.value);
    pageSelectorFromURLHash();
  };
  var pageSelectorFromURLHash = /* @__PURE__ */ (() => {
    let lastHash;
    let lastSelectedTabId;
    return function() {
      let hash = window.location.hash.slice(1);
      let match = /^([^+]+)\+(.+)$/.exec(hash);
      if (match !== null) {
        hash = match[1];
        activeTabId = parseInt(match[2], 10) || 0;
        window.location.hash = "#" + hash;
      }
      if (hash !== lastHash) {
        const select = qs$("#pageSelector");
        let option = qs$(select, `option[value="${hash}"]`);
        if (option === null) {
          hash = "0";
          option = select.options[0];
        }
        select.selectedIndex = option.index;
        select.value = option.value;
        lastHash = hash;
      }
      selectedTabId = hash === "_" ? activeTabId : parseInt(hash, 10) || 0;
      if (lastSelectedTabId === selectedTabId) {
        return;
      }
      rowFilterer.filterAll();
      updateCurrentTabTitle();
      dom.cl.toggle(".needdom", "disabled", selectedTabId <= 0);
      dom.cl.toggle(".needscope", "disabled", selectedTabId <= 0);
      lastSelectedTabId = selectedTabId;
      dispatchTabidChange.onric({ timeout: 1e3 });
    };
  })();
  var reloadTab = function(bypassCache = false) {
    const tabId = tabIdFromPageSelector();
    if (tabId <= 0) {
      return;
    }
    messaging.send("loggerUI", {
      what: "reloadTab",
      tabId,
      bypassCache
    });
  };
  dom.on("#refresh", "click", (ev) => {
    reloadTab(ev.ctrlKey || ev.metaKey || ev.shiftKey);
  });
  dom.on(document, "keydown", (ev) => {
    if (ev.isComposing) {
      return;
    }
    let bypassCache = false;
    switch (ev.key) {
      case "F5":
        bypassCache = ev.ctrlKey || ev.metaKey || ev.shiftKey;
        break;
      case "r":
        if ((ev.ctrlKey || ev.metaKey) !== true) {
          return;
        }
        break;
      case "R":
        if ((ev.ctrlKey || ev.metaKey) !== true) {
          return;
        }
        bypassCache = true;
        break;
      default:
        return;
    }
    reloadTab(bypassCache);
    ev.preventDefault();
    ev.stopPropagation();
  }, { capture: true });
  (() => {
    const reRFC3986 = /^([^:/?#]+:)?(\/\/[^/?#]*)?([^?#]*)(\?[^#]*)?(#.*)?/;
    const reSchemeOnly = /^[\w-]+:$/;
    const staticFilterTypes = {
      "beacon": "ping",
      "doc": "document",
      "css": "stylesheet",
      "frame": "subdocument",
      "object_subrequest": "object",
      "csp_report": "other"
    };
    const createdStaticFilters = {};
    const reIsExceptionFilter = /^@@|^[\w.-]*?#@#/;
    let dialog = null;
    let targetRow = null;
    let targetType;
    let targetURLs = [];
    let targetFrameHostname;
    let targetPageHostname;
    let targetTabId;
    let targetDomain;
    let targetPageDomain;
    let targetFrameDomain;
    const uglyTypeFromSelector = (pane) => {
      const prettyType = selectValue("select.type." + pane);
      if (pane === "static") {
        return staticFilterTypes[prettyType] || prettyType;
      }
      return uglyRequestTypes[prettyType] || prettyType;
    };
    const selectNode = (selector) => {
      return qs$(dialog, selector);
    };
    const selectValue = (selector) => {
      return selectNode(selector).value || "";
    };
    const staticFilterNode = () => {
      return qs$(dialog, "div.panes > div.static textarea");
    };
    const toExceptionFilter = (filter, extended) => {
      if (reIsExceptionFilter.test(filter)) {
        return filter;
      }
      return extended ? filter.replace("##", "#@#") : `@@${filter}`;
    };
    const onColorsReady = function(response) {
      dom.cl.toggle(dom.body, "dirty", response.dirty);
      for (const url in response.colors) {
        if (Object.hasOwn(response.colors, url) === false) {
          continue;
        }
        const colorEntry = response.colors[url];
        const node = qs$(dialog, `.dynamic .entry .action[data-url="${url}"]`);
        if (node === null) {
          continue;
        }
        dom.cl.toggle(node, "allow", colorEntry.r === 2);
        dom.cl.toggle(node, "noop", colorEntry.r === 3);
        dom.cl.toggle(node, "block", colorEntry.r === 1);
        dom.cl.toggle(node, "own", colorEntry.own);
      }
    };
    const colorize = async function() {
      const response = await messaging.send("loggerUI", {
        what: "getURLFilteringData",
        context: selectValue("select.dynamic.origin"),
        urls: targetURLs,
        type: uglyTypeFromSelector("dynamic")
      });
      onColorsReady(response);
    };
    const parseStaticInputs = function() {
      const options = [];
      const block = selectValue("select.static.action") === "";
      let filter = "";
      if (!block) {
        filter = "@@";
      }
      let value = selectValue("select.static.url");
      if (value !== "") {
        if (reSchemeOnly.test(value)) {
          value = `|${value}`;
        } else {
          if (/[/?]/.test(value) === false) {
            value += "^";
          }
          value = `||${value}`;
        }
      }
      filter += value;
      value = selectValue("select.static.type");
      if (value !== "") {
        options.push(uglyTypeFromSelector("static"));
      }
      value = selectValue("select.static.origin");
      if (value !== "") {
        if (value === targetDomain) {
          options.push("1p");
        } else {
          options.push("domain=" + value);
        }
      }
      if (block && selectValue("select.static.importance") !== "") {
        options.push("important");
      }
      if (options.length) {
        filter += "$" + options.join(",");
      }
      staticFilterNode().value = filter;
      updateWidgets();
    };
    const updateWidgets = function() {
      const value = staticFilterNode().value;
      dom.cl.toggle(
        qs$(dialog, "#createStaticFilter"),
        "disabled",
        Object.hasOwn(createdStaticFilters, value) || value === ""
      );
    };
    const onClick = async function(ev) {
      const target = ev.target;
      const tcl = target.classList;
      if (tcl.contains("closeButton")) {
        ev.stopPropagation();
        toggleOff();
        return;
      }
      if (tcl.contains("header")) {
        ev.stopPropagation();
        dom.attr(dialog, "data-pane", dom.attr(target, "data-pane"));
        return;
      }
      if (tcl.contains("exceptor")) {
        ev.stopPropagation();
        const filter = filterFromTargetRow();
        const status = await messaging.send("loggerUI", {
          what: "toggleInMemoryFilter",
          filter: toExceptionFilter(filter, dom.cl.has(targetRow, "extendedRealm"))
        });
        const row = target.closest("div");
        dom.cl.toggle(row, "exceptored", status);
        return;
      }
      if (target.id === "createStaticFilter") {
        ev.stopPropagation();
        const value = staticFilterNode().value.replace(/^((?:@@)?\/.+\/)(\$|$)/, "$1*$2");
        if (Object.hasOwn(createdStaticFilters, value)) {
          return;
        }
        createdStaticFilters[value] = true;
        if (value !== "") {
          messaging.send("loggerUI", {
            what: "createUserFilter",
            autoComment: true,
            filters: value,
            docURL: `https://${targetFrameHostname}/`
          });
        }
        updateWidgets();
        return;
      }
      if (target.id === "saveRules") {
        ev.stopPropagation();
        await messaging.send("loggerUI", {
          what: "saveURLFilteringRules",
          context: selectValue("select.dynamic.origin"),
          urls: targetURLs,
          type: uglyTypeFromSelector("dynamic")
        });
        colorize();
        return;
      }
      const persist = !!ev.ctrlKey || !!ev.metaKey;
      if (tcl.contains("action")) {
        ev.stopPropagation();
        await messaging.send("loggerUI", {
          what: "setURLFilteringRule",
          context: selectValue("select.dynamic.origin"),
          url: dom.attr(target, "data-url"),
          type: uglyTypeFromSelector("dynamic"),
          action: 0,
          persist
        });
        colorize();
        return;
      }
      if (tcl.contains("allow")) {
        ev.stopPropagation();
        await messaging.send("loggerUI", {
          what: "setURLFilteringRule",
          context: selectValue("select.dynamic.origin"),
          url: dom.attr(target.parentNode, "data-url"),
          type: uglyTypeFromSelector("dynamic"),
          action: 2,
          persist
        });
        colorize();
        return;
      }
      if (tcl.contains("noop")) {
        ev.stopPropagation();
        await messaging.send("loggerUI", {
          what: "setURLFilteringRule",
          context: selectValue("select.dynamic.origin"),
          url: dom.attr(target.parentNode, "data-url"),
          type: uglyTypeFromSelector("dynamic"),
          action: 3,
          persist
        });
        colorize();
        return;
      }
      if (tcl.contains("block")) {
        ev.stopPropagation();
        await messaging.send("loggerUI", {
          what: "setURLFilteringRule",
          context: selectValue("select.dynamic.origin"),
          url: dom.attr(target.parentNode, "data-url"),
          type: uglyTypeFromSelector("dynamic"),
          action: 1,
          persist
        });
        colorize();
        return;
      }
      if (tcl.contains("picker")) {
        ev.stopPropagation();
        messaging.send("loggerUI", {
          what: "launchElementPicker",
          tabId: targetTabId,
          targetURL: "img	" + targetURLs[0],
          select: true
        });
        return;
      }
      if (tcl.contains("reload")) {
        ev.stopPropagation();
        messaging.send("loggerUI", {
          what: "reloadTab",
          tabId: targetTabId,
          bypassCache: ev.ctrlKey || ev.metaKey || ev.shiftKey
        });
        return;
      }
    };
    const onSelectChange = function(ev) {
      const tcl = ev.target.classList;
      if (tcl.contains("dynamic")) {
        colorize();
        return;
      }
      if (tcl.contains("static")) {
        parseStaticInputs();
        return;
      }
    };
    const onInputChange = function() {
      updateWidgets();
    };
    const createPreview = function(type, url) {
      const cantPreview = type !== "image" || dom.cl.has(targetRow, "networkRealm") === false || dom.attr(targetRow, "data-status") === "1";
      dom.cl.toggle(
        qs$(dialog, ".picker"),
        "hide",
        targetTabId < 0 || cantPreview
      );
      if (cantPreview) {
        return;
      }
      const container = qs$(dialog, ".preview");
      dom.on(qs$(container, "span"), "click", () => {
        const preview = dom.create("img");
        dom.attr(preview, "src", url);
        container.replaceChild(preview, container.firstElementChild);
      }, { once: true });
      dom.cl.remove(container, "hide");
    };
    const shortenLongString = function(url, max) {
      const urlLen = url.length;
      if (urlLen <= max) {
        return url;
      }
      const n = urlLen - max - 1;
      const i = (urlLen - n) / 2 | 0;
      return url.slice(0, i) + "\u2026" + url.slice(i + n);
    };
    const createTargetURLs = function(url) {
      const matches = reRFC3986.exec(url);
      if (matches === null) {
        return [];
      }
      if (typeof matches[2] !== "string" || matches[2].length === 0) {
        return [matches[1]];
      }
      const urls = [];
      const rootURL = matches[1] + matches[2];
      urls.unshift(rootURL);
      const path = matches[3] || "";
      let pos = path.charAt(0) === "/" ? 1 : 0;
      while (pos < path.length) {
        pos = path.indexOf("/", pos);
        if (pos === -1) {
          pos = path.length;
        } else {
          pos += 1;
        }
        urls.unshift(rootURL + path.slice(0, pos));
      }
      const query = matches[4] || "";
      if (query !== "") {
        urls.unshift(rootURL + path + query);
      }
      return urls;
    };
    const filterFromTargetRow = function() {
      return dom.text(targetRow.children[COLUMN_FILTER]);
    };
    const aliasURLFromID = function(id) {
      if (id === "") {
        return "";
      }
      for (const entry of loggerEntries) {
        if (`${entry.id}` !== id) {
          continue;
        }
        const match = /\baliasURL=([^\x1F]+)/.exec(entry.textContent);
        if (match === null) {
          return "";
        }
        return match[1];
      }
      return "";
    };
    const toSummaryPaneFilterNode = async function(receiver, filter) {
      receiver.children[COLUMN_FILTER].textContent = filter;
      if (dom.cl.has(targetRow, "canLookup") === false) {
        return;
      }
      const isException = reIsExceptionFilter.test(filter);
      let isExcepted = false;
      if (isException) {
        isExcepted = await messaging.send("loggerUI", {
          what: "hasInMemoryFilter",
          filter: toExceptionFilter(filter, dom.cl.has(targetRow, "extendedRealm"))
        });
      }
      if (isException && isExcepted === false) {
        return;
      }
      dom.cl.toggle(receiver, "exceptored", isExcepted);
      receiver.children[2].style.visibility = "";
    };
    const fillSummaryPaneFilterList = async function(rows) {
      const rawFilter = targetRow.children[COLUMN_FILTER].textContent;
      const nodeFromFilter = function(filter, lists) {
        const fragment = document.createDocumentFragment();
        const template = qs$("#filterFinderListEntry > span");
        for (const list of lists) {
          const span = dom.clone(template);
          let a = qs$(span, "a:nth-of-type(1)");
          a.href += encodeURIComponent(list.assetKey);
          a.append(i18n.patchUnicodeFlags(list.title));
          a = qs$(span, "a:nth-of-type(2)");
          if (list.supportURL) {
            dom.attr(a, "href", list.supportURL);
          } else {
            a.style.display = "none";
          }
          if (fragment.childElementCount !== 0) {
            fragment.appendChild(document.createTextNode("\n"));
          }
          fragment.appendChild(span);
        }
        return fragment;
      };
      const handleResponse = function(response) {
        if (response instanceof Object === false) {
          response = {};
        }
        let bestMatchFilter = "";
        for (const filter in response) {
          if (filter.length <= bestMatchFilter.length) {
            continue;
          }
          bestMatchFilter = filter;
        }
        if (bestMatchFilter !== "" && Array.isArray(response[bestMatchFilter])) {
          toSummaryPaneFilterNode(rows[0], bestMatchFilter);
          rows[1].children[1].appendChild(nodeFromFilter(
            bestMatchFilter,
            response[bestMatchFilter]
          ));
        }
        if (rows[1].children[1].childElementCount === 0) {
          i18n.safeTemplateToDOM(
            "loggerStaticFilteringFinderSentence2",
            { filter: rawFilter },
            rows[1].children[1]
          );
        }
      };
      if (dom.cl.has(targetRow, "networkRealm")) {
        const response = await messaging.send("loggerUI", {
          what: "listsFromNetFilter",
          rawFilter
        });
        handleResponse(response);
      } else if (dom.cl.has(targetRow, "extendedRealm")) {
        const response = await messaging.send("loggerUI", {
          what: "listsFromCosmeticFilter",
          url: targetRow.children[COLUMN_URL].textContent,
          rawFilter
        });
        handleResponse(response);
      }
    };
    const fillSummaryPane = function() {
      const rows = qsa$(dialog, ".pane.details > div");
      const tr = targetRow;
      const trcl = tr.classList;
      const trch = tr.children;
      let text;
      text = filterFromTargetRow();
      if (text !== "" && (trcl.contains("extendedRealm") || trcl.contains("networkRealm"))) {
        toSummaryPaneFilterNode(rows[0], text);
      } else {
        rows[0].style.display = "none";
      }
      if (text !== "" && (trcl.contains("dynamicHost") || trcl.contains("dynamicUrl") || trcl.contains("switchRealm"))) {
        rows[2].children[1].textContent = text;
      } else {
        rows[2].style.display = "none";
      }
      if (trcl.contains("canLookup")) {
        fillSummaryPaneFilterList(rows);
      } else {
        rows[1].style.display = "none";
      }
      const tabhn = dom.attr(tr, "data-tabhn") || "";
      const dochn = dom.attr(tr, "data-dochn") || "";
      if (tabhn !== "" && tabhn !== dochn) {
        rows[3].children[1].textContent = tabhn;
      } else {
        rows[3].style.display = "none";
      }
      if (dochn !== "") {
        rows[4].children[1].textContent = dochn;
      } else {
        rows[4].style.display = "none";
      }
      text = dom.attr(tr, "data-parties") || "";
      if (text !== "") {
        rows[5].children[1].textContent = `(${trch[COLUMN_PARTYNESS].textContent})\u2002${text}`;
      } else {
        rows[5].style.display = "none";
      }
      text = trch[COLUMN_TYPE].textContent;
      if (text !== "") {
        rows[6].children[1].textContent = text;
      } else {
        rows[6].style.display = "none";
      }
      const canonicalURL = trch[COLUMN_URL].textContent;
      if (canonicalURL !== "") {
        const attr = dom.attr(tr, "data-status") || "";
        if (attr !== "") {
          dom.attr(rows[7], "data-status", attr);
          if (tr.hasAttribute("data-modifier")) {
            dom.attr(rows[7], "data-modifier", "");
          }
        }
        rows[7].children[1].appendChild(dom.clone(trch[COLUMN_URL]));
      } else {
        rows[7].style.display = "none";
      }
      text = tr.dataset.aliasid;
      const aliasURL = text ? aliasURLFromID(text) : "";
      if (aliasURL !== "") {
        rows[8].children[1].textContent = hostnameFromURI(aliasURL) + " \u21D2\n\u2003" + hostnameFromURI(canonicalURL);
        rows[9].children[1].textContent = aliasURL;
      } else {
        rows[8].style.display = "none";
        rows[9].style.display = "none";
      }
    };
    const fillDynamicPane = function() {
      if (dom.cl.has(targetRow, "extendedRealm")) {
        return;
      }
      if (targetType === "doc") {
        return;
      }
      if (targetURLs.length === 0 || reSchemeOnly.test(targetURLs[0])) {
        return;
      }
      let select = selectNode("select.dynamic.origin");
      fillOriginSelect(select, targetPageHostname, targetPageDomain);
      const option = document.createElement("option");
      option.textContent = "*";
      dom.attr(option, "value", "*");
      select.appendChild(option);
      select = selectNode("select.dynamic.type");
      select.options[0].textContent = targetType;
      dom.attr(select.options[0], "value", targetType);
      select.selectedIndex = 0;
      const menuEntryTemplate = qs$(dialog, ".dynamic .toolbar .entry");
      const tbody = qs$(dialog, ".dynamic .entries");
      for (const targetURL of targetURLs) {
        const menuEntry = dom.clone(menuEntryTemplate);
        dom.attr(menuEntry.children[0], "data-url", targetURL);
        menuEntry.children[1].textContent = shortenLongString(targetURL, 128);
        tbody.appendChild(menuEntry);
      }
      colorize();
    };
    const fillOriginSelect = function(select, hostname, domain) {
      const template = i18n$("loggerStaticFilteringSentencePartOrigin");
      let value = hostname;
      for (; ; ) {
        const option = document.createElement("option");
        dom.attr(option, "value", value);
        option.textContent = template.replace("{{origin}}", value);
        select.appendChild(option);
        if (value === domain) {
          break;
        }
        const pos = value.indexOf(".");
        if (pos === -1) {
          break;
        }
        value = value.slice(pos + 1);
      }
    };
    const fillStaticPane = function() {
      if (dom.cl.has(targetRow, "extendedRealm")) {
        return;
      }
      const template = i18n$("loggerStaticFilteringSentence");
      const rePlaceholder = /\{\{[^}]+?\}\}/g;
      const nodes = [];
      let pos = 0;
      for (; ; ) {
        const match = rePlaceholder.exec(template);
        if (match === null) {
          break;
        }
        if (pos !== match.index) {
          nodes.push(document.createTextNode(template.slice(pos, match.index)));
        }
        pos = rePlaceholder.lastIndex;
        let select, option;
        switch (match[0]) {
          case "{{br}}":
            nodes.push(document.createElement("br"));
            break;
          case "{{action}}":
            select = document.createElement("select");
            select.className = "static action";
            option = document.createElement("option");
            dom.attr(option, "value", "");
            option.textContent = i18n$("loggerStaticFilteringSentencePartBlock");
            select.appendChild(option);
            option = document.createElement("option");
            dom.attr(option, "value", "@@");
            option.textContent = i18n$("loggerStaticFilteringSentencePartAllow");
            select.appendChild(option);
            nodes.push(select);
            break;
          case "{{type}}": {
            const filterType = staticFilterTypes[targetType] || targetType;
            select = document.createElement("select");
            select.className = "static type";
            option = document.createElement("option");
            dom.attr(option, "value", filterType);
            option.textContent = i18n$("loggerStaticFilteringSentencePartType").replace("{{type}}", filterType);
            select.appendChild(option);
            option = document.createElement("option");
            dom.attr(option, "value", "");
            option.textContent = i18n$("loggerStaticFilteringSentencePartAnyType");
            select.appendChild(option);
            nodes.push(select);
            break;
          }
          case "{{url}}":
            select = document.createElement("select");
            select.className = "static url";
            for (const targetURL of targetURLs) {
              const value = targetURL.replace(/^[a-z-]+:\/\//, "");
              option = document.createElement("option");
              dom.attr(option, "value", value);
              option.textContent = shortenLongString(value, 128);
              select.appendChild(option);
            }
            nodes.push(select);
            break;
          case "{{origin}}":
            select = document.createElement("select");
            select.className = "static origin";
            fillOriginSelect(select, targetFrameHostname, targetFrameDomain);
            option = document.createElement("option");
            dom.attr(option, "value", "");
            option.textContent = i18n$("loggerStaticFilteringSentencePartAnyOrigin");
            select.appendChild(option);
            nodes.push(select);
            break;
          case "{{importance}}":
            select = document.createElement("select");
            select.className = "static importance";
            option = document.createElement("option");
            dom.attr(option, "value", "");
            option.textContent = i18n$("loggerStaticFilteringSentencePartNotImportant");
            select.appendChild(option);
            option = document.createElement("option");
            dom.attr(option, "value", "important");
            option.textContent = i18n$("loggerStaticFilteringSentencePartImportant");
            select.appendChild(option);
            nodes.push(select);
            break;
          default:
            break;
        }
      }
      if (pos < template.length) {
        nodes.push(document.createTextNode(template.slice(pos)));
      }
      const parent = qs$(dialog, "div.panes > .static > div:first-of-type");
      for (let i = 0; i < nodes.length; i++) {
        parent.appendChild(nodes[i]);
      }
      parseStaticInputs();
    };
    const fillDialog = function(domains) {
      dialog = dom.clone("#templates .netFilteringDialog");
      dom.cl.toggle(
        dialog,
        "extendedRealm",
        dom.cl.has(targetRow, "extendedRealm")
      );
      targetDomain = domains[0];
      targetPageDomain = domains[1];
      targetFrameDomain = domains[2];
      createPreview(targetType, targetURLs[0]);
      fillSummaryPane();
      fillDynamicPane();
      fillStaticPane();
      dom.on(dialog, "click", (ev) => {
        onClick(ev);
      }, true);
      dom.on(dialog, "change", onSelectChange, true);
      dom.on(dialog, "input", onInputChange, true);
      const container = qs$("#inspectors .entryTools");
      if (container.firstChild) {
        container.replaceChild(dialog, container.firstChild);
      } else {
        container.append(dialog);
      }
    };
    const toggleOn = async function(ev) {
      const clickedRow = ev.target.closest(".canDetails");
      if (clickedRow === null) {
        return;
      }
      if (clickedRow === targetRow) {
        return toggleOff();
      }
      targetRow = clickedRow;
      ev.stopPropagation();
      targetTabId = tabIdFromAttribute(targetRow);
      targetType = targetRow.children[COLUMN_TYPE].textContent.trim() || "";
      targetURLs = createTargetURLs(targetRow.children[COLUMN_URL].textContent);
      targetPageHostname = dom.attr(targetRow, "data-tabhn") || "";
      targetFrameHostname = dom.attr(targetRow, "data-dochn") || "";
      const domains = await messaging.send("loggerUI", {
        what: "getDomainNames",
        targets: [
          targetURLs[0],
          targetPageHostname,
          targetFrameHostname
        ]
      });
      fillDialog(domains);
    };
    const toggleOff = function() {
      const container = qs$("#inspectors .entryTools");
      if (container.firstChild) {
        container.firstChild.remove();
      }
      targetURLs = [];
      targetRow = null;
      dialog = null;
    };
    vAPI.localStorage.removeItem("loggerUI.entryTools");
    let selectionAtMouseDown;
    let selectionAtTimer;
    dom.on("#netInspector", "mousedown", ".canDetails *:not(a)", (ev) => {
      if (ev.button !== 0) {
        return;
      }
      if (selectionAtMouseDown !== void 0) {
        return;
      }
      selectionAtMouseDown = document.getSelection().toString();
    });
    dom.on("#netInspector", "click", ".canDetails *:not(a)", (ev) => {
      if (ev.button !== 0) {
        return;
      }
      if (selectionAtTimer !== void 0) {
        clearTimeout(selectionAtTimer);
      }
      selectionAtTimer = setTimeout(() => {
        selectionAtTimer = void 0;
        const selectionAsOfNow = document.getSelection().toString();
        const selectionHasChanged = selectionAsOfNow !== selectionAtMouseDown;
        selectionAtMouseDown = void 0;
        if (selectionHasChanged && selectionAsOfNow !== "") {
          return;
        }
        toggleOn(ev);
      }, 333);
    });
    dom.on(
      "#netInspector",
      "click",
      ".logEntry > div > span:nth-of-type(8) a",
      (ev) => {
        vAPI.messaging.send("codeViewer", {
          what: "gotoURL",
          details: {
            url: ev.target.getAttribute("href"),
            select: true
          }
        });
        ev.preventDefault();
        ev.stopPropagation();
      }
    );
  })();
  var consolePane = (() => {
    let on = false;
    const lastInfoEntry = () => {
      let j = Number.MAX_SAFE_INTEGER;
      let i = loggerEntries.length;
      while (i--) {
        const entry = loggerEntries[i];
        if (entry.tabId !== selectedTabId) {
          continue;
        }
        if (entry.realm !== "message") {
          continue;
        }
        if (entry.voided) {
          continue;
        }
        j = entry.id;
      }
      return j;
    };
    const filterExpr = {
      not: true,
      pattern: ""
    };
    const filterExprFromInput = () => {
      const raw = qs$("#infoInspector .permatoolbar input").value.trim();
      if (raw.startsWith("-") && raw.length > 1) {
        filterExpr.pattern = raw.slice(1);
        filterExpr.not = true;
      } else {
        filterExpr.pattern = raw;
        filterExpr.not = false;
      }
      if (filterExpr.pattern !== "") {
        filterExpr.pattern = new RegExp(escapeRegexStr(filterExpr.pattern), "i");
      }
    };
    const addRows = () => {
      const { not, pattern } = filterExpr;
      const topRow = qs$("#infoInspector .vscrollable > div");
      const topid = topRow !== null ? parseInt(topRow.dataset.id, 10) : 0;
      const fragment = new DocumentFragment();
      for (const entry of loggerEntries) {
        if (entry.id <= topid) {
          break;
        }
        if (entry.tabId !== selectedTabId) {
          continue;
        }
        if (entry.realm !== "message") {
          continue;
        }
        if (entry.voided) {
          continue;
        }
        const fields = entry.textContent.split("").slice(0, 2);
        const textContent = fields.join("\xA0");
        if (pattern instanceof RegExp) {
          if (pattern.test(textContent) === not) {
            continue;
          }
        }
        const div = document.createElement("div");
        div.dataset.id = `${entry.id}`;
        div.dataset.type = entry.type;
        div.textContent = textContent;
        fragment.append(div);
      }
      const container = qs$("#infoInspector .vscrollable");
      container.prepend(fragment);
    };
    const removeRows = (before = 0) => {
      if (before === 0) {
        before = lastInfoEntry();
      }
      const rows = qsa$("#infoInspector .vscrollable > div");
      let i = rows.length;
      while (i--) {
        const div = rows[i];
        const id = parseInt(div.dataset.id, 10);
        if (id > before) {
          break;
        }
        div.remove();
      }
    };
    const updateContent = () => {
      if (on === false) {
        return;
      }
      removeRows();
      addRows();
    };
    const onTabIdChanged = () => {
      if (on === false) {
        return;
      }
      removeRows(Number.MAX_SAFE_INTEGER);
      addRows();
    };
    const toggleOn = () => {
      if (on) {
        return;
      }
      addRows();
      dom.on(document, "tabIdChanged", onTabIdChanged);
      on = true;
    };
    const toggleOff = () => {
      removeRows(Number.MAX_SAFE_INTEGER);
      dom.off(document, "tabIdChanged", onTabIdChanged);
      on = false;
    };
    const resizeObserver = new self.ResizeObserver((entries) => {
      if (entries.length === 0) {
        return;
      }
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        toggleOn();
      } else {
        toggleOff();
      }
    });
    resizeObserver.observe(qs$("#infoInspector"));
    dom.on("button.logConsole", "click", (ev) => {
      const active = dom.cl.toggle("#inspectors", "console");
      dom.cl.toggle(ev.currentTarget, "active", active);
    });
    dom.on("#infoInspector button#clearConsole", "click", () => {
      const ids = [];
      qsa$("#infoInspector .vscrollable > div").forEach((div) => {
        ids.push(parseInt(div.dataset.id, 10));
      });
      rowJanitor.removeSpecificRows(ids);
    });
    dom.on("#infoInspector button#logLevel", "click", (ev) => {
      const level = dom.cl.toggle(ev.currentTarget, "active") ? 2 : 1;
      broadcast({ what: "loggerLevelChanged", level });
    });
    const throttleFilter = vAPI.defer.create(() => {
      filterExprFromInput();
      updateContent();
    });
    dom.on("#infoInspector .permatoolbar input", "input", () => {
      throttleFilter.offon(517);
    });
    return { updateContent };
  })();
  var rowFilterer = (() => {
    const userFilters = [];
    const builtinFilters = [];
    let masterFilterSwitch = true;
    let filters = [];
    const parseInput = function() {
      userFilters.length = 0;
      const rawParts = qs$("#filterInput > input").value.trim().split(/\s+/);
      const n = rawParts.length;
      const reStrs = [];
      let not = false;
      for (let i = 0; i < n; i++) {
        let rawPart = rawParts[i];
        if (rawPart.charAt(0) === "!") {
          if (reStrs.length === 0) {
            not = true;
          }
          rawPart = rawPart.slice(1);
        }
        let reStr = "";
        if (rawPart.startsWith("/") && rawPart.endsWith("/")) {
          reStr = rawPart.slice(1, -1);
          try {
            new RegExp(reStr);
          } catch {
            reStr = "";
          }
        }
        if (reStr === "") {
          const hardBeg = rawPart.startsWith("|");
          if (hardBeg) {
            rawPart = rawPart.slice(1);
          }
          const hardEnd = rawPart.endsWith("|");
          if (hardEnd) {
            rawPart = rawPart.slice(0, -1);
          }
          reStr = escapeRegexStr(rawPart);
          if (hardBeg) {
            reStr = reStr !== "" ? "(?:^|\\s|\\|)" + reStr : "\\|";
          }
          if (hardEnd) {
            reStr += "(?:\\||\\s|$)";
          }
        }
        if (reStr === "") {
          continue;
        }
        reStrs.push(reStr);
        if (i < n - 1 && rawParts[i + 1] === "||") {
          i += 1;
          continue;
        }
        reStr = reStrs.length === 1 ? reStrs[0] : reStrs.join("|");
        userFilters.push({
          re: new RegExp(reStr, "i"),
          r: !not
        });
        reStrs.length = 0;
        not = false;
      }
      filters = builtinFilters.concat(userFilters);
    };
    const filterOne = (logEntry) => {
      if (logEntry.dead) {
        return false;
      }
      if (selectedTabId !== 0) {
        if (logEntry.tabId !== void 0 && logEntry.tabId > 0) {
          if (logEntry.tabId !== selectedTabId) {
            return false;
          }
        }
      }
      if (masterFilterSwitch === false || filters.length === 0) {
        return true;
      }
      if (logEntry.type === "tabLoad") {
        return true;
      }
      for (const f of filters) {
        if (f.re.test(logEntry.textContent) !== f.r) {
          return false;
        }
      }
      return true;
    };
    const filterAll = function() {
      filteredLoggerEntries = [];
      filteredLoggerEntryVoidedCount = 0;
      for (const entry of loggerEntries) {
        if (filterOne(entry) === false) {
          continue;
        }
        filteredLoggerEntries.push(entry);
        if (entry.voided) {
          filteredLoggerEntryVoidedCount += 1;
        }
      }
      viewPort.updateContent(0);
      dom.cl.toggle("#filterButton", "active", filters.length !== 0);
      dom.cl.toggle("#clean", "disabled", filteredLoggerEntryVoidedCount === 0);
      dom.cl.toggle("#clear", "disabled", filteredLoggerEntries.length === 0);
    };
    const onFilterChangedAsync = (() => {
      const commit = () => {
        parseInput();
        filterAll();
      };
      const timer = vAPI.defer.create(commit);
      return () => {
        timer.offon(750);
      };
    })();
    const onFilterButton = function() {
      masterFilterSwitch = !masterFilterSwitch;
      dom.cl.toggle("#netInspector", "f", masterFilterSwitch);
      filterAll();
    };
    const onToggleExtras = function(ev) {
      dom.cl.toggle(ev.target, "expanded");
    };
    const builtinFilterExpression = function() {
      builtinFilters.length = 0;
      const filtexElems = qsa$("#filterExprPicker [data-filtex]");
      const orExprs = [];
      let not = false;
      for (const filtexElem of filtexElems) {
        const filtex = filtexElem.dataset.filtex;
        const active = dom.cl.has(filtexElem, "on");
        if (filtex === "!") {
          if (orExprs.length !== 0) {
            builtinFilters.push({
              re: new RegExp(orExprs.join("|")),
              r: !not
            });
            orExprs.length = 0;
          }
          not = active;
        } else if (active) {
          orExprs.push(filtex);
        }
      }
      if (orExprs.length !== 0) {
        builtinFilters.push({
          re: new RegExp(orExprs.join("|")),
          r: !not
        });
      }
      filters = builtinFilters.concat(userFilters);
      dom.cl.toggle("#filterExprButton", "active", builtinFilters.length !== 0);
      filterAll();
    };
    dom.on("#filterButton", "click", onFilterButton);
    dom.on("#filterInput > input", "input", onFilterChangedAsync);
    dom.on("#filterExprButton", "click", onToggleExtras);
    dom.on("#filterExprPicker", "click", "[data-filtex]", (ev) => {
      dom.cl.toggle(ev.target, "on");
      builtinFilterExpression();
    });
    dom.on("#filterInput > input", "drop", (ev) => {
      const dropItem = (item) => {
        if (item.kind !== "string") {
          return false;
        }
        if (item.type !== "text/plain") {
          return false;
        }
        item.getAsString((s) => {
          qs$("#filterInput > input").value = s;
          parseInput();
          filterAll();
        });
        return true;
      };
      for (const item of ev.dataTransfer.items) {
        if (dropItem(item) === false) {
          continue;
        }
        ev.preventDefault();
        break;
      }
    });
    parseInput();
    builtinFilterExpression();
    filterAll();
    return { filterOne, filterAll };
  })();
  var rowJanitor = (() => {
    const tabIdToDiscard = /* @__PURE__ */ new Set();
    const tabIdToLoadCountMap = /* @__PURE__ */ new Map();
    const tabIdToEntryCountMap = /* @__PURE__ */ new Map();
    let rowIndex = 0;
    const discard = function(deadline) {
      const opts = loggerSettings.discard;
      const maxLoadCount = typeof opts.maxLoadCount === "number" ? opts.maxLoadCount : 0;
      const maxEntryCount = typeof opts.maxEntryCount === "number" ? opts.maxEntryCount : 0;
      const obsolete = typeof opts.maxAge === "number" ? Date.now() / 1e3 - opts.maxAge * 60 : 0;
      let i = rowIndex;
      if (i >= loggerEntries.length) {
        i = 0;
      }
      if (i === 0) {
        tabIdToDiscard.clear();
        tabIdToLoadCountMap.clear();
        tabIdToEntryCountMap.clear();
      }
      let idel = -1;
      let bufferedTabId = 0;
      let bufferedEntryCount = 0;
      let modified = false;
      while (i < loggerEntries.length) {
        if (i % 64 === 0 && deadline.timeRemaining() === 0) {
          break;
        }
        const entry = loggerEntries[i];
        const tabId = entry.tabId || 0;
        if (entry.dead || tabIdToDiscard.has(tabId)) {
          if (idel === -1) {
            idel = i;
          }
          i += 1;
          continue;
        }
        if (maxLoadCount !== 0 && entry.type === "tabLoad") {
          let count = (tabIdToLoadCountMap.get(tabId) || 0) + 1;
          tabIdToLoadCountMap.set(tabId, count);
          if (count >= maxLoadCount) {
            tabIdToDiscard.add(tabId);
          }
        }
        if (maxEntryCount !== 0) {
          if (bufferedTabId !== tabId) {
            if (bufferedEntryCount !== 0) {
              tabIdToEntryCountMap.set(bufferedTabId, bufferedEntryCount);
            }
            bufferedTabId = tabId;
            bufferedEntryCount = tabIdToEntryCountMap.get(tabId) || 0;
          }
          bufferedEntryCount += 1;
          if (bufferedEntryCount >= maxEntryCount) {
            tabIdToDiscard.add(bufferedTabId);
          }
        }
        if (obsolete !== 0 && entry.tstamp <= obsolete) {
          if (idel === -1) {
            idel = i;
          }
          break;
        }
        if (idel !== -1) {
          loggerEntries.copyWithin(idel, i);
          loggerEntries.length -= i - idel;
          idel = -1;
          modified = true;
        }
        i += 1;
      }
      if (idel !== -1) {
        loggerEntries.length = idel;
        modified = true;
      }
      if (i >= loggerEntries.length) {
        i = 0;
      }
      rowIndex = i;
      if (rowIndex === 0) {
        tabIdToDiscard.clear();
        tabIdToLoadCountMap.clear();
        tabIdToEntryCountMap.clear();
      }
      if (modified === false) {
        return;
      }
      rowFilterer.filterAll();
      consolePane.updateContent();
    };
    const discardAsync = function(deadline) {
      if (deadline) {
        discard(deadline);
      }
      janitorTimer.onidle(1889);
    };
    const janitorTimer = vAPI.defer.create(discardAsync);
    const clean = function() {
      if (filteredLoggerEntries.length === 0) {
        return;
      }
      let j = 0;
      let targetEntry = filteredLoggerEntries[0];
      for (const entry of loggerEntries) {
        if (entry !== targetEntry) {
          continue;
        }
        if (entry.voided) {
          entry.dead = true;
        }
        j += 1;
        if (j === filteredLoggerEntries.length) {
          break;
        }
        targetEntry = filteredLoggerEntries[j];
      }
      rowFilterer.filterAll();
    };
    const clear = function() {
      if (filteredLoggerEntries.length === 0) {
        return;
      }
      let clearUnrelated = true;
      if (selectedTabId !== 0) {
        for (const entry of filteredLoggerEntries) {
          if (entry.tabId === selectedTabId) {
            clearUnrelated = false;
            break;
          }
        }
      }
      let j = 0;
      let targetEntry = filteredLoggerEntries[0];
      for (const entry of loggerEntries) {
        if (entry !== targetEntry) {
          continue;
        }
        if (entry.tabId === selectedTabId || clearUnrelated) {
          entry.dead = true;
        }
        j += 1;
        if (j === filteredLoggerEntries.length) {
          break;
        }
        targetEntry = filteredLoggerEntries[j];
      }
      rowFilterer.filterAll();
    };
    discardAsync();
    dom.on("#clean", "click", clean);
    dom.on("#clear", "click", clear);
    return {
      inserted(count) {
        if (rowIndex !== 0) {
          rowIndex += count;
        }
      },
      removeSpecificRows(descendingIds) {
        if (descendingIds.length === 0) {
          return;
        }
        let i = loggerEntries.length;
        let id = descendingIds.pop();
        while (i--) {
          const entry = loggerEntries[i];
          if (entry.id !== id) {
            continue;
          }
          loggerEntries.splice(i, 1);
          if (descendingIds.length === 0) {
            break;
          }
          id = descendingIds.pop();
        }
        rowFilterer.filterAll();
        consolePane.updateContent();
      }
    };
  })();
  var pauseNetInspector = function() {
    netInspectorPaused = dom.cl.toggle("#netInspector", "paused");
  };
  var toggleVCompactView = function() {
    dom.cl.toggle("#netInspector .vCompactToggler", "vExpanded");
    viewPort.updateLayout();
  };
  var popupManager = (() => {
    let realTabId = 0;
    let popup = null;
    let popupObserver = null;
    const resizePopup = function() {
      if (popup === null) {
        return;
      }
      const popupBody = popup.contentWindow.document.body;
      if (popupBody.clientWidth !== 0 && popup.clientWidth !== popupBody.clientWidth) {
        popup.style.setProperty("width", popupBody.clientWidth + "px");
      }
      if (popupBody.clientHeight !== 0 && popup.clientHeight !== popupBody.clientHeight) {
        popup.style.setProperty("height", popupBody.clientHeight + "px");
      }
    };
    const onLoad = function() {
      resizePopup();
      popupObserver.observe(popup.contentDocument.body, {
        subtree: true,
        attributes: true
      });
    };
    const setTabId = function(tabId) {
      if (popup === null) {
        return;
      }
      dom.attr(popup, "src", `popup-fenix.html?portrait=1&tabId=${tabId}`);
    };
    const onTabIdChanged = function() {
      const tabId = tabIdFromPageSelector();
      if (tabId === 0) {
        return toggleOff();
      }
      realTabId = tabId;
      setTabId(realTabId);
    };
    const toggleOn = function() {
      const tabId = tabIdFromPageSelector();
      if (tabId === 0) {
        return;
      }
      realTabId = tabId;
      popup = qs$("#popupContainer");
      dom.on(popup, "load", onLoad);
      popupObserver = new MutationObserver(resizePopup);
      const parent = qs$("#inspectors");
      const rect = parent.getBoundingClientRect();
      popup.style.setProperty("right", `${rect.right - parent.clientWidth}px`);
      dom.cl.add(parent, "popupOn");
      dom.on(document, "tabIdChanged", onTabIdChanged);
      setTabId(realTabId);
      dom.cl.add("#showpopup", "active");
    };
    const toggleOff = function() {
      dom.cl.remove("#showpopup", "active");
      dom.off(document, "tabIdChanged", onTabIdChanged);
      dom.cl.remove("#inspectors", "popupOn");
      dom.off(popup, "load", onLoad);
      popupObserver.disconnect();
      popupObserver = null;
      dom.attr(popup, "src", "");
      realTabId = 0;
    };
    const api = {
      get tabId() {
        return realTabId || 0;
      },
      toggleOff: function() {
        if (realTabId !== 0) {
          toggleOff();
        }
      }
    };
    dom.on("#showpopup", "click", () => {
      void (realTabId === 0 ? toggleOn() : toggleOff());
    });
    return api;
  })();
  var loggerStats = (() => {
    const enabled = false;
    const filterHits = /* @__PURE__ */ new Map();
    let dialog;
    let timer;
    const makeRow = function() {
      const div = document.createElement("div");
      div.appendChild(document.createElement("span"));
      div.appendChild(document.createElement("span"));
      return div;
    };
    const fillRow = function(div, entry) {
      div.children[0].textContent = entry[1].toLocaleString();
      div.children[1].textContent = entry[0];
    };
    const updateList = function() {
      const sortedHits = Array.from(filterHits).sort((a, b) => {
        return b[1] - a[1];
      });
      const doc = document;
      const parent = qs$(dialog, ".sortedEntries");
      let i = 0;
      for (let iRow = 0; iRow < parent.childElementCount; iRow++) {
        if (i === sortedHits.length) {
          break;
        }
        fillRow(parent.children[iRow], sortedHits[i]);
        i += 1;
      }
      if (i < sortedHits.length) {
        const list = doc.createDocumentFragment();
        for (; i < sortedHits.length; i++) {
          const div = makeRow();
          fillRow(div, sortedHits[i]);
          list.appendChild(div);
        }
        parent.appendChild(list);
      }
    };
    const toggleOn = function() {
      dialog = modalDialog.create(
        "#loggerStatsDialog",
        () => {
          dialog = void 0;
          if (timer !== void 0) {
            self.cancelIdleCallback(timer);
            timer = void 0;
          }
        }
      );
      updateList();
      modalDialog.show();
    };
    dom.on("#loggerStats", "click", toggleOn);
    return {
      processFilter: function(filter) {
        if (enabled !== true) {
          return;
        }
        if (filter.source !== "static" && filter.source !== "cosmetic") {
          return;
        }
        filterHits.set(filter.raw, (filterHits.get(filter.raw) || 0) + 1);
        if (dialog === void 0 || timer !== void 0) {
          return;
        }
        timer = self.requestIdleCallback(
          () => {
            timer = void 0;
            updateList();
          },
          { timeout: 2001 }
        );
      }
    };
  })();
  (() => {
    const lines = [];
    const options = {
      format: "list",
      encoding: "markdown",
      time: "anonymous"
    };
    let dialog;
    const collectLines = function() {
      lines.length = 0;
      let t0 = filteredLoggerEntries.length !== 0 ? filteredLoggerEntries[filteredLoggerEntries.length - 1].tstamp : 0;
      for (const entry of filteredLoggerEntries) {
        const text = entry.textContent;
        const fields = [];
        let beg = text.indexOf("");
        if (beg === 0) {
          continue;
        }
        let timeField = text.slice(0, beg);
        if (options.time === "anonymous") {
          timeField = "+" + Math.round(entry.tstamp - t0).toString();
        }
        fields.push(timeField);
        beg += 1;
        while (beg < text.length) {
          let end = text.indexOf("", beg);
          if (end === -1) {
            end = text.length;
          }
          fields.push(text.slice(beg, end));
          beg = end + 1;
        }
        lines.push(fields);
      }
    };
    const formatAsPlainTextTable = function() {
      const outputAll = [];
      for (const fields of lines) {
        outputAll.push(fields.join("	"));
      }
      outputAll.push("");
      return outputAll.join("\n");
    };
    const formatAsMarkdownTable = function() {
      const outputAll = [];
      let fieldCount = 0;
      for (const fields of lines) {
        if (fields.length <= 2) {
          continue;
        }
        if (fields.length > fieldCount) {
          fieldCount = fields.length;
        }
        const outputOne = [];
        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          const code = i === 1 || /\b(?:www\.|https?:\/\/)/.test(field) ? "`" : "";
          outputOne.push(` ${code}${field.replace(/\|/g, "\\|")}${code} `);
        }
        outputAll.push(outputOne.join("|"));
      }
      if (fieldCount !== 0) {
        outputAll.unshift(
          `${" |".repeat(fieldCount - 1)} `,
          `${":--- |".repeat(fieldCount - 1)}:--- `
        );
      }
      return `<details><summary>Logger output</summary>

|${outputAll.join("|\n|")}|
</details>
`;
    };
    const formatAsTable = function() {
      if (options.encoding === "plain") {
        return formatAsPlainTextTable();
      }
      return formatAsMarkdownTable();
    };
    const formatAsList = function() {
      const outputAll = [];
      for (const fields of lines) {
        const outputOne = [];
        for (let i = 0; i < fields.length; i++) {
          let str = fields[i];
          if (str.length === 0) {
            continue;
          }
          outputOne.push(str);
        }
        outputAll.push(outputOne.join("\n"));
      }
      let before, between, after;
      if (options.encoding === "markdown") {
        const code = "```";
        before = `<details><summary>Logger output</summary>

${code}
`;
        between = `
${code}
${code}
`;
        after = `
${code}
</details>
`;
      } else {
        before = "";
        between = "\n\n";
        after = "\n";
      }
      return `${before}${outputAll.join(between)}${after}`;
    };
    const format = function() {
      const output = qs$(dialog, ".output");
      if (options.format === "list") {
        output.textContent = formatAsList();
      } else {
        output.textContent = formatAsTable();
      }
    };
    const setRadioButton = function(group, value) {
      if (Object.hasOwn(options, group) === false) {
        return;
      }
      const groupEl = qs$(dialog, `[data-radio="${group}"]`);
      const buttonEls = qsa$(groupEl, "[data-radio-item]");
      for (const buttonEl of buttonEls) {
        dom.cl.toggle(
          buttonEl,
          "on",
          dom.attr(buttonEl, "data-radio-item") === value
        );
      }
      options[group] = value;
    };
    const onOption = function(ev) {
      const target = ev.target.closest("span[data-i18n]");
      if (target === null) {
        return;
      }
      if (target.matches(".pushbutton")) {
        const textarea = qs$(dialog, "textarea");
        textarea.focus();
        if (textarea.selectionEnd === textarea.selectionStart) {
          textarea.select();
        }
        document.execCommand("copy");
        ev.stopPropagation();
        return;
      }
      const group = target.closest("[data-radio]");
      if (group === null) {
        return;
      }
      if (target.matches("span.on")) {
        return;
      }
      const item = target.closest("[data-radio-item]");
      if (item === null) {
        return;
      }
      setRadioButton(
        dom.attr(group, "data-radio"),
        dom.attr(item, "data-radio-item")
      );
      format();
      ev.stopPropagation();
    };
    const toggleOn = function() {
      dialog = modalDialog.create(
        "#loggerExportDialog",
        () => {
          dialog = void 0;
          lines.length = 0;
        }
      );
      setRadioButton("format", options.format);
      setRadioButton("encoding", options.encoding);
      collectLines();
      format();
      dom.on(qs$(dialog, ".options"), "click", onOption, { capture: true });
      modalDialog.show();
    };
    dom.on("#loggerExport", "click", toggleOn);
  })();
  var loggerSettings = (() => {
    const settings = {
      discard: {
        maxAge: 240,
        // global
        maxEntryCount: 2e3,
        // per-tab
        maxLoadCount: 20
        // per-tab
      },
      columns: [true, true, true, true, true, true, true, true, true],
      linesPerEntry: 4
    };
    vAPI.localStorage.getItemAsync("loggerSettings").then((value) => {
      try {
        const stored = JSON.parse(value);
        if (typeof stored.discard.maxAge === "number") {
          settings.discard.maxAge = stored.discard.maxAge;
        }
        if (typeof stored.discard.maxEntryCount === "number") {
          settings.discard.maxEntryCount = stored.discard.maxEntryCount;
        }
        if (typeof stored.discard.maxLoadCount === "number") {
          settings.discard.maxLoadCount = stored.discard.maxLoadCount;
        }
        if (typeof stored.linesPerEntry === "number") {
          settings.linesPerEntry = stored.linesPerEntry;
        }
        if (Array.isArray(stored.columns)) {
          settings.columns = stored.columns;
        }
      } catch {
      }
    });
    const valueFromInput = function(input, def) {
      let value = parseInt(input.value, 10);
      if (isNaN(value)) {
        value = def;
      }
      const min = parseInt(dom.attr(input, "min"), 10);
      if (isNaN(min) === false) {
        value = Math.max(value, min);
      }
      const max = parseInt(dom.attr(input, "max"), 10);
      if (isNaN(max) === false) {
        value = Math.min(value, max);
      }
      return value;
    };
    const toggleOn = function() {
      const dialog = modalDialog.create(
        "#loggerSettingsDialog",
        (dialog2) => {
          toggleOff(dialog2);
        }
      );
      let inputs = qsa$(dialog, 'input[type="number"]');
      inputs[0].value = settings.discard.maxAge;
      inputs[1].value = settings.discard.maxLoadCount;
      inputs[2].value = settings.discard.maxEntryCount;
      inputs[3].value = settings.linesPerEntry;
      dom.on(inputs[3], "input", (ev) => {
        settings.linesPerEntry = valueFromInput(ev.target, 4);
        viewPort.updateLayout();
      });
      const onColumnChanged = (ev) => {
        const input = ev.target;
        const i = parseInt(dom.attr(input, "data-column"), 10);
        settings.columns[i] = input.checked !== true;
        viewPort.updateLayout();
      };
      inputs = qsa$(dialog, 'input[type="checkbox"][data-column]');
      for (const input of inputs) {
        const i = parseInt(dom.attr(input, "data-column"), 10);
        input.checked = settings.columns[i] === false;
        dom.on(input, "change", onColumnChanged);
      }
      modalDialog.show();
    };
    const toggleOff = function(dialog) {
      let inputs = qsa$(dialog, 'input[type="number"]');
      settings.discard.maxAge = valueFromInput(inputs[0], 240);
      settings.discard.maxLoadCount = valueFromInput(inputs[1], 25);
      settings.discard.maxEntryCount = valueFromInput(inputs[2], 2e3);
      settings.linesPerEntry = valueFromInput(inputs[3], 4);
      inputs = qsa$(dialog, 'input[type="checkbox"][data-column]');
      for (const input of inputs) {
        const i = parseInt(dom.attr(input, "data-column"), 10);
        settings.columns[i] = input.checked !== true;
      }
      vAPI.localStorage.setItem(
        "loggerSettings",
        JSON.stringify(settings)
      );
      viewPort.updateLayout();
    };
    dom.on("#loggerSettings", "click", toggleOn);
    return settings;
  })();
  var grabView = function() {
    if (logger.ownerId === void 0) {
      logger.ownerId = Date.now();
    }
    readLogBuffer();
  };
  var releaseView = function() {
    if (logger.ownerId === void 0) {
      return;
    }
    vAPI.messaging.send("loggerUI", {
      what: "releaseView",
      ownerId: logger.ownerId
    });
    logger.ownerId = void 0;
  };
  dom.on(window, "pagehide", releaseView);
  dom.on(window, "pageshow", grabView);
  dom.on(window, "beforeunload", releaseView);
  dom.on("#pageSelector", "change", pageSelectorChanged);
  dom.on("#netInspector .vCompactToggler", "click", toggleVCompactView);
  dom.on("#pause", "click", pauseNetInspector);
  dom.on("#netInspector #vwContent", "copy", (ev) => {
    const selection = document.getSelection();
    const text = selection.toString();
    if (/\x1F|\u200B/.test(text) === false) {
      return;
    }
    ev.clipboardData.setData("text/plain", text.replace(/\x1F|\u200B/g, "	"));
    ev.preventDefault();
  });
  pageSelectorFromURLHash();
  dom.on(window, "hashchange", pageSelectorFromURLHash);
  if (self.location.search.includes("popup=1")) {
    dom.on(window, "load", () => {
      vAPI.defer.once(2e3).then(() => {
        popupLoggerBox = {
          x: self.screenX,
          y: self.screenY,
          w: self.outerWidth,
          h: self.outerHeight
        };
      });
    }, { once: true });
  }
})();
/*! Home: https://github.com/gorhill/publicsuffixlist.js -- GPLv3 APLv2 */
/*! https://mths.be/punycode v1.3.2 by @mathias */
