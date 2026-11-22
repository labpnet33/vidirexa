'use strict';
// Archive recovery: embed captured, self-contained game clients. No new simulations.
// Run after build-public-preview.cjs to keep the original read-only catalogue intact.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve('.');
const out=path.join(root,'public-preview');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const host='vireel-games-production.up.railway.app';
const gameRoute=new Map();
for(const item of manifest.assets||[]){
 const m=/^site\/create\/(index__q_[a-f0-9]+)\.html$/.exec(item.local||'');
 const g=/^https:\/\/vidirexa\.com\/create\?game=([a-z0-9-]+)$/.exec(item.url||'');
 if(m&&g)gameRoute.set(g[1],m[1]);
}
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const required=['index.html','studio.mjs','shared/studio.mjs','shared/deployment.mjs','shared/studio.css','shared/capture.mjs'];
const audit=[];
const disabled=[];
function iframeFor(title,url){
 const dir=url.replace(/\/index\.html$/,'');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><link rel="stylesheet" href="'+dir+'/shared/studio.css"><style>html,body{margin:0;background:#0b1018;color:#e2e8f0;font:14px/1.5 system-ui}#runtime-status{margin:20px auto;max-width:720px;padding:12px 16px;border:1px solid #374b64;border-radius:10px}#runtime-status[data-error="true"]{border-color:#fb7185;color:#ffe4e6}#runtime-status a{color:#93c5fd}</style></head><body><div id="studio"></div><div id="runtime-status" role="status">Loading '+escape(title)+'…</div><script type="module" src="'+dir+'/bootstrap.mjs"></script><script type="module" src="'+dir+'/shared/android-preview-guard.mjs"></script></body></html>';
 return '<iframe data-vidirexa-studio-frame="true" class="vidirexa-studio-frame" title="'+escape(title)+' studio" srcdoc="'+escape(html)+'" sandbox="allow-scripts allow-same-origin allow-downloads" allow="autoplay" referrerpolicy="no-referrer" loading="eager" style="display:block;width:100%;height:var(--vidirexa-frame-height,1650px);border:0;border-radius:12px"></iframe>';
}
function moduleImports(file,baseDir){
 const content=fs.readFileSync(file,'utf8');
 let imports=[],match;
 const patterns=[
  /\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g,
  /\bimport\s*["'](\.{1,2}\/[^"']+)["']/g,
  /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g
 ];
 for(const re of patterns)while((match=re.exec(content))!==null){
  const relative=match[1].split(/[?#]/)[0];
  const resolved=path.resolve(path.dirname(file),relative);
  if(!fs.existsSync(resolved)&&!relative.endsWith('/encode-mp4.mjs'))imports.push(path.relative(baseDir,file)+' => '+relative);
 }
 return imports;
}
function missingImports(baseDir){
 const missing=[];
 function walk(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
   const p=path.join(dir,item.name);
   if(item.isDirectory())walk(p);
   else if(item.isFile()&&/\.(mjs|js)$/.test(item.name))missing.push(...moduleImports(p,baseDir));
  }
 }
 walk(baseDir);
 return [...new Set(missing)];
}
function bootScript(title,url){
 const base=url.replace(/\/index\.html$/,'');
 const lines=[
  'const status=document.getElementById("runtime-status");',
  'const root=document.getElementById("studio");',
  'if(/Windows|Win32|Win64/i.test([navigator.userAgentData?.platform,navigator.platform,navigator.userAgent].join(" "))&&window.parent.matchMedia("(min-width:801px) and (pointer:fine)").matches)document.documentElement.classList.add("vidirexa-windows-desktop");',
  'const fail=(e)=>{status.dataset.error="true";status.replaceChildren();const p=document.createElement("p");p.textContent="Could not start '+title.replace(/"/g,'')+': "+String(e?.message??e??"Unknown error").slice(0,450);const a=document.createElement("a");a.href="'+base+'/index.html";a.textContent="Try the captured engine directly";a.target="_top";status.append(p,a);};',
  'window.addEventListener("error",e=>fail(e.error||e.message));',
  'window.addEventListener("unhandledrejection",e=>fail(e.reason));',
  'try{await import("./studio.mjs");if(root.childElementCount>0){status.remove()}else{fail("Studio script loaded but no interface was mounted.")}}catch(e){fail(e)}',
  'let heightPending=false;const reportHeight=()=>{if(heightPending)return;heightPending=true;requestAnimationFrame(()=>{heightPending=false;const height=Math.ceil(Math.max(document.documentElement.scrollHeight,document.body.scrollHeight,root.scrollHeight));if(height>0)window.parent.postMessage({type:"vidirexa:studio-height",height},window.parent.location.origin)})};',
  'if(typeof ResizeObserver==="function"){const observer=new ResizeObserver(reportHeight);observer.observe(root)}',
  'window.addEventListener("message",event=>{if(event.source===window.parent&&event.origin===window.parent.location.origin&&event.data?.type==="vidirexa:studio-height-request")reportHeight()});',
  'window.addEventListener("load",reportHeight);window.addEventListener("resize",reportHeight);reportHeight();'
 ];
 return lines.join('\n')+'\n';
}
for(const [game,route] of gameRoute){
 const source=path.join(root,'site/create',route+'.html');
 const published=path.join(out,'create',route,'index.html');
 const row={game,route:'/create?game='+game,status:'unavailable',reason:'',missing:[]};
 try{
  if(!fs.existsSync(source)||!fs.existsSync(published)){row.reason='Missing captured studio page';audit.push(row);disabled.push(game);continue;}
  const original=fs.readFileSync(source,'utf8');
  const iframe=original.match(/<iframe\b[^>]*\bsrc=(["'])(https:\/\/vireel-games-production\.up\.railway\.app\/packages\/[^"']+\/index\.html)\1/i);
  if(!iframe){row.reason='No captured game iframe';audit.push(row);disabled.push(game);continue;}
  const runtime=new URL(iframe[2]);
  if(runtime.hostname!==host||!runtime.pathname.startsWith('/packages/'+game+'/')){row.reason='Unexpected captured package';audit.push(row);disabled.push(game);continue;}
  const baseDir=path.join(root,'vidirexa',host,runtime.pathname.slice(1).replace(/\/index\.html$/,''));
  const missing=required.filter(rel=>!fs.existsSync(path.join(baseDir,rel)));
  if(!missing.length&&fs.readFileSync(path.join(baseDir,'index.html'),'utf8').startsWith('No Content:'))missing.push('engine HTML is No Content');
  if(missing.length){row.reason='Incomplete captured engine';row.missing=missing;audit.push(row);disabled.push(game);continue;}
  const deployment=fs.readFileSync(path.join(baseDir,'shared/deployment.mjs'),'utf8');
  if(!deployment.includes('mode:"production"')&&!deployment.includes('mode:"local"')){row.reason='Unknown local mode switch';audit.push(row);disabled.push(game);continue;}
  const missingStatic=missingImports(baseDir);
  row.missing=missingStatic;
  if(missingStatic.length){row.reason='Unresolved static imports';audit.push(row);disabled.push(game);continue;}
  const target=path.join(out,runtime.pathname.slice(1).replace(/\/index\.html$/,''));
  fs.cpSync(baseDir,target,{recursive:true});
  const dep=path.join(target,'shared/deployment.mjs');
  const depContent=fs.readFileSync(dep,'utf8');
  if(depContent.includes('mode:"production"'))fs.writeFileSync(dep,depContent.replace('mode:"production"','mode:"local"'));
  // Remove only preview branding from the bundled browser runtime (do not
  // change original archived source files or simulation physics).
  // The repeating PREVIEW ONLY text is an HTML layer, but the rotating
  // vireel.net pill is drawn onto the canvas by the shared capture module.
  const capFile=path.join(target,'shared/capture.mjs');
  let cap=fs.readFileSync(capFile,'utf8');
  const markedRender='export function render(e,t,{watermark:r=!0,preview:n=!1}={}){e.renderAt(Math.max(0,Math.min(e.duration,t))),r&&(n?previewWatermark:watermark)(e.canvas,t)}';
  const cleanRender='export function render(e,t,{watermark:r=!0,preview:n=!1}={}){e.renderAt(Math.max(0,Math.min(e.duration,t)))}';
  if(!cap.includes(markedRender))throw Error(game+': preview canvas watermark renderer changed; review before patching');
  cap=cap.replace(markedRender,cleanRender);
  for(const exportedFn of ['export function watermark(e,t=0){','export function previewWatermark(e,t=0){']){
   if(!cap.includes(exportedFn))throw Error(game+': missing '+exportedFn);
   cap=cap.replace(exportedFn,exportedFn+'return;');
  }
  // This is a standalone, browser-local recorder: there is no server upload.
  // The upstream capture code aborts at 48 MiB for a server upload limit,
  // even when the video stays on the user's own device. Raise this to a
  // separate 512 MiB browser-memory safeguard for 5–180 second recordings.
  const legacyCap=48*1024*1024;
  const capLimit='48*1024*1024';
  const legacyErr='The encoded video exceeds the upload limit. Try a shorter clip.';
  const memoryErr='This recording exceeded the browser-memory safety limit (512 MB). Try reducing resolution or duration.';
  if(cap.split(capLimit).length-1!==2||cap.split(legacyErr).length-1!==2)throw Error(game+': upstream recording limits changed; inspect before patching');
  cap=cap.replaceAll(capLimit,'512*1024*1024').replaceAll(legacyErr,memoryErr);
  // Prefer H.264 MP4 where supported. When Chromium only supports VP9,
  // choose a WebM container rather than a misleading VP9-in-MP4 fallback.
  // Keep generic MP4 last for Safari-style recorders without codec-level support.
  const originalMime='["video/mp4;codecs=avc1.64002A,mp4a.40.2","video/mp4;codecs=avc1.4D402A,mp4a.40.2","video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]';
  const preferredMime='["video/mp4;codecs=avc1.64002A,mp4a.40.2","video/mp4;codecs=avc1.4D402A,mp4a.40.2","video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm","video/mp4"]';
  if(!cap.includes(originalMime))throw Error(game+': supported MediaRecorder formats changed');
  cap=cap.replace(originalMime,preferredMime);
  // Allow a complete playable local file even if the browser cannot sustain
  // a perfect 60 FPS capture. The exported MP4/WebM already includes the
  // captured timestamps; dropping frames should not destroy the whole video.
  const originalFpsGate='if(g/e.duration<50)throw new Error("Recording frame rate was too low. Close busy apps and retry.");';
  if(!cap.includes(originalFpsGate))throw Error(game+': expected old strict FPS abort in local recorder');
  cap=cap.replace(originalFpsGate,'if(g<1)throw new Error("No video frames were rendered. Keep the tab visible and retry.");');

  // Local MediaRecorder is not an upload; use the configured local video
  // quality rather than lowering its bitrate to meet an upload allowance.
  const localBitrate='const i=await outputSurface(e,r),o=videoBitrate(e.duration),a=[];';
  if(!cap.includes(localBitrate))throw Error(game+': unexpected local MediaRecorder bitrate code');
  cap=cap.replace(localBitrate,'const i=await outputSurface(e,r),o=VIDEO_BITRATE,a=[];');
  // MediaRecorder WebM often has no Duration element, so video editors and
  // FFprobe cannot determine the clip's full length. Finalize the container
  // metadata without re-encoding or copying a multi-hundred-MB video into JS.
  const unfinalized='blob:new Blob(a,{type:l.mimeType})';
  if(cap.split(unfinalized).length!==2)throw Error(game+': expected one local MediaRecorder blob result');
  cap=cap.replace(unfinalized,'blob:await finalizeWebmDuration(new Blob(a,{type:l.mimeType}),e.duration)');
  cap+='\nasync function finalizeWebmDuration(blob,duration){if(!blob.type.startsWith("video/webm"))return blob;return (await import("./fix-webm-duration.mjs")).fixWebmDuration(blob,duration)}\n';
  const webmFix=path.join(root,'scripts/webm-duration-fix.mjs');
  if(!fs.existsSync(webmFix))throw Error('Missing WebM Duration finalizer source');
  fs.copyFileSync(webmFix,path.join(target,'shared/fix-webm-duration.mjs'));
  row.webmDurationRepair=true;
  // On capable browsers, the local recording is H.264+AAC in a fast-start MP4.
  // Keep WebM fallback only when H.264/AAC WebCodecs are unavailable.
  const controllerRecording=':await recordCanvas(t,h.buffer,p);';
  if(cap.split(controllerRecording).length!==2)throw Error(game+': expected old recording selection');
  cap=cap.replace(controllerRecording,':await recordLocalInstagramVideo(t,h.buffer,p);');
  cap+='\nasync function recordLocalInstagramVideo(adapter,audio,options){const module=await import("./instagram-mp4.mjs");const support=await module.instagramMp4Support();if(support.supported)return module.recordInstagramMp4(adapter,audio,options);const result=await recordCanvas(adapter,audio,options);result.instagramCompatible=false;result.instagramWarning="This browser could only produce WebM, which Instagram may shorten or reject. For Instagram, use a browser that can export H.264/AAC MP4 or convert this file before uploading.";return result}\n';
  fs.copyFileSync(path.join(root,'scripts/instagram-mp4.mjs'),path.join(target,'shared/instagram-mp4.mjs'));
  fs.copyFileSync(path.join(root,'scripts/vendor/mp4-muxer-5.2.2.min.mjs'),path.join(target,'shared/mp4-muxer-5.2.2.min.mjs'));
  row.instagramMp4Export=true;
  fs.writeFileSync(capFile,cap);
  const studioFile=path.join(target,'shared/studio.mjs');
  let studio=fs.readFileSync(studioFile,'utf8');
  const tiles='function _r(){if(!fn.childNodes.length)for(let e=0;e<28;e++)fn.append(d("span","PREVIEW ONLY","v-wm-tile"))}';
  if(!studio.includes(tiles))throw Error(game+': repeating preview overlay changed; review before patching');
  studio=studio.replace(tiles,'function _r(){fn.replaceChildren()}');
  // The explainer is no longer relevant once its watermark has been removed.
  if(!studio.includes('function Wr(){let e=0;'))throw Error(game+': preview explainer changed');
  studio=studio.replace('function Wr(){let e=0;','function Wr(){return;let e=0;');
  // Hosted subscription and daily quota rules do not apply to a local
  // downloaded video. Keep the real engine and encoding checks intact.
  const localPolicyStart='a.append(d("p","Account recording is not connected in this local review. The same server rules apply to every game."));';
  const localPolicyEnd='},a.append(E)}const c=d("button",';
  const start=studio.indexOf(localPolicyStart),stop=studio.indexOf(localPolicyEnd,start);
  if(start<0||stop<0)throw Error(game+': local subscription panel layout changed');
  studio=studio.slice(0,start)+'a.append(d("p","Local recording is available without an account, subscription, cloud upload or daily quota. The video is generated and downloaded on this device.", "v-hint"))}' +studio.slice(stop+localPolicyEnd.indexOf('}const c=')+1);
  // The uploaded video / audio policy only applies to the unavailable hosted
  // service. A silent clip and unavailable IndexedDB should not block local capture.
  const mustMatch=[
   ['if(await ae(),e==="record"){','if(await ae(),r&&e==="record"){'],
   ['if(!await fe())return;Nn(),Ke()','if(!await fe()&&r)return;Nn(),Ke()'],
   ['const o=!i&&!f&&ln();si=ln(),o&&','const o=r&&!i&&!f&&ln();si=ln(),o&&'],
   ['w("download").download=\u0060vireel-\u0024{j.id}.\u0024{R.extension}\u0060','w("download").download=\u0060vidirexa-\u0024{j.id}.\u0024{R.extension}\u0060']
  ];
  for(const [oldCode,newCode] of mustMatch){
   if(!studio.includes(oldCode))throw Error(game+': missing local recording guard: '+oldCode);
   studio=studio.replace(oldCode,newCode);
  }
  // There is no recordings server. Open the existing local Blob download
  // instead of a dead http://127.0.0.1:5173/recordings link.
  const recordingLabel='const S=d("button","My recordings","v-subtle"';
  const recordingHandler=':window.open("http://127.0.0.1:5173/recordings","_blank","noopener")';
  if(!studio.includes(recordingLabel)||!studio.includes(recordingHandler))throw Error(game+': local recording result links changed');
  studio=studio.replace(recordingLabel,'const S=d("button","Download latest video","v-subtle"');
  studio=studio.replace(recordingHandler,':ze?w("download").click():L("Record a local video first, then download it here.")');
  row.localRecording=true;
  // The upstream upload field stored a MIDI Blob without selecting the
  // matching custom-song mode; uploading a new MIDI could leave the old song
  // playing. Validate note data and select the custom score before rebuilding.
  // There are 8 captured MIDI-aware engines; all other studios are untouched.
  const midiModule=path.join(target,'midi.mjs');
  if(fs.existsSync(midiModule)){
   const uploadBefore='La(o,e),i===void 0?Y[e.key]=o:(Y[e.key]??=[],Y[e.key][i]=o),await fe(),await Ge(),Q()';
   const uploadAfter='La(o,e),e.key==="midi"&&(await(async()=>{const m=await import("../midi.mjs"),parse=m.parseMidi??m.readMidi;if(typeof parse!=="function")throw new Error("MIDI support is unavailable for this game.");const notes=parse(new Uint8Array(await o.arrayBuffer()));if(!notes?.notes?.length)throw new Error("This MIDI has no playable notes.");T=n.validate({...T,song:"custom",...("musicMode"in T?{musicMode:"midi"}:{})})})()),i===void 0?Y[e.key]=o:(Y[e.key]??=[],Y[e.key][i]=o),await fe(),await Ge(),Q()';
   if(studio.split(uploadBefore).length!==2)throw Error(game+': MIDI studio upload handler changed');
   studio=studio.replace(uploadBefore,uploadAfter);
   const removeBefore='i===void 0?delete Y[e.key]:Y[e.key][i]=null,await fe(),await Ge(),Q()';
   const removeAfter='i===void 0?delete Y[e.key]:Y[e.key][i]=null,e.key==="midi"&&T.song==="custom"&&(T=n.validate({...T,song:n.defaults.song})),await fe(),await Ge(),Q()';
   if(studio.split(removeBefore).length!==2)throw Error(game+': MIDI studio remove handler changed');
   studio=studio.replace(removeBefore,removeAfter);
   // Do not play a library track when an uploaded MIDI failed parsing or was
   // absent after draft restoration. Instead show the original parsing error.
   const adapterFile=path.join(target,'adapter.mjs');
   let adapterCode=fs.readFileSync(adapterFile,'utf8');
   const loadPattern=/([a-zA-Z_$][\w$]*)=await (loadMidiScore|loadCustomSong|loadCustomScore|loadOwnSong)\(([a-zA-Z_$][\w$]*),([a-zA-Z_$][\w$]*)\);/;
   const loadMatch=adapterCode.match(loadPattern);
   if(!loadMatch)throw Error(game+': cannot locate custom MIDI loader');
   const [,scoreVar,,configVar,assetsVar]=loadMatch;
   const guard='if('+configVar+'.song==="custom"&&'+configVar+'.musicMode!=="original"&&!'+scoreVar+'.score)throw new Error('+scoreVar+'.notice||"Choose a valid MIDI file (.mid or .midi) to use this song.");';
   adapterCode=adapterCode.replace(loadPattern,loadMatch[0]+guard);
   fs.writeFileSync(adapterFile,adapterCode);
   row.midiImportVerified=true;
  }
  // Display a reliable Instagram compatibility status in the existing result area.
  const localDisplay='L(`Local video ready · ${R.mime}. Frame rate has not been independently verified.`)';
  if(!studio.includes(localDisplay))throw Error(game+': local recording status changed');
  studio=studio.replace(localDisplay,'L(R.instagramCompatible?`Instagram-ready MP4 · H.264 video, AAC audio · ${R.duration.toFixed(1)} seconds. Upload this .mp4 file to Instagram.`:R.instagramWarning||`Local video ready · ${R.mime}. Instagram may not support this format.`)');
  fs.writeFileSync(studioFile,studio);
  const cssFile=path.join(target,'shared/studio.css');
  fs.appendFileSync(cssFile,'\n/* Clean local preview: the original game canvas remains unchanged. */\n.v-watermark,.v-watermark.v-on,.v-wm-tile{display:none!important;visibility:hidden!important;opacity:0!important;animation:none!important}\n');
  fs.appendFileSync(cssFile,'\n'+fs.readFileSync(path.join(root,'scripts/mobile-studio.css'),'utf8')+'\n');
  fs.copyFileSync(path.join(root,'scripts/android-preview-guard.mjs'),path.join(target,'shared/android-preview-guard.mjs'));
  fs.appendFileSync(cssFile,'\n'+fs.readFileSync(path.join(root,'scripts/windows-studio.css'),'utf8')+'\n');
  row.androidPreviewGuard=true;
  row.cleanPreview=true;
  fs.writeFileSync(path.join(target,'bootstrap.mjs'),bootScript(game,runtime.pathname));
  let html=fs.readFileSync(published,'utf8');
  // The base archive strips scripts and iframes and has a safe static catalogue.
  // Remove its placeholder, and introduce the original engine inside the existing workspace.
  html=html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,'');
  html=html.replace(/<section role="note" style="padding:16px;text-align:center"><strong>Game-specific studio snapshot<\/strong>[\s\S]*?<\/section>/g,'');
  html=html.replace(/<div class="premium-access-notice tier-access-notice">[\s\S]*?<\/button><\/div>/g,'');
  html=html.replace(/Connecting your studio\.\.\.|Archived studio — live engine unavailable|Connecting studio|Studio connected/g,'Local captured studio');
  html=html.replace(/0\/3 used/g,'Browser local').replace(/3 of 3 slots left · refills continuously/g,'No cloud quota');
  html=html.replace(/<p class="guest-free-note">[\s\S]*?<\/p>/g,'');
  html=html.replace(/<button\b[^>]*class="free-cap-help-btn"[^>]*>[\s\S]*?<\/button>/g,'');
  html=html.replace(/<button\b[^>]*class="button outline published-recordings-link"[^>]*>[\s\S]*?<\/button>/g,'');
  html=html.replace(/Record first, then sign up free to download your video\. No payment, no card needed\./g,'Browser-local recording only; cloud storage and original subscription services are not connected.');
  html=html.replace(/Settings, audio and recording are available inside the game workspace\./g,'Local simulation and playback use the captured game engine; browser recording depends on device support.');
  html=html.replace(/Recording and export are not available in this read-only snapshot\./g,'Account cloud export is unavailable. Browser-local recording is supported where the device permits.');
  html=html.replace(/<div role="note" style="position:relative;z-index:2147483647;[^>]*>[\s\S]*?<\/div>/,'<div role="note" style="padding:10px 16px;text-align:center;background:#172554;color:white;font:13px system-ui">Recovered game workspace · runs locally in this browser · original cloud services are not connected.</div>');
  html=html.replace('</head>','<style>.free-cap-studio,.published-studio-rail nav button{display:none!important}</style></head>');
  const title=game.split('-').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' ');
  const frame=iframeFor(title,runtime.pathname);
  const note='<p role="status" style="margin:12px 0;color:#93c5fd;font:13px/1.5 system-ui">Local captured engine · customizable preview · browser recording where supported</p>';
  const anchor=/<\/div><aside class="published-studio-details"/;
  if(!anchor.test(html))throw Error('Studio page layout cannot embed the game');
  html=html.replace(anchor,note+frame+'</div><aside class="published-studio-details"');
  if(!html.includes('srcdoc=')||html.includes('Unlock with Creator'))throw Error('Captured studio replacement failed');
  html=html.replace('</body>','<script type="module" src="/assets/vidirexa-mobile-frame.mjs"></script><script type="module" src="/assets/vidirexa-windows-frame.mjs"></script></body>');
  fs.writeFileSync(published,html);
  row.status='bundled';row.reason='Static engine captured; browser playback not yet tested';
  row.runtime=runtime.pathname;row.moduleFiles=fs.readdirSync(baseDir,{recursive:true}).filter(x=>/\.(mjs|js)$/.test(x)).length;
  audit.push(row);
 }catch(e){row.status='error';row.reason=String(e.message||e);audit.push(row);disabled.push(game);}
}
// Parent frame listener, shared by recovered game pages only.
fs.copyFileSync(path.join(root,'scripts/mobile-studio-frame.mjs'),path.join(out,'assets/vidirexa-mobile-frame.mjs'));
fs.copyFileSync(path.join(root,'scripts/windows-studio-frame.mjs'),path.join(out,'assets/vidirexa-windows-frame.mjs'));
// Restore catalogue navigation. Captured pages used JS-bound <button> cards,
// but the archive build removes script handlers and disables button pointer events.
// Native anchor links work without JavaScript and reach the existing studio routes.
{
 const catalogue=path.join(out,'create','index.html');
 let html=fs.readFileSync(catalogue,'utf8');
 let changed=0;
 const seen=new Set();
 html=html.replace(/<div class="game-tile-shell">[\s\S]*?<\/div>/g,shell=>{
  const m=/<a class="game-tile-about" href="\/games\/([a-z0-9-]+)"/.exec(shell);
  const game=m?.[1];
  if(!game||!gameRoute.has(game))throw Error('Unmapped game card in the Create catalogue: '+String(game));
  if(seen.has(game))throw Error('Duplicate game card: '+game);
  seen.add(game);
  const result=audit.find(row=>row.game===game);
  const available=result?.status==='bundled';
  const href=available?'/create/'+gameRoute.get(game):'/games/'+game;
  const name=game.split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
  const next=shell.replace(/<button class="(game-choice[^"]*)">([\s\S]*?)<\/button>/,
   (_,classes,inside)=>'<a class="'+classes+'" href="'+href+'" aria-label="'+(available?'Open ':'View details for ')+name+'">'+inside+'</a>');
  if(next===shell)throw Error('Could not restore click target for '+game);
  changed++;
  return next;
 });
 if(changed!==gameRoute.size||seen.size!==gameRoute.size)throw Error('Expected '+gameRoute.size+' accessible cards; got '+changed);
 const uiCss='<style>.game-tile-shell>a.game-choice{display:flex;flex-direction:column;width:100%;box-sizing:border-box;text-decoration:none;color:inherit;cursor:pointer;pointer-events:auto!important}.game-tile-shell>a.game-choice:focus-visible{outline:3px solid #22d3ee;outline-offset:4px}.game-choice .tier-badge,.game-choice .free-cap-badge,.game-choice .free-cap-overlay{display:none!important}</style>';
 html=html.replace('</head>',uiCss+'</head>');
 fs.writeFileSync(catalogue,html);
 console.log('Restored '+changed+' Create catalogue game links (native anchors).');
 // Explain missing packages on their existing game information pages rather than
 // opening a non-functional studio or linking to an unavailable backend.
 for(const row of audit.filter(r=>r.status!=='bundled')){
  const detail=path.join(out,'games',row.game,'index.html');
  if(!fs.existsSync(detail))continue;
  let page=fs.readFileSync(detail,'utf8');
  const message='<p role="status" style="padding:12px 16px;border:1px solid #a46753;border-radius:8px">This game’s original engine was not included in the archive. The game information is available, but the studio cannot run yet.</p>';
  page=page.replace(/<div class="game-landing-actions">[\s\S]*?<\/div>/,message);
  fs.writeFileSync(detail,page);
 }
}
// Restore mobile navigation on the featured homepage cards, preserving all 8
// original item cards and the existing informational About links.
{
 const homePage=path.join(out,'index.html');
 let page=fs.readFileSync(homePage,'utf8');
 let total=0;
 page=page.replace(/<div class="game-tile-shell">[\s\S]*?<\/div>/g,shell=>{
  const m=/<a class="game-tile-about" href="\/games\/([a-z0-9-]+)"/.exec(shell);
  if(!m||!gameRoute.has(m[1]))throw Error('Unexpected home featured game card');
  const game=m[1];
  const row=audit.find(x=>x.game===game);
  const href=row?.status==='bundled'?'/create/'+gameRoute.get(game):'/games/'+game;
  const newShell=shell.replace(/<button class="(game-choice[^"]*)">([\s\S]*?)<\/button>/,
   (_,classes,content)=>'<a class="'+classes+'" href="'+href+'" aria-label="Open '+escape(game.replaceAll('-',' '))+'">'+content+'</a>');
  if(newShell===shell)throw Error('Cannot restore home featured game link: '+game);
  total++;
  return newShell;
 });
 if(total!==8)throw Error('Homepage featured cards changed: expected 8, found '+total);
 fs.writeFileSync(homePage,page);
 console.log('Restored '+total+' mobile-tappable featured homepage game cards.');
}
fs.writeFileSync(path.join(out,'captured-game-audit.json'),JSON.stringify({generatedAt:new Date().toISOString(),total:gameRoute.size,results:audit},null,2));
const summary={total:gameRoute.size,bundled:audit.filter(x=>x.status==='bundled').length,cleanPreviews:audit.filter(x=>x.cleanPreview).length,localRecording:audit.filter(x=>x.localRecording).length,webmDurationRepair:audit.filter(x=>x.webmDurationRepair).length,instagramMp4Export:audit.filter(x=>x.instagramMp4Export).length,androidPreviewGuard:audit.filter(x=>x.androidPreviewGuard).length,midiCapable:audit.filter(x=>x.midiImportVerified).length,unavailable:audit.filter(x=>x.status==='unavailable').length,errors:audit.filter(x=>x.status==='error').length,disabled};
console.log('Recovered game audit:',JSON.stringify(summary));
if(summary.bundled<60||summary.cleanPreviews!==summary.bundled||summary.localRecording!==summary.bundled||summary.webmDurationRepair!==summary.bundled||summary.instagramMp4Export!==summary.bundled||summary.androidPreviewGuard!==summary.bundled||summary.midiCapable!==8)throw Error('Incomplete captured game or clean-preview build: '+JSON.stringify(summary));
