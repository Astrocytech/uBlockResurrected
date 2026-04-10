import { Page, BrowserContext, Locator, expect } from '@playwright/test';

export const FILTER_LIST_SELECTORS = {
  listsContainer: '#lists',
  buttonApply: '#buttonApply',
  buttonUpdate: '#buttonUpdate',
  autoUpdate: '#autoUpdate',
  suspendUntilListsAreLoaded: '#suspendUntilListsAreLoaded',
  parseCosmeticFilters: '#parseCosmeticFilters',
  ignoreGenericCosmeticFilters: '#ignoreGenericCosmeticFilters',
  listsOfBlockedHostsPrompt: '#listsOfBlockedHostsPrompt',
  searchField: '.searchfield input',
  cloudWidget: '#cloudWidget',
  templates: '#templates',
  listEntries: '#lists .listEntries',
  listEntry: '.listEntry',
  listEntryLeaf: '.listEntry[data-role="leaf"]',
  listEntryNode: '.listEntry[data-role="node"]',
  listEntryImport: '.listEntry[data-role="import"]',
  listEntryChecked: '.listEntry.checked',
  listEntryRoot: '.listEntry[data-parent="root"]',
  detailbar: '.detailbar',
  checkbox: '.detailbar input[type="checkbox"]',
  listName: '.listName, .listname',
  iconbar: '.iconbar',
  contentIcon: '.iconbar .content',
  supportIcon: '.iconbar .support',
  removeIcon: '.iconbar .remove',
  mustreadIcon: '.iconbar .mustread',
  statusUnsecure: '.iconbar .status.unsecure',
  statusObsolete: '.iconbar .status.obsolete',
  statusCache: '.iconbar .status.cache',
  statusUpdating: '.iconbar .status.updating',
  statusFailed: '.iconbar .status.failed',
  leafstats: '.leafstats',
  nodestats: '.nodestats',
  listExpander: '.listExpander',
  importTextarea: '.listEntry[data-role="import"] textarea',
  rootstats: '.rootstats',
  groupKeys: [
    'user',
    'default', 
    'ads',
    'privacy',
    'malware',
    'multipurpose',
    'cookies',
    'social',
    'annoyances',
    'regions',
    'unknown',
    'custom'
  ],
  filterListKeys: [
    'user-filters',
    'ublock-filters',
    'ublock-badfilters',
    'easy-list',
    'easy-privacy',
    'fanboy-social',
    'fanboy-annoyances',
    'ublock-unbreak'
  ]
};

export class FilterListsTestHelper {
  private _page: Page;
  private _context: BrowserContext;

  constructor(page: Page, context: BrowserContext) {
    this._page = page;
    this._context = context;
  }

  get page() {
    return this._page;
  }

  get context() {
    return this._context;
  }

