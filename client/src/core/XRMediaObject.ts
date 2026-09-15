import type * as pc from "playcanvas";

export type XRMediaType = "webm" | "sprite" | "glb" | "audio" | "live-video" | "environment" | "effect" | "camera";

export type XRTransform = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
};

export type XRMediaCapabilities = {
  playable?: boolean;
  animated?: boolean;
  spatial?: boolean;
  live?: boolean;
};
export type XRBehaviorTrigger = "user-proximity";

export type XRBehaviorAction = "play" | "stop";

export interface XRMediaBehavior {
  id: string;
  trigger: XRBehaviorTrigger;
  distance: number;
  enterAction?: XRBehaviorAction;
  leaveAction?: XRBehaviorAction;
  enabled: boolean;
}

export interface XRPlaybackController {
  play(): void | Promise<void>;
  stop(): void;
  setLoop?(loop: boolean): void;
  getClips?(): string[];
  playClip?(name: string): void;
}

export interface XRMediaObject {
  id: string;
  title: string;
  type: XRMediaType;
  entity: pc.Entity | null;
  transform: XRTransform;
  capabilities: XRMediaCapabilities;
  playback?: XRPlaybackController;
  source?: unknown;
  behavior?: XRMediaBehavior[];
}

export function createDefaultTransform(): XRTransform {
  return {
    position: { x: 0, y: 0, z: -3 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1
  };
}
