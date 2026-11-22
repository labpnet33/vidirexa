// Browser-side mobile iframe height handling. Installed only on studio pages.
const frames=[...document.querySelectorAll('iframe[data-vidirexa-studio-frame]')];
const mobile=window.matchMedia('(max-width: 800px)');
const FRAME_MESSAGE='vidirexa:studio-height';
function applyHeight(frame,height){
 if(!mobile.matches)return;
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
 for(const frame of frames){
  try{frame.contentWindow?.postMessage({type:'vidirexa:studio-height-request'},window.location.origin)}catch{}
 }
}
for(const frame of frames)frame.addEventListener('load',requestHeights);
mobile.addEventListener?.('change',()=>{
 if(!mobile.matches){for(const frame of frames)frame.style.height='1650px';}
 else requestHeights();
});
requestHeights();
