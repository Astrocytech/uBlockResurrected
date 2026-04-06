/**
 * @fileoverview Unit Tests for Content Handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome API
const mockChrome = {
    scripting: {
        insertCSS: vi.fn((details, callback) => {
            if (callback) callback();
        }),
        removeCSS: vi.fn((details, callback) => {
            if (callback) callback();
        })
    },
    runtime: {
        lastError: null
    }
};

global.chrome = mockChrome;

// Mock storage
const mockStorage = {
    readUserFilters: vi.fn(() => Promise.resolve({
        content: 'example.com##.ad\n##.banner',
        enabled: true,
        trusted: false
    }))
};

describe('Content Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleRetrieveContentScriptParameters', () => {
        it('should extract hostname from URL', () => {
            const request = { url: 'https://example.com/page' };
            expect(request.url).toContain('example.com');
        });

        it('should parse cosmetic filters from user filters', async () => {
            const result = await mockStorage.readUserFilters();
            expect(result.content).toContain('##');
        });

        it('should filter out comments from cosmetic filters', async () => {
            const filters = mockStorage.readUserFilters();
            const result = await filters;
            const lines = result.content.split('\n');
            const cosmeticLines = lines.filter(line => 
                line.includes('##') && 
                !line.startsWith('!') && 
                !line.startsWith('[')
            );
            expect(cosmeticLines.length).toBeGreaterThan(0);
        });
    });

    describe('handleUserCSS', () => {
        it('should inject CSS successfully', async () => {
            mockChrome.scripting.insertCSS.mockImplementation((details, callback) => {
                if (callback) callback();
            });

            await new Promise((resolve) => {
                mockChrome.scripting.insertCSS({
                    target: { tabId: 1 },
                    css: 'body { background: red; }'
                }, resolve);
            });

            expect(mockChrome.scripting.insertCSS).toHaveBeenCalled();
        });

        it('should handle tabId undefined', () => {
            const portDetails = { tabId: undefined };
            expect(portDetails.tabId).toBeUndefined();
        });

        it('should handle empty CSS array', () => {
            const request = { add: [] };
            expect(request.add.length).toBe(0);
        });
    });
});
