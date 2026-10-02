type Context={app:any;canvas:HTMLCanvasElement;camera:any;getRoom:()=>any;available:()=>boolean;resetInput:()=>void};
export function createProjectionViewUI(ctx:Context){
  const element=document.createElement("section");element.id="projectionViewPanel";
  element.innerHTML=`<strong>PROJECTION VIEW <small>0.29.0</small></strong><p>現在の視点を固定して上映します。作品の再生・カメラは開始前に準備してください。</p><button type="button" data-p="start">START PROJECTION</button> <button type="button" data-p="fullscreen">START FULLSCREEN</button><p data-p="status" role="status">STOPPED · Esc / EXITで編集画面へ戻ります。</p>`;
  const status=element.querySelector<HTMLElement>('[data-p="status"]')!;
  const exitButton=document.createElement("button");exitButton.id="projectionViewExit";exitButton.type="button";exitButton.textContent="EXIT · Esc";exitButton.hidden=true;exitButton.setAttribute("aria-label","上映を終了して編集画面へ戻る");document.body.appendChild(exitButton);
  const style=document.createElement("style");style.textContent=`
    #projectionViewPanel{padding:12px;color:inherit}#projectionViewPanel button{padding:8px;margin:4px 0}
    body.projection-view-active *{visibility:hidden!important}
    body.projection-view-active #application-canvas,body.projection-view-active #cameraBackgroundVideo,body.projection-view-active #projectionViewExit{visibility:visible!important}
    body.projection-view-active #application-canvas{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;z-index:1!important}
    body.projection-view-active{overflow:hidden!important}
    #projectionViewExit{position:fixed;right:12px;top:12px;z-index:2147483647;padding:8px 12px;color:white;background:#18202ddd;border:1px solid #ffffff55;border-radius:6px;opacity:.18;cursor:pointer}
    #projectionViewExit:hover,#projectionViewExit:focus{opacity:1}
    @media(hover:none){#projectionViewExit{opacity:.6}}
  `;document.head.appendChild(style);
  let active=false,room:any=null,pose:any=null,previousFocus:HTMLElement|null=null;
  let ownsFullscreen=false,hadFullscreen=false,generation=0;
  const applyCamera=()=>{if(!active||!pose)return;ctx.camera.setPosition(pose.position);ctx.camera.setRotation(pose.rotation);if(ctx.camera.camera&&pose.fov!==undefined)ctx.camera.camera.fov=pose.fov;};
  const releaseFullscreen=()=>{if(ownsFullscreen&&document.fullscreenElement===document.documentElement){ownsFullscreen=false;void document.exitFullscreen().catch(()=>{});}else ownsFullscreen=false;};
  const stop=()=>{
    if(!active)return;active=false;generation++;ctx.resetInput();document.body.classList.remove("projection-view-active");exitButton.hidden=true;
    releaseFullscreen();room=null;pose=null;hadFullscreen=false;
    status.textContent="STOPPED · Esc / EXITで編集画面へ戻ります。";
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
    window.dispatchEvent(new Event("resize"));
  };
  const start=async(fullscreen=false)=>{
    if(active||!ctx.getRoom()||!ctx.available())return;
    pose={position:ctx.camera.getPosition().clone(),rotation:ctx.camera.getRotation().clone(),fov:ctx.camera.camera?.fov};
    room=ctx.getRoom();previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    ctx.resetInput();active=true;const token=++generation;hadFullscreen=!!document.fullscreenElement;
    document.body.classList.add("projection-view-active");exitButton.hidden=false;exitButton.focus({preventScroll:true});applyCamera();window.dispatchEvent(new Event("resize"));
    status.textContent="PROJECTION · 視点固定 / 再生継続";
    if(fullscreen&&!document.fullscreenElement){
      if(!document.documentElement.requestFullscreen){status.textContent="PROJECTION · 全画面非対応のためウィンドウ内で上映";return;}
      try{
        await document.documentElement.requestFullscreen({navigationUI:"hide"});
        if(token!==generation||!active){if(document.fullscreenElement===document.documentElement)await document.exitFullscreen().catch(()=>{});return;}
        ownsFullscreen=document.fullscreenElement===document.documentElement;hadFullscreen=!!document.fullscreenElement;
      }catch{if(token===generation&&active)status.textContent="PROJECTION · 全画面を開始できないためウィンドウ内で上映";}
    }
  };
  const inputGuard=(event:Event)=>{
    if(!active)return;
    if(event.type==="keydown"&&(event as KeyboardEvent).key==="Escape"){event.preventDefault();event.stopImmediatePropagation();stop();return;}
    if(event.target===exitButton&&!(event instanceof KeyboardEvent))return;
    if(event.target===exitButton&&event instanceof KeyboardEvent&&(event.key==="Enter"||event.key===" ")){event.stopImmediatePropagation();return;}
    if(event.cancelable&&(!(event instanceof KeyboardEvent)||(!(event as KeyboardEvent).metaKey&&!(event as KeyboardEvent).ctrlKey)))event.preventDefault();
    event.stopImmediatePropagation();
  };
  const events=["pointerdown","pointermove","pointerup","pointercancel","mousedown","mousemove","mouseup","wheel","click","dblclick","keydown","keyup","touchstart","touchmove","touchend"];
  for(const name of events)window.addEventListener(name,inputGuard,{capture:true,passive:false});
  const fullscreenChanged=()=>{if(!active)return;if(document.fullscreenElement)hadFullscreen=true;else if(hadFullscreen)stop();};
  document.addEventListener("fullscreenchange",fullscreenChanged);
  const update=()=>{if(active&&(room!==ctx.getRoom()||!ctx.available()))stop();else applyCamera();const disabled=!ctx.getRoom()||!ctx.available();for(const button of element.querySelectorAll<HTMLButtonElement>("button"))button.disabled=disabled;};
  ctx.app.on("update",update);window.addEventListener("pagehide",stop);
  element.querySelector('[data-p="start"]')!.addEventListener("click",()=>void start());
  element.querySelector('[data-p="fullscreen"]')!.addEventListener("click",()=>void start(true));exitButton.addEventListener("click",stop);
  update();
  return {element,start,stop,applyCamera,isActive:()=>active,dispose:()=>{stop();ctx.app.off("update",update);window.removeEventListener("pagehide",stop);document.removeEventListener("fullscreenchange",fullscreenChanged);for(const name of events)window.removeEventListener(name,inputGuard,true);element.remove();exitButton.remove();style.remove();}};
}
