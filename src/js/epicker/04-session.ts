/*******************************************************************************

    uBlock Origin - Element Picker Module
    Session Management

    Handles picker lifecycle, event handlers, and element lookup.

*******************************************************************************/

interface EpickerState {
    pickerUniqueId: string;
    pickerBootArgs: { zap?: boolean };
    targetElements: Element[];
    bestCandidateFilter: { filters: string[]; slot?: number } | null;
    netFilterCandidates: string[];
    cosmeticFilterCandidates: string[];
    filtersFrom: (x: number, y: number, first?: Element) => number;
    highlightElements: (elems: Element[], force?: boolean) => void;
    filterToDOMInterface: {
        preview(state: unknown, permanent?: boolean): void;
        queryAll(details: { filter: string; compiled?: string }): unknown[];
    };
    elementFromPoint: (x: number, y: number) => Element | null;
    highlightElementAtPoint: (mx: number, my: number) => void;
    filterElementAtPoint: (mx: number, my: number, broad?: boolean) => void;
    zapElementAtPoint: (mx: number, my: number, options?: object) => void;
    startPicker: () => void;
    quitPicker: () => void;
    showDialog: (options?: object) => void;
    epickerLog: {
        getLog(): string;
        clear(): void;
    };
    onViewportChanged: () => void;
}

interface EpickerDeps {
    highlightElements: (elems: Element[], force?: boolean) => void;
    filterToDOMInterface: EpickerState['filterToDOMInterface'];
    pickerFrame: HTMLElement | null;
    pickerFramePort: MessagePort | null;
    pickerCSS: string;
    vAPI: {
        mouseClick?: { x: number; y: number };
        shutdown: { remove(callback: () => void): void };
        userStylesheet: {
            remove(css: string, now?: boolean): void;
            apply(callback?: () => void): void;
        };
        pickerFrame?: boolean;
    };
    debugLog: (source: string, ...args: unknown[]) => void;
    resourceURLsFromElement: (elem: Element) => string[];
    getPageDocument: () => Document;
}

let epickerState: EpickerState;
let highlightElements: (elems: Element[], force?: boolean) => void;
let filterToDOMInterface: EpickerState['filterToDOMInterface'];
let pickerFrame: HTMLElement | null;
let pickerFramePort: MessagePort | null;
let pickerCSS: string;
let vAPI: EpickerDeps['vAPI'];
let debugLog: (source: string, ...args: unknown[]) => void;
let resourceURLsFromElement: (elem: Element) => string[];
let getPageDocument: () => Document;
let elementFromPoint: (x: number, y: number) => Element | null;

const epickerLog = {
    getLog(): string { return ''; },
    clear(): void {}
};

const elementFromPointFunc = (function() {
    let lastX: number | undefined;
    let lastY: number | undefined;
    let pickerFrameRef: HTMLElement | null = null;

    return function(x: number, y: number): Element | null {
        if ( x !== undefined ) {
            lastX = x; lastY = y;
        }

        let frame: HTMLElement | null = null;

        if (pickerFrame) {
            frame = pickerFrame;
            pickerFrameRef = frame;
        }

        if ( !frame ) {
            const pageDoc = getPageDocument();
            const iframes = pageDoc.querySelectorAll('iframe');
            for ( let i = 0; i < iframes.length; i++ ) {
                const iframe = iframes[i];
                if ( iframe.hasAttribute && iframe.hasAttribute(epickerState.pickerUniqueId) ) {
                    frame = iframe as HTMLElement;
                    pickerFrameRef = frame;
                    break;
                }
            }
        }

        if ( !frame ) {
            const pageDoc = getPageDocument();
            const elem = pageDoc.elementFromPoint(x, y);
            return elem as Element | null;
        }

        const pageDoc = getPageDocument();
        const magicAttr = epickerState.pickerUniqueId + '-clickblind';
        frame.setAttribute(magicAttr, '');

        const oldPointerEvents = frame.style.getPropertyValue('pointer-events');
        const oldPointerEventsPriority = frame.style.getPropertyPriority('pointer-events');
        frame.style.setProperty('pointer-events', 'none', 'important');

        const elems = pageDoc.elementsFromPoint(x, y);
        let elem: Element | null = null;
        for ( let i = 0; i < elems.length; i++ ) {
            if ( elems[i] === frame ) { continue; }
            const e = elems[i] as Element;
            if ( e.hasAttribute && e.hasAttribute(epickerState.pickerUniqueId) ) { continue; }
            elem = e;
            break;
        }

        if (oldPointerEvents) {
            frame.style.setProperty('pointer-events', oldPointerEvents, oldPointerEventsPriority);
        } else {
            frame.style.removeProperty('pointer-events');
        }

        const getNoCosmeticFiltering = (): boolean => {
            if ( epickerState.pickerBootArgs && epickerState.pickerBootArgs.zap === true ) { return false; }
            return vAPI.domFilterer instanceof Object === false ||
                   vAPI.noSpecificCosmeticFiltering === true;
        };

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
        return elem;
    };
})();

const highlightElementAtPoint = function(mx: number, my: number): void {
    const elem = elementFromPointFunc(mx, my);
    highlightElements(elem ? [ elem ] : []);
};

const filterElementAtPoint = function(mx: number, my: number, broad?: boolean): void {
    if ( epickerState.filtersFrom(mx, my) === 0 ) { return; }
    showDialog({ broad });
};

