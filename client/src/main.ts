import JSZip from "jszip";
import "./style.css";
import * as pc from "playcanvas";
import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import { XRMediaManager } from "./core/XRMediaManager";
import { createMediaObject } from "./media/createMediaObject";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:2567";

if (window.location.protocol === "https:" && SERVER_URL.startsWith("http://")) {
  console.warn("GitHub Pages is HTTPS. Set VITE_SERVER_URL to an HTTPS Colyseus endpoint so WebSocket can use WSS.");
}

const MOVE_SPEED = 3.2;
const SEND_HZ = 20;

// Prototype 0.11 / XR MEDIA CORE
// Stage 1 keeps the proven rendering/import code intact and adds a common registry/controller layer.
const xrMediaManager = new XRMediaManager();
console.log("[PROTOTYPE 0.16.0.1 AUDIO PLAYBACK + SHARING FIX LOADED]");
let activeXRMediaId: string | null = null;

type Avatar = {
  entity: pc.Entity;
  target: pc.Vec3;
  name: string;
  名前ラベル: HTMLDivElement;
  proximityHalo: pc.Entity;
};

// =========================================================
// DOM
// =========================================================

const canvas = document.querySelector<HTMLCanvasElement>("#application-canvas")!;
const lobby = document.querySelector<HTMLElement>("#lobby")!;
const hud = document.querySelector<HTMLElement>("#hud")!;
const enterButton = document.querySelector<HTMLButtonElement>("#enterButton")!;
const nameInput = document.querySelector<HTMLInputElement>("#nameInput")!;
const roomInput = document.querySelector<HTMLInputElement>("#roomInput")!;
const status = document.querySelector<HTMLElement>("#status")!;
const roomLabel = document.querySelector<HTMLElement>("#roomLabel")!;
const playersLabel = document.querySelector<HTMLElement>("#playersLabel")!;
const joystick = document.querySelector<HTMLDivElement>("#joystick")!;
const joystickKnob = document.querySelector<HTMLDivElement>("#joystickKnob")!;
const viewToggle = document.querySelector<HTMLButtonElement>("#viewToggle")!;

// Prototype 0.9 / ADD ARTWORK UI
const addArtworkButton = document.querySelector<HTMLButtonElement>("#addArtworkButton");
const addArtworkPanel = document.querySelector<HTMLElement>("#addArtworkPanel");
const closeArtworkPanel = document.querySelector<HTMLButtonElement>("#closeArtworkPanel");
const cancelArtworkButton = document.querySelector<HTMLButtonElement>("#cancelArtworkButton");
const webmArtworkMode = document.querySelector<HTMLButtonElement>("#webmArtworkMode");
const spriteArtworkMode = document.querySelector<HTMLButtonElement>("#spriteArtworkMode");
const selectArtworkFile = document.querySelector<HTMLButtonElement>("#selectArtworkFile");
const artworkFileInput = document.querySelector<HTMLInputElement>("#artworkFileInput");
const artworkFileName = document.querySelector<HTMLElement>("#artworkFileName");
const addArtworkToWorldButton = document.querySelector<HTMLButtonElement>("#addArtworkToWorldButton");

// Prototype 0.10 / Stage 2 / GLB mode button
// Existing index.html can stay unchanged: add the GLB button at runtime.
let glbArtworkMode = document.querySelector<HTMLButtonElement>("#glbArtworkMode");

if (!glbArtworkMode && spriteArtworkMode) {
  const button = document.createElement("button");
  button.id = "glbArtworkMode";
  button.type = "button";
  button.textContent = "3D GLB";
  button.className = spriteArtworkMode.className;
  spriteArtworkMode.insertAdjacentElement("afterend", button);
  glbArtworkMode = button;
}

// Prototype 0.16.0 / AUDIO MEDIA MODE
let audioArtworkMode = document.querySelector<HTMLButtonElement>("#audioArtworkMode");
if (!audioArtworkMode && glbArtworkMode) {
  const button = document.createElement("button");
  button.id = "audioArtworkMode"; button.type = "button"; button.textContent = "AUDIO";
  button.className = glbArtworkMode.className; glbArtworkMode.insertAdjacentElement("afterend", button);
  audioArtworkMode = button;
}
const audioSettingsPanel = document.createElement("section");
audioSettingsPanel.id = "audioSettingsPanel"; audioSettingsPanel.style.cssText = "display:none;margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.18);border-radius:10px";
audioSettingsPanel.innerHTML = `<div style="font-size:11px;font-weight:800;letter-spacing:.1em;margin-bottom:8px">AUDIO SETTINGS</div>
<label style="display:grid;grid-template-columns:80px 1fr;gap:8px;margin:8px 0">Volume <input id="audioVolume" type="range" min="0" max="1" step="0.05" value="0.8"></label>
<label style="display:flex;gap:8px;margin:8px 0"><input id="audioLoop" type="checkbox" checked> LOOP</label>
<label style="display:flex;gap:8px;margin:8px 0;align-items:center"><input id="audioSpatial" type="checkbox" checked> SPATIAL AUDIO <strong id="audioSpatialState" style="margin-left:auto">ON</strong></label>
<label style="display:grid;grid-template-columns:80px 1fr;gap:8px;margin:8px 0">Distance <input id="audioDistance" type="range" min="2" max="30" step="1" value="12"></label>`;
addArtworkPanel?.appendChild(audioSettingsPanel);
const audioVolume = audioSettingsPanel.querySelector<HTMLInputElement>("#audioVolume")!;
const audioLoop = audioSettingsPanel.querySelector<HTMLInputElement>("#audioLoop")!;
const audioSpatial = audioSettingsPanel.querySelector<HTMLInputElement>("#audioSpatial")!;
const audioSpatialState = audioSettingsPanel.querySelector<HTMLElement>("#audioSpatialState")!;
const audioDistance = audioSettingsPanel.querySelector<HTMLInputElement>("#audioDistance")!;
function refreshAudioSpatialUI(){
  audioSpatialState.textContent = audioSpatial.checked ? "ON" : "OFF";
  audioDistance.disabled = !audioSpatial.checked;
  audioDistance.style.opacity = audioSpatial.checked ? "1" : ".4";
}
audioSpatial.addEventListener("change", refreshAudioSpatialUI);
refreshAudioSpatialUI();

// Prototype 0.9 / Placement Editor UI
const artworkPlacementPanel = document.querySelector<HTMLElement>("#artworkPlacementPanel");
const artworkXMinus = document.querySelector<HTMLButtonElement>("#artworkXMinus");
const artworkXPlus = document.querySelector<HTMLButtonElement>("#artworkXPlus");
const artworkYMinus = document.querySelector<HTMLButtonElement>("#artworkYMinus");
const artworkYPlus = document.querySelector<HTMLButtonElement>("#artworkYPlus");
const artworkZMinus = document.querySelector<HTMLButtonElement>("#artworkZMinus");
const artworkZPlus = document.querySelector<HTMLButtonElement>("#artworkZPlus");
const artworkXValue = document.querySelector<HTMLElement>("#artworkXValue");
const artworkYValue = document.querySelector<HTMLElement>("#artworkYValue");
const artworkZValue = document.querySelector<HTMLElement>("#artworkZValue");
const artworkScale = document.querySelector<HTMLInputElement>("#artworkScale");
const artworkRotationY = document.querySelector<HTMLInputElement>("#artworkRotationY");
const cancelPlacementButton = document.querySelector<HTMLButtonElement>("#cancelPlacementButton");
const placeArtworkButton = document.querySelector<HTMLButtonElement>("#placeArtworkButton");


// Prototype 0.10 / Stage 3 / GLB Animation UI
// Added at runtime so index.html / style.css do not need to change.
const glbAnimationPanel = document.createElement("section");
glbAnimationPanel.id = "glbAnimationPanel";
glbAnimationPanel.style.display = "none";
glbAnimationPanel.style.marginTop = "14px";
glbAnimationPanel.style.padding = "12px";
glbAnimationPanel.style.border = "1px solid rgba(255,255,255,0.18)";
glbAnimationPanel.style.borderRadius = "10px";
glbAnimationPanel.style.background = "rgba(0,0,0,0.18)";
glbAnimationPanel.innerHTML = `
  <div style="font-size:12px;letter-spacing:.08em;opacity:.72;margin-bottom:8px;">
    ANIMATION
  </div>
  <select id="glbAnimationSelect"
    style="width:100%;box-sizing:border-box;margin-bottom:10px;padding:8px;border-radius:7px;">
  </select>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <button id="glbAnimationPlay" type="button">▶ PLAY</button>
    <button id="glbAnimationStop" type="button">■ STOP</button>
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
      <input id="glbAnimationLoop" type="checkbox" checked>
      LOOP
    </label>
  </div>
  <div id="glbAnimationStatus"
    style="font-size:11px;opacity:.65;margin-top:8px;word-break:break-word;">
    NO ANIMATION
  </div>
`;

artworkPlacementPanel?.appendChild(glbAnimationPanel);

const glbAnimationSelect =
  glbAnimationPanel.querySelector<HTMLSelectElement>("#glbAnimationSelect")!;
const glbAnimationPlay =
  glbAnimationPanel.querySelector<HTMLButtonElement>("#glbAnimationPlay")!;
const glbAnimationStop =
  glbAnimationPanel.querySelector<HTMLButtonElement>("#glbAnimationStop")!;
const glbAnimationLoop =
  glbAnimationPanel.querySelector<HTMLInputElement>("#glbAnimationLoop")!;
const glbAnimationStatus =
  glbAnimationPanel.querySelector<HTMLElement>("#glbAnimationStatus")!;

// =========================================================
// PLAYCANVAS
// =========================================================

const app = new pc.Application(canvas, {
  graphicsDeviceOptions: { alpha: false, antialias: true }
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.start();
app.scene.ambientLight = new pc.Color(0.42, 0.45, 0.5);
window.addEventListener("resize", () => app.resizeCanvas());

function material(rgb: [number, number, number], metalness = 0.0) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(...rgb);
  m.metalness = metalness;
  m.gloss = 0.35;
  m.update();
  return m;
}

// =========================================================
// WORLD
// =========================================================

const floor = new pc.Entity("Floor");
floor.addComponent("render", { type: "box" });
floor.setLocalScale(15, 0.15, 15);
floor.setPosition(0, -0.075, 0);
floor.render!.material = material([0.15, 0.17, 0.2]);
app.root.addChild(floor);

const gridMaterial = material([0.28, 0.3, 0.34]);
for (let i = -7; i <= 7; i++) {
  const lineX = new pc.Entity(`grid-x-${i}`);
  lineX.addComponent("render", { type: "box" });
  lineX.setLocalScale(15, 0.012, 0.012);
  lineX.setPosition(0, 0.01, i);
  lineX.render!.material = gridMaterial;
  app.root.addChild(lineX);

  const lineZ = new pc.Entity(`grid-z-${i}`);
  lineZ.addComponent("render", { type: "box" });
  lineZ.setLocalScale(0.012, 0.012, 15);
  lineZ.setPosition(i, 0.01, 0);
  lineZ.render!.material = gridMaterial;
  app.root.addChild(lineZ);
}

// Legacy SharedObject removed in Prototype 0.11 / Stage 3.1

const light = new pc.Entity("Light");
light.addComponent("light", { type: "directional", intensity: 1.5, castShadows: true });
light.setEulerAngles(45, 35, 0);
app.root.addChild(light);

const camera = new pc.Entity("Camera");
camera.addComponent("camera", { clearColor: new pc.Color(0.035, 0.045, 0.065), farClip: 100 });
camera.setPosition(0, 10, 11);
camera.lookAt(0, 0, 0);
app.root.addChild(camera);

// =========================================================
// Prototype 0.11 / Stage 3.1
// Legacy artwork removed. All placed media now belongs to XRMediaManager.
// =========================================================

// =========================================================
// CAMERA + MULTIPLAYER STATE
// =========================================================

let cameraYaw = 0;
let cameraPitch = -35;
let cameraDistance = 15;
let cameraDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let cameraPointerId: number | null = null;
let firstPersonMode = false;

function toggleViewMode() {
  firstPersonMode = !firstPersonMode;
  if (firstPersonMode) {
    cameraPitch = 0;
    viewToggle.textContent = "3RD";
  } else {
    cameraPitch = -35;
    viewToggle.textContent = "1ST";
  }
}

const avatars = new Map<string, Avatar>();
const keys = new Set<string>();
let currentSessionId = "";
let activeRoom: Room | null = null;

const CLIENT_ID_STORAGE_KEY = "shared-world-client-id-v1";
function getOrCreateClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_STORAGE_KEY) || "";
    if (!id) {
      id = `client-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
const persistentClientId = getOrCreateClientId();
let localPosition = new pc.Vec3();
let lastSend = 0;

// =========================================================
// JOYSTICK
// =========================================================

let joystickX = 0;
let joystickY = 0;
let joystickPointerId: number | null = null;

function updateJoystick(clientX: number, clientY: number) {
  const rect = joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const maxRadius = rect.width * 0.34;
  const distance = Math.hypot(dx, dy);
  const scale = distance > maxRadius ? maxRadius / distance : 1;
  const clampedX = dx * scale;
  const clampedY = dy * scale;
  joystickX = clampedX / maxRadius;
  joystickY = clampedY / maxRadius;
  joystickKnob.style.transform =
    `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
}

function resetJoystick() {
  joystickX = 0;
  joystickY = 0;
  joystickPointerId = null;
  joystickKnob.style.transform = "translate(-50%, -50%)";
}

joystick.addEventListener("pointerdown", (e) => {
  joystickPointerId = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  updateJoystick(e.clientX, e.clientY);
});

joystick.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joystickPointerId) return;
  updateJoystick(e.clientX, e.clientY);
});

joystick.addEventListener("pointerup", (e) => {
  if (e.pointerId !== joystickPointerId) return;
  resetJoystick();
});

joystick.addEventListener("pointercancel", (e) => {
  if (e.pointerId !== joystickPointerId) return;
  resetJoystick();
});

// =========================================================
// CAMERA INPUT
// =========================================================

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  cameraDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener("mouseup", () => {
  cameraDragging = false;
});

window.addEventListener("mousemove", (e) => {
  if (!cameraDragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  cameraYaw -= dx * 0.25;
  cameraPitch -= dy * 0.25;
  cameraPitch = pc.math.clamp(
    cameraPitch,
    firstPersonMode ? -89 : -80,
    firstPersonMode ? 89 : -10
  );
});

canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const target = e.target as HTMLElement;
  if (target.closest("#joystick")) return;
  cameraPointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== cameraPointerId) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  cameraYaw -= dx * 0.25;
  cameraPitch -= dy * 0.25;
  cameraPitch = pc.math.clamp(
    cameraPitch,
    firstPersonMode ? -89 : -80,
    firstPersonMode ? 89 : -10
  );
});

canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId !== cameraPointerId) return;
  cameraPointerId = null;
});

