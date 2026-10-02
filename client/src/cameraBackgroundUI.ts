type Context={app:any;canvas:HTMLCanvasElement;getRoom:()=>any;available:()=>boolean;setView:(enabled:boolean,showGround:boolean)=>void};
export function createCameraBackgroundUI(ctx:Context){
  const panel=document.createElement("section");panel.id="cameraBackgroundPanel";
  panel.innerHTML=`<strong>CAMERA BACKGROUND <small>0.28.0</small></strong>
    <p>LOCAL VIEW · カメラ映像はこの端末だけに表示されます。</p>
    <label>CAMERA<select data-c="device"><option value="@rear">AUTO / REAR</option><option value="@front">FRONT</option></select></label>
    <div class="cb-buttons"><button type="button" data-c="start">START CAMERA</button><button type="button" data-c="stop">STOP CAMERA</button><button type="button" data-c="switch">SWITCH FRONT / REAR</button><button type="button" data-c="refresh">REFRESH CAMERAS</button></div>
    <div class="cb-options"><label class="cb-check"><input data-c="mirror" type="checkbox">MIRROR VIDEO</label><label class="cb-check"><input data-c="ground" type="checkbox">SHOW GROUND / GRID</label><label>VIDEO FIT<select data-c="fit"><option value="cover">FILL / CROP</option><option value="contain">FIT / NO CROP</option></select></label></div>
    <div data-c="status" role="status">STOPPED · START CAMERAで開始します。</div>`;
  const q=<T extends HTMLElement>(name:string)=>panel.querySelector<T>(`[data-c="${name}"]`)!;
  const video=document.createElement("video");video.id="cameraBackgroundVideo";video.hidden=true;
  video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute("playsinline","");video.setAttribute("muted","");video.setAttribute("aria-hidden","true");
  const css=document.createElement("style");css.textContent=`
    #cameraBackgroundVideo{position:fixed;inset:0;width:100vw;height:100dvh;object-fit:cover;background:#000;z-index:0;pointer-events:none}
    #cameraBackgroundVideo[hidden]{display:none!important}
    body.camera-background-active #application-canvas{position:fixed!important;inset:0;z-index:1!important;background:transparent!important}
    body.camera-background-active #hud,body.camera-background-active #joystick{z-index:20}
    #cameraBackgroundPanel{display:grid;gap:10px;padding:12px;background:#101d28;color:#edf7ff;border:1px solid #48687f;border-radius:10px;font:12px system-ui}
    #cameraBackgroundPanel p{margin:0;color:#a4c1d2;font-size:11px;line-height:1.5}#cameraBackgroundPanel small{color:#8facbf}
    #cameraBackgroundPanel label{display:grid;gap:5px;font-size:10px;color:#b8d2e1}
    #cameraBackgroundPanel select{width:100%!important;min-width:0;box-sizing:border-box;padding:9px;border:1px solid #516b7b;border-radius:7px;background:#1a2b39;color:white}
    #cameraBackgroundPanel .cb-buttons{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    #cameraBackgroundPanel button{width:100%!important;min-width:0!important;margin:0!important;padding:10px 6px;min-height:40px;background:#25465d;border:1px solid #63839a;border-radius:7px;color:#f1f8ff;font:700 10px system-ui;cursor:pointer}
    #cameraBackgroundPanel button:disabled{opacity:.4;cursor:default}#cameraBackgroundPanel .cb-options{display:grid;gap:10px}
    #cameraBackgroundPanel input[type=checkbox]{width:18px!important;height:18px;margin:0 8px 0 0;vertical-align:middle}#cameraBackgroundPanel .cb-options label.cb-check{display:block}
    #cameraBackgroundPanel [data-c=status]{padding:9px;background:#09151f;border-radius:7px;line-height:1.5;overflow-wrap:anywhere}
    @media(max-width:700px){#cameraBackgroundPanel select{font-size:16px}}
  `;
  document.head.append(css);document.body.prepend(video);
  let stream:MediaStream|null=null,active=false,pending=false,generation=0,roomAtStart:any=null,facing:"user"|"environment"="environment";
  const devices=navigator.mediaDevices;
  const supported=()=>window.isSecureContext&&!!devices?.getUserMedia&&ctx.available();
  const status=(text:string)=>{q("status").textContent=text;};
  function controls(){
    const ready=supported()&&!!ctx.getRoom();
    q<HTMLButtonElement>("start").disabled=!ready||pending||active;
    q<HTMLButtonElement>("stop").disabled=!active&&!pending;
    q<HTMLButtonElement>("switch").disabled=!ready||pending;
    q<HTMLButtonElement>("refresh").disabled=!supported()||pending;
    q<HTMLSelectElement>("device").disabled=!ready||pending;
  }
  function presentation(){
    video.style.transform=q<HTMLInputElement>("mirror").checked?"scaleX(-1)":"none";
    video.style.objectFit=q<HTMLSelectElement>("fit").value==="contain"?"contain":"cover";
    document.body.classList.toggle("camera-background-active",active);
    ctx.setView(active,q<HTMLInputElement>("ground").checked);
  }
  function release(){
    if(stream)for(const track of stream.getTracks())track.stop();
    stream=null;video.pause();video.srcObject=null;video.hidden=true;active=false;presentation();
  }
  function stop(text="STOPPED · 通常のWORLD表示へ戻りました。"){
    ++generation;pending=false;roomAtStart=null;release();status(text);controls();
  }
  function errorText(error:any){
    const messages:Record<string,string>={NotAllowedError:"カメラの使用が許可されていません。ブラウザのサイト設定を確認してください。",NotFoundError:"使用できるカメラが見つかりません。",NotReadableError:"カメラを開始できません。他のアプリや別のカメラ機能が使用中か確認してください。",OverconstrainedError:"選択したカメラを使用できません。AUTO / REARまたは別のカメラを選んでください。",SecurityError:"この環境ではカメラが制限されています。",AbortError:"カメラの開始が中断されました。"};
    return messages[error?.name]||"カメラを開始できませんでした。接続とブラウザの設定を確認してください。";
  }
  async function refreshDevices(expected=generation){
    if(!supported()||!devices.enumerateDevices)return;
    try{
      const list=(await devices.enumerateDevices()).filter(device=>device.kind==="videoinput"&&device.deviceId);
      if(expected!==generation)return;
      const select=q<HTMLSelectElement>("device"),old=select.value;
      select.replaceChildren();
      for(const [value,label] of [["@rear","AUTO / REAR"],["@front","FRONT"],...list.map((d,i)=>[d.deviceId,d.label||`CAMERA ${i+1}`])]){
        const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);
      }
      select.value=Array.from(select.options).some(option=>option.value===old)?old:"@rear";
    }catch{if(!active&&!pending)status("カメラ一覧を取得できません。START CAMERAで開始を試してください。");}
  }
  async function start(){
    if(!supported()){status("カメラにはHTTPSと対応ブラウザが必要です。");return;}
    if(!ctx.getRoom()||pending)return;
    const request=++generation;roomAtStart=ctx.getRoom();pending=true;release();controls();status("REQUESTING CAMERA · 許可画面を確認してください。STOPで中止できます。");
    let candidate:MediaStream|null=null;
    try{
      const choice=q<HTMLSelectElement>("device").value;
      if(choice==="@front")facing="user";else if(choice==="@rear")facing="environment";
      const constraint:MediaTrackConstraints={width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30},...(choice.startsWith("@")?{facingMode:{ideal:facing}}:{deviceId:{exact:choice}})};
      candidate=await devices.getUserMedia({audio:false,video:constraint});
      if(request!==generation||ctx.getRoom()!==roomAtStart){for(const track of candidate.getTracks())track.stop();if(request===generation)stop();return;}
      const track=candidate.getVideoTracks()[0];if(!track)throw new Error("No video track");
      stream=candidate;video.srcObject=candidate;video.hidden=false;
      track.addEventListener("ended",()=>{if(request===generation)stop("CAMERA ENDED · 接続を確認して再開してください。");});
      await video.play();
      if(request!==generation)return;
      if(ctx.getRoom()!==roomAtStart){stop();return;}
      active=true;pending=false;presentation();controls();
      const settings=track.getSettings();status(`LIVE · ${track.label||"CAMERA"} · ${settings.width||"?"} × ${settings.height||"?"} · LOCAL ONLY`);
      await refreshDevices(request);
    }catch(error){
      if(candidate)for(const track of candidate.getTracks())track.stop();
      if(request!==generation)return;
      pending=false;release();status(errorText(error));controls();
    }
  }
  q("start").addEventListener("click",()=>{void start();});
  q("stop").addEventListener("click",()=>stop());
  q("switch").addEventListener("click",()=>{if(pending)return;facing=facing==="environment"?"user":"environment";q<HTMLSelectElement>("device").value=facing==="user"?"@front":"@rear";if(active)void start();else status("カメラを選択しました。START CAMERAで開始します。");});
  q("refresh").addEventListener("click",()=>{void refreshDevices();});
  q("device").addEventListener("change",()=>{if(active&&!pending)void start();});
  for(const name of ["mirror","fit","ground"])q(name).addEventListener("change",presentation);
  for(const event of ["pointerdown","pointermove","pointerup","wheel","keydown"])panel.addEventListener(event,e=>e.stopPropagation());
  const update=()=>{if((active||pending)&&ctx.getRoom()!==roomAtStart)stop();controls();};
  ctx.app.on("update",update);
  const pageHide=()=>stop();window.addEventListener("pagehide",pageHide);
  const deviceChange=()=>{if(active)void refreshDevices();};devices?.addEventListener?.("devicechange",deviceChange);
  if(!supported())status("カメラにはHTTPSと対応ブラウザが必要です。");
  else if(!ctx.getRoom())status("ROOMへ入室してからSTART CAMERAで開始してください。");
  controls();
  return {element:panel,stop,dispose(){stop();ctx.app.off?.("update",update);window.removeEventListener("pagehide",pageHide);devices?.removeEventListener?.("devicechange",deviceChange);video.remove();css.remove();panel.remove();}};
}
