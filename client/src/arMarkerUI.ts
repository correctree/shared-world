// Refine a rigid CV pose against the four observed corners. No calibration changes.
export function refineMarkerPose(initial:ArrayLike<number>,vertices:number[][],direction:number,width:number,projection:ArrayLike<number>,imageWidth:number,imageHeight:number) {
  const original=Float64Array.from(initial),fx=Math.abs(projection[0])*imageWidth/2,fy=Math.abs(projection[5])*imageHeight/2;
  const cx=(1-projection[8])*imageWidth/2,cy=(1+projection[9])*imageHeight/2;
  if(!validMarkerPose(original)||!vertices||vertices.length!==4||!vertices.every(v=>v&&v.length>=2&&v.every(Number.isFinite))||!(width>0)||!(fx>0)||!(fy>0))return {pose:original,before:NaN,after:NaN,iterations:0};
  const h=width/2,local=[[-h,-h],[-h,h],[h,h],[h,-h]];
  const residual=(pose:ArrayLike<number>)=>{
    const out:number[]=[];
    for(let i=0;i<4;i++){const [X,Y]=local[i],z=pose[8]*X+pose[9]*Y+pose[11];if(z<=1e-5)return null;
      const v=vertices[(i+4-(direction||0))%4];out.push(fx*(pose[0]*X+pose[1]*Y+pose[3])/z+cx-v[0],fy*(pose[4]*X+pose[5]*Y+pose[7])/z+cy-v[1]);}
    return out.every(Number.isFinite)?out:null;
  };
  const cost=(r:number[])=>r.reduce((n,v)=>n+v*v,0);
  const step=(pose:ArrayLike<number>,delta:number[])=>{
    const [x,y,z]=delta,theta=Math.hypot(x,y,z),a=theta<1e-8?1:Math.sin(theta)/theta,b=theta<1e-8?.5:(1-Math.cos(theta))/(theta*theta);
    const R=[1-b*(y*y+z*z),b*x*y-a*z,b*x*z+a*y,b*x*y+a*z,1-b*(x*x+z*z),b*y*z-a*x,b*x*z-a*y,b*y*z+a*x,1-b*(x*x+y*y)];
    const out=new Float64Array(pose);
    for(let r=0;r<3;r++)for(let c=0;c<3;c++)out[r*4+c]=R[r*3]*pose[c]+R[r*3+1]*pose[4+c]+R[r*3+2]*pose[8+c];
    out[3]+=delta[3];out[7]+=delta[4];out[11]+=delta[5];return out;
  };
  let value=original,r=residual(value);if(!r)return {pose:original,before:NaN,after:NaN,iterations:0};
  const before=Math.sqrt(cost(r)/4);let current=cost(r),lambda=.001,iterations=0;
  for(let iteration=0;iteration<12;iteration++){
    if(current<1e-12)break;
    const columns:number[][]=[];
    for(let j=0;j<6;j++){const eps=j<3?1e-5:Math.max(1e-7,width*1e-4),d=[0,0,0,0,0,0];d[j]=eps;const rr=residual(step(value,d));if(!rr)return {pose:value,before,after:Math.sqrt(current/4),iterations};columns.push(rr.map((v,k)=>(v-r![k])/eps));}
    const rows=Array.from({length:6},(_,i)=>Array.from({length:7},(_,j)=>j===6?-columns[i].reduce((n,v,k)=>n+v*r![k],0):columns[i].reduce((n,v,k)=>n+v*columns[j][k],0)));
    for(let i=0;i<6;i++)rows[i][i]+=lambda*(rows[i][i]+1);
    let singular=false;
    for(let c=0;c<6;c++){let pivot=c;for(let j=c+1;j<6;j++)if(Math.abs(rows[j][c])>Math.abs(rows[pivot][c]))pivot=j;
      if(Math.abs(rows[pivot][c])<1e-12){singular=true;break;}[rows[c],rows[pivot]]=[rows[pivot],rows[c]];const n=rows[c][c];for(let j=c;j<7;j++)rows[c][j]/=n;
      for(let i=0;i<6;i++)if(i!==c){const k=rows[i][c];for(let j=c;j<7;j++)rows[i][j]-=k*rows[c][j];}}
    if(singular)break;
    const delta=rows.map(row=>row[6]);
    const limit=Math.min(1,.2/Math.max(1e-12,Math.hypot(...delta.slice(0,3))),width*.5/Math.max(1e-12,Math.hypot(...delta.slice(3))));
    const candidate=step(value,delta.map(v=>v*limit)),rr=residual(candidate);iterations++;
    if(rr&&validMarkerPose(candidate)&&cost(rr)<current){value=candidate;r=rr;current=cost(rr);lambda=Math.max(1e-7,lambda*.3);}
    else lambda=Math.min(1e8,lambda*10);
  }
  return {pose:value,before,after:Math.sqrt(current/4),iterations};
}
// Generic calibration can be stretched anisotropically by ARToolKit resizing.
// Assume square camera pixels and preserve horizontal focal length / principal point.
export function markerSquarePixelProjection(raw:ArrayLike<number>,width:number,height:number) {
  const out=Float64Array.from(raw),fx=Math.abs(raw[0])*width/2,fy=Math.abs(raw[5])*height/2;
  if(Number.isFinite(fx)&&Number.isFinite(fy)&&fx>0&&fy>0&&Math.abs(fy/fx-1)>.02)
    out[5]=Math.sign(raw[5])*2*fx/height;
  return out;
}
// Quaternion filtering preserves rigid rotation, including 180-degree changes.
export function markerQuaternion(m:ArrayLike<number>) {
  const trace=m[0]+m[5]+m[10];let x:number,y:number,z:number,w:number;
  if(trace>0){const s=Math.sqrt(trace+1)*2;w=s/4;x=(m[6]-m[9])/s;y=(m[8]-m[2])/s;z=(m[1]-m[4])/s;}
  else if(m[0]>m[5]&&m[0]>m[10]){const s=Math.sqrt(1+m[0]-m[5]-m[10])*2;w=(m[6]-m[9])/s;x=s/4;y=(m[4]+m[1])/s;z=(m[8]+m[2])/s;}
  else if(m[5]>m[10]){const s=Math.sqrt(1+m[5]-m[0]-m[10])*2;w=(m[8]-m[2])/s;x=(m[4]+m[1])/s;y=s/4;z=(m[9]+m[6])/s;}
  else{const s=Math.sqrt(1+m[10]-m[0]-m[5])*2;w=(m[1]-m[4])/s;x=(m[8]+m[2])/s;y=(m[9]+m[6])/s;z=s/4;}
  const n=Math.hypot(x,y,z,w);return [x/n,y/n,z/n,w/n];
}
export function createMarkerPoseFilter() {
  let value:Float64Array|null=null,reference:Float64Array|null=null,last=0,movingUntil=0,pending:Float64Array|null=null,count=0;
  const distance=(a:ArrayLike<number>,b:ArrayLike<number>)=>Math.hypot(a[12]-b[12],a[13]-b[13],a[14]-b[14]);
  const dot=(a:number[],b:number[])=>a.reduce((n,v,i)=>n+v*b[i],0);
  const angle=(a:ArrayLike<number>,b:ArrayLike<number>)=>2*Math.acos(Math.min(1,Math.abs(dot(markerQuaternion(a),markerQuaternion(b)))));
  return {reset(){value=null;reference=null;last=0;movingUntil=0;pending=null;count=0;},sample(next:Float64Array,now:number) {
    if(!Array.from(next).every(Number.isFinite))return null;
    if(!value){value=new Float64Array(next);reference=new Float64Array(next);last=now;return value;}
    // Compare detections with the last accepted detection, not the lagging display.
    if(distance(reference!,next)>Math.max(.12,reference![14]*.3)||angle(reference!,next)>Math.PI/3){
      count=pending&&distance(pending,next)<.06&&angle(pending,next)<Math.PI/9?count+1:1;
      pending=new Float64Array(next);if(count<3)return null;
    }
    // Increase responsiveness for coherent movement; keep stronger damping at rest.
    const elapsed=Math.max(.001,(now-last)/1000);
    const linearSpeed=distance(reference!,next)/elapsed,angularSpeed=angle(reference!,next)/elapsed;
    const d=distance(value,next),rotationError=angle(value,next);
    if(linearSpeed>.06||angularSpeed>.3||d>.008||rotationError>.035)movingUntil=now+100;
    pending=null;count=0;reference=new Float64Array(next);
    // Bound the interpolation step across detection gaps.
    const dt=Math.min(.05,elapsed);last=now;
    const tau=now<=movingUntil ? .018 : .12,alpha=1-Math.exp(-dt/tau);
    const positionWeight=d>0?Math.min(alpha,2*dt/d):alpha;
    const out=new Float64Array(value);for(const i of [12,13,14])out[i]+=positionWeight*(next[i]-out[i]);
    const a=markerQuaternion(value),b=markerQuaternion(next);let cosine=dot(a,b);
    if(cosine<0){for(let i=0;i<4;i++)b[i]=-b[i];cosine=-cosine;}
    const theta=Math.acos(Math.min(1,cosine));
    const t=theta>1e-8?Math.min(alpha,Math.PI*dt/(2*theta)):alpha;
    let q:number[];
    if(cosine>.9995)q=a.map((v,i)=>v+t*(b[i]-v));
    else{const sin=Math.sin(theta),wa=Math.sin((1-t)*theta)/sin,wb=Math.sin(t*theta)/sin;q=a.map((v,i)=>wa*v+wb*b[i]);}
    const n=Math.hypot(...q);const [x,y,z,w]=q.map(v=>v/n);
    out[0]=1-2*(y*y+z*z);out[1]=2*(x*y+z*w);out[2]=2*(x*z-y*w);
    out[4]=2*(x*y-z*w);out[5]=1-2*(x*x+z*z);out[6]=2*(y*z+x*w);
    out[8]=2*(x*z+y*w);out[9]=2*(y*z-x*w);out[10]=1-2*(x*x+y*y);
    value=out;return value;
  }};
}
// Pinhole planar-pose fallback from the detector's ordered square vertices.
export function markerPoseFromCorners(vertices:number[][], direction:number, width:number, projection:ArrayLike<number>, imageWidth:number, imageHeight:number) {
  const fx=Math.abs(projection[0])*imageWidth/2,fy=Math.abs(projection[5])*imageHeight/2;
  const cx=(1-projection[8])*imageWidth/2,cy=(1+projection[9])*imageHeight/2;
  if(!vertices||vertices.length!==4||!vertices.every(v=>v&&v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))||!fx||!fy)return null;
  const h=width/2,local=[[-h,-h],[-h,h],[h,h],[h,-h]],rows:number[][]=[];
  for(let i=0;i<4;i++) {
    const point=vertices[(i+4-(direction||0))%4],X=local[i][0],Y=local[i][1];
    const u=(point[0]-cx)/fx,v=(point[1]-cy)/fy;
    rows.push([X,Y,1,0,0,0,-u*X,-u*Y,u],[0,0,0,X,Y,1,-v*X,-v*Y,v]);
  }
  for(let c=0;c<8;c++) {
    let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
    if(Math.abs(rows[pivot][c])<1e-10)return null;
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];const divisor=rows[c][c];
    for(let j=c;j<9;j++)rows[c][j]/=divisor;
    for(let r=0;r<8;r++)if(r!==c){const factor=rows[r][c];for(let j=c;j<9;j++)rows[r][j]-=factor*rows[c][j];}
  }
  const H=rows.map(r=>r[8]);let a=[H[0],H[3],H[6]],b=[H[1],H[4],H[7]],t=[H[2],H[5],1];
  const dot=(a:number[],b:number[])=>a.reduce((n,v,i)=>n+v*b[i],0);
  const length=(a:number[])=>Math.sqrt(dot(a,a));const norm=(a:number[])=>{const n=length(a);return a.map(v=>v/n);};
  const factor=2/(length(a)+length(b));t=t.map(v=>v*factor);a=norm(a);
  const ab=dot(a,b);b=norm(b.map((v,i)=>v-ab*a[i]));const z=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const raw=Float64Array.from([a[0],b[0],z[0],t[0],a[1],b[1],z[1],t[1],a[2],b[2],z[2],t[2]]);
  return Array.from(raw).every(Number.isFinite)&&raw[11]>0?raw:null;
}
export function validMarkerPose(raw:ArrayLike<number>) {
  if(!raw||raw.length!==12||!Array.from(raw).every(Number.isFinite)||raw[11]<=0)return false;
  const det=raw[0]*(raw[5]*raw[10]-raw[6]*raw[9])-raw[1]*(raw[4]*raw[10]-raw[6]*raw[8])+raw[2]*(raw[4]*raw[9]-raw[5]*raw[8]);
  return det>.5&&det<1.5;
}
// Explicit row-major 3x4 CV pose -> column-major 4x4. Avoid getMarker event axis ambiguity.
export function markerPoseMatrix(raw:ArrayLike<number>) {
  return Float64Array.from([raw[0],raw[4],raw[8],0,raw[1],raw[5],raw[9],0,raw[2],raw[6],raw[10],0,raw[3],raw[7],raw[11],1]);
}
export function markerClipPosition(projection:ArrayLike<number>, cameraWorld:ArrayLike<number>, point:any, pc:any) {
  const view=new pc.Mat4();view.data.set(cameraWorld);view.invert();
  const p=[point.x,point.y,point.z,1];const v=[0,0,0,0],clip=[0,0,0,0];
  for(let r=0;r<4;r++)for(let k=0;k<4;k++)v[r]+=view.data[k*4+r]*p[k];
  for(let r=0;r<4;r++)for(let k=0;k<4;k++)clip[r]+=projection[k*4+r]*v[k];
  return {x:clip[0]/clip[3],y:clip[1]/clip[3],z:clip[2]/clip[3],w:clip[3]};
}
// 0.31.0: local marker camera. Shared entities/transforms are never reparented.
export function markerCameraMatrix(pc:any, raw:ArrayLike<number>, origin:any, scale:number) {
  // ARToolKit camera axes: +X right, +Y down, +Z forward.
  const pose=new pc.Mat4();pose.data.set(raw);
  const flip=new pc.Mat4().setFromEulerAngles(180,0,0);
  const ground=new pc.Mat4().setFromEulerAngles(90,0,0);
  const modelView=new pc.Mat4().mul2(flip,pose);modelView.mul(ground);
  const camera=new pc.Mat4().copy(modelView).invert();
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
  #arMarkerPanel button,#arMarkerPanel input,#arMarkerPanel select{margin:6px 3px;min-height:36px}#arMarkerPanel button{background:#000;color:white;border:1px solid white;border-radius:5px;padding:6px 10px}#arMarkerHUD{position:fixed;left:8px;right:8px;top:8px;z-index:10052;background:#000b;color:#fff;font:12px monospace;padding:6px;pointer-events:none}#arMarkerPanel a{color:#8eeaff}#arMarkerPanel input[type=number]{width:80px}#arMarkerPanel label{display:block}
  body.marker-ar-active *{visibility:hidden!important}body.marker-ar-active #application-canvas,body.marker-ar-active #arMarkerVideo,body.marker-ar-active #arMarkerBackdrop,body.marker-ar-active #arMarkerPanel,body.marker-ar-active #arMarkerPanel *,body.marker-ar-active #arMarkerLauncher,body.marker-ar-active #arMarkerHUD,body.marker-ar-active #arGeometryOverlay,body.marker-ar-active #arGeometryOverlay *{visibility:visible!important}
  body.marker-ar-active #application-canvas{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;z-index:1!important;pointer-events:none!important}
  #arGeometryOverlay{position:fixed;inset:0;z-index:10049;pointer-events:none}#arGeometryOverlay svg{width:100%;height:100%;overflow:visible}#arMarkerBackdrop{position:fixed;inset:0;background:#000;z-index:0}#arMarkerVideo{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;transform:none}
  body.marker-ar-active{overflow:hidden!important}
  `;document.head.appendChild(css);
  const launch=document.createElement('button');launch.id='arMarkerLauncher';launch.textContent='AR · MARKER';document.body.appendChild(launch);
  const panel=document.createElement('div');panel.id='arMarkerPanel';panel.hidden=true;
  panel.innerHTML=`<strong>MARKER AR · 0.31.0.10</strong><button data-ar="close">閉じる</button><p>選択したマーカーを平らな机に置き、黒枠全体を映してください。</p><label>検証マーカー <select data-ar="marker"><option value="hiro">HIRO（従来）</option><option value="blocks">BLOCKS 01（比較用）</option></select></label><a target="_blank" rel="noopener" href="${new URL('ar/marker-print.html',base).href}">HIRO マーカーを開く / 印刷</a><br><a target="_blank" rel="noopener" href="${new URL('ar/marker-blocks-print.html',base).href}">BLOCKS 01 を開く / 印刷</a><label>黒枠の一辺 (mm) <input data-ar="size" type="number" min="30" max="1000" value="100"></label><label>表示倍率 <input data-ar="scale" type="range" min="0.005" max="0.2" step="0.005" value="0.02"><output data-ar="scale-text">2%</output></label><label>認識切れの表示保持 <select data-ar="hold"><option value="0.5">0.5秒</option><option value="1.5" selected>1.5秒</option><option value="3">3秒</option></select></label><button data-ar="origin">選択作品を中心に</button><button data-ar="room">ROOM原点</button><label><input data-ar="test" type="checkbox" checked>認識確認用キューブ</label><label><input data-ar="geometry" type="checkbox" checked>幾何確認（緑:検出／橙:計算／赤:3D）</label><label><input data-ar="refine" type="checkbox" checked>四隅に合わせて姿勢を最適化</label><label><input data-ar="smooth" type="checkbox">姿勢の揺れ補正（比較用）</label><button data-ar="start">START AR</button><button data-ar="stop" disabled>STOP AR</button><p data-ar="status" role="status">ROOMへ入室してから開始してください。</p>`;
  document.body.appendChild(panel);
  const hud=document.createElement('div');hud.id='arMarkerHUD';hud.hidden=true;document.body.appendChild(hud);
  const overlay=document.createElement('div');overlay.id='arGeometryOverlay';overlay.hidden=true;document.body.appendChild(overlay);
  const q=(name:string)=>panel.querySelector(`[data-ar="${name}"]`) as any;
  q('smooth').checked=false;q('refine').checked=true;
  const video=document.createElement('video');video.id='arMarkerVideo';video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.hidden=true;
  const backdrop=document.createElement('div');backdrop.id='arMarkerBackdrop';backdrop.hidden=true;document.body.append(backdrop,video);
  const layer=new pc.Layer({name:'Marker AR artworks'});app.scene.layers.push(layer);
  const cube=new pc.Entity('AR tracking check');cube.addComponent('render',{type:'box',layers:[layer.id]});const mat=new pc.StandardMaterial();mat.diffuse=new pc.Color(0,.7,1);mat.emissive=new pc.Color(0,.35,.5);mat.useLighting=false;mat.update();cube.render.material=mat;cube.enabled=false;app.root.addChild(cube);
  let active=false,pending=false,generation=0,room:any=null,stream:MediaStream|null=null,controller:any=null,saved:any=null;
  let origin={x:0,y:0,z:0},pose:any=null,projection:any=null,lastSeen=0,lastFrame=-1,detected=false;
  let corners:number[][]|null=null,cornerDirection=0,cornerSeen=0,rejection="SEARCHING";
  let fitBefore=NaN,fitAfter=NaN;
  let markerId=-1,markerWidth=.1,poseSource="",markerFound=false;
  const poseFilter=createMarkerPoseFilter();
  // Real 3D outline: the renderer draws this independently of the SVG projection.
  const redMaterial=new pc.StandardMaterial();redMaterial.diffuse=new pc.Color(1,0,0);redMaterial.emissive=new pc.Color(1,0,0);redMaterial.useLighting=false;redMaterial.update();
  const edgeMaterial=new pc.StandardMaterial();edgeMaterial.diffuse=new pc.Color(1,1,0);edgeMaterial.emissive=new pc.Color(1,1,0);edgeMaterial.useLighting=false;edgeMaterial.update();
  const makeBar=(name:string,material:any)=>{const e=new pc.Entity(name);e.addComponent('render',{type:'box',layers:[layer.id]});e.render.material=material;e.enabled=false;app.root.addChild(e);return e;};
  const markerEdges=Array.from({length:4},()=>makeBar('AR marker border',redMaterial));
  const cubeEdges=Array.from({length:12},()=>makeBar('AR cube edge',edgeMaterial));
  let meshes:any[]=[];const worldCamera=new pc.Mat4();
  const status=(s:string)=>{q('status').textContent=s;hud.textContent=s;};
  const holdMS=()=>Math.max(500,Math.min(3000,(Number(q('hold').value)||1.5)*1000));
  const scale=()=>Math.max(.005,Math.min(.2,Number(q('scale').value)||.02));
  const controls=()=>{launch.hidden=!ctx.getRoom()||!ctx.available();q('start').disabled=active||pending||!ctx.getRoom()||!ctx.available();q('stop').disabled=!active&&!pending;q('size').disabled=active||pending;q('marker').disabled=active||pending;};
  function stop(message='ARを停止しました。通常のROOM表示に戻りました。') {
    generation++;active=false;pending=false;room=null;hud.hidden=true;overlay.hidden=true;overlay.innerHTML="";corners=null;cornerSeen=0;rejection="SEARCHING";fitBefore=NaN;fitAfter=NaN;markerEdges.forEach(e=>e.enabled=false);cubeEdges.forEach(e=>e.enabled=false);
    stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;video.hidden=true;backdrop.hidden=true;
    poseFilter.reset();controller?.dispose();controller=null;pose=null;projection=null;lastSeen=0;lastFrame=-1;detected=false;
    layer.removeMeshInstances(meshes);meshes=[];cube.enabled=false;
    if(saved){const c=camera.camera;c.calculateTransform=saved.transform;c.calculateProjection=saved.projection;c.layers=saved.layers;c.rect.copy(saved.rect);c.clearColor.copy(saved.color);c.nearClip=saved.near;c.farClip=saved.far;c.frustumCulling=saved.culling;camera.setPosition(saved.position);camera.setRotation(saved.rotation);saved=null;ctx.finish();}
    document.body.classList.remove('marker-ar-active');status(message);controls();
  }
  const current=(token:number)=>generation===token&&pending&&room===ctx.getRoom()&&ctx.available();
  async function start(){
    if(active||pending||!ctx.getRoom()||!ctx.available())return;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status('HTTPSのSafariで開き、カメラを許可してください。');return;}
    const markerName=q('marker').value==='blocks'?'BLOCKS 01':'HIRO';
    const markerFile=q('marker').value==='blocks'?'patt.shared-blocks':'patt.hiro';
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
      const id=await controller.loadMarker(new URL(`ar/data/${markerFile}`,base).href);if(!current(token))return;
      controller.trackPatternMarkerId(id,widthMM/1000);
      projection=new pc.Mat4();projection.data.set(controller.getCameraMatrix());
      markerId=id;markerWidth=widthMM/1000;
      const c=camera.camera;saved={transform:c.calculateTransform,projection:c.calculateProjection,layers:[...c.layers],rect:c.rect.clone(),color:c.clearColor.clone(),near:c.nearClip,far:c.farClip,culling:c.frustumCulling,position:camera.getPosition().clone(),rotation:camera.getRotation().clone()};
      c.layers=[layer.id];c.nearClip=.005;c.farClip=100;c.frustumCulling=false;c.clearColor=new pc.Color(0,0,0,0);
      c.calculateProjection=(out:any)=>out.copy(projection);c.calculateTransform=(out:any)=>out.copy(worldCamera);
      app.resizeCanvas?.();active=true;pending=false;hud.hidden=false;panel.hidden=true;document.body.classList.add('marker-ar-active');status(`SEARCHING · ${markerName}の黒枠全体を映してください。`);controls();
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(generation===token)stop('カメラが停止しました。START ARで再開してください。');});
    }catch(error){if(generation!==token)return;stop(`AR開始失敗 · ${error instanceof Error?error.message:String(error)}（Safariのカメラ許可も確認してください）`);}
  }
  function update(){
    if((active||pending)&&(room!==ctx.getRoom()||!ctx.available())){stop();return;}controls();if(!active)return;
    if(video.videoWidth/video.videoHeight<=0)return;
    const canvasRect=canvas.getBoundingClientRect?.()??{left:0,top:0,width:innerWidth,height:innerHeight};
    const videoRect=video.getBoundingClientRect?.()??{left:0,top:0,width:innerWidth,height:innerHeight};
    const aspect=video.videoWidth/video.videoHeight,screen=canvasRect.width/canvasRect.height;
    if(!Number.isFinite(screen)||screen<=0)return;
    // Match the video object-fit:cover crop, including off-centre calibration.
    const engineProjection=controller.getCameraMatrix();
    const calibrated=markerSquarePixelProjection(engineProjection,controller.width,controller.height);projection.data.set(calibrated);
    const sx=Math.max(1,aspect/screen),sy=Math.max(1,screen/aspect);
    for(const i of [0,4,8,12])projection.data[i]*=sx;
    for(const i of [1,5,9,13])projection.data[i]*=sy;
    camera.camera.rect.set(0,0,1,1);
    try{if(video.readyState>=2&&video.currentTime!==lastFrame){lastFrame=video.currentTime;markerFound=false;rejection="NO MARKER";const result=controller.detectMarker(video);
        if(result!==0)throw new Error(`detectMarker: ${result}`);
        for(let i=0;i<controller.getMarkerNum();i++) {
          const marker=controller.getMarker(i);if(marker.idPatt!==markerId)continue;if(marker.cfPatt<.5){rejection="LOW CONFIDENCE";continue;}
          // Match the pattern direction before solving the square's pose.
          if(marker.dirPatt!==undefined)controller.setMarkerInfoDir(i,marker.dirPatt);
          markerFound=true;
          corners=marker.vertex?.map((v:any)=>[v[0],v[1]])??null;cornerDirection=marker.dirPatt||0;cornerSeen=performance.now();
          // Prefer one consistent solver while corners are usable. Validate native fallback.
          let raw=markerPoseFromCorners(marker.vertex?.map((v:any)=>[v[0],v[1]]),marker.dirPatt,markerWidth,calibrated,controller.width,controller.height);
          let source="CORNERS";
          if(!raw||!validMarkerPose(raw)) {
            const changed=Math.abs(calibrated[5]-engineProjection[5])>1e-8;
            if(changed){rejection="POSE FAILED";continue;}
            raw=new Float64Array(12);controller.getTransMatSquare(i,markerWidth,raw);source="NATIVE";
            if(!validMarkerPose(raw)){rejection="POSE FAILED";continue;}
          }
          const refinement=refineMarkerPose(raw,corners!,cornerDirection,markerWidth,calibrated,controller.width,controller.height);
          fitBefore=refinement.before;fitAfter=q('refine').checked?refinement.after:refinement.before;
          if(q('refine').checked)raw=refinement.pose;
          const now=performance.now(),filtered=poseFilter.sample(markerPoseMatrix(raw),now);
          if(!filtered&&q('smooth').checked){rejection="OUTLIER";continue;}poseSource=source;pose=q('smooth').checked?filtered:markerPoseMatrix(raw);rejection="OK";lastSeen=now;detected=true;break;
        }}}
    catch(error){stop(`追跡エラー · ${error instanceof Error?error.message:String(error)}`);return;}
    const visible=!!pose&&performance.now()-lastSeen<holdMS();
    layer.removeMeshInstances(meshes);meshes=[];
    if(visible){worldCamera.copy(markerCameraMatrix(pc,pose,origin,scale()));camera.setPosition(worldCamera.getTranslation());
      for(const item of ctx.getItems()){const entity=item.entity;if(!entity?.enabledInHierarchy)continue;
        for(const component of [...entity.findComponents('render'),...entity.findComponents('model')]){if(!component.enabled||!component.entity.enabledInHierarchy)continue;meshes.push(...(component.meshInstances??component.model?.meshInstances??[]));}}
      layer.addMeshInstances(meshes);
    }
    cube.enabled=visible&&q('test').checked;cube.setPosition(origin.x,origin.y+.015/scale(),origin.z);cube.setLocalScale(.03/scale(),.03/scale(),.03/scale());
    const clip=visible?markerClipPosition(projection.data,worldCamera.data,{x:origin.x,y:origin.y+.015/scale(),z:origin.z},pc):null;
    const diagnostic=visible&&q('geometry').checked;
    const unit=1/scale(),h=markerWidth*unit/2,thin=.0007*unit;
    markerEdges.forEach((e,i)=>{e.enabled=diagnostic;const axis=i<2?0:2,sign=i%2?1:-1;
      e.setPosition(origin.x+(axis===2?sign*h:0),origin.y+.0003*unit,origin.z+(axis===0?sign*h:0));
      e.setLocalScale(axis===0?2*h:thin,thin,axis===2?2*h:thin);});
    let edge=0;const half=.015*unit;
    for(let axis=0;axis<3;axis++)for(const signA of [-1,1])for(const signB of [-1,1]){
      const position=[origin.x,origin.y+half,origin.z],size=[thin,thin,thin];size[axis]=2*half;
      const others=[0,1,2].filter(i=>i!==axis);position[others[0]]+=signA*half;position[others[1]]+=signB*half;
      const e=cubeEdges[edge++];e.enabled=visible&&q('test').checked;e.setPosition(...position);e.setLocalScale(...size);
    }
    overlay.hidden=!active||!q('geometry').checked;
    let reprojection="--";
    if(!overlay.hidden&&corners&&performance.now()-cornerSeen<120){
      const cover=Math.max(videoRect.width/controller.width,videoRect.height/controller.height);
      const left=videoRect.left+(videoRect.width-controller.width*cover)/2,top=videoRect.top+(videoRect.height-controller.height*cover)/2;
      const detectedPixels=corners.map(v=>[left+v[0]*cover,top+v[1]*cover]);
      const local=[[-h,-h],[-h,h],[h,h],[h,-h]];
      const projected=visible?local.map(([X,Y])=>{const c=markerClipPosition(projection.data,worldCamera.data,{x:origin.x+X,y:origin.y,z:origin.z-Y},pc);return [canvasRect.left+(c.x+1)*canvasRect.width/2,canvasRect.top+(1-c.y)*canvasRect.height/2];}):[];
      if(projected.length)reprojection=(Math.sqrt(projected.reduce((sum,v,i)=>{const d=detectedPixels[(i+4-cornerDirection)%4];return sum+(v[0]-d[0])**2+(v[1]-d[1])**2;},0)/4)).toFixed(1);
      const points=(a:number[][])=>a.map(v=>v.join(',')).join(' ');
      overlay.innerHTML=`<svg viewBox="0 0 ${innerWidth} ${innerHeight}" preserveAspectRatio="none"><polygon points="${points(detectedPixels)}" fill="none" stroke="#00ff75" stroke-width="3"/>${projected.length?`<polygon points="${points(projected)}" fill="none" stroke="#ff9d00" stroke-width="2"/>`:''}</svg>`;
    }else overlay.innerHTML='';
    const detail=q('geometry').checked?` · ${q('smooth').checked?'SMOOTH':'RAW'} · FIT ${Number.isFinite(fitBefore)?fitBefore.toFixed(1):'--'}→${Number.isFinite(fitAfter)?fitAfter.toFixed(1):'--'} DETpx · ${q('refine').checked?'REFINE':'BASE'} · FX/FY ${(Math.abs(calibrated[0])*controller.width/2).toFixed(0)}/${(Math.abs(calibrated[5])*controller.height/2).toFixed(0)} · ${rejection} · ERR ${reprojection}px · VIDEO ${video.videoWidth}x${video.videoHeight} · DET ${controller.width}x${controller.height} · CSS ${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)} · BUF ${canvas.width??'?'}x${canvas.height??'?'}`:'';
    status(visible?`${performance.now()-lastSeen>120?"HOLD":"TRACKING"} · ${Math.round(scale()*1000)/10}% · 原点 ${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}, ${origin.z.toFixed(1)} · ${poseSource} · CUBE ${clip!.w>0?"FRONT":"BEHIND"} ${clip!.x.toFixed(2)},${clip!.y.toFixed(2)} · MESH ${meshes.length}`:markerFound?'MARKER FOUND · 姿勢を計算できません。黒枠を正面から映してください。':detected?'MARKER LOST · 黒枠全体を映してください。':'SEARCHING · 選択したマーカーの黒枠全体を映してください。');if(detail)status(hud.textContent+detail);
  }
  launch.onclick=()=>panel.hidden=!panel.hidden;q('close').onclick=()=>panel.hidden=true;q('start').onclick=()=>void start();q('stop').onclick=()=>stop();
  q('scale').oninput=()=>q('scale-text').textContent=`${Math.round(scale()*1000)/10}%`;
  q('origin').onclick=()=>{const entity=ctx.getSelected();if(!entity){status('作品を選択してから押してください。');return;}const p=entity.getPosition();origin={x:p.x,y:p.y,z:p.z};status('選択作品の現在位置をAR原点にしました。');};
  q('room').onclick=()=>{origin={x:0,y:0,z:0};status('ROOM原点に戻しました。');};
  for(const name of ['pointerdown','pointermove','pointerup','wheel','keydown'])panel.addEventListener(name,e=>e.stopPropagation());
  const hidden=()=>{if(document.hidden&&(active||pending))stop('バックグラウンド移行でARを停止しました。START ARで再開してください。');};
  const pagehide=()=>stop();document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);app.on('update',update);controls();
  return {isBusy:()=>active||pending,stop,dispose(){stop();app.off('update',update);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);cube.destroy();mat.destroy();markerEdges.forEach(e=>e.destroy());cubeEdges.forEach(e=>e.destroy());redMaterial.destroy();edgeMaterial.destroy();overlay.remove();app.scene.layers.remove(layer);css.remove();launch.remove();panel.remove();video.remove();backdrop.remove();hud.remove();}};
}
