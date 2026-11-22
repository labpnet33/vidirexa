'use strict';
// Regression for a Windows-specific fixed preview when scrolling long settings.
// This must not change Android sizing or the mobile iframe auto-expansion.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve('public-preview');
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
const routes=new Map();
for(const item of manifest.assets||[]){
 const match=item.url?.match(/^https:\/\/vidirexa\.com\/create\?game=([a-z0-9-]+)$/);
 const file=item.local?.match(/^site\/create\/(index__q_[a-f0-9]+)\.html$/);
 if(match&&file)routes.set(match[1],'/create/'+file[1]+'/index.html');
}
const headers=JSON.parse(fs.readFileSync('vercel.json','utf8')).headers.flatMap(x=>x.headers||[]);
const csp=headers.find(x=>x.key==='Content-Security-Policy')?.value;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 let target;
 try{target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname))}catch{res.writeHead(400).end();return}
 if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{if(fs.statSync(target).isDirectory())target=path.join(target,'index.html')}catch{}
 if(!fs.existsSync(target)){res.writeHead(404).end();return}
 res.setHeader('Content-Type',mime[path.extname(target).toLowerCase()]||'application/octet-stream');
 if(csp)res.setHeader('Content-Security-Policy',csp);
 fs.createReadStream(target).pipe(res);
});
const windowsUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const androidUA='Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const report={started:new Date().toISOString(),checks:[],failures:[]};
function assert(value,label,details){if(!value)throw Error(label+(details?' '+JSON.stringify(details):''))}
async function verifyWindows(browser,base,game,viewport){
 const route=routes.get(game);assert(route,'Missing captured game',game);
 const page=await browser.newPage({viewport,userAgent:windowsUA,hasTouch:false,isMobile:false});
 try{
  await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000});
  const handle=await page.waitForSelector('iframe[data-vidirexa-studio-frame]',{timeout:20000});
  const frame=await handle.contentFrame();assert(frame,'No studio frame');
  await frame.waitForFunction(()=>!!document.querySelector('#studio canvas'),null,{timeout:35000});
  const initial=await handle.evaluate(el=>({height:el.getBoundingClientRect().height,setting:el.style.getPropertyValue('--vidirexa-frame-height')}));
  assert(initial.setting.includes('100dvh'),'Windows desktop iframe viewport sizing missing',initial);
  assert(initial.height<viewport.height+30&&initial.height>=550,'Windows studio iframe height outside browser window',initial);
  const mode=await frame.evaluate(()=>({active:document.documentElement.classList.contains('vidirexa-windows-desktop'),sticky:getComputedStyle(document.querySelector('.v-preview')).position,scrolling:document.documentElement.scrollHeight}));
  assert(mode.active&&mode.sticky==='sticky','Windows desktop sticky preview not active',mode);
  await frame.locator('#studio [data-step="1"]').first().click({timeout:20000});
  await frame.waitForTimeout(450);
  const before=await frame.evaluate(()=>({
   viewport:window.innerHeight,
   content:document.documentElement.scrollHeight,
   workspace:document.querySelector('.v-workspace')?.getBoundingClientRect().toJSON(),
   preview:document.querySelector('.v-preview')?.getBoundingClientRect().toJSON()
  }));
  assert(before.content>before.viewport+350,'Customize panel must scroll inside iframe',before);
  await frame.evaluate(()=>{
   const workspace=document.querySelector('.v-workspace');
   window.scrollTo(0,window.scrollY+workspace.getBoundingClientRect().top+330);
  });
  await frame.waitForTimeout(180);
  const after=await frame.evaluate(()=>{
   const preview=document.querySelector('.v-preview');
   const canvas=document.querySelector('.v-phone canvas');
   return {
    scroll:window.scrollY,
    viewport:innerHeight,
    preview:preview.getBoundingClientRect().toJSON(),
    canvas:canvas.getBoundingClientRect().toJSON(),
    workspace:document.querySelector('.v-workspace').getBoundingClientRect().toJSON(),
    position:getComputedStyle(preview).position
   };
  });
  assert(after.scroll>120,'Test did not actually scroll the editor',after);
  assert(after.position==='sticky'&&after.preview.top>=-2&&after.preview.top<=35,'Preview scrolled off top of screen',after);
  assert(after.canvas.top>=0&&after.canvas.bottom<=after.viewport+3,'Video canvas clipped after Windows scroll',after);
  assert(after.preview.bottom<=after.viewport+5,'Preview controls clipped after Windows scroll',after);
  return {game,viewport:viewport.width+'x'+viewport.height,iframeHeight:Math.round(initial.height),scrolled:Math.round(after.scroll),previewTop:Math.round(after.preview.top),canvasBottom:Math.round(after.canvas.bottom),previewBottom:Math.round(after.preview.bottom)};
 }finally{await page.close()}
}
async function verifyAndroid(browser,base){
 const game='shape-merger',route=routes.get(game);
 const page=await browser.newPage({viewport:{width:390,height:844},userAgent:androidUA,isMobile:true,hasTouch:true,deviceScaleFactor:2});
 try{
  await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000});
  const handle=await page.waitForSelector('iframe[data-vidirexa-studio-frame]',{timeout:18000});
  const frame=await handle.contentFrame();assert(frame,'Android studio missing');
  await frame.waitForFunction(()=>!!document.querySelector('#studio canvas'),null,{timeout:35000});
  const state=await handle.evaluate(el=>({windowStyle:el.style.getPropertyValue('--vidirexa-frame-height'),height:el.getBoundingClientRect().height}));
  const child=await frame.evaluate(()=>({classAdded:document.documentElement.classList.contains('vidirexa-windows-desktop'),previewPosition:getComputedStyle(document.querySelector('.v-preview')).position}));
  assert(!state.windowStyle.includes('100dvh'),'Windows viewport fix accidentally applied to Android',state);
  assert(!child.classAdded&&child.previewPosition==='static','Android preview layout changed',child);
  await frame.locator('#studio [data-step="1"]').first().tap({timeout:20000});
  await frame.waitForTimeout(450);
  const expanded=await handle.evaluate(el=>el.getBoundingClientRect().height);
  const full=await frame.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight));
  assert(expanded>=full-35,'Android existing auto-expanded frame is clipped',{expanded,full});
  return {game,viewport:'390x844',windowsClass:false,position:child.previewPosition,autoExpanded:Math.round(expanded),contentHeight:Math.round(full)};
 }finally{await page.close()}
}
async function main(){
 await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const [type,fn] of [
   ['Windows Shape Merger 1280x900',()=>verifyWindows(browser,base,'shape-merger',{width:1280,height:900})],
   ['Windows Shape Merger 1366x768',()=>verifyWindows(browser,base,'shape-merger',{width:1366,height:768})],
   ['Windows Crush Machine 1280x900',()=>verifyWindows(browser,base,'crush-machine',{width:1280,height:900})],
   ['Android unchanged 390x844',()=>verifyAndroid(browser,base)]
  ]){
   try{const details=await fn();report.checks.push({type,details});console.log('PASS Windows preview '+type+' '+JSON.stringify(details))}
   catch(err){report.failures.push({type,error:String(err.message||err).slice(0,1800)});console.error('FAIL Windows preview '+type+' '+String(err.message||err).slice(0,1800))}
  }
 }finally{
  await browser.close();server.close();
  fs.writeFileSync(path.join(root,'windows-studio-preview-report.json'),JSON.stringify(report,null,2));
 }
 console.log('Windows preview regression summary: '+JSON.stringify({passed:report.checks.length,failed:report.failures.length}));
 if(report.failures.length)process.exitCode=1;
}
main().catch(err=>{console.error(err);server.close();process.exitCode=1});
