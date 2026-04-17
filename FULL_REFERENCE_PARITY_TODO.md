# Full Reference Parity Inventory

This is the current parity inventory for `uBlockResurrected` versus the reference project:

`/home/glompy/Desktop/ASTROCYTECH/git_project/Blocker/temporary_folder/mv3-references/uBlock/`

This version is intentionally broader than a normal TODO. It is meant to be a working parity ledger:
- what is already close
- what still differs
- which diffs are likely functional
- which diffs are structural or build-related
- which areas still need runtime verification

This master document is now paired with raw repo-wide diff ledgers:
- [FULL_REFERENCE_PARITY_SRC_LEDGER.txt](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/FULL_REFERENCE_PARITY_SRC_LEDGER.txt)
- [FULL_REFERENCE_PARITY_TOOLS_LEDGER.txt](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/FULL_REFERENCE_PARITY_TOOLS_LEDGER.txt)
- [FULL_REFERENCE_PARITY_PLATFORM_LEDGER.txt](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/FULL_REFERENCE_PARITY_PLATFORM_LEDGER.txt)

Taken together, these files are the complete current parity record:
- this file explains and classifies the parity state
- the ledger files enumerate the raw file-level diffs exactly as `diff -qr` reported them

## How To Read This

Status labels used below:
- `Mirrored-ish`: restored close to the reference, but still not claimed as exact parity
- `Partial`: some reference logic restored, but remaining drift still exists
- `Not mirrored`: meaningful parity gap remains
- `Structural drift`: file/layout/build difference that may or may not be functional
- `Needs runtime verification`: source drift may be small, but behavior still needs side-by-side checking

Important caveat:
- A `.js` file in the reference versus a `.ts` file here is not by itself a parity failure.
- Generated `*-bundle.js` files in this repo are build artifacts, not direct evidence of functional drift.
- The real parity question is whether the shipped behavior matches the reference.

## Current Overall Assessment

High-level state today:
- Popup/firewall: `Partial`
- Logger: `Partial`
- Settings: `Partial`
- Dynamic rules: `Partial`
- Trusted sites: `Partial`
- Dashboard shell and remaining tabs: `Partial`
- MV3 backend/service worker: `Not mirrored`
- Shared assets, locales, web-accessible resources: `Not mirrored`
- Build/platform layout: `Structural drift`

Bottom line:
- The project is not yet a full mirror of the reference.
- The remaining parity gap is still substantial.

## Section A: HTML/UI Surface Inventory

These are source HTML files currently reported as different from the reference.

### Dashboard and major UI pages
- `src/1p-filters.html` — `Partial`
- `src/3p-filters.html` — `Partial`
- `src/about.html` — `Partial`
- `src/advanced-settings.html` — `Not mirrored`
- `src/asset-viewer.html` — `Not mirrored`
- `src/background.html` — `Not mirrored`
- `src/cloud-ui.html` — `Not mirrored`
- `src/code-viewer.html` — `Not mirrored`
- `src/dashboard.html` — `Partial`
- `src/devtools.html` — `Not mirrored`
- `src/document-blocked.html` — `Not mirrored`
- `src/dyna-rules.html` — `Partial`
- `src/logger-ui.html` — `Partial`
- `src/no-dashboard.html` — `Not mirrored`
- `src/popup-fenix.html` — `Partial`
- `src/settings.html` — `Partial`
- `src/support.html` — `Partial`
- `src/whitelist.html` — `Partial`

### Extra HTML files only in this repo
- `src/matched-rules.html` — `Structural drift`
- `src/picker-ui.html` — `Structural drift`
- `src/zapper-ui.html` — `Structural drift`

### Extra source directories only in this repo
- `src/core` — `Structural drift`
- `src/dist` — `Structural drift`
- `src/types` — `Structural drift`

## Section B: CSS/Theming Inventory

### CSS files differing from the reference
- `src/css/3p-filters.css` — `Partial`
- `src/css/click2load.css` — `Not mirrored`
- `src/css/common.css` — `Not mirrored`
- `src/css/epicker-ui.css` — `Partial`
- `src/css/fa-icons.css` — `Not mirrored`
- `src/css/logger-ui.css` — `Partial`
- `src/css/themes/default.css` — `Not mirrored`