canvas.addEventListener("pointercancel", (e) => {
  if (e.pointerId !== cameraPointerId) return;
  cameraPointerId = null;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cameraDistance += e.deltaY * 0.01;
  cameraDistance = pc.math.clamp(cameraDistance, 5, 30);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "v") {
    toggleViewMode();
    return;
  }
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    keys.add(e.key.toLowerCase());
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
viewToggle.addEventListener("click", toggleViewMode);

// =========================================================
// AVATARS
// =========================================================

function avatarMaterial(sessionId: string) {
  if (sessionId === currentSessionId) return material([0.94, 0.94, 0.96]);
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  const r = 0.25 + ((hash & 255) / 255) * 0.55;
  const g = 0.25 + (((hash >> 8) & 255) / 255) * 0.55;
  const b = 0.25 + (((hash >> 16) & 255) / 255) * 0.55;
  return material([r, g, b]);
}

function 名前ラベルを作成(名前: string) {
  const ラベル = document.createElement("div");
  ラベル.textContent = 名前;
  ラベル.style.position = "fixed";
  ラベル.style.left = "0";
  ラベル.style.top = "0";
  ラベル.style.transform = "translate(-50%, -100%)";
  ラベル.style.padding = "4px 8px";
  ラベル.style.borderRadius = "6px";
  ラベル.style.background = "rgba(0, 0, 0, 0.65)";
  ラベル.style.color = "#ffffff";
  ラベル.style.fontFamily = "Arial, sans-serif";
  ラベル.style.fontSize = "12px";
  ラベル.style.fontWeight = "600";
  ラベル.style.whiteSpace = "nowrap";
  ラベル.style.pointerEvents = "none";
  ラベル.style.zIndex = "20";
  document.body.appendChild(ラベル);
  return ラベル;
}

function createAvatar(sessionId: string, player: any) {
  const entity = new pc.Entity(`Player-${sessionId}`);
  entity.addComponent("render", { type: "sphere" });
  entity.setLocalScale(0.65, 0.65, 0.65);
  entity.setPosition(player.x, player.y, player.z);
  entity.render!.material = avatarMaterial(sessionId);

  const forwardMarker = new pc.Entity(`Forward-${sessionId}`);
  forwardMarker.addComponent("render", { type: "box" });
  forwardMarker.setLocalScale(0.16, 0.16, 0.42);
  forwardMarker.setLocalPosition(0, 0, -0.42);
  forwardMarker.render!.material = material([1.0, 0.55, 0.15]);
  entity.addChild(forwardMarker);

  const proximityHalo = new pc.Entity(`ProximityHalo-${sessionId}`);
  proximityHalo.addComponent("render", { type: "cylinder" });
  proximityHalo.setLocalScale(1.5, 0.025, 1.5);
  proximityHalo.setLocalPosition(0, -0.48, 0);
  proximityHalo.render!.material = material([1.0, 0.45, 0.08]);
  proximityHalo.enabled = false;
  entity.addChild(proximityHalo);

  app.root.addChild(entity);
  const 名前ラベル = 名前ラベルを作成(player.name);
  avatars.set(sessionId, {
    entity,
    target: new pc.Vec3(player.x, player.y, player.z),
    name: player.name,
    名前ラベル,
    proximityHalo
  });

  if (sessionId === currentSessionId) {
    localPosition.set(player.x, player.y, player.z);
  }
  updatePlayerCount();
}

function removeAvatar(sessionId: string) {
  const avatar = avatars.get(sessionId);
  if (!avatar) return;
  avatar.名前ラベル.remove();
  avatar.entity.destroy();
  avatars.delete(sessionId);
  updatePlayerCount();
}

function updatePlayerCount() {
  playersLabel.textContent = `PLAYERS ${avatars.size} / 4`;
}

// =========================================================
// Prototype 0.14.3 / SHARED ASSET SYSTEM
// Sprite ZIP is uploaded to the Render server over HTTP.
// Colyseus synchronizes only the assetRef + transform.
// Remote clients fetch the ZIP and rebuild the animated Sprite locally.
// =========================================================

const sharedRemoteMediaIds = new Set<string>();
const sharedMediaLoadingIds = new Set<string>();
const SHARED_ASSET_RETRY_DELAYS = [0, 700, 1600, 3200];
let sharedWorldReconcileTimer: number | null = null;
const sharedMediaLoadGeneration = new Map<string, number>();
const sharedStateDiagnostic = {
  serverMedia: 0, localMedia: 0, onAdd: 0, snapshotRx: 0, snapshotTx: 0,
  lastMediaId: "-", lastError: "-", actionRx: 0, connection: "CLOSED"
};
let sharedStateDiagnosticPanel: HTMLDivElement | null = null;
let sharedStateDiagnosticBody: HTMLPreElement | null = null;
let sharedStateDiagnosticCollapsed = window.matchMedia("(max-width: 640px)").matches;
function refreshSharedStateDiagnosticPanel() {
  if (!sharedStateDiagnosticPanel) {
    sharedStateDiagnosticPanel = document.createElement("div");
    sharedStateDiagnosticPanel.id = "sharedStateDiagnosticPanel";
    sharedStateDiagnosticPanel.innerHTML = `
      <button id="sharedStateDiagnosticToggle" type="button">DIAGNOSTIC <span>▸</span></button>
      <pre id="sharedStateDiagnosticBody"></pre>`;
    document.body.appendChild(sharedStateDiagnosticPanel);
    sharedStateDiagnosticBody = sharedStateDiagnosticPanel.querySelector<HTMLPreElement>("#sharedStateDiagnosticBody");
    const toggle = sharedStateDiagnosticPanel.querySelector<HTMLButtonElement>("#sharedStateDiagnosticToggle")!;
    const syncDiagnosticUI = () => {
      sharedStateDiagnosticPanel!.classList.toggle("collapsed", sharedStateDiagnosticCollapsed);
      const mark = toggle.querySelector("span");
      if (mark) mark.textContent = sharedStateDiagnosticCollapsed ? "▸" : "▾";
    };
    toggle.addEventListener("click", () => {
      sharedStateDiagnosticCollapsed = !sharedStateDiagnosticCollapsed;
      syncDiagnosticUI();
    });
    syncDiagnosticUI();
  }
  sharedStateDiagnostic.localMedia = sharedRemoteMediaIds.size;
  if (sharedStateDiagnosticBody) sharedStateDiagnosticBody.textContent =
    `SHARED STATE DIAGNOSTIC / 0.16.0.2\n` +
    `CONNECTION     ${sharedStateDiagnostic.connection}\n` +
    `SERVER MEDIA   ${sharedStateDiagnostic.serverMedia}\n` +
    `LOCAL MEDIA    ${sharedStateDiagnostic.localMedia}\n` +
    `ONADD          ${sharedStateDiagnostic.onAdd}\n` +
    `SNAPSHOT TX    ${sharedStateDiagnostic.snapshotTx}\n` +
    `SNAPSHOT RX    ${sharedStateDiagnostic.snapshotRx}\n` +
    `ACTION RX      ${sharedStateDiagnostic.actionRx}\n` +
    `LAST MEDIA ID  ${sharedStateDiagnostic.lastMediaId}\n` +
    `LAST ERROR     ${sharedStateDiagnostic.lastError}`;
}
function setSharedStateDiagnosticError(error: unknown) {
  sharedStateDiagnostic.lastError = error instanceof Error ? error.message : String(error);
  refreshSharedStateDiagnosticPanel();
}

function sharedAssetURL(mediaId: string, extension: "zip" | "glb" | "webm" | "mp3" | "wav") {
  return `${SERVER_URL.replace(/\/$/, "")}/assets/${encodeURIComponent(mediaId)}.${extension}`;
}

function bumpSharedMediaGeneration(mediaId: string) {
  const next = (sharedMediaLoadGeneration.get(mediaId) || 0) + 1;
  sharedMediaLoadGeneration.set(mediaId, next);
  return next;
}

function isSharedMediaGenerationCurrent(mediaId: string, generation: number) {
  return (sharedMediaLoadGeneration.get(mediaId) || 0) === generation;
}

function getAuthoritativeMediaMap() {
  return activeRoom ? (activeRoom.state as any).mediaObjects : null;
}

function authoritativeMediaExists(mediaId: string) {
  const map: any = getAuthoritativeMediaMap();
  if (!map) return false;

  // MapSchema compatibility: prefer get(), then has(), then forEach().
  // This helper is diagnostic/reconciliation-only. Asset loaders no longer
  // abort solely because this second lookup briefly disagrees with onAdd.
  try {
    if (typeof map.get === "function" && map.get(mediaId)) return true;
    if (typeof map.has === "function" && map.has(mediaId)) return true;
    let found = false;
    if (typeof map.forEach === "function") {
      map.forEach((_media: any, id: string) => { if (id === mediaId) found = true; });
    }
    return found;
  } catch {
    return false;
  }
}

async function ensureSharedMediaFromState(mediaId: string, media: any) {
  if (!media) {
    console.warn("[MEDIA RECOVERY SKIP / NO MEDIA]", mediaId);
    sharedStateDiagnostic.lastMediaId = mediaId; sharedStateDiagnostic.lastError = "NO MEDIA"; refreshSharedStateDiagnosticPanel();
    return;
  }
  if (managedPlacedMedia.has(mediaId)) {
    console.log("[MEDIA RECOVERY SKIP / ALREADY MANAGED]", mediaId);
    return;
  }
  if (sharedMediaLoadingIds.has(mediaId)) {
    console.log("[MEDIA RECOVERY SKIP / LOADING]", mediaId);
    return;
  }

  const sharedType = String(media.type || "");
  console.log("[MEDIA RECOVERY DISPATCH]", mediaId, sharedType, {
    assetRef: String(media.assetRef || ""),
    fallbackRef: String(media.fallbackRef || "")
  });

  if (sharedType === "sprite") await createSharedSpriteFromAsset(mediaId, media);
  else if (sharedType === "webm") await createSharedWebMFromAsset(mediaId, media);
  else if (sharedType === "glb") await createSharedGLBFromAsset(mediaId, media);
  else if (sharedType === "audio") await createSharedAudioFromAsset(mediaId, media);
  else console.warn("[MEDIA RECOVERY UNSUPPORTED TYPE]", mediaId, sharedType);
}

function reconcileWorldFromServerState() {
  if (!activeRoom) return;
  const mediaMap: any = (activeRoom.state as any).mediaObjects;
  if (!mediaMap) return;

  const authoritativeIds = new Set<string>();
  try {
    mediaMap.forEach((media: any, mediaId: string) => {
      authoritativeIds.add(mediaId);
      if (!managedPlacedMedia.has(mediaId) && !sharedMediaLoadingIds.has(mediaId)) {
        console.log("[WORLD RECONCILE ADD]", mediaId, String(media?.type || ""));
        void ensureSharedMediaFromState(mediaId, media);
      } else if (sharedRemoteMediaIds.has(mediaId)) {
        updateSharedSpritePlaceholder(mediaId, media);
      }
    });
  } catch (error) {
    console.error("[WORLD RECONCILE ITERATION ERROR]", error);
  }

  console.log("[WORLD RECONCILE IDS]", Array.from(authoritativeIds));

  for (const mediaId of Array.from(sharedRemoteMediaIds)) {
    if (!authoritativeIds.has(mediaId)) {
      console.log("[WORLD RECONCILE REMOVE]", mediaId);
      removeSharedMediaLifecycle(mediaId, "authoritative-reconcile");
    }
  }

  console.log("[WORLD RECONCILE OK]", {
    serverMedia: authoritativeIds.size,
    clientRemoteMedia: sharedRemoteMediaIds.size,
    players: avatars.size
  });
}

function createSharedSpritePlaceholder(mediaId: string, media: any) {
  if (managedPlacedMedia.has(mediaId) || sharedRemoteMediaIds.has(mediaId)) return;

  const placeholderMaterial = new pc.StandardMaterial();
  placeholderMaterial.diffuse = new pc.Color(0.18, 0.72, 1.0);
  placeholderMaterial.emissive = new pc.Color(0.04, 0.18, 0.28);
  placeholderMaterial.useLighting = false;
  placeholderMaterial.cull = pc.CULLFACE_NONE;
  placeholderMaterial.update();

  const plane = new pc.Entity(`SharedSprite_${mediaId}`);
  plane.addComponent("render", { type: "plane" });
  plane.render!.material = placeholderMaterial;
  plane.setPosition(media.x, media.y, media.z);
  plane.setLocalScale(media.scale, 1, media.scale);
  plane.setEulerAngles(90, media.rotationY, 0);
  app.root.addChild(plane);

  const remoteMedia = createMediaObject({
    title: media.title || "Shared Sprite",
    type: "sprite",
    entity: plane,
    playable: false,
    animated: false,
    behavior: []
  });
  remoteMedia.id = mediaId;
  xrMediaManager.register(remoteMedia);

  managedPlacedMedia.set(mediaId, {
    id: mediaId,
    title: `${media.title || "Sprite Artwork"} [SHARED]`,
    kind: "sprite",
    entity: plane
  });
  sharedRemoteMediaIds.add(mediaId);
  refreshMediaManagerUI();

  console.log("[SHARED PLACEHOLDER ADDED]", mediaId, media.assetRef || "(no asset ref)");
}

let spriteRecoveryDiagnostic: HTMLDivElement | null = null;
function showSpriteRecoveryDiagnostic(mediaId: string, message: string) {
  if (!spriteRecoveryDiagnostic) {
    spriteRecoveryDiagnostic = document.createElement("div");
    spriteRecoveryDiagnostic.style.cssText =
      "position:fixed;left:10px;bottom:10px;z-index:9999;max-width:92vw;padding:10px;" +
      "background:rgba(5,15,30,.95);color:#9fd0ff;border:1px solid #398cff;border-radius:9px;" +
      "font:600 11px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";
    document.body.appendChild(spriteRecoveryDiagnostic);
  }
  spriteRecoveryDiagnostic.textContent = `SPRITE RECOVERY\n${mediaId}\n${message}`;
}
async function createSharedSpriteFromAsset(mediaId: string, media: any) {
  if (managedPlacedMedia.has(mediaId) || sharedRemoteMediaIds.has(mediaId) || sharedMediaLoadingIds.has(mediaId)) return;
  sharedMediaLoadingIds.add(mediaId);
  const loadGeneration = bumpSharedMediaGeneration(mediaId);

  const assetRef = String(media.assetRef || "");
  if (!assetRef) {
    sharedMediaLoadingIds.delete(mediaId);
    console.warn("[SPRITE RECOVERY NO ASSET REF]", mediaId);
    createSharedSpritePlaceholder(mediaId, media);
    return;
  }

  try {
    console.log("[SPRITE RECOVERY 01 START]", mediaId, assetRef);
    const response = await fetchSharedAssetWithRetry(assetRef, `sprite:${mediaId}`);
    if (!isSharedMediaGenerationCurrent(mediaId, loadGeneration)) {
      console.log("[SPRITE RECOVERY CANCELLED / GENERATION]", mediaId);
      return;
    }

    const zipBlob = await response.blob();
    console.log("[SPRITE RECOVERY 02 ZIP]", mediaId, zipBlob.size);
    const zip = await JSZip.loadAsync(zipBlob);
    const entries = Object.values(zip.files);

    const pngEntry = entries.find(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".png")
    );
    const jsonEntry = entries.find(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".json")
    );
    if (!pngEntry || !jsonEntry) {
      throw new Error("Shared Sprite ZIP requires PNG + JSON.");
    }

    const pngBytes = await pngEntry.async("uint8array");
    const jsonText = await jsonEntry.async("text");
    const pngBlob = new Blob([pngBytes], { type: "image/png" });
    const meta = JSON.parse(jsonText);
    console.log("[SPRITE RECOVERY 03 ENTRIES]", mediaId, { png: pngEntry.name, json: jsonEntry.name });

    const imageURL = URL.createObjectURL(pngBlob);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Shared Sprite PNG load failed."));
      image.src = imageURL;
    });
    try { if (typeof image.decode === "function") await image.decode(); } catch {}
    console.log("[SPRITE RECOVERY 04 IMAGE]", mediaId, image.naturalWidth, image.naturalHeight);

    const frameWidth = Number(meta.frameWidth);
    const frameHeight = Number(meta.frameHeight);
    const columns = Number(meta.columns);
    const rows = Number(meta.rows);
    const declaredFrames = Number(meta.frames);
    const maxFrames = columns * rows;
    const frameCount = Math.max(1, Math.min(declaredFrames, maxFrames));
    const declaredFPS = Number(meta.fps);
    const durationMs = Number(meta.duration);
    const fps =
      declaredFPS > 0
        ? declaredFPS
        : durationMs > 0
          ? frameCount / (durationMs / 1000)
          : 4;

    if (
      !Number.isFinite(frameWidth) || frameWidth <= 0 ||
      !Number.isFinite(frameHeight) || frameHeight <= 0 ||
      !Number.isFinite(columns) || columns <= 0 ||
      !Number.isFinite(rows) || rows <= 0 ||
      !Number.isFinite(frameCount) || frameCount <= 0 ||
      !Number.isFinite(fps) || fps <= 0
    ) {
      URL.revokeObjectURL(imageURL);
      throw new Error("Shared Sprite JSON is invalid.");
    }

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = frameWidth;
    spriteCanvas.height = frameHeight;
    const context = spriteCanvas.getContext("2d", { alpha: true });
    if (!context) {
      URL.revokeObjectURL(imageURL);
      throw new Error("Shared Sprite Canvas unavailable.");
    }
    context.imageSmoothingEnabled = true;

    let frame = 0;
    let elapsed = 0;
    let playing = true;

    const drawFrame = (frameIndex: number) => {
      const safeFrame = ((frameIndex % frameCount) + frameCount) % frameCount;
      const column = safeFrame % columns;
      const row = Math.floor(safeFrame / columns);
      context.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
      context.drawImage(
        image,
        column * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        spriteCanvas.width,
        spriteCanvas.height
      );
    };

    drawFrame(0);

    // iOS Safari robustness: the canvas contains real RGBA pixels before
    // it becomes the PlayCanvas texture source.
    const texture = new pc.Texture(app.graphicsDevice, {
      format: pc.PIXELFORMAT_RGBA8,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      mipmaps: false
    });
    texture.setSource(spriteCanvas);
    texture.upload();
    console.log("[SPRITE RECOVERY 05 TEXTURE]", mediaId, spriteCanvas.width, spriteCanvas.height);

    // 0.14.7.4.2: initialize Texture before Material references it.
    const spriteMaterial = new pc.StandardMaterial();
    spriteMaterial.diffuseMap = texture;
    spriteMaterial.emissiveMap = texture;
    spriteMaterial.emissive = new pc.Color(1, 1, 1);
    spriteMaterial.opacityMap = texture;
    spriteMaterial.opacityMapChannel = "a";
    spriteMaterial.blendType = pc.BLEND_NORMAL;
    spriteMaterial.depthWrite = false;
    spriteMaterial.alphaTest = 0.05;
    spriteMaterial.useLighting = false;
    spriteMaterial.cull = pc.CULLFACE_NONE;
    spriteMaterial.update();

    const plane = new pc.Entity(`SharedSprite_${mediaId}`);
    plane.addComponent("render", { type: "plane" });
    plane.render!.material = spriteMaterial;
    plane.render!.castShadows = false;
    plane.setPosition(Number(media.x) || 0, Number(media.y) || 0, Number(media.z) || 0);
    const sharedScale = Number(media.scale) || 1;
    plane.setLocalScale(sharedScale, 1, sharedScale);
    plane.setEulerAngles(90, Number(media.rotationY) || 0, 0);
    app.root.addChild(plane);
    console.log("[SPRITE RECOVERY 05.5 PLANE READY]", mediaId);

    const remoteMedia = createMediaObject({
      title: media.title || "Shared Sprite",
      type: "sprite",
      entity: plane,
      playable: true,
      animated: true,
      playback: {
        play: () => { playing = true; },
        stop: () => { playing = false; },
        setLoop: () => { /* Sprite loops by design. */ }
      },
      behavior: []
    });
    remoteMedia.id = mediaId;
    xrMediaManager.register(remoteMedia);

    managedPlacedMedia.set(mediaId, {
      id: mediaId,
      title: `${media.title || "Sprite Artwork"} [SHARED]`,
      kind: "sprite",
      entity: plane
    });
    sharedRemoteMediaIds.add(mediaId);

    placedMediaRuntimes.push({
      id: mediaId,
      update: (dt: number) => {
        if (!playing) return;
        elapsed += dt;
        const frameDuration = 1 / fps;
        let changed = false;
        while (elapsed >= frameDuration) {
          elapsed -= frameDuration;
          frame = (frame + 1) % frameCount;
          changed = true;
        }
        if (changed) {
          drawFrame(frame);
          texture.upload();
        }
      },
      dispose: () => {
        texture.destroy();
        URL.revokeObjectURL(imageURL);
      }
    });

    refreshMediaManagerUI();
    console.log("[SPRITE RECOVERY 06 READY]", mediaId, { frameCount, fps });
    if (spriteRecoveryDiagnostic) { spriteRecoveryDiagnostic.remove(); spriteRecoveryDiagnostic = null; }
    sharedMediaLoadingIds.delete(mediaId);
  } catch (error) {
    const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[SPRITE RECOVERY ERROR]", mediaId, error);
    showSpriteRecoveryDiagnostic(mediaId, errorMessage);
    if (isSharedMediaGenerationCurrent(mediaId, loadGeneration)) {
      createSharedSpritePlaceholder(mediaId, media);
    }
  } finally {
    sharedMediaLoadingIds.delete(mediaId);
  }
}

function updateSharedSpritePlaceholder(mediaId: string, media: any) {
  const item = managedPlacedMedia.get(mediaId);
  if (!item || !sharedRemoteMediaIds.has(mediaId)) return;
  item.entity.setPosition(media.x, media.y, media.z);
  if (item.kind === "glb") {
    item.entity.setLocalScale(media.scale, media.scale, media.scale);
    item.entity.setEulerAngles(0, media.rotationY, 0);
  } else {
    item.entity.setLocalScale(media.scale, 1, media.scale);
    item.entity.setEulerAngles(90, media.rotationY, 0);
  }
}

function removeSharedMediaLifecycle(mediaId: string, reason = "server-remove") {
  console.log("[SHARED MEDIA CLEANUP START]", mediaId, reason);
  bumpSharedMediaGeneration(mediaId);
  sharedMediaLoadingIds.delete(mediaId);

  for (let i = placedMediaRuntimes.length - 1; i >= 0; i--) {
    const runtime = placedMediaRuntimes[i];
    if (runtime.id !== mediaId) continue;
    try { runtime.dispose?.(); }
    catch (error) { console.warn("[SHARED MEDIA RUNTIME DISPOSE ERROR]", mediaId, error); }
    placedMediaRuntimes.splice(i, 1);
  }

  const item = managedPlacedMedia.get(mediaId);
  if (item?.entity) {
    try { item.entity.destroy(); }
    catch (error) { console.warn("[SHARED MEDIA ENTITY DESTROY ERROR]", mediaId, error); }
  }

  try { xrMediaManager.unregister(mediaId); }
  catch (error) { console.warn("[SHARED MEDIA XR UNREGISTER ERROR]", mediaId, error); }

  managedPlacedMedia.delete(mediaId);
  sharedRemoteMediaIds.delete(mediaId);
  if (selectedManagedMediaId === mediaId) selectedManagedMediaId = null;
  refreshMediaManagerUI();
  console.log("[SHARED MEDIA CLEANUP COMPLETE]", mediaId, reason);
}

function removeSharedSpritePlaceholder(mediaId: string) {
  if (!sharedRemoteMediaIds.has(mediaId)) return;
  removeSharedMediaLifecycle(mediaId, "shared-state-remove");
}

async function publishCommittedSpriteToSharedWorld(mediaId: string, packageBlob: Blob | null) {
  console.log("[SPRITE PUBLISH 01 START]", mediaId);

  if (!activeRoom || !packageBlob) {
    console.error("[SPRITE PUBLISH ABORT]", {
      hasRoom: !!activeRoom,
      hasPackage: !!packageBlob
    });
    return;
  }

  const item = managedPlacedMedia.get(mediaId);
  const media = xrMediaManager.get(mediaId);
  if (!item || item.kind !== "sprite" || !media) {
    console.error("[SPRITE PUBLISH ABORT] media lookup/kind failed", {
      hasItem: !!item,
      kind: item?.kind,
      hasMedia: !!media
    });
    return;
  }

  // Keep immutable publish data before the placement editor clears its import globals.
  const assetRef = sharedAssetURL(mediaId, "zip");
  const position = item.entity.getPosition().clone();
  const rotationY = item.entity.getEulerAngles().y;
  const scale = item.entity.getLocalScale().x;
  const payload = {
    id: mediaId,
    title: media.title || "Sprite Artwork",
    type: "sprite",
    assetRef,
    x: position.x,
    y: position.y,
    z: position.z,
    rotationY,
    scale
  };

  try {
    console.log("[SPRITE PUBLISH 02 UPLOAD]", mediaId, packageBlob.size, assetRef);
    const uploadResponse = await fetch(assetRef, {
      method: "PUT",
      headers: { "Content-Type": "application/zip" },
      body: packageBlob
    });
    if (!uploadResponse.ok) {
      throw new Error(`Sprite asset upload failed: HTTP ${uploadResponse.status}`);
    }
    console.log("[SPRITE PUBLISH 03 UPLOADED]", mediaId);

    // Do not announce the Sprite to remote clients until Render can actually
    // serve and parse the ZIP. This removes the upload/Colyseus visibility race.
    const verifyResponse = await fetchSharedAssetWithRetry(assetRef, `sprite-publish:${mediaId}`);
    const verifyBlob = await verifyResponse.blob();
    if (verifyBlob.size < 32) throw new Error("Uploaded Sprite ZIP is unexpectedly small.");
    const verifyZip = await JSZip.loadAsync(verifyBlob);
    const verifyEntries = Object.values(verifyZip.files);
    const hasPNG = verifyEntries.some((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".png"));
    const hasJSON = verifyEntries.some((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".json"));
    if (!hasPNG || !hasJSON) throw new Error("Uploaded Sprite ZIP verification failed: PNG/JSON missing.");
    console.log("[SPRITE PUBLISH 04 VERIFIED]", mediaId, { bytes: verifyBlob.size, hasPNG, hasJSON });

    const sendMediaAdd = (reason: string) => {
      if (!activeRoom) return;
      activeRoom.send("media:add", payload);
      console.log("[SPRITE PUBLISH 05 MEDIA ADD]", mediaId, reason, payload);
    };

    sendMediaAdd("initial");

    // Recovery guard: if the authoritative room state still does not contain
    // this id, resend the same idempotent media:add. Colyseus messages are
    // reliable, but this also heals reconnect/state-timing races seen on iOS.
    const confirmDelays = [500, 1500, 3000];
    for (const delay of confirmDelays) {
      window.setTimeout(() => {
        if (!activeRoom) return;
        if (authoritativeMediaExists(mediaId)) {
          console.log("[SPRITE PUBLISH 06 AUTHORITATIVE]", mediaId, delay);
          return;
        }
        console.warn("[SPRITE PUBLISH RETRY MEDIA ADD]", mediaId, delay);
        sendMediaAdd(`retry-${delay}`);
      }, delay);
    }
  } catch (error) {
    console.error("[SPRITE PUBLISH ERROR]", mediaId, error);
  }
}


