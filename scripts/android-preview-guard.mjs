// Android fallback: keep the ORIGINAL live simulation canvas visible.
// The native studio normally activates .v-float when its preview leaves view.
// If that fails (or floats outside the visible mobile viewport), pin the
// existing .v-phone element without cloning canvases or starting a renderer.
const android=/Android/i.test(navigator.userAgent)&&matchMedia('(pointer: coarse)').matches;
if(android){
 let scheduled=false,observed=false;
 const viewport=()=>{
  const width=document.documentElement.clientWidth||innerWidth;
  const height=window.visualViewport?.height||innerHeight;
  return {width,height};
 };
 const update=()=>{
  scheduled=false;
  if(document.visibilityState==='hidden')return;
  const studio=document.getElementById('studio');
  const preview=studio?.querySelector('.v-preview');
  const phone=preview?.querySelector('.v-phone');
  if(!preview||!phone)return;
  const v=viewport(),p=preview.getBoundingClientRect(),r=phone.getBoundingClientRect();
  const deliberatelyMinimized=phone.classList.contains('v-mini-collapsed');
  const originalInSight=p.bottom>=32&&p.top<v.height-60;
  const nativeMiniInSight=!phone.classList.contains('v-android-preview-guard')&&phone.classList.contains('v-float')&&
    r.top>=-4&&r.bottom<=v.height+4&&r.left>=-4&&r.right<=v.width+4;
  // Once a native mini-preview is visible, let the engine manage it.
  // Avoid covering form controls while the Android on-screen keyboard is open.
  const inputFocused=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');
  const keyboardOpen=inputFocused&&window.visualViewport&&
    window.visualViewport.height<window.innerHeight*0.72;
  const mustPin=!keyboardOpen&&!deliberatelyMinimized&&!originalInSight&&!nativeMiniInSight&&
    window.scrollY>80&&v.width<=800;
  phone.classList.toggle('v-android-preview-guard',mustPin);
  if(mustPin)phone.dataset.previewGuard='visible';
  else delete phone.dataset.previewGuard;
 };
 const schedule=()=>{
  if(!scheduled){scheduled=true;requestAnimationFrame(update)}
 };
 window.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('orientationchange',schedule,{passive:true});
 document.addEventListener('focusin',schedule,{passive:true});
 document.addEventListener('focusout',schedule,{passive:true});
 document.addEventListener('visibilitychange',schedule,{passive:true});
 // Native floating classes change asynchronously after scroll. Re-evaluate
 // once the studio toggles them, but never alter the engine's class names.
 const observer=new MutationObserver(schedule);
 const connect=()=>{
  if(observed)return;
  const root=document.querySelector('#studio .v-preview');
  if(!root)return;
  observed=true;
  mountObserver.disconnect();
  observer.observe(root,{subtree:true,attributes:true,attributeFilter:['class','style']});
  schedule();
 };
 const mountObserver=new MutationObserver(connect);
 mountObserver.observe(document.documentElement,{subtree:true,childList:true});
 connect();
 window.addEventListener('pagehide',()=>{observer.disconnect();mountObserver.disconnect()},{once:true});
}
