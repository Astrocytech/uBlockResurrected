# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firewall_tests/popup-firewall-extension.spec.ts >> Popup Firewall Extension >> popup shows destination-host rows after third-party requests are observed on the page
- Location: tests/firewall_tests/popup-firewall-extension.spec.ts:1158:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 1

  Array [
-   "127.0.0.1",
-   "127.0.0.2",
+   "localhost",
  ]

Call Log:
- Test timeout of 60000ms exceeded
```

# Test source

```ts
  1077 |         test.setTimeout(60000);
  1078 |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-subdomain-scope-'));
  1079 |         const servers = await startTestServers();
  1080 | 
  1081 |         let context: BrowserContext | undefined;
  1082 |         try {
  1083 |             context = await launchExtensionContext(userDataDir);
  1084 |             const serviceWorker = await getServiceWorker(context);
  1085 |             const extensionId = await getExtensionId(context);
  1086 |             const appPort = new URL(servers.blankURL).port;
  1087 |             const fooBlankURL = `http://foo.localhost:${appPort}/blank`;
  1088 |             const fooResourceURL = (uid: string) => `http://foo.localhost:${appPort}/resource-page-host2?uid=${uid}`;
  1089 |             const barResourceURL = (uid: string) => `http://bar.localhost:${appPort}/resource-page-host2?uid=${uid}`;
  1090 | 
  1091 |             const page = await context.newPage();
  1092 |             await page.goto(fooBlankURL, { waitUntil: 'domcontentloaded' });
  1093 |             const tabId = await getTabIdForURL(serviceWorker, fooBlankURL);
  1094 |             const popupPage = await openPopupForTab(context, extensionId, tabId);
  1095 | 
  1096 |             await setFirewallCellAction(popupPage, '3p', '/', 'block');
  1097 |             await setFirewallCellAction(popupPage, '3p', '.', 'allow');
  1098 |             await saveFirewallRules(popupPage);
  1099 | 
  1100 |             await context.close();
  1101 |             context = undefined;
  1102 | 
  1103 |             context = await launchExtensionContext(userDataDir);
  1104 | 
  1105 |             const fooUid = `subscope-foo-${Date.now()}`;
  1106 |             const fooPage = await context.newPage();
  1107 |             await fooPage.goto(fooResourceURL(fooUid), { waitUntil: 'domcontentloaded' });
  1108 |             await fooPage.waitForTimeout(1000);
  1109 |             await expect.poll(() => servers.getHits(fooUid)).toEqual({ image: 1, script: 1, frame: 0 });
  1110 | 
  1111 |             const barUid = `subscope-bar-${Date.now()}`;
  1112 |             const barPage = await context.newPage();
  1113 |             await barPage.goto(barResourceURL(barUid), { waitUntil: 'domcontentloaded' });
  1114 |             await barPage.waitForTimeout(1000);
  1115 |             await expect.poll(() => servers.getHits(barUid)).toEqual({ image: 0, script: 0, frame: 0 });
  1116 |         } finally {
  1117 |             await context?.close();
  1118 |             await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
  1119 |             await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
  1120 |             await rm(userDataDir, { recursive: true, force: true });
  1121 |         }
  1122 |     });
  1123 | 
  1124 |     test('revert discards unsaved firewall changes and restores the persisted matrix', async () => {
  1125 |         test.setTimeout(60000);
  1126 |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-revert-'));
  1127 |         const servers = await startTestServers();
  1128 | 
  1129 |         let context: BrowserContext | undefined;
  1130 |         try {
  1131 |             context = await launchExtensionContext(userDataDir);
  1132 |             const serviceWorker = await getServiceWorker(context);
  1133 |             const extensionId = await getExtensionId(context);
  1134 | 
  1135 |             const page = await context.newPage();
  1136 |             await page.goto(servers.blankURL, { waitUntil: 'domcontentloaded' });
  1137 |             const tabId = await getTabIdForURL(serviceWorker, servers.blankURL);
  1138 |             const popupPage = await openPopupForTab(context, extensionId, tabId);
  1139 | 
  1140 |             await setFirewallCellAction(popupPage, '3p', '/', 'block');
  1141 |             await saveFirewallRules(popupPage);
  1142 | 
  1143 |             await setFirewallCellAction(popupPage, 'image', '/', 'block');
  1144 |             await expect(firewallCell(popupPage, 'image', '/')).toHaveClass(/blockRule/);
  1145 | 
  1146 |             await revertFirewallRules(popupPage);
  1147 | 
  1148 |             await expect(firewallCell(popupPage, '3p', '/')).toHaveClass(/blockRule/);
  1149 |             await expect(firewallCell(popupPage, 'image', '/')).not.toHaveClass(/blockRule/);
  1150 |         } finally {
  1151 |             await context?.close();
  1152 |             await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
  1153 |             await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
  1154 |             await rm(userDataDir, { recursive: true, force: true });
  1155 |         }
  1156 |     });
  1157 | 
  1158 |     test('popup shows destination-host rows after third-party requests are observed on the page', async () => {
  1159 |         test.setTimeout(60000);
  1160 |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-hostrows-'));
  1161 |         const servers = await startTestServers();
  1162 | 
  1163 |         let context: BrowserContext | undefined;
  1164 |         try {
  1165 |             context = await launchExtensionContext(userDataDir);
  1166 |             const serviceWorker = await getServiceWorker(context);
  1167 |             const extensionId = await getExtensionId(context);
  1168 | 
  1169 |             const resourcePage = await context.newPage();
  1170 |             const uid = `hostrows-${Date.now()}`;
  1171 |             await resourcePage.goto(servers.multiHostResourcePageURL(uid), { waitUntil: 'domcontentloaded' });
  1172 |             await expect.poll(() => servers.getHits(`${uid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });
  1173 | 
  1174 |             const tabId = await getTabIdForURL(serviceWorker, servers.multiHostResourcePageURL(uid));
  1175 |             const popupPage = await openPopupForTab(context, extensionId, tabId);
  1176 | 
> 1177 |             await expect.poll(async () => {
       |             ^ Error: expect(received).toEqual(expected) // deep equality
  1178 |                 return popupPage.evaluate(() =>
  1179 |                     Array.from(document.querySelectorAll('#firewall > div[data-des]'))
  1180 |                         .map(node => node.getAttribute('data-des'))
  1181 |                         .filter((value): value is string => value !== null && value !== '*')
  1182 |                         .sort()
  1183 |                 );
  1184 |             }).toEqual([ '127.0.0.1', '127.0.0.2' ]);
  1185 |         } finally {
  1186 |             await context?.close();
  1187 |             await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
  1188 |             await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
  1189 |             await rm(userDataDir, { recursive: true, force: true });
  1190 |         }
  1191 |     });
  1192 | 
  1193 |     test('host-specific block rule blocks only the targeted destination host', async () => {
  1194 |         test.setTimeout(60000);
  1195 |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-hostblock-'));
  1196 |         const servers = await startTestServers();
  1197 | 
  1198 |         let context: BrowserContext | undefined;
  1199 |         try {
  1200 |             context = await launchExtensionContext(userDataDir);
  1201 |             const serviceWorker = await getServiceWorker(context);
  1202 |             const extensionId = await getExtensionId(context);
  1203 | 
  1204 |             const resourcePage = await context.newPage();
  1205 |             const setupUid = `hostblock-setup-${Date.now()}`;
  1206 |             await resourcePage.goto(servers.multiHostResourcePageURL(setupUid), { waitUntil: 'domcontentloaded' });
  1207 |             await expect.poll(() => servers.getHits(`${setupUid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });
  1208 | 
  1209 |             const tabId = await getTabIdForURL(serviceWorker, servers.multiHostResourcePageURL(setupUid));
  1210 |             const popupPage = await openPopupForTab(context, extensionId, tabId);
  1211 | 
  1212 |             await expect.poll(async () => {
  1213 |                 return popupPage.evaluate(() =>
  1214 |                     Array.from(document.querySelectorAll('#firewall > div[data-des]'))
  1215 |                         .some(node => node.getAttribute('data-des') === '127.0.0.1')
  1216 |                 );
  1217 |             }).toBe(true);
  1218 |             await setFirewallHostCellAction(popupPage, '127.0.0.1', '*', '/', 'block');
  1219 |             await saveFirewallRules(popupPage);
  1220 | 
  1221 |             await expect.poll(async () => {
  1222 |                 return getStoredDynamicFilteringString(serviceWorker);
  1223 |             }).toContain('* 127.0.0.1 * block');
  1224 | 
  1225 |             await context.close();
  1226 |             context = undefined;
  1227 | 
  1228 |             context = await launchExtensionContext(userDataDir);
  1229 | 
  1230 |             const uid = `hostblock-${Date.now()}`;
  1231 |             const verifyPage = await context.newPage();
  1232 |             await verifyPage.goto(servers.multiHostResourcePageURL(uid), { waitUntil: 'domcontentloaded' });
  1233 |             await verifyPage.waitForTimeout(1000);
  1234 | 
  1235 |             await expect.poll(() => servers.getHits(`${uid}-host1`)).toEqual({ image: 0, script: 0, frame: 0 });
  1236 |             await expect.poll(() => servers.getHits(`${uid}-host2`)).toEqual({ image: 1, script: 1, frame: 0 });
  1237 |             await expect.poll(async () => {
  1238 |                 return verifyPage.evaluate(() => ({
  1239 |                     host1Width: (document.getElementById('host1-image') as HTMLImageElement | null)?.naturalWidth || 0,
  1240 |                     host2Width: (document.getElementById('host2-image') as HTMLImageElement | null)?.naturalWidth || 0,
  1241 |                     scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
  1242 |                 }));
  1243 |             }).toEqual({ host1Width: 0, host2Width: 1, scriptLoaded: true });
  1244 |         } finally {
  1245 |             await context?.close();
  1246 |             await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
  1247 |             await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
  1248 |             await rm(userDataDir, { recursive: true, force: true });
  1249 |         }
  1250 |     });
  1251 | 
  1252 |     test('host-specific allow overrides a broader global 3p block only for the targeted destination host', async () => {
  1253 |         test.setTimeout(60000);
  1254 |         const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ubr-firewall-hostallow-'));
  1255 |         const servers = await startTestServers();
  1256 | 
  1257 |         let context: BrowserContext | undefined;
  1258 |         try {
  1259 |             context = await launchExtensionContext(userDataDir);
  1260 |             const serviceWorker = await getServiceWorker(context);
  1261 |             const extensionId = await getExtensionId(context);
  1262 | 
  1263 |             const resourcePage = await context.newPage();
  1264 |             const setupUid = `hostallow-setup-${Date.now()}`;
  1265 |             await resourcePage.goto(servers.multiHostResourcePageURL(setupUid), { waitUntil: 'domcontentloaded' });
  1266 |             await expect.poll(() => servers.getHits(`${setupUid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });
  1267 | 
  1268 |             const tabId = await getTabIdForURL(serviceWorker, servers.multiHostResourcePageURL(setupUid));
  1269 |             const popupPage = await openPopupForTab(context, extensionId, tabId);
  1270 | 
  1271 |             await expect.poll(async () => {
  1272 |                 return popupPage.evaluate(() =>
  1273 |                     Array.from(document.querySelectorAll('#firewall > div[data-des]'))
  1274 |                         .some(node => node.getAttribute('data-des') === '127.0.0.1')
  1275 |                 );
  1276 |             }).toBe(true);
  1277 |             await setFirewallCellAction(popupPage, '3p', '/', 'block');
```