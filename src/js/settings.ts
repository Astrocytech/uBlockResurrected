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

import { dom, qs$, qsa$ } from './dom.js';
import { setAccentColor, setTheme } from './theme.js';
import { i18n$ } from './i18n.js';

interface ImportUserData {
    timeStamp: number;
    userSettings: unknown;
    whitelist?: unknown[];
    netWhitelist?: string;
    filterLists?: unknown;
    selectedFilterLists?: unknown[];
}

interface UserSettingsDetails {
    [key: string]: boolean | string | number | undefined;
    canLeakLocalIPAddresses?: boolean;
}

interface LocalDataDetails {
    storageUsed?: number;
    lastBackupFile?: string;
    lastBackupTime?: number;
    lastRestoreFile?: string;
    lastRestoreTime?: number;
    cloudStorageSupported?: boolean;
    privacySettingsSupported?: boolean;
}

interface BackupResponse {
    userData: ImportUserData;
    localData: LocalDataDetails;
}

/******************************************************************************/

function handleImportFilePicker(this: HTMLInputElement): void {
    const file = this.files[0];
    if ( file === undefined || file.name === '' ) { return; }

    const reportError = (): void => {
        window.alert(i18n$('aboutRestoreDataError'));
    };

    const expectedFileTypes = [
        'text/plain',
        'application/json',
    ];
    if ( expectedFileTypes.includes(file.type) === false ) {
        return reportError();
    }

    const filename = file.name;
    const fr = new FileReader();

    fr.onload = function(this: FileReader): void {
        let userData: ImportUserData | undefined;
        try {
            const parsed = JSON.parse(this.result);
            if ( typeof parsed !== 'object' ) {
                throw 'Invalid';
            }
            userData = parsed as ImportUserData;
            if ( typeof userData.userSettings !== 'object' ) {
                throw 'Invalid';
            }
            if (
                Array.isArray(userData.whitelist) === false &&
                typeof userData.netWhitelist !== 'string'
            ) {
                throw 'Invalid';
            }
            if (
                typeof userData.filterLists !== 'object' &&
                Array.isArray(userData.selectedFilterLists) === false
            ) {
                throw 'Invalid';
            }
        }
        catch {
            userData = undefined;
        }
        if ( userData === undefined ) {
            return reportError();
        }
        const time = new Date(userData.timeStamp);
        const msg = i18n$('aboutRestoreDataConfirm')
                        .replace('{{time}}', time.toLocaleString());
        const proceed = window.confirm(msg);
        if ( proceed !== true ) { return; }
        vAPI.messaging.send('dashboard', {
            what: 'restoreUserData',
            userData,
            file: filename,
        });
    };

    fr.readAsText(file);
}

/******************************************************************************/

function startImportFilePicker(): void {
    const input = qs$('#restoreFilePicker') as HTMLInputElement;
    input.value = '';
    input.click();
}

/******************************************************************************/

async function exportToFile(): Promise<void> {
    const response = await vAPI.messaging.send('dashboard', {
        what: 'backupUserData',
    }) as BackupResponse | undefined;
    if (
        response instanceof Object === false ||
        response.userData instanceof Object === false
    ) {
        return;
    }
    vAPI.download({
        'url': 'data:text/plain;charset=utf-8,' +
               encodeURIComponent(JSON.stringify(response.userData, null, '  ')),
        'filename': response.localData.lastBackupFile
    });
    onLocalDataReceived(response.localData);
}

/******************************************************************************/

function onLocalDataReceived(details: LocalDataDetails): void {
    let v: string | number;
    let unit: string;
    if ( typeof details.storageUsed === 'number' ) {
        v = details.storageUsed;
        if ( v < 1e3 ) {
            unit = 'genericBytes';
        } else if ( v < 1e6 ) {
            v /= 1e3;
            unit = 'KB';
        } else if ( v < 1e9 ) {
            v /= 1e6;
            unit = 'MB';
        } else {
            v /= 1e9;
            unit = 'GB';
        }
    } else {
        v = '?';
        unit = '';
    }
    dom.text(
        '#storageUsed',
        i18n$('storageUsed')
            .replace('{{value}}', v.toLocaleString(undefined, { maximumSignificantDigits: 3 }))
            .replace('{{unit}}', unit && i18n$(unit) || '')
    );

    const timeOptions: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        timeZoneName: 'short'
    };

    const lastBackupFile = details.lastBackupFile || '';
    if ( lastBackupFile !== '' ) {
        const dt = new Date(details.lastBackupTime);
        const text = i18n$('settingsLastBackupPrompt');
        const node = qs$('#settingsLastBackupPrompt') as Element;
        node.textContent = text + '\xA0' + dt.toLocaleString('fullwide', timeOptions);
        node.style.display = '';
    }

    const lastRestoreFile = details.lastRestoreFile || '';
    if ( lastRestoreFile !== '' ) {
        const dt = new Date(details.lastRestoreTime);
        const text = i18n$('settingsLastRestorePrompt');
        const node = qs$('#settingsLastRestorePrompt') as Element;
        node.textContent = text + '\xA0' + dt.toLocaleString('fullwide', timeOptions);
        node.style.display = '';
    }

    if ( details.cloudStorageSupported === false ) {
        dom.attr('[data-setting-name="cloudStorageEnabled"]', 'disabled', '');
    }

    if ( details.privacySettingsSupported === false ) {
        dom.attr('[data-setting-name="prefetchingDisabled"]', 'disabled', '');
        dom.attr('[data-setting-name="hyperlinkAuditingDisabled"]', 'disabled', '');
        dom.attr('[data-setting-name="webrtcIPAddressHidden"]', 'disabled', '');
    }
}

