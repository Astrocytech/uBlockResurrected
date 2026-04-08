import { test, expect } from '@playwright/test';

import {
    injectPickerScripts,
    resolvePopupTabId,
} from '../../src/js/popup-picker';

test.describe('Popup Picker Launch', () => {
    test('falls back to the active tab and injects the picker dependencies in order', async () => {
        const queryCalls: Array<chrome.tabs.QueryInfo> = [];
        const executeCalls: Array<chrome.scripting.ScriptInjection<unknown[], unknown>> = [];

        const chromeApi = {
            tabs: {
                async query(queryInfo: chrome.tabs.QueryInfo) {
                    queryCalls.push(queryInfo);
                    return [ { id: 456 } ];
                },
            },
            scripting: {
                async executeScript(details: chrome.scripting.ScriptInjection<unknown[], unknown>) {
                    executeCalls.push(details);
                    return [];
                },
            },
        };

        const resolvedTabId = await resolvePopupTabId({}, chromeApi);
        expect(resolvedTabId).toBe(456);

        const injected = await injectPickerScripts({}, chromeApi);
        expect(injected).toBe(true);
        expect(queryCalls).toEqual([
            { active: true, currentWindow: true },
            { active: true, currentWindow: true },
        ]);
        expect(executeCalls).toEqual([
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
        const executeCalls: Array<chrome.scripting.ScriptInjection<unknown[], unknown>> = [];

        const chromeApi = {
            tabs: {
                async query() {
                    return [ { id: 999 } ];
                },
            },
            scripting: {
                async executeScript(details: chrome.scripting.ScriptInjection<unknown[], unknown>) {
                    executeCalls.push(details);
                    return [];
                },
            },
        };

        const injected = await injectPickerScripts({ tabId: 123 }, chromeApi);
        expect(injected).toBe(true);
        expect(executeCalls[0]).toEqual({
            target: { tabId: 123 },
            files: [
                '/js/scripting/tool-overlay.js',
                '/js/scripting/picker.js',
            ],
        });
    });
});
