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

******************************************************************************/

declare const CodeMirror: any;
declare const chrome: typeof globalThis.chrome;
declare const browser: typeof globalThis.browser | undefined;
declare const uBlockDashboard: any;

interface WhitelistDetails {
    reBadHostname: string;
    reHostnameExtractor: string;
    whitelistDefault: string[];
    whitelist: string[];
}

const fallbackText = new Map([
    [ 'whitelistApply', 'Apply changes' ],
    [ 'genericRevert', 'Revert' ],
    [ 'whitelistImport', 'Import' ],
    [ 'whitelistExport', 'Export' ],
    [ 'whitelistPrompt', 'Enter Whitelist directives, one per line. Directives added here will take precedence over any other whitelist rule.' ],
    [ 'whitelistExportFilename', 'ublock-whitelist_{{datetime}}.txt' ],
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

const reComment = /^\s*#\s*/;

const directiveFromLine = (line: string): string => {
    const match = reComment.exec(line);
    return match === null
        ? line.trim()
        : line.slice(match.index + match[0].length).trim();
};

let reBadHostname: RegExp | undefined;
let reHostnameExtractor: RegExp | undefined;
let whitelistDefaultSet: Set<string> = new Set();

CodeMirror.defineMode('ubo-whitelist-directives', function() {
    const reRegex = /^\/.+\/$/;

    return {
        token: function(stream: any) {
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
            if ( reHostnameExtractor?.test(line) === false ) {
                return 'error';
            }
            if ( whitelistDefaultSet.has(line.trim()) ) {
                return 'keyword';
            }
            return null;
        }
    };
});

const cmEditor = new CodeMirror(
    document.querySelector('#whitelist') as HTMLElement,
    {
        autofocus: true,
        lineNumbers: true,
        lineWrapping: true,
        styleActiveLine: true,
        mode: 'ubo-whitelist-directives',
    },
);

if (typeof uBlockDashboard !== 'undefined') {
    uBlockDashboard.patchCodeMirrorEditor(cmEditor);
}

const noopFunc = (): void => {};

let cachedWhitelist = '';

const getEditorText = (): string => {
    const text = cmEditor.getValue().trimEnd();
    return text === '' ? text : `${text}\n`;
};

const setEditorText = (text: string): void => {
    cmEditor.setValue(`${text.trimEnd()}\n`);
};

const whitelistChanged = () => {
    const whitelistElem = document.querySelector('#whitelist');
    const bad = whitelistElem?.querySelector('.cm-error') !== null;
    const changedWhitelist = getEditorText().trim();
    const changed = changedWhitelist !== cachedWhitelist;
    const applyBtn = document.querySelector('#whitelistApply') as HTMLButtonElement;
    const revertBtn = document.querySelector('#whitelistRevert') as HTMLButtonElement;
    if (applyBtn) applyBtn.disabled = !changed || bad;
    if (revertBtn) revertBtn.disabled = !changed;
    (CodeMirror as any).commands.save = changed && !bad ? applyChanges : noopFunc;
};

cmEditor.on('changes', whitelistChanged);

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

const renderWhitelist = async () => {
    const details = await sendMessage<WhitelistDetails>('getWhitelist');
    if (!details) { return; }

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
        details.whitelist.push(...Array.from(toAdd).map((a: string) => `# ${a}`));
    }
    details.whitelist.sort((a: string, b: string) => {
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
};

const importPicker = document.getElementById('importFilePicker') as HTMLInputElement | null;

const handleImportFile = () => {
    const file = importPicker?.files?.[0];
    if ( file === undefined || file.name === '' ) { return; }
    if ( file.type.indexOf('text') !== 0 ) { return; }
    const reader = new FileReader();
    reader.onload = () => {
        if ( typeof reader.result !== 'string' || reader.result === '' ) { return; }
        const content = typeof uBlockDashboard !== 'undefined' && typeof uBlockDashboard.mergeNewLines === 'function'
            ? uBlockDashboard.mergeNewLines(getEditorText().trim(), reader.result.trim())
            : (getEditorText().trim() + '\n' + reader.result.trim()).trim();
        setEditorText(content);
    };
    reader.readAsText(file);
};

const startImportFilePicker = () => {
    if ( importPicker ) {
        importPicker.value = '';
    }
    importPicker?.click();
};

const exportWhitelist = () => {
    const val = getEditorText();
    if ( val === '' ) { return; }
    const filename = (fallbackText.get('whitelistExportFilename') || 'whitelist.txt')
        .replace('{{datetime}}', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'))
        .replace(/ +/g, '_');
    const blob = new Blob([ `${val}\n` ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    self.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
};

const applyChanges = async () => {
    cachedWhitelist = getEditorText().trim();
    await sendMessage('setWhitelist', { whitelist: cachedWhitelist });
    void renderWhitelist();
};

const revertChanges = () => {
    setEditorText(cachedWhitelist);
};

const getCloudData = (): string => {
    return getEditorText();
};

const setCloudData = (data: any, append?: boolean) => {
    if ( typeof data !== 'string' ) { return; }
    if ( append ) {
        data = typeof uBlockDashboard !== 'undefined' && typeof uBlockDashboard.mergeNewLines === 'function'
            ? uBlockDashboard.mergeNewLines(getEditorText().trim(), data)
            : getEditorText().trim() + '\n' + data;
    }
    setEditorText(data.trim());
};

if (typeof self !== 'undefined') {
    (self as any).cloud = {
        onPush: getCloudData,
        onPull: setCloudData,
    };
    (self as any).wikilink = 'https://github.com/gorhill/uBlock/wiki/Dashboard:-Trusted-sites';
    (self as any).hasUnsavedData = () => {
        return getEditorText().trim() !== cachedWhitelist;
    };
}

document.getElementById('importWhitelistFromFile')?.addEventListener('click', startImportFilePicker);
importPicker?.addEventListener('change', handleImportFile);
document.getElementById('exportWhitelistToFile')?.addEventListener('click', exportWhitelist);
document.getElementById('whitelistApply')?.addEventListener('click', () => { void applyChanges(); });
document.getElementById('whitelistRevert')?.addEventListener('click', revertChanges);

applyThemeClasses();
applyFallbackTranslations();
void renderWhitelist();