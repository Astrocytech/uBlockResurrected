/**
 * Functional Tests for Element Zapper
 * 
 * These tests verify ACTUAL functionality, not just smoke tests.
 * 
 * Usage:
 *   node tests/test-zapper-functional.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const EXTENSION_PATH = '/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/dist/build/uBlock0.chromium-mv3';
const TEST_URL = 'https://example.com';

const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function log(message, level = 'INFO') {
    const prefix = level === 'ERROR' ? '❌' : level === 'PASS' ? '✅' : level === 'FAIL' ? '❌' : '  ';
    console.log(`${prefix} ${message}`);
}

function pass(testName) {
    results.passed++;
    results.tests.push({ name: testName, status: 'PASS' });
    log(testName, 'PASS');
}

function fail(testName, reason) {
    results.failed++;
    results.tests.push({ name: testName, status: 'FAIL', reason });
    log(`${testName} - ${reason}`, 'FAIL');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getExtensionId(context) {
    const workers = context.serviceWorkers();
    for (const worker of workers) {
        const match = worker.url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
        if (match) return match[1];
    }
    return null;
}

async function openPopup(context, extId) {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
    });
    await sleep(500);
    return popup;
}

// ============================================================================
// TEST 1: Zapper Iframe Is Created
// ============================================================================
async function testZapperIframeCreated(context, extId) {
    log('Test: Zapper creates iframe...');
    
    try {
        const page = context.pages()[0] || await context.newPage();
        try { await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch(e) { /* Ignore */ }
        await sleep(1000);
        
        const popup = await openPopup(context, extId);
        
        const zapperBtn = await popup.$('#gotoZap');
        if (!zapperBtn) {
            await popup.close();
            fail('Zapper creates iframe', 'Zapper button not found');
            return false;
        }
        
        await zapperBtn.click({ force: true });
        await sleep(3000);
        
        const iframeInfo = await page.evaluate(() => {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const epickerIframe = iframes.find(f => f.src && f.src.includes('epicker'));
            return {
                count: iframes.length,
                hasEpicker: !!epickerIframe,
                url: epickerIframe?.src || null
            };
        });
        
        await popup.close();
        
        if (iframeInfo.hasEpicker && iframeInfo.url?.includes('zap=1')) {
            pass('Zapper creates iframe');
            return true;
        }
        
        fail('Zapper creates iframe', `Expected epicker iframe with zap=1, got count: ${iframeInfo.count}`);
        return false;
    } catch (error) {
        fail('Zapper creates iframe', error.message);
        return false;
    }
}

