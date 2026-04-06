/*******************************************************************************

    uBlock Origin - Element Picker Module
    Session Management

    Handles picker lifecycle, event handlers, and element lookup.

*******************************************************************************/

/**
 * Logging helper
 */
const epickerLog = (function() {
    var fn = function() {};
    fn.getLog = function() { return ''; };
    fn.clear = function() {};
    return fn;
})();

/**
 * Element lookup from point (closure with state)
 */
const elementFromPoint = (function() {
    var lastX, lastY;
    var pickerFrameRef = null;

    return function(x, y) {
        if ( x !== undefined ) {
            lastX = x; lastY = y;
        }

        var frame = null;
        
        // Find picker frame by attribute
        if (pickerFrame) {
            frame = pickerFrame;
            pickerFrameRef = frame;
        }
        
        // Try to find by attribute pattern
        if ( !frame ) {
            const pageDoc = getPageDocument();
            const iframes = pageDoc.querySelectorAll('iframe');
            for ( let i = 0; i < iframes.length; i++ ) {
                if ( iframes[i].hasAttribute && iframes[i].hasAttribute(epickerState.pickerUniqueId) ) {
                    frame = iframes[i];
                    pickerFrameRef = frame;
                    debugLog('session', 'elementFromPoint: found picker frame by attribute');
                    break;
                }
            }
        }
        
        if ( !frame ) {
            debugLog('session', 'elementFromPoint: still no pickerFrame');
            var pageDoc = getPageDocument();
            var elem = pageDoc.elementFromPoint(x, y);
            debugLog('session', 'elementFromPoint fallback result:', elem ? elem.tagName : 'null');
            return elem;
        }
        
        var pageDoc = getPageDocument();
        var magicAttr = epickerState.pickerUniqueId + '-clickblind';
        debugLog('session', 'elementFromPoint: setting clickblind on frame (attr:', magicAttr, ')');
        frame.setAttribute(magicAttr, '');
        
        const oldPointerEvents = frame.style.getPropertyValue('pointer-events');
        const oldPointerEventsPriority = frame.style.getPropertyPriority('pointer-events');
        frame.style.setProperty('pointer-events', 'none', 'important');

        debugLog('session', 'elementFromPoint: frame has clickblind attr:', frame.hasAttribute(magicAttr));
        
        var elems = pageDoc.elementsFromPoint(x, y);
        var elem = null;
        for ( var i = 0; i < elems.length; i++ ) {
            if ( elems[i] === frame ) { continue; }
            if ( elems[i].hasAttribute && elems[i].hasAttribute(epickerState.pickerUniqueId) ) { continue; }
            elem = elems[i];
            break;
        }
        
        debugLog('session', 'elementFromPoint: raw result:', elem ? elem.tagName + ' (id=' + (elem.id||'none') + ')' : 'null');
        
        if (oldPointerEvents) {
            frame.style.setProperty('pointer-events', oldPointerEvents, oldPointerEventsPriority);
        } else {
            frame.style.removeProperty('pointer-events');
        }

        if (
            elem === null ||
            elem === pageDoc.body ||
            elem === pageDoc.documentElement || (
                epickerState.pickerBootArgs.zap !== true &&
                getNoCosmeticFiltering() &&
                resourceURLsFromElement(elem).length === 0
            )
        ) {
            elem = null;
        }
        frame.removeAttribute(magicAttr);
        debugLog('session', 'elementFromPoint final result:', elem ? elem.tagName : 'null');
        return elem;
    };
})();

/**
 * Highlight element at point
 * @param {number} mx - Mouse X
 * @param {number} my - Mouse Y
 */
const highlightElementAtPoint = function(mx, my) {
    debugLog('session', 'highlightElementAtPoint START - page coords:', mx, my);
    
    const x = mx;
    const y = my;
    
    debugLog('session', 'Using page coords:', x, y);
    
    const elem = elementFromPoint(x, y);
    debugLog('session', 'elementFromPoint result:', elem ? elem.tagName : 'null');
    
    debugLog('session', 'Calling highlightElements');
    highlightElements(elem ? [ elem ] : []);
    
    debugLog('session', 'highlightElementAtPoint END');
};