### CSS files missing here but present in the reference
- `src/css/asset-viewer.css` — `Not mirrored`
- `src/css/devtools.css` — `Not mirrored`
- `src/css/document-blocked.css` — `Not mirrored`

### Extra CSS files only in this repo
- `src/css/dashboard-pane-lite.css` — `Structural drift`
- `src/css/develop.css` — `Structural drift`
- `src/css/filtering-mode.css` — `Structural drift`
- `src/css/picker-ui.css` — `Structural drift`
- `src/css/tool-overlay-ui.css` — `Structural drift`
- `src/css/zapper-ui.css` — `Structural drift`

## Section C: Image/Icon Asset Inventory

### Assets present in the reference but missing here
- `src/img/cloud.png` — `Not mirrored`
- `src/img/help16.png` — `Not mirrored`
- `src/img/icon_128.png` — `Not mirrored`
- `src/img/icon_16-loading.png` — `Not mirrored`
- `src/img/icon_16-off.png` — `Not mirrored`
- `src/img/icon_16.png` — `Not mirrored`
- `src/img/icon_32-loading.png` — `Not mirrored`
- `src/img/icon_32-off.png` — `Not mirrored`
- `src/img/icon_32.png` — `Not mirrored`
- `src/img/icon_64-loading.png` — `Not mirrored`
- `src/img/icon_64-off.png` — `Not mirrored`
- `src/img/icon_64.png` — `Not mirrored`
- `src/img/flags-of-the-world/` — `Not mirrored`
- `src/img/fontawesome/` — `Not mirrored`

### Assets differing
- `src/img/photon.svg` — `Partial`
- `src/img/ublock-defs.svg` — `Partial`
- `src/img/ublock.svg` — `Partial`

### Extra assets only in this repo
- `src/img/photon.svg.backup` — `Structural drift`
- `src/img/ublock16.png` — `Structural drift`
- `src/img/ublock32.png` — `Structural drift`
- `src/img/ublock48.png` — `Structural drift`
- `src/img/ublock64.png` — `Structural drift`
- `src/img/ublock96.png` — `Structural drift`
- `src/img/ublock128.png` — `Structural drift`
- `src/img/ublock256.png` — `Structural drift`

## Section D: Localization Inventory

All of the following locale catalogs currently differ from the reference:

- `src/_locales/ar/messages.json`
- `src/_locales/az/messages.json`
- `src/_locales/be/messages.json`
- `src/_locales/bg/messages.json`
- `src/_locales/bn/messages.json`
- `src/_locales/br_FR/messages.json`
- `src/_locales/bs/messages.json`
- `src/_locales/ca/messages.json`
- `src/_locales/cs/messages.json`
- `src/_locales/cv/messages.json`
- `src/_locales/cy/messages.json`
- `src/_locales/da/messages.json`
- `src/_locales/de/messages.json`
- `src/_locales/el/messages.json`
- `src/_locales/en/messages.json`
- `src/_locales/en_GB/messages.json`
- `src/_locales/eo/messages.json`
- `src/_locales/es/messages.json`
- `src/_locales/et/messages.json`
- `src/_locales/eu/messages.json`
- `src/_locales/fa/messages.json`
- `src/_locales/fi/messages.json`
- `src/_locales/fil/messages.json`
- `src/_locales/fr/messages.json`
- `src/_locales/fy/messages.json`
- `src/_locales/gl/messages.json`
- `src/_locales/gu/messages.json`
- `src/_locales/he/messages.json`
- `src/_locales/hi/messages.json`
- `src/_locales/hr/messages.json`
- `src/_locales/hu/messages.json`
- `src/_locales/hy/messages.json`
- `src/_locales/id/messages.json`
- `src/_locales/it/messages.json`
- `src/_locales/ja/messages.json`
- `src/_locales/ka/messages.json`
- `src/_locales/kk/messages.json`
- `src/_locales/kn/messages.json`
- `src/_locales/ko/messages.json`
- `src/_locales/lt/messages.json`
- `src/_locales/lv/messages.json`
- `src/_locales/mk/messages.json`
- `src/_locales/ml/messages.json`
- `src/_locales/mr/messages.json`
- `src/_locales/ms/messages.json`
- `src/_locales/nb/messages.json`
- `src/_locales/nl/messages.json`
- `src/_locales/oc/messages.json`
- `src/_locales/pa/messages.json`
- `src/_locales/pl/messages.json`
- `src/_locales/pt_BR/messages.json`
- `src/_locales/pt_PT/messages.json`
- `src/_locales/ro/messages.json`
- `src/_locales/ru/messages.json`
- `src/_locales/si/messages.json`
- `src/_locales/sk/messages.json`
- `src/_locales/sl/messages.json`
- `src/_locales/so/messages.json`
- `src/_locales/sq/messages.json`
- `src/_locales/sr/messages.json`
- `src/_locales/sv/messages.json`
- `src/_locales/sw/messages.json`
- `src/_locales/ta/messages.json`
- `src/_locales/te/messages.json`
- `src/_locales/th/messages.json`
- `src/_locales/tr/messages.json`
- `src/_locales/uk/messages.json`
- `src/_locales/ur/messages.json`
- `src/_locales/vi/messages.json`
- `src/_locales/zh_CN/messages.json`
- `src/_locales/zh_TW/messages.json`

