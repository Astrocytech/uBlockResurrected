/*******************************************************************************

    uBlock Resurrected - a comprehensive, efficient content blocker
    Copyright (C) 2014-2018 Raymond Hill

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

/* global CodeMirror, uBlockDashboard */

import { dom, qs$ } from './dom.js';
import { i18n$ } from './i18n.js';
import { µb } from './background.js';

/******************************************************************************/

const reComment = /^\s*#\s*/;

function directiveFromLine(line: string): string {
    const match = reComment.exec(line);
    return match === null
        ? line.trim()
        : line.slice(match.index + match[0].length).trim();
}

/******************************************************************************/

interface WhitelistDetails {
    reBadHostname: string;
    reHostnameExtractor: string;
    whitelistDefault: string[];
    whitelist: string[];
}

interface WhitelistTokenResult {
    token: string | null;
}

CodeMirror.defineMode("ubo-whitelist-directives", function() {
    const reRegex = /^\/.+\/$/;

    return {
        token: function token(stream: CodeMirror.StringStream): string | null {
            const line = stream.string.trim();
            stream.skipToEnd();
            if ( reBadHostname === undefined ) {
                return null;
            }
            if ( reComment.test(line) ) {
                return 'comment';
            }
            if ( line.indexOf('/') === -1 ) {
                if ( reBadHostname.test(line) ) { return 'error'; }
                if ( whitelistDefaultSet.has(line.trim()) ) {
                    return 'keyword';
                }
                return null;
            }
            if ( reRegex.test(line) ) {
                try {
                    new RegExp(line.slice(1, -1));
                } catch {
                    return 'error';
                }
                return null;
            }
            if ( reHostnameExtractor.test(line) === false ) {
                return 'error';
            }
            if ( whitelistDefaultSet.has(line.trim()) ) {
                return 'keyword';
            }
            return null;
        }
    };
});

let reBadHostname: RegExp | undefined;
let reHostnameExtractor: RegExp | undefined;
let whitelistDefaultSet: Set<string> = new Set();

/******************************************************************************/

const messaging = µb.messaging;
const noopFunc = function(): void {};

let cachedWhitelist = '';

const cmEditor = new CodeMirror(qs$('#whitelist') as HTMLElement, {
    autofocus: true,
    lineNumbers: true,
    lineWrapping: true,
    styleActiveLine: true,
});

uBlockDashboard.patchCodeMirrorEditor(cmEditor);

/******************************************************************************/

function getEditorText(): string {
    const text = cmEditor.getValue().trimEnd();
    return text === '' ? text : `${text}\n`;
}

function setEditorText(text: string): void {
    cmEditor.setValue(`${text.trimEnd()}\n`);
}

/******************************************************************************/

function whitelistChanged(): void {
    const whitelistElem = qs$('#whitelist');
    const bad = qs$(whitelistElem, '.cm-error') !== null;
    const changedWhitelist = getEditorText().trim();
    const changed = changedWhitelist !== cachedWhitelist;
    qs$('#whitelistApply').disabled = !changed || bad;
    qs$('#whitelistRevert').disabled = !changed;
    CodeMirror.commands.save = changed && !bad ? applyChanges : noopFunc;
}

cmEditor.on('changes', whitelistChanged);

/******************************************************************************/

async function renderWhitelist(): Promise<void> {
    const details = await messaging.send<WhitelistDetails>('dashboard', {
        what: 'getWhitelist',
    });

    const first = reBadHostname === undefined;
    if ( first ) {
        reBadHostname = new RegExp(details.reBadHostname);
        reHostnameExtractor = new RegExp(details.reHostnameExtractor);
        whitelistDefaultSet = new Set(details.whitelistDefault);
    }
    const toAdd = new Set(whitelistDefaultSet);
    for ( const line of details.whitelist ) {
        const directive = directiveFromLine(line);
        if ( whitelistDefaultSet.has(directive) === false ) { continue; }
        toAdd.delete(directive);
        if ( toAdd.size === 0 ) { break; }
    }
    if ( toAdd.size !== 0 ) {
        details.whitelist.push(...Array.from(toAdd).map(a => `# ${a}`));
    }
    details.whitelist.sort((a, b) => {
        const ad = directiveFromLine(a);
        const bd = directiveFromLine(b);
        const abuiltin = whitelistDefaultSet.has(ad);
        if ( abuiltin !== whitelistDefaultSet.has(bd) ) {
            return abuiltin ? -1 : 1;
        }
        return ad.localeCompare(bd);
    });
    const whitelistStr = details.whitelist.join('\n').trim();
    cachedWhitelist = whitelistStr;
    setEditorText(whitelistStr);
    if ( first ) {
        cmEditor.clearHistory();
    }
}

/******************************************************************************/

function handleImportFilePicker(): void {
    const input = this as HTMLInputElement;
    const file = input.files?.[0];
    if ( file === undefined || file.name === '' ) { return; }
    if ( file.type.indexOf('text') !== 0 ) { return; }
    const fr = new FileReader();
    fr.onload = ev => {
        if ( ev.type !== 'load' ) { return; }
        const content = uBlockDashboard.mergeNewLines(
            getEditorText().trim(),
            fr.result.trim()
        );
        setEditorText(content);
    };
    fr.readAsText(file);
}

/******************************************************************************/

function startImportFilePicker(): void {
    const input = qs$('#importFilePicker') as HTMLInputElement;
    input.value = '';
    input.click();
}

/******************************************************************************/

function exportWhitelistToFile(): void {
    const val = getEditorText();
    if ( val === '' ) { return; }
    const filename =
        i18n$('whitelistExportFilename')
            .replace('{{datetime}}', uBlockDashboard.dateNowToSensibleString())
            .replace(/ +/g, '_');
    vAPI.download({
        'url': `data:text/plain;charset=utf-8,${encodeURIComponent(val + '\n')}`,
        'filename': filename
    });
}

/******************************************************************************/

async function applyChanges(): Promise<void> {
    cachedWhitelist = getEditorText().trim();
    await messaging.send('dashboard', {
        what: 'setWhitelist',
        whitelist: cachedWhitelist,
    });
    renderWhitelist();
}

function revertChanges(): void {
    setEditorText(cachedWhitelist);
}

/******************************************************************************/

function getCloudData(): string {
    return getEditorText();
}

function setCloudData(data: unknown, append?: boolean): void {
    if ( typeof data !== 'string' ) { return; }
    if ( append ) {
        data = uBlockDashboard.mergeNewLines(getEditorText().trim(), data as string);
    }
    setEditorText((data as string).trim());
}

self.cloud.onPush = getCloudData;
self.cloud.onPull = setCloudData;

/******************************************************************************/

self.wikilink = 'https://github.com/gorhill/uBlock/wiki/Dashboard:-Trusted-sites';

self.hasUnsavedData = function(): boolean {
    return getEditorText().trim() !== cachedWhitelist;
};

/******************************************************************************/

dom.on('#importWhitelistFromFile', 'click', startImportFilePicker);
dom.on('#importFilePicker', 'change', handleImportFilePicker);
dom.on('#exportWhitelistToFile', 'click', exportWhitelistToFile);
dom.on('#whitelistApply', 'click', ( ) => { applyChanges(); });
dom.on('#whitelistRevert', 'click', revertChanges);

renderWhitelist();

/******************************************************************************/
