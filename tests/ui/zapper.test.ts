/*******************************************************************************

    Zapper Tests
    Tests for the element zapper functionality in the MV3 extension.

******************************************************************************/

import { test, expect } from '@playwright/test';
import { join } from 'path';

const SOURCE_PATH = join(process.cwd(), 'src');
const EXTENSION_PATH = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3');

test.describe('Zapper Tests', () => {

    test.describe('Service Worker Zapper Handlers', () => {

        test('zapperLaunch handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("zapperLaunch"');
        });

        test('zapperQuery handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("zapperQuery"');
        });

        test('zapperHighlight handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("zapperHighlight"');
        });

        test('zapperClick handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("zapperClick"');
        });

        test('Zapper module is exported', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('self.Zapper = Zapper');
        });

        test('Zapper has activate function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function activate(');
        });

        test('Zapper has deactivate function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function deactivate(');
        });

        test('Zapper has isActive function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function isActive(');
        });

        test('Zapper has getSessionId function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function getSessionId(');
        });

    });

    test.describe('Element Picker Handlers', () => {

        test('pickerLaunch handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("pickerLaunch"');
        });

        test('pickerQuery handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("pickerQuery"');
        });

        test('pickerCreateFilter handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("pickerCreateFilter"');
        });

        test('pickerMessage handler is registered in sw.js', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("pickerMessage"');
        });

        test('Picker module is exported', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('self.Picker = Picker');
        });

    });

    test.describe('Command Registration', () => {

        test('launch-element-zapper command is registered', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('case "launch-element-zapper"');
        });

        test('launch-element-picker command is registered', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('case "launch-element-picker"');
        });

        test('Zapper activate is called on command', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Zapper.activate(tabId)');
        });

        test('Picker activate is called on command', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Picker.activate(tabId)');
        });

    });

    test.describe('Messaging System', () => {

        test('Messaging has on function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function on(');
        });

        test('Messaging has off function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function off(');
        });

        test('Messaging has sendToTab function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function sendToTab(');
        });

        test('Messaging has sendToAllTabs function', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('function sendToAllTabs(');
        });

        test('Messaging module is exported', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('self.Messaging = Messaging');
        });

        test('ping handler is registered', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("ping"');
        });

        test('getTabId handler is registered', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("getTabId"');
        });

        test('userSettings handlers are registered', async () => {
            const fs = await import('fs');
            const swPath = join(EXTENSION_PATH, 'js', 'sw.js');
            const content = fs.readFileSync(swPath, 'utf-8');
            expect(content).toContain('Messaging.on("userSettings"');
            expect(content).toContain('Messaging.on("setUserSettings"');
        });

    });

    test.describe('Browser Command Definitions', () => {

        test('launch-element-zapper command defined in manifest', async () => {
            const fs = await import('fs');
            const manifestPath = join(process.cwd(), 'platform', 'chrome', 'manifest.json');
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            expect(manifest.commands).toBeDefined();
            expect(manifest.commands['launch-element-zapper']).toBeDefined();
        });

        test('launch-element-picker command defined in manifest', async () => {
            const fs = await import('fs');
            const manifestPath = join(process.cwd(), 'platform', 'chrome', 'manifest.json');
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            expect(manifest.commands).toBeDefined();
            expect(manifest.commands['launch-element-picker']).toBeDefined();
        });

    });

});
