import { test, expect } from '@playwright/test';

import {
    injectZapperScripts,
    resolvePopupTabId,
} from '../../src/js/popup-zapper';

test.describe('Popup Zapper Launch', () => {
    test('falls back to the active tab when popup data has no tab id', async () => {
        const queryCalls: Array<chrome.tabs.QueryInfo> = [];
        const executeCalls: Array<chrome.scripting.ScriptInjection<unknown[], unknown>> = [];

        const chromeApi = {
            tabs: {
                async query(queryInfo: chrome.tabs.QueryInfo) {
                    queryCalls.push(queryInfo);
                    return [ { id: 321 } ];
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
        expect(resolvedTabId).toBe(321);

        const injected = await injectZapperScripts({}, chromeApi);
        expect(injected).toBe(true);
        expect(queryCalls).toEqual([
            { active: true, lastFocusedWindow: true },
            { active: true, lastFocusedWindow: true },
        ]);
        expect(executeCalls).toEqual([
            {
                target: { tabId: 321 },
                files: [
                    '/js/scripting/tool-overlay.js',
                    '/js/scripting/zapper.js',
                ],
            },
        ]);
    });

    test('prefers popupData.tabId when it is already available', async () => {
        const queryCalls: Array<chrome.tabs.QueryInfo> = [];
        const executeCalls: Array<chrome.scripting.ScriptInjection<unknown[], unknown>> = [];

        const chromeApi = {
            tabs: {
                async query(queryInfo: chrome.tabs.QueryInfo) {
                    queryCalls.push(queryInfo);
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

        const injected = await injectZapperScripts({ tabId: 123 }, chromeApi);
        expect(injected).toBe(true);
        expect(queryCalls).toEqual([]);
        expect(executeCalls[0]?.target).toEqual({ tabId: 123 });
    });
});
