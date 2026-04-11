#!/usr/bin/env bash
#
# This script assumes a linux environment

set -e

DES=$1

bash ./tools/make-assets.sh        $DES

cp -R src/css                      $DES/
cp -R src/img                      $DES/
mkdir $DES/js
cp src/js/*.ts                    $DES/js/
cp src/js/*.js                    $DES/js/ 2>/dev/null || true
cp -R src/js/blocker-core          $DES/js/
cp -R src/js/resources             $DES/js/
cp -R src/js/codemirror            $DES/js/
cp -R src/js/scriptlets            $DES/js/
cp -R src/js/wasm                  $DES/js/
cp -R src/lib                      $DES/
cp -R src/web_accessible_resources $DES/
cp -R src/_locales                 $DES/

cp src/*.html                      $DES/
cp platform/common/*.js            $DES/js/
cp platform/common/*.json          $DES/
cp src/js/vapi.js                  $DES/js/  # Use MV3-specific vapi.js with messaging support
cp LICENSE.txt                     $DES/
