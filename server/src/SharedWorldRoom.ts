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
  x?: number;
  y?: number;
  z?: number;
  rotationY?: number;
  scale?: number;
};

export class SharedWorldRoom extends Room<WorldState> {
  maxClients = 4;
  state = new WorldState();

  messages = {
    move: (
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
    },

    // Prototype 0.14.1
    "media:add": (client: Client, payload: AddMediaPayload) => {
      if (this.state.mediaObjects.size >= MAX_MEDIA_OBJECTS) return;

      const id = String(payload?.id || "").trim().slice(0, 80);
      if (!id || this.state.mediaObjects.has(id)) return;

      // 0.14.1 deliberately starts with Sprite metadata only.
      if (String(payload?.type || "") !== "sprite") return;

      const x = Number(payload?.x);
      const y = Number(payload?.y);
      const z = Number(payload?.z);
      const rotationY = Number(payload?.rotationY);
      const scale = Number(payload?.scale);

      if (![x, y, z, rotationY, scale].every(Number.isFinite)) return;

      this.state.mediaObjects.set(id, new SharedMediaObject({
        title: String(payload?.title || "Sprite Artwork").slice(0, 80),
        type: "sprite",
        assetRef: String(payload?.assetRef || "").slice(0, 240),
        ownerSessionId: client.sessionId,
        x: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x)),
        y: Math.max(-10, Math.min(20, y)),
        z: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z)),
        rotationY,
        scale: Math.max(0.05, Math.min(20, scale))
      }));

      console.log(`[media:add] ${id} / ${client.sessionId}`);
    }
  };

  onCreate(options: { roomCode?: string }) {
    this.setMetadata({ roomCode: String(options.roomCode || "ART001").toUpperCase() });
  }

  onJoin(client: Client, options: { name?: string }) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.8 + Math.random() * 1.5;
    const safeName = String(options.name || "Guest").trim().slice(0, 16) || "Guest";

    this.state.players.set(client.sessionId, new Player({
      name: safeName,
      x: Math.cos(angle) * radius,
      y: 0.65,
      z: Math.sin(angle) * radius
    }));

    console.log(`[join] ${safeName} / ${client.sessionId}`);
  }

  onLeave(client: Client) {
    const name = this.state.players.get(client.sessionId)?.name || client.sessionId;
    this.state.players.delete(client.sessionId);
    console.log(`[leave] ${name}`);
  }
}
