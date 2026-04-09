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

declare const CodeMirror: any;
declare const chrome: typeof globalThis.chrome;
declare const browser: typeof globalThis.browser | undefined;

type RulesResponse = {
    permanentRules: string[];
    sessionRules: string[];
};

type ModifyRulesetPayload = {
    permanent: boolean;
    toAdd: string;
    toRemove: string;
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

const mergeView = new CodeMirror.MergeView(
    document.querySelector('.codeMirrorMergeContainer'),
    {
        allowEditingOriginals: false,
        connect: 'align',
        inputStyle: 'contenteditable',
        lineNumbers: true,
        lineWrapping: false,
        mode: 'ubo-dynamic-filtering',
        origLeft: '',
        revertButtons: false,
        value: '',
    },
);

const leftEditor = mergeView.leftOriginal();
const rightEditor = mergeView.editor();

let permanentRules: string[] = [];
let sessionRules: string[] = [];
let syncingFromState = false;

const renderRules = () => {
    syncingFromState = true;
    leftEditor.setValue(permanentRules.length === 0 ? '' : `${permanentRules.join('\n')}\n`);
    rightEditor.setValue(sessionRules.length === 0 ? '' : `${sessionRules.join('\n')}\n`);
    rightEditor.clearHistory();
    syncingFromState = false;
    updateButtons();
};

const getEditorRules = (): string[] => normalizeRules(rightEditor.getValue());

const updateButtons = () => {
    const editorRules = getEditorRules();
    const hasUnsavedEditorChanges = JSON.stringify(editorRules) !== JSON.stringify(sessionRules);
    const sessionDiffersFromPermanent = JSON.stringify(sessionRules) !== JSON.stringify(permanentRules);
    setButtonDisabled('#editSaveButton', hasUnsavedEditorChanges === false);
    setButtonDisabled('#commitButton', sessionDiffersFromPermanent === false);
    setButtonDisabled('#revertButton', sessionDiffersFromPermanent === false);
};

const refreshRules = async () => {
    const details = await sendMessage<RulesResponse>('dashboardGetRules');
    permanentRules = Array.isArray(details?.permanentRules) ? details.permanentRules : [];
    sessionRules = Array.isArray(details?.sessionRules) ? details.sessionRules : [];
    renderRules();
};

const modifyRuleset = async (payload: ModifyRulesetPayload) => {
    const details = await sendMessage<RulesResponse>('dashboardModifyRuleset', payload);
    permanentRules = Array.isArray(details?.permanentRules) ? details.permanentRules : [];
    sessionRules = Array.isArray(details?.sessionRules) ? details.sessionRules : [];
    renderRules();
};

const saveEditorToTemporaryRules = async () => {
    const editorRules = getEditorRules();
    const { toAdd, toRemove } = diffRules(sessionRules, editorRules);
    if ( toAdd === '' && toRemove === '' ) { return; }
    await modifyRuleset({
        permanent: false,
        toAdd,
        toRemove,
    });
};

const commitTemporaryRules = async () => {
    const { toAdd, toRemove } = diffRules(permanentRules, sessionRules);
    if ( toAdd === '' && toRemove === '' ) { return; }
    await modifyRuleset({
        permanent: true,
        toAdd,
        toRemove,
    });
};

const revertTemporaryRules = async () => {
    const details = await sendMessage<RulesResponse>('dashboardResetRules');
    permanentRules = Array.isArray(details?.permanentRules) ? details.permanentRules : [];
    sessionRules = Array.isArray(details?.sessionRules) ? details.sessionRules : [];
    renderRules();
};

const exportRules = () => {
    const text = rightEditor.getValue().trim();
    if ( text === '' ) { return; }
    const blob = new Blob([ `${text}\n` ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-rules-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    link.click();
    self.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
};

const importPicker = document.getElementById('importFilePicker') as HTMLInputElement | null;

const importRules = () => {
    importPicker?.click();
};

const handleImportFile = () => {
    const file = importPicker?.files?.[0];
    if ( file === undefined ) { return; }
    const reader = new FileReader();
    reader.onload = () => {
        if ( typeof reader.result !== 'string' ) { return; }
        const merged = normalizeRules([ rightEditor.getValue(), reader.result ].join('\n')).join('\n');
        rightEditor.setValue(merged === '' ? '' : `${merged}\n`);
        updateButtons();
    };
    reader.readAsText(file);
};

document.getElementById('editSaveButton')?.addEventListener('click', () => {
    void saveEditorToTemporaryRules();
});
document.getElementById('commitButton')?.addEventListener('click', () => {
    void commitTemporaryRules();
});
document.getElementById('revertButton')?.addEventListener('click', () => {
    void revertTemporaryRules();
});
document.getElementById('exportButton')?.addEventListener('click', exportRules);
document.getElementById('importButton')?.addEventListener('click', importRules);
importPicker?.addEventListener('change', handleImportFile);

rightEditor.on('changes', () => {
    if ( syncingFromState ) { return; }
    updateButtons();
});

applyThemeClasses();
applyFallbackTranslations();
void refreshRules();