Assessment:
- Locale parity is `Not mirrored`.
- This is likely both functional and UX-affecting.

## Section E: JS/Controller Inventory

The JS tree has two different kinds of drift:
- source-format drift: reference uses `.js`, this repo uses `.ts`
- actual content drift: file behavior still differs from the reference

### Pages/controllers currently known to still differ functionally or semantically
- `src/js/cloud-ui.js` — `Partial`
- `src/js/theme.js` — `Partial`
- `src/js/logger-ui.ts` — `Partial`
- `src/js/logger-ui-inspector.ts` — `Partial`
- `src/js/advanced-settings.ts` — `Not mirrored`
- `src/js/asset-viewer.ts` — `Not mirrored`
- `src/js/devtools.ts` — `Not mirrored`
- `src/js/document-blocked.ts` — `Not mirrored`
- `src/js/messaging.ts` — `Partial`
- `src/js/start.ts` — `Partial`
- `src/js/background.ts` — `Partial`
- `src/js/storage.ts` — `Partial`
- `src/js/assets.ts` — `Partial`
- `src/js/redirect-engine.ts` — `Partial`

### MV3/backend-specific code only in this repo
- `src/js/mv3/` — `Not mirrored`
- `src/js/dnr-integration.ts` — `Not mirrored`
- `src/js/blocker-adapter.ts` — `Not mirrored`
- `src/js/filter-storage.ts` — `Not mirrored`
- `src/js/filtering-compiler.ts` — `Not mirrored`
- `src/js/contentscript/` — `Structural drift` with possible functional impact
- `src/js/scripting/` — `Structural drift` with possible functional impact

### Generated bundle files only in this repo

These are build outputs, not direct source-parity targets:
- `1p-filters-bundle.js`
- `3p-filters-bundle.js`
- `about-bundle.js`
- `advanced-settings-bundle.js`
- `asset-viewer-bundle.js`
- `code-viewer-bundle.js`
- `contentscript-bundle.js`
- `dashboard-bundle.js`
- `dashboard-common-bundle.js`
- `devtools-bundle.js`
- `dyna-rules-bundle.js`
- `epicker-ui-bundle.js`
- `fa-icons-bundle.js`
- `i18n-bundle.js`
- `logger-ui-bundle.js`
- `logger-ui-inspector-bundle.js`
- `messaging-bundle.js`
- `popup-fenix-bundle.js`
- `support-bundle.js`
- `theme-bundle.js`
- `webext-bundle.js`

Assessment:
- These files are `Structural drift`.
- They should not be used as the parity truth source.

### JS source file pairs that are mostly source-format drift

