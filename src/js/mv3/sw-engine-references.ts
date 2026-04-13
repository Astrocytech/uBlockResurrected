/*******************************************************************************

    uBlock Origin - MV3 Service Worker Engine References
    Handles extracting and setting up engine references from legacy backend

*******************************************************************************/

export const setEngineReferences = () => {
    try {
        const cosmeticFilteringEngine = (globalThis as any).vAPI?.cosmeticFilteringEngine || (globalThis as any).cosmeticFilteringEngine;
        const staticNetFilteringEngine = (globalThis as any).vAPI?.staticNetFilteringEngine || (globalThis as any).staticNetFilteringEngine;
        const staticExtFilteringEngine = (globalThis as any).vAPI?.staticExtFilteringEngine || (globalThis as any).staticExtFilteringEngine;
        const logger = (globalThis as any).vAPI?.logger || (globalThis as any).logger;
        const µb = (globalThis as any).vAPI?.µb || (globalThis as any).µb;
        let filteringContext = (globalThis as any).vAPI?.filteringContext || (globalThis as any).filteringContext;
        const filteringEngines = (globalThis as any).vAPI?.filteringEngines || (globalThis as any).filteringEngines;
        const io = (globalThis as any).vAPI?.io || (globalThis as any).io;
        const publicSuffixList = (globalThis as any).vAPI?.publicSuffixList || (globalThis as any).publicSuffixList;
        
        const redirectEngine = (globalThis as any).vAPI?.redirectEngine || (globalThis as any).redirectEngine;
        const staticFilteringReverseLookup = (globalThis as any).vAPI?.staticFilteringReverseLookup;
        const scriptletFilteringEngine = (globalThis as any).vAPI?.scriptletFilteringEngine;
        const htmlFilteringEngine = (globalThis as any).vAPI?.htmlFilteringEngine;
        const permanentURLFiltering = (globalThis as any).vAPI?.permanentURLFiltering;
        const sessionURLFiltering = (globalThis as any).vAPI?.sessionURLFiltering;
        const webRequest = (globalThis as any).vAPI?.webRequest;
        
        (globalThis as any).vAPI.redirectEngine = redirectEngine;
        (globalThis as any).vAPI.staticFilteringReverseLookup = staticFilteringReverseLookup;
        (globalThis as any).vAPI.scriptletFilteringEngine = scriptletFilteringEngine;
        (globalThis as any).vAPI.htmlFilteringEngine = htmlFilteringEngine;
        (globalThis as any).vAPI.permanentURLFiltering = permanentURLFiltering;
        (globalThis as any).vAPI.sessionURLFiltering = sessionURLFiltering;
        (globalThis as any).vAPI.webRequest = webRequest;
        
        if (!filteringContext) {
            const createFilterContext = (init?: Partial<{
                hostname: string; url: string; origin: string; type: string; realm: string; filter: unknown;
            }>) => {
                const state = init || {};
                const ctx = {
                    duplicate: () => createFilterContext(state),
                    fromTabId: async (tabId: number) => {
                        try {
                            const tab = await chrome.tabs.get(tabId);
                            if (tab?.url) {
                                const url = new URL(tab.url);
                                const newState = { ...state, hostname: url.hostname, url: url.href, origin: url.origin };
                                return createFilterContext(newState);
                            }
                        } catch (e) {}
                        return createFilterContext({});
                    },
                    setType: (type: string) => {
                        return createFilterContext({ ...state, type });
                    },
                    setURL: (url: string) => {
                        try {
                            const parsed = new URL(url);
                            return createFilterContext({ ...state, url: parsed.href, hostname: parsed.hostname, origin: parsed.origin });
                        } catch {
                            return ctx;
                        }
                    },
                    setDocOriginFromURL: (url: string) => {
                        try {
                            const parsed = new URL(url);
                            return createFilterContext({ ...state, origin: parsed.origin });
                        } catch {
                            return ctx;
                        }
                    },
                    setRealm: (realm: string) => {
                        return createFilterContext({ ...state, realm });
                    },
                    setFilter: (filter: unknown) => {
                        return createFilterContext({ ...state, filter });
                    },
                    toLogger: () => {
                        if (logger?.enabled) {
                            logger.writeOne({
                                tabId: 0,
                                realm: state.realm || 'network',
                                type: 'filter',
                                text: state.url || '',
                                filter: state.filter,
                            });
                        }
                    },
                    get hostname() { return state.hostname || ''; },
                    get url() { return state.url || ''; },
                    get origin() { return state.origin || ''; },
                    get type() { return state.type || ''; },
                    get realm() { return state.realm || 'network'; },
                    get filter() { return state.filter; },
                };
                return ctx;
            };
            
            const createRootFilterContext = () => {
                const state: any = {};
                
                const ctx = {
                    duplicate: () => createFilterContext({ ...state }),
                    fromTabId: async (tabId: number) => {
                        try {
                            const tab = await chrome.tabs.get(tabId);
                            if (tab?.url) {
                                const url = new URL(tab.url);
                                return createFilterContext({ hostname: url.hostname, url: url.href, origin: url.origin });
                            }
                        } catch (e) {}
                        return createFilterContext({});
                    },
                    setRealm: function(this: any, realm: string) {
                        state.realm = realm;
                        return this;
                    },
                    setType: function(this: any, type: string) {
                        state.type = type;
                        return this;
                    },
                    setURL: function(this: any, url: string) {
                        state.url = url;
                        try {
                            const parsed = new URL(url);
                            state.hostname = parsed.hostname;
                            state.origin = parsed.origin;
                        } catch (e) {}
                        return this;
                    },
                    setDocOriginFromURL: function(this: any, url: string) {
                        try {
                            const parsed = new URL(url);
                            state.docOrigin = parsed.origin;
                        } catch (e) {}
                        return this;
                    },
                    toLogger: function() {
                        if (logger?.log) {
                            logger.log(state);
                        }
                    },
                    get hostname() { return state.hostname || ''; },
                    get url() { return state.url || ''; },
                    get origin() { return state.origin || ''; },
                    get type() { return state.type || ''; },
                    get realm() { return state.realm || 'network'; },
                    get filter() { return state.filter; },
                };
                return ctx;
            };
            
            filteringContext = createRootFilterContext();
        }

        return {
            cosmeticFilteringEngine,
            staticNetFilteringEngine,
            staticExtFilteringEngine,
            logger,
            µb,
            filteringContext,
            filteringEngines,
            io,
            publicSuffixList,
            redirectEngine,
            staticFilteringReverseLookup,
            scriptletFilteringEngine,
            htmlFilteringEngine,
            permanentURLFiltering,
            sessionURLFiltering,
            webRequest,
        };
    } catch (e) {
        console.log('[MV3] Could not get engine references:', e);
        return null;
    }
};
