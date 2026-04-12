/*******************************************************************************

    uBlock Resurrected - Matched Rules Debug Module for MV3
    Copyright (C) 2024-present Raymond Hill

    This module handles the matched rules debugging feature using
    declarativeNetRequestFeedback permission.

******************************************************************************/

const MAX_MATCHED_RULES = 500;

class MatchedRulesDebug {
    private matchedRulesBuffer: Map<number, any[]> = new Map();
    private listener: ((details: any) => void) | null = null;
    private isListening: boolean = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        if (typeof browser?.declarativeNetRequest?.onRuleMatchedDebug === 'undefined') {
            console.log('[Debug] onRuleMatchedDebug not available');
            return;
        }

        console.log('[Debug] Matched rules debug module initialized');
    }

    toggleDeveloperMode(state: boolean): void {
        if (typeof browser?.declarativeNetRequest?.onRuleMatchedDebug === 'undefined') {
            console.log('[Debug] Cannot toggle developer mode - API not available');
            return;
        }

        if (state && !this.isListening) {
            this.setupListener();
        } else if (!state && this.isListening) {
            this.removeListener();
        }
    }

    private setupListener(): void {
        if (this.isListening) return;

        this.listener = (details: any) => {
            this.addMatchedRule(details);
        };

        browser.declarativeNetRequest.onRuleMatchedDebug.addListener(this.listener);
        this.isListening = true;
        console.log('[Debug] Developer mode enabled - listening for matched rules');
    }

    private removeListener(): void {
        if (!this.isListening || !this.listener) return;

        browser.declarativeNetRequest.onRuleMatchedDebug.removeListener(this.listener);
        this.listener = null;
        this.isListening = false;
        console.log('[Debug] Developer mode disabled');
    }

    private addMatchedRule(details: any): void {
        const tabId = details.tabId || 0;
        
        let tabRules = this.matchedRulesBuffer.get(tabId);
        if (!tabRules) {
            tabRules = [];
            this.matchedRulesBuffer.set(tabId, tabRules);
        }

        const ruleInfo = this.formatRuleDetails(details);
        tabRules.push(ruleInfo);

        if (tabRules.length > MAX_MATCHED_RULES) {
            tabRules.shift();
        }
    }

    private formatRuleDetails(details: any): any {
        return {
            timestamp: Date.now(),
            request: {
                url: details.request?.url || '',
                method: details.request?.method || '',
                type: details.request?.type || '',
                frameId: details.request?.frameId || 0,
                tabId: details.request?.tabId || 0,
                initiator: details.request?.initiator || '',
            },
            rule: {
                id: details.rule?.id || 0,
                ruleId: details.rule?.ruleId || 0,
                rulesetId: details.rule?.rulesetId || '',
                source: details.rule?.source || '',
                action: details.rule?.action?.type || '',
                filter: details.rule?.action?.filter || '',
            }
        };
    }

    async getMatchedRules(tabId?: number): Promise<any[]> {
        if (tabId !== undefined) {
            return this.matchedRulesBuffer.get(tabId) || [];
        }

        const allRules: any[] = [];
        for (const [, rules] of this.matchedRulesBuffer) {
            allRules.push(...rules);
        }

        allRules.sort((a, b) => b.timestamp - a.timestamp);
        
        return allRules.slice(0, MAX_MATCHED_RULES);
    }

    clearMatchedRules(tabId?: number): void {
        if (tabId !== undefined) {
            this.matchedRulesBuffer.delete(tabId);
        } else {
            this.matchedRulesBuffer.clear();
        }
    }

    get isEnabled(): boolean {
        return this.isListening;
    }
}

const debug = new MatchedRulesDebug();

export { debug, MatchedRulesDebug };
export default debug;