import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext();
 const page=await context.newPage(); page.on('pageerror',err=>console.log(err.message)); page.on('console',msg=>{if(msg.type()==='error')console.log(msg.text());});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort());
 await page.goto('http://localhost:5174/test/reviewRegressionHarness.html');
 await page.waitForFunction(()=>window.ready);
 for(const account of ['cib','hsbc']) {
  await page.locator('#opener').focus();
  await page.evaluate(account=>window.openDeduct(account),account);
  const dialog=page.locator('dialog');await dialog.waitFor();
  assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
  assert.equal(await dialog.locator('select').first().inputValue(),account);
  assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
  const last=dialog.locator('button').last();await last.focus();await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'opener');
  await page.evaluate(account=>window.openDeduct(account),account);
  await dialog.waitFor();
  await dialog.locator('button').last().click();
  const balances = await page.evaluate(()=>window.store.getState().accounts);
  assert.equal(balances[account].balance, account==='cib'?900:1900);
  assert.equal(balances[account==='cib'?'hsbc':'cib'].balance,account==='cib'?2000:1000);
 }
 await page.evaluate(()=>window.openEntry());
 await page.getByRole('button',{name:'Update entry',exact:true}).click();
 const entry=await page.evaluate(()=>window.store.getState().entries.find(e=>e.id==='fx-edit'));
 assert.equal(entry.amount,5000);assert.equal(entry.actualAmount,5000);assert.equal(entry.fxRateAtEntry,50);
 await page.evaluate(async () => {
   const storage = await import('/src/utils/storageAdapter.ts');
   await storage.saveStorageAsync('synthetic-durable-test', 1000);
   const put = IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put = function () { throw new DOMException('Injected quota error', 'QuotaExceededError'); };
   let rejected = false;
   try { await storage.saveStorageAsync('synthetic-durable-test', 1200); } catch { rejected = true; }
   IDBObjectStore.prototype.put = put;
   if (!rejected || !storage.getPersistenceError()) throw new Error('Failed save was hidden');
   if (storage.loadStorageSync('synthetic-durable-test', 0) !== 1200) throw new Error('Unsaved recovery data lost');
   await storage.retryFailedStorageWrites();
   await storage.flushStorageWrites();
   if (await storage.loadStorageAsync('synthetic-durable-test', 0) !== 1200) throw new Error('Recovery retry did not persist');
 });
 await page.evaluate(async () => {
   const {getSyncEngine} = await import('/src/services/syncEngine.ts');
   const state = window.store.getState();
   const local = state.exportJSON();
   const remote = JSON.parse(local);
   remote.data.cashEntries = [{id:'remote-only',date:'2026-11-01',amount:99,type:'expense',category:'Synthetic',account:'cib'}];
   state.setSyncConflict({localPayload:local,remotePayload:JSON.stringify(remote),remoteModifiedTime:'synthetic'});
   const original = IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put = function(value,key) {
     if(key==='budget-control-cash-entries') throw new DOMException('Injected save failure','QuotaExceededError');
     return original.call(this,value,key);
   };
   try { await getSyncEngine(window.store.getState).resolveConflict('take_theirs'); }
   finally { IDBObjectStore.prototype.put=original; }
   const restored = window.store.getState();
   if(!restored.syncConflict || !restored.hasUnsyncedChanges || restored.entries.some(e=>e.id==='remote-only')) throw new Error('Failed durable import resolved conflict or replaced local budget');
   const storage = await import('/src/utils/storageAdapter.ts');
   await storage.retryFailedStorageWrites();
 });
 const fallbackContext = await browser.newContext();
 await fallbackContext.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort());
 await fallbackContext.addInitScript(() => {
   Object.defineProperty(window,'indexedDB',{value:undefined});
   if(!localStorage.getItem('synthetic-seeded')) {
     localStorage.setItem('budget-control-account-balances',JSON.stringify({cib:{name:'CIB',balance:1000}}));
     localStorage.setItem('synthetic-seeded','true');
   }
 });
 const fallbackPage=await fallbackContext.newPage();
 await fallbackPage.goto('http://localhost:5174/test/reviewRegressionHarness.html');
 await fallbackPage.waitForFunction(()=>window.ready);
 assert.equal(await fallbackPage.evaluate(()=>window.store.getState().accounts.cib.balance),1000);
 await fallbackPage.evaluate(()=>window.store.getState().updateAccountBalance('cib',1200));
 await fallbackPage.reload();await fallbackPage.waitForFunction(()=>window.ready);
 assert.equal(await fallbackPage.evaluate(()=>window.store.getState().accounts.cib.balance),1200);
 await fallbackContext.close();
 const peer=await page.context().newPage();
 await peer.goto('http://localhost:5174/test/reviewRegressionHarness.html');
 await peer.waitForFunction(()=>window.ready);
 for(const tab of [page,peer]) await tab.evaluate(async()=>{
   const storage=await import('/src/utils/storageAdapter.ts');
   window.hydrationMessages=0;
   window.stopHydration=storage.onStorageChange(()=>{
     window.hydrationMessages++;
     if(window.hydrationMessages<10) void window.store.getState().initStorage(true);
   });
 });
 await page.evaluate(()=>window.store.getState().initStorage(true));
 await peer.waitForTimeout(200);
 assert.equal(await peer.evaluate(()=>window.hydrationMessages),0,'Hydration must not bounce storage writes to the peer');
 assert.equal(await page.evaluate(()=>window.hydrationMessages),0,'Peer must not bounce hydration back');
 await peer.close();
 console.log('PASS: deduction account balances, modal focus, historical FX, IndexedDB failure/retry, failed conflict import');
} finally {await browser.close();}
