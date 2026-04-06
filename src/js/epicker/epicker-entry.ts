/*******************************************************************************

    uBlock Origin - Element Picker Module
    Entry Point

    Main entry point that wires all epicker modules together and handles
    the bootstrap process.

*******************************************************************************/

import { initUtilities } from './00-utilities.js';
import { initFilterEngine } from './01-filter-engine.js';
import { initHighlighter, setPickerFramePort } from './02-highlighter.js';
import { initDOMInterface, filterToDOMInterface } from './03-dom-interface.js';
import { initSession, startPicker, quitPicker, showDialog, highlightElementAtPoint, filterElementAtPoint, zapElementAtPoint } from './04-session.js';
import { initMessageHandler, onDialogMessage } from './05-message-handler.js';

interface VAPI {
    messaging: {
        send(channel: string, message: object): Promise<unknown>;
    };
    mouseClick?: { x: number; y: number };
    domFilterer: unknown;
    noSpecificCosmeticFiltering: boolean;
    randomToken(): string;
    shutdown: { add(callback: () => void): void; remove(callback: () => void): void };
    userStylesheet: {
        add(css: string, now?: boolean): void;
        remove(css: string, now?: boolean): void;
        apply(callback?: () => void): void;
    };
    epickerStyleProxies?: Map<string, string>;
    hideStyle: string;
    pickerFrame: boolean | null;
}

declare const vAPI: VAPI;

const debugLog = function(source: string, ...args: unknown[]): void {
};

const getNoCosmeticFiltering = (): boolean => {
    if ( epickerState.pickerBootArgs && epickerState.pickerBootArgs.zap === true ) { return false; }
    return vAPI.domFilterer instanceof Object === false ||
           vAPI.noSpecificCosmeticFiltering === true;
};

interface EpickerState {
    netFilterCandidates: string[];
    cosmeticFilterCandidates: string[];
    targetElements: Element[];
    candidateElements: Element[];
    bestCandidateFilter: { filters: string[]; slot?: number } | null;
    lastNetFilterSession: string;
    lastNetFilterHostname: string;
    lastNetFilterUnion: string;
    pickerUniqueId: string;
    pickerBootArgs: { pickerURL?: string; zap?: boolean; eprom?: { lastNetFilterSession?: string; lastNetFilterHostname?: string; lastNetFilterUnion?: string } } | null;
    pickerFrame: HTMLElement | null;
    pickerFramePort: MessagePort | null;
    filtersFrom: (x: number, y: number, first?: Element) => number;
    netFilterFromElement: (elem: Element) => void;
    cosmeticFilterFromElement: (elem: Element) => number;
    resourceURLsFromElement: (elem: Element) => string[];
    filterTypes: string[];
    hideBackgroundStyle: string;
    reCosmeticAnchor: RegExp;
    highlightElements: (elems: Element[], force?: boolean) => void;
    filterToDOMInterface: typeof filterToDOMInterface;
    elementFromPoint: (x: number, y: number) => Element | null;
    highlightElementAtPoint: (mx: number, my: number) => void;
    filterElementAtPoint: (mx: number, my: number, broad?: boolean) => void;
    zapElementAtPoint: (mx: number, my: number, options?: object) => void;
    startPicker: () => void;
    quitPicker: () => void;
    showDialog: (options?: object) => void;
    epickerLog: { getLog(): string; clear(): void };
    onViewportChanged: () => void;
    onDialogMessage: (msg: object) => void;
    onOptimizeCandidates: (details: { candidates: string[][]; slot?: number }) => void;
}

const epickerState: EpickerState = {
    netFilterCandidates: [],
    cosmeticFilterCandidates: [],
    targetElements: [],
    candidateElements: [],
    bestCandidateFilter: null,
    lastNetFilterSession: window.location.host + window.location.pathname,
    lastNetFilterHostname: '',
    lastNetFilterUnion: '',
    pickerUniqueId: '',
    pickerBootArgs: null,
    pickerFrame: null,
    pickerFramePort: null,
    filtersFrom: () => 0,
    netFilterFromElement: () => {},
    cosmeticFilterFromElement: () => 0,
    resourceURLsFromElement: () => [],
    filterTypes: [],
    hideBackgroundStyle: '',
    reCosmeticAnchor: /^/,
    highlightElements: () => {},
    filterToDOMInterface: filterToDOMInterface,
    elementFromPoint: () => null,
    highlightElementAtPoint: () => {},
    filterElementAtPoint: () => {},
    zapElementAtPoint: () => {},
    startPicker: () => {},
    quitPicker: () => {},
    showDialog: () => {},
    epickerLog: { getLog: () => '', clear: () => {} },
    onViewportChanged: () => {},
    onDialogMessage: () => {},
    onOptimizeCandidates: () => {},
};

