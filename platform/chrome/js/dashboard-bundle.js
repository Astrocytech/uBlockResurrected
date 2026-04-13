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
    return function(event2) {
      const dispatcher = event2.currentTarget;
      if (dispatcher instanceof HTMLElement === false || typeof dispatcher.querySelectorAll !== "function") {
        return;
      }
      const receiver = event2.target;
      const ancestor = receiver?.closest(selector);
      if (ancestor === receiver && ancestor !== dispatcher && dispatcher.contains(ancestor)) {
        callback.call(receiver, event2);
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

  // src/js/dashboard.ts
  function discardUnsavedData(synchronous = false) {
    const paneFrame = qs$("#iframe");
    const paneWindow = paneFrame.contentWindow;
    if (typeof paneWindow.hasUnsavedData !== "function" || paneWindow.hasUnsavedData() === false) {
      return true;
    }
    if (synchronous) {
      return false;
    }
    return new Promise((resolve) => {
      const modal = qs$("#unsavedWarning");
      dom.cl.add(modal, "on");
      modal.focus();
      const onDone = (status) => {
        dom.cl.remove(modal, "on");
        dom.off(document, "click", onClick, true);
        resolve(status);
      };
      const onClick = (ev) => {
        const target = ev.target;
        if (target.matches('[data-i18n="dashboardUnsavedWarningStay"]')) {
          return onDone(false);
        }
        if (target.matches('[data-i18n="dashboardUnsavedWarningIgnore"]')) {
          return onDone(true);
        }
        if (qs$(modal, '[data-i18n="dashboardUnsavedWarning"]').contains(target)) {
          return;
        }
        onDone(false);
      };
      dom.on(document, "click", onClick, true);
    });
  }
  function loadDashboardPanel(pane, first) {
    const tabButton = qs$(`[data-pane="${pane}"]`);
    if (tabButton === null || dom.cl.has(tabButton, "selected")) {
      return;
    }
    const loadPane = () => {
      self.location.replace(`#${pane}`);
      dom.cl.remove(".tabButton.selected", "selected");
      dom.cl.add(tabButton, "selected");
      tabButton.scrollIntoView();
      const iframe = qs$("#iframe");
      iframe.contentWindow.location.replace(pane);
      if (pane !== "no-dashboard.html") {
        iframe.addEventListener("load", () => {
          const wikilink = iframe.contentWindow.wikilink;
          const link = qs$(".wikilink");
          if (link) {
            link.href = wikilink || "";
          }
        }, { once: true });
        vAPI.localStorage.setItem("dashboardLastVisitedPane", pane);
      }
    };
    if (first) {
      return loadPane();
    }
    const r = discardUnsavedData();
    if (r === false) {
      return;
    }
    if (r === true) {
      return loadPane();
    }
    r.then((status) => {
      if (status === false) {
        return;
      }
      loadPane();
    });
  }
  function onTabClickHandler(ev) {
    const target = ev.target;
    const pane = dom.attr(target, "data-pane");
    if (pane) {
      loadDashboardPanel(pane, false);
    }
  }
  if (self.location.hash.slice(1) === "no-dashboard.html") {
    dom.cl.add(dom.body, "noDashboard");
  }
  (async () => {
    await new Promise((resolve) => {
      const check = async () => {
        try {
          const response = await vAPI.messaging.send("dashboard", {
            what: "readyToFilter"
          });
          if (response) {
            return resolve(true);
          }
          const iframe = qs$("#iframe");
          if (iframe.src !== "") {
            iframe.src = "";
          }
        } catch {
        }
        vAPI.defer.once(250).then(() => check());
      };
      check();
    });
    dom.cl.remove(dom.body, "notReady");
    const results = await Promise.all([
      vAPI.messaging.send("dashboard", { what: "dashboardConfig" }),
      vAPI.localStorage.getItemAsync("dashboardLastVisitedPane")
    ]);
    {
      const details = results[0] || {};
      if (details.noDashboard) {
        self.location.hash = "#no-dashboard.html";
        dom.cl.add(dom.body, "noDashboard");
      } else if (self.location.hash === "#no-dashboard.html") {
        self.location.hash = "";
      }
    }
    {
      let pane = results[1] || null;
      if (self.location.hash !== "") {
        pane = self.location.hash.slice(1) || null;
      }
      loadDashboardPanel(pane !== null ? pane : "settings.html", true);
      dom.on(".tabButton", "click", onTabClickHandler);
      dom.on(self, "beforeunload", () => {
        if (discardUnsavedData(true)) {
          return;
        }
        event.preventDefault();
        event.returnValue = "";
      });
      dom.on(self, "hashchange", () => {
        const pane2 = self.location.hash.slice(1);
        if (pane2 === "") {
          return;
        }
        loadDashboardPanel(pane2);
      });
    }
  })();
})();
