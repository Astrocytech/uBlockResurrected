/**
 * My Filters Test Helper Utilities
 * 
 * Provides mock implementation for testing My Filters (dashboard filters pane) functionality
 */

import { type Page, type BrowserContext } from '@playwright/test';
import * as path from 'path';

const DASHBOARD_PATH = path.resolve(__dirname, '../../src/dashboard.html');

/**
 * My Filters state during testing
 */
export interface MyFiltersState {
    hostnames: string[];
    selectors: Map<string, string[]>;
    isReadonly: boolean;
}

/**
 * Selectors for My Filters UI elements
 */
export const MY_FILTERS_SELECTORS = {
    // Main containers
    filtersPane: 'section[data-pane="filters"]',
    hostnamesList: 'section[data-pane="filters"] .hostnames',
    importExportSection: 'section[data-pane="filters"] .importFromText',
    
    // Hostname elements
    hostnameItem: 'li.hostname',
    hostnameSpan: 'li.hostname span.hostname',
    hostnameRemove: 'li.hostname span.remove',
    hostnameUndo: 'li.hostname span.undo',
    
    // Selector elements  
    selectorItem: 'li.selector',
    selectorSpan: 'li.selector span.selector',
    selectorRemove: 'li.selector span.remove',
    selectorUndo: 'li.selector span.undo',
    selectorsList: 'li.hostname ul.selectors',
    
    // Import/Export
    importTextarea: 'section[data-pane="filters"] .importFromText textarea',
    addButton: 'section[data-pane="filters"] [data-i18n="addButton"]',
    importButton: 'section[data-pane="filters"] [data-i18n="importAndAppendButton"]',
    exportButton: 'section[data-pane="filters"] [data-i18n="exportButton"]',
    importFileInput: 'section[data-pane="filters"] input[type="file"]',
    
    // Templates
    hostnameTemplate: 'template#customFiltersHostname',
    selectorTemplate: 'template#customFiltersSelector',
    
    // State indicators
    readonlyClass: 'body.readonly',
    removedClass: 'li.selector.removed, li.hostname.removed',
} as const;

/**
 * Test filter data
 */
export const TEST_FILTERS = {
    valid: [
        'example.com##.ad-banner',
        'example.com##div[id="promo"]',
        'test.org##.sidebar-ad',
        'example.com##.popup-ad { display: none; }',
    ],
    invalid: [
        'invalid..hostname##.ad',
        '',
        '$$$invalid$$$',
    ],
    cosmetic: [
        'example.com##.ad-banner',
        'example.com###sponsored',
        'example.com##div[class*="ad-"]',
    ],
    procedural: [
        'example.com##.ad-banner:has(> img)',
        'example.com##div:style(display: none)',
    ],
    global: [
        '##.global-ad',
        '###popup',
    ],
} as const;

/**
 * MyFiltersTestHelper class
 */
export class MyFiltersTestHelper {
    private page: Page;
    private context: BrowserContext;
    
    constructor(page: Page, context: BrowserContext) {
        this.page = page;
        this.context = context;
    }
    
    /**
     * Navigate to dashboard page
     */
    async navigateToDashboard(): Promise<void> {
        await this.page.goto(`file://${DASHBOARD_PATH}`);
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForSelector(MY_FILTERS_SELECTORS.filtersPane);
    }
    
    /**
     * Switch to filters pane
     */
    async switchToFiltersPane(): Promise<void> {
        await this.page.click('button.tabButton[data-pane="filters"]');
        await this.page.waitForSelector(MY_FILTERS_SELECTORS.filtersPane);
    }
    
    /**
     * Get current hostname list from DOM
     */
    async getHostnames(): Promise<string[]> {
        return await this.page.evaluate(() => {
            const hostnames: string[] = [];
            document.querySelectorAll('li.hostname span.hostname').forEach(el => {
                const pretty = el.getAttribute('data-pretty');
                if (pretty) hostnames.push(pretty);
            });
            return hostnames;
        });
    }
    
    /**
     * Get selectors for a specific hostname
     */
    async getSelectorsForHostname(hostname: string): Promise<string[]> {
        return await this.page.evaluate((hn) => {
            const selectors: string[] = [];
            const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
            if (hostnameLi) {
                hostnameLi.querySelectorAll('li.selector span.selector').forEach(el => {
                    const pretty = el.getAttribute('data-pretty');
                    if (pretty) selectors.push(pretty);
                });
            }
            return selectors;
        }, hostname);
    }
    
    /**
     * Check if readonly mode is active
     */
    async isReadonlyMode(): Promise<boolean> {
        return await this.page.evaluate(() => {
            return document.body.classList.contains('readonly');
        });
    }
    
    /**
     * Check if selector is marked as removed
     */
    async isSelectorRemoved(hostname: string, selector: string): Promise<boolean> {
        return await this.page.evaluate(([hn, sel]) => {
            const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
            if (!hostnameLi) return false;
            const selectorLi = Array.from(hostnameLi.querySelectorAll('li.selector'))
                .find(el => el.querySelector('.selector')?.getAttribute('data-pretty') === sel);
            return selectorLi?.classList.contains('removed') ?? false;
        }, [hostname, selector]);
    }
    
    /**
     * Add a filter via import
     */
    async importFilter(filterText: string): Promise<void> {
        await this.page.fill(MY_FILTERS_SELECTORS.importTextarea, filterText);
        await this.page.click(MY_FILTERS_SELECTORS.addButton);
    }
    
    /**
     * Import filters from file
     */
    async importFromFile(filePath: string): Promise<void> {
        const fileInput = await this.page.locator(MY_FILTERS_SELECTORS.importFileInput);
        await fileInput.setInputFiles(filePath);
    }
    
