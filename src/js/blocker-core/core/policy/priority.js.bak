import { PRIORITY_MAP } from "../types/index.js";
export function resolvePriority(scopes, actions) {
    if (scopes.length === 0 || actions.length === 0) {
        return { action: "block", priority: 1, scope: "permanent", isEffective: false };
    }
    const effectiveScopes = [];
    for (let i = 0; i < scopes.length; i++) {
        const basePriority = PRIORITY_MAP[scopes[i]] ?? 0;
        const actionModifier = actions[i] === "allow" ? 1 : 0;
        effectiveScopes.push({
            scope: scopes[i],
            priority: basePriority + actionModifier,
            action: actions[i],
        });
    }
    effectiveScopes.sort((a, b) => b.priority - a.priority);
    const winner = effectiveScopes[0];
    return {
        action: winner.action,
        priority: winner.priority,
        scope: winner.scope,
        isEffective: true,
    };
}
export function computeRulePriority(scope, action) {
    const basePriority = PRIORITY_MAP[scope] ?? 100;
    return action === "allow" ? basePriority + 1 : basePriority;
}
export function detectConflicts(rules) {
    const domainResourceMap = new Map();
    for (const rule of rules) {
        for (const rt of rule.resourceTypes) {
            if (!domainResourceMap.has(rule.domain)) {
                domainResourceMap.set(rule.domain, new Map());
            }
            const rtMap = domainResourceMap.get(rule.domain);
            if (!rtMap.has(rt)) {
                rtMap.set(rt, []);
            }
            rtMap.get(rt).push({ action: rule.action, scope: rule.scope });
        }
    }
    const conflicts = [];
    for (const [domain, rtMap] of domainResourceMap) {
        for (const [resourceType, entries] of rtMap) {
            const uniqueActions = [...new Set(entries.map((e) => e.action))];
            const uniqueScopes = [...new Set(entries.map((e) => e.scope))];
            if (uniqueActions.length > 1) {
                const decision = resolvePriority(uniqueScopes, uniqueActions);
                conflicts.push({
                    domain,
                    resourceTypes: [resourceType],
                    conflictingActions: uniqueActions,
                    scopes: uniqueScopes,
                    resolvedAction: decision.action,
                    resolvedScope: decision.scope,
                });
            }
        }
    }
    return conflicts;
}
export function normalizeOverlaps(rules) {
    return rules.map((rule) => ({
        ...rule,
        priority: computeRulePriority(rule.scope, rule.action),
    }));
}
export function evaluateEffectiveDecision(domain, resourceType, sitePolicy) {
    const rule = sitePolicy.rules[domain];
    if (rule) {
        if (rule.excludedDomains?.includes(domain)) {
            const decision = resolvePriority(["permanent"], [sitePolicy.resourceDefaults[resourceType] === "allow" ? "allow" : "block"]);
            return { action: decision.action, scope: "permanent", isOverride: false };
        }
        if (rule.resourceTypes === undefined || rule.resourceTypes.includes(resourceType)) {
            return {
                action: rule.allow ? "allow" : "block",
                scope: rule.temporary ? "temporary" : "permanent",
                isOverride: true,
            };
        }
    }
    const defaultAction = sitePolicy.resourceDefaults[resourceType];
    return {
        action: defaultAction === "allow" ? "allow" : "block",
        scope: "profile",
        isOverride: false,
    };
}
//# sourceMappingURL=priority.js.map