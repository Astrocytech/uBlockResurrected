/*******************************************************************************

    uBlock Origin - MV3 Filter List Finders
    Helper functions to find filter lists by filter content

*******************************************************************************/

export const findFilterListFromNetFilter = async (rawFilter: string): Promise<any[]> => {
    const results: any[] = [];
    if (!rawFilter || rawFilter.trim() === '') {
        return results;
    }
    
    // Normalize the filter for searching
    const normalizedFilter = rawFilter.trim().toLowerCase();
    const isWhitelist = normalizedFilter.startsWith('@@');
    const filterPattern = isWhitelist ? normalizedFilter.slice(2) : normalizedFilter;
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        // Also check user filters
        const userFiltersContent = stored.userFilters || '';
        
        // Check user filters first
        if (userFiltersContent.toLowerCase().includes(filterPattern)) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        // Check selected filter lists
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                // Check for exact match or partial match
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
    
    // Normalize cosmetic filter for searching
    // Remove ## or #@# prefix
    const normalizedFilter = rawFilter.trim()
        .replace(/^##/, '')
        .replace(/^#@#/, '')
        .replace(/^#@/, '')
        .replace(/^##/, '')
        .toLowerCase();
    
    try {
        const stored = await chrome.storage.local.get(['filterLists', 'selectedFilterLists', 'userFilters']);
        const selectedFilterLists = stored.selectedFilterLists || [];
        const filterLists = stored.filterLists || {};
        
        // Check user filters for cosmetic rules
        const userFiltersContent = stored.userFilters || '';
        if (userFiltersContent.toLowerCase().includes(normalizedFilter) || 
            userFiltersContent.toLowerCase().includes(rawFilter.trim().toLowerCase())) {
            results.push({
                assetKey: 'user',
                title: 'My filters',
                supportURL: '',
                type: 'user',
            });
        }
        
        // Check selected filter lists for cosmetic rules
        for (const listKey of selectedFilterLists) {
            const listInfo = filterLists[listKey as string] as any;
            if (listInfo && listInfo.title && listInfo.content) {
                const content = listInfo.content.toLowerCase();
                // Look for cosmetic filter patterns
                if (content.includes(`##${normalizedFilter}`) || 
                    content.includes(`#@#${normalizedFilter}`) ||
                    content.includes(rawFilter.trim().toLowerCase())) {
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
