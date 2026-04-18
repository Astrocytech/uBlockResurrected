(function() {
    const root = document.documentElement;
    const body = document.body;
    const fallbackText = new Map([
        [ 'settingsPageName', 'Settings' ],
        [ '3pPageName', 'Filter lists' ],
        [ '1pPageName', 'My filters' ],
        [ 'rulesPageName', 'My rules' ],
        [ 'whitelistPageName', 'Trusted sites' ],
        [ 'supportPageName', 'Support' ],
        [ 'aboutPageName', 'About' ],
        [ 'genericRevert', 'Revert' ],
        [ 'supportOpenButton', 'Open' ],
        [ 'popupMoreButton_v2', 'More' ],
    ]);

    const applyThemeClasses = () => {
        const dark = typeof self.matchMedia === 'function' &&
            self.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', dark);
        root.classList.toggle('light', dark === false);
    };

    const initEnvironment = () => {
        applyThemeClasses();
        if ( typeof self.matchMedia === 'function' ) {
            const darkQuery = self.matchMedia('(prefers-color-scheme: dark)');
            if ( typeof darkQuery.addEventListener === 'function' ) {
                darkQuery.addEventListener('change', applyThemeClasses);
            }
        }
        root.classList.add((navigator.maxTouchPoints || 0) > 0 ? 'mobile' : 'desktop');
        if ( self.matchMedia('(min-resolution: 150dpi)').matches ) {
            root.classList.add('hidpi');
        }
    };

    const applyFallbackTranslations = () => {
        for ( const element of document.querySelectorAll('[data-i18n]') ) {
            const key = element.getAttribute('data-i18n') || '';
            const fallback = fallbackText.get(key);
            if ( fallback === undefined ) { continue; }
            if ( element.textContent.trim() === '' || element.textContent.trim() === '_' ) {
                element.textContent = fallback;
            }
        }
    };

    const isSettingsPage = window.location.pathname.endsWith('settings.html') ||
                          window.location.href.includes('settings.html');

    const disableControls = () => {
        if (isSettingsPage) { return; }
        for ( const element of document.querySelectorAll('button, input, textarea, select')) {
            element.disabled = true;
            if ( element.title === '' ) {
                element.title = 'Disabled in this build';
            }
        }
        for ( const fileInput of document.querySelectorAll('input[type="file"]') ) {
            fileInput.hidden = true;
            fileInput.setAttribute('aria-hidden', 'true');
        }
        for ( const editable of document.querySelectorAll('[contenteditable]') ) {
            editable.setAttribute('contenteditable', 'false');
            editable.setAttribute('aria-disabled', 'true');
        }
    };

    const createEditorPlaceholder = (container, label) => {
        if ( !(container instanceof HTMLElement) ) { return; }
        container.classList.add('dashboard-lite-editor');
        if ( container.childElementCount !== 0 ) { return; }
        const pre = document.createElement('pre');
        pre.className = 'dashboard-lite-editor__content';
        pre.textContent = label;
        container.append(pre);
    };

    const initPlaceholders = () => {
        createEditorPlaceholder(document.getElementById('userFilters'), '! Example filter\n||example.com^\nexample.com##.ad-banner');
        createEditorPlaceholder(document.getElementById('whitelist'), '# Trusted sites\nexample.com\nintranet.local');
        const merge = document.querySelector('.codeMirrorMergeContainer');
        createEditorPlaceholder(merge, 'example.com * 3p block\nexample.com cdn.example.net noop\n* tracker.example.org block');
        const codeMirror = document.querySelector('#supportData');
        createEditorPlaceholder(codeMirror, 'Support data preview\n\nVersion: UI-only dashboard shell\nMode: disabled');
        const cmContainer = document.getElementById('cm-container');
        createEditorPlaceholder(cmContainer, '{\n  "mode": "ui-only",\n  "note": "Editor disabled in this build"\n}');
    };

    const initAbout = () => {
        const about = document.getElementById('aboutNameVer');
        if ( about === null ) { return; }
        const manifest = chrome.runtime?.getManifest?.();
        if ( manifest instanceof Object ) {
            about.textContent = [ manifest.name, manifest.version ].filter(Boolean).join(' ');
        }
    };

    initEnvironment();
    applyFallbackTranslations();
    disableControls();
    initPlaceholders();
    initAbout();
})();
