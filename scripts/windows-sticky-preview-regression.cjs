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
async function verifyAndroid(browser,base,game='shape-merger',width=390){
 const route=routes.get(game);assert(route,'No game route for Android test',game);
 const page=await browser.newPage({viewport:{width,height:844},userAgent:androidUA,isMobile:true,hasTouch:true,deviceScaleFactor:2});
 try{
  await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000});
  const handle=await page.waitForSelector('iframe[data-vidirexa-studio-frame]',{timeout:20000});
  const frame=await handle.contentFrame();assert(frame,'Android game studio iframe missing');
  await frame.waitForFunction(()=>!!document.querySelector('#studio canvas'),null,{timeout:35000});
  await page.waitForFunction(()=>document.documentElement.classList.contains('vidirexa-android-studio'),null,{timeout:15000});
  const outer=await page.evaluate(()=>{
   const frame=document.querySelector('iframe[data-vidirexa-studio-frame]');
   const box=frame.getBoundingClientRect();
   const toolbar=document.querySelector('.vidirexa-android-studio-toolbar');
   return {
    frame:{top:box.top,left:box.left,right:box.right,bottom:box.bottom,width:box.width,height:box.height},
    navCount:document.querySelectorAll('nav.mobile-bottom-nav').length,
    navVisible:!!document.querySelector('nav.mobile-bottom-nav:not([hidden])'),
    backHref:toolbar?.querySelector('a')?.getAttribute('href'),
    backRect:toolbar?.getBoundingClientRect().toJSON(),
    bodyOverflow:getComputedStyle(document.body).overflowY,
    htmlOverflow:getComputedStyle(document.documentElement).overflowY,
    framePosition:getComputedStyle(frame).position,
    parentScroll:window.scrollY
   };
  });
  assert(outer.navCount===0&&!outer.navVisible,'Home/Create bottom navigation still present',outer);
  assert(outer.backHref==='/create'&&outer.backRect?.height>=40,'Accessible back-to-games link missing',outer);
  assert(outer.framePosition==='fixed','Android game editor still scrolls with outer document',outer);
  assert(Math.abs(outer.frame.top-44)<3&&Math.abs(outer.frame.bottom-844)<4,'Studio does not fill the Android viewport',outer);
  assert(outer.frame.width>=width-2,'Game iframe does not fit the Android width',outer);
  const initial=await frame.evaluate(()=>({windowsStyle:document.documentElement.classList.contains('vidirexa-windows-desktop'),previewPosition:getComputedStyle(document.querySelector('.v-preview')).position}));
  assert(!initial.windowsStyle&&initial.previewPosition==='static','Android studio inherited Windows-only layout',initial);
  await frame.locator('#studio [data-step="1"]').first().tap({timeout:20000});
  await frame.waitForTimeout(350);
  await page.evaluate(()=>window.scrollTo(0,1100));
  const outerY=await page.evaluate(()=>scrollY);
  assert(outerY===0,'Android outer page scrolled and displaced the preview',{outerY});
  const full=await frame.evaluate(()=>({content:document.documentElement.scrollHeight,view:innerHeight}));
  assert(full.content>full.view+350,'Settings form should scroll inside full-screen studio',full);
  await frame.evaluate(()=>window.scrollTo({top:Math.min(1300,document.documentElement.scrollHeight-innerHeight-180),behavior:'instant'}));
  await frame.waitForTimeout(600);
  const float=await frame.evaluate(()=>{
   const phone=document.querySelector('.v-phone');
   const canvas=phone?.querySelector('canvas');
   const bar=phone?.querySelector('.v-mini-bar');
   const tab=document.querySelector('.v-mini-tab');
   return {
    scroll:scrollY,innerWidth,innerHeight,
    floating:phone?.classList.contains('v-float'),
    minimized:phone?.classList.contains('v-mini-collapsed'),
    phone:phone?.getBoundingClientRect().toJSON(),
    canvas:canvas?.getBoundingClientRect().toJSON(),
    controls:bar?.getBoundingClientRect().toJSON(),
    restore:tab&&!tab.hidden
   };
  });
  assert(float.scroll>350,'The Android game settings did not scroll',float);
  assert(float.floating||float.restore,'No persistent Android mini-preview after scrolling',float);
  if(float.floating&&!float.minimized){
   assert(float.canvas&&float.canvas.top>=-3&&float.canvas.bottom<=float.innerHeight+3,'Floating preview is clipped after scrolling',float);
   assert(float.phone&&float.phone.left>=-3&&float.phone.right<=float.innerWidth+3,'Floating preview is outside Android screen',float);
  }
  // Simulate a failed native floating position. The Android fallback must pin
  // the SAME canvas instead of leaving the preview above the viewport.
  const guardLoaded=await frame.evaluate(()=>!!document.querySelector('script[src*="android-preview-guard.mjs"]'));
  assert(guardLoaded,'Android preview fallback was not bundled into the iframe');
  await frame.evaluate(()=>{
    const phone=document.querySelector('.v-phone');
    if(!phone)throw Error('Live preview phone missing');
    phone.style.transform='translate3d(0,-2400px,0)';
  });
  await frame.waitForFunction(()=>{
    const phone=document.querySelector('.v-phone');
    const canvas=phone?.querySelector('canvas');
    if(!phone?.classList.contains('v-android-preview-guard')||!canvas)return false;
    const box=canvas.getBoundingClientRect();
    return box.top>=-3&&box.bottom<=innerHeight+3;
  },null,{timeout:5500});
  const guard=await frame.evaluate(()=>{
    const canvas=document.querySelector('.v-phone canvas');
    const phone=document.querySelector('.v-phone');
    return {canvasCount:document.querySelectorAll('#studio canvas').length,guard:phone.classList.contains('v-android-preview-guard'),top:canvas.getBoundingClientRect().top,bottom:canvas.getBoundingClientRect().bottom};
  });
  assert(guard.canvasCount>=1&&guard.guard,'Android fallback did not show the original live canvas',guard);
  await frame.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await frame.waitForFunction(()=>!document.querySelector('.v-phone')?.classList.contains('v-android-preview-guard'),null,{timeout:5000});
  return {game,width,frameHeight:Math.round(outer.frame.height),navCount:outer.navCount,outerScroll:outerY,settingsScroll:Math.round(float.scroll),floating:float.floating,previewTop:Math.round(float.canvas?.top??-1),previewBottom:Math.round(float.canvas?.bottom??-1),fallbackPinned:guard.guard,fallbackCanvasTop:Math.round(guard.top)};
 }finally{await page.close()}
}
async function verifyAndroidCatalogueNav(browser,base){
 const page=await browser.newPage({viewport:{width:390,height:844},userAgent:androidUA,isMobile:true,hasTouch:true});
 try{
  await page.goto(base+'/create/',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>document.documentElement.classList.contains('vidirexa-android'),null,{timeout:15000});
  const state=await page.evaluate(()=>({bottomNav:document.querySelectorAll('nav.mobile-bottom-nav').length,gameLinks:document.querySelectorAll('.game-tile-shell>a.game-choice').length}));
  assert(state.bottomNav===0,'Android Create catalogue still has the Home/Create bar',state);
  assert(state.gameLinks===68,'Removing Android bar damaged native game cards',state);
  return state;
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
   ['Android Shape Merger persistent preview 390x844',()=>verifyAndroid(browser,base,'shape-merger',390)],
   ['Android Shape Merger narrow preview 360x844',()=>verifyAndroid(browser,base,'shape-merger',360)],
   ['Android Crush Machine persistent preview 390x844',()=>verifyAndroid(browser,base,'crush-machine',390)],
   ['Android Create catalogue removes bottom bar',()=>verifyAndroidCatalogueNav(browser,base)]
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
