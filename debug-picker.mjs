import { chromium } from 'playwright';
import path from 'path';

const EXTENSION_PATH = '/home/coka/Desktop/ASTROCYTECH/git_project/uBlockResurrected/dist/build/uBlock0.chromium-mv3';

async function debug() {
    const context = await chromium.launchPersistentContext('/tmp/debug-picker-' + Date.now(), {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
        ],
        viewport: { width: 1280, height: 720 }
    });

    await new Promise(r => setTimeout(r, 3000));

    // Get extension ID
    let extId = null;
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
        const swUrl = workers[0].url();
        const match = swUrl.match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
        if (match) extId = match[1];
    }

    console.log('Extension ID:', extId);

    // Create test page
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'networkidle', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Open popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
    });
    await new Promise(r => setTimeout(r, 1000));

    // Click picker button
    const pickerBtn = await popup.$('#gotoPick');
    if (pickerBtn) {
        console.log('Found picker button, clicking...');
        await pickerBtn.click({ force: true });
    } else {
        console.log('Picker button not found');
    }

    // Wait for iframe
    await new Promise(r => setTimeout(r, 5000));

    // Check for iframes
    const iframes = await page.evaluate(() => {
        const allIframes = document.querySelectorAll('iframe');
        return Array.from(allIframes).map(f => ({
            src: f.src,
            attributes: Array.from(f.attributes).map(a => `${a.name}="${a.value}"`)
        }));
    });

    console.log('Iframes on page:', JSON.stringify(iframes, null, 2));

    // Check all frames
    const frames = page.frames();
    console.log('Total frames:', frames.length);
    for (const frame of frames) {
        try {
            console.log('Frame URL:', frame.url());
        } catch (e) {
            console.log('Frame error:', e.message);
        }
    }

    await context.close();
}

debug().catch(console.error);
