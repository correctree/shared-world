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

function safeRoomCode(code: string) {
  const value = String(code || "").toUpperCase();
  if (!/^[A-Z0-9_-]{1,16}$/.test(value)) throw new Error("invalid room code");
  return value;
}

function worldPath(code: string) { return join(worldDir, `${safeRoomCode(code)}.json`); }
function previousPath(code: string) { return join(worldDir, `${safeRoomCode(code)}.previous.json`); }
function stablePath(code: string) { return join(worldDir, `${safeRoomCode(code)}.stable.json`); }

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
    storedWorlds: readdirSync(worldDir).filter(name => name.endsWith(".json") && !name.endsWith(".stable.json") && !name.endsWith(".previous.json")).length,
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
