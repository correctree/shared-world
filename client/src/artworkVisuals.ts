type Item={id:string;kind:string;title:string;entity:any;cameraScreen?:boolean;browserScreen?:boolean};
type Point={x:number;y:number;z:number};
/** Read world-space mesh bounds without changing visibility or original materials. */
export function artworkBounds(entity:any){
  entity.syncHierarchy?.();let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const render of entity.findComponents("render"))for(const instance of render.meshInstances??[]){
    const box=instance.aabb;if(!box)continue;const c=box.center,h=box.halfExtents;
    const center=[c.x,c.y,c.z],half=[h.x,h.y,h.z];
    for(let axis=0;axis<3;axis++){lo[axis]=Math.min(lo[axis],center[axis]-half[axis]);hi[axis]=Math.max(hi[axis],center[axis]+half[axis]);}
  }
  if(![...lo,...hi].every(Number.isFinite))return null;
  return {lo,hi};
}
/** Fixed oblique projection, normalized to the model's world bounds. */
export function projectArtworkPoint(point:Point,center:Point){
  const x=point.x-center.x,y=point.y-center.y,z=point.z-center.z;
  return {x:(x-z)*Math.SQRT1_2,y:-y*.8660254+(x+z)*.3535534,depth:(x+z)*.6123724+y*.5};
}
export function createArtworkVisuals(ctx:{pc:any;app:any;getItems:()=>Map<string,Item>;getSelected:()=>string|null;enabled:()=>boolean}){
  const {pc,app}=ctx;
  const root=new pc.Entity("Local Artwork Selection");root.enabled=false;app.root.addChild(root);
  const material=new pc.StandardMaterial();material.useLighting=false;material.useTonemap=false;
  material.diffuse=new pc.Color(0,0,0);material.emissive=new pc.Color(.12,.8,1);material.update();
  const edges:any[]=[];
  for(let i=0;i<12;i++){const edge=new pc.Entity("Selection Edge");edge.addComponent("render",{type:"box"});edge.render.material=material;edge.render.castShadows=false;root.addChild(edge);edges.push(edge);}
  let disposed=false,ticks=0;
  const cache=new Map<string,{entity:any;url:string}>();
  const queue=new Map<string,{item:Item;images:Set<HTMLImageElement>}>();
  function fallback(item:Item){
    const canvas=document.createElement("canvas");canvas.width=96;canvas.height=96;const draw=canvas.getContext("2d")!;
    draw.fillStyle="#111e2c";draw.fillRect(0,0,96,96);draw.fillStyle="#a9d9f0";draw.textAlign="center";draw.textBaseline="middle";draw.font="bold 18px system-ui";
    draw.fillText(item.kind==="audio"?"♫":item.cameraScreen?"CAM":item.browserScreen?"WEB":item.kind.toUpperCase(),48,48);
    return canvas.toDataURL("image/png");
  }
  function shape(item:Item){
    const bounds=artworkBounds(item.entity);if(!bounds)return fallback(item);
    const center={x:(bounds.lo[0]+bounds.hi[0])/2,y:(bounds.lo[1]+bounds.hi[1])/2,z:(bounds.lo[2]+bounds.hi[2])/2};
    const projectedCorners=[];
    for(const x of [bounds.lo[0],bounds.hi[0]])for(const y of [bounds.lo[1],bounds.hi[1]])for(const z of [bounds.lo[2],bounds.hi[2]])projectedCorners.push(projectArtworkPoint({x,y,z},center));
    const extent=Math.max(.001,...projectedCorners.map(p=>Math.max(Math.abs(p.x),Math.abs(p.y))));
    const scale=39/extent,faces:{points:any[];depth:number;shade:number}[]=[];
    const instances=item.entity.findComponents("render").flatMap((r:any)=>r.meshInstances??[]);
    const limit=Math.max(8,Math.floor(5000/Math.max(1,instances.length)));
    for(const instance of instances){
      const mesh=instance.mesh,matrix=instance.node?.getWorldTransform?.();if(!mesh?.getPositions||!matrix)continue;
      const positions:number[]=[],indices:number[]=[];mesh.getPositions(positions);mesh.getIndices?.(indices);
      const indexed=indices.length>=3,total=indexed?indices.length:Math.floor(positions.length/3),count=Math.floor(total/3);
      const stride=Math.max(1,Math.ceil(count/limit));
      for(let triangle=0;triangle<count;triangle+=stride){
        const vertices:Point[]=[];
        for(let corner=0;corner<3;corner++){
          const index=indexed?indices[triangle*3+corner]:triangle*3+corner;
          if(index<0||index*3+2>=positions.length)break;
          const out=matrix.transformPoint(new pc.Vec3(positions[index*3],positions[index*3+1],positions[index*3+2]),new pc.Vec3());
          if(![out.x,out.y,out.z].every(Number.isFinite))break;vertices.push(out);
        }
        if(vertices.length!==3)continue;
        const [a,b,c]=vertices,ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz);if(length<1e-12)continue;
        const points=vertices.map(p=>projectArtworkPoint(p,center));
        faces.push({points,depth:points.reduce((sum,p)=>sum+p.depth,0)/3,shade:.35+.65*Math.abs((nx*.3+ny*.8+nz*.5)/length)/Math.hypot(.3,.8,.5)});
      }
    }
    if(!faces.length)return fallback(item);
    const canvas=document.createElement("canvas");canvas.width=96;canvas.height=96;const draw=canvas.getContext("2d")!;
    draw.fillStyle="#111e2c";draw.fillRect(0,0,96,96);
    faces.sort((a,b)=>a.depth-b.depth);
    for(const face of faces){draw.beginPath();face.points.forEach((p,i)=>{const x=48+p.x*scale,y=48+p.y*scale;if(i===0)draw.moveTo(x,y);else draw.lineTo(x,y);});draw.closePath();const value=Math.round(110+120*face.shade);draw.fillStyle=`rgb(${Math.round(value*.63)},${Math.round(value*.88)},${value})`;draw.fill();}
    return canvas.toDataURL("image/png");
  }
  function request(item:Item,img:HTMLImageElement){
    if(disposed)return;
    img.alt=item.kind==="glb"?`${item.title} · 形状プレビュー`:`${item.title} · ${item.kind.toUpperCase()}`;
    const ready=cache.get(item.id);if(ready?.entity===item.entity){img.src=ready.url;return;}
    img.src=fallback(item);
    const pending=queue.get(item.id);if(pending?.item.entity===item.entity)pending.images.add(img);else queue.set(item.id,{item,images:new Set([img])});
  }
  function marker(){
    root.enabled=false;if(!ctx.enabled())return;
    const item=ctx.getItems().get(ctx.getSelected()??"");if(!item?.entity?.parent||!item.entity.enabled)return;
    const bounds=artworkBounds(item.entity);if(!bounds)return;
    const lo=bounds.lo.slice(),hi=bounds.hi.slice(),size=hi.map((v,i)=>v-lo[i]);
    const thickness=Math.max(.01,Math.min(.045,Math.max(...size)*.003)),margin=thickness*2;
    for(let i=0;i<3;i++){lo[i]-=margin;hi[i]+=margin;}
    let index=0;
    for(let axis=0;axis<3;axis++){
      const other=[0,1,2].filter(n=>n!==axis);
      for(const a of [lo[other[0]],hi[other[0]]])for(const b of [lo[other[1]],hi[other[1]]]){
        const pos=[0,0,0],scale=[thickness,thickness,thickness];pos[axis]=(lo[axis]+hi[axis])/2;pos[other[0]]=a;pos[other[1]]=b;scale[axis]=hi[axis]-lo[axis];
        edges[index].setPosition(pos[0],pos[1],pos[2]);edges[index++].setLocalScale(scale[0],scale[1],scale[2]);
      }
    }
    root.enabled=true;
  }
  function update(){
    if(disposed)return;marker();
    const items=ctx.getItems();if(++ticks%60===0){for(const [id,entry] of cache)if(items.get(id)?.entity!==entry.entity)cache.delete(id);}
    // One queued shape per frame; never clone, enable, or modify the artwork.
    const next=queue.entries().next();if(next.done)return;const [id,pending]=next.value;queue.delete(id);
    if(items.get(id)?.entity!==pending.item.entity)return;
    let url:string;try{url=pending.item.kind==="glb"?shape(pending.item):fallback(pending.item);}catch{url=fallback(pending.item);}
    cache.set(id,{entity:pending.item.entity,url});for(const img of pending.images)if(img.isConnected)img.src=url;
  }
  app.on("update",update);
  return {request,dispose(){disposed=true;app.off("update",update);queue.clear();cache.clear();root.destroy();material.destroy();}};
}
