/**
 * uBlock Resurrected - MV3 Service Worker
 * Debug Logging Utility
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

const CURRENT_LEVEL = LOG_LEVELS.INFO;

const Logger = {
    _format: function(level: number, prefix: string, ...args: unknown[]): string {
        const timestamp = new Date().toISOString();
        const levelStr = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'UNKNOWN';
        return `[${timestamp}] [${levelStr}]${prefix ? ` [${prefix}]` : ''} ${args.map(a => 
            typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')}`;
    },

    debug: function(prefix: string, ...args: unknown[]): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
            console.debug(this._format(LOG_LEVELS.DEBUG, prefix, ...args));
        }
    },

    info: function(prefix: string, ...args: unknown[]): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
            console.info(this._format(LOG_LEVELS.INFO, prefix, ...args));
        }
    },

    warn: function(prefix: string, ...args: unknown[]): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
            console.warn(this._format(LOG_LEVELS.WARN, prefix, ...args));
        }
    },

    error: function(prefix: string, ...args: unknown[]): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
            console.error(this._format(LOG_LEVELS.ERROR, prefix, ...args));
        }
    },

    group: function(label: string): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
            console.group(label);
        }
    },

    groupEnd: function(): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
            console.groupEnd();
        }
    },

    time: function(label: string): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
            console.time(label);
        }
    },

    timeEnd: function(label: string): void {
        if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
            console.timeEnd(label);
        }
    }
};

export { Logger, LOG_LEVELS };
