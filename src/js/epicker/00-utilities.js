/*******************************************************************************

    uBlock Origin - Element Picker Module
    Utilities

    Basic utility functions shared across all epicker modules.

*******************************************************************************/

/**
 * @fileoverview Shared utilities for the element picker
 */

/**
 * Debug logging utility
 * @param {string} source - Source module name
 * @param {...*} args - Arguments to log
 */
var debugLog = function(source) {
    // Disabled in production - enable for debugging only
    // var args = Array.prototype.slice.call(arguments).slice(1);
    // console.log('[EPICKER]', '[' + source + ']', args.join(' '));
};

/**
 * Safe querySelectorAll wrapper that handles exceptions
 * @param {Node|null} node - Node to query
 * @param {string} selector - CSS selector
 * @returns {NodeList|Array} - Query results or empty array
 */
const safeQuerySelectorAll = function(node, selector) {
    if ( node !== null ) {
        try {
            return node.querySelectorAll(selector);
        } catch {
        }
    }
    return [];
};

/**
 * Get element bounding rect with fallback
 * @param {Element} elem - Element to measure
 * @returns {DOMRect} - Bounding rect
 */
const getElementBoundingClientRect = function(elem) {
    if ( typeof elem.getBoundingClientRect !== 'function' ) {
        return { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
    }
    const rect = elem.getBoundingClientRect();
    return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width
    };
};

/**
 * Get the page document (handles page context)
 * @returns {Document} - Page document
 */
var getPageDocument = function() {
    debugLog('epicker', 'getPageDocument: using self.document (page context)');
    return self.document;
};

/**
 * Get page-relative coordinates
 * @param {MouseEvent} ev - Mouse event
 * @returns {{x: number, y: number}} - Page coordinates
 */
var getPageCoordinates = function(ev) {
    var x = typeof ev.pageX === 'number' ? ev.pageX : ev.clientX;
    var y = typeof ev.pageY === 'number' ? ev.pageY : ev.clientY;
    debugLog('epicker', 'getPageCoordinates:', x, y);
    return { x: x, y: y };
};

/**
 * Initialize utilities module
 * @param {Object} epickerState - Shared state from epicker
 */
export function initUtilities(epickerState) {
    epickerState.safeQuerySelectorAll = safeQuerySelectorAll;
    epickerState.getElementBoundingClientRect = getElementBoundingClientRect;
    epickerState.getPageDocument = getPageDocument;
    epickerState.getPageCoordinates = getPageCoordinates;
    epickerState.debugLog = debugLog;
}

/******************************************************************************/
