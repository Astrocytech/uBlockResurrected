#!/usr/bin/env bash
#
# uBlock Resurrected Chrome MV3 Build Script (Refactored)
# This script assumes a linux environment

set -e

echo "*** uBlock0.chromium-mv3: Building Chromium MV3 extension (Refactored)"

BLDIR=dist/build
DES="$BLDIR"/uBlock0.chromium-mv3
PLATFORM_DIR=platform/chromium
if [ ! -d "$PLATFORM_DIR" ]; then
    PLATFORM_DIR=platform/chrome
fi
mkdir -p $DES
rm -rf $DES/*

echo "*** uBlock0.chromium-mv3: Copying common files"
bash ./tools/copy-common-files.sh $DES

# Chrome MV3-specific
echo "*** uBlock0.chromium-mv3: Copying chrome-specific files"
cp "$PLATFORM_DIR"/manifest.json $DES/

echo "*** uBlock0.chromium-mv3: Bundling JS files"
cd $DES/js

# Create stub benchmarks.js BEFORE bundling (messaging.ts imports it dynamically)
cat > benchmarks.js << 'BENCHMARKEOF'
// Benchmarks stub - benchmarks are disabled in production
export const benchmarkStaticNetFiltering = async () => ({ error: 'Benchmarks disabled' });
export const benchmarkCosmeticFiltering = async () => ({ error: 'Benchmarks disabled' });
export const benchmarkScriptletFiltering = async () => ({ error: 'Benchmarks disabled' });
BENCHMARKEOF

# Bundle fa-icons.ts first (needed for icon rendering)
echo "*** Bundling fa-icons.ts"
npx esbuild fa-icons.ts --bundle --format=iife --outfile=fa-icons-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1

# Bundle popup-fenix.ts (has imports from ../lib/punycode.js and ./dom.js, ./i18n.js)
echo "*** Bundling popup-fenix.ts"
npx esbuild popup-fenix.ts --bundle --format=iife --outfile=popup-fenix-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1

# Bundle epicker-ui.ts
npx esbuild epicker-ui.ts --bundle --format=iife --outfile=epicker-ui-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle dom-inspector.ts for the web-accessible inspector page
npx esbuild dom-inspector.ts --bundle --format=iife --outfile=dom-inspector.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle webext-flavor.ts
npx esbuild webext-flavor.ts --bundle --format=iife --outfile=webext-flavor.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle theme.ts
npx esbuild theme.ts --bundle --format=iife --outfile=theme-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle i18n.ts
npx esbuild i18n.ts --bundle --format=iife --outfile=i18n-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle dashboard-common.ts
echo "*** Bundling dashboard-common.ts"
npx esbuild dashboard-common.ts --bundle --format=iife --outfile=dashboard-common-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle cloud-ui.js as a classic script so self.cloud is initialized before
# the restored reference dashboard panes run their non-module bundles.
echo "*** Bundling cloud-ui.js"
npx esbuild cloud-ui.js --bundle --format=iife --outfile=cloud-ui.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle CodeMirror helpers to the .js paths referenced by restored pages.
mkdir -p codemirror
npx esbuild codemirror/search.ts --bundle --format=iife --outfile=codemirror/search.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
npx esbuild codemirror/search-thread.ts --bundle --format=iife --outfile=codemirror/search-thread.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle dashboard.ts
echo "*** Bundling dashboard.ts"
npx esbuild dashboard.ts --bundle --format=iife --outfile=dashboard-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle settings.ts
echo "*** Bundling settings.ts"
npx esbuild settings.ts --bundle --format=iife --outfile=settings-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle storage.ts
npx esbuild storage.ts --bundle --format=iife --outfile=storage-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle webext.ts (provides webext.storage for dashboard pages)
echo "*** Bundling webext.ts"
npx esbuild webext.ts --bundle --format=iife --outfile=webext-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle messaging.ts from source tree so MV3 submodules resolve correctly
echo "*** Bundling messaging.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/messaging.ts --bundle --format=iife --outfile=$DES/js/messaging-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle uri-utils.ts
npx esbuild uri-utils.ts --bundle --format=iife --outfile=uri-utils-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle hnswitches.ts
npx esbuild hnswitches.ts --bundle --format=iife --outfile=hnswitches-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle dynamic-net-filtering.ts
echo "*** Bundling dynamic-net-filtering.ts"
npx esbuild dynamic-net-filtering.ts --bundle --format=iife --outfile=dynamic-net-filtering-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle 1p-filters.ts
echo "*** Bundling 1p-filters.ts"
npx esbuild 1p-filters.ts --bundle --format=iife --outfile=1p-filters-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle 3p-filters.ts
echo "*** Bundling 3p-filters.ts"
npx esbuild 3p-filters.ts --bundle --format=iife --outfile=3p-filters-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle dyna-rules.ts
echo "*** Bundling dyna-rules.ts"
npx esbuild dyna-rules.ts --bundle --format=iife --outfile=dyna-rules-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true

# Bundle whitelist.ts
echo "*** Bundling whitelist.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/whitelist.ts --bundle --format=iife --outfile=$DES/js/whitelist-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle document-blocked.ts
echo "*** Bundling document-blocked.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/document-blocked.ts --bundle --format=iife --outfile=$DES/js/document-blocked-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle asset-viewer.ts
echo "*** Bundling asset-viewer.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/asset-viewer.ts --bundle --format=iife --outfile=$DES/js/asset-viewer-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle devtools.ts
echo "*** Bundling devtools.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/devtools.ts --bundle --format=iife --outfile=$DES/js/devtools-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle logger UI scripts
echo "*** Bundling logger-ui.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/logger-ui.ts --bundle --format=iife --outfile=$DES/js/logger-ui-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
npx esbuild src/js/logger-ui-inspector.ts --bundle --format=iife --outfile=$DES/js/logger-ui-inspector-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle advanced-settings.ts
echo "*** Bundling advanced-settings.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/advanced-settings.ts --bundle --format=iife --outfile=$DES/js/advanced-settings-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle about.ts
echo "*** Bundling about.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/about.ts --bundle --format=iife --outfile=$DES/js/about-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle support.ts
echo "*** Bundling support.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/support.ts --bundle --format=iife --outfile=$DES/js/support-bundle.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

# Bundle static-dnr-filtering.ts (required for filter list DNR rules)
echo "*** Bundling static-dnr-filtering.ts"
cd /home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected
npx esbuild src/js/static-dnr-filtering.ts --bundle --format=iife --outfile=$DES/js/static-dnr-filtering.js --target=chrome120 --platform=browser --minify=false --allow-overwrite 2>&1 || true
cd $DES/js

cd - > /dev/null

# Copy zapper files
echo "*** uBlock0.chromium-mv3: Copying zapper files"
cp src/zapper-ui.html $DES/
mkdir -p $DES/css
cp src/css/zapper-ui.css $DES/css/ 2>/dev/null || true
mkdir -p $DES/js/scripting
cp src/js/scripting/tool-overlay.js $DES/js/scripting/ 2>/dev/null || true
cp src/js/scripting/tool-overlay-ui.js $DES/js/scripting/ 2>/dev/null || true
cp src/js/scripting/zapper.js $DES/js/scripting/ 2>/dev/null || true
cp src/js/scripting/zapper-ui.js $DES/js/scripting/ 2>/dev/null || true
cp src/js/scripting/dom.js $DES/js/scripting/ 2>/dev/null || true
cp src/js/scripting/ext.js $DES/js/scripting/ 2>/dev/null || true

# Copy picker files
echo "*** uBlock0.chromium-mv3: Copying picker files"
cp src/picker-ui.html $DES/
cp src/css/picker-ui.css $DES/css/ 2>/dev/null || true
cp src/js/scripting/picker.js $DES/js/scripting/ 2>/dev/null || true
cp src/js/scripting/picker-ui.js $DES/js/scripting/ 2>/dev/null || true

# Update popup-fenix.html to use bundled JS
echo "*** uBlock0.chromium-mv3: Updating popup-fenix.html"
sed -i 's|<script src="js/popup-fenix.js" type="module"></script>|<script src="js/fa-icons-bundle.js"></script>\n<script src="js/popup-fenix-bundle.js"></script>|' $DES/popup-fenix.html
sed -i 's|<script src="js/fa-icons.js" type="module"></script>||' $DES/popup-fenix.html
sed -i 's|<script src="js/theme.js" type="module"></script>|<script src="js/theme-bundle.js"></script>|' $DES/popup-fenix.html
sed -i 's|<script src="js/i18n.js" type="module"></script>|<script src="js/i18n-bundle.js"></script>|' $DES/popup-fenix.html

# Update restored reference pages to use emitted MV3 bundles where this build
# does not ship same-name module entrypoints.
for html in \
    1p-filters.html \
    3p-filters.html \
    about.html \
    advanced-settings.html \
    asset-viewer.html \
    dashboard.html \
    devtools.html \
    document-blocked.html \
    dyna-rules.html \
    logger-ui.html \
    settings.html \
    support.html \
    whitelist.html
do
    [ -f "$DES/$html" ] || continue
    sed -i 's|<script src="js/fa-icons.js" type="module"></script>|<script src="js/fa-icons-bundle.js"></script>|' "$DES/$html"
    sed -i 's|<script src="js/i18n.js" type="module"></script>|<script src="js/i18n-bundle.js"></script>|' "$DES/$html"
    sed -i 's|<script src="js/dashboard-common.js" type="module"></script>|<script src="js/dashboard-common-bundle.js"></script>|' "$DES/$html"
done

sed -i 's|<script src="js/1p-filters.js" type="module"></script>|<script src="js/1p-filters-bundle.js"></script>|' $DES/1p-filters.html
sed -i 's|<script src="js/3p-filters.js" type="module"></script>|<script src="js/3p-filters-bundle.js"></script>|' $DES/3p-filters.html
sed -i 's|<script src="js/about.js" type="module"></script>|<script src="js/about-bundle.js"></script>|' $DES/about.html
sed -i 's|<script src="js/advanced-settings.js" type="module"></script>|<script src="js/advanced-settings-bundle.js"></script>|' $DES/advanced-settings.html
sed -i 's|<script src="js/asset-viewer.js" type="module"></script>|<script src="js/asset-viewer-bundle.js"></script>|' $DES/asset-viewer.html
sed -i 's|<script src="js/dashboard.js" type="module"></script>|<script src="js/dashboard-bundle.js"></script>|' $DES/dashboard.html
sed -i 's|<script src="js/devtools.js" type="module"></script>|<script src="js/devtools-bundle.js"></script>|' $DES/devtools.html
sed -i 's|<script src="js/document-blocked.js" type="module"></script>|<script src="js/document-blocked-bundle.js"></script>|' $DES/document-blocked.html
sed -i 's|<script src="js/dyna-rules.js" type="module"></script>|<script src="js/dyna-rules-bundle.js"></script>|' $DES/dyna-rules.html
sed -i 's|<script src="js/logger-ui.js" type="module"></script>|<script src="js/logger-ui-bundle.js"></script>|' $DES/logger-ui.html
sed -i 's|<script src="js/logger-ui-inspector.js" type="module"></script>|<script src="js/logger-ui-inspector-bundle.js"></script>|' $DES/logger-ui.html
sed -i 's|<script src="js/cloud-ui.js" type="module"></script>|<script src="js/cloud-ui.js"></script>|' $DES/1p-filters.html
sed -i 's|<script src="js/cloud-ui.js" type="module"></script>|<script src="js/cloud-ui.js"></script>|' $DES/3p-filters.html
sed -i 's|<script src="js/cloud-ui.js" type="module"></script>|<script src="js/cloud-ui.js"></script>|' $DES/dyna-rules.html
sed -i 's|<script src="js/cloud-ui.js" type="module"></script>|<script src="js/cloud-ui.js"></script>|' $DES/whitelist.html
sed -i 's|<script src="js/settings.js" type="module"></script>|<script src="js/settings-bundle.js"></script>|' $DES/settings.html
sed -i 's|<script src="js/support.js" type="module"></script>|<script src="js/support-bundle.js"></script>|' $DES/support.html
sed -i 's|<script src="js/whitelist.js" type="module"></script>|<script src="js/whitelist-bundle.js"></script>|' $DES/whitelist.html

# Update web-accessible resource entry pages to use emitted MV3 bundles
sed -i 's|<script src="../js/i18n.js" type="module"></script>|<script src="../js/i18n-bundle.js"></script>|' $DES/web_accessible_resources/epicker-ui.html
sed -i 's|<script src="../js/epicker-ui.js" type="module"></script>|<script src="../js/epicker-ui-bundle.js"></script>|' $DES/web_accessible_resources/epicker-ui.html
sed -i 's|<script src="../js/dom-inspector.js" type="module"></script>|<script src="../js/dom-inspector.js"></script>|' $DES/web_accessible_resources/dom-inspector.html

# Fix CSS variables for Chrome MV3 popup
echo "*** uBlock0.chromium-mv3: Adding CSS fallback styles"
sed -i 's|<head>|<head>\n<style>\n:root {\n    --font-size: 14px;\n    --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\n    --surface-0-rgb: 255 255 255;\n    --surface-1: #ffffff;\n    --surface-2: #f0f0f0;\n    --surface-3: #e8e8e8;\n    --ink-1: #000000;\n    --ink-2: #666666;\n    --ink-3: #999999;\n    --ink-4: #333333;\n    --primary-50: #4285f4;\n    --popup-power-ink: #2563eb;\n    --popup-power-ink-rgb: 37 99 235;\n    --button-surface-rgb: 200,200,200;\n    --border-1: #cccccc;\n    --border-2: #dddddd;\n    --default-gap: 16px;\n    --default-gap-small: 12px;\n    --default-gap-xsmall: 8px;\n    --button-font-size: 13px;\n    --popup-gap: 16px;\n    --popup-gap-thin: 8px;\n    --popup-gap-extra-thin: 4px;\n    --popup-toolbar-surface: #f0f0f0;\n    --popup-ruleset-tool-surface: #ffffff;\n    --popup-ruleset-tool-ink: #666666;\n    --checkbox-ink: #999999;\n}\n:root.dark { --surface-1: #1a1a1a; --surface-2: #2a2a2a; --surface-3: #3a3a3a; --ink-1: #ffffff; --ink-2: #aaaaaa; --ink-3: #666666; --ink-4: #cccccc; --button-surface-rgb: 80,80,80; --border-1: #444444; --border-2: #555555; --popup-toolbar-surface: #2a2a2a; --popup-ruleset-tool-surface: #1a1a1a; --popup-ruleset-tool-ink: #aaaaaa; --checkbox-ink: #666666; --popup-power-ink: #2563eb; --popup-power-ink-rgb: 37 99 235; }\nbody { margin: 0; font-size: var(--font-size); overflow: hidden; line-height: 20px; }\nbody.loading { opacity: 1; }\na { color: var(--ink-1); }\na svg { fill: var(--ink-1); }\n#panes { display: flex; flex-direction: row; }\n#main { padding: 10px; min-width: 200px; }\n#sticky { padding: 10px; background: var(--surface-2); }\n.toolRibbon { padding: 8px 0; }\n.toolRibbon > * { margin: 2px; }\nhr { margin: 8px 0; border: 0; border-top: 1px solid var(--border-1); }\n</style>|' $DES/popup-fenix.html

# Remove body loading class
sed -i 's|<body class="loading" data-more="abcd">|<body>|' $DES/popup-fenix.html

# Fix popup-fenix.css - fix :root body patterns
sed -i 's/:root body {/body {/' $DES/css/popup-fenix.css
sed -i 's/:root body,/body,/' $DES/css/popup-fenix.css
sed -i 's/:root.mobile body {/body {/' $DES/css/popup-fenix.css
sed -i '/^:root.mobile body {/,/^    }/d' $DES/css/popup-fenix.css
sed -i 's/:root body.loading {/body.loading {/' $DES/css/popup-fenix.css
sed -i 's/:root.portrait /portrait /g' $DES/css/popup-fenix.css

# Create i18n-fallback.js for MV3 popup
echo "*** uBlock0.chromium-mv3: Creating i18n-fallback.js"
cat > $DES/js/i18n-fallback.js << 'I18NFALLBACKEOF'
(function() {
    var translations = {
        'popupMoreButton_v2': 'More',
        'popupLessButton_v2': 'Less',
        'popupVersion': 'Version',
        'popupNoPopups_v2': 'No popups',
        'popupNoLargeMedia_v2': 'No large media',
        'popupNoCosmeticFiltering_v2': 'No cosmetic',
        'popupNoRemoteFonts_v2': 'No fonts',
        'popupNoScripting_v2': 'No scripting',
        'popupBlockedOnThisPage_v2': 'Blocked on this page',
        'popupDomainsConnected_v2': 'Domains connected',
        'popupBlockedSinceInstall_v2': 'Blocked since install',
        'popupTipZapper': 'Zapper',
        'popupTipPicker': 'Picker',
        'popupTipLightbulb': 'Lightbulb',
        'popupTipLog': 'Log',
        'popupTipDashboard': 'Dashboard',
        'popupTipSaveRules': 'Save rules',
        'popupTipRevertRules': 'Revert rules',
        'popupAnyRulePrompt': 'Any',
        'popupImageRulePrompt': 'Image',
        'popup3pAnyRulePrompt': '3rd-party',
        'popupInlineScriptRulePrompt': 'Inline script',
        'popup1pScriptRulePrompt': '1st-party script',
        'popup3pScriptRulePrompt': '3rd-party script',
        'popup3pFrameRulePrompt': '3rd-party frame',
        'popup3pScriptFilter': 'Script',
        'popup3pFrameFilter': 'Frame',
        'loggerRowFiltererBuiltinNot': 'Not',
        'loggerRowFiltererBuiltinBlocked': 'Blocked',
        'loggerRowFiltererBuiltinAllowed': 'Allowed',
        'unprocessedRequestTooltip': 'Unprocessed request',
        'extName': 'uBlock Resurrected'
    };
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            if (translations[key]) { el.textContent = translations[key]; }
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-title');
            if (translations[key]) { el.setAttribute('title', translations[key]); }
        });
    });
})();
I18NFALLBACKEOF

sed -i 's|<script src="lib/hsluv|<script src="js/i18n-fallback.js"></script>\n<script src="lib/hsluv|' $DES/popup-fenix.html

# Bundle service worker using the new modular system
echo "*** uBlock0.chromium-mv3: Bundling service worker (modular)"
node tools/bundle-sw.js

# Bundle subscriber.js for filter subscription handling
cd src/js
npx esbuild scriptlets/subscriber.ts \
    --bundle \
    --format=iife \
    --outfile=../../$DES/js/scriptlets/subscriber.js \
    --target=chrome120 \
    --platform=browser \
    --minify=false \
    --allow-overwrite 2>&1 || true

# Bundle updater.js for list update handling
npx esbuild scriptlets/updater.ts \
    --bundle \
    --format=iife \
    --outfile=../../$DES/js/scriptlets/updater.js \
    --target=chrome120 \
    --platform=browser \
    --minify=false \
    --allow-overwrite 2>&1 || true

# Bundle should-inject-contentscript.js for startup content script probing
npx esbuild scriptlets/should-inject-contentscript.ts \
    --bundle \
    --format=iife \
    --outfile=../../$DES/js/scriptlets/should-inject-contentscript.js \
    --target=chrome120 \
    --platform=browser \
    --minify=false \
    --allow-overwrite 2>&1 || true
cd - > /dev/null

# Bundle content script modules
echo "*** uBlock0.chromium-mv3: Bundling content script modules"
cd src/js
npx esbuild contentscript/contentscript-entry.ts \
    --bundle \
    --format=iife \
    --outfile=../../$DES/js/contentscript.js \
    --target=chrome120 \
    --platform=browser \
    --minify=false \
    --allow-overwrite 2>&1

# Bundle yt-inject.js for page-context injection
echo "*** uBlock0.chromium-mv3: Bundling yt-inject.js"
npx esbuild contentscript/yt-inject.ts \
    --bundle \
    --format=iife \
    --outfile=../../$DES/js/yt-inject.js \
    --target=chrome120 \
    --platform=browser \
    --minify=false \
    --allow-overwrite 2>&1
cd - > /dev/null

# Create vapi-content.js for element picker
echo "*** uBlock0.chromium-mv3: Creating vapi-content.js for element picker"
cat > $DES/js/vapi-content.js << 'VAPICONTENTEOF'
var vAPI = vAPI || {};
vAPI.uBR = true;
vAPI.T0 = Date.now();
vAPI.sessionId = Math.random().toString(36).slice(2, 18);

vAPI.randomToken = function() {
    var n = Math.random();
    return String.fromCharCode(n * 25 + 97) +
        Math.floor((0.25 + n * 0.75) * Number.MAX_SAFE_INTEGER).toString(36).slice(-8);
};

vAPI.shutdown = {
    jobs: [],
    add: function(job) { this.jobs.push(job); },
    exec: function() {
        self.requestIdleCallback(function() {
            var jobs = this.jobs.slice();
            this.jobs.length = 0;
            while (jobs.length !== 0) { (jobs.pop())(); }
        }.bind(this));
    },
    remove: function(job) {
        var pos;
        while ((pos = this.jobs.indexOf(job)) !== -1) { this.jobs.splice(pos, 1); }
    }
};

vAPI.setTimeout = function(fn, delay) { return setTimeout(fn, delay); };
vAPI.getURL = function(path) { return browser.runtime.getURL(path); };
vAPI.closePopup = function() {};

vAPI.messaging = {
    send: function(channelName, request) {
        return new Promise(function(resolve) {
            browser.runtime.sendMessage({
                channel: channelName,
                msg: request
            }, function(response) {
                resolve(response);
            });
        });
    }
};

vAPI.localStorage = {
    getItemAsync: function(key) { return Promise.resolve(null); },
    setItemAsync: function(key, value) { return Promise.resolve(); }
};

vAPI.userStylesheet = {
    added: new Set(),
    removed: new Set(),
    apply: function(callback) {
        if (this.added.size === 0 && this.removed.size === 0) { return; }
        var added = Array.from(this.added);
        var removed = Array.from(this.removed);
        this.added.clear();
        this.removed.clear();
        
        vAPI.messaging.send('vapi', {
            what: 'userCSS',
            add: added,
            remove: removed,
        }).then(function() {
            if (callback instanceof Function) { callback(); }
        }).catch(function() {
            if (callback instanceof Function) { callback(); }
        });
    },
    add: function(cssText, now) {
        if (cssText === '') { return; }
        this.added.add(cssText);
        if (now) { this.apply(); }
    },
    remove: function(cssText, now) {
        if (cssText === '') { return; }
        this.removed.add(cssText);
        if (now) { this.apply(); }
    }
};
VAPICONTENTEOF

# Clean up MV2-specific files
echo "*** uBlock0.chromium-mv3: Cleaning up MV2-specific files"
rm -f $DES/js/start.js 2>/dev/null || true

echo "*** uBlock0.chromium-mv3: Package done."
echo "*** uBlock0.chromium-mv3: Build complete."
