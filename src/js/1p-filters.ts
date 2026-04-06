/*******************************************************************************

    uBlock Origin - a comprehensive, efficient content blocker
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

import './codemirror/ubo-static-filtering.js';
import { dom, qs$ } from './dom.js';
import { i18n$ } from './i18n.js';
import { onBroadcast } from './broadcast.js';
import µb from './background.js';

/******************************************************************************/

interface EditorState {
    enabled: boolean;
    trusted: boolean;
    filters: string;
}

interface UserFiltersDetails {
    changed?: boolean;
    enabled?: boolean;
    trusted?: boolean;
    content?: string;
    error?: string;
}

interface AutoCompleteDetails {
    hintUpdateToken?: number;
}

interface CloudDataHandler {
    onPush: () => string;
    onPull: (data: string, append?: boolean) => void;
}

interface DiffMatchPatch {
    diff: (text1: string[], text2: string[]) => Array<[number, string]>;
}

declare const CodeMirror: any;
declare const vAPI: any;
declare const uBlockDashboard: any;
declare const self: any;

/******************************************************************************/

const cmEditor = new CodeMirror(qs$('#userFilters'), {
    autoCloseBrackets: true,
    autofocus: true,
    extraKeys: {
        'Ctrl-Space': 'autocomplete',
        'Tab': 'toggleComment',
    },
    foldGutter: true,
    gutters: [
        'CodeMirror-linenumbers',
        { className: 'CodeMirror-lintgutter', style: 'width: 11px' },
    ],
    lineNumbers: true,
    lineWrapping: true,
    matchBrackets: true,
    maxScanLines: 1,
    styleActiveLine: {
        nonEmpty: true,
    },
});

uBlockDashboard.patchCodeMirrorEditor(cmEditor);

/******************************************************************************/

{
    let hintUpdateToken = 0;

    const getHints = async function(): Promise<void> {
        const hints = await vAPI.messaging.send('dashboard', {
            what: 'getAutoCompleteDetails',
            hintUpdateToken
        }) as AutoCompleteDetails | undefined;
        if ( hints instanceof Object === false ) { return; }
        if ( hints.hintUpdateToken !== undefined ) {
            cmEditor.setOption('uboHints', hints);
            hintUpdateToken = hints.hintUpdateToken;
        }
        timer.on(2503);
    };

    const timer = vAPI.defer.create(( ) => {
        getHints();
    });

    getHints();
}

vAPI.messaging.send('dashboard', {
    what: 'getTrustedScriptletTokens',
}).then((tokens: string[]) => {
    cmEditor.setOption('trustedScriptletTokens', tokens);
});

/******************************************************************************/

let originalState: EditorState = {
    enabled: true,
    trusted: false,
    filters: '',
};

function getCurrentState(): EditorState {
    const enabled = qs$('#enableMyFilters input').checked;
    return {
        enabled,
        trusted: qs$('#trustMyFilters input').checked,
        filters: getEditorText(),
    };
}

function rememberCurrentState(): void {
    originalState = getCurrentState();
}

function currentStateChanged(): boolean {
    return JSON.stringify(getCurrentState()) !== JSON.stringify(originalState);
}

function getEditorText(): string {
    const text = cmEditor.getValue().trimEnd();
    return text === '' ? text : `${text}\n`;
}

function setEditorText(text: string): void {
    cmEditor.setValue(`${text.trimEnd()}\n\n`);
}

/******************************************************************************/

