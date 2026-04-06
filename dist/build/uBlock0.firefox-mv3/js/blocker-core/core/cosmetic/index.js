function escapeCss(selector) {
    return selector.replace(/[ !"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
}
export function normalizeSelector(selector) {
    let normalized = selector.trim();
    normalized = normalized.replace(/\s+/g, " ");
    if (!normalized.startsWith("#") && !normalized.startsWith(".")) {
        const parts = normalized.split(/[\s>+~]/);
        if (parts.length > 0) {
            const tag = parts[0];
            if (!/^[a-zA-Z]/.test(tag)) {
                normalized = "." + normalized.replace(/^[a-zA-Z]+/, "");
            }
        }
    }
    return normalized;
}
export function proposeSelector(element) {
    const selectors = [];
    if (element.id) {
        selectors.push(`#${escapeCss(element.id)}`);
    }
    if (element.className && typeof element.className === "string") {
        const classes = element.className.split(/\s+/).filter((c) => c.length > 0);
        if (classes.length > 0) {
            selectors.push(`.${classes.map((c) => escapeCss(c)).join(".")}`);
        }
    }
    const tagName = element.tagName.toLowerCase();
    if (element.id) {
        selectors.push(`${tagName}#${escapeCss(element.id)}`);
    }
    else if (element.className && typeof element.className === "string") {
        const classes = element.className.split(/\s+/).filter((c) => c.length > 0);
        if (classes.length > 0) {
            selectors.push(`${tagName}.${classes.map((c) => escapeCss(c)).join(".")}`);
        }
    }
    return selectors[0] || tagName;
}
export function createCosmeticSelector(site, selector, isAutoApply = false) {
    return {
        selector: normalizeSelector(selector),
        site,
        createdAt: Date.now(),
        isActive: isAutoApply,
        status: isAutoApply ? "active" : "saved",
    };
}
export function addSelectorToRule(state, site, selector, isAutoApply = false) {
    const normalizedSelector = normalizeSelector(selector);
    const newSelector = createCosmeticSelector(site, normalizedSelector, isAutoApply);
    const existingRule = state.rules[site];
    if (existingRule) {
        const existingIndex = existingRule.selectors.findIndex((s) => s.selector === normalizedSelector);
        if (existingIndex >= 0) {
            const updatedSelectors = [...existingRule.selectors];
            updatedSelectors[existingIndex] = newSelector;
            return {
                ...state,
                rules: {
                    ...state.rules,
                    [site]: { ...existingRule, selectors: updatedSelectors },
                },
            };
        }
        return {
            ...state,
            rules: {
                ...state.rules,
                [site]: {
                    ...existingRule,
                    selectors: [...existingRule.selectors, newSelector],
                },
            },
        };
    }
    return {
        ...state,
        rules: {
            ...state.rules,
            [site]: { site, selectors: [newSelector] },
        },
    };
}
export function removeSelectorFromRule(state, site, selector) {
    const normalizedSelector = normalizeSelector(selector);
    const existingRule = state.rules[site];
    if (!existingRule) {
        return state;
    }
    const filteredSelectors = existingRule.selectors.filter((s) => s.selector !== normalizedSelector);
    if (filteredSelectors.length === 0) {
        const { [site]: _, ...remainingRules } = state.rules;
        return { ...state, rules: remainingRules };
    }
    return {
        ...state,
        rules: {
            ...state.rules,
            [site]: { ...existingRule, selectors: filteredSelectors },
        },
    };
}
export function getSelectorsForSite(state, site) {
    return state.rules[site]?.selectors ?? [];
}
export function createEmptyCosmeticState() {
    return { rules: {} };
}
export function serializeCosmeticState(state) {
    return JSON.stringify(state);
}
export function deserializeCosmeticState(json) {
    try {
        return JSON.parse(json);
    }
    catch {
        return createEmptyCosmeticState();
    }
}
export function generateCSS(selectors) {
    const activeSelectors = selectors.filter((s) => s.status === "active" || s.status === "saved");
    if (activeSelectors.length === 0)
        return "";
    return activeSelectors
        .map((s) => `${s.selector} { display: none !important; }`)
        .join("\n");
}
export function snapshotState(state) {
    return JSON.parse(JSON.stringify(state));
}
export function restoreFromSnapshot(snapshot) {
    return snapshot;
}
//# sourceMappingURL=index.js.map