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

*******************************************************************************/

import './codemirror/ubo-static-filtering.js';

declare const CodeMirror: any;
declare const vAPI: any;
declare const uBlockDashboard: any;

const fallbackText = new Map([
    [ 'codeViewerPageName', 'uBlock — Code viewer' ],
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
    document.body.classList.remove('loading');
    applyThemeClasses();
    applyFallbackTranslations();

    const cmContainer = document.querySelector<HTMLElement>('#content');
    if ( cmContainer === null ) {
        return;
    }

    const editor = CodeMirror(cmContainer, {
        lineNumbers: true,
        readOnly: true,
        lineWrapping: true,
        mode: 'text',
    });

    const currentURLInput = document.querySelector<HTMLInputElement>('#currentURL input');
    const reloadURL = document.querySelector('#reloadURL');
    const removeURL = document.querySelector('#removeURL');
    const pastURLs = document.querySelector('#pastURLs');

    let urlHistory: string[] = [];

    const loadURL = async (url: string) => {
        try {
            const response = await sendMessage<{ content: string }>('default', {
                what: 'getAssetContent',
                url,
            });
            if (response?.content) {
                editor.setValue(response.content);
            }
        } catch (e) {
            console.error('Failed to load URL:', e);
        }
    };

    if (currentURLInput) {
        currentURLInput.addEventListener('change', () => {
            const url = currentURLInput.value;
            if (url) {
                loadURL(url);
                if (!urlHistory.includes(url)) {
                    urlHistory.push(url);
                }
            }
        });
    }

    if (reloadURL) {
        reloadURL.addEventListener('click', () => {
            if (currentURLInput?.value) {
                loadURL(currentURLInput.value);
            }
        });
    }

    if (removeURL) {
        removeURL.addEventListener('click', () => {
            if (currentURLInput) {
                currentURLInput.value = '';
            }
        });
    }

    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    if (urlParam && currentURLInput) {
        currentURLInput.value = decodeURIComponent(urlParam);
        loadURL(decodeURIComponent(urlParam));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    init().catch(console.error);
});