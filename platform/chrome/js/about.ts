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

const initAbout = async () => {
    try {
        const details = await sendMessage<{ appName: string; version: string }>('dashboard', {
            what: 'getAboutDetails',
        });
        
        if ( details ) {
            const nameVer = document.getElementById('aboutNameVer');
            if ( nameVer ) {
                nameVer.textContent = `${details.appName} ${details.version}`;
            }
        }
    } catch (e) {
        const nameVer = document.getElementById('aboutNameVer');
        if ( nameVer ) {
            nameVer.textContent = 'uBlock Resurrected';
        }
    }
};

const applyLinkTargets = () => {
    for ( const link of document.querySelectorAll<HTMLAnchorElement>('div.body a[href^="http"]') ) {
        link.target = '_blank';
    }
};

applyThemeClasses();
applyLinkTargets();
void initAbout();