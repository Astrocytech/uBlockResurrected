(() => {
  // src/js/whitelist.ts
  var fallbackText = /* @__PURE__ */ new Map([
    ["whitelistApply", "Apply changes"],
    ["genericRevert", "Revert"],
    ["whitelistImport", "Import"],
    ["whitelistExport", "Export"],
    ["whitelistPrompt", "Enter Whitelist directives, one per line. Directives added here will take precedence over any other whitelist rule."],
    ["whitelistExportFilename", "ublock-whitelist_{{datetime}}.txt"]
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
  var reComment = /^\s*#\s*/;
  var directiveFromLine = (line) => {
    const match = reComment.exec(line);
    return match === null ? line.trim() : line.slice(match.index + match[0].length).trim();
  };
  var reBadHostname;
  var reHostnameExtractor;
  var whitelistDefaultSet = /* @__PURE__ */ new Set();
  CodeMirror.defineMode("ubo-whitelist-directives", function() {
    const reRegex = /^\/.+\/$/;
    return {
      token: function(stream) {
        const line = stream.string.trim();
        stream.skipToEnd();
        if (reBadHostname === void 0) {
          return null;
        }
        if (reComment.test(line)) {
          return "comment";
        }
        if (line.indexOf("/") === -1) {
          if (reBadHostname.test(line)) {
            return "error";
          }
          if (whitelistDefaultSet.has(line.trim())) {
            return "keyword";
          }
          return null;
        }
        if (reRegex.test(line)) {
          try {
            new RegExp(line.slice(1, -1));
          } catch {
            return "error";
          }
          return null;
        }
        if (reHostnameExtractor?.test(line) === false) {
          return "error";
        }
        if (whitelistDefaultSet.has(line.trim())) {
          return "keyword";
        }
        return null;
      }
    };
  });
  var cmEditor = new CodeMirror(
    document.querySelector("#whitelist"),
    {
      autofocus: true,
      lineNumbers: true,
      lineWrapping: true,
      styleActiveLine: true,
      mode: "ubo-whitelist-directives"
    }
  );
  if (typeof uBlockDashboard !== "undefined") {
    uBlockDashboard.patchCodeMirrorEditor(cmEditor);
  }
  var noopFunc = () => {
  };
  var cachedWhitelist = "";
  var getEditorText = () => {
    const text = cmEditor.getValue().trimEnd();
    return text === "" ? text : `${text}
`;
  };
  var setEditorText = (text) => {
    cmEditor.setValue(`${text.trimEnd()}
`);
  };
  var whitelistChanged = () => {
    const whitelistElem = document.querySelector("#whitelist");
    const bad = whitelistElem?.querySelector(".cm-error") !== null;
    const changedWhitelist = getEditorText().trim();
    const changed = changedWhitelist !== cachedWhitelist;
    const applyBtn = document.querySelector("#whitelistApply");
    const revertBtn = document.querySelector("#whitelistRevert");
    if (applyBtn) applyBtn.disabled = !changed || bad;
    if (revertBtn) revertBtn.disabled = !changed;
    CodeMirror.commands.save = changed && !bad ? applyChanges : noopFunc;
  };
  cmEditor.on("changes", whitelistChanged);
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
  var renderWhitelist = async () => {
    const details = await sendMessage("getWhitelist");
    if (!details) {
      return;
    }
    const first = reBadHostname === void 0;
    if (first) {
      reBadHostname = new RegExp(details.reBadHostname);
      reHostnameExtractor = new RegExp(details.reHostnameExtractor);
      whitelistDefaultSet = new Set(details.whitelistDefault);
    }
    const toAdd = new Set(whitelistDefaultSet);
    for (const line of details.whitelist) {
      const directive = directiveFromLine(line);
      if (whitelistDefaultSet.has(directive) === false) {
        continue;
      }
      toAdd.delete(directive);
      if (toAdd.size === 0) {
        break;
      }
    }
    if (toAdd.size !== 0) {
      details.whitelist.push(...Array.from(toAdd).map((a) => `# ${a}`));
    }
    details.whitelist.sort((a, b) => {
      const ad = directiveFromLine(a);
      const bd = directiveFromLine(b);
      const abuiltin = whitelistDefaultSet.has(ad);
      if (abuiltin !== whitelistDefaultSet.has(bd)) {
        return abuiltin ? -1 : 1;
      }
      return ad.localeCompare(bd);
    });
    const whitelistStr = details.whitelist.join("\n").trim();
    cachedWhitelist = whitelistStr;
    setEditorText(whitelistStr);
    if (first) {
      cmEditor.clearHistory();
    }
  };
  var importPicker = document.getElementById("importFilePicker");
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
      const content = typeof uBlockDashboard !== "undefined" && typeof uBlockDashboard.mergeNewLines === "function" ? uBlockDashboard.mergeNewLines(getEditorText().trim(), reader.result.trim()) : (getEditorText().trim() + "\n" + reader.result.trim()).trim();
      setEditorText(content);
    };
    reader.readAsText(file);
  };
  var startImportFilePicker = () => {
    if (importPicker) {
      importPicker.value = "";
    }
    importPicker?.click();
  };
  var exportWhitelist = () => {
    const val = getEditorText();
    if (val === "") {
      return;
    }
    const filename = (fallbackText.get("whitelistExportFilename") || "whitelist.txt").replace("{{datetime}}", (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-")).replace(/ +/g, "_");
    const blob = new Blob([`${val}
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
  var applyChanges = async () => {
    cachedWhitelist = getEditorText().trim();
    await sendMessage("setWhitelist", { whitelist: cachedWhitelist });
    void renderWhitelist();
  };
  var revertChanges = () => {
    setEditorText(cachedWhitelist);
  };
  var getCloudData = () => {
    return getEditorText();
  };
  var setCloudData = (data, append) => {
    if (typeof data !== "string") {
      return;
    }
    if (append) {
      data = typeof uBlockDashboard !== "undefined" && typeof uBlockDashboard.mergeNewLines === "function" ? uBlockDashboard.mergeNewLines(getEditorText().trim(), data) : getEditorText().trim() + "\n" + data;
    }
    setEditorText(data.trim());
  };
  if (typeof self !== "undefined") {
    self.cloud = {
      onPush: getCloudData,
      onPull: setCloudData
    };
    self.wikilink = "https://github.com/gorhill/uBlock/wiki/Dashboard:-Trusted-sites";
    self.hasUnsavedData = () => {
      return getEditorText().trim() !== cachedWhitelist;
    };
  }
  document.getElementById("importWhitelistFromFile")?.addEventListener("click", startImportFilePicker);
  importPicker?.addEventListener("change", handleImportFile);
  document.getElementById("exportWhitelistToFile")?.addEventListener("click", exportWhitelist);
  document.getElementById("whitelistApply")?.addEventListener("click", () => {
    void applyChanges();
  });
  document.getElementById("whitelistRevert")?.addEventListener("click", revertChanges);
  applyThemeClasses();
  applyFallbackTranslations();
  void renderWhitelist();
})();
