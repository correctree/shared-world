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
function backupPath(code: string) { return join(worldDir, `${safeRoomCode(code)}.stable.json`); }

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
  return world as SavedWorldV2;
}

function readSnapshot(path: string, code: string) {
  const bytes = statSync(path).size;
  if (bytes < 2 || bytes > 2 * 1024 * 1024) throw new Error("snapshot size outside limits");
  return validateEnvelope(JSON.parse(readFileSync(path, "utf8")), code);
}

export function loadWorld(code: string): { world: SavedWorldV2 | null; recovered: boolean } {
  const primary = worldPath(code);
  const stable = backupPath(code);
  if (!existsSync(primary) && !existsSync(stable)) return { world: null, recovered: false };
  try {
    return { world: readSnapshot(primary, code), recovered: false };
  } catch (primaryError) {
    console.error("[ROOM STORAGE PRIMARY INVALID]", safeRoomCode(code), primaryError);
    if (!existsSync(stable)) throw primaryError;
    const world = readSnapshot(stable, code);
    console.warn("[ROOM STORAGE RECOVERED LAST STABLE]", safeRoomCode(code), world.savedAt);
    return { world, recovered: true };
  }
}

export function saveWorld(code: string, world: SavedWorldV2) {
  const primary = worldPath(code);
  const stable = backupPath(code);
  const temporary = `${primary}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const json = JSON.stringify(validateEnvelope(world, code));
  if (Buffer.byteLength(json, "utf8") > 2 * 1024 * 1024) throw new Error("snapshot exceeds 2 MB");
  writeFileSync(temporary, json, { encoding: "utf8", mode: 0o600 });
  try {
    if (existsSync(primary)) copyFileSync(primary, stable);
    renameSync(temporary, primary);
    // The newly validated primary becomes the recovery point after its first save.
    if (!existsSync(stable)) copyFileSync(primary, stable);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function storageInfo() {
  return {
    root,
    persistentConfigured: Boolean(process.env.SHARED_WORLD_DATA_DIR),
    storedWorlds: readdirSync(worldDir).filter(name => name.endsWith(".json") && !name.endsWith(".stable.json")).length,
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
