// 0.31.0: local marker camera. Shared entities/transforms are never reparented.
export function markerCameraMatrix(pc:any, raw:ArrayLike<number>, origin:any, scale:number) {
  // ARToolKit camera axes: +X right, +Y down, +Z forward.
  const pose=new pc.Mat4();pose.data.set(raw);
  const flip=new pc.Mat4().setFromEulerAngles(180,0,0);
  const ground=new pc.Mat4().setFromEulerAngles(90,0,0);
  const modelView=new pc.Mat4().mul2(flip,pose);modelView.mul(ground);
  const camera=new pc.Mat4().invert(modelView);
  const room=new pc.Mat4().setTRS(new pc.Vec3(origin.x,origin.y,origin.z),new pc.Quat(),new pc.Vec3(1/scale,1/scale,1/scale));
  return new pc.Mat4().mul2(room,camera);
}
let toolkitPromise:Promise<any>|null=null;
function loadToolkit(base:string):Promise<any> {
  if(toolkitPromise)return toolkitPromise;
  toolkitPromise=new Promise((resolve,reject)=>{
    const before=new Set(Object.getOwnPropertyNames(window));
    const script=document.createElement('script');script.src=new URL('ar/vendor/ARToolkit.js',base).href;
    const timer=window.setTimeout(()=>{script.remove();reject(new Error('ARエンジンの読込がタイムアウトしました。再試行してください。'));},20000);
    script.onload=()=>{clearTimeout(timer);
      const root:any=window;
      const candidates=['ARToolkit','artoolkit','ARController',...Object.getOwnPropertyNames(window).filter(k=>!before.has(k))];
      for(const key of candidates){const value=root[key];const controller=value?.ARController??value?.default?.ARController??value?.default??value;
        if(typeof controller?.initWithDimensions==='function'){resolve(controller);return;}}
      reject(new Error('ARControllerが見つかりません。AR assetsのインストールを確認してください。'));
    };
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error(`ARエンジンが取得できません: ${script.src}`));};document.head.appendChild(script);
  }).catch(error=>{toolkitPromise=null;throw error;});return toolkitPromise;
}
export function createARMarkerUI(ctx:any) {
  const {app,pc,camera,canvas}=ctx;
  const base=new URL("./",document.baseURI).href;
  const css=document.createElement('style');css.textContent=`
  #arMarkerLauncher{position:fixed;right:14px;bottom:100px;z-index:10050;background:#000;color:#fff;border:1px solid #fff;border-radius:8px;padding:12px;font-weight:bold}
  #arMarkerPanel{position:fixed;right:12px;bottom:150px;z-index:10051;background:#000;color:#fff;border:1px solid #fff;border-radius:10px;padding:14px;width:min(340px,calc(100vw - 52px));font:14px sans-serif;max-height:65vh;overflow:auto}
  #arMarkerPanel button,#arMarkerPanel input{margin:6px 3px;min-height:36px}#arMarkerPanel button{background:#000;color:white;border:1px solid white;border-radius:5px;padding:6px 10px}#arMarkerPanel a{color:#8eeaff}#arMarkerPanel input[type=number]{width:80px}#arMarkerPanel label{display:block}
  body.marker-ar-active *{visibility:hidden!important}body.marker-ar-active #application-canvas,body.marker-ar-active #arMarkerVideo,body.marker-ar-active #arMarkerBackdrop,body.marker-ar-active #arMarkerPanel,body.marker-ar-active #arMarkerPanel *,body.marker-ar-active #arMarkerLauncher{visibility:visible!important}
  body.marker-ar-active #application-canvas{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;z-index:1!important;pointer-events:none!important}
  #arMarkerBackdrop{position:fixed;inset:0;background:#000;z-index:0}#arMarkerVideo{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;transform:none}
  body.marker-ar-active{overflow:hidden!important}
  `;document.head.appendChild(css);
  const launch=document.createElement('button');launch.id='arMarkerLauncher';launch.textContent='AR · MARKER';document.body.appendChild(launch);
  const panel=document.createElement('div');panel.id='arMarkerPanel';panel.hidden=true;
  panel.innerHTML=`<strong>MARKER AR · 0.31.0.1</strong><button data-ar="close">閉じる</button><p>HIROを平らな机に置き、黒枠全体を映してください。</p><a target="_blank" rel="noopener" href="${new URL('ar/marker-print.html',base).href}">HIRO マーカーを開く / 印刷</a><label>黒枠の一辺 (mm) <input data-ar="size" type="number" min="30" max="1000" value="100"></label><label>表示倍率 <input data-ar="scale" type="range" min="0.005" max="0.2" step="0.005" value="0.02"><output data-ar="scale-text">2%</output></label><button data-ar="origin">選択作品を中心に</button><button data-ar="room">ROOM原点</button><label><input data-ar="test" type="checkbox" checked>認識確認用キューブ</label><button data-ar="start">START AR</button><button data-ar="stop" disabled>STOP AR</button><p data-ar="status" role="status">ROOMへ入室してから開始してください。</p>`;
  document.body.appendChild(panel);
  const q=(name:string)=>panel.querySelector(`[data-ar="${name}"]`) as any;
  const video=document.createElement('video');video.id='arMarkerVideo';video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.hidden=true;
  const backdrop=document.createElement('div');backdrop.id='arMarkerBackdrop';backdrop.hidden=true;document.body.append(backdrop,video);
  const layer=new pc.Layer({name:'Marker AR artworks'});app.scene.layers.push(layer);
  const cube=new pc.Entity('AR tracking check');cube.addComponent('render',{type:'box',layers:[layer.id]});const mat=new pc.StandardMaterial();mat.diffuse=new pc.Color(0,.7,1);mat.emissive=new pc.Color(0,.35,.5);mat.update();cube.render.material=mat;cube.enabled=false;app.root.addChild(cube);
  let active=false,pending=false,generation=0,room:any=null,stream:MediaStream|null=null,controller:any=null,saved:any=null;
  let origin={x:0,y:0,z:0},pose:any=null,projection:any=null,lastSeen=0,lastFrame=-1,detected=false;
  let meshes:any[]=[];const worldCamera=new pc.Mat4();
  const status=(s:string)=>q('status').textContent=s;
  const scale=()=>Math.max(.005,Math.min(.2,Number(q('scale').value)||.02));
  const controls=()=>{launch.hidden=!ctx.getRoom()||!ctx.available();q('start').disabled=active||pending||!ctx.getRoom()||!ctx.available();q('stop').disabled=!active&&!pending;q('size').disabled=active||pending;};
  function stop(message='ARを停止しました。通常のROOM表示に戻りました。') {
    generation++;active=false;pending=false;room=null;
    stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;video.hidden=true;backdrop.hidden=true;
    controller?.dispose();controller=null;pose=null;projection=null;lastSeen=0;lastFrame=-1;detected=false;
    layer.removeMeshInstances(meshes);meshes=[];cube.enabled=false;
    if(saved){const c=camera.camera;c.calculateTransform=saved.transform;c.calculateProjection=saved.projection;c.layers=saved.layers;c.rect.copy(saved.rect);c.clearColor.copy(saved.color);c.nearClip=saved.near;c.farClip=saved.far;c.frustumCulling=saved.culling;camera.setPosition(saved.position);camera.setRotation(saved.rotation);saved=null;ctx.finish();}
    document.body.classList.remove('marker-ar-active');status(message);controls();
  }
  const current=(token:number)=>generation===token&&pending&&room===ctx.getRoom()&&ctx.available();
  async function start(){
    if(active||pending||!ctx.getRoom()||!ctx.available())return;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status('HTTPSのSafariで開き、カメラを許可してください。');return;}
    const widthMM=Number(q('size').value);if(!Number.isFinite(widthMM)||widthMM<30||widthMM>1000){status('マーカーの黒枠サイズを30〜1000mmで指定してください。');return;}
    pending=true;room=ctx.getRoom();const token=++generation;controls();status('リアカメラとARエンジンを準備しています…');
    try {
      ctx.prepare();
      const result=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(!current(token)){result.getTracks().forEach(t=>t.stop());return;}
      stream=result;video.srcObject=result;video.hidden=false;backdrop.hidden=false;await video.play();
      if(!current(token))return;
      if(!video.videoWidth)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{video.removeEventListener('loadedmetadata',ready);reject(new Error('カメラの映像が開始されません。'));},12000);function ready(){clearTimeout(timer);resolve();}video.addEventListener('loadedmetadata',ready,{once:true});});
      const Controller=await loadToolkit(base);if(!current(token))return;
      const w=Math.min(640,video.videoWidth),h=Math.round(w*video.videoHeight/video.videoWidth);
      const fresh=await Controller.initWithDimensions(w,h,new URL('ar/data/camera_para.dat',base).href);
      if(!current(token)){fresh.dispose();return;}controller=fresh;
      controller.setProjectionNearPlane(.005);controller.setProjectionFarPlane(100);
      const id=await controller.loadMarker(new URL('ar/data/patt.hiro',base).href);if(!current(token))return;
      controller.trackPatternMarkerId(id,widthMM/1000);
      projection=new pc.Mat4();projection.data.set(controller.getCameraMatrix());
      controller.addEventListener('getMarker',(event:any)=>{if(event.data.marker.idPatt!==id||event.data.marker.cfPatt<.5)return;
        const raw=event.data.matrix;if(!raw||raw.length!==16||!Array.from(raw).every(Number.isFinite))return;
        pose=Float64Array.from(raw);lastSeen=performance.now();detected=true;
      });
      const c=camera.camera;saved={transform:c.calculateTransform,projection:c.calculateProjection,layers:[...c.layers],rect:c.rect.clone(),color:c.clearColor.clone(),near:c.nearClip,far:c.farClip,culling:c.frustumCulling,position:camera.getPosition().clone(),rotation:camera.getRotation().clone()};
      c.layers=[layer.id];c.nearClip=.005;c.farClip=100;c.frustumCulling=false;c.clearColor=new pc.Color(0,0,0,0);
      c.calculateProjection=(out:any)=>out.copy(projection);c.calculateTransform=(out:any)=>out.copy(worldCamera);
      active=true;pending=false;document.body.classList.add('marker-ar-active');status('SEARCHING · HIROの黒枠全体を映してください。');controls();
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(generation===token)stop('カメラが停止しました。START ARで再開してください。');});
    }catch(error){if(generation!==token)return;stop(`AR開始失敗 · ${error instanceof Error?error.message:String(error)}（Safariのカメラ許可も確認してください）`);}
  }
  function update(){
    if((active||pending)&&(room!==ctx.getRoom()||!ctx.available())){stop();return;}controls();if(!active)return;
    if(video.videoWidth/video.videoHeight<=0)return;
    const aspect=video.videoWidth/video.videoHeight,screen=innerWidth/innerHeight;
    // Match the video object-fit:cover crop, including off-centre calibration.
    const calibrated=controller.getCameraMatrix();projection.data.set(calibrated);
    const sx=Math.max(1,aspect/screen),sy=Math.max(1,screen/aspect);
    for(const i of [0,4,8,12])projection.data[i]*=sx;
    for(const i of [1,5,9,13])projection.data[i]*=sy;
    camera.camera.rect.set(0,0,1,1);
    try{if(video.readyState>=2&&video.currentTime!==lastFrame){lastFrame=video.currentTime;controller.process(video);}}
    catch(error){stop(`追跡エラー · ${error instanceof Error?error.message:String(error)}`);return;}
    const visible=!!pose&&performance.now()-lastSeen<180;
    layer.removeMeshInstances(meshes);meshes=[];
    if(visible){worldCamera.copy(markerCameraMatrix(pc,pose,origin,scale()));camera.setPosition(worldCamera.getTranslation());
      for(const item of ctx.getItems()){const entity=item.entity;if(!entity?.enabledInHierarchy)continue;
        for(const component of [...entity.findComponents('render'),...entity.findComponents('model')]){if(!component.enabled||!component.entity.enabledInHierarchy)continue;meshes.push(...(component.meshInstances??component.model?.meshInstances??[]));}}
      layer.addMeshInstances(meshes);
    }
    cube.enabled=visible&&q('test').checked;cube.setPosition(origin.x,origin.y+.015/scale(),origin.z);cube.setLocalScale(.03/scale(),.03/scale(),.03/scale());
    status(visible?`TRACKING · ${Math.round(scale()*1000)/10}% · 原点 ${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}, ${origin.z.toFixed(1)}`:detected?'MARKER LOST · 黒枠全体を映してください。':'SEARCHING · HIROの黒枠全体を映してください。');
  }
  launch.onclick=()=>panel.hidden=!panel.hidden;q('close').onclick=()=>panel.hidden=true;q('start').onclick=()=>void start();q('stop').onclick=()=>stop();
  q('scale').oninput=()=>q('scale-text').textContent=`${Math.round(scale()*1000)/10}%`;
  q('origin').onclick=()=>{const entity=ctx.getSelected();if(!entity){status('作品を選択してから押してください。');return;}const p=entity.getPosition();origin={x:p.x,y:p.y,z:p.z};status('選択作品の現在位置をAR原点にしました。');};
  q('room').onclick=()=>{origin={x:0,y:0,z:0};status('ROOM原点に戻しました。');};
  for(const name of ['pointerdown','pointermove','pointerup','wheel','keydown'])panel.addEventListener(name,e=>e.stopPropagation());
  const hidden=()=>{if(document.hidden&&(active||pending))stop('バックグラウンド移行でARを停止しました。START ARで再開してください。');};
  const pagehide=()=>stop();document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);app.on('update',update);controls();
  return {isBusy:()=>active||pending,stop,dispose(){stop();app.off('update',update);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);cube.destroy();mat.destroy();app.scene.layers.remove(layer);css.remove();launch.remove();panel.remove();video.remove();backdrop.remove();}};
}
