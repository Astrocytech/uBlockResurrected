/**
 * @fileoverview Element Picker Handler
 * Handles element picker (zapper) operations and user filter creation.
 * 
 * @module mv3/handlers/picker
 * @requires mv3/vapi-bg
 * @requires mv3/storage
 */

/**
 * @typedef {Object} PortDetails
 * @property {number} [tabId] - Tab ID
 * @property {number} [frameId] - Frame ID
 * @property {boolean} [privileged] - Whether the port is from a privileged context
 */

/**
 * @typedef {Object} PickerRequest
 * @property {string} what - Request type
 * @property {string|string[]} [filters] - Filter(s) to create
 */

/**
 * @typedef {Object} CreateFilterResult
 * @property {boolean} saved - Whether filters were saved
 * @property {string[]} [filters] - The filters that were saved
 * @property {string} [error] - Error message if failed
 */

/**
 * Create element picker handler
 * @returns {Function} Handler function for messaging
 */
function createPickerHandler() {
    /**
     * @param {PickerRequest} request
     * @param {PortDetails} portDetails
     * @param {Function} callback
     */
    return function(request, portDetails, callback) {
        switch (request.what) {
        case 'elementPickerArguments':
            callback({
                pickerURL: chrome.runtime.getURL('web_accessible_resources/epicker-ui.html'),
                target: '',
                zap: vAPI.inZapperMode,
                eprom: null
            });
            break;

        case 'createUserFilter':
            handleCreateUserFilter(request, portDetails, callback);
            break;

        default:
            callback({});
            break;
        }
    };
}

/**
 * Handle createUserFilter request
 * @param {PickerRequest} request
 * @param {PortDetails} portDetails
 * @param {Function} callback
 */
function handleCreateUserFilter(request, portDetails, callback) {
    /** @type {string[]} */
    var filtersToSave = [];
    
    if (typeof request.filters === 'string' && request.filters.trim()) {
        filtersToSave = [request.filters.trim()];
    } else if (Array.isArray(request.filters)) {
        filtersToSave = request.filters.filter(function(f) { return f && f.trim(); });
    } else if (request.filters && typeof request.filters === 'object' && request.filters.filter) {
        filtersToSave = [request.filters.filter.trim()];
    }

    if (filtersToSave.length === 0) {
        callback({ saved: false, error: 'No valid filters provided' });
        return;
    }

    storage.appendUserFilters(filtersToSave)
        .then(function(result) {
            callback(result);
        })
        .catch(function(err) {
            console.error('[PickerHandler] Failed to save filters:', err);
            callback({ saved: false, error: err instanceof Error ? err.message : 'Unknown error' });
        });
}

export { createPickerHandler };
