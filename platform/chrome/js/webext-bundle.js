(() => {
  // webext.ts
  var webext = {
    tabs: {
      sendMessage: function(tabId, message, options) {
        return chrome.tabs.sendMessage(tabId, message, options);
      }
    },
    storage: {
      local: void 0,
      session: void 0,
      sync: void 0
    }
  };
  try {
    if (typeof chrome !== "undefined" && chrome.storage) {
      webext.storage.local = chrome.storage.local;
      webext.storage.session = chrome.storage.session;
      webext.storage.sync = chrome.storage.sync;
    }
  } catch (e) {
  }
  window.webext = webext;
  var webext_default = webext;
})();
