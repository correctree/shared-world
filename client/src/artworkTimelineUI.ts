import { createArtworkTimelineDock } from "./artworkTimelineDock";
import { artworkPoseAt, artworkPlaybackAt, retimeArtworkTrack, cleanArtworkTimeline, emptyArtworkTimeline, type ArtworkKey, type ArtworkTimeline } from "./artworkTimeline";

type Context={
  app:any;pc:any;getRoom:()=>any;getItems:()=>Map<string,any>;getSelected:()=>string|null;
  canEdit:()=>boolean;canDirect:()=>boolean;getAuthoritative:(id:string)=>any;buttonHost:HTMLElement;dispatchAction:(id:string,action:string)=>void;onSaved?:()=>void;
};
export function createArtworkTimelineUI(ctx:Context){
  let room:any=null,timeline=emptyArtworkTimeline(),revision=0;
  const dirtySettings=new Set<string>();
  let lastSelected:string|null=null;
  let offset=0,clockReady=false,selectedKey=-1,busy=false,lastPing=0,uiAt=0;
  const transports=new Map<string,any>();
  const animated=new Map<string,{entity:any;position:any;rotation:any;scale:any;materials:Map<any,{original:any;copy:any;opacity:number;blend:number;depth:boolean;alphaTest:number}>}>();
  const panel=document.createElement("section");panel.id="artworkTimelinePanel";panel.hidden=false;
  panel.innerHTML=`<header><strong>ARTWORK TIMELINE <small>0.26.2</small></strong></header>
    <select data-f="target" hidden aria-label="Selected artwork"></select>
    <div class="at-clock"><span data-f="clock">0.0 / 10.0 s</span><strong data-f="state">STOPPED</strong></div>
    <input type="range" data-f="scrub" min="0" max="10000" step="100" value="0" aria-label="Timeline position">
    <div class="at-buttons at-transport"><button data-a="media">▶ PLAY</button><button data-a="play">DO · TIMELINE</button><button data-a="pause">Ⅱ PAUSE TL</button><button data-a="stop">■ STOP</button></div>
    <div class="at-pair"><label>LENGTH (s)<input data-f="duration" type="number" min="1" max="3600" step="1" value="10"></label><button data-a="length">SET LENGTH</button></div>
    <div class="at-pair"><label>REPEAT COUNT (0 = ∞)<input data-f="repeat" type="number" min="0" max="1000" step="1" value="1"></label><button data-a="repeat">SET REPEAT</button></div>
    <button data-a="open">OPEN TIMELINE ↗</button>
    <div class="at-keys" data-f="keys"></div>
    <div class="at-grid">
      <label>TIME (s)<input data-f="time" type="number" min="0" max="3600" step="0.1" value="0"></label>
      <label>SIZE<input data-f="scale" type="number" min="0.05" max="20" step="0.05" value="1"></label>
      <label>X<input data-f="x" type="number" step="0.1" value="0"></label><label>Y<input data-f="y" type="number" step="0.1" value="1.8"></label><label>Z<input data-f="z" type="number" step="0.1" value="-3"></label>
      <label>ANGLE X (°)<input data-f="rotationX" type="number" step="5" value="0"></label><label>ANGLE Y (°)<input data-f="rotationY" type="number" step="5" value="0"></label><label>ANGLE Z (°)<input data-f="rotationZ" type="number" step="5" value="0"></label>
      <label>OPACITY<input data-f="opacity" type="number" min="0" max="1" step="0.1" value="1"></label>
    </div>
    <div class="at-buttons"><button data-a="capture">CAPTURE POSE</button><button data-a="save">SAVE KEY</button><button data-a="delete">DELETE KEY</button></div>
    <p class="at-help">Select a saved key to edit. SAVE KEY stores all values at TIME. Equal time replaces a key. Angles 0 → 360 make one full turn. PLAY starts media + timeline. DO starts only this timeline. SET LENGTH rescales all key times proportionally. Repeat 0 = infinite; 1 = once. Natural end holds the final pose. STOP restores this artwork’s saved placement. Owner / Editor edits; Director can play. Up to 120 keys per artwork, 512 per ROOM.</p>
    <div data-f="message" role="status">Connect to a ROOM.</div>`;
  const style=document.createElement("style");style.textContent=`
    #artworkTimelinePanel{position:relative;width:100%;max-width:100%;overflow:auto;box-sizing:border-box;padding:14px;background:#101923;color:#f2f6fa;border:1px solid #4c7795;border-radius:14px;font:12px system-ui;box-shadow:0 12px 40px #0008}
    #artworkTimelinePanel[hidden]{display:none!important}#artworkTimelinePanel header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}#artworkTimelinePanel small{color:#90a9bc;font-size:10px}
    :is(#artworkTimelinePanel,#artworkTimelineDock) label{display:grid;gap:4px;font-size:10px;color:#a8bdcc;margin:0}:is(#artworkTimelinePanel,#artworkTimelineDock) input,:is(#artworkTimelinePanel,#artworkTimelineDock) select{width:100%;box-sizing:border-box;min-width:0;padding:8px;border:1px solid #3b5465;border-radius:7px;background:#1a2834;color:white}
    :is(#artworkTimelinePanel,#artworkTimelineDock) button{padding:10px 6px;background:#263f51;color:white;border:1px solid #53758d;border-radius:7px;min-width:0;cursor:pointer}:is(#artworkTimelinePanel,#artworkTimelineDock) button:disabled{opacity:.35;cursor:default}:is(#artworkTimelinePanel,#artworkTimelineDock) button[data-a="close"]{padding:4px 10px;font-size:22px}
    .at-clock,.at-pair{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0}.at-pair label{flex:1}.at-clock{color:#ffca79;font-variant-numeric:tabular-nums}.at-buttons,.at-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.at-transport{grid-template-columns:repeat(2,minmax(0,1fr))}.at-keys{display:grid;gap:5px;max-height:140px;overflow:auto}.at-keys button{text-align:left}.at-keys button[aria-pressed="true"]{outline:2px solid #67d4ff;background:#25465e!important}.at-help{font-size:10px;color:#a2b5c3;line-height:1.6}:is(#artworkTimelinePanel,#artworkTimelineDock) [data-f="message"]{padding:8px;background:#0b1119;border-radius:7px;white-space:pre-wrap}
    @media(max-width:640px){#artworkTimelinePanel{padding:10px}:is(#artworkTimelinePanel,#artworkTimelineDock) input,:is(#artworkTimelinePanel,#artworkTimelineDock) select{font-size:16px}:is(#artworkTimelinePanel,#artworkTimelineDock) button{min-height:42px;font-size:10px}}`;
  document.head.append(style);
  const dock=createArtworkTimelineDock({
    revision:()=>revision,
    select:(index:number)=>{const key=currentTrack()?.keys[index];if(!key||state().status==="playing")return;selectedKey=index;fill(key);refresh(true);},
    move:(index:number,timeMs:number,expectedRevision:number,id:string)=>{
      if(id!==target.value||expectedRevision!==revision||busy||!ctx.canEdit()||state().status==="playing"){message("Timeline changed. Select the key again.");return;}
      const definition=JSON.parse(JSON.stringify(timeline)) as ArtworkTimeline,track=definition.tracks.find(t=>t.mediaId===id);
      if(!track?.keys[index])return;
      if(track.keys.some((key,i)=>i!==index&&key.timeMs===timeMs)){message("A key already exists at this time. Move to another time.");refresh(true);return;}
      track.keys[index].timeMs=timeMs;selectedKey=-1;field<HTMLInputElement>("time").value=String(timeMs/1000);save(definition);
    },
    seek:(timeMs:number)=>{field<HTMLInputElement>("time").value=String(timeMs/1000);selectedKey=-1;transport("seek",timeMs);},
    action:(action:string)=>panel.querySelector<HTMLButtonElement>(`[data-a="${action}"]`)?.click()
  });
  for(const selector of [".at-keys",".at-grid",".at-buttons:not(.at-transport)",".at-help",'[data-f="message"]']){const node=panel.querySelector<HTMLElement>(selector);if(node)dock.editor.append(node);}
  const field=<T extends HTMLElement>(name:string)=>(panel.querySelector<T>(`[data-f="${name}"]`)??dock.editor.querySelector<T>(`[data-f="${name}"]`))!;
  const actionButton=(name:string)=>(panel.querySelector<HTMLButtonElement>(`[data-a="${name}"]`)??dock.editor.querySelector<HTMLButtonElement>(`[data-a="${name}"]`))!;
  const target=field<HTMLSelectElement>("target"),scrub=field<HTMLInputElement>("scrub"),keys=field<HTMLElement>("keys");
  const message=(text:string)=>{field<HTMLElement>("message").textContent=text;};
  const numbers=["x","y","z","rotationX","rotationY","rotationZ","scale","opacity"] as const;
  function currentTrack(){return timeline.tracks.find(t=>t.mediaId===target.value);}
  function state(id=target.value){return transports.get(id)??{status:"stopped",elapsedMs:0,startedAt:0,preview:false};}
  function frame(track=currentTrack()){
    const t=state(track?.mediaId),elapsed=t.status==="playing"?Date.now()+offset-t.startedAt:t.elapsedMs;
    return track?artworkPlaybackAt(track,elapsed,timeline.durationMs):{positionMs:0,cycle:0,ended:false};
  }
  function position(){return frame().positionMs;}
  function fill(key:ArtworkKey){field<HTMLInputElement>("time").value=String(key.timeMs/1000);for(const n of numbers)field<HTMLInputElement>(n).value=String(Math.round(key[n]*10000)/10000);}
  function capture(){
    const item=ctx.getItems().get(target.value);if(!item){message("Select a loaded visual artwork.");return;}
    const e=item.entity,p=e.getPosition(),r=e.getEulerAngles(),s=e.getLocalScale();
    const track=currentTrack(),pose=state().preview&&track?artworkPoseAt(track,frame(track).positionMs):null;
    fill({timeMs:Math.round(Number(field<HTMLInputElement>("time").value)*1000)||0,x:p.x,y:p.y,z:p.z,rotationX:r.x,rotationY:r.y,rotationZ:r.z,scale:s.x,opacity:pose?.opacity??1});
    selectedKey=-1;message("Pose captured. Set TIME and SAVE KEY.");
  }
  function refresh(rebuild=false){
    const items=Array.from(ctx.getItems().values()).filter(i=>i.kind!=="audio"&&ctx.getAuthoritative(i.id));
    const signature=items.map(i=>i.id+":"+i.title).join("|");
    if(target.dataset.signature!==signature){
      const old=target.value;target.replaceChildren();target.dataset.signature=signature;
      for(const item of items){const option=document.createElement("option");option.value=item.id;option.textContent=item.title;target.append(option);}
      if(items.some(i=>i.id===old))target.value=old;else if(items.some(i=>i.id===ctx.getSelected()))target.value=ctx.getSelected()!;
      rebuild=true;
    }
    const selected=ctx.getSelected()||"";
    if(lastSelected!==selected){lastSelected=selected;dirtySettings.clear();target.value=selected;selectedKey=-1;field<HTMLInputElement>("time").value="0";if(selected)capture();rebuild=true;}
    const status=state().status,track=currentTrack(),duration=track?.durationMs??timeline.durationMs;
    const valid=items.some(i=>i.id===selected);
    const canEdit=!!room&&valid&&ctx.canEdit()&&status!=="playing"&&!busy,canDirect=!!room&&valid&&ctx.canDirect()&&!busy;
    for(const a of ["save","capture","delete","length","repeat"])actionButton(a).disabled=!canEdit;
    actionButton("delete").disabled=!canEdit||selectedKey<0;
    for(const a of ["media","play","pause","stop"])actionButton(a).disabled=!canDirect||(a==="play"&&!track);
    scrub.disabled=!canDirect;target.disabled=true;
    for(const n of [...numbers,"time","duration","repeat"])field<HTMLInputElement>(n).disabled=!canEdit;
    const pos=position();field<HTMLElement>("clock").textContent=`${(pos/1000).toFixed(1)} / ${(duration/1000).toFixed(1)} s · ${frame().cycle} / ${track?.repeatCount===0?"∞":track?.repeatCount??1}`;field<HTMLElement>("state").textContent=status.toUpperCase();
    scrub.max=String(duration);if(document.activeElement!==scrub)scrub.value=String(pos);
    if(rebuild&&!dirtySettings.has("duration")&&document.activeElement!==field("duration"))field<HTMLInputElement>("duration").value=String(duration/1000);
    if(rebuild&&!dirtySettings.has("repeat")&&document.activeElement!==field("repeat"))field<HTMLInputElement>("repeat").value=String(track?.repeatCount??1);
    panel.querySelector<HTMLButtonElement>('[data-a="open"]')!.disabled=!valid;
    dock.update({id:selected,title:ctx.getItems().get(selected)?.title||"SELECT ARTWORK",durationMs:duration,positionMs:pos,keys:track?.keys??[],selectedKey,canEdit,canSeek:canDirect,status});
    if(rebuild){keys.replaceChildren();const track=currentTrack();if(!track)keys.textContent="No keys. Capture a pose at 0 s and SAVE KEY.";
      track?.keys.forEach((key,index)=>{const b=document.createElement("button");b.type="button";b.textContent=`${(key.timeMs/1000).toFixed(1)} s · size ${key.scale.toFixed(2)} · opacity ${key.opacity.toFixed(2)}`;b.setAttribute("aria-pressed",String(index===selectedKey));
        b.addEventListener("click",()=>{if(state().status==="playing")return;selectedKey=index;fill(key);refresh(true);});keys.append(b);});}
  }
  function save(definition:ArtworkTimeline){
    if(!room||!ctx.canEdit()||state().status==="playing"||busy)return;
    try{definition=cleanArtworkTimeline(definition);}catch(error){message(error instanceof Error?error.message:"Invalid key");return;}
    busy=true;message("SAVING…");room.send("artwork:timeline:save",{revision,mediaId:target.value,track:definition.tracks.find(t=>t.mediaId===target.value)??null});refresh();
    const sentRoom=room;setTimeout(()=>{if(room===sentRoom&&busy){busy=false;message("No confirmation yet. Refresh before retrying.");room.send("artwork:timeline:get",{requestAt:Date.now()});refresh();}},5000);
  }
  function transport(action:string,pos?:number){if(room&&ctx.canDirect()){message(action.toUpperCase()+"…");room.send("artwork:timeline:transport",{action,mediaId:target.value,...(pos===undefined?{}:{positionMs:pos})});}}
  const handleAction=(event:Event)=>{
    const action=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-a]")?.dataset.a;if(!action)return;
    if(action==="open"){dock.open();refresh();return;}
    if(action==="capture"){capture();return;}
    if(action==="media"){if(ctx.canDirect())ctx.dispatchAction(target.value,"play");return;}
    if(action==="stop"){if(ctx.canDirect())ctx.dispatchAction(target.value,"stop");return;}
    if(["play","pause"].includes(action)){transport(action);return;}
    const definition=JSON.parse(JSON.stringify(timeline)) as ArtworkTimeline;

    if(!target.value)return;
    let track=definition.tracks.find(t=>t.mediaId===target.value);
    if(action==="length"||action==="repeat"){
      if(!track){message("SAVE KEY first.");return;}
      if(action==="length"){
        try{const retimed=retimeArtworkTrack(track,Math.round(Number(field<HTMLInputElement>("duration").value)*1000),timeline.durationMs);Object.assign(track,retimed);}
        catch(error){message(error instanceof Error?error.message:"Invalid LENGTH");return;}
        selectedKey=-1;
      }
      else track.repeatCount=Number(field<HTMLInputElement>("repeat").value);
      save(definition);return;
    }
    if(action==="save"){
      const key={timeMs:Math.round(Number(field<HTMLInputElement>("time").value)*1000)} as ArtworkKey;
      for(const n of numbers)key[n]=Number(field<HTMLInputElement>(n).value);
      if(!track){track={mediaId:target.value,keys:[],durationMs:Math.round(Number(field<HTMLInputElement>("duration").value)*1000),repeatCount:Number(field<HTMLInputElement>("repeat").value)};definition.tracks.push(track);}
      // Changing a selected key's TIME moves it; matching a different key's time replaces it.
      if(selectedKey>=0)track.keys.splice(selectedKey,1);
      track.keys=track.keys.filter(k=>k.timeMs!==key.timeMs);track.keys.push(key);
      selectedKey=-1;save(definition);
    }else if(action==="delete"&&track&&selectedKey>=0){track.keys.splice(selectedKey,1);definition.tracks=definition.tracks.filter(t=>t.keys.length);selectedKey=-1;save(definition);}
  };
  panel.addEventListener("click",handleAction);dock.editor.addEventListener("click",handleAction);
  for(const name of ["duration","repeat"])field<HTMLInputElement>(name).addEventListener("input",()=>dirtySettings.add(name));
  target.addEventListener("change",()=>{selectedKey=-1;capture();refresh(true);});
  scrub.addEventListener("change",()=>transport("seek",Number(scrub.value)));
  function release(id:string){
    const base=animated.get(id);if(!base)return;
    const item=ctx.getItems().get(id);
    if(item?.entity===base.entity){
      const raw=ctx.getAuthoritative(id);
      if(raw){base.entity.setPosition(raw.x,raw.y,raw.z);base.entity.setEulerAngles(raw.rotationX,raw.rotationY,raw.rotationZ);base.entity.setLocalScale(raw.scale,raw.scale,raw.scale);}
      else{base.entity.setPosition(base.position);base.entity.setEulerAngles(base.rotation);base.entity.setLocalScale(base.scale);}
    }
    for(const [mesh,m] of base.materials){if(mesh.material===m.copy)mesh.material=m.original;m.copy.destroy();}
    animated.delete(id);
  }
  function render(){
    const ids=new Set(timeline.tracks.filter(t=>state(t.mediaId).preview).map(t=>t.mediaId));
    for(const [id,base] of animated)if(!ids.has(id)||ctx.getItems().get(id)?.entity!==base.entity)release(id);
    for(const track of timeline.tracks){
      if(!state(track.mediaId).preview)continue;
      const item=ctx.getItems().get(track.mediaId);if(!item||!ctx.getAuthoritative(track.mediaId))continue;
      const entity=item.entity,pose=artworkPoseAt(track,frame(track).positionMs);
      let base=animated.get(track.mediaId);
      if(!base){base={entity,position:entity.getPosition().clone(),rotation:entity.getEulerAngles().clone(),scale:entity.getLocalScale().clone(),materials:new Map()};animated.set(track.mediaId,base);}
      entity.setPosition(pose.x,pose.y,pose.z);entity.setEulerAngles(pose.rotationX,pose.rotationY,pose.rotationZ);entity.setLocalScale(pose.scale,pose.scale,pose.scale);
      const visit=(node:any)=>{for(const mesh of [...(node.render?.meshInstances||[]),...(node.model?.meshInstances||[])]){
        let m=base!.materials.get(mesh);
        if(m&&mesh.material!==m.copy){m.copy.destroy();base!.materials.delete(mesh);m=undefined;}
        if(!m){const original=mesh.material;if(!original||typeof original.opacity!=="number")continue;const copy=original.clone();m={original,copy,opacity:original.opacity,blend:original.blendType,depth:original.depthWrite,alphaTest:original.alphaTest};base!.materials.set(mesh,m);mesh.material=copy;}
        const opacity=m.opacity*pose.opacity,blend=pose.opacity<.999?ctx.pc.BLEND_NORMAL:m.blend;
        const alphaTest=pose.opacity<.999?0:m.alphaTest;
        if(m.copy.opacity!==opacity||m.copy.blendType!==blend||m.copy.alphaTest!==alphaTest){m.copy.opacity=opacity;m.copy.blendType=blend;m.copy.depthWrite=pose.opacity<.999?false:m.depth;m.copy.alphaTest=alphaTest;m.copy.update();}
      }for(const child of node.children||[])visit(child);};visit(entity);
    }
  }
  function connect(next:any){
    for(const id of Array.from(animated.keys()))release(id);
    room=next;timeline=emptyArtworkTimeline();revision=0;transports.clear();busy=false;clockReady=false;selectedKey=-1;
    next.onMessage("artwork:timeline:state",(payload:any)=>{
      if(room!==next||ctx.getRoom()!==next)return;
      const received=Date.now();
      if(Number.isFinite(payload.requestAt)&&received-payload.requestAt>=0&&received-payload.requestAt<10000){offset=Number(payload.serverAt)-(received+payload.requestAt)/2;clockReady=true;}
      else if(!clockReady)offset=Number(payload.serverAt)-received;
      let definitionChanged=false;
      if(payload.timeline){try{const nextDefinition=cleanArtworkTimeline(payload.timeline);definitionChanged=JSON.stringify(nextDefinition)!==JSON.stringify(timeline);timeline=nextDefinition;}catch{message("Invalid timeline received.");return;}}
      if(revision!==(Number(payload.revision)||0))selectedKey=-1;
      revision=Number(payload.revision)||0;
      transports.clear();for(const t of payload.transports||[])transports.set(t.mediaId,t);
      refresh(definitionChanged);render();
    });
    next.onMessage("artwork:timeline:result",(payload:any)=>{
      if(room!==next||ctx.getRoom()!==next)return;
      busy=false;if(payload.ok&&payload.operation==="save"){dirtySettings.clear();ctx.onSaved?.();}
      message(payload.ok?(payload.operation==="save"?"SAVED · ROOM keyframes":String(payload.operation).toUpperCase()):`FAILED · ${payload.reason||"unknown"}`);refresh(true);
    });
    next.send("artwork:timeline:get",{requestAt:Date.now()});lastPing=Date.now();message("Loading ROOM keyframes…");refresh(true);
  }
  ctx.app.on("update",()=>{
    if(room&&ctx.getRoom()!==room){for(const id of Array.from(animated.keys()))release(id);room=null;dock.close();transports.clear();timeline=emptyArtworkTimeline();busy=false;message("Connect to a ROOM.");refresh(true);}
    if(room&&Date.now()-lastPing>5000){lastPing=Date.now();room.send("artwork:timeline:get",{requestAt:Date.now()});}
    render();if(Date.now()-uiAt>100){uiAt=Date.now();refresh();}
  });
  return {connect,refresh,element:panel};
}
