type Context={app:any;pc:any;camera:any;active:()=>boolean;getRoom:()=>any;overlayLayer:number;host:HTMLElement;getSelfRoot?:()=>any};
/** Single-camera offscreen capture; never reads the XR swapchain or replaces the tracked camera. */
export function createQuestVRPhoto(ctx:Context){
  const {app,pc,camera}=ctx;let busy=false,generation=0,disposed=false,lastCanvas:HTMLCanvasElement|null=null,status="",cancelFrame:(()=>void)|null=null;
  const photos:{url:string;name:string;node:HTMLElement}[]=[];
  const gallery=document.createElement("section");gallery.innerHTML='<strong>VR PHOTOS</strong><p>撮影したPNGはVR終了後、各SAVE PNGから保存できます。最新4枚をこのページを閉じるまで保持します。</p>';ctx.host.appendChild(gallery);
  function check(room:any,epoch:number){if(disposed||epoch!==generation||!ctx.active()||ctx.getRoom()!==room)throw new Error("CAPTURE CANCELLED");}
  function frame(){return new Promise<void>((resolve,reject)=>{
    const done=()=>{clearTimeout(timer);app.off("frameend",done);cancelFrame=null;resolve();};
    const cancel=()=>{clearTimeout(timer);app.off("frameend",done);cancelFrame=null;reject(new Error("CAPTURE CANCELLED"));};
    const timer=setTimeout(()=>{cancel();},5000);cancelFrame=cancel;app.on("frameend",done);app.renderNextFrame=true;
  });}
  async function capture(seconds:number,mode="view"){
    if(busy||disposed||!ctx.active()||!ctx.getRoom())return false;busy=true;
    const room=ctx.getRoom(),epoch=++generation;let photoCamera:any=null,texture:any=null,target:any=null,selfClone:any=null,selfLayer:any=null;
    try{
      const timer=[0,3,10].includes(seconds)?seconds:0;
      for(let left=timer;left>0;left--){check(room,epoch);status="PHOTO IN "+left;await new Promise(resolve=>setTimeout(resolve,1000));}
      check(room,epoch);status="CAPTURING…";
      const width=1280,height=720;texture=new pc.Texture(app.graphicsDevice,{width,height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false});
      if(typeof texture.read!=="function")throw new Error("Texture.readが必要です。PlayCanvasのバージョンを確認してください。");
      target=new pc.RenderTarget({colorBuffer:texture,depth:true,samples:1});photoCamera=new pc.Entity("VR Photo Camera");
      photoCamera.addComponent("camera",{renderTarget:target,priority:-100,fov:65,aspectRatio:width/height,aspectRatioMode:pc.ASPECT_MANUAL,
        nearClip:camera.camera.nearClip,farClip:camera.camera.farClip,clearColor:camera.camera.clearColor.clone(),clearColorBuffer:true,clearDepthBuffer:true,
        layers:camera.camera.layers.filter((id:number)=>id!==ctx.overlayLayer)});
      photoCamera.setPosition(camera.getPosition().clone());photoCamera.setRotation(camera.getRotation().clone());app.root.addChild(photoCamera);
      if(mode==="selfie"){
        const self=ctx.getSelfRoot?.();if(!self)throw new Error("SELFIE: NO AVATAR");
        selfLayer=new pc.Layer({name:"VR Selfie Only"});app.scene.layers.push(selfLayer);selfClone=self.clone();selfClone.name="VR Selfie Avatar";selfClone.enabled=true;
        selfClone.findComponents("render").forEach((r:any)=>{r.enabled=true;r.layers=[selfLayer.id];});selfClone.findComponents("light").forEach((l:any)=>l.enabled=false);
        selfClone.setPosition(self.getPosition().clone());selfClone.setRotation(self.getRotation().clone());app.root.addChild(selfClone);photoCamera.camera.layers=[...photoCamera.camera.layers,selfLayer.id];
        const head=camera.getPosition().clone(),forward=camera.forward.clone();forward.y=0;if(forward.length()<.001)forward.set(0,0,-1);forward.normalize();photoCamera.setPosition(head.clone().add(forward.mulScalar(2.8)).add(new pc.Vec3(0,.15,0)));
        const body=self.getPosition();photoCamera.lookAt(body.x,body.y+.55,body.z);
      }
      await frame();check(room,epoch);photoCamera.enabled=false;
      let timeout:any;const pixels:any=await Promise.race([texture.read(0,0,width,height,{renderTarget:target,immediate:true}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error("PHOTO READ TIMEOUT")),10000);})]).finally(()=>clearTimeout(timeout));
      check(room,epoch);if(!pixels||pixels.length!==width*height*4)throw new Error("INVALID PHOTO PIXELS");
      const result=document.createElement("canvas");result.width=width;result.height=height;const context=result.getContext("2d")!;const image=context.createImageData(width,height);
      const stride=width*4,flip=!app.graphicsDevice.isWebGPU;
      for(let y=0;y<height;y++){const from=(flip?height-1-y:y)*stride;image.data.set(pixels.subarray(from,from+stride),y*stride);}context.putImageData(image,0,0);
      const blob=await new Promise<Blob>((resolve,reject)=>result.toBlob(b=>b?resolve(b):reject(new Error("PNG ENCODE FAILED")),"image/png"));check(room,epoch);
      const name="shared-world-vr-"+new Date().toISOString().replace(/[:.]/g,"-")+".png",url=URL.createObjectURL(blob);
      const node=document.createElement("div"),img=document.createElement("img"),save=document.createElement("a");img.src=url;img.alt=name;img.style.cssText="display:block;max-width:100%;width:320px;margin:8px 0";save.href=url;save.download=name;save.textContent="SAVE PNG · "+name;node.append(img,save);gallery.appendChild(node);
      photos.push({url,name,node});while(photos.length>4){const old=photos.shift()!;URL.revokeObjectURL(old.url);old.node.remove();}lastCanvas=result;status="PHOTO READY · SAVE AFTER EXIT VR";return true;
    }catch(error:any){status=String(error?.message??error);return false;}
    finally{selfClone?.destroy();if(selfLayer)app.scene.layers.remove(selfLayer);photoCamera?.destroy();target?.destroy();texture?.destroy();busy=false;}
  }
  function cancel(){generation++;cancelFrame?.();}
  const ended=()=>cancel();app.xr?.on("end",ended);
  return {capture,isBusy:()=>busy,getStatus:()=>status,getPreview:()=>lastCanvas,cancel,dispose:()=>{disposed=true;cancel();app.xr?.off("end",ended);for(const p of photos)URL.revokeObjectURL(p.url);photos.length=0;lastCanvas=null;gallery.remove();}};
}
