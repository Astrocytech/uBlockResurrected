(() => {
  // src/js/about.ts
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
  var initAbout = async () => {
    try {
      const details = await sendMessage("dashboard", {
        what: "getAboutDetails"
      });
      if (details) {
        const nameVer = document.getElementById("aboutNameVer");
        if (nameVer) {
          nameVer.textContent = `${details.appName} ${details.version}`;
        }
      }
    } catch (e) {
      const nameVer = document.getElementById("aboutNameVer");
      if (nameVer) {
        nameVer.textContent = "uBlock Resurrected";
      }
    }
  };
  var applyLinkTargets = () => {
    for (const link of document.querySelectorAll('div.body a[href^="http"]')) {
      link.target = "_blank";
    }
  };
  applyThemeClasses();
  applyLinkTargets();
  void initAbout();
})();
