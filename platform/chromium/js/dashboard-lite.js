(function() {
    const root = document.documentElement;
    const body = document.body;
    const validPanes = new Set([ 'settings', 'rulesets', 'filters', 'develop', 'about' ]);
    const fallbackText = new Map([
        [ 'settingsPageName', 'Settings' ],
        [ 'aboutFilterLists', 'Filter lists' ],
        [ 'customFiltersPageName', 'My filters' ],
        [ 'developPageName', 'Develop' ],
        [ 'aboutPageName', 'About' ],
        [ 'defaultFilteringModeSectionLabel', 'Default filtering mode' ],
        [ 'defaultFilteringModeDescription', 'Choose how aggressively this profile filters by default.' ],
        [ 'filteringMode1Name', 'Basic' ],
        [ 'basicFilteringModeDescription', 'Blocks the most obvious ads and trackers with fewer page breakages.' ],
        [ 'filteringMode2Name', 'Optimal' ],
        [ 'optimalFilteringModeDescription', 'Balanced filtering for regular browsing.' ],
        [ 'filteringMode3Name', 'Complete' ],
        [ 'completeFilteringModeDescription', 'Applies the strongest filtering and may break more sites.' ],
        [ 'behaviorSectionLabel', 'Behavior' ],
        [ 'autoReloadLabel', 'Automatically reload tabs when settings change' ],
        [ 'showBlockedCountLabel', 'Show blocked request count on the badge' ],
        [ 'enableStrictBlockLabel', 'Enable strict block mode' ],
        [ 'enableStrictBlockLegend', 'Warn before visiting known malicious sites.' ],
        [ 'developerModeLabel', 'Enable developer mode' ],
        [ 'developerModeLegend', 'Show additional debugging and editing tools.' ],
        [ 'settingsBackupRestoreLabel', 'Backup and restore' ],
        [ 'settingsBackupRestoreSummary', 'These controls are visible in this build, but operational features are disabled.' ],
        [ 'backupButton', 'Backup to file' ],
        [ 'restoreButton', 'Restore from file' ],
        [ 'resetToDefaultButton', 'Reset to defaults' ],
        [ 'listsOfBlockedHostsPrompt', 'Lists of blocked hosts' ],
        [ 'customFiltersImportExportLabel', 'Import and export' ],
        [ 'addButton', 'Add' ],
        [ 'importAndAppendButton', 'Import' ],
        [ 'exportButton', 'Export' ],
        [ 'developDropdownLabel', 'Editor' ],
        [ 'developOptionFilteringModeDetails', 'Filtering mode details' ],
        [ 'developOptionCustomDnrRules', 'Custom DNR rules' ],
        [ 'developOptionDnrRulesOf', 'Readonly DNR rules of' ],
        [ 'developOptionDynamicRuleset', 'Dynamic ruleset' ],
        [ 'developOptionSessionRuleset', 'Session ruleset' ],
        [ 'findListsPlaceholder', 'Find in filter lists' ],
        [ 'aboutPrivacyPolicy', 'Privacy policy' ],
        [ 'aboutChangelog', 'Release notes' ],
        [ 'aboutCode', 'Source code' ],
        [ 'aboutContributors', 'Contributors' ],
        [ 'aboutSourceCode', 'Code contributors' ],
        [ 'aboutTranslations', 'Translations' ],
        [ 'aboutFilterLists', 'Filter lists' ],
        [ 'aboutDependencies', 'Dependencies' ],
        [ 'supportS5H', 'Support information' ],
    ]);

    const applyFallbackTranslations = () => {
        const fill = (element, text) => {
            if ( element instanceof HTMLInputElement ) {
                element.placeholder = text;
                return;
            }
            if ( element instanceof HTMLOptGroupElement ) {
                element.label = text;
                return;
            }
            if ( element instanceof HTMLElement ) {
                const current = element.textContent.trim();
                if ( current === '' || current === '_' || current === '-' ) {
                    element.textContent = text;
                }
            }
        };

        for ( const element of document.querySelectorAll('[data-i18n]') ) {
            const key = element.getAttribute('data-i18n') || '';
            const fallback = fallbackText.get(key);
            if ( fallback === undefined ) { continue; }
            fill(element, fallback);
        }
        for ( const element of document.querySelectorAll('[data-i18n-label]') ) {
            const key = element.getAttribute('data-i18n-label') || '';
            const fallback = fallbackText.get(key);
            if ( fallback === undefined ) { continue; }
            element.setAttribute('label', fallback);
        }
        for ( const element of document.querySelectorAll('[placeholder]') ) {
            const placeholder = element.getAttribute('placeholder') || '';
            const fallback = fallbackText.get(placeholder);
            if ( fallback === undefined ) { continue; }
            if ( element.getAttribute('placeholder') === placeholder ) {
                element.setAttribute('placeholder', fallback);
            }
        }
    };

    const applyThemeClasses = () => {
        const dark = typeof self.matchMedia === 'function' &&
            self.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', dark);
        root.classList.toggle('light', dark === false);
    };

    const setPane = pane => {
        if ( validPanes.has(pane) === false ) { return; }
        body.dataset.pane = pane;
    };

    const disableMainControls = () => {
        for ( const element of document.querySelectorAll('section[data-pane] button, section[data-pane] input, section[data-pane] textarea, section[data-pane] select') ) {
            if ( element.classList.contains('tabButton') ) { continue; }
            element.disabled = true;
            if ( element.title === '' ) {
                element.title = 'Disabled in this build';
            }
        }
        for ( const editable of document.querySelectorAll('[contenteditable]') ) {
            editable.setAttribute('contenteditable', 'false');
            editable.setAttribute('aria-disabled', 'true');
            if ( editable.title === '' ) {
                editable.title = 'Disabled in this build';
            }
        }
        for ( const input of document.querySelectorAll('input[type="file"]') ) {
            input.hidden = true;
            input.setAttribute('aria-hidden', 'true');
        }
    };

    const bindTabs = () => {
        for ( const button of document.querySelectorAll('#dashboard-nav .tabButton[data-pane]') ) {
            button.addEventListener('click', () => {
                setPane(button.dataset.pane || 'settings');
            });
        }
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
        body.dataset.develop = 'true';
    };

    const initAbout = () => {
        const about = document.getElementById('aboutNameVer');
        if ( about === null ) { return; }
        const manifest = chrome.runtime?.getManifest?.();
        if ( manifest instanceof Object ) {
            const parts = [ manifest.name, manifest.version ].filter(Boolean);
            about.textContent = parts.join(' ');
        }
    };

    const initialPane = () => {
        const fromHash = self.location.hash.replace(/^#/, '');
        if ( validPanes.has(fromHash) ) {
            return fromHash;
        }
        return body.dataset.pane || 'settings';
    };

    initEnvironment();
    applyFallbackTranslations();
    bindTabs();
    disableMainControls();
    initAbout();
    setPane(initialPane());
    body.classList.remove('loading');
})();
