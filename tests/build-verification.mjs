/**
 * Build Verification Tests
 * 
 * These tests verify that the build output is correct without requiring
 * Chrome to be running with the extension loaded.
 * 
 * Usage:
 *   node tests/build-verification.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILD_PATH = join(__dirname, '..', 'dist', 'build', 'uBlock0.chromium-mv3');

const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function log(message) {
    console.log(`[VERIFY] ${message}`);
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

function fileExists(path) {
    return existsSync(path);
}

function fileSize(path) {
    if (!existsSync(path)) return 0;
    return statSync(path).size;
}

function testManifestExists() {
    const manifestPath = join(BUILD_PATH, 'manifest.json');
    if (fileExists(manifestPath)) {
        pass('manifest.json exists');
        return true;
    }
    fail('manifest.json exists', `Not found at ${manifestPath}`);
    return false;
}

function testManifestValid() {
    const manifestPath = join(BUILD_PATH, 'manifest.json');
    try {
        const content = readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(content);
        
        if (manifest.manifest_version === 3) {
            pass('manifest.json is valid MV3');
            return manifest;
        }
        fail('manifest.json is valid MV3', 'Not MV3');
        return null;
    } catch (e) {
        fail('manifest.json is valid MV3', e.message);
        return null;
    }
}

function testServiceWorkerExists(manifest) {
    const swPath = join(BUILD_PATH, manifest.background.service_worker);
    if (fileExists(swPath)) {
        const size = fileSize(swPath);
        log(`Service worker: ${size} bytes`);
        if (size > 1000) {
            pass('Service worker (sw.js) exists and is valid');
            return true;
        }
        fail('Service worker (sw.js) exists and is valid', 'File too small');
        return false;
    }
    fail('Service worker (sw.js) exists and is valid', `Not found at ${swPath}`);
    return false;
}

function testContentScriptsExist(manifest) {
    if (!manifest.content_scripts) {
        fail('Content scripts configured', 'No content_scripts in manifest');
        return false;
    }
    
    let allExist = true;
    for (const cs of manifest.content_scripts) {
        for (const js of cs.js || []) {
            const jsPath = join(BUILD_PATH, js.replace(/^\//, ''));
            if (fileExists(jsPath)) {
                const size = fileSize(jsPath);
                log(`Content script: ${js} (${size} bytes)`);
            } else {
                fail('Content script exists', `Not found: ${js}`);
                allExist = false;
            }
        }
    }
    
    if (allExist) {
        pass('Content scripts exist');
    }
    return allExist;
}

function testEpickerUIExists(manifest) {
    const epickerFiles = [
        'js/epicker-ui-bundle.js',
        'js/epicker-ui.js',
        'web_accessible_resources/epicker-ui.html',
        'web_accessible_resources/epicker-ui.js',
        'web_accessible_resources/epicker-ui-bundle.js'
    ];
    
    let found = false;
    for (const file of epickerFiles) {
        const fpath = join(BUILD_PATH, file);
        if (fileExists(fpath)) {
            const size = fileSize(fpath);
            log(`Epicker UI: ${file} (${size} bytes)`);
            if (size > 10000) {
                pass('Epicker UI bundle exists');
                found = true;
                break;
            }
        }
    }
    
    if (!found) {
        fail('Epicker UI bundle exists', 'Not found or too small');
    }
    return found;
}

function testEpickerScriptletExists() {
    const epickerPath = join(BUILD_PATH, 'js', 'scriptlets', 'epicker.js');
    if (fileExists(epickerPath)) {
        const size = fileSize(epickerPath);
        log(`Epicker scriptlet: ${size} bytes`);
        if (size > 10000) {
            pass('Epicker scriptlet (epicker.js) exists');
            return true;
        }
        fail('Epicker scriptlet (epicker.js) exists', 'File too small');
        return false;
    }
    fail('Epicker scriptlet (epicker.js) exists', 'Not found');
    return false;
}

function testSubscriberExists() {
    const subPath = join(BUILD_PATH, 'js', 'scriptlets', 'subscriber.js');
    if (fileExists(subPath)) {
        const size = fileSize(subPath);
        log(`Subscriber: ${size} bytes`);
        if (size > 100) {
            pass('Subscriber scriptlet (subscriber.js) exists');
            return true;
        }
    }
    fail('Subscriber scriptlet (subscriber.js) exists', 'Not found');
    return false;
}

function testWebAccessibleResources(manifest) {
    const war = manifest.web_accessible_resources || [];
    if (war.length === 0) {
        fail('Web accessible resources', 'None defined');
        return false;
    }
    
    let allExist = true;
    for (const resource of war) {
        const resources = resource.resources || [];
        for (const res of resources) {
            // Handle wildcard patterns
            if (res.includes('*')) {
                log(`Web accessible (wildcard): ${res}`);
                continue;
            }
            const resPath = join(BUILD_PATH, res.replace(/^\//, ''));
            if (fileExists(resPath)) {
                log(`Web accessible: ${res}`);
            } else {
                fail('Web accessible resource exists', `Not found: ${res}`);
                allExist = false;
            }
        }
    }
    
    if (allExist) {
        pass('Web accessible resources exist');
    }
    return allExist;
}

function testPopupExists(manifest) {
    const popupPath = join(BUILD_PATH, 'popup-fenix.html');
    if (fileExists(popupPath)) {
        pass('Popup HTML exists');
        
        // Check for bundled JS
        const bundlePath = join(BUILD_PATH, 'js', 'popup-fenix-bundle.js');
        if (fileExists(bundlePath)) {
            const size = fileSize(bundlePath);
            log(`Popup bundle: ${size} bytes`);
            if (size > 1000) {
                pass('Popup bundle JS exists');
                return true;
            }
        }
        fail('Popup bundle JS exists', 'Not found or too small');
        return false;
    }
    fail('Popup HTML exists', 'Not found');
    return false;
}

function testKeyFilesExist() {
    const keyFiles = [
        'js/vapi.js',
        'js/vapi-client.js',
        'js/vapi-content.js',
        'js/contentscript.js',
        'js/benchmarks.js',
        'web_accessible_resources/epicker-ui.html',
        'css/epicker-ui.css'
    ];
    
    let allExist = true;
    for (const file of keyFiles) {
        const fpath = join(BUILD_PATH, file);
        if (fileExists(fpath)) {
            log(`Key file: ${file}`);
        } else {
            fail('Key file exists', `Not found: ${file}`);
            allExist = false;
        }
    }
    
    if (allExist) {
        pass('All key files exist');
    }
    return allExist;
}

async function runVerification() {
    log('='.repeat(60));
    log('Build Verification Tests');
    log('='.repeat(60));
    log(`Build path: ${BUILD_PATH}`);
    log('');
    
    // Test 1: Manifest
    if (!testManifestExists()) {
        log('Cannot continue without manifest.json');
        return;
    }
    
    const manifest = testManifestValid();
    if (!manifest) {
        log('Cannot continue without valid manifest');
        return;
    }
    
    // Test 2: Service Worker
    testServiceWorkerExists(manifest);
    
    // Test 3: Content Scripts
    testContentScriptsExist(manifest);
    
    // Test 4: Epicker UI
    testEpickerUIExists(manifest);
    
    // Test 5: Epicker Scriptlet
    testEpickerScriptletExists();
    
    // Test 6: Subscriber
    testSubscriberExists();
    
    // Test 7: Web Accessible Resources
    testWebAccessibleResources(manifest);
    
    // Test 8: Popup
    testPopupExists(manifest);
    
    // Test 9: Key Files
    testKeyFilesExist();
    
    // Summary
    log('');
    log('='.repeat(60));
    log('SUMMARY');
    log('='.repeat(60));
    log(`Total: ${results.passed + results.failed}`);
    log(`Passed: ${results.passed}`);
    log(`Failed: ${results.failed}`);
    log('='.repeat(60));
    
    if (results.failed > 0) {
        log('FAILED:');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => {
            log(`  - ${t.name}: ${t.reason}`);
        });
    }
    
    process.exit(results.failed > 0 ? 1 : 0);
}

runVerification().catch(console.error);
