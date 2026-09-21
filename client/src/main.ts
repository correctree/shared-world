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
console.log("[PROTOTYPE 0.20.0 VOICE PRESENCE LOADED]");
let activeXRMediaId: string | null = null;

type Avatar = {
  entity: pc.Entity;
  body:pc.Entity;
  target: pc.Vec3;
  name: string;
  名前ラベル: HTMLDivElement;
  proximityHalo: pc.Entity;
  forwardMarker:pc.Entity;
  styleKey:string;
  textureRef:string;
  textureRequest:number;
  texture:pc.Texture|null;
  textureURL:string|null;
  size:number;
  labelVisible:boolean;
  lastMotionPosition:pc.Vec3;
  motionPhase:number;
  textureRepeat:number;
  textureRotation:number;
  baseScale:pc.Vec3;
  flying:boolean;
  baseBodyY:number;
  partsRoot:pc.Entity;
  partEntities:pc.Entity[];
  partMaterial:pc.StandardMaterial|null;
  partType:string;
  emoteType:"none"|"wave"|"joy"|"spin";
  emoteStartedAt:number;
  haloColor:string;
  haloOpacity:number;
  haloSize:number;
  haloMotion:string;
  haloSpeed:number;
  haloShape:string;
  haloGlow:number;
  haloRings:number;
  haloTexture:pc.Texture|null;
  heartColor:string;
  heartSize:number;
  heartCount:number;
  heartMotion:string;
  heartSpeed:number;
  messageBubble:HTMLDivElement|null;
  messageExpiresAt:number;
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
const avatarControls=document.createElement("div");
avatarControls.id="avatarControls";
avatarControls.innerHTML=`<button type="button" id="avatarSettingsButton">AVATAR</button>
  <div id="avatarSettingsPanel" hidden>
    <strong>AVATAR DESIGN</strong>
    <label>BODY COLOR <input type="color" id="avatarBodyColor" value="#f0f0f5"></label>
    <label>ACCENT COLOR <input type="color" id="avatarAccentColor" value="#ff8c28"></label>
    <label>SHAPE <select id="avatarShape"><option value="sphere">ORB</option><option value="capsule">CAPSULE</option><option value="box">CUBE</option></select></label>
    <label>BODY SIZE <input type="range" id="avatarSize" min="0.5" max="2" step="0.05" value="1"><span id="avatarSizeValue">1</span></label>
    <label>BODY IMAGE (JPG / PNG)<input type="file" id="avatarImageFile" accept="image/jpeg,image/png"></label>
    <div id="avatarImageStatus" style="font-size:11px;color:#b8d8ef;margin:8px 0"></div>
    <label>IMAGE REPEAT <input type="range" id="avatarTextureRepeat" min="0.25" max="8" step="0.25" value="1"><span id="avatarTextureRepeatValue">1</span></label>
    <label>IMAGE ROTATION <input type="range" id="avatarTextureRotation" min="0" max="360" step="1" value="0"><span id="avatarTextureRotationValue">0°</span></label>
    <label>NAME LABEL <input type="checkbox" id="avatarLabelVisible" checked></label>
    <label>NAME COLOR <input type="color" id="avatarLabelColor" value="#ffffff"></label>
    <label>PARTS <select id="avatarPart"><option value="none">NONE</option><option value="arms">ARMS</option><option value="wings">WINGS</option><option value="antenna">ANTENNA</option></select></label>
    <label>PART COLOR <input type="color" id="avatarPartColor" value="#7fd8ff"></label>
    <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.18)"><strong>PROXIMITY CIRCLE</strong></div>
    <label>COLOR <input type="color" id="avatarHaloColor" value="#ff7828"></label>
    <label>OPACITY <input type="range" id="avatarHaloOpacity" min="0.05" max="1" step="0.05" value="0.55"><span id="avatarHaloOpacityValue">0.55</span></label>
    <label>SIZE <input type="range" id="avatarHaloSize" min="0.5" max="4" step="0.1" value="1.5"><span id="avatarHaloSizeValue">1.5</span></label>
    <label>MOTION <select id="avatarHaloMotion"><option value="static">STATIC</option><option value="pulse" selected>PULSE</option><option value="orbit">ORBIT</option><option value="float">FLOAT</option></select></label>
    <label>SPEED <input type="range" id="avatarHaloSpeed" min="0.1" max="4" step="0.1" value="1"><span id="avatarHaloSpeedValue">1</span></label>
    <label>SHAPE <select id="avatarHaloShape"><option value="ring">RING</option><option value="disc">DISC</option><option value="ripple">RIPPLE</option></select></label>
    <label>GLOW <input type="range" id="avatarHaloGlow" min="0" max="2" step="0.1" value="0.6"><span id="avatarHaloGlowValue">0.6</span></label>
    <label>RINGS <input type="range" id="avatarHaloRings" min="1" max="3" step="1" value="1"><span id="avatarHaloRingsValue">1</span></label>
    <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.18)"><strong>RESONANCE HEARTS</strong></div>
    <label>COLOR <input type="color" id="avatarHeartColor" value="#ff5f91"></label>
    <label>SIZE <input type="range" id="avatarHeartSize" min="0.3" max="2.5" step="0.1" value="1"><span id="avatarHeartSizeValue">1</span></label>
    <label>COUNT <input type="range" id="avatarHeartCount" min="1" max="8" step="1" value="3"><span id="avatarHeartCountValue">3</span></label>
    <label>MOTION <select id="avatarHeartMotion"><option value="float">FLOAT</option><option value="orbit">ORBIT</option><option value="burst">BURST</option></select></label>
    <label>SPEED <input type="range" id="avatarHeartSpeed" min="0.2" max="3" step="0.1" value="1"><span id="avatarHeartSpeedValue">1</span></label>
    <button type="button" id="avatarClearImage">REMOVE IMAGE</button>
    <button type="button" id="avatarSaveButton">APPLY AVATAR</button>
  </div>
</div>`;
document.body.appendChild(avatarControls);
const flightControls=document.createElement("div");
flightControls.id="flightControls";
flightControls.innerHTML=`<button type="button" id="jumpButton">JUMP / UP</button>
  <button type="button" id="flyButton">FLY OFF</button>
  <button type="button" id="descendButton">DOWN</button>`;
document.body.appendChild(flightControls);
const emoteControls=document.createElement("div");
emoteControls.id="emoteControls";
emoteControls.innerHTML=`<button type="button" data-emote="wave">WAVE</button><button type="button" data-emote="joy">JOY</button><button type="button" data-emote="spin">SPIN</button>`;
document.body.appendChild(emoteControls);
const communicationControls=document.createElement("div");
communicationControls.id="communicationControls";
communicationControls.innerHTML=`<div id="messageComposer"><input id="avatarMessageInput" maxlength="48" placeholder="MESSAGE / EMOJI"><button type="button" id="sendAvatarMessage">SEND</button></div>
  <div id="quickMessages"><button type="button">👋</button><button type="button">❤️</button><button type="button">✨</button><button type="button">😊</button></div>
  <div id="voiceControls"><button type="button" id="voiceToggle">MIC OFF</button><select id="voiceEffect" aria-label="Voice effect"><option value="normal">NORMAL</option><option value="deep">DEEP</option><option value="bright">BRIGHT</option><option value="echo">ECHO</option></select><span id="voiceStatus">VOICE: OFF</span></div>
  <div id="photoStudio"><button type="button" id="selfieMode">SELFIE</button><button type="button" id="groupPhotoMode">GROUP</button>
  <select id="photoTimer" aria-label="Photo timer"><option value="0">TIMER OFF</option><option value="3">3 SEC</option><option value="5">5 SEC</option><option value="10">10 SEC</option></select>
  <button type="button" id="takeWorldPhoto">PHOTO</button></div>`;
document.body.appendChild(communicationControls);
const photoCountdown=document.createElement("div");photoCountdown.id="photoCountdown";photoCountdown.hidden=true;document.body.appendChild(photoCountdown);
const mobileActionDock=document.createElement("div");mobileActionDock.id="mobileActionDock";
mobileActionDock.innerHTML=`<button type="button" data-mobile-panel="tools">TOOLS</button><button type="button" data-mobile-panel="move">MOVE</button><button type="button" data-mobile-panel="emote">EMOTE</button><button type="button" data-mobile-panel="chat">CHAT</button><button type="button" data-mobile-panel="photo">PHOTO</button>`;
document.body.appendChild(mobileActionDock);
const avatarStyleSheet=document.createElement("style");
avatarStyleSheet.textContent=`
  #avatarControls {position:fixed;top:125px;left:22px;z-index:35;display:none;width:190px}
  #avatarControls button,#flightControls button,#emoteControls button,#communicationControls button {margin:0;padding:10px 12px;width:auto;border:1px solid #9fb3c6;background:rgba(9,15,24,.9);color:#fff;border-radius:10px;font-size:11px}
  #avatarSettingsPanel {margin-top:8px;padding:12px;max-height:60vh;overflow:auto;background:rgba(9,15,24,.96);border:1px solid #7191ae;border-radius:12px}
  #avatarSettingsPanel[hidden] {display:none}
  #avatarSettingsPanel label {font-size:11px;margin:10px 0}
  #avatarSettingsPanel input,#avatarSettingsPanel select {width:100%;margin:4px 0;padding:5px;background:#172433;color:white;border:1px solid #7191ae;border-radius:6px}
  #avatarSettingsPanel input[type=color] {height:38px;padding:3px}
  #avatarSettingsPanel button {width:100%;margin-top:8px}
  #flightControls {position:fixed;right:106px;bottom:35px;z-index:35;display:none;gap:5px;align-items:center}
  #flightControls button {touch-action:none;white-space:nowrap;min-height:45px}
  #emoteControls {position:fixed;right:22px;bottom:92px;z-index:35;display:none;gap:5px}
  #emoteControls.room-active {display:flex}
  #communicationControls {position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:36;display:none;gap:6px;align-items:center}
  #communicationControls.room-active {display:flex}
  #messageComposer {display:flex;gap:4px}
  #avatarMessageInput {width:180px;padding:9px;border:1px solid #7191ae;border-radius:9px;background:rgba(9,15,24,.94);color:#fff}
  #quickMessages {display:flex;gap:3px} #quickMessages button {padding:8px}
  #voiceControls {display:flex;gap:4px;align-items:center} #voiceControls select {padding:9px 6px;border:1px solid #7191ae;border-radius:9px;background:rgba(9,15,24,.94);color:#fff;font-size:11px} #voiceStatus {font-size:9px;color:#9fb3c6;white-space:nowrap}
  #photoStudio {display:flex;gap:4px;align-items:center} #photoStudio select {padding:9px 6px;border:1px solid #7191ae;border-radius:9px;background:rgba(9,15,24,.94);color:#fff;font-size:11px}
  #photoStudio button.active {border-color:#52d7ff;color:#52d7ff;box-shadow:0 0 12px rgba(82,215,255,.35)}
  #photoCountdown {position:fixed;inset:0;z-index:80;display:grid;place-items:center;pointer-events:none;color:#fff;font:900 clamp(72px,18vw,190px)/1 Arial,sans-serif;text-shadow:0 4px 28px rgba(0,0,0,.7)}
  #photoCountdown[hidden] {display:none}
  #mobileActionDock {display:none}
  @media (pointer:coarse) {#flightControls.room-active {display:flex} #avatarControls {top:140px}}
  @media (max-width:640px), (pointer:coarse) {
    body.mobile-compact #mobileActionDock.room-active {display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-rows:38px;position:fixed;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:70;gap:4px;padding:5px;box-sizing:border-box;border:1px solid rgba(120,160,195,.55);border-radius:12px;background:rgba(7,13,21,.9);backdrop-filter:blur(12px)}
    body.mobile-compact #mobileActionDock button {min-width:0!important;width:auto!important;height:38px!important;min-height:38px!important;max-height:38px!important;margin:0!important;padding:0 2px!important;line-height:36px!important;border:1px solid #7893aa;border-radius:8px;background:#0b1420;color:#fff;font-size:9px!important;font-weight:900;letter-spacing:.03em;box-sizing:border-box}
    #mobileActionDock button.active {border-color:#52d7ff;color:#52d7ff;background:#102638}
    body.mobile-compact #flightControls.room-active,body.mobile-compact #emoteControls.room-active,body.mobile-compact #communicationControls.room-active {display:none!important}
    body.mobile-compact.mobile-panel-move #flightControls.room-active {display:flex!important;right:10px;bottom:max(66px,calc(env(safe-area-inset-bottom) + 64px));gap:4px}
    body.mobile-compact.mobile-panel-emote #emoteControls.room-active {display:flex!important;right:10px;bottom:max(66px,calc(env(safe-area-inset-bottom) + 64px));gap:4px}
    body.mobile-compact.mobile-panel-chat #communicationControls.room-active,body.mobile-compact.mobile-panel-photo #communicationControls.room-active {display:flex!important;left:10px;right:10px;bottom:max(62px,calc(env(safe-area-inset-bottom) + 58px));transform:none;flex-wrap:wrap;width:auto;padding:6px;box-sizing:border-box;border:1px solid rgba(120,160,195,.55);border-radius:11px;background:rgba(7,13,21,.92);backdrop-filter:blur(12px)}
    body.mobile-compact.mobile-panel-chat #photoStudio {display:none!important}
    body.mobile-compact.mobile-panel-photo #messageComposer,body.mobile-compact.mobile-panel-photo #quickMessages,body.mobile-compact.mobile-panel-photo #voiceControls {display:none!important}
    body.mobile-compact #avatarControls,body.mobile-compact #addArtworkButton,body.mobile-compact #mediaManagerButton,body.mobile-compact #sharedStateDiagnosticPanel {display:none!important}
    body.mobile-compact.mobile-tools-open #avatarControls {display:block!important;left:10px;top:125px;width:165px}
    body.mobile-compact.mobile-tools-open #addArtworkButton {display:block!important}
    body.mobile-compact.mobile-tools-open #mediaManagerButton {display:block!important}
    body.mobile-compact.mobile-tools-open #sharedStateDiagnosticPanel {display:block!important;bottom:max(66px,calc(env(safe-area-inset-bottom) + 64px));max-width:calc(100vw - 20px)}
    body.mobile-compact .controls {display:none!important}
    body.mobile-compact #viewToggle {position:fixed!important;top:max(112px,calc(env(safe-area-inset-top) + 72px))!important;right:10px!important;bottom:auto!important;left:auto!important;width:54px!important;height:40px!important;min-height:40px!important;padding:0!important;font-size:10px!important;border-radius:10px!important}
    body.mobile-compact.mobile-panel-chat #joystick,body.mobile-compact.mobile-panel-photo #joystick {bottom:max(155px,calc(env(safe-area-inset-bottom) + 150px))!important}
    body.mobile-compact #flightControls button,body.mobile-compact #emoteControls button {font-size:10px;padding:9px 8px;min-height:40px}
    body.mobile-compact #avatarMessageInput {width:min(44vw,180px)}
    body.mobile-compact #voiceControls {width:100%;justify-content:center} body.mobile-compact #voiceControls button,body.mobile-compact #voiceControls select {height:34px!important;min-height:34px!important;padding:0 7px!important;font-size:9px!important}
    body.mobile-compact #photoStudio {display:flex;width:100%;justify-content:center;flex-wrap:wrap}
    body.mobile-compact #photoStudio button,body.mobile-compact #photoStudio select {height:36px!important;min-height:36px!important;margin:0!important;font-size:9px!important;padding:0 7px!important;box-sizing:border-box}
  }
`;
document.head.appendChild(avatarStyleSheet);
const compactMobileQuery=window.matchMedia("(max-width: 640px), (pointer: coarse)");
let activeMobilePanel="";
const mobilePanelNames=["move","emote","chat","photo"];
function refreshCompactMobileMode() {
  document.body.classList.toggle("mobile-compact",compactMobileQuery.matches);
  if(!compactMobileQuery.matches) {
    document.body.classList.remove("mobile-tools-open",...mobilePanelNames.map(name=>`mobile-panel-${name}`));
    activeMobilePanel="";
  }
}
compactMobileQuery.addEventListener?.("change",refreshCompactMobileMode);refreshCompactMobileMode();
mobileActionDock.addEventListener("click",event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-mobile-panel]");
  if(!button)return;
  const requested=String(button.dataset.mobilePanel||"");
  const next=activeMobilePanel===requested?"":requested;activeMobilePanel=next;
  document.body.classList.toggle("mobile-tools-open",next==="tools");
  for(const name of mobilePanelNames)document.body.classList.toggle(`mobile-panel-${name}`,next===name);
  for(const item of mobileActionDock.querySelectorAll<HTMLButtonElement>("button"))
    item.classList.toggle("active",item.dataset.mobilePanel===next);
});

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
<label style="display:grid;grid-template-columns:80px 1fr;gap:8px;margin:8px 0">Distance <input id="audioDistance" type="range" min="2" max="30" step="1" value="12"></label>
<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.15);font-size:10px;font-weight:800;letter-spacing:.1em;opacity:.75">AUDIO REACTIVE</div>
<label style="display:grid;grid-template-columns:80px 1fr;gap:8px;margin:8px 0">Action <select id="audioReactiveAction"><option value="off">OFF</option><option value="scale">SCALE</option><option value="shake">SHAKE</option><option value="rotate">ROTATE</option></select></label>
<label style="display:grid;grid-template-columns:80px 1fr;gap:8px;margin:8px 0">Strength <input id="audioReactiveStrength" type="range" min="0.1" max="3" step="0.1" value="1"></label>
<label style="display:grid;grid-template-columns:80px 1fr;gap:8px;margin:8px 0">Smoothing <input id="audioReactiveSmoothing" type="range" min="0" max="0.95" step="0.05" value="0.7"></label>`;
addArtworkPanel?.appendChild(audioSettingsPanel);
const audioVolume = audioSettingsPanel.querySelector<HTMLInputElement>("#audioVolume")!;
const audioLoop = audioSettingsPanel.querySelector<HTMLInputElement>("#audioLoop")!;
const audioSpatial = audioSettingsPanel.querySelector<HTMLInputElement>("#audioSpatial")!;
const audioSpatialState = audioSettingsPanel.querySelector<HTMLElement>("#audioSpatialState")!;
const audioDistance = audioSettingsPanel.querySelector<HTMLInputElement>("#audioDistance")!;
const audioReactiveAction = audioSettingsPanel.querySelector<HTMLSelectElement>("#audioReactiveAction")!;
const audioReactiveStrength = audioSettingsPanel.querySelector<HTMLInputElement>("#audioReactiveStrength")!;
const audioReactiveSmoothing = audioSettingsPanel.querySelector<HTMLInputElement>("#audioReactiveSmoothing")!;
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
  graphicsDeviceOptions: { alpha: false, antialias: true, preserveDrawingBuffer: true }
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
const floorMaterial = material([0.15, 0.17, 0.2]);
floor.render!.material = floorMaterial;
app.root.addChild(floor);

const gridMaterial = material([0.28, 0.3, 0.34]);
const gridEntities: pc.Entity[] = [];
for (let i = -7; i <= 7; i++) {
  const lineX = new pc.Entity(`grid-x-${i}`);
  lineX.addComponent("render", { type: "box" });
  lineX.setLocalScale(15, 0.012, 0.012);
  lineX.setPosition(0, 0.01, i);
  lineX.render!.material = gridMaterial;
  app.root.addChild(lineX);
  gridEntities.push(lineX);

  const lineZ = new pc.Entity(`grid-z-${i}`);
  lineZ.addComponent("render", { type: "box" });
  lineZ.setLocalScale(0.012, 0.012, 15);
  lineZ.setPosition(i, 0.01, 0);
  lineZ.render!.material = gridMaterial;
  app.root.addChild(lineZ);
  gridEntities.push(lineZ);
}

// Legacy SharedObject removed in Prototype 0.11 / Stage 3.1

const light = new pc.Entity("Light");
light.addComponent("light", { type: "directional", intensity: 1.5, castShadows: true });
light.setEulerAngles(45, 35, 0);
app.root.addChild(light);

const camera = new pc.Entity("Camera");
camera.addComponent("camera", { clearColor: new pc.Color(0.035, 0.045, 0.065), farClip: 400 });
camera.setPosition(0, 10, 11);
camera.lookAt(0, 0, 0);
app.root.addChild(camera);

// 0.18 / Shared environment scene primitives.
type WorldEnvironment = {
  sky:string;ground:string;grid:string;gridVisible:boolean;
  ambient:number;sunlight:number;lightColor:string;sunAngle:number;
  skyMode:"color"|"panorama";skyAssetRef:string;
  groundMode:"plain"|"soil"|"water"|"custom";groundSize:number;groundAssetRef:string;
  particles:"off"|"spark"|"smoke"|"custom";particleCount:number;
  particleDuration:number;particleRadius:number;particleSpeed:number;
  particleSize:number;particleColor:string;particleAssetRef:string;
  environmentPreset:"custom"|"morning"|"day"|"sunset"|"night";
  cycleEnabled:boolean;cycleMinutes:number;cycleStartedAt:number;
  fogEnabled:boolean;fogColor:string;fogDensity:number;fogDistance:number;
  groundRepeat:number;groundRotation:number
};
const defaultWorldEnvironment:WorldEnvironment = {
  sky:"#090c11",ground:"#262b33",grid:"#474d57",gridVisible:true,
  ambient:0.45,sunlight:1.5,lightColor:"#ffffff",sunAngle:45,
  skyMode:"color",skyAssetRef:"",groundMode:"plain",groundSize:15,
  groundAssetRef:"",particles:"off",particleCount:16,
  particleDuration:0,particleRadius:5,particleSpeed:1,particleSize:1,
  particleColor:"#ffbb55",particleAssetRef:"",
  environmentPreset:"custom",cycleEnabled:false,cycleMinutes:8,cycleStartedAt:0,
  fogEnabled:false,fogColor:"#b8cbd9",fogDensity:.75,fogDistance:12,
  groundRepeat:1,groundRotation:0
};
let currentWorldEnvironment:WorldEnvironment={...defaultWorldEnvironment};
let panoramaEntity:pc.Entity|null=null;
let panoramaTexture:pc.Texture|null=null;
let panoramaObjectURL:string|null=null;
let panoramaRequest=0;
let soilTexture:pc.Texture|null=null;
let waterTexture:pc.Texture|null=null;
let waterCanvas:HTMLCanvasElement|null=null;
let waterFrame=0;
let customGroundTexture:pc.Texture|null=null;
let customGroundObjectURL:string|null=null;
let customGroundRequest=0;
let currentCustomGroundRef="";
async function setCustomGround(ref:string) {
  if(ref===currentCustomGroundRef && customGroundTexture) return;
  const request=++customGroundRequest;
  currentCustomGroundRef=ref;
  if(floorMaterial.diffuseMap===customGroundTexture) {
    floorMaterial.diffuseMap=null;floorMaterial.update();
  }
  if(customGroundTexture) {customGroundTexture.destroy();customGroundTexture=null;}
  if(customGroundObjectURL) {URL.revokeObjectURL(customGroundObjectURL);customGroundObjectURL=null;}
  if(!ref) return;
  try {
    const response=await fetch(ref,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive=await JSZip.loadAsync(await response.blob());
    const entry=archive.file("ground.jpg");
    if(!entry) throw new Error("ground.jpg missing");
    const blob=await entry.async("blob");
    if(!blob.size || blob.size>8*1024*1024) throw new Error("Ground image too large");
    const url=URL.createObjectURL(blob);
    const image=new Image();image.src=url;await image.decode();
    if(request!==customGroundRequest) {URL.revokeObjectURL(url);return;}
    const texture=new pc.Texture(app.graphicsDevice,{mipmaps:true});
    texture.addressU=pc.ADDRESS_REPEAT;texture.addressV=pc.ADDRESS_REPEAT;
    texture.setSource(image);
    customGroundTexture=texture;customGroundObjectURL=url;
    if(currentWorldEnvironment.groundMode==="custom") {
      floorMaterial.diffuseMap=texture;floorMaterial.update();
    }
  } catch(error) {console.warn("[CUSTOM GROUND LOAD FAILED]",error);}
}

function proceduralCanvas(mode:"soil"|"water",time=0) {
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext("2d")!;
  const image=ctx.createImageData(256,256);
  for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
    const i=(y*256+x)*4;
    const noise=(Math.sin(x*12.9898+y*78.233)*43758.5453)%1;
    if(mode==="soil") {
      const n=Math.abs(noise);
      image.data[i]=68+n*38;image.data[i+1]=48+n*30;image.data[i+2]=29+n*19;
    } else {
      const wave=Math.sin(x*.11+time*2+Math.sin(y*.06-time)*2)*.5+
        Math.sin(y*.14-time*1.5+x*.045)*.5;
      const v=wave*20+Math.abs(noise)*10;
      image.data[i]=18+v*.35;image.data[i+1]=76+v;image.data[i+2]=102+v*1.5;
    }
    image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  return canvas;
}
function groundTexture(canvas:HTMLCanvasElement):pc.Texture {
  const texture=new pc.Texture(app.graphicsDevice,{mipmaps:true});
  texture.addressU=pc.ADDRESS_REPEAT; texture.addressV=pc.ADDRESS_REPEAT;
  texture.setSource(canvas);
  return texture;
}
function setGroundStyle(mode:WorldEnvironment["groundMode"]) {
  if(mode==="plain" || mode==="custom") floorMaterial.diffuseMap=mode==="custom"?customGroundTexture:null;
  if(mode==="soil") {
    if(!soilTexture) soilTexture=groundTexture(proceduralCanvas("soil"));
    floorMaterial.diffuseMap=soilTexture;
  }
  if(mode==="water") {
    if(!waterCanvas) waterCanvas=proceduralCanvas("water");
    if(!waterTexture) waterTexture=groundTexture(waterCanvas);
    floorMaterial.diffuseMap=waterTexture;
  }
  floorMaterial.update();
}
async function setPanorama(ref:string) {
  const request=++panoramaRequest;
  if(panoramaEntity) {panoramaEntity.destroy();panoramaEntity=null;}
  if(panoramaTexture) {panoramaTexture.destroy();panoramaTexture=null;}
  if(panoramaObjectURL) {URL.revokeObjectURL(panoramaObjectURL);panoramaObjectURL=null;}
  if(!ref) return;
  try {
    const response=await fetch(ref,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive=await JSZip.loadAsync(await response.blob());
    const file=archive.file("panorama.jpg");
    if(!file) throw new Error("panorama.jpg missing");
    const blob=await file.async("blob");
    if(blob.size>8*1024*1024) throw new Error("Panorama too large");
    const url=URL.createObjectURL(blob);
    const img=new Image();img.src=url;await img.decode();
    if(request!==panoramaRequest) {URL.revokeObjectURL(url);return;}
    const texture=new pc.Texture(app.graphicsDevice,{mipmaps:true});
    texture.setSource(img);
    const skyMaterial=new pc.StandardMaterial();
    skyMaterial.emissive=new pc.Color(1,1,1);
    skyMaterial.emissiveMap=texture;
    skyMaterial.useLighting=false;
    skyMaterial.cull=pc.CULLFACE_FRONT;
    skyMaterial.update();
    const sphere=new pc.Entity("PanoramaSky");sphere.addComponent("render",{type:"sphere"});
    sphere.setLocalScale(650,650,650);
    sphere.render!.material=skyMaterial;
    sphere.render!.castShadows=false;
    app.root.addChild(sphere);
    panoramaEntity=sphere;panoramaTexture=texture;panoramaObjectURL=url;
  } catch(error) {console.warn("[PANORAMA LOAD FAILED]",error);}
}
const ambientParticles:pc.Entity[]=[];
const particleMaterials=new Map<string,pc.StandardMaterial>();
let activeParticleMode="off";
let activeParticleCount=0;
let particleTime=0;
let customParticleTexture:pc.Texture|null=null;
let customParticleURL:string|null=null;
let customParticleRef="";
let customParticleRequest=0;
async function setCustomParticle(ref:string) {
  if(ref===customParticleRef && customParticleTexture) return;
  const request=++customParticleRequest;
  customParticleRef=ref;
  const material=particleMaterials.get("custom");
  if(material) {material.diffuseMap=null;material.opacityMap=null;material.update();}
  if(customParticleTexture) {customParticleTexture.destroy();customParticleTexture=null;}
  if(customParticleURL) {URL.revokeObjectURL(customParticleURL);customParticleURL=null;}
  if(!ref) return;
  try {
    const response=await fetch(ref,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive=await JSZip.loadAsync(await response.blob());
    const file=archive.file("particle.png");
    if(!file) throw new Error("particle.png missing");
    const blob=await file.async("blob");
    if(!blob.size || blob.size>1024*1024) throw new Error("Particle image too large");
    const url=URL.createObjectURL(blob);
    const image=new Image();image.src=url;
    try {await image.decode();}
    catch(error) {URL.revokeObjectURL(url);throw error;}
    if(request!==customParticleRequest) {URL.revokeObjectURL(url);return;}
    customParticleTexture=new pc.Texture(app.graphicsDevice,{mipmaps:true});
    customParticleTexture.setSource(image);customParticleURL=url;
    particleMaterials.delete("custom");
    if(currentWorldEnvironment.particles==="custom") {
      activeParticleMode="loading";
      setAmbientParticles("custom",currentWorldEnvironment.particleCount);
    }
  } catch(error) {console.warn("[CUSTOM PARTICLE LOAD FAILED]",error);}
}
function particleMaterial(mode:"spark"|"smoke"|"custom") {
  const existing=particleMaterials.get(mode);
  if(existing && mode==="smoke") return existing;
  if(existing) existing.destroy();
  const mat=new pc.StandardMaterial();
  const tint=mode!=="smoke"?colorFromHex(currentWorldEnvironment.particleColor):null;
  // Emissive is the only color source for sparks. Diffuse light otherwise
  // adds to emissive and washes bright colors toward white.
  mat.diffuse=mode==="spark"?new pc.Color(0,0,0):
    (tint || new pc.Color(.7,.76,.82));
  mat.emissive=tint || new pc.Color(.3,.34,.38);
  mat.opacity=mode==="smoke"?.42:1;
  if(mode==="custom" && customParticleTexture) {
    mat.diffuseMap=customParticleTexture;
    mat.emissiveMap=customParticleTexture;
    mat.opacityMap=customParticleTexture;mat.opacityMapChannel="a";
  }
  if(mode!=="spark") {mat.blendType=pc.BLEND_NORMAL;mat.depthWrite=false;}
  mat.useLighting=false;mat.update();
  particleMaterials.set(mode,mat);
  return mat;
}
function setAmbientParticles(mode:WorldEnvironment["particles"],count:number) {
  if(mode===activeParticleMode && count===activeParticleCount) return;
  for(const entity of ambientParticles) entity.destroy();
  ambientParticles.length=0;activeParticleMode=mode;activeParticleCount=count;
  if(mode==="off") return;
  const mat=particleMaterial(mode);
  for(let i=0;i<count;i++) {
    const entity=new pc.Entity(`Ambient-${mode}-${i}`);
    entity.addComponent("render",{type:"sphere"});
    entity.render!.material=mat;entity.render!.castShadows=false;
    const base=mode==="smoke"?1.2+(i%3)*.35:.14+(i%3)*.055;
    const size=base*currentWorldEnvironment.particleSize;
    entity.setLocalScale(size,size,size);
    app.root.addChild(entity);ambientParticles.push(entity);
  }
}
app.on("update",(dt:number)=>{
  if(!ambientParticles.length) return;
  particleTime+=Math.min(.05,dt);
  const radius=currentWorldEnvironment.particleRadius;
  const center=activeRoom?localPosition:new pc.Vec3(0,0,0);
  for(let i=0;i<ambientParticles.length;i++) {
    const entity=ambientParticles[i];
    const a=i*2.39996;
    const distance=radius*(.35+(i%9)/13);
    const x=center.x+Math.sin(a)*distance;
    const z=center.z+Math.cos(a)*distance;
    const rise=(particleTime*(activeParticleMode==="smoke"?.3:.8)*
      currentWorldEnvironment.particleSpeed+i*.37)%4;
    entity.setPosition(x,.6+rise,z);
  }
});
app.on("update",(dt:number)=>{
  if(currentWorldEnvironment.groundMode!=="water" || !waterTexture) return;
  waterFrame+=dt;
  if(waterFrame<.12) return;
  waterFrame=0;
  waterTexture.setSource(proceduralCanvas("water",performance.now()*.001));
});
function colorFromHex(hex:string):pc.Color {
  const value=parseInt(hex.slice(1),16);
  return new pc.Color(((value>>16)&255)/255,((value>>8)&255)/255,(value&255)/255);
}
const timePresets={
  morning:{sky:"#739ab8",ambient:.6,sunlight:1.5,lightColor:"#ffd9a3",sunAngle:20},
  day:{sky:"#75b5e6",ambient:.9,sunlight:2.5,lightColor:"#ffffff",sunAngle:65},
  sunset:{sky:"#b56b78",ambient:.5,sunlight:1.1,lightColor:"#ffae72",sunAngle:12},
  night:{sky:"#090c22",ambient:.25,sunlight:.15,lightColor:"#9ab8ff",sunAngle:15}
} as const;
let environmentFrame=0;
function renderTimeEnvironment() {
  const environment=currentWorldEnvironment;
  let sky=colorFromHex(environment.sky);
  let lightColor=colorFromHex(environment.lightColor);
  let ambient=environment.ambient;
  let sunlight=environment.sunlight;
  let sunAngle=environment.sunAngle;
  if(environment.cycleEnabled) {
    const cycleMs=environment.cycleMinutes*60000;
    const elapsed=((Date.now()-environment.cycleStartedAt)%cycleMs+cycleMs)%cycleMs;
    const position=elapsed/cycleMs*4;
    const stops=[timePresets.morning,timePresets.day,timePresets.sunset,timePresets.night];
    const first=stops[Math.floor(position)%4];
    const second=stops[(Math.floor(position)+1)%4];
    const t=position%1;
    sky=new pc.Color().lerp(colorFromHex(first.sky),colorFromHex(second.sky),t);
    lightColor=new pc.Color().lerp(
      colorFromHex(first.lightColor),colorFromHex(second.lightColor),t);
    ambient=first.ambient+(second.ambient-first.ambient)*t;
    sunlight=first.sunlight+(second.sunlight-first.sunlight)*t;
    sunAngle=first.sunAngle+(second.sunAngle-first.sunAngle)*t;
  }
  camera.camera!.clearColor=sky;
  app.scene.ambientLight=new pc.Color(ambient,ambient,ambient);
  light.light!.intensity=sunlight;
  light.light!.color=lightColor;
  light.setEulerAngles(sunAngle,35,0);
}
app.on("update",(dt:number)=>{
  if(!currentWorldEnvironment.cycleEnabled) return;
  environmentFrame+=dt;
  if(environmentFrame<.15) return;
  environmentFrame=0;
  renderTimeEnvironment();
});
function applyWorldEnvironment(payload:any) {
  if (!payload || typeof payload!=="object") return;
  const color=(v:any,fallback:string)=>typeof v==="string" && /^#[0-9a-fA-F]{6}$/.test(v)?v:fallback;
  const number=(v:any,fallback:number,min:number,max:number)=>{
    const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
  };
  currentWorldEnvironment={
    sky:color(payload.sky,defaultWorldEnvironment.sky),
    ground:color(payload.ground,defaultWorldEnvironment.ground),
    grid:color(payload.grid,defaultWorldEnvironment.grid),
    gridVisible:payload.gridVisible!==false,
    ambient:number(payload.ambient,0.45,0,1.5),
    sunlight:number(payload.sunlight,1.5,0,5),
    lightColor:color(payload.lightColor,"#ffffff"),
    sunAngle:number(payload.sunAngle,45,5,85),
    skyMode:payload.skyMode==="panorama"?"panorama":"color",
    skyAssetRef:typeof payload.skyAssetRef==="string"?payload.skyAssetRef:"",
    groundMode:["plain","soil","water","custom"].includes(payload.groundMode)?payload.groundMode:"plain",
    groundSize:[15,60,160].includes(Number(payload.groundSize))?Number(payload.groundSize):15,
    groundAssetRef:typeof payload.groundAssetRef==="string"?payload.groundAssetRef:"",
    particles:["off","spark","smoke","custom"].includes(payload.particles)?payload.particles:"off",
    particleCount:Math.round(number(payload.particleCount,16,1,64)),
    particleDuration:number(payload.particleDuration,0,0,300),
    particleRadius:number(payload.particleRadius,5,1,20),
    particleSpeed:number(payload.particleSpeed,1,.1,4),
    particleSize:number(payload.particleSize,1,.2,4),
    particleColor:color(payload.particleColor,"#ffbb55"),
    particleAssetRef:typeof payload.particleAssetRef==="string"?payload.particleAssetRef:"",
    environmentPreset:["custom","morning","day","sunset","night"].includes(payload.environmentPreset)
      ?payload.environmentPreset:"custom",
    cycleEnabled:payload.cycleEnabled===true,
    cycleMinutes:number(payload.cycleMinutes,8,1,60),
    cycleStartedAt:number(payload.cycleStartedAt,0,0,Date.now()+60000),
    fogEnabled:payload.fogEnabled===true,
    fogColor:color(payload.fogColor,"#b8cbd9"),
    fogDensity:number(payload.fogDensity,.75,.05,1),
    fogDistance:number(payload.fogDistance,12,3,200),
    groundRepeat:number(payload.groundRepeat,1,.2,10),
    groundRotation:number(payload.groundRotation,0,0,360)
  };
  renderTimeEnvironment();
  app.scene.fog.type=currentWorldEnvironment.fogEnabled?pc.FOG_LINEAR:pc.FOG_NONE;
  app.scene.fog.color=colorFromHex(currentWorldEnvironment.fogColor);
  app.scene.fog.end=currentWorldEnvironment.fogDistance;
  app.scene.fog.start=currentWorldEnvironment.fogDistance*(1-.95*currentWorldEnvironment.fogDensity);
  floorMaterial.diffuse=currentWorldEnvironment.groundMode==="plain"
    ? colorFromHex(currentWorldEnvironment.ground) : new pc.Color(1,1,1);
  setGroundStyle(currentWorldEnvironment.groundMode);
  void setCustomGround(currentWorldEnvironment.groundMode==="custom"?currentWorldEnvironment.groundAssetRef:"");
  activeParticleMode="loading";
  setAmbientParticles(currentWorldEnvironment.particles,currentWorldEnvironment.particleCount);
  void setCustomParticle(currentWorldEnvironment.particles==="custom"?currentWorldEnvironment.particleAssetRef:"");
  void setPanorama(currentWorldEnvironment.skyMode==="panorama" &&
    !currentWorldEnvironment.cycleEnabled?currentWorldEnvironment.skyAssetRef:"");
  gridMaterial.diffuse=colorFromHex(currentWorldEnvironment.grid);gridMaterial.update();
  const size=currentWorldEnvironment.groundSize;
  const limit=Math.max(6.5,size/2-1);
  if (activeRoom && currentSessionId) {
    localPosition.x=Math.max(-limit,Math.min(limit,localPosition.x));
    localPosition.z=Math.max(-limit,Math.min(limit,localPosition.z));
    avatars.get(currentSessionId)?.entity.setPosition(localPosition);
  }
  floor.setLocalScale(size,0.15,size);
  gridEntities.forEach((entity,index)=>{
    const i=Math.floor(index/2)-7;
    if(index%2===0) {entity.setLocalScale(size,.012,.012);entity.setPosition(0,.01,i*size/15);}
    else {entity.setLocalScale(.012,.012,size);entity.setPosition(i*size/15,.01,0);}
    entity.enabled=currentWorldEnvironment.gridVisible;
  });
  const repeats=size/15*currentWorldEnvironment.groundRepeat;
  floorMaterial.diffuseMapTiling=new pc.Vec2(repeats,repeats);
  floorMaterial.diffuseMapRotation=currentWorldEnvironment.groundRotation;
  floorMaterial.update();
  refreshEnvironmentEditor();
}

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
type PhotoCameraMode="normal"|"selfie"|"group";
let photoCameraMode:PhotoCameraMode="normal";

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
type ResonancePairEffect = {
  key:string;
  a:string;
  b:string;
  root:pc.Entity;
  link:pc.Entity;
  hearts:pc.Entity[];
  flightRing:pc.Entity;
  material:pc.StandardMaterial;
  ringMaterial:pc.StandardMaterial;
  ringTexture:pc.Texture;
  enteredAt:number;
  heartMotion:string;
  heartSpeed:number;
  heartSize:number;
};
const resonancePairs=new Map<string,ResonancePairEffect>();
let resonanceAudioContext:AudioContext|null=null;
function unlockResonanceAudio() {
  const AudioContextClass=window.AudioContext || (window as any).webkitAudioContext;
  if(!AudioContextClass) return;
  if(!resonanceAudioContext) resonanceAudioContext=new AudioContextClass();
  void resonanceAudioContext.resume().catch(()=>{});
}
function playResonanceTone(colorA:string,colorB:string) {
  const context=resonanceAudioContext;
  if(!context || context.state!=="running") return;
  const colorNumber=(Number.parseInt(colorA.slice(1),16)^Number.parseInt(colorB.slice(1),16))>>>0;
  const base=220+(colorNumber%180);
  const variant=Math.floor(Math.random()*3);
  const now=context.currentTime;
  const gain=context.createGain();
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(variant===1?.055:.075,now+.025);
  gain.gain.exponentialRampToValueAtTime(.0001,now+(variant===1?.9:.62));
  gain.connect(context.destination);
  const patterns=[[[1,0],[1.5,.08]],[[1,0],[2,.06],[3,.12]],[[1,0],[1.25,.12],[1.75,.24]]];
  for(const [ratio,offset] of patterns[variant]) {
    const oscillator=context.createOscillator();
    oscillator.type=variant===0?"sine":variant===1?"triangle":"sine";
    oscillator.frequency.value=base*ratio;
    oscillator.connect(gain);oscillator.start(now+offset);oscillator.stop(now+(variant===1?.92:.68));
  }
}
function blendedHaloColor(a:Avatar,b:Avatar) {
  const first=colorFromHex(a.haloColor),second=colorFromHex(b.haloColor);
  return new pc.Color((first.r+second.r)*.5,(first.g+second.g)*.5,(first.b+second.b)*.5);
}
function createResonancePair(a:string,b:string) {
  const key=[a,b].sort().join("::");
  const avatarA=avatars.get(a),avatarB=avatars.get(b);
  if(!avatarA||!avatarB) return null;
  const color=blendedHaloColor(avatarA,avatarB);
  const effectMaterial=material([color.r,color.g,color.b]);
  effectMaterial.emissive=new pc.Color(color.r*.9,color.g*.9,color.b*.9);
  effectMaterial.opacity=.78;effectMaterial.blendType=pc.BLEND_ADDITIVE;
  effectMaterial.depthWrite=false;effectMaterial.update();
  const root=new pc.Entity(`Resonance-${key}`);
  const link=new pc.Entity(`ResonanceLink-${key}`);link.addComponent("render",{type:"box"});
  link.render!.material=effectMaterial;link.render!.castShadows=false;link.render!.receiveShadows=false;root.addChild(link);
  // The connection beam is intentionally disabled in 0.19.7.1. Resonance is
  // communicated by hearts, sound, and the cooperative-flight ring instead.
  link.enabled=false;
  const heartColorA=colorFromHex(avatarA.heartColor),heartColorB=colorFromHex(avatarB.heartColor);
  const heartColor=new pc.Color((heartColorA.r+heartColorB.r)*.5,(heartColorA.g+heartColorB.g)*.5,(heartColorA.b+heartColorB.b)*.5);
  effectMaterial.diffuse.copy(heartColor);effectMaterial.emissive.set(heartColor.r,heartColor.g,heartColor.b);effectMaterial.update();
  const hearts:pc.Entity[]=[];
  const heartCount=Math.max(avatarA.heartCount,avatarB.heartCount);
  const addHeartPart=(heart:pc.Entity,name:string,type:"sphere"|"box",position:number[],scale:number[],rotation:number[])=>{
    const part=new pc.Entity(name);part.addComponent("render",{type});
    part.setLocalPosition(position[0],position[1],position[2]);
    part.setLocalScale(scale[0],scale[1],scale[2]);
    part.setLocalEulerAngles(rotation[0],rotation[1],rotation[2]);
    part.render!.material=effectMaterial;part.render!.castShadows=false;part.render!.receiveShadows=false;heart.addChild(part);
  };
  for(let index=0;index<heartCount;index++) {
    const heart=new pc.Entity(`ResonanceHeart-${key}-${index}`);
    addHeartPart(heart,"HeartLeft","sphere",[-.14,.1,0],[.24,.24,.12],[0,0,0]);
    addHeartPart(heart,"HeartRight","sphere",[.14,.1,0],[.24,.24,.12],[0,0,0]);
    addHeartPart(heart,"HeartPoint","box",[0,-.08,0],[.32,.32,.12],[0,0,45]);
    root.addChild(heart);hearts.push(heart);
  }
  const flightRing=new pc.Entity(`CoFlightRing-${key}`);flightRing.addComponent("render",{type:"plane"});
  const ringTexture=createHaloTexture("ring",2);const ringMaterial=material([color.r,color.g,color.b]);
  ringMaterial.opacityMap=ringTexture;ringMaterial.opacityMapChannel="r";ringMaterial.diffuseMap=ringTexture;
  ringMaterial.emissiveMap=ringTexture;ringMaterial.emissive=new pc.Color(color.r*1.25,color.g*1.25,color.b*1.25);
  ringMaterial.opacity=.72;ringMaterial.blendType=pc.BLEND_ADDITIVE;ringMaterial.depthWrite=false;ringMaterial.update();
  flightRing.render!.material=ringMaterial;flightRing.render!.castShadows=false;flightRing.render!.receiveShadows=false;
  flightRing.enabled=false;root.addChild(flightRing);app.root.addChild(root);
  const motionChoices=[avatarA.heartMotion,avatarB.heartMotion];
  const effect:ResonancePairEffect={key,a,b,root,link,hearts,flightRing,material:effectMaterial,ringMaterial,ringTexture,
    enteredAt:performance.now(),heartMotion:motionChoices[Math.floor(Math.random()*motionChoices.length)],
    heartSpeed:(avatarA.heartSpeed+avatarB.heartSpeed)*.5,heartSize:(avatarA.heartSize+avatarB.heartSize)*.5};
  resonancePairs.set(key,effect);
  if(a===currentSessionId||b===currentSessionId) playResonanceTone(avatarA.haloColor,avatarB.haloColor);
  return effect;
}
function destroyResonancePair(key:string) {
  const effect=resonancePairs.get(key);if(!effect)return;
  effect.root.destroy();effect.material.destroy();effect.ringMaterial.destroy();effect.ringTexture.destroy();resonancePairs.delete(key);
}
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
let moveSequence = 0;
let latestMoveAck = 0;
let lastSentMove = {x:NaN,y:NaN,z:NaN,rotationY:NaN,flying:false};
let verticalVelocity=0;
let flying=false;
let mobileAscend=false;
let mobileDescend=false;
let jumpRequested=false;
const AVATAR_STYLE_KEY="shared-world-avatar-style-v1";
const AVATAR_IMAGE_KEY="shared-world-avatar-image-v1";
function savedAvatarStyle() {
  try {
    const input=JSON.parse(localStorage.getItem(AVATAR_STYLE_KEY)||"{}");
    return {
      color:typeof input.color==="string" && /^#[0-9a-fA-F]{6}$/.test(input.color)?input.color:"#f0f0f5",
      accent:typeof input.accent==="string" && /^#[0-9a-fA-F]{6}$/.test(input.accent)?input.accent:"#ff8c28",
      shape:["sphere","capsule","box"].includes(input.shape)?input.shape:"sphere",
      size:Number.isFinite(Number(input.size))?pc.math.clamp(Number(input.size),.5,2):1,
      labelVisible:input.labelVisible!==false,
      labelColor:typeof input.labelColor==="string" && /^#[0-9a-fA-F]{6}$/.test(input.labelColor)?input.labelColor:"#ffffff",
      textureRepeat:Number.isFinite(Number(input.textureRepeat))?pc.math.clamp(Number(input.textureRepeat),.25,8):1,
      textureRotation:Number.isFinite(Number(input.textureRotation))?pc.math.clamp(Number(input.textureRotation),0,360):0,
      part:["none","arms","wings","antenna"].includes(input.part)?input.part:"none",
      partColor:typeof input.partColor==="string" && /^#[0-9a-fA-F]{6}$/.test(input.partColor)?input.partColor:"#7fd8ff",
      haloColor:typeof input.haloColor==="string" && /^#[0-9a-fA-F]{6}$/.test(input.haloColor)?input.haloColor:"#ff7828",
      haloOpacity:Number.isFinite(Number(input.haloOpacity))?pc.math.clamp(Number(input.haloOpacity),.05,1):.55,
      haloSize:Number.isFinite(Number(input.haloSize))?pc.math.clamp(Number(input.haloSize),.5,4):1.5,
      haloMotion:["static","pulse","orbit","float"].includes(input.haloMotion)?input.haloMotion:"pulse",
      haloSpeed:Number.isFinite(Number(input.haloSpeed))?pc.math.clamp(Number(input.haloSpeed),.1,4):1,
      haloShape:["ring","disc","ripple"].includes(input.haloShape)?input.haloShape:"ring",
      haloGlow:Number.isFinite(Number(input.haloGlow))?pc.math.clamp(Number(input.haloGlow),0,2):.6,
      haloRings:Number.isFinite(Number(input.haloRings))?Math.round(pc.math.clamp(Number(input.haloRings),1,3)):1,
      heartColor:typeof input.heartColor==="string" && /^#[0-9a-fA-F]{6}$/.test(input.heartColor)?input.heartColor:"#ff5f91",
      heartSize:Number.isFinite(Number(input.heartSize))?pc.math.clamp(Number(input.heartSize),.3,2.5):1,
      heartCount:Number.isFinite(Number(input.heartCount))?Math.round(pc.math.clamp(Number(input.heartCount),1,8)):3,
      heartMotion:["float","orbit","burst"].includes(input.heartMotion)?input.heartMotion:"float",
      heartSpeed:Number.isFinite(Number(input.heartSpeed))?pc.math.clamp(Number(input.heartSpeed),.2,3):1,
      assetRef:typeof input.assetRef==="string" &&
        /^https?:\/\/[^\s]+\/assets\/[a-zA-Z0-9_-]{1,80}\.zip$/.test(input.assetRef)
        ?input.assetRef:""
    };
  } catch {return {color:"#f0f0f5",accent:"#ff8c28",shape:"sphere",size:1,
    labelVisible:true,labelColor:"#ffffff",textureRepeat:1,textureRotation:0,part:"none",partColor:"#7fd8ff",
    haloColor:"#ff7828",haloOpacity:.55,haloSize:1.5,haloMotion:"pulse",haloSpeed:1,
    haloShape:"ring",haloGlow:.6,haloRings:1,heartColor:"#ff5f91",heartSize:1,
    heartCount:3,heartMotion:"float",heartSpeed:1,assetRef:""};}
}
let selectedAvatarAssetRef=savedAvatarStyle().assetRef;
async function uploadAvatarImage(blob:Blob) {
  const archive=new JSZip();archive.file("avatar.jpg",blob);
  const body=await archive.generateAsync({type:"blob",compression:"STORE"});
  const ref=sharedAssetURL(`avatar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`,"zip");
  const response=await fetch(ref,{method:"PUT",body});
  if(!response.ok) throw new Error(`Upload HTTP ${response.status}`);
  return ref;
}
async function sendSavedAvatarStyle(restoreImage=false,override?:ReturnType<typeof savedAvatarStyle>) {
  const room=activeRoom;
  if(!room) return;
  let appearance=override || savedAvatarStyle();
  if(restoreImage && appearance.assetRef) {
    try {
      const data=localStorage.getItem(AVATAR_IMAGE_KEY);
      if(data && data.startsWith("data:image/jpeg;base64,")) {
        const blob=await (await fetch(data)).blob();
        const newRef=await uploadAvatarImage(blob);
        appearance={...savedAvatarStyle(),assetRef:newRef};
        selectedAvatarAssetRef=appearance.assetRef;
        localStorage.setItem(AVATAR_STYLE_KEY,JSON.stringify(appearance));
      }
    } catch(error) {console.warn("[AVATAR IMAGE RESTORE FAILED]",error);}
  }
  if(room===activeRoom) room.send("avatar:style",appearance);
}
const avatarSettingsPanel=avatarControls.querySelector<HTMLElement>("#avatarSettingsPanel")!;
avatarControls.querySelector<HTMLButtonElement>("#avatarSettingsButton")!.addEventListener("click",()=>{
  avatarSettingsPanel.hidden=!avatarSettingsPanel.hidden;
});
const initialAvatarStyle=savedAvatarStyle();
avatarControls.querySelector<HTMLInputElement>("#avatarBodyColor")!.value=initialAvatarStyle.color;
avatarControls.querySelector<HTMLInputElement>("#avatarAccentColor")!.value=initialAvatarStyle.accent;
avatarControls.querySelector<HTMLSelectElement>("#avatarShape")!.value=initialAvatarStyle.shape;
avatarControls.querySelector<HTMLInputElement>("#avatarSize")!.value=String(initialAvatarStyle.size);
avatarControls.querySelector<HTMLInputElement>("#avatarLabelVisible")!.checked=initialAvatarStyle.labelVisible;
avatarControls.querySelector<HTMLInputElement>("#avatarLabelColor")!.value=initialAvatarStyle.labelColor;
avatarControls.querySelector<HTMLInputElement>("#avatarTextureRepeat")!.value=String(initialAvatarStyle.textureRepeat);
avatarControls.querySelector<HTMLInputElement>("#avatarTextureRotation")!.value=String(initialAvatarStyle.textureRotation);
avatarControls.querySelector<HTMLSelectElement>("#avatarPart")!.value=initialAvatarStyle.part;
avatarControls.querySelector<HTMLInputElement>("#avatarPartColor")!.value=initialAvatarStyle.partColor;
avatarControls.querySelector<HTMLInputElement>("#avatarHaloColor")!.value=initialAvatarStyle.haloColor;
avatarControls.querySelector<HTMLInputElement>("#avatarHaloOpacity")!.value=String(initialAvatarStyle.haloOpacity);
avatarControls.querySelector<HTMLInputElement>("#avatarHaloSize")!.value=String(initialAvatarStyle.haloSize);
avatarControls.querySelector<HTMLSelectElement>("#avatarHaloMotion")!.value=initialAvatarStyle.haloMotion;
avatarControls.querySelector<HTMLInputElement>("#avatarHaloSpeed")!.value=String(initialAvatarStyle.haloSpeed);
avatarControls.querySelector<HTMLSelectElement>("#avatarHaloShape")!.value=initialAvatarStyle.haloShape;
avatarControls.querySelector<HTMLInputElement>("#avatarHaloGlow")!.value=String(initialAvatarStyle.haloGlow);
avatarControls.querySelector<HTMLInputElement>("#avatarHaloRings")!.value=String(initialAvatarStyle.haloRings);
avatarControls.querySelector<HTMLInputElement>("#avatarHeartColor")!.value=initialAvatarStyle.heartColor;
avatarControls.querySelector<HTMLInputElement>("#avatarHeartSize")!.value=String(initialAvatarStyle.heartSize);
avatarControls.querySelector<HTMLInputElement>("#avatarHeartCount")!.value=String(initialAvatarStyle.heartCount);
avatarControls.querySelector<HTMLSelectElement>("#avatarHeartMotion")!.value=initialAvatarStyle.heartMotion;
avatarControls.querySelector<HTMLInputElement>("#avatarHeartSpeed")!.value=String(initialAvatarStyle.heartSpeed);
for(const [inputId,valueId,suffix] of [
  ["#avatarSize","#avatarSizeValue",""] as const,
  ["#avatarTextureRepeat","#avatarTextureRepeatValue",""] as const,
  ["#avatarTextureRotation","#avatarTextureRotationValue","°"] as const,
  ["#avatarHaloOpacity","#avatarHaloOpacityValue",""] as const,
  ["#avatarHaloSize","#avatarHaloSizeValue",""] as const,
  ["#avatarHaloSpeed","#avatarHaloSpeedValue",""] as const,
  ["#avatarHaloGlow","#avatarHaloGlowValue",""] as const,
  ["#avatarHaloRings","#avatarHaloRingsValue",""] as const,
  ["#avatarHeartSize","#avatarHeartSizeValue",""] as const,
  ["#avatarHeartCount","#avatarHeartCountValue",""] as const,
  ["#avatarHeartSpeed","#avatarHeartSpeedValue",""] as const
]) {
  const input=avatarControls.querySelector<HTMLInputElement>(inputId)!;
  const value=avatarControls.querySelector<HTMLElement>(valueId)!;
  const refresh=()=>{value.textContent=`${input.value}${suffix}`;};
  input.addEventListener("input",refresh);refresh();
}
const avatarImageInput=avatarControls.querySelector<HTMLInputElement>("#avatarImageFile")!;
const avatarImageStatus=avatarControls.querySelector<HTMLElement>("#avatarImageStatus")!;
const avatarSaveButton=avatarControls.querySelector<HTMLButtonElement>("#avatarSaveButton")!;
avatarImageStatus.textContent=selectedAvatarAssetRef?"Saved image selected.":"No image selected.";
avatarImageInput.addEventListener("change",async()=>{
  const file=avatarImageInput.files?.[0];avatarImageInput.value="";
  if(!file || !activeRoom) return;
  if(!["image/png","image/jpeg"].includes(file.type) || file.size>8*1024*1024) {
    avatarImageStatus.textContent="Select a JPG or PNG under 8 MB.";return;
  }
  avatarSaveButton.disabled=true;
  try {
    const image=new Image();const url=URL.createObjectURL(file);
    try {image.src=url;await image.decode();}
    finally {URL.revokeObjectURL(url);}
    const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
    const context=canvas.getContext("2d")!;
    context.fillStyle="#ffffff";context.fillRect(0,0,512,512);
    const side=Math.min(image.naturalWidth,image.naturalHeight);
    context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,
      side,side,0,0,512,512);
    const data=canvas.toDataURL("image/jpeg",.86);
    const blob=await (await fetch(data)).blob();
    avatarImageStatus.textContent="Uploading avatar image…";
    selectedAvatarAssetRef=await uploadAvatarImage(blob);
    try {localStorage.setItem(AVATAR_IMAGE_KEY,data);}
    catch {avatarImageStatus.textContent="Image ready. Browser storage is full; choose it again after restarting.";}
    if(!avatarImageStatus.textContent?.startsWith("Image ready."))
      avatarImageStatus.textContent="512×512 image ready. Press APPLY AVATAR.";
  } catch(error) {avatarImageStatus.textContent=`Avatar image error: ${String(error)}`;}
  finally {avatarSaveButton.disabled=false;}
});
avatarControls.querySelector<HTMLButtonElement>("#avatarClearImage")!.addEventListener("click",()=>{
  selectedAvatarAssetRef="";
  try {localStorage.removeItem(AVATAR_IMAGE_KEY);} catch {}
  avatarImageStatus.textContent="Image removed. Press APPLY AVATAR.";
});
avatarSaveButton.addEventListener("click",()=>{
  const appearance={
    color:avatarControls.querySelector<HTMLInputElement>("#avatarBodyColor")!.value,
    accent:avatarControls.querySelector<HTMLInputElement>("#avatarAccentColor")!.value,
    shape:avatarControls.querySelector<HTMLSelectElement>("#avatarShape")!.value,
    size:Number(avatarControls.querySelector<HTMLInputElement>("#avatarSize")!.value),
    labelVisible:avatarControls.querySelector<HTMLInputElement>("#avatarLabelVisible")!.checked,
    labelColor:avatarControls.querySelector<HTMLInputElement>("#avatarLabelColor")!.value,
    textureRepeat:Number(avatarControls.querySelector<HTMLInputElement>("#avatarTextureRepeat")!.value),
    textureRotation:Number(avatarControls.querySelector<HTMLInputElement>("#avatarTextureRotation")!.value),
    part:avatarControls.querySelector<HTMLSelectElement>("#avatarPart")!.value,
    partColor:avatarControls.querySelector<HTMLInputElement>("#avatarPartColor")!.value,
    haloColor:avatarControls.querySelector<HTMLInputElement>("#avatarHaloColor")!.value,
    haloOpacity:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHaloOpacity")!.value),
    haloSize:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHaloSize")!.value),
    haloMotion:avatarControls.querySelector<HTMLSelectElement>("#avatarHaloMotion")!.value,
    haloSpeed:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHaloSpeed")!.value),
    haloShape:avatarControls.querySelector<HTMLSelectElement>("#avatarHaloShape")!.value,
    haloGlow:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHaloGlow")!.value),
    haloRings:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHaloRings")!.value),
    heartColor:avatarControls.querySelector<HTMLInputElement>("#avatarHeartColor")!.value,
    heartSize:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHeartSize")!.value),
    heartCount:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHeartCount")!.value),
    heartMotion:avatarControls.querySelector<HTMLSelectElement>("#avatarHeartMotion")!.value,
    heartSpeed:Number(avatarControls.querySelector<HTMLInputElement>("#avatarHeartSpeed")!.value),
    assetRef:selectedAvatarAssetRef
  };
  try {localStorage.setItem(AVATAR_STYLE_KEY,JSON.stringify(appearance));} catch {}
  void sendSavedAvatarStyle(false,appearance);
  avatarSettingsPanel.hidden=true;
});
const flyButton=flightControls.querySelector<HTMLButtonElement>("#flyButton")!;
function setFlightMode(enabled:boolean) {
  flying=enabled;
  verticalVelocity=0;
  mobileAscend=false;mobileDescend=false;
  flyButton.textContent=flying?"FLY ON":"FLY OFF";
  flyButton.style.borderColor=flying?"#50caff":"#9fb3c6";
  const avatar=currentSessionId?avatars.get(currentSessionId):undefined;
  if(activeRoom && avatar) sendLocalMovement(avatar.entity.getEulerAngles().y);
}
flyButton.addEventListener("click",()=>{if(activeRoom) setFlightMode(!flying);});
const jumpButton=flightControls.querySelector<HTMLButtonElement>("#jumpButton")!;
jumpButton.addEventListener("pointerdown",(event)=>{
  event.preventDefault();
  if(!activeRoom) return;
  mobileAscend=true;
  if(!flying) jumpRequested=true;
  jumpButton.setPointerCapture(event.pointerId);
});
for(const type of ["pointerup","pointercancel","lostpointercapture"])
  jumpButton.addEventListener(type,()=>{mobileAscend=false;});
const descendButton=flightControls.querySelector<HTMLButtonElement>("#descendButton")!;
descendButton.addEventListener("pointerdown",(event)=>{
  event.preventDefault();mobileDescend=true;
  descendButton.setPointerCapture(event.pointerId);
});
for(const type of ["pointerup","pointercancel","lostpointercapture"])
  descendButton.addEventListener(type,()=>{mobileDescend=false;});
emoteControls.addEventListener("click",event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-emote]");
  if(activeRoom && button?.dataset.emote) activeRoom.send("avatar:emote",{type:button.dataset.emote});
});
const avatarMessageInput=communicationControls.querySelector<HTMLInputElement>("#avatarMessageInput")!;
const sendAvatarMessageButton=communicationControls.querySelector<HTMLButtonElement>("#sendAvatarMessage")!;
function sendAvatarMessage(text=avatarMessageInput.value) {
  const message=text.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,48);
  if(!activeRoom||!message)return;
  activeRoom.send("avatar:message",{text:message});avatarMessageInput.value="";
}
sendAvatarMessageButton.addEventListener("click",()=>sendAvatarMessage());
avatarMessageInput.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.isComposing) {event.preventDefault();sendAvatarMessage();}
});
communicationControls.querySelector<HTMLElement>("#quickMessages")!.addEventListener("click",event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if(button)sendAvatarMessage(button.textContent||"");
});
const voiceToggleButton=communicationControls.querySelector<HTMLButtonElement>("#voiceToggle")!;
const voiceEffectSelect=communicationControls.querySelector<HTMLSelectElement>("#voiceEffect")!;
const voiceStatus=communicationControls.querySelector<HTMLElement>("#voiceStatus")!;
const voicePeers=new Map<string,RTCPeerConnection>();
const voiceAudioElements=new Map<string,HTMLAudioElement>();
const voiceAnalysers=new Map<string,{analyser:AnalyserNode,data:Uint8Array}>();
const voicePendingCandidates=new Map<string,RTCIceCandidateInit[]>();
let voiceEnabled=false;
let voiceRawStream:MediaStream|null=null;
let voiceSendStream:MediaStream|null=null;
let voiceAudioContext:AudioContext|null=null;
let voiceSourceNode:MediaStreamAudioSourceNode|null=null;
let voiceEffectNodes:AudioNode[]=[];
let voiceDestination:MediaStreamAudioDestinationNode|null=null;
function setVoiceStatus(text:string,error=false) {
  voiceStatus.textContent=`VOICE: ${text}`;voiceStatus.style.color=error?"#ff7187":text==="LIVE"?"#58e6bb":"#9fb3c6";
}
function installVoiceAnalyser(sessionId:string,stream:MediaStream) {
  const context=voiceAudioContext;if(!context)return;
  const old=voiceAnalysers.get(sessionId);if(old)voiceAnalysers.delete(sessionId);
  const source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=256;
  source.connect(analyser);voiceAnalysers.set(sessionId,{analyser,data:new Uint8Array(analyser.fftSize)});
}
async function rebuildVoiceSendStream() {
  if(!voiceRawStream)return;
  if(!voiceAudioContext) {
    const Context=window.AudioContext||(window as any).webkitAudioContext;voiceAudioContext=new Context();
  }
  await voiceAudioContext.resume();
  try {voiceSourceNode?.disconnect();} catch {}
  for(const node of voiceEffectNodes)try {node.disconnect();} catch {}
  voiceEffectNodes=[];voiceSourceNode=voiceAudioContext.createMediaStreamSource(voiceRawStream);
  voiceDestination=voiceAudioContext.createMediaStreamDestination();
  const effect=voiceEffectSelect.value;
  if(effect==="deep") {
    const low=voiceAudioContext.createBiquadFilter();low.type="lowpass";low.frequency.value=1500;
    const shelf=voiceAudioContext.createBiquadFilter();shelf.type="lowshelf";shelf.frequency.value=280;shelf.gain.value=7;
    voiceSourceNode.connect(low);low.connect(shelf);shelf.connect(voiceDestination);voiceEffectNodes=[low,shelf];
  } else if(effect==="bright") {
    const high=voiceAudioContext.createBiquadFilter();high.type="highpass";high.frequency.value=150;
    const shelf=voiceAudioContext.createBiquadFilter();shelf.type="highshelf";shelf.frequency.value=1700;shelf.gain.value=6;
    voiceSourceNode.connect(high);high.connect(shelf);shelf.connect(voiceDestination);voiceEffectNodes=[high,shelf];
  } else if(effect==="echo") {
    const delay=voiceAudioContext.createDelay(.8);delay.delayTime.value=.2;
    const feedback=voiceAudioContext.createGain();feedback.gain.value=.26;
    voiceSourceNode.connect(voiceDestination);voiceSourceNode.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(voiceDestination);
    voiceEffectNodes=[delay,feedback];
  } else voiceSourceNode.connect(voiceDestination);
  voiceSendStream=voiceDestination.stream;
  installVoiceAnalyser(currentSessionId,voiceSendStream);
  const track=voiceSendStream.getAudioTracks()[0];
  for(const peer of voicePeers.values()) {
    const sender=peer.getSenders().find(item=>item.track?.kind==="audio");
    if(sender&&track)await sender.replaceTrack(track);
  }
}
function closeVoicePeer(sessionId:string) {
  const peer=voicePeers.get(sessionId);if(peer){peer.ontrack=null;peer.onicecandidate=null;peer.close();voicePeers.delete(sessionId);}
  const audio=voiceAudioElements.get(sessionId);if(audio){audio.pause();audio.srcObject=null;audio.remove();voiceAudioElements.delete(sessionId);}
  voiceAnalysers.delete(sessionId);voicePendingCandidates.delete(sessionId);
  if(voiceEnabled&&voicePeers.size===0)setVoiceStatus(avatars.size>1?"CONNECTING":"READY");
}
async function ensureVoicePeer(sessionId:string,makeOffer=false) {
  if(!voiceEnabled||!activeRoom||sessionId===currentSessionId)return null;
  let peer=voicePeers.get(sessionId);
  if(!peer) {
    peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});voicePeers.set(sessionId,peer);
    for(const track of voiceSendStream?.getTracks()||[])peer.addTrack(track,voiceSendStream!);
    peer.onicecandidate=event=>{if(event.candidate&&activeRoom)activeRoom.send("voice:signal",{targetSessionId:sessionId,candidate:event.candidate.toJSON()});};
    peer.ontrack=event=>{
      const stream=event.streams[0]||new MediaStream([event.track]);
      let audio=voiceAudioElements.get(sessionId);if(!audio){audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.hidden=true;document.body.appendChild(audio);voiceAudioElements.set(sessionId,audio);}
      audio.srcObject=stream;void audio.play().catch(()=>{});installVoiceAnalyser(sessionId,stream);setVoiceStatus("LIVE");
    };
    peer.onconnectionstatechange=()=>{
      if(peer?.connectionState==="connected")setVoiceStatus("LIVE");
      else if(["failed","closed","disconnected"].includes(peer?.connectionState||"")) {
        if(peer?.connectionState==="failed")setVoiceStatus("ERROR",true);
      }
    };
  }
  if(makeOffer&&peer.signalingState==="stable") {
    try {
      const offer=await peer.createOffer();await peer.setLocalDescription(offer);
      activeRoom.send("voice:signal",{targetSessionId:sessionId,description:peer.localDescription});
    } catch(error) {console.warn("[VOICE OFFER ERROR]",sessionId,error);setVoiceStatus("ERROR",true);}
  }
  return peer;
}
async function handleVoiceSignal(payload:any) {
  if(!voiceEnabled||!activeRoom)return;
  const from=String(payload?.fromSessionId||"");if(!from)return;
  const peer=await ensureVoicePeer(from,false);if(!peer)return;
  try {
    if(payload.description) {
      await peer.setRemoteDescription(payload.description);
      for(const candidate of voicePendingCandidates.get(from)||[])await peer.addIceCandidate(candidate);
      voicePendingCandidates.delete(from);
      if(payload.description.type==="offer") {
        const answer=await peer.createAnswer();await peer.setLocalDescription(answer);
        activeRoom.send("voice:signal",{targetSessionId:from,description:peer.localDescription});
      }
    } else if(payload.candidate) {
      if(peer.remoteDescription)await peer.addIceCandidate(payload.candidate);
      else {const pending=voicePendingCandidates.get(from)||[];pending.push(payload.candidate);voicePendingCandidates.set(from,pending);}
    }
  } catch(error) {console.warn("[VOICE SIGNAL ERROR]",from,error);setVoiceStatus("ERROR",true);}
}
async function enableVoice() {
  if(voiceEnabled)return;
  if(!navigator.mediaDevices?.getUserMedia){setVoiceStatus("UNSUPPORTED",true);return;}
  setVoiceStatus("CONNECTING");voiceToggleButton.disabled=true;
  try {
    voiceRawStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    voiceEnabled=true;await rebuildVoiceSendStream();voiceToggleButton.textContent="MIC ON";voiceToggleButton.classList.add("active");
    activeRoom?.send("voice:ready",{});setVoiceStatus(avatars.size>1?"CONNECTING":"READY");
  } catch(error) {voiceEnabled=false;setVoiceStatus("DENIED",true);console.warn("[VOICE MIC ERROR]",error);}
  finally {voiceToggleButton.disabled=false;}
}
function disableVoice(notify=true) {
  if(notify)activeRoom?.send("voice:leave",{});voiceEnabled=false;
  for(const sessionId of Array.from(voicePeers.keys()))closeVoicePeer(sessionId);
  voiceRawStream?.getTracks().forEach(track=>track.stop());voiceRawStream=null;voiceSendStream=null;
  try {voiceSourceNode?.disconnect();} catch {}
  for(const node of voiceEffectNodes)try {node.disconnect();} catch {}
  try {voiceDestination?.disconnect();} catch {}
  voiceSourceNode=null;voiceEffectNodes=[];voiceDestination=null;
  voiceAnalysers.clear();voiceToggleButton.textContent="MIC OFF";voiceToggleButton.classList.remove("active");setVoiceStatus("OFF");
}
voiceToggleButton.addEventListener("click",()=>{if(voiceEnabled)disableVoice();else void enableVoice();});
voiceEffectSelect.addEventListener("change",()=>{if(voiceEnabled)void rebuildVoiceSendStream();});
window.addEventListener("beforeunload",()=>disableVoice(false));
const takeWorldPhotoButton=communicationControls.querySelector<HTMLButtonElement>("#takeWorldPhoto")!;
const selfieModeButton=communicationControls.querySelector<HTMLButtonElement>("#selfieMode")!;
const groupPhotoModeButton=communicationControls.querySelector<HTMLButtonElement>("#groupPhotoMode")!;
const photoTimerSelect=communicationControls.querySelector<HTMLSelectElement>("#photoTimer")!;
function setPhotoCameraMode(mode:PhotoCameraMode) {
  photoCameraMode=photoCameraMode===mode?"normal":mode;
  if(photoCameraMode!=="normal"&&firstPersonMode)toggleViewMode();
  selfieModeButton.classList.toggle("active",photoCameraMode==="selfie");
  groupPhotoModeButton.classList.toggle("active",photoCameraMode==="group");
}
selfieModeButton.addEventListener("click",()=>setPhotoCameraMode("selfie"));
groupPhotoModeButton.addEventListener("click",()=>setPhotoCameraMode("group"));
const wait=(milliseconds:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,milliseconds));
async function takeWorldPhoto() {
  takeWorldPhotoButton.disabled=true;takeWorldPhotoButton.textContent="CAPTURING…";
  try {
    const countdown=Math.max(0,Math.min(10,Number(photoTimerSelect.value)||0));
    for(let remaining=countdown;remaining>0;remaining--) {
      photoCountdown.hidden=false;photoCountdown.textContent=String(remaining);
      await wait(1000);
    }
    photoCountdown.hidden=false;photoCountdown.textContent="●";await wait(120);photoCountdown.hidden=true;
    app.renderNextFrame=true;
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("PNG capture failed")),"image/png"));
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    const file=new File([blob],`shared-world-${stamp}.png`,{type:"image/png"});
    const shareNavigator=navigator as Navigator & {canShare?:(data:ShareData)=>boolean};
    if(navigator.share && (!shareNavigator.canShare||shareNavigator.canShare({files:[file]})))
      await navigator.share({files:[file],title:"Shared World Photo"});
    else {
      const url=URL.createObjectURL(blob);const anchor=document.createElement("a");
      anchor.href=url;anchor.download=file.name;document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
    }
  } catch(error) {
    if((error as DOMException)?.name!=="AbortError") console.warn("[WORLD PHOTO FAILED]",error);
  } finally {photoCountdown.hidden=true;takeWorldPhotoButton.disabled=false;takeWorldPhotoButton.textContent="PHOTO";}
}
takeWorldPhotoButton.addEventListener("click",()=>void takeWorldPhoto());
function sendLocalMovement(rotationY:number) {
  if (!activeRoom) return;
  const seq=++moveSequence;
  activeRoom.send("move",{x:localPosition.x,y:localPosition.y,z:localPosition.z,
    rotationY,flying,seq});
  lastSentMove={x:localPosition.x,y:localPosition.y,z:localPosition.z,rotationY,flying};
  lastSend=performance.now();
}

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
  const target=e.target as HTMLElement;
  if(target?.closest?.("input,textarea,select,button") || target?.isContentEditable) return;
  if(e.code==="Space") {
    e.preventDefault();
    if(!e.repeat && !flying) jumpRequested=true;
    keys.add("space");
    return;
  }
  if(e.key.toLowerCase()==="f") {
    if(!e.repeat && activeRoom) setFlightMode(!flying);
    return;
  }
  if(e.key.toLowerCase()==="shift") {keys.add("shift");return;}
  if (e.key.toLowerCase() === "v") {
    toggleViewMode();
    return;
  }
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    keys.add(e.key.toLowerCase());
  }
});

window.addEventListener("keyup", (e) => {
  if(e.code==="Space") keys.delete("space");
  else keys.delete(e.key.toLowerCase());
});
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

async function setAvatarTexture(avatar:Avatar,ref:string) {
  if(ref===avatar.textureRef) return;
  avatar.textureRef=ref;
  const request=++avatar.textureRequest;
  if(avatar.body.render?.material instanceof pc.StandardMaterial) {
    avatar.body.render.material.diffuseMap=null;
    avatar.body.render.material.update();
  }
  if(avatar.texture) {avatar.texture.destroy();avatar.texture=null;}
  if(avatar.textureURL) {URL.revokeObjectURL(avatar.textureURL);avatar.textureURL=null;}
  if(!ref) return;
  try {
    const response=await fetch(ref,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive=await JSZip.loadAsync(await response.blob());
    const entry=archive.file("avatar.jpg");
    if(!entry) throw new Error("avatar.jpg missing");
    const blob=await entry.async("blob");
    if(!blob.size || blob.size>1024*1024) throw new Error("Avatar image too large");
    const url=URL.createObjectURL(blob);
    const image=new Image();image.src=url;
    try {await image.decode();}
    catch(error) {URL.revokeObjectURL(url);throw error;}
    if(request!==avatar.textureRequest) {URL.revokeObjectURL(url);return;}
    const texture=new pc.Texture(app.graphicsDevice,{mipmaps:true});
    texture.setSource(image);
    avatar.texture=texture;avatar.textureURL=url;
    const body=avatar.body.render?.material;
    if(body instanceof pc.StandardMaterial) {
      body.diffuseMap=texture;
      body.diffuseMapTiling=new pc.Vec2(avatar.textureRepeat,avatar.textureRepeat);
      body.diffuseMapRotation=avatar.textureRotation;
      body.update();
    }
  } catch(error) {
    if(request===avatar.textureRequest) avatar.textureRef="";
    console.warn("[AVATAR IMAGE LOAD FAILED]",ref,error);
  }
}
function rebuildAvatarParts(avatar:Avatar,part:string,partColor:string) {
  for(const child of [...avatar.partsRoot.children]) child.destroy();
  avatar.partMaterial?.destroy();
  avatar.partEntities=[];
  avatar.partType=part;
  if(part==="none") {avatar.partMaterial=null;return;}
  const color=colorFromHex(partColor);
  const sharedMaterial=material([color.r,color.g,color.b]);
  avatar.partMaterial=sharedMaterial;
  const add=(name:string,type:"box"|"sphere"|"cylinder",position:number[],scale:number[],rotation:number[]=[0,0,0])=>{
    const entity=new pc.Entity(name);
    entity.addComponent("render",{type});
    entity.render!.material=sharedMaterial;
    entity.setLocalPosition(position[0],position[1],position[2]);
    entity.setLocalScale(scale[0],scale[1],scale[2]);
    entity.setLocalEulerAngles(rotation[0],rotation[1],rotation[2]);
    avatar.partsRoot.addChild(entity);avatar.partEntities.push(entity);
  };
  if(part==="arms") {
    add("AvatarArmLeft","capsule",[-.9,0,0],[.18,.72,.18],[0,0,-12]);
    add("AvatarArmRight","capsule",[.9,0,0],[.18,.72,.18],[0,0,12]);
  } else if(part==="wings") {
    add("AvatarWingLeft","box",[-.75,.05,.42],[.72,.52,.08],[0,-18,-25]);
    add("AvatarWingRight","box",[.75,.05,.42],[.72,.52,.08],[0,18,25]);
  } else if(part==="antenna") {
    add("AvatarAntennaStem","cylinder",[0,.95,0],[.08,.55,.08]);
    add("AvatarAntennaTip","sphere",[0,1.5,0],[.2,.2,.2]);
  }
}
function createHaloTexture(shape:string,rings:number) {
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;
  const context=canvas.getContext("2d")!;
  context.clearRect(0,0,256,256);
  context.strokeStyle="#ffffff";context.fillStyle="#ffffff";
  context.lineCap="round";
  if(shape==="disc") {
    const gradient=context.createRadialGradient(128,128,8,128,128,116);
    gradient.addColorStop(0,"rgba(255,255,255,.75)");
    gradient.addColorStop(.75,"rgba(255,255,255,.5)");
    gradient.addColorStop(1,"rgba(255,255,255,0)");
    context.fillStyle=gradient;context.beginPath();context.arc(128,128,116,0,Math.PI*2);context.fill();
  } else {
    const count=Math.max(1,Math.min(3,Math.round(rings)));
    context.lineWidth=shape==="ripple"?8:12;
    for(let index=0;index<count;index++) {
      context.globalAlpha=1-index*.23;
      const radius=106-index*(shape==="ripple"?30:22);
      context.beginPath();context.arc(128,128,radius,0,Math.PI*2);context.stroke();
    }
    context.globalAlpha=1;
  }
  // Encode the finished alpha mask into RGB luminance. The material reads the
  // red channel for consistent masking across desktop and iOS, so copying the
  // alpha values preserves the soft disc gradient and anti-aliased ring edges
  // without depending on canvas-texture alpha support.
  const pixels=context.getImageData(0,0,256,256);
  for(let offset=0;offset<pixels.data.length;offset+=4) {
    const alpha=pixels.data[offset+3];
    pixels.data[offset]=alpha;
    pixels.data[offset+1]=alpha;
    pixels.data[offset+2]=alpha;
    pixels.data[offset+3]=255;
  }
  context.putImageData(pixels,0,0);
  const texture=new pc.Texture(app.graphicsDevice,{mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
  texture.setSource(canvas);return texture;
}
function applyAvatarStyle(avatar:Avatar,color:string,accent:string,shape:string,assetRef:string,
  size=1,labelVisible=true,labelColor="#ffffff",textureRepeat=1,textureRotation=0,
  part="none",partColor="#7fd8ff",haloColor="#ff7828",haloOpacity=.55,
  haloSize=1.5,haloMotion="pulse",haloSpeed=1,haloShape="ring",haloGlow=.6,
  haloRings=1) {
  const safeColor=/^#[0-9a-fA-F]{6}$/.test(color)?color:"#f0f0f5";
  const safeAccent=/^#[0-9a-fA-F]{6}$/.test(accent)?accent:"#ff8c28";
  const safeShape=["sphere","capsule","box"].includes(shape)?shape:"sphere";
  const safeRef=typeof assetRef==="string" &&
    /^https?:\/\/[^\s]+\/assets\/[a-zA-Z0-9_-]{1,80}\.zip$/.test(assetRef)?assetRef:"";
  const safeSize=pc.math.clamp(Number(size)||1,.5,2);
  const safeLabelColor=/^#[0-9a-fA-F]{6}$/.test(labelColor)?labelColor:"#ffffff";
  const safeRepeat=pc.math.clamp(Number(textureRepeat)||1,.25,8);
  const safeRotation=pc.math.clamp(Number(textureRotation)||0,0,360);
  const safePart=["none","arms","wings","antenna"].includes(part)?part:"none";
  const safePartColor=/^#[0-9a-fA-F]{6}$/.test(partColor)?partColor:"#7fd8ff";
  const safeHaloColor=/^#[0-9a-fA-F]{6}$/.test(haloColor)?haloColor:"#ff7828";
  const safeHaloOpacity=pc.math.clamp(Number(haloOpacity)||.55,.05,1);
  const safeHaloSize=pc.math.clamp(Number(haloSize)||1.5,.5,4);
  const safeHaloMotion=["static","pulse","orbit","float"].includes(haloMotion)?haloMotion:"pulse";
  const safeHaloSpeed=pc.math.clamp(Number(haloSpeed)||1,.1,4);
  const safeHaloShape=["ring","disc","ripple"].includes(haloShape)?haloShape:"ring";
  const safeHaloGlow=pc.math.clamp(Number(haloGlow)||0,0,2);
  const safeHaloRings=Math.round(pc.math.clamp(Number(haloRings)||1,1,3));
  const key=`${safeColor}/${safeAccent}/${safeShape}/${safeSize}/${safeLabelColor}/${safeRepeat}/${safeRotation}/${safePart}/${safePartColor}/${safeHaloColor}/${safeHaloOpacity}/${safeHaloSize}/${safeHaloMotion}/${safeHaloSpeed}/${safeHaloShape}/${safeHaloGlow}/${safeHaloRings}`;
  void setAvatarTexture(avatar,safeRef);
  avatar.labelVisible=labelVisible!==false;
  avatar.textureRepeat=safeRepeat;
  avatar.textureRotation=safeRotation;
  avatar.名前ラベル.style.color=safeLabelColor;
  avatar.size=safeSize;
  avatar.haloColor=safeHaloColor;
  avatar.haloOpacity=safeHaloOpacity;
  avatar.haloSize=safeHaloSize;
  avatar.haloMotion=safeHaloMotion;
  avatar.haloSpeed=safeHaloSpeed;
  avatar.haloShape=safeHaloShape;
  avatar.haloGlow=safeHaloGlow;
  avatar.haloRings=safeHaloRings;
  if(key===avatar.styleKey) return;
  const body=avatar.body.render!;
  const oldBody=body.material;
  const oldMarker=avatar.forwardMarker.render!.material;
  const oldHalo=avatar.proximityHalo.render!.material;
  body.type=safeShape;
  avatar.baseScale.set(.65*safeSize,(safeShape==="capsule"?.85:.65)*safeSize,.65*safeSize);
  avatar.baseBodyY=avatar.baseScale.y-.65;
  avatar.body.setLocalScale(avatar.baseScale);
  avatar.body.setLocalPosition(0,avatar.baseBodyY,0);
  const bodyColor=colorFromHex(safeColor);
  const newBodyMaterial=material([bodyColor.r,bodyColor.g,bodyColor.b]);
  if(avatar.texture) {
    newBodyMaterial.diffuseMap=avatar.texture;
    newBodyMaterial.diffuseMapTiling=new pc.Vec2(safeRepeat,safeRepeat);
    newBodyMaterial.diffuseMapRotation=safeRotation;
    newBodyMaterial.update();
  }
  body.material=newBodyMaterial;
  const accentColor=colorFromHex(safeAccent);
  avatar.forwardMarker.render!.material=material([accentColor.r,accentColor.g,accentColor.b]);
  const haloColorValue=colorFromHex(safeHaloColor);
  const haloMaterial=material([haloColorValue.r,haloColorValue.g,haloColorValue.b]);
  const haloTexture=createHaloTexture(safeHaloShape,safeHaloRings);
  avatar.haloTexture?.destroy();avatar.haloTexture=haloTexture;
  // Use the canvas luminance as the opacity mask. Some mobile/WebGL paths do
  // not preserve a canvas texture's alpha channel consistently, which made the
  // square bounds of the halo plane faintly visible. The cleared canvas is
  // black (0 opacity) and the painted halo is white (full opacity), so the red
  // channel is a reliable mask on both desktop and iOS.
  haloMaterial.opacityMap=haloTexture;haloMaterial.opacityMapChannel="r";
  // Apply the same luminance mask to visible color and glow as well as
  // opacity. Chromium desktop and iOS WebGL can blend opacity maps slightly
  // differently; modulating all three channels keeps the soft edge visible on
  // both renderers while the plane itself remains fully hidden at the border.
  haloMaterial.diffuseMap=haloTexture;
  haloMaterial.emissiveMap=haloTexture;
  haloMaterial.emissive=new pc.Color(haloColorValue.r*safeHaloGlow,
    haloColorValue.g*safeHaloGlow,haloColorValue.b*safeHaloGlow);
  haloMaterial.opacity=safeHaloOpacity;
  haloMaterial.blendType=pc.BLEND_NORMAL;
  haloMaterial.depthWrite=false;
  haloMaterial.update();
  avatar.proximityHalo.render!.material=haloMaterial;
  rebuildAvatarParts(avatar,safePart,safePartColor);
  avatar.styleKey=key;
  oldBody?.destroy();oldMarker?.destroy();oldHalo?.destroy();
}
function applyHeartStyle(avatar:Avatar,color:string,size=1,count=3,motion="float",speed=1) {
  const safeColor=/^#[0-9a-fA-F]{6}$/.test(color)?color:"#ff5f91";
  const safeSize=pc.math.clamp(Number(size)||1,.3,2.5);
  const safeCount=Math.round(pc.math.clamp(Number(count)||3,1,8));
  const safeMotion=["float","orbit","burst"].includes(motion)?motion:"float";
  const safeSpeed=pc.math.clamp(Number(speed)||1,.2,3);
  const changed=avatar.heartColor!==safeColor||avatar.heartSize!==safeSize||avatar.heartCount!==safeCount||
    avatar.heartMotion!==safeMotion||avatar.heartSpeed!==safeSpeed;
  avatar.heartColor=safeColor;avatar.heartSize=safeSize;avatar.heartCount=safeCount;
  avatar.heartMotion=safeMotion;avatar.heartSpeed=safeSpeed;
  if(!changed)return;
  for(const [key,effect] of Array.from(resonancePairs.entries()))
    if(effect.a===avatar.entity.name.slice(7)||effect.b===avatar.entity.name.slice(7)) destroyResonancePair(key);
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
function showAvatarMessage(sessionId:string,text:string) {
  const avatar=avatars.get(sessionId);if(!avatar)return;
  avatar.messageBubble?.remove();
  const bubble=document.createElement("div");bubble.textContent=text;
  Object.assign(bubble.style,{position:"fixed",left:"0",top:"0",transform:"translate(-50%,-100%)",
    maxWidth:"220px",padding:"8px 11px",borderRadius:"15px 15px 15px 4px",background:"rgba(255,255,255,.94)",
    color:"#111827",fontFamily:"Arial,sans-serif",fontSize:"14px",fontWeight:"700",lineHeight:"1.25",
    overflowWrap:"anywhere",pointerEvents:"none",zIndex:"42",boxShadow:"0 5px 18px rgba(0,0,0,.28)"});
  document.body.appendChild(bubble);avatar.messageBubble=bubble;avatar.messageExpiresAt=performance.now()+6000;
}

function createAvatar(sessionId: string, player: any) {
  const entity = new pc.Entity(`Player-${sessionId}`);
  entity.setPosition(player.x, player.y, player.z);
  const body=new pc.Entity(`AvatarBody-${sessionId}`);
  body.addComponent("render",{type:"sphere"});
  body.setLocalScale(.65,.65,.65);
  body.render!.material=avatarMaterial(sessionId);
  entity.addChild(body);

  const partsRoot=new pc.Entity(`AvatarParts-${sessionId}`);
  body.addChild(partsRoot);

  const forwardMarker = new pc.Entity(`Forward-${sessionId}`);
  forwardMarker.addComponent("render", { type: "box" });
  forwardMarker.setLocalScale(0.16, 0.16, 0.42);
  forwardMarker.setLocalPosition(0, 0, -0.42);
  forwardMarker.render!.material = material([1.0, 0.55, 0.15]);
  body.addChild(forwardMarker);

  const proximityHalo = new pc.Entity(`ProximityHalo-${sessionId}`);
  proximityHalo.addComponent("render", { type: "plane" });
  // A transparent VFX plane must neither cast nor receive world shadows. If it
  // does, its rectangular mesh can become visible even outside the round mask.
  proximityHalo.render!.castShadows=false;
  proximityHalo.render!.receiveShadows=false;
  proximityHalo.setLocalScale(1.5, 1, 1.5);
  proximityHalo.setLocalPosition(0, -0.63, 0);
  const initialHaloMaterial=material([1.0, 0.45, 0.08]);
  initialHaloMaterial.opacity=.55;initialHaloMaterial.blendType=pc.BLEND_NORMAL;
  initialHaloMaterial.depthWrite=false;initialHaloMaterial.update();
  proximityHalo.render!.material = initialHaloMaterial;
  proximityHalo.enabled = false;
  entity.addChild(proximityHalo);

  app.root.addChild(entity);
  const 名前ラベル = 名前ラベルを作成(player.name);
  avatars.set(sessionId, {
    entity,
    body,
    target: new pc.Vec3(player.x, player.y, player.z),
    name: player.name,
    名前ラベル,
    proximityHalo,
    forwardMarker,
    styleKey:"",
    textureRef:"",
    textureRequest:0,
    texture:null,
    textureURL:null,
    size:1,
    labelVisible:true,
    lastMotionPosition:new pc.Vec3(player.x,player.y,player.z),
    motionPhase:Math.random()*Math.PI*2,
    textureRepeat:1,
    textureRotation:0,
    baseScale:new pc.Vec3(.65,.65,.65),
    flying:player.avatarFlying===true,
    baseBodyY:0,
    partsRoot,
    partEntities:[],
    partMaterial:null,
    partType:"none",
    emoteType:"none",
    emoteStartedAt:0,
    haloColor:"#ff7828",
    haloOpacity:.55,
    haloSize:1.5,
    haloMotion:"pulse",
    haloSpeed:1,
    haloShape:"ring",
    haloGlow:.6,
    haloRings:1,
    haloTexture:null,
    heartColor:"#ff5f91",
    heartSize:1,
    heartCount:3,
    heartMotion:"float",
    heartSpeed:1,
    messageBubble:null,
    messageExpiresAt:0
  });
  applyAvatarStyle(avatars.get(sessionId)!,player.avatarColor,player.avatarAccent,
    player.avatarShape,player.avatarAssetRef,player.avatarSize,player.avatarLabelVisible,
    player.avatarLabelColor,player.avatarTextureRepeat,player.avatarTextureRotation,
    player.avatarPart,player.avatarPartColor,player.avatarHaloColor,player.avatarHaloOpacity,
    player.avatarHaloSize,player.avatarHaloMotion,player.avatarHaloSpeed,
    player.avatarHaloShape,player.avatarHaloGlow,player.avatarHaloRings);
  applyHeartStyle(avatars.get(sessionId)!,player.avatarHeartColor,player.avatarHeartSize,
    player.avatarHeartCount,player.avatarHeartMotion,player.avatarHeartSpeed);

  if (sessionId === currentSessionId) {
    localPosition.set(player.x, player.y, player.z);
  }
  updatePlayerCount();
}

function removeAvatar(sessionId: string) {
  const avatar = avatars.get(sessionId);
  if (!avatar) return;
  avatar.名前ラベル.remove();
  avatar.messageBubble?.remove();
  const bodyMaterial=avatar.body.render?.material;
  const markerMaterial=avatar.forwardMarker.render?.material;
  const haloMaterial=avatar.proximityHalo.render?.material;
  avatar.textureRequest++;
  avatar.entity.destroy();
  bodyMaterial?.destroy();markerMaterial?.destroy();haloMaterial?.destroy();
  avatar.partMaterial?.destroy();
  avatar.texture?.destroy();
  avatar.haloTexture?.destroy();
  if(avatar.textureURL) URL.revokeObjectURL(avatar.textureURL);
  avatars.delete(sessionId);
  for(const [key,effect] of Array.from(resonancePairs.entries()))
    if(effect.a===sessionId||effect.b===sessionId) destroyResonancePair(key);
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
  lastMediaId: "-", lastError: "-", actionRx: 0, connection: "CLOSED",
  transformRx: 0, transformApplied: 0, lastTransform: "-", moveCorrections: 0
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
    `SHARED STATE DIAGNOSTIC / 0.19.6\n` +
    `CONNECTION     ${sharedStateDiagnostic.connection}\n` +
    `SERVER MEDIA   ${sharedStateDiagnostic.serverMedia}\n` +
    `LOCAL MEDIA    ${sharedStateDiagnostic.localMedia}\n` +
    `ONADD          ${sharedStateDiagnostic.onAdd}\n` +
    `SNAPSHOT TX    ${sharedStateDiagnostic.snapshotTx}\n` +
    `SNAPSHOT RX    ${sharedStateDiagnostic.snapshotRx}\n` +
    `ACTION RX      ${sharedStateDiagnostic.actionRx}\n` +
    `TRANSFORM RX   ${sharedStateDiagnostic.transformRx}\n` +
    `APPLIED        ${sharedStateDiagnostic.transformApplied}\n` +
    `LAST POSITION  ${sharedStateDiagnostic.lastTransform}\n` +
    `MOVE FIXES     ${sharedStateDiagnostic.moveCorrections}\n` +
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
  // A live transform can arrive while the remote asset is being decoded.
  // Apply the newest such transform after its entity becomes available.
  const pending = pendingSharedMediaTransforms.get(mediaId);
  if (pending && sharedRemoteMediaIds.has(mediaId)) {
    updateSharedSpritePlaceholder(mediaId, pending);
    pendingSharedMediaTransforms.delete(mediaId);
  }
  const pendingBehavior=pendingSharedBehaviors.get(mediaId);
  if (pendingBehavior) applySharedBehavior(mediaId,pendingBehavior);
}

function reconcileWorldFromServerState() {
  if (!activeRoom) return;
  const playersMap:any=(activeRoom.state as any).players;
  playersMap?.forEach?.((player:any,sessionId:string)=>{
    const avatar=avatars.get(sessionId);
    if(avatar) applyAvatarStyle(avatar,player.avatarColor,player.avatarAccent,
      player.avatarShape,player.avatarAssetRef,player.avatarSize,player.avatarLabelVisible,
      player.avatarLabelColor,player.avatarTextureRepeat,player.avatarTextureRotation,
      player.avatarPart,player.avatarPartColor,player.avatarHaloColor,player.avatarHaloOpacity,
      player.avatarHaloSize,player.avatarHaloMotion,player.avatarHaloSpeed,
      player.avatarHaloShape,player.avatarHaloGlow,player.avatarHaloRings);
    if(avatar) applyHeartStyle(avatar,player.avatarHeartColor,player.avatarHeartSize,
      player.avatarHeartCount,player.avatarHeartMotion,player.avatarHeartSpeed);
    if(avatar) avatar.flying=player.avatarFlying===true;
  });
  const mediaMap: any = (activeRoom.state as any).mediaObjects;
  if (!mediaMap) return;

  const authoritativeIds = new Set<string>();
  try {
    mediaMap.forEach((media: any, mediaId: string) => {
      authoritativeIds.add(mediaId);
      if (!managedPlacedMedia.has(mediaId) && !sharedMediaLoadingIds.has(mediaId)) {
        console.log("[WORLD RECONCILE ADD]", mediaId, String(media?.type || ""));
        void ensureSharedMediaFromState(mediaId, media);
      } else if (managedPlacedMedia.has(mediaId)) {
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
      playback: ({
        play: () => { playing = true; },
        stop: () => { playing = false; },
        isPlaying: () => playing,
        setLoop: () => { /* Sprite loops by design. */ }
      } as any),
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
  if (!item || editingManagedMediaId === mediaId) return;
  const values = [media.x, media.y, media.z, media.rotationY, media.scale].map(Number);
  if (!values.every(Number.isFinite)) return;
  const [x, y, z, rotationY, scale] = values;
  const animation=activeTransformAnimations.get(mediaId);
  const basePosition=new pc.Vec3(x,y,z);
  const baseEuler=new pc.Vec3(item.kind==="glb"?0:90,rotationY,0);
  const baseScale=new pc.Vec3(scale,item.kind==="glb"?scale:1,scale);
  if (animation) {
    animation.basePosition=basePosition;
    animation.baseEuler=baseEuler;
    animation.baseScale=baseScale;
  } else {
    item.entity.setPosition(basePosition);
    item.entity.setLocalScale(baseScale);
    item.entity.setEulerAngles(baseEuler);
  }
  sharedStateDiagnostic.transformApplied += 1;
  sharedStateDiagnostic.lastTransform = `${mediaId.slice(-8)} X:${x.toFixed(1)} Y:${y.toFixed(1)} Z:${z.toFixed(1)}`;
  refreshSharedStateDiagnosticPanel();
}

const pendingSharedMediaTransforms = new Map<string, {x:number;y:number;z:number;rotationY:number;scale:number}>();
const pendingSharedBehaviors = new Map<string, any>();
const appliedSharedBehaviorSignatures = new Map<string,string>();
function applySharedBehavior(mediaId:string, behavior:any) {
  if (!behavior || typeof behavior !== "object") return;
  const object=xrMediaManager.get(mediaId);
  if (!object) { pendingSharedBehaviors.set(mediaId,behavior); return; }
  const signature=JSON.stringify(behavior);
  if (appliedSharedBehaviorSignatures.get(mediaId)===signature) return;
  appliedSharedBehaviorSignatures.set(mediaId,signature);
  object.behavior=[{id:"proximity-play",...behavior}];
  pendingSharedBehaviors.delete(mediaId);
  sharedProximityState.delete(mediaId);
  if (selectedManagedMediaId===mediaId) refreshBehaviorEditorUI();
}

function removeSharedMediaLifecycle(mediaId: string, reason = "server-remove") {
  pendingSharedMediaTransforms.delete(mediaId);
  pendingSharedBehaviors.delete(mediaId);
  appliedSharedBehaviorSignatures.delete(mediaId);
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
      playback: ({
        play: async () => { await video!.play(); },
        stop: () => { video!.pause(); },
        isPlaying: () => !!video && !video.paused && !video.ended,
        setLoop: (loop: boolean) => { video!.loop = loop; }
      } as any),
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
type AudioReactiveAction = "off" | "scale" | "shake" | "rotate";
type XRAudioConfig = { volume:number; loop:boolean; spatial:boolean; distance:number; reactive:AudioReactiveAction; strength:number; smoothing:number };
function audioConfigFromRef(ref:string):XRAudioConfig{
  try { const u=new URL(ref, window.location.href); const reactive=String(u.searchParams.get("reactive")||"off") as AudioReactiveAction; return { volume:Math.max(0,Math.min(1,Number(u.searchParams.get("volume")??.8))), loop:u.searchParams.get("loop")!=="0", spatial:u.searchParams.get("spatial")!=="0", distance:Math.max(2,Number(u.searchParams.get("distance")??12)), reactive:["scale","shake","rotate"].includes(reactive)?reactive:"off", strength:Math.max(.1,Math.min(3,Number(u.searchParams.get("strength")??1))), smoothing:Math.max(0,Math.min(.95,Number(u.searchParams.get("smoothing")??.7))) }; }
  catch { return {volume:.8,loop:true,spatial:true,distance:12,reactive:"off",strength:1,smoothing:.7}; }
}
function makeAudioMarker(name:string){
  const e=new pc.Entity(name); e.addComponent("render",{type:"sphere"}); e.setLocalScale(.34,.34,.34);
  const m=new pc.StandardMaterial(); m.diffuse=new pc.Color(.15,.55,1); m.emissive=new pc.Color(.03,.12,.3); m.update(); e.render!.material=m; app.root.addChild(e); return e;
}
function configureSpatialAudioElement(id:string, el:HTMLAudioElement, entity:pc.Entity, cfg:XRAudioConfig){
  el.loop=cfg.loop; el.volume=cfg.volume; el.preload="auto"; audioElements.set(id,el);
  (el as any).__xrSpatial=cfg.spatial; (el as any).__xrDistance=cfg.distance; (el as any).__xrEntity=entity; (el as any).__xrBaseVolume=cfg.volume;
  (el as any).__xrReactiveAction=cfg.reactive; (el as any).__xrReactiveStrength=cfg.strength; (el as any).__xrReactiveSmoothing=cfg.smoothing; (el as any).__xrReactiveLevel=0;
}
// Prototype 0.16.1.4: apply shared Audio settings directly to an existing runtime.
// This is used by both the live config event and the snapshot safety net so mobile
// clients never need to open EDIT and press APPLY themselves.
function applyLiveAudioConfig(mediaId:string, assetRef:string){
  const el=audioElements.get(mediaId); if(!el)return false;
  const cfg=audioConfigFromRef(assetRef); const a=el as any; const item=managedPlacedMedia.get(mediaId);
  a.__xrBaseVolume=cfg.volume; el.loop=cfg.loop; a.__xrSpatial=cfg.spatial; a.__xrDistance=cfg.distance;
  a.__xrReactiveAction=cfg.reactive; a.__xrReactiveStrength=cfg.strength; a.__xrReactiveSmoothing=cfg.smoothing;
  a.__xrReactiveRotation=0; a.__xrReactiveLevel=0;
  if(item?.entity){
    if(a.__xrReactiveBase){const b=a.__xrReactiveBase;item.entity.setPosition(b.position);item.entity.setEulerAngles(b.euler);item.entity.setLocalScale(b.scale);}
    a.__xrReactiveBase={position:item.entity.getPosition().clone(),euler:item.entity.getEulerAngles().clone(),scale:item.entity.getLocalScale().clone()};
  }
  el.volume=cfg.volume;
  console.log("[0.16.1.4 LIVE AUDIO CONFIG APPLIED]",mediaId,cfg); return true;
}
function ensureAudioAnalyser(el:HTMLAudioElement){
  const a=el as any; if(a.__xrAnalyser) return a.__xrAnalyser as AnalyserNode;
  try{
    const Ctx=(window.AudioContext || (window as any).webkitAudioContext); if(!Ctx)return null;
    const ctx:AudioContext=new Ctx(); const source=ctx.createMediaElementSource(el); const analyser=ctx.createAnalyser();
    // 0.16.1.2: one stable WebAudio graph for every reactive action.
    // SCALE / SHAKE / ROTATE only read analyser data; they never replace or disconnect the audible route.
    analyser.fftSize=256; analyser.smoothingTimeConstant=0; source.connect(analyser); analyser.connect(ctx.destination);
    a.__xrAudioContext=ctx; a.__xrAnalyser=analyser; a.__xrAnalyserData=new Uint8Array(analyser.fftSize); return analyser;
  }catch(e){console.warn("[AUDIO ANALYSER ERROR]",e);return null}
}
async function playXRAudio(el:HTMLAudioElement, mediaId:string){
  const analyser=ensureAudioAnalyser(el); const ctx=(el as any).__xrAudioContext as AudioContext|undefined;
  try{
    if(ctx?.state==="suspended") await ctx.resume();
    const a=el as any;
    // Restore the configured base volume before every PLAY. Spatial attenuation will
    // immediately refine it on the next frame. This prevents an old zero-volume
    // attenuation state from making a newly selected SHAKE / ROTATE action silent.
    el.volume=Math.max(0,Math.min(1,Number(a.__xrBaseVolume??el.volume??.8)));
    const entity=a.__xrEntity as pc.Entity|undefined;
    if(entity && !a.__xrReactiveBase) a.__xrReactiveBase={position:entity.getPosition().clone(),euler:entity.getEulerAngles().clone(),scale:entity.getLocalScale().clone()};
    await el.play();
    console.log("[AUDIO PLAY]",mediaId,{analyser:!!analyser,reactive:a.__xrReactiveAction,volume:el.volume});
  }catch(e){console.warn("[AUDIO PLAY BLOCKED]",e)}
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
    const remote=createMediaObject({title:media.title||"Audio",type:"audio" as any,entity,playable:true,animated:false,playback:{play:async()=>{await playXRAudio(el,mediaId)},stop:()=>{el.pause();el.currentTime=0},setLoop:(v:boolean)=>{el.loop=v}},behavior:[{id:"proximity-play",trigger:"user-proximity",distance:3,enterAction:"play",leaveAction:"stop",enabled:true}]});
    (remote as any).id=mediaId; xrMediaManager.register(remote as any); managedPlacedMedia.set(mediaId,{id:mediaId,title:`${media.title||"Audio"} [SHARED]`,kind:"audio",entity}); sharedRemoteMediaIds.add(mediaId);
    placedMediaRuntimes.push({id:mediaId,dispose:()=>{el.pause();audioElements.delete(mediaId);URL.revokeObjectURL(url);if(entity.parent)entity.destroy()}}); sharedMediaLoadingIds.delete(mediaId); refreshMediaManagerUI();
  }catch(e){sharedMediaLoadingIds.delete(mediaId);console.error("[SHARED AUDIO LOAD ERROR]",mediaId,e)}
}
async function publishCommittedAudioToSharedWorld(mediaId:string, blob:Blob|null, ext:"mp3"|"wav"){
  if(!activeRoom||!blob)return; const item=managedPlacedMedia.get(mediaId), media=xrMediaManager.get(mediaId); if(!item||!media)return;
  const cfg:XRAudioConfig={volume:Number(audioVolume.value),loop:audioLoop.checked,spatial:audioSpatial.checked,distance:Number(audioDistance.value),reactive:audioReactiveAction.value as AudioReactiveAction,strength:Number(audioReactiveStrength.value),smoothing:Number(audioReactiveSmoothing.value)};
  const base=sharedAssetURL(mediaId,ext); const up=await fetch(base,{method:"PUT",headers:{"Content-Type":ext==="mp3"?"audio/mpeg":"audio/wav"},body:blob}); if(!up.ok)throw new Error(`Audio upload HTTP ${up.status}`);
  const ref=`${base}?volume=${cfg.volume}&loop=${cfg.loop?1:0}&spatial=${cfg.spatial?1:0}&distance=${cfg.distance}&reactive=${cfg.reactive}&strength=${cfg.strength}&smoothing=${cfg.smoothing}`; const pos=item.entity.getPosition(), rot=item.entity.getEulerAngles(), sc=item.entity.getLocalScale();
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
      playback: clips.length ? ({
        play,
        stop,
        isPlaying: () => !!anim?.playing,
        setLoop: (v: boolean) => { loop = v; },
        getClips: () => clips.map((c: any) => c.displayName),
        playClip: (name: string) => {
          const i = clips.findIndex((c: any) => c.displayName === name);
          selected = i >= 0 ? i : 0;
          play();
        }
      } as any) : undefined,
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
  if(voiceEnabled)disableVoice(false);
  unlockResonanceAudio();
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
  setFlightMode(false);jumpRequested=false;
  uploadedPanoramaRef="";uploadedGroundRef="";
  applyWorldEnvironment(defaultWorldEnvironment);
  pendingMediaDeletes.clear();
  pendingWorldPackageExport = false;

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
    latestMoveAck=0;
    lastSentMove={x:NaN,y:NaN,z:NaN,rotationY:NaN,flying:false};
    room.onMessage("move:ack",(ack:any) => {
      const seq=Number(ack?.seq);
      if (!Number.isSafeInteger(seq) || seq<=latestMoveAck) return;
      latestMoveAck=seq;
      if (ack?.ok !== false) return;
      const x=Number(ack?.x),y=Number(ack?.y),z=Number(ack?.z);
      if (!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)) return;
      localPosition.x=x;
      localPosition.y=y;
      localPosition.z=z;
      verticalVelocity=0;
      avatars.get(currentSessionId)?.entity.setPosition(localPosition);
      lastSentMove={x:NaN,y:NaN,z:NaN,rotationY:NaN,flying:false};
      sharedStateDiagnostic.moveCorrections+=1;
      refreshSharedStateDiagnosticPanel();
      console.warn("[MOVE CORRECTED TO SERVER]",seq,x,z);
    });
    room.onMessage("avatar:style:applied",(payload:any)=>{
      if(room!==activeRoom) return;
      const avatar=avatars.get(String(payload?.sessionId||""));
      if(!avatar) return;
      applyAvatarStyle(avatar,payload.color,payload.accent,
        payload.shape,payload.assetRef,payload.size,payload.labelVisible,
        payload.labelColor,payload.textureRepeat,payload.textureRotation,
        payload.part,payload.partColor,payload.haloColor,payload.haloOpacity,
        payload.haloSize,payload.haloMotion,payload.haloSpeed,
        payload.haloShape,payload.haloGlow,payload.haloRings);
      applyHeartStyle(avatar,payload.heartColor,payload.heartSize,payload.heartCount,
        payload.heartMotion,payload.heartSpeed);
    });
    room.onMessage("avatar:emote",(payload:any)=>{
      if(room!==activeRoom) return;
      const avatar=avatars.get(String(payload?.sessionId||""));
      const type=String(payload?.type||"") as Avatar["emoteType"];
      if(!avatar || !["wave","joy","spin"].includes(type)) return;
      avatar.emoteType=type;avatar.emoteStartedAt=performance.now();
    });
    room.onMessage("avatar:message",(payload:any)=>{
      if(room!==activeRoom)return;
      const text=String(payload?.text||"").slice(0,48);
      if(text)showAvatarMessage(String(payload?.sessionId||""),text);
    });
    room.onMessage("voice:ready",(payload:any)=>{
      if(room!==activeRoom||!voiceEnabled)return;
      const sessionId=String(payload?.sessionId||"");if(sessionId)void ensureVoicePeer(sessionId,true);
    });
    room.onMessage("voice:signal",(payload:any)=>{if(room===activeRoom)void handleVoiceSignal(payload);});
    room.onMessage("voice:leave",(payload:any)=>{if(room===activeRoom)closeVoicePeer(String(payload?.sessionId||""));});
    sharedStateDiagnostic.connection = "OPEN";
    sharedStateDiagnostic.lastError = "-";
    refreshSharedStateDiagnosticPanel();

    const $ = getStateCallbacks(room);
    $(room.state).players.onAdd((player: any, sessionId: string) => {
      createAvatar(sessionId, player);
      if(sessionId===currentSessionId) void sendSavedAvatarStyle(true);
      $(player).onChange(() => {
        const avatar = avatars.get(sessionId);
        if (!avatar) return;
        avatar.target.set(player.x, player.y, player.z);
        avatar.name = player.name;
        avatar.名前ラベル.textContent = player.name;
        avatar.entity.setEulerAngles(0, player.rotationY ?? 0, 0);
        applyAvatarStyle(avatar,player.avatarColor,player.avatarAccent,
          player.avatarShape,player.avatarAssetRef,player.avatarSize,player.avatarLabelVisible,
          player.avatarLabelColor,player.avatarTextureRepeat,player.avatarTextureRotation,
          player.avatarPart,player.avatarPartColor,player.avatarHaloColor,player.avatarHaloOpacity,
          player.avatarHaloSize,player.avatarHaloMotion,player.avatarHaloSpeed,
          player.avatarHaloShape,player.avatarHaloGlow,player.avatarHaloRings);
        applyHeartStyle(avatar,player.avatarHeartColor,player.avatarHeartSize,
          player.avatarHeartCount,player.avatarHeartMotion,player.avatarHeartSpeed);
        avatar.flying=player.avatarFlying===true;
      });
    });

    $(room.state).players.onRemove((_player: any, sessionId: string) => {
      closeVoicePeer(sessionId);
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
        updateSharedSpritePlaceholder(mediaId, media);
        if (String(media?.type || "") === "audio") applyLiveAudioConfig(mediaId,String(media?.assetRef||""));
      });
    });

    sharedMedia.onRemove((_media: any, mediaId: string) => {
      console.log("[SHARED RECEIVE REMOVE]", mediaId);
      pendingSharedMediaTransforms.delete(mediaId);
      bumpSharedMediaGeneration(mediaId);
      sharedMediaLoadingIds.delete(mediaId);
      removeSharedSpritePlaceholder(mediaId);
      window.setTimeout(() => reconcileWorldFromServerState(), 80);
    });

    console.log("[SHARED RECEIVE LISTENER READY]");

    // Prototype 0.16.1.4 / LIVE AUDIO SETTINGS SYNC
    room.onMessage("media:config", (payload:any) => {
      const mediaId=String(payload?.id||""); const assetRef=String(payload?.assetRef||"");
      if(mediaId && assetRef) applyLiveAudioConfig(mediaId,assetRef);
    });

    room.onMessage("media:transform", (payload:any) => {
      const mediaId=String(payload?.id||"");
      if (!mediaId) return;
      sharedStateDiagnostic.transformRx += 1;
      refreshSharedStateDiagnosticPanel();
      const values=[payload?.x,payload?.y,payload?.z,payload?.rotationY,payload?.scale].map(Number);
      if (!values.every(Number.isFinite)) return;
      const [x,y,z,rotationY,scale]=values;
      const transform={x,y,z,rotationY,scale};
      if (managedPlacedMedia.has(mediaId)) updateSharedSpritePlaceholder(mediaId,transform);
      else pendingSharedMediaTransforms.set(mediaId,transform);
    });

    room.onMessage("media:delete:result", (payload:any) => {
      if (room !== activeRoom) return;
      const id = String(payload?.id || "");
      if (!pendingMediaDeletes.delete(id)) return;
      if (payload?.ok || payload?.reason === "media-not-found") {
        if (editingManagedMediaId === id) editingManagedMediaId = null;
        removeSharedMediaLifecycle(id, "delete-confirmed");
      } else {
        console.warn("[SHARED MEDIA DELETE REJECTED]", id, String(payload?.reason || "unknown"));
        window.alert("DELETE failed: you are not the owner of this artwork.");
      }
    });
    room.onMessage("media:update:result", (payload:any) => {
      if (payload?.ok) console.log("[MEDIA EDIT SYNC ACCEPTED]", String(payload.id || ""));
      else console.warn("[MEDIA EDIT SYNC REJECTED]", String(payload?.id || ""), String(payload?.reason || "unknown"));
    });
    room.onMessage("environment:state",(payload:any)=>{
      if (room===activeRoom) applyWorldEnvironment(payload);
    });
    room.send("environment:get",{});
    room.onMessage("world:export:result", (manifest:any) => {
      if (room === activeRoom && pendingWorldPackageExport) {
        pendingWorldPackageExport = false;
        void exportPortableWorld(manifest, room);
        return;
      }
      if (room !== activeRoom || manifest?.format !== "shared-world-manifest") return;
      const blob = new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"});
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `shared-world-${String(manifest.roomCode || "ART001")}-${Date.now()}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      worldManifestStatus.textContent = `${manifest.mediaObjects?.length || 0} objects exported. Asset files are not included.`;
    });
    room.onMessage("world:import:result", (result:any) => {
      if (room !== activeRoom) return;
      worldManifestStatus.textContent = result?.ok
        ? `${result.count} objects imported. Check that asset URLs are still available.`
        : `Import failed: ${String(result?.reason || "unknown")}`;
      if (result?.ok) room.send("media:snapshot:request", {});
    });
    room.onMessage("media:behavior", (payload:any) => {
      const id=String(payload?.id||"");
      if (id) applySharedBehavior(id,payload?.behavior);
    });

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
        if (media?.behavior) applySharedBehavior(mediaId,media.behavior);
        if (!managedPlacedMedia.has(mediaId) && !sharedMediaLoadingIds.has(mediaId)) {
          console.log("[0.15.1.2 SNAPSHOT RECOVER ADD]", mediaId, String(media?.type || ""));
          void ensureSharedMediaFromState(mediaId, media).catch(setSharedStateDiagnosticError);
        } else if (managedPlacedMedia.has(mediaId)) {
          updateSharedSpritePlaceholder(mediaId, media);
          if(String(media?.type||"")==="audio") applyLiveAudioConfig(mediaId,String(media?.assetRef||""));
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
    const receivedActionEventIds = new Set<number>();
    room.onMessage("media:action", (payload: any) => {
      const eventId=Number(payload?.eventId);
      if (Number.isSafeInteger(eventId) && eventId>0) {
        if (receivedActionEventIds.has(eventId)) return;
        receivedActionEventIds.add(eventId);
        if (receivedActionEventIds.size>256) {
          const oldest=receivedActionEventIds.values().next().value;
          if (oldest !== undefined) receivedActionEventIds.delete(oldest);
        }
      }
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
    }, 5000);

    roomLabel.textContent = `ROOM ${roomCode}`;
    status.textContent = "接続しました";
    lobby.classList.add("hidden");
    hud.classList.remove("hidden");
    avatarControls.style.display="block";
    flightControls.classList.add("room-active");
    emoteControls.classList.add("room-active");
    communicationControls.classList.add("room-active");
    mobileActionDock.classList.add("room-active");
    hud.querySelector<HTMLElement>(".controls")!.textContent=
      "WASD：移動 / SPACE：ジャンプ・上昇 / F：飛行 / SHIFT：下降";
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

// 0.17 / World manifest UI (server-authored export; additive import).
const worldManifestControls = document.createElement("div");
worldManifestControls.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:12px 0";
const worldExportButton = document.createElement("button");
worldExportButton.type = "button"; worldExportButton.textContent = "EXPORT WORLD JSON";
const worldImportButton = document.createElement("button");
worldImportButton.type = "button"; worldImportButton.textContent = "IMPORT WORLD JSON";
const worldImportInput = document.createElement("input");
worldImportInput.type = "file"; worldImportInput.accept = ".json,application/json";
worldImportInput.hidden = true;
const worldManifestStatus = document.createElement("div");
worldManifestStatus.style.cssText = "width:100%;font-size:11px;line-height:1.4;color:#c9d7e8";
worldManifestStatus.textContent = "JSON saves positions and behavior. Uploaded asset files are not included.";
worldManifestControls.append(worldExportButton,worldImportButton,worldImportInput,worldManifestStatus);
worldExportButton.addEventListener("click", () => {
  if (!activeRoom) { worldManifestStatus.textContent = "Connect to a room first."; return; }
  activeRoom.send("world:export",{});
});
worldImportButton.addEventListener("click", () => {
  if (!activeRoom) { worldManifestStatus.textContent = "Connect to a room first."; return; }
  worldImportInput.click();
});
worldImportInput.addEventListener("change", async () => {
  const file = worldImportInput.files?.[0]; worldImportInput.value = "";
  if (!file || !activeRoom) return;
  if (file.size > 256 * 1024) { worldManifestStatus.textContent = "JSON exceeds 256 KB."; return; }
  try {
    const manifest = JSON.parse(await file.text());
    if (manifest?.format !== "shared-world-manifest" || manifest?.version !== 1 || !Array.isArray(manifest.mediaObjects))
      throw new Error("Unsupported world manifest");
    worldManifestStatus.textContent = "Importing objects into the current room…";
    activeRoom.send("world:import", manifest);
  } catch (error) { worldManifestStatus.textContent = `Import failed: ${String(error)}`; }
});

// 0.17.3 / A portable ZIP stores real uploaded media alongside the manifest.
let pendingWorldPackageExport = false;
let worldPackageBusy = false;
const worldPackageExportButton = document.createElement("button");
worldPackageExportButton.type = "button";
worldPackageExportButton.textContent = "EXPORT WORLD + ASSETS ZIP";
const worldPackageImportButton = document.createElement("button");
worldPackageImportButton.type = "button";
worldPackageImportButton.textContent = "IMPORT WORLD ZIP";
const worldPackageInput = document.createElement("input");
worldPackageInput.type = "file";
worldPackageInput.accept = ".zip,application/zip";
worldPackageInput.hidden = true;
worldManifestControls.append(worldPackageExportButton,worldPackageImportButton,worldPackageInput);
const assetNamePattern = /^[a-zA-Z0-9_-]{1,80}\.(zip|glb|webm|mp3|wav)$/i;
function portableAssetName(value:unknown):string|null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url=new URL(value,SERVER_URL);
    if (url.origin !== new URL(SERVER_URL).origin || url.hash) return null;
    const match=/^\/assets\/([^/]+)$/.exec(url.pathname);
    if (!match) return null;
    const name=decodeURIComponent(match[1]);
    if (!assetNamePattern.test(name)) return null;
    if (url.search) {
      if (!/\.(mp3|wav)$/i.test(name)) return null;
      const allowed=new Set(["volume","loop","spatial","distance","reactive","strength","smoothing"]);
      let validSettings=true;
      url.searchParams.forEach((value,key)=>{
        if (!allowed.has(key) || value.length>32) validSettings=false;
      });
      if (!validSettings) return null;
    }
    return name;
  } catch { return null; }
}
async function exportPortableWorld(manifest:any, room:Room) {
  if (worldPackageBusy) return;
  worldPackageBusy = true;
  try {
    if (room !== activeRoom || manifest?.format !== "shared-world-manifest" ||
        manifest?.version !== 1 || !Array.isArray(manifest.mediaObjects)) throw new Error("Invalid world response");
    const zip=new JSZip();
    const names=new Set<string>();
    let total=0;
    for (const media of manifest.mediaObjects) {
      for (const field of ["assetRef","fallbackRef"] as const) {
        const ref=media?.[field];
        if (!ref) continue;
        const name=portableAssetName(ref);
        if (!name) throw new Error(`Unsupported asset URL: ${String(ref).slice(0,80)}`);
        if (names.has(name)) continue;
        names.add(name);
        worldManifestStatus.textContent=`Downloading asset ${names.size}: ${name}`;
        const response=await fetch(new URL(`/assets/${name}`,SERVER_URL),{cache:"no-store"});
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}. Export before the server restarts.`);
        const blob=await response.blob();
        if (!blob.size || blob.size>20*1024*1024) throw new Error(`${name}: invalid asset size`);
        total+=blob.size;
        if (total>80*1024*1024) throw new Error("Package exceeds 80 MB of media");
        zip.file(`assets/${name}`,blob);
      }
    }
    for (const field of ["skyAssetRef","groundAssetRef","particleAssetRef"] as const) {
      const ref=manifest.environment?.[field];
      if (!ref) continue;
      const name=portableAssetName(ref);
      if(!name || !name.endsWith(".zip")) throw new Error(`Invalid ${field} URL`);
      if(names.has(name)) continue;
      const response=await fetch(new URL(`/assets/${name}`,SERVER_URL),{cache:"no-store"});
      if(!response.ok) throw new Error(`${field}: HTTP ${response.status}`);
      const blob=await response.blob();
      if(!blob.size || blob.size>20*1024*1024 || total+blob.size>80*1024*1024)
        throw new Error(`${field} asset too large`);
      names.add(name);total+=blob.size;zip.file(`assets/${name}`,blob);
    }
    if (room !== activeRoom) throw new Error("Room changed during export");
    zip.file("world.json",JSON.stringify(manifest,null,2));
    worldManifestStatus.textContent="Compressing world ZIP…";
    const output=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:3}});
    const link=document.createElement("a");
    const url=URL.createObjectURL(output);
    link.href=url;
    link.download=`shared-world-${String(manifest.roomCode||"ART001")}-${Date.now()}.zip`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    worldManifestStatus.textContent=`World ZIP saved: ${manifest.mediaObjects.length} objects, ${names.size} files.`;
  } catch (error) { worldManifestStatus.textContent=`ZIP export failed: ${String(error)}`; }
  finally { worldPackageBusy=false; }
}
worldPackageExportButton.addEventListener("click",()=>{
  if (!activeRoom || worldPackageBusy || pendingWorldPackageExport) return;
  pendingWorldPackageExport=true;
  worldManifestStatus.textContent="Reading room state…";
  activeRoom.send("world:export",{});
});
worldPackageImportButton.addEventListener("click",()=>{
  if (!activeRoom || worldPackageBusy) return;
  worldPackageInput.click();
});
worldPackageInput.addEventListener("change",async()=>{
  const file=worldPackageInput.files?.[0]; worldPackageInput.value="";
  if (!file || !activeRoom || worldPackageBusy) return;
  worldPackageBusy=true;
  const room=activeRoom;
  try {
    if (file.size>90*1024*1024) throw new Error("ZIP exceeds 90 MB");
    const zip=await JSZip.loadAsync(file);
    if (Object.keys(zip.files).length>70) throw new Error("Too many ZIP entries");
    const manifestEntry=zip.file("world.json");
    if (!manifestEntry) throw new Error("Missing world.json");
    const json=await manifestEntry.async("string");
    if (json.length>256*1024) throw new Error("World JSON exceeds 256 KB");
    const manifest=JSON.parse(json);
    if (manifest?.format!=="shared-world-manifest" || manifest?.version!==1 ||
        !Array.isArray(manifest.mediaObjects) || manifest.mediaObjects.length>64)
      throw new Error("Unsupported world manifest");
    const uploaded=new Map<string,string>();
    let total=0;
    for (const media of manifest.mediaObjects) {
      if (!media || !["sprite","glb","webm","audio"].includes(media.type)) throw new Error("Invalid object type");
      for (const field of ["assetRef","fallbackRef"] as const) {
        const original=media[field];
        if (!original) continue;
        const name=portableAssetName(original);
        if (!name) throw new Error(`Unsupported asset URL in ${field}`);
        if (!uploaded.has(name)) {
          const entry=zip.file(`assets/${name}`);
          if (!entry) throw new Error(`Missing media in ZIP: ${name}`);
          const blob=await entry.async("blob");
          if (!blob.size || blob.size>20*1024*1024) throw new Error(`Invalid size: ${name}`);
          total+=blob.size;
          if (total>80*1024*1024) throw new Error("ZIP media exceeds 80 MB");
          const extension=name.split(".").pop()!.toLowerCase();
          const newName=`restore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}.${extension}`;
          const url=new URL(`/assets/${newName}`,SERVER_URL).href;
          worldManifestStatus.textContent=`Uploading ${uploaded.size+1}: ${name}`;
          const response=await fetch(url,{method:"PUT",body:blob});
          if (!response.ok) throw new Error(`Upload ${name}: HTTP ${response.status}`);
          uploaded.set(name,url);
        }
        const settings=new URL(original,SERVER_URL).search;
        media[field]=uploaded.get(name)!+settings;
      }
    }
    for (const field of ["skyAssetRef","groundAssetRef","particleAssetRef"] as const) {
      const ref=manifest.environment?.[field];
      if(!ref) continue;
      const name=portableAssetName(ref);
      if(!name || !name.endsWith(".zip")) throw new Error(`Invalid ${field} URL`);
      if(!uploaded.has(name)) {
        const entry=zip.file(`assets/${name}`);
        if(!entry) throw new Error(`${field} image missing from ZIP`);
        const blob=await entry.async("blob");
        if(!blob.size || blob.size>20*1024*1024 || total+blob.size>80*1024*1024)
          throw new Error(`${field} asset too large`);
        const url=sharedAssetURL(`${field}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,"zip");
        const response=await fetch(url,{method:"PUT",body:blob});
        if(!response.ok) throw new Error(`${field} upload HTTP ${response.status}`);
        uploaded.set(name,url);total+=blob.size;
      }
      manifest.environment[field]=uploaded.get(name);
    }
    if (room !== activeRoom) throw new Error("Room changed during import");
    worldManifestStatus.textContent="Restoring artwork and behavior…";
    room.send("world:import",manifest);
  } catch (error) { worldManifestStatus.textContent=`ZIP import failed: ${String(error)}`; }
  finally { worldPackageBusy=false; }
});

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
mediaManagerPanel.appendChild(worldManifestControls);

