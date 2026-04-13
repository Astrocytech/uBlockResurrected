/*******************************************************************************

    uBlock Resurrected - a comprehensive, efficient content blocker
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

******************************************************************************/

declare const CodeMirror: any;

interface SettingsMap {
    [key: string]: string;
}

const fallbackText = new Map([
    [ 'advancedSettingsPageName', 'Advanced settings' ],
    [ 'advancedSettingsWarning', 'Changing these settings may affect the proper functioning of uBlock Origin.' ],
    [ 'genericApplyChanges', 'Apply changes' ],
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

const defaultSettings: SettingsMap = {
    'userFilters': '',
    'importedLists': '',
    'lastBackupTime': '0',
    'excludeAfter': '28',
    'autoUpdateInterval': '168',
    'manualUpdateAssetFetchInterval': '72',
    'updateDelayAfterLaunch': '7',
    'backupPeriod': '86400000',
    'localSettings': '',
    'remoteSettings': '',
};

const adminSettings: SettingsMap = {
    'userFilters': 'true',
    'importedLists': 'true',
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
    root.class.toggle('light', dark === false);
    root.classList.add((navigator.maxTouchPoints || 0) > 0 ? 'mobile' : 'desktop');
    if ( self.matchMedia('(min-resolution: 150dpi)').matches ) {
        root.classList.add('hidpi');
    }
};

const hashFromAdvancedSettings = (raw: string): string => {
    const aa = arrayFromString(raw);
    aa.sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify(aa);
};

const arrayFromObject = (o: Record<string, string>): string[][] => {
    const out: string[][] = [];
    for ( const k in o ) {
        if ( Object.hasOwn(o, k) === false ) { continue; }
        out.push([k, `${o[k]}`]);
    }
    return out;
};

const arrayFromString = (s: string): string[][] => {
    const out: string[][] = [];
    for ( const line of s.split(/[\n\r]+/) ) {
        const pos = line.indexOf('=');
        if ( pos === -1 ) { continue; }
        out.push([line.slice(0, pos).trim(), line.slice(pos + 1).trim()]);
    }
    return out;
};

const cmEditor = new CodeMirror(
    document.querySelector('#advancedSettings') as HTMLElement,
    {
        autofocus: true,
        lineNumbers: true,
        lineWrapping: false,
        styleActiveLine: true,
    },
);

if (typeof uBlockDashboard !== 'undefined') {
    uBlockDashboard.patchCodeMirrorEditor(cmEditor);
}

let beforeHash = '';

const advancedSettingsChanged = () => {
    const raw = cmEditor.getValue();
    const afterHash = hashFromAdvancedSettings(raw);
    const changed = beforeHash !== afterHash;
    const applyBtn = document.querySelector('#advancedSettingsApply') as HTMLButtonElement;
    if (applyBtn) {
        applyBtn.disabled = !changed;
    }
};

cmEditor.on('changes', advancedSettingsChanged);

const applyAdvancedSettings = async () => {
    const raw = cmEditor.getValue();
    const pairs = arrayFromString(raw);
    const settings: Record<string, string> = {};
    for ( const [key, value] of pairs ) {
        if ( adminSettings[key] !== undefined ) { continue; }
        if ( defaultSettings[key] === undefined ) { continue; }
        settings[key] = value;
    }
    await sendMessage('scriptlets', {
        what: 'setAdvancedSettings',
        settings,
    });
    beforeHash = hashFromAdvancedSettings(raw);
    advancedSettingsChanged();
};

const loadAdvancedSettings = async () => {
    const results = await sendMessage<any>('scriptlets', {
        what: 'getAdvancedSettings',
    });
    const entries: string[] = [];
    for ( const key in defaultSettings ) {
        let value = results[key] ?? defaultSettings[key];
        if ( key === 'userFilters' ) { continue; }
        entries.push(`${key}=${value}`);
    }
    const raw = entries.join('\n') + '\n';
    cmEditor.setValue(raw);
    beforeHash = hashFromAdvancedSettings(raw);
    cmEditor.clearHistory();
};

document.getElementById('advancedSettingsApply')?.addEventListener('click', () => {
    void applyAdvancedSettings();
});

applyThemeClasses();
applyFallbackTranslations();
void loadAdvancedSettings();