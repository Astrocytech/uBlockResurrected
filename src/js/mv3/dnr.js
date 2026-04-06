/**
 * uBlock Origin - MV3 Service Worker
 * DNR (Declarative Net Request) Integration
 */

import { storage } from './storage.js';
import { CONSTANTS } from './utils.js';

var dnr = {
    WHITELIST_RULE_START: CONSTANTS.DNR.WHITELIST_RULE_START,
    WHITELIST_RULE_END: CONSTANTS.DNR.WHITELIST_RULE_END,

    updateWhitelist: function() {
        storage.readWhitelist().then(function(whitelist) {
            var rules = [];

            for (var i = 0; i < whitelist.length; i++) {
                var pattern = whitelist[i];
                if (!pattern || pattern.startsWith('#')) continue;

                var rule = {
                    id: dnr.WHITELIST_RULE_START + rules.length,
                    priority: 3,
                    action: { type: 'allow' },
                    condition: {}
                };

                if (pattern.indexOf('/') === -1) {
                    rule.condition.urlFilter = "||" + pattern + "^";
                } else if (pattern.startsWith('/') && pattern.endsWith('/')) {
                    rule.condition.regexFilter = pattern.slice(1, -1);
                } else {
                    rule.condition.urlFilter = pattern;
                }
                rules.push(rule);
            }

            chrome.declarativeNetRequest.getDynamicRules(function(existingRules) {
                var removeIds = existingRules
                    .filter(function(r) {
                        return r.id >= dnr.WHITELIST_RULE_START && r.id < dnr.WHITELIST_RULE_END;
                    })
                    .map(function(r) { return r.id; });

                chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: removeIds,
                    addRules: rules
                }, function() {
                });
            });
        });
    },

    addToWhitelist: function(domain) {
        return storage.readWhitelist().then(function(whitelist) {
            if (whitelist.indexOf(domain) === -1) {
                whitelist.push(domain);
                return storage.writeWhitelist(whitelist).then(function() {
                    dnr.updateWhitelist();
                    return true;
                });
            }
            return false;
        });
    },

    removeFromWhitelist: function(domain) {
        return storage.readWhitelist().then(function(whitelist) {
            var idx = whitelist.indexOf(domain);
            if (idx !== -1) {
                whitelist.splice(idx, 1);
                return storage.writeWhitelist(whitelist).then(function() {
                    dnr.updateWhitelist();
                    return true;
                });
            }
            return false;
        });
    }
};

export { dnr };
