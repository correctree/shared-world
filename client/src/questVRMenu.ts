import { createQuestVRPhoto } from "./questVRPhoto";
export const questVRMenuButtons=["movement","slower","faster","flight","light","jump","photo","timer","photos","close","exit"];
export function questVRSliderValue(x:number){return Math.round((.25+Math.max(0,Math.min(1,(x-400)/560))*5.75)*20)/20;}
export function questVRMenuHit(x:number,y:number){
  if(x>=380&&x<=980&&y>=130&&y<=166)return "speed-slider";
  for(let i=0;i<questVRMenuButtons.length;i++){const left=48+(i%2)*488,top=180+Math.floor(i/2)*88;if(x>=left&&x<=left+440&&y>=top&&y<=top+72)return questVRMenuButtons[i];}
  return "";
}
type Context={app:any;pc:any;camera:any;active:()=>boolean;getRoom:()=>any;host:HTMLElement;getMovement:()=>string;toggleMovement:()=>void;getSpeed:()=>number;adjustSpeed:(d:number)=>void;setSpeed:(v:number)=>void;getFlying:()=>boolean;toggleFlight:()=>void;getLight:()=>boolean;toggleLight:()=>void;stop:()=>void};
export function createQuestVRMenu(ctx:Context){
  const {app,pc,camera}=ctx;const layer=new pc.Layer({name:"Quest VR Overlay"});app.scene.layers.push(layer);const originalLayers=camera.camera.layers.slice();camera.camera.layers=[...originalLayers,layer.id];
  const photo=createQuestVRPhoto({...ctx,overlayLayer:layer.id});
  const canvas=document.createElement("canvas");canvas.width=canvas.height=1024;
  const texture=new pc.Texture(app.graphicsDevice,{width:1024,height:1024,mipmaps:false});texture.setSource(canvas);
  const material=new pc.StandardMaterial();material.useLighting=false;material.diffuse=new pc.Color(0,0,0);material.useTonemap=false;material.emissive=new pc.Color(1,1,1);material.emissiveMap=texture;material.cull=pc.CULLFACE_NONE;material.depthTest=false;material.depthWrite=false;material.update();
  const root=new pc.Entity("Quest VR Menu"),plane=new pc.Entity("Quest VR Menu Surface");plane.addComponent("render",{type:"plane",layers:[layer.id]});plane.render.meshInstances.forEach((m:any)=>m.material=material);plane.setLocalEulerAngles(90,0,0);plane.setLocalScale(1,1,1);root.addChild(plane);app.root.addChild(root);root.enabled=false;
  let open=false,room:any=null,right:any=null,previous:boolean[]=[],timer=3,hover="",pointerX=0,jump=false,lastLabel="",status="",lastPreview:any=null,draggingSpeed=false;
  function close(){draggingSpeed=false;open=false;root.enabled=false;hover="";}
  function show(){if(!ctx.active()||photo.isBusy())return;room=ctx.getRoom();open=true;root.enabled=true;root.setPosition(camera.getPosition().clone().add(camera.forward.clone().mulScalar(1.3)));root.setRotation(camera.getRotation().clone());lastLabel="";}
  function activate(id:string){
    if(photo.isBusy())return;
    if(id==="movement")ctx.toggleMovement();else if(id==="slower")ctx.adjustSpeed(-1);else if(id==="faster")ctx.adjustSpeed(1);else if(id==="flight")ctx.toggleFlight();else if(id==="light")ctx.toggleLight();
    else if(id==="jump"){if(ctx.getFlying()){status="JUMP: turn FLY OFF and land first";return;}jump=true;close();}else if(id==="close")close();else if(id==="exit"){close();ctx.stop();}
    else if(id==="timer")timer=timer===0?3:timer===3?10:0;
    else if(id==="photo"){status="";void photo.capture(timer);}else if(id==="photos")status="PNG保存：EXIT VR後、WORLD → QUEST VR → VR PHOTOS";
  }
  function pick(source:any){
    const matrix=root.getWorldTransform().clone().invert(),o=matrix.transformPoint(source.getOrigin(),new pc.Vec3()),d=matrix.transformVector(source.getDirection(),new pc.Vec3());
    if(d.z>=-.001)return "";const t=-o.z/d.z;if(t<0)return "";
    const x=o.x+d.x*t,y=o.y+d.y*t;if(Math.abs(x)>.5||Math.abs(y)>.5)return "";
    app.drawLine(source.getOrigin(),source.getOrigin().clone().add(source.getDirection().clone().mulScalar(t)),new pc.Color(.3,1,.6),true,layer);
    pointerX=(x+.5)*1024;return questVRMenuHit(pointerX,(.5-y)*1024);
  }
  function update(){
    if(!ctx.active()||!ctx.getRoom()||(room&&room!==ctx.getRoom())){close();jump=false;room=null;right=null;previous=[];photo.cancel();return;}
    if(app.xr.session?.visibilityState&&app.xr.session.visibilityState!=="visible"){close();jump=false;right=null;previous=[];photo.cancel();return;}
    const r=(app.xr.input?.inputSources??[]).find((s:any)=>s.handedness==="right"&&s.gamepad);if(r!==right){right=r;previous=(r?.gamepad.buttons??[]).map((b:any)=>!!b.pressed);}
    const buttons=(r?.gamepad.buttons??[]).map((b:any)=>!!b.pressed);
    if(buttons[5]&&!previous[5]){if(open)close();else show();}
    hover=open&&r?pick(r):"";
    if(open&&buttons[0]&&!previous[0]&&hover==="speed-slider"&&!photo.isBusy())draggingSpeed=true;
    if(draggingSpeed&&(!buttons[0]||!r||!open||photo.isBusy()))draggingSpeed=false;
    if(draggingSpeed&&hover==="speed-slider")ctx.setSpeed(questVRSliderValue(pointerX));
    if(open&&buttons[0]&&!previous[0]&&hover&&hover!=="speed-slider")activate(hover);previous=buttons;
    if(!open)return;
    const labels:{[key:string]:string}={movement:"MOVE: "+ctx.getMovement().toUpperCase(),slower:"SPEED −",faster:"SPEED +",flight:"FLY "+(ctx.getFlying()?"ON":"OFF"),light:"LIGHT "+(ctx.getLight()?"ON":"OFF"),jump:"JUMP",photo:photo.isBusy()?"CAPTURING…":"PHOTO",timer:"TIMER "+(timer?timer+" SEC":"OFF"),photos:"PHOTOS / SAVE INFO",close:"CLOSE",exit:"EXIT VR"};
    const label=JSON.stringify(labels)+ctx.getSpeed()+hover+photo.getStatus()+status;const preview=photo.getPreview();if(label===lastLabel&&preview===lastPreview)return;lastLabel=label;lastPreview=preview;
    const c=canvas.getContext("2d")!;c.fillStyle="#000000";c.fillRect(0,0,1024,1024);c.fillStyle="white";c.font="bold 46px sans-serif";c.fillText("QUEST VR MENU",48,68);c.font="26px sans-serif";c.fillText("B: open / close · point + RIGHT TRIGGER: select",48,120);c.fillText("SPEED "+ctx.getSpeed().toFixed(2)+" m/s",48,156);
    c.fillStyle="white";c.fillRect(400,146,560,4);const knob=400+(ctx.getSpeed()-.25)/5.75*560;c.fillRect(knob-7,136,14,24);
    questVRMenuButtons.forEach((id,i)=>{const x=48+(i%2)*488,y=180+Math.floor(i/2)*88;c.fillStyle="white";c.fillRect(x,y,440,72);c.fillStyle="black";c.fillRect(x+(hover===id?5:2),y+(hover===id?5:2),440-(hover===id?10:4),72-(hover===id?10:4));c.fillStyle="white";c.font="bold 29px sans-serif";c.fillText(labels[id],x+20,y+47);});
    if(preview)c.drawImage(preview,48,736,320,180);c.font="24px sans-serif";c.fillStyle="white";c.fillText((photo.isBusy()?photo.getStatus():status||photo.getStatus()||"PHOTO: capture the XR scene from your viewpoint").slice(0,75),48,966);texture.upload();
  }
  app.on("update",update);
  return {overlayLayer:layer.id,isOpen:()=>open,isBusy:()=>open||photo.isBusy(),consumeJump:()=>{const requested=jump;jump=false;return requested;},dispose:()=>{app.off("update",update);photo.dispose();root.destroy();material.destroy();texture.destroy();camera.camera.layers=camera.camera.layers.filter((id:number)=>id!==layer.id);app.scene.layers.remove(layer);}};
}