/******************************************************************************/

function resetUserData(): void {
    const msg = i18n$('aboutResetDataConfirm');
    const proceed = window.confirm(msg);
    if ( proceed !== true ) { return; }
    vAPI.messaging.send('dashboard', {
        what: 'resetUserData',
    });
}

/******************************************************************************/

function synchronizeDOM(): void {
    dom.cl.toggle(
        dom.body,
        'advancedUser',
        (qs$('[data-setting-name="advancedUserEnabled"]') as HTMLInputElement).checked === true
    );
}

/******************************************************************************/

function changeUserSettings(name: string, value: boolean | string | number): void {
    vAPI.messaging.send('dashboard', {
        what: 'userSettings',
        name,
        value,
    });

    switch ( name ) {
    case 'uiTheme':
        setTheme(value as string, true);
        break;
    case 'uiAccentCustom':
    case 'uiAccentCustom0':
        setAccentColor(
            (qs$('[data-setting-name="uiAccentCustom"]') as HTMLInputElement).checked,
            (qs$('[data-setting-name="uiAccentCustom0"]') as HTMLInputElement).value,
            true
        );
        break;
    default:
        break;
    }
}

/******************************************************************************/

function onValueChanged(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const name = dom.attr(input, 'data-setting-name') || '';
    let value: string | number = input.value;
    switch ( name ) {
    case 'largeMediaSize':
        value = Math.min(Math.max(Math.floor(parseInt(value as string, 10) || 0), 0), 1000000);
        break;
    default:
        break;
    }
    if ( value !== input.value ) {
        input.value = String(value);
    }

    changeUserSettings(name, value);
}

/******************************************************************************/

function onUserSettingsReceived(details: UserSettingsDetails): void {
    const checkboxes = qsa$('[data-setting-type="bool"]');
    const onchange = (ev: Event): void => {
        const checkbox = ev.target as HTMLInputElement;
        const name = checkbox.dataset.settingName || '';
        changeUserSettings(name, checkbox.checked);
        synchronizeDOM();
    };
    for ( const checkbox of checkboxes ) {
        const name = dom.attr(checkbox, 'data-setting-name') || '';
        if ( details[name] === undefined ) {
            dom.attr(checkbox.closest('.checkbox') as Element, 'disabled', '');
            dom.attr(checkbox, 'disabled', '');
            continue;
        }
        checkbox.checked = details[name] === true;
        dom.on(checkbox, 'change', onchange);
    }

    if ( details.canLeakLocalIPAddresses === true ) {
        (qs$('[data-setting-name="webrtcIPAddressHidden"]') as Element)
            .closest('div.li')
            .style.display = '';
    }

    qsa$('[data-setting-type="value"]').forEach(function(elem: Element): void {
        elem.value = String(details[dom.attr(elem, 'data-setting-name') || '']);
        dom.on(elem, 'change', onValueChanged);
    });

    dom.on('#export', 'click', (): void => { exportToFile(); });
    dom.on('#import', 'click', startImportFilePicker);
    dom.on('#reset', 'click', resetUserData);
    dom.on('#restoreFilePicker', 'change', handleImportFilePicker);

    synchronizeDOM();
}

/******************************************************************************/

self.wikilink = 'https://github.com/gorhill/uBlock/wiki/Dashboard:-Settings';

self.hasUnsavedData = function(): boolean {
    return false;
};

/******************************************************************************/

vAPI.messaging.send('dashboard', { what: 'userSettings' }).then(result => {
    onUserSettingsReceived(result as UserSettingsDetails);
});

vAPI.messaging.send('dashboard', { what: 'getLocalData' }).then(result => {
    onLocalDataReceived(result as LocalDataDetails);
});

dom.on(
    '[data-i18n-title="settingsAdvancedUserSettings"]',
    'click',
    self.uBlockDashboard.openOrSelectPage
);

/******************************************************************************/
