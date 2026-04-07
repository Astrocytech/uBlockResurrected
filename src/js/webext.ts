/*******************************************************************************

    uBlock Origin - WebExt Compatibility Layer
    Stub for webext API

*******************************************************************************/

const webext = {
    tabs: {
        sendMessage: function(tabId, message, options) {
            return chrome.tabs.sendMessage(tabId, message, options);
        }
    }
};

export default webext;
