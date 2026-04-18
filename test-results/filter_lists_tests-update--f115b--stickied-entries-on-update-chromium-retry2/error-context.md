# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: filter_lists_tests/update-now.spec.ts >> Update Now (TC6) >> should remove stickied entries on update
- Location: tests/filter_lists_tests/update-now.spec.ts:38:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('.listEntry[data-key="easy-list"] .detailbar input[type="checkbox"]').first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - paragraph [ref=e3]:
    - button "_":
      - generic:
        - img
      - generic: _
    - button "_":
      - generic:
        - img
      - generic: _
  - generic [ref=e4]:
    - generic [ref=e7]:
      - checkbox [ref=e8]
      - img
    - generic [ref=e11]:
      - checkbox [ref=e12]
      - img
    - generic [ref=e14]:
      - generic [ref=e15]:
        - checkbox [ref=e16]
        - img
      - generic [ref=e18]:
        - img
    - generic [ref=e20]:
      - generic [ref=e21]:
        - checkbox [ref=e22]
        - img
      - generic [ref=e24]:
        - img
  - generic [ref=e25]:
    - generic [ref=e26]:
      - generic [ref=e27]:
        - img
      - text: 34,892 network filters • 43,250 cosmetic filters
    - generic [ref=e28]:
      - searchbox [ref=e29]
      - generic [ref=e30]:
        - img
    - generic [ref=e31]:
      - generic [ref=e36]:
        - checkbox "My filters" [checked] [ref=e38]
        - generic [ref=e39]: My filters
      - generic [ref=e41]:
        - generic [ref=e42]:
          - generic [ref=e43]: angle-up
          - generic [ref=e44]: default
        - generic [ref=e45]: 0/1
      - generic [ref=e46]:
        - generic [ref=e47]:
          - generic [ref=e48]:
            - generic [ref=e49]: angle-up
            - generic [ref=e50]: ads
          - generic [ref=e51]: 0/1
        - generic [ref=e55]:
          - checkbox "EasyList" [checked] [ref=e57]
          - generic [ref=e58]: EasyList
      - generic [ref=e59]:
        - generic [ref=e60]:
          - generic [ref=e61]:
            - generic [ref=e62]: angle-up
            - generic [ref=e63]: privacy
          - generic [ref=e64]: 0/2
        - generic [ref=e68]:
          - checkbox "EasyPrivacy" [checked] [ref=e70]
          - generic [ref=e71]: EasyPrivacy
      - generic [ref=e73]:
        - generic [ref=e74]:
          - generic [ref=e75]: angle-up
          - generic [ref=e76]: social
        - generic [ref=e77]: 0/1
      - generic [ref=e79]:
        - generic [ref=e80]:
          - generic [ref=e81]: angle-up
          - generic [ref=e82]: annoyances
        - generic [ref=e83]: 0/1
    - generic [ref=e85]:
      - generic [ref=e87]:
        - img
      - link [ref=e88] [cursor=pointer]:
        - /url: https://github.com/gorhill/uBlock/wiki/Filter-lists-from-around-the-web
        - img
