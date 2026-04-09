import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const epickerHtmlPath = path.resolve(
    process.cwd(),
    'src/web_accessible_resources/epicker-ui.html',
);

test.describe('Element Picker HTML', () => {
    test('loads the shared picker runtime stack expected by epicker-ui', async () => {
        const html = await readFile(epickerHtmlPath, 'utf8');

        expect(html).toContain('../js/vapi.js');
        expect(html).toContain('../js/vapi-common.js');
        expect(html).toContain('../js/vapi-client.js');
        expect(html).not.toContain('../js/vapi-content.js');
        expect(html).toContain('../js/webext-flavor.js');
        expect(html).toContain('../js/epicker-ui-bundle.js');
    });
});
