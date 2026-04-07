#!/usr/bin/env node
/**
 * Bundle Service Worker modules into a single sw.js file
 * 
 * This script uses esbuild to bundle the ES6 modules into a single
 * IIFE (Immediately Invoked Function Expression) for use as a
 * Chrome extension service worker.
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const entryPoint = path.join(__dirname, '../src/js/mv3/sw-entry.ts');
const outFile = path.join(__dirname, '../dist/build/uBlock0.chromium-mv3/js/sw.js');

async function bundle() {
    try {
        const result = await esbuild.build({
            entryPoints: [entryPoint],
            bundle: true,
            outfile: outFile,
            format: 'iife',
            target: ['chrome120'],
            platform: 'browser',
            minify: false,
            allowOverwrite: true,
            logLevel: 'warning',
            banner: {
                js: '// uBlock Resurrected MV3 Service Worker\n',
            },
            footer: {
                js: '\n//# sourceMappingURL=sw.js.map',
            },
        });
        
        // Post-process: Ensure vAPI is properly exposed globally
        let content = fs.readFileSync(outFile, 'utf8');
        
        // Replace all vAPI2 references with vAPI to fix naming conflict
        if (content.includes('vAPI2')) {
            content = content.replace(/vAPI2/g, 'vAPI');
        }
        
        // Wrap in explicit global assignment to ensure vAPI is available
        if (!content.includes('var vAPI')) {
            content = content.replace(
                '(() => {',
                '(() => {\nvar vAPI;\n'
            );
        }
        
        fs.writeFileSync(outFile, content);
        console.log('Service worker bundled successfully:', outFile);
        
        if (result.errors.length > 0) {
            console.error('Bundle had errors:', result.errors);
        }
    } catch (error) {
        console.error('Bundle failed:', error);
        process.exit(1);
    }
}

bundle();
