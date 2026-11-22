// Local-only WebM to Instagram-compatible H.264/AAC MP4 using FFmpeg.wasm.
// The pinned encoder runtime is hosted on Vidirexa itself. The recording
// stays entirely in the browser; no video or audio is sent to any server.
const CORE='/assets/ffmpeg';
const MAX_SOURCE=280*1024*1024,MAX_OUTPUT=480*1024*1024;
async function loadBlob(url,type,signal){
 const response=await fetch(url,{mode:'cors',signal});
 if(!response.ok)throw Error('Local encoder download failed: '+response.status);
 const bytes=await response.arrayBuffer();
 if(!bytes.byteLength)throw Error('Empty browser encoder download');
 return URL.createObjectURL(new Blob([bytes],{type}));
}
function validMp4(bytes){
 const slice=bytes.subarray(0,Math.min(bytes.length,524288));
 const header=new TextDecoder('latin1').decode(slice);
 const f=header.indexOf('ftyp'),m=header.indexOf('moov'),d=header.indexOf('mdat');
 return f>=0&&f<16&&m>f&&d>m&&header.includes('avc1');
}
export async function convertWebmToInstagramMp4(recorded,options={}){
 if(!recorded?.blob?.size)throw Error('Empty recording cannot be converted');
 if(recorded.blob.size>MAX_SOURCE)throw Error('The clip is too large for on-device MP4 conversion. Convert its saved WebM file with desktop FFmpeg.');
 const duration=Number(options.duration);
 if(!(duration>=3&&duration<=180))throw Error('Invalid clip duration for Instagram MP4');
 if(!globalThis.Worker||!globalThis.WebAssembly)throw Error('This browser cannot run the local MP4 converter');
 const signal=options.signal,urls=[],pending=new Map(),logs=[];
 let worker=null,sequence=0;
 const rejectAll=err=>{for(const [id,v] of pending){v.reject(err);pending.delete(id)}};
 const abort=()=>{worker?.terminate();rejectAll(new DOMException('Capture cancelled','AbortError'))};
 const call=(type,data,transfer=[])=>new Promise((resolve,reject)=>{
  const id=++sequence;
  pending.set(id,{resolve,reject});
  worker.postMessage({id,type,data},transfer);
 });
 try{
  if(signal?.aborted)throw new DOMException('Capture cancelled','AbortError');
  const [coreURL,wasmURL]=await Promise.all([
   loadBlob(CORE+'/ffmpeg-core.js','text/javascript',signal),
   loadBlob(CORE+'/ffmpeg-core.wasm','application/wasm',signal)
  ]);
  urls.push(coreURL,wasmURL);
  if(signal?.aborted)throw new DOMException('Capture cancelled','AbortError');
  worker=new Worker(new URL('./instagram-ffmpeg-worker.js',import.meta.url));
  worker.onerror=e=>rejectAll(Error('FFmpeg browser worker error: '+String(e.message||'unknown')));
  worker.onmessage=({data:x})=>{
   if(x.type==='progress'){options.onProgress?.(Math.min(1,Math.max(0,Number(x.data)||0)));return}
   if(x.type==='log'){logs.push(String(x.data));if(logs.length>6)logs.shift();return}
   const p=pending.get(x.id);if(!p)return;pending.delete(x.id);
   x.ok?p.resolve(x):p.reject(Error(String(x.error||'FFmpeg encoding failed')+' '+logs.slice(-2).join(' ')));
  };
  signal?.addEventListener('abort',abort,{once:true});
  await call('load',{coreURL,wasmURL});
  const source=await recorded.blob.arrayBuffer();
  if(signal?.aborted)throw new DOMException('Capture cancelled','AbortError');
  const converted=await call('convert',{duration,buffer:source},[source]);
  const bytes=new Uint8Array(converted.buffer);
  if(bytes.byteLength<4096||bytes.byteLength>MAX_OUTPUT||!validMp4(bytes))throw Error('FFmpeg did not return a fast-start H.264 MP4');
  options.onProgress?.(1);
  return {
   blob:new Blob([bytes],{type:'video/mp4'}),mime:'video/mp4',extension:'mp4',container:'mp4',
   duration,instagramCompatible:true,verified:true,
   video:{...recorded.video,codec:'h264',encoder:'FFmpeg.wasm H264/AAC',targetFps:30},
   audioCodec:'aac',targetFps:30
  };
 }finally{
  signal?.removeEventListener('abort',abort);worker?.terminate();
  rejectAll(Error('MP4 converter closed'));
  for(const url of urls)URL.revokeObjectURL(url);
 }
}
