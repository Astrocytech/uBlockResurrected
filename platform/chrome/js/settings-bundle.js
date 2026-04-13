(() => {
  // settings.ts
  (function() {
    "use strict";
    const messaging = vAPI.messaging;
    const document = window.document;
    const dom = {
      qs: function(selector) {
        return document.querySelector(selector);
      },
      qsa: function(selector) {
        return document.querySelectorAll(selector);
      },
      ev: function(element, event, handler) {
        if (element instanceof HTMLElement) {
          element.addEventListener(event, handler);
        }
      },
      cl: {
        has: function(element, className) {
          return element instanceof HTMLElement && element.classList.contains(className);
        },
        toggle: function(element, className, state) {
          if (element instanceof HTMLElement) {
            element.classList.toggle(className, state);
          }
        }
      }
    };
    const getAllSettings = async function() {
      return new Promise(function(resolve) {
        messaging.send("dashboard", { what: "userSettings" }, function(response) {
          resolve(response || {});
        });
      });
    };
    const setSetting = async function(name, value) {
      return new Promise(function(resolve) {
        messaging.send("dashboard", { what: "userSettings", name, value }, function(response) {
          resolve(response || {});
        });
      });
    };
    const applySettingsToUI = function(settings) {
      if (!settings || typeof settings !== "object") {
        return;
      }
      for (const name in settings) {
        if (!Object.prototype.hasOwnProperty.call(settings, name)) {
          continue;
        }
        const value = settings[name];
        const input = dom.qs('[data-setting-name="' + name + '"]');
        if (input instanceof HTMLInputElement) {
          if (input.type === "checkbox") {
            input.checked = value === true;
          } else if (input.type === "color" || input.type === "number" || input.type === "text") {
            input.value = value !== void 0 ? value : "";
          }
        } else if (input instanceof HTMLSelectElement) {
          input.value = value !== void 0 ? value : "";
        }
      }
      dom.cl.toggle(document.documentElement, "colored", settings.uiAccentCustom === true);
    };
    const bindSettingInputs = function() {
      const inputs = dom.qsa("[data-setting-name]");
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (input instanceof HTMLInputElement) {
          if (input.type === "checkbox") {
            dom.ev(input, "change", function() {
              const name = input.getAttribute("data-setting-name");
              const value = input.checked;
              setSetting(name, value);
              handleSpecialSettings(name, value);
            });
          } else if (input.type === "color" || input.type === "number" || input.type === "text") {
            dom.ev(input, "change", function() {
              const name = input.getAttribute("data-setting-name");
              let value = input.value;
              if (input.type === "number") {
                value = parseInt(value, 10) || 0;
                if (name === "largeMediaSize") {
                  value = Math.min(Math.max(value, 0), 1e6);
                  input.value = value.toString();
                }
              }
              setSetting(name, value);
            });
          }
        } else if (input instanceof HTMLSelectElement) {
          dom.ev(input, "change", function() {
            const name = input.getAttribute("data-setting-name");
            const value = input.value;
            setSetting(name, value);
            handleSpecialSettings(name, value);
          });
        }
      }
    };
    const handleSpecialSettings = function(name, value) {
      if (name === "uiTheme" || name === "uiAccentCustom" || name === "uiAccentCustom0") {
        applyTheme();
      }
      if (name === "colorBlindFriendly") {
        dom.cl.toggle(document.documentElement, "colorBlind", value === true);
      }
      if (name === "advancedUserEnabled") {
        dom.cl.toggle(document.body, "advancedUser", value === true);
      }
    };
    const applyTheme = function() {
      const root = document.documentElement;
      const themeSelect = dom.qs('[data-setting-name="uiTheme"]');
      const accentCustom = dom.qs('[data-setting-name="uiAccentCustom"]');
      const accentColor = dom.qs('[data-setting-name="uiAccentCustom0"]');
      const theme = themeSelect instanceof HTMLSelectElement ? themeSelect.value : "auto";
      const useCustomAccent = accentCustom instanceof HTMLInputElement && accentCustom.checked;
      const customColor = accentColor instanceof HTMLInputElement ? accentColor.value : "#3498d6";
      let isDark = false;
      if (theme === "dark") {
        isDark = true;
      } else if (theme === "light") {
        isDark = false;
      } else {
        isDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
      root.classList.toggle("dark", isDark);
      root.classList.toggle("light", !isDark);
      if (useCustomAccent) {
        root.style.setProperty("--accent-color", customColor);
      } else {
        root.style.removeProperty("--accent-color");
      }
    };
    const updateStorageDisplay = async function() {
      const storageUsed = dom.qs("#storageUsed");
      const lastBackupPrompt = dom.qs("#settingsLastBackupPrompt");
      const lastRestorePrompt = dom.qs("#settingsLastRestorePrompt");
      const localData = await new Promise(function(resolve) {
        messaging.send("dashboard", { what: "getLocalData" }, function(resp) {
          resolve(resp || {});
        });
      });
      let v = localData.storageUsed || 0;
      let unit = "";
      if (typeof v === "number") {
        if (v < 1e3) {
          unit = " bytes";
        } else if (v < 1e6) {
          v = v / 1e3;
          unit = " KB";
        } else if (v < 1e9) {
          v = v / 1e6;
          unit = " MB";
        } else {
          v = v / 1e9;
          unit = " GB";
        }
      }
      if (storageUsed) {
        storageUsed.textContent = "Storage used: " + v.toLocaleString(void 0, { maximumSignificantDigits: 3 }) + unit;
      }
      const timeOptions = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        timeZoneName: "short"
      };
      if (lastBackupPrompt && localData.lastBackupTime) {
        const dt = new Date(localData.lastBackupTime);
        lastBackupPrompt.textContent = "Last backup: " + dt.toLocaleString("fullwide", timeOptions);
        lastBackupPrompt.style.display = "";
      }
      if (lastRestorePrompt && localData.lastRestoreTime) {
        const dt = new Date(localData.lastRestoreTime);
        lastRestorePrompt.textContent = "Last restore: " + dt.toLocaleString("fullwide", timeOptions);
        lastRestorePrompt.style.display = "";
      }
      if (localData.cloudStorageSupported === false) {
        const cloudInput = dom.qs('[data-setting-name="cloudStorageEnabled"]');
        if (cloudInput instanceof HTMLInputElement) {
          cloudInput.disabled = true;
        }
      }
      if (localData.privacySettingsSupported === false) {
        const prefetchInput = dom.qs('[data-setting-name="prefetchingDisabled"]');
        if (prefetchInput instanceof HTMLInputElement) {
          prefetchInput.disabled = true;
        }
        const hyperInput = dom.qs('[data-setting-name="hyperlinkAuditingDisabled"]');
        if (hyperInput instanceof HTMLInputElement) {
          hyperInput.disabled = true;
        }
        const webrtcInput = dom.qs('[data-setting-name="webrtcIPAddressHidden"]');
        if (webrtcInput instanceof HTMLInputElement) {
          webrtcInput.disabled = true;
        }
      }
    };
    const handleExport = async function() {
      const response = await new Promise(function(resolve) {
        messaging.send("dashboard", { what: "backupUserData" }, function(resp) {
          resolve(resp || {});
        });
      });
      if (response && response.userData) {
        const data = JSON.stringify(response.userData, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = response.localData?.lastBackupFile || "ublock-resurrected-backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateStorageDisplay();
      }
    };
    const handleImport = function() {
      const fileInput = dom.qs("#restoreFilePicker");
      if (!fileInput) {
        return;
      }
      fileInput.click();
      dom.ev(fileInput, "change", function() {
        const file = fileInput.files ? fileInput.files[0] : null;
        if (!file) {
          return;
        }
        const reader = new FileReader();
        reader.onload = async function(e) {
          let userData;
          try {
            userData = JSON.parse(e.target.result);
            if (typeof userData !== "object") {
              throw "Invalid";
            }
            if (typeof userData.userSettings !== "object") {
              throw "Invalid";
            }
          } catch {
            window.alert("Invalid backup file format");
            return;
          }
          const time = new Date(userData.timeStamp);
          const msg = "Confirm restore from backup created on " + time.toLocaleString() + "?";
          const proceed = window.confirm(msg);
          if (proceed !== true) {
            return;
          }
          const response = await new Promise(function(resolve) {
            messaging.send("dashboard", {
              what: "restoreUserData",
              userData,
              file: file.name
            }, function(resp) {
              resolve(resp || {});
            });
          });
          if (response && response.localData) {
            const settings = await getAllSettings();
            applySettingsToUI(settings);
            applyTheme();
            handleSpecialSettings("advancedUserEnabled", settings.advancedUserEnabled);
            const restoreTime = response.localData.lastRestoreTime ? new Date(response.localData.lastRestoreTime).toLocaleString() : "unknown";
            showLastRestorePrompt(restoreTime);
            updateStorageDisplay();
          }
        };
        reader.readAsText(file);
        fileInput.value = "";
      });
    };
    const handleReset = async function() {
      const confirmed = window.confirm("Are you sure you want to reset all settings to defaults? This will also clear your filter lists, whitelist, and custom rules.");
      if (!confirmed) {
        return;
      }
      const response = await new Promise(function(resolve) {
        messaging.send("dashboard", { what: "resetUserData" }, function(resp) {
          resolve(resp || {});
        });
      });
      const settings = await getAllSettings();
      applySettingsToUI(settings);
      applyTheme();
      handleSpecialSettings("advancedUserEnabled", settings.advancedUserEnabled);
      updateStorageDisplay();
    };
    const showLastRestorePrompt = function(timestamp) {
      const prompt = dom.qs("#settingsLastRestorePrompt");
      if (!prompt) {
        return;
      }
      const text = "Last restore: " + (timestamp || "unknown");
      prompt.textContent = text;
      prompt.style.display = "";
      prompt.style.color = "";
      setTimeout(function() {
        prompt.style.display = "none";
      }, 5e3);
    };
    const init = async function() {
      const settings = await getAllSettings();
      applySettingsToUI(settings);
      applyTheme();
      bindSettingInputs();
      updateStorageDisplay();
      const advancedLink = dom.qs('[data-i18n-title="settingsAdvancedUserSettings"]');
      if (advancedLink) {
        dom.ev(advancedLink, "click", function() {
          window.open("advanced-settings.html", "_blank");
        });
      }
      const exportBtn = dom.qs("#export");
      if (exportBtn) {
        dom.ev(exportBtn, "click", handleExport);
      }
      const importBtn = dom.qs("#import");
      if (importBtn) {
        dom.ev(importBtn, "click", handleImport);
      }
      const resetBtn = dom.qs("#reset");
      if (resetBtn) {
        dom.ev(resetBtn, "click", handleReset);
      }
      const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof darkQuery.addEventListener === "function") {
        darkQuery.addEventListener("change", function() {
          const themeSelect = dom.qs('[data-setting-name="uiTheme"]');
          if (themeSelect instanceof HTMLSelectElement && themeSelect.value === "auto") {
            applyTheme();
          }
        });
      }
      document.body.classList.remove("notReady");
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
})();