async function createSharedWebMFromAsset(mediaId: string, media: any) {
  if (managedPlacedMedia.has(mediaId) || sharedRemoteMediaIds.has(mediaId) || sharedMediaLoadingIds.has(mediaId)) return;

  const fallbackRef=String(media.fallbackRef || "");
  if(isIOSLikeDevice() && fallbackRef){
    console.log("[SHARED WEBM ALPHA FALLBACK -> SPRITE]",mediaId,fallbackRef);
    await createSharedSpriteFromAsset(mediaId,{title:media.title,assetRef:fallbackRef,x:media.x,y:media.y,z:media.z,rotationY:media.rotationY,scale:media.scale});
    return;
  }

  sharedMediaLoadingIds.add(mediaId);
  const loadGeneration = bumpSharedMediaGeneration(mediaId);
  const assetRef = String(media.assetRef || "");
  if (!assetRef) {
    console.error("[SHARED WEBM 01 RECEIVE] missing assetRef", mediaId);
    return;
  }

  let objectURL: string | null = null;
  let texture: pc.Texture | null = null;
  let video: HTMLVideoElement | null = null;

  try {
    console.log("[SHARED WEBM 01 RECEIVE]", mediaId, assetRef);
    console.log("[SHARED WEBM 02 FETCH START]", assetRef);

    const response = await fetchSharedAssetWithRetry(assetRef, `webm:${mediaId}`);

    const bytes = await response.arrayBuffer();
    console.log("[SHARED WEBM 03 FETCH OK]", mediaId, {
      bytes: bytes.byteLength,
      contentType: response.headers.get("content-type")
    });
    if (bytes.byteLength < 16) throw new Error("WebM payload is empty/too small.");

    const blob = new Blob([bytes], { type: "video/webm" });
    objectURL = URL.createObjectURL(blob);

    video = document.createElement("video");
    video.src = objectURL;
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Shared WebM decode/load failed. mediaError=${video?.error?.code ?? "unknown"}`));
      };
      const cleanup = () => {
        video?.removeEventListener("loadeddata", onReady);
        video?.removeEventListener("canplay", onReady);
        video?.removeEventListener("error", onError);
      };
      video!.addEventListener("loadeddata", onReady, { once: true });
      video!.addEventListener("canplay", onReady, { once: true });
      video!.addEventListener("error", onError, { once: true });
      video!.load();
    });

    console.log("[SHARED WEBM 04 VIDEO READY]", mediaId, {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration
    });

    try {
      await video.play();
      console.log("[SHARED WEBM 05 PLAY OK]", mediaId);
    } catch (error) {
      // Muted inline playback normally succeeds. If Safari blocks it,
      // the media object still loads and can be started by a later interaction.
      console.warn("[SHARED WEBM 05 PLAY WAIT]", mediaId, error);
    }

    texture = new pc.Texture(app.graphicsDevice, {
      format: pc.PIXELFORMAT_RGBA8,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      mipmaps: false
    });
    texture.setSource(video);

    const material = new pc.StandardMaterial();
    material.diffuseMap = texture;
    material.emissiveMap = texture;
    material.emissive = new pc.Color(1, 1, 1);
    material.opacityMap = texture;
    material.opacityMapChannel = "a";
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.alphaTest = 0.12;
    material.useLighting = false;
    material.cull = pc.CULLFACE_NONE;
    material.update();

    const plane = new pc.Entity(`SharedWebM_${mediaId}`);
    plane.addComponent("render", { type: "plane" });
    plane.render!.material = material;
    plane.render!.castShadows = true;
    plane.setPosition(Number(media.x), Number(media.y), Number(media.z));
    plane.setLocalScale(Number(media.scale) || 1, 1, Number(media.scale) || 1);
    plane.setEulerAngles(90, Number(media.rotationY) || 0, 0);
    app.root.addChild(plane);

    console.log("[SHARED WEBM 06 SCENE ADD]", mediaId);

    const remoteMedia = createMediaObject({
      title: media.title || "Shared WebM",
      type: "webm",
      entity: plane,
      playable: true,
      animated: true,
      playback: {
        play: async () => { await video!.play(); },
        stop: () => { video!.pause(); },
        setLoop: (loop: boolean) => { video!.loop = loop; }
      },
      behavior: []
    });
    remoteMedia.id = mediaId;
    xrMediaManager.register(remoteMedia);

    managedPlacedMedia.set(mediaId, {
      id: mediaId,
      title: `${media.title || "WebM Artwork"} [SHARED]`,
      kind: "webm",
      entity: plane
    });
    sharedRemoteMediaIds.add(mediaId);

    placedMediaRuntimes.push({
      id: mediaId,
      update: () => {
        if (video && texture && video.readyState >= 2) texture.upload();
      },
      dispose: () => {
        video?.pause();
        texture?.destroy();
        if (objectURL) URL.revokeObjectURL(objectURL);
      }
    });

    sharedMediaLoadingIds.delete(mediaId);
    refreshMediaManagerUI();
    console.log("[SHARED WEBM 07 REGISTERED]", mediaId);
    console.log("[SHARED WEBM 08 READY]", mediaId);
  } catch (error) {
    sharedMediaLoadingIds.delete(mediaId);
    console.error("[SHARED WEBM LOAD ERROR]", mediaId, error);
    video?.pause();
    texture?.destroy();
    if (objectURL) URL.revokeObjectURL(objectURL);
  }
}

function isIOSLikeDevice() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent||"") ||
    (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
}
function canvasToPNGBlob(canvas:HTMLCanvasElement):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG encode failed")),"image/png"));
}
async function buildWebMAlphaFallbackZip(webmBlob:Blob):Promise<Blob|null>{
  const url=URL.createObjectURL(webmBlob), video=document.createElement("video");
  video.src=url; video.muted=true; video.playsInline=true; video.preload="auto";
  try{
    await new Promise<void>((resolve,reject)=>{
      const ok=()=>{clean();resolve()}, bad=()=>{clean();reject(new Error("metadata failed"))};
      const clean=()=>{video.removeEventListener("loadedmetadata",ok);video.removeEventListener("error",bad)};
      video.addEventListener("loadedmetadata",ok,{once:true}); video.addEventListener("error",bad,{once:true}); video.load();
    });
    const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:2;
    const fps=6, frames=Math.max(2,Math.min(48,Math.ceil(duration*fps)));
    const sw=Math.max(1,video.videoWidth||512), sh=Math.max(1,video.videoHeight||512);
    const k=Math.min(1,384/Math.max(sw,sh)), fw=Math.max(1,Math.round(sw*k)), fh=Math.max(1,Math.round(sh*k));
    const columns=Math.ceil(Math.sqrt(frames)), rows=Math.ceil(frames/columns);
    const sheet=document.createElement("canvas"); sheet.width=fw*columns; sheet.height=fh*rows;
    const ctx=sheet.getContext("2d",{alpha:true}); if(!ctx) throw new Error("canvas unavailable");
    const seek=async(t:number)=>new Promise<void>((resolve,reject)=>{
      const ok=()=>{clean();resolve()}, bad=()=>{clean();reject(new Error("seek failed"))};
      const clean=()=>{video.removeEventListener("seeked",ok);video.removeEventListener("error",bad)};
      video.addEventListener("seeked",ok,{once:true});video.addEventListener("error",bad,{once:true});
      video.currentTime=Math.min(Math.max(0,t),Math.max(0,duration-.001));
    });
    for(let i=0;i<frames;i++){await seek(i/frames*duration);ctx.drawImage(video,(i%columns)*fw,Math.floor(i/columns)*fh,fw,fh)}
    const png=await canvasToPNGBlob(sheet), zip=new JSZip();
    zip.file("fallback.png",png);
    zip.file("fallback.json",JSON.stringify({frameWidth:fw,frameHeight:fh,columns,rows,frames,fps,duration:duration*1000},null,2));
    const out=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    console.log("[WEBM ALPHA FALLBACK BUILT]",{frames,fps,bytes:out.size}); return out;
  }catch(e){console.warn("[WEBM ALPHA FALLBACK BUILD FAILED]",e);return null}
  finally{video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(url)}
}

async function publishCommittedWebMToSharedWorld(mediaId:string,webmBlob:Blob|null){
  console.log("[SHARED WEBM PUBLISH START]",mediaId);
  if(!activeRoom||!webmBlob)return;
  const item=managedPlacedMedia.get(mediaId), media=xrMediaManager.get(mediaId);
  if(!item||item.kind!=="webm"||!media)return;
  const assetRef=sharedAssetURL(mediaId,"webm");
  const fallbackRef=sharedAssetURL(`${mediaId}-fallback`,"zip");
  try{
    const fallbackPromise=buildWebMAlphaFallbackZip(webmBlob);
    const up=await fetch(assetRef,{method:"PUT",headers:{"Content-Type":"video/webm"},body:webmBlob});
    if(!up.ok)throw new Error(`WebM upload HTTP ${up.status}`);
    let sharedFallback="";
    const zip=await fallbackPromise;
    if(zip){
      const fu=await fetch(fallbackRef,{method:"PUT",headers:{"Content-Type":"application/zip"},body:zip});
      if(fu.ok){sharedFallback=fallbackRef;console.log("[SHARED WEBM FALLBACK UPLOADED]",fallbackRef)}
    }
    const p=item.entity.getPosition(),r=item.entity.getEulerAngles(),s=item.entity.getLocalScale();
    activeRoom.send("media:add",{id:mediaId,title:media.title||"WebM Artwork",type:"webm",
      assetRef,fallbackRef:sharedFallback,x:p.x,y:p.y,z:p.z,rotationY:r.y,scale:s.x});
    console.log("[SHARED WEBM MEDIA SENT]",mediaId,{assetRef,fallbackRef:sharedFallback||"(none)"});
  }catch(e){console.error("[SHARED WEBM PUBLISH ERROR]",mediaId,e)}
}

// Prototype 0.16.0 / SHARED AUDIO MEDIA CORE
const audioElements = new Map<string, HTMLAudioElement>();
function audioConfigFromRef(ref:string){
  try { const u=new URL(ref, window.location.href); return { volume:Math.max(0,Math.min(1,Number(u.searchParams.get("volume")??.8))), loop:u.searchParams.get("loop")!=="0", spatial:u.searchParams.get("spatial")!=="0", distance:Math.max(2,Number(u.searchParams.get("distance")??12)) }; }
  catch { return {volume:.8,loop:true,spatial:true,distance:12}; }
}
function makeAudioMarker(name:string){
  const e=new pc.Entity(name); e.addComponent("render",{type:"sphere"}); e.setLocalScale(.34,.34,.34);
  const m=new pc.StandardMaterial(); m.diffuse=new pc.Color(.15,.55,1); m.emissive=new pc.Color(.03,.12,.3); m.update(); e.render!.material=m; app.root.addChild(e); return e;
}
function configureSpatialAudioElement(id:string, el:HTMLAudioElement, entity:pc.Entity, cfg:{volume:number;loop:boolean;spatial:boolean;distance:number}){
  el.loop=cfg.loop; el.volume=cfg.volume; el.preload="auto"; audioElements.set(id,el);
  // Browser-native stereo panning gives a robust mobile spatial cue. Distance attenuation is updated each frame.
  (el as any).__xrSpatial=cfg.spatial; (el as any).__xrDistance=cfg.distance; (el as any).__xrEntity=entity; (el as any).__xrBaseVolume=cfg.volume;
}
async function createSharedAudioFromAsset(mediaId:string, media:any){
  if(managedPlacedMedia.has(mediaId)||sharedMediaLoadingIds.has(mediaId)) return;
  sharedMediaLoadingIds.add(mediaId); const gen=bumpSharedMediaGeneration(mediaId); const ref=String(media.assetRef||"");
  try{
    const response=await fetchSharedAssetWithRetry(ref,`audio:${mediaId}`); const blob=await response.blob();
    if(!isSharedMediaGenerationCurrent(mediaId,gen)) return;
    const url=URL.createObjectURL(blob); const el=new Audio(url); const cfg=audioConfigFromRef(ref); const entity=makeAudioMarker(`SharedAudio_${mediaId}`);
    entity.setPosition(Number(media.x),Number(media.y),Number(media.z)); entity.setEulerAngles(0,Number(media.rotationY)||0,0); entity.setLocalScale(Number(media.scale)||1,Number(media.scale)||1,Number(media.scale)||1);
    configureSpatialAudioElement(mediaId,el,entity,cfg);
    const remote=createMediaObject({title:media.title||"Audio",type:"audio" as any,entity,playable:true,animated:false,playback:{play:async()=>{try{console.log("[AUDIO PLAY]",mediaId,{readyState:el.readyState,volume:el.volume});await el.play()}catch(e){console.warn("[AUDIO PLAY BLOCKED]",e)}},stop:()=>{el.pause();el.currentTime=0},setLoop:(v:boolean)=>{el.loop=v}},behavior:[{id:"proximity-play",trigger:"user-proximity",distance:3,enterAction:"play",leaveAction:"stop",enabled:false}]});
    (remote as any).id=mediaId; xrMediaManager.register(remote as any); managedPlacedMedia.set(mediaId,{id:mediaId,title:`${media.title||"Audio"} [SHARED]`,kind:"audio",entity}); sharedRemoteMediaIds.add(mediaId);
    placedMediaRuntimes.push({id:mediaId,dispose:()=>{el.pause();audioElements.delete(mediaId);URL.revokeObjectURL(url);if(entity.parent)entity.destroy()}}); sharedMediaLoadingIds.delete(mediaId); refreshMediaManagerUI();
  }catch(e){sharedMediaLoadingIds.delete(mediaId);console.error("[SHARED AUDIO LOAD ERROR]",mediaId,e)}
}
async function publishCommittedAudioToSharedWorld(mediaId:string, blob:Blob|null, ext:"mp3"|"wav"){
  if(!activeRoom||!blob)return; const item=managedPlacedMedia.get(mediaId), media=xrMediaManager.get(mediaId); if(!item||!media)return;
  const cfg={volume:Number(audioVolume.value),loop:audioLoop.checked,spatial:audioSpatial.checked,distance:Number(audioDistance.value)};
  const base=sharedAssetURL(mediaId,ext); const up=await fetch(base,{method:"PUT",headers:{"Content-Type":ext==="mp3"?"audio/mpeg":"audio/wav"},body:blob}); if(!up.ok)throw new Error(`Audio upload HTTP ${up.status}`);
  const ref=`${base}?volume=${cfg.volume}&loop=${cfg.loop?1:0}&spatial=${cfg.spatial?1:0}&distance=${cfg.distance}`; const pos=item.entity.getPosition(), rot=item.entity.getEulerAngles(), sc=item.entity.getLocalScale();
  activeRoom.send("media:add",{id:mediaId,title:media.title||"Audio",type:"audio",assetRef:ref,x:pos.x,y:pos.y,z:pos.z,rotationY:rot.y,scale:sc.x});
}

async function createSharedGLBFromAsset(mediaId: string, media: any) {
  if (managedPlacedMedia.has(mediaId) || sharedRemoteMediaIds.has(mediaId) || sharedMediaLoadingIds.has(mediaId)) return;
  sharedMediaLoadingIds.add(mediaId);
  const loadGeneration = bumpSharedMediaGeneration(mediaId);
  const assetRef = String(media.assetRef || "");
  if (!assetRef) {
    sharedMediaLoadingIds.delete(mediaId);
    return;
  }

  let glbURL: string | null = null;
  let asset: pc.Asset | null = null;
  let holder: pc.Entity | null = null;

  try {
    console.log("[SHARED GLB 01 RECEIVE]", mediaId, media);
    const response = await fetchSharedAssetWithRetry(assetRef, `glb:${mediaId}`);
    if (!isSharedMediaGenerationCurrent(mediaId, loadGeneration)) {
      console.log("[MEDIA LOAD CANCELLED / GENERATION]", mediaId);
      sharedMediaLoadingIds.delete(mediaId);
      return;
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 20) throw new Error("GLB payload too small.");
    glbURL = URL.createObjectURL(new Blob([buffer], { type: "model/gltf-binary" }));

    asset = await new Promise<pc.Asset>((resolve, reject) => {
      app.assets.loadFromUrlAndFilename(glbURL!, `${mediaId}.glb`, "container", (error, loaded) => {
        if (error || !loaded) reject(error instanceof Error ? error : new Error(String(error || "GLB load failed")));
        else resolve(loaded);
      });
    });

    const container: any = asset.resource;
    if (!container?.instantiateRenderEntity) throw new Error("No RenderEntity factory.");

    const modelEntity = container.instantiateRenderEntity() as pc.Entity;
    holder = new pc.Entity(`SharedGLB_${mediaId}`);
    const normalizer = new pc.Entity(`SharedGLBNormalizer_${mediaId}`);
    holder.addChild(normalizer);
    normalizer.addChild(modelEntity);
    app.root.addChild(holder);

    // Exact same normalization as local GLB import.
    normalizeImportedGLB(modelEntity, normalizer);

    const s = Math.max(0.0001, Number(media.scale) || 1);
    holder.setPosition(Number(media.x), Number(media.y), Number(media.z));
    holder.setEulerAngles(0, Number(media.rotationY) || 0, 0);
    holder.setLocalScale(s, s, s);

    console.log("[SHARED GLB NORMALIZATION PARITY]", mediaId, {
      holder: holder.getPosition().toString(),
      normalizer: normalizer.getLocalPosition().toString()
    });

    const entries: any[] = Array.isArray(container.animations) ? container.animations : [];
    const clips = entries.map((entry: any, index: number) => ({
      track: entry?.resource ?? entry,
      displayName: String(entry?.resource?.name || entry?.name || `Animation ${index + 1}`),
      stateName: `GLB_Animation_${index + 1}`
    })).filter((clip: any) => !!clip.track);

    let anim: any = null;
    let selected = 0;
    let loop = true;

    if (clips.length) {
      modelEntity.addComponent("anim", { activate: false, speed: 1 });
      anim = modelEntity.anim;
      anim.rootBone = modelEntity;
      clips.forEach((clip: any) => anim.assignAnimation(clip.stateName, clip.track, undefined, 1, loop));
      anim.rebind();
      anim.baseLayer.play(clips[0].stateName);
      anim.playing = true;
    }

    const play = () => {
      if (!anim || !clips.length) return;
      const clip = clips[selected] || clips[0];
      anim.assignAnimation(clip.stateName, clip.track, undefined, 1, loop);
      anim.rebind();
      anim.baseLayer.play(clip.stateName);
      anim.playing = true;
    };
    const stop = () => {
      if (!anim) return;
      anim.baseLayer.pause();
      anim.baseLayer.activeStateCurrentTime = 0;
      anim.playing = false;
    };

    const remote = createMediaObject({
      title: media.title || "Shared GLB",
      type: "glb",
      entity: holder,
      playable: clips.length > 0,
      animated: clips.length > 0,
      playback: clips.length ? {
        play,
        stop,
        setLoop: (v: boolean) => { loop = v; },
        getClips: () => clips.map((c: any) => c.displayName),
        playClip: (name: string) => {
          const i = clips.findIndex((c: any) => c.displayName === name);
          selected = i >= 0 ? i : 0;
          play();
        }
      } : undefined,
      behavior: []
    });
    remote.id = mediaId;
    xrMediaManager.register(remote);

    managedPlacedMedia.set(mediaId, {
      id: mediaId,
      title: `${media.title || "GLB Artwork"} [SHARED]`,
      kind: "glb",
      entity: holder
    });
    sharedRemoteMediaIds.add(mediaId);

    placedMediaRuntimes.push({
      id: mediaId,
      update: () => {},
      dispose: () => {
        stop();
        if (holder?.parent) holder.destroy();
        if (asset) { asset.unload(); app.assets.remove(asset); }
        if (glbURL) URL.revokeObjectURL(glbURL);
      }
    });

    sharedMediaLoadingIds.delete(mediaId);
    refreshMediaManagerUI();
    console.log("[SHARED GLB READY / TRANSFORM PARITY]", mediaId);
    console.log("[WORLD RECOVERY MEDIA READY]", mediaId, "glb");
  } catch (error) {
    sharedMediaLoadingIds.delete(mediaId);
    console.error("[SHARED GLB LOAD ERROR]", mediaId, error);
    if (holder?.parent) holder.destroy();
    if (asset) { try { asset.unload(); } catch {} try { app.assets.remove(asset); } catch {} }
    if (glbURL) try { URL.revokeObjectURL(glbURL); } catch {}
  }
}

async function publishCommittedGLBToSharedWorld(mediaId: string, glbBlob: Blob | null) {
  console.log("[SHARED GLB PUBLISH START]", mediaId);

  if (!activeRoom || !glbBlob) {
    console.error("[SHARED GLB PUBLISH ABORT]", {
      hasRoom: !!activeRoom,
      hasGLB: !!glbBlob
    });
    return;
  }

  const item = managedPlacedMedia.get(mediaId);
  const media = xrMediaManager.get(mediaId);
  if (!item || item.kind !== "glb" || !media) {
    console.error("[SHARED GLB PUBLISH ABORT] media lookup/kind failed");
    return;
  }

  const assetRef = sharedAssetURL(mediaId, "glb");

  try {
    const uploadResponse = await fetch(assetRef, {
      method: "PUT",
      headers: { "Content-Type": "model/gltf-binary" },
      body: glbBlob
    });
    if (!uploadResponse.ok) {
      throw new Error(`GLB upload failed: HTTP ${uploadResponse.status}`);
    }

    const position = item.entity.getPosition();
    const rotation = item.entity.getEulerAngles();
    const scale = item.entity.getLocalScale();

    activeRoom.send("media:add", {
      id: mediaId,
      title: media.title || "GLB Artwork",
      type: "glb",
      assetRef,
      x: position.x,
      y: position.y,
      z: position.z,
      rotationY: rotation.y,
      scale: scale.x
    });

    console.log("[SHARED GLB MEDIA SENT]", mediaId, assetRef);
  } catch (error) {
    console.error("[SHARED GLB PUBLISH ERROR]", mediaId, error);
  }
}


async function fetchSharedAssetWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < SHARED_ASSET_RETRY_DELAYS.length; attempt++) {
    const delay = SHARED_ASSET_RETRY_DELAYS[attempt];
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      console.log("[ASSET RECOVERY TRY]", label, attempt + 1, url);
      const response = await fetch(url, { cache: "no-store", mode: "cors" });
      if (response.ok) {
        console.log("[ASSET RECOVERY OK]", label, attempt + 1);
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Asset recovery failed: ${label}`);
}

