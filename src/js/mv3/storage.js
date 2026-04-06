/**
 * uBlock Origin - MV3 Service Worker
 * Storage Helpers
 */

import { vAPI } from './vapi-bg.js';

vAPI.localStorage = {
    getItem: function(key) {
        var result = null;
        chrome.storage.local.get(key, function(data) {
            result = data[key];
        });
        return result;
    },
    setItem: function(key, value) {
        var obj = {};
        obj[key] = value;
        chrome.storage.local.set(obj);
    },
    removeItem: function(key) {
        chrome.storage.local.remove(key);
    },
    clear: function() {
        chrome.storage.local.clear();
    },
    getItemAsync: function(key) {
        return chrome.storage.local.get(key).then(function(data) {
            return data[key] || "";
        });
    },
    setItemAsync: function(key, value) {
        var obj = {};
        obj[key] = value;
        return chrome.storage.local.set(obj);
    },
    removeItemAsync: function(key) {
        return chrome.storage.local.remove(key);
    },
    start: function() {
        return Promise.resolve();
    }
};

vAPI.storage = {
    get: function(keys) {
        return chrome.storage.local.get(keys);
    },
    set: function(details) {
        return chrome.storage.local.set(details);
    },
    getItemAsync: function(key) {
        return chrome.storage.local.get(key).then(function(data) {
            return data[key] || null;
        });
    },
    setItemAsync: function(key, value) {
        var obj = {};
        obj[key] = value;
        return chrome.storage.local.set(obj);
    },
    removeItemAsync: function(key) {
        return chrome.storage.local.remove(key);
    }
};

var storage = {
    readUserFilters: function() {
        return chrome.storage.local.get(['user-filters', 'userFiltersSettings']).then(function(data) {
            var settings = data.userFiltersSettings || { enabled: true, trusted: false };
            return {
                content: data['user-filters'] || '',
                enabled: settings.enabled,
                trusted: settings.trusted,
                success: true
            };
        });
    },

    writeUserFilters: function(content, options) {
        var settings = {
            enabled: options.enabled !== false,
            trusted: options.trusted === true
        };
        return chrome.storage.local.set({
            'user-filters': content || '',
            userFiltersSettings: settings
        });
    },

    appendUserFilters: function(filters) {
        var self = this;
        return chrome.storage.local.get('user-filters').then(function(data) {
            var currentFilters = data['user-filters'] || '';
            var filtersToSave = Array.isArray(filters) ? filters : [filters];

            filtersToSave = filtersToSave.filter(function(f) { return f && f.trim(); });

            if (filtersToSave.length === 0) {
                return { saved: false, reason: 'no valid filters' };
            }

            var newFiltersText = filtersToSave.join('\n');
            var newContent = currentFilters ? currentFilters + '\n' + newFiltersText : newFiltersText;

            return chrome.storage.local.set({ 'user-filters': newContent }).then(function() {
                return { saved: true, filters: filtersToSave };
            });
        });
    },

    readWhitelist: function() {
        return chrome.storage.local.get('netWhitelist').then(function(data) {
            return data.netWhitelist || [];
        });
    },

    writeWhitelist: function(whitelist) {
        return chrome.storage.local.set({ netWhitelist: whitelist });
    },

    readSettings: function() {
        return chrome.storage.local.get('userSettings').then(function(data) {
            return data.userSettings || {};
        });
    },

    writeSettings: function(settings) {
        return chrome.storage.local.set({ userSettings: settings });
    },

    readStatistics: function() {
        return chrome.storage.local.get('statistics').then(function(data) {
            return data.statistics || { allowed: 0, blocked: 0 };
        });
    },

    writeStatistics: function(stats) {
        return chrome.storage.local.set({ statistics: stats });
    },

    getBytesInUse: function() {
        return chrome.storage.local.getBytesInUse();
    }
};

export { storage, vAPI };
