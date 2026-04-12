(() => {
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
    static text(target, text2) {
      const targets = normalizeTarget(target);
      if (text2 === void 0) {
        return targets.length !== 0 ? targets[0].textContent ?? void 0 : void 0;
      }
      for (const elem of targets) {
        elem.textContent = text2;
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
      return function(text2) {
        if (text2.indexOf("&") !== -1) {
          text2 = text2.replace(/&[a-z]+;/g, decodeEntities);
        }
        return text2;
      };
    })();
    const safeTextToTextNode = function(text2) {
      return document.createTextNode(expandHtmlEntities(text2));
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
    const safeTextToDOM = function(text2, parent) {
      if (text2 === "") {
        return;
      }
      const hasTemplate = text2.indexOf("{{") !== -1;
      if (text2.indexOf("<") === -1 && !hasTemplate) {
        const toInsert = safeTextToTextNode(text2);
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
      text2 = text2.replace(/^<p>|<\/p>/g, "").replace(/<p>/g, "\n\n");
      const domParser = new DOMParser();
      const parsedDoc = domParser.parseFromString(text2, "text/html");
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
        let text2 = i18n$(elem.getAttribute("data-i18n") || "");
        if (!text2) {
          continue;
        }
        if (text2.indexOf("{{") === -1) {
          safeTextToDOM(text2, elem);
          continue;
        }
        const parts = text2.split(/(\{\{[^}]+\}\})/);
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
        const text2 = i18n$(elem.getAttribute("data-i18n-title") || "");
        if (!text2) {
          continue;
        }
        elem.setAttribute("title", expandHtmlEntities(text2));
      }
      const elemsPlaceholder = root.querySelectorAll("[placeholder]");
      for (let i = 0; i < elemsPlaceholder.length; i++) {
        const elem = elemsPlaceholder[i];
        const text2 = i18n$(elem.getAttribute("placeholder") || "");
        if (text2 === "") {
          continue;
        }
        elem.setAttribute("placeholder", text2);
      }
      const elemsTip = root.querySelectorAll("[data-i18n-tip]");
      for (let i = 0; i < elemsTip.length; i++) {
        const elem = elemsTip[i];
        const text2 = i18n$(elem.getAttribute("data-i18n-tip") || "").replace(/<br>/g, "\n").replace(/\n{3,}/g, "\n\n");
        elem.setAttribute("data-tip", text2);
        if (elem.getAttribute("aria-label") === "data-tip") {
          elem.setAttribute("aria-label", text2);
        }
      }
      const elemsLabel = root.querySelectorAll("[data-i18n-label]");
      for (let i = 0; i < elemsLabel.length; i++) {
        const elem = elemsLabel[i];
        const text2 = i18n$(elem.getAttribute("data-i18n-label") || "");
        elem.setAttribute("label", text2);
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
    i18n.patchUnicodeFlags = function(text2) {
      const fragment = document.createDocumentFragment();
      let i = 0;
      for (; ; ) {
        const match = reUnicodeFlags.exec(text2);
        if (match === null) {
          break;
        }
        if (match.index > i) {
          fragment.append(text2.slice(i, match.index));
        }
        const img = document.createElement("img");
        const countryCode = unicodeFlagToImageSrc.get(match[0]);
        img.src = `/img/flags-of-the-world/${countryCode}.png`;
        img.title = countryCode;
        img.classList.add("countryFlag");
        fragment.append(img, "\u200A");
        i = reUnicodeFlags.lastIndex;
      }
      if (i < text2.length) {
        fragment.append(text2.slice(i));
      }
      return fragment;
    };
    i18n.render();
  }

  // src/js/popup-zapper.ts
  var resolvePopupTabId = async (popupData2, chromeApi) => {
    if (typeof popupData2.tabId === "number") {
      return popupData2.tabId;
    }
    if (chromeApi.tabs === void 0) {
      return null;
    }
    const tabs = await chromeApi.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    const tabId = tabs[0]?.id;
    return typeof tabId === "number" ? tabId : null;
  };
  var injectZapperScripts = async (popupData2, chromeApi) => {
    if (chromeApi.scripting === void 0) {
      return false;
    }
    const tabId = await resolvePopupTabId(popupData2, chromeApi);
    if (tabId === null) {
      return false;
    }
    await chromeApi.scripting.executeScript({
      target: { tabId },
      files: [
        "/js/scripting/tool-overlay.js",
        "/js/scripting/zapper.js"
      ]
    });
    return true;
  };

  // src/js/popup-picker.ts
  var launchElementPicker = async (popupData2, chromeApi) => {
    if (chromeApi.scripting === void 0) {
      return false;
    }
    const tabId = await resolvePopupTabId2(popupData2, chromeApi);
    if (tabId === null) {
      return false;
    }
    await chromeApi.scripting.executeScript({
      target: { tabId },
      files: [
        "/js/scripting/tool-overlay.js",
        "/js/scripting/picker.js"
      ]
    });
    return true;
  };
  var resolvePopupTabId2 = async (popupData2, chromeApi) => {
    if (typeof popupData2.tabId === "number") {
      return popupData2.tabId;
    }
    if (chromeApi.tabs === void 0) {
      return null;
    }
    const tabs = await chromeApi.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    const tabId = tabs[0]?.id;
    return typeof tabId === "number" ? tabId : null;
  };

  // src/lib/punycode.js
  var punycode_default = (function() {
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
  })();

  // src/js/popup-fenix.ts
  var popupFontSize = "unset";
  Promise.resolve(vAPI.localStorage?.getItemAsync?.("popupFontSize")).then((value) => {
    if (typeof value !== "string" || value === "unset") {
      return;
    }
    document.body.style.setProperty("--font-size", value);
    popupFontSize = value;
  }).catch(() => {
  });
  Promise.resolve(vAPI.localStorage?.getItemAsync?.("popupPanelSections")).then((bits) => {
    if (typeof bits !== "number") {
      return;
    }
    setSections(bits);
  }).catch(() => {
  });
  var messaging = vAPI.messaging;
  var gotoZap = async function() {
    if (popupData.netFilteringSwitch !== true) {
      return;
    }
    if (typeof chrome === "undefined") {
      console.log("[Zapper] chrome.scripting API not available");
      return;
    }
    try {
      const injected = await injectZapperScripts(popupData, chrome);
      if (injected === false) {
        console.log("[Zapper] No tab ID available");
        return;
      }
      console.log("[Zapper] Zapper scripts injected successfully");
    } catch (err) {
      console.error("[Zapper] Failed to inject scripts:", err);
    }
    vAPI.closePopup();
  };
  var gotoPick = async function() {
    if (popupData.netFilteringSwitch !== true) {
      return;
    }
    if (typeof chrome !== "undefined") {
      try {
        const fallbackTabId = popupData.tabId ?? (parseInt(new URL(self.location.href).searchParams.get("tabId"), 10) || void 0);
        const launched = await launchElementPicker(
          { ...popupData, tabId: fallbackTabId },
          chrome
        );
        if (launched === false) {
          console.log("[Picker] No tab ID available");
        } else {
          console.log("[Picker] Element picker launched successfully");
        }
      } catch (err) {
        console.error("[Picker] Failed to launch element picker:", err);
      }
    }
    vAPI.closePopup();
  };
  var scopeToSrcHostnameMap = {
    "/": "*",
    ".": ""
  };
  var hostnameToSortableTokenMap = /* @__PURE__ */ new Map();
  var statsStr = i18n$("popupBlockedStats");
  var domainsHitStr = i18n$("popupHitDomainCount");
  var popupData = {};
  var dfPaneBuilt = false;
  var dfHotspots = null;
  var allHostnameRows = [];
  var cachedPopupHash = "";
  var forceReloadFlag = 0;
  var hiddenElementCount = 0;
  var normalizeMessagingResponse = function(data) {
    if (data && typeof data === "object") {
      const payload = data.payload;
      if (payload && typeof payload === "object") {
        return payload;
      }
      const msg = data.msg;
      if (msg && typeof msg === "object") {
        return msg;
      }
    }
    return data;
  };
  var reCyrillicNonAmbiguous = /[\u0400-\u042b\u042d-\u042f\u0431\u0432\u0434\u0436-\u043d\u0442\u0444\u0446-\u0449\u044b-\u0454\u0457\u0459-\u0460\u0462-\u0474\u0476-\u04ba\u04bc\u04be-\u04ce\u04d0-\u0500\u0502-\u051a\u051c\u051e-\u052f]/;
  var reCyrillicAmbiguous = /[\u042c\u0430\u0433\u0435\u043e\u043f\u0440\u0441\u0443\u0445\u044a\u0455\u0456\u0458\u0461\u0475\u04bb\u04bd\u04cf\u0501\u051b\u051d]/;
  var cachePopupData = function(data) {
    data = normalizeMessagingResponse(data);
    popupData = {};
    scopeToSrcHostnameMap["."] = "";
    hostnameToSortableTokenMap.clear();
    if (typeof data !== "object") {
      return popupData;
    }
    popupData = data;
    popupData.cnameMap = new Map(popupData.cnameMap);
    scopeToSrcHostnameMap["."] = popupData.pageHostname || "";
    const hostnameDict = popupData.hostnameDict;
    if (typeof hostnameDict !== "object") {
      return popupData;
    }
    for (const hostname in hostnameDict) {
      if (Object.hasOwn(hostnameDict, hostname) === false) {
        continue;
      }
      let domain = hostnameDict[hostname].domain;
      let prefix = hostname.slice(0, 0 - domain.length - 1);
      if (domain === popupData.pageDomain) {
        domain = " ";
      }
      hostnameToSortableTokenMap.set(
        hostname,
        domain + " " + prefix.split(".").reverse().join(".")
      );
    }
    return popupData;
  };
  var hashFromPopupData = function(reset = false) {
    if (popupData.pageHostname === "behind-the-scene") {
      dom.cl.remove(dom.body, "needReload");
      return;
    }
    const hasher = [];
    const rules = popupData.firewallRules;
    for (const key in rules) {
      const rule = rules[key];
      if (rule === void 0) {
        continue;
      }
      hasher.push(rule);
    }
    hasher.sort();
    hasher.push(
      dom.cl.has("body", "off"),
      dom.cl.has("#no-large-media", "on"),
      dom.cl.has("#no-cosmetic-filtering", "on"),
      dom.cl.has("#no-remote-fonts", "on"),
      dom.cl.has("#no-scripting", "on")
    );
    const hash = hasher.join("");
    if (reset) {
      cachedPopupHash = hash;
      forceReloadFlag = 0;
    }
    dom.cl.toggle(
      dom.body,
      "needReload",
      hash !== cachedPopupHash || popupData.hasUnprocessedRequest === true
    );
  };
  var gtz = (n) => typeof n === "number" && n > 0;
  var formatNumber = function(count) {
    if (typeof count !== "number") {
      return "";
    }
    if (count < 1e6) {
      return count.toLocaleString();
    }
    if (intlNumberFormat === void 0 && Intl.NumberFormat instanceof Function) {
      const intl = new Intl.NumberFormat(void 0, {
        notation: "compact",
        maximumSignificantDigits: 4
      });
      if (intl.resolvedOptions instanceof Function && Object.hasOwn(intl.resolvedOptions(), "notation")) {
        intlNumberFormat = intl;
      }
    }
    if (intlNumberFormat) {
      return intlNumberFormat.format(count);
    }
    count /= 1e6;
    if (count >= 100) {
      count = Math.floor(count * 10) / 10;
    } else if (count > 10) {
      count = Math.floor(count * 100) / 100;
    } else {
      count = Math.floor(count * 1e3) / 1e3;
    }
    return count.toLocaleString(void 0) + "\u2009M";
  };
  var intlNumberFormat;
  var renderBlockedOnThisPageStat = function() {
    let blocked = 0;
    let total = 0;
    if (popupData.pageCounts !== void 0) {
      const counts = popupData.pageCounts;
      blocked = counts.blocked.any;
      total = blocked + counts.allowed.any;
    }
    const text2 = total === 0 ? formatNumber(0) : statsStr.replace("{{count}}", formatNumber(blocked)).replace("{{percent}}", formatNumber(Math.floor(blocked * 100 / total)));
    dom.text('[data-i18n^="popupBlockedOnThisPage"] + span', text2);
  };
  var safePunycodeToUnicode = function(hn) {
    const pretty = punycode_default.toUnicode(hn);
    return pretty === hn || reCyrillicAmbiguous.test(pretty) === false || reCyrillicNonAmbiguous.test(pretty) ? pretty : hn;
  };
  var updateFirewallCellCount = function(cells, allowed, blocked) {
    for (const cell of cells) {
      if (gtz(allowed)) {
        dom.attr(
          cell,
          "data-acount",
          Math.min(Math.ceil(Math.log(allowed + 1) / Math.LN10), 3)
        );
      } else {
        dom.attr(cell, "data-acount", "0");
      }
      if (gtz(blocked)) {
        dom.attr(
          cell,
          "data-bcount",
          Math.min(Math.ceil(Math.log(blocked + 1) / Math.LN10), 3)
        );
      } else {
        dom.attr(cell, "data-bcount", "0");
      }
    }
  };
  var updateFirewallCellRule = function(cells, scope, des, type, rule) {
    const ruleParts = rule !== void 0 ? rule.split(" ") : void 0;
    for (const cell of cells) {
      if (ruleParts === void 0) {
        dom.attr(cell, "class", null);
        continue;
      }
      const action = updateFirewallCellRule.actionNames[ruleParts[3]];
      dom.attr(cell, "class", `${action}Rule`);
      if ((ruleParts[1] !== "*" || ruleParts[2] === type) && ruleParts[1] === des && ruleParts[0] === scopeToSrcHostnameMap[scope]) {
        dom.cl.add(cell, "ownRule");
      }
    }
  };
  updateFirewallCellRule.actionNames = { "1": "block", "2": "allow", "3": "noop" };
  var updateAllFirewallCells = function(doRules = true, doCounts = true) {
    const { pageDomain } = popupData;
    const rowContainer = qs$("#firewall");
    const rows = qsa$(rowContainer, "#firewall > [data-des][data-type]");
    let a1pScript = 0, b1pScript = 0;
    let a3pScript = 0, b3pScript = 0;
    let a3pFrame = 0, b3pFrame = 0;
    if (popupData.firewallRules === void 0) {
      return;
    }
    if (popupData.hostnameDict === void 0) {
      return;
    }
    for (const row of rows) {
      const des = dom.attr(row, "data-des");
      const type = dom.attr(row, "data-type");
      if (doRules) {
        updateFirewallCellRule(
          qsa$(row, ':scope > span[data-src="/"]'),
          "/",
          des,
          type,
          popupData.firewallRules[`/ ${des} ${type}`]
        );
      }
      const cells = qsa$(row, ':scope > span[data-src="."]');
      if (doRules) {
        updateFirewallCellRule(
          cells,
          ".",
          des,
          type,
          popupData.firewallRules[`. ${des} ${type}`]
        );
      }
      if (des === "*" || type !== "*") {
        continue;
      }
      if (doCounts === false) {
        continue;
      }
      const hnDetails = popupData.hostnameDict[des];
      if (hnDetails === void 0) {
        updateFirewallCellCount(cells);
        continue;
      }
      const { allowed, blocked } = hnDetails.counts;
      updateFirewallCellCount([cells[0]], allowed.any, blocked.any);
      const { totals } = hnDetails;
      if (totals !== void 0) {
        updateFirewallCellCount([cells[1]], totals.allowed.any, totals.blocked.any);
      }
      if (hnDetails.domain === pageDomain) {
        a1pScript += allowed.script;
        b1pScript += blocked.script;
      } else {
        a3pScript += allowed.script;
        b3pScript += blocked.script;
        a3pFrame += allowed.frame;
        b3pFrame += blocked.frame;
      }
    }
    if (doCounts) {
      const fromType = (type) => qsa$(`#firewall > [data-des="*"][data-type="${type}"] > [data-src="."]`);
      updateFirewallCellCount(fromType("1p-script"), a1pScript, b1pScript);
      updateFirewallCellCount(fromType("3p-script"), a3pScript, b3pScript);
      dom.cl.toggle(rowContainer, "has3pScript", a3pScript !== 0 || b3pScript !== 0);
      updateFirewallCellCount(fromType("3p-frame"), a3pFrame, b3pFrame);
      dom.cl.toggle(rowContainer, "has3pFrame", a3pFrame !== 0 || b3pFrame !== 0);
    }
    dom.cl.toggle(dom.body, "needSave", popupData.matrixIsDirty === true);
  };
  var expandHostnameStats = () => {
    for (const des of allHostnameRows) {
      const hnDetails = popupData.hostnameDict[des];
      if (hnDetails === void 0 || hnDetails.counts === void 0) {
        continue;
      }
      const { domain, counts } = hnDetails;
      const isDomain = des === domain;
      const { allowed: hnAllowed, blocked: hnBlocked } = counts;
      const dnDetails = popupData.hostnameDict[domain];
      if (dnDetails === void 0 || dnDetails.counts === void 0) {
        continue;
      }
      if (isDomain) {
        dnDetails.totals = JSON.parse(JSON.stringify(dnDetails.counts));
        dnDetails.hasScript = false;
        dnDetails.hasFrame = false;
      } else {
        if (dnDetails.totals === void 0) {
          dnDetails.totals = JSON.parse(JSON.stringify(dnDetails.counts));
          dnDetails.hasScript = false;
          dnDetails.hasFrame = false;
        }
        const { allowed: dnAllowed, blocked: dnBlocked } = dnDetails.totals;
        dnAllowed.any += hnAllowed.any;
        dnBlocked.any += hnBlocked.any;
      }
      hnDetails.hasScript = hnAllowed.script !== 0 || hnBlocked.script !== 0;
      dnDetails.hasScript = dnDetails.hasScript || hnDetails.hasScript;
      hnDetails.hasFrame = hnAllowed.frame !== 0 || hnBlocked.frame !== 0;
      dnDetails.hasFrame = dnDetails.hasFrame || hnDetails.hasFrame;
    }
  };
  var buildAllFirewallRows = function() {
    if (dfHotspots === null) {
      dfHotspots = qs$("#actionSelector");
      dom.on(dfHotspots, "click", setFirewallRuleHandler);
    }
    dfHotspots.remove();
    expandHostnameStats();
    const rowContainer = qs$("#firewall");
    const toAppend = document.createDocumentFragment();
    const rowTemplate = qs$('#templates > div[data-des=""][data-type="*"]');
    const { cnameMap, hostnameDict, pageDomain, pageHostname } = popupData;
    let row = qs$(rowContainer, 'div[data-des="*"][data-type="3p-frame"] + div');
    for (const des of allHostnameRows) {
      if (row === null) {
        row = dom.clone(rowTemplate);
        toAppend.appendChild(row);
      }
      dom.attr(row, "data-des", des);
      const hnDetails = hostnameDict[des] || {};
      const isDomain = des === hnDetails.domain;
      const prettyDomainName = des.includes("xn--") ? punycode_default.toUnicode(des) : des;
      const isPunycoded = prettyDomainName !== des;
      if (isDomain && row.childElementCount < 4) {
        row.append(dom.clone(row.children[2]));
      } else if (isDomain === false && row.childElementCount === 4) {
        row.children[3].remove();
      }
      const span = qs$(row, "span:first-of-type");
      dom.text(qs$(span, ":scope > span > span"), prettyDomainName);
      const classList = row.classList;
      let desExtra = "";
      if (classList.toggle("isCname", cnameMap.has(des))) {
        desExtra = punycode_default.toUnicode(cnameMap.get(des));
      } else if (isDomain && isPunycoded && reCyrillicAmbiguous.test(prettyDomainName) && reCyrillicNonAmbiguous.test(prettyDomainName) === false) {
        desExtra = des;
      }
      dom.text(qs$(span, "sub"), desExtra);
      classList.toggle("isRootContext", des === pageHostname);
      classList.toggle("is3p", hnDetails.domain !== pageDomain);
      classList.toggle("isDomain", isDomain);
      classList.toggle("hasSubdomains", isDomain && hnDetails.hasSubdomains);
      classList.toggle("isSubdomain", !isDomain);
      const { counts } = hnDetails;
      classList.toggle("allowed", gtz(counts.allowed.any));
      classList.toggle("blocked", gtz(counts.blocked.any));
      const { totals } = hnDetails;
      classList.toggle("totalAllowed", gtz(totals && totals.allowed.any));
      classList.toggle("totalBlocked", gtz(totals && totals.blocked.any));
      classList.toggle("hasScript", hnDetails.hasScript === true);
      classList.toggle("hasFrame", hnDetails.hasFrame === true);
      classList.toggle("expandException", expandExceptions.has(hnDetails.domain));
      row = row.nextElementSibling;
    }
    if (row !== null) {
      while (row.nextElementSibling !== null) {
        row.nextElementSibling.remove();
      }
      row.remove();
    }
    if (toAppend.childElementCount !== 0) {
      rowContainer.append(toAppend);
    }
    if (dfPaneBuilt !== true && popupData.advancedUserEnabled) {
      dom.on("#firewall", "click", "span[data-src]", unsetFirewallRuleHandler);
      dom.on("#firewall", "mouseenter", "span[data-src]", mouseenterCellHandler);
      dom.on("#firewall", "mouseleave", "span[data-src]", mouseleaveCellHandler);
      dfPaneBuilt = true;
    }
    updateAllFirewallCells();
  };
  var hostnameCompare = function(a, b) {
    let ha = a;
    if (!reIP.test(ha)) {
      ha = hostnameToSortableTokenMap.get(ha) || " ";
    }
    let hb = b;
    if (!reIP.test(hb)) {
      hb = hostnameToSortableTokenMap.get(hb) || " ";
    }
    const ca = ha.charCodeAt(0);
    const cb = hb.charCodeAt(0);
    return ca !== cb ? ca - cb : ha.localeCompare(hb);
  };
  var reIP = /(\d|\])$/;
  function filterFirewallRows() {
    const firewallElem = qs$("#firewall");
    const elems = qsa$("#firewall .filterExpressions span[data-expr]");
    let not = false;
    for (const elem of elems) {
      const on = dom.cl.has(elem, "on");
      switch (elem.dataset.expr) {
        case "not":
          not = on;
          break;
        case "blocked":
          dom.cl.toggle(firewallElem, "showBlocked", !not && on);
          dom.cl.toggle(firewallElem, "hideBlocked", not && on);
          break;
        case "allowed":
          dom.cl.toggle(firewallElem, "showAllowed", !not && on);
          dom.cl.toggle(firewallElem, "hideAllowed", not && on);
          break;
        case "script":
          dom.cl.toggle(firewallElem, "show3pScript", !not && on);
          dom.cl.toggle(firewallElem, "hide3pScript", not && on);
          break;
        case "frame":
          dom.cl.toggle(firewallElem, "show3pFrame", !not && on);
          dom.cl.toggle(firewallElem, "hide3pFrame", not && on);
          break;
        default:
          break;
      }
    }
  }
  dom.on("#firewall .filterExpressions", "click", "span[data-expr]", (ev) => {
    const target = ev.target;
    dom.cl.toggle(target, "on");
    switch (target.dataset.expr) {
      case "blocked":
        if (dom.cl.has(target, "on") === false) {
          break;
        }
        dom.cl.remove('#firewall .filterExpressions span[data-expr="allowed"]', "on");
        break;
      case "allowed":
        if (dom.cl.has(target, "on") === false) {
          break;
        }
        dom.cl.remove('#firewall .filterExpressions span[data-expr="blocked"]', "on");
        break;
    }
    filterFirewallRows();
    const elems = qsa$("#firewall .filterExpressions span[data-expr]");
    const filters = Array.from(elems).map((el) => dom.cl.has(el, "on") ? "1" : "0");
    filters.unshift("00");
    vAPI.localStorage.setItem("firewallFilters", filters.join(" "));
  });
  {
    vAPI.localStorage.getItemAsync("firewallFilters").then((v) => {
      if (v === null || v === void 0 || typeof v !== "string") {
        return;
      }
      const filters = v.split(" ");
      if (filters.shift() !== "00") {
        return;
      }
      if (filters.every((v2) => v2 === "0")) {
        return;
      }
      const elems = qsa$("#firewall .filterExpressions span[data-expr]");
      for (let i = 0; i < elems.length; i++) {
        if (filters[i] === "0") {
          continue;
        }
        dom.cl.add(elems[i], "on");
      }
      filterFirewallRows();
    });
  }
  var renderPrivacyExposure = function() {
    const allDomains = {};
    let allDomainCount = 0;
    let touchedDomainCount = 0;
    allHostnameRows.length = 0;
    const { hostnameDict } = popupData;
    const desHostnameDone = /* @__PURE__ */ new Set();
    const keys = hostnameDict ? Object.keys(hostnameDict).sort(hostnameCompare) : [];
    for (const des of keys) {
      if (des === "*" || desHostnameDone.has(des)) {
        continue;
      }
      const hnDetails = hostnameDict[des];
      const { domain, counts } = hnDetails;
      if (Object.hasOwn(allDomains, domain) === false) {
        allDomains[domain] = false;
        allDomainCount += 1;
      }
      if (gtz(counts.allowed.any)) {
        if (allDomains[domain] === false) {
          allDomains[domain] = true;
          touchedDomainCount += 1;
        }
      }
      const dnDetails = hostnameDict[domain];
      if (dnDetails !== void 0) {
        if (des !== domain) {
          dnDetails.hasSubdomains = true;
        } else if (dnDetails.hasSubdomains === void 0) {
          dnDetails.hasSubdomains = false;
        }
      }
      allHostnameRows.push(des);
      desHostnameDone.add(des);
    }
    const summary = domainsHitStr.replace("{{count}}", touchedDomainCount.toLocaleString()).replace("{{total}}", allDomainCount.toLocaleString());
    dom.text('[data-i18n^="popupDomainsConnected"] + span', summary);
  };
  var updateHnSwitches = function() {
    dom.cl.toggle("#no-popups", "on", popupData.noPopups === true);
    dom.cl.toggle("#no-large-media", "on", popupData.noLargeMedia === true);
    dom.cl.toggle("#no-cosmetic-filtering", "on", popupData.noCosmeticFiltering === true);
    dom.cl.toggle("#no-remote-fonts", "on", popupData.noRemoteFonts === true);
    dom.cl.toggle("#no-scripting", "on", popupData.noScripting === true);
  };
  var renderPopup = function() {
    if (popupData.tabTitle) {
      document.title = popupData.appName + " - " + popupData.tabTitle;
    }
    const isFiltering = popupData.netFilteringSwitch;
    dom.cl.toggle(dom.body, "advancedUser", popupData.advancedUserEnabled === true);
    dom.cl.toggle(dom.body, "off", popupData.pageURL === "" || isFiltering !== true);
    dom.cl.toggle(dom.body, "needSave", popupData.matrixIsDirty === true);
    {
      const [elemHn, elemDn] = qs$("#hostname").children;
      const { pageDomain, pageHostname } = popupData;
      if (pageDomain !== "") {
        dom.text(elemDn, safePunycodeToUnicode(pageDomain));
        dom.text(
          elemHn,
          pageHostname !== pageDomain ? safePunycodeToUnicode(pageHostname.slice(0, -pageDomain.length - 1)) + "." : ""
        );
      } else {
        dom.text(elemDn, "");
        dom.text(elemHn, "");
      }
    }
    const canPick = popupData.canElementPicker && isFiltering;
    dom.cl.toggle("#gotoZap", "canPick", canPick);
    dom.cl.toggle("#gotoPick", "canPick", canPick && popupData.userFiltersAreEnabled);
    dom.cl.toggle("#gotoReport", "canPick", canPick);
    dom.cl.toggle("#gotoZap", "hidden", isFiltering === false);
    dom.cl.toggle("#gotoPick", "hidden", isFiltering === false);
    dom.cl.toggle("#gotoReport", "hidden", isFiltering === false);
    dom.cl.remove("#gotoZap", "disabled");
    dom.cl.remove("#gotoPick", "disabled");
    dom.cl.remove("#gotoReport", "disabled");
    let blocked, total;
    renderBlockedOnThisPageStat();
    blocked = popupData.globalBlockedRequestCount;
    total = popupData.globalAllowedRequestCount + blocked;
    if (total === 0) {
      text = formatNumber(0);
    } else {
      text = statsStr.replace("{{count}}", formatNumber(blocked)).replace("{{percent}}", formatNumber(Math.floor(blocked * 100 / total)));
    }
    dom.text('[data-i18n^="popupBlockedSinceInstall"] + span', text);
    renderPrivacyExposure();
    updateHnSwitches();
    total = popupData.popupBlockedCount;
    dom.text(
      "#no-popups .fa-icon-badge",
      total ? Math.min(total, 99).toLocaleString() : ""
    );
    total = popupData.largeMediaCount;
    dom.text(
      "#no-large-media .fa-icon-badge",
      total ? Math.min(total, 99).toLocaleString() : ""
    );
    total = popupData.remoteFontCount;
    dom.text(
      "#no-remote-fonts .fa-icon-badge",
      total ? Math.min(total, 99).toLocaleString() : ""
    );
    dom.cl.toggle(dom.root, "warn", popupData.hasUnprocessedRequest === true);
    dom.cl.toggle(dom.html, "colorBlind", popupData.colorBlindFriendly === true);
    setGlobalExpand(popupData.firewallPaneMinimized === false, true);
    if ((computedSections() & sectionFirewallBit) !== 0) {
      buildAllFirewallRows();
    }
    renderTooltips();
  };
  dom.on(".dismiss", "click", () => {
    messaging.send("popupPanel", {
      what: "dismissUnprocessedRequest",
      tabId: popupData.tabId
    }).then(() => {
      popupData.hasUnprocessedRequest = false;
      dom.cl.remove(dom.root, "warn");
    });
  });
  var renderTooltips = function(selector) {
    for (const [key, details] of tooltipTargetSelectors) {
      if (selector !== void 0 && key !== selector) {
        continue;
      }
      const elem = qs$(key);
      if (elem.hasAttribute("title") === false) {
        continue;
      }
      const text2 = i18n$(
        details.i18n + (qs$(details.state) === null ? "1" : "2")
      );
      dom.attr(elem, "aria-label", text2);
      dom.attr(elem, "title", text2);
    }
  };
  var tooltipTargetSelectors = /* @__PURE__ */ new Map([
    [
      "#switch",
      {
        state: "body.off",
        i18n: "popupPowerSwitchInfo"
      }
    ],
    [
      "#no-popups",
      {
        state: "#no-popups.on",
        i18n: "popupTipNoPopups"
      }
    ],
    [
      "#no-large-media",
      {
        state: "#no-large-media.on",
        i18n: "popupTipNoLargeMedia"
      }
    ],
    [
      "#no-cosmetic-filtering",
      {
        state: "#no-cosmetic-filtering.on",
        i18n: "popupTipNoCosmeticFiltering"
      }
    ],
    [
      "#no-remote-fonts",
      {
        state: "#no-remote-fonts.on",
        i18n: "popupTipNoRemoteFonts"
      }
    ],
    [
      "#no-scripting",
      {
        state: "#no-scripting.on",
        i18n: "popupTipNoScripting"
      }
    ]
  ]);
  var renderOnce = function() {
    renderOnce = function() {
    };
    if (popupData.fontSize !== popupFontSize) {
      popupFontSize = popupData.fontSize;
      if (popupFontSize !== "unset") {
        dom.body.style.setProperty("--font-size", popupFontSize);
        vAPI.localStorage.setItem("popupFontSize", popupFontSize);
      } else {
        dom.body.style.removeProperty("--font-size");
        vAPI.localStorage.removeItem("popupFontSize");
      }
    }
    dom.text("#version", popupData.appVersion);
    setSections(computedSections());
    if (popupData.uiPopupConfig !== void 0) {
      dom.attr(dom.body, "data-ui", popupData.uiPopupConfig);
    }
    dom.cl.toggle(dom.body, "no-tooltips", popupData.tooltipsDisabled === true);
    if (popupData.tooltipsDisabled === true) {
      dom.attr("[title]", "title", null);
    }
    if (popupData.advancedUserEnabled !== true) {
      dom.attr("#firewall [title][data-src]", "title", null);
    }
    if (popupData.popupPanelHeightMode === 1) {
      dom.cl.add(dom.body, "vMin");
    }
    if (popupData.godMode) {
      dom.cl.add(dom.body, "godMode");
    }
  };
  var renderPopupLazy = (() => {
    let mustRenderCosmeticFilteringBadge = true;
    let renderCosmeticBadge = () => {
    };
    {
      const sw = qs$("#no-cosmetic-filtering");
      const badge = qs$(sw, ":scope .fa-icon-badge");
      dom.text(badge, "\u22EF");
      const render = () => {
        if (mustRenderCosmeticFilteringBadge === false) {
          return;
        }
        mustRenderCosmeticFilteringBadge = false;
        if (dom.cl.has(sw, "hnSwitchBusy")) {
          return;
        }
        dom.cl.add(sw, "hnSwitchBusy");
        messaging.send("popupPanel", {
          what: "getHiddenElementCount",
          tabId: popupData.tabId
        }).then((count) => {
          hiddenElementCount = Math.max(0, count || 0);
          let text2;
          if ((count || 0) === 0) {
            text2 = "";
          } else if (count === -1) {
            text2 = "?";
          } else {
            text2 = Math.min(count, 99).toLocaleString();
          }
          dom.text(badge, text2);
          renderBlockedOnThisPageStat();
          dom.cl.remove(sw, "hnSwitchBusy");
        });
      };
      renderCosmeticBadge = render;
      dom.on(sw, "mouseenter", render, { passive: true });
    }
    return async function() {
      const count = await messaging.send("popupPanel", {
        what: "getScriptCount",
        tabId: popupData.tabId
      });
      dom.text(
        "#no-scripting .fa-icon-badge",
        (count || 0) !== 0 ? Math.min(count, 99).toLocaleString() : ""
      );
      hiddenElementCount = 0;
      mustRenderCosmeticFilteringBadge = true;
      renderCosmeticBadge();
    };
  })();
  var toggleNetFilteringSwitch = async function(ev) {
    console.log("[POPUP-FENIX] toggleNetFilteringSwitch called, popupData:", popupData);
    if (!popupData || !popupData.pageURL) {
      const fallbackTabId = (popupData?.tabId ?? parseInt(new URL(self.location.href).searchParams.get("tabId"), 10)) || null;
      try {
        await getPopupData(fallbackTabId);
      } catch (error) {
        console.log("[POPUP-FENIX] Failed to refresh popup data before toggle:", error);
      }
      if (!popupData || !popupData.pageURL) {
        console.log("[POPUP-FENIX] No popupData or pageURL, returning early");
        return;
      }
    }
    const nextEnabled = dom.cl.toggle(dom.body, "off") === false;
    const msg = {
      what: "toggleNetFiltering",
      url: popupData.pageURL,
      scope: ev.ctrlKey || ev.metaKey ? "page" : "",
      state: nextEnabled,
      tabId: popupData.tabId
    };
    console.log("[POPUP-FENIX] Sending popupPanel message:", msg);
    const response = await messaging.send("popupPanel", msg);
    console.log("[POPUP-FENIX] toggleNetFiltering response:", response);
    if (response && typeof response === "object") {
      cachePopupData(normalizeMessagingResponse(response));
      renderPopup();
      renderPopupLazy();
    }
    renderTooltips("#switch");
    hashFromPopupData(true);
  };
  var gotoReport = function() {
    if (popupData.netFilteringSwitch !== true) {
      return;
    }
    const popupPanel = {
      blocked: popupData.pageCounts.blocked.any
    };
    const reportedStates = [
      { name: "enabled", prop: "netFilteringSwitch", expected: true },
      { name: "no-cosmetic-filtering", prop: "noCosmeticFiltering", expected: false },
      { name: "no-large-media", prop: "noLargeMedia", expected: false },
      { name: "no-popups", prop: "noPopups", expected: false },
      { name: "no-remote-fonts", prop: "noRemoteFonts", expected: false },
      { name: "no-scripting", prop: "noScripting", expected: false },
      { name: "can-element-picker", prop: "canElementPicker", expected: true }
    ];
    for (const { name, prop, expected } of reportedStates) {
      if (popupData[prop] === expected) {
        continue;
      }
      popupPanel[name] = !expected;
    }
    if (hostnameToSortableTokenMap.size !== 0) {
      const network = {};
      const hostnames = Array.from(hostnameToSortableTokenMap.keys()).sort(hostnameCompare);
      for (const hostname of hostnames) {
        const entry = popupData.hostnameDict[hostname];
        const count = entry.counts.blocked.any;
        if (count === 0) {
          continue;
        }
        const domain = entry.domain;
        if (network[domain] === void 0) {
          network[domain] = 0;
        }
        network[domain] += count;
      }
      if (Object.keys(network).length !== 0) {
        popupPanel.network = network;
      }
    }
    messaging.send("popupPanel", {
      what: "launchReporter",
      tabId: popupData.tabId,
      pageURL: popupData.rawURL,
      popupPanel
    });
    vAPI.closePopup();
  };
  var gotoDashboard = function() {
    chrome.tabs.create({ url: "dashboard.html" });
  };
  var gotoURL = function(ev) {
    if (this.hasAttribute("href") === false) {
      return;
    }
    ev.preventDefault();
    let url = dom.attr(ev.target, "href");
    if (url === "logger-ui.html#_" && typeof popupData.tabId === "number") {
      url += "+" + popupData.tabId;
    }
    messaging.send("popupPanel", {
      what: "gotoURL",
      details: {
        url,
        select: true,
        index: -1,
        shiftKey: ev.shiftKey
      }
    });
    vAPI.closePopup();
  };
  var maxNumberOfSections = 6;
  var sectionFirewallBit = 16;
  var computedSections = () => popupData.popupPanelSections & ~popupData.popupPanelDisabledSections | popupData.popupPanelLockedSections;
  var sectionBitsFromAttribute = function() {
    const attr = document.body.dataset.more;
    if (attr === "" || attr === void 0 || attr === null) {
      return 0;
    }
    let bits = 0;
    for (const c of attr) {
      bits |= 1 << c.charCodeAt(0) - 97;
    }
    return bits;
  };
  var sectionBitsToAttribute = function(bits) {
    const attr = [];
    for (let i = 0; i < maxNumberOfSections; i++) {
      const bit = 1 << i;
      if ((bits & bit) === 0) {
        continue;
      }
      attr.push(String.fromCharCode(97 + i));
    }
    return attr.join("");
  };
  var setSections = function(bits) {
    const value = sectionBitsToAttribute(bits);
    const min = sectionBitsToAttribute(popupData.popupPanelLockedSections);
    const max = sectionBitsToAttribute(
      (1 << maxNumberOfSections) - 1 & ~popupData.popupPanelDisabledSections
    );
    document.body.dataset.more = value;
    dom.cl.toggle("#lessButton", "disabled", value === min);
    dom.cl.toggle("#moreButton", "disabled", value === max);
  };
  var toggleSections = function(more) {
    const offbits = ~popupData.popupPanelDisabledSections;
    const onbits = popupData.popupPanelLockedSections;
    let currentBits = sectionBitsFromAttribute();
    let newBits = currentBits;
    for (let i = 0; i < maxNumberOfSections; i++) {
      const bit = 1 << (more ? i : maxNumberOfSections - i - 1);
      if (more) {
        newBits |= bit;
      } else {
        newBits &= ~bit;
      }
      newBits = newBits & offbits | onbits;
      if (newBits !== currentBits) {
        break;
      }
    }
    if (newBits === currentBits) {
      return;
    }
    setSections(newBits);
    popupData.popupPanelSections = newBits;
    messaging.send("popupPanel", {
      what: "userSettings",
      name: "popupPanelSections",
      value: newBits
    });
    vAPI.localStorage.setItem("popupPanelSections", newBits);
    if ((newBits & sectionFirewallBit) !== 0 && dfPaneBuilt === false) {
      buildAllFirewallRows();
    }
  };
  dom.on("#moreButton", "click", () => {
    toggleSections(true);
  });
  dom.on("#lessButton", "click", () => {
    toggleSections(false);
  });
  var mouseenterCellHandler = function(ev) {
    const target = ev.target;
    if (dom.cl.has(target, "ownRule")) {
      return;
    }
    target.appendChild(dfHotspots);
  };
  var mouseleaveCellHandler = function() {
    if (dfHotspots !== null) {
      if (dfHotspots !== null) {
        dfHotspots.remove();
      }
    }
  };
  var setFirewallRule = async function(src, des, type, action, persist) {
    if (typeof popupData.pageHostname !== "string" || popupData.pageHostname === "") {
      return;
    }
    const response = await messaging.send("popupPanel", {
      what: "toggleFirewallRule",
      tabId: popupData.tabId,
      pageHostname: popupData.pageHostname,
      srcHostname: src,
      desHostname: des,
      requestType: type,
      action,
      persist
    });
    if (action !== 0) {
      if (dfHotspots !== null) {
        dfHotspots.remove();
      }
    }
    cachePopupData(response);
    updateAllFirewallCells(true, false);
    hashFromPopupData();
  };
  var unsetFirewallRuleHandler = function(ev) {
    const cell = ev.target;
    const row = cell.closest("[data-des]");
    setFirewallRule(
      dom.attr(cell, "data-src") === "/" ? "*" : popupData.pageHostname,
      dom.attr(row, "data-des"),
      dom.attr(row, "data-type"),
      0,
      ev.ctrlKey || ev.metaKey
    );
    cell.appendChild(dfHotspots);
  };
  var setFirewallRuleHandler = function(ev) {
    const hotspot = ev.target;
    const cell = hotspot.closest("[data-src]");
    if (cell === null) {
      return;
    }
    const row = cell.closest("[data-des]");
    let action = 0;
    if (hotspot.id === "dynaAllow") {
      action = 2;
    } else if (hotspot.id === "dynaNoop") {
      action = 3;
    } else {
      action = 1;
    }
    setFirewallRule(
      dom.attr(cell, "data-src") === "/" ? "*" : popupData.pageHostname,
      dom.attr(row, "data-des"),
      dom.attr(row, "data-type"),
      action,
      ev.ctrlKey || ev.metaKey
    );
    dfHotspots.remove();
  };
  var reloadTab = function(bypassCache = false) {
    if (popupData.tabId) {
      try {
        chrome.tabs.reload(popupData.tabId, { bypassCache: !!bypassCache });
      } catch (e) {
      }
    }
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
  var expandExceptions = /* @__PURE__ */ new Set();
  vAPI.localStorage.getItemAsync("popupExpandExceptions").then((exceptions) => {
    try {
      if (Array.isArray(exceptions) === false) {
        return;
      }
      for (const exception of exceptions) {
        expandExceptions.add(exception);
      }
    } catch {
    }
  });
  var saveExpandExceptions = function() {
    vAPI.localStorage.setItem(
      "popupExpandExceptions",
      Array.from(expandExceptions)
    );
  };
  var setGlobalExpand = function(state, internal = false) {
    dom.cl.remove(".expandException", "expandException");
    if (state) {
      dom.cl.add("#firewall", "expanded");
    } else {
      dom.cl.remove("#firewall", "expanded");
    }
    if (internal) {
      return;
    }
    popupData.firewallPaneMinimized = !state;
    expandExceptions.clear();
    saveExpandExceptions();
    messaging.send("popupPanel", {
      what: "userSettings",
      name: "firewallPaneMinimized",
      value: popupData.firewallPaneMinimized
    });
  };
  var setSpecificExpand = function(domain, state, internal = false) {
    const elems = qsa$(`[data-des="${domain}"],[data-des$=".${domain}"]`);
    if (state) {
      dom.cl.add(elems, "expandException");
    } else {
      dom.cl.remove(elems, "expandException");
    }
    if (internal) {
      return;
    }
    if (state) {
      expandExceptions.add(domain);
    } else {
      expandExceptions.delete(domain);
    }
    saveExpandExceptions();
  };
  dom.on('[data-i18n="popupAnyRulePrompt"]', "click", (ev) => {
    if (ev.shiftKey && ev.ctrlKey) {
      messaging.send("popupPanel", {
        what: "gotoURL",
        details: {
          url: `popup-fenix.html?tabId=${popupData.tabId}&intab=1`,
          select: true,
          index: -1
        }
      });
      vAPI.closePopup();
      return;
    }
    setGlobalExpand(dom.cl.has("#firewall", "expanded") === false);
  });
  dom.on("#firewall", "click", '.isDomain[data-type="*"] > span:first-of-type', (ev) => {
    const div = ev.target.closest("[data-des]");
    if (div === null) {
      return;
    }
    setSpecificExpand(
      dom.attr(div, "data-des"),
      dom.cl.has(div, "expandException") === false
    );
  });
  var saveFirewallRules = async function() {
    const response = await messaging.send("popupPanel", {
      what: "saveFirewallRules",
      tabId: popupData.tabId,
      srcHostname: popupData.pageHostname,
      desHostnames: popupData.hostnameDict
    });
    if (response instanceof Object) {
      cachePopupData(response);
      updateAllFirewallCells(true, false);
      hashFromPopupData(true);
    }
    dom.cl.remove(dom.body, "needSave");
  };
  var revertFirewallRules = async function() {
    dom.cl.remove(dom.body, "needSave");
    const response = await messaging.send("popupPanel", {
      what: "revertFirewallRules",
      srcHostname: popupData.pageHostname,
      desHostnames: popupData.hostnameDict,
      tabId: popupData.tabId
    });
    cachePopupData(response);
    updateAllFirewallCells(true, false);
    updateHnSwitches();
    hashFromPopupData();
  };
  var toggleHostnameSwitch = async function(ev) {
    const target = ev.currentTarget;
    const switchName = dom.attr(target, "id");
    if (!switchName) {
      return;
    }
    if (vAPI.webextFlavor.soup.has("mobile") && dom.cl.has(target, "hnSwitchBusy")) {
      return;
    }
    dom.cl.toggle(target, "on");
    renderTooltips(`#${switchName}`);
    const response = await messaging.send("popupPanel", {
      what: "toggleHostnameSwitch",
      name: switchName,
      hostname: popupData.pageHostname,
      state: dom.cl.has(target, "on"),
      tabId: popupData.tabId,
      persist: ev.ctrlKey || ev.metaKey
    });
    if (switchName === "no-cosmetic-filtering") {
      const badge = qs$(`#no-cosmetic-filtering .fa-icon-badge`);
      dom.text(badge, dom.cl.has("#no-cosmetic-filtering", "on") ? "\u22EF" : "");
    }
    cachePopupData(response);
    renderPopup();
    renderPopupLazy();
    hashFromPopupData();
    dom.cl.toggle(dom.body, "needSave", popupData.matrixIsDirty === true);
  };
  {
    let eventCount = 0;
    let eventTime = 0;
    dom.on(document, "keydown", (ev) => {
      if (ev.key !== "Control") {
        eventCount = 0;
        return;
      }
      if (ev.repeat) {
        return;
      }
      const now = Date.now();
      if (now - eventTime >= 500) {
        eventCount = 0;
      }
      eventCount += 1;
      eventTime = now;
      if (eventCount < 2) {
        return;
      }
      eventCount = 0;
      dom.cl.toggle(dom.body, "godMode");
    });
  }
  var pollForContentChange = (() => {
    const pollCallback = async function() {
      const response = await messaging.send("popupPanel", {
        what: "hasPopupContentChanged",
        tabId: popupData.tabId,
        contentLastModified: popupData.contentLastModified
      });
      if (response) {
        await getPopupData(popupData.tabId);
        return;
      }
      poll();
    };
    const pollTimer = vAPI.defer.create(pollCallback);
    const poll = function() {
      pollTimer.on(1500);
    };
    return poll;
  })();
  var getPopupData = async function(tabId, first = false) {
    const response = normalizeMessagingResponse(await messaging.send("popupPanel", {
      what: "getPopupData",
      tabId
    }));
    cachePopupData(response);
    renderOnce();
    renderPopup();
    renderPopupLazy();
    hashFromPopupData(first);
    pollForContentChange();
  };
  {
    const selfURL = new URL(self.location.href);
    const tabId = parseInt(selfURL.searchParams.get("tabId"), 10) || null;
    const nextFrames = async (n) => {
      for (let i = 0; i < n; i++) {
        await new Promise((resolve) => {
          self.requestAnimationFrame(() => {
            resolve();
          });
        });
      }
    };
    const setOrientation = async () => {
      if (dom.cl.has(dom.root, "mobile")) {
        dom.cl.remove(dom.root, "desktop");
        dom.cl.add(dom.root, "portrait");
        return;
      }
      if (selfURL.searchParams.get("portrait") !== null) {
        dom.cl.remove(dom.root, "desktop");
        dom.cl.add(dom.root, "portrait");
        return;
      }
      if (popupData.popupPanelOrientation === "landscape") {
        return;
      }
      if (popupData.popupPanelOrientation === "portrait") {
        dom.cl.remove(dom.root, "desktop");
        dom.cl.add(dom.root, "portrait");
        return;
      }
      if (dom.cl.has(dom.root, "desktop") === false) {
        return;
      }
      await nextFrames(8);
      const main = qs$("#main");
      const firewall = qs$("#firewall");
      const minWidth = (main.offsetWidth + firewall.offsetWidth) / 1.1;
      if (window.innerWidth < minWidth) {
        dom.cl.add(dom.root, "portrait");
      }
    };
    const checkViewport = async function() {
      await setOrientation();
      if (dom.cl.has(dom.root, "portrait")) {
        const panes = qs$("#panes");
        const sticky = qs$("#sticky");
        const stickyParent = sticky.parentElement;
        if (stickyParent !== panes) {
          panes.prepend(sticky);
        }
      }
      if (selfURL.searchParams.get("intab") !== null) {
        dom.cl.add(dom.root, "intab");
      }
      await nextFrames(1);
      dom.cl.remove(dom.body, "loading");
    };
    getPopupData(tabId, true).then(() => {
      if (document.readyState !== "complete") {
        dom.on(self, "load", () => {
          checkViewport();
        }, { once: true });
      } else {
        checkViewport();
      }
    });
  }
  dom.on("#switch", "click", toggleNetFilteringSwitch);
  dom.on("#gotoZap", "click", gotoZap);
  dom.on("#gotoPick", "click", gotoPick);
  dom.on("#gotoReport", "click", gotoReport);
  dom.on("#gotoDashboard", "click", gotoDashboard);
  dom.on(".hnSwitch", "click", (ev) => {
    toggleHostnameSwitch(ev);
  });
  dom.on("#saveRules", "click", saveFirewallRules);
  dom.on("#revertRules", "click", () => {
    revertFirewallRules();
  });
  dom.on("a[href]", "click", gotoURL);
})();
/*! https://mths.be/punycode v1.3.2 by @mathias */
