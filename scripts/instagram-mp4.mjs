// Browser-local Instagram/Reels export: deterministic 60 FPS H.264 and
// timestamp-aligned 48 kHz AAC audio, in a fast-start ISO MP4 container.
// No server upload or dependency on the network. Original game adapter intact.
// MP4 muxing: mp4-muxer v5.2.2 by Vanilagy (MIT license in vendor folder).
import {Muxer,ArrayBufferTarget} from './mp4-muxer-5.2.2.min.mjs';
import {verifyInstagramMp4} from './mp4-duration-validation.mjs';
import {outputSurface,aborted,validateAdapter,validateAudio} from './capture.mjs';

const FPS=60;
const AUDIO_RATE=48000;
const AUDIO_CHUNK=1024;
const AUDIO_BITRATE=128000;
const MAX_BYTES=480*1024*1024;
const PROFILES=['avc1.64002A','avc1.4D402A','avc1.42E02A'];
const SIZES=[
 {width:1080,height:1920,bitrate:10_000_000},
 {width:720,height:1280,bitrate:6_000_000}
];
const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));
const supportCache=new Map();

export async function instagramMp4Support(options={}){
 if(typeof VideoEncoder==='undefined'||typeof AudioEncoder==='undefined'||typeof VideoFrame==='undefined'||typeof AudioData==='undefined'){
  return {supported:false,reason:'This browser lacks WebCodecs video or AAC encoding.'};
 }
 const audio={codec:'mp4a.40.2',sampleRate:AUDIO_RATE,numberOfChannels:2,bitrate:AUDIO_BITRATE};
 try{
  if(!(await AudioEncoder.isConfigSupported(audio)).supported){
   return {supported:false,reason:'This browser cannot encode AAC audio for Instagram-compatible MP4.'};
  }
 }catch(error){return {supported:false,reason:'AAC encoding is not available: '+String(error.message||error)}}
 // Honor the selected 720p output instead of silently upscaling it.
 const sizes=Number(options.width)>0&&Number(options.width)<900?[...SIZES].reverse():SIZES;
 for(const size of sizes){
  for(const codec of PROFILES){
   for(const acceleration of ['prefer-hardware','no-preference','prefer-software']){
    const video={
     codec,width:size.width,height:size.height,
     bitrate:size.bitrate,framerate:FPS,
     hardwareAcceleration:acceleration,
     latencyMode:'quality',
     avc:{format:'avc'}
    };
    const key=JSON.stringify(video);
    let supported=supportCache.get(key);
    if(supported===undefined){
     try{supported=!!(await VideoEncoder.isConfigSupported(video)).supported}catch{supported=false}
     supportCache.set(key,supported);
    }
    if(supported)return {supported:true,video,audio};
   }
  }
 }
 return {supported:false,reason:'This browser does not offer an H.264 encoder suitable for a vertical MP4.'};
}

function ensureAudio(buffer,duration){
 if(!buffer)return null;
 validateAudio(buffer,duration);
 if(!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<=0||buffer.numberOfChannels<1){
  throw Error('The game audio does not have a valid sample rate or channel layout.');
 }
 return buffer;
}

function pcmAt(channel,position){
 const sample=Math.floor(position);
 if(!channel||sample<0||sample>=channel.length)return 0;
 const fraction=position-sample;
 return channel[sample]*(1-fraction)+(channel[sample+1]??channel[sample])*fraction;
}

