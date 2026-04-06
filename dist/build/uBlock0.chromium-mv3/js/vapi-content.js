var vAPI = vAPI || {};
vAPI.uBO = true;
vAPI.T0 = Date.now();
vAPI.sessionId = Math.random().toString(36).slice(2, 18);

vAPI.randomToken = function() {
    var n = Math.random();
    return String.fromCharCode(n * 25 + 97) +
        Math.floor((0.25 + n * 0.75) * Number.MAX_SAFE_INTEGER).toString(36).slice(-8);
};

vAPI.shutdown = {
    jobs: [],
    add: function(job) { this.jobs.push(job); },
    exec: function() {
        self.requestIdleCallback(function() {
            var jobs = this.jobs.slice();
            this.jobs.length = 0;
            while (jobs.length !== 0) { (jobs.pop())(); }
        }.bind(this));
    },
    remove: function(job) {
        var pos;
        while ((pos = this.jobs.indexOf(job)) !== -1) { this.jobs.splice(pos, 1); }
    }
};

vAPI.setTimeout = function(fn, delay) { return setTimeout(fn, delay); };
vAPI.getURL = function(path) { return browser.runtime.getURL(path); };
vAPI.closePopup = function() {};

vAPI.messaging = {
    send: function(channelName, request) {
        return new Promise(function(resolve) {
            browser.runtime.sendMessage({
                channel: channelName,
                msg: request
            }, function(response) {
                resolve(response);
            });
        });
    }
};

vAPI.localStorage = {
    getItemAsync: function(key) { return Promise.resolve(null); },
    setItemAsync: function(key, value) { return Promise.resolve(); }
};

vAPI.userStylesheet = {
    added: new Set(),
    removed: new Set(),
    apply: function(callback) {
        if (this.added.size === 0 && this.removed.size === 0) { return; }
        var added = Array.from(this.added);
        var removed = Array.from(this.removed);
        this.added.clear();
        this.removed.clear();
        
        vAPI.messaging.send('vapi', {
            what: 'userCSS',
            add: added,
            remove: removed,
        }).then(function() {
            if (callback instanceof Function) { callback(); }
        }).catch(function() {
            if (callback instanceof Function) { callback(); }
        });
    },
    add: function(cssText, now) {
        if (cssText === '') { return; }
        this.added.add(cssText);
        if (now) { this.apply(); }
    },
    remove: function(cssText, now) {
        if (cssText === '') { return; }
        this.removed.add(cssText);
        if (now) { this.apply(); }
    }
};
