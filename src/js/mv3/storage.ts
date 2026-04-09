export const storage = {
    async readUserFilters(): Promise<{ content: string }> {
        const data = await browser.storage.local.get('userFilters');
        const value = data.userFilters;
        if ( typeof value === 'string' ) {
            return { content: value };
        }
        if (
            value instanceof Object &&
            typeof (value as { content?: unknown }).content === 'string'
        ) {
            return { content: (value as { content: string }).content };
        }
        return { content: '' };
    },
};
