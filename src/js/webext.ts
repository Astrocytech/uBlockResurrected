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
        local: chrome.storage.local,
        session: chrome.storage.session,
        sync: chrome.storage.sync,
    }
};

// Export globally for other scripts
(window as any).webext = webext;
export default webext;