const environmentEditor=document.createElement("div");
environmentEditor.style.cssText="border:1px solid #54718c;border-radius:12px;padding:12px;margin:12px 0;color:#e7f3ff";
environmentEditor.innerHTML=`<strong>WORLD ENVIRONMENT</strong>
  <label style="display:block;font-size:12px;margin:9px 0">TIME PRESET
    <select data-env="environmentPreset"><option value="custom">CUSTOM</option><option value="morning">MORNING</option><option value="day">DAY</option><option value="sunset">SUNSET</option><option value="night">NIGHT</option></select>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">DAY / NIGHT CYCLE
    <input data-env="cycleEnabled" type="checkbox"> ON
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">CYCLE LENGTH (MINUTES)
    <input data-env="cycleMinutes" type="number" min="1" max="60" step="1" value="8">
  </label>
  <div style="font-size:11px;color:#aaccdf">The cycle controls sky and lighting; panorama is hidden while active.</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0;font-size:12px">
    <label>SKY <input data-env="sky" type="color"></label>
    <label>GROUND <input data-env="ground" type="color"></label>
    <label>GRID <input data-env="grid" type="color"></label>
    <label>LIGHT COLOR <input data-env="lightColor" type="color"></label>
    <label>GRID VISIBLE <input data-env="gridVisible" type="checkbox"></label>
    <label>AMBIENT <input data-env="ambient" type="range" min="0" max="1.5" step="0.05"></label>
    <label>SUNLIGHT <input data-env="sunlight" type="range" min="0" max="5" step="0.1"></label>
    <label>SUN ANGLE <input data-env="sunAngle" type="range" min="5" max="85" step="1"></label>
  </div>
  <label style="display:block;font-size:12px;margin:9px 0">SKY MODE
    <select data-env="skyMode"><option value="color">COLOR</option><option value="panorama">360 PANORAMA</option></select>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">360 IMAGE (2:1 JPG / PNG)
    <input data-panorama-file type="file" accept="image/jpeg,image/png">
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">GROUND SIZE
    <select data-env="groundSize"><option value="15">15 m</option><option value="60">60 m</option><option value="160">160 m</option></select>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">GROUND MODE
    <select data-env="groundMode"><option value="plain">PLAIN</option><option value="soil">SOIL</option><option value="water">WATER</option><option value="custom">CUSTOM IMAGE</option></select>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">GROUND IMAGE (JPG / PNG)
    <input data-ground-file type="file" accept="image/jpeg,image/png">
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">GROUND IMAGE REPEAT
    <input data-env="groundRepeat" type="range" min="0.2" max="10" step="0.1" value="1"> <span data-value="groundRepeat"></span>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">GROUND IMAGE ROTATION (DEGREES)
    <input data-env="groundRotation" type="range" min="0" max="360" step="1" value="0"> <span data-value="groundRotation"></span>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">FOG
    <input data-env="fogEnabled" type="checkbox"> ON
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">FOG COLOR
    <input data-env="fogColor" type="color" value="#b8cbd9">
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">FOG DENSITY
    <input data-env="fogDensity" type="range" min="0.05" max="1" step="0.05" value="0.75"> <span data-value="fogDensity"></span>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">FOG END DISTANCE (METERS)
    <input data-env="fogDistance" type="range" min="3" max="200" step="1" value="12"> <span data-value="fogDistance"></span>
  </label>
  <div style="font-size:11px;color:#aaccdf;margin:8px 0">Distant artworks and ground fade into fog. Try 8 m in a 15 m room. Nearby objects and empty sky stay clear.</div>
  <button type="button" data-fog-demo style="margin-bottom:8px">TRY VISIBLE FOG (8 m)</button>
  <label style="display:block;font-size:12px;margin:9px 0">PARTICLES
    <select data-env="particles"><option value="off">OFF</option><option value="spark">SPARKS</option><option value="smoke">SMOKE</option><option value="custom">CUSTOM IMAGE</option></select>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">PARTICLE COUNT
    <input data-env="particleCount" type="number" min="1" max="64" step="1" value="16">
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">DURATION (SECONDS, 0 = ALWAYS)
    <input data-env="particleDuration" type="number" min="0" max="300" step="1" value="0">
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">RANGE (METERS)
    <input data-env="particleRadius" type="range" min="1" max="20" step="1" value="5"> <span data-value="particleRadius"></span>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">SPEED
    <input data-env="particleSpeed" type="range" min="0.1" max="4" step="0.1" value="1"> <span data-value="particleSpeed"></span>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">SIZE
    <input data-env="particleSize" type="range" min="0.2" max="4" step="0.1" value="1"> <span data-value="particleSize"></span>
  </label>
  <label style="display:block;font-size:12px;margin:9px 0">SPARKS / CUSTOM COLOR
    <input data-env="particleColor" type="color" value="#ffbb55">
  </label>
  <div data-particle-color-status style="font-size:11px;color:#aaccdf;margin:8px 0"></div>
  <label style="display:block;font-size:12px;margin:9px 0">CUSTOM PARTICLE IMAGE (PNG)
    <input data-particle-file type="file" accept="image/png">
  </label>
  <div data-particle-status style="font-size:11px;color:#aaccdf;margin:8px 0"></div>
  <div data-ground-status style="font-size:11px;color:#aaccdf;margin:8px 0"></div>
  <div data-panorama-status style="font-size:11px;color:#aaccdf;margin:8px 0"></div>
  <button type="button" data-env-apply>APPLY TO ROOM</button>
  <div style="font-size:11px;margin-top:7px;color:#aaccdf">The same lighting is shared with all visitors.</div>`;
