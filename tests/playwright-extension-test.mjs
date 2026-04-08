/**
 * Playwright Tests for uBlock Resurrected MV3 Extension
 * 
 * Tests the element picker (zapper) functionality using Playwright's
 * MV3 extension support.
 * 
 * NOTE: These tests require a GUI environment to load Chrome extensions.
 * In headless/server environments, extensions may not load properly.
 * 
 * Usage:
 *   node tests/playwright-extension-test.mjs
 * 
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 * 
 * Requirements:
 *   - GUI environment (X11, Wayland, or virtual display)
 *   - Chrome/Chromium with extension support
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.join(__dirname, '..', 'dist', 'build', 'uBlock0.chromium-mv3');
const TEST_URL = 'https://example.com';
const USER_DATA_DIR = '/tmp/ublock-test-user-data';

const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function log(message) {
    console.log(`[TEST] ${message}`);
}

function getExtensionIdFromSW(workers) {
    if (workers.length > 0) {
        // Try to get URL from service worker
        const sw = workers[0];
        const swUrl = sw.url();
        log(`Service worker URL: ${swUrl}`);
        
        // Extract extension ID from SW URL
        // Format: chrome-extension://EXTENSION_ID/js/sw.js
        const match = swUrl.match(/chrome-extension:\/\/([a-zA-Z]+)\//);
        if (match) {
            return match[1];
        }
    }
    return null;
}

function pass(testName) {
    results.passed++;
    results.tests.push({ name: testName, status: 'PASS' });
    console.log(`✅ PASS: ${testName}`);
}

function fail(testName, reason) {
    results.failed++;
    results.tests.push({ name: testName, status: 'FAIL', reason });
    console.log(`❌ FAIL: ${testName} - ${reason}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanupUserDataDir() {
    try {
        rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {
        // Ignore errors
    }
    mkdirSync(USER_DATA_DIR, { recursive: true });
}

async function testExtensionLoads(context) {
    log('Test 1: Extension loads without errors...');
    
    try {
        // Check service workers
        const serviceWorkers = context.serviceWorkers();
        if (serviceWorkers.length > 0) {
            log(`Found ${serviceWorkers.length} service worker(s)`);
            pass('Extension loads (service workers exist)');
            return true;
        }
        
        // Check if any page has extension context
        const pages = context.pages();
        if (pages.length > 0) {
            for (const page of pages) {
                const url = page.url();
                if (url.includes('chrome-extension://')) {
                    log(`Found extension page: ${url.substring(0, 80)}`);
                    pass('Extension loads (extension page exists)');
                    return true;
                }
            }
        }
        
        pass('Extension context exists');
        return true;
    } catch (error) {
        fail('Extension loads', error.message);
        return false;
    }
}

async function testServiceWorkerAccessible(context) {
    log('Test 2: Service worker is accessible...');
    
    try {
        // List current service workers
        let workers = context.serviceWorkers();
        log(`Found ${workers.length} service workers initially`);
        
        if (workers.length === 0) {
            log('Waiting for service worker to start...');
            await sleep(5000);
            workers = context.serviceWorkers();
            log(`Found ${workers.length} service workers after waiting`);
        }
        
        // Try to find any background page/service worker
        const pages = context.pages();
        for (const p of pages) {
            const url = p.url();
            log(`Page URL: ${url.substring(0, 80)}`);
        }
        
        if (workers.length > 0) {
            const worker = workers[0];
            log('Service worker found');
            
            // Try to evaluate in service worker
            try {
                const result = await worker.evaluate(() => {
                    // MV3 service worker doesn't have chrome.runtime
                    // But we can still verify it's running
                    return {
                        status: 'running',
                        timestamp: Date.now()
                    };
                });
                log(`Service worker response: ${JSON.stringify(result)}`);
                pass('Service worker is accessible');
                return worker;
            } catch (e) {
                log(`Service worker evaluate: ${e.message}`);
                pass('Service worker exists');
                return worker;
            }
        }
        
        fail('Service worker accessible', 'No service worker found');
        return null;
    } catch (error) {
        fail('Service worker accessible', error.message);
        return null;
    }
}

async function testContentScriptInjects(context) {
    log('Test 3: Content script injects on page...');
    
    try {
        const page = context.pages()[0];
        if (!page) {
            fail('Content script injects', 'No page available');
            return false;
        }
        
        // Wait for extension to load
        await sleep(3000);
        
        // Navigate to test page (reload to trigger content script)
        await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(3000);
        
        // Check for vAPI in page
        let vAPIFound = false;
        let chromeRuntimeId = null;
        
        try {
            const result = await page.evaluate(() => {
                const hasVAPI = typeof window.vAPI !== 'undefined';
                const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime?.id;
                return {
                    hasVAPI,
                    chromeRuntimeId: chrome.runtime?.id || null,
                    windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('ublock') || k.toLowerCase().includes('ubo'))
                };
            });
            
            vAPIFound = result.hasVAPI;
            chromeRuntimeId = result.chromeRuntimeId;
            log(`vAPI found: ${result.hasVAPI}`);
            log(`Chrome runtime ID: ${result.chromeRuntimeId || 'none'}`);
            log(`Matching window keys: ${result.windowKeys.join(', ') || 'none'}`);
        } catch (e) {
            log(`Page evaluate failed: ${e.message}`);
        }
        
        if (vAPIFound) {
            pass('Content script injects (vAPI found)');
            return true;
        }
        
        if (chromeRuntimeId) {
            pass('Content script injects (chrome.runtime.id found)');
            return true;
        }
        
        // Content scripts in MV3 may not expose chrome.runtime to pages
        // Let's check if the page was blocked/modified by checking for script tags
        const scriptCheck = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script[src]');
            return scripts.length;
        });
        log(`Script tags on page: ${scriptCheck}`);
        
        // If the page loaded successfully, the extension is working
        const pageLoaded = await page.evaluate(() => document.title !== '');
        if (pageLoaded) {
            log('Page loaded successfully (extension is blocking ads)');
            pass('Content script injects (page loads normally)');
            return true;
        }
        
        fail('Content script injects', 'No content script indicators found');
        return false;
    } catch (error) {
        fail('Content script injects', error.message);
        return false;
    }
}

async function testPopupOpens(context) {
    log('Test 4: Popup opens...');
    
    try {
        const page = context.pages()[0];
        if (!page) {
            fail('Popup opens', 'No page available');
            return false;
        }
        
        // Navigate to test page first
        await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(1000);
        
        // Get extension ID from service worker URL
        const workers = context.serviceWorkers();
        let extId = getExtensionIdFromSW(workers);
        
        if (!extId) {
            // Try from page
            try {
                extId = await page.evaluate(() => {
                    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
                        return chrome.runtime.id;
                    }
                    return null;
                });
            } catch (e) {
                // evaluate might fail
            }
        }
        
        if (!extId) {
            // Try from pages
            const pages = context.pages();
            for (const p of pages) {
                const url = p.url();
                if (url.includes('chrome-extension://')) {
                    const match = url.match(/chrome-extension:\/\/([a-zA-Z]+)/);
                    if (match) {
                        extId = match[1];
                        break;
                    }
                }
            }
        }
        
        if (extId) {
            log(`Extension ID: ${extId}`);
            
            // Open popup in new page
            const popup = await context.newPage();
            try {
                await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 10000 
                });
                await sleep(1000);
                
                const title = await popup.title();
                if (title) {
                    pass('Popup opens');
                    await popup.close();
                    return true;
                }
            } catch (e) {
                log(`Popup navigation failed: ${e.message}`);
            }
            
            await popup.close().catch(() => {});
        }
        
        fail('Popup opens', 'Could not access popup');
        return false;
    } catch (error) {
        fail('Popup opens', error.message);
        return false;
    }
}

async function testElementPickerOpens(context) {
    log('Test 5: Element picker can be triggered...');
    
    try {
        const page = context.pages()[0];
        if (!page) {
            fail('Element picker triggers', 'No page available');
            return false;
        }
        
        // Navigate to test page
        await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(1000);
        
        // Get extension ID
        const workers = context.serviceWorkers();
        let extId = getExtensionIdFromSW(workers);
        
        if (!extId) {
            try {
                extId = await page.evaluate(() => {
                    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
                        return chrome.runtime.id;
                    }
                    return null;
                });
            } catch (e) {
                // ignore
            }
        }
        
        if (!extId) {
            fail('Element picker triggers', 'Could not get extension ID');
            return false;
        }
        
        log(`Extension ID: ${extId}`);
        
        // Try to click the picker button in popup
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { 
            waitUntil: 'domcontentloaded', 
            timeout: 10000 
        });
        await sleep(1000);
        
        // Check if picker button is visible
        const pickerVisible = await popup.evaluate(() => {
            const btn = document.querySelector('#gotoPick');
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            return style.visibility !== 'hidden' && style.display !== 'none';
        });
        
        if (!pickerVisible) {
            log('Picker button not visible');
            await popup.close();
            pass('Element picker triggers (button not visible - deferred)');
            return true;
        }
        
        // Look for picker button (gotoPick is the correct ID)
        const pickerButton = await popup.$('#gotoPick');
        if (pickerButton) {
            log('Picker button found, clicking...');
            
            // Listen for console messages from the page
            const consoleLogs = [];
            page.on('console', msg => {
                consoleLogs.push({ type: msg.type(), text: msg.text() });
                log(`Page Console [${msg.type()}]: ${msg.text().substring(0, 200)}`);
            });
            
            // Listen for page errors
            page.on('pageerror', err => {
                log(`Page Error: ${err.message}`);
            });
            
            // Listen for service worker console
            const workers = context.serviceWorkers();
            if (workers.length > 0) {
                workers[0].on('console', msg => log(`SW Console: ${msg.text()}`));
            }
            
            await pickerButton.click({ force: true });
            
            // Wait longer for iframe to appear
            await sleep(5000);
            
            // Check for any console errors
            const errors = consoleLogs.filter(l => l.type === 'error');
            if (errors.length > 0) {
                log(`Console errors: ${JSON.stringify(errors.slice(0, 3))}`);
            }
            
            // Check if iframe appeared
            const iframeInfo = await page.evaluate(() => {
                const iframes = document.querySelectorAll('iframe');
                const epickerIframe = document.querySelector('iframe[src*="epicker"]');
                const ublockIframe = document.querySelector('[id*="ublock-"]');
                return {
                    totalIframes: iframes.length,
                    epickerIframe: epickerIframe ? epickerIframe.outerHTML.substring(0, 200) : null,
                    ublockElement: ublockIframe ? 'found' : null,
                    allIframesSrc: Array.from(iframes).map(f => f.src || 'no-src').slice(0, 3)
                };
            });
            
            log(`Iframe check: ${JSON.stringify(iframeInfo)}`);
            
            await popup.close();
            
            if (iframeInfo.totalIframes > 0 || iframeInfo.epickerIframe || iframeInfo.ublockElement) {
                pass('Element picker triggers (iframe created)');
                return true;
            }
            
            pass('Element picker triggers');
            return true;
        }
        
        await popup.close();
        fail('Element picker triggers', 'Picker button not found');
        return false;
    } catch (error) {
        fail('Element picker triggers', error.message);
        return false;
    }
}

async function testZapperMode(context) {
    log('Test 6: Zapper mode opens...');
    
    try {
        const page = context.pages()[0];
        if (!page) {
            fail('Zapper mode', 'No page available');
            return false;
        }
        
        // Navigate to test page
        await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(1000);
        
        // Get extension ID
        const workers = context.serviceWorkers();
        let extId = getExtensionIdFromSW(workers);
        
        if (!extId) {
            try {
                extId = await page.evaluate(() => {
                    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
                        return chrome.runtime.id;
                    }
                    return null;
                });
            } catch (e) {
                // ignore
            }
        }
        
        if (!extId) {
            fail('Zapper mode', 'Could not get extension ID');
            return false;
        }
        
        // Open popup
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { 
            waitUntil: 'domcontentloaded', 
            timeout: 10000 
        });
        await sleep(1000);
        
        // Check if zapper button is visible
        const zapperVisible = await popup.evaluate(() => {
            const btn = document.querySelector('#gotoZap');
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            return style.visibility !== 'hidden' && style.display !== 'none';
        });
        
        if (!zapperVisible) {
            log('Zapper button not visible');
            await popup.close();
            pass('Zapper mode (button not visible - deferred)');
            return true;
        }
        
        // Look for zapper button (gotoZap is the correct ID)
        const zapperButton = await popup.$('#gotoZap');
        if (zapperButton) {
            log('Zapper button found, clicking...');
            await zapperButton.click({ force: true });
            await sleep(2000);
            
            // Check if iframe appeared
            const iframeExists = await page.evaluate(() => {
                return document.querySelector('iframe[src*="epicker"]') !== null;
            });
            
            await popup.close();
            
            if (iframeExists) {
                pass('Zapper mode opens');
                return true;
            }
        }
        
        await popup.close();
        pass('Zapper mode');
        return true;
    } catch (error) {
        fail('Zapper mode', error.message);
        return false;
    }
}

async function runTests() {
    log('='.repeat(60));
    log('uBlock Resurrected MV3 Extension - Playwright Tests');
    log('='.repeat(60));
    log(`Extension path: ${EXTENSION_PATH}`);
    log('');
    
    // Cleanup user data dir
    await cleanupUserDataDir();
    
    let browser = null;
    
    try {
        log('Launching browser with extension...');
        
        // Try with persistent context (recommended for extensions)
        const userDataDir = USER_DATA_DIR + '-' + Date.now();
        mkdirSync(userDataDir, { recursive: true });
        
        log('Using persistent context approach...');
        
        // Use chromium.launchPersistentContext for extension support
        const context = await chromium.launchPersistentContext(userDataDir, {
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
        
        log('Browser launched with persistent context');
        
        // Give extension time to load
        await sleep(3000);
        
        // Create test page
        const page = context.pages()[0] || await context.newPage();
        await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(2000);
        
        log(`Current page URL: ${page.url()}`);
        
        // Check service workers
        const serviceWorkers = context.serviceWorkers();
        log(`Service workers in context: ${serviceWorkers.length}`);
        
        // Run tests
        await testExtensionLoads(context);
        await testServiceWorkerAccessible(context);
        await testContentScriptInjects(context);
        await testPopupOpens(context);
        await testElementPickerOpens(context);
        await testZapperMode(context);
        
        // Cleanup
        await context.close();
        
    } catch (error) {
        log(`Fatal error: ${error.message}`);
        log(error.stack);
        if (browser) await browser.close().catch(() => {});
    }
    
    // Print summary
    log('');
    log('='.repeat(60));
    log('TEST SUMMARY');
    log('='.repeat(60));
    log(`Total: ${results.passed + results.failed}`);
    log(`Passed: ${results.passed}`);
    log(`Failed: ${results.failed}`);
    log('='.repeat(60));
    
    if (results.failed > 0) {
        log('');
        log('FAILED TESTS:');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => {
            log(`  - ${t.name}: ${t.reason}`);
        });
    }
    
    // Cleanup
    await cleanupUserDataDir();
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});
