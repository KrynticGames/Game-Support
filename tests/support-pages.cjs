const fs=require('fs'),http=require('http'),assert=require('assert');
const {chromium}=require('playwright');
(async()=>{
 let handler;global.Bun={env:{},serve:o=>handler=o.fetch};new Function(fs.readFileSync('server/support-site.ts','utf8'))();
 const server=http.createServer(async(req,res)=>{const result=handler(new Request('http://localhost'+req.url));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text())});await new Promise(r=>server.listen(8787,r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.WH_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});let errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['/privacy','/support','/terms']){
   const response=await page.goto('http://127.0.0.1:8787'+route);assert.equal(response.status(),200);
   assert.match(await response.headerValue('content-security-policy'),/default-src 'none'/);
   const body=await page.locator('body').innerText();assert.match(body,/October 15, 2026/);assert.doesNotMatch(body,/Draft only|requires a Word Havoc account|six-character code is correct|Privacy policy draft/);
   const links=await page.locator('a').evaluateAll(els=>els.map(a=>({href:a.getAttribute('href'),target:a.target,rel:a.rel})));
   for(const a of links){assert(a.href&&!/^javascript:/i.test(a.href));if(a.target==='_blank')assert(a.rel.includes('noopener')&&a.rel.includes('noreferrer'));
     if(a.href.startsWith('/'))assert.equal(handler(new Request('http://localhost'+a.href)).status,200);
   }
   await page.setViewportSize({width:360,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(route==='/support')await page.screenshot({path:'/tmp/word-havoc-support-mobile.png',fullPage:true});
   await page.setViewportSize({width:1280,height:900});
 }
 await page.goto('http://127.0.0.1:8787/privacy');await page.screenshot({path:'/tmp/word-havoc-privacy-desktop.png'});
 await page.getByRole('link',{name:'Terms',exact:true}).click();assert.equal(await page.title(),'Word Havoc Terms of Use');assert.deepEqual(errors,[]);
 console.log('PASS: privacy/support/terms routes, internal navigation, strict CSP, safe external links, accurate account text, mobile overflow and no JavaScript errors');
 await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});