  async navigateToFilterLists(filePath?: string): Promise<void> {
    const basePath = filePath || 'src/3p-filters.html';
    const fullPath = `file://${process.cwd()}/${basePath}`;
    
    await this.page.addInitScript(() => {
      // Define browser FIRST before any scripts can access it
      if (typeof window.browser === 'undefined') {
        window.browser = {
          storage: {
            local: {
              get: (key: any) => Promise.resolve({ [key]: null }),
              set: (obj: any) => Promise.resolve(),
              remove: (key: string) => Promise.resolve()
            }
          },
          webRequest: {
            MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES: 20
          },
          runtime: {
            getURL: (path: string) => '',
            getManifest: () => ({ manifest_version: 3, version: '1.0.0' })
          },
          i18n: {
            getMessage: (key: string, args?: any) => key,
            getUILanguage: () => 'en',
            getAcceptLanguages: () => Promise.resolve(['en'])
          }
        };
      }
      
      // Mock chrome.i18n as well
      if (typeof window.chrome === 'undefined') {
        window.chrome = {} as any;
      }
      window.chrome.i18n = window.browser.i18n;
      
      const vAPI = window.vAPI || (window.vAPI = {});
      
      vAPI.defer = {
        create: () => ({ off: () => {}, offon: () => {}, timer: null })
      };
      
      vAPI.localStorage = {
        getItemAsync: (key: string) => Promise.resolve(null),
        setItemAsync: (key: string, val: any) => Promise.resolve()
      };
      
      vAPI.messaging = {
        send: (channel: string, msg: any) => Promise.resolve({}),
        listen: (obj: any) => {}
      };
      
      vAPI.warSecret = {
        short: () => 'test-secret',
        long: () => 'test-secret-long'
      };
      
      vAPI.webextFlavor = {
        soup: new Map([['devbuild', false]])
      };
      
      vAPI.storage = {
        QUOTA_BYTES: 5242880
      };
    });
    
    await this.page.goto(fullPath, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(1500);
    await this.setupMockAndRender();
    await this.page.waitForTimeout(500);
  }
  
  private async setupMockAndRender(): Promise<void> {
    await this.page.evaluate(() => {
      // Mock data
      const mockData = {
        autoUpdate: true,
        available: {
          'user-filters': { content: 'filters', group: 'user', title: 'My filters' },
          'ublock-filters': { content: 'filters', group: 'default', parent: 'uBlock filters', title: 'uBlock filters – Ads', preferred: true },
          'ublock-badware': { content: 'filters', group: 'default', parent: 'uBlock filters', title: 'uBlock filters – Badware risks' },
          'ublock-privacy': { content: 'filters', group: 'default', parent: 'uBlock filters', title: 'uBlock filters – Privacy' },
          'easylist': { content: 'filters', group: 'ads', title: 'EasyList', preferred: true },
          'easyprivacy': { content: 'filters', group: 'privacy', title: 'EasyPrivacy', preferred: true },
          'adguard-spyware-url': { content: 'filters', group: 'privacy', title: 'AdGuard/uBO – URL Tracking Protection' },
          'fanboy-social': { content: 'filters', group: 'social', title: 'Fanboy\'s Social' },
          'fanboy-annoyances': { content: 'filters', group: 'annoyances', title: 'Fanboy\'s Annoyances' }
        },
        cache: {},
        cosmeticFilterCount: 43250,
        current: {
          'user-filters': { content: 'filters', group: 'user', title: 'My filters' },
          'ublock-filters': { content: 'filters', group: 'default', title: 'uBlock filters – Ads' },
          'easylist': { content: 'filters', group: 'ads', title: 'EasyList' },
          'easyprivacy': { content: 'filters', group: 'privacy', title: 'EasyPrivacy' }
        },
        ignoreGenericCosmeticFilters: false,
        isUpdating: false,
        netFilterCount: 34892,
        parseCosmeticFilters: true,
        suspendUntilListsAreLoaded: false,
        userFiltersPath: 'user-filters'
      };
      
      // If renderFilterLists exists, call it with mock data
      // First, override messaging.send to return mock
      if (typeof vAPI !== 'undefined' && vAPI.messaging) {
        vAPI.messaging.send = (channel: string, msg: any) => {
          if (channel === 'dashboard' && msg.what === 'getLists') {
            return Promise.resolve(mockData);
          }
          if (channel === 'dashboard' && ['applyFilterListSelection', 'reloadAllFilters', 'updateNow', 'userSettings'].includes(msg.what)) {
            return Promise.resolve({ done: true });
          }
          return Promise.resolve();
        };
      }
      
      // Mock vAPI.defer.create
      if (typeof vAPI !== 'undefined' && vAPI.defer) {
        vAPI.defer = {
          create: (fn: any) => {
            const obj = { off: () => {}, offon: () => {} };
            return obj;
          }
        };
      }
      
      // Mock vAPI.localStorage.getItemAsync
      if (typeof vAPI !== 'undefined' && vAPI.localStorage) {
        vAPI.localStorage = {
          getItemAsync: (key: string) => Promise.resolve(null),
          setItemAsync: () => Promise.resolve()
        };
      }
      
      // Manually trigger the onListsReceived logic to render
      // This mimics what happens when getLists returns
      const listTree: any = {};
      const groupKeys = ['user', 'default', 'ads', 'privacy', 'malware', 'multipurpose', 'cookies', 'social', 'annoyances', 'regions', 'unknown', 'custom'];
      
      for (const key of groupKeys) {
        listTree[key] = { title: key, lists: {} };
      }
      
      for (const [listkey, listDetails] of Object.entries(mockData.available)) {
        let groupkey = (listDetails as any).group || 'default';
        if (!listTree[groupkey]) groupkey = 'unknown';
        const groupDetails = listTree[groupkey];
        if ((listDetails as any).parent) {
          const lists = groupDetails.lists;
          const parent = (listDetails as any).parent;
          if (!lists[parent]) lists[parent] = { title: parent, lists: {} };
          lists[parent].lists[listkey] = listDetails;
        } else {
          (listDetails as any).title = listDetails.title || listkey;
          groupDetails.lists[listkey] = listDetails;
        }
      }
      
      // Remove empty groups
      for (const key of groupKeys) {
        if (Object.keys(listTree[key].lists).length === 0) {
          delete listTree[key];
        }
      }
      
      // Create DOM elements
      const createListEntry = (listDetails: any, depth: number) => {
        const template = document.querySelector('#templates .listEntry[data-role="leaf"]');
        if (!template) return null;
        return template.cloneNode(true);
      };
      
      // Build HTML for list entries
      const listEntriesContainer = document.querySelector('#lists .listEntries');
      if (listEntriesContainer) {
        let html = '';
        
        for (const [groupKey, groupData] of Object.entries(listTree)) {
          const group = groupData as any;
          html += `<div class="listEntry expandable" data-key="${groupKey}" data-parent="root" data-role="node">`;
          html += `<span class="detailbar"><label><span class="fa-icon listExpander">angle-up</span><span class="listname">${group.title}</span></label><span class="nodestats">0/${Object.keys(group.lists).length}</span></span>`;
          html += `<div class="listEntries">`;
          
          for (const [listKey, listData] of Object.entries(group.lists)) {
            const list = listData as any;
            const isChecked = mockData.current[listKey] ? 'checked' : '';
            html += `<div class="listEntry ${isChecked}" data-key="${listKey}" data-parent="${groupKey}" data-role="leaf">`;
            html += `<span class="detailbar"><label><span class="input checkbox"><input type="checkbox" ${isChecked ? 'checked' : ''}></span><span class="listname">${list.title || listKey}</span></label>`;
            html += `<span class="iconbar"><span class="fa-icon status cache" title="Cached"></span></span>`;
            html += `<span class="leafstats"></span></span></div>`;
          }
          
          html += `</div></div>`;
        }
        
        listEntriesContainer.innerHTML = html;
      }
      
      // Update stats text
      const statsElem = document.getElementById('listsOfBlockedHostsPrompt');
      if (statsElem) {
        statsElem.textContent = `${mockData.netFilterCount.toLocaleString()} network filters • ${mockData.cosmeticFilterCount.toLocaleString()} cosmetic filters`;
      }
    });
  }

  async getListsContainer(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.listsContainer);
  }

