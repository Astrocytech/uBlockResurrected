/*******************************************************************************

    uBlock Resurrected - Picker UI Entry Point
    Handles picker-specific UI events

    This script runs in the iframe context (isolated from page)

*******************************************************************************/

(function() {
    'use strict';

    var toolOverlay = self.toolOverlay;
    if (!toolOverlay) { return; }

    var pickerState = {
        paused: false,
        minimized: true,
        preview: false,
        viewState: 0,
        selectedSelector: '',
        sliderParts: [],
        sliderPosition: -1,
        partsDB: new Map(),
        candidateCount: 0
    };

    var qs = function(selector) {
        return document.querySelector(selector);
    };

    var qsa = function(selector) {
        return Array.from(document.querySelectorAll(selector));
    };

    function onSvgTouch(ev) {
        if (ev.type === 'touchstart') {
            onSvgTouch.x0 = ev.touches[0].screenX;
            onSvgTouch.y0 = ev.touches[0].screenY;
            onSvgTouch.t0 = ev.timeStamp;
            return;
        }
        if (onSvgTouch.x0 === undefined) { return; }

        var stopX = ev.changedTouches[0].screenX;
        var stopY = ev.changedTouches[0].screenY;
        var distance = Math.sqrt(
            Math.pow(stopX - onSvgTouch.x0, 2) +
            Math.pow(stopY - onSvgTouch.y0, 2)
        );

        var duration = ev.timeStamp - onSvgTouch.t0;
        if (distance >= 32 || duration >= 200) { return; }

        onSvgClicked({
            type: 'touch',
            clientX: ev.changedTouches[0].pageX,
            clientY: ev.changedTouches[0].pageY
        });
        ev.preventDefault();
    }
    onSvgTouch.x0 = 0;
    onSvgTouch.y0 = 0;
    onSvgTouch.t0 = 0;

    function onSvgClicked(ev) {
        if (pickerState.paused) {
            if (pickerState.preview) {
                updatePreview(false);
            }
            unpausePicker();
            return;
        }

        document.body.classList.add('show');

        toolOverlay.postMessage({
            what: 'candidatesAtPoint',
            mx: ev.clientX,
            my: ev.clientY
        }).then(function(details) {
            showDialog(details);
        });
    }

    function onKeyPressed(ev) {
        if (ev.key === 'Escape' || ev.which === 27) {
            quitPicker();
            return;
        }
    }

    function onMinimizeClicked() {
        if (!pickerState.paused) {
            pausePicker();
            highlightCandidate();
            return;
        }
        pickerState.minimized = !pickerState.minimized;
        document.body.classList.toggle('minimized', pickerState.minimized);
    }

    function onFilterTextChanged() {
        highlightCandidate();
    }

    function onSliderChanged(ev) {
        updateSlider(Math.round(ev.target.valueAsNumber));
    }

    function updateSlider(i) {
        if (i === pickerState.sliderPosition) { return; }
        pickerState.sliderPosition = i;

        qsa('#candidateFilters [data-part]').forEach(function(span) {
            span.classList.remove('on');
        });

        var parts = pickerState.sliderParts[i];
        if (parts) {
            parts.forEach(function(address) {
                var span = qs('#candidateFilters [data-part="' + address + '"]');
                if (span) {
                    span.classList.add('on');
                }
            });
        }

        var selector = selectorFromCandidates();
        qs('#filterText').value = selector;
        pickerState.selectedSelector = selector;
        highlightCandidate();
    }

    function selectorFromCandidates() {
        var selectorParts = [];
        var liPrevious = null;
        qsa('#candidateFilters li').forEach(function(li) {
            var selector = [];
            qsa(li, '.on[data-part]').forEach(function(span) {
                selector.push(span.textContent);
            });
            if (selector.length !== 0) {
                if (liPrevious !== null) {
                    if (li.previousElementSibling === liPrevious) {
                        selectorParts.unshift(' > ');
                    } else if (liPrevious !== li) {
                        selectorParts.unshift(' ');
                    }
                }
                liPrevious = li;
                selectorParts.unshift(selector.join(''));
            }
        });
        return selectorParts.join('');
    }

    function updateElementCount(details) {
        var count = details ? details.count : 0;
        var error = details ? details.error : null;
        var span = qs('#resultsetCount');

        if (error) {
            span.textContent = '!';
            span.title = error;
        } else {
            span.textContent = count;
            span.removeAttribute('title');
        }

        pickerState.candidateCount = count;
        qs('#create').disabled = count === 0;
        updatePreview();
    }

    function onPreviewClicked() {
        pickerState.preview = !pickerState.preview;
        document.body.classList.toggle('preview', pickerState.preview);
        updatePreview();
    }

    function updatePreview(state) {
        if (state === undefined) {
            state = pickerState.preview;
        } else {
            pickerState.preview = state;
            document.body.classList.toggle('preview', state);
        }

        var selector = pickerState.selectedSelector || '';
        return toolOverlay.postMessage({ what: 'previewSelector', selector: selector });
    }

    function onCreateClicked() {
        var selector = pickerState.selectedSelector;
        if (!selector) { return; }

        toolOverlay.postMessage({ what: 'terminateCustomFilters' });
        toolOverlay.sendMessage({
            what: 'addCustomFilters',
            selectors: [selector]
        }).then(function() {
            return toolOverlay.postMessage({ what: 'startCustomFilters' });
        }).then(function() {
            qs('#filterText').value = '';
            pickerState.selectedSelector = '';
            updatePreview(false);
            quitPicker();
        });
    }

    function attributeNameFromSelector(part) {
        var pos = part.search(/\^?=/);
        return part.slice(1, pos);
    }

    function onCandidateClicked(ev) {
        var target = ev.target;
        if (target.matches('[data-part]')) {
            var address = parseInt(target.dataset.part, 10);
            var part = pickerState.partsDB.get(address);
            if (part.startsWith('[')) {
                if (target.textContent === part) {
                    target.textContent = '[' + attributeNameFromSelector(part) + ']';
                    target.classList.remove('on');
                } else if (target.classList.contains('on')) {
                    target.textContent = part;
                } else {
                    target.classList.add('on');
                }
            } else {
                target.classList.toggle('on');
            }
        } else if (target.matches('li')) {
            var hasOff = qsa(target, ':scope > span:not(.on)').length > 0;
            qsa(target, ':scope > [data-part]').forEach(function(span) {
                if (hasOff) {
                    span.classList.add('on');
                } else {
                    span.classList.remove('on');
                }
            });
        }

        var selector = selectorFromCandidates();
        qs('#filterText').value = selector;
        pickerState.selectedSelector = selector;
        highlightCandidate();
    }

    function showDialog(msg) {
        pausePicker();

        pickerState.partsDB = new Map(msg.partsDB);
        var listParts = msg.listParts;

        var ul = qs('#candidateFilters ul');
        ul.innerHTML = '';

        listParts.forEach(function(parts) {
            var li = document.createElement('li');
            parts.forEach(function(address) {
                var span = document.createElement('span');
                span.dataset.part = address;
                var part = pickerState.partsDB.get(address);
                if (part.startsWith('[')) {
                    span.textContent = '[' + attributeNameFromSelector(part) + ']';
                } else {
                    span.textContent = part;
                }
                span.classList.add('on');
                li.appendChild(span);
            });
            ul.appendChild(li);
        });

        pickerState.sliderParts = msg.sliderParts;
        pickerState.sliderPosition = -1;

        var slider = qs('#slider');
        var last = pickerState.sliderParts.length - 1;
        slider.max = last;
        slider.disabled = last !== 0 ? '' : 'disabled';
        slider.value = last;
        updateSlider(last);
    }

    function highlightCandidate() {
        var selector = pickerState.selectedSelector;
        if (!selector) {
            toolOverlay.postMessage({ what: 'unhighlight' });
            updateElementCount({ count: 0 });
            return;
        }
        toolOverlay.postMessage({
            what: 'highlightFromSelector',
            selector: selector
        }).then(function(result) {
            updateElementCount(result);
        });
    }

    function pausePicker() {
        pickerState.paused = true;
        document.body.classList.add('paused');
        document.body.classList.remove('minimized');
        toolOverlay.highlightElementUnderMouse(false);
    }

    function unpausePicker() {
        pickerState.paused = false;
        pickerState.preview = false;
        document.body.classList.remove('paused', 'preview');
        document.body.classList.add('minimized');
        updatePreview(false);
        toolOverlay.highlightElementUnderMouse(true);
    }

    function startPicker() {
        toolOverlay.postMessage({ what: 'startTool' });

        document.addEventListener('keydown', onKeyPressed, true);
        qs('#overlay').addEventListener('click', onSvgClicked);
        qs('#overlay').addEventListener('touchstart', onSvgTouch, { passive: true });
        qs('#overlay').addEventListener('touchend', onSvgTouch);
        qs('#minimize').addEventListener('click', onMinimizeClicked);
        qs('#quit').addEventListener('click', quitPicker);
        qs('#filterText').addEventListener('input', onFilterTextChanged);
        qs('#slider').addEventListener('input', onSliderChanged);
        qs('#pick').addEventListener('click', resetPicker);
        qs('#preview').addEventListener('click', onPreviewClicked);
        qs('#create').addEventListener('click', onCreateClicked);
        qs('#candidateFilters ul').addEventListener('click', onCandidateClicked);

        toolOverlay.highlightElementUnderMouse(true);
    }

    function quitPicker() {
        updatePreview(false);
        toolOverlay.stop();
    }

    function resetPicker() {
        toolOverlay.postMessage({ what: 'unhighlight' });
        unpausePicker();
    }

    function onMessage(msg) {
        switch (msg.what) {
        case 'startTool':
            startPicker();
            break;
        }
    }

    self.pickerState = pickerState;

    toolOverlay.start(onMessage);

})();
