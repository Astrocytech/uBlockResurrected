# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firewall_tests/dashboard-3p-filters-extension.spec.ts >> Dashboard 3p-filters Pane >> 3p-filters shows apply and update buttons
- Location: tests/firewall_tests/dashboard-3p-filters-extension.spec.ts:76:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#iframe').contentFrame().locator('body')
Timeout: 60000ms
Expected pattern: /parse cosmetic/i
Received string:  "·····
    Apply changes
    Update now········
        Auto-update filter lists··········
        Suspend network activity until all filter lists are loaded··········
        Parse and enforce cosmetic filters···········
        Ignore generic cosmetic filters·················
        0 network filters ＋ 0 cosmetic filters from:························
            User
            1/1·······················
            My filters···········································································
            Built-in
            5/6·······················
            uBlock filters
            5/5·······································
            0 used out of 0·······················
            uBlock filters – Ads···········································································
            uBlock filters – Badware risks···········································································
            uBlock filters – Privacy···········································································
            uBlock filters – Quick fixes···········································································
            uBlock filters – Unbreak···········································································
            uBlock filters – Experimental···········································································
            Ads
            1/3·······················
            EasyList···········································································
            AdGuard – Ads···········································································
            AdGuard – Mobile Ads···········································································
            Privacy
            1/3·······················
            EasyPrivacy···········································································
            AdGuard/uBO – URL Tracking Protection···········································································
            Block Outsider Intrusion into LAN···········································································
            Malware protection, security
            1/2·······················
            Online Malicious URL Blocklist···········································································
            Phishing URL Blocklist···········································································
            Multipurpose
            1/2·······················
            Peter Lowe’s Ad and tracking server list···········································································
            Dan Pollock’s hosts file···········································································
            Cookie notices
            0/4·······················
            EasyList/uBO – Cookie Notices
            0/2·······································
            0 used out of 0·······················
            EasyList – Cookie Notices···········································································
            uBlock filters – Cookie Notices···········································································
            AdGuard/uBO – Cookie Notices
            0/2·······································
            0 used out of 0·······················
            AdGuard – Cookie Notices···········································································
            uBlock filters – Cookie Notices···········································································
            Social widgets
            0/3·······················
            EasyList – Social Widgets···········································································
            AdGuard – Social Widgets···········································································
            Fanboy – Anti-Facebook···········································································
            Annoyances
            0/10·······················
            EasyList – Annoyances
            0/5·······································
            0 used out of 0·······················
            EasyList – AI Widgets···········································································
            EasyList – Chat Widgets···········································································
            EasyList – Newsletter Notices···········································································
            EasyList – Notifications···········································································
            EasyList – Other Annoyances···········································································
            AdGuard – Annoyances
            0/4·······································
            0 used out of 0·······················
            AdGuard – Mobile App Banners···········································································
            AdGuard – Other Annoyances···········································································
            AdGuard – Popup Overlays···········································································
            AdGuard – Widgets···········································································
            uBlock filters – Annoyances···········································································
            Regions, languages
            0/38·······················
             al  xk: Adblock List for Albania···········································································
             bg: Bulgarian Adblock list···········································································
             cn  tw: AdGuard Chinese (中文)···········································································
             cz  sk: EasyList Czech and Slovak···········································································
             de  ch  at: EasyList Germany···········································································
             ee: Eesti saitidele kohandatud filter···········································································
             eg  sa  ma  dz: Liste AR···········································································
             es  ar  br  pt: AdGuard Spanish/Portuguese···········································································
             es  ar  mx  co: EasyList Spanish···········································································
             fi: Adblock List for Finland···········································································
             fr  ca: AdGuard Français···········································································
             gr  cy: Greek AdBlock Filter···········································································
             hr  rs: Dandelion Sprout's Serbo-Croatian filters···········································································
             hu: hufilter···········································································
             id  my: ABPindo···········································································
             il: EasyList Hebrew···········································································
             in  lk  np: IndianList···········································································
             ir: PersianBlocker···········································································
             is: Icelandic ABP List···········································································
             it: EasyList Italy···········································································
             jp: AdGuard Japanese···········································································
             kr: List-KR Classic···········································································
             lt: EasyList Lithuania···········································································
             lv: Latvian List···········································································
             mk: Macedonian adBlock Filters···········································································
             nl  be: AdGuard Dutch···········································································
             no  dk  is: Dandelion Sprouts nordiske filtre···········································································
             pl: Oficjalne Polskie Filtry
            0/2·······································
            0 used out of 0·······················
             pl: CERT.PL's Warning List···········································································
             pl: Oficjalne Polskie Filtry do uBlocka Origin···········································································
             ro  md: Romanian Ad (ROad) Block List Light···········································································
             ru  ua  uz  kz: RU AdList
            0/2·······································
            0 used out of 0·······················
             ru  ua  uz  kz: RU AdList···········································································
             ru  ua  uz  kz: RU AdList: Counters···········································································
             se: Frellwit's Swedish Filter···········································································
             si: Slovenian List···········································································
             th: EasyList Thailand···········································································
             tr: AdGuard Turkish···········································································
             ua: AdGuard Ukrainian···········································································
             vn: ABPVN List················································································
            Import…····························································································································································································································································································································
