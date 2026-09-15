import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema({
  name: t.string().default("Guest"),
  x: t.number().default(0),
  y: t.number().default(0.65),
  z: t.number().default(0),
  rotationY: t.number().default(0)
}, "Player");
export type Player = SchemaType<typeof Player>;

// Prototype 0.14.1 / SHARED MEDIA OBJECT
// This first stage shares existence + transform + asset reference.
// Binary Sprite ZIP transfer is intentionally deferred to the next stage.
export const SharedMediaObject = schema({
  title: t.string().default("Shared Artwork"),
  type: t.string().default("sprite"),
  assetRef: t.string().default(""),
  ownerSessionId: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(1.8),
  z: t.number().default(-3),
  rotationY: t.number().default(0),
  scale: t.number().default(1)
}, "SharedMediaObject");
export type SharedMediaObject = SchemaType<typeof SharedMediaObject>;

export const WorldState = schema({
  players: t.map(Player),
  mediaObjects: t.map(SharedMediaObject)
}, "WorldState");
export type WorldState = SchemaType<typeof WorldState>;
