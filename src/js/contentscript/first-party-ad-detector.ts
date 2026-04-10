/*******************************************************************************

    uBlock Resurrected - First-Party Ad Detector
    
    Detects ads that are injected server-side and embedded in page content.
    These ads cannot be blocked at the network level and must be detected
    through DOM analysis.
    
    Features:
    - Pattern matching for known ad container attributes
    - Heuristic detection for unknown ad patterns
    - Integration with cosmetic filtering
    
*******************************************************************************/

((self) => {
    'use strict';

    const DEBUG = false;
    const LOG_PREFIX = '[FPAD] First-Party Ad Detector:';
    
    const log = (...args) => {
        if (DEBUG) {
            console.log(LOG_PREFIX, ...args);
        }
    };

    // Configuration for first-party ad detection
    const CONFIG = {
        // Attributes that indicate ad containers
        adAttributes: [
            'data-ad', 'data-ad-slot', 'data-ad-client', 'data-ad-unit',
            'data-advertisement', 'data-advert', 'data-ads', 'data-ad-id',
            'data-google-query-id', 'data-ad-status',
            'data-slot', 'data-adunit', 'data-dfp', 'data-gpt',
        ],
        
        // ID patterns for ad containers
        adIdPatterns: [
            /^ad[-_]/i, /^ads[-_]/i, /^advert/i, /^sponsor/i,
            /[-_]ad$/i, /[-_]ads$/i, /[-_]advert/i,
            /^div[-_]gpt/i, /^google_ads/i, /^dfp[-_]/i,
            /adunit/i, /adslot/i, /adcontainer/i,
        ],
        
        // Class patterns for ad containers
        adClassPatterns: [
            /^ad[-_]/i, /^ads[-_]/i, /^advert/i, /^sponsor/i,
            /[-_]ad$/i, /[-_]ads$/i, /[-_]advert/i,
            /ad[-_]?container/i, /ad[-_]?wrapper/i, /ad[-_]?box/i,
            /ad[-_]?banner/i, /ad[-_]?slot/i, /ad[-_]?unit/i,
            /ad[-_]?placeholder/i, /advertisement/i,
            /dfp[-_]/i, /gpt[-_]/i, /google[-_]?ads/i,
            /sponsored[-_]?content/i, /promoted[-_]?content/i,
        ],
        
        // Known ad network iframe patterns
        adIframePatterns: [
            /doubleclick\.net/i, /googlesyndication/i, /googleadservices/i,
            /adnxs/i, /criteo/i, /taboola/i, /outbrain/i,
            /amazon-adsystem/i, /pubmatic/i, /rubicon/i,
            /facebook\.com\/ads/i, /linkedin/i, /twitter/i,
        ],
        
        // Text patterns that indicate ad content
        adTextPatterns: [
            'advertisement', 'advertisement', 'sponsored',
            'ad', 'ads', 'advert', 'promoted',
            'Advertisement', 'Sponsored',
        ],
        
        // Elements commonly used for ads
        adElementTypes: [
            'ins', // Google AdSense
            'iframe', // Ad iframes
        ],
        
        // Mutation observer config
        observerConfig: {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id', 'class', 'data-ad', 'data-ads'],
        },
        
        // Debounce delay for mutation processing
        debounceMs: 100,
    };

    class FirstPartyAdDetector {
        constructor() {
            this.observer = null;
            this.pendingNodes = new Set();
            this.debounceTimer = null;
            this.init();
        }
        
        init() {
            // Start observing when DOM is ready
            if (document.body) {
                this.startObserver();
            } else {
                document.addEventListener('DOMContentLoaded', () => this.startObserver());
            }
            
            // Initial scan
            this.scanDocument();
            
            log('First-party ad detector initialized');
        }
        
        startObserver() {
            this.observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                this.queueNode(node);
                            }
                        }
                    } else if (mutation.type === 'attributes') {
                        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
                            this.queueNode(mutation.target);
                        }
                    }
                }
                
                // Debounce processing
                this.scheduleProcessing();
            });
            
            this.observer.observe(document.documentElement, CONFIG.observerConfig);
            log('Mutation observer started');
        }
        
        queueNode(node) {
            this.pendingNodes.add(node);
        }
        
        scheduleProcessing() {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            
            this.debounceTimer = setTimeout(() => {
                this.processPendingNodes();
            }, CONFIG.debounceMs);
        }
        
        processPendingNodes() {
            const nodes = Array.from(this.pendingNodes);
            this.pendingNodes.clear();
            
            for (const node of nodes) {
                this.analyzeNode(node);
            }
        }
        
        analyzeNode(node) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
            
            const tagName = node.tagName?.toLowerCase() || '';
            
            // Check if it's a known ad element type
            if (CONFIG.adElementTypes.includes(tagName)) {
                log('Found ad element type:', tagName);
                this.handleAdElement(node);
                return;
            }
            
            // Check ID pattern
            const id = node.getAttribute('id') || '';
            for (const pattern of CONFIG.adIdPatterns) {
                if (pattern.test(id)) {
                    log('Found ad by ID pattern:', id);
                    this.handleAdElement(node);
                    return;
                }
            }
            
            // Check class pattern
            const className = node.getAttribute('class') || '';
            for (const pattern of CONFIG.adClassPatterns) {
                if (pattern.test(className)) {
                    log('Found ad by class pattern:', className.substring(0, 50));
                    this.handleAdElement(node);
                    return;
                }
            }
            
            // Check data attributes
            for (const attr of CONFIG.adAttributes) {
                if (node.hasAttribute(attr)) {
                    log('Found ad by attribute:', attr);
                    this.handleAdElement(node);
                    return;
                }
            }
            
            // Check iframe src for ad patterns
            if (tagName === 'iframe') {
                const src = node.getAttribute('src') || '';
                for (const pattern of CONFIG.adIframePatterns) {
                    if (pattern.test(src)) {
                        log('Found ad iframe by src pattern');
                        this.handleAdElement(node);
                        return;
                    }
                }
            }
        }
        
        handleAdElement(node) {
            // Add a marker class for cosmetic filtering
            // The actual hiding is handled by the main cosmetic filter system
            node.classList.add('ubor-ad-detected');
            
            // Log for debugging
            log('Detected ad element:', node.tagName, node.getAttribute('id') || node.getAttribute('class')?.substring(0, 30));
        }
        
        scanDocument() {
            // Quick scan of existing elements
            const allElements = document.querySelectorAll('*');
            let count = 0;
            
            for (const el of allElements) {
                this.analyzeNode(el);
                count++;
            }
            
            log('Scanned', count, 'elements');
        }
        
        // Check if element contains "sponsored" or similar text
        containsAdText(element) {
            const text = element.textContent?.toLowerCase() || '';
            
            for (const pattern of CONFIG.adTextPatterns) {
                if (text.includes(pattern.toLowerCase())) {
                    return true;
                }
            }
            
            return false;
        }
        
        destroy() {
            if (this.observer) {
                this.observer.disconnect();
            }
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            log('Detector destroyed');
        }
    }

    // Initialize
    const detector = new FirstPartyAdDetector();
    log('First-party ad detector ready');

})((typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self));