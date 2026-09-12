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

let cameraYaw = 0;
let cameraPitch = -35;
let cameraDistance = 15;
let cameraDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const avatars = new Map<string, Avatar>();
const keys = new Set<string>();
let currentSessionId = "";
let activeRoom: Room | null = null;
let localPosition = new pc.Vec3();
let lastSend = 0;

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
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    keys.add(e.key.toLowerCase());
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

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
  app.root.addChild(entity);

  const 名前ラベル = 名前ラベルを作成(player.name);

  avatars.set(sessionId, {
    entity,
    target: new pc.Vec3(player.x, player.y, player.z),
    name: player.name,
    名前ラベル,
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
        if (sessionId === currentSessionId) localPosition.set(player.x, player.y, player.z);
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

const yawRad = cameraYaw * pc.math.DEG_TO_RAD;
const pitchRad = cameraPitch * pc.math.DEG_TO_RAD;

const horizontalDistance = Math.cos(pitchRad) * cameraDistance;

const cameraX =
  cameraTarget.x + Math.sin(yawRad) * horizontalDistance;

const cameraY =
  cameraTarget.y - Math.sin(pitchRad) * cameraDistance;

const cameraZ =
  cameraTarget.z + Math.cos(yawRad) * horizontalDistance;

camera.setPosition(cameraX, cameraY, cameraZ);
camera.lookAt(
  cameraTarget.x,
  cameraTarget.y + 0.3,
  cameraTarget.z
);

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

  if (!activeRoom || !currentSessionId) return;
  const me = avatars.get(currentSessionId);
  if (!me) return;

  let x = 0;
  let z = 0;
  if (keys.has("w") || keys.has("arrowup")) z -= 1;
  if (keys.has("s") || keys.has("arrowdown")) z += 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;

  if (x !== 0 || z !== 0) {
    const len = Math.hypot(x, z) || 1;
    localPosition.x = pc.math.clamp(localPosition.x + (x / len) * MOVE_SPEED * dt, -6.5, 6.5);
    localPosition.z = pc.math.clamp(localPosition.z + (z / len) * MOVE_SPEED * dt, -6.5, 6.5);
    me.entity.setPosition(localPosition);

    const now = performance.now();
    if (now - lastSend >= 1000 / SEND_HZ) {
      activeRoom.send("move", { x: localPosition.x, z: localPosition.z });
      lastSend = now;
    }
  }
});
