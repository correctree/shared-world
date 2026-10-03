import { questVRAirStep } from "./questVRView";
import { questVRStickDelta, questVRWalk, questVRWalkSurface, questVRSnapTurn, questVRHeading } from "./questVRMovement";
type Context={app:any;pc:any;camera:any;getRig:()=>any;getRoom:()=>any;getItems:()=>any[];canTeleport:(x:number,z:number)=>boolean;onTeleport:(x:number,z:number)=>void;getMovement?:()=>string;getSpeed?:()=>number;toggleMovement?:()=>void;adjustSpeed?:(direction:number)=>void;getGround?:(x:number,z:number,foot:number)=>number;isBlocked?:(x:number,z:number,foot:number)=>boolean;onWalk?:(x:number,z:number,foot:number)=>void;getFlying?:()=>boolean;toggleFlight?:()=>void;getLight?:()=>boolean;toggleLight?:()=>void;overlayLayer?:number;isMenuBusy?:()=>boolean;consumeMenuJump?:()=>boolean};
/** Quest xr-standard controllers; all transforms operate on the XR origin. */
export function createQuestVRInteraction(ctx:Context){
  const {app,pc,camera}=ctx;
  let room:any=null,unsubscribe:any=null,marker:any=null,hud:any=null,texture:any=null,material:any=null,hudMaterial:any=null,canvas:any=null;
  let left:any=null,right:any=null,aiming=false,turnArmed=false,buttons:boolean[]=[],selected:any=null,pending:any=null,serial=0,message="",lastLabel="",leftClick=false,walkArmed=false,lastMode="",speedArmed=false;
  let leftButtons:boolean[]=[],viewArmed=false,airVelocity=0;
  let turnAt:number|null=null;
  const green=new pc.Color(.1,1,.35),blue=new pc.Color(.25,.65,1);
  function clean(){unsubscribe?.();unsubscribe=null;room=null;marker?.destroy();hud?.destroy();texture?.destroy();material?.destroy();hudMaterial?.destroy();marker=hud=texture=material=hudMaterial=canvas=null;left=right=null;leftButtons=[];viewArmed=false;airVelocity=0;leftClick=false;walkArmed=false;lastMode="";speedArmed=false;turnAt=null;aiming=false;turnArmed=false;buttons=[];selected=null;pending=null;lastLabel="";}
  function setup(next:any){room=next;
    marker=new pc.Entity("VR teleport target");marker.addComponent("render",{type:"sphere"});marker.setLocalScale(.22,.025,.22);material=new pc.StandardMaterial();material.diffuse=green;material.emissive=green;material.update();marker.render.meshInstances.forEach((m:any)=>m.material=material);app.root.addChild(marker);marker.enabled=false;
    canvas=document.createElement("canvas");canvas.width=1024;canvas.height=384;texture=new pc.Texture(app.graphicsDevice,{width:1024,height:384,mipmaps:false});texture.setSource(canvas);
    hudMaterial=new pc.StandardMaterial();hudMaterial.useLighting=false;hudMaterial.emissive=new pc.Color(1,1,1);hudMaterial.emissiveMap=texture;hudMaterial.cull=pc.CULLFACE_NONE;hudMaterial.depthWrite=false;hudMaterial.depthTest=false;hudMaterial.update();
    hud=new pc.Entity("VR controls");hud.addComponent("render",{type:"plane",...(ctx.overlayLayer!==undefined?{layers:[ctx.overlayLayer]}:{})});hud.render.meshInstances.forEach((m:any)=>m.material=hudMaterial);camera.addChild(hud);hud.setLocalPosition(0,-.28,-1);hud.setLocalEulerAngles(90,0,0);hud.setLocalScale(.9,1,.3375);
    message="READY";
    unsubscribe=room.onMessage("vr:teleport:result",(result:any)=>{
      if(!pending||result?.requestId!==pending.id)return;
      const rig=ctx.getRig();const current=pending;pending=null;
      if(!rig||room!==current.room)return;
      if(!result.ok){message=result.reason||"TELEPORT REJECTED";return;}
      if(![result.x,result.y,result.z].every(Number.isFinite)||Math.abs(result.y-.65)>.001){message="INVALID RESPONSE";return;}
      const head=camera.getPosition(),origin=rig.getPosition();rig.setPosition(result.x-(head.x-origin.x),0,result.z-(head.z-origin.z));airVelocity=0;ctx.onTeleport(result.x,result.z);message="TELEPORTED";
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
  function update(dt:number){
    const rig=ctx.getRig(),next=ctx.getRoom();if(!rig||!next){if(room)clean();return;}if(room!==next){clean();setup(next);}
    if(app.xr.session?.visibilityState&&app.xr.session.visibilityState!=="visible"){left=right=null;leftButtons=[];viewArmed=false;walkArmed=false;airVelocity=0;aiming=false;marker.enabled=false;return;}
    hud.enabled=!ctx.isMenuBusy?.();
    if(ctx.isMenuBusy?.()){left=right=null;leftButtons=[];viewArmed=false;walkArmed=false;airVelocity=0;aiming=false;marker.enabled=false;return;}
    if(pending&&performance.now()-pending.at>3000){pending=null;message="TELEPORT TIMEOUT";}
    const sources=app.xr.input?.inputSources??[],l=sources.find((s:any)=>s.handedness==="left"&&s.gamepad),r=sources.find((s:any)=>s.handedness==="right"&&s.gamepad);
    if(l!==left){left=l;leftButtons=(l?.gamepad.buttons??[]).map((b:any)=>!!b.pressed);viewArmed=false;aiming=false;walkArmed=false;leftClick=!!l?.gamepad.buttons[3]?.pressed;}if(r!==right){right=r;turnArmed=false;turnAt=null;speedArmed=false;buttons=(r?.gamepad.buttons??[]).map((b:any)=>!!b.pressed);}
    const la=l?.gamepad.axes??[],ly=la[la.length>=4?3:1]??0,lx=la[la.length>=4?2:0]??0;
    const nextLeftButtons=(l?.gamepad.buttons??[]).map((b:any)=>!!b.pressed);
    if(!nextLeftButtons[0]&&!nextLeftButtons[1])viewArmed=true;
    if(nextLeftButtons[4]&&!leftButtons[4]&&!pending){ctx.toggleFlight?.();airVelocity=0;aiming=false;}
    if(nextLeftButtons[5]&&!leftButtons[5])ctx.toggleLight?.();
    const flying=ctx.getFlying?.()??false;
    const jump=!!ctx.consumeMenuJump?.()||(viewArmed&&!flying&&!!nextLeftButtons[0]&&!leftButtons[0]&&!pending);
    const vertical=viewArmed&&l?(Number(!!nextLeftButtons[0])-Number(!!nextLeftButtons[1])):0;
    leftButtons=nextLeftButtons;
    const clicked=!!l?.gamepad.buttons[3]?.pressed;
    if(clicked&&!leftClick&&!pending){ctx.toggleMovement?.();aiming=false;walkArmed=false;}leftClick=clicked;
    const mode=ctx.getMovement?.()??"teleport",speed=ctx.getSpeed?.()??1.2;
    if(mode!==lastMode){lastMode=mode;aiming=false;walkArmed=false;}
    if(Math.hypot(lx,ly)<.18)walkArmed=true;
    if(ctx.getGround&&ctx.isBlocked&&!pending){
      const delta=mode==="stick"&&l&&walkArmed?questVRStickDelta(lx,ly,camera.forward,speed,dt):{x:0,z:0};
      const head=camera.getPosition().clone(),origin=rig.getPosition().clone();
      const ground=ctx.getGround(head.x,head.z,origin.y);
      let position:any;
      if(flying||jump||airVelocity>0||origin.y>ground+.04){
        const horizontal=questVRWalk(head.x,head.z,delta.x,delta.z,(x,z)=>!ctx.isBlocked!(x,z,origin.y));
        const support=ctx.getGround(horizontal.x,horizontal.z,origin.y);
        const air=questVRAirStep(origin.y,airVelocity,dt,flying,vertical,jump,support,foot=>ctx.isBlocked!(horizontal.x,horizontal.z,foot));
        airVelocity=air.velocity;position={...horizontal,foot:air.foot};
      }else{position=questVRWalkSurface(head.x,head.z,origin.y,delta.x,delta.z,dt,ctx.getGround,ctx.isBlocked);airVelocity=0;}
      rig.setPosition(origin.x+position.x-head.x,position.foot,origin.z+position.z-head.z);ctx.onWalk?.(position.x,position.z,position.foot);
    }else if(mode==="stick"&&l&&walkArmed&&!pending){
      const delta=questVRStickDelta(lx,ly,camera.forward,speed,dt);
      if(delta.x||delta.z){const head=camera.getPosition().clone(),origin=rig.getPosition().clone();const position=questVRWalk(head.x,head.z,delta.x,delta.z,ctx.canTeleport);rig.setPosition(origin.x+position.x-head.x,origin.y,origin.z+position.z-head.z);}
    }
    if(mode!=="teleport"||flying||Math.abs(airVelocity)>.01)aiming=false;
    if(mode==="teleport"&&!flying&&Math.abs(airVelocity)<=.01&&l&&ly<-.65&&!pending)aiming=true;
    const destination=aiming?target(l):null;marker.enabled=!!destination;
    if(destination){marker.setPosition(destination.x,.035,destination.z);app.drawLine(l.getOrigin(),destination,green,true);}
    if(aiming&&l&&Math.abs(ly)<.25){aiming=false;marker.enabled=false;if(destination&&!pending){const id="vr-"+(++serial);pending={id,room,at:performance.now()};room.send("vr:teleport",{requestId:id,x:destination.x,y:.65,z:destination.z,rotationY:questVRHeading(camera.forward)});message="TELEPORTING…";}else message="AIM AT CLEAR FLOOR";}
    const ra=r?.gamepad.axes??[],rx=ra[ra.length>=4?2:0]??0,ry=ra[ra.length>=4?3:1]??0;
    if(Math.abs(ry)<.25)speedArmed=true;
    if(r&&speedArmed&&Math.abs(ry)>.65&&Math.abs(rx)<.35&&!pending){speedArmed=false;ctx.adjustSpeed?.(-Math.sign(ry));message="SPEED "+(ctx.getSpeed?.()??speed)+" m/s";}
    if(Math.abs(rx)<.25){turnArmed=true;turnAt=null;}
    if(r&&(turnArmed||(turnAt!==null&&performance.now()-turnAt>=350))&&Math.abs(rx)>.65&&!pending){turnArmed=false;turnAt=performance.now();questVRSnapTurn(rig,camera.getPosition().clone(),rx);}
    if(r){const item=pick(r),nextButtons=r.gamepad.buttons.map((b:any)=>!!b.pressed);if(nextButtons[0]&&!buttons[0])action(item,"play");if(nextButtons[1]&&!buttons[1])action(item??selected,"timeline");if(nextButtons[3]&&!buttons[3])action(selected,"stop");buttons=nextButtons;}
    const label=`${mode==="stick"?`LEFT: MOVE ${speed} m/s`:"LEFT: forward + release = TELEPORT"} | CLICK LEFT: switch mode\nRIGHT: L/R turn | UP/DOWN speed | TRIGGER PLAY | GRIP DO\nB: MENU | LEFT TRIGGER JUMP/UP | GRIP DOWN | X FLY | Y LIGHT\nFLY ${flying?"ON":"OFF"} | LIGHT ${ctx.getLight?.()?"ON":"OFF"} | HEIGHT ${rig.getPosition().y.toFixed(1)} m\n${selected?.id??"Aim at an artwork"} · ${message}`;
    if(label!==lastLabel){lastLabel=label;const c=canvas.getContext("2d");c.fillStyle="#102030";c.fillRect(0,0,1024,384);c.fillStyle="white";c.font="23px sans-serif";label.split("\n").forEach((line,i)=>c.fillText(line.slice(0,85),20,45+i*68));texture.upload();}
  }
  app.on("update",update);return {dispose:()=>{app.off("update",update);clean();}};
}
