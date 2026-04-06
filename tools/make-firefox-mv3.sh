#!/usr/bin/env bash
#
# uBlock Origin Firefox MV3 Build Script (Service Worker)
# This script assumes a linux environment

set -e

echo "*** uBlock0.firefox-mv3: Building Firefox MV3 extension (Service Worker)"

BLDIR=dist/build
DES="$BLDIR"/uBlock0.firefox-mv3
mkdir -p $DES
rm -rf $DES/*

echo "*** uBlock0.firefox-mv3: Copying common files"
bash ./tools/copy-common-files.sh $DES

# Firefox MV3-specific
echo "*** uBlock0.firefox-mv3: Copying firefox-mv3-specific files"
cp platform/firefox/*.json $DES/
cp platform/firefox/*.js   $DES/js/

# Bundle background.js using esbuild
# Copy entire src directory to preserve relative paths
echo "*** uBlock0.firefox-mv3: Bundling background.js with esbuild"
rm -f $DES/js/start.js $DES/js/background.js

# Create temp dir and copy entire src structure
rm -rf /tmp/ubo-mv3-build
mkdir -p /tmp/ubo-mv3-build

# Copy entire src tree (preserves relative paths like ../lib/)
cp -r src/* /tmp/ubo-mv3-build/

# Copy platform files
cp platform/common/*.js /tmp/ubo-mv3-build/js/
cp platform/firefox/*.js /tmp/ubo-mv3-build/js/

# Copy lib directory (needed for lz4)
cp -r src/lib /tmp/ubo-mv3-build/

cd /tmp/ubo-mv3-build/js
esbuild start.js \
    --bundle \
    --format=iife \
    --minify \
    --outfile=background.js \
    --target=firefox128 \
    --platform=browser \
    --external:*benchmarks.js \
    --external:*code-viewer.js \
    --external:*asset-viewer.js \
    --allow-overwrite \
    2>&1
cd - > /dev/null

if [ -s /tmp/ubo-mv3-build/js/background.js ]; then
    # Add service worker shims to the bundled code
    echo "*** uBlock0.firefox-mv3: Adding service worker shims"
    
    # Create service worker shim
    cat > /tmp/sw-shim.js << 'SHIM'
// Service Worker shims for MV3 compatibility
(function() {
    'use strict';
    
    // Shim setTimeout/setInterval to use self (service worker context)
    if (typeof setTimeout === 'undefined') {
        self.setTimeout = function(fn, delay) {
            return self.setInterval(function() {
                fn();
            }, delay);
        };
    }
    if (typeof setInterval === 'undefined') {
        self.setInterval = function(fn, delay) {
            return self.setTimeout.call(self, fn, delay);
        };
    }
    
    // Ensure self is defined (should be in SW)
    if (typeof self === 'undefined') {
        var global = {};
    }
})();
SHIM
    
    # Prepend shim to background.js
    cat /tmp/sw-shim.js /tmp/ubo-mv3-build/js/background.js > /tmp/background-shimmed.js
    mv /tmp/background-shimmed.js /tmp/ubo-mv3-build/js/background.js
    rm /tmp/sw-shim.js
    
    cp /tmp/ubo-mv3-build/js/background.js $DES/js/background.js
else
    echo "ERROR: esbuild failed"
    rm -rf /tmp/ubo-mv3-build
    exit 1
fi

rm -rf /tmp/ubo-mv3-build

# Remove individual JS files that are now bundled (but keep vapi files for popup/dashboard)
rm -f $DES/js/commands.js $DES/js/messaging.js $DES/js/start.js

# Keep vapi.js, vapi-client.js, vapi-common.js for popup/dashboard UI pages
# These are needed by content scripts and popup pages, not by background

# Remove unneeded files for MV3
echo "*** uBlock0.firefox-mv3: Cleaning up MV2-specific files"
rm -f $DES/img/icon_128.png
rm -f $DES/background.html  # Not needed with service worker

# Firefox store-specific
cp -R $DES/_locales/nb     $DES/_locales/no

echo "*** uBlock0.firefox-mv3: Generating meta..."
python3 tools/make-firefox-meta.py $DES/ || true

if [ "$1" = all ]; then
    echo "*** uBlock0.firefox-mv3: Creating package..."
    pushd $DES > /dev/null
    zip ../$(basename $DES).xpi -qr *
    popd > /dev/null
elif [ -n "$1" ]; then
    echo "*** uBlock0.firefox-mv3: Creating versioned package..."
    pushd $DES > /dev/null
    zip ../$(basename $DES).xpi -qr *
    popd > /dev/null
    mv "$BLDIR"/uBlock0.firefox-mv3.xpi "$BLDIR"/uBlock0_"$1".firefox-mv3.xpi
fi

echo "*** uBlock0.firefox-mv3: Package done."