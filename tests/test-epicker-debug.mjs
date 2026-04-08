/**
 * Debug test - check MessageChannel communication
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.join(__dirname, '..', 'dist', 'build', 'uBlock0.chromium-mv3');

const TEST_URL = 'https://example.com';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('=== Testing communication ===');
    
    try { rmSync('/tmp/ublock-test', { recursive: true, force: true }); } catch(e) {}
    mkdirSync('/tmp/ublock-test', { recursive: true });
    
    const context = await chromium.launchPersistentContext('/tmp/ublock-test', {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ],
        viewport: { width: 1280, height: 720 }
    });
    
    const page = context.pages()[0];
    
    // Capture ALL console from page
    page.on('console', msg => {
        const text = msg.text();
        console.log(`[PAGE ${msg.type()}]`, text.substring(0, 200));
    });
    
    await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(3000);
    
    let extId = null;
    for (const worker of context.serviceWorkers()) {
        const match = worker.url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
        if (match) extId = match[1];
    }
    
    // Open popup and click picker
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(1000);
    
    const pickerBtn = await popup.$('#gotoPick');
    if (pickerBtn) {
        console.log('\nClicking picker...');
        await pickerBtn.click({ force: true });
        await sleep(5000);
    }
    
    // Find epicker frame
    for (const frame of page.frames()) {
        if (frame.url().includes('epicker')) {
            console.log('\n=== Epicker frame found ===');
            
            // Move and click
            console.log('Moving mouse...');
            await page.mouse.move(400, 300);
            await sleep(500);
            
            console.log('Clicking...');
            await page.mouse.click(400, 300);
            await sleep(3000);
            
            // Check epicker.js state by evaluating in page context
            console.log('\n=== Checking page context (epicker.js) ===');
            try {
                const result = await page.evaluate(() => {
                    // Check if vAPI exists
                    const hasVAPI = typeof vAPI !== 'undefined';
                    
                    // Check if pickerFrame exists
                    const hasPickerFrame = hasVAPI && typeof vAPI.pickerFrame !== 'undefined';
                    
                    // Check for any global picker-related state
                    const hasPickerPort = hasVAPI && vAPI.pickerFramePort !== undefined;
                    
                    return {
                        hasVAPI,
                        hasPickerFrame,
                        hasPickerPort,
                        vAPIString: hasVAPI ? String(vAPI).substring(0, 100) : 'N/A'
                    };
                });
                console.log('Page vAPI state:', JSON.stringify(result, null, 2));
            } catch (e) {
                console.log('Error:', e.message);
            }
            
            // Now check the epicker frame
            console.log('\n=== Checking epicker frame ===');
            try {
                const result = await frame.evaluate(() => {
                    return {
                        hasPickerContentPort: typeof pickerContentPort !== 'undefined' && pickerContentPort !== null,
                        pickerContentPortReady: pickerContentPort ? 'exists' : 'null/undefined',
                    };
                });
                console.log('Frame state:', JSON.stringify(result, null, 2));
            } catch (e) {
                console.log('Error:', e.message);
            }
            
            break;
        }
    }
    
    console.log('\n=== DONE ===');
    await context.close();
}

run().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
