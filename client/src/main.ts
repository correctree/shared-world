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
console.log("[PROTOTYPE 0.14.6 SHARED MEDIA LIFECYCLE LOADED]");
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

function sharedAssetURL(mediaId: string, extension: "zip" | "glb" | "webm") {
  return `${SERVER_URL.replace(/\/$/, "")}/assets/${encodeURIComponent(mediaId)}.${extension}`;
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

async function createSharedSpriteFromAsset(mediaId: string, media: any) {
  if (managedPlacedMedia.has(mediaId) || sharedRemoteMediaIds.has(mediaId)) return;

  const assetRef = String(media.assetRef || "");
  if (!assetRef) {
    createSharedSpritePlaceholder(mediaId, media);
    return;
  }

  try {
    console.log("[SHARED ASSET FETCH]", mediaId, assetRef);
    const response = await fetch(assetRef, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const zipBlob = await response.blob();
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

    const pngBlob = await pngEntry.async("blob");
    const jsonText = await jsonEntry.async("text");
    const meta = JSON.parse(jsonText);

    const imageURL = URL.createObjectURL(pngBlob);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Shared Sprite PNG load failed."));
      image.src = imageURL;
    });

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

    const texture = new pc.Texture(app.graphicsDevice, {
      format: pc.PIXELFORMAT_RGBA8,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      mipmaps: false
    });
    texture.setSource(spriteCanvas);

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

    const plane = new pc.Entity(`SharedSprite_${mediaId}`);
    plane.addComponent("render", { type: "plane" });
    plane.render!.material = spriteMaterial;
    plane.setPosition(media.x, media.y, media.z);
    plane.setLocalScale(media.scale, 1, media.scale);
    plane.setEulerAngles(90, media.rotationY, 0);
    app.root.addChild(plane);

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
    texture.upload();

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
    console.log("[SHARED SPRITE READY]", mediaId, { frameCount, fps });
  } catch (error) {
    console.error("[SHARED ASSET LOAD ERROR]", mediaId, error);
    createSharedSpritePlaceholder(mediaId, media);
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

function removeSharedSpritePlaceholder(mediaId: string) {
  if (!sharedRemoteMediaIds.has(mediaId)) return;
  const item = managedPlacedMedia.get(mediaId);
  item?.entity.destroy();

  const runtimeIndex = placedMediaRuntimes.findIndex((runtime) => runtime.id === mediaId);
  if (runtimeIndex >= 0) {
    const [runtime] = placedMediaRuntimes.splice(runtimeIndex, 1);
    runtime.dispose?.();
  }

  xrMediaManager.unregister(mediaId);
  managedPlacedMedia.delete(mediaId);
  sharedRemoteMediaIds.delete(mediaId);
  if (selectedManagedMediaId === mediaId) selectedManagedMediaId = null;
  refreshMediaManagerUI();
}

async function publishCommittedSpriteToSharedWorld(mediaId: string, packageBlob: Blob | null) {
  console.log("[SHARED PUBLISH START]", mediaId);

  if (!activeRoom || !packageBlob) {
    console.error("[SHARED PUBLISH ABORT]", {
      hasRoom: !!activeRoom,
      hasPackage: !!packageBlob
    });
    return;
  }

  const item = managedPlacedMedia.get(mediaId);
  const media = xrMediaManager.get(mediaId);
  if (!item || item.kind !== "sprite" || !media) {
    console.error("[SHARED PUBLISH ABORT] media lookup/kind failed");
    return;
  }

  const assetRef = sharedAssetURL(mediaId, "zip");

  try {
    const uploadResponse = await fetch(assetRef, {
      method: "PUT",
      headers: { "Content-Type": "application/zip" },
      body: packageBlob
    });

    if (!uploadResponse.ok) {
      throw new Error(`Asset upload failed: HTTP ${uploadResponse.status}`);
    }

    console.log("[SHARED ASSET UPLOADED]", mediaId, assetRef);

    const position = item.entity.getPosition();
    const rotation = item.entity.getEulerAngles();
    const scale = item.entity.getLocalScale();

    activeRoom.send("media:add", {
      id: mediaId,
      title: media.title || "Sprite Artwork",
      type: "sprite",
      assetRef,
      x: position.x,
      y: position.y,
      z: position.z,
      rotationY: rotation.y,
      scale: scale.x
    });

    console.log("[SHARED MEDIA SENT]", mediaId);
  } catch (error) {
    console.error("[SHARED PUBLISH ERROR]", mediaId, error);
  }
}



async function createSharedWebMFromAsset(mediaId: string, media: any) {
  if (managedPlacedMedia.has(mediaId) || sharedRemoteMediaIds.has(mediaId)) return;

  const fallbackRef=String(media.fallbackRef || "");
  if(isIOSLikeDevice() && fallbackRef){
    console.log("[SHARED WEBM ALPHA FALLBACK -> SPRITE]",mediaId,fallbackRef);
    await createSharedSpriteFromAsset(mediaId,{title:media.title,assetRef:fallbackRef,x:media.x,y:media.y,z:media.z,rotationY:media.rotationY,scale:media.scale});
    return;
  }

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

    const response = await fetch(assetRef, { cache: "no-store", mode: "cors" });
    if (!response.ok) throw new Error(`WebM HTTP ${response.status}`);

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

    refreshMediaManagerUI();
    console.log("[SHARED WEBM 07 REGISTERED]", mediaId);
    console.log("[SHARED WEBM 08 READY]", mediaId);
  } catch (error) {
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

async function createSharedGLBFromAsset(mediaId: string, media: any) {
  if (managedPlacedMedia.has(mediaId) || sharedRemoteMediaIds.has(mediaId)) return;

  const assetRef = String(media.assetRef || "");
  if (!assetRef) {
    console.error("[SHARED GLB 01 RECEIVE] missing assetRef", mediaId);
    return;
  }

  console.log("[SHARED GLB 01 RECEIVE]", mediaId, {
    assetRef,
    x: media.x, y: media.y, z: media.z,
    rotationY: media.rotationY,
    scale: media.scale
  });

  let glbURL: string | null = null;
  let asset: pc.Asset | null = null;

  try {
    // 02-03: fetch the exact GLB bytes first. This path works consistently
    // across desktop Chrome and iOS Safari and gives us a concrete byte check.
    console.log("[SHARED GLB 02 FETCH START]", assetRef);
    const response = await fetch(assetRef, { cache: "no-store", mode: "cors" });
    if (!response.ok) throw new Error(`GLB HTTP ${response.status}`);

    const glbBuffer = await response.arrayBuffer();
    console.log("[SHARED GLB 03 BYTES]", mediaId, glbBuffer.byteLength);
    if (glbBuffer.byteLength < 20) throw new Error("GLB payload is empty/too small.");

    const glbBlob = new Blob([glbBuffer], { type: "model/gltf-binary" });
    glbURL = URL.createObjectURL(glbBlob);

    // 04: use PlayCanvas' proven Container Asset loader, same family of
    // loading used by the local GLB importer.
    asset = new pc.Asset(
      `SharedGLBAsset_${mediaId}`,
      "container",
      { url: glbURL, filename: `${mediaId}.glb` }
    );
    app.assets.add(asset);

    console.log("[SHARED GLB 04 ASSET LOAD START]", mediaId);
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const cleanup = () => {
        asset?.off("load", onLoad);
        asset?.off("error", onError);
      };
      asset!.once("load", onLoad);
      asset!.once("error", onError);
      app.assets.load(asset!);
    });

    const container: any = asset.resource;
    console.log("[SHARED GLB 05 RESOURCE]", mediaId, {
      hasResource: !!container,
      hasRenderFactory: !!container?.instantiateRenderEntity,
      hasModelFactory: !!container?.instantiateModelEntity,
      animations: Array.isArray(container?.animations) ? container.animations.length : 0
    });
    if (!container) throw new Error("PlayCanvas container resource is missing.");

    // Prefer RenderEntity, but retain ModelEntity fallback for older/variant
    // container resources.
    let entity: pc.Entity;
    if (typeof container.instantiateRenderEntity === "function") {
      entity = container.instantiateRenderEntity();
    } else if (typeof container.instantiateModelEntity === "function") {
      entity = container.instantiateModelEntity();
    } else {
      throw new Error("Container has no supported instantiate method.");
    }

    console.log("[SHARED GLB 06 ENTITY]", mediaId, entity.name);

    entity.name = `SharedGLB_${mediaId}`;
    entity.setPosition(Number(media.x), Number(media.y), Number(media.z));
    entity.setEulerAngles(0, Number(media.rotationY), 0);
    const sharedScale = Math.max(0.0001, Number(media.scale) || 1);
    entity.setLocalScale(sharedScale, sharedScale, sharedScale);
    app.root.addChild(entity);

    console.log("[SHARED GLB 07 SCENE ADD]", mediaId, {
      position: entity.getPosition().toString(),
      scale: entity.getLocalScale().toString()
    });

    // 08-10: animation hookup follows the already-proven local GLB pattern:
    // entry.resource ?? entry, internal safe state names, explicit layer.play.
    const animationEntries: any[] = Array.isArray(container.animations)
      ? container.animations
      : [];
    const clipNames = animationEntries.map((entry: any, index: number) =>
      String(entry?.name || entry?.resource?.name || `GLB Animation ${index + 1}`)
    );

    let anim: any = null;
    let activeClipIndex = 0;
    let loopEnabled = true;

    if (animationEntries.length > 0) {
      entity.addComponent("anim", { activate: false });
      anim = entity.anim;

      const states = animationEntries.map((_entry: any, index: number) => ({
        name: `GLB_Animation_${index + 1}`,
        speed: 1,
        loop: loopEnabled
      }));

      anim.loadStateGraph({
        layers: [{
          name: "Base",
          states: [{ name: "START" }, ...states],
          transitions: []
        }],
        parameters: {}
      } as any);

      const layer: any = anim.baseLayer;
      animationEntries.forEach((entry: any, index: number) => {
        layer.assignAnimation(
          `GLB_Animation_${index + 1}`,
          entry?.resource ?? entry
        );
      });

      layer.play("GLB_Animation_1");
      anim.playing = true;
      console.log("[SHARED GLB 08 ANIMATION]", mediaId, clipNames);
    } else {
      console.log("[SHARED GLB 08 ANIMATION] no clips", mediaId);
    }

    const playIndex = (index: number) => {
      if (!anim || animationEntries.length === 0) return;
      activeClipIndex = Math.max(0, Math.min(animationEntries.length - 1, index));
      anim.baseLayer.play(`GLB_Animation_${activeClipIndex + 1}`);
      anim.playing = true;
    };

    const remoteMedia = createMediaObject({
      title: media.title || "Shared GLB",
      type: "glb",
      entity,
      playable: animationEntries.length > 0,
      animated: animationEntries.length > 0,
      playback: animationEntries.length > 0 ? {
        play: () => playIndex(activeClipIndex),
        stop: () => {
          if (anim) anim.playing = false;
        },
        setLoop: (loop: boolean) => {
          loopEnabled = loop;
          // Rebuild is unnecessary for the current single-loop use case;
          // update active state's loop flag when exposed by the runtime.
          const activeState: any = anim?.baseLayer?.activeState;
          if (activeState && typeof activeState === "object") {
            activeState.loop = loopEnabled;
          }
        },
        getClips: () => [...clipNames],
        playClip: (name: string) => {
          const index = clipNames.indexOf(name);
          playIndex(index >= 0 ? index : 0);
        }
      } : undefined,
      behavior: []
    });
    remoteMedia.id = mediaId;
    xrMediaManager.register(remoteMedia);

    managedPlacedMedia.set(mediaId, {
      id: mediaId,
      title: `${media.title || "GLB Artwork"} [SHARED]`,
      kind: "glb",
      entity
    });
    sharedRemoteMediaIds.add(mediaId);

    placedMediaRuntimes.push({
      id: mediaId,
      update: () => {},
      dispose: () => {
        entity.destroy();
        if (asset) {
          asset.unload();
          app.assets.remove(asset);
        }
        if (glbURL) URL.revokeObjectURL(glbURL);
      }
    });

    refreshMediaManagerUI();
    console.log("[SHARED GLB 09 REGISTERED]", mediaId);
    console.log("[SHARED GLB 10 READY]", mediaId, {
      animations: animationEntries.length,
      clips: clipNames
    });
  } catch (error) {
    console.error("[SHARED GLB LOAD ERROR]", mediaId, error);

    // Clean partial resources but leave the rest of the world alive.
    if (asset) {
      try { asset.unload(); } catch {}
      try { app.assets.remove(asset); } catch {}
    }
    if (glbURL) {
      try { URL.revokeObjectURL(glbURL); } catch {}
    }
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

    // Prototype 0.14.2 / Shared Media Receive Fix.
    // Colyseus 0.18: subscribe through the state callback proxy/path.
    const sharedMedia = $(room.state as any).mediaObjects;

    sharedMedia.onAdd((media: any, mediaId: string) => {
      console.log("[SHARED RECEIVE ADD]", mediaId, media);

      // The placing client already owns the real local Sprite.
      if (!managedPlacedMedia.has(mediaId)) {
        const sharedType = String(media.type || "");
        if (sharedType === "sprite") {
          void createSharedSpriteFromAsset(mediaId, media);
        } else if (sharedType === "webm") {
          console.log("[SHARED WEBM DISPATCH]", mediaId, media.assetRef);
          void createSharedWebMFromAsset(mediaId, media);
        } else if (sharedType === "glb") {
          console.log("[SHARED GLB DISPATCH]", mediaId, media.assetRef);
          void createSharedGLBFromAsset(mediaId, media);
        } else {
          console.warn("[SHARED RECEIVE] unsupported media type", sharedType, mediaId);
        }
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
      removeSharedSpritePlaceholder(mediaId);
    });

    console.log("[SHARED RECEIVE LISTENER READY]");

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

  <div id="behaviorEditor" class="behavior-editor">
    <div class="behavior-editor-title">BEHAVIOR</div>
    <div id="behaviorEditorStatus" class="behavior-editor-status">SELECT A MEDIA OBJECT</div>
    <div id="behaviorEditorControls" class="behavior-editor-controls hidden">

    <label class="behavior-row">
      <span>Trigger</span>
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

    <label class="behavior-row">
      <span>Enter Action</span>
      <select id="behaviorEnterAction">
        <option value="play">PLAY</option>
        <option value="stop">STOP</option>
      </select>
    </label>

    <label class="behavior-row">
      <span>Leave Action</span>
      <select id="behaviorLeaveAction">
        <option value="stop">STOP</option>
        <option value="play">PLAY</option>
      </select>
    </label>

    <label class="behavior-enabled-row">
      <span>Enabled</span>
      <input id="behaviorEnabled" type="checkbox" checked>
    </label>

    <div id="behaviorStatus" class="behavior-status">READY</div>
    </div>
  </div>

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
  .behavior-editor {
    margin-top:12px; padding:12px; border:1px solid #343d49; border-radius:12px;
    background:#0d131b;
  }
  .behavior-editor.hidden { display:none; }
  .behavior-row.hidden { display:none; }
  .behavior-editor-status { opacity:.55; font-size:11px; padding:4px 0 2px; }
  .behavior-editor-controls.hidden { display:none; }
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
  .behavior-status {
    margin-top:10px; padding-top:9px; border-top:1px solid #28313d;
    font-size:10px; font-weight:800; letter-spacing:.08em; opacity:.7;
  }
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
const behaviorEnabled = mediaManagerPanel.querySelector<HTMLInputElement>("#behaviorEnabled")!;
const behaviorStatus = mediaManagerPanel.querySelector<HTMLElement>("#behaviorStatus")!;

function getSelectedProximityBehavior() {
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
      enabled: true
    };
    object.behavior = [...(object.behavior ?? []), behavior];
  }
  return behavior;
}

function refreshBehaviorEditorUI() {
  const behavior = getSelectedProximityBehavior();
  const hasSelection = !!selectedManagedMediaId && managedPlacedMedia.has(selectedManagedMediaId);

  behaviorEditor.classList.remove("hidden");
  behaviorEditorStatus.classList.toggle("hidden", hasSelection && !!behavior);
  behaviorEditorControls.classList.toggle("hidden", !hasSelection || !behavior);
  if (!behavior) {
    behaviorEditorStatus.textContent = "SELECT A MEDIA OBJECT";
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

  behaviorEnterAction.value = behavior.enterAction;
  behaviorLeaveAction.value = behavior.leaveAction;
  behaviorEnabled.checked = behavior.enabled;
  behaviorStatus.textContent =
    !behavior.enabled ? "DISABLED" :
    isTouch ? "TAP / CLICK OBJECT" :
    "READY";
}

function applyBehaviorEditorUI() {
  const behavior = getSelectedProximityBehavior();
  if (!behavior) return;

  (behavior as any).trigger = behaviorTrigger.value;
  behavior.distance = Number(behaviorDistance.value);
  (behavior as any).lookAngle = Number(behaviorLookAngle.value);
  (behavior as any).touchMode = behaviorTouchMode.value;
  behavior.enterAction = behaviorEnterAction.value as "play" | "stop";
  behavior.leaveAction = behaviorLeaveAction.value as "play" | "stop";
  behavior.enabled = behaviorEnabled.checked;
  behaviorDistanceValue.textContent = `${behavior.distance.toFixed(1)} m`;
  behaviorLookAngleValue.textContent = `${Number((behavior as any).lookAngle ?? 12).toFixed(0)}°`;

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
behaviorEnterAction.addEventListener("change", applyBehaviorEditorUI);
behaviorLeaveAction.addEventListener("change", applyBehaviorEditorUI);
behaviorEnabled.addEventListener("change", applyBehaviorEditorUI);

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


// =========================================================
// Prototype 0.13 / MULTI TRIGGER BEHAVIOR SYSTEM
// LOOK AT trigger
// =========================================================

const lookAtBehaviorState = new Map<string, boolean>();
const DEFAULT_LOOK_AT_ANGLE_DEG = 12;

function runXRBehaviorAction(object: any, action: string | undefined) {
  if (action === "play") {
    void object.playback?.play();
  } else if (action === "stop") {
    object.playback?.stop();
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
      runXRBehaviorAction(object, isLooking ? behavior.enterAction : behavior.leaveAction);
      continue;
    }

    if (isLooking !== previous) {
      lookAtBehaviorState.set(object.id, isLooking);
      runXRBehaviorAction(object, isLooking ? behavior.enterAction : behavior.leaveAction);
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
    runXRBehaviorAction(object, behavior.enterAction);

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
  runXRBehaviorAction(object, action);

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
  updateLookAtBehaviors();
  initializeTouchBehaviorPlayback();

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
