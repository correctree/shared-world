/** Horizontal, gaze-relative analog movement. The callback checks each axis. */
export function questVRStickDelta(x:number,y:number,forward:{x:number;z:number},speed:number,dt:number){
  if(![x,y,forward.x,forward.z,speed,dt].every(Number.isFinite))return {x:0,z:0};
  const magnitude=Math.hypot(x,y),length=Math.hypot(forward.x,forward.z);
  if(magnitude<=.18||length<.001||dt<=0)return {x:0,z:0};
  const amount=(Math.min(1,magnitude)-.18)/.82*Math.max(.5,Math.min(2,speed))*Math.min(dt,.05);
  const fx=forward.x/length,fz=forward.z/length;
  return {x:(-fz*x-fx*y)/magnitude*amount,z:(fx*x-fz*y)/magnitude*amount};
}
export function questVRWalk(x:number,z:number,dx:number,dz:number,canMove:(x:number,z:number)=>boolean){
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.05));
  for(let i=0;i<count;i++){const nx=x+dx/count;if(canMove(nx,z))x=nx;const nz=z+dz/count;if(canMove(x,nz))z=nz;}
  return {x,z};
}
