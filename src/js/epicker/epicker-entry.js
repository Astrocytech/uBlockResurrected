/*******************************************************************************

    uBlock Origin - Element Picker Module
    Entry Point

    Main entry point that wires all epicker modules together and handles
    the bootstrap process.

*******************************************************************************/

import { initUtilities } from './00-utilities.js';
import { initFilterEngine } from './01-filter-engine.js';
import { initHighlighter, setPickerFramePort } from './02-highlighter.js';
import { initDOMInterface } from './03-dom-interface.js';
import { initSession } from './04-session.js';
import { initMessageHandler } from './05-message-handler.js';

/**
 * Debug logging
 */
var debugLog = function(source) {
    // Disabled in production - enable for debugging only
    // var args = Array.prototype.slice.call(arguments).slice(1);
    // console.log('[EPICKER]', '[' + source + ']', args.join(' '));
};

/**
 * Check if cosmetic filtering should be disabled
 * @returns {boolean}
 */
const getNoCosmeticFiltering = ( ) => {
    if ( epickerState.pickerBootArgs && epickerState.pickerBootArgs.zap === true ) { return false; }
    return vAPI.domFilterer instanceof Object === false ||
           vAPI.noSpecificCosmeticFiltering === true;
};

// Shared state object
const epickerState = {
    netFilterCandidates: [],
    cosmeticFilterCandidates: [],
    targetElements: [],
    candidateElements: [],
    bestCandidateFilter: null,
    lastNetFilterSession: window.location.host + window.location.pathname,
    lastNetFilterHostname: '',
    lastNetFilterUnion: '',
    pickerUniqueId: null,
    pickerBootArgs: null,
    pickerFrame: null,
    pickerFramePort: null,
};

// Module references
let pickerFrame;
let pickerFramePort = null;
let vAPI;
let pickerCSS;

/**
 * Apply picker CSS
 */
const applyPickerCSS = function() {
    vAPI.userStylesheet.add(pickerCSS);
    vAPI.userStylesheet.apply();
};

/**
 * Bootstrap the element picker
 */
const bootstrap = async ( ) => {
    console.log('[EPICKER] bootstrap() called');
    debugLog('entry', 'bootstrap starting');
    
    try {
        console.log('[EPICKER] Sending elementPickerArguments request...');
        epickerState.pickerBootArgs = await vAPI.messaging.send('elementPicker', {
            what: 'elementPickerArguments',
        });
        console.log('[EPICKER] Got pickerBootArgs:', epickerState.pickerBootArgs);
    } catch (e) {
        console.log('[EPICKER] ERROR getting pickerBootArgs:', e);
        debugLog('entry', 'error getting pickerBootArgs:', e);
        return;
    }
    
    if ( typeof epickerState.pickerBootArgs !== 'object' ) { 
        console.log('[EPICKER] pickerBootArgs is not an object, type:', typeof epickerState.pickerBootArgs);
        debugLog('entry', 'pickerBootArgs not an object');
        return; 
    }
    if ( epickerState.pickerBootArgs === null ) { 
        console.log('[EPICKER] pickerBootArgs is null');
        debugLog('entry', 'pickerBootArgs is null');
        return; 
    }
    
    // Restore net filter union data if origin is the same.
    const eprom = epickerState.pickerBootArgs.eprom || null;
    if ( eprom !== null && eprom.lastNetFilterSession === epickerState.lastNetFilterSession ) {
        epickerState.lastNetFilterHostname = eprom.lastNetFilterHostname || '';
        epickerState.lastNetFilterUnion = eprom.lastNetFilterUnion || '';
    }
    
    const url = new URL(epickerState.pickerBootArgs.pickerURL);
    if ( epickerState.pickerBootArgs.zap ) {
        url.searchParams.set('zap', '1');
    }
    
    return new Promise(resolve => {
        var iframe = document.createElement('iframe');
        iframe.setAttribute(epickerState.pickerUniqueId, '');
        
        // Force the iframe to be fullscreen
        iframe.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100vw',
            'height: 100vh',
            'height: 100dvh',
            'border: none',
            'z-index: 2147483647',
            'background: transparent',
            'pointer-events: auto'
        ].join(' !important; ');
        
        console.log('[EPICKER] Creating iframe with URL:', url.href);
        document.documentElement.appendChild(iframe);
        
        iframe.addEventListener('load', ( ) => {
            console.log('[EPICKER] Iframe LOADED successfully');
            iframe.setAttribute(`${epickerState.pickerUniqueId}-loaded`, '');
            debugLog('entry', 'iframe loaded, setting visibility to visible');
            
            const channel = new MessageChannel();
            pickerFramePort = channel.port1;
            pickerFramePort.onmessage = ev => {
                onDialogMessage(ev.data || {});
            };
            pickerFramePort.onmessageerror = ( ) => {
                console.log('[EPICKER] MessageChannel error!');
                quitPicker();
            };
            
            // Update highlighter with port reference
            setPickerFramePort(pickerFramePort);
            
            console.log('[EPICKER] Sending epickerStart message with MessageChannel port');
            iframe.contentWindow.postMessage(
                { what: 'epickerStart' },
                url.href,
                [ channel.port2 ]
            );
            console.log('[EPICKER] epickerStart sent, resolving bootstrap');
            resolve(iframe);
        }, { once: true });

        iframe.addEventListener('error', (e) => {
            console.log('[EPICKER] Iframe ERROR:', e);
        });
        
        console.log('[EPICKER] Setting iframe location to:', url.href);
        iframe.contentWindow.location = url.href;
        console.log('[EPICKER] Location set, waiting for load...');
    });
};

