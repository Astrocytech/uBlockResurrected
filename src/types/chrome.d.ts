/**
 * Chrome Extension API Type Augmentations
 * 
 * These types augment the @types/chrome package with MV3-specific
 * and uBlock Origin-specific extensions.
 */

declare namespace chrome {
    namespace runtime {
        interface MessageOptions {
            /** Whether the message is expected to result in a response. */
            includeTlsChannelId?: boolean;
        }

        interface SendResponseOptions {
            /** Whether the response is from a service worker. */
            toNativePage?: boolean;
        }

        interface Port {
            onDisconnect: chrome.events.Event<(port: Port) => void>;
            onMessage: chrome.events.Event<(message: unknown, port: Port) => void>;
        }

        function connect(connectInfo?: { name?: string; includeTlsChannelId?: boolean }): Port;
        function sendMessage(message: unknown, options?: SendResponseOptions): Promise<unknown>;
    }

    namespace scripting {
        interface InjectionResult {
            frameId: number;
            result: unknown;
            error?: string;
        }

        interface ExecuteScriptOptions {
            target: {
                tabId: number;
                allFrames?: boolean;
                frameIds?: number[];
            };
            files?: string[];
            world?: 'MAIN' | 'ISOLATED';
        }

        function executeScript(options: ExecuteScriptOptions): Promise<InjectionResult[]>;
    }

    namespace tabs {
        interface Tab {
            id?: number;
            index?: number;
            windowId?: number;
            openerTabId?: number;
            highlighted?: boolean;
            active?: boolean;
            pinned?: boolean;
            status?: string;
            incognito?: boolean;
            width?: number;
            height?: number;
            sessionId?: string;
            title?: string;
            url?: string;
            favIconUrl?: string;
        }

        function get(tabId: number): Promise<Tab>;
        function query(queryInfo: {
            active?: boolean;
            currentWindow?: boolean;
            lastFocusedWindow?: boolean;
            windowId?: number;
            windowType?: string;
        }): Promise<Tab[]>;
        function create(createProperties: {
            url?: string;
            active?: boolean;
            index?: number;
            openerTabId?: number;
            pinned?: boolean;
            windowId?: number;
        }): Promise<Tab>;
        function remove(tabId: number): Promise<void>;
        function update(tabId: number, updateProperties: {
            url?: string;
            active?: boolean;
            highlighted?: boolean;
            pinned?: boolean;
        }): Promise<Tab>;
    }

    namespace commands {
        interface Command {
            name?: string;
            description?: string;
            shortcut?: string;
        }

        function getAll(): Promise<Command[]>;
    }
}

/**
 * Service Worker global type augmentation
 */
declare const self: ServiceWorkerGlobalScope & typeof globalThis;
