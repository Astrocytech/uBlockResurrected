/**
 * Mock System for UI Tests
 * 
 * Provides state machines and mock responses for backend simulation.
 * This allows UI tests to run without requiring the actual backend.
 */

// State types
export interface PopupState {
    hasActiveTab: boolean;
    enabled: boolean;
    hostname: string;
    blockedCount: number;
    domainCount: number;
    totalCount: number;
    version: string;
}

export interface FilterState {
    filters: string[];
    status: 'idle' | 'saving' | 'saved' | 'error' | 'deleting';
    errorMessage?: string;
}

export interface PickerState {
    mode: 'normal' | 'picking' | 'zap' | 'paused';
    hasFilter: boolean;
    filterText: string;
    candidateCount: number;
    isCreating: boolean;
}

// Popup state machine
export const POPUP_STATES: Record<string, PopupState> = {
    loading: {
        hasActiveTab: false,
        enabled: false,
        hostname: '',
        blockedCount: 0,
        domainCount: 0,
        totalCount: 0,
        version: '1.0.0',
    },
    noTab: {
        hasActiveTab: false,
        enabled: false,
        hostname: '',
        blockedCount: 0,
        domainCount: 0,
        totalCount: 0,
        version: '1.0.0',
    },
    activeDisabled: {
        hasActiveTab: true,
        enabled: false,
        hostname: 'example.com',
        blockedCount: 0,
        domainCount: 0,
        totalCount: 0,
        version: '1.0.0',
    },
    activeEnabled: {
        hasActiveTab: true,
        enabled: true,
        hostname: 'example.com',
        blockedCount: 12,
        domainCount: 3,
        totalCount: 1547,
        version: '1.0.0',
    },
};

// Filter state machine
export const FILTER_STATES: Record<string, FilterState> = {
    empty: {
        filters: [],
        status: 'idle',
    },
    withFilters: {
        filters: [
            '||example.com^',
            '||ads.example.net^',
            '##.advertisement',
            '##.sidebar-ad',
        ],
        status: 'idle',
    },
    saving: {
        filters: ['||example.com^'],
        status: 'saving',
    },
    saved: {
        filters: ['||example.com^', '##.advertisement'],
        status: 'saved',
    },
    error: {
        filters: ['||example.com^'],
        status: 'error',
        errorMessage: 'Invalid filter syntax',
    },
    deleting: {
        filters: ['||example.com^', '##.advertisement'],
        status: 'deleting',
    },
};

// Picker state machine
export const PICKER_STATES: Record<string, PickerState> = {
    initial: {
        mode: 'normal',
        hasFilter: false,
        filterText: '',
        candidateCount: 0,
        isCreating: false,
    },
    picking: {
        mode: 'picking',
        hasFilter: false,
        filterText: '',
        candidateCount: 5,
        isCreating: false,
    },
    withFilter: {
        mode: 'normal',
        hasFilter: true,
        filterText: '##.advertisement',
        candidateCount: 3,
        isCreating: false,
    },
    creating: {
        mode: 'normal',
        hasFilter: true,
        filterText: '##.advertisement',
        candidateCount: 3,
        isCreating: true,
    },
    zapMode: {
        mode: 'zap',
        hasFilter: false,
        filterText: '',
        candidateCount: 0,
        isCreating: false,
    },
    paused: {
        mode: 'paused',
        hasFilter: false,
        filterText: '',
        candidateCount: 0,
        isCreating: false,
    },
};

// Mock messaging responses
export const MOCK_MESSAGING_RESPONSES: Record<string, unknown> = {
    getPopupData: {
        advancedUserEnabled: true,
        appName: 'uBlock Resurrected',
        appVersion: '1.0.0',
        colorBlindFriendly: false,
        enabled: true,
        hostname: 'example.com',
        domain: 'example.com',
        siteUrl: 'https://example.com/',
        blockedCount: 12,
        domainCount: 3,
        totalBlockedCount: 1547,
        popupPanelDisabledSections: [],
        popupPanelEnabledSections: ['basicTools', 'extraTools', 'firewall', 'sticky'],
        hasRequestStats: true,
    },
    getSettings: {
        collapseBlocked: true,
        showIconBadge: true,
        contextMenuEnabled: true,
        cloudStorageEnabled: false,
        prefetchingDisabled: true,
        hyperlinkAuditingDisabled: true,
        noCSPReports: true,
        colorBlindFriendly: false,
        advancedUserEnabled: true,
        uiTheme: 'auto',
    },
    getAutoCompleteDetails: {
        filters: [],
        filterParts: [],
    },
    elementPickerArguments: {
        pickerURL: 'web_accessible_resources/epicker-ui.html',
        tabId: 1,
        zapMode: false,
    },
    launchElementPicker: {
        success: true,
    },
    createUserFilter: {
        success: true,
    },
};

// Mock storage data
export const MOCK_STORAGE: Record<string, unknown> = {
    settings: MOCK_MESSAGING_RESPONSES.getSettings,
    userFilters: ['||example.com^', '##.ad'],
    dynamicRules: [],
    staticRules: [],
    lastUpdate: Date.now(),
};

/**
 * Mock vAPI.messaging.send for tests
 */
export function createMockMessaging() {
    return {
        send: jest.fn((channel: string, message: { what: string }) => {
            // Return appropriate mock response based on channel and message type
            if (message.what === 'getPopupData') {
                return Promise.resolve(MOCK_MESSAGING_RESPONSES.getPopupData);
            }
            if (message.what === 'getSettings') {
                return Promise.resolve(MOCK_MESSAGING_RESPONSES.getSettings);
            }
            if (message.what === 'getAutoCompleteDetails') {
                return Promise.resolve(MOCK_MESSAGING_RESPONSES.getAutoCompleteDetails);
            }
            if (message.what === 'elementPickerArguments') {
                return Promise.resolve(MOCK_MESSAGING_RESPONSES.elementPickerArguments);
            }
            if (message.what === 'launchElementPicker') {
                return Promise.resolve(MOCK_MESSAGING_RESPONSES.launchElementPicker);
            }
            return Promise.resolve(null);
        }),
    };
}

/**
 * Helper to create a state transition helper
 */
export function createStateHelper<T extends Record<string, unknown>>(
    initialState: string,
    states: Record<string, T>
) {
    let currentState = initialState;

    return {
        getState: () => states[currentState],
        getStateName: () => currentState,
        transitionTo: (newState: string) => {
            if (states[newState]) {
                currentState = newState;
                return states[currentState];
            }
            throw new Error(`Unknown state: ${newState}`);
        },
        canTransitionTo: (newState: string) => newState in states,
        getAvailableStates: () => Object.keys(states),
    };
}

/**
 * Create popup state helper
 */
export function createPopupStateHelper() {
    return createStateHelper('loading', POPUP_STATES);
}

/**
 * Create filter state helper
 */
export function createFilterStateHelper() {
    return createStateHelper('empty', FILTER_STATES);
}

/**
 * Create picker state helper
 */
export function createPickerStateHelper() {
    return createStateHelper('initial', PICKER_STATES);
}
