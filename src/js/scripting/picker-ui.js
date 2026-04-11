/*******************************************************************************

    uBlock Resurrected - Picker UI Entry Point
    Handles picker-specific UI events for the simple overlay picker

*******************************************************************************/

(function() {
    'use strict';

    var toolOverlay = self.toolOverlay;
    if ( !toolOverlay ) { return; }

    var root = document.documentElement;
    var cosmeticFilterCandidates = [];
    var selectedDepth = 0;
    var selectedSpecificity = 0;
    var extensionStorage = self.browser && self.browser.storage && self.browser.storage.local
        ? self.browser.storage.local
        : self.chrome && self.chrome.storage && self.chrome.storage.local
            ? self.chrome.storage.local
            : null;
    var runtimeAPI = self.browser && self.browser.runtime
        ? self.browser.runtime
        : self.chrome && self.chrome.runtime
            ? self.chrome.runtime
            : null;

    var qs = function(selector) {
        return document.querySelector(selector);
    };

    var qsa = function(selector, context) {
        return Array.from((context || document).querySelectorAll(selector));
    };

    function localRead(key) {
        try {
            return Promise.resolve(self.localStorage.getItem(key));
        } catch {
        }
        return Promise.resolve(null);
    }

    function storageGet(keys) {
        if ( extensionStorage === null ) {
            return Promise.resolve({});
        }
        try {
            var result = extensionStorage.get(keys);
            if ( result instanceof Promise ) {
                return result;
            }
        } catch {
        }
        return new Promise(function(resolve) {
            extensionStorage.get(keys, function(items) {
                resolve(items || {});
            });
        });
    }

    function storageSet(items) {
        if ( extensionStorage === null ) {
            return Promise.resolve();
        }
        try {
            var result = extensionStorage.set(items);
            if ( result instanceof Promise ) {
                return result;
            }
        } catch {
        }
        return new Promise(function(resolve) {
            extensionStorage.set(items, function() {
                resolve();
            });
        });
    }

    function runtimeSendMessage(message) {
        if ( runtimeAPI === null || typeof runtimeAPI.sendMessage !== 'function' ) {
            return Promise.resolve();
        }
        try {
            var result = runtimeAPI.sendMessage(message);
            return Promise.resolve(result).catch(function() {
            });
        } catch {
        }
        return Promise.resolve();
    }

    function overlayPostMessage(message) {
        try {
            return Promise.resolve(toolOverlay.postMessage(message)).catch(function() {
            });
        } catch {
        }
        return Promise.resolve();
    }

    function appendFilterToMyFilters(filter) {
        return storageGet([ 'user-filters', 'selectedFilterLists' ]).then(function(bin) {
            var existing = typeof bin['user-filters'] === 'string'
                ? bin['user-filters'].trim()
                : '';
            var lines = existing === ''
                ? []
                : existing.split(/\n+/).map(function(line) { return line.trim(); }).filter(Boolean);
            if ( lines.indexOf(filter) === -1 ) {
                lines.push(filter);
            }
            var selected = Array.isArray(bin.selectedFilterLists)
                ? bin.selectedFilterLists.slice()
                : [];
            if ( selected.indexOf('user-filters') === -1 ) {
                selected.push('user-filters');
            }
            return storageSet({
                'user-filters': lines.join('\n'),
                selectedFilterLists: selected,
            });
        }).then(function() {
            void runtimeSendMessage({
                what: 'applyFilterListSelection',
                toSelect: [ 'user-filters' ],
                merge: true,
            });
            void runtimeSendMessage({
                what: 'reloadAllFilters',
            });
        });
    }

    function initFrameTheme() {
        if ( self.matchMedia instanceof Function ) {
            root.classList.toggle(
                'dark',
                self.matchMedia('(prefers-color-scheme: dark)').matches
            );
            root.classList.toggle(
                'light',
                self.matchMedia('(prefers-color-scheme: dark)').matches === false
            );
            root.classList.toggle(
                'hidpi',
                self.matchMedia('(min-resolution: 150dpi)').matches
            );
        } else {
            root.classList.add('light');
        }

        root.classList.toggle('mobile', 'ontouchstart' in self);
        root.classList.toggle('desktop', root.classList.contains('mobile') === false);
    }

    function renderRange(id, value, invert) {
        var input = qs('#' + id + ' input');
        if ( !input ) { return; }
        var max = parseInt(input.max || '0', 10);
        if ( typeof value !== 'number' ) {
            value = parseInt(input.value || '0', 10);
        }
        if ( invert ) {
            value = max - value;
        }
        input.value = String(value);
        var slider = qs('#' + id + ' > span');
        if ( !slider ) { return; }
        var lside = slider.children[0];
        var thumb = slider.children[1];
        var sliderWidth = slider.offsetWidth || 1;
        var maxPercent = (sliderWidth - thumb.offsetWidth) / sliderWidth * 100;
        var widthPercent = max === 0 ? 0 : value / max * maxPercent;
        lside.style.width = widthPercent + '%';
    }

    function currentFilterGroup() {
        return cosmeticFilterCandidates[selectedDepth] || null;
    }

    function currentFilter() {
        var group = currentFilterGroup();
        if ( !group ) { return ''; }
        return group.filters[selectedSpecificity] || '';
    }

    function filterToSelector(filter) {
        if ( filter.startsWith('##') ) {
            return filter.slice(2);
        }
        return filter;
    }

    function updateElementCount(details) {
        var count = details && details.count || 0;
        var error = details && details.error || null;
        var span = qs('#resultsetCount');
        if ( error ) {
            span.textContent = 'Error';
            span.setAttribute('title', error);
        } else {
            span.textContent = String(count);
            span.removeAttribute('title');
        }
        qs('#create').disabled = error !== null || count === 0;
    }

    function setActiveCandidate() {
        var items = qsa('#cosmeticFilters .changeFilter li');
        for ( var i = 0; i < items.length; i++ ) {
            items[i].classList.toggle('active', i === selectedDepth);
        }
    }

    function applyCurrentSelection() {
        var filter = currentFilter();
        qs('#filterText').value = filter;
        setActiveCandidate();
        renderRange('resultsetDepth', selectedDepth, true);
        renderRange('resultsetSpecificity', selectedSpecificity);
        highlightCandidate();
    }

    function highlightCandidate() {
        var filter = currentFilter();
        var selector = filterToSelector(filter);
        if ( selector === '' ) {
            void overlayPostMessage({ what: 'unhighlight' });
            updateElementCount({ count: 0, error: null });
            return;
        }
        overlayPostMessage({
            what: 'highlightFromSelector',
            selector: selector,
        }).then(function(result) {
            updateElementCount(result);
        });
    }

    function populateCandidates() {
        var list = qs('#cosmeticFilters .changeFilter');
        list.innerHTML = '';
        for ( var i = 0; i < cosmeticFilterCandidates.length; i++ ) {
            var li = document.createElement('li');
            li.textContent = cosmeticFilterCandidates[i].label;
            li.dataset.depth = String(i);
            list.appendChild(li);
        }
    }

    function syncSpecificityRange() {
        var input = qs('#resultsetSpecificity input');
        var group = currentFilterGroup();
        var max = group ? Math.max(group.filters.length - 1, 0) : 0;
        input.max = String(max);
        if ( selectedSpecificity > max ) {
            selectedSpecificity = 0;
        }
        input.disabled = max === 0;
        renderRange('resultsetSpecificity', selectedSpecificity);
    }

    function showDialog(msg) {
        pausePicker();

        cosmeticFilterCandidates = Array.isArray(msg.cosmeticFilters)
            ? msg.cosmeticFilters
            : [];
        populateCandidates();

        var depthInput = qs('#resultsetDepth input');
        var depthMax = Math.max(cosmeticFilterCandidates.length - 1, 0);
        depthInput.max = String(depthMax);
        selectedDepth = Math.min(msg.filter && msg.filter.slot || 0, depthMax);
        depthInput.value = String(depthMax - selectedDepth);
        depthInput.disabled = depthMax === 0;

        selectedSpecificity = Math.max(msg.filter && msg.filter.specificity || 0, 0);
        syncSpecificityRange();
        applyCurrentSelection();
    }

    function onSvgTouch(ev) {
        if ( ev.type === 'touchstart' ) {
            onSvgTouch.x0 = ev.touches[0].screenX;
            onSvgTouch.y0 = ev.touches[0].screenY;
            onSvgTouch.t0 = ev.timeStamp;
            return;
        }
        if ( onSvgTouch.x0 === undefined ) { return; }

        var stopX = ev.changedTouches[0].screenX;
        var stopY = ev.changedTouches[0].screenY;
        var distance = Math.sqrt(
            Math.pow(stopX - onSvgTouch.x0, 2) +
            Math.pow(stopY - onSvgTouch.y0, 2)
        );
        var duration = ev.timeStamp - onSvgTouch.t0;
        if ( distance >= 32 || duration >= 200 ) { return; }

        onSvgClicked({
            type: 'touch',
            clientX: ev.changedTouches[0].pageX,
            clientY: ev.changedTouches[0].pageY,
        });
        ev.preventDefault();
    }

    onSvgTouch.x0 = 0;
    onSvgTouch.y0 = 0;
    onSvgTouch.t0 = 0;

    function onSvgClicked(ev) {
        if ( root.classList.contains('paused') ) {
            if ( root.classList.contains('preview') ) {
                updatePreview(false);
            }
            unpausePicker();
            return;
        }
        overlayPostMessage({
            what: 'candidatesAtPoint',
            mx: ev.clientX,
            my: ev.clientY,
            broad: ev.ctrlKey,
        }).then(function(details) {
            showDialog(details);
        });
    }

    function onKeyPressed(ev) {
        if ( ev.key === 'Escape' || ev.which === 27 ) {
            quitPicker();
        }
    }

    function onDepthChanged(ev) {
        var input = ev.target;
        var max = parseInt(input.max || '0', 10);
        selectedDepth = max - Math.round(input.valueAsNumber);
        selectedSpecificity = 0;
        syncSpecificityRange();
        applyCurrentSelection();
    }

    function onSpecificityChanged(ev) {
        selectedSpecificity = Math.round(ev.target.valueAsNumber);
        renderRange('resultsetSpecificity', selectedSpecificity);
        applyCurrentSelection();
    }

    function onCandidateClicked(ev) {
        var li = ev.target.closest('li');
        if ( li === null ) { return; }
        selectedDepth = parseInt(li.dataset.depth || '0', 10);
        selectedSpecificity = 0;
        syncSpecificityRange();
        applyCurrentSelection();
    }

    function onMinimizeClicked() {
        if ( root.classList.contains('paused') === false ) {
            pausePicker();
            highlightCandidate();
            return;
        }
        root.classList.toggle('minimized');
    }

    function onFilterTextChanged() {
        var filter = qs('#filterText').value.trim();
        var selector = filterToSelector(filter);
        if ( selector === '' ) {
            void overlayPostMessage({ what: 'unhighlight' });
            updateElementCount({ count: 0, error: null });
            return;
        }
        overlayPostMessage({
            what: 'highlightFromSelector',
            selector: selector,
        }).then(function(result) {
            updateElementCount(result);
        });
    }

    function onPreviewClicked() {
        root.classList.toggle('preview');
        updatePreview();
    }

    function onCreateClicked() {
        var filter = qs('#filterText').value.trim();
        if ( filter === '' ) { return; }
        updatePreview(false);
        Promise.allSettled([
            appendFilterToMyFilters(filter),
            overlayPostMessage({
                what: 'confirmSelection',
                filter: filter,
            }),
        ]).finally(function() {
            toolOverlay.stop();
        });
    }

    function updatePreview(state) {
        if ( state === undefined ) {
            state = root.classList.contains('preview');
        } else {
            root.classList.toggle('preview', state);
        }
        var selector = '';
        if ( state ) {
            selector = filterToSelector(qs('#filterText').value.trim());
        }
        return overlayPostMessage({ what: 'previewSelector', selector: selector });
    }

    function pausePicker() {
        root.classList.add('paused');
        root.classList.remove('minimized');
        toolOverlay.highlightElementUnderMouse(false);
    }

    function unpausePicker() {
        root.classList.remove('paused', 'preview');
        root.classList.add('minimized');
        updatePreview(false);
        toolOverlay.highlightElementUnderMouse(true);
    }

    function resetPicker() {
        void overlayPostMessage({ what: 'unhighlight' });
        unpausePicker();
    }

    function quitPicker() {
        updatePreview(false);
        toolOverlay.stop();
    }

    function startPicker() {
        initFrameTheme();
        document.body.classList.remove('loading');

        if ( typeof faIconsInit === 'function' ) {
            faIconsInit();
        }

        void overlayPostMessage({ what: 'startTool' });

        localRead('picker.view').then(function() {});

        self.addEventListener('keydown', onKeyPressed, true);
        qs('#overlay').addEventListener('click', onSvgClicked);
        qs('#overlay').addEventListener('touchstart', onSvgTouch, { passive: true });
        qs('#overlay').addEventListener('touchend', onSvgTouch);
        qs('#minimize').addEventListener('click', onMinimizeClicked);
        qs('#quit').addEventListener('click', quitPicker);
        qs('#filterText').addEventListener('input', onFilterTextChanged);
        qs('#resultsetDepth input').addEventListener('input', onDepthChanged);
        qs('#resultsetSpecificity input').addEventListener('input', onSpecificityChanged);
        qs('#pick').addEventListener('click', resetPicker);
        qs('#preview').addEventListener('click', onPreviewClicked);
        qs('#create').addEventListener('click', onCreateClicked);
        qs('#candidateFilters').addEventListener('click', onCandidateClicked);
        toolOverlay.highlightElementUnderMouse(true);
    }

    function onMessage(msg) {
        switch ( msg.what ) {
        case 'startTool':
            startPicker();
            break;
        default:
            break;
        }
    }

    self.pickerState = {
        get paused() { return root.classList.contains('paused'); },
        get minimized() { return root.classList.contains('minimized'); },
        get preview() { return root.classList.contains('preview'); },
        get selectedSelector() { return qs('#filterText').value; },
        get candidateCount() { return parseInt(qs('#resultsetCount').textContent || '0', 10); },
        get selectedDepth() { return selectedDepth; },
        get selectedSpecificity() { return selectedSpecificity; },
        get cosmeticFilterCandidates() { return cosmeticFilterCandidates; },
    };

    toolOverlay.start(onMessage);
})();
