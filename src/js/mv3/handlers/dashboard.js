/**
 * @fileoverview Dashboard Handler
 * Handles messages from the dashboard (settings, filters, whitelist, etc.).
 * 
 * @module mv3/handlers/dashboard
 * @requires mv3/vapi-bg
 * @requires mv3/storage
 * @requires mv3/dnr
 */

/**
 * @typedef {Object} PortDetails
 * @property {number} [tabId] - Tab ID
 * @property {number} [frameId] - Frame ID
 * @property {boolean} [privileged] - Whether the port is from a privileged context
 */

/**
 * @typedef {Object} DashboardRequest
 * @property {string} what - Request type
 * @property {string} [whitelist] - Whitelist content
 * @property {string} [content] - User filters content
 * @property {boolean} [enabled] - Whether filters are enabled
 * @property {boolean} [trusted] - Whether filters are trusted
 */

/**
 * Create dashboard handler
 * @returns {Function} Handler function for messaging
 */
function createDashboardHandler() {
    /**
     * @param {DashboardRequest} request
     * @param {PortDetails} portDetails
     * @param {Function} callback
     */
    return function(request, portDetails, callback) {
        switch (request.what) {
        case 'readyToFilter':
            callback(true);
            break;

        case 'dashboardConfig':
            callback({ isAdvancedUser: true, canCloudSync: false });
            break;

        case 'getWhitelist':
            storage.readWhitelist()
                .then(function(whitelist) {
                    callback({
                        whitelist: whitelist,
                        whitelistDefault: ['chrome-extension-scheme', 'moz-extension-scheme'],
                        reBadHostname: "[^a-z0.9.\\-_[\\]:]",
                        reHostnameExtractor: "([a-z0.9.\\-_[\\]]+)(?::[\\d*]+)?\\/(?:[^\\x00-\\x20/]|$)[^\\x00-\\x20]*$",
                        success: true
                    });
                })
                .catch(function(err) {
                    console.error('[DashboardHandler] Failed to read whitelist:', err);
                    callback({ whitelist: [], success: false, error: err.message });
                });
            break;

        case 'setWhitelist':
            var whitelist = request.whitelist ? request.whitelist.split('\n') : [];
            storage.writeWhitelist(whitelist)
                .then(function() {
                    dnr.updateWhitelist();
                    callback({ success: true });
                })
                .catch(function(err) {
                    console.error('[DashboardHandler] Failed to write whitelist:', err);
                    callback({ success: false, error: err.message });
                });
            break;

        case 'readUserFilters':
            storage.readUserFilters()
                .then(function(data) {
                    callback(data);
                })
                .catch(function(err) {
                    console.error('[DashboardHandler] Failed to read user filters:', err);
                    callback({ content: '', success: false, error: err.message });
                });
            break;

        case 'writeUserFilters':
            storage.writeUserFilters(request.content || '', {
                enabled: request.enabled,
                trusted: request.trusted
            })
                .then(function() {
                    callback({ success: true });
                })
                .catch(function(err) {
                    console.error('[DashboardHandler] Failed to write user filters:', err);
                    callback({ success: false, error: err.message });
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
            storage.getBytesInUse()
                .then(function(bytes) {
                    callback({ used: bytes, quota: 10485760 });
                })
                .catch(function() {
                    callback({ used: 0, quota: 10485760 });
                });
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
