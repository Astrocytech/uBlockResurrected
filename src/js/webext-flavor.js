/*******************************************************************************

    uBlock Origin - WebExt Flavor Detection
    https://github.com/gorhill/uBlock

    Detects the current browser/extension platform and sets the appropriate
    flavor flags for conditional code execution.

*******************************************************************************/

(function() {
    'use strict';

    var webextFlavor = {
        vAPI: null,
        id: 'unknown',
        
        chromium: false,
        firefox: false,
        safari: false,
        
        mv2: false,
        mv3: true,

        offscreen: false,

        noop: false,

        init: function(vAPI) {
            this.vAPI = vAPI || window.vAPI;
            this._detect();
        },

        _detect: function() {
            var ua = navigator.userAgent || '';

            if (/Firefox/.test(ua)) {
                this.firefox = true;
                this.id = 'firefox';
            } else if (/Edg\//.test(ua)) {
                this.chromium = true;
                this.id = 'edge';
            } else if (/Chrome/.test(ua)) {
                this.chromium = true;
                this.id = 'chromium';
            } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
                this.safari = true;
                this.id = 'safari';
            }

            this.mv2 = typeof browser !== 'undefined' && browser.runtime &&
                       typeof browser.runtime.getManifest === 'function' &&
                       browser.runtime.getManifest().manifest_version === 2;

            this.mv3 = !this.mv2;

            if (this.vAPI) {
                this.vAPI.webextFlavor = this.id;
                this.vAPI.webextFlavorObj = this;
            }
        },

        isFirefox: function() {
            return this.firefox;
        },

        isChromium: function() {
            return this.chromium;
        },

        isSafari: function() {
            return this.safari;
        },

        isMV3: function() {
            return this.mv3;
        },

        isMV2: function() {
            return this.mv2;
        },

        supportsServiceWorker: function() {
            return this.chromium || (this.firefox && !this.mv2);
        },

        supportsDeclarativeNetRequest: function() {
            return this.chromium || this.firefox;
        },

        supportsOffscreenDocument: function() {
            return this.chromium && this.mv3;
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = webextFlavor;
    } else if (typeof window !== 'undefined') {
        window.webextFlavor = webextFlavor;
    }

})();
