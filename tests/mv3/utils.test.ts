/**
 * @fileoverview Unit Tests for MV3 Utils Module
 */

import { describe, it, expect } from 'vitest';
import { parseHostname, matchHostname, toValidHostname, CONSTANTS } from '../../src/js/mv3/utils.ts';

describe('parseHostname', () => {
    it('should parse valid HTTP URL', () => {
        const result = parseHostname('https://example.com/path');
        expect(result.hostname).toBe('example.com');
        expect(result.domain).toBe('example.com');
        expect(result.protocol).toBe('https:');
    });

    it('should parse URL with subdomain', () => {
        const result = parseHostname('https://sub.example.com/path');
        expect(result.hostname).toBe('sub.example.com');
        expect(result.domain).toBe('example.com');
    });

    it('should handle invalid URL gracefully', () => {
        const result = parseHostname('not-a-url');
        expect(result.hostname).toBe('');
        expect(result.domain).toBe('');
    });

    it('should handle empty string', () => {
        const result = parseHostname('');
        expect(result.hostname).toBe('');
        expect(result.domain).toBe('');
    });
});

describe('matchHostname', () => {
    it('should match exact hostname', () => {
        expect(matchHostname('example.com', 'example.com', 'example.com')).toBe(true);
    });

    it('should not match different hostname', () => {
        expect(matchHostname('example.com', 'other.com', 'other.com')).toBe(false);
    });

    it('should match wildcard subdomain', () => {
        expect(matchHostname('sub.example.com', '*.example.com', 'example.com')).toBe(true);
    });

    it('should match empty filter hostname (match all)', () => {
        expect(matchHostname('any.com', '', '')).toBe(true);
    });
});

describe('toValidHostname', () => {
    it('should trim whitespace', () => {
        expect(toValidHostname('  example.com  ')).toBe('example.com');
    });

    it('should lowercase', () => {
        expect(toValidHostname('EXAMPLE.COM')).toBe('example.com');
    });

    it('should remove leading dot', () => {
        expect(toValidHostname('.example.com')).toBe('example.com');
    });

    it('should return empty string for invalid input', () => {
        expect(toValidHostname('')).toBe('');
    });
});

describe('CONSTANTS', () => {
    it('should have DNR constants', () => {
        expect(CONSTANTS.DNR.WHITELIST_RULE_START).toBe(10000);
        expect(CONSTANTS.DNR.WHITELIST_RULE_END).toBe(20000);
        expect(CONSTANTS.DNR.MAX_STATIC_RULES).toBe(30000);
    });

    it('should have filter constants', () => {
        expect(CONSTANTS.FILTERS.SELECTOR_SEPARATOR).toBe('##');
        expect(CONSTANTS.FILTERS.COMMENT_PREFIX).toBe('!');
    });
});
