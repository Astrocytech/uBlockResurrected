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
        await esbuild.build({
            entryPoints: [entryPoint],
            bundle: true,
            outfile: outFile,
            format: 'iife',
            target: ['chrome120'],
            platform: 'browser',
            minify: false,
            allowOverwrite: true,
            logLevel: 'info',
        });
        console.log('Service worker bundled successfully:', outFile);
    } catch (error) {
        console.error('Bundle failed:', error);
        process.exit(1);
    }
}

bundle();
