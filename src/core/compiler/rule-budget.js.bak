/*******************************************************************************

    uBlock Origin - Rule Budget Manager
    Copyright (C) 2024-present Raymond Hill

    This module handles rule budget management for DNR,
    ensuring we stay within Chrome's limits.

*******************************************************************************/

/******************************************************************************/

// Budget limits
const MAX_STATIC_RULES = 30000;
const MAX_DYNAMIC_RULES = 30000;
const MAX_SESSION_RULES = 5000;

// Budget allocation defaults
const DEFAULT_ALLOCATION = {
    static: 0.80,      // 80% of max for static (filter lists)
    dynamic: 0.15,     // 15% of max for user dynamic rules  
    session: 0.05,     // 5% of max for session rules
};

/******************************************************************************/

/**
 * RuleBudget - Manages rule budget allocation and pruning
 */
class RuleBudget {
    constructor() {
        // Current usage by category
        this.usage = {
            static: 0,
            dynamic: 0,
            session: 0,
        };

        // Budget allocation
        this.allocation = { ...DEFAULT_ALLOCATION };
        
        // Pruning history (for LRU)
        this.ruleAccessTime = new Map();
        
        // Budget exceeded callbacks
        this.onBudgetExceeded = null;
        
        // Warning threshold (percentage)
        this.warningThreshold = 0.90;
    }

    /**
     * Set budget callback
     * @param {Function} callback - Called when budget exceeded
     */
    setBudgetExceededCallback(callback) {
        this.onBudgetExceeded = callback;
    }

    /**
     * Get maximum rules for a category
     * @param {string} type - 'static', 'dynamic', or 'session'
     * @returns {number} Maximum rules allowed
     */
    getMaxRules(type) {
        switch (type) {
            case 'static': return MAX_STATIC_RULES;
            case 'dynamic': return MAX_DYNAMIC_RULES;
            case 'session': return MAX_SESSION_RULES;
            default: return 0;
        }
    }

    /**
     * Get budget limit for a category
     * @param {string} type - 'static', 'dynamic', or 'session'
     * @returns {number} Budget limit
     */
    getBudgetLimit(type) {
        const max = this.getMaxRules(type);
        const alloc = this.allocation[type] || 0;
        return Math.floor(max * alloc);
    }

    /**
     * Check if can add rules
     * @param {string} type - Rule type
     * @param {number} count - Number of rules to add
     * @returns {Object} { allowed: boolean, reason?: string }
     */
    canAdd(type, count = 1) {
        const current = this.usage[type] || 0;
        const max = this.getMaxRules(type);
        
        if (current + count > max) {
            return {
                allowed: false,
                reason: `Would exceed ${type} limit (${current}/${max})`,
            };
        }
        
        // Check warning threshold
        if ((current + count) / max >= this.warningThreshold) {
            console.warn(`[RuleBudget] ${type} rules at ${Math.round((current + count) / max * 100)}% capacity`);
        }
        
        return { allowed: true };
    }

    /**
     * Add rules to budget
     * @param {string} type - Rule type
     * @param {number} count - Number of rules
     * @param {string} ruleId - Rule ID (for tracking)
     */
    addRules(type, count, ruleId = null) {
        this.usage[type] = (this.usage[type] || 0) + count;
        
        if (ruleId) {
            this.ruleAccessTime.set(ruleId, Date.now());
        }
        
        console.log(`[RuleBudget] Added ${count} ${type} rules (total: ${this.usage[type]})`);
        
        // Check if exceeded
        const max = this.getMaxRules(type);
        if (this.usage[type] > max) {
            if (this.onBudgetExceeded) {
                this.onBudgetExceeded(type, this.usage[type], max);
            }
        }
    }

    /**
     * Remove rules from budget
     * @param {string} type - Rule type
     * @param {number} count - Number of rules
     * @param {string} ruleId - Rule ID (for tracking)
     */
    removeRules(type, count, ruleId = null) {
        this.usage[type] = Math.max(0, (this.usage[type] || 0) - count);
        
        if (ruleId) {
            this.ruleAccessTime.delete(ruleId);
        }
        
        console.log(`[RuleBudget] Removed ${count} ${type} rules (total: ${this.usage[type]})`);
    }

