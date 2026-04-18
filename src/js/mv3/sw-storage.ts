/*******************************************************************************

    uBlock Origin - MV3 Storage
    https://github.com/gorhill/uBlock

    This file contains storage operations and popup state management.

*******************************************************************************/

import { userSettingsDefault } from './sw-types.js';
import { DynamicFirewallRules } from './sw-classes.js';
import { updateToolbarIcon } from './sw-helpers.js';

export interface PopupState {
    userSettings: typeof userSettingsDefault;
    permanentFirewall: DynamicFirewallRules;
    sessionFirewall: DynamicFirewallRules;
    permanentHostnameSwitches: Record<string, Record<string, boolean>>;
    sessionHostnameSwitches: Record<string, Record<string, boolean>>;
    globalAllowedRequestCount: number;
    globalBlockedRequestCount: number;
    whitelist: string[];
    initialized: boolean;
    initPromise: Promise<void>;
    tabMetrics: Record<number, { blocked?: number; allowed?: number; hasUnprocessedRequest?: boolean }>;
}

export const popupState: PopupState = {
    userSettings: { ...userSettingsDefault },
    permanentFirewall: new DynamicFirewallRules(),
    sessionFirewall: new DynamicFirewallRules(),
    permanentHostnameSwitches: {},
    sessionHostnameSwitches: {},
    globalAllowedRequestCount: 0,
    globalBlockedRequestCount: 0,
    whitelist: [],
    initialized: false,
    initPromise: Promise.resolve(),
    tabMetrics: {},
};

export const ensurePopupState = async (): Promise<void> => {
    if (popupState.initialized) return;
    popupState.initPromise = popupState.initPromise.then(async () => {
        if (popupState.initialized) return;
        const stored = await chrome.storage.local.get([
            'userSettings',
            'dynamicFilteringString',
            'permanentSwitches',
            'whitelist',
        ]);

        popupState.userSettings = {
            ...userSettingsDefault,
            ...(stored.userSettings || {}),
        };

        popupState.permanentFirewall.reset();
        if ( typeof stored.dynamicFilteringString === 'string' ) {
            popupState.permanentFirewall.fromString(stored.dynamicFilteringString);
        }
        popupState.sessionFirewall.assign(popupState.permanentFirewall);

        const permanentSwitches = stored.permanentSwitches instanceof Object
            ? stored.permanentSwitches as Record<string, Record<string, boolean>>
            : {};
        popupState.permanentHostnameSwitches = cloneHostnameSwitchState(permanentSwitches);
        popupState.sessionHostnameSwitches = cloneHostnameSwitchState(permanentSwitches);

        if ( Array.isArray(stored.whitelist) ) {
            popupState.whitelist = stored.whitelist.filter((entry): entry is string => typeof entry === 'string');
        } else if ( typeof stored.whitelist === 'string' ) {
            popupState.whitelist = stored.whitelist.split('\n').filter(Boolean);
        } else {
            popupState.whitelist = [];
        }

        popupState.initialized = true;
    });
    await popupState.initPromise;
};

export const persistUserSettings = async (): Promise<void> => {
    await chrome.storage.local.set({ userSettings: popupState.userSettings });
};

export const persistPermanentFirewall = async (): Promise<void> => {
    await chrome.storage.local.set({
        dynamicFilteringString: popupState.permanentFirewall.toString(),
    });
};

export const persistPermanentHostnameSwitches = async (): Promise<void> => {
    await chrome.storage.local.set({
        permanentSwitches: popupState.permanentHostnameSwitches,
    });
};

export const getModifiedSettings = (current: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> => {
    const modified: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(current)) {
        if (value !== defaults[key]) {
            modified[key] = value;
        }
    }
    return modified;
};

export const backupUserData = async (): Promise<void> => {
    await ensurePopupState();
    const storage = await chrome.storage.local.get(null);
    const storageUsed = await chrome.storage.local.getBytesInUse(null);
    const blob = new Blob([JSON.stringify(storage)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ublock-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

export const restoreUserData = async (request: { userData?: unknown; file?: string }): Promise<void> => {
    await ensurePopupState();
    if (request.userData && typeof request.userData === 'object') {
        await chrome.storage.local.set(request.userData as Record<string, unknown>);
    }
};

export const getLocalData = async (): Promise<Record<string, unknown>> => {
    const storageUsed = await chrome.storage.local.getBytesInUse(null);
    const localData = (await chrome.storage.local.get('localData')).localData || {};
    const userSettings = (await chrome.storage.local.get('userSettings')).userSettings || {};
    return {
        storageUsed,
        lastBackupFile: localData.lastBackupFile || '',
        lastBackupTime: localData.lastBackupTime || 0,
        lastRestoreFile: localData.lastRestoreFile || '',
        lastRestoreTime: localData.lastRestoreTime || 0,
        cloudStorageSupported: userSettings.cloudStorageEnabled === true && typeof chrome.storage.sync !== 'undefined',
    };
};

export const resetUserData = async (): Promise<void> => {
    popupState.userSettings = { ...userSettingsDefault };
    await persistUserSettings();
    await chrome.storage.local.set({
        selectedFilterLists: [],
        filterLists: {},
        netWhitelist: '',
        whitelist: '',
        dynamicRules: [],
    });
};

export const cloneHostnameSwitchState = (state: Record<string, Record<string, boolean>>): Record<string, Record<string, boolean>> => {
    const cloned: Record<string, Record<string, boolean>> = {};
    for (const hostname of Object.keys(state)) {
        cloned[hostname] = { ...state[hostname] };
    }
    return cloned;
};

export const applyImmediateHostnameSwitchEffects = async (tabId: number, name: string, enabled: boolean): Promise<void> => {
    if (name === 'no-popups' || name === 'no-cosmetic-filtering') {
        await updateToolbarIcon(tabId, { filtering: enabled });
    }
};
