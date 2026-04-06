/*******************************************************************************

    uBlock Origin - Element Picker Module
    Highlighter

    SVG-based element highlighting system for the element picker.

*******************************************************************************/

/**
 * Highlight elements by drawing SVG overlay
 * @param {Element[]} elems - Elements to highlight
 * @param {boolean} [force] - Force update even if same elements
 */
const highlightElements = function(elems, force) {
    debugLog('highlighter', 'highlightElements START - elems:', elems ? elems.length : 0, 'force:', force);
    
    // To make mouse move handler more efficient
    if (
        (force !== true) &&
        (elems.length === epickerState.targetElements.length) &&
        (elems.length === 0 || elems[0] === epickerState.targetElements[0])
    ) {
        debugLog('highlighter', 'highlightElements: skipping (no change)');
        return;
    }
    epickerState.targetElements = [];

    // Get dimensions from the page document
    const pageDoc = getPageDocument();
    const pageWin = pageDoc.defaultView || window;
    const ow = pageWin.innerWidth;
    const oh = pageWin.innerHeight;
    
    debugLog('highlighter', 'highlightElements: viewport', ow, oh);
    
    const islands = [];

    for ( const elem of elems ) {
        if ( elem === pickerFrame ) { 
            debugLog('highlighter', 'highlightElements: skipping pickerFrame');
            continue; 
        }
        epickerState.targetElements.push(elem);
        const rect = getElementBoundingClientRect(elem);
        debugLog('highlighter', 'highlightElements: elem', elem.tagName, 'rect:', JSON.stringify(rect));
        
        // Ignore offscreen areas
        if (
            rect.left > ow || rect.top > oh ||
            rect.left + rect.width < 0 || rect.top + rect.height < 0
        ) {
            debugLog('highlighter', 'elem is offscreen, skipping');
            continue;
        }
        
        if (rect.width === 0 || rect.height === 0) {
            debugLog('highlighter', 'elem has zero dimensions, skipping');
            continue;
        }
        
        const path = `M${rect.left} ${rect.top}h${rect.width}v${rect.height}h-${rect.width}z`;
        debugLog('highlighter', 'SVG path:', path);
        islands.push(path);
    }
    
    debugLog('highlighter', 'highlightElements: islands:', islands.length);
    debugLog('highlighter', 'highlightElements: pickerFramePort exists:', !!pickerFramePort);

    if (!pickerFramePort) {
        debugLog('highlighter', 'ERROR: pickerFramePort is null!');
        return;
    }

    pickerFramePort.postMessage({
        what: 'svgPaths',
        ocean: `M0 0h${ow}v${oh}h-${ow}z`,
        islands: islands.join(''),
    });
    
    debugLog('highlighter', 'highlightElements END - sent svgPaths message');
};

// Module-level references
let epickerState;
let getPageDocument;
let getElementBoundingClientRect;
let debugLog;
let pickerFrame;
let pickerFramePort;

/**
 * Initialize highlighter module
 * @param {Object} state - Shared epicker state
 * @param {Object} deps - Dependencies
 */
export function initHighlighter(state, deps) {
    epickerState = state;
    getPageDocument = deps.getPageDocument;
    getElementBoundingClientRect = deps.getElementBoundingClientRect;
    debugLog = deps.debugLog;
    pickerFrame = deps.pickerFrame;
    pickerFramePort = deps.pickerFramePort;
    
    // Export function
    state.highlightElements = highlightElements;
}

/**
 * Update pickerFramePort reference (called when port is established)
 * @param {MessagePort} port - The message port
 */
export function setPickerFramePort(port) {
    pickerFramePort = port;
}

/******************************************************************************/
