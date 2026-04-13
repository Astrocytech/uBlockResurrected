/*******************************************************************************

    uBlock Resurrected - Matched Rules UI Script
    Copyright (C) 2024-present Raymond Hill

    This script powers the matched-rules.html page to display
    which DNR rules blocked/allowed requests.

******************************************************************************/

(function() {
    'use strict';

    const API = {
        getMatchedRules: function(tabId) {
            return vAPI.messaging.send('dashboard', {
                what: 'getMatchedRules',
                tabId: tabId
            });
        }
    };

    const matchedRulesBody = document.getElementById('matchedRulesBody');
    const emptyState = document.getElementById('emptyState');
    const refreshBtn = document.getElementById('refreshBtn');
    const clearBtn = document.getElementById('clearBtn');
    const autoRefreshCheckbox = document.getElementById('autoRefresh');
    const statusSpan = document.getElementById('status');

    let autoRefreshInterval = null;

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    function formatURL(url) {
        try {
            const parsed = new URL(url);
            return parsed.pathname + parsed.search;
        } catch (e) {
            return url;
        }
    }

    function getActionClass(action) {
        if (action === 'block') return 'rule-blocked';
        if (action === 'allow') return 'rule-allowed';
        return 'rule-info';
    }

    function renderMatchedRules(rules) {
        matchedRulesBody.innerHTML = '';

        if (!rules || rules.length === 0) {
            emptyState.style.display = 'block';
            document.getElementById('matchedRulesList').style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        document.getElementById('matchedRulesList').style.display = 'table';

        for (const rule of rules) {
            const row = document.createElement('tr');
            
            const action = rule.rule?.action || 'unknown';
            const actionClass = getActionClass(action);

            row.innerHTML = `
                <td>${formatTime(rule.timestamp)}</td>
                <td title="${rule.request?.url || ''}">${formatURL(rule.request?.url || '')}</td>
                <td>${rule.request?.type || ''}</td>
                <td>${rule.request?.initiator || ''}</td>
                <td>${rule.rule?.ruleId || rule.rule?.id || '-'}</td>
                <td class="${actionClass}">${action}</td>
            `;
            
            matchedRulesBody.appendChild(row);
        }

        statusSpan.textContent = `${rules.length} rules`;
    }

    async function refresh() {
        try {
            const rules = await API.getMatchedRules();
            renderMatchedRules(rules);
        } catch (e) {
            console.error('Failed to get matched rules:', e);
            statusSpan.textContent = 'Error loading rules';
        }
    }

    function toggleAutoRefresh() {
        if (autoRefreshCheckbox.checked) {
            if (!autoRefreshInterval) {
                autoRefreshInterval = setInterval(refresh, 1000);
            }
        } else {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        }
    }

    refreshBtn.addEventListener('click', refresh);
    autoRefreshCheckbox.addEventListener('change', toggleAutoRefresh);

    refresh();
})();