import type { ArtworkKey } from "./artworkTimeline";
type Snapshot={id:string;title:string;durationMs:number;positionMs:number;keys:ArtworkKey[];selectedKey:number;selectedIndices?:number[];multiSelect?:boolean;canEdit:boolean;canSeek:boolean;status:string};
type Context={selectRange:(indices:number[],add:boolean)=>void;select:(index:number,toggle?:boolean,preserve?:boolean)=>void;move:(index:number,timeMs:number,revision:number,id:string)=>void;seek:(timeMs:number)=>void;action:(action:string)=>void;revision:()=>number};
export function createArtworkTimelineDock(ctx:Context){
  const root=document.createElement("section");root.id="artworkTimelineDock";root.hidden=true;root.setAttribute("aria-label","Artwork timeline editor");
  root.innerHTML=`<div class="atd-resize" role="separator" aria-label="Resize timeline" tabindex="0"></div>
    <header class="atd-header"><strong>ARTWORK TIMELINE <span data-d="title">SELECT ARTWORK</span></strong>
    <div class="atd-tools"><button data-d="media">▶ PLAY</button><button data-d="play">DO</button><button data-d="pause">Ⅱ</button><button data-d="stop">■</button><button data-d="add" aria-label="Add key at playhead">◆＋</button><button data-d="out" aria-label="Zoom out">−</button><button data-d="in" aria-label="Zoom in">＋</button><button data-d="fit">FIT</button><button data-d="box" aria-pressed="false">BOX: OFF</button><button data-d="collapse" aria-label="Collapse timeline">⌄</button><button data-d="close" aria-label="Close timeline">×</button></div></header>
    <div class="atd-body"><div class="atd-main"><div class="atd-scroll" data-d="scroll"><div class="atd-stage" data-d="stage"><div class="atd-ruler" data-d="ruler"></div><div data-d="lanes"></div><div class="atd-playhead" data-d="head"><span>▼</span></div></div></div>
    <div class="atd-footer"><span data-d="clock"></span><span>Drag ◆ to move a key · Drag time ruler to preview · BOX or Shift + empty area to select keys</span></div></div><div class="atd-editor" data-d="editor"></div></div>`;
  const q=<T extends HTMLElement>(name:string)=>root.querySelector<T>(`[data-d="${name}"]`)!;
  const stage=q("stage"),scroll=q("scroll"),ruler=q("ruler"),lanes=q("lanes"),head=q("head"),editor=q("editor");
  const css=document.createElement("style");css.textContent=`
    #artworkTimelineDock{position:fixed;left:12px;right:12px;bottom:12px;height:360px;max-height:80dvh;min-height:220px;z-index:4200;display:flex;flex-direction:column;box-sizing:border-box;background:#111b25;color:#eff5fa;border:1px solid #54738e;border-radius:12px;box-shadow:0 -8px 32px #0007;font:12px system-ui}
    #artworkTimelineDock[hidden]{display:none!important}#artworkTimelineDock.atd-collapsed{height:52px!important;min-height:52px}#artworkTimelineDock.atd-collapsed .atd-body{display:none}
    #artworkTimelineDock .atd-resize{height:8px;flex-shrink:0;cursor:ns-resize;touch-action:none;background:linear-gradient(90deg,transparent,#577b98,transparent);border-radius:12px 12px 0 0}
    #artworkTimelineDock .atd-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 12px;min-height:34px;flex-shrink:0;margin:0;box-sizing:border-box;width:100%;max-height:96px;overflow:auto}
    #artworkTimelineDock .atd-header strong{min-width:0;font-size:11px}#artworkTimelineDock .atd-header span{display:inline-block;color:#71d4ff;max-width:24vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;margin-left:8px}
    #artworkTimelineDock .atd-tools{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px;flex:0 1 auto;min-width:0;max-width:100%;margin:0;padding:0}#artworkTimelineDock button{cursor:pointer;border:1px solid #4a657a;border-radius:5px;background:#253c4f;color:#eef7ff;padding:6px 9px;font:11px system-ui}#artworkTimelineDock .atd-tools>button{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 auto!important;width:auto!important;min-width:28px!important;max-width:none!important;height:28px!important;min-height:28px!important;max-height:28px!important;margin:0!important;box-sizing:border-box;white-space:nowrap;line-height:1!important}#artworkTimelineDock button:disabled{opacity:.4;cursor:default}
    #artworkTimelineDock .atd-body{display:grid;grid-template-columns:minmax(0,1fr) 320px;min-height:0;flex:1;border-top:1px solid #3b5268}
    #artworkTimelineDock .atd-main{display:flex;flex-direction:column;min-width:0;min-height:0}#artworkTimelineDock .atd-scroll{overflow:auto;flex:1;min-height:0;overscroll-behavior:contain}
    #artworkTimelineDock .atd-stage{position:relative;min-width:100%;height:222px;background:#111a24;touch-action:pan-x pan-y}
    #artworkTimelineDock .atd-ruler{height:34px;box-sizing:border-box;position:relative;background:#233546;border-bottom:1px solid #587088;touch-action:none;cursor:crosshair}
    #artworkTimelineDock .atd-tick{position:absolute;top:0;height:222px;border-left:1px solid #38516977;pointer-events:none;color:#a9c5d9;font-size:10px;padding-left:4px;box-sizing:border-box}
    #artworkTimelineDock .atd-lane{position:relative;height:37px;border-bottom:1px solid #2d4154;box-sizing:border-box}#artworkTimelineDock .atd-label{position:sticky;left:0;display:block;width:112px;height:100%;box-sizing:border-box;padding:11px 9px;background:#1e2e3f;z-index:3;color:#b9cddd;font-size:10px;pointer-events:none}
    #artworkTimelineDock button.atd-key{position:absolute;top:5px;padding:0;width:28px!important;min-width:28px!important;max-width:28px!important;height:28px!important;min-height:28px!important;max-height:28px!important;margin:0!important;margin-left:-14px!important;box-sizing:border-box;border:0;background:transparent;color:#efc665;font-size:22px;touch-action:none;z-index:2}#artworkTimelineDock button.atd-key[aria-pressed="true"]{color:#68d9ff;text-shadow:0 0 8px #5dc8ff;outline:1px solid #68d9ff}
    #artworkTimelineDock .atd-playhead{position:absolute;top:0;height:222px;width:2px;background:#ff8274;pointer-events:none;z-index:4}#artworkTimelineDock .atd-playhead span{position:absolute;left:-7px;top:0;color:#ff8274;font-size:15px}
    #artworkTimelineDock .atd-selection-box{position:absolute;pointer-events:none;z-index:5;border:1px solid #77d8ff;background:#55c5ff33;box-sizing:border-box}
    #artworkTimelineDock .atd-selection-box[hidden]{display:none!important}#artworkTimelineDock button[data-d="box"][aria-pressed="true"]{background:#166080;border-color:#8fddff}
    #artworkTimelineDock.atd-box-mode .atd-stage{touch-action:none;cursor:crosshair}
    #artworkTimelineDock .atd-footer{display:flex;justify-content:space-between;gap:12px;padding:8px 12px;color:#9cb3c7;font-size:10px;flex-wrap:wrap}
    #artworkTimelineDock .atd-editor{overflow:auto;padding:10px;border-left:1px solid #3b5268;overscroll-behavior:contain}#artworkTimelineDock .atd-editor .at-grid{margin-top:0}#artworkTimelineDock .atd-editor .at-keys{max-height:65px;margin-bottom:10px}
    @media(max-width:700px){#artworkTimelineDock{left:6px;right:6px;bottom:6px;height:440px;max-height:75dvh}#artworkTimelineDock .atd-body{display:flex;flex-direction:column;overflow:auto}#artworkTimelineDock .atd-main{min-height:260px;flex-shrink:0}#artworkTimelineDock .atd-editor{overflow:visible;border-left:0;border-top:1px solid #3b5268}#artworkTimelineDock .atd-header{flex-wrap:wrap;max-height:132px}#artworkTimelineDock .atd-header span{max-width:55vw}#artworkTimelineDock .atd-tools{width:100%;justify-content:space-between}#artworkTimelineDock .atd-tools>button{padding:8px; height:36px!important;min-height:36px!important;max-height:36px!important}#artworkTimelineDock.atd-collapsed{height:92px!important;min-height:92px}}
  `;
  document.head.append(css);document.body.append(root);
  let snapshot:Snapshot={id:"",title:"SELECT ARTWORK",durationMs:10000,positionMs:0,keys:[],selectedKey:-1,canEdit:false,canSeek:false,status:"stopped"};
  let zoom=1,signature="",drag:null|{pointer:number;index:number;time:number;initial:number;x:number;revision:number;id:string;duration:number;span:number;node:HTMLElement;seek:boolean;toggleOff?:boolean}=null;
  const rectangle=document.createElement("div");rectangle.className="atd-selection-box";rectangle.hidden=true;stage.append(rectangle);
  let boxMode=false,boxDrag:null|{pointer:number;id:string;revision:number;x0:number;y0:number;x:number;y:number;add:boolean}=null;
  let resize:null|{pointer:number;y:number;height:number}=null;
  const labelWidth=112;
  function geometry(){const span=Math.max(180,(scroll.clientWidth||700)-labelWidth-24)*zoom;return {span,width:labelWidth+span+24};}
  function xFor(time:number){return labelWidth+time/snapshot.durationMs*geometry().span;}
  function timeFor(clientX:number){const x=clientX-stage.getBoundingClientRect().left;return Math.max(0,Math.min(snapshot.durationMs,Math.round((x-labelWidth)/geometry().span*snapshot.durationMs/100)*100));}
  function layout(){
    if(root.hidden)return;
    const {span,width}=geometry();stage.style.width=width+"px";head.style.left=xFor(snapshot.positionMs)+"px";
    const next=JSON.stringify([snapshot.id,snapshot.durationMs,snapshot.keys.map(k=>[k.timeMs,k.interpolation??"linear",k.channel??"all"]),snapshot.selectedKey,snapshot.selectedIndices,snapshot.canEdit,width]);
    if(next===signature||drag||boxDrag)return;signature=next;ruler.replaceChildren();lanes.replaceChildren();
    const desired=snapshot.durationMs/Math.max(1,span/90),power=10**Math.floor(Math.log10(desired));
    const step=[1,2,5,10].map(n=>n*power).find(n=>n>=desired)??power*10;
    for(let time=0;time<=snapshot.durationMs;time+=step){const tick=document.createElement("span");tick.className="atd-tick";tick.style.left=xFor(time)+"px";tick.textContent=(time/1000).toFixed(time%1000?1:0)+"s";ruler.append(tick);}
    for(const label of ["ALL KEYS","POSITION","SIZE","ANGLE","OPACITY"]){
      const lane=document.createElement("div");lane.className="atd-lane";
      const name=document.createElement("span");name.className="atd-label";name.textContent=label;lane.append(name);
      snapshot.keys.forEach((key,index)=>{
        const channel=label==="ALL KEYS"?"all":label.toLowerCase();
        if(channel==="all"&&(key.channel??"all")!=="all")return;
        if(channel!=="all"&&(key.channel??"all")!=="all"&&key.channel!==channel)return;
        const diamond=document.createElement("button");diamond.type="button";diamond.className="atd-key";diamond.textContent="◆";diamond.dataset.index=String(index);diamond.style.left=xFor(key.timeMs)+"px";
        diamond.setAttribute("aria-pressed",String((snapshot.selectedIndices??[snapshot.selectedKey]).includes(index)));diamond.setAttribute("aria-label",`${label} key ${(key.timeMs/1000).toFixed(3)} seconds`);diamond.title=`${(key.timeMs/1000).toFixed(3)} s · ${(key.interpolation??"linear").toUpperCase()} · ${(key.channel??"all").toUpperCase()}`;diamond.disabled=!snapshot.canEdit;
        lane.append(diamond);
      });lanes.append(lane);
    }
  }
  function update(next:Snapshot){
    if(drag&&(drag.id!==next.id||drag.revision!==ctx.revision()||!next.canEdit&& !drag.seek||drag.seek&&!next.canSeek)){drag=null;signature="";}
    if(boxDrag&&(boxDrag.id!==next.id||boxDrag.revision!==ctx.revision()||!next.canEdit)){boxDrag=null;rectangle.hidden=true;signature="";}
    q<HTMLButtonElement>("add").disabled=!next.canEdit;
    q<HTMLButtonElement>("box").disabled=!next.canEdit;
    snapshot=next;q("title").textContent=next.title||"SELECT ARTWORK";
    q("clock").textContent=`${(next.positionMs/1000).toFixed(1)} / ${(next.durationMs/1000).toFixed(1)} s · ${next.status.toUpperCase()}`;
    for(const action of ["media","play","pause","stop"])q<HTMLButtonElement>(action).disabled=!next.canSeek||(action==="play"&&!next.keys.length);
    layout();
  }
  function cancel(){drag=null;boxDrag=null;rectangle.hidden=true;signature="";layout();}
  root.addEventListener("click",event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-d]");if(!button)return;
    const action=button.dataset.d;
    if(action==="close"){cancel();root.hidden=true;return;}
    if(action==="collapse"){cancel();root.classList.toggle("atd-collapsed");button.setAttribute("aria-expanded",String(!root.classList.contains("atd-collapsed")));return;}
    if(action==="box"){
      if(!snapshot.canEdit)return;cancel();boxMode=!boxMode;root.classList.toggle("atd-box-mode",boxMode);button.textContent=`BOX: ${boxMode?"ON":"OFF"}`;button.setAttribute("aria-pressed",String(boxMode));return;
    }
    if(action==="fit"||action==="in"||action==="out"){cancel();zoom=action==="fit"?1:Math.max(1,Math.min(16,zoom*(action==="in"?2:.5)));signature="";layout();return;}
    if(action)ctx.action(action);
  });
  function boxPoint(event:PointerEvent){const bounds=stage.getBoundingClientRect();return {x:Math.max(labelWidth,Math.min(geometry().width,event.clientX-bounds.left)),y:Math.max(34,Math.min(219,event.clientY-bounds.top))};}
  function drawBox(){if(!boxDrag)return;rectangle.hidden=false;rectangle.style.left=Math.min(boxDrag.x0,boxDrag.x)+"px";rectangle.style.top=Math.min(boxDrag.y0,boxDrag.y)+"px";rectangle.style.width=Math.abs(boxDrag.x-boxDrag.x0)+"px";rectangle.style.height=Math.abs(boxDrag.y-boxDrag.y0)+"px";}
  function enclosedKeys(box:NonNullable<typeof boxDrag>){
    const minX=Math.min(box.x0,box.x),maxX=Math.max(box.x0,box.x),minY=Math.min(box.y0,box.y),maxY=Math.max(box.y0,box.y),indices=new Set<number>();
    for(const [lane,channel] of ["all","position","size","angle","opacity"].entries()){
      const y=34+lane*37+18.5;if(y<minY||y>maxY)continue;
      snapshot.keys.forEach((key,index)=>{const keyChannel=key.channel??"all";
        const visible=channel==="all"?keyChannel==="all":keyChannel==="all"||keyChannel===channel;
        const x=xFor(key.timeMs);if(visible&&x>=minX&&x<=maxX)indices.add(index);
      });
    }
    return Array.from(indices).sort((a,b)=>a-b);
  }
  stage.addEventListener("pointerdown",event=>{
    const diamond=(event.target as HTMLElement).closest<HTMLButtonElement>(".atd-key"),seek=!diamond;
    if(!diamond&&event.clientX-scroll.getBoundingClientRect().left<labelWidth)return;
    const bounds=stage.getBoundingClientRect(),inLanes=event.clientY-bounds.top>=34;
    if(!diamond&&inLanes&&!(event.target as HTMLElement).closest(".atd-label")&&(boxMode||event.shiftKey||event.metaKey||event.ctrlKey)){
      if(!snapshot.canEdit)return;event.preventDefault();const point=boxPoint(event);
      boxDrag={pointer:event.pointerId,id:snapshot.id,revision:ctx.revision(),x0:point.x,y0:point.y,x:point.x,y:point.y,add:!!(event.shiftKey||event.metaKey||event.ctrlKey)};
      stage.setPointerCapture(event.pointerId);drawBox();return;
    }
    if(seek&&!snapshot.canSeek||!seek&&!snapshot.canEdit)return;
    if(seek&&(event.target as HTMLElement).closest(".atd-label"))return;
    event.preventDefault();const index=diamond?Number(diamond.dataset.index):-1;
    const time=seek?timeFor(event.clientX):snapshot.keys[index].timeMs;
    drag={pointer:event.pointerId,index,time,initial:time,x:event.clientX,revision:ctx.revision(),id:snapshot.id,duration:snapshot.durationMs,span:geometry().span,node:diamond??stage,seek,toggleOff:!!diamond&&snapshot.multiSelect===true&&(snapshot.selectedIndices??[]).includes(index)&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey};
    stage.setPointerCapture(event.pointerId);
    if(diamond)ctx.select(index,event.shiftKey||event.metaKey||event.ctrlKey||snapshot.multiSelect===true&&!(snapshot.selectedIndices??[]).includes(index),true);else head.style.left=xFor(time)+"px";
  });
  stage.addEventListener("pointermove",event=>{
    if(boxDrag?.pointer===event.pointerId){event.preventDefault();const point=boxPoint(event);boxDrag.x=point.x;boxDrag.y=point.y;drawBox();q("clock").textContent=`${enclosedKeys(boxDrag).length} keys in box`;return;}
    if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();
    drag.time=drag.seek?timeFor(event.clientX):Math.max(0,Math.min(drag.duration,Math.round((drag.initial+(event.clientX-drag.x)/drag.span*drag.duration)/100)*100));
    if(drag.seek)head.style.left=xFor(drag.time)+"px";
    else {
      const indices=(snapshot.selectedIndices??[drag.index]).includes(drag.index)?snapshot.selectedIndices??[drag.index]:[drag.index];
      for(const index of indices)for(const key of lanes.querySelectorAll<HTMLElement>(`.atd-key[data-index="${index}"]`))key.style.left=xFor(snapshot.keys[index].timeMs+drag.time-drag.initial)+"px";
    }
    q("clock").textContent=`${(drag.time/1000).toFixed(1)} s · ${drag.seek?"PREVIEW ON RELEASE":"MOVE KEY"}`;
  });
  stage.addEventListener("pointerup",event=>{
    if(boxDrag?.pointer===event.pointerId){
      const done=boxDrag,point=boxPoint(event);done.x=point.x;done.y=point.y;const indices=enclosedKeys(done);boxDrag=null;rectangle.hidden=true;
      if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
      if(done.id===snapshot.id&&done.revision===ctx.revision()&&snapshot.canEdit)ctx.selectRange(indices,done.add);
      signature="";layout();return;
    }
    if(!drag||drag.pointer!==event.pointerId)return;const done=drag;drag=null;
    if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
    if(done.seek)ctx.seek(done.time);else if(done.time!==done.initial)ctx.move(done.index,done.time,done.revision,done.id);else if(done.toggleOff)ctx.select(done.index,true);
    signature="";layout();
  });
  stage.addEventListener("pointercancel",()=>cancel());stage.addEventListener("lostpointercapture",()=>{if(drag||boxDrag)cancel();});
  stage.addEventListener("keydown",event=>{
    if(event.key==="Escape"){cancel();return;}
    const key=(event.target as HTMLElement).closest<HTMLButtonElement>(".atd-key");if(!key)return;
    if(event.key==="Enter"||event.key===" "){event.preventDefault();ctx.select(Number(key.dataset.index),event.shiftKey||event.metaKey||event.ctrlKey);}
    if((event.key==="ArrowLeft"||event.key==="ArrowRight")&&snapshot.canEdit){event.preventDefault();const index=Number(key.dataset.index);ctx.move(index,Math.max(0,Math.min(snapshot.durationMs,snapshot.keys[index].timeMs+(event.key==="ArrowLeft"?-100:100))),ctx.revision(),snapshot.id);}
  });
  const grip=root.querySelector<HTMLElement>(".atd-resize")!;
  grip.addEventListener("pointerdown",event=>{event.preventDefault();root.classList.remove("atd-collapsed");resize={pointer:event.pointerId,y:event.clientY,height:root.getBoundingClientRect().height};grip.setPointerCapture(event.pointerId);});
  grip.addEventListener("pointermove",event=>{if(resize?.pointer!==event.pointerId)return;root.style.height=Math.max(220,Math.min(window.innerHeight*.8,resize.height+resize.y-event.clientY))+"px";});
  grip.addEventListener("pointerup",()=>{resize=null;});grip.addEventListener("pointercancel",()=>{resize=null;});
  grip.addEventListener("keydown",event=>{if(event.key==="ArrowUp"||event.key==="ArrowDown"){event.preventDefault();root.classList.remove("atd-collapsed");root.style.height=Math.max(220,Math.min(window.innerHeight*.8,root.getBoundingClientRect().height+(event.key==="ArrowUp"?30:-30)))+"px";}});
  for(const event of ["pointerdown","pointermove","pointerup","wheel","keydown"])root.addEventListener(event,e=>e.stopPropagation());
  window.addEventListener("resize",()=>{signature="";layout();});
  return {editor,update,open(){root.hidden=false;root.classList.remove("atd-collapsed");signature="";layout();},close(){cancel();root.hidden=true;},element:root};
}
