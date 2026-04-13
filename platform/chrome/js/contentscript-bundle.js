(() => {
  // src/js/contentscript.ts
  if (typeof vAPI === "object" && !vAPI.contentScript) {
    vAPI.contentScript = true;
    {
      let context = self;
      try {
        while (context !== self.top && context.location.href.startsWith("about:blank") && context.parent.location.href) {
          context = context.parent;
        }
      } catch {
      }
      vAPI.effectiveSelf = context;
    }
    vAPI.userStylesheet = {
      added: /* @__PURE__ */ new Set(),
      removed: /* @__PURE__ */ new Set(),
      apply: function(callback) {
        if (this.added.size === 0 && this.removed.size === 0) {
          return;
        }
        vAPI.messaging.send("vapi", {
          what: "userCSS",
          add: Array.from(this.added),
          remove: Array.from(this.removed)
        }).then(() => {
          if (callback instanceof Function === false) {
            return;
          }
          callback();
        });
        this.added.clear();
        this.removed.clear();
      },
      add: function(cssText, now) {
        if (cssText === "") {
          return;
        }
        this.added.add(cssText);
        if (now) {
          this.apply();
        }
      },
      remove: function(cssText, now) {
        if (cssText === "") {
          return;
        }
        this.removed.add(cssText);
        if (now) {
          this.apply();
        }
      }
    };
    vAPI.SafeAnimationFrame = class {
      constructor(callback) {
        this.fid = this.tid = void 0;
        this.callback = callback;
      }
      start(delay) {
        if (self.vAPI instanceof Object === false) {
          return;
        }
        if (delay === void 0) {
          if (this.fid === void 0) {
            this.fid = requestAnimationFrame(() => {
              this.onRAF();
            });
          }
          if (this.tid === void 0) {
            this.tid = vAPI.setTimeout(() => {
              this.onSTO();
            }, 2e4);
          }
          return;
        }
        if (this.fid === void 0 && this.tid === void 0) {
          this.tid = vAPI.setTimeout(() => {
            this.macroToMicro();
          }, delay);
        }
      }
      clear() {
        if (this.fid !== void 0) {
          cancelAnimationFrame(this.fid);
          this.fid = void 0;
        }
        if (this.tid !== void 0) {
          clearTimeout(this.tid);
          this.tid = void 0;
        }
      }
      macroToMicro() {
        this.tid = void 0;
        this.start();
      }
      onRAF() {
        if (this.tid !== void 0) {
          clearTimeout(this.tid);
          this.tid = void 0;
        }
        this.fid = void 0;
        this.callback();
      }
      onSTO() {
        if (this.fid !== void 0) {
          cancelAnimationFrame(this.fid);
          this.fid = void 0;
        }
        this.tid = void 0;
        this.callback();
      }
    };
    {
      const newEvents = /* @__PURE__ */ new Set();
      const allEvents = /* @__PURE__ */ new Set();
      let timer;
      const send = function() {
        if (self.vAPI instanceof Object === false) {
          return;
        }
        vAPI.messaging.send("scriptlets", {
          what: "securityPolicyViolation",
          type: "net",
          docURL: document.location.href,
          violations: Array.from(newEvents)
        }).then((response) => {
          if (response === true) {
            return;
          }
          stop();
        });
        for (const event of newEvents) {
          allEvents.add(event);
        }
        newEvents.clear();
      };
      const sendAsync = function() {
        if (timer !== void 0) {
          return;
        }
        timer = self.requestIdleCallback(
          () => {
            timer = void 0;
            send();
          },
          { timeout: 2063 }
        );
      };
      const listener = function(ev) {
        if (ev.isTrusted !== true) {
          return;
        }
        if (ev.disposition !== "enforce") {
          return;
        }
        const json = JSON.stringify({
          url: ev.blockedURL || ev.blockedURI,
          policy: ev.originalPolicy,
          directive: ev.effectiveDirective || ev.violatedDirective
        });
        if (allEvents.has(json)) {
          return;
        }
        newEvents.add(json);
        sendAsync();
      };
      const stop = function() {
        newEvents.clear();
        allEvents.clear();
        if (timer !== void 0) {
          self.cancelIdleCallback(timer);
          timer = void 0;
        }
        document.removeEventListener("securitypolicyviolation", listener);
        if (vAPI) {
          vAPI.shutdown.remove(stop);
        }
      };
      document.addEventListener("securitypolicyviolation", listener);
      vAPI.shutdown.add(stop);
      sendAsync();
    }
    {
      vAPI.domMutationTime = Date.now();
      const addedNodeLists = [];
      const removedNodeLists = [];
      const addedNodes = [];
      const ignoreTags = /* @__PURE__ */ new Set(["br", "head", "link", "meta", "script", "style"]);
      const listeners = [];
      let domLayoutObserver;
      let listenerIterator = [];
      let listenerIteratorDirty = false;
      let removedNodes = false;
      let safeObserverHandlerTimer;
      const safeObserverHandler = function() {
        let i = addedNodeLists.length;
        while (i--) {
          const nodeList = addedNodeLists[i];
          let iNode = nodeList.length;
          while (iNode--) {
            const node = nodeList[iNode];
            if (node.nodeType !== 1) {
              continue;
            }
            if (ignoreTags.has(node.localName)) {
              continue;
            }
            if (node.parentElement === null) {
              continue;
            }
            addedNodes.push(node);
          }
        }
        addedNodeLists.length = 0;
        i = removedNodeLists.length;
        while (i-- && removedNodes === false) {
          const nodeList = removedNodeLists[i];
          let iNode = nodeList.length;
          while (iNode--) {
            if (nodeList[iNode].nodeType !== 1) {
              continue;
            }
            removedNodes = true;
            break;
          }
        }
        removedNodeLists.length = 0;
        if (addedNodes.length === 0 && removedNodes === false) {
          return;
        }
        for (const listener of getListenerIterator()) {
          try {
            listener.onDOMChanged(addedNodes, removedNodes);
          } catch {
          }
        }
        addedNodes.length = 0;
        removedNodes = false;
        vAPI.domMutationTime = Date.now();
      };
      const observerHandler = function(mutations) {
        let i = mutations.length;
        while (i--) {
          const mutation = mutations[i];
          if (mutation.addedNodes.length !== 0) {
            addedNodeLists.push(mutation.addedNodes);
          }
          if (mutation.removedNodes.length !== 0) {
            removedNodeLists.push(mutation.removedNodes);
          }
        }
        if (addedNodeLists.length !== 0 || removedNodeLists.length !== 0) {
          safeObserverHandlerTimer.start(
            addedNodeLists.length < 100 ? 1 : void 0
          );
        }
      };
      const startMutationObserver = function() {
        if (domLayoutObserver !== void 0) {
          return;
        }
        domLayoutObserver = new MutationObserver(observerHandler);
        domLayoutObserver.observe(document, {
          childList: true,
          subtree: true
        });
        safeObserverHandlerTimer = new vAPI.SafeAnimationFrame(safeObserverHandler);
        vAPI.shutdown.add(cleanup);
      };
      const stopMutationObserver = function() {
        if (domLayoutObserver === void 0) {
          return;
        }
        cleanup();
        vAPI.shutdown.remove(cleanup);
      };
      const getListenerIterator = function() {
        if (listenerIteratorDirty) {
          listenerIterator = listeners.slice();
          listenerIteratorDirty = false;
        }
        return listenerIterator;
      };
      const addListener = function(listener) {
        if (listeners.indexOf(listener) !== -1) {
          return;
        }
        listeners.push(listener);
        listenerIteratorDirty = true;
        if (domLayoutObserver === void 0) {
          return;
        }
        try {
          listener.onDOMCreated();
        } catch {
        }
        startMutationObserver();
      };
      const removeListener = function(listener) {
        const pos = listeners.indexOf(listener);
        if (pos === -1) {
          return;
        }
        listeners.splice(pos, 1);
        listenerIteratorDirty = true;
        if (listeners.length === 0) {
          stopMutationObserver();
        }
      };
      const cleanup = function() {
        if (domLayoutObserver !== void 0) {
          domLayoutObserver.disconnect();
          domLayoutObserver = void 0;
        }
        if (safeObserverHandlerTimer !== void 0) {
          safeObserverHandlerTimer.clear();
          safeObserverHandlerTimer = void 0;
        }
      };
      const start = function() {
        for (const listener of getListenerIterator()) {
          try {
            listener.onDOMCreated();
          } catch {
          }
        }
        startMutationObserver();
      };
      vAPI.domWatcher = { start, addListener, removeListener };
    }
    vAPI.hideStyle = "display:none!important;";
    vAPI.DOMFilterer = class {
      constructor() {
        this.commitTimer = new vAPI.SafeAnimationFrame(
          () => {
            this.commitNow();
          }
        );
        this.disabled = false;
        this.listeners = [];
        this.stylesheets = [];
        this.exceptedCSSRules = [];
        this.exceptions = [];
        this.convertedProceduralFilters = [];
        this.proceduralFilterer = null;
      }
      explodeCSS(css) {
        const out = [];
        const cssHide = `{${vAPI.hideStyle}}`;
        const blocks = css.trim().split(/\n\n+/);
        for (const block of blocks) {
          if (block.endsWith(cssHide) === false) {
            continue;
          }
          out.push(block.slice(0, -cssHide.length).trim());
        }
        return out;
      }
      addCSS(css, details = {}) {
        if (typeof css !== "string" || css.length === 0) {
          return;
        }
        if (this.stylesheets.includes(css)) {
          return;
        }
        this.stylesheets.push(css);
        if (details.mustInject && this.disabled === false) {
          vAPI.userStylesheet.add(css);
        }
        if (this.hasListeners() === false) {
          return;
        }
        if (details.silent) {
          return;
        }
        this.triggerListeners({ declarative: this.explodeCSS(css) });
      }
      exceptCSSRules(exceptions) {
        if (exceptions.length === 0) {
          return;
        }
        this.exceptedCSSRules.push(...exceptions);
        if (this.hasListeners()) {
          this.triggerListeners({ exceptions });
        }
      }
      addListener(listener) {
        if (this.listeners.indexOf(listener) !== -1) {
          return;
        }
        this.listeners.push(listener);
      }
      removeListener(listener) {
        const pos = this.listeners.indexOf(listener);
        if (pos === -1) {
          return;
        }
        this.listeners.splice(pos, 1);
      }
      hasListeners() {
        return this.listeners.length !== 0;
      }
      triggerListeners(changes) {
        for (const listener of this.listeners) {
          listener.onFiltersetChanged(changes);
        }
      }
      toggle(state, callback) {
        if (state === void 0) {
          state = this.disabled;
        }
        if (state !== this.disabled) {
          return;
        }
        this.disabled = !state;
        const uss = vAPI.userStylesheet;
        for (const css of this.stylesheets) {
          if (this.disabled) {
            uss.remove(css);
          } else {
            uss.add(css);
          }
        }
        uss.apply(callback);
      }
      // Here we will deal with:
      // - Injecting low priority user styles;
      // - Notifying listeners about changed filterset.
      // https://www.reddit.com/r/uBlockOrigin/comments/9jj0y1/no_longer_blocking_ads/
      //   Ensure vAPI is still valid -- it can go away by the time we are
      //   called, since the port could be force-disconnected from the main
      //   process. Another approach would be to have vAPI.SafeAnimationFrame
      //   register a shutdown job: to evaluate. For now I will keep the fix
      //   trivial.
      commitNow() {
        this.commitTimer.clear();
        if (vAPI instanceof Object === false) {
          return;
        }
        vAPI.userStylesheet.apply();
        if (this.proceduralFilterer instanceof Object) {
          this.proceduralFilterer.commitNow();
        }
      }
      commit(commitNow) {
        if (commitNow) {
          this.commitTimer.clear();
          this.commitNow();
        } else {
          this.commitTimer.start();
        }
      }
      proceduralFiltererInstance() {
        if (this.proceduralFilterer instanceof Object === false) {
          if (vAPI.DOMProceduralFilterer instanceof Object === false) {
            return null;
          }
          this.proceduralFilterer = new vAPI.DOMProceduralFilterer(this);
        }
        return this.proceduralFilterer;
      }
      addProceduralSelectors(selectors) {
        const procedurals = [];
        for (const raw of selectors) {
          procedurals.push(JSON.parse(raw));
        }
        if (procedurals.length === 0) {
          return;
        }
        const pfilterer = this.proceduralFiltererInstance();
        if (pfilterer !== null) {
          pfilterer.addProceduralSelectors(procedurals);
        }
      }
      createProceduralFilter(o) {
        const pfilterer = this.proceduralFiltererInstance();
        if (pfilterer === null) {
          return;
        }
        return pfilterer.createProceduralFilter(o);
      }
      getAllSelectors(bits = 0) {
        const out = {
          declarative: [],
          exceptions: this.exceptedCSSRules
        };
        const hasProcedural = this.proceduralFilterer instanceof Object;
        const includePrivateSelectors = (bits & 1) !== 0;
        const masterToken = hasProcedural ? `[${this.proceduralFilterer.masterToken}]` : void 0;
        for (const css of this.stylesheets) {
          for (const block of this.explodeCSS(css)) {
            if (includePrivateSelectors === false && masterToken !== void 0 && block.startsWith(masterToken)) {
              continue;
            }
            out.declarative.push(block);
          }
        }
        const excludeProcedurals = (bits & 2) !== 0;
        if (excludeProcedurals === false) {
          out.procedural = [];
          if (hasProcedural) {
            out.procedural.push(
              ...this.proceduralFilterer.selectors.values()
            );
          }
          const proceduralFilterer = this.proceduralFiltererInstance();
          if (proceduralFilterer !== null) {
            for (const json of this.convertedProceduralFilters) {
              const pfilter = proceduralFilterer.createProceduralFilter(json);
              pfilter.converted = true;
              out.procedural.push(pfilter);
            }
          }
        }
        return out;
      }
      getAllExceptionSelectors() {
        return this.exceptions.join(",\n");
      }
    };
    {
      const messaging = vAPI.messaging;
      const toCollapse = /* @__PURE__ */ new Map();
      const src1stProps = {
        audio: "currentSrc",
        embed: "src",
        iframe: "src",
        img: "currentSrc",
        object: "data",
        video: "currentSrc"
      };
      const src2ndProps = {
        audio: "src",
        img: "src",
        video: "src"
      };
      const tagToTypeMap = {
        audio: "media",
        embed: "object",
        iframe: "sub_frame",
        img: "image",
        object: "object",
        video: "media"
      };
      let requestIdGenerator = 1, processTimer, cachedBlockedSet, cachedBlockedSetHash, cachedBlockedSetTimer, toProcess = [], toFilter = [], netSelectorCacheCount = 0;
      const cachedBlockedSetClear = function() {
        cachedBlockedSet = cachedBlockedSetHash = cachedBlockedSetTimer = void 0;
      };
      const getCollapseToken = () => {
        if (collapseToken === void 0) {
          collapseToken = vAPI.randomToken();
          vAPI.userStylesheet.add(
            `[${collapseToken}]
{display:none!important;}`,
            true
          );
        }
        return collapseToken;
      };
      let collapseToken;
      const onProcessed = function(response) {
        if (response instanceof Object === false) {
          toCollapse.clear();
          return;
        }
        const targets = toCollapse.get(response.id);
        if (targets === void 0) {
          return;
        }
        toCollapse.delete(response.id);
        if (cachedBlockedSetHash !== response.hash) {
          cachedBlockedSet = new Set(response.blockedResources);
          cachedBlockedSetHash = response.hash;
          if (cachedBlockedSetTimer !== void 0) {
            clearTimeout(cachedBlockedSetTimer);
          }
          cachedBlockedSetTimer = vAPI.setTimeout(cachedBlockedSetClear, 3e4);
        }
        if (cachedBlockedSet === void 0 || cachedBlockedSet.size === 0) {
          return;
        }
        const selectors = [];
        let netSelectorCacheCountMax = response.netSelectorCacheCountMax;
        for (const target of targets) {
          const tag = target.localName;
          let prop = src1stProps[tag];
          if (prop === void 0) {
            continue;
          }
          let src = target[prop];
          if (typeof src !== "string" || src.length === 0) {
            prop = src2ndProps[tag];
            if (prop === void 0) {
              continue;
            }
            src = target[prop];
            if (typeof src !== "string" || src.length === 0) {
              continue;
            }
          }
          if (cachedBlockedSet.has(tagToTypeMap[tag] + " " + src) === false) {
            continue;
          }
          target.setAttribute(getCollapseToken(), "");
          if (netSelectorCacheCount > netSelectorCacheCountMax) {
            continue;
          }
          const value = target.getAttribute(prop);
          if (value) {
            selectors.push(`${tag}[${prop}="${CSS.escape(value)}"]`);
            netSelectorCacheCount += 1;
          }
        }
        if (selectors.length === 0) {
          return;
        }
        messaging.send("contentscript", {
          what: "cosmeticFiltersInjected",
          type: "net",
          hostname: window.location.hostname,
          selectors
        });
      };
      const send = function() {
        processTimer = void 0;
        toCollapse.set(requestIdGenerator, toProcess);
        messaging.send("contentscript", {
          what: "getCollapsibleBlockedRequests",
          id: requestIdGenerator,
          frameURL: window.location.href,
          resources: toFilter,
          hash: cachedBlockedSetHash
        }).then((response) => {
          onProcessed(response);
        });
        toProcess = [];
        toFilter = [];
        requestIdGenerator += 1;
      };
      const process = function(delay) {
        if (toProcess.length === 0) {
          return;
        }
        if (delay === 0) {
          if (processTimer !== void 0) {
            clearTimeout(processTimer);
          }
          send();
        } else if (processTimer === void 0) {
          processTimer = vAPI.setTimeout(send, delay || 20);
        }
      };
      const add = function(target) {
        toProcess[toProcess.length] = target;
      };
      const addMany = function(targets) {
        for (const target of targets) {
          add(target);
        }
      };
      const iframeSourceModified = function(mutations) {
        for (const mutation of mutations) {
          addIFrame(mutation.target, true);
        }
        process();
      };
      const iframeSourceObserver = new MutationObserver(iframeSourceModified);
      const iframeSourceObserverOptions = {
        attributes: true,
        attributeFilter: ["src"]
      };
      const addIFrame = function(iframe, dontObserve) {
        if (dontObserve !== true) {
          iframeSourceObserver.observe(iframe, iframeSourceObserverOptions);
        }
        const src = iframe.src;
        if (typeof src !== "string" || src === "") {
          return;
        }
        if (src.startsWith("http") === false) {
          return;
        }
        toFilter.push({ type: "sub_frame", url: iframe.src });
        add(iframe);
      };
      const addIFrames = function(iframes) {
        for (const iframe of iframes) {
          addIFrame(iframe);
        }
      };
      const onResourceFailed = function(ev) {
        if (tagToTypeMap[ev.target.localName] !== void 0) {
          add(ev.target);
          process();
        }
      };
      const stop = function() {
        document.removeEventListener("error", onResourceFailed, true);
        if (processTimer !== void 0) {
          clearTimeout(processTimer);
        }
        if (vAPI.domWatcher instanceof Object) {
          vAPI.domWatcher.removeListener(domWatcherInterface);
        }
        vAPI.shutdown.remove(stop);
        vAPI.domCollapser = null;
      };
      const start = function() {
        if (vAPI.domWatcher instanceof Object) {
          vAPI.domWatcher.addListener(domWatcherInterface);
        }
      };
      const domWatcherInterface = {
        onDOMCreated: function() {
          if (self.vAPI instanceof Object === false) {
            return;
          }
          if (vAPI.domCollapser instanceof Object === false) {
            if (vAPI.domWatcher instanceof Object) {
              vAPI.domWatcher.removeListener(domWatcherInterface);
            }
            return;
          }
          const elems = document.images || document.getElementsByTagName("img");
          for (const elem of elems) {
            if (elem.complete) {
              add(elem);
            }
          }
          addMany(document.embeds || document.getElementsByTagName("embed"));
          addMany(document.getElementsByTagName("object"));
          addIFrames(document.getElementsByTagName("iframe"));
          process(0);
          document.addEventListener("error", onResourceFailed, true);
          vAPI.shutdown.add(stop);
        },
        onDOMChanged: function(addedNodes) {
          if (addedNodes.length === 0) {
            return;
          }
          for (const node of addedNodes) {
            if (node.localName === "iframe") {
              addIFrame(node);
            }
            if (node.firstElementChild === null) {
              continue;
            }
            const iframes = node.getElementsByTagName("iframe");
            if (iframes.length !== 0) {
              addIFrames(iframes);
            }
          }
          process();
        }
      };
      vAPI.domCollapser = { start };
    }
    {
      const queriedHashes = /* @__PURE__ */ new Set();
      const newHashes = /* @__PURE__ */ new Set();
      const maxSurveyNodes = 65536;
      const pendingLists = [];
      const pendingNodes = [];
      const processedSet = /* @__PURE__ */ new Set();
      const ignoreTags = Object.assign(/* @__PURE__ */ Object.create(null), {
        br: 1,
        head: 1,
        link: 1,
        meta: 1,
        script: 1,
        style: 1
      });
      let domObserver;
      let domFilterer;
      let hostname = "";
      let domChanged = false;
      let scannedCount = 0;
      let stopped = false;
      const hashFromStr = (type, s) => {
        const len = s.length;
        const step = len + 7 >>> 3;
        let hash = (type << 5) + type ^ len;
        for (let i = 0; i < len; i += step) {
          hash = (hash << 5) + hash ^ s.charCodeAt(i);
        }
        return hash & 16777215;
      };
      const addHashes = (hashes) => {
        for (const hash of hashes) {
          queriedHashes.add(hash);
        }
      };
      const qsa = (context, selector) => Array.from(context.querySelectorAll(selector));
      const addPendingList = (list) => {
        if (list.length === 0) {
          return;
        }
        pendingLists.push(list);
      };
      const nextPendingNodes = () => {
        if (pendingLists.length === 0) {
          return 0;
        }
        const bufferSize = 256;
        let j = 0;
        do {
          const nodeList = pendingLists[0];
          let n = bufferSize - j;
          if (n > nodeList.length) {
            n = nodeList.length;
          }
          for (let i = 0; i < n; i++) {
            pendingNodes[j + i] = nodeList[i];
          }
          j += n;
          if (n !== nodeList.length) {
            pendingLists[0] = nodeList.slice(n);
            break;
          }
          pendingLists.shift();
        } while (j < bufferSize && pendingLists.length !== 0);
        return j;
      };
      const hasPendingNodes = () => {
        return pendingLists.length !== 0 || newHashes.size !== 0;
      };
      const idFromNode = (node) => {
        const raw = node.id;
        if (typeof raw !== "string" || raw.length === 0) {
          return;
        }
        const hash = hashFromStr(35, raw.trim());
        if (queriedHashes.has(hash)) {
          return;
        }
        queriedHashes.add(hash);
        newHashes.add(hash);
      };
      const classesFromNode = (node) => {
        const s = node.getAttribute("class");
        if (typeof s !== "string") {
          return;
        }
        const len = s.length;
        for (let beg = 0, end = 0; beg < len; beg += 1) {
          end = s.indexOf(" ", beg);
          if (end === beg) {
            continue;
          }
          if (end === -1) {
            end = len;
          }
          const token = s.slice(beg, end).trimEnd();
          beg = end;
          if (token.length === 0) {
            continue;
          }
          const hash = hashFromStr(46, token);
          if (queriedHashes.has(hash)) {
            continue;
          }
          queriedHashes.add(hash);
          newHashes.add(hash);
        }
      };
      const getSurveyResults = (safeOnly) => {
        if (Boolean(self.vAPI?.messaging) === false) {
          return stop();
        }
        const promise = newHashes.size === 0 ? Promise.resolve(null) : self.vAPI.messaging.send("contentscript", {
          what: "retrieveGenericCosmeticSelectors",
          hostname,
          hashes: Array.from(newHashes),
          exceptions: domFilterer.exceptions,
          safeOnly
        });
        promise.then((response) => {
          processSurveyResults(response);
        });
        newHashes.clear();
      };
      const doSurvey = () => {
        const t0 = performance.now();
        const nodes = pendingNodes;
        const deadline = t0 + 4;
        let scanned = 0;
        for (; ; ) {
          const n = nextPendingNodes();
          if (n === 0) {
            break;
          }
          for (let i = 0; i < n; i++) {
            const node = nodes[i];
            nodes[i] = null;
            if (domChanged) {
              if (processedSet.has(node)) {
                continue;
              }
              processedSet.add(node);
            }
            idFromNode(node);
            classesFromNode(node);
            scanned += 1;
          }
          if (performance.now() >= deadline) {
            break;
          }
        }
        scannedCount += scanned;
        if (scannedCount >= maxSurveyNodes) {
          stop();
        }
        processedSet.clear();
        getSurveyResults();
      };
      const surveyTimer = new vAPI.SafeAnimationFrame(doSurvey);
      let canShutdownAfter = Date.now() + 3e5;
      let surveyResultMissCount = 0;
      const processSurveyResults = (response) => {
        if (stopped) {
          return;
        }
        const result = response && response.result;
        let mustCommit = false;
        if (result) {
          const css = result.injectedCSS;
          if (typeof css === "string" && css.length !== 0) {
            domFilterer.addCSS(css);
            mustCommit = true;
          }
          const selectors = result.excepted;
          if (Array.isArray(selectors) && selectors.length !== 0) {
            domFilterer.exceptCSSRules(selectors);
          }
        }
        if (hasPendingNodes()) {
          surveyTimer.start(1);
        }
        if (mustCommit) {
          surveyResultMissCount = 0;
          canShutdownAfter = Date.now() + 3e5;
          return;
        }
        surveyResultMissCount += 1;
        if (surveyResultMissCount < 256 || Date.now() < canShutdownAfter) {
          return;
        }
        stop();
        self.vAPI.messaging.send("contentscript", {
          what: "disableGenericCosmeticFilteringSurveyor",
          hostname
        });
      };
      const onDomChanged = (mutations) => {
        domChanged = true;
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            const { addedNodes } = mutation;
            if (addedNodes.length === 0) {
              continue;
            }
            for (const node of addedNodes) {
              if (node.nodeType !== 1) {
                continue;
              }
              if (ignoreTags[node.localName]) {
                continue;
              }
              if (node.parentElement === null) {
                continue;
              }
              addPendingList([node]);
              if (node.firstElementChild === null) {
                continue;
              }
              addPendingList(qsa(node, "[id],[class]"));
            }
          } else if (mutation.attributeName === "class") {
            classesFromNode(mutation.target);
          } else {
            idFromNode(mutation.target);
          }
        }
        if (hasPendingNodes()) {
          surveyTimer.start();
        }
      };
      const start = (details) => {
        if (Boolean(self.vAPI?.domFilterer) === false) {
          return stop();
        }
        hostname = details.hostname;
        domFilterer = vAPI.domFilterer;
        if (document.documentElement !== null) {
          idFromNode(document.documentElement);
          classesFromNode(document.documentElement);
        }
        if (document.body !== null) {
          idFromNode(document.body);
          classesFromNode(document.body);
        }
        if (newHashes.size !== 0) {
          getSurveyResults(newHashes, true);
        }
        addPendingList(qsa(document, "[id],[class]"));
        if (hasPendingNodes()) {
          surveyTimer.start();
        }
        domObserver = new MutationObserver(onDomChanged);
        domObserver.observe(document, {
          attributeFilter: ["class", "id"],
          attributes: true,
          childList: true,
          subtree: true
        });
      };
      const stop = () => {
        stopped = true;
        pendingLists.length = 0;
        surveyTimer.clear();
        if (domObserver) {
          domObserver.disconnect();
          domObserver = void 0;
        }
        if (self.vAPI?.domSurveyor) {
          self.vAPI.domSurveyor = null;
        }
      };
      self.vAPI.domSurveyor = { start, addHashes };
    }
    {
      const onDomReady = () => {
        if (window.location === null) {
          return;
        }
        if (self.vAPI instanceof Object === false) {
          return;
        }
        vAPI.messaging.send("contentscript", {
          what: "shouldRenderNoscriptTags"
        });
        if (vAPI.domFilterer instanceof Object) {
          vAPI.domFilterer.commitNow();
        }
        if (vAPI.domWatcher instanceof Object) {
          vAPI.domWatcher.start();
        }
        if (window !== window.top || vAPI.domFilterer instanceof Object === false) {
          return;
        }
        vAPI.mouseClick = { x: -1, y: -1 };
        const onMouseClick = function(ev) {
          if (ev.isTrusted === false) {
            return;
          }
          vAPI.mouseClick.x = ev.clientX;
          vAPI.mouseClick.y = ev.clientY;
          const elem = ev.target.closest("a[href]");
          if (elem === null || typeof elem.href !== "string") {
            return;
          }
          vAPI.messaging.send("contentscript", {
            what: "maybeGoodPopup",
            url: elem.href || ""
          });
        };
        document.addEventListener("mousedown", onMouseClick, true);
        vAPI.shutdown.add(function() {
          document.removeEventListener("mousedown", onMouseClick, true);
        });
      };
      const onResponseReady = (response) => {
        if (response instanceof Object === false) {
          return;
        }
        vAPI.bootstrap = void 0;
        const cfeDetails = response && response.specificCosmeticFilters;
        if (!cfeDetails || !cfeDetails.ready) {
          vAPI.domWatcher = vAPI.domCollapser = vAPI.domFilterer = vAPI.domSurveyor = vAPI.domIsLoaded = null;
          return;
        }
        vAPI.domCollapser.start();
        const {
          noSpecificCosmeticFiltering,
          noGenericCosmeticFiltering
        } = response;
        vAPI.noSpecificCosmeticFiltering = noSpecificCosmeticFiltering;
        vAPI.noGenericCosmeticFiltering = noGenericCosmeticFiltering;
        if (noSpecificCosmeticFiltering && noGenericCosmeticFiltering) {
          vAPI.domFilterer = null;
          vAPI.domSurveyor = null;
        } else {
          const domFilterer = vAPI.domFilterer = new vAPI.DOMFilterer();
          if (noGenericCosmeticFiltering || cfeDetails.disableSurveyor) {
            vAPI.domSurveyor = null;
          }
          console.log("[MV3-CS] Received cfeDetails - injectedCSS:", cfeDetails.injectedCSS ? cfeDetails.injectedCSS.substring(0, 200) : "null/empty");
          console.log("[MV3-CS] cfeDetails keys:", Object.keys(cfeDetails));
          domFilterer.exceptions = cfeDetails.exceptionFilters;
          domFilterer.addCSS(cfeDetails.injectedCSS, { mustInject: true });
          console.log("[MV3-CS] addCSS called with injectedCSS");
          domFilterer.addProceduralSelectors(cfeDetails.proceduralFilters);
          domFilterer.exceptCSSRules(cfeDetails.exceptedFilters);
          domFilterer.convertedProceduralFilters = cfeDetails.convertedProceduralFilters;
          console.log("[MV3-CS] Calling userStylesheet.apply()");
          vAPI.userStylesheet.apply();
        }
        if (vAPI.domSurveyor) {
          if (Array.isArray(cfeDetails.genericCosmeticHashes)) {
            vAPI.domSurveyor.addHashes(cfeDetails.genericCosmeticHashes);
          }
          vAPI.domSurveyor.start(cfeDetails);
        }
        const readyState = document.readyState;
        if (readyState === "interactive" || readyState === "complete") {
          return onDomReady();
        }
        document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
      };
      vAPI.bootstrap = function() {
        try {
          document.title = "uBR MV3 CS LOADING...";
        } catch (e) {
        }
        console.log("########################################");
        console.log("[MV3-CS] \u2605\u2605\u2605 BOOTSTRAP STARTING \u2605\u2605\u2605");
        console.log("[MV3-CS] Page URL:", vAPI.effectiveSelf.location.href);
        console.log("[MV3-CS] About to call vAPI.messaging.send");
        vAPI.pickerCallback = function(payload) {
          console.log("[MV3-CS] pickerActivate received, sessionId:", payload?.sessionId);
          vAPI.messaging.send("elementPicker", {
            what: "elementPickerArguments"
          }).then((response) => {
            console.log("[MV3-CS] elementPickerArguments response:", response);
          }).catch((err) => {
            console.error("[MV3-CS] Failed to get picker args:", err);
          });
        };
        vAPI.pickerDeactivateCallback = function() {
          console.log("[MV3-CS] pickerDeactivate received");
        };
        vAPI.pickerMessageCallback = function(payload) {
          console.log("[MV3-CS] pickerMessage received:", payload);
          if (window.epickerMessageHandler) {
            window.epickerMessageHandler(payload);
          }
        };
        vAPI.messaging.send("contentscript", {
          what: "retrieveContentScriptParameters",
          url: vAPI.effectiveSelf.location.href,
          needScriptlets: self.uBR_scriptletsInjected === void 0
        }).then((response) => {
          if (response && response.specificCosmeticFilters) {
            if (response.specificCosmeticFilters.injectedCSS && response.specificCosmeticFilters.injectedCSS.length > 0) {
            }
          }
          onResponseReady(response);
        }).catch((err) => {
          console.error("[MV3-CS] Promise error:", err);
        });
      };
    }
    vAPI.bootstrap();
  }
})();
