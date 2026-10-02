type Context={app:any;getRoom:()=>any;available:()=>boolean;canAddScreen:()=>boolean;addScreen:()=>Promise<string>};
export function createBrowserScreenUI(ctx:Context){
  const element=document.createElement("section");element.id="browserScreenPanel";
  element.innerHTML=`<strong>BROWSER SCREEN <small>0.30.1</small></strong><p>別タブやブラウザーのウィンドウを選び、空間内のスクリーンに映します。LOCAL VIEW · この端末のみ。</p><button type="button" data-b="add">ADD BROWSER SCREEN</button><div><button type="button" data-b="start">START SCREEN CAPTURE</button> <button type="button" data-b="stop">STOP CAPTURE</button></div><label>VIDEO FIT <select data-b="fit"><option value="contain">FIT / NO CROP</option><option value="cover">FILL / CROP</option></select></label><p data-b="status" role="status">STOPPED · 投影したいページを先に開いてください。</p>`;
  const q=<T extends HTMLElement>(name:string)=>element.querySelector<T>(`[data-b="${name}"]`)!;
  const video=document.createElement("video");video.id="browserScreenVideo";video.hidden=true;video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute("playsinline","");video.setAttribute("muted","");video.setAttribute("aria-hidden","true");document.body.appendChild(video);
  const style=document.createElement("style");style.textContent="#browserScreenPanel{padding:12px;color:inherit}#browserScreenPanel button{padding:8px;margin:4px 0}#browserScreenPanel select{padding:6px}#browserScreenVideo{display:none!important}";document.head.appendChild(style);
  q<HTMLSelectElement>("fit").value="contain";
  let stream:MediaStream|null=null,active=false,pending=false,adding=false,token=0,room:any=null,disposed=false;
  const supported=()=>window.isSecureContext&&typeof navigator.mediaDevices?.getDisplayMedia==="function";
  const controls=()=>{const ready=!!ctx.getRoom()&&ctx.available()&&!disposed;
    q<HTMLButtonElement>("start").disabled=!ready||!supported()||pending||active;
    q<HTMLButtonElement>("stop").disabled=(!active&&!pending)||disposed;
    q<HTMLButtonElement>("add").disabled=!ready||!ctx.canAddScreen()||adding;
  };
  const release=()=>{if(stream)for(const track of stream.getTracks())track.stop();stream=null;video.pause();video.srcObject=null;active=false;};
  const stop=(message="STOPPED · スクリーンは待機画像へ戻ります。")=>{token++;pending=false;room=null;release();q("status").textContent=message;controls();};
  const errorText=(err:any)=>err?.name==="NotAllowedError"?"画面共有をキャンセルしたか、許可されませんでした。":err?.name==="NotFoundError"?"共有できる画面が見つかりません。":err?.name==="NotReadableError"?"画面を取得できません。Macの画面収録権限を確認してください。":"画面共有を開始できません: "+String(err?.message??err);
  const start=async()=>{
    if(disposed||active||pending||!ctx.getRoom()||!ctx.available())return;
    if(!supported()){q("status").textContent="画面共有に対応したHTTPSのPCブラウザーで開いてください。";return;}
    const request=++token;pending=true;room=ctx.getRoom();const requestRoom=room;q("status").textContent="SELECT SCREEN · 投影するタブまたはウィンドウを選んでください。";controls();
    let acquired:MediaStream|null=null;
    try{
      // Call directly from the click handler: display capture requires activation.
      acquired=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      if(request!==token||disposed||requestRoom!==ctx.getRoom()||!ctx.available()){for(const track of acquired.getTracks())track.stop();if(request===token)stop();return;}
      const track=acquired.getVideoTracks()[0];if(!track||track.readyState==="ended")throw new Error("共有映像を取得できませんでした。");
      stream=acquired;video.srcObject=stream;
      track.addEventListener("ended",()=>{if(stream===acquired)stop("CAPTURE ENDED · 画面共有が終了しました。");});
      await video.play();
      if(request!==token||disposed||requestRoom!==ctx.getRoom()||!ctx.available()){for(const t of acquired.getTracks())t.stop();if(request===token)stop();return;}
      pending=false;active=true;q("status").textContent="CAPTURING · BROWSERスクリーンに表示中 / 映像のみ";controls();
    }catch(err){if(acquired)for(const track of acquired.getTracks())track.stop();if(request===token)stop(errorText(err));}
  };
  const add=async()=>{if(adding||disposed||!ctx.getRoom()||!ctx.available()||!ctx.canAddScreen())return;adding=true;const addRoom=ctx.getRoom();controls();try{await ctx.addScreen();if(!disposed&&ctx.getRoom()===addRoom)q("status").textContent=active?"CAPTURING · BROWSERスクリーンを追加しました。":"SCREEN ADDED · START SCREEN CAPTUREでページを選択。";}catch(err:any){if(!disposed&&ctx.getRoom()===addRoom)q("status").textContent=String(err?.message??err);}finally{adding=false;controls();}};
  const update=()=>{if((active||pending)&&(room!==ctx.getRoom()||!ctx.available()))stop();controls();};
  const pagehide=()=>stop();ctx.app.on("update",update);window.addEventListener("pagehide",pagehide);
  q("start").addEventListener("click",()=>void start());q("stop").addEventListener("click",()=>stop());q("add").addEventListener("click",()=>void add());
  if(!supported())q("status").textContent="画面共有に対応したHTTPSのPCブラウザーで開いてください。";controls();
  return {element,start,stop,getVideo:()=>active?video:null,getStream:()=>active?stream:null,getDisplay:()=>({mirror:false,fit:q<HTMLSelectElement>("fit").value}),dispose:()=>{disposed=true;stop();ctx.app.off("update",update);window.removeEventListener("pagehide",pagehide);video.remove();style.remove();element.remove();}};
}
