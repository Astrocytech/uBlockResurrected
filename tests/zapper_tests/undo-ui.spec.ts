import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const zapperUiPath = path.resolve(process.cwd(), 'src/js/scripting/zapper-ui.js');

test.describe('Zapper Undo UI', () => {
    test('clicking the undo button posts undoLastRemoval to the overlay port', async ({ page }) => {
        const zapperUiScript = await readFile(zapperUiPath, 'utf8');

        await page.setContent(`
            <!doctype html>
            <html>
            <body>
                <div id="quit"></div>
                <div id="pick"></div>
                <div id="undo"></div>
                <span id="removeCount">0</span>
                <svg id="overlay"><path></path><path></path></svg>
                <div id="tooltip"></div>
            </body>
            </html>
        `);

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __messages?: string[];
                __port?: MessagePort;
            };
            globalWindow.__messages = [];
            globalWindow.__port = undefined;
        });
        await page.addScriptTag({ content: zapperUiScript });

        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __messages: string[];
                __port?: MessagePort;
            };
            const channel = new MessageChannel();
            globalWindow.__port = channel.port1;

            channel.port1.onmessage = event => {
                globalWindow.__messages.push(event.data?.what ?? '');
            };

            window.postMessage({ what: 'startOverlay' }, '*', [ channel.port2 ]);
        });

        await expect.poll(async () => {
            return page.evaluate(() =>
                (window as typeof window & { __messages: string[] }).__messages
            );
        }).toContain('startTool');

        await page.evaluate(() => {
            (window as typeof window & { __port?: MessagePort }).__port?.postMessage({
                what: 'updateCount',
                count: 1,
            });
        });

        await page.evaluate(() => {
            document.getElementById('undo')?.dispatchEvent(
                new MouseEvent('click', { bubbles: true, cancelable: true })
            );
        });

        await expect.poll(async () => {
            return page.evaluate(() =>
                (window as typeof window & { __messages: string[] }).__messages
            );
        }).toContain('undoLastRemoval');
    });
});
