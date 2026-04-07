/*******************************************************************************

    uBlock Resurrected - Element Picker Module
    Message Handler

    Handles message routing between epicker and epicker-ui.

*******************************************************************************/

interface EpickerState {
    targetElements: Element[];
    onDialogMessage: (msg: object) => void;
    onOptimizeCandidates: (details: { candidates: string[][]; slot?: number }) => void;
}

interface EpickerDeps {
    highlightElements: (elems: Element[], force?: boolean) => void;
    filterToDOMInterface: {
        preview(state: unknown, permanent?: boolean): void;
        queryAll(details: { filter: string; compiled?: string }): { elem: Element; opt?: string }[];
    };
    startPicker: () => void;
    quitPicker: () => void;
    highlightElementAtPoint: (mx: number, my: number) => void;
    filterElementAtPoint: (mx: number, my: number, broad?: boolean) => void;
    zapElementAtPoint: (mx: number, my: number, options?: object) => void;
    epickerLog: { getLog(): string };
    pickerFramePort: MessagePort | null;
    getPageDocument: () => Document;
    debugLog: (source: string, ...args: unknown[]) => void;
}

let epickerState: EpickerState;
let highlightElements: (elems: Element[], force?: boolean) => void;
let filterToDOMInterface: EpickerDeps['filterToDOMInterface'];
let startPicker: () => void;
let quitPicker: () => void;
let highlightElementAtPoint: (mx: number, my: number) => void;
let filterElementAtPoint: (mx: number, my: number, broad?: boolean) => void;
let zapElementAtPoint: (mx: number, my: number, options?: object) => void;
let epickerLog: { getLog(): string };
let pickerFramePort: MessagePort | null;
let getPageDocument: () => Document;
let debugLog: (source: string, ...args: unknown[]) => void;

const onOptimizeCandidates = function(details: { candidates: string[][]; slot?: number }): void {
    const { candidates } = details;
    const results: { selector: string; count: number }[] = [];
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

    pickerFramePort!.postMessage({
        what: 'candidatesOptimized',
        candidates: results.map(a => a.selector),
        slot: details.slot,
    });
};

interface DialogMessage {
    what: string;
    mx?: number;
    my?: number;
    broad?: boolean;
    options?: { highlight?: boolean; stay?: boolean };
    state?: boolean;
    filter?: string;
    compiled?: string;
    stay?: boolean;
}

const onDialogMessage = function(msg: DialogMessage): void {
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
        onOptimizeCandidates(msg as DialogMessage & { candidates: string[][]; slot?: number });
        break;
    case 'dialogCreate':
        filterToDOMInterface.queryAll(msg);
        filterToDOMInterface.preview(true, true);
        if (msg.stay !== true) {
            quitPicker();
        }
        break;
    case 'dialogSetFilter': {
        const resultset = filterToDOMInterface.queryAll(msg) || [];
        highlightElements(resultset.map(a => a.elem), true);
        if ( msg.filter === '!' ) { break; }
        pickerFramePort!.postMessage({
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
        highlightElementAtPoint(msg.mx!, msg.my!);
        break;
    case 'unhighlight':
        highlightElements([]);
        break;
    case 'filterElementAtPoint':
        filterElementAtPoint(msg.mx!, msg.my!, msg.broad);
        break;
    case 'zapElementAtPoint':
        zapElementAtPoint(msg.mx!, msg.my!, msg.options);
        if ( msg.options?.highlight !== true && msg.options?.stay !== true ) {
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

export function initMessageHandler(state: EpickerState, deps: EpickerDeps): void {
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
