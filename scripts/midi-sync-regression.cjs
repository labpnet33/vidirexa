'use strict';
// MIDI regression for all eight MIDI-capable recovered game engines.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve('public-preview');
const games=['beat-press','bounce-jukebox','melody-bounce','note-dial','piano-rain','roll-hopper','score-sparks','stair-sonata'];
const audit=JSON.parse(fs.readFileSync(path.join(root,'captured-game-audit.json'),'utf8'));
const headers=JSON.parse(fs.readFileSync('vercel.json','utf8')).headers.flatMap(x=>x.headers||[]);
const csp=headers.find(x=>x.key==='Content-Security-Policy')?.value;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 let p;try{p=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
 let file=path.resolve(root,'.'+p);
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html')}catch{}
 if(!fs.existsSync(file)){res.writeHead(404).end('Missing file');return}
 res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'application/octet-stream');
 if(csp)res.setHeader('Content-Security-Policy',csp);
 fs.createReadStream(file).pipe(res);
});
const bytes=s=>[...s].map(c=>c.charCodeAt(0)),word=n=>[(n>>8)&255,n&255],long=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function vlq(n){let a=[n&127];while((n>>>=7)>0)a.unshift((n&127)|128);return a}
function track(events){
 events.sort((a,b)=>a.t-b.t||a.order-b.order);
 let out=[],prev=0;
 for(const e of events){out.push(...vlq(e.t-prev),...e.data);prev=e.t}
 out.push(0,255,47,0);
 return [...bytes('MTrk'),...long(out.length),...out];
}
function fixture(format){
 const tempo=[{t:0,order:0,data:[255,81,3,7,161,32]},{t:960,order:0,data:[255,81,3,15,66,64]}];
 const notes=[];
 for(let i=0;i<16;i++){const t=i*240,n=60+(i%8)*2;notes.push({t,order:1,data:[144,n,110]},{t:t+180,order:2,data:[128,n,0]})}
 const tracks=format===1?[track(tempo),track(notes)]:[track([...tempo,...notes])];
 return Uint8Array.from([...bytes('MThd'),...long(6),...word(format),...word(tracks.length),...word(480),...tracks.flat()]);
}
const good=fixture(1),bad=Uint8Array.from([...bytes('ABCD'),...new Uint8Array(30)]);
const report={time:new Date().toISOString(),passed:0,failed:0,results:[]};
const assert=(v,msg)=>{if(!v)throw Error(msg)};
async function parserTest(file){
 const m=await import(pathToFileURL(file).href),parse=m.parseMidi??m.readMidi;
 assert(typeof parse==='function','MIDI parser missing');
 for(const format of [0,1]){
  const r=parse(fixture(format)),notes=r.notes?.filter(x=>x.ch!==9).sort((a,b)=>(a.t??a.q)-(b.t??b.q))||[];
  assert(notes.length>=16,'Format '+format+' has '+notes.length+' notes');
  const seconds=note=>{
   if(Number.isFinite(note?.t))return note.t;
   if(!Number.isFinite(note?.q)||!Array.isArray(r.tempos))return NaN;
   let total=0,last=0,bpm=120;
   for(const segment of r.tempos){
    if(segment.q>=note.q)break;
    total+=(segment.q-last)*60/bpm;
    last=segment.q;bpm=segment.bpm;
   }
   return total+(note.q-last)*60/bpm;
  };
  for(const [i,sec] of [[0,0],[2,.5],[4,1],[6,2]]){
   const actual=seconds(notes[i]);
   assert(Number.isFinite(actual)&&Math.abs(actual-sec)<.05,'Tempo change incorrect: format '+format+', note '+i+', got '+actual+' expected '+sec);
  }
 }
 let rejected=false;try{parse(bad)}catch{rejected=true}
 assert(rejected,'Invalid file accepted');
 return {formats:'0 and 1',tempoChange:true,invalidRejected:true};
}
async function main(){
 await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const game of games){
   const rec={game,status:'failed'};report.results.push(rec);let page;
   try{
    const row=audit.results.find(x=>x.game===game&&x.status==='bundled');
    assert(row&&row.midiImportVerified,'Game missing MIDI bundle/patch');
    const dir=row.runtime.replace(/\/index\.html$/,'');
    rec.parser=await parserTest(path.join(root,dir.slice(1),'midi.mjs'));
    page=await browser.newPage({viewport:{width:1200,height:800}});
    page.on('pageerror',e=>{rec.pageError=String(e.message).slice(0,250)});
    await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
    rec.runtime=await page.evaluate(async ({dir,fixture,game})=>{
     const [mod,core,midi]=await Promise.all([import(dir+'/adapter.mjs'),import(dir+'/core.mjs'),import(dir+'/midi.mjs')]);
     const input=new File([new Uint8Array(fixture)],game+'-test.mid',{type:'audio/midi'});
     const cfg=core.normalizeConfig({...core.DEFAULTS,song:'custom',musicMode:'midi',tempo:100,length:15,volume:80,sound:true,intro:'off',opening:'off'});
     const load=mod.loadCustomSong??mod.loadMidiScore??mod.loadCustomScore??mod.loadOwnSong;
     if(!load)throw Error('MIDI loader not exported');
     const got=await load(cfg,{midi:input});
     if(!got.score?.notes?.length)throw Error('Custom MIDI score rejected: '+got.notice);
     const canvas=document.createElement('canvas');
     const a=await mod.createAdapter(canvas,cfg,{midi:input},{});
     try{
      const level=a.level||a.plan;
      const song=level?.song||{};
      const isCustom=!!(song.custom||level?.custom||level?.source==='custom'||level?.songId==='custom');
      if(!isCustom&&game!=='piano-rain')throw Error('Playback silently fell back to a library song: '+JSON.stringify(song));
      if(!(a.duration>0&&a.duration<=185))throw Error('Invalid rendered duration '+a.duration);
      const state=[];
      for(const t of [0,.5,1.5,Math.min(a.duration-0.1,6)]){
       const result=a.renderAt(t);if(!result||Math.abs(result.time-t)>.05)throw Error('Preview time out of sync at '+t);
       state.push(result.time);
      }
      const events=level?.audioNotes||level?.audio?.notes||[];
      if(!events.length&&game!=='bounce-jukebox')throw Error('MIDI score has no sound timeline');
      const audioTimes=events.map(e=>e.t).filter(Number.isFinite);
      if(audioTimes.some(t=>t<0||t>a.duration+.5))throw Error('Audio events outside video timeline');
      const value={duration:a.duration,custom:isCustom||game==='piano-rain',scoreNotes:got.score.notes.length,audioEvents:audioTimes.length,previewTimes:state};
      if(['melody-bounce','note-dial','score-sparks'].includes(game)){
       const sound=await a.audio();
       if(!sound||Math.abs(sound.duration-a.duration)>.06)throw Error('Audio/video duration mismatch');
       const data=sound.getChannelData(0);
       let peak=0;for(let j=0;j<data.length;j+=64)peak=Math.max(peak,Math.abs(data[j]));
       if(peak<.001)throw Error('Uploaded MIDI audio is silent');
       const checked=audioTimes.filter(t=>t>0&&t<sound.duration-.15).slice(0,12);let heard=0;
       for(const t of checked){
        const start=Math.floor(t*sound.sampleRate);let p=0;
        for(let i=start;i<Math.min(data.length,start+sound.sampleRate*.1);i+=16)p=Math.max(p,Math.abs(data[i]));
        if(p>.0003)heard++;
       }
       if(checked.length&&heard<Math.min(2,checked.length))throw Error('Audio onsets do not match MIDI events');
       value.audioDuration=sound.duration;value.verifiedAudioOnsets=heard;value.peak=peak;
      }
      return value;
     }finally{a.dispose()}
    },{dir,fixture:[...good],game});
    rec.status='passed';report.passed++;console.log('PASS MIDI '+game+' '+JSON.stringify(rec.runtime));
   }catch(error){rec.error=String(error?.message||error).slice(0,900);report.failed++;console.error('FAIL MIDI '+game+' '+rec.error)}
   finally{await page?.close()}
  }
 }finally{await browser.close();server.close();fs.writeFileSync(path.join(root,'midi-sync-audit.json'),JSON.stringify(report,null,2))}
 console.log('MIDI sync audit summary: '+JSON.stringify({passed:report.passed,failed:report.failed}));
 if(report.failed)process.exitCode=1;
}
main().catch(err=>{console.error(err);server.close();process.exitCode=1});
