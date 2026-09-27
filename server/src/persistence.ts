import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  renameSync, statSync, unlinkSync, writeFileSync
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Render must mount a persistent disk and set SHARED_WORLD_DATA_DIR to its
// mount path (recommended: /var/data). Without the variable, local development
// still works but Render redeploys will not retain these files.
const root = process.env.SHARED_WORLD_DATA_DIR || "./.shared-world-data";
const assetDir = join(root, "assets");
const worldDir = join(root, "worlds");
mkdirSync(assetDir, { recursive: true });
mkdirSync(worldDir, { recursive: true });

export type SavedWorldV2 = {
  format: "shared-world-room";
  version: 2;
  roomCode: string;
  revision: number;
  savedAt: string;
  environment: Record<string, unknown>;
  environmentOwnerClientId: string;
  directorClientIds: string[];
  mediaObjects: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  cues: Array<Record<string, unknown>>;
};

function safeClientId(value:string) {
  const id=String(value||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
  if(!id)throw new Error("invalid client id");return id;
}

function safeRoomCode(code: string) {
  const value = String(code || "").toUpperCase();
  if (!/^[A-Z0-9_-]{1,16}$/.test(value)) throw new Error("invalid room code");
  return value;
}

function worldPath(code: string) { return join(worldDir, `${safeRoomCode(code)}.json`); }
function previousPath(code: string) { return join(worldDir, `${safeRoomCode(code)}.previous.json`); }
function stablePath(code: string) { return join(worldDir, `${safeRoomCode(code)}.stable.json`); }
function checkpointPath(code: string) { return join(worldDir, `${safeRoomCode(code)}.checkpoint.json`); }

function validateEnvelope(value: unknown, code: string): SavedWorldV2 {
  if (!value || typeof value !== "object") throw new Error("snapshot is not an object");
  const world = value as Partial<SavedWorldV2>;
  if (world.format !== "shared-world-room" || world.version !== 2) throw new Error("unsupported snapshot version");
  if (world.roomCode !== safeRoomCode(code)) throw new Error("room code mismatch");
  if (!Array.isArray(world.mediaObjects) || world.mediaObjects.length > 64) throw new Error("invalid media list");
  if (!Array.isArray(world.scenes) || world.scenes.length > 12) throw new Error("invalid scene list");
  if (!Array.isArray(world.cues) || world.cues.length > 24) throw new Error("invalid cue list");
  if (!Array.isArray(world.directorClientIds) || world.directorClientIds.length > 12) throw new Error("invalid director list");
  if (!world.environment || typeof world.environment !== "object") throw new Error("invalid environment");
  const ids = new Set<string>();
  for (const raw of world.mediaObjects) {
    const id=String(raw?.id||"");
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))throw new Error("invalid or duplicate media id");
    ids.add(id);
  }
  return world as SavedWorldV2;
}

function readSnapshot(path: string, code: string) {
  const bytes = statSync(path).size;
  if (bytes < 2 || bytes > 2 * 1024 * 1024) throw new Error("snapshot size outside limits");
  return validateEnvelope(JSON.parse(readFileSync(path, "utf8")), code);
}

export type WorldGeneration = "current" | "previous" | "stable";

export function loadWorldGeneration(code:string,generation:WorldGeneration):SavedWorldV2|null {
  const path=generation==="current"?worldPath(code):generation==="previous"?previousPath(code):stablePath(code);
  return existsSync(path)?readSnapshot(path,code):null;
}

export function loadWorldCheckpoint(code:string):SavedWorldV2|null {
  const path=checkpointPath(code);return existsSync(path)?readSnapshot(path,code):null;
}

