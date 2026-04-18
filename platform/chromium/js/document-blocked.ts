/*******************************************************************************

    uBlock Resurrected - a comprehensive, efficient content blocker
    Copyright (C) 2015-present Raymond Hill

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

interface BlockDetails {
    url?: string;
    hn?: string;
    fs?: string;
    reason?: string;
    to?: string;
}

const fallbackText = new Map([
    [ 'docblockedTitle', 'uBlock — Document blocked' ],
    [ 'docblockedPrompt1', 'The document at' ],
    [ 'docblockedPrompt2', 'has been blocked by' ],
    [ 'docblockedBack', 'Back' ],
    [ 'docblockedClose', 'Close' ],
    [ 'docblockedDisable', 'Proceed' ],
    [ 'docblockedDontWarn', 'Do not warn me again' ],
    [ 'docblockedReasonLabel', 'Reason:' ],
    [ 'docblockedRedirectPrompt', 'This document was blocked and was to be redirected to {{url}}' ],
    [ 'docblockedFoundIn', 'Found in' ],
    [ 'docblockedNoParamsPrompt', 'URL parameters' ],
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

const details: BlockDetails = {};

{
    const matches = /details=([^&]+)/.exec(window.location.search);
    if ( matches !== null ) {
        try {
            Object.assign(details, JSON.parse(decodeURIComponent(matches[1])));
        } catch (e) {
            console.error('Failed to parse blocked document details:', e);
        }
    }
}

const urlToFragment = (raw: string) => {
    try {
        const fragment = document.createDocumentFragment();
        const url = new URL(raw);
        const hn = url.hostname;
        const i = raw.indexOf(hn);
        const b = document.createElement('b');
        b.append(hn);
        fragment.append(raw.slice(0, i), b, raw.slice(i + hn.length));
        return fragment;
    } catch {
    }
    return document.createTextNode(raw);
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

const theUrlSpan = document.querySelector('#theURL > p > span:first-of-type');
if ( theUrlSpan && details.url ) {
    theUrlSpan.innerHTML = '';
    theUrlSpan.append(urlToFragment(details.url));
}

const lookupFilterLists = async () => {
    if ( !details.fs ) { return []; }
    try {
        const response = await sendMessage<Record<string, any>>('documentBlocked', {
            what: 'listsFromNetFilter',
            rawFilter: details.fs,
        });
        if ( response instanceof Object === false ) { return []; }
        for ( const rawFilter in response ) {
            if ( Object.hasOwn(response, rawFilter) ) {
                return response[rawFilter] || [];
            }
        }
    } catch (e) {
        console.error('Failed to lookup filter lists:', e);
    }
    return [];
};

if ( typeof details.to === 'string' && details.to.length !== 0 ) {
    const urlskip = document.getElementById('urlskip');
    if ( urlskip ) {
        const link = document.createElement('a');
        link.href = details.to;
        link.className = 'code';
        link.append(urlToFragment(details.to));
        urlskip.appendChild(link);
        urlskip.hidden = false;
    }
}

const reURL = /^https?:\/\//;

const liFromParam = (name: string, value: string) => {
    const li = document.createElement('li');
    const spanName = document.createElement('span');
    spanName.textContent = name;
    li.appendChild(spanName);
    if ( name !== '' && value !== '' ) {
        li.appendChild(document.createTextNode(' = '));
    }
    const spanValue = document.createElement('span');
    if ( reURL.test(value) ) {
        const a = document.createElement('a');
        a.href = value;
        a.textContent = value;
        spanValue.appendChild(a);
    } else {
        spanValue.textContent = value;
    }
    li.appendChild(spanValue);
    return li;
};

const renderParams = (parentNode: Element, rawURL: string, depth = 0): boolean => {
    let url: URL;
    try {
        url = new URL(rawURL);
    } catch {
        return false;
    }

    const search = url.search.slice(1);
    if ( search === '' ) { return false; }

    url.search = '';
    const noParamsLi = liFromParam('URL parameters', url.href);
    parentNode.appendChild(noParamsLi);

    const params = new URLSearchParams(search);
    for ( const [ name, value ] of params ) {
        const li = liFromParam(name, value);
        if ( depth < 2 && reURL.test(value) ) {
            const ul = document.createElement('ul');
            renderParams(ul, value, depth + 1);
            li.appendChild(ul);
        }
        parentNode.appendChild(li);
    }

    return true;
};

const parsed = document.getElementById('parsed');
if ( parsed && details.url ) {
    if ( renderParams(parsed, details.url) ) {
        const toggleParse = document.getElementById('toggleParse');
        if ( toggleParse ) {
            toggleParse.classList.remove('hidden');
        }
    }
}

const toggleParse = document.getElementById('toggleParse');
const theUrl = document.getElementById('theURL');
toggleParse?.addEventListener('click', () => {
    theUrl?.classList.toggle('collapsed');
    const isExpanded = !theUrl?.classList.contains('collapsed');
    chrome.storage.local.set({ documentBlockedExpandUrl: isExpanded.toString() });
});

chrome.storage.local.get('documentBlockedExpandUrl', (items) => {
    const isExpanded = items.documentBlockedExpandUrl === 'true';
    if ( theUrl && isExpanded ) {
        theUrl.classList.remove('collapsed');
    }
});

const backBtn = document.getElementById('back');
const byeBtn = document.getElementById('bye');

if ( window.history.length > 1 ) {
    backBtn?.addEventListener('click', () => {
        window.history.back();
    });
    if ( byeBtn ) {
        byeBtn.style.display = 'none';
    }
} else {
    byeBtn?.addEventListener('click', () => {
        void sendMessage('documentBlocked', { what: 'closeThisTab' });
    });
    if ( backBtn ) {
        backBtn.style.display = 'none';
    }
}

const proceedToURL = () => {
    if ( details.url ) {
        window.location.replace(details.url);
    }
};

const proceedTemporary = async () => {
    if ( details.hn ) {
        await sendMessage('documentBlocked', {
            what: 'temporarilyWhitelistDocument',
            hostname: details.hn,
        });
    }
    proceedToURL();
};

const proceedPermanent = async () => {
    if ( details.hn ) {
        await sendMessage('documentBlocked', {
            what: 'toggleHostnameSwitch',
            name: 'no-strict-blocking',
            hostname: details.hn,
            deep: true,
            state: true,
            persist: true,
        });
    }
    proceedToURL();
};

const disableWarning = document.getElementById('disableWarning') as HTMLInputElement;
const proceedBtn = document.getElementById('proceed');

disableWarning?.addEventListener('change', (ev) => {
    const checked = (ev.target as HTMLInputElement).checked;
    if ( backBtn ) { backBtn.disabled = checked; }
    if ( byeBtn ) { byeBtn.disabled = checked; }
});

proceedBtn?.addEventListener('click', () => {
    if ( disableWarning?.checked ) {
        proceedPermanent();
    } else {
        proceedTemporary();
    }
});

const renderWhy = (lists: any[]) => {
    let reason = details.reason;
    if ( !reason && lists.length > 0 ) {
        reason = lists.reduce((a: string | undefined, b: any) => a || b.reason, undefined);
    }

    const whyContainer = document.getElementById('why');
    if ( !whyContainer ) { return; }

    const template = document.querySelector(reason ? 'template.why-reason' : 'template.why') as HTMLTemplateElement;
    if ( !template ) { return; }

    const why = template.content.cloneNode(true);
    const whyText = why.querySelector('.why');
    if ( whyText && details.fs ) {
        whyText.textContent = details.fs;
    }
    if ( reason ) {
        const summary = why.querySelector('summary');
        if ( summary ) {
            summary.textContent = `Reason: ${reason}`;
        }
    }
    whyContainer.appendChild(why);

    document.body.classList.remove('loading');

    if ( lists.length === 0 ) { return; }

    const whyExtraTemplate = document.querySelector('template.why-extra') as HTMLTemplateElement;
    const listTemplate = document.querySelector('template.filterList') as HTMLTemplateElement;

    if ( !whyExtraTemplate || !listTemplate ) { return; }

    const whyExtra = whyExtraTemplate.content.cloneNode(true);
    const parent = whyExtra.querySelector('.why-extra');
    if ( !parent ) { return; }

    let separator = '\u00A0\u2022\u00A0';
    for ( const list of lists ) {
        const listElem = listTemplate.content.cloneNode(true);
        const sourceElem = listElem.querySelector('.filterListSource') as HTMLAnchorElement;
        if ( sourceElem && list.assetKey ) {
            sourceElem.href += encodeURIComponent(list.assetKey);
            sourceElem.textContent = list.title || list.assetKey;
        }
        const supportElem = listElem.querySelector('.filterListSupport') as HTMLAnchorElement;
        if ( supportElem && list.supportURL ) {
            supportElem.href = list.supportURL;
            supportElem.classList.remove('hidden');
        }
        parent.appendChild(document.createTextNode(separator));
        parent.appendChild(listElem);
        separator = '\u00A0\u2022\u00A0';
    }

    const whyElement = whyContainer.querySelector('.why');
    if ( whyElement && whyExtra ) {
        whyElement.after(whyExtra);
    }
};

void lookupFilterLists().then(lists => {
    renderWhy(lists || []);
});

applyThemeClasses();
applyFallbackTranslations();