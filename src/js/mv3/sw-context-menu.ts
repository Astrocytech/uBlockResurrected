/*******************************************************************************

    uBlock Origin - MV3 Context Menu
    https://github.com/gorhill/uBlock

    This file contains context menu functionality.

*******************************************************************************/

export const createContextMenu = (userSettings: { contextMenuEnabled?: boolean }) => {
    if (typeof chrome.contextMenus === 'undefined') {
        console.log('[MV3] chrome.contextMenus not available');
        return;
    }
    
    chrome.contextMenus.removeAll(() => {
        if ( userSettings.contextMenuEnabled === false ) {
            return;
        }
        chrome.contextMenus.create({
            id: 'uBlock0-blockElement',
            title: 'Block element...',
            contexts: ['all'],
            documentUrlPatterns: ['http://*/*', 'https://*/*']
        }, () => {
            console.log('[MV3] Context menu created');
        });
    });
};

export const setupContextMenuListener = () => {
    chrome.contextMenus?.onClicked?.addListener((details, tab) => {
        if (details.menuItemId === 'uBlock0-blockElement' && tab) {
            const tabId = tab.id;
            if ( typeof tabId !== 'number' ) { return; }
            const frameId = typeof details.frameId === 'number' ? details.frameId : 0;
            let target = '';
            
            if (details.linkUrl) {
                target = `a\t${details.linkUrl}`;
            } else if (details.srcUrl) {
                if (details.mediaType === 'image') {
                    target = `img\t${details.srcUrl}`;
                } else if (details.mediaType === 'video') {
                    target = `video\t${details.srcUrl}`;
                } else if (details.mediaType === 'audio') {
                    target = `audio\t${details.srcUrl}`;
                } else {
                    target = `${details.tagName || 'img'}\t${details.srcUrl}`;
                }
            } else if (details.frameUrl) {
                target = `iframe\t${details.frameUrl}`;
            } else if (details.tagName) {
                target = details.tagName;
            }
            
            console.log('[MV3] Context menu clicked - target:', target);
            
            void (self as any).µb.elementPickerExec(tabId, frameId, target).catch(error => {
                console.error('[MV3] Failed to launch picker from context menu', error);
            });
        }
    });
};

export const initContextMenu = (userSettings: { contextMenuEnabled?: boolean }) => {
    createContextMenu(userSettings);
    setupContextMenuListener();
};
