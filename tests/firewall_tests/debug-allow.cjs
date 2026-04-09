const { chromium } = require('playwright');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, rm } = require('node:fs/promises');

const extensionPath = path.resolve(process.cwd(), 'dist/build/uBlock0.chromium-mv3');

async function launch(userDataDir) {
    return chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: true,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    });
}

async function main() {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-fw-debug-'));

    const resourceServer = createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if ( url.pathname === '/pixel.png' ) {
            const png = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9nW8AAAAASUVORK5CYII=',
                'base64',
            );
            res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
            res.end(png);
            return;
        }
        if ( url.pathname === '/third-party.js' ) {
            res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
            res.end('window.__thirdPartyScriptLoaded = (window.__thirdPartyScriptLoaded || 0) + 1;');
            return;
        }
        res.writeHead(404);
        res.end('not found');
    });
    await new Promise((resolve, reject) => {
        resourceServer.listen(0, '127.0.0.1', () => resolve());
        resourceServer.once('error', reject);
    });
    const resourcePort = resourceServer.address().port;

    const appServer = createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if ( url.pathname === '/blank' ) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            res.end('<!doctype html><html><body><main>blank</main></body></html>');
            return;
        }
        if ( url.pathname === '/resource-page' ) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            res.end(`<!doctype html>
<html>
<body>
    <img id="third-party-image" src="http://127.0.0.1:${resourcePort}/pixel.png" alt="pixel">
    <script src="http://127.0.0.1:${resourcePort}/third-party.js"></script>
</body>
</html>`);
            return;
        }
        res.writeHead(404);
        res.end('not found');
    });
    await new Promise((resolve, reject) => {
        appServer.listen(0, '127.0.0.1', () => resolve());
        appServer.once('error', reject);
    });
    const appPort = appServer.address().port;
    const blankURL = `http://localhost:${appPort}/blank`;
    const resourceURL = `http://localhost:${appPort}/resource-page`;

    let context;
    try {
        context = await launch(userDataDir);
        let [ sw ] = context.serviceWorkers();
        if ( sw === undefined ) {
            sw = await context.waitForEvent('serviceworker');
        }
        const extensionId = /^chrome-extension:\/\/([a-z]{32})\//.exec(sw.url())[1];

        const page = await context.newPage();
        await page.goto(blankURL, { waitUntil: 'domcontentloaded' });
        const [ tab ] = await sw.evaluate(async url => chrome.tabs.query({ url }), blankURL);

        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extensionId}/popup-fenix.html?tabId=${tab.id}`, { waitUntil: 'domcontentloaded' });
        await popup.evaluate(async () => {
            await window.vAPI.messaging.send('popupPanel', {
                what: 'userSettings',
                name: 'advancedUserEnabled',
                value: true,
            });
            await window.vAPI.messaging.send('popupPanel', {
                what: 'userSettings',
                name: 'popupPanelSections',
                value: 31,
            });
            await window.vAPI.messaging.send('popupPanel', {
                what: 'userSettings',
                name: 'firewallPaneMinimized',
                value: false,
            });
        });
        await popup.reload({ waitUntil: 'domcontentloaded' });

        await popup.locator('#firewall > [data-des="*"][data-type="3p"] > span[data-src="/"]').hover();
        await popup.locator('#dynaBlock').click();
        await popup.locator('#firewall > [data-des="*"][data-type="3p"] > span[data-src="."]').hover();
        await popup.locator('#dynaAllow').click();
        await popup.locator('#saveRules').click();
        await popup.waitForTimeout(500);

        console.log('permanent before restart:', await sw.evaluate(() => self.µBlock.permanentFirewall.toString()));
        console.log('session before restart:', await sw.evaluate(() => self.µBlock.sessionFirewall.toString()));
        console.log('dnr before restart:', await sw.evaluate(async () => chrome.declarativeNetRequest.getDynamicRules()));

        await context.close();
        context = await launch(userDataDir);
        [ sw ] = context.serviceWorkers();
        if ( sw === undefined ) {
            sw = await context.waitForEvent('serviceworker');
        }

        const resourcePage = await context.newPage();
        await resourcePage.goto(resourceURL, { waitUntil: 'domcontentloaded' });
        await resourcePage.waitForTimeout(1000);

        console.log('permanent after restart:', await sw.evaluate(() => self.µBlock.permanentFirewall.toString()));
        console.log('session after restart:', await sw.evaluate(() => self.µBlock.sessionFirewall.toString()));
        console.log('dnr after restart:', await sw.evaluate(async () => chrome.declarativeNetRequest.getDynamicRules()));
        console.log('page status:', await resourcePage.evaluate(() => ({
            scriptLoaded: Boolean(window.__thirdPartyScriptLoaded),
            imageWidth: document.getElementById('third-party-image')?.naturalWidth || 0,
        })));
    } finally {
        await context?.close();
        await new Promise(resolve => appServer.close(() => resolve()));
        await new Promise(resolve => resourceServer.close(() => resolve()));
        await rm(userDataDir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