function resetClientWorldForReentry() {
  console.log("[WORLD RECOVERY RESET START]");
  if (sharedWorldReconcileTimer !== null) {
    window.clearInterval(sharedWorldReconcileTimer);
    sharedWorldReconcileTimer = null;
  }

  // Remove every avatar from the previous local room view.
  for (const sessionId of Array.from(avatars.keys())) {
    removeAvatar(sessionId);
  }

  // Remove only remote/shared reconstructions. Local creator objects are
  // allowed to remain until the page itself is replaced; on a fresh reload
  // this collection is empty.
  for (const mediaId of Array.from(sharedRemoteMediaIds)) {
    removeSharedSpritePlaceholder(mediaId);
  }

  sharedMediaLoadingIds.clear();
  selectedManagedMediaId = null;
  editingManagedMediaId = null;
  refreshMediaManagerUI();
  console.log("[WORLD RECOVERY RESET DONE]");
}

// =========================================================
// ENTER WORLD
// =========================================================

async function enterWorld() {
  enterButton.disabled = true;
  status.textContent = "接続しています…";

  if (activeRoom) {
    try {
      console.log("[SESSION REENTRY] leaving previous room", activeRoom.sessionId);
      await activeRoom.leave(true);
    } catch (error) {
      console.warn("[SESSION REENTRY] previous leave warning", error);
    }
    activeRoom = null;
    currentSessionId = "";
  }
  resetClientWorldForReentry();

  const name = (nameInput.value.trim() || "Guest").slice(0, 16);
  const roomCode = (roomInput.value.trim() || "ART001")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16);

  roomInput.value = roomCode;

  try {
    const client = new Client(SERVER_URL);
    const room = await client.joinOrCreate("shared_world", { name, roomCode, clientId: persistentClientId });
    activeRoom = room;
    currentSessionId = room.sessionId;
    sharedStateDiagnostic.connection = "OPEN";
    sharedStateDiagnostic.lastError = "-";
    refreshSharedStateDiagnosticPanel();

    const $ = getStateCallbacks(room);
    $(room.state).players.onAdd((player: any, sessionId: string) => {
      createAvatar(sessionId, player);
      $(player).onChange(() => {
        const avatar = avatars.get(sessionId);
        if (!avatar) return;
        avatar.target.set(player.x, player.y, player.z);
        avatar.name = player.name;
        avatar.名前ラベル.textContent = player.name;
        avatar.entity.setEulerAngles(0, player.rotationY ?? 0, 0);
      });
    });

    $(room.state).players.onRemove((_player: any, sessionId: string) => {
      removeAvatar(sessionId);
    });

    // Prototype 0.14.2 / Shared Media Receive Fix.
    // Colyseus 0.18: subscribe through the state callback proxy/path.
    const sharedMedia = $(room.state as any).mediaObjects;

    sharedMedia.onAdd((media: any, mediaId: string) => {
      sharedStateDiagnostic.onAdd += 1;
      sharedStateDiagnostic.lastMediaId = mediaId;
      refreshSharedStateDiagnosticPanel();
      console.log("[0.15.2 DIAG ONADD]", mediaId, String(media?.type || ""));
      console.log("[0.15.1.1 MEDIA ONADD]", mediaId, String(media?.type || ""));
      console.log("[SHARED RECEIVE ADD]", mediaId, media);

      // onAdd already carries the authoritative media object. Do not perform
      // a second raw MapSchema lookup before dispatching it.
      console.log("[MEDIA ONADD DIRECT]", mediaId, String(media?.type || ""), {
        stateVisible: authoritativeMediaExists(mediaId)
      });
      if (!managedPlacedMedia.has(mediaId)) {
        void ensureSharedMediaFromState(mediaId, media);
      }

      $(media).onChange(() => {
        console.log("[SHARED RECEIVE CHANGE]", mediaId);
        if (sharedRemoteMediaIds.has(mediaId)) {
          updateSharedSpritePlaceholder(mediaId, media);
        }
      });
    });

    sharedMedia.onRemove((_media: any, mediaId: string) => {
      console.log("[SHARED RECEIVE REMOVE]", mediaId);
      bumpSharedMediaGeneration(mediaId);
      sharedMediaLoadingIds.delete(mediaId);
      removeSharedSpritePlaceholder(mediaId);
      window.setTimeout(() => reconcileWorldFromServerState(), 80);
    });

    console.log("[SHARED RECEIVE LISTENER READY]");

    // Prototype 0.15.1.2 / LIVE MEDIA SNAPSHOT RECOVERY
    // The normal MapSchema callback remains the fastest path. This explicit
    // snapshot is a safety net for mobile clients that miss a live onAdd.
    room.onMessage("media:snapshot", (payload: any) => {
      const list = Array.isArray(payload?.mediaObjects) ? payload.mediaObjects : [];
      sharedStateDiagnostic.snapshotRx += 1;
      sharedStateDiagnostic.serverMedia = list.length;
      if (list.length) sharedStateDiagnostic.lastMediaId = String(list[list.length - 1]?.id || "-");
      refreshSharedStateDiagnosticPanel();
      const authoritativeIds = new Set<string>();
      console.log("[0.15.1.2 SNAPSHOT RECEIVE]", list.length);

      for (const media of list) {
        const mediaId = String(media?.id || "");
        if (!mediaId) continue;
        authoritativeIds.add(mediaId);
        if (!managedPlacedMedia.has(mediaId) && !sharedMediaLoadingIds.has(mediaId)) {
          console.log("[0.15.1.2 SNAPSHOT RECOVER ADD]", mediaId, String(media?.type || ""));
          void ensureSharedMediaFromState(mediaId, media).catch(setSharedStateDiagnosticError);
        } else if (sharedRemoteMediaIds.has(mediaId)) {
          updateSharedSpritePlaceholder(mediaId, media);
        }
      }

      for (const mediaId of Array.from(sharedRemoteMediaIds)) {
        if (!authoritativeIds.has(mediaId)) {
          console.log("[0.15.1.2 SNAPSHOT RECOVER REMOVE]", mediaId);
          removeSharedMediaLifecycle(mediaId, "snapshot-reconcile");
        }
      }
    });

    const requestLiveMediaSnapshot = () => {
      if (!activeRoom || activeRoom !== room) return;
      sharedStateDiagnostic.snapshotTx += 1;
      refreshSharedStateDiagnosticPanel();
      room.send("media:snapshot:request", {});
    };

    // Prototype 0.15.1.1: register transient Action messages only AFTER the
    // proven Colyseus state callback tree is fully attached. If an Action
    // arrives while an asset is still reconstructing, queue the latest Action
    // and apply it as soon as that media object becomes ready.
    room.onMessage("media:action", (payload: any) => {
      sharedStateDiagnostic.actionRx += 1;
      const mediaId = String(payload?.id || "");
      sharedStateDiagnostic.lastMediaId = mediaId || "-";
      refreshSharedStateDiagnosticPanel();
      const action = String(payload?.action || "none") as XRBehaviorActionId;
      const source = String(payload?.source || "");
      const params = payload?.params as XRTransformActionParams | undefined;
      console.log("[0.15.3 ACTION RECEIVE]", mediaId, action, source, params);
      const object = xrMediaManager.get(mediaId);
      if (!object) {
        pendingSharedActions.set(mediaId, { action, source, params });
        console.log("[0.15.1.1 ACTION QUEUED / MEDIA NOT READY]", mediaId, action);
        return;
      }
      runXRBehaviorAction(object, action, params);
      console.log("[0.15.3 ACTION EXECUTE]", mediaId, action);
    });

    console.log("[WORLD SNAPSHOT READY]", {
      sessionId: room.sessionId,
      players: (room.state as any).players?.size ?? "callback-managed",
      mediaObjects: (room.state as any).mediaObjects?.size ?? "callback-managed"
    });

    // Authoritative recovery: reconstruct from current server state now,
    // then continuously heal missed ADD/REMOVE/UPDATE events.
    window.setTimeout(() => {
      reconcileWorldFromServerState();
      requestLiveMediaSnapshot();
    }, 250);
    sharedWorldReconcileTimer = window.setInterval(() => {
      reconcileWorldFromServerState();
      requestLiveMediaSnapshot();
    }, 1500);

    roomLabel.textContent = `ROOM ${roomCode}`;
    status.textContent = "接続しました";
    lobby.classList.add("hidden");
    hud.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    status.textContent = `接続失敗: ${error instanceof Error ? error.message : String(error)}`;
    enterButton.disabled = false;
  }
}

window.addEventListener("pagehide", () => {
  sharedStateDiagnostic.connection = "CLOSED";
  refreshSharedStateDiagnosticPanel();
  if (sharedWorldReconcileTimer !== null) {
    window.clearInterval(sharedWorldReconcileTimer);
    sharedWorldReconcileTimer = null;
  }
  if (activeRoom) {
    console.log("[SESSION PAGEHIDE LEAVE]", activeRoom.sessionId);
    void activeRoom.leave(true).catch(() => {});
  }
});

enterButton.addEventListener("click", enterWorld);
roomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") enterWorld(); });
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") enterWorld(); });

// =========================================================
// Prototype 0.9 / ADD ARTWORK PANEL
// =========================================================

function openArtworkPanel() {
  addArtworkPanel?.classList.remove("hidden");
}

function closeArtworkPanelUI() {
  addArtworkPanel?.classList.add("hidden");
}

addArtworkButton?.addEventListener("click", openArtworkPanel);
closeArtworkPanel?.addEventListener("click", closeArtworkPanelUI);
cancelArtworkButton?.addEventListener("click", closeArtworkPanelUI);

// =========================================================
// Prototype 0.9 / MEDIA TYPE + FILE SELECT
// =========================================================

let artworkMediaType: "webm" | "sprite" | "glb" | "audio" = "webm";

function updateArtworkModeUI() {
  const isWebM = artworkMediaType === "webm";
  const isSprite = artworkMediaType === "sprite";
  const isGLB = artworkMediaType === "glb";
  const isAudio = artworkMediaType === "audio";

  webmArtworkMode?.classList.toggle("active", isWebM);
  spriteArtworkMode?.classList.toggle("active", isSprite);
  glbArtworkMode?.classList.toggle("active", isGLB);
  audioArtworkMode?.classList.toggle("active", isAudio);
  audioSettingsPanel.style.display = isAudio ? "block" : "none";

  if (artworkFileInput) {
    artworkFileInput.value = "";

    if (isWebM) {
      artworkFileInput.accept = ".webm,video/webm";
    } else if (isSprite) {
      artworkFileInput.accept = ".zip,application/zip";
    } else if (isGLB) {
      artworkFileInput.accept = ".glb,model/gltf-binary";
    } else {
      artworkFileInput.accept = ".mp3,.wav,audio/mpeg,audio/wav";
    }
  }

  if (artworkFileName) {
    artworkFileName.textContent = "NO FILE SELECTED";
  }

  if (addArtworkToWorldButton) {
    addArtworkToWorldButton.disabled = true;
  }
}

webmArtworkMode?.addEventListener("click", () => {
  artworkMediaType = "webm";
  updateArtworkModeUI();
});

spriteArtworkMode?.addEventListener("click", () => {
  artworkMediaType = "sprite";
  updateArtworkModeUI();
});

glbArtworkMode?.addEventListener("click", () => {
  artworkMediaType = "glb";
  updateArtworkModeUI();
});
audioArtworkMode?.addEventListener("click",()=>{ artworkMediaType="audio"; updateArtworkModeUI(); });

selectArtworkFile?.addEventListener("click", () => {
  artworkFileInput?.click();
});

artworkFileInput?.addEventListener("change", () => {
  const file = artworkFileInput.files?.[0];

  if (!file) {
    if (artworkFileName) artworkFileName.textContent = "NO FILE SELECTED";
    if (addArtworkToWorldButton) addArtworkToWorldButton.disabled = true;
    return;
  }

  const lowerName = file.name.toLowerCase();
  const valid =
    artworkMediaType === "webm"
      ? lowerName.endsWith(".webm")
      : artworkMediaType === "sprite"
        ? lowerName.endsWith(".zip")
        : artworkMediaType === "glb"
          ? lowerName.endsWith(".glb")
          : lowerName.endsWith(".mp3") || lowerName.endsWith(".wav");

  if (!valid) {
    if (artworkFileName) artworkFileName.textContent = "UNSUPPORTED FILE";
    if (addArtworkToWorldButton) addArtworkToWorldButton.disabled = true;
    return;
  }

  if (artworkFileName) artworkFileName.textContent = file.name;
  if (addArtworkToWorldButton) addArtworkToWorldButton.disabled = false;
});

// =========================================================
// Prototype 0.9 / IMPORTED WEBM ARTWORK
// =========================================================

type ImportedArtworkKind = "webm" | "sprite" | "glb" | "audio" | null;

let importedArtworkKind: ImportedArtworkKind = null;
let importedArtworkEntity: pc.Entity | null = null;
let importedArtworkVideo: HTMLVideoElement | null = null;
let importedArtworkTexture: pc.Texture | null = null;
let importedArtworkObjectURL: string | null = null;
let importedAudioBlob: Blob | null = null;
let importedAudioExt: "mp3" | "wav" = "mp3";
let importedAudioElement: HTMLAudioElement | null = null;

// Prototype 0.10 / Stage 2 / GLB resources
let importedGLBAsset: pc.Asset | null = null;
let importedGLBObjectURL: string | null = null;
let importedGLBModelEntity: pc.Entity | null = null;


// Prototype 0.10 / Stage 3 / GLB Animation state
type ImportedGLBAnimationClip = {
  displayName: string;
  stateName: string;
  track: any;
};

let importedGLBAnimationClips: ImportedGLBAnimationClip[] = [];
let importedGLBSelectedAnimation = 0;
let importedGLBAnimationPlaying = false;

function resetGLBAnimationUI() {
  importedGLBAnimationClips = [];
  importedGLBSelectedAnimation = 0;
  importedGLBAnimationPlaying = false;

  glbAnimationSelect.innerHTML = "";
  glbAnimationLoop.checked = true;
  glbAnimationPlay.disabled = true;
  glbAnimationStop.disabled = true;
  glbAnimationStatus.textContent = "NO ANIMATION";
  glbAnimationPanel.style.display = "none";
}

function makeAnimationStateName(index: number) {
  // PlayCanvas uses dots in state names as blend-tree path separators.
  // Keep the original clip name only for display and use a safe internal state name.
  return `GLB_Animation_${index + 1}`;
}

function setupGLBAnimations(modelEntity: pc.Entity, containerResource: any) {
  resetGLBAnimationUI();

  const animationEntries = Array.isArray(containerResource?.animations)
    ? (containerResource.animations as any[])
    : [];

  // PlayCanvas container animations are animation Asset objects in this
  // runtime. AnimComponent.assignAnimation() requires the Asset.resource
  // (AnimTrack), not the Asset wrapper itself. Support both shapes so this
  // remains compatible if the engine returns AnimTrack objects directly.
  const tracks = animationEntries
    .map((entry) => {
      const track = entry?.resource ?? entry;
      if (!track) return null;

      return {
        asset: entry,
        track,
        displayName: String(
          track?.name || entry?.name || "Animation"
        )
      };
    })
    .filter(Boolean) as Array<{
      asset: any;
      track: any;
      displayName: string;
    }>;

  if (tracks.length === 0) {
    glbAnimationPanel.style.display = "block";
    glbAnimationStatus.textContent = "NO ANIMATION CLIP DETECTED";
    return;
  }

  modelEntity.addComponent("anim", {
    activate: false,
    speed: 1
  });

  const anim = modelEntity.anim;
  if (!anim) {
    glbAnimationPanel.style.display = "block";
    glbAnimationStatus.textContent = "ANIMATION COMPONENT ERROR";
    return;
  }

  // Stage 3.1: bind the AnimComponent explicitly to the instantiated GLB hierarchy.
  // This is important for skinned GLB files whose bone nodes live below this root.
  anim.rootBone = modelEntity;

  importedGLBAnimationClips = tracks.map((entry, index) => {
    const rawName = entry.displayName || `Animation ${index + 1}`;
    const stateName = makeAnimationStateName(index);
    const track = entry.track;

    anim.assignAnimation(
      stateName,
      track,
      undefined,
      1,
      glbAnimationLoop.checked
    );

    return {
      displayName: rawName,
      stateName,
      track
    };
  });

  for (const clip of importedGLBAnimationClips) {
    const option = document.createElement("option");
    option.value = clip.stateName;
    option.textContent = clip.displayName;
    glbAnimationSelect.appendChild(option);
  }

  importedGLBSelectedAnimation = 0;
  glbAnimationSelect.selectedIndex = 0;
  glbAnimationPlay.disabled = false;
  glbAnimationStop.disabled = false;
  glbAnimationStatus.textContent =
    `${importedGLBAnimationClips.length} CLIP${importedGLBAnimationClips.length === 1 ? "" : "S"} DETECTED`;
  glbAnimationPanel.style.display = "block";

  // Stage 3.1: force all animation curves to bind to the nodes that now exist
  // under the instantiated GLB root.
  anim.rebind();

  // Keep the model stopped until the user presses PLAY.
  const layer = anim.baseLayer;
  if (layer) {
    layer.play(importedGLBAnimationClips[0].stateName);
    layer.pause();
    layer.activeStateCurrentTime = 0;
  }

  console.log(
    "GLB animation clips:",
    importedGLBAnimationClips.map((clip) => clip.displayName)
  );
}

function selectedGLBAnimationClip() {
  return importedGLBAnimationClips[importedGLBSelectedAnimation] || null;
}

function playSelectedGLBAnimation() {
  const model = importedGLBModelEntity;
  const clip = selectedGLBAnimationClip();
  const anim = model?.anim;
  const layer = anim?.baseLayer;

  if (!anim || !layer || !clip) return;

  // Re-assign so the LOOP checkbox is always reflected by the active clip.
  anim.assignAnimation(
    clip.stateName,
    clip.track,
    undefined,
    1,
    glbAnimationLoop.checked
  );

  // Stage 3.1: refresh bindings before playback. This also makes PLAY robust
  // after the model has been re-parented by the placement/normalization wrapper.
  anim.rebind();
  layer.play(clip.stateName);
  anim.playing = true;
  importedGLBAnimationPlaying = true;
  glbAnimationStatus.textContent =
    `PLAYING: ${clip.displayName}${glbAnimationLoop.checked ? " / LOOP" : ""}`;
}

function stopGLBAnimation() {
  const clip = selectedGLBAnimationClip();
  const layer = importedGLBModelEntity?.anim?.baseLayer;
  if (!layer || !clip) return;

  layer.pause();
  layer.activeStateCurrentTime = 0;
  importedGLBModelEntity!.anim!.playing = false;
  importedGLBAnimationPlaying = false;
  glbAnimationStatus.textContent = `STOPPED: ${clip.displayName}`;
}

glbAnimationSelect.addEventListener("change", () => {
  importedGLBSelectedAnimation = Math.max(0, glbAnimationSelect.selectedIndex);
  stopGLBAnimation();
});

glbAnimationPlay.addEventListener("click", () => {
  playSelectedGLBAnimation();
});

glbAnimationStop.addEventListener("click", () => {
  stopGLBAnimation();
});

glbAnimationLoop.addEventListener("change", () => {
  const wasPlaying = importedGLBAnimationPlaying;
  const clip = selectedGLBAnimationClip();
  const anim = importedGLBModelEntity?.anim;

  if (!anim || !clip) return;

  anim.assignAnimation(
    clip.stateName,
    clip.track,
    undefined,
    1,
    glbAnimationLoop.checked
  );

  if (wasPlaying) {
    playSelectedGLBAnimation();
  } else {
    glbAnimationStatus.textContent =
      `${clip.displayName}${glbAnimationLoop.checked ? " / LOOP" : " / ONCE"}`;
  }
});

// =========================================================
// Prototype 0.11 / Stage 2
// MULTI MEDIA OBJECT RUNTIME
// =========================================================

type PlacedMediaRuntime = {
  id: string;
  update?: (dt: number) => void;
  dispose?: () => void;
};

const placedMediaRuntimes: PlacedMediaRuntime[] = [];


type ManagedPlacedMedia = {
  id: string;
  title: string;
  kind: "webm" | "sprite" | "glb" | "audio";
  entity: pc.Entity;
};

const managedPlacedMedia = new Map<string, ManagedPlacedMedia>();
let selectedManagedMediaId: string | null = null;
let editingManagedMediaId: string | null = null;

// Prototype 0.11 / Stage 3 / MEDIA OBJECT MANAGER
// The panel is created at runtime so index.html/style.css do not need replacing.
const mediaManagerButton = document.createElement("button");
mediaManagerButton.id = "mediaManagerButton";
mediaManagerButton.type = "button";
mediaManagerButton.textContent = "MEDIA OBJECTS";
document.body.appendChild(mediaManagerButton);

