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
  cameraPitch = pc.math.clamp(cameraPitch, -80, -10);
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
  cameraPitch = pc.math.clamp(cameraPitch, -80, -10);
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
// ENTER WORLD
// =========================================================

async function enterWorld() {
  enterButton.disabled = true;
  status.textContent = "接続しています…";

  const name = (nameInput.value.trim() || "Guest").slice(0, 16);
  const roomCode = (roomInput.value.trim() || "ART001")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16);

  roomInput.value = roomCode;

  try {
    const client = new Client(SERVER_URL);
    const room = await client.joinOrCreate("shared_world", { name, roomCode });
    activeRoom = room;
    currentSessionId = room.sessionId;

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

let artworkMediaType: "webm" | "sprite" | "glb" = "webm";

function updateArtworkModeUI() {
  const isWebM = artworkMediaType === "webm";
  const isSprite = artworkMediaType === "sprite";
  const isGLB = artworkMediaType === "glb";

  webmArtworkMode?.classList.toggle("active", isWebM);
  spriteArtworkMode?.classList.toggle("active", isSprite);
  glbArtworkMode?.classList.toggle("active", isGLB);

  if (artworkFileInput) {
    artworkFileInput.value = "";

    if (isWebM) {
      artworkFileInput.accept = ".webm,video/webm";
    } else if (isSprite) {
      artworkFileInput.accept = ".zip,application/zip";
    } else {
      artworkFileInput.accept = ".glb,model/gltf-binary";
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
        : lowerName.endsWith(".glb");

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

type ImportedArtworkKind = "webm" | "sprite" | "glb" | null;

let importedArtworkKind: ImportedArtworkKind = null;
let importedArtworkEntity: pc.Entity | null = null;
let importedArtworkVideo: HTMLVideoElement | null = null;
let importedArtworkTexture: pc.Texture | null = null;
let importedArtworkObjectURL: string | null = null;

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
  kind: "webm" | "sprite" | "glb";
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
    z-index: 50; width: min(340px, calc(100vw - 32px)); max-height: 62vh;
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
  .media-manager-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
  .media-manager-actions button { width:100% !important; }
  #deleteManagedMediaButton { border-color:#7b3940; }
  @media (max-width: 640px) {
    #mediaManagerPanel { top:auto; right:12px; left:12px; bottom:max(12px, env(safe-area-inset-bottom)); width:auto; max-height:55vh; }
    #mediaManagerButton { right:12px; }
  }
`;
document.head.appendChild(mediaManagerStyle);

const closeMediaManagerButton = mediaManagerPanel.querySelector<HTMLButtonElement>("#closeMediaManagerButton")!;
const mediaManagerList = mediaManagerPanel.querySelector<HTMLElement>("#mediaManagerList")!;
const editManagedMediaButton = mediaManagerPanel.querySelector<HTMLButtonElement>("#editManagedMediaButton")!;
const deleteManagedMediaButton = mediaManagerPanel.querySelector<HTMLButtonElement>("#deleteManagedMediaButton")!;

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
      });
      mediaManagerList.appendChild(button);
    });
  }

  const hasSelection = !!selectedManagedMediaId && managedPlacedMedia.has(selectedManagedMediaId);
  editManagedMediaButton.disabled = !hasSelection;
  deleteManagedMediaButton.disabled = !hasSelection;
}

function disposePlacedRuntime(id: string) {
  const index = placedMediaRuntimes.findIndex((runtime) => runtime.id === id);
  if (index >= 0) {
    const [runtime] = placedMediaRuntimes.splice(index, 1);
    runtime.dispose?.();
  }
}

function deleteManagedMedia(id: string) {
  const item = managedPlacedMedia.get(id);
  if (!item) return;

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
    let playing = importedSpritePlaying;

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

    placedMediaRuntimes.push({
      id: committedId,
      dispose: () => {
        if (asset) {
          asset.unload();
          app.assets.remove(asset);
        }
        if (objectURL) URL.revokeObjectURL(objectURL);
      }
    });
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

  // The Entity and resources now belong to the committed XRMediaObject.
  // Clear only the editor's references. Do NOT destroy the committed object.
  importedArtworkEntity = null;
  importedArtworkVideo = null;
  importedArtworkTexture = null;
  importedArtworkObjectURL = null;

  importedGLBModelEntity = null;
  importedGLBAsset = null;
  importedGLBObjectURL = null;

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
            enabled: true
        }
    ]
}));
  activeXRMediaId = media.id;

  console.log("Sprite artwork added.");
}

async function addWebMArtworkToWorld(file: File) {
  clearImportedSpriteResources();
  clearImportedArtwork();
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
    refreshMediaManagerUI();
    artworkPlacementPanel?.classList.add("hidden");
    console.log("XR Media edit confirmed:", editedId);
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

// =========================================================
// ADD TO WORLD
// =========================================================

addArtworkToWorldButton?.addEventListener("click", async () => {
  const file = artworkFileInput?.files?.[0];
  if (!file) return;

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

  if (!activeRoom || !currentSessionId) return;
  const me = avatars.get(currentSessionId);
  if (!me) return;

  // Prototype 0.12 / REACTIVE BEHAVIOR CORE
  // Evaluate media proximity every frame, even while the user is standing still.
  // XRMediaManager fires playback actions only when inside/outside state changes.
  xrMediaManager.updateUserProximity(localPosition);

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
