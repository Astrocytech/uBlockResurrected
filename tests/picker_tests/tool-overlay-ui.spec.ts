import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const toolOverlayUiPath = path.resolve(process.cwd(), 'src/js/scripting/tool-overlay-ui.js');

test.describe('Tool Overlay UI', () => {
    test('posts highlightElementAtPoint after mouse movement when tracking is enabled', async ({ page }) => {
        const script = await readFile(toolOverlayUiPath, 'utf8');

        await page.setContent(`
            <!doctype html>
            <html>
            <body class="loading">
                <svg id="overlay"><path></path><path></path></svg>
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

        await page.addScriptTag({ content: script });

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

            window.toolOverlay.start(() => {});
            window.postMessage({
                what: 'startOverlay',
                width: 1280,
                height: 720,
            }, '*', [ channel.port2 ]);
        });

        await page.evaluate(() => {
            window.toolOverlay.highlightElementUnderMouse(true);
            document.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 100,
                clientY: 120,
                bubbles: true,
            }));
        });

        await expect.poll(async () => {
            return page.evaluate(() =>
                (window as typeof window & { __messages: string[] }).__messages
            );
        }).toContain('highlightElementAtPoint');
    });

    test('moves the picker window when the shared mover updates its position', async ({ page }) => {
        const script = await readFile(toolOverlayUiPath, 'utf8');

        await page.setContent(`
            <!doctype html>
            <html>
            <body class="loading">
                <aside style="right: 2px; bottom: 2px; width: 240px; height: 120px;">
                    <section id="windowbar">
                        <div id="move"></div>
                    </section>
                </aside>
                <svg id="overlay"><path></path><path></path></svg>
            </body>
            </html>
        `);

        await page.addScriptTag({ content: script });

        await page.evaluate(() => {
            const channel = new MessageChannel();
            window.toolOverlay.start(() => {});
            window.postMessage({
                what: 'startOverlay',
                width: 1280,
                height: 720,
                url: 'https://example.com/',
            }, '*', [ channel.port2 ]);
        });

        await page.evaluate(() => {
            window.toolOverlay.moveable = document.querySelector('aside');
            window.toolOverlay.moverX0 = 100;
            window.toolOverlay.moverY0 = 100;
            window.toolOverlay.moverX1 = 220;
            window.toolOverlay.moverY1 = 180;
            window.toolOverlay.moverCX0 = 120;
            window.toolOverlay.moverCY0 = 60;
            window.toolOverlay.moverMove();
        });

        const position = await page.locator('aside').evaluate((aside: HTMLElement) => ({
            left: aside.style.left,
            top: aside.style.top,
            right: aside.style.right,
            bottom: aside.style.bottom,
        }));

        expect(position.left).not.toBe('');
        expect(position.top).not.toBe('');
        expect(position.right).toBe('');
        expect(position.bottom).toBe('');
    });
});