const mediaManagerPanel = document.createElement("section");
mediaManagerPanel.id = "mediaManagerPanel";
mediaManagerPanel.className = "hidden";
mediaManagerPanel.innerHTML = `
  <div class="media-manager-header">
    <strong>MEDIA OBJECTS</strong>
    <button id="closeMediaManagerButton" type="button">×</button>
  </div>
  <div id="behaviorEditor" class="behavior-editor">
    <div class="behavior-editor-title">INTERACTIVE BEHAVIOR CORE</div>
    <div id="behaviorEditorStatus" class="behavior-editor-status">SELECT A MEDIA OBJECT</div>
    <div id="behaviorEditorControls" class="behavior-editor-controls hidden">

    <label class="behavior-row">
      <span>WHEN / Trigger</span>
      <select id="behaviorTrigger">
        <option value="user-proximity">USER PROXIMITY</option>
        <option value="look-at">LOOK AT</option>
        <option value="touch">TOUCH</option>
      </select>
    </label>

    <label class="behavior-row">
      <span>Distance</span>
      <div class="behavior-distance-control">
        <input id="behaviorDistance" type="range" min="0.5" max="20" step="0.5" value="3">
        <strong id="behaviorDistanceValue">3.0 m</strong>
      </div>
    </label>

    <label id="behaviorLookAngleRow" class="behavior-row hidden">
      <span>Look Angle</span>
      <div class="behavior-distance-control">
        <input id="behaviorLookAngle" type="range" min="3" max="45" step="1" value="12">
        <strong id="behaviorLookAngleValue">12°</strong>
      </div>
    </label>

    <label id="behaviorTouchModeRow" class="behavior-row hidden">
      <span>Touch Mode</span>
      <select id="behaviorTouchMode">
        <option value="toggle">TOGGLE</option>
        <option value="repeat">REPEAT</option>
      </select>
    </label>

    <div class="behavior-action-section">
      <div class="behavior-action-title">DO</div>
    </div>

    <label class="behavior-row behavior-action-row">
      <span>Enter Action</span>
      <select id="behaviorEnterAction">
        <option value="play">PLAY MEDIA</option>
        <option value="stop">STOP MEDIA</option>
        <option value="move">MOVE</option>
        <option value="rotate">ROTATE</option>
        <option value="scale">SCALE</option>
        <option value="float">FLOAT</option>
        <option value="orbit">ORBIT</option>
        <option value="shake">SHAKE</option>
        <option value="none">NONE</option>
      </select>
    </label>

    <label class="behavior-row behavior-action-row">
      <span>Leave Action</span>
      <select id="behaviorLeaveAction">
        <option value="stop">STOP MEDIA</option>
        <option value="play">PLAY MEDIA</option>
        <option value="move">MOVE</option>
        <option value="rotate">ROTATE</option>
        <option value="scale">SCALE</option>
        <option value="float">FLOAT</option>
        <option value="orbit">ORBIT</option>
        <option value="shake">SHAKE</option>
        <option value="none">NONE</option>
      </select>
    </label>

    <div id="transformActionControls" class="transform-action-controls hidden">
      <div class="transform-action-title">TRANSFORM ACTION</div>
      <label class="behavior-row">
        <span>Amount</span>
        <div class="behavior-distance-control">
          <input id="transformAmount" type="range" min="0.1" max="5" step="0.1" value="1">
          <strong id="transformAmountValue">1.0</strong>
        </div>
      </label>
      <label class="behavior-row">
        <span>Speed</span>
        <div class="behavior-distance-control">
          <input id="transformSpeed" type="range" min="0.2" max="4" step="0.1" value="1">
          <strong id="transformSpeedValue">1.0×</strong>
        </div>
      </label>
      <label class="behavior-row">
        <span>Axis</span>
        <select id="transformAxis">
          <option value="x">X</option>
          <option value="y" selected>Y</option>
          <option value="z">Z</option>
        </select>
      </label>
      <label class="behavior-row">
        <span>Duration</span>
        <div class="behavior-distance-control">
          <input id="transformDuration" type="range" min="0.5" max="12" step="0.5" value="3">
          <strong id="transformDurationValue">3.0 s</strong>
        </div>
      </label>
    </div>

    <label class="behavior-enabled-row">
      <span>Enabled</span>
      <input id="behaviorEnabled" type="checkbox" checked>
    </label>

    <div class="behavior-test-actions">
      <button id="behaviorTestEnter" type="button">TEST ENTER</button>
      <button id="behaviorTestLeave" type="button">TEST LEAVE</button>
    </div>
    <div id="behaviorStatus" class="behavior-status">READY</div>
    </div>
  </div>

  <div id="mediaManagerList"></div>

  <div class="media-manager-actions">
    <button id="editManagedMediaButton" type="button" disabled>EDIT</button>
    <button id="deleteManagedMediaButton" type="button" disabled>DELETE</button>
  </div>
`;
document.body.appendChild(mediaManagerPanel);

const mediaManagerStyle = document.createElement("style");
mediaManagerStyle.textContent = `
  #mediaManagerButton {
    position: fixed; top: max(68px, calc(env(safe-area-inset-top) + 68px));
    right: max(16px, env(safe-area-inset-right)); z-index: 40;
    width: auto !important; padding: 10px 14px; border: 1px solid #4a5260;
    border-radius: 12px; background: rgba(10,14,20,.92); color: #fff;
    font: 700 12px/1 system-ui, sans-serif; letter-spacing: .04em;
  }
  #mediaManagerPanel {
    position: fixed; top: 116px; right: max(16px, env(safe-area-inset-right));
    z-index: 50; width: min(360px, calc(100vw - 32px)); max-height: 78vh;
    overflow: auto; box-sizing: border-box; padding: 14px;
    border: 1px solid #3d4653; border-radius: 16px;
    background: rgba(9,13,19,.96); color: #fff; backdrop-filter: blur(14px);
    font-family: system-ui, sans-serif;
  }
  #mediaManagerPanel.hidden { display: none; }
  .media-manager-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  #closeMediaManagerButton { width:36px !important; height:36px; border-radius:10px; }
  #mediaManagerList { display:grid; gap:8px; }
  .media-manager-item {
    width:100% !important; display:grid; grid-template-columns:54px 1fr; gap:8px;
    text-align:left; padding:11px; border:1px solid #343d49; border-radius:11px;
    background:#111720; color:#fff;
  }
  .media-manager-item.selected { outline:2px solid #2f8cff; background:#172334; }
  .media-manager-kind { opacity:.62; font-size:10px; font-weight:800; }
  .media-manager-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
  .media-manager-empty { opacity:.55; padding:18px 6px; text-align:center; font-size:12px; }
  .behavior-editor {
    display:block !important; visibility:visible !important; opacity:1 !important;
    margin:0 0 12px; padding:12px; border:1px solid #3f6fa8; border-radius:12px;
    background:#0d131b; position:relative; z-index:2;
  }
  .behavior-editor.hidden { display:block !important; }
  .behavior-row.hidden { display:none; }
  .behavior-editor-status { opacity:.55; font-size:11px; padding:4px 0 2px; }
  .behavior-editor-controls.hidden { display:none !important; }
  .behavior-editor-controls:not(.hidden) { display:block !important; visibility:visible !important; }
  .behavior-editor-title {
    margin-bottom:10px; font-size:11px; font-weight:800; letter-spacing:.08em; opacity:.72;
  }
  .behavior-row, .behavior-enabled-row {
    display:grid; grid-template-columns:92px 1fr; align-items:center; gap:8px;
    margin-top:9px; font-size:11px;
  }
  .behavior-row select {
    width:100%; min-width:0; box-sizing:border-box; padding:7px 8px;
    border:1px solid #3d4653; border-radius:8px; background:#151d28; color:#fff;
  }
  .behavior-distance-control { display:grid; grid-template-columns:1fr 48px; align-items:center; gap:8px; }
  #behaviorDistance { width:100%; min-width:0; }
  #behaviorDistanceValue { text-align:right; font-size:11px; white-space:nowrap; }
  #behaviorEnabled { justify-self:start; width:18px !important; height:18px; }
  .behavior-action-section { display:block !important; margin:12px 0 6px; padding-top:10px; border-top:1px solid rgba(255,255,255,.16); }
  .behavior-action-title { display:block !important; font-size:11px; font-weight:900; letter-spacing:.14em; color:#fff; opacity:.95; }
  .behavior-action-row { display:grid !important; }
  #behaviorEnterAction, #behaviorLeaveAction { display:block !important; visibility:visible !important; opacity:1 !important; min-height:34px; }
  .transform-action-controls { margin:10px 0; padding:10px; border:1px solid #2a5f88; border-radius:10px; background:rgba(15,36,52,.55); }
  .transform-action-controls.hidden { display:none !important; }
  .transform-action-title { margin-bottom:8px; font-size:10px; font-weight:800; letter-spacing:.1em; opacity:.75; }
  .behavior-test-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
  .behavior-test-actions button { width:100% !important; padding:8px 6px; font-size:10px; }
  .behavior-status {
    margin-top:10px; padding-top:9px; border-top:1px solid #28313d;
    font-size:10px; font-weight:800; letter-spacing:.08em; opacity:.7;
  }
  .media-manager-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
  .media-manager-actions button { width:100% !important; }
  #deleteManagedMediaButton { border-color:#7b3940; }
  #sharedStateDiagnosticPanel {
    position:fixed; right:10px; bottom:10px; z-index:10050; width:min(310px,88vw);
    padding:8px; background:rgba(3,10,18,.94); color:#b9e4ff; border:1px solid #3aa7ff;
    border-radius:9px; font:600 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; box-sizing:border-box;
  }
  #sharedStateDiagnosticToggle {
    width:100% !important; min-height:34px; padding:7px 9px; border:0; border-radius:7px;
    background:transparent; color:#b9e4ff; text-align:left; font:800 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  #sharedStateDiagnosticToggle span { float:right; }
  #sharedStateDiagnosticBody { margin:7px 4px 2px; white-space:pre-wrap; font:inherit; color:inherit; }
  #sharedStateDiagnosticPanel.collapsed { width:auto; min-width:132px; }
  #sharedStateDiagnosticPanel.collapsed #sharedStateDiagnosticBody { display:none; }
  @media (max-width: 640px) {
    #mediaManagerPanel {
      top:max(92px, calc(env(safe-area-inset-top) + 72px)); right:10px; left:10px;
      bottom:max(10px, env(safe-area-inset-bottom)); width:auto; max-height:none; height:auto;
      overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch;
      padding:14px 14px calc(22px + env(safe-area-inset-bottom));
    }
    #mediaManagerButton { right:12px; }
    .media-manager-header { position:sticky; top:-14px; z-index:8; padding:10px 0; background:rgba(9,13,19,.98); }
    .behavior-editor { padding:12px 10px; }
    .behavior-row, .behavior-enabled-row { grid-template-columns:84px minmax(0,1fr); }
    .behavior-test-actions { position:sticky; bottom:0; z-index:7; padding:10px 0 4px; background:rgba(9,13,19,.98); }
    .behavior-test-actions button { min-height:44px; }
    .media-manager-item { min-height:52px; touch-action:manipulation; }
    .media-manager-actions button { min-height:46px; }
    #sharedStateDiagnosticPanel { left:10px; right:auto; bottom:max(10px, env(safe-area-inset-bottom)); width:min(310px,calc(100vw - 20px)); }
    #sharedStateDiagnosticPanel.collapsed { width:auto; min-width:132px; }
  }
`;
document.head.appendChild(mediaManagerStyle);

const closeMediaManagerButton = mediaManagerPanel.querySelector<HTMLButtonElement>("#closeMediaManagerButton")!;
const mediaManagerList = mediaManagerPanel.querySelector<HTMLElement>("#mediaManagerList")!;
const editManagedMediaButton = mediaManagerPanel.querySelector<HTMLButtonElement>("#editManagedMediaButton")!;
const deleteManagedMediaButton = mediaManagerPanel.querySelector<HTMLButtonElement>("#deleteManagedMediaButton")!;

// Prototype 0.12.3 / BEHAVIOR EDITOR
const behaviorEditor = mediaManagerPanel.querySelector<HTMLElement>("#behaviorEditor")!;
const behaviorEditorStatus = mediaManagerPanel.querySelector<HTMLElement>("#behaviorEditorStatus")!;
const behaviorEditorControls = mediaManagerPanel.querySelector<HTMLElement>("#behaviorEditorControls")!;
const behaviorTrigger = mediaManagerPanel.querySelector<HTMLSelectElement>("#behaviorTrigger")!;
const behaviorDistance = mediaManagerPanel.querySelector<HTMLInputElement>("#behaviorDistance")!;
const behaviorDistanceValue = mediaManagerPanel.querySelector<HTMLElement>("#behaviorDistanceValue")!;
const behaviorLookAngleRow = mediaManagerPanel.querySelector<HTMLElement>("#behaviorLookAngleRow")!;
const behaviorLookAngle = mediaManagerPanel.querySelector<HTMLInputElement>("#behaviorLookAngle")!;
const behaviorLookAngleValue = mediaManagerPanel.querySelector<HTMLElement>("#behaviorLookAngleValue")!;
const behaviorTouchModeRow = mediaManagerPanel.querySelector<HTMLElement>("#behaviorTouchModeRow")!;
const behaviorTouchMode = mediaManagerPanel.querySelector<HTMLSelectElement>("#behaviorTouchMode")!;
const behaviorEnterAction = mediaManagerPanel.querySelector<HTMLSelectElement>("#behaviorEnterAction")!;
const behaviorLeaveAction = mediaManagerPanel.querySelector<HTMLSelectElement>("#behaviorLeaveAction")!;
const transformActionControls = mediaManagerPanel.querySelector<HTMLElement>("#transformActionControls")!;
const transformAmount = mediaManagerPanel.querySelector<HTMLInputElement>("#transformAmount")!;
const transformAmountValue = mediaManagerPanel.querySelector<HTMLElement>("#transformAmountValue")!;
const transformSpeed = mediaManagerPanel.querySelector<HTMLInputElement>("#transformSpeed")!;
const transformSpeedValue = mediaManagerPanel.querySelector<HTMLElement>("#transformSpeedValue")!;
const transformAxis = mediaManagerPanel.querySelector<HTMLSelectElement>("#transformAxis")!;
const transformDuration = mediaManagerPanel.querySelector<HTMLInputElement>("#transformDuration")!;
const transformDurationValue = mediaManagerPanel.querySelector<HTMLElement>("#transformDurationValue")!;
const behaviorEnabled = mediaManagerPanel.querySelector<HTMLInputElement>("#behaviorEnabled")!;
const behaviorStatus = mediaManagerPanel.querySelector<HTMLElement>("#behaviorStatus")!;
const behaviorTestEnter = mediaManagerPanel.querySelector<HTMLButtonElement>("#behaviorTestEnter")!;
const behaviorTestLeave = mediaManagerPanel.querySelector<HTMLButtonElement>("#behaviorTestLeave")!;

// Prototype 0.15.3 / TRANSFORM ANIMATION CORE
// Trigger detection and Actions are intentionally separated. New Actions such as
// MOVE / ROTATE / SCALE / PLAY SOUND can be added to this dispatcher without
// rewriting USER PROXIMITY / LOOK AT / TOUCH trigger detection.
type XRBehaviorActionId = "play" | "stop" | "move" | "rotate" | "scale" | "float" | "orbit" | "shake" | "none";
type XRTransformActionParams = { amount: number; speed: number; axis: "x" | "y" | "z"; duration: number };

function getSelectedInteractiveBehavior() {
  if (!selectedManagedMediaId) return null;
  const object = xrMediaManager.get(selectedManagedMediaId);
  if (!object) return null;

  let behavior = object.behavior?.[0];
  if (!behavior) {
    behavior = {
      id: "proximity-play",
      trigger: "user-proximity",
      distance: 3,
      enterAction: "play",
      leaveAction: "stop",
      transformAmount: 1,
      transformSpeed: 1,
      transformAxis: "y",
      transformDuration: 3,
      enabled: true
    };
    object.behavior = [...(object.behavior ?? []), behavior];
  }
  return behavior;
}

function refreshBehaviorEditorUI() {
  const behavior = getSelectedInteractiveBehavior();
  const hasSelection = !!selectedManagedMediaId && managedPlacedMedia.has(selectedManagedMediaId);

  // Prototype 0.15.2.1 / BEHAVIOR EDITOR VISIBILITY FIX
  // Keep the editor shell permanently visible inside MEDIA OBJECTS. Only the
  // status/controls swap when selection changes. This avoids CSS/layout races
  // on Safari and makes the editor discoverable before a media object is selected.
  behaviorEditor.classList.remove("hidden");
  behaviorEditor.style.setProperty("display", "block", "important");
  behaviorEditor.style.setProperty("visibility", "visible", "important");
  behaviorEditor.dataset.selection = hasSelection ? String(selectedManagedMediaId) : "none";

  const showControls = hasSelection && !!behavior;
  behaviorEditorStatus.classList.toggle("hidden", showControls);
  behaviorEditorControls.classList.toggle("hidden", !showControls);
  if (!behavior) {
    behaviorEditorStatus.textContent = hasSelection ? "BEHAVIOR DATA INITIALIZING" : "SELECT A MEDIA OBJECT";
    return;
  }

  const trigger = String((behavior as any).trigger ?? "user-proximity");
  behaviorTrigger.value =
    trigger === "look-at" ? "look-at" :
    trigger === "touch" ? "touch" :
    "user-proximity";
  const isLookAt = trigger === "look-at";
  const isTouch = trigger === "touch";

  behaviorDistance.value = String(behavior.distance);
  behaviorDistanceValue.textContent = `${behavior.distance.toFixed(1)} m`;
  behaviorDistance.disabled = isLookAt || isTouch;
  behaviorDistance.closest(".behavior-row")?.classList.toggle("hidden", isLookAt || isTouch);

  const lookAngle = Number((behavior as any).lookAngle ?? 12);
  behaviorLookAngle.value = String(lookAngle);
  behaviorLookAngleValue.textContent = `${lookAngle.toFixed(0)}°`;
  behaviorLookAngleRow.classList.toggle("hidden", !isLookAt);

  behaviorTouchModeRow.classList.toggle("hidden", !isTouch);
  behaviorTouchMode.value = String((behavior as any).touchMode ?? "toggle");

  behaviorEnterAction.value = String((behavior as any).enterAction ?? "play");
  behaviorLeaveAction.value = String((behavior as any).leaveAction ?? "stop");
  const transformActions = new Set(["move", "rotate", "scale", "float", "orbit", "shake"]);
  const usesTransform = transformActions.has(behaviorEnterAction.value) || transformActions.has(behaviorLeaveAction.value);
  transformActionControls.classList.toggle("hidden", !usesTransform);
  transformAmount.value = String(Number((behavior as any).transformAmount ?? 1));
  transformSpeed.value = String(Number((behavior as any).transformSpeed ?? 1));
  transformAxis.value = String((behavior as any).transformAxis ?? "y");
  transformDuration.value = String(Number((behavior as any).transformDuration ?? 3));
  transformAmountValue.textContent = Number(transformAmount.value).toFixed(1);
  transformSpeedValue.textContent = `${Number(transformSpeed.value).toFixed(1)}×`;
  transformDurationValue.textContent = `${Number(transformDuration.value).toFixed(1)} s`;
  behaviorEnabled.checked = behavior.enabled;
  behaviorStatus.textContent =
    !behavior.enabled ? "DISABLED" :
    isTouch ? "TAP / CLICK OBJECT" :
    "READY";
}

function applyBehaviorEditorUI() {
  const behavior = getSelectedInteractiveBehavior();
  if (!behavior) return;

  (behavior as any).trigger = behaviorTrigger.value;
  behavior.distance = Number(behaviorDistance.value);
  (behavior as any).lookAngle = Number(behaviorLookAngle.value);
  (behavior as any).touchMode = behaviorTouchMode.value;
  (behavior as any).enterAction = behaviorEnterAction.value as XRBehaviorActionId;
  (behavior as any).leaveAction = behaviorLeaveAction.value as XRBehaviorActionId;
  (behavior as any).transformAmount = Number(transformAmount.value);
  (behavior as any).transformSpeed = Number(transformSpeed.value);
  (behavior as any).transformAxis = transformAxis.value;
  (behavior as any).transformDuration = Number(transformDuration.value);
  behavior.enabled = behaviorEnabled.checked;
  behaviorDistanceValue.textContent = `${behavior.distance.toFixed(1)} m`;
  behaviorLookAngleValue.textContent = `${Number((behavior as any).lookAngle ?? 12).toFixed(0)}°`;
  transformAmountValue.textContent = Number(transformAmount.value).toFixed(1);
  transformSpeedValue.textContent = `${Number(transformSpeed.value).toFixed(1)}×`;
  transformDurationValue.textContent = `${Number(transformDuration.value).toFixed(1)} s`;

  console.log("[XR BEHAVIOR UPDATED]", {
    mediaId: selectedManagedMediaId,
    trigger: behavior.trigger,
    distance: behavior.distance,
    enterAction: behavior.enterAction,
    leaveAction: behavior.leaveAction,
    enabled: behavior.enabled
  });
}