```

# Test source

```ts
  243 |       // Remove empty groups
  244 |       for (const key of groupKeys) {
  245 |         if (Object.keys(listTree[key].lists).length === 0) {
  246 |           delete listTree[key];
  247 |         }
  248 |       }
  249 |       
  250 |       // Create DOM elements
  251 |       const createListEntry = (listDetails: any, depth: number) => {
  252 |         const template = document.querySelector('#templates .listEntry[data-role="leaf"]');
  253 |         if (!template) return null;
  254 |         return template.cloneNode(true);
  255 |       };
  256 |       
  257 |       // Build HTML for list entries
  258 |       const listEntriesContainer = document.querySelector('#lists .listEntries');
  259 |       if (listEntriesContainer) {
  260 |         let html = '';
  261 |         
  262 |         for (const [groupKey, groupData] of Object.entries(listTree)) {
  263 |           const group = groupData as any;
  264 |           html += `<div class="listEntry expandable" data-key="${groupKey}" data-parent="root" data-role="node">`;
  265 |           html += `<span class="detailbar"><label><span class="fa-icon listExpander">angle-up</span><span class="listname">${group.title}</span></label><span class="nodestats">0/${Object.keys(group.lists).length}</span></span>`;
  266 |           html += `<div class="listEntries">`;
  267 |           
  268 |           for (const [listKey, listData] of Object.entries(group.lists)) {
  269 |             const list = listData as any;
  270 |             const isChecked = mockData.current[listKey] ? 'checked' : '';
  271 |             html += `<div class="listEntry ${isChecked}" data-key="${listKey}" data-parent="${groupKey}" data-role="leaf">`;
  272 |             html += `<span class="detailbar"><label><span class="input checkbox"><input type="checkbox" ${isChecked ? 'checked' : ''}></span><span class="listname">${list.title || listKey}</span></label>`;
  273 |             html += `<span class="iconbar"><span class="fa-icon status cache" title="Cached"></span></span>`;
  274 |             html += `<span class="leafstats"></span></span></div>`;
  275 |           }
  276 |           
  277 |           html += `</div></div>`;
  278 |         }
  279 |         
  280 |         listEntriesContainer.innerHTML = html;
  281 |       }
  282 |       
  283 |       // Update stats text
  284 |       const statsElem = document.getElementById('listsOfBlockedHostsPrompt');
  285 |       if (statsElem) {
  286 |         statsElem.textContent = `${mockData.netFilterCount.toLocaleString()} network filters • ${mockData.cosmeticFilterCount.toLocaleString()} cosmetic filters`;
  287 |       }
  288 |     });
  289 |   }
  290 | 
  291 |   async getListsContainer(): Promise<Locator> {
  292 |     return this.page.locator(FILTER_LIST_SELECTORS.listsContainer);
  293 |   }
  294 | 
  295 |   async getButtonApply(): Promise<Locator> {
  296 |     return this.page.locator(FILTER_LIST_SELECTORS.buttonApply);
  297 |   }
  298 | 
  299 |   async getButtonUpdate(): Promise<Locator> {
  300 |     return this.page.locator(FILTER_LIST_SELECTORS.buttonUpdate);
  301 |   }
  302 | 
  303 |   async getSearchField(): Promise<Locator> {
  304 |     return this.page.locator(FILTER_LIST_SELECTORS.searchField);
  305 |   }
  306 | 
  307 |   async getListEntries(): Promise<Locator> {
  308 |     return this.page.locator(FILTER_LIST_SELECTORS.listEntry);
  309 |   }
  310 | 
  311 |   async getLeafEntries(): Promise<Locator> {
  312 |     return this.page.locator(FILTER_LIST_SELECTORS.listEntryLeaf);
  313 |   }
  314 | 
  315 |   async getNodeEntries(): Promise<Locator> {
  316 |     return this.page.locator(FILTER_LIST_SELECTORS.listEntryNode);
  317 |   }
  318 | 
  319 |   async getGroupHeader(groupKey: string): Promise<Locator> {
  320 |     return this.page.locator(`.listEntry[data-key="${groupKey}"]`);
  321 |   }
  322 | 
  323 |   async getFilterListByKey(listKey: string): Promise<Locator> {
  324 |     return this.page.locator(`.listEntry[data-key="${listKey}"]`);
  325 |   }
  326 | 
  327 |   async getCheckboxForList(listKey: string): Promise<Locator> {
  328 |     return this.page.locator(`.listEntry[data-key="${listKey}"] ${FILTER_LIST_SELECTORS.checkbox}`).first();
  329 |   }
  330 | 
  331 |   async isListChecked(listKey: string): Promise<boolean> {
  332 |     const entry = await this.getFilterListByKey(listKey);
  333 |     return await entry.evaluate(el => el.classList.contains('checked'));
  334 |   }
  335 | 
  336 |   async isCheckboxChecked(listKey: string): Promise<boolean> {
  337 |     const checkbox = await this.getCheckboxForList(listKey);
  338 |     return await checkbox.isChecked();
  339 |   }
  340 | 
  341 |   async toggleFilterList(listKey: string): Promise<void> {
  342 |     const checkbox = await this.getCheckboxForList(listKey);
> 343 |     await checkbox.click();
      |                    ^ Error: locator.click: Test timeout of 60000ms exceeded.
  344 |   }
  345 | 
  346 |   async clickApplyButton(): Promise<void> {
  347 |     const button = await this.getButtonApply();
  348 |     await button.click();
  349 |   }
  350 | 
  351 |   async clickUpdateButton(): Promise<void> {
  352 |     const button = await this.getButtonUpdate();
  353 |     await button.click();
  354 |   }
  355 | 
  356 |   async isApplyButtonEnabled(): Promise<boolean> {
  357 |     const button = await this.getButtonApply();
  358 |     const isDisabled = await button.isDisabled();
  359 |     return !isDisabled;
  360 |   }
  361 | 
  362 |   async isUpdateButtonEnabled(): Promise<boolean> {
  363 |     const button = await this.getButtonUpdate();
  364 |     const isDisabled = await button.isDisabled();
  365 |     return !isDisabled;
  366 |   }
  367 | 
  368 |   async searchLists(query: string): Promise<void> {
  369 |     const searchField = await this.getSearchField();
  370 |     await searchField.fill(query);
  371 |     await searchField.dispatchEvent('input');
  372 |   }
  373 | 
  374 |   async clearSearch(): Promise<void> {
  375 |     const searchField = await this.getSearchField();
  376 |     await searchField.fill('');
  377 |     await searchField.dispatchEvent('input');
  378 |   }
  379 | 
  380 |   async getListStats(): Promise<string | null> {
  381 |     const prompt = this.page.locator(FILTER_LIST_SELECTORS.listsOfBlockedHostsPrompt);
  382 |     return await prompt.textContent();
  383 |   }
  384 | 
  385 |   async isGroupExpanded(groupKey: string): Promise<boolean> {
  386 |     const group = await this.getGroupHeader(groupKey);
  387 |     return await group.evaluate(el => el.classList.contains('expanded'));
  388 |   }
  389 | 
  390 |   async expandGroup(groupKey: string): Promise<void> {
  391 |     const group = await this.getGroupHeader(groupKey);
  392 |     const expander = group.locator(FILTER_LIST_SELECTORS.listExpander);
  393 |     await expander.click();
  394 |   }
  395 | 
  396 |   async collapseGroup(groupKey: string): Promise<void> {
  397 |     const group = await this.getGroupHeader(groupKey);
  398 |     if (await group.evaluate(el => el.classList.contains('expanded'))) {
  399 |       const expander = group.locator(FILTER_LIST_SELECTORS.listExpander);
  400 |       await expander.click();
  401 |     }
  402 |   }
  403 | 
  404 |   async getImportTextarea(): Promise<Locator> {
  405 |     return this.page.locator(FILTER_LIST_SELECTORS.importTextarea);
  406 |   }
  407 | 
  408 |   async importCustomList(url: string): Promise<void> {
  409 |     const textarea = await this.getImportTextarea();
  410 |     await textarea.fill(url);
  411 |     await this.expandImportSection();
  412 |   }
  413 | 
  414 |   async expandImportSection(): Promise<void> {
  415 |     const importEntry = this.page.locator(FILTER_LIST_SELECTORS.listEntryImport);
  416 |     const expander = importEntry.locator(FILTER_LIST_SELECTORS.listExpander);
  417 |     await expander.click();
  418 |   }
  419 | 
  420 |   async getStatusIcon(listKey: string, statusType: 'unsecure' | 'obsolete' | 'cache' | 'updating' | 'failed'): Promise<Locator> {
  421 |     const entry = await this.getFilterListByKey(listKey);
  422 |     return entry.locator(`.status.${statusType}`);
  423 |   }
  424 | 
  425 |   async isStatusIconVisible(listKey: string, statusType: 'unsecure' | 'obsolete' | 'cache' | 'updating' | 'failed'): Promise<boolean> {
  426 |     const icon = await this.getStatusIcon(listKey, statusType);
  427 |     return await icon.isVisible();
  428 |   }
  429 | 
  430 |   async getLeafStats(listKey: string): Promise<string | null> {
  431 |     const entry = await this.getFilterListByKey(listKey);
  432 |     const stats = entry.locator(FILTER_LIST_SELECTORS.leafstats);
  433 |     return await stats.textContent();
  434 |   }
  435 | 
  436 |   async getGroupStats(groupKey: string): Promise<string | null> {
  437 |     const group = await this.getGroupHeader(groupKey);
  438 |     const stats = group.locator(FILTER_LIST_SELECTORS.nodestats);
  439 |     return await stats.textContent();
  440 |   }
  441 | 
  442 |   async getEnabledListsCount(): Promise<number> {
  443 |     const checkedEntries = this.page.locator(`${FILTER_LIST_SELECTORS.listEntryLeaf}.checked`);
```