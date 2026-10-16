const fs=require('fs'),http=require('http'),assert=require('assert');
const {chromium}=require('playwright');
(async()=>{
 const source=fs.readFileSync('distribution/word-havoc/index.html','utf8').replace("})();\n</script>","window.__safety={snapshot:()=>statePayload(1),receive:m=>{gameMode='online';onlineRole='guest';applyRemoteState(m)}};})();\n</script>");
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(source)});
 await new Promise(r=>server.listen(8788,r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.WH_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://sdk.crazygames.com/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:8788');await page.click('#chooseCpuBtn');await page.click('#startCpuBtn');
 for(const draw of [false,true]){
  await page.evaluate(draw=>{
   window.__injected=false;
   const attack='<img src=x onerror="window.__injected=true"><svg onload="window.__injected=true"></svg><b onclick="window.__injected=true">probe</b>';
   const m=__safety.snapshot();m.gameOver=true;m.stats.turns=attack;m.players[0].hp=attack;
   m.logHtml='<div onclick="window.__injected=true">Log'+attack+'</div>';
   m.result=draw?{draw:true}:{winner:0,data:{word:attack,damage:attack}};
   __safety.receive(m);
  },draw);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__injected),false);
  assert.equal(await page.locator('#overlayText img,#overlayText svg,#overlayText script,#log img,#log svg').count(),0);
  assert.equal(await page.locator('#overlayText').evaluate(el=>[...el.querySelectorAll('*')].every(n=>['B','BR'].includes(n.tagName)&&n.attributes.length===0)),true);
  assert.match(await page.locator('#overlayText').innerText(),/probe/);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: remote win/draw fields and log markup cannot create active elements or event handlers; ordinary formatting retained');
 await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});
