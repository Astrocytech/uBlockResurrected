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

******************************************************************************/

declare const CodeMirror: any;

const fallbackText = new Map([
    [ '3pPurgeAll', 'Purge all caches' ],
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

const cmEditor = new CodeMirror(
    document.querySelector('#console') as HTMLElement,
    {
        autofocus: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        lineNumbers: true,
        lineWrapping: true,
        readOnly: true,
    },
);

const log = (message: string) => {
    const text = cmEditor.getValue();
    cmEditor.setValue(text + message + '\n');
    cmEditor.scrollTo(0, cmEditor.getScrollInfo().height);
};

document.getElementById('console-clear')?.addEventListener('click', () => {
    cmEditor.setValue('');
});

const foldAll = () => {
    cmEditor.operation(() => {
        for ( let i = 0; i < cmEditor.lineCount(); i++ ) {
            cmEditor.foldCode({ line: i, ch: 0 });
        }
    });
};

const unfoldAll = () => {
    cmEditor.operation(() => {
        for ( let i = 0; i < cmEditor.lineCount(); i++ ) {
            const line = cmEditor.getLine(i);
            if ( line.startsWith('+ ') ) {
                cmEditor.foldCode({ line: i, ch: 0 }, null, 'unfold');
            }
        }
    });
};

document.getElementById('console-fold')?.addEventListener('click', foldAll);
document.getElementById('console-unfold')?.addEventListener('click', unfoldAll);

document.getElementById('snfe-dump')?.addEventListener('click', async () => {
    log('=== Static Network Filtering Engine Dump ===');
    log('Note: Not available in MV3 mode');
});

document.getElementById('snfe-todnr')?.addEventListener('click', async () => {
    log('=== Static Network Filtering Engine to DNR ===');
    log('Note: Not available in MV3 mode');
});

document.getElementById('cfe-dump')?.addEventListener('click', async () => {
    log('=== Cosmetic Filtering Engine Dump ===');
    log('Note: Not available in MV3 mode');
});

document.getElementById('purge-all-caches')?.addEventListener('click', async () => {
    try {
        await sendMessage('purgeAllCaches');
        log('All caches purged successfully');
    } catch (e) {
        log('Failed to purge caches: ' + (e as Error).message);
    }
});

log('=== uBlock Resurrected DevTools ===');
log('MV3 Mode: Enabled');
log('Use the buttons above to perform various diagnostics.');
log('');

applyThemeClasses();
applyFallbackTranslations();