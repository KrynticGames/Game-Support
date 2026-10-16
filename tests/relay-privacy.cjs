const fs=require('fs'),assert=require('assert'),{stripTypeScriptTypes}=require('node:module');
(async()=>{
 const source=fs.readFileSync('server/relay.ts','utf8');
 assert(!/\bSQL\b|DATABASE_URL|Bun\.password|console\.|writeFile/.test(source));
 let h,tick,now=Date.now();const realNow=Date.now;Date.now=()=>now;
 const fakeInterval=fn=>{tick=fn;return {unref(){}}};
 const fakeBun={env:{},serve:opts=>h=opts};
 new Function('Bun','setInterval',stripTypeScriptTypes(source))(fakeBun,fakeInterval);
 for(const path of ['/auth/register','/auth/login','/auth/me','/auth/delete','/stats/match','/activity/events','/activity/summary','/report']){
  const req=new Request('http://localhost'+path,{method:'POST',body:'private data must not be read'});
  const r=await h.fetch(req,{});assert.equal(r.status,410,path);assert.equal(req.bodyUsed,false,path);
 }
 const sockets=[];const srv={upgrade(req,o){let s={data:o.data,readyState:1,messages:[],send(x){this.messages.push(JSON.parse(x))},close(){this.readyState=3}};sockets.push(s);h.websocket.open(s);return true}};
 await h.fetch(new Request('http://localhost/match?player=guest-random-123'),srv);
 await h.fetch(new Request('http://localhost/match?player=guest-random-456'),srv);
 const [a,b]=sockets,matched=a.messages.find(x=>x.type==='matched');assert(matched);
 const room=matched.room;
 assert.equal((await h.fetch(new Request('http://localhost/ws?room='+room+'&role=host&player=imposter-12345'),srv)).status,404);
 h.websocket.message(b,JSON.stringify({type:'join',name:'Nickname',playerId:'forged'}));assert.equal(a.messages.at(-1).playerId,b.data.playerId);
 let count=a.messages.length;h.websocket.message(b,JSON.stringify({type:'authenticate',token:'unused'}));assert.equal(a.messages.length,count);
 now+=16*60_000;tick();assert.equal((await (await h.fetch(new Request('http://localhost/health'),{})).json()).rooms,0);
 assert.equal(a.readyState,3);assert.equal(b.readyState,3);Date.now=realNow;
 console.log('PASS: no database/file/log writes; legacy endpoints reject without reading bodies; reconnect slot validation; inactivity expiry erases room memory.');
})().catch(e=>{console.error(e);process.exit(1)});
