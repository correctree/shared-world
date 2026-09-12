import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema({
  name: t.string().default("Guest"),
  x: t.number().default(0),
  y: t.number().default(0.65),
  z: t.number().default(0),
  rotationY: t.number().default(0)
}, "Player");
export type Player = SchemaType<typeof Player>;

export const WorldState = schema({
  players: t.map(Player)
}, "WorldState");
export type WorldState = SchemaType<typeof WorldState>;