/**
 * Initialize all modules and wire them together
 */
function initialize() {
    // Validate vAPI
    if ( typeof vAPI !== 'object' ) { 
        debugLog('entry', 'vAPI is not an object');
        return; 
    }
    if ( vAPI === null ) { 
        debugLog('entry', 'vAPI is null');
        return; 
    }

    if ( vAPI.pickerFrame ) { return; }
    vAPI.pickerFrame = true;

    // Generate unique ID for this picker session
    epickerState.pickerUniqueId = vAPI.randomToken();
    
    // Initialize picker CSS
    const pickerCSSStyle = [
        'background: transparent',
        'border: 0',
        'border-radius: 0',
        'box-shadow: none',
        'color-scheme: light dark',
        'display: block',
        'filter: none',
        'height: 100vh',
        '    height: 100svh',
        'left: 0',
        'margin: 0',
        'max-height: none',
        'max-width: none',
        'min-height: unset',
        'min-width: unset',
        'opacity: 1',
        'outline: 0',
        'padding: 0',
        'pointer-events: auto',
        'position: fixed',
        'top: 0',
        'transform: none',
        'visibility: hidden',
        'width: 100%',
        'z-index: 2147483647',
        ''
    ].join(' !important;\n');

    pickerCSS = `
:root > [${epickerState.pickerUniqueId}] {
    ${pickerCSSStyle}
}
:root > [${epickerState.pickerUniqueId}-loaded] {
    visibility: visible !important;
}
:root [${epickerState.pickerUniqueId}-clickblind] {
    pointer-events: none !important;
}
`;

    // Initialize utilities module
    initUtilities(epickerState);
    
    // Filter engine exports
    const filterEngineExports = {};
    initFilterEngine(epickerState, {
        safeQuerySelectorAll: epickerState.safeQuerySelectorAll,
        getPageDocument: epickerState.getPageDocument,
        debugLog: epickerState.debugLog,
        elementFromPoint: null,
        pickerFrame: null,
    });
    
    // Highlighter exports
    initHighlighter(epickerState, {
        getPageDocument: epickerState.getPageDocument,
        getElementBoundingClientRect: epickerState.getElementBoundingClientRect,
        debugLog: epickerState.debugLog,
        pickerFrame: null,
        pickerFramePort: null,
    });
    
    // DOM interface exports
    initDOMInterface(epickerState, {
        getPageDocument: epickerState.getPageDocument,
        pickerFrame: null,
        vAPI: vAPI,
    });
    
    // Session exports
    initSession(epickerState, {
        highlightElements: epickerState.highlightElements,
        filterToDOMInterface: epickerState.filterToDOMInterface,
        pickerFrame: null,
        pickerFramePort: null,
        pickerCSS: pickerCSS,
        vAPI: vAPI,
        debugLog: epickerState.debugLog,
        resourceURLsFromElement: epickerState.resourceURLsFromElement,
        getPageDocument: epickerState.getPageDocument,
    });
    
    // Message handler exports
    initMessageHandler(epickerState, {
        highlightElements: epickerState.highlightElements,
        filterToDOMInterface: epickerState.filterToDOMInterface,
        startPicker: epickerState.startPicker,
        quitPicker: epickerState.quitPicker,
        highlightElementAtPoint: epickerState.highlightElementAtPoint,
        filterElementAtPoint: epickerState.filterElementAtPoint,
        zapElementAtPoint: epickerState.zapElementAtPoint,
        epickerLog: epickerState.epickerLog,
        pickerFramePort: null,
        getPageDocument: epickerState.getPageDocument,
        debugLog: epickerState.debugLog,
    });
    
    // Update filter engine with elementFromPoint and pickerFrame references
    epickerState.elementFromPoint = epickerState.elementFromPoint;
    epickerState.pickerFrame = epickerState.pickerFrame;
    
    // Add quitPicker to shutdown handlers
    vAPI.shutdown.add(epickerState.quitPicker);
}

/**
 * Start the element picker
 */
async function start() {
    console.log('[EPICKER] Script starting...');
    
    initialize();
    applyPickerCSS();
    
    pickerFrame = await bootstrap();
    
    console.log('[EPICKER] bootstrap() returned, pickerFrame:', pickerFrame);
    if ( Boolean(pickerFrame) === false ) {
        console.log('[EPICKER] pickerFrame is falsy, calling quitPicker()');
        epickerState.quitPicker();
    }
    console.log('[EPICKER] Script initialization complete');
}

// Start the picker
start();

/*******************************************************************************

    DO NOT:
    - Remove the following code
    - Add code beyond the following code
    Reason:
    - https://github.com/gorhill/uBlock/pull/3721
    - uBO never uses the return value from injected content scripts

**/

void 0;