mediaManagerPanel.appendChild(environmentEditor);
let uploadedPanoramaRef="";
let uploadedGroundRef="";
let uploadedParticleRef="";
const customParticleInput=environmentEditor.querySelector<HTMLInputElement>("[data-particle-file]")!;
const customParticleStatus=environmentEditor.querySelector<HTMLElement>("[data-particle-status]")!;
customParticleInput.addEventListener("change",async()=>{
  const file=customParticleInput.files?.[0];customParticleInput.value="";
  if(!file || !activeRoom) return;
  if(file.type!=="image/png" || file.size>4*1024*1024) {
    customParticleStatus.textContent="Select a PNG image under 4 MB.";return;
  }
  try {
    const image=new Image();const local=URL.createObjectURL(file);
    try {image.src=local;await image.decode();}
    finally {URL.revokeObjectURL(local);}
    const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;
    const scale=Math.min(128/image.naturalWidth,128/image.naturalHeight);
    canvas.getContext("2d")!.drawImage(image,
      (128-image.naturalWidth*scale)/2,(128-image.naturalHeight*scale)/2,
      image.naturalWidth*scale,image.naturalHeight*scale);
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
      b=>b?resolve(b):reject(new Error("Image conversion failed")),"image/png"));
    const archive=new JSZip();archive.file("particle.png",png);
    const blob=await archive.generateAsync({type:"blob",compression:"STORE"});
    const ref=sharedAssetURL(`particle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,"zip");
    customParticleStatus.textContent="Uploading particle image…";
    const response=await fetch(ref,{method:"PUT",body:blob});
    if(!response.ok) throw new Error(`Upload HTTP ${response.status}`);
    uploadedParticleRef=ref;
    environmentEditor.querySelector<HTMLSelectElement>("[data-env=particles]")!.value="custom";
    customParticleStatus.textContent="128×128 PNG ready. Press APPLY TO ROOM.";
  } catch(error) {customParticleStatus.textContent=`Particle image error: ${String(error)}`;}
});
const customGroundInput=environmentEditor.querySelector<HTMLInputElement>("[data-ground-file]")!;
const customGroundStatus=environmentEditor.querySelector<HTMLElement>("[data-ground-status]")!;
customGroundInput.addEventListener("change",async()=>{
  const file=customGroundInput.files?.[0];customGroundInput.value="";
  if(!file || !activeRoom) return;
  if(file.size>12*1024*1024) {customGroundStatus.textContent="Image exceeds 12 MB";return;}
  try {
    const image=new Image();const local=URL.createObjectURL(file);
    try {image.src=local;await image.decode();}
    finally {URL.revokeObjectURL(local);}
    const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=1024;
    const side=Math.min(image.naturalWidth,image.naturalHeight);
    canvas.getContext("2d")!.drawImage(image,
      (image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,1024,1024);
    const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
      b=>b?resolve(b):reject(new Error("Image conversion failed")),"image/jpeg",.86));
    const archive=new JSZip();archive.file("ground.jpg",jpeg);
    const blob=await archive.generateAsync({type:"blob",compression:"STORE"});
    const ref=sharedAssetURL(`ground-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,"zip");
    customGroundStatus.textContent="Uploading ground image…";
    const response=await fetch(ref,{method:"PUT",body:blob});
    if(!response.ok) throw new Error(`Upload HTTP ${response.status}`);
    uploadedGroundRef=ref;
    environmentEditor.querySelector<HTMLSelectElement>("[data-env=groundMode]")!.value="custom";
    customGroundStatus.textContent=`${image.naturalWidth}×${image.naturalHeight} → 1024×1024 (${Math.round(jpeg.size/1024)} KB). Press APPLY TO ROOM.`;
  } catch(error) {customGroundStatus.textContent=`Ground image error: ${String(error)}`;}
});
const panoramaInput=environmentEditor.querySelector<HTMLInputElement>("[data-panorama-file]")!;
const panoramaStatus=environmentEditor.querySelector<HTMLElement>("[data-panorama-status]")!;
panoramaInput.addEventListener("change",async()=>{
  const file=panoramaInput.files?.[0];panoramaInput.value="";
  if(!file || !activeRoom) return;
  if(file.size>12*1024*1024) {panoramaStatus.textContent="Image exceeds 12 MB";return;}
  try {
    const img=new Image();
    const local=URL.createObjectURL(file);
    try {img.src=local;await img.decode();}
    finally {URL.revokeObjectURL(local);}
    if(img.width/img.height<1.85 || img.width/img.height>2.15)
      throw new Error("A 2:1 equirectangular image is required");
    const canvas=document.createElement("canvas");
    canvas.width=2048;canvas.height=1024;
    canvas.getContext("2d")!.drawImage(img,0,0,2048,1024);
    const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
      b=>b?resolve(b):reject(new Error("Image conversion failed")),"image/jpeg",.82));
    const archive=new JSZip();archive.file("panorama.jpg",jpeg);
    const blob=await archive.generateAsync({type:"blob",compression:"STORE"});
    const ref=sharedAssetURL(`sky-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,"zip");
    panoramaStatus.textContent="Uploading 360 image…";
    const response=await fetch(ref,{method:"PUT",body:blob});
    if(!response.ok) throw new Error(`Upload HTTP ${response.status}`);
    uploadedPanoramaRef=ref;
    environmentEditor.querySelector<HTMLSelectElement>("[data-env=skyMode]")!.value="panorama";
    panoramaStatus.textContent="Image ready. Press APPLY TO ROOM.";
  } catch(error) {panoramaStatus.textContent=`Panorama error: ${String(error)}`;}
});
function refreshEnvironmentEditor() {
  if (!environmentEditor) return;
  for (const [key,value] of Object.entries(currentWorldEnvironment)) {
    const input=environmentEditor.querySelector<HTMLInputElement>(`[data-env="${key}"]`);
    if (!input) continue;
    if (input.type==="checkbox") input.checked=Boolean(value);
    else input.value=String(value);
    const display=environmentEditor.querySelector<HTMLElement>(`[data-value="${key}"]`);
    if(display) display.textContent=String(value);
  }
  const colorStatus=environmentEditor.querySelector<HTMLElement>("[data-particle-color-status]")!;
  colorStatus.textContent=`ROOM COLOR: ${currentWorldEnvironment.particleColor.toUpperCase()} / ${currentWorldEnvironment.particles.toUpperCase()}`;
  colorStatus.style.borderLeft=`10px solid ${currentWorldEnvironment.particleColor}`;
  colorStatus.style.paddingLeft="7px";
}
refreshEnvironmentEditor();
environmentEditor.addEventListener("input",(event)=>{
  const input=event.target as HTMLInputElement;
  const key=input?.getAttribute?.("data-env");
  if(!key) return;
  const display=environmentEditor.querySelector<HTMLElement>(`[data-value="${key}"]`);
  if(display) display.textContent=input.value;
});
environmentEditor.querySelector<HTMLSelectElement>('[data-env="environmentPreset"]')!
  .addEventListener("change",(event)=>{
    const key=(event.target as HTMLSelectElement).value as keyof typeof timePresets;
    const preset=timePresets[key];
    if(!preset) return;
    for(const [field,value] of Object.entries(preset)) {
      const input=environmentEditor.querySelector<HTMLInputElement>(`[data-env="${field}"]`);
      if(input) input.value=String(value);
    }
    environmentEditor.querySelector<HTMLSelectElement>('[data-env="skyMode"]')!.value="color";
  });
environmentEditor.querySelector<HTMLButtonElement>("[data-env-apply]")!.addEventListener("click",()=>{
  if (!activeRoom) return;
  const payload:any={};
  for (const key of Object.keys(currentWorldEnvironment)) {
    const input=environmentEditor.querySelector<HTMLInputElement>(`[data-env="${key}"]`);
    if (!input) continue;
    payload[key]=input.type==="checkbox"?input.checked:
      input.type==="range" || key==="groundSize" ||
      key==="particleCount" || key==="particleDuration" ||
      key==="cycleMinutes"?Number(input.value):input.value;
  }
  payload.skyAssetRef=uploadedPanoramaRef || currentWorldEnvironment.skyAssetRef;
  payload.groundAssetRef=uploadedGroundRef || currentWorldEnvironment.groundAssetRef;
  payload.particleAssetRef=uploadedParticleRef || currentWorldEnvironment.particleAssetRef;
  if(payload.particles==="custom" && !payload.particleAssetRef) {
    customParticleStatus.textContent="Select a custom particle PNG first.";
    return;
  }
  if(payload.groundMode==="custom" && !payload.groundAssetRef) {
    customGroundStatus.textContent="Select a ground image first.";
    return;
  }
  if(payload.skyMode==="panorama" && !payload.skyAssetRef) {
    panoramaStatus.textContent="Select a 2:1 image first.";
    return;
  }
  environmentEditor.querySelector<HTMLElement>("[data-particle-color-status]")!.textContent=
    `SENDING: ${String(payload.particleColor).toUpperCase()} / ${String(payload.particles).toUpperCase()}`;
  activeRoom.send("environment:set",payload);
});
environmentEditor.querySelector<HTMLButtonElement>("[data-fog-demo]")!.addEventListener("click",()=>{
  environmentEditor.querySelector<HTMLInputElement>('[data-env="fogEnabled"]')!.checked=true;
  environmentEditor.querySelector<HTMLInputElement>('[data-env="fogColor"]')!.value="#b8cbd9";
  environmentEditor.querySelector<HTMLInputElement>('[data-env="fogDensity"]')!.value="0.85";
  environmentEditor.querySelector<HTMLInputElement>('[data-env="fogDistance"]')!.value="8";
  for(const key of ["fogDensity","fogDistance"]) {
    environmentEditor.querySelector<HTMLElement>(`[data-value="${key}"]`)!.textContent=
      environmentEditor.querySelector<HTMLInputElement>(`[data-env="${key}"]`)!.value;
  }
  environmentEditor.querySelector<HTMLButtonElement>("[data-env-apply]")!.click();
});

// Prototype 0.16.1.3 / MEDIA OBJECTS > EDIT / AUDIO SETTINGS + AUDIO REACTIVE
const managedAudioEditPanel = document.createElement("section");
managedAudioEditPanel.id = "managedAudioEditPanel";
managedAudioEditPanel.className = "hidden";
managedAudioEditPanel.innerHTML = `<div class="managed-audio-edit-title">AUDIO SETTINGS</div>
<label class="managed-audio-row"><span>Volume</span><input id="managedAudioVolume" type="range" min="0" max="1" step="0.05" value="0.8"></label>
<label class="managed-audio-check"><input id="managedAudioLoop" type="checkbox"> LOOP</label>
<label class="managed-audio-check"><input id="managedAudioSpatial" type="checkbox"> SPATIAL AUDIO <strong id="managedAudioSpatialState">ON</strong></label>
<label class="managed-audio-row"><span>Distance</span><input id="managedAudioDistance" type="range" min="2" max="30" step="1" value="12"></label>
<div class="managed-audio-reactive-title">AUDIO REACTIVE</div>
<label class="managed-audio-row"><span>Action</span><select id="managedAudioReactiveAction"><option value="off">OFF</option><option value="scale">SCALE</option><option value="shake">SHAKE</option><option value="rotate">ROTATE</option></select></label>
<label class="managed-audio-row"><span>Strength</span><input id="managedAudioReactiveStrength" type="range" min="0.1" max="3" step="0.1" value="1"></label>
<label class="managed-audio-row"><span>Smoothing</span><input id="managedAudioReactiveSmoothing" type="range" min="0" max="0.95" step="0.05" value="0.7"></label>
<div class="managed-audio-edit-actions"><button id="managedAudioApply" type="button">APPLY</button><button id="managedAudioCancel" type="button">CANCEL</button></div>`;
mediaManagerPanel.insertBefore(managedAudioEditPanel, mediaManagerList);
const managedAudioVolume=managedAudioEditPanel.querySelector<HTMLInputElement>("#managedAudioVolume")!;
const managedAudioLoop=managedAudioEditPanel.querySelector<HTMLInputElement>("#managedAudioLoop")!;
const managedAudioSpatial=managedAudioEditPanel.querySelector<HTMLInputElement>("#managedAudioSpatial")!;
const managedAudioSpatialState=managedAudioEditPanel.querySelector<HTMLElement>("#managedAudioSpatialState")!;
const managedAudioDistance=managedAudioEditPanel.querySelector<HTMLInputElement>("#managedAudioDistance")!;
const managedAudioReactiveAction=managedAudioEditPanel.querySelector<HTMLSelectElement>("#managedAudioReactiveAction")!;
const managedAudioReactiveStrength=managedAudioEditPanel.querySelector<HTMLInputElement>("#managedAudioReactiveStrength")!;
const managedAudioReactiveSmoothing=managedAudioEditPanel.querySelector<HTMLInputElement>("#managedAudioReactiveSmoothing")!;
const managedAudioApply=managedAudioEditPanel.querySelector<HTMLButtonElement>("#managedAudioApply")!;
const managedAudioCancel=managedAudioEditPanel.querySelector<HTMLButtonElement>("#managedAudioCancel")!;
function refreshManagedAudioSpatialUI(){managedAudioSpatialState.textContent=managedAudioSpatial.checked?"ON":"OFF";managedAudioDistance.disabled=!managedAudioSpatial.checked;managedAudioDistance.style.opacity=managedAudioSpatial.checked?"1":".4";}
managedAudioSpatial.addEventListener("change",refreshManagedAudioSpatialUI);
function currentAudioAssetRef(id:string){const map:any=getAuthoritativeMediaMap();try{return String(map?.get?.(id)?.assetRef||"");}catch{return "";}}
function openManagedAudioEditor(id:string){const el=audioElements.get(id);if(!el)return;const a=el as any;managedAudioVolume.value=String(Number(a.__xrBaseVolume??.8));managedAudioLoop.checked=!!el.loop;managedAudioSpatial.checked=!!a.__xrSpatial;managedAudioDistance.value=String(Number(a.__xrDistance??12));managedAudioReactiveAction.value=String(a.__xrReactiveAction||"off");managedAudioReactiveStrength.value=String(Number(a.__xrReactiveStrength??1));managedAudioReactiveSmoothing.value=String(Number(a.__xrReactiveSmoothing??.7));refreshManagedAudioSpatialUI();managedAudioEditPanel.classList.remove("hidden");managedAudioEditPanel.scrollIntoView({block:"start",behavior:"smooth"});}
function applyManagedAudioConfig(id:string){const el=audioElements.get(id);const item=managedPlacedMedia.get(id);if(!el||!item)return;const a=el as any;a.__xrBaseVolume=Number(managedAudioVolume.value);el.loop=managedAudioLoop.checked;a.__xrSpatial=managedAudioSpatial.checked;a.__xrDistance=Number(managedAudioDistance.value);a.__xrReactiveAction=managedAudioReactiveAction.value as AudioReactiveAction;a.__xrReactiveStrength=Number(managedAudioReactiveStrength.value);a.__xrReactiveSmoothing=Number(managedAudioReactiveSmoothing.value);a.__xrReactiveRotation=0;a.__xrReactiveLevel=0;if(a.__xrReactiveBase){const b=a.__xrReactiveBase;item.entity.setPosition(b.position);item.entity.setEulerAngles(b.euler);item.entity.setLocalScale(b.scale);}a.__xrReactiveBase={position:item.entity.getPosition().clone(),euler:item.entity.getEulerAngles().clone(),scale:item.entity.getLocalScale().clone()};el.volume=Number(managedAudioVolume.value);const oldRef=currentAudioAssetRef(id);if(activeRoom&&oldRef){const u=new URL(oldRef,window.location.href);u.searchParams.set("volume",managedAudioVolume.value);u.searchParams.set("loop",managedAudioLoop.checked?"1":"0");u.searchParams.set("spatial",managedAudioSpatial.checked?"1":"0");u.searchParams.set("distance",managedAudioDistance.value);u.searchParams.set("reactive",managedAudioReactiveAction.value);u.searchParams.set("strength",managedAudioReactiveStrength.value);u.searchParams.set("smoothing",managedAudioReactiveSmoothing.value);const p=item.entity.getPosition(),r=item.entity.getEulerAngles(),sc=item.entity.getLocalScale();activeRoom.send("media:update",{id,x:p.x,y:p.y,z:p.z,rotationY:r.y,scale:sc.x,assetRef:u.toString()});}managedAudioEditPanel.classList.add("hidden");console.log("[0.16.1.3 AUDIO CONFIG APPLIED]",id);}
managedAudioApply.addEventListener("click",()=>{if(selectedManagedMediaId)applyManagedAudioConfig(selectedManagedMediaId);});
managedAudioCancel.addEventListener("click",()=>managedAudioEditPanel.classList.add("hidden"));

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
  #managedAudioEditPanel { margin:0 0 12px; padding:12px; border:1px solid #2f8cff; border-radius:12px; background:#0d1724; }
  #managedAudioEditPanel.hidden { display:none; }
  .managed-audio-edit-title,.managed-audio-reactive-title { font-size:11px; font-weight:900; letter-spacing:.1em; margin-bottom:8px; }
  .managed-audio-reactive-title { margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,.15); font-size:10px; opacity:.8; }
  .managed-audio-row { display:grid; grid-template-columns:82px 1fr; gap:8px; align-items:center; margin:8px 0; font-size:11px; }
  .managed-audio-check { display:flex; gap:8px; align-items:center; margin:8px 0; font-size:11px; }
  #managedAudioSpatialState { margin-left:auto; }
  .managed-audio-edit-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
  .managed-audio-edit-actions button { width:100% !important; min-height:42px; }
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
  if (activeRoom && selectedManagedMediaId) {
    activeRoom.send("media:behavior", {id:selectedManagedMediaId,behavior:{
      trigger:behavior.trigger, distance:behavior.distance, lookAngle:(behavior as any).lookAngle,
      touchMode:(behavior as any).touchMode, enterAction:behavior.enterAction,
      leaveAction:behavior.leaveAction, enabled:behavior.enabled,
      transformAmount:(behavior as any).transformAmount,transformSpeed:(behavior as any).transformSpeed,
      transformAxis:(behavior as any).transformAxis,transformDuration:(behavior as any).transformDuration
    }});
  }
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
  if (!item) return;
  // Recovered objects are marked remote even on their original author's device.
  // The server checks the persistent ownerClientId before accepting this update.
  const p=item.entity.getPosition(), r=item.entity.getEulerAngles(), s=item.entity.getLocalScale();
  activeRoom.send("media:update",{id,x:p.x,y:p.y,z:p.z,rotationY:r.y,scale:s.x});
  console.log("[SHARED MEDIA UPDATE SENT]",id);
}

let pendingMediaTransformTimer: number | undefined;
function scheduleSharedMediaTransform() {
  if (!editingManagedMediaId || !activeRoom) return;
  if (pendingMediaTransformTimer !== undefined) return;
  pendingMediaTransformTimer=window.setTimeout(() => {
    pendingMediaTransformTimer=undefined;
    if (editingManagedMediaId) sendSharedMediaTransform(editingManagedMediaId);
  }, 40);
}

function flushSharedMediaTransform(id: string) {
  if (pendingMediaTransformTimer !== undefined) {
    window.clearTimeout(pendingMediaTransformTimer);
    pendingMediaTransformTimer=undefined;
  }
  sendSharedMediaTransform(id);
}

const pendingMediaDeletes = new Set<string>();
function deleteManagedMedia(id: string) {
  const item = managedPlacedMedia.get(id);
  if (!item || pendingMediaDeletes.has(id)) return;
  // Shared objects, including imported objects, must be removed by the server.
  // Keep the artwork visible until the server confirms the deletion.
  if (activeRoom && authoritativeMediaExists(id)) {
    pendingMediaDeletes.add(id);
    activeRoom.send("media:delete", {id});
    console.log("[SHARED MEDIA DELETE SENT]", id);
    return;
  }

  // Prototype 0.16.1.1 / AUDIO DELETE LIFECYCLE FIX
  // Use the same authoritative cleanup path for every media type. Audio Reactive
  // adds a live analyser/update loop, so the old delete path could leave the
  // audio runtime/entity alive after DELETE. Stop and detach the audio first,
  // notify the server, then perform one idempotent lifecycle cleanup.
  if (item.kind === "audio") {
    const el = audioElements.get(id);
    if (el) {
      try { el.pause(); el.currentTime = 0; } catch {}
      const a = el as any;
      try { a.__xrAudioContext?.close?.(); } catch {}
      a.__xrAnalyser = null;
      a.__xrAnalyserData = null;
      a.__xrReactiveBase = null;
      a.__xrReactiveLevel = 0;
      audioElements.delete(id);
    }
  }

  if (editingManagedMediaId === id) editingManagedMediaId = null;
  removeSharedMediaLifecycle(id, "local-delete");
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

  if (item.kind === "audio") {
    editingManagedMediaId = item.id;
    openManagedAudioEditor(item.id);
    return;
  }

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
        isPlaying: () => playing,
        setLoop: () => { /* Sprite currently loops by design. */ }
      } as any;
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
        isPlaying: () => !!modelEntity?.anim?.playing,
        setLoop: (nextLoop: boolean) => {
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
        playClip: (name: string) => {
          const index = clips.findIndex((clip) => clip.displayName === name);
          if (index < 0) return;
          selectedIndex = index;
          playCommittedGLB();
        }
      } as any;
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
    playback: ({
      play: () => { importedSpritePlaying = true; },
      stop: () => { importedSpritePlaying = false; },
      isPlaying: () => importedSpritePlaying,
      setLoop: () => { /* Sprite currently loops by design. */ }
    } as any),
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
    playback: ({
      play: async () => { await video.play(); },
      stop: () => { video.pause(); },
      isPlaying: () => !video.paused && !video.ended,
      setLoop: (loop: boolean) => { video.loop = loop; }
    } as any),
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
  scheduleSharedMediaTransform();
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
    flushSharedMediaTransform(editedId);
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
    flushSharedMediaTransform(editingManagedMediaId);
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
  configureSpatialAudioElement("preview-audio",el,entity,{volume:Number(audioVolume.value),loop:audioLoop.checked,spatial:audioSpatial.checked,distance:Number(audioDistance.value),reactive:audioReactiveAction.value as AudioReactiveAction,strength:Number(audioReactiveStrength.value),smoothing:Number(audioReactiveSmoothing.value)});
  const media=xrMediaManager.register(createMediaObject({title:file.name,type:"audio" as any,entity,playable:true,animated:false,playback:{play:async()=>{el.volume=Number(audioVolume.value);el.loop=audioLoop.checked;await playXRAudio(el,"preview-audio")},stop:()=>{el.pause();el.currentTime=0},setLoop:(v:boolean)=>{el.loop=v}},behavior:[{id:"proximity-play",trigger:"user-proximity",distance:3,enterAction:"play",leaveAction:"stop",enabled:true}]})); activeXRMediaId=media.id;
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
      // Resume a previously stopped animation on Enter transform, without
      // restarting playback that is already running.
      if (["glb","sprite","webm"].includes(String(object?.type)) &&
          object.playback?.isPlaying?.() === false) {
        try {
          const result=object.playback.play();
          if (result && typeof result.catch === "function")
            result.catch((error:unknown) => console.warn("[MEDIA PLAYBACK RESUME FAILED]", object.id,error));
          console.log("[MEDIA ANIMATION RESUMED WITH TRANSFORM]", object.id, object.type, actionId);
        } catch(error) { console.warn("[MEDIA PLAYBACK RESUME FAILED]", object.id,error); }
      }
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
  // Other triggers execute locally; proximity actions use the shared occupancy
  // decision so one player's exit cannot stop another player's animation.
  // Proximity PLAY/STOP is decided from all connected players on the server.
  // A local leave must not stop a Sprite while another player remains nearby.
  if (!activeRoom || !source.startsWith("user-proximity-"))
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

    // Transform Actions animate the visible entity. Evaluate proximity against
    // its committed position so FLOAT/MOVE/SHAKE cannot trigger a false exit.
    const p = activeTransformAnimations.get(String(object.id))?.basePosition
      ?? object.entity.getPosition();
    const dx = p.x - localPosition.x;
    const dy = p.y - localPosition.y;
    const dz = p.z - localPosition.z;
    const distance = Math.hypot(dx, dy, dz);
    const threshold = Math.max(0.1, Number(behavior.distance ?? 3));
    const previous = sharedProximityState.get(object.id);
    // A small exit margin also prevents repeated enter/leave at the boundary
    // while mobile position updates settle.
    const isInside = distance <= threshold + (previous === true ? 0.25 : 0);

    if (object.id === selectedManagedMediaId) {
      behaviorStatus.textContent = isInside ? "PROXIMITY / ACTIVE" : "PROXIMITY / OUTSIDE";
    }

    if (previous === undefined) {
      sharedProximityState.set(object.id, isInside);
      continue;
    }

    if (isInside !== previous) {
      sharedProximityState.set(object.id, isInside);
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
  // Prototype 0.16.1.2 / AUDIO REACTIVE PLAYBACK + DEFAULT ENABLED FIX: analyser level -> SCALE / SHAKE / ROTATE.
  // Analysis is local on every client, so shared audio remains synchronized without flooding the network with per-frame messages.
  for (const el of audioElements.values()) {
    const a=el as any; const entity=a.__xrEntity as pc.Entity|undefined; const analyser=a.__xrAnalyser as AnalyserNode|undefined;
    if(entity && analyser && !el.paused && a.__xrReactiveAction && a.__xrReactiveAction!=="off"){
      const data=a.__xrAnalyserData as Uint8Array; analyser.getByteTimeDomainData(data); let sum=0; for(let i=0;i<data.length;i++){const v=(data[i]-128)/128;sum+=v*v}
      const raw=Math.min(1,Math.sqrt(sum/data.length)*3.2); const sm=Number(a.__xrReactiveSmoothing??.7); const level=(Number(a.__xrReactiveLevel)||0)*sm+raw*(1-sm); a.__xrReactiveLevel=level;
      const strength=Number(a.__xrReactiveStrength??1); const base=a.__xrReactiveBase || {position:entity.getPosition().clone(),euler:entity.getEulerAngles().clone(),scale:entity.getLocalScale().clone()}; a.__xrReactiveBase=base;
      // 0.16.1.2: every action starts from the same committed transform. This keeps
      // switching SCALE -> SHAKE -> ROTATE independent and never touches audio playback.
      entity.setPosition(base.position); entity.setEulerAngles(base.euler); entity.setLocalScale(base.scale);
      if(a.__xrReactiveAction==="scale"){const f=1+level*strength;entity.setLocalScale(base.scale.x*f,base.scale.y*f,base.scale.z*f)}
      else if(a.__xrReactiveAction==="rotate"){const speedDeg=level*strength*180; a.__xrReactiveRotation=(Number(a.__xrReactiveRotation)||0)+speedDeg*dt; const r=base.euler.clone(); r.y=(r.y+a.__xrReactiveRotation)%360; entity.setEulerAngles(r)}
      else if(a.__xrReactiveAction==="shake"){const p=base.position.clone();const q=level*strength*.18;p.x+=Math.sin(performance.now()*.041)*q;p.y+=Math.sin(performance.now()*.053+1)*q;p.z+=Math.sin(performance.now()*.047+2)*q;entity.setPosition(p)}
    }
    if(entity && (el.paused || !a.__xrReactiveAction || a.__xrReactiveAction==="off") && a.__xrReactiveBase){const b=a.__xrReactiveBase;entity.setPosition(b.position);entity.setEulerAngles(b.euler);entity.setLocalScale(b.scale);if(el.paused)a.__xrReactiveLevel=0}
  }

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
    selfAvatar.entity.enabled = photoCameraMode!=="normal" || !firstPersonMode;
    selfAvatar.名前ラベル.style.display = firstPersonMode || !selfAvatar.labelVisible ? "none" : "";
  }

  const yawRad = cameraYaw * pc.math.DEG_TO_RAD;
  const pitchRad = cameraPitch * pc.math.DEG_TO_RAD;
  const horizontalDistance = Math.cos(pitchRad) * cameraDistance;

  const cameraX = cameraTarget.x + Math.sin(yawRad) * horizontalDistance;
  const cameraY = cameraTarget.y - Math.sin(pitchRad) * cameraDistance;
  const cameraZ = cameraTarget.z + Math.cos(yawRad) * horizontalDistance;

  if(photoCameraMode==="selfie"&&selfAvatar) {
    const avatarPosition=selfAvatar.entity.getPosition();
    const facing=selfAvatar.entity.getEulerAngles().y*pc.math.DEG_TO_RAD;
    const forwardX=-Math.sin(facing),forwardZ=-Math.cos(facing);
    camera.setPosition(avatarPosition.x+forwardX*3.2,avatarPosition.y+1.25,avatarPosition.z+forwardZ*3.2);
    camera.lookAt(avatarPosition.x,avatarPosition.y+.25,avatarPosition.z);
  } else if(photoCameraMode==="group"&&avatars.size) {
    const positions=Array.from(avatars.values()).map(avatar=>avatar.entity.getPosition());
    const groupCenter=new pc.Vec3();for(const position of positions)groupCenter.add(position);
    groupCenter.mulScalar(1/positions.length);
    let radius=1.5;
    for(const position of positions)radius=Math.max(radius,
      Math.hypot(position.x-groupCenter.x,position.z-groupCenter.z),Math.abs(position.y-groupCenter.y)*1.2);
    const groupDistance=Math.max(7,radius*2.7+4);
    const viewX=Math.sin(yawRad),viewZ=Math.cos(yawRad);
    camera.setPosition(groupCenter.x+viewX*groupDistance,groupCenter.y+Math.max(4,radius*.85+2.5),groupCenter.z+viewZ*groupDistance);
    camera.lookAt(groupCenter.x,groupCenter.y+.35,groupCenter.z);
  } else if (firstPersonMode) {
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

  // Visual-only presence animation. The root position remains authoritative,
  // so proximity and network coordinates are not changed by breathing or bobbing.
  for(const [sessionId,avatar] of avatars) {
    const position=avatar.entity.getPosition();
    const dx=position.x-avatar.lastMotionPosition.x;
    const dz=position.z-avatar.lastMotionPosition.z;
    const speed=Math.hypot(dx,dz)/Math.max(dt,.001);
    const moving=speed>.08;
    const airborne=position.y>.72;
    const avatarFlying=sessionId===currentSessionId?flying:avatar.flying;
    avatar.motionPhase+=dt*(moving?9:2.2);
    const breath=1+Math.sin(avatar.motionPhase)*.018;
    const bob=moving&&!airborne?Math.abs(Math.sin(avatar.motionPhase))*.055:0;
    const emoteDuration=avatar.emoteType==="wave"?1.4:avatar.emoteType==="joy"?1.05:1.15;
    let emoteProgress=(performance.now()-avatar.emoteStartedAt)/(emoteDuration*1000);
    if(avatar.emoteType!=="none" && emoteProgress>=1) {
      avatar.emoteType="none";emoteProgress=0;
    }
    const emote=avatar.emoteType;
    const joyLift=emote==="joy"?Math.sin(emoteProgress*Math.PI)*.32:0;
    const joyScale=emote==="joy"?1+Math.sin(emoteProgress*Math.PI)*.18:1;
    avatar.body.setLocalPosition(0,avatar.baseBodyY+bob+joyLift,0);
    avatar.body.setLocalScale(
      avatar.baseScale.x*breath*joyScale,
      avatar.baseScale.y*(1+Math.sin(avatar.motionPhase)*.025)*joyScale,
      avatar.baseScale.z*breath*joyScale
    );
    const spinY=emote==="spin"?emoteProgress*360:0;
    const waveLean=emote==="wave"?Math.sin(emoteProgress*Math.PI*6)*5:0;
    avatar.body.setLocalEulerAngles(avatarFlying?-18:(airborne?-8:0),spinY,
      (moving&&!airborne?Math.sin(avatar.motionPhase)*4:0)+waveLean);
    for(const part of avatar.partEntities) {
      if(part.name==="AvatarArmLeft") part.setLocalEulerAngles(0,0,-12);
      else if(part.name==="AvatarArmRight") part.setLocalEulerAngles(0,0,
        emote==="wave"?25+Math.sin(emoteProgress*Math.PI*8)*45:12);
      else if(part.name==="AvatarWingLeft") part.setLocalEulerAngles(0,-18,
        -25-(avatarFlying||emote==="joy"?Math.sin(avatar.motionPhase*1.8)*18:0));
      else if(part.name==="AvatarWingRight") part.setLocalEulerAngles(0,18,
        25+(avatarFlying||emote==="joy"?Math.sin(avatar.motionPhase*1.8)*18:0));
      else if(part.name==="AvatarAntennaStem") part.setLocalEulerAngles(0,0,
        Math.sin(avatar.motionPhase)*4);
      else if(part.name==="AvatarAntennaTip") part.setLocalPosition(
        Math.sin(avatar.motionPhase)*.07,1.5,0);
    }
    avatar.lastMotionPosition.copy(position);
    if(sessionId!==currentSessionId)
      avatar.名前ラベル.style.display=avatar.labelVisible?"":"none";
  }

  for (const avatar of avatars.values()) {
    const worldPos = avatar.entity.getPosition().clone();
    worldPos.y += 0.65*avatar.size;
    const screenPos = camera.camera!.worldToScreen(worldPos);
    avatar.名前ラベル.style.left = `${screenPos.x}px`;
    avatar.名前ラベル.style.top = `${screenPos.y}px`;
    if(avatar.messageBubble) {
      if(performance.now()>=avatar.messageExpiresAt) {
        avatar.messageBubble.remove();avatar.messageBubble=null;
      } else {
        avatar.messageBubble.style.left=`${screenPos.x}px`;
        avatar.messageBubble.style.top=`${screenPos.y-36}px`;
      }
    }
  }

  // Local analysis of each received WebRTC stream drives presence feedback;
  // no audio levels are transmitted through the room server.
  for(const [sessionId,avatar] of avatars) {
    const runtime=voiceAnalysers.get(sessionId);let level=0;
    if(runtime) {
      runtime.analyser.getByteTimeDomainData(runtime.data as any);
      let sum=0;for(const sample of runtime.data){const value=(sample-128)/128;sum+=value*value;}
      level=Math.min(1,Math.sqrt(sum/runtime.data.length)*4.5);
    }
    const speaking=level>.075;
    avatar.名前ラベル.style.boxShadow=speaking?`0 0 ${12+level*22}px rgba(82,215,255,.95)`:"none";
    avatar.名前ラベル.style.border=speaking?"1px solid rgba(82,215,255,.95)":"1px solid transparent";
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
      const elapsed=performance.now()*.001*avatar.haloSpeed;
      const haloScale = avatar.haloSize + proximity * avatar.haloSize * .35;
      const pulse = avatar.haloMotion==="pulse"?1+Math.sin(elapsed*6)*.1:1;
      const ripple=avatar.haloShape==="ripple"?1+(elapsed%1)*.14:1;
      const pulsedScale = haloScale * pulse * ripple;
      avatar.proximityHalo.setLocalScale(pulsedScale, 1, pulsedScale);
      if(avatar.haloMotion==="orbit")
        avatar.proximityHalo.setLocalPosition(Math.cos(elapsed*2)*.32,-.63,Math.sin(elapsed*2)*.32);
      else if(avatar.haloMotion==="float")
        avatar.proximityHalo.setLocalPosition(0,-.63+Math.sin(elapsed*3)*.18,0);
      else avatar.proximityHalo.setLocalPosition(0,-.63,0);
    }
  }

  // 0.19.7 / AVATAR RESONANCE
  // Pair state is derived from already synchronized avatar state, so every
  // client reconstructs the same interaction without adding per-frame network
  // traffic or changing the proven media-proximity path.
  const activeResonanceKeys=new Set<string>();
  const avatarEntries=Array.from(avatars.entries()).sort(([a],[b])=>a.localeCompare(b));
  for(let first=0;first<avatarEntries.length;first++) {
    for(let second=first+1;second<avatarEntries.length;second++) {
      const [firstId,firstAvatar]=avatarEntries[first];
      const [secondId,secondAvatar]=avatarEntries[second];
      const firstPosition=firstAvatar.entity.getPosition();
      const secondPosition=secondAvatar.entity.getPosition();
      const horizontalDistance=Math.hypot(firstPosition.x-secondPosition.x,firstPosition.z-secondPosition.z);
      if(horizontalDistance>PROXIMITY_DISTANCE) continue;
      const key=`${firstId}::${secondId}`;activeResonanceKeys.add(key);
      const effect=resonancePairs.get(key)||createResonancePair(firstId,secondId);
      if(!effect)continue;
      const midpoint=new pc.Vec3(
        (firstPosition.x+secondPosition.x)*.5,
        (firstPosition.y+secondPosition.y)*.5+.12,
        (firstPosition.z+secondPosition.z)*.5
      );
      effect.root.setPosition(midpoint);
      const distance=Math.max(.05,firstPosition.distance(secondPosition));
      effect.link.setPosition(midpoint);
      effect.link.lookAt(secondPosition);
      effect.link.setLocalScale(.025,.025,distance);
      const mixed=blendedHaloColor(firstAvatar,secondAvatar);
      effect.ringMaterial.diffuse.copy(mixed);
      effect.ringMaterial.emissive.set(mixed.r*1.25,mixed.g*1.25,mixed.b*1.25);
      effect.ringMaterial.update();
      const age=(performance.now()-effect.enteredAt)*.001;
      for(let index=0;index<effect.hearts.length;index++) {
        const heart=effect.hearts[index];
        const phase=age*effect.heartSpeed+index/effect.hearts.length;
        const angle=phase*Math.PI*2;
        if(effect.heartMotion==="orbit")
          heart.setLocalPosition(Math.cos(angle)*(.42+index*.04),.55+Math.sin(angle*2)*.16,Math.sin(angle)*(.42+index*.04));
        else if(effect.heartMotion==="burst") {
          const progress=phase%1;
          heart.setLocalPosition(Math.cos(index*2.399)*progress*.85,.42+progress*.9,Math.sin(index*2.399)*progress*.85);
        } else {
          const progress=phase%1;
          heart.setLocalPosition(Math.sin(index*1.7+phase*2)*.42,.35+progress*1.15,Math.cos(index*1.3)*.18);
        }
        const heartScale=effect.heartSize*(.48+Math.sin(Math.min(1,age)*Math.PI)*.12)*(1+Math.sin(angle*2)*.08);
        heart.setLocalScale(heartScale,heartScale,heartScale);
        heart.lookAt(camera.getPosition());
      }
      const cooperativeFlight=firstAvatar.flying&&secondAvatar.flying;
      effect.flightRing.enabled=cooperativeFlight;
      effect.link.enabled=false;
      if(cooperativeFlight) {
        const flightPulse=1.5+Math.sin(performance.now()*.004)*.16;
        effect.flightRing.setLocalPosition(0,-.5,0);
        effect.flightRing.setLocalScale(flightPulse,1,flightPulse);
        effect.flightRing.rotateLocal(0,dt*42,0);
        // Shared lift and tilt are visual only: authoritative player positions
        // remain unchanged while both users see the same cooperative rhythm.
        const sharedPhase=performance.now()*.004;
        for(const avatar of [firstAvatar,secondAvatar]) {
          const bodyPosition=avatar.body.getLocalPosition();
          avatar.body.setLocalPosition(bodyPosition.x,bodyPosition.y+Math.sin(sharedPhase)*.035,bodyPosition.z);
          const bodyAngles=avatar.body.getLocalEulerAngles();
          avatar.body.setLocalEulerAngles(bodyAngles.x,bodyAngles.y,bodyAngles.z+Math.sin(sharedPhase)*3);
        }
      }
    }
  }
  for(const key of Array.from(resonancePairs.keys()))
    if(!activeResonanceKeys.has(key)) destroyResonancePair(key);

  // Prototype 0.15.3 / TRANSFORM ANIMATION CORE
  updateTransformAnimations(dt);

  if (!activeRoom || !currentSessionId) return;
  const me = avatars.get(currentSessionId);
  if (!me) return;

  // Ground level is the existing sphere's center (0.65 m). Keep the vertical
  // motion bounded before sending it through the authoritative move handler.
  const step=Math.min(dt,.1);
  if(flying) {
    const ascend=(keys.has("space")||mobileAscend)?1:0;
    const descend=(keys.has("shift")||mobileDescend)?1:0;
    localPosition.y=pc.math.clamp(localPosition.y+(ascend-descend)*2.7*step,.65,8.65);
    verticalVelocity=0;
    jumpRequested=false;
  } else {
    if(jumpRequested && localPosition.y<=.651) verticalVelocity=5.4;
    jumpRequested=false;
    if(localPosition.y>.65 || verticalVelocity>0) {
      verticalVelocity=Math.max(-6,verticalVelocity-11*step);
      localPosition.y=Math.max(.65,localPosition.y+verticalVelocity*step);
      if(localPosition.y<=.65) verticalVelocity=0;
    }
  }
  me.entity.setPosition(localPosition);

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
      localPosition.x + moveX * MOVE_SPEED * Math.min(dt,0.1),
      -Math.max(6.5,currentWorldEnvironment.groundSize/2-1),
      Math.max(6.5,currentWorldEnvironment.groundSize/2-1)
    );

    localPosition.z = pc.math.clamp(
      localPosition.z + moveZ * MOVE_SPEED * Math.min(dt,0.1),
      -Math.max(6.5,currentWorldEnvironment.groundSize/2-1),
      Math.max(6.5,currentWorldEnvironment.groundSize/2-1)
    );

    me.entity.setPosition(localPosition);

  }
  const now=performance.now();
  const currentRotation=me.entity.getEulerAngles().y;
  const unsent=!Number.isFinite(lastSentMove.x) ||
    Math.abs(localPosition.x-lastSentMove.x)>0.001 ||
    Math.abs(localPosition.y-lastSentMove.y)>0.001 ||
    Math.abs(localPosition.z-lastSentMove.z)>0.001 ||
    Math.abs(currentRotation-lastSentMove.rotationY)>0.1 ||
    flying!==lastSentMove.flying;
  if ((unsent && (x===0 && z===0 || now-lastSend>=1000/SEND_HZ)) ||
      now-lastSend>=1000) sendLocalMovement(currentRotation);
});