// ============================================================================
// TEST 2: Quit Button Is Visible
// ============================================================================
async function testQuitButtonVisible(context, extId) {
    log('Test: Quit button is visible...');
    
    try {
        const page = context.pages()[0] || await context.newPage();
        try { await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch(e) { /* Ignore */ }
        await sleep(1000);
        
        const popup = await openPopup(context, extId);
        
        const zapperBtn = await popup.$('#gotoZap');
        if (zapperBtn) await zapperBtn.click({ force: true });
        await sleep(3000);
        
        let quitVisible = false;
        for (const frame of page.frames()) {
            if (frame.url().includes('epicker')) {
                const quitInfo = await frame.evaluate(() => {
                    const btn = document.getElementById('quit');
                    if (!btn) return { found: false };
                    const rect = btn.getBoundingClientRect();
                    const style = window.getComputedStyle(btn);
                    return {
                        found: true,
                        width: rect.width,
                        height: rect.height,
                        visible: rect.width > 0 && rect.height > 0,
                        display: style.display,
                        visibility: style.visibility,
                        pointerEvents: style.pointerEvents
                    };
                });
                
                if (quitInfo.found && quitInfo.visible && quitInfo.pointerEvents === 'auto') {
                    quitVisible = true;
                }
                break;
            }
        }
        
        await popup.close();
        
        if (quitVisible) {
            pass('Quit button is visible');
            return true;
        }
        
        fail('Quit button is visible', 'Quit button not visible or not clickable');
        return false;
    } catch (error) {
        fail('Quit button is visible', error.message);
        return false;
    }
}

// ============================================================================
// TEST 3: Quit Button Click Works (CRITICAL)
// ============================================================================
async function testQuitButtonClickWorks(context, extId) {
    log('Test: Quit button click closes picker...');
    
    try {
        // Create fresh page
        const page = context.pages().find(p => !p.url().startsWith('chrome-extension://')) || await context.newPage();
        
        try {
            await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch(e) { /* Ignore network errors */ }
        await sleep(2000);
        
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await sleep(1000);
        
        const zapperBtn = await popup.$('#gotoZap');
        if (zapperBtn) await zapperBtn.click({ force: true });
        await sleep(4000);
        
        // Count iframes before
        const beforeCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
        
        // Use proper frame click method - evaluate inside frame to click
        let clicked = false;
        for (const frame of page.frames()) {
            if (frame.url().includes('epicker')) {
                await frame.evaluate(() => {
                    const btn = document.getElementById('quit');
                    if (btn) btn.click();
                });
                clicked = true;
                break;
            }
        }
        
        if (!clicked) {
            await popup.close();
            fail('Quit button click closes picker', 'Could not find epicker frame');
            return false;
        }
        
        await sleep(500);
        
        // Count iframes after
        const afterCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
        
        await popup.close();
        
        if (beforeCount > 0 && afterCount < beforeCount) {
            pass('Quit button click closes picker');
            return true;
        }
        
        fail('Quit button click closes picker', `Before: ${beforeCount}, After: ${afterCount}`);
        return false;
    } catch (error) {
        fail('Quit button click closes picker', error.message);
        return false;
    }
}

// ============================================================================
// TEST 4: ESC Key Quits Picker
// ============================================================================
async function testEscKeyQuitsPicker(context, extId) {
    log('Test: ESC key closes picker...');
    
    try {
        const page = context.pages()[0] || await context.newPage();
        try { await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch(e) { /* Ignore */ }
        await sleep(1000);
        
        const popup = await openPopup(context, extId);
        
        const zapperBtn = await popup.$('#gotoZap');
        if (zapperBtn) await zapperBtn.click({ force: true });
        await sleep(3000);
        
        const beforeCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
        
        // Press ESC
        await page.keyboard.press('Escape');
        await sleep(500);
        
        const afterCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
        
        await popup.close();
        
        if (beforeCount > 0 && afterCount < beforeCount) {
            pass('ESC key closes picker');
            return true;
        }
        
        fail('ESC key closes picker', `Before: ${beforeCount}, After: ${afterCount}`);
        return false;
    } catch (error) {
        fail('ESC key closes picker', error.message);
        return false;
    }
}

// ============================================================================
// TEST 5: Zapper Darkened Overlay Appears
// ============================================================================
async function testZapperOverlay(context, extId) {
    log('Test: Zapper darkened overlay appears...');
    
    try {
        const page = context.pages()[0] || await context.newPage();
        try { await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch(e) { /* Ignore */ }
        await sleep(1000);
        
        const popup = await openPopup(context, extId);
        
        const zapperBtn = await popup.$('#gotoZap');
        if (zapperBtn) await zapperBtn.click({ force: true });
        await sleep(3000);
        
        let overlayInfo = null;
        for (const frame of page.frames()) {
            if (frame.url().includes('epicker')) {
                overlayInfo = await frame.evaluate(() => {
                    const svg = document.querySelector('svg#sea');
                    if (!svg) return { found: false };
                    
                    const ocean = svg.querySelector('path:first-child');
                    const rect = svg.getBoundingClientRect();
                    
                    return {
                        found: true,
                        width: rect.width,
                        height: rect.height,
                        hasOcean: !!ocean,
                        oceanD: ocean?.getAttribute('d') || null
                    };
                });
                break;
            }
        }
        
        await popup.close();
        
        if (overlayInfo?.found && overlayInfo.hasOcean) {
            pass('Zapper darkened overlay appears');
            return true;
        }
        
        fail('Zapper darkened overlay appears', 'SVG overlay not found or incomplete');
        return false;
    } catch (error) {
        fail('Zapper darkened overlay appears', error.message);
        return false;
    }
}

// ============================================================================
// TEST 6: Pick Button Launches Picker Mode
// ============================================================================
async function testPickButtonWorks(context, extId) {
    log('Test: Pick button launches picker mode...');
    
    try {
        const page = context.pages()[0] || await context.newPage();
        try { await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch(e) { /* Ignore */ }
        await sleep(1000);
        
        const popup = await openPopup(context, extId);
        
        const pickerBtn = await popup.$('#gotoPick');
        if (!pickerBtn) {
            await popup.close();
            fail('Pick button launches picker mode', 'Picker button not found');
            return false;
        }
        
        await pickerBtn.click({ force: true });
        await sleep(3000);
        
        const hasPicker = await page.evaluate(() => {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            return iframes.some(f => f.src && f.src.includes('epicker') && !f.src.includes('zap=1'));
        });
        
        await popup.close();
        
        if (hasPicker) {
            pass('Pick button launches picker mode');
            return true;
        }
        
        fail('Pick button launches picker mode', 'Picker iframe not found');
        return false;
    } catch (error) {
        fail('Pick button launches picker mode', error.message);
        return false;
    }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runTests() {
    log('='.repeat(60));
    log('uBlock Resurrected - Zapper Functional Tests');
    log('='.repeat(60));
    log(`Extension: ${EXTENSION_PATH}`);
    log(`Test URL: ${TEST_URL}`);
    log('');
    
    const userDataDir = '/tmp/ublock-functional-test-' + Date.now();
    mkdirSync(userDataDir, { recursive: true });
    
    let context = null;
    
    try {
        log('Launching browser...');
        
        context = await chromium.launchPersistentContext(userDataDir, {
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
        
        log('Browser launched');
        await sleep(3000);
        
        const extId = await getExtensionId(context);
        if (!extId) {
            throw new Error('Could not get extension ID');
        }
        log(`Extension ID: ${extId}`);
        
        // Create test page
        const page = context.pages()[0] || await context.newPage();
        try { await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch(e) { /* Ignore */ }
        await sleep(2000);
        
        log('');
        log('-'.repeat(60));
        log('Running Tests...');
        log('-'.repeat(60));
        
        // Run all tests
        await testZapperIframeCreated(context, extId);
        await testQuitButtonVisible(context, extId);
        await testQuitButtonClickWorks(context, extId);
        await testEscKeyQuitsPicker(context, extId);
        await testZapperOverlay(context, extId);
        await testPickButtonWorks(context, extId);
        
        await context.close();
        
    } catch (error) {
        log(`Fatal error: ${error.message}`, 'ERROR');
        if (context) await context.close().catch(() => {});
    }
    
    // Print summary
    log('');
    log('='.repeat(60));
    log('TEST SUMMARY');
    log('='.repeat(60));
    log(`Total: ${results.passed + results.failed}`);
    log(`Passed: ${results.passed}`);
    log(`Failed: ${results.failed}`);
    
    if (results.failed > 0) {
        log('');
        log('FAILED TESTS:');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => {
            log(`  - ${t.name}: ${t.reason}`);
        });
    }
    
    log('='.repeat(60));
    
    process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});
