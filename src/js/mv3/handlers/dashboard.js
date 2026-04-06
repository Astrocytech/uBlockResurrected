/**
 * uBlock Origin - MV3 Service Worker
 * Dashboard Handler
 */

import { vAPI } from '../vapi-bg.js';
import { storage } from '../storage.js';
import { dnr } from '../dnr.js';

function createDashboardHandler() {
    return function(request, portDetails, callback) {
        switch (request.what) {
        case 'readyToFilter':
            callback(true);
            break;

        case 'dashboardConfig':
            callback({ isAdvancedUser: true, canCloudSync: false });
            break;

        case 'getWhitelist':
            storage.readWhitelist().then(function(whitelist) {
                callback({
                    whitelist: whitelist,
                    whitelistDefault: ['chrome-extension-scheme', 'moz-extension-scheme'],
                    reBadHostname: "[^a-z0.9.\\-_[\\]:]",
                    reHostnameExtractor: "([a-z0.9.\\-_[\\]]+)(?::[\\d*]+)?\\/(?:[^\\x00-\\x20/]|$)[^\\x00-\\x20]*$",
                    success: true
                });
            });
            break;

        case 'setWhitelist':
            var whitelist = request.whitelist ? request.whitelist.split('\n') : [];
            storage.writeWhitelist(whitelist).then(function() {
                dnr.updateWhitelist();
                callback({ success: true });
            });
            break;

        case 'readUserFilters':
            storage.readUserFilters().then(function(data) {
                callback(data);
            });
            break;

        case 'writeUserFilters':
            storage.writeUserFilters(request.content || '', {
                enabled: request.enabled,
                trusted: request.trusted
            }).then(function() {
                callback({ success: true });
            });
            break;

        case 'reloadAllFilters':
            callback({ success: true });
            break;

        case 'getAutoCompleteDetails':
            callback({});
            break;

        case 'getTrustedScriptletTokens':
            callback([]);
            break;

        case 'getFilterLists':
            callback({});
            break;

        case 'getLocalSettings':
            callback({});
            break;

        case 'setLocalSettings':
            callback({});
            break;

        case 'userSettings':
            callback({});
            break;

        case 'storageQuota':
            callback({ used: 0, quota: 0 });
            break;

        case 'cosmeticFilteringSwitch':
            callback({});
            break;

        case 'getPopupLazyData':
            callback({});
            break;

        default:
            callback({});
            break;
        }
    };
}

export { createDashboardHandler };
