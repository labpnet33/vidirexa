'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve('public-preview');
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
const gameRoutes=new Map();
for(const a of manifest.assets||[]){
 const m=/^site\/create\/(index__q_[a-f0-9]+)\.html$/.exec(a.local||'');
 const g=/^https:\/\/vidirexa\.com\/create\?game=([a-z0-9-]+)$/.exec(a.url||'');
 if(m&&g)gameRoutes.set(g[1],m[1]);
}
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.wasm':'application/wasm'};
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const csp=config.headers.flatMap(x=>x.headers||[]).find(x=>x.key==='Content-Security-Policy')?.value;
const server=http.createServer((req,res)=>{
 let rel;
 try{rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
 const resolved=path.resolve(root,'.'+rel);
 if(resolved!==root&&!resolved.startsWith(root+path.sep)){res.writeHead(403).end();return}
 let file=resolved;
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html')}catch{}
 if(!fs.existsSync(file)){res.writeHead(404).end('File unavailable '+rel);return}
 if(csp)res.setHeader('Content-Security-Policy',csp);
 res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'application/octet-stream');
 res.setHeader('X-Content-Type-Options','nosniff');
 fs.createReadStream(file).pipe(res);
});
const report={createdAt:new Date().toISOString(),passed:[],failures:[]};
const widths=[320,375,390,430,768];
let browser,base;
async function metrics(page){
 return page.evaluate(()=>({
  innerWidth:window.innerWidth,
  documentWidth:document.documentElement.scrollWidth,
  bodyWidth:document.body.scrollWidth,
  widestElements:[...document.querySelectorAll('main,header,.page,.midnight-library,.game-choices,.game-grid,.game-tile-shell')].map(e=>({node:e.tagName.toLowerCase(),className:String(e.className||'').slice(0,50),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).filter(e=>e.right>window.innerWidth+8).slice(0,4)
 }));
}
function assertNoOverflow(m,label){
 if(m.documentWidth>m.innerWidth+8||m.bodyWidth>m.innerWidth+8)throw Error(label+' horizontal overflow: '+JSON.stringify(m));
}
async function run(label,fn){
 let page;
 try{
  const value=await fn();
  report.passed.push({test:label,...value});
  console.log('PASS mobile '+label+' '+JSON.stringify(value));
 }catch(error){
  const details=String(error?.message||error).slice(0,900);
  report.failures.push({test:label,error:details});
  console.error('FAIL mobile '+label+' '+details);
 }
}
async function newPage(width,height=844){
 return browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
}
async function checkPage(width,route,cardSelector){
 const page=await newPage(width);
 try{
  await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:20000});
  const m=await metrics(page);
  assertNoOverflow(m,route+' at '+width+'px');
  const anchors=await page.locator(cardSelector).count();
  if(anchors<1)throw Error('Game cards missing: '+cardSelector);
  const first=page.locator(cardSelector).first();
  const rect=await first.boundingBox();
  if(!rect||rect.width<75||rect.x< -10||rect.x+rect.width>width+10)throw Error('First game card clipped: '+JSON.stringify(rect));
  return {width,route,cards:anchors,scrollWidth:m.documentWidth,firstCardWidth:Math.round(rect.width)};
 }finally{await page.close()}
}
async function testTap(width,route,selector,targetTest){
 const page=await newPage(width);
 try{
  await page.goto(base+route,{waitUntil:'domcontentloaded'});
  const anchor=page.locator(selector).first();
  const href=await anchor.getAttribute('href');
  if(!href||!targetTest(href))throw Error('Invalid tappable link: '+href);
  await anchor.tap({timeout:20000});
  await page.waitForURL(url=>url.pathname===new URL(href,base).pathname,{timeout:20000});
  return {width,href,opened:true};
 }finally{await page.close()}
}
async function testStudio(width,game){
 const route=gameRoutes.get(game);
 if(!route)throw Error('Studio not found in manifest: '+game);
 const page=await newPage(width,840);
 try{
  await page.goto(base+'/create/'+route+'/index.html',{waitUntil:'domcontentloaded',timeout:25000});
  const frameElement=await page.waitForSelector('iframe[data-vidirexa-studio-frame]',{timeout:15000});
  const frame=await frameElement.contentFrame();
  if(!frame)throw Error('Recovered studio iframe unavailable');
  await frame.waitForFunction(()=>document.querySelector('#studio canvas')!==null,null,{timeout:35000});
  await frame.waitForTimeout(750);
  let outer=await metrics(page);
  assertNoOverflow(outer,game+' wrapper '+width);
  const inner=await frame.evaluate(()=>({
   viewport:innerWidth,
   documentWidth:document.documentElement.scrollWidth,
   bodyWidth:document.body.scrollWidth,
   canvasCount:document.querySelectorAll('#studio canvas').length,
   next:!!document.querySelector('#next'),
   buttons:document.querySelectorAll('#studio button').length,
   preview:document.querySelector('.v-phone canvas')?.getBoundingClientRect().toJSON()||null
  }));
  if(inner.documentWidth>inner.viewport+10)throw Error('Inner studio horizontal overflow '+JSON.stringify(inner));
  if(inner.canvasCount<1||inner.buttons<3||!inner.next)throw Error('Studio lacks functional UI '+JSON.stringify(inner));
  const iframeHeight=await frameElement.evaluate(el=>el.getBoundingClientRect().height);
  if(iframeHeight<900||iframeHeight>7500)throw Error('Unexpected responsive frame height '+iframeHeight);
  const step1=frame.locator('#studio [data-step="1"]').first();
  if(await step1.count())await step1.tap({timeout:15000});
  const step2=frame.locator('#studio [data-step="2"]').first();
  if(await step2.count())await step2.tap({timeout:15000});
  const next=frame.locator('#next');
  if(await next.count()){
   const b=await next.boundingBox();
   if(!b||b.width<44)throw Error('Mobile Next button is too narrow '+JSON.stringify(b));
  }
  return {width,game,canvasCount:inner.canvasCount,buttons:inner.buttons,frameHeight:Math.round(iframeHeight),innerWidth:inner.viewport,innerDocumentWidth:inner.documentWidth};
 }finally{await page.close()}
}
async function main(){
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of widths){
   for(const route of ['/', '/games/', '/create/']){
    const sel=route==='/games/'?'a[href^="/games/"]':'.game-tile-shell>a.game-choice';
    await run(width+'px '+route,()=>checkPage(width,route,sel));
   }
  }
  for(const width of [320,390]){
   await run('home touch navigation '+width,()=>testTap(width,'/','.game-tile-shell>a.game-choice',href=>href.startsWith('/create/')));
   await run('catalogue touch navigation '+width,()=>testTap(width,'/create/','.game-tile-shell>a.game-choice',href=>href.startsWith('/create/')));
   for(const game of ['chaos-cutter','melody-bounce','fold-groove'])await run('studio '+game+' '+width,()=>testStudio(width,game));
  }
 }finally{
  await browser?.close();
  server.close();
  const output=path.join(root,'mobile-browser-audit.json');
  fs.writeFileSync(output,JSON.stringify({...report,total:report.passed.length+report.failures.length},null,2));
  console.log('Mobile audit summary: '+JSON.stringify({passed:report.passed.length,failed:report.failures.length}));
  if(report.failures.length)process.exitCode=1;
 }
}
main().catch(err=>{console.error(err);server.close();process.exitCode=1});
