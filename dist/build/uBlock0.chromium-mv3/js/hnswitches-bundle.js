(() => {
  // text-utils.js
  var LineIterator = class {
    constructor(text, offset) {
      this.text = text;
      this.textLen = this.text.length;
      this.offset = offset || 0;
    }
    next(offset) {
      if (offset !== void 0) {
        this.offset += offset;
      }
      let lineEnd = this.text.indexOf("\n", this.offset);
      if (lineEnd === -1) {
        lineEnd = this.text.indexOf("\r", this.offset);
        if (lineEnd === -1) {
          lineEnd = this.textLen;
        }
      }
      const line = this.text.slice(this.offset, lineEnd);
      this.offset = lineEnd + 1;
      return line;
    }
    peek(n) {
      const offset = this.offset;
      return this.text.slice(offset, offset + n);
    }
    charCodeAt(offset) {
      return this.text.charCodeAt(this.offset + offset);
    }
    eot() {
      return this.offset >= this.textLen;
    }
  };

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

  // uri-utils.js
  var reIPv4VeryCoarse = /\.\d+$/;
  var reHostnameVeryCoarse = /[g-z_-]/;
  function toBroaderHostname(hostname) {
    const pos = hostname.indexOf(".");
    if (pos !== -1) {
      return hostname.slice(pos + 1);
    }
    return hostname !== "*" && hostname !== "" ? "*" : "";
  }
  function toBroaderIPv4Address(ipaddress) {
    if (ipaddress === "*" || ipaddress === "") {
      return "";
    }
    const pos = ipaddress.lastIndexOf(".");
    if (pos === -1) {
      return "*";
    }
    return ipaddress.slice(0, pos);
  }
  function toBroaderIPv6Address(ipaddress) {
    return ipaddress !== "*" && ipaddress !== "" ? "*" : "";
  }
  function decomposeHostname(hostname, out) {
    if (out.length !== 0 && out[0] === hostname) {
      return out;
    }
    let broadenFn;
    if (reHostnameVeryCoarse.test(hostname) === false) {
      if (reIPv4VeryCoarse.test(hostname)) {
        broadenFn = toBroaderIPv4Address;
      } else if (hostname.startsWith("[")) {
        broadenFn = toBroaderIPv6Address;
      }
    }
    if (broadenFn === void 0) {
      broadenFn = toBroaderHostname;
    }
    out[0] = hostname;
    let i = 1;
    for (; ; ) {
      hostname = broadenFn(hostname);
      if (hostname === "") {
        break;
      }
      out[i++] = hostname;
    }
    out.length = i;
    return out;
  }

  // hnswitches.js
  var decomposedSource = [];
  var switchBitOffsets = /* @__PURE__ */ Object.create(null);
  Object.assign(switchBitOffsets, {
    "no-strict-blocking": 0,
    "no-popups": 2,
    "no-cosmetic-filtering": 4,
    "no-remote-fonts": 6,
    "no-large-media": 8,
    "no-csp-reports": 10,
    "no-scripting": 12
  });
  var switchStateToNameMap = /* @__PURE__ */ Object.create(null);
  Object.assign(switchStateToNameMap, {
    "1": "true",
    "2": "false"
  });
  var nameToSwitchStateMap = /* @__PURE__ */ Object.create(null);
  Object.assign(nameToSwitchStateMap, {
    "true": 1,
    "false": 2,
    "on": 1,
    "off": 2
  });
  var reNotASCII = /[^\x20-\x7F]/;
  var DynamicSwitchRuleFiltering = class {
    constructor() {
      this.reset();
    }
    reset() {
      this.switches = /* @__PURE__ */ new Map();
      this.n = "";
      this.z = "";
      this.r = 0;
      this.changed = true;
    }
    assign(from) {
      for (const hn of this.switches.keys()) {
        if (from.switches.has(hn) === false) {
          this.switches.delete(hn);
          this.changed = true;
        }
      }
      for (const [hn, bits] of from.switches) {
        if (this.switches.get(hn) !== bits) {
          this.switches.set(hn, bits);
          this.changed = true;
        }
      }
    }
    copyRules(from, srcHostname) {
      const thisBits = this.switches.get(srcHostname);
      const fromBits = from.switches.get(srcHostname);
      if (fromBits !== thisBits) {
        if (fromBits !== void 0) {
          this.switches.set(srcHostname, fromBits);
        } else {
          this.switches.delete(srcHostname);
        }
        this.changed = true;
      }
      return this.changed;
    }
    hasSameRules(other, srcHostname) {
      return this.switches.get(srcHostname) === other.switches.get(srcHostname);
    }
    toggle(switchName, hostname, newVal) {
      const bitOffset = switchBitOffsets[switchName];
      if (bitOffset === void 0) {
        return false;
      }
      if (newVal === this.evaluate(switchName, hostname)) {
        return false;
      }
      let bits = this.switches.get(hostname) || 0;
      bits &= ~(3 << bitOffset);
      bits |= newVal << bitOffset;
      if (bits === 0) {
        this.switches.delete(hostname);
      } else {
        this.switches.set(hostname, bits);
      }
      this.changed = true;
      return true;
    }
    toggleOneZ(switchName, hostname, newState) {
      const bitOffset = switchBitOffsets[switchName];
      if (bitOffset === void 0) {
        return false;
      }
      let state = this.evaluateZ(switchName, hostname);
      if (newState === state) {
        return false;
      }
      if (newState === void 0) {
        newState = !state;
      }
      let bits = this.switches.get(hostname) || 0;
      bits &= ~(3 << bitOffset);
      if (bits === 0) {
        this.switches.delete(hostname);
      } else {
        this.switches.set(hostname, bits);
      }
      state = this.evaluateZ(switchName, hostname);
      if (state !== newState) {
        this.switches.set(hostname, bits | (newState ? 1 : 2) << bitOffset);
      }
      this.changed = true;
      return true;
    }
    toggleBranchZ(switchName, targetHostname, newState) {
      this.toggleOneZ(switchName, targetHostname, newState);
      const targetLen = targetHostname.length;
      for (const hostname of this.switches.keys()) {
        if (hostname === targetHostname) {
          continue;
        }
        if (hostname.length <= targetLen) {
          continue;
        }
        if (hostname.endsWith(targetHostname) === false) {
          continue;
        }
        if (hostname.charAt(hostname.length - targetLen - 1) !== ".") {
          continue;
        }
        this.toggle(switchName, hostname, 0);
      }
      return this.changed;
    }
    toggleZ(switchName, hostname, deep, newState) {
      if (deep === true) {
        return this.toggleBranchZ(switchName, hostname, newState);
      }
      return this.toggleOneZ(switchName, hostname, newState);
    }
    // 0 = inherit from broader scope, up to default state
    // 1 = non-default state
    // 2 = forced default state (to override a broader non-default state)
    evaluate(switchName, hostname) {
      const bits = this.switches.get(hostname);
      if (bits === void 0) {
        return 0;
      }
      let bitOffset = switchBitOffsets[switchName];
      if (bitOffset === void 0) {
        return 0;
      }
      return bits >>> bitOffset & 3;
    }
    evaluateZ(switchName, hostname) {
      const bitOffset = switchBitOffsets[switchName];
      if (bitOffset === void 0) {
        this.r = 0;
        return false;
      }
      this.n = switchName;
      for (const shn of decomposeHostname(hostname, decomposedSource)) {
        let bits = this.switches.get(shn);
        if (bits === void 0) {
          continue;
        }
        bits = bits >>> bitOffset & 3;
        if (bits === 0) {
          continue;
        }
        this.z = shn;
        this.r = bits;
        return bits === 1;
      }
      this.r = 0;
      return false;
    }
    toLogData() {
      return {
        source: "switch",
        result: this.r,
        raw: `${this.n}: ${this.z} true`
      };
    }
    toArray() {
      const out = [];
      for (const hostname of this.switches.keys()) {
        const prettyHn = hostname.includes("xn--") && punycode_default ? punycode_default.toUnicode(hostname) : hostname;
        for (const switchName in switchBitOffsets) {
          if (switchBitOffsets[switchName] === void 0) {
            continue;
          }
          const val = this.evaluate(switchName, hostname);
          if (val === 0) {
            continue;
          }
          out.push(`${switchName}: ${prettyHn} ${switchStateToNameMap[val]}`);
        }
      }
      return out;
    }
    toString() {
      return this.toArray().join("\n");
    }
    fromString(text, append) {
      const lineIter = new LineIterator(text);
      if (append !== true) {
        this.reset();
      }
      while (lineIter.eot() === false) {
        this.addFromRuleParts(lineIter.next().trim().split(/\s+/));
      }
    }
    validateRuleParts(parts) {
      if (parts.length < 3) {
        return;
      }
      if (parts[0].endsWith(":") === false) {
        return;
      }
      if (nameToSwitchStateMap[parts[2]] === void 0) {
        return;
      }
      if (reNotASCII.test(parts[1]) && punycode_default !== void 0) {
        parts[1] = punycode_default.toASCII(parts[1]);
      }
      return parts;
    }
    addFromRuleParts(parts) {
      if (this.validateRuleParts(parts) === void 0) {
        return false;
      }
      const switchName = parts[0].slice(0, -1);
      if (switchBitOffsets[switchName] === void 0) {
        return false;
      }
      this.toggle(switchName, parts[1], nameToSwitchStateMap[parts[2]]);
      return true;
    }
    removeFromRuleParts(parts) {
      if (this.validateRuleParts(parts) !== void 0) {
        this.toggle(parts[0].slice(0, -1), parts[1], 0);
        return true;
      }
      return false;
    }
  };
  var hnswitches_default = DynamicSwitchRuleFiltering;
})();
/*! Home: https://github.com/gorhill/publicsuffixlist.js -- GPLv3 APLv2 */
/*! https://mths.be/punycode v1.3.2 by @mathias */
