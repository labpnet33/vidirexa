/* Local FFmpeg/WebAssembly worker. Does not upload any media. */
let core=null;
self.onmessage=async ({data:message})=>{
 const {id,type,data={}}=message;
 try{
  if(type==='load'){
   importScripts(data.coreURL);
   if(typeof self.createFFmpegCore!=='function')throw Error('FFmpeg core could not be initialized');
   core=await self.createFFmpegCore({
    mainScriptUrlOrBlob:data.coreURL+'#'+btoa(JSON.stringify({wasmURL:data.wasmURL,workerURL:''}))
   });
   core.setLogger?.(item=>{
    const message=String(item.message||'');
    if(/time=|Duration:|Error|Unknown encoder/i.test(message))
     self.postMessage({type:'log',data:message.slice(0,450)});
   });
   core.setProgress?.(item=>self.postMessage({type:'progress',data:Number(item.progress)||0}));
   self.postMessage({id,ok:true});return;
  }
  if(!core)throw Error('FFmpeg core is not ready');
  if(type==='convert'){
   const source=new Uint8Array(data.buffer);
   core.FS.writeFile('source.webm',source);
   const args=[
    '-hide_banner','-y','-fflags','+genpts','-i','source.webm',
    '-map','0:v:0','-map','0:a:0?',
    '-vf','fps=30,format=yuv420p',
    '-c:v','libx264','-preset','ultrafast','-crf','22',
    '-pix_fmt','yuv420p','-bf','0','-g','60',
    '-c:a','aac','-ar','48000','-b:a','128k',
    '-movflags','+faststart','-t',String(data.duration),'reel.mp4'
   ];
   core.exec(...args);
   if(core.ret!==0)throw Error('Local H.264/AAC conversion failed (FFmpeg exit '+core.ret+').');
   const output=core.FS.readFile('reel.mp4');
   if(output.byteLength<4096)throw Error('FFmpeg returned an empty MP4');
   const result=new Uint8Array(output);
   core.FS.unlink('source.webm');core.FS.unlink('reel.mp4');
   self.postMessage({id,ok:true,buffer:result.buffer},[result.buffer]);return;
  }
  throw Error('Unknown FFmpeg worker message');
 }catch(error){
  self.postMessage({id,ok:false,error:String(error?.message||error).slice(0,700)});
 }
};