behaviorTrigger.addEventListener("change", () => {
  applyBehaviorEditorUI();

  // Prototype 0.13.3.1 / TOUCH INITIAL STATE FIX
  // TOUCH is an event trigger: selecting it must not inherit the media's
  // previous autoplay / proximity / look-at playback state.
  if (behaviorTrigger.value === "touch" && selectedManagedMediaId) {
    const object = xrMediaManager.get(selectedManagedMediaId);
    object?.playback?.stop();
    lookAtBehaviorState.delete(selectedManagedMediaId);
    touchInitializedObjects.add(selectedManagedMediaId);
    touchActiveState.set(selectedManagedMediaId, false);
    behaviorStatus.textContent = "TAP / CLICK OBJECT";
  }

  refreshBehaviorEditorUI();
});
behaviorDistance.addEventListener("input", applyBehaviorEditorUI);
behaviorLookAngle.addEventListener("input", applyBehaviorEditorUI);
behaviorTouchMode.addEventListener("change", applyBehaviorEditorUI);
behaviorEnterAction.addEventListener("change", () => { applyBehaviorEditorUI(); refreshBehaviorEditorUI(); });
behaviorLeaveAction.addEventListener("change", () => { applyBehaviorEditorUI(); refreshBehaviorEditorUI(); });
transformAmount.addEventListener("input", applyBehaviorEditorUI);
transformSpeed.addEventListener("input", applyBehaviorEditorUI);
transformAxis.addEventListener("change", applyBehaviorEditorUI);
transformDuration.addEventListener("input", applyBehaviorEditorUI);
behaviorEnabled.addEventListener("change", applyBehaviorEditorUI);

// Prototype 0.15.2.2 / BEHAVIOR TEST ACTION FIX
// TEST buttons are explicit manual actions. Execute the selected media locally
// immediately, then publish the exact same action to the shared room. This does
// not alter the proven PROXIMITY / LOOK AT / TOUCH paths. The later server echo
// is intentionally harmless (PLAY/STOP are idempotent) and keeps all peers in sync.
function getBehaviorTransformParams(behavior: any): XRTransformActionParams {
  return {
    amount: Math.max(0.05, Number(behavior?.transformAmount ?? 1)),
    speed: Math.max(0.05, Number(behavior?.transformSpeed ?? 1)),
    axis: (["x", "y", "z"].includes(String(behavior?.transformAxis)) ? String(behavior.transformAxis) : "y") as "x" | "y" | "z",
    duration: Math.max(0.2, Number(behavior?.transformDuration ?? 3))
  };
}

function executeBehaviorTestAction(kind: "enter" | "leave") {
  // Commit the controls currently visible in the editor before reading them.
  applyBehaviorEditorUI();

  const mediaId = selectedManagedMediaId;
  if (!mediaId) {
    behaviorStatus.textContent = "TEST FAILED / NO MEDIA SELECTED";
    return;
  }

  const object = xrMediaManager.get(mediaId);
  const behavior = getSelectedInteractiveBehavior();
  if (!object || !behavior) {
    behaviorStatus.textContent = "TEST FAILED / MEDIA NOT READY";
    return;
  }

  const action = String(
    kind === "enter"
      ? ((behavior as any).enterAction ?? "play")
      : ((behavior as any).leaveAction ?? "stop")
  ) as XRBehaviorActionId;

  if (action === "none") {
    behaviorStatus.textContent = `TEST ${kind.toUpperCase()} → NONE`;
    return;
  }

  // Guarantee immediate feedback on the controller device.
  const transformParams = getBehaviorTransformParams(behavior);
  runXRBehaviorAction(object, action, transformParams);

  // Publish to the other connected clients using the same transient Action Bus.
  if (activeRoom) {
    activeRoom.send("media:action", {
      id: String(object.id || mediaId),
      action,
      source: `test-${kind}`,
      params: transformParams
    });
    console.log("[0.15.2.2 TEST ACTION SENT]", object.id || mediaId, action, kind);
  }

  behaviorStatus.textContent = `TEST ${kind.toUpperCase()} → ${action.toUpperCase()}`;
}

behaviorTestEnter.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  executeBehaviorTestAction("enter");
});

behaviorTestLeave.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  executeBehaviorTestAction("leave");
});

function refreshMediaManagerUI() {
  mediaManagerList.innerHTML = "";
  const objects = Array.from(managedPlacedMedia.values());

  if (objects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "media-manager-empty";
    empty.textContent = "NO MEDIA OBJECTS";
    mediaManagerList.appendChild(empty);
  } else {
    objects.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "media-manager-item" + (item.id === selectedManagedMediaId ? " selected" : "");
      button.innerHTML = `<span class="media-manager-kind">${String(index + 1).padStart(2, "0")} ${item.kind.toUpperCase()}</span><span class="media-manager-title"></span>`;
      const title = button.querySelector<HTMLElement>(".media-manager-title");
      if (title) title.textContent = item.title;
      button.addEventListener("click", () => {
        selectedManagedMediaId = item.id;
        refreshMediaManagerUI();
        window.setTimeout(() => behaviorEditor.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
      });
      mediaManagerList.appendChild(button);
    });
  }

  const hasSelection = !!selectedManagedMediaId && managedPlacedMedia.has(selectedManagedMediaId);
  editManagedMediaButton.disabled = !hasSelection;
  deleteManagedMediaButton.disabled = !hasSelection;
  refreshBehaviorEditorUI();
}

function disposePlacedRuntime(id: string) {
  const index = placedMediaRuntimes.findIndex((runtime) => runtime.id === id);
  if (index >= 0) {
    const [runtime] = placedMediaRuntimes.splice(index, 1);
    runtime.dispose?.();
  }
}

function sendSharedMediaTransform(id: string) {
  if (!activeRoom) return;
  const item=managedPlacedMedia.get(id);
  if (!item || sharedRemoteMediaIds.has(id)) return;
  const p=item.entity.getPosition(), r=item.entity.getEulerAngles(), s=item.entity.getLocalScale();
  activeRoom.send("media:update",{id,x:p.x,y:p.y,z:p.z,rotationY:r.y,scale:s.x});
  console.log("[SHARED MEDIA UPDATE SENT]",id);
}

function deleteManagedMedia(id: string) {
  const item = managedPlacedMedia.get(id);
  if (!item) return;

  if (activeRoom && !sharedRemoteMediaIds.has(id)) {
    activeRoom.send("media:delete",{id});
    console.log("[SHARED MEDIA DELETE SENT]",id);
  }
  disposePlacedRuntime(id);
  item.entity.destroy();
  xrMediaManager.unregister(id);
  managedPlacedMedia.delete(id);

  if (selectedManagedMediaId === id) selectedManagedMediaId = null;
  if (editingManagedMediaId === id) editingManagedMediaId = null;
  refreshMediaManagerUI();
  console.log("XR Media deleted:", id);
}

mediaManagerButton.addEventListener("click", () => {
  refreshMediaManagerUI();
  mediaManagerPanel.classList.toggle("hidden");
  if (!mediaManagerPanel.classList.contains("hidden")) {
    mediaManagerPanel.scrollTop = 0;
    refreshBehaviorEditorUI();
  }
});
closeMediaManagerButton.addEventListener("click", () => mediaManagerPanel.classList.add("hidden"));

deleteManagedMediaButton.addEventListener("click", () => {
  if (!selectedManagedMediaId) return;
  deleteManagedMedia(selectedManagedMediaId);
});

editManagedMediaButton.addEventListener("click", () => {
  if (!selectedManagedMediaId) return;
  const item = managedPlacedMedia.get(selectedManagedMediaId);
  if (!item) return;

  editingManagedMediaId = item.id;
  importedArtworkEntity = item.entity;
  importedArtworkKind = item.kind;

  const position = item.entity.getPosition();
  placementX = position.x;
  placementY = position.y;
  placementZ = position.z;
  placementRotationY = item.entity.getEulerAngles().y;
  const scale = item.entity.getLocalScale();
  placementScale = item.kind === "glb" ? scale.x : scale.x;

  updatePlacementUI();
  glbAnimationPanel.style.display = "none";
  artworkPlacementPanel?.classList.remove("hidden");
  mediaManagerPanel.classList.add("hidden");
});

/**
 * PLACE commits the currently edited media object to the world.
 * Its resources are detached from the temporary import globals instead of
 * being destroyed, so the next import can coexist with earlier artworks.
 */
function commitActiveArtworkToWorld() {
  if (!importedArtworkEntity || !activeXRMediaId || !importedArtworkKind) {
    return;
  }

  const committedId = activeXRMediaId;

  if (importedArtworkKind === "webm") {
    const video = importedArtworkVideo;
    const texture = importedArtworkTexture;
    const objectURL = importedArtworkObjectURL;

    placedMediaRuntimes.push({
      id: committedId,
      update: () => {
        if (video && texture && video.readyState >= 2) {
          texture.upload();
        }
      },
      dispose: () => {
        video?.pause();
        texture?.destroy();
        if (objectURL) URL.revokeObjectURL(objectURL);
      }
    });
  }

  if (importedArtworkKind === "sprite") {
    const image = importedSpriteImage;
    const canvas = importedSpriteCanvas;
    const context = importedSpriteContext;
    const texture = importedArtworkTexture;
    const imageURL = importedSpriteImageURL;
    const frameCount = importedSpriteFrameCount;
    const columns = importedSpriteColumns;
    const frameWidth = importedSpriteFrameWidth;
    const frameHeight = importedSpriteFrameHeight;
    const fps = importedSpriteFPS;

    let frame = importedSpriteFrame;
    let elapsed = importedSpriteElapsed;
    // Keep creator playback aligned with remote Shared Sprite.
    let playing = true;

    const media = xrMediaManager.get(committedId);
    if (media) {
      media.playback = {
        play: () => { playing = true; },
        stop: () => { playing = false; },
        setLoop: () => { /* Sprite currently loops by design. */ }
      };
    }

    const drawCommittedFrame = (frameIndex: number) => {
      if (!image || !canvas || !context || frameCount <= 0) return;

      const safeFrame = ((frameIndex % frameCount) + frameCount) % frameCount;
      const column = safeFrame % columns;
      const row = Math.floor(safeFrame / columns);

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        column * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
    };

    placedMediaRuntimes.push({
      id: committedId,
      update: (dt: number) => {
        if (!playing || !texture || frameCount <= 0 || fps <= 0) return;

        elapsed += dt;
        const frameDuration = 1 / fps;
        let changed = false;

        while (elapsed >= frameDuration) {
          elapsed -= frameDuration;
          frame = (frame + 1) % frameCount;
          changed = true;
        }

        if (changed) {
          drawCommittedFrame(frame);
          texture.upload();
        }
      },
      dispose: () => {
        texture?.destroy();
        if (imageURL) URL.revokeObjectURL(imageURL);
      }
    });
  }

  if (importedArtworkKind === "glb") {
    const asset = importedGLBAsset;
    const objectURL = importedGLBObjectURL;

    // Prototype 0.12.1 / PER-OBJECT GLB PLAYBACK
    // Capture the GLB animation state before the temporary import globals are cleared.
    // After PLACE, proximity behavior must control this committed GLB directly,
    // rather than the old global importedGLBModelEntity reference.
    const modelEntity = importedGLBModelEntity;
    const clips = importedGLBAnimationClips.map((clip) => ({ ...clip }));
    let selectedIndex = Math.max(
      0,
      Math.min(importedGLBSelectedAnimation, Math.max(0, clips.length - 1))
    );
    let loop = glbAnimationLoop.checked;

    const media = xrMediaManager.get(committedId);

    const selectedClip = () => clips[selectedIndex] || null;

    const playCommittedGLB = () => {
      const clip = selectedClip();
      const anim = modelEntity?.anim;
      const layer = anim?.baseLayer;
      if (!anim || !layer || !clip) return;

      anim.assignAnimation(
        clip.stateName,
        clip.track,
        undefined,
        1,
        loop
      );
      anim.rebind();
      layer.play(clip.stateName);
      anim.playing = true;
    };

    const stopCommittedGLB = () => {
      const anim = modelEntity?.anim;
      const layer = anim?.baseLayer;
      if (!anim || !layer) return;

      layer.pause();
      layer.activeStateCurrentTime = 0;
      anim.playing = false;
    };

    if (media) {
      media.playback = {
        play: playCommittedGLB,
        stop: stopCommittedGLB,
        setLoop: (nextLoop) => {
          loop = nextLoop;
          const clip = selectedClip();
          const anim = modelEntity?.anim;
          if (!anim || !clip) return;

          anim.assignAnimation(
            clip.stateName,
            clip.track,
            undefined,
            1,
            loop
          );
        },
        getClips: () => clips.map((clip) => clip.displayName),
        playClip: (name) => {
          const index = clips.findIndex((clip) => clip.displayName === name);
          if (index < 0) return;
          selectedIndex = index;
          playCommittedGLB();
        }
      };
    }

    placedMediaRuntimes.push({
      id: committedId,
      dispose: () => {
        stopCommittedGLB();
        if (asset) {
          asset.unload();
          app.assets.remove(asset);
        }
        if (objectURL) URL.revokeObjectURL(objectURL);
      }
    });
  }

  if (importedArtworkKind === "audio") {
    const el=importedAudioElement, url=importedArtworkObjectURL;
    if(el){ audioElements.delete("preview-audio"); audioElements.set(committedId,el); (el as any).__xrEntity=importedArtworkEntity; }
    placedMediaRuntimes.push({id:committedId,dispose:()=>{el?.pause();audioElements.delete(committedId);if(url)URL.revokeObjectURL(url)}});
  }

  const committedMedia = xrMediaManager.get(committedId);
  managedPlacedMedia.set(committedId, {
    id: committedId,
    title: committedMedia?.title || `${importedArtworkKind.toUpperCase()} Artwork`,
    kind: importedArtworkKind,
    entity: importedArtworkEntity
  });
  selectedManagedMediaId = committedId;
  refreshMediaManagerUI();

  // Prototype 0.14.3: publish the Sprite ZIP over HTTP, then share assetRef via Colyseus.
  if (importedArtworkKind === "sprite") {
    const packageBlob = importedSpritePackageBlob;
    void publishCommittedSpriteToSharedWorld(committedId, packageBlob);
  } else if (importedArtworkKind === "glb") {
    const glbBlob = importedGLBPackageBlob;
    void publishCommittedGLBToSharedWorld(committedId, glbBlob);
  } else if (importedArtworkKind === "webm") {
    const webmBlob = importedWebMPackageBlob;
    void publishCommittedWebMToSharedWorld(committedId, webmBlob);
  } else if (importedArtworkKind === "audio") {
    void publishCommittedAudioToSharedWorld(committedId, importedAudioBlob, importedAudioExt);
  }

  // The Entity and resources now belong to the committed XRMediaObject.
  // Clear only the editor's references. Do NOT destroy the committed object.
  importedArtworkEntity = null;
  importedArtworkVideo = null;
  importedArtworkTexture = null;
  importedArtworkObjectURL = null;

  importedGLBModelEntity = null;
  importedGLBAsset = null;
  importedGLBObjectURL = null;

  importedSpritePackageBlob = null;
  importedGLBPackageBlob = null;
  importedWebMPackageBlob = null;
  importedAudioBlob = null;
  importedAudioElement = null;
  importedSpriteImageURL = null;
  importedSpriteMeta = null;
  importedSpriteImage = null;
  importedSpriteCanvas = null;
  importedSpriteContext = null;
  importedSpriteFrame = 0;
  importedSpriteElapsed = 0;
  importedSpritePlaying = false;

  importedArtworkKind = null;
  activeXRMediaId = null;
  resetGLBAnimationUI();

  console.log(
    "XR Media committed:",
    committedId,
    "total:",
    xrMediaManager.list().length
  );
}

function clearImportedArtwork() {
  if (activeXRMediaId) {
    xrMediaManager.unregister(activeXRMediaId);
    activeXRMediaId = null;
  }
  if (importedArtworkEntity) {
    importedArtworkEntity.destroy();
    importedArtworkEntity = null;
  }

  resetGLBAnimationUI();
  importedGLBModelEntity = null;

  if (importedArtworkVideo) {
    importedArtworkVideo.pause();
    importedArtworkVideo.removeAttribute("src");
    importedArtworkVideo.load();
    importedArtworkVideo = null;
  }

  if (importedArtworkTexture) {
    importedArtworkTexture.destroy();
    importedArtworkTexture = null;
  }

  if (importedArtworkObjectURL) {
    URL.revokeObjectURL(importedArtworkObjectURL);
    importedArtworkObjectURL = null;
  }

  if (importedGLBAsset) {
    importedGLBAsset.unload();
    app.assets.remove(importedGLBAsset);
    importedGLBAsset = null;
  }

  if (importedGLBObjectURL) {
    URL.revokeObjectURL(importedGLBObjectURL);
    importedGLBObjectURL = null;
  }

  importedArtworkKind = null;
}

// =========================================================
// Prototype 0.9 / Stage 3⑤-1
// SPRITE ZIP IMPORT CORE
// =========================================================

let importedSpritePackageBlob: Blob | null = null;
let importedGLBPackageBlob: Blob | null = null;
let importedWebMPackageBlob: Blob | null = null;
let importedSpriteImageURL: string | null = null;
let importedSpriteMeta: any = null;
let importedSpriteImage: HTMLImageElement | null = null;
let importedSpriteCanvas: HTMLCanvasElement | null = null;
let importedSpriteContext: CanvasRenderingContext2D | null = null;
let importedSpriteFrame = 0;
let importedSpriteFrameCount = 1;
let importedSpriteColumns = 1;
let importedSpriteRows = 1;
let importedSpriteFrameWidth = 1;
let importedSpriteFrameHeight = 1;
let importedSpriteFPS = 4;
let importedSpriteElapsed = 0;
let importedSpritePlaying = false;

function clearImportedSpriteResources() {
  importedSpritePlaying = false;
  importedSpriteElapsed = 0;
  importedSpriteFrame = 0;

  importedSpriteImage = null;
  importedSpriteCanvas = null;
  importedSpriteContext = null;
  importedSpriteMeta = null;

  if (importedSpriteImageURL) {
    URL.revokeObjectURL(importedSpriteImageURL);
    importedSpriteImageURL = null;
  }
}

async function loadSpriteZipPackage(file: File) {

  clearImportedSpriteResources();
  importedSpritePackageBlob = file;

  const zip = await JSZip.loadAsync(file);

  const entries = Object.values(zip.files);

  const pngEntry = entries.find(
    (entry) =>
      !entry.dir &&
      entry.name.toLowerCase().endsWith(".png")
  );

  const jsonEntry = entries.find(
    (entry) =>
      !entry.dir &&
      entry.name.toLowerCase().endsWith(".json")
  );

  if (!pngEntry) {
    throw new Error(
      "Sprite ZIPにPNGが見つかりません。"
    );
  }

  if (!jsonEntry) {
    throw new Error(
      "Sprite ZIPにJSONが見つかりません。"
    );
  }

  const pngBlob =
    await pngEntry.async("blob");

  importedSpriteImageURL =
    URL.createObjectURL(pngBlob);

  const jsonText =
    await jsonEntry.async("text");

  importedSpriteMeta =
    JSON.parse(jsonText);

  console.log(
    "SPRITE PNG:",
    pngEntry.name
  );

  console.log(
    "SPRITE JSON:",
    importedSpriteMeta
  );

  console.log(
    "SPRITE ZIP READY"
  );
}

function drawSpriteFrame(frameIndex: number) {
  if (
    !importedSpriteImage ||
    !importedSpriteCanvas ||
    !importedSpriteContext
  ) {
    return;
  }

  const safeFrame =
    ((frameIndex % importedSpriteFrameCount) + importedSpriteFrameCount) %
    importedSpriteFrameCount;

  const column = safeFrame % importedSpriteColumns;
  const row = Math.floor(safeFrame / importedSpriteColumns);

  const sourceX = column * importedSpriteFrameWidth;
  const sourceY = row * importedSpriteFrameHeight;

  importedSpriteContext.clearRect(
    0,
    0,
    importedSpriteCanvas.width,
    importedSpriteCanvas.height
  );

  importedSpriteContext.drawImage(
    importedSpriteImage,
    sourceX,
    sourceY,
    importedSpriteFrameWidth,
    importedSpriteFrameHeight,
    0,
    0,
    importedSpriteCanvas.width,
    importedSpriteCanvas.height
  );
}

