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

    test('uses reference-style shared UI assets and translatable labels', async () => {
        const html = await readFile(pickerHtmlPath, 'utf8');

        expect(html).toContain('/css/tool-overlay-ui.css');
        expect(html).toContain('/js/i18n-bundle.js');
        expect(html).toContain('data-i18n="pickerPick"');
        expect(html).toContain('data-i18n="pickerPreview"');
        expect(html).toContain('data-i18n="pickerCreate"');
        expect(html).toContain('data-i18n="popupMoreButton_v2"');
        expect(html).toContain('data-i18n="popupLessButton_v2"');
        expect(html).not.toContain('/js/theme-bundle.js');
    });
});
