/*******************************************************************************

    vAPI Tests
    Tests for the vAPI (uBlock API) functionality.

******************************************************************************/

import { test, expect } from '@playwright/test';
import { join } from 'path';

const SOURCE_PATH = join(process.cwd(), 'src');

test.describe('vAPI Tests', () => {

    test.describe('vapi.js - Content Script vAPI', () => {

        test('vAPI exists in popup-fenix.html', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const vapiScript = page.locator('script[src="js/vapi.js"]');
            await expect(vapiScript).toBeAttached();
        });

        test('vAPI defines clientId', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            await page.waitForLoadState('domcontentloaded');
            const result = await page.evaluate(() => {
                return {
                    vAPIExists: typeof vAPI !== 'undefined',
                    hasClientId: typeof vAPI !== 'undefined' && 'clientId' in vAPI,
                    hasSessionId: typeof vAPI !== 'undefined' && 'sessionId' in vAPI,
                    hasMessaging: typeof vAPI !== 'undefined' && 'messaging' in vAPI
                };
            });
            expect(result.vAPIExists).toBeTruthy();
            expect(result.hasClientId).toBeTruthy();
        });

        test('vAPI defines sessionId', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasSessionId = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.sessionId === 'string';
            });
            expect(hasSessionId).toBeTruthy();
        });

        test('vAPI defines extensionURL function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasExtensionURL = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.extensionURL === 'function';
            });
            expect(hasExtensionURL).toBeTruthy();
        });

        test('vAPI defines getMessage function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasGetMessage = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.getMessage === 'function';
            });
            expect(hasGetMessage).toBeTruthy();
        });

        test('vAPI defines i18n function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasI18n = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.i18n === 'function';
            });
            expect(hasI18n).toBeTruthy();
        });

        test('vAPI defines messaging object', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasMessaging = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.messaging === 'object';
            });
            expect(hasMessaging).toBeTruthy();
        });

        test('vAPI messaging has send function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasSend = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && 
                       vAPI.messaging && 
                       typeof vAPI.messaging.send === 'function';
            });
            expect(hasSend).toBeTruthy();
        });

        test('vAPI defines mustInject function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasMustInject = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.mustInject === 'function';
            });
            expect(hasMustInject).toBeTruthy();
        });

        test('vAPI defines userSettings object', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasUserSettings = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.userSettings === 'object';
            });
            expect(hasUserSettings).toBeTruthy();
        });

        test('vAPI userSettings has expected properties', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasExpectedSettings = await page.evaluate(() => {
                if (typeof vAPI === 'undefined' || typeof vAPI.userSettings !== 'object') {
                    return false;
                }
                const settings = vAPI.userSettings;
                return 'hnRunning' in settings && 
                       'noCosmeticFiltering' in settings;
            });
            expect(hasExpectedSettings).toBeTruthy();
        });

        test('vAPI defines randomToken function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasRandomToken = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.randomToken === 'function';
            });
            expect(hasRandomToken).toBeTruthy();
        });

        test('vAPI randomToken returns string', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const returnsString = await page.evaluate(() => {
                if (typeof vAPI === 'undefined' || typeof vAPI.randomToken !== 'function') {
                    return false;
                }
                const token = vAPI.randomToken();
                return typeof token === 'string' && token.length > 0;
            });
            expect(returnsString).toBeTruthy();
        });

    });

    test.describe('vapi-client.js - Client Messaging', () => {

        test('vapi-client.js loads after vapi.js', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const scripts = await page.evaluate(() => {
                const scriptTags = Array.from(document.querySelectorAll('script[src]'));
                const vapiIndex = scriptTags.findIndex(s => s.src.includes('vapi.js'));
                const clientIndex = scriptTags.findIndex(s => s.src.includes('vapi-client.js'));
                return { vapiIndex, clientIndex };
            });
            expect(scripts.vapiIndex).toBeLessThan(scripts.clientIndex);
        });

        test('vAPI defines MessageEmitter', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasMessageEmitter = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.MessageEmitter === 'function';
            });
            expect(hasMessageEmitter).toBeTruthy();
        });

        test('vAPI defines sendMessage function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasSendMessage = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.sendMessage === 'function';
            });
            expect(hasSendMessage).toBeTruthy();
        });

        test('vAPI defines onMessage function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasOnMessage = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.onMessage === 'function';
            });
            expect(hasOnMessage).toBeTruthy();
        });

        test('vAPI defines client MessageEmitter instance', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasClient = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && 
                       vAPI.client && 
                       vAPI.client instanceof vAPI.MessageEmitter;
            });
            expect(hasClient).toBeTruthy();
        });

        test('vAPI defines shutdown object', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasShutdown = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.shutdown === 'object';
            });
            expect(hasShutdown).toBeTruthy();
        });

        test('vAPI shutdown has add function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasShutdownAdd = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && 
                       vAPI.shutdown && 
                       typeof vAPI.shutdown.add === 'function';
            });
            expect(hasShutdownAdd).toBeTruthy();
        });

    });

    test.describe('vapi-common.js - Common Utilities', () => {

        test('vapi-common.js loads in popup', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasCommon = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && 
                       typeof vAPI.getElementSelector === 'function';
            });
            expect(hasCommon).toBeTruthy();
        });

        test('vAPI defines responsive behavior', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasResponsive = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.responsiveBehavior === 'function';
            });
            expect(hasResponsive).toBeTruthy();
        });

        test('vAPI defines sanitizeHostname function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasSanitize = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.sanitizeHostname === 'function';
            });
            expect(hasSanitize).toBeTruthy();
        });

        test('vAPI sanitizeHostname removes www prefix', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const sanitizes = await page.evaluate(() => {
                if (typeof vAPI === 'undefined' || typeof vAPI.sanitizeHostname !== 'function') {
                    return false;
                }
                return vAPI.sanitizeHostname('www.example.com') === 'example.com';
            });
            expect(sanitizes).toBeTruthy();
        });

        test('vAPI defines normalizeSelector function', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasNormalize = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.normalizeSelector === 'function';
            });
            expect(hasNormalize).toBeTruthy();
        });

        test('vAPI normalizeSelector trims whitespace', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const normalizes = await page.evaluate(() => {
                if (typeof vAPI === 'undefined' || typeof vAPI.normalizeSelector !== 'function') {
                    return false;
                }
                return vAPI.normalizeSelector('  .class  ') === '.class';
            });
            expect(normalizes).toBeTruthy();
        });

        test('vAPI defines webextFlavor', async ({ page }) => {
            await page.goto(`file://${SOURCE_PATH}/popup-fenix.html`);
            const hasFlavor = await page.evaluate(() => {
                return typeof vAPI !== 'undefined' && typeof vAPI.webextFlavor === 'string';
            });
            expect(hasFlavor).toBeTruthy();
        });

    });

    test.describe('Service Worker (sw.js)', () => {

        test('sw.js exists in build directory', async ({ page }) => {
            const fs = await import('fs');
            const swPath = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3', 'js', 'sw.js');
            const exists = fs.existsSync(swPath);
            expect(exists).toBeTruthy();
        });

        test('sw.js defines Messaging object', async ({ page }) => {
            const fs = await import('fs');
            const swPath = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3', 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging');
        });

        test('sw.js defines Zapper object', async ({ page }) => {
            const fs = await import('fs');
            const swPath = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3', 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Zapper');
        });

        test('sw.js defines Picker object', async ({ page }) => {
            const fs = await import('fs');
            const swPath = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3', 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Picker');
        });

        test('sw.js registers command listeners', async ({ page }) => {
            const fs = await import('fs');
            const swPath = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3', 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('launch-element-zapper');
            expect(content).toContain('launch-element-picker');
        });

    });

});
