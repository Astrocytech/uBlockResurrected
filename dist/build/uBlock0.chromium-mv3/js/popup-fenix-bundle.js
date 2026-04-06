(() => {
  // dom.js
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
      const ancestor = receiver.closest(selector);
      if (ancestor === receiver && ancestor !== dispatcher && dispatcher.contains(ancestor)) {
        callback.call(receiver, event);
      }
    };
  };
  var dom = class {
    static attr(target, attr, value = void 0) {
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
    }
    static prop(target, prop, value = void 0) {
      for (const elem of normalizeTarget(target)) {
        if (value === void 0) {
          return elem[prop];
        }
        elem[prop] = value;
      }
    }
    static text(target, text) {
      const targets = normalizeTarget(target);
      if (text === void 0) {
        return targets.length !== 0 ? targets[0].textContent : void 0;
      }
      for (const elem of targets) {
        elem.textContent = text;
      }
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
      if (typeof subtarget === "function") {
        options = callback;
        callback = subtarget;
        subtarget = void 0;
        if (typeof options === "boolean") {
          options = { capture: true };
        }
      } else {
        callback = makeEventHandler(subtarget, callback);
        if (options === void 0 || typeof options === "boolean") {
          options = { capture: true };
        } else {
          options.capture = true;
        }
      }
      const targets = target instanceof Window || target instanceof Document ? [target] : normalizeTarget(target);
      for (const elem of targets) {
        elem.addEventListener(type, callback, options);
      }
    }
    static off(target, type, callback, options) {
      if (typeof callback !== "function") {
        return;
      }
      if (typeof options === "boolean") {
        options = { capture: true };
      }
      const targets = target instanceof Window || target instanceof Document ? [target] : normalizeTarget(target);
      for (const elem of targets) {
        elem.removeEventListener(type, callback, options);
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
        observer.disconnect();
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
    return a.querySelector(b);
  }
  function qsa$(a, b) {
    if (typeof a === "string") {
      return document.querySelectorAll(a);
    }
    if (a === null) {
      return [];
    }
    return a.querySelectorAll(b);
  }
  dom.root = qs$(":root");
  dom.html = document.documentElement;
  dom.head = document.head;
  dom.body = document.body;

  // i18n.js
  var i18n = null;
  if (typeof self.browser !== "undefined" && self.browser instanceof Object && !(self.browser instanceof Element)) {
    i18n = self.browser.i18n;
  } else if (typeof self.chrome !== "undefined" && self.chrome.i18n) {
    i18n = self.chrome.i18n;
  }
  if (!i18n) {
    i18n = { getMessage: function(key, args) {
      return key;
    } };
  }
  var i18n$ = (...args) => i18n.getMessage(...args);
  var isBackgroundProcess = document.title === "uBlock Origin Background Page";
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
        // TODO: Remove quote entities once no longer present in translation
        // files. Other entities must stay.
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
      if (text.indexOf("<") === -1) {
        const toInsert = safeTextToTextNode(text);
        let toReplace = parent.childCount !== 0 ? parent.firstChild : null;
        while (toReplace !== null) {
          if (toReplace.nodeType === 3 && toReplace.nodeValue === "_") {
            break;
          }
          toReplace = toReplace.nextSibling;
        }
        if (toReplace !== null) {
          parent.replaceChild(toInsert, toReplace);
        } else {
          parent.appendChild(toInsert);
        }
        return;
      }
      text = text.replace(/^<p>|<\/p>/g, "").replace(/<p>/g, "\n\n");
      const domParser = new DOMParser();
      const parsedDoc = domParser.parseFromString(text, "text/html");
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
      for (const elem of root.querySelectorAll("[data-i18n]")) {
        let text = i18n$(elem.getAttribute("data-i18n"));
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
        for (let part of parts) {
          if (part === "") {
            continue;
          }
          if (part.startsWith("{{") && part.endsWith("}}")) {
            const pos = part.indexOf(":");
            if (pos !== -1) {
              part = part.slice(0, pos) + part.slice(-2);
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
      for (const elem of root.querySelectorAll("[data-i18n-title]")) {
        const text = i18n$(elem.getAttribute("data-i18n-title"));
        if (!text) {
          continue;
        }
        elem.setAttribute("title", expandHtmlEntities(text));
      }
      for (const elem of root.querySelectorAll("[placeholder]")) {
        const text = i18n$(elem.getAttribute("placeholder"));
        if (text === "") {
          continue;
        }
        elem.setAttribute("placeholder", text);
      }
      for (const elem of root.querySelectorAll("[data-i18n-tip]")) {
        const text = i18n$(elem.getAttribute("data-i18n-tip")).replace(/<br>/g, "\n").replace(/\n{3,}/g, "\n\n");
        elem.setAttribute("data-tip", text);
        if (elem.getAttribute("aria-label") === "data-tip") {
          elem.setAttribute("aria-label", text);
        }
      }
      for (const elem of root.querySelectorAll("[data-i18n-label]")) {
        const text = i18n$(elem.getAttribute("data-i18n-label"));
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

  // ../lib/punycode.js
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

  // popup-fenix-with-icons.js
  var popupFontSize = "unset";
  vAPI.localStorage.getItemAsync("popupFontSize").then((value) => {
    if (typeof value !== "string" || value === "unset") {
      return;
    }
    document.body.style.setProperty("--font-size", value);
    popupFontSize = value;
  });
  vAPI.localStorage.getItemAsync("popupPanelSections").then((bits) => {
    if (typeof bits !== "number") {
      return;
    }
    setSections(bits);
  });
  var messaging = vAPI.messaging;
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
  var reCyrillicNonAmbiguous = /[\u0400-\u042b\u042d-\u042f\u0431\u0432\u0434\u0436-\u043d\u0442\u0444\u0446-\u0449\u044b-\u0454\u0457\u0459-\u0460\u0462-\u0474\u0476-\u04ba\u04bc\u04be-\u04ce\u04d0-\u0500\u0502-\u051a\u051c\u051e-\u052f]/;
  var reCyrillicAmbiguous = /[\u042c\u0430\u0433\u0435\u043e\u043f\u0440\u0441\u0443\u0445\u044a\u0455\u0456\u0458\u0461\u0475\u04bb\u04bd\u04cf\u0501\u051b\u051d]/;
  var cachePopupData = function(data) {
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
    let dnDetails;
    for (const des of allHostnameRows) {
      const hnDetails = popupData.hostnameDict[des];
      const { domain, counts } = hnDetails;
      const isDomain = des === domain;
      const { allowed: hnAllowed, blocked: hnBlocked } = counts;
      if (isDomain) {
        dnDetails = hnDetails;
        dnDetails.totals = JSON.parse(JSON.stringify(dnDetails.counts));
      } else {
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
    let blocked, total;
    if (popupData.pageCounts !== void 0) {
      const counts = popupData.pageCounts;
      blocked = counts.blocked.any;
      total = blocked + counts.allowed.any;
    } else {
      blocked = 0;
      total = 0;
    }
    let text;
    if (total === 0) {
      text = formatNumber(0);
    } else {
      text = statsStr.replace("{{count}}", formatNumber(blocked)).replace("{{percent}}", formatNumber(Math.floor(blocked * 100 / total)));
    }
    dom.text('[data-i18n^="popupBlockedOnThisPage"] + span', text);
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
      const text = i18n$(
        details.i18n + (qs$(details.state) === null ? "1" : "2")
      );
      dom.attr(elem, "aria-label", text);
      dom.attr(elem, "title", text);
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
          let text;
          if ((count || 0) === 0) {
            text = "";
          } else if (count === -1) {
            text = "?";
          } else {
            text = Math.min(count, 99).toLocaleString();
          }
          dom.text(badge, text);
          dom.cl.remove(sw, "hnSwitchBusy");
        });
      };
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
      mustRenderCosmeticFilteringBadge = true;
    };
  })();
  var toggleNetFilteringSwitch = function(ev) {
    if (!popupData || !popupData.pageURL) {
      return;
    }
    messaging.send("popupPanel", {
      what: "toggleNetFiltering",
      url: popupData.pageURL,
      scope: ev.ctrlKey || ev.metaKey ? "page" : "",
      state: dom.cl.toggle(dom.body, "off") === false,
      tabId: popupData.tabId
    });
    renderTooltips("#switch");
    hashFromPopupData();
  };
  var gotoZap = function() {
    console.log("[DEBUG] gotoZap called - launching full epicker in zap mode");
    messaging.send("popupPanel", {
      what: "launchElementPicker",
      tabId: popupData.tabId,
      zap: true
      // Set zap mode to true
    }).then(() => {
      console.log("[DEBUG] launchElementPicker (zap mode) message sent");
    }).catch((err) => {
      console.error("[DEBUG] launchElementPicker message failed:", err);
    });
    setTimeout(() => {
      vAPI.closePopup();
    }, 200);
  };
  var gotoPick = function() {
    console.log("[DEBUG] gotoPick called - tabId:", popupData.tabId);
    messaging.send("popupPanel", {
      what: "launchElementPicker",
      tabId: popupData.tabId
    }).then(() => {
      console.log("[DEBUG] launchElementPicker message sent");
    }).catch((err) => {
      console.error("[DEBUG] launchElementPicker message failed:", err);
    });
    setTimeout(() => {
      vAPI.closePopup();
    }, 200);
  };
  var gotoReport = function() {
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
    if (attr === "") {
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
    if (popupData.hasUnprocessedRequest === true) {
      messaging.send("popupPanel", {
        what: "dismissUnprocessedRequest",
        tabId: popupData.tabId
      }).then(() => {
        popupData.hasUnprocessedRequest = false;
        dom.cl.remove(dom.root, "warn");
      });
    }
    messaging.send("popupPanel", {
      what: "reloadTab",
      tabId: popupData.tabId,
      url: popupData.rawURL,
      select: vAPI.webextFlavor.soup.has("mobile"),
      bypassCache: bypassCache || forceReloadFlag !== 0
    });
    popupData.contentLastModified = -1;
    hashFromPopupData(true);
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
  var saveFirewallRules = function() {
    messaging.send("popupPanel", {
      what: "saveFirewallRules",
      srcHostname: popupData.pageHostname,
      desHostnames: popupData.hostnameDict
    });
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
    if (switchName === "no-scripting") {
      forceReloadFlag ^= 1;
    }
    cachePopupData(response);
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
    const response = await messaging.send("popupPanel", {
      what: "getPopupData",
      tabId
    });
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
  dom.on(".hnSwitch", "click", (ev) => {
    toggleHostnameSwitch(ev);
  });
  dom.on("#saveRules", "click", saveFirewallRules);
  dom.on("#revertRules", "click", () => {
    revertFirewallRules();
  });
  dom.on("a[href]", "click", gotoURL);
  var faIconsInit = /* @__PURE__ */ (() => {
    const svgIcons = /* @__PURE__ */ new Map([
      // See /img/fontawesome/fontawesome-defs.svg
      ["angle-up", { viewBox: "0 0  998  582", path: "m 998,499 q 0,13 -10,23 l -50,50 q -10,10 -23,10 -13,0 -23,-10 L 499,179 106,572 Q 96,582 83,582 70,582 60,572 L 10,522 Q 0,512 0,499 0,486 10,476 L 476,10 q 10,-10 23,-10 13,0 23,10 l 466,466 q 10,10 10,23 z" }],
      ["arrow-right", { viewBox: "0 0 1472 1558", path: "m 1472,779 q 0,54 -37,91 l -651,651 q -39,37 -91,37 -51,0 -90,-37 l -75,-75 q -38,-38 -38,-91 0,-53 38,-91 L 821,971 H 117 Q 65,971 32.5,933.5 0,896 0,843 V 715 Q 0,662 32.5,624.5 65,587 117,587 H 821 L 528,293 q -38,-36 -38,-90 0,-54 38,-90 l 75,-75 q 38,-38 90,-38 53,0 91,38 l 651,651 q 37,35 37,90 z" }],
      ["bar-chart", { viewBox: "0 0 2048 1536", path: "m 640,768 0,512 -256,0 0,-512 256,0 z m 384,-512 0,1024 -256,0 0,-1024 256,0 z m 1024,1152 0,128 L 0,1536 0,0 l 128,0 0,1408 1920,0 z m -640,-896 0,768 -256,0 0,-768 256,0 z m 384,-384 0,1152 -256,0 0,-1152 256,0 z" }],
      ["bolt", { viewBox: "0 0  896 1664", path: "m 885.08696,438 q 18,20 7,44 l -540,1157 q -13,25 -42,25 -4,0 -14,-2 -17,-5 -25.5,-19 -8.5,-14 -4.5,-30 l 197,-808 -406,101 q -4,1 -12,1 -18,0 -31,-11 Q -3.9130435,881 1.0869565,857 L 202.08696,32 q 4,-14 16,-23 12,-9 28,-9 l 328,0 q 19,0 32,12.5 13,12.5 13,29.5 0,8 -5,18 l -171,463 396,-98 q 8,-2 12,-2 19,0 34,15 z" }],
      ["book", { viewBox: "0 0 1664 1536", path: "m 1639.2625,350 c 25,36 32,83 18,129 l -275,906 c -25,85 -113,151 -199,151 H 260.26251 c -102,0 -211,-81 -248,-185 -16,-45 -16,-89 -2,-127 2,-20 6,-40 7,-64 1,-16 -8,-29 -6,-41 4,-24 25,-41 41,-68 30,-50 64,-131 75,-183 5,-19 -5,-41 0,-58 5,-19 24,-33 34,-51 27,-46 62,-135 67,-182 2,-21 -8,-44 -2,-60 7,-23 29,-33 44,-53 24,-33 64,-128 70,-181 2,-17 -8,-34 -5,-52 4,-19 28,-39 44,-62 42,-62 50,-199 177,-163 l -1,3 c 17,-4 34,-9 51,-9 h 761 c 47,0 89,21 114,56 26,36 32,83 18,130 l -274,906 c -47,154 -73,188 -200,188 H 156.26251 c -13,0 -29,3 -38,15 -8,12 -9,21 -1,43 20,58 89,70 144,70 h 923 c 37,0 80,-21 91,-57 l 300,-987 c 6,-19 6,-39 5,-57 23,9 44,23 59,43 z m -1064,2 c -6,18 4,32 22,32 h 608 c 17,0 36,-14 42,-32 l 21,-64 c 6,-18 -4,-32 -22,-32 H 638.26251 c -17,0 -36,14 -42,32 z m -83,256 c -6,18 4,32 22,32 h 608 c 17,0 36,-14 42,-32 l 21,-64 c 6,-18 -4,-32 -22,-32 H 555.26251 c -17,0 -36,14 -42,32 z" }],
      ["clipboard", { viewBox: "0 0 1792 1792", path: "m 768,1664 896,0 0,-640 -416,0 q -40,0 -68,-28 -28,-28 -28,-68 l 0,-416 -384,0 0,1152 z m 256,-1440 0,-64 q 0,-13 -9.5,-22.5 Q 1005,128 992,128 l -704,0 q -13,0 -22.5,9.5 Q 256,147 256,160 l 0,64 q 0,13 9.5,22.5 9.5,9.5 22.5,9.5 l 704,0 q 13,0 22.5,-9.5 9.5,-9.5 9.5,-22.5 z m 256,672 299,0 -299,-299 0,299 z m 512,128 0,672 q 0,40 -28,68 -28,28 -68,28 l -960,0 q -40,0 -68,-28 -28,-28 -28,-68 l 0,-160 -544,0 Q 56,1536 28,1508 0,1480 0,1440 L 0,96 Q 0,56 28,28 56,0 96,0 l 1088,0 q 40,0 68,28 28,28 28,68 l 0,328 q 21,13 36,28 l 408,408 q 28,28 48,76 20,48 20,88 z" }],
      ["clock-o", { viewBox: "0 0 1536 1536", path: "m 896,416 v 448 q 0,14 -9,23 -9,9 -23,9 H 544 q -14,0 -23,-9 -9,-9 -9,-23 v -64 q 0,-14 9,-23 9,-9 23,-9 H 768 V 416 q 0,-14 9,-23 9,-9 23,-9 h 64 q 14,0 23,9 9,9 9,23 z m 416,352 q 0,-148 -73,-273 -73,-125 -198,-198 -125,-73 -273,-73 -148,0 -273,73 -125,73 -198,198 -73,125 -73,273 0,148 73,273 73,125 198,198 125,73 273,73 148,0 273,-73 125,-73 198,-198 73,-125 73,-273 z m 224,0 q 0,209 -103,385.5 Q 1330,1330 1153.5,1433 977,1536 768,1536 559,1536 382.5,1433 206,1330 103,1153.5 0,977 0,768 0,559 103,382.5 206,206 382.5,103 559,0 768,0 977,0 1153.5,103 1330,206 1433,382.5 1536,559 1536,768 Z" }],
      ["cloud-download", { viewBox: "0 0 1920 1408", path: "m 1280,800 q 0,-14 -9,-23 -9,-9 -23,-9 l -224,0 0,-352 q 0,-13 -9.5,-22.5 Q 1005,384 992,384 l -192,0 q -13,0 -22.5,9.5 Q 768,403 768,416 l 0,352 -224,0 q -13,0 -22.5,9.5 -9.5,9.5 -9.5,22.5 0,14 9,23 l 352,352 q 9,9 23,9 14,0 23,-9 l 351,-351 q 10,-12 10,-24 z m 640,224 q 0,159 -112.5,271.5 Q 1695,1408 1536,1408 l -1088,0 Q 263,1408 131.5,1276.5 0,1145 0,960 0,830 70,720 140,610 258,555 256,525 256,512 256,300 406,150 556,0 768,0 q 156,0 285.5,87 129.5,87 188.5,231 71,-62 166,-62 106,0 181,75 75,75 75,181 0,76 -41,138 130,31 213.5,135.5 Q 1920,890 1920,1024 Z" }],
      ["cloud-upload", { viewBox: "0 0 1920 1408", path: "m 1280,736 q 0,-14 -9,-23 L 919,361 q -9,-9 -23,-9 -14,0 -23,9 L 522,712 q -10,12 -10,24 0,14 9,23 9,9 23,9 l 224,0 0,352 q 0,13 9.5,22.5 9.5,9.5 22.5,9.5 l 192,0 q 13,0 22.5,-9.5 9.5,-9.5 9.5,-22.5 l 0,-352 224,0 q 13,0 22.5,-9.5 9.5,-9.5 9.5,-22.5 z m 640,288 q 0,159 -112.5,271.5 Q 1695,1408 1536,1408 l -1088,0 Q 263,1408 131.5,1276.5 0,1145 0,960 0,830 70,720 140,610 258,555 256,525 256,512 256,300 406,150 556,0 768,0 q 156,0 285.5,87 129.5,87 188.5,231 71,-62 166,-62 106,0 181,75 75,75 75,181 0,76 -41,138 130,31 213.5,135.5 Q 1920,890 1920,1024 Z" }],
      ["check", { viewBox: "0 0 1550 1188", path: "m 1550,232 q 0,40 -28,68 l -724,724 -136,136 q -28,28 -68,28 -40,0 -68,-28 L 390,1024 28,662 Q 0,634 0,594 0,554 28,526 L 164,390 q 28,-28 68,-28 40,0 68,28 L 594,685 1250,28 q 28,-28 68,-28 40,0 68,28 l 136,136 q 28,28 28,68 z" }],
      ["code", { viewBox: "0 0 1830 1373", path: "m 572,1125.5 -50,50 q -10,10 -23,10 -13,0 -23,-10 l -466,-466 q -10,-10 -10,-23 0,-13 10,-23 l 466,-466 q 10,-10 23,-10 13,0 23,10 l 50,50 q 10,10 10,23 0,13 -10,23 l -393,393 393,393 q 10,10 10,23 0,13 -10,23 z M 1163,58.476203 790,1349.4762 q -4,13 -15.5,19.5 -11.5,6.5 -23.5,2.5 l -62,-17 q -13,-4 -19.5,-15.5 -6.5,-11.5 -2.5,-24.5 L 1040,23.5 q 4,-13 15.5,-19.5 11.5,-6.5 23.5,-2.5 l 62,17 q 13,4 19.5,15.5 6.5,11.5 2.5,24.5 z m 657,651 -466,466 q -10,10 -23,10 -13,0 -23,-10 l -50,-50 q -10,-10 -10,-23 0,-13 10,-23 l 393,-393 -393,-393 q -10,-10 -10,-23 0,-13 10,-23 l 50,-50 q 10,-10 23,-10 13,0 23,10 l 466,466 q 10,10 10,23 0,13 -10,23 z" }],
      ["cog", { viewBox: "0 0 1536 1536", path: "m 1024,768 q 0,-106 -75,-181 -75,-75 -181,-75 -106,0 -181,75 -75,75 -75,181 0,106 75,181 75,75 181,75 106,0 181,-75 75,-75 75,-181 z m 512,-109 0,222 q 0,12 -8,23 -8,11 -20,13 l -185,28 q -19,54 -39,91 35,50 107,138 10,12 10,25 0,13 -9,23 -27,37 -99,108 -72,71 -94,71 -12,0 -26,-9 l -138,-108 q -44,23 -91,38 -16,136 -29,186 -7,28 -36,28 l -222,0 q -14,0 -24.5,-8.5 Q 622,1519 621,1506 l -28,-184 q -49,-16 -90,-37 l -141,107 q -10,9 -25,9 -14,0 -25,-11 -126,-114 -165,-168 -7,-10 -7,-23 0,-12 8,-23 15,-21 51,-66.5 36,-45.5 54,-70.5 -27,-50 -41,-99 L 29,913 Q 16,911 8,900.5 0,890 0,877 L 0,655 q 0,-12 8,-23 8,-11 19,-13 l 186,-28 q 14,-46 39,-92 -40,-57 -107,-138 -10,-12 -10,-24 0,-10 9,-23 26,-36 98.5,-107.5 Q 315,135 337,135 q 13,0 26,10 L 501,252 Q 545,229 592,214 608,78 621,28 628,0 657,0 L 879,0 Q 893,0 903.5,8.5 914,17 915,30 l 28,184 q 49,16 90,37 l 142,-107 q 9,-9 24,-9 13,0 25,10 129,119 165,170 7,8 7,22 0,12 -8,23 -15,21 -51,66.5 -36,45.5 -54,70.5 26,50 41,98 l 183,28 q 13,2 21,12.5 8,10.5 8,23.5 z" }],
      ["cogs", { viewBox: "0 0 1920 1761", path: "m 896,880 q 0,-106 -75,-181 -75,-75 -181,-75 -106,0 -181,75 -75,75 -75,181 0,106 75,181 75,75 181,75 106,0 181,-75 75,-75 75,-181 z m 768,512 q 0,-52 -38,-90 -38,-38 -90,-38 -52,0 -90,38 -38,38 -38,90 0,53 37.5,90.5 37.5,37.5 90.5,37.5 53,0 90.5,-37.5 37.5,-37.5 37.5,-90.5 z m 0,-1024 q 0,-52 -38,-90 -38,-38 -90,-38 -52,0 -90,38 -38,38 -38,90 0,53 37.5,90.5 37.5,37.5 90.5,37.5 53,0 90.5,-37.5 Q 1664,421 1664,368 Z m -384,421 v 185 q 0,10 -7,19.5 -7,9.5 -16,10.5 l -155,24 q -11,35 -32,76 34,48 90,115 7,11 7,20 0,12 -7,19 -23,30 -82.5,89.5 -59.5,59.5 -78.5,59.5 -11,0 -21,-7 l -115,-90 q -37,19 -77,31 -11,108 -23,155 -7,24 -30,24 H 547 q -11,0 -20,-7.5 -9,-7.5 -10,-17.5 l -23,-153 q -34,-10 -75,-31 l -118,89 q -7,7 -20,7 -11,0 -21,-8 -144,-133 -144,-160 0,-9 7,-19 10,-14 41,-53 31,-39 47,-61 -23,-44 -35,-82 L 24,1000 Q 14,999 7,990.5 0,982 0,971 V 786 Q 0,776 7,766.5 14,757 23,756 l 155,-24 q 11,-35 32,-76 -34,-48 -90,-115 -7,-11 -7,-20 0,-12 7,-20 22,-30 82,-89 60,-59 79,-59 11,0 21,7 l 115,90 q 34,-18 77,-32 11,-108 23,-154 7,-24 30,-24 h 186 q 11,0 20,7.5 9,7.5 10,17.5 l 23,153 q 34,10 75,31 l 118,-89 q 8,-7 20,-7 11,0 21,8 144,133 144,160 0,8 -7,19 -12,16 -42,54 -30,38 -45,60 23,48 34,82 l 152,23 q 10,2 17,10.5 7,8.5 7,19.5 z m 640,533 v 140 q 0,16 -149,31 -12,27 -30,52 51,113 51,138 0,4 -4,7 -122,71 -124,71 -8,0 -46,-47 -38,-47 -52,-68 -20,2 -30,2 -10,0 -30,-2 -14,21 -52,68 -38,47 -46,47 -2,0 -124,-71 -4,-3 -4,-7 0,-25 51,-138 -18,-25 -30,-52 -149,-15 -149,-31 v -140 q 0,-16 149,-31 13,-29 30,-52 -51,-113 -51,-138 0,-4 4,-7 4,-2 35,-20 31,-18 59,-34 28,-16 30,-16 8,0 46,46.5 38,46.5 52,67.5 20,-2 30,-2 10,0 30,2 51,-71 92,-112 l 6,-2 q 4,0 124,70 4,3 4,7 0,25 -51,138 17,23 30,52 149,15 149,31 z m 0,-1024 v 140 q 0,16 -149,31 -12,27 -30,52 51,113 51,138 0,4 -4,7 -122,71 -124,71 -8,0 -46,-47 -38,-47 -52,-68 -20,2 -30,2 -10,0 -30,-2 -14,21 -52,68 -38,47 -46,47 -2,0 -124,-71 -4,-3 -4,-7 0,-25 51,-138 -18,-25 -30,-52 -149,-15 -149,-31 V 298 q 0,-16 149,-31 13,-29 30,-52 -51,-113 -51,-138 0,-4 4,-7 4,-2 35,-20 31,-18 59,-34 28,-16 30,-16 8,0 46,46.5 38,46.5 52,67.5 20,-2 30,-2 10,0 30,2 51,-71 92,-112 l 6,-2 q 4,0 124,70 4,3 4,7 0,25 -51,138 17,23 30,52 149,15 149,31 z" }],
      ["comment-alt", { viewBox: "0 0 1792 1536", path: "M 896,128 Q 692,128 514.5,197.5 337,267 232.5,385 128,503 128,640 128,752 199.5,853.5 271,955 401,1029 l 87,50 -27,96 q -24,91 -70,172 152,-63 275,-171 l 43,-38 57,6 q 69,8 130,8 204,0 381.5,-69.5 Q 1455,1013 1559.5,895 1664,777 1664,640 1664,503 1559.5,385 1455,267 1277.5,197.5 1100,128 896,128 Z m 896,512 q 0,174 -120,321.5 -120,147.5 -326,233 -206,85.5 -450,85.5 -70,0 -145,-8 -198,175 -460,242 -49,14 -114,22 h -5 q -15,0 -27,-10.5 -12,-10.5 -16,-27.5 v -1 q -3,-4 -0.5,-12 2.5,-8 2,-10 -0.5,-2 4.5,-9.5 l 6,-9 q 0,0 7,-8.5 7,-8.5 8,-9 7,-8 31,-34.5 24,-26.5 34.5,-38 10.5,-11.5 31,-39.5 20.5,-28 32.5,-51 12,-23 27,-59 15,-36 26,-76 Q 181,1052 90.5,921 0,790 0,640 0,466 120,318.5 240,171 446,85.5 652,0 896,0 q 244,0 450,85.5 206,85.5 326,233 120,147.5 120,321.5 z" }],
      ["double-angle-left", { viewBox: "0 0  966  998", path: "m 582,915 q 0,13 -10,23 l -50,50 q -10,10 -23,10 -13,0 -23,-10 L 10,522 Q 0,512 0,499 0,486 10,476 L 476,10 q 10,-10 23,-10 13,0 23,10 l 50,50 q 10,10 10,23 0,13 -10,23 L 179,499 572,892 q 10,10 10,23 z m 384,0 q 0,13 -10,23 l -50,50 q -10,10 -23,10 -13,0 -23,-10 L 394,522 q -10,-10 -10,-23 0,-13 10,-23 L 860,10 q 10,-10 23,-10 13,0 23,10 l 50,50 q 10,10 10,23 0,13 -10,23 L 563,499 956,892 q 10,10 10,23 z" }],
      ["double-angle-up", { viewBox: "0 0  998  966", path: "m 998,883 q 0,13 -10,23 l -50,50 q -10,10 -23,10 -13,0 -23,-10 L 499,563 106,956 Q 96,966 83,966 70,966 60,956 L 10,906 Q 0,896 0,883 0,870 10,860 L 476,394 q 10,-10 23,-10 13,0 23,10 l 466,466 q 10,10 10,23 z m 0,-384 q 0,13 -10,23 l -50,50 q -10,10 -23,10 -13,0 -23,-10 L 499,179 106,572 Q 96,582 83,582 70,582 60,572 L 10,522 Q 0,512 0,499 0,486 10,476 L 476,10 q 10,-10 23,-10 13,0 23,10 l 466,466 q 10,10 10,23 z" }],
      ["download-alt", { viewBox: "0 0 1664 1536", path: "m 1280,1344 q 0,-26 -19,-45 -19,-19 -45,-19 -26,0 -45,19 -19,19 -19,45 0,26 19,45 19,19 45,19 26,0 45,-19 19,-19 19,-45 z m 256,0 q 0,-26 -19,-45 -19,-19 -45,-19 -26,0 -45,19 -19,19 -19,45 0,26 19,45 19,19 45,19 26,0 45,-19 19,-19 19,-45 z m 128,-224 v 320 q 0,40 -28,68 -28,28 -68,28 H 96 q -40,0 -68,-28 -28,-28 -28,-68 v -320 q 0,-40 28,-68 28,-28 68,-28 h 465 l 135,136 q 58,56 136,56 78,0 136,-56 l 136,-136 h 464 q 40,0 68,28 28,28 28,68 z M 1339,551 q 17,41 -14,70 l -448,448 q -18,19 -45,19 -27,0 -45,-19 L 339,621 q -31,-29 -14,-70 17,-39 59,-39 H 640 V 64 Q 640,38 659,19 678,0 704,0 h 256 q 26,0 45,19 19,19 19,45 v 448 h 256 q 42,0 59,39 z" }],
      ["eraser", { viewBox: "0 0 1920 1280", path: "M 896,1152 1232,768 l -768,0 -336,384 768,0 z M 1909,75 q 15,34 9.5,71.5 Q 1913,184 1888,212 L 992,1236 q -38,44 -96,44 l -768,0 q -38,0 -69.5,-20.5 -31.5,-20.5 -47.5,-54.5 -15,-34 -9.5,-71.5 5.5,-37.5 30.5,-65.5 L 928,44 Q 966,0 1024,0 l 768,0 q 38,0 69.5,20.5 Q 1893,41 1909,75 Z" }],
      ["exclamation-triangle", { viewBox: "0 0 1794 1664", path: "m 1025.0139,1375 0,-190 q 0,-14 -9.5,-23.5 -9.5,-9.5 -22.5,-9.5 l -192,0 q -13,0 -22.5,9.5 -9.5,9.5 -9.5,23.5 l 0,190 q 0,14 9.5,23.5 9.5,9.5 22.5,9.5 l 192,0 q 13,0 22.5,-9.5 9.5,-9.5 9.5,-23.5 z m -2,-374 18,-459 q 0,-12 -10,-19 -13,-11 -24,-11 l -220,0 q -11,0 -24,11 -10,7 -10,21 l 17,457 q 0,10 10,16.5 10,6.5 24,6.5 l 185,0 q 14,0 23.5,-6.5 9.5,-6.5 10.5,-16.5 z m -14,-934 768,1408 q 35,63 -2,126 -17,29 -46.5,46 -29.5,17 -63.5,17 l -1536,0 q -34,0 -63.5,-17 -29.5,-17 -46.5,-46 -37,-63 -2,-126 L 785.01389,67 q 17,-31 47,-49 30,-18 65,-18 35,0 65,18 30,18 47,49 z" }],
      ["external-link", { viewBox: "0 0 1792 1536", path: "m 1408,928 0,320 q 0,119 -84.5,203.5 Q 1239,1536 1120,1536 l -832,0 Q 169,1536 84.5,1451.5 0,1367 0,1248 L 0,416 Q 0,297 84.5,212.5 169,128 288,128 l 704,0 q 14,0 23,9 9,9 9,23 l 0,64 q 0,14 -9,23 -9,9 -23,9 l -704,0 q -66,0 -113,47 -47,47 -47,113 l 0,832 q 0,66 47,113 47,47 113,47 l 832,0 q 66,0 113,-47 47,-47 47,-113 l 0,-320 q 0,-14 9,-23 9,-9 23,-9 l 64,0 q 14,0 23,9 9,9 9,23 z m 384,-864 0,512 q 0,26 -19,45 -19,19 -45,19 -26,0 -45,-19 L 1507,445 855,1097 q -10,10 -23,10 -13,0 -23,-10 L 695,983 q -10,-10 -10,-23 0,-13 10,-23 L 1347,285 1171,109 q -19,-19 -19,-45 0,-26 19,-45 19,-19 45,-19 l 512,0 q 26,0 45,19 19,19 19,45 z" }],
      ["eye-dropper", { viewBox: "0 0 1792 1792", path: "m 1698,94 q 94,94 94,226.5 0,132.5 -94,225.5 l -225,223 104,104 q 10,10 10,23 0,13 -10,23 l -210,210 q -10,10 -23,10 -13,0 -23,-10 l -105,-105 -603,603 q -37,37 -90,37 l -203,0 -256,128 -64,-64 128,-256 0,-203 q 0,-53 37,-90 L 768,576 663,471 q -10,-10 -10,-23 0,-13 10,-23 L 873,215 q 10,-10 23,-10 13,0 23,10 L 1023,319 1246,94 Q 1339,0 1471.5,0 1604,0 1698,94 Z M 512,1472 1088,896 896,704 l -576,576 0,192 192,0 z" }],
      ["eye-open", { viewBox: "0 0 1792 1152", path: "m 1664,576 q -152,-236 -381,-353 61,104 61,225 0,185 -131.5,316.5 Q 1081,896 896,896 711,896 579.5,764.5 448,633 448,448 448,327 509,223 280,340 128,576 261,781 461.5,902.5 662,1024 896,1024 1130,1024 1330.5,902.5 1531,781 1664,576 Z M 944,192 q 0,-20 -14,-34 -14,-14 -34,-14 -125,0 -214.5,89.5 Q 592,323 592,448 q 0,20 14,34 14,14 34,14 20,0 34,-14 14,-14 14,-34 0,-86 61,-147 61,-61 147,-61 20,0 34,-14 14,-14 14,-34 z m 848,384 q 0,34 -20,69 -140,230 -376.5,368.5 Q 1159,1152 896,1152 633,1152 396.5,1013 160,874 20,645 0,610 0,576 0,542 20,507 160,278 396.5,139 633,0 896,0 q 263,0 499.5,139 236.5,139 376.5,368 20,35 20,69 z" }],
      ["eye-slash", { viewBox: "0 0 1792 1344", path: "M 555,1047 633,906 Q 546,843 497,747 448,651 448,544 448,423 509,319 280,436 128,672 295,930 555,1047 Z M 944,288 q 0,-20 -14,-34 -14,-14 -34,-14 -125,0 -214.5,89.5 Q 592,419 592,544 q 0,20 14,34 14,14 34,14 20,0 34,-14 14,-14 14,-34 0,-86 61,-147 61,-61 147,-61 20,0 34,-14 14,-14 14,-34 z M 1307,97 q 0,7 -1,9 -106,189 -316,567 -210,378 -315,566 l -49,89 q -10,16 -28,16 -12,0 -134,-70 -16,-10 -16,-28 0,-12 44,-87 Q 349,1094 228.5,986 108,878 20,741 0,710 0,672 0,634 20,603 173,368 400,232 627,96 896,96 q 89,0 180,17 l 54,-97 q 10,-16 28,-16 5,0 18,6 13,6 31,15.5 18,9.5 33,18.5 15,9 31.5,18.5 16.5,9.5 19.5,11.5 16,10 16,27 z m 37,447 q 0,139 -79,253.5 Q 1186,912 1056,962 l 280,-502 q 8,45 8,84 z m 448,128 q 0,35 -20,69 -39,64 -109,145 -150,172 -347.5,267 -197.5,95 -419.5,95 l 74,-132 Q 1182,1098 1362.5,979 1543,860 1664,672 1549,493 1382,378 l 63,-112 q 95,64 182.5,153 87.5,89 144.5,184 20,34 20,69 z" }],
      ["files-o", { viewBox: "0 0 1792 1792", path: "m 1696,384 q 40,0 68,28 28,28 28,68 l 0,1216 q 0,40 -28,68 -28,28 -68,28 l -960,0 q -40,0 -68,-28 -28,-28 -28,-68 l 0,-288 -544,0 Q 56,1408 28,1380 0,1352 0,1312 L 0,640 Q 0,600 20,552 40,504 68,476 L 476,68 Q 504,40 552,20 600,0 640,0 l 416,0 q 40,0 68,28 28,28 28,68 l 0,328 q 68,-40 128,-40 l 416,0 z m -544,213 -299,299 299,0 0,-299 z M 512,213 213,512 l 299,0 0,-299 z m 196,647 316,-316 0,-416 -384,0 0,416 q 0,40 -28,68 -28,28 -68,28 l -416,0 0,640 512,0 0,-256 q 0,-40 20,-88 20,-48 48,-76 z m 956,804 0,-1152 -384,0 0,416 q 0,40 -28,68 -28,28 -68,28 l -416,0 0,640 896,0 z" }],
      ["film", { viewBox: "0 0 1920 1664", path: "m 384,1472 0,-128 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m 0,-384 0,-128 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m 0,-384 0,-128 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m 1024,768 0,-512 q 0,-26 -19,-45 -19,-19 -45,-19 l -768,0 q -26,0 -45,19 -19,19 -19,45 l 0,512 q 0,26 19,45 19,19 45,19 l 768,0 q 26,0 45,-19 19,-19 19,-45 z M 384,320 384,192 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m 1408,1152 0,-128 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m -384,-768 0,-512 q 0,-26 -19,-45 -19,-19 -45,-19 l -768,0 q -26,0 -45,19 -19,19 -19,45 l 0,512 q 0,26 19,45 19,19 45,19 l 768,0 q 26,0 45,-19 19,-19 19,-45 z m 384,384 0,-128 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m 0,-384 0,-128 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m 0,-384 0,-128 q 0,-26 -19,-45 -19,-19 -45,-19 l -128,0 q -26,0 -45,19 -19,19 -19,45 l 0,128 q 0,26 19,45 19,19 45,19 l 128,0 q 26,0 45,-19 19,-19 19,-45 z m 128,-160 0,1344 q 0,66 -47,113 -47,47 -113,47 l -1600,0 Q 94,1664 47,1617 0,1570 0,1504 L 0,160 Q 0,94 47,47 94,0 160,0 l 1600,0 q 66,0 113,47 47,47 47,113 z" }],
      ["filter", { viewBox: "0 0 1410 1408", path: "m 1404.0208,39 q 17,41 -14,70 l -493,493 0,742 q 0,42 -39,59 -13,5 -25,5 -27,0 -45,-19 l -256,-256 q -19,-19 -19,-45 l 0,-486 L 20.020833,109 q -31,-29 -14,-70 Q 23.020833,0 65.020833,0 L 1345.0208,0 q 42,0 59,39 z" }],
      ["floppy-o", { viewBox: "0 0 1536 1536", path: "m 384,1408 768,0 0,-384 -768,0 0,384 z m 896,0 128,0 0,-896 q 0,-14 -10,-38.5 Q 1388,449 1378,439 L 1097,158 q -10,-10 -34,-20 -24,-10 -39,-10 l 0,416 q 0,40 -28,68 -28,28 -68,28 l -576,0 q -40,0 -68,-28 -28,-28 -28,-68 l 0,-416 -128,0 0,1280 128,0 0,-416 q 0,-40 28,-68 28,-28 68,-28 l 832,0 q 40,0 68,28 28,28 28,68 l 0,416 z M 896,480 896,160 q 0,-13 -9.5,-22.5 Q 877,128 864,128 l -192,0 q -13,0 -22.5,9.5 Q 640,147 640,160 l 0,320 q 0,13 9.5,22.5 9.5,9.5 22.5,9.5 l 192,0 q 13,0 22.5,-9.5 Q 896,493 896,480 Z m 640,32 0,928 q 0,40 -28,68 -28,28 -68,28 L 96,1536 Q 56,1536 28,1508 0,1480 0,1440 L 0,96 Q 0,56 28,28 56,0 96,0 l 928,0 q 40,0 88,20 48,20 76,48 l 280,280 q 28,28 48,76 20,48 20,88 z" }],
      ["font", { viewBox: "0 0 1664 1536", path: "M 725,431 555,881 q 33,0 136.5,2 103.5,2 160.5,2 19,0 57,-2 Q 822,630 725,431 Z M 0,1536 2,1457 q 23,-7 56,-12.5 33,-5.5 57,-10.5 24,-5 49.5,-14.5 25.5,-9.5 44.5,-29 19,-19.5 31,-50.5 L 477,724 757,0 l 75,0 53,0 q 8,14 11,21 l 205,480 q 33,78 106,257.5 73,179.5 114,274.5 15,34 58,144.5 43,110.5 72,168.5 20,45 35,57 19,15 88,29.5 69,14.5 84,20.5 6,38 6,57 0,5 -0.5,13.5 -0.5,8.5 -0.5,12.5 -63,0 -190,-8 -127,-8 -191,-8 -76,0 -215,7 -139,7 -178,8 0,-43 4,-78 l 131,-28 q 1,0 12.5,-2.5 11.5,-2.5 15.5,-3.5 4,-1 14.5,-4.5 10.5,-3.5 15,-6.5 4.5,-3 11,-8 6.5,-5 9,-11 2.5,-6 2.5,-14 0,-16 -31,-96.5 -31,-80.5 -72,-177.5 -41,-97 -42,-100 l -450,-2 q -26,58 -76.5,195.5 Q 382,1336 382,1361 q 0,22 14,37.5 14,15.5 43.5,24.5 29.5,9 48.5,13.5 19,4.5 57,8.5 38,4 41,4 1,19 1,58 0,9 -2,27 -58,0 -174.5,-10 -116.5,-10 -174.5,-10 -8,0 -26.5,4 -18.5,4 -21.5,4 -80,14 -188,14 z" }],
      ["home", { viewBox: "0 0 1612 1283", path: "m 1382.1111,739 v 480 q 0,26 -19,45 -19,19 -45,19 H 934.11111 V 899 h -256 v 384 h -384 q -26,0 -45,-19 -19,-19 -19,-45 V 739 q 0,-1 0.5,-3 0.5,-2 0.5,-3 l 575,-474 574.99999,474 q 1,2 1,6 z m 223,-69 -62,74 q -8,9 -21,11 h -3 q -13,0 -21,-7 l -691.99999,-577 -692,577 q -12,8 -23.999999,7 -13,-2 -21,-11 L 7.1111111,670 Q -0.88888889,660 0.11111111,646.5 1.1111111,633 11.111111,625 L 730.11111,26 q 32,-26 76,-26 44,0 76,26 L 1126.1111,230 V 35 q 0,-14 9,-23 9,-9 23,-9 h 192 q 14,0 23,9 9,9 9,23 v 408 l 219,182 q 10,8 11,21.5 1,13.5 -7,23.5 z" }],
      ["info-circle", { viewBox: "0 0 1536 1536", path: "m 1024,1248 0,-160 q 0,-14 -9,-23 -9,-9 -23,-9 l -96,0 0,-512 q 0,-14 -9,-23 -9,-9 -23,-9 l -320,0 q -14,0 -23,9 -9,9 -9,23 l 0,160 q 0,14 9,23 9,9 23,9 l 96,0 0,320 -96,0 q -14,0 -23,9 -9,9 -9,23 l 0,160 q 0,14 9,23 9,9 23,9 l 448,0 q 14,0 23,-9 9,-9 9,-23 z M 896,352 896,192 q 0,-14 -9,-23 -9,-9 -23,-9 l -192,0 q -14,0 -23,9 -9,9 -9,23 l 0,160 q 0,14 9,23 9,9 23,9 l 192,0 q 14,0 23,-9 9,-9 9,-23 z m 640,416 q 0,209 -103,385.5 Q 1330,1330 1153.5,1433 977,1536 768,1536 559,1536 382.5,1433 206,1330 103,1153.5 0,977 0,768 0,559 103,382.5 206,206 382.5,103 559,0 768,0 977,0 1153.5,103 1330,206 1433,382.5 1536,559 1536,768 Z" }],
      ["list-alt", { viewBox: "0 0 1792 1408", path: "m 384,1056 0,64 q 0,13 -9.5,22.5 -9.5,9.5 -22.5,9.5 l -64,0 q -13,0 -22.5,-9.5 Q 256,1133 256,1120 l 0,-64 q 0,-13 9.5,-22.5 9.5,-9.5 22.5,-9.5 l 64,0 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 0,-256 0,64 q 0,13 -9.5,22.5 Q 365,896 352,896 l -64,0 q -13,0 -22.5,-9.5 Q 256,877 256,864 l 0,-64 q 0,-13 9.5,-22.5 Q 275,768 288,768 l 64,0 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 0,-256 0,64 q 0,13 -9.5,22.5 Q 365,640 352,640 l -64,0 q -13,0 -22.5,-9.5 Q 256,621 256,608 l 0,-64 q 0,-13 9.5,-22.5 Q 275,512 288,512 l 64,0 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 1152,512 0,64 q 0,13 -9.5,22.5 -9.5,9.5 -22.5,9.5 l -960,0 q -13,0 -22.5,-9.5 Q 512,1133 512,1120 l 0,-64 q 0,-13 9.5,-22.5 9.5,-9.5 22.5,-9.5 l 960,0 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 0,-256 0,64 q 0,13 -9.5,22.5 -9.5,9.5 -22.5,9.5 l -960,0 q -13,0 -22.5,-9.5 Q 512,877 512,864 l 0,-64 q 0,-13 9.5,-22.5 Q 531,768 544,768 l 960,0 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 0,-256 0,64 q 0,13 -9.5,22.5 -9.5,9.5 -22.5,9.5 l -960,0 q -13,0 -22.5,-9.5 Q 512,621 512,608 l 0,-64 q 0,-13 9.5,-22.5 Q 531,512 544,512 l 960,0 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 128,704 0,-832 q 0,-13 -9.5,-22.5 Q 1645,384 1632,384 l -1472,0 q -13,0 -22.5,9.5 Q 128,403 128,416 l 0,832 q 0,13 9.5,22.5 9.5,9.5 22.5,9.5 l 1472,0 q 13,0 22.5,-9.5 9.5,-9.5 9.5,-22.5 z m 128,-1088 0,1088 q 0,66 -47,113 -47,47 -113,47 l -1472,0 Q 94,1408 47,1361 0,1314 0,1248 L 0,160 Q 0,94 47,47 94,0 160,0 l 1472,0 q 66,0 113,47 47,47 47,113 z" }],
      ["lock", { viewBox: "0 0 1152 1408", path: "m 320,640 512,0 0,-192 q 0,-106 -75,-181 -75,-75 -181,-75 -106,0 -181,75 -75,75 -75,181 l 0,192 z m 832,96 0,576 q 0,40 -28,68 -28,28 -68,28 l -960,0 Q 56,1408 28,1380 0,1352 0,1312 L 0,736 q 0,-40 28,-68 28,-28 68,-28 l 32,0 0,-192 Q 128,264 260,132 392,0 576,0 q 184,0 316,132 132,132 132,316 l 0,192 32,0 q 40,0 68,28 28,28 28,68 z" }],
      ["magic", { viewBox: "0 0 1637 1637", path: "M 1163,581 1456,288 1349,181 1056,474 Z m 447,-293 q 0,27 -18,45 L 306,1619 q -18,18 -45,18 -27,0 -45,-18 L 18,1421 Q 0,1403 0,1376 0,1349 18,1331 L 1304,45 q 18,-18 45,-18 27,0 45,18 l 198,198 q 18,18 18,45 z M 259,98 l 98,30 -98,30 -30,98 -30,-98 -98,-30 98,-30 30,-98 z M 609,260 805,320 609,380 549,576 489,380 293,320 489,260 549,64 Z m 930,478 98,30 -98,30 -30,98 -30,-98 -98,-30 98,-30 30,-98 z M 899,98 l 98,30 -98,30 -30,98 -30,-98 -98,-30 98,-30 30,-98 z" }],
      ["pause-circle-o", { viewBox: "0 0 1536 1536", path: "M 768,0 Q 977,0 1153.5,103 1330,206 1433,382.5 1536,559 1536,768 1536,977 1433,1153.5 1330,1330 1153.5,1433 977,1536 768,1536 559,1536 382.5,1433 206,1330 103,1153.5 0,977 0,768 0,559 103,382.5 206,206 382.5,103 559,0 768,0 Z m 0,1312 q 148,0 273,-73 125,-73 198,-198 73,-125 73,-273 0,-148 -73,-273 -73,-125 -198,-198 -125,-73 -273,-73 -148,0 -273,73 -125,73 -198,198 -73,125 -73,273 0,148 73,273 73,125 198,198 125,73 273,73 z m 96,-224 q -14,0 -23,-9 -9,-9 -9,-23 l 0,-576 q 0,-14 9,-23 9,-9 23,-9 l 192,0 q 14,0 23,9 9,9 9,23 l 0,576 q 0,14 -9,23 -9,9 -23,9 l -192,0 z m -384,0 q -14,0 -23,-9 -9,-9 -9,-23 l 0,-576 q 0,-14 9,-23 9,-9 23,-9 l 192,0 q 14,0 23,9 9,9 9,23 l 0,576 q 0,14 -9,23 -9,9 -23,9 l -192,0 z" }],
      ["play-circle-o", { viewBox: "0 0 1536 1536", path: "m 1184,768 q 0,37 -32,55 l -544,320 q -15,9 -32,9 -16,0 -32,-8 -32,-19 -32,-56 l 0,-640 q 0,-37 32,-56 33,-18 64,1 l 544,320 q 32,18 32,55 z m 128,0 q 0,-148 -73,-273 -73,-125 -198,-198 -125,-73 -273,-73 -148,0 -273,73 -125,73 -198,198 -73,125 -73,273 0,148 73,273 73,125 198,198 125,73 273,73 148,0 273,-73 125,-73 198,-198 73,-125 73,-273 z m 224,0 q 0,209 -103,385.5 Q 1330,1330 1153.5,1433 977,1536 768,1536 559,1536 382.5,1433 206,1330 103,1153.5 0,977 0,768 0,559 103,382.5 206,206 382.5,103 559,0 768,0 977,0 1153.5,103 1330,206 1433,382.5 1536,559 1536,768 Z" }],
      ["plus", { viewBox: "0 0 1408 1408", path: "m 1408,608 0,192 q 0,40 -28,68 -28,28 -68,28 l -416,0 0,416 q 0,40 -28,68 -28,28 -68,28 l -192,0 q -40,0 -68,-28 -28,-28 -28,-68 l 0,-416 -416,0 Q 56,896 28,868 0,840 0,800 L 0,608 q 0,-40 28,-68 28,-28 68,-28 l 416,0 0,-416 Q 512,56 540,28 568,0 608,0 l 192,0 q 40,0 68,28 28,28 28,68 l 0,416 416,0 q 40,0 68,28 28,28 28,68 z" }],
      ["power-off", { viewBox: "0 0 1536 1664", path: "m 1536,896 q 0,156 -61,298 -61,142 -164,245 -103,103 -245,164 -142,61 -298,61 -156,0 -298,-61 Q 328,1542 225,1439 122,1336 61,1194 0,1052 0,896 0,714 80.5,553 161,392 307,283 q 43,-32 95.5,-25 52.5,7 83.5,50 32,42 24.5,94.5 Q 503,455 461,487 363,561 309.5,668 256,775 256,896 q 0,104 40.5,198.5 40.5,94.5 109.5,163.5 69,69 163.5,109.5 94.5,40.5 198.5,40.5 104,0 198.5,-40.5 Q 1061,1327 1130,1258 1199,1189 1239.5,1094.5 1280,1000 1280,896 1280,775 1226.5,668 1173,561 1075,487 1033,455 1025.5,402.5 1018,350 1050,308 q 31,-43 84,-50 53,-7 95,25 146,109 226.5,270 80.5,161 80.5,343 z m -640,-768 0,640 q 0,52 -38,90 -38,38 -90,38 -52,0 -90,-38 -38,-38 -38,-90 l 0,-640 q 0,-52 38,-90 38,-38 90,-38 52,0 90,38 38,38 38,90 z" }],
      ["question-circle", { viewBox: "0 0 1536 1536", path: "m 896,1248 v -192 q 0,-14 -9,-23 -9,-9 -23,-9 H 672 q -14,0 -23,9 -9,9 -9,23 v 192 q 0,14 9,23 9,9 23,9 h 192 q 14,0 23,-9 9,-9 9,-23 z m 256,-672 q 0,-88 -55.5,-163 Q 1041,338 958,297 875,256 788,256 q -243,0 -371,213 -15,24 8,42 l 132,100 q 7,6 19,6 16,0 25,-12 53,-68 86,-92 34,-24 86,-24 48,0 85.5,26 37.5,26 37.5,59 0,38 -20,61 -20,23 -68,45 -63,28 -115.5,86.5 Q 640,825 640,892 v 36 q 0,14 9,23 9,9 23,9 h 192 q 14,0 23,-9 9,-9 9,-23 0,-19 21.5,-49.5 Q 939,848 972,829 q 32,-18 49,-28.5 17,-10.5 46,-35 29,-24.5 44.5,-48 15.5,-23.5 28,-60.5 12.5,-37 12.5,-81 z m 384,192 q 0,209 -103,385.5 Q 1330,1330 1153.5,1433 977,1536 768,1536 559,1536 382.5,1433 206,1330 103,1153.5 0,977 0,768 0,559 103,382.5 206,206 382.5,103 559,0 768,0 977,0 1153.5,103 1330,206 1433,382.5 1536,559 1536,768 Z" }],
      ["refresh", { viewBox: "0 0 1536 1536", path: "m 1511,928 q 0,5 -1,7 -64,268 -268,434.5 Q 1038,1536 764,1536 618,1536 481.5,1481 345,1426 238,1324 l -129,129 q -19,19 -45,19 -26,0 -45,-19 Q 0,1434 0,1408 L 0,960 q 0,-26 19,-45 19,-19 45,-19 l 448,0 q 26,0 45,19 19,19 19,45 0,26 -19,45 l -137,137 q 71,66 161,102 90,36 187,36 134,0 250,-65 116,-65 186,-179 11,-17 53,-117 8,-23 30,-23 l 192,0 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 25,-800 0,448 q 0,26 -19,45 -19,19 -45,19 l -448,0 q -26,0 -45,-19 -19,-19 -19,-45 0,-26 19,-45 L 1117,393 Q 969,256 768,256 q -134,0 -250,65 -116,65 -186,179 -11,17 -53,117 -8,23 -30,23 L 50,640 Q 37,640 27.5,630.5 18,621 18,608 l 0,-7 Q 83,333 288,166.5 493,0 768,0 914,0 1052,55.5 1190,111 1297,212 L 1427,83 q 19,-19 45,-19 26,0 45,19 19,19 19,45 z" }],
      ["save", { viewBox: "0 0 1536 1536", path: "m 384,1408 h 768 V 1024 H 384 Z m 896,0 h 128 V 512 q 0,-14 -10,-38.5 Q 1388,449 1378,439 L 1097,158 q -10,-10 -34,-20 -24,-10 -39,-10 v 416 q 0,40 -28,68 -28,28 -68,28 H 352 q -40,0 -68,-28 -28,-28 -28,-68 V 128 H 128 V 1408 H 256 V 992 q 0,-40 28,-68 28,-28 68,-28 h 832 q 40,0 68,28 28,28 28,68 z M 896,480 V 160 q 0,-13 -9.5,-22.5 Q 877,128 864,128 H 672 q -13,0 -22.5,9.5 Q 640,147 640,160 v 320 q 0,13 9.5,22.5 9.5,9.5 22.5,9.5 h 192 q 13,0 22.5,-9.5 Q 896,493 896,480 Z m 640,32 v 928 q 0,40 -28,68 -28,28 -68,28 H 96 Q 56,1536 28,1508 0,1480 0,1440 V 96 Q 0,56 28,28 56,0 96,0 h 928 q 40,0 88,20 48,20 76,48 l 280,280 q 28,28 48,76 20,48 20,88 z" }],
      ["search", { viewBox: "0 0 1664 1664", path: "M 1152,704 Q 1152,519 1020.5,387.5 889,256 704,256 519,256 387.5,387.5 256,519 256,704 256,889 387.5,1020.5 519,1152 704,1152 889,1152 1020.5,1020.5 1152,889 1152,704 Z m 512,832 q 0,52 -38,90 -38,38 -90,38 -54,0 -90,-38 L 1103,1284 Q 924,1408 704,1408 561,1408 430.5,1352.5 300,1297 205.5,1202.5 111,1108 55.5,977.5 0,847 0,704 0,561 55.5,430.5 111,300 205.5,205.5 300,111 430.5,55.5 561,0 704,0 q 143,0 273.5,55.5 130.5,55.5 225,150 94.5,94.5 150,225 55.5,130.5 55.5,273.5 0,220 -124,399 l 343,343 q 37,37 37,90 z" }],
      ["sliders", { viewBox: "0 0 1536 1408", path: "m 352,1152 0,128 -352,0 0,-128 352,0 z m 352,-128 q 26,0 45,19 19,19 19,45 l 0,256 q 0,26 -19,45 -19,19 -45,19 l -256,0 q -26,0 -45,-19 -19,-19 -19,-45 l 0,-256 q 0,-26 19,-45 19,-19 45,-19 l 256,0 z m 160,-384 0,128 -864,0 0,-128 864,0 z m -640,-512 0,128 -224,0 0,-128 224,0 z m 1312,1024 0,128 -736,0 0,-128 736,0 z M 576,0 q 26,0 45,19 19,19 19,45 l 0,256 q 0,26 -19,45 -19,19 -45,19 l -256,0 q -26,0 -45,-19 -19,-19 -19,-45 L 256,64 Q 256,38 275,19 294,0 320,0 l 256,0 z m 640,512 q 26,0 45,19 19,19 19,45 l 0,256 q 0,26 -19,45 -19,19 -45,19 l -256,0 q -26,0 -45,-19 -19,-19 -19,-45 l 0,-256 q 0,-26 19,-45 19,-19 45,-19 l 256,0 z m 320,128 0,128 -224,0 0,-128 224,0 z m 0,-512 0,128 -864,0 0,-128 864,0 z" }],
      ["spinner", { viewBox: "0 0 1664 1728", path: "m 462,1394 q 0,53 -37.5,90.5 -37.5,37.5 -90.5,37.5 -52,0 -90,-38 -38,-38 -38,-90 0,-53 37.5,-90.5 37.5,-37.5 90.5,-37.5 53,0 90.5,37.5 37.5,37.5 37.5,90.5 z m 498,206 q 0,53 -37.5,90.5 Q 885,1728 832,1728 779,1728 741.5,1690.5 704,1653 704,1600 q 0,-53 37.5,-90.5 37.5,-37.5 90.5,-37.5 53,0 90.5,37.5 Q 960,1547 960,1600 Z M 256,896 q 0,53 -37.5,90.5 Q 181,1024 128,1024 75,1024 37.5,986.5 0,949 0,896 0,843 37.5,805.5 75,768 128,768 q 53,0 90.5,37.5 Q 256,843 256,896 Z m 1202,498 q 0,52 -38,90 -38,38 -90,38 -53,0 -90.5,-37.5 -37.5,-37.5 -37.5,-90.5 0,-53 37.5,-90.5 37.5,-37.5 90.5,-37.5 53,0 90.5,37.5 37.5,37.5 37.5,90.5 z M 494,398 q 0,66 -47,113 -47,47 -113,47 -66,0 -113,-47 -47,-47 -47,-113 0,-66 47,-113 47,-47 113,-47 66,0 113,47 47,47 47,113 z m 1170,498 q 0,53 -37.5,90.5 -37.5,37.5 -90.5,37.5 -53,0 -90.5,-37.5 Q 1408,949 1408,896 q 0,-53 37.5,-90.5 37.5,-37.5 90.5,-37.5 53,0 90.5,37.5 Q 1664,843 1664,896 Z M 1024,192 q 0,80 -56,136 -56,56 -136,56 -80,0 -136,-56 -56,-56 -56,-136 0,-80 56,-136 56,-56 136,-56 80,0 136,56 56,56 56,136 z m 530,206 q 0,93 -66,158.5 -66,65.5 -158,65.5 -93,0 -158.5,-65.5 Q 1106,491 1106,398 q 0,-92 65.5,-158 65.5,-66 158.5,-66 92,0 158,66 66,66 66,158 z" }],
      ["sun", { viewBox: "0 0 1708 1792", path: "m 1706,1172.5 c -3,10 -11,17 -20,20 l -292,96 v 306 c 0,10 -5,20 -13,26 -9,6 -19,8 -29,4 l -292,-94 -180,248 c -6,8 -16,13 -26,13 -10,0 -20,-5 -26,-13 l -180,-248 -292,94 c -10,4 -20,2 -29,-4 -8,-6 -13,-16 -13,-26 v -306 l -292,-96 c -9,-3 -17,-10 -20,-20 -3,-10 -2,-21 4,-29 l 180,-248 -180,-248 c -6,-9 -7,-19 -4,-29 3,-10 11,-17 20,-20 l 292,-96 v -306 c 0,-10 5,-20 13,-26 9,-6 19,-8 29,-4 l 292,94 180,-248 c 12,-16 40,-16 52,0 L 1060,260.5 l 292,-94 c 10,-4 20,-2 29,4 8,6 13,16 13,26 v 306 l 292,96 c 9,3 17,10 20,20 3,10 2,20 -4,29 l -180,248 180,248 c 6,8 7,19 4,29 z" }],
      ["sun-o", { viewBox: "0 0 1708 1792", path: "m 1430,895.5 c 0,-318 -258,-576 -576,-576 -318,0 -576,258 -576,576 0,318 258,576 576,576 C 1172,1471.5 1430,1213.5 1430,895.5 Z m 276,277 c -3,10 -11,17 -20,20 l -292,96 v 306 c 0,10 -5,20 -13,26 -9,6 -19,8 -29,4 l -292,-94 -180,248 c -6,8 -16,13 -26,13 -10,0 -20,-5 -26,-13 l -180,-248 -292,94 c -10,4 -20,2 -29,-4 -8,-6 -13,-16 -13,-26 v -306 l -292,-96 c -9,-3 -17,-10 -20,-20 -3,-10 -2,-21 4,-29 l 180,-248 -180,-248 c -6,-9 -7,-19 -4,-29 3,-10 11,-17 20,-20 l 292,-96 v -306 c 0,-10 5,-20 13,-26 9,-6 19,-8 29,-4 l 292,94 180,-248 c 12,-16 40,-16 52,0 L 1060,260.5 l 292,-94 c 10,-4 20,-2 29,4 8,6 13,16 13,26 v 306 l 292,96 c 9,3 17,10 20,20 3,10 2,20 -4,29 l -180,248 180,248 c 6,8 7,19 4,29 z" }],
      ["terminal", { viewBox: "0 0 1651 1075", path: "m572 522-466 466q-10 10-23 10t-23-10l-50-50q-10-10-10-23t10-23l393-393-393-393q-10-10-10-23t10-23l50-50q10-10 23-10t23 10l466 466q10 10 10 23t-10 23zm1079 457v64q0 14-9 23t-23 9h-960q-14 0-23-9t-9-23v-64q0-14 9-23t23-9h960q14 0 23 9t9 23z" }],
      ["times", { viewBox: "0 0 1188 1188", path: "m 1188,956 q 0,40 -28,68 l -136,136 q -28,28 -68,28 -40,0 -68,-28 L 594,866 300,1160 q -28,28 -68,28 -40,0 -68,-28 L 28,1024 Q 0,996 0,956 0,916 28,888 L 322,594 28,300 Q 0,272 0,232 0,192 28,164 L 164,28 Q 192,0 232,0 272,0 300,28 L 594,322 888,28 q 28,-28 68,-28 40,0 68,28 l 136,136 q 28,28 28,68 0,40 -28,68 l -294,294 294,294 q 28,28 28,68 z" }],
      ["trash-o", { viewBox: "0 0 1408 1536", path: "m 512,608 v 576 q 0,14 -9,23 -9,9 -23,9 h -64 q -14,0 -23,-9 -9,-9 -9,-23 V 608 q 0,-14 9,-23 9,-9 23,-9 h 64 q 14,0 23,9 9,9 9,23 z m 256,0 v 576 q 0,14 -9,23 -9,9 -23,9 h -64 q -14,0 -23,-9 -9,-9 -9,-23 V 608 q 0,-14 9,-23 9,-9 23,-9 h 64 q 14,0 23,9 9,9 9,23 z m 256,0 v 576 q 0,14 -9,23 -9,9 -23,9 h -64 q -14,0 -23,-9 -9,-9 -9,-23 V 608 q 0,-14 9,-23 9,-9 23,-9 h 64 q 14,0 23,9 9,9 9,23 z m 128,724 V 384 H 256 v 948 q 0,22 7,40.5 7,18.5 14.5,27 7.5,8.5 10.5,8.5 h 832 q 3,0 10.5,-8.5 7.5,-8.5 14.5,-27 7,-18.5 7,-40.5 z M 480,256 H 928 L 880,139 q -7,-9 -17,-11 H 546 q -10,2 -17,11 z m 928,32 v 64 q 0,14 -9,23 -9,9 -23,9 h -96 v 948 q 0,83 -47,143.5 -47,60.5 -113,60.5 H 288 q -66,0 -113,-58.5 Q 128,1419 128,1336 V 384 H 32 Q 18,384 9,375 0,366 0,352 v -64 q 0,-14 9,-23 9,-9 23,-9 H 341 L 411,89 Q 426,52 465,26 504,0 544,0 h 320 q 40,0 79,26 39,26 54,63 l 70,167 h 309 q 14,0 23,9 9,9 9,23 z" }],
      ["undo", { viewBox: "0 0 1536 1536", path: "m 1536,768 q 0,156 -61,298 -61,142 -164,245 -103,103 -245,164 -142,61 -298,61 -172,0 -327,-72.5 Q 286,1391 177,1259 q -7,-10 -6.5,-22.5 0.5,-12.5 8.5,-20.5 l 137,-138 q 10,-9 25,-9 16,2 23,12 73,95 179,147 106,52 225,52 104,0 198.5,-40.5 Q 1061,1199 1130,1130 1199,1061 1239.5,966.5 1280,872 1280,768 1280,664 1239.5,569.5 1199,475 1130,406 1061,337 966.5,296.5 872,256 768,256 670,256 580,291.5 490,327 420,393 l 137,138 q 31,30 14,69 -17,40 -59,40 H 64 Q 38,640 19,621 0,602 0,576 V 128 Q 0,86 40,69 79,52 109,83 L 239,212 Q 346,111 483.5,55.5 621,0 768,0 q 156,0 298,61 142,61 245,164 103,103 164,245 61,142 61,298 z" }],
      ["unlink", { viewBox: "0 0 1664 1664", path: "m 439,1271 -256,256 q -11,9 -23,9 -12,0 -23,-9 -9,-10 -9,-23 0,-13 9,-23 l 256,-256 q 10,-9 23,-9 13,0 23,9 9,10 9,23 0,13 -9,23 z m 169,41 v 320 q 0,14 -9,23 -9,9 -23,9 -14,0 -23,-9 -9,-9 -9,-23 v -320 q 0,-14 9,-23 9,-9 23,-9 14,0 23,9 9,9 9,23 z M 384,1088 q 0,14 -9,23 -9,9 -23,9 H 32 q -14,0 -23,-9 -9,-9 -9,-23 0,-14 9,-23 9,-9 23,-9 h 320 q 14,0 23,9 9,9 9,23 z m 1264,128 q 0,120 -85,203 l -147,146 q -83,83 -203,83 -121,0 -204,-85 L 675,1228 q -21,-21 -42,-56 l 239,-18 273,274 q 27,27 68,27.5 41,0.5 68,-26.5 l 147,-146 q 28,-28 28,-67 0,-40 -28,-68 l -274,-275 18,-239 q 35,21 56,42 l 336,336 q 84,86 84,204 z M 1031,492 792,510 519,236 q -28,-28 -68,-28 -39,0 -68,27 L 236,381 q -28,28 -28,67 0,40 28,68 l 274,274 -18,240 q -35,-21 -56,-42 L 100,652 Q 16,566 16,448 16,328 101,245 L 248,99 q 83,-83 203,-83 121,0 204,85 l 334,335 q 21,21 42,56 z m 633,84 q 0,14 -9,23 -9,9 -23,9 h -320 q -14,0 -23,-9 -9,-9 -9,-23 0,-14 9,-23 9,-9 23,-9 h 320 q 14,0 23,9 9,9 9,23 z M 1120,32 v 320 q 0,14 -9,23 -9,9 -23,9 -14,0 -23,-9 -9,-9 -9,-23 V 32 q 0,-14 9,-23 9,-9 23,-9 14,0 23,9 9,9 9,23 z m 407,151 -256,256 q -11,9 -23,9 -12,0 -23,-9 -9,-10 -9,-23 0,-13 9,-23 l 256,-256 q 10,-9 23,-9 13,0 23,9 9,10 9,23 0,13 -9,23 z" }],
      ["unlock-alt", { viewBox: "0 0 1152 1536", path: "m 1056,768 q 40,0 68,28 28,28 28,68 v 576 q 0,40 -28,68 -28,28 -68,28 H 96 Q 56,1536 28,1508 0,1480 0,1440 V 864 q 0,-40 28,-68 28,-28 68,-28 h 32 V 448 Q 128,263 259.5,131.5 391,0 576,0 761,0 892.5,131.5 1024,263 1024,448 q 0,26 -19,45 -19,19 -45,19 h -64 q -26,0 -45,-19 -19,-19 -19,-45 0,-106 -75,-181 -75,-75 -181,-75 -106,0 -181,75 -75,75 -75,181 v 320 z" }],
      ["upload-alt", { viewBox: "0 0 1664 1600", path: "m 1280,1408 q 0,-26 -19,-45 -19,-19 -45,-19 -26,0 -45,19 -19,19 -19,45 0,26 19,45 19,19 45,19 26,0 45,-19 19,-19 19,-45 z m 256,0 q 0,-26 -19,-45 -19,-19 -45,-19 -26,0 -45,19 -19,19 -19,45 0,26 19,45 19,19 45,19 26,0 45,-19 19,-19 19,-45 z m 128,-224 v 320 q 0,40 -28,68 -28,28 -68,28 H 96 q -40,0 -68,-28 -28,-28 -28,-68 v -320 q 0,-40 28,-68 28,-28 68,-28 h 427 q 21,56 70.5,92 49.5,36 110.5,36 h 256 q 61,0 110.5,-36 49.5,-36 70.5,-92 h 427 q 40,0 68,28 28,28 28,68 z M 1339,536 q -17,40 -59,40 h -256 v 448 q 0,26 -19,45 -19,19 -45,19 H 704 q -26,0 -45,-19 -19,-19 -19,-45 V 576 H 384 q -42,0 -59,-40 -17,-39 14,-69 L 787,19 q 18,-19 45,-19 27,0 45,19 l 448,448 q 31,30 14,69 z" }],
      ["volume-up", { viewBox: "0 0 1664 1422", path: "m 768,167 v 1088 c 0,35 -29,64 -64,64 -17,0 -33,-7 -45,-19 L 326,967 H 64 C 29,967 0,938 0,903 V 519 C 0,484 29,455 64,455 H 326 L 659,122 c 12,-12 28,-19 45,-19 35,0 64,29 64,64 z m 384,544 c 0,100 -61,197 -155,235 -8,4 -17,5 -25,5 -35,0 -64,-28 -64,-64 0,-76 116,-55 116,-176 0,-121 -116,-100 -116,-176 0,-36 29,-64 64,-64 8,0 17,1 25,5 94,37 155,135 155,235 z m 256,0 c 0,203 -122,392 -310,471 -8,3 -17,5 -25,5 -36,0 -65,-29 -65,-64 0,-28 16,-47 39,-59 27,-14 52,-26 76,-44 99,-72 157,-187 157,-309 0,-122 -58,-237 -157,-309 -24,-18 -49,-30 -76,-44 -23,-12 -39,-31 -39,-59 0,-35 29,-64 64,-64 9,0 18,2 26,5 188,79 310,268 310,471 z m 256,0 c 0,307 -183,585 -465,706 -8,3 -17,5 -26,5 -35,0 -64,-29 -64,-64 0,-29 15,-45 39,-59 14,-8 30,-13 45,-21 28,-15 56,-32 82,-51 164,-121 261,-312 261,-516 0,-204 -97,-395 -261,-516 -26,-19 -54,-36 -82,-51 -15,-8 -31,-13 -45,-21 -24,-14 -39,-30 -39,-59 0,-35 29,-64 64,-64 9,0 18,2 26,5 282,121 465,399 465,706 z" }],
      ["zoom-in", { viewBox: "0 0 1664 1664", path: "m 1024,672 v 64 q 0,13 -9.5,22.5 Q 1005,768 992,768 H 768 v 224 q 0,13 -9.5,22.5 -9.5,9.5 -22.5,9.5 h -64 q -13,0 -22.5,-9.5 Q 640,1005 640,992 V 768 H 416 q -13,0 -22.5,-9.5 Q 384,749 384,736 v -64 q 0,-13 9.5,-22.5 Q 403,640 416,640 H 640 V 416 q 0,-13 9.5,-22.5 Q 659,384 672,384 h 64 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 v 224 h 224 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 128,32 Q 1152,519 1020.5,387.5 889,256 704,256 519,256 387.5,387.5 256,519 256,704 256,889 387.5,1020.5 519,1152 704,1152 889,1152 1020.5,1020.5 1152,889 1152,704 Z m 512,832 q 0,53 -37.5,90.5 -37.5,37.5 -90.5,37.5 -54,0 -90,-38 L 1103,1284 Q 924,1408 704,1408 561,1408 430.5,1352.5 300,1297 205.5,1202.5 111,1108 55.5,977.5 0,847 0,704 0,561 55.5,430.5 111,300 205.5,205.5 300,111 430.5,55.5 561,0 704,0 q 143,0 273.5,55.5 130.5,55.5 225,150 94.5,94.5 150,225 55.5,130.5 55.5,273.5 0,220 -124,399 l 343,343 q 37,37 37,90 z" }],
      ["zoom-out", { viewBox: "0 0 1664 1664", path: "m 1024,672 v 64 q 0,13 -9.5,22.5 Q 1005,768 992,768 H 416 q -13,0 -22.5,-9.5 Q 384,749 384,736 v -64 q 0,-13 9.5,-22.5 Q 403,640 416,640 h 576 q 13,0 22.5,9.5 9.5,9.5 9.5,22.5 z m 128,32 Q 1152,519 1020.5,387.5 889,256 704,256 519,256 387.5,387.5 256,519 256,704 256,889 387.5,1020.5 519,1152 704,1152 889,1152 1020.5,1020.5 1152,889 1152,704 Z m 512,832 q 0,53 -37.5,90.5 -37.5,37.5 -90.5,37.5 -54,0 -90,-38 L 1103,1284 Q 924,1408 704,1408 561,1408 430.5,1352.5 300,1297 205.5,1202.5 111,1108 55.5,977.5 0,847 0,704 0,561 55.5,430.5 111,300 205.5,205.5 300,111 430.5,55.5 561,0 704,0 q 143,0 273.5,55.5 130.5,55.5 225,150 94.5,94.5 150,225 55.5,130.5 55.5,273.5 0,220 -124,399 l 343,343 q 37,37 37,90 z" }],
      // See /img/photon.svg
      ["ph-popups", { viewBox: "0 0 20 20", path: "m 3.146,1.8546316 a 0.5006316,0.5006316 0 0 0 0.708,-0.708 l -1,-1 a 0.5006316,0.5006316 0 0 0 -0.708,0.708 z m -0.836,2.106 a 0.406,0.406 0 0 0 0.19,0.04 0.5,0.5 0 0 0 0.35,-0.851 0.493,0.493 0 0 0 -0.54,-0.109 0.361,0.361 0 0 0 -0.16,0.109 0.485,0.485 0 0 0 0,0.7 0.372,0.372 0 0 0 0.16,0.111 z m 3,-3 a 0.406,0.406 0 0 0 0.19,0.04 0.513,0.513 0 0 0 0.5,-0.5 0.473,0.473 0 0 0 -0.15,-0.351 0.5,0.5 0 0 0 -0.7,0 0.485,0.485 0 0 0 0,0.7 0.372,0.372 0 0 0 0.16,0.111 z m 13.19,1.04 a 0.5,0.5 0 0 0 0.354,-0.146 l 1,-1 a 0.5006316,0.5006316 0 0 0 -0.708,-0.708 l -1,1 a 0.5,0.5 0 0 0 0.354,0.854 z m 1.35,1.149 a 0.361,0.361 0 0 0 -0.16,-0.109 0.5,0.5 0 0 0 -0.38,0 0.361,0.361 0 0 0 -0.16,0.109 0.485,0.485 0 0 0 0,0.7 0.372,0.372 0 0 0 0.16,0.11 0.471,0.471 0 0 0 0.38,0 0.372,0.372 0 0 0 0.16,-0.11 0.469,0.469 0 0 0 0.15,-0.349 0.43,0.43 0 0 0 -0.04,-0.19 0.358,0.358 0 0 0 -0.11,-0.161 z m -3.54,-2.189 a 0.406,0.406 0 0 0 0.19,0.04 0.469,0.469 0 0 0 0.35,-0.15 0.353,0.353 0 0 0 0.11,-0.161 0.469,0.469 0 0 0 0,-0.379 0.358,0.358 0 0 0 -0.11,-0.161 0.361,0.361 0 0 0 -0.16,-0.109 0.493,0.493 0 0 0 -0.54,0.109 0.358,0.358 0 0 0 -0.11,0.161 0.43,0.43 0 0 0 -0.04,0.19 0.469,0.469 0 0 0 0.15,0.35 0.372,0.372 0 0 0 0.16,0.11 z m 2.544,15.1860004 a 0.5006316,0.5006316 0 0 0 -0.708,0.708 l 1,1 a 0.5006316,0.5006316 0 0 0 0.708,-0.708 z m 0.3,-2 a 0.473,0.473 0 0 0 -0.154,0.354 0.4,0.4 0 0 0 0.04,0.189 0.353,0.353 0 0 0 0.11,0.161 0.469,0.469 0 0 0 0.35,0.15 0.406,0.406 0 0 0 0.19,-0.04 0.372,0.372 0 0 0 0.16,-0.11 0.454,0.454 0 0 0 0.15,-0.35 0.473,0.473 0 0 0 -0.15,-0.351 0.5,0.5 0 0 0 -0.7,0 z m -3,3 a 0.473,0.473 0 0 0 -0.154,0.354 0.454,0.454 0 0 0 0.15,0.35 0.372,0.372 0 0 0 0.16,0.11 0.406,0.406 0 0 0 0.19,0.04 0.469,0.469 0 0 0 0.35,-0.15 0.353,0.353 0 0 0 0.11,-0.161 0.4,0.4 0 0 0 0.04,-0.189 0.473,0.473 0 0 0 -0.15,-0.351 0.5,0.5 0 0 0 -0.7,0 z M 18,5.0006316 a 3,3 0 0 0 -3,-3 H 7 a 3,3 0 0 0 -3,3 v 8.0000004 a 3,3 0 0 0 3,3 h 8 a 3,3 0 0 0 3,-3 z m -2,8.0000004 a 1,1 0 0 1 -1,1 H 7 a 1,1 0 0 1 -1,-1 V 7.0006316 H 16 Z M 16,6.0006316 H 6 v -1 a 1,1 0 0 1 1,-1 h 8 a 1,1 0 0 1 1,1 z M 11,18.000632 H 3 a 1,1 0 0 1 -1,-1 v -6 h 1 v -1 H 2 V 9.0006316 a 1,1 0 0 1 1,-1 v -2 a 3,3 0 0 0 -3,3 v 8.0000004 a 3,3 0 0 0 3,3 h 8 a 3,3 0 0 0 3,-3 h -2 a 1,1 0 0 1 -1,1 z" }],
      ["ph-readermode-text-size", { viewBox: "0 0 20 12.5", path: "M 10.422,11.223 A 0.712,0.712 0 0 1 10.295,11.007 L 6.581,0 H 4.68 L 0.933,11.309 0,11.447 V 12.5 H 3.594 V 11.447 L 2.655,11.325 A 0.3,0.3 0 0 1 2.468,11.211 0.214,0.214 0 0 1 2.419,10.974 L 3.341,8.387 h 3.575 l 0.906,2.652 a 0.18,0.18 0 0 1 -0.016,0.18 0.217,0.217 0 0 1 -0.139,0.106 L 6.679,11.447 V 12.5 h 4.62 V 11.447 L 10.663,11.325 A 0.512,0.512 0 0 1 10.422,11.223 Z M 3.659,7.399 5.063,2.57 6.5,7.399 Z M 19.27,11.464 A 0.406,0.406 0 0 1 19.009,11.337 0.368,0.368 0 0 1 18.902,11.072 V 6.779 A 3.838,3.838 0 0 0 18.67,5.318 1.957,1.957 0 0 0 18.01,4.457 2.48,2.48 0 0 0 16.987,4.044 7.582,7.582 0 0 0 15.67,3.938 a 6.505,6.505 0 0 0 -1.325,0.139 5.2,5.2 0 0 0 -1.2,0.4 2.732,2.732 0 0 0 -0.864,0.624 1.215,1.215 0 0 0 -0.331,0.833 0.532,0.532 0 0 0 0.119,0.383 0.665,0.665 0 0 0 0.257,0.172 0.916,0.916 0 0 0 0.375,0.041 h 1.723 V 4.942 A 4.429,4.429 0 0 1 14.611,4.91 2.045,2.045 0 0 1 14.836,4.885 c 0.09,0 0.192,-0.008 0.306,-0.008 a 1.849,1.849 0 0 1 0.808,0.151 1.247,1.247 0 0 1 0.71,0.89 2.164,2.164 0 0 1 0.049,0.51 c 0,0.076 -0.008,0.152 -0.008,0.228 0,0.076 -0.008,0.139 -0.008,0.221 v 0.2 q -1.152,0.252 -1.976,0.489 a 12.973,12.973 0 0 0 -1.391,0.474 4.514,4.514 0 0 0 -0.91,0.485 2.143,2.143 0 0 0 -0.527,0.523 1.594,1.594 0 0 0 -0.245,0.592 3.739,3.739 0 0 0 -0.061,0.693 2.261,2.261 0 0 0 0.171,0.9 2.024,2.024 0 0 0 0.469,0.682 2.084,2.084 0 0 0 0.693,0.432 2.364,2.364 0 0 0 0.852,0.151 3.587,3.587 0 0 0 1.068,-0.159 6.441,6.441 0 0 0 1.835,-0.877 l 0.22,0.832 H 20 v -0.783 z m -2.588,-0.719 a 4.314,4.314 0 0 1 -0.5,0.188 5.909,5.909 0 0 1 -0.493,0.123 2.665,2.665 0 0 1 -0.543,0.057 1.173,1.173 0 0 1 -0.861,-0.363 1.166,1.166 0 0 1 -0.245,-0.392 1.357,1.357 0 0 1 -0.086,-0.486 1.632,1.632 0 0 1 0.123,-0.657 1.215,1.215 0 0 1 0.432,-0.5 3.151,3.151 0 0 1 0.837,-0.392 12.429,12.429 0 0 1 1.334,-0.334 z" }]
    ]);
    return function(root) {
      const icons = (root || document).querySelectorAll(".fa-icon");
      if (icons.length === 0) {
        return;
      }
      const svgNS = "http://www.w3.org/2000/svg";
      for (const icon of icons) {
        if (icon.firstChild === null || icon.firstChild.nodeType !== 3) {
          continue;
        }
        const name = icon.firstChild.nodeValue.trim();
        if (name === "") {
          continue;
        }
        const svg = document.createElementNS(svgNS, "svg");
        svg.classList.add("fa-icon_" + name);
        const details = svgIcons.get(name);
        if (details === void 0) {
          let file;
          if (name.startsWith("ph-")) {
            file = "photon";
          } else if (name.startsWith("md-")) {
            file = "material-design";
          } else {
            continue;
          }
          const use = document.createElementNS(svgNS, "use");
          use.setAttribute("href", `/img/${file}.svg#${name}`);
          svg.appendChild(use);
        } else {
          svg.setAttribute("viewBox", details.viewBox);
          const path = document.createElementNS(svgNS, "path");
          path.setAttribute("d", details.path);
          svg.appendChild(path);
        }
        icon.replaceChild(svg, icon.firstChild);
        if (icon.classList.contains("fa-icon-badged")) {
          const badge = document.createElement("span");
          badge.className = "fa-icon-badge";
          icon.insertBefore(badge, icon.firstChild.nextSibling);
        }
      }
    };
  })();
  faIconsInit();
})();
/*! https://mths.be/punycode v1.3.2 by @mathias */
