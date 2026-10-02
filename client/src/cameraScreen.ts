type Context={pc:any;app:any;id:string;media:any;poster:HTMLImageElement;aspect:number;getVideo:()=>HTMLVideoElement|HTMLCanvasElement|null;getDisplay:()=>{mirror:boolean;fit:string}};
export function isCameraScreenManifest(meta:any){
  return meta?.cameraScreen?.version===1&&typeof meta.cameraScreen.aspectRatio==="number"&&Number.isFinite(meta.cameraScreen.aspectRatio)&&meta.cameraScreen.aspectRatio>=.25&&meta.cameraScreen.aspectRatio<=4;
}
export function isBrowserScreenManifest(meta:any){
  return meta?.browserScreen?.version===1&&typeof meta.browserScreen.aspectRatio==="number"&&Number.isFinite(meta.browserScreen.aspectRatio)&&meta.browserScreen.aspectRatio>=.25&&meta.browserScreen.aspectRatio<=4;
}
export function createCameraScreenRuntime(ctx:Context){
  const {pc,app}=ctx,aspect=ctx.aspect;
  if(!Number.isFinite(aspect)||aspect<.25||aspect>4)throw new Error("Invalid camera screen aspect ratio");
  const canvas=document.createElement("canvas");canvas.width=1280;canvas.height=Math.round(1280/aspect);
  const draw=canvas.getContext("2d",{alpha:false});if(!draw)throw new Error("Camera screen canvas unavailable");
  const texture=new pc.Texture(app.graphicsDevice,{format:pc.PIXELFORMAT_RGBA8,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE,mipmaps:false});
  const material=new pc.StandardMaterial();material.useLighting=false;material.emissive=new pc.Color(1,1,1);material.diffuse=new pc.Color(0,0,0);material.emissiveMap=texture;
  material.opacity=1;material.blendType=pc.BLEND_NORMAL;material.depthWrite=true;material.alphaTest=0;material.cull=pc.CULLFACE_NONE;material.update();
  const entity=new pc.Entity(`CameraScreen_${ctx.id}`),surface=new pc.Entity(`CameraScreenSurface_${ctx.id}`);
  entity.tags.add("camera-screen");
  surface.addComponent("render",{type:"plane"});surface.render.material=material;surface.render.castShadows=false;
  surface.setLocalScale(1,1,1/aspect);surface.setEulerAngles(90,0,0);entity.addChild(surface);
  const m=ctx.media,scale=Number(m.scale)||1;
  entity.setPosition(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);entity.setEulerAngles(Number(m.rotationX)||0,Number(m.rotationY)||0,Number(m.rotationZ)||0);entity.setLocalScale(scale,scale,scale);app.root.addChild(entity);
  let playing=true,disposed=false,lastVideo:HTMLVideoElement|HTMLCanvasElement|null=null,lastTime=-1,lastDisplay="",elapsed=0,hasLiveFrame=false;
  function poster(){draw!.setTransform(1,0,0,1,0,0);draw!.fillStyle="#102535";draw!.fillRect(0,0,canvas.width,canvas.height);draw!.drawImage(ctx.poster,0,0,canvas.width,canvas.height);texture.setSource(canvas);texture.upload();hasLiveFrame=false;}
  poster();
  function update(dt:number){
    if(disposed)return;
    const video=ctx.getVideo();
    if(!video){if(hasLiveFrame)poster();lastVideo=null;lastTime=-1;return;}
    const source=video as any,sourceWidth=Number(source.videoWidth??source.width),sourceHeight=Number(source.videoHeight??source.height),sourceTime=Number(source.currentTime??source.__screenFrame??0);
    if(!playing||(source.readyState??2)<2||!sourceWidth||!sourceHeight)return;
    const display=ctx.getDisplay(),signature=`${display.mirror}:${display.fit}`;
    elapsed+=dt;if(video===lastVideo&&signature===lastDisplay&&elapsed<1/30)return;
    if(video===lastVideo&&sourceTime===lastTime&&signature===lastDisplay)return;
    elapsed=0;
    try{
      const ratio=display.fit==="cover"?Math.max(canvas.width/sourceWidth,canvas.height/sourceHeight):Math.min(canvas.width/sourceWidth,canvas.height/sourceHeight);
      const width=sourceWidth*ratio,height=sourceHeight*ratio;
      draw.setTransform(1,0,0,1,0,0);draw.fillStyle="#000";draw.fillRect(0,0,canvas.width,canvas.height);
      draw.save();if(display.mirror){draw.translate(canvas.width,0);draw.scale(-1,1);}
      try{draw.drawImage(video,(canvas.width-width)/2,(canvas.height-height)/2,width,height);}finally{draw.restore();}
      texture.upload();hasLiveFrame=true;lastVideo=video;lastTime=sourceTime;lastDisplay=signature;
    }catch{draw.setTransform(1,0,0,1,0,0);if(hasLiveFrame)poster();lastVideo=null;}
  }
  return {entity,update,playback:{play(){playing=true;lastTime=-1;},stop(){playing=false;},isPlaying:()=>playing,setLoop(){}},dispose(){if(disposed)return;disposed=true;texture.destroy();material.destroy();}};
}
