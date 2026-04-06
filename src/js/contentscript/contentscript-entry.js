/*******************************************************************************

    uBlock Origin - Content Script Module
    Entry Point

    Main entry point that initializes all content script modules in the
    correct order based on their dependencies.

    Dependencies:
    - vAPI must be available (set by background script)
    - vAPI.messaging must be available

    Initialization order:
    1. vAPI extensions (self-executing)
    2. DOM filterer (sets up vAPI.DOMFilterer)
    3. DOM watcher (uses vAPI.DOMFilterer, sets up vAPI.domWatcher)
    4. DOM collapser (needs vAPI.domWatcher, sets up vAPI.domCollapser)
    5. DOM surveyor (needs vAPI.DOMFilterer, sets up vAPI.domSurveyor)
    6. Bootstrap (coordinates everything, starts at the end)

*******************************************************************************/

import './01-vapi-extensions.js';
import { initDOMFilterer } from './04-dom-filterer.js';
import { initDOMWatcher } from './03-dom-watcher.js';
import { initDOMCollapser } from './05-dom-collapser.js';
import { initDOMSurveyor } from './06-dom-surveyor.js';
import { initBootstrap, startBootstrap } from './07-bootstrap.js';

vAPI.contentScript = true;

initDOMFilterer();
initDOMCollapser();
initDOMSurveyor();
initBootstrap();

initDOMWatcher();

startBootstrap();

/******************************************************************************/
