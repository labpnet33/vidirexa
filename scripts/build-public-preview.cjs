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
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const label='<div role="note" style="position:relative;z-index:2147483647;background:#172554;color:#fff;padding:14px 18px;font:600 14px/1.5 system-ui;text-align:center">Read-only website archive — not the original service. <a href="/" style="color:#c7e8ff">Home</a> · <a href="/games" style="color:#c7e8ff">Games</a> · <a href="/create" style="color:#c7e8ff">Create catalogue</a> · <a href="/guides" style="color:#c7e8ff">Guides</a> · <a href="/pricing" style="color:#c7e8ff">Archived pricing</a>. Account, checkout and original simulation services are unavailable.</div>';
function resolve(raw,route){try{return new URL(raw.replace(/&amp;/g,'&'),'https://vidirexa.com'+route)}catch{return null}}
function asset(raw,route){if(/^data:image\//i.test(raw))return raw;const u=resolve(raw,route);if(!u)return null;if(map.has(u.href))return '/'+map.get(u.href);if(u.origin==='https://vidirexa.com'&&assets.has(u.pathname.slice(1)))return u.pathname;return null}
function link(raw,route){if(raw.startsWith('#'))return raw;const u=resolve(raw,route);if(!u||u.origin!=='https://vidirexa.com')return null;const p=u.pathname.replace(/\/index\.html$/,'/').replace(/\/$/,'')||'/';if(pages.has(p))return p+u.hash;return asset(raw,route)}
function put(file,content){const p=path.join(out,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content)}
for(const [route,src] of pages){let h=fs.readFileSync(src,'utf8');const base=route==='/'?'/':route+'/';
h=h.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<script\b[^>]*>/gi,'')
.replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(iframe|object|embed|form|base)\b[^>]*>/gi,'')
.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'')
.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi,'')
.replace(/<link\b[^>]*\brel\s*=\s*["'](?:preconnect|preload|modulepreload|dns-prefetch|prefetch|canonical)["'][^>]*>/gi,'')
.replace(/<a\b[^>]*>/gi,t=>t.replace(/\s+href\s*=\s*(["'])(.*?)\1/gi,(_,q,v)=>{const dest=link(v,base);return dest?' href="'+esc(dest)+'"':' aria-disabled="true"'}))
.replace(/<(img|source|video|audio)\b[^>]*>/gi,t=>t.replace(/\s+(src|poster)\s*=\s*(["'])(.*?)\2/gi,(_,attr,q,v)=>{const dest=asset(v,base);return dest?' '+attr+'="'+esc(dest)+'"':''}).replace(/\s+srcset\s*=\s*(["'])(.*?)\1/gi,''))
.replace(/<link\b[^>]*>/gi,t=>t.replace(/\s+href\s*=\s*(["'])(.*?)\1/gi,(_,q,v)=>{const dest=asset(v,base);return dest?' href="'+esc(dest)+'"':''}))
.replace(/<title>([\s\S]*?)<\/title>/i,'<title>Archived preview — $1</title>')
.replace(/<\/head>/i,'<meta name="robots" content="noindex,nofollow"><style>.analytics-consent-banner,.support-widget,.sale-banner{display:none!important}a[aria-disabled=true],button,input,select,textarea{pointer-events:none!important;cursor:default!important}body{padding-bottom:0!important}</style></head>')
.replace(/<body\b[^>]*>/i,m=>m+label);
if(route==='/create'||route==='/games'){const gameList=[...pages.keys()].filter(x=>x.startsWith('/games/')).sort().map(p=>'<a href="'+esc(p)+'" style="display:inline-block;margin:5px;padding:10px;border:1px solid #777;border-radius:6px">'+esc(p.split('/').pop().replace(/-/g,' '))+'</a>').join('');h=h.replace(label,label+'<section style="padding:20px;max-width:1100px;margin:auto"><h2>Captured simulation catalogue</h2><p>Browse archived game descriptions. Playable engines require independent implementation.</p>'+gameList+'</section>')}
put(route==='/'?'index.html':route.slice(1)+'/index.html',h)}
for(const rel of assets){const b=fs.readFileSync(path.join(root,rel));if(rel.endsWith('.css')){const css=b.toString('utf8').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(m,q,v)=>{if(v.startsWith('data:')||v.startsWith('#'))return m;const u=asset(v,'/'+rel);return u?'url("'+u.replace(/"/g,'%22')+'")':'url("data:,")'});put(rel,css)}else put(rel,b)}
put('404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Archive page unavailable</title><h1>Page not included in the archive</h1><p>Live account and backend services are not part of the capture.</p><a href="/">Return to archive home</a></html>');
put('robots.txt','User-agent: *\nDisallow: /\n');
console.log('Archive build: '+pages.size+' public routes and '+assets.size+' static assets.');
if(!pages.has('/'))throw Error('Missing archive homepage');
