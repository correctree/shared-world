type Context={app:any;pc:any;camera:any;getRoom:()=>any;available:()=>boolean;getOrigin:()=>{x:number;y:number;z:number;yaw:number};prepare:()=>void;resetInput:()=>void};
export function createQuestVRUI(ctx:Context){
  const element=document.createElement("section");element.id="questVRPanel";
  element.innerHTML=`<strong>QUEST VR <small>0.30.6</small></strong><p>Quest BrowserでROOMに入り、ENTER VRを押してください。開始位置はアバターの足元です。退出はQuestのシステム操作、またはブラウザ画面のEXIT VR。</p><p><label>移動方式 <select data-v="movement"><option value="stick">STICK · 連続移動</option><option value="teleport">TELEPORT</option></select></label> <label>速度 <select data-v="speed"><option value="0.25">0.25 m/s</option><option value="0.5">0.5 m/s</option><option value="0.8">0.8 m/s</option><option value="1.2" selected>1.2 m/s</option><option value="2">2.0 m/s</option></select></label></p><p>VR内では左スティック押し込みで移動方式を切り替えます。右スティックの上で速度UP、下で速度DOWN（中央へ戻して再操作）。左トリガー：ジャンプ／飛行中の上昇、左グリップ：下降、X：飛行ON／OFF、Y：ライトON／OFF。</p><button type="button" data-v="enter">ENTER VR</button> <button type="button" data-v="exit">EXIT VR</button><p data-v="status" role="status">CHECKING VR…</p>`;
  const enter=element.querySelector<HTMLButtonElement>('[data-v="enter"]')!,exit=element.querySelector<HTMLButtonElement>('[data-v="exit"]')!,status=element.querySelector<HTMLElement>('[data-v="status"]')!;
  const style=document.createElement("style");style.textContent="#questVRPanel{padding:12px;color:inherit}#questVRPanel button{padding:8px;margin:4px 0}";document.head.appendChild(style);
  const movement=element.querySelector<HTMLSelectElement>('[data-v="movement"]')!,speed=element.querySelector<HTMLSelectElement>('[data-v="speed"]')!;
  const getMovement=()=>movement.value==="teleport"?"teleport":"stick";
  const getSpeed=()=>{const v=Number(speed.value);return Number.isFinite(v)&&v>=.25&&v<=2?v:1.2;};
  const adjustSpeed=(direction:number)=>{const values=[.25,.5,.8,1.2,2];const current=getSpeed();let index=values.findIndex(v=>v===current);if(index<0)index=3;speed.value=String(values[Math.max(0,Math.min(values.length-1,index+Math.sign(direction)))]);};
  const toggleMovement=()=>{movement.value=getMovement()==="stick"?"teleport":"stick";};
  const xr=ctx.app.xr;let pending=false,active=false,cancelled=false,ending=false,room:any=null,rig:any=null,saved:any=null,lastMessage="",disposed=false;
  const supported=()=>!!xr&&window.isSecureContext&&xr.isAvailable(ctx.pc.XRTYPE_VR);
  const busy=()=>pending||active;
  function controls(){enter.disabled=busy()||!supported()||!ctx.getRoom()||!ctx.available();exit.disabled=!busy()||ending;
    status.textContent=lastMessage||(active?"VR ACTIVE · 左で移動・押し込みで方式切替・右で旋回。":pending?"STARTING VR…":!window.isSecureContext?"HTTPSが必要です。":!xr||!xr.supported?"このブラウザではWebXRを利用できません。":!supported()?"VR非対応、または対応確認中です。Quest Browserで開いてください。":!ctx.getRoom()?"ROOMに入室してからENTER VRを押してください。":"VR READY · ENTER VRで開始");}
  function restore(message="VR ENDED · 通常画面へ戻りました。"){
    pending=false;active=false;ending=false;cancelled=false;room=null;ctx.resetInput();
    if(saved){ctx.camera.reparent(saved.parent);ctx.camera.setLocalPosition(saved.position);ctx.camera.setLocalRotation(saved.rotation);ctx.camera.camera.fov=saved.fov;saved=null;}
    if(rig){rig.destroy();rig=null;}document.body.classList.remove("quest-vr-active");lastMessage=message;controls();window.dispatchEvent(new Event("resize"));
  }
  function stop(){
    if(!busy())return;cancelled=true;lastMessage="ENDING VR…";
    if(active||xr?.active){if(ending)return;ending=true;try{xr.end((err:any)=>{if(err){ending=false;lastMessage="VR終了に失敗しました。Questのシステム操作で終了してください。";controls();}else if(!xr.active&&busy())restore();});}catch{ending=false;lastMessage="Questのシステム操作でVRを終了してください。";}}
    // A pending WebXR request cannot be aborted. Keep the rig until it resolves,
    // then end that late session immediately instead of leaving an orphan camera.
    controls();
  }
  function started(){if(!pending)return;pending=false;active=true;lastMessage="";document.body.classList.add("quest-vr-active");if(cancelled||room!==ctx.getRoom()||!ctx.available()||disposed)stop();else controls();}
  function ended(){if(busy()||saved)restore();}
  function start(){
    if(busy()||disposed||!supported()||!ctx.getRoom()||!ctx.available())return;
    ctx.prepare();ctx.resetInput();const origin=ctx.getOrigin();room=ctx.getRoom();cancelled=false;lastMessage="";
    saved={parent:ctx.camera.parent,position:ctx.camera.getLocalPosition().clone(),rotation:ctx.camera.getLocalRotation().clone(),fov:ctx.camera.camera.fov};
    rig=new ctx.pc.Entity("Quest VR Origin");ctx.app.root.addChild(rig);rig.setPosition(origin.x,origin.y,origin.z);rig.setEulerAngles(0,origin.yaw,0);ctx.camera.reparent(rig);ctx.camera.setLocalPosition(0,0,0);ctx.camera.setLocalEulerAngles(0,0,0);pending=true;controls();
    try{xr.start(ctx.camera.camera,ctx.pc.XRTYPE_VR,ctx.pc.XRSPACE_LOCALFLOOR,{callback:(err:any)=>{if(err){restore("VR開始に失敗しました: "+String(err.message??err));}else if(pending)started();}});}catch(err:any){restore("VR開始に失敗しました: "+String(err.message??err));}
  }
  const update=()=>{if(busy()&&(room!==ctx.getRoom()||!ctx.available()))stop();controls();};
  const guard=(event:Event)=>{if(!busy())return;if(event.type==="keydown"&&(event as KeyboardEvent).key==="Escape"){event.preventDefault();event.stopImmediatePropagation();stop();return;}if(event.target===exit&&!(event instanceof KeyboardEvent))return;if(event.target===exit&&event instanceof KeyboardEvent&&(event.key==="Enter"||event.key===" ")){event.stopImmediatePropagation();return;}if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();};
  const events=["pointerdown","pointermove","pointerup","pointercancel","mousedown","mousemove","mouseup","wheel","click","dblclick","keydown","keyup","touchstart","touchmove","touchend"];
  for(const name of events)window.addEventListener(name,guard,{capture:true,passive:false});
  xr?.on("start",started);xr?.on("end",ended);xr?.on("available",controls);ctx.app.on("update",update);window.addEventListener("pagehide",stop);
  enter.addEventListener("click",start);exit.addEventListener("click",stop);controls();
  return {element,start,stop,getMovement,getSpeed,adjustSpeed,toggleMovement,isActive:()=>active,isBusy:busy,getTrackedPosition:()=>active?ctx.camera.getPosition():null,getFloorY:()=>rig?.getPosition().y??0,getRig:()=>active?rig:null,dispose:()=>{disposed=true;stop();xr?.off("start",started);xr?.off("available",controls);ctx.app.off("update",update);window.removeEventListener("pagehide",stop);for(const name of events)window.removeEventListener(name,guard,true);element.remove();style.remove();if(!busy())xr?.off("end",ended);}};
}
