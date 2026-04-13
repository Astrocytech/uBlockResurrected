import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const entries = [
  'src/js/3p-filters.ts',
  'src/js/1p-filters.ts',
  'src/js/dyna-rules.ts',
  'src/js/popup-fenix.ts',
  'src/js/epicker-ui.ts',
  'src/js/asset-viewer.ts',
  'src/js/code-viewer.ts',
  'src/js/advanced-settings.ts',
  'src/js/devtools.ts',
  'src/js/logger-ui.ts',
  'src/js/logger-ui-inspector.ts',
  'src/js/i18n.ts',
  'src/js/fa-icons.ts',
  'src/js/theme.ts',
  'src/js/dashboard-common.ts',
  'src/js/dashboard.ts',
  'src/js/messaging.ts',
  'src/js/contentscript.ts',
  'src/js/about.ts',
  'src/js/support.ts',
];

const allFlags = {
  format: 'iife',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
};

for (const entry of entries) {
  const outfile = entry.replace('/js/', '/js/').replace('.ts', '-bundle.js');
  console.log(`Building ${entry} -> ${outfile}`);
  
  try {
    await esbuild.build({
      ...allFlags,
      entryPoints: [entry],
      outfile,
      bundle: true,
      platform: 'browser',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });
    console.log(`  Built: ${outfile}`);
  } catch (e) {
    console.error(`  Error building ${entry}:`, e.message);
  }
}

console.log('Build complete!');