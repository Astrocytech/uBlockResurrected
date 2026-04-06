export const REFRESH_DEBOUNCE_MS = 1000;
export const MAX_BUFFER_SIZE = 500;
export const QUOTA_WARNING_THRESHOLD = 20;
export const QUOTA_RESET_INTERVAL_MS = 600000;
export const SESSION_RULE_THRESHOLD = 1000000;
let lastRefreshTime = 0;
let refreshCount = 0;
let lastFailedAttemptTime = 0;
let isUiOpen = false;
export function setDiagnosticsUiOpen(open) {
    isUiOpen = open;
    if (!open) {
        refreshCount = 0;
        lastRefreshTime = 0;
    }
}
export function isDiagnosticsUiOpen() {
    return isUiOpen;
}
export function deriveRuleOrigin(ruleId) {
    if (ruleId >= SESSION_RULE_THRESHOLD) {
        return "user-temporary";
    }
    return "user-permanent";
}
export function canRefresh() {
    if (!isUiOpen) {
        return false;
    }
    const now = Date.now();
    if (now - lastRefreshTime > QUOTA_RESET_INTERVAL_MS && refreshCount >= QUOTA_WARNING_THRESHOLD) {
        refreshCount = 0;
    }
    if (now - lastRefreshTime < REFRESH_DEBOUNCE_MS) {
        return false;
    }
    if (refreshCount >= QUOTA_WARNING_THRESHOLD) {
        return false;
    }
    return true;
}
export function recordRefresh() {
    lastRefreshTime = Date.now();
    refreshCount++;
}
export function recordFailedRefresh() {
    lastFailedAttemptTime = Date.now();
    refreshCount++;
}
export function resetQuota() {
    refreshCount = 0;
    lastRefreshTime = 0;
    lastFailedAttemptTime = 0;
}
export function aggregateMatches(rules) {
    const aggregation = new Map();
    for (const rule of rules) {
        const condition = rule.rule.condition;
        const domains = condition.domains ?? [];
        const initiatorDomains = condition.initiatorDomains ?? [];
        const resourceTypes = condition.resourceTypes ?? [];
        const action = (rule.rule.action.type === "allow" ? "allow" : "block");
        const ruleOrigin = deriveRuleOrigin(rule.rule.id);
        const allDomains = domains.length > 0 ? domains : (initiatorDomains.length > 0 ? initiatorDomains : []);
        if (allDomains.length === 0) {
            const key = `__global__|${action}`;
            if (aggregation.has(key)) {
                aggregation.get(key).count++;
            }
            else {
                aggregation.set(key, {
                    domain: "(global)",
                    resourceType: "(all)",
                    action,
                    count: 1,
                    ruleOrigin,
                });
            }
            continue;
        }
        for (const domain of allDomains) {
            for (const rt of resourceTypes) {
                const key = `${domain}|${rt}|${action}`;
                if (aggregation.has(key)) {
                    const existing = aggregation.get(key);
                    existing.count++;
                }
                else {
                    aggregation.set(key, {
                        domain,
                        resourceType: rt,
                        action,
                        count: 1,
                        ruleOrigin,
                    });
                }
            }
        }
    }
    return Array.from(aggregation.values()).sort((a, b) => b.count - a.count);
}
export function deduplicateRules(rules) {
    const seen = new Set();
    const deduplicated = [];
    for (const rule of rules) {
        const key = `${rule.rule.id}-${rule.matchedOn.url}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduplicated.push(rule);
        }
    }
    return deduplicated;
}
export function trimBuffer(rules, maxSize = MAX_BUFFER_SIZE) {
    if (rules.length <= maxSize) {
        return rules;
    }
    return rules.slice(rules.length - maxSize);
}
export function createEmptyDiagnosticsState() {
    return {
        matchedRules: [],
        aggregated: [],
        lastRefresh: 0,
        isRefreshing: false,
        error: null,
    };
}
export function createReducedModeState() {
    return {
        matchedRules: [],
        aggregated: [],
        lastRefresh: Date.now(),
        isRefreshing: false,
        error: "Matched-rule access unavailable",
    };
}
export function mergeDiagnostics(existing, newRules) {
    const deduplicated = deduplicateRules([...existing.matchedRules, ...newRules]);
    const trimmed = trimBuffer(deduplicated);
    const aggregated = aggregateMatches(trimmed);
    return {
        matchedRules: trimmed,
        aggregated,
        lastRefresh: Date.now(),
        isRefreshing: false,
        error: null,
    };
}
//# sourceMappingURL=index.js.map