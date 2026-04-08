/*******************************************************************************

    uBlock Resurrected - Tool Overlay UI
    Handles UI events and message passing for the zapper iframe

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
        messageId: 1,
        mstrackerX: 0,
        mstrackerY: 0,
        mstrackerTimer: null,

        start: function(onmessage) {
            this.onmessage = onmessage;

            window.addEventListener('message', function(ev) {
                var msg = ev.data || {};
                if ( msg.what === 'startOverlay' ) {
                    this.port = ev.ports[0];
                    if ( this.port ) {
                        var self = this;
                        this.port.onmessage = function(ev) {
                            var data = ev.data || {};
                            self.onMessage(data);
                        };
                    }
                    this.onMessage({ what: 'startTool' });
                }
            }.bind(this));
        },

        postMessage: function(msg) {
            if ( this.port === null ) { return Promise.resolve(); }
            this.port.postMessage(msg);
            return Promise.resolve();
        },

        onMessage: function(msg) {
            if ( !msg ) { return; }

            switch ( msg.what ) {
            case 'svgPaths':
                this.updateSVGPaths(msg.ocean, msg.islands);
                break;
            case 'showTooltip':
                this.showTooltip(msg.text, msg.x, msg.y);
                break;
            case 'hideTooltip':
                this.hideTooltip();
                break;
            case 'updateCount':
                this.updateCount(msg.count);
                break;
            case 'stopTool':
                if ( this.onmessage ) {
                    this.onmessage({ what: 'stopTool' });
                }
                break;
            }
        },

        updateSVGPaths: function(ocean, islands) {
            if ( this.svgOcean ) {
                this.svgOcean.setAttribute('d', ocean + islands);
            }
            if ( this.svgIslands ) {
                this.svgIslands.setAttribute('d', islands);
            }
        },

        showTooltip: function(text, x, y) {
            var tooltip = document.getElementById('tooltip');
            if ( tooltip ) {
                tooltip.textContent = text || '';
                tooltip.style.left = x + 'px';
                tooltip.style.top = (y + 20) + 'px';
                tooltip.style.display = 'block';
            }
        },

        hideTooltip: function() {
            var tooltip = document.getElementById('tooltip');
            if ( tooltip ) {
                tooltip.style.display = 'none';
            }
        },

        updateCount: function(count) {
            var counter = document.getElementById('removeCount');
            if ( counter ) {
                counter.textContent = String(count || 0);
            }
        },

        highlightElementUnderMouse: function(state) {
            if ( state ) {
                document.addEventListener('mousemove', this.onHover.bind(this), { passive: true });
            } else {
                document.removeEventListener('mousemove', this.onHover.bind(this), { passive: true });
            }
        },

        onHover: function(ev) {
            this.mstrackerX = ev.clientX;
            this.mstrackerY = ev.clientY;

            if ( this.mstrackerTimer !== null ) { return; }

            var self = this;
            this.mstrackerTimer = requestAnimationFrame(function() {
                self.mstrackerTimer = null;
                self.onTimer();
            });
        },

        onTimer: function() {
            if ( this.port === null ) { return; }

            this.port.postMessage({
                what: 'highlightElementAtPoint',
                mx: this.mstrackerX,
                my: this.mstrackerY
            });
        },

        stop: function() {
            this.highlightElementUnderMouse(false);

            if ( this.port ) {
                this.port.postMessage({ what: 'quitTool' });
                this.port = null;
            }

            this.onmessage = null;
        }
    };

    // Initialize SVG references
    var svg = document.getElementById('overlay');
    if ( svg ) {
        toolOverlay.svgRoot = svg;
        var paths = svg.querySelectorAll('path');
        toolOverlay.svgOcean = paths[0];
        toolOverlay.svgIslands = paths[1];
    }

    // Export for use by zapper-ui.js
    window.toolOverlay = toolOverlay;

})();
