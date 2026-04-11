/*******************************************************************************

    uBlock Resurrected - a comprehensive, efficient content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

import './codemirror/ubo-dynamic-filtering.js';
import publicSuffixList from '../lib/publicsuffixlist/publicsuffixlist.js';

declare const CodeMirror: any;
declare const chrome: typeof globalThis.chrome;
declare const browser: typeof globalThis.browser | undefined;
declare const diff_match_patch: any;
declare const uBlockDashboard: any;

type RulesResponse = {
    permanentRules: string[];
    sessionRules: string[];
};

type ModifyRulesetPayload = {
    permanent: boolean;
    toAdd: string;
    toRemove: string;
};

type PresentationState = {
    sortType: number;
    isCollapsed: boolean;
    filter: string;
};

type PaneData = {
    doc: any;
    original: string[];
    modified: string[];
};

type ThePanes = {
    orig: PaneData;
    edit: PaneData;
};

const fallbackText = new Map([
    [ 'rulesHint', 'Dynamic filtering rules for the current profile.' ],
    [ 'rulesPermanentHeader', 'Permanent rules' ],
    [ 'rulesTemporaryHeader', 'Temporary rules' ],
    [ 'rulesExport', 'Export' ],
    [ 'rulesRevert', 'Revert' ],
    [ 'rulesCommit', 'Commit' ],
    [ 'rulesImport', 'Import' ],
    [ 'rulesEditSave', 'Apply changes' ],
    [ 'rulesSort', 'Sort' ],
    [ 'rulesSortByType', 'By type' ],
    [ 'rulesSortBySource', 'By source' ],
    [ 'rulesSortByDestination', 'By destination' ],
    [ 'genericMergeViewScrollLock', 'Synchronized scrolling' ],
    [ 'rulesDefaultFileName', 'ublock-my-rules_{{datetime}}.txt' ],
]);

const browserRuntime = typeof browser !== 'undefined' ? browser.runtime : undefined;

const sendMessage = async <T>(topic: string, payload: Record<string, unknown> = {}): Promise<T> => {
    const message = { topic, payload };
    if ( browserRuntime !== undefined ) {
        return await browserRuntime.sendMessage(message) as T;
    }
    return await new Promise<T>((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response: T) => {
            const lastError = chrome.runtime.lastError;
            if ( lastError ) {
                reject(new Error(lastError.message));
                return;
            }
            resolve(response);
        });
    });
};

const normalizeRules = (text: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for ( const rawLine of text.split(/\r?\n/) ) {
        const line = rawLine.trim();
        if ( line === '' || seen.has(line) ) { continue; }
        seen.add(line);
        out.push(line);
    }
    return out;
};

const diffRules = (fromRules: string[], toRules: string[]) => {
    const fromSet = new Set(fromRules);
    const toSet = new Set(toRules);
    const toAdd = toRules.filter(rule => fromSet.has(rule) === false);
    const toRemove = fromRules.filter(rule => toSet.has(rule) === false);
    return {
        toAdd: toAdd.join('\n'),
        toRemove: toRemove.join('\n'),
    };
};

const setButtonDisabled = (selector: string, disabled: boolean) => {
    const button = document.querySelector(selector) as HTMLButtonElement | null;
    if ( button === null ) { return; }
    button.disabled = disabled;
    button.classList.toggle('disabled', disabled);
};

const applyFallbackTranslations = () => {
    for ( const element of document.querySelectorAll<HTMLElement>('[data-i18n]') ) {
        const key = element.dataset.i18n || '';
        const fallback = fallbackText.get(key);
        if ( fallback === undefined ) { continue; }
        if ( element.textContent?.trim() === '' || element.textContent?.trim() === '_' ) {
            element.textContent = fallback;
        }
    }
};

const applyThemeClasses = () => {
    const root = document.documentElement;
    const dark = typeof self.matchMedia === 'function' &&
        self.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', dark === false);
    root.classList.add((navigator.maxTouchPoints || 0) > 0 ? 'mobile' : 'desktop');
    if ( self.matchMedia('(min-resolution: 150dpi)').matches ) {
        root.classList.add('hidpi');
    }
};

const getLocalStorage = async (): Promise<Storage> => {
    return chrome.storage.local;
};

const savePresentationState = async (state: PresentationState) => {
    const storage = await getLocalStorage();
    await storage.set({ dynaRulesPresentationState: state });
};

const loadPresentationState = async (): Promise<PresentationState> => {
    const storage = await getLocalStorage();
    const result = await storage.get('dynaRulesPresentationState');
    return (result.dynaRulesPresentationState as PresentationState) || {
        sortType: 0,
        isCollapsed: false,
        filter: '',
    };
};

const presentationState: PresentationState = {
    sortType: 0,
    isCollapsed: false,
    filter: '',
};

const hostnameToDomainMap = new Map<string, string | null>();

const hostnameFromURI = (uri: string): string => {
    let idx = uri.indexOf('://');
    if ( idx !== -1 ) {
        uri = uri.slice(idx + 3);
    }
    idx = uri.indexOf('/');
    if ( idx !== -1 ) {
        uri = uri.slice(0, idx);
    }
    idx = uri.indexOf(':');
    if ( idx !== -1 ) {
        uri = uri.slice(0, idx);
    }
    return uri;
};

const sortNormalizeHn = (hn: string): string => {
    let domain = hostnameToDomainMap.get(hn);
    if ( domain === undefined ) {
        domain = /(\d|\])$/.test(hn)
            ? hn
            : publicSuffixList.getDomain(hn);
        hostnameToDomainMap.set(hn, domain);
    }
    let normalized = domain || hn;
    if ( hn.length !== (domain?.length || 0) ) {
        const subdomains = hn.slice(0, hn.length - (domain?.length || 0) - 1);
        normalized += '.' + (
            subdomains.includes('.')
                ? subdomains.split('.').reverse().join('.')
                : subdomains
        );
    }
    return normalized;
};

const reSwRule = /^([^/]+): ([^/ ]+) ([^ ]+)/;
const reRule = /^([^ ]+) ([^/ ]+) ([^ ]+ [^ ]+)/;
const reUrlRule = /^([^ ]+) ([^ ]+) ([^ ]+ [^ ]+)/;

const getRuleToken = (rule: string, sortType: number): string => {
    let type = '', srcHn = '', desHn = '', extra = '';
    
    let match = reSwRule.exec(rule);
    if ( match !== null ) {
        type = ' ' + match[1];
        srcHn = sortNormalizeHn(match[2]);
        desHn = srcHn;
        extra = match[3];
    } else if ( (match = reRule.exec(rule)) !== null ) {
        type = '\x10FFFE';
        srcHn = sortNormalizeHn(match[1]);
        desHn = sortNormalizeHn(match[2]);
        extra = match[3];
    } else if ( (match = reUrlRule.exec(rule)) !== null ) {
        type = '\x10FFFF';
        srcHn = sortNormalizeHn(match[1]);
        desHn = sortNormalizeHn(hostnameFromURI(match[2]));
        extra = match[3];
    }

    if ( sortType === 0 ) {
        return `${type} ${srcHn} ${desHn} ${extra}`;
    } else if ( sortType === 1 ) {
        return `${srcHn} ${type} ${desHn} ${extra}`;
    }
    return `${desHn} ${type} ${srcHn} ${extra}`;
};

const sortRules = (rules: string[], sortType: number): string[] => {
    const slots: { rule: string; token: string }[] = [];
    for ( const rule of rules ) {
        slots.push({ rule, token: getRuleToken(rule, sortType) });
    }
    slots.sort((a, b) => a.token.localeCompare(b.token));
    return slots.map(s => s.rule);
};

const filterRules = (rules: string[], filter: string): string[] => {
    if ( filter === '' ) { return rules; }
    return rules.filter(rule => rule.indexOf(filter) !== -1);
};

const collapseRules = (permanentRules: string[], sessionRules: string[], isCollapsed: boolean): { permanent: string[]; session: string[] } => {
    if ( !isCollapsed ) {
        return { permanent: permanentRules, session: sessionRules };
    }

    const differ = getDiffer();
    const diffs = differ.diff_main(
        permanentRules.join('\n'),
        sessionRules.join('\n')
    );

    const ll: string[] = [];
    const rr: string[] = [];
    let lellipsis = false;
    let rellipsis = false;

    for ( let i = 0; i < diffs.length; i++ ) {
        const diff = diffs[i];
        if ( diff[0] === 0 ) {
            lellipsis = rellipsis = true;
            continue;
        }
        if ( diff[0] === -1 ) {
            if ( lellipsis ) {
                ll.push('...');
                if ( rellipsis ) { rr.push('...'); }
                lellipsis = rellipsis = false;
            }
            ll.push(diff[1].trim());
            continue;
        }
        if ( diff[0] === 1 ) {
            if ( rellipsis ) {
                rr.push('...');
                if ( lellipsis ) { ll.push('...'); }
                lellipsis = rellipsis = false;
            }
            rr.push(diff[1].trim());
        }
    }
    if ( lellipsis ) { ll.push('...'); }
    if ( rellipsis ) { rr.push('...'); }

    return { permanent: ll, session: rr };
};

const getDiffer = (() => {
    let differ: any;
    return () => {
        if (differ === undefined) { differ = new diff_match_patch(); }
        return differ;
    };
})();

const mergeView = new CodeMirror.MergeView(
    document.querySelector('.codeMirrorMergeContainer') as HTMLElement,
    {
        allowEditingOriginals: true,
        connect: 'align',
        inputStyle: 'contenteditable',
        lineNumbers: true,
        lineWrapping: false,
        origLeft: '',
        revertButtons: true,
        value: '',
    },
);
mergeView.editor().setOption('styleActiveLine', true);
mergeView.editor().setOption('lineNumbers', false);
mergeView.leftOriginal().setOption('readOnly', 'nocursor');

if (typeof uBlockDashboard !== 'undefined') {
    uBlockDashboard.patchCodeMirrorEditor(mergeView.editor());
}

const thePanes: ThePanes = {
    orig: {
        doc: mergeView.leftOriginal(),
        original: [],
        modified: [],
    },
    edit: {
        doc: mergeView.editor(),
        original: [],
        modified: [],
    },
};

let cleanEditToken = 0;
let cleanEditText = '';

const leftEditor = mergeView.leftOriginal();
const rightEditor = mergeView.editor();

let filterTimeout: number | undefined;

const updateOverlay = (() => {
    let reFilter: RegExp | undefined;
    const mode = {
        token: function(stream: any) {
            if ( reFilter !== undefined ) {
                reFilter.lastIndex = stream.pos;
                let match = reFilter.exec(stream.string);
                if ( match !== null ) {
                    if ( match.index === stream.pos ) {
                        stream.pos += match[0].length || 1;
                        return 'searching';
                    }
                    stream.pos = match.index;
                    return;
                }
            }
            stream.skipToEnd();
        }
    };
    return () => {
        const f = presentationState.filter;
        reFilter = typeof f === 'string' && f !== ''
            ? new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
            : undefined;
        return mode;
    };
})();

const toggleOverlay = (() => {
    let overlay: any = null;

    return () => {
        if ( overlay !== null ) {
            mergeView.leftOriginal().removeOverlay(overlay);
            mergeView.editor().removeOverlay(overlay);
            overlay = null;
        }
        if ( presentationState.filter !== '' ) {
            overlay = updateOverlay();
            mergeView.leftOriginal().addOverlay(overlay);
            mergeView.editor().addOverlay(overlay);
        }
        rulesToDoc(true);
        savePresentationState(presentationState);
    };
})();

const rulesToDoc = (clearHistory: boolean) => {
    const orig = thePanes.orig.doc;
    const edit = thePanes.edit.doc;
    orig.startOperation();
    edit.startOperation();

    for ( const key in thePanes ) {
        if ( Object.hasOwn(thePanes, key) === false ) { continue; }
        const keyStr = key as keyof ThePanes;
        const doc = thePanes[keyStr].doc;
        const rules = filterRules(thePanes[keyStr].modified, presentationState.filter);
        if (
            clearHistory ||
            doc.lineCount() === 1 && doc.getValue() === '' ||
            rules.length === 0
        ) {
            doc.setValue(rules.length !== 0 ? rules.join('\n') + '\n' : '');
            continue;
        }
        let beforeText = doc.getValue();
        let afterText = rules.join('\n').trim();
        if ( afterText !== '' ) { afterText += '\n'; }
        const differ = getDiffer();
        const diffs = differ.diff_main(beforeText, afterText);
        let i = diffs.length;
        let iedit = beforeText.length;
        while ( i-- ) {
            const diff = diffs[i];
            if ( diff[0] === 0 ) {
                iedit -= diff[1].length;
                continue;
            }
            const end = doc.posFromIndex(iedit);
            if ( diff[0] === 1 ) {
                doc.replaceRange(diff[1], end, end);
                continue;
            }
            iedit -= diff[1].length;
            const beg = doc.posFromIndex(iedit);
            doc.replaceRange('', beg, end);
        }
    }

    const marks = edit.getAllMarks();
    for ( const mark of marks ) {
        if ( (mark as any).uboEllipsis !== true ) { continue; }
        mark.clear();
    }
    if ( presentationState.isCollapsed ) {
        for ( let iline = 0, n = edit.lineCount(); iline < n; iline++ ) {
            if ( edit.getLine(iline) !== '...' ) { continue; }
            const mark = edit.markText(
                { line: iline, ch: 0 },
                { line: iline + 1, ch: 0 },
                { atomic: true, readOnly: true }
            );
            (mark as any).uboEllipsis = true;
        }
    }

    orig.endOperation();
    edit.endOperation();
    cleanEditText = mergeView.editor().getValue().trim();
    cleanEditToken = mergeView.editor().changeGeneration();

    if ( clearHistory !== true ) { return; }

    mergeView.editor().clearHistory();
    const chunks = mergeView.leftChunks();
    if ( chunks.length === 0 ) { return; }
    const ldoc = thePanes.orig.doc;
    const { clientHeight } = ldoc.getScrollInfo();
    const line = Math.min(chunks[0].editFrom, chunks[0].origFrom);
    ldoc.setCursor(line, 0);
    ldoc.scrollIntoView(
        { line, ch: 0 },
        (clientHeight - ldoc.defaultTextHeight()) / 2
    );
};

const onPresentationChanged = (clearHistory: boolean = true) => {
    const origPane = thePanes.orig;
    const editPane = thePanes.edit;
    origPane.modified = origPane.original.slice();
    editPane.modified = editPane.original.slice();
    
    {
        const mode = origPane.doc.getMode();
        mode.sortType = presentationState.sortType;
        mode.setHostnameToDomainMap(hostnameToDomainMap);
        mode.setPSL(publicSuffixList);
    }
    {
        const mode = editPane.doc.getMode();
        mode.sortType = presentationState.sortType;
        mode.setHostnameToDomainMap(hostnameToDomainMap);
        mode.setPSL(publicSuffixList);
    }
    
    sortRulesInPlace(origPane.modified, presentationState.sortType);
    sortRulesInPlace(editPane.modified, presentationState.sortType);
    
    if ( presentationState.isCollapsed ) {
        const collapsed = collapseRules(origPane.modified, editPane.modified, true);
        origPane.modified = collapsed.permanent;
        editPane.modified = collapsed.session;
    }
    
    rulesToDoc(clearHistory);
    onTextChanged(clearHistory);
};

const sortRulesInPlace = (rules: string[], sortType: number) => {
    const slots: { rule: string; token: string }[] = [];
    for ( const rule of rules ) {
        slots.push({ rule, token: getRuleToken(rule, sortType) });
    }
    slots.sort((a, b) => a.token.localeCompare(b.token));
    for ( let i = 0; i < rules.length; i++ ) {
        rules[i] = slots[i].rule;
    }
};

const onTextChanged = (() => {
    let timer: number | undefined;

    const process = (details?: any) => {
        timer = undefined;
        const diff = document.getElementById('diff');
        let isClean = mergeView.editor().isClean(cleanEditToken);
        if (
            details === undefined &&
            isClean === false &&
            mergeView.editor().getValue().trim() === cleanEditText
        ) {
            cleanEditToken = mergeView.editor().changeGeneration();
            isClean = true;
        }
        const isDirty = mergeView.leftChunks().length !== 0;
        document.body?.classList.toggle('editing', !isClean);
        diff?.classList.toggle('dirty', isDirty);
        setButtonDisabled('#editSaveButton', isClean);
        setButtonDisabled('#exportButton', isClean === false);
        setButtonDisabled('#importButton', isClean === false);
        setButtonDisabled('#revertButton', isClean === false || isDirty === false);
        setButtonDisabled('#commitButton', isClean === false || isDirty === false);
        const input = document.querySelector('#ruleFilter input') as HTMLInputElement;
        if ( isClean ) {
            input?.removeAttribute('disabled');
            (CodeMirror as any).commands.save = undefined;
        } else {
            input?.setAttribute('disabled', '');
            (CodeMirror as any).commands.save = editSaveHandler;
        }
    };

    return function onTextChanged(now?: boolean) {
        if ( timer !== undefined ) { self.clearTimeout(timer); }
        timer = now ? process() : self.setTimeout(process, 57);
    };
})();

const editSaveHandler = () => {
    const editor = mergeView.editor();
    const editText = editor.getValue().trim();
    if ( editText === cleanEditText ) {
        onTextChanged(true);
        return;
    }
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    const differ = getDiffer();
    const diffs = differ.diff_main(cleanEditText, editText);
    for ( const diff of diffs ) {
        if ( diff[0] === 1 ) {
            toAdd.push(diff[1]);
        } else if ( diff[0] === -1 ) {
            toRemove.push(diff[1]);
        }
    }
    applyDiff(false, toAdd.join(''), toRemove.join(''));
};

const revertAllHandler = () => {
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    const left = mergeView.leftOriginal();
    const edit = mergeView.editor();
    for ( const chunk of mergeView.leftChunks() ) {
        const addedLines = left.getRange(
            { line: chunk.origFrom, ch: 0 },
            { line: chunk.origTo, ch: 0 }
        );
        const removedLines = edit.getRange(
            { line: chunk.editFrom, ch: 0 },
            { line: chunk.editTo, ch: 0 }
        );
        toAdd.push(addedLines.trim());
        toRemove.push(removedLines.trim());
    }
    applyDiff(false, toAdd.join('\n'), toRemove.join('\n'));
};

const commitAllHandler = () => {
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    const left = mergeView.leftOriginal();
    const edit = mergeView.editor();
    for ( const chunk of mergeView.leftChunks() ) {
        const addedLines = edit.getRange(
            { line: chunk.editFrom, ch: 0 },
            { line: chunk.editTo, ch: 0 }
        );
        const removedLines = left.getRange(
            { line: chunk.origFrom, ch: 0 },
            { line: chunk.origTo, ch: 0 }
        );
        toAdd.push(addedLines.trim());
        toRemove.push(removedLines.trim());
    }
    applyDiff(true, toAdd.join('\n'), toRemove.join('\n'));
};

(mergeView as any).options.revertChunk = function(
    mv: any,
    from: any, fromStart: any, fromEnd: any,
    to: any, toStart: any, toEnd: any
) {
    const dir = document.body?.getAttribute('dir');
    if ( dir === 'rtl' ) {
        let tmp = from; from = to; to = tmp;
        tmp = fromStart; fromStart = toStart; toStart = tmp;
        tmp = fromEnd; fromEnd = toEnd; toEnd = tmp;
    }
    if ( typeof fromStart.ch !== 'number' ) { fromStart.ch = 0; }
    if ( fromEnd.ch !== 0 ) { fromEnd.line += 1; }
    const toAdd = from.getRange(
        { line: fromStart.line, ch: 0 },
        { line: fromEnd.line, ch: 0 }
    );
    if ( typeof toStart.ch !== 'number' ) { toStart.ch = 0; }
    if ( toEnd.ch !== 0 ) { toEnd.line += 1; }
    const toRemove = to.getRange(
        { line: toStart.line, ch: 0 },
        { line: toEnd.line, ch: 0 }
    );
    applyDiff(from === mv.editor(), toAdd, toRemove);
};

const applyDiff = async (permanent: boolean, toAdd: string, toRemove: string) => {
    const details = await sendMessage<RulesResponse>('dashboardModifyRuleset', {
        permanent,
        toAdd,
        toRemove,
    });
    thePanes.orig.original = Array.isArray(details?.permanentRules) ? details.permanentRules : [];
    thePanes.edit.original = Array.isArray(details?.sessionRules) ? details.sessionRules : [];
    onPresentationChanged();
};

const exportRules = () => {
    const text = mergeView.leftOriginal().getValue().trim();
    if ( text === '' ) { return; }
    const filename = (fallbackText.get('rulesDefaultFileName') || 'my-rules.txt')
        .replace('{{datetime}}', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'))
        .replace(/ +/g, '_');
    const blob = new Blob([ `${text}\n` ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    self.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
};

const importPicker = document.getElementById('importFilePicker') as HTMLInputElement | null;

const importRules = () => {
    if ( importPicker ) {
        importPicker.value = '';
    }
    importPicker?.click();
};

const handleImportFile = () => {
    const file = importPicker?.files?.[0];
    if ( file === undefined || file.name === '' ) { return; }
    if ( file.type.indexOf('text') !== 0 ) { return; }
    const reader = new FileReader();
    reader.onload = () => {
        if ( typeof reader.result !== 'string' || reader.result === '' ) { return; }
        let result = reader.result;
        const matches = /\[origins-to-destinations\]([^[]+)/.exec(result);
        if ( matches && matches.length === 2 ) {
            result = matches[1].trim()
                .replace(/\|/g, ' ')
                .replace(/\n/g, ' * noop\n');
        }
        applyDiff(false, result, '');
    };
    reader.readAsText(file);
};

const handleFilterInput = () => {
    if ( filterTimeout !== undefined ) {
        self.clearTimeout(filterTimeout);
    }
    filterTimeout = self.setTimeout(() => {
        const filterInput = document.querySelector('#ruleFilter input') as HTMLInputElement;
        const newFilter = filterInput?.value || '';
        if ( filterInput ) {
            filterInput.removeAttribute('disabled');
        }
        presentationState.filter = newFilter;
        savePresentationState(presentationState);
        toggleOverlay();
    }, 300);
};

const handleSortChange = () => {
    const select = document.querySelector('#ruleFilter select') as HTMLSelectElement;
    presentationState.sortType = parseInt(select?.value || '0', 10);
    savePresentationState(presentationState);
    onPresentationChanged(true);
};

const handleCollapseClick = () => {
    const collapseBtn = document.querySelector('#diffCollapse') as HTMLElement;
    presentationState.isCollapsed = !presentationState.isCollapsed;
    collapseBtn?.classList.toggle('active', presentationState.isCollapsed);
    savePresentationState(presentationState);
    onPresentationChanged(true);
};

document.getElementById('editSaveButton')?.addEventListener('click', () => {
    void editSaveHandler();
});
document.getElementById('commitButton')?.addEventListener('click', () => {
    void commitAllHandler();
});
document.getElementById('revertButton')?.addEventListener('click', () => {
    void revertAllHandler();
});
document.getElementById('exportButton')?.addEventListener('click', exportRules);
document.getElementById('importButton')?.addEventListener('click', importRules);
importPicker?.addEventListener('change', handleImportFile);

document.querySelector('#ruleFilter input')?.addEventListener('input', handleFilterInput);
document.querySelector('#ruleFilter select')?.addEventListener('input', handleSortChange);
document.getElementById('diffCollapse')?.addEventListener('click', handleCollapseClick);

rightEditor.on('changes', () => {
    onTextChanged();
});

rightEditor.on('updateDiff', () => {
    onTextChanged();
});

document.addEventListener('keydown', (ev) => {
    if ( (ev.ctrlKey || ev.metaKey) && ev.key === 's' ) {
        ev.preventDefault();
        void editSaveHandler();
    }
});

const initPresentationState = async () => {
    const savedState = await loadPresentationState();
    presentationState.sortType = savedState.sortType;
    presentationState.isCollapsed = savedState.isCollapsed;
    presentationState.filter = savedState.filter;

    const filterInput = document.querySelector('#ruleFilter input') as HTMLInputElement;
    if ( filterInput ) {
        filterInput.value = savedState.filter;
    }

    const sortSelect = document.querySelector('#ruleFilter select') as HTMLSelectElement;
    if ( sortSelect ) {
        sortSelect.value = savedState.sortType.toString();
    }

    const collapseBtn = document.querySelector('#diffCollapse') as HTMLElement;
    if ( collapseBtn && savedState.isCollapsed ) {
        collapseBtn.classList.add('active');
    }

    if ( savedState.filter !== '' ) {
        toggleOverlay();
    }
};

const cloudPushHandler = () => {
    return thePanes.orig.original.join('\n');
};

const cloudPullHandler = (data: any, append: boolean) => {
    if ( typeof data !== 'string' ) { return; }
    applyDiff(
        false,
        data,
        append ? '' : mergeView.editor().getValue().trim()
    );
};

if (typeof self !== 'undefined') {
    (self as any).cloud = {
        onPush: cloudPushHandler,
        onPull: cloudPullHandler,
    };
    (self as any).wikilink = 'https://github.com/gorhill/uBlock/wiki/Dashboard:-My-rules';
    (self as any).hasUnsavedData = () => {
        return mergeView.editor().isClean(cleanEditToken) === false;
    };
}

applyThemeClasses();
applyFallbackTranslations();
void initPresentationState().then(() => {
    void sendMessage<{permanentRules: string[], sessionRules: string[], pslSelfie?: any}>('dashboardGetRules').then(details => {
        thePanes.orig.original = Array.isArray(details?.permanentRules) ? details.permanentRules : [];
        thePanes.edit.original = Array.isArray(details?.sessionRules) ? details.sessionRules : [];
        if (details?.pslSelfie) {
            publicSuffixList.fromSelfie(details.pslSelfie);
        }
        onPresentationChanged(true);
    });
});