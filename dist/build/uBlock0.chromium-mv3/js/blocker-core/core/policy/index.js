import { PROFILE_DEFAULTS, RESOURCE_TYPES, } from "../types/index.js";
export function normalizeSite(site) {
    try {
        const url = new URL(site.startsWith("http") ? site : `https://${site}`);
        return url.hostname.toLowerCase();
    }
    catch {
        return site.toLowerCase();
    }
}
export function normalizeDomain(domain) {
    return domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
}
export function normalizeResourceTypes(types) {
    if (!types || types.length === 0)
        return undefined;
    const normalized = types.map((t) => t.toLowerCase());
    const unique = [...new Set(normalized)];
    return unique.length > 0 ? unique : undefined;
}
export function normalizeExcludedDomains(domains) {
    if (!domains || domains.length === 0)
        return undefined;
    const normalized = domains.map(normalizeDomain).filter((d) => d.length > 0);
    return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}
export function normalizeDomainRule(rule) {
    return {
        allow: rule.allow ?? false,
        resourceTypes: normalizeResourceTypes(rule.resourceTypes),
        temporary: rule.temporary ?? false,
        excludedDomains: normalizeExcludedDomains(rule.excludedDomains),
    };
}
export function normalizeSitePolicy(policy) {
    const site = normalizeSite(policy.site ?? "");
    const profile = validateProfile(policy.profile) ? policy.profile : "balanced";
    const resourceDefaults = {};
    const defaults = PROFILE_DEFAULTS[profile];
    for (const type of RESOURCE_TYPES) {
        if (policy.resourceDefaults?.[type]) {
            resourceDefaults[type] = policy.resourceDefaults[type];
        }
        else if (defaults[type]) {
            resourceDefaults[type] = defaults[type];
        }
    }
    const rules = {};
    if (policy.rules) {
        for (const [domain, rule] of Object.entries(policy.rules)) {
            if (rule && (rule.allow !== undefined || rule.resourceTypes)) {
                rules[normalizeDomain(domain)] = normalizeDomainRule(rule);
            }
        }
    }
    return {
        site,
        resourceDefaults,
        rules,
        profile,
    };
}
export function validateProfile(profile) {
    return ["strict", "balanced", "relaxed", "custom"].includes(profile ?? "");
}
export function validateResourceType(type) {
    return RESOURCE_TYPES.includes(type);
}
export function validateDomainRule(rule) {
    if (typeof rule !== "object" || rule === null)
        return false;
    const r = rule;
    if (typeof r.allow !== "boolean")
        return false;
    if (r.resourceTypes !== undefined) {
        if (!Array.isArray(r.resourceTypes))
            return false;
        for (const t of r.resourceTypes) {
            if (typeof t !== "string" || !validateResourceType(t))
                return false;
        }
    }
    if (r.excludedDomains !== undefined) {
        if (!Array.isArray(r.excludedDomains))
            return false;
        for (const d of r.excludedDomains) {
            if (typeof d !== "string")
                return false;
        }
    }
    return true;
}
export function validateSitePolicy(policy) {
    if (typeof policy !== "object" || policy === null)
        return false;
    const p = policy;
    if (typeof p.site !== "string" || p.site.length === 0)
        return false;
    if (!validateProfile(p.profile))
        return false;
    if (p.resourceDefaults !== undefined && typeof p.resourceDefaults !== "object")
        return false;
    if (p.rules !== undefined) {
        if (typeof p.rules !== "object")
            return false;
        const rules = p.rules;
        if (!rules)
            return false;
        for (const rule of Object.values(rules)) {
            if (!validateDomainRule(rule))
                return false;
        }
    }
    return true;
}
export function validateStoredPolicy(policy) {
    if (typeof policy !== "object" || policy === null)
        return false;
    const p = policy;
    if (typeof p.version !== "number")
        return false;
    if (typeof p.sites !== "object" || p.sites === null)
        return false;
    for (const sitePolicy of Object.values(p.sites)) {
        if (!validateSitePolicy(sitePolicy))
            return false;
    }
    return true;
}
export function createDefaultStoredPolicy() {
    return {
        version: 1,
        sites: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}
export function mergeSitePolicy(existing, updates) {
    const normalized = normalizeSitePolicy({
        ...existing,
        ...updates,
        site: existing.site,
    });
    return normalized;
}
export function getPolicyVersion(policy) {
    return policy.version;
}
export function incrementPolicyVersion(policy) {
    return {
        ...policy,
        version: policy.version + 1,
        updatedAt: Date.now(),
    };
}
//# sourceMappingURL=index.js.map