These should be treated as `Needs runtime verification`, not automatically as parity failures:
- `1p-filters.js` vs `1p-filters.ts`
- `3p-filters.js` vs `3p-filters.ts`
- `about.js` vs `about.ts`
- `arglist-parser.js` vs `arglist-parser.ts`
- `asset-viewer.js` vs `asset-viewer.ts`
- `assets.js` vs `assets.ts`
- `background.js` vs `background.ts`
- `base64-custom.js` vs `base64-custom.ts`
- `benchmarks.js` vs `benchmarks.ts`
- `biditrie.js` vs `biditrie.ts`
- `broadcast.js` vs `broadcast.ts`
- `cachestorage.js` vs `cachestorage.ts`
- `click2load.js` vs `click2load.ts`
- `code-viewer.js` vs `code-viewer.ts`
- `commands.js` vs `commands.ts`
- `console.js` vs `console.ts`
- `contentscript-extra.js` vs `contentscript-extra.ts`
- `contentscript.js` vs `contentscript.ts`
- `contextmenu.js` vs `contextmenu.ts`
- `cosmetic-filtering.js` vs `cosmetic-filtering.ts`
- `dashboard-common.js` vs `dashboard-common.ts`
- `dashboard.js` vs `dashboard.ts`
- `devtools.js` vs `devtools.ts`
- `diff-updater.js` vs `diff-updater.ts`
- `document-blocked.js` vs `document-blocked.ts`
- `dom-inspector.js` vs `dom-inspector.ts`
- `dom.js` vs `dom.ts`
- `dyna-rules.js` vs `dyna-rules.ts`
- `dynamic-net-filtering.js` vs `dynamic-net-filtering.ts`
- `epicker-ui.js` vs `epicker-ui.ts`
- `filtering-context.js` vs `filtering-context.ts`
- `filtering-engines.js` vs `filtering-engines.ts`
- `hnswitches.js` vs `hnswitches.ts`
- `hntrie.js` vs `hntrie.ts`
- `html-filtering.js` vs `html-filtering.ts`
- `httpheader-filtering.js` vs `httpheader-filtering.ts`
- `i18n.js` vs `i18n.ts`
- `jsonpath.js` vs `jsonpath.ts`
- `logger-ui-inspector.js` vs `logger-ui-inspector.ts`
- `logger-ui.js` vs `logger-ui.ts`
- `logger.js` vs `logger.ts`
- `lz4.js` vs `lz4.ts`
- `messaging.js` vs `messaging.ts`
- `mrucache.js` vs `mrucache.ts`
- `pagestore.js` vs `pagestore.ts`
- `popup-fenix.js` vs `popup-fenix.ts`
- `redirect-engine.js` vs `redirect-engine.ts`
- `redirect-resources.js` vs `redirect-resources.ts`
- `regex-analyzer.js` vs `regex-analyzer.ts`
- `reverselookup-worker.js` vs `reverselookup-worker.ts`
- `reverselookup.js` vs `reverselookup.ts`
- `s14e-serializer.js` vs `s14e-serializer.ts`
- `scriptlet-filtering-core.js` vs `scriptlet-filtering-core.ts`
- `scriptlet-filtering.js` vs `scriptlet-filtering.ts`
- `settings.js` vs `settings.ts`
- `start.js` vs `start.ts`
- `static-dnr-filtering.js` vs `static-dnr-filtering.ts`
- `static-ext-filtering-db.js` vs `static-ext-filtering-db.ts`
- `static-ext-filtering.js` vs `static-ext-filtering.ts`
- `static-filtering-io.js` vs `static-filtering-io.ts`
- `static-filtering-parser.js` vs `static-filtering-parser.ts`
- `static-net-filtering.js` vs `static-net-filtering.ts`
- `storage.js` vs `storage.ts`
- `support.js` vs `support.ts`
- `tab.js` vs `tab.ts`
- `tasks.js` vs `tasks.ts`
- `text-encode.js` vs `text-encode.ts`
- `text-utils.js` vs `text-utils.ts`
- `traffic.js` vs `traffic.ts`
- `ublock.js` vs `ublock.ts`
- `uri-utils.js` vs `uri-utils.ts`
- `url-net-filtering.js` vs `url-net-filtering.ts`
- `urlskip.js` vs `urlskip.ts`
- `utils.js` vs `utils.ts`
- `whitelist.js` vs `whitelist.ts`

