import { test, expect } from '@playwright/test';

import {
    launchElementPicker,
    resolvePopupTabId,
} from '../../src/js/popup-picker';

test.describe('Popup Picker Launch', () => {
    test('falls back to the active tab and launches the original element picker', async () => {
        const queryCalls: Array<chrome.tabs.QueryInfo> = [];
        const executeScriptCalls: Array<chrome.scripting.ScriptInjection<unknown[], unknown>> = [];

        const chromeApi = {
            tabs: {
                async query(queryInfo: chrome.tabs.QueryInfo) {
                    queryCalls.push(queryInfo);
                    return [ { id: 456 } ];
                },
            },
            scripting: {
                async executeScript(
                    details: chrome.scripting.ScriptInjection<unknown[], unknown>,
                ) {
                    executeScriptCalls.push(details);
                    return undefined;
                },
            },
        };

        const resolvedTabId = await resolvePopupTabId({}, chromeApi);
        expect(resolvedTabId).toBe(456);

        const launched = await launchElementPicker({}, chromeApi);
        expect(launched).toBe(true);
        expect(queryCalls).toEqual([
            { active: true, lastFocusedWindow: true },
            { active: true, lastFocusedWindow: true },
        ]);
        expect(executeScriptCalls).toEqual([
            {
                target: { tabId: 456 },
                files: [
                    '/js/scripting/tool-overlay.js',
                    '/js/scripting/picker.js',
                ],
            },
        ]);
    });

    test('prefers popupData.tabId when it is already available', async () => {
        const executeScriptCalls: Array<chrome.scripting.ScriptInjection<unknown[], unknown>> = [];

        const chromeApi = {
            tabs: {
                async query() {
                    return [ { id: 999 } ];
                },
            },
            scripting: {
                async executeScript(
                    details: chrome.scripting.ScriptInjection<unknown[], unknown>,
                ) {
                    executeScriptCalls.push(details);
                    return undefined;
                },
            },
        };

        const launched = await launchElementPicker({ tabId: 123 }, chromeApi);
        expect(launched).toBe(true);
        expect(executeScriptCalls).toEqual([
            {
                target: { tabId: 123 },
                files: [
                    '/js/scripting/tool-overlay.js',
                    '/js/scripting/picker.js',
                ],
            },
        ]);
    });
});
