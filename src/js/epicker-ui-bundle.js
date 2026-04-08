/*******************************************************************************

    uBlock Origin - Element Picker UI Bundle
    https://github.com/gorhill/uBlock

    This is the bundled UI script for the element picker/zapper.
    It handles:
    - Element selection and highlighting
    - Filter preview and creation
    - Communication with content script via vAPI

*******************************************************************************/

(function() {
    'use strict';

    if (typeof vAPI === 'undefined') {
        console.error('epicker-ui-bundle.js: vAPI not loaded');
        return;
    }

    var epickerUI = {
        _doc: document,
        _body: null,
        _aside: null,
        _svg: null,
        _sea: null,
        _paused: false,
        _zapMode: false,
        _minimized: false,
        _sessionId: null,
        _targetElement: null,
        _currentSelector: null,
        _currentFilter: null,
        _highlightTimer: null,
        _codeMirror: null,
        _listeners: {},

        _init: function() {
            this._body = this._doc.body;
            this._aside = this._doc.querySelector('aside');
            this._svg = this._doc.querySelector('svg#sea');
            this._sea = this._svg;

            this._setupEventListeners();
            this._setupKeyboardShortcuts();
            this._createCodeMirror();
            this._sendReady();
        },

        _setupEventListeners: function() {
            var self = this;

            this._on('#pick', 'click', function() {
                self._togglePickMode();
            });

            this._on('#preview', 'click', function() {
                self._togglePreview();
            });

            this._on('#create', 'click', function() {
                self._createFilter();
            });

            this._on('#quit', 'click', function() {
                self._quit();
            });

            this._on('#minimize', 'click', function() {
                self._toggleMinimize();
            });

            this._on('#windowbar #move', 'mousedown', function(e) {
                self._startMove(e);
            });

            this._sea.addEventListener('click', function(e) {
                self._onSeaClick(e);
            });

            this._sea.addEventListener('mousemove', function(e) {
                self._onSeaMouseMove(e);
            });

            this._setupResultsetModifiers();
        },

        _on: function(selector, event, handler) {
            var el = this._doc.querySelector(selector);
            if (el) {
                el.addEventListener(event, handler);
                if (!this._listeners[selector]) {
                    this._listeners[selector] = [];
                }
                this._listeners[selector].push({ event: event, handler: handler });
            }
        },

        _setupKeyboardShortcuts: function() {
            var self = this;
            
            this._doc.addEventListener('keydown', function(e) {
                switch (e.key) {
                    case 'Escape':
                        self._quit();
                        break;
                    case 'p':
                        if (!e.ctrlKey && !e.metaKey) {
                            self._togglePickMode();
                        }
                        break;
                    case 'n':
                        if (!e.ctrlKey && !e.metaKey) {
                            self._togglePreview();
                        }
                        break;
                    case 'Enter':
                        if (e.ctrlKey || e.metaKey) {
                            self._createFilter();
                        }
                        break;
                }
            });
        },

        _setupResultsetModifiers: function() {
            var self = this;
            var modifiers = this._doc.querySelectorAll('.resultsetModifier');

            modifiers.forEach(function(modifier) {
                var input = modifier.querySelector('input[type="range"]');
                if (input) {
                    input.addEventListener('input', function() {
                        self._updateModifiers();
                    });
                }
            });
        },

        _updateModifiers: function() {
            var depthInput = this._doc.querySelector('#resultsetDepth input');
            var specificityInput = this._doc.querySelector('#resultsetSpecificity input');

            var depth = depthInput ? parseInt(depthInput.value, 10) : 7;
            var specificity = specificityInput ? parseInt(specificityInput.value, 10) : 6;

            this._sendToContent({
                action: 'updateModifiers',
                depth: depth,
                specificity: specificity
            });
        },

        _createCodeMirror: function() {
            var container = this._doc.querySelector('.codeMirrorContainer');
            if (!container || typeof CodeMirror === 'undefined') {
                this._createSimpleEditor(container);
                return;
            }

            try {
                this._codeMirror = CodeMirror(container, {
                    value: '',
                    mode: 'text',
                    lineNumbers: false,
                    lineWrapping: true,
                    readOnly: true,
                    tabSize: 4,
                    theme: 'default'
                });
            } catch (e) {
                this._createSimpleEditor(container);
            }
        },

        _createSimpleEditor: function(container) {
            var textarea = this._doc.createElement('textarea');
            textarea.style.width = '100%';
            textarea.style.height = '100%';
            textarea.style.border = 'none';
            textarea.style.resize = 'none';
            textarea.style.fontFamily = 'monospace';
            textarea.style.fontSize = '12px';
            textarea.readOnly = true;
            container.appendChild(textarea);
            this._textareaEditor = textarea;
        },

        _setFilter: function(filter) {
            this._currentFilter = filter;
            
            if (this._codeMirror) {
                this._codeMirror.setValue(filter || '');
            } else if (this._textareaEditor) {
                this._textareaEditor.value = filter || '';
            }

            this._updateResultsetCount();
        },

        _updateResultsetCount: function() {
            var count = this._doc.querySelector('#resultsetCount');
            if (count) {
                var filter = this._currentFilter;
                count.textContent = filter ? '1' : '0';
            }
        },

        _togglePickMode: function() {
            var pickBtn = this._doc.querySelector('#pick');
            if (!pickBtn) return;

            var isPicking = pickBtn.classList.contains('active');
            
            if (isPicking) {
                pickBtn.classList.remove('active');
                this._sendToContent({ action: 'stopPickMode' });
            } else {
                pickBtn.classList.add('active');
                this._sendToContent({ action: 'startPickMode' });
            }
        },

        _togglePreview: function() {
            var previewBtn = this._doc.querySelector('#preview');
            var createBtn = this._doc.querySelector('#create');
            if (!previewBtn) return;

            var isPreview = previewBtn.classList.contains('active');
            
            if (isPreview) {
                previewBtn.classList.remove('active');
                this._body.classList.remove('preview');
                this._sendToContent({ action: 'hidePreview' });
                if (createBtn) createBtn.disabled = true;
            } else {
                previewBtn.classList.add('active');
                this._body.classList.add('preview');
                this._sendToContent({ action: 'showPreview' });
                if (createBtn && this._currentFilter) createBtn.disabled = false;
            }
        },

        _createFilter: function() {
            if (!this._currentFilter) return;

            this._sendToContent({
                action: 'createFilter',
                filter: this._currentFilter
            });

            this._quit();
        },

        _quit: function() {
            this._sendToContent({ action: 'quit' });
            window.close();
        },

        _toggleMinimize: function() {
            var isMinimized = this._body.classList.contains('minimized');
            
            if (isMinimized) {
                this._body.classList.remove('minimized');
            } else {
                this._body.classList.add('minimized');
            }
        },

        _startMove: function(e) {
            var self = this;
            var startX = e.clientX;
            var startY = e.clientY;
            var startRight = parseInt(this._aside.style.right, 10) || 2;
            var startBottom = parseInt(this._aside.style.bottom, 10) || 2;

            this._body.classList.add('moving');

            var onMove = function(e) {
                var dx = startX - e.clientX;
                var dy = startY - e.clientY;
                self._aside.style.right = (startRight + dx) + 'px';
                self._aside.style.bottom = (startBottom + dy) + 'px';
            };

            var onUp = function() {
                self._body.classList.remove('moving');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },

        _onSeaClick: function(e) {
            if (this._paused) return;

            if (e.target === this._sea || e.target.tagName === 'path') {
                this._togglePickMode();
            }
        },

        _onSeaMouseMove: function(e) {
            if (this._paused) return;
        },

        _sendToContent: function(message) {
            if (vAPI.contentScript && vAPI.contentScript.send) {
                vAPI.contentScript.send('pickerMessage', message);
            }
        },

        _sendReady: function() {
            if (vAPI.contentScript && vAPI.contentScript.send) {
                vAPI.contentScript.send('pickerReady', {
                    zapMode: this._zapMode
                });
            }
        },

        setSessionId: function(sessionId) {
            this._sessionId = sessionId;
        },

        setZapMode: function(zap) {
            this._zapMode = zap;
            if (zap) {
                this._body.classList.add('zap');
            } else {
                this._body.classList.remove('zap');
            }
        },

        pause: function() {
            this._paused = true;
            this._body.classList.add('paused');
        },

        resume: function() {
            this._paused = false;
            this._body.classList.remove('paused');
        },

        highlight: function(rect) {
            var path = this._sea.querySelector('path:last-child');
            if (!path || !rect) return;

            var w = window.innerWidth;
            var h = window.innerHeight;

            var d = 'M 0,0 L ' + w + ',0 L ' + w + ',' + h + ' L 0,' + h + ' Z ';

            if (rect) {
                var x = rect.x || 0;
                var y = rect.y || 0;
                var r = rect.right || (x + rect.width);
                var b = rect.bottom || (y + rect.height);

                d += ' M ' + x + ',' + y + 
                     ' L ' + r + ',' + y + 
                     ' L ' + r + ',' + b + 
                     ' L ' + x + ',' + b + ' Z';
            }

            path.setAttribute('d', d);
        },

        setCandidates: function(candidates) {
            var netList = this._doc.querySelector('#netFilters ul');
            var cosmeticList = this._doc.querySelector('#cosmeticFilters ul');

            if (netList) netList.innerHTML = '';
            if (cosmeticList) cosmeticList.innerHTML = '';

            if (!candidates || candidates.length === 0) return;

            var self = this;
            var netFilters = [];
            var cosmeticFilters = [];

            candidates.forEach(function(c) {
                if (c.type === 'network') {
                    netFilters.push(c);
                } else {
                    cosmeticFilters.push(c);
                }
            });

            netFilters.forEach(function(f) {
                self._addCandidateToList(netList, f);
            });

            cosmeticFilters.forEach(function(f) {
                self._addCandidateToList(cosmeticList, f);
            });
        },

        _addCandidateToList: function(list, candidate) {
            if (!list) return;

            var li = this._doc.createElement('li');
            li.className = 'changeFilter';
            li.textContent = candidate.filter || '';
            li.dataset.filter = candidate.filter || '';
            li.dataset.type = candidate.type || 'cosmetic';

            var self = this;
            li.addEventListener('click', function() {
                self._selectCandidate(candidate);
            });

            list.appendChild(li);
        },

        _selectCandidate: function(candidate) {
            var items = this._doc.querySelectorAll('#candidateFilters .changeFilter');
            items.forEach(function(item) {
                item.classList.remove('active');
            });

            if (candidate && candidate.filter) {
                var matchingItem = this._doc.querySelector(
                    '#candidateFilters .changeFilter[data-filter="' + candidate.filter + '"]'
                );
                if (matchingItem) {
                    matchingItem.classList.add('active');
                }

                this._setFilter(candidate.filter);
                this._highlightCandidate(candidate);
            }
        },

        _highlightCandidate: function(candidate) {
            if (candidate && candidate.selector) {
                this._sendToContent({
                    action: 'highlightSelector',
                    selector: candidate.selector
                });
            }
        }
    };

    vAPI.epickerUI = epickerUI;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            epickerUI._init();
        });
    } else {
        epickerUI._init();
    }

})();
