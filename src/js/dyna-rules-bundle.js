(() => {
  // src/js/codemirror/ubo-dynamic-filtering.ts
  var validSwitches = /* @__PURE__ */ new Set([
    "no-strict-blocking:",
    "no-popups:",
    "no-cosmetic-filtering:",
    "no-remote-fonts:",
    "no-large-media:",
    "no-csp-reports:",
    "no-scripting:"
  ]);
  var validSwitcheStates = /* @__PURE__ */ new Set([
    "true",
    "false"
  ]);
  var validHnRuleTypes = /* @__PURE__ */ new Set([
    "*",
    "3p",
    "image",
    "inline-script",
    "1p-script",
    "3p-script",
    "3p-frame"
  ]);
  var invalidURLRuleTypes = /* @__PURE__ */ new Set([
    "doc",
    "main_frame"
  ]);
  var validActions = /* @__PURE__ */ new Set([
    "block",
    "allow",
    "noop"
  ]);
  var hnValidator = new URL(self.location.href);
  var reBadHn = /[%]|^\.|\.$/;
  var slices = [];
  var sliceIndex = 0;
  var sliceCount = 0;
  var hostnameToDomainMap = /* @__PURE__ */ new Map();
  var psl;
  var isValidHostname = (hnin) => {
    if (hnin === "*") {
      return true;
    }
    hnValidator.hostname = "_";
    try {
      hnValidator.hostname = hnin;
    } catch {
      return false;
    }
    const hnout = hnValidator.hostname;
    return hnout !== "_" && hnout !== "" && reBadHn.test(hnout) === false;
  };
  var addSlice = (len, style = null) => {
    let i = sliceCount;
    if (i === slices.length) {
      slices[i] = { len: 0, style: null };
    }
    const entry = slices[i];
    entry.len = len;
    entry.style = style;
    sliceCount += 1;
  };
  var addMatchSlice = (match, style = null) => {
    const len = match !== null ? match[0].length : 0;
    addSlice(len, style);
    return match !== null ? match.input.slice(len) : "";
  };
  var addMatchHnSlices = (match, style = null) => {
    const hn = match?.[0] ?? "";
    if (hn === "*") {
      return addMatchSlice(match, style);
    }
    let dn = hostnameToDomainMap.get(hn) || "";
    if (dn === "" && psl !== void 0) {
      dn = /(\d|\])$/.test(hn) ? hn : psl.getDomain(hn) || hn;
    }
    const entityBeg = hn.length - dn.length;
    if (entityBeg !== 0) {
      addSlice(entityBeg, style);
    }
    let entityEnd = dn.indexOf(".");
    if (entityEnd === -1) {
      entityEnd = dn.length;
    }
    addSlice(entityEnd, style !== null ? `${style} strong` : "strong");
    if (entityEnd < dn.length) {
      addSlice(dn.length - entityEnd, style);
    }
    return match?.input.slice(hn.length) ?? "";
  };
  var makeSlices = (stream, opts) => {
    sliceIndex = 0;
    sliceCount = 0;
    let { string } = stream;
    if (string === "...") {
      return;
    }
    const { sortType } = opts;
    const reNotToken = /^\s+/;
    const reToken = /^\S+/;
    const tokens = [];
    let match = reNotToken.exec(string);
    if (match !== null) {
      string = addMatchSlice(match);
    }
    match = reToken.exec(string);
    if (match === null) {
      return;
    }
    tokens.push(match[0]);
    const isSwitchRule = validSwitches.has(match[0]);
    if (isSwitchRule) {
      string = addMatchSlice(match, sortType === 0 ? "sortkey" : null);
    } else if (isValidHostname(match[0])) {
      if (sortType === 1) {
        string = addMatchHnSlices(match, "sortkey");
      } else {
        string = addMatchHnSlices(match, null);
      }
    } else {
      string = addMatchSlice(match, "error");
    }
    match = reNotToken.exec(string);
    if (match === null) {
      return;
    }
    string = addMatchSlice(match);
    match = reToken.exec(string);
    if (match === null) {
      return;
    }
    tokens.push(match[0]);
    const isURLRule = isSwitchRule === false && match[0].indexOf("://") > 0;
    if (isURLRule) {
      string = addMatchSlice(match, sortType === 2 ? "sortkey" : null);
    } else if (isValidHostname(match[0]) === false) {
      string = addMatchSlice(match, "error");
    } else if (sortType === 1 && isSwitchRule || sortType === 2) {
      string = addMatchHnSlices(match, "sortkey");
    } else {
      string = addMatchHnSlices(match, null);
    }
    match = reNotToken.exec(string);
    if (match === null) {
      return;
    }
    string = addMatchSlice(match);
    match = reToken.exec(string);
    if (match === null) {
      return;
    }
    tokens.push(match[0]);
    if (isSwitchRule) {
      string = validSwitcheStates.has(match[0]) ? addMatchSlice(match, match[0] === "true" ? "blockrule" : "allowrule") : addMatchSlice(match, "error");
    } else if (isURLRule) {
      string = invalidURLRuleTypes.has(match[0]) ? addMatchSlice(match, "error") : addMatchSlice(match);
    } else if (tokens[1] === "*") {
      string = validHnRuleTypes.has(match[0]) ? addMatchSlice(match) : addMatchSlice(match, "error");
    } else {
      string = match[0] === "*" ? addMatchSlice(match) : addMatchSlice(match, "error");
    }
    match = reNotToken.exec(string);
    if (match === null) {
      return;
    }
    string = addMatchSlice(match);
    match = reToken.exec(string);
    if (match === null) {
      return;
    }
    tokens.push(match[0]);
    string = isSwitchRule || validActions.has(match[0]) === false ? addMatchSlice(match, "error") : addMatchSlice(match, `${match[0]}rule`);
    match = reNotToken.exec(string);
    if (match === null) {
      return;
    }
    string = addMatchSlice(match);
    match = reToken.exec(string);
    if (match !== null) {
      string = addMatchSlice(null, "error");
    }
  };
  var token = function(stream) {
    if (stream.sol()) {
      makeSlices(stream, this);
    }
    if (sliceIndex >= sliceCount) {
      stream.skipToEnd(stream);
      return null;
    }
    const { len, style } = slices[sliceIndex++];
    if (len === 0) {
      stream.skipToEnd();
    } else {
      stream.pos += len;
    }
    return style ?? null;
  };
  CodeMirror.defineMode("ubo-dynamic-filtering", () => {
    return {
      token,
      sortType: 1,
      setHostnameToDomainMap: (a) => {
        hostnameToDomainMap = a;
      },
      setPSL: (a) => {
        psl = a;
      }
    };
  });

  // src/lib/publicsuffixlist/publicsuffixlist.js
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

  // src/js/dyna-rules.ts
  var fallbackText = /* @__PURE__ */ new Map([
    ["rulesHint", "Dynamic filtering rules for the current profile."],
    ["rulesPermanentHeader", "Permanent rules"],
    ["rulesTemporaryHeader", "Temporary rules"],
    ["rulesExport", "Export"],
    ["rulesRevert", "Revert"],
    ["rulesCommit", "Commit"],
    ["rulesImport", "Import"],
    ["rulesEditSave", "Apply changes"],
    ["rulesSort", "Sort"],
    ["rulesSortByType", "By type"],
    ["rulesSortBySource", "By source"],
    ["rulesSortByDestination", "By destination"],
    ["genericMergeViewScrollLock", "Synchronized scrolling"],
    ["rulesDefaultFileName", "ublock-my-rules_{{datetime}}.txt"]
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
  var setButtonDisabled = (selector, disabled) => {
    const button = document.querySelector(selector);
    if (button === null) {
      return;
    }
    button.disabled = disabled;
    button.classList.toggle("disabled", disabled);
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
  var getLocalStorage = async () => {
    return chrome.storage.local;
  };
  var savePresentationState = async (state) => {
    const storage = await getLocalStorage();
    await storage.set({ dynaRulesPresentationState: state });
  };
  var loadPresentationState = async () => {
    const storage = await getLocalStorage();
    const result = await storage.get("dynaRulesPresentationState");
    return result.dynaRulesPresentationState || {
      sortType: 0,
      isCollapsed: false,
      filter: ""
    };
  };
  var presentationState = {
    sortType: 0,
    isCollapsed: false,
    filter: ""
  };
  var hostnameToDomainMap2 = /* @__PURE__ */ new Map();
  var hostnameFromURI = (uri) => {
    let idx = uri.indexOf("://");
    if (idx !== -1) {
      uri = uri.slice(idx + 3);
    }
    idx = uri.indexOf("/");
    if (idx !== -1) {
      uri = uri.slice(0, idx);
    }
    idx = uri.indexOf(":");
    if (idx !== -1) {
      uri = uri.slice(0, idx);
    }
    return uri;
  };
  var sortNormalizeHn = (hn) => {
    let domain = hostnameToDomainMap2.get(hn);
    if (domain === void 0) {
      domain = /(\d|\])$/.test(hn) ? hn : publicsuffixlist_default.getDomain(hn);
      hostnameToDomainMap2.set(hn, domain);
    }
    let normalized = domain || hn;
    if (hn.length !== (domain?.length || 0)) {
      const subdomains = hn.slice(0, hn.length - (domain?.length || 0) - 1);
      normalized += "." + (subdomains.includes(".") ? subdomains.split(".").reverse().join(".") : subdomains);
    }
    return normalized;
  };
  var reSwRule = /^([^/]+): ([^/ ]+) ([^ ]+)/;
  var reRule = /^([^ ]+) ([^/ ]+) ([^ ]+ [^ ]+)/;
  var reUrlRule = /^([^ ]+) ([^ ]+) ([^ ]+ [^ ]+)/;
  var getRuleToken = (rule, sortType) => {
    let type = "", srcHn = "", desHn = "", extra = "";
    let match = reSwRule.exec(rule);
    if (match !== null) {
      type = " " + match[1];
      srcHn = sortNormalizeHn(match[2]);
      desHn = srcHn;
      extra = match[3];
    } else if ((match = reRule.exec(rule)) !== null) {
      type = "FFFE";
      srcHn = sortNormalizeHn(match[1]);
      desHn = sortNormalizeHn(match[2]);
      extra = match[3];
    } else if ((match = reUrlRule.exec(rule)) !== null) {
      type = "FFFF";
      srcHn = sortNormalizeHn(match[1]);
      desHn = sortNormalizeHn(hostnameFromURI(match[2]));
      extra = match[3];
    }
    if (sortType === 0) {
      return `${type} ${srcHn} ${desHn} ${extra}`;
    } else if (sortType === 1) {
      return `${srcHn} ${type} ${desHn} ${extra}`;
    }
    return `${desHn} ${type} ${srcHn} ${extra}`;
  };
  var filterRules = (rules, filter) => {
    if (filter === "") {
      return rules;
    }
    return rules.filter((rule) => rule.indexOf(filter) !== -1);
  };
  var collapseRules = (permanentRules, sessionRules, isCollapsed) => {
    if (!isCollapsed) {
      return { permanent: permanentRules, session: sessionRules };
    }
    const differ = getDiffer();
    const diffs = differ.diff_main(
      permanentRules.join("\n"),
      sessionRules.join("\n")
    );
    const ll = [];
    const rr = [];
    let lellipsis = false;
    let rellipsis = false;
    for (let i = 0; i < diffs.length; i++) {
      const diff = diffs[i];
      if (diff[0] === 0) {
        lellipsis = rellipsis = true;
        continue;
      }
      if (diff[0] === -1) {
        if (lellipsis) {
          ll.push("...");
          if (rellipsis) {
            rr.push("...");
          }
          lellipsis = rellipsis = false;
        }
        ll.push(diff[1].trim());
        continue;
      }
      if (diff[0] === 1) {
        if (rellipsis) {
          rr.push("...");
          if (lellipsis) {
            ll.push("...");
          }
          lellipsis = rellipsis = false;
        }
        rr.push(diff[1].trim());
      }
    }
    if (lellipsis) {
      ll.push("...");
    }
    if (rellipsis) {
      rr.push("...");
    }
    return { permanent: ll, session: rr };
  };
  var getDiffer = /* @__PURE__ */ (() => {
    let differ;
    return () => {
      if (differ === void 0) {
        differ = new diff_match_patch();
      }
      return differ;
    };
  })();
  var mergeView = new CodeMirror.MergeView(
    document.querySelector(".codeMirrorMergeContainer"),
    {
      allowEditingOriginals: true,
      connect: "align",
      inputStyle: "contenteditable",
      lineNumbers: true,
      lineWrapping: false,
      origLeft: "",
      revertButtons: true,
      value: ""
    }
  );
  mergeView.editor().setOption("styleActiveLine", true);
  mergeView.editor().setOption("lineNumbers", false);
  mergeView.leftOriginal().setOption("readOnly", "nocursor");
  if (typeof uBlockDashboard !== "undefined") {
    uBlockDashboard.patchCodeMirrorEditor(mergeView.editor());
  }
  var thePanes = {
    orig: {
      doc: mergeView.leftOriginal(),
      original: [],
      modified: []
    },
    edit: {
      doc: mergeView.editor(),
      original: [],
      modified: []
    }
  };
  var cleanEditToken = 0;
  var cleanEditText = "";
  var leftEditor = mergeView.leftOriginal();
  var rightEditor = mergeView.editor();
  var filterTimeout;
  var updateOverlay = /* @__PURE__ */ (() => {
    let reFilter;
    const mode = {
      token: function(stream) {
        if (reFilter !== void 0) {
          reFilter.lastIndex = stream.pos;
          let match = reFilter.exec(stream.string);
          if (match !== null) {
            if (match.index === stream.pos) {
              stream.pos += match[0].length || 1;
              return "searching";
            }
            stream.pos = match.index;
            return;
          }
        }
        stream.skipToEnd();
      }
    };
    return () => {
      const f = presentationState.filter;
      reFilter = typeof f === "string" && f !== "" ? new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") : void 0;
      return mode;
    };
  })();
  var toggleOverlay = /* @__PURE__ */ (() => {
    let overlay = null;
    return () => {
      if (overlay !== null) {
        mergeView.leftOriginal().removeOverlay(overlay);
        mergeView.editor().removeOverlay(overlay);
        overlay = null;
      }
      if (presentationState.filter !== "") {
        overlay = updateOverlay();
        mergeView.leftOriginal().addOverlay(overlay);
        mergeView.editor().addOverlay(overlay);
      }
      rulesToDoc(true);
      savePresentationState(presentationState);
    };
  })();
  var rulesToDoc = (clearHistory) => {
    const orig = thePanes.orig.doc;
    const edit = thePanes.edit.doc;
    orig.startOperation();
    edit.startOperation();
    for (const key in thePanes) {
      if (Object.hasOwn(thePanes, key) === false) {
        continue;
      }
      const keyStr = key;
      const doc = thePanes[keyStr].doc;
      const rules = filterRules(thePanes[keyStr].modified, presentationState.filter);
      if (clearHistory || doc.lineCount() === 1 && doc.getValue() === "" || rules.length === 0) {
        doc.setValue(rules.length !== 0 ? rules.join("\n") + "\n" : "");
        continue;
      }
      let beforeText = doc.getValue();
      let afterText = rules.join("\n").trim();
      if (afterText !== "") {
        afterText += "\n";
      }
      const differ = getDiffer();
      const diffs = differ.diff_main(beforeText, afterText);
      let i = diffs.length;
      let iedit = beforeText.length;
      while (i--) {
        const diff = diffs[i];
        if (diff[0] === 0) {
          iedit -= diff[1].length;
          continue;
        }
        const end = doc.posFromIndex(iedit);
        if (diff[0] === 1) {
          doc.replaceRange(diff[1], end, end);
          continue;
        }
        iedit -= diff[1].length;
        const beg = doc.posFromIndex(iedit);
        doc.replaceRange("", beg, end);
      }
    }
    const marks = edit.getAllMarks();
    for (const mark of marks) {
      if (mark.uboEllipsis !== true) {
        continue;
      }
      mark.clear();
    }
    if (presentationState.isCollapsed) {
      for (let iline = 0, n = edit.lineCount(); iline < n; iline++) {
        if (edit.getLine(iline) !== "...") {
          continue;
        }
        const mark = edit.markText(
          { line: iline, ch: 0 },
          { line: iline + 1, ch: 0 },
          { atomic: true, readOnly: true }
        );
        mark.uboEllipsis = true;
      }
    }
    orig.endOperation();
    edit.endOperation();
    cleanEditText = mergeView.editor().getValue().trim();
    cleanEditToken = mergeView.editor().changeGeneration();
    if (clearHistory !== true) {
      return;
    }
    mergeView.editor().clearHistory();
    const chunks = mergeView.leftChunks();
    if (chunks.length === 0) {
      return;
    }
    const ldoc = thePanes.orig.doc;
    const { clientHeight } = ldoc.getScrollInfo();
    const line = Math.min(chunks[0].editFrom, chunks[0].origFrom);
    ldoc.setCursor(line, 0);
    ldoc.scrollIntoView(
      { line, ch: 0 },
      (clientHeight - ldoc.defaultTextHeight()) / 2
    );
  };
  var onPresentationChanged = (clearHistory = true) => {
    const origPane = thePanes.orig;
    const editPane = thePanes.edit;
    origPane.modified = origPane.original.slice();
    editPane.modified = editPane.original.slice();
    {
      const mode = origPane.doc.getMode();
      mode.sortType = presentationState.sortType;
      mode.setHostnameToDomainMap(hostnameToDomainMap2);
      mode.setPSL(publicsuffixlist_default);
    }
    {
      const mode = editPane.doc.getMode();
      mode.sortType = presentationState.sortType;
      mode.setHostnameToDomainMap(hostnameToDomainMap2);
      mode.setPSL(publicsuffixlist_default);
    }
    sortRulesInPlace(origPane.modified, presentationState.sortType);
    sortRulesInPlace(editPane.modified, presentationState.sortType);
    if (presentationState.isCollapsed) {
      const collapsed = collapseRules(origPane.modified, editPane.modified, true);
      origPane.modified = collapsed.permanent;
      editPane.modified = collapsed.session;
    }
    rulesToDoc(clearHistory);
    onTextChanged(clearHistory);
  };
  var sortRulesInPlace = (rules, sortType) => {
    const slots = [];
    for (const rule of rules) {
      slots.push({ rule, token: getRuleToken(rule, sortType) });
    }
    slots.sort((a, b) => a.token.localeCompare(b.token));
    for (let i = 0; i < rules.length; i++) {
      rules[i] = slots[i].rule;
    }
  };
  var onTextChanged = /* @__PURE__ */ (() => {
    let timer;
    const process = (details) => {
      timer = void 0;
      const diff = document.getElementById("diff");
      let isClean = mergeView.editor().isClean(cleanEditToken);
      if (details === void 0 && isClean === false && mergeView.editor().getValue().trim() === cleanEditText) {
        cleanEditToken = mergeView.editor().changeGeneration();
        isClean = true;
      }
      const isDirty = mergeView.leftChunks().length !== 0;
      document.body?.classList.toggle("editing", !isClean);
      diff?.classList.toggle("dirty", isDirty);
      setButtonDisabled("#editSaveButton", isClean);
      setButtonDisabled("#exportButton", isClean === false);
      setButtonDisabled("#importButton", isClean === false);
      setButtonDisabled("#revertButton", isClean === false || isDirty === false);
      setButtonDisabled("#commitButton", isClean === false || isDirty === false);
      const input = document.querySelector("#ruleFilter input");
      if (isClean) {
        input?.removeAttribute("disabled");
        CodeMirror.commands.save = void 0;
      } else {
        input?.setAttribute("disabled", "");
        CodeMirror.commands.save = editSaveHandler;
      }
    };
    return function onTextChanged2(now) {
      if (timer !== void 0) {
        self.clearTimeout(timer);
      }
      timer = now ? process() : self.setTimeout(process, 57);
    };
  })();
  var editSaveHandler = () => {
    const editor = mergeView.editor();
    const editText = editor.getValue().trim();
    if (editText === cleanEditText) {
      onTextChanged(true);
      return;
    }
    const toAdd = [];
    const toRemove = [];
    const differ = getDiffer();
    const diffs = differ.diff_main(cleanEditText, editText);
    for (const diff of diffs) {
      if (diff[0] === 1) {
        toAdd.push(diff[1]);
      } else if (diff[0] === -1) {
        toRemove.push(diff[1]);
      }
    }
    applyDiff(false, toAdd.join(""), toRemove.join(""));
  };
  var revertAllHandler = () => {
    const toAdd = [];
    const toRemove = [];
    const left = mergeView.leftOriginal();
    const edit = mergeView.editor();
    for (const chunk of mergeView.leftChunks()) {
      const addedLines = left.getRange(
        { line: chunk.origFrom, ch: 0 },
        { line: chunk.origTo, ch: 0 }
      );
      const removedLines = edit.getRange(
        { line: chunk.editFrom, ch: 0 },
        { line: chunk.editTo, ch: 0 }
      );
      toAdd.push(addedLines.trim());
      toRemove.push(removedLines.trim());
    }
    applyDiff(false, toAdd.join("\n"), toRemove.join("\n"));
  };
  var commitAllHandler = () => {
    const toAdd = [];
    const toRemove = [];
    const left = mergeView.leftOriginal();
    const edit = mergeView.editor();
    for (const chunk of mergeView.leftChunks()) {
      const addedLines = edit.getRange(
        { line: chunk.editFrom, ch: 0 },
        { line: chunk.editTo, ch: 0 }
      );
      const removedLines = left.getRange(
        { line: chunk.origFrom, ch: 0 },
        { line: chunk.origTo, ch: 0 }
      );
      toAdd.push(addedLines.trim());
      toRemove.push(removedLines.trim());
    }
    applyDiff(true, toAdd.join("\n"), toRemove.join("\n"));
  };
  mergeView.options.revertChunk = function(mv, from, fromStart, fromEnd, to, toStart, toEnd) {
    const dir = document.body?.getAttribute("dir");
    if (dir === "rtl") {
      let tmp = from;
      from = to;
      to = tmp;
      tmp = fromStart;
      fromStart = toStart;
      toStart = tmp;
      tmp = fromEnd;
      fromEnd = toEnd;
      toEnd = tmp;
    }
    if (typeof fromStart.ch !== "number") {
      fromStart.ch = 0;
    }
    if (fromEnd.ch !== 0) {
      fromEnd.line += 1;
    }
    const toAdd = from.getRange(
      { line: fromStart.line, ch: 0 },
      { line: fromEnd.line, ch: 0 }
    );
    if (typeof toStart.ch !== "number") {
      toStart.ch = 0;
    }
    if (toEnd.ch !== 0) {
      toEnd.line += 1;
    }
    const toRemove = to.getRange(
      { line: toStart.line, ch: 0 },
      { line: toEnd.line, ch: 0 }
    );
    applyDiff(from === mv.editor(), toAdd, toRemove);
  };
  var applyDiff = async (permanent, toAdd, toRemove) => {
    const details = await sendMessage("dashboardModifyRuleset", {
      permanent,
      toAdd,
      toRemove
    });
    thePanes.orig.original = Array.isArray(details?.permanentRules) ? details.permanentRules : [];
    thePanes.edit.original = Array.isArray(details?.sessionRules) ? details.sessionRules : [];
    onPresentationChanged();
  };
  var exportRules = () => {
    const text = mergeView.leftOriginal().getValue().trim();
    if (text === "") {
      return;
    }
    const filename = (fallbackText.get("rulesDefaultFileName") || "my-rules.txt").replace("{{datetime}}", (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-")).replace(/ +/g, "_");
    const blob = new Blob([`${text}
`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    self.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1e3);
  };
  var importPicker = document.getElementById("importFilePicker");
  var importRules = () => {
    if (importPicker) {
      importPicker.value = "";
    }
    importPicker?.click();
  };
  var handleImportFile = () => {
    const file = importPicker?.files?.[0];
    if (file === void 0 || file.name === "") {
      return;
    }
    if (file.type.indexOf("text") !== 0) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || reader.result === "") {
        return;
      }
      let result = reader.result;
      const matches = /\[origins-to-destinations\]([^[]+)/.exec(result);
      if (matches && matches.length === 2) {
        result = matches[1].trim().replace(/\|/g, " ").replace(/\n/g, " * noop\n");
      }
      applyDiff(false, result, "");
    };
    reader.readAsText(file);
  };
  var handleFilterInput = () => {
    if (filterTimeout !== void 0) {
      self.clearTimeout(filterTimeout);
    }
    filterTimeout = self.setTimeout(() => {
      const filterInput = document.querySelector("#ruleFilter input");
      const newFilter = filterInput?.value || "";
      if (filterInput) {
        filterInput.removeAttribute("disabled");
      }
      presentationState.filter = newFilter;
      savePresentationState(presentationState);
      toggleOverlay();
    }, 300);
  };
  var handleSortChange = () => {
    const select = document.querySelector("#ruleFilter select");
    presentationState.sortType = parseInt(select?.value || "0", 10);
    savePresentationState(presentationState);
    onPresentationChanged(true);
  };
  var handleCollapseClick = () => {
    const collapseBtn = document.querySelector("#diffCollapse");
    presentationState.isCollapsed = !presentationState.isCollapsed;
    collapseBtn?.classList.toggle("active", presentationState.isCollapsed);
    savePresentationState(presentationState);
    onPresentationChanged(true);
  };
  document.getElementById("editSaveButton")?.addEventListener("click", () => {
    void editSaveHandler();
  });
  document.getElementById("commitButton")?.addEventListener("click", () => {
    void commitAllHandler();
  });
  document.getElementById("revertButton")?.addEventListener("click", () => {
    void revertAllHandler();
  });
  document.getElementById("exportButton")?.addEventListener("click", exportRules);
  document.getElementById("importButton")?.addEventListener("click", importRules);
  importPicker?.addEventListener("change", handleImportFile);
  document.querySelector("#ruleFilter input")?.addEventListener("input", handleFilterInput);
  document.querySelector("#ruleFilter select")?.addEventListener("input", handleSortChange);
  document.getElementById("diffCollapse")?.addEventListener("click", handleCollapseClick);
  rightEditor.on("changes", () => {
    onTextChanged();
  });
  rightEditor.on("updateDiff", () => {
    onTextChanged();
  });
  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "s") {
      ev.preventDefault();
      void editSaveHandler();
    }
  });
  var initPresentationState = async () => {
    const savedState = await loadPresentationState();
    presentationState.sortType = savedState.sortType;
    presentationState.isCollapsed = savedState.isCollapsed;
    presentationState.filter = savedState.filter;
    const filterInput = document.querySelector("#ruleFilter input");
    if (filterInput) {
      filterInput.value = savedState.filter;
    }
    const sortSelect = document.querySelector("#ruleFilter select");
    if (sortSelect) {
      sortSelect.value = savedState.sortType.toString();
    }
    const collapseBtn = document.querySelector("#diffCollapse");
    if (collapseBtn && savedState.isCollapsed) {
      collapseBtn.classList.add("active");
    }
    if (savedState.filter !== "") {
      toggleOverlay();
    }
  };
  var cloudPushHandler = () => {
    return thePanes.orig.original.join("\n");
  };
  var cloudPullHandler = (data, append) => {
    if (typeof data !== "string") {
      return;
    }
    applyDiff(
      false,
      data,
      append ? "" : mergeView.editor().getValue().trim()
    );
  };
  if (typeof self !== "undefined") {
    self.cloud = {
      onPush: cloudPushHandler,
      onPull: cloudPullHandler
    };
    self.wikilink = "https://github.com/gorhill/uBlock/wiki/Dashboard:-My-rules";
    self.hasUnsavedData = () => {
      return mergeView.editor().isClean(cleanEditToken) === false;
    };
  }
  applyThemeClasses();
  applyFallbackTranslations();
  void initPresentationState().then(() => {
    void sendMessage("dashboardGetRules").then((details) => {
      thePanes.orig.original = Array.isArray(details?.permanentRules) ? details.permanentRules : [];
      thePanes.edit.original = Array.isArray(details?.sessionRules) ? details.sessionRules : [];
      if (details?.pslSelfie) {
        publicsuffixlist_default.fromSelfie(details.pslSelfie);
      }
      onPresentationChanged(true);
    });
  });
})();
/*! Home: https://github.com/gorhill/publicsuffixlist.js -- GPLv3 APLv2 */
