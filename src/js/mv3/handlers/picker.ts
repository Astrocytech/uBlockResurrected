/**
 * @fileoverview Element Picker Handler
 * Handles element picker (zapper) operations and user filter creation.
 */

import { vAPI } from '../vapi-bg.js';
import { storage } from '../storage.js';

interface PortDetails {
    tabId?: number;
    frameId?: number;
    privileged?: boolean;
}

interface PickerRequest {
    what: string;
    filters?: string | string[] | { filter: string };
}

function createPickerHandler() {
    return function(request: PickerRequest, portDetails: PortDetails, callback: (response?: unknown) => void): void {
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

        case 'closePicker':
            vAPI.inElementPickerMode = false;
            vAPI.inZapperMode = false;
            callback({ closed: true });
            break;

        default:
            callback({});
            break;
        }
    };
}

function handleCreateUserFilter(
    request: PickerRequest,
    portDetails: PortDetails,
    callback: (response?: unknown) => void
): void {
    let filtersToSave: string[] = [];
    
    if (typeof request.filters === 'string' && request.filters.trim()) {
        filtersToSave = [request.filters.trim()];
    } else if (Array.isArray(request.filters)) {
        filtersToSave = (request.filters as string[]).filter(function(f) { return f && f.trim(); });
    } else if (request.filters && typeof request.filters === 'object' && (request.filters as { filter?: string }).filter) {
        filtersToSave = [(request.filters as { filter: string }).filter.trim()];
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