function userFiltersChanged(details: UserFiltersDetails = {}): void {
    const changed = typeof details.changed === 'boolean'
        ? details.changed
        : self.hasUnsavedData();
    qs$('#userFiltersApply').disabled = !changed;
    qs$('#userFiltersRevert').disabled = !changed;
    const enabled = qs$('#enableMyFilters input').checked;
    const trustedbefore = cmEditor.getOption('trustedSource');
    const trustedAfter = enabled && qs$('#trustMyFilters input').checked;
    if ( trustedAfter === trustedbefore ) { return; }
    cmEditor.startOperation();
    cmEditor.setOption('trustedSource', trustedAfter);
    const doc = cmEditor.getDoc();
    const history = doc.getHistory();
    const selections = doc.listSelections();
    doc.replaceRange(doc.getValue(),
        { line: 0, ch: 0 },
        { line: doc.lineCount(), ch: 0 }
    );
    doc.setSelections(selections);
    doc.setHistory(history);
    cmEditor.endOperation();
    cmEditor.focus();
}

/******************************************************************************/

function threeWayMerge(newContent: string): string {
    const prvContent = originalState.filters.trim().split(/\n/);
    const differ = new self.diff_match_patch() as DiffMatchPatch;
    const newChanges = differ.diff(
        prvContent,
        newContent.trim().split(/\n/)
    );
    const usrChanges = differ.diff(
        prvContent,
        getEditorText().trim().split(/\n/)
    );
    const out: string[] = [];
    let i = 0, j = 0, k = 0;
    while ( i < prvContent.length ) {
        for ( ; j < newChanges.length; j++ ) {
            const change = newChanges[j];
            if ( change[0] !== 1 ) { break; }
            out.push(change[1]);
        }
        for ( ; k < usrChanges.length; k++ ) {
            const change = usrChanges[k];
            if ( change[0] !== 1 ) { break; }
            out.push(change[1]);
        }
        if ( k === usrChanges.length || usrChanges[k][0] !== -1 ) {
            out.push(prvContent[i]);
        }
        i += 1; j += 1; k += 1;
    }
    for ( ; j < newChanges.length; j++ ) {
        const change = newChanges[j];
        if ( change[0] !== 1 ) { continue; }
        out.push(change[1]);
    }
    for ( ; k < usrChanges.length; k++ ) {
        const change = usrChanges[k];
        if ( change[0] !== 1 ) { continue; }
        out.push(change[1]);
    }
    return out.join('\n');
}

/******************************************************************************/

async function renderUserFilters(): Promise<void> {
    const details = await vAPI.messaging.send('dashboard', {
        what: 'readUserFilters',
    }) as UserFiltersDetails | undefined;
    if ( details instanceof Object === false || details.error ) { return; }

    cmEditor.setOption('trustedSource', details.trusted);

    qs$('#enableMyFilters input').checked = details.enabled;
    qs$('#trustMyFilters input').checked = details.trusted;

    setEditorText(details.content?.trim() || '');
    userFiltersChanged({ changed: false });

    rememberCurrentState();
}

/******************************************************************************/

function handleImportFilePicker(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    const file = target.files?.[0];
    if ( file === undefined || file.name === '' ) { return; }
    if ( file.type.indexOf('text') !== 0 ) { return; }
    const fr = new FileReader();
    fr.onload = function() {
        if ( typeof fr.result !== 'string' ) { return; }
        const content = uBlockDashboard.mergeNewLines(getEditorText(), fr.result);
        cmEditor.operation(( ) => {
            const cmPos = cmEditor.getCursor();
            setEditorText(content);
            cmEditor.setCursor(cmPos);
            cmEditor.focus();
        });
    };
    fr.readAsText(file);
}

dom.on('#importFilePicker', 'change', handleImportFilePicker);

function startImportFilePicker(): void {
    const input = qs$('#importFilePicker') as HTMLInputElement;
    input.value = '';
    input.click();
}

dom.on('#importUserFiltersFromFile', 'click', startImportFilePicker);

/******************************************************************************/

function exportUserFiltersToFile(): void {
    const val = getEditorText();
    if ( val === '' ) { return; }
    const filename = i18n$('1pExportFilename')
        .replace('{{datetime}}', uBlockDashboard.dateNowToSensibleString())
        .replace(/ +/g, '_');
    vAPI.download({
        'url': `data:text/plain;charset=utf-8,${encodeURIComponent(val)}`,
        'filename': filename
    });
}

