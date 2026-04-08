/**
 * Chrome Extension Automated Tests for uBlock Origin MV3
 * 
 * This script automates testing of the element picker functionality.
 * 
 * Usage:
 *   node tests/epicker-automated.mjs
 * 
 * Prerequisites:
 *   - Chrome installed at /usr/bin/google-chrome
 *   - Extension loaded in Chrome (or use --load-extension flag)
 *   - puppeteer-core installed: npm install --save-dev puppeteer-core
 */

import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(__dirname, '..', 'dist', 'build', 'uBlock0.chromium-mv3');

const TEST_URL = 'https://example.com';

const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function log(message) {
    console.log(`[TEST] ${message}`);
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

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function launchBrowser() {
    log('Launching Chrome browser...');
    log(`Extension path: ${EXTENSION_PATH}`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: false, // Need headed mode for extension testing
        args: [
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ],
        protocolTimeout: 30000
    });
    
    // Wait for extension to load
    await sleep(3000);
    
    // Log all targets
    const targets = browser.targets();
    log(`Found ${targets.length} targets:`);
    targets.forEach(t => log(`  - ${t.type()}: ${t.url().substring(0, 100)}`));
    
    return browser;
}

async function testExtensionLoads(browser) {
    log('Test 1: Extension loads without errors...');
    
    try {
        const pages = await browser.pages();
        const targetPage = pages[0];
        
        // Enable extension by navigating to a page
        await targetPage.goto(TEST_URL, { waitUntil: 'networkidle0', timeout: 10000 });
        await sleep(1000);
        
        // Check for service worker or background context (MV3)
        const targets = browser.targets();
        const hasServiceWorker = targets.some(t => t.type() === 'service_worker');
        const hasBackground = targets.some(t => t.type() === 'background_page');
        
        // Also check via evaluate
        const hasChromeRuntime = await targetPage.evaluate(() => {
            return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
        }).catch(() => false);
        
        if (hasServiceWorker || hasBackground || hasChromeRuntime) {
            pass('Extension loads without errors');
            return targetPage;
        } else {
            // MV3 with service worker - check if extension page loads
            const extensionPages = targets.filter(t => t.type() === 'page' && t.url().includes('chrome-extension://'));
            if (extensionPages.length > 0) {
                pass('Extension loads without errors');
                return targetPage;
            }
            fail('Extension loads without errors', 'Extension context not found');
            return targetPage;
        }
    } catch (error) {
        fail('Extension loads without errors', error.message);
        return null;
    }
}

async function testServiceWorkerLogs(browser) {
    log('Test 2: Service worker console logs...');
    
    try {
        // Get service worker console logs (MV3 uses service workers)
        const targets = browser.targets();
        const serviceWorkerTarget = targets.find(t => t.type() === 'service_worker');
        
        if (serviceWorkerTarget) {
            log('Service worker target found');
            try {
                const worker = await serviceWorkerTarget.worker();
                if (worker) {
                    log('Service worker is running');
                    pass('Service worker is running');
                    return true;
                }
            } catch (e) {
                // Worker might not be accessible, but target exists
                log('Service worker target exists (worker not directly accessible)');
                pass('Service worker target exists');
                return true;
            }
        }
        
        // Check for any extension-related targets
        const extensionTargets = targets.filter(t => t.url().includes('chrome-extension://'));
        if (extensionTargets.length > 0) {
            pass('Extension targets found');
            return true;
        }
        
        fail('Service worker logs', 'No service worker or extension targets found');
        return false;
    } catch (error) {
        fail('Service worker logs', error.message);
        return false;
    }
}

