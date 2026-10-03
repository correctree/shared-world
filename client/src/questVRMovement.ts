/** Horizontal, gaze-relative analog movement. The callback checks each axis. */
export function questVRStickDelta(x:number,y:number,forward:{x:number;z:number},speed:number,dt:number){
  if(![x,y,forward.x,forward.z,speed,dt].every(Number.isFinite))return {x:0,z:0};
  const magnitude=Math.hypot(x,y),length=Math.hypot(forward.x,forward.z);
  if(magnitude<=.18||length<.001||dt<=0)return {x:0,z:0};
  const amount=(Math.min(1,magnitude)-.18)/.82*Math.max(.25,Math.min(6,speed))*Math.min(dt,.05);
  const fx=forward.x/length,fz=forward.z/length;
  return {x:(-fz*x-fx*y)/magnitude*amount,z:(fx*x-fz*y)/magnitude*amount};
}
export function questVRWalk(x:number,z:number,dx:number,dz:number,canMove:(x:number,z:number)=>boolean){
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.05));
  for(let i=0;i<count;i++){const nx=x+dx/count;if(canMove(nx,z))x=nx;const nz=z+dz/count;if(canMove(x,nz))z=nz;}
  return {x,z};
}
/** Terrain traversal with small horizontal steps and bounded vertical travel. */
export function questVRWalkSurface(x:number,z:number,foot:number,dx:number,dz:number,dt:number,
  ground:(x:number,z:number,foot:number)=>number,blocked:(x:number,z:number,foot:number)=>boolean){
  const frame=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.05));
  let support=foot;
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.05));
  const test=(nx:number,nz:number)=>{
    const top=ground(nx,nz,support);
    if(!Number.isFinite(top)||top<0||top>160||top>support+.580001||blocked(nx,nz,support))return false;
    // Follow small downward steps. Large ledges descend through vertical settling.
    if(top>=support-.58)support=top;
    return true;
  };
  for(let i=0;i<count;i++){const nx=x+dx/count;if(test(nx,z))x=nx;const nz=z+dz/count;if(test(x,nz))z=nz;}
  const height=ground(x,z,support);
  const target=Number.isFinite(height)?Math.max(0,Math.min(160,height)):foot;
  // Smooth steps in both directions. Stay within the existing server move limit.
  const y=foot+Math.max(-2.5*frame,Math.min(4*frame,target-foot));
  return {x,z,foot:y};
}
/** Incremental quaternion rotation avoids Euler Y folding at 90/180 degrees. */
export function questVRSnapTurn(rig:any,head:{x:number;z:number},direction:number){
  const angle=-Math.sign(direction)*Math.PI/6,origin=rig.getPosition().clone();
  const dx=origin.x-head.x,dz=origin.z-head.z;
  rig.rotateLocal(0,angle*180/Math.PI,0);
  rig.setPosition(head.x+Math.cos(angle)*dx+Math.sin(angle)*dz,origin.y,head.z-Math.sin(angle)*dx+Math.cos(angle)*dz);
}
export function questVRHeading(forward:{x:number;z:number}){return Math.atan2(-forward.x,-forward.z)*180/Math.PI;}
/** Find the first supported surface crossed by a downward ray, including stairs/ramps. */
export function questVRTeleportRay(origin:{x:number;y:number;z:number},direction:{x:number;y:number;z:number},
 ground:(x:number,z:number,foot:number)=>number,canStand:(x:number,z:number,foot:number)=>boolean){
 if(![origin.x,origin.y,origin.z,direction.x,direction.y,direction.z].every(Number.isFinite)||direction.y>=-.05)return null;
 let previousGap=origin.y-ground(origin.x,origin.z,Math.max(0,Math.min(160,origin.y)));
 for(let t=.05;t<=10;t+=.05){const point={x:origin.x+direction.x*t,y:origin.y+direction.y*t,z:origin.z+direction.z*t};const height=ground(point.x,point.z,Math.max(0,Math.min(160,point.y)));
  if(Number.isFinite(height)&&height>=0&&height<=160&&previousGap>=-.001&&point.y<=height+.001&&height-point.y<=.08&&canStand(point.x,point.z,height))return {x:point.x,y:height,z:point.z};
  if(point.y<-.1)break;previousGap=point.y-height;
 }return null;
}
