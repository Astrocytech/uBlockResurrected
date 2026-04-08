import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const EXTENSION_PATH = '/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/dist/build/uBlock0.chromium-mv3';
const TEST_URL = 'https://example.com';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('Starting zapper test...');
    
    const userDataDir = '/tmp/ublock-zapper-test-' + Date.now();
    mkdirSync(userDataDir, { recursive: true });
    
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
        viewport: { width: 1280, height: 720 }
    });
    
    console.log('Browser launched');
    
    const page = context.pages()[0] || await context.newPage();
    
    // Listen for console messages
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('DEBUG') || text.includes('quit')) {
            console.log(`[PAGE] ${text}`);
        }
    });
    
    page.on('pageerror', err => {
        console.log(`[PAGE-ERROR] ${err.message}`);
    });
    
    await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(2000);
    
    // Get extension ID
    const workers = context.serviceWorkers();
    let extId = null;
    if (workers.length > 0) {
        const swUrl = workers[0].url();
        const match = swUrl.match(/chrome-extension:\/\/([a-zA-Z]+)\//);
        if (match) {
            extId = match[1];
        }
    }
    console.log('Extension ID:', extId);
    
    // Open popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
    });
    
    // Check if zapper button exists
    const zapperBtn = await popup.$('#gotoZap');
    console.log('Zapper button found:', !!zapperBtn);
    
    // Count iframes before clicking zapper
    const iframeCountBefore = await page.evaluate(() => document.querySelectorAll('iframe').length);
    console.log('Iframes before zapper:', iframeCountBefore);
    
    if (zapperBtn) {
        console.log('Clicking zapper button...');
        await zapperBtn.click();
        
        // Wait for scripts to inject and iframe to appear
        await sleep(5000);
        
        // Count iframes after clicking zapper
        const iframeCountAfter = await page.evaluate(() => document.querySelectorAll('iframe').length);
        console.log('Iframes after zapper:', iframeCountAfter);
        
        // Find all iframes and check their attributes
        const iframes = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('iframe')).map(f => ({
                id: f.id,
                class: f.className,
                src: f.src || 'no-src',
                hasAttribute: f.hasAttribute('id')
            }));
        });
        console.log('Iframes found:', JSON.stringify(iframes, null, 2));
        
        // Try to find the epicker iframe by looking for any iframe without a src
        // or by checking the iframe's id attribute
        const epickerFrame = await page.evaluate(() => {
            const allIframes = document.querySelectorAll('iframe');
            for (const iframe of allIframes) {
                // Check if this is the epicker iframe (created by epicker.js)
                if (iframe.id && iframe.id.includes('ublock')) {
                    return iframe.id;
                }
            }
            // If no id match, return the first iframe without src
            for (const iframe of allIframes) {
                if (!iframe.src || iframe.src === '') {
                    return iframe;
                }
            }
            return allIframes[0];
        });
        console.log('Epicker frame element:', epickerFrame);
        
        // Try to access the iframe content using frame locator
        const frames = page.frames();
        console.log('Total frames:', frames.length);
        for (const frame of frames) {
            const url = frame.url();
            console.log('  Frame URL:', url.substring(0, 100));
            if (url.includes('epicker') || url.includes('ublock')) {
                console.log('Found epicker frame!');
                
                // Check for quit button
                try {
                    const quitBtn = await frame.$('#quit');
                    console.log('Quit button found in frame:', !!quitBtn);
                    
                    if (quitBtn) {
                        // Get quit button info
                        const quitBtnInfo = await frame.evaluate(() => {
                            const btn = document.getElementById('quit');
                            if (btn) {
                                const rect = btn.getBoundingClientRect();
                                return {
                                    exists: true,
                                    width: rect.width,
                                    height: rect.height,
                                    visible: rect.width > 0 && rect.height > 0,
                                    text: btn.textContent?.trim().substring(0, 20)
                                };
                            }
                            return { exists: false };
                        });
                        console.log('Quit button info:', JSON.stringify(quitBtnInfo, null, 2));
                        
                        if (quitBtnInfo.visible) {
                            console.log('Clicking quit button...');
                            await quitBtn.click();
                            await sleep(2000);
                            
                            const iframeCountAfterQuit = await page.evaluate(() => document.querySelectorAll('iframe').length);
                            console.log('Iframes after quit click:', iframeCountAfterQuit);
                        } else {
                            console.log('Quit button not visible!');
                        }
                    }
                } catch (e) {
                    console.log('Error accessing frame content:', e.message);
                }
                break;
            }
        }
        
        // Test ESC key - reopen picker first
        console.log('\n=== Testing ESC key ===');
        const zapperBtn2 = await popup.$('#gotoZap');
        if (zapperBtn2) {
            console.log('Clicking zapper button again...');
            await zapperBtn2.click();
            await sleep(3000);
            
            const iframeCountBeforeEsc = await page.evaluate(() => document.querySelectorAll('iframe').length);
            console.log('Iframes before ESC:', iframeCountBeforeEsc);
            
            console.log('Pressing ESC...');
            await page.keyboard.press('Escape');
            await sleep(2000);
            
            const iframeCountAfterEsc = await page.evaluate(() => document.querySelectorAll('iframe').length);
            console.log('Iframes after ESC:', iframeCountAfterEsc);
        }
    }
    
    await popup.close();
    await context.close();
    console.log('\n=== Test complete ===');
}

main().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