"

Call log:
  - Expect "toContainText" with timeout 60000ms
  - waiting for locator('#iframe').contentFrame().locator('body')
    62 × locator resolved to <body dir="ltr">…</body>
       - unexpected value "





    Apply changes
    Update now



    
        Auto-update filter lists
    
    
        Suspend network activity until all filter lists are loaded
    
    
        Parse and enforce cosmetic filters 
    
    
        Ignore generic cosmetic filters 
    






    
        0 network filters ＋ 0 cosmetic filters from:
    
    
    
        
            User
            1/1
        
    
        
            My filters
            
            
            
            
        
    
        
            Built-in
            5/6
        
    
        
            uBlock filters
            5/5
            
            
            
            0 used out of 0
        
    
        
            uBlock filters – Ads
            
            
            
            
        
    
        
            uBlock filters – Badware risks
            
            
            
            
        
    
        
            uBlock filters – Privacy
            
            
            
            
        
    
        
            uBlock filters – Quick fixes
            
            
            
            
        
    
        
            uBlock filters – Unbreak
            
            
            
            
        
    
        
            uBlock filters – Experimental
            
            
            
            
        
    
        
            Ads
            1/3
        
    
        
            EasyList
            
            
            
            
        
    
        
            AdGuard – Ads
            
            
            
            
        
    
        
            AdGuard – Mobile Ads
            
            
            
            
        
    
        
            Privacy
            1/3
        
    
        
            EasyPrivacy
            
            
            
            
        
    
        
            AdGuard/uBO – URL Tracking Protection
            
            
            
            
        
    
        
            Block Outsider Intrusion into LAN
            
            
            
            
        
    
        
            Malware protection, security
            1/2
        
    
        
            Online Malicious URL Blocklist
            
            
            
            
        
    
        
            Phishing URL Blocklist
            
            
            
            
        
    
        
            Multipurpose
            1/2
        
    
        
            Peter Lowe’s Ad and tracking server list
            
            
            
            
        
    
        
            Dan Pollock’s hosts file
            
            
            
            
        
    
        
            Cookie notices
            0/4
        
    
        
            EasyList/uBO – Cookie Notices
            0/2
            
            
            
            0 used out of 0
        
    
        
            EasyList – Cookie Notices
            
            
            
            
        
    
        
            uBlock filters – Cookie Notices
            
            
            
            
        
    
        
            AdGuard/uBO – Cookie Notices
            0/2
            
            
            
            0 used out of 0
        
    
        
            AdGuard – Cookie Notices
            
            
            
            
        
    
        
            uBlock filters – Cookie Notices
            
            
            
            
        
    
        
            Social widgets
            0/3
        
    
        
            EasyList – Social Widgets
            
            
            
            
        
    
        
            AdGuard – Social Widgets
            
            
            
            
        
    
        
            Fanboy – Anti-Facebook
            
            
            
            
        
    
        
            Annoyances
            0/10
        
    
        
            EasyList – Annoyances
            0/5
            
            
            
            0 used out of 0
        
    
        
            EasyList – AI Widgets
            
            
            
            
        
    
        
            EasyList – Chat Widgets
            
            
            
            
        
    
        
            EasyList – Newsletter Notices
            
            
            
            
        
    
        
            EasyList – Notifications
            
            
            
            
        
    
        
            EasyList – Other Annoyances
            
            
            
            
        
    
        
            AdGuard – Annoyances
            0/4
            
            
            
            0 used out of 0
        
    
        
            AdGuard – Mobile App Banners
            
            
            
            
        
    
        
            AdGuard – Other Annoyances
            
            
            
            
        
    
        
            AdGuard – Popup Overlays
            
            
            
            
        
    
        
            AdGuard – Widgets
            
            
            
            
        
    
        
            uBlock filters – Annoyances
            
            
            
            
        
    
        
            Regions, languages
            0/38
        
    
        
             al  xk: Adblock List for Albania
            
            
            
            
        
    
        
             bg: Bulgarian Adblock list
            
            
            
            
        
    
        
             cn  tw: AdGuard Chinese (中文)
            
            
            
            
        
    
        
             cz  sk: EasyList Czech and Slovak
            
            
            
            
        
    
        
             de  ch  at: EasyList Germany
            
            
            
            
        
    
        
             ee: Eesti saitidele kohandatud filter
            
            
            
            
        
    
        
             eg  sa  ma  dz: Liste AR
            
            
            
            
        
    
        
             es  ar  br  pt: AdGuard Spanish/Portuguese
            
            
            
            
        
    
        
             es  ar  mx  co: EasyList Spanish
            
            
            
            
        
    
        
             fi: Adblock List for Finland
            
            
            
            
        
    
        
             fr  ca: AdGuard Français
            
            
            
            
        
    
        
             gr  cy: Greek AdBlock Filter
            
            
            
            
        
    
        
             hr  rs: Dandelion Sprout's Serbo-Croatian filters
            
            
            
            
        
    
        
             hu: hufilter
            
            
            
            
        
    
        
             id  my: ABPindo
            
            
            
            
        
    
        
             il: EasyList Hebrew
            
            
            
            
        
    
        
             in  lk  np: IndianList
            
            
            
            
        
    
        
             ir: PersianBlocker
            
            
            
            
        
    
        
             is: Icelandic ABP List
            
            
            
            
        
    
        
             it: EasyList Italy
            
            
            
            
        
    
        
             jp: AdGuard Japanese
            
            
            
            
        
    
        
             kr: List-KR Classic
            
            
            
            
        
    
        
             lt: EasyList Lithuania
            
            
            
            
        
    
        
             lv: Latvian List
            
            
            
            
        
    
        
             mk: Macedonian adBlock Filters
            
            
            
            
        
    
        
             nl  be: AdGuard Dutch
            
            
            
            
        
    
        
             no  dk  is: Dandelion Sprouts nordiske filtre
            
            
            
            
        
    
        
             pl: Oficjalne Polskie Filtry
            0/2
            
            
            
            0 used out of 0
        
    
        
             pl: CERT.PL's Warning List
            
            
            
            
        
    
        
             pl: Oficjalne Polskie Filtry do uBlocka Origin
            
            
            
            
        
    
        
             ro  md: Romanian Ad (ROad) Block List Light
            
            
            
            
        
    
        
             ru  ua  uz  kz: RU AdList
            0/2
            
            
            
            0 used out of 0
        
    
        
             ru  ua  uz  kz: RU AdList
            
            
            
            
        
    
        
             ru  ua  uz  kz: RU AdList: Counters
            
            
            
            
        
    
        
             se: Frellwit's Swedish Filter
            
            
            
            
        
    
        
             si: Slovenian List
            
            
            
            
        
    
        
             th: EasyList Thailand
            
            
            
            
        
    
        
             tr: AdGuard Turkish
            
            
            
            
        
    
        
             ua: AdGuard Ukrainian
            
            
            
            
        
    
        
             vn: ABPVN List
            
            
            
            
        
    
    
        
            Import…
            
        
        
    





    
    
        
            
            
            
            
            
        
    
    
        
            
            
            
            
            
            
        
    
    
        
            
            
        
    

















