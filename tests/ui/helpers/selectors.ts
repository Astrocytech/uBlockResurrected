/**
 * Element Selectors for UI Tests
 * 
 * Centralized element selectors to maintain DRY principle
 * and make tests more maintainable.
 */

// Popup selectors
export const POPUP_SELECTORS = {
    // Main container
    body: 'body',
    panes: '#panes',
    main: '#main',
    
    // Power toggle
    powerButton: '#switch',
    
    // Zapper & Picker buttons
    zapperButton: '#gotoZap',
    pickerButton: '#gotoPick',
    reportButton: '#gotoReport',
    
    // Dashboard & Logger links
    dashboardLink: 'a[href="dashboard.html"]',
    loggerLink: 'a[href="logger-ui.html"]',
    
    // Hostname display
    hostname: '#hostname',
    
    // Tool buttons
    saveRules: '#saveRules',
    revertRules: '#revertRules',
    refresh: '#refresh',
    
    // Per-site switches (hnSwitch)
    noPopups: '#no-popups',
    noLargeMedia: '#no-large-media',
    noCosmeticFiltering: '#no-cosmetic-filtering',
    noRemoteFonts: '#no-remote-fonts',
    noScripting: '#no-scripting',
    
    // Stats display
    basicStats: '#basicStats',
    basicTools: '#basicTools',
    
    // Firewall section
    firewall: '#firewall',
    
    // Version display
    version: '#version',
    versionLabel: '#version + *',
    
    // More/Less buttons
    moreButton: '#moreButton',
    lessButton: '#lessButton',
    
    // Unprocessed warning
    unprocessedWarning: '#unprocessedRequestWarning',
} as const;

// Dashboard selectors
export const DASHBOARD_SELECTORS = {
    body: 'body',
    nav: '#dashboard-nav',
    
    // Navigation tabs
    settingsTab: '[data-pane="settings.html"]',
    thirdPartyTab: '[data-pane="3p-filters.html"]',
    firstPartyTab: '[data-pane="1p-filters.html"]',
    rulesTab: '[data-pane="dyna-rules.html"]',
    whitelistTab: '[data-pane="whitelist.html"]',
    supportTab: '[data-pane="support.html"]',
    aboutTab: '[data-pane="about.html"]',
    
    // Unsaved warning
    unsavedWarning: '#unsavedWarning',
    
    // Content iframe
    iframe: '#iframe',
    
    // Wiki link
    wikiLink: '.wikilink',
} as const;

// Element Picker selectors
export const PICKER_SELECTORS = {
    body: 'body',
    
    // Window bar buttons
    quitButton: '#quit',
    minimizeButton: '#minimize',
    moveHandle: '#move',
    
    // Action buttons
    pickButton: '#pick',
    previewButton: '#preview',
    createButton: '#create',
    
    // Filter editor
    codeMirrorContainer: '.CodeMirrorContainer',
    codeMirror: '.CodeMirror',
    
    // Filter candidates
    candidateFilters: '#candidateFilters',
    netFilters: '#netFilters',
    cosmeticFilters: '#cosmeticFilters',
    changeFilterList: '.changeFilter',
    
    // Result set widgets
    resultsetCount: '#resultsetCount',
    resultsetDepth: '#resultsetDepth',
    resultsetSpecificity: '#resultsetSpecificity',
    resultsetModifiers: '#resultsetModifiers',
    
    // Toolbar
    toolbar: '#toolbar',
    
    // SVG overlay
    sea: '#sea',
    
    // Container aside
    aside: 'aside',
} as const;

// Settings page selectors
export const SETTINGS_SELECTORS = {
    body: 'body',
    fieldset: '.fieldset',
    
    // Checkboxes
    collapseBlocked: '[data-setting-name="collapseBlocked"]',
    showIconBadge: '[data-setting-name="showIconBadge"]',
    contextMenuEnabled: '[data-setting-name="contextMenuEnabled"]',
    cloudStorageEnabled: '[data-setting-name="cloudStorageEnabled"]',
    prefetchingDisabled: '[data-setting-name="prefetchingDisabled"]',
    hyperlinkAuditingDisabled: '[data-setting-name="hyperlinkAuditingDisabled"]',
    noCSPReports: '[data-setting-name="noCSPReports"]',
    cnameUncloakEnabled: '[data-setting-name="cnameUncloakEnabled"]',
    
    // Theme settings
    uiTheme: '[data-setting-name="uiTheme"]',
    uiAccentCustom: '[data-setting-name="uiAccentCustom"]',
    colorBlindFriendly: '[data-setting-name="colorBlindFriendly"]',
    tooltipsDisabled: '[data-setting-name="tooltipsDisabled"]',
    
    // Advanced settings
    advancedUserEnabled: '[data-setting-name="advancedUserEnabled"]',
    
    // Per-site switches
    noCosmeticFiltering: '[data-setting-name="noCosmeticFiltering"]',
    noLargeMedia: '[data-setting-name="noLargeMedia"]',
    noRemoteFonts: '[data-setting-name="noRemoteFonts"]',
    noScripting: '[data-setting-name="noScripting"]',
    
    // Action buttons
    exportButton: '#export',
    importButton: '#import',
    resetButton: '#reset',
    
    // Storage info
    storageUsed: '#storageUsed',
} as const;

// 3rd-party filters page selectors
export const THIRD_PARTY_FILTERS_SELECTORS = {
    filterLists: '.filterList',
    updateNow: '#updateNow',
    applyButton: '#apply',
    listItems: 'li',
} as const;

// 1st-party/My filters selectors
export const MY_FILTERS_SELECTORS = {
    filterEditor: '#userFilters',
    filterList: '#filterList',
    addFilter: '#addFilter',
    removeFilter: '.removeFilter',
    saveFilter: '#saveFilter',
    filterInput: '#filterInput',
    emptyState: '.emptyState',
    filterItems: '.filterItem',
} as const;

// Helper type for selector values
export type SelectorKey = 
    | keyof typeof POPUP_SELECTORS 
    | keyof typeof DASHBOARD_SELECTORS
    | keyof typeof PICKER_SELECTORS
    | keyof typeof SETTINGS_SELECTORS;
