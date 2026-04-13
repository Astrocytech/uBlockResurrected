(() => {
  // src/js/advanced-settings.ts
  var fallbackText = /* @__PURE__ */ new Map([
    ["advancedSettingsPageName", "Advanced settings"],
    ["advancedSettingsWarning", "Changing these settings may affect the proper functioning of uBlock Origin."],
    ["genericApplyChanges", "Apply changes"]
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
  var defaultSettings = {
    "userFilters": "",
    "importedLists": "",
    "lastBackupTime": "0",
    "excludeAfter": "28",
    "autoUpdateInterval": "168",
    "manualUpdateAssetFetchInterval": "72",
    "updateDelayAfterLaunch": "7",
    "backupPeriod": "86400000",
    "localSettings": "",
    "remoteSettings": ""
  };
  var adminSettings = {
    "userFilters": "true",
    "importedLists": "true"
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
    root.class.toggle("light", dark === false);
    root.classList.add((navigator.maxTouchPoints || 0) > 0 ? "mobile" : "desktop");
    if (self.matchMedia("(min-resolution: 150dpi)").matches) {
      root.classList.add("hidpi");
    }
  };
  var hashFromAdvancedSettings = (raw) => {
    const aa = arrayFromString(raw);
    aa.sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify(aa);
  };
  var arrayFromString = (s) => {
    const out = [];
    for (const line of s.split(/[\n\r]+/)) {
      const pos = line.indexOf("=");
      if (pos === -1) {
        continue;
      }
      out.push([line.slice(0, pos).trim(), line.slice(pos + 1).trim()]);
    }
    return out;
  };
  var cmEditor = new CodeMirror(
    document.querySelector("#advancedSettings"),
    {
      autofocus: true,
      lineNumbers: true,
      lineWrapping: false,
      styleActiveLine: true
    }
  );
  if (typeof uBlockDashboard !== "undefined") {
    uBlockDashboard.patchCodeMirrorEditor(cmEditor);
  }
  var beforeHash = "";
  var advancedSettingsChanged = () => {
    const raw = cmEditor.getValue();
    const afterHash = hashFromAdvancedSettings(raw);
    const changed = beforeHash !== afterHash;
    const applyBtn = document.querySelector("#advancedSettingsApply");
    if (applyBtn) {
      applyBtn.disabled = !changed;
    }
  };
  cmEditor.on("changes", advancedSettingsChanged);
  var applyAdvancedSettings = async () => {
    const raw = cmEditor.getValue();
    const pairs = arrayFromString(raw);
    const settings = {};
    for (const [key, value] of pairs) {
      if (adminSettings[key] !== void 0) {
        continue;
      }
      if (defaultSettings[key] === void 0) {
        continue;
      }
      settings[key] = value;
    }
    await sendMessage("scriptlets", {
      what: "setAdvancedSettings",
      settings
    });
    beforeHash = hashFromAdvancedSettings(raw);
    advancedSettingsChanged();
  };
  var loadAdvancedSettings = async () => {
    const results = await sendMessage("scriptlets", {
      what: "getAdvancedSettings"
    });
    const entries = [];
    for (const key in defaultSettings) {
      let value = results[key] ?? defaultSettings[key];
      if (key === "userFilters") {
        continue;
      }
      entries.push(`${key}=${value}`);
    }
    const raw = entries.join("\n") + "\n";
    cmEditor.setValue(raw);
    beforeHash = hashFromAdvancedSettings(raw);
    cmEditor.clearHistory();
  };
  document.getElementById("advancedSettingsApply")?.addEventListener("click", () => {
    void applyAdvancedSettings();
  });
  applyThemeClasses();
  applyFallbackTranslations();
  void loadAdvancedSettings();
})();
