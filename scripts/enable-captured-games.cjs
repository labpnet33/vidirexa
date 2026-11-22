'use strict';
// Archive recovery: embed captured, self-contained game clients. No new simulations.
// Run after build-public-preview.cjs to keep the original read-only catalogue intact.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve('.');
const out=path.join(root,'public-preview');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const host='vireel-games-production.up.railway.app';
const gameRoute=new Map();
for(const item of manifest.assets||[]){
 const m=/^site\/create\/(index__q_[a-f0-9]+)\.html$/.exec(item.local||'');
 const g=/^https:\/\/vidirexa\.com\/create\?game=([a-z0-9-]+)$/.exec(item.url||'');
 if(m&&g)gameRoute.set(g[1],m[1]);
}
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const required=['index.html','studio.mjs','shared/studio.mjs','shared/deployment.mjs','shared/studio.css','shared/capture.mjs'];
const audit=[];
const disabled=[];
function iframeFor(title,url){
 const dir=url.replace(/\/index\.html$/,'');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><link rel="stylesheet" href="'+dir+'/shared/studio.css"><style>html,body{margin:0;background:#0b1018;color:#e2e8f0;font:14px/1.5 system-ui}#runtime-status{margin:20px auto;max-width:720px;padding:12px 16px;border:1px solid #374b64;border-radius:10px}#runtime-status[data-error="true"]{border-color:#fb7185;color:#ffe4e6}#runtime-status a{color:#93c5fd}</style></head><body><div id="studio"></div><div id="runtime-status" role="status">Loading '+escape(title)+'…</div><script type="module" src="'+dir+'/bootstrap.mjs"></script></body></html>';
 return '<iframe title="'+escape(title)+' studio" srcdoc="'+escape(html)+'" sandbox="allow-scripts allow-same-origin allow-downloads" allow="autoplay" referrerpolicy="no-referrer" loading="eager" style="display:block;width:100%;height:1650px;border:0;border-radius:12px"></iframe>';
}
function moduleImports(file,baseDir){
 const content=fs.readFileSync(file,'utf8');
 let imports=[],match;
 const patterns=[
  /\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g,
  /\bimport\s*["'](\.{1,2}\/[^"']+)["']/g,
  /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g
 ];
 for(const re of patterns)while((match=re.exec(content))!==null){
  const relative=match[1].split(/[?#]/)[0];
  const resolved=path.resolve(path.dirname(file),relative);
  if(!fs.existsSync(resolved)&&!relative.endsWith('/encode-mp4.mjs'))imports.push(path.relative(baseDir,file)+' => '+relative);
 }
 return imports;
}
function missingImports(baseDir){
 const missing=[];
 function walk(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
   const p=path.join(dir,item.name);
   if(item.isDirectory())walk(p);
   else if(item.isFile()&&/\.(mjs|js)$/.test(item.name))missing.push(...moduleImports(p,baseDir));
  }
 }
 walk(baseDir);
 return [...new Set(missing)];
}
function bootScript(title,url){
 const base=url.replace(/\/index\.html$/,'');
 const lines=[
  'const status=document.getElementById("runtime-status");',
  'const root=document.getElementById("studio");',
  'const fail=(e)=>{status.dataset.error="true";status.replaceChildren();const p=document.createElement("p");p.textContent="Could not start '+title.replace(/"/g,'')+': "+String(e?.message??e??"Unknown error").slice(0,450);const a=document.createElement("a");a.href="'+base+'/index.html";a.textContent="Try the captured engine directly";a.target="_top";status.append(p,a);};',
  'window.addEventListener("error",e=>fail(e.error||e.message));',
  'window.addEventListener("unhandledrejection",e=>fail(e.reason));',
  'try{await import("./studio.mjs");if(root.childElementCount>0){status.remove()}else{fail("Studio script loaded but no interface was mounted.")}}catch(e){fail(e)}'
 ];
 return lines.join('\n')+'\n';
}
for(const [game,route] of gameRoute){
 const source=path.join(root,'site/create',route+'.html');
 const published=path.join(out,'create',route,'index.html');
 const row={game,route:'/create?game='+game,status:'unavailable',reason:'',missing:[]};
 try{
  if(!fs.existsSync(source)||!fs.existsSync(published)){row.reason='Missing captured studio page';audit.push(row);disabled.push(game);continue;}
  const original=fs.readFileSync(source,'utf8');
  const iframe=original.match(/<iframe\b[^>]*\bsrc=(["'])(https:\/\/vireel-games-production\.up\.railway\.app\/packages\/[^"']+\/index\.html)\1/i);
  if(!iframe){row.reason='No captured game iframe';audit.push(row);disabled.push(game);continue;}
  const runtime=new URL(iframe[2]);
  if(runtime.hostname!==host||!runtime.pathname.startsWith('/packages/'+game+'/')){row.reason='Unexpected captured package';audit.push(row);disabled.push(game);continue;}
  const baseDir=path.join(root,'vidirexa',host,runtime.pathname.slice(1).replace(/\/index\.html$/,''));
  const missing=required.filter(rel=>!fs.existsSync(path.join(baseDir,rel)));
  if(!missing.length&&fs.readFileSync(path.join(baseDir,'index.html'),'utf8').startsWith('No Content:'))missing.push('engine HTML is No Content');
  if(missing.length){row.reason='Incomplete captured engine';row.missing=missing;audit.push(row);disabled.push(game);continue;}
  const deployment=fs.readFileSync(path.join(baseDir,'shared/deployment.mjs'),'utf8');
  if(!deployment.includes('mode:"production"')&&!deployment.includes('mode:"local"')){row.reason='Unknown local mode switch';audit.push(row);disabled.push(game);continue;}
  const missingStatic=missingImports(baseDir);
  row.missing=missingStatic;
  if(missingStatic.length){row.reason='Unresolved static imports';audit.push(row);disabled.push(game);continue;}
  const target=path.join(out,runtime.pathname.slice(1).replace(/\/index\.html$/,''));
  fs.cpSync(baseDir,target,{recursive:true});
  const dep=path.join(target,'shared/deployment.mjs');
  const depContent=fs.readFileSync(dep,'utf8');
  if(depContent.includes('mode:"production"'))fs.writeFileSync(dep,depContent.replace('mode:"production"','mode:"local"'));
  fs.writeFileSync(path.join(target,'bootstrap.mjs'),bootScript(game,runtime.pathname));
  let html=fs.readFileSync(published,'utf8');
  // The base archive strips scripts and iframes and has a safe static catalogue.
  // Remove its placeholder, and introduce the original engine inside the existing workspace.
  html=html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,'');
  html=html.replace(/<section role="note" style="padding:16px;text-align:center"><strong>Game-specific studio snapshot<\/strong>[\s\S]*?<\/section>/g,'');
  html=html.replace(/<div class="premium-access-notice tier-access-notice">[\s\S]*?<\/button><\/div>/g,'');
  html=html.replace(/Connecting your studio\.\.\.|Archived studio — live engine unavailable|Connecting studio|Studio connected/g,'Local captured studio');
  html=html.replace(/0\/3 used/g,'Browser local').replace(/3 of 3 slots left · refills continuously/g,'No cloud quota');
  html=html.replace(/<p class="guest-free-note">[\s\S]*?<\/p>/g,'');
  html=html.replace(/<button\b[^>]*class="free-cap-help-btn"[^>]*>[\s\S]*?<\/button>/g,'');
  html=html.replace(/<button\b[^>]*class="button outline published-recordings-link"[^>]*>[\s\S]*?<\/button>/g,'');
  html=html.replace(/Record first, then sign up free to download your video\. No payment, no card needed\./g,'Browser-local recording only; cloud storage and original subscription services are not connected.');
  html=html.replace(/Settings, audio and recording are available inside the game workspace\./g,'Local simulation and playback use the captured game engine; browser recording depends on device support.');
  html=html.replace(/<div role="note" style="position:relative;z-index:2147483647;[^>]*>[\s\S]*?<\/div>/,'<div role="note" style="padding:10px 16px;text-align:center;background:#172554;color:white;font:13px system-ui">Recovered game workspace · runs locally in this browser · original cloud services are not connected.</div>');
  html=html.replace('</head>','<style>.free-cap-studio{display:none!important}</style></head>');
  const title=game.split('-').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' ');
  const frame=iframeFor(title,runtime.pathname);
  const note='<p role="status" style="margin:12px 0;color:#93c5fd;font:13px/1.5 system-ui">Local captured engine · customizable preview · browser recording where supported</p>';
  const anchor=/<\/div><aside class="published-studio-details"/;
  if(!anchor.test(html))throw Error('Studio page layout cannot embed the game');
  html=html.replace(anchor,note+frame+'</div><aside class="published-studio-details"');
  if(!html.includes('srcdoc=')||html.includes('Unlock with Creator'))throw Error('Captured studio replacement failed');
  fs.writeFileSync(published,html);
  row.status='bundled';row.reason='Static engine captured; browser playback not yet tested';
  row.runtime=runtime.pathname;row.moduleFiles=fs.readdirSync(baseDir,{recursive:true}).filter(x=>/\.(mjs|js)$/.test(x)).length;
  audit.push(row);
 }catch(e){row.status='error';row.reason=String(e.message||e);audit.push(row);disabled.push(game);}
}
fs.writeFileSync(path.join(out,'captured-game-audit.json'),JSON.stringify({generatedAt:new Date().toISOString(),total:gameRoute.size,results:audit},null,2));
const summary={total:gameRoute.size,bundled:audit.filter(x=>x.status==='bundled').length,unavailable:audit.filter(x=>x.status==='unavailable').length,errors:audit.filter(x=>x.status==='error').length,disabled};
console.log('Recovered game audit:',JSON.stringify(summary));
if(summary.bundled<60)throw Error('Too few complete captured engines: '+JSON.stringify(summary));
