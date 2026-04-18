(() => {
  // src/js/devtools.ts
  var fallbackText = /* @__PURE__ */ new Map([
    ["3pPurgeAll", "Purge all caches"]
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
  var cmEditor = new CodeMirror(
    document.querySelector("#console"),
    {
      autofocus: true,
      foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      lineNumbers: true,
      lineWrapping: true,
      readOnly: true
    }
  );
  var log = (message) => {
    const text = cmEditor.getValue();
    cmEditor.setValue(text + message + "\n");
    cmEditor.scrollTo(0, cmEditor.getScrollInfo().height);
  };
  document.getElementById("console-clear")?.addEventListener("click", () => {
    cmEditor.setValue("");
  });
  var foldAll = () => {
    cmEditor.operation(() => {
      for (let i = 0; i < cmEditor.lineCount(); i++) {
        cmEditor.foldCode({ line: i, ch: 0 });
      }
    });
  };
  var unfoldAll = () => {
    cmEditor.operation(() => {
      for (let i = 0; i < cmEditor.lineCount(); i++) {
        const line = cmEditor.getLine(i);
        if (line.startsWith("+ ")) {
          cmEditor.foldCode({ line: i, ch: 0 }, null, "unfold");
        }
      }
    });
  };
  document.getElementById("console-fold")?.addEventListener("click", foldAll);
  document.getElementById("console-unfold")?.addEventListener("click", unfoldAll);
  document.getElementById("snfe-dump")?.addEventListener("click", async () => {
    log("=== Static Network Filtering Engine Dump ===");
    log("Note: Not available in MV3 mode");
  });
  document.getElementById("snfe-todnr")?.addEventListener("click", async () => {
    log("=== Static Network Filtering Engine to DNR ===");
    log("Note: Not available in MV3 mode");
  });
  document.getElementById("cfe-dump")?.addEventListener("click", async () => {
    log("=== Cosmetic Filtering Engine Dump ===");
    log("Note: Not available in MV3 mode");
  });
  document.getElementById("purge-all-caches")?.addEventListener("click", async () => {
    try {
      await sendMessage("purgeAllCaches");
      log("All caches purged successfully");
    } catch (e) {
      log("Failed to purge caches: " + e.message);
    }
  });
  log("=== uBlock Resurrected DevTools ===");
  log("MV3 Mode: Enabled");
  log("Use the buttons above to perform various diagnostics.");
  log("");
  applyThemeClasses();
  applyFallbackTranslations();
})();
