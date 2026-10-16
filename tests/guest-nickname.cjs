const fs=require('fs'),http=require('http'),assert=require('assert'),{chromium}=require('playwright');
(async()=>{const html=fs.readFileSync('distribution/word-havoc/index.html','utf8');const server=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.WH_CHROMIUM_PATH,args:['--no-sandbox']});
 try{const c=await browser.newContext(),p=await c.newPage(),errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1')&&!r.url().startsWith('data:'))external.push(r.url())});
 await p.route('https://sdk.crazygames.com/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 const url='http://127.0.0.1:'+server.address().port;await p.goto(url);await p.click('#portalRecordBtn');await p.fill('#guestNickname','WordKnight');await p.click('#saveNicknameBtn');assert.match(await p.textContent('#nicknameStatus'),/saved/);assert.equal(await p.textContent('#portalName'),'WordKnight');
 await p.reload();assert.equal(await p.textContent('#portalName'),'WordKnight');await p.click('#portalRecordBtn');await p.fill('#guestNickname','sh1thead');await p.click('#saveNicknameBtn');assert.match(await p.textContent('#nicknameStatus'),/another nickname/);assert.equal(await p.textContent('#portalName'),'WordKnight');
 assert.equal(await p.locator('input[type=password],input[type=email],#accountBox').count(),0);
 assert.equal(await p.evaluate(()=>localStorage.getItem('wordHavocNickname')),'WordKnight');assert.deepEqual(errors,[]);assert(!external.some(x=>/\/auth\/|\/stats\/|\/activity\//.test(x)));
 console.log('PASS: nickname persists after reload without signup; offensive nickname rejected; no account inputs or account/stat/activity uploads.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
