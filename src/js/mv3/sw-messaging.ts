/*******************************************************************************

    uBlock Origin - MV3 Messaging
    https://github.com/gorhill/uBlock

    This file contains legacy messaging and port management.

******************************************************************************/

import type { LegacyMessagingAPI, LegacyPortDetails } from './sw-types.js';

export const legacyBackendState = {
    initializing: null as Promise<void> | null,
    initialized: false,
};

export const epickerArgs = {
    target: '',
    mouse: '',
    zap: false,
    eprom: null as any,
};

export const getLegacyMessaging = (): LegacyMessagingAPI | undefined => {
    return (globalThis as any).vAPI?.messaging;
};

export const registerLegacyPort = (port: chrome.runtime.Port): LegacyPortDetails | undefined => {
    const messaging = getLegacyMessaging();
    if (!messaging) return undefined;
    
    const details: LegacyPortDetails = {
        port,
        privileged: false,
    };
    
    messaging.ports.set(port.name, details);
    return details;
};

export const getDeviceName = async (): Promise<string> => {
    const stored = await chrome.storage.local.get('cloudOptions');
    const name = stored?.cloudOptions?.deviceName;
    if (name) return name;
    
    const info = await chrome.runtime.getPlatformInfo();
    const os = info.os || 'unknown';
    const deviceName = `${os}-device-${Date.now().toString(36).slice(-6)}`;
    await chrome.storage.local.set({ cloudOptions: { deviceName } });
    return deviceName;
};

export const encodeCloudData = async (data: any): Promise<string> => {
    const json = JSON.stringify(data);
    const encoded = btoa(json);
    return encoded;
};

export const decodeCloudData = async (encoded: string): Promise<any> => {
    try {
        const json = atob(encoded);
        return JSON.parse(json);
    } catch {
        return null;
    }
};

export const cloudPush = async (data: any): Promise<void> => {
    const encoded = await encodeCloudData(data);
    try {
        if (chrome.storage.sync) {
            await chrome.storage.sync.set({ cloudData: encoded });
        } else {
            await chrome.storage.local.set({ cloudData: encoded });
        }
    } catch (e) {
        console.log('[MV3] cloudPush error:', e);
    }
};

export const cloudPull = async (): Promise<any> => {
    try {
        const stored = chrome.storage.sync
            ? await chrome.storage.sync.get('cloudData')
            : await chrome.storage.local.get('cloudData');
        if (stored?.cloudData) {
            return await decodeCloudData(stored.cloudData);
        }
    } catch (e) {
        console.log('[MV3] cloudPull error:', e);
    }
    return null;
};

export const broadcastFilteringBehaviorChanged = async (): Promise<void> => {
    const messaging = getLegacyMessaging();
    if (!messaging) return;
    
    for (const [, details] of messaging.ports) {
        try {
            details.port.postMessage({
                channel: 'filtersBehaviorChanged',
                payload: null,
            });
        } catch (e) {
        }
    }
};

export const broadcastFilteringBehaviorChangedToTabs = async (): Promise<void> => {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.id) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { what: 'filteringBehaviorChanged' });
                } catch {
                }
            }
        }
    } catch (e) {}
};

export const withDisabledRuntimeOnConnect = async <T>(callback: () => Promise<T>): Promise<T> => {
    const originalOnConnect = chrome.runtime.onConnect;
    try {
        callback();
    } finally {
    }
};