    /**
     * Get export file content
     */
    async getExportContent(): Promise<string> {
        return await this.page.evaluate(() => {
            // This would be triggered by export button
            // In tests, we simulate the export logic
            const lines: string[] = [];
            document.querySelectorAll('li.hostname').forEach(hostnameLi => {
                const hostnameSpan = hostnameLi.querySelector('.hostname');
                const hostname = hostnameSpan?.getAttribute('data-pretty') || '';
                hostnameLi.querySelectorAll('li.selector:not(.removed) .selector').forEach(sel => {
                    const selector = sel.getAttribute('data-pretty') || '';
                    lines.push(`${hostname}##${selector}`);
                });
            });
            return lines.join('\n');
        });
    }
    
    /**
     * Edit a hostname inline
     */
    async editHostname(oldHostname: string, newHostname: string): Promise<void> {
        await this.page.evaluate(([oldHn, newHn]) => {
            const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === oldHn);
            const span = hostnameLi?.querySelector('.hostname') as HTMLElement;
            if (span) {
                span.textContent = newHn;
                span.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        }, [oldHostname, newHostname]);
    }
    
    /**
     * Edit a selector inline
     */
    async editSelector(hostname: string, oldSelector: string, newSelector: string): Promise<void> {
        await this.page.evaluate(([hn, oldSel, newSel]) => {
            const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
            const selectorLi = Array.from(hostnameLi?.querySelectorAll('li.selector') || [])
                .find(el => el.querySelector('.selector')?.getAttribute('data-pretty') === oldSel);
            const span = selectorLi?.querySelector('.selector') as HTMLElement;
            if (span) {
                span.textContent = newSel;
                span.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        }, [hostname, oldSelector, newSelector]);
    }
    
    /**
     * Click remove button on a selector
     */
    async removeSelector(hostname: string, selector: string): Promise<void> {
        await this.page.evaluate(([hn, sel]) => {
            const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
            const selectorLi = Array.from(hostnameLi?.querySelectorAll('li.selector') || [])
                .find(el => el.querySelector('.selector')?.getAttribute('data-pretty') === sel);
            const removeBtn = selectorLi?.querySelector('.remove');
            if (removeBtn) {
                (removeBtn as HTMLElement).click();
            }
        }, [hostname, selector]);
    }
    
    /**
     * Click undo button on a selector
     */
    async undoRemoveSelector(hostname: string, selector: string): Promise<void> {
        await this.page.evaluate(([hn, sel]) => {
            const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
            const selectorLi = Array.from(hostnameLi?.querySelectorAll('li.selector') || [])
                .find(el => el.querySelector('.selector')?.getAttribute('data-pretty') === sel);
            const undoBtn = selectorLi?.querySelector('.undo');
            if (undoBtn) {
                (undoBtn as HTMLElement).click();
            }
        }, [hostname, selector]);
    }
    
    /**
     * Count hostname items
     */
    async getHostnameCount(): Promise<number> {
        return await this.page.locator(MY_FILTERS_SELECTORS.hostnameItem).count();
    }
    
    /**
     * Count selector items for a hostname
     */
    async getSelectorCount(hostname: string): Promise<number> {
        return await this.page.evaluate((hn) => {
            const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
            return hostnameLi?.querySelectorAll('li.selector').length ?? 0;
        }, hostname);
    }
    
    /**
     * Clear all filters (for cleanup)
     */
    async clearAllFilters(): Promise<void> {
        await this.page.evaluate(() => {
            const hostnames = document.querySelectorAll('li.hostname');
            hostnames.forEach(hn => hn.remove());
        });
    }
    
    /**
     * Wait for readonly mode to be removed
     */
    async waitForReadonlyRemoved(timeout: number = 5000): Promise<void> {
        await this.page.waitForFunction(() => {
            return !document.body.classList.contains('readonly');
        }, { timeout });
    }
    
    /**
     * Simulate external storage change
     */
    async simulateStorageChange(hostname: string, selectors: string[]): Promise<void> {
        await this.page.evaluate(([hn, sels]) => {
            // Dispatch storage event
            const event = new StorageEvent('storage', {
                key: `site.${hn}`,
                newValue: JSON.stringify(sels),
                storageArea: localStorage
            });
            window.dispatchEvent(event);
        }, [hostname, selectors]);
    }
    
    /**
     * Get data-ugly attribute value
     */
    async getUglyValue(hostname: string, isHostname: boolean = true): Promise<string | null> {
        return await this.page.evaluate(([hn, isHn]) => {
            if (isHn) {
                const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                    .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
                return hostnameLi?.querySelector('.hostname')?.getAttribute('data-ugly') ?? null;
            } else {
                const hostnameLi = Array.from(document.querySelectorAll('li.hostname'))
                    .find(el => el.querySelector('.hostname')?.getAttribute('data-pretty') === hn);
                const selectorLi = hostnameLi?.querySelector('li.selector');
                return selectorLi?.querySelector('.selector')?.getAttribute('data-ugly') ?? null;
            }
        }, [hostname, isHostname]);
    }
}

/**
 * Setup mock filter storage for tests
 */
export async function setupMockFilterStorage(page: Page, filters: Record<string, string[]>): Promise<void> {
    await page.evaluate((filterData) => {
        // Setup mock storage
        for (const [hostname, selectors] of Object.entries(filterData)) {
            localStorage.setItem(`site.${hostname}`, JSON.stringify(selectors));
        }
    }, filters);
}

/**
 * Clear mock filter storage
 */
export async function clearMockFilterStorage(page: Page): Promise<void> {
    await page.evaluate(() => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('site.'));
        keys.forEach(k => localStorage.removeItem(k));
    });
}
