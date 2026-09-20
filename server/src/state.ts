import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema({
  name: t.string().default("Guest"),
  clientId: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(0.65),
  z: t.number().default(0),
  rotationY: t.number().default(0),
  avatarColor: t.string().default("#f0f0f5"),
  avatarAccent: t.string().default("#ff8c28"),
  avatarShape: t.string().default("sphere"),
  avatarAssetRef: t.string().default("")
}, "Player");
export type Player = SchemaType<typeof Player>;

// Prototype 0.14.4 / SHARED MEDIA OBJECT — Sprite + GLB
// assetRef now points to a fetchable HTTP asset on the Render server.
export const SharedMediaObject = schema({
  title: t.string().default("Shared Artwork"),
  type: t.string().default("sprite"),
  assetRef: t.string().default(""),
  fallbackRef: t.string().default(""),
  ownerSessionId: t.string().default(""),
  ownerClientId: t.string().default(""),
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
