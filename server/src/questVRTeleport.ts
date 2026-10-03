/** Authoritative, bounded floor teleport; ordinary movement limits stay intact. */
export class QuestVRTeleport {
  private last=new Map<string,number>();
  constructor(host:any,limit:()=>number,after:(client:any)=>void){
    host.onMessage("vr:teleport",(client:any,payload:any)=>{
      const id=typeof payload?.requestId==="string"?payload.requestId.slice(0,80):"";
      const reject=(reason:string)=>client.send("vr:teleport:result",{requestId:id,ok:false,reason});
      const player=host.state.players.get(client.sessionId);
      if(!player||player.controlOnly===true)return reject("NO PLAYER");
      const {x,y,z,rotationY}=payload??{};
      if(!id||![x,y,z,rotationY].every(v=>typeof v==="number"&&Number.isFinite(v))||y<.65||y>160.65)return reject("INVALID TARGET");
      if(Math.abs(x)>limit()||Math.abs(z)>limit()||Math.hypot(x-player.x,z-player.z)>12)return reject("OUT OF RANGE");
      const now=Date.now();if(now-(this.last.get(client.sessionId)??-Infinity)<700)return reject("WAIT A MOMENT");
      this.last.set(client.sessionId,now);player.x=x;player.y=y;player.z=z;player.rotationY=rotationY;player.avatarFlying=false;
      client.send("vr:teleport:result",{requestId:id,ok:true,x,y,z,rotationY});after(client);
    });
  }
  leave(client:any){this.last.delete(client.sessionId);}
}
