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

  // src/js/logger-ui-inspector.ts
  (() => {
    const logger = self.logger;
    const showdomButton = qs$("#showdom");
    const inspector = qs$("#domInspector");
    const domTree = qs$("#domTree");
    const filterToIdMap = /* @__PURE__ */ new Map();
    let inspectedTabId = 0;
    let inspectedHostname = "";
    let uidGenerator = 1;
    const contentInspectorChannel = /* @__PURE__ */ (() => {
      let bcChannel;
      let toContentPort;
      const start = () => {
        bcChannel = new globalThis.BroadcastChannel("contentInspectorChannel");
        bcChannel.onmessage = (ev) => {
          const msg = ev.data || {};
          connect(msg.tabId, msg.frameId);
        };
        browser.webNavigation.onDOMContentLoaded.addListener(onContentLoaded);
      };
      const shutdown = () => {
        browser.webNavigation.onDOMContentLoaded.removeListener(onContentLoaded);
        disconnect();
        bcChannel.close();
        bcChannel.onmessage = null;
        bcChannel = void 0;
      };
      const connect = (tabId, frameId) => {
        disconnect();
        try {
          toContentPort = browser.tabs.connect(tabId, { frameId });
          toContentPort.onMessage.addListener(onContentMessage);
          toContentPort.onDisconnect.addListener(onContentDisconnect);
        } catch {
        }
      };
      const disconnect = () => {
        if (toContentPort === void 0) {
          return;
        }
        toContentPort.onMessage.removeListener(onContentMessage);
        toContentPort.onDisconnect.removeListener(onContentDisconnect);
        toContentPort.disconnect();
        toContentPort = void 0;
      };
      const send = (msg) => {
        if (toContentPort === void 0) {
          return;
        }
        toContentPort.postMessage(msg);
      };
      const onContentMessage = (msg) => {
        if (msg.what === "domLayoutFull") {
          inspectedHostname = msg.hostname;
          renderDOMFull(msg);
        } else if (msg.what === "domLayoutIncremental") {
          renderDOMIncremental(msg);
        }
      };
      const onContentDisconnect = () => {
        disconnect();
      };
      const onContentLoaded = (details) => {
        if (details.tabId !== inspectedTabId) {
          return;
        }
        if (details.frameId !== 0) {
          return;
        }
        disconnect();
        injectInspector();
      };
      return { start, disconnect, send, shutdown };
    })();
    const nodeFromDomEntry = (entry) => {
      const li = document.createElement("li");
      dom.attr(li, "id", entry.nid);
      li.appendChild(document.createElement("span"));
      let node = document.createElement("code");
      node.textContent = entry.sel;
      li.appendChild(node);
      let value = entry.cnt || 0;
      node = document.createElement("span");
      node.textContent = value !== 0 ? value.toLocaleString() : "";
      dom.attr(node, "data-cnt", value);
      li.appendChild(node);
      if (entry.filter === void 0) {
        return li;
      }
      node = document.createElement("code");
      dom.cl.add(node, "filter");
      value = filterToIdMap.get(entry.filter);
      if (value === void 0) {
        value = `${uidGenerator}`;
        filterToIdMap.set(entry.filter, value);
        uidGenerator += 1;
      }
      dom.attr(node, "data-filter-id", value);
      node.textContent = entry.filter;
      li.appendChild(node);
      dom.cl.add(li, "isCosmeticHide");
      return li;
    };
    const appendListItem = (ul, li) => {
      ul.appendChild(li);
      if (dom.cl.has(li, "isCosmeticHide") === false) {
        return;
      }
      for (; ; ) {
        li = li.parentElement.parentElement;
        if (li === null) {
          break;
        }
        dom.cl.add(li, "hasCosmeticHide");
      }
    };
    const renderDOMFull = (response) => {
      const domTreeParent = domTree.parentElement;
      let ul = domTreeParent.removeChild(domTree);
      logger.removeAllChildren(domTree);
      filterToIdMap.clear();
      let lvl = 0;
      let li;
      for (const entry of response.layout) {
        if (entry.lvl === lvl) {
          li = nodeFromDomEntry(entry);
          appendListItem(ul, li);
          continue;
        }
        if (entry.lvl > lvl) {
          ul = document.createElement("ul");
          li.appendChild(ul);
          dom.cl.add(li, "branch");
          li = nodeFromDomEntry(entry);
          appendListItem(ul, li);
          lvl = entry.lvl;
          continue;
        }
        while (entry.lvl < lvl) {
          ul = li.parentNode;
          li = ul.parentNode;
          ul = li.parentNode;
          lvl -= 1;
        }
        li = nodeFromDomEntry(entry);
        appendListItem(ul, li);
      }
      while (ul.parentNode !== null) {
        ul = ul.parentNode;
      }
      dom.cl.add(ul.firstElementChild, "show");
      domTreeParent.appendChild(domTree);
    };
    const patchIncremental = (from, delta) => {
      let li = from.parentElement.parentElement;
      const patchCosmeticHide = delta >= 0 && dom.cl.has(from, "isCosmeticHide") && dom.cl.has(li, "hasCosmeticHide") === false;
      if (delta < 0) {
        delta -= countFromNode(from);
      }
      for (; li.localName === "li"; li = li.parentElement.parentElement) {
        const span = li.children[2];
        if (delta !== 0) {
          const cnt = countFromNode(li) + delta;
          span.textContent = cnt !== 0 ? cnt.toLocaleString() : "";
          dom.attr(span, "data-cnt", cnt);
        }
        if (patchCosmeticHide) {
          dom.cl.add(li, "hasCosmeticHide");
        }
      }
    };
    const renderDOMIncremental = (response) => {
      const nodes = new Map(response.nodes);
      let li = null;
      let ul = null;
      for (const entry of response.journal) {
        if (entry.what === -1) {
          li = qs$(`#${entry.nid}`);
          if (li === null) {
            continue;
          }
          patchIncremental(li, -1);
          li.parentNode.removeChild(li);
          continue;
        }
        if (entry.what === 0) {
          continue;
        }
        if (entry.what === 1 && entry.l) {
          const previous = qs$(`#${entry.l}`);
          if (previous === null) {
            continue;
          }
          ul = previous.parentElement;
          li = nodeFromDomEntry(nodes.get(entry.nid));
          ul.insertBefore(li, previous.nextElementSibling);
          patchIncremental(li, 1);
          continue;
        }
        if (entry.what === 1 && entry.u) {
          li = qs$(`#${entry.u}`);
          if (li === null) {
            continue;
          }
          ul = qs$(li, "ul");
          if (ul === null) {
            ul = document.createElement("ul");
            li.appendChild(ul);
            dom.cl.add(li, "branch");
          }
          li = nodeFromDomEntry(nodes.get(entry.nid));
          ul.appendChild(li);
          patchIncremental(li, 1);
          continue;
        }
      }
    };
    const countFromNode = (li) => {
      const span = li.children[2];
      const cnt = parseInt(dom.attr(span, "data-cnt"), 10);
      return isNaN(cnt) ? 0 : cnt;
    };
    const selectorFromNode = (node) => {
      let selector = "";
      while (node !== null) {
        if (node.localName === "li") {
          const code = qs$(node, "code");
          if (code !== null) {
            selector = `${code.textContent} > ${selector}`;
            if (selector.includes("#")) {
              break;
            }
          }
        }
        node = node.parentElement;
      }
      return selector.slice(0, -3);
    };
    const selectorFromFilter = (node) => {
      while (node !== null) {
        if (node.localName === "li") {
          const code = qs$(node, "code:nth-of-type(2)");
          if (code !== null) {
            return code.textContent;
          }
        }
        node = node.parentElement;
      }
      return "";
    };
    const nidFromNode = (node) => {
      let li = node;
      while (li !== null) {
        if (li.localName === "li") {
          return li.id || "";
        }
        li = li.parentElement;
      }
      return "";
    };
    const startDialog = (() => {
      let dialog;
      let textarea;
      let hideSelectors = [];
      let unhideSelectors = [];
      const parse = function() {
        hideSelectors = [];
        unhideSelectors = [];
        const re = /^([^#]*)(#@?#)(.+)$/;
        for (let line of textarea.value.split(/\s*\n\s*/)) {
          line = line.trim();
          if (line === "" || line.charAt(0) === "!") {
            continue;
          }
          const matches = re.exec(line);
          if (matches === null || matches.length !== 4) {
            continue;
          }
          if (inspectedHostname.lastIndexOf(matches[1]) === -1) {
            continue;
          }
          if (matches[2] === "##") {
            hideSelectors.push(matches[3]);
          } else {
            unhideSelectors.push(matches[3]);
          }
        }
        showCommitted();
      };
      const inputTimer = vAPI.defer.create(parse);
      const onInputChanged = () => {
        inputTimer.on(743);
      };
      const onClicked2 = function(ev) {
        const target = ev.target;
        ev.stopPropagation();
        if (target.id === "createCosmeticFilters") {
          vAPI.messaging.send("loggerUI", {
            what: "createUserFilter",
            filters: textarea.value
          });
          vAPI.messaging.send("loggerUI", {
            what: "reloadTab",
            tabId: inspectedTabId
          });
          return stop();
        }
      };
      const showCommitted = function() {
        contentInspectorChannel.send({
          what: "showCommitted",
          hide: hideSelectors.join(",\n"),
          unhide: unhideSelectors.join(",\n")
        });
      };
      const showInteractive = function() {
        contentInspectorChannel.send({
          what: "showInteractive",
          hide: hideSelectors.join(",\n"),
          unhide: unhideSelectors.join(",\n")
        });
      };
      const start = function() {
        dialog = logger.modalDialog.create("#cosmeticFilteringDialog", stop);
        textarea = qs$(dialog, "textarea");
        hideSelectors = [];
        for (const node of qsa$(domTree, "code.off")) {
          if (dom.cl.has(node, "filter")) {
            continue;
          }
          hideSelectors.push(selectorFromNode(node));
        }
        const taValue = [];
        for (const selector of hideSelectors) {
          taValue.push(inspectedHostname + "##" + selector);
        }
        const ids = /* @__PURE__ */ new Set();
        for (const node of qsa$(domTree, "code.filter.off")) {
          const id = dom.attr(node, "data-filter-id");
          if (ids.has(id)) {
            continue;
          }
          ids.add(id);
          unhideSelectors.push(node.textContent);
          taValue.push(inspectedHostname + "#@#" + node.textContent);
        }
        textarea.value = taValue.join("\n");
        textarea.addEventListener("input", onInputChanged);
        dialog.addEventListener("click", onClicked2, true);
        showCommitted();
        logger.modalDialog.show();
      };
      const stop = function() {
        inputTimer.off();
        showInteractive();
        textarea.removeEventListener("input", onInputChanged);
        dialog.removeEventListener("click", onClicked2, true);
        dialog = void 0;
        textarea = void 0;
        hideSelectors = [];
        unhideSelectors = [];
      };
      return start;
    })();
    const onClicked = (ev) => {
      ev.stopPropagation();
      if (inspectedTabId === 0) {
        return;
      }
      const target = ev.target;
      const parent = target.parentElement;
      if (target.localName === "span" && parent instanceof HTMLLIElement && dom.cl.has(parent, "branch") && target === parent.firstElementChild) {
        const state = dom.cl.toggle(parent, "show");
        if (!state) {
          for (const node of qsa$(parent, ".branch")) {
            dom.cl.remove(node, "show");
          }
        }
        return;
      }
      if (target.localName !== "code") {
        return;
      }
      if (dom.cl.has(target, "filter")) {
        contentInspectorChannel.send({
          what: "toggleFilter",
          original: false,
          target: dom.cl.toggle(target, "off"),
          selector: selectorFromNode(target),
          filter: selectorFromFilter(target),
          nid: nidFromNode(target)
        });
        dom.cl.toggle(
          qsa$(inspector, `[data-filter-id="${dom.attr(target, "data-filter-id")}"]`),
          "off",
          dom.cl.has(target, "off")
        );
      } else {
        contentInspectorChannel.send({
          what: "toggleNodes",
          original: true,
          target: dom.cl.toggle(target, "off") === false,
          selector: selectorFromNode(target),
          nid: nidFromNode(target)
        });
      }
      const cantCreate = qs$(domTree, ".off") === null;
      dom.cl.toggle(qs$(inspector, ".permatoolbar .revert"), "disabled", cantCreate);
      dom.cl.toggle(qs$(inspector, ".permatoolbar .commit"), "disabled", cantCreate);
    };
    const onMouseOver = (() => {
      let mouseoverTarget = null;
      const mouseoverTimer = vAPI.defer.create(() => {
        contentInspectorChannel.send({
          what: "highlightOne",
          selector: selectorFromNode(mouseoverTarget),
          nid: nidFromNode(mouseoverTarget),
          scrollTo: true
        });
      });
      return (ev) => {
        if (inspectedTabId === 0) {
          return;
        }
        if (ev.shiftKey) {
          return;
        }
        const target = ev.target.closest("li");
        if (target === mouseoverTarget) {
          return;
        }
        mouseoverTarget = target;
        mouseoverTimer.on(50);
      };
    })();
    const currentTabId = () => {
      if (dom.cl.has(showdomButton, "active") === false) {
        return 0;
      }
      return logger.tabIdFromPageSelector();
    };
    const injectInspector = (() => {
      const timer = vAPI.defer.create(() => {
        const tabId = currentTabId();
        if (tabId <= 0) {
          return;
        }
        inspectedTabId = tabId;
        vAPI.messaging.send("loggerUI", {
          what: "scriptlet",
          tabId,
          scriptlet: "dom-inspector"
        });
      });
      return () => {
        shutdownInspector();
        timer.offon(353);
      };
    })();
    const shutdownInspector = () => {
      contentInspectorChannel.disconnect();
      logger.removeAllChildren(domTree);
      dom.cl.remove(inspector, "vExpanded");
      inspectedTabId = 0;
    };
    const onTabIdChanged = () => {
      const tabId = currentTabId();
      if (tabId <= 0) {
        return toggleOff();
      }
      if (inspectedTabId !== tabId) {
        injectInspector();
      }
    };
    const toggleVExpandView = () => {
      const branches = qsa$("#domTree li.branch.show > ul > li.branch:not(.show)");
      for (const branch of branches) {
        dom.cl.add(branch, "show");
      }
    };
    const toggleVCompactView = () => {
      const branches = qsa$("#domTree li.branch.show > ul > li:not(.show)");
      const tohideSet = /* @__PURE__ */ new Set();
      for (const branch of branches) {
        const node = branch.closest("li.branch.show");
        if (node.id === "n1") {
          continue;
        }
        tohideSet.add(node);
      }
      const tohideList = Array.from(tohideSet);
      let i = tohideList.length - 1;
      while (i > 0) {
        if (tohideList[i - 1].contains(tohideList[i])) {
          tohideList.splice(i - 1, 1);
        } else if (tohideList[i].contains(tohideList[i - 1])) {
          tohideList.splice(i, 1);
        }
        i -= 1;
      }
      for (const node of tohideList) {
        dom.cl.remove(node, "show");
      }
    };
    const toggleHCompactView = () => {
      dom.cl.toggle(inspector, "hCompact");
    };
    const revert = () => {
      dom.cl.remove("#domTree .off", "off");
      contentInspectorChannel.send({ what: "resetToggledNodes" });
      dom.cl.add(qs$(inspector, ".permatoolbar .revert"), "disabled");
      dom.cl.add(qs$(inspector, ".permatoolbar .commit"), "disabled");
    };
    const toggleOn = () => {
      dom.cl.add("#inspectors", "dom");
      window.addEventListener("beforeunload", toggleOff);
      dom.on(document, "tabIdChanged", onTabIdChanged);
      dom.on(domTree, "click", onClicked, true);
      dom.on(domTree, "mouseover", onMouseOver, true);
      dom.on("#domInspector .vExpandToggler", "click", toggleVExpandView);
      dom.on("#domInspector .vCompactToggler", "click", toggleVCompactView);
      dom.on("#domInspector .hCompactToggler", "click", toggleHCompactView);
      dom.on("#domInspector .permatoolbar .revert", "click", revert);
      dom.on("#domInspector .permatoolbar .commit", "click", startDialog);
      contentInspectorChannel.start();
      injectInspector();
    };
    const toggleOff = () => {
      dom.cl.remove(showdomButton, "active");
      dom.cl.remove("#inspectors", "dom");
      shutdownInspector();
      window.removeEventListener("beforeunload", toggleOff);
      dom.off(document, "tabIdChanged", onTabIdChanged);
      dom.off(domTree, "click", onClicked, true);
      dom.off(domTree, "mouseover", onMouseOver, true);
      dom.off("#domInspector .vExpandToggler", "click", toggleVExpandView);
      dom.off("#domInspector .vCompactToggler", "click", toggleVCompactView);
      dom.off("#domInspector .hCompactToggler", "click", toggleHCompactView);
      dom.off("#domInspector .permatoolbar .revert", "click", revert);
      dom.off("#domInspector .permatoolbar .commit", "click", startDialog);
      contentInspectorChannel.shutdown();
      inspectedTabId = 0;
    };
    const toggle = () => {
      if (dom.cl.toggle(showdomButton, "active")) {
        toggleOn();
      } else {
        toggleOff();
      }
    };
    dom.on(showdomButton, "click", toggle);
  })();
})();
