export interface PopupLikeData {
    tabId?: number;
}

export interface PopupPickerChrome {
    tabs?: {
        query: (queryInfo: chrome.tabs.QueryInfo) => Promise<Array<{ id?: number }>>;
    };
    scripting?: {
        executeScript: (details: chrome.scripting.ScriptInjection<unknown[], unknown>) => Promise<unknown>;
    };
}

export const launchElementPicker = async (
    popupData: PopupLikeData,
    chromeApi: PopupPickerChrome,
): Promise<boolean> => {
    if ( chromeApi.scripting === undefined ) {
        return false;
    }

    const tabId = await resolvePopupTabId(popupData, chromeApi);
    if ( tabId === null ) {
        return false;
    }

    await chromeApi.scripting.executeScript({
        target: { tabId },
        files: [
            '/js/scripting/tool-overlay.js',
            '/js/scripting/picker.js',
        ],
    });

    return true;
};

export const resolvePopupTabId = async (
    popupData: PopupLikeData,
    chromeApi: PopupPickerChrome,
): Promise<number | null> => {
    if ( typeof popupData.tabId === 'number' ) {
        return popupData.tabId;
    }

    if ( chromeApi.tabs === undefined ) {
        return null;
    }

    const tabs = await chromeApi.tabs.query({
        active: true,
        lastFocusedWindow: true,
    });

    const tabId = tabs[0]?.id;
    return typeof tabId === 'number' ? tabId : null;
};