const zapElementAtPoint = function(mx: number, my: number, options: { highlight?: boolean; stay?: boolean } = {}): void {
    if ( options.highlight ) {
        const elem = elementFromPointFunc(mx, my);
        if ( elem ) {
            highlightElements([ elem ]);
        }
        return;
    }

    let elemToRemove = epickerState.targetElements.length !== 0 && epickerState.targetElements[0] || null;
    if ( elemToRemove === null && mx !== undefined ) {
        elemToRemove = elementFromPointFunc(mx, my);
    }

    if ( elemToRemove instanceof Element === false ) {
        return;
    }

    epickerState.filtersFrom(mx, my);

    let filterToSave: string | null = null;
    if (epickerState.bestCandidateFilter && epickerState.bestCandidateFilter.filters && epickerState.bestCandidateFilter.filters.length > 0) {
        const slot = epickerState.bestCandidateFilter.slot !== undefined ? epickerState.bestCandidateFilter.slot : epickerState.bestCandidateFilter.filters.length - 1;
        filterToSave = epickerState.bestCandidateFilter.filters[slot];
    } else if (epickerState.cosmeticFilterCandidates.length > 0) {
        filterToSave = epickerState.cosmeticFilterCandidates[epickerState.cosmeticFilterCandidates.length - 1];
    } else if (epickerState.netFilterCandidates.length > 0) {
        filterToSave = epickerState.netFilterCandidates[0];
    }

    if (!filterToSave) {
        return;
    }

    const getStyleValue = (elem: Element, prop: string): string => {
        const style = window.getComputedStyle(elem);
        return style ? String(style.getPropertyValue(prop)) : '';
    };

    let maybeScrollLocked = elemToRemove.shadowRoot instanceof DocumentFragment;
    if ( maybeScrollLocked === false ) {
        let elem = elemToRemove;
        do {
            maybeScrollLocked =
                parseInt(getStyleValue(elem, 'zIndex'), 10) >= 1000 ||
                getStyleValue(elem, 'position') === 'fixed';
            elem = elem.parentElement!;
        } while ( elem !== null && maybeScrollLocked === false );
    }
    if ( maybeScrollLocked ) {
        const doc = document;
        if ( getStyleValue(doc.body as Element, 'overflowY') === 'hidden' ) {
            doc.body.style.setProperty('overflow', 'auto', 'important');
        }
        if ( getStyleValue(doc.body as Element, 'position') === 'fixed' ) {
            doc.body.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'position') === 'fixed' ) {
            doc.documentElement.style.setProperty('position', 'initial', 'important');
        }
        if ( getStyleValue(doc.documentElement, 'overflowY') === 'hidden' ) {
            doc.documentElement.style.setProperty('overflow', 'auto', 'important');
        }
    }

    elemToRemove.remove();

    if (pickerFramePort) {
        pickerFramePort.postMessage({
            what: 'saveFilterFromZapper',
            filter: filterToSave,
            docURL: self.location.href,
        });
    }

    if (pickerFramePort && options.stay !== true) {
        pickerFramePort.postMessage({
            what: 'dialogCreate',
            filter: filterToSave,
        });
    }

    highlightElementAtPoint(mx, my);
};

const onKeyPressed = function(ev: KeyboardEvent): void {
    if (
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        epickerState.pickerBootArgs.zap
    ) {
        ev.stopPropagation();
        ev.preventDefault();
        zapElementAtPoint(0, 0, {});
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

const onViewportChanged = function(): void {
    highlightElements(epickerState.targetElements, true);
};

const startPicker = function(): void {
    if (pickerFrame) {
        pickerFrame.focus();
    }

    self.addEventListener('scroll', onViewportChanged, { passive: true });
    self.addEventListener('resize', onViewportChanged, { passive: true });
    self.addEventListener('keydown', onKeyPressed, true);
    self.addEventListener('click', function(ev: MouseEvent) {
        if (vAPI.mouseClick instanceof Object && vAPI.mouseClick.x >= 0) {
            if ( epickerState.filtersFrom(vAPI.mouseClick.x, vAPI.mouseClick.y) !== 0 ) {
                showDialog();
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
        if ( epickerState.filtersFrom(vAPI.mouseClick.x, vAPI.mouseClick.y) !== 0 ) {
            return showDialog();
        }
    }
};

const quitPicker = function(): void {
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

const showDialog = function(options?: object): void {
    if (!pickerFramePort) {
        return;
    }

    let selectedFilter = '';
    if (epickerState.bestCandidateFilter && epickerState.bestCandidateFilter.filters && epickerState.bestCandidateFilter.filters.length > 0) {
        const slot = epickerState.bestCandidateFilter.slot || 0;
        selectedFilter = epickerState.bestCandidateFilter.filters[slot] || epickerState.bestCandidateFilter.filters[epickerState.bestCandidateFilter.filters.length - 1];
    }

    pickerFramePort.postMessage({
        what: 'showDialog',
        url: self.location.href,
        netFilters: epickerState.netFilterCandidates,
        cosmeticFilters: epickerState.cosmeticFilterCandidates,
        filter: epickerState.bestCandidateFilter,
        options,
    });
};

export function initSession(state: EpickerState, deps: EpickerDeps): void {
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
    elementFromPoint = elementFromPointFunc;

    state.elementFromPoint = elementFromPointFunc;
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
