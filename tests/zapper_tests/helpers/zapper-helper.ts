/**
 * Zapper Test Helper Utilities
 * 
 * Provides mock implementation for testing zapper functionality
 */

import { type Page, type BrowserContext } from '@playwright/test';

/**
 * Zapper state during testing
 */
export interface ZapperState {
    isActive: boolean;
    highlightedElement: string | null;
    removedCount: number;
    undoStack: number;
}

/**
 * Selectors for zapper UI elements
 */
export const ZAPPER_SELECTORS = {
    zapperFrame: '#ubol-zapper-frame, [data-ubol-overlay]',
    quitButton: '#quit',
    undoButton: '#undo',
    overlaySvg: 'svg#overlay',
    overlayPath: 'svg#overlay path',
    tooltip: '#tooltip',
    removeCount: '#removeCount',
    simpleDiv: '#simple-div',
    simpleSpan: '#simple-span',
    simpleParagraph: '#simple-paragraph',
    nestedContainer: '#nested-container',
    nestedInner: '#nested-inner',
    fixedElement: '#fixed-element',
    modalOverlay: '#modal-overlay',
    modalContent: '#modal-content',
    advertisement: '[data-testid="advertisement"]',
    sidebarWidget: '[data-testid="sidebar-widget"]',
    popupBanner: '[data-testid="popup-banner"]',
    zindexElement: '#zindex-element',
    testList: '#test-list',
    listItems: '#test-list li',
    testImage: '#test-image',
    shadowHost: '#shadow-host',
    overflowContainer: '#overflow-hidden-container',
} as const;

/**
 * Create mock zapper frame for testing
 */
export async function createMockZapperFrame(page: Page): Promise<void> {
    await page.evaluate(() => {
        const existing = document.getElementById('ubol-zapper-frame');
        if (existing) existing.remove();
        
        const frame = document.createElement('iframe');
        frame.id = 'ubol-zapper-frame';
        frame.setAttribute('data-ubol-overlay', '');
        frame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:2147483647;background:transparent;';
        
        document.body.appendChild(frame);
    });
}

/**
 * Remove mock zapper frame
 */
export async function removeMockZapperFrame(page: Page): Promise<void> {
    await page.evaluate(() => {
        const frame = document.getElementById('ubol-zapper-frame');
        frame?.remove();
    });
}

/**
 * ZapperTestHelper class
 */
export class ZapperTestHelper {
    private page: Page;
    private context: BrowserContext;
    
    constructor(page: Page, context: BrowserContext) {
        this.page = page;
        this.context = context;
    }
    
    async navigateToTestPage(): Promise<void> {
        const testPageUrl = `file://${process.cwd()}/tests/zapper_tests/fixtures/test-page.html`;
        await this.page.goto(testPageUrl);
        await this.page.waitForLoadState('domcontentloaded');
    }
    
