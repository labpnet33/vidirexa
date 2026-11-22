// Adaptive PREVIEW frame pacing for original recovered games.
// No second canvas, renderer, physics change, or export-resolution reduction.
// Export and seek requests always use the original exact-time renderer.
export function installAdaptivePreview(game){
 const key=game.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 const mobile=matchMedia('(max-width: 800px) and (pointer: coarse)');
 const slowDevice=()=>{
  const cpu=navigator.hardwareConcurrency||8,ram=navigator.deviceMemory||8;
  return mobile.matches&&(cpu<=4||ram<=4||navigator.connection?.saveData===true);
 };
 const patched=new WeakSet();
 let observed=null,disposed=false;
 const publicStats={game,mode:'full',targetFps:60,renderMs:0,skipped:0,frames:0};
 // Diagnostic hook only; not a separate player or a new UI.
 window.__vidirexaPreviewPerformance=publicStats;
 function watch(){
  if(disposed)return;
  const state=window[key],adapter=state?.adapter;
  if(!adapter||typeof adapter.renderAt!=='function'||patched.has(adapter))return;
  patched.add(adapter);
  const original=adapter.renderAt.bind(adapter);
  let lastWall=-Infinity,lastTime=-Infinity,lastResult=null,average=0,fastFrames=0;
  adapter.renderAt=function(t,...args){
   const explicitTime=Number(t),now=performance.now();
   const recording=!!(state.busy||window.__vidirexaIsExporting);
   // A timeline seek, reset, export, or large simulation jump must not be
   // throttled. Only consecutive playback ticks may be coalesced.
   const sequential=Number.isFinite(explicitTime)&&Number.isFinite(lastTime)&&
      explicitTime>lastTime&&explicitTime-lastTime<=0.045;
   const throttle=!recording&&!document.hidden&&sequential&&publicStats.targetFps<60&&
      now-lastWall<1000/publicStats.targetFps;
   if(throttle&&lastResult!==null){
    publicStats.skipped++;
    return lastResult;
   }
   const start=performance.now();
   const result=original(t,...args);
   const elapsed=performance.now()-start;
   average=average?average*0.9+elapsed*0.1:elapsed;
   publicStats.renderMs=Math.round(average*10)/10;
   publicStats.frames++;
   lastWall=now;lastTime=explicitTime;lastResult=result;
   if(recording){
    publicStats.targetFps=60;publicStats.mode='export-unlimited';
   }else if(slowDevice()||average>21){
    publicStats.targetFps=30;publicStats.mode='adaptive-30';
    fastFrames=0;
   }else{
    if(++fastFrames>90){publicStats.targetFps=60;publicStats.mode='full'}
   }
   return result;
  };
 }
 watch();
 const timer=setInterval(watch,650);
 window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer)},{once:true});
}
