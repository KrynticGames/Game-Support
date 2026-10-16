const fs=require('fs'),http=require('http'),assert=require('assert');
const {stripTypeScriptTypes}=require('node:module');
const {ws:WS,wsServer:WSS}=require(require.resolve('playwright').replace(/playwright\/index.js$/,'playwright-core/lib/utilsBundle.js'));
const {chromium}=require('playwright');
(async()=>{
let handlers;global.Bun={env:{},serve:o=>{handlers=o;},CryptoHasher:class{update(){return this}digest(){return 'test'}}};
let relay=fs.readFileSync('server/relay.ts','utf8').replace('import { SQL } from "bun";','const SQL=class {constructor(){return async()=>[]}};');
await new (Object.getPrototypeOf(async function(){}).constructor)(stripTypeScriptTypes(relay))();
const server=http.createServer((req,res)=>{let s=fs.readFileSync('distribution/word-havoc/index.html','utf8').replaceAll('wss://word-combat-relay.up.railway.app/ws','ws://127.0.0.1:8765/ws').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');
s=s.replace("})();\n</script>","window.__wh={state:()=>({board,players,turn,gameOver,onlineRole,onlineConnected,onlineActionPending,matchStarted}),analysis:()=>analyzeMove(),guestAction:sendGuestAction,place:(p)=>{placements=p;renderAll();},submit:()=>submitMove(),pass:()=>passTurn(),stop:()=>onlineSocket.close(),reconnect:()=>connectRelay(onlineRole,true),rack:(i,r)=>{players[i].rack=r;syncOnlineState();renderAll();}};})();\n</script>");res.setHeader('Content-Type','text/html');res.end(s)});
const wss=new WSS({noServer:true});server.on('upgrade',async(req,socket,head)=>{const request=new Request('http://localhost'+req.url);await handlers.fetch(request,{upgrade:(_req,opts)=>{wss.handleUpgrade(req,socket,head,s=>{s.data=opts.data;s.on('message',m=>handlers.websocket.message(s,m.toString()));s.on('close',()=>handlers.websocket.close(s));handlers.websocket.open(s)});return true}})});await new Promise(r=>server.listen(8765,r));
const {JSDOM,VirtualConsole}=require(process.env.WH_JSDOM_MODULE||'jsdom');
const errors=[];const doms=[];
function make(){
 let s=fs.readFileSync('distribution/word-havoc/index.html','utf8').replaceAll('wss://word-combat-relay.up.railway.app/ws','ws://127.0.0.1:8765/ws').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');
 s=s.replace("})();\n</script>","window.__wh={state:()=>({board,players,turn,gameOver,onlineRole,onlineConnected,onlineActionPending,matchStarted}),analysis:()=>analyzeMove(),guestAction:sendGuestAction,place:(p)=>{placements=p;renderAll();},submit:()=>submitMove(),pass:()=>passTurn(),stop:()=>onlineSocket.close(),reconnect:()=>connectRelay(onlineRole,true),rack:(i,r)=>{players[i].rack=r;syncOnlineState();renderAll();}};})();\n</script>");
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const d=new JSDOM(s,{url:'http://127.0.0.1:8765',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.WebSocket=WS;w.confirm=()=>true;w.scrollTo=()=>{};}});doms.push(d);return d.window;
}
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out '+fn.toString())};
const click=(w,id)=>w.document.getElementById(id).click();
let a=make(),b=make();for(const p of[a,b]){click(p,'chooseOnlineBtn');click(p,'createOnlineBtn')}
await wait(()=>a.__wh.state().matchStarted&&b.__wh.state().matchStarted);
let host=a.__wh.state().onlineRole==='host'?a:b,guest=host===a?b:a;
for(let n=0;n<2;n++){
 const i=host.__wh.state().turn,p=i===0?host:guest;host.__wh.rack(i,['C','A','T','S','D','O','G']);
 if(i===1)await wait(()=>guest.__wh.state().players[i].rack[0]==='C');
 p.__wh.place(n===0?[{r:5,c:4,rackIndex:0,letter:'C'},{r:5,c:5,rackIndex:1,letter:'A'},{r:5,c:6,rackIndex:2,letter:'T'}]:[{r:5,c:7,rackIndex:3,letter:'S'}]);await p.__wh.submit();
 await wait(()=>guest.__wh.state().board[5][n===0?4:7]!==null);
 assert.equal(JSON.stringify(host.__wh.state().board),JSON.stringify(guest.__wh.state().board));
}
// A turn creates three separately scored words: TO, AT and TO.
{const i=host.__wh.state().turn,p=i===0?host:guest;host.__wh.rack(i,['T','O','Q','Z','D','E','F']);if(i===1)await wait(()=>guest.__wh.state().players[i].rack[0]==='T');
p.__wh.place([{r:6,c:5,rackIndex:0,letter:'T'},{r:6,c:6,rackIndex:1,letter:'O'}]);
const a=p.__wh.analysis();assert.equal(a.ok,true);assert.equal(a.allWords.join(','),'TO,AT,TO');assert.equal(a.wordScores.length,3);assert.equal(a.base,a.wordScores.reduce((n,w)=>n+w.base,0));await p.__wh.submit();await wait(()=>guest.__wh.state().board[6][6]!==null);}
if(host.__wh.state().turn===0){host.__wh.pass();await wait(()=>guest.__wh.state().turn===1);}
host.__wh.rack(1,['Q','Z','A','B','C','D','E']);await wait(()=>guest.__wh.state().players[1].rack[0]==='Q');
const before=JSON.stringify(host.__wh.state().players.map(p=>p.hp));
guest.__wh.place([{r:4,c:5,rackIndex:0,letter:'Q'},{r:4,c:6,rackIndex:1,letter:'Z'}]);
assert.equal(guest.__wh.analysis().ok,false);assert.equal(guest.document.getElementById('damagePreview').textContent,'—');
guest.__wh.guestAction('move',{placements:[{r:4,c:5,rackIndex:0},{r:4,c:6,rackIndex:1}]});await wait(()=>!guest.__wh.state().onlineActionPending);assert.equal(JSON.stringify(host.__wh.state().players.map(p=>p.hp)),before);assert.equal(host.__wh.state().board[4][5],null);
console.log('PASS: 3 formed words scored, invalid words hide score, host rejects invalid remote move without HP/board changes or stuck pending state');
guest.__wh.stop();await wait(()=>!host.__wh.state().onlineConnected);guest.__wh.reconnect();await wait(()=>host.__wh.state().onlineConnected);
click(host,'surrenderBtn');await wait(()=>guest.__wh.state().gameOver);click(host,'beginTurnBtn');await wait(()=>guest.document.getElementById('beginTurnBtn').textContent==='Accept Rematch');click(guest,'beginTurnBtn');await wait(()=>!host.__wh.state().gameOver&&!guest.__wh.state().gameOver);
let c=make();click(c,'chooseOnlineBtn');click(c,'createOnlineBtn');await new Promise(r=>setTimeout(r,50));click(c,'cancelMatchBtn');assert.equal(c.document.getElementById('createOnlineBtn').disabled,false);
assert.deepEqual(errors,[]);
console.log('PASS: DOM clients: automatic matchmaking, CAT/CATS valid moves, board sync, disconnect/reconnect, surrender, same-room rematch, search cancellation, no JS errors');
for(const d of doms)d.window.close();
let sockets=[];for(let n=0;n<100;n++){let s=new WS('ws://127.0.0.1:8765/match?player=loadtest-'+n+'-'+crypto.randomUUID());s.matched=null;s.on('message',b=>{let m=JSON.parse(b);if(m.type==='matched')s.matched=m});sockets.push(s)}
await wait(()=>sockets.every(s=>s.matched));assert.equal(new Set(sockets.map(s=>s.matched.room)).size,50);for(const s of sockets)s.close();
console.log('PASS: 100 simultaneous local sockets paired into 50 unique matches; not a production capacity certification');
for(const s of wss.clients)s.terminate();wss.close();await new Promise(r=>server.close(r));process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
