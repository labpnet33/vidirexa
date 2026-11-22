'use strict';
// Browser-level smoke checks: one representative studio initialization per captured mode.
// Does not claim video/export success; tests boot, iframe, canvas and error reporting.
const fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve('public-preview');
const audit=JSON.parse(fs.readFileSync(path.join(root,'captured-game-audit.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
const policy=JSON.parse(fs.readFileSync('vercel.json','utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
const routes=new Map();
for(const r of manifest.assets||[]){
 const m=/^site\/create\/(index__q_[a-f0-9]+)\.html$/.exec(r.local||'');
 const g=/^https:\/\/vidirexa\.com\/create\?game=([a-z0-9-]+)$/.exec(r.url||'');
 if(m&&g)routes.set(g[1],m[1]);
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm','.mp4':'video/mp4','.wav':'audio/wav','.ogg':'audio/ogg'};
const serve=http.createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end('Invalid URL');return}
 const f=path.resolve(root,'.'+pathname);
 if(f!==root&&!f.startsWith(root+path.sep)){res.writeHead(403).end('Forbidden');return}
 let file=f;
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');}catch{}
 if(!fs.existsSync(file)){res.writeHead(404).end('Missing: '+pathname);return}
 res.setHeader('Content-Security-Policy',policy);
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Type',types[path.extname(file).toLowerCase()]||'application/octet-stream');
 const body=fs.readFileSync(file);
 res.writeHead(200,{'Content-Length':body.length});res.end(body);
});
const results=[];
let browser,base;
async function test(row){
 const record={game:row.game,status:'error',details:'',consoleErrors:[],hasCanvas:false,renderPixels:null};
 let page;
 try{
  page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  page.on('pageerror',e=>record.consoleErrors.push(String(e.message||e).slice(0,300)));
  page.on('console',msg=>{if(msg.type()==='error')record.consoleErrors.push(msg.text().slice(0,300))});
  const route=routes.get(row.game);
  if(!route)throw Error('No captured studio route');
  await page.goto(base+'/create/'+route+'/index.html',{waitUntil:'domcontentloaded',timeout:20000});
  const element=await page.waitForSelector('iframe[title$=" studio"]',{timeout:12000});
  const frame=await element.contentFrame();
  if(!frame)throw Error('Studio iframe could not be opened');
  await frame.waitForFunction(()=>{
   const status=document.getElementById('runtime-status');
   return !status||status.dataset.error==='true';
  },null,{timeout:30000});
  const visibleError=await frame.locator('#runtime-status[data-error="true"]').allTextContents();
  if(visibleError.length)throw Error(visibleError.join(' ').slice(0,400));
  const canvas=frame.locator('#studio canvas').first();
  await canvas.waitFor({state:'attached',timeout:15000});
  const buttons=await frame.locator('#studio button').count();
  if(buttons===0)throw Error('Canvas exists but studio controls did not mount');
  record.hasCanvas=true;
  record.renderPixels=await canvas.evaluate(el=>{
   try{
    const ctx=el.getContext('2d');
    if(!ctx)return 'WebGL or other rendering context';
    const d=ctx.getImageData(0,0,Math.min(12,el.width),Math.min(12,el.height)).data;
    let count=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)count++;
    return count;
   }catch(e){return String(e.message||e)}
  });
  // The PREVIEW ONLY text is an HTML overlay, while the vireel.net label is
  // drawn directly on the canvas. Check both; CSS-only fixes are insufficient.
  const watermarkModule=row.runtime.replace(/index\.html$/,'shared/capture.mjs');
  record.previewMarks=await frame.evaluate(async path=>{
   const wm=document.querySelector('#watermark');
   if(!wm)throw Error('Preview overlay container missing');
   const overlayDisplay=getComputedStyle(wm).display;
   const overlayTiles=wm.querySelectorAll('.v-wm-tile').length;
   const mod=await import(path);
   const c=document.createElement('canvas');
   c.width=720;c.height=1280;
   mod.watermark(c,1);mod.previewWatermark(c,1);
   const ctx=c.getContext('2d',{willReadFrequently:true});
   const data=ctx.getImageData(0,0,c.width,c.height).data;
   let drawnPixels=0;
   for(let i=3;i<data.length;i+=4)if(data[i]>0)drawnPixels++;
   return {overlayDisplay,overlayTiles,drawnPixels};
  },watermarkModule);
  if(record.previewMarks.overlayDisplay!=='none'||record.previewMarks.overlayTiles!==0||record.previewMarks.drawnPixels!==0)throw Error('Preview branding still visible: '+JSON.stringify(record.previewMarks));
  record.buttons=buttons;
  record.status='passed';
  record.details='Studio mounted, canvas and controls present; clean preview overlay and canvas verified';
 }catch(error){
  record.details=String(error?.message||error).slice(0,500);
  try{
   const element=await page?.$('iframe[title$=" studio"]');
   const frame=await element?.contentFrame();
   if(frame)record.debug=await frame.evaluate(()=>{
    const root=document.querySelector('#studio');
    const status=document.querySelector('#runtime-status');
    return {rootChildren:root?.childElementCount,rootText:root?.innerText?.slice(0,650),canvasCount:root?.querySelectorAll('canvas').length,svgCount:root?.querySelectorAll('svg').length,rootHtmlLength:root?.innerHTML.length,statusText:status?.innerText?.slice(0,350),statusError:status?.dataset.error??null,documentReady:document.readyState};
   });
  }catch(e){record.debugError=String(e.message||e).slice(0,250)}

  try{
   const screenDir=path.join(root,'browser-failures');fs.mkdirSync(screenDir,{recursive:true});
   await page?.screenshot({path:path.join(screenDir,row.game+'.png'),timeout:5000});
  }catch{}
 }finally{try{await page?.close()}catch{}}
 results.push(record);
 console.log((record.status==='passed'?'PASS':'FAIL')+' '+row.game+' '+record.details+(record.status==='passed'?'':' | '+JSON.stringify(record.debug??record.debugError??record.consoleErrors)));
}
async function testCatalogue(){
 const page=await browser.newPage({viewport:{width:1365,height:900}});
 try{
  await page.goto(base+'/create/',{waitUntil:'domcontentloaded',timeout:25000});
  const cardSelector='.game-tile-shell > a.game-choice';
  const cards=page.locator(cardSelector);
  const count=await cards.count();
  if(count!==audit.total)throw Error('Expected '+audit.total+' clickable game cards, found '+count);
  const links=await cards.evaluateAll(elements=>elements.map(a=>({href:a.getAttribute('href'),pointer:getComputedStyle(a).pointerEvents,name:a.getAttribute('aria-label')})));
  for(const item of links){
   if(item.pointer==='none')throw Error('Game card has pointer-events:none: '+item.name);
   if(!item.href?.startsWith('/create/')&&!item.href?.startsWith('/games/'))throw Error('Invalid catalogue destination: '+item.href);
   const rel=decodeURIComponent(new URL(item.href,base).pathname).replace(/^\//,'');
   if(!fs.existsSync(path.join(root,rel,'index.html')))throw Error('Game link has no destination: '+item.href);
  }
  const open=async (href)=>{
   await page.goto(base+'/create/',{waitUntil:'domcontentloaded'});
   const link=page.locator(cardSelector+'[href="'+href+'"]').first();
   await link.click({timeout:15000});
   await page.waitForURL(url=>url.pathname===href||url.pathname===href+'/',{timeout:15000});
  };
  await open('/create/'+routes.get('melody-bounce'));
  await open('/create/'+routes.get('fold-groove'));
  await open('/games/orbit-notes');
  console.log('PASS catalogue: '+count+' valid and clickable game cards; tested 2 studios and 1 unavailable-game details link.');
 }finally{await page.close()}
}
async function main(){
 await new Promise((resolve,reject)=>{serve.once('error',reject);serve.listen(0,'127.0.0.1',resolve)});
 base='http://127.0.0.1:'+serve.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 await testCatalogue();
 if(process.env.GAME_CATALOGUE_ONLY==='1'){console.log('Catalogue-only click regression passed.');return;}
 let rows=audit.results.filter(r=>r.status==='bundled');
 const filter=new Set((process.env.GAME_FILTER||'').split(',').map(x=>x.trim()).filter(Boolean));
 if(filter.size)rows=rows.filter(r=>filter.has(r.game));
 if(!rows.length)throw Error('No games matched the browser smoke selection');
 // Four workers limit canvas/audio memory while covering every bundled game.
 let cursor=0;
 const workers=Math.max(1,Math.min(4,Number(process.env.GAME_WORKERS)||4));
 await Promise.all(Array.from({length:workers},async()=>{while(cursor<rows.length)await test(rows[cursor++])}));
 const report={createdAt:new Date().toISOString(),total:rows.length,passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='error').length,results:results.sort((a,b)=>a.game.localeCompare(b.game))};
 fs.writeFileSync(path.join(root,'browser-smoke-report.json'),JSON.stringify(report,null,2));
 console.log('Browser audit:',JSON.stringify({total:report.total,passed:report.passed,failed:report.failed}));
 if(report.failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{try{await browser?.close()}catch{}serve.close()});
