// uBlock Resurrected Chrome MV3 Service Worker - bundles concatenated
console.log('uBlock Resurrected SW loaded');

self.oninstall = function(event) {
    self.skipWaiting();
};

self.onactivate = function(event) {
    self.clients.claim();
};

self.onfetch = function(event) {
    event.respondWith(fetch(event.request));
};