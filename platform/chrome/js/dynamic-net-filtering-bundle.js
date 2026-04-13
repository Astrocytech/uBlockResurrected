(() => {
  // ../lib/publicsuffixlist/publicsuffixlist.js
  var publicsuffixlist_default = /* @__PURE__ */ function() {
    const HOSTNAME_SLOT = 0;
    const LABEL_INDICES_SLOT = 256;
    const RULES_PTR_SLOT = 100;
    const SUFFIX_NOT_FOUND_SLOT = 399;
    const CHARDATA_PTR_SLOT = 101;
    const EMPTY_STRING = "";
    const SELFIE_MAGIC = 3;
    let wasmMemory;
    let pslBuffer32;
    let pslBuffer8;
    let pslByteLength = 0;
    let hostnameArg = EMPTY_STRING;
    const fireChangedEvent = function() {
      if (typeof window !== "object") {
        return;
      }
      if (window instanceof Object === false) {
        return;
      }
      if (window.dispatchEvent instanceof Function === false) {
        return;
      }
      if (window.CustomEvent instanceof Function === false) {
        return;
      }
      window.dispatchEvent(new CustomEvent("publicSuffixListChanged"));
    };
    const allocateBuffers = function(byteLength) {
      pslByteLength = byteLength + 3 & ~3;
      if (pslBuffer32 !== void 0 && pslBuffer32.byteLength >= pslByteLength) {
        return;
      }
      if (wasmMemory !== void 0) {
        const newPageCount = pslByteLength + 65535 >>> 16;
        const curPageCount = wasmMemory.buffer.byteLength >>> 16;
        const delta = newPageCount - curPageCount;
        if (delta > 0) {
          wasmMemory.grow(delta);
          pslBuffer32 = new Uint32Array(wasmMemory.buffer);
          pslBuffer8 = new Uint8Array(wasmMemory.buffer);
        }
      } else {
        pslBuffer8 = new Uint8Array(pslByteLength);
        pslBuffer32 = new Uint32Array(pslBuffer8.buffer);
      }
      hostnameArg = EMPTY_STRING;
      pslBuffer8[LABEL_INDICES_SLOT] = 0;
    };
    const parse = function(text, toAscii) {
      const rootRule = {
        l: EMPTY_STRING,
        // l => label
        f: 0,
        // f => flags
        c: void 0
        // c => children
      };
      {
        const compareLabels = function(a, b) {
          let n = a.length;
          let d = n - b.length;
          if (d !== 0) {
            return d;
          }
          for (let i = 0; i < n; i++) {
            d = a.charCodeAt(i) - b.charCodeAt(i);
            if (d !== 0) {
              return d;
            }
          }
          return 0;
        };
        const addToTree = function(rule, exception) {
          let node = rootRule;
          let end = rule.length;
          while (end > 0) {
            const beg = rule.lastIndexOf(".", end - 1);
            const label = rule.slice(beg + 1, end);
            end = beg;
            if (Array.isArray(node.c) === false) {
              const child = { l: label, f: 0, c: void 0 };
              node.c = [child];
              node = child;
              continue;
            }
            let left = 0;
            let right = node.c.length;
            while (left < right) {
              const i = left + right >>> 1;
              const d = compareLabels(label, node.c[i].l);
              if (d < 0) {
                right = i;
                if (right === left) {
                  const child = {
                    l: label,
                    f: 0,
                    c: void 0
                  };
                  node.c.splice(left, 0, child);
                  node = child;
                  break;
                }
                continue;
              }
              if (d > 0) {
                left = i + 1;
                if (left === right) {
                  const child = {
                    l: label,
                    f: 0,
                    c: void 0
                  };
                  node.c.splice(right, 0, child);
                  node = child;
                  break;
                }
                continue;
              }
              node = node.c[i];
              break;
            }
          }
          node.f |= 1;
          if (exception) {
            node.f |= 2;
          }
        };
        addToTree("*", false);
        const mustPunycode = /[^a-z0-9.-]/;
        const textEnd = text.length;
        let lineBeg = 0;
        while (lineBeg < textEnd) {
          let lineEnd = text.indexOf("\n", lineBeg);
          if (lineEnd === -1) {
            lineEnd = text.indexOf("\r", lineBeg);
            if (lineEnd === -1) {
              lineEnd = textEnd;
            }
          }
          let line = text.slice(lineBeg, lineEnd).trim();
          lineBeg = lineEnd + 1;
          const pos = line.indexOf("//");
          if (pos !== -1) {
            line = line.slice(0, pos);
          }
          line = line.trim();
          if (line.length === 0) {
            continue;
          }
          const exception = line.charCodeAt(0) === 33;
          if (exception) {
            line = line.slice(1);
          }
          if (mustPunycode.test(line)) {
            line = toAscii(line.toLowerCase());
          }
          addToTree(line, exception);
        }
      }
      {
        const labelToOffsetMap = /* @__PURE__ */ new Map();
        const treeData = [];
        const charData = [];
        const allocate = function(n) {
          const ibuf = treeData.length;
          for (let i = 0; i < n; i++) {
            treeData.push(0);
          }
          return ibuf;
        };
        const storeNode = function(ibuf, node) {
          const nChars = node.l.length;
          const nChildren = node.c !== void 0 ? node.c.length : 0;
          treeData[ibuf + 0] = nChildren << 16 | node.f << 8 | nChars;
          if (nChars <= 4) {
            let v = 0;
            if (nChars > 0) {
              v |= node.l.charCodeAt(0);
              if (nChars > 1) {
                v |= node.l.charCodeAt(1) << 8;
                if (nChars > 2) {
                  v |= node.l.charCodeAt(2) << 16;
                  if (nChars > 3) {
                    v |= node.l.charCodeAt(3) << 24;
                  }
                }
              }
            }
            treeData[ibuf + 1] = v;
          } else {
            let offset = labelToOffsetMap.get(node.l);
            if (offset === void 0) {
              offset = charData.length;
              for (let i = 0; i < nChars; i++) {
                charData.push(node.l.charCodeAt(i));
              }
              labelToOffsetMap.set(node.l, offset);
            }
            treeData[ibuf + 1] = offset;
          }
          if (Array.isArray(node.c) === false) {
            treeData[ibuf + 2] = 0;
            return;
          }
          const iarray = allocate(nChildren * 3);
          treeData[ibuf + 2] = iarray;
          for (let i = 0; i < nChildren; i++) {
            storeNode(iarray + i * 3, node.c[i]);
          }
        };
        allocate(512 >> 2);
        const iRootRule = allocate(3);
        storeNode(iRootRule, rootRule);
        treeData[RULES_PTR_SLOT] = iRootRule;
        const iCharData = treeData.length << 2;
        treeData[CHARDATA_PTR_SLOT] = iCharData;
        const byteLength = (treeData.length << 2) + (charData.length + 3 & ~3);
        allocateBuffers(byteLength);
        pslBuffer32.set(treeData);
        pslBuffer8.set(charData, treeData.length << 2);
      }
      fireChangedEvent();
    };
    const setHostnameArg = function(hostname) {
      const buf = pslBuffer8;
      if (hostname === hostnameArg) {
        return buf[LABEL_INDICES_SLOT];
      }
      if (hostname === null || hostname.length === 0) {
        hostnameArg = EMPTY_STRING;
        return buf[LABEL_INDICES_SLOT] = 0;
      }
      hostname = hostname.toLowerCase();
      hostnameArg = hostname;
      let n = hostname.length;
      if (n > 255) {
        n = 255;
      }
      buf[LABEL_INDICES_SLOT] = n;
      let i = n;
      let j = LABEL_INDICES_SLOT + 1;
      while (i--) {
        const c = hostname.charCodeAt(i);
        if (c === 46) {
          buf[j + 0] = i + 1;
          buf[j + 1] = i;
          j += 2;
        }
        buf[i] = c;
      }
      buf[j] = 0;
      return n;
    };
    const getPublicSuffixPosJS = function() {
      const buf8 = pslBuffer8;
      const buf32 = pslBuffer32;
      const iCharData = buf32[CHARDATA_PTR_SLOT];
      let iNode = pslBuffer32[RULES_PTR_SLOT];
      let cursorPos = -1;
      let iLabel = LABEL_INDICES_SLOT;
      for (; ; ) {
        const labelBeg = buf8[iLabel + 1];
        const labelLen = buf8[iLabel + 0] - labelBeg;
        let r = buf32[iNode + 0] >>> 16;
        if (r === 0) {
          break;
        }
        const iCandidates = buf32[iNode + 2];
        let l = 0;
        let iFound = 0;
        while (l < r) {
          const iCandidate = l + r >>> 1;
          const iCandidateNode = iCandidates + iCandidate + (iCandidate << 1);
          const candidateLen = buf32[iCandidateNode + 0] & 255;
          let d = labelLen - candidateLen;
          if (d === 0) {
            const iCandidateChar = candidateLen <= 4 ? iCandidateNode + 1 << 2 : iCharData + buf32[iCandidateNode + 1];
            for (let i = 0; i < labelLen; i++) {
              d = buf8[labelBeg + i] - buf8[iCandidateChar + i];
              if (d !== 0) {
                break;
              }
            }
          }
          if (d < 0) {
            r = iCandidate;
          } else if (d > 0) {
            l = iCandidate + 1;
          } else {
            iFound = iCandidateNode;
            break;
          }
        }
        if (iFound === 0) {
          if (buf32[iCandidates + 1] !== 42) {
            break;
          }
          buf8[SUFFIX_NOT_FOUND_SLOT] = 1;
          iFound = iCandidates;
        }
        iNode = iFound;
        if ((buf32[iNode + 0] & 512) !== 0) {
          if (iLabel > LABEL_INDICES_SLOT) {
            return iLabel - 2;
          }
          break;
        }
        if ((buf32[iNode + 0] & 256) !== 0) {
          cursorPos = iLabel;
        }
        if (labelBeg === 0) {
          break;
        }
        iLabel += 2;
      }
      return cursorPos;
    };
    let getPublicSuffixPosWASM;
    let getPublicSuffixPos = getPublicSuffixPosJS;
    const getPublicSuffix = function(hostname) {
      if (pslBuffer32 === void 0) {
        return EMPTY_STRING;
      }
      const hostnameLen = setHostnameArg(hostname);
      const buf8 = pslBuffer8;
      if (hostnameLen === 0 || buf8[0] === 46) {
        return EMPTY_STRING;
      }
      const cursorPos = getPublicSuffixPos();
      if (cursorPos === -1) {
        return EMPTY_STRING;
      }
      const beg = buf8[cursorPos + 1];
      return beg === 0 ? hostnameArg : hostnameArg.slice(beg);
    };
    const getDomain = function(hostname) {
      if (pslBuffer32 === void 0) {
        return EMPTY_STRING;
      }
      const hostnameLen = setHostnameArg(hostname);
      const buf8 = pslBuffer8;
      if (hostnameLen === 0 || buf8[0] === 46) {
        return EMPTY_STRING;
      }
      const cursorPos = getPublicSuffixPos();
      if (cursorPos === -1 || buf8[cursorPos + 1] === 0) {
        return EMPTY_STRING;
      }
      const beg = buf8[cursorPos + 3];
      return beg === 0 ? hostnameArg : hostnameArg.slice(beg);
    };
    const suffixInPSL = function(hostname) {
      if (pslBuffer32 === void 0) {
        return false;
      }
      const hostnameLen = setHostnameArg(hostname);
      const buf8 = pslBuffer8;
      if (hostnameLen === 0 || buf8[0] === 46) {
        return false;
      }
      buf8[SUFFIX_NOT_FOUND_SLOT] = 0;
      const cursorPos = getPublicSuffixPos();
      return cursorPos !== -1 && buf8[cursorPos + 1] === 0 && buf8[SUFFIX_NOT_FOUND_SLOT] !== 1;
    };
    const toSelfie = function(encoder) {
      if (pslBuffer8 === void 0) {
        return "";
      }
      if (encoder instanceof Object) {
        const bufferStr = encoder.encode(pslBuffer8.buffer, pslByteLength);
        return `${SELFIE_MAGIC}	${bufferStr}`;
      }
      return {
        magic: SELFIE_MAGIC,
        buf32: pslBuffer32.subarray(0, pslByteLength >> 2)
      };
    };
    const fromSelfie = function(selfie, decoder) {
      let byteLength = 0;
      if (typeof selfie === "string" && selfie.length !== 0 && decoder instanceof Object) {
        const pos = selfie.indexOf("	");
        if (pos === -1 || selfie.slice(0, pos) !== `${SELFIE_MAGIC}`) {
          return false;
        }
        const bufferStr = selfie.slice(pos + 1);
        byteLength = decoder.decodeSize(bufferStr);
        if (byteLength === 0) {
          return false;
        }
        allocateBuffers(byteLength);
        decoder.decode(bufferStr, pslBuffer8.buffer);
      } else if (selfie instanceof Object && selfie.magic === SELFIE_MAGIC && selfie.buf32 instanceof Uint32Array) {
        byteLength = selfie.buf32.length << 2;
        allocateBuffers(byteLength);
        pslBuffer32.set(selfie.buf32);
      } else {
        return false;
      }
      hostnameArg = EMPTY_STRING;
      pslBuffer8[LABEL_INDICES_SLOT] = 0;
      fireChangedEvent();
      return true;
    };
    const enableWASM = /* @__PURE__ */ (() => {
      let wasmPromise;
      const getWasmInstance = async function(wasmModuleFetcher, path) {
        if (typeof WebAssembly !== "object") {
          return false;
        }
        const uint32s = new Uint32Array(1);
        const uint8s = new Uint8Array(uint32s.buffer);
        uint32s[0] = 1;
        if (uint8s[0] !== 1) {
          return false;
        }
        try {
          const module = await wasmModuleFetcher(`${path}publicsuffixlist`);
          if (module instanceof WebAssembly.Module === false) {
            return false;
          }
          const pageCount = pslBuffer8 !== void 0 ? pslBuffer8.byteLength + 65535 >>> 16 : 1;
          const memory = new WebAssembly.Memory({ initial: pageCount });
          const instance = await WebAssembly.instantiate(module, {
            imports: { memory }
          });
          if (instance instanceof WebAssembly.Instance === false) {
            return false;
          }
          const curPageCount = memory.buffer.byteLength >>> 16;
          const newPageCount = pslBuffer8 !== void 0 ? pslBuffer8.byteLength + 65535 >>> 16 : 0;
          if (newPageCount > curPageCount) {
            memory.grow(newPageCount - curPageCount);
          }
          if (pslBuffer32 !== void 0) {
            const buf8 = new Uint8Array(memory.buffer);
            const buf32 = new Uint32Array(memory.buffer);
            buf32.set(pslBuffer32);
            pslBuffer8 = buf8;
            pslBuffer32 = buf32;
          }
          wasmMemory = memory;
          getPublicSuffixPosWASM = instance.exports.getPublicSuffixPos;
          getPublicSuffixPos = getPublicSuffixPosWASM;
          return true;
        } catch (reason) {
          console.info(reason);
        }
        return false;
      };
      return async function(wasmModuleFetcher, path) {
        if (getPublicSuffixPosWASM instanceof Function) {
          return true;
        }
        if (wasmPromise instanceof Promise === false) {
          wasmPromise = getWasmInstance(wasmModuleFetcher, path);
        }
        return wasmPromise;
      };
    })();
    const disableWASM = function() {
      if (getPublicSuffixPosWASM instanceof Function) {
        getPublicSuffixPos = getPublicSuffixPosJS;
        getPublicSuffixPosWASM = void 0;
      }
      if (wasmMemory === void 0) {
        return;
      }
      if (pslBuffer32 !== void 0) {
        const buf8 = new Uint8Array(pslByteLength);
        const buf32 = new Uint32Array(buf8.buffer);
        buf32.set(pslBuffer32);
        pslBuffer8 = buf8;
        pslBuffer32 = buf32;
      }
      wasmMemory = void 0;
    };
    return {
      version: "2.0",
      parse,
      getDomain,
      suffixInPSL,
      getPublicSuffix,
      toSelfie,
      fromSelfie,
      disableWASM,
      enableWASM
    };
  }();

  // ../lib/punycode.js
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

  // uri-utils.ts
  var reIPAddressNaive = /^\d+\.\d+\.\d+\.\d+$|^\[[\da-zA-Z:]+\]$/;
  var reIPv4VeryCoarse = /\.\d+$/;
  var reHostnameVeryCoarse = /[g-z_-]/;
  function domainFromHostname(hostname) {
    return reIPAddressNaive.test(hostname) ? hostname : publicsuffixlist_default.getDomain(hostname);
  }
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

  // text-utils.ts
  var LineIterator = class {
    text;
    textLen;
    offset;
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

  // dashboard-common.ts
  self.uBlockDashboard = self.uBlockDashboard || {};
  self.uBlockDashboard.mergeNewLines = function(text, newText) {
    const fromDict = /* @__PURE__ */ new Map();
    let lineBeg = 0;
    let textEnd = text.length;
    while (lineBeg < textEnd) {
      let lineEnd = text.indexOf("\n", lineBeg);
      if (lineEnd === -1) {
        lineEnd = text.indexOf("\r", lineBeg);
        if (lineEnd === -1) {
          lineEnd = textEnd;
        }
      }
      const line = text.slice(lineBeg, lineEnd).trim();
      lineBeg = lineEnd + 1;
      if (line.length === 0) {
        continue;
      }
      const hash = line.slice(0, 8);
      const bucket = fromDict.get(hash);
      if (bucket === void 0) {
        fromDict.set(hash, line);
      } else if (typeof bucket === "string") {
        fromDict.set(hash, [bucket, line]);
      } else {
        bucket.push(line);
      }
    }
    const out = [""];
    lineBeg = 0;
    textEnd = newText.length;
    while (lineBeg < textEnd) {
      let lineEnd = newText.indexOf("\n", lineBeg);
      if (lineEnd === -1) {
        lineEnd = newText.indexOf("\r", lineBeg);
        if (lineEnd === -1) {
          lineEnd = textEnd;
        }
      }
      const line = newText.slice(lineBeg, lineEnd).trim();
      lineBeg = lineEnd + 1;
      if (line.length === 0) {
        if (out[out.length - 1] !== "") {
          out.push("");
        }
        continue;
      }
      const bucket = fromDict.get(line.slice(0, 8));
      if (bucket === void 0) {
        out.push(line);
        continue;
      }
      if (typeof bucket === "string" && line !== bucket) {
        out.push(line);
        continue;
      }
      if (bucket.indexOf(line) === -1) {
        out.push(line);
      }
    }
    const append = out.join("\n").trim();
    if (text !== "" && append !== "") {
      text += "\n\n";
    }
    return text + append;
  };
  self.uBlockDashboard.dateNowToSensibleString = function() {
    const now = new Date(Date.now() - (/* @__PURE__ */ new Date()).getTimezoneOffset() * 6e4);
    return now.toISOString().replace(/\.\d+Z$/, "").replace(/:/g, ".").replace("T", "_");
  };
  self.uBlockDashboard.patchCodeMirrorEditor = function() {
    let grabFocusTarget;
    const grabFocus = function() {
      if (grabFocusTarget) {
        grabFocusTarget.focus();
      }
      grabFocusTarget = void 0;
    };
    const grabFocusTimer = vAPI.defer.create(grabFocus);
    const grabFocusAsync = function(cm) {
      grabFocusTarget = cm;
      grabFocusTimer.on(1);
    };
    const patchSelectAll = function(cm, details) {
      const vp = cm.getViewport();
      if (details.ranges.length !== 1) {
        return;
      }
      const range = details.ranges[0];
      let lineFrom = range.anchor.line;
      let lineTo = range.head.line;
      if (lineTo === lineFrom) {
        return;
      }
      if (range.head.ch !== 0) {
        lineTo += 1;
      }
      if (lineFrom !== vp.from || lineTo !== vp.to) {
        return;
      }
      details.update([
        {
          anchor: { line: 0, ch: 0 },
          head: { line: cm.lineCount(), ch: 0 }
        }
      ]);
      grabFocusAsync(cm);
    };
    let lastGutterClick = 0;
    let lastGutterLine = 0;
    const onGutterClicked = function(cm, line, gutter) {
      if (gutter !== "CodeMirror-linenumbers") {
        return;
      }
      grabFocusAsync(cm);
      const delta = Date.now() - lastGutterClick;
      if (delta >= 500 || line !== lastGutterLine) {
        cm.setSelection(
          { line, ch: 0 },
          { line: line + 1, ch: 0 }
        );
        lastGutterClick = Date.now();
        lastGutterLine = line;
        return;
      }
      let lineFrom = 0;
      let lineTo = cm.lineCount();
      const foldFn = cm.getHelper({ line, ch: 0 }, "fold");
      if (foldFn instanceof Function) {
        const range = foldFn(cm, { line, ch: 0 });
        if (range !== void 0) {
          lineFrom = range.from.line;
          lineTo = range.to.line + 1;
        }
      }
      cm.setSelection(
        { line: lineFrom, ch: 0 },
        { line: lineTo, ch: 0 },
        { scroll: false }
      );
      lastGutterClick = 0;
    };
    return function(cm) {
      if (cm.options.inputStyle === "contenteditable") {
        cm.on("beforeSelectionChange", patchSelectAll);
      }
      cm.on("gutterClick", onGutterClicked);
    };
  }();
  self.uBlockDashboard.openOrSelectPage = function(url, options = {}) {
    let ev;
    if (url instanceof MouseEvent) {
      ev = url;
      url = dom.attr(ev.target, "href");
    }
    const details = Object.assign({ url, select: true, index: -1 }, options);
    vAPI.messaging.send("default", {
      what: "gotoURL",
      details
    });
    if (ev) {
      ev.preventDefault();
    }
  };
  dom.attr("a", "target", "_blank");
  dom.attr('a[href*="dashboard.html"]', "target", "_parent");

  // dynamic-net-filtering.ts
  var supportedDynamicTypes = /* @__PURE__ */ Object.create(null);
  Object.assign(supportedDynamicTypes, {
    "3p": true,
    "image": true,
    "inline-script": true,
    "1p-script": true,
    "3p-script": true,
    "3p-frame": true
  });
  var typeBitOffsets = /* @__PURE__ */ Object.create(null);
  Object.assign(typeBitOffsets, {
    "*": 0,
    "inline-script": 2,
    "1p-script": 4,
    "3p-script": 6,
    "3p-frame": 8,
    "image": 10,
    "3p": 12
  });
  var nameToActionMap = /* @__PURE__ */ Object.create(null);
  Object.assign(nameToActionMap, {
    "block": 1,
    "allow": 2,
    "noop": 3
  });
  var intToActionMap = /* @__PURE__ */ new Map([
    [1, "block"],
    [2, "allow"],
    [3, "noop"]
  ]);
  var reBadHostname = /[^0-9a-z_.[\]:%-]/;
  var reNotASCII = /[^\x20-\x7F]/;
  var decomposedSource = [];
  var decomposedDestination = [];
  function is3rdParty(srcHostname, desHostname) {
    if (desHostname === "*" || srcHostname === "*" || srcHostname === "") {
      return false;
    }
    const srcDomain = domainFromHostname(srcHostname) || srcHostname;
    if (desHostname.endsWith(srcDomain) === false) {
      return true;
    }
    return desHostname.length !== srcDomain.length && desHostname.charAt(desHostname.length - srcDomain.length - 1) !== ".";
  }
  var DynamicHostRuleFiltering = class _DynamicHostRuleFiltering {
    r;
    type;
    y;
    z;
    rules;
    changed;
    static magicId = 1;
    constructor() {
      this.reset();
    }
    reset() {
      this.r = 0;
      this.type = "";
      this.y = "";
      this.z = "";
      this.rules = /* @__PURE__ */ new Map();
      this.changed = false;
    }
    assign(other) {
      for (const k of this.rules.keys()) {
        if (other.rules.has(k) === false) {
          this.rules.delete(k);
          this.changed = true;
        }
      }
      for (const entry of other.rules) {
        if (this.rules.get(entry[0]) !== entry[1]) {
          this.rules.set(entry[0], entry[1]);
          this.changed = true;
        }
      }
    }
    copyRules(from, srcHostname, desHostnames) {
      let thisBits = this.rules.get("* *");
      let fromBits = from.rules.get("* *");
      if (fromBits !== thisBits) {
        if (fromBits !== void 0) {
          this.rules.set("* *", fromBits);
        } else {
          this.rules.delete("* *");
        }
        this.changed = true;
      }
      let key = `${srcHostname} *`;
      thisBits = this.rules.get(key);
      fromBits = from.rules.get(key);
      if (fromBits !== thisBits) {
        if (fromBits !== void 0) {
          this.rules.set(key, fromBits);
        } else {
          this.rules.delete(key);
        }
        this.changed = true;
      }
      for (const desHostname in desHostnames) {
        key = `* ${desHostname}`;
        thisBits = this.rules.get(key);
        fromBits = from.rules.get(key);
        if (fromBits !== thisBits) {
          if (fromBits !== void 0) {
            this.rules.set(key, fromBits);
          } else {
            this.rules.delete(key);
          }
          this.changed = true;
        }
        key = `${srcHostname} ${desHostname}`;
        thisBits = this.rules.get(key);
        fromBits = from.rules.get(key);
        if (fromBits !== thisBits) {
          if (fromBits !== void 0) {
            this.rules.set(key, fromBits);
          } else {
            this.rules.delete(key);
          }
          this.changed = true;
        }
      }
      return this.changed;
    }
    hasSameRules(other, srcHostname, desHostnames) {
      let key = "* *";
      if (this.rules.get(key) !== other.rules.get(key)) {
        return false;
      }
      key = `${srcHostname} *`;
      if (this.rules.get(key) !== other.rules.get(key)) {
        return false;
      }
      for (const desHostname in desHostnames) {
        key = `* ${desHostname}`;
        if (this.rules.get(key) !== other.rules.get(key)) {
          return false;
        }
        key = `${srcHostname} ${desHostname}`;
        if (this.rules.get(key) !== other.rules.get(key)) {
          return false;
        }
      }
      return true;
    }
    setCell(srcHostname, desHostname, type, state) {
      const bitOffset = typeBitOffsets[type];
      const k = `${srcHostname} ${desHostname}`;
      const oldBitmap = this.rules.get(k) || 0;
      const newBitmap = oldBitmap & ~(3 << bitOffset) | state << bitOffset;
      if (newBitmap === oldBitmap) {
        return false;
      }
      if (newBitmap === 0) {
        this.rules.delete(k);
      } else {
        this.rules.set(k, newBitmap);
      }
      this.changed = true;
      return true;
    }
    unsetCell(srcHostname, desHostname, type) {
      this.evaluateCellZY(srcHostname, desHostname, type);
      if (this.r === 0) {
        return false;
      }
      this.setCell(srcHostname, desHostname, type, 0);
      this.changed = true;
      return true;
    }
    evaluateCell(srcHostname, desHostname, type) {
      const key = `${srcHostname} ${desHostname}`;
      const bitmap = this.rules.get(key);
      if (bitmap === void 0) {
        return 0;
      }
      return bitmap >> typeBitOffsets[type] & 3;
    }
    clearRegisters() {
      this.r = 0;
      this.type = this.y = this.z = "";
      return this;
    }
    evaluateCellZ(srcHostname, desHostname, type) {
      decomposeHostname(srcHostname, decomposedSource);
      this.type = type;
      const bitOffset = typeBitOffsets[type];
      for (const srchn of decomposedSource) {
        this.z = srchn;
        let v = this.rules.get(`${srchn} ${desHostname}`);
        if (v === void 0) {
          continue;
        }
        v = v >>> bitOffset & 3;
        if (v === 0) {
          continue;
        }
        return this.r = v;
      }
      this.r = 0;
      return 0;
    }
    evaluateCellZY(srcHostname, desHostname, type) {
      if (desHostname === "") {
        this.r = 0;
        return 0;
      }
      decomposeHostname(desHostname, decomposedDestination);
      for (const deshn of decomposedDestination) {
        if (deshn === "*") {
          break;
        }
        this.y = deshn;
        if (this.evaluateCellZ(srcHostname, deshn, "*") !== 0) {
          return this.r;
        }
      }
      const thirdParty = is3rdParty(srcHostname, desHostname);
      this.y = "*";
      if (thirdParty) {
        if (type === "script") {
          if (this.evaluateCellZ(srcHostname, "*", "3p-script") !== 0) {
            return this.r;
          }
        } else if (type === "sub_frame" || type === "object") {
          if (this.evaluateCellZ(srcHostname, "*", "3p-frame") !== 0) {
            return this.r;
          }
        }
        if (this.evaluateCellZ(srcHostname, "*", "3p") !== 0) {
          return this.r;
        }
      } else if (type === "script") {
        if (this.evaluateCellZ(srcHostname, "*", "1p-script") !== 0) {
          return this.r;
        }
      }
      if (supportedDynamicTypes[type] !== void 0) {
        if (this.evaluateCellZ(srcHostname, "*", type) !== 0) {
          return this.r;
        }
        if (type.startsWith("3p-")) {
          if (this.evaluateCellZ(srcHostname, "*", "3p") !== 0) {
            return this.r;
          }
        }
      }
      if (this.evaluateCellZ(srcHostname, "*", "*") !== 0) {
        return this.r;
      }
      this.type = "";
      return 0;
    }
    mustAllowCellZY(srcHostname, desHostname, type) {
      return this.evaluateCellZY(srcHostname, desHostname, type) === 2;
    }
    mustBlockOrAllow() {
      return this.r === 1 || this.r === 2;
    }
    mustBlock() {
      return this.r === 1;
    }
    mustAbort() {
      return this.r === 3;
    }
    lookupRuleData(src, des, type) {
      const r = this.evaluateCellZY(src, des, type);
      if (r === 0) {
        return;
      }
      return `${this.z} ${this.y} ${this.type} ${r}`;
    }
    toLogData() {
      if (this.r === 0 || this.type === "") {
        return;
      }
      return {
        source: "dynamicHost",
        result: this.r,
        raw: `${this.z} ${this.y} ${this.type} ${intToActionMap.get(this.r)}`
      };
    }
    srcHostnameFromRule(rule) {
      return rule.slice(0, rule.indexOf(" "));
    }
    desHostnameFromRule(rule) {
      return rule.slice(rule.indexOf(" ") + 1);
    }
    toArray() {
      const out = [];
      for (const key of this.rules.keys()) {
        const srchn = this.srcHostnameFromRule(key);
        const deshn = this.desHostnameFromRule(key);
        const srchnPretty = srchn.includes("xn--") && punycode_default ? punycode_default.toUnicode(srchn) : srchn;
        const deshnPretty = deshn.includes("xn--") && punycode_default ? punycode_default.toUnicode(deshn) : deshn;
        for (const type in typeBitOffsets) {
          if (typeBitOffsets[type] === void 0) {
            continue;
          }
          const val = this.evaluateCell(srchn, deshn, type);
          if (val === 0) {
            continue;
          }
          const action = intToActionMap.get(val);
          if (action === void 0) {
            continue;
          }
          out.push(`${srchnPretty} ${deshnPretty} ${type} ${action}`);
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
      if (parts.length < 4) {
        return;
      }
      if (parts[0].endsWith(":")) {
        return;
      }
      if (parts[1].includes("/")) {
        return;
      }
      if (typeBitOffsets[parts[2]] === void 0) {
        return;
      }
      if (nameToActionMap[parts[3]] === void 0) {
        return;
      }
      if (parts[1] !== "*" && parts[2] !== "*") {
        return;
      }
      if (punycode_default !== void 0) {
        if (reNotASCII.test(parts[0])) {
          parts[0] = punycode_default.toASCII(parts[0]);
        }
        if (reNotASCII.test(parts[1])) {
          parts[1] = punycode_default.toASCII(parts[1]);
        }
      }
      if (parts[0] !== "*" && reBadHostname.test(parts[0]) || parts[1] !== "*" && reBadHostname.test(parts[1])) {
        return;
      }
      return parts;
    }
    addFromRuleParts(parts) {
      if (this.validateRuleParts(parts) !== void 0) {
        this.setCell(parts[0], parts[1], parts[2], nameToActionMap[parts[3]]);
        return true;
      }
      return false;
    }
    removeFromRuleParts(parts) {
      if (this.validateRuleParts(parts) !== void 0) {
        this.setCell(parts[0], parts[1], parts[2], 0);
        return true;
      }
      return false;
    }
    toSelfie() {
      return {
        magicId: _DynamicHostRuleFiltering.magicId,
        rules: Array.from(this.rules)
      };
    }
    fromSelfie(selfie) {
      if (selfie.magicId !== _DynamicHostRuleFiltering.magicId) {
        return false;
      }
      this.rules = new Map(selfie.rules);
      this.changed = true;
      return true;
    }
  };
  var dynamic_net_filtering_default = DynamicHostRuleFiltering;
})();
/*! Home: https://github.com/gorhill/publicsuffixlist.js -- GPLv3 APLv2 */
/*! https://mths.be/punycode v1.3.2 by @mathias */
