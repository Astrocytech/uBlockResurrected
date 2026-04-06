/*******************************************************************************

    uBlock Origin - Element Picker Module
    Utilities

    Basic utility functions shared across all epicker modules.

*******************************************************************************/

interface DebugLog {
    (source: string, ...args: unknown[]): void;
}

interface EpickerState {
    safeQuerySelectorAll: (node: Node | null, selector: string) => NodeListOf<Element>;
    getElementBoundingClientRect: (elem: Element) => DOMRect;
    getPageDocument: () => Document;
    getPageCoordinates: (ev: MouseEvent) => { x: number; y: number };
    debugLog: DebugLog;
}

interface EpickerUtilities {
    safeQuerySelectorAll(node: Node | null, selector: string): NodeListOf<Element>;
    getElementBoundingClientRect(elem: Element): DOMRect;
    getPageDocument(): Document;
    getPageCoordinates(ev: MouseEvent): { x: number; y: number };
    debugLog: DebugLog;
}

const debugLog: DebugLog = function(source) {
};

const safeQuerySelectorAll = function(node: Node | null, selector: string): NodeListOf<Element> {
    if ( node !== null ) {
        try {
            return node.querySelectorAll(selector);
        } catch {
        }
    }
    return document.createDocumentFragment().querySelectorAll(selector);
};

const getElementBoundingClientRect = function(elem: Element): DOMRect {
    if ( typeof elem.getBoundingClientRect !== 'function' ) {
        return { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    const rect = elem.getBoundingClientRect();
    return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        x: rect.x,
        y: rect.y,
        toJSON: rect.toJSON,
    };
};

const getPageDocument = function(): Document {
    return self.document;
};

const getPageCoordinates = function(ev: MouseEvent): { x: number; y: number } {
    const x = typeof ev.pageX === 'number' ? ev.pageX : ev.clientX;
    const y = typeof ev.pageY === 'number' ? ev.pageY : ev.clientY;
    return { x: x, y: y };
};

export function initUtilities(epickerState: EpickerState): void {
    epickerState.safeQuerySelectorAll = safeQuerySelectorAll;
    epickerState.getElementBoundingClientRect = getElementBoundingClientRect;
    epickerState.getPageDocument = getPageDocument;
    epickerState.getPageCoordinates = getPageCoordinates;
    epickerState.debugLog = debugLog;
}

export type { EpickerUtilities, DebugLog };

/******************************************************************************/
