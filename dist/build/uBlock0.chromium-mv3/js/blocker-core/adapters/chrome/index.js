class ChromeAPIAdapter {
    storage = {
        async get(keys) {
            return chrome.storage.local.get(keys);
        },
        async set(items) {
            return chrome.storage.local.set(items);
        },
        async remove(keys) {
            return chrome.storage.local.remove(keys);
        },
    };
    tabs = {
        async query(queryInfo) {
            return chrome.tabs.query(queryInfo);
        },
        async get(tabId) {
            return chrome.tabs.get(tabId);
        },
        async reload(tabId, bypassCache) {
            return chrome.tabs.reload(tabId, { bypassCache });
        },
    };
    sidePanel = {
        async setOptions(options) {
            return chrome.sidePanel.setOptions(options);
        },
    };
    webNavigation = {
        onCommitted: {
            addListener(callback) {
                chrome.webNavigation.onCommitted.addListener(callback);
            },
            removeListener(callback) {
                chrome.webNavigation.onCommitted.removeListener(callback);
            },
        },
    };
    scripting = {
        async insertCSS(options) {
            return chrome.scripting.insertCSS(options);
        },
        async executeScript(options) {
            return chrome.scripting.executeScript(options);
        },
    };
}
let instance = null;
export function getChromeAdapter() {
    if (!instance) {
        instance = new ChromeAPIAdapter();
    }
    return instance;
}
export function setChromeAdapter(adapter) {
    instance = adapter;
}
//# sourceMappingURL=index.js.map