let pickerFrame: HTMLElement | null = null;
let pickerFramePort: MessagePort | null = null;
let pickerCSS = '';

const applyPickerCSS = function(): void {
    vAPI.userStylesheet.add(pickerCSS);
    vAPI.userStylesheet.apply();
};

const bootstrap = async (): Promise<HTMLElement | undefined> => {
    console.log('[EPICKER] bootstrap() called');

    try {
        epickerState.pickerBootArgs = await vAPI.messaging.send('elementPicker', {
            what: 'elementPickerArguments',
        }) as EpickerState['pickerBootArgs'];
        console.log('[EPICKER] Got pickerBootArgs:', epickerState.pickerBootArgs);
    } catch (e) {
        console.log('[EPICKER] ERROR getting pickerBootArgs:', e);
        return;
    }

    if ( typeof epickerState.pickerBootArgs !== 'object' ) {
        console.log('[EPICKER] pickerBootArgs is not an object');
        return;
    }
    if ( epickerState.pickerBootArgs === null ) {
        console.log('[EPICKER] pickerBootArgs is null');
        return;
    }

    const eprom = epickerState.pickerBootArgs.eprom || null;
    if ( eprom !== null && eprom.lastNetFilterSession === epickerState.lastNetFilterSession ) {
        epickerState.lastNetFilterHostname = eprom.lastNetFilterHostname || '';
        epickerState.lastNetFilterUnion = eprom.lastNetFilterUnion || '';
    }

    const url = new URL(epickerState.pickerBootArgs.pickerURL || '');
    if ( epickerState.pickerBootArgs.zap ) {
        url.searchParams.set('zap', '1');
    }

    return new Promise(resolve => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute(epickerState.pickerUniqueId, '');

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

        iframe.addEventListener('load', () => {
            console.log('[EPICKER] Iframe LOADED successfully');
            iframe.setAttribute(`${epickerState.pickerUniqueId}-loaded`, '');

            const channel = new MessageChannel();
            pickerFramePort = channel.port1;
            pickerFramePort.onmessage = ev => {
                onDialogMessage(ev.data || {});
            };
            pickerFramePort.onmessageerror = () => {
                console.log('[EPICKER] MessageChannel error!');
                quitPicker();
            };

            setPickerFramePort(pickerFramePort);

            iframe.contentWindow!.postMessage(
                { what: 'epickerStart' },
                url.href,
                [ channel.port2 ]
            );
            resolve(iframe);
        }, { once: true });

        iframe.addEventListener('error', (e) => {
            console.log('[EPICKER] Iframe ERROR:', e);
        });

        iframe.contentWindow!.location = url.href;
    });
};

