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

    var excludedAttributeExpansion = [
        'sizes',
        'srcset'
    ];

    var excludedSelectors = [
        'div',
        'span'
    ];

    function attributeNameFromPart(part) {
        var pos = part.search(/\^?=/);
        return part.slice(1, pos);
    }

    function selectorFromAddresses(partsDB, addresses) {
        var selector = [];
        var majorLast = -1;
        for (var i = 0; i < addresses.length; i++) {
            var address = addresses[i];
            var major = address >>> 12;
            if (majorLast !== -1) {
                var delta = majorLast - major;
                if (delta > 1) {
                    selector.push(' ');
                } else if (delta === 1) {
                    selector.push(' > ');
                }
            }
            majorLast = major;
            var part = partsDB.get(address);
            if ((address & 0xF) === 3) {
                selector.push('[' + attributeNameFromPart(part) + ']');
            } else {
                selector.push(part);
            }
        }
        return selector.join('');
    }

    function qsa(node, selector) {
        if (node === null) { return []; }
        if (selector.startsWith('{')) {
            return [];
        }
        selector = selector.replace(/::[^:]+$/, '');
        try {
            return Array.from(node.querySelectorAll(selector));
        } catch (e) {
            return [];
        }
    }

    function candidatesAtPoint(x, y) {
        var elem = null;
        if (typeof x === 'number') {
            elem = ubolOverlay.elementFromPoint(x, y);
        } else if (x instanceof HTMLElement) {
            elem = x;
        }

        if (!elem) { return; }

        var partsDB = new Map();
        var listParts = [];

        while (elem && elem !== document.body) {
            var tagName = elem.localName;
            var addressMajor = listParts.length << 12;
            partsDB.set(addressMajor, tagName);
            var parts = [addressMajor];

            if (typeof elem.id === 'string' && elem.id !== '') {
                var address = addressMajor | (parts.length << 4) | 1;
                partsDB.set(address, '#' + CSS.escape(elem.id));
                parts.push(address);
            }

            if (elem.classList) {
                var classList = Array.from(elem.classList.values());
                for (var i = 0; i < classList.length; i++) {
                    var name = classList[i];
                    if (name === '') { continue; }
                    address = addressMajor | (parts.length << 4) | 2;
                    partsDB.set(address, '.' + CSS.escape(name));
                    parts.push(address);
                }
            }

            var attrNames = elem.getAttributeNames();
            for (var j = 0; j < attrNames.length; j++) {
                var attrName = attrNames[j];
                if (attrName === 'id' || attrName === 'class') { continue; }

                var address2 = addressMajor | (parts.length << 4) | 3;

                if (excludedAttributeExpansion.indexOf(attrName) !== -1) {
                    partsDB.set(address2, '[' + CSS.escape(attrName) + ']');
                    parts.push(address2);
                    continue;
                }

                var value = elem.getAttribute(attrName) || '';
                var pos = value.search(/[\n\r]/);
                if (pos !== -1) {
                    value = value.slice(0, pos);
                }
                partsDB.set(address2, '[' + CSS.escape(attrName) + '="' + value + '"]');
                parts.push(address2);
            }

            var parentNode = elem.parentNode;
            if (parentNode) {
                var testSelector = ':scope > ' + selectorFromAddresses(partsDB, parts);
                var siblings = qsa(parentNode, testSelector);
                if (siblings.length > 1) {
                    var i2 = 1;
                    var sibling = elem.previousSibling;
                    while (sibling !== null) {
                        if (typeof sibling.localName === 'string' && sibling.localName === tagName) {
                            i2++;
                        }
                        sibling = sibling.previousSibling;
                    }
                    address = addressMajor | (parts.length << 4) | 4;
                    partsDB.set(address, ':nth-of-type(' + i2 + ')');
                    parts.push(address);
                }
            }

            listParts.push(parts);
            elem = elem.parentElement;
        }

        if (listParts.length === 0) { return; }

        var sliderCandidates = [];
        for (var k = 0; k < listParts.length; k++) {
            sliderCandidates.push(listParts[k]);
            for (var l = k + 1; l < listParts.length; l++) {
                var combined = listParts[l].concat(sliderCandidates[sliderCandidates.length - 1]);
                sliderCandidates.push(combined);
            }
        }

        var sliderMap = new Map();
        for (var m = 0; m < sliderCandidates.length; m++) {
            var candidates = sliderCandidates[m];

            if (candidates.some(function(a) { return (a & 0xF) === 1; })) {
                var idPath = candidates.filter(function(a) { return (a & 0xF) === 1; });
                sliderMap.set(JSON.stringify(idPath), 0);
            } else if (candidates.some(function(a) { return (a & 0xF) === 4; })) {
                var nthPath = candidates.filter(function(a) {
                    return (a & 0xF) === 0 || (a & 0xF) === 4;
                });
                sliderMap.set(JSON.stringify(nthPath), 0);
            }

            if (candidates.some(function(a) { return (a & 0xF) === 2; })) {
                var classPath = candidates.filter(function(a) {
                    return (a & 0xF) === 0 || (a & 0xF) === 2;
                });
                sliderMap.set(JSON.stringify(classPath), 0);
            }

            var attrPath = candidates.filter(function(a) {
                return (a & 0xF) === 0 || (a & 0xF) === 3;
            });
            sliderMap.set(JSON.stringify(attrPath), 0);
        }
        sliderMap.delete('[]');

        var elemToIdMap = new Map();
        var resultSetMap = new Map();
        var elemId = 1;

        sliderMap.forEach(function(_, json) {
            var addresses = JSON.parse(json);
            var selector = selectorFromAddresses(partsDB, addresses);
            if (excludedSelectors.indexOf(selector) !== -1) { return; }

            var elems = qsa(document, selector);
            if (elems.length === 0) { return; }

            var resultSet = [];
            for (var n = 0; n < elems.length; n++) {
                var e = elems[n];
                if (!elemToIdMap.has(e)) {
                    elemToIdMap.set(e, elemId++);
                }
                resultSet.push(elemToIdMap.get(e));
            }
            resultSet.sort(function(a, b) { return a - b; });
            var resultSetKey = JSON.stringify(resultSet);

            var current = resultSetMap.get(resultSetKey);
            if (current) {
                if (current.length < addresses.length) { return; }
                if (current.length === addresses.length) {
                    if (!addresses.some(function(a) { return (a & 0xF) === 2; })) {
                        if (current.some(function(a) { return (a & 0xF) === 2; })) { return; }
                    }
                }
            }
            resultSetMap.set(resultSetKey, addresses);
        });

        var sliderParts = [];
        resultSetMap.forEach(function(addresses) {
            sliderParts.push(addresses);
        });

        sliderParts.sort(function(a, b) {
            var amajor = a[a.length - 1] >>> 12;
            var bmajor = b[b.length - 1] >>> 12;
            if (amajor !== bmajor) { return bmajor - amajor; }
            amajor = a[0] >>> 12;
            bmajor = b[0] >>> 12;
            if (amajor !== bmajor) { return bmajor - amajor; }
            if (a.length !== b.length) { return b.length - a.length; }
            return b.length - a.length;
        });

        var partsDBArray = [];
        partsDB.forEach(function(value, key) {
            partsDBArray.push([key, value]);
        });

        return {
            partsDB: partsDBArray,
            listParts: listParts,
            sliderParts: sliderParts
        };
    }

    function previewSelector(selector) {
        if (selector === previewedSelector) { return; }
        if (previewedSelector !== '') {
            if (previewedSelector.startsWith('{')) {
                // Procedural filter preview not implemented
            }
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

        var elems = qsa(document, selector);
        if (elems.length === 0) {
            result.error = 'No elements found';
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
