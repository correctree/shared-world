import { Room, type Client } from "colyseus";
import { Player, SharedMediaObject, WorldState } from "./state.js";

const WORLD_LIMIT = 6.5;
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
  rotationY?: number;
  scale?: number;
};

type UpdateMediaPayload = {
  id?: string; x?: number; y?: number; z?: number; rotationY?: number; scale?: number; assetRef?: string;
};
type DeleteMediaPayload = { id?: string };
type MediaActionPayload = {
  id?: string;
  action?: string;
  source?: string;
  params?: { amount?: number; speed?: number; axis?: string; duration?: number };
};

export class SharedWorldRoom extends Room<WorldState> {
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
      payload: { x?: number; z?: number; rotationY?: number }
    ) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const nextX = Number(payload?.x);
      const nextZ = Number(payload?.z);
      const nextRotationY = Number(payload?.rotationY);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextZ)) return;
      if (!Number.isFinite(nextRotationY)) return;

      const clampedX = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextX));
      const clampedZ = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextZ));
      const dx = clampedX - player.x;
      const dz = clampedZ - player.z;
      const distance = Math.hypot(dx, dz);

      if (distance > MAX_STEP) return;

      player.x = clampedX;
      player.z = clampedZ;
      player.rotationY = nextRotationY;
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
      const rotationY = Number(payload?.rotationY);
      const scale = Number(payload?.scale);

      if (![x, y, z, rotationY, scale].every(Number.isFinite)) {
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
        x: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x)),
        y: Math.max(-10, Math.min(20, y)),
        z: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z)),
        rotationY,
        scale: Math.max(0.05, Math.min(20, scale))
      }));

      console.log("[media:add stored]", id, "total:", this.state.mediaObjects.size);
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
        return;
      }
      const x=Number(payload?.x), y=Number(payload?.y), z=Number(payload?.z);
      const rotationY=Number(payload?.rotationY), scale=Number(payload?.scale);
      if (![x,y,z,rotationY,scale].every(Number.isFinite)) return;
      media.x=Math.max(-WORLD_LIMIT,Math.min(WORLD_LIMIT,x));
      media.y=Math.max(-10,Math.min(20,y));
      media.z=Math.max(-WORLD_LIMIT,Math.min(WORLD_LIMIT,z));
      media.rotationY=rotationY;
      media.scale=Math.max(0.05,Math.min(20,scale));
      // Apply transforms to already-loaded clients without waiting for a state patch.
      this.broadcast("media:transform", {id, x:media.x, y:media.y, z:media.z,
        rotationY:media.rotationY, scale:media.scale});
      if (typeof payload?.assetRef === "string" && media.type === "audio") {
        media.assetRef=String(payload.assetRef).slice(0,240);
        // Prototype 0.16.1.4: state remains authoritative, while this explicit
        // event applies settings immediately on already-running mobile runtimes.
        this.broadcast("media:config", {id, assetRef: media.assetRef});
        console.log("[0.16.1.4 media:config broadcast]", id);
      }
      console.log("[media:update stored]", id);
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

      this.broadcast("media:action", {
        id, action, source, params, actorSessionId: client.sessionId
      });
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
          x: media.x, y: media.y, z: media.z,
          rotationY: media.rotationY, scale: media.scale
        });
      }
      client.send("media:snapshot", { mediaObjects });
      console.log("[0.15.2 snapshot response]", client.sessionId, "count:", mediaObjects.length);
      console.log("[media:snapshot sent]", client.sessionId, mediaObjects.length);
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
        return;
      }
      this.state.mediaObjects.delete(id);
      console.log("[media:delete stored]", id, "total:", this.state.mediaObjects.size);
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

    console.log(`[join] ${safeName} / ${client.sessionId} / client:${clientId || "legacy"}`);
    console.log("[AUTHORITATIVE SNAPSHOT]", {
      players: this.state.players.size,
      mediaObjects: this.state.mediaObjects.size
    });
  }

  onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    const name = player?.name || "Guest";

    // If this session was already replaced, deleting by its old sessionId is harmless.
    this.state.players.delete(client.sessionId);
    console.log("[SESSION CLEANUP]", name, client.sessionId, { consented, players: this.state.players.size });
  }

}
