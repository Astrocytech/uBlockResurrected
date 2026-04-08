/**
 * Comprehensive Extension Error Detection Tests
 * 
 * Detects ALL errors when loading/reloading the extension in Chrome:
 * - Service worker registration errors (including Status code 15)
 * - JavaScript runtime errors
 * - Extension API errors
 * - Content script errors
 * 
 * Usage:
 *   xvfb-run node tests/test-extension-errors.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.join(__dirname, '..', 'dist', 'build', 'uBlock0.chromium-mv3');

const allErrors = [];

function log(message, level = 'INFO') {
    const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'PASS' ? '✅' : '[TEST]';
    console.log(`${prefix} ${message}`);
}

function captureError(source, type, message) {
    allErrors.push({ source, type, message });
    log(`${source} [${type}]: ${message}`, 'ERROR');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST: Extension Load Errors
// ============================================================================
async function testExtensionLoadErrors() {
    log('Test: Loading extension and detecting ALL errors...');
    
    const userDataDir = '/tmp/ublock-err-test-' + Date.now();
    mkdirSync(userDataDir, { recursive: true });
    
    let context = null;
    
    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
            viewport: { width: 1280, height: 720 }
        });
        
        log('Browser launched');
        
        // Wait for extension to attempt loading
        await sleep(5000);
        
        // Get service workers
        const workers = context.serviceWorkers();
        log(`Service workers: ${workers.length}`);
        
        if (workers.length === 0) {
            captureError('EXTENSION', 'NO_SW', 
                'Service worker did not register - check for registration errors');
            
            // Check if there were errors in the main context
            const mainPage = context.pages()[0];
            if (mainPage) {
                mainPage.on('console', msg => {
                    if (msg.type() === 'error') {
                        captureError('MAIN', 'CONSOLE_ERROR', msg.text());
                    }
                });
            }
        }
        
        // Set up error capture for service worker
        for (const worker of workers) {
            worker.on('console', msg => {
                const text = msg.text();
                if (msg.type() === 'error') {
                    captureError('SERVICE_WORKER', 'CONSOLE_ERROR', text);
                }
            });
            
            worker.on('pageerror', err => {
                captureError('SERVICE_WORKER', 'PAGE_ERROR', err.message);
            });
        }
        
        // Test by navigating to a page
        let page;
        try {
            page = context.pages()[0] || await context.newPage();
        } catch (e) {
            captureError('PAGE', 'CREATE_ERROR', e.message);
            page = null;
        }
        
        if (page) {
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    const text = msg.text();
                    // Ignore resource 404s
                    if (!text.includes('404') && !text.includes('net::ERR_')) {
                        captureError('PAGE', 'CONSOLE_ERROR', text);
                    }
                }
            });
            
            page.on('pageerror', err => {
                captureError('PAGE', 'PAGE_ERROR', err.message);
            });
            
            try {
                await page.goto('https://example.com', { 
                    waitUntil: 'networkidle', 
                    timeout: 15000 
                });
                await sleep(2000);
            } catch (e) {
                captureError('PAGE', 'NAVIGATE_ERROR', e.message);
            }
        }
        
        // Test popup
        const extId = workers.length > 0 ? 
            workers[0].url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)/)?.[1] : null;
        
        if (extId && page) {
            try {
                const popup = await context.newPage();
                popup.on('console', msg => {
                    if (msg.type() === 'error') {
                        captureError('POPUP', 'CONSOLE_ERROR', msg.text());
                    }
                });
                popup.on('pageerror', err => {
                    captureError('POPUP', 'PAGE_ERROR', err.message);
                });
                
                await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, {
                    waitUntil: 'domcontentloaded',
                    timeout: 10000
                });
                await sleep(1000);
                await popup.close();
            } catch (e) {
                captureError('POPUP', 'LOAD_ERROR', e.message);
            }
        }
        
        // Give time for errors to surface
        await sleep(1000);
        
        try {
            await context.close();
        } catch (e) {
            // Ignore close errors
        }
        
    } catch (error) {
        captureError('TEST', 'FATAL', error.message);
        try {
            if (context) await context.close();
        } catch (e) { /* ignore */ }
    }
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
    console.clear();
    log('='.repeat(70));
    log('uBlock Origin MV3 - ERROR DETECTION');
    log('='.repeat(70));
    log('');
    
    try {
        await testExtensionLoadErrors();
    } catch (e) {
        captureError('TEST', 'CRASH', e.message);
    }
    
    log('');
    log('='.repeat(70));
    log('ERROR SUMMARY');
    log('='.repeat(70));
    
    if (allErrors.length === 0) {
        log('✅ NO ERRORS DETECTED', 'PASS');
    } else {
        log(`❌ ${allErrors.length} ERROR(S) DETECTED:`);
        log('');
        
        for (const err of allErrors.slice(0, 10)) {
            log(`[${err.source}] ${err.type}`);
            log(`  ${err.message.substring(0, 200)}`);
            log('');
        }
        
        if (allErrors.length > 10) {
            log(`... and ${allErrors.length - 10} more errors`);
        }
    }
    
    log('='.repeat(70));
    
    try {
        rmSync('/tmp/ublock-err-test-*', { recursive: true, force: true });
    } catch (e) { /* ignore */ }
    
    process.exit(allErrors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
