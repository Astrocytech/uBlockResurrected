export function extractHostname(url) {
    try {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        return new URL(url).hostname.toLowerCase();
    }
    catch {
        return null;
    }
}
export function extractRootDomain(hostname) {
    const parts = hostname.split(".");
    if (parts.length >= 2) {
        return parts.slice(-2).join(".");
    }
    return hostname;
}
export function isValidDomain(domain) {
    if (!domain || domain.length === 0)
        return false;
    if (domain.length > 253)
        return false;
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
}
export function normalizeUrl(url) {
    try {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname;
    }
    catch {
        return url;
    }
}
export function getResourceTypeFromTag(tagName) {
    const tag = tagName.toLowerCase();
    const mapping = {
        script: "script",
        img: "image",
        link: "stylesheet",
        iframe: "sub_frame",
        frame: "sub_frame",
        video: "media",
        audio: "media",
        source: "media",
        object: "other",
        embed: "other",
    };
    return mapping[tag] || "other";
}
export function debounce(func, waitMs) {
    let timeout = null;
    return (...args) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            func(...args);
        }, waitMs);
    };
}
export function throttle(func, limitMs) {
    let lastRun = 0;
    return (...args) => {
        const now = Date.now();
        if (now - lastRun >= limitMs) {
            lastRun = now;
            func(...args);
        }
    };
}
export function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}
export function uniqueBy(array, key) {
    const seen = new Set();
    return array.filter(item => {
        const k = item[key];
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
}
export function groupBy(array, key) {
    const groups = {};
    for (const item of array) {
        const k = String(item[key]);
        if (!groups[k])
            groups[k] = [];
        groups[k].push(item);
    }
    return groups;
}
export function retry(fn, maxRetries, delayMs) {
    return fn().catch((error) => {
        if (maxRetries <= 0)
            throw error;
        return new Promise((resolve) => setTimeout(() => {
            resolve(retry(fn, maxRetries - 1, delayMs));
        }, delayMs));
    });
}
export function safeJSONParse(json, fallback) {
    try {
        return JSON.parse(json);
    }
    catch {
        return fallback;
    }
}
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=index.js.map