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

declare const vAPI: any;
declare const CodeMirror: any;

import './codemirror/ubo-static-filtering.js';

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
    for ( const button of document.querySelectorAll<HTMLButtonElement>('button[data-url]') ) {
        button.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement;
            const url = target.getAttribute('data-url');
            if ( url ) {
                vAPI.messaging.send({ sender: 'support', topic: 'gotoURL', url });
            }
        });
    }
    
    const updateButton = document.querySelector<HTMLButtonElement>('button.iconified');
    if ( updateButton ) {
        updateButton.addEventListener('click', async () => {
            try {
                await sendMessage('scriptlets', { what: 'updateAllFilters' });
            } catch (e) {
                console.error(e);
            }
        });
    }
    
    const selectAllButton = document.getElementById('selectAllButton');
    if ( selectAllButton ) {
        selectAllButton.addEventListener('click', () => {
            const cm = (window as any).supportCodeMirror as CodeMirror.Editor;
            if ( cm ) {
                cm.operation(() => {
                    cm.execCommand('selectAll');
                });
            }
        });
    }
    
    const moreButton = document.getElementById('moreButton');
    if ( moreButton ) {
        moreButton.addEventListener('click', () => {
            const url = moreButton.getAttribute('data-url');
            if ( url ) {
                vAPI.messaging.send({ sender: 'support', topic: 'goToDevTools', url });
            }
        });
    }
    
    try {
        const details = await sendMessage<any>('dashboard', {
            what: 'getSupportData',
        });
        
        if ( details ) {
            const container = document.getElementById('supportData');
            if ( container && typeof CodeMirror !== 'undefined' ) {
                const cm = new CodeMirror(container, {
                    value: details,
                    mode: 'ubo-static-filtering',
                    lineNumbers: true,
                    readOnly: true,
                });
                (window as any).supportCodeMirror = cm;
            }
        }
    } catch (e) {
        console.error('Failed to get support data:', e);
    }
};

applyThemeClasses();
void init();