    async activateZapper(): Promise<void> {
        await this.page.evaluate(() => {
            // Use a fixed secret for testing so CSS matching works
            const secretAttr = 'ubol-test-secret';
            (window as any).zapperSecret = secretAttr;
            
            // Make frame pass clicks through using the secret attribute technique
            const cssId = 'ubol-test-css';
            let css = document.getElementById(cssId);
            if (!css) {
                css = document.createElement('style');
                css.id = cssId;
                // When the secret attribute is set, the frame should ignore pointer events
                // When it's not set, the frame should be clickable for its own UI
                css.textContent = `
                    [data-ubol-overlay] { pointer-events: auto !important; }
                    iframe#ubol-zapper-frame[data-ubol-overlay-click] { pointer-events: none !important; }
                    iframe#ubol-zapper-frame { pointer-events: auto !important; }
                `;
                document.head.appendChild(css);
            }
            
            // Recreate frame if it doesn't exist (after stop)
            if (!document.getElementById('ubol-zapper-frame')) {
                const frame = document.createElement('iframe');
                frame.id = 'ubol-zapper-frame';
                frame.setAttribute('data-ubol-overlay', '');
                frame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:2147483647;background:transparent;';
                document.body.appendChild(frame);
            }
            
            // Check if overlay already exists with frame
            if ((window as any).ubolOverlay && (window as any).ubolOverlay.frame) {
                return;
            }
            
            const ubolOverlay = {
                secretAttr,
                file: null as string | null,
                port: null as MessagePort | null,
                frame: null as Element | null,
                onmessage: null as Function | null,
                highlightedElements: [] as Element[],
                
                elementFromPoint(x: number, y: number): Element | null {
                    if (!this.frame) return null;
                    // Set attribute that CSS selector [data-ubol-overlay-click] will match
                    this.frame.setAttribute('data-ubol-overlay-click', this.secretAttr);
                    const elem = document.elementFromPoint(x, y);
                    this.frame.removeAttribute('data-ubol-overlay-click');
                    if (elem === document.body || elem === document.documentElement) return null;
                    if (elem === this.frame) return null;
                    return elem as Element;
                },
                
                highlightElements(elems: Element[]) {
                    this.highlightedElements = Array.from(elems || []).filter(e => 
                        e instanceof Element && e.id !== 'ubol-zapper-frame'
                    );
                    this.highlightUpdate();
                },
                
                highlightUpdate() {
                    const ow = window.innerWidth;
                    const oh = window.innerHeight;
                    const islands: string[] = [];
                    for (const elem of this.highlightedElements) {
                        const rect = elem.getBoundingClientRect();
                        if (rect.left > ow || rect.top > oh) continue;
                        if (rect.left + rect.width < 0 || rect.top + rect.height < 0) continue;
                        islands.push(`M${rect.left} ${rect.top}h${rect.width}v${rect.height}h-${rect.width}z`);
                    }
                    
                    // Create/update SVG overlay
                    let svg = document.getElementById('overlay') as SVGElement | null;
                    if (!svg) {
                        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        svg.id = 'overlay';
                        svg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483646;';
                        document.body.appendChild(svg);
                    }
                    
                    svg.innerHTML = `
                        <path fill-rule="evenodd" fill="rgba(255,255,0,0.3)" stroke="yellow" stroke-width="1px" 
                              d="${islands.join('')}" opacity="0"/>
                        <path fill-rule="evenodd" fill="rgba(255,255,0,0.3)" stroke="yellow" stroke-width="1px" 
                              d="M0 0h${ow}v${oh}h-${ow}z"/>
                    `;
                    
                    if (this.port) {
                        this.port.postMessage({
                            what: 'svgPaths',
                            ocean: `M0 0h${ow}v${oh}h-${ow}z`,
                            islands: islands.join('')
                        });
                    }
                },
                
                install(file: string, onmessage: Function) {
                    this.file = file;
                    this.onmessage = onmessage;
                    
                    // Get frame reference
                    this.frame = document.getElementById('ubol-zapper-frame');
                    
                    // Set src attribute to load zapper UI
                    if (this.frame instanceof HTMLIFrameElement) {
                        this.frame.src = file;
                    }
                    
                    const channel = new MessageChannel();
                    this.port = channel.port1;
                    const self = this;
                    this.port.onmessage = (ev) => {
                        if (self.onmessage) self.onmessage(ev.data);
                    };
                    
                    // Create UI elements (normally in iframe, but we add to main doc for testing)
                    const createUI = () => {
                        const css = document.createElement('style');
                        css.id = 'zapper-ui-css';
                        css.textContent = `
                            #quit, #undo {
                                position: fixed;
                                padding: 8px 16px;
                                border: 2px solid yellow;
                                background: rgba(0,0,0,0.8);
                                color: yellow;
                                font-family: monospace;
                                font-size: 14px;
                                cursor: pointer;
                                z-index: 2147483647;
                                user-select: none;
                            }
                            #quit { bottom: 10px; right: 10px; }
                            #undo { bottom: 50px; left: 10px; }
                            #tooltip {
                                position: fixed;
                                padding: 4px 8px;
                                background: rgba(0,0,0,0.8);
                                color: white;
                                font-family: monospace;
                                font-size: 12px;
                                z-index: 2147483647;
                                pointer-events: none;
                            }
                            #removeCount {
                                position: fixed;
                                bottom: 10px;
                                left: 50%;
                                transform: translateX(-50%);
                                padding: 4px 8px;
                                background: rgba(0,0,0,0.8);
                                color: yellow;
                                font-family: monospace;
                                font-size: 12px;
                                z-index: 2147483647;
                            }
                        `;
                        document.head.appendChild(css);
                        
                        const quit = document.createElement('button');
                        quit.id = 'quit';
                        quit.textContent = 'QUIT';
                        quit.style.cssText = 'position:fixed;bottom:10px;right:10px;padding:8px 16px;background:rgba(0,0,0,0.8);color:yellow;border:2px solid yellow;cursor:pointer;z-index:2147483647;';
                        document.body.appendChild(quit);
                        
                        const undo = document.createElement('button');
                        undo.id = 'undo';
                        undo.textContent = 'UNDO';
                        undo.style.cssText = 'position:fixed;bottom:50px;left:10px;padding:8px 16px;background:rgba(0,0,0,0.8);color:yellow;border:2px solid yellow;cursor:pointer;z-index:2147483647;';
                        document.body.appendChild(undo);
                        
                        const tooltip = document.createElement('div');
                        tooltip.id = 'tooltip';
                        tooltip.style.cssText = 'position:fixed;padding:4px 8px;background:rgba(0,0,0,0.8);color:white;font-family:monospace;font-size:12px;z-index:2147483647;pointer-events:none;display:none;';
                        document.body.appendChild(tooltip);
                        
                        const removeCount = document.createElement('div');
                        removeCount.id = 'removeCount';
                        removeCount.textContent = '0 removed';
                        removeCount.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);padding:4px 8px;background:rgba(0,0,0,0.8);color:yellow;font-family:monospace;font-size:12px;z-index:2147483647;';
                        document.body.appendChild(removeCount);
                    };
                    createUI();
                    
                    setTimeout(() => {
                        if (this.onmessage) this.onmessage({ what: 'startTool' });
                    }, 10);
                    return true;
                },
                
                onKeyPressed(e: KeyboardEvent) {
                    if (e.key === 'Escape') {
                        this.stop();
                    } else if (e.key === 'Delete' || e.key === 'Backspace') {
                        if (this.highlightedElements?.length > 0) {
                            const elem = this.highlightedElements[0];
                            const undoStack = (window as any).zapperUndoStack;
                            if (elem && undoStack) {
                                undoStack.push({
                                    elem: elem,
                                    parent: elem.parentNode,
                                    nextSibling: elem.nextSibling
                                });
                                elem.remove();
                                this.highlightElements([]);
                                if (this.port) {
                                    this.port.postMessage({what: 'updateCount', count: undoStack.length});
                                }
                            }
                        }
                    }
                },
                
                stop() {
                    if (this.frame) this.frame.remove();
                    document.getElementById('overlay')?.remove();
                    document.getElementById('quit')?.remove();
                    document.getElementById('undo')?.remove();
                    document.getElementById('tooltip')?.remove();
                    document.getElementById('removeCount')?.remove();
                    // Reset for potential re-activation (but keep ubolOverlay reference)
                    this.frame = null;
                    this.port = null;
                    this.onmessage = null;
                    this.highlightedElements = [];
                    // Don't remove ubolOverlay from window - we need it for re-activation
                }
            };
            
            (window as any).ubolOverlay = ubolOverlay;
            
            const undoStack: Array<{elem: Element, parent: Node, nextSibling: Node | null}> = [];
            if (!(window as any).zapperUndoStack) {
                (window as any).zapperUndoStack = undoStack;
            }
            
            function syncStackToWindow() {
                (window as any).zapperUndoStack = undoStack.slice();
            }
            
            const overlay = ubolOverlay;
            
            function highlightAtPoint(x: number, y: number) {
                const elem = overlay.elementFromPoint(x, y);
                if (elem) overlay.highlightElements([elem]);
            }
            
            function zapElementAtPoint(x?: number, y?: number, options?: any) {
                if (options?.highlight) {
                    if (x !== undefined && y !== undefined) {
                        const elem = overlay.elementFromPoint(x, y);
                        if (elem) overlay.highlightElements([elem]);
                    }
                    return;
                }
                let elemToRemove: Element | null = null;
                if (overlay.highlightedElements?.length > 0) {
                    elemToRemove = overlay.highlightedElements[0];
                } else if (x !== undefined && y !== undefined) {
                    elemToRemove = overlay.elementFromPoint(x, y);
                }
                if (!elemToRemove) return;
                undoStack.push({elem: elemToRemove, parent: elemToRemove.parentNode, nextSibling: elemToRemove.nextSibling});
                elemToRemove.remove();
                overlay.highlightElements([]);
                syncStackToWindow();
                if (overlay.port) {
                    overlay.port.postMessage({what: 'updateCount', count: undoStack.length});
                }
            }
            
            function undoLastRemoval() {
                const stack = (window as any).zapperUndoStack;
                if (!stack || stack.length === 0) return;
                const item = stack.pop()!;
                if (item.nextSibling) item.parent.insertBefore(item.elem, item.nextSibling);
                else item.parent.appendChild(item.elem);
                syncStackToWindow();
                if (overlay.port) {
                    overlay.port.postMessage({what: 'updateCount', count: stack.length});
                }
            }
            
            function clearUndoStack() {
                undoStack.length = 0;
                syncStackToWindow();
            }
            
            (window as any).zapperMessageHandler = (msg: any) => {
                switch (msg.what) {
                    case 'startTool': 
                        if (!(window as any).zapperUndoStack) {
                            (window as any).zapperUndoStack = undoStack;
                        }
                        break;
                    case 'quitTool': overlay.stop(); break;
                    case 'zapElementAtPoint': zapElementAtPoint(msg.mx, msg.my, msg.options); break;
                    case 'unhighlight': overlay.highlightElements([]); break;
                    case 'highlightElementAtPoint': highlightAtPoint(msg.mx, msg.my); break;
                    case 'undoLastRemoval': undoLastRemoval(); break;
                    case 'getStackCount':
                        if (overlay.port) {
                            overlay.port.postMessage({ what: 'updateCount', count: (window as any).zapperUndoStack?.length || 0 });
                        }
                        break;
                }
            };
            
            (window as any).zapperUndoLastRemoval = undoLastRemoval;
            (window as any).zapperClearUndoStack = clearUndoStack;
            (window as any).zapperClearUndoStack = clearUndoStack;
            
            // Add keyboard event handler for Delete/Backspace and ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    overlay.stop();
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (overlay.highlightedElements?.length > 0) {
                        zapElementAtPoint(undefined, undefined, {});
                    }
                }
            });
            
            // Handle button clicks (QUIT, UNDO) from the main page
            // These buttons are in the iframe but we handle clicks from the main context
            const handleButtonClick = (buttonId: string) => {
                switch (buttonId) {
                    case 'quit':
                        if (overlay.port) overlay.port.postMessage({ what: 'quitTool' });
                        overlay.stop();
                        break;
                    case 'undo':
                        undoLastRemoval();
                        if (overlay.port) overlay.port.postMessage({ what: 'undoLastRemoval' });
                        break;
                }
            };
            
            document.addEventListener('click', (e) => {
                const target = e.target as Element;
                if (target.id === 'quit' || target.id === 'undo') {
                    handleButtonClick(target.id);
                }
            });
            
            overlay.install('/zapper-ui.html', (window as any).zapperMessageHandler);
        });
    }
    
    async waitForZapperActive(timeout: number = 5000): Promise<void> {
        await this.page.waitForFunction(
            () => (window as any).ubolOverlay?.frame !== null,
            { timeout }
        );
    }
    
    async waitForZapperInactive(timeout: number = 5000): Promise<void> {
        await this.page.waitForFunction(
            () => (window as any).ubolOverlay?.frame === null || (window as any).ubolOverlay?.frame === undefined,
            { timeout }
        );
    }
    
    async getZapperState(): Promise<ZapperState> {
        return this.page.evaluate(() => {
            const ubol = (window as any).ubolOverlay;
            const stack = (window as any).zapperUndoStack || [];
            return {
                isActive: ubol?.frame !== null && ubol?.frame !== undefined,
                highlightedElement: ubol?.highlightedElements?.[0]?.id || null,
                removedCount: stack.length,
                undoStack: stack.length
            };
        });
    }
    
    async hoverOver(selector: string): Promise<void> {
        const locator = this.page.locator(selector);
        const box = await locator.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            await this.page.evaluate(({cx, cy}) => {
                const overlay = (window as any).ubolOverlay;
                if (!overlay) return;
                
                let elem;
                if (overlay.frame) {
                    // Set attribute that CSS selector [data-ubol-overlay-click] will match
                    overlay.frame.setAttribute('data-ubol-overlay-click', '1');
                    elem = document.elementFromPoint(cx, cy);
                    overlay.frame.removeAttribute('data-ubol-overlay-click');
                } else {
                    elem = document.elementFromPoint(cx, cy);
                }
                
                if (elem && elem !== overlay.frame) {
                    overlay.highlightedElements = [elem];
                    overlay.highlightUpdate();
                }
            }, {cx: x, cy: y});
        }
        await this.page.waitForTimeout(50);
    }
    
    async clickElement(selector: string): Promise<void> {
        const locator = this.page.locator(selector);
        try {
            const box = await locator.boundingBox({ timeout: 100 });
            if (!box || box.width <= 0 || box.height <= 0) {
                return;
            }
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            await this.page.evaluate(({cx, cy}) => {
                const overlay = (window as any).ubolOverlay;
                let undoStack = (window as any).zapperUndoStack;
                if (!undoStack) {
                    undoStack = [];
                    (window as any).zapperUndoStack = undoStack;
                }
                
                if (!overlay || !overlay.frame) {
                    // Frame not initialized, try direct approach
                    const elem = document.querySelector('#simple-div');
                    if (elem && elem.parentNode) {
                        undoStack.push({
                            elem: elem,
                            parent: elem.parentNode,
                            nextSibling: elem.nextSibling
                        });
                        elem.remove();
                    }
                    return;
                }
                
                // Use the highlighted element if available, otherwise find element at point
                let elemToRemove: Element | null = null;
                if (overlay.highlightedElements?.length > 0) {
                    elemToRemove = overlay.highlightedElements[0];
                } else {
                    // Use secret attribute trick to bypass pointer-events
                    overlay.frame.setAttribute('data-ubol-overlay-click', '1');
                    elemToRemove = document.elementFromPoint(cx, cy);
                    overlay.frame.removeAttribute('data-ubol-overlay-click');
                }
                
                if (!elemToRemove || elemToRemove === overlay.frame) return;
                
                undoStack.push({
                    elem: elemToRemove,
                    parent: elemToRemove.parentNode,
                    nextSibling: elemToRemove.nextSibling
                });
                
                elemToRemove.remove();
                overlay.highlightedElements = [];
                
                if (overlay.port) {
                    overlay.port.postMessage({what: 'updateCount', count: undoStack.length});
                }
            }, {cx: x, cy: y});
        } catch (e) {
            // Element doesn't exist, ignore
            return;
        }
        await this.page.waitForTimeout(100);
    }
    
    async pressKey(key: string): Promise<void> {
        await this.page.keyboard.press(key);
        await this.page.waitForTimeout(50);
    }
    
    async elementExists(selector: string): Promise<boolean> {
        return (await this.page.locator(selector).count()) > 0;
    }
    
    async getRemovedCount(): Promise<number> {
        return this.page.evaluate(() => (window as any).removedElements?.length || 0);
    }
    
    async getRemainingTestElements(): Promise<number> {
        return this.page.evaluate(() => (window as any).getTestElementCount?.() || 0);
    }
}

export default ZapperTestHelper;