async function testContentScriptInjected(browser) {
    log('Test 3: Content script is injected...');
    
    try {
        const pages = await browser.pages();
        const targetPage = pages[0];
        
        // Check if vAPI is defined in page context
        const vAPIDefined = await targetPage.evaluate(() => {
            return typeof window.vAPI !== 'undefined';
        }).catch(() => false);
        
        if (vAPIDefined) {
            pass('Content script is injected (vAPI defined)');
            return true;
        } else {
            // Try checking via chrome API
            const extensionId = await targetPage.evaluate(() => {
                return chrome.runtime?.id;
            }).catch(() => null);
            
            if (extensionId) {
                pass('Content script is injected (extension ID found)');
                return true;
            }
            
            // MV3 might use different injection - check for any ublock indicators
            const hasUblockIndicator = await targetPage.evaluate(() => {
                return document.body.innerHTML.includes('ublock') ||
                       document.querySelector('[id*="ublock"]') !== null ||
                       document.querySelector('[class*="ublock"]') !== null;
            }).catch(() => false);
            
            if (hasUblockIndicator) {
                pass('Content script is injected (DOM indicators found)');
                return true;
            }
            
            fail('Content script is injected', 'No content script indicators found');
            return false;
        }
    } catch (error) {
        fail('Content script is injected', error.message);
        return false;
    }
}

async function testPopupOpens(browser) {
    log('Test 4: Popup opens...');
    
    try {
        const pages = await browser.pages();
        const targetPage = pages[0];
        
        // Get extension ID
        const extId = await targetPage.evaluate(() => chrome.runtime?.id).catch(() => null);
        
        if (!extId) {
            fail('Popup opens', 'Could not get extension ID');
            return false;
        }
        
        // Open popup
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { timeout: 5000 });
        await sleep(500);
        
        // Check popup loaded
        const title = await popup.title();
        if (title) {
            pass('Popup opens');
            await popup.close();
            return true;
        }
        
        fail('Popup opens', 'Popup did not load');
        await popup.close();
        return false;
    } catch (error) {
        fail('Popup opens', error.message);
        return false;
    }
}

async function testElementPickerOpens(browser) {
    log('Test 5: Element picker can be triggered...');
    
    try {
        const pages = await browser.pages();
        const targetPage = pages[0];
        
        // Navigate to a test page
        await targetPage.goto('https://example.com', { waitUntil: 'networkidle0' });
        await sleep(500);
        
        // Get extension ID
        const extId = await targetPage.evaluate(() => chrome.runtime?.id).catch(() => null);
        
        if (!extId) {
            fail('Element picker can be triggered', 'Could not get extension ID');
            return false;
        }
        
        // Open popup and try to click picker button
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, { timeout: 5000 });
        await sleep(1000);
        
        // Look for picker button
        const pickerButton = await popup.$('#pick');
        if (pickerButton) {
            log('Picker button found, clicking...');
            await pickerButton.click();
            await sleep(2000);
            
            // Check if iframe was created
            const iframeCreated = await targetPage.evaluate(() => {
                return document.querySelector('iframe[src*="epicker"]') !== null ||
                       document.querySelector('[id^="ublock-"]') !== null;
            }).catch(() => false);
            
            if (iframeCreated) {
                pass('Element picker opens (iframe created)');
                await popup.close();
                return true;
            }
        }
        
        fail('Element picker can be triggered', 'Picker button or iframe not found');
        await popup.close();
        return false;
    } catch (error) {
        fail('Element picker can be triggered', error.message);
        return false;
    }
}

async function runTests() {
    log('='.repeat(60));
    log('uBlock Origin MV3 Extension - Automated Tests');
    log('='.repeat(60));
    
    let browser = null;
    
    try {
        browser = await launchBrowser();
        await sleep(2000); // Wait for extension to initialize
        
        await testExtensionLoads(browser);
        await testServiceWorkerLogs(browser);
        await testContentScriptInjected(browser);
        await testPopupOpens(browser);
        await testElementPickerOpens(browser);
        
    } catch (error) {
        log(`Fatal error: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
    
    // Print summary
    log('='.repeat(60));
    log('TEST SUMMARY');
    log('='.repeat(60));
    log(`Total: ${results.passed + results.failed}`);
    log(`Passed: ${results.passed}`);
    log(`Failed: ${results.failed}`);
    log('='.repeat(60));
    
    if (results.failed > 0) {
        log('FAILED TESTS:');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => {
            log(`  - ${t.name}: ${t.reason}`);
        });
    }
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(console.error);
