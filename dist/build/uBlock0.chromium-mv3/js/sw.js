(() => {
  // src/js/mv3/vapi-bg.ts
  var VAPI_VERSION = "1.9.15";
  self.browser = self.browser || chrome;
  var vAPI = {
    uBO: true,
    version: VAPI_VERSION,
    inZapperMode: false,
    isBehindTheSceneTabId: function(tabId) {
      return tabId === -1;
    },
    noTabId: -1,
    T0: Date.now()
  };
  vAPI.setTimeout = function(fn, delay) {
    return setTimeout(fn, delay);
  };
  vAPI.getURL = function(path) {
    return chrome.runtime.getURL(path);
  };
  vAPI.generateSecret = function(size) {
    return Math.random().toString(36).slice(2, 2 + (size || 1));
  };
  vAPI.download = function() {
  };
  vAPI.closePopup = function() {
  };
  vAPI.setIcon = function() {
  };
  vAPI.setDefaultIcon = function() {
  };
  vAPI.scriptletsInjector = function() {
  };
  vAPI.prefetching = function() {
  };
  vAPI.Net = function() {
    this.handlerBehaviorChanged = function() {
    };
    this.setSuspendableListener = function() {
    };
  };
  vAPI.Net.prototype = {
    handlerBehaviorChanged: function() {
    },
    setSuspendableListener: function() {
    }
  };
  vAPI.net = {
    addListener: function() {
    },
    removeListener: function() {
    },
    handlerBehaviorChanged: function() {
    },
    setSuspendableListener: function() {
    },
    hasUnprocessedRequest: function() {
      return false;
    },
    suspend: function() {
    },
    unsuspend: function() {
    }
  };
  vAPI.defer = {
    create: function(callback) {
      return new vAPI.defer.Client(callback);
    },
    once: function(delay) {
      return Promise.resolve();
    },
    normalizeDelay: function(delay) {
      return delay || 0;
    },
    Client: function(callback) {
      this.callback = callback;
      this.timer = null;
    }
  };
  vAPI.defer.Client.prototype.on = function(delay) {
    const self2 = this;
    self2.timer = setTimeout(function() {
      self2.callback();
    }, delay || 0);
  };
  vAPI.defer.Client.prototype.off = function() {
    const self2 = this;
    if (self2.timer) {
      clearTimeout(self2.timer);
      self2.timer = null;
    }
  };
  self.requestIdleCallback = self.requestIdleCallback || function(cb, opts) {
    return setTimeout(cb, opts && opts.timeout || 100);
  };
  self.cancelIdleCallback = self.cancelIdleCallback || function(id) {
    clearTimeout(id);
  };
  vAPI.commands = {
    onCommand: {
      addListener: function(cb) {
        chrome.commands.onCommand.addListener(cb);
      },
      removeListener: function(cb) {
        chrome.commands.onCommand.removeListener(cb);
      }
    }
  };
  vAPI.alarms = {
    create: function() {
    },
    clear: function() {
      return Promise.resolve(true);
    },
    clearAll: function() {
      return Promise.resolve();
    },
    get: function() {
      return Promise.resolve(null);
    },
    getAll: function() {
      return Promise.resolve([]);
    },
    onAlarm: { addListener: function() {
    }, removeListener: function() {
    } }
  };
  vAPI.tabs = {
    query: function() {
      return Promise.resolve([]);
    },
    get: function() {
      return Promise.resolve(null);
    },
    getCurrent: function() {
      return Promise.resolve({ id: -1 });
    },
    create: function(opts) {
      return chrome.tabs.create({
        url: opts.url,
        active: opts.select !== false,
        index: opts.index
      });
    },
    update: function() {
      return Promise.resolve({});
    },
    remove: function() {
      return Promise.resolve();
    },
    open: function(details) {
      let url = details.url;
      if (url.startsWith("/")) {
        url = chrome.runtime.getURL(url);
      }
      return chrome.tabs.create({
        url,
        active: details.select !== false,
        index: details.index
      });
    },
    insertCSS: function() {
      return Promise.resolve();
    },
    removeCSS: function() {
      return Promise.resolve();
    },
    executeScript: function() {
      return Promise.resolve([]);
    },
    sendMessage: function() {
      return Promise.resolve();
    },
    reload: function() {
    }
  };
  vAPI.windows = {
    get: function() {
      return Promise.resolve(null);
    },
    create: function() {
      return Promise.resolve({ id: -1 });
    },
    update: function() {
      return Promise.resolve({});
    }
  };
  vAPI.browserAction = {
    setIcon: function() {
      return Promise.resolve();
    },
    setTitle: function() {
      return Promise.resolve();
    },
    setBadgeText: function() {
      return Promise.resolve();
    },
    setBadgeBackgroundColor: function() {
      return Promise.resolve();
    },
    setBadgeTextColor: function() {
      return Promise.resolve();
    },
    getTitle: function() {
      return Promise.resolve("");
    },
    getBadgeText: function() {
      return Promise.resolve("");
    }
  };
  vAPI.contextMenu = {
    setEntries: function() {
    },
    onMustUpdate: function() {
    }
  };
  vAPI.webextFlavor = {
    soup: {
      chromium: true,
      user_stylesheet: true,
      has: function(s) {
        return !!this[s];
      }
    },
    major: 120
  };
  vAPI.i18n = { t: function(s) {
    return s;
  } };
  vAPI.cloud = {
    push: function() {
      return Promise.resolve();
    },
    pull: function() {
      return Promise.resolve({});
    },
    used: function() {
    },
    getOptions: function() {
    },
    setOptions: function() {
    }
  };
  vAPI.statistics = {
    add: function() {
    },
    save: function() {
      return Promise.resolve();
    }
  };
  vAPI.app = {
    restart: function() {
    },
    version: VAPI_VERSION,
    intFromVersion: function(v) {
      return parseInt(v.replace(/\./g, ""), 10) || 0;
    }
  };
  (function() {
    const originalWebRequest = chrome.webRequest;
    chrome.webRequest = {
      onBeforeRequest: {
        addListener: function(cb, filters, opts) {
          if (opts && opts.indexOf("blocking") !== -1) {
            return;
          }
          originalWebRequest.onBeforeRequest.addListener(cb, filters, opts);
        },
        removeListener: function(cb) {
          originalWebRequest.onBeforeRequest.removeListener(cb);
        }
      },
      onHeadersReceived: {
        addListener: function(cb, filters, opts) {
          originalWebRequest.onHeadersReceived.addListener(cb, filters, opts);
        },
        removeListener: function(cb) {
          originalWebRequest.onHeadersReceived.removeListener(cb);
        }
      },
      ResourceType: originalWebRequest.ResourceType,
      handlerBehaviorChanged: function() {
      }
    };
  })();
  self.CSS = self.CSS || {
    escape: function(s) {
      return s;
    },
    supports: function() {
      return false;
    }
  };
  self.Image = self.Image || function(w, h) {
    const img = {
      width: w || 0,
      height: h || 0,
      src: "",
      onload: null,
      onerror: null
    };
    img.addEventListener = function() {
    };
    img.removeEventListener = function() {
    };
    return img;
  };
  self.window = self;
  self.Element = self.Element || function() {
  };
  self.HTMLElement = self.HTMLElement || function() {
  };
  self.Event = self.Event || function(type) {
    this.type = type;
  };
  self.document = {
    createElement: function(tag) {
      return {
        tagName: tag.toUpperCase(),
        style: {},
        children: [],
        setAttribute: function() {
        },
        getAttribute: function() {
          return null;
        },
        removeAttribute: function() {
        },
        appendChild: function() {
        },
        addEventListener: function() {
        },
        removeEventListener: function() {
        }
      };
    },
    createElementNS: function() {
      return {};
    },
    createTextNode: function(text) {
      return { textContent: text };
    },
    createDocumentFragment: function() {
      return { children: [], appendChild: function() {
      } };
    },
    getElementsByTagName: function() {
      return [];
    },
    getElementById: function() {
      return null;
    },
    querySelector: function() {
      return null;
    },
    querySelectorAll: function() {
      return [];
    },
    addEventListener: function() {
    },
    removeEventListener: function() {
    },
    body: {
      setAttribute: function() {
      },
      getAttribute: function() {
        return null;
      },
      appendChild: function() {
      },
      children: []
    },
    head: {
      setAttribute: function() {
      },
      getAttribute: function() {
        return null;
      },
      appendChild: function() {
      },
      children: []
    },
    documentElement: {
      setAttribute: function() {
      },
      getAttribute: function() {
        return null;
      },
      appendChild: function() {
      },
      children: []
    }
  };

  // src/js/mv3/messaging.ts
  var messaging = {
    ports: /* @__PURE__ */ new Map(),
    listeners: /* @__PURE__ */ new Map(),
    defaultHandler: null,
    PRIVILEGED_ORIGIN: vAPI.getURL("").slice(0, -1),
    NOOPFUNC: function() {
    },
    UNHANDLED: "vAPI.messaging.notHandled",
    listen: function(details) {
      this.listeners.set(details.name, {
        fn: details.listener,
        privileged: details.privileged === true
      });
    },
    onPortDisconnect: function(port) {
      this.ports.delete(port.name);
      void chrome.runtime.lastError;
    },
    onPortConnect: function(port) {
      const self2 = this;
      port.onDisconnect.addListener(function(p) {
        self2.onPortDisconnect(p);
      });
      port.onMessage.addListener(function(request, p) {
        self2.onPortMessage(request, p);
      });
      const portDetails = { privileged: false };
      const sender = port.sender;
      const origin = sender?.origin;
      const tab = sender?.tab;
      const url = sender?.url;
      portDetails.frameId = sender?.frameId;
      portDetails.frameURL = url;
      portDetails.privileged = origin !== void 0 ? origin === this.PRIVILEGED_ORIGIN : !!(url && url.startsWith(this.PRIVILEGED_ORIGIN));
      if (tab?.id) {
        portDetails.tabId = tab.id;
        portDetails.tabURL = tab.url;
      }
      this.ports.set(port.name, portDetails);
      port.sender = void 0;
    },
    setup: function(defaultHandler) {
      if (this.defaultHandler !== null) {
        return;
      }
      this.defaultHandler = defaultHandler;
      const self2 = this;
      chrome.runtime.onConnect.addListener(function(port) {
        self2.onPortConnect(port);
      });
    },
    onFrameworkMessage: function(request, port, callback) {
      const portDetails = this.ports.get(port.name) || { privileged: false };
      const tabId = portDetails.tabId;
      const msg = request.msg;
      switch (msg.what) {
        case "localStorage": {
          if (portDetails.privileged !== true) break;
          if (!vAPI.localStorage || !(msg.fn && vAPI.localStorage[msg.fn])) {
            callback(null);
            break;
          }
          const args = msg.args || [];
          const fn = vAPI.localStorage[msg.fn];
          const result = fn.apply(vAPI.localStorage, args);
          if (result && typeof result.then === "function") {
            result.then(function(data) {
              callback(data);
            }).catch(function() {
              callback(null);
            });
          } else {
            callback(result);
          }
          break;
        }
        case "userCSS": {
          if (tabId === void 0) break;
          const promises = [];
          if (msg.add) {
            for (const cssText of msg.add) {
              promises.push(new Promise(function(resolve) {
                chrome.scripting.insertCSS({
                  target: { tabId },
                  css: cssText
                }, function() {
                  resolve();
                });
              }));
            }
          }
          Promise.all(promises).then(function() {
            callback();
          });
          break;
        }
        default:
          break;
      }
    },
    createCallback: function(port, msgId) {
      const msgInstance = this;
      return function(response) {
        try {
          port.postMessage({
            msgId,
            msg: response !== void 0 ? response : null
          });
        } catch {
          msgInstance.onPortDisconnect(port);
        }
      };
    },
    onPortMessage: function(request, port) {
      let callback = this.NOOPFUNC;
      if (request.msgId !== void 0) {
        callback = this.createCallback(port, request.msgId);
      }
      if (request.channel === "vapi") {
        this.onFrameworkMessage(request, port, callback);
        return;
      }
      const portDetails = this.ports.get(port.name);
      if (portDetails === void 0) {
        callback();
        return;
      }
      const listenerDetails = this.listeners.get(request.channel);
      let r = this.UNHANDLED;
      if (listenerDetails !== void 0) {
        if (listenerDetails.privileged === false || portDetails.privileged) {
          r = listenerDetails.fn(request.msg, portDetails, callback) || this.UNHANDLED;
        }
      }
      if (r !== this.UNHANDLED) {
        return;
      }
      if (portDetails.privileged && this.defaultHandler) {
        r = this.defaultHandler(request.msg, portDetails, callback) || this.UNHANDLED;
      }
      if (r !== this.UNHANDLED) {
        return;
      }
      callback();
    },
    send: function(channel, msg) {
      return chrome.runtime.sendMessage({ channel, msg });
    },
    sendNative: function() {
      return Promise.resolve({});
    }
  };

  // src/js/mv3/storage.ts
  vAPI.localStorage = {
    getItem: function(key) {
      let result = null;
      chrome.storage.local.get(key, function(data) {
        result = data[key];
      });
      return result;
    },
    setItem: function(key, value) {
      const obj = {};
      obj[key] = value;
      chrome.storage.local.set(obj);
    },
    removeItem: function(key) {
      chrome.storage.local.remove(key);
    },
    clear: function() {
      chrome.storage.local.clear();
    },
    getItemAsync: function(key) {
      return chrome.storage.local.get(key).then(function(data) {
        return data[key] || "";
      });
    },
    setItemAsync: function(key, value) {
      const obj = {};
      obj[key] = value;
      return chrome.storage.local.set(obj);
    },
    removeItemAsync: function(key) {
      return chrome.storage.local.remove(key);
    },
    start: function() {
      return Promise.resolve();
    }
  };
  vAPI.storage = {
    get: function(keys) {
      return chrome.storage.local.get(keys);
    },
    set: function(details) {
      return chrome.storage.local.set(details);
    },
    getItemAsync: function(key) {
      return chrome.storage.local.get(key).then(function(data) {
        return data[key] || null;
      });
    },
    setItemAsync: function(key, value) {
      const obj = {};
      obj[key] = value;
      return chrome.storage.local.set(obj);
    },
    removeItemAsync: function(key) {
      return chrome.storage.local.remove(key);
    }
  };
  var storage = {
    readUserFilters: function() {
      return chrome.storage.local.get(["user-filters", "userFiltersSettings"]).then(function(data) {
        const settings = data.userFiltersSettings || { enabled: true, trusted: false };
        return {
          content: data["user-filters"] || "",
          enabled: settings.enabled,
          trusted: settings.trusted,
          success: true
        };
      });
    },
    writeUserFilters: function(content, options) {
      const settings = {
        enabled: options.enabled !== false,
        trusted: options.trusted === true
      };
      return chrome.storage.local.set({
        "user-filters": content || "",
        userFiltersSettings: settings
      });
    },
    appendUserFilters: function(filters) {
      const self2 = this;
      return chrome.storage.local.get("user-filters").then(function(data) {
        let currentFilters = data["user-filters"] || "";
        let filtersToSave = Array.isArray(filters) ? filters : [filters];
        filtersToSave = filtersToSave.filter(function(f) {
          return f && f.trim();
        });
        if (filtersToSave.length === 0) {
          return { saved: false, reason: "no valid filters" };
        }
        const newFiltersText = filtersToSave.join("\n");
        const newContent = currentFilters ? currentFilters + "\n" + newFiltersText : newFiltersText;
        return chrome.storage.local.set({ "user-filters": newContent }).then(function() {
          return { saved: true, filters: filtersToSave };
        });
      });
    },
    readWhitelist: function() {
      return chrome.storage.local.get("netWhitelist").then(function(data) {
        return data.netWhitelist || [];
      });
    },
    writeWhitelist: function(whitelist) {
      return chrome.storage.local.set({ netWhitelist: whitelist });
    },
    readSettings: function() {
      return chrome.storage.local.get("userSettings").then(function(data) {
        return data.userSettings || {};
      });
    },
    writeSettings: function(settings) {
      return chrome.storage.local.set({ userSettings: settings });
    },
    readStatistics: function() {
      return chrome.storage.local.get("statistics").then(function(data) {
        return data.statistics || { allowed: 0, blocked: 0 };
      });
    },
    writeStatistics: function(stats) {
      return chrome.storage.local.set({ statistics: stats });
    },
    getBytesInUse: function() {
      return chrome.storage.local.getBytesInUse();
    }
  };

  // src/js/mv3/utils.ts
  var CONSTANTS = {
    DNR: {
      WHITELIST_RULE_START: 1e4,
      WHITELIST_RULE_END: 2e4,
      MAX_STATIC_RULES: 3e4,
      MAX_SESSION_RULES: 5e3,
      MAX_DYNAMIC_RULES: 3e4,
      RULE_BUDGET_WARNING: 0.9
    },
    FILTERS: {
      SELECTOR_SEPARATOR: "##",
      COMMENT_PREFIX: "!",
      INCLUDE_PREFIX: "[",
      MATCH_ALL: ""
    },
    STORAGE: {
      DEFAULT_QUOTA: 10485760
    }
  };
  function parseHostname(url) {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.hostname.split(".");
      return {
        hostname: urlObj.hostname,
        domain: parts.length > 2 ? parts.slice(-2).join(".") : urlObj.hostname,
        url: urlObj.href,
        protocol: urlObj.protocol
      };
    } catch {
      return { hostname: "", domain: "", url: "", protocol: "" };
    }
  }
  function injectScript(tabId, files, allFrames = true) {
    return new Promise(function(resolve) {
      chrome.scripting.executeScript({
        target: { tabId, allFrames },
        files
      }, function() {
        resolve();
      });
    });
  }
  function injectScripts(tabId, scripts, allFrames = false) {
    let chain = Promise.resolve();
    const scriptArray = Array.isArray(scripts) ? scripts : [[scripts]];
    scriptArray.forEach(function(files) {
      if (Array.isArray(files)) {
        chain = chain.then(function() {
          return injectScript(tabId, files, allFrames);
        });
      } else {
        chain = chain.then(function() {
          return injectScript(tabId, [files], allFrames);
        });
      }
    });
    return chain;
  }

  // src/js/mv3/dnr.ts
  var dnr = {
    WHITELIST_RULE_START: CONSTANTS.DNR.WHITELIST_RULE_START,
    WHITELIST_RULE_END: CONSTANTS.DNR.WHITELIST_RULE_END,
    updateWhitelist: function() {
      storage.readWhitelist().then(function(whitelist) {
        const rules = [];
        for (const pattern of whitelist) {
          if (!pattern || pattern.startsWith("#")) continue;
          const rule = {
            id: dnr.WHITELIST_RULE_START + rules.length,
            priority: 3,
            action: { type: "allow" },
            condition: {}
          };
          if (pattern.indexOf("/") === -1) {
            rule.condition.urlFilter = "||" + pattern + "^";
          } else if (pattern.startsWith("/") && pattern.endsWith("/")) {
            rule.condition.regexFilter = pattern.slice(1, -1);
          } else {
            rule.condition.urlFilter = pattern;
          }
          rules.push(rule);
        }
        chrome.declarativeNetRequest.getDynamicRules(function(existingRules) {
          const removeIds = existingRules.filter(function(r) {
            return r.id >= dnr.WHITELIST_RULE_START && r.id < dnr.WHITELIST_RULE_END;
          }).map(function(r) {
            return r.id;
          });
          chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: removeIds,
            addRules: rules
          }, function() {
          });
        });
      });
    },
    addToWhitelist: function(domain) {
      return storage.readWhitelist().then(function(whitelist) {
        if (whitelist.indexOf(domain) === -1) {
          whitelist.push(domain);
          return storage.writeWhitelist(whitelist).then(function() {
            dnr.updateWhitelist();
            return true;
          });
        }
        return false;
      });
    },
    removeFromWhitelist: function(domain) {
      return storage.readWhitelist().then(function(whitelist) {
        const idx = whitelist.indexOf(domain);
        if (idx !== -1) {
          whitelist.splice(idx, 1);
          return storage.writeWhitelist(whitelist).then(function() {
            dnr.updateWhitelist();
            return true;
          });
        }
        return false;
      });
    }
  };

  // src/js/mv3/handlers/popup.ts
  function createPopupHandler(api) {
    return function(request, portDetails, callback) {
      switch (request.what) {
        case "getPopupData":
          handleGetPopupData(request, portDetails, callback, api);
          break;
        case "launchElementPicker":
          handleLaunchElementPicker(request, portDetails, callback, api);
          break;
        case "gotoURL":
          handleGotoURL(request, portDetails, callback);
          break;
        case "getScriptCount":
          callback({ count: 0 });
          break;
        case "toggleNetFiltering":
          callback({});
          break;
        default:
          callback({});
          break;
      }
    };
  }
  function handleGetPopupData(request, portDetails, callback, api) {
    const tabId = request.tabId || -1;
    let tabTitle = "";
    let rawURL = "";
    let pageURL = "";
    let pageHostname = "";
    let pageDomain = "";
    let canElementPicker = true;
    function buildPopupData(tab) {
      if (tab?.url) {
        tabTitle = tab.title || "";
        rawURL = tab.url;
        pageURL = tab.url;
        try {
          const parsed = parseHostname(tab.url);
          pageHostname = parsed.hostname;
          pageDomain = parsed.domain;
          canElementPicker = parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:";
        } catch {
          console.warn("[PopupHandler] Failed to parse URL");
        }
      }
      callback({
        advancedUserEnabled: true,
        appName: "uBlock Origin",
        appVersion: api.version,
        colorBlindFriendly: false,
        cosmeticFilteringSwitch: false,
        firewallPaneMinimized: true,
        fontSize: void 0,
        godMode: false,
        tooltipsDisabled: false,
        uiPopupConfig: void 0,
        hasUnprocessedRequest: false,
        netFilteringSwitch: true,
        userFiltersAreEnabled: true,
        tabId,
        tabTitle,
        rawURL,
        pageURL,
        pageHostname,
        pageDomain,
        pageCounts: {
          blocked: { any: 0, image: 0, script: 0, stylesheet: 0, font: 0, object: 0, xmlhttprequest: 0, ping: 0, websocket: 0, other: 0 },
          allowed: { any: 0, image: 0, script: 0, stylesheet: 0, font: 0, object: 0, xmlhttprequest: 0, ping: 0, websocket: 0, other: 0 }
        },
        globalBlockedRequestCount: 0,
        globalAllowedRequestCount: 0,
        popupBlockedCount: 0,
        largeMediaCount: 0,
        remoteFontCount: 0,
        contentLastModified: 0,
        noPopups: false,
        noLargeMedia: false,
        noCosmeticFiltering: false,
        noRemoteFonts: false,
        noScripting: false,
        hostnameDict: {},
        cnameMap: [],
        firewallRules: {},
        canElementPicker,
        matrixIsDirty: false,
        popupPanelSections: 31,
        popupPanelDisabledSections: 0,
        popupPanelLockedSections: 0,
        popupPanelHeightMode: 0,
        popupPanelOrientation: "landscape"
      });
    }
    if (tabId && tabId > 0) {
      chrome.tabs.get(tabId).then(buildPopupData).catch(function() {
        buildPopupData(null);
      });
    } else {
      buildPopupData(null);
    }
  }
  function handleLaunchElementPicker(request, portDetails, callback, api) {
    const targetTabId = request.tabId;
    const zapMode = request.zap === true;
    api.inZapperMode = zapMode;
    function activatePicker(tabId) {
      if (!tabId || tabId <= 0) {
        callback({ success: false, error: "no valid tabId" });
        return;
      }
      const chain = injectScripts(tabId, [
        ["js/vapi-content.js"],
        ["js/scriptlets/epicker.js"]
      ]);
      chain.then(function() {
        callback({ success: true });
      }).catch(function(err) {
        console.error("[PopupHandler] Failed to inject scripts:", err);
        callback({ success: false, error: err instanceof Error ? err.message : "Injection failed" });
      });
    }
    if (targetTabId && targetTabId > 0) {
      activatePicker(targetTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          activatePicker(tabs[0].id);
        } else {
          callback({ success: false, error: "no active tab" });
        }
      });
    }
  }
  function handleGotoURL(request, portDetails, callback) {
    const url = request.details?.url;
    if (url) {
      let targetUrl = url;
      if (targetUrl.startsWith("/")) {
        targetUrl = chrome.runtime.getURL(targetUrl);
      }
      chrome.tabs.create({ url: targetUrl, active: request.details?.select !== false });
      callback({ success: true });
    } else {
      callback({ success: false });
    }
  }

  // src/js/mv3/handlers/picker.ts
  function createPickerHandler() {
    return function(request, portDetails, callback) {
      switch (request.what) {
        case "elementPickerArguments":
          callback({
            pickerURL: chrome.runtime.getURL("web_accessible_resources/epicker-ui.html"),
            target: "",
            zap: vAPI.inZapperMode,
            eprom: null
          });
          break;
        case "createUserFilter":
          handleCreateUserFilter(request, portDetails, callback);
          break;
        default:
          callback({});
          break;
      }
    };
  }
  function handleCreateUserFilter(request, portDetails, callback) {
    let filtersToSave = [];
    if (typeof request.filters === "string" && request.filters.trim()) {
      filtersToSave = [request.filters.trim()];
    } else if (Array.isArray(request.filters)) {
      filtersToSave = request.filters.filter(function(f) {
        return f && f.trim();
      });
    } else if (request.filters && typeof request.filters === "object" && request.filters.filter) {
      filtersToSave = [request.filters.filter.trim()];
    }
    if (filtersToSave.length === 0) {
      callback({ saved: false, error: "No valid filters provided" });
      return;
    }
    storage.appendUserFilters(filtersToSave).then(function(result) {
      callback(result);
    }).catch(function(err) {
      console.error("[PickerHandler] Failed to save filters:", err);
      callback({ saved: false, error: err instanceof Error ? err.message : "Unknown error" });
    });
  }

  // src/js/mv3/handlers/dashboard.ts
  function createDashboardHandler() {
    return function(request, portDetails, callback) {
      switch (request.what) {
        case "readyToFilter":
          callback(true);
          break;
        case "dashboardConfig":
          callback({ isAdvancedUser: true, canCloudSync: false });
          break;
        case "getWhitelist":
          storage.readWhitelist().then(function(whitelist2) {
            callback({
              whitelist: whitelist2,
              whitelistDefault: ["chrome-extension-scheme", "moz-extension-scheme"],
              reBadHostname: "[^a-z0.9.\\-_[\\]:]",
              reHostnameExtractor: "([a-z0.9.\\-_[\\]]+)(?::[\\d*]+)?\\/(?:[^\\x00-\\x20/]|$)[^\\x00-\\x20]*$",
              success: true
            });
          }).catch(function(err) {
            console.error("[DashboardHandler] Failed to read whitelist:", err);
            callback({ whitelist: [], success: false, error: err.message });
          });
          break;
        case "setWhitelist":
          const whitelist = request.whitelist ? request.whitelist.split("\n") : [];
          storage.writeWhitelist(whitelist).then(function() {
            dnr.updateWhitelist();
            callback({ success: true });
          }).catch(function(err) {
            console.error("[DashboardHandler] Failed to write whitelist:", err);
            callback({ success: false, error: err.message });
          });
          break;
        case "readUserFilters":
          storage.readUserFilters().then(function(data) {
            callback(data);
          }).catch(function(err) {
            console.error("[DashboardHandler] Failed to read user filters:", err);
            callback({ content: "", success: false, error: err.message });
          });
          break;
        case "writeUserFilters":
          storage.writeUserFilters(request.content || "", {
            enabled: request.enabled,
            trusted: request.trusted
          }).then(function() {
            callback({ success: true });
          }).catch(function(err) {
            console.error("[DashboardHandler] Failed to write user filters:", err);
            callback({ success: false, error: err.message });
          });
          break;
        case "reloadAllFilters":
          callback({ success: true });
          break;
        case "getAutoCompleteDetails":
          callback({});
          break;
        case "getTrustedScriptletTokens":
          callback([]);
          break;
        case "getFilterLists":
          callback({});
          break;
        case "getLocalSettings":
          callback({});
          break;
        case "setLocalSettings":
          callback({});
          break;
        case "userSettings":
          callback({});
          break;
        case "storageQuota":
          storage.getBytesInUse().then(function(bytes) {
            callback({ used: bytes, quota: 10485760 });
          }).catch(function() {
            callback({ used: 0, quota: 10485760 });
          });
          break;
        case "cosmeticFilteringSwitch":
          callback({});
          break;
        case "getPopupLazyData":
          callback({});
          break;
        default:
          callback({});
          break;
      }
    };
  }

  // src/js/mv3/handlers/content.ts
  function handleRetrieveContentScriptParameters(request, portDetails, callback) {
    const parsed = parseHostname(request.url || "");
    const hostname = parsed.hostname;
    const domain = parsed.domain;
    storage.readUserFilters().then(function(data) {
      const userFilters = data.content || "";
      const cosmeticFilters = [];
      const lines = userFilters.split("\n");
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.includes(CONSTANTS.FILTERS.SELECTOR_SEPARATOR) && !trimmedLine.startsWith(CONSTANTS.FILTERS.COMMENT_PREFIX) && !trimmedLine.startsWith(CONSTANTS.FILTERS.INCLUDE_PREFIX)) {
          cosmeticFilters.push(trimmedLine);
        }
      }
      const matchedSelectors = [];
      for (const filter of cosmeticFilters) {
        if (!filter) continue;
        const parts = filter.split(CONSTANTS.FILTERS.SELECTOR_SEPARATOR);
        if (parts.length !== 2) continue;
        const filterHostname = parts[0];
        const selector = parts[1];
        let matches = false;
        if (!filterHostname) {
          matches = true;
        } else if (filterHostname === hostname || filterHostname === domain) {
          matches = true;
        } else if (filterHostname.startsWith("*.") && hostname.endsWith(filterHostname.slice(1))) {
          matches = true;
        }
        if (matches && selector) {
          matchedSelectors.push(selector);
        }
      }
      callback({
        hostname,
        domain,
        deepServices: {},
        privileged: true,
        cnameToParentMap: {},
        redirectEngine: null,
        staticFilters: "",
        staticExtendedFilters: "",
        proceduralFilters: matchedSelectors.join(",\n"),
        cosmeticFilterEngine: matchedSelectors.length > 0 ? "procedural" : "",
        extraSettings: {
          forceLocalPolicies: true
        },
        userFilters: matchedSelectors.join(",\n")
      });
    }).catch(function(err) {
      console.error("[ContentHandler] Failed to read user filters:", err);
      callback({
        hostname,
        domain,
        deepServices: {},
        privileged: true,
        cnameToParentMap: {},
        redirectEngine: null,
        staticFilters: "",
        staticExtendedFilters: "",
        proceduralFilters: "",
        cosmeticFilterEngine: "",
        extraSettings: { forceLocalPolicies: true },
        userFilters: ""
      });
    });
  }
  function handleUserCSS(request, portDetails, callback) {
    const tabId = portDetails.tabId;
    const frameId = portDetails.frameId;
    if (tabId === void 0) {
      callback({});
      return;
    }
    const cssPromises = [];
    if (request.add && request.add.length > 0) {
      for (const cssText of request.add) {
        if (!cssText) continue;
        cssPromises.push(new Promise(function(resolve) {
          const injectDetails = {
            target: { tabId },
            css: cssText
          };
          if (typeof frameId === "number" && frameId >= 0) {
            injectDetails.target.frameIds = [frameId];
          }
          chrome.scripting.insertCSS(injectDetails, function() {
            if (chrome.runtime.lastError) {
              console.warn("[ContentHandler] CSS injection warning:", chrome.runtime.lastError.message);
            }
            resolve();
          });
        }));
      }
    }
    if (request.remove && request.remove.length > 0) {
      for (const removeCss of request.remove) {
        if (!removeCss) continue;
        cssPromises.push(new Promise(function(resolve) {
          const removeDetails = {
            target: { tabId },
            code: removeCss
          };
          if (typeof frameId === "number" && frameId >= 0) {
            removeDetails.target.frameIds = [frameId];
          }
          chrome.scripting.removeCSS(removeDetails, function() {
            if (chrome.runtime.lastError) {
              console.warn("[ContentHandler] CSS removal warning:", chrome.runtime.lastError.message);
            }
            resolve();
          });
        }));
      }
    }
    Promise.all(cssPromises).then(function() {
      callback({});
    }).catch(function(err) {
      console.error("[ContentHandler] CSS operations failed:", err);
      callback({});
    });
  }
  function createContentHandler() {
    return function(request, portDetails, callback) {
      switch (request.what) {
        case "retrieveContentScriptParameters":
          handleRetrieveContentScriptParameters(request, portDetails, callback);
          break;
        case "cosmeticFiltersInjected":
          callback({});
          break;
        case "userCSS":
          handleUserCSS(request, portDetails, callback);
          break;
        default:
          callback({});
          break;
      }
    };
  }

  // src/js/mv3/sw-entry.ts
  self.oninstall = function() {
    self.skipWaiting();
  };
  self.onactivate = function() {
    return self.clients.claim();
  };
  var defaultMessageHandler = function(request, portDetails, callback) {
    if (request.what === "createUserFilter") {
      let filtersToSave = [];
      if (typeof request.filters === "string" && request.filters.trim()) {
        filtersToSave = [request.filters.trim()];
      } else if (Array.isArray(request.filters)) {
        filtersToSave = request.filters;
      } else if (request.filters && typeof request.filters === "object" && request.filters.filter) {
        filtersToSave = [request.filters.filter.trim()];
      }
      storage.appendUserFilters(filtersToSave).then(function(result) {
        callback(result);
      }).catch(function(e) {
        callback({ saved: false, error: e.message });
      });
      return;
    }
    if (request.channel === "elementPicker" || request.msg && request.msg.channel === "elementPicker") {
      const msg = request.msg || request;
      const what = msg.what;
      if (what === "elementPickerArguments") {
        callback({
          pickerURL: chrome.runtime.getURL("web_accessible_resources/epicker-ui.html"),
          target: "",
          zap: vAPI.inZapperMode,
          eprom: null
        });
        return;
      }
      if (what === "createUserFilter") {
        const m = msg;
        let filtersToSave = [];
        if (typeof m.filters === "string" && m.filters.trim()) {
          filtersToSave = [m.filters.trim()];
        } else if (Array.isArray(m.filters)) {
          filtersToSave = m.filters;
        }
        storage.appendUserFilters(filtersToSave).then(function(result) {
          callback(result);
        });
        return;
      }
    }
    if (request.what === "uiStyles") {
      callback({});
      return;
    }
    return messaging.UNHANDLED;
  };
  messaging.setup(defaultMessageHandler);
  messaging.listen({ name: "popupPanel", listener: createPopupHandler(vAPI), privileged: false });
  messaging.listen({ name: "elementPicker", listener: createPickerHandler(), privileged: false });
  messaging.listen({ name: "dashboard", listener: createDashboardHandler(), privileged: true });
  messaging.listen({ name: "dom", listener: createContentHandler(), privileged: false });
  messaging.listen({ name: "contentscript", listener: createContentHandler(), privileged: false });
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.channel === "elementPicker" || request.msg && request.msg.channel === "elementPicker") {
      const msg = request.msg || request;
      const what = msg.what;
      if (what === "elementPickerArguments") {
        sendResponse({
          pickerURL: chrome.runtime.getURL("web_accessible_resources/epicker-ui.html"),
          target: "",
          zap: vAPI.inZapperMode,
          eprom: null
        });
        return true;
      }
      if (what === "createUserFilter") {
        const m = msg;
        let filtersToSave = [];
        if (typeof m.filters === "string" && m.filters.trim()) {
          filtersToSave = [m.filters.trim()];
        } else if (Array.isArray(m.filters)) {
          filtersToSave = m.filters;
        }
        storage.appendUserFilters(filtersToSave).then(function(result) {
          sendResponse(result);
        }).catch(function(e) {
          sendResponse({ saved: false, error: e.message });
        });
        return true;
      }
    }
    if (request.what === "getPopupData") {
      const tabId = request.tabId || -1;
      let canElementPicker = true;
      const buildPopupData = function(tab) {
        let tabTitle = "";
        let pageURL = "";
        let pageHostname = "";
        let pageDomain = "";
        if (tab?.url) {
          tabTitle = tab.title || "";
          pageURL = tab.url;
          try {
            const parsed = parseHostname(tab.url);
            pageHostname = parsed.hostname;
            pageDomain = parsed.domain;
            canElementPicker = parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:";
          } catch {
          }
        }
        sendResponse({
          advancedUserEnabled: true,
          appName: "uBlock Origin",
          appVersion: vAPI.version,
          colorBlindFriendly: false,
          cosmeticFilteringSwitch: false,
          firewallPaneMinimized: true,
          hasUnprocessedRequest: false,
          netFilteringSwitch: true,
          userFiltersAreEnabled: true,
          tabId,
          tabTitle,
          rawURL: pageURL,
          pageURL,
          pageHostname,
          pageDomain,
          hostnameDict: {},
          cnameMap: [],
          firewallRules: {},
          canElementPicker,
          popupPanelSections: 31,
          popupPanelDisabledSections: 0,
          popupPanelLockedSections: 0,
          popupPanelHeightMode: 0,
          popupPanelOrientation: "landscape"
        });
      };
      if (tabId && tabId > 0) {
        chrome.tabs.get(tabId).then(buildPopupData).catch(function() {
          buildPopupData(null);
        });
      } else {
        buildPopupData(null);
      }
      return true;
    }
    if (request.what === "launchElementPicker") {
      vAPI.inZapperMode = request.zap === true;
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          const targetTabId = tabs[0].id;
          let injectChain = Promise.resolve();
          injectChain = injectChain.then(function() {
            return new Promise(function(resolve) {
              chrome.scripting.executeScript({
                target: { tabId: targetTabId, allFrames: true },
                files: ["js/vapi-content.js"]
              }, function() {
                resolve();
              });
            });
          });
          injectChain = injectChain.then(function() {
            return new Promise(function(resolve) {
              chrome.scripting.executeScript({
                target: { tabId: targetTabId, allFrames: true },
                files: ["js/scriptlets/epicker.js"]
              }, function() {
                resolve();
              });
            });
          });
        }
      });
      return true;
    }
    sendResponse({});
    return true;
  });
  chrome.commands.onCommand.addListener(function(command) {
    if (command === "launch-element-zapper") {
      vAPI.inZapperMode = true;
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id, allFrames: true },
            files: ["js/vapi-content.js"]
          }, function() {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id, allFrames: true },
              files: ["js/scriptlets/epicker.js"]
            });
          });
        }
      });
    } else if (command === "launch-element-picker") {
      vAPI.inZapperMode = false;
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id, allFrames: true },
            files: ["js/vapi-content.js"]
          }, function() {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id, allFrames: true },
              files: ["js/scriptlets/epicker.js"]
            });
          });
        }
      });
    } else if (command === "open-dashboard") {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    } else if (command === "launch-logger") {
      chrome.tabs.create({ url: chrome.runtime.getURL("logger-ui.html") });
    }
  });
  dnr.updateWhitelist();
})();
