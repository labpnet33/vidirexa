// Small, dependency-free EBML Duration repair for finalized MediaRecorder WebM.
// Writes only the Segment Info metadata and reuses the original video/audio
// payload as Blob slices (avoids reading an entire long recording into JS memory).
const MAX_HEADER=1024*1024;
const isBytePrefix=(data,start,pattern)=>pattern.every((b,i)=>data[start+i]===b);
function vintLength(first,max){
 if(first===0)throw Error('Invalid EBML variable integer');
 for(let n=1;n<=max;n++)if(first&(0x80>>(n-1)))return n;
 throw Error('Invalid EBML VINT');
}
function integer(data,start,length,maskFirst=false){
 let n=BigInt(maskFirst?data[start]&((1<<(8-length))-1):data[start]);
 for(let i=1;i<length;i++)n=(n<<8n)|BigInt(data[start+i]);
 return n;
}
function element(data,start){
 if(start>=data.length)return null;
 const idLength=vintLength(data[start],4);
 if(start+idLength>=data.length)return null;
 const sizeStart=start+idLength;
 const sizeLength=vintLength(data[sizeStart],8);
 const payloadStart=sizeStart+sizeLength;
 if(payloadStart>data.length)return null;
 const id=Number(integer(data,start,idLength));
 const sizeBig=integer(data,sizeStart,sizeLength,true);
 const unknown=sizeBig===(1n<<BigInt(7*sizeLength))-1n;
 const size=unknown?null:Number(sizeBig);
 if(size!==null&&!Number.isSafeInteger(size))throw Error('Unsupported oversized EBML element');
 return {id,start,idLength,sizeLength,payloadStart,size,unknown,end:size===null?null:payloadStart+size};
}
function encodedSize(value,atLeast){
 for(let n=atLeast;n<=8;n++){
  const bits=BigInt(n*7),max=(1n<<bits)-2n;
  if(BigInt(value)>max)continue;
  let v=BigInt(value)|(1n<<bits);
  const arr=new Uint8Array(n);
  for(let i=n-1;i>=0;i--){arr[i]=Number(v&255n);v>>=8n}
  return arr;
 }
 throw Error('WebM Info is too large for EBML duration metadata');
}
function durationBytes(seconds,scale,precision=8){
 const value=seconds*1e9/scale;
 if(!Number.isFinite(value)||value<=0)throw Error('Invalid WebM duration');
 const bytes=new Uint8Array(precision);
 const view=new DataView(bytes.buffer);
 if(precision===4)view.setFloat32(0,value,false);
 else view.setFloat64(0,value,false);
 return bytes;
}
function locateInfo(data){
 let pos=0;
 for(let limit=0;pos<data.length&&limit<30;limit++){
  const tag=element(data,pos);
  if(!tag)break;
  if(tag.id===0x18538067){
   // Live MediaRecorder segments normally have unknown length.
   let p=tag.payloadStart;
   for(let count=0;p<data.length&&count<250;count++){
    const child=element(data,p);
    if(!child)break;
    if(child.id===0x1549A966)return {segment:tag,info:child};
    if(child.unknown||child.end>data.length)break;
    p=child.end;
   }
   break;
  }
  if(tag.unknown||tag.end>data.length)break;
  pos=tag.end;
 }
 return null;
}
export async function fixWebmDuration(blob,durationSeconds){
 if(!String(blob?.type||'').startsWith('video/webm'))return blob;
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw Error('Invalid completed recording duration');
 const header=new Uint8Array(await blob.slice(0,Math.min(MAX_HEADER,blob.size)).arrayBuffer());
 const located=locateInfo(header);
 if(!located)throw Error('WebM duration repair could not find Segment Info');
 const {segment,info}=located;
 if(!info.end||info.end>header.length)throw Error('WebM Info was not completely captured in header sample');
 if(!segment.unknown)throw Error('WebM Segment uses a fixed length; cannot safely append metadata');
 let scale=1000000,previousDuration=null,p=info.payloadStart;
 while(p<info.end){
  const tag=element(header,p);
  if(!tag||tag.unknown||tag.end>info.end)throw Error('Invalid WebM Info element');
  if(tag.id===0x2AD7B1){
   scale=Number(integer(header,tag.payloadStart,tag.size));
  }else if(tag.id===0x4489)previousDuration=tag;
  p=tag.end;
 }
 if(previousDuration){
  if(![4,8].includes(previousDuration.size))throw Error('Unsupported WebM Duration float encoding');
  const previous=new DataView(header.buffer,header.byteOffset+previousDuration.payloadStart,previousDuration.size);
  const current=previousDuration.size===4?previous.getFloat32(0,false):previous.getFloat64(0,false);
  if(Number.isFinite(current)&&current>0)return blob;
  return new Blob([
   blob.slice(0,previousDuration.payloadStart),
   durationBytes(durationSeconds,scale,previousDuration.size),
   blob.slice(previousDuration.end)
  ],{type:blob.type});
 }
 const length=11;
 const newSize=encodedSize(info.size+length,info.sizeLength);
 const newDuration=new Uint8Array(3+8);
 newDuration.set([0x44,0x89,0x88],0);
 newDuration.set(durationBytes(durationSeconds,scale),3);
 return new Blob([
  blob.slice(0,info.start),
  blob.slice(info.start,info.start+info.idLength),
  newSize,
  blob.slice(info.payloadStart,info.end),
  newDuration,
  blob.slice(info.end)
 ],{type:blob.type});
}
