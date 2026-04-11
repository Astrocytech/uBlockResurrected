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
        url: new URL(document.baseURI),
        file: null,
        port: null,
        frame: null,
        onmessage: null,
        keydownHandler: null,
        highlightedElements: [],
        qsaError: undefined,
        lastX: undefined,
        lastY: undefined,
        messageId: 1,
        pendingMessages: new Map(),

        start: function() {
            this.injectCSS();
            if ( this.keydownHandler === null ) {
                this.keydownHandler = this.onKeyPressed.bind(this);
            }
            document.addEventListener('keydown', this.keydownHandler, true);
            window.addEventListener('scroll', this.onViewportChanged, { passive: true });
            window.addEventListener('resize', this.onViewportChanged, { passive: true });
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
            window.removeEventListener('scroll', this.onViewportChanged, { passive: true });
            window.removeEventListener('resize', this.onViewportChanged, { passive: true });
            
            if ( this.frame ) {
                this.frame.onload = null;
                this.frame.remove();
                this.frame = null;
            }
            if ( this.port ) {
                this.port.onmessage = null;
                this.port.onmessageerror = null;
                this.port.close();
                this.port = null;
            }
            this.pendingMessages.clear();
            this.onmessage = null;
            this.removeCSS();
        },

        onViewportChanged: function() {
            if ( self.ubolOverlay ) {
                self.ubolOverlay.highlightUpdate();
            }
        },

        onKeyPressed: function(ev) {
            if ( ev.key !== 'Escape' && ev.which !== 27 ) { return; }
            ev.stopPropagation();
            ev.preventDefault();
            if ( self.ubolOverlay && self.ubolOverlay.onmessage ) {
                self.ubolOverlay.onmessage({ what: 'quitTool' });
            }
        },

        sendMessage: function(msg) {
            return webext.runtime.sendMessage(msg);
        },

        postMessage: function(msg) {
            if ( this.port === null ) { return Promise.resolve(); }
            var wrapped = {
                fromScriptId: this.messageId++,
                msg: msg
            };
            var selfRef = this;
            return new Promise(function(resolve) {
                selfRef.pendingMessages.set(wrapped.fromScriptId, resolve);
                selfRef.port.postMessage(wrapped);
            });
        },

        onMessage: function(wrapped) {
            if ( typeof wrapped?.fromScriptId === 'number' ) {
                var resolve = this.pendingMessages.get(wrapped.fromScriptId);
                if ( resolve ) {
                    this.pendingMessages.delete(wrapped.fromScriptId);
                    resolve(wrapped.msg);
                }
                return;
            }

            var msg = wrapped.msg || wrapped;
            var response;

            switch ( msg.what ) {
            case 'startTool':
                this.start();
                break;
            case 'quitTool':
                this.stop();
                break;
            case 'highlightElementAtPoint':
                this.highlightElementAtPoint(msg.mx, msg.my);
                break;
            case 'highlightFromSelector':
                var details = this.elementsFromSelector(msg.selector);
                this.highlightElements(details.elems);
                if ( msg.scrollTo && details.elems.length !== 0 ) {
                    details.elems[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }
                response = {
                    count: details.elems.length,
                    error: details.error || null
                };
                break;
            case 'unhighlight':
                this.unhighlight();
                break;
            default:
                break;
            }

            if ( this.onmessage ) {
                response = this.onmessage(msg) || response;
            }

            if ( wrapped?.fromFrameId && this.port ) {
                var fromFrameId = wrapped.fromFrameId;
                if ( response instanceof Promise ) {
                    response.then(function(resolved) {
                        if ( self.ubolOverlay === null || self.ubolOverlay?.port === null ) { return; }
                        self.ubolOverlay.port.postMessage({ fromFrameId: fromFrameId, msg: resolved });
                    });
                } else {
                    this.port.postMessage({ fromFrameId: fromFrameId, msg: response });
                }
            }
        },

        elementFromPoint: function(x, y) {
            if ( this.frame === null ) { return null; }
            if ( x !== undefined ) {
                this.lastX = x;
                this.lastY = y;
            } else if ( this.lastX !== undefined ) {
                x = this.lastX;
                y = this.lastY;
            } else {
                return null;
            }

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
            if ( rect.width !== 0 && rect.height !== 0 ) {
                return rect;
            }
            if ( elem.shadowRoot instanceof DocumentFragment ) {
                return this.getElementRect(elem.shadowRoot);
            }
            var left = rect.left;
            var right = left + rect.width;
            var top = rect.top;
            var bottom = top + rect.height;
            var children = elem.children || [];
            for ( var i = 0; i < children.length; i++ ) {
                var childRect = this.getElementRect(children[i]);
                if ( childRect.width === 0 || childRect.height === 0 ) { continue; }
                if ( childRect.left < left ) { left = childRect.left; }
                if ( childRect.right > right ) { right = childRect.right; }
                if ( childRect.top < top ) { top = childRect.top; }
                if ( childRect.bottom > bottom ) { bottom = childRect.bottom; }
            }
            return {
                left: left,
                right: right,
                top: top,
                bottom: bottom,
                width: right - left,
                height: bottom - top
            };
        },

        qsa: function(node, selector) {
            if ( node === null ) { return []; }
            if ( selector.startsWith('{') ) { return []; }
            selector = selector.replace(/::[^:]+$/, '');
            try {
                var elems = node.querySelectorAll(selector);
                this.qsaError = undefined;
                return Array.from(elems);
            } catch (reason) {
                this.qsaError = String(reason);
            }
            return [];
        },

        elementsFromSelector: function(selector) {
            return {
                elems: this.qsa(document, selector),
                error: this.qsaError
            };
        },

        highlightElementAtPoint: function(x, y) {
            var elem = this.elementFromPoint(x, y);
            this.highlightElements([ elem ]);
        },

        unhighlight: function() {
            this.highlightElements([]);
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
                    self.onMessage(data);
                };

                self.port.onmessageerror = function() {
                    self.onMessage({ what: 'quitTool' });
                };

                iframeWindow.postMessage(
                    {
                        what: 'startOverlay',
                        url: document.baseURI,
                        width: window.innerWidth,
                        height: window.innerHeight
                    },
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