## Section F: Scriptlet And Resource Payload Inventory

These are direct content diffs in `src/js/resources`, not just `.js`/`.ts` naming differences.

All of the following currently differ from the reference:
- `attribute.js`
- `base.js`
- `cookie.js`
- `create-html.js`
- `href-sanitizer.js`
- `json-edit.js`
- `json-prune.js`
- `localstorage.js`
- `noeval.js`
- `object-prune.js`
- `parse-replace.js`
- `prevent-addeventlistener.js`
- `prevent-dialog.js`
- `prevent-fetch.js`
- `prevent-innerHTML.js`
- `prevent-navigation.js`
- `prevent-settimeout.js`
- `prevent-xhr.js`
- `proxy-apply.js`
- `replace-argument.js`
- `run-at.js`
- `safe-self.js`
- `scriptlets.js`
- `set-constant.js`
- `shared.js`
- `spoof-css.js`
- `stack-trace.js`
- `utils.js`

Assessment:
- `Not mirrored`
- high likelihood of real functional differences in filtering/scriptlet behavior

## Section G: Scriptlet Source Inventory

These are `.js` vs `.ts` source-format pairs that still need runtime verification:
- `scriptlets/cosmetic-logger`
- `scriptlets/cosmetic-off`
- `scriptlets/cosmetic-on`
- `scriptlets/cosmetic-report`
- `scriptlets/dom-inspector`
- `scriptlets/dom-survey-elements`
- `scriptlets/dom-survey-scripts`
- `scriptlets/load-3p-css`
- `scriptlets/load-large-media-all`
- `scriptlets/load-large-media-interactive`
- `scriptlets/noscript-spoof`
- `scriptlets/scriptlet-loglevel-1`
- `scriptlets/scriptlet-loglevel-2`
- `scriptlets/should-inject-contentscript`
- `scriptlets/subscriber`
- `scriptlets/updater`

Assessment:
- `Needs runtime verification`
- these may be equivalent source ports, but they are not yet signed off as mirrored

## Section H: Web Accessible Resources Inventory

The following shipped resources currently differ from the reference:
- `README.txt`
- `amazon_ads.js`
- `amazon_apstag.js`
- `ampproject_v0.js`
- `chartbeat.js`
- `click2load.html`
- `dom-inspector.html`
- `epicker-ui.html`
- `fingerprint2.js`
- `fingerprint3.js`
- `google-analytics_analytics.js`
- `google-analytics_cx_api.js`
- `google-analytics_ga.js`
- `google-analytics_inpage_linkid.js`
- `google-ima.js`
- `googlesyndication_adsbygoogle.js`
- `googletagmanager_gtm.js`
- `googletagservices_gpt.js`
- `hd-main.js`
- `nitropay_ads.js`
- `nobab.js`
- `nobab2.js`
- `noeval-silent.js`
- `noeval.js`
- `nofab.js`
- `outbrain-widget.js`
- `popads-dummy.js`
- `popads.js`
- `prebid-ads.js`
- `scorecardresearch_beacon.js`
- `sensors-analytics.js`

Assessment:
- `Not mirrored`
- these are part of shipped behavior, not just build metadata

## Section I: Library / WASM Inventory

Known diffs:
- `src/lib/diff/swatinem_diff.js` — `Partial`
- `src/lib/publicsuffixlist/wasm/publicsuffixlist.wat` — `Partial`
- `src/lib/punycode.js` — `Partial`
- `src/js/wasm/biditrie.wat` — `Partial`
- `src/js/wasm/hntrie.wat` — `Partial`

## Section J: Platform Inventory

### Platform directory layout
- `platform/chrome/` exists only here — `Structural drift`
- `platform/chromium/` exists only in the reference — `Structural drift`
- Reference-only platform directories:
  - `platform/dig/`
  - `platform/firefox/`
  - `platform/mv3/`
  - `platform/nodejs/`
  - `platform/npm/`
  - `platform/opera/`
  - `platform/safari/`
  - `platform/thunderbird/`

