/*******************************************************************************

    uBlock Origin - MV3 Popup Panel Handlers
    Handles all popup panel messages

*******************************************************************************/

import { PopupState } from './sw-storage.js';
import { getPopupData } from './sw-popup-data.js';

export interface PopupRequest {
    what: string;
    tabId?: number | null;
    name?: string;
    value?: any;
    hostname?: string;
    state?: boolean;
    srcHostname?: string;
    desHostname?: string;
    desHostnames?: Record<string, unknown>;
    requestType?: string;
    action?: number;
    persist?: boolean;
    url?: string;
    scope?: string;
    frameId?: number;
    frameURL?: string;
}

export const createPopupHandlers = (deps: {
    popupState: PopupState;
    getPopupData: (request: PopupRequest) => Promise<any>;
    toggleNetFiltering: (request: PopupRequest) => Promise<any>;
    toggleFirewallRule: (request: PopupRequest) => Promise<any>;
    saveFirewallRules: (request: PopupRequest) => Promise<any>;
    revertFirewallRules: (request: PopupRequest) => Promise<any>;
    toggleHostnameSwitch: (request: PopupRequest) => Promise<any>;
    setUserSetting: (request: PopupRequest) => Promise<any>;
    getTabSwitchMetrics: (tabId: number) => Promise<any>;
    getHiddenElementCountForTab: (tabId: number) => Promise<number>;
    pageStoreFromTabId: (tabId: number) => Promise<any>;
}) => {
    const {
        popupState,
        getPopupData,
        toggleNetFiltering,
        toggleFirewallRule,
        saveFirewallRules,
        revertFirewallRules,
        toggleHostnameSwitch,
        setUserSetting,
        getTabSwitchMetrics,
        getHiddenElementCountForTab,
        pageStoreFromTabId,
    } = deps;

    const handlePopupPanelMessage = async (request: PopupRequest) => {
        switch ( request.what ) {
        case 'getPopupData':
            return getPopupData(request);
        case 'toggleNetFiltering':
            return toggleNetFiltering(request);
        case 'toggleFirewallRule':
            return toggleFirewallRule(request);
        case 'saveFirewallRules':
            return saveFirewallRules(request);
        case 'revertFirewallRules':
            return revertFirewallRules(request);
        case 'getScriptCount':
            return request.tabId ? (await getTabSwitchMetrics(request.tabId)).scriptCount : 0;
        case 'getHiddenElementCount':
            return request.tabId ? await getHiddenElementCountForTab(request.tabId) : 0;
        case 'toggleHostnameSwitch':
            return toggleHostnameSwitch(request);
        case 'userSettings':
            return setUserSetting(request);
        case 'readyToFilter':
            return popupState.initialized;
        case 'clickToLoad': {
            const tabId = request.tabId as number;
            const frameId = request.frameId as number;
            const frameURL = request.frameURL as string;
            if (tabId && frameId && frameURL) {
                const pageStore = await pageStoreFromTabId(tabId);
                if (pageStore) {
                    await pageStore.clickToLoad(frameId, frameURL);
                }
            }
            return { success: true };
        }
        default:
            return undefined;
        }
    };

    return { handlePopupPanelMessage };
};

export const handlePopupPanelMessage = createPopupHandlers({
    popupState: {} as PopupState,
    getPopupData: async () => ({}),
    toggleNetFiltering: async () => ({}),
    toggleFirewallRule: async () => ({}),
    saveFirewallRules: async () => ({}),
    revertFirewallRules: async () => ({}),
    toggleHostnameSwitch: async () => ({}),
    setUserSetting: async () => ({}),
    getTabSwitchMetrics: async () => ({ scriptCount: 0 }),
    getHiddenElementCountForTab: async () => 0,
    pageStoreFromTabId: async () => null,
} as any).handlePopupPanelMessage;