function initialize(): void {
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

    epickerState.pickerUniqueId = vAPI.randomToken();

    const pickerCSSStyle = [
        'background: transparent',
        'border: 0',
        'border-radius: 0',
        'box-shadow: none',
        'color-scheme: light dark',
        'display: block',
        'filter: none',
        'height: 100vh',
        'height: 100svh',
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

    initUtilities(epickerState as unknown as Parameters<typeof initUtilities>[0]);

    initFilterEngine(epickerState as unknown as Parameters<typeof initFilterEngine>[0], {
        safeQuerySelectorAll: epickerState.safeQuerySelectorAll as Parameters<typeof initFilterEngine>[1]['safeQuerySelectorAll'],
        getPageDocument: epickerState.getPageDocument as Parameters<typeof initFilterEngine>[1]['getPageDocument'],
        debugLog: epickerState.debugLog as Parameters<typeof initFilterEngine>[1]['debugLog'],
        elementFromPoint: null,
        pickerFrame: null,
    });

    initHighlighter(epickerState as unknown as Parameters<typeof initHighlighter>[0], {
        getPageDocument: epickerState.getPageDocument as Parameters<typeof initHighlighter>[1]['getPageDocument'],
        getElementBoundingClientRect: epickerState.getElementBoundingClientRect as Parameters<typeof initHighlighter>[1]['getElementBoundingClientRect'],
        debugLog: epickerState.debugLog as Parameters<typeof initHighlighter>[1]['debugLog'],
        pickerFrame: null,
        pickerFramePort: null,
    });

    initDOMInterface(epickerState as unknown as Parameters<typeof initDOMInterface>[0], {
        getPageDocument: epickerState.getPageDocument as Parameters<typeof initDOMInterface>[1]['getPageDocument'],
        pickerFrame: null,
        vAPI: vAPI as unknown as Parameters<typeof initDOMInterface>[1]['vAPI'],
    });

    initSession(epickerState as unknown as Parameters<typeof initSession>[0], {
        highlightElements: epickerState.highlightElements as Parameters<typeof initSession>[1]['highlightElements'],
        filterToDOMInterface: epickerState.filterToDOMInterface as Parameters<typeof initSession>[1]['filterToDOMInterface'],
        pickerFrame: null,
        pickerFramePort: null,
        pickerCSS: pickerCSS,
        vAPI: vAPI as unknown as Parameters<typeof initSession>[1]['vAPI'],
        debugLog: epickerState.debugLog as Parameters<typeof initSession>[1]['debugLog'],
        resourceURLsFromElement: epickerState.resourceURLsFromElement as Parameters<typeof initSession>[1]['resourceURLsFromElement'],
        getPageDocument: epickerState.getPageDocument as Parameters<typeof initSession>[1]['getPageDocument'],
    });

    initMessageHandler(epickerState as unknown as Parameters<typeof initMessageHandler>[0], {
        highlightElements: epickerState.highlightElements as Parameters<typeof initMessageHandler>[1]['highlightElements'],
        filterToDOMInterface: epickerState.filterToDOMInterface as Parameters<typeof initMessageHandler>[1]['filterToDOMInterface'],
        startPicker: epickerState.startPicker as Parameters<typeof initMessageHandler>[1]['startPicker'],
        quitPicker: epickerState.quitPicker as Parameters<typeof initMessageHandler>[1]['quitPicker'],
        highlightElementAtPoint: epickerState.highlightElementAtPoint as Parameters<typeof initMessageHandler>[1]['highlightElementAtPoint'],
        filterElementAtPoint: epickerState.filterElementAtPoint as Parameters<typeof initMessageHandler>[1]['filterElementAtPoint'],
        zapElementAtPoint: epickerState.zapElementAtPoint as Parameters<typeof initMessageHandler>[1]['zapElementAtPoint'],
        epickerLog: epickerState.epickerLog as Parameters<typeof initMessageHandler>[1]['epickerLog'],
        pickerFramePort: null,
        getPageDocument: epickerState.getPageDocument as Parameters<typeof initMessageHandler>[1]['getPageDocument'],
        debugLog: epickerState.debugLog as Parameters<typeof initMessageHandler>[1]['debugLog'],
    });

    epickerState.elementFromPoint = epickerState.elementFromPoint;
    epickerState.pickerFrame = epickerState.pickerFrame;

    vAPI.shutdown.add(epickerState.quitPicker);
}

async function start(): Promise<void> {
    console.log('[EPICKER] Script starting...');

    initialize();
    applyPickerCSS();

    pickerFrame = await bootstrap() || null;

    console.log('[EPICKER] bootstrap() returned, pickerFrame:', pickerFrame);
    if ( pickerFrame === null ) {
        console.log('[EPICKER] pickerFrame is falsy, calling quitPicker()');
        epickerState.quitPicker();
    }
    console.log('[EPICKER] Script initialization complete');
}

start();

void 0;

/*******************************************************************************

    DO NOT:
    - Remove the following code
    - Add code beyond the following code
    Reason:
    - https://github.com/gorhill/uBlock/pull/3721
    - uBO never uses the return value from injected content scripts

**/

