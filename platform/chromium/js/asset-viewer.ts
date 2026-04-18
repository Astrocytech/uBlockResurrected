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

import './codemirror/ubo-static-filtering.js';

declare const CodeMirror: any;
declare const vAPI: any;
declare const uBlockDashboard: any;

const fallbackText = new Map([
    [ 'assetViewerPageName', 'uBlock — Asset viewer' ],
    [ 'subscribeButton', 'Subscribe' ],
    [ 'extName', 'uBlock Resurrected' ],
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

const init = async () => {
    const subscribeURL = new URL(document.location);
    const subscribeParams = subscribeURL.searchParams;
    const assetKey = subscribeParams.get('url');
    if ( assetKey === null ) { return; }

    const subscribeElem = document.getElementById('subscribe');
    if ( subscribeElem !== null && subscribeURL.hash !== '#subscribed' ) {
        const title = subscribeParams.get('title');
        const promptElem = document.getElementById('subscribePrompt');
        if ( promptElem && title ) {
            const spans = promptElem.querySelectorAll('span, a');
            if ( spans[0] ) { spans[0].textContent = title; }
            if ( spans[1] ) {
                spans[1].textContent = assetKey;
                (spans[1] as HTMLAnchorElement).href = assetKey;
            }
        }
        subscribeElem.classList.remove('hide');
    }

    const cmEditor = new CodeMirror(
        document.querySelector('#content') as HTMLElement,
        {
            autofocus: true,
            foldGutter: true,
            gutters: [
                'CodeMirror-linenumbers',
                { className: 'CodeMirror-lintgutter', style: 'width: 11px' },
            ],
            lineNumbers: true,
            lineWrapping: true,
            matchBrackets: true,
            maxScanLines: 1,
            maximizable: false,
            readOnly: true,
            styleActiveLine: {
                nonEmpty: true,
            },
        },
    );

    if (typeof uBlockDashboard !== 'undefined') {
        uBlockDashboard.patchCodeMirrorEditor(cmEditor);
    }

    try {
        const hints = await sendMessage<any>('dashboard', {
            what: 'getAutoCompleteDetails',
        });
        if ( hints instanceof Object ) {
            cmEditor.setOption('uboHints', hints);
        }
    } catch (e) {
        console.error('Failed to get autocomplete details:', e);
    }

    try {
        const tokens = await sendMessage<any>('dashboard', {
            what: 'getTrustedScriptletTokens',
        });
        cmEditor.setOption('trustedScriptletTokens', tokens);
    } catch (e) {
        console.error('Failed to get scriptlet tokens:', e);
    }

    try {
        const details = await sendMessage<{ content?: string; trustedSource?: boolean; sourceURL?: string }>('getAssetContent', {
            url: assetKey,
        });
        
        cmEditor.setOption('trustedSource', details.trustedSource === true);
        cmEditor.setValue(details && details.content || '');

        if ( details.sourceURL ) {
            const sourceUrlElem = document.querySelector('.cm-search-widget .sourceURL') as HTMLAnchorElement;
            if ( sourceUrlElem ) {
                sourceUrlElem.href = details.sourceURL;
                sourceUrlElem.title = details.sourceURL;
            }
        }
    } catch (e) {
        console.error('Failed to get asset content:', e);
    }

    const subscribeButton = document.getElementById('subscribeButton');
    if ( subscribeButton && subscribeElem ) {
        subscribeButton.addEventListener('click', async () => {
            subscribeElem.classList.add('hide');
            try {
                await sendMessage('scriptlets', {
                    what: 'applyFilterListSelection',
                    toImport: assetKey,
                });
                await sendMessage('scriptlets', {
                    what: 'reloadAllFilters',
                });
            } catch (e) {
                console.error('Failed to subscribe to filter list:', e);
            }
        }, { once: true });
    }

    document.body.classList.remove('loading');
};

applyThemeClasses();
applyFallbackTranslations();
void init();