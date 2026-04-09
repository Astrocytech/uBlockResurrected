(function() {
    const root = document.documentElement;
    const body = document.body;
    const iframe = document.getElementById('iframe');
    const buttons = Array.from(document.querySelectorAll('.tabButton[data-pane]'));
    const validPanes = new Set([
        'settings.html',
        '3p-filters.html',
        '1p-filters.html',
        'dyna-rules.html',
        'whitelist.html',
        'support.html',
        'about.html',
        'no-dashboard.html',
    ]);

    const applyThemeClasses = () => {
        const dark = typeof self.matchMedia === 'function' &&
            self.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', dark);
        root.classList.toggle('light', dark === false);
    };

    const setPane = pane => {
        if ( validPanes.has(pane) === false ) { return; }
        for ( const button of buttons ) {
            button.classList.toggle('selected', button.dataset.pane === pane);
        }
        if ( iframe instanceof HTMLIFrameElement ) {
            iframe.src = pane;
        }
        if ( self.location.hash !== `#${pane}` ) {
            self.location.hash = pane;
        }
    };

    const bindTabs = () => {
        for ( const button of buttons ) {
            button.addEventListener('click', () => {
                const pane = button.dataset.pane || '';
                if ( pane === 'no-dashboard.html' ) { return; }
                setPane(pane);
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
    };

    bindTabs();
    initEnvironment();
    setPane(validPanes.has(self.location.hash.slice(1)) ? self.location.hash.slice(1) : 'settings.html');
    body.classList.remove('notReady');
})();
