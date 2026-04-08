import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const toolOverlayPath = path.resolve(process.cwd(), 'src/js/scripting/tool-overlay.js');

test.describe('Zapper Bootstrap', () => {
    test('delivers the startup handshake after the iframe UI loads', async ({ page }) => {
        const toolOverlayScript = await readFile(toolOverlayPath, 'utf8');
        const hostUrl = 'https://example.test/host.html';
        const iframeUrl = 'https://example.test/zapper-ui.html';

        await page.route(hostUrl, async route => {
            await route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><html><head></head><body><main id="content">test</main></body></html>',
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
                    '  if (port) {',
                    '    port.postMessage({ what: "iframeReady" });',
                    '  }',
                    '  window.parent.postMessage({ what: "startOverlayReceived" }, "*");',
                    '});',
                    '</script>',
                    '</body></html>',
                ].join(''),
            });
        });

        await page.goto(hostUrl);
        await page.evaluate(() => {
            const globalWindow = window as typeof window & {
                __overlayMessages?: unknown[];
                __frameEvents?: string[];
            };
            globalWindow.__overlayMessages = [];
            globalWindow.__frameEvents = [];
            window.addEventListener('message', event => {
                globalWindow.__frameEvents?.push(event.data?.what ?? '');
            });
        });
        await page.evaluate((resolvedIframeUrl: string) => {
            const runtime = {
                getURL(pathname: string) {
                    return pathname === '/zapper-ui.html' ? resolvedIframeUrl : pathname;
                },
                sendMessage() {
                    return Promise.resolve();
                },
            };

            Object.defineProperty(window, 'chrome', {
                configurable: true,
                value: {
                    runtime,
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
            const globalWindow = window as typeof window & { __overlayMessages: unknown[] };
            window.ubolOverlay.install('/zapper-ui.html', message => {
                globalWindow.__overlayMessages.push(message);
            });
        });

        await expect.poll(async () => {
            return page.evaluate(() => {
                const globalWindow = window as typeof window & {
                    __overlayMessages: Array<{ what?: string }>;
                    __frameEvents: string[];
                };
                return {
                    overlayMessages: globalWindow.__overlayMessages.map(message => message.what ?? ''),
                    frameEvents: globalWindow.__frameEvents,
                };
            });
        }).toEqual(expect.objectContaining({
            overlayMessages: expect.arrayContaining([ 'iframeReady' ]),
            frameEvents: expect.arrayContaining([ 'startOverlayReceived' ]),
        }));

        const iframeExists = await page.locator('iframe[data-ubol-overlay]').count();
        expect(iframeExists).toBe(1);
    });
});
