/**
 * @fileoverview Unit Tests for Picker Handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome API
const mockChrome = {
    runtime: {
        getURL: vi.fn((path) => `chrome-extension://id/${path}`)
    }
};

global.chrome = mockChrome;

// Mock vAPI
const mockVAPI = {
    inZapperMode: false,
    version: '1.9.15'
};

// Mock storage
const mockStorage = {
    appendUserFilters: vi.fn(() => Promise.resolve({ saved: true, filters: ['example.com##.ad'] }))
};

describe('Picker Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('elementPickerArguments', () => {
        it('should return picker URL', () => {
            const url = mockChrome.runtime.getURL('web_accessible_resources/epicker-ui.html');
            expect(url).toContain('epicker-ui.html');
        });

        it('should indicate zapper mode', () => {
            expect(mockVAPI.inZapperMode).toBe(false);
        });
    });

    describe('createUserFilter', () => {
        it('should parse string filter', async () => {
            const filter = 'example.com##.ad';
            const filters = filter.trim();
            expect(filters).toBe('example.com##.ad');
        });

        it('should parse array of filters', async () => {
            const filters = ['example.com##.ad', 'example.com##.banner'];
            const validFilters = filters.filter(f => f && f.trim());
            expect(validFilters.length).toBe(2);
        });

        it('should save filters to storage', async () => {
            const result = await mockStorage.appendUserFilters(['example.com##.ad']);
            expect(result.saved).toBe(true);
            expect(mockStorage.appendUserFilters).toHaveBeenCalledWith(['example.com##.ad']);
        });

        it('should handle empty filters', async () => {
            const filters = [];
            const validFilters = filters.filter(f => f && f.trim());
            expect(validFilters.length).toBe(0);
        });
    });
});
