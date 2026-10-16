const fs=require('fs'),http=require('http'),assert=require('assert');
const {stripTypeScriptTypes}=require('node:module');
const {ws:WS,wsServer:WSS}=require(require.resolve('playwright').replace(/playwright\/index.js$/,'playwright-core/lib/utilsBundle.js'));
const {chromium}=require('playwright');
(async()=>{
const server=http.createServer((req,res)=>{let s=fs.readFileSync('distribution/word-havoc/index.html','utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');
s=s.replace("})();\n</script>","window.__wh={state:()=>({board,players,turn,gameOver,onlineRole,onlineConnected,onlineActionPending,matchStarted}),place:(p)=>{placements=p;renderAll();},submit:()=>submitMove(),pass:()=>passTurn(),stop:()=>onlineSocket.close(),reconnect:()=>connectRelay(onlineRole,true),rack:(i,r)=>{players[i].rack=r;syncOnlineState();renderAll();}};})();\n</script>");res.setHeader('Content-Type','text/html');res.end(s)});
await new Promise(r=>server.listen(8765,r));
const browser=await chromium.launch({headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{}),...(process.env.WH_CHROMIUM_PATH?{executablePath:process.env.WH_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});const a=await browser.newPage(),b=await browser.newPage();let errors=[];for(const p of[a,b]){p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('websocket',w=>w.on('socketerror',e=>console.log('WebSocket error:',e)));}
// The environment proxy uses its own trusted CA. Bridge browser test sockets through
// Node's normally verified TLS transport, without disabling certificate checks.
async function liveTransport(page){
 await page.route('https://sdk.crazygames.com/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.routeWebSocket('wss://word-combat-relay.up.railway.app/**',route=>{
  const {HttpsProxyAgent,getProxyForUrl}=require(require.resolve('playwright').replace(/playwright\/index.js$/,'playwright-core/lib/utilsBundle.js'));
  const proxy=getProxyForUrl(route.url()),pending=[];
  const remote=new WS(route.url(),proxy?{agent:new HttpsProxyAgent(proxy)}:{});
  route.onMessage(m=>{if(remote.readyState===1)remote.send(m);else pending.push(m)});
  route.onClose(()=>remote.close());remote.on('open',()=>{for(const m of pending)remote.send(m)});
  remote.on('message',m=>{try{route.send(m.toString())}catch{}});
  remote.on('close',(code)=>{try{route.close({code:code>=1000&&code!==1005&&code!==1006?code:1000})}catch{}});
  remote.on('error',e=>{console.log('Live transport error:',e.message);try{route.close()}catch{}});
 });
}
for(const p of[a,b])await liveTransport(p);
for(const p of[a,b]){await p.goto('http://127.0.0.1:8765');await p.click('#chooseOnlineBtn');await p.click('#createOnlineBtn');}
await a.waitForFunction(()=>window.__wh.state().matchStarted);await b.waitForFunction(()=>window.__wh.state().matchStarted);
assert.equal(await a.locator('#startOverlay').evaluate(x=>x.classList.contains('show')),false);
let host=(await a.evaluate(()=>__wh.state().onlineRole))==='host'?a:b,guest=host===a?b:a;
for(let n=0;n<2;n++){
 const i=await host.evaluate(()=>__wh.state().turn),p=i===0?host:guest;
 await host.evaluate(i=>__wh.rack(i,['C','A','T','S','D','O','G']),i);
 if(i===1)await guest.waitForFunction(i=>__wh.state().players[i].rack[0]==='C',i);
 const placements=n===0?[{r:5,c:4,rackIndex:0,letter:'C'},{r:5,c:5,rackIndex:1,letter:'A'},{r:5,c:6,rackIndex:2,letter:'T'}]:[{r:5,c:7,rackIndex:3,letter:'S'}];
 await p.evaluate(p=>__wh.place(p),placements);await p.evaluate(()=>__wh.submit());
 await guest.waitForFunction(n=>__wh.state().board[5][n===0?4:7]!==null,n);
 assert.deepEqual(await host.evaluate(()=>__wh.state().board),await guest.evaluate(()=>__wh.state().board));
}
// Invalid guest action must not leave its UI waiting forever.
await guest.evaluate(()=>__wh.stop());await host.waitForFunction(()=>!__wh.state().onlineConnected);await guest.evaluate(()=>__wh.reconnect());await host.waitForFunction(()=>__wh.state().onlineConnected);
await host.locator('#surrenderBtn').evaluate(el=>{window.confirm=()=>true;el.click()});await guest.waitForFunction(()=>__wh.state().gameOver);
await host.click('#beginTurnBtn');await guest.waitForFunction(()=>document.getElementById('beginTurnBtn').textContent==='Accept Rematch');await guest.click('#beginTurnBtn');await host.waitForFunction(()=>!__wh.state().gameOver);await guest.waitForFunction(()=>!__wh.state().gameOver);
await a.screenshot({path:'/tmp/word-havoc-desktop.png'});
const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await liveTransport(mobile);await mobile.goto('http://127.0.0.1:8765');await mobile.click('#chooseOnlineBtn');await mobile.click('#createOnlineBtn');await mobile.click('#cancelMatchBtn');assert.equal(await mobile.locator('#createOnlineBtn').isEnabled(),true);await mobile.screenshot({path:'/tmp/word-havoc-mobile.png'});await mobile.click('[data-launch-back]:visible');await mobile.click('#chooseCpuBtn');await mobile.click('#startCpuBtn');await mobile.screenshot({path:'/tmp/word-havoc-mobile-game.png',fullPage:true});
assert.deepEqual(errors,[]);console.log('PASS LIVE RAILWAY RELAY: 2 browser players, automatic match, CAT then CATS moves, board sync, disconnect/reconnect, surrender, rematch, mobile search/cancel, no JS errors');
await browser.close();await new Promise(r=>server.close(r));process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
