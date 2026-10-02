// Shared deterministic timeline format. Copy the same file to client/src and server/src.
export type ArtworkPose={x:number;y:number;z:number;rotationX:number;rotationY:number;rotationZ:number;scale:number;opacity:number};
export type ArtworkInterpolation="linear"|"ease-in"|"ease-out"|"ease-in-out";
export type ArtworkKey=ArtworkPose&{timeMs:number;interpolation?:ArtworkInterpolation};
export type ArtworkTrack={mediaId:string;durationMs?:number;repeatCount?:number;keys:ArtworkKey[]};
export type ArtworkTimeline={version:1;durationMs:number;tracks:ArtworkTrack[]};
export const emptyArtworkTimeline=():ArtworkTimeline=>({version:1,durationMs:10000,tracks:[]});
export function cleanArtworkTimeline(raw:any):ArtworkTimeline {
  if(!raw||raw.version!==1||!Array.isArray(raw.tracks)||raw.tracks.length>64)throw new Error('invalid-timeline');
  const durationMs=Number(raw.durationMs);
  if(!Number.isFinite(durationMs)||durationMs<1000||durationMs>3600000)throw new Error('invalid-duration');
  const ids=new Set<string>();let totalKeys=0;
  const tracks=raw.tracks.map((track:any):ArtworkTrack=>{
    const mediaId=String(track?.mediaId||'');
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(mediaId)||ids.has(mediaId)||!Array.isArray(track.keys)||!track.keys.length||track.keys.length>120)throw new Error('invalid-track');
    const trackDuration=track.durationMs===undefined?durationMs:track.durationMs;
    const repeatCount=track.repeatCount===undefined?1:track.repeatCount;
    if(typeof trackDuration!=="number"||!Number.isFinite(trackDuration)||trackDuration<1000||trackDuration>3600000)throw new Error('invalid-track-duration');
    if(typeof repeatCount!=="number"||!Number.isInteger(repeatCount)||repeatCount<0||repeatCount>1000)throw new Error('invalid-repeat-count');
    ids.add(mediaId);const times=new Set<number>();
    totalKeys+=track.keys.length;if(totalKeys>512)throw new Error('room-key-limit-512');
    const keys=track.keys.map((key:any):ArtworkKey=>{
      const fields=['timeMs','x','y','z','rotationX','rotationY','rotationZ','scale','opacity'] as const;
      const value={} as ArtworkKey;
      for(const field of fields){if(typeof key?.[field]!=='number'||!Number.isFinite(key[field]))throw new Error('invalid-key');value[field]=key[field];}
      if(key.interpolation!==undefined){
        if(!["linear","ease-in","ease-out","ease-in-out"].includes(key.interpolation))throw new Error("invalid-interpolation");
        value.interpolation=key.interpolation;
      }
      value.timeMs=Math.round(value.timeMs);
      if(value.timeMs<0||value.timeMs>trackDuration||times.has(value.timeMs)||Math.abs(value.x)>1000||Math.abs(value.y)>1000||Math.abs(value.z)>1000||value.scale<.05||value.scale>20||value.opacity<0||value.opacity>1||Math.max(Math.abs(value.rotationX),Math.abs(value.rotationY),Math.abs(value.rotationZ))>36000)throw new Error('key-outside-limits');
      times.add(value.timeMs);return value;
    }).sort((a:ArtworkKey,b:ArtworkKey)=>a.timeMs-b.timeMs);
    return {mediaId,keys,durationMs:Math.round(trackDuration),repeatCount};
  });
  return {version:1,durationMs:Math.round(durationMs),tracks};
}
export function artworkPoseAt(track:ArtworkTrack,timeMs:number):ArtworkPose {
  const keys=track.keys;let left=keys[0],right=keys[keys.length-1];
  if(timeMs<=left.timeMs)return {...left};
  if(timeMs>=right.timeMs)return {...right};
  for(let i=1;i<keys.length;i++){if(timeMs<=keys[i].timeMs){left=keys[i-1];right=keys[i];break;}}
  const u=artworkEase((timeMs-left.timeMs)/Math.max(1,right.timeMs-left.timeMs),left.interpolation),pose={} as ArtworkPose;
  // Rotation uses literal degrees so 0 -> 360 produces one complete turn.
  for(const field of ['x','y','z','rotationX','rotationY','rotationZ','scale','opacity'] as const)pose[field]=left[field]+(right[field]-left[field])*u;
  return pose;
}

export function artworkPlaybackAt(track:ArtworkTrack,elapsedMs:number,defaultDuration=10000){
  const duration=track.durationMs??defaultDuration,repeats=track.repeatCount??1,elapsed=Math.max(0,elapsedMs);
  const ended=repeats>0&&elapsed>=duration*repeats;
  return {positionMs:ended?duration:elapsed%duration,cycle:ended?repeats:Math.floor(elapsed/duration)+1,ended};
}

// Preserve relative key positions when the user changes playback length.
export function retimeArtworkTrack(track:ArtworkTrack,durationMs:number,defaultDuration=10000):ArtworkTrack {
  if(!Number.isFinite(durationMs)||durationMs<1000||durationMs>3600000)throw new Error("LENGTH must be between 1 and 3600 seconds.");
  const previous=track.durationMs??defaultDuration,next=Math.round(durationMs);
  const keys=track.keys.map(key=>({...key,timeMs:Math.round(key.timeMs*next/previous)}));
  if(new Set(keys.map(key=>key.timeMs)).size!==keys.length)throw new Error("LENGTH is too short to keep these keys separate. Choose a longer length.");
  return {...track,durationMs:next,keys};
}

export function artworkEase(progress:number,mode:ArtworkInterpolation="linear"){
  const u=Math.max(0,Math.min(1,progress));
  if(mode==="ease-in")return u*u;
  if(mode==="ease-out")return 1-(1-u)*(1-u);
  if(mode==="ease-in-out")return u<.5?2*u*u:1-2*(1-u)*(1-u);
  return u;
}
