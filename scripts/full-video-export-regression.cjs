'use strict';
// Full local-video export regression. Runs real MediaRecorder / CaptureController,
// saves downloaded files and probes the resulting streams with FFprobe/FFmpeg.
// Unlike a simple "button enabled" smoke test, this validates 30 s / 180 s
// finished videos with audio and a complete game-adapter recording.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const cp=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve('public-preview');
const directory=path.join(root,'export-regression');
fs.mkdirSync(directory,{recursive:true});
const audit=JSON.parse(fs.readFileSync(path.join(root,'captured-game-audit.json'),'utf8'));
const cors=JSON.parse(fs.readFileSync('vercel.json','utf8')).headers[0].headers.find(x=>x.key==='Content-Security-Policy').value;
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.wav':'audio/wav','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 let requested;
 try{requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
 const file=path.resolve(root,'.'+requested);
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 let target=file;
 try{if(fs.statSync(target).isDirectory())target=path.join(target,'index.html')}catch{}
 if(!fs.existsSync(target)){res.writeHead(404).end('Not found');return}
 res.setHeader('Content-Type',types[path.extname(target).toLowerCase()]||'application/octet-stream');
 res.setHeader('Content-Security-Policy',cors);
 res.setHeader('X-Content-Type-Options','nosniff');
 fs.createReadStream(target).pipe(res);
});
const report={started:new Date().toISOString(),cases:[],passed:0,failed:0};
// Deterministic format-1 MIDI with a mid-song tempo change, shared by
// the MIDI preview and completed-media recording regressions.
function midiFixture(){
 const ascii=s=>[...s].map(x=>x.charCodeAt(0)),w=n=>[(n>>8)&255,n&255],d=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
 const vlq=n=>{let a=[n&127];while((n>>>=7)>0)a.unshift((n&127)|128);return a};
 const track=ev=>{ev.sort((a,b)=>a.t-b.t||a.o-b.o);let out=[],last=0;for(const x of ev){out.push(...vlq(x.t-last),...x.b);last=x.t}out.push(0,255,47,0);return [...ascii('MTrk'),...d(out.length),...out]};
 const tempo=[{t:0,o:0,b:[255,81,3,7,161,32]},{t:960,o:0,b:[255,81,3,15,66,64]}];
 const notes=[];for(let i=0;i<16;i++){const t=i*240,n=60+(i%8)*2;notes.push({t,o:1,b:[144,n,115]},{t:t+180,o:2,b:[128,n,0]})}
 return [...ascii('MThd'),...d(6),...w(1),...w(2),...w(480),...track(tempo),...track(notes)];
}
const cases=[
 // Full HD 30 s with sound through the same CaptureController used by the studio.
 {id:'fullhd-audio-30s',game:'chaos-cutter',duration:30,width:1080,height:1920,synthetic:true,audio:true},
 // Maximum permitted duration, with a lower-output-size option for memory safety.
 {id:'max-duration-audio-180s',game:'melody-bounce',duration:180,width:720,height:1280,synthetic:true,audio:true},
 // Exercise a real game: use the original Chaos Cutter adapter, sound engine,
 // original duration, and the same controller path as the game.
 {id:'real-game-chaos-cutter',game:'chaos-cutter',synthetic:false,audio:true,width:1080,height:1920},
 // Real custom-MIDI engine: the exported video and audio share the same MIDI events.
 {id:'custom-midi-melody-bounce',game:'melody-bounce',synthetic:false,audio:true,midiBytes:midiFixture(),width:1080,height:1920},
 // Must produce a complete and fast-start H.264/AAC MP4 on compatible browsers.
 {id:'instagram-h264-aac-12s',game:'chaos-cutter',duration:12,width:1080,height:1920,synthetic:true,audio:true,instagramReady:true}
];
const command=(bin,args,timeout=30000)=>{
 const r=cp.spawnSync(bin,args,{encoding:'utf8',timeout,maxBuffer:16*1024*1024});
 if(r.error)throw r.error;
 if(r.status!==0)throw Error(bin+' failed: '+(r.stderr||r.stdout).slice(-1600));
 return r.stdout;
};
function inspectFile(filename,caseInfo,duration,metadata){
 const raw=command('ffprobe',['-v','error','-show_format','-show_streams','-of','json',filename],30000);
 const probe=JSON.parse(raw);
 const streams=probe.streams||[];
 const video=streams.find(x=>x.codec_type==='video');
 const audio=streams.find(x=>x.codec_type==='audio');
 if(!video)throw Error('No encoded video track in '+caseInfo.id);
 if(caseInfo.audio&&!audio)throw Error('No audio track in '+caseInfo.id);
 if(video.width!==caseInfo.width||video.height!==caseInfo.height)throw Error('Incorrect video resolution: '+video.width+'x'+video.height);
 const format=String(probe.format?.format_name||'');
 if(caseInfo.instagramReady){
  if(video.codec_name!=='h264'||audio?.codec_name!=='aac')throw Error('Instagram export needs H.264/AAC, got '+video.codec_name+'/'+audio?.codec_name);
  if(Number(audio.sample_rate)!==48000)throw Error('Instagram AAC track needs 48000 Hz');
  const file=fs.readFileSync(filename);
  const mov=file.indexOf(Buffer.from('moov'));
  const data=file.indexOf(Buffer.from('mdat'));
  if(!(mov>0&&data>mov))throw Error('MP4 must have fast-start moov before mdat for Instagram import');
 }

 const extension=path.extname(filename).slice(1);
 if(caseInfo.instagramReady&&extension!=='mp4')throw Error('Instagram-ready export unexpectedly returned '+extension+', MIME '+metadata.mime);

 if(extension==='mp4'){
  if(!/mp4|mov/i.test(format))throw Error('MP4 extension contains '+format);
  if(!['h264','hevc'].includes(video.codec_name))throw Error('MP4 requires standard H264/HEVC, actual codec '+video.codec_name);
 }else if(extension==='webm'){
  if(!/webm|matroska/i.test(format))throw Error('WebM extension contains '+format);
  if(!['vp8','vp9','av1'].includes(video.codec_name))throw Error('WebM encoded unexpected codec: '+video.codec_name);
 }else throw Error('Unexpected recording file extension '+extension);
 const actual=Number(probe.format.duration||video.duration||0);
 if(!(actual>0)||Math.abs(actual-duration)>Math.max(3,duration*0.03))throw Error('Recorded duration '+actual+' does not match '+duration);
 // For a captured MIDI game, inspect decoded audio near the exact scheduled
 // note onsets from the same engine timeline used to render the video.
 let verifiedMidiOnsets=null;
 if(Array.isArray(metadata.midiOnsets)&&metadata.midiOnsets.length){
  const dec=cp.spawnSync('ffmpeg',['-v','error','-i',filename,'-map','0:a:0','-ac','1','-ar','44100','-f','f32le','pipe:1'],{timeout:70000,maxBuffer:5*1024*1024});
  if(dec.error||dec.status!==0)throw Error('Could not decode uploaded-MIDI audio: '+String(dec.stderr).slice(-240));
  const pcm=dec.stdout;
  let checked=0,heard=0;
  for(const t of metadata.midiOnsets){
   if(!(t>0.1&&t<duration-0.25))continue;
   const first=Math.max(0,Math.floor((t-.04)*44100)),last=Math.min(pcm.length/4,Math.ceil((t+.14)*44100));
   let peak=0;
   for(let i=first;i<last;i+=16)peak=Math.max(peak,Math.abs(pcm.readFloatLE(i*4)));
   checked++;if(peak>.0005)heard++;
  }
  if(checked<2||heard<Math.min(4,Math.floor(checked*.55)))throw Error('Recorded audio did not align with MIDI note onsets: '+heard+'/'+checked);
  verifiedMidiOnsets=heard;
 }
 const bytes=fs.statSync(filename).size;
 if(bytes<4096)throw Error('Recorded output is unexpectedly tiny ('+bytes+' bytes)');
 // Decode frames at both ends; this catches files with missing or corrupt tails.
 for(const second of [0,Math.max(0,actual-2)]){
  command('ffmpeg',['-v','error','-ss',String(second),'-i',filename,'-map','0:v:0','-t','1','-f','null','-'],70000);
 }
 // MediaRecorder output is variable-frame-rate WebM; inspect packet timestamps,
 // not only metadata, to ensure the final recorded scene is present.
 const packetStats=type=>{
  const payload=JSON.parse(command('ffprobe',['-v','error','-select_streams',type,'-show_packets','-show_entries','packet=pts_time,duration_time','-of','json',filename],90000));
  let last=0;
  for(const packet of payload.packets||[]){
   const pts=Number(packet.pts_time),part=Number(packet.duration_time);
   if(Number.isFinite(pts))last=Math.max(last,pts+(Number.isFinite(part)?part:0));
  }
  return {count:(payload.packets||[]).length,lastTimestamp:last};
 };
 const videoPackets=packetStats('v:0');
 if(videoPackets.count<duration*12||videoPackets.lastTimestamp<duration-3)throw Error('Video stream is incomplete: '+JSON.stringify(videoPackets));
 const audioPackets=caseInfo.audio?packetStats('a:0'):null;
 if(caseInfo.audio&&(audioPackets.count===0||audioPackets.lastTimestamp<duration-3))throw Error('Audio stream ends early: '+JSON.stringify(audioPackets));
 let maximumVolume=null;
 if(caseInfo.audio){
  if(!Number(audio.sample_rate))throw Error('Audio sample rate missing');
  const data=cp.spawnSync('ffmpeg',['-hide_banner','-i',filename,'-map','0:a:0','-af','volumedetect','-f','null','-'],{encoding:'utf8',timeout:90000,maxBuffer:6*1024*1024});
  if(data.error||data.status!==0)throw Error('Audio stream cannot decode: '+(data.stderr||data.error||'').toString().slice(-600));
  const match=(data.stderr||'').match(/max_volume:\s*(-?[\d.]+)\s*dB/);
  if(!match)throw Error('No measurable audio signal in export');
  maximumVolume=Number(match[1]);
  if(maximumVolume< -48)throw Error('Audio track is effectively silent: '+maximumVolume+' dB');
 }
 return {duration:actual,sizeBytes:bytes,container:format,videoCodec:video.codec_name,width:video.width,height:video.height,averageFps:video.avg_frame_rate,measuredFps:Number((videoPackets.count/actual).toFixed(1)),lastVideoTimestamp:videoPackets.lastTimestamp,lastAudioTimestamp:audioPackets?.lastTimestamp??null,audioCodec:audio?.codec_name||null,audioSampleRate:audio?.sample_rate||null,maximumVolumeDb:maximumVolume,verifiedMidiOnsets,instagramReady:!!caseInfo.instagramReady,reportedMime:metadata.mime,progressCallbacks:metadata.progressCallbacks,adapterDuration:duration};
}
async function main(){
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
 try{
  for(const example of cases.filter(x=>!process.env.FULL_EXPORT_FILTER||x.id===process.env.FULL_EXPORT_FILTER)){
   const item={id:example.id,game:example.game,status:'failed'};
   report.cases.push(item);
   let page;
   try{
    const target=audit.results.find(x=>x.game===example.game&&x.status==='bundled');
    if(!target)throw Error('Game runtime is not present: '+example.game);
    const moduleRoot=target.runtime.replace(/\/index\.html$/,'');
    page=await browser.newPage({viewport:{width:1250,height:850},acceptDownloads:true});
    page.on('pageerror',e=>{item.pageError=String(e?.message||e).slice(0,240)});
    await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:20000});
    if(example.instagramReady){
      const diagnostics=await page.evaluate(async root=>{
        const m=await import(root+'/shared/instagram-mp4.mjs');
        const d={support:await m.instagramMp4Support(),audioEncoder:typeof AudioEncoder,videoEncoder:typeof VideoEncoder,mediaRecorderMP4:['video/mp4','video/mp4;codecs=avc1.42E01E,mp4a.40.2'].map(x=>({mime:x,supported:MediaRecorder.isTypeSupported(x)}))};
        if(typeof AudioEncoder==='function'){
          try{d.aac=await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:128000})}catch(e){d.aacError=String(e)}
        }
        if(typeof VideoEncoder==='function'){
          for(const codec of ['avc1.64002A','avc1.4D402A','avc1.42E02A']){
           try{d[codec]=await VideoEncoder.isConfigSupported({codec,width:720,height:1280,framerate:60,bitrate:6000000,avc:{format:'avc'}})}catch(e){d[codec+'Error']=String(e)}
          }
        }
        return d;
      },moduleRoot);
      console.log('INSTAGRAM_ENCODER_DIAGNOSTICS '+JSON.stringify(diagnostics));
    }

    // Static archive's banner intercepts clicks; remove only in this test page.
    await page.evaluate(()=>document.querySelector('body > div[role="note"]')?.remove());
    await page.evaluate(({example,moduleRoot})=>{
     const trigger=document.createElement('a');
     trigger.id='start-full-export';
     trigger.href='#record';
     trigger.textContent='Start browser export';
     trigger.style.cssText='position:fixed;top:20px;left:20px;z-index:2147483647;display:block;padding:16px;background:#fff;color:#000;pointer-events:auto';
     document.body.append(trigger);
     trigger.addEventListener('click',async event=>{
      event.preventDefault();
      let adapter;
      try{
       const cap=await import(moduleRoot+'/shared/capture.mjs');
       const canvas=document.createElement('canvas');
       canvas.width=720;canvas.height=1280;
       let sound=null;
       if(example.synthetic){
        const duration=example.duration;
        const paint=t=>{
         const ctx=canvas.getContext('2d',{alpha:false});
         ctx.fillStyle='#08192b';ctx.fillRect(0,0,canvas.width,canvas.height);
         const x=Math.round((Math.sin(t*2.7)*.36+.5)*canvas.width);
         ctx.fillStyle='#00d4f0';ctx.fillRect(x,Math.floor(canvas.height*.25),Math.floor(canvas.width*.12),Math.floor(canvas.height*.12));
         ctx.fillStyle='#ff6baf';ctx.fillRect(Math.round((t*73)%canvas.width),Math.floor(canvas.height*.7),45,45);
         ctx.fillStyle='#ffffff';ctx.font='48px sans-serif';ctx.fillText('FULL VIDEO TEST',30,75);
        };
        adapter={
         canvas,width:720,height:1280,fps:60,duration,config:{},
         renderAt:paint,reset(){paint(0)},dispose(){},setOutputSize(w,h){canvas.width=w;canvas.height=h;paint(0)},
         async audio(){
          const context=new AudioContext({sampleRate:48000});
          const buffer=context.createBuffer(1,Math.round(duration*48000),48000);
          const samples=buffer.getChannelData(0);
          for(let i=0;i<samples.length;i++)samples[i]=.18*Math.sin(2*Math.PI*440*i/48000);
          await context.close();
          return buffer;
         }
        };
       }else{
        const [mod,core]=await Promise.all([import(moduleRoot+'/adapter.mjs'),import(moduleRoot+'/core.mjs')]);
        const midi=example.midiBytes?new File([new Uint8Array(example.midiBytes)],'custom-tempo.mid',{type:'audio/midi'}):null;
        const configuration=core.normalizeConfig(midi?{song:'custom',length:15,intro:'off',sound:true,volume:80,tempo:100}:{sound:true,volume:75});
        adapter=await mod.createAdapter(canvas,configuration,midi?{midi}:{},{});
        if(midi&&!adapter.level?.song?.custom)throw Error('MIDI recording used a library track instead of the uploaded score');
        if(midi&&(!adapter.level.audioNotes||adapter.level.audioNotes.length<8))throw Error('MIDI recording is missing synchronized audio notes');
        if(!Number.isFinite(adapter.duration)||adapter.duration<5||adapter.duration>180)throw Error('Invalid natural game duration '+adapter.duration);
       }
       const onProgress=()=>{window.__exportProgress=(window.__exportProgress||0)+1};
       let result;
       if(example.synthetic&&example.duration===180){
        // Verify maximum-duration recording without forcing 1080p on low-memory runners.
        const track=await adapter.audio();
        adapter.reset();
        result=await cap.recordCanvas(adapter,track,{width:720,height:1280,watermark:false,onProgress});
       }else{
        const capture=new cap.CaptureController();
        result=await capture.run(adapter,{mode:'record',watermark:false,onProgress});
       }
       if(!(result.blob instanceof Blob)||!result.blob.size)throw Error('Export did not return a video Blob');
       const extension=result.extension;
       const url=URL.createObjectURL(result.blob);
       const download=document.createElement('a');
       download.id='download-full-export';
       download.href=url;download.download=example.id+'.'+extension;
       download.textContent='Download exported video';
       download.style.cssText='position:fixed;top:80px;left:20px;z-index:2147483647;display:block;padding:16px;background:#fff;color:#000;pointer-events:auto';
       document.body.append(download);
       window.__exportResult={done:true,success:true,size:result.blob.size,mime:result.mime,extension,duration:adapter.duration,warning:result.instagramWarning||null,progressCallbacks:window.__exportProgress||0,video:result.video,midiOnsets:example.midiBytes?adapter.level.audioNotes.map(n=>n.t).filter(Number.isFinite).slice(0,30):null};
       adapter.dispose();
      }catch(e){
       try{adapter?.dispose()}catch{}
       window.__exportResult={done:true,success:false,error:String(e?.message||e),stack:String(e?.stack||'').slice(0,550)};
      }
     });
    },{example,moduleRoot});
    await page.locator('#start-full-export').click({timeout:15000});
    const duration=example.duration||70;
    await page.waitForFunction(()=>window.__exportResult?.done,null,{timeout:(duration+100)*1000});
    const outcome=await page.evaluate(()=>window.__exportResult);
    if(!outcome.success)throw Error('Browser export failed: '+JSON.stringify(outcome));
    if(example.instagramReady&&outcome.extension!=='mp4')throw Error('Browser could not create H.264/AAC MP4: '+(outcome.warning||'Unknown codec/conversion issue'));
    if(outcome.progressCallbacks<1)throw Error('Export never advanced playback progress');
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:25000}),page.locator('#download-full-export').click({timeout:20000})]);
    const filename=path.join(directory,download.suggestedFilename());
    await download.saveAs(filename);
    const probed=inspectFile(filename,example,outcome.duration,outcome);
    item.status='passed';item.result=probed;
    report.passed++;
    console.log('PASS FULL EXPORT '+example.id+' '+JSON.stringify(probed));
    // Keep only JSON reports in CI artifacts, not the full video bytes.
    fs.unlinkSync(filename);
   }catch(error){
    item.error=String(error?.message||error).slice(0,1300);
    report.failed++;console.error('FAIL FULL EXPORT '+example.id+' '+item.error);
    try{await page?.screenshot({path:path.join(directory,example.id+'.png'),timeout:10000})}catch{}
   }finally{await page?.close()}
  }
 }finally{
  report.completed=new Date().toISOString();
  fs.writeFileSync(path.join(directory,'full-video-export-report.json'),JSON.stringify(report,null,2));
  await browser.close();
  server.close();
 }
 console.log('Full video export summary: '+JSON.stringify({passed:report.passed,failed:report.failed,total:report.cases.length}));
 if(report.failed)process.exitCode=1;
}
main().catch(error=>{console.error(error);report.failed++;fs.writeFileSync(path.join(directory,'full-video-export-report.json'),JSON.stringify(report,null,2));server.close();process.exitCode=1});
