import { Room, type Client } from "colyseus";
import { Player, SharedMediaObject, WorldState } from "./state.js";

const MAX_STEP = 0.75;
const MAX_MEDIA_OBJECTS = 64;

type AddMediaPayload = {
  id?: string;
  title?: string;
  type?: string;
  assetRef?: string;
  fallbackRef?: string;
  x?: number;
  y?: number;
  z?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scale?: number;
  groupName?: string;
  tags?: string;
};

type UpdateMediaPayload = {
  id?: string; x?: number; y?: number; z?: number; rotationX?: number; rotationY?: number; rotationZ?: number; scale?: number; assetRef?: string;
};
type DeleteMediaPayload = { id?: string };
type MediaActionPayload = {
  id?: string;
  action?: string;
  source?: string;
  params?: { amount?: number; speed?: number; axis?: string; duration?: number };
};
type SceneMediaState = {
  x:number;y:number;z:number;rotationX:number;rotationY:number;rotationZ:number;scale:number;
  groupName:string;tags:string;behavior:Record<string,unknown>|null;
};
type SceneSnapshot = {
  id:string;name:string;updatedAt:number;environment:Record<string,unknown>;
  media:Record<string,SceneMediaState>;
};
type CueDefinition = {
  id:string;name:string;targetType:"scene"|"group"|"tag";target:string;
  action:"recall"|"play"|"stop"|"move"|"rotate"|"scale"|"float"|"orbit"|"shake";
  updatedAt:number;
};

