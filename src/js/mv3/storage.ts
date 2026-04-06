/**
 * uBlock Origin - MV3 Service Worker
 * Storage Helpers
 */

import { vAPI } from './vapi-bg.js';

interface UserFiltersSettings {
    enabled: boolean;
    trusted: boolean;
}

interface UserFiltersData {
    content: string;
    enabled: boolean;
    trusted: boolean;
    success: boolean;
}

interface Statistics {
    allowed: number;
    blocked: number;
    [key: string]: number;
}

interface SaveFiltersResult {
    saved: boolean;
    filters?: string[];
    reason?: string;
}

vAPI.localStorage = {
    getItem: function(key: string): unknown {
        let result: unknown = null;
        chrome.storage.local.get(key, function(data) {
            result = (data as Record<string, unknown>)[key];
        });
        return result;
    },
    setItem: function(key: string, value: unknown): void {
        const obj: Record<string, unknown> = {};
        obj[key] = value;
        chrome.storage.local.set(obj);
    },
    removeItem: function(key: string): void {
        chrome.storage.local.remove(key);
    },
    clear: function(): void {
        chrome.storage.local.clear();
    },
    getItemAsync: function(key: string): Promise<string> {
        return chrome.storage.local.get(key).then(function(data) {
            return ((data as Record<string, string>)[key] || "") as string;
        });
    },
    setItemAsync: function(key: string, value: unknown): Promise<void> {
        const obj: Record<string, unknown> = {};
        obj[key] = value;
        return chrome.storage.local.set(obj) as unknown as Promise<void>;
    },
    removeItemAsync: function(key: string): Promise<void> {
        return chrome.storage.local.remove(key) as unknown as Promise<void>;
    },
    start: function(): Promise<void> {
        return Promise.resolve();
    }
};

vAPI.storage = {
    get: function(keys: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>> {
        return chrome.storage.local.get(keys) as Promise<Record<string, unknown>>;
    },
    set: function(details: Record<string, unknown>): Promise<void> {
        return chrome.storage.local.set(details) as unknown as Promise<void>;
    },
    getItemAsync: function(key: string): Promise<unknown> {
        return chrome.storage.local.get(key).then(function(data) {
            return (data as Record<string, unknown>)[key] || null;
        });
    },
    setItemAsync: function(key: string, value: unknown): Promise<void> {
        const obj: Record<string, unknown> = {};
        obj[key] = value;
        return chrome.storage.local.set(obj) as unknown as Promise<void>;
    },
    removeItemAsync: function(key: string): Promise<void> {
        return chrome.storage.local.remove(key) as unknown as Promise<void>;
    }
};

const storage = {
    readUserFilters: function(): Promise<UserFiltersData> {
        return chrome.storage.local.get(['user-filters', 'userFiltersSettings']).then(function(data) {
            const settings = (data as Record<string, UserFiltersSettings>).userFiltersSettings || { enabled: true, trusted: false };
            return {
                content: (data as Record<string, string>)['user-filters'] || '',
                enabled: settings.enabled,
                trusted: settings.trusted,
                success: true
            };
        });
    },

    writeUserFilters: function(content: string, options: { enabled?: boolean; trusted?: boolean }): Promise<void> {
        const settings: UserFiltersSettings = {
            enabled: options.enabled !== false,
            trusted: options.trusted === true
        };
        return chrome.storage.local.set({
            'user-filters': content || '',
            userFiltersSettings: settings
        } as Record<string, unknown>) as unknown as Promise<void>;
    },

    appendUserFilters: function(filters: string | string[]): Promise<SaveFiltersResult> {
        const self = this;
        return chrome.storage.local.get('user-filters').then(function(data) {
            let currentFilters = (data as Record<string, string>)['user-filters'] || '';
            let filtersToSave = Array.isArray(filters) ? filters : [filters];

            filtersToSave = filtersToSave.filter(function(f) { return f && f.trim(); });

            if (filtersToSave.length === 0) {
                return { saved: false, reason: 'no valid filters' };
            }

            const newFiltersText = filtersToSave.join('\n');
            const newContent = currentFilters ? currentFilters + '\n' + newFiltersText : newFiltersText;

            return chrome.storage.local.set({ 'user-filters': newContent }).then(function() {
                return { saved: true, filters: filtersToSave };
            });
        });
    },

    readWhitelist: function(): Promise<string[]> {
        return chrome.storage.local.get('netWhitelist').then(function(data) {
            return (data as Record<string, string[]>).netWhitelist || [];
        });
    },

    writeWhitelist: function(whitelist: string[]): Promise<void> {
        return chrome.storage.local.set({ netWhitelist: whitelist } as Record<string, unknown>) as unknown as Promise<void>;
    },

    readSettings: function(): Promise<Record<string, unknown>> {
        return chrome.storage.local.get('userSettings').then(function(data) {
            return (data as Record<string, Record<string, unknown>>).userSettings || {};
        });
    },

    writeSettings: function(settings: Record<string, unknown>): Promise<void> {
        return chrome.storage.local.set({ userSettings: settings } as Record<string, unknown>) as unknown as Promise<void>;
    },

    readStatistics: function(): Promise<Statistics> {
        return chrome.storage.local.get('statistics').then(function(data) {
            return (data as Record<string, Statistics>).statistics || { allowed: 0, blocked: 0 };
        });
    },

    writeStatistics: function(stats: Statistics): Promise<void> {
        return chrome.storage.local.set({ statistics: stats } as Record<string, unknown>) as unknown as Promise<void>;
    },

    getBytesInUse: function(): Promise<number> {
        return chrome.storage.local.getBytesInUse();
    }
};

export { storage, vAPI };
