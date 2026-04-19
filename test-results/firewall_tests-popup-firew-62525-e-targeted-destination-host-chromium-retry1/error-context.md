# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firewall_tests/popup-firewall-extension.spec.ts >> Popup Firewall Extension >> host-specific allow overrides a broader global 3p block only for the targeted destination host
- Location: tests/firewall_tests/popup-firewall-extension.spec.ts:1252:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Test timeout of 60000ms exceeded
```

# Test source

```ts
  1171 |             await resourcePage.goto(servers.multiHostResourcePageURL(uid), { waitUntil: 'domcontentloaded' });
  1172 |             await expect.poll(() => servers.getHits(`${uid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });
  1173 | 
  1174 |             const tabId = await getTabIdForURL(serviceWorker, servers.multiHostResourcePageURL(uid));
  1175 |             const popupPage = await openPopupForTab(context, extensionId, tabId);
  1176 | 
  1177 |             await expect.poll(async () => {
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
> 1271 |             await expect.poll(async () => {
       |             ^ Error: expect(received).toBe(expected) // Object.is equality
  1272 |                 return popupPage.evaluate(() =>
  1273 |                     Array.from(document.querySelectorAll('#firewall > div[data-des]'))
  1274 |                         .some(node => node.getAttribute('data-des') === '127.0.0.1')
  1275 |                 );
  1276 |             }).toBe(true);
  1277 |             await setFirewallCellAction(popupPage, '3p', '/', 'block');
  1278 |             await setFirewallHostCellAction(popupPage, '127.0.0.1', '*', '/', 'allow');
  1279 |             await saveFirewallRules(popupPage);
  1280 | 
  1281 |             await expect.poll(async () => {
  1282 |                 return getStoredDynamicFilteringString(serviceWorker);
  1283 |             }).toContain('* * 3p block');
  1284 |             await expect.poll(async () => {
  1285 |                 return getStoredDynamicFilteringString(serviceWorker);
  1286 |             }).toContain('* 127.0.0.1 * allow');
  1287 | 
  1288 |             await context.close();
  1289 |             context = undefined;
  1290 | 
  1291 |             context = await launchExtensionContext(userDataDir);
  1292 | 
  1293 |             const uid = `hostallow-${Date.now()}`;
  1294 |             const verifyPage = await context.newPage();
  1295 |             await verifyPage.goto(servers.multiHostResourcePageURL(uid), { waitUntil: 'domcontentloaded' });
  1296 |             await verifyPage.waitForTimeout(1000);
  1297 | 
  1298 |             await expect.poll(() => servers.getHits(`${uid}-host1`)).toEqual({ image: 1, script: 1, frame: 0 });
  1299 |             await expect.poll(() => servers.getHits(`${uid}-host2`)).toEqual({ image: 0, script: 0, frame: 0 });
  1300 |             await expect.poll(async () => {
  1301 |                 return verifyPage.evaluate(() => ({
  1302 |                     host1Width: (document.getElementById('host1-image') as HTMLImageElement | null)?.naturalWidth || 0,
  1303 |                     host2Width: (document.getElementById('host2-image') as HTMLImageElement | null)?.naturalWidth || 0,
  1304 |                     scriptLoaded: Boolean((window as Window & { __thirdPartyScriptLoaded?: number }).__thirdPartyScriptLoaded),
  1305 |                 }));
  1306 |             }).toEqual({ host1Width: 1, host2Width: 0, scriptLoaded: true });
  1307 |         } finally {
  1308 |             await context?.close();
  1309 |             await new Promise<void>(resolve => servers.appServer.close(() => resolve()));
  1310 |             await new Promise<void>(resolve => servers.resourceServer.close(() => resolve()));
  1311 |             await rm(userDataDir, { recursive: true, force: true });
  1312 |         }
  1313 |     });
  1314 | 
  1315 | });
  1316 | 
```