/******************************************************************************/

async function applyChanges(): Promise<void> {
    const state = getCurrentState();
    const details = await vAPI.messaging.send('dashboard', {
        what: 'writeUserFilters',
        content: state.filters,
        enabled: state.enabled,
        trusted: state.trusted,
    }) as UserFiltersDetails | undefined;
    if ( details instanceof Object === false || details.error ) { return; }
    rememberCurrentState();
    userFiltersChanged({ changed: false });
    vAPI.messaging.send('dashboard', {
        what: 'reloadAllFilters',
    });
}

function revertChanges(): void {
    qs$('#enableMyFilters input').checked = originalState.enabled;
    qs$('#trustMyFilters input').checked = originalState.trusted;
    setEditorText(originalState.filters);
    userFiltersChanged();
}

/******************************************************************************/

function getCloudData(): string {
    return getEditorText();
}

function setCloudData(data: unknown, append?: boolean): void {
    if ( typeof data !== 'string' ) { return; }
    if ( append ) {
        data = uBlockDashboard.mergeNewLines(getEditorText(), data as string);
    }
    cmEditor.setValue(data as string);
}

(self.cloud as CloudDataHandler).onPush = getCloudData;
(self.cloud as CloudDataHandler).onPull = setCloudData;

/******************************************************************************/

self.wikilink = 'https://github.com/gorhill/uBlock/wiki/Dashboard:-My-filters';

self.hasUnsavedData = function(): boolean {
    return currentStateChanged();
};

/******************************************************************************/

dom.on('#exportUserFiltersToFile', 'click', exportUserFiltersToFile);
dom.on('#userFiltersApply', 'click', ( ) => { applyChanges(); });
dom.on('#userFiltersRevert', 'click', revertChanges);
dom.on('#enableMyFilters input', 'change', userFiltersChanged);
dom.on('#trustMyFilters input', 'change', userFiltersChanged);

(async ( ) => {
    await renderUserFilters();

    cmEditor.clearHistory();

    // https://github.com/gorhill/uBlock/issues/3706
    //   Save/restore cursor position
    {
        const line = await vAPI.localStorage.getItemAsync('myFiltersCursorPosition') as number | undefined;
        if ( typeof line === 'number' ) {
            cmEditor.setCursor(line, 0);
        }
        cmEditor.focus();
    }

    // https://github.com/gorhill/uBlock/issues/3706
    //   Save/restore cursor position
    {
        let curline = 0;
        cmEditor.on('cursorActivity', ( ) => {
            if ( timer.ongoing() ) { return; }
            if ( cmEditor.getCursor().line === curline ) { return; }
            timer.on(701);
        });
        const timer = vAPI.defer.create(( ) => {
            curline = cmEditor.getCursor().line;
            vAPI.localStorage.setItem('myFiltersCursorPosition', curline);
        });
    }

    // https://github.com/gorhill/uBlock/issues/3704
    //   Merge changes to user filters occurring in the background
    onBroadcast((msg: { what: string }) => {
        switch ( msg.what ) {
        case 'userFiltersUpdated': {
            cmEditor.startOperation();
            const scroll = cmEditor.getScrollInfo();
            const selections = cmEditor.listSelections();
            const shouldMerge = self.hasUnsavedData();
            const beforeContent = getEditorText();
            renderUserFilters().then(( ) => {
                if ( shouldMerge ) {
                    setEditorText(threeWayMerge(beforeContent));
                    userFiltersChanged({ changed: true });
                }
                cmEditor.clearHistory();
                cmEditor.setSelection(selections[0].anchor, selections[0].head);
                cmEditor.scrollTo(scroll.left, scroll.top);
                cmEditor.endOperation();
            });
            break;
        }
        default:
            break;
        }
    });
})();

cmEditor.on('changes', userFiltersChanged);
CodeMirror.commands.save = applyChanges;

/******************************************************************************/
