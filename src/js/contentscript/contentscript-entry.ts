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

import './01-vapi-extensions.ts';
import { initDOMFilterer } from './04-dom-filterer.ts';
import { initDOMWatcher } from './03-dom-watcher.ts';
import { initDOMCollapser } from './05-dom-collapser.ts';
import { initDOMSurveyor } from './06-dom-surveyor.ts';
import { initBootstrap, startBootstrap } from './07-bootstrap.ts';

vAPI.contentScript = true;

initDOMFilterer();
initDOMCollapser();
initDOMSurveyor();
initBootstrap();

initDOMWatcher();

startBootstrap();

/******************************************************************************/
