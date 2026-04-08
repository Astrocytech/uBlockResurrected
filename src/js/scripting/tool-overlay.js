/*******************************************************************************

    uBlock Resurrected - Tool Overlay Content Script
    Creates the zapper UI iframe and handles DOM manipulation

    This script runs in the page context via scripting.executeScript

    Architecture:
    - tool-overlay.js: Content script (page context) - handles DOM
    - tool-overlay-ui.js: UI logic (iframe context) - handles events
    - zapper.js: Zapper-specific logic (page context)

    Communication: MessageChannel via ubolOverlay.port

*******************************************************************************/

(function() {
    'use strict';

    if ( self.ubolOverlay ) {
        self.ubolOverlay.stop();
    }

    const secretAttr = (function() {
        let secret = String.fromCharCode((Math.random() * 26) + 97);
        do {
            secret += Math.floor(Math.random() * 0xFFFFFFFF).toString(36);
        } while ( secret.length < 8 );
        return secret;
    })();

    const webext = {
        i18n: {
            getMessage: function(key) {
                if ( typeof chrome !== 'undefined' && chrome.i18n ) {
                    return chrome.i18n.getMessage(key) || key;
                }
                return key;
            }
        },
        runtime: {
            getURL: function(path) {
                if ( typeof chrome !== 'undefined' && chrome.runtime ) {
                    return chrome.runtime.getURL(path);
                }
                return path;
            },
            sendMessage: function(msg) {
                if ( typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage ) {
                    return chrome.runtime.sendMessage(msg);
                }
                return Promise.resolve();
            }
        }
    };

    self.ubolOverlay = {
        secretAttr: secretAttr,
        file: null,
        port: null,
        frame: null,
        onmessage: null,
        keydownHandler: null,
        highlightedElements: [],

        start: function() {
            this.injectCSS();
            if ( this.keydownHandler === null ) {
                this.keydownHandler = this.onKeyPressed.bind(this);
            }
            document.addEventListener('keydown', this.keydownHandler, true);
        },

        injectCSS: function() {
            var css = [
                '[data-ubol-overlay] {',
                'position:fixed!important;',
                'top:0!important;',
                'left:0!important;',
                'width:100%!important;',
                'height:100%!important;',
                'border:none!important;',
                'z-index:2147483647!important;',
                'background:transparent!important;',
                'pointer-events:auto!important;',
                '}',
                '[data-ubol-overlay-click] {',
                'pointer-events:none!important;',
                '}'
            ].join('');
            
            if ( document.head ) {
                var style = document.createElement('style');
                style.id = 'ubol-zapper-css';
                style.textContent = css;
                document.head.appendChild(style);
            }
        },

        removeCSS: function() {
            var style = document.getElementById('ubol-zapper-css');
            if ( style ) {
                style.remove();
            }
        },

        stop: function() {
            if ( this.keydownHandler !== null ) {
                document.removeEventListener('keydown', this.keydownHandler, true);
            }
            
            if ( this.frame ) {
                this.frame.onload = null;
                this.frame.remove();
                this.frame = null;
            }
            if ( this.port ) {
                this.port.close();
                this.port = null;
            }
            this.onmessage = null;
            this.removeCSS();
        },

        onKeyPressed: function(ev) {
            if ( ev.key !== 'Escape' && ev.which !== 27 ) { return; }
            ev.stopPropagation();
            ev.preventDefault();
            if ( this.onmessage ) {
                this.onmessage({ what: 'quitTool' });
            }
        },

        elementFromPoint: function(x, y) {
            if ( this.frame === null ) { return null; }

            var magicAttr = 'data-ubol-overlay-click';
            this.frame.setAttribute(magicAttr, '');

            var elem = document.elementFromPoint(x, y);

            this.frame.removeAttribute(magicAttr);

            if ( elem === document.body || elem === document.documentElement ) {
                elem = null;
            }

            return elem;
        },

        getElementRect: function(elem) {
            var rect = elem.getBoundingClientRect();
            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
        },

        highlightElements: function(elems) {
            if ( !elems ) { elems = []; }
            this.highlightedElements = Array.prototype.slice.call(elems).filter(function(a) {
                return a instanceof Element && a !== this.frame;
            }.bind(this));
            this.highlightUpdate();
        },

        highlightUpdate: function() {
            if ( this.port === null ) { return; }

            var ow = window.innerWidth;
            var oh = window.innerHeight;
            var islands = [];

            for ( var i = 0; i < this.highlightedElements.length; i++ ) {
                var elem = this.highlightedElements[i];
                var rect = this.getElementRect(elem);

                if ( rect.left > ow ) { continue; }
                if ( rect.top > oh ) { continue; }
                if ( rect.left + rect.width < 0 ) { continue; }
                if ( rect.top + rect.height < 0 ) { continue; }

                islands.push(
                    'M' + rect.left + ' ' + rect.top +
                    'h' + rect.width +
                    'v' + rect.height +
                    'h-' + rect.width + 'z'
                );
            }

            this.port.postMessage({
                what: 'svgPaths',
                ocean: 'M0 0h' + ow + 'v' + oh + 'h-' + ow + 'z',
                islands: islands.join('')
            });
        },

        install: function(file, onmessage) {
            var self = this;
            this.file = file;
            this.onmessage = onmessage;

            var frame = document.createElement('iframe');
            frame.setAttribute('data-ubol-overlay', '');
            frame.onload = function() {
                var iframeWindow = frame.contentWindow;
                if ( !iframeWindow ) { return; }

                var channel = new MessageChannel();
                self.port = channel.port1;

                self.port.onmessage = function(ev) {
                    var data = ev.data || {};
                    if ( self.onmessage ) {
                        self.onmessage(data);
                    }
                };

                iframeWindow.postMessage(
                    { what: 'startOverlay', url: document.baseURI },
                    '*',
                    [ channel.port2 ]
                );
                iframeWindow.focus();
            };
            // Set src to load zapper UI - use chrome.runtime.getURL in MV3
            if ( typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL ) {
                frame.src = chrome.runtime.getURL(file);
            } else {
                frame.src = file;
            }
            frame.style.cssText = [
                'position:fixed',
                'top:0',
                'left:0',
                'width:100%',
                'height:100%',
                'border:none',
                'z-index:2147483647',
                'background:transparent'
            ].join('!important;') + '!important;';

            this.frame = frame;
            document.documentElement.appendChild(frame);

            return true;
        }
    };

    self.ubolOverlay.start();

})();
