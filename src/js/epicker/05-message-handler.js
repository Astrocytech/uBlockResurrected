/*******************************************************************************

    uBlock Origin - Element Picker Module
    Message Handler

    Handles message routing between epicker and epicker-ui.

*******************************************************************************/

/**
 * Handle optimize candidates request
 * @param {Object} details - Candidate details
 */
const onOptimizeCandidates = function(details) {
    const { candidates } = details;
    const results = [];
    const pageDoc = getPageDocument();
    for ( const paths of candidates ) {
        let count = Number.MAX_SAFE_INTEGER;
        let selector = '';
        for ( let i = 0, n = paths.length; i < n; i++ ) {
            const s = paths.slice(n - i - 1).join('');
            const elems = pageDoc.querySelectorAll(s);
            if ( elems.length < count ) {
                selector = s;
                count = elems.length;
            }
        }
        results.push({ selector: `##${selector}`, count });
    }
    results.sort((a, b) => {
        const r = b.count - a.count;
        if ( r !== 0 ) { return r; }
        return a.selector.length - b.selector.length;
    });

    pickerFramePort.postMessage({
        what: 'candidatesOptimized',
        candidates: results.map(a => a.selector),
        slot: details.slot,
    });
};

/**
 * Main message handler - routes messages from epicker-ui
 * @param {Object} msg - Message object
 */
const onDialogMessage = function(msg) {
    switch ( msg.what ) {
    case 'getLog':
        if (pickerFramePort) {
            pickerFramePort.postMessage({
                what: 'logContent',
                log: epickerLog.getLog()
            });
        }
        break;
    case 'start':
        startPicker();
        if ( pickerFramePort === null ) { break; }
        if ( epickerState.targetElements.length === 0 ) {
            highlightElements([], true);
        }
        break;
    case 'optimizeCandidates':
        onOptimizeCandidates(msg);
        break;
    case 'dialogCreate':
        debugLog('message', 'dialogCreate: calling queryAll and preview');
        filterToDOMInterface.queryAll(msg);
        filterToDOMInterface.preview(true, true);
        if (msg.stay !== true) {
            debugLog('message', 'dialogCreate: calling quitPicker');
            quitPicker();
        } else {
            debugLog('message', 'dialogCreate: staying in zapper mode (stay=true)');
        }
        break;
    case 'dialogSetFilter': {
        const resultset = filterToDOMInterface.queryAll(msg) || [];
        highlightElements(resultset.map(a => a.elem), true);
        if ( msg.filter === '!' ) { break; }
        pickerFramePort.postMessage({
            what: 'resultsetDetails',
            count: resultset.length,
            opt: resultset.length !== 0 ? resultset[0].opt : undefined,
        });
        break;
    }
    case 'quitPicker':
        filterToDOMInterface.preview(false);
        quitPicker();
        break;
    case 'highlightElementAtPoint':
        debugLog('message', 'highlightElementAtPoint received:', msg.mx, msg.my);
        highlightElementAtPoint(msg.mx, msg.my);
        break;
    case 'unhighlight':
        highlightElements([]);
        break;
    case 'filterElementAtPoint':
        filterElementAtPoint(msg.mx, msg.my, msg.broad);
        break;
    case 'zapElementAtPoint':
        console.log('[EPICKER] Received zapElementAtPoint - mx:', msg.mx, 'my:', msg.my, 'options:', msg.options);
        debugLog('message', 'Received zapElementAtPoint - mx:', msg.mx, 'my:', msg.my, 'options:', msg.options);
        zapElementAtPoint(msg.mx, msg.my, msg.options);
        if ( msg.options.highlight !== true && msg.options.stay !== true ) {
            quitPicker();
        }
        break;
    case 'togglePreview':
        filterToDOMInterface.preview(msg.state);
        if ( msg.state === false ) {
            highlightElements(epickerState.targetElements, true);
        }
        break;
    default:
        break;
    }
};

// Module-level references
let epickerState;
let highlightElements;
let filterToDOMInterface;
let startPicker;
let quitPicker;
let highlightElementAtPoint;
let filterElementAtPoint;
let zapElementAtPoint;
let epickerLog;
let pickerFramePort;
let getPageDocument;
let debugLog;

/**
 * Initialize message handler module
 * @param {Object} state - Shared epicker state
 * @param {Object} deps - Dependencies
 */
export function initMessageHandler(state, deps) {
    epickerState = state;
    highlightElements = deps.highlightElements;
    filterToDOMInterface = deps.filterToDOMInterface;
    startPicker = deps.startPicker;
    quitPicker = deps.quitPicker;
    highlightElementAtPoint = deps.highlightElementAtPoint;
    filterElementAtPoint = deps.filterElementAtPoint;
    zapElementAtPoint = deps.zapElementAtPoint;
    epickerLog = deps.epickerLog;
    pickerFramePort = deps.pickerFramePort;
    getPageDocument = deps.getPageDocument;
    debugLog = deps.debugLog;
    
    state.onDialogMessage = onDialogMessage;
    state.onOptimizeCandidates = onOptimizeCandidates;
}

export { onDialogMessage };

/******************************************************************************/