  async getButtonApply(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.buttonApply);
  }

  async getButtonUpdate(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.buttonUpdate);
  }

  async getSearchField(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.searchField);
  }

  async getListEntries(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.listEntry);
  }

  async getLeafEntries(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.listEntryLeaf);
  }

  async getNodeEntries(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.listEntryNode);
  }

  async getGroupHeader(groupKey: string): Promise<Locator> {
    return this.page.locator(`.listEntry[data-key="${groupKey}"]`);
  }

  async getFilterListByKey(listKey: string): Promise<Locator> {
    return this.page.locator(`.listEntry[data-key="${listKey}"]`);
  }

  async getCheckboxForList(listKey: string): Promise<Locator> {
    return this.page.locator(`.listEntry[data-key="${listKey}"] ${FILTER_LIST_SELECTORS.checkbox}`).first();
  }

  async isListChecked(listKey: string): Promise<boolean> {
    const entry = await this.getFilterListByKey(listKey);
    return await entry.evaluate(el => el.classList.contains('checked'));
  }

  async isCheckboxChecked(listKey: string): Promise<boolean> {
    const checkbox = await this.getCheckboxForList(listKey);
    return await checkbox.isChecked();
  }

  async toggleFilterList(listKey: string): Promise<void> {
    const checkbox = await this.getCheckboxForList(listKey);
    await checkbox.click();
  }

  async clickApplyButton(): Promise<void> {
    const button = await this.getButtonApply();
    await button.click();
  }

  async clickUpdateButton(): Promise<void> {
    const button = await this.getButtonUpdate();
    await button.click();
  }

  async isApplyButtonEnabled(): Promise<boolean> {
    const button = await this.getButtonApply();
    const isDisabled = await button.isDisabled();
    return !isDisabled;
  }

  async isUpdateButtonEnabled(): Promise<boolean> {
    const button = await this.getButtonUpdate();
    const isDisabled = await button.isDisabled();
    return !isDisabled;
  }

  async searchLists(query: string): Promise<void> {
    const searchField = await this.getSearchField();
    await searchField.fill(query);
    await searchField.dispatchEvent('input');
  }

  async clearSearch(): Promise<void> {
    const searchField = await this.getSearchField();
    await searchField.fill('');
    await searchField.dispatchEvent('input');
  }

  async getListStats(): Promise<string | null> {
    const prompt = this.page.locator(FILTER_LIST_SELECTORS.listsOfBlockedHostsPrompt);
    return await prompt.textContent();
  }

  async isGroupExpanded(groupKey: string): Promise<boolean> {
    const group = await this.getGroupHeader(groupKey);
    return await group.evaluate(el => el.classList.contains('expanded'));
  }

  async expandGroup(groupKey: string): Promise<void> {
    const group = await this.getGroupHeader(groupKey);
    const expander = group.locator(FILTER_LIST_SELECTORS.listExpander);
    await expander.click();
  }

  async collapseGroup(groupKey: string): Promise<void> {
    const group = await this.getGroupHeader(groupKey);
    if (await group.evaluate(el => el.classList.contains('expanded'))) {
      const expander = group.locator(FILTER_LIST_SELECTORS.listExpander);
      await expander.click();
    }
  }

  async getImportTextarea(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.importTextarea);
  }

  async importCustomList(url: string): Promise<void> {
    const textarea = await this.getImportTextarea();
    await textarea.fill(url);
    await this.expandImportSection();
  }

  async expandImportSection(): Promise<void> {
    const importEntry = this.page.locator(FILTER_LIST_SELECTORS.listEntryImport);
    const expander = importEntry.locator(FILTER_LIST_SELECTORS.listExpander);
    await expander.click();
  }

  async getStatusIcon(listKey: string, statusType: 'unsecure' | 'obsolete' | 'cache' | 'updating' | 'failed'): Promise<Locator> {
    const entry = await this.getFilterListByKey(listKey);
    return entry.locator(`.status.${statusType}`);
  }

  async isStatusIconVisible(listKey: string, statusType: 'unsecure' | 'obsolete' | 'cache' | 'updating' | 'failed'): Promise<boolean> {
    const icon = await this.getStatusIcon(listKey, statusType);
    return await icon.isVisible();
  }

  async getLeafStats(listKey: string): Promise<string | null> {
    const entry = await this.getFilterListByKey(listKey);
    const stats = entry.locator(FILTER_LIST_SELECTORS.leafstats);
    return await stats.textContent();
  }

  async getGroupStats(groupKey: string): Promise<string | null> {
    const group = await this.getGroupHeader(groupKey);
    const stats = group.locator(FILTER_LIST_SELECTORS.nodestats);
    return await stats.textContent();
  }

  async getEnabledListsCount(): Promise<number> {
    const checkedEntries = this.page.locator(`${FILTER_LIST_SELECTORS.listEntryLeaf}.checked`);
    return await checkedEntries.count();
  }

  async getTotalListsCount(): Promise<number> {
    const allLeafEntries = this.page.locator(FILTER_LIST_SELECTORS.listEntryLeaf);
    return await allLeafEntries.count();
  }

  async markListForRemoval(listKey: string): Promise<void> {
    const entry = await this.getFilterListByKey(listKey);
    const removeIcon = entry.locator(FILTER_LIST_SELECTORS.removeIcon);
    await removeIcon.click();
  }

  async purgeListCache(listKey: string): Promise<void> {
    const entry = await this.getFilterListByKey(listKey);
    const cacheIcon = entry.locator(FILTER_LIST_SELECTORS.statusCache);
    await cacheIcon.click();
  }

  async getAutoUpdateSetting(): Promise<boolean> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.autoUpdate);
    return await checkbox.isChecked();
  }

  async setAutoUpdateSetting(enabled: boolean): Promise<void> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.autoUpdate);
    await checkbox.setChecked(enabled);
  }

  async getParseCosmeticFiltersSetting(): Promise<boolean> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.parseCosmeticFilters);
    return await checkbox.isChecked();
  }

  async setParseCosmeticFiltersSetting(enabled: boolean): Promise<void> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.parseCosmeticFilters);
    await checkbox.setChecked(enabled);
  }

  async getIgnoreGenericCosmeticFiltersSetting(): Promise<boolean> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.ignoreGenericCosmeticFilters);
    return await checkbox.isChecked();
  }

  async setIgnoreGenericCosmeticFiltersSetting(enabled: boolean): Promise<void> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.ignoreGenericCosmeticFilters);
    await checkbox.setChecked(enabled);
  }

  async getSuspendUntilListsAreLoadedSetting(): Promise<boolean> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.suspendUntilListsAreLoaded);
    return await checkbox.isChecked();
  }

  async setSuspendUntilListsAreLoadedSetting(enabled: boolean): Promise<void> {
    const checkbox = this.page.locator(FILTER_LIST_SELECTORS.suspendUntilListsAreLoaded);
    await checkbox.setChecked(enabled);
  }

  async isBodyUpdating(): Promise<boolean> {
    return await this.page.evaluate(() => document.body.classList.contains('updating'));
  }

  async isBodyWorking(): Promise<boolean> {
    return await this.page.evaluate(() => document.body.classList.contains('working'));
  }

  async hasUnsavedData(): Promise<boolean> {
    return await this.page.evaluate(() => {
      return typeof window.hasUnsavedData === 'function' && window.hasUnsavedData();
    });
  }

  async getExpandedGroupsFromStorage(): Promise<string[] | null> {
    return await this.page.evaluate(async () => {
      return await vAPI?.localStorage?.getItem('expandedListSet');
    });
  }

  async waitForFilterListsLoaded(timeout: number = 5000): Promise<void> {
    await this.page.waitForSelector(FILTER_LIST_SELECTORS.listEntryLeaf, { 
      timeout,
      state: 'attached'
    });
  }

  async waitForUpdateComplete(timeout: number = 30000): Promise<void> {
    await this.page.waitForFunction(() => {
      return !document.body.classList.contains('updating') && 
             !document.body.classList.contains('working');
    }, { timeout });
  }

  async getListsOfBlockedHostsText(): Promise<string> {
    const prompt = this.page.locator(FILTER_LIST_SELECTORS.listsOfBlockedHostsPrompt);
    return await prompt.textContent() || '';
  }

  async getGroupNames(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const groups = document.querySelectorAll('.listEntry[data-parent="root"]');
      return Array.from(groups).map(g => {
        const nameEl = g.querySelector('.listname');
        return nameEl ? nameEl.textContent?.trim() : '';
      }).filter(n => n);
    });
  }

  async getAllListKeys(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const entries = document.querySelectorAll('.listEntry[data-key]');
      return Array.from(entries).map(e => e.getAttribute('data-key')).filter(k => k) as string[];
    });
  }

  async expandAllGroups(): Promise<void> {
    const rootstats = this.page.locator(FILTER_LIST_SELECTORS.rootstats);
    await rootstats.click();
  }

  async getCloudWidget(): Promise<Locator> {
    return this.page.locator(FILTER_LIST_SELECTORS.cloudWidget);
  }

  async isCloudWidgetVisible(): Promise<boolean> {
    const widget = await this.getCloudWidget();
    const classList = await widget.evaluate(el => el.className);
    return !classList.includes('hide');
  }
}

export default FilterListsTestHelper;