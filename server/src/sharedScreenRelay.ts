// ROOM-scoped signalling and bounded JPEG fallback. Live content is never persisted.
export class SharedScreenRelay {
  private watchers=new Set<string>();private imageOnly=new Set<string>();private fallback=new Set<string>();private publisher="";private epoch="";private counter=0;private lastFrameAt=-Infinity;
  private event:(name:string)=>string;private host:any;private canPublish:(client:any)=>boolean;
  constructor(host:any,canPublish:(client:any)=>boolean,channel="screen"){
    const event=(name:string)=>channel+name.slice("screen".length);this.event=event;
    this.host={get clients(){return host.clients;},broadcast:(name:string,payload:any)=>host.broadcast(event(name),payload)};this.canPublish=canPublish;
    const on=(name:string,handler:(client:any,payload:any)=>void)=>host.onMessage(event(name),handler);
    on("screen:watch",(client,payload)=>{if(payload?.enabled===false){this.watchers.delete(client.sessionId);this.fallback.delete(client.sessionId);this.imageOnly.delete(client.sessionId);}else {this.watchers.add(client.sessionId);this.fallback.add(client.sessionId);if(payload?.mode==="images")this.imageOnly.add(client.sessionId);else this.imageOnly.delete(client.sessionId);}client.send(event("screen:state"),this.state());this.viewers();});
    on("screen:publish",(client)=>{
      if(!this.canPublish(client)){client.send(event("screen:result"),{ok:false,reason:"owner-required"});return;}
      if(this.publisher&&this.publisher!==client.sessionId){client.send(event("screen:result"),{ok:false,reason:"publisher-busy"});return;}
      if(!this.publisher){this.publisher=client.sessionId;this.epoch=`${client.sessionId}:${++this.counter}`;this.lastFrameAt=-Infinity;this.fallback=new Set([...this.watchers].filter(id=>id!==this.publisher));}
      this.host.broadcast("screen:state",this.state());this.viewers();
    });
    on("screen:stop",(client,payload)=>{if(this.publisher===client.sessionId&&(!payload?.epoch||payload.epoch===this.epoch))this.stop();});
    on("screen:fallback",(client,payload)=>{if(!this.validEpoch(payload)||!this.watchers.has(client.sessionId)||client.sessionId===this.publisher)return;if(payload?.enabled===false)this.fallback.delete(client.sessionId);else this.fallback.add(client.sessionId);this.viewers();});
    on("screen:signal",(client,payload)=>{
      if(!this.validEpoch(payload))return;const targetId=String(payload?.targetSessionId||"");const target=this.host.clients.find((c:any)=>c.sessionId===targetId);if(!target)return;
      const sending=client.sessionId===this.publisher&&this.watchers.has(targetId),receiving=targetId===this.publisher&&this.watchers.has(client.sessionId);if(!sending&&!receiving)return;
      const linkId=String(payload?.linkId||"");if(!/^[A-Za-z0-9:_-]{1,80}$/.test(linkId))return;
      const base={fromSessionId:client.sessionId,epoch:this.epoch,linkId};
      if(payload?.description){const {type,sdp}=payload.description;if((sending&&type!=="offer")||(receiving&&type!=="answer")||typeof sdp!=="string"||sdp.length>65536)return;target.send(event("screen:signal"),{...base,description:{type,sdp}});}
      else if(payload?.candidate){const candidate=payload.candidate;if(typeof candidate.candidate!=="string"||candidate.candidate.length>2048)return;target.send(event("screen:signal"),{...base,candidate:{candidate:candidate.candidate,sdpMid:typeof candidate.sdpMid==="string"?candidate.sdpMid.slice(0,64):null,sdpMLineIndex:Number.isInteger(candidate.sdpMLineIndex)?candidate.sdpMLineIndex:null}});}
    });
    on("screen:frame",(client,payload)=>{
      if(client.sessionId!==this.publisher||!this.validEpoch(payload)||!this.canPublish(client))return;
      const now=Date.now();if(now-this.lastFrameAt<250)return;const data=payload?.data,sequence=payload?.sequence;
      if(typeof data!=="string"||data.length>90000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)||!Number.isSafeInteger(sequence)||sequence<0)return;
      this.lastFrameAt=now;for(const target of this.host.clients)if(this.fallback.has(target.sessionId)&&this.watchers.has(target.sessionId))target.send(event("screen:frame"),{epoch:this.epoch,sequence,data});
    });
  }
  private validEpoch(payload:any){return !!this.publisher&&payload?.epoch===this.epoch;}
  private state(){return {publisherSessionId:this.publisher,epoch:this.epoch};}
  private viewers(){const client=this.host.clients.find((c:any)=>c.sessionId===this.publisher);client?.send(this.event("screen:viewers"),{epoch:this.epoch,viewers:[...this.watchers].filter(id=>id!==this.publisher&&this.host.clients.some((c:any)=>c.sessionId===id)),rtcViewers:[...this.watchers].filter(id=>id!==this.publisher&&!this.imageOnly.has(id)&&this.host.clients.some((c:any)=>c.sessionId===id)),fallback:[...this.fallback]});}
  private stop(){this.publisher="";this.epoch="";this.fallback.clear();this.host.broadcast("screen:state",this.state());}
  leave(client:any){this.watchers.delete(client.sessionId);this.fallback.delete(client.sessionId);this.imageOnly.delete(client.sessionId);if(client.sessionId===this.publisher)this.stop();else this.viewers();}
}
