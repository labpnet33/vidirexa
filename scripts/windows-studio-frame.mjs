// Windows desktop only: keep the recovered studio's scroll viewport bounded
// to the browser window so its existing sticky preview remains in view while
// adjusting settings. This intentionally does not affect Android/mobile.
const isWindows=()=>/Windows|Win32|Win64/i.test([navigator.userAgentData?.platform,navigator.platform,navigator.userAgent].join(' '));
const desktop=window.matchMedia('(min-width: 801px) and (pointer: fine)');
const frames=[...document.querySelectorAll('iframe[data-vidirexa-studio-frame]')];
if(isWindows()){
 const sync=()=>{
  for(const frame of frames){
   if(desktop.matches){
    frame.style.setProperty('--vidirexa-frame-height','clamp(560px,calc(100dvh - 92px),960px)');
    frame.setAttribute('scrolling','auto');
   }else{
    frame.style.removeProperty('--vidirexa-frame-height');
   }
  }
 };
 sync();
 desktop.addEventListener?.('change',sync);
}
