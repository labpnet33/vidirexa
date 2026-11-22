// Browser-side MP4 validation. Reads only ISO BMFF headers and never decodes
// or copies video payloads. A file whose first two seconds play but whose
// timeline ends early must not be labeled Instagram-ready.
const decode=(view,start)=>String.fromCharCode(...new Uint8Array(view.buffer,view.byteOffset+start,4));
function boxes(view,start,end){
 const result=[];
 for(let at=start;at+8<=end;){
  let size=view.getUint32(at),header=8;
  const type=decode(view,at+4);
  if(size===1){
   if(at+16>end)throw Error('Truncated extended MP4 box');
   const wide=view.getBigUint64(at+8);
   if(wide>BigInt(Number.MAX_SAFE_INTEGER))throw Error('MP4 box exceeds safe browser offsets');
   size=Number(wide);header=16;
  }else if(size===0)size=end-at;
  if(size<header||at+size>end)throw Error('Malformed MP4 '+type+' box');
  result.push({type,start:at+header,end:at+size,offset:at});
  at+=size;
 }
 return result;
}
const children=(view,box)=>boxes(view,box.start,box.end);
function seconds(view,mdhd){
 const pos=mdhd.start,version=view.getUint8(pos);
 const scaleOffset=version===1?20:12;
 const durationOffset=version===1?24:16;
 if(pos+durationOffset+(version===1?8:4)>mdhd.end)throw Error('Truncated MP4 track duration');
 const timescale=view.getUint32(pos+scaleOffset);
 if(!timescale)throw Error('Invalid MP4 track timescale');
 const length=version===1?Number(view.getBigUint64(pos+durationOffset)):view.getUint32(pos+durationOffset);
 return length/timescale;
}
function tracks(view,moov){
 const result={};
 for(const trak of children(view,moov).filter(box=>box.type==='trak')){
  const mdia=children(view,trak).find(box=>box.type==='mdia');
  if(!mdia)continue;
  const mdiaBoxes=children(view,mdia);
  const mdhd=mdiaBoxes.find(box=>box.type==='mdhd');
  const hdlr=mdiaBoxes.find(box=>box.type==='hdlr');
  if(!mdhd||!hdlr||hdlr.start+12>hdlr.end)continue;
  const kind=decode(view,hdlr.start+8);
  if(kind==='vide'||kind==='soun')result[kind]=Math.max(result[kind]??0,seconds(view,mdhd));
 }
 return result;
}
export function verifyInstagramMp4(bytes,expectedDuration){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(data.byteLength<4096)throw Error('MP4 is empty or incomplete');
 const expected=Number(expectedDuration);
 if(!Number.isFinite(expected)||expected<=0||expected>180)throw Error('Invalid intended MP4 duration');
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 const top=boxes(view,0,view.byteLength);
 const ftyp=top.find(x=>x.type==='ftyp'),moov=top.find(x=>x.type==='moov'),mdat=top.find(x=>x.type==='mdat');
 if(!ftyp||!moov||!mdat||ftyp.offset>moov.offset||moov.offset>mdat.offset)
  throw Error('MP4 must be fast-start with ftyp, moov and mdat');
 const durations=tracks(view,moov);
 const allowance=Math.max(0.8,expected*0.025);
 for(const [kind,label] of [['vide','video'],['soun','audio']]){
  const found=durations[kind];
  if(!Number.isFinite(found)||Math.abs(found-expected)>allowance)
   throw Error('Incomplete '+label+' track: '+String(found??'missing')+'s instead of '+expected+'s');
 }
 if(Math.abs(durations.vide-durations.soun)>allowance)
  throw Error('MP4 audio and video tracks have different durations');
 return {duration:durations.vide,audioDuration:durations.soun,fastStart:true};
}
