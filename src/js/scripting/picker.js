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

    function filterDataAttributes(elem) {
        var attrs = [];
        if (typeof elem.getAttribute !== 'function') { return attrs; }
        
        var dataAttrs = ['data-id', 'data-href-url', 'data-event-action', 'data-outbound-url', 'data-outbound-expiration'];
        
        for (var i = 0; i < dataAttrs.length; i++) {
            var value = elem.getAttribute(dataAttrs[i]);
            if (value && value.length > 0) {
                attrs.push({ name: dataAttrs[i], value: value });
            }
        }
        
        if (attrs.length === 0) {
            var allAttrs = elem.attributes;
            if (allAttrs) {
                for (var j = 0; j < allAttrs.length; j++) {
                    var attrName = allAttrs[j].name;
                    if (attrName.startsWith('data-') && allAttrs[j].value) {
                        attrs.push({ name: attrName, value: allAttrs[j].value });
                    }
                }
            }
        }
        
        return attrs;
    }

    function buildAttrSelector(attrs) {
        if (!attrs || attrs.length === 0) { return ''; }
        
        var parts = [];
        for (var i = 0; i < attrs.length; i++) {
            // Use full attribute value, not truncated - critical for uniqueness
            var escapedValue = CSS.escape(attrs[i].value);
            parts.push('[' + attrs[i].name + '="' + escapedValue + '"]');
        }
        return parts.join('');
    }

    function filterAllAttributes(elem) {
        var attrs = [];
        if (typeof elem.getAttribute !== 'function' || !elem.attributes) { return attrs; }
        
        var importantAttrs = [
            'href', 'src', 'title', 'alt', 'name', 'value', 'placeholder',
            'role', 'type', 'lang', 'rel', 'id', 'class'
        ];
        var importantDataAttrs = [
            'data-id', 'data-href-url', 'data-event-action', 'data-outbound-url',
            'data-outbound-expiration', 'data-action', 'data-url', 'data-target',
            'data-src', 'data-title', 'data-text', 'data-post-id', 'data-fullname'
        ];
        
        var seen = new Set();
        
        for (var i = 0; i < elem.attributes.length; i++) {
            var attr = elem.attributes[i];
            var name = attr.name;
            var value = attr.value;
            
            if (!value || seen.has(name)) { continue; }
            seen.add(name);
            
            if (importantAttrs.indexOf(name) !== -1 || name.startsWith('data-') || name.startsWith('aria-')) {
                if (name === 'class' || name === 'id') { continue; }
                attrs.push({ name: name, value: value });
            }
        }
        
        return attrs;
    }

    function buildPathSelector(elem, targetElem, maxDepth) {
        var parts = [];
        var current = elem;
        var depth = 0;
        
        while (current && current !== document.body && depth < maxDepth) {
            var tagName = CSS.escape(current.localName);
            var classes = filterClasses(current);
            var attrs = filterAllAttributes(current);
            var id = current.id;
            
            var part = tagName;
            
            if (id) {
                part += '#' + CSS.escape(id);
            }
            
            if (classes.length > 0) {
                part += escapeClassNames(classes.slice(0, 2));
            }
            
            if (attrs.length > 0) {
                var attrParts = [];
                for (var i = 0; i < Math.min(attrs.length, 2); i++) {
                    // Use full value for uniqueness
                    attrParts.push('[' + attrs[i].name + '="' + CSS.escape(attrs[i].value) + '"]');
                }
                part += attrParts.join('');
            }
            
            parts.unshift(part);
            current = current.parentElement;
            depth++;
        }
        
        return parts.join(' > ');
    }

    function generateAttributeSelectors(elem) {
        var selectors = [];
        var attrs = filterAllAttributes(elem);
        var tagName = CSS.escape(elem.localName);
        var classes = filterClasses(elem);
        
        if (attrs.length === 0 && classes.length === 0) { return selectors; }
        
        // Generate selectors with ALL classes combined (most specific)
        if (classes.length > 0) {
            var allClasses = escapeClassNames(classes);
            selectors.push('##' + tagName + allClasses);
            selectors.push('##' + allClasses);
        }
        
        // Generate selectors with individual attributes
        for (var i = 0; i < attrs.length; i++) {
            // Use full value, not truncated - this is critical for uniqueness
            var attrStr = '[' + attrs[i].name + '="' + CSS.escape(attrs[i].value) + '"]';
            selectors.push('##' + tagName + attrStr);
            selectors.push('##' + attrStr);
        }
        
        // Generate selectors with multiple attributes combined
        if (attrs.length >= 2) {
            var combinedAttrs = '';
            for (var j = 0; j < attrs.length; j++) {
                combinedAttrs += '[' + attrs[j].name + '="' + CSS.escape(attrs[j].value) + '"]';
            }
            selectors.push('##' + tagName + combinedAttrs);
            selectors.push('##' + combinedAttrs);
        }
        
        // Generate selectors combining classes and attributes
        if (classes.length > 0 && attrs.length > 0) {
            var classPart = escapeClassNames(classes);
            var attrPart = '';
            for (var k = 0; k < Math.min(attrs.length, 2); k++) {
                attrPart += '[' + attrs[k].name + '="' + CSS.escape(attrs[k].value) + '"]';
            }
            selectors.push('##' + tagName + classPart + attrPart);
            selectors.push('##' + classPart + attrPart);
        }
        
        return selectors;
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

    function isUniqueSelector(selector, targetElem) {
        if (!targetElem || !selector) { return false; }
        try {
            var elems = qsa(document, selector);
            return elems.length === 1 && elems[0] === targetElem;
        } catch (e) {
            return false;
        }
    }

    function filterRank(filter, targetElem) {
        var selector = filter.slice(2);
        var score = 0;
        var tagMatch = /^[a-z][a-z0-9-]*/i.exec(selector);
        var tagName = tagMatch ? tagMatch[0].toLowerCase() : '';
        
        // Heavily penalize selectors that don't uniquely match the target element
        if (targetElem && !isUniqueSelector(selector, targetElem)) {
            var count = selectorCount(selector);
            if (count > 1) {
                score -= 500 + (count * 10);
            }
        }
        
        // Strongly reward unique selectors
        if (targetElem && isUniqueSelector(selector, targetElem)) {
            score += 300;
        }
        
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
        var dataAttrs = filterDataAttributes(elem);
        var attrSelector = buildAttrSelector(dataAttrs);
        var allAttrs = filterAllAttributes(elem);
        var filters = [];

        // 1. Generate attribute-based selectors (all attributes, not just data-*)
        var attrBasedSelectors = generateAttributeSelectors(elem);
        filters = filters.concat(attrBasedSelectors);

        // 2. Generate combinations using data attributes (highest priority - most unique)
        if (dataAttrs.length > 0) {
            // Tag + data attributes
            if (classes.length > 0) {
                filters.push('##' + tagName + escapeClassNames(classes) + attrSelector);
                filters.push('##' + escapeClassNames(classes) + attrSelector);
            }
            // Tag + data attributes (without classes)
            filters.push('##' + tagName + attrSelector);
            filters.push('##' + attrSelector);
            
            // Individual data attributes
            for (var i = 0; i < dataAttrs.length; i++) {
                var singleAttr = '[' + dataAttrs[i].name + '="' + CSS.escape(dataAttrs[i].value) + '"]';
                filters.push('##' + tagName + singleAttr);
                filters.push('##' + singleAttr);
            }
        }

        // 3. Generate combinations using ALL classes (not just subsets)
        if (classes.length >= 1) {
            // All classes combined (highest specificity)
            var allClasses = escapeClassNames(classes);
            filters.push('##' + tagName + allClasses);
            filters.push('##' + allClasses);
            
            // Tag + single class
            for (var j = 0; j < classes.length; j++) {
                var singleClass = '.' + CSS.escape(classes[j]);
                filters.push('##' + tagName + singleClass);
                filters.push('##' + singleClass);
            }
        }

        // 4. ID-based selectors (highest priority when available)
        if ( typeof elem.id === 'string' && elem.id !== '' ) {
            filters.push('###' + CSS.escape(elem.id));
            filters.push('##' + tagName + '#' + CSS.escape(elem.id));
            // ID + data attributes
            if (dataAttrs.length > 0) {
                filters.push('##' + tagName + '#' + CSS.escape(elem.id) + attrSelector);
            }
        }

        // 5. Generate hierarchical path-based selectors (walk up DOM tree)
        var current = elem;
        var ancestorCount = 0;
        while (current && current.parentElement && current !== document.body && ancestorCount < 5) {
            var parent = current.parentElement;
            if (parent) {
                var parentTagName = CSS.escape(parent.localName);
                var parentClasses = filterClasses(parent);
                var parentId = parent.id;
                var parentAttrs = filterAllAttributes(parent);
                
                // Build parent part of selector
                var parentPart = parentTagName;
                if (parentId) {
                    parentPart += '#' + CSS.escape(parentId);
                } else if (parentClasses.length > 0) {
                    parentPart += escapeClassNames(parentClasses.slice(0, 1));
                }
                
                // Build full path selector
                var tagPart = tagName;
                if (classes.length > 0) {
                    tagPart += escapeClassNames(classes.slice(0, 1));
                } else if (allAttrs.length > 0) {
                    tagPart += '[' + allAttrs[0].name + '="' + CSS.escape(allAttrs[0].value.slice(0, 30)) + '"]';
                }
                
                var pathSelector = '##' + parentPart + ' > ' + tagPart;
                if (filters.indexOf(pathSelector) === -1) {
                    filters.push(pathSelector);
                }
                
                // Try with more parent context
                if (ancestorCount > 0) {
                    var deeperPath = buildPathSelector(elem, elem, ancestorCount + 2);
                    if (deeperPath && filters.indexOf('##' + deeperPath) === -1) {
                        filters.push('##' + deeperPath);
                    }
                }
            }
            current = parent;
            ancestorCount++;
        }

        // 6. Tag-based selectors as fallback
        var tagSelector = '##' + tagName;
        var nthSelector = '##' + tagName + ':nth-of-type(' + nthOfTypeIndex(elem) + ')';
        filters.push(nthSelector);
        filters.push(tagSelector);

        if ( filters.length === 0 ) {
            return null;
        }

        // Filter out duplicates and selectors matching 0 elements
        var seenFilters = new Set();
        var uniqueFilters = [];
        var broadFilters = [];
        
        filters.forEach(function(filter) {
            if (seenFilters.has(filter)) { return; }
            seenFilters.add(filter);
            
            var selector = filter.slice(2);
            if (selectorCount(selector) === 0) { return; }
            
            if (isUniqueSelector(selector, elem)) {
                uniqueFilters.push(filter);
            } else {
                broadFilters.push(filter);
            }
        });

        // Put unique filters first, then broad filters sorted by match count
        filters = uniqueFilters.concat(broadFilters);

        if ( filters.length === 0 ) {
            return null;
        }

        filters.sort(function(a, b) {
            // First, prioritize unique selectors
            var aUnique = isUniqueSelector(a.slice(2), elem);
            var bUnique = isUniqueSelector(b.slice(2), elem);
            if (aUnique && !bUnique) { return -1; }
            if (!aUnique && bUnique) { return 1; }
            
            // Then sort by count (prefer fewer matches) - this is key for non-unique selectors
            var countDelta = selectorCount(a.slice(2)) - selectorCount(b.slice(2));
            if ( countDelta !== 0 ) { return countDelta; }

            // Then by rank (prefer selectors with attributes)
            var rankDelta = filterRank(a, elem) - filterRank(b, elem);
            if ( rankDelta !== 0 ) { return rankDelta; }

            return 0;
        });

        return {
            label: filters[0],
            filters: filters,
        };
    }

    function bestSpecificityForGroup(group) {
        if ( group instanceof Object === false || Array.isArray(group.filters) === false ) {
            return 0;
        }
        for ( var i = 0; i < group.filters.length; i++ ) {
            var filter = group.filters[i];
            var selector = filter.slice(2);
            if ( selectorCount(selector) === 1 ) {
                return i;
            }
        }
        return 0;
    }

    function candidatesAtPoint(x, y, options) {
        options = options || {};
        var elem = null;
        if (typeof x === 'number') {
            elem = ubolOverlay.elementFromPoint(x, y);
        } else if (x instanceof HTMLElement) {
            elem = x;
        }

        if (!elem) { return; }
        if ( options.preserveExact !== true ) {
            elem = normalizePickedElement(elem);
        }

        var groups = [];
        while (elem && elem !== document.body && elem !== document.documentElement) {
            var group = buildGroupCandidates(elem);
            if ( group !== null ) {
                groups.push(group);
            }
            elem = elem.parentElement;
        }

        if ( groups.length === 0 ) { return; }

        // Keep the initial selection anchored to the picked element.
        // Ancestors stay available through the depth slider instead of
        // overriding the initial choice.
        var bestSlot = 0;
        while ( bestSlot < groups.length ) {
            if ( Array.isArray(groups[bestSlot].filters) && groups[bestSlot].filters.length !== 0 ) {
                break;
            }
            bestSlot += 1;
        }
        if ( bestSlot >= groups.length ) { bestSlot = 0; }
        var bestSpecificity = bestSpecificityForGroup(groups[bestSlot]);

        return {
            cosmeticFilters: groups,
            filter: {
                slot: bestSlot,
                specificity: bestSpecificity,
            }
        };
    }

    function elementFromTargetSpec(target) {
        if ( typeof target !== 'string' || target === '' ) { return null; }
        var pos = target.indexOf('\t');
        if ( pos === -1 ) { return null; }

        var tagName = target.slice(0, pos).toLowerCase();
        var url = target.slice(pos + 1);
        var attr = {
            a: 'href',
            audio: 'src',
            iframe: 'src',
            img: 'src',
            video: 'src',
        }[tagName];
        if ( !attr ) { return null; }

        var elems = document.getElementsByTagName(tagName);
        for ( var i = 0; i < elems.length; i++ ) {
            var elem = elems[i];
            if ( elem === ubolOverlay.frame ) { continue; }
            var value = '';
            try {
                value = elem.getAttribute(attr) || elem[attr] || '';
            } catch {
            }
            if ( value === url ) {
                return elem;
            }
        }
        return null;
    }

    function elementFromExactTarget(target) {
        if ( target instanceof Object === false ) { return null; }
        if ( typeof target.selector !== 'string' || target.selector === '' ) { return null; }
        var elems = qsa(document, target.selector);
        if ( Array.isArray(elems) === false || elems.length === 0 ) { return null; }
        return elems[0];
    }

    function consumeBootSelection() {
        var boot = self.__ubrPickerBoot;
        if ( boot instanceof Object === false ) { return; }
        self.__ubrPickerBoot = undefined;

        var exactElem = elementFromExactTarget(boot.exactTarget);
        if ( exactElem !== null ) {
            ubolOverlay.highlightElements([ exactElem ]);
            return {
                primed: true,
                highlighted: true,
            };
        }

        var point = boot.initialPoint;
        if (
            point instanceof Object &&
            typeof point.x === 'number' &&
            typeof point.y === 'number'
        ) {
            var pointElem = ubolOverlay.elementFromPoint(point.x, point.y);
            if ( pointElem ) {
                ubolOverlay.highlightElements([ pointElem ]);
                return {
                    primed: true,
                    highlighted: true,
                };
            }
        }

        var elem = elementFromTargetSpec(boot.target);
        if ( elem !== null ) {
            ubolOverlay.highlightElements([ elem ]);
            return {
                primed: true,
                highlighted: true,
            };
        }
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
            return consumeBootSelection();
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
