/**
 * uBlock Origin - MV3 Service Worker
 * Port-based Messaging System
 */

import { vAPI } from './vapi-bg.js';

interface ListenerDetails {
    fn: (request: unknown, portDetails: PortDetails, callback: (response?: unknown) => void) => void | string;
    privileged: boolean;
}

interface PortDetails {
    port?: chrome.runtime.Port;
    frameId?: number;
    frameURL?: string;
    tabId?: number;
    tabURL?: string;
    privileged: boolean;
}

interface MessageRequest {
    channel: string;
    msgId?: number;
    msg: {
        what?: string;
        fn?: string;
        args?: unknown[];
        add?: string[];
    };
}

const messaging = {
    ports: new Map<string, PortDetails>(),
    listeners: new Map<string, ListenerDetails>(),
    defaultHandler: null as ((request: unknown, portDetails: PortDetails, callback: (response?: unknown) => void) => void | string) | null,
    PRIVILEGED_ORIGIN: vAPI.getURL('').slice(0, -1),
    NOOPFUNC: function(): void {},
    UNHANDLED: 'vAPI.messaging.notHandled' as const,

    listen: function(details: { name: string; listener: ListenerDetails['fn']; privileged?: boolean }): void {
        this.listeners.set(details.name, {
            fn: details.listener,
            privileged: details.privileged === true
        });
    },

    onPortDisconnect: function(port: chrome.runtime.Port): void {
        this.ports.delete(port.name);
        void chrome.runtime.lastError;
    },

    onPortConnect: function(port: chrome.runtime.Port): void {
        const self = this;

        port.onDisconnect.addListener(function(p: chrome.runtime.Port) {
            self.onPortDisconnect(p);
        });

        port.onMessage.addListener(function(request: unknown, p: chrome.runtime.Port) {
            self.onPortMessage(request as MessageRequest, p);
        });

        const portDetails: PortDetails = { privileged: false };
        const sender = port.sender;
        const origin = sender?.origin;
        const tab = sender?.tab;
        const url = sender?.url;

        portDetails.frameId = sender?.frameId;
        portDetails.frameURL = url;

        portDetails.privileged = origin !== undefined
            ? origin === this.PRIVILEGED_ORIGIN
            : !!(url && url.startsWith(this.PRIVILEGED_ORIGIN));

        if (tab?.id) {
            portDetails.tabId = tab.id;
            portDetails.tabURL = tab.url;
        }

        this.ports.set(port.name, portDetails);
        port.sender = undefined;
    },

    setup: function(defaultHandler: NonNullable<typeof messaging.defaultHandler>): void {
        if (this.defaultHandler !== null) {
            return;
        }

        this.defaultHandler = defaultHandler;

        const self = this;
        chrome.runtime.onConnect.addListener(function(port: chrome.runtime.Port) {
            self.onPortConnect(port);
        });
    },

    onFrameworkMessage: function(request: MessageRequest, port: chrome.runtime.Port, callback: (response?: unknown) => void): void {
        const portDetails = this.ports.get(port.name) || { privileged: false };
        const tabId = portDetails.tabId;
        const msg = request.msg;

        switch (msg.what) {
        case 'localStorage': {
            if (portDetails.privileged !== true) break;
            if (!vAPI.localStorage || !((msg.fn as string) && vAPI.localStorage[msg.fn as keyof typeof vAPI.localStorage])) {
                callback(null);
                break;
            }
            const args = msg.args || [];
            const fn = vAPI.localStorage[msg.fn as keyof typeof vAPI.localStorage] as (...args: unknown[]) => unknown;
            const result = fn.apply(vAPI.localStorage, args);
            if (result && typeof (result as Promise<unknown>).then === 'function') {
                (result as Promise<unknown>).then(function(data) { callback(data); }).catch(function() {
                    callback(null);
                });
            } else {
                callback(result);
            }
            break;
        }
        case 'userCSS': {
            if (tabId === undefined) break;
            const promises: Array<Promise<void>> = [];
            if (msg.add) {
                for (const cssText of msg.add) {
                    promises.push(new Promise(function(resolve) {
                        chrome.scripting.insertCSS({
                            target: { tabId: tabId },
                            css: cssText
                        }, function() {
                            resolve();
                        });
                    }));
                }
            }
            Promise.all(promises).then(function() {
                callback();
            });
            break;
        }
        default:
            break;
        }
    },

    createCallback: function(port: chrome.runtime.Port, msgId: number): (response?: unknown) => void {
        const msgInstance = this;
        return function(response: unknown) {
            try {
                port.postMessage({
                    msgId: msgId,
                    msg: response !== undefined ? response : null
                });
            } catch {
                msgInstance.onPortDisconnect(port);
            }
        };
    },

    onPortMessage: function(request: MessageRequest, port: chrome.runtime.Port): void {
        let callback: (response?: unknown) => void = this.NOOPFUNC;
        if (request.msgId !== undefined) {
            callback = this.createCallback(port, request.msgId);
        }

        if (request.channel === 'vapi') {
            this.onFrameworkMessage(request, port, callback);
            return;
        }

        const portDetails = this.ports.get(port.name);
        if (portDetails === undefined) {
            callback();
            return;
        }

        const listenerDetails = this.listeners.get(request.channel);
        let r: string = this.UNHANDLED;

        if (listenerDetails !== undefined) {
            if (listenerDetails.privileged === false || portDetails.privileged) {
                r = listenerDetails.fn(request.msg, portDetails, callback) as string || this.UNHANDLED;
            }
        }

        if (r !== this.UNHANDLED) {
            return;
        }

        if (portDetails.privileged && this.defaultHandler) {
            r = this.defaultHandler(request.msg, portDetails, callback) as string || this.UNHANDLED;
        }

        if (r !== this.UNHANDLED) {
            return;
        }

        callback();
    },

    send: function(channel: string, msg: unknown): Promise<unknown> {
        return chrome.runtime.sendMessage({ channel: channel, msg: msg }) as Promise<unknown>;
    },

    sendNative: function(): Promise<Record<string, never>> {
        return Promise.resolve({});
    }
};

export { messaging };
