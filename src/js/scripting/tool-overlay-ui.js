/*******************************************************************************

    uBlock Resurrected - Tool Overlay UI
    Shared communication bridge for iframe context

    This script runs in the iframe context (isolated from page)

*******************************************************************************/

(function() {
    'use strict';

    var toolOverlay = {
        svgRoot: null,
        svgOcean: null,
        svgIslands: null,
        port: null,
        onmessage: null,
        mstrackerOn: false,
        mstrackerX: 0,
        mstrackerY: 0,
        mstrackerTimer: null,
        messageId: 1,
        pendingMessages: new Map(),

        start: function(onmessage) {
            this.onmessage = onmessage;

            window.addEventListener('message', function(ev) {
                var msg = ev.data || {};
                if (msg.what !== 'startOverlay') { return; }
                if (Array.isArray(ev.ports) === false) { return; }
                if (ev.ports.length === 0) { return; }

                this.port = ev.ports[0];
                this.port.onmessage = function(ev) {
                    var data = ev.data || {};
                    this.onMessage(data);
                }.bind(this);

                this.port.onmessageerror = function() {
                    if (this.onmessage) {
                        this.onmessage({ what: 'stopTool' });
                    }
                }.bind(this);

                this.svgRoot = document.getElementById('overlay');
                if (this.svgRoot) {
                    var paths = this.svgRoot.querySelectorAll('path');
                    this.svgOcean = paths[0];
                    this.svgIslands = paths[1];
                }

                this.onMessage({
                    what: 'startTool',
                    url: msg.url,
                    width: msg.width,
                    height: msg.height
                });

                document.body.classList.remove('loading');
            }.bind(this), { once: true });
        },

        onMessage: function(wrapped) {
            if (typeof wrapped.fromFrameId === 'number') {
                var resolve = this.pendingMessages.get(wrapped.fromFrameId);
                if (resolve) {
                    this.pendingMessages.delete(wrapped.fromFrameId);
                    resolve(wrapped.msg);
                }
                return;
            }

            var msg = wrapped.msg || wrapped;
            var response;

            switch (msg.what) {
            case 'startTool':
                this.svgOcean.setAttribute('d', 'M0 0h' + msg.width + 'v' + msg.height + 'h-' + msg.width + 'z');
                break;
            case 'svgPaths':
                this.svgOcean.setAttribute('d', msg.ocean + msg.islands);
                this.svgIslands.setAttribute('d', msg.islands || 'M0 0');
                break;
            }

            if (this.onmessage) {
                response = this.onmessage(msg);
            }

            if (wrapped.fromScriptId && this.port) {
                var fromScriptId = wrapped.fromScriptId;
                var self = this;
                if (response instanceof Promise) {
                    response.then(function(response) {
                        if (self.port === null) { return; }
                        self.port.postMessage({ fromScriptId: fromScriptId, msg: response });
                    });
                } else {
                    this.port.postMessage({ fromScriptId: fromScriptId, msg: response });
                }
            }
        },

        stop: function() {
            this.highlightElementUnderMouse(false);
            if (this.port) {
                this.port.postMessage({ what: 'quitTool' });
                this.port.onmessage = null;
                this.port.onmessageerror = null;
                this.port = null;
            }
        },

        postMessage: function(msg) {
            if (this.port === null) { return; }
            var wrapped = {
                fromFrameId: this.messageId++,
                msg: msg
            };
            var self = this;
            return new Promise(function(resolve) {
                self.pendingMessages.set(wrapped.fromFrameId, resolve);
                self.port.postMessage(wrapped);
            });
        },

        highlightElementUnderMouse: function(state) {
            if (state === this.mstrackerOn) { return; }
            this.mstrackerOn = state;
            if (this.mstrackerOn) {
                document.addEventListener('mousemove', this.onHover, { passive: true });
                return;
            }
            document.removeEventListener('mousemove', this.onHover, { passive: true });
            if (this.mstrackerTimer !== null) {
                cancelAnimationFrame(this.mstrackerTimer);
                this.mstrackerTimer = null;
            }
        },

        onTimer: function() {
            toolOverlay.mstrackerTimer = null;
            if (toolOverlay.port === null) { return; }
            toolOverlay.port.postMessage({
                what: 'highlightElementAtPoint',
                mx: toolOverlay.mstrackerX,
                my: toolOverlay.mstrackerY
            });
        },

        onHover: function(ev) {
            toolOverlay.mstrackerX = ev.clientX;
            toolOverlay.mstrackerY = ev.clientY;
            if (toolOverlay.mstrackerTimer !== null) { return; }
            toolOverlay.mstrackerTimer = requestAnimationFrame(toolOverlay.onTimer);
        }
    };

    self.toolOverlay = toolOverlay;

})();
