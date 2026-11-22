'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve('public-preview');
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const headers=(config.headers||[]).flatMap(item=>item.headers||[]);
const forbidden=headers.filter(header=>header.key.toLowerCase()==='x-robots-tag'&&/\b(noindex|nofollow|none)\b/i.test(header.value));
if(forbidden.length)throw Error('Global X-Robots-Tag still prevents search indexing');
const robots=fs.readFileSync(path.join(root,'robots.txt'),'utf8');
if(!/^User-agent:\s*\*\s*$/mi.test(robots)||!/^Allow:\s*\/\s*$/mi.test(robots)||/^Disallow:\s*\/\s*$/mi.test(robots))throw Error('robots.txt does not allow public crawling');
let checked=0,blocked=[];
function visit(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){if(file.startsWith(path.join(root,'packages')))continue;visit(file)}
  else if(entry.isFile()&&entry.name.endsWith('.html')&&file!==path.join(root,'404.html')){
   const data=fs.readFileSync(file,'utf8');
   checked++;
   const robotsTag=data.match(/<meta\b(?=[^>]*\bname\s*=\s*['"](?:robots|googlebot)['"])[^>]*>/gi)||[];
   if(robotsTag.some(tag=>/\b(noindex|nofollow|none)\b/i.test(tag)))blocked.push(path.relative(root,file).split(path.sep).join('/'));
  }
 }
}
visit(root);
// Preserve explicit, page-specific directives from the captured source.
// Privacy Preferences and Referrals were deliberately marked noindex,follow;
// this audit only removes site-wide blocking of otherwise indexable pages.
const intentionallyExcluded=new Set(['privacy/index.html','referrals/index.html']);
const unexpected=blocked.filter(rel=>{
 if(!intentionallyExcluded.has(rel))return true;
 const source=path.join('site',rel);
 return !fs.existsSync(source)||!/<meta\b[^>]*name=["']robots["'][^>]*content=["']noindex,\s*follow["']/i.test(fs.readFileSync(source,'utf8'));
});
if(unexpected.length)throw Error('Unexpected HTML indexing blockers: '+unexpected.slice(0,15).join(', '));

if(!checked||!fs.existsSync(path.join(root,'create/index.html'))||!fs.existsSync(path.join(root,'index.html')))throw Error('Expected public HTML pages missing');
// Keep the native game catalogue, but never reinsert the obsolete archive link dump.
for(const route of ['create','games']){
 const filename=path.join(root,route,'index.html');
 if(!fs.existsSync(filename))throw Error('Missing '+route+' page');
 const html=fs.readFileSync(filename,'utf8');
 if(html.includes('Captured simulation catalogue')||html.includes('Playable engines require independent implementation'))throw Error('Obsolete archive catalogue returned on /'+route);
 if(route==='create'&&html.includes('aria-label="Next free slot"'))throw Error('Obsolete Next free slot countdown returned on Create catalogue');
 if(route==='create'&&!html.includes('game-tile-shell'))throw Error('Native Create game cards missing');
}
const notFound=fs.readFileSync(path.join(root,'404.html'),'utf8');
if(!/<meta\b[^>]*name="robots"[^>]*content="noindex"/i.test(notFound))throw Error('404 should remain noindex');
console.log('Search indexing check PASSED: '+checked+' public pages, robots.txt crawlable; '+blocked.length+' preserved source-specific noindex pages; 404 excluded.');