    /**
     * Get rules to prune when over budget
     * @param {string} type - Rule type
     * @param {number} count - Number of rules to prune
     * @returns {Array} Array of rule IDs to remove (LRU order)
     */
    getRulesToPrune(type, count) {
        const max = this.getMaxRules(type);
        const current = this.usage[type] || 0;
        
        if (current <= max) {
            return [];
        }
        
        const toPrune = current - max + count;
        
        // Sort by last access time (LRU)
        const sorted = Array.from(this.ruleAccessTime.entries())
            .sort((a, b) => a[1] - b[1]);
        
        return sorted.slice(0, toPrune).map(([id]) => id);
    }

    /**
     * Mark a rule as accessed (for LRU)
     * @param {string} ruleId - Rule ID
     */
    markAccessed(ruleId) {
        this.ruleAccessTime.set(ruleId, Date.now());
    }

    /**
     * Get budget status
     * @returns {Object} Budget status by type
     */
    getStatus() {
        return {
            static: {
                used: this.usage.static || 0,
                max: MAX_STATIC_RULES,
                percentage: Math.round((this.usage.static || 0) / MAX_STATIC_RULES * 100),
            },
            dynamic: {
                used: this.usage.dynamic || 0,
                max: MAX_DYNAMIC_RULES,
                percentage: Math.round((this.usage.dynamic || 0) / MAX_DYNAMIC_RULES * 100),
            },
            session: {
                used: this.usage.session || 0,
                max: MAX_SESSION_RULES,
                percentage: Math.round((this.usage.session || 0) / MAX_SESSION_RULES * 100),
            },
            total: {
                used: (this.usage.static || 0) + (this.usage.dynamic || 0) + (this.usage.session || 0),
                max: MAX_STATIC_RULES + MAX_DYNAMIC_RULES + MAX_SESSION_RULES,
            },
        };
    }

    /**
     * Reset budget tracking
     */
    reset() {
        this.usage = {
            static: 0,
            dynamic: 0,
            session: 0,
        };
        this.ruleAccessTime.clear();
    }

    /**
     * Update allocation percentages
     * @param {Object} allocation - New allocation { static, dynamic, session }
     */
    setAllocation(allocation) {
        // Validate totals
        const total = (allocation.static || 0) + (allocation.dynamic || 0) + (allocation.session || 0);
        if (Math.abs(total - 1.0) > 0.01) {
            console.warn('[RuleBudget] Allocation should sum to 1.0, got', total);
        }
        
        this.allocation = {
            static: Math.min(1, Math.max(0, allocation.static || DEFAULT_ALLOCATION.static)),
            dynamic: Math.min(1, Math.max(0, allocation.dynamic || DEFAULT_ALLOCATION.dynamic)),
            session: Math.min(1, Math.max(0, allocation.session || DEFAULT_ALLOCATION.session)),
        };
        
        console.log('[RuleBudget] Allocation updated:', this.allocation);
    }

    /**
     * Calculate how many rules can be added
     * @param {string} type - Rule type
     * @returns {number} Available slots
     */
    getAvailableSlots(type) {
        const max = this.getMaxRules(type);
        const current = this.usage[type] || 0;
        return Math.max(0, max - current);
    }

    /**
     * Check if near capacity
     * @param {string} type - Rule type
     * @param {number} threshold - Threshold percentage (default 0.9)
     * @returns {boolean} True if near capacity
     */
    isNearCapacity(type, threshold = 0.9) {
        const max = this.getMaxRules(type);
        const current = this.usage[type] || 0;
        return current / max >= threshold;
    }
}

/******************************************************************************/

// Export singleton instance
const ruleBudget = new RuleBudget();

export { ruleBudget, RuleBudget, MAX_STATIC_RULES, MAX_DYNAMIC_RULES, MAX_SESSION_RULES, DEFAULT_ALLOCATION };
export default ruleBudget;