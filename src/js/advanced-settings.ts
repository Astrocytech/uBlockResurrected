/*******************************************************************************

    uBlock Origin - a comprehensive, efficient content blocker
    Copyright (C) 2016-present Raymond Hill

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
import { i18n } from './i18n.js';

/******************************************************************************/

type RawSettings = string | Record<string, string>;

interface AdvancedSettingsDetails {
    default: Record<string, string>;
    admin: Record<string, string>;
    current: Record<string, string>;
}

interface Entry {
    0: string;
    1: string;
}

let defaultSettings = new Map<string, string>();
let adminSettings = new Map<string, string>();
let beforeHash = '';

/******************************************************************************/

CodeMirror.defineMode('raw-settings', function() {
    let lastSetting = '';

    return {
        token: function(stream: CodeMirror.StringStream): string | null {
            if ( stream.sol() ) {
                stream.eatSpace();
                const match = stream.match(/\S+/);
                if ( match !== null && defaultSettings.has(match[0]) ) {
                    lastSetting = match[0];
                    return adminSettings.has(match[0])
                        ? 'readonly keyword'
                        : 'keyword';
                }
                stream.skipToEnd();
                return 'line-cm-error';
            }
            stream.eatSpace();
            const match = stream.match(/.*$/);
            if ( match !== null ) {
                if ( match[0].trim() !== defaultSettings.get(lastSetting) ) {
                    return 'line-cm-strong';
                }
                if ( adminSettings.has(lastSetting) ) {
                    return 'readonly';
                }
            }
            stream.skipToEnd();
            return null;
        }
    };
});

const cmEditor = new CodeMirror(qs$('#advancedSettings'), {
    autofocus: true,
    lineNumbers: true,
    lineWrapping: false,
    styleActiveLine: true
});

uBlockDashboard.patchCodeMirrorEditor(cmEditor);

/******************************************************************************/

const hashFromAdvancedSettings = function(raw: RawSettings): string {
    const aa = typeof raw === 'string'
        ? arrayFromString(raw)
        : arrayFromObject(raw);
    aa.sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify(aa);
};

/******************************************************************************/

const arrayFromObject = function(o: Record<string, string>): Entry[] {
    const out: Entry[] = [];
    for ( const k in o ) {
        if ( Object.hasOwn(o, k) === false ) { continue; }
        out.push([ k, `${o[k]}` ]);
    }
    return out;
};

const arrayFromString = function(s: string): Entry[] {
    const out: Entry[] = [];
    for ( let line of s.split(/[\n\r]+/) ) {
        line = line.trim();
        if ( line === '' ) { continue; }
        const pos = line.indexOf(' ');
        let k: string, v: string;
        if ( pos !== -1 ) {
            k = line.slice(0, pos);
            v = line.slice(pos + 1);
        } else {
            k = line;
            v = '';
        }
        out.push([ k.trim(), v.trim() ]);
    }
    return out;
};

/******************************************************************************/

const advancedSettingsChanged = (() => {
    const handler = (): void => {
        const changed = hashFromAdvancedSettings(cmEditor.getValue()) !== beforeHash;
        qs$('#advancedSettingsApply').disabled = !changed;
        CodeMirror.commands.save = changed ? applyChanges : function(){};
    };

    const timer = vAPI.defer.create(handler);

    return function(): void {
        timer.offon(200);
    };
})();

cmEditor.on('changes', advancedSettingsChanged);

/******************************************************************************/

const renderAdvancedSettings = async function(first: boolean): Promise<void> {
    const details = await vAPI.messaging.send<AdvancedSettingsDetails>('dashboard', {
        what: 'readHiddenSettings',
    });
    defaultSettings = new Map(arrayFromObject(details.default));
    adminSettings = new Map(arrayFromObject(details.admin));
    beforeHash = hashFromAdvancedSettings(details.current);
    const pretty: string[] = [];
    const roLines: number[] = [];
    const entries = arrayFromObject(details.current);
    let max = 0;
    for ( const [ k ] of entries ) {
        if ( k.length > max ) { max = k.length; }
    }
    for ( let i = 0; i < entries.length; i++ ) {
        const [ k, v ] = entries[i];
        pretty.push(' '.repeat(max - k.length) + `${k} ${v}`);
        if ( adminSettings.has(k) ) {
            roLines.push(i);
        }
    }
    pretty.push('');
    cmEditor.setValue(pretty.join('\n'));
    if ( first ) {
        cmEditor.clearHistory();
    }
    for ( const line of roLines ) {
        cmEditor.markText(
            { line, ch: 0 },
            { line: line + 1, ch: 0 },
            { readOnly: true }
        );
    }
    advancedSettingsChanged();
    cmEditor.focus();
};

/******************************************************************************/

const applyChanges = async function(): Promise<void> {
    await vAPI.messaging.send('dashboard', {
        what: 'writeHiddenSettings',
        content: cmEditor.getValue(),
    });
    renderAdvancedSettings(false);
};

/******************************************************************************/

dom.on('#advancedSettings', 'input', advancedSettingsChanged);
dom.on('#advancedSettingsApply', 'click', () => {
    applyChanges();
});

renderAdvancedSettings(true);

/******************************************************************************/