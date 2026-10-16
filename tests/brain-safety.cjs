const fs=require('fs'),http=require('http'),assert=require('assert');
const {chromium}=require('playwright');
(async()=>{
 let source=fs.readFileSync('play/brain-attack.html','utf8');
 assert(!source.includes('game-activity.js'));assert(!source.includes('window.__GAME_TEST__'));
 const line=source.split('\n').find(l=>l.startsWith('const categories='));
 const bank=JSON.parse(line.slice('const categories='.length,-1));
 const patterns=JSON.parse(fs.readFileSync('audit/content-screen-patterns.json','utf8'));
 let count=0;for(const rows of Object.values(bank))for(const r of rows){count++;
  assert.equal(new Set([r[1],...r[2]]).size,4);
  const text=[r[0],r[1],...r[2],r[4]||''].join(' ');
  for(const [name,p]of Object.entries(patterns))assert(!new RegExp(p,'iu').test(text),name+': '+r[0]);
 }
 assert.equal(count,9675);
 source=source.replace('\n</script>','\nwindow.__ba={game,tutorial,startTutorial,selectPlacement,confirmPlacement,humanAnswer,startSolo,getProfile:()=>profile,nextQuestion,showAnswerReview,clearPending,categories,getAudioState};\n</script>');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(source)});await new Promise(r=>server.listen(8790,r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.WH_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}});let errors=[],outside=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8790')&&!r.url().startsWith('data:'))outside.push(r.url())});
 await page.addInitScript(()=>{localStorage.setItem('kryntic.activity.visitor.v1','old-tracker');localStorage.setItem('brainAttackReportsV1',JSON.stringify([{id:'legacy',note:'private old note',question:'old flag'}]))});
 await page.goto('http://127.0.0.1:8790');
 assert.equal(await page.evaluate(()=>localStorage.getItem('kryntic.activity.visitor.v1')),null);
 assert.equal(await page.locator('#startBtn').isVisible(),true);
 await page.click('#startBtn');await page.waitForFunction(()=>__ba.tutorial.active);
 for(const i of[0,1,2]){await page.locator('#homeBoard [data-i="'+i+'"]').click();await page.click('#confirmPlace')}
 await page.waitForFunction(()=>__ba.game.phase==='question');
 await page.evaluate(()=>__ba.humanAnswer(__ba.game.correctIndex));
 await page.waitForFunction(()=>__ba.game.phase==='humanAttack');
 assert.equal(await page.evaluate(()=>__ba.getProfile().totalAnswered),0);await page.screenshot({path:'/tmp/brain-safety-combat.png'});
 // Test real trivia rendering, local flag privacy, progress and confirmed reset.
 await page.evaluate(()=>{__ba.clearPending();__ba.tutorial.active=false;__ba.startSolo('daily')});
 await page.waitForFunction(()=>__ba.game.phase==='question');
 await page.evaluate(()=>__ba.humanAnswer(__ba.game.correctIndex));
 await page.waitForFunction(()=>__ba.game.phase==='review');
 assert.equal(await page.evaluate(()=>__ba.getProfile().totalAnswered),1);
 await page.click('#reportQuestion');assert.equal(await page.locator('textarea').count(),0);await page.click('#saveReport');
 assert.match(await page.locator('#answerStatus').innerText(),/not been sent/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('brainAttackReportsV1')).some(x=>'note'in x)),false);
 await page.click('#progressBtn');await page.click('#resetProgress');assert.equal(await page.evaluate(()=>__ba.getProfile().totalAnswered),1);await page.click('#confirmReset');assert.equal(await page.evaluate(()=>__ba.getProfile().totalAnswered),0);
 assert.equal(await page.locator('input:not([type=hidden]),textarea').count(),1); // hidden combat-practice checkbox only
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/brain-safety-mobile.png'});
 const blockedContext=await browser.newContext();await blockedContext.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked')}}));const blocked=await blockedContext.newPage();blocked.on('pageerror',e=>errors.push(e.message));await blocked.goto('http://127.0.0.1:8790');await blocked.click('#dailyBtn');await blocked.waitForFunction(()=>__ba.game.phase==='question');await blocked.evaluate(()=>__ba.humanAnswer(__ba.game.correctIndex));assert.equal(await blocked.evaluate(()=>__ba.getProfile().totalAnswered),1);assert.deepEqual(errors,[]);await blockedContext.close();
 await browser.close();await new Promise(r=>server.close(r));
 console.log('PASS: 9,675 screened rows, distinct answers, tutorial/scoring, local flags without notes, confirmed reset, mobile layout, no game network requests or JS errors');
})().catch(e=>{console.error(e);process.exit(1)});
