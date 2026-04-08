/**
 * Playwright Setup for UI Tests
 * 
 * Configures Playwright for extension UI testing.
 * Handles cases where backend might not be available.
 */

import { test as base, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

const EXTENSION_PATH = join(process.cwd(), 'dist', 'build', 'uBlock0.chromium-mv3');
const SOURCE_PATH = join(process.cwd(), 'src');
const TEST_URL = 'https://www.example.com/';

export interface ExtensionTestFixtures {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    extensionId: string | null;
}

function getExtensionId(context: BrowserContext): string | null {
    const workers = context.serviceWorkers();
    if (workers.length === 0) return null;
    const match = workers[0].url().match(/chrome-extension:\/\/([a-zA-Z0-9]+)\//);
    return match ? match[1] : null;
}

async function createExtensionContext(
    options?: { headless?: boolean }
): Promise<{ context: BrowserContext; extensionId: string | null }> {
    const userDataDir = `/tmp/ublock-test-${Date.now()}`;
    mkdirSync(userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // MV3 service workers require non-headless mode
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
        viewport: { width: 1280, height: 720 },
    });

    // Wait for service worker to start (MV3 requirement)
    await new Promise(r => setTimeout(r, 2000));

    const extensionId = getExtensionId(context);

    return { context, extensionId };
}

// Create the test fixture
export const test = base.extend<ExtensionTestFixtures>({
    browser: async ({}, use) => {
        const browser = await chromium.launch({ headless: false });
        await use(browser);
        await browser.close();
    },
    
    context: async ({}, use) => {
        try {
            // MV3 service workers require non-headless mode
            const { context } = await createExtensionContext({ headless: false });
            await use(context);
            await context.close();
        } catch (error) {
            console.error('Failed to create extension context:', error);
            // Create a basic context without extension as fallback
            const userDataDir = `/tmp/ublock-basic-test-${Date.now()}`;
            mkdirSync(userDataDir, { recursive: true });
            const context = await chromium.launchPersistentContext(userDataDir, {
                headless: false,
                viewport: { width: 1280, height: 720 },
            });
            await use(context);
            await context.close();
        }
    },
    
    page: async ({ context }, use) => {
        const page = context.pages()[0] || await context.newPage();
        await use(page);
    },
    
    extensionId: async ({ context }, use) => {
        const id = getExtensionId(context);
        await use(id);
    },
});

export { expect } from '@playwright/test';

export { EXTENSION_PATH, SOURCE_PATH, TEST_URL };
