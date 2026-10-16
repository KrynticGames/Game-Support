const fs=require('fs'),http=require('http'),assert=require('assert');const {chromium}=require('playwright');
(async()=>{
 const files=['word-havoc-privacy.html','word-havoc-support.html','word-havoc-terms.html','brain-attack-privacy.html','brain-attack-support.html','brain-attack-terms.html','index.html'];
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!files.includes(name)){res.writeHead(404);res.end('Not found');return}res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(name))});await new Promise(r=>server.listen(8791,r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.WH_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const file of files){const source=fs.readFileSync(file,'utf8');assert(!/krynticgames@gmail|mailto:|Draft only|will be detailed once verified|will be reviewed before release/i.test(source),file);
  assert.equal((await page.goto('http://127.0.0.1:8791/'+file)).status(),200);assert.equal(await page.locator('form,input,textarea').count(),0);
  if(file!=='index.html')assert.match(await page.locator('body').innerText(),/October 16, 2026/);
  for(const width of[360,1280]){await page.setViewportSize({width,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,file+' overflow');}
  const links=await page.locator('a').evaluateAll(els=>els.map(e=>({href:e.getAttribute('href'),target:e.target,rel:e.rel})));
  for(const a of links){assert(a.href&&!a.href.startsWith('javascript:'));if(a.target==='_blank')assert(a.rel.includes('noopener')&&a.rel.includes('noreferrer'));if(files.includes(a.href))assert.equal((await fetch('http://127.0.0.1:8791/'+a.href)).status,200)}
 }
 assert.deepEqual(errors,[]);await page.goto('http://127.0.0.1:8791/brain-attack-privacy.html');await page.screenshot({path:'/tmp/brain-privacy-audit.png',fullPage:true});
 await browser.close();await new Promise(r=>server.close(r));console.log('PASS: six accurate dated policy/help pages and shared landing page, no developer email/forms, navigation, mobile/desktop overflow and no JS errors');
})().catch(e=>{console.error(e);process.exit(1)});
