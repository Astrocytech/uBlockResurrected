import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const pickerHtmlPath = path.resolve(process.cwd(), 'src/picker-ui.html');

test.describe('Picker HTML', () => {
    test('loads tool-overlay-ui before picker-ui', async () => {
        const html = await readFile(pickerHtmlPath, 'utf8');

        expect(html).toContain('/js/scripting/tool-overlay-ui.js');
        expect(html.indexOf('/js/scripting/tool-overlay-ui.js')).toBeGreaterThan(-1);
        expect(html.indexOf('/js/scripting/picker-ui.js')).toBeGreaterThan(-1);
        expect(html.indexOf('/js/scripting/tool-overlay-ui.js'))
            .toBeLessThan(html.indexOf('/js/scripting/picker-ui.js'));
    });
});
