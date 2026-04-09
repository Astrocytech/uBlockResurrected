import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const toolOverlayPath = path.resolve(process.cwd(), 'src/js/scripting/tool-overlay.js');

test.describe('Tool Overlay Bridge', () => {
    test('responds to frame-initiated picker requests over the message channel', async ({ page }) => {
        const toolOverlayScript = await readFile(toolOverlayPath, 'utf8');
        const hostUrl = 'https://example.test/host.html';
        const iframeUrl = 'https://example.test/picker-ui.html';

        await page.route(hostUrl, async route => {
            await route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><html><body><div id="target">target</div></body></html>',
            });
        });
        await page.route(iframeUrl, async route => {
            await route.fulfill({
                contentType: 'text/html',
                body: [
                    '<!doctype html>',
                    '<html><body>',
                    '<script>',
                    'window.addEventListener("message", event => {',
                    '  if (event.data?.what !== "startOverlay") { return; }',
                    '  const port = event.ports[0];',
                    '  port.onmessage = ev => {',
                    '    window.__response = ev.data;',
                    '  };',
                    '  port.postMessage({',
                    '    fromFrameId: 1,',
                    '    msg: { what: "candidatesAtPoint", mx: 50, my: 50 }',
                    '  });',
                    '}, { once: true });',
                    '</script>',
                    '</body></html>',
                ].join(''),
            });
        });

        await page.goto(hostUrl);
        await page.evaluate((resolvedIframeUrl: string) => {
            Object.defineProperty(window, 'chrome', {
                configurable: true,
                value: {
                    runtime: {
                        getURL(pathname: string) {
                            return pathname === '/picker-ui.html' ? resolvedIframeUrl : pathname;
                        },
                        sendMessage() {
                            return Promise.resolve();
                        },
                    },
                    i18n: {
                        getMessage(key: string) {
                            return key;
                        },
                    },
                },
            });
        }, iframeUrl);
        await page.addScriptTag({ content: toolOverlayScript });

        await page.evaluate(() => {
            window.ubolOverlay.install('/picker-ui.html', msg => {
                if (msg.what === 'candidatesAtPoint') {
                    return {
                        partsDB: [ [ 1, 'div' ] ],
                        listParts: [ [ 1 ] ],
                        sliderParts: [ [ 1 ] ],
                    };
                }
            });
        });

        const iframeHandle = await page.waitForSelector('iframe[data-ubol-overlay]');
        const frame = await iframeHandle.contentFrame();
        expect(frame).toBeTruthy();

        await expect.poll(async () => {
            return frame!.evaluate(() => (window as typeof window & { __response?: unknown }).__response);
        }).toEqual(expect.objectContaining({
            fromFrameId: 1,
            msg: {
                partsDB: [ [ 1, 'div' ] ],
                listParts: [ [ 1 ] ],
                sliderParts: [ [ 1 ] ],
            },
        }));
    });
});
