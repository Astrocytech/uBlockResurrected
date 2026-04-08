import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const zapperUiPath = path.resolve(process.cwd(), 'src/js/scripting/zapper-ui.js');

test.describe('Zapper Undo State', () => {
    test('disables undo at zero and enables it when removals exist', async ({ page }) => {
        const zapperUiScript = await readFile(zapperUiPath, 'utf8');

        await page.setContent(`
            <!doctype html>
            <html>
            <body>
                <div id="quit"></div>
                <div id="undo" aria-disabled="true"></div>
                <span id="removeCount">0</span>
                <svg id="overlay"><path></path><path></path></svg>
                <div id="tooltip"></div>
            </body>
            </html>
        `);

        await page.evaluate(() => {
            (window as typeof window & { __port?: MessagePort }).__port = undefined;
        });
        await page.addScriptTag({ content: zapperUiScript });

        const initialState = await page.evaluate(() => ({
            ariaDisabled: document.getElementById('undo')?.getAttribute('aria-disabled'),
            count: document.getElementById('removeCount')?.textContent,
        }));
        expect(initialState).toEqual({
            ariaDisabled: 'true',
            count: '0',
        });

        await page.evaluate(() => {
            const channel = new MessageChannel();
            (window as typeof window & { __port?: MessagePort }).__port = channel.port1;
            window.postMessage({ what: 'startOverlay' }, '*', [ channel.port2 ]);
        });

        await page.evaluate(() => {
            (window as typeof window & { __port?: MessagePort }).__port?.postMessage({
                what: 'updateCount',
                count: 2,
            });
        });

        const enabledState = await page.evaluate(() => ({
            ariaDisabled: document.getElementById('undo')?.getAttribute('aria-disabled'),
            count: document.getElementById('removeCount')?.textContent,
        }));
        expect(enabledState).toEqual({
            ariaDisabled: 'false',
            count: '2',
        });

        await page.evaluate(() => {
            (window as typeof window & { __port?: MessagePort }).__port?.postMessage({
                what: 'updateCount',
                count: 0,
            });
        });

        const resetState = await page.evaluate(() => ({
            ariaDisabled: document.getElementById('undo')?.getAttribute('aria-disabled'),
            count: document.getElementById('removeCount')?.textContent,
        }));
        expect(resetState).toEqual({
            ariaDisabled: 'true',
            count: '0',
        });
    });
});
