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
    var genericContainerTags = new Set([
        'article',
        'aside',
        'div',
        'footer',
        'header',
        'main',
        'nav',
        'section',
    ]);
    var ignorablePickedTags = new Set([
        'B',
        'CODE',
        'EM',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'I',
        'P',
        'SMALL',
        'SPAN',
        'STRONG',
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

    function filterToSelector(filter) {
        if ( typeof filter !== 'string' ) { return ''; }
        if ( filter.startsWith('##') ) {
            return filter.slice(2);
        }
        return filter;
    }

    function escapeClassNames(classList) {
        return classList.map(function(name) {
            return '.' + CSS.escape(name);
        }).join('');
    }

    function nthOfTypeIndex(elem) {
        var index = 1;
        var prev = elem.previousElementSibling;
        while ( prev ) {
            if ( prev.localName === elem.localName ) {
                index += 1;
            }
            prev = prev.previousElementSibling;
        }
        return index;
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

    function normalizePickedElement(elem) {
        while ( elem && elem.parentElement ) {
            if ( ignorablePickedTags.has(elem.tagName) === false ) {
                break;
            }
            if ( typeof elem.id === 'string' && elem.id !== '' ) {
                break;
            }
            if ( filterClasses(elem).length !== 0 ) {
                break;
            }
            elem = elem.parentElement;
        }
        return elem;
    }

    function selectorCount(selector) {
        var elems = qsa(document, selector);
        return Array.isArray(elems) ? elems.length : 0;
    }

    function filterRank(filter) {
        var selector = filter.slice(2);
        var score = 0;
        var tagMatch = /^[a-z][a-z0-9-]*/i.exec(selector);
        var tagName = tagMatch ? tagMatch[0].toLowerCase() : '';
        if ( selector.startsWith('#') ) {
            score -= 200;
        } else if ( selector.startsWith('.') ) {
            var classCount = (selector.match(/\./g) || []).length;
            if ( classCount >= 2 ) {
                score -= 120;
            } else {
                score += 20;
            }
        }
        if ( selector.indexOf(':nth-of-type(') !== -1 ) {
            score -= 20;
        }
        if ( genericContainerTags.has(tagName) ) {
            score += 40;
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

        var tagSelector = '##' + tagName;
        var nthSelector = '##' + tagName + ':nth-of-type(' + nthOfTypeIndex(elem) + ')';
        filters.push(nthSelector);
        filters.push(tagSelector);

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
        elem = normalizePickedElement(elem);

        var groups = [];
        while (elem && elem !== document.body && elem !== document.documentElement) {
            var group = buildGroupCandidates(elem);
            if ( group !== null ) {
                groups.push(group);
            }
            elem = elem.parentElement;
        }

        if ( groups.length === 0 ) { return; }

        var bestIndex = 0;
        for ( var i = 1; i < groups.length; i++ ) {
            var currentFilter = groups[i].label;
            var bestFilter = groups[bestIndex].label;
            var currentCount = selectorCount(currentFilter.slice(2));
            var bestCount = selectorCount(bestFilter.slice(2));
            if ( currentCount < bestCount ) {
                bestIndex = i;
                continue;
            }
            if ( currentCount > bestCount ) {
                continue;
            }
            var currentRank = filterRank(currentFilter);
            var bestRank = filterRank(bestFilter);
            if ( currentRank < bestRank ) {
                bestIndex = i;
                continue;
            }
            if ( currentRank > bestRank ) {
                continue;
            }
            if ( i < bestIndex ) {
                bestIndex = i;
            }
        }

        return {
            cosmeticFilters: groups,
            filter: {
                slot: bestIndex,
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

    function removeElementsFromSelector(selector) {
        var fromSelector = typeof ubolOverlay.elementsFromSelector === 'function'
            ? ubolOverlay.elementsFromSelector(selector)
            : { elems: qsa(document, selector), error: undefined };
        var elems = Array.isArray(fromSelector.elems) ? fromSelector.elems.slice() : [];
        for ( var i = 0; i < elems.length; i++ ) {
            if ( elems[i] && typeof elems[i].remove === 'function' ) {
                elems[i].remove();
            }
        }
        ubolOverlay.highlightElements([]);
        return {
            count: elems.length,
            error: fromSelector.error || null,
        };
    }

    function confirmSelection(filter) {
        if ( typeof filter !== 'string' || filter.trim() === '' ) {
            return Promise.resolve({ count: 0, error: 'No filter selected' });
        }
        var normalizedFilter = filter.trim();
        var selector = filterToSelector(normalizedFilter);
        var removal = removeElementsFromSelector(selector);
        return Promise.resolve().then(function() {
            previewSelector('');
            return removal;
        }).catch(function(error) {
            return {
                count: removal.count,
                error: error instanceof Error ? error.message : String(error),
            };
        });
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
        case 'confirmSelection':
            return confirmSelection(msg.filter);
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
