/*******************************************************************************

    uBlock Origin - Element Picker UI
    https://github.com/gorhill/uBlock

    TypeScript source for element picker UI functionality.

*******************************************************************************/

declare const vAPI: any;
declare const CodeMirror: any;

interface EPickerUI {
    _init(): void;
    _setupEventListeners(): void;
    _createCodeMirror(): void;
    _setFilter(filter: string): void;
    _togglePickMode(): void;
    _togglePreview(): void;
    _createFilter(): void;
    _quit(): void;
    setZapMode(zap: boolean): void;
    pause(): void;
    resume(): void;
    highlight(rect: DOMRect): void;
    setCandidates(candidates: any[]): void;
}

const epickerUI: EPickerUI = (() => {
    const self: any = {
        _paused: false,
        _zapMode: false,
        _sessionId: null,
        _currentSelector: null,
        _currentFilter: null,
        _codeMirror: null,
    };

    self._init = function() {
        const doc = document;
        self._body = doc.body;
        self._aside = doc.querySelector('aside');
        self._svg = doc.querySelector('svg#sea');

        self._setupEventListeners();
        self._createCodeMirror();
        self._sendReady();
    };

    self._setupEventListeners = function() {
        const doc = document;

        const pickBtn = doc.querySelector('#pick');
        if (pickBtn) {
            pickBtn.addEventListener('click', () => self._togglePickMode());
        }

        const previewBtn = doc.querySelector('#preview');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => self._togglePreview());
        }

        const createBtn = doc.querySelector('#create');
        if (createBtn) {
            createBtn.addEventListener('click', () => self._createFilter());
        }

        const quitBtn = doc.querySelector('#quit');
        if (quitBtn) {
            quitBtn.addEventListener('click', () => self._quit());
        }

        const minimizeBtn = doc.querySelector('#minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => self._toggleMinimize());
        }

        const sea = self._svg;
        if (sea) {
            sea.addEventListener('click', (e: MouseEvent) => self._onSeaClick(e));
            sea.addEventListener('mousemove', (e: MouseEvent) => self._onSeaMouseMove(e));
        }

        document.addEventListener('keydown', (e: KeyboardEvent) => self._onKeyDown(e));
    };

    self._onKeyDown = function(e: KeyboardEvent) {
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
    };

    self._createCodeMirror = function() {
        const container = document.querySelector('.codeMirrorContainer');
        if (!container) return;

        if (typeof CodeMirror !== 'undefined') {
            try {
                self._codeMirror = CodeMirror(container, {
                    value: '',
                    mode: 'text',
                    lineNumbers: false,
                    lineWrapping: true,
                    readOnly: true,
                    tabSize: 4,
                });
            } catch (e) {
                self._createSimpleEditor(container);
            }
        } else {
            self._createSimpleEditor(container);
        }
    };

    self._createSimpleEditor = function(container: Element) {
        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.style.border = 'none';
        textarea.style.resize = 'none';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        (textarea as HTMLTextAreaElement).readOnly = true;
        container.appendChild(textarea);
        self._textareaEditor = textarea;
    };

    self._setFilter = function(filter: string) {
        self._currentFilter = filter;

        if (self._codeMirror) {
            self._codeMirror.setValue(filter || '');
        } else if (self._textareaEditor) {
            (self._textareaEditor as HTMLTextAreaElement).value = filter || '';
        }

        self._updateResultsetCount();
    };

    self._updateResultsetCount = function() {
        const count = document.querySelector('#resultsetCount');
        if (count) {
            count.textContent = self._currentFilter ? '1' : '0';
        }
    };

    self._togglePickMode = function() {
        const pickBtn = document.querySelector('#pick');
        if (!pickBtn) return;

        const isPicking = pickBtn.classList.contains('active');

        if (isPicking) {
            pickBtn.classList.remove('active');
            self._sendToContent({ action: 'stopPickMode' });
        } else {
            pickBtn.classList.add('active');
            self._sendToContent({ action: 'startPickMode' });
        }
    };

    self._togglePreview = function() {
        const previewBtn = document.querySelector('#preview');
        const createBtn = document.querySelector('#create');
        if (!previewBtn) return;

        const isPreview = previewBtn.classList.contains('active');

        if (isPreview) {
            previewBtn.classList.remove('active');
            self._body.classList.remove('preview');
            self._sendToContent({ action: 'hidePreview' });
            if (createBtn) (createBtn as HTMLButtonElement).disabled = true;
        } else {
            previewBtn.classList.add('active');
            self._body.classList.add('preview');
            self._sendToContent({ action: 'showPreview' });
            if (createBtn && self._currentFilter) (createBtn as HTMLButtonElement).disabled = false;
        }
    };

    self._createFilter = function() {
        if (!self._currentFilter) return;

        self._sendToContent({
            action: 'createFilter',
            filter: self._currentFilter,
        });

        self._quit();
    };

    self._quit = function() {
        self._sendToContent({ action: 'quit' });
        window.close();
    };

    self._toggleMinimize = function() {
        const isMinimized = self._body.classList.contains('minimized');

        if (isMinimized) {
            self._body.classList.remove('minimized');
        } else {
            self._body.classList.add('minimized');
        }
    };

    self._onSeaClick = function(e: MouseEvent) {
        if (self._paused) return;

        if (e.target === self._svg || (e.target as Element).tagName === 'path') {
            self._togglePickMode();
        }
    };

    self._onSeaMouseMove = function(e: MouseEvent) {
        if (self._paused) return;
    };

    self._sendToContent = function(message: any) {
        if (vAPI?.contentScript?.send) {
            vAPI.contentScript.send('pickerMessage', message);
        }
    };

    self._sendReady = function() {
        if (vAPI?.contentScript?.send) {
            vAPI.contentScript.send('pickerReady', {
                zapMode: self._zapMode,
            });
        }
    };

    self.setZapMode = function(zap: boolean) {
        self._zapMode = zap;
        if (zap) {
            self._body.classList.add('zap');
        } else {
            self._body.classList.remove('zap');
        }
    };

    self.pause = function() {
        self._paused = true;
        self._body.classList.add('paused');
    };

    self.resume = function() {
        self._paused = false;
        self._body.classList.remove('paused');
    };

    self.highlight = function(rect: DOMRect) {
        const path = self._svg?.querySelector('path:last-child');
        if (!path || !rect) return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        let d = `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z `;

        const x = rect.x || 0;
        const y = rect.y || 0;
        const r = rect.right || (x + rect.width);
        const b = rect.bottom || (y + rect.height);

        d += `M ${x},${y} L ${r},${y} L ${r},${b} L ${x},${b} Z`;

        path.setAttribute('d', d);
    };

    self.setCandidates = function(candidates: any[]) {
        const netList = document.querySelector('#netFilters ul');
        const cosmeticList = document.querySelector('#cosmeticFilters ul');

        if (netList) netList.innerHTML = '';
        if (cosmeticList) cosmeticList.innerHTML = '';

        if (!candidates?.length) return;

        const netFilters = candidates.filter(c => c.type === 'network');
        const cosmeticFilters = candidates.filter(c => c.type !== 'network');

        netFilters.forEach(f => self._addCandidateToList(netList, f));
        cosmeticFilters.forEach(f => self._addCandidateToList(cosmeticList, f));
    };

    self._addCandidateToList = function(list: Element | null, candidate: any) {
        if (!list) return;

        const li = document.createElement('li');
        li.className = 'changeFilter';
        li.textContent = candidate.filter || '';
        li.setAttribute('data-filter', candidate.filter || '');
        li.setAttribute('data-type', candidate.type || 'cosmetic');

        li.addEventListener('click', () => {
            self._selectCandidate(candidate);
        });

        list.appendChild(li);
    };

    self._selectCandidate = function(candidate: any) {
        const items = document.querySelectorAll('#candidateFilters .changeFilter');
        items.forEach(item => item.classList.remove('active'));

        if (candidate?.filter) {
            const matchingItem = document.querySelector(
                `#candidateFilters .changeFilter[data-filter="${candidate.filter}"]`
            );
            if (matchingItem) {
                matchingItem.classList.add('active');
            }

            self._setFilter(candidate.filter);
            self._highlightCandidate(candidate);
        }
    };

    self._highlightCandidate = function(candidate: any) {
        if (candidate?.selector) {
            self._sendToContent({
                action: 'highlightSelector',
                selector: candidate.selector,
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => self._init());
    } else {
        self._init();
    }

    return self;
})();

if (typeof vAPI !== 'undefined') {
    vAPI.epickerUI = epickerUI;
}

export { epickerUI };
