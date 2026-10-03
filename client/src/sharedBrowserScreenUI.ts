type Context={app:any;getRoom:()=>any;getLocalVideo:()=>HTMLVideoElement|null;getLocalStream:()=>MediaStream|null;canPublish:()=>boolean;channel?:"screen"|"camera-screen";iceServers?:RTCIceServer[]};
type Peer={pc:RTCPeerConnection;id:string;linkId:string;epoch:string;chain:Promise<void>;candidates:RTCIceCandidateInit[]};
export function createSharedBrowserScreenUI(ctx:Context){
  const camera=ctx.channel==="camera-screen",channel=ctx.channel??"screen",prefix=camera?"sharedCameraScreen":"sharedBrowserScreen";
  const event=(name:string)=>channel+name.slice("screen".length);
  const element=document.createElement("section");element.id=prefix+"Panel";
  element.innerHTML=`<strong>${camera?"SHARED CAMERA SCREEN":"SHARED BROWSER SCREEN"} <small>0.30.9</small></strong><p>${camera?"START CAMERA":"MacでSTART SCREEN CAPTURE"}の後、SHARE TO ROOM。参加者は同じROOMで受信します。映像のみ。</p><button type="button" data-s="share">SHARE TO ROOM</button> <button type="button" data-s="stop">STOP SHARING</button><div><label>RECEIVE MODE <select data-s="mode"><option value="auto">AUTO / WebRTC</option><option value="images">IMAGE / iPHONE</option></select></label><button type="button" data-s="watch">WATCH / RECONNECT SCREEN</button></div><p data-s="status" role="status">WAITING · ROOMの共有映像を待っています。</p>`;
  const q=<T extends HTMLElement>(n:string)=>element.querySelector<T>(`[data-s="${n}"]`)!;
  const video=document.createElement("video");video.id=prefix+"Video";video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute("muted","");video.setAttribute("playsinline","");video.setAttribute("aria-hidden","true");document.body.appendChild(video);
  const css=document.createElement("style");css.textContent="#sharedBrowserScreenPanel{padding:12px}#sharedBrowserScreenPanel button{padding:8px;margin:4px 0}#sharedBrowserScreenVideo{position:fixed;bottom:0;left:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:1}body.projection-view-active #sharedBrowserScreenVideo{visibility:visible!important}";css.textContent=css.textContent!.replaceAll("sharedBrowserScreen",prefix);document.head.appendChild(css);
  const canvas=document.createElement("canvas");canvas.width=640;canvas.height=360;const draw=canvas.getContext("2d");
  const preview=document.createElement("details"),summary=document.createElement("summary");summary.textContent="受信プレビュー";preview.hidden=true;canvas.style.width="100%";canvas.style.maxWidth="480px";canvas.style.height="auto";preview.appendChild(summary);preview.appendChild(canvas);element.appendChild(preview);
  const appleMobile=typeof navigator!=="undefined"&&(/iPhone|iPad|iPod/.test(navigator.userAgent??"")||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1));
  q<HTMLSelectElement>("mode").value=appleMobile?"images":"auto";
  const imageMode=()=>q<HTMLSelectElement>("mode").value==="images";
  const encode=document.createElement("canvas"),encoder=encode.getContext("2d");
  const peers=new Map<string,Peer>();let room:any=null,publisher="",epoch="",publishing=false,requested=false,watching=true,disposed=false,hasFrame=false,latestFrame=-1,lastDecodedFrame=-1,receiveGeneration=0,frameSerial=0,linkSerial=0,frameSequence=0,fallbackViewers=0,receiverFallback=true,lastError="",videoTime=-1,lastVideoAt=0,unsubscribers:(()=>void)[]=[];
  const canRTC=()=>typeof RTCPeerConnection!=="undefined";
  const send=(name:string,payload:any,bound=room)=>{try{bound?.send(event(name),payload);}catch{lastError="接続が切れました。ROOMへ再入室してください。";}};
  const current=(p:Peer)=>!disposed&&p.epoch===epoch&&peers.get(p.id)===p&&!!room;
  function closePeer(id:string){const p=peers.get(id);if(!p)return;peers.delete(id);p.pc.onicecandidate=null;p.pc.ontrack=null;p.pc.onconnectionstatechange=null;p.pc.close();}
  function resetPeers(){for(const id of [...peers.keys()])closePeer(id);const remote=video.srcObject as MediaStream|null;if(remote)for(const track of remote.getTracks())track.stop();video.pause();video.srcObject=null;hasFrame=false;latestFrame=-1;lastDecodedFrame=-1;receiveGeneration++;fallbackViewers=0;receiverFallback=true;videoTime=-1;lastVideoAt=0;preview.hidden=true;}
  const rtcReady=()=>!imageMode()&&lastVideoAt>0&&Date.now()-lastVideoAt<2500&&video.readyState>=2&&!video.paused&&peers.get(publisher)?.pc.connectionState==="connected";
  function checkVideoProgress(){if(video.readyState<2||video.paused)return;if(videoTime<0){videoTime=video.currentTime;return;}if(video.currentTime!==videoTime){videoTime=video.currentTime;lastVideoAt=Date.now();}}
  function controls(){q<HTMLButtonElement>("share").disabled=!room||!ctx.canPublish()||!ctx.getLocalStream()||publishing||requested||!!publisher;
    q<HTMLButtonElement>("stop").disabled=!publishing&&!requested;q<HTMLButtonElement>("watch").disabled=!room||publishing;
    const live=rtcReady();
    q("status").textContent=lastError||(publishing?`SHARING · ${peers.size} 接続 / 軽量配信 ${fallbackViewers} 台`:requested?"STARTING SHARE…":publisher?(live?"RECEIVING · WebRTC":hasFrame?`RECEIVING · 画像配信 / FRAME ${frameSerial}`:"CONNECTING · 映像を受信中 / WATCHで再試行"):"WAITING · ROOMの共有映像を待っています。");}
  function fallback(enabled:boolean){if(publishing||!publisher||!room)return;if(receiverFallback===enabled)return;receiverFallback=enabled;send("screen:fallback",{epoch,enabled});}
  function makePeer(id:string,linkId:string,sender:boolean){
    if(!canRTC())return null;closePeer(id);let pc:RTCPeerConnection;try{pc=new RTCPeerConnection({iceServers:ctx.iceServers??[{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]});}catch{return null;}
    const p:Peer={pc,id,linkId,epoch,chain:Promise.resolve(),candidates:[]};peers.set(id,p);const bound=room;
    pc.onicecandidate=event=>{if(event.candidate&&current(p))send("screen:signal",{targetSessionId:id,epoch:p.epoch,linkId,candidate:event.candidate.toJSON()},bound);};
    if(sender){for(const track of ctx.getLocalStream()?.getVideoTracks()??[]){const sender=pc.addTrack(track,ctx.getLocalStream()!);try{const params=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];params.encodings[0].maxBitrate=1500000;params.encodings[0].maxFramerate=15;void sender.setParameters(params).catch(()=>{});}catch{}}}
    else pc.ontrack=event=>{if(!current(p)||event.track.kind!=="video")return;const media=event.streams[0]??new MediaStream([event.track]);video.srcObject=media;void video.play().catch(()=>{lastError="映像再生にはWATCH / RECONNECT SCREENを押してください。";controls();});event.track.addEventListener("ended",()=>{if(current(p)){video.pause();hasFrame=false;fallback(true);}});};
    pc.onconnectionstatechange=()=>{if(!current(p))return;if(pc.connectionState==="failed"||pc.connectionState==="disconnected"){if(!sender){video.pause();fallback(true);}lastError="WebRTC接続を再確認中。軽量画像配信で継続します。";}else if(pc.connectionState==="connected")lastError="";controls();};
    return p;
  }
  async function offer(id:string){if(!publishing||peers.has(id)||!ctx.getLocalStream())return;const p=makePeer(id,`${room.sessionId}:${++linkSerial}`,true);if(!p)return;
    try{const desc=await p.pc.createOffer();if(!current(p))return;await p.pc.setLocalDescription(desc);if(current(p))send("screen:signal",{targetSessionId:id,epoch:p.epoch,linkId:p.linkId,description:{type:p.pc.localDescription!.type,sdp:p.pc.localDescription!.sdp}});}catch{if(current(p)){closePeer(id);lastError="軽量画像配信を利用しています。";controls();}}
  }
  function signal(payload:any){if(payload?.epoch!==epoch||!watching||!publisher||(!publishing&&imageMode()))return;const from=String(payload.fromSessionId||""),linkId=String(payload.linkId||"");if(!from||!linkId||(!publishing&&from!==publisher))return;
    let p=peers.get(from);if(!publishing&&payload.description?.type==="offer"&&p?.linkId!==linkId)p=makePeer(from,linkId,false)??undefined;
    if(!p&&!publishing)p=makePeer(from,linkId,false)??undefined;if(!p||p.linkId!==linkId)return;
    const peer=p;peer.chain=peer.chain.then(async()=>{if(!current(peer))return;
      if(payload.description){await peer.pc.setRemoteDescription(payload.description);if(!current(peer))return;for(const candidate of peer.candidates.splice(0))await peer.pc.addIceCandidate(candidate);
        if(payload.description.type==="offer"){const answer=await peer.pc.createAnswer();if(!current(peer))return;await peer.pc.setLocalDescription(answer);if(current(peer))send("screen:signal",{targetSessionId:from,epoch:peer.epoch,linkId:peer.linkId,description:{type:peer.pc.localDescription!.type,sdp:peer.pc.localDescription!.sdp}});}}
      else if(payload.candidate){if(peer.pc.remoteDescription)await peer.pc.addIceCandidate(payload.candidate);else if(peer.candidates.length<64)peer.candidates.push(payload.candidate);}
    }).catch(()=>{if(current(peer)){lastError="軽量画像配信を利用しています。";fallback(true);controls();}});
  }
  function state(payload:any){const nextPublisher=String(payload?.publisherSessionId||""),nextEpoch=String(payload?.epoch||"");if(nextEpoch!==epoch||nextPublisher!==publisher){resetPeers();publisher=nextPublisher;epoch=nextEpoch;lastError="";}
    publishing=!!room&&publisher===room.sessionId;requested=false;
    if(publishing&&(!ctx.getLocalStream()||!ctx.canPublish())){stopSharing();return;}
    if(!publishing&&publisher&&watching){receiverFallback=false;fallback(true);}controls();
  }
  function frame(payload:any){if(!room||publishing||!watching||!publisher||payload?.epoch!==epoch||!draw||!Number.isSafeInteger(payload.sequence)||payload.sequence<=latestFrame||typeof payload.data!=="string"||payload.data.length>90000)return;
    latestFrame=payload.sequence;const sequence=latestFrame,currentEpoch=epoch,generation=receiveGeneration;const image=new Image();image.onload=()=>{if(disposed||epoch!==currentEpoch||generation!==receiveGeneration||sequence<=lastDecodedFrame||!watching)return;if(image.naturalWidth>640||image.naturalHeight>360)return;lastDecodedFrame=sequence;canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;draw.drawImage(image,0,0);(canvas as any).__screenFrame=++frameSerial;hasFrame=true;preview.hidden=false;lastError="";controls();};image.onerror=()=>{if(epoch===currentEpoch&&sequence===latestFrame){lastError="受信画像を表示できません。WATCHで再接続してください。";controls();}};image.src=payload.data;
  }
  function bind(next:any){if(room===next)return;if(room){if(publishing||requested)send("screen:stop",{epoch});send("screen:watch",{enabled:false});}for(const unsubscribe of unsubscribers)unsubscribe();unsubscribers=[];resetPeers();room=next;publisher="";epoch="";publishing=false;requested=false;lastError="";watching=true;
    if(room){const bound=room;for(const [name,handler] of [["screen:state",state],["screen:signal",signal],["screen:frame",frame],["screen:viewers",(payload:any)=>{if(!publishing||payload.epoch!==epoch)return;const viewers=new Set<string>(payload.rtcViewers??payload.viewers??[]);fallbackViewers=Array.isArray(payload.fallback)?payload.fallback.length:0;for(const id of [...peers.keys()])if(!viewers.has(id))closePeer(id);for(const id of viewers)void offer(id);controls();}],["screen:result",(payload:any)=>{if(payload?.ok===false){requested=false;lastError=payload.reason==="publisher-busy"?"別の参加者が配信中です。":"配信にはROOMの編集権限が必要です。";controls();}}]] as [string,(p:any)=>void][]){const off=bound.onMessage(event(name),(payload:any)=>{if(room===bound&&!disposed)handler(payload);});if(typeof off==="function")unsubscribers.push(off);}send("screen:watch",{enabled:true,mode:q<HTMLSelectElement>("mode").value});}controls();
  }
  function startSharing(){if(!room||publishing||requested||publisher||!ctx.canPublish()||!ctx.getLocalStream())return;requested=true;lastError="";send("screen:publish",{});controls();}
  function stopSharing(){if(room&&(publishing||requested))send("screen:stop",{epoch});publishing=false;requested=false;resetPeers();controls();}
  function watch(){if(!room||publishing)return;resetPeers();watching=true;lastError="";send("screen:watch",{enabled:false});send("screen:watch",{enabled:true,mode:q<HTMLSelectElement>("mode").value});controls();}
  function pumpFrame(){
    if(publishing&&(ctx.getRoom()!==room||!ctx.canPublish()||!ctx.getLocalStream())){stopSharing();return;}
    if(!publishing||!fallbackViewers||!encoder||!ctx.getLocalStream())return;
    const source=ctx.getLocalVideo();if(!source||source.readyState<2||!source.videoWidth||!source.videoHeight)return;
    const ratio=Math.min(1,640/source.videoWidth,360/source.videoHeight);encode.width=Math.max(1,Math.round(source.videoWidth*ratio));encode.height=Math.max(1,Math.round(source.videoHeight*ratio));
    try{encoder.drawImage(source,0,0,encode.width,encode.height);let data=encode.toDataURL("image/jpeg",.55);if(data.length>90000)data=encode.toDataURL("image/jpeg",.3);if(data.length<=90000)send("screen:frame",{epoch,sequence:++frameSequence,data});}catch{lastError="軽量映像の取得に失敗しました。";}
  }
  function update(){bind(ctx.getRoom());if(publishing&&(!ctx.getLocalStream()||!ctx.canPublish())){stopSharing();return;}
    if(!publishing&&publisher){checkVideoProgress();const live=rtcReady();fallback(!live);preview.hidden=live||!hasFrame;}

    controls();
  }
  const frameTimer=window.setInterval(pumpFrame,350);
  const pagehide=()=>bind(null);ctx.app.on("update",update);window.addEventListener("pagehide",pagehide);
  q("share").addEventListener("click",startSharing);q("stop").addEventListener("click",stopSharing);q("watch").addEventListener("click",watch);q("mode").addEventListener("change",watch);controls();
  return {element,startSharing,stopSharing,watch,getSource:()=>!publishing&&publisher?(rtcReady()?video:hasFrame?canvas:null):null,leave:()=>bind(null),dispose:()=>{bind(null);disposed=true;window.clearInterval(frameTimer);ctx.app.off("update",update);window.removeEventListener("pagehide",pagehide);video.remove();css.remove();element.remove();}};
}
