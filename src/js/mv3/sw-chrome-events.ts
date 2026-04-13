/*******************************************************************************

    uBlock Origin - MV3 Chrome Event Handlers
    Registers chrome.commands, chrome.webRequest, and chrome.runtime handlers

******************************************************************************/

export const registerChromeEventHandlers = (
    trackPendingRequest: (details: any) => void,
    finalizeTrackedRequest: (details: any, isError: boolean) => Promise<void>,
    clearTabRequestState: (tabId: number) => void,
    pageStores: Map<number, any>,
    Zapper: any,
    Picker: any,
    applyPersistedHostnameSwitchesForTab: (tabId: number, url: string) => Promise<void>,
    registerYouTubeAdBlocker: (applyPersistedHostnameSwitchesForTab: (tabId: number, url: string) => Promise<void>) => void,
) => {
    chrome.commands.onCommand.addListener((command) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (!tabId) return;

            switch (command) {
                case 'launch-element-zapper':
                    Zapper.activate(tabId);
                    break;
                case 'launch-element-picker':
                    Picker.activate(tabId);
                    break;
                case 'open-dashboard':
                    chrome.runtime.openOptionsPage();
                    break;
                case 'launch-logger':
                    chrome.tabs.create({ url: 'logger-ui.html' });
                    break;
            }
        });
    });

    chrome.webRequest.onBeforeRequest.addListener(
        details => {
            trackPendingRequest(details);
        },
        { urls: [ '<all_urls>' ] },
    );

    chrome.webRequest.onCompleted.addListener(
        details => {
            void finalizeTrackedRequest(details, false);
        },
        { urls: [ '<all_urls>' ] },
    );

    chrome.webRequest.onErrorOccurred.addListener(
        details => {
            void finalizeTrackedRequest(details, true);
        },
        { urls: [ '<all_urls>' ] }
    );

    chrome.tabs.onRemoved.addListener(tabId => {
        void clearTabRequestState(tabId);
        const pageStore = pageStores.get(tabId);
        if (pageStore) {
            pageStore.disposeFrameStores();
            pageStores.delete(tabId);
        }
    });

    registerYouTubeAdBlocker(applyPersistedHostnameSwitchesForTab);

    chrome.runtime.onInstalled.addListener((details) => {
        if (details.reason === 'install') {
            console.log('uBlock Origin installed');
        } else if (details.reason === 'update') {
            console.log('uBlock Origin updated');
        }
    });

    console.log('uBlock Origin MV3 Service Worker started');
};
