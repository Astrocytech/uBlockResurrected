/**
 * uBlock Origin - MV3 Service Worker
 * Element Picker Handler
 */

import { vAPI } from '../vapi-bg.js';
import { storage } from '../storage.js';

function createPickerHandler() {
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

function handleCreateUserFilter(request, portDetails, callback) {
    var filtersToSave = [];
    if (typeof request.filters === 'string' && request.filters.trim()) {
        filtersToSave = [request.filters.trim()];
    } else if (Array.isArray(request.filters)) {
        filtersToSave = request.filters;
    } else if (request.filters && typeof request.filters === 'object' && request.filters.filter) {
        filtersToSave = [request.filters.filter.trim()];
    }

    storage.appendUserFilters(filtersToSave).then(function(result) {
        callback(result);
    }).catch(function(e) {
        callback({ saved: false, error: e.message });
    });
}

export { createPickerHandler };
