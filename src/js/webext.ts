/*******************************************************************************

    uBlock Origin - WebExt Compatibility Layer
    Stub for webext API

*******************************************************************************/

const webext = {
    tabs: {
        sendMessage: function(tabId, message, options) {
            return chrome.tabs.sendMessage(tabId, message, options);
        }
    },
    storage: {
        local: undefined as typeof chrome.storage.local,
        session: undefined as typeof chrome.storage.session,
        sync: undefined as typeof chrome.storage.sync,
    }
};

// Initialize storage APIs - these may not be available in all contexts
try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        webext.storage.local = chrome.storage.local;
        webext.storage.session = chrome.storage.session;
        webext.storage.sync = chrome.storage.sync;
    }
} catch (e) {
    // Storage not available in this context
}

// Export globally for other scripts
(window as any).webext = webext;
export default webext;
