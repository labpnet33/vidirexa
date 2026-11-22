// Lightweight MIDI/audio diagnostics, computed from the same PCM buffer that
// is exported. Never shifts audio or changes the original song/physics.
export function inspectMidiAudioSync(adapter,audio){
 const config=adapter?.config||{};
 const level=adapter?.level||adapter?.plan||{};
 const custom=config.song==='custom'||config.musicMode==='midi'||
  level.song?.custom===true||level.source==='custom';
 if(!custom)return null;
 const events=level.audioNotes||level.audio?.notes||[];
 if(!audio||!Array.isArray(events)||!events.length)
  return {status:'unverified',notesChecked:0,audibleOnsets:0};
 const rate=audio.sampleRate||0,channel=audio.getChannelData?.(0);
 if(!channel||!rate)return {status:'unverified',notesChecked:0,audibleOnsets:0};
 const duration=audio.duration;
 const times=[...new Set(events.map(note=>Number(note.t))
  .filter(t=>Number.isFinite(t)&&t>=0.05&&t<duration-.25)
  .map(t=>Math.round(t*1000)/1000))].slice(0,32);
 let audible=0;
 for(const t of times){
  const start=Math.max(0,Math.floor(t*rate));
  const end=Math.min(channel.length,Math.floor((t+.16)*rate));
  let peak=0;
  for(let i=start;i<end;i+=Math.max(1,Math.floor(rate/4000)))
   peak=Math.max(peak,Math.abs(channel[i]));
  if(peak>.00035)audible++;
 }
 const status=times.length>=2&&audible<Math.ceil(times.length*.5)?'check-audio':'verified';
 return {status,notesChecked:times.length,audibleOnsets:audible};
}