/**
 * Filter element at point
 * @param {number} mx - Mouse X
 * @param {number} my - Mouse Y
 * @param {boolean} broad - Use broad matching
 */
const filterElementAtPoint = function(mx, my, broad) {
    debugLog('session', 'filterElementAtPoint page coords:', mx, my);
    if ( epickerState.filtersFrom(mx, my) === 0 ) { return; }
    showDialog({ broad });
};

/**
 * Zap (remove) element at point
 * @param {number} mx - Mouse X
 * @param {number} my - Mouse Y
 * @param {Object} options - Zapper options
 */
const zapElementAtPoint = function(mx, my, options) {
    debugLog('session', 'zapElementAtPoint START - mx:', mx, 'my:', my, 'options:', options);
    console.log('[ZAPPER] Starting - mx:', mx, 'my:', my, 'options:', options);
    
    if ( options.highlight ) {
        console.log('[ZAPPER] Highlight mode');
        debugLog('session', 'zapElementAtPoint: highlight mode');
        const elem = elementFromPoint(mx, my);
        debugLog('session', 'zapElementAtPoint: found elem:', elem ? elem.tagName : 'null');
        if ( elem ) {
            debugLog('session', 'zapElementAtPoint: calling highlightElements');
            highlightElements([ elem ]);
        }
        return;
    }

    console.log('[ZAPPER] Remove mode - finding element');
    debugLog('session', 'zapElementAtPoint: remove mode');
    let elemToRemove = epickerState.targetElements.length !== 0 && epickerState.targetElements[0] || null;
    if ( elemToRemove === null && mx !== undefined ) {
        elemToRemove = elementFromPoint(mx, my);
    }

    console.log('[ZAPPER] Element to remove:', elemToRemove ? elemToRemove.tagName : 'NULL');
    debugLog('session', 'zapElementAtPoint: elemToRemove:', elemToRemove ? elemToRemove.tagName : 'null');

    if ( elemToRemove instanceof Element === false ) { 
        console.log('[ZAPPER] Not an element, returning');
        debugLog('session', 'zapElementAtPoint: not an Element, returning');
        return; 
    }

    // Get filter WHILE element still exists (before removing!)
    console.log('[ZAPPER] Calling filtersFrom to get filter candidates...');
    debugLog('session', 'zapElementAtPoint: calling filtersFrom to generate filter (element still exists)');
    epickerState.filtersFrom(mx, my);
    
    console.log('[ZAPPER] After filtersFrom - net:', epickerState.netFilterCandidates.length, 'cosmetic:', epickerState.cosmeticFilterCandidates.length);
    debugLog('session', 'zapElementAtPoint: filtersFrom result - net:', epickerState.netFilterCandidates.length, 'cosmetic:', epickerState.cosmeticFilterCandidates.length);
    
    // Extract filter
    let filterToSave = null;
    if (epickerState.bestCandidateFilter && epickerState.bestCandidateFilter.filters && epickerState.bestCandidateFilter.filters.length > 0) {
        const slot = epickerState.bestCandidateFilter.slot !== undefined ? epickerState.bestCandidateFilter.slot : epickerState.bestCandidateFilter.filters.length - 1;
        filterToSave = epickerState.bestCandidateFilter.filters[slot];
    } else if (epickerState.cosmeticFilterCandidates.length > 0) {
        filterToSave = epickerState.cosmeticFilterCandidates[epickerState.cosmeticFilterCandidates.length - 1];
    } else if (epickerState.netFilterCandidates.length > 0) {
        filterToSave = epickerState.netFilterCandidates[0];
    }
    
    debugLog('session', 'zapElementAtPoint: filterToSave:', filterToSave);
    
    if (!filterToSave) {
        debugLog('session', 'zapElementAtPoint: NO FILTER FOUND - aborting');
        return;
    }

    // Handle scroll lock
    const getStyleValue = (elem, prop) => {
        const style = window.getComputedStyle(elem);
        return style ? style[prop] : '';
    };

    let maybeScrollLocked = elemToRemove.shadowRoot instanceof DocumentFragment;
    if ( maybeScrollLocked === false ) {
        let elem = elemToRemove;
        do {
            maybeScrollLocked =
                parseInt(getStyleValue(elem, 'zIndex'), 10) >= 1000 ||
                getStyleValue(elem, 'position') === 'fixed';
            elem = elem.parentElement;
        } while ( elem !== null && maybeScrollLocked === false );
    }
    if ( maybeScrollLocked ) {
        const doc = document;
        if ( getStyleValue(doc.body, 'overflowY') === 'hidden' ) {
            doc.body.style.setProperty('overflow', 'auto', 'important');
        }
        if ( getStyleValue(doc.body, 'position') === 'fixed' ) {
            doc.body.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'position') === 'fixed' ) {
            doc.documentElement.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'overflowY') === 'hidden' ) {
            doc.documentElement.style.setProperty('overflow', 'auto', 'important');
        }
    }

    // Remove the element
    console.log('[ZAPPER] Removing element');
    elemToRemove.remove();
    
    // Save filter
    console.log('[ZAPPER] Generated filter:', self.location.hostname + '##' + filterToSave);
    if (pickerFramePort) {
        pickerFramePort.postMessage({
            what: 'saveFilterFromZapper',
            filter: filterToSave,
            docURL: self.location.href,
        });
    }
    
    // Show dialog or stay in zapper mode
    if (pickerFramePort && options.stay !== true) {
        pickerFramePort.postMessage({
            what: 'dialogCreate',
            filter: filterToSave,
        });
    }
    
    highlightElementAtPoint(mx, my);
    debugLog('session', 'zapElementAtPoint END');
};

