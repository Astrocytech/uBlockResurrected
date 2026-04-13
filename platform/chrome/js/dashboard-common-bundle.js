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
})();