"

```

# Test source

```ts
  14  |     if ( serviceWorker === undefined ) {
  15  |         serviceWorker = await context.waitForEvent('serviceworker');
  16  |     }
  17  |     const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(serviceWorker.url());
  18  |     if ( match === null ) {
  19  |         throw new Error(`Unexpected extension service worker URL: ${serviceWorker.url()}`);
  20  |     }
  21  |     return match[1];
  22  | };
  23  | 
  24  | test.describe('Dashboard 3p-filters Pane', () => {
  25  |     test('dashboard shell navigates to 3p-filters and shows lists container', async () => {
  26  |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-3p-filters-'));
  27  | 
  28  |         let context: BrowserContext | undefined;
  29  |         try {
  30  |             context = await chromium.launchPersistentContext(userDataDir, {
  31  |                 channel: 'chromium',
  32  |                 headless: true,
  33  |                 args: [
  34  |                     `--disable-extensions-except=${extensionPath}`,
  35  |                     `--load-extension=${extensionPath}`,
  36  |                     '--no-sandbox',
  37  |                     '--disable-setuid-sandbox',
  38  |                 ],
  39  |             });
  40  | 
  41  |             const extensionId = await getExtensionId(context);
  42  |             const page = await context.newPage();
  43  | 
  44  |             // Navigate to dashboard
  45  |             const dashboardURL = `chrome-extension://${extensionId}/dashboard.html`;
  46  |             await page.goto(dashboardURL, { waitUntil: 'domcontentloaded' });
  47  |             await page.waitForTimeout(1000);
  48  | 
  49  |             // Verify dashboard nav exists
  50  |             await expect(page.locator('#dashboard-nav')).toBeVisible();
  51  | 
  52  |             // Click the Filter Lists tab
  53  |             await page.locator('#dashboard-nav .tabButton[data-pane="3p-filters.html"]').click();
  54  |             await page.waitForTimeout(2000);
  55  | 
  56  |             // Verify the iframe is loaded with 3p-filters
  57  |             await expect(page.locator('#iframe')).toHaveAttribute('src', /3p-filters\.html$/);
  58  | 
  59  |             // Switch to iframe and check key elements
  60  |             const frame = page.frameLocator('#iframe');
  61  |             
  62  |             // The lists container should exist (may be empty but should be present)
  63  |             const listsContainer = frame.locator('#lists');
  64  |             await expect(listsContainer).toBeVisible({ timeout: 10000 });
  65  | 
  66  |             // Button container should exist
  67  |             const actions = frame.locator('#actions');
  68  |             await expect(actions).toBeVisible();
  69  | 
  70  |         } finally {
  71  |             await context?.close();
  72  |             await rm(userDataDir, { recursive: true, force: true });
  73  |         }
  74  |     });
  75  | 
  76  |     test('3p-filters shows apply and update buttons', async () => {
  77  |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-3p-filters-buttons-'));
  78  | 
  79  |         let context: BrowserContext | undefined;
  80  |         try {
  81  |             context = await chromium.launchPersistentContext(userDataDir, {
  82  |                 channel: 'chromium',
  83  |                 headless: true,
  84  |                 args: [
  85  |                     `--disable-extensions-except=${extensionPath}`,
  86  |                     `--load-extension=${extensionPath}`,
  87  |                     '--no-sandbox',
  88  |                     '--disable-setuid-sandbox',
  89  |                 ],
  90  |             });
  91  | 
  92  |             const extensionId = await getExtensionId(context);
  93  |             const page = await context.newPage();
  94  | 
  95  |             const dashboardURL = `chrome-extension://${extensionId}/dashboard.html`;
  96  |             await page.goto(dashboardURL, { waitUntil: 'domcontentloaded' });
  97  |             await page.waitForTimeout(1000);
  98  | 
  99  |             await page.locator('#dashboard-nav .tabButton[data-pane="3p-filters.html"]').click();
  100 |             await page.waitForTimeout(2000);
  101 | 
  102 |             const frame = page.frameLocator('#iframe');
  103 |             
  104 |             // Check Apply button exists
  105 |             await expect(frame.locator('#buttonApply')).toBeVisible();
  106 |             await expect(frame.locator('#buttonApply')).toContainText(/apply/i);
  107 |             
  108 |             // Check Update button exists  
  109 |             await expect(frame.locator('#buttonUpdate')).toBeVisible();
  110 |             await expect(frame.locator('#buttonUpdate')).toContainText(/update/i);
  111 | 
  112 |             await expect(frame.locator('label[for="autoUpdate"], #autoUpdate')).toBeVisible();
  113 |             await expect(frame.locator('body')).toContainText(/auto-update|auto update/i);
> 114 |             await expect(frame.locator('body')).toContainText(/parse cosmetic/i);
      |                                                 ^ Error: expect(locator).toContainText(expected) failed
  115 |             await expect(frame.locator('body')).toContainText(/ignore generic/i);
  116 | 
  117 |         } finally {
  118 |             await context?.close();
  119 |             await rm(userDataDir, { recursive: true, force: true });
  120 |         }
  121 |     });
  122 | });
  123 | 
```