async function prepareSpriteAnimation() {
  if (!importedSpriteImageURL || !importedSpriteMeta) {
    throw new Error("Sprite PNGまたはJSONがありません。");
  }

  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Sprite PNGの読み込みに失敗しました。"));
    image.src = importedSpriteImageURL!;
  });

  importedSpriteImage = image;

  importedSpriteFrameWidth = Number(importedSpriteMeta.frameWidth);
  importedSpriteFrameHeight = Number(importedSpriteMeta.frameHeight);
  importedSpriteColumns = Number(importedSpriteMeta.columns);
  importedSpriteRows = Number(importedSpriteMeta.rows);

  const declaredFrames = Number(importedSpriteMeta.frames);
  const maxFrames = importedSpriteColumns * importedSpriteRows;
  importedSpriteFrameCount = Math.max(1, Math.min(declaredFrames, maxFrames));

  const declaredFPS = Number(importedSpriteMeta.fps);
  const durationMs = Number(importedSpriteMeta.duration);

  importedSpriteFPS =
    declaredFPS > 0
      ? declaredFPS
      : durationMs > 0
        ? importedSpriteFrameCount / (durationMs / 1000)
        : 4;

  if (
    !Number.isFinite(importedSpriteFrameWidth) ||
    importedSpriteFrameWidth <= 0 ||
    !Number.isFinite(importedSpriteFrameHeight) ||
    importedSpriteFrameHeight <= 0 ||
    !Number.isFinite(importedSpriteColumns) ||
    importedSpriteColumns <= 0 ||
    !Number.isFinite(importedSpriteRows) ||
    importedSpriteRows <= 0 ||
    !Number.isFinite(importedSpriteFrameCount) ||
    importedSpriteFrameCount <= 0 ||
    !Number.isFinite(importedSpriteFPS) ||
    importedSpriteFPS <= 0
  ) {
    throw new Error("Sprite JSONの情報が不足しています。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = importedSpriteFrameWidth;
  canvas.height = importedSpriteFrameHeight;

  const context = canvas.getContext("2d", { alpha: true });

  if (!context) {
    throw new Error("Sprite Canvasを作成できません。");
  }

  context.imageSmoothingEnabled = true;

  importedSpriteCanvas = canvas;
  importedSpriteContext = context;
  importedSpriteFrame = 0;
  importedSpriteElapsed = 0;
  importedSpritePlaying = true;

  drawSpriteFrame(0);
}

function addSpriteArtworkToWorld() {
  if (!importedSpriteCanvas) {
    throw new Error("Sprite Canvasが準備されていません。");
  }

  clearImportedArtwork();

  const texture = new pc.Texture(app.graphicsDevice, {
    format: pc.PIXELFORMAT_RGBA8,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    mipmaps: false
  });

  texture.setSource(importedSpriteCanvas);
  importedArtworkTexture = texture;

  const spriteMaterial = new pc.StandardMaterial();
  spriteMaterial.diffuseMap = texture;
  spriteMaterial.emissiveMap = texture;
  spriteMaterial.emissive = new pc.Color(1, 1, 1);
  spriteMaterial.opacityMap = texture;
  spriteMaterial.opacityMapChannel = "a";
  spriteMaterial.blendType = pc.BLEND_NORMAL;
  spriteMaterial.depthWrite = false;
  spriteMaterial.alphaTest = 0.12;
  spriteMaterial.useLighting = false;
  spriteMaterial.cull = pc.CULLFACE_NONE;
  spriteMaterial.update();

  const plane = new pc.Entity("ImportedSpriteArtwork");
  plane.addComponent("render", { type: "plane" });
  plane.render!.material = spriteMaterial;
  plane.render!.castShadows = true;
  plane.setPosition(0, 1.8, -3);
  plane.setLocalScale(3.2, 1, 3.2);
  plane.setEulerAngles(90, 0, 0);
  app.root.addChild(plane);

  importedArtworkEntity = plane;
  importedArtworkKind = "sprite";
  importedArtworkTexture.upload();

  const media = xrMediaManager.register(createMediaObject({
    title: "Sprite Artwork",
    type: "sprite",
    entity: plane,
    playable: true,
    animated: true,
    playback: {
      play: () => { importedSpritePlaying = true; },
      stop: () => { importedSpritePlaying = false; },
      setLoop: () => { /* Sprite currently loops by design. */ }
    },
    behavior: [
        {
            id: "proximity-play",
            trigger: "user-proximity",
            distance: 3,
            enterAction: "play",
            leaveAction: "stop",
            enabled: false
        }
    ]
}));
  activeXRMediaId = media.id;

  console.log("Sprite artwork added.");
}

async function addWebMArtworkToWorld(file: File) {
  clearImportedSpriteResources();
  clearImportedArtwork();
  importedWebMPackageBlob = file;
  importedArtworkObjectURL = URL.createObjectURL(file);

  const video = document.createElement("video");
  video.src = importedArtworkObjectURL;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "auto";
  importedArtworkVideo = video;

  try {
    await video.play();
  } catch {
    console.log("WebM autoplay waiting for user interaction.");
  }

  const texture = new pc.Texture(app.graphicsDevice, {
    format: pc.PIXELFORMAT_RGBA8,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    mipmaps: false
  });
  texture.setSource(video);
  importedArtworkTexture = texture;

  const importedMaterial = new pc.StandardMaterial();
  importedMaterial.diffuseMap = texture;
  importedMaterial.emissiveMap = texture;
  importedMaterial.emissive = new pc.Color(1, 1, 1);
  importedMaterial.opacityMap = texture;
  importedMaterial.opacityMapChannel = "a";
  importedMaterial.blendType = pc.BLEND_NORMAL;
  importedMaterial.depthWrite = false;
  importedMaterial.alphaTest = 0.12;
  importedMaterial.useLighting = false;
  importedMaterial.cull = pc.CULLFACE_NONE;
  importedMaterial.update();

  const plane = new pc.Entity("ImportedArtwork");
  plane.addComponent("render", { type: "plane" });
  plane.render!.material = importedMaterial;
  plane.render!.castShadows = true;
  plane.setPosition(0, 1.8, -3);
  plane.setLocalScale(3.2, 1, 3.2);
  plane.setEulerAngles(90, 0, 0);
  app.root.addChild(plane);

  importedArtworkEntity = plane;
  importedArtworkKind = "webm";

  const media = xrMediaManager.register(createMediaObject({
    title: file.name,
    type: "webm",
    entity: plane,
    playable: true,
    animated: true,
    playback: {
      play: async () => { await video.play(); },
      stop: () => { video.pause(); },
      setLoop: (loop) => { video.loop = loop; }
    },
    source: { fileName: file.name },
    behavior: [
      {
        id: "proximity-play",
        trigger: "user-proximity",
        distance: 3,
        enterAction: "play",
        leaveAction: "stop",
        enabled: true
      }
    ]
  }));
  activeXRMediaId = media.id;

  console.log("Artwork added:", file.name);
}

// =========================================================
// Prototype 0.10 / Stage 3 / GLB IMPORT + ANIMATION CORE
// =========================================================

function loadGLBContainerAsset(file: File, objectURL: string) {
  return new Promise<pc.Asset>((resolve, reject) => {
    app.assets.loadFromUrlAndFilename(
      objectURL,
      file.name,
      "container",
      (error, asset) => {
        if (error || !asset) {
          reject(
            error instanceof Error
              ? error
              : new Error(String(error || "GLB asset could not be loaded."))
          );
          return;
        }

        resolve(asset);
      }
    );
  });
}

function normalizeImportedGLB(
  modelEntity: pc.Entity,
  normalizer: pc.Entity
) {
  const renderComponents = modelEntity.findComponents("render") as any[];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let foundBounds = false;

  for (const render of renderComponents) {
    render.castShadows = true;

    const meshInstances = render.meshInstances || [];
    for (const meshInstance of meshInstances) {
      const aabb = meshInstance.aabb;
      if (!aabb) continue;

      foundBounds = true;

      const c = aabb.center;
      const h = aabb.halfExtents;

      minX = Math.min(minX, c.x - h.x);
      minY = Math.min(minY, c.y - h.y);
      minZ = Math.min(minZ, c.z - h.z);
      maxX = Math.max(maxX, c.x + h.x);
      maxY = Math.max(maxY, c.y + h.y);
      maxZ = Math.max(maxZ, c.z + h.z);
    }
  }

  if (!foundBounds) {
    return;
  }

  const width = Math.max(0.0001, maxX - minX);
  const height = Math.max(0.0001, maxY - minY);
  const depth = Math.max(0.0001, maxZ - minZ);
  const maxDimension = Math.max(width, height, depth);

  // Normalize a newly imported model to roughly human scale.
  // The placement editor then applies a second, user-controlled uniform scale.
  const targetSize = 1.8;
  const baseScale = targetSize / maxDimension;

  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  normalizer.setLocalScale(baseScale, baseScale, baseScale);
  normalizer.setLocalPosition(
    -centerX * baseScale,
    -minY * baseScale,
    -centerZ * baseScale
  );
}

async function addGLBArtworkToWorld(file: File) {
  importedGLBPackageBlob = file;
  clearImportedSpriteResources();
  clearImportedArtwork();

  importedGLBObjectURL = URL.createObjectURL(file);

  try {
    const asset = await loadGLBContainerAsset(file, importedGLBObjectURL);
    importedGLBAsset = asset;

    const containerResource = asset.resource as any;

    if (!containerResource?.instantiateRenderEntity) {
      throw new Error("GLB container resource could not be instantiated.");
    }

    const modelEntity = containerResource.instantiateRenderEntity() as pc.Entity;
    importedGLBModelEntity = modelEntity;

    const holder = new pc.Entity("ImportedGLBArtwork");
    const normalizer = new pc.Entity("GLBNormalizer");

    holder.addChild(normalizer);
    normalizer.addChild(modelEntity);
    app.root.addChild(holder);

    // Prototype 0.10 / Stage 3.1:
    // attach the complete GLB hierarchy to the live scene first, then bind animation.
    setupGLBAnimations(modelEntity, containerResource);

    normalizeImportedGLB(modelEntity, normalizer);

    importedArtworkEntity = holder;
    importedArtworkKind = "glb";

    holder.setPosition(0, 0, -3);
    holder.setLocalScale(1, 1, 1);
    holder.setEulerAngles(0, 0, 0);

    const media = xrMediaManager.register(createMediaObject({
      title: file.name,
      type: "glb",
      entity: holder,
      playable: importedGLBAnimationClips.length > 0,
      animated: importedGLBAnimationClips.length > 0,
      playback: {
        play: () => { playSelectedGLBAnimation(); },
        stop: () => { stopGLBAnimation(); },
        setLoop: (loop) => {
          glbAnimationLoop.checked = loop;
          glbAnimationLoop.dispatchEvent(new Event("change"));
        },
        getClips: () => importedGLBAnimationClips.map((clip) => clip.displayName),
        playClip: (name) => {
          const index = importedGLBAnimationClips.findIndex((clip) => clip.displayName === name);
          if (index >= 0) {
            importedGLBSelectedAnimation = index;
            glbAnimationSelect.selectedIndex = index;
            playSelectedGLBAnimation();
          }
        }
      },
      source: { fileName: file.name },
      behavior: [
        {
          id: "proximity-play",
          trigger: "user-proximity",
          distance: 3,
          enterAction: "play",
          leaveAction: "stop",
          enabled: true
        }
      ]
    }));
    activeXRMediaId = media.id;

    console.log("GLB artwork added:", file.name);
  } catch (error) {
    clearImportedArtwork();
    throw error;
  }
}

// =========================================================
// Prototype 0.9 / PLACEMENT EDITOR
// =========================================================

let placementX = 0;
let placementY = 1.8;
let placementZ = -3;
let placementScale = 3.2;
let placementRotationY = 0;

function updatePlacementUI() {
  if (artworkXValue) artworkXValue.textContent = placementX.toFixed(1);
  if (artworkYValue) artworkYValue.textContent = placementY.toFixed(1);
  if (artworkZValue) artworkZValue.textContent = placementZ.toFixed(1);
  if (artworkScale) artworkScale.value = String(placementScale);
  if (artworkRotationY) artworkRotationY.value = String(placementRotationY);
}

function applyArtworkPlacement() {
  if (!importedArtworkEntity) return;

  importedArtworkEntity.setPosition(placementX, placementY, placementZ);

  if (importedArtworkKind === "glb") {
    importedArtworkEntity.setLocalScale(
      placementScale,
      placementScale,
      placementScale
    );
    importedArtworkEntity.setEulerAngles(0, placementRotationY, 0);
  } else {
    importedArtworkEntity.setLocalScale(placementScale, 1, placementScale);
    importedArtworkEntity.setEulerAngles(90, placementRotationY, 0);
  }
}

function openPlacementEditor() {
  placementX = 0;
  placementZ = -3;
  placementRotationY = 0;

  if (importedArtworkKind === "glb") {
    placementY = 0;
    placementScale = 1;
  } else {
    placementY = 1.8;
    placementScale = 3.2;
  }

  updatePlacementUI();
  applyArtworkPlacement();

  if (importedArtworkKind === "glb") {
    // setupGLBAnimations() already populated the panel; keep it visible even when no clip exists.
    glbAnimationPanel.style.display = "block";
  } else {
    glbAnimationPanel.style.display = "none";
  }

  artworkPlacementPanel?.classList.remove("hidden");
}

const PLACEMENT_STEP = 0.2;

artworkXMinus?.addEventListener("click", () => {
  placementX -= PLACEMENT_STEP;
  updatePlacementUI();
  applyArtworkPlacement();
});

artworkXPlus?.addEventListener("click", () => {
  placementX += PLACEMENT_STEP;
  updatePlacementUI();
  applyArtworkPlacement();
});

artworkYMinus?.addEventListener("click", () => {
  placementY -= PLACEMENT_STEP;
  updatePlacementUI();
  applyArtworkPlacement();
});

artworkYPlus?.addEventListener("click", () => {
  placementY += PLACEMENT_STEP;
  updatePlacementUI();
  applyArtworkPlacement();
});

artworkZMinus?.addEventListener("click", () => {
  placementZ -= PLACEMENT_STEP;
  updatePlacementUI();
  applyArtworkPlacement();
});

artworkZPlus?.addEventListener("click", () => {
  placementZ += PLACEMENT_STEP;
  updatePlacementUI();
  applyArtworkPlacement();
});

artworkScale?.addEventListener("input", () => {
  placementScale = Number(artworkScale.value);
  applyArtworkPlacement();
});

artworkRotationY?.addEventListener("input", () => {
  placementRotationY = Number(artworkRotationY.value);
  applyArtworkPlacement();
});

placeArtworkButton?.addEventListener("click", () => {
  if (editingManagedMediaId) {
    // EDIT works directly on the already committed Entity. PLACE simply finishes editing.
    const editedId = editingManagedMediaId;
    editingManagedMediaId = null;
    importedArtworkEntity = null;
    importedArtworkKind = null;
    selectedManagedMediaId = editedId;
    sendSharedMediaTransform(editedId);
    refreshMediaManagerUI();
    artworkPlacementPanel?.classList.add("hidden");
    console.log("[0.14.6.1 EDIT CONFIRMED / PLAYBACK PRESERVED]", editedId);
    return;
  }

  commitActiveArtworkToWorld();
  artworkPlacementPanel?.classList.add("hidden");
  console.log("Artwork placement confirmed and committed to XR Media World.");
});

cancelPlacementButton?.addEventListener("click", () => {
  if (editingManagedMediaId) {
    // Stage 3 CANCEL exits edit mode. (Transform undo is reserved for a later stage.)
    editingManagedMediaId = null;
    importedArtworkEntity = null;
    importedArtworkKind = null;
    artworkPlacementPanel?.classList.add("hidden");
    return;
  }

  clearImportedArtwork();
  clearImportedSpriteResources();
  artworkPlacementPanel?.classList.add("hidden");
});

// Prototype 0.16.0 / LOCAL AUDIO IMPORT
async function addAudioArtworkToWorld(file:File){
  importedAudioBlob=file; importedAudioExt=file.name.toLowerCase().endsWith(".wav")?"wav":"mp3"; const url=URL.createObjectURL(file); const el=new Audio(url);
  const entity=makeAudioMarker("ImportedAudioArtwork"); entity.setPosition(0,1.2,-3); app.root.addChild(entity); importedArtworkEntity=entity; importedArtworkKind="audio"; importedAudioElement=el; importedArtworkObjectURL=url;
  configureSpatialAudioElement("preview-audio",el,entity,{volume:Number(audioVolume.value),loop:audioLoop.checked,spatial:audioSpatial.checked,distance:Number(audioDistance.value)});
  const media=xrMediaManager.register(createMediaObject({title:file.name,type:"audio" as any,entity,playable:true,animated:false,playback:{play:async()=>{el.volume=Number(audioVolume.value);el.loop=audioLoop.checked;try{await el.play()}catch(e){console.warn(e)}},stop:()=>{el.pause();el.currentTime=0},setLoop:(v:boolean)=>{el.loop=v}},behavior:[{id:"proximity-play",trigger:"user-proximity",distance:3,enterAction:"play",leaveAction:"stop",enabled:false}]})); activeXRMediaId=media.id;
}

// =========================================================
// ADD TO WORLD
// =========================================================

addArtworkToWorldButton?.addEventListener("click", async () => {
  const file = artworkFileInput?.files?.[0];
  if (!file) return;

  if (artworkMediaType === "audio") {
    try { addArtworkToWorldButton.disabled=true; await addAudioArtworkToWorld(file); closeArtworkPanelUI(); openPlacementEditor(); }
    catch(error){ console.error("Audio import failed:",error); if(artworkFileName)artworkFileName.textContent="AUDIO ERROR"; }
    finally { addArtworkToWorldButton.disabled=false; }
    return;
  }

  if (artworkMediaType === "webm") {
    try {
      addArtworkToWorldButton.disabled = true;
      await addWebMArtworkToWorld(file);
      closeArtworkPanelUI();
      openPlacementEditor();
    } catch (error) {
      console.error("Artwork import failed:", error);
      if (artworkFileName) artworkFileName.textContent = "WEBM ERROR";
    } finally {
      addArtworkToWorldButton.disabled = false;
    }
    return;
  }

  if (artworkMediaType === "sprite") {
    try {
      addArtworkToWorldButton.disabled = true;

      await loadSpriteZipPackage(file);
      await prepareSpriteAnimation();
      addSpriteArtworkToWorld();

      if (artworkFileName) {
        artworkFileName.textContent = `${file.name} / READY`;
      }

      closeArtworkPanelUI();
      openPlacementEditor();

      console.log("Sprite package loaded successfully.");
    } catch (error) {
      console.error("Sprite ZIP import failed:", error);

      if (artworkFileName) {
        artworkFileName.textContent = "SPRITE ZIP ERROR";
      }
    } finally {
      addArtworkToWorldButton.disabled = false;
    }
    return;
  }

  // Prototype 0.10 / Stage 2 / GLB
  try {
    addArtworkToWorldButton.disabled = true;

    if (artworkFileName) {
      artworkFileName.textContent = `${file.name} / LOADING`;
    }

    await addGLBArtworkToWorld(file);

    if (artworkFileName) {
      artworkFileName.textContent = `${file.name} / READY`;
    }

    closeArtworkPanelUI();
    openPlacementEditor();

    console.log("GLB package loaded successfully.");
  } catch (error) {
    console.error("GLB import failed:", error);

    if (artworkFileName) {
      artworkFileName.textContent = "GLB ERROR";
    }
  } finally {
    addArtworkToWorldButton.disabled = false;
  }
});

updateArtworkModeUI();
updatePlacementUI();

// ============================================================
// Prototype 0.12 / STEP 2-35
// PLACE / XRMediaManager diagnostic
// ============================================================

function debugXRMediaManager(label: string) {
    console.group(`[XR DEBUG] ${label}`);

    const objects = xrMediaManager.list();

    console.log("Registered Media Objects:", objects.length);
    console.log("Active Media ID:", activeXRMediaId);
    console.log("Local Player Position:", {
        x: localPosition.x,
        y: localPosition.y,
        z: localPosition.z
    });

    objects.forEach((object, index) => {
        const entity = object.entity;
        const position = entity?.getPosition();

        console.log(`Media ${index + 1}`, {
            id: object.id,
            title: object.title,
            type: object.type,

            entityExists: !!entity,
            entityEnabled: entity?.enabled ?? false,

            position: position
                ? {
                    x: position.x,
                    y: position.y,
                    z: position.z
                }
                : null,

            hasPlayback: !!object.playback,
            behavior: object.behavior
        });
    });

    console.groupEnd();
}

// Browser Console から手動実行できるようにする
(window as any).debugXRMediaManager = debugXRMediaManager;

// =========================================================
// UPDATE LOOP
// =========================================================


// =========================================================
// Prototype 0.13 / MULTI TRIGGER BEHAVIOR SYSTEM
// LOOK AT trigger
// =========================================================

const lookAtBehaviorState = new Map<string, boolean>();
const DEFAULT_LOOK_AT_ANGLE_DEG = 12;

const pendingSharedActions = new Map<string, { action: XRBehaviorActionId; source: string; params?: XRTransformActionParams }>();

function flushPendingSharedActions() {
  for (const [mediaId, pending] of Array.from(pendingSharedActions.entries())) {
    const object = xrMediaManager.get(mediaId);
    if (!object) continue;
    runXRBehaviorAction(object, pending.action, pending.params);
    pendingSharedActions.delete(mediaId);
    console.log("[0.15.1.1 ACTION EXECUTE / QUEUED]", mediaId, pending.action, pending.source);
  }
}

type ActiveTransformAnimation = {
  action: XRBehaviorActionId; elapsed: number; duration: number; speed: number; amount: number; axis: "x" | "y" | "z";
  basePosition: pc.Vec3; baseEuler: pc.Vec3; baseScale: pc.Vec3;
};
const activeTransformAnimations = new Map<string, ActiveTransformAnimation>();

function startTransformAnimation(object: any, action: XRBehaviorActionId, params?: XRTransformActionParams) {
  if (!object?.entity) return;
  const p = params ?? { amount: 1, speed: 1, axis: "y", duration: 3 };
  const entity = object.entity as pc.Entity;
  activeTransformAnimations.set(String(object.id), {
    action, elapsed: 0, duration: Math.max(.2, p.duration), speed: Math.max(.05, p.speed), amount: Math.max(.05, p.amount), axis: p.axis,
    basePosition: entity.getPosition().clone(), baseEuler: entity.getEulerAngles().clone(), baseScale: entity.getLocalScale().clone()
  });
}

function updateTransformAnimations(dt: number) {
  for (const [id, anim] of Array.from(activeTransformAnimations.entries())) {
    const object = xrMediaManager.get(id);
    const entity = object?.entity as pc.Entity | undefined;
    if (!entity || !entity.enabled) { activeTransformAnimations.delete(id); continue; }
    anim.elapsed += dt * anim.speed;
    const t = Math.min(1, anim.elapsed / anim.duration);
    const phase = t * Math.PI * 2;
    const envelope = Math.sin(Math.PI * t);
    const a = anim.amount;
    const axis = anim.axis;
    const p = anim.basePosition.clone();
    const r = anim.baseEuler.clone();
    const sc = anim.baseScale.clone();

    switch (anim.action) {
      case "move": {
        const offset = Math.sin(Math.PI * t) * a;
        if (axis === "x") p.x += offset; else if (axis === "y") p.y += offset; else p.z += offset;
        entity.setPosition(p);
        break;
      }
      case "rotate": {
        const deg = 360 * t * a;
        if (axis === "x") r.x += deg; else if (axis === "y") r.y += deg; else r.z += deg;
        entity.setEulerAngles(r);
        break;
      }
      case "scale": {
        const factor = 1 + Math.sin(Math.PI * t) * a;
        entity.setLocalScale(sc.x * factor, sc.y * factor, sc.z * factor);
        break;
      }
      case "float": {
        p.y += Math.sin(phase) * a * envelope;
        entity.setPosition(p);
        break;
      }
      case "orbit": {
        const radius = a;
        p.x += Math.sin(phase) * radius * envelope;
        p.z += (Math.cos(phase) - 1) * radius * envelope;
        entity.setPosition(p);
        break;
      }
      case "shake": {
        const frequency = 18;
        const fade = 1 - t;
        p.x += Math.sin(anim.elapsed * frequency * 1.7) * a * .18 * fade;
        p.y += Math.sin(anim.elapsed * frequency * 2.3 + 1.1) * a * .12 * fade;
        p.z += Math.sin(anim.elapsed * frequency * 2.9 + 2.2) * a * .18 * fade;
        entity.setPosition(p);
        break;
      }
    }

    if (t >= 1) {
      entity.setPosition(anim.basePosition);
      entity.setEulerAngles(anim.baseEuler);
      entity.setLocalScale(anim.baseScale);
      activeTransformAnimations.delete(id);
    }
  }
}

function runXRBehaviorAction(object: any, action: string | undefined, params?: XRTransformActionParams) {
  const actionId = String(action || "none") as XRBehaviorActionId;
  switch (actionId) {
    case "play": void object.playback?.play(); break;
    case "stop": object.playback?.stop(); break;
    case "move": case "rotate": case "scale": case "float": case "orbit": case "shake":
      startTransformAnimation(object, actionId, params); break;
    case "none": default: break;
  }
  console.log("[XR ACTION LOCAL]", { object: object?.title || object?.id || "unknown", mediaId: object?.id || "", action: actionId, params });
}

function dispatchSharedXRBehaviorAction(object: any, action: string | undefined, source: string) {
  const actionId = String(action || "none") as XRBehaviorActionId;
  if (!object?.id || actionId === "none") return;

  const behavior = object.behavior?.[0];
  const params = getBehaviorTransformParams(behavior);
  // Prototype 0.16.0.4 / LOCAL LISTENER + PROXIMITY FIX
  // A proximity event belongs to the client whose local player crossed the
  // threshold. Execute it on that client immediately, then publish it so the
  // other peers can mirror the action. Previously the sender waited for the
  // server echo; depending on broadcast semantics the originating iPhone could
  // be excluded, so approaching on iPhone could make another peer play while
  // the iPhone itself stayed silent. PLAY/STOP are idempotent, so a later echo
  // is safe.
  runXRBehaviorAction(object, actionId, params);

  if (!activeRoom) return;

  activeRoom.send("media:action", {
    id: String(object.id),
    action: actionId,
    source: String(source || "behavior").slice(0, 40),
    params
  });
  console.log("[SHARED ACTION SENT]", object.id, actionId, source);
}

const sharedProximityState = new Map<string, boolean>();
function updateSharedProximityBehaviors() {
  for (const object of xrMediaManager.list()) {
    const behavior = object.behavior?.find(
      (item: any) => (item as any).trigger === "user-proximity" && item.enabled
    );
    if (!behavior || !object.entity || !object.entity.enabled) {
      sharedProximityState.delete(object.id);
      continue;
    }

    const p = object.entity.getPosition();
    const dx = p.x - localPosition.x;
    const dy = p.y - localPosition.y;
    const dz = p.z - localPosition.z;
    const distance = Math.hypot(dx, dy, dz);
    const threshold = Math.max(0.1, Number(behavior.distance ?? 3));
    const isInside = distance <= threshold;
    const previous = sharedProximityState.get(object.id);

    if (object.id === selectedManagedMediaId) {
      behaviorStatus.textContent = isInside ? "PROXIMITY / ACTIVE" : "PROXIMITY / OUTSIDE";
    }

    if (previous === undefined) {
      sharedProximityState.set(object.id, isInside);
      if (isInside) dispatchSharedXRBehaviorAction(object, behavior.enterAction, "user-proximity-enter");
      continue;
    }

    if (isInside !== previous) {
      sharedProximityState.set(object.id, isInside);
      dispatchSharedXRBehaviorAction(
        object,
        isInside ? behavior.enterAction : behavior.leaveAction,
        isInside ? "user-proximity-enter" : "user-proximity-leave"
      );
    }
  }
}

function updateLookAtBehaviors() {
  const yawRad = cameraYaw * pc.math.DEG_TO_RAD;
  const pitchRad = cameraPitch * pc.math.DEG_TO_RAD;
  const forward = new pc.Vec3(
    -Math.sin(yawRad) * Math.cos(pitchRad),
    Math.sin(pitchRad),
    -Math.cos(yawRad) * Math.cos(pitchRad)
  ).normalize();
  const cameraPosition = camera.getPosition();

  for (const object of xrMediaManager.list()) {
    const behavior = object.behavior?.find(
      (item: any) => (item as any).trigger === "look-at" && item.enabled
    );
    if (!behavior || !object.entity || !object.entity.enabled) {
      lookAtBehaviorState.delete(object.id);
      continue;
    }

    const toObject = object.entity.getPosition().clone().sub(cameraPosition);
    if (toObject.lengthSq() < 0.000001) continue;
    toObject.normalize();

    const lookAngle = pc.math.clamp(
      Number((behavior as any).lookAngle ?? DEFAULT_LOOK_AT_ANGLE_DEG),
      3,
      45
    );
    const cosThreshold = Math.cos(lookAngle * pc.math.DEG_TO_RAD);
    const isLooking = forward.dot(toObject) >= cosThreshold;
    const previous = lookAtBehaviorState.get(object.id);

    if (object.id === selectedManagedMediaId && (behavior as any).trigger === "look-at") {
      behaviorStatus.textContent = isLooking ? "LOOKING / ACTIVE" : "NOT LOOKING";
    }

    if (previous === undefined) {
      lookAtBehaviorState.set(object.id, isLooking);
      dispatchSharedXRBehaviorAction(object, isLooking ? behavior.enterAction : behavior.leaveAction, isLooking ? "look-at-enter" : "look-at-leave");
      continue;
    }

    if (isLooking !== previous) {
      lookAtBehaviorState.set(object.id, isLooking);
      dispatchSharedXRBehaviorAction(object, isLooking ? behavior.enterAction : behavior.leaveAction, isLooking ? "look-at-enter" : "look-at-leave");
      console.log("[XR LOOK AT]", {
        object: object.title,
        isLooking,
        angle: lookAngle,
        action: isLooking ? behavior.enterAction : behavior.leaveAction
      });
    }
  }
}


// =========================================================
// Prototype 0.13.3 / TOUCH TRIGGER
// PC click + mobile tap through one pointer-based spatial input.
// The Behavior layer remains device-independent for future WebXR input.
// =========================================================

const touchRayFrom = new pc.Vec3();
const touchRayTo = new pc.Vec3();
const touchRayDirection = new pc.Vec3();
let spatialPointerStart: { id: number; x: number; y: number } | null = null;
const TOUCH_POINTER_MOVE_TOLERANCE = 10;

function findTouchedMediaObject(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const screenX = (clientX - rect.left) * (canvas.width / rect.width);
  const screenY = (clientY - rect.top) * (canvas.height / rect.height);

  camera.camera!.screenToWorld(screenX, screenY, camera.camera!.nearClip, touchRayFrom);
  camera.camera!.screenToWorld(screenX, screenY, camera.camera!.farClip, touchRayTo);
  touchRayDirection.sub2(touchRayTo, touchRayFrom).normalize();

  let bestObject: any = null;
  let bestDistance = Infinity;

  // Browser-native fallback hit test using a bounding sphere around each media entity.
  // This avoids adding a physics dependency and can later be replaced by WebXR hit-test/controller rays.
  for (const object of xrMediaManager.list()) {
    const behavior = object.behavior?.find(
      (item: any) => (item as any).trigger === "touch" && item.enabled
    );
    if (!behavior || !object.entity || !object.entity.enabled) continue;

    const center = object.entity.getPosition();
    const scale = object.entity.getLocalScale();
    const radius = Math.max(0.35, Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) * 0.55);

    const toCenter = center.clone().sub(touchRayFrom);
    const projection = toCenter.dot(touchRayDirection);
    if (projection < 0) continue;

    const closest = touchRayFrom.clone().add(touchRayDirection.clone().mulScalar(projection));
    const distanceToRay = center.distance(closest);

    if (distanceToRay <= radius && projection < bestDistance) {
      bestDistance = projection;
      bestObject = { object, behavior };
    }
  }

  return bestObject;
}

