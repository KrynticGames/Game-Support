const fs=require('fs'),http=require('http'),assert=require('assert');
const {stripTypeScriptTypes}=require('node:module');
const {ws:WS,wsServer:WSS}=require(require.resolve('playwright').replace(/playwright\/index.js$/,'playwright-core/lib/utilsBundle.js'));
const {chromium}=require('playwright');
(async()=>{
let handlers;global.Bun={env:{},serve:o=>{handlers=o;},CryptoHasher:class{update(){return this}digest(){return 'test'}}};
let relay=fs.readFileSync('server/relay.ts','utf8').replace('import { SQL } from "bun";','const SQL=class {constructor(){return async()=>[]}};');
await new (Object.getPrototypeOf(async function(){}).constructor)(stripTypeScriptTypes(relay))();
const server=http.createServer((req,res)=>{let s=fs.readFileSync('distribution/word-havoc/index.html','utf8').replaceAll('wss://word-combat-relay.up.railway.app/ws','ws://127.0.0.1:8765/ws').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');
s=s.replace("})();\n</script>","window.__wh={progress:readProgress,next:()=>newGame(true),finish:(winner)=>{gameOver=true;showGameOver(winner,{surrender:true})},state:()=>({board,players,turn,gameOver,onlineRole,onlineConnected,onlineActionPending,matchStarted}),place:(p)=>{placements=p;renderAll();},submit:()=>submitMove(),pass:()=>passTurn(),stop:()=>onlineSocket.close(),reconnect:()=>connectRelay(onlineRole,true),rack:(i,r)=>{players[i].rack=r;syncOnlineState();renderAll();}};})();\n</script>");res.setHeader('Content-Type','text/html');res.end(s)});
const wss=new WSS({noServer:true});server.on('upgrade',async(req,socket,head)=>{const request=new Request('http://localhost'+req.url);await handlers.fetch(request,{upgrade:(_req,opts)=>{wss.handleUpgrade(req,socket,head,s=>{s.data=opts.data;s.on('message',m=>handlers.websocket.message(s,m.toString()));s.on('close',()=>handlers.websocket.close(s));handlers.websocket.open(s)});return true}})});await new Promise(r=>server.listen(8765,r));

const browser=await chromium.launch({headless:true,executablePath:process.env.WH_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];let contexts=[];
const avatar='https://images.crazygames.com/userportal/avatars/4.png';
async function pageFor({user=null,seed={},local={},disabled=false}={}){
 const context=await browser.newContext();contexts.push(context);
 await context.addInitScript(({user,seed,local,disabled})=>{
  for(const [k,v]of Object.entries(local))localStorage.setItem(k,v);
  window.__cgStore={...seed};window.__cgCalls=[];window.__cgUser=user;window.__failSave=false;
  window.CrazyGames={SDK:{init:async()=>{},game:{settings:{muteAudio:false},addSettingsChangeListener(){},gameplayStart(){},gameplayStop(){}},
   data:{getItem(k){if(disabled)throw {code:'dataModuleDisabled'};return Object.hasOwn(window.__cgStore,k)?window.__cgStore[k]:null},setItem(k,v){window.__cgCalls.push(k);if(disabled||window.__failSave)throw Error('Save unavailable');window.__cgStore[k]=String(v)}},
   user:{isUserAccountAvailable:true,getUser:async()=>window.__cgUser,addAuthListener(fn){window.__cgAuth=fn},showAuthPrompt(){throw Error('Unexpected sign-in prompt')}}}};
  window.__switchPortal=(u,s)=>{window.__cgUser=u;window.__cgStore={...s};window.__cgAuth(u)};
 },{user,seed,local,disabled});
 const p=await context.newPage();p.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
 await p.route('https://sdk.crazygames.com/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await p.route('https://images.crazygames.com/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN6kAAAAASUVORK5CYII=','base64')}));
 p.setDefaultTimeout(10000);await p.goto('http://127.0.0.1:8765');await p.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('CrazyGames')||document.getElementById('recordSaveStatus').textContent.includes('unavailable'));
 return p;
}
const record={games:22,wins:12,losses:8,draws:2,bestHit:30};
const progress={v:1,total:record,cpu:record,online:{games:0,wins:0,losses:0,draws:0,bestHit:0},history:[]};
const seed={wordHavocProgressV1:JSON.stringify(progress),wordHavocSound:'on',wordHavocMotion:'reduced',wordHavocPreferencesV1:JSON.stringify({difficulty:'hard',timer:'blitz',map:'citadel'})};
let a=await pageFor({user:{username:'Long.Player_Name1234',profilePictureUrl:avatar},seed,local:{wordHavocProgressV1:JSON.stringify({...progress,total:{...record,games:999}}),wordHavocAccountToken:'private-token',wordHavocOnlineHostState:'private-racks'}});
assert.equal(await a.locator('#portalName').textContent(),'Long.Player_Name1234');assert.equal(await a.locator('#recordGames').textContent(),'22');assert.equal(await a.locator('#launchDifficulty').inputValue(),'hard');assert.equal(await a.locator('#launchMap').inputValue(),'citadel');
await a.click('#chooseCpuBtn');await a.click('#startCpuBtn');await a.waitForFunction(()=>__wh.state().matchStarted);
assert.equal(await a.locator('#p1Name').textContent(),'Long.Player_Name1234');assert.equal(await a.locator('#p1Avatar').isVisible(),true);
a.on('dialog',d=>d.accept());await a.click('#mobileMenuBtn');await a.click('#mobileMenuSurrender');assert.equal(await a.locator('#recordLosses').textContent(),'9');assert.equal(await a.locator('#recordGames').textContent(),'23');
await a.evaluate(()=>__wh.finish(1));assert.equal(await a.locator('#recordGames').textContent(),'23');
const saved=await a.evaluate(()=>__cgStore);
const b=await pageFor({user:{username:'Long.Player_Name1234',profilePictureUrl:avatar},seed:saved});assert.equal(await b.locator('#recordGames').textContent(),'23');assert.equal(await b.locator('#launchMap').inputValue(),'citadel');
await b.evaluate(()=>__switchPortal({username:'Different.Player',profilePictureUrl:''},{}));assert.equal(await b.locator('#recordGames').textContent(),'0');assert.equal(await b.locator('#launchDifficulty').inputValue(),'normal');assert.equal(await b.locator('#launchMap').inputValue(),'frontline');
console.log('PASS: CrazyGames profile/avatar, existing cloud record preserved, result saved once, fresh browser restores record/settings, account switch isolates data/preferences');
await a.evaluate(()=>wordHavocBack());await a.evaluate(()=>{document.getElementById('passOverlay').classList.remove('show');document.getElementById('startOverlay').classList.add('show')});
await a.click('#portalRecordBtn');assert.equal(await a.locator('#playerRecordOverlay').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.width/2,r.height/2))}),true);await a.screenshot({path:'/tmp/word-havoc-player-record.png'});
const c=await pageFor({user:null,local:{wordHavocMatchHistory:JSON.stringify([{mode:'cpu',winner:0,at:Date.now(),biggestHit:10}]),wordHavocSound:'on',wordHavocAccountToken:'secret'}});
assert.match(await c.locator('#portalName').textContent(),/^Guest-/);assert.equal(await c.locator('#recordWins').textContent(),'1');assert.equal(await c.evaluate(()=>Object.hasOwn(__cgStore,'wordHavocAccountToken')),false);
await c.click('#chooseCpuBtn');await c.click('#startCpuBtn');await c.waitForFunction(()=>__wh.state().matchStarted);
await c.evaluate(()=>{for(let n=0;n<30;n++){__wh.next();__wh.finish(0)}});assert.equal(await c.locator('#recordGames').textContent(),'31');assert.equal(await c.evaluate(()=>__wh.progress().history.length),20);
assert.equal(await c.evaluate(()=>__cgCalls.some(k=>!['wordHavocProgressV1','wordHavocSound','wordHavocMotion','wordHavocPreferencesV1'].includes(k))),false);
console.log('PASS: Guest plays with no account flow, legacy guest record migration, cumulative totals survive 20-match history limit, no secret/token/rack uploads');
const disabled=await pageFor({user:{username:'Still.Playable',profilePictureUrl:avatar},disabled:true});assert.equal(await disabled.locator('#portalName').textContent(),'Still.Playable');await disabled.click('#chooseCpuBtn');await disabled.click('#startCpuBtn');await disabled.waitForFunction(()=>__wh.state().matchStarted);await disabled.evaluate(()=>__wh.finish(0));assert.equal(await disabled.locator('#recordGames').textContent(),'1');assert.match(await disabled.locator('#recordSaveStatus').textContent(),/unavailable/);
console.log('PASS: Disabled/failed Data module keeps game playable, retains session result, reports save failure without a false cloud-save claim');
// Two real clients exchange portal names/avatars; each saves its own result.
const onlineA=await pageFor({user:{username:'Portal.Host',profilePictureUrl:avatar}}),onlineB=await pageFor({user:{username:'Portal.Guest',profilePictureUrl:avatar}});
for(const p of[onlineA,onlineB]){await p.click('#chooseOnlineBtn');await p.click('#createOnlineBtn')}
await onlineA.waitForFunction(()=>__wh.state().matchStarted);await onlineB.waitForFunction(()=>__wh.state().matchStarted);
assert.equal(await onlineA.locator('#p1Name').textContent(),'Portal.Host');assert.equal(await onlineA.locator('#p2Name').textContent(),'Portal.Guest');assert.equal(await onlineB.locator('#p1Name').textContent(),'Portal.Host');assert.equal(await onlineB.locator('#p2Avatar').isVisible(),true);
onlineA.on('dialog',d=>d.accept());await onlineA.click('#mobileMenuBtn');await onlineA.click('#mobileMenuSurrender');await onlineB.waitForFunction(()=>__wh.state().gameOver);
assert.equal(await onlineA.locator('#recordLosses').textContent(),'1');assert.equal(await onlineB.locator('#recordWins').textContent(),'1');
await onlineB.setViewportSize({width:390,height:844});await onlineB.screenshot({path:'/tmp/word-havoc-profile-mobile.png',fullPage:true});await onlineB.click('#overlaySecondaryBtn');await onlineB.click('#portalRecordBtn');await onlineB.screenshot({path:'/tmp/word-havoc-record-mobile.png'});
console.log('PASS: Both portal names and avatars visible to opponents, host loss and guest win saved to correct player records');
assert.deepEqual(errors,[]);
for(const context of contexts)await context.close();await browser.close();for(const socket of wss.clients)socket.terminate();wss.close();await new Promise(r=>server.close(r));process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
