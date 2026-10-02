type Context={app:any;pc:any;camera:any;getRig:()=>any;getRoom:()=>any;getItems:()=>any[];canTeleport:(x:number,z:number)=>boolean;onTeleport:(x:number,z:number)=>void};
/** Quest xr-standard controllers; all transforms operate on the XR origin. */
export function createQuestVRInteraction(ctx:Context){
  const {app,pc,camera}=ctx;
  let room:any=null,unsubscribe:any=null,marker:any=null,hud:any=null,texture:any=null,material:any=null,hudMaterial:any=null,canvas:any=null;
  let left:any=null,right:any=null,aiming=false,turnArmed=false,buttons:boolean[]=[],selected:any=null,pending:any=null,serial=0,message="",lastLabel="";
  const green=new pc.Color(.1,1,.35),blue=new pc.Color(.25,.65,1);
  function clean(){unsubscribe?.();unsubscribe=null;room=null;marker?.destroy();hud?.destroy();texture?.destroy();material?.destroy();hudMaterial?.destroy();marker=hud=texture=material=hudMaterial=canvas=null;left=right=null;aiming=false;turnArmed=false;buttons=[];selected=null;pending=null;lastLabel="";}
  function setup(next:any){room=next;
    marker=new pc.Entity("VR teleport target");marker.addComponent("render",{type:"sphere"});marker.setLocalScale(.22,.025,.22);material=new pc.StandardMaterial();material.diffuse=green;material.emissive=green;material.update();marker.render.meshInstances.forEach((m:any)=>m.material=material);app.root.addChild(marker);marker.enabled=false;
    canvas=document.createElement("canvas");canvas.width=1024;canvas.height=256;texture=new pc.Texture(app.graphicsDevice,{width:1024,height:256,mipmaps:false});texture.setSource(canvas);
    hudMaterial=new pc.StandardMaterial();hudMaterial.useLighting=false;hudMaterial.emissive=new pc.Color(1,1,1);hudMaterial.emissiveMap=texture;hudMaterial.cull=pc.CULLFACE_NONE;hudMaterial.depthWrite=false;hudMaterial.depthTest=false;hudMaterial.update();
    hud=new pc.Entity("VR controls");hud.addComponent("render",{type:"plane"});hud.render.meshInstances.forEach((m:any)=>m.material=hudMaterial);camera.addChild(hud);hud.setLocalPosition(0,-.28,-1);hud.setLocalEulerAngles(90,0,0);hud.setLocalScale(.9,1,.225);
    message="READY";
    unsubscribe=room.onMessage("vr:teleport:result",(result:any)=>{
      if(!pending||result?.requestId!==pending.id)return;
      const rig=ctx.getRig();const current=pending;pending=null;
      if(!rig||room!==current.room)return;
      if(!result.ok){message=result.reason||"TELEPORT REJECTED";return;}
      if(![result.x,result.y,result.z].every(Number.isFinite)||Math.abs(result.y-.65)>.001){message="INVALID RESPONSE";return;}
      const head=camera.getPosition(),origin=rig.getPosition();rig.setPosition(result.x-(head.x-origin.x),0,result.z-(head.z-origin.z));ctx.onTeleport(result.x,result.z);message="TELEPORTED";
    });
  }
  function target(source:any){
    if(!source)return null;const o=source.getOrigin(),d=source.getDirection();if(d.y>=-.05)return null;
    const t=-o.y/d.y;if(t<=0||t>12)return null;const x=o.x+d.x*t,z=o.z+d.z*t;
    if(!ctx.canTeleport(x,z))return null;return new pc.Vec3(x,0,z);
  }
  function pick(source:any){
    const origin=source.getOrigin().clone(),direction=source.getDirection().clone().normalize(),ray=new pc.Ray(origin,direction);let hit:any=null,best=12;
    for(const item of ctx.getItems()){
      if(!item.entity?.enabled)continue;
      for(const render of item.entity.findComponents("render")){if(!render.enabled)continue;for(const mesh of render.meshInstances??[]){if(mesh.visible===false)continue;const point=new pc.Vec3();if(mesh.aabb.intersectsRay(ray,point)){const distance=point.clone().sub(origin).length();if(distance<best){hit=item;best=distance;}}}}
    }
    app.drawLine(origin,origin.clone().add(direction.mulScalar(best)),blue,true);return hit;
  }
  function action(item:any,kind:string){if(!item)return;selected=item;room.send("media:action",{id:item.id,action:kind,source:"quest-controller"});message=kind==="timeline"?"DO REQUESTED":kind.toUpperCase()+" REQUESTED";}
  function update(){
    const rig=ctx.getRig(),next=ctx.getRoom();if(!rig||!next){if(room)clean();return;}if(room!==next){clean();setup(next);}
    if(pending&&performance.now()-pending.at>3000){pending=null;message="TELEPORT TIMEOUT";}
    const sources=app.xr.input?.inputSources??[],l=sources.find((s:any)=>s.handedness==="left"&&s.gamepad),r=sources.find((s:any)=>s.handedness==="right"&&s.gamepad);
    if(l!==left){left=l;aiming=false;}if(r!==right){right=r;turnArmed=false;buttons=(r?.gamepad.buttons??[]).map((b:any)=>!!b.pressed);}
    const la=l?.gamepad.axes??[],ly=la[la.length>=4?3:1]??0;
    if(l&&ly<-.65&&!pending)aiming=true;
    const destination=aiming?target(l):null;marker.enabled=!!destination;
    if(destination){marker.setPosition(destination.x,.035,destination.z);app.drawLine(l.getOrigin(),destination,green,true);}
    if(aiming&&l&&Math.abs(ly)<.25){aiming=false;marker.enabled=false;if(destination&&!pending){const id="vr-"+(++serial);pending={id,room,at:performance.now()};room.send("vr:teleport",{requestId:id,x:destination.x,y:.65,z:destination.z,rotationY:camera.getEulerAngles().y});message="TELEPORTING…";}else message="AIM AT CLEAR FLOOR";}
    const ra=r?.gamepad.axes??[],rx=ra[ra.length>=4?2:0]??0;
    if(Math.abs(rx)<.25)turnArmed=true;
    if(r&&turnArmed&&Math.abs(rx)>.65&&!pending){turnArmed=false;const angle=-Math.sign(rx)*Math.PI/6,head=camera.getPosition().clone(),origin=rig.getPosition().clone(),dx=origin.x-head.x,dz=origin.z-head.z;rig.setEulerAngles(0,rig.getEulerAngles().y+angle*180/Math.PI,0);rig.setPosition(head.x+Math.cos(angle)*dx+Math.sin(angle)*dz,origin.y,head.z-Math.sin(angle)*dx+Math.cos(angle)*dz);}
    if(r){const item=pick(r),nextButtons=r.gamepad.buttons.map((b:any)=>!!b.pressed);if(nextButtons[0]&&!buttons[0])action(item,"play");if(nextButtons[1]&&!buttons[1])action(item??selected,"timeline");if(nextButtons[3]&&!buttons[3])action(selected,"stop");buttons=nextButtons;}
    const label=`LEFT: forward + release = teleport | RIGHT: stick = turn 30°\nTRIGGER: PLAY | GRIP: DO | STICK CLICK: STOP\n${selected?.id??"Aim at an artwork"} · ${message}`;
    if(label!==lastLabel){lastLabel=label;const c=canvas.getContext("2d");c.fillStyle="#102030";c.fillRect(0,0,1024,256);c.fillStyle="white";c.font="27px sans-serif";label.split("\n").forEach((line,i)=>c.fillText(line.slice(0,85),20,55+i*65));texture.upload();}
  }
  app.on("update",update);return {dispose:()=>{app.off("update",update);clean();}};
}
