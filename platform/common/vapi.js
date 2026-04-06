/*******************************************************************************

    uBlock Origin - a comprehensive, efficient content blocker
    Copyright (C) 2017-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

// For background page, auxiliary pages, and content scripts.

/******************************************************************************/

// EMERGENCY DEBUG - write to document title to verify script is running
try {
    document.title = "uBO LOADING...";
    console.log("VAPI JS EXECUTING");
} catch(e) {
    // Ignore
}

// DEBUG: Test if vapi.js is loading
console.log("[VAPI] vapi.js starting...");

// Fix for Chrome MV3 - ensure chrome/browser API is available at the very top
if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
    self.chrome = self.browser;
} else if (typeof chrome !== 'undefined' && typeof browser === 'undefined') {
    self.browser = self.chrome;
} else if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    self.browser = self.chrome;
}
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    self.browser = self.chrome;
}

/******************************************************************************/

// https://bugzilla.mozilla.org/show_bug.cgi?id=1408996#c9
var vAPI = self.vAPI; // jshint ignore:line

// https://github.com/chrisaljoudi/uBlock/issues/464
// https://github.com/chrisaljoudi/uBlock/issues/1528
//   A XMLDocument can be a valid HTML document.

// https://github.com/gorhill/uBlock/issues/1124
//   Looks like `contentType` is on track to be standardized:
//   https://dom.spec.whatwg.org/#concept-document-content-type

// https://forums.lanik.us/viewtopic.php?f=64&t=31522
//   Skip text/plain documents.

// Initialize vAPI properly for both service worker and popup contexts
// The condition should check if we need to (re)initialize vAPI with proper localStorage
// We want to run this block if:
// 1. We're in a document context (popup, content script, etc.) AND
// 2. Either vAPI doesn't exist yet OR it exists but doesn't have uBO: true flag
if (
    (
        document instanceof HTMLDocument ||
        document instanceof XMLDocument &&
        document.createElement('div') instanceof HTMLDivElement
    ) &&
    (
        /^image\/|^text\/plain/.test(document.contentType || '') === false
    ) &&
    (
        typeof self.vAPI === 'undefined' || 
        self.vAPI === null ||
        self.vAPI.uBO !== true
    )
) {
    vAPI = self.vAPI = { 
        uBO: true,
        // Add localStorage for MV3 Chrome - use chrome.storage.local
        localStorage: {
getItemAsync: function(key) { 
  // For Chrome MV3, use chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local.get(key).then(function(data) { 
      var result = data[key];
      // Return empty string for missing/undefined/null keys to prevent .split() errors
      return result === undefined || result === null ? "" : result;
    }); 
  }
  // Fallback for testing
  return Promise.resolve("");
},
            setItemAsync: function(key, value) { 
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    return chrome.storage.local.set({[key]: value});
                }
                return Promise.resolve();
            },
            removeItemAsync: function(key) { 
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    return chrome.storage.local.remove(key);
                }
                return Promise.resolve();
            },
            getItem: function(key, callback) { 
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(key, function(data) { 
                        callback(data[key] || ""); 
                    });
                } else {
                    callback("");
                }
            },
            setItem: function(key, value) { 
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({[key]: value});
                }
            },
            removeItem: function(key) { 
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.remove(key);
                }
            },
            clear: function() { 
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    return chrome.storage.local.clear();
                }
                return Promise.resolve();
            },
            start: function() { return Promise.resolve(); }
        }
    };
}




/*******************************************************************************

    DO NOT:
    - Remove the following code
    - Add code beyond the following code
    Reason:
    - https://github.com/gorhill/uBlock/pull/3721
    - uBO never uses the return value from injected content scripts

**/

void 0;
