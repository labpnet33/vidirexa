// Keep recovered studio content scrollable without clipping its live preview.
// On Android, isolate the editor from the outer archived page and let the
// engine's built-in floating-mini-preview follow the editor's own scroll.
const frames=[...document.querySelectorAll('iframe[data-vidirexa-studio-frame]')];
const mobile=window.matchMedia('(max-width: 800px)');
const FRAME_MESSAGE='vidirexa:studio-height';
const android=/Android/i.test(navigator.userAgent)&&window.matchMedia('(pointer: coarse)').matches;

function activateAndroidStudio(){
 if(!android||!frames.length)return;
 document.documentElement.classList.add('vidirexa-android','vidirexa-android-studio');
 document.querySelectorAll('nav.mobile-bottom-nav').forEach(nav=>nav.remove());
 if(!document.querySelector('.vidirexa-android-studio-toolbar')){
  const toolbar=document.createElement('div');
  toolbar.className='vidirexa-android-studio-toolbar';
  toolbar.setAttribute('role','navigation');
  toolbar.setAttribute('aria-label','Game editor navigation');
  const back=document.createElement('a');
  back.href='/create';
  back.textContent='‹  All games';
  back.setAttribute('aria-label','Back to all games');
  toolbar.append(back);
  document.body.append(toolbar);
 }
 for(const frame of frames){
  frame.setAttribute('scrolling','auto');
  // The generated mobile stylesheet pins it to the visible viewport.
  // Avoid a competing inline height from the earlier auto-size implementation.
  frame.style.removeProperty('height');
 }
 window.scrollTo(0,0);
}
function applyHeight(frame,height){
 if(android||!mobile.matches)return;
 if(!Number.isFinite(height)||height<400||height>7500)return;
 const next=Math.ceil(height+12);
 if(Math.abs(frame.getBoundingClientRect().height-next)>8)frame.style.height=next+'px';
}
window.addEventListener('message',event=>{
 if(event.origin!==window.location.origin||event.data?.type!==FRAME_MESSAGE)return;
 const frame=frames.find(node=>node.contentWindow===event.source);
 if(frame)applyHeight(frame,Number(event.data.height));
});
function requestHeights(){
 if(android)return;
 for(const frame of frames){
  try{frame.contentWindow?.postMessage({type:'vidirexa:studio-height-request'},window.location.origin)}catch{}
 }
}
for(const frame of frames)frame.addEventListener('load',()=>{
 activateAndroidStudio();
 requestHeights();
});
mobile.addEventListener?.('change',()=>{
 if(android){activateAndroidStudio();return}
 if(!mobile.matches){for(const frame of frames)frame.style.height='1650px'}
 else requestHeights();
});
activateAndroidStudio();
requestHeights();