/**
 * Key press handler
 */
const onKeyPressed = function(ev) {
    if (
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        epickerState.pickerBootArgs.zap
    ) {
        ev.stopPropagation();
        ev.preventDefault();
        zapElementAtPoint();
        return;
    }
    if ( ev.key === 'Escape' || ev.which === 27 ) {
        ev.stopPropagation();
        ev.preventDefault();
        filterToDOMInterface.preview(false);
        quitPicker();
        return;
    }
};

/**
 * Viewport change handler
 */
const onViewportChanged = function() {
    highlightElements(epickerState.targetElements, true);
};

/**
 * Start picker
 */
const startPicker = function() {
    debugLog('session', 'startPicker called, pickerBootArgs:', epickerState.pickerBootArgs);
    pickerFrame.focus();

    self.addEventListener('scroll', onViewportChanged, { passive: true });
    self.addEventListener('resize', onViewportChanged, { passive: true });
    self.addEventListener('keydown', onKeyPressed, true);
    self.addEventListener('click', function(ev) {
        debugLog('session', 'Click detected in page context');
        if (vAPI.mouseClick instanceof Object && vAPI.mouseClick.x >= 0) {
            debugLog('session', 'Using vAPI.mouseClick position:', vAPI.mouseClick.x, vAPI.mouseClick.y);
            if ( epickerState.filtersFrom(vAPI.mouseClick.x, vAPI.mouseClick.y) !== 0 ) {
                return showDialog();
            }
        }
    }, true);

    if (
        vAPI.mouseClick instanceof Object &&
        typeof vAPI.mouseClick.x === 'number' &&
        vAPI.mouseClick.x >= 0 &&
        typeof vAPI.mouseClick.y === 'number' &&
        vAPI.mouseClick.y >= 0
    ) {
        debugLog('session', 'Initial mouse position:', vAPI.mouseClick.x, vAPI.mouseClick.y);
        if ( epickerState.filtersFrom(vAPI.mouseClick.x, vAPI.mouseClick.y) !== 0 ) {
            return showDialog();
        }
    } else {
        debugLog('session', 'No initial mouse position - will use UI mouse tracking');
    }

    debugLog('session', 'startPicker complete - waiting for UI messages');
};

