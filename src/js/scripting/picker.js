/*******************************************************************************

    uBlock Resurrected - Picker Content Script
    Handles element picking and selector generation

    This script runs in the page context via scripting.executeScript

*******************************************************************************/

(function() {
    'use strict';

    var ubolOverlay = self.ubolOverlay;
    if (!ubolOverlay) { return; }
    if (ubolOverlay.file === '/picker-ui.html') { return; }

    var previewedSelector = '';
    var previewedCSS = '';
    var ignoredClassNames = new Set([
        'login-required',
    ]);

    function qsa(node, selector) {
        if ( ubolOverlay.qsa ) {
            return ubolOverlay.qsa(node, selector);
        }
        if (node === null) { return []; }
        selector = selector.replace(/::[^:]+$/, '');
        try {
            return Array.from(node.querySelectorAll(selector));
        } catch (e) {
            return [];
        }
    }

    function escapeClassNames(classList) {
        return classList.map(function(name) {
            return '.' + CSS.escape(name);
        }).join('');
    }

    function filterClasses(elem) {
        var classAttr = typeof elem.getAttribute === 'function'
            ? elem.getAttribute('class') || ''
            : '';
        var seen = new Set();
        var classes = classAttr.split(/\s+/).filter(function(name) {
            if ( name === '' ) { return false; }
            if ( seen.has(name) ) { return false; }
            seen.add(name);
            if ( ignoredClassNames.has(name) ) { return false; }
            if ( name.indexOf('__') !== -1 ) { return false; }
            return true;
        });
        classes.sort(function(a, b) {
            var countDelta = selectorCount('.' + CSS.escape(a)) - selectorCount('.' + CSS.escape(b));
            if ( countDelta !== 0 ) { return countDelta; }
            return b.length - a.length;
        });
        return classes;
    }

    function selectorCount(selector) {
        var elems = qsa(document, selector);
        return Array.isArray(elems) ? elems.length : 0;
    }

    function filterRank(filter) {
        var selector = filter.slice(2);
        var score = 0;
        if ( selector.startsWith('.') ) {
            score -= 100;
        } else if ( selector.startsWith('#') ) {
            score -= 80;
        }
        if ( selector.indexOf('[') !== -1 ) {
            score += 20;
        }
        if ( /^[a-z]/i.test(selector) ) {
            score += 10;
        }
        score += selector.length / 1000;
        return score;
    }

    function buildGroupCandidates(elem) {
        var tagName = CSS.escape(elem.localName);
        var classes = filterClasses(elem);
        var filters = [];

        if ( classes.length >= 2 ) {
            filters.push('##' + escapeClassNames(classes));
            filters.push('##' + tagName + escapeClassNames(classes));
        } else if ( classes.length === 1 ) {
            filters.push('##' + escapeClassNames(classes));
            filters.push('##' + tagName + escapeClassNames(classes));
        }

        if ( typeof elem.id === 'string' && elem.id !== '' ) {
            filters.push('###' + CSS.escape(elem.id));
            filters.push('##' + tagName + '#' + CSS.escape(elem.id));
        }

        if ( filters.length === 0 ) {
            return null;
        }

        filters = filters.filter(function(filter, index, array) {
            return array.indexOf(filter) === index;
        }).filter(function(filter) {
            return selectorCount(filter.slice(2)) !== 0;
        });

        if ( filters.length === 0 ) {
            return null;
        }

        filters.sort(function(a, b) {
            var countDelta = selectorCount(a.slice(2)) - selectorCount(b.slice(2));
            if ( countDelta !== 0 ) { return countDelta; }

            var rankDelta = filterRank(a) - filterRank(b);
            if ( rankDelta !== 0 ) { return rankDelta; }

            return 0;
        });

        return {
            label: filters[0],
            filters: filters,
        };
    }

    function candidatesAtPoint(x, y) {
        var elem = null;
        if (typeof x === 'number') {
            elem = ubolOverlay.elementFromPoint(x, y);
        } else if (x instanceof HTMLElement) {
            elem = x;
        }

        if (!elem) { return; }

        var groups = [];
        while (elem && elem !== document.body && elem !== document.documentElement) {
            var group = buildGroupCandidates(elem);
            if ( group !== null ) {
                groups.push(group);
            }
            elem = elem.parentElement;
        }

        if ( groups.length === 0 ) { return; }

        return {
            cosmeticFilters: groups,
            filter: {
                slot: 0,
                specificity: 0,
            }
        };
    }

    function previewSelector(selector) {
        if (selector === previewedSelector) { return; }
        if (previewedSelector !== '') {
            if (previewedCSS !== '') {
                var style = document.getElementById('picker-preview-style');
                if (style) { style.remove(); }
                previewedCSS = '';
            }
        }
        previewedSelector = selector || '';
        if (selector === '') { return; }

        if (!selector.startsWith('{')) {
            var css = selector + ' { display: none !important; }';
            var style = document.createElement('style');
            style.id = 'picker-preview-style';
            style.textContent = css;
            document.head.appendChild(style);
            previewedCSS = selector;
        }
    }

    function highlightFromSelector(selector) {
        var result = { count: 0, error: null };

        if (!selector) {
            ubolOverlay.highlightElements([]);
            return result;
        }

        var fromSelector = typeof ubolOverlay.elementsFromSelector === 'function'
            ? ubolOverlay.elementsFromSelector(selector)
            : { elems: qsa(document, selector), error: undefined };
        var elems = fromSelector.elems;
        if (elems.length === 0) {
            result.error = fromSelector.error || 'No elements found';
        } else {
            result.count = elems.length;
        }

        ubolOverlay.highlightElements(elems);
        return result;
    }

    function onMessage(msg) {
        switch (msg.what) {
        case 'startTool':
            break;
        case 'quitTool':
            previewSelector('');
            ubolOverlay.stop();
            break;
        case 'startCustomFilters':
            return ubolOverlay.sendMessage({ what: 'startCustomFilters' });
        case 'terminateCustomFilters':
            return ubolOverlay.sendMessage({ what: 'terminateCustomFilters' });
        case 'candidatesAtPoint':
            return candidatesAtPoint(msg.mx, msg.my);
        case 'highlightFromSelector':
            return highlightFromSelector(msg.selector);
        case 'previewSelector':
            previewSelector(msg.selector);
            break;
        case 'unhighlight':
            ubolOverlay.highlightElements([]);
            break;
        case 'highlightElementAtPoint':
            var elem = ubolOverlay.elementFromPoint(msg.mx, msg.my);
            if (elem) {
                ubolOverlay.highlightElements([elem]);
            }
            break;
        }
    }

    ubolOverlay.install('/picker-ui.html', onMessage);

})();
