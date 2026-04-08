import { chromium } from 'playwright';

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

    let extId = null;
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
        const swUrl = workers[0].url();
        const match = swUrl.match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
        if (match) extId = match[1];
    }
    console.log('Extension ID:', extId);

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'networkidle', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup-fenix.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
    });
    await new Promise(r => setTimeout(r, 1000));

    const pickerBtn = await popup.$('#gotoPick');
    if (pickerBtn) {
        console.log('Found picker button, clicking...');
        await pickerBtn.click({ force: true });
    } else {
        console.log('Picker button not found');
    }

    await new Promise(r => setTimeout(r, 5000));

    // Check for iframes
    const iframeDetails = await page.evaluate(() => {
        const allIframes = document.querySelectorAll('iframe');
        return Array.from(allIframes).map(f => ({
            src: f.src,
            attributes: Array.from(f.attributes).map(a => `${a.name}="${a.value}"`)
        }));
    });
    console.log('Iframes:', JSON.stringify(iframeDetails, null, 2));

    // Check all frames
    const frames = page.frames();
    console.log('\nFrames found:', frames.length);
    for (const frame of frames) {
        try {
            const url = frame.url();
            console.log('  Frame URL:', url);
        } catch (e) {
            console.log('  Frame error:', e.message.substring(0, 100));
        }
    }

    // Find epicker frame by checking frame content (SVG)
    const epickerFrame = frames.find(f => {
        try {
            const hasSVG = f.evaluate(() => document.querySelector('svg#sea') !== null);
            return hasSVG;
        } catch { return false; }
    });

    if (epickerFrame) {
        console.log('\nEpicker frame found! Checking for SVG...');
        const svgInfo = await epickerFrame.evaluate(() => {
            const svg = document.querySelector('svg#sea');
            const path = svg?.querySelector('path');
            return {
                svgExists: !!svg,
                pathExists: !!path,
                pathD: path?.getAttribute('d')
            };
        });
        console.log('SVG info:', JSON.stringify(svgInfo));
        
        // Try mouse move
        console.log('\nMoving mouse to 400, 300...');
        await page.mouse.move(400, 300);
        await new Promise(r => setTimeout(r, 2000));
        
        const svgAfter = await epickerFrame.evaluate(() => {
            const paths = document.querySelectorAll('svg#sea path');
            return Array.from(paths).map(p => p.getAttribute('d'));
        });
        console.log('SVG paths after mouse move:', svgAfter);
    } else {
        console.log('\nEpicker frame NOT found!');
    }

    await context.close();
}

debug().catch(console.error);
