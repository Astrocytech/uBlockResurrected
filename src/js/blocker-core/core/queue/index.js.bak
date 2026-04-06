import { compileSitePolicy } from "../compiler/index.js";
let globalPolicyVersion = 0;
export function setPolicyVersion(version) {
    globalPolicyVersion = version;
}
export function getPolicyVersion() {
    return globalPolicyVersion;
}
export function createUpdateRequest(site, policy, type) {
    return {
        id: `${site}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        site,
        policy,
        policyVersion: getPolicyVersion(),
        timestamp: Date.now(),
    };
}
export function compileUpdateRequest(request, startDynamicId, startSessionId) {
    if (request.type === "remove") {
        return {
            request,
            compiledRules: { dynamic: [], session: [] },
            mapping: {},
        };
    }
    if (!request.policy)
        return null;
    const result = compileSitePolicy({
        site: request.site,
        policy: request.policy,
        startDynamicId,
        startSessionId,
    });
    return {
        request,
        compiledRules: {
            dynamic: result.dynamicRules,
            session: result.sessionRules,
        },
        mapping: result.mapping,
    };
}
export function isStaleRequest(request, currentVersion) {
    return request.policyVersion < currentVersion;
}
export function shouldDebounce(prevRequest, newRequest, debounceMs) {
    return (prevRequest.site === newRequest.site &&
        newRequest.timestamp - prevRequest.timestamp < debounceMs);
}
export function mergeRequests(prev, next) {
    return {
        ...next,
        previousRuleIds: [...(prev.previousRuleIds ?? []), ...(next.previousRuleIds ?? [])],
        policyVersion: Math.max(prev.policyVersion, next.policyVersion),
    };
}
export function createEmptyQueueState() {
    return {
        pending: [],
        processing: null,
        completed: [],
        failed: [],
    };
}
export function enqueue(state, update, maxSize) {
    const newPending = [...state.pending];
    const existingIndex = newPending.findIndex(u => u.request.site === update.request.site);
    if (existingIndex >= 0) {
        newPending[existingIndex] = update;
    }
    else {
        if (newPending.length >= maxSize) {
            newPending.shift();
        }
        newPending.push(update);
    }
    return {
        ...state,
        pending: newPending,
    };
}
export function startProcessing(state) {
    if (state.pending.length === 0)
        return state;
    const [next, ...remaining] = state.pending;
    return {
        ...state,
        pending: remaining,
        processing: next,
    };
}
export function completeProcessing(state) {
    if (!state.processing)
        return state;
    return {
        ...state,
        processing: null,
        completed: [...state.completed, state.processing.request.id],
    };
}
export function failProcessing(state, error) {
    if (!state.processing)
        return state;
    return {
        ...state,
        processing: null,
        failed: [...state.failed, state.processing.request.id],
    };
}
export function requeue(state) {
    if (!state.processing)
        return state;
    return {
        ...state,
        pending: [state.processing, ...state.pending],
        processing: null,
    };
}
export function clearCompleted(state) {
    return {
        ...state,
        completed: [],
    };
}
export function getNextPending(state) {
    return state.pending[0] ?? null;
}
export function hasPendingWork(state) {
    return state.pending.length > 0 || state.processing !== null;
}
export function createTransaction(state, queuedUpdate) {
    const site = queuedUpdate.request.site;
    const previousSiteBudget = state.budget.perSiteRules[site] ?? { dynamic: 0, session: 0, total: 0 };
    const newDynamicCount = queuedUpdate.compiledRules.dynamic.length;
    const newSessionCount = queuedUpdate.compiledRules.session.length;
    const newTotalCount = newDynamicCount + newSessionCount;
    const allRules = [...queuedUpdate.compiledRules.dynamic, ...queuedUpdate.compiledRules.session];
    const siteMapping = {};
    for (const [key, value] of Object.entries(queuedUpdate.mapping)) {
        if (key.startsWith(`${site}|`)) {
            siteMapping[key] = value;
        }
    }
    const newMapping = { ...state.ruleMapping };
    for (const key of Object.keys(newMapping)) {
        if (newMapping[key]?.policyKey.startsWith(`${site}|`)) {
            delete newMapping[key];
        }
    }
    for (const [key, value] of Object.entries(siteMapping)) {
        newMapping[key] = value;
    }
    const plannedBudget = {
        dynamicRuleCount: Math.max(0, state.budget.dynamicRuleCount - previousSiteBudget.dynamic + newDynamicCount),
        sessionRuleCount: Math.max(0, state.budget.sessionRuleCount - previousSiteBudget.session + newSessionCount),
        perSiteRules: {
            ...state.budget.perSiteRules,
            [site]: {
                dynamic: newDynamicCount,
                session: newSessionCount,
                total: newTotalCount,
            },
        },
        dynamicCeiling: state.budget.dynamicCeiling,
        sessionCeiling: state.budget.sessionCeiling,
        globalOverridePool: state.budget.globalOverridePool,
    };
    const plannedCompiledGroups = {
        ...state.compiledRuleGroups,
        [site]: {
            site,
            rules: allRules,
            lastUsed: Date.now(),
            isPruned: false,
        },
    };
    const plannedIdAllocator = {
        nextDynamicId: Math.max(state.idAllocator.nextDynamicId, Math.max(...queuedUpdate.compiledRules.dynamic.map(r => r.id), 0) + 1),
        nextSessionId: Math.max(state.idAllocator.nextSessionId, Math.max(...queuedUpdate.compiledRules.session.map(r => r.id), 0) + 1),
        freedDynamicIds: state.idAllocator.freedDynamicIds,
        freedSessionIds: state.idAllocator.freedSessionIds,
    };
    return {
        snapshot: {
            ruleMapping: JSON.parse(JSON.stringify(state.ruleMapping)),
            budget: {
                dynamicRuleCount: state.budget.dynamicRuleCount,
                sessionRuleCount: state.budget.sessionRuleCount,
                perSiteRules: JSON.parse(JSON.stringify(state.budget.perSiteRules)),
                dynamicCeiling: state.budget.dynamicCeiling,
                sessionCeiling: state.budget.sessionCeiling,
                globalOverridePool: state.budget.globalOverridePool,
            },
            compiledRuleGroups: JSON.parse(JSON.stringify(state.compiledRuleGroups)),
            idAllocator: JSON.parse(JSON.stringify(state.idAllocator)),
        },
        planned: {
            ruleMapping: newMapping,
            budget: plannedBudget,
            compiledRuleGroups: plannedCompiledGroups,
            idAllocator: plannedIdAllocator,
        },
        queuedUpdate,
        isApplied: false,
    };
}
export function commitTransaction(currentState, transaction) {
    transaction.isApplied = true;
    return {
        ruleMapping: transaction.planned.ruleMapping,
        budget: transaction.planned.budget,
        compiledRuleGroups: transaction.planned.compiledRuleGroups,
        idAllocator: transaction.planned.idAllocator,
    };
}
export function rollbackTransaction(currentState, transaction) {
    transaction.isApplied = false;
    return {
        ruleMapping: transaction.snapshot.ruleMapping,
        budget: transaction.snapshot.budget,
        compiledRuleGroups: transaction.snapshot.compiledRuleGroups,
        idAllocator: transaction.snapshot.idAllocator,
    };
}
//# sourceMappingURL=index.js.map