export function saveWorldCheckpoint(code:string,world:SavedWorldV2) {
  const path=checkpointPath(code);
  const temporary=`${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const json=JSON.stringify(validateEnvelope(world,code));
  if(Buffer.byteLength(json,"utf8")>2*1024*1024)throw new Error("checkpoint exceeds 2 MB");
  writeFileSync(temporary,json,{encoding:"utf8",mode:0o600});
  try{readSnapshot(temporary,code);renameSync(temporary,path);}
  catch(error){if(existsSync(temporary))unlinkSync(temporary);throw error;}
}

export function worldGenerationInfo(code:string) {
  const inspect=(generation:WorldGeneration)=>{
    try{
      const world=loadWorldGeneration(code,generation);
      return world?{available:true,valid:true,revision:world.revision,savedAt:world.savedAt}:{available:false,valid:false,revision:0,savedAt:""};
    }catch{return {available:true,valid:false,revision:0,savedAt:""};}
  };
  let checkpoint:{available:boolean;valid:boolean;revision:number;savedAt:string};
  try{const world=loadWorldCheckpoint(code);checkpoint=world?{available:true,valid:true,revision:world.revision,savedAt:world.savedAt}:{available:false,valid:false,revision:0,savedAt:""};}
  catch{checkpoint={available:true,valid:false,revision:0,savedAt:""};}
  return {current:inspect("current"),previous:inspect("previous"),stable:inspect("stable"),checkpoint};
}

export function listOwnedWorlds(clientId:string) {
  const owner=safeClientId(clientId);const rooms:Array<Record<string,unknown>>=[];
  for(const name of readdirSync(worldDir).filter(value=>/^[A-Z0-9_-]{1,16}\.json$/.test(value)).sort()){
    const roomCode=name.slice(0,-5);
    try{
      const world=readSnapshot(worldPath(roomCode),roomCode);
      if(world.environmentOwnerClientId!==owner)continue;
      const checkpoint=worldGenerationInfo(roomCode).checkpoint;
      rooms.push({roomCode,revision:world.revision,savedAt:world.savedAt,
        mediaCount:world.mediaObjects.length,sceneCount:world.scenes.length,cueCount:world.cues.length,
        checkpointRevision:checkpoint.valid?checkpoint.revision:0,checkpointSavedAt:checkpoint.valid?checkpoint.savedAt:""});
    }catch(error){console.warn("[ROOM CATALOG SKIP INVALID]",roomCode,error);}
    if(rooms.length>=50)break;
  }
  return rooms.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
}

function defaultEnvironment():Record<string,unknown> {
  return {sky:"#090c11",ground:"#262b33",grid:"#474d57",gridVisible:true,
    ambient:0.45,sunlight:1.5,lightColor:"#ffffff",sunAngle:45,skyMode:"color",skyAssetRef:"",
    groundMode:"plain",groundSize:15,groundAssetRef:"",particles:"off",particleCount:16,
    particleDuration:0,particleRadius:5,particleSpeed:1,particleSize:1,particleColor:"#ffbb55",
    particleAssetRef:"",environmentPreset:"custom",cycleEnabled:false,cycleMinutes:8,cycleStartedAt:0,
    fogEnabled:false,fogColor:"#b8cbd9",fogDensity:0.75,fogDistance:12,groundRepeat:1,groundRotation:0};
}

export function createOwnedWorld(code:string,clientId:string) {
  const roomCode=safeRoomCode(code),owner=safeClientId(clientId);
  if(existsSync(worldPath(roomCode))||existsSync(previousPath(roomCode))||existsSync(stablePath(roomCode))||existsSync(checkpointPath(roomCode)))throw new Error("room already exists");
  const world:SavedWorldV2={format:"shared-world-room",version:2,roomCode,revision:1,savedAt:new Date().toISOString(),
    environment:defaultEnvironment(),environmentOwnerClientId:owner,directorClientIds:[],mediaObjects:[],scenes:[],cues:[]};
  saveWorld(roomCode,world);saveWorldCheckpoint(roomCode,world);return world;
}

export function cloneOwnedWorld(sourceCode:string,targetCode:string,clientId:string) {
  const source=safeRoomCode(sourceCode),target=safeRoomCode(targetCode),owner=safeClientId(clientId);
  if(source===target)throw new Error("source and target must differ");
  if(existsSync(worldPath(target))||existsSync(previousPath(target))||existsSync(stablePath(target))||existsSync(checkpointPath(target)))throw new Error("target room already exists");
  const original=loadWorldGeneration(source,"current");
  if(!original)throw new Error("source room not found");
  if(original.environmentOwnerClientId!==owner)throw new Error("owner required");
  const world:SavedWorldV2={...original,roomCode:target,revision:1,savedAt:new Date().toISOString(),
    environment:{...original.environment},environmentOwnerClientId:owner,directorClientIds:[],
    mediaObjects:original.mediaObjects.map(item=>({...item,ownerClientId:owner})),
    scenes:original.scenes.map(item=>({...item})),cues:original.cues.map(item=>({...item}))};
  saveWorld(target,world);saveWorldCheckpoint(target,world);return world;
}

export function loadWorld(code: string): { world: SavedWorldV2 | null; recovered: boolean; source: WorldGeneration | "empty" } {
  const candidates:Array<{source:WorldGeneration;path:string}>=[
    {source:"current",path:worldPath(code)},
    {source:"previous",path:previousPath(code)},
    {source:"stable",path:stablePath(code)}
  ];
  let lastError:unknown=null;
  for(const candidate of candidates){
    if(!existsSync(candidate.path))continue;
    try{
      const world=readSnapshot(candidate.path,code);
      if(candidate.source!=="current")console.warn("[ROOM STORAGE RECOVERED]",safeRoomCode(code),candidate.source,world.savedAt);
      return {world,recovered:candidate.source!=="current",source:candidate.source};
    }catch(error){lastError=error;console.error("[ROOM STORAGE GENERATION INVALID]",safeRoomCode(code),candidate.source,error);}
  }
  if(lastError)throw lastError;
  return {world:null,recovered:false,source:"empty"};
}

export function saveWorld(code: string, world: SavedWorldV2) {
  const primary = worldPath(code);
  const previous = previousPath(code);
  const stable = stablePath(code);
  const temporary = `${primary}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const json = JSON.stringify(validateEnvelope(world, code));
  if (Buffer.byteLength(json, "utf8") > 2 * 1024 * 1024) throw new Error("snapshot exceeds 2 MB");
  writeFileSync(temporary, json, { encoding: "utf8", mode: 0o600 });
  try {
    // Read back the temporary file before rotation so a truncated write can
    // never displace a known-good generation.
    readSnapshot(temporary,code);
    if(existsSync(previous)){
      try{readSnapshot(previous,code);copyFileSync(previous,stable);}catch(error){console.warn("[ROOM STORAGE PREVIOUS NOT ROTATED]",safeRoomCode(code),error);}
    }
    if(existsSync(primary)){
      try{readSnapshot(primary,code);copyFileSync(primary,previous);}catch(error){console.warn("[ROOM STORAGE CURRENT NOT ROTATED]",safeRoomCode(code),error);}
    }
    renameSync(temporary, primary);
    // Bootstrap all recovery generations on a ROOM's first successful save.
    if(!existsSync(previous))copyFileSync(primary,previous);
    if(!existsSync(stable))copyFileSync(previous,stable);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function storageInfo() {
  return {
    root,
    persistentConfigured: Boolean(process.env.SHARED_WORLD_DATA_DIR),
    storedWorlds: readdirSync(worldDir).filter(name => name.endsWith(".json") && !name.endsWith(".stable.json") && !name.endsWith(".previous.json") && !name.endsWith(".checkpoint.json")).length,
    storedAssets: readdirSync(assetDir).length
  };
}

export function assetPath(key: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}\.(zip|glb|webm|mp3|wav)$/i.test(key)) throw new Error("invalid asset key");
  return join(assetDir, key);
}
export function assetCount() { return readdirSync(assetDir).length; }
export function saveAsset(key: string, data: Buffer) {
  const path = assetPath(key);
  const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}
export function readAsset(key: string) {
  const path = assetPath(key);
  return existsSync(path) ? readFileSync(path) : null;
}

export function contentAssetKey(data: Buffer, extension: string) {
  const ext=String(extension||"").toLowerCase();
  if(!/^(zip|glb|webm|mp3|wav)$/.test(ext))throw new Error("invalid asset extension");
  return `${createHash("sha256").update(data).digest("hex")}.${ext}`;
}
export function saveContentAsset(data: Buffer, extension: string) {
  const key=contentAssetKey(data,extension);
  const path=assetPath(key);
  if(!existsSync(path))saveAsset(key,data);
  return key;
}
export function assetExists(key:string) {
  try{return existsSync(assetPath(key));}catch{return false;}
}

console.log("[ROOM STORAGE]", storageInfo());
