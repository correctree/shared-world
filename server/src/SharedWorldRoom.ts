import { Room, type Client } from "colyseus";
import { Player, WorldState } from "./state.js";

const WORLD_LIMIT = 6.5;
const MAX_STEP = 0.75;

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
      if (!Number.isFinite(nextX) || !Number.isFinite(nextZ)) return;
  
  const nextRotationY = Number(payload?.rotationY);
  if (!Number.isFinite(nextRotationY)) return;

      const clampedX = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextX));
      const clampedZ = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextZ));
      const dx = clampedX - player.x;
      const dz = clampedZ - player.z;
      const distance = Math.hypot(dx, dz);

      // Prototype-level sanity check against large teleports.
      if (distance > MAX_STEP) return;

      player.x = clampedX;
      player.z = clampedZ;
  player.rotationY = nextRotationY;
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