export async function recordInstagramMp4(adapter,sound,opts={}){
 validateAdapter(adapter);
 sound=ensureAudio(sound,adapter.duration);
 aborted(opts.signal);
 if(document.visibilityState==='hidden')throw Error('Keep this tab visible while exporting the MP4.');
 const capability=await instagramMp4Support(opts);
 if(!capability.supported){
  const error=new Error(capability.reason);
  error.name='InstagramMp4Unsupported';
  throw error;
 }
 const {video,audio}=capability;
 const surface=await outputSurface(adapter,{
  ...opts,width:video.width,height:video.height
 });
 const target=new ArrayBufferTarget();
 const muxer=new Muxer({
  target,video:{codec:'avc',width:video.width,height:video.height,frameRate:FPS},
  audio:{codec:'aac',sampleRate:AUDIO_RATE,numberOfChannels:2},
  fastStart:'in-memory',firstTimestampBehavior:'strict'
 });
 let vid=null,aud=null,encoderError=null,bytes=0,videoChunks=0,audioChunks=0;
 const onDataSize=chunk=>{
  bytes+=chunk.byteLength;
  if(bytes>MAX_BYTES)encoderError=new Error('MP4 exceeded the 480 MB browser memory safeguard. Select a shorter clip.');
 };
 try{
  vid=new VideoEncoder({
   output:(chunk,meta)=>{
    if(encoderError)return;
    try{onDataSize(chunk);if(!encoderError){muxer.addVideoChunk(chunk,meta);videoChunks++}}catch(error){encoderError=error}
   },
   error:error=>{encoderError=error}
  });
  aud=new AudioEncoder({
   output:(chunk,meta)=>{
    if(encoderError)return;
    try{onDataSize(chunk);if(!encoderError){muxer.addAudioChunk(chunk,meta);audioChunks++}}catch(error){encoderError=error}
   },
   error:error=>{encoderError=error}
  });
  vid.configure(video);
  aud.configure(audio);
  const frameCount=Math.round(adapter.duration*FPS);
  const samples=Math.round(adapter.duration*AUDIO_RATE);
  // Many original game adapters render mono audio, sometimes at 44.1 kHz.
  // Resample into 48 kHz stereo in small chunks without allocating another
  // full-length AudioBuffer. Mono is duplicated to left and right.
  const left=sound?.getChannelData(0);
  const right=sound?.getChannelData(Math.min(sound.numberOfChannels-1,1));
  const sampleRatio=(sound?.sampleRate??AUDIO_RATE)/AUDIO_RATE;
  // AAC packets and exact timestamps retain the complete media timeline.
  for(let start=0;start<samples;start+=AUDIO_CHUNK){
   aborted(opts.signal);
   if(encoderError)throw encoderError;
   const count=Math.min(AUDIO_CHUNK,samples-start);
   const planes=new Float32Array(count*2);
   if(left&&right){
    for(let i=0;i<count;i++){
     const position=(start+i)*sampleRatio;
     planes[i]=pcmAt(left,position);
     planes[count+i]=pcmAt(right,position);
    }
   }
   const data=new AudioData({
    format:'f32-planar',sampleRate:AUDIO_RATE,numberOfChannels:2,
    numberOfFrames:count,timestamp:Math.round(start*1e6/AUDIO_RATE),
    data:planes
   });
   try{aud.encode(data)}finally{data.close()}
   if(aud.encodeQueueSize>14)await aud.flush();
   if(start%(AUDIO_CHUNK*45)===0)await sleep();
  }
  await aud.flush();
  if(encoderError)throw encoderError;
  for(let frame=0;frame<frameCount;frame++){
   aborted(opts.signal);
   if(encoderError)throw encoderError;
   const timestamp=Math.round(frame*1e6/FPS);
   const nextTimestamp=Math.round((frame+1)*1e6/FPS);
   surface.draw(frame/FPS);
   const image=new VideoFrame(surface.canvas,{
    timestamp,duration:nextTimestamp-timestamp
   });
   try{vid.encode(image,{keyFrame:frame%(FPS*2)===0})}
   finally{image.close()}
   if(vid.encodeQueueSize>8)await vid.flush();
   if(frame%30===0){
    opts.onProgress?.(frame/frameCount);
    await sleep();
   }
  }
  await vid.flush();
  if(encoderError)throw encoderError;
  if(videoChunks<frameCount||audioChunks<1){
   throw Error('The browser did not encode the full MP4 video/audio timeline.');
  }
  muxer.finalize();
  const buffer=target.buffer;
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<4096)throw Error('MP4 encoder returned an empty file.');
  if(buffer.byteLength>MAX_BYTES)throw Error('Finished MP4 exceeded the 480 MB browser memory safeguard.');
  // Never return a short or desynchronized MP4 as Instagram-compatible.
  const timeline=verifyInstagramMp4(new Uint8Array(buffer),adapter.duration);
  opts.onProgress?.(1);
  return {
   blob:new Blob([buffer],{type:'video/mp4'}),mime:'video/mp4',
   extension:'mp4',container:'mp4',targetFps:FPS,
   verified:true,instagramCompatible:true,verifiedDuration:timeline.duration,
   video:{width:video.width,height:video.height,bitrate:video.bitrate,
    codec:'h264',encoder:'WebCodecs+MP4',frames:frameCount},
   audioCodec:'aac',duration:adapter.duration
  };
 }finally{
  try{if(vid?.state!=='closed')vid?.close()}catch{}
  try{if(aud?.state!=='closed')aud?.close()}catch{}
  await surface.restore();
 }
}
