'use strict';
// Fast, deterministic tests of the additional browser-local protections.
// Does not access the hosted app and does not alter source simulations.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve('public-preview');
const u32=value=>{const b=Buffer.alloc(4);b.writeUInt32BE(value>>>0);return b};
const box=(type,...payload)=>{const body=Buffer.concat(payload);return Buffer.concat([u32(body.length+8),Buffer.from(type,'ascii'),body])};
const mdia=(kind,millis)=>{
 const mdhd=Buffer.alloc(24);
 mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(millis,16);
 const hdlr=Buffer.alloc(20);hdlr.write(kind,8,'ascii');
 return box('mdia',box('mdhd',mdhd),box('hdlr',hdlr));
};
const mp4=(videoMs,audioMs)=>{
 return Buffer.concat([box('ftyp',Buffer.alloc(16)),box('moov',
  box('trak',mdia('vide',videoMs)),box('trak',mdia('soun',audioMs))),
  box('mdat',Buffer.alloc(5000))]);
};
async function main(){
 const validator=await import(pathToFileURL(path.resolve('scripts/mp4-duration-validation.mjs')).href);
 const good=validator.verifyInstagramMp4(mp4(12000,12016),12);
 assert(Math.abs(good.duration-12)<.01&&good.fastStart,'Good MP4 not recognized');
 assert.throws(()=>validator.verifyInstagramMp4(mp4(2000,2000),12),/Incomplete video track/);
 assert.throws(()=>validator.verifyInstagramMp4(mp4(12000,2000),12),/Incomplete audio track/);
 assert.throws(()=>validator.verifyInstagramMp4(Buffer.alloc(20),12),/empty or incomplete/);
 const midi=(await import(pathToFileURL(path.resolve('scripts/midi-audio-sync.mjs')).href));
 const samples=new Float32Array(48000*3);
 for(const t of [.5,1,1.5]){
  const offset=Math.round(t*48000);
  for(let i=0;i<2200;i++)samples[offset+i]=.12*Math.sin(i*.1);
 }
 const adapter={config:{song:'custom'},level:{audioNotes:[{t:.5},{t:1},{t:1.5}]}};
 const audio={sampleRate:48000,duration:3,getChannelData(){return samples}};
 const measurement=midi.inspectMidiAudioSync(adapter,audio);
 assert.equal(measurement.status,'verified');
 assert.equal(measurement.audibleOnsets,3);
 assert.equal(midi.inspectMidiAudioSync({...adapter,config:{song:'library'}},audio),null);
 const report=JSON.parse(fs.readFileSync(path.join(root,'captured-game-audit.json'),'utf8'));
 const games=report.results.filter(x=>x.status==='bundled');
 assert(games.length>=60,'Existing game studios missing after build');
 for(const game of games){
  const dir=path.join(root,game.runtime.replace(/^\//,'').replace(/\/index\.html$/,''));
  for(const file of ['shared/mp4-duration-validation.mjs','shared/midi-audio-sync.mjs','shared/adaptive-preview.mjs','shared/android-preview-guard.mjs']){
   assert(fs.existsSync(path.join(dir,file)),game.game+': missing '+file);
  }
  assert(game.mp4TimelineValidation&&game.adaptivePreview&&game.midiAudioDiagnostic,
   game.game+': improvements not applied');
 }
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let preview=null;
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const source=fs.readFileSync('scripts/adaptive-preview.mjs','utf8');
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  preview=await page.evaluate(async src=>{
   const mod=await import(src);
   window.testGame={busy:false,adapter:{renderAt(t){
    const start=performance.now();while(performance.now()-start<26){}
    return {time:t};
   }}};
   mod.installAdaptivePreview('test-game');
   const one=window.testGame.adapter.renderAt(0);
   const two=window.testGame.adapter.renderAt(.016);
   const skipped=window.__vidirexaPreviewPerformance.skipped;
   window.testGame.busy=true;
   const three=window.testGame.adapter.renderAt(.032);
   return {first:one.time,second:two.time,third:three.time,skipped,mode:window.__vidirexaPreviewPerformance.mode};
  },url);
  assert.equal(preview.first,0);
  assert(preview.skipped>=1,'Slow preview was not throttled');
  assert.equal(preview.third,.032,'Export/busy path must bypass preview throttle');
  await page.close();
 }finally{await browser.close()}
 console.log('PASS studio improvements '+JSON.stringify({studios:games.length,mp4Duration:true,midiOnsets:measurement.audibleOnsets,adaptivePreview:preview}));
}
main().catch(error=>{console.error('FAIL studio improvements',error);process.exitCode=1});
