/*******************************************************************************

    uBlock Resurrected - Element Picker Module
    Highlighter

    SVG-based element highlighting system for the element picker.

*******************************************************************************/

interface EpickerState {
    targetElements: Element[];
    pickerUniqueId: string;
}

interface EpickerDeps {
    getPageDocument: () => Document;
    getElementBoundingClientRect: (elem: Element) => DOMRect;
    debugLog: (source: string, ...args: unknown[]) => void;
    pickerFrame: HTMLElement | null;
    pickerFramePort: MessagePort | null;
}

let epickerState: EpickerState;
let getPageDocument: () => Document;
let getElementBoundingClientRect: (elem: Element) => DOMRect;
let debugLog: (source: string, ...args: unknown[]) => void;
let pickerFrame: HTMLElement | null;
let pickerFramePort: MessagePort | null;

const highlightElements = function(elems: Element[], force?: boolean): void {
    if (
        (force !== true) &&
        (elems.length === epickerState.targetElements.length) &&
        (elems.length === 0 || elems[0] === epickerState.targetElements[0])
    ) {
        return;
    }
    epickerState.targetElements = [];

    const pageDoc = getPageDocument();
    const pageWin = pageDoc.defaultView || window;
    const ow = pageWin.innerWidth;
    const oh = pageWin.innerHeight;

    const islands: string[] = [];

    for ( const elem of elems ) {
        if ( elem === pickerFrame ) { continue; }
        epickerState.targetElements.push(elem);
        const rect = getElementBoundingClientRect(elem);

        if (
            rect.left > ow || rect.top > oh ||
            rect.left + rect.width < 0 || rect.top + rect.height < 0
        ) {
            continue;
        }

        if (rect.width === 0 || rect.height === 0) {
            continue;
        }

        const path = `M${rect.left} ${rect.top}h${rect.width}v${rect.height}h-${rect.width}z`;
        islands.push(path);
    }

    if (!pickerFramePort) {
        return;
    }

    pickerFramePort.postMessage({
        what: 'svgPaths',
        ocean: `M0 0h${ow}v${oh}h-${ow}z`,
        islands: islands.join(''),
    });
};

export function initHighlighter(state: EpickerState, deps: EpickerDeps): void {
    epickerState = state;
    getPageDocument = deps.getPageDocument;
    getElementBoundingClientRect = deps.getElementBoundingClientRect;
    debugLog = deps.debugLog;
    pickerFrame = deps.pickerFrame;
    pickerFramePort = deps.pickerFramePort;

    state.highlightElements = highlightElements;
}

export function setPickerFramePort(port: MessagePort): void {
    pickerFramePort = port;
}

/******************************************************************************/
