'use strict';
const fs=require('node:fs'), path=require('node:path');
const root=path.resolve('site'),out=path.resolve('public-preview');
if(!fs.existsSync(path.join(root,'index.html')))throw Error('Missing site/index.html');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const pages=new Map(),assets=new Set(),ext=/\.(css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|mp4|webm|ogg|wav|mp3)$/i;
const excluded=/^(account|login|signin|admin|checkout|payment|billing|recordings|notifications|messages|oauth|auth)(\/|$)/i;
function walk(dir,rel=''){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const name=rel?rel+'/'+d.name:d.name,p=path.join(dir,d.name);if(d.isDirectory())walk(p,name);else if(d.isFile()){if((name==='index.html'||/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/index\.html$/.test(name))&&!excluded.test(name)){pages.set('/'+name.replace(/(?:\/)?index\.html$/,'').replace(/\/$/,''),p)}else if(ext.test(name)&&!/^email-assets\//.test(name)&&!excluded.test(name)){const b=fs.readFileSync(p);if(!(b.length<200&&b.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')))assets.add(name)}}}}walk(root);
const map=new Map();
if(fs.existsSync('manifest.json')){for(const r of JSON.parse(fs.readFileSync('manifest.json','utf8')).assets||[]){if(typeof r.local==='string'&&r.local.startsWith('site/')&&assets.has(r.local.slice(5))&&typeof r.url==='string'){try{map.set(new URL(r.url).href,r.local.slice(5))}catch{}}}}
// Restore existing captured game-specific studio snapshots, not live engines.
const studioRoutes=new Map();
// Reuse the captured Fold Groove game, not a substitute simulation.
const foldHash='f04d2a37dcc6ea1b83f025f8b6de23e6cadb89dfa22df964abf21a353f64acf1';
const foldRuntime='/packages/fold-groove/0.1.4/'+foldHash+'/index.html';
const foldSource=path.resolve('vidirexa/vireel-games-production.up.railway.app'+foldRuntime.replace(/\/index\.html$/,''));
// Original captured Melody Bounce package, retained on the same /create?game=melody-bounce route.
const melodyHash='1ab576aaa94386e60235137b6b701bb7455d7fffc609f03c00c73a7dc949cea8';
const melodyRuntime='/packages/melody-bounce/0.1.18/'+melodyHash+'/index.html';
const melodySource=path.resolve('vidirexa/vireel-games-production.up.railway.app'+melodyRuntime.replace(/\/index\.html$/,''));

for(const r of (fs.existsSync('manifest.json')?JSON.parse(fs.readFileSync('manifest.json','utf8')).assets||[]:[])){
 const m=/^site\/create\/(index__q_[a-f0-9]+)\.html$/.exec(r.local||'');
 const g=/^https:\/\/vidirexa\.com\/create\?game=([a-z0-9-]+)$/.exec(r.url||'');
 if(!m||!g)continue;
 const file=path.resolve(r.local);
 if(!fs.existsSync(file))continue;
 const route='/create/'+m[1];
 pages.set(route,file);studioRoutes.set(g[1],route);
}
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function embeddedStudio(title,runtime){
 const base=runtime.replace(/\/index\.html$/,'');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><link rel="stylesheet" href="'+base+'/shared/studio.css"><style>html,body{margin:0;background:#0b1018;color:#dbeafe;font:14px/1.5 system-ui}#runtime-status{max-width:700px;margin:25px auto;padding:16px 20px;border:1px solid #3b556b;border-radius:10px;color:#e0f2fe}#runtime-status a{color:#93c5fd}#runtime-status[data-error="true"]{border-color:#ff6380;color:#ffe4e6}</style></head><body><div id="studio"></div><div id="runtime-status" role="status">Loading the captured '+esc(title)+' engine…</div><script type="module" src="'+base+'/bootstrap.mjs"></script></body></html>';
 return '<iframe title="'+esc(title)+' local studio" srcdoc="'+esc(html)+'" sandbox="allow-scripts allow-same-origin allow-downloads" allow="autoplay" referrerpolicy="no-referrer" loading="eager" style="display:block;width:100%;height:1650px;border:0;border-radius:12px"></iframe>';
}

const label='<div role="note" style="position:relative;z-index:2147483647;background:#172554;color:#fff;padding:14px 18px;font:600 14px/1.5 system-ui;text-align:center">Guest browsing — no account required. Read-only website archive, not the original service. <a href="/" style="color:#c7e8ff">Home</a> · <a href="/games" style="color:#c7e8ff">Games</a> · <a href="/create" style="color:#c7e8ff">Create catalogue</a> · <a href="/guides" style="color:#c7e8ff">Guides</a> · <a href="/pricing" style="color:#c7e8ff">Archived pricing</a>. Original account, checkout and simulation services are unavailable.</div>';
function resolve(raw,route){try{return new URL(raw.replace(/&amp;/g,'&'),'https://vidirexa.com'+route)}catch{return null}}
function asset(raw,route){if(/^data:image\//i.test(raw))return raw;const u=resolve(raw,route);if(!u)return null;if(map.has(u.href))return '/'+map.get(u.href);if(u.origin==='https://vidirexa.com'&&assets.has(u.pathname.slice(1)))return u.pathname;return null}
function link(raw,route){if(raw.startsWith('#'))return raw;const u=resolve(raw,route);if(!u||u.origin!=='https://vidirexa.com')return null;const p=u.pathname.replace(/\/index\.html$/,'/').replace(/\/$/,'')||'/';if(p==='/create'&&u.searchParams.has('game')){const game=u.searchParams.get('game');if(studioRoutes.has(game))return studioRoutes.get(game)+u.hash;return null}if(pages.has(p))return p+u.hash;return asset(raw,route)}
function put(file,content){const p=path.join(out,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content)}
for(const [route,src] of pages){let h=fs.readFileSync(src,'utf8');const base=route.startsWith('/create/index__q_')?'/create/':route==='/'?'/':route+'/';
h=h.replace(/<section\b[^>]*\bclass="fc-timer[^"]*"[^>]*>[\s\S]*?<\/section>/gi,'')
 .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<script\b[^>]*>/gi,'')
.replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(iframe|object|embed|form|base)\b[^>]*>/gi,'')
.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'')
.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi,'')
.replace(/<link\b[^>]*\brel\s*=\s*["'](?:preconnect|preload|modulepreload|dns-prefetch|prefetch|canonical)["'][^>]*>/gi,'')
.replace(/<a\b[^>]*\bhref\s*=\s*(["'])(?:https:\/\/vidirexa\.com)?\/(?:account|login|signin|signup|recordings)(?:[/?#][^"']*)?\1[^>]*>[\s\S]*?<\/a\s*>/gi,'')
.replace(/<a\b[^>]*>/gi,t=>t.replace(/\s+href\s*=\s*(["'])(.*?)\1/gi,(_,q,v)=>{const dest=link(v,base);return dest?' href="'+esc(dest)+'"':' aria-disabled="true"'}))
.replace(/<(img|source|video|audio)\b[^>]*>/gi,t=>t.replace(/\s+(src|poster)\s*=\s*(["'])(.*?)\2/gi,(_,attr,q,v)=>{const dest=asset(v,base);return dest?' '+attr+'="'+esc(dest)+'"':''}).replace(/\s+srcset\s*=\s*(["'])(.*?)\1/gi,''))
.replace(/<link\b[^>]*>/gi,t=>t.replace(/\s+href\s*=\s*(["'])(.*?)\1/gi,(_,q,v)=>{const dest=asset(v,base);return dest?' href="'+esc(dest)+'"':''}))
.replace(/<title>([\s\S]*?)<\/title>/i,'<title>Archived preview — $1</title>')
.replace(/<\/head>/i,'<style>.analytics-consent-banner,.support-widget,.sale-banner{display:none!important}a[aria-disabled=true],button,input,select,textarea{pointer-events:none!important;cursor:default!important}body{padding-bottom:0!important}</style></head>')
.replace(/<body\b[^>]*>/i,m=>m+label);
if(route.startsWith('/create/index__q_')){
 if(route===studioRoutes.get('melody-bounce')){
  const frame=embeddedStudio('Melody Bounce',melodyRuntime);
  // The captured premium notice belongs to the original hosted service, not this local workspace.
  const notice=/<div class="premium-access-notice tier-access-notice">[\s\S]*?<\/button><\/div>/;
  if(!notice.test(h))throw Error('Missing captured Melody Bounce premium notice');
  h=h.replace(notice,frame)
   .replace(/Studio connected/g,'Local browser engine')
   .replace(/Record first, then sign up free to download your video\. No payment, no card needed\./g,'Make a browser-local recording and download it on this device. Cloud storage is not connected.')
   .replace(/Settings, audio and recording are available inside the game workspace\./g,'Use the captured Melody Bounce editor for song selection, MIDI files, previews and browser-local recording.')
   .replace(/<button\b[^>]*class="button outline published-recordings-link"[^>]*>[\s\S]*?<\/button>/g,'')
   .replace(label,'<div role="note" style="position:relative;z-index:2147483647;background:#172554;color:#fff;padding:14px 18px;font:600 14px/1.5 system-ui;text-align:center">Captured Melody Bounce engine running locally in the browser. Original account, quota, cloud-storage and hosted recording services are not connected. <a href="/create" style="color:#c7e8ff">Back to games</a></div>');
  if(!h.includes(frame)||h.includes('Unlock with Creator'))throw Error('Melody Bounce did not convert to the local studio');
 }else if(route===studioRoutes.get('fold-groove')){
  const frame=embeddedStudio('Fold Groove',foldRuntime);
  h=h.replace(/(<span class="studio-connecting-text">)[\s\S]*?(<\/span><\/div>)/,(_,open,close)=>open+'Original Fold Groove engine · local browser mode'+close+frame);
  if(!h.includes(frame))throw Error('Unable to attach captured Fold Groove runtime');
  h=h.replace(/Connecting studio/g,'Local browser engine')
   .replace(/Record first, then sign up free to download your video\. No payment, no card needed\./g,'Record locally and download in your browser. Cloud storage and account services are not connected.')
   .replace(/sign up after recording to download your video\. No payment, no card needed\./g,'record in your browser; no sign-up or cloud storage is connected.')
   .replace(/Settings, audio and recording are available inside the game workspace\./g,'The captured settings, sound, preview and browser recording are available in the workspace.')
   .replace(/0\/3 used/g,'Local mode')
   .replace(/3 of 3 slots left · refills continuously/g,'Browser-only · no cloud quota')
   .replace(/<button\b[^>]*class="free-cap-help-btn"[^>]*>[\s\S]*?<\/button>/g,'')
   .replace(/<button\b[^>]*class="button outline published-recordings-link"[^>]*>[\s\S]*?<\/button>/g,'')
   .replace(label,'<div role="note" style="position:relative;z-index:2147483647;background:#172554;color:#fff;padding:14px 18px;font:600 14px/1.5 system-ui;text-align:center">Captured Fold Groove engine running in browser-local mode. Account, quota and cloud-recording services are not connected. <a href="/create" style="color:#c7e8ff">Back to games</a></div>');
 }else{
  h=h.replace(/Connecting your studio\.\.\.|Connecting studio/g,'Archived studio — live engine unavailable')
  .replace(/Record first, then sign up free to download your video\. No payment, no card needed\./g,'Recording and export are not available in this read-only snapshot.')
  .replace(label,label+'<section role="note" style="padding:16px;text-align:center"><strong>Game-specific studio snapshot</strong><p>This is the archived interface only. No live engine or recording service is connected.</p><a href="/create">Back to game catalogue</a></section>');
 }
}
h=h.replace(/<\/head>/i,'<link rel="stylesheet" href="/assets/vidirexa-mobile.css"></head>');
h=h.replace(/<\/body>/i,'<script type="module" src="/assets/vidirexa-android-nav.mjs"></script></body>');
put(route==='/'?'index.html':route.slice(1)+'/index.html',h)}
for(const rel of assets){const b=fs.readFileSync(path.join(root,rel));if(rel.endsWith('.css')){const css=b.toString('utf8').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(m,q,v)=>{if(v.startsWith('data:')||v.startsWith('#'))return m;const u=asset(v,'/'+rel);return u?'url("'+u.replace(/"/g,'%22')+'")':'url("data:,")'});put(rel,css)}else put(rel,b)}
// Serve captured Fold Groove files at a same-origin URL for browser-local use.
// The original production host requires an unavailable session/backend.
if(studioRoutes.has('fold-groove')){
 for(const rel of ['index.html','studio.mjs','shared/studio.mjs','shared/deployment.mjs']){
  if(!fs.existsSync(path.join(foldSource,rel)))throw Error('Missing captured Fold Groove file: '+rel);
 }
 const dest=path.join(out,foldRuntime.slice(1).replace(/\/index\.html$/,''));
 fs.cpSync(foldSource,dest,{recursive:true,filter:f=>fs.statSync(f).isDirectory()||/\.(?:mjs|css|html)$/i.test(f)});
 const dep=path.join(dest,'shared/deployment.mjs'),config=fs.readFileSync(dep,'utf8');
 if(!config.includes('mode:"production"'))throw Error('Unexpected Fold Groove deployment metadata');
 fs.writeFileSync(dep,config.replace('mode:"production"','mode:"local"'));
 console.log('Bundled captured Fold Groove engine (browser-local mode).');
}
// Bundle the captured Melody Bounce engine with its public-domain song library
// and custom MIDI parser. Browser-local mode disables unavailable hosted account flows.
if(studioRoutes.has('melody-bounce')){
 for(const rel of ['index.html','studio.mjs','adapter.mjs','core.mjs','midi.mjs','songs.mjs','shared/studio.mjs','shared/deployment.mjs']){
  if(!fs.existsSync(path.join(melodySource,rel)))throw Error('Missing captured Melody Bounce file: '+rel);
 }
 const dest=path.join(out,melodyRuntime.slice(1).replace(/\/index\.html$/,''));
 fs.cpSync(melodySource,dest,{recursive:true,filter:f=>fs.statSync(f).isDirectory()||/\.(?:mjs|css|html)$/i.test(f)});
 const dep=path.join(dest,'shared/deployment.mjs'),config=fs.readFileSync(dep,'utf8');
 if(!config.includes('mode:"production"'))throw Error('Unexpected Melody Bounce deployment metadata');
 fs.writeFileSync(dep,config.replace('mode:"production"','mode:"local"'));
 console.log('Bundled captured Melody Bounce engine (browser-local mode).');
}
// An external module bootstrap (allowed by CSP) reports engine import/mount errors
// instead of leaving a blank iframe. Both packages use their actual captured code.
for(const runtime of [foldRuntime,melodyRuntime]){
 if(!studioRoutes.has(runtime===foldRuntime?'fold-groove':'melody-bounce'))continue;
 const base=runtime.slice(1).replace(/\/index\.html$/,'');
 const boot=[
  'const status=document.getElementById("runtime-status");',
  'const root=document.getElementById("studio");',
  'const link="/"+'+JSON.stringify(base) + '+"/index.html";',
  'const fail=(error)=>{status.dataset.error="true";status.replaceChildren();const p=document.createElement("p");p.textContent="Studio could not start: "+String(error?.message??error??"unknown error").slice(0,350);const a=document.createElement("a");a.href=link;a.textContent="Open the original captured studio directly";a.target="_top";status.append(p,a)};',
  'window.addEventListener("error",event=>fail(event.error||event.message));',
  'window.addEventListener("unhandledrejection",event=>fail(event.reason));',
  'try{await import("./studio.mjs");if(root.childElementCount>0){status.remove()}else{fail("Game module loaded but did not mount a studio interface.")}}catch(error){fail(error)}'
 ].join('\n');
 put(base+'/bootstrap.mjs',boot);
}
put('404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Archive page unavailable</title><h1>Page not included in the archive</h1><p>Live account and backend services are not part of the capture.</p><a href="/">Return to archive home</a></html>');
put('robots.txt','User-agent: *\nAllow: /\n');
put('assets/vidirexa-mobile.css',fs.readFileSync(path.resolve('scripts/mobile-site.css'),'utf8'));
put('assets/vidirexa-android-nav.mjs',fs.readFileSync(path.resolve('scripts/android-navigation.mjs'),'utf8'));


console.log('Archive build: '+pages.size+' public routes (including '+studioRoutes.size+' game-specific snapshots) and '+assets.size+' static assets.');
if(!pages.has('/'))throw Error('Missing archive homepage');
