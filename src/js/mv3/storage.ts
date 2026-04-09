export const storage = {
    async readUserFilters(): Promise<{ content: string }> {
        const data = await browser.storage.local.get('user-filters');
        const value = data['user-filters'];
        if ( typeof value === 'string' ) {
            return { content: value };
        }
        return { content: '' };
    },
};