const touchInitializedObjects = new Set<string>();
const touchActiveState = new Map<string, boolean>();

function initializeTouchBehaviorPlayback() {
  for (const object of xrMediaManager.list()) {
    const behavior = object.behavior?.find(
      (item: any) => (item as any).trigger === "touch" && item.enabled
    );
    if (!behavior || touchInitializedObjects.has(object.id)) continue;

    object.playback?.stop();
    touchInitializedObjects.add(object.id);
    touchActiveState.set(object.id, false);
  }

  for (const id of Array.from(touchInitializedObjects)) {
    if (!xrMediaManager.get(id)) {
      touchInitializedObjects.delete(id);
      touchActiveState.delete(id);
    }
  }
}

function triggerSpatialTouch(clientX: number, clientY: number) {
  const hit = findTouchedMediaObject(clientX, clientY);
  if (!hit) return;

  const { object, behavior } = hit;
  const touchMode = String((behavior as any).touchMode ?? "toggle");

  if (touchMode === "repeat") {
    dispatchSharedXRBehaviorAction(object, behavior.enterAction, "touch-repeat");

    if (object.id === selectedManagedMediaId) {
      behaviorStatus.textContent = "TOUCHED / REPEAT";
      window.setTimeout(() => {
        if (selectedManagedMediaId === object.id && behavior.enabled) {
          behaviorStatus.textContent = "TAP / CLICK OBJECT";
        }
      }, 450);
    }

    console.log("[XR TOUCH]", {
      object: object.title,
      mode: "repeat",
      action: behavior.enterAction
    });
    return;
  }

  // TOGGLE: first touch = Enter Action, second touch = Leave Action.
  const wasActive = touchActiveState.get(object.id) ?? false;
  const isActive = !wasActive;
  touchActiveState.set(object.id, isActive);

  const action = isActive ? behavior.enterAction : behavior.leaveAction;
  dispatchSharedXRBehaviorAction(object, action, isActive ? "touch-enter" : "touch-leave");

  if (object.id === selectedManagedMediaId) {
    behaviorStatus.textContent = isActive ? "TOUCHED / ON" : "TOUCHED / OFF";
  }

  console.log("[XR TOUCH]", {
    object: object.title,
    mode: "toggle",
    state: isActive ? "on" : "off",
    action
  });
}

canvas.addEventListener("pointerdown", (event) => {
  // Mouse: left button only. Touch/pen: primary pointer.
  if (event.pointerType === "mouse" && event.button !== 0) return;
  spatialPointerStart = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY
  };
});

canvas.addEventListener("pointerup", (event) => {
  if (!spatialPointerStart || spatialPointerStart.id !== event.pointerId) return;

  const dx = event.clientX - spatialPointerStart.x;
  const dy = event.clientY - spatialPointerStart.y;
  const moved = Math.hypot(dx, dy);
  spatialPointerStart = null;

  // A drag rotates the camera; a short stationary pointer gesture is a TOUCH.
  if (moved <= TOUCH_POINTER_MOVE_TOLERANCE) {
    triggerSpatialTouch(event.clientX, event.clientY);
  }
});

canvas.addEventListener("pointercancel", (event) => {
  if (spatialPointerStart?.id === event.pointerId) {
    spatialPointerStart = null;
  }
});

app.on("update", (dt: number) => {
  if (
    importedArtworkVideo &&
    importedArtworkTexture &&
    importedArtworkVideo.readyState >= 2
  ) {
    importedArtworkTexture.upload();
  }

  // Prototype 0.9 / Stage 3⑤-2 / Sprite Sheet Animation
  if (
    importedSpritePlaying &&
    importedSpriteCanvas &&
    importedArtworkTexture &&
    !importedArtworkVideo &&
    importedSpriteFrameCount > 0
  ) {
    importedSpriteElapsed += dt;

    const frameDuration = 1 / importedSpriteFPS;

    while (importedSpriteElapsed >= frameDuration) {
      importedSpriteElapsed -= frameDuration;
      importedSpriteFrame =
        (importedSpriteFrame + 1) % importedSpriteFrameCount;
      drawSpriteFrame(importedSpriteFrame);
      importedArtworkTexture.upload();
    }
  }

  // Prototype 0.11 / Stage 2 / keep all placed animated media alive.
  // Prototype 0.16.0 / lightweight 3D spatial audio + distance attenuation
  for (const el of audioElements.values()) {
    const entity=(el as any).__xrEntity as pc.Entity|undefined; if(!entity)continue; const base=Number((el as any).__xrBaseVolume??.8); const maxD=Number((el as any).__xrDistance??12);
    if((el as any).__xrSpatial){
      const ep=entity.getPosition();
      // 0.16.0.1: the listener is the local PLAYER, not the third-person camera.
      // Using the orbit camera made nearby audio silent whenever the camera itself
      // happened to sit outside the attenuation radius.
      // 0.16.0.3: use the authoritative local movement position directly.
      // On iOS the local avatar entity can lag behind / be unavailable during the
      // frame where audio attenuation is evaluated, which made distance volume
      // appear fixed. localPosition is the same position used by movement and
      // proximity behavior on every device.
      const lp=localPosition;
      const d=Math.hypot(ep.x-lp.x,ep.y-lp.y,ep.z-lp.z);
      el.volume=Math.max(0,Math.min(1,base*(1-d/maxD)));
    } else el.volume=base;
  }

  for (const runtime of placedMediaRuntimes) {
    runtime.update?.(dt);
  }

  const cameraTarget =
    currentSessionId && avatars.get(currentSessionId)
      ? avatars.get(currentSessionId)!.entity.getPosition()
      : new pc.Vec3(0, 0, 0);

  const selfAvatar = currentSessionId ? avatars.get(currentSessionId) : undefined;

  if (selfAvatar) {
    selfAvatar.entity.enabled = !firstPersonMode;
    selfAvatar.名前ラベル.style.display = firstPersonMode ? "none" : "";
  }

  const yawRad = cameraYaw * pc.math.DEG_TO_RAD;
  const pitchRad = cameraPitch * pc.math.DEG_TO_RAD;
  const horizontalDistance = Math.cos(pitchRad) * cameraDistance;

  const cameraX = cameraTarget.x + Math.sin(yawRad) * horizontalDistance;
  const cameraY = cameraTarget.y - Math.sin(pitchRad) * cameraDistance;
  const cameraZ = cameraTarget.z + Math.cos(yawRad) * horizontalDistance;

  if (firstPersonMode) {
    const eyeHeight = 0.55;
    camera.setPosition(cameraTarget.x, cameraTarget.y + eyeHeight, cameraTarget.z);
    const lookDistance = 10;
    const lookX = cameraTarget.x - Math.sin(yawRad) * Math.cos(pitchRad) * lookDistance;
    const lookY = cameraTarget.y + eyeHeight + Math.sin(pitchRad) * lookDistance;
    const lookZ = cameraTarget.z - Math.cos(yawRad) * Math.cos(pitchRad) * lookDistance;
    camera.lookAt(lookX, lookY, lookZ);
  } else {
    camera.setPosition(cameraX, cameraY, cameraZ);
    camera.lookAt(cameraTarget.x, cameraTarget.y + 0.3, cameraTarget.z);
  }

  // Smooth remote avatars toward server-authoritative positions.
  for (const [sessionId, avatar] of avatars) {
    if (sessionId === currentSessionId) continue;
    const p = avatar.entity.getPosition();
    avatar.entity.setPosition(
      pc.math.lerp(p.x, avatar.target.x, Math.min(1, dt * 10)),
      pc.math.lerp(p.y, avatar.target.y, Math.min(1, dt * 10)),
      pc.math.lerp(p.z, avatar.target.z, Math.min(1, dt * 10))
    );
  }

  for (const avatar of avatars.values()) {
    const worldPos = avatar.entity.getPosition().clone();
    worldPos.y += 0.65;
    const screenPos = camera.camera!.worldToScreen(worldPos);
    avatar.名前ラベル.style.left = `${screenPos.x}px`;
    avatar.名前ラベル.style.top = `${screenPos.y}px`;
  }

  const PROXIMITY_DISTANCE = 2.5;

  for (const [sessionId, avatar] of avatars) {
    let isNearSomeone = false;
    let nearestDistance = PROXIMITY_DISTANCE;
    const posA = avatar.entity.getPosition();

    for (const [otherSessionId, otherAvatar] of avatars) {
      if (sessionId === otherSessionId) continue;
      const posB = otherAvatar.entity.getPosition();
      const dx = posA.x - posB.x;
      const dz = posA.z - posB.z;
      const distance = Math.hypot(dx, dz);

      if (distance <= PROXIMITY_DISTANCE) {
        isNearSomeone = true;
        nearestDistance = Math.min(nearestDistance, distance);
      }
    }

    avatar.proximityHalo.enabled = isNearSomeone;

    if (isNearSomeone) {
      avatar.名前ラベル.style.background = "rgba(255, 120, 40, 0.88)";
      avatar.名前ラベル.style.transform = "translate(-50%, -115%) scale(1.08)";
    } else {
      avatar.名前ラベル.style.background = "rgba(0, 0, 0, 0.65)";
      avatar.名前ラベル.style.transform = "translate(-50%, -100%) scale(1)";
    }

    if (isNearSomeone) {
      const proximity = 1 - nearestDistance / PROXIMITY_DISTANCE;
      const haloScale = 1.5 + proximity * 1.2;
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08;
      const pulsedScale = haloScale * pulse;
      avatar.proximityHalo.setLocalScale(pulsedScale, 0.025, pulsedScale);
    }
  }

  // Prototype 0.15.3 / TRANSFORM ANIMATION CORE
  updateTransformAnimations(dt);

  if (!activeRoom || !currentSessionId) return;
  const me = avatars.get(currentSessionId);
  if (!me) return;

  // Prototype 0.12 / REACTIVE BEHAVIOR CORE
  // Evaluate media proximity every frame, even while the user is standing still.
  // XRMediaManager fires playback actions only when inside/outside state changes.
  updateSharedProximityBehaviors();
  updateLookAtBehaviors();
  initializeTouchBehaviorPlayback();
  flushPendingSharedActions();

  let x = 0;
  let z = 0;
  if (keys.has("w") || keys.has("arrowup")) z -= 1;
  if (keys.has("s") || keys.has("arrowdown")) z += 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;

  x += Math.abs(joystickX) < 0.08 ? 0 : joystickX;
  z += Math.abs(joystickY) < 0.08 ? 0 : joystickY;

  if (x !== 0 || z !== 0) {
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }

    const movementYawRad = cameraYaw * pc.math.DEG_TO_RAD;
    const moveX = x * Math.cos(movementYawRad) + z * Math.sin(movementYawRad);
    const moveZ = -x * Math.sin(movementYawRad) + z * Math.cos(movementYawRad);
    const moveAngle = Math.atan2(moveX, moveZ) * pc.math.RAD_TO_DEG + 180;

    me.entity.setEulerAngles(0, moveAngle, 0);

    localPosition.x = pc.math.clamp(
      localPosition.x + moveX * MOVE_SPEED * dt,
      -7,
      7
    );

    localPosition.z = pc.math.clamp(
      localPosition.z + moveZ * MOVE_SPEED * dt,
      -7,
      7
    );

    me.entity.setPosition(localPosition);

    const now = performance.now();
    if (now - lastSend >= 1000 / SEND_HZ) {
      activeRoom.send("move", {
        x: localPosition.x,
        z: localPosition.z,
        rotationY: moveAngle
      });
      lastSend = now;
    }
  }
});
