/*******************************************************************************

    uBlock Origin - vAPI Common
    https://github.com/gorhill/uBlock

    Common utilities shared between vAPI modules.

*******************************************************************************/

(function() {
    'use strict';

    var vAPI = window.vAPI || {};

    vAPI.DEVICE_RENAME_RATE = 1;

    vAPI.responsive = {
        LARGE: 'large',
        MEDIUM: 'medium',
        SMALL: 'small',
        UNKOWN: 'unknown'
    };

    vAPI.screen = {
        width: window.screen.width,
        height: window.screen.height
    };

    vAPI.devicePixelRatio = window.devicePixelRatio || 1;

    vAPI.responsiveBehavior = function() {
        if (this.screen.width < 400) {
            return this.responsive.SMALL;
        }
        if (this.screen.width < 800) {
            return this.responsive.MEDIUM;
        }
        return this.responsive.LARGE;
    };

    vAPI.getSelectedElements = function() {
        var selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return [];
        }
        var elements = [];
        var range = selection.getRangeAt(0);
        if (range && range.commonAncestorContainer) {
            var node = range.commonAncestorContainer;
            if (node.nodeType === Node.ELEMENT_NODE) {
                elements.push(node);
            } else if (node.parentNode && node.parentNode.nodeType === Node.ELEMENT_NODE) {
                elements.push(node.parentNode);
            }
        }
        return elements;
    };

    vAPI.getElementSelector = function(element) {
        if (!element) return '';
        
        if (element.id) {
            return '#' + CSS.escape(element.id);
        }

        var selector = element.tagName.toLowerCase();

        if (element.className && typeof element.className === 'string') {
            var classes = element.className.trim().split(/\s+/).slice(0, 2);
            if (classes.length > 0 && classes[0]) {
                selector += '.' + classes.map(function(c) {
                    return CSS.escape(c);
                }).join('.');
            }
        }

        if (element.parentNode && element.parentNode.tagName) {
            var siblings = Array.from(element.parentNode.children).filter(function(el) {
                return el.tagName === element.tagName;
            });
            if (siblings.length > 1) {
                var index = siblings.indexOf(element) + 1;
                selector += ':nth-of-type(' + index + ')';
            }
        }

        return selector;
    };

    vAPI.normalizeSelector = function(selector) {
        if (!selector) return '';
        
        selector = selector.trim();
        
        selector = selector.replace(/\s+/g, ' ');
        
        selector = selector.replace(/\s*>\s*/g, '>');
        selector = selector.replace(/\s*\+\s*/g, '+');
        selector = selector.replace(/\s*~\s*/g, '~');
        
        return selector;
    };

    vAPI.CSSEscape = function(text) {
        if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(text);
        }
        return text.replace(/([ !#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~"])/g, '\\$1');
    };

    vAPI.withoutWhitespace = function(text) {
        if (!text) return '';
        return text.replace(/[\s\r\n]+/g, '');
    };

    vAPI.getPageHostname = function() {
        return window.location.hostname || '';
    };

    vAPI.getPageURL = function() {
        return window.location.href || '';
    };

    vAPI.getPageDomain = function() {
        return window.location.hostname || '';
    };

    vAPI.isInternalPage = function() {
        var url = window.location.href;
        return url.startsWith('about:') ||
               url.startsWith('chrome:') ||
               url.startsWith('moz-extension:') ||
               url.startsWith('chrome-extension:');
    };

    vAPI.normalizeRawURL = function(rawURL) {
        if (!rawURL) return '';
        
        if (rawURL.indexOf('://') === -1) {
            rawURL = 'https://' + rawURL;
        }
        
        try {
            var url = new URL(rawURL);
            return url.href;
        } catch (e) {
            return rawURL;
        }
    };

    vAPI.sanitizeHostname = function(hostname) {
        if (!hostname) return '';
        hostname = hostname.trim().toLowerCase();
        hostname = hostname.replace(/^www\./, '');
        return hostname;
    };

    vAPI.sanitizeDomain = vAPI.sanitizeHostname;

    vAPI.webextFlavor = 'chromium';

    window.vAPI = vAPI;

})();
