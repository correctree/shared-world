import { createArtworkTimelineDock } from "./artworkTimelineDock";
import { artworkPoseAt, artworkKeyIdentity, splitArtworkKeys, artworkPlaybackAt, retimeArtworkTrack, cleanArtworkTimeline, emptyArtworkTimeline, type ArtworkChannel, type ArtworkInterpolation, type ArtworkKey, type ArtworkTimeline } from "./artworkTimeline";

type Context={
  app:any;pc:any;getRoom:()=>any;getItems:()=>Map<string,any>;getSelected:()=>string|null;
  canEdit:()=>boolean;canDirect:()=>boolean;getAuthoritative:(id:string)=>any;buttonHost:HTMLElement;dispatchAction:(id:string,action:string)=>void;onSaved?:()=>void;
};
export function createArtworkTimelineUI(ctx:Context){
  let room:any=null,timeline=emptyArtworkTimeline(),revision=0;
  let copiedKeys:ArtworkKey[]=[],copiedKey:ArtworkKey|null=null,copiedTitle="";
  const selectedKeys=new Set<number>();
  let multiSelect=false;
  const histories=new Map<string,any>();
  const dirtySettings=new Set<string>();
  let lastSelected:string|null=null;
  let offset=0,clockReady=false,selectedKey=-1,busy=false,lastPing=0,uiAt=0;
  const transports=new Map<string,any>();
  const animated=new Map<string,{entity:any;position:any;rotation:any;scale:any;materials:Map<any,{original:any;copy:any;opacity:number;blend:number;depth:boolean;alphaTest:number}>}>();
  const panel=document.createElement("section");panel.id="artworkTimelinePanel";panel.hidden=false;
  panel.innerHTML=`<header><strong>ARTWORK TIMELINE <small>0.27.0</small></strong></header>
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
    <div class="at-buttons"><button data-a="capture">CAPTURE POSE</button><button data-a="save">SAVE KEY</button><button data-a="delete">DELETE KEYS</button></div>
    <div class="at-channel"><label>KEY CHANNEL<select data-f="channel"><option value="all">ALL PROPERTIES</option><option value="position">POSITION</option><option value="size">SIZE</option><option value="angle">ANGLE</option><option value="opacity">OPACITY</option></select></label><button data-a="split">SPLIT ALL KEYS</button></div>
    <div class="at-interpolation"><label>INTERPOLATION · TO NEXT KEY<select data-f="interpolation"><option value="linear">LINEAR</option><option value="ease-in">EASE IN</option><option value="ease-out">EASE OUT</option><option value="ease-in-out">EASE IN OUT</option></select></label><button data-a="interpolation">APPLY TO SELECTED</button></div>
    <div class="at-buttons at-select"><button data-a="multi">MULTI: OFF</button><button data-a="all">SELECT ALL</button><button data-a="clear">CLEAR</button><span data-f="selection">0 selected</span></div>
    <div class="at-buttons at-copy"><button data-a="copy">COPY KEYS</button><button data-a="paste">PASTE KEYS</button><span data-f="clipboard">Select ◆ to copy.</span></div>
    <div class="at-buttons at-history"><button data-a="undo">↶ UNDO</button><button data-a="redo">↷ REDO</button><span data-f="history">UNDO 0 · REDO 0</span></div>
    <p class="at-help">Select a saved key to edit. SAVE KEY stores all values at TIME. SAVE KEY at equal time replaces a key. COPY KEY copies the selected saved key; PASTE KEY adds it at TIME without replacing existing keys. Angles 0 → 360 make one full turn. PLAY starts media + timeline. DO starts only this timeline. SET LENGTH rescales all key times proportionally. Repeat 0 = infinite; 1 = once. Natural end holds the final pose. STOP restores this artwork’s saved placement. Owner / Editor edits; Director can play. Up to 120 times per channel, 480 keys per artwork, 2048 per ROOM. SPLIT ALL KEYS separates legacy linked keys.</p>
    <div data-f="message" role="status">Connect to a ROOM.</div>`;
  const style=document.createElement("style");style.textContent=`
    #artworkTimelinePanel{position:relative;width:100%;max-width:100%;overflow:auto;box-sizing:border-box;padding:14px;background:#101923;color:#f2f6fa;border:1px solid #4c7795;border-radius:14px;font:12px system-ui;box-shadow:0 12px 40px #0008}
    #artworkTimelinePanel[hidden]{display:none!important}#artworkTimelinePanel header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}#artworkTimelinePanel small{color:#90a9bc;font-size:10px}
    :is(#artworkTimelinePanel,#artworkTimelineDock) label{display:grid;gap:4px;font-size:10px;color:#a8bdcc;margin:0}:is(#artworkTimelinePanel,#artworkTimelineDock) input,:is(#artworkTimelinePanel,#artworkTimelineDock) select{width:100%;box-sizing:border-box;min-width:0;padding:8px;border:1px solid #3b5465;border-radius:7px;background:#1a2834;color:white}
    :is(#artworkTimelinePanel,#artworkTimelineDock) button{padding:10px 6px;background:#263f51;color:white;border:1px solid #53758d;border-radius:7px;min-width:0;cursor:pointer}:is(#artworkTimelinePanel,#artworkTimelineDock) button:disabled{opacity:.35;cursor:default}:is(#artworkTimelinePanel,#artworkTimelineDock) button[data-a="close"]{padding:4px 10px;font-size:22px}
    .at-clock,.at-pair{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0}.at-pair label{flex:1}.at-clock{color:#ffca79;font-variant-numeric:tabular-nums}.at-buttons,.at-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.at-history{grid-template-columns:repeat(2,minmax(0,1fr))}.at-history [data-f="history"]{grid-column:1/-1;color:#8fc9e7;font-size:10px}.at-copy{grid-template-columns:repeat(2,minmax(0,1fr))}.at-copy [data-f="clipboard"]{grid-column:1/-1;font-size:10px;color:#8fc9e7;overflow-wrap:anywhere}.at-transport{grid-template-columns:repeat(2,minmax(0,1fr))}.at-keys{display:grid;gap:5px;max-height:140px;overflow:auto}.at-keys button{text-align:left}.at-keys button[aria-pressed="true"]{outline:2px solid #67d4ff;background:#25465e!important}.at-help{font-size:10px;color:#a2b5c3;line-height:1.6}:is(#artworkTimelinePanel,#artworkTimelineDock) [data-f="message"]{padding:8px;background:#0b1119;border-radius:7px;white-space:pre-wrap}
    @media(max-width:640px){#artworkTimelinePanel{padding:10px}:is(#artworkTimelinePanel,#artworkTimelineDock) input,:is(#artworkTimelinePanel,#artworkTimelineDock) select{font-size:16px}:is(#artworkTimelinePanel,#artworkTimelineDock) button{min-height:42px;font-size:10px}}`;
  document.head.append(style);
  const dock=createArtworkTimelineDock({
    revision:()=>revision,
    select:(index:number,toggle=false,preserve=false)=>selectKey(index,toggle,preserve),
    move:(index:number,timeMs:number,expectedRevision:number,id:string)=>{
      if(id!==target.value||expectedRevision!==revision||busy||!ctx.canEdit()||state().status==="playing"){message("Timeline changed. Select the key again.");return;}
      const definition=JSON.parse(JSON.stringify(timeline)) as ArtworkTimeline,track=definition.tracks.find(t=>t.mediaId===id);
      if(!track?.keys[index])return;
      const indices=selectedKeys.has(index)?new Set(selectedKeys):new Set([index]);
      const delta=timeMs-track.keys[index].timeMs;
      const moved=track.keys.map((key,i)=>({...key,timeMs:key.timeMs+(indices.has(i)?delta:0)}));
      if(moved.some(key=>key.timeMs<0||key.timeMs>(track.durationMs??timeline.durationMs))){message("Selected keys would move outside LENGTH. Nothing changed.");return;}
      if(new Set(moved.map(artworkKeyIdentity)).size!==moved.length){message("A key already exists at this time. Nothing changed.");return;}
      track.keys=moved;selectedKey=-1;selectedKeys.clear();field<HTMLInputElement>("time").value=String(timeMs/1000);save(definition);
    },
    seek:(timeMs:number)=>{field<HTMLInputElement>("time").value=String(timeMs/1000);selectedKey=-1;selectedKeys.clear();transport("seek",timeMs);},
    action:(action:string)=>panel.querySelector<HTMLButtonElement>(`[data-a="${action}"]`)?.click()
  });
  for(const selector of [".at-keys",".at-grid",".at-buttons:not(.at-transport)",".at-channel",".at-interpolation",".at-select",".at-copy",".at-history",".at-help",'[data-f="message"]']){const node=panel.querySelector<HTMLElement>(selector);if(node)dock.editor.append(node);}
  const field=<T extends HTMLElement>(name:string)=>(panel.querySelector<T>(`[data-f="${name}"]`)??dock.editor.querySelector<T>(`[data-f="${name}"]`))!;
  const actionButton=(name:string)=>(panel.querySelector<HTMLButtonElement>(`[data-a="${name}"]`)??dock.editor.querySelector<HTMLButtonElement>(`[data-a="${name}"]`))!;
  const target=field<HTMLSelectElement>("target"),scrub=field<HTMLInputElement>("scrub"),keys=field<HTMLElement>("keys");
  const message=(text:string)=>{field<HTMLElement>("message").textContent=text;};
  const numbers=["x","y","z","rotationX","rotationY","rotationZ","scale","opacity"] as const;
  function selectKey(index:number,toggle=false,preserve=false){
    const key=currentTrack()?.keys[index];if(!key||state().status==="playing"||busy)return;
    if(toggle||multiSelect&&!preserve){if(selectedKeys.has(index))selectedKeys.delete(index);else selectedKeys.add(index);}
    else if(!preserve||!selectedKeys.has(index)){selectedKeys.clear();selectedKeys.add(index);}
    selectedKey=selectedKeys.has(index)?index:(Array.from(selectedKeys).at(-1)??-1);
    if(selectedKey>=0)fill(currentTrack()!.keys[selectedKey]);refresh(true);
  }
  function basePose(id:string){
    const raw=ctx.getAuthoritative(id);
    return {x:Number(raw?.x??0),y:Number(raw?.y??0),z:Number(raw?.z??0),rotationX:Number(raw?.rotationX??0),rotationY:Number(raw?.rotationY??0),rotationZ:Number(raw?.rotationZ??0),scale:Number(raw?.scale??1),opacity:1};
  }
  function currentTrack(){return timeline.tracks.find(t=>t.mediaId===target.value);}
  function state(id=target.value){return transports.get(id)??{status:"stopped",elapsedMs:0,startedAt:0,preview:false};}
  function frame(track=currentTrack()){
    const t=state(track?.mediaId),elapsed=t.status==="playing"?Date.now()+offset-t.startedAt:t.elapsedMs;
    return track?artworkPlaybackAt(track,elapsed,timeline.durationMs):{positionMs:0,cycle:0,ended:false};
  }
  function position(){return frame().positionMs;}
  function fill(key:ArtworkKey){field<HTMLSelectElement>("channel").value=key.channel??"all";field<HTMLSelectElement>("interpolation").value=key.interpolation??"linear";field<HTMLInputElement>("time").value=String(key.timeMs/1000);for(const n of numbers)field<HTMLInputElement>(n).value=String(Math.round(key[n]*10000)/10000);}
  function capture(){
    const item=ctx.getItems().get(target.value);if(!item){message("Select a loaded visual artwork.");return;}
    const e=item.entity,p=e.getPosition(),r=e.getEulerAngles(),s=e.getLocalScale();
    const track=currentTrack(),pose=state().preview&&track?artworkPoseAt(track,frame(track).positionMs,basePose(target.value)):null;
    fill({timeMs:Math.round(Number(field<HTMLInputElement>("time").value)*1000)||0,x:p.x,y:p.y,z:p.z,rotationX:r.x,rotationY:r.y,rotationZ:r.z,scale:s.x,opacity:pose?.opacity??1});
    selectedKey=-1;selectedKeys.clear();message("Pose captured. Set TIME and SAVE KEY.");
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
    if(lastSelected!==selected){lastSelected=selected;dirtySettings.clear();target.value=selected;selectedKey=-1;selectedKeys.clear();field<HTMLInputElement>("time").value="0";if(selected)capture();rebuild=true;}
    const status=state().status,track=currentTrack(),duration=track?.durationMs??timeline.durationMs;
    const valid=items.some(i=>i.id===selected);
    const canEdit=!!room&&valid&&ctx.canEdit()&&status!=="playing"&&!busy,canDirect=!!room&&valid&&ctx.canDirect()&&!busy;
    for(const a of ["save","capture","delete","length","repeat"])actionButton(a).disabled=!canEdit;
    const history=histories.get(selected);
    actionButton("undo").disabled=!canEdit||history?.canUndo!==true;
    actionButton("redo").disabled=!canEdit||history?.canRedo!==true;
    field<HTMLElement>("history").textContent=`UNDO ${history?.undoCount??0} · REDO ${history?.redoCount??0}`;
    for(const action of ["multi","all","clear"])actionButton(action).disabled=!canEdit;
    actionButton("multi").textContent=`MULTI: ${multiSelect?"ON":"OFF"}`;
    field<HTMLElement>("selection").textContent=`${selectedKeys.size} selected`;
    const channel=field<HTMLSelectElement>("channel").value;
    const relevant:Record<string,string[]>={position:["x","y","z"],size:["scale"],angle:["rotationX","rotationY","rotationZ"],opacity:["opacity"]};
    for(const name of numbers)field<HTMLInputElement>(name).disabled=!canEdit||(channel!=="all"&&!(relevant[channel]||[]).includes(name));
    field<HTMLSelectElement>("channel").disabled=!canEdit||selectedKey>=0;
    actionButton("split").disabled=!canEdit||!track?.keys.some(k=>(k.channel??"all")==="all");
    field<HTMLSelectElement>("interpolation").disabled=!canEdit;
    actionButton("interpolation").disabled=!canEdit||!selectedKeys.size;
    actionButton("save").disabled=!canEdit||selectedKeys.size>1;
    actionButton("copy").disabled=!canEdit||selectedKey<0;
    actionButton("paste").disabled=!canEdit||!copiedKey;
    field<HTMLElement>("clipboard").textContent=copiedKey?`COPIED · ${copiedTitle} · ${copiedKeys.length} key(s)` : "Select ◆ to copy.";
    actionButton("delete").disabled=!canEdit||selectedKey<0;
    for(const a of ["media","play","pause","stop"])actionButton(a).disabled=!canDirect||(a==="play"&&!track);
    scrub.disabled=!canDirect;target.disabled=true;
    for(const n of [...numbers,"time","duration","repeat"])field<HTMLInputElement>(n).disabled=!canEdit;
    const pos=position();field<HTMLElement>("clock").textContent=`${(pos/1000).toFixed(1)} / ${(duration/1000).toFixed(1)} s · ${frame().cycle} / ${track?.repeatCount===0?"∞":track?.repeatCount??1}`;field<HTMLElement>("state").textContent=status.toUpperCase();
    scrub.max=String(duration);if(document.activeElement!==scrub)scrub.value=String(pos);
    if(rebuild&&!dirtySettings.has("duration")&&document.activeElement!==field("duration"))field<HTMLInputElement>("duration").value=String(duration/1000);
    if(rebuild&&!dirtySettings.has("repeat")&&document.activeElement!==field("repeat"))field<HTMLInputElement>("repeat").value=String(track?.repeatCount??1);
    panel.querySelector<HTMLButtonElement>('[data-a="open"]')!.disabled=!valid;
    dock.update({id:selected,title:ctx.getItems().get(selected)?.title||"SELECT ARTWORK",durationMs:duration,positionMs:pos,keys:track?.keys??[],selectedKey,selectedIndices:Array.from(selectedKeys),multiSelect,canEdit,canSeek:canDirect,status});
    if(rebuild){keys.replaceChildren();const track=currentTrack();if(!track)keys.textContent="No keys. Capture a pose at 0 s and SAVE KEY.";
      track?.keys.forEach((key,index)=>{const b=document.createElement("button");b.type="button";b.textContent=`${(key.timeMs/1000).toFixed(1)} s · size ${key.scale.toFixed(2)} · ${(key.channel??"all").toUpperCase()} · opacity ${key.opacity.toFixed(2)} · ${(key.interpolation??"linear").toUpperCase()}`;b.setAttribute("aria-pressed",String(selectedKeys.has(index)));
        b.addEventListener("click",event=>selectKey(index,event.shiftKey||event.metaKey||event.ctrlKey));keys.append(b);});}
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
    if(action==="undo"||action==="redo"){
      if(!room||!ctx.canEdit()||busy||state().status==="playing"||actionButton(action).disabled)return;
      busy=true;selectedKey=-1;selectedKeys.clear();dirtySettings.clear();message(action.toUpperCase()+"…");
      room.send("artwork:timeline:history",{direction:action,mediaId:target.value,revision});refresh();
      const sentRoom=room;setTimeout(()=>{if(room===sentRoom&&busy){busy=false;message("No confirmation yet. Refresh before retrying.");room.send("artwork:timeline:get",{requestAt:Date.now()});refresh();}},5000);return;
    }
    if(["multi","all","clear"].includes(action)){
      if(!ctx.canEdit()||busy||state().status==="playing")return;
      if(action==="multi")multiSelect=!multiSelect;
      else {selectedKeys.clear();if(action==="all")currentTrack()?.keys.forEach((_,index)=>selectedKeys.add(index));selectedKey=Array.from(selectedKeys).at(-1)??-1;if(selectedKey>=0)fill(currentTrack()!.keys[selectedKey]);}
      refresh(true);return;
    }
    if(action==="split"){
      if(!ctx.canEdit()||busy||state().status==="playing")return;
      const definition=JSON.parse(JSON.stringify(timeline)) as ArtworkTimeline,index=definition.tracks.findIndex(t=>t.mediaId===target.value);
      if(index<0)return;definition.tracks[index]=splitArtworkKeys(definition.tracks[index]);selectedKey=-1;selectedKeys.clear();save(definition);return;
    }
    if(action==="interpolation"){
      if(!ctx.canEdit()||busy||state().status==="playing"||!selectedKeys.size)return;
      const definition=JSON.parse(JSON.stringify(timeline)) as ArtworkTimeline,track=definition.tracks.find(t=>t.mediaId===target.value);
      if(!track)return;const mode=field<HTMLSelectElement>("interpolation").value as ArtworkInterpolation;
      for(const index of selectedKeys)if(track.keys[index])track.keys[index].interpolation=mode;
      save(definition);return;
    }
    if(action==="copy"){
      if(!ctx.canEdit()||state().status==="playing"||busy)return;
      const key=currentTrack()?.keys[selectedKey];if(!key){message("Select a saved ◆ key first.");return;}
      copiedKeys=Array.from(selectedKeys).sort((a,b)=>a-b).map(i=>({...currentTrack()!.keys[i]}));if(!copiedKeys.length)copiedKeys=[{...key}];copiedKey=copiedKeys[0];copiedTitle=ctx.getItems().get(target.value)?.title||target.value;
      message("KEYS COPIED · Set TIME for the first key, then PASTE KEYS. The original key stays unchanged.");refresh();return;
    }
    if(action==="paste"){
      if(!room||!ctx.canEdit()||state().status==="playing"||busy||!copiedKey)return;
      const id=target.value,item=ctx.getItems().get(id);
      if(!item||item.kind==="audio"||!ctx.getAuthoritative(id)){message("Select a visual artwork.");return;}
      const timeMs=Math.round(Number(field<HTMLInputElement>("time").value)*1000),existing=currentTrack();
      const duration=existing?.durationMs??Math.round(Number(field<HTMLInputElement>("duration").value)*1000);
      if(!field<HTMLInputElement>("time").value.trim()||!Number.isFinite(timeMs)||timeMs<0||timeMs>duration){message(`TIME must be between 0 and ${duration/1000} seconds.`);return;}

      const definition=JSON.parse(JSON.stringify(timeline)) as ArtworkTimeline;
      let track=definition.tracks.find(t=>t.mediaId===id);
      if(!track){track={mediaId:id,durationMs:duration,repeatCount:Number(field<HTMLInputElement>("repeat").value),keys:[]};definition.tracks.push(track);}
      const pasted=copiedKeys.map(key=>({...key,timeMs:timeMs+key.timeMs-copiedKeys[0].timeMs}));
      if(pasted.some(key=>key.timeMs>duration||key.timeMs<0)){message("Pasted keys would exceed LENGTH. Increase LENGTH or choose an earlier TIME.");return;}
      if(pasted.some(key=>track!.keys.some(existing=>artworkKeyIdentity(existing)===artworkKeyIdentity(key)))){message("A key already exists at a pasted time. Nothing was overwritten.");return;}
      track.keys.push(...pasted);selectedKey=-1;selectedKeys.clear();fill(pasted[0]);save(definition);return;
    }
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
        selectedKey=-1;selectedKeys.clear();
      }
      else track.repeatCount=Number(field<HTMLInputElement>("repeat").value);
      save(definition);return;
    }
    if(action==="save"){
      if(selectedKeys.size>1){message("Select one key to edit its properties, or CLEAR before adding a key.");return;}
      const key={channel:field<HTMLSelectElement>("channel").value as ArtworkChannel,timeMs:Math.round(Number(field<HTMLInputElement>("time").value)*1000),interpolation:field<HTMLSelectElement>("interpolation").value as ArtworkInterpolation} as ArtworkKey;
      for(const n of numbers)key[n]=Number(field<HTMLInputElement>(n).value);
      if(!track){track={mediaId:target.value,keys:[],durationMs:Math.round(Number(field<HTMLInputElement>("duration").value)*1000),repeatCount:Number(field<HTMLInputElement>("repeat").value)};definition.tracks.push(track);}
      // Changing a selected key's TIME moves it; matching a different key's time replaces it.
      if(selectedKey>=0)track.keys.splice(selectedKey,1);
      track.keys=track.keys.filter(k=>artworkKeyIdentity(k)!==artworkKeyIdentity(key));track.keys.push(key);
      selectedKey=-1;selectedKeys.clear();save(definition);
    }else if(action==="delete"&&track&&selectedKey>=0){track.keys=track.keys.filter((_,index)=>!selectedKeys.has(index));definition.tracks=definition.tracks.filter(t=>t.keys.length);selectedKey=-1;selectedKeys.clear();save(definition);}
  };
  panel.addEventListener("click",handleAction);dock.editor.addEventListener("click",handleAction);
  for(const name of ["duration","repeat"])field<HTMLInputElement>(name).addEventListener("input",()=>dirtySettings.add(name));
  field<HTMLSelectElement>("channel").addEventListener("change",()=>refresh());
  target.addEventListener("change",()=>{selectedKey=-1;selectedKeys.clear();capture();refresh(true);});
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
      const entity=item.entity,pose=artworkPoseAt(track,frame(track).positionMs,basePose(track.mediaId));
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
    room=next;histories.clear();copiedKeys=[];copiedKey=null;copiedTitle="";timeline=emptyArtworkTimeline();revision=0;transports.clear();busy=false;clockReady=false;selectedKey=-1;selectedKeys.clear();
    next.onMessage("artwork:timeline:history:state",(payload:any)=>{
      if(room!==next||ctx.getRoom()!==next)return;
      histories.clear();for(const history of payload.tracks||[])histories.set(history.mediaId,history);refresh();
    });
    next.onMessage("artwork:timeline:state",(payload:any)=>{
      if(room!==next||ctx.getRoom()!==next)return;
      const received=Date.now();
      if(Number.isFinite(payload.requestAt)&&received-payload.requestAt>=0&&received-payload.requestAt<10000){offset=Number(payload.serverAt)-(received+payload.requestAt)/2;clockReady=true;}
      else if(!clockReady)offset=Number(payload.serverAt)-received;
      let definitionChanged=false;
      if(payload.timeline){try{const nextDefinition=cleanArtworkTimeline(payload.timeline);definitionChanged=JSON.stringify(nextDefinition)!==JSON.stringify(timeline);timeline=nextDefinition;}catch{message("Invalid timeline received.");return;}}
      if(revision!==(Number(payload.revision)||0)){selectedKey=-1;selectedKeys.clear();}
      revision=Number(payload.revision)||0;
      transports.clear();for(const t of payload.transports||[])transports.set(t.mediaId,t);
      refresh(definitionChanged);render();
    });
    next.onMessage("artwork:timeline:result",(payload:any)=>{
      if(room!==next||ctx.getRoom()!==next)return;
      busy=false;if(payload.ok&&["save","undo","redo"].includes(payload.operation)){dirtySettings.clear();ctx.onSaved?.();}
      message(payload.ok?(payload.operation==="save"?"SAVED · ROOM keyframes":String(payload.operation).toUpperCase()):`FAILED · ${payload.reason||"unknown"}`);refresh(true);
    });
    next.send("artwork:timeline:get",{requestAt:Date.now()});lastPing=Date.now();message("Loading ROOM keyframes…");refresh(true);
  }
  ctx.app.on("update",()=>{
    if(room&&ctx.getRoom()!==room){for(const id of Array.from(animated.keys()))release(id);room=null;histories.clear();copiedKeys=[];copiedKey=null;copiedTitle="";dock.close();transports.clear();timeline=emptyArtworkTimeline();busy=false;message("Connect to a ROOM.");refresh(true);}
    if(room&&Date.now()-lastPing>5000){lastPing=Date.now();room.send("artwork:timeline:get",{requestAt:Date.now()});}
    render();if(Date.now()-uiAt>100){uiAt=Date.now();refresh();}
  });
  return {connect,refresh,element:panel};
}