### Platform common files differing
- `platform/common/managed_storage.json` — `Partial`
- `platform/common/vapi-background.js` — `Partial`
- `platform/common/vapi-client.js` — `Partial`
- `platform/common/vapi-common.js` — `Partial`
- `platform/common/vapi.js` — `Partial`

### Extra platform-common files only here
- `platform/common/vapi-background-ext.js` — `Structural drift`
- `platform/common/webext.js` — `Structural drift`

## Section K: Tooling / Build Inventory

### Tools differing
- `tools/copy-common-files.sh` — `Partial`
- `tools/import-crowdin.sh` — `Partial`
- `tools/jsonpath-tool.html` — `Partial`

### Tooling only in this repo
- `tools/bundle-sw.js` — `Structural drift`
- `tools/dist/` — `Structural drift`
- `tools/make-chrome-mv3.sh` — `Structural drift` with functional impact

### Tooling only in the reference
- `tools/make-chromium-meta.py`
- `tools/make-chromium.sh`
- `tools/make-dig.sh`
- `tools/make-firefox-meta.py`
- `tools/make-firefox.sh`
- `tools/make-mv3.sh`
- `tools/make-nodejs.sh`
- `tools/make-npm.sh`
- `tools/make-opera-meta.py`
- `tools/make-opera.sh`
- `tools/make-thunderbird.sh`

Assessment:
- Tooling/platform parity is `Structural drift`
- but some of it can affect shipped parity, especially packaging and asset copying

## Section L: Functional Risk Areas Still Open

These are the highest-risk areas where source drift is most likely still user-visible:
- MV3 service worker bootstrap and message routing
- logger advanced features beyond basic live rows
- popup embedded in logger
- picker/zapper/reporter end-to-end behavior
- filter-list dashboard behavior
- advanced settings page
- document-blocked page
- devtools page
- asset viewer
- shipped web-accessible resources and scriptlet resources
- localization completeness

## Section M: What Would Count As Actual Full Parity

Do not call the repo fully mirrored until all of the following are true:
- every functional HTML page is either line-matched to the reference or justified as an intentional build-only adaptation
- every controller/backend path is classified and verified
- all `src/js/resources/*` payloads match or are intentionally adapted and verified
- all `src/web_accessible_resources/*` shipped payloads match or are intentionally adapted and verified
- locale catalogs are reconciled
- icon and asset sets are reconciled
- platform/common behavior is reconciled
- the packaged MV3 output is compared side-by-side against the reference output
- the functional verification matrix passes

## Section N: Remaining Execution Order

Recommended order from here:

1. Finish dashboard-adjacent pages:
   `advanced-settings`, `asset-viewer`, `devtools`, `document-blocked`, `logger-ui`, `no-dashboard`, `background`, `cloud-ui`, `code-viewer`
2. Reconcile MV3 backend/service worker drift.
3. Reconcile `src/js/resources/*`.
4. Reconcile `src/web_accessible_resources/*`.
5. Reconcile shared CSS/theme/icons.
6. Reconcile locales.
7. Reconcile `platform/common/*` and packaging logic.
8. Run side-by-side behavioral verification against the reference.

## Section O: Completeness Statement

What is complete now:
- the master inventory covers the major areas and classifications
- the raw `src`, `tools`, and `platform` diff ledgers are stored in the repo
- every currently known repo-wide parity diff found by `diff -qr` is now documented either:
  - in this master inventory, or
  - in one of the raw ledger files

What is still not complete in a stronger forensic sense:
- not every diff line has an individual handwritten note yet
- not every diff is classified individually as `functional`, `asset-only`, `build-only`, or `intentional`
- behavioral parity still requires runtime verification even when the file-level diff is documented

So the documentation set is now complete as a parity record of the current repo diff state, but not complete as a fully adjudicated per-file root-cause analysis.

## Important Note

`diff -qr` overstates some differences because this repo is TS/bundled while the reference is JS/source-first. Not every `.js` vs `.ts` filename mismatch is a functional mismatch.

However, the audit clearly shows that the project is not yet fully mirrored. The remaining work is substantial and spans UI, backend, assets, localization, and packaging.
