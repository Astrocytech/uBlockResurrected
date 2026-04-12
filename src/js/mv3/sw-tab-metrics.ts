/*******************************************************************************

    uBlock Origin - MV3 Tab Metrics
    https://github.com/gorhill/uBlock

    This file contains tab metrics and badge update functions.

*******************************************************************************/

import { popupState } from './sw-storage.js';

export interface TabSwitchMetrics {
    popupBlockedCount: number;
    largeMediaCount: number;
    remoteFontCount: number;
    scriptCount: number;
}

export const getTabSwitchMetrics = async (tabId: number): Promise<TabSwitchMetrics> => {
    if (chrome.scripting?.executeScript === undefined) {
        return {
            popupBlockedCount: 0,
            largeMediaCount: 0,
            remoteFontCount: 0,
            scriptCount: 0,
        };
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const win = window as Window & Record<string, any>;
                return {
                    popupBlockedCount: win.__ubrPopupBlockedCount || 0,
                    largeMediaCount: win.__ubrLargeMediaCount || 0,
                    remoteFontCount: win.__ubrRemoteFontCount || 0,
                    scriptCount: win.__ubrScriptCount || 0,
                };
            },
        });

        if (results && results[0]) {
            return results[0];
        }
    } catch {
    }

    return {
        popupBlockedCount: 0,
        largeMediaCount: 0,
        remoteFontCount: 0,
        scriptCount: 0,
    };
};

export const getHiddenElementCountForTab = async (tabId: number): Promise<number> => {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                return document.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden], [aria-hidden="true"]').length;
            },
        });

        if (results && results[0] !== undefined) {
            return results[0] as number;
        }
    } catch {
    }
    return 0;
};

export const updateBadge = async (): Promise<void> => {
    const { globalAllowedRequestCount, globalBlockedRequestCount } = popupState;
    const total = globalAllowedRequestCount + globalBlockedRequestCount;
    
    if (total === 0) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    const badgeText = total >= 10000 
        ? `${(total / 1000).toFixed(1)}k`
        : total.toString();
    
    chrome.action.setBadgeText({ text: badgeText });
    
    const color = globalBlockedRequestCount > 0 ? '#5c5' : '#cc5';
    chrome.action.setBadgeBackgroundColor({ color });
};

export const updateToolbarIcon = async (
    tabId: number,
    options: { filtering?: boolean; clickToLoad?: string }
): Promise<void> => {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab?.url) return;

        const url = new URL(tab.url);
        const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
        
        let iconPath = 'img/toolbar-icon-19.png';
        let iconPath38 = 'img/toolbar-icon-38.png';
        
        if (options.clickToLoad) {
            iconPath = 'img/toolbar-icon-19-ent.json';
            iconPath38 = 'img/toolbar-icon-38-ent.json';
        } else if (options.filtering === false) {
            iconPath = 'img/toolbar-icon-19-dis.json';
            iconPath38 = 'img/toolbar-icon-38-dis.json';
        }
        
        if (isHttp) {
            chrome.action.setIcon({
                tabId,
                path: { '19': iconPath, '38': iconPath38 },
            });
        } else {
            chrome.action.setIcon({
                tabId,
                path: { '19': 'img/toolbar-icon-19-dis.png', '38': 'img/toolbar-icon-38-dis.png' },
            });
        }
    } catch {
    }
};

export const persistGlobalRequestCounts = async (): Promise<void> => {
    await chrome.storage.local.set({
        globalAllowedRequestCount: popupState.globalAllowedRequestCount,
        globalBlockedRequestCount: popupState.globalBlockedRequestCount,
    });
};
