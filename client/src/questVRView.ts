/** Mirrors desktop VIEW jump/gravity constants and keeps the existing 0..8m floor range. */
export function questVRAirStep(foot:number,velocity:number,dt:number,flying:boolean,vertical:number,jump:boolean,
  ground:number,blocked:(foot:number)=>boolean){
  const frame=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.05));
  const floor=Math.max(0,Math.min(8,Number.isFinite(ground)?ground:foot));
  if(jump&&!flying&&Math.abs(foot-floor)<=.04)velocity=5.4;
  if(flying)velocity=Math.max(-1,Math.min(1,vertical))*2.7;
  else velocity=Math.max(-6,velocity-11*frame);
  let next=Math.max(floor,Math.min(8,foot+velocity*frame));
  if(blocked(next)){next=foot;velocity=0;}
  if(next<=floor+.0001&&velocity<0)velocity=0;
  if(next>=8&&velocity>0)velocity=0;
  return {foot:next,velocity};
}
/** Reuse the avatar spotlight; update after avatar movement, without reparenting it. */
export function createQuestVRFlashlight(ctx:{app:any;camera:any;active:()=>boolean;getRoot:()=>any}){
  let saved:any=null;
  function restore(){
    if(saved&&ctx.getRoot()===saved.root&&saved.root.parent){saved.root.setLocalPosition(saved.position);saved.root.setLocalRotation(saved.rotation);}
    saved=null;
  }
  function update(){
    const root=ctx.getRoot();if(!ctx.active()||!root){restore();return;}
    if(saved?.root!==root){restore();saved={root,position:root.getLocalPosition().clone(),rotation:root.getLocalRotation().clone()};}
    const source=(ctx.app.xr.input?.inputSources??[]).find((s:any)=>s.handedness==="right"&&s.gamepad);
    const origin=(source?.getOrigin()??ctx.camera.getPosition()).clone(),direction=(source?.getDirection()??ctx.camera.forward).clone();
    root.setPosition(origin);root.lookAt(origin.clone().add(direction));
  }
  ctx.app.on("update",update);return {dispose:()=>{ctx.app.off("update",update);restore();}};
}
