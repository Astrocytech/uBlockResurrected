(() => {
  // ../lib/publicsuffixlist/publicsuffixlist.js
  var publicsuffixlist_default = /* @__PURE__ */ (function() {
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
  })();

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

  // dynamic-net-filtering.js
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
  var DynamicHostRuleFiltering = class {
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
    // - *    *  type
    // - from *  type
    // - *    to *
    // - from to *
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
        magicId: this.magicId,
        rules: Array.from(this.rules)
      };
    }
    fromSelfie(selfie) {
      if (selfie.magicId !== this.magicId) {
        return false;
      }
      this.rules = new Map(selfie.rules);
      this.changed = true;
      return true;
    }
  };
  DynamicHostRuleFiltering.prototype.magicId = 1;
  var dynamic_net_filtering_default = DynamicHostRuleFiltering;
})();
/*! Home: https://github.com/gorhill/publicsuffixlist.js -- GPLv3 APLv2 */
/*! https://mths.be/punycode v1.3.2 by @mathias */
