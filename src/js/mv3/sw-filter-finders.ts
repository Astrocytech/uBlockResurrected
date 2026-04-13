/*******************************************************************************

    uBlock Origin - MV3 Filter List Finders
    Helper functions to find filter lists by filter content

*******************************************************************************/

export const findFilterListFromNetFilter = async (rawFilter: string): Promise<any[]> => {
    const results: any[] = [];
    if (!rawFilter || rawFilter.trim() === '') {
        return results;
    }
    
    const normalizedFilter = rawFilter.trim().toLowerCase();
    const isWhitelist = normalizedFilter.startsWith('@@');
    const filterPattern = isWhitelist ? normalizedFilter.slice(2) : normalizedFilter;
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        const userFiltersContent = stored.userFilters || '';
        
        if (userFiltersContent.toLowerCase().includes(filterPattern)) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                if (content.includes(filterPattern) || content.includes(normalizedFilter)) {
                    results.push({
                        assetKey: listKey,
                        title: listInfo.title,
                        supportURL: listInfo.supportURL || '',
                        description: listInfo.description || '',
                        type: 'list',
                    });
                }
            }
        }
        
    } catch (e) {
        console.error('[MV3] findFilterListFromNetFilter error:', e);
    }
    return results;
};

export const findFilterListFromCosmeticFilter = async (rawFilter: string): Promise<any[]> => {
    const results: any[] = [];
    if (!rawFilter || rawFilter.trim() === '') {
        return results;
    }
    
    const normalizedFilter = rawFilter.trim().toLowerCase();
    const isException = normalizedFilter.startsWith('##');
    const filterPattern = isException ? normalizedFilter.slice(2) : normalizedFilter;
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        const userFiltersContent = stored.userFilters || '';
        
        if (userFiltersContent.toLowerCase().includes(filterPattern)) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                if (content.includes(filterPattern) || content.includes(normalizedFilter)) {
                    results.push({
                        assetKey: listKey,
                        title: listInfo.title,
                        supportURL: listInfo.supportURL || '',
                        description: listInfo.description || '',
                        type: 'list',
                    });
                }
            }
        }
        
    } catch (e) {
        console.error('[MV3] findFilterListFromCosmeticFilter error:', e);
    }
    return results;
};