export class SharedWorldRoom extends Room<WorldState> {
  private scenes = new Map<string,SceneSnapshot>();
  private cues = new Map<string,CueDefinition>();
  private environmentOwnerClientId = "";
  private environment = {
    sky:"#090c11", ground:"#262b33", grid:"#474d57", gridVisible:true,
    ambient:0.45, sunlight:1.5, lightColor:"#ffffff", sunAngle:45,
    skyMode:"color", skyAssetRef:"", groundMode:"plain", groundSize:15,
    groundAssetRef:"", particles:"off", particleCount:16,
    particleDuration:0,particleRadius:5,particleSpeed:1,particleSize:1,
    particleColor:"#ffbb55",particleAssetRef:"",
    environmentPreset:"custom",cycleEnabled:false,cycleMinutes:8,cycleStartedAt:0,
    fogEnabled:false,fogColor:"#b8cbd9",fogDensity:0.75,fogDistance:12,
    groundRepeat:1,groundRotation:0
  };
  private particleEndTimer:ReturnType<typeof setTimeout>|null=null;
  private scheduleParticleEnd() {
    if(this.particleEndTimer) clearTimeout(this.particleEndTimer);
    this.particleEndTimer=null;
    if(this.environment.particles==="off" || this.environment.particleDuration<=0) return;
    this.particleEndTimer=setTimeout(()=>{
      this.particleEndTimer=null;
      this.environment={...this.environment,particles:"off"};
      this.broadcast("environment:state",this.environment);
    },this.environment.particleDuration*1000);
  }
  private worldLimit(size:number=this.environment.groundSize) { return Math.max(6.5,size/2-1); }
  private environmentActorId(client:Client) {
    const player=this.state.players.get(client.sessionId);
    return player?.clientId || `session:${client.sessionId}`;
  }
  private canEditEnvironment(client:Client,claim=false) {
    const actorId=this.environmentActorId(client);
    if(!this.environmentOwnerClientId&&claim)this.environmentOwnerClientId=actorId;
    return !this.environmentOwnerClientId||this.environmentOwnerClientId===actorId;
  }
  private sendEnvironmentPermissions(target?:Client) {
    const recipients=target?[target]:this.clients;
    const ownerPresent=!!this.environmentOwnerClientId&&this.clients.some(
      item=>this.environmentActorId(item)===this.environmentOwnerClientId);
    for(const item of recipients)item.send("environment:permissions",{
      locked:!!this.environmentOwnerClientId,
      canEdit:this.canEditEnvironment(item,false),
      ownerPresent
    });
  }
  private cleanMediaGroup(value:unknown) {
    return String(value ?? "").trim().replace(/\s+/g," ").slice(0,32);
  }
  private cleanMediaTags(value:unknown) {
    const source=Array.isArray(value)?value.join(","):String(value ?? "");
    const seen=new Set<string>();const tags:string[]=[];
    for(const raw of source.split(/[,，]/)) {
      const tag=raw.trim().replace(/^#+/,"").replace(/\s+/g," ").slice(0,24);
      const key=tag.toLocaleLowerCase();
      if(tag&&!seen.has(key)){seen.add(key);tags.push(tag);}
      if(tags.length>=8)break;
    }
    return tags.join(",").slice(0,199);
  }
  private sceneList() {
    return Array.from(this.scenes.values()).map(scene=>({
      id:scene.id,name:scene.name,updatedAt:scene.updatedAt,objectCount:Object.keys(scene.media).length
    })).sort((a,b)=>b.updatedAt-a.updatedAt);
  }
  private sendSceneList(target?:Client) {
    const payload={scenes:this.sceneList()};
    if(target)target.send("scene:list",payload);else this.broadcast("scene:list",payload);
  }
  private captureScene(id:string,name:string):SceneSnapshot {
    const media:Record<string,SceneMediaState>={};
    for(const [mediaId,item] of this.state.mediaObjects) media[mediaId]={
      x:item.x,y:item.y,z:item.z,rotationX:item.rotationX,rotationY:item.rotationY,rotationZ:item.rotationZ,scale:item.scale,
      groupName:item.groupName,tags:item.tags,behavior:{...(this.mediaBehaviors.get(mediaId)||{})}
    };
    return {id,name,updatedAt:Date.now(),environment:{...this.environment},media};
  }
  private cueList() {return Array.from(this.cues.values()).sort((a,b)=>b.updatedAt-a.updatedAt);}
  private sendCueList(target?:Client) {
    const groups=new Set<string>(),tags=new Set<string>();
    for(const media of this.state.mediaObjects.values()){
      if(media.groupName.trim())groups.add(media.groupName.trim());
      for(const tag of media.tags.split(",")){const value=tag.trim();if(value)tags.add(value);}
    }
    const payload={cues:this.cueList(),groups:Array.from(groups).sort(),tags:Array.from(tags).sort()};
    if(target)target.send("cue:list",payload);else this.broadcast("cue:list",payload);
  }
  private recallScene(scene:SceneSnapshot) {
    const nextEnvironment=this.cleanEnvironment(scene.environment);
    if(nextEnvironment){
      if(nextEnvironment.cycleEnabled)nextEnvironment.cycleStartedAt=Date.now();
      this.environment=nextEnvironment;this.scheduleParticleEnd();this.broadcast("environment:state",nextEnvironment);
    }
    let count=0;
    for(const [mediaId,saved] of Object.entries(scene.media)){
      const media=this.state.mediaObjects.get(mediaId);if(!media)continue;
      media.x=saved.x;media.y=saved.y;media.z=saved.z;media.rotationX=saved.rotationX;
      media.rotationY=saved.rotationY;media.rotationZ=saved.rotationZ;media.scale=saved.scale;
      media.groupName=saved.groupName;media.tags=saved.tags;
      if(saved.behavior)this.mediaBehaviors.set(mediaId,{...saved.behavior});
      this.broadcast("media:transform",{id:mediaId,x:media.x,y:media.y,z:media.z,rotationX:media.rotationX,rotationY:media.rotationY,rotationZ:media.rotationZ,scale:media.scale});
      this.broadcast("media:metadata",{id:mediaId,groupName:media.groupName,tags:media.tags});
      if(saved.behavior)this.broadcast("media:behavior",{id:mediaId,behavior:saved.behavior});
      count++;
    }
    this.broadcast("scene:recalled",{id:scene.id,name:scene.name,count});return count;
  }
  private cleanEnvironment(input:any) {
    if (!input || typeof input!=="object") return null;
    const color=(value:unknown,fallback:string)=>
      typeof value==="string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
    const number=(value:unknown,fallback:number,min:number,max:number)=>{
      const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
    };
    return {
      sky:color(input.sky,this.environment.sky),
      ground:color(input.ground,this.environment.ground),
      grid:color(input.grid,this.environment.grid),
      gridVisible:input.gridVisible===false?false:true,
      ambient:number(input.ambient,this.environment.ambient,0,1.5),
      sunlight:number(input.sunlight,this.environment.sunlight,0,5),
      lightColor:color(input.lightColor,this.environment.lightColor),
      sunAngle:number(input.sunAngle,this.environment.sunAngle,5,85),
      skyMode:input.skyMode==="panorama"?"panorama":"color",
      skyAssetRef:typeof input.skyAssetRef==="string" && input.skyAssetRef.length<=240 &&
        /^https?:\/\/[^\s]+\/assets\/[a-zA-Z0-9_-]{1,80}\.zip$/.test(input.skyAssetRef)
        ?input.skyAssetRef:"",
      groundMode:["plain","soil","water","custom"].includes(input.groundMode)?input.groundMode:"plain",
      groundSize:[15,60,160].includes(Number(input.groundSize))?Number(input.groundSize):15,
      groundAssetRef:typeof input.groundAssetRef==="string" && input.groundAssetRef.length<=240 &&
        /^https?:\/\/[^\s]+\/assets\/[a-zA-Z0-9_-]{1,80}\.zip$/.test(input.groundAssetRef)
        ?input.groundAssetRef:"",
      particles:["off","spark","smoke","custom"].includes(input.particles)?input.particles:"off",
      particleCount:Math.round(number(input.particleCount,16,1,64)),
      particleDuration:number(input.particleDuration,0,0,300),
      particleRadius:number(input.particleRadius,5,1,20),
      particleSpeed:number(input.particleSpeed,1,0.1,4),
      particleSize:number(input.particleSize,1,0.2,4),
      particleColor:color(input.particleColor,"#ffbb55"),
      particleAssetRef:typeof input.particleAssetRef==="string" && input.particleAssetRef.length<=240 &&
        /^https?:\/\/[^\s]+\/assets\/[a-zA-Z0-9_-]{1,80}\.zip$/.test(input.particleAssetRef)
        ?input.particleAssetRef:"",
      environmentPreset:["custom","morning","day","sunset","night"].includes(input.environmentPreset)
        ?input.environmentPreset:"custom",
      cycleEnabled:input.cycleEnabled===true,
      cycleMinutes:number(input.cycleMinutes,8,1,60),
      cycleStartedAt:number(input.cycleStartedAt,0,0,Date.now()+60000),
      fogEnabled:input.fogEnabled===true,
      fogColor:color(input.fogColor,"#b8cbd9"),
      fogDensity:number(input.fogDensity,.75,.05,1),
      fogDistance:number(input.fogDistance,12,3,200),
      groundRepeat:number(input.groundRepeat,1,.2,10),
      groundRotation:number(input.groundRotation,0,0,360)
    };
  }
  private mediaBehaviors = new Map<string, Record<string, unknown>>();
  private proximityActors = new Map<string, Set<string>>();
  private mediaActionSequence = 0;
  private avatarEmoteSequence = 0;
  private avatarEmoteLastAt = new Map<string,number>();
  private avatarMessageLastAt = new Map<string,number>();
  private evaluateProximity(client:Client) {
    const player=this.state.players.get(client.sessionId);
    if (!player) return;
    for (const [id,media] of this.state.mediaObjects) {
      const behavior=this.mediaBehaviors.get(id);
      if (!behavior || behavior.enabled!==true || behavior.trigger!=="user-proximity") continue;
      const actors=this.proximityActors.get(id) || new Set<string>();
      const previous=actors.has(client.sessionId);
      const threshold=Number(behavior.distance ?? 3);
      const distance=Math.hypot(player.x-media.x,player.y-media.y,player.z-media.z);
      const inside=distance<=threshold+(previous ? 0.25 : 0);
      if (inside===previous) continue;
      if (inside) actors.add(client.sessionId);
      else actors.delete(client.sessionId);
      if (actors.size) this.proximityActors.set(id,actors);
      else this.proximityActors.delete(id);
      const action=String(inside?behavior.enterAction:behavior.leaveAction);
      if (action==="none" || (!inside && action==="stop" && actors.size>0) ||
          (inside && action==="play" && actors.size>1)) continue;
      const params={
        amount:Number(behavior.transformAmount ?? 1),
        speed:Number(behavior.transformSpeed ?? 1),
        axis:String(behavior.transformAxis ?? "y"),
        duration:Number(behavior.transformDuration ?? 3)
      };
      const event={id,action,source:inside?"user-proximity-enter":"user-proximity-leave",
        params,actorSessionId:client.sessionId,eventId:++this.mediaActionSequence};
      this.broadcast("media:action",event);
      client.send("media:action",event);
    }
  }
  private leaveProximity(sessionId:string) {
    for (const [id, actors] of this.proximityActors) {
      if (!actors.delete(sessionId)) continue;
      if (!actors.size) {
        this.proximityActors.delete(id);
        const action=String(this.mediaBehaviors.get(id)?.leaveAction || "stop");
        if (this.state.mediaObjects.has(id) && action !== "none")
          this.broadcast("media:action",{id,action,source:"user-proximity-leave",actorSessionId:sessionId,eventId:++this.mediaActionSequence});
      }
    }
  }
  // Transport headroom is intentionally larger than the UI's logical 4-user target.
  // It prevents a stale mobile WebSocket from forcing joinOrCreate() into a second room
  // before the server can de-duplicate the returning client.
  maxClients = 12;
  autoDispose = false;
  state = new WorldState();

  onCreate(options: { roomCode?: string }) {
    this.setMetadata({ roomCode: String(options.roomCode || "ART001").toUpperCase() });

    // Prototype 0.14.7.1
    // Register messages explicitly so custom message types such as
    // "media:add" are guaranteed to reach this Room on Colyseus 0.18.
    this.onMessage("move", (
      client: Client,
      payload: { x?: number; y?: number; z?: number; rotationY?: number; flying?: boolean; seq?: number }
    ) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const nextX = Number(payload?.x);
      const nextY = payload?.y === undefined ? player.y : Number(payload.y);
      const nextZ = Number(payload?.z);
      const nextRotationY = Number(payload?.rotationY);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextZ)) return;
      if (!Number.isFinite(nextRotationY)) return;

      const clampedX = Math.max(-this.worldLimit(), Math.min(this.worldLimit(), nextX));
      const clampedZ = Math.max(-this.worldLimit(), Math.min(this.worldLimit(), nextZ));
      const dx = clampedX - player.x;
      const dz = clampedZ - player.z;
      const distance = Math.hypot(dx, dz);
      const clampedY=Math.max(0.65,Math.min(8.65,nextY));
      const dy=Math.abs(clampedY-player.y);

      if (distance > MAX_STEP || dy > MAX_STEP || nextY<0.65 || nextY>8.65) {
        client.send("move:ack",{seq:payload?.seq,ok:false,x:player.x,y:player.y,z:player.z,rotationY:player.rotationY});
        return;
      }

      player.x = clampedX;
      player.y = clampedY;
      player.z = clampedZ;
      player.rotationY = nextRotationY;
      player.avatarFlying=payload?.flying===true;
      client.send("move:ack",{seq:payload?.seq,ok:true,x:player.x,y:player.y,z:player.z,rotationY:player.rotationY});
      this.evaluateProximity(client);
    });

    this.onMessage("avatar:style",(client:Client,payload:any)=>{
      const player=this.state.players.get(client.sessionId);
      if(!player || !payload || typeof payload!=="object") return;
      const color=(input:unknown,fallback:string)=>typeof input==="string" &&
        /^#[0-9a-fA-F]{6}$/.test(input)?input.toLowerCase():fallback;
      player.avatarColor=color(payload.color,player.avatarColor);
      player.avatarAccent=color(payload.accent,player.avatarAccent);
      player.avatarShape=["sphere","capsule","box"].includes(payload.shape)?payload.shape:player.avatarShape;
      player.avatarAssetRef=typeof payload.assetRef==="string" && payload.assetRef.length<=240 &&
        /^https?:\/\/[^\s]+\/assets\/[a-zA-Z0-9_-]{1,80}\.zip$/.test(payload.assetRef)
        ?payload.assetRef:"";
      const bounded=(input:unknown,fallback:number,min:number,max:number)=>{
        const value=Number(input);return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
      };
      player.avatarSize=bounded(payload.size,player.avatarSize,.5,2);
      player.avatarLabelVisible=payload.labelVisible!==false;
      player.avatarLabelColor=color(payload.labelColor,player.avatarLabelColor);
      player.avatarTextureRepeat=bounded(payload.textureRepeat,player.avatarTextureRepeat,.25,8);
      player.avatarTextureRotation=bounded(payload.textureRotation,player.avatarTextureRotation,0,360);
      player.avatarPart=["none","arms","wings","antenna"].includes(payload.part)
        ?payload.part:player.avatarPart;
      player.avatarPartColor=color(payload.partColor,player.avatarPartColor);
      player.avatarHaloColor=color(payload.haloColor,player.avatarHaloColor);
      player.avatarHaloOpacity=bounded(payload.haloOpacity,player.avatarHaloOpacity,.05,1);
      player.avatarHaloSize=bounded(payload.haloSize,player.avatarHaloSize,.5,4);
      player.avatarHaloMotion=["static","pulse","orbit","float"].includes(payload.haloMotion)
        ?payload.haloMotion:player.avatarHaloMotion;
      player.avatarHaloSpeed=bounded(payload.haloSpeed,player.avatarHaloSpeed,.1,4);
      player.avatarHaloShape=["ring","disc","ripple"].includes(payload.haloShape)
        ?payload.haloShape:player.avatarHaloShape;
      player.avatarHaloGlow=bounded(payload.haloGlow,player.avatarHaloGlow,0,2);
      player.avatarHaloRings=Math.round(bounded(payload.haloRings,player.avatarHaloRings,1,3));
      player.avatarHeartColor=color(payload.heartColor,player.avatarHeartColor);
      player.avatarHeartSize=bounded(payload.heartSize,player.avatarHeartSize,.3,2.5);
      player.avatarHeartCount=Math.round(bounded(payload.heartCount,player.avatarHeartCount,1,8));
      player.avatarHeartMotion=["float","orbit","burst"].includes(payload.heartMotion)
        ?payload.heartMotion:player.avatarHeartMotion;
      player.avatarHeartSpeed=bounded(payload.heartSpeed,player.avatarHeartSpeed,.2,3);
      this.broadcast("avatar:style:applied",{
        sessionId:client.sessionId,
        color:player.avatarColor,accent:player.avatarAccent,
        shape:player.avatarShape,assetRef:player.avatarAssetRef,
        size:player.avatarSize,labelVisible:player.avatarLabelVisible,
        labelColor:player.avatarLabelColor,textureRepeat:player.avatarTextureRepeat,
        textureRotation:player.avatarTextureRotation,
        part:player.avatarPart,partColor:player.avatarPartColor,
        haloColor:player.avatarHaloColor,haloOpacity:player.avatarHaloOpacity,
        haloSize:player.avatarHaloSize,haloMotion:player.avatarHaloMotion,
        haloSpeed:player.avatarHaloSpeed,haloShape:player.avatarHaloShape,
        haloGlow:player.avatarHaloGlow,haloRings:player.avatarHaloRings,
        heartColor:player.avatarHeartColor,heartSize:player.avatarHeartSize,
        heartCount:player.avatarHeartCount,heartMotion:player.avatarHeartMotion,
        heartSpeed:player.avatarHeartSpeed
      });
    });

    this.onMessage("avatar:emote",(client:Client,payload:any)=>{
      if(!this.state.players.has(client.sessionId)) return;
      const type=String(payload?.type||"").toLowerCase();
      if(!["wave","joy","spin"].includes(type)) return;
      const now=Date.now();
      if(now-(this.avatarEmoteLastAt.get(client.sessionId)||0)<450) return;
      this.avatarEmoteLastAt.set(client.sessionId,now);
      this.broadcast("avatar:emote",{sessionId:client.sessionId,type,
        eventId:++this.avatarEmoteSequence});
    });

    this.onMessage("avatar:message",(client:Client,payload:any)=>{
      if(!this.state.players.has(client.sessionId))return;
      const now=Date.now();
      if(now-(this.avatarMessageLastAt.get(client.sessionId)||0)<700)return;
      const text=String(payload?.text||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,48);
      if(!text)return;
      this.avatarMessageLastAt.set(client.sessionId,now);
      this.broadcast("avatar:message",{sessionId:client.sessionId,text,sentAt:now});
    });

    // 0.20.4 / Flashlight item. Keep the switch in authoritative player
    // state so late joiners and reconnecting phones see the same light.
    this.onMessage("avatar:flashlight",(client:Client,payload:any)=>{
      const player=this.state.players.get(client.sessionId);if(!player)return;
      player.avatarFlashlightOn=payload?.enabled===true;
    });

    // 0.20.0 / WebRTC signaling only. Audio never passes through Colyseus.
    this.onMessage("voice:ready",(client:Client)=>{
      if(this.state.players.has(client.sessionId))
        this.broadcast("voice:ready",{sessionId:client.sessionId},{except:client});
    });
    this.onMessage("voice:leave",(client:Client)=>{
      this.broadcast("voice:leave",{sessionId:client.sessionId},{except:client});
    });
    this.onMessage("voice:signal",(client:Client,payload:any)=>{
      if(!this.state.players.has(client.sessionId))return;
      const targetSessionId=String(payload?.targetSessionId||"");
      if(!targetSessionId||targetSessionId===client.sessionId)return;
      const target=this.clients.find(item=>item.sessionId===targetSessionId);if(!target)return;
      const description=payload?.description&&typeof payload.description==="object"?payload.description:null;
      const candidate=payload?.candidate&&typeof payload.candidate==="object"?payload.candidate:null;
      if(description) {
        const type=String(description.type||"");const sdp=String(description.sdp||"");
        if(!["offer","answer"].includes(type)||!sdp||sdp.length>16000)return;
        target.send("voice:signal",{fromSessionId:client.sessionId,description:{type,sdp}});
      } else if(candidate) {
        const candidateText=String(candidate.candidate||"");
        if(candidateText.length>2500)return;
        target.send("voice:signal",{fromSessionId:client.sessionId,candidate:{
          candidate:candidateText,sdpMid:typeof candidate.sdpMid==="string"?candidate.sdpMid:null,
          sdpMLineIndex:Number.isInteger(candidate.sdpMLineIndex)?candidate.sdpMLineIndex:null
        }});
      }
    });

    this.onMessage("media:add", (client: Client, payload: AddMediaPayload) => {
      console.log("[media:add received]", client.sessionId, payload?.id);

      if (this.state.mediaObjects.size >= MAX_MEDIA_OBJECTS) {
        console.warn("[media:add rejected] media object limit reached");
        return;
      }

      const id = String(payload?.id || "").trim().slice(0, 80);
      if (!id || this.state.mediaObjects.has(id)) {
        console.warn("[media:add rejected] invalid or duplicate id", id);
        return;
      }

      const mediaType = String(payload?.type || "");
      if (mediaType !== "sprite" && mediaType !== "glb" && mediaType !== "webm" && mediaType !== "audio") {
        console.warn("[media:add rejected] unsupported type", payload?.type);
        return;
      }

      const x = Number(payload?.x);
      const y = Number(payload?.y);
      const z = Number(payload?.z);
      const rotationX = Number(payload?.rotationX ?? (mediaType === "glb" || mediaType === "audio" ? 0 : 90));
      const rotationY = Number(payload?.rotationY);
      const rotationZ = Number(payload?.rotationZ ?? 0);
      const scale = Number(payload?.scale);

      if (![x, y, z, rotationX, rotationY, rotationZ, scale].every(Number.isFinite)) {
        console.warn("[media:add rejected] invalid transform", payload);
        return;
      }

      this.state.mediaObjects.set(id, new SharedMediaObject({
        title: String(payload?.title || "Sprite Artwork").slice(0, 80),
        type: mediaType,
        assetRef: String(payload?.assetRef || "").slice(0, 240),
        fallbackRef: String(payload?.fallbackRef || "").slice(0, 240),
        ownerSessionId: client.sessionId,
        ownerClientId: this.state.players.get(client.sessionId)?.clientId || "",
        groupName: this.cleanMediaGroup(payload?.groupName),
        tags: this.cleanMediaTags(payload?.tags),
        x: Math.max(-this.worldLimit(), Math.min(this.worldLimit(), x)),
        y: Math.max(-10, Math.min(20, y)),
        z: Math.max(-this.worldLimit(), Math.min(this.worldLimit(), z)),
        rotationX,
        rotationY,
        rotationZ,
        scale: Math.max(0.05, Math.min(20, scale))
      }));

      console.log("[media:add stored]", id, "total:", this.state.mediaObjects.size);
      this.mediaBehaviors.set(id, { trigger:"user-proximity", distance:3, enterAction:"play", leaveAction:"stop", enabled:true });
    });

    // 0.20.7 / GROUP + TAG metadata. The room environment owner curates the
    // classification used by future CUE and external-control systems.
    this.onMessage("media:metadata",(client:Client,payload:any)=>{
      const id=String(payload?.id||"").trim().slice(0,80);
      const media=this.state.mediaObjects.get(id);
      if(!media){client.send("media:metadata:result",{id,ok:false,reason:"media-not-found"});return;}
      if(!this.canEditEnvironment(client,true)){
        client.send("media:metadata:result",{id,ok:false,reason:"owner-locked"});
        this.sendEnvironmentPermissions(client);return;
      }
      media.groupName=this.cleanMediaGroup(payload?.groupName);
      media.tags=this.cleanMediaTags(payload?.tags);
      const metadata={id,groupName:media.groupName,tags:media.tags};
      this.broadcast("media:metadata",metadata);
      client.send("media:metadata:result",{...metadata,ok:true});
      this.sendCueList();
      this.sendEnvironmentPermissions();
    });

    // 0.20.8 / Authoritative named scenes for later CUE control.
    this.onMessage("scene:list:request",(client:Client)=>this.sendSceneList(client));
    this.onMessage("scene:save",(client:Client,payload:any)=>{
      if(!this.canEditEnvironment(client,true)){
        client.send("scene:result",{ok:false,action:"save",reason:"owner-locked"});return;
      }
      const name=String(payload?.name||"").trim().replace(/\s+/g," ").slice(0,32);
      if(!name){client.send("scene:result",{ok:false,action:"save",reason:"name-required"});return;}
      let id=String(payload?.id||"").trim().slice(0,80);
      if(id&&!this.scenes.has(id))id="";
      if(!id&&this.scenes.size>=12){client.send("scene:result",{ok:false,action:"save",reason:"scene-limit"});return;}
      if(!id)id=`scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
      this.scenes.set(id,this.captureScene(id,name));
      client.send("scene:result",{ok:true,action:"save",id,name});this.sendSceneList();this.sendEnvironmentPermissions();
    });
    this.onMessage("scene:recall",(client:Client,payload:any)=>{
      if(!this.canEditEnvironment(client,false)){
        client.send("scene:result",{ok:false,action:"recall",reason:"owner-locked"});return;
      }
      const id=String(payload?.id||"");const scene=this.scenes.get(id);
      if(!scene){client.send("scene:result",{ok:false,action:"recall",reason:"scene-not-found"});return;}
      const count=this.recallScene(scene);
      client.send("scene:result",{ok:true,action:"recall",id,name:scene.name,count});
    });
    this.onMessage("scene:delete",(client:Client,payload:any)=>{
      if(!this.canEditEnvironment(client,false)){
        client.send("scene:result",{ok:false,action:"delete",reason:"owner-locked"});return;
      }
      const id=String(payload?.id||"");
      if(!this.scenes.delete(id)){client.send("scene:result",{ok:false,action:"delete",reason:"scene-not-found"});return;}
      client.send("scene:result",{ok:true,action:"delete",id});this.sendSceneList();
    });

    // 0.20.9 / CUE system. Cues are server-authoritative, owner-operated and
    // target a scene or all media sharing one GROUP / TAG classification.
    this.onMessage("cue:list:request",(client:Client)=>this.sendCueList(client));
    this.onMessage("cue:save",(client:Client,payload:any)=>{
      if(!this.canEditEnvironment(client,true)){client.send("cue:result",{ok:false,operation:"save",reason:"owner-locked"});return;}
      const name=String(payload?.name||"").trim().replace(/\s+/g," ").slice(0,32);
      const targetType=String(payload?.targetType||"");
      const validActions=["play","stop","move","rotate","scale","float","orbit","shake"];
      let target=String(payload?.target||"").trim().slice(0,80);
      let action=String(payload?.action||"");
      if(targetType==="scene")action="recall";
      if(targetType==="group"){
        const requested=this.cleanMediaGroup(target).toLocaleLowerCase();
        target=Array.from(this.state.mediaObjects.values()).map(media=>media.groupName)
          .find(group=>!!group&&group.toLocaleLowerCase()===requested)||"";
      } else if(targetType==="tag"){
        const requested=this.cleanMediaTags(target).split(",")[0]?.toLocaleLowerCase()||"";
        let canonical="";
        for(const media of this.state.mediaObjects.values())for(const tag of media.tags.split(","))
          if(tag.trim().toLocaleLowerCase()===requested){canonical=tag.trim();break;}
        target=canonical;
      }
      if(!name||!["scene","group","tag"].includes(targetType)||!target||
        (targetType==="scene"?!this.scenes.has(target):!validActions.includes(action))){
        client.send("cue:result",{ok:false,operation:"save",reason:"invalid-cue"});return;
      }
      let id=String(payload?.id||"").trim().slice(0,80);if(id&&!this.cues.has(id))id="";
      if(!id&&this.cues.size>=24){client.send("cue:result",{ok:false,operation:"save",reason:"cue-limit"});return;}
      if(!id)id=`cue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
      const cue={id,name,targetType:targetType as CueDefinition["targetType"],target,
        action:action as CueDefinition["action"],updatedAt:Date.now()};
      this.cues.set(id,cue);client.send("cue:result",{ok:true,operation:"save",...cue});this.sendCueList();this.sendEnvironmentPermissions();
    });
    this.onMessage("cue:fire",(client:Client,payload:any)=>{
      if(!this.canEditEnvironment(client,false)){client.send("cue:result",{ok:false,operation:"fire",reason:"owner-locked"});return;}
      const id=String(payload?.id||"");const cue=this.cues.get(id);
      if(!cue){client.send("cue:result",{ok:false,operation:"fire",reason:"cue-not-found"});return;}
      let count=0;
      if(cue.targetType==="scene"){
        const scene=this.scenes.get(cue.target);if(!scene){client.send("cue:result",{ok:false,operation:"fire",reason:"scene-not-found"});return;}
        count=this.recallScene(scene);
      } else {
        const target=cue.target.toLocaleLowerCase();
        for(const [mediaId,media] of this.state.mediaObjects){
          const matches=cue.targetType==="group"?media.groupName.toLocaleLowerCase()===target:
            media.tags.split(",").some(tag=>tag.trim().toLocaleLowerCase()===target);
          if(!matches)continue;
          this.broadcast("media:action",{id:mediaId,action:cue.action,source:`cue-${cue.targetType}`,actorSessionId:client.sessionId,eventId:++this.mediaActionSequence});count++;
        }
      }
      this.broadcast("cue:fired",{id:cue.id,name:cue.name,count,targetType:cue.targetType,action:cue.action});
      client.send("cue:result",{ok:true,operation:"fire",id:cue.id,name:cue.name,count});
    });
    this.onMessage("cue:delete",(client:Client,payload:any)=>{
      if(!this.canEditEnvironment(client,false)){client.send("cue:result",{ok:false,operation:"delete",reason:"owner-locked"});return;}
      const id=String(payload?.id||"");if(!this.cues.delete(id)){client.send("cue:result",{ok:false,operation:"delete",reason:"cue-not-found"});return;}
      client.send("cue:result",{ok:true,operation:"delete",id});this.sendCueList();
    });

    this.onMessage("media:behavior", (client: Client, payload: any) => {
      const id = String(payload?.id || "").trim().slice(0, 80);
      const media = this.state.mediaObjects.get(id);
      const player = this.state.players.get(client.sessionId);
      if (!media || !(media.ownerSessionId === client.sessionId ||
        (media.ownerClientId && player?.clientId && media.ownerClientId === player.clientId))) return;
      const input = payload?.behavior || {};
      const trigger = String(input.trigger || "");
      const enterAction = String(input.enterAction || "");
      const leaveAction = String(input.leaveAction || "");
      const triggers = ["user-proximity", "look-at", "touch"];
      const actions = ["play", "stop", "move", "rotate", "scale", "float", "orbit", "shake", "none"];
      if (!triggers.includes(trigger) || !actions.includes(enterAction) || !actions.includes(leaveAction)) return;
      const bounded = (v:unknown, fallback:number, min:number, max:number) => {
        const n=Number(v); return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
      };
      const behavior = {
        trigger, enterAction, leaveAction, enabled: input.enabled === true,
        distance: bounded(input.distance,3,.1,30),
        lookAngle: bounded(input.lookAngle,12,1,89),
        touchMode: input.touchMode === "repeat" ? "repeat" : "toggle",
        transformAmount: bounded(input.transformAmount,1,0,20),
        transformSpeed: bounded(input.transformSpeed,1,.1,20),
        transformAxis: ["x","y","z"].includes(input.transformAxis) ? input.transformAxis : "y",
        transformDuration: bounded(input.transformDuration,3,.1,60)
      };
      this.mediaBehaviors.set(id, behavior);
      this.proximityActors.delete(id);
      this.broadcast("media:behavior", {id, behavior});
    });


    this.onMessage("media:update", (client: Client, payload: UpdateMediaPayload) => {
      const id = String(payload?.id || "").trim().slice(0, 80);
      const media = this.state.mediaObjects.get(id);
      const player = this.state.players.get(client.sessionId);
      const authorized = !!media && (
        media.ownerSessionId === client.sessionId ||
        (!!media.ownerClientId && !!player?.clientId && media.ownerClientId === player.clientId)
      );
      if (!media || !authorized) {
        console.warn("[media:update rejected]", id);
        client.send("media:update:result", {id, ok:false, reason:media ? "owner-mismatch" : "media-not-found"});
        return;
      }
      const x=Number(payload?.x), y=Number(payload?.y), z=Number(payload?.z);
      const rotationX=Number(payload?.rotationX ?? media.rotationX), rotationY=Number(payload?.rotationY),
        rotationZ=Number(payload?.rotationZ ?? media.rotationZ), scale=Number(payload?.scale);
      if (![x,y,z,rotationX,rotationY,rotationZ,scale].every(Number.isFinite)) {
        client.send("media:update:result", {id, ok:false, reason:"invalid-transform"});
        return;
      }
      media.x=Math.max(-this.worldLimit(),Math.min(this.worldLimit(),x));
      media.y=Math.max(-10,Math.min(20,y));
      media.z=Math.max(-this.worldLimit(),Math.min(this.worldLimit(),z));
      media.rotationX=rotationX;
      media.rotationY=rotationY;
      media.rotationZ=rotationZ;
      media.scale=Math.max(0.05,Math.min(20,scale));
      // Apply transforms to already-loaded clients without waiting for a state patch.
      this.broadcast("media:transform", {id, x:media.x, y:media.y, z:media.z,
        rotationX:media.rotationX, rotationY:media.rotationY, rotationZ:media.rotationZ, scale:media.scale});
      if (typeof payload?.assetRef === "string" && media.type === "audio") {
        media.assetRef=String(payload.assetRef).slice(0,240);
        // Prototype 0.16.1.4: state remains authoritative, while this explicit
        // event applies settings immediately on already-running mobile runtimes.
        this.broadcast("media:config", {id, assetRef: media.assetRef});
        console.log("[0.16.1.4 media:config broadcast]", id);
      }
      console.log("[media:update stored]", id);
      client.send("media:update:result", {id, ok:true});
    });

    // Prototype 0.15.1 / SHARED ACTION EVENT CORE
    // PLAY/STOP are transient interaction events, so they are broadcast rather
    // than stored in WorldState. Any connected participant may interact with
    // an existing shared media object.
    this.onMessage("media:action", (client: Client, payload: MediaActionPayload) => {
      const id = String(payload?.id || "").trim().slice(0, 80);
      const action = String(payload?.action || "").trim();
      const source = String(payload?.source || "behavior").trim().slice(0, 40);

      if (!id || !this.state.mediaObjects.has(id)) {
        console.warn("[media:action rejected] missing media", id);
        return;
      }
      const supportedActions = new Set(["play", "stop", "move", "rotate", "scale", "float", "orbit", "shake"]);
      if (!supportedActions.has(action)) {
        console.warn("[media:action rejected] unsupported action", action);
        return;
      }
      if (source === "user-proximity-enter" || source === "user-proximity-leave") {
        const actors=this.proximityActors.get(id) || new Set<string>();
        const wasInside=actors.size>0;
        if (source === "user-proximity-enter") actors.add(client.sessionId);
        else actors.delete(client.sessionId);
        if (actors.size) this.proximityActors.set(id,actors);
        else this.proximityActors.delete(id);
        // PLAY fires when the first player enters; STOP fires when the last leaves.
        if ((action === "play" && wasInside) || (action === "stop" && actors.size>0)) return;
      }

      // Prototype 0.15.3.2 / SHARED TRANSFORM ACTION FIX
      // Transform actions use the same transient Action Bus as PLAY/STOP.
      // Sanitize the parameters server-side before broadcasting them to every peer.
      let params: { amount: number; speed: number; axis: "x" | "y" | "z"; duration: number } | undefined;
      if (["move", "rotate", "scale", "float", "orbit", "shake"].includes(action)) {
        const raw = payload?.params ?? {};
        const amount = Number(raw.amount ?? 1);
        const speed = Number(raw.speed ?? 1);
        const duration = Number(raw.duration ?? 3);
        const rawAxis = String(raw.axis ?? "y").toLowerCase();
        const axis = (rawAxis === "x" || rawAxis === "z" ? rawAxis : "y") as "x" | "y" | "z";
        params = {
          amount: Number.isFinite(amount) ? Math.max(0.05, Math.min(20, amount)) : 1,
          speed: Number.isFinite(speed) ? Math.max(0.05, Math.min(10, speed)) : 1,
          axis,
          duration: Number.isFinite(duration) ? Math.max(0.2, Math.min(60, duration)) : 3
        };
      }

      const event={id, action, source, params, actorSessionId: client.sessionId,eventId:++this.mediaActionSequence};
      this.broadcast("media:action", event);
      // Ensure the actor also receives the shared occupancy decision.
      if (source.startsWith("user-proximity-")) client.send("media:action", event);
      console.log("[0.15.3.2 media:action broadcast]", id, action, source, params ?? "", client.sessionId);
    });

    // Prototype 0.15.1.2 / LIVE MEDIA SNAPSHOT RECOVERY
    // Some mobile clients can miss a live MapSchema onAdd notification while
    // still receiving the authoritative state on rejoin. Provide a lightweight
    // explicit snapshot channel so connected clients can self-heal without reload.
    this.onMessage("media:snapshot:request", (client: Client) => {
      console.log("[0.15.2 snapshot request]", client.sessionId, "state:", this.state.mediaObjects.size);
      const mediaObjects: any[] = [];
      for (const [id, media] of this.state.mediaObjects) {
        mediaObjects.push({
          id,
          title: media.title,
          type: media.type,
          assetRef: media.assetRef,
          fallbackRef: media.fallbackRef,
          groupName: media.groupName, tags: media.tags,
          x: media.x, y: media.y, z: media.z,
          rotationX: media.rotationX, rotationY: media.rotationY, rotationZ: media.rotationZ, scale: media.scale,
          behavior: this.mediaBehaviors.get(id) || null
        });
      }
      client.send("media:snapshot", { mediaObjects });
      console.log("[0.15.2 snapshot response]", client.sessionId, "count:", mediaObjects.length);
      console.log("[media:snapshot sent]", client.sessionId, mediaObjects.length);
    });

    // 0.17 / Portable world manifest. Assets remain at their original URLs.
    this.onMessage("environment:get",(client:Client)=>{
      client.send("environment:state",this.environment);
      this.sendEnvironmentPermissions(client);
    });
    this.onMessage("environment:set",(client:Client,payload:any)=>{
      if (!this.state.players.has(client.sessionId)) return;
      const next=this.cleanEnvironment(payload);
      if (!next) return;
      if(!this.canEditEnvironment(client,true)) {
        client.send("environment:error",{reason:"owner-locked"});
        this.sendEnvironmentPermissions(client);return;
      }
      if(next.cycleEnabled) next.cycleStartedAt=Date.now();
      this.environment=next;
      this.scheduleParticleEnd();
      const limit=this.worldLimit();
      for(const player of this.state.players.values()) {
        player.x=Math.max(-limit,Math.min(limit,player.x));
        player.z=Math.max(-limit,Math.min(limit,player.z));
      }
      this.broadcast("environment:state",next);
      client.send("environment:state",next);
      this.sendEnvironmentPermissions();
    });

    this.onMessage("world:export", (client: Client) => {
      const mediaObjects = Array.from(this.state.mediaObjects, ([id, media]) => ({
        id, title: media.title, type: media.type, assetRef: media.assetRef,
        fallbackRef: media.fallbackRef, x: media.x, y: media.y, z: media.z,
        groupName:media.groupName, tags:media.tags,
        rotationX: media.rotationX, rotationY: media.rotationY, rotationZ: media.rotationZ, scale: media.scale,
        behavior: this.mediaBehaviors.get(id) || null
      }));
      client.send("world:export:result", {
        format: "shared-world-manifest", version: 1,
        roomCode: String(this.metadata?.roomCode || "ART001"),
        exportedAt: new Date().toISOString(), environment:this.environment, mediaObjects,
        scenes:Array.from(this.scenes.values()),cues:Array.from(this.cues.values())
      });
    });

    this.onMessage("world:import", (client: Client, payload: any) => {
      const fail = (reason: string) => client.send("world:import:result", {ok:false, reason});
      const player = this.state.players.get(client.sessionId);
      const items = payload?.mediaObjects;
      if (!player || payload?.format !== "shared-world-manifest" || payload?.version !== 1 ||
          !Array.isArray(items) || items.length > MAX_MEDIA_OBJECTS) {
        fail("invalid-manifest"); return;
      }
      if (items.length + this.state.mediaObjects.size > MAX_MEDIA_OBJECTS) {
        fail("media-limit"); return;
      }
      const validTypes = ["sprite", "glb", "webm", "audio"];
      const validTriggers = ["user-proximity", "look-at", "touch"];
      const validActions = ["play", "stop", "move", "rotate", "scale", "float", "orbit", "shake", "none"];
      const bounded = (value: unknown, fallback: number, min: number, max: number) => {
        const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
      };
      // Validate the entire import before changing the shared state.
      const importedEnvironment=payload.environment?this.cleanEnvironment(payload.environment):null;
      const importLimit=this.worldLimit(importedEnvironment?.groundSize ?? this.environment.groundSize);
      const entries: Array<{id:string; sourceId:string; media:InstanceType<typeof SharedMediaObject>; behavior:Record<string, unknown>}> = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const defaultRotationX=["glb","audio"].includes(item?.type)?0:90;
        const transform = [item?.x, item?.y, item?.z, item?.rotationX??defaultRotationX,
          item?.rotationY, item?.rotationZ??0, item?.scale].map(Number);
        if (!item || !validTypes.includes(item.type) || !transform.every(Number.isFinite) ||
            typeof item.assetRef !== "string" || item.assetRef.length > 240 ||
            typeof item.fallbackRef !== "string" || item.fallbackRef.length > 240 ||
            typeof item.title !== "string" || item.title.length > 80 ||
            !/^(https?:\/\/|\/assets\/)/.test(item.assetRef)) {
          fail(`invalid-media-${i + 1}`); return;
        }
        const [x,y,z,rotationX,rotationY,rotationZ,scale] = transform;
        const raw = item.behavior && typeof item.behavior === "object" ? item.behavior : {};
        const behavior = {
          trigger: validTriggers.includes(raw.trigger) ? raw.trigger : "user-proximity",
          enterAction: validActions.includes(raw.enterAction) ? raw.enterAction : "play",
          leaveAction: validActions.includes(raw.leaveAction) ? raw.leaveAction : "stop",
          enabled: raw.enabled === true,
          distance: bounded(raw.distance,3,.1,30), lookAngle: bounded(raw.lookAngle,12,1,89),
          touchMode: raw.touchMode === "repeat" ? "repeat" : "toggle",
          transformAmount: bounded(raw.transformAmount,1,0,20),
          transformSpeed: bounded(raw.transformSpeed,1,.1,20),
          transformAxis: ["x","y","z"].includes(raw.transformAxis) ? raw.transformAxis : "y",
          transformDuration: bounded(raw.transformDuration,3,.1,60)
        };
        const id = `import-${Date.now().toString(36)}-${client.sessionId.slice(0,8)}-${i}`;
        entries.push({id, sourceId:String(item.id||""), behavior, media:new SharedMediaObject({
          title:item.title, type:item.type, assetRef:item.assetRef,
          fallbackRef:item.fallbackRef, ownerSessionId:client.sessionId,
          ownerClientId:player.clientId,
          groupName:this.cleanMediaGroup(item.groupName), tags:this.cleanMediaTags(item.tags),
          x:bounded(x,0,-importLimit,importLimit), y:bounded(y,1.8,-10,20),
          z:bounded(z,-3,-importLimit,importLimit), rotationX, rotationY, rotationZ,
          scale:bounded(scale,1,.05,20)
        })});
      }
      if((payload.environment||Array.isArray(payload.scenes)||Array.isArray(payload.cues))&&!this.canEditEnvironment(client,true)) {
        fail("environment-owner-locked");this.sendEnvironmentPermissions(client);return;
      }
      for (const entry of entries) {
        this.mediaBehaviors.set(entry.id, entry.behavior);
        this.state.mediaObjects.set(entry.id, entry.media);
        this.broadcast("media:behavior", {id:entry.id, behavior:entry.behavior});
      }
      if (payload.environment) {
        const imported=importedEnvironment;
        if (imported) {
          if(imported.cycleEnabled) imported.cycleStartedAt=Date.now();
          this.environment=imported;
          this.scheduleParticleEnd();
          this.broadcast("environment:state",imported);
          client.send("environment:state",imported);
          this.sendEnvironmentPermissions();
        }
      }
      const importedSceneIds=new Map<string,string>();
      if(Array.isArray(payload.scenes)){
        const idMap=new Map(entries.map(entry=>[entry.sourceId,entry.id]));
        for(const rawScene of payload.scenes.slice(0,12)){
          const name=String(rawScene?.name||"").trim().replace(/\s+/g," ").slice(0,32);if(!name)continue;
          const sceneEnvironment=this.cleanEnvironment(rawScene?.environment);if(!sceneEnvironment)continue;
          const media:Record<string,SceneMediaState>={};
          const rawMedia=rawScene?.media&&typeof rawScene.media==="object"?rawScene.media:{};
          for(const [oldId,raw] of Object.entries(rawMedia as Record<string,any>)){
            const newId=idMap.get(oldId);if(!newId)continue;
            const values=[raw.x,raw.y,raw.z,raw.rotationX,raw.rotationY,raw.rotationZ,raw.scale].map(Number);
            if(!values.every(Number.isFinite))continue;
            const [x,y,z,rotationX,rotationY,rotationZ,scale]=values;
            media[newId]={x:bounded(x,0,-importLimit,importLimit),y:bounded(y,1.8,-10,20),z:bounded(z,-3,-importLimit,importLimit),
              rotationX,rotationY,rotationZ,scale:bounded(scale,1,.05,20),groupName:this.cleanMediaGroup(raw.groupName),
              tags:this.cleanMediaTags(raw.tags),behavior:raw.behavior&&typeof raw.behavior==="object"?{...raw.behavior}:null};
          }
          const id=`scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
          this.scenes.set(id,{id,name,updatedAt:Date.now(),environment:sceneEnvironment,media});
          importedSceneIds.set(String(rawScene?.id||""),id);
        }
        this.sendSceneList();
      }
      if(Array.isArray(payload.cues)){
        const validCueActions=["play","stop","move","rotate","scale","float","orbit","shake"];
        for(const raw of payload.cues.slice(0,24)){
          const name=String(raw?.name||"").trim().replace(/\s+/g," ").slice(0,32);
          const targetType=String(raw?.targetType||"");let target=String(raw?.target||"").trim().slice(0,80);
          let action=String(raw?.action||"");if(targetType==="scene"){target=importedSceneIds.get(target)||"";action="recall";}
          if(!name||!["scene","group","tag"].includes(targetType)||!target||
            (targetType!=="scene"&&!validCueActions.includes(action)))continue;
          const id=`cue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
          this.cues.set(id,{id,name,targetType:targetType as CueDefinition["targetType"],target,
            action:action as CueDefinition["action"],updatedAt:Date.now()});
        }
        this.sendCueList();
      }
      client.send("world:import:result", {ok:true, count:entries.length});
    });

    this.onMessage("media:delete", (client: Client, payload: DeleteMediaPayload) => {
      const id=String(payload?.id || "").trim().slice(0,80);
      const media=this.state.mediaObjects.get(id);
      const player = this.state.players.get(client.sessionId);
      const authorized = !!media && (
        media.ownerSessionId === client.sessionId ||
        (!!media.ownerClientId && !!player?.clientId && media.ownerClientId === player.clientId)
      );
      if (!media || !authorized) {
        console.warn("[media:delete rejected]", id);
        client.send("media:delete:result", {id, ok:false, reason:media ? "owner-mismatch" : "media-not-found"});
        return;
      }
      this.state.mediaObjects.delete(id);
      this.mediaBehaviors.delete(id);
      this.proximityActors.delete(id);
      this.sendCueList();
      console.log("[media:delete stored]", id, "total:", this.state.mediaObjects.size);
      client.send("media:delete:result", {id, ok:true});
    });

    console.log("[room:create] message handlers ready");
  }

  onJoin(client: Client, options: { name?: string; clientId?: string }) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.8 + Math.random() * 1.5;
    const safeName = String(options.name || "Guest").trim().slice(0, 16) || "Guest";
    const clientId = String(options.clientId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

    // Authoritative session replacement:
    // a reload/re-entry from the same browser identity immediately removes
    // the previous avatar state, even if Safari's old socket has not closed yet.
    if (clientId) {
      for (const [oldSessionId, oldPlayer] of this.state.players) {
        if (oldSessionId !== client.sessionId && oldPlayer.clientId === clientId) {
          this.leaveProximity(oldSessionId);
          this.state.players.delete(oldSessionId);
          console.log("[SESSION REPLACED]", clientId, oldSessionId, "->", client.sessionId);
        }
      }
    }

    this.state.players.set(client.sessionId, new Player({
      name: safeName,
      clientId,
      x: Math.cos(angle) * radius,
      y: 0.65,
      z: Math.sin(angle) * radius
    }));

    this.sendEnvironmentPermissions();

    console.log(`[join] ${safeName} / ${client.sessionId} / client:${clientId || "legacy"}`);
    console.log("[AUTHORITATIVE SNAPSHOT]", {
      players: this.state.players.size,
      mediaObjects: this.state.mediaObjects.size
    });
  }

  onLeave(client: Client, consented: boolean) {
    this.leaveProximity(client.sessionId);
    this.broadcast("voice:leave",{sessionId:client.sessionId},{except:client});
    this.avatarEmoteLastAt.delete(client.sessionId);
    this.avatarMessageLastAt.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    const name = player?.name || "Guest";

    // If this session was already replaced, deleting by its old sessionId is harmless.
    this.state.players.delete(client.sessionId);
    this.sendEnvironmentPermissions();
    console.log("[SESSION CLEANUP]", name, client.sessionId, { consented, players: this.state.players.size });
  }

}
