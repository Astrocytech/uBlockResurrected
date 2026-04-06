import { validateStoredPolicy, validateSitePolicy, createDefaultStoredPolicy } from "../policy/index.js";
import { createDefaultAllocatorState, serializeMapping, deserializeMapping } from "./id-allocator.js";
export const STORAGE_SCHEMA_VERSION = 1;
export function createDefaultStorageSchema() {
    return {
        version: STORAGE_SCHEMA_VERSION,
        policy: createDefaultStoredPolicy(),
        compiledState: {},
        ruleMapping: {},
        idAllocator: createDefaultAllocatorState(),
        budget: {
            dynamicRuleCount: 0,
            sessionRuleCount: 0,
            dynamicCeiling: 30000,
            sessionCeiling: 5000,
            perSiteRules: {},
            globalOverridePool: 3000,
        },
        observedDomains: [],
        cosmeticSelectors: [],
        temporaryOverrides: {},
        lastUpdated: Date.now(),
    };
}
export function validateStorageSchema(data) {
    const errors = [];
    const warnings = [];
    if (typeof data !== "object" || data === null) {
        errors.push("Storage data must be an object");
        return { valid: false, errors, warnings };
    }
    const schema = data;
    if (schema.version === undefined) {
        errors.push("Missing schema version");
    }
    else if (typeof schema.version !== "number") {
        errors.push("Schema version must be a number");
    }
    if (schema.policy !== undefined) {
        if (!validateStoredPolicy(schema.policy)) {
            errors.push("Invalid stored policy");
        }
    }
    if (schema.budget !== undefined) {
        const budget = schema.budget;
        if (typeof budget.dynamicRuleCount !== "number" || typeof budget.sessionRuleCount !== "number") {
            errors.push("Invalid budget state");
        }
    }
    if (schema.idAllocator !== undefined) {
        const alloc = schema.idAllocator;
        if (typeof alloc.nextDynamicId !== "number" || typeof alloc.nextSessionId !== "number") {
            errors.push("Invalid ID allocator state");
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
export function migrateSchema(oldData, fromVersion) {
    const schema = createDefaultStorageSchema();
    schema.version = fromVersion;
    if (fromVersion < 1) {
        if (oldData.policy) {
            schema.policy = oldData.policy;
        }
        if (oldData.budget) {
            schema.budget = oldData.budget;
        }
    }
    schema.version = STORAGE_SCHEMA_VERSION;
    schema.lastUpdated = Date.now();
    return schema;
}
export function validateAndMigrateStorage(data, currentVersion = STORAGE_SCHEMA_VERSION) {
    if (data === null || data === undefined) {
        return {
            success: true,
            schema: createDefaultStorageSchema(),
            needsMigration: false,
        };
    }
    const validation = validateStorageSchema(data);
    if (!validation.valid) {
        const record = data;
        if (record.version === undefined || typeof record.version !== "number") {
            return {
                success: false,
                error: `Corrupted storage: ${validation.errors.join(", ")}`,
            };
        }
        if (record.version < currentVersion) {
            const migrated = migrateSchema(record, record.version);
            return {
                success: true,
                schema: migrated,
                needsMigration: true,
                migrationFromVersion: record.version,
            };
        }
        return {
            success: false,
            error: `Invalid storage: ${validation.errors.join(", ")}`,
        };
    }
    const record = data;
    if (record.version < currentVersion) {
        const migrated = migrateSchema(record, record.version);
        return {
            success: true,
            schema: migrated,
            needsMigration: true,
            migrationFromVersion: record.version,
        };
    }
    return {
        success: true,
        schema: record,
        needsMigration: false,
    };
}
export function serializeStorageSchema(schema) {
    return {
        version: schema.version,
        policy: schema.policy,
        compiledState: schema.compiledState,
        ruleMapping: serializeMapping(new Map(Object.entries(schema.ruleMapping))),
        idAllocator: schema.idAllocator,
        budget: schema.budget,
        observedDomains: schema.observedDomains,
        cosmeticSelectors: schema.cosmeticSelectors,
        temporaryOverrides: schema.temporaryOverrides,
        lastUpdated: schema.lastUpdated,
    };
}
export function deserializeStorageSchema(data) {
    const result = validateAndMigrateStorage(data);
    if (!result.success || !result.schema) {
        return null;
    }
    const schema = result.schema;
    if (typeof schema.ruleMapping === "object" && schema.ruleMapping !== null) {
        schema.ruleMapping = deserializeMapping(schema.ruleMapping);
    }
    return schema;
}
export function getStorageKeys() {
    return {
        POLICY: "blocker_policy",
        STATE: "blocker_state",
        ID_ALLOCATOR: "blocker_id_allocator",
        BUDGET: "blocker_budget",
        RULE_MAPPING: "blocker_rule_mapping",
        COSMETIC: "blocker_cosmetic",
        OBSERVED_DOMAINS: "blocker_observed_domains",
        COSMETIC_SELECTORS: "blocker_cosmetic_selectors",
        TEMPORARY_OVERRIDES: "blocker_temporary_overrides",
    };
}
export function validateSiteInPolicy(policy, site) {
    const sitePolicy = policy.sites[site];
    if (!sitePolicy)
        return false;
    return validateSitePolicy(sitePolicy);
}
export function validateBudgetState(budget) {
    if (typeof budget !== "object" || budget === null)
        return false;
    const b = budget;
    return (typeof b.dynamicRuleCount === "number" &&
        typeof b.sessionRuleCount === "number" &&
        typeof b.dynamicCeiling === "number" &&
        typeof b.sessionCeiling === "number");
}
export function validateIdAllocator(allocator) {
    if (typeof allocator !== "object" || allocator === null)
        return false;
    const a = allocator;
    return (typeof a.nextDynamicId === "number" &&
        typeof a.nextSessionId === "number" &&
        Array.isArray(a.freedDynamicIds) &&
        Array.isArray(a.freedSessionIds));
}
export function checkBudgetIntegrity(budget, ruleMapping) {
    const issues = [];
    let dynamicCount = 0;
    let sessionCount = 0;
    for (const mapping of ruleMapping.values()) {
        if (mapping.ruleType === "dynamic") {
            dynamicCount++;
        }
        else {
            sessionCount++;
        }
    }
    if (dynamicCount !== budget.dynamicRuleCount) {
        issues.push(`Dynamic rule count mismatch: stored=${budget.dynamicRuleCount}, mapped=${dynamicCount}`);
    }
    if (sessionCount !== budget.sessionRuleCount) {
        issues.push(`Session rule count mismatch: stored=${budget.sessionRuleCount}, mapped=${sessionCount}`);
    }
    return {
        valid: issues.length === 0,
        issues,
    };
}
export function reconcileBudgetState(budget, ruleMapping) {
    let dynamicCount = 0;
    let sessionCount = 0;
    const perSiteCounts = {};
    for (const mapping of ruleMapping.values()) {
        const [site] = mapping.policyKey.split("|");
        if (!perSiteCounts[site]) {
            perSiteCounts[site] = { dynamic: 0, session: 0, total: 0 };
        }
        if (mapping.ruleType === "dynamic") {
            dynamicCount++;
            perSiteCounts[site].dynamic++;
        }
        else {
            sessionCount++;
            perSiteCounts[site].session++;
        }
        perSiteCounts[site].total++;
    }
    return {
        ...budget,
        dynamicRuleCount: dynamicCount,
        sessionRuleCount: sessionCount,
        perSiteRules: perSiteCounts,
    };
}
export function normalizeObservedDomains(domains) {
    const seen = new Set();
    const normalized = [];
    for (const domain of domains) {
        const key = `${domain.site}|${domain.domain}|${domain.resourceType}`;
        if (!seen.has(key)) {
            seen.add(key);
            normalized.push({
                ...domain,
                site: domain.site.toLowerCase(),
                domain: domain.domain.toLowerCase(),
                resourceType: domain.resourceType.toLowerCase(),
            });
        }
    }
    return normalized.sort((a, b) => b.timestamp - a.timestamp);
}
export function pruneObservedDomains(domains, maxEntries = 1000, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const valid = domains.filter((d) => now - d.timestamp < maxAgeMs);
    return valid.slice(0, maxEntries);
}
export function normalizeCosmeticSelectors(selectors) {
    const seen = new Set();
    const normalized = [];
    for (const selector of selectors) {
        const key = `${selector.site}|${selector.selector}`;
        if (!seen.has(key)) {
            seen.add(key);
            normalized.push({
                ...selector,
                site: selector.site.toLowerCase(),
                selector: selector.selector.trim(),
            });
        }
    }
    return normalized;
}
export function cleanupExpiredTemporaryOverrides(overrides) {
    const now = Date.now();
    const valid = {};
    for (const [key, override] of Object.entries(overrides)) {
        if (override.expiresAt > now) {
            valid[key] = override;
        }
    }
    return valid;
}
//# sourceMappingURL=index.js.map