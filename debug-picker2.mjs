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
    const iframeDetails = await page.evaluate(() => {
        const allIframes = document.querySelectorAll('iframe');
        return Array.from(allIframes).map(f => ({
            src: f.src,
            contentWindow: f.contentWindow ? f.contentWindow.location.href : 'none',
            attributes: Array.from(f.attributes).map(a => `${a.name}="${a.value}"`)
        }));
    });

    console.log('Iframe details:', JSON.stringify(iframeDetails, null, 2));

    // Check all frames with their documents
    const frames = page.frames();
    console.log('\nFrame details:');
    for (const frame of frames) {
        try {
            const url = frame.url();
            const title = await frame.title().catch(() => 'N/A');
            const bodyHTML = await frame.evaluate(() => document.body ? document.body.innerHTML.substring(0, 200) : 'no body').catch(() => 'error');
            console.log(`  URL: ${url}, Title: ${title}`);
            console.log(`  Body: ${bodyHTML}`);
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }

    // Try to find epicker frame
    const epickerFrame = frames.find(f => f.url().includes('epicker') || f.url() === 'about:blank');
    if (epickerFrame) {
        console.log('\nEpicker frame found!');
        try {
            const html = await epickerFrame.contentDocument().then(d => d ? d.documentElement.outerHTML.substring(0, 500) : 'no doc').catch(() => 'error');
            console.log('Epicker frame HTML:', html);
        } catch (e) {
            console.log('Could not get epicker content:', e.message);
        }
    }

    await context.close();
}

debug().catch(console.error);