/**
 * Quit picker
 */
const quitPicker = function() {
    self.removeEventListener('scroll', onViewportChanged, { passive: true });
    self.removeEventListener('resize', onViewportChanged, { passive: true });
    self.removeEventListener('keydown', onKeyPressed, true);
    vAPI.shutdown.remove(quitPicker);
    if ( pickerFramePort ) {
        pickerFramePort.close();
        pickerFramePort = null;
    }
    if ( pickerFrame ) {
        pickerFrame.remove();
        pickerFrame = null;
    }
    vAPI.userStylesheet.remove(pickerCSS);
    vAPI.userStylesheet.apply();
    vAPI.pickerFrame = false;
    self.focus();
};

/**
 * Show dialog
 */
const showDialog = function(options) {
    debugLog('session', 'showDialog called, pickerFramePort:', pickerFramePort ? 'exists' : 'null');
    debugLog('session', 'netFilterCandidates:', JSON.stringify(epickerState.netFilterCandidates));
    debugLog('session', 'cosmeticFilterCandidates:', JSON.stringify(epickerState.cosmeticFilterCandidates));
    
    if (!pickerFramePort) {
        debugLog('session', 'ERROR: pickerFramePort is null, cannot show dialog!');
        return;
    }
    
    let selectedFilter = '';
    if (epickerState.bestCandidateFilter && epickerState.bestCandidateFilter.filters && epickerState.bestCandidateFilter.filters.length > 0) {
        const slot = epickerState.bestCandidateFilter.slot || 0;
        selectedFilter = epickerState.bestCandidateFilter.filters[slot] || epickerState.bestCandidateFilter.filters[epickerState.bestCandidateFilter.filters.length - 1];
        debugLog('session', 'Selected filter (slot', slot, '):', selectedFilter);
    }
    
    if (selectedFilter) {
        console.log('[EPICKER] Full filter: ' + self.location.hostname + '##' + selectedFilter);
    }
    
    pickerFramePort.postMessage({
        what: 'showDialog',
        url: self.location.href,
        netFilters: epickerState.netFilterCandidates,
        cosmeticFilters: epickerState.cosmeticFilterCandidates,
        filter: epickerState.bestCandidateFilter,
        options,
    });
    
    debugLog('session', 'showDialog message sent');
};

// Module-level references
let epickerState;
let highlightElements;
let filterToDOMInterface;
let pickerFrame;
let pickerFramePort;
let pickerCSS;
let vAPI;
let debugLog;
let resourceURLsFromElement;
let getPageDocument;

/**
 * Initialize session module
 * @param {Object} state - Shared epicker state
 * @param {Object} deps - Dependencies
 */
export function initSession(state, deps) {
    epickerState = state;
    highlightElements = deps.highlightElements;
    filterToDOMInterface = deps.filterToDOMInterface;
    pickerFrame = deps.pickerFrame;
    pickerFramePort = deps.pickerFramePort;
    pickerCSS = deps.pickerCSS;
    vAPI = deps.vAPI;
    debugLog = deps.debugLog;
    resourceURLsFromElement = deps.resourceURLsFromElement;
    getPageDocument = deps.getPageDocument;
    
    state.elementFromPoint = elementFromPoint;
    state.highlightElementAtPoint = highlightElementAtPoint;
    state.filterElementAtPoint = filterElementAtPoint;
    state.zapElementAtPoint = zapElementAtPoint;
    state.startPicker = startPicker;
    state.quitPicker = quitPicker;
    state.showDialog = showDialog;
    state.epickerLog = epickerLog;
    state.onViewportChanged = onViewportChanged;
}

export { startPicker, quitPicker, showDialog, highlightElementAtPoint, filterElementAtPoint, zapElementAtPoint };

/******************************************************************************/
