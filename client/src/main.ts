import "./style.css";
import * as pc from "playcanvas";
import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:2567";

if (window.location.protocol === "https:" && SERVER_URL.startsWith("http://")) {
  console.warn("GitHub Pages is HTTPS. Set VITE_SERVER_URL to an HTTPS Colyseus endpoint so WebSocket can use WSS.");
}
const MOVE_SPEED = 3.2;
const SEND_HZ = 20;

type Avatar = {
  entity: pc.Entity;
  target: pc.Vec3;
  name: string;
  名前ラベル: HTMLDivElement;
  proximityHalo: pc.Entity;
};

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

const center = new pc.Entity("SharedObject");
center.addComponent("render", { type: "cylinder" });
center.setLocalScale(0.8, 0.12, 0.8);
center.setPosition(0, 0.08, 0);
center.render!.material = material([0.75, 0.78, 0.82], 0.4);
app.root.addChild(center);

const light = new pc.Entity("Light");
light.addComponent("light", { type: "directional", intensity: 1.5, castShadows: true });
light.setEulerAngles(45, 35, 0);
app.root.addChild(light);

const camera = new pc.Entity("Camera");
camera.addComponent("camera", { clearColor: new pc.Color(0.035, 0.045, 0.065), farClip: 100 });
camera.setPosition(0, 10, 11);
camera.lookAt(0, 0, 0);
app.root.addChild(camera);

// Prototype 0.7: Reactive Artwork
const artwork = document.createElement("img");
artwork.src = "./artworks/delete.gif";
artwork.alt = "Reactive Artwork";

artwork.style.position = "fixed";
artwork.style.width = "260px";
artwork.style.height = "260px";
artwork.style.objectFit = "contain";
artwork.style.transform = "translate(-50%, -50%)";
artwork.style.pointerEvents = "none";
artwork.style.zIndex = "5";

document.body.appendChild(artwork);

const artworkPosition = new pc.Vec3(4, 1.8, 0);

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

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    cameraDistance += e.deltaY * 0.01;
    cameraDistance = pc.math.clamp(cameraDistance, 5, 30);
  },
  { passive: false }
);
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

viewToggle.addEventListener("click", () => {
  toggleViewMode();
});

function avatarMaterial(sessionId: string) {
  if (sessionId === currentSessionId) return material([0.94, 0.94, 0.96]);
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
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

  // Prototype 0.5: avatar forward marker
const forwardMarker = new pc.Entity(`Forward-${sessionId}`);
forwardMarker.addComponent("render", { type: "box" });
forwardMarker.setLocalScale(0.16, 0.16, 0.42);
forwardMarker.setLocalPosition(0, 0, -0.42);
forwardMarker.render!.material = material([1.0, 0.55, 0.15]);

entity.addChild(forwardMarker);

  // Prototype 0.5: proximity halo
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
    proximityHalo,
  });

  if (sessionId === currentSessionId) localPosition.set(player.x, player.y, player.z);
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

async function enterWorld() {
  enterButton.disabled = true;
  status.textContent = "接続しています…";

  const name = (nameInput.value.trim() || "Guest").slice(0, 16);
  const roomCode = (roomInput.value.trim() || "ART001").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 16);
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
    $(room.state).players.onRemove((_player: any, sessionId: string) => removeAvatar(sessionId));

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

app.on("update", (dt: number) => {

  const cameraTarget =
  currentSessionId && avatars.get(currentSessionId)
    ? avatars.get(currentSessionId)!.entity.getPosition()
    : new pc.Vec3(0, 0, 0);

  const selfAvatar =
  currentSessionId ? avatars.get(currentSessionId) : undefined;

if (selfAvatar) {
  selfAvatar.entity.enabled = !firstPersonMode;
  selfAvatar.名前ラベル.style.display = firstPersonMode ? "none" : "";
}
  
const yawRad = cameraYaw * pc.math.DEG_TO_RAD;
const pitchRad = cameraPitch * pc.math.DEG_TO_RAD;

const horizontalDistance = Math.cos(pitchRad) * cameraDistance;

const cameraX =
  cameraTarget.x + Math.sin(yawRad) * horizontalDistance;

const cameraY =
  cameraTarget.y - Math.sin(pitchRad) * cameraDistance;

const cameraZ =
  cameraTarget.z + Math.cos(yawRad) * horizontalDistance;

if (firstPersonMode) {
  const eyeHeight = 0.55;

  camera.setPosition(
    cameraTarget.x,
    cameraTarget.y + eyeHeight,
    cameraTarget.z
  );

  const lookDistance = 10;

  const lookX =
    cameraTarget.x -
    Math.sin(yawRad) * Math.cos(pitchRad) * lookDistance;

  const lookY =
    cameraTarget.y +
    eyeHeight +
    Math.sin(pitchRad) * lookDistance;

  const lookZ =
    cameraTarget.z -
    Math.cos(yawRad) * Math.cos(pitchRad) * lookDistance;

  camera.lookAt(lookX, lookY, lookZ);
} else {
  camera.setPosition(cameraX, cameraY, cameraZ);

  camera.lookAt(
    cameraTarget.x,
    cameraTarget.y + 0.3,
    cameraTarget.z
  );
}

  const artworkScreenPos =
  camera.camera!.worldToScreen(artworkPosition);

artwork.style.left = `${artworkScreenPos.x}px`;
artwork.style.top = `${artworkScreenPos.y}px`;

  const cameraPos = camera.getPosition();
const artworkDistance = cameraPos.distance(artworkPosition);

const artworkScale =
  pc.math.clamp(8 / artworkDistance, 0.45, 2.0);

artwork.style.transform =
  `translate(-50%, -50%) scale(${artworkScale})`;

  const cameraForward = camera.forward;
const toArtwork = artworkPosition.clone().sub(cameraPos);
const artworkInFront = cameraForward.dot(toArtwork) < 0;

artwork.style.display = artworkInFront ? "block" : "none";
  
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
  const proximity =
    1 - nearestDistance / PROXIMITY_DISTANCE;

  const haloScale = 1.5 + proximity * 1.2;
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08;
    const pulsedScale = haloScale * pulse;
  avatar.proximityHalo.setLocalScale(
  pulsedScale,
  0.025,
  pulsedScale
);
}
} 
  if (!activeRoom || !currentSessionId) return;
  const me = avatars.get(currentSessionId);
  if (!me) return;

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

  // カメラの向きを基準に移動方向を回転
  const yawRad = cameraYaw * pc.math.DEG_TO_RAD;

  const moveX =
    x * Math.cos(yawRad) +
    z * Math.sin(yawRad);

  const moveZ =
    -x * Math.sin(yawRad) +
    z * Math.cos(yawRad);

 const moveAngle =
  Math.atan2(moveX, moveZ) * pc.math.RAD_TO_DEG + 180;
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
