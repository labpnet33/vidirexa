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
const label='<div role="note" style="position:relative;z-index:2147483647;background:#172554;color:#fff;padding:14px 18px;font:600 14px/1.5 system-ui;text-align:center">Guest browsing — no account required. Read-only website archive, not the original service. <a href="/" style="color:#c7e8ff">Home</a> · <a href="/games" style="color:#c7e8ff">Games</a> · <a href="/create" style="color:#c7e8ff">Create catalogue</a> · <a href="/guides" style="color:#c7e8ff">Guides</a> · <a href="/pricing" style="color:#c7e8ff">Archived pricing</a>. Original account, checkout and simulation services are unavailable.</div>';
function resolve(raw,route){try{return new URL(raw.replace(/&amp;/g,'&'),'https://vidirexa.com'+route)}catch{return null}}
function asset(raw,route){if(/^data:image\//i.test(raw))return raw;const u=resolve(raw,route);if(!u)return null;if(map.has(u.href))return '/'+map.get(u.href);if(u.origin==='https://vidirexa.com'&&assets.has(u.pathname.slice(1)))return u.pathname;return null}
function link(raw,route){if(raw.startsWith('#'))return raw;const u=resolve(raw,route);if(!u||u.origin!=='https://vidirexa.com')return null;const p=u.pathname.replace(/\/index\.html$/,'/').replace(/\/$/,'')||'/';if(p==='/create'&&u.searchParams.has('game')){const game=u.searchParams.get('game');if(studioRoutes.has(game))return studioRoutes.get(game)+u.hash;return null}if(pages.has(p))return p+u.hash;return asset(raw,route)}
function put(file,content){const p=path.join(out,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content)}
for(const [route,src] of pages){let h=fs.readFileSync(src,'utf8');const base=route.startsWith('/create/index__q_')?'/create/':route==='/'?'/':route+'/';
h=h.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<script\b[^>]*>/gi,'')
.replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(iframe|object|embed|form|base)\b[^>]*>/gi,'')
.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'')
.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi,'')
.replace(/<link\b[^>]*\brel\s*=\s*["'](?:preconnect|preload|modulepreload|dns-prefetch|prefetch|canonical)["'][^>]*>/gi,'')
.replace(/<a\b[^>]*\bhref\s*=\s*(["'])(?:https:\/\/vidirexa\.com)?\/(?:account|login|signin|signup|recordings)(?:[/?#][^"']*)?\1[^>]*>[\s\S]*?<\/a\s*>/gi,'')
.replace(/<a\b[^>]*>/gi,t=>t.replace(/\s+href\s*=\s*(["'])(.*?)\1/gi,(_,q,v)=>{const dest=link(v,base);return dest?' href="'+esc(dest)+'"':' aria-disabled="true"'}))
.replace(/<(img|source|video|audio)\b[^>]*>/gi,t=>t.replace(/\s+(src|poster)\s*=\s*(["'])(.*?)\2/gi,(_,attr,q,v)=>{const dest=asset(v,base);return dest?' '+attr+'="'+esc(dest)+'"':''}).replace(/\s+srcset\s*=\s*(["'])(.*?)\1/gi,''))
.replace(/<link\b[^>]*>/gi,t=>t.replace(/\s+href\s*=\s*(["'])(.*?)\1/gi,(_,q,v)=>{const dest=asset(v,base);return dest?' href="'+esc(dest)+'"':''}))
.replace(/<title>([\s\S]*?)<\/title>/i,'<title>Archived preview — $1</title>')
.replace(/<\/head>/i,'<meta name="robots" content="noindex,nofollow"><style>.analytics-consent-banner,.support-widget,.sale-banner{display:none!important}a[aria-disabled=true],button,input,select,textarea{pointer-events:none!important;cursor:default!important}body{padding-bottom:0!important}</style></head>')
.replace(/<body\b[^>]*>/i,m=>m+label);
if(route==='/create'||route==='/games'){const gameList=[...pages.keys()].filter(x=>x.startsWith('/games/')).sort().map(p=>'<a href="'+esc(p)+'" style="display:inline-block;margin:5px;padding:10px;border:1px solid #777;border-radius:6px">'+esc(p.split('/').pop().replace(/-/g,' '))+'</a>').join('');h=h.replace(label,label+'<section style="padding:20px;max-width:1100px;margin:auto"><h2>Captured simulation catalogue</h2><p>Browse archived game descriptions. Playable engines require independent implementation.</p>'+gameList+'</section>')}
if(route===studioRoutes.get('bounce-fill')){
 const workspace="<section id=\"local-bounce\" aria-label=\"Independent Bounce and Fill simulator\"><style>\n#local-bounce{padding:16px;background:#131923;color:#e2e8f0;box-sizing:border-box}#local-bounce .bf-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(200px,260px);gap:18px;align-items:start}#local-bounce canvas{display:block;width:100%;max-width:390px;aspect-ratio:9/16;margin:0 auto;border:1px solid #39465d;border-radius:12px;background:#08111f}#local-bounce .bf-controls{display:grid;gap:12px}#local-bounce label{display:grid;gap:6px;font:13px system-ui}#local-bounce select,#local-bounce input[type=range]{width:100%;box-sizing:border-box}#local-bounce button,#local-bounce select,#local-bounce input,.published-focus{pointer-events:auto!important;cursor:pointer!important}#local-bounce button,#local-bounce select,#local-bounce a{padding:10px 12px;border:1px solid #46546a;background:#202b3d;color:#fff;border-radius:8px;font:600 13px system-ui}#local-bounce button:disabled{opacity:.4;cursor:default!important}#local-bounce .bf-actions{display:flex;flex-wrap:wrap;gap:8px}#local-bounce #bf-record,#local-bounce #bf-download{background:#075985}#local-bounce p{margin:8px 0;color:#bfdbfe}#local-bounce [hidden]{display:none!important}#local-bounce:fullscreen{overflow:auto}#local-bounce:fullscreen canvas{max-height:86vh;width:auto;max-width:100%}@media(max-width:720px){#local-bounce .bf-layout{grid-template-columns:1fr}}\n</style><p><strong>Independent local simulator</strong> · Guest access · No account required</p><p>New standalone implementation, not the original Vidirexa engine. All processing stays in your browser.</p><div class=\"bf-layout\"><canvas id=\"bf-canvas\" width=\"720\" height=\"1280\" aria-label=\"Animated circular arena preview\"></canvas><div class=\"bf-controls\"><strong id=\"bf-metrics\" aria-live=\"off\">0% filled</strong><label>Balls<select id=\"bf-balls\"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><label>Speed<input id=\"bf-speed\" type=\"range\" min=\".5\" max=\"3\" step=\".1\" value=\"1.5\"></label><label>Material growth per collision<input id=\"bf-growth\" type=\"range\" min=\"2\" max=\"18\" value=\"9\"></label><label>Maximum duration<select id=\"bf-duration\"><option>10</option><option selected>30</option><option>60</option></select></label><label>Palette<select id=\"bf-color\"><option value=\"ocean\">Ocean</option><option value=\"sunset\">Sunset</option><option value=\"candy\">Candy</option><option value=\"green\">Emerald</option></select></label><label style=\"display:flex;align-items:center\"><input id=\"bf-sound\" type=\"checkbox\" checked> Collision sound</label><div class=\"bf-actions\"><button id=\"bf-play\" type=\"button\">Play</button><button id=\"bf-pause\" type=\"button\">Pause</button><button id=\"bf-reset\" type=\"button\">Reset</button></div><div class=\"bf-actions\"><button id=\"bf-record\" type=\"button\">Record video</button><button id=\"bf-stop\" type=\"button\" disabled>Stop recording</button><a id=\"bf-download\" hidden download>Download video</a></div><p id=\"bf-status\" role=\"status\">Ready to preview</p><small>720 × 1280 · 30 fps target · MP4 where supported, otherwise WebM.</small></div></div></section><script src=\"/local-runtime/bounce-fill.js\" defer></script>";
 const notice=/<div class="premium-access-notice tier-access-notice"[^>]*>[\s\S]*?<\/div><div class="published-status studio-connecting"[^>]*>[\s\S]*?<\/div>/;
 if(!notice.test(h))throw Error('Bounce Fill workspace insertion point missing');
 h=h.replace(notice,()=>workspace)
 .replace(label,label.replace('Read-only website archive, not the original service.','Archived site shell with an independent playable Bounce &amp; Fill simulator.').replace('Original account, checkout and simulation services are unavailable.','Original account and checkout services are unavailable; this local simulator is independent.'))
 .replace(/Connecting studio/g,'Local runtime ready')
 .replace(/Settings, audio and recording are available inside the game workspace\./g,'Settings, audio and local recording are available in the independent workspace.')
 .replace(/Record first, then sign up free to download your video\. No payment, no card needed\./g,'Record and download locally without signing in.')
 .replace(/Archived preview — /,'Independent simulator — ');
}else if(route.startsWith('/create/index__q_')){
 h=h.replace(/Connecting your studio\.\.\.|Connecting studio/g,'Archived studio — live engine unavailable')
 .replace(/Record first, then sign up free to download your video\. No payment, no card needed\./g,'Recording and export are not available in this read-only snapshot.')
 .replace(label,label+'<section role="note" style="padding:16px;text-align:center"><strong>Game-specific studio snapshot</strong><p>This is the archived interface only. No live engine or recording service is connected.</p><a href="/create">Back to game catalogue</a></section>');
}
put(route==='/'?'index.html':route.slice(1)+'/index.html',h)}
for(const rel of assets){const b=fs.readFileSync(path.join(root,rel));if(rel.endsWith('.css')){const css=b.toString('utf8').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(m,q,v)=>{if(v.startsWith('data:')||v.startsWith('#'))return m;const u=asset(v,'/'+rel);return u?'url("'+u.replace(/"/g,'%22')+'")':'url("data:,")'});put(rel,css)}else put(rel,b)}
put('404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Archive page unavailable</title><h1>Page not included in the archive</h1><p>Live account and backend services are not part of the capture.</p><a href="/">Return to archive home</a></html>');
put('local-runtime/bounce-fill.js',fs.readFileSync('scripts/local-bounce-fill.js'));
put('robots.txt','User-agent: *\nDisallow: /\n');
console.log('Archive build: '+pages.size+' public routes (including '+studioRoutes.size+' game-specific snapshots) and '+assets.size+' static assets.');
if(!pages.has('/'))throw Error('Missing archive homepage');
