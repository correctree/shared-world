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
  avatarAssetRef: t.string().default(""),
  avatarSize: t.number().default(1),
  avatarLabelVisible: t.boolean().default(true),
  avatarLabelColor: t.string().default("#ffffff"),
  avatarTextureRepeat: t.number().default(1),
  avatarTextureRotation: t.number().default(0),
  avatarPart: t.string().default("none"),
  avatarPartColor: t.string().default("#7fd8ff"),
  avatarHaloColor: t.string().default("#ff7828"),
  avatarHaloOpacity: t.number().default(0.55),
  avatarHaloSize: t.number().default(1.5),
  avatarHaloMotion: t.string().default("pulse"),
  avatarHaloSpeed: t.number().default(1),
  avatarHaloShape: t.string().default("ring"),
  avatarHaloGlow: t.number().default(0.6),
  avatarHaloRings: t.number().default(1),
  avatarHeartColor: t.string().default("#ff5f91"),
  avatarHeartSize: t.number().default(1),
  avatarHeartCount: t.number().default(3),
  avatarHeartMotion: t.string().default("float"),
  avatarHeartSpeed: t.number().default(1),
  avatarFlashlightOn: t.boolean().default(false),
  avatarFlying: t.boolean().